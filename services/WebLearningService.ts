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
export async function searchDuckDuckGo(query: string): Promise<string> {
    try {
        console.log('🔍 [WebLearning] Buscando en DuckDuckGo:', query);

        const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
        const response = await fetch(url, {
            headers: { 'Accept': 'application/json' }
        });

        if (!response.ok) {
            return `No pude obtener resultados para "${query}" (error HTTP ${response.status})`;
        }

        const data = await response.json();

        const parts: string[] = [];

        // Respuesta directa (AbstractText)
        if (data.AbstractText && data.AbstractText.trim()) {
            parts.push(data.AbstractText);
            if (data.AbstractURL) {
                parts.push(`Fuente: ${data.AbstractURL}`);
            }
        }

        // Respuesta de tipo "Answer" (ej. cálculos, conversiones)
        if (data.Answer && data.Answer.trim()) {
            parts.push(data.Answer);
        }

        // Definición (para búsquedas de palabras/conceptos)
        if (data.Definition && data.Definition.trim() && !parts.length) {
            parts.push(data.Definition);
            if (data.DefinitionURL) {
                parts.push(`Fuente: ${data.DefinitionURL}`);
            }
        }

        // Resultados relacionados (RelatedTopics)
        if (!parts.length && data.RelatedTopics?.length > 0) {
            const topics = data.RelatedTopics
                .filter((t: any) => t.Text)
                .slice(0, 3)
                .map((t: any) => `• ${t.Text}`);
            if (topics.length > 0) {
                parts.push('Resultados relacionados:');
                parts.push(...topics);
            }
        }

        if (parts.length === 0) {
            return `Busqué "${query}" pero no encontré una respuesta directa. Intenta con términos más específicos.`;
        }

        const result = parts.join('\n');
        console.log(`✅ [WebLearning] Resultado encontrado (${result.length} chars)`);
        return result;

    } catch (error: any) {
        console.error('❌ [WebLearning] Error en búsqueda:', error);
        return `No pude realizar la búsqueda ahora mismo (${error.message || 'error de red'})`;
    }
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
