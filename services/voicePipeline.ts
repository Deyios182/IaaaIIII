/**
 * Voice Pipeline Service
 * 
 * Orquesta el flujo STT → Modelo IA → TTS para modelos que no tienen voz nativa.
 * Permite cambiar entre diferentes "cerebros" (Grok, GPT-4, Claude) manteniendo voz.
 */

import { startContinuousRecognition } from './sttService';
import { speakText, stopSpeech } from './ttsService';
import { consultGrok, AVAILABLE_MODELS, type AIConsultRequest } from './grokConsultant';

export type BrainModel = 'gemini-live' | 'grok' | 'gpt4o' | 'claude';

export interface VoicePipelineConfig {
    brain: BrainModel;
    onTranscription?: (text: string) => void;
    onResponse?: (text: string) => void;
    onError?: (error: Error) => void;
    conversationHistory?: Array<{ sender: string; text: string }>;
    getCameraFrame?: () => string; // Función para capturar frame visual
}

/**
 * Clase principal del pipeline de voz
 */
export class VoicePipeline {
    private config: VoicePipelineConfig;
    private isProcessing: boolean = false;
    private sttCleanup: (() => void) | null = null;

    constructor(config: VoicePipelineConfig) {
        this.config = config;
    }

    /**
     * Inicia el reconocimiento continuo de voz
     */
    start(): void {
        console.log(`🎤 Iniciando pipeline con ${this.config.brain}...`);

        // Iniciar reconocimiento continuo
        this.sttCleanup = startContinuousRecognition(
            (transcript) => this.handleTranscript(transcript),
            (error) => {
                console.error('❌ Error STT:', error);
                if (this.config.onError) {
                    this.config.onError(error);
                }
            },
            'es-ES'
        );
    }

    /**
     * Maneja la transcripción recibida
     */
    private async handleTranscript(userText: string): Promise<void> {
        if (this.isProcessing) {
            console.warn('⚠️ Ya hay un procesamiento en curso, ignorando...');
            return;
        }

        if (!userText || userText.trim().length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            console.log(`✅ Transcripción: "${userText}"`);

            if (this.config.onTranscription) {
                this.config.onTranscription(userText);
            }

            // 2. Procesamiento con modelo IA
            console.log(`🧠 Procesando con ${this.config.brain}...`);

            // Capturar frame visual si está disponible
            const visualContext = this.config.getCameraFrame ? this.config.getCameraFrame() : undefined;

            const aiResponse = await this.processWithBrain(userText, visualContext);

            console.log(`✅ Respuesta: "${aiResponse.substring(0, 100)}..."`);

            if (this.config.onResponse) {
                this.config.onResponse(aiResponse);
            }

            // 3. Text-to-Speech (Síntesis de voz)
            console.log('🔊 Sintetizando voz...');
            speakText(aiResponse, {
                language: 'es-ES',
                rate: 1.0,
                pitch: 1.0
            });

        } catch (error: any) {
            console.error('❌ Error en pipeline:', error);

            if (this.config.onError) {
                this.config.onError(error);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    /**
     * Procesa texto con el modelo seleccionado
     */
    private async processWithBrain(
        userText: string,
        visualContext?: string
    ): Promise<string> {
        const modelId = this.getModelId(this.config.brain);

        const request: AIConsultRequest = {
            userQuestion: userText,
            visualContext,
            conversationHistory: this.config.conversationHistory,
            model: modelId
        };

        const response = await consultGrok(request);
        return response.alternativeResponse;
    }

    /**
     * Mapea brain a model ID de OpenRouter
     */
    private getModelId(brain: BrainModel): string {
        switch (brain) {
            case 'grok':
                return AVAILABLE_MODELS.GROK_4_1_FAST;
            case 'gpt4o':
                return AVAILABLE_MODELS.GPT4O;
            case 'claude':
                return AVAILABLE_MODELS.CLAUDE_SONNET;
            default:
                return AVAILABLE_MODELS.GROK_4_1_FAST;
        }
    }

    /**
     * Actualiza la configuración del pipeline
     */
    updateConfig(config: Partial<VoicePipelineConfig>): void {
        this.config = { ...this.config, ...config };
    }

    /**
     * Detiene el pipeline y limpia recursos
     */
    stop(): void {
        console.log('🛑 Deteniendo pipeline...');

        // Detener STT
        if (this.sttCleanup) {
            this.sttCleanup();
            this.sttCleanup = null;
        }

        // Detener TTS
        stopSpeech();

        this.isProcessing = false;
    }

    /**
     * Verifica si está procesando
     */
    get processing(): boolean {
        return this.isProcessing;
    }
}

/**
 * Helper: Crea un pipeline de voz con configuración por defecto
 */
export function createVoicePipeline(
    brain: BrainModel,
    callbacks: {
        onTranscription?: (text: string) => void;
        onResponse?: (text: string) => void;
        onError?: (error: Error) => void;
        getCameraFrame?: () => string;
    } = {}
): VoicePipeline {
    return new VoicePipeline({
        brain,
        ...callbacks
    });
}
