/**
 * usePokerAssistant Hook
 * 
 * Hook personalizado que maneja toda la lógica del Poker Assistant.
 * Facilita la integración en Dashboard sin modificar mucho código existente.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { PokerSituation, analyzePokerScreen } from '../services/pokerVision';
import { GTODecision, calculateGTODecision } from '../services/gtoEngine';
import { createPokerDemo } from '../services/pokerDemo';
import { captureFrame, isScreenSharing as checkScreenSharing } from '../utils/screenCapture';

interface UsePokerAssistantOptions {
    enabled: boolean;
    onSpeak?: (text: string) => void;
    debugMode?: boolean; // Si true, usa demo mode
}

export function usePokerAssistant(options: UsePokerAssistantOptions) {
    const { enabled, onSpeak, debugMode = false } = options; // Default a false para producción

    const [situation, setSituation] = useState<PokerSituation | null>(null);
    const [decision, setDecision] = useState<GTODecision | null>(null);
    const [isActive, setIsActive] = useState(false);

    // useRef para evitar recreación del callback
    const onSpeakRef = useRef(onSpeak);
    useEffect(() => {
        onSpeakRef.current = onSpeak;
    }, [onSpeak]);

    // Actualizar situación y decisión
    const updateSituation = useCallback((newSituation: PokerSituation) => {
        setSituation(newSituation);
        const newDecision = calculateGTODecision(newSituation);
        setDecision(newDecision);

        // Hablar recomendación si hay callback
        if (onSpeakRef.current && newDecision) {
            const speech = formatDecisionToSpeech(newDecision);
            onSpeakRef.current(speech);
        }
    }, []);

    // Modo demo: generar situaciones aleatorias
    useEffect(() => {
        if (!enabled || !isActive || !debugMode) {
            if (isActive) console.log('🎴 Poker Real-Time Mode activo');
            return;
        }

        console.log('🎴 Poker Assistant Demo Mode ACTIVADO - cambiará cada 8s');

        const cleanup = createPokerDemo((situation, decision) => {
            console.log('🎴 Nueva situación demo:', situation.heroCards?.[0], situation.heroCards?.[1]);
            setSituation(situation);
            setDecision(decision);

            if (onSpeakRef.current) {
                const speech = formatDecisionToSpeech(decision);
                onSpeakRef.current(speech);
            }
        }, 8000);

        return cleanup;
    }, [enabled, isActive, debugMode]);

    // 👁️ MODO REAL: Análisis de pantalla real cada 3s
    useEffect(() => {
        if (!enabled || !isActive || debugMode) return;

        const analysisInterval = setInterval(async () => {
            if (!checkScreenSharing()) return;

            try {
                const frame = captureFrame(0.7);
                if (!frame) return;

                const newSituation = await analyzePokerScreen(frame);

                // Solo actualizar si hay cambios significativos (detección de cartas)
                if (newSituation.heroCards) {
                    setSituation(newSituation);
                    const newDecision = calculateGTODecision(newSituation);
                    setDecision(newDecision);

                    // Solo hablar si la decisión o el board cambian
                    if (onSpeakRef.current) {
                        onSpeakRef.current(formatDecisionToSpeech(newDecision));
                    }
                }
            } catch (error) {
                console.error('❌ Error analizando pantalla de poker:', error);
            }
        }, 3000); // 3 segundos entre análisis para no saturar CPU

        return () => clearInterval(analysisInterval);
    }, [enabled, isActive, debugMode]);

    return {
        situation,
        decision,
        isActive,
        setIsActive,
        updateSituation
    };
}

/**
 * Formatea decisión GTO para síntesis de voz
 */
function formatDecisionToSpeech(decision: GTODecision): string {
    const { action, size, reasoning } = decision;

    let speech = '';

    switch (action) {
        case 'raise':
        case 'bet':
            speech = size
                ? `${action === 'raise' ? 'Sube' : 'Apuesta'} a ${size.toFixed(0)} dólares.`
                : `${action === 'raise' ? 'Sube' : 'Apuesta'}.`;
            break;
        case 'call':
            speech = 'Iguala.';
            break;
        case 'check':
            speech = 'Pasa.';
            break;
        case 'fold':
            speech = 'Tira.';
            break;
    }

    // Agregar razonamiento breve
    if (reasoning) {
        speech += ` ${reasoning}`;
    }

    return speech;
}
