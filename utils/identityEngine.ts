/**
 * IdentityEngine — Motor de Identidad Biométrica por Voz v2
 *
 * NUEVO: Auto-aprendizaje pasivo. Nova acumula muestras de voz automáticamente
 * durante las conversaciones, sin que el usuario tenga que hacer nada.
 *
 * Flujo automático:
 *   1. Nova inicia llamada → startPassiveEnrollment("Deyios", "person-main")
 *   2. Audio fluye → feedAudioFrame() detecta frames con voz activa (solo RMS)
 *   3. Cuando hay suficientes → onAutoEnrollComplete() dispara → se guarda en memoria
 *   4. En llamadas futuras → identifica automáticamente por pitch promedio
 *
 * Garantía de latencia:
 *   feedAudioFrame() copia el buffer y encola en <0.1ms
 *   El análisis corre en queueMicrotask, NUNCA bloquea STT→Gemini→TTS
 */

import { extractVoiceFeatures, compareVoiceSignatures } from './voiceBiometrics';
import type { PersonEntry } from '../types';

// ──────────────────────────────────────────────
// Tipos públicos
// ──────────────────────────────────────────────

export interface SpeakerResult {
    person: PersonEntry;
    confidence: number;       // 0.0 – 1.0
    matchedAt: number;
}

export interface EnrollmentProgress {
    samplesCollected: number;
    samplesNeeded: number;
    isReady: boolean;
    /** Segundos de voz activa capturados */
    secondsOfSpeech: number;
}

export interface VoiceSignature {
    avgPitch: number;
    pitchVariance: number;
    spectralCentroid?: number;
}

type SpeakerChangeCallback = (result: SpeakerResult | null) => void;
type AutoEnrollCallback = (signature: VoiceSignature, personId: string, name: string) => void;

// ──────────────────────────────────────────────
// Constantes — tuneadas para frames de 1024 @ 16kHz
// ──────────────────────────────────────────────

const SAMPLE_RATE = 16000;
const FRAME_SIZE = 1024; // samples por frame del worklet

/** RMS mínimo para considerar que hay voz (más permisivo que antes) */
const SPEECH_RMS_THRESHOLD = 0.003;

/** Frames de voz activa necesarios para auto-enrolamiento (~5s de habla) */
const AUTO_ENROLL_FRAMES_NEEDED = 60;

/** Frames antes de intentar identificar */
const MIN_FRAMES_TO_IDENTIFY = 25;

/** Buffer circular de frames */
const CIRCULAR_BUFFER_SIZE = 80;

/** Score mínimo para match (pitch comparison) */
const MATCH_THRESHOLD = 0.68;

/** Cooldown entre identificaciones */
const REIDENTIFY_COOLDOWN_MS = 4000;

// ──────────────────────────────────────────────
// Estado interno (singleton de módulo)
// ──────────────────────────────────────────────

const frameCircularBuffer: Float32Array[] = new Array(CIRCULAR_BUFFER_SIZE);
let bufferHead = 0;
let bufferCount = 0;

/** Frames con voz activa acumulados para enrolamiento */
let enrollFrames: Float32Array[] = [];
let enrollTarget: { name: string; personId: string } | null = null;
let enrollCompleted = false;

/** Personas conocidas con firma de voz */
let knownPeople: PersonEntry[] = [];

/** Speaker activo */
let currentSpeaker: SpeakerResult | null = null;

/** Callbacks suscritos */
const speakerListeners = new Set<SpeakerChangeCallback>();
const autoEnrollListeners = new Set<AutoEnrollCallback>();

let lastIdentifyTs = 0;
let analysisQueued = false;

// Stats
let totalFramesFed = 0;
let totalSpeechFrames = 0;

// ──────────────────────────────────────────────
// API pública
// ──────────────────────────────────────────────

/**
 * Alimenta un frame de audio al motor.
 * CRÍTICO: <0.15ms. Copia el buffer y encola, nada más.
 */
export function feedAudioFrame(raw: Float32Array): void {
    // IMPORTANTE: copiar el buffer — el worklet reutiliza el mismo Float32Array
    const frame = new Float32Array(raw);
    totalFramesFed++;

    // Detectar voz activa con solo RMS (barato y confiable)
    const hasVoice = rmsOf(frame) >= SPEECH_RMS_THRESHOLD;

    // Acumular para auto-enrolamiento si está activo y hay voz
    if (enrollTarget && !enrollCompleted && hasVoice) {
        enrollFrames.push(frame);

        // ¿Completamos el enrolamiento?
        if (enrollFrames.length >= AUTO_ENROLL_FRAMES_NEEDED) {
            enrollCompleted = true;
            // Procesar en microtask para no bloquear
            queueMicrotask(finalizeAutoEnrollment);
        }
    }

    // Solo encolar para identificación si hay voz
    if (hasVoice) {
        totalSpeechFrames++;
        frameCircularBuffer[bufferHead] = frame;
        bufferHead = (bufferHead + 1) % CIRCULAR_BUFFER_SIZE;
        bufferCount = Math.min(bufferCount + 1, CIRCULAR_BUFFER_SIZE);
    }

    // Disparar análisis de identidad si hay suficiente material
    if (!analysisQueued && bufferCount >= MIN_FRAMES_TO_IDENTIFY && knownPeople.length > 0) {
        analysisQueued = true;
        queueMicrotask(runIdentificationCycle);
    }
}

/**
 * Inyecta las personas conocidas. Llamar cuando cambie AppState.knownPeople.
 */
export function setKnownPeople(people: PersonEntry[]): void {
    knownPeople = people.filter(p => p.voiceSignature?.avgPitch);
}

/**
 * Inicia auto-enrolamiento pasivo para una persona.
 * Nova acumulará voz automáticamente durante la conversación.
 * Si ya tiene firma guardada, no hace nada.
 */
export function startPassiveEnrollment(name: string, personId: string): void {
    if (enrollTarget || enrollCompleted) return; // Ya hay uno activo

    // Si la persona ya tiene firma, no re-enrolar
    const existing = knownPeople.find(p => p.id === personId && p.voiceSignature);
    if (existing) return;

    enrollFrames = [];
    enrollCompleted = false;
    enrollTarget = { name, personId };
    console.log(
        `%c🎙️ [IdentityEngine] Auto-enrolamiento iniciado para "${name}" — acumulando voz pasivamente...`,
        'color:#60a5fa;background:#1e3a5f;padding:2px 6px;border-radius:4px'
    );
}

/**
 * Cancela el enrolamiento pasivo en curso.
 */
export function cancelPassiveEnrollment(): void {
    enrollTarget = null;
    enrollFrames = [];
    enrollCompleted = false;
}

/**
 * Retorna el speaker detectado actualmente (no bloquea).
 */
export function getCurrentSpeaker(): SpeakerResult | null {
    return currentSpeaker;
}

/**
 * Progreso del enrolamiento pasivo.
 */
export function getEnrollmentProgress(): EnrollmentProgress {
    if (!enrollTarget) {
        return { samplesCollected: 0, samplesNeeded: AUTO_ENROLL_FRAMES_NEEDED, isReady: false, secondsOfSpeech: 0 };
    }
    const collected = Math.min(enrollFrames.length, AUTO_ENROLL_FRAMES_NEEDED);
    const secondsOfSpeech = parseFloat(((collected * FRAME_SIZE) / SAMPLE_RATE).toFixed(1));
    return {
        samplesCollected: collected,
        samplesNeeded: AUTO_ENROLL_FRAMES_NEEDED,
        isReady: enrollCompleted,
        secondsOfSpeech,
    };
}

/**
 * Si hay enrolamiento activo (sea pasivo o completado).
 */
export function isEnrolling(): boolean {
    return !!enrollTarget && !enrollCompleted;
}

/**
 * Suscribir a cambios de identidad del speaker.
 */
export function onSpeakerChange(cb: SpeakerChangeCallback): () => void {
    speakerListeners.add(cb);
    return () => speakerListeners.delete(cb);
}

/**
 * Suscribir al evento de auto-enrolamiento completado.
 * El callback recibe la firma extraída, el personId y el nombre.
 */
export function onAutoEnrollComplete(cb: AutoEnrollCallback): () => void {
    autoEnrollListeners.add(cb);
    return () => autoEnrollListeners.delete(cb);
}

/**
 * Resetea el speaker detectado.
 */
export function resetSpeaker(): void {
    currentSpeaker = null;
    notifySpeakerListeners(null);
}

/**
 * Stats de debug.
 */
export function getDebugStats() {
    return {
        totalFramesFed,
        totalSpeechFrames,
        speechRatio: totalFramesFed > 0 ? (totalSpeechFrames / totalFramesFed * 100).toFixed(1) + '%' : '0%',
        bufferCount,
        enrollProgress: `${Math.min(enrollFrames.length, AUTO_ENROLL_FRAMES_NEEDED)}/${AUTO_ENROLL_FRAMES_NEEDED}`,
        enrollTarget: enrollTarget?.name ?? 'none',
        knownPeople: knownPeople.length,
        currentSpeaker: currentSpeaker?.person.name ?? 'none',
        confidence: currentSpeaker ? (currentSpeaker.confidence * 100).toFixed(0) + '%' : 'n/a',
    };
}

// ──────────────────────────────────────────────
// Motor interno
// ──────────────────────────────────────────────

/**
 * Extrae firma de voz de los frames acumulados y notifica.
 * Solo corre cuando hay suficiente material.
 */
function finalizeAutoEnrollment(): void {
    if (!enrollTarget) return;
    const { name, personId } = enrollTarget;

    // Extraer pitch de cada frame usando voiceBiometrics
    const pitches: number[] = [];
    for (const frame of enrollFrames) {
        const feat = extractVoiceFeatures(frame, SAMPLE_RATE);
        if (feat && feat.avgPitch >= 70 && feat.avgPitch <= 450) {
            pitches.push(feat.avgPitch);
        }
    }

    if (pitches.length < 5) {
        // Pocos frames con pitch detectado — extender el enrolamiento
        console.warn(`⚠️ [IdentityEngine] Pocos frames con pitch (${pitches.length}). Extendiendo captura...`);
        enrollCompleted = false;
        // Seguir acumulando más frames
        return;
    }

    const avgPitch = pitches.reduce((s, v) => s + v, 0) / pitches.length;
    const pitchVariance = stdDev(pitches);

    const signature: VoiceSignature = { avgPitch, pitchVariance };

    console.log(
        `%c✅ [IdentityEngine] Perfil de voz creado para "${name}": pitch=${avgPitch.toFixed(1)}Hz ±${pitchVariance.toFixed(1)}Hz (${pitches.length} muestras)`,
        'color:#34d399;background:#064e3b;padding:2px 6px;border-radius:4px'
    );

    // Limpiar estado
    enrollTarget = null;
    enrollFrames = [];
    enrollCompleted = false;

    // Notificar para que se guarde en memoria
    autoEnrollListeners.forEach(cb => {
        try { cb(signature, personId, name); } catch { /* nunca crashear el audio thread */ }
    });
}

/**
 * Ciclo de identificación — off-thread, no bloquea.
 */
function runIdentificationCycle(): void {
    analysisQueued = false;

    const now = Date.now();
    if (now - lastIdentifyTs < REIDENTIFY_COOLDOWN_MS) return;
    if (knownPeople.length === 0) { bufferCount = 0; return; }

    // Consumir frames del buffer circular
    const framesToUse = Math.min(bufferCount, MIN_FRAMES_TO_IDENTIFY);
    const frames: Float32Array[] = [];
    for (let i = 0; i < framesToUse; i++) {
        const idx = (bufferHead - framesToUse + i + CIRCULAR_BUFFER_SIZE) % CIRCULAR_BUFFER_SIZE;
        if (frameCircularBuffer[idx]) frames.push(frameCircularBuffer[idx]);
    }
    bufferCount = 0;

    if (frames.length < 8) return;

    // Extraer pitch promedio de los frames
    const pitches: number[] = [];
    for (const f of frames) {
        const feat = extractVoiceFeatures(f, SAMPLE_RATE);
        if (feat && feat.avgPitch >= 75 && feat.avgPitch <= 420) {
            pitches.push(feat.avgPitch);
        }
    }
    if (pitches.length < 5) return;

    const currentSig = {
        avgPitch: pitches.reduce((s, v) => s + v, 0) / pitches.length,
        pitchVariance: stdDev(pitches),
    };

    // Buscar mejor match
    let bestPerson: PersonEntry | null = null;
    let bestScore = 0;
    for (const person of knownPeople) {
        if (!person.voiceSignature) continue;
        const score = compareVoiceSignatures(currentSig, person.voiceSignature);
        if (score > bestScore) { bestScore = score; bestPerson = person; }
    }

    lastIdentifyTs = now;

    if (bestPerson && bestScore >= MATCH_THRESHOLD) {
        const prevId = currentSpeaker?.person.id;
        currentSpeaker = { person: bestPerson, confidence: Math.min(1, bestScore), matchedAt: now };
        if (prevId !== bestPerson.id) {
            console.log(
                `%c🎙️ [Identity] Reconocido: "${bestPerson.name}" (${(bestScore * 100).toFixed(0)}%)`,
                'color:#34d399;font-weight:bold;background:#064e3b;padding:2px 6px;border-radius:4px'
            );
            notifySpeakerListeners(currentSpeaker);
        }
    } else if (currentSpeaker && (now - currentSpeaker.matchedAt) > 12000) {
        currentSpeaker = null;
        notifySpeakerListeners(null);
    }
}

// ──────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────

function rmsOf(buf: Float32Array): number {
    let sum = 0;
    for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
    return Math.sqrt(sum / buf.length);
}

function stdDev(values: number[]): number {
    if (values.length < 2) return 0;
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    return Math.sqrt(values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length);
}

function notifySpeakerListeners(result: SpeakerResult | null): void {
    speakerListeners.forEach(cb => { try { cb(result); } catch { /* safe */ } });
}
