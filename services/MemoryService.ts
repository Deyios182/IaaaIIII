/**
 * Memory Service - CRUD para Memoria Persistente con Supabase
 * Maneja: facts, known_people, memories, reminders
 */
import { supabase, isSupabaseConfigured } from './supabaseClient';

// function to get current user ID
const getCurrentUserId = async (): Promise<string> => {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) return user.id;
    return (import.meta as any).env?.VITE_USER_ID || process.env.VITE_USER_ID || '11111111-1111-1111-1111-111111111111';
};

// ============ TYPES ============

export interface Fact {
    id?: string;
    user_id?: string;
    content: string;
    category: 'like' | 'dislike' | 'interest' | 'habit' | 'fact';
    learned_at?: string;
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

// ============ FACTS ============

export const addFact = async (content: string, category: Fact['category']): Promise<Fact | null> => {
    if (!isSupabaseConfigured()) {
        console.warn('Supabase not configured, skipping cloud save');
        return null;
    }

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('facts')
        .insert({ user_id: userId, content, category })
        .select()
        .single();

    if (error) {
        console.error('Error adding fact:', error);
        return null;
    }
    console.log('✅ Fact saved to Supabase:', content);
    return data;
};

export const getFacts = async (): Promise<Fact[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('facts')
        .select('*')
        .eq('user_id', userId)
        .order('learned_at', { ascending: false });

    if (error) {
        console.error('Error fetching facts:', error);
        return [];
    }
    return data || [];
};

// ============ KNOWN PEOPLE ============

export const addKnownPerson = async (person: Omit<KnownPerson, 'id' | 'user_id'>): Promise<KnownPerson | null> => {
    if (!isSupabaseConfigured()) return null;

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('known_people')
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
        .from('known_people')
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
        .from('known_people')
        .update({ last_seen: new Date().toISOString() })
        .eq('id', personId);
};

export const deleteKnownPerson = async (personId: string): Promise<void> => {
    if (!isSupabaseConfigured()) return;
    const { error } = await supabase
        .from('known_people')
        .delete()
        .eq('id', personId);
    if (error) console.error('Error deleting person:', error);
    else console.log('🗑️ Person deleted from Supabase:', personId);
};

export const upsertKnownPerson = async (person: any): Promise<KnownPerson | null> => {
    if (!isSupabaseConfigured()) return null;
    const userId = await getCurrentUserId();

    // Map frontend camelCase to DB snake_case
    const dbPayload = {
        id: person.id,
        user_id: userId,
        name: person.name,
        relationship: person.relationship,
        visual_description: person.visual_description || person.visualDescription,
        voice_description: person.voice_description || person.voiceDescription,
        // CRITICAL FIX: Convert Float32Array to regular Array for JSON compatibility
        face_descriptor: (person.face_descriptor || person.faceDescriptor)
            ? Array.from(person.face_descriptor || person.faceDescriptor)
            : null,
        photo_data: person.photo_data || person.photoData,
        is_unknown: person.is_unknown !== undefined ? person.is_unknown : person.isUnknown,
        last_seen: person.last_seen || (person.lastSeen ? new Date(person.lastSeen).toISOString() : new Date().toISOString())
    };

    const { data, error } = await supabase
        .from('known_people')
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
        .from('memories')
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

// Save an important conversation moment
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

    // Categorize facts
    const likes = facts.filter(f => f.category === 'like').map(f => f.content);
    const dislikes = facts.filter(f => f.category === 'dislike').map(f => f.content);
    const interests = facts.filter(f => f.category === 'interest').map(f => f.content);
    const generalFacts = facts.filter(f => f.category === 'fact').map(f => f.content);

    console.log(`✅ Memoria cargada: ${facts.length} facts, ${knownPeople.length} personas, ${recentMemories.length} memories, ${pendingReminders.length} reminders`);

    return {
        facts,
        likes,
        dislikes,
        interests,
        knownPeople,
        recentMemories,
        pendingReminders
    };
};

export const getRecentMemories = async (limit: number = 50): Promise<Memory[]> => {
    if (!isSupabaseConfigured()) return [];

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('memories')
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

export const searchFacts = async (query: string): Promise<string[]> => {
    if (!isSupabaseConfigured()) return [];
    console.log('🔍 Buscando en Supabase:', query);

    const userId = await getCurrentUserId();
    const { data: facts } = await supabase
        .from('facts')
        .select('content')
        .eq('user_id', userId)
        .ilike('content', `%${query}%`)
        .limit(5);

    return facts?.map(f => f.content) || [];
};

// ============ REMINDERS ============

export const addReminder = async (message: string, triggerTime: Date): Promise<Reminder | null> => {
    if (!isSupabaseConfigured()) return null;

    const userId = await getCurrentUserId();
    const { data, error } = await supabase
        .from('reminders')
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
        .from('reminders')
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
        .from('reminders')
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

    console.log('☁️ Syncing local data to Supabase...');

    // Sync facts
    if (localData.facts) {
        for (const fact of localData.facts) {
            await addFact(fact, 'fact');
        }
    }

    // Sync preferences
    if (localData.likes) {
        for (const like of localData.likes) {
            await addFact(like, 'like');
        }
    }
    if (localData.dislikes) {
        for (const dislike of localData.dislikes) {
            await addFact(dislike, 'dislike');
        }
    }
    if (localData.interests) {
        for (const interest of localData.interests) {
            await addFact(interest, 'interest');
        }
    }

    // Sync known people
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

    console.log('✅ Sync complete!');
};

export default {
    addFact,
    getFacts,
    addKnownPerson,
    getKnownPeople,
    updatePersonLastSeen,
    saveMemory,
    getRecentMemories,
    addReminder,
    getPendingReminders,
    completeReminder,
    syncLocalToCloud
};
