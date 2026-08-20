import { useState, useRef, useCallback, useEffect } from 'react';

export const useMusicAnalyzer = () => {
    const [isListening, setIsListening] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const analyserRef = useRef<AnalyserNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
    const animationFrameRef = useRef<number | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    // Detección de Beats (Graves)
    // Subimos el umbral a 90 para ignorar el ruido de fondo/ventiladores
    const beatThreshold = useRef(90); 
    const beatDecay = useRef(0.90);
    const currentEnergy = useRef(0);

    const startListening = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            streamRef.current = stream;

            const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
            audioContextRef.current = new AudioContext();
            analyserRef.current = audioContextRef.current.createAnalyser();
            
            // Configuraciones óptimas para detección de graves
            analyserRef.current.fftSize = 256; 
            analyserRef.current.smoothingTimeConstant = 0.6; // Suavizado rápido para beats

            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            sourceRef.current.connect(analyserRef.current);

            setIsListening(true);
            analyzeAudio();

        } catch (err) {
            console.error('No se pudo acceder al micrófono para el analizador de música:', err);
        }
    };

    const stopListening = () => {
        setIsListening(false);
        if (animationFrameRef.current) {
            cancelAnimationFrame(animationFrameRef.current);
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach(track => track.stop());
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
        }
    };

    const analyzeAudio = useCallback(() => {
        if (!analyserRef.current) return;

        const bufferLength = analyserRef.current.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyserRef.current.getByteFrequencyData(dataArray);

        // Calcular la energía de las frecuencias BAJAS (bombos, bajos)
        // Por ejemplo, los primeros 10 bins de un fftSize de 256 suelen cubrir < 300Hz
        let bassEnergy = 0;
        const bassBins = 8; 
        for (let i = 0; i < bassBins; i++) {
            bassEnergy += dataArray[i];
        }
        bassEnergy = bassEnergy / bassBins;

        // Peak detection
        if (bassEnergy > beatThreshold.current && bassEnergy > currentEnergy.current) {
            // BEAT DETECTADO
            const intensity = Math.min((bassEnergy - beatThreshold.current) / 80, 1.0); // Normalizar
            
            // Disparar evento para AvatarViewer3D
            if (intensity > 0.05) {
                window.dispatchEvent(new CustomEvent('nova-beat', { 
                    detail: { intensity } 
                }));
            }
            
            // Saltar la energía al máximo actual
            currentEnergy.current = bassEnergy;
        } else {
            // Decaer la energía para prepararse para el próximo beat
            currentEnergy.current *= beatDecay.current;
        }

        animationFrameRef.current = requestAnimationFrame(analyzeAudio);
    }, []);

    useEffect(() => {
        if (isListening) {
             analyzeAudio();
        }
    }, [isListening, analyzeAudio]);

    useEffect(() => {
        return () => stopListening(); // Cleanup
    }, []);

    return {
        isListening,
        startListening,
        stopListening
    };
};
