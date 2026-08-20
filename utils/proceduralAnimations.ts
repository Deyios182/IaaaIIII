/**
 * Procedural Animations - Genera animaciones usando huesos directamente
 * Para modelos que NO tienen clips de animación específicos en el GLB
 */

import * as THREE from 'three';

export interface BoneRefs {
  head?: THREE.Object3D;
  spine?: THREE.Object3D;
  hips?: THREE.Object3D;
  rightArm?: THREE.Object3D;
  leftArm?: THREE.Object3D;
  rightForeArm?: THREE.Object3D;
  leftForeArm?: THREE.Object3D;
}

export interface ProceduralState {
  currentAction: string | null;
  startTime: number;  // Uses Three.js clock time
  duration: number;
  progress: number;
  phase: 'in' | 'hold' | 'out' | 'done';
}

// Easing suave y natural para movimientos biológicos
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

// Curva humana elástica sutil (inercia muscular)
function easeOutBack(t: number): number {
  const c1 = 1.25;
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

// Curva sigmoide suave para transiciones orgánicas
function smoothstep(min: number, max: number, value: number): number {
  const x = Math.max(0, Math.min(1, (value - min) / (max - min)));
  return x * x * (3 - 2 * x);
}

const deg = THREE.MathUtils.degToRad;

/**
 * ProceduralAnimator - Genera gestos procedurales con huesos
 */
export class ProceduralAnimator {
  private bones: BoneRefs = {};
  private state: ProceduralState = {
    currentAction: null,
    startTime: 0,
    duration: 0,
    progress: 0,
    phase: 'done'
  };
  private restPose: Map<string, THREE.Euler> = new Map();
  private initialized = false;
  private swayIntensity = 1.0;

  setSwayIntensity(intensity: number): void {
    this.swayIntensity = intensity;
  }

  initialize(bones: BoneRefs): void {
    this.bones = bones;
    // Guardar pose de descanso
    Object.entries(bones).forEach(([name, bone]) => {
      if (bone) this.restPose.set(name, bone.rotation.clone());
    });
    this.initialized = true;
    console.log('🎭 ProceduralAnimator inicializado con', Object.keys(bones).filter(k => (bones as any)[k]).length, 'huesos');
  }

  /**
   * Ejecutar una acción procedural
   * startTime se establece en -1 para que el primer update() lo capture del reloj de Three.js
   */
  play(actionName: string, duration?: number): boolean {
    if (!this.initialized) return false;

    const actionDurations: Record<string, number> = {
      'wave': 2.6, 'nod': 1.6, 'shake_head': 1.9, 'shrug': 2.2,
      'dance': 4.2, 'excited': 2.6, 'sad': 3.2, 'thinking': 3.2,
      'surprised': 1.6, 'angry': 2.2, 'happy': 2.6, 'clap': 2.2,
      'point': 2.2, 'bow': 2.6, 'stretch': 3.2, 'confused': 2.2,
      'flirt': 3.2, 'laugh': 2.6, 'shy': 2.6, 'sing': 8.0,
      'crouch': 3.5, 'agachate': 3.5, 'touch_head': 3.0, 'toca_cabeza': 3.0,
      'touch_chest': 3.0, 'mano_pecho': 3.0, 'hold_foot': 3.5, 'toma_pie': 3.5,
      'hands_on_hips': 3.0, 'manos_caderas': 3.0, 'hug_self': 3.5, 'abrazarse': 3.5,
      'balance': 3.5, 'equilibrio': 3.5
    };

    const key = actionName.toLowerCase().replace(/[_\s-]/g, '_');
    const dur = duration || actionDurations[key] || 2.2;

    this.state = {
      currentAction: key,
      startTime: -1, // Se captura en el primer update()
      duration: dur,
      progress: 0,
      phase: 'in'
    };

    console.log(`🎭 Procedural: ${key} (${dur}s)`);
    return true;
  }

  /**
   * Actualizar cada frame — elapsedTime viene de state.clock.elapsedTime de Three.js
   */
  update(elapsedTime: number, delta: number): void {
    if (this.state.phase === 'done' || !this.state.currentAction) return;

    // Capturar startTime del mismo reloj la primera vez
    if (this.state.startTime < 0) {
      this.state.startTime = elapsedTime;
    }

    const elapsed = elapsedTime - this.state.startTime;
    const t = Math.min(elapsed / this.state.duration, 1.0);
    this.state.progress = t;

    // Fases orgánicas humanas: 0-0.20=in (con aceleración suave), 0.20-0.80=hold, 0.80-1.0=out
    let intensity: number;
    if (t < 0.20) {
      this.state.phase = 'in';
      intensity = easeOutBack(t / 0.20);
    } else if (t < 0.80) {
      this.state.phase = 'hold';
      intensity = 1.0;
    } else if (t < 1.0) {
      this.state.phase = 'out';
      intensity = 1.0 - easeInOut((t - 0.80) / 0.20);
    } else {
      this.state.phase = 'done';
      this.state.currentAction = null;
      return;
    }

    // Tiempo LOCAL de la animación (0 → duration)
    const localT = elapsed;

    this.applyAction(this.state.currentAction, localT, intensity);
  }

  private applyAction(action: string, t: number, intensity: number): void {
    const { head, spine, hips, rightArm, leftArm, rightForeArm, leftForeArm } = this.bones;
    // Lerp dinámico basado en la fase: más reactivo al inicio, más suave en el sostenimiento
    const phaseLerp = this.state.phase === 'in' ? 0.16 : this.state.phase === 'hold' ? 0.09 : 0.12;
    const lerp = phaseLerp;

    switch (action) {
      case 'wave': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          // Iniciar levantamiento con suave retraso y micro-balanceo
          const targetX = (rest?.x || 0) + deg(54) * intensity;
          const targetZ = (rest?.z || 0) + deg(-32) * intensity + Math.sin(t * 3.5) * deg(3) * intensity;
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, targetX, phaseLerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, targetZ, phaseLerp);
        }
        if (rightForeArm) {
          // Oscilación asimétrica más natural (rápida hacia adentro, suave hacia afuera)
          const waveHarmonic = Math.sin(t * 5.5) * deg(18) + Math.sin(t * 11.0) * deg(4);
          const wave = (deg(12) + waveHarmonic) * intensity;
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, wave, phaseLerp * 1.2);
        }
        if (head) {
          const rest = this.restPose.get('head');
          // Inclinación amigable hacia el lado opuesto y micro-cabeceo
          const headTilt = (rest?.z || 0) + (deg(4.5) + Math.sin(t * 2.8) * deg(1.5)) * intensity;
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, headTilt, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          // Ligera compensación de peso en la columna al alzar el brazo
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + deg(1.5) * intensity, 0.06);
        }
        break;
      }

      case 'nod': {
        if (head) {
          const rest = this.restPose.get('head');
          // Armónico dual: asentimiento primario + rebote secundario más rápido
          const primaryNod = Math.sin(t * 6.0) * deg(10);
          const secondaryNod = Math.sin(t * 12.0) * deg(2.5);
          const nodCycle = (primaryNod + secondaryNod) * intensity;
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + nodCycle, phaseLerp * 1.3);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          // Micro-inclinación del torso acompañando el asentimiento
          const spineNod = Math.sin(t * 6.0) * deg(2.0) * intensity;
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + spineNod, 0.08);
        }
        break;
      }

      case 'shake_head': {
        if (head) {
          const rest = this.restPose.get('head');
          // Decaimiento natural y ligera inclinación z no simétrica
          const decay = Math.max(0.2, 1.0 - (t / this.state.duration) * 0.5);
          const shake = Math.sin(t * 7.5) * deg(14) * decay * intensity;
          const tiltZ = Math.cos(t * 3.75) * deg(2.5) * intensity;
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + shake, phaseLerp * 1.2);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + tiltZ, 0.08);
        }
        break;
      }

      case 'shrug': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(24) * intensity, phaseLerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-8) * intensity, phaseLerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          // Asimetría humana sutil (un brazo levanta 10% diferente)
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(26) * intensity, phaseLerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + deg(7) * intensity, phaseLerp);
        }
        if (rightForeArm) {
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, deg(18) * intensity, phaseLerp);
        }
        if (leftForeArm) {
          leftForeArm.rotation.z = THREE.MathUtils.lerp(leftForeArm.rotation.z, deg(-18) * intensity, phaseLerp);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(7) * intensity, 0.08);
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(-2) * intensity, 0.08);
        }
        break;
      }

      case 'dance': {
        const beat = t * 3.8;
        if (hips) {
          const rest = this.restPose.get('hips');
          const hipSwayY = Math.sin(beat) * deg(7.5) * intensity * this.swayIntensity;
          const hipSwayZ = Math.cos(beat * 0.5) * deg(4.0) * intensity * this.swayIntensity;
          hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, (rest?.y || 0) + hipSwayY, 0.1);
          hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, (rest?.z || 0) + hipSwayZ, 0.1);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          const spineSway = Math.sin(beat + 0.8) * deg(4.5) * intensity * this.swayIntensity;
          const spineBob = Math.sin(beat * 2.0) * deg(2.0) * intensity;
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + spineSway, 0.1);
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + spineBob, 0.1);
        }
        if (head) {
          const rest = this.restPose.get('head');
          const headBob = Math.sin(beat * 2.0) * deg(3.0) * intensity;
          const headTilt = Math.sin(beat) * deg(3.5) * intensity;
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + headBob, 0.1);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + headTilt, 0.1);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          const armRotX = (rest?.x || 0) + deg(18) * intensity + Math.sin(beat) * deg(8) * intensity;
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, armRotX, 0.1);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          const armRotX = (rest?.x || 0) + deg(18) * intensity + Math.sin(beat + Math.PI) * deg(8) * intensity;
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, armRotX, 0.1);
        }
        break;
      }

      case 'sing': {
        const beat = t * 3.2;
        if (hips) {
          const rest = this.restPose.get('hips');
          hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, (rest?.y || 0) + Math.sin(beat) * deg(9) * intensity * this.swayIntensity, 0.08);
          hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, (rest?.z || 0) + Math.cos(beat * 0.5) * deg(3.5) * intensity * this.swayIntensity, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-3) * intensity + Math.sin(beat * 0.5) * deg(2.5) * intensity, 0.08);
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + Math.sin(beat) * deg(5.5) * intensity * this.swayIntensity, 0.08);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + Math.cos(beat) * deg(5.5) * intensity, 0.08);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + Math.sin(beat * 0.5) * deg(4.5) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          const liftX = (rest?.x || 0) + deg(42) * intensity + Math.sin(beat) * deg(12) * intensity;
          const liftZ = (rest?.z || 0) + deg(-22) * intensity + Math.cos(beat) * deg(8) * intensity;
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, liftX, 0.07);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, liftZ, 0.07);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          const liftX = (rest?.x || 0) + deg(38) * intensity + Math.sin(beat + Math.PI * 0.5) * deg(12) * intensity;
          const liftZ = (rest?.z || 0) + deg(22) * intensity + Math.cos(beat + Math.PI) * deg(8) * intensity;
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, liftX, 0.07);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, liftZ, 0.07);
        }
        if (rightForeArm) {
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, deg(15) + Math.sin(beat) * deg(8), 0.08);
        }
        if (leftForeArm) {
          leftForeArm.rotation.z = THREE.MathUtils.lerp(leftForeArm.rotation.z, deg(-15) - Math.sin(beat + Math.PI * 0.5) * deg(8), 0.08);
        }
        break;
      }

      case 'excited':
      case 'happy': {
        const bounce = Math.sin(t * 8.0) * deg(2.5) * intensity;
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(18) * intensity + bounce, phaseLerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-8) * intensity, phaseLerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(18) * intensity + bounce, phaseLerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + deg(8) * intensity, phaseLerp);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-3) * intensity + bounce * 0.5, phaseLerp);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + bounce * 0.8, phaseLerp);
        }
        break;
      }

      case 'sad': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(12) * intensity, 0.06);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(3) * intensity, 0.06);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(6) * intensity, 0.06);
        }
        break;
      }

      case 'thinking': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(42) * intensity, phaseLerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-18) * intensity, phaseLerp);
        }
        if (rightForeArm) {
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, deg(40) * intensity, phaseLerp);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(7) * intensity, 0.07);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(5) * intensity, 0.07);
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(-3) * intensity, 0.07);
        }
        break;
      }

      case 'surprised': {
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-4) * intensity, 0.18);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(-5) * intensity, 0.18);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(18) * intensity, 0.18);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(18) * intensity, 0.18);
        }
        break;
      }

      case 'angry': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(-4) * intensity, phaseLerp);
        }
        // Temblor orgánico no lineal
        const tremble = (Math.sin(t * 22) * 0.7 + Math.sin(t * 31) * 0.3) * deg(0.6) * intensity;
        if (rightArm) rightArm.rotation.z += tremble;
        if (leftArm) leftArm.rotation.z -= tremble;
        break;
      }

      case 'confused': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(11) * intensity, 0.08);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(-4) * intensity, 0.08);
        }
        break;
      }

      case 'point': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(62) * intensity, phaseLerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-28) * intensity, phaseLerp);
        }
        break;
      }

      case 'bow': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(18) * intensity, 0.08);
        }
        break;
      }

      case 'stretch': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(62) * intensity, phaseLerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(62) * intensity, phaseLerp);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-3) * intensity, 0.08);
        }
        break;
      }

      case 'flirt': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(9) * intensity, 0.07);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(6.5) * intensity, 0.07);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + Math.sin(t * 2.2) * deg(2.8) * intensity, 0.07);
        }
        break;
      }

      case 'laugh': {
        // Risa con ritmo natural de diafragma (pulsaciones no sinusoidales)
        const diaphragmPulse = Math.pow(Math.abs(Math.sin(t * 7.5)), 2.5) * deg(3.8) * intensity;
        const headNod = Math.sin(t * 7.5) * deg(2.0) * intensity;
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) - diaphragmPulse, 0.2);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) - headNod, 0.15);
        }
        break;
      }

      case 'shy': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(9) * intensity, 0.07);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(11) * intensity, 0.07);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(-3) * intensity, 0.07);
        }
        break;
      }

      case 'clap': {
        const clapCycle = Math.sin(t * 9.5);
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(30) * intensity, phaseLerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + (deg(-14) + clapCycle * deg(9)) * intensity, 0.2);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(30) * intensity, phaseLerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + (deg(14) - clapCycle * deg(9)) * intensity, 0.2);
        }
        break;
      }

      case 'crouch':
      case 'agachate': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(12) * intensity, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(18) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(25) * intensity, phaseLerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(25) * intensity, phaseLerp);
        }
        break;
      }

      case 'touch_head':
      case 'toca_cabeza': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(-10) * intensity, 0.08);
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(8) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(110) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-35) * intensity, lerp);
        }
        if (rightForeArm) {
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, deg(60) * intensity, lerp);
        }
        break;
      }

      case 'touch_chest':
      case 'mano_pecho': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(6) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(45) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-40) * intensity, lerp);
        }
        if (rightForeArm) {
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, deg(45) * intensity, lerp);
        }
        break;
      }

      case 'hold_foot':
      case 'toma_pie': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(15) * intensity, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(15) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(-50) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-15) * intensity, lerp);
        }
        break;
      }

      case 'hands_on_hips':
      case 'manos_caderas': {
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-5) * intensity, lerp);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(-20) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(35) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(-20) * intensity, lerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + deg(-35) * intensity, lerp);
        }
        break;
      }

      case 'hug_self':
      case 'abrazarse': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(8) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(35) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-50) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(35) * intensity, lerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + deg(50) * intensity, lerp);
        }
        break;
      }

      case 'balance':
      case 'equilibrio': {
        const beat = t * 2.5;
        if (hips) {
          const rest = this.restPose.get('hips');
          hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, (rest?.z || 0) + Math.sin(beat) * deg(2.5) * intensity, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-2) * intensity, 0.08);
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) - Math.sin(beat) * deg(1.5) * intensity, 0.08);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + Math.sin(beat * 0.5) * deg(2) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(15) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-15) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(15) * intensity, lerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + deg(15) * intensity, lerp);
        }
        break;
      }
    }

    // Sincronizar cuaterniones de todos los huesos modificados para que el renderizado de Three.js
    // y SkinnedMesh muestre los movimientos procedurales inmediatamente
    Object.values(this.bones).forEach(bone => {
      if (bone) {
        bone.quaternion.setFromEuler(bone.rotation);
      }
    });
  }

  isPlaying(): boolean {
    return this.state.phase !== 'done';
  }

  getCurrentAction(): string | null {
    return this.state.currentAction;
  }

  stop(): void {
    this.state.phase = 'done';
    this.state.currentAction = null;
  }

  /** Lista de acciones disponibles */
  static getAvailableActions(): string[] {
    return [
      'wave', 'nod', 'shake_head', 'shrug', 'dance', 'excited', 'happy',
      'sad', 'thinking', 'surprised', 'angry', 'confused', 'point', 'bow',
      'stretch', 'flirt', 'laugh', 'shy', 'clap',
      'crouch', 'touch_head', 'touch_chest', 'hold_foot', 'hands_on_hips', 'hug_self'
    ];
  }
}
