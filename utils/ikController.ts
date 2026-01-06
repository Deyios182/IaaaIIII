/**
 * IK Controller - Sistema de Inverse Kinematics
 * Controla head tracking, eye tracking y gestos naturales
 */

import * as THREE from 'three';

export interface IKTarget {
    position: THREE.Vector3;
    enabled: boolean;
}

export interface IKSettings {
    headLookSpeed: number; // 0-1
    eyeLookSpeed: number; // 0-1
    maxHeadRotation: number; // Radianes
    maxEyeRotation: number; // Radianes
    smoothing: number; // 0-1
}

const DEFAULT_IK_SETTINGS: IKSettings = {
    headLookSpeed: 0.1,
    eyeLookSpeed: 0.15,
    maxHeadRotation: Math.PI / 3, // 60 grados
    maxEyeRotation: Math.PI / 4, // 45 grados
    smoothing: 0.1
};

/**
 * IKController - Controla movimientos IK del avatar
 */
export class IKController {
    private settings: IKSettings;

    // Referencias a huesos
    private headBone: THREE.Bone | null = null;
    private neckBone: THREE.Bone | null = null;
    private leftEye: THREE.Bone | null = null;
    private rightEye: THREE.Bone | null = null;

    // Rotaciones originales
    private headOriginalRotation: THREE.Euler = new THREE.Euler();
    private neckOriginalRotation: THREE.Euler = new THREE.Euler();
    private leftEyeOriginalRotation: THREE.Euler = new THREE.Euler();
    private rightEyeOriginalRotation: THREE.Euler = new THREE.Euler();

    // Targets
    private lookTarget: IKTarget = {
        position: new THREE.Vector3(0, 0, 0),
        enabled: false
    };

    // Helpers
    private currentHeadRotation: THREE.Euler = new THREE.Euler();
    private currentEyeRotation: THREE.Euler = new THREE.Euler();

    constructor(settings?: Partial<IKSettings>) {
        this.settings = { ...DEFAULT_IK_SETTINGS, ...settings };
    }

    /**
     * Inicializar con un modelo 3D
     */
    initialize(model: THREE.Object3D): void {
        model.traverse((child) => {
            if (!(child as any).isBone) return;

            const bone = child as THREE.Bone;
            const name = bone.name.toLowerCase();

            // Buscar huesos de cabeza y cuello
            if (name.includes('head') && !name.includes('headtop')) {
                this.headBone = bone;
                this.headOriginalRotation.copy(bone.rotation);
                console.log('👤 IK: Head bone encontrado:', bone.name);
            }

            if (name.includes('neck')) {
                this.neckBone = bone;
                this.neckOriginalRotation.copy(bone.rotation);
                console.log('👤 IK: Neck bone encontrado:', bone.name);
            }

            // Buscar huesos de ojos
            if (name.includes('eye')) {
                const isLeft = name.includes('left') || name.includes('_l') || name.endsWith('.l');
                const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r');

                if (isLeft && !this.leftEye) {
                    this.leftEye = bone;
                    this.leftEyeOriginalRotation.copy(bone.rotation);
                    console.log('👁️ IK: Left eye bone encontrado:', bone.name);
                }

                if (isRight && !this.rightEye) {
                    this.rightEye = bone;
                    this.rightEyeOriginalRotation.copy(bone.rotation);
                    console.log('👁️ IK: Right eye bone encontrado:', bone.name);
                }
            }
        });

        const foundBones = [this.headBone, this.neckBone, this.leftEye, this.rightEye].filter(Boolean).length;
        console.log(`✅ IK Controller: ${foundBones}/4 huesos encontrados`);
    }

    /**
     * Establecer target de mirada (world space)
     */
    setLookTarget(position: THREE.Vector3, enabled: boolean = true): void {
        this.lookTarget.position.copy(position);
        this.lookTarget.enabled = enabled;
    }

    /**
     * Establecer target desde coordenadas de pantalla (normalized -1 a 1)
     */
    setLookTargetFromScreen(x: number, y: number, distance: number = 3): void {
        this.lookTarget.position.set(x * distance, y * distance, distance);
        this.lookTarget.enabled = true;
    }

    /**
     * Deshabilitar look-at
     */
    disableLookAt(): void {
        this.lookTarget.enabled = false;
    }

    /**
     * Actualizar IK (llamar en useFrame)
     */
    update(delta: number): void {
        if (!this.lookTarget.enabled) {
            // Volver suavemente a pose original
            this.returnToOriginalPose(delta);
            return;
        }

        this.updateHeadLookAt(delta);
        this.updateEyeLookAt(delta);
    }

    /**
     * Actualizar rotación de cabeza hacia target
     */
    private updateHeadLookAt(delta: number): void {
        if (!this.headBone) return;

        // Calcular dirección al target
        const headWorldPos = new THREE.Vector3();
        this.headBone.getWorldPosition(headWorldPos);

        const direction = new THREE.Vector3()
            .subVectors(this.lookTarget.position, headWorldPos)
            .normalize();

        // Convertir a rotación local
        const targetRotation = new THREE.Euler();
        targetRotation.y = Math.atan2(direction.x, direction.z);
        targetRotation.x = -Math.asin(direction.y);

        // Limitar rotación
        targetRotation.x = THREE.MathUtils.clamp(
            targetRotation.x,
            this.headOriginalRotation.x - this.settings.maxHeadRotation,
            this.headOriginalRotation.x + this.settings.maxHeadRotation
        );
        targetRotation.y = THREE.MathUtils.clamp(
            targetRotation.y,
            this.headOriginalRotation.y - this.settings.maxHeadRotation,
            this.headOriginalRotation.y + this.settings.maxHeadRotation
        );

        // Interpolar suavemente
        this.currentHeadRotation.x = THREE.MathUtils.lerp(
            this.currentHeadRotation.x,
            targetRotation.x,
            this.settings.headLookSpeed
        );
        this.currentHeadRotation.y = THREE.MathUtils.lerp(
            this.currentHeadRotation.y,
            targetRotation.y,
            this.settings.headLookSpeed
        );

        // Aplicar rotación
        this.headBone.rotation.x = this.currentHeadRotation.x;
        this.headBone.rotation.y = this.currentHeadRotation.y;

        // Aplicar también al cuello (50% menos intenso)
        if (this.neckBone) {
            this.neckBone.rotation.y = this.currentHeadRotation.y * 0.5;
            this.neckBone.rotation.x = this.currentHeadRotation.x * 0.3;
        }
    }

    /**
     * Actualizar rotación de ojos hacia target
     */
    private updateEyeLookAt(delta: number): void {
        if (!this.leftEye && !this.rightEye) return;

        // Calcular dirección promedio de los ojos
        const eyeWorldPos = new THREE.Vector3();
        if (this.leftEye) {
            this.leftEye.getWorldPosition(eyeWorldPos);
        } else if (this.rightEye) {
            this.rightEye.getWorldPosition(eyeWorldPos);
        }

        const direction = new THREE.Vector3()
            .subVectors(this.lookTarget.position, eyeWorldPos)
            .normalize();

        // Calcular rotación target
        const targetRotation = new THREE.Euler();
        targetRotation.y = Math.atan2(direction.x, direction.z);
        targetRotation.x = -Math.asin(direction.y);

        // Limitar rotación de ojos
        targetRotation.x = THREE.MathUtils.clamp(
            targetRotation.x,
            -this.settings.maxEyeRotation,
            this.settings.maxEyeRotation
        );
        targetRotation.y = THREE.MathUtils.clamp(
            targetRotation.y,
            -this.settings.maxEyeRotation,
            this.settings.maxEyeRotation
        );

        // Interpolar
        this.currentEyeRotation.x = THREE.MathUtils.lerp(
            this.currentEyeRotation.x,
            targetRotation.x,
            this.settings.eyeLookSpeed
        );
        this.currentEyeRotation.y = THREE.MathUtils.lerp(
            this.currentEyeRotation.y,
            targetRotation.y,
            this.settings.eyeLookSpeed
        );

        // Aplicar a ambos ojos
        if (this.leftEye) {
            this.leftEye.rotation.x = this.leftEyeOriginalRotation.x + this.currentEyeRotation.x;
            this.leftEye.rotation.y = this.leftEyeOriginalRotation.y + this.currentEyeRotation.y;
        }
        if (this.rightEye) {
            this.rightEye.rotation.x = this.rightEyeOriginalRotation.x + this.currentEyeRotation.x;
            this.rightEye.rotation.y = this.rightEyeOriginalRotation.y + this.currentEyeRotation.y;
        }
    }

    /**
     * Volver a pose original suavemente
     */
    private returnToOriginalPose(delta: number): void {
        const returnSpeed = 0.05;

        // Cabeza
        if (this.headBone) {
            this.currentHeadRotation.x = THREE.MathUtils.lerp(
                this.currentHeadRotation.x,
                this.headOriginalRotation.x,
                returnSpeed
            );
            this.currentHeadRotation.y = THREE.MathUtils.lerp(
                this.currentHeadRotation.y,
                this.headOriginalRotation.y,
                returnSpeed
            );

            this.headBone.rotation.x = this.currentHeadRotation.x;
            this.headBone.rotation.y = this.currentHeadRotation.y;
        }

        // Cuello
        if (this.neckBone) {
            this.neckBone.rotation.x = THREE.MathUtils.lerp(
                this.neckBone.rotation.x,
                this.neckOriginalRotation.x,
                returnSpeed
            );
            this.neckBone.rotation.y = THREE.MathUtils.lerp(
                this.neckBone.rotation.y,
                this.neckOriginalRotation.y,
                returnSpeed
            );
        }

        // Ojos
        this.currentEyeRotation.x = THREE.MathUtils.lerp(this.currentEyeRotation.x, 0, returnSpeed);
        this.currentEyeRotation.y = THREE.MathUtils.lerp(this.currentEyeRotation.y, 0, returnSpeed);

        if (this.leftEye) {
            this.leftEye.rotation.copy(this.leftEyeOriginalRotation);
        }
        if (this.rightEye) {
            this.rightEye.rotation.copy(this.rightEyeOriginalRotation);
        }
    }

    /**
     * Actualizar configuración
     */
    updateSettings(settings: Partial<IKSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }

    /**
     * Obtener si hay huesos detectados
     */
    isInitialized(): boolean {
        return !!(this.headBone || this.leftEye || this.rightEye);
    }
}
