/**
 * Emotion Detector
 * Analiza texto para detectar emociones y mapearlas a animaciones
 */

export type Emotion =
    | 'neutral'
    | 'happy'
    | 'sad'
    | 'excited'
    | 'thinking'
    | 'surprised'
    | 'confused'
    | 'angry';

export interface EmotionResult {
    emotion: Emotion;
    intensity: number; // 0-1
    confidence: number; // 0-1
}

/**
 * Detecta emoción basándose en keywords y contexto del texto
 */
export function detectEmotion(text: string): EmotionResult {
    const lowerText = text.toLowerCase();

    // Patrones de emociones
    const emotionPatterns = {
        happy: [
            'jaja', 'jeje', 'feliz', 'genial', 'excelente', 'increíble', 'maravilloso',
            'alegre', 'contento', 'perfecto', '😊', '😄', '🎉', 'yay', 'wow positivo'
        ],
        excited: [
            '!!!', 'woww', 'increíble!', 'asombroso', 'brutal', 'épico', '🔥', '⚡',
            'guau', 'ostras', 'madre mía', 'flipante'
        ],
        sad: [
            'triste', 'lamento', 'pena', 'mal', 'terrible', 'horrible', 'desafortunado',
            '😢', '😞', 'tristeza', 'llorar'
        ],
        thinking: [
            'hmm', 'déjame pensar', 'veamos', 'analicemos', 'considerando', '🤔',
            'interesante', 'momento', 'pensando', 'reflexionando'
        ],
        surprised: [
            '¿?!', 'qué?!', 'en serio?', 'no puede ser', 'increíble', '😮', '😲',
            'sorprendente', 'inesperado', 'vaya'
        ],
        confused: [
            '¿qué?', 'no entiendo', 'confundido', 'eh?', '🤨', '😕',
            'perdón?', 'cómo así', 'explicame'
        ],
        angry: [
            'enojado', 'furioso', 'ira', 'molesto', 'maldita sea', 'odio', '😡', '😠',
            'estúpido', 'idiota', 'arggh', 'maldición'
        ]
    };

    // Detectar emoción dominante
    let detectedEmotion: Emotion = 'neutral';
    let maxMatches = 0;
    let totalIntensity = 0;

    for (const [emotion, keywords] of Object.entries(emotionPatterns)) {
        let matches = 0;
        let emotionIntensity = 0;

        keywords.forEach(keyword => {
            // Escapar caracteres especiales de regex (como ?)
            const escapedKeyword = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

            // Usar word boundaries (\b) para evitar coincidencias parciales, 
            // a menos que el keyword empiece/termine con símbolos no alfanuméricos
            const prefix = /^\w/.test(keyword) ? '\\b' : '';
            const suffix = /\w$/.test(keyword) ? '\\b' : '';

            const regex = new RegExp(`${prefix}${escapedKeyword}${suffix}`, 'gi');
            const count = (lowerText.match(regex) || []).length;
            matches += count;

            // Intensidad basada en signos de exclamación
            const exclamations = (lowerText.match(/!/g) || []).length;
            emotionIntensity += exclamations * 0.1;
        });

        if (matches > maxMatches) {
            maxMatches = matches;
            detectedEmotion = emotion as Emotion;
            totalIntensity = Math.min(emotionIntensity + (matches * 0.2), 1);
        }
    }

    // Si no se detectó nada, es neutral
    if (maxMatches === 0) {
        return { emotion: 'neutral', intensity: 0.5, confidence: 1 };
    }

    return {
        emotion: detectedEmotion,
        intensity: Math.max(0.3, Math.min(totalIntensity, 1)),
        confidence: Math.min(maxMatches / 3, 1)
    };
}

/**
 * Mapea emoción a nombres de animaciones del modelo
 */
export function emotionToAnimation(emotion: Emotion): string {
    const animationMap: Record<Emotion, string> = {
        neutral: 'Idle',
        happy: 'Happy',
        sad: 'Sad',
        excited: 'Excited',
        thinking: 'Thinking',
        surprised: 'Surprised',
        confused: 'Confused',
        angry: 'Angry'
    };

    return animationMap[emotion] || 'Idle';
}

/**
 * Obtiene valores de expresión facial para morph targets
 */
export function emotionToFacialExpression(emotion: Emotion, intensity: number): Record<string, number> {
    const expressions: Record<string, number> = {
        'browInnerUp': 0,
        'browOuterUpL': 0,
        'browOuterUpR': 0,
        'eyeWideL': 0,
        'eyeWideR': 0,
        'mouthSmileL': 0,
        'mouthSmileR': 0,
        'mouthFrownL': 0,
        'mouthFrownR': 0,
    };

    const smoothIntensity = intensity * 0.7; // Suavizar para que no sea exagerado

    switch (emotion) {
        case 'happy':
            expressions['mouthSmileL'] = smoothIntensity;
            expressions['mouthSmileR'] = smoothIntensity;
            expressions['browOuterUpL'] = smoothIntensity * 0.3;
            expressions['browOuterUpR'] = smoothIntensity * 0.3;
            break;

        case 'excited':
            expressions['mouthSmileL'] = smoothIntensity;
            expressions['mouthSmileR'] = smoothIntensity;
            expressions['eyeWideL'] = smoothIntensity * 0.8;
            expressions['eyeWideR'] = smoothIntensity * 0.8;
            expressions['browInnerUp'] = smoothIntensity * 0.6;
            break;

        case 'sad':
            expressions['mouthFrownL'] = smoothIntensity;
            expressions['mouthFrownR'] = smoothIntensity;
            expressions['browInnerUp'] = smoothIntensity * 0.5;
            break;

        case 'thinking':
            expressions['browInnerUp'] = smoothIntensity * 0.4;
            expressions['browOuterUpL'] = smoothIntensity * 0.2;
            break;

        case 'surprised':
            expressions['eyeWideL'] = smoothIntensity;
            expressions['eyeWideR'] = smoothIntensity;
            expressions['browInnerUp'] = smoothIntensity * 0.8;
            expressions['mouthOpen'] = smoothIntensity * 0.5;
            break;

        case 'confused':
            expressions['browInnerUp'] = smoothIntensity * 0.6;
            expressions['browOuterUpL'] = -smoothIntensity * 0.3;
            break;

        case 'angry':
            expressions['browInnerUp'] = -smoothIntensity * 0.8;
            expressions['browOuterUpL'] = smoothIntensity * 0.5;
            expressions['mouthFrownL'] = smoothIntensity;
            expressions['mouthFrownR'] = smoothIntensity;
            break;

        default:
            // neutral - todo a 0
            break;
    }

    return expressions;
}
