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

// Easing suave
function easeInOut(t: number): number {
  return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
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
      'wave': 2.5, 'nod': 1.5, 'shake_head': 1.8, 'shrug': 2.0,
      'dance': 4.0, 'excited': 2.5, 'sad': 3.0, 'thinking': 3.0,
      'surprised': 1.5, 'angry': 2.0, 'happy': 2.5, 'clap': 2.0,
      'point': 2.0, 'bow': 2.5, 'stretch': 3.0, 'confused': 2.0,
      'flirt': 3.0, 'laugh': 2.5, 'shy': 2.5, 'sing': 8.0
    };

    const key = actionName.toLowerCase().replace(/[_\s-]/g, '_');
    const dur = duration || actionDurations[key] || 2.0;

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

    // Fases: 0-0.15=in, 0.15-0.85=hold, 0.85-1.0=out
    let intensity: number;
    if (t < 0.15) {
      this.state.phase = 'in';
      intensity = easeOut(t / 0.15);
    } else if (t < 0.85) {
      this.state.phase = 'hold';
      intensity = 1.0;
    } else if (t < 1.0) {
      this.state.phase = 'out';
      intensity = 1.0 - easeInOut((t - 0.85) / 0.15);
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
    const lerp = 0.12; // Velocidad de interpolación suave

    switch (action) {
      case 'wave': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          const targetX = (rest?.x || 0) + deg(50) * intensity;  // Levantar
          const targetZ = (rest?.z || 0) + deg(-30) * intensity; // Separar del cuerpo
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, targetX, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, targetZ, lerp);
        }
        if (rightForeArm) {
          // Oscilar suavemente a ~3Hz
          const wave = Math.sin(t * 6) * deg(20) * intensity;
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, wave, lerp);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(5) * intensity, 0.06);
        }
        break;
      }

      case 'nod': {
        if (head) {
          const rest = this.restPose.get('head');
          const nodCycle = Math.sin(t * 6) * deg(12) * intensity;
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + nodCycle, lerp);
        }
        break;
      }

      case 'shake_head': {
        if (head) {
          const rest = this.restPose.get('head');
          const shake = Math.sin(t * 8) * deg(15) * intensity;
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + shake, lerp);
        }
        break;
      }

      case 'shrug': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(25) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(25) * intensity, lerp);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(8) * intensity, 0.06);
        }
        break;
      }

      case 'dance': {
        const beat = t * 4; // Ritmo más lento y controlado
        if (hips) {
          const rest = this.restPose.get('hips');
          hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, (rest?.y || 0) + Math.sin(beat) * deg(8) * intensity, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + Math.sin(beat + 1) * deg(5) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(20) * intensity + Math.sin(beat) * deg(10) * intensity, 0.08);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(20) * intensity + Math.sin(beat + Math.PI) * deg(10) * intensity, 0.08);
        }
        break;
      }

      case 'sing': {
        const beat = t * 3.5;
        if (hips) {
          const rest = this.restPose.get('hips');
          hips.rotation.y = THREE.MathUtils.lerp(hips.rotation.y, (rest?.y || 0) + Math.sin(beat) * deg(10) * intensity, 0.08);
          hips.rotation.z = THREE.MathUtils.lerp(hips.rotation.z, (rest?.z || 0) + Math.cos(beat * 0.5) * deg(4) * intensity, 0.08);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-3) * intensity + Math.sin(beat * 0.5) * deg(3) * intensity, 0.08);
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + Math.sin(beat) * deg(6) * intensity, 0.08);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + Math.cos(beat) * deg(6) * intensity, 0.08);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + Math.sin(beat * 0.5) * deg(5) * intensity, 0.08);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          const liftX = (rest?.x || 0) + deg(45) * intensity + Math.sin(beat) * deg(15) * intensity;
          const liftZ = (rest?.z || 0) + deg(-25) * intensity + Math.cos(beat) * deg(10) * intensity;
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, liftX, 0.06);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, liftZ, 0.06);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          const liftX = (rest?.x || 0) + deg(40) * intensity + Math.sin(beat + Math.PI * 0.5) * deg(15) * intensity;
          const liftZ = (rest?.z || 0) + deg(25) * intensity + Math.cos(beat + Math.PI) * deg(10) * intensity;
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, liftX, 0.06);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, liftZ, 0.06);
        }
        if (rightForeArm) {
          rightForeArm.rotation.z = THREE.MathUtils.lerp(rightForeArm.rotation.z, deg(15) + Math.sin(beat) * deg(10), 0.08);
        }
        if (leftForeArm) {
          leftForeArm.rotation.z = THREE.MathUtils.lerp(leftForeArm.rotation.z, deg(-15) - Math.sin(beat + Math.PI * 0.5) * deg(10), 0.08);
        }
        break;
      }

      case 'excited':
      case 'happy': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(15) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(15) * intensity, lerp);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-2) * intensity, lerp);
        }
        break;
      }

      case 'sad': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(10) * intensity, 0.05);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(5) * intensity, 0.05);
        }
        break;
      }

      case 'thinking': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(40) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-15) * intensity, lerp);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(8) * intensity, 0.05);
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(4) * intensity, 0.05);
        }
        break;
      }

      case 'surprised': {
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(-3) * intensity, lerp);
        }
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(15) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(15) * intensity, lerp);
        }
        break;
      }

      case 'angry': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(-3) * intensity, lerp);
        }
        const tremble = Math.sin(t * 20) * deg(0.5) * intensity;
        if (rightArm) rightArm.rotation.z += tremble;
        if (leftArm) leftArm.rotation.z -= tremble;
        break;
      }

      case 'confused': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(10) * intensity, 0.06);
        }
        break;
      }

      case 'point': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(60) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + deg(-30) * intensity, lerp);
        }
        break;
      }

      case 'bow': {
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) + deg(15) * intensity, 0.06);
        }
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(10) * intensity, 0.06);
        }
        break;
      }

      case 'stretch': {
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(60) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(60) * intensity, lerp);
        }
        break;
      }

      case 'flirt': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.z = THREE.MathUtils.lerp(head.rotation.z, (rest?.z || 0) + deg(8) * intensity, 0.05);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(6) * intensity, 0.05);
        }
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.z = THREE.MathUtils.lerp(spine.rotation.z, (rest?.z || 0) + Math.sin(t * 2) * deg(3) * intensity, 0.06);
        }
        break;
      }

      case 'laugh': {
        const bounce = Math.abs(Math.sin(t * 8)) * deg(3) * intensity;
        if (spine) {
          const rest = this.restPose.get('spine');
          spine.rotation.x = THREE.MathUtils.lerp(spine.rotation.x, (rest?.x || 0) - bounce, lerp);
        }
        break;
      }

      case 'shy': {
        if (head) {
          const rest = this.restPose.get('head');
          head.rotation.x = THREE.MathUtils.lerp(head.rotation.x, (rest?.x || 0) + deg(8) * intensity, 0.05);
          head.rotation.y = THREE.MathUtils.lerp(head.rotation.y, (rest?.y || 0) + deg(12) * intensity, 0.05);
        }
        break;
      }

      case 'clap': {
        const clapCycle = Math.sin(t * 10);
        if (rightArm) {
          const rest = this.restPose.get('rightArm');
          rightArm.rotation.x = THREE.MathUtils.lerp(rightArm.rotation.x, (rest?.x || 0) + deg(30) * intensity, lerp);
          rightArm.rotation.z = THREE.MathUtils.lerp(rightArm.rotation.z, (rest?.z || 0) + (deg(-15) + clapCycle * deg(10)) * intensity, lerp);
        }
        if (leftArm) {
          const rest = this.restPose.get('leftArm');
          leftArm.rotation.x = THREE.MathUtils.lerp(leftArm.rotation.x, (rest?.x || 0) + deg(30) * intensity, lerp);
          leftArm.rotation.z = THREE.MathUtils.lerp(leftArm.rotation.z, (rest?.z || 0) + (deg(15) - clapCycle * deg(10)) * intensity, lerp);
        }
        break;
      }
    }
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
      'stretch', 'flirt', 'laugh', 'shy', 'clap'
    ];
  }
}
