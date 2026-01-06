/**
 * useAudioPipeline - Custom Hook for Audio Capture & Processing
 * Handles: Mic capture, AudioWorklet processing, resampling, volume detection
 * Extracted from Dashboard.tsx for better maintainability
 */
import { useRef, useState, useCallback, useEffect } from 'react';
import { encodeBase64 } from '../geminiService';

export interface AudioPipelineConfig {
    targetSampleRate?: number; // Default: 16000
    amplification?: number;    // Default: 2.5
    volumeThreshold?: number;  // Default: 5 (for activity detection)
    onAudioData?: (pcmData: Int16Array) => void;
    onVolumeChange?: (volume: number) => void;
    onUserActivity?: () => void;
}

export interface AudioPipelineReturn {
    isCapturing: boolean;
    micVolume: number;
    startCapture: (deviceId?: string) => Promise<MediaStream | null>;
    stopCapture: () => void;
    getStream: () => MediaStream | null;
    audioContextRef: React.MutableRefObject<AudioContext | null>;
}

export function useAudioPipeline(config: AudioPipelineConfig = {}): AudioPipelineReturn {
    const {
        targetSampleRate = 16000,
        amplification = 2.5,
        volumeThreshold = 5,
        onAudioData,
        onVolumeChange,
        onUserActivity
    } = config;

    const [isCapturing, setIsCapturing] = useState(false);
    const [micVolume, setMicVolume] = useState(0);

    const streamRef = useRef<MediaStream | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<AudioWorkletNode | null>(null);
    const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const mixerRef = useRef<GainNode | null>(null);

    const startCapture = useCallback(async (deviceId?: string): Promise<MediaStream | null> => {
        try {
            // Audio constraints - raw audio for nuance detection
            const audioConstraints: MediaTrackConstraints = {
                deviceId: deviceId ? { exact: deviceId } : undefined,
                sampleRate: targetSampleRate,
                channelCount: 1,
                noiseSuppression: false,  // Allow all sounds (claps, rhythms)
                echoCancellation: false,
                autoGainControl: true
            };

            const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
            streamRef.current = stream;

            // Create AudioContext
            const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
            const ctx = new AudioContextClass({ sampleRate: targetSampleRate });
            audioContextRef.current = ctx;

            // Create mixer (GainNode)
            const mixer = ctx.createGain();
            mixer.gain.value = 1.0;
            mixerRef.current = mixer;

            // Connect mic to mixer
            const micSource = ctx.createMediaStreamSource(stream);
            micSourceRef.current = micSource;
            micSource.connect(mixer);

            // Load AudioWorklet
            try {
                await ctx.audioWorklet.addModule('/audio-processor.js');
            } catch (e) {
                console.error('AudioWorklet load error:', e);
            }

            // Check context state before creating worklet
            if (ctx.state === 'closed') {
                console.warn('AudioContext closed prematurely');
                return null;
            }

            // Create processor
            const processor = new AudioWorkletNode(ctx, 'audio-processor');
            processorRef.current = processor;

            // Handle audio data from worklet
            processor.port.onmessage = (e) => {
                const rawInput: Float32Array = e.data;

                // Calculate RMS volume
                let sum = 0;
                for (let k = 0; k < rawInput.length; k += 4) {
                    sum += rawInput[k] * rawInput[k];
                }
                const rms = Math.sqrt(sum / (rawInput.length / 4));
                const volumePercent = Math.min(100, Math.round(rms * 1000));
                setMicVolume(volumePercent);
                onVolumeChange?.(volumePercent);

                // Detect user activity
                if (volumePercent > volumeThreshold) {
                    onUserActivity?.();
                }

                // Amplify
                const input = new Float32Array(rawInput.length);
                for (let k = 0; k < rawInput.length; k++) {
                    input[k] = rawInput[k] * amplification;
                }

                // Resample if needed
                let pcmData = input;
                if (ctx.sampleRate !== targetSampleRate) {
                    const ratio = ctx.sampleRate / targetSampleRate;
                    const newLength = Math.floor(input.length / ratio);
                    const result = new Float32Array(newLength);
                    for (let i = 0; i < newLength; i++) {
                        const offset = i * ratio;
                        const idx = Math.floor(offset);
                        const decimal = offset - idx;
                        const a = input[idx] || 0;
                        const b = input[idx + 1] || a;
                        result[i] = a + (b - a) * decimal;
                    }
                    pcmData = result;
                }

                // Convert to Int16
                const i16 = new Int16Array(pcmData.length);
                for (let i = 0; i < pcmData.length; i++) {
                    let s = Math.max(-1, Math.min(1, pcmData[i]));
                    i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }

                onAudioData?.(i16);
            };

            // Connect chain
            mixer.connect(processor);

            // Mute output to prevent feedback
            const muteGain = ctx.createGain();
            muteGain.gain.value = 0;
            processor.connect(muteGain);
            muteGain.connect(ctx.destination);

            setIsCapturing(true);
            return stream;
        } catch (err) {
            console.error('Error starting audio capture:', err);
            return null;
        }
    }, [targetSampleRate, amplification, volumeThreshold, onAudioData, onVolumeChange, onUserActivity]);

    const stopCapture = useCallback(() => {
        // Stop stream tracks
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
            streamRef.current = null;
        }

        // Disconnect and close audio context
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }

        if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
            try {
                audioContextRef.current.close();
            } catch (e) {
                // Ignore
            }
        }
        audioContextRef.current = null;

        setIsCapturing(false);
        setMicVolume(0);
    }, []);

    const getStream = useCallback(() => streamRef.current, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            stopCapture();
        };
    }, [stopCapture]);

    return {
        isCapturing,
        micVolume,
        startCapture,
        stopCapture,
        getStream,
        audioContextRef
    };
}

export default useAudioPipeline;
