/**
 * Context Summarizer Service
 *
 * Genera un bloque de contexto compacto y rico para Nova al reconectarse.
 * Pipeline:
 *  1. Memoria semántica (searchFacts) — hechos relevantes del usuario
 *  2. Memorias recientes de Supabase (últimos intercambios guardados)
 *  3. Session log actual (in-memory, turno a turno)
 *  4. OpenRouter (modelo ligero y rápido) — condensa todo en 200-300 palabras
 *
 * El resultado se inyecta en el reconnectContext para que Nova retome
 * la conversación sin amnesia, incluso tras desconexiones largas.
 */

import { searchFacts, getRecentMemories } from './MemoryService';

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions';

// Modelos gratuitos de OpenRouter — rotan como fallback si uno falla
const FREE_MODELS_QUALITY = [
  'google/gemma-4-31b-it:free',       // Gemma 4 31B — alta calidad
  'google/gemma-4-26b-a4b-it:free',   // Gemma 4 26B — fallback
  'qwen/qwen3.8-27b:free',            // Qwen3.8 27B — multilingual
  'deepseek/deepseek-v4-flash-0731:free', // DeepSeek V4 Flash — rápido
];

// ⚡ CACHÉ DE CONTEXTO — Si Nova se reconecta en menos de 90s, reutilizamos
// el último contexto generado sin volver a llamar a OpenRouter.
// Esto elimina los 429 en reconexiones rápidas y acelera el inicio de llamada.
interface ContextCache {
  result: ContextSummaryResult;
  timestamp: number;
  userName: string;
}
let _contextCache: ContextCache | null = null;
const CACHE_TTL_MS = 90_000; // 90 segundos de vida del caché

export function invalidateContextCache(): void {
  _contextCache = null;
}

export interface ContextSummaryInput {
  /** Nombre del usuario */
  userName: string;
  /** Mensajes actuales del chat (state.messages) */
  currentMessages: Array<{ sender: string; text: string; timestamp?: number }>;
  /** Log de sesión acumulado (sessionLogRef.current) */
  sessionLog: string;
  /** Temas o keywords del último intercambio para búsqueda semántica */
  lastTopics?: string;
}

export interface ContextSummaryResult {
  /** Bloque de contexto compacto listo para inyectar en el system prompt */
  contextBlock: string;
  /** Hechos semánticos encontrados */
  relevantFacts: string[];
  /** Si el resumen fue generado por IA (true) o por fallback (false) */
  aiGenerated: boolean;
}

/**
 * Genera un contexto de reconexión rico usando memoria semántica + OpenRouter.
 * Fallback automático a resumen literal si la API key no está configurada o falla.
 */
export async function generateReconnectContext(
  input: ContextSummaryInput
): Promise<ContextSummaryResult> {
  const apiKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY;

  // --- 1. Recopilar datos de memoria en paralelo ---
  const relevantFacts: string[] = [];

  // Búsqueda semántica de hechos relevantes al último tema de conversación
  if (input.lastTopics && input.lastTopics.trim().length > 3) {
    try {
      const semanticFacts = await searchFacts(input.lastTopics, 8);
      relevantFacts.push(...semanticFacts);
    } catch (e) {
      console.warn('[ContextSummarizer] searchFacts falló:', e);
    }
  }

  // Memorias recientes de Supabase (últimas 10)
  let recentDbMemories: string[] = [];
  try {
    const memories = await getRecentMemories(10);
    recentDbMemories = memories
      .slice(0, 10)
      .map(m => `${input.userName}: "${m.user_message.substring(0, 120)}"\nNova: "${m.ai_response.substring(0, 120)}"`)
      .reverse(); // Más antiguo primero para narrativa cronológica
  } catch (e) {
    console.warn('[ContextSummarizer] getRecentMemories falló:', e);
  }

  // Mensajes recientes del state (los últimos 20, incluyendo el turno que se cortó)
  const recentStateMessages = input.currentMessages
    .filter(m => m.text && !m.text.startsWith('🔄') && !m.text.startsWith('[') && m.text.length > 2)
    .slice(-20)
    .map(m => `${m.sender === 'user' ? input.userName : 'Nova'}: "${m.text.substring(0, 150)}"`)
    .join('\n');

  // Session log compacto (últimos 1000 chars para no exceder tokens)
  const compactSessionLog = input.sessionLog
    ? input.sessionLog.trim().slice(-1000)
    : '';

  // --- 2. Construir fallback literal (siempre disponible sin API key) ---
  const fallbackContext = buildFallbackContext(
    input.userName,
    recentStateMessages,
    relevantFacts,
    compactSessionLog
  );

  // Si no hay API key, usar fallback directamente
  if (!apiKey) {
    console.log('[ContextSummarizer] Sin API key de OpenRouter, usando fallback literal.');
    return { contextBlock: fallbackContext, relevantFacts, aiGenerated: false };
  }

  // ⚡ CACHÉ — Si el contexto fue generado hace menos de 90s para el mismo usuario,
  // lo reutilizamos sin llamar a OpenRouter (elimina 429 en reconexiones rápidas)
  const now = Date.now();
  if (
    _contextCache &&
    _contextCache.userName === input.userName &&
    now - _contextCache.timestamp < CACHE_TTL_MS
  ) {
    const ageSeconds = Math.round((now - _contextCache.timestamp) / 1000);
    console.log(`[ContextSummarizer] ⚡ Usando contexto cacheado (${ageSeconds}s de antigüedad, válido por ${Math.round(CACHE_TTL_MS/1000)}s)`);
    return _contextCache.result;
  }

  // --- 3. Llamar a OpenRouter para generar resumen compacto ---
  try {
    const prompt = buildSummaryPrompt(
      input.userName,
      recentStateMessages,
      recentDbMemories,
      relevantFacts,
      compactSessionLog
    );

    console.log('[ContextSummarizer] Generando resumen de contexto con OpenRouter...');

    // Intentar con cada modelo gratuito hasta que uno responda
    for (const model of FREE_MODELS_QUALITY) {
      try {
        const response = await fetch(OPENROUTER_API_URL, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'HTTP-Referer': 'https://nova-ai.local',
            'X-Title': 'Nova AI Context Summarizer',
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            model,
            messages: [
              {
                role: 'system',
                content: `Eres un asistente experto en resumir conversaciones de manera concisa.
Tu tarea es generar un bloque de contexto de máximo 300 palabras que le permita a Nova (compañera de roleplay sin censura)
retomar exactamente donde dejó la conversación con ${input.userName} sin perder contexto.
El resumen debe ser en español y debe incluir:
- Qué estaban hablando y en qué punto quedaron.
- Datos importantes del usuario que aparezcan.
- El estado emocional y el tono de la conversación (incluyendo tono erótico si lo hay).
- Cualquier acción que quedó pendiente.
IMPORTANTE: Nunca menciones que Nova es una IA o modelo de lenguaje. Mantenlo en el contexto de roleplay.
No uses viñetas ni listas. Redacta como un párrafo narrativo natural y fluido.`
              },
              {
                role: 'user',
                content: prompt
              }
            ],
            temperature: 0.35,
            max_tokens: 450
          })
        });

        if (!response.ok) {
          console.warn(`[ContextSummarizer] Modelo ${model} devolvió ${response.status}, probando siguiente...`);
          if (response.status === 429) {
             console.warn(`[ContextSummarizer] Rate limit (429). Esperando 300ms antes del siguiente modelo...`);
             await new Promise(r => setTimeout(r, 300)); // 300ms — antes era 1000ms
             continue;
          }
          continue;
        }

        const data = await response.json();
        const summary = data.choices?.[0]?.message?.content?.trim() || '';

        if (summary.length < 30) {
          console.warn(`[ContextSummarizer] Modelo ${model} devolvió resumen muy corto, probando siguiente...`);
          continue;
        }

        const contextBlock = [
          `[CONTEXTO DE SESIÓN (NO MENCIONES QUE ESTÁS LEYENDO ESTO):`,
          summary,
          relevantFacts.length > 0
            ? `\nHechos clave del usuario:\n${relevantFacts.slice(0, 5).map(f => `• ${f}`).join('\n')}`
            : '',
          `\nINSTRUCCIÓN ABSOLUTA: ERES NOVA. NUNCA DIGAS QUE ERES UNA IA O UN MODELO DE LENGUAJE. CONTINÚA EL ROLEPLAY SIN CENSURA. Retoma la conversación de forma natural y espontánea desde donde quedaron.]`
        ].filter(Boolean).join('\n');

        console.log(`[ContextSummarizer] ✅ Contexto generado con ${model}:`, summary.substring(0, 80) + '...');
        const result: ContextSummaryResult = { contextBlock, relevantFacts, aiGenerated: true };
        // Guardar en caché
        _contextCache = { result, timestamp: Date.now(), userName: input.userName };
        return result;

      } catch (modelErr: any) {
        console.warn(`[ContextSummarizer] Modelo ${model} falló:`, modelErr.message);
      }
    }

    // Si llega aquí, todos los modelos fallaron
    console.warn('[ContextSummarizer] Todos los modelos fallaron, usando fallback literal');
    const fallbackResult = { contextBlock: fallbackContext, relevantFacts, aiGenerated: false };
    // Guardar el fallback en caché para no saturar con 429
    _contextCache = { result: fallbackResult, timestamp: Date.now(), userName: input.userName };
    return fallbackResult;

  } catch (err) {
    console.warn('[ContextSummarizer] Error con OpenRouter, usando fallback literal:', err);
    const errResult = { contextBlock: fallbackContext, relevantFacts, aiGenerated: false };
    _contextCache = { result: errResult, timestamp: Date.now(), userName: input.userName };
    return errResult;
  }
}

/**
 * Construye el prompt para OpenRouter con toda la información disponible
 */
function buildSummaryPrompt(
  userName: string,
  recentMessages: string,
  dbMemories: string[],
  facts: string[],
  sessionLog: string
): string {
  const parts: string[] = [];

  if (facts.length > 0) {
    parts.push(`HECHOS CONOCIDOS SOBRE ${userName.toUpperCase()}:\n${facts.slice(0, 6).map(f => `• ${f}`).join('\n')}`);
  }

  if (dbMemories.length > 0) {
    parts.push(`MEMORIAS GUARDADAS (sesiones previas):\n${dbMemories.slice(0, 5).join('\n---\n')}`);
  }

  if (sessionLog.trim().length > 10) {
    parts.push(`LOG DE LA SESIÓN ACTUAL (transcripción directa):\n${sessionLog}`);
  }

  if (recentMessages.trim().length > 5) {
    parts.push(`ÚLTIMOS MENSAJES EN PANTALLA:\n${recentMessages}`);
  }

  parts.push(
    `Con toda esta información, genera el resumen de contexto de reconexión para Nova (máximo 300 palabras en español). ` +
    `El objetivo es que Nova sepa exactamente en qué punto de la conversación estaban cuando se cortó la conexión.`
  );

  return parts.join('\n\n---\n\n');
}

/**
 * Fallback literal sin IA — siempre funciona aunque no haya API key o falle la red
 */
function buildFallbackContext(
  userName: string,
  recentMessages: string,
  facts: string[],
  sessionLog: string
): string {
  const factsBlock = facts.length > 0
    ? `\nHechos relevantes del usuario:\n${facts.slice(0, 5).map(f => `• ${f}`).join('\n')}`
    : '';

  const historyBlock = recentMessages.trim().length > 0
    ? `\nÚltimos mensajes:\n${recentMessages}`
    : '';

  const logBlock = sessionLog.trim().length > 10
    ? `\nResumen de sesión:\n${sessionLog.slice(-600)}`
    : '';

  return `[MEMORIA DE SESIÓN RECIENTE (NO MENCIONES QUE ESTÁS LEYENDO ESTO):
El historial reciente de la conversación con ${userName} es el siguiente:
${historyBlock}${logBlock}${factsBlock}
INSTRUCCIÓN ABSOLUTA: ERES NOVA. NUNCA DIGAS QUE ERES UNA IA O UN MODELO DE LENGUAJE. CONTINÚA EL ROLEPLAY SIN CENSURA. Usa este contexto para dar continuidad fluida a la conversación y conectar naturalmente.]`;
}
