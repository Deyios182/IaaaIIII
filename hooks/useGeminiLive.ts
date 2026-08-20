/**
 * useGeminiLive - Custom Hook for Gemini Live API Connection
 * Extracted from Dashboard.tsx for better maintainability
 */
import { useRef, useState, useCallback } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { getSystemInstruction, encodeBase64 } from '../geminiService';

export interface GeminiLiveConfig {
    apiKey: string;
    model?: string;
    systemInstruction: string;
    voiceName: string;
    isBold: boolean;
    tools?: any[];
    onAudioData?: (data: ArrayBuffer) => void;
    onTranscription?: (text: string, type: 'input' | 'output') => void;
    onToolCall?: (name: string, args: any) => void;
    onTurnComplete?: () => void;
    onError?: (error: any) => void;
    onConnectionChange?: (connected: boolean) => void;
}

export interface GeminiLiveReturn {
    isConnected: boolean;
    isAiSpeaking: boolean;
    connect: () => Promise<void>;
    disconnect: () => void;
    sendAudio: (pcmData: Int16Array) => void;
    sendText: (text: string) => void;
    sendImage: (base64Data: string) => void;
    sendToolResponse: (functionResponses: any[]) => void; // Responder a tool calls del modelo
    sessionRef: React.MutableRefObject<any>;
}

export function useGeminiLive(config: GeminiLiveConfig): GeminiLiveReturn {
    const [isConnected, setIsConnected] = useState(false);
    const [isAiSpeaking, setIsAiSpeaking] = useState(false);
    const sessionRef = useRef<any>(null);
    const isDisconnectingRef = useRef(false);

    // 🆕 Safety timeout para evitar que isAiSpeaking se quede atascado
    const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const speakingStartTimeRef = useRef<number>(0);
    const MAX_SPEAKING_DURATION = 60000; // 60 segundos max continuo
    const AUDIO_SILENCE_TIMEOUT = 3000; // 3 segundos de silencio para considerar que terminó

    const connect = useCallback(async () => {
        if (!config.apiKey) {
            config.onError?.(new Error('API Key missing'));
            return;
        }

        isDisconnectingRef.current = false;

        try {
            const ai = new GoogleGenAI({ apiKey: config.apiKey });

            const session = await ai.live.connect({
                model: config.model || 'gemini-2.5-flash-native-audio-preview-12-2025',
                callbacks: {
                    onopen: () => {
                        console.log('✅ Gemini Live: Connected');
                        setIsConnected(true);
                        config.onConnectionChange?.(true);
                    },
                    onmessage: (msg: any) => {
                        // Handle audio data
                        if (msg.data?.data) {
                            const now = Date.now();

                            // Si es la primera vez hablando en este ciclo, registrar tiempo de inicio
                            if (!isAiSpeaking) {
                                speakingStartTimeRef.current = now;
                            }

                            setIsAiSpeaking(true);
                            const audioBytes = Uint8Array.from(atob(msg.data.data), c => c.charCodeAt(0));
                            config.onAudioData?.(audioBytes.buffer);

                            // 🆕 Limpiar timeout anterior
                            if (speakingTimeoutRef.current) {
                                clearTimeout(speakingTimeoutRef.current);
                            }

                            // 🆕 Safety timeout: Si no recibimos más audio en AUDIO_SILENCE_TIMEOUT, parar
                            speakingTimeoutRef.current = setTimeout(() => {
                                console.warn('⚠️ Safety timeout: No se recibió audio en', AUDIO_SILENCE_TIMEOUT, 'ms. Deteniendo isAiSpeaking.');
                                setIsAiSpeaking(false);
                            }, AUDIO_SILENCE_TIMEOUT);

                            // 🆕 Safety timeout: Si lleva hablando más de MAX_SPEAKING_DURATION, forzar stop
                            const elapsed = now - speakingStartTimeRef.current;
                            if (elapsed > MAX_SPEAKING_DURATION) {
                                console.warn('⚠️ Safety timeout: Hablando por más de', MAX_SPEAKING_DURATION, 'ms. Deteniendo isAiSpeaking.');
                                setIsAiSpeaking(false);
                                if (speakingTimeoutRef.current) {
                                    clearTimeout(speakingTimeoutRef.current);
                                    speakingTimeoutRef.current = null;
                                }
                            }
                        }

                        // Handle transcriptions
                        if (msg.serverContent?.inputTranscription?.text) {
                            config.onTranscription?.(msg.serverContent.inputTranscription.text, 'input');
                        }
                        if (msg.serverContent?.outputTranscription?.text) {
                            config.onTranscription?.(msg.serverContent.outputTranscription.text, 'output');
                        }

                        // Handle tool calls
                        if (msg.toolCall?.functionCalls) {
                            for (const fc of msg.toolCall.functionCalls) {
                                config.onToolCall?.(fc.name, fc.args);
                            }
                        }

                        // Handle turn complete
                        if (msg.serverContent?.turnComplete) {
                            // 🆕 Limpiar timeouts al completar turno
                            if (speakingTimeoutRef.current) {
                                clearTimeout(speakingTimeoutRef.current);
                                speakingTimeoutRef.current = null;
                            }
                            setIsAiSpeaking(false);
                            config.onTurnComplete?.();
                        }
                    },
                    onclose: () => {
                        console.log('🔌 Gemini Live: Disconnected');
                        setIsConnected(false);
                        setIsAiSpeaking(false);
                        config.onConnectionChange?.(false);
                    },
                    onerror: (e: any) => {
                        console.error('❌ Gemini Live Error:', e);
                        config.onError?.(e);
                    }
                },
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    outputAudioTranscription: {},
                    // @ts-ignore
                    safetySettings: [
                        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
                        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
                    ],
                    speechConfig: {
                        voiceConfig: { prebuiltVoiceConfig: { voiceName: config.voiceName } }
                    },
                    systemInstruction: config.systemInstruction,
                    tools: config.tools
                }
            });

            sessionRef.current = session;
        } catch (err) {
            console.error('Failed to connect to Gemini Live:', err);
            config.onError?.(err);
        }
    }, [config]);

    const disconnect = useCallback(() => {
        isDisconnectingRef.current = true;

        // 🆕 Limpiar timeout de seguridad
        if (speakingTimeoutRef.current) {
            clearTimeout(speakingTimeoutRef.current);
            speakingTimeoutRef.current = null;
        }

        if (sessionRef.current) {
            try {
                sessionRef.current.close();
            } catch (e) {
                // Ignore close errors
            }
            sessionRef.current = null;
        }
        setIsConnected(false);
        setIsAiSpeaking(false);
    }, []);

    const sendAudio = useCallback((pcmData: Int16Array) => {
        if (!sessionRef.current) return;
        try {
            sessionRef.current.sendRealtimeInput({
                audio: {
                    data: encodeBase64(new Uint8Array(pcmData.buffer)),
                    mimeType: 'audio/pcm;rate=16000'
                }
            });
        } catch (err) {
            console.error('Error sending audio:', err);
        }
    }, []);

    const sendText = useCallback((text: string) => {
        if (!sessionRef.current) return;
        try {
            sessionRef.current.sendRealtimeInput({ text });
        } catch (err) {
            console.error('Error sending text:', err);
        }
    }, []);

    const sendImage = useCallback((base64Data: string) => {
        if (!sessionRef.current) return;
        try {
            sessionRef.current.sendRealtimeInput({
                video: { data: base64Data, mimeType: 'image/jpeg' }
            });
        } catch (err) {
            console.error('Error sending image:', err);
        }
    }, []);

    const sendToolResponse = useCallback((functionResponses: any[]) => {
        if (!sessionRef.current) return;
        try {
            sessionRef.current.sendToolResponse({ functionResponses });
            console.log('🛠️ Tool response enviada a Gemini:', functionResponses.map(r => r.name).join(', '));
        } catch (err) {
            console.error('Error enviando tool response:', err);
        }
    }, []);

    return {
        isConnected,
        isAiSpeaking,
        connect,
        disconnect,
        sendAudio,
        sendText,
        sendImage,
        sendToolResponse,
        sessionRef
    };
}

export default useGeminiLive;
