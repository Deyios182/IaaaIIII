/**
 * useWakeWord - Motor de Activación por Voz Local basado en Vosk (WebAssembly)
 *
 * 100% Offline, 0 Llamadas a la Nube, 0 Tokens, 0 Errores de Red de Chromium.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { createModel } from 'vosk-browser';
import * as IdentityEngine from '../utils/identityEngine';
import type { SpeakerResult } from '../utils/identityEngine';

export interface WakeWordConfig {
    volumeThreshold?: number;
    debug?: boolean;
    onActivate?: () => void;
    onDeactivate?: () => void;
    onVoiceDetected?: (volume: number) => void;
    onTranscript?: (text: string) => void;        // Resultado final Vosk (frase completa)
    onPartialTranscript?: (text: string) => void; // Resultado parcial Vosk (tiempo real)
    enabled?: boolean;
}

export interface WakeWordReturn {
    isListening: boolean;
    isSpeechDetected: boolean;
    isSupported: boolean;
    lastDetectedPhrase: string;
    currentSpeaker: SpeakerResult | null;  // 🆕 Speaker biométrico detectado
    startListening: () => Promise<void>;
    stopListening: () => void;
}

const getLogTimestamp = (): string => {
    const d = new Date();
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    const ms = String(d.getMilliseconds()).padStart(3, '0');
    return `[${h}:${m}:${s}.${ms}]`;
};



let cachedVoskModelPromise: Promise<any> | null = null;
const getOrLoadVoskModel = () => {
    if (!cachedVoskModelPromise) {
        console.log(`${getLogTimestamp()} ⏳ [WakeWord Vosk] Cargando modelo acústico local en WebAssembly...`);
        cachedVoskModelPromise = createModel('/vosk-model-es.zip');
    }
    return cachedVoskModelPromise;
};

export const useWakeWord = (configOrCb: WakeWordConfig | (() => void) = {}): WakeWordReturn => {
    const config: WakeWordConfig = typeof configOrCb === 'function' ? { onActivate: configOrCb } : configOrCb;
    const { onActivate, onDeactivate, onTranscript, onPartialTranscript, enabled = true } = config;

    const [isListening, setIsListening] = useState(false);
    const [lastDetectedPhrase, setLastDetectedPhrase] = useState('');
    const [currentSpeaker, setCurrentSpeaker] = useState<SpeakerResult | null>(null);

    const callbackRef = useRef({ onActivate, onDeactivate, onTranscript, onPartialTranscript });
    useEffect(() => {
        callbackRef.current = { onActivate, onDeactivate, onTranscript, onPartialTranscript };
    }, [onActivate, onDeactivate, onTranscript, onPartialTranscript]);

    const isSupported = typeof window !== 'undefined' && !!(
        navigator.mediaDevices?.getUserMedia &&
        (window.AudioContext || (window as any).webkitAudioContext)
    );

    useEffect(() => {
        if (!enabled || !isSupported) return;

        // Suscribir al IdentityEngine para actualizar estado React
        const unsubscribeIdentity = IdentityEngine.onSpeakerChange((result) => {
            setCurrentSpeaker(result);
        });

        let recognizer: any = null;
        let audioContext: AudioContext | null = null;
        let mediaStream: MediaStream | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let processor: AudioNode | null = null;
        let isUnmounted = false;

        const initVosk = async () => {
            try {
                const model = await getOrLoadVoskModel();
                if (isUnmounted) return;

                recognizer = new model.KaldiRecognizer(16000);
                if (typeof recognizer.setWords === 'function') {
                    try { recognizer.setWords(true); } catch {}
                }

                let lastTriggerTime = 0;
                const triggerActivate = () => {
                    const now = Date.now();
                    if (now - lastTriggerTime < 5000) return;
                    lastTriggerTime = now;
                    console.log(`%c⚡ ${getLogTimestamp()} [WakeWord Vosk] ¡Match acústico! Disparando llamada (0 ms)...`, 'color: #38bdf8; font-weight: bold; background: #082f49; padding: 2px 6px; border-radius: 4px;');
                    callbackRef.current.onActivate?.();
                };

                let lastLoggedPartial = '';

                // Configurar escucha de resultados finales (frase cerrada tras silencio)
                recognizer.on('result', (message: any) => {
                    const transcript = (message.result?.text || '').toLowerCase().trim();
                    lastLoggedPartial = '';
                    if (!transcript) return;
                    setLastDetectedPhrase(transcript);
                    console.log(`🎤 ${getLogTimestamp()} [WakeWord Vosk] Transcripción final: "${transcript}"`);

                    // Notificar transcript completo (para subtítulos durante llamada)
                    callbackRef.current.onTranscript?.(transcript);

                    if (
                        transcript.includes('nova') ||
                        transcript.includes('despierta') ||
                        transcript.includes('hola nova') ||
                        transcript.includes('hey nova') ||
                        transcript.includes('vamos nova')
                    ) {
                        triggerActivate();
                    }
                });

                // Configurar escucha de resultados parciales (en vivo en tiempo real)
                recognizer.on('partialresult', (message: any) => {
                    const partial = (message.result?.partial || '').toLowerCase().trim();
                    if (!partial) return;

                    // Log inmediato en consola mostrando las palabras a medida que salen de la boca del usuario
                    if (partial !== lastLoggedPartial) {
                        lastLoggedPartial = partial;
                        console.log(`⚡ ${getLogTimestamp()} [Vosk En Vivo] "${partial}…"`);
                    }

                    // Notificar parcial (para subtítulos en tiempo real)
                    callbackRef.current.onPartialTranscript?.(partial);

                    if (
                        partial.includes('nova') ||
                        partial.includes('despierta') ||
                        partial.includes('hola nova') ||
                        partial.includes('hey nova') ||
                        partial.includes('vamos nova')
                    ) {
                        triggerActivate();
                    }
                });

                // Capturar el micrófono del sistema a 16kHz
                const selectedMic = localStorage.getItem('nova_selectedMic');
                mediaStream = await navigator.mediaDevices.getUserMedia({
                    video: false,
                    audio: {
                        deviceId: selectedMic ? { exact: selectedMic } : undefined,
                        echoCancellation: true,
                        noiseSuppression: true,
                        autoGainControl: true,
                        channelCount: 1,
                        sampleRate: 16000
                    }
                });

                const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
                audioContext = new AudioCtx({ sampleRate: 16000 });
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }

                source = audioContext.createMediaStreamSource(mediaStream);

                // Migración a AudioWorkletNode ultra-rápido (64ms latencia con 1024 samples)
                await audioContext.audioWorklet.addModule('/vosk-processor.js');
                const workletNode = new AudioWorkletNode(audioContext, 'vosk-audio-processor');

                workletNode.port.onmessage = (event) => {
                    if (recognizer && event.data) {
                        try {
                            // Enrutamiento directo Float32Array: 0 asignación de AudioBuffer, ultra-bajo consumo de memoria
                            if (typeof recognizer.acceptWaveformFloat === 'function') {
                                recognizer.acceptWaveformFloat(event.data, 16000);
                            } else {
                                const buffer = audioContext!.createBuffer(1, event.data.length, 16000);
                                buffer.copyToChannel(event.data, 0);
                                recognizer.acceptWaveform(buffer);
                            }

                            // 🆕 Tap lateral biométrico — fire & forget (<0.05ms)
                            // Se ejecuta DESPUÉS de Vosk para no afectar latencia STT
                            IdentityEngine.feedAudioFrame(event.data);

                        } catch {}
                    }
                };

                source.connect(workletNode);
                processor = workletNode;

                setIsListening(true);
                console.log('👂 [WakeWord Vosk] Motor AudioWorklet inicializado y escuchando.');
            } catch (error) {
                console.error('❌ [WakeWord Vosk] Error al iniciar:', error);
                setIsListening(false);
            }
        };

        initVosk();

        return () => {
            isUnmounted = true;
            setIsListening(false);
            unsubscribeIdentity();
            if (processor && source) {
                try { source.disconnect(); } catch {}
                try { (processor as any).disconnect?.(); } catch {}
            }
            if (audioContext && audioContext.state !== 'closed') {
                try { audioContext.close(); } catch {}
            }
            if (mediaStream) {
                try { mediaStream.getTracks().forEach(track => track.stop()); } catch {}
            }
            if (recognizer) {
                try { recognizer.free(); } catch {}
            }
        };
    }, [enabled, isSupported]);

    return {
        isListening,
        isSpeechDetected: isListening,
        isSupported,
        lastDetectedPhrase,
        currentSpeaker,
        startListening: async () => {},
        stopListening: () => {}
    };
};

export default useWakeWord;
