/**
 * IK Controller - Sistema de Inverse Kinematics (OPTIMIZADO CON QUATERNIONS)
 * Controla head tracking, eye tracking y gestos naturales de forma fluida
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
    headLookSpeed: 0.08, // Ligeramente más lento para mayor fluidez humana
    eyeLookSpeed: 0.15,
    maxHeadRotation: Math.PI / 3, // 60 grados
    maxEyeRotation: Math.PI / 4, // 45 grados
    smoothing: 0.1
};

/**
 * IKController - Controla movimientos IK del avatar con Quaternions (sin Gimbal Lock)
 */
export class IKController {
    private settings: IKSettings;

    // Referencias a huesos
    private headBone: THREE.Bone | null = null;
    private neckBone: THREE.Bone | null = null;
    private leftEye: THREE.Bone | null = null;
    private rightEye: THREE.Bone | null = null;

    // Rotaciones originales (Quaternions para evitar Gimbal Lock)
    private headOriginalQuat: THREE.Quaternion = new THREE.Quaternion();
    private neckOriginalQuat: THREE.Quaternion = new THREE.Quaternion();
    private leftEyeOriginalQuat: THREE.Quaternion = new THREE.Quaternion();
    private rightEyeOriginalQuat: THREE.Quaternion = new THREE.Quaternion();

    // Targets
    private lookTarget: IKTarget = {
        position: new THREE.Vector3(0, 0, 0),
        enabled: false
    };

    // Micro-offset for saccades
    private microOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

    constructor(settings?: Partial<IKSettings>) {
        this.settings = { ...DEFAULT_IK_SETTINGS, ...settings };
    }

    private thinkingActive: boolean = false;
    private thinkingTime: number = 0;

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
                this.headOriginalQuat.copy(bone.quaternion);
                console.log('👤 IK: Head bone encontrado:', bone.name);
            }

            if (name.includes('neck')) {
                this.neckBone = bone;
                this.neckOriginalQuat.copy(bone.quaternion);
                console.log('👤 IK: Neck bone encontrado:', bone.name);
            }

            // Buscar huesos de ojos
            if (name.includes('eye')) {
                const isLeft = name.includes('left') || name.includes('_l') || name.endsWith('.l');
                const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r');

                if (isLeft && !this.leftEye) {
                    this.leftEye = bone;
                    this.leftEyeOriginalQuat.copy(bone.quaternion);
                    console.log('👁️ IK: Left eye bone encontrado:', bone.name);
                }
                if (isRight && !this.rightEye) {
                    this.rightEye = bone;
                    this.rightEyeOriginalQuat.copy(bone.quaternion);
                    console.log('👁️ IK: Right eye bone encontrado:', bone.name);
                }
            }
        });

        // Configurar listener para evento de pensamiento procedural de Nova
        if (typeof window !== 'undefined') {
            window.addEventListener('nova-thinking-procedural', (e: any) => {
                this.thinkingActive = !!e.detail?.active;
                if (!this.thinkingActive) {
                    this.thinkingTime = 0;
                }
            });
        }

        const foundBones = [this.headBone, this.neckBone, this.leftEye, this.rightEye].filter(Boolean).length;
        console.log(`✅ IK Controller (Quaternion): ${foundBones}/4 huesos encontrados`);
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
     * Establecer micro-offset para saccades (movimientos rápidos de ojos)
     */
    setMicroOffset(offset: THREE.Vector3): void {
        this.microOffset.copy(offset);
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
        // Simular oscilación procedural de pensamiento si está activo
        if (this.thinkingActive) {
            this.thinkingTime += delta * 1.5; // Velocidad del ciclo de oscilación
            
            // Generar oscilación suave e inclinación (inclinación lateral y cabeceo reflexivo ligero)
            const oscY = Math.sin(this.thinkingTime) * 0.05; // Rotación lateral leve
            const oscX = Math.cos(this.thinkingTime * 0.5) * 0.03 + 0.04; // Cabeceo leve hacia abajo (mirada baja de reflexión)
            const oscZ = Math.sin(this.thinkingTime * 0.5) * 0.03; // Inclinación lateral leve
            
            if (this.headBone) {
                const targetRotation = new THREE.Euler(oscX, oscY, oscZ);
                const thinkingQuat = this.headOriginalQuat.clone().multiply(new THREE.Quaternion().setFromEuler(targetRotation));
                this.headBone.quaternion.slerp(thinkingQuat, 0.08);
            }
            if (this.neckBone) {
                const targetRotation = new THREE.Euler(oscX * 0.5, oscY * 0.5, oscZ * 0.5);
                const thinkingNeckQuat = this.neckOriginalQuat.clone().multiply(new THREE.Quaternion().setFromEuler(targetRotation));
                this.neckBone.quaternion.slerp(thinkingNeckQuat, 0.08);
            }

            // Ojos miran ligeramente hacia el suelo o a un offset
            if (this.leftEye) {
                const leftQuat = this.leftEyeOriginalQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, -0.05, 0)));
                this.leftEye.quaternion.slerp(leftQuat, 0.1);
            }
            if (this.rightEye) {
                const rightQuat = this.rightEyeOriginalQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0.05, 0)));
                this.rightEye.quaternion.slerp(rightQuat, 0.1);
            }

            // Desactivación automática del trigger de oscilación si pasa el tiempo (limpieza de seguridad)
            if (this.thinkingTime > 5.0) {
                this.thinkingActive = false;
                this.thinkingTime = 0;
            }
            return;
        }

        if (!this.lookTarget.enabled) {
            this.returnToOriginalPose(delta);
            return;
        }

        this.updateHeadLookAt(delta);
        this.updateEyeLookAt(delta);
    }

    /**
     * Actualizar rotación de cabeza hacia target usando Quaternions + Slerp
     */
    private updateHeadLookAt(_delta: number): void {
        if (!this.headBone) return;

        const headWorldPos = new THREE.Vector3();
        this.headBone.getWorldPosition(headWorldPos);

        // Target real + micro offset
        const finalTarget = this.lookTarget.position.clone().add(this.microOffset);
        const direction = new THREE.Vector3().subVectors(finalTarget, headWorldPos).normalize();

        // Calculamos Euler para limitar ángulos, pero convertimos a Quaternion para aplicar
        const targetRotation = new THREE.Euler();
        targetRotation.y = Math.atan2(direction.x, direction.z);
        targetRotation.x = -Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));

        // Calcular límites respecto a la pose original
        const originalEuler = new THREE.Euler().setFromQuaternion(this.headOriginalQuat);
        targetRotation.x = THREE.MathUtils.clamp(
            targetRotation.x,
            originalEuler.x - this.settings.maxHeadRotation,
            originalEuler.x + this.settings.maxHeadRotation
        );
        targetRotation.y = THREE.MathUtils.clamp(
            targetRotation.y,
            originalEuler.y - this.settings.maxHeadRotation,
            originalEuler.y + this.settings.maxHeadRotation
        );

        // SLERP: Interpolación esférica fluida sin Gimbal Lock
        const targetQuat = new THREE.Quaternion().setFromEuler(targetRotation);
        this.headBone.quaternion.slerp(targetQuat, this.settings.headLookSpeed);

        // El cuello hace un 30% del movimiento (interpolación hacia identidad a 70%)
        if (this.neckBone) {
            const neckTargetQuat = this.neckOriginalQuat.clone().slerp(targetQuat, 0.3);
            this.neckBone.quaternion.slerp(neckTargetQuat, this.settings.headLookSpeed);
        }
    }

    /**
     * Actualizar rotación de ojos hacia target usando Quaternions + Slerp
     */
    private updateEyeLookAt(_delta: number): void {
        if (!this.leftEye && !this.rightEye) return;

        const eyeWorldPos = new THREE.Vector3();
        if (this.leftEye) this.leftEye.getWorldPosition(eyeWorldPos);
        else if (this.rightEye) this.rightEye.getWorldPosition(eyeWorldPos);

        // Target con micro-offset amplificado para los ojos
        const eyeOffset = this.microOffset.clone().multiplyScalar(1.5);
        const finalTarget = this.lookTarget.position.clone().add(eyeOffset);
        const direction = new THREE.Vector3().subVectors(finalTarget, eyeWorldPos).normalize();

        const targetRotation = new THREE.Euler();
        targetRotation.y = Math.atan2(direction.x, direction.z);
        targetRotation.x = -Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));

        targetRotation.x = THREE.MathUtils.clamp(targetRotation.x, -this.settings.maxEyeRotation, this.settings.maxEyeRotation);
        targetRotation.y = THREE.MathUtils.clamp(targetRotation.y, -this.settings.maxEyeRotation, this.settings.maxEyeRotation);

        const targetQuat = new THREE.Quaternion().setFromEuler(targetRotation);

        if (this.leftEye) {
            // Combinar rotación base del ojo con la nueva rotación usando Slerp
            const finalLeftQuat = this.leftEyeOriginalQuat.clone().multiply(targetQuat);
            this.leftEye.quaternion.slerp(finalLeftQuat, this.settings.eyeLookSpeed);
        }
        if (this.rightEye) {
            const finalRightQuat = this.rightEyeOriginalQuat.clone().multiply(targetQuat);
            this.rightEye.quaternion.slerp(finalRightQuat, this.settings.eyeLookSpeed);
        }
    }

    /**
     * Volver a pose original suavemente usando Slerp
     */
    private returnToOriginalPose(_delta: number): void {
        const returnSpeed = 0.05;

        // Slerp de vuelta a la pose original (mucho más natural que Lerp lineal)
        if (this.headBone) this.headBone.quaternion.slerp(this.headOriginalQuat, returnSpeed);
        if (this.neckBone) this.neckBone.quaternion.slerp(this.neckOriginalQuat, returnSpeed);
        if (this.leftEye) this.leftEye.quaternion.slerp(this.leftEyeOriginalQuat, returnSpeed);
        if (this.rightEye) this.rightEye.quaternion.slerp(this.rightEyeOriginalQuat, returnSpeed);
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
