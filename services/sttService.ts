/**
 * Speech-to-Text Service
 * 
 * Transcribe audio a texto usando Web Speech API (nativo del navegador).
 * GRATIS - No consume cuota de Gemini.
 */

export interface STTConfig {
    language?: string;
    sampleRate?: number;
}

/**
 * Transcribe audio PCM a texto usando Web Speech API
 * Esta es la versión principal - NO usa Gemini
 */
export async function transcribeAudio(
    audioData: ArrayBuffer,
    config: STTConfig = {}
): Promise<string> {
    return new Promise((resolve, reject) => {
        try {
            // Verificar soporte de Web Speech API
            const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

            if (!SpeechRecognition) {
                reject(new Error('Web Speech API no soportada en este navegador'));
                return;
            }

            const recognition = new SpeechRecognition();
            recognition.lang = config.language || 'es-ES';
            recognition.continuous = false;
            recognition.interimResults = false;
            recognition.maxAlternatives = 1;

            console.log('🎤 Iniciando transcripción con Web Speech API...');

            recognition.onresult = (event: any) => {
                const transcript = event.results[0][0].transcript;
                const confidence = event.results[0][0].confidence;
                console.log(`✅ Transcripción: "${transcript}" (confianza: ${(confidence * 100).toFixed(0)}%)`);
                resolve(transcript);
            };

            recognition.onerror = (event: any) => {
                console.error('❌ Error en Speech Recognition:', event.error);
                reject(new Error(`Speech recognition error: ${event.error}`));
            };

            recognition.onnomatch = () => {
                console.warn('⚠️ No se detectó voz reconocible');
                resolve(''); // Devolver cadena vacía en lugar de error
            };

            // Iniciar reconocimiento
            recognition.start();

            // El micrófono YA está capturando audio en Dashboard
            // Web Speech API escucha directamente del micrófono activo

        } catch (error: any) {
            console.error('❌ Error configurando STT:', error);
            reject(error);
        }
    });
}

/**
 * Versión simplificada para uso directo (sin ArrayBuffer)
 */
export function startContinuousRecognition(
    onTranscript: (text: string) => void,
    onError?: (error: Error) => void,
    language: string = 'es-ES'
): () => void {
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
        const error = new Error('Web Speech API no soportada');
        if (onError) onError(error);
        return () => { };
    }

    const recognition = new SpeechRecognition();
    recognition.lang = language;
    recognition.continuous = true; // Reconocimiento continuo
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
        const last = event.results.length - 1;
        const transcript = event.results[last][0].transcript;
        console.log('🎤 Transcripción:', transcript);
        onTranscript(transcript);
    };

    recognition.onerror = (event: any) => {
        console.error('❌ Error en reconocimiento:', event.error);
        if (onError) onError(new Error(event.error));
    };

    recognition.start();
    console.log('🎤 Reconocimiento continuo iniciado');

    // Retornar función de cleanup
    return () => {
        recognition.stop();
        console.log('🛑 Reconocimiento detenido');
    };
}
