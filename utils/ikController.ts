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
    originalQuat?: THREE.Quaternion;
    targetRot: THREE.Euler;
    currentRot: THREE.Euler;
    active?: boolean;
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

/** Poses de las PIERNAS (Bones thigh/upleg) - Movimientos naturales visibles */
const LEG_POSES_RIGHT: Record<string, THREE.Euler> = {
    FORWARD:  new THREE.Euler(deg(24), 0, deg(2)),   // Paso adelante visible (24°)
    BACKWARD: new THREE.Euler(deg(-18), 0, deg(2)),  // Paso atrás (-18°)
    SIDE:     new THREE.Euler(0, 0, deg(16)),        // Abertura lateral (16°)
    STAND:    new THREE.Euler(0, 0, 0),              // Postura neutra
    WIDE:     new THREE.Euler(deg(4), 0, deg(12)),   // Postura firme abierta (12°)
    CROSS:    new THREE.Euler(deg(10), 0, deg(-8)),  // Pierna cruzada
    KICK:     new THREE.Euler(deg(38), 0, deg(5)),   // Patada / pierna alzada
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
    private dummyHeadBone: THREE.Bone | null = null; // Para capturar huesos separados de pelo/ropa
    private neckBone: THREE.Bone | null = null;
    private leftEye: THREE.Bone | null = null;
    private rightEye: THREE.Bone | null = null;

    // Lista de huesos adicionales de la cabeza que deben rotar sincrónicamente 
    // (para resolver jerarquías divididas como las de Rigify donde DEF-spine.006, ORG-spine.006 y head son separados)
    private syncHeadBones: THREE.Bone[] = [];
    private syncHeadOriginalQuats: THREE.Quaternion[] = [];

    private headOriginalQuat: THREE.Quaternion  = new THREE.Quaternion();
    private dummyHeadOriginalQuat: THREE.Quaternion = new THREE.Quaternion();
    private neckOriginalQuat: THREE.Quaternion  = new THREE.Quaternion();
    private leftEyeOriginalQuat: THREE.Quaternion  = new THREE.Quaternion();
    private rightEyeOriginalQuat: THREE.Quaternion = new THREE.Quaternion();

    // ── Look Target ───────────────────────────────────────────────────────────
    private lookTarget: IKTarget = {
        position: new THREE.Vector3(0, 0, 0),
        enabled: false
    };
    
    // ── Dance State ───────────────────────────────────────────────────────────
    private danceEnergy: number = 0;
    private danceTime: number = 0;
    
    private microOffset: THREE.Vector3 = new THREE.Vector3(0, 0, 0);
    private idleTime: number = 0;

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
    /** Flag: el IK NO actualiza cabeza/cuello hasta que recalibrateBindPose() haya capturado el estado real del Idle */
    private isCalibrated: boolean = false;

    // Timer para auto-retorno de piernas al reposo
    private leftLegTimer: number = 0;
    private rightLegTimer: number = 0;
    private readonly LEG_AUTO_RETURN_DELAY = 3.0; // segundos

    private leftHandPose: string = 'RELAX';
    private rightHandPose: string = 'RELAX';
    private leftHandPoseWeight: number = 0.0;
    private rightHandPoseWeight: number = 0.0;

    private movementListener: ((e: Event) => void) | null = null;
    private actionListener: ((e: Event) => void) | null = null;
    private jointListener: ((e: Event) => void) | null = null;
    private handPoseListener: ((e: Event) => void) | null = null;

    private HAND_POSES: Record<string, Record<string, number>> = {
        RELAX: { index: 0.1, middle: 0.1, ring: 0.1, pinky: 0.1, thumb: 0.1 },
        FIST:  { index: 1.0, middle: 1.0, ring: 1.0, pinky: 1.0, thumb: 1.0 },
        POINT: { index: 0.0, middle: 1.0, ring: 1.0, pinky: 1.0, thumb: 1.0 },
        OPEN:  { index: -0.2, middle: -0.2, ring: -0.2, pinky: -0.2, thumb: -0.2 },
        PINCH: { index: 0.9, middle: 0.3, ring: 0.3, pinky: 0.3, thumb: 0.9 },
    };

    constructor(settings?: Partial<IKSettings>) {
        this.settings = { ...DEFAULT_IK_SETTINGS, ...settings };
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HEAD / EYE INITIALIZATION
    // ─────────────────────────────────────────────────────────────────────────

    public setExplicitHeadBone(bone: THREE.Bone | null) {
        if (!bone) return;
        
        // Si ya teníamos un headBone que es DIFERENTE al que nos pasan,
        // probablemente nuestro headBone anterior era un dummy (para pelo/sombreros).
        // Así que lo guardamos en dummyHeadBone antes de sobrescribir.
        if (this.headBone && this.headBone !== bone) {
            this.dummyHeadBone = this.headBone;
            this.dummyHeadOriginalQuat.copy(this.headBone.quaternion);
        }

        this.headBone = bone;
        this.headOriginalQuat.copy(bone.quaternion);
        this.headPose.bone = bone;
        this.headPose.originalRot.copy(bone.rotation);
        this.headPose.targetRot.copy(bone.rotation);
        this.headPose.currentRot.copy(bone.rotation);
    }

    public setSyncHeadBones(bones: THREE.Bone[]) {
        // Filtrar el headBone principal y el dummyHeadBone para no rotarlos dos veces
        this.syncHeadBones = bones.filter(b => b !== this.headBone && b !== this.dummyHeadBone);
        this.syncHeadOriginalQuats = this.syncHeadBones.map(b => b.quaternion.clone());
    }

    public clearDummyHeadBones() {
        this.dummyHeadBone = null;
        this.syncHeadBones = [];
    }

    initialize(model: THREE.Object3D): void {
        model.traverse((child) => {
            if (!(child as any).isBone) return;

            const bone = child as THREE.Bone;
            const name = bone.name.toLowerCase();

            if (name.includes('f_index') || name.includes('f_middle') || name.includes('f_ring') || name.includes('f_pinky') || name.includes('thumb')) {
                this.fingerBones.set(bone.name, bone);
                this.fingerBones.set(name, bone);
            }

            // Match exacto o difuso para HEAD
            const isDeformHead = name === 'j_bip_c_head' || name === 'mixamorighead' || name === 'def-head' || name === 'bip01_head';
            const isExactHead = isDeformHead || name === 'head';
            const isFuzzyHead = name.includes('head') && !name.includes('headtop') && !name.includes('hair') && !name.includes('accessory');
            
            if (isExactHead || isFuzzyHead) {
                if (isDeformHead || !this.headBone) {
                    // Si encontramos el hueso deformador real, y ya teníamos otro, el anterior era un dummy (pelo/sombrero)
                    if (this.headBone && isDeformHead && this.headBone !== bone) {
                        this.dummyHeadBone = this.headBone;
                        this.dummyHeadOriginalQuat.copy(this.headBone.quaternion);
                    }
                    this.headBone = bone;
                    this.headOriginalQuat.copy(bone.quaternion);
                    this.headPose.bone = bone;
                    this.headPose.originalRot.copy(bone.rotation);
                    this.headPose.targetRot.copy(bone.rotation);
                    this.headPose.currentRot.copy(bone.rotation);
                } else if (!this.dummyHeadBone && name === 'head') {
                    // Si ya tenemos el deformador, pero encontramos un "head" suelto, es el dummy
                    this.dummyHeadBone = bone;
                    this.dummyHeadOriginalQuat.copy(bone.quaternion);
                }
            }

            // Match exacto o difuso para NECK
            const isExactNeck = name === 'neck' || name === 'j_bip_c_neck' || name === 'mixamorigneck' || name === 'def-neck' || name === 'bip01_neck';
            if (isExactNeck || name.includes('neck')) {
                if (isExactNeck || !this.neckBone) {
                    this.neckBone = bone;
                    this.neckOriginalQuat.copy(bone.quaternion);
                }
            }

            if (name.includes('eye') && !name.includes('master') && !name.includes('lid') && !name.includes('brow') && !name.includes('lash')) {
                const isLeft  = name.includes('left')  || name.includes('_l') || name.endsWith('.l');
                const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r');

                if (isLeft && (!this.leftEye || name === 'def-eye.l' || name === 'eye.l' || name === 'def-eye_iris.l')) {
                    this.leftEye = bone;
                    this.leftEyeOriginalQuat.copy(bone.quaternion);
                }
                if (isRight && (!this.rightEye || name === 'def-eye.r' || name === 'eye.r' || name === 'def-eye_iris.r')) {
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
            this.leftArm.originalQuat = refs.leftArm.quaternion.clone();
            this.leftArm.targetRot.copy(refs.leftArm.rotation);
            this.leftArm.currentRot.copy(refs.leftArm.rotation);
        }
        if (refs.rightArm) {
            this.rightArm.bone = refs.rightArm;
            this.rightArm.originalRot.copy(refs.rightArm.rotation);
            this.rightArm.originalQuat = refs.rightArm.quaternion.clone();
            this.rightArm.targetRot.copy(refs.rightArm.rotation);
            this.rightArm.currentRot.copy(refs.rightArm.rotation);
        }
        if (refs.leftForeArm) {
            this.leftForeArm.bone = refs.leftForeArm;
            this.leftForeArm.originalRot.copy(refs.leftForeArm.rotation);
            this.leftForeArm.originalQuat = refs.leftForeArm.quaternion.clone();
            this.leftForeArm.targetRot.copy(refs.leftForeArm.rotation);
            this.leftForeArm.currentRot.copy(refs.leftForeArm.rotation);
        }
        if (refs.rightForeArm) {
            this.rightForeArm.bone = refs.rightForeArm;
            this.rightForeArm.originalRot.copy(refs.rightForeArm.rotation);
            this.rightForeArm.originalQuat = refs.rightForeArm.quaternion.clone();
            this.rightForeArm.targetRot.copy(refs.rightForeArm.rotation);
            this.rightForeArm.currentRot.copy(refs.rightForeArm.rotation);
        }
        if (refs.torso) {
            this.torso.bone = refs.torso;
            this.torso.originalRot.copy(refs.torso.rotation);
            this.torso.originalQuat = refs.torso.quaternion.clone();
            this.torso.targetRot.set(0, 0, 0);
            this.torso.currentRot.set(0, 0, 0);
        }
        if (refs.hips) {
            this.hips.bone = refs.hips;
            this.hips.originalRot.copy(refs.hips.rotation);
            this.hips.originalQuat = refs.hips.quaternion.clone();
            this.hips.targetRot.set(0, 0, 0);
            this.hips.currentRot.set(0, 0, 0);
        }
        if (refs.leftLeg) {
            this.leftLeg.bone = refs.leftLeg;
            this.leftLeg.originalRot.copy(refs.leftLeg.rotation);
            this.leftLeg.originalQuat = refs.leftLeg.quaternion.clone();
            this.leftLeg.targetRot.set(0, 0, 0);
            this.leftLeg.currentRot.set(0, 0, 0);
        }
        if (refs.rightLeg) {
            this.rightLeg.bone = refs.rightLeg;
            this.rightLeg.originalRot.copy(refs.rightLeg.rotation);
            this.rightLeg.originalQuat = refs.rightLeg.quaternion.clone();
            this.rightLeg.targetRot.set(0, 0, 0);
            this.rightLeg.currentRot.set(0, 0, 0);
        }

        this.fullBodyReady = true;
        console.log('🤖 IK: Cuerpo completo inicializado en Sistema Nervioso');

        // ── Event Listeners ──────────────────────────────────────────────────
        if (typeof window !== 'undefined') {
            if (this.movementListener) window.removeEventListener('aiko-movement', this.movementListener);
            if (this.actionListener) window.removeEventListener('aiko-action', this.actionListener);
            if (this.jointListener) window.removeEventListener('aiko-studio-joint', this.jointListener);
            if (this.handPoseListener) window.removeEventListener('aiko-hand-pose', this.handPoseListener);

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

            this.handPoseListener = (e: Event) => {
                const { side, pose } = (e as CustomEvent<{ side: 'LEFT' | 'RIGHT' | 'BOTH'; pose: string }>).detail;
                console.log(`🖐️ [IKController] aiko-hand-pose recibido → ${side} : ${pose}`);
                if (side === 'LEFT' || side === 'BOTH') {
                    this.leftHandPose = pose.toUpperCase();
                }
                if (side === 'RIGHT' || side === 'BOTH') {
                    this.rightHandPose = pose.toUpperCase();
                }
            };

            window.addEventListener('aiko-movement', this.movementListener);
            window.addEventListener('aiko-action', this.actionListener);
            window.addEventListener('aiko-studio-joint', this.jointListener);
            window.addEventListener('aiko-hand-pose', this.handPoseListener);
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
                if (limb === 'RIGHT_ARM' || limb === 'BOTH_ARMS') {
                    this.rightArm.targetRot.copy(preset);
                    this.rightArm.active = true;
                }
                if (limb === 'LEFT_ARM' || limb === 'BOTH_ARMS') {
                    this.leftArm.targetRot.copy(buildLeftArmPose(preset));
                    this.leftArm.active = true;
                }
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
                    this.rightForeArm.active = true;
                }
                if (limb === 'LEFT_FOREARM' || limb === 'BOTH_FOREARMS') {
                    const leftPreset = this.isVRMModel
                        ? new THREE.Euler(0, -preset.y, 0)
                        : buildLeftForeArmPose(preset);
                    this.leftForeArm.targetRot.copy(leftPreset);
                    this.leftForeArm.active = true;
                }
                break;
            }
            case 'HEAD': {
                const preset = HEAD_POSES[tStr] || HEAD_POSES.NEUTRAL;
                this.headPose.targetRot.copy(preset);
                this.headPose.active = true;
                break;
            }
            case 'TORSO': {
                const preset = TORSO_POSES[tStr] || TORSO_POSES.NEUTRAL;
                if (tStr === 'NEUTRAL') {
                    this.torso.targetRot.set(0, 0, 0);
                    this.torso.active = true;
                    setTimeout(() => { this.torso.active = false; }, 800);
                } else {
                    this.torso.targetRot.copy(preset);
                    this.torso.active = true;
                }
                break;
            }
            case 'HIPS': {
                const preset = HIPS_POSES[tStr] || HIPS_POSES.NEUTRAL;
                if (tStr === 'NEUTRAL') {
                    this.hips.targetRot.set(0, 0, 0);
                    this.hips.active = true;
                    setTimeout(() => { this.hips.active = false; }, 800);
                } else {
                    this.hips.targetRot.copy(preset);
                    this.hips.active = true;
                }
                break;
            }
            case 'LEFT_LEG':
            case 'RIGHT_LEG':
            case 'BOTH_LEGS': {
                const preset = LEG_POSES_RIGHT[tStr] || LEG_POSES_RIGHT.STAND;
                const isStand = (tStr === 'STAND');
                if (limb === 'RIGHT_LEG' || limb === 'BOTH_LEGS') {
                    this.rightLeg.targetRot.copy(preset);
                    this.rightLeg.active = !isStand;
                    this.rightLegTimer = isStand ? 0 : this.LEG_AUTO_RETURN_DELAY;
                }
                if (limb === 'LEFT_LEG' || limb === 'BOTH_LEGS') {
                    this.leftLeg.targetRot.copy(buildLeftLegPose(preset));
                    this.leftLeg.active = !isStand;
                    this.leftLegTimer = isStand ? 0 : this.LEG_AUTO_RETURN_DELAY;
                }
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
        
        // Reset a offset 0 y desactivar para dar control al mixer
        this.torso.targetRot.set(0, 0, 0);
        this.torso.active = false;
        this.hips.targetRot.set(0, 0, 0);
        this.hips.active = false;
        this.leftLeg.targetRot.set(0, 0, 0);
        this.leftLeg.active = false;
        this.rightLeg.targetRot.set(0, 0, 0);
        this.rightLeg.active = false;
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
            case 'torsoX': this.torso.targetRot.x = angleRad; this.torso.active = true; break;
            case 'torsoY': this.torso.targetRot.y = angleRad; this.torso.active = true; break;
            case 'hipsZ': this.hips.targetRot.z = angleRad; this.hips.active = true; break;
            case 'leftLegZ': this.leftLeg.targetRot.z = THREE.MathUtils.clamp(angleRad * 0.04, deg(-1.5), deg(2.2)); this.leftLeg.active = true; break; // Aún más sutil (máximo 2.2 grados)
            case 'rightLegZ': this.rightLeg.targetRot.z = THREE.MathUtils.clamp(angleRad * 0.04, deg(-2.2), deg(1.5)); this.rightLeg.active = true; break;
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
        if (rotations.torso) { this.torso.targetRot.copy(rotations.torso); this.torso.active = true; }
        if (rotations.hips) { this.hips.targetRot.copy(rotations.hips); this.hips.active = true; }
        if (rotations.leftLeg) { 
            // Amortiguar aún más la elevación por webcam (~2.0° máx)
            this.leftLeg.targetRot.set(
                THREE.MathUtils.clamp(rotations.leftLeg.x * 0.04, deg(-1.5), deg(2.0)), 
                0,
                0
            ); 
            this.leftLeg.active = true; 
        }
        if (rotations.rightLeg) { 
            this.rightLeg.targetRot.set(
                THREE.MathUtils.clamp(rotations.rightLeg.x * 0.04, deg(-1.5), deg(2.0)),
                0,
                0
            ); 
            this.rightLeg.active = true; 
        }
        
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

    setLookTargetFromScreen(x: number, y: number, distance: number = 3, heightOffset: number = 1.4): void {
        this.lookTarget.position.set(x * distance, (y * distance) + heightOffset, distance);
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

    public setDanceState(energy: number, time: number): void {
        this.danceEnergy = energy;
        this.danceTime = time;
    }

    update(delta: number, skipLimbs: boolean = false): void {
        this.idleTime += delta;

        // Interpolaciones suaves de todos los limbs
        if (!skipLimbs) {
            this.updateLimbs(delta);
        }

        // ── GUARD: No actualizar cabeza/cuello hasta que el Idle esté estabilizado ─────────────────
        // El AnimationMixer necesita ~30 frames para alcanzar su pose estable.
        // Si el IK mueve la cabeza antes, capturará un ángulo incorrecto del bind pose de Blender
        // y producirá la cabeza girada 90° hacia atrás al hablar.
        if (!this.isCalibrated) return;

        // Auto-retorno de piernas al reposo
        if (this.leftLeg.active && this.leftLegTimer > 0) {
            this.leftLegTimer -= delta;
            if (this.leftLegTimer <= 0) {
                this.leftLeg.targetRot.copy(this.leftLeg.originalRot);
                this.leftLeg.active = false;
                this.leftLegTimer = 0;
                console.log('🦵 IK: Pierna izquierda retornó automáticamente a STAND');
            }
        }
        if (this.rightLeg.active && this.rightLegTimer > 0) {
            this.rightLegTimer -= delta;
            if (this.rightLegTimer <= 0) {
                this.rightLeg.targetRot.copy(this.rightLeg.originalRot);
                this.rightLeg.active = false;
                this.rightLegTimer = 0;
                console.log('🦵 IK: Pierna derecha retornó automáticamente a STAND');
            }
        }

        // Actualizar posturas de las extremidades y articulaciones del cuerpo completo
        if (!skipLimbs) {
            this.updateLimbs(delta);
        }

        // Actualizar posturas de las manos (procedural + slerp)
        this.updateHandPoses(delta);

        // Pensamiento procedural (bloquea look-at)
        if (this.thinkingActive) {
            this.updateThinking(delta);
            return;
        }

        // Si no hay target, volver a pose original o no hacer nada si estamos en modo skipLimbs (animación externa activa)
        if (!this.lookTarget.enabled) {
            if (!skipLimbs) {
                this.returnToOriginalPose(delta);
            }
            return;
        }

        this.updateHeadLookAt(delta);
        this.updateEyeLookAt(delta);
    }

    isThinking(): boolean {
        return this.thinkingActive;
    }

    private updateHandPoses(delta: number): void {
        if (!this.fullBodyReady) return;

        // Suavizado para lograr la velocidad humana deseada (aprox 150-200ms por transición)
        const transitionSpeed = 6.5; 
        
        const leftTargetWeight = this.leftHandPose === 'RELAX' ? 0.0 : 1.0;
        this.leftHandPoseWeight = THREE.MathUtils.lerp(this.leftHandPoseWeight, leftTargetWeight, delta * transitionSpeed);
        if (Math.abs(this.leftHandPoseWeight - leftTargetWeight) < 0.005) {
            this.leftHandPoseWeight = leftTargetWeight;
        }

        const rightTargetWeight = this.rightHandPose === 'RELAX' ? 0.0 : 1.0;
        this.rightHandPoseWeight = THREE.MathUtils.lerp(this.rightHandPoseWeight, rightTargetWeight, delta * transitionSpeed);
        if (Math.abs(this.rightHandPoseWeight - rightTargetWeight) < 0.005) {
            this.rightHandPoseWeight = rightTargetWeight;
        }

        // Aplicar rotaciones procedurales combinando animación e IK usando Slerp
        if (this.leftHandPoseWeight > 0) {
            this.applyHandPoseBends('L', this.leftHandPose, this.leftHandPoseWeight);
        }
        if (this.rightHandPoseWeight > 0) {
            this.applyHandPoseBends('R', this.rightHandPose, this.rightHandPoseWeight);
        }
    }

    private applyHandPoseBends(side: string, poseName: string, weight: number): void {
        const pose = this.HAND_POSES[poseName] || this.HAND_POSES.RELAX;
        const fingerNames = ['f_index', 'f_middle', 'f_ring', 'f_pinky', 'thumb'];
        
        fingerNames.forEach(f => {
            const shortName = f.replace('f_', '');
            const vrmName = shortName === 'pinky' ? 'little' : shortName;
            const val = pose[shortName] || 0;

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
                        
                        const targetEuler = new THREE.Euler();
                        if (f === 'thumb') {
                            if (isVRMBone) {
                                targetEuler.set(0, 0, (side === 'L' ? -1 : 1) * val * THREE.MathUtils.degToRad(35));
                            } else {
                                targetEuler.set(val * THREE.MathUtils.degToRad(35), (side === 'L' ? -1 : 1) * val * THREE.MathUtils.degToRad(25), 0);
                            }
                        } else {
                            if (isVRMBone) {
                                targetEuler.set(0, 0, (side === 'L' ? -1 : 1) * val * THREE.MathUtils.degToRad(70));
                            } else {
                                targetEuler.set(val * THREE.MathUtils.degToRad(70), 0, 0);
                            }
                        }

                        // Slerp gradual entre la animación y la pose procedural deseada
                        const targetQuat = new THREE.Quaternion().setFromEuler(targetEuler);
                        bone.quaternion.slerp(targetQuat, weight);
                        break;
                    }
                }
            }
        });
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
        
        this.interpolateFlexibleLimb(this.torso, LERP_SPEED_NORMAL);
        this.interpolateFlexibleLimb(this.hips, LERP_SPEED_NORMAL);
        this.interpolateFlexibleLimb(this.leftLeg, LERP_SPEED_NORMAL);
        this.interpolateFlexibleLimb(this.rightLeg, LERP_SPEED_NORMAL);
    }

    private interpolateLimb(limb: LimbIKState, speed: number): void {
        if (!limb.bone) return;

        // Slerp gradual usando cuaterniones para evitar gimbal lock y deformaciones en rigs de Rigify
        const targetQuat = new THREE.Quaternion().setFromEuler(limb.targetRot);
        limb.bone.quaternion.slerp(targetQuat, speed);
    }

    private interpolateFlexibleLimb(limb: LimbIKState, speed: number): void {
        if (!limb.bone) return;

        if (limb.active) {
            // BUGFIX: Las rotaciones de limbs flexibles (Torso, Hips, Legs) deben ser RELATIVAS a su pose de reposo original (originalQuat),
            // en lugar de sobreescribir la rotación absoluta del hueso con setFromEuler(targetRot).
            // Sobreescribir con setFromEuler(0,0,0) destruía la pose de reposo de Rigify (+90° X) y tumbaba al avatar de espaldas.
            const deltaQuat = new THREE.Quaternion().setFromEuler(limb.targetRot);
            const baseQuat = limb.originalQuat || new THREE.Quaternion().setFromEuler(limb.originalRot);
            const targetQuat = baseQuat.clone().multiply(deltaQuat);
            limb.bone.quaternion.slerp(targetQuat, speed);
        }
    }

    private updateThinking(delta: number): void {
        this.thinkingTime += delta * 1.5;

        let oscY = Math.sin(this.thinkingTime) * 0.05;
        let oscX = Math.cos(this.thinkingTime * 0.5) * 0.03 + 0.04;
        let oscZ = Math.sin(this.thinkingTime * 0.5) * 0.03;

        // Añadir energía de baile
        if (this.danceEnergy > 0.05) {
            oscZ += Math.sin(this.danceTime * 1.0) * 0.2 * this.danceEnergy;
            oscX += Math.cos(this.danceTime * 2.0) * 0.15 * this.danceEnergy; // Asentir
            oscY += Math.sin(this.danceTime * 0.5) * 0.1 * this.danceEnergy;
        }

        if (this.headBone) {
            const thinkingQuat = this.headOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(oscX, oscY, oscZ)));
            this.headBone.quaternion.slerp(thinkingQuat, this.danceEnergy > 0.05 ? 0.2 : 0.08);
            this.headBone.userData.ikBaseRotation = this.headBone.quaternion.clone();
        }
        if (this.dummyHeadBone) {
            const dummyThinkingQuat = this.dummyHeadOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(oscX, oscY, oscZ)));
            this.dummyHeadBone.quaternion.slerp(dummyThinkingQuat, this.danceEnergy > 0.05 ? 0.2 : 0.08);
            this.dummyHeadBone.userData.ikBaseRotation = this.dummyHeadBone.quaternion.clone();
        }

        for (let i = 0; i < this.syncHeadBones.length; i++) {
            const bone = this.syncHeadBones[i];
            const originalQuat = this.syncHeadOriginalQuats[i];
            const syncThinkingQuat = originalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(oscX, oscY, oscZ)));
            bone.quaternion.slerp(syncThinkingQuat, this.danceEnergy > 0.05 ? 0.2 : 0.08);
            bone.userData.ikBaseRotation = bone.quaternion.clone();
        }
        if (this.neckBone) {
            const thinkingNeckQuat = this.neckOriginalQuat.clone()
                .multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(oscX * 0.5, oscY * 0.5, oscZ * 0.5)));
            this.neckBone.quaternion.slerp(thinkingNeckQuat, this.danceEnergy > 0.05 ? 0.2 : 0.08);
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

        // Límites anatómicos seguros para cabeza (evita torcedura/deformación de cuello)
        const maxHeadY = THREE.MathUtils.degToRad(35);   // Máx 35° izquierda/derecha
        const maxHeadXUp = THREE.MathUtils.degToRad(20);  // Máx 20° arriba
        const maxHeadXDown = THREE.MathUtils.degToRad(12); // Máx 12° abajo

        targetRotation.y = THREE.MathUtils.clamp(targetRotation.y, -maxHeadY, maxHeadY);
        targetRotation.x = THREE.MathUtils.clamp(targetRotation.x, -maxHeadXDown, maxHeadXUp);

        // Deriva biológica sutil (micro-movimiento vivo al respirar y sostener la cabeza)
        const bioDriftX = Math.sin(this.idleTime * 0.45) * deg(0.6) + Math.sin(this.idleTime * 1.1) * deg(0.25);
        const bioDriftY = Math.cos(this.idleTime * 0.35) * deg(0.7) + Math.cos(this.idleTime * 0.9) * deg(0.3);
        // Inclinación natural z que acompaña la rotación y (los humanos inclinan ligeramente la cabeza al mirar a los lados)
        const bioDriftZ = -targetRotation.y * 0.08 + Math.sin(this.idleTime * 0.28) * deg(0.5);

        // Añadir energía de baile
        let danceX = 0, danceY = 0, danceZ = 0;
        if (this.danceEnergy > 0.05) {
            danceZ = Math.sin(this.danceTime * 1.0) * 0.2 * this.danceEnergy;
            danceX = Math.cos(this.danceTime * 2.0) * 0.15 * this.danceEnergy; // Asentir
            danceY = Math.sin(this.danceTime * 0.5) * 0.1 * this.danceEnergy;
        }

        // Combinar delta de mirada + deriva biológica + pose de cabeza + baile
        const lookEuler = new THREE.Euler(
            targetRotation.x + bioDriftX,
            targetRotation.y + bioDriftY,
            bioDriftZ
        );
        const lookDeltaQuat = new THREE.Quaternion().setFromEuler(lookEuler);
        const poseQuat = new THREE.Quaternion().setFromEuler(this.headPose.targetRot);
        const danceQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(danceX, danceY, danceZ));
        
        const totalRelativeQuat = lookDeltaQuat.clone().multiply(poseQuat).multiply(danceQuat);
        const lookSpeed = this.danceEnergy > 0.05 ? 0.03 : this.settings.headLookSpeed;

        // Cabeza: Aplica la rotación completa de mirada sobre el hueso del cráneo
        const targetQuat = this.headOriginalQuat.clone().multiply(totalRelativeQuat);
        this.headBone.quaternion.slerp(targetQuat, lookSpeed);
        this.headBone.userData.ikBaseRotation = this.headBone.quaternion.clone();

        // Cuello: Solo se aplica movimiento cinemático dinámico durante el baile (danceEnergy > 0.05).
        // En modo Idle normal, se permite que la animación fluya de manera continua entre el pecho y el cuello,
        // eliminando por completo el conflicto de articulación que generaba la joroba.
        if (this.neckBone && this.danceEnergy > 0.05) {
            const neckDanceQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(danceX * 0.1, danceY * 0.1, danceZ * 0.1));
            const neckTargetQuat = this.neckOriginalQuat.clone().multiply(neckDanceQuat);
            this.neckBone.quaternion.slerp(neckTargetQuat, lookSpeed);
            this.neckBone.userData.ikBaseRotation = this.neckBone.quaternion.clone();
        }

        if (this.dummyHeadBone) {
            const dummyTargetQuat = this.dummyHeadOriginalQuat.clone().multiply(totalRelativeQuat);
            this.dummyHeadBone.quaternion.slerp(dummyTargetQuat, lookSpeed);
            this.dummyHeadBone.userData.ikBaseRotation = this.dummyHeadBone.quaternion.clone();
        }

        for (let i = 0; i < this.syncHeadBones.length; i++) {
            const bone = this.syncHeadBones[i];
            const originalQuat = this.syncHeadOriginalQuats[i];
            const syncTargetQuat = originalQuat.clone().multiply(totalRelativeQuat);
            bone.quaternion.slerp(syncTargetQuat, lookSpeed);
            bone.userData.ikBaseRotation = bone.quaternion.clone();
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

        targetRotation.x = THREE.MathUtils.clamp(targetRotation.x, -this.settings.maxEyeRotation, this.settings.maxEyeRotation * 0.4);
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
        const poseQuat = new THREE.Quaternion().setFromEuler(this.headPose.targetRot);
        const headTarget = this.headOriginalQuat.clone().multiply(poseQuat);

        if (this.headBone)  this.headBone.quaternion.slerp(headTarget, returnSpeed);
        if (this.dummyHeadBone) this.dummyHeadBone.quaternion.slerp(headTarget, returnSpeed);
        if (this.neckBone)  this.neckBone.quaternion.slerp(this.neckOriginalQuat, returnSpeed * 0.5); // Retorno más lento para el cuello
        if (this.leftEye)   this.leftEye.quaternion.slerp(this.leftEyeOriginalQuat, returnSpeed);
        if (this.rightEye)  this.rightEye.quaternion.slerp(this.rightEyeOriginalQuat, returnSpeed);
    }

    // ─────────────────────────────────────────────────────────────────────────
    // UTILIDADES PÚBLICAS
    // ─────────────────────────────────────────────────────────────────────────

    /**
     * Recalibrar las rotaciones base de la cabeza y el cuello DESPUÉS de que
     * el AnimationMixer haya estabilizado la animación Idle.
     * Llamar ~5 frames después de cargar el modelo.
     */
    recalibrateBindPose(): void {
        if (this.headBone) {
            this.headOriginalQuat.copy(this.headBone.quaternion);
            this.headPose.originalRot.copy(this.headBone.rotation);
            console.log('🔧 IK: headOriginalQuat recalibrado al estado Idle estabilizado');
        }
        if (this.dummyHeadBone) {
            this.dummyHeadOriginalQuat.copy(this.dummyHeadBone.quaternion);
        }
        if (this.neckBone) {
            this.neckOriginalQuat.copy(this.neckBone.quaternion);
            console.log('🔧 IK: neckOriginalQuat recalibrado al estado Idle estabilizado');
        }
        // Recalibrar también los syncHeadBones
        this.syncHeadOriginalQuats = this.syncHeadBones.map(b => b.quaternion.clone());

        // Recalibrar torso, caderas y piernas para que NEUTRAL sepa a dónde volver
        if (this.torso.bone) {
            this.torso.originalRot.copy(this.torso.bone.rotation);
            this.torso.originalQuat = this.torso.bone.quaternion.clone();
            console.log('🔧 IK: torso.originalRot recalibrado al estado Idle estabilizado');
        }
        if (this.hips.bone) {
            this.hips.originalRot.copy(this.hips.bone.rotation);
            this.hips.originalQuat = this.hips.bone.quaternion.clone();
        }
        if (this.leftLeg.bone) {
            this.leftLeg.originalRot.copy(this.leftLeg.bone.rotation);
            this.leftLeg.originalQuat = this.leftLeg.bone.quaternion.clone();
        }
        if (this.rightLeg.bone) {
            this.rightLeg.originalRot.copy(this.rightLeg.bone.rotation);
            this.rightLeg.originalQuat = this.rightLeg.bone.quaternion.clone();
        }

        // ✅ Ahora el IK puede actualizar la cabeza con certeza de tener el quaternion correcto
        this.isCalibrated = true;
        console.log('✅ IK: Calibración completa — head tracking activado');
    }

    updateSettings(settings: Partial<IKSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }

    /** Resetear la calibración (llamar cuando se carga un nuevo modelo) */
    resetCalibration(): void {
        this.isCalibrated = false;
        console.log('🔄 IK: Calibración reseteada — esperando nuevo recalibrateBindPose()');
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
            if (this.jointListener) {
                window.removeEventListener('aiko-studio-joint', this.jointListener);
                this.jointListener = null;
            }
            if (this.handPoseListener) {
                window.removeEventListener('aiko-hand-pose', this.handPoseListener);
                this.handPoseListener = null;
            }
        }
    }
}
