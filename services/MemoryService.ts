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

// ============ HIPOCAMPO VECTORIAL ============

/**
 * Convierte un texto en un vector matemático de 768 dimensiones.
 * Esto permite que Nova entienda "significado" en lugar de solo palabras exactas.
 * Modelo: text-embedding-004 (Google, gratuito en el tier actual).
 */
async function generateEmbedding(text: string): Promise<number[] | null> {
    try {
        const apiKey = (import.meta as any).env?.VITE_GEMINI_API_KEY
            || process.env.VITE_GEMINI_API_KEY
            || process.env.API_KEY;

        if (!apiKey) {
            console.warn('⚠️ No API key para embeddings');
            return null;
        }

        const ai = new GoogleGenAI({ apiKey });
        const response = await (ai.models as any).embedContent({
            model: 'gemini-embedding-001',
            contents: text,
        });

        return response.embeddings?.[0]?.values || null;
    } catch (error) {
        console.warn('⚠️ Error generando embedding (continuando sin él):', error);
        return null;
    }
}

// ============ FACTS ============

/**
 * Guarda un recuerdo en Supabase con su embedding semántico.
 * Si la generación del embedding falla, el hecho se guarda igual (sin vector).
 */
export const addFact = async (content: string, category: Fact['category']): Promise<Fact | null> => {
    if (!isSupabaseConfigured()) {
        console.warn('Supabase no configurado, omitiendo guardado en la nube');
        return null;
    }

    const userId = await getCurrentUserId();

    // Generar el vector semántico antes de guardar
    const embedding = await generateEmbedding(content);

    const payload: any = { user_id: userId, content, category };
    if (embedding) payload.embedding = embedding;

    const { data, error } = await supabase
        .from('nova_facts')
        .insert(payload)
        .select()
        .single();

    if (error) {
        console.error('Error adding fact:', error);
        return null;
    }

    console.log(`🧠 Recuerdo ${embedding ? 'semántico' : 'literal'} guardado:`, content);
    return data;
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
}

export const loadAllMemory = async (): Promise<LoadedMemory> => {
    console.log('☁️ Cargando memoria desde Supabase...');

    const [facts, knownPeople, recentMemories, pendingReminders] = await Promise.all([
        getFacts(),
        getKnownPeople(),
        getRecentMemories(20),
        getPendingReminders()
    ]);

    const likes = facts.filter(f => f.category === 'like').map(f => f.content);
    const dislikes = facts.filter(f => f.category === 'dislike').map(f => f.content);
    const interests = facts.filter(f => f.category === 'interest').map(f => f.content);

    console.log(`✅ Memoria cargada: ${facts.length} facts, ${knownPeople.length} personas, ${recentMemories.length} memories, ${pendingReminders.length} reminders`);

    return { facts, likes, dislikes, interests, knownPeople, recentMemories, pendingReminders };
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
