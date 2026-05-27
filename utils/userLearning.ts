/**
 * userLearning.ts - Sistema de aprendizaje de Nova
 * 
 * CAMBIO CRÍTICO: localStorage era la fuente de verdad → ahora es solo CACHÉ.
 * Toda escritura va a Supabase (via MemoryService) con embedding semántico.
 * localStorage se mantiene como caché de arranque rápido para no bloquear la UI.
 */

import { addFact, searchFacts } from '../services/MemoryService';

export interface LearnedItem {
    id: string;
    category: 'like' | 'dislike' | 'interest' | 'fact' | 'person' | 'habit';
    content: string;
    learnedAt: number;
    confidence: number; // 0-1
}

export interface UserProfile {
    likes: string[];
    dislikes: string[];
    interests: string[];
    facts: string[];
    habits: string[];
    learnedItems: LearnedItem[];
}

const STORAGE_KEY = 'nova-user-profile';

// ============ CACHÉ LOCAL (solo lectura inicial) ============

export function getDefaultUserProfile(): UserProfile {
    return {
        likes: [],
        dislikes: [],
        interests: [],
        facts: [],
        habits: [],
        learnedItems: []
    };
}

/** Lee el caché de localStorage (solo para arranque rápido de la UI). */
export function loadUserProfile(): UserProfile {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) return JSON.parse(stored);
    } catch (e) {
        console.warn('Error leyendo caché de perfil:', e);
    }
    return getDefaultUserProfile();
}

/** Escribe el caché de localStorage. */
function saveUserProfileCache(profile: UserProfile): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
        console.error('Error guardando caché de perfil:', e);
    }
}

// ============ ESCRITURA (siempre a Supabase + caché) ============

/**
 * Aprende un nuevo ítem:
 * 1. Evita duplicados localmente (caché).
 * 2. Guarda en Supabase con embedding semántico (no bloquea la UI).
 * 3. Actualiza el caché local.
 *
 * @returns El perfil actualizado inmediatamente (optimistic update).
 */
export function addLearnedItem(
    profile: UserProfile,
    category: LearnedItem['category'],
    content: string
): UserProfile {
    // Verificar duplicado en caché local
    const exists = profile.learnedItems.some(
        item => item.category === category && item.content.toLowerCase() === content.toLowerCase()
    );

    if (exists) {
        console.log('🧠 Ya lo sabía:', content);
        return profile;
    }

    const newItem: LearnedItem = {
        id: `learn_${Date.now()}`,
        category,
        content,
        learnedAt: Date.now(),
        confidence: 0.8
    };

    const updatedProfile = { ...profile };
    updatedProfile.learnedItems = [...profile.learnedItems, newItem];

    // Actualizar listas categorizadas
    switch (category) {
        case 'like':     updatedProfile.likes = [...profile.likes, content]; break;
        case 'dislike':  updatedProfile.dislikes = [...profile.dislikes, content]; break;
        case 'interest': updatedProfile.interests = [...profile.interests, content]; break;
        case 'fact':     updatedProfile.facts = [...profile.facts, content]; break;
        case 'habit':    updatedProfile.habits = [...profile.habits, content]; break;
    }

    // 1. Guardar caché local (síncrono, instantáneo)
    saveUserProfileCache(updatedProfile);

    // 2. Persistir en Supabase con embedding (asíncrono, no bloquea)
    const supabaseCategory = category === 'person' ? 'fact' : category;
    addFact(content, supabaseCategory as any).catch(err =>
        console.error('❌ Error persistiendo en Supabase:', err)
    );

    console.log('🧠 ¡Aprendido y guardado en la nube!', category, content);
    return updatedProfile;
}

export function removeLearnedItem(profile: UserProfile, itemId: string): UserProfile {
    const item = profile.learnedItems.find(i => i.id === itemId);
    if (!item) return profile;

    const updatedProfile = { ...profile };
    updatedProfile.learnedItems = profile.learnedItems.filter(i => i.id !== itemId);

    const removeFromList = (list: string[], content: string) =>
        list.filter(i => i.toLowerCase() !== content.toLowerCase());

    switch (item.category) {
        case 'like':     updatedProfile.likes = removeFromList(profile.likes, item.content); break;
        case 'dislike':  updatedProfile.dislikes = removeFromList(profile.dislikes, item.content); break;
        case 'interest': updatedProfile.interests = removeFromList(profile.interests, item.content); break;
        case 'fact':     updatedProfile.facts = removeFromList(profile.facts, item.content); break;
        case 'habit':    updatedProfile.habits = removeFromList(profile.habits, item.content); break;
    }

    saveUserProfileCache(updatedProfile);
    // Nota: el borrado en Supabase se hace desde el panel de admin o directamente
    return updatedProfile;
}

export function forgetByContent(profile: UserProfile, content: string): UserProfile {
    const item = profile.learnedItems.find(
        i => i.content.toLowerCase().includes(content.toLowerCase())
    );
    if (item) {
        console.log('🧠 Olvidando:', item.content);
        return removeLearnedItem(profile, item.id);
    }
    return profile;
}

// ============ BÚSQUEDA SEMÁNTICA (RAG) ============

/**
 * Busca recuerdos relevantes usando embeddings semánticos.
 * Inyectar el resultado en el system prompt de Gemini justo antes de cada turno.
 *
 * Ejemplo de uso en App.tsx:
 *   const memories = await recallRelevantContext("cómo muevo el brazo");
 *   systemInstruction += "\n\nRECUERDOS RELEVANTES:\n" + memories;
 */
export async function recallRelevantContext(query: string, limit: number = 5): Promise<string> {
    const results = await searchFacts(query, limit);
    if (results.length === 0) return '';

    return results.map((r, i) => `${i + 1}. ${r}`).join('\n');
}

// ============ RESUMEN PARA SYSTEM PROMPT ============

export function generateProfileSummary(profile: UserProfile): string {
    const parts: string[] = [];

    if (profile.likes.length > 0)
        parts.push(`Le gusta: ${profile.likes.slice(0, 5).join(', ')}`);
    if (profile.dislikes.length > 0)
        parts.push(`No le gusta: ${profile.dislikes.slice(0, 5).join(', ')}`);
    if (profile.interests.length > 0)
        parts.push(`Intereses: ${profile.interests.slice(0, 5).join(', ')}`);
    if (profile.facts.length > 0)
        parts.push(`Datos: ${profile.facts.slice(0, 5).join(', ')}`);
    if (profile.habits.length > 0)
        parts.push(`Hábitos: ${profile.habits.slice(0, 3).join(', ')}`);

    return parts.length > 0
        ? parts.join('. ') + '.'
        : 'Aún no he aprendido nada sobre el usuario.';
}
