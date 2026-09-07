/**
 * Two-Bone Leg IK Solver para animaciones VMD en Three.js
 * 
 * Resuelve la cinemática inversa analítica (Ley de Cosenos) de 2 huesos
 * (Muslo -> Rodilla -> Pie) para plantar los pies en el suelo y articular las rodillas
 * con bailes MMD aplicados sobre avatares GLB/VRM en Three.js r182.
 */

import * as THREE from 'three';

export interface LegCalibrationData {
  scale: number;        // Unidades VMD/MMD (~20) -> escala métrica (~1.6m). Rango 0.02 - 2.0 (default 0.08)
  groundY: number;      // Altura del suelo en coordenadas mundo (-2.5 a 0.5, default -1.50 = grilla)
  offsetLX: number;     // Desplazamiento lateral pie izquierdo (±0.5m)
  offsetLZ: number;     // Desplazamiento frente-atrás pie izquierdo (±0.5m)
  offsetRX: number;     // Desplazamiento lateral pie derecho (±0.5m)
  offsetRZ: number;     // Desplazamiento frente-atrás pie derecho (±0.5m)
  kneeAngle: number;    // Multiplicador de flexión de rodilla (0 = palo recto, 1 = flexión normal)
  invertKnee: boolean;  // Invertir sentido del polo de la rodilla (para modelos con eje frontal invertido)
  ikWeight: number;     // Mezcla IK vs FK (0 = solo mixer FK, 1 = IK rígido al objetivo, default 0.85)
  freezeHipY: boolean;  // Congela la altura vertical Y de la pelvis para evitar arrastre excesivo
}

export const DEFAULT_LEG_CALIBRATION: LegCalibrationData = {
  scale: 0.035,
  groundY: 0.0,
  offsetLX: 0,
  offsetLZ: 0,
  offsetRX: 0,
  offsetRZ: 0,
  kneeAngle: 1.0,
  invertKnee: false,
  ikWeight: 0.95,
  freezeHipY: false,
};

export interface VmdBoneKeyframe {
  time: number;
  position: [number, number, number]; // [x, y, z] coords MMD
  rotation: [number, number, number, number]; // [rx, ry, rz, rw] coords MMD
}

export interface VmdIkData {
  leftFoot: VmdBoneKeyframe[];
  rightFoot: VmdBoneKeyframe[];
}

/**
 * Muestra e interpola linealmente una pista de keyframes VMD en el tiempo especificado
 */
export function sampleVmdTrack(
  keyframes: VmdBoneKeyframe[],
  time: number,
  targetPos: THREE.Vector3,
  targetQuat?: THREE.Quaternion
): void {
  if (!keyframes || keyframes.length === 0) return;

  const maxDuration = keyframes[keyframes.length - 1].time;
  const loopTime = (maxDuration > 0.001 && time >= maxDuration) ? (time % maxDuration) : time;

  if (loopTime <= keyframes[0].time) {
    const kf = keyframes[0];
    targetPos.set(kf.position[0], kf.position[1], kf.position[2]);
    if (targetQuat) targetQuat.set(kf.rotation[0], kf.rotation[1], -kf.rotation[2], -kf.rotation[3]);
    return;
  }

  const lastKf = keyframes[keyframes.length - 1];
  if (loopTime >= lastKf.time) {
    targetPos.set(lastKf.position[0], lastKf.position[1], lastKf.position[2]);
    if (targetQuat) targetQuat.set(lastKf.rotation[0], lastKf.rotation[1], -lastKf.rotation[2], -lastKf.rotation[3]);
    return;
  }

  // Búsqueda binaria del intervalo temporal
  let low = 0;
  let high = keyframes.length - 1;
  while (low <= high) {
    const mid = (low + high) >> 1;
    if (keyframes[mid].time < loopTime) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  const i1 = Math.max(0, low - 1);
  const i2 = Math.min(keyframes.length - 1, low);

  const kf1 = keyframes[i1];
  const kf2 = keyframes[i2];

  const duration = kf2.time - kf1.time;
  const alpha = duration > 0.0001 ? (loopTime - kf1.time) / duration : 0;

  targetPos.set(
    THREE.MathUtils.lerp(kf1.position[0], kf2.position[0], alpha),
    THREE.MathUtils.lerp(kf1.position[1], kf2.position[1], alpha),
    THREE.MathUtils.lerp(kf1.position[2], kf2.position[2], alpha)
  );

  if (targetQuat) {
    const q1 = new THREE.Quaternion(kf1.rotation[0], kf1.rotation[1], -kf1.rotation[2], -kf1.rotation[3]);
    const q2 = new THREE.Quaternion(kf2.rotation[0], kf2.rotation[1], -kf2.rotation[2], -kf2.rotation[3]);
    targetQuat.copy(q1).slerp(q2, alpha);
  }
}

/**
 * Resuelve la cinemática analítica de 2 huesos (thigh -> shin -> foot)
 */
export function solveTwoBoneLegIK(
  thigh: THREE.Bone | THREE.Object3D,
  shin: THREE.Bone | THREE.Object3D,
  foot: THREE.Bone | THREE.Object3D,
  targetWorldPos: THREE.Vector3,
  poleForward: THREE.Vector3,
  ikWeight: number,
  kneeAngleScale: number = 1.0,
  targetFootQuat?: THREE.Quaternion,
  restThighLocalQ?: THREE.Quaternion,
  restShinLocalQ?: THREE.Quaternion,
  restFootWorldQ?: THREE.Quaternion
): void {
  if (ikWeight <= 0.001) return;

  // 0. Reiniciar a la pose de reposo para evitar acumulación y torsión infinita frame a frame
  if (restThighLocalQ) thigh.quaternion.copy(restThighLocalQ);
  if (restShinLocalQ) shin.quaternion.copy(restShinLocalQ);
  thigh.updateMatrixWorld(true);

  // 1. Obtener posiciones mundiales limpias
  const hipPos = new THREE.Vector3();
  const kneePos = new THREE.Vector3();
  const footPos = new THREE.Vector3();

  thigh.getWorldPosition(hipPos);
  shin.getWorldPosition(kneePos);
  foot.getWorldPosition(footPos);

  // Longitud de los segmentos de pierna
  const l1 = Math.max(0.05, hipPos.distanceTo(kneePos));
  const l2 = Math.max(0.05, kneePos.distanceTo(footPos));
  const maxReach = (l1 + l2) * 0.9999;
  const minReach = Math.max(0.01, Math.abs(l1 - l2) * 1.001);

  // Vector de cadera a objetivo IK
  const hipToTarget = new THREE.Vector3().subVectors(targetWorldPos, hipPos);
  let dist = hipToTarget.length();
  if (dist < 0.001) return;

  // Clampear distancia para evitar singularidades y degeneración del triángulo
  const clampedDist = THREE.MathUtils.clamp(dist, minReach, maxReach);
  const targetDir = hipToTarget.clone().divideScalar(dist);

  // 2. Ley de cosenos para ángulos del triángulo
  // cos(alpha) = (l1^2 + dist^2 - l2^2) / (2 * l1 * dist)
  const cosAlpha = (l1 * l1 + clampedDist * clampedDist - l2 * l2) / (2 * l1 * clampedDist);
  const alpha = Math.acos(THREE.MathUtils.clamp(cosAlpha, -1, 1));

  // 3. Determinar el plano de flexión de la rodilla usando el polo frontal
  // Normal perpendicular al plano del triángulo (eje de rotación de la rodilla)
  let bendAxis = new THREE.Vector3().crossVectors(targetDir, poleForward);
  if (bendAxis.lengthSq() < 0.0001) {
    // Si el polo es colineal con el vector al target, usar eje X o Z de respaldo
    bendAxis.crossVectors(targetDir, new THREE.Vector3(1, 0, 0));
    if (bendAxis.lengthSq() < 0.0001) {
      bendAxis.crossVectors(targetDir, new THREE.Vector3(0, 0, 1));
    }
  }
  bendAxis.normalize();

  // Vector hacia el polo proyectado perpendicularmente al targetDir
  const toPole = new THREE.Vector3().crossVectors(bendAxis, targetDir).normalize();

  // 4. Dirección del muslo en espacio mundo rotado por el ángulo alpha
  const effectiveAlpha = alpha * kneeAngleScale;
  const thighDir = new THREE.Vector3()
    .addScaledVector(targetDir, Math.cos(effectiveAlpha))
    .addScaledVector(toPole, Math.sin(effectiveAlpha))
    .normalize();

  const newKneeWorldPos = hipPos.clone().addScaledVector(thighDir, l1);
  const shinDir = new THREE.Vector3().subVectors(targetWorldPos, newKneeWorldPos).normalize();

  // 5. Aplicar rotación al muslo
  const currentThighDir = new THREE.Vector3().subVectors(kneePos, hipPos).normalize();
  const qThighDelta = new THREE.Quaternion().setFromUnitVectors(currentThighDir, thighDir);

  const currentThighWorldQ = new THREE.Quaternion();
  thigh.getWorldQuaternion(currentThighWorldQ);
  const desiredThighWorldQ = qThighDelta.multiply(currentThighWorldQ);

  // Convertir a espacio local de thigh
  const parentThighWorldQ = new THREE.Quaternion();
  if (thigh.parent) {
    thigh.parent.getWorldQuaternion(parentThighWorldQ);
  }
  const desiredThighLocalQ = parentThighWorldQ.clone().invert().multiply(desiredThighWorldQ);

  // Mezclar con la pose de reposo mediante ikWeight
  if (restThighLocalQ && ikWeight < 0.999) {
    thigh.quaternion.copy(restThighLocalQ).slerp(desiredThighLocalQ, ikWeight);
  } else {
    thigh.quaternion.copy(desiredThighLocalQ);
  }
  thigh.updateMatrixWorld(true);

  // 6. Aplicar rotación a la rodilla/espinilla
  shin.getWorldPosition(kneePos);
  foot.getWorldPosition(footPos);
  const currentShinDir = new THREE.Vector3().subVectors(footPos, kneePos).normalize();
  const qShinDelta = new THREE.Quaternion().setFromUnitVectors(currentShinDir, shinDir);

  const currentShinWorldQ = new THREE.Quaternion();
  shin.getWorldQuaternion(currentShinWorldQ);
  const desiredShinWorldQ = qShinDelta.multiply(currentShinWorldQ);

  const parentShinWorldQ = new THREE.Quaternion();
  if (shin.parent) {
    shin.parent.getWorldQuaternion(parentShinWorldQ);
  }
  const desiredShinLocalQ = parentShinWorldQ.clone().invert().multiply(desiredShinWorldQ);

  if (restShinLocalQ && ikWeight < 0.999) {
    shin.quaternion.copy(restShinLocalQ).slerp(desiredShinLocalQ, ikWeight);
  } else {
    shin.quaternion.copy(desiredShinLocalQ);
  }
  shin.updateMatrixWorld(true);

  // 7. Orientación del pie / tobillo (aplicada como delta relativa al reposo para no torcer getas/sandalias)
  if (targetFootQuat) {
    const parentFootWorldQ = new THREE.Quaternion();
    if (foot.parent) {
      foot.parent.getWorldQuaternion(parentFootWorldQ);
    }
    let desiredFootWorldQ: THREE.Quaternion;
    if (restFootWorldQ) {
      desiredFootWorldQ = targetFootQuat.clone().multiply(restFootWorldQ);
    } else {
      desiredFootWorldQ = targetFootQuat;
    }
    const desiredFootLocalQ = parentFootWorldQ.clone().invert().multiply(desiredFootWorldQ);
    foot.quaternion.slerp(desiredFootLocalQ, ikWeight * 0.8);
    foot.updateMatrixWorld(true);
  }
}

/**
 * Controlador de Cinemática Inversa de Piernas para VMD
 * Administra la detección de huesos, sincronización temporal y calibración en vivo.
 */
export class MmdLegIkController {
  private thighL: THREE.Bone | null = null;
  private shinL: THREE.Bone | null = null;
  private footL: THREE.Bone | null = null;

  private thighR: THREE.Bone | null = null;
  private shinR: THREE.Bone | null = null;
  private footR: THREE.Bone | null = null;

  private hips: THREE.Object3D | null = null;
  private restHipY: number = 0;

  // Cuaterniones y posiciones de reposo para cálculo no acumulativo
  private restThighLocalQ_L = new THREE.Quaternion();
  private restShinLocalQ_L = new THREE.Quaternion();
  private restFootWorldQ_L = new THREE.Quaternion();

  private restThighLocalQ_R = new THREE.Quaternion();
  private restShinLocalQ_R = new THREE.Quaternion();
  private restFootWorldQ_R = new THREE.Quaternion();

  // Posiciones de reposo de los pies para mantener la postura natural del modelo
  private restFootPosL = new THREE.Vector3(-0.09, -0.33, 0);
  private restFootPosR = new THREE.Vector3(0.09, -0.33, 0);
  private hasRestFootPos: boolean = false;
  private hasLoggedActiveFrame: boolean = false;

  private ikData: VmdIkData | null = null;
  private calibration: LegCalibrationData = { ...DEFAULT_LEG_CALIBRATION };
  private enabled: boolean = false;

  // Vectores temporales para evitar garbage collection en el bucle useFrame
  private tempSamplePosL = new THREE.Vector3();
  private tempSampleQuatL = new THREE.Quaternion();
  private tempSamplePosR = new THREE.Vector3();
  private tempSampleQuatR = new THREE.Quaternion();

  private tempTargetWorldL = new THREE.Vector3();
  private tempTargetWorldR = new THREE.Vector3();
  private tempPoleForward = new THREE.Vector3(0, 0, 1);

  constructor() {
    this.handleCalibrationEvent = this.handleCalibrationEvent.bind(this);
    if (typeof window !== 'undefined') {
      window.addEventListener('nova-leg-calibration', this.handleCalibrationEvent);
    }
  }

  private handleCalibrationEvent(e: Event) {
    const detail = (e as CustomEvent).detail;
    if (detail) {
      this.setCalibration(detail);
    }
  }

  public dispose() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('nova-leg-calibration', this.handleCalibrationEvent);
    }
  }

  /**
   * Captura las posiciones mundiales y rotaciones de reposo del avatar actual
   */
  public captureRestFootPositions() {
    this.captureRestPose();
  }

  public captureRestPose() {
    if (this.footL) {
      const pos = new THREE.Vector3();
      this.footL.getWorldPosition(pos);
      if (pos.lengthSq() > 0.001) {
        this.restFootPosL.copy(pos);
        this.footL.getWorldQuaternion(this.restFootWorldQ_L);
        this.hasRestFootPos = true;
      }
    }
    if (this.footR) {
      const pos = new THREE.Vector3();
      this.footR.getWorldPosition(pos);
      if (pos.lengthSq() > 0.001) {
        this.restFootPosR.copy(pos);
        this.footR.getWorldQuaternion(this.restFootWorldQ_R);
        this.hasRestFootPos = true;
      }
    }

    if (this.thighL) this.restThighLocalQ_L.copy(this.thighL.quaternion);
    if (this.shinL) this.restShinLocalQ_L.copy(this.shinL.quaternion);
    if (this.thighR) this.restThighLocalQ_R.copy(this.thighR.quaternion);
    if (this.shinR) this.restShinLocalQ_R.copy(this.shinR.quaternion);
  }

  /**
   * Vincula los huesos detectados del avatar al controlador
   */
  public bindBones(bones: {
    thighL?: THREE.Bone | null;
    shinL?: THREE.Bone | null;
    footL?: THREE.Bone | null;
    thighR?: THREE.Bone | null;
    shinR?: THREE.Bone | null;
    footR?: THREE.Bone | null;
    hips?: THREE.Object3D | null;
  }) {
    this.thighL = bones.thighL || null;
    this.shinL = bones.shinL || null;
    this.footL = bones.footL || null;

    this.thighR = bones.thighR || null;
    this.shinR = bones.shinR || null;
    this.footR = bones.footR || null;

    this.hips = bones.hips || null;
    if (this.hips) {
      this.restHipY = this.hips.position.y;
    }

    this.captureRestPose();

    const matchedL = !!(this.thighL && this.shinL && this.footL);
    const matchedR = !!(this.thighR && this.shinR && this.footR);

    console.log(`🦵 [MmdLegIkController] Huesos vinculados: Izq=${matchedL ? '✅' : '❌'} (${this.thighL?.name || 'none'}), Der=${matchedR ? '✅' : '❌'} (${this.thighR?.name || 'none'}) | Stance L=(${this.restFootPosL.x.toFixed(2)}, ${this.restFootPosL.y.toFixed(2)}) R=(${this.restFootPosR.x.toFixed(2)}, ${this.restFootPosR.y.toFixed(2)})`);
  }

  /**
   * Asigna los datos IK extraídos del archivo VMD
   */
  public setIkData(ikData: VmdIkData | null) {
    this.ikData = ikData;
    this.enabled = !!(ikData && (ikData.leftFoot?.length > 0 || ikData.rightFoot?.length > 0));
    this.hasLoggedActiveFrame = false;
    this.captureRestPose();
    console.log(`🦵 [MmdLegIkController] enabled=${this.enabled}, keyframes: L=${ikData?.leftFoot?.length || 0}, R=${ikData?.rightFoot?.length || 0}`);
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setCalibration(cal: Partial<LegCalibrationData>) {
    this.calibration = { ...this.calibration, ...cal };
  }

  public getCalibration(): LegCalibrationData {
    return { ...this.calibration };
  }

  /**
   * Actualiza el IK analítico en cada frame (llamar después de mixer.update)
   */
  public update(time: number, hipsOverride?: THREE.Object3D | null) {
    if (!this.enabled || !this.ikData || this.calibration.ikWeight <= 0.001) return;

    const activeHips = hipsOverride || this.hips;

    // Asegurar que tenemos capturada la posición de reposo de los pies
    if (!this.hasRestFootPos) {
      this.captureRestPose();
    }

    // 1. Control de congelación de cadera Y (evita que センター arrastre verticalmente todo el cuerpo)
    if (this.calibration.freezeHipY && activeHips) {
      activeHips.position.y = this.restHipY;
    }

    // 2. Determinar vector frontal del avatar (para polo de flexión de rodilla)
    this.tempPoleForward.set(0, 0, 1);
    if (activeHips) {
      activeHips.getWorldDirection(this.tempPoleForward);
    }
    if (this.calibration.invertKnee) {
      this.tempPoleForward.negate();
    }

    const { scale, groundY, offsetLX, offsetLZ, offsetRX, offsetRZ, kneeAngle, ikWeight } = this.calibration;

    // Base de postura natural de cada pie
    const baseLX = this.restFootPosL.x;
    const baseLZ = this.restFootPosL.z;
    const baseRX = this.restFootPosR.x;
    const baseRZ = this.restFootPosR.z;

    // Soporte defensivo para valores heredados de groundY (-1.50 antiguo se trata como offset 0.0)
    const rawGround = groundY || 0;
    const groundOffset = Math.abs(rawGround) >= 0.8 ? 0.0 : rawGround;
    const groundLY = this.restFootPosL.y + groundOffset;
    const groundRY = this.restFootPosR.y + groundOffset;

    // 3. Pierna Izquierda
    if (this.thighL && this.shinL && this.footL && this.ikData.leftFoot?.length > 0) {
      sampleVmdTrack(this.ikData.leftFoot, time, this.tempSamplePosL, this.tempSampleQuatL);

      // Conversión de coordenadas MMD a mundo Three.js:
      // En MMD: +X es derecha, -X es izquierda del modelo.
      // En Three.js: +X es izquierda, -X es derecha del modelo.
      // Por tanto, al dar un paso hacia afuera en MMD (-X), en Three.js debemos SUMAR a +X (-(-X)):
      // X = baseLX - deltaX * scale + offsetLX
      // Y = groundLY + deltaY * scale (cuando deltaY = 0, el pie descansa en su altura natural)
      // Z = baseLZ - deltaZ * scale + offsetLZ (MMD +Z es hacia adentro)
      // Las posiciones IK de VMD son absolutas respecto al centro del modelo en espacio MMD.
      // Solo aplicamos la escala y la inversión de Z (MMD +Z es adelante, Three +Z es atrás).
      // NO sumar baseLX o baseLZ, porque eso duplicaría la posición inicial de reposo.
      this.tempTargetWorldL.set(
        this.tempSamplePosL.x * scale + offsetLX,
        groundLY + this.tempSamplePosL.y * scale,
        -this.tempSamplePosL.z * scale + offsetLZ
      );

      solveTwoBoneLegIK(
        this.thighL,
        this.shinL,
        this.footL,
        this.tempTargetWorldL,
        this.tempPoleForward,
        ikWeight,
        kneeAngle,
        this.tempSampleQuatL,
        this.restThighLocalQ_L,
        this.restShinLocalQ_L,
        this.restFootWorldQ_L
      );
    }

    // 4. Pierna Derecha
    if (this.thighR && this.shinR && this.footR && this.ikData.rightFoot?.length > 0) {
      sampleVmdTrack(this.ikData.rightFoot, time, this.tempSamplePosR, this.tempSampleQuatR);

      this.tempTargetWorldR.set(
        this.tempSamplePosR.x * scale + offsetRX,
        groundRY + this.tempSamplePosR.y * scale,
        -this.tempSamplePosR.z * scale + offsetRZ
      );

      solveTwoBoneLegIK(
        this.thighR,
        this.shinR,
        this.footR,
        this.tempTargetWorldR,
        this.tempPoleForward,
        ikWeight,
        kneeAngle,
        this.tempSampleQuatR,
        this.restThighLocalQ_R,
        this.restShinLocalQ_R,
        this.restFootWorldQ_R
      );
    }

    if (!this.hasLoggedActiveFrame) {
      this.hasLoggedActiveFrame = true;
      console.log(`🦵 [MmdLegIkController] IK corriendo en vivo: TargetL=(${this.tempTargetWorldL.x.toFixed(2)}, ${this.tempTargetWorldL.y.toFixed(2)}, ${this.tempTargetWorldL.z.toFixed(2)}) TargetR=(${this.tempTargetWorldR.x.toFixed(2)}, ${this.tempTargetWorldR.y.toFixed(2)}, ${this.tempTargetWorldR.z.toFixed(2)}) | ikWeight=${ikWeight} | GroundOffset=${groundOffset.toFixed(2)}`);
    }
  }
}

