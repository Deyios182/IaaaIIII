/**
 * Mixamo Retargeter v2 - Auto-detección inteligente de huesos
 * Escanea el modelo target y busca matches por keywords en lugar de nombres hardcodeados
 */

import * as THREE from 'three';

// Definición semántica de cada hueso Mixamo y qué keywords buscar
const MIXAMO_BONE_DEFINITIONS: {
  mixamoName: string;
  keywords: string[];       // Palabras clave a buscar en los nombres del modelo
  side?: 'L' | 'R' | null;  // Lado (null = centro)
  priority: number;          // Mayor = más importante
}[] = [
  // === TORSO ===
  { mixamoName: 'mixamorigHips',    keywords: ['hip', 'pelvis', 'root', '下半身', '腰'], side: null, priority: 10 },
  { mixamoName: 'mixamorigSpine',   keywords: ['spine', '上半身'], side: null, priority: 9 },
  { mixamoName: 'mixamorigSpine1',  keywords: ['spine', 'chest', '上半身2'], side: null, priority: 9 },
  { mixamoName: 'mixamorigSpine2',  keywords: ['spine', 'chest', 'upperchest', '胸'], side: null, priority: 9 },
  { mixamoName: 'mixamorigNeck',    keywords: ['neck', '首'], side: null, priority: 8 },
  { mixamoName: 'mixamorigHead',    keywords: ['head', '頭'], side: null, priority: 8 },

  // === BRAZO IZQUIERDO ===
  { mixamoName: 'mixamorigLeftShoulder', keywords: ['shoulder', 'clavicle', 'leftshoulder'], side: 'L', priority: 7 },
  { mixamoName: 'mixamorigLeftArm',      keywords: ['upper_arm', 'upperarm', 'arm', 'uparm', 'leftarm', '左腕', '腕'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftForeArm',  keywords: ['forearm', 'fore_arm', 'lowerarm', 'lower_arm', 'leftforearm', '左ひじ', 'ひじ', '左肘', '肘'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftHand',     keywords: ['hand', 'wrist', 'lefthand', '左手首', '手首'], side: 'L', priority: 7 },

  // === BRAZO DERECHO ===
  { mixamoName: 'mixamorigRightShoulder', keywords: ['shoulder', 'clavicle', 'rightshoulder'], side: 'R', priority: 7 },
  { mixamoName: 'mixamorigRightArm',      keywords: ['upper_arm', 'upperarm', 'arm', 'uparm', 'rightarm', '右腕', '腕'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightForeArm',  keywords: ['forearm', 'fore_arm', 'lowerarm', 'lower_arm', 'rightforearm', '右ひじ', 'ひじ', '右肘', '肘'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightHand',     keywords: ['hand', 'wrist', 'righthand', '右手首', '手首'], side: 'R', priority: 7 },

  // === PIERNA IZQUIERDA ===
  { mixamoName: 'mixamorigLeftUpLeg',   keywords: ['thigh', 'upleg', 'upper_leg', 'upperleg', '左足', '足'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftLeg',     keywords: ['shin', 'leg', 'calf', 'lowerleg', 'lower_leg', '左ひざ', 'ひざ', '左膝', '膝'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftFoot',    keywords: ['foot', 'ankle', '左足首', '足首'], side: 'L', priority: 7 },
  { mixamoName: 'mixamorigLeftToeBase', keywords: ['toe', '左つま先', 'つま先', '左足先EX', '足先'], side: 'L', priority: 5 },

  // === PIERNA DERECHA ===
  { mixamoName: 'mixamorigRightUpLeg',   keywords: ['thigh', 'upleg', 'upper_leg', 'upperleg', '右足', '足'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightLeg',     keywords: ['shin', 'leg', 'calf', 'lowerleg', 'lower_leg', '右ひざ', 'ひざ', '右膝', '膝'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightFoot',    keywords: ['foot', 'ankle', '右足首', '足首'], side: 'R', priority: 7 },
  { mixamoName: 'mixamorigRightToeBase', keywords: ['toe', '右つま先', 'つま先', '右足先EX', '足先'], side: 'R', priority: 5 },

  // === DEDOS IZQUIERDOS ===
  { mixamoName: 'mixamorigLeftHandThumb1',  keywords: ['thumb', 'thumb01', 'thumb.01', '親指０', '亲指０', '親指0', '亲指0'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandThumb2',  keywords: ['thumb', 'thumb02', 'thumb.02', '親指１', '亲指１', '親指1', '亲指1'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandThumb3',  keywords: ['thumb', 'thumb03', 'thumb.03', '親指２', '亲指２', '親指2', '亲指2'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandIndex1',  keywords: ['index', 'f_index01', '人指１', '人指1'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandIndex2',  keywords: ['index', 'f_index02', '人指２', '人指2'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandIndex3',  keywords: ['index', 'f_index03', '人指３', '人指3'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandMiddle1', keywords: ['middle', 'f_middle01', '中指１', '中指1'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandMiddle2', keywords: ['middle', 'f_middle02', '中指２', '中指2'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandMiddle3', keywords: ['middle', 'f_middle03', '中指３', '中指3'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandRing1',   keywords: ['ring', 'f_ring01', '薬指１', '药指１', '薬指1', '药指1'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandRing2',   keywords: ['ring', 'f_ring02', '薬指２', '药指２', '薬指2', '药指2'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandRing3',   keywords: ['ring', 'f_ring03', '薬指３', '药指３', '药指3', '药指3'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandPinky1',  keywords: ['pinky', 'f_pinky01', '小指１', '小指1'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandPinky2',  keywords: ['pinky', 'f_pinky02', '小指２', '小指2'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandPinky3',  keywords: ['pinky', 'f_pinky03', '小指３', '小指3'], side: 'L', priority: 3 },

  // === DEDOS DERECHOS ===
  { mixamoName: 'mixamorigRightHandThumb1',  keywords: ['thumb', 'thumb01', 'thumb.01', '親指０', '亲指０', '親指0', '亲指0'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandThumb2',  keywords: ['thumb', 'thumb02', 'thumb.02', '親指１', '亲指１', '親指1', '亲指1'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandThumb3',  keywords: ['thumb', 'thumb03', 'thumb.03', '親指２', '亲指２', '親指2', '亲指2'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandIndex1',  keywords: ['index', 'f_index01', '人指１', '人指1'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandIndex2',  keywords: ['index', 'f_index02', '人指２', '人指2'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandIndex3',  keywords: ['index', 'f_index03', '人指３', '人指3'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandMiddle1', keywords: ['middle', 'f_middle01', '中指１', '中指1'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandMiddle2', keywords: ['middle', 'f_middle02', '中指２', '中指2'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandMiddle3', keywords: ['middle', 'f_middle03', '中指３', '中指3'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandRing1',   keywords: ['ring', 'f_ring01', '薬指１', '药指１', '薬指1', '药指1'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandRing2',   keywords: ['ring', 'f_ring02', '薬指２', '药指２', '薬指2', '药指2'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandRing3',   keywords: ['ring', 'f_ring03', '薬指３', '药指３', '药指3', '药指3'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandPinky1',  keywords: ['pinky', 'f_pinky01', '小指１', '小指1'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandPinky2',  keywords: ['pinky', 'f_pinky02', '小指２', '小指2'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandPinky3',  keywords: ['pinky', 'f_pinky03', '小指３', '小指3'], side: 'R', priority: 3 },
];

/**
 * Resultado del mapping para UI de calibración
 */
export interface BoneMappingResult {
  mixamoBone: string;
  targetBone: string | null;
  confidence: number;  // 0-1, qué tan seguro es el match
  priority: number;
}

/**
 * Detecta si una animación usa nombres de Mixamo
 */
export function isMixamoAnimation(clip: THREE.AnimationClip): boolean {
  return clip.tracks.some(track => track.name.includes('mixamorig'));
}

/**
 * Detecta animaciones FK genéricas (GLB/FBX de Blender, Rokoko, etc.)
 */
export function isGenericFKAnimation(clip: THREE.AnimationClip, modelBoneNames: Set<string>): boolean {
  if (isMixamoAnimation(clip)) return false;
  let matchCount = 0;
  for (const track of clip.tracks) {
    const dot = track.name.indexOf('.');
    const boneName = dot !== -1 ? track.name.substring(0, dot) : track.name;
    if (modelBoneNames.has(boneName)) matchCount++;
    if (matchCount >= 3) return true;
  }
  return false;
}

/**
 * Checa si un nombre de hueso pertenece a un lado (L/R)
 */
function matchesSide(boneName: string, side: 'L' | 'R' | null): boolean {
  if (side === null) return true;
  const n = boneName;
  const lower = n.toLowerCase();

  if (side === 'L') {
    if (n.includes('右') || lower.includes('right') || lower.endsWith('.r') || lower.endsWith('_r')) return false;
    return lower.includes('.l') || lower.includes('_l_') || lower.includes('_l.') ||
           lower.endsWith('l') || lower.endsWith('.l') || lower.endsWith('_l') ||
           lower.includes('left') || n.includes('.L') || n.includes('_L_') ||
           n.includes('_L.') || n.endsWith('L') || n.endsWith('_L') ||
           n.includes('左');
  } else {
    if (n.includes('左') || lower.includes('left') || lower.endsWith('.l') || lower.endsWith('_l')) return false;
    return lower.includes('.r') || lower.includes('_r_') || lower.includes('_r.') ||
           lower.endsWith('r') || lower.endsWith('.r') || lower.endsWith('_r') ||
           lower.includes('right') || n.includes('.R') || n.includes('_R_') ||
           n.includes('_R.') || n.endsWith('R') || n.endsWith('_R') ||
           n.includes('右');
  }
}

/**
 * Score de match entre un nombre de hueso del modelo y una definición Mixamo
 */
function scoreBoneMatch(
  boneName: string,
  definition: typeof MIXAMO_BONE_DEFINITIONS[0]
): number {
  const lower = boneName.toLowerCase();

  // === EXCLUSIONES ESTRICTAS ===
  // Estos huesos NUNCA deben usarse para animación (son de control/mecanismo en Rigify)
  if (lower.startsWith('org-') || lower.startsWith('mch-') || lower.startsWith('vis_') ||
      lower.startsWith('vis-') || lower.includes('tweak') || lower.includes('_parent') ||
      lower.includes('ik_pole') || lower.includes('ik_target') || lower.includes('_ik_') ||
      lower.includes('_fk_socket') || lower.includes('_pivot') || lower.includes('offset') ||
      lower === 'root' || lower === 'root-pivot' || lower === 'torso') {
    return 0;
  }

  // Excluir huesos auxiliares/IK/mecanismo de modelos MMD/PMX
  // NOTA: Los hombros MMD (左肩, 右肩) se excluyen para evitar que el offset de 128° del clavicle de Mixamo disloque los brazos
  if (boneName.includes('IK') || boneName.includes('ＩＫ') || boneName.includes('捩') ||
      boneName.includes('補助') || boneName.includes('ダミー') || boneName.includes('キャンセル') ||
      boneName.includes('パーツ') || boneName.includes('肩') || (boneName.endsWith('P') && boneName.length > 2) ||
      (boneName.endsWith('C') && boneName.length > 2)) {
    return 0;
  }

  // Excluir huesos twist o auxiliares (.001, .002, twist) salvo para dedos
  const isFinger = definition.mixamoName.includes('HandThumb') ||
                   definition.mixamoName.includes('HandIndex') ||
                   definition.mixamoName.includes('HandMiddle') ||
                   definition.mixamoName.includes('HandRing') ||
                   definition.mixamoName.includes('HandPinky');

  if (!isFinger && (lower.includes('.0') || lower.includes('_0') || lower.includes('twist') || lower.includes('pole'))) {
    return 0;
  }

  // Debe matchear el lado correcto
  if (definition.side !== null && !matchesSide(boneName, definition.side)) {
    return 0;
  }

  // Coincidencias canónicas MMD / PMX (Prioridad MÁXIMA para modelos japoneses)
  const MMD_EXACT_MATCHES: Record<string, string[]> = {
    mixamorigHips: ['下半身', '腰'],
    mixamorigSpine: ['上半身'],
    mixamorigSpine1: ['上半身2'],
    mixamorigNeck: ['首'],
    mixamorigHead: ['頭'],
    // Clavículas / Hombros NO se mapean en PMX (evita offset de 128° de Mixamo)
    mixamorigLeftArm: ['左腕'],
    mixamorigLeftForeArm: ['左ひじ', '左肘'],
    mixamorigLeftHand: ['左手首'],
    mixamorigRightArm: ['右腕'],
    mixamorigRightForeArm: ['右ひじ', '右肘'],
    mixamorigRightHand: ['右手首'],
    mixamorigLeftUpLeg: ['左足'],
    mixamorigLeftLeg: ['左ひざ', '左膝'],
    mixamorigLeftFoot: ['左足首'],
    mixamorigLeftToeBase: ['左つま先'],
    mixamorigRightUpLeg: ['右足'],
    mixamorigRightLeg: ['右ひざ', '右膝'],
    mixamorigRightFoot: ['右足首'],
    mixamorigRightToeBase: ['右つま先'],
    // Dedos
    mixamorigLeftHandThumb1: ['左親指０', '左亲指０', '左親指0', '左亲指0'],
    mixamorigLeftHandThumb2: ['左親指１', '左亲指１', '左親指1', '亲指1'],
    mixamorigLeftHandThumb3: ['左親指２', '左亲指２', '左親指2', '亲指2'],
    mixamorigLeftHandIndex1: ['左人指１', '左人指1'],
    mixamorigLeftHandIndex2: ['左人指２', '左人指2'],
    mixamorigLeftHandIndex3: ['左人指３', '左人指3'],
    mixamorigLeftHandMiddle1: ['左中指１', '左中指1'],
    mixamorigLeftHandMiddle2: ['左中指２', '左中指2'],
    mixamorigLeftHandMiddle3: ['左中指３', '左中指3'],
    mixamorigLeftHandRing1: ['左薬指１', '左药指１', '左薬指1', '药指1'],
    mixamorigLeftHandRing2: ['左薬指２', '左药指２', '左薬指2', '药指2'],
    mixamorigLeftHandRing3: ['左薬指３', '左药指３', '左薬指3', '药指3'],
    mixamorigLeftHandPinky1: ['左小指１', '左小指1'],
    mixamorigLeftHandPinky2: ['左小指２', '左小指2'],
    mixamorigLeftHandPinky3: ['左小指３', '左小指3'],
    mixamorigRightHandThumb1: ['右親指０', '右亲指０', '右親指0', '右亲指0'],
    mixamorigRightHandThumb2: ['右親指１', '右亲指１', '右親指1', '亲指1'],
    mixamorigRightHandThumb3: ['右親指２', '右亲指２', '右親指2', '亲指2'],
    mixamorigRightHandIndex1: ['右人指１', '右人指1'],
    mixamorigRightHandIndex2: ['右人指２', '右人指2'],
    mixamorigRightHandIndex3: ['右人指３', '右人指3'],
    mixamorigRightHandMiddle1: ['右中指１', '右中指1'],
    mixamorigRightHandMiddle2: ['右中指２', '右中指2'],
    mixamorigRightHandMiddle3: ['右中指３', '右中指3'],
    mixamorigRightHandRing1: ['右薬指１', '右药指１', '右薬指1', '药指1'],
    mixamorigRightHandRing2: ['右薬指２', '右药指２', '右薬指2', '药指2'],
    mixamorigRightHandRing3: ['右薬指３', '右药指３', '右薬指3', '药指3'],
    mixamorigRightHandPinky1: ['右小指１', '右小指1'],
    mixamorigRightHandPinky2: ['右小指２', '右小指2'],
    mixamorigRightHandPinky3: ['右小指３', '右小指3'],
  };

  if (MMD_EXACT_MATCHES[definition.mixamoName]?.includes(boneName)) {
    return 300;
  }

  // Exact Match de nombre Mixamo (ej: mixamorigLeftArm, mixamorig:LeftArm, LeftArm)
  const pureMixamoName = definition.mixamoName.replace('mixamorig', '').toLowerCase();
  const rawCleanName = lower.replace(/^(mixamorig[:_]?|j_bip_[clr]_?)/i, '');

  if (lower === definition.mixamoName.toLowerCase()) return 200;
  if (rawCleanName === pureMixamoName) return 150;

  // Buscar keywords
  let score = 0;
  for (const keyword of definition.keywords) {
    if (boneName.includes(keyword) || lower.includes(keyword.toLowerCase())) {
      score += keyword.length * 3;
    }
  }

  // Bonus MASIVO para huesos DEF- (son los de deformación en Rigify)
  if (lower.startsWith('def-')) score += 50;
  
  // Bonus para huesos estándar VRM (J_Bip_)
  if (lower.startsWith('j_bip_')) score += 50;

  return score;
}

/**
 * Construye el mapa de huesos dinámicamente escaneando el modelo
 */
export function buildBoneMapping(modelBoneNames: Set<string>): {
  mapping: Map<string, string>;
  results: BoneMappingResult[];
} {
  const mapping = new Map<string, string>();
  const results: BoneMappingResult[] = [];
  const usedBones = new Set<string>();

  // Detectar si el modelo es PMX (esqueleto MMD con kanji)
  const isPmx = Array.from(modelBoneNames).some(n => n.includes('足') || n.includes('身') || n.includes('首') || n.includes('腕') || n.includes('肩'));

  // Detectar si el modelo es un rig Rigify (usa prefijos DEF-)
  const hasDefBones = Array.from(modelBoneNames).some(n => n.toLowerCase().startsWith('def-'));

  // 1. Hips / Pelvis
  let hipBone: string | undefined = undefined;

  if (isPmx) {
    hipBone = Array.from(modelBoneNames).find(n => n === '下半身') ||
              Array.from(modelBoneNames).find(n => n === '腰') ||
              Array.from(modelBoneNames).find(n => n === 'センター');
  } else if (hasDefBones) {
    // En Rigify, SOLO usar huesos de deformación DEF-. NUNCA los huesos de control 'hips', 'torso' o 'root'.
    hipBone = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'def-pelvis') ||
              Array.from(modelBoneNames).find(n => n.toLowerCase() === 'def-spine');
  } else {
    // Para VRM / Mixamo / Estándar:
    const hipCandidates = [
      'j_bip_c_hips', 'mixamorig:hips', 'mixamorighips', 'pelvis', 'hips', 'hip'
    ];
    for (const cand of hipCandidates) {
      const found = Array.from(modelBoneNames).find(n => n.toLowerCase() === cand);
      if (found) { hipBone = found; break; }
    }
    if (!hipBone) {
      hipBone = Array.from(modelBoneNames).find(n => {
        const lower = n.toLowerCase();
        return (lower.includes('pelvis') || lower.includes('hip')) &&
               !lower.includes('ik') && !lower.includes('mch') && !lower.includes('org') &&
               lower !== 'root' && lower !== 'armature' && lower !== 'torso';
      });
    }
  }

  if (hipBone) {
    mapping.set('mixamorigHips', hipBone);
    usedBones.add(hipBone);
    results.push({ mixamoBone: 'mixamorigHips', targetBone: hipBone, confidence: 0.95, priority: 10 });
  }

  // 2. Torso / Columna: Buscar Spine, Chest, UpperChest de forma jerárquica
  const vrmSpine = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'j_bip_c_spine');
  const vrmChest = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'j_bip_c_chest');
  const vrmUpperChest = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'j_bip_c_upperchest');

  if (isPmx) {
    const pmxSpine = Array.from(modelBoneNames).find(n => n === '上半身');
    const pmxSpine2 = Array.from(modelBoneNames).find(n => n === '上半身2');
    if (pmxSpine) {
      mapping.set('mixamorigSpine', pmxSpine);
      usedBones.add(pmxSpine);
      results.push({ mixamoBone: 'mixamorigSpine', targetBone: pmxSpine, confidence: 0.95, priority: 9 });
    }
    if (pmxSpine2) {
      mapping.set('mixamorigSpine1', pmxSpine2);
      usedBones.add(pmxSpine2);
      results.push({ mixamoBone: 'mixamorigSpine1', targetBone: pmxSpine2, confidence: 0.95, priority: 9 });
    }
  } else if (vrmSpine) {
    mapping.set('mixamorigSpine', vrmSpine);
    usedBones.add(vrmSpine);
    results.push({ mixamoBone: 'mixamorigSpine', targetBone: vrmSpine, confidence: 0.95, priority: 9 });

    if (vrmChest) {
      mapping.set('mixamorigSpine1', vrmChest);
      usedBones.add(vrmChest);
      results.push({ mixamoBone: 'mixamorigSpine1', targetBone: vrmChest, confidence: 0.95, priority: 9 });
    }
    if (vrmUpperChest) {
      mapping.set('mixamorigSpine2', vrmUpperChest);
      usedBones.add(vrmUpperChest);
      results.push({ mixamoBone: 'mixamorigSpine2', targetBone: vrmUpperChest, confidence: 0.95, priority: 9 });
    }
  } else if (hasDefBones) {
    // Mapeo para Rigify: AniGrok exporta los huesos como DEF-spine001, DEF-spine002... (sin punto)
    // Recopilar TODOS los huesos de columna DEF- disponibles, ordenados
    const defSpineBones = Array.from(modelBoneNames)
      .filter(n => {
        const l = n.toLowerCase();
        // Coincide con def-spine, def-spine001, def-spine002, etc. (con o sin punto)
        return l.startsWith('def-spine') && !usedBones.has(n);
      })
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

    // Distribuir los 3 Mixamo spine bones a lo largo de los segmentos de columna disponibles
    // defSpineBones[0] ya está usado (=DEF-spine → hips)
    // Distribuir Spine→Spine1→Spine2 en el tercio inferior, medio y superior de la columna
    const spineAvail = defSpineBones.filter(n => !usedBones.has(n));
    console.log(`🦴 [Rigify] Huesos de columna disponibles: ${spineAvail.join(', ')}`);

    if (spineAvail.length >= 1) {
      // Spine → primer segmento disponible (el más bajo, justo encima de caderas)
      const spineTarget = spineAvail[0];
      mapping.set('mixamorigSpine', spineTarget);
      usedBones.add(spineTarget);
      results.push({ mixamoBone: 'mixamorigSpine', targetBone: spineTarget, confidence: 0.9, priority: 9 });
    }
    if (spineAvail.length >= 2) {
      // Spine1 → segmento medio
      const spine1Idx = Math.floor((spineAvail.length - 1) / 2) + (spineAvail.length >= 3 ? 0 : 0);
      const spine1Target = spineAvail[Math.min(1, spineAvail.length - 1)];
      if (!usedBones.has(spine1Target)) {
        mapping.set('mixamorigSpine1', spine1Target);
        usedBones.add(spine1Target);
        results.push({ mixamoBone: 'mixamorigSpine1', targetBone: spine1Target, confidence: 0.85, priority: 9 });
      }
    }
    if (spineAvail.length >= 3) {
      // Spine2 → segmento superior (pecho/chest)
      const spine2Target = spineAvail[Math.min(2, spineAvail.length - 1)];
      if (!usedBones.has(spine2Target)) {
        mapping.set('mixamorigSpine2', spine2Target);
        usedBones.add(spine2Target);
        results.push({ mixamoBone: 'mixamorigSpine2', targetBone: spine2Target, confidence: 0.85, priority: 9 });
      }
    }
  } else {
    // Para otros modelos genéricos:
    const spineBonesInModel: string[] = [];
    modelBoneNames.forEach(name => {
      const lower = name.toLowerCase();
      if ((lower.includes('spine') || lower.includes('chest')) &&
          !lower.includes('ik') && !lower.includes('mch') && !lower.includes('org') &&
          !lower.includes('spine.004') && !lower.includes('spine.005') && !lower.includes('spine.006') &&
          name !== hipBone) {
        spineBonesInModel.push(name);
      }
    });
    spineBonesInModel.sort();

    if (spineBonesInModel.length > 0) {
      mapping.set('mixamorigSpine', spineBonesInModel[0]);
      usedBones.add(spineBonesInModel[0]);
      results.push({ mixamoBone: 'mixamorigSpine', targetBone: spineBonesInModel[0], confidence: 0.9, priority: 9 });

      if (spineBonesInModel.length === 2) {
        mapping.set('mixamorigSpine1', spineBonesInModel[1]);
        usedBones.add(spineBonesInModel[1]);
        results.push({ mixamoBone: 'mixamorigSpine1', targetBone: spineBonesInModel[1], confidence: 0.85, priority: 9 });
      } else if (spineBonesInModel.length >= 3) {
        const midIdx = Math.floor(spineBonesInModel.length / 2);
        const topIdx = spineBonesInModel.length - 1;

        mapping.set('mixamorigSpine1', spineBonesInModel[midIdx]);
        usedBones.add(spineBonesInModel[midIdx]);
        results.push({ mixamoBone: 'mixamorigSpine1', targetBone: spineBonesInModel[midIdx], confidence: 0.85, priority: 9 });

        mapping.set('mixamorigSpine2', spineBonesInModel[topIdx]);
        usedBones.add(spineBonesInModel[topIdx]);
        results.push({ mixamoBone: 'mixamorigSpine2', targetBone: spineBonesInModel[topIdx], confidence: 0.85, priority: 9 });
      }
    }
  }

  // 3. Neck & Head
  let neckBone: string | undefined;
  let headBone: string | undefined;

  if (isPmx) {
    neckBone = Array.from(modelBoneNames).find(n => n === '首');
    headBone = Array.from(modelBoneNames).find(n => n === '頭');
  } else {
    neckBone = Array.from(modelBoneNames).find(n => {
      const l = n.toLowerCase();
      return l === 'j_bip_c_neck' || l === 'def-neck' || l === 'mixamorig:neck' || (l.includes('neck') && !l.includes('mch') && !l.includes('org'));
    });

    headBone = Array.from(modelBoneNames).find(n => {
      const l = n.toLowerCase();
      if (l.includes('forehead') || l.includes('brow') || l.includes('face')) return false;
      return l === 'j_bip_c_head' || l === 'def-head' || l === 'mixamorig:head' || (l.includes('head') && !l.includes('mch') && !l.includes('org'));
    });
  }

  if (neckBone) {
    mapping.set('mixamorigNeck', neckBone);
    usedBones.add(neckBone);
    results.push({ mixamoBone: 'mixamorigNeck', targetBone: neckBone, confidence: 0.95, priority: 8 });
  }
  if (headBone) {
    mapping.set('mixamorigHead', headBone);
    usedBones.add(headBone);
    results.push({ mixamoBone: 'mixamorigHead', targetBone: headBone, confidence: 0.95, priority: 8 });
  }

  // 4. Mapear el resto de huesos (extremidades, dedos)
  const nonSpineDefinitions = MIXAMO_BONE_DEFINITIONS.filter(d =>
    !d.mixamoName.includes('Spine') && !d.mixamoName.includes('Hips') &&
    d.mixamoName !== 'mixamorigNeck' && d.mixamoName !== 'mixamorigHead'
  );

  // Ordenar por prioridad (más importante primero)
  nonSpineDefinitions.sort((a, b) => b.priority - a.priority);

  for (const def of nonSpineDefinitions) {
    // Saltar huesos desactivados (priority <= 0)
    if (def.priority <= 0) {
      results.push({ mixamoBone: def.mixamoName, targetBone: null, confidence: 0, priority: 0 });
      continue;
    }

    // En modelos PMX / MMD, los hombros/clavículas (LeftShoulder, RightShoulder) NUNCA deben mapearse:
    // En Mixamo los hombros portan un desfase de rotación de ~128° de la bind pose.
    // En MMD, 左肩 y 右肩 son huesos auxiliares muy cortos que si se rotan 128° dislocan y tuercen todo el brazo.
    if (isPmx && (def.mixamoName === 'mixamorigLeftShoulder' || def.mixamoName === 'mixamorigRightShoulder')) {
      results.push({ mixamoBone: def.mixamoName, targetBone: null, confidence: 0, priority: 0 });
      continue;
    }

    let bestMatch: string | null = null;
    let bestScore = 0;

    modelBoneNames.forEach(boneName => {
      if (usedBones.has(boneName)) return;
      const score = scoreBoneMatch(boneName, def);
      if (score > bestScore) {
        bestScore = score;
        bestMatch = boneName;
      }
    });

    if (bestMatch && bestScore > 2) {
      mapping.set(def.mixamoName, bestMatch);
      usedBones.add(bestMatch);
      results.push({
        mixamoBone: def.mixamoName,
        targetBone: bestMatch,
        confidence: Math.min(bestScore / 15, 1),
        priority: def.priority
      });
    } else {
      results.push({
        mixamoBone: def.mixamoName,
        targetBone: null,
        confidence: 0,
        priority: def.priority
      });
    }
  }

  // Ordenar resultados por prioridad
  results.sort((a, b) => b.priority - a.priority);

  return { mapping, results };
}

/**
 * Retargetea una AnimationClip usando el mapping dinámico
 */
export function retargetMixamoClip(
  clip: THREE.AnimationClip,
  targetBoneNames: Set<string>,
  targetModel?: THREE.Object3D,
  sourceRestPoses?: Map<string, THREE.Quaternion>,
  targetRestPoses?: Map<string, THREE.Quaternion>,
  targetWorldRestPoses?: Map<string, THREE.Quaternion>,
  posePreset: string = 'none'
): THREE.AnimationClip {
  const { mapping, results } = buildBoneMapping(targetBoneNames);

  const mapped = results.filter(r => r.targetBone).length;
  const total = results.filter(r => r.priority >= 5).length;
  // Bone mapping summary (silenciado - usar window.__lastBoneMapping para debug)

  (window as any).__lastBoneMapping = results;
  (window as any).__lastBoneMappingMap = Object.fromEntries(mapping);

  const hipsTargetName = mapping.get('mixamorigHips');

  // Escala para root motion
  let rootScaleFactor = 0.01;
  if (targetModel) {
    const box = new THREE.Box3().setFromObject(targetModel);
    const modelHeight = box.max.y - box.min.y;
    if (modelHeight < 10 && modelHeight > 0.1) {
      rootScaleFactor = modelHeight / 170;
    } else {
      rootScaleFactor = 1;
    }
  }

  const retargeted = clip.clone();
  let keptRotations = 0;
  let correctedRotations = 0;
  let keptPosition = 0;

  // Detectar tipo de esqueleto
  const isRigify = Array.from(targetBoneNames).some(n => n.toLowerCase().startsWith('def-'));

  // Pre-calcular correcciones de espacio local para Rigify.
  // Los FBX de Mixamo tienen bones con quaterniones IDENTIDAD en rest pose (T-pose).
  // Los huesos Rigify (DEF-) pueden tener rotaciones no triviales en su bind pose.
  // Fórmula: outQuat = tgtRest * inv(srcRest) * srcAnim
  // Como srcRest ≈ identity para Mixamo FBX, se simplifica a: outQuat = tgtRest * srcAnim
  // Pero necesitamos sacar primero la componente de reposo del hueso target:
  // outQuat = inv(tgtRest) * (tgtRest * srcAnim) -- no, esto borra la corrección
  //
  // La fórmula CORRECTA de retargeting "local space":
  // outQuat = tgtRest * deltaQ * inv(tgtRest)   donde deltaQ = inv(srcRest) * srcAnim
  // Esto mantiene la pose de reposo intacta y solo aplica el movimiento relativo.
  //
  // Dado srcRest ≈ identity: deltaQ ≈ srcAnim
  // outQuat = tgtRest * srcAnim * inv(tgtRest)
  const rigifyCorrections = new Map<string, { tgtRest: THREE.Quaternion; tgtRestInv: THREE.Quaternion }>();
  if (isRigify && targetRestPoses) {
    targetRestPoses.forEach((tgtRest, boneName) => {
      const tgtRestInv = tgtRest.clone().invert();
      rigifyCorrections.set(boneName, { tgtRest: tgtRest.clone(), tgtRestInv });
    });
  }

  // Log Rigify silenciado - usar window.__lastBoneMapping para debug

  // === VRM arm correction (A-Pose 45°) ===
  const offsetRad = posePreset === 'vrm' ? 45 * (Math.PI / 180) : 0;
  const armFixLeft  = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1),  offsetRad);
  const armFixRight = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -offsetRad);

  retargeted.tracks = clip.tracks
    .map(track => {
      const dotIndex = track.name.indexOf('.');
      if (dotIndex === -1) return null;

      const boneName = track.name.substring(0, dotIndex);
      const property = track.name.substring(dotIndex);

      const targetName = mapping.get(boneName);
      if (!targetName) return null;

      const lowerTarget = targetName.toLowerCase();
      if (lowerTarget === 'root' || lowerTarget === 'armature' || lowerTarget === 'torso') {
        return null; 
      }

      // === ROTACIONES ===
      if (property === '.quaternion') {
        keptRotations++;
        const newTrack = track.clone();
        newTrack.name = targetName + property;
        const values = newTrack.values;

        if (isRigify) {
          // DIAGNÓSTICO: Aplicar corrección universal X,Z negate para TODOS los huesos Rigify.
          // Esto invierte el eje de pitch (inclinación adelante/atrás) y el eje de roll lateral.
          // Si el modelo queda peor, necesitamos hacer diferente para distintos grupos de huesos.
          correctedRotations++;
          for (let i = 0; i < values.length; i += 4) {
            // Negar X y Z: convierte la rotación al espacio de Rigify
            values[i]   = -values[i];    // x
            // values[i+1] unchanged     // y
            values[i+2] = -values[i+2];  // z
            // values[i+3] unchanged     // w
          }
        } else if (!isRigify) {
          // Detectar si el modelo es PMX (esqueleto MMD con kanji)
          const isPmx = Array.from(targetBoneNames).some(n => n.includes('足') || n.includes('身') || n.includes('首') || n.includes('腕') || n.includes('肩'));

          const isUpLeg = boneName.includes('LeftUpLeg') || boneName.includes('RightUpLeg');
          const isKneeOrFoot = boneName.includes('LeftLeg') || boneName.includes('RightLeg') ||
            boneName.includes('LeftFoot') || boneName.includes('RightFoot') ||
            boneName.includes('LeftToeBase') || boneName.includes('RightToeBase');

          if (isPmx && (isUpLeg || isKneeOrFoot)) {
            // FIX DE PIERNAS MIXAMO EN PMX:
            // En Mixamo FBX, los huesos de las piernas vienen orientados con 180° en el eje Z (cuaternión ~ [0, 0, 1, 0]).
            // En PMX, los muslos descansan con identidad (0,0,0,1) apuntando hacia abajo (-Y).
            // Aplicar la rotación sin corregir orienta los muslos hacia arriba (+Y).
            // Multiplicar por rotZ invierte el muslo apuntando al suelo y el conjugado mantiene la flexión natural de la rodilla.
            const rotZ = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
            correctedRotations++;
            for (let i = 0; i < values.length; i += 4) {
              const animQ = new THREE.Quaternion(values[i], values[i + 1], values[i + 2], values[i + 3]);
              let outQ: THREE.Quaternion;
              if (isUpLeg) {
                outQ = animQ.multiply(rotZ);
              } else {
                outQ = rotZ.clone().multiply(animQ).multiply(rotZ);
              }
              values[i] = outQ.x;
              values[i + 1] = outQ.y;
              values[i + 2] = outQ.z;
              values[i + 3] = outQ.w;
            }
          } else if (posePreset === 'vrm') {
            // Para VRM (Nova Anime): corrección A-Pose de 45° en brazos
            const isLeftArm = boneName.includes('LeftArm') || boneName.includes('LeftForeArm') || boneName.includes('LeftShoulder');
            const isRightArm = boneName.includes('RightArm') || boneName.includes('RightForeArm') || boneName.includes('RightShoulder');
            if (isLeftArm || isRightArm) {
              correctedRotations++;
              for (let i = 0; i < values.length; i += 4) {
                const animQ = new THREE.Quaternion(values[i], values[i + 1], values[i + 2], values[i + 3]);
                if (isLeftArm) animQ.multiply(armFixLeft);
                else animQ.multiply(armFixRight);
                values[i] = animQ.x;
                values[i + 1] = animQ.y;
                values[i + 2] = animQ.z;
                values[i + 3] = animQ.w;
              }
            }
          }
        }

        return newTrack;
      }

      // Descartar position tracks para mantener orientación vertical y accesorios (collar, ojos, botas) perfectamente anclados
      return null;
    })
    .filter((track): track is THREE.KeyframeTrack => track !== null);

  // Retarget summary silenciado (demasiado verbose por cada animación)
  return retargeted;
}

/**
 * Obtiene todos los nombres de huesos de un modelo
 */
export function getModelBoneNames(model: THREE.Object3D): Set<string> {
  const names = new Set<string>();
  model.traverse(child => {
    if ((child as any).isBone) {
      names.add(child.name);
    }
  });
  return names;
}
