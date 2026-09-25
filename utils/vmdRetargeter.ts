/**
 * VMD Retargeter
 * Convierte animaciones .vmd (MikuMikuDance) en THREE.AnimationClip adaptadas
 * al esqueleto del modelo cargado (VRM / Mixamo / Rigify / PMX).
 * 
 * Reglas esenciales:
 * 1. Rotaciones FK a los huesos de deformación del esqueleto.
 * 2. Posición SOLO para caderas/pelvis (センター, グルーブ, 全ての親, Hips).
 * 3. Las pistas de objetivos IK (左足ＩＫ, 右足ＩＫ) NO van al mixer como tracks
 *    de deformación de huesos; se extraen a clip.userData.ikData para el Leg IK Solver.
 */

import * as THREE from 'three';
// @ts-ignore
import { Parser as MMDParser } from 'mmd-parser';
import { findTargetBoneName, isMmdIkBone, normalizeMmdBoneName } from './mmdBoneMap';
import { VmdIkData, VmdBoneKeyframe } from './legIkSolver';

export interface RetargetVmdOptions {
  name: string;
  modelBoneNames: Set<string>;
  targetRestPoses?: Map<string, THREE.Quaternion>;
  targetRestPositions?: Map<string, THREE.Vector3>;
  isPMXScale?: boolean;
  targetMorphMeshes?: Array<{ name: string; dictionary: Record<string, number> }>;
}

// Mapeo de morphs MMD tradicionales (japonés) a blendshapes estándar (VRM / GLTF / Mixamo)
const MORPH_ALIASES: Record<string, string[]> = {
  // Ojos / Parpadeo
  'まばたき': ['blink', 'eye_blink', 'fcl_eye_close', 'eyeblink', 'blink_l', 'blink_r', 'fcl_eye_close_l', 'fcl_eye_close_r'],
  '笑い': ['joy', 'smile', 'happy', 'fcl_all_joy', 'fcl_mth_joy', 'blink_happy', 'eye_blink_happy'],
  'ウィンク': ['wink', 'wink_l', 'eyeblinkleft', 'blink_l', 'fcl_eye_close_l'],
  'ウインク': ['wink', 'wink_l', 'eyeblinkleft', 'blink_l', 'fcl_eye_close_l'],
  'ウィンク右': ['wink_r', 'eyeblinkright', 'blink_r', 'fcl_eye_close_r'],
  'ウインク右': ['wink_r', 'eyeblinkright', 'blink_r', 'fcl_eye_close_r'],
  'ウィンク２': ['wink_l', 'blink_l'],
  'なごみ': ['calm', 'joy', 'smile', 'fcl_all_joy'],
  'びっくり': ['surprised', 'surprise', 'eyewide', 'fcl_all_surprised'],
  'じと目': ['jitome', 'doubt', 'eyehide', 'fcl_all_doubt'],
  '瞳小': ['eyesmall', 'pupilsmall'],
  // Cejas
  '怒り': ['angry', 'fcl_all_angry', 'browsdown', 'eyebrow_angry'],
  '困り': ['sorrow', 'sad', 'fcl_all_sorrow', 'browsup', 'eyebrow_sad'],
  'にこり': ['joy', 'smile', 'browsdown'],
  '下': ['browsdown', 'eyebrow_down'],
  '上': ['browsup', 'eyebrow_up'],
  // Boca / Vocales
  'あ': ['viseme_aa', 'aa', 'mouthopen', 'fcl_mth_a', 'a'],
  'い': ['viseme_i', 'viseme_ih', 'ih', 'i', 'fcl_mth_i'],
  'う': ['viseme_u', 'viseme_ou', 'ou', 'u', 'fcl_mth_u'],
  'え': ['viseme_e', 'viseme_ee', 'ee', 'e', 'fcl_mth_e'],
  'お': ['viseme_o', 'viseme_oh', 'oh', 'o', 'fcl_mth_o'],
  'にやり': ['grin', 'smirk', 'smile'],
  '口角上げ': ['mouthsmile', 'smile', 'fcl_mth_joy'],
  '口角下げ': ['mouthfrown', 'frown', 'fcl_mth_sorrow'],
  'ワ': ['moutha', 'viseme_aa', 'mouthopen'],
  'わ': ['moutha', 'viseme_aa', 'mouthopen'],
  'ほほ染め': ['blush', 'fcl_all_shy'],
  '照れ': ['blush', 'fcl_all_shy']
};

/**
 * Lista exhaustiva de nombres de morphs faciales y de expresión válidos en MMD / VRM / ARKit.
 * ÚNICAMENTE estos morphs deben ser animados por un archivo VMD de baile o expresión.
 */
const KNOWN_FACIAL_NAMES = new Set([
  // Ojos / Mirada MMD
  'まばたき', '笑い', 'ウィンク', 'ウインク', 'ウィンク右', 'ウインク右', 'ウィンク２', 'なごみ',
  'びっくり', 'じと目', '瞳小', '瞳大', '瞳縦', '恐れ', 'キリッ', '真面目', '悲しい', '泣き',
  'より目', '白目', 'ハイライト消し', 'ぐるぐる', 'ハート', '星目', '丸目', '目閉じ', '目開け',
  // Cejas MMD
  '怒り', '困り', 'にこり', '下', '上', '前', '眉頭', '眉間', '眉上げ', '眉下げ', '真面目',
  // Boca / Vocales MMD
  'あ', 'い', 'う', 'え', 'お', 'ワ', 'わ', 'にやり', '口角上げ', '口角下げ', 'ん', 'へ',
  '▲', 'ω', '口横広げ', '舌', 'べー', '歯', '口開け', '口閉じ',
  // Expresiones / Efectos faciales MMD
  'ほほ染め', '照れ', '赤面', '涙', '汗', '青ざめ', '照れ２'
]);

/**
 * Verifica si un morph pertenece inequívocamente a expresiones faciales, labios u ojos.
 * Cualquier morph que no sea facial (como ropa, cuerpo o daño) será descartado.
 */
export function isFacialMorph(name: string): boolean {
  if (!name) return false;
  const raw = name.trim().replace(/\s+/g, '');
  const n = name.toLowerCase().trim();

  // 1. Coincidencia directa en lista MMD
  if (KNOWN_FACIAL_NAMES.has(raw) || KNOWN_FACIAL_NAMES.has(normalizeMmdBoneName(raw))) {
    return true;
  }

  // 2. Patrones kanji/caracteres faciales específicos
  if (
    raw.includes('目') || raw.includes('瞳') || raw.includes('まばたき') || raw.includes('ウィンク') ||
    raw.includes('眉') || raw.includes('口') || raw.includes('舌') || raw.includes('歯') ||
    raw.includes('笑') || raw.includes('怒') || raw.includes('困') || raw.includes('照') ||
    raw.includes('涙') || raw.includes('汗') || raw.includes('赤面') || raw.includes('青ざめ') ||
    (raw.includes('耳') && !raw.includes('耳飾') && !raw.includes('耳飾り'))
  ) {
    // Si contiene términos de ropa o desnudez a pesar de tener un kanji común, no es facial
    if (isClothingOrNudityMorph(name)) return false;
    return true;
  }

  // 3. Nombres estándar en inglés (VRM / GLTF / ARKit / Mixamo)
  const facialTerms = [
    'blink', 'wink', 'eye', 'pupil', 'iris', 'squint', 'wide', 'lookat',
    'brow', 'eyebrow',
    'viseme', 'mouth', 'lip', 'jaw', 'tongue', 'teeth', 'smile', 'frown',
    'pout', 'sneer', 'cheek', 'fun', 'joy', 'sorrow', 'angry', 'surprised',
    'neutral', 'blush', 'shy', 'tear', 'sweat', 'catear', 'foxear'
  ];

  for (const term of facialTerms) {
    if (n.includes(term)) {
      if (isClothingOrNudityMorph(name)) return false;
      return true;
    }
  }

  return false;
}

/**
 * Detecta si un morph es de desnudez, desvestir, rotura, daño o eliminación de ropa
 * (Cast-Off / 脱衣 / 服破れ / 破れ / 透け / ブラ下げ / 服消し / 去衣).
 * NUNCA deben incluirse en animaciones de baile para evitar que el avatar quede desnudo o la ropa se rompa.
 */
export function isClothingOrNudityMorph(morphName: string): boolean {
  if (!morphName) return false;
  const n = morphName.toLowerCase().trim();
  const raw = morphName.trim().replace(/\s+/g, '');

  // 1. Desnudez directa / Cast Off / Strip (japonés, chino, inglés)
  if (
    raw.includes('脱衣') || raw.includes('全裸') || raw.includes('裸') || raw.includes('半裸') ||
    raw.includes('ぬぎ') || raw.includes('脱ぎ') || raw.includes('キャストオフ') ||
    raw.includes('去衣') || raw.includes('赤脚') || raw.includes('素体') || raw.includes('全脱') ||
    raw.includes('半脱') || raw.includes('脱') ||
    raw.includes('脱裙') || raw.includes('去裙') || raw.includes('去内衣') || raw.includes('脱内衣') ||
    raw.includes('去胖次') || raw.includes('脱胖次') || raw.includes('脱外套') || raw.includes('去外套') ||
    n.includes('castoff') || n.includes('cast_off') || n.includes('cast-off') ||
    n.includes('strip') || n.includes('undress') || n.includes('nude') || n.includes('naked')
  ) {
    return true;
  }

  // 2. Rotura, Daño, Desgarro, Desgaste de ropa (服破れ, 破れ, 破損, ダメージ, tear, rip, damage)
  // Causa directa del desgarro en corsés, faldas y vestidos
  if (
    raw.includes('破れ') || raw.includes('破') || raw.includes('裂け') || raw.includes('裂') ||
    raw.includes('破損') || raw.includes('損') || raw.includes('ダメージ') || raw.includes('傷') ||
    raw.includes('破绽') || raw.includes('破綻') ||
    n.includes('tear') || n.includes('rip') || n.includes('damage') || n.includes('broken') || n.includes('torn')
  ) {
    return true;
  }

  // 3. Transparencia de ropa / Ver a través (透け, 透ける, 半透明, seethrough)
  if (
    raw.includes('透け') || raw.includes('透ける') || raw.includes('透') ||
    raw.includes('半透明') || n.includes('seethrough') || n.includes('see_through') || n.includes('translucent')
  ) {
    return true;
  }

  // 4. Modificaciones corporales de pecho / pezones que atraviesan la ropa
  if (
    raw.includes('胸出し') || raw.includes('乳出し') || raw.includes('胸揉み') || raw.includes('胸消し') ||
    raw.includes('乳首') || raw.includes('ニップル') || raw.includes('胸小') || raw.includes('胸大') ||
    raw.includes('巨乳') || raw.includes('小乳') || raw.includes('胸平') || raw.includes('胸縮小') ||
    raw.includes('胸拡大') || raw.includes('おっぱい') || n.includes('nipple') || n.includes('areola')
  ) {
    return true;
  }

  // 5. Acciones de bajar, descolocar, levantar o quitar prendas (下げ, ずらし, めくり, 捲り, 外し, 露出)
  if (
    raw.includes('露出') || raw.includes('肌出し') || raw.includes('出し') ||
    raw.includes('下げ') || raw.includes('ずらし') || raw.includes('めくり') || raw.includes('捲り') ||
    raw.includes('外し') || raw.includes('はずし') || raw.includes('解') ||
    n.includes('pull_down') || n.includes('shift') || n.includes('expose') || n.includes('reveal')
  ) {
    return true;
  }

  // 6. Acciones de ocultar/quitar o toggles (japonés, chino, inglés)
  const hasRemovalAction =
    raw.includes('消し') || raw.includes('消') || raw.includes('非表示') ||
    n.includes('off') || raw.includes('オフ') || raw.includes('なし') || raw.includes('無し') ||
    raw.includes('去') || raw.includes('隐藏') ||
    n.includes('hide') || n.includes('remove') || n.includes('delete') || n.includes('no_') || n.startsWith('no');

  // 7. Términos exhaustivos de prendas, vestidos, faldas, corsés, lencería, trajes de baño y calzado
  const clothingTerms = [
    // Japonés
    'スカート', 'ワンピ', 'ワンピース', 'ドレス', '服', '衣服', '衣装', '上着', '下着',
    'パンツ', 'ショーツ', 'ブラ', 'ブラジャー', '水着', 'ビキニ', 'パッツ', 'キャミソール',
    'コルセット', 'レオタード', 'セーラー', 'ガーター', 'リボン', 'フリル', 'パニエ',
    '靴', 'ブーツ', 'シューズ', '素足', '靴下', 'ソックス', 'タイツ', 'ストッキング',
    '手袋', 'グローブ', '袖', 'カフス', '帽子', 'マント', 'ケープ', 'エプロン',
    '装身具', 'アクセ', '制服', '帯', 'ベルト', 'チョーカー',
    // Chino
    '外套', '大衣', '上衣', '裙', '裙子', '短裙', '长裙', '半身裙', '百褶裙', '连衣裙',
    '水手服', '制服', '泳衣', '泳装', '比基尼', '内衣', '文胸', '胸罩', '内裤', '胖次',
    '安全裤', '鞋', '鞋子', '靴', '靴子', '袜', '袜子', '丝袜', '手套', '斗篷', '披风',
    '饰品', '神之眼', '胸甲', '肩甲', '腰饰', '腿环', '袖子', '领结', '领带', '吊带',
    // Inglés
    'corset', 'leotard', 'sailor', 'cloth', 'clothes', 'clothing', 'dress', 'skirt', 'coat', 'jacket', 'pant', 'pants',
    'bra', 'brassiere', 'underwear', 'lingerie', 'panties', 'panty', 'thong', 'bikini',
    'swimsuit', 'swimwear', 'swim', 'shoe', 'shoes', 'boot', 'boots', 'sock', 'socks', 'stocking',
    'stockings', 'tights', 'glove', 'gloves', 'sleeve', 'sleeves', 'hat', 'cap', 'cape',
    'cloak', 'apron', 'outfit', 'uniform', 'top', 'bottom', 'shorts', 'short', 'garter', 'ribbon'
  ];

  for (const term of clothingTerms) {
    if (raw.includes(term) || n.includes(term.toLowerCase())) {
      return true;
    }
  }

  return hasRemovalAction;
}

export function retargetVmdToAnimationClip(
  buffer: ArrayBuffer,
  options: RetargetVmdOptions
): THREE.AnimationClip | null {
  try {
    const { name, modelBoneNames, targetRestPoses, targetRestPositions, isPMXScale = false, targetMorphMeshes } = options;
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

    const hasMotions = !!(vmd && vmd.motions && vmd.motions.length > 0);
    const hasMorphs = !!(vmd && vmd.morphs && vmd.morphs.length > 0);

    if (!hasMotions && !hasMorphs) {
      console.warn(`⚠️ [VMDRetargeter] "${name}" no contiene tracks de movimiento de huesos ni morphs.`);
      return null;
    }

    const FPS = 30.0;

    // 1. Agrupar keyframes por nombre de hueso MMD normalizado (sin bytes nulos \0 ni fullwidth)
    const boneMotions = new Map<string, Array<{
      frameNum: number;
      rotation: [number, number, number, number];
      position: [number, number, number];
    }>>();

    if (hasMotions) {
      for (const motion of vmd.motions) {
        const bName = normalizeMmdBoneName(motion.boneName);
        if (!bName) continue;
        if (!boneMotions.has(bName)) {
          boneMotions.set(bName, []);
        }
        boneMotions.get(bName)!.push({
          frameNum: motion.frameNum,
          rotation: motion.rotation,
          position: motion.position
        });
      }
    }

    // 2. Extraer pistas IK de piernas (左足IK, 右足IK) para el Two-Bone IK Solver
    const vmdIkData: VmdIkData = {
      leftFoot: [],
      rightFoot: []
    };

    // Búsqueda flexible de los huesos IK de pies (soporta ASCII 'IK', fullwidth 'ＩＫ', mayús/minús)
    const isLeftFootIkName = (n: string) => {
      const up = n.toUpperCase();
      const hasLeft = up.includes('左') || up.includes('.L') || up.includes('_L');
      return (hasLeft && up.includes('足') && up.includes('IK') && !up.includes('先') && !up.includes('TOE')) ||
             up === 'LEFTFOOTIK' || up === 'L_FOOT_IK' || up === 'IK_FOOT_L';
    };

    const isRightFootIkName = (n: string) => {
      const up = n.toUpperCase();
      const hasRight = up.includes('右') || up.includes('.R') || up.includes('_R');
      return (hasRight && up.includes('足') && up.includes('IK') && !up.includes('先') && !up.includes('TOE')) ||
             up === 'RIGHTFOOTIK' || up === 'R_FOOT_IK' || up === 'IK_FOOT_R';
    };

    let leftIkKey: string | undefined;
    let rightIkKey: string | undefined;
    for (const key of boneMotions.keys()) {
      if (!leftIkKey && isLeftFootIkName(key)) leftIkKey = key;
      if (!rightIkKey && isRightFootIkName(key)) rightIkKey = key;
    }

    const rawLeftIk = leftIkKey ? boneMotions.get(leftIkKey) : undefined;
    if (rawLeftIk && rawLeftIk.length > 0) {
      rawLeftIk.sort((a, b) => a.frameNum - b.frameNum);
      vmdIkData.leftFoot = rawLeftIk.map(kf => ({
        time: kf.frameNum / FPS,
        position: [kf.position[0], kf.position[1], kf.position[2]],
        rotation: [kf.rotation[0], kf.rotation[1], kf.rotation[2], kf.rotation[3]]
      }));
    }

    const rawRightIk = rightIkKey ? boneMotions.get(rightIkKey) : undefined;
    if (rawRightIk && rawRightIk.length > 0) {
      rawRightIk.sort((a, b) => a.frameNum - b.frameNum);
      vmdIkData.rightFoot = rawRightIk.map(kf => ({
        time: kf.frameNum / FPS,
        position: [kf.position[0], kf.position[1], kf.position[2]],
        rotation: [kf.rotation[0], kf.rotation[1], kf.rotation[2], kf.rotation[3]]
      }));
    }

    const hasIkTargets = vmdIkData.leftFoot.length > 0 || vmdIkData.rightFoot.length > 0;

    // Detectar si la animación contiene rotaciones FK reales en las piernas (bailes K-Pop, sentado, piso, etc.)
    // En MMD, muchos bailes tienen el solver IK desactivado por el autor y las piernas animadas 100% en FK (左足, 左ひざ).
    // Detectar si la animación contiene rotaciones FK reales en las piernas (bailes K-Pop, sentado, piso, etc.)
    // Contamos los keyframes reales para evitar falsos positivos con el frame de setup (frame 0).
    const hasRealFkLegs = ['左足', '左ひざ', '右足', '右ひざ'].some(boneName => {
      const kfs = boneMotions.get(boneName);
      if (!kfs || kfs.length === 0) return false;
      
      let realMotionFrames = 0;
      for (const kf of kfs) {
        const [rx, ry, rz, rw] = kf.rotation;
        if (Math.abs(rx) > 0.03 || Math.abs(ry) > 0.03 || Math.abs(rz) > 0.03 || Math.abs(rw - 1.0) > 0.03) {
          realMotionFrames++;
        }
      }
      
      // Si tiene más de 15 frames con movimiento real, consideramos que usa FK genuinamente.
      return realMotionFrames > 15;
    });

    console.log(`🌸 [VMDRetargeter] "${name}": ${vmd.motions?.length || 0} keyframes | IK targets: ${hasIkTargets ? '✅' : '❌'} | FK piernas reales: ${hasRealFkLegs ? '💃 SÍ (animación FK pura de piernas)' : '🚶 NO (requiere IK Solver)'}`);

    // 3. Procesar huesos de deformación FK para el mixer
    const tracks: THREE.KeyframeTrack[] = [];
    let maxTime = 0;
    let mappedBonesCount = 0;
    const handledTargetBones = new Set<string>();

    const priorityBones = ['センター', '下半身', 'グルーブ', '上半身', '上半身2'];
    const sortedMmdBones = Array.from(boneMotions.keys()).sort((a, b) => {
      const idxA = priorityBones.indexOf(a);
      const idxB = priorityBones.indexOf(b);
      if (idxA !== -1 && idxB !== -1) return idxA - idxB;
      if (idxA !== -1) return -1;
      if (idxB !== -1) return 1;
      return 0;
    });

    for (const mmdBoneName of sortedMmdBones) {
      // Para objetivos IK (左足IK, 右足IK, etc.):
      // Solo incluirlos en el mixer si la animación NO es de FK pura (para evitar pisar o confundir)
      // o si es escala PMX nativa (que requiere targets IK en el esqueleto)
      // y solo si el modelo tiene hueso IK destino explícito.
      if (isMmdIkBone(mmdBoneName)) {
        if (hasRealFkLegs && !isPMXScale) continue;
        const targetBone = findTargetBoneName(mmdBoneName, modelBoneNames);
        if (!targetBone || !normalizeMmdBoneName(targetBone).toUpperCase().includes('IK')) {
          continue;
        }
      }

      const keyframes = boneMotions.get(mmdBoneName)!;

      // Si un hueso es D-Bone (ej: 左足D) y en el VMD sólo tiene keyframes estáticos dummy [0,0,0,1],
      // descartar la pista para evitar que el mixer sobreescriba y congele el D-Bone
      const normName = normalizeMmdBoneName(mmdBoneName);
      const isDBone = normName.endsWith('D') || normName.includes('D.') || normName.includes('D_');
      if (isDBone) {
        const isStaticDummy = keyframes.every(kf => {
          const [rx, ry, rz, rw] = kf.rotation;
          return Math.abs(rx) < 0.02 && Math.abs(ry) < 0.02 && Math.abs(rz) < 0.02 && Math.abs(rw - 1) < 0.02;
        });
        if (isStaticDummy) {
          continue;
        }
      }

      // Si la animación tiene IK targets activos y no es un baile FK puro,
      // OMITIR pistas FK en muslos y rodillas. Esto permite que el solver IK (CCDIKSolver o LegIK)
      // resuelva desde la postura neutra limpia en cada fotograma, evitando giros imposibles,
      // torsión axial progresiva y piernas que se enredan con el tiempo.
      const isFkLegBone = mmdBoneName === '左足' || mmdBoneName === '左ひざ' ||
                          mmdBoneName === '右足' || mmdBoneName === '右ひざ';
      if (!hasRealFkLegs && hasIkTargets && isFkLegBone) {
        continue;
      }

      const targetBone = findTargetBoneName(mmdBoneName, modelBoneNames);
      if (!targetBone) {
        // Registro limpio solo para huesos principales no emparejados
        if (priorityBones.includes(mmdBoneName) || mmdBoneName.includes('足') || mmdBoneName.includes('腕')) {
          // Log defensivo de depuración
          // console.log(`❌ SIN MATCH: ${mmdBoneName}`);
        }
        continue;
      }

      if (handledTargetBones.has(targetBone)) continue;
      handledTargetBones.add(targetBone);
      mappedBonesCount++;

      keyframes.sort((a, b) => a.frameNum - b.frameNum);

      const times: number[] = [];
      const quatValues: number[] = [];
      const posValues: number[] = [];
      let hasNonZeroPosition = false;

      const restQuat = targetRestPoses?.get(targetBone)?.clone() || new THREE.Quaternion();
      const restPos = targetRestPositions?.get(targetBone)?.clone() || new THREE.Vector3();
      const isNativeMMDBone = isPMXScale || (mmdBoneName === targetBone);

      keyframes.forEach(kf => {
        const time = kf.frameNum / FPS;
        times.push(time);
        if (time > maxTime) maxTime = time;

        const isKnee = !isNativeMMDBone && (
          mmdBoneName.includes('ひざ') ||
          (targetBone.toLowerCase().includes('leg') && !targetBone.toLowerCase().includes('up')) ||
          targetBone.toLowerCase().includes('shin') ||
          targetBone.toLowerCase().includes('calf')
        );

        if (isNativeMMDBone) {
          // Modelos PMX / MMD nativos: conversión exacta al espacio OpenGL de Three.js (MMDLoader.leftToRightVmd)
          // 1. Quaternions: rx = -rx, ry = -ry (inversión de ejes X/Y para reflejar sistema diestro)
          // 2. Posición Z: -posZ (en MMD +Z es hacia adelante en pantalla; en Three.js +Z es hacia atrás/cámara)
          quatValues.push(-kf.rotation[0], -kf.rotation[1], kf.rotation[2], kf.rotation[3]);

          let posX = restPos.x + kf.position[0];
          let posY = restPos.y + kf.position[1];
          let posZ = restPos.z - kf.position[2];
          
          posValues.push(posX, posY, posZ);

          if (Math.abs(kf.position[0]) > 0.001 || Math.abs(kf.position[1]) > 0.001 || Math.abs(kf.position[2]) > 0.001) {
            hasNonZeroPosition = true;
          }
        } else {
          // Modelos GLTF / VRM / Mixamo / Rigify (GrokAni): conversión de espacio a Three.js
          let rx = kf.rotation[0];
          let ry = kf.rotation[1];
          let rz = -kf.rotation[2];
          let rw = -kf.rotation[3];

          if (isKnee) {
            rx = -rx;
            ry = -ry;
          }

          const vmdQuat = new THREE.Quaternion(rx, ry, rz, rw).normalize();
          const finalQuat = restQuat.clone().multiply(vmdQuat);
          quatValues.push(finalQuat.x, finalQuat.y, finalQuat.z, finalQuat.w);

          const posScale = 0.08;
          const deltaX = kf.position[0] * posScale;
          const deltaY = kf.position[1] * posScale;
          const deltaZ = -kf.position[2] * posScale;

          const posX = restPos.x + deltaX;
          const posY = restPos.y + deltaY;
          const posZ = restPos.z + deltaZ;
          posValues.push(posX, posY, posZ);

          if (Math.abs(deltaX) > 0.001 || Math.abs(deltaY) > 0.001 || Math.abs(deltaZ) > 0.001) {
            hasNonZeroPosition = true;
          }
        }
      });

      if (times.length > 0 && quatValues.length > 0) {
        tracks.push(new THREE.QuaternionKeyframeTrack(`${targetBone}.quaternion`, times, quatValues));

        // --- SOPORTE PARA D-BONES (準標準ボーン) ---
        // Para modelos adaptados (VRM / GLTF / Mixamo) sin solver de Grants nativo, duplicamos la pista.
        // En modelos PMX nativos (isPMXScale = true), PmxGrantSolver ya resuelve los D-bones tras el IK;
        // duplicar la pista aquí causaría doble rotación (200%), doblando excesivamente las rodillas y pies.
        if (!isPMXScale && isNativeMMDBone) {
          let dBoneFull = targetBone + 'Ｄ';
          let dBoneHalf = targetBone + 'D';
          let rotBone = targetBone + '回転';
          
          // Soporte para modelos traducidos como fufu.pmx donde el nombre es "足.L" y el D-bone es "足D.L"
          if (targetBone.endsWith('.L') || targetBone.endsWith('.R')) {
            const base = targetBone.slice(0, -2);
            const ext = targetBone.slice(-2);
            dBoneFull = base + 'Ｄ' + ext;
            dBoneHalf = base + 'D' + ext;
            rotBone = base + '回転' + ext;
          }

          const hasRealMotionInVmd = (boneKey: string) => {
            const kfs = boneMotions.get(boneKey);
            if (!kfs || kfs.length === 0) return false;
            return kfs.some(kf => {
              const [rx, ry, rz, rw] = kf.rotation;
              return Math.abs(rx) > 0.02 || Math.abs(ry) > 0.02 || Math.abs(rz) > 0.02 || Math.abs(rw - 1) > 0.02;
            });
          };

          // Aplicar a D-Bones (Fullwidth o Halfwidth) si no tienen movimiento real propio en el VMD
          if (modelBoneNames.has(dBoneFull) && !hasRealMotionInVmd(dBoneFull)) {
            tracks.push(new THREE.QuaternionKeyframeTrack(`${dBoneFull}.quaternion`, times, quatValues));
            handledTargetBones.add(dBoneFull);
          } else if (modelBoneNames.has(dBoneHalf) && !hasRealMotionInVmd(dBoneHalf)) {
            tracks.push(new THREE.QuaternionKeyframeTrack(`${dBoneHalf}.quaternion`, times, quatValues));
            handledTargetBones.add(dBoneHalf);
          }

          // Aplicar a Huesos de Rotación (回転), muy comunes en piernas de modelos MMD avanzados
          if (modelBoneNames.has(rotBone) && !hasRealMotionInVmd(rotBone)) {
            tracks.push(new THREE.QuaternionKeyframeTrack(`${rotBone}.quaternion`, times, quatValues));
            handledTargetBones.add(rotBone);
          }
        }
      }

      // Tracks de posición para caderas/pelvis Y para objetivos IK nativos (ej: 左足ＩＫ en PMX)
      // NUNCA incluir pistas de traslación/posición para pechos, ya que trasladar un hueso de pecho estira y deforma la malla
      const isBreast = targetBone.toLowerCase().includes('breast') ||
                     targetBone.toLowerCase().includes('boob') ||
                     targetBone.toLowerCase().includes('bust') ||
                     targetBone.toLowerCase().includes('oppai') ||
                     targetBone.includes('胸') ||
                     targetBone.includes('おっぱい') ||
                     targetBone.includes('乳');
      const isHips = targetBone.toLowerCase().includes('hip') ||
                     targetBone.toLowerCase().includes('pelvis') ||
                     mmdBoneName === 'センター' ||
                     mmdBoneName === '全ての親' ||
                     mmdBoneName === 'グルーブ' ||
                     mmdBoneName === '下半身';
      const isIkTarget = isMmdIkBone(mmdBoneName) || normalizeMmdBoneName(targetBone).toUpperCase().includes('IK');
      const isRootOrHipsOrIk = isHips || isIkTarget || mmdBoneName === '全ての親' || mmdBoneName === 'センター' || mmdBoneName === 'グルーブ';
      // NUNCA incluir pistas de posición para huesos que no sean pelvis/hips/root/IK (evita desplazar ropa o desmembrar el esqueleto)
      const shouldIncludePos = !isBreast && isRootOrHipsOrIk;

      if (shouldIncludePos && hasNonZeroPosition && times.length > 0) {
        tracks.push(new THREE.VectorKeyframeTrack(`${targetBone}.position`, times, posValues));
      }
    }

    // 4. Procesar morphs faciales (ojos, cejas, boca, visemas y muecas)
    if (vmd.morphs && vmd.morphs.length > 0) {
      const morphGroups = new Map<string, Array<{ frameNum: number; weight: number }>>();
      for (const m of vmd.morphs) {
        const mName = m.morphName ? normalizeMmdBoneName(m.morphName) : '';
        if (!mName) continue;
        // FILTRO CRÍTICO WHITELIST: SOLO procesar morphs faciales genuinos (ojos, cejas, boca, visemas, rubor)
        // NUNCA procesar morphs de ropa, prendas, corsé, falda, rotura, daño o desnudez
        if (!isFacialMorph(mName) || isClothingOrNudityMorph(mName)) {
          continue;
        }
        if (!morphGroups.has(mName)) morphGroups.set(mName, []);
        morphGroups.get(mName)!.push({ frameNum: m.frameNum, weight: m.weight });
      }

      const targetMeshes = (targetMorphMeshes && targetMorphMeshes.length > 0)
        ? targetMorphMeshes
        : [{ name: 'MMD_Mesh', dictionary: {} as Record<string, number> }];

      let morphTracksCount = 0;

      for (const [mName, kfs] of morphGroups.entries()) {
        kfs.sort((a, b) => a.frameNum - b.frameNum);
        const times: number[] = [];
        const values: number[] = [];
        for (const kf of kfs) {
          const t = kf.frameNum / FPS;
          times.push(t);
          values.push(kf.weight);
          if (t > maxTime) maxTime = t;
        }

        if (times.length === 0) continue;

        // Para cada malla con morphs en el modelo
        for (const mesh of targetMeshes) {
          const dict = mesh.dictionary || {};
          const dictKeys = Object.keys(dict);

          // 1. Coincidencia directa exacta (modelos PMX nativos: まばたき, 笑い, あ, etc.)
          let matchedIndex: number | undefined = dict[mName];

          // 1b. Coincidencia recortada o normalizada por nombre MMD
          if (matchedIndex === undefined) {
            matchedIndex = dict[mName.trim()];
          }
          if (matchedIndex === undefined) {
            const normM = normalizeMmdBoneName(mName);
            matchedIndex = dict[normM];
          }

          // 1c. Coincidencia case-insensitive o búsqueda en dictKeys (exclusivo para faciales)
          if (matchedIndex === undefined && dictKeys.length > 0) {
            const lowerM = mName.toLowerCase().trim();
            const normM = normalizeMmdBoneName(mName);
            const foundKey = dictKeys.find(k => {
              if (isClothingOrNudityMorph(k) || !isFacialMorph(k)) return false;
              const kl = k.toLowerCase().trim();
              return kl === lowerM || normalizeMmdBoneName(k) === normM;
            });
            if (foundKey) matchedIndex = dict[foundKey];
          }

          // 2. Coincidencia por alias (modelos VRM, GLTF, Mixamo: blink, joy, viseme_aa)
          if (matchedIndex === undefined && dictKeys.length > 0) {
            const aliases = MORPH_ALIASES[mName] || MORPH_ALIASES[normalizeMmdBoneName(mName)];
            if (aliases) {
              for (const alias of aliases) {
                const foundKey = dictKeys.find(k => {
                  if (isClothingOrNudityMorph(k) || !isFacialMorph(k)) return false;
                  const kl = k.toLowerCase();
                  // Si el alias es corto (ej: 'a', 'i', 'u', 'e', 'o', '下', '上'), exigir coincidencia exacta para no emparejar palabras por accidente
                  return alias.length <= 2 ? kl === alias : (kl === alias || kl.includes(alias));
                });
                if (foundKey) {
                  matchedIndex = dict[foundKey];
                  break;
                }
              }
            }
          }

          // Verificación de seguridad adicional: asegurar que la clave emparejada en el modelo no sea de ropa ni daño
          if (matchedIndex !== undefined) {
            const matchedKey = dictKeys.find(k => dict[k] === matchedIndex);
            if (matchedKey && (isClothingOrNudityMorph(matchedKey) || !isFacialMorph(matchedKey))) {
              console.log(`🛡️ [VMDRetargeter] Omitiendo morph destino no facial o de ropa "${matchedKey}"`);
              continue;
            }

            // Generar track indexado numéricamente a la malla
            tracks.push(new THREE.NumberKeyframeTrack(
              `${mesh.name}.morphTargetInfluences[${matchedIndex}]`,
              times,
              values
            ));
            morphTracksCount++;
          }
        }
      }

      if (morphTracksCount > 0) {
        console.log(`🎭 [VMDRetargeter] "${name}": Generados ${morphTracksCount} tracks de morphs faciales (${morphGroups.size} expresiones MMD).`);
      }
    }

    if (tracks.length === 0) {
      console.warn(`⚠️ [VMDRetargeter] "${name}": No se pudieron mapear ni huesos ni morphs al modelo.`);
      return null;
    }

    const clip = new THREE.AnimationClip(name, maxTime, tracks);
    clip.userData = {
      ikData: hasRealFkLegs ? null : vmdIkData,
      rawIkData: vmdIkData,
      hasIK: isPMXScale ? hasIkTargets : (hasIkTargets && !hasRealFkLegs),
      hasRealFkLegs,
      hasMorphs: !!(vmd.morphs && vmd.morphs.length > 0),
      isFacialOnly: (!vmd.motions || vmd.motions.length === 0) && !!(vmd.morphs && vmd.morphs.length > 0)
    };

    console.log(`✅ [VMDRetargeter] Clip "${name}" listo: ${maxTime.toFixed(1)}s, ${tracks.length} tracks en ${mappedBonesCount} huesos mapeados`);
    return clip;

  } catch (err) {
    console.error(`❌ [VMDRetargeter] Error procesando VMD "${options.name}":`, err);
    return null;
  }
}
