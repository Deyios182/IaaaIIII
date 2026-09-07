/**
 * MMD Bone Semantic Map
 * Mapeo semántico exhaustivo de nombres de huesos MikuMikuDance (kanji japonés)
 * a nombres universales de esqueletos (VRM / Mixamo / Rigify / Blender).
 * 
 * Separa estrictamente:
 * - Huesos de deformación FK (rotaciones aplicadas al mixer)
 * - Objetivos de cinemática inversa IK (左足ＩＫ, 右足ＩＫ) que alimentan al solver
 */

export interface MmdBoneMappingEntry {
  mmdName: string;
  isIK: boolean;
  candidates: string[];
  description: string;
}

export const MMD_BONE_DICTIONARY: Record<string, { isIK: boolean; candidates: string[]; description: string }> = {
  // === PELVIS / CENTRO / ROOT ===
  '全ての親': {
    isIK: false,
    candidates: ['Root', 'root', 'Origin', 'origin', 'DEF-root'],
    description: 'Padre global / origen'
  },
  'センター': {
    isIK: false,
    candidates: ['Hips', 'mixamorigHips', 'J_Bip_C_Hips', 'DEF-pelvis', 'pelvis', 'root'],
    description: 'Centro de gravedad / pelvis principal'
  },
  'グルーブ': {
    isIK: false,
    candidates: ['Hips', 'mixamorigHips', 'J_Bip_C_Hips', 'DEF-pelvis', 'pelvis'],
    description: 'Groove / cadera secundaria'
  },
  '下半身': {
    isIK: false,
    candidates: ['Hips', 'mixamorigHips', 'J_Bip_C_Hips', 'DEF-pelvis', 'pelvis'],
    description: 'Pelvis inferior'
  },

  // === COLUMNA / TORSO ===
  '上半身': {
    isIK: false,
    candidates: ['Spine', 'mixamorigSpine', 'J_Bip_C_Spine', 'DEF-spine', 'spine'],
    description: 'Columna / Torso bajo'
  },
  '上半身2': {
    isIK: false,
    candidates: ['Spine1', 'mixamorigSpine1', 'Spine2', 'mixamorigSpine2', 'J_Bip_C_Chest', 'DEF-spine.001', 'chest'],
    description: 'Pecho / Torso alto'
  },
  '首': {
    isIK: false,
    candidates: ['Neck', 'mixamorigNeck', 'J_Bip_C_Neck', 'DEF-neck', 'neck'],
    description: 'Cuello'
  },
  '頭': {
    isIK: false,
    candidates: ['Head', 'mixamorigHead', 'J_Bip_C_Head', 'DEF-head', 'head'],
    description: 'Cabeza'
  },

  // === BRAZO IZQUIERDO ===
  '左肩': {
    isIK: false,
    candidates: ['LeftShoulder', 'mixamorigLeftShoulder', 'J_Bip_L_Shoulder', 'DEF-shoulder.L', 'clavicle_l'],
    description: 'Clavícula / Hombro izquierdo'
  },
  '左腕': {
    isIK: false,
    candidates: ['LeftArm', 'mixamorigLeftArm', 'J_Bip_L_UpperArm', 'DEF-upper_arm.L', 'upperarm_l'],
    description: 'Brazo izquierdo'
  },
  '左ひじ': {
    isIK: false,
    candidates: ['LeftForeArm', 'mixamorigLeftForeArm', 'J_Bip_L_LowerArm', 'DEF-forearm.L', 'lowerarm_l'],
    description: 'Antebrazo / Codo izquierdo'
  },
  '左手首': {
    isIK: false,
    candidates: ['LeftHand', 'mixamorigLeftHand', 'J_Bip_L_Hand', 'DEF-hand.L', 'hand_l'],
    description: 'Muñeca / Mano izquierda'
  },

  // === BRAZO DERECHO ===
  '右肩': {
    isIK: false,
    candidates: ['RightShoulder', 'mixamorigRightShoulder', 'J_Bip_R_Shoulder', 'DEF-shoulder.R', 'clavicle_r'],
    description: 'Clavícula / Hombro derecho'
  },
  '右腕': {
    isIK: false,
    candidates: ['RightArm', 'mixamorigRightArm', 'J_Bip_R_UpperArm', 'DEF-upper_arm.R', 'upperarm_r'],
    description: 'Brazo derecho'
  },
  '右ひじ': {
    isIK: false,
    candidates: ['RightForeArm', 'mixamorigRightForeArm', 'J_Bip_R_LowerArm', 'DEF-forearm.R', 'lowerarm_r'],
    description: 'Antebrazo / Codo derecho'
  },
  '右手首': {
    isIK: false,
    candidates: ['RightHand', 'mixamorigRightHand', 'J_Bip_R_Hand', 'DEF-hand.R', 'hand_r'],
    description: 'Muñeca / Mano derecha'
  },

  // === PIERNA IZQUIERDA (DEFORMACIÓN FK) ===
  '左足': {
    isIK: false,
    candidates: ['LeftUpLeg', 'mixamorigLeftUpLeg', 'J_Bip_L_UpperLeg', 'DEF-thigh.L', 'thigh_l', '足.L'],
    description: 'Muslo izquierdo (FK)'
  },
  '左ひざ': {
    isIK: false,
    candidates: ['LeftLeg', 'mixamorigLeftLeg', 'J_Bip_L_LowerLeg', 'DEF-shin.L', 'calf_l', 'ひざ.L'],
    description: 'Rodilla / Espinilla izquierda (FK)'
  },
  '左足首': {
    isIK: false,
    candidates: ['LeftFoot', 'mixamorigLeftFoot', 'J_Bip_L_Foot', 'DEF-foot.L', 'foot_l', '足首.L'],
    description: 'Tobillo / Pie izquierdo (FK)'
  },
  '左つま先': {
    isIK: false,
    candidates: ['LeftToeBase', 'mixamorigLeftToeBase', 'J_Bip_L_ToeBase', 'DEF-toe.L', 'toe_l', 'つま先.L'],
    description: 'Punta pie izquierdo (FK)'
  },

  // === PIERNA DERECHA (DEFORMACIÓN FK) ===
  '右足': {
    isIK: false,
    candidates: ['RightUpLeg', 'mixamorigRightUpLeg', 'J_Bip_R_UpperLeg', 'DEF-thigh.R', 'thigh_r', '足.R'],
    description: 'Muslo derecho (FK)'
  },
  '右ひざ': {
    isIK: false,
    candidates: ['RightLeg', 'mixamorigRightLeg', 'J_Bip_R_LowerLeg', 'DEF-shin.R', 'calf_r', 'ひざ.R'],
    description: 'Rodilla / Espinilla derecha (FK)'
  },
  '右足首': {
    isIK: false,
    candidates: ['RightFoot', 'mixamorigRightFoot', 'J_Bip_R_Foot', 'DEF-foot.R', 'foot_r', '足首.R'],
    description: 'Tobillo / Pie derecho (FK)'
  },
  '右つま先': {
    isIK: false,
    candidates: ['RightToeBase', 'mixamorigRightToeBase', 'J_Bip_R_ToeBase', 'DEF-toe.R', 'toe_r', 'つま先.R'],
    description: 'Punta pie derecho (FK)'
  },

  // === OBJETIVOS IK DE PIERNAS (CINEMÁTICA INVERSA) ===
  // CRÍTICO: Estos huesos en VMD portan el vector de posición del pie en el suelo.
  // En modelos PMX nativos, corresponden a los huesos IK reales (左足ＩＫ, 右足ＩＫ).
  // En modelos VRM/Mixamo NO deben asignarse al hueso de deformación FK (LeftFoot);
  // deben ser consumidos por el Two-Bone Leg IK Solver analítico.
  '左足ＩＫ': {
    isIK: true,
    candidates: ['左足ＩＫ', '左足IK', 'LeftFootIK', 'IK_Foot_L', 'ik_foot_l'],
    description: 'Objetivo IK pie izquierdo'
  },
  '左つま先ＩＫ': {
    isIK: true,
    candidates: ['左つま先ＩＫ', '左つま先IK', 'LeftToeIK', 'IK_Toe_L', 'ik_toe_l'],
    description: 'Objetivo IK punta pie izquierdo'
  },
  '右足ＩＫ': {
    isIK: true,
    candidates: ['右足ＩＫ', '右足IK', 'RightFootIK', 'IK_Foot_R', 'ik_foot_r'],
    description: 'Objetivo IK pie derecho'
  },
  '右つま先ＩＫ': {
    isIK: true,
    candidates: ['右つま先ＩＫ', '右つま先IK', 'RightToeIK', 'IK_Toe_R', 'ik_toe_r'],
    description: 'Objetivo IK punta pie derecho'
  },

  // === DEDOS MANO IZQUIERDA ===
  '左親指１': { isIK: false, candidates: ['LeftHandThumb1', 'mixamorigLeftHandThumb1', 'J_Bip_L_Thumb1'], description: 'Pulgar L 1' },
  '左親指２': { isIK: false, candidates: ['LeftHandThumb2', 'mixamorigLeftHandThumb2', 'J_Bip_L_Thumb2'], description: 'Pulgar L 2' },
  '左人指１': { isIK: false, candidates: ['LeftHandIndex1', 'mixamorigLeftHandIndex1', 'J_Bip_L_Index1'], description: 'Índice L 1' },
  '左人指２': { isIK: false, candidates: ['LeftHandIndex2', 'mixamorigLeftHandIndex2', 'J_Bip_L_Index2'], description: 'Índice L 2' },
  '左中指１': { isIK: false, candidates: ['LeftHandMiddle1', 'mixamorigLeftHandMiddle1', 'J_Bip_L_Middle1'], description: 'Medio L 1' },
  '左中指２': { isIK: false, candidates: ['LeftHandMiddle2', 'mixamorigLeftHandMiddle2', 'J_Bip_L_Middle2'], description: 'Medio L 2' },
  '左薬指１': { isIK: false, candidates: ['LeftHandRing1', 'mixamorigLeftHandRing1', 'J_Bip_L_Ring1'], description: 'Anular L 1' },
  '左薬指２': { isIK: false, candidates: ['LeftHandRing2', 'mixamorigLeftHandRing2', 'J_Bip_L_Ring2'], description: 'Anular L 2' },
  '左小指１': { isIK: false, candidates: ['LeftHandPinky1', 'mixamorigLeftHandPinky1', 'J_Bip_L_Little1'], description: 'Meñique L 1' },
  '左小指２': { isIK: false, candidates: ['LeftHandPinky2', 'mixamorigLeftHandPinky2', 'J_Bip_L_Little2'], description: 'Meñique L 2' },

  // === DEDOS MANO DERECHA ===
  '右親指１': { isIK: false, candidates: ['RightHandThumb1', 'mixamorigRightHandThumb1', 'J_Bip_R_Thumb1'], description: 'Pulgar R 1' },
  '右親指２': { isIK: false, candidates: ['RightHandThumb2', 'mixamorigRightHandThumb2', 'J_Bip_R_Thumb2'], description: 'Pulgar R 2' },
  '右人指１': { isIK: false, candidates: ['RightHandIndex1', 'mixamorigRightHandIndex1', 'J_Bip_R_Index1'], description: 'Índice R 1' },
  '右人指２': { isIK: false, candidates: ['RightHandIndex2', 'mixamorigRightHandIndex2', 'J_Bip_R_Index2'], description: 'Índice R 2' },
  '右中指１': { isIK: false, candidates: ['RightHandMiddle1', 'mixamorigRightHandMiddle1', 'J_Bip_R_Middle1'], description: 'Medio R 1' },
  '右中指２': { isIK: false, candidates: ['RightHandMiddle2', 'mixamorigRightHandMiddle2', 'J_Bip_R_Middle2'], description: 'Medio R 2' },
  '右薬指１': { isIK: false, candidates: ['RightHandRing1', 'mixamorigRightHandRing1', 'J_Bip_R_Ring1'], description: 'Anular R 1' },
  '右薬指２': { isIK: false, candidates: ['RightHandRing2', 'mixamorigRightHandRing2', 'J_Bip_R_Ring2'], description: 'Anular R 2' },
  '右小指１': { isIK: false, candidates: ['RightHandPinky1', 'mixamorigRightHandPinky1', 'J_Bip_R_Little1'], description: 'Meñique R 1' },
  '右小指２': { isIK: false, candidates: ['RightHandPinky2', 'mixamorigRightHandPinky2', 'J_Bip_R_Little2'], description: 'Meñique R 2' }
};

/**
 * Normaliza un nombre de hueso MMD eliminando bytes nulos (\0),
 * convirtiendo caracteres fullwidth (ＩＫ -> IK, １ -> 1) a ASCII
 * y recortando espacios en blanco.
 */
export function normalizeMmdBoneName(name: string): string {
  if (!name) return '';
  return name
    .replace(/\0/g, '')
    // Convierte caracteres fullwidth (U+FF01 a U+FF5E) a ASCII estándar (ej: ＩＫ -> IK, １ -> 1)
    .replace(/[\uFF01-\uFF5E]/g, (ch) => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .trim();
}

/**
 * Determina si un hueso MMD es un objetivo IK de cinemática inversa
 */
export function isMmdIkBone(boneName: string): boolean {
  const norm = normalizeMmdBoneName(boneName);
  if (norm.toUpperCase().includes('IK')) return true;
  return MMD_BONE_DICTIONARY[norm]?.isIK || false;
}

/**
 * Normaliza nombres de huesos del avatar para comparación flexible:
 * Elimina prefijos comunes como 'mixamorig:', 'mixamorig_', 'j_bip_c_', 'bip01_', 'def-', etc.,
 * y signos de puntuación como dos puntos, puntos y guiones.
 */
function cleanModelBoneName(name: string): string {
  return name
    .toLowerCase()
    .replace(/^(mixamorig[:_]?|j_bip_[clr]_?|bip01_?|def-?|org-?)/i, '')
    .replace(/[:_\-.]/g, '');
}

/**
 * Encuentra el nombre real del hueso destino en el esqueleto del avatar.
 * Soporta coincidencia exacta, nombres de candidatos universales, namespaces (ej: mixamorig:LeftUpLeg)
 * y comparación insensible a mayúsculas y prefijos.
 */
export function findTargetBoneName(mmdBoneName: string, modelBones: Set<string>): string | null {
  const normMmd = normalizeMmdBoneName(mmdBoneName);

  // Si el modelo ya usa nombres MMD (PMX cargado directamente o modelo japonés)
  if (modelBones.has(normMmd)) return normMmd;
  if (modelBones.has(mmdBoneName)) return mmdBoneName;
  for (const b of modelBones) {
    if (normalizeMmdBoneName(b) === normMmd) return b;
  }

  const entry = MMD_BONE_DICTIONARY[normMmd] || MMD_BONE_DICTIONARY[mmdBoneName];
  if (!entry) return null;

  // 1. Coincidencia exacta de candidatos
  for (const cand of entry.candidates) {
    if (modelBones.has(cand)) return cand;
  }

  // 2. Coincidencia insensible a mayúsculas
  const lowerCandList = entry.candidates.map(c => c.toLowerCase());
  for (const bone of modelBones) {
    if (lowerCandList.includes(bone.toLowerCase())) return bone;
  }

  // 3. Coincidencia con nombres limpios (soporta namespaces como mixamorig:LeftUpLeg, Rigify DEF-thigh.L)
  const cleanCandList = entry.candidates.map(c => cleanModelBoneName(c));
  for (const bone of modelBones) {
    const cleanBone = cleanModelBoneName(bone);
    if (cleanCandList.includes(cleanBone)) return bone;
  }

  return null;
}

