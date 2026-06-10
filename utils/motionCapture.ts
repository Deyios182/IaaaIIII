/**
 * Motion Capture System using MediaPipe Holistic (WebAssembly / CDN)
 * Captura la webcam, procesa pose y manos, y calcula ángulos para los huesos de Aiko.
 * Incluye cálculo real de flexión de codo y rastreo dinámico de dedos.
 */

import * as THREE from 'three';

export interface JointRotations {
    leftArm?: THREE.Euler;
    rightArm?: THREE.Euler;
    leftForeArm?: THREE.Euler;
    rightForeArm?: THREE.Euler;
    head?: THREE.Euler;
    torso?: THREE.Euler;
    hips?: THREE.Euler;
    leftLeg?: THREE.Euler;
    rightLeg?: THREE.Euler;
    // Bending de dedos (0 = recto, 1 = completamente cerrado)
    leftFingers?: Record<string, number>;
    rightFingers?: Record<string, number>;
}

export class MotionCaptureSystem {
    private videoElement: HTMLVideoElement | null = null;
    private holistic: any = null;
    private camera: any = null;
    private active: boolean = false;
    private onFrameCallback: ((rotations: JointRotations) => void) | null = null;

    constructor() {}

    /**
     * Carga dinámicamente los scripts de MediaPipe desde CDN
     */
    async loadMediaPipe(): Promise<void> {
        if ((window as any).Holistic) return;

        console.log('📦 Cargando MediaPipe Holistic desde CDN...');

        const loadScript = (src: string): Promise<void> => {
            return new Promise((resolve, reject) => {
                const script = document.createElement('script');
                script.src = src;
                script.crossOrigin = 'anonymous';
                script.onload = () => resolve();
                script.onerror = () => reject(new Error(`Error cargando script: ${src}`));
                document.head.appendChild(script);
            });
        };

        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');
        
        console.log('✅ Scripts de MediaPipe Holistic cargados con éxito');
    }

    /**
     * Inicializa Holistic y comienza el stream de la webcam
     */
    async start(video: HTMLVideoElement, onFrame: (rotations: JointRotations) => void): Promise<void> {
        this.videoElement = video;
        this.onFrameCallback = onFrame;
        this.active = true;

        await this.loadMediaPipe();

        const Holistic = (window as any).Holistic;
        const Camera = (window as any).Camera;

        if (!Holistic || !Camera) {
            throw new Error('MediaPipe no pudo inicializarse correctamente en window');
        }

        this.holistic = new Holistic({
            locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`
        });

        this.holistic.setOptions({
            modelComplexity: 1,
            smoothLandmarks: true,
            enableSegmentation: false,
            smoothSegmentation: false,
            refineFaceLandmarks: false,
            minDetectionConfidence: 0.5,
            minTrackingConfidence: 0.5
        });

        this.holistic.onResults((results: any) => {
            if (!this.active) return;
            const rotations = this.calculateAngles(results);
            if (this.onFrameCallback) {
                this.onFrameCallback(rotations);
            }
        });

        this.camera = new Camera(this.videoElement, {
            onFrame: async () => {
                if (this.active && this.videoElement) {
                    await this.holistic.send({ image: this.videoElement });
                }
            },
            width: 640,
            height: 480
        });

        await this.camera.start();
        console.log('🎥 Webcam y tracking MediaPipe iniciados');
    }

    stop(): void {
        this.active = false;
        if (this.camera) {
            this.camera.stop();
            this.camera = null;
        }
        if (this.holistic) {
            this.holistic.close();
            this.holistic = null;
        }
        console.log('🛑 Webcam y tracking MediaPipe detenidos');
    }

    /**
     * Calcula los ángulos Euler para cada articulación a partir de los Landmarks de MediaPipe
     */
    private calculateAngles(results: any): JointRotations {
        const rotations: JointRotations = {};

        const pose = results.poseLandmarks;
        const leftHand = results.leftHandLandmarks;
        const rightHand = results.rightHandLandmarks;

        if (!pose) return rotations;

        const deg = THREE.MathUtils.degToRad;

        // 1. BRAZO DERECHO (Hombro 12 -> Codo 14 -> Muñeca 16)
        const shoulderR = pose[12];
        const elbowR = pose[14];
        const wristR = pose[16];

        if (shoulderR && elbowR) {
            const vArmR = new THREE.Vector3(
                elbowR.x - shoulderR.x,
                -(elbowR.y - shoulderR.y),
                -(elbowR.z - shoulderR.z)
            ).normalize();

            // Rotación tridimensional del hombro derecho
            const pitch = Math.atan2(vArmR.y, Math.abs(vArmR.x)) - Math.PI / 2;
            const roll = Math.atan2(vArmR.z, vArmR.x);

            rotations.rightArm = new THREE.Euler(
                THREE.MathUtils.clamp(pitch, deg(-110), deg(90)),
                0,
                THREE.MathUtils.clamp(roll, deg(-30), deg(90))
            );

            // FLEXIÓN REAL DEL CODO DERECHO
            if (wristR) {
                const vUpperArm = new THREE.Vector3(
                    elbowR.x - shoulderR.x,
                    -(elbowR.y - shoulderR.y),
                    -(elbowR.z - shoulderR.z)
                ).normalize();

                const vForeArm = new THREE.Vector3(
                    wristR.x - elbowR.x,
                    -(wristR.y - elbowR.y),
                    -(wristR.z - elbowR.z)
                ).normalize();

                // Ángulo entre brazo y antebrazo (0 = extendido, Math.PI = totalmente doblado)
                const cosAngle = THREE.MathUtils.clamp(vUpperArm.dot(vForeArm), -1, 1);
                const elbowAngle = Math.acos(cosAngle);

                // Aplicar flexión al codo derecho
                rotations.rightForeArm = new THREE.Euler(0, 0, THREE.MathUtils.clamp(elbowAngle, 0, deg(130)));
            }
        }

        // 2. BRAZO IZQUIERDO (Hombro 11 -> Codo 13 -> Muñeca 15)
        const shoulderL = pose[11];
        const elbowL = pose[13];
        const wristL = pose[15];

        if (shoulderL && elbowL) {
            const vArmL = new THREE.Vector3(
                elbowL.x - shoulderL.x,
                -(elbowL.y - shoulderL.y),
                -(elbowL.z - shoulderL.z)
            ).normalize();

            const pitch = Math.atan2(vArmL.y, Math.abs(vArmL.x)) - Math.PI / 2;
            const roll = Math.atan2(vArmL.z, -vArmL.x);

            rotations.leftArm = new THREE.Euler(
                THREE.MathUtils.clamp(pitch, deg(-110), deg(90)),
                0,
                THREE.MathUtils.clamp(-roll, deg(-90), deg(30))
            );

            // FLEXIÓN REAL DEL CODO IZQUIERDO
            if (wristL) {
                const vUpperArm = new THREE.Vector3(
                    elbowL.x - shoulderL.x,
                    -(elbowL.y - shoulderL.y),
                    -(elbowL.z - shoulderL.z)
                ).normalize();

                const vForeArm = new THREE.Vector3(
                    wristL.x - elbowL.x,
                    -(wristL.y - elbowL.y),
                    -(wristL.z - elbowL.z)
                ).normalize();

                const cosAngle = THREE.MathUtils.clamp(vUpperArm.dot(vForeArm), -1, 1);
                const elbowAngle = Math.acos(cosAngle);

                // Invertir eje Z para codo izquierdo
                rotations.leftForeArm = new THREE.Euler(0, 0, -THREE.MathUtils.clamp(elbowAngle, 0, deg(130)));
            }
        }

        // 3. CABEZA
        const nose = pose[0];
        const earL = pose[7];
        const earR = pose[8];

        if (nose && earL && earR) {
            const dY = earL.y - earR.y;
            const dX = earL.x - earR.x;
            const tilt = Math.atan2(dY, dX);

            const distL = Math.abs(nose.x - earL.x);
            const distR = Math.abs(nose.x - earR.x);
            const twist = (distL - distR) / (distL + distR) * 0.5;

            rotations.head = new THREE.Euler(0, -twist, -tilt);
        }

        // 4. TORSO Y CADERA
        const hipL = pose[23];
        const hipR = pose[24];

        if (hipL && hipR && shoulderL && shoulderR) {
            const dShouldersY = shoulderL.y - shoulderR.y;
            const dShouldersX = shoulderL.x - shoulderR.x;
            const rollTorso = Math.atan2(dShouldersY, dShouldersX);
            rotations.torso = new THREE.Euler(0, rollTorso * 0.5, 0);

            const dHipsX = hipL.x - hipR.x;
            const dHipsY = hipL.y - hipR.y;
            const sway = Math.atan2(dHipsY, dHipsX);
            rotations.hips = new THREE.Euler(0, 0, sway * 0.4);
        }

        // 5. PIERNAS
        const kneeL = pose[25];
        const kneeR = pose[26];

        if (hipR && kneeR) {
            const vLegR = new THREE.Vector3(
                kneeR.x - hipR.x,
                -(kneeR.y - hipR.y),
                -(kneeR.z - hipR.z)
            ).normalize();
            // Calcular elevación frontal (eje X) a partir del ángulo vertical de la pierna
            const angle = Math.atan2(vLegR.x, -vLegR.y);
            rotations.rightLeg = new THREE.Euler(THREE.MathUtils.clamp(angle, deg(-15), deg(30)), 0, 0);
        }

        if (hipL && kneeL) {
            const vLegL = new THREE.Vector3(
                kneeL.x - hipL.x,
                -(kneeL.y - hipL.y),
                -(kneeL.z - hipL.z)
            ).normalize();
            const angle = Math.atan2(vLegL.x, -vLegL.y);
            rotations.leftLeg = new THREE.Euler(THREE.MathUtils.clamp(angle, deg(-15), deg(30)), 0, 0);
        }

        // 6. RASTREO DE DEDOS (FINGERS RETARGETING)
        const getFingerBending = (handPoints: any[], indices: number[]): number => {
            if (!handPoints || handPoints.length < 21) return 0;
            // Medir la distancia mcp -> pip y pip -> tip
            const mcp = handPoints[indices[0]];
            const pip = handPoints[indices[1]];
            const tip = handPoints[indices[2]];

            if (!mcp || !pip || !tip) return 0;

            const v1 = new THREE.Vector3(pip.x - mcp.x, pip.y - mcp.y, pip.z - mcp.z).normalize();
            const v2 = new THREE.Vector3(tip.x - pip.x, tip.y - pip.y, tip.z - pip.z).normalize();
            const cosAngle = THREE.MathUtils.clamp(v1.dot(v2), -1, 1);
            const angle = Math.acos(cosAngle);

            // Normalizar a rango 0 - 1 (0 es recto, 1 es doblado 90 grados o más)
            return THREE.MathUtils.clamp(angle / (Math.PI / 2), 0, 1);
        };

        if (rightHand) {
            rotations.rightFingers = {
                thumb:  getFingerBending(rightHand, [1, 2, 4]),
                index:  getFingerBending(rightHand, [5, 6, 8]),
                middle: getFingerBending(rightHand, [9, 10, 12]),
                ring:   getFingerBending(rightHand, [13, 14, 16]),
                pinky:  getFingerBending(rightHand, [17, 18, 20])
            };
        }

        if (leftHand) {
            rotations.leftFingers = {
                thumb:  getFingerBending(leftHand, [1, 2, 4]),
                index:  getFingerBending(leftHand, [5, 6, 8]),
                middle: getFingerBending(leftHand, [9, 10, 12]),
                ring:   getFingerBending(leftHand, [13, 14, 16]),
                pinky:  getFingerBending(leftHand, [17, 18, 20])
            };
        }

        return rotations;
    }
}
