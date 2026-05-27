/**
 * Animation Manager - Sistema central de gestión de animaciones
 * Maneja carga, reproducción, blending y prioridades de animaciones de Blender
 */

import * as THREE from 'three';

export interface AnimationConfig {
    name: string;
    priority: number; // 0-10 (10 = máxima prioridad)
    loop: boolean;
    blendDuration: number; // Duración de blend en segundos
    timeScale?: number; // Velocidad de reproducción (1 = normal)
    onComplete?: () => void;
    onStart?: () => void;
}

export interface ActiveAnimation {
    action: THREE.AnimationAction;
    config: AnimationConfig;
    startTime: number;
}

/**
 * AnimationManager - Gestiona todas las animaciones del modelo
 */
export class AnimationManager {
    private mixer: THREE.AnimationMixer;
    private clips: Map<string, THREE.AnimationClip> = new Map();
    private actions: Map<string, THREE.AnimationAction> = new Map();
    private activeAnimations: ActiveAnimation[] = [];
    private defaultConfig: Partial<AnimationConfig> = {
        priority: 5,
        loop: false,
        blendDuration: 0.3,
        timeScale: 1
    };

    constructor(model: THREE.Object3D, animations: THREE.AnimationClip[]) {
        this.mixer = new THREE.AnimationMixer(model);

        // Cargar todos los clips disponibles
        animations.forEach(clip => {
            this.clips.set(clip.name, clip);
            const action = this.mixer.clipAction(clip);
            this.actions.set(clip.name, action);
        });

        console.log(`🎬 AnimationManager: ${this.clips.size} clips cargados:`,
            Array.from(this.clips.keys()).join(', '));
    }

    /**
     * Reproducir una animación con configuración
     */
    play(animationName: string, config?: Partial<AnimationConfig>): boolean {
        let action = this.actions.get(animationName);
        let actualName = animationName;

        // BÚSQUEDA ROBUSTA SI NO EXISTE
        if (!action) {
            // 1. Probar case-insensitive
            const lowerName = animationName.toLowerCase();
            const keys = Array.from(this.actions.keys());
            const key = keys.find(k => k.toLowerCase() === lowerName);
            if (key) {
                action = this.actions.get(key);
                actualName = key;
            }

            // 2. Fallbacks específicos
            if (!action) {
                if (lowerName.includes('idle') || lowerName === 'neutral') {
                    // Buscar cualquier clip que tenga "idle" en el nombre
                    const idleKey = keys.find(k => k.toLowerCase().includes('idle'));
                    // O usar el primer clip si es el principal (ej: GrokAniAction)
                    const fallbackKey = idleKey || keys.find(k => k.includes('Action')) || keys[0];
                    if (fallbackKey) {
                        action = this.actions.get(fallbackKey);
                        actualName = fallbackKey;
                        console.log(`ℹ️ Usando fallback para Idle: ${actualName}`);
                    }
                } else if (lowerName.includes('wave')) {
                    // Si no hay wave, intentar saludar con lo que haya o ignore
                    console.warn(`⚠️ No se encontró animación de saludo (${animationName})`);
                }
            }
        }

        if (!action) {
            console.warn(`⚠️ Animación no encontrada: ${animationName}. Disponibles: ${Array.from(this.actions.keys()).join(', ')}`);
            return false;
        }

        const finalConfig: AnimationConfig = {
            name: actualName,
            ...this.defaultConfig,
            ...config
        } as AnimationConfig;

        // Verificar conflictos de prioridad
        this.handlePriority(finalConfig);

        // Configurar acción
        action.reset();
        action.setLoop(finalConfig.loop ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
        action.clampWhenFinished = !finalConfig.loop;
        action.timeScale = finalConfig.timeScale || 1;

        // Fade in
        action.fadeIn(finalConfig.blendDuration);
        action.play();

        // Registrar como activa
        const activeAnim: ActiveAnimation = {
            action,
            config: finalConfig,
            startTime: Date.now()
        };
        this.activeAnimations.push(activeAnim);

        // Callback de inicio
        if (finalConfig.onStart) {
            finalConfig.onStart();
        }

        // Listener para completado
        if (!finalConfig.loop && finalConfig.onComplete) {
            const onFinished = (e: any) => {
                if (e.action === action && finalConfig.onComplete) {
                    finalConfig.onComplete();
                    this.mixer.removeEventListener('finished', onFinished);
                }
            };
            this.mixer.addEventListener('finished', onFinished);
        }

        console.log(`▶️ Reproduciendo: ${actualName} (request: ${animationName}, prioridad: ${finalConfig.priority})`);
        return true;
    }

    /**
     * Detener una animación con fade out
     */
    stop(animationName: string, fadeDuration: number = 0.3): void {
        const action = this.actions.get(animationName);
        if (!action) return;

        action.fadeOut(fadeDuration);

        // Remover de activas después del fade
        setTimeout(() => {
            action.stop();
            this.activeAnimations = this.activeAnimations.filter(
                a => a.config.name !== animationName
            );
        }, fadeDuration * 1000);
    }

    /**
     * Obtener lista de animaciones disponibles
     */
    getAvailableAnimations(): string[] {
        return Array.from(this.clips.keys());
    }

    /**
     * Detener todas las animaciones
     */
    stopAll(fadeDuration: number = 0.3): void {
        this.activeAnimations.forEach(({ config }) => {
            this.stop(config.name, fadeDuration);
        });
    }

    /**
     * Manejar sistema de prioridades - detener animaciones de menor prioridad
     */
    private handlePriority(newConfig: AnimationConfig): void {
        this.activeAnimations.forEach(({ action, config }) => {
            if (config.priority < newConfig.priority) {
                // Detener animación de menor prioridad
                this.stop(config.name, newConfig.blendDuration);
            }
        });
    }

    /**
     * Transición suave entre dos animaciones
     */
    crossFade(fromName: string, toName: string, duration: number = 0.5): void {
        const fromAction = this.actions.get(fromName);
        const toAction = this.actions.get(toName);

        if (!fromAction || !toAction) {
            console.warn(`⚠️ No se puede hacer crossfade: ${fromName} → ${toName}`);
            return;
        }

        fromAction.fadeOut(duration);
        toAction.reset().fadeIn(duration).play();

        console.log(`🔄 Crossfade: ${fromName} → ${toName}`);
    }

    /**
     * Actualizar mixer (llamar en useFrame)
     */
    update(delta: number): void {
        this.mixer.update(delta);
    }

    /**
     * Verificar si una animación está activa
     */
    isPlaying(animationName: string): boolean {
        return this.activeAnimations.some(a => a.config.name === animationName);
    }

    /**
     * Obtener animaciones activas
     */
    getActiveAnimations(): string[] {
        return this.activeAnimations.map(a => a.config.name);
    }

    /**
     * Verificar si existe una animación
     */
    hasAnimation(name: string): boolean {
        return this.clips.has(name);
    }

    /**
     * Cleanup
     */
    dispose(): void {
        this.stopAll(0);
        this.mixer.stopAllAction();
        this.clips.clear();
        this.actions.clear();
        this.activeAnimations = [];
    }
}

/**
 * Mapeo inteligente de emociones/acciones a nombres de animaciones
 */
export const ANIMATION_MAP: Record<string, string> = {
    // Emociones
    'neutral': 'Idle',
    'happy': 'Happy',
    'sad': 'Sad',
    'excited': 'Excited',
    'thinking': 'Think_Idle',
    'surprised': 'Surprised',
    'confused': 'Confused',
    'angry': 'Angry',

    // Acciones
    'wave': 'Wave',
    'dance': 'Dance_01',
    'shrug': 'Shrug',
    'nod': 'Nod',
    'shake_head': 'Shake_Head',
    'clap': 'Clap',
    'point': 'Point',
    'bow': 'Bow',
    'stretch': 'Stretch',
    'flirt': 'Flirt',
    'laugh': 'Laugh',
    'shy': 'Shy',

    // Estados
    'idle_calm': 'Idle_Calm',
    'idle_energetic': 'Idle_Energetic',
};

/**
 * Helper para obtener nombre de animación desde emoción/acción
 */
export function getAnimationName(emotionOrAction: string): string {
    return ANIMATION_MAP[emotionOrAction.toLowerCase()] || 'Idle';
}
