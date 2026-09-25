/**
 * IdentityBadge — Indicador de identidad biométrica
 *
 * Estados:
 *   🔵 "Aprendiendo voz..." — Nova está capturando pasivamente
 *   🟢 "Deyios · 94%"      — Identificado con confianza
 *   ⚪ "Escuchando..."     — Tiene perfil pero no detecta al usuario aún
 */

import React, { useEffect, useRef, useState } from 'react';
import type { SpeakerResult, EnrollmentProgress } from '../utils/identityEngine';
import type { FaceSpeakerResult } from '../hooks/useFaceIdentity';

interface IdentityBadgeProps {
    currentSpeaker: SpeakerResult | null;
    isLearning: boolean;
    learningProgress: EnrollmentProgress;
    hasVoiceProfile: boolean;
    userName: string;
    /** Callback para re-aprender la voz */
    onReLearn?: () => void;
    // Reconocimiento facial
    faceResult?: FaceSpeakerResult | null;
    isLearningFace?: boolean;
    hasFaceProfile?: boolean;
    onReLearnFace?: () => void;
}

export const IdentityBadge: React.FC<IdentityBadgeProps> = ({
    currentSpeaker,
    isLearning,
    learningProgress,
    hasVoiceProfile,
    userName,
    onReLearn,
    faceResult,
    isLearningFace,
    hasFaceProfile,
    onReLearnFace,
}) => {
    const [justIdentified, setJustIdentified] = useState(false);
    const [showTooltip, setShowTooltip] = useState(false);
    const lastPersonRef = useRef<string | null>(null);
    const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animación cuando identifica
    useEffect(() => {
        if (currentSpeaker && currentSpeaker.person.id !== lastPersonRef.current) {
            lastPersonRef.current = currentSpeaker.person.id;
            setJustIdentified(true);
            setTimeout(() => setJustIdentified(false), 2500);
        }
    }, [currentSpeaker]);

    const handleMouseEnter = () => {
        if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current);
        setShowTooltip(true);
    };
    const handleMouseLeave = () => {
        tooltipTimerRef.current = setTimeout(() => setShowTooltip(false), 400);
    };

    // ── Estado 1: Aprendiendo voz automáticamente ──
    if (isLearning) {
        const pct = Math.round((learningProgress.samplesCollected / learningProgress.samplesNeeded) * 100);
        const secs = learningProgress.secondsOfSpeech;

        return (
            <div
                style={s.container}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                title={`Nova está aprendiendo tu voz... (${secs}s de habla capturados)`}
            >
                <div style={{ ...s.badge, ...s.learningBadge }}>
                    <div style={s.row}>
                        <span style={s.learningDot} />
                        <span style={s.learningLabel}>Aprendiendo voz</span>
                        <span style={s.learningPct}>{pct}%</span>
                    </div>
                    <div style={s.progressTrack}>
                        <div style={{ ...s.progressFill, width: `${pct}%` }} />
                    </div>
                </div>
                {showTooltip && (
                    <div style={s.tooltip}>
                        Nova está capturando tu voz en segundo plano.<br />
                        Seguí hablando con normalidad — se guarda solo.
                    </div>
                )}
            </div>
        );
    }

    // ── Estado 2: Identificado (voz) ──
    if (currentSpeaker) {
        const confPct = Math.round(currentSpeaker.confidence * 100);
        const confColor = confPct >= 85 ? '#34d399' : confPct >= 72 ? '#fbbf24' : '#f87171';
        const faceConfPct = faceResult ? Math.round(faceResult.confidence * 100) : null;

        return (
            <div
                style={s.container}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div style={{
                    ...s.badge,
                    ...s.identifiedBadge,
                    ...(justIdentified ? s.pingGlow : {}),
                }}>
                    <div style={s.row}>
                        <div style={{ ...s.dot, background: confColor }} />
                        <span style={s.name}>{currentSpeaker.person.name}</span>
                        <div style={s.indicators}>
                            <span style={{ ...s.conf, color: confColor }} title="Confianza voz">🎙️{confPct}%</span>
                            {faceConfPct !== null && (
                                <span style={{ ...s.conf, color: '#a78bfa' }} title="Confianza facial">👁️{faceConfPct}%</span>
                            )}
                        </div>
                    </div>
                </div>
                {showTooltip && (
                    <div style={s.tooltip}>
                        🎙️ Voz: {confPct}% · {faceConfPct !== null ? `👁️ Cara: ${faceConfPct}%` : hasFaceProfile ? '👁️ Cara: escaneando...' : '👁️ Cara: aprendiendo...'}
                        <div style={{ display: 'flex', gap: '4px', marginTop: '2px' }}>
                            {onReLearn && (
                                <button style={s.reLearnBtn} onClick={onReLearn}>↺ Voz</button>
                            )}
                            {onReLearnFace && (
                                <button style={s.reLearnBtn} onClick={onReLearnFace}>↺ Cara</button>
                            )}
                        </div>
                    </div>
                )}
            </div>
        );
    }

    // ── Estado 3: Tiene perfil de voz pero no detecta ──
    if (hasVoiceProfile) {
        return (
            <div
                style={s.container}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
                title="Nova reconoce tu voz — habla para identificarte"
            >
                <div style={{ ...s.badge, ...s.waitingBadge }}>
                    <div style={s.row}>
                        <span style={s.dimDot} />
                        <span style={s.dimLabel}>🎙️ {userName}</span>
                        {hasFaceProfile && <span style={s.dimLabel}>· 👁️</span>}
                        {isLearningFace && <span style={{ ...s.dimLabel, color: '#a78bfa' }}>· 👁️ aprendiendo...</span>}
                    </div>
                </div>
            </div>
        );
    }

    // ── Estado 4: Solo cara aprendida, voz pendiente ──
    if (hasFaceProfile || isLearningFace) {
        return (
            <div
                style={s.container}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
            >
                <div style={{ ...s.badge, ...s.learningBadge }}>
                    <div style={s.row}>
                        <span style={{ ...s.learningDot, background: '#a78bfa' }} />
                        <span style={{ ...s.learningLabel, color: '#c4b5fd' }}>
                            {isLearningFace ? '👁️ Aprendiendo cara...' : `👁️ ${userName}`}
                        </span>
                    </div>
                </div>
            </div>
        );
    }

    return null;
};

// ──────────────────────────────────────────────
// Estilos
// ──────────────────────────────────────────────

const s: Record<string, React.CSSProperties> = {
    container: {
        position: 'relative',
        display: 'inline-flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        zIndex: 60,
    },
    badge: {
        display: 'flex',
        flexDirection: 'column',
        gap: '4px',
        padding: '5px 9px',
        borderRadius: '8px',
        backdropFilter: 'blur(14px)',
        fontSize: '11px',
        lineHeight: 1.3,
        transition: 'all 0.3s ease',
        cursor: 'default',
    },
    // Aprendiendo
    learningBadge: {
        background: 'rgba(59, 130, 246, 0.10)',
        border: '1px solid rgba(96, 165, 250, 0.30)',
    },
    learningDot: {
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: '#60a5fa',
        animation: 'pulse 1.2s ease-in-out infinite',
        flexShrink: 0,
    },
    learningLabel: {
        color: '#93c5fd',
        fontWeight: 500,
        flex: 1,
    },
    learningPct: {
        color: '#60a5fa',
        fontWeight: 700,
        fontSize: '10px',
    },
    progressTrack: {
        height: '3px',
        borderRadius: '2px',
        background: 'rgba(255,255,255,0.07)',
        overflow: 'hidden',
    },
    progressFill: {
        height: '100%',
        borderRadius: '2px',
        background: 'linear-gradient(90deg, #3b82f6, #60a5fa)',
        transition: 'width 0.4s ease',
    },
    // Identificado
    identifiedBadge: {
        background: 'rgba(16, 185, 129, 0.10)',
        border: '1px solid rgba(52, 211, 153, 0.30)',
        boxShadow: '0 0 10px rgba(52, 211, 153, 0.06)',
    },
    pingGlow: {
        boxShadow: '0 0 18px rgba(52, 211, 153, 0.45)',
        border: '1px solid rgba(52, 211, 153, 0.65)',
    },
    dot: {
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        flexShrink: 0,
    },
    name: {
        color: '#d1fae5',
        fontWeight: 600,
        flex: 1,
        letterSpacing: '0.01em',
    },
    conf: {
        fontWeight: 700,
        fontSize: '10px',
    },
    indicators: {
        display: 'flex',
        gap: '4px',
        alignItems: 'center',
        flexShrink: 0,
    },
    // Esperando
    waitingBadge: {
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.07)',
    },
    dimDot: {
        display: 'inline-block',
        width: '5px',
        height: '5px',
        borderRadius: '50%',
        background: 'rgba(255,255,255,0.2)',
        flexShrink: 0,
    },
    dimLabel: {
        color: 'rgba(255,255,255,0.3)',
        fontSize: '10px',
    },
    // Comunes
    row: {
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
        minWidth: '100px',
    },
    // Tooltip
    tooltip: {
        position: 'absolute' as const,
        top: 'calc(100% + 6px)',
        right: 0,
        background: 'rgba(5,8,20,0.95)',
        border: '1px solid rgba(255,255,255,0.10)',
        borderRadius: '8px',
        padding: '8px 12px',
        fontSize: '11px',
        color: 'rgba(255,255,255,0.7)',
        whiteSpace: 'nowrap' as const,
        backdropFilter: 'blur(16px)',
        boxShadow: '0 8px 24px rgba(0,0,0,0.6)',
        zIndex: 999,
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '6px',
        lineHeight: 1.5,
    },
    reLearnBtn: {
        background: 'rgba(255,255,255,0.07)',
        border: '1px solid rgba(255,255,255,0.12)',
        borderRadius: '5px',
        color: 'rgba(255,255,255,0.5)',
        fontSize: '10px',
        padding: '3px 8px',
        cursor: 'pointer',
        fontWeight: 500,
        alignSelf: 'flex-start' as const,
    },
};

export default IdentityBadge;
