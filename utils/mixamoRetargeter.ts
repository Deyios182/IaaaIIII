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
  { mixamoName: 'mixamorigHips',    keywords: ['hip', 'pelvis', 'root'], side: null, priority: 10 },
  { mixamoName: 'mixamorigSpine',   keywords: ['spine'], side: null, priority: 9 },
  { mixamoName: 'mixamorigSpine1',  keywords: ['spine'], side: null, priority: 9 },
  { mixamoName: 'mixamorigSpine2',  keywords: ['spine', 'chest'], side: null, priority: 9 },
  { mixamoName: 'mixamorigNeck',    keywords: ['neck'], side: null, priority: 8 },
  { mixamoName: 'mixamorigHead',    keywords: ['head'], side: null, priority: 8 },

  // === BRAZO IZQUIERDO ===
  { mixamoName: 'mixamorigLeftShoulder', keywords: ['shoulder', 'clavicle', 'leftshoulder'], side: 'L', priority: 7 },
  { mixamoName: 'mixamorigLeftArm',      keywords: ['upper_arm', 'upperarm', 'arm', 'uparm', 'leftarm'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftForeArm',  keywords: ['forearm', 'fore_arm', 'lowerarm', 'lower_arm', 'leftforearm'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftHand',     keywords: ['hand', 'wrist', 'lefthand'], side: 'L', priority: 7 },

  // === BRAZO DERECHO ===
  { mixamoName: 'mixamorigRightShoulder', keywords: ['shoulder', 'clavicle', 'rightshoulder'], side: 'R', priority: 7 },
  { mixamoName: 'mixamorigRightArm',      keywords: ['upper_arm', 'upperarm', 'arm', 'uparm', 'rightarm'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightForeArm',  keywords: ['forearm', 'fore_arm', 'lowerarm', 'lower_arm', 'rightforearm'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightHand',     keywords: ['hand', 'wrist', 'righthand'], side: 'R', priority: 7 },

  // === PIERNA IZQUIERDA ===
  { mixamoName: 'mixamorigLeftUpLeg',   keywords: ['thigh', 'upleg', 'upper_leg', 'upperleg'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftLeg',     keywords: ['shin', 'leg', 'calf', 'lowerleg', 'lower_leg'], side: 'L', priority: 8 },
  { mixamoName: 'mixamorigLeftFoot',    keywords: ['foot', 'ankle'], side: 'L', priority: 7 },
  { mixamoName: 'mixamorigLeftToeBase', keywords: ['toe'], side: 'L', priority: 5 },

  // === PIERNA DERECHA ===
  { mixamoName: 'mixamorigRightUpLeg',   keywords: ['thigh', 'upleg', 'upper_leg', 'upperleg'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightLeg',     keywords: ['shin', 'leg', 'calf', 'lowerleg', 'lower_leg'], side: 'R', priority: 8 },
  { mixamoName: 'mixamorigRightFoot',    keywords: ['foot', 'ankle'], side: 'R', priority: 7 },
  { mixamoName: 'mixamorigRightToeBase', keywords: ['toe'], side: 'R', priority: 5 },

  // === DEDOS IZQUIERDOS ===
  { mixamoName: 'mixamorigLeftHandThumb1',  keywords: ['thumb', 'thumb01', 'thumb.01'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandThumb2',  keywords: ['thumb', 'thumb02', 'thumb.02'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandThumb3',  keywords: ['thumb', 'thumb03', 'thumb.03'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandIndex1',  keywords: ['index', 'f_index01'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandIndex2',  keywords: ['index', 'f_index02'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandIndex3',  keywords: ['index', 'f_index03'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandMiddle1', keywords: ['middle', 'f_middle01'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandMiddle2', keywords: ['middle', 'f_middle02'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandMiddle3', keywords: ['middle', 'f_middle03'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandRing1',   keywords: ['ring', 'f_ring01'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandRing2',   keywords: ['ring', 'f_ring02'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandRing3',   keywords: ['ring', 'f_ring03'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandPinky1',  keywords: ['pinky', 'f_pinky01'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandPinky2',  keywords: ['pinky', 'f_pinky02'], side: 'L', priority: 3 },
  { mixamoName: 'mixamorigLeftHandPinky3',  keywords: ['pinky', 'f_pinky03'], side: 'L', priority: 3 },

  // === DEDOS DERECHOS ===
  { mixamoName: 'mixamorigRightHandThumb1',  keywords: ['thumb', 'thumb01', 'thumb.01'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandThumb2',  keywords: ['thumb', 'thumb02', 'thumb.02'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandThumb3',  keywords: ['thumb', 'thumb03', 'thumb.03'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandIndex1',  keywords: ['index', 'f_index01'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandIndex2',  keywords: ['index', 'f_index02'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandIndex3',  keywords: ['index', 'f_index03'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandMiddle1', keywords: ['middle', 'f_middle01'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandMiddle2', keywords: ['middle', 'f_middle02'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandMiddle3', keywords: ['middle', 'f_middle03'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandRing1',   keywords: ['ring', 'f_ring01'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandRing2',   keywords: ['ring', 'f_ring02'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandRing3',   keywords: ['ring', 'f_ring03'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandPinky1',  keywords: ['pinky', 'f_pinky01'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandPinky2',  keywords: ['pinky', 'f_pinky02'], side: 'R', priority: 3 },
  { mixamoName: 'mixamorigRightHandPinky3',  keywords: ['pinky', 'f_pinky03'], side: 'R', priority: 3 },
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
 * Checa si un nombre de hueso pertenece a un lado (L/R)
 */
function matchesSide(boneName: string, side: 'L' | 'R' | null): boolean {
  if (side === null) return true;
  const n = boneName;
  const lower = n.toLowerCase();

  if (side === 'L') {
    return lower.includes('.l') || lower.includes('_l_') || lower.includes('_l.') ||
           lower.endsWith('l') || lower.endsWith('.l') || lower.endsWith('_l') ||
           lower.includes('left') || n.includes('.L') || n.includes('_L_') ||
           n.includes('_L.') || n.endsWith('L') || n.endsWith('_L');
  } else {
    return lower.includes('.r') || lower.includes('_r_') || lower.includes('_r.') ||
           lower.endsWith('r') || lower.endsWith('.r') || lower.endsWith('_r') ||
           lower.includes('right') || n.includes('.R') || n.includes('_R_') ||
           n.includes('_R.') || n.endsWith('R') || n.endsWith('_R');
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

  // Buscar keywords
  let score = 0;
  for (const keyword of definition.keywords) {
    if (lower.includes(keyword.toLowerCase())) {
      score += keyword.length;
    }
  }

  // Bonus MASIVO para huesos DEF- (son los de deformación en Rigify)
  if (lower.startsWith('def-')) score += 50;
  
  // Bonus para nombres limpios/estándar (ej: "Head", "LeftArm")
  const pureMixamoName = definition.mixamoName.replace('mixamorig', '').toLowerCase();
  if (lower === pureMixamoName) score += 30;
  if (lower.includes(pureMixamoName)) score += 10;

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

  // Para huesos de spine, necesitamos ordenarlos
  const spineBonesInModel: string[] = [];
  modelBoneNames.forEach(name => {
    if (name.toLowerCase().includes('spine') &&
        !name.toLowerCase().includes('ik') &&
        !name.toLowerCase().includes('mch') &&
        !name.toLowerCase().includes('org')) {
      spineBonesInModel.push(name);
    }
  });
  spineBonesInModel.sort(); // Ordenar: DEF-spine, DEF-spine.001, DEF-spine.002, etc.

  // Hips: Debe ser la pelvis/caderas del personaje (def-pelvis, pelvis, hips, j_bip_c_hips)
  // NUNCA 'root', 'armature' ni 'torso', ya que eso rotaría el contenedor 3D entero 90° hacia atrás.
  let hipBone = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'def-pelvis') ||
    Array.from(modelBoneNames).find(n => {
      const lower = n.toLowerCase();
      return (lower.includes('pelvis') || lower.includes('hip')) &&
             !lower.includes('ik') && !lower.includes('mch') && !lower.includes('org') &&
             lower !== 'root' && lower !== 'armature' && lower !== 'torso';
    });

  if (!hipBone) {
    hipBone = Array.from(modelBoneNames).find(n => {
      const lower = n.toLowerCase();
      return lower.includes('hips') && lower !== 'root' && lower !== 'armature' && lower !== 'torso';
    });
  }

  if (!hipBone && spineBonesInModel.length > 0) {
    hipBone = spineBonesInModel[0];
  }

  if (hipBone) {
    mapping.set('mixamorigHips', hipBone);
    usedBones.add(hipBone);
    results.push({ mixamoBone: 'mixamorigHips', targetBone: hipBone, confidence: 0.9, priority: 10 });
  }

  // Spine1, Spine2, Spine3 = spine bones después de hips
  const remainingSpines = spineBonesInModel.filter(s => s !== hipBone);

  const spineNames = ['mixamorigSpine', 'mixamorigSpine1', 'mixamorigSpine2'];
  spineNames.forEach((mixName, i) => {
    if (i < remainingSpines.length) {
      mapping.set(mixName, remainingSpines[i]);
      usedBones.add(remainingSpines[i]);
      results.push({ mixamoBone: mixName, targetBone: remainingSpines[i], confidence: 0.8, priority: 9 });
    }
  });

  // Neck y Head desde spine (últimos en la cadena)
  // NOTA: NO usar spine.004, 005, 006 si el usuario los usa para el CABELLO!
  const neckBone = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'def-neck') ||
    Array.from(modelBoneNames).find(n =>
      n.toLowerCase().includes('neck') &&
      !n.toLowerCase().includes('mch') && !n.toLowerCase().includes('org')
    );
    
  const headBone = Array.from(modelBoneNames).find(n => n.toLowerCase() === 'def-head') ||
    Array.from(modelBoneNames).find(n =>
      n.toLowerCase().includes('head') &&
      !n.toLowerCase().includes('mch') && !n.toLowerCase().includes('org')
    );

  if (neckBone) {
    mapping.set('mixamorigNeck', neckBone);
    usedBones.add(neckBone);
    results.push({ mixamoBone: 'mixamorigNeck', targetBone: neckBone, confidence: 0.85, priority: 8 });
  }
  if (headBone) {
    mapping.set('mixamorigHead', headBone);
    usedBones.add(headBone);
    results.push({ mixamoBone: 'mixamorigHead', targetBone: headBone, confidence: 0.85, priority: 8 });
  }

  // Mapear el resto de huesos (extremidades, dedos)
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
 * CLAVE: Aplica corrección de rest-pose para que las rotaciones de Mixamo
 * se interpreten correctamente en el esqueleto Rigify.
 * 
 * Fórmula: correctedQ = targetRest * inverse(sourceRest) * animQ
 */
export function retargetMixamoClip(
  clip: THREE.AnimationClip,
  targetBoneNames: Set<string>,
  targetModel?: THREE.Object3D,
  sourceRestPoses?: Map<string, THREE.Quaternion>,
  targetRestPoses?: Map<string, THREE.Quaternion>
): THREE.AnimationClip {
  const { mapping, results } = buildBoneMapping(targetBoneNames);

  const mapped = results.filter(r => r.targetBone).length;
  const total = results.filter(r => r.priority >= 5).length;
  console.log(`🔄 Bone mapping: ${mapped}/${total} huesos principales mapeados`);

  results.filter(r => r.priority >= 7).forEach(r => {
    const icon = r.targetBone ? '✅' : '❌';
    console.log(`  ${icon} ${r.mixamoBone} → ${r.targetBone || 'SIN MATCH'}`);
  });

  (window as any).__lastBoneMapping = results;
  (window as any).__lastBoneMappingMap = Object.fromEntries(mapping);

  // === Corrección de Rest Pose ===
  // Siempre aplicamos la corrección de rest-pose si tenemos las poses de reposo del source (Mixamo) y del target,
  // independientemente de si el modelo usa prefijos DEF- o nombres estándar (VRoid, DAZ, etc.).
  const shouldCorrectRestPose = Boolean(sourceRestPoses && targetRestPoses && sourceRestPoses.size > 0 && targetRestPoses.size > 0);
  
  if (shouldCorrectRestPose) {
    console.log(`✅ Aplicando corrección matemática de rest-pose para retargeting perfecto.`);
  } else {
    console.warn(`⚠️ Faltan rest-poses. Se usará copia directa de rotaciones.`);
  }

  const hipsTargetName = mapping.get('mixamorigHips');

  // Escala para root motion
  let rootScaleFactor = 0.01;
  if (targetModel) {
    const box = new THREE.Box3().setFromObject(targetModel);
    const modelHeight = box.max.y - box.min.y;
    if (modelHeight < 10) {
      rootScaleFactor = modelHeight / 170;
    } else {
      rootScaleFactor = 1;
    }
    console.log(`📏 Escala root: ${rootScaleFactor.toFixed(4)} (h=${modelHeight.toFixed(2)})`);
  }

  const retargeted = clip.clone();
  let keptRotations = 0;
  let correctedRotations = 0;
  let keptPosition = 0;

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
        return null; // EVITAR que se rote el contenedor global del personaje
      }

      // === ROTACIONES con corrección de rest-pose ===
      if (property === '.quaternion') {
        keptRotations++;
        const newTrack = track.clone();
        newTrack.name = targetName + property;

        // Aplicar corrección de rest pose SOLO si es modelo Rigify compatible
        if (shouldCorrectRestPose) {
          const srcRest = sourceRestPoses?.get(boneName);
          const tgtRest = targetRestPoses?.get(targetName);

          if (srcRest && tgtRest) {
            correctedRotations++;
            const srcRestInv = srcRest.clone().invert();
            const values = newTrack.values;

            for (let i = 0; i < values.length; i += 4) {
              const animQ = new THREE.Quaternion(values[i], values[i+1], values[i+2], values[i+3]);
              const delta = new THREE.Quaternion().multiplyQuaternions(srcRestInv, animQ);
              const corrected = new THREE.Quaternion().multiplyQuaternions(tgtRest, delta);
              values[i]   = corrected.x;
              values[i+1] = corrected.y;
              values[i+2] = corrected.z;
              values[i+3] = corrected.w;
            }
          }
        }

        return newTrack;
      }

      // Descartar TODOS los position tracks (incluido hips)
      // El root motion causa stretching severo en modelos con diferentes proporciones
      return null;
    })
    .filter((track): track is THREE.KeyframeTrack => track !== null);

  // INYECCIÓN RIGIFY: Mapear Hips correctamente a root o torso resuelve la mayoría de desconexiones.
  // No intentaremos combinar las pistas matemáticamente porque los quaternions ya están corregidos
  // por los rest poses locales y su multiplicación resultaría en ejes cruzados.

  console.log(`🎬 Retarget: ${keptRotations} rotaciones (${correctedRotations} corregidas) + ${keptPosition} posición raíz de ${clip.tracks.length} totales`);
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
