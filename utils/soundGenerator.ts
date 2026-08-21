/**
 * SoundGenerator - Motor Procedural de Audio y Atmósferas ASMR para Nova
 * Genera paisajes sonoros sintéticos en tiempo real mediante Web Audio API
 * (Lluvia suave, fuego de chimenea, ondas binaurales, olas de mar, viento).
 * 100% nativo, 0 ficheros de audio externos, 0 consumo de red.
 */

export type SoundAtmosphere = 
    | 'RAIN' 
    | 'FIREPLACE' 
    | 'BINAURAL_ALPHA' 
    | 'BINAURAL_THETA' 
    | 'OCEAN_WAVES' 
    | 'NIGHT_CRICKETS' 
    | 'STOP';

export interface SoundConfig {
    sound: SoundAtmosphere;
    volume?: number; // 0.0 a 1.0 (default 0.35)
}

class SoundGenerator {
    private static instance: SoundGenerator | null = null;
    private ctx: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private activeNodes: { stop: () => void }[] = [];
    private currentAtmosphere: SoundAtmosphere = 'STOP';
    private currentVolume: number = 0.35;

    private constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('aiko-sound', (e: Event) => {
                const detail = (e as CustomEvent<SoundConfig>).detail;
                if (detail) {
                    this.playAtmosphere(detail.sound, detail.volume);
                }
            });
        }
    }

    public static getInstance(): SoundGenerator {
        if (!SoundGenerator.instance) {
            SoundGenerator.instance = new SoundGenerator();
        }
        return SoundGenerator.instance;
    }

    private getContext(): AudioContext {
        if (!this.ctx) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this.ctx = new AudioCtx();
            this.masterGain = this.ctx.createGain();
            this.masterGain.gain.setValueAtTime(this.currentVolume, this.ctx.currentTime);
            this.masterGain.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
        return this.ctx;
    }

    public playAtmosphere(sound: SoundAtmosphere, volume: number = 0.35): void {
        this.stopAll();

        if (sound === 'STOP' || !sound) {
            this.currentAtmosphere = 'STOP';
            console.log('🔇 [SoundGenerator] Atmósfera sonora detenida.');
            return;
        }

        const ctx = this.getContext();
        this.currentVolume = Math.max(0.01, Math.min(1.0, volume));
        this.currentAtmosphere = sound;

        // Fade in suave
        if (this.masterGain) {
            this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
            this.masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
            this.masterGain.gain.exponentialRampToValueAtTime(this.currentVolume, ctx.currentTime + 1.2);
        }

        console.log(`🎧 [SoundGenerator] Iniciando atmósfera ASMR: ${sound} (Vol: ${(this.currentVolume * 100).toFixed(0)}%)`);

        switch (sound) {
            case 'RAIN':
                this.synthesizeRain(ctx);
                break;
            case 'FIREPLACE':
                this.synthesizeFireplace(ctx);
                break;
            case 'BINAURAL_ALPHA':
                this.synthesizeBinaural(ctx, 216, 226); // 10Hz diferencia (Alpha: Relajación consciente)
                break;
            case 'BINAURAL_THETA':
                this.synthesizeBinaural(ctx, 140, 146); // 6Hz diferencia (Theta: Sueño profundo / ASMR)
                break;
            case 'OCEAN_WAVES':
                this.synthesizeOceanWaves(ctx);
                break;
            case 'NIGHT_CRICKETS':
                this.synthesizeCrickets(ctx);
                break;
        }
    }

    public stopAll(): void {
        const ctx = this.ctx;
        if (ctx && this.masterGain && this.activeNodes.length > 0) {
            // Fade out rápido de 0.8s
            this.masterGain.gain.cancelScheduledValues(ctx.currentTime);
            this.masterGain.gain.setValueAtTime(Math.max(0.001, this.masterGain.gain.value), ctx.currentTime);
            this.masterGain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.8);
            
            setTimeout(() => {
                for (const node of this.activeNodes) {
                    try { node.stop(); } catch {}
                }
                this.activeNodes = [];
            }, 850);
        } else {
            for (const node of this.activeNodes) {
                try { node.stop(); } catch {}
            }
            this.activeNodes = [];
        }
    }

    public setVolume(volume: number): void {
        this.currentVolume = Math.max(0, Math.min(1.0, volume));
        if (this.ctx && this.masterGain) {
            this.masterGain.gain.linearRampToValueAtTime(this.currentVolume, this.ctx.currentTime + 0.3);
        }
    }

    public getCurrentAtmosphere(): SoundAtmosphere {
        return this.currentAtmosphere;
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // SINTETIZADORES DE SONIDO PROCEDURAL
    // ─────────────────────────────────────────────────────────────────────────────

    /**
     * Lluvia suave sobre ventana (Ruido rosa filtrado + micro-gotas)
     */
    private synthesizeRain(ctx: AudioContext): void {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            b0 = 0.99886 * b0 + white * 0.0555179;
            b1 = 0.99332 * b1 + white * 0.0750759;
            b2 = 0.96900 * b2 + white * 0.1538520;
            b3 = 0.86650 * b3 + white * 0.3104856;
            b4 = 0.55000 * b4 + white * 0.5329522;
            b5 = -0.7616 * b5 - white * 0.0168980;
            output[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.08;
            b6 = white * 0.115926;
        }

        const whiteNoise = ctx.createBufferSource();
        whiteNoise.buffer = noiseBuffer;
        whiteNoise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(800, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.8, ctx.currentTime);

        whiteNoise.connect(filter);
        filter.connect(gainNode);
        gainNode.connect(this.masterGain!);

        whiteNoise.start();
        this.activeNodes.push(whiteNoise);
    }

    /**
     * Fuego de chimenea con crujidos y brasas
     */
    private synthesizeFireplace(ctx: AudioContext): void {
        // 1. Rumble base de calor (Ruido marrón con filtro pasa-bajos a 250Hz)
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0.0;

        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 1.5;
        }

        const rumble = ctx.createBufferSource();
        rumble.buffer = noiseBuffer;
        rumble.loop = true;

        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(280, ctx.currentTime);

        rumble.connect(rumbleFilter);
        rumbleFilter.connect(this.masterGain!);
        rumble.start();
        this.activeNodes.push(rumble);

        // 2. Crujidos aleatorios (Chispas)
        const crackleTimer = setInterval(() => {
            if (this.currentAtmosphere !== 'FIREPLACE') {
                clearInterval(crackleTimer);
                return;
            }
            if (Math.random() < 0.6) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1200 + Math.random() * 1800, ctx.currentTime);
                gain.gain.setValueAtTime(0.08 + Math.random() * 0.12, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.04);
                osc.connect(gain);
                gain.connect(this.masterGain!);
                osc.start();
                osc.stop(ctx.currentTime + 0.05);
            }
        }, 120);
    }

    /**
     * Ondas binaurales estéreo para relajación cerebral
     */
    private synthesizeBinaural(ctx: AudioContext, freqLeft: number, freqRight: number): void {
        const merger = ctx.createChannelMerger(2);

        // Oído izquierdo
        const oscL = ctx.createOscillator();
        oscL.type = 'sine';
        oscL.frequency.setValueAtTime(freqLeft, ctx.currentTime);
        const gainL = ctx.createGain();
        gainL.gain.setValueAtTime(0.25, ctx.currentTime);
        oscL.connect(gainL);
        gainL.connect(merger, 0, 0);

        // Oído derecho
        const oscR = ctx.createOscillator();
        oscR.type = 'sine';
        oscR.frequency.setValueAtTime(freqRight, ctx.currentTime);
        const gainR = ctx.createGain();
        gainR.gain.setValueAtTime(0.25, ctx.currentTime);
        oscR.connect(gainR);
        gainR.connect(merger, 0, 1);

        merger.connect(this.masterGain!);
        oscL.start();
        oscR.start();

        this.activeNodes.push(oscL, oscR);
    }

    /**
     * Olas de mar con respiración sinusoidal
     */
    private synthesizeOceanWaves(ctx: AudioContext): void {
        const bufferSize = 2 * ctx.sampleRate;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.4;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(1.5, ctx.currentTime);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.12, ctx.currentTime); // Una ola cada ~8 segundos
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(450, ctx.currentTime);
        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        filter.frequency.setValueAtTime(500, ctx.currentTime);

        noise.connect(filter);
        filter.connect(this.masterGain!);

        noise.start();
        lfo.start();
        this.activeNodes.push(noise, lfo);
    }

    /**
     * Grillos nocturnos relajantes
     */
    private synthesizeCrickets(ctx: AudioContext): void {
        const cricketInterval = setInterval(() => {
            if (this.currentAtmosphere !== 'NIGHT_CRICKETS') {
                clearInterval(cricketInterval);
                return;
            }
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(4500 + Math.random() * 300, ctx.currentTime);
            gain.gain.setValueAtTime(0.04, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.15);
            osc.connect(gain);
            gain.connect(this.masterGain!);
            osc.start();
            osc.stop(ctx.currentTime + 0.16);
        }, 350);
    }
}

export const getSoundGenerator = (): SoundGenerator => SoundGenerator.getInstance();
export default SoundGenerator;
