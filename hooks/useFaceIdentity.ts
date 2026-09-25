/**
 * useFaceIdentity — Reconocimiento Facial Pasivo y Automático
 *
 * Usa requestIdleCallback para procesar frames de cámara SOLO cuando el browser
 * está idle — garantiza 0 impacto en latencia de llamada/respuesta de Nova.
 *
 * Flujo automático:
 *  1. Si el usuario (user-identity) no tiene faceDescriptor → auto-enrolla con la primera cara detectada
 *  2. Si ya tiene descriptor → identifica contra knownPeople en cada frame idle
 *  3. onFaceProfileCreated → guardar descriptor en AppState (persiste en localStorage)
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import type { PersonEntry } from '../types';

// Lazy-load faceRecognition para no aumentar bundle inicial
let faceApiLoaded = false;
let faceApiLoading = false;
let faceApiCallbacks: Array<() => void> = [];

async function ensureFaceApi(): Promise<typeof import('../utils/faceRecognition')> {
    if (faceApiLoaded) {
        return import('../utils/faceRecognition');
    }

    if (faceApiLoading) {
        return new Promise((resolve) => {
            faceApiCallbacks.push(async () => {
                resolve(await import('../utils/faceRecognition'));
            });
        });
    }

    faceApiLoading = true;
    const mod = await import('../utils/faceRecognition');
    const ok = await mod.initializeFaceAPI();
    faceApiLoaded = ok;
    faceApiLoading = false;
    faceApiCallbacks.forEach(cb => cb());
    faceApiCallbacks = [];
    return mod;
}

// ──────────────────────────────────────────────
// Tipos
// ──────────────────────────────────────────────

export interface FaceSpeakerResult {
    person: PersonEntry;
    distance: number;   // Distancia euclidiana (menor = mejor match)
    confidence: number; // 0–1 invertido de distancia
}

export interface UseFaceIdentityOptions {
    /** Ref al elemento <video> de la cámara */
    videoRef: React.RefObject<HTMLVideoElement>;
    /** Lista de personas conocidas */
    knownPeople: PersonEntry[];
    /** Si la cámara está activa */
    isCameraActive: boolean;
    /** Nombre del usuario principal */
    userName: string;
    /** ID del perfil del usuario principal */
    mainPersonId?: string;
    /** Callback cuando se crea el descriptor facial (para guardarlo en AppState) */
    onFaceProfileCreated?: (descriptor: number[], personId: string, name: string) => void;
    /** Callback cuando se identifica a alguien */
    onFaceIdentified?: (result: FaceSpeakerResult) => void;
}

export interface UseFaceIdentityReturn {
    faceResult: FaceSpeakerResult | null;
    isLearningFace: boolean;
    hasFaceProfile: boolean;
    faceApiReady: boolean;
    reLearnFace: () => void;
}

// ──────────────────────────────────────────────
// Hook
// ──────────────────────────────────────────────

export function useFaceIdentity({
    videoRef,
    knownPeople,
    isCameraActive,
    userName,
    mainPersonId = 'user-identity',
    onFaceProfileCreated,
    onFaceIdentified,
}: UseFaceIdentityOptions): UseFaceIdentityReturn {

    const [faceResult, setFaceResult] = useState<FaceSpeakerResult | null>(null);
    const [isLearningFace, setIsLearningFace] = useState(false);
    const [hasFaceProfile, setHasFaceProfile] = useState(false);
    const [faceApiReady, setFaceApiReady] = useState(false);

    const idleCallbackRef = useRef<number | null>(null);
    const isProcessingRef = useRef(false);
    const onFaceProfileCreatedRef = useRef(onFaceProfileCreated);
    const onFaceIdentifiedRef = useRef(onFaceIdentified);
    const knownPeopleRef = useRef(knownPeople);
    const isCameraActiveRef = useRef(isCameraActive);
    const enrollingRef = useRef(false);
    const reLearnRef = useRef(false);

    useEffect(() => { onFaceProfileCreatedRef.current = onFaceProfileCreated; }, [onFaceProfileCreated]);
    useEffect(() => { onFaceIdentifiedRef.current = onFaceIdentified; }, [onFaceIdentified]);
    useEffect(() => { knownPeopleRef.current = knownPeople; }, [knownPeople]);
    useEffect(() => { isCameraActiveRef.current = isCameraActive; }, [isCameraActive]);

    // Verificar si el usuario ya tiene perfil facial
    useEffect(() => {
        const mainPerson = knownPeople.find(p => p.id === mainPersonId);
        const hasDescriptor = !!(mainPerson?.faceDescriptor?.length);
        setHasFaceProfile(hasDescriptor);
        setIsLearningFace(!hasDescriptor && isCameraActive);
    }, [knownPeople, mainPersonId, isCameraActive]);

    // Inicializar face-api cuando la cámara se activa
    useEffect(() => {
        if (!isCameraActive) return;
        ensureFaceApi().then(() => {
            setFaceApiReady(true);
            console.log('🤖 [FaceIdentity] face-api.js listo');
        }).catch(err => {
            console.warn('⚠️ [FaceIdentity] Error cargando face-api:', err);
        });
    }, [isCameraActive]);

    // Procesamiento idle — ciclo principal
    useEffect(() => {
        if (!faceApiReady || !isCameraActive) return;

        const runIdleFrame = async () => {
            if (isProcessingRef.current) {
                scheduleNext();
                return;
            }

            const video = videoRef.current;
            if (!video || video.readyState < 2 || video.videoWidth === 0) {
                scheduleNext();
                return;
            }

            isProcessingRef.current = true;

            try {
                const faceModule = await import('../utils/faceRecognition');
                const detection = await faceModule.detectFace(video);

                if (!detection) {
                    isProcessingRef.current = false;
                    setTimeout(() => scheduleNext(), 1500);
                    return;
                }

                const descriptor = detection.descriptor;
                const people = knownPeopleRef.current;
                const mainPerson = people.find(p => p.id === mainPersonId);

                // ── Auto-enrolamiento: el usuario aún no tiene descriptor ──
                if (!mainPerson?.faceDescriptor?.length || enrollingRef.current || reLearnRef.current) {
                    if (!enrollingRef.current) {
                        enrollingRef.current = true;
                        reLearnRef.current = false;
                        setIsLearningFace(true);
                        console.log(
                            `%c👁️ [FaceIdentity] Cara detectada — guardando descriptor facial de "${userName}"...`,
                            'color:#a78bfa;background:#2e1065;padding:2px 6px;border-radius:4px'
                        );
                    }

                    const descriptorArray = faceModule.descriptorToArray(descriptor);
                    enrollingRef.current = false;
                    setIsLearningFace(false);
                    setHasFaceProfile(true);

                    console.log(
                        `%c✅ [FaceIdentity] Descriptor facial de "${userName}" capturado (128D)`,
                        'color:#34d399;background:#064e3b;padding:2px 6px;border-radius:4px'
                    );

                    onFaceProfileCreatedRef.current?.(descriptorArray, mainPersonId, userName);

                } else {
                    // ── Identificación: comparar contra personas conocidas ──
                    const peopleWithFace = people.filter(p => p.faceDescriptor?.length);
                    if (peopleWithFace.length === 0) {
                        isProcessingRef.current = false;
                        setTimeout(() => scheduleNext(), 1500);
                        return;
                    }

                    const match = faceModule.findMatchingPerson(descriptor, peopleWithFace);

                    if (match) {
                        const confidence = Math.max(0, Math.min(1, 1 - match.distance / 0.6));
                        const result: FaceSpeakerResult = {
                            person: match.person,
                            distance: match.distance,
                            confidence,
                        };

                        setFaceResult(prev => {
                            if (prev?.person.id !== match.person.id) {
                                console.log(
                                    `%c👁️ [FaceIdentity] Reconocido: "${match.person.name}" (dist: ${match.distance.toFixed(3)})`,
                                    'color:#34d399;font-weight:bold;background:#064e3b;padding:2px 6px;border-radius:4px'
                                );
                                onFaceIdentifiedRef.current?.(result);
                            }
                            return result;
                        });
                    } else {
                        setFaceResult(null);
                    }
                }
            } catch (err) {
                // Silencioso — nunca crashear el main thread
            }

            isProcessingRef.current = false;
            // Esperar 1.5 segundos antes de programar el siguiente frame para no asfixiar el main thread.
            // faceapi es costoso y bloquea la interfaz durante la inferencia, aunque use requestIdleCallback.
            setTimeout(() => {
                scheduleNext();
            }, 1500);
        };

        const scheduleNext = () => {
            if (!isCameraActiveRef.current) return;
            // requestIdleCallback con timeout de 2s para garantizar que eventualmente corra
            if ('requestIdleCallback' in window) {
                idleCallbackRef.current = window.requestIdleCallback(runIdleFrame, { timeout: 2000 });
            } else {
                // Fallback para Safari — window.setTimeout siempre existe en browser
                idleCallbackRef.current = (window as Window).setTimeout(runIdleFrame, 500) as unknown as number;
            }
        };

        // Arrancar el ciclo con un pequeño delay para no interferir con el inicio de llamada
        const startTimer = setTimeout(scheduleNext, 1500);

        return () => {
            clearTimeout(startTimer);
            if (idleCallbackRef.current !== null) {
                if ('cancelIdleCallback' in window) {
                    window.cancelIdleCallback(idleCallbackRef.current);
                } else {
                    clearTimeout(idleCallbackRef.current);
                }
            }
            isProcessingRef.current = false;
        };
    }, [faceApiReady, isCameraActive, mainPersonId, userName, videoRef]);

    const reLearnFace = useCallback(() => {
        reLearnRef.current = true;
        setHasFaceProfile(false);
        setIsLearningFace(true);
        setFaceResult(null);
        console.log('🔄 [FaceIdentity] Re-aprendizaje facial iniciado');
    }, []);

    return {
        faceResult,
        isLearningFace,
        hasFaceProfile,
        faceApiReady,
        reLearnFace,
    };
}
