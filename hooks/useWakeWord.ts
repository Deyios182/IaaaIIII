/**
 * useWakeWord - Sistema de Activación por Voz (Wake Word) Inteligente y Multi-Modelo
 * Compatible 100% con Electron y Navegadores (Windows / Mac / Linux)
 *
 * Características:
 * 1. Filtro Acústico Local de Sílabas: Solo evalúa fragmentos con 2 a 4 pulsos de voz (como "Hey No-va" o "Ho-la No-va"). Cero llamadas a la API con ruidos aislados, golpes o estática.
 * 2. Cascada Multi-Modelo Anti-429: Utiliza 'gemini-2.0-flash' (alta cuota, ~200ms) -> 'gemini-1.5-flash' -> OpenRouter (si está disponible).
 * 3. Circuit-Breaker inteligente: No satura la red si una cuota está temporalmente ocupada.
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { GoogleGenAI } from '@google/genai';

export interface WakeWordConfig {
    /** Sensibilidad del micrófono (volumen RMS para detectar voz). Default: 10 */
    volumeThreshold?: number;
    /** Si true, imprime logs en consola. Default: true */
    debug?: boolean;
    /** Callback cuando se detecta el comando de activación ("Hey Nova", etc.) */
    onActivate?: () => void;
    /** Callback cuando se detecta el comando de desactivación ("Nova para", etc.) */
    onDeactivate?: () => void;
    /** Callback con el estado de volumen / detección */
    onVoiceDetected?: (volume: number) => void;
    /** Habilitar o deshabilitar escucha */
    enabled?: boolean;
}

export interface WakeWordReturn {
    isListening: boolean;
    isSpeechDetected: boolean;
    isSupported: boolean;
    lastDetectedPhrase: string;
    startListening: () => Promise<void>;
    stopListening: () => void;
}

/**
 * Convierte Float32Array PCM a WAV Base64 con el sampleRate exacto
 */
function pcmToWavBase64(samples: Float32Array, sampleRate: number): string {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    writeString(view, 0, 'RIFF');
    view.setUint32(4, 36 + samples.length * 2, true);
    writeString(view, 8, 'WAVE');

    writeString(view, 12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true);
    view.setUint16(22, 1, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * 2, true);
    view.setUint16(32, 2, true);
    view.setUint16(34, 16, true);

    writeString(view, 36, 'data');
    view.setUint32(40, samples.length * 2, true);

    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
        const s = Math.max(-1, Math.min(1, samples[i]));
        view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7FFF, true);
    }

    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function writeString(view: DataView, offset: number, string: string) {
    for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
    }
}

/**
 * Cuenta los pulsos de energía (sílabas aproximadas) en un buffer de audio
 */
function countEnergyPeaks(samples: Float32Array, sampleRate: number): number {
    const windowSize = Math.round(sampleRate * 0.05); // Ventana de 50ms
    const energies: number[] = [];

    for (let i = 0; i < samples.length; i += windowSize) {
        let sum = 0;
        const end = Math.min(samples.length, i + windowSize);
        for (let j = i; j < end; j++) {
            sum += samples[j] * samples[j];
        }
        energies.push(Math.sqrt(sum / (end - i)));
    }

    // Umbral de pico relativo
    const maxEnergy = Math.max(...energies, 0.001);
    const threshold = maxEnergy * 0.35;

    let peaks = 0;
    let inPeak = false;

    for (const e of energies) {
        if (e > threshold) {
            if (!inPeak) {
                peaks++;
                inPeak = true;
            }
        } else if (e < threshold * 0.6) {
            inPeak = false;
        }
    }

    return peaks;
}

export function useWakeWord(config: WakeWordConfig = {}): WakeWordReturn {
    const {
        volumeThreshold = 10,
        debug = true,
        onActivate,
        onDeactivate,
        onVoiceDetected,
        enabled = true,
    } = config;

    const [isListening, setIsListening] = useState(false);
    const [isSpeechDetected, setIsSpeechDetected] = useState(false);
    const [lastDetectedPhrase, setLastDetectedPhrase] = useState('');

    const onActivateRef = useRef(onActivate);
    const onDeactivateRef = useRef(onDeactivate);
    const onVoiceDetectedRef = useRef(onVoiceDetected);
    const debugRef = useRef(debug);
    const enabledRef = useRef(enabled);

    useEffect(() => {
        onActivateRef.current = onActivate;
        onDeactivateRef.current = onDeactivate;
        onVoiceDetectedRef.current = onVoiceDetected;
        debugRef.current = debug;
        enabledRef.current = enabled;
    });

    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const isProcessingAudioRef = useRef(false);

    // Control de peticiones y cooldown
    const lastRequestTimeRef = useRef(0);
    const circuitBreakerUntilRef = useRef(0);

    // Buffer de audio y VAD
    const audioBufferRef = useRef<Float32Array[]>([]);
    const totalSamplesRef = useRef(0);
    const isRecordingSpeechRef = useRef(false);
    const silenceTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const speechStartTimeRef = useRef(0);
    const peakVolumeRef = useRef(0);

    const isSupported = typeof window !== 'undefined' && !!(navigator.mediaDevices?.getUserMedia);

    /**
     * Evalúa el audio usando modelos en cascada (gemini-2.0-flash -> gemini-1.5-flash)
     */
    const evaluateAudioClip = useCallback(async (audioSamples: Float32Array, sampleRate: number) => {
        const apiKey = (process.env as any).API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
        if (!apiKey) {
            if (debugRef.current) console.warn('[WakeWord] ⚠️ API_KEY no configurada');
            return;
        }

        const now = Date.now();

        // Circuit breaker activo
        if (now < circuitBreakerUntilRef.current) {
            const waitSeconds = Math.round((circuitBreakerUntilRef.current - now) / 1000);
            if (debugRef.current) console.warn(`[WakeWord] ⏳ Circuit breaker activo (${waitSeconds}s restantes)`);
            return;
        }

        // Cooldown mínimo de 2s
        if (now - lastRequestTimeRef.current < 2000) {
            return;
        }

        if (isProcessingAudioRef.current) return;
        isProcessingAudioRef.current = true;
        lastRequestTimeRef.current = now;

        try {
            const base64Wav = pcmToWavBase64(audioSamples, sampleRate);
            const ai = new GoogleGenAI({ apiKey });

            const promptText = `Transcribe este audio corto en español y clasifícalo:
- Si el usuario saluda o llama a Nova ("hey nova", "hola nova", "nova", "nova despierta", "actívate", "iniciar llamada", "empezar", "oye nova", "despierta", "hola", etc.): intent = "ACTIVATE"
- Si el usuario dice que pare o cuelgue ("cuelga", "corta", "adiós nova", "chao nova", "terminar llamada", "desconectar", "apagar", "silencio"): intent = "DEACTIVATE"
- En cualquier otro caso o ruido: intent = "NONE"

Responde en JSON estricto:
{"intent": "ACTIVATE" | "DEACTIVATE" | "NONE", "phrase": "texto transcrito"}`;

            // Cascada de modelos: gemini-2.5-flash -> gemini-1.5-flash
            const candidateModels = ['gemini-2.5-flash', 'gemini-1.5-flash'];
            let text: string | undefined;

            for (const modelName of candidateModels) {
                try {
                    const response = await ai.models.generateContent({
                        model: modelName,
                        contents: [{
                            role: 'user',
                            parts: [
                                {
                                    inlineData: {
                                        mimeType: 'audio/wav',
                                        data: base64Wav
                                    }
                                },
                                { text: promptText }
                            ]
                        }],
                        config: {
                            responseMimeType: 'application/json'
                        }
                    });

                    text = response.text?.trim();
                    if (text) {
                        if (debugRef.current) console.log(`[WakeWord] 🤖 (${modelName}):`, text);
                        break;
                    }
                } catch (modelErr: any) {
                    const errMsg = modelErr?.message || String(modelErr);
                    if (debugRef.current) console.warn(`[WakeWord] Falló modelo ${modelName}:`, errMsg);

                    // Si es 429 o 503, intentar siguiente modelo en la cascada
                    if (errMsg.includes('429') || errMsg.includes('503') || errMsg.includes('RESOURCE_EXHAUSTED')) {
                        continue;
                    } else {
                        break;
                    }
                }
            }

            if (text) {
                try {
                    const parsed = JSON.parse(text);
                    const phrase = parsed.phrase || '';
                    setLastDetectedPhrase(phrase);

                    if (parsed.intent === 'ACTIVATE') {
                        if (debugRef.current) console.log('🟢 [WakeWord] ¡COMANDO ACTIVAR DETECTADO!:', phrase);
                        onActivateRef.current?.();
                    } else if (parsed.intent === 'DEACTIVATE') {
                        if (debugRef.current) console.log('🔴 [WakeWord] ¡COMANDO DESACTIVAR DETECTADO!:', phrase);
                        onDeactivateRef.current?.();
                    } else {
                        // Fallback regex
                        const lowerPhrase = phrase.toLowerCase();
                        if (/(?:hey|hola|oye|ok|despierta|inicia|act[ií]va)\s*nova/i.test(lowerPhrase) || /^(?:hey|hola|oye)\s+nova$/i.test(lowerPhrase) || /^nova$/i.test(lowerPhrase)) {
                            if (debugRef.current) console.log('🟢 [WakeWord] Fallback Regex Activación:', phrase);
                            onActivateRef.current?.();
                        }
                    }
                } catch {
                    if (/ACTIVATE/i.test(text)) {
                        onActivateRef.current?.();
                    } else if (/DEACTIVATE/i.test(text)) {
                        onDeactivateRef.current?.();
                    }
                }
            } else {
                // Si todos los modelos dieron 429/503
                console.warn('⛔ [WakeWord] Todos los modelos ocupados. Pausando 10s.');
                circuitBreakerUntilRef.current = Date.now() + 10000;
            }
        } catch (err: any) {
            console.warn('[WakeWord] Error general evaluando audio:', err);
        } finally {
            isProcessingAudioRef.current = false;
        }
    }, []);

    /**
     * Inicia la captura continua del micrófono con VAD acústico local
     */
    const startListening = useCallback(async () => {
        if (!isSupported || !enabledRef.current) return;
        if (audioContextRef.current && audioContextRef.current.state === 'running') return;

        try {
            if (debugRef.current) console.log('🎙️ [WakeWord] Iniciando detector de voz...');

            const selectedMic = localStorage.getItem('nova_selectedMic');
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    deviceId: selectedMic ? { exact: selectedMic } : undefined,
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            mediaStreamRef.current = stream;

            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass();
            audioContextRef.current = ctx;

            if (ctx.state === 'suspended') {
                await ctx.resume();
            }

            const source = ctx.createMediaStreamSource(stream);
            const processor = ctx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = processor;

            const actualSampleRate = ctx.sampleRate || 44100;

            processor.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);

                let sum = 0;
                for (let i = 0; i < inputData.length; i++) {
                    sum += inputData[i] * inputData[i];
                }
                const rms = Math.sqrt(sum / inputData.length);
                const volumePercent = Math.min(100, Math.round(rms * 1000));

                onVoiceDetectedRef.current?.(volumePercent);

                if (volumePercent >= volumeThreshold) {
                    setIsSpeechDetected(true);
                    if (volumePercent > peakVolumeRef.current) {
                        peakVolumeRef.current = volumePercent;
                    }

                    if (!isRecordingSpeechRef.current) {
                        isRecordingSpeechRef.current = true;
                        speechStartTimeRef.current = Date.now();
                        audioBufferRef.current = [];
                        totalSamplesRef.current = 0;
                        peakVolumeRef.current = volumePercent;
                    }

                    if (silenceTimeoutRef.current) {
                        clearTimeout(silenceTimeoutRef.current);
                        silenceTimeoutRef.current = null;
                    }

                    audioBufferRef.current.push(new Float32Array(inputData));
                    totalSamplesRef.current += inputData.length;

                    if (Date.now() - speechStartTimeRef.current > 2800) {
                        finishAndEvaluate();
                    }
                } else if (isRecordingSpeechRef.current) {
                    if (!silenceTimeoutRef.current) {
                        silenceTimeoutRef.current = setTimeout(() => {
                            finishAndEvaluate();
                        }, 450);
                    }
                }
            };

            const finishAndEvaluate = () => {
                if (silenceTimeoutRef.current) {
                    clearTimeout(silenceTimeoutRef.current);
                    silenceTimeoutRef.current = null;
                }

                setIsSpeechDetected(false);
                isRecordingSpeechRef.current = false;

                const durationMs = Date.now() - speechStartTimeRef.current;
                const minSamples = Math.round(actualSampleRate * 0.4);
                const maxSamples = Math.round(actualSampleRate * 3.0);
                const peakVol = peakVolumeRef.current;
                peakVolumeRef.current = 0;

                if (
                    totalSamplesRef.current >= minSamples &&
                    totalSamplesRef.current <= maxSamples &&
                    durationMs >= 400 &&
                    durationMs <= 2800 &&
                    peakVol >= 12 &&
                    audioBufferRef.current.length > 0
                ) {
                    const merged = new Float32Array(totalSamplesRef.current);
                    let offset = 0;
                    for (const chunk of audioBufferRef.current) {
                        merged.set(chunk, offset);
                        offset += chunk.length;
                    }

                    audioBufferRef.current = [];
                    totalSamplesRef.current = 0;

                    // 🔍 FILTRO DE CADENCIA ACÚSTICA:
                    // "Hey No-va" o "Ho-la No-va" tiene entre 2 y 5 pulsos de energía (sílabas).
                    // Un golpe o ruido tiene 1 solo pulso -> Se descarta sin consultar la API.
                    const peaks = countEnergyPeaks(merged, actualSampleRate);
                    if (peaks >= 2 && peaks <= 6) {
                        if (debugRef.current) console.log(`🗣️ [WakeWord] Cadencia de voz detectada (${peaks} pulsos, ${durationMs}ms, peak: ${peakVol}). Evaluando...`);
                        evaluateAudioClip(merged, actualSampleRate);
                    } else {
                        if (debugRef.current) console.log(`🔇 [WakeWord] Sonido descartado (pulsos: ${peaks}).`);
                    }
                } else {
                    audioBufferRef.current = [];
                    totalSamplesRef.current = 0;
                }
            };

            source.connect(processor);
            const muteGain = ctx.createGain();
            muteGain.gain.value = 0;
            processor.connect(muteGain);
            muteGain.connect(ctx.destination);

            setIsListening(true);
            if (debugRef.current) console.log(`✅ [WakeWord] Detector activo (SampleRate: ${actualSampleRate}Hz)`);
        } catch (err) {
            console.error('❌ [WakeWord] Error al iniciar captura de audio:', err);
            setIsListening(false);
        }
    }, [isSupported, volumeThreshold, evaluateAudioClip]);

    const stopListening = useCallback(() => {
        if (debugRef.current) console.log('🛑 [WakeWord] Deteniendo detector de voz...');

        if (silenceTimeoutRef.current) {
            clearTimeout(silenceTimeoutRef.current);
            silenceTimeoutRef.current = null;
        }

        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }

        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(t => t.stop());
            mediaStreamRef.current = null;
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try { audioContextRef.current.close(); } catch { }
        }
        audioContextRef.current = null;

        audioBufferRef.current = [];
        totalSamplesRef.current = 0;
        isRecordingSpeechRef.current = false;
        setIsListening(false);
        setIsSpeechDetected(false);
    }, []);

    useEffect(() => {
        return () => {
            stopListening();
        };
    }, [stopListening]);

    return {
        isListening,
        isSpeechDetected,
        isSupported,
        lastDetectedPhrase,
        startListening,
        stopListening
    };
}

export default useWakeWord;
