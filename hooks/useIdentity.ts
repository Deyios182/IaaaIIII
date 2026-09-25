/**
 * useIdentity — Hook de Identidad Biométrica Automática
 *
 * Nova aprende la voz del usuario AUTOMÁTICAMENTE durante las conversaciones.
 * No requiere ninguna acción del usuario.
 *
 * Flujo:
 *   1. Hook montado → si el usuario no tiene firma de voz → inicia aprendizaje pasivo
 *   2. Audio fluye del AudioWorklet → IdentityEngine acumula voz activa en background
 *   3. Cuando hay suficiente (~5s de habla total) → signature extraída → guardada en memoria
 *   4. En siguientes sesiones → reconocimiento automático
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import * as IdentityEngine from '../utils/identityEngine';
import type { SpeakerResult, EnrollmentProgress, VoiceSignature } from '../utils/identityEngine';
import type { PersonEntry } from '../types';

export interface UseIdentityOptions {
    /** Personas conocidas del AppState */
    knownPeople: PersonEntry[];
    /** Nombre del usuario principal (para auto-enrolamiento) */
    userName: string;
    /** ID de la persona principal en knownPeople */
    mainPersonId?: string;
    /** Callback cuando cambia el speaker */
    onSpeakerChange?: (result: SpeakerResult | null) => void;
    /** Callback cuando auto-enrollment completa — guardar la firma */
    onVoiceProfileCreated?: (signature: VoiceSignature, personId: string, name: string) => void;
}

export interface UseIdentityReturn {
    /** Speaker detectado actualmente */
    currentSpeaker: SpeakerResult | null;
    /** Si el sistema está acumulando voz pasivamente */
    isLearning: boolean;
    /** Progreso del aprendizaje pasivo */
    learningProgress: EnrollmentProgress;
    /** Si el usuario principal ya tiene voz registrada */
    hasVoiceProfile: boolean;
    /** Stats para debug */
    debugStats: ReturnType<typeof IdentityEngine.getDebugStats> | null;
    /** Forzar re-aprendizaje (borrar perfil y volver a capturar) */
    reLearnVoice: () => void;
    resetSpeaker: () => void;
}

export function useIdentity({
    knownPeople,
    userName,
    mainPersonId,
    onSpeakerChange,
    onVoiceProfileCreated,
}: UseIdentityOptions): UseIdentityReturn {

    const [currentSpeaker, setCurrentSpeaker] = useState<SpeakerResult | null>(null);
    const [isLearning, setIsLearning] = useState(false);
    const [learningProgress, setLearningProgress] = useState<EnrollmentProgress>({
        samplesCollected: 0, samplesNeeded: 60, isReady: false, secondsOfSpeech: 0,
    });
    const [hasVoiceProfile, setHasVoiceProfile] = useState(false);
    const [debugStats, setDebugStats] = useState<ReturnType<typeof IdentityEngine.getDebugStats> | null>(null);

    const onSpeakerChangeRef = useRef(onSpeakerChange);
    const onVoiceProfileCreatedRef = useRef(onVoiceProfileCreated);
    useEffect(() => { onSpeakerChangeRef.current = onSpeakerChange; }, [onSpeakerChange]);
    useEffect(() => { onVoiceProfileCreatedRef.current = onVoiceProfileCreated; }, [onVoiceProfileCreated]);

    // ── Sincronizar knownPeople con el motor ──
    useEffect(() => {
        IdentityEngine.setKnownPeople(knownPeople);

        // Verificar si el usuario principal ya tiene perfil de voz
        const mainPerson = mainPersonId
            ? knownPeople.find(p => p.id === mainPersonId)
            : knownPeople.find(p => p.name.toLowerCase() === userName.toLowerCase());

        const profileExists = !!(mainPerson?.voiceSignature?.avgPitch);
        setHasVoiceProfile(profileExists);

        // Si NO tiene perfil → iniciar auto-aprendizaje pasivo
        if (!profileExists && userName) {
            const personId = mainPerson?.id ?? mainPersonId ?? `person-${userName.toLowerCase().replace(/\s+/g, '-')}`;
            IdentityEngine.startPassiveEnrollment(userName, personId);
            setIsLearning(true);
        } else if (profileExists) {
            setIsLearning(false);
        }
    }, [knownPeople, userName, mainPersonId]);

    // ── Suscribir a cambios de speaker ──
    useEffect(() => {
        const unsub = IdentityEngine.onSpeakerChange((result) => {
            setCurrentSpeaker(result);
            onSpeakerChangeRef.current?.(result);
        });
        return unsub;
    }, []);

    // ── Suscribir a completado de auto-enrolamiento ──
    useEffect(() => {
        const unsub = IdentityEngine.onAutoEnrollComplete((signature, personId, name) => {
            setIsLearning(false);
            setHasVoiceProfile(true);
            setLearningProgress({ samplesCollected: 60, samplesNeeded: 60, isReady: true, secondsOfSpeech: 5 });
            console.log(`✅ [useIdentity] Perfil de voz de "${name}" listo. Guardando en memoria...`);
            onVoiceProfileCreatedRef.current?.(signature, personId, name);
        });
        return unsub;
    }, []);

    // ── Poll de progreso de aprendizaje ──
    useEffect(() => {
        if (!isLearning) return;
        const interval = setInterval(() => {
            const progress = IdentityEngine.getEnrollmentProgress();
            setLearningProgress(progress);
        }, 500);
        return () => clearInterval(interval);
    }, [isLearning]);

    // ── Debug stats (solo dev) ──
    useEffect(() => {
        if (process.env.NODE_ENV === 'production') return;
        const interval = setInterval(() => {
            setDebugStats(IdentityEngine.getDebugStats());
        }, 3000);
        return () => clearInterval(interval);
    }, []);

    const reLearnVoice = useCallback(() => {
        IdentityEngine.cancelPassiveEnrollment();
        setIsLearning(false);
        setTimeout(() => {
            if (userName && mainPersonId) {
                IdentityEngine.startPassiveEnrollment(userName, mainPersonId);
                setIsLearning(true);
                setHasVoiceProfile(false);
                setLearningProgress({ samplesCollected: 0, samplesNeeded: 60, isReady: false, secondsOfSpeech: 0 });
            }
        }, 100);
    }, [userName, mainPersonId]);

    const resetSpeaker = useCallback(() => {
        IdentityEngine.resetSpeaker();
        setCurrentSpeaker(null);
    }, []);

    return {
        currentSpeaker,
        isLearning,
        learningProgress,
        hasVoiceProfile,
        debugStats,
        reLearnVoice,
        resetSpeaker,
    };
}
