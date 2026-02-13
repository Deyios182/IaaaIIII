import React from 'react';
import { GrokConsultResponse } from '../services/grokConsultant';
import './SecondOpinionPanel.css';

interface SecondOpinionPanelProps {
    isVisible: boolean;
    isLoading: boolean;
    userQuestion: string;
    geminiResponse: string;
    grokResponse: GrokConsultResponse | null;
    onClose: () => void;
    onUseGrokResponse?: () => void;
}

export const SecondOpinionPanel: React.FC<SecondOpinionPanelProps> = ({
    isVisible,
    isLoading,
    userQuestion,
    geminiResponse,
    grokResponse,
    onClose,
    onUseGrokResponse
}) => {
    if (!isVisible) return null;

    return (
        <div className="second-opinion-overlay">
            <div className="second-opinion-panel">
                {/* Header */}
                <div className="panel-header">
                    <h3>🧠 Segunda Opinión con Grok</h3>
                    <button className="close-btn" onClick={onClose}>✕</button>
                </div>

                {/* Pregunta Original */}
                <div className="question-section">
                    <div className="section-label">Tu Pregunta:</div>
                    <div className="question-text">{userQuestion}</div>
                </div>

                {/* Loading State */}
                {isLoading && (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Consultando con Grok...</p>
                    </div>
                )}

                {/* Comparación de Respuestas */}
                {!isLoading && grokResponse && (
                    <>
                        {/* Análisis de Grok */}
                        <div className="analysis-section">
                            <div className="section-label">📊 Análisis de Grok:</div>
                            <div className="analysis-text">{grokResponse.analysis}</div>
                        </div>

                        {/* Comparación Lado a Lado */}
                        <div className="comparison-grid">
                            {/* Respuesta de Gemini */}
                            <div className="response-card gemini-card">
                                <div className="card-header">
                                    <span className="provider-icon">⚡</span>
                                    <span className="provider-name">Gemini</span>
                                </div>
                                <div className="response-content">
                                    {geminiResponse}
                                </div>
                                <div className="card-footer">
                                    <span className="badge">Actual</span>
                                </div>
                            </div>

                            {/* Respuesta de Grok */}
                            <div className="response-card grok-card">
                                <div className="card-header">
                                    <span className="provider-icon">🧠</span>
                                    <span className="provider-name">Grok</span>
                                    <span className="confidence-badge">
                                        {grokResponse.confidence}% confianza
                                    </span>
                                </div>
                                <div className="response-content">
                                    {grokResponse.alternativeResponse}
                                </div>
                                <div className="card-footer">
                                    <span className="badge alternative">Alternativa</span>
                                    {onUseGrokResponse && (
                                        <button
                                            className="use-response-btn"
                                            onClick={onUseGrokResponse}
                                        >
                                            Usar esta respuesta
                                        </button>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Razonamiento de Grok */}
                        <div className="reasoning-section">
                            <details>
                                <summary>💭 Ver razonamiento detallado</summary>
                                <div className="reasoning-text">{grokResponse.reasoning}</div>
                            </details>
                        </div>
                    </>
                )}

                {/* Error State */}
                {!isLoading && !grokResponse && (
                    <div className="error-state">
                        <p>⚠️ No se pudo obtener respuesta de Grok</p>
                    </div>
                )}
            </div>
        </div>
    );
};
