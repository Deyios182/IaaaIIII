// Utilidad para el sistema de aprendizaje de Nova
// Permite almacenar y recuperar preferencias del usuario

export interface LearnedItem {
    id: string;
    category: 'like' | 'dislike' | 'interest' | 'fact' | 'person' | 'habit';
    content: string;
    learnedAt: number;
    confidence: number; // 0-1, qué tan segura está Nova de esto
}

export interface UserProfile {
    likes: string[];
    dislikes: string[];
    interests: string[];
    facts: string[]; // Datos sobre el usuario (ej: "Trabaja en IT")
    habits: string[]; // Patrones (ej: "Suele hablar por las noches")
    learnedItems: LearnedItem[];
}

const STORAGE_KEY = 'nova-user-profile';

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

export function loadUserProfile(): UserProfile {
    try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            return JSON.parse(stored);
        }
    } catch (e) {
        console.warn('Error loading user profile:', e);
    }
    return getDefaultUserProfile();
}

export function saveUserProfile(profile: UserProfile): void {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
    } catch (e) {
        console.error('Error saving user profile:', e);
    }
}

export function addLearnedItem(
    profile: UserProfile,
    category: LearnedItem['category'],
    content: string
): UserProfile {
    // Evitar duplicados
    const exists = profile.learnedItems.some(
        item => item.category === category && item.content.toLowerCase() === content.toLowerCase()
    );

    if (exists) {
        console.log('🧠 Ya sabía esto:', content);
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
    updatedProfile.learnedItems.push(newItem);

    // También añadir a las listas categorizadas
    switch (category) {
        case 'like':
            updatedProfile.likes.push(content);
            break;
        case 'dislike':
            updatedProfile.dislikes.push(content);
            break;
        case 'interest':
            updatedProfile.interests.push(content);
            break;
        case 'fact':
            updatedProfile.facts.push(content);
            break;
        case 'habit':
            updatedProfile.habits.push(content);
            break;
    }

    console.log('🧠 ¡Aprendí algo nuevo!', category, content);
    saveUserProfile(updatedProfile);
    return updatedProfile;
}

export function removeLearnedItem(profile: UserProfile, itemId: string): UserProfile {
    const item = profile.learnedItems.find(i => i.id === itemId);
    if (!item) return profile;

    const updatedProfile = { ...profile };
    updatedProfile.learnedItems = profile.learnedItems.filter(i => i.id !== itemId);

    // Remover de listas categorizadas
    const removeFromList = (list: string[], content: string) =>
        list.filter(i => i.toLowerCase() !== content.toLowerCase());

    switch (item.category) {
        case 'like':
            updatedProfile.likes = removeFromList(profile.likes, item.content);
            break;
        case 'dislike':
            updatedProfile.dislikes = removeFromList(profile.dislikes, item.content);
            break;
        case 'interest':
            updatedProfile.interests = removeFromList(profile.interests, item.content);
            break;
        case 'fact':
            updatedProfile.facts = removeFromList(profile.facts, item.content);
            break;
        case 'habit':
            updatedProfile.habits = removeFromList(profile.habits, item.content);
            break;
    }

    saveUserProfile(updatedProfile);
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

export function generateProfileSummary(profile: UserProfile): string {
    const parts: string[] = [];

    if (profile.likes.length > 0) {
        parts.push(`Le gusta: ${profile.likes.slice(0, 5).join(', ')}`);
    }
    if (profile.dislikes.length > 0) {
        parts.push(`No le gusta: ${profile.dislikes.slice(0, 5).join(', ')}`);
    }
    if (profile.interests.length > 0) {
        parts.push(`Intereses: ${profile.interests.slice(0, 5).join(', ')}`);
    }
    if (profile.facts.length > 0) {
        parts.push(`Datos: ${profile.facts.slice(0, 5).join(', ')}`);
    }
    if (profile.habits.length > 0) {
        parts.push(`Hábitos: ${profile.habits.slice(0, 3).join(', ')}`);
    }

    return parts.length > 0
        ? parts.join('. ') + '.'
        : 'Aún no he aprendido nada sobre el usuario.';
}
