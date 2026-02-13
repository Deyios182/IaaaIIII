/**
 * Poker Overlay Component
 * 
 * Muestra en tiempo real:
 * - Situación detectada (cartas, posición)
 * - Recomendación GTO
 * - Equity y pot odds
 */

import React from 'react';
import { PokerSituation, cardToString } from '../services/pokerVision';
import { GTODecision } from '../services/gtoEngine';

interface PokerOverlayProps {
    situation: PokerSituation | null;
    decision: GTODecision | null;
    isActive: boolean;
    onToggle: () => void;
}

export const PokerOverlay: React.FC<PokerOverlayProps> = ({
    situation,
    decision,
    isActive,
    onToggle
}) => {
    if (!isActive) {
        // Botón flotante para activar
        return (
            <button
                onClick={onToggle}
                className="fixed bottom-4 right-4 z-[300] px-4 py-2 bg-gradient-to-r from-purple-600 to-pink-600 text-white rounded-full shadow-lg hover:scale-105 transition-transform"
            >
                🎴 Poker Assistant
            </button>
        );
    }

    return (
        <div className="fixed top-4 right-4 z-[300] w-80 bg-black/90 backdrop-blur-md border border-purple-500/30 rounded-2xl p-4 shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-bold flex items-center gap-2">
                    <span className="text-2xl">🎴</span>
                    Poker GTO
                </h3>
                <button
                    onClick={onToggle}
                    className="text-white/60 hover:text-white text-xl"
                >
                    ×
                </button>
            </div>

            {/* Situación detectada */}
            {situation && (
                <div className="mb-4 space-y-2">
                    {/* Cartas del héroe */}
                    {situation.heroCards && (
                        <div className="flex items-center gap-2">
                            <span className="text-white/60 text-sm">Hero:</span>
                            <div className="flex gap-1">
                                {situation.heroCards.map((card, i) => (
                                    <div
                                        key={i}
                                        className={`px-2 py-1 rounded text-sm font-mono font-bold ${card.suit === 'h' || card.suit === 'd'
                                                ? 'bg-red-600 text-white'
                                                : 'bg-gray-800 text-white'
                                            }`}
                                    >
                                        {cardToString(card)}
                                    </div>
                                ))}
                            </div>
                            <span className="text-purple-400 text-xs ml-auto">
                                {situation.position}
                            </span>
                        </div>
                    )}

                    {/* Board */}
                    {situation.boardCards.length > 0 && (
                        <div className="flex items-center gap-2">
                            <span className="text-white/60 text-sm">Board:</span>
                            <div className="flex gap-1">
                                {situation.boardCards.map((card, i) => (
                                    <div
                                        key={i}
                                        className={`px-2 py-1 rounded text-sm font-mono font-bold ${card.suit === 'h' || card.suit === 'd'
                                                ? 'bg-red-600 text-white'
                                                : 'bg-gray-800 text-white'
                                            }`}
                                    >
                                        {cardToString(card)}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Pot y Stack */}
                    <div className="flex gap-4 text-sm">
                        <div>
                            <span className="text-white/60">Pot:</span>
                            <span className="text-green-400 ml-1 font-mono">
                                ${situation.pot}
                            </span>
                        </div>
                        <div>
                            <span className="text-white/60">Stack:</span>
                            <span className="text-blue-400 ml-1 font-mono">
                                ${situation.heroStack}
                            </span>
                        </div>
                    </div>

                    {/* Street */}
                    <div className="text-xs text-white/40 capitalize">
                        Street: {situation.street}
                    </div>
                </div>
            )}

            <div className="h-px bg-white/10 my-3"></div>

            {/* Recomendación GTO */}
            {decision ? (
                <div className="space-y-3">
                    {/* Acción principal */}
                    <div
                        className={`p-4 rounded-xl border-2 ${decision.action === 'raise' || decision.action === 'bet'
                                ? 'bg-green-600/20 border-green-500'
                                : decision.action === 'call'
                                    ? 'bg-yellow-600/20 border-yellow-500'
                                    : decision.action === 'check'
                                        ? 'bg-blue-600/20 border-blue-500'
                                        : 'bg-red-600/20 border-red-500'
                            }`}
                    >
                        <div className="text-center">
                            <div className="text-2xl font-black text-white uppercase mb-1">
                                {decision.action}
                            </div>
                            {decision.size && (
                                <div className="text-xl text-white/80 font-mono">
                                    ${decision.size.toFixed(1)}
                                </div>
                            )}
                            <div className="text-xs text-white/60 mt-1">
                                Frequency: {decision.frequency}%
                            </div>
                        </div>
                    </div>

                    {/* Reasoning */}
                    <div className="text-sm text-white/80 bg-white/5 rounded-lg p-3">
                        {decision.reasoning}
                    </div>

                    {/* Stats */}
                    {decision.equity && (
                        <div className="flex justify-between text-xs">
                            <div>
                                <span className="text-white/60">Equity:</span>
                                <span className="text-purple-400 ml-1 font-mono">
                                    {decision.equity.toFixed(1)}%
                                </span>
                            </div>
                            {decision.ev && (
                                <div>
                                    <span className="text-white/60">EV:</span>
                                    <span className="text-green-400 ml-1 font-mono">
                                        +${decision.ev.toFixed(2)}
                                    </span>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            ) : (
                <div className="text-center py-8 text-white/40">
                    <div className="text-3xl mb-2">👀</div>
                    <div className="text-sm">
                        Esperando situación de poker...
                    </div>
                </div>
            )}

            {/* Confianza del detector */}
            {situation && (
                <div className="mt-4 pt-3 border-t border-white/10">
                    <div className="flex items-center gap-2">
                        <div className="flex-1 h-1 bg-white/20 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
                                style={{ width: `${situation.confidence * 100}%` }}
                            />
                        </div>
                        <span className="text-xs text-white/60">
                            {(situation.confidence * 100).toFixed(0)}%
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
