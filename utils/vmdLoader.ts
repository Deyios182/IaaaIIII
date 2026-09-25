/**
 * VMD Retargeter & Loader
 * Parsea animaciones .vmd (MikuMikuDance) y las traduce a THREE.AnimationClip
 * adaptadas al esqueleto de tu avatar (Mixamo / Rigify / VRM).
 */

import * as THREE from 'three';
// @ts-ignore
import { Parser as MMDParser } from 'mmd-parser';

// Mapeo exhaustivo de nombres de huesos MMD (en japonés kanji) a nombres de huesos universales (Mixamo / Avatar)
// Mapeo refinado de nombres de huesos MMD (en japonés kanji) a nombres de huesos del avatar
const MMD_BONE_TO_UNIVERSAL: Record<string, string[]> = {
  // Centro / Pelvis (MMD divide el centro en センター y 下半身)
  // センター lleva la traslación y rotación general de la pelvis
  // 下半身 lleva la inclinación de la cadera hacia las piernas
  'センター': ['Hips', 'mixamorigHips', 'DEF-pelvis', 'pelvis', 'root'],
  '下半身': ['Hips', 'mixamorigHips', 'DEF-pelvis', 'pelvis'],
  'グルーブ': ['Hips', 'mixamorigHips', 'DEF-pelvis', 'pelvis'],

  // Columna / Tronco
  '上半身': ['Spine', 'mixamorigSpine', 'DEF-spine', 'spine'],
  '上半身2': ['Spine1', 'mixamorigSpine1', 'Spine2', 'mixamorigSpine2', 'DEF-spine.001', 'chest'],
  '首': ['Neck', 'mixamorigNeck', 'DEF-neck', 'neck'],
  '頭': ['Head', 'mixamorigHead', 'DEF-head', 'head'],

  // Brazo Izquierdo
  '左肩': ['LeftShoulder', 'mixamorigLeftShoulder', 'DEF-shoulder.L', 'clavicle_l'],
  '左腕': ['LeftArm', 'mixamorigLeftArm', 'DEF-upper_arm.L', 'upperarm_l'],
  '左ひじ': ['LeftForeArm', 'mixamorigLeftForeArm', 'DEF-forearm.L', 'lowerarm_l'],
  '左手首': ['LeftHand', 'mixamorigLeftHand', 'DEF-hand.L', 'hand_l'],

  // Brazo Derecho
  '右肩': ['RightShoulder', 'mixamorigRightShoulder', 'DEF-shoulder.R', 'clavicle_r'],
  '右腕': ['RightArm', 'mixamorigRightArm', 'DEF-upper_arm.R', 'upperarm_r'],
  '右ひじ': ['RightForeArm', 'mixamorigRightForeArm', 'DEF-forearm.R', 'lowerarm_r'],
  '右手首': ['RightHand', 'mixamorigRightHand', 'DEF-hand.R', 'hand_r'],

  // Pierna Izquierda
  '左足': ['LeftUpLeg', 'mixamorigLeftUpLeg', 'DEF-thigh.L', 'thigh_l', '足.L'],
  '左ひざ': ['LeftLeg', 'mixamorigLeftLeg', 'DEF-shin.L', 'calf_l', 'ひざ.L'],
  '左足首': ['LeftFoot', 'mixamorigLeftFoot', 'DEF-foot.L', 'foot_l', '足首.L'],
  '左つま先': ['LeftToeBase', 'mixamorigLeftToeBase', 'DEF-toe.L', 'toe_l', 'つま先.L'],
  '左足ＩＫ': ['LeftFoot', 'mixamorigLeftFoot', 'DEF-foot.L', 'foot_l', '足ＩＫ.L'],
  '左つま先ＩＫ': ['LeftToeBase', 'mixamorigLeftToeBase', 'DEF-toe.L', 'toe_l', 'つま先ＩＫ.L'],

  // Pierna Derecha
  '右足': ['RightUpLeg', 'mixamorigRightUpLeg', 'DEF-thigh.R', 'thigh_r', '足.R'],
  '右ひざ': ['RightLeg', 'mixamorigRightLeg', 'DEF-shin.R', 'calf_r', 'ひざ.R'],
  '右足首': ['RightFoot', 'mixamorigRightFoot', 'DEF-foot.R', 'foot_r', '足首.R'],
  '右つま先': ['RightToeBase', 'mixamorigRightToeBase', 'DEF-toe.R', 'toe_r', 'つま先.R'],
  '右足ＩＫ': ['RightFoot', 'mixamorigRightFoot', 'DEF-foot.R', 'foot_r', '足ＩＫ.R'],
  '右つま先ＩＫ': ['RightToeBase', 'mixamorigRightToeBase', 'DEF-toe.R', 'toe_r', 'つま先ＩＫ.R'],

  // Dedos Izquierdos
  '左親指１': ['LeftHandThumb1', 'mixamorigLeftHandThumb1'],
  '左親指２': ['LeftHandThumb2', 'mixamorigLeftHandThumb2'],
  '左人指１': ['LeftHandIndex1', 'mixamorigLeftHandIndex1'],
  '左人指２': ['LeftHandIndex2', 'mixamorigLeftHandIndex2'],
  '左中指１': ['LeftHandMiddle1', 'mixamorigLeftHandMiddle1'],
  '左中指２': ['LeftHandMiddle2', 'mixamorigLeftHandMiddle2'],
  '左薬指１': ['LeftHandRing1', 'mixamorigLeftHandRing1'],
  '左薬指２': ['LeftHandRing2', 'mixamorigLeftHandRing2'],
  '左小指１': ['LeftHandPinky1', 'mixamorigLeftHandPinky1'],
  '左小指２': ['LeftHandPinky2', 'mixamorigLeftHandPinky2'],

  // Dedos Derechos
  '右親指１': ['RightHandThumb1', 'mixamorigRightHandThumb1'],
  '右親指２': ['RightHandThumb2', 'mixamorigRightHandThumb2'],
  '右人指１': ['RightHandIndex1', 'mixamorigRightHandIndex1'],
  '右人指２': ['RightHandIndex2', 'mixamorigRightHandIndex2'],
  '右中指１': ['RightHandMiddle1', 'mixamorigRightHandMiddle1'],
  '右中指２': ['RightHandMiddle2', 'mixamorigRightHandMiddle2'],
  '右薬指１': ['RightHandRing1', 'mixamorigRightHandRing1'],
  '右薬指２': ['RightHandRing2', 'mixamorigRightHandRing2'],
  '右小指１': ['RightHandPinky1', 'mixamorigRightHandPinky1'],
  '右小指２': ['RightHandPinky2', 'mixamorigRightHandPinky2'],
};

/**
 * Encuentra el nombre real del hueso en el esqueleto del avatar
 */
function findTargetBoneName(mmdBoneName: string, modelBones: Set<string>): string | null {
  // Si el avatar ya es un modelo MMD/PMX, tendrá exactamente este nombre en japonés
  if (modelBones.has(mmdBoneName)) return mmdBoneName;

  const candidates = MMD_BONE_TO_UNIVERSAL[mmdBoneName];
  if (!candidates) return null;

  for (const cand of candidates) {
    if (modelBones.has(cand)) return cand;
  }

  for (const cand of candidates) {
    const lowerCand = cand.toLowerCase();
    for (const bone of modelBones) {
      if (bone.toLowerCase() === lowerCand) return bone;
    }
  }

  return null;
}

export interface VmdInspectionResult {
  hasMotions: boolean;
  hasCameras: boolean;
  hasMorphs: boolean;
  motionCount: number;
  cameraCount: number;
  morphCount: number;
  duration: number; // en segundos
}

/**
 * Inspecciona un buffer VMD para determinar su contenido sin procesar el esqueleto completo
 */
export function inspectVmd(buffer: ArrayBuffer): VmdInspectionResult {
  try {
    const parser = new MMDParser();
    const vmd = parser.parseVmd(buffer);
    if (!vmd) {
      return { hasMotions: false, hasCameras: false, hasMorphs: false, motionCount: 0, cameraCount: 0, morphCount: 0, duration: 0 };
    }

    const motionCount = vmd.motions?.length || 0;
    const cameraCount = vmd.cameras?.length || 0;
    const morphCount = vmd.morphs?.length || 0;

    let maxFrame = 0;
    if (vmd.motions) {
      for (let i = 0; i < vmd.motions.length; i++) {
        if (vmd.motions[i].frameNum > maxFrame) maxFrame = vmd.motions[i].frameNum;
      }
    }
    if (vmd.cameras) {
      for (let i = 0; i < vmd.cameras.length; i++) {
        if (vmd.cameras[i].frameNum > maxFrame) maxFrame = vmd.cameras[i].frameNum;
      }
    }

    return {
      hasMotions: motionCount > 0,
      hasCameras: cameraCount > 0,
      hasMorphs: morphCount > 0,
      motionCount,
      cameraCount,
      morphCount,
      duration: maxFrame / 30.0
    };
  } catch {
    return { hasMotions: false, hasCameras: false, hasMorphs: false, motionCount: 0, cameraCount: 0, morphCount: 0, duration: 0 };
  }
}

/**
 * Parsea los keyframes de cámara de un VMD y devuelve un THREE.AnimationClip para PerspectiveCamera
 * @param buffer ArrayBuffer del archivo .vmd
 * @param name Nombre del clip de cámara
 * @param scale Escala métrica (1.0 para modelos PMX MMD, 0.08 para avatares estándar GLB/VRM)
 */
export function loadVmdCameraClip(
  buffer: ArrayBuffer,
  name: string,
  scale: number = 0.22,
  yOffset: number = -1.5
): THREE.AnimationClip | null {
  try {
    const parser = new MMDParser();
    const vmd = parser.parseVmd(buffer);
    if (!vmd || !vmd.cameras || vmd.cameras.length === 0) {
      return null;
    }

    const cameras = vmd.cameras.slice().sort((a: any, b: any) => a.frameNum - b.frameNum);
    const times: number[] = [];
    const centers: number[] = [];
    const quaternions: number[] = [];
    const positions: number[] = [];
    const fovs: number[] = [];

    const quaternion = new THREE.Quaternion();
    const euler = new THREE.Euler();
    const position = new THREE.Vector3();
    const center = new THREE.Vector3();

    for (let i = 0; i < cameras.length; i++) {
      const motion = cameras[i];
      const time = motion.frameNum / 30.0;
      const pos = motion.position;
      const rot = motion.rotation;
      const distance = motion.distance;
      const fov = motion.fov;

      times.push(time);

      // Conversión de coordenadas MMD a Three.js:
      // 1. pos es el punto objetivo (lookAt target):
      //    - pos[0] es X (mismo signo)
      //    - pos[1] es Y: escalado y ajustado con yOffset para coincidir con la posición del avatar en el visor
      //    - pos[2] es Z: en MMD +Z es hacia adentro de la pantalla, en Three.js hacia el usuario (-pos[2])
      center.set(
        pos[0] * scale,
        pos[1] * scale + yOffset,
        -pos[2] * scale
      );

      // 2. Rotación: orden YXZ (pan, tilt, roll) con signos de conversión izquierda-a-derecha
      euler.set(-rot[0], -rot[1], -rot[2], 'YXZ');
      quaternion.setFromEuler(euler);

      // 3. Posición de la cámara en el mundo 3D:
      //    En Three.js la cámara apunta hacia -Z por defecto.
      //    La cámara orbita alrededor de `center` a una distancia de `scaledDistance` a lo largo del eje +Z local:
      const scaledDistance = Math.abs(distance) * scale;
      position.set(0, 0, scaledDistance);
      position.applyQuaternion(quaternion); // Rota la distancia relativa respecto al centro
      position.add(center);                 // Añade la posición del objetivo en el mundo

      centers.push(center.x, center.y, center.z);
      quaternions.push(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
      positions.push(position.x, position.y, position.z);
      fovs.push(fov);
    }

    const tracks: THREE.KeyframeTrack[] = [
      new THREE.VectorKeyframeTrack('target.position', times, centers),
      new THREE.QuaternionKeyframeTrack('.quaternion', times, quaternions),
      new THREE.VectorKeyframeTrack('.position', times, positions),
      new THREE.NumberKeyframeTrack('.fov', times, fovs)
    ];

    const maxTime = times[times.length - 1] || 0;
    const clip = new THREE.AnimationClip(name, maxTime, tracks);
    clip.userData = { isCameraOnly: true, hasCamera: true };
    console.log(`🎥 [VMDLoader] Clip de cámara cinematográfica creado "${name}": ${maxTime.toFixed(1)}s, ${cameras.length} keyframes (escala ${scale}, yOffset ${yOffset})`);
    return clip;
  } catch (err) {
    console.error(`❌ Error parseando cámara VMD "${name}":`, err);
    return null;
  }
}

import { retargetVmdToAnimationClip } from './vmdRetargeter';
export { retargetVmdToAnimationClip } from './vmdRetargeter';
export * from './mmdBoneMap';
export * from './legIkSolver';

/**
 * Parsea un ArrayBuffer de un archivo .vmd y construye un THREE.AnimationClip retargeteado.
 * Extrae tanto animación de personaje como de cámara si ambas están presentes.
 */
export async function loadVmdAnimationClip(
  buffer: ArrayBuffer,
  name: string,
  modelBoneNames: Set<string>,
  targetRestPoses?: Map<string, THREE.Quaternion>,
  targetRestPositions?: Map<string, THREE.Vector3>,
  isPMXScale: boolean = false,
  targetMorphMeshes?: Array<{ name: string; dictionary: Record<string, number> }>
): Promise<THREE.AnimationClip | null> {
  try {
    const parser = new MMDParser();
    // Suprimir spam de mmd-parser que satura el main thread (ej. unknown char code 144)
    const originalWarn = console.warn;
    const originalLog = console.log;
    const originalError = console.error;
    const filterSpam = (originalFn: any) => (...args: any[]) => {
        if (typeof args[0] === 'string' && args[0].includes('unknown char code')) return;
        originalFn(...args);
    };
    console.warn = filterSpam(originalWarn);
    console.log = filterSpam(originalLog);
    console.error = filterSpam(originalError);
    
    let vmd;
    try {
        vmd = parser.parseVmd(buffer);
    } finally {
        console.warn = originalWarn;
        console.log = originalLog;
        console.error = originalError;
    }

    if (!vmd) {
      console.warn(`⚠️ VMD "${name}" no se pudo parsear.`);
      return null;
    }

    // Escala métrica unificada de cámara para encajar exactamente con el avatar en pantalla
    const cameraScale = 0.22;
    const cameraYOffset = -1.5;

    const hasMotions = !!(vmd.motions && vmd.motions.length > 0);
    const hasCameras = !!(vmd.cameras && vmd.cameras.length > 0);
    const hasMorphs = !!(vmd.morphs && vmd.morphs.length > 0);

    // Caso 1: VMD exclusivo de cámara
    if (!hasMotions && !hasMorphs && hasCameras) {
      console.log(`🎥 VMD "${name}" detectado como archivo exclusivo de cámara.`);
      const cameraClip = loadVmdCameraClip(buffer, `${name}_camera`, cameraScale, cameraYOffset);
      if (cameraClip) {
        cameraClip.userData = { isCameraOnly: true, cameraClip, hasCamera: true };
        return cameraClip;
      }
      return null;
    }

    // Caso 2: VMD sin datos de movimiento, morphs ni cámara
    if (!hasMotions && !hasMorphs) {
      console.warn(`⚠️ VMD "${name}" no contiene datos de movimiento ni de morphs.`);
      return null;
    }

    console.log(`🌸 [VMDLoader] Procesando "${name}": ${vmd.motions?.length || 0} keyframes de huesos, ${vmd.morphs?.length || 0} morphs faciales` + (vmd.cameras?.length ? `, ${vmd.cameras.length} keyframes de cámara` : ''));

    // Si tiene cámara integrada, crear también el clip de cámara
    let embeddedCameraClip: THREE.AnimationClip | null = null;
    if (vmd.cameras && vmd.cameras.length > 0) {
      embeddedCameraClip = loadVmdCameraClip(buffer, `${name}_camera`, cameraScale, cameraYOffset);
    }

    const motionClip = retargetVmdToAnimationClip(buffer, {
      name,
      modelBoneNames,
      targetRestPoses,
      targetRestPositions,
      isPMXScale,
      targetMorphMeshes
    });

    if (motionClip && embeddedCameraClip) {
      motionClip.userData = {
        ...motionClip.userData,
        cameraClip: embeddedCameraClip,
        hasCamera: true
      };
      console.log(`🎥 [VMDLoader] Cámara cinematográfica integrada adjuntada a "${name}".`);
    }

    return motionClip;

  } catch (err) {
    console.error(`❌ Error parseando archivo VMD "${name}":`, err);
    return null;
  }
}

