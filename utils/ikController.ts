/**
 * IK Controller - Sistema de Inverse Kinematics (OPTIMIZADO CON QUATERNIONS)
 * Controla head tracking, eye tracking y gestos naturales de forma fluida.
 *
 * [v3] Sistema Nervioso de Cuerpo Completo (Fase 1):
 *   - initializeFullBody(): Registra todos los huesos del cuerpo (brazos, codos, cabeza, torso, cadera, piernas)
 *   - setLimbTarget(): Mueve cualquier articulación a presets semánticos
 *   - update(): Interpola suavemente todas las articulaciones con lerp humanizado
 *   - Escucha eventos globales 'aiko-movement' y 'aiko-action'
 */

import * as THREE from 'three';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS PÚBLICOS
// ─────────────────────────────────────────────────────────────────────────────

export interface IKTarget {
    position: THREE.Vector3;
    enabled: boolean;
}

export interface IKSettings {
    headLookSpeed: number;   // 0-1
    eyeLookSpeed: number;    // 0-1
    maxHeadRotation: number; // Radianes
    maxEyeRotation: number;  // Radianes
    smoothing: number;       // 0-1
}

/** Limbs / articulaciones controlables */
export type LimbType = 
    | 'LEFT_ARM' | 'RIGHT_ARM' | 'BOTH_ARMS'
    | 'LEFT_FOREARM' | 'RIGHT_FOREARM' | 'BOTH_FOREARMS'
    | 'HEAD' | 'TORSO' | 'HIPS'
    | 'LEFT_LEG' | 'RIGHT_LEG' | 'BOTH_LEGS';

/** Presets semánticos de pose para cualquier limb */
export type LimbTarget = 
    | 'REST' | 'WAVE' | 'CHEST' | 'FACE' | 'CELEBRATE' // Brazos
    | 'BEND' | 'EXTEND' // Antebrazos
    | 'TILT_LEFT' | 'TILT_RIGHT' | 'UP' | 'DOWN' | 'NEUTRAL' // Cabeza
    | 'LEAN_FORWARD' | 'LEAN_BACK' | 'TWIST_LEFT' | 'TWIST_RIGHT' // Torso
    | 'SWAY_LEFT' | 'SWAY_RIGHT' // Caderas
    | 'FORWARD' | 'SIDE' | 'STAND' | 'WIDE'; // Piernas

export interface LimbIKState {
    bone: THREE.Bone | null;
    originalRot: THREE.Euler;
    targetRot: THREE.Euler;
    currentRot: THREE.Euler;
}

// ─────────────────────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────────────────────

const DEFAULT_IK_SETTINGS: IKSettings = {
    headLookSpeed: 0.08,
    eyeLookSpeed: 0.15,
    maxHeadRotation: Math.PI / 3, // 60°
    maxEyeRotation: Math.PI / 4,  // 45°
    smoothing: 0.1
};

const LERP_SPEED_FAST = 0.08;
const LERP_SPEED_NORMAL = 0.04; // ~1.5s a 60fps

// ─────────────────────────────────────────────────────────────────────────────
// DICCIONARIOS DE POSES (en radianes)
// ─────────────────────────────────────────────────────────────────────────────

const deg = THREE.MathUtils.degToRad;

/** Poses de los BRAZOS (Bones upper_arm) */
const ARM_POSES_RIGHT: Record<string, THREE.Euler> = {
    REST:      new THREE.Euler(deg(-80), 0, deg(10)),
    WAVE:      new THREE.Euler(deg(55),  0, deg(45)),
    CHEST:     new THREE.Euler(deg(15),  0, deg(35)),
    FACE:      new THREE.Euler(deg(45),  0, deg(20)),
    CELEBRATE: new THREE.Euler(deg(85),  0, deg(30)),
};

/** Poses de los ANTEBRAZOS (Bones forearm/codo) */
const FOREARM_POSES_RIGHT: Record<string, THREE.Euler> = {
    BEND:   new THREE.Euler(0, 0, deg(90)),
    EXTEND: new THREE.Euler(0, 0, 0),
    REST:   new THREE.Euler(0, 0, 0),
};

/** Poses de la CABEZA (Override sutil sobre el look-at) */
const HEAD_POSES: Record<string, THREE.Euler> = {
    TILT_LEFT:  new THREE.Euler(0, 0, deg(12)),
    TILT_RIGHT: new THREE.Euler(0, 0, deg(-12)),
    UP:         new THREE.Euler(deg(-10), 0, 0),
    DOWN:       new THREE.Euler(deg(12),  0, 0),
    NEUTRAL:    new THREE.Euler(0, 0, 0),
};

/** Poses del TORSO (Spine) */
const TORSO_POSES: Record<string, THREE.Euler> = {
    LEAN_FORWARD: new THREE.Euler(deg(12), 0, 0),
    LEAN_BACK:    new THREE.Euler(deg(-8), 0, 0),
    TWIST_LEFT:   new THREE.Euler(0, deg(15), 0),
    TWIST_RIGHT:  new THREE.Euler(0, deg(-15), 0),
    NEUTRAL:      new THREE.Euler(0, 0, 0),
};

/** Poses de la CADERA (Hips) */
const HIPS_POSES: Record<string, THREE.Euler> = {
    SWAY_LEFT:  new THREE.Euler(0, 0, deg(8)),
    SWAY_RIGHT: new THREE.Euler(0, 0, deg(-8)),
    NEUTRAL:    new THREE.Euler(0, 0, 0),
};

/** Poses de las PIERNAS (Bones thigh/upleg) */
const LEG_POSES_RIGHT: Record<string, THREE.Euler> = {
    FORWARD: new THREE.Euler(deg(15), 0, 0),
    SIDE:    new THREE.Euler(0, 0, deg(12)),
    STAND:   new THREE.Euler(0, 0, 0),
    WIDE:    new THREE.Euler(0, 0, deg(8)),
};

// ─────────────────────────────────────────────────────────────────────────────
// CONSTRUCTORES DE SIMETRÍA PARA EL LADO IZQUIERDO
// ─────────────────────────────────────────────────────────────────────────────

function buildLeftArmPose(rightPose: THREE.Euler): THREE.Euler {
    return new THREE.Euler(rightPose.x, rightPose.y, -rightPose.z);
}

function buildLeftForeArmPose(rightPose: THREE.Euler): THREE.Euler {
    // Invertir el eje Z para el codo izquierdo
    return new THREE.Euler(rightPose.x, rightPose.y, -rightPose.z);
}

function buildLeftLegPose(rightPose: THREE.Euler): THREE.Euler {
    return new THREE.Euler(rightPose.x, rightPose.y, -rightPose.z);
}

// ─────────────────────────────────────────────────────────────────────────────
// CLASE PRINCIPAL
// ─────────────────────────────────────────────────────────────────────────────

export class IKController {
    private settings: IKSettings;

    // ── Head & Eye Bones ──────────────────────────────────────────────────────
    private headBone: THREE.Bone | null = null;
    private neckBone: THREE.Bone | null = null;
    private leftEye: THREE.Bone | null = null;
    private rightEye: THREE.Bone | null = null;

    private headOriginalQuat: THREE.Quaternion  = new THREE.Quaternion();
    private neckOriginalQuat: THREE.Quaternion  = new THREE.Quaternion();
    private leftEyeOriginalQuat: THREE.Quaternion  = new THREE.Quaternion();
    private rightEyeOriginalQuat: THREE.Quaternion = new THREE.Quaternion();

    // ── Look Target ───────────────────────────────────────────────────────────
    private lookTarget: IKTarget = {
        position: new THREE.Vector3(0, 0, 0),
        enabled: false
    };
    private microOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);

    // ── Thinking Mode ─────────────────────────────────────────────────────────
    private thinkingActive: boolean = false;
    private thinkingTime: number = 0;

    // ── Full Body Limb States ─────────────────────────────────────────────────
    private leftArm: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private rightArm: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private leftForeArm: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private rightForeArm: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private headPose: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private torso: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private hips: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private leftLeg: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };
    private rightLeg: LimbIKState = { bone: null, originalRot: new THREE.Euler(), targetRot: new THREE.Euler(), currentRot: new THREE.Euler() };

    private fullBodyReady: boolean = false;
    private fingerBones: Map<string, THREE.Bone> = new Map();
    private isVRMModel: boolean = false;

    private movementListener: ((e: Event) => void) | null = null;
    private actionListener: ((e: Event) => void) | null = null;
    private jointListener: ((e: Event) => void) | null = null;

    constructor(settings?: Partial<IKSettings>) {
        this.settings = { ...DEFAULT_IK_SETTINGS, ...settings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HEAD / EYE INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    initialize(model: THREE.Object3D): void {
        model.traverse((child) => {
            if (!(child as any).isBone) return;

            const bone = child as THREE.Bone;
            const name = bone.name.toLowerCase();

            if (name.includes('f_index') || name.includes('f_middle') || name.includes('f_ring') || name.includes('f_pinky') || name.includes('thumb')) {
                this.fingerBones.set(bone.name, bone);
                this.fingerBones.set(name, bone);
            }

            if (name.includes('head') && !name.includes('headtop')) {
                this.headBone = bone;
                this.headOriginalQuat.copy(bone.quaternion);
                this.headPose.bone = bone;
                this.headPose.originalRot.copy(bone.rotation);
                this.headPose.targetRot.copy(bone.rotation);
                this.headPose.currentRot.copy(bone.rotation);
            }

            if (name.includes('neck')) {
                this.neckBone = bone;
                this.neckOriginalQuat.copy(bone.quaternion);
            }

            if (name.includes('eye')) {
                const isLeft  = name.includes('left')  || name.includes('_l') || name.endsWith('.l');
                const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r');

                if (isLeft && !this.leftEye) {
                    this.leftEye = bone;
                    this.leftEyeOriginalQuat.copy(bone.quaternion);
                }
                if (isRight && !this.rightEye) {
                    this.rightEye = bone;
                    this.rightEyeOriginalQuat.copy(bone.quaternion);
                }
            }
        });

        if (typeof window !== 'undefined') {
            window.addEventListener('nova-thinking-procedural', (e: any) => {
                this.thinkingActive = !!e.detail?.active;
                if (!this.thinkingActive) {
                    this.thinkingTime = 0;
                }
            });
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // FULL BODY INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    initializeFullBody(refs: {
        leftArm?: THREE.Bone;
        rightArm?: THREE.Bone;
        leftForeArm?: THREE.Bone;
        rightForeArm?: THREE.Bone;
        torso?: THREE.Bone;
        hips?: THREE.Bone;
        leftLeg?: THREE.Bone;
        rightLeg?: THREE.Bone;
    }): void {
        // Detectar si el modelo es VRM o Mixamo para ajustar los ejes del codo
        const checkVRM = (bone: THREE.Bone | undefined) => {
            if (!bone) return false;
            const n = bone.name.toLowerCase();
            return n.includes('j_bip') || n.includes('mixamo') || n.includes('lower') || n.includes('arm');
        };
        this.isVRMModel = checkVRM(refs.leftForeArm) || checkVRM(refs.rightForeArm);
        console.log(`🤖 IK: Modelo detectado como ${this.isVRMModel ? 'VRM/Mixamo' : 'Rigify/Blender'}`);

        // Asignar bones y clonar poses iniciales
        if (refs.leftArm) {
            this.leftArm.bone = refs.leftArm;
            this.leftArm.originalRot.copy(refs.leftArm.rotation);
            this.leftArm.targetRot.copy(refs.leftArm.rotation);
            this.leftArm.currentRot.copy(refs.leftArm.rotation);
        }
        if (refs.rightArm) {
            this.rightArm.bone = refs.rightArm;
            this.rightArm.originalRot.copy(refs.rightArm.rotation);
            this.rightArm.targetRot.copy(refs.rightArm.rotation);
            this.rightArm.currentRot.copy(refs.rightArm.rotation);
        }
        if (refs.leftForeArm) {
            this.leftForeArm.bone = refs.leftForeArm;
            this.leftForeArm.originalRot.copy(refs.leftForeArm.rotation);
            this.leftForeArm.targetRot.copy(refs.leftForeArm.rotation);
            this.leftForeArm.currentRot.copy(refs.leftForeArm.rotation);
        }
        if (refs.rightForeArm) {
            this.rightForeArm.bone = refs.rightForeArm;
            this.rightForeArm.originalRot.copy(refs.rightForeArm.rotation);
            this.rightForeArm.targetRot.copy(refs.rightForeArm.rotation);
            this.rightForeArm.currentRot.copy(refs.rightForeArm.rotation);
        }
        if (refs.torso) {
            this.torso.bone = refs.torso;
            this.torso.originalRot.copy(refs.torso.rotation);
            this.torso.targetRot.copy(refs.torso.rotation);
            this.torso.currentRot.copy(refs.torso.rotation);
        }
        if (refs.hips) {
            this.hips.bone = refs.hips;
            this.hips.originalRot.copy(refs.hips.rotation);
            this.hips.targetRot.copy(refs.hips.rotation);
            this.hips.currentRot.copy(refs.hips.rotation);
        }
        if (refs.leftLeg) {
            this.leftLeg.bone = refs.leftLeg;
            this.leftLeg.originalRot.copy(refs.leftLeg.rotation);
            this.leftLeg.targetRot.copy(refs.leftLeg.rotation);
            this.leftLeg.currentRot.copy(refs.leftLeg.rotation);
        }
        if (refs.rightLeg) {
            this.rightLeg.bone = refs.rightLeg;
            this.rightLeg.originalRot.copy(refs.rightLeg.rotation);
            this.rightLeg.targetRot.copy(refs.rightLeg.rotation);
            this.rightLeg.currentRot.copy(refs.rightLeg.rotation);
        }

        this.fullBodyReady = true;
        console.log('🤖 IK: Cuerpo completo inicializado en Sistema Nervioso');

        // ── Event Listeners ──────────────────────────────────────────────────
        if (typeof window !== 'undefined') {
            if (this.movementListener) window.removeEventListener('aiko-movement', this.movementListener);
            if (this.actionListener) window.removeEventListener('aiko-action', this.actionListener);
            if (this.jointListener) window.removeEventListener('aiko-studio-joint', this.jointListener);

            this.movementListener = (e: Event) => {
                const { limb, target } = (e as CustomEvent<{ limb: LimbType; target: LimbTarget }>).detail;
                console.log(`🦾 [IKController] aiko-movement → ${limb} : ${target}`);
                this.setLimbTarget(limb, target);
            };

            this.actionListener = (e: Event) => {
                const { action } = (e as CustomEvent<{ action: string }>).detail;
                console.log(`🎭 [IKController] aiko-action recibido → ${action}`);
                window.dispatchEvent(new CustomEvent('aiko-play-procedural', { detail: { action } }));
            };

            this.jointListener = (e: Event) => {
                const { joint, val } = (e as CustomEvent<{ joint: string; val: number }>).detail;
                this.setJointAngle(joint, val);
            };

            window.addEventListener('aiko-movement', this.movementListener);
            window.addEventListener('aiko-action', this.actionListener);
            window.addEventListener('aiko-studio-joint', this.jointListener);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // LIMB CONTROL API
    // ─────────────────────────────────────────────────────────────────────────

    setLimbTarget(limb: LimbType, target: LimbTarget): void {
        if (!this.fullBodyReady) {
            console.warn('⚠️ IK: setLimbTarget() llamado antes de initializeFullBody()');
            return;
        }

        const tStr = String(target).toUpperCase();

        switch (limb) {
            case 'LEFT_ARM':
            case 'RIGHT_ARM':
            case 'BOTH_ARMS': {
                const preset = ARM_POSES_RIGHT[tStr] || ARM_POSES_RIGHT.REST;
                if (limb === 'RIGHT_ARM' || limb === 'BOTH_ARMS') this.rightArm.targetRot.copy(preset);
                if (limb === 'LEFT_ARM' || limb === 'BOTH_ARMS') this.leftArm.targetRot.copy(buildLeftArmPose(preset));
                break;
            }
            case 'LEFT_FOREARM':
            case 'RIGHT_FOREARM':
            case 'BOTH_FOREARMS': {
                // VRM/Mixamo se dobla en el eje Y, Rigify en el eje Z
                const preset = this.isVRMModel
                    ? (tStr === 'BEND' ? new THREE.Euler(0, deg(90), 0) : new THREE.Euler(0, 0, 0))
                    : (FOREARM_POSES_RIGHT[tStr] || FOREARM_POSES_RIGHT.REST);
                
                if (limb === 'RIGHT_FOREARM' || limb === 'BOTH_FOREARMS') {
                    this.rightForeArm.targetRot.copy(preset);
                }
                if (limb === 'LEFT_FOREARM' || limb === 'BOTH_FOREARMS') {
                    const leftPreset = this.isVRMModel
                        ? new THREE.Euler(0, -preset.y, 0)
                        : buildLeftForeArmPose(preset);
                    this.leftForeArm.targetRot.copy(leftPreset);
                }
                break;
            }
            case 'HEAD': {
                const preset = HEAD_POSES[tStr] || HEAD_POSES.NEUTRAL;
                this.headPose.targetRot.copy(preset);
                break;
            }
            case 'TORSO': {
                const preset = TORSO_POSES[tStr] || TORSO_POSES.NEUTRAL;
                this.torso.targetRot.copy(preset);
                break;
            }
            case 'HIPS': {
                const preset = HIPS_POSES[tStr] || HIPS_POSES.NEUTRAL;
                this.hips.targetRot.copy(preset);
                break;
            }
            case 'LEFT_LEG':
            case 'RIGHT_LEG':
            case 'BOTH_LEGS': {
                const preset = LEG_POSES_RIGHT[tStr] || LEG_POSES_RIGHT.STAND;
                if (limb === 'RIGHT_LEG' || limb === 'BOTH_LEGS') this.rightLeg.targetRot.copy(preset);
                if (limb === 'LEFT_LEG' || limb === 'BOTH_LEGS') this.leftLeg.targetRot.copy(buildLeftLegPose(preset));
                break;
            }
        }
    }

    resetAllLimbs(): void {
        if (!this.fullBodyReady) return;
        this.leftArm.targetRot.copy(this.leftArm.originalRot);
        this.rightArm.targetRot.copy(this.rightArm.originalRot);
        this.leftForeArm.targetRot.copy(this.leftForeArm.originalRot);
        this.rightForeArm.targetRot.copy(this.rightForeArm.originalRot);
        this.headPose.targetRot.copy(this.headPose.originalRot);
        this.torso.targetRot.copy(this.torso.originalRot);
        this.hips.targetRot.copy(this.hips.originalRot);
        this.leftLeg.targetRot.copy(this.leftLeg.originalRot);
        this.rightLeg.targetRot.copy(this.rightLeg.originalRot);
    }

    /**
     * Permite ajustar un ángulo articular de forma directa para calibración manual
     */
    setJointAngle(joint: string, angleRad: number): void {
        if (!this.fullBodyReady) return;
        switch (joint) {
            case 'leftArmX': this.leftArm.targetRot.x = angleRad; break;
            case 'leftArmZ': this.leftArm.targetRot.z = angleRad; break;
            case 'rightArmX': this.rightArm.targetRot.x = angleRad; break;
            case 'rightArmZ': this.rightArm.targetRot.z = angleRad; break;
            case 'leftElbow': 
                if (this.isVRMModel) this.leftForeArm.targetRot.set(0, -angleRad, 0);
                else this.leftForeArm.targetRot.set(0, 0, -angleRad); 
                break;
            case 'rightElbow': 
                if (this.isVRMModel) this.rightForeArm.targetRot.set(0, angleRad, 0);
                else this.rightForeArm.targetRot.set(0, 0, angleRad); 
                break;
            case 'torsoX': this.torso.targetRot.x = angleRad; break;
            case 'torsoY': this.torso.targetRot.y = angleRad; break;
            case 'hipsZ': this.hips.targetRot.z = angleRad; break;
            case 'leftLegZ': this.leftLeg.targetRot.z = angleRad; break;
            case 'rightLegZ': this.rightLeg.targetRot.z = angleRad; break;
            case 'leftFingers': this.applyFingerBends('L', { index: angleRad, middle: angleRad, ring: angleRad, pinky: angleRad, thumb: angleRad }); break;
            case 'rightFingers': this.applyFingerBends('R', { index: angleRad, middle: angleRad, ring: angleRad, pinky: angleRad, thumb: angleRad }); break;
        }
    }

    /**
     * Aplica las rotaciones crudas provenientes del tracking por webcam
     */
    applyWebcamRotations(rotations: {
        leftArm?: THREE.Euler;
        rightArm?: THREE.Euler;
        leftForeArm?: THREE.Euler;
        rightForeArm?: THREE.Euler;
        head?: THREE.Euler;
        torso?: THREE.Euler;
        hips?: THREE.Euler;
        leftLeg?: THREE.Euler;
        rightLeg?: THREE.Euler;
        leftFingers?: Record<string, number>;
        rightFingers?: Record<string, number>;
    }): void {
        if (rotations.leftArm) this.leftArm.targetRot.copy(rotations.leftArm);
        if (rotations.rightArm) this.rightArm.targetRot.copy(rotations.rightArm);
        if (rotations.leftForeArm) this.leftForeArm.targetRot.copy(rotations.leftForeArm);
        if (rotations.rightForeArm) this.rightForeArm.targetRot.copy(rotations.rightForeArm);
        if (rotations.head) this.headPose.targetRot.copy(rotations.head);
        if (rotations.torso) this.torso.targetRot.copy(rotations.torso);
        if (rotations.hips) this.hips.targetRot.copy(rotations.hips);
        if (rotations.leftLeg) this.leftLeg.targetRot.copy(rotations.leftLeg);
        if (rotations.rightLeg) this.rightLeg.targetRot.copy(rotations.rightLeg);
        
        if (rotations.leftFingers) {
            this.applyFingerBends('L', rotations.leftFingers);
        }
        if (rotations.rightFingers) {
            this.applyFingerBends('R', rotations.rightFingers);
        }
    }

    private applyFingerBends(side: string, bends: Record<string, number>): void {
        const fingerNames = ['f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb'];
        fingerNames.forEach(f => {
            const shortName = f.replace('f_', ''); // index, middle, ring, pinky, thumb
            const vrmName = shortName === 'pinky' ? 'little' : shortName;
            const val = bends[shortName] || 0;

            for (let i = 1; i <= 3; i++) {
                const formats = [
                    `${f}.0${i}.${side}`,
                    `${f}_0${i}_${side.toLowerCase()}`,
                    `def-${f}.0${i}.${side}`,
                    `def-${f}_0${i}_${side.toLowerCase()}`,
                    
                    // VRM (J_Bip)
                    `j_bip_${side.toLowerCase()}_${vrmName}${i}`,
                    `j_bip_${side}_${vrmName}${i}`,
                    
                    // Mixamo / RPM
                    `${side === 'L' ? 'left' : 'right'}hand${shortName}${i}`,
                    `${side === 'L' ? 'left' : 'right'}hand${vrmName}${i}`,
                    `${side === 'L' ? 'Left' : 'Right'}Hand${shortName.charAt(0).toUpperCase() + shortName.slice(1)}${i}`,
                    `${side === 'L' ? 'Left' : 'Right'}Hand${vrmName.charAt(0).toUpperCase() + vrmName.slice(1)}${i}`
                ];
                for (const format of formats) {
                    const bone = this.fingerBones.get(format.toLowerCase()) || this.fingerBones.get(format);
                    if (bone) {
                        const isVRMBone = format.toLowerCase().includes('j_bip');
                        if (f === 'thumb') {
                            if (isVRMBone) {
                                bone.rotation.z = (side === 'L' ? -1 : 1) * val * THREE.MathUtils.degToRad(35);
                            } else {
                                bone.rotation.x = val * THREE.MathUtils.degToRad(35);
                                bone.rotation.y = (side === 'L' ? -1 : 1) * val * THREE.MathUtils.degToRad(25);
                            }
                        } else {
                            if (isVRMBone) {
                                // En VRM los dedos se flexionan principalmente en el eje Z (invertido según el lado)
                                bone.rotation.z = (side === 'L' ? -1 : 1) * val * THREE.MathUtils.degToRad(70);
                            } else {
                                // En Rigify y Mixamo se flexionan en el eje X
                                bone.rotation.x = val * THREE.MathUtils.degToRad(70);
                            }
                        }
                        break;
                    }
                }
            }
        });
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HEAD / EYE LOOK-AT API
    // ─────────────────────────────────────────────────────────────────────────

    setLookTarget(position: THREE.Vector3, enabled: boolean = true): void {
        this.lookTarget.position.copy(position);
        this.lookTarget.enabled = enabled;
    }

    setLookTargetFromScreen(x: number, y: number, distance: number = 3): void {
        this.lookTarget.position.set(x * distance, y * distance, distance);
        this.lookTarget.enabled = true;
    }

    setMicroOffset(offset: THREE.Vector3): void {
        this.microOffset.copy(offset);
    }

    disableLookAt(): void {
        this.lookTarget.enabled = false;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UPDATE
    // ─────────────────────────────────────────────────────────────────────────

    update(delta: number): void {
        // Interpolaciones suaves de todos los limbs
        this.updateLimbs(delta);

        // Pensamiento procedural (bloquea look-at)
        if (this.thinkingActive) {
            this.updateThinking(delta);
            return;
        }

        // Si no hay target, volver a pose original
        if (!this.lookTarget.enabled) {
            this.returnToOriginalPose(delta);
            return;
        }

        this.updateHeadLookAt(delta);
        this.updateEyeLookAt(delta);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PRIVADOS
    // ─────────────────────────────────────────────────────────────────────────

    private updateLimbs(_delta: number): void {
        if (!this.fullBodyReady) return;

        this.interpolateLimb(this.leftArm, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.rightArm, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.leftForeArm, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.rightForeArm, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.headPose, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.torso, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.hips, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.leftLeg, LERP_SPEED_NORMAL);
        this.interpolateLimb(this.rightLeg, LERP_SPEED_NORMAL);
    }

    private interpolateLimb(limb: LimbIKState, speed: number): void {
        if (!limb.bone) return;

        limb.currentRot.x = THREE.MathUtils.lerp(limb.currentRot.x, limb.targetRot.x, speed);
        limb.currentRot.y = THREE.MathUtils.lerp(limb.currentRot.y, limb.targetRot.y, speed);
        limb.currentRot.z = THREE.MathUtils.lerp(limb.currentRot.z, limb.targetRot.z, speed);

        limb.bone.rotation.x = limb.currentRot.x;
        limb.bone.rotation.y = limb.currentRot.y;
        limb.bone.rotation.z = limb.currentRot.z;
    }

    private updateThinking(delta: number): void {
        this.thinkingTime += delta * 1.5;

        const oscY = Math.sin(this.thinkingTime) * 0.05;
        const oscX = Math.cos(this.thinkingTime * 0.5) * 0.03 + 0.04;
        const oscZ = Math.sin(this.thinkingTime * 0.5) * 0.03;

        if (this.headBone) {
            const thinkingQuat = this.headOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(oscX, oscY, oscZ)));
            this.headBone.quaternion.slerp(thinkingQuat, 0.08);
        }
        if (this.neckBone) {
            const thinkingNeckQuat = this.neckOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(oscX * 0.5, oscY * 0.5, oscZ * 0.5)));
            this.neckBone.quaternion.slerp(thinkingNeckQuat, 0.08);
        }

        if (this.leftEye) {
            const q = this.leftEyeOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, -0.05, 0)));
            this.leftEye.quaternion.slerp(q, 0.1);
        }
        if (this.rightEye) {
            const q = this.rightEyeOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.08, 0.05, 0)));
            this.rightEye.quaternion.slerp(q, 0.1);
        }

        if (this.thinkingTime > 5.0) {
            this.thinkingActive = false;
            this.thinkingTime = 0;
        }
    }

    private updateHeadLookAt(_delta: number): void {
        if (!this.headBone) return;

        const headWorldPos = new THREE.Vector3();
        this.headBone.getWorldPosition(headWorldPos);

        const finalTarget = this.lookTarget.position.clone().add(this.microOffset);
        const direction   = new THREE.Vector3().subVectors(finalTarget, headWorldPos).normalize();

        const targetRotation = new THREE.Euler();
        targetRotation.y = Math.atan2(direction.x, direction.z);
        targetRotation.x = -Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));

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

        // Mezclar rotación de look-at con override de pose de cabeza
        const poseQuat = new THREE.Quaternion().setFromEuler(this.headPose.currentRot);
        const targetQuat = new THREE.Quaternion().setFromEuler(targetRotation).multiply(poseQuat);
        
        this.headBone.quaternion.slerp(targetQuat, this.settings.headLookSpeed);

        if (this.neckBone) {
            const neckTargetQuat = this.neckOriginalQuat.clone().slerp(targetQuat, 0.3);
            this.neckBone.quaternion.slerp(neckTargetQuat, this.settings.headLookSpeed);
        }
    }

    private updateEyeLookAt(_delta: number): void {
        if (!this.leftEye && !this.rightEye) return;

        const eyeWorldPos = new THREE.Vector3();
        if (this.leftEye)       this.leftEye.getWorldPosition(eyeWorldPos);
        else if (this.rightEye) this.rightEye.getWorldPosition(eyeWorldPos);

        const eyeOffset   = this.microOffset.clone().multiplyScalar(1.5);
        const finalTarget = this.lookTarget.position.clone().add(eyeOffset);
        const direction   = new THREE.Vector3().subVectors(finalTarget, eyeWorldPos).normalize();

        const targetRotation = new THREE.Euler();
        targetRotation.y = Math.atan2(direction.x, direction.z);
        targetRotation.x = -Math.asin(THREE.MathUtils.clamp(direction.y, -1, 1));

        targetRotation.x = THREE.MathUtils.clamp(targetRotation.x, -this.settings.maxEyeRotation, this.settings.maxEyeRotation);
        targetRotation.y = THREE.MathUtils.clamp(targetRotation.y, -this.settings.maxEyeRotation, this.settings.maxEyeRotation);

        const targetQuat = new THREE.Quaternion().setFromEuler(targetRotation);

        if (this.leftEye) {
            const finalLeftQuat = this.leftEyeOriginalQuat.clone().multiply(targetQuat);
            this.leftEye.quaternion.slerp(finalLeftQuat, this.settings.eyeLookSpeed);
        }
        if (this.rightEye) {
            const finalRightQuat = this.rightEyeOriginalQuat.clone().multiply(targetQuat);
            this.rightEye.quaternion.slerp(finalRightQuat, this.settings.eyeLookSpeed);
        }
    }

    private returnToOriginalPose(_delta: number): void {
        const returnSpeed = 0.05;
        // Mezclar original con pose de cabeza si existe override
        const poseQuat = new THREE.Quaternion().setFromEuler(this.headPose.currentRot);
        const headTarget = this.headOriginalQuat.clone().multiply(poseQuat);

        if (this.headBone)  this.headBone.quaternion.slerp(headTarget, returnSpeed);
        if (this.neckBone)  this.neckBone.quaternion.slerp(this.neckOriginalQuat, returnSpeed);
        if (this.leftEye)   this.leftEye.quaternion.slerp(this.leftEyeOriginalQuat, returnSpeed);
        if (this.rightEye)  this.rightEye.quaternion.slerp(this.rightEyeOriginalQuat, returnSpeed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILIDADES PÚBLICAS
    // ─────────────────────────────────────────────────────────────────────────

    updateSettings(settings: Partial<IKSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }

    isInitialized(): boolean {
        return !!(this.headBone || this.leftEye || this.rightEye);
    }

    isArmsInitialized(): boolean {
        return this.fullBodyReady;
    }

    dispose(): void {
        if (typeof window !== 'undefined') {
            if (this.movementListener) {
                window.removeEventListener('aiko-movement', this.movementListener);
                this.movementListener = null;
            }
            if (this.actionListener) {
                window.removeEventListener('aiko-action', this.actionListener);
                this.actionListener = null;
            }
        }
    }
}
