/**
 * AI Consultant Service (via OpenRouter)
 * 
 * Proporciona funcionalidad de "segunda opinión" usando OpenRouter para acceder
 * a múltiples modelos de IA (Grok, Claude, GPT-4, etc.).
 * Se usa durante videollamadas para obtener respuestas alternativas sin interrumpir
 * la conversación principal con Gemini Live.
 */

export interface AIConsultRequest {
    userQuestion: string;
    geminiResponse?: string;
    visualContext?: string; // Base64 image
    conversationHistory?: Array<{ sender: string; text: string }>;
    model?: string; // Modelo a usar (default: grok-beta)
}

export interface AIConsultResponse {
    analysis: string;
    alternativeResponse: string;
    reasoning: string;
    confidence: number;
    modelUsed: string;
}

// Modelos disponibles en OpenRouter
export const AVAILABLE_MODELS = {
    GROK_4_1_FAST: 'x-ai/grok-4.1-fast', // 🚀 Más nuevo (2025), agentic, menos censura
    GROK_2_MINI: 'x-ai/grok-2-mini', // 💰 Más barato y rápido
    GROK_BETA: 'x-ai/grok-beta', // Experimental, más contexto
    GROK_2: 'x-ai/grok-2', // Flagship con mejor razonamiento
    GROK_2_1212: 'x-ai/grok-2-1212', // Versión mejorada
    GROK_VISION: 'x-ai/grok-vision-beta', // Con capacidad visual
    GPT4_TURBO: 'openai/gpt-4-turbo',
    GPT4O: 'openai/gpt-4o',
    CLAUDE_SONNET: 'anthropic/claude-3.5-sonnet',
    CLAUDE_OPUS: 'anthropic/claude-3-opus',
    GEMINI_PRO: 'google/gemini-pro-1.5'
} as const;

/**
 * Consulta a un modelo de IA a través de OpenRouter para obtener una segunda opinión
 */
export async function consultGrok(request: AIConsultRequest): Promise<AIConsultResponse> {
    // En Vite, las variables de entorno se acceden con import.meta.env
    const apiKey = import.meta.env.VITE_OPENROUTER_API_KEY;

    if (!apiKey) {
        throw new Error('VITE_OPENROUTER_API_KEY no configurada. Agrega tu API key de OpenRouter al archivo .env con el prefijo VITE_');
    }

    const selectedModel = request.model || AVAILABLE_MODELS.GROK_4_1_FAST; // 🚀 Grok 4.1 Fast (más nuevo, agentic)

    try {
        // Construir prompt completo
        let fullPrompt = '';

        // Agregar historial reciente si existe
        if (request.conversationHistory && request.conversationHistory.length > 0) {
            const recentHistory = request.conversationHistory.slice(-5)
                .map(m => `${m.sender === 'user' ? 'Usuario' : 'Nova'}: ${m.text}`)
                .join('\n');

            fullPrompt += `Historial reciente:\n${recentHistory}\n\n`;
        }

        // Agregar pregunta actual y respuesta de Gemini
        fullPrompt += `Contexto: Eres un asesor AI que proporciona segundas opiniones sobre conversaciones.

Usuario preguntó: "${request.userQuestion}"
`;

        if (request.geminiResponse) {
            fullPrompt += `\nRespuesta de Gemini: "${request.geminiResponse}"\n`;
        }

        fullPrompt += `\nProporciona:
1. Un análisis breve de la pregunta
2. Tu propia respuesta alternativa (como si fueras Nova, una IA compañera coqueta y atenta)
3. Tu razonamiento
4. Tu nivel de confianza (0-100)

Formato de respuesta esperado:
ANÁLISIS: [tu análisis]
RESPUESTA: [tu respuesta]
RAZONAMIENTO: [tu razonamiento]
CONFIANZA: [número]`;

        if (request.visualContext) {
            fullPrompt += '\n\n(Considera también la imagen de contexto visual proporcionada)';
        }

        // Preparar mensajes
        const messages: any[] = [
            {
                role: 'system',
                content: 'Eres un asesor inteligente que proporciona análisis profundos y respuestas alternativas.'
            },
            {
                role: 'user',
                content: fullPrompt
            }
        ];

        // Si hay imagen, usar formato multimodal (solo para modelos compatibles)
        if (request.visualContext && (selectedModel.includes('gpt-4') || selectedModel.includes('claude') || selectedModel.includes('gemini'))) {
            messages[1] = {
                role: 'user',
                content: [
                    {
                        type: 'text',
                        text: fullPrompt
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: `data:image/jpeg;base64,${request.visualContext}`
                        }
                    }
                ]
            };
        }

        // Llamar a OpenRouter API
        const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://nova-ai.local', // Requerido por OpenRouter
                'X-Title': 'Nova AI Assistant', // Opcional pero recomendado
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: selectedModel,
                messages: messages,
                temperature: 0.7,
                max_tokens: 1000
            })
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(`OpenRouter API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }

        const data = await response.json();
        const aiText = data.choices?.[0]?.message?.content || '';

        // Parsear la respuesta estructurada
        const parsed = parseAIResponse(aiText);

        return {
            ...parsed,
            modelUsed: selectedModel
        };
    } catch (error: any) {
        console.error('Error consultando a OpenRouter:', error);
        throw new Error(`No pude consultar al modelo de IA: ${error.message}`);
    }
}

/**
 * Parsea la respuesta del modelo en formato estructurado
 */
function parseAIResponse(text: string): Omit<AIConsultResponse, 'modelUsed'> {
    const analysisMatch = text.match(/ANÁLISIS:\s*(.+?)(?=RESPUESTA:|$)/s);
    const responseMatch = text.match(/RESPUESTA:\s*(.+?)(?=RAZONAMIENTO:|$)/s);
    const reasoningMatch = text.match(/RAZONAMIENTO:\s*(.+?)(?=CONFIANZA:|$)/s);
    const confidenceMatch = text.match(/CONFIANZA:\s*(\d+)/);

    return {
        analysis: analysisMatch?.[1]?.trim() || 'Sin análisis disponible',
        alternativeResponse: responseMatch?.[1]?.trim() || text.trim(),
        reasoning: reasoningMatch?.[1]?.trim() || 'Sin razonamiento disponible',
        confidence: confidenceMatch ? parseInt(confidenceMatch[1]) : 70
    };
}

/**
 * Versión simplificada para consultas rápidas
 */
export async function quickAIConsult(question: string, imageContext?: string, model?: string): Promise<string> {
    const result = await consultGrok({
        userQuestion: question,
        visualContext: imageContext,
        model: model
    });

    return result.alternativeResponse;
}

// Mantener compatibilidad con nombre anterior
export type GrokConsultRequest = AIConsultRequest;
export type GrokConsultResponse = AIConsultResponse;
