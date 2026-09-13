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
    type: 'breast' | 'butt' | 'hair' | 'other';
    tipOffset: THREE.Vector3;
    baseLocalDir: THREE.Vector3;
    particleRadius: number;
    anchorBone?: THREE.Object3D | null;
    lastParentWorldQuat?: THREE.Quaternion;
    lastParentWorldPos?: THREE.Vector3;
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
    targetTypes: Array<'breast' | 'butt' | 'hair' | 'all'>;
    lastWorldPos?: THREE.Vector3;
    velocity?: THREE.Vector3;
}

export interface BodyColliderRefs {
    head?: THREE.Object3D | null;
    neck?: THREE.Object3D | null;
    spine?: THREE.Object3D | null;
    hips?: THREE.Object3D | null;
    leftUpperArm?: THREE.Object3D | null;
    rightUpperArm?: THREE.Object3D | null;
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

// Patrones de nombres de huesos que deben tener jiggle (Pelo, Pechos y Trasero ÚNICAMENTE)
// EXCLUIR absolutamente toda prenda (faldas, vestidos, ropa interior, corsés, mangas, etc.) para evitar desmembramiento
const JIGGLE_PATTERNS = [
    // Pechos (inglés, japonés PMX, chino Genshin, español)
    'breast', 'boob', 'oppai', 'bust', 'pai', 'pecho', 'sen', 'mune', '胸',
    // Trasero / Glúteos (inglés, japonés PMX, chino Genshin, español)
    'ass', 'butt', 'glute', 'shiri', 'buttock', '尻', '臀', '屁股',
    // Pelo / Colas / Mechones (inglés, japonés PMX, chino Genshin)
    'hair', 'tail', 'ponytail', 'twintail', 'kaminoke', 'bangs', 'fringe', 'strand',
    'ahoge', 'pigtail', 'braid', 'sidelock', 'front_hair', 'back_hair', 'side_hair',
    '髪', '前髪', '後髪', '横髪', 'ツインテ', 'ポニテ', 'アホ毛',
    '头发', '前发', '后发', '发', '辮'
];

// Huesos estructurales, ropa exterior/interior, faldas y accesorios que NUNCA deben tener jiggle ni colisión
const STRUCTURAL_EXCLUDES = [
    'spine', 'torso', 'neck', 'head', 'pelvis', 'hips',
    'thigh', 'calf', 'shin', 'leg', 'foot', 'toe', 'knee', 'ankle',
    'arm', 'forearm', 'upperarm', 'lowerarm', 'hand', 'finger', 'shoulder', 'wrist', 'elbow', 'clavicle',
    'thumb', 'index', 'middle', 'ring', 'pinky', 'little',
    'eye', 'jaw', 'tongue', 'root', 'center', 'groove',
    // Ropa exterior, faldas, vestidos, corsés, mangas, cinturones y accesorios textiles que NUNCA deben separarse del cuerpo:
    'skirt', 'dress', 'cloth', 'clothes', 'clothing', 'outfit', 'suit', 'pants', 'shorts', 'bottom', 'top',
    'corset', 'sleeve', 'belt', 'collar', 'pin', 'clip', 'tiara', 'accessory', 'ornament', 'coat', 'cape',
    'hairpin', 'hairclip', 'barrette', 'comb', 'headband', 'earring', 'pierce', 'jewel', 'jewelry', 'brooch',
    'feather', 'veil', 'ribbon', 'ribbon_pin', 'head_ornament', 'bow', 'bowknot', 'curtain', 'frill', 'streamer', 'apron', 'hem',
    'falda', 'vestido', 'ropa', 'camisa', 'manga', 'lazo',
    'スカート', '裾', 'ドレス', 'ワンピース', 'ワンピ', '服', '衣服', '上衣', '外套', '衣装', 'コルセット', '袖', '帯', '腰带', '腰饰', '胸饰', '发饰', '饰品', '背饰', 'マント',
    'リボン', 'フリル', '紐', 'ヒモ', '布', 'ネクタイ',
    '裙', '裙摆', '裙子', '前裙', '后裙', '左裙', '右裙', '短裙', '长裙', '百褶裙', '下摆', '下擺', '前摆', '前擺', '后摆', '後擺', '飘带', '飄帶',
    // Ropa interior y lencería (protegida para no flotar ni desprenderse)
    'underwear', 'bra', 'brassiere', 'panty', 'panties', 'thong', 'lingerie', 'bikini', 'swimsuit', 'shitagi',
    'sujetador', 'braga', 'bragas', 'calzon',
    '下着', 'パンツ', 'ブラ', '内衣', '文胸', '胸罩', '内裤', '胖次', '安全裤', '泳装', '泳衣', '比基尼',
    '髪飾り', '髪留め', '髪ピン', 'ヘアピン', 'ヘアクリップ', 'ヘアアクセ', 'かんざし', '簪', '発条',
    'イヤリング', 'ピアス', '耳飾', '耳飾り', 'カチューシャ', 'ティアラ', 'クラウン', '冠', 'ベール', '羽飾',
    '发夹', '发卡', '发簪', '发饰', '头饰', '耳饰',
    // Armas, filos, pistolas, props y accesorios que nunca deben tener jiggle:
    'weapon', 'knife', 'blade', 'sword', 'gun', 'dagger', 'shield', 'bow', 'arrow', 'sheath', 'holster', 'secondary', 'prop', 'item', 'asset',
    // Protección absoluta para nombres estructurales en japonés y chino:
    '足', 'ひざ', '膝', '足首', 'つま先', '腿', '下半身', '上半身', 'センター', 'グルーブ', '全ての親', '腕', '手首', 'ひじ', '肘', '肩'
];

// Configuración de rebote por tipo (User requested: Ropa 50% soft, Jiggle 80% soft, Pelo orgánico multicapa)
export function getPhysicsSettings(boneName: string, bone?: THREE.Object3D): Partial<JiggleSettings> {
    const n = boneName.toLowerCase();
    const raw = boneName;

    // Pechos: viaje visible, sag leve, 1–2 rebotes y se apagan
    const isBreast = n.includes('breast') || n.includes('boob') || n.includes('oppai') ||
        n.includes('bust') || n.includes('mune') || raw.includes('胸') || n.includes('pecho');
    if (isBreast) return {
        stiffness: 0.28,
        damping: 0.64,
        gravity: 0.16,
        intensity: 0.95,
        maxAngle: Math.PI / 12
    };

    // Glúteos: más firmes, menos sag, menos viaje. Nunca copiar el preset del pecho.
    const isButt = (n.includes('butt') || n.includes('glute') || n.includes('buttock') || n.includes('buttcheek') ||
        n.includes('shiri') || raw.includes('尻') || raw.includes('臀') || raw.includes('屁股') || n.includes('trasero') ||
        (/(?:^|[._\-\s])ass(?:$|[._\-\s\d])/i.test(n) && !n.includes('passive') && !n.includes('assault'))) &&
        !n.includes('pelvis') && !n.includes('hip') && !n.includes('thigh') && !n.includes('leg');
    if (isButt) return {
        stiffness: 0.42,
        damping: 0.72,
        gravity: 0.06,
        intensity: 0.70,
        maxAngle: Math.PI / 16
    };

    if (isActualEarBone(n)) return { stiffness: 0.35, damping: 0.65, gravity: 0, maxAngle: Math.PI / 4 };

    // Pelo físico (japonés, chino o inglés: jerarquía realista con caída fluida, puntas elásticas y flequillo controlado)
    const isHair = n.includes('hair') || n.includes('tail') || n.includes('ponytail') ||
        n.includes('bangs') || n.includes('strand') || n.includes('kaminoke') ||
        raw.includes('髪') || raw.includes('发') || raw.includes('辮') ||
        n.includes('pigtail') || n.includes('braid') || n.includes('twintail') ||
        n.includes('ahoge') || raw.includes('アホ毛');

    if (isHair) {
        // 1. Flequillo / Bangs / Fringe (Pelo frontal: rebote suave sin meterse en la frente ni tapar ojos)
        const isBangs = n.includes('bang') || n.includes('fringe') || raw.includes('前髪') || raw.includes('前发');
        if (isBangs) {
            return {
                stiffness: 0.20,
                damping: 0.90,
                gravity: 0.008,
                intensity: 0.90,
                maxAngle: Math.PI / 7.0 // ~25.7 grados máximo para estabilidad absoluta frente al rostro
            };
        }

        // Calcular profundidad en la cadena del mechón (0 = raíz unida al cráneo, 1 = mid, 2+ = punta/largo)
        let chainDepth = 0;
        let p = bone?.parent;
        while (p && (p.userData?.isJiggleBone || isJiggleBone(p.name) || p.name.toLowerCase().includes('hair') || p.name.includes('髪') || p.name.includes('发'))) {
            chainDepth++;
            p = p.parent;
        }

        // 2. Colas largas / Coletas / Pelo trasero o cadenas profundas (Ponytail, Twintail, Back hair)
        const isLongHairName = n.includes('tail') || n.includes('ponytail') || n.includes('twintail') ||
            n.includes('back') || n.includes('long') || raw.includes('後髪') || raw.includes('后发') || raw.includes('ツインテ') || raw.includes('ポニテ');
        const isLongHair = isLongHairName || chainDepth >= 2;

        // 3. Posición en la cadena jerárquica del mechón
        // Puntas / Terminales (Tip / End / 先 / Números altos): peso fluido y alto arrastre aerodinámico (evita espirales y latigazos)
        const isTip = n.includes('end') || n.includes('tip') || n.includes('nub') || raw.includes('先') ||
            n.endsWith('_03') || n.endsWith('_04') || n.endsWith('_05') || n.endsWith('_3') || n.endsWith('_4') ||
            (bone && (!bone.children || bone.children.filter((c: any) => c.isBone || c.type === 'Object3D').length === 0));

        if (isTip) {
            return {
                stiffness: isLongHair ? 0.20 : 0.22,
                damping: isLongHair ? 0.95 : 0.90, // Alto drag aerodinámico: amortigua sacudidas en pelo largo
                gravity: isLongHair ? 0.022 : 0.012, // Peso descendente continuo para mantenerlo cayendo hacia abajo
                intensity: isLongHair ? 0.85 : 0.95,
                maxAngle: isLongHair ? (Math.PI / 6.0) : (Math.PI / 5.0) // ~30° máx en pelo largo (evita que se enrolle)
            };
        }

        // Huesos intermedios del mechón (Mid): amortiguación progresiva
        const isMid = chainDepth > 0 || n.includes('002') || n.includes('02') || n.includes('mid') || n.includes('_2') ||
            (bone && bone.children && bone.children.some((c: any) => c.isBone || c.type === 'Object3D'));

        if (isMid) {
            return {
                stiffness: isLongHair ? 0.24 : 0.25,
                damping: isLongHair ? 0.93 : 0.90,
                gravity: isLongHair ? 0.018 : 0.012,
                intensity: isLongHair ? 0.88 : 0.95,
                maxAngle: isLongHair ? (Math.PI / 7.0) : (Math.PI / 5.5) // ~25.7° máx
            };
        }

        // Raíz del mechón (Root / Base / 001 / depth 0): ancla firme cerca del cráneo para estructura y sostén
        return {
            stiffness: 0.28,
            damping: 0.92,
            gravity: 0.012,
            intensity: 0.90,
            maxAngle: Math.PI / 8.0 // ~22.5° máx: previene despegue o separación brusca de la cabeza
        };
    }

    return { stiffness: 0.20, damping: 0.88, gravity: 0.015, intensity: 1.0, maxAngle: Math.PI / 4 };
}

function isActualEarBone(lowerName: string): boolean {
    return /(?:^|[^a-z])ear(?:$|[^a-z]|l|r|_|\.)/i.test(lowerName) ||
        lowerName.includes('catear') || lowerName.includes('foxear') || lowerName.includes('bunnyeart') ||
        lowerName.startsWith('ear') || lowerName.endsWith('ear');
}

// Detectar si un hueso es de tipo jiggle
export function isJiggleBone(boneName: string): boolean {
    const lower = boneName.toLowerCase();

    const isSafeAss = (/(?:^|[._\-\s])ass(?:$|[._\-\s\d])/i.test(lower) || lower === 'ass') &&
        !lower.includes('passive') && !lower.includes('assault') && !lower.includes('glass') &&
        !lower.includes('grass') && !lower.includes('bass') && !lower.includes('class') &&
        !lower.includes('compass') && !lower.includes('mass') && !lower.includes('asset') &&
        !lower.includes('assist');

    // 1. Detectar si coincide con algún patrón de rebote (pelo, pechos, glúteos, orejas)
    const matchesPattern = JIGGLE_PATTERNS.some(pattern => {
        if (pattern === 'ass') return isSafeAss;
        const isKanji = /[^\x00-\x7F]/.test(pattern);
        return isKanji ? boneName.includes(pattern) : lower.includes(pattern);
    }) || isActualEarBone(lower);

    if (!matchesPattern) return false;

    // 2. Proteger huesos de pechos y glúteos contra falsos positivos estructurales
    const isTrueBreast = lower.includes('breast') || lower.includes('boob') || lower.includes('oppai') ||
        lower.includes('bust') || lower.includes('mune') || boneName.includes('胸');

    const isTrueButt = isSafeAss || lower.includes('butt') || lower.includes('glute') ||
        lower.includes('shiri') || boneName.includes('尻') || boneName.includes('臀') ||
        ((lower.includes('pelvis') || lower.includes('hip')) && (lower.includes('.l') || lower.includes('.r') || lower.includes('_l') || lower.includes('_r') || boneName.includes('左') || boneName.includes('右')));

    // 3. Excluir extremidades mayores, huesos estructurales y toda prenda/falda
    for (const pattern of STRUCTURAL_EXCLUDES) {
        const isKanji = /[^\x00-\x7F]/.test(pattern);
        const hasMatch = isKanji ? boneName.includes(pattern) : lower.includes(pattern);
        if (hasMatch) {
            if (isTrueBreast && (pattern === 'chest' || pattern === 'torso' || pattern === '上半身')) {
                continue;
            }
            if (isTrueButt && (pattern === 'pelvis' || pattern === 'hips')) {
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

// Detectar tipo semántico de hueso (Pechos, Glúteos, Cabello)
export function detectBoneType(boneName: string): 'breast' | 'butt' | 'hair' | 'other' {
    const n = boneName.toLowerCase();
    const raw = boneName;
    if (n.includes('breast') || n.includes('boob') || n.includes('oppai') || n.includes('bust') || n.includes('mune') || raw.includes('胸') || n.includes('pecho')) {
        return 'breast';
    }
    const isSafeAss = (/(?:^|[._\-\s])ass(?:$|[._\-\s\d])/i.test(n) || n === 'ass') &&
        !n.includes('passive') && !n.includes('assault') && !n.includes('glass') &&
        !n.includes('grass') && !n.includes('bass') && !n.includes('class') &&
        !n.includes('compass') && !n.includes('mass') && !n.includes('asset') &&
        !n.includes('assist');
    const isUnilateralPelvis = (n.includes('pelvis') || n.includes('hip')) &&
        (n.includes('.l') || n.includes('.r') || n.includes('_l') || n.includes('_r') || raw.includes('左') || raw.includes('右'));
    if (isSafeAss || n.includes('butt') || n.includes('glute') || n.includes('shiri') || raw.includes('尻') || raw.includes('臀') || raw.includes('屁股') || n.includes('trasero') || isUnilateralPelvis) {
        return 'butt';
    }
    if (n.includes('hair') || n.includes('tail') || n.includes('ponytail') || n.includes('bangs') || n.includes('strand') || n.includes('kaminoke') || raw.includes('髪') || raw.includes('发') || raw.includes('辮')) {
        return 'hair';
    }
    return 'other';
}

function computeTipOffset(bone: THREE.Object3D, type: 'breast' | 'butt' | 'hair' | 'other'): { tipOffset: THREE.Vector3, baseLocalDir: THREE.Vector3, particleRadius: number } {
    let tipOffset = new THREE.Vector3();
    let particleRadius = 0.05;

    // Si tiene un hueso hijo, la dirección exacta al hijo es el tip natural
    if (bone.children && bone.children.length > 0) {
        const childBone = bone.children.find((c: any) => c.isBone || c.type === 'Object3D') as THREE.Object3D | undefined;
        if (childBone && childBone.position.length() > 0.02) {
            tipOffset.copy(childBone.position);
            particleRadius = (type === 'breast' || type === 'butt') ? 0.065 : 0.035;
            return {
                tipOffset,
                baseLocalDir: tipOffset.clone().normalize(),
                particleRadius
            };
        }
    }

    // Si es un hueso hoja (sin hijos, ej. pechos o mechón terminal)
    bone.updateWorldMatrix(true, false);
    const boneWorldPos = new THREE.Vector3();
    bone.getWorldPosition(boneWorldPos);

    let worldForwardDir = new THREE.Vector3(0, 0, 0.09); // Pechos: hacia adelante
    if (type === 'breast') {
        particleRadius = 0.065;
        worldForwardDir.set(0, 0.01, 0.085);
    } else if (type === 'butt') {
        particleRadius = 0.065; // Idéntico a los pechos para la misma sensación de masa y colisión
        worldForwardDir.set(0, -0.01, -0.085); // Hacia atrás simétrico con los pechos
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
const _tempMid = new THREE.Vector3();
const _tempPushedTip = new THREE.Vector3();
const _tempColliderCenter = new THREE.Vector3();
const _tempToTip = new THREE.Vector3();
const _tempToMid = new THREE.Vector3();
const _tempFallbackNormal = new THREE.Vector3(0, 0, 1);
const _tempColliderNormal = new THREE.Vector3();
const _tempPA = new THREE.Vector3();
const _tempPB = new THREE.Vector3();
const _tempAB = new THREE.Vector3();
const _tempAP = new THREE.Vector3();
const _tempAPMid = new THREE.Vector3();
const _tempClosest = new THREE.Vector3();
const _tempClosestMid = new THREE.Vector3();
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
const _tempWorldDeltaQuat = new THREE.Quaternion();
const _tempNewWorldQuat = new THREE.Quaternion();

// Vectores para seguimiento de rotación angular del padre (giro de cabeza / cuello)
const _tempParentWorldQuat = new THREE.Quaternion();
const _tempParentWorldPos = new THREE.Vector3();
const _tempDeltaQuat = new THREE.Quaternion();
const _tempParentLastInvQuat = new THREE.Quaternion();
const _tempParentAngVel = new THREE.Vector3();
const _tempParentLinVel = new THREE.Vector3();
const _tempWorldAngInertia = new THREE.Vector3();
const _tempLocalAngInertia = new THREE.Vector3();

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

    // Configurar colliders corporales dinámicos (cabeza, rostro, cuello, hombros, espalda, brazos y piernas para pelo largo)
    setupBodyColliders(refs: BodyColliderRefs, model?: THREE.Object3D): void {
        this.colliders = [];

        // Fallbacks automáticos exhaustivos si alguna referencia no vino explícita (soporte MMD/PMX, Mixamo, VRM, GLTF)
        if (model) {
            const allBones = model.getObjectsByProperty('isBone', true) as THREE.Bone[];
            const findB = (patterns: string[]) => allBones.find(b => {
                const ln = b.name.toLowerCase();
                return patterns.some(p => ln.includes(p) || b.name.includes(p));
            });

            if (!refs.head) refs.head = findB(['head', 'def-head', 'org-head', 'j_bip_c_head', 'mixamorighead', '頭', 'crane']) || null;
            if (!refs.neck) refs.neck = findB(['neck', 'def-neck', 'org-neck', 'j_bip_c_neck', '首']) || null;
            if (!refs.spine) refs.spine = findB(['spine.001', 'spine', 'def-spine', 'upper_chest', '上半身', '上半身2']) || null;
            if (!refs.hips) refs.hips = findB(['hips', 'def-hips', 'pelvis', 'lower_body', '下半身', '腰', 'センター']) || null;
            if (!refs.leftUpperArm) refs.leftUpperArm = findB(['upperarm.l', 'upperarm_l', 'arm.l', 'left arm', 'leftarm', '左腕']) || null;
            if (!refs.rightUpperArm) refs.rightUpperArm = findB(['upperarm.r', 'upperarm_r', 'arm.r', 'right arm', 'rightarm', '右腕']) || null;
            if (!refs.leftLeg) refs.leftLeg = findB(['thigh.l', 'thigh_l', 'upleg.l', 'left up leg', '左足', '左足d']) || null;
            if (!refs.rightLeg) refs.rightLeg = findB(['thigh.r', 'thigh_r', 'upleg.r', 'right up leg', '右足', '右足d']) || null;
            if (!refs.leftKnee) refs.leftKnee = findB(['shin.l', 'knee.l', 'calf.l', 'left leg', '左ひざ', '左膝', '左ひざd', '左膝d']) || null;
            if (!refs.rightKnee) refs.rightKnee = findB(['shin.r', 'knee.r', 'calf.r', 'right leg', '右ひざ', '右膝', '右ひざd', '右膝d']) || null;
            if (!refs.leftFoot) refs.leftFoot = findB(['foot.l', 'foot_l', 'ankle.l', 'left foot', '左足首', '左足']) || null;
            if (!refs.rightFoot) refs.rightFoot = findB(['foot.r', 'foot_r', 'ankle.r', 'right foot', '右足首', '右足']) || null;
            if (!refs.leftHand) refs.leftHand = findB(['hand.l', 'hand_l', 'wrist.l', 'left hand', '左手首', '左手']) || null;
            if (!refs.rightHand) refs.rightHand = findB(['hand.r', 'hand_r', 'wrist.r', 'right hand', '右手首', '右手']) || null;
            if (!refs.leftForeArm) refs.leftForeArm = findB(['forearm.l', 'lowerarm.l', 'elbow.l', '左ひじ', '左肘']) || null;
            if (!refs.rightForeArm) refs.rightForeArm = findB(['forearm.r', 'lowerarm.r', 'elbow.r', '右ひじ', '右肘']) || null;
            if (!refs.leftBreast) refs.leftBreast = findB(['breast.l', 'breast_l', 'bust.l', 'boob.l', '左胸']) || null;
            if (!refs.rightBreast) refs.rightBreast = findB(['breast.r', 'breast_r', 'bust.r', 'boob.r', '右胸']) || null;
        }

        // 0. Cráneo y Cabeza (impide que mechones superiores y posteriores penetren en el cráneo)
        if (refs.head) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.head,
                offset: new THREE.Vector3(0, 0.05, -0.01),
                radius: 0.125,
                name: 'head_skull',
                targetTypes: ['hair']
            });
            // Rostro / Frente / Nariz (impide que el flequillo o mechones frontales se metan en los ojos o cara)
            this.colliders.push({
                type: 'sphere',
                bone: refs.head,
                offset: new THREE.Vector3(0, 0.01, 0.075),
                radius: 0.110,
                name: 'head_face',
                targetTypes: ['hair']
            });
        }

        // 1. Cuello (impide que mechones de pelo se metan en la garganta/cuello)
        const neckBone = refs.neck || refs.head;
        if (neckBone) {
            this.colliders.push({
                type: 'sphere',
                bone: neckBone,
                offset: refs.neck ? new THREE.Vector3(0, 0.02, 0) : new THREE.Vector3(0, -0.06, 0),
                radius: 0.095,
                name: 'neck_col',
                targetTypes: ['hair']
            });
        }

        // 2. Torso, Hombros y Espalda (exclusivo para deslizar pelo largo, NUNCA empujar ropa)
        if (refs.spine) {
            // Torso frontal (pelo largo que cae por delante)
            this.colliders.push({
                type: 'sphere',
                bone: refs.spine,
                offset: new THREE.Vector3(0, 0.04, 0.02),
                radius: 0.155,
                name: 'chest',
                targetTypes: ['hair']
            });
            // Hombros (deslizamiento natural del pelo sobre la clavícula y hombros)
            this.colliders.push({
                type: 'sphere',
                bone: refs.spine,
                offset: new THREE.Vector3(0, 0.13, 0.00),
                radius: 0.160,
                name: 'shoulders_hair',
                targetTypes: ['hair']
            });
            // Espalda / Omóplatos (CRÍTICO: impide que el pelo largo se meta dentro de la espalda)
            this.colliders.push({
                type: 'sphere',
                bone: refs.spine,
                offset: new THREE.Vector3(0, 0.03, -0.075),
                radius: 0.165,
                name: 'torso_back',
                targetTypes: ['hair']
            });
        }

        // 3. Senos / Pechos (repelente de superficie para que el pelo largo se deslice por encima sin meterse dentro)
        if (refs.leftBreast) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.leftBreast,
                offset: new THREE.Vector3(0, 0, 0.03),
                radius: 0.075,
                name: 'breastL_surface',
                targetTypes: ['hair']
            });
        }
        if (refs.rightBreast) {
            this.colliders.push({
                type: 'sphere',
                bone: refs.rightBreast,
                offset: new THREE.Vector3(0, 0, 0.03),
                radius: 0.075,
                name: 'breastR_surface',
                targetTypes: ['hair']
            });
        }

        // 4. Brazos Superiores (Bíceps/Hombro: colisión con pechos, glúteos y pelo)
        if (refs.leftUpperArm) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftUpperArm,
                boneB: refs.leftForeArm || refs.leftUpperArm,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.leftForeArm ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0.22, 0, 0),
                radius: 0.085,
                name: 'upperArmL',
                targetTypes: ['breast', 'butt', 'hair']
            });
        }
        if (refs.rightUpperArm) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightUpperArm,
                boneB: refs.rightForeArm || refs.rightUpperArm,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.rightForeArm ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(-0.22, 0, 0),
                radius: 0.085,
                name: 'upperArmR',
                targetTypes: ['breast', 'butt', 'hair']
            });
        }

        // 5. Antebrazos (cápsula continua de codo a muñeca: colisión con pechos, glúteos y pelo)
        if (refs.leftForeArm) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftForeArm,
                boneB: refs.leftHand || refs.leftForeArm,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.leftHand ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0.2, 0, 0),
                radius: 0.075,
                name: 'forearmL',
                targetTypes: ['breast', 'butt', 'hair']
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
                targetTypes: ['breast', 'butt', 'hair']
            });
        }

        // Función auxiliar para vectores anatómicos de manos
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

        // 6. Manos Dinámicas (Esferas de palma + Cápsulas de dedos: colisión completa con pechos, trasero y pelo)
        if (refs.leftHand) {
            const { palmOffset, fingerOffset } = getHandVectors(refs.leftHand, false);
            this.colliders.push({
                type: 'sphere',
                bone: refs.leftHand,
                offset: palmOffset,
                radius: 0.075,
                name: 'handL_palm',
                targetTypes: ['breast', 'butt', 'hair']
            });
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftHand,
                boneB: refs.leftHand,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: fingerOffset,
                radius: 0.065,
                name: 'handL_fingers',
                targetTypes: ['breast', 'butt', 'hair']
            });
        }
        if (refs.rightHand) {
            const { palmOffset, fingerOffset } = getHandVectors(refs.rightHand, true);
            this.colliders.push({
                type: 'sphere',
                bone: refs.rightHand,
                offset: palmOffset,
                radius: 0.075,
                name: 'handR_palm',
                targetTypes: ['breast', 'butt', 'hair']
            });
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightHand,
                boneB: refs.rightHand,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: fingerOffset,
                radius: 0.065,
                name: 'handR_fingers',
                targetTypes: ['breast', 'butt', 'hair']
            });
        }

        // 7. Pelvis, Caderas y Glúteos (protección para pelo largo)
        if (refs.hips) {
            // Pelvis central (sólo pelo largo; la ropa/falda se origina en la pelvis y no debe ser expulsada de su ancla)
            this.colliders.push({
                type: 'sphere',
                bone: refs.hips,
                offset: new THREE.Vector3(0, -0.02, 0),
                radius: 0.160,
                name: 'pelvis',
                targetTypes: ['hair']
            });
            // Glúteos / Cadera posterior (sólo pelo largo por detrás)
            this.colliders.push({
                type: 'sphere',
                bone: refs.hips,
                offset: new THREE.Vector3(0, -0.05, -0.085),
                radius: 0.150,
                name: 'glute_back',
                targetTypes: ['hair']
            });
            // Abdomen frontal inferior (sólo pelo largo por delante)
            this.colliders.push({
                type: 'sphere',
                bone: refs.hips,
                offset: new THREE.Vector3(0, -0.04, 0.065),
                radius: 0.140,
                name: 'pelvis_front',
                targetTypes: ['hair']
            });
        }

        // 8. Muslos (cápsulas calibradas para pelo largo que cae sobre las piernas)
        if (refs.leftLeg) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftLeg,
                boneB: refs.leftKnee || refs.leftLeg,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.leftKnee ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, -0.36, 0),
                radius: 0.075,
                name: 'thighL',
                targetTypes: ['hair']
            });
        }
        if (refs.rightLeg) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightLeg,
                boneB: refs.rightKnee || refs.rightLeg,
                offset: new THREE.Vector3(0, 0, 0),
                offsetB: refs.rightKnee ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(0, -0.36, 0),
                radius: 0.075,
                name: 'thighR',
                targetTypes: ['hair']
            });
        }

        // 9. Pantorrillas (para pelo extra largo que desciende hasta los tobillos)
        if (refs.leftKnee && refs.leftFoot) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.leftKnee,
                boneB: refs.leftFoot,
                offset: new THREE.Vector3(0, 0, 0),
                radius: 0.085,
                name: 'calfL',
                targetTypes: ['hair']
            });
        }
        if (refs.rightKnee && refs.rightFoot) {
            this.colliders.push({
                type: 'capsule',
                bone: refs.rightKnee,
                boneB: refs.rightFoot,
                offset: new THREE.Vector3(0, 0, 0),
                radius: 0.085,
                name: 'calfR',
                targetTypes: ['hair']
            });
        }

        console.log(`🛡️ Jiggle Physics: Configurados ${this.colliders.length} colliders corporales 3D anti-clipping`);
    }

    // Inicializar con un modelo 3D
    initialize(model: THREE.Object3D): void {
        this.bones = [];

        model.traverse((child: any) => {
            // Excluir cualquier nodo perteneciente a armas o accesorios secundarios
            let isWeaponOrAcc = false;
            let cp: THREE.Object3D | null = child;
            while (cp) {
                const pn = (cp.name || '').toLowerCase();
                if (
                    pn.includes('weapon') ||
                    pn.includes('knife') ||
                    pn.includes('blade') ||
                    pn.includes('sword') ||
                    pn.includes('gun') ||
                    pn.includes('dagger') ||
                    pn.includes('shield') ||
                    pn.includes('bow') ||
                    pn.includes('arrow') ||
                    pn.includes('sheath') ||
                    pn.includes('holster') ||
                    pn.includes('accessory') ||
                    pn.includes('acc_') ||
                    pn.includes('prop') ||
                    pn.includes('item') ||
                    cp.name === 'MMD_Secondary_Weapon'
                ) {
                    isWeaponOrAcc = true;
                    break;
                }
                cp = cp.parent;
            }
            if (isWeaponOrAcc) return;

            const isValidNode = child.isBone || child.type === 'Object3D' || child.type === 'Group' || child.isGroup;
            if (isValidNode && !child.isMesh && isJiggleBone(child.name)) {
                const bone = child as THREE.Object3D;
                const type = detectBoneType(bone.name);

                // Si es un hueso de pecho, solo permitir el hueso raíz del pecho
                // (evitar encadenar 6-9 huesos de pecho seguidos en modelos PMX para no deformar la ropa)
                if (type === 'breast') {
                    let p = bone.parent;
                    let hasBreastAncestor = false;
                    while (p) {
                        if (p.userData?.isJiggleBone || (p.name && isJiggleBone(p.name) && detectBoneType(p.name) === 'breast')) {
                            hasBreastAncestor = true;
                            break;
                        }
                        p = p.parent;
                    }
                    if (hasBreastAncestor) return;
                }

                const boneSettings = { ...this.settings, ...getPhysicsSettings(bone.name, bone) };
                const { tipOffset, baseLocalDir, particleRadius } = computeTipOffset(bone, type);

                bone.userData.isJiggleBone = true;
                // Buscar el ancestro estructural no-jiggle (cabeza, cuello, pelvis) para referencia inercial limpia
                let anchor = bone.parent;
                while (anchor && (anchor.userData?.isJiggleBone || isJiggleBone(anchor.name))) {
                    anchor = anchor.parent;
                }
                const anchorBone = anchor || null;

                this.bones.push({
                    bone,
                    originalRotation: bone.rotation.clone(),
                    velocity: new THREE.Vector3(),
                    targetRotation: bone.rotation.clone(),
                    settings: boneSettings as JiggleSettings,
                    type,
                    tipOffset,
                    baseLocalDir,
                    particleRadius,
                    anchorBone
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

        const boneSettings = { ...this.settings, ...getPhysicsSettings(bone.name, bone), ...settingsOverrides };
        const type = detectBoneType(bone.name);
        const { tipOffset, baseLocalDir, particleRadius } = computeTipOffset(bone, type);

        let anchor = bone.parent;
        while (anchor && (anchor.userData?.isJiggleBone || isJiggleBone(anchor.name))) {
            anchor = anchor.parent;
        }
        const anchorBone = anchor || null;

        this.bones.push({
            bone,
            originalRotation: bone.rotation.clone(),
            velocity: new THREE.Vector3(),
            targetRotation: bone.rotation.clone(),
            settings: boneSettings as JiggleSettings,
            type,
            tipOffset,
            baseLocalDir,
            particleRadius,
            anchorBone
        });
        console.log(`🌊 Jiggle Physics: Añadido hueso ${bone.name} (${type})`);
    }

    // Aplicar fuerza externa (ej. interacción del ratón) a huesos específicos con soporte semántico multilingüe
    applyImpulse(boneKeyword: string, force: THREE.Vector3): void {
        const lower = boneKeyword.toLowerCase();
        const isLeft = lower.includes('left') || lower.includes('.l') || lower.includes('_l') || lower.includes('左');
        const isRight = lower.includes('right') || lower.includes('.r') || lower.includes('_r') || lower.includes('右');
        const isBreast = lower.includes('breast') || lower.includes('boob') || lower.includes('pecho') || lower.includes('bust') || lower.includes('胸');
        const isButt = lower.includes('butt') || lower.includes('ass') || lower.includes('glute') || lower.includes('trasero') || lower.includes('shiri') || lower.includes('尻');

        for (const jb of this.bones) {
            const bName = jb.bone.name.toLowerCase();
            let matches = bName.includes(lower) || jb.bone.name.includes(boneKeyword);

            if (!matches && (isBreast || isButt)) {
                if (isBreast && jb.type === 'breast') {
                    const bIsLeft = bName.includes('left') || bName.includes('.l') || bName.includes('_l') || jb.bone.name.includes('左') || bName.endsWith('l');
                    const bIsRight = bName.includes('right') || bName.includes('.r') || bName.includes('_r') || jb.bone.name.includes('右') || bName.endsWith('r');
                    if (isLeft && bIsLeft) matches = true;
                    else if (isRight && bIsRight) matches = true;
                    else if (!isLeft && !isRight) matches = true;
                } else if (isButt && jb.type === 'butt') {
                    const bIsLeft = bName.includes('left') || bName.includes('.l') || bName.includes('_l') || jb.bone.name.includes('左') || bName.endsWith('l');
                    const bIsRight = bName.includes('right') || bName.includes('.r') || bName.includes('_r') || jb.bone.name.includes('右') || bName.endsWith('r');
                    if (isLeft && bIsLeft) matches = true;
                    else if (isRight && bIsRight) matches = true;
                    else if (!isLeft && !isRight) matches = true;
                }
            }

            if (matches) {
                jb.velocity.add(force);
            }
        }
    }

    // Actualizar cada frame
    update(delta: number, rootObject?: THREE.Object3D, time?: number): void {
        if (this.bones.length === 0 || delta <= 0) return;

        // 0. Actualizar velocidades lineales de colliders de manos, antebrazos y brazos en espacio mundial para transferir impulso de roce
        for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
            const col = this.colliders[cIdx];
            if (col.name.startsWith('hand') || col.name.startsWith('forearm') || col.name.startsWith('upperArm')) {
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

            // 3. Reacción inercial tridimensional al movimiento angular y lineal del ancla estructural (cabeza, cuello, pelvis)
            // CRÍTICO: Usar anchorBone (ancestro no-jiggle) en vez de jb.bone.parent para evitar bucles de amplificación en cadenas de pelo
            const targetAnchor = jb.anchorBone || (jb.bone.parent && !jb.bone.parent.userData?.isJiggleBone ? jb.bone.parent : null);
            if (targetAnchor) {
                targetAnchor.updateWorldMatrix(true, false);
                targetAnchor.getWorldQuaternion(_tempParentWorldQuat);
                targetAnchor.getWorldPosition(_tempParentWorldPos);

                if (!jb.lastParentWorldQuat) {
                    jb.lastParentWorldQuat = _tempParentWorldQuat.clone();
                    jb.lastParentWorldPos = _tempParentWorldPos.clone();
                } else {
                    const safeDt = Math.max(Math.min(delta, 0.05), 0.001);
                    const dtFactor = safeDt * 60;

                    // A. Velocidad angular del ancla estructural (Giro de cabeza / cuello del avatar)
                    _tempDeltaQuat.copy(_tempParentWorldQuat).multiply(_tempParentLastInvQuat.copy(jb.lastParentWorldQuat).invert());
                    if (_tempDeltaQuat.w < 0) {
                        _tempDeltaQuat.x = -_tempDeltaQuat.x;
                        _tempDeltaQuat.y = -_tempDeltaQuat.y;
                        _tempDeltaQuat.z = -_tempDeltaQuat.z;
                        _tempDeltaQuat.w = -_tempDeltaQuat.w;
                    }

                    _tempParentAngVel.set(
                        (_tempDeltaQuat.x * 2) / safeDt,
                        (_tempDeltaQuat.y * 2) / safeDt,
                        (_tempDeltaQuat.z * 2) / safeDt
                    );
                    _tempParentAngVel.clampLength(0, 4.0); // Clamp estricto para evitar latigazos por giros bruscos de cabeza

                    const angVelSq = _tempParentAngVel.lengthSq();
                    if (angVelSq > 0.008) {
                        // El torque de inercia opone el giro de la cabeza con escala controlada y suave para pelo largo
                        const angInertiaScale = 0.012;
                        _tempWorldAngInertia.copy(_tempParentAngVel).negate().multiplyScalar(angInertiaScale * intensity);
                        _tempLocalAngInertia.copy(_tempWorldAngInertia).applyQuaternion(_tempBoneWorldQuat.clone().invert());

                        jb.velocity.x += _tempLocalAngInertia.x * 14 * dtFactor;
                        jb.velocity.y += _tempLocalAngInertia.y * 14 * dtFactor;
                        jb.velocity.z += _tempLocalAngInertia.z * 14 * dtFactor;
                    }

                    // B. Velocidad lineal del ancla estructural (traslación de la cabeza/caderas en espacio mundial)
                    _tempParentLinVel.subVectors(_tempParentWorldPos, jb.lastParentWorldPos!).multiplyScalar(1 / safeDt);
                    _tempParentLinVel.clampLength(0, 5.0);
                    if (_tempParentLinVel.lengthSq() > 0.004) {
                        const linInertiaScale = 0.015;
                        _tempWorldInertia.copy(_tempParentLinVel).negate().multiplyScalar(linInertiaScale);
                        _tempWorldInertiaTorque.crossVectors(_tempCurrentWorldDir, _tempWorldInertia);
                        _tempLocalInertiaTorque.copy(_tempWorldInertiaTorque).applyQuaternion(_tempBoneWorldQuat.clone().invert());

                        jb.velocity.x += _tempLocalInertiaTorque.x * 14 * dtFactor;
                        jb.velocity.y += _tempLocalInertiaTorque.y * 14 * dtFactor;
                        jb.velocity.z += _tempLocalInertiaTorque.z * 14 * dtFactor;
                    }

                    jb.lastParentWorldQuat.copy(_tempParentWorldQuat);
                    jb.lastParentWorldPos!.copy(_tempParentWorldPos);
                }
            } else if (this.rootVelocity.lengthSq() > 0.0004) {
                // Fallback para huesos sin ancla directa
                _tempWorldInertia.copy(this.rootVelocity).negate().multiplyScalar(0.020);
                _tempWorldInertiaTorque.crossVectors(_tempCurrentWorldDir, _tempWorldInertia);
                _tempLocalInertiaTorque.copy(_tempWorldInertiaTorque).applyQuaternion(_tempBoneWorldQuat.clone().invert());

                jb.velocity.x += _tempLocalInertiaTorque.x * 16 * intensity;
                jb.velocity.y += _tempLocalInertiaTorque.y * 16 * intensity;
                jb.velocity.z += _tempLocalInertiaTorque.z * 16 * intensity;
            }

            // 4. Brisa suave y respiración ambiental orgánica (milimétrica, sin sacudidas bruscas)
            if (time !== undefined) {
                const dtFactor = Math.min(delta, 0.05) * 60;
                if (jb.type === 'hair') {
                    const phase = (jb.bone.id * 1.37) % (Math.PI * 2);
                    const subtleBreezeX = (Math.sin(time * 1.1 + phase) * 0.0015 + Math.cos(time * 0.5 + phase * 1.4) * 0.0008);
                    const subtleBreezeZ = (Math.cos(time * 0.8 + phase * 0.9) * 0.0012);
                    jb.velocity.x += (this.windX * 0.015 + subtleBreezeX) * intensity * dtFactor;
                    jb.velocity.z += (this.windZ * 0.015 + subtleBreezeZ) * intensity * dtFactor;
                } else {
                    jb.velocity.x += this.windX * 0.03 * intensity * dtFactor;
                    jb.velocity.z += this.windZ * 0.03 * intensity * dtFactor;
                }
            }

            // 5. Damping (fricción exponencial estable independiente de fps)
            const dampFactor = Math.pow(damping, delta * 60);
            jb.velocity.multiplyScalar(dampFactor);

            // Limitar velocidad máxima para evitar oscilaciones violentas o latigazos
            jb.velocity.clampLength(0, 2.5);

            // 6. Integración Verlet / Euler semi-implícita en radianes (usando delta real para estabilidad física continua)
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

                // Punto medio del hueso (anti-corte/penetración de fuste a través del cuerpo)
                _tempMid.addVectors(_tempOrigin, _tempTip).multiplyScalar(0.5);

                let collided = false;
                _tempColliderNormal.set(0, 0, 0);
                let maxContactVelocity: THREE.Vector3 | null = null;
                let maxContactSpeedSq = 0;

                for (let cIdx = 0; cIdx < this.colliders.length; cIdx++) {
                    const col = this.colliders[cIdx];

                    // No colisionar contra uno mismo ni contra el hueso padre directo ni el ancla estructural
                    if (col.bone === jb.bone || (col.boneB && col.boneB === jb.bone)) continue;
                    if (col.bone === jb.bone.parent || (col.boneB && col.boneB === jb.bone.parent)) continue;
                    if (jb.anchorBone && (col.bone === jb.anchorBone || (col.boneB && col.boneB === jb.anchorBone))) continue;

                    // Filtrar si este collider aplica al tipo de hueso
                    if (!col.targetTypes.includes('all') && !col.targetTypes.includes(jb.type as any)) continue;

                    const effectiveRadius = col.radius * worldScale;
                    const effectiveParticleRadius = jb.particleRadius * worldScale;
                    const minDist = effectiveRadius + effectiveParticleRadius;
                    const minDistSq = minDist * minDist;

                    if (col.type === 'sphere') {
                        col.bone.updateWorldMatrix(true, false);
                        _tempColliderCenter.copy(col.offset);
                        col.bone.localToWorld(_tempColliderCenter);

                        // 1. Test de Punta (Tip)
                        _tempToTip.subVectors(_tempPushedTip, _tempColliderCenter);
                        const distSq = _tempToTip.lengthSq();

                        if (distSq < minDistSq) {
                            const dist = Math.sqrt(distSq);
                            const normal = dist > 0.0001 ? _tempToTip.divideScalar(dist) : _tempFallbackNormal.set(0, 0, 1);
                            _tempPushedTip.copy(_tempColliderCenter).addScaledVector(normal, minDist);
                            _tempColliderNormal.copy(normal);
                            collided = true;
                        }

                        // 2. Test de Punto Medio (Anti-Bridging: impide que el medio del hueso atraviese el cuerpo)
                        _tempToMid.subVectors(_tempMid, _tempColliderCenter);
                        const midDistSq = _tempToMid.lengthSq();
                        if (midDistSq < minDistSq) {
                            const midDist = Math.sqrt(midDistSq);
                            const midNormal = midDist > 0.0001 ? _tempToMid.divideScalar(midDist) : _tempFallbackNormal.set(0, 0, 1);
                            const midPen = minDist - midDist;
                            _tempPushedTip.addScaledVector(midNormal, midPen * 1.2);
                            _tempColliderNormal.copy(midNormal);
                            collided = true;
                        }

                        if (collided && col.velocity) {
                            const spd = col.velocity.lengthSq();
                            if (spd > maxContactSpeedSq) {
                                maxContactSpeedSq = spd;
                                maxContactVelocity = col.velocity;
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

                        // 1. Test de Punta contra cápsula
                        let t = 0;
                        if (abLenSq > 0.0001) {
                            _tempAP.subVectors(_tempPushedTip, _tempPA);
                            t = THREE.MathUtils.clamp(_tempAP.dot(_tempAB) / abLenSq, 0, 1);
                        }
                        _tempClosest.copy(_tempPA).addScaledVector(_tempAB, t);

                        _tempToTip.subVectors(_tempPushedTip, _tempClosest);
                        const distSq = _tempToTip.lengthSq();

                        if (distSq < minDistSq) {
                            const dist = Math.sqrt(distSq);
                            const normal = dist > 0.0001 ? _tempToTip.divideScalar(dist) : _tempFallbackNormal.set(0, 1, 0);
                            _tempPushedTip.copy(_tempClosest).addScaledVector(normal, minDist);
                            _tempColliderNormal.copy(normal);
                            collided = true;
                        }

                        // 2. Test de Punto Medio contra cápsula (Anti-Bridging)
                        let tMid = 0;
                        if (abLenSq > 0.0001) {
                            _tempAPMid.subVectors(_tempMid, _tempPA);
                            tMid = THREE.MathUtils.clamp(_tempAPMid.dot(_tempAB) / abLenSq, 0, 1);
                        }
                        _tempClosestMid.copy(_tempPA).addScaledVector(_tempAB, tMid);

                        _tempToMid.subVectors(_tempMid, _tempClosestMid);
                        const midDistSq = _tempToMid.lengthSq();

                        if (midDistSq < minDistSq) {
                            const midDist = Math.sqrt(midDistSq);
                            const midNormal = midDist > 0.0001 ? _tempToMid.divideScalar(midDist) : _tempFallbackNormal.set(0, 1, 0);
                            const midPen = minDist - midDist;
                            _tempPushedTip.addScaledVector(midNormal, midPen * 1.2);
                            _tempColliderNormal.copy(midNormal);
                            collided = true;
                        }

                        if (collided && col.velocity) {
                            const spd = col.velocity.lengthSq();
                            if (spd > maxContactSpeedSq) {
                                maxContactSpeedSq = spd;
                                maxContactVelocity = col.velocity;
                            }
                        }
                    }
                }

                // Si hubo colisión, rotar el hueso en espacio mundial hacia la posición no penetrada
                if (collided) {
                    _tempWorldTargetDir.subVectors(_tempPushedTip, _tempOrigin);
                    if (_tempWorldTargetDir.lengthSq() > 0.0001) {
                        _tempWorldTargetDir.normalize();

                        // Dirección actual del tip en espacio mundial
                        jb.bone.updateWorldMatrix(true, false);
                        jb.bone.getWorldQuaternion(_tempBoneWorldQuat);
                        _tempCurrentWorldDir.copy(jb.baseLocalDir).applyQuaternion(_tempBoneWorldQuat).normalize();

                        // Rotación delta requerida en espacio mundial para alinear el tip con pushedTip
                        _tempWorldDeltaQuat.setFromUnitVectors(_tempCurrentWorldDir, _tempWorldTargetDir);

                        // Nuevo cuaternión mundial objetivo
                        _tempNewWorldQuat.multiplyQuaternions(_tempWorldDeltaQuat, _tempBoneWorldQuat);

                        // Convertir nuevo cuaternión mundial al espacio local del hueso
                        let localTargetQuat: THREE.Quaternion;
                        if (jb.bone.parent) {
                            jb.bone.parent.updateWorldMatrix(true, false);
                            jb.bone.parent.getWorldQuaternion(_tempParentQuat);
                            _tempParentQuat.invert();
                            localTargetQuat = _tempCorrectionQuat.multiplyQuaternions(_tempParentQuat, _tempNewWorldQuat);
                        } else {
                            localTargetQuat = _tempNewWorldQuat;
                        }

                        // Slerp suave y adaptado: más ágil y firme para pechos/glúteos (0.88) para no ser atravesados por manos
                        const slerpFactor = (jb.type === 'breast' || jb.type === 'butt') ? 0.88 : 0.75;
                        jb.bone.quaternion.slerp(localTargetQuat, slerpFactor);

                        // Sincronizar rotation desde quaternion para que Three.js no descarte la colisión en el frame
                        jb.bone.rotation.setFromQuaternion(jb.bone.quaternion);

                        // Re-clamp estricto post-colisión: el hueso NUNCA debe exceder limitAngle de su pose base animada
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
                        jb.bone.quaternion.setFromEuler(jb.bone.rotation);

                        // Amortiguar velocidad en la dirección de la colisión
                        const velDot = jb.velocity.dot(_tempColliderNormal);
                        if (velDot < 0) {
                            jb.velocity.sub(_tempColliderNormal.multiplyScalar(velDot * 1.3));
                        }
                        if (jb.type === 'hair') {
                            jb.velocity.multiplyScalar(0.85);
                        }

                        // ── EFECTO DE CONTACTO Y REBOTE DINÁMICO DE MANOS / BRAZOS ──
                        // Al ser tocados o rozados por manos/brazos, transferir impulso físico para que tiemblen y reboten elásticamente
                        if (jb.type === 'breast' || jb.type === 'butt') {
                            _tempBrushImpulse.copy(_tempColliderNormal).multiplyScalar(0.08);
                            if (maxContactVelocity && maxContactSpeedSq > 0.001) {
                                _tempBrushImpulse.addScaledVector(maxContactVelocity, 0.05);
                            }
                            _tempBrushImpulse.clampLength(0, 1.8);
                            _tempLocalBrushImpulse.copy(_tempBrushImpulse).applyQuaternion(_tempBoneWorldQuat.clone().invert());
                            jb.velocity.x += _tempLocalBrushImpulse.x * 40;
                            jb.velocity.y += _tempLocalBrushImpulse.y * 40;
                            jb.velocity.z += _tempLocalBrushImpulse.z * 40;
                        } else if (maxContactVelocity && maxContactSpeedSq > 0.002) {
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
