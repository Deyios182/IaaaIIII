/**
 * Jiggle Physics System - Físicas de rebote para huesos dinámicos
 * Aplica spring physics a huesos de pechos, cabello, falda, etc.
 */

import * as THREE from 'three';

export interface JiggleBone {
    bone: THREE.Object3D;
    originalRotation: THREE.Euler;
    velocity: THREE.Vector3;
    targetRotation: THREE.Euler;
    settings?: JiggleSettings; // Configuración específica por hueso
    type: 'breast' | 'butt' | 'cloth' | 'hair' | 'other';
    tipOffset: THREE.Vector3;
    baseLocalDir: THREE.Vector3;
    particleRadius: number;
}

export interface JiggleSettings {
    stiffness: number;  // Qué tan rápido vuelve a posición (0.1-1)
    damping: number;    // Qué tan rápido se detiene (0.1-1)
    gravity: number;    // Efecto de gravedad
    intensity: number;  // Intensidad global (0-2)
    maxAngle: number;   // Ángulo máximo de deformación en radianes
}

export interface BodyCollider {
    type: 'sphere' | 'capsule';
    bone: THREE.Object3D;
    boneB?: THREE.Object3D;
    offset: THREE.Vector3;
    offsetB?: THREE.Vector3;
    radius: number;
    name: string;
    targetTypes: Array<'breast' | 'butt' | 'cloth' | 'hair' | 'all'>;
    lastWorldPos?: THREE.Vector3;
    velocity?: THREE.Vector3;
}

export interface BodyColliderRefs {
    spine?: THREE.Object3D | null;
    hips?: THREE.Object3D | null;
    leftLeg?: THREE.Object3D | null;
    rightLeg?: THREE.Object3D | null;
    leftKnee?: THREE.Object3D | null;
    rightKnee?: THREE.Object3D | null;
    leftFoot?: THREE.Object3D | null;
    rightFoot?: THREE.Object3D | null;
    leftHand?: THREE.Object3D | null;
    rightHand?: THREE.Object3D | null;
    leftForeArm?: THREE.Object3D | null;
    rightForeArm?: THREE.Object3D | null;
    leftBreast?: THREE.Object3D | null;
    rightBreast?: THREE.Object3D | null;
}

// Configuración por defecto
export const DEFAULT_JIGGLE_SETTINGS: JiggleSettings = {
    stiffness: 0.3,
    damping: 0.7,
    gravity: 0.02,
    intensity: 1.0,
    maxAngle: Math.PI / 4 // 45 grados por defecto
};

// Patrones de nombres de huesos que deben tener jiggle (Pelo, Ropa, Pechos, Trasero, etc.)
// Soporte exhaustivo para inglés, japonés MMD/PMX, chino Genshin Impact/miHoYo y español
const JIGGLE_PATTERNS = [
    // Pechos (inglés, japonés PMX, chino Genshin, español)
    'breast', 'boob', 'oppai', 'bust', 'pai', 'pecho', 'sen', 'mune', '胸',
    // Trasero / Glúteos (inglés, japonés PMX, chino Genshin, español)
    'ass', 'butt', 'glute', 'shiri', 'buttock', '尻', '臀', '屁股',
    // Ropa / Falda / Lazos / Mangas (inglés, japonés PMX, chino Genshin Impact, español)
    'skirt', 'cloth', 'dress', 'fura', 'fuwa', 'sleeve', 'ribbon', 'bow', 'bowknot',
    'cape', 'coat', 'curtain', 'belt', 'tie', 'sk_', 'apron', 'hem', 'frill', 'streamer',
    'ropa', 'falda', 'vestido', 'manga', 'lazo',
    'スカート', '裾', '袖', 'リボン', '帯', 'マント', '服', 'ワンピ', 'フリル', 'ネクタイ', '紐', 'ヒモ', '布',
    // Chino Genshin Impact (Eula, Raiden, etc.)
    '裙', '前裙', '后裙', '左裙', '右裙', '裙摆', '裙子',
    '下摆', '下擺', '前摆', '前擺', '后摆', '後擺',
    '披风', '披風', '飘带', '飄帶', '腰饰', '腰带', '胸饰', '发饰', '背饰',
    // Pelo / Colas / Mechones (inglés, japonés PMX, chino Genshin)
    'hair', 'tail', 'ponytail', 'twintail', 'kaminoke', 'bangs', 'fringe', 'strand',
    'ahoge', 'pigtail', 'braid', 'sidelock', 'front_hair', 'back_hair', 'side_hair',
    '髪', '前髪', '後髪', '横髪', 'ツインテ', 'ポニテ', 'アホ毛',
    '头发', '前发', '后发', '发', '辮'
];

// Huesos estructurales mayores que NUNCA deben tener jiggle
const STRUCTURAL_EXCLUDES = [
    'spine', 'torso', 'neck', 'head', 'pelvis', 'hips',
    'thigh', 'calf', 'shin', 'leg', 'foot', 'toe', 'knee', 'ankle',
    'arm', 'forearm', 'upperarm', 'lowerarm', 'hand', 'finger', 'shoulder', 'wrist', 'elbow', 'clavicle',
    'thumb', 'index', 'middle', 'ring', 'pinky', 'little',
    'eye', 'jaw', 'tongue', 'root', 'center', 'groove',
    // Protección absoluta para nombres estructurales en japonés y chino:
    '足', 'ひざ', '膝', '足首', 'つま先', '腿', '下半身', '上半身', 'センター', 'グルーブ', '全ての親', '腕', '手首', 'ひじ', '肘', '肩'
];

// Configuración de rebote por tipo (User requested: Ropa 50% soft, Jiggle 80% soft)
export function getPhysicsSettings(boneName: string): Partial<JiggleSettings> {
    const n = boneName.toLowerCase();
    const raw = boneName;

    // Pechos (Firme y elástico: turgente, rebote vivo sin hundimiento ni flacidez)
    const isBreast = n.includes('breast') || n.includes('boob') || n.includes('oppai') ||
        n.includes('bust') || n.includes('mune') || raw.includes('胸') || n.includes('pecho');
    if (isBreast) return { 
        stiffness: 0.38, 
        damping: 0.76, 
        gravity: 0.003, 
        intensity: 1.05, 
        maxAngle: Math.PI / 11 // ~16.3 grados máximo: firmeza turgente que evita que se hundan o cuelguen
    };

    // Trasero / Glúteos (Firme y redondeado: elástico y ágil, sin descolgarse ni hundirse en las piernas)
    const isButt = n.includes('ass') || n.includes('butt') || n.includes('glute') ||
        n.includes('shiri') || raw.includes('尻') || raw.includes('臀') || raw.includes('屁股') || n.includes('trasero');
    if (isButt) return { 
        stiffness: 0.35, 
        damping: 0.78, 
        gravity: 0.002, 
        intensity: 1.05, 
        maxAngle: Math.PI / 9 // ~20 grados máximo: evita deformaciones extremas o que cuelgue hacia abajo
    };

    if (isActualEarBone(n)) return { stiffness: 0.35, damping: 0.65, gravity: 0, maxAngle: Math.PI / 4 };

    // Pelo físico (japonés, chino o inglés: 65% soft)
    const isHair = n.includes('hair') || n.includes('tail') || n.includes('ponytail') ||
        n.includes('bangs') || n.includes('strand') || n.includes('kaminoke') || raw.includes('髪') || raw.includes('发');
    if (isHair) return { stiffness: 0.25, damping: 0.75, gravity: 0.02, intensity: 1.15, maxAngle: Math.PI / 3 };

    // Ropa / Falda / Vestido / Lazos / Mangas (Soft 50%: caída natural con estructura de tela y drapeado holgado sobre piernas)
    const isCloth = n.includes('bow') || n.includes('ribbon') || n.includes('skirt') ||
        n.includes('cloth') || n.includes('dress') || n.includes('fura') || n.includes('fuwa') ||
        n.includes('sleeve') || n.includes('cape') || n.includes('coat') || n.includes('apron') ||
        n.includes('frill') || n.includes('hem') || n.includes('streamer') || n.includes('curtain') || n.includes('ropa') ||
        n.includes('falda') || n.includes('vestido') || n.includes('manga') ||
        raw.includes('スカート') || raw.includes('裾') || raw.includes('袖') || raw.includes('リボン') ||
        raw.includes('マント') || raw.includes('服') || raw.includes('ワンピ') || raw.includes('フリル') ||
        raw.includes('ネクタイ') || raw.includes('紐') || raw.includes('ヒモ') || raw.includes('布') ||
        raw.includes('帯') || raw.includes('裙') || raw.includes('下摆') || raw.includes('下擺') ||
        raw.includes('前摆') || raw.includes('前擺') || raw.includes('后摆') || raw.includes('後擺') ||
        raw.includes('披风') || raw.includes('披風') || raw.includes('飘带') || raw.includes('飄帶') ||
        raw.includes('腰饰') || raw.includes('腰带') || raw.includes('胸饰') || raw.includes('背饰');
    if (isCloth) return { 
        stiffness: 0.10, 
        damping: 0.85, 
        gravity: 0.015, // Gravedad suave para mantener la caída acampanada de la falda sin pegarla a las piernas
        intensity: 1.15, 
        maxAngle: Math.PI / 2.4 
    };

    return { stiffness: 0.18, damping: 0.82, gravity: 0.015, intensity: 1.1, maxAngle: Math.PI / 3 };
}

function isActualEarBone(lowerName: string): boolean {
    return /(?:^|[^a-z])ear(?:$|[^a-z]|l|r|_|\.)/i.test(lowerName) ||
           lowerName.includes('catear') || lowerName.includes('foxear') || lowerName.includes('bunnyeart') ||
           lowerName.startsWith('ear') || lowerName.endsWith('ear');
}

// Detectar si un hueso es de tipo jiggle
export function isJiggleBone(boneName: string): boolean {
    const lower = boneName.toLowerCase();

    // 1. Detectar si coincide con algún patrón de rebote (pelo, falda, pechos, orejas)
    const matchesPattern = JIGGLE_PATTERNS.some(pattern => {
        const isKanji = /[^\x00-\x7F]/.test(pattern);
        return isKanji ? boneName.includes(pattern) : lower.includes(pattern);
    }) || isActualEarBone(lower);

    if (!matchesPattern) return false;

    // 2. Proteger huesos de pechos contra falsos positivos de 'chest' o 'torso'
    const isTrueBreast = lower.includes('breast') || lower.includes('boob') || lower.includes('oppai') ||
                         lower.includes('bust') || lower.includes('mune') || boneName.includes('胸');

    // 3. Excluir extremidades mayores y huesos estructurales
    for (const pattern of STRUCTURAL_EXCLUDES) {
        const isKanji = /[^\x00-\x7F]/.test(pattern);
        const hasMatch = isKanji ? boneName.includes(pattern) : lower.includes(pattern);
        if (hasMatch) {
            if (isTrueBreast && (pattern === 'chest' || pattern === 'torso' || pattern === '上半身')) {
                continue;
            }
            return false;
        }
    }

    // 4. Excluir IK targets o polos específicos (ej: ik_foot, leg_pole), pero permitir prefijos de control PMX como Ctr_Hair
    if (lower.endsWith('_ik') || lower.endsWith('.ik') || lower.startsWith('ik_') || lower.includes('_target') || lower.includes('_pole')) {
        return false;
    }

    return true;
}

// Detectar tipo semántico de hueso
export function detectBoneType(boneName: string): 'breast' | 'butt' | 'cloth' | 'hair' | 'other' {
    const n = boneName.toLowerCase();
    const raw = boneName;
    if (n.includes('breast') || n.includes('boob') || n.includes('oppai') || n.includes('bust') || n.includes('mune') || raw.includes('胸') || n.includes('pecho')) {
        return 'breast';
    }
    if (n.includes('ass') || n.includes('butt') || n.includes('glute') || n.includes('shiri') || raw.includes('尻') || raw.includes('臀') || raw.includes('屁股') || n.includes('trasero')) {
        return 'butt';
    }
    if (n.includes('hair') || n.includes('tail') || n.includes('ponytail') || n.includes('bangs') || n.includes('strand') || n.includes('kaminoke') || raw.includes('髪') || raw.includes('发') || raw.includes('辮')) {
        return 'hair';
    }
    if (n.includes('bow') || n.includes('ribbon') || n.includes('skirt') || n.includes('cloth') || n.includes('dress') || n.includes('fura') || n.includes('fuwa') || n.includes('sleeve') || n.includes('cape') || n.includes('coat') || n.includes('apron') || n.includes('frill') || n.includes('hem') || n.includes('streamer') || n.includes('curtain') || n.includes('ropa') || n.includes('falda') || n.includes('vestido') || n.includes('manga') || raw.includes('スカート') || raw.includes('裾') || raw.includes('袖') || raw.includes('リボン') || raw.includes('マント') || raw.includes('服') || raw.includes('ワンピ') || raw.includes('フリル') || raw.includes('ネクタイ') || raw.includes('紐') || raw.includes('ヒモ') || raw.includes('布') || raw.includes('帯') || raw.includes('裙') || raw.includes('下摆') || raw.includes('下擺') || raw.includes('前摆') || raw.includes('前擺') || raw.includes('后摆') || raw.includes('後擺') || raw.includes('披风') || raw.includes('披風') || raw.includes('飘带') || raw.includes('飄帶') || raw.includes('腰饰') || raw.includes('腰带') || raw.includes('胸饰') || raw.includes('背饰')) {
        return 'cloth';
    }
    return 'other';
}

function computeTipOffset(bone: THREE.Object3D, type: 'breast' | 'butt' | 'cloth' | 'hair' | 'other'): { tipOffset: THREE.Vector3, baseLocalDir: THREE.Vector3, particleRadius: number } {
    let tipOffset = new THREE.Vector3();
    let particleRadius = 0.05;

    // Si tiene un hueso hijo, la dirección exacta al hijo es el tip natural
    if (bone.children && bone.children.length > 0) {
        const childBone = bone.children.find((c: any) => c.isBone || c.type === 'Object3D') as THREE.Object3D | undefined;
        if (childBone && childBone.position.length() > 0.02) {
            tipOffset.copy(childBone.position);
            particleRadius = type === 'breast' ? 0.04 : (type === 'butt' ? 0.08 : (type === 'cloth' ? 0.075 : 0.035));
            return {
                tipOffset,
                baseLocalDir: tipOffset.clone().normalize(),
                particleRadius
            };
        }
    }

    // Si es un hueso hoja (sin hijos, ej. pechos o punta de falda)
    bone.updateWorldMatrix(true, false);
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);

    let worldForwardDir = new THREE.Vector3(0, 0, 0.09); // Pechos: hacia adelante
    if (type === 'breast') {
        particleRadius = 0.04;
        worldForwardDir.set(0, 0.01, 0.08);
    } else if (type === 'butt') {
        particleRadius = 0.08;
        worldForwardDir.set(0, -0.02, -0.10);
    } else if (type === 'cloth') {
        particleRadius = 0.075;
        worldForwardDir.set(0, -0.22, 0); // Falda: hacia abajo
    } else if (type === 'hair') {
        particleRadius = 0.035;
        worldForwardDir.set(0, -0.16, -0.02);
    } else {
        particleRadius = 0.04;
        worldForwardDir.set(0, -0.10, 0);
    }

    const targetWorldPoint = boneWorldPos.clone().add(worldForwardDir);
    bone.worldToLocal(targetWorldPoint);
    tipOffset.copy(targetWorldPoint);

    if (tipOffset.length() < 0.01) {
        tipOffset.copy(worldForwardDir);
    }

    return {
        tipOffset,
        baseLocalDir: tipOffset.clone().normalize(),
        particleRadius
    };
}

// Reusable calculation vectors (zero GC allocations per frame)
const _tempOrigin = new THREE.Vector3();
const _tempTip = new THREE.Vector3();
const _tempPushedTip = new THREE.Vector3();
const _tempColliderCenter = new THREE.Vector3();
const _tempToTip = new THREE.Vector3();
const _tempFallbackNormal = new THREE.Vector3(0, 0, 1);
const _tempColliderNormal = new THREE.Vector3();
const _tempPA = new THREE.Vector3();
const _tempPB = new THREE.Vector3();
const _tempAB = new THREE.Vector3();
const _tempAP = new THREE.Vector3();
const _tempClosest = new THREE.Vector3();
const _tempWorldTargetDir = new THREE.Vector3();
const _tempParentQuat = new THREE.Quaternion();
const _tempCorrectionQuat = new THREE.Quaternion();
const _tempScale = new THREE.Vector3();
const _tempZero = new THREE.Vector3();
const _tempColPos = new THREE.Vector3();
const _tempBrushImpulse = new THREE.Vector3();
const _tempLocalBrushImpulse = new THREE.Vector3();

// Vectores para gravedad mundial 3D e inercia dinámica
const _worldGravity = new THREE.Vector3(0, -1, 0);
const _tempBoneWorldQuat = new THREE.Quaternion();
const _tempCurrentWorldDir = new THREE.Vector3();
const _tempWorldGravityTorque = new THREE.Vector3();
const _tempLocalGravityTorque = new THREE.Vector3();
const _tempWorldInertia = new THREE.Vector3();
const _tempWorldInertiaTorque = new THREE.Vector3();
const _tempLocalInertiaTorque = new THREE.Vector3();

// Clase principal para manejar jiggle physics
export class JigglePhysicsSystem {
    private bones: JiggleBone[] = [];
    private colliders: BodyCollider[] = [];
    private settings: JiggleSettings;
    private rootVelocity: THREE.Vector3 = new THREE.Vector3();
    private lastRootPosition: THREE.Vector3 = new THREE.Vector3();
    private tempRootWorldPos: THREE.Vector3 = new THREE.Vector3();
    private windX: number = 0;
    private windZ: number = 0;

    constructor(settings: Partial<JiggleSettings> = {}) {
        this.settings = { ...DEFAULT_JIGGLE_SETTINGS, ...settings };
    }

    // Configurar colliders corporales dinámicos (pecho, pelvis, muslos, pantorrillas, manos, pechos)
    setupBodyColliders(refs: BodyColliderRefs, model?: THREE.Object3D): void {
        this.colliders = [];

        // Fallbacks automáticos si alguna referencia no vino explícita
        if (model) {
            const allBones = model.getObjectsByProperty('isBone', true) as THREE.Bone[];
            const findB = (patterns: string[]) => allBones.find(b => {
                const ln = b.name.toLowerCase();
                return patterns.some(p => ln.includes(p) || b.name.includes(p));
            });

            if (!refs.spine) refs.spine = findB(['spine.001', 'spine', 'def-spine', 'upper_chest', '上半身', '上半身2']) || null;
            if (!refs.hips) refs.hips = findB(['hips', 'def-hips', 'pelvis', 'lower_body', '下半身', '腰', 'センター']) || null;
            if (!refs.leftLeg) refs.leftLeg = findB(['thigh.l', 'thigh_l', 'upleg.l', 'left up leg', '左足', '左足d']) || null;
            if (!refs.rightLeg) refs.rightLeg = findB(['thigh.r', 'thigh_r', 'upleg.r', 'right up leg', '右足', '右足d']) || null;
            if (!refs.leftKnee) refs.leftKnee = findB(['shin.l', 'knee.l', 'calf.l', 'left leg', '左ひざ', '左膝', '左ひざd', '左膝d']) || null;
            if (!refs.rightKnee) refs.rightKnee = findB(['shin.r', 'knee.r', 'calf.r', 'right leg', '右ひざ', '右膝', '右ひざd', '右膝d']) || null;
            if (!refs.leftHand) refs.leftHand = findB(['hand.l', 'hand_l', 'wrist.l', 'left hand', '左手首', '左手']) || null;
            if (!refs.rightHand) refs.rightHand = findB(['hand.r', 'hand_r', 'wrist.r', 'right hand', '右手首', '右手']) || null;
            if (!refs.leftForeArm) refs.leftForeArm = findB(['forearm.l', 'lowerarm.l', 'elbow.l', '左ひじ', '左肘']) || null;
            if (!refs.rightForeArm) refs.rightForeArm = findB(['forearm.r', 'lowerarm.r', 'elbow.r', '右ひじ', '右肘']) || null;
        }

        // 1. Torso / Caja torácica (ropa) y barrera anti-hundimiento para pechos
        if (refs.spine) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.spine,
                offset: new THREE.Vector3(0, 0.05, -0.03),
                radius: 0.145,
                name: 'chest',
                targetTypes: ['cloth']
            });
            // Barrera de caja torácica anti-hundimiento (garantiza que los pechos NUNCA se hundan dentro del tórax)
            this.colliders.push({
                type: 'sphere',
                bone: refs.spine,
                offset: new THREE.Vector3(0, 0.03, -0.02),
                radius: 0.10,
                name: 'ribcage',
                targetTypes: ['breast']
            });
        }

        // 2. Pelvis / Caderas (da holgura y forma acampanada a la falda/ropa sin colisionar con glúteos propios)
        if (refs.hips) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.hips,
                offset: new THREE.Vector3(0, -0.02, 0),
                radius: 0.165,
                name: 'pelvis',
                targetTypes: ['cloth']
            });
        }

        // 3. Muslo Izquierdo (cápsula con holgura para caída de falda; no empuja glúteos al mover piernas)
        if (refs.leftLeg) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftLeg,
                boneB: refs.leftKnee || refs.leftLeg,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.leftKnee ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, -0.36, 0),
                radius: 0.135,
                name: 'thighL',
                targetTypes: ['cloth']
            });
        }

        // 4. Muslo Derecho
        if (refs.rightLeg) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightLeg,
                boneB: refs.rightKnee || refs.rightLeg,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.rightKnee ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, -0.36, 0),
                radius: 0.135,
                name: 'thighR',
                targetTypes: ['cloth']
            });
        }

        // 5. Pantorrilla Izquierda y Derecha (para faldas o vestidos largos)
        if (refs.leftKnee && refs.leftFoot) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftKnee,
                boneB: refs.leftFoot,
                offset: new THREE.Vector3(0, 0, 0),
                radius: 0.08,
                name: 'calfL',
                targetTypes: ['cloth']
            });
        }
        if (refs.rightKnee && refs.rightFoot) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightKnee,
                boneB: refs.rightFoot,
                offset: new THREE.Vector3(0, 0, 0),
                radius: 0.08,
                name: 'calfR',
                targetTypes: ['cloth']
            });
        }

        // 6. Antebrazos (cápsula continua de codo a muñeca: empuja pechos, trasero, pelo y ropa al cruzar o mover brazos)
        if (refs.leftForeArm) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftForeArm,
                boneB: refs.leftHand || refs.leftForeArm,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.leftHand ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0.2, 0, 0),
                radius: 0.075,
                name: 'forearmL',
                targetTypes: ['breast', 'butt', 'cloth', 'hair']
            });
        }
        if (refs.rightForeArm) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightForeArm,
                boneB: refs.rightHand || refs.rightForeArm,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.rightHand ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(-0.2, 0, 0),
                radius: 0.075,
                name: 'forearmR',
                targetTypes: ['breast', 'butt', 'cloth', 'hair']
            });
        }

        // Función auxiliar para obtener vectores anatómicos de palma y dedos (compatible con MMD, GLTF y Mixamo)
        const getHandVectors = (handBone: THREE.Object3D, isRight: boolean) => {
            let offset = new THREE.Vector3(isRight ? -0.09 : 0.09, 0, 0);
            if (handBone.children && handBone.children.length > 0) {
                const child = handBone.children.find((c: any) => {
                    const ln = c.name.toLowerCase();
                    return ln.includes('middle') || ln.includes('mid') || c.name.includes('中指') ||
                           ln.includes('index') || c.name.includes('人指');
                }) || handBone.children.find((c: any) => (c.isBone || c.type === 'Object3D') && c.position.length() > 0.015);
                
                if (child && child.position.length() > 0.015) {
                    offset.copy(child.position);
                }
            }
            return {
                palmOffset: offset.clone().multiplyScalar(0.55),
                fingerOffset: offset.clone().multiplyScalar(1.20)
            };
        };

        // 7. Manos Dinámicas (Esferas de palma + Cápsulas de dedos: reaccionan al rozar pechos, glúteos, pelo y ropa)
        if (refs.leftHand) {
            const { palmOffset, fingerOffset } = getHandVectors(refs.leftHand, false);
            // Esfera táctil en la palma izquierda
            this.colliders.push({
                type: 'sphere',
                bone: refs.leftHand,
                offset: palmOffset,
                radius: 0.075,
                name: 'handL_palm',
                targetTypes: ['breast', 'butt', 'cloth', 'hair']
            });
            // Cápsula longitudinal que cubre desde la muñeca hasta la punta de los dedos
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftHand,
                boneB: refs.leftHand,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: fingerOffset,
                radius: 0.065,
                name: 'handL_fingers',
                targetTypes: ['breast', 'butt', 'cloth', 'hair']
            });
        }
        if (refs.rightHand) {
            const { palmOffset, fingerOffset } = getHandVectors(refs.rightHand, true);
            // Esfera táctil en la palma derecha
            this.colliders.push({
                type: 'sphere',
                bone: refs.rightHand,
                offset: palmOffset,
                radius: 0.075,
                name: 'handR_palm',
                targetTypes: ['breast', 'butt', 'cloth', 'hair']
            });
            // Cápsula longitudinal que cubre desde la muñeca hasta la punta de los dedos
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightHand,
                boneB: refs.rightHand,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: fingerOffset,
                radius: 0.065,
                name: 'handR_fingers',
                targetTypes: ['breast', 'butt', 'cloth', 'hair']
            });
        }

        // 8. Auto-colisión Pecho-a-Pecho (evita que los pechos se atraviesen entre sí sin repelerlos hacia afuera)
        if (refs.leftBreast) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.leftBreast,
                offset: new THREE.Vector3(0, 0, 0.04),
                radius: 0.035,
                name: 'breastL',
                targetTypes: ['breast']
            });
        }
        if (refs.rightBreast) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.rightBreast,
                offset: new THREE.Vector3(0, 0, 0.04),
                radius: 0.035,
                name: 'breastR',
                targetTypes: ['breast']
            });
        }

        console.log(`🛡️ Jiggle Physics: Configurados ${this.colliders.length} colliders corporales dinámicos`);
    }

    // Inicializar con un modelo 3D
    initialize(model: THREE.Object3D): void {
        this.bones = [];

        model.traverse((child: any) => {
            const isValidNode = child.isBone || child.type === 'Object3D' || child.type === 'Group' || child.isGroup;
            if (isValidNode && !child.isMesh && isJiggleBone(child.name)) {
                const bone = child as THREE.Object3D;
                const boneSettings = { ...this.settings, ...getPhysicsSettings(bone.name) };
                const type = detectBoneType(bone.name);
                const { tipOffset, baseLocalDir, particleRadius } = computeTipOffset(bone, type);

                bone.userData.isJiggleBone = true;
                this.bones.push({
                    bone,
                    originalRotation: bone.rotation.clone(),
                    velocity: new THREE.Vector3(),
                    targetRotation: bone.rotation.clone(),
                    settings: boneSettings as JiggleSettings,
                    type,
                    tipOffset,
                    baseLocalDir,
                    particleRadius
                });
            }
        });

        // Guardar posición inicial del root en espacio mundial
        if (model) {
            model.getWorldPosition(this.lastRootPosition);
        }

        console.log(`🌊 Jiggle Physics: ${this.bones.length} huesos detectados`);
        if (this.bones.length > 0) {
            console.log('  Huesos:', this.bones.map(b => b.bone.name).slice(0, 15).join(', '));
        }
    }

    // Permitir añadir huesos manualmente o actualizar configuración específica
    addBone(bone: THREE.Object3D, settingsOverrides?: Partial<JiggleSettings>): void {
        if (!bone) return;
        bone.userData.isJiggleBone = true;
        // Si ya fue detectado por initialize, actualizar sus settings con la configuración personalizada
        const existing = this.bones.find(b => b.bone.uuid === bone.uuid);
        if (existing) {
            if (settingsOverrides) {
                existing.settings = { ...existing.settings, ...settingsOverrides };
            }
            return;
        }
        
        const boneSettings = { ...this.settings, ...getPhysicsSettings(bone.name), ...settingsOverrides };
        const type = detectBoneType(bone.name);
        const { tipOffset, baseLocalDir, particleRadius } = computeTipOffset(bone, type);
        
        this.bones.push({
            bone,
            originalRotation: bone.rotation.clone(),
            velocity: new THREE.Vector3(),
            targetRotation: bone.rotation.clone(),
            settings: boneSettings as JiggleSettings,
            type,
            tipOffset,
            baseLocalDir,
            particleRadius
        });
        console.log(`🌊 Jiggle Physics: Añadido hueso ${bone.name} (${type})`);
    }

    // Aplicar fuerza externa (ej. interacción del ratón) a huesos específicos
    applyImpulse(boneKeyword: string, force: THREE.Vector3): void {
        const lowerKeyword = boneKeyword.toLowerCase();
        for (const jb of this.bones) {
            if (jb.bone.name.toLowerCase().includes(lowerKeyword) || jb.bone.name.includes(boneKeyword)) {
                jb.velocity.add(force);
            }
        }
    }

    // Actualizar cada frame
    update(delta: number, rootObject?: THREE.Object3D, time?: number): void {
        if (this.bones.length === 0 || delta <= 0) return;

        // 0. Actualizar velocidades lineales de colliders de manos y antebrazos en espacio mundial para transferir impulso de roce
        for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
            const col = this.colliders[cIdx];
            if (col.name.startsWith('hand') || col.name.startsWith('forearm')) {
                col.bone.updateWorldMatrix(true, false);
                col.bone.getWorldPosition(_tempColPos);
                if (!col.lastWorldPos) {
                    col.lastWorldPos = _tempColPos.clone();
                    col.velocity = new THREE.Vector3();
                } else {
                    const safeDt = Math.max(delta, 0.001);
                    col.velocity!.subVectors(_tempColPos, col.lastWorldPos).multiplyScalar(1 / safeDt);
                    col.lastWorldPos.copy(_tempColPos);
                }
            }
        }

        // Calcular viento global basado en el tiempo
        if (time !== undefined) {
            this.windX = Math.sin(time * 1.5) * 0.03 + Math.sin(time * 0.5) * 0.015;
            this.windZ = Math.cos(time * 1.2) * 0.03;
        }

        // Calcular velocidad del root en espacio mundial (para reaccionar con inercia al baile y traslación de caderas)
        let worldScale = 1.0;
        if (rootObject) {
            rootObject.getWorldPosition(this.tempRootWorldPos);
            rootObject.getWorldScale(_tempScale);
            worldScale = _tempScale.y || 1.0;
            this.rootVelocity.subVectors(this.tempRootWorldPos, this.lastRootPosition);
            this.rootVelocity.multiplyScalar(1 / (delta > 0.0001 ? delta : 0.016));
            this.lastRootPosition.copy(this.tempRootWorldPos);
        }

        const globalSettings = this.settings;

        for (const jb of this.bones) {
            const { stiffness, damping, gravity, intensity } = jb.settings || globalSettings;
            
            // Permitir rotación base animada dinámica
            let targetRot = jb.originalRotation;
            if (jb.bone.userData.ikBaseRotation) {
                targetRot = new THREE.Euler().setFromQuaternion(jb.bone.userData.ikBaseRotation);
            }

            // 1. Fuerza de retorno al origen (spring elástico)
            const returnForceX = (targetRot.x - jb.bone.rotation.x) * stiffness;
            const returnForceY = (targetRot.y - jb.bone.rotation.y) * stiffness;
            const returnForceZ = (targetRot.z - jb.bone.rotation.z) * stiffness;

            jb.velocity.x += returnForceX * 25 * intensity;
            jb.velocity.y += returnForceY * 25 * intensity;
            jb.velocity.z += returnForceZ * 25 * intensity;

            // 2. Gravedad en espacio mundial 3D real:
            // Proyectar el vector mundial (0, -1, 0) a los ejes locales del hueso mediante producto cruz
            jb.bone.updateWorldMatrix(true, false);
            jb.bone.getWorldQuaternion(_tempBoneWorldQuat);
            _tempCurrentWorldDir.copy(jb.baseLocalDir).applyQuaternion(_tempBoneWorldQuat);

            // Torque mundial = currentWorldDir × (0, -1, 0)
            _tempWorldGravityTorque.crossVectors(_tempCurrentWorldDir, _worldGravity);

            // Proyectar torque mundial a la base local del hueso
            _tempLocalGravityTorque.copy(_tempWorldGravityTorque).applyQuaternion(_tempBoneWorldQuat.clone().invert());

            jb.velocity.x += _tempLocalGravityTorque.x * gravity * 35 * intensity;
            jb.velocity.y += _tempLocalGravityTorque.y * gravity * 35 * intensity;
            jb.velocity.z += _tempLocalGravityTorque.z * gravity * 35 * intensity;

            // 3. Reacción inercial tridimensional al movimiento real del avatar
            if (this.rootVelocity.lengthSq() > 0.0004) {
                _tempWorldInertia.copy(this.rootVelocity).negate().multiplyScalar(0.04);
                _tempWorldInertiaTorque.crossVectors(_tempCurrentWorldDir, _tempWorldInertia);
                _tempLocalInertiaTorque.copy(_tempWorldInertiaTorque).applyQuaternion(_tempBoneWorldQuat.clone().invert());

                jb.velocity.x += _tempLocalInertiaTorque.x * 25 * intensity;
                jb.velocity.y += _tempLocalInertiaTorque.y * 25 * intensity;
                jb.velocity.z += _tempLocalInertiaTorque.z * 25 * intensity;
            }

            // 4. Efecto suave de brisa / viento
            if (time !== undefined) {
                jb.velocity.x += this.windX * 0.05 * intensity;
                jb.velocity.z += this.windZ * 0.05 * intensity;
            }

            // 5. Damping (fricción exponencial estable independiente de fps)
            const dampFactor = Math.pow(damping, delta * 60);
            jb.velocity.multiplyScalar(dampFactor);

            // 6. Integrar velocidad a la rotación
            jb.bone.rotation.x += jb.velocity.x * delta;
            jb.bone.rotation.y += jb.velocity.y * delta;
            jb.bone.rotation.z += jb.velocity.z * delta;

            // Límites angulares para evitar deformaciones no deseadas
            const limitAngle = jb.settings?.maxAngle || (Math.PI / 2.2); 
            jb.bone.rotation.x = THREE.MathUtils.clamp(
                jb.bone.rotation.x,
                targetRot.x - limitAngle,
                targetRot.x + limitAngle
            );
            jb.bone.rotation.y = THREE.MathUtils.clamp(
                jb.bone.rotation.y,
                targetRot.y - limitAngle,
                targetRot.y + limitAngle
            );
            jb.bone.rotation.z = THREE.MathUtils.clamp(
                jb.bone.rotation.z,
                targetRot.z - limitAngle,
                targetRot.z + limitAngle
            );

            // Sincronizar quaternion con la rotación integrada antes de colisiones
            jb.bone.quaternion.setFromEuler(jb.bone.rotation);

            // ── FASE 2: RESOLUCIÓN DE COLISIONES CON EL CUERPO Y MANOS ──
            if (this.colliders.length > 0) {
                jb.bone.updateWorldMatrix(true, false);
                jb.bone.getWorldPosition(_tempOrigin);

                // Posición mundial del tip/superficie del hueso jiggle
                _tempTip.copy(jb.tipOffset);
                jb.bone.localToWorld(_tempTip);
                _tempPushedTip.copy(_tempTip);

                let collided = false;
                _tempColliderNormal.set(0, 0, 0);
                let maxContactVelocity: THREE.Vector3 | null = null;
                let maxContactSpeedSq = 0;

                for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
                    const col = this.colliders[cIdx];

                    // No colisionar contra uno mismo
                    if (col.bone === jb.bone || (col.boneB && col.boneB === jb.bone)) continue;

                    // Filtrar si este collider aplica al tipo de hueso
                    if (!col.targetTypes.includes('all') && !col.targetTypes.includes(jb.type as any)) continue;

                    const effectiveRadius = col.radius * worldScale;
                    const minDist = effectiveRadius + jb.particleRadius;

                    if (col.type === 'sphere') {
                        col.bone.updateWorldMatrix(true, false);
                        _tempColliderCenter.copy(col.offset);
                        col.bone.localToWorld(_tempColliderCenter);

                        _tempToTip.subVectors(_tempPushedTip, _tempColliderCenter);
                        const distSq = _tempToTip.lengthSq();

                        if (distSq < minDist * minDist) {
                            const dist = Math.sqrt(distSq);
                            const normal = dist > 0.0001 ? _tempToTip.divideScalar(dist) : _tempFallbackNormal.set(0, 0, 1);
                            _tempPushedTip.copy(_tempColliderCenter).addScaledVector(normal, minDist);
                            _tempColliderNormal.copy(normal);
                            collided = true;

                            if (col.velocity) {
                                const spd = col.velocity.lengthSq();
                                if (spd > maxContactSpeedSq) {
                                    maxContactSpeedSq = spd;
                                    maxContactVelocity = col.velocity;
                                }
                            }
                        }
                    } else if (col.type === 'capsule' && col.boneB) {
                        col.bone.updateWorldMatrix(true, false);
                        col.boneB.updateWorldMatrix(true, false);

                        _tempPA.copy(col.offset);
                        col.bone.localToWorld(_tempPA);

                        _tempPB.copy(col.offsetB || _tempZero);
                        col.boneB.localToWorld(_tempPB);

                        _tempAB.subVectors(_tempPB, _tempPA);
                        const abLenSq = _tempAB.lengthSq();

                        let t = 0;
                        if (abLenSq > 0.0001) {
                            _tempAP.subVectors(_tempPushedTip, _tempPA);
                            t = THREE.MathUtils.clamp(_tempAP.dot(_tempAB) / abLenSq, 0, 1);
                        }
                        _tempClosest.copy(_tempPA).addScaledVector(_tempAB, t);

                        _tempToTip.subVectors(_tempPushedTip, _tempClosest);
                        const distSq = _tempToTip.lengthSq();

                        if (distSq < minDist * minDist) {
                            const dist = Math.sqrt(distSq);
                            const normal = dist > 0.0001 ? _tempToTip.divideScalar(dist) : _tempFallbackNormal.set(0, 1, 0);
                            _tempPushedTip.copy(_tempClosest).addScaledVector(normal, minDist);
                            _tempColliderNormal.copy(normal);
                            collided = true;

                            if (col.velocity) {
                                const spd = col.velocity.lengthSq();
                                if (spd > maxContactSpeedSq) {
                                    maxContactSpeedSq = spd;
                                    maxContactVelocity = col.velocity;
                                }
                            }
                        }
                    }
                }

                // Si hubo colisión, rotar el hueso para que su tip se alinee con pushedTip
                if (collided) {
                    _tempWorldTargetDir.subVectors(_tempPushedTip, _tempOrigin);
                    if (_tempWorldTargetDir.lengthSq() > 0.0001) {
                        _tempWorldTargetDir.normalize();

                        let localTargetDir: THREE.Vector3;
                        if (jb.bone.parent) {
                            jb.bone.parent.updateWorldMatrix(true, false);
                            jb.bone.parent.getWorldQuaternion(_tempParentQuat);
                            _tempParentQuat.invert();
                            localTargetDir = _tempWorldTargetDir.applyQuaternion(_tempParentQuat);
                        } else {
                            localTargetDir = _tempWorldTargetDir;
                        }

                        if (localTargetDir.lengthSq() > 0.0001) {
                            localTargetDir.normalize();
                            _tempCorrectionQuat.setFromUnitVectors(jb.baseLocalDir, localTargetDir);
                            
                            // Mezclar suavemente la rotación corregida por colisión (0.45 para amortiguación elástica sin rebotes bruscos)
                            jb.bone.quaternion.slerp(_tempCorrectionQuat, 0.45);

                            // CRÍTICO: Sincronizar rotation desde quaternion para que Three.js no descarte la colisión en el frame
                            jb.bone.rotation.setFromQuaternion(jb.bone.quaternion);

                            // Amortiguar velocidad en la dirección de la colisión y reducir velocidad residual para evitar vibración ("tiritar")
                            const velDot = jb.velocity.dot(_tempColliderNormal);
                            if (velDot < 0) {
                                jb.velocity.sub(_tempColliderNormal.multiplyScalar(velDot * 1.2));
                            }
                            jb.velocity.multiplyScalar(0.92);

                            // ── EFECTO DE ROCE DINÁMICO DE MANOS / BRAZOS ──
                            // Si la mano o antebrazo venía moviéndose, transferir impulso físico al hueso para que reaccione y rebote
                            if (maxContactVelocity && maxContactSpeedSq > 0.002) {
                                _tempBrushImpulse.copy(maxContactVelocity).multiplyScalar(0.040);
                                _tempBrushImpulse.addScaledVector(_tempColliderNormal, 0.030);
                                _tempBrushImpulse.clampLength(0, 0.85);

                                _tempLocalBrushImpulse.copy(_tempBrushImpulse).applyQuaternion(_tempBoneWorldQuat.clone().invert());
                                jb.velocity.x += _tempLocalBrushImpulse.x * 32;
                                jb.velocity.y += _tempLocalBrushImpulse.y * 32;
                                jb.velocity.z += _tempLocalBrushImpulse.z * 32;
                            }
                        }
                    }
                }
            }
        }
    }

    // Obtener cantidad de huesos detectados
    getBoneCount(): number {
        return this.bones.length;
    }

    // Obtener nombres de huesos
    getBoneNames(): string[] {
        return this.bones.map(b => b.bone.name);
    }

    // Actualizar configuración
    updateSettings(settings: Partial<JiggleSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }
}
