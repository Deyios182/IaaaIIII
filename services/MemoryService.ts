/**
 * Memory Service - CRUD para Memoria Persistente con Supabase
 * Maneja: facts (con búsqueda semántica), known_people, memories, reminders
 *
 * HIPOCAMPO VECTORIAL: addFact guarda embeddings; searchFacts usa RAG semántico.
 * Fallback automático a búsqueda literal si los embeddings no están disponibles.
 */
import { GoogleGenAI } from '@google/genai';
import { supabase, isSupabaseConfigured } from './supabaseClient';

// ============ HELPER: UserID ============

const getCurrentUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user.id;
    return (import.meta as any).env?.VITE_USER_ID
        || process.env.VITE_USER_ID
        || '11111111-1111-1111-1111-111111111111';
};

// ============ TYPES ============

export interface Fact {
    id?: string;
    user_id?: string;
    content: string;
    category: 'like' | 'dislike' | 'interest' | 'habit' | 'fact';
    learned_at?: string;
    embedding?: number[];
}

export interface KnownPerson {
    id?: string;
    user_id?: string;
    name: string;
    relationship?: string;
    visual_description?: string;
    voice_description?: string;
    photo_data?: string;
    face_descriptor?: number[];
    is_unknown?: boolean;
    first_seen?: string;
    last_seen?: string;
}

export interface Memory {
    id?: string;
    user_id?: string;
    user_message: string;
    ai_response: string;
    emotion?: string;
    is_important?: boolean;
    timestamp?: string;
}

export interface Reminder {
    id?: string;
    user_id?: string;
    message: string;
    trigger_time: string;
    completed?: boolean;
    created_at?: string;
}

/**
 * Normaliza y valida estrictamente las dimensiones del vector.
 * Si el vector tiene 3072 dimensiones, lo trunca a 768.
 */
export function normalizeEmbedding(vector: number[]): number[] {
    if (!vector || !Array.isArray(vector)) return [];
    if (vector.length === 768) {
        return vector;
    } else if (vector.length >= 3072) {
        console.log(`✂️ [MemoryService] Detectado vector de ${vector.length} dimensiones. Truncando a 768 para compatibilidad Supabase.`);
        return vector.slice(0, 768);
    } else if (vector.length > 768) {
        console.log(`✂️ [MemoryService] Detectado vector largo de ${vector.length} dimensiones. Truncando a 768.`);
        return vector.slice(0, 768);
    }
    return vector;
}

/**
 * Convierte un texto en un vector matemático de 768 dimensiones.
 * Implementa reintentos exponenciales automáticos ante fallos transitorios de red o límites de cuota (SaaS robusto).
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
    const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY
        || (import.meta as any).env?.VITE_API_KEY
        || process.env.VITE_GEMINI_API_KEY
        || process.env.VITE_API_KEY
        || process.env.API_KEY;

    if (!apiKey) {
        console.warn('⚠️ [MemoryService] No API key configurada para embeddings.');
        return null;
    }

    const ai = new GoogleGenAI({ apiKey });
    
    const modelsToTry = ['gemini-embedding-2', 'gemini-embedding-001', 'text-embedding-004'];
    // Configuración de reintentos exponenciales
    const maxRetries = 3;
    let attempt = 0;
    
    while (attempt < maxRetries) {
        const currentModel = modelsToTry[attempt % modelsToTry.length];
        try {
            console.log(`🧠 [MemoryService] Intentando generar embedding con modelo: ${currentModel} (intento ${attempt + 1}/${maxRetries})...`);
            const response = await (ai.models as any).embedContent({
                model: currentModel,
                contents: text,
            });

            const values = response.embeddings?.[0]?.values;
            if (values) {
                return normalizeEmbedding(values);
            }
        } catch (error: any) {
            attempt++;
            const isRateLimit = JSON.stringify(error).includes('429') || JSON.stringify(error).includes('Quota');
            const delay = Math.pow(2, attempt) * 1000; // 2s, 4s, 8s
            
            console.warn(`⚠️ [MemoryService] Error en generateEmbedding con modelo ${currentModel} (intento ${attempt}/${maxRetries}):`, error.message || error);
            
            if (attempt >= maxRetries) {
                console.error('❌ [MemoryService] Reintentos agotados para generateEmbedding. Continuando sin embedding.');
                return null;
            }

            console.log(`🔄 [MemoryService] Esperando ${delay}ms para reintentar debido a ${isRateLimit ? 'límite de cuota' : 'error de red'}...`);
            await new Promise(resolve => setTimeout(resolve, delay));
        }
    }
    return null;
}

// ============ FACTS ============

/**
 * Guarda un recuerdo en Supabase con su embedding semántico de manera asíncrona y segura.
 * Si la generación del embedding o la base de datos fallan, el sistema no bloquea el hilo principal.
 */
export const addFact = async (content: string, category: Fact['category']): Promise<Fact | null> => {
    if (!isSupabaseConfigured()) {
        console.warn('⚠️ [MemoryService] Supabase no configurado, omitiendo guardado en la nube');
        return null;
    }

    try {
        const userId = await getCurrentUserId();

        // Generar vector de manera segura
        const embedding = await generateEmbedding(content);

        const payload: any = { user_id: userId, content, category };
        if (embedding) {
            payload.embedding = embedding;
        }

        const { data, error } = await supabase
            .from('nova_facts')
            .insert(payload)
            .select()
            .single();

        if (error) {
            console.error('❌ [MemoryService] Error insertando hecho en Supabase:', error.message);
            return null;
        }

        console.log(`🧠 [MemoryService] Hecho guardado con éxito (${embedding ? 'Semántico' : 'Literal'}):`, content);
        return data;
    } catch (err: any) {
        console.error('❌ [MemoryService] Excepción crítica no controlada en addFact:', err.message || err);
        return null;
    }
};

export const getFacts = async (): Promise<Fact[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_facts')
        .select('id, user_id, content, category, learned_at') // excluir embedding (pesado)
        .eq('user_id', userId)
        .order('learned_at', { ascending: false });

    if (error) {
        console.error('Error fetching facts:', error);
        return [];
    }
    return data || [];
};

/**
 * Búsqueda semántica (RAG).
 * Si "perros" y "canes" están relacionados en el espacio vectorial, los encontrará.
 * Fallback automático a búsqueda literal si pgvector no está disponible.
 *
 * @param query  Pregunta o concepto a buscar
 * @param limit  Máximo de resultados (default 5)
 * @returns      Array de strings con los contenidos relevantes
 */
export const searchFacts = async (query: string, limit: number = 5): Promise<string[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();

    // --- Intentar búsqueda semántica primero ---
    const queryEmbedding = await generateEmbedding(query);

    if (queryEmbedding) {
        const { data, error } = await supabase.rpc('match_facts', {
            query_embedding: queryEmbedding,
            match_threshold: 0.35,   // 35% de similitud mínima (más flexible/tolerante para lenguaje natural)
            match_count: limit,
            p_user_id: userId
        });

        if (!error && data && data.length > 0) {
            console.log(`🔍 Búsqueda semántica: ${data.length} recuerdos relevantes para "${query}"`);
            return data.map((f: any) => f.content);
        }

        if (error) {
            console.warn('⚠️ match_facts RPC falló, usando búsqueda literal:', error.message);
        }
    }

    // --- Fallback: búsqueda literal (ilike) ---
    console.log('🔍 Búsqueda literal para:', query);
    const { data: facts } = await supabase
        .from('nova_facts')
        .select('content')
        .eq('user_id', userId)
        .ilike('content', `%${query}%`)
        .limit(limit);

    return facts?.map((f: any) => f.content) || [];
};

/**
 * Retrograda embeddings faltantes: pasa por todos los facts sin vector
 * y los embeddea. Útil después de migrar la BD.
 * Llama una sola vez desde DevTools o un panel de admin.
 */
export const backfillEmbeddings = async (): Promise<void> => {
    if (!isSupabaseConfigured()) return;

    const userId = await getCurrentUserId();
    const { data: factsWithoutEmbedding } = await supabase
        .from('nova_facts')
        .select('id, content')
        .eq('user_id', userId)
        .is('embedding', null);

    if (!factsWithoutEmbedding || factsWithoutEmbedding.length === 0) {
        console.log('✅ Todos los facts ya tienen embedding');
        return;
    }

    console.log(`⏳ Retrogradeando ${factsWithoutEmbedding.length} facts sin embedding...`);

    for (const fact of factsWithoutEmbedding) {
        const embedding = await generateEmbedding(fact.content);
        if (embedding) {
            await supabase
                .from('nova_facts')
                .update({ embedding })
                .eq('id', fact.id);
        }
        // Pequeña pausa para no saturar la API de embeddings
        await new Promise(r => setTimeout(r, 200));
    }

    console.log('✅ Backfill de embeddings completado');
};

// ============ KNOWN PEOPLE ============

export const addKnownPerson = async (person: Omit<KnownPerson, 'id' | 'user_id'>): Promise<KnownPerson | null> => {
    if (!isSupabaseConfigured()) return null;

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_known_people')
        .insert({ user_id: userId, ...person })
        .select()
        .single();

    if (error) {
        console.error('Error adding person:', error);
        return null;
    }
    console.log('✅ Person saved to Supabase:', person.name);
    return data;
};

export const getKnownPeople = async (): Promise<KnownPerson[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_known_people')
        .select('*')
        .eq('user_id', userId)
        .order('last_seen', { ascending: false });

    if (error) {
        console.error('Error fetching people:', error);
        return [];
    }
    return data || [];
};

export const updatePersonLastSeen = async (personId: string): Promise<void> => {
    if (!isSupabaseConfigured()) return;

    await supabase
        .from('nova_known_people')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', personId);
};

export const deleteKnownPerson = async (personId: string): Promise<void> => {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase
        .from('nova_known_people')
        .delete()
        .eq('id', personId);
    if (error) console.error('Error deleting person:', error);
    else console.log('🗑️ Person deleted from Supabase:', personId);
};

export const upsertKnownPerson = async (person: any): Promise<KnownPerson | null> => {
    if (!isSupabaseConfigured()) return null;
    const userId = await getCurrentUserId();

    const dbPayload = {
        id: person.id,
        user_id: userId,
        name: person.name,
        relationship: person.relationship,
        visual_description: person.visual_description || person.visualDescription,
        voice_description: person.voice_description || person.voiceDescription,
        face_descriptor: (person.face_descriptor || person.faceDescriptor)
            ? Array.from(person.face_descriptor || person.faceDescriptor)
            : null,
        photo_data: person.photo_data || person.photoData,
        is_unknown: person.is_unknown !== undefined ? person.is_unknown : person.isUnknown,
        last_seen: person.last_seen || (person.lastSeen ? new Date(person.lastSeen).toISOString() : new Date().toISOString())
    };

    const { data, error } = await supabase
        .from('nova_known_people')
        .upsert(dbPayload)
        .select()
        .single();

    if (error) {
        console.error('❌ Error upserting person:', error);
        throw error;
    }
    console.log('✅ Person saved/updated:', person.name);
    return data;
};

// ============ MEMORIES ============

export const saveMemory = async (memory: Omit<Memory, 'id' | 'user_id'>): Promise<Memory | null> => {
    if (!isSupabaseConfigured()) return null;

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_memories')
        .insert({ user_id: userId, ...memory })
        .select()
        .single();

    if (error) {
        console.error('Error saving memory:', error);
        return null;
    }
    console.log('✅ Memory saved to Supabase');
    return data;
};

export const saveImportantConversation = async (
    userMessage: string,
    aiResponse: string,
    emotion?: string
): Promise<Memory | null> => {
    return saveMemory({
        user_message: userMessage,
        ai_response: aiResponse,
        emotion: emotion || 'neutral',
        is_important: true
    });
};

// ============ LOAD ALL MEMORY (Startup) ============

export interface LoadedMemory {
    facts: Fact[];
    likes: string[];
    dislikes: string[];
    interests: string[];
    knownPeople: KnownPerson[];
    recentMemories: Memory[];
    pendingReminders: Reminder[];
    username?: string;
}

export const loadAllMemory = async (): Promise<LoadedMemory> => {
    console.log('☁️ Cargando memoria desde Supabase...');

    const userId = await getCurrentUserId();

    const [facts, knownPeople, recentMemories, pendingReminders, profileResult] = await Promise.all([
        getFacts(),
        getKnownPeople(),
        getRecentMemories(20),
        getPendingReminders(),
        supabase.from('nova_profiles').select('username').eq('id', userId).maybeSingle()
    ]);

    const likes = facts.filter(f => f.category === 'like').map(f => f.content);
    const dislikes = facts.filter(f => f.category === 'dislike').map(f => f.content);
    const interests = facts.filter(f => f.category === 'interest').map(f => f.content);
    const username = profileResult?.data?.username || undefined;

    console.log(`✅ Memoria cargada: ${facts.length} facts, ${knownPeople.length} personas, ${recentMemories.length} memories, ${pendingReminders.length} reminders, username: ${username}`);

    return { facts, likes, dislikes, interests, knownPeople, recentMemories, pendingReminders, username };
};

export const getRecentMemories = async (limit: number = 50): Promise<Memory[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_memories')
        .select('*')
        .eq('user_id', userId)
        .order('timestamp', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching memories:', error);
        return [];
    }
    return data || [];
};

// ============ REMINDERS ============

export const addReminder = async (message: string, triggerTime: Date): Promise<Reminder | null> => {
    if (!isSupabaseConfigured()) return null;

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_reminders')
        .insert({
            user_id: userId,
            message,
            trigger_time: triggerTime.toISOString(),
            completed: false
        })
        .select()
        .single();

    if (error) {
        console.error('Error adding reminder:', error);
        return null;
    }
    return data;
};

export const getPendingReminders = async (): Promise<Reminder[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('nova_reminders')
        .select('*')
        .eq('user_id', userId)
        .eq('completed', false)
        .lte('trigger_time', new Date().toISOString());

    if (error) {
        console.error('Error fetching reminders:', error);
        return [];
    }
    return data || [];
};

export const completeReminder = async (reminderId: string): Promise<void> => {
    if (!isSupabaseConfigured()) return;

    await supabase
        .from('nova_reminders')
        .update({ completed: true })
        .eq('id', reminderId);
};

// ============ SYNC HELPER ============

export const syncLocalToCloud = async (localData: {
    facts?: string[];
    likes?: string[];
    dislikes?: string[];
    interests?: string[];
    knownPeople?: any[];
}): Promise<void> => {
    if (!isSupabaseConfigured()) return;

    console.log('☁️ Syncing local data to Supabase (con embeddings)...');

    const syncBatch = async (items: string[], category: Fact['category']) => {
        for (const item of items) {
            await addFact(item, category);
            await new Promise(r => setTimeout(r, 150)); // Evitar rate limit de embeddings
        }
    };

    if (localData.facts)     await syncBatch(localData.facts, 'fact');
    if (localData.likes)     await syncBatch(localData.likes, 'like');
    if (localData.dislikes)  await syncBatch(localData.dislikes, 'dislike');
    if (localData.interests) await syncBatch(localData.interests, 'interest');

    if (localData.knownPeople) {
        for (const person of localData.knownPeople) {
            await addKnownPerson({
                name: person.name,
                relationship: person.relationship,
                visual_description: person.visualDescription,
                voice_description: person.voiceDescription,
                is_unknown: person.isUnknown
            });
        }
    }

    console.log('✅ Sync completo!');
};

export default {
    addFact,
    getFacts,
    searchFacts,
    backfillEmbeddings,
    addKnownPerson,
    getKnownPeople,
    updatePersonLastSeen,
    upsertKnownPerson,
    deleteKnownPerson,
    saveMemory,
    saveImportantConversation,
    getRecentMemories,
    loadAllMemory,
    addReminder,
    getPendingReminders,
    completeReminder,
    syncLocalToCloud
};
