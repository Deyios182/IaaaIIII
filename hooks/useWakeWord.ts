/**
 * useWakeWord - Motor de Activación por Voz Local basado en Vosk (WebAssembly)
 *
 * 100% Offline, 0 Llamadas a la Nube, 0 Tokens, 0 Errores de Red de Chromium.
 */

import { useEffect, useState, useRef, useCallback } from 'react';
import { createModel } from 'vosk-browser';

export interface WakeWordConfig {
    volumeThreshold?: number;
    debug?: boolean;
    onActivate?: () => void;
    onDeactivate?: () => void;
    onVoiceDetected?: (volume: number) => void;
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
    const { onActivate, onDeactivate, enabled = true } = config;

    const [isListening, setIsListening] = useState(false);
    const [lastDetectedPhrase, setLastDetectedPhrase] = useState('');

    const callbackRef = useRef({ onActivate, onDeactivate });
    useEffect(() => {
        callbackRef.current = { onActivate, onDeactivate };
    }, [onActivate, onDeactivate]);

    const isSupported = typeof window !== 'undefined' && !!(
        navigator.mediaDevices?.getUserMedia &&
        (window.AudioContext || (window as any).webkitAudioContext)
    );

    useEffect(() => {
        if (!enabled || !isSupported) return;

        let recognizer: any = null;
        let audioContext: AudioContext | null = null;
        let mediaStream: MediaStream | null = null;
        let source: MediaStreamAudioSourceNode | null = null;
        let processor: ScriptProcessorNode | null = null;
        let isUnmounted = false;

        const initVosk = async () => {
            try {
                const model = await getOrLoadVoskModel();
                if (isUnmounted) return;

                recognizer = new model.KaldiRecognizer(16000);

                let lastTriggerTime = 0;
                const triggerActivate = () => {
                    const now = Date.now();
                    if (now - lastTriggerTime < 5000) return;
                    lastTriggerTime = now;
                    console.log(`%c⚡ ${getLogTimestamp()} [WakeWord Vosk] ¡Match acústico! Disparando llamada (0 ms)...`, 'color: #38bdf8; font-weight: bold; background: #082f49; padding: 2px 6px; border-radius: 4px;');
                    callbackRef.current.onActivate?.();
                };

                // Configurar escucha de resultados
                recognizer.on('result', (message: any) => {
                    const transcript = (message.result?.text || '').toLowerCase().trim();
                    if (!transcript) return;
                    setLastDetectedPhrase(transcript);
                    console.log(`🎙️ ${getLogTimestamp()} [WakeWord Vosk] Transcripción: "${transcript}"`);

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

                recognizer.on('partialresult', (message: any) => {
                    const partial = (message.result?.partial || '').toLowerCase().trim();
                    if (partial.includes('nova') || partial.includes('despierta')) {
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
                processor = audioContext.createScriptProcessor(4096, 1, 1);

                processor.onaudioprocess = (event) => {
                    if (recognizer) {
                        try {
                            recognizer.acceptWaveform(event.inputBuffer);
                        } catch {}
                    }
                };

                source.connect(processor);
                const muteGain = audioContext.createGain();
                muteGain.gain.value = 0;
                processor.connect(muteGain);
                muteGain.connect(audioContext.destination);

                setIsListening(true);
                console.log('👂 [WakeWord Vosk] Motor Open Source inicializado y escuchando.');
            } catch (error) {
                console.error('❌ [WakeWord Vosk] Error al iniciar:', error);
                setIsListening(false);
            }
        };

        initVosk();

        return () => {
            isUnmounted = true;
            setIsListening(false);
            if (processor && source) {
                try { source.disconnect(); } catch {}
                try { processor.disconnect(); } catch {}
            }
            if (audioContext && audioContext.state !== 'closed') {
                try { audioContext.close(); } catch {}
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach(track => track.stop());
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
        startListening: async () => {},
        stopListening: () => {}
    };
};

export default useWakeWord;
