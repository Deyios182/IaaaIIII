/**
 * Text-to-Speech Service
 * 
 * Convierte texto a audio usando Gemini TTS o Web Speech API.
 * Se usa en el pipeline para generar respuestas de voz.
 */

import { GoogleGenAI } from '@google/genai';

export interface TTSConfig {
    voice?: string;
    pitch?: number;
    rate?: number;
    language?: string;
}

/**
 * Sintetiza texto a audio usando Web Speech API
 * (Gemini no tiene TTS nativo aún, usamos browser API)
 */
export async function synthesizeSpeech(
    text: string,
    config: TTSConfig = {}
): Promise<ArrayBuffer> {
    return new Promise((resolve, reject) => {
        if (!window.speechSynthesis) {
            reject(new Error('Speech Synthesis no soportado en este navegador'));
            return;
        }

        const utterance = new SpeechSynthesisUtterance(text);

        // Configuración de voz
        utterance.lang = config.language || 'es-ES';
        utterance.pitch = config.pitch || 1.0;
        utterance.rate = config.rate || 1.0;

        // Buscar voz en español femenina si está disponible
        const voices = window.speechSynthesis.getVoices();
        const spanishVoice = voices.find(v =>
            v.lang.startsWith('es') && v.name.toLowerCase().includes('fem')
        ) || voices.find(v => v.lang.startsWith('es'));

        if (spanishVoice) {
            utterance.voice = spanishVoice;
        }

        console.log('🔊 TTS: Sintetizando voz...');

        // Capturar audio como ArrayBuffer es complejo con SpeechSynthesis
        // Por ahora, reproducimos directamente
        utterance.onend = () => {
            console.log('✅ TTS completado');
            // Retornamos un buffer vacío ya que SpeechSynthesis reproduce directamente
            resolve(new ArrayBuffer(0));
        };

        utterance.onerror = (event) => {
            console.error('❌ Error TTS:', event);
            reject(new Error(`TTS error: ${event.error}`));
        };

        window.speechSynthesis.speak(utterance);
    });
}

/**
 * Versión alternativa: reproducir directamente sin capturar buffer
 */
export function speakText(text: string, config: TTSConfig = {}): void {
    if (!window.speechSynthesis) {
        console.error('Speech Synthesis no disponible');
        return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = config.language || 'es-ES';
    utterance.pitch = config.pitch || 1.0;
    utterance.rate = config.rate || 1.0;

    const voices = window.speechSynthesis.getVoices();
    const spanishVoice = voices.find(v =>
        v.lang.startsWith('es') && v.name.toLowerCase().includes('fem')
    ) || voices.find(v => v.lang.startsWith('es'));

    if (spanishVoice) {
        utterance.voice = spanishVoice;
    }

    window.speechSynthesis.speak(utterance);
}

/**
 * Detener cualquier síntesis en curso
 */
export function stopSpeech(): void {
    if (window.speechSynthesis) {
        window.speechSynthesis.cancel();
    }
}

/**
 * Cargar voces disponibles (debe llamarse al inicio)
 */
export function loadVoices(): Promise<SpeechSynthesisVoice[]> {
    return new Promise((resolve) => {
        const voices = window.speechSynthesis.getVoices();
        if (voices.length > 0) {
            resolve(voices);
        } else {
            window.speechSynthesis.onvoiceschanged = () => {
                resolve(window.speechSynthesis.getVoices());
            };
        }
    });
}
