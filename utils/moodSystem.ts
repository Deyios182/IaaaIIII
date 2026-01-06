/**
 * Mood System - Sistema de estados anímicos persistentes
 * Influencia comportamiento, animaciones idle y expresiones del avatar
 */

import * as THREE from 'three';

export type Mood =
    | 'cheerful'      // Alegre, optimista
    | 'calm'          // Tranquilo, relajado
    | 'energetic'     // Enérgico, activo
    | 'melancholic'   // Melancólico, pensativo
    | 'focused'       // Concentrado, serio
    | 'playful';      // Juguetón, travieso

export interface MoodState {
    current: Mood;
    intensity: number; // 0-1
    transitionDuration: number; // segundos
}

export interface MoodInfluence {
    breathingSpeed: number;    // Multiplicador de velocidad de respiración
    gestureFrequency: number;  // Frecuencia de gestos automáticos
    expressionIntensity: number; // Intensidad de expresiones faciales
    idleVariation: number;     // Variación en animaciones idle
    timeScale: number;         // Velocidad general de animaciones
}

const MOOD_INFLUENCES: Record<Mood, MoodInfluence> = {
    cheerful: {
        breathingSpeed: 1.2,
        gestureFrequency: 1.5,
        expressionIntensity: 1.3,
        idleVariation: 1.2,
        timeScale: 1.1
    },
    calm: {
        breathingSpeed: 0.7,
        gestureFrequency: 0.5,
        expressionIntensity: 0.7,
        idleVariation: 0.6,
        timeScale: 0.9
    },
    energetic: {
        breathingSpeed: 1.5,
        gestureFrequency: 2.0,
        expressionIntensity: 1.5,
        idleVariation: 1.8,
        timeScale: 1.3
    },
    melancholic: {
        breathingSpeed: 0.8,
        gestureFrequency: 0.3,
        expressionIntensity: 0.6,
        idleVariation: 0.5,
        timeScale: 0.85
    },
    focused: {
        breathingSpeed: 0.9,
        gestureFrequency: 0.4,
        expressionIntensity: 0.8,
        idleVariation: 0.4,
        timeScale: 1.0
    },
    playful: {
        breathingSpeed: 1.3,
        gestureFrequency: 1.8,
        expressionIntensity: 1.4,
        idleVariation: 1.6,
        timeScale: 1.2
    }
};

/**
 * MoodSystem - Gestiona el estado anímico del avatar
 */
export class MoodSystem {
    private state: MoodState;
    private previousMood: Mood;
    private transitionStartTime: number = 0;
    private isTransitioning: boolean = false;

    constructor(initialMood: Mood = 'calm') {
        this.state = {
            current: initialMood,
            intensity: 1.0,
            transitionDuration: 3.0
        };
        this.previousMood = initialMood;
    }

    /**
     * Cambiar mood con transición suave
     */
    setMood(newMood: Mood, intensity: number = 1.0, transitionDuration?: number): void {
        if (newMood === this.state.current) {
            // Solo actualizar intensidad
            this.state.intensity = THREE.MathUtils.clamp(intensity, 0, 1);
            return;
        }

        this.previousMood = this.state.current;
        this.state.current = newMood;
        this.state.intensity = THREE.MathUtils.clamp(intensity, 0, 1);

        if (transitionDuration !== undefined) {
            this.state.transitionDuration = transitionDuration;
        }

        this.isTransitioning = true;
        this.transitionStartTime = Date.now();

        console.log(`🌟 Mood cambiado: ${this.previousMood} → ${newMood} (intensidad: ${intensity})`);
    }

    /**
     * Obtener influencias actuales del mood
     */
    getInfluence(): MoodInfluence {
        const currentInfluence = MOOD_INFLUENCES[this.state.current];

        // Si está en transición, interpolar entre moods
        if (this.isTransitioning) {
            const elapsed = (Date.now() - this.transitionStartTime) / 1000;
            const progress = Math.min(elapsed / this.state.transitionDuration, 1);

            if (progress >= 1) {
                this.isTransitioning = false;
            }

            const previousInfluence = MOOD_INFLUENCES[this.previousMood];

            // Interpolar cada propiedad
            return {
                breathingSpeed: THREE.MathUtils.lerp(
                    previousInfluence.breathingSpeed,
                    currentInfluence.breathingSpeed,
                    progress
                ),
                gestureFrequency: THREE.MathUtils.lerp(
                    previousInfluence.gestureFrequency,
                    currentInfluence.gestureFrequency,
                    progress
                ),
                expressionIntensity: THREE.MathUtils.lerp(
                    previousInfluence.expressionIntensity,
                    currentInfluence.expressionIntensity,
                    progress
                ),
                idleVariation: THREE.MathUtils.lerp(
                    previousInfluence.idleVariation,
                    currentInfluence.idleVariation,
                    progress
                ),
                timeScale: THREE.MathUtils.lerp(
                    previousInfluence.timeScale,
                    currentInfluence.timeScale,
                    progress
                )
            };
        }

        // Aplicar intensidad
        return {
            breathingSpeed: THREE.MathUtils.lerp(1, currentInfluence.breathingSpeed, this.state.intensity),
            gestureFrequency: THREE.MathUtils.lerp(1, currentInfluence.gestureFrequency, this.state.intensity),
            expressionIntensity: THREE.MathUtils.lerp(1, currentInfluence.expressionIntensity, this.state.intensity),
            idleVariation: THREE.MathUtils.lerp(1, currentInfluence.idleVariation, this.state.intensity),
            timeScale: THREE.MathUtils.lerp(1, currentInfluence.timeScale, this.state.intensity)
        };
    }

    /**
     * Obtener mood actual
     */
    getCurrentMood(): Mood {
        return this.state.current;
    }

    /**
     * Obtener intensidad actual
     */
    getIntensity(): number {
        return this.state.intensity;
    }

    /**
     * Verificar si está en transición
     */
    isInTransition(): boolean {
        return this.isTransitioning;
    }

    /**
     * Sugerir mood basado en emoción
     */
    static suggestMoodFromEmotion(emotion: string): Mood {
        const moodMap: Record<string, Mood> = {
            'happy': 'cheerful',
            'excited': 'energetic',
            'sad': 'melancholic',
            'neutral': 'calm',
            'thinking': 'focused',
            'confused': 'focused',
            'angry': 'energetic',
            'surprised': 'playful'
        };

        return moodMap[emotion.toLowerCase()] || 'calm';
    }

    /**
     * Obtener nombre de animación idle según mood
     */
    getIdleAnimation(): string {
        const idleMap: Record<Mood, string> = {
            cheerful: 'Idle_Happy',
            calm: 'Idle',
            energetic: 'Idle_Energetic',
            melancholic: 'Idle_Sad',
            focused: 'Idle_Focused',
            playful: 'Idle_Playful'
        };

        return idleMap[this.state.current] || 'Idle';
    }
}

/**
 * Helper para detectar mood desde contexto conversacional
 */
export function detectMoodFromText(text: string): Mood {
    const lowerText = text.toLowerCase();

    // Patrones de mood
    if (lowerText.match(/jaja|jeje|feliz|genial|increíble/i)) return 'cheerful';
    if (lowerText.match(/tranquilo|calma|relax|paz/i)) return 'calm';
    if (lowerText.match(/!!!|wow|vamos|dale|energía/i)) return 'energetic';
    if (lowerText.match(/triste|lamento|pena|mal/i)) return 'melancholic';
    if (lowerText.match(/enfocado|concentrado|serio|importante/i)) return 'focused';
    if (lowerText.match(/jugar|diversión|bromear|travieso/i)) return 'playful';

    return 'calm'; // Default
}
