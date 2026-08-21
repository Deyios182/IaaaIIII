/**
 * ASMRSoundEngine - Motor Unificado de Síntesis Procedural de Atmósferas ASMR
 * Genera 7 paisajes sonoros y efectos fisiológicos en tiempo real con Web Audio API:
 * 1. Lluvia Suave (Brown Noise)
 * 2. Chimenea y Brasas (Rumble + Chispas)
 * 3. Olas de Mar (Modulación Sinusoidal LFO)
 * 4. Ondas Binaurales Alfa 10Hz (Concentración/Flow)
 * 5. Ondas Binaurales Theta 6Hz (Sueño/Relajación)
 * 6. Latidos de Corazón Sub-graves 50Hz (Lub-Dub con BPM dinámico)
 * 7. Respiración Íntima Cercana (Filtro cálido + LFO)
 * 
 * 100% nativo, 0 archivos MP3, 0 consumo de red, 0 latencia.
 */

export type ASMRSoundType = 
    | 'RAIN' 
    | 'FIREPLACE' 
    | 'OCEAN_WAVES' 
    | 'BINAURAL_ALPHA' 
    | 'BINAURAL_THETA' 
    | 'HEARTBEAT' 
    | 'BREATHING' 
    | 'NIGHT_CRICKETS' 
    | 'STOP';

export class ASMRSoundEngine {
    private context: AudioContext | null = null;
    private masterGain: GainNode | null = null;
    private filterNode: BiquadFilterNode | null = null;
    private activeSources: { stop: () => void; disconnect: () => void }[] = [];
    private activeIntervals: ReturnType<typeof setInterval>[] = [];
    private currentSound: ASMRSoundType = 'STOP';
    private currentVolume: number = 0.35;
    private currentFilterFreq: number = 400;

    constructor() {
        if (typeof window !== 'undefined') {
            // Desbloquear AudioContext automáticamente al primer toque del usuario
            const unlockAudio = () => {
                this.ensureContext();
                window.removeEventListener('click', unlockAudio);
                window.removeEventListener('keydown', unlockAudio);
                window.removeEventListener('touchstart', unlockAudio);
            };
            window.addEventListener('click', unlockAudio, { passive: true });
            window.addEventListener('keydown', unlockAudio, { passive: true });
            window.addEventListener('touchstart', unlockAudio, { passive: true });

            // Escuchar eventos globales de Nova
            window.addEventListener('aiko-sound', (e: Event) => {
                const detail = (e as CustomEvent<{ sound: string; volume?: number; bpm?: number }>).detail;
                if (detail && detail.sound) {
                    const s = detail.sound.toUpperCase();
                    if (s === 'STOP') {
                        this.stop();
                    } else if (s === 'RAIN' || s === 'SOFT_RAIN') {
                        this.play('RAIN', detail.volume);
                    } else if (s === 'FIREPLACE' || s === 'FIRE') {
                        this.play('FIREPLACE', detail.volume);
                    } else if (s === 'OCEAN_WAVES' || s === 'OCEAN' || s === 'WAVES') {
                        this.play('OCEAN_WAVES', detail.volume);
                    } else if (s === 'BINAURAL_ALPHA' || s === 'ALPHA') {
                        this.play('BINAURAL_ALPHA', detail.volume);
                    } else if (s === 'BINAURAL_THETA' || s === 'THETA') {
                        this.play('BINAURAL_THETA', detail.volume);
                    } else if (s === 'HEARTBEAT' || s === 'CORAZON') {
                        this.playHeartbeat(detail.bpm ?? 80, detail.volume ?? 0.6);
                    } else if (s === 'BREATHING' || s === 'INTIMATE_BREATHING' || s === 'RESPIRACION') {
                        this.play('BREATHING', detail.volume ?? 0.45);
                    } else if (s === 'NIGHT_CRICKETS' || s === 'CRICKETS') {
                        this.play('NIGHT_CRICKETS', detail.volume);
                    }
                }
            });
        }
    }

    public ensureContext(): AudioContext {
        if (!this.context) {
            const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
            this.context = new AudioCtx();
        }
        if (this.context.state === 'suspended') {
            this.context.resume().catch(() => {});
        }
        return this.context;
    }

    /**
     * Inicia cualquier atmósfera ASMR de forma unificada
     */
    public play(sound: ASMRSoundType, volume: number = 0.35): void {
        const ctx = this.ensureContext();
        this.stopImmediate();

        if (sound === 'STOP' || !sound) {
            this.currentSound = 'STOP';
            return;
        }

        this.currentSound = sound;
        this.currentVolume = Math.max(0.01, Math.min(1.0, volume));

        // Configurar Master Gain con Fade-in suave de 1.2 segundos
        this.masterGain = ctx.createGain();
        this.masterGain.gain.setValueAtTime(0.001, ctx.currentTime);
        this.masterGain.gain.exponentialRampToValueAtTime(this.currentVolume, ctx.currentTime + 1.2);
        this.masterGain.connect(ctx.destination);

        console.log(`🎧 [ASMR Engine] Iniciando atmósfera: ${sound} (Vol: ${(this.currentVolume * 100).toFixed(0)}%)`);

        switch (sound) {
            case 'RAIN':
                this.synthesizeRain(ctx);
                break;
            case 'FIREPLACE':
                this.synthesizeFireplace(ctx);
                break;
            case 'OCEAN_WAVES':
                this.synthesizeOceanWaves(ctx);
                break;
            case 'BINAURAL_ALPHA':
                this.synthesizeBinaural(ctx, 216, 226); // 10Hz Alpha (Flow / Enfoque)
                break;
            case 'BINAURAL_THETA':
                this.synthesizeBinaural(ctx, 140, 146); // 6Hz Theta (Sueño / Relajación)
                break;
            case 'BREATHING':
                this.synthesizeBreathing(ctx);
                break;
            case 'NIGHT_CRICKETS':
                this.synthesizeCrickets(ctx);
                break;
            case 'HEARTBEAT':
                this.playHeartbeat(80, volume);
                break;
        }
    }

    /**
     * 1. Lluvia de Ruido Marrón Filtrada
     */
    private synthesizeRain(ctx: AudioContext): void {
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        this.filterNode = ctx.createBiquadFilter();
        this.filterNode.type = 'lowpass';
        this.filterNode.frequency.setValueAtTime(this.currentFilterFreq, ctx.currentTime);

        noise.connect(this.filterNode);
        this.filterNode.connect(this.masterGain!);
        noise.start();

        this.activeSources.push(noise);
    }

    /**
     * 2. Fuego de Chimenea (Rumble + Chispas crepitantes)
     */
    private synthesizeFireplace(ctx: AudioContext): void {
        // Base de calor (ruido grave a 240Hz)
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.025 * white)) / 1.025;
            lastOut = output[i];
            output[i] *= 2.8;
        }

        const rumble = ctx.createBufferSource();
        rumble.buffer = noiseBuffer;
        rumble.loop = true;

        const rumbleFilter = ctx.createBiquadFilter();
        rumbleFilter.type = 'lowpass';
        rumbleFilter.frequency.setValueAtTime(260, ctx.currentTime);

        rumble.connect(rumbleFilter);
        rumbleFilter.connect(this.masterGain!);
        rumble.start();
        this.activeSources.push(rumble);

        // Chispas crepitantes aleatorias
        const crackleTimer = setInterval(() => {
            if (this.currentSound !== 'FIREPLACE' || !this.masterGain || !this.context) {
                clearInterval(crackleTimer);
                return;
            }
            if (Math.random() < 0.65) {
                const now = this.context.currentTime;
                const osc = this.context.createOscillator();
                const gain = this.context.createGain();
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(1400 + Math.random() * 1600, now);
                gain.gain.setValueAtTime(0.09 + Math.random() * 0.12, now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);
                osc.connect(gain);
                gain.connect(this.masterGain);
                osc.start(now);
                osc.stop(now + 0.04);
            }
        }, 110);
        this.activeIntervals.push(crackleTimer);
    }

    /**
     * 3. Olas de Mar (Filtro Bandpass con respiración sinusoidal LFO)
     */
    private synthesizeOceanWaves(ctx: AudioContext): void {
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);

        for (let i = 0; i < bufferSize; i++) {
            output[i] = (Math.random() * 2 - 1) * 0.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.Q.setValueAtTime(1.4, ctx.currentTime);
        filter.frequency.setValueAtTime(450, ctx.currentTime);

        const lfo = ctx.createOscillator();
        lfo.frequency.setValueAtTime(0.12, ctx.currentTime); // Una ola cada ~8 seg
        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(380, ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(filter.frequency);

        noise.connect(filter);
        filter.connect(this.masterGain!);

        noise.start();
        lfo.start();

        this.activeSources.push(noise, lfo);
    }

    /**
     * 4. Ondas Binaurales Estéreo (Diferencia de frecuencias para inducir relajación cerebral)
     */
    private synthesizeBinaural(ctx: AudioContext, freqLeft: number, freqRight: number): void {
        const merger = ctx.createChannelMerger(2);

        // Oído izquierdo
        const oscL = ctx.createOscillator();
        oscL.type = 'sine';
        oscL.frequency.setValueAtTime(freqLeft, ctx.currentTime);
        const gainL = ctx.createGain();
        gainL.gain.setValueAtTime(0.3, ctx.currentTime);
        oscL.connect(gainL);
        gainL.connect(merger, 0, 0);

        // Oído derecho
        const oscR = ctx.createOscillator();
        oscR.type = 'sine';
        oscR.frequency.setValueAtTime(freqRight, ctx.currentTime);
        const gainR = ctx.createGain();
        gainR.gain.setValueAtTime(0.3, ctx.currentTime);
        oscR.connect(gainR);
        gainR.connect(merger, 0, 1);

        merger.connect(this.masterGain!);
        oscL.start();
        oscR.start();

        this.activeSources.push(oscL, oscR);
    }

    /**
     * 5. Latidos de Corazón Sub-graves (50Hz Lub-Dub)
     */
    public playHeartbeat(bpm: number = 80, volume: number = 0.6): void {
        const ctx = this.ensureContext();
        this.stopImmediate();

        this.currentSound = 'HEARTBEAT';
        this.currentVolume = Math.max(0.01, Math.min(1.0, volume));

        const osc = ctx.createOscillator();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(50, ctx.currentTime);

        const gainNode = ctx.createGain();
        gainNode.gain.setValueAtTime(0.0001, ctx.currentTime);

        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        osc.start();
        this.activeSources.push(osc);

        const scheduleBeat = (targetTime: number) => {
            const v = this.currentVolume;
            // Lub
            gainNode.gain.setValueAtTime(0.0001, targetTime);
            gainNode.gain.linearRampToValueAtTime(v, targetTime + 0.08);
            gainNode.gain.linearRampToValueAtTime(0.0001, targetTime + 0.18);

            // Dub
            gainNode.gain.setValueAtTime(0.0001, targetTime + 0.24);
            gainNode.gain.linearRampToValueAtTime(v * 0.75, targetTime + 0.32);
            gainNode.gain.linearRampToValueAtTime(0.0001, targetTime + 0.48);
        };

        scheduleBeat(ctx.currentTime + 0.05);

        const intervalMs = (60 / bpm) * 1000;
        const hbTimer = setInterval(() => {
            if (this.currentSound !== 'HEARTBEAT') {
                clearInterval(hbTimer);
                return;
            }
            scheduleBeat(ctx.currentTime + 0.05);
        }, intervalMs);

        this.activeIntervals.push(hbTimer);
        console.log(`💓 [ASMR Engine] Latidos iniciados a ${bpm} BPM.`);
    }

    /**
     * 6. Respiración Íntima Cercana Modulada por LFO
     */
    private synthesizeBreathing(ctx: AudioContext): void {
        const bufferSize = ctx.sampleRate * 2;
        const noiseBuffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const output = noiseBuffer.getChannelData(0);
        let lastOut = 0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            output[i] = (lastOut + (0.02 * white)) / 1.02;
            lastOut = output[i];
            output[i] *= 3.5;
        }

        const noise = ctx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;

        const filter = ctx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(580, ctx.currentTime);
        filter.Q.setValueAtTime(1.8, ctx.currentTime);

        const lfo = ctx.createOscillator();
        lfo.type = 'sine';
        lfo.frequency.setValueAtTime(0.2, ctx.currentTime); // ~5 seg por ciclo

        const lfoGain = ctx.createGain();
        lfoGain.gain.setValueAtTime(this.currentVolume * 0.45, ctx.currentTime);

        lfo.connect(lfoGain);
        lfoGain.connect(this.masterGain!.gain);

        noise.connect(filter);
        filter.connect(this.masterGain!);

        noise.start();
        lfo.start();

        this.activeSources.push(noise, lfo);
    }

    /**
     * 7. Grillos de Noche Relajantes
     */
    private synthesizeCrickets(ctx: AudioContext): void {
        const cricketTimer = setInterval(() => {
            if (this.currentSound !== 'NIGHT_CRICKETS' || !this.masterGain || !this.context) {
                clearInterval(cricketTimer);
                return;
            }
            const now = this.context.currentTime;
            const osc = this.context.createOscillator();
            const gain = this.context.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(4500 + Math.random() * 300, now);
            gain.gain.setValueAtTime(0.04, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
            osc.connect(gain);
            gain.connect(this.masterGain);
            osc.start(now);
            osc.stop(now + 0.16);
        }, 350);
        this.activeIntervals.push(cricketTimer);
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // CONTROLES DE VOLUMEN, TONO Y PARADA
    // ─────────────────────────────────────────────────────────────────────────────

    public setFilterFrequency(freq: number): void {
        this.currentFilterFreq = Math.max(100, Math.min(2000, freq));
        if (this.filterNode && this.context) {
            this.filterNode.frequency.linearRampToValueAtTime(this.currentFilterFreq, this.context.currentTime + 0.2);
        }
    }

    public setVolume(volume: number): void {
        this.currentVolume = Math.max(0, Math.min(1.0, volume));
        if (this.masterGain && this.context) {
            this.masterGain.gain.linearRampToValueAtTime(this.currentVolume, this.context.currentTime + 0.3);
        }
    }

    public stop(): void {
        this.currentSound = 'STOP';
        for (const timer of this.activeIntervals) {
            clearInterval(timer);
        }
        this.activeIntervals = [];

        if (this.masterGain && this.context) {
            this.masterGain.gain.linearRampToValueAtTime(0.0001, this.context.currentTime + 0.8);
            setTimeout(() => {
                this.stopImmediate();
            }, 850);
        } else {
            this.stopImmediate();
        }
    }

    private stopImmediate(): void {
        for (const timer of this.activeIntervals) {
            clearInterval(timer);
        }
        this.activeIntervals = [];

        for (const src of this.activeSources) {
            try {
                src.stop();
                src.disconnect();
            } catch {}
        }
        this.activeSources = [];
    }

    public getCurrentSound(): ASMRSoundType {
        return this.currentSound;
    }

    public isPlaying(): boolean {
        return this.currentSound !== 'STOP';
    }

    // Retrocompatibilidad
    public playSoftRain(volume: number = 0.3, cutoffFreq: number = 400): void {
        this.currentFilterFreq = cutoffFreq;
        this.play('RAIN', volume);
    }

    public playBreathing(speed: number = 0.2, volume: number = 0.45): void {
        this.play('BREATHING', volume);
    }

    public getCurrentMode(): string {
        return this.currentSound;
    }
}

export const asmrEngine = new ASMRSoundEngine();
export default asmrEngine;
