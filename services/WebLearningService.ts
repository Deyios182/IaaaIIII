/**
 * WebLearningService — Búsqueda Web Real + Aprendizaje de Habilidades
 *
 * BÚSQUEDA: Usa DuckDuckGo Instant Answer API (gratis, sin key).
 * La búsqueda NUNCA se ejecuta automáticamente — siempre requiere
 * confirmación explícita del usuario.
 *
 * SKILLS: Permite a Nova aprender comportamientos personalizados
 * que persisten entre sesiones en Supabase (tabla nova_skills).
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

// ============ TIPOS ============

export interface SearchResult {
    title: string;
    snippet: string;
    url?: string;
}

export interface WebSearchPending {
    id: string;
    query: string;
    requestedAt: number;
    confirmed: boolean | null; // null = esperando, true = confirmado, false = cancelado
}

export interface NovaSkill {
    id?: string;
    user_id?: string;
    trigger_phrase: string;  // "cuando diga X" o "modo trabajo"
    behavior: string;        // "sé más seria y reduce tu energía"
    learned_at?: string;
}

// ============ BÚSQUEDA WEB ============

/**
 * Busca en DuckDuckGo Instant Answer API.
 * Gratis, sin key, sin límite de uso estricto.
 * Devuelve un resumen conciso listo para que Nova lo lea.
 */
/**
 * Busca en internet usando múltiples motores con fallback automático.
 *
 * Motor 1: DuckDuckGo HTML (via proxy CORS-libre)   — resultados reales
 * Motor 2: DuckDuckGo Instant Answer API            — respuestas directas
 * Motor 3: OpenRouter AI (si hay API key)            — responde desde conocimiento
 *
 * Siempre devuelve algo útil para Nova.
 */
export async function searchDuckDuckGo(query: string): Promise<string> {
    console.log('🔍 [WebSearch] Buscando:', query);

    // ─── Motor 1: DuckDuckGo via allorigins proxy (resultados HTML reales) ───
    try {
        const ddgUrl = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}&kl=es-es`;
        const proxyUrl = `https://api.allorigins.win/get?url=${encodeURIComponent(ddgUrl)}`;

        const res = await fetch(proxyUrl, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
            const json = await res.json();
            const html: string = json?.contents || '';

            // Extraer snippets de resultados (<a class="result__snippet">)
            const snippets: string[] = [];
            const titleRe = /class="result__a"[^>]*>([^<]+)<\/a>/g;
            const snippetRe = /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;

            const titles: string[] = [];
            let m: RegExpExecArray | null;
            while ((m = titleRe.exec(html)) !== null && titles.length < 5) {
                titles.push(m[1].replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&#x27;/g,"'").trim());
            }
            while ((m = snippetRe.exec(html)) !== null && snippets.length < 5) {
                const snip = m[1]
                    .replace(/<[^>]+>/g, '')
                    .replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&nbsp;/g,' ').replace(/&#x27;/g,"'")
                    .trim();
                if (snip.length > 20) snippets.push(snip);
            }

            if (snippets.length > 0) {
                const results = snippets.slice(0, 4).map((s, i) => `${titles[i] ? `**${titles[i]}**\n` : ''}${s}`).join('\n\n');
                console.log(`✅ [WebSearch] DuckDuckGo HTML: ${snippets.length} resultados`);
                return `Resultados web para "${query}":\n\n${results}`;
            }
        }
    } catch (e: any) {
        console.warn('[WebSearch] DDG HTML falló:', e.message);
    }

    // ─── Motor 2: DuckDuckGo Instant Answer API (respuestas directas) ───
    try {
        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
        if (res.ok) {
            const data = await res.json();
            const parts: string[] = [];
            if (data.AbstractText?.trim()) parts.push(data.AbstractText);
            if (data.Answer?.trim()) parts.push(data.Answer);
            if (data.Definition?.trim() && !parts.length) parts.push(data.Definition);
            if (!parts.length && data.RelatedTopics?.length > 0) {
                const topics = data.RelatedTopics.filter((t: any) => t.Text).slice(0, 3).map((t: any) => `• ${t.Text}`);
                if (topics.length > 0) parts.push(...topics);
            }
            if (parts.length > 0) {
                console.log(`✅ [WebSearch] DDG Instant: respuesta directa`);
                return parts.join('\n');
            }
        }
    } catch (e: any) {
        console.warn('[WebSearch] DDG Instant falló:', e.message);
    }

    // ─── Motor 3: OpenRouter AI fallback (responde desde su conocimiento) ───
    const openRouterKey = (import.meta as any).env?.VITE_OPENROUTER_API_KEY;
    if (openRouterKey) {
        const FREE_MODELS_FAST = [
            'deepseek/deepseek-v4-flash-0731:free', // DeepSeek V4 Flash — rápido
            'qwen/qwen3.8-27b:free',            // Qwen3.8 27B — fallback
            'google/gemma-4-31b-it:free'        // Gemma 4 31B — calidad
        ];

        console.log('[WebSearch] Usando OpenRouter como fallback para:', query);
        for (const model of FREE_MODELS_FAST) {
            try {
                const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${openRouterKey}`,
                        'HTTP-Referer': 'https://nova-ai.local',
                        'X-Title': 'Nova AI Search',
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        model,
                        messages: [{
                            role: 'user',
                            content: `Responde esta búsqueda en español de forma concisa y útil (máximo 200 palabras). Si es algo reciente y no tienes datos, indícalo claramente pero da todo lo que sepas:\n\n"${query}"`
                        }],
                        temperature: 0.3,
                        max_tokens: 300
                    }),
                    signal: AbortSignal.timeout(10000)
                });
                if (res.ok) {
                    const data = await res.json();
                    const answer = data.choices?.[0]?.message?.content?.trim();
                    if (answer && answer.length > 20) {
                        console.log(`✅ [WebSearch] OpenRouter respondió con ${model} (${answer.length} chars)`);
                        return `[IA] ${answer}`;
                    }
                }
            } catch (e: any) {
                console.warn(`[WebSearch] OpenRouter ${model} falló:`, e.message);
            }
        }
    }

    return `Busqué "${query}" pero no pude obtener resultados en este momento. Intenta con términos diferentes o verifica tu conexión a internet.`;
}


// ============ GESTIÓN DE BÚSQUEDAS PENDIENTES ============

// Estado en memoria de búsquedas esperando confirmación
let pendingSearches: Map<string, WebSearchPending> = new Map();

/**
 * Registra una intención de búsqueda pendiente de confirmación.
 * Devuelve el ID de la búsqueda para que la UI lo muestre.
 */
export function requestWebSearch(query: string): WebSearchPending {
    const pending: WebSearchPending = {
        id: `search_${Date.now()}`,
        query,
        requestedAt: Date.now(),
        confirmed: null,
    };
    pendingSearches.set(pending.id, pending);
    console.log(`🔍 [WebLearning] Búsqueda pendiente registrada: "${query}" (id: ${pending.id})`);
    return pending;
}

/**
 * Confirma o cancela una búsqueda pendiente.
 * Si se confirma, ejecuta la búsqueda y devuelve el resultado.
 * Si se cancela, devuelve null.
 */
export async function resolveWebSearch(
    searchId: string,
    confirmed: boolean
): Promise<string | null> {
    const pending = pendingSearches.get(searchId);
    if (!pending) {
        console.warn('⚠️ [WebLearning] ID de búsqueda no encontrado:', searchId);
        return null;
    }

    pendingSearches.delete(searchId);

    if (!confirmed) {
        console.log('🚫 [WebLearning] Búsqueda cancelada por el usuario:', pending.query);
        return null;
    }

    // Ejecutar búsqueda real
    return await searchDuckDuckGo(pending.query);
}

/**
 * Obtiene todas las búsquedas pendientes de confirmación.
 * Usado por la UI del Dashboard para mostrar los chips de confirmación.
 */
export function getPendingSearches(): WebSearchPending[] {
    return Array.from(pendingSearches.values());
}

// ============ SKILLS (HABILIDADES APRENDIDAS) ============

/**
 * Guarda una nueva habilidad que Nova aprendió del usuario en Supabase.
 */
export async function learnSkill(
    triggerPhrase: string,
    behavior: string
): Promise<NovaSkill | null> {
    if (!isSupabaseConfigured()) {
        console.warn('⚠️ [WebLearning] Supabase no configurado — skill no guardado');
        return null;
    }

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || '11111111-1111-1111-1111-111111111111';

        const { data, error } = await supabase
            .from('nova_skills')
            .insert({
                user_id: userId,
                trigger_phrase: triggerPhrase.trim(),
                behavior: behavior.trim(),
            })
            .select()
            .single();

        if (error) {
            console.error('❌ [WebLearning] Error guardando skill:', error);
            return null;
        }

        console.log(`✅ [WebLearning] Habilidad aprendida: "${triggerPhrase}" → "${behavior}"`);
        return data;
    } catch (err: any) {
        console.error('❌ [WebLearning] Excepción en learnSkill:', err.message);
        return null;
    }
}

/**
 * Obtiene todas las habilidades aprendidas del usuario desde Supabase.
 */
export async function getLearnedSkills(): Promise<NovaSkill[]> {
    if (!isSupabaseConfigured()) return [];

    try {
        const { data: { user } } = await supabase.auth.getUser();
        const userId = user?.id || '11111111-1111-1111-1111-111111111111';

        const { data, error } = await supabase
            .from('nova_skills')
            .select('*')
            .eq('user_id', userId)
            .order('learned_at', { ascending: false });

        if (error) {
            console.error('❌ [WebLearning] Error cargando skills:', error);
            return [];
        }

        return data || [];
    } catch (err: any) {
        console.error('❌ [WebLearning] Excepción en getLearnedSkills:', err.message);
        return [];
    }
}

/**
 * Construye el bloque de habilidades aprendidas para inyectar en el system prompt.
 */
export function buildSkillsBlock(skills: NovaSkill[], userName: string = 'el usuario'): string {
    if (!skills || skills.length === 0) return '';

    const lines: string[] = [];
    lines.push(`\nHABILIDADES PERSONALIZADAS QUE APRENDISTE DE ${userName.toUpperCase()}:`);
    lines.push('(Aplica estas reglas automáticamente cuando detectes el trigger)');

    skills.forEach(skill => {
        lines.push(`  • Cuando "${skill.trigger_phrase}" → ${skill.behavior}`);
    });

    lines.push('');
    lines.push('Si el usuario te enseña algo nuevo, usa la herramienta "learnSkill" para guardarlo.');
    lines.push('Confirma con: "Listo, lo aprendí. [resumen de lo aprendido]"');

    return lines.join('\n');
}

/**
 * SQL para crear la tabla nova_skills en Supabase.
 * Ejecutar una sola vez desde el panel de Supabase SQL Editor.
 *
 * CREATE TABLE nova_skills (
 *   id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
 *   user_id UUID NOT NULL,
 *   trigger_phrase TEXT NOT NULL,
 *   behavior TEXT NOT NULL,
 *   learned_at TIMESTAMPTZ DEFAULT now()
 * );
 * ALTER TABLE nova_skills ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "Users own their skills" ON nova_skills
 *   FOR ALL USING (auth.uid() = user_id);
 */

export default {
    searchDuckDuckGo,
    requestWebSearch,
    resolveWebSearch,
    getPendingSearches,
    learnSkill,
    getLearnedSkills,
    buildSkillsBlock,
};
