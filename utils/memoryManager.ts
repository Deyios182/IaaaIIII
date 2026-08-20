/**
 * Memory Manager - Sistema de Memoria Persistente para Nova Desktop
 * Almacena hechos, conversaciones, recordatorios y preferencias en archivo JSON
 */

export interface Reminder {
    id: string;
    message: string;
    triggerTime: number; // Unix timestamp
    created: number;
    completed: boolean;
}

export interface ConversationMemory {
    id: string;
    timestamp: number;
    userMessage: string;
    aiResponse: string;
    emotion?: string;
    important?: boolean; // Marcar conversaciones importantes
}

export interface NovaMemory {
    version: number;
    userName: string;

    // Datos del usuario
    facts: string[]; // "Trabaja como programador", "Tiene un gato llamado Luna"
    likes: string[]; // "Le gusta el café", "Ama los videojuegos"
    dislikes: string[]; // "No le gusta madrugar"
    interests: string[]; // "Programación", "Gaming", "Anime"

    // Recordatorios
    reminders: Reminder[];

    // Historial de conversaciones importantes
    conversations: ConversationMemory[];

    // Estadísticas
    totalConversations: number;
    firstInteraction: number;
    lastInteraction: number;

    // Patrones detectados
    activeHours: number[]; // Horas del día más activas (0-23)
    commonTopics: string[]; // Temas más frecuentes
}

const MEMORY_KEY = 'nova-persistent-memory';

// Memoria por defecto
export function getDefaultMemory(): NovaMemory {
    return {
        version: 1,
        userName: 'Usuario',
        facts: [],
        likes: [],
        dislikes: [],
        interests: [],
        reminders: [],
        conversations: [],
        totalConversations: 0,
        firstInteraction: Date.now(),
        lastInteraction: Date.now(),
        activeHours: [],
        commonTopics: []
    };
}

// Cargar memoria desde localStorage (compatible con Electron y browser)
export function loadMemory(): NovaMemory {
    try {
        const stored = localStorage.getItem(MEMORY_KEY);
        if (stored) {
            const memory = JSON.parse(stored) as NovaMemory;
            console.log('🧠 Memoria cargada:', memory.facts.length, 'hechos,', memory.reminders.length, 'recordatorios');
            return memory;
        }
    } catch (e) {
        console.warn('Error loading memory:', e);
    }
    return getDefaultMemory();
}

// Guardar memoria
export function saveMemory(memory: NovaMemory): void {
    try {
        memory.lastInteraction = Date.now();
        localStorage.setItem(MEMORY_KEY, JSON.stringify(memory));
        console.log('💾 Memoria guardada');
    } catch (e) {
        console.error('Error saving memory:', e);
    }
}

// Añadir un hecho sobre el usuario
export function addFact(memory: NovaMemory, fact: string): NovaMemory {
    if (memory.facts.some(f => f.toLowerCase() === fact.toLowerCase())) {
        return memory; // Ya existe
    }
    const updated = { ...memory, facts: [...memory.facts, fact] };
    saveMemory(updated);
    console.log('🧠 Nuevo hecho aprendido:', fact);
    return updated;
}

// Añadir preferencia (gusto, disgusto, interés)
export function addPreference(memory: NovaMemory, type: 'like' | 'dislike' | 'interest' | 'habit', value: string): NovaMemory {
    let updated = { ...memory };

    // Normalizar
    const val = value.trim();
    if (!val) return memory;

    if (type === 'like') {
        if (!memory.likes.some(l => l.toLowerCase() === val.toLowerCase())) {
            updated.likes = [...memory.likes, val];
            console.log('❤️ Nuevo gusto aprendido:', val);
        }
    } else if (type === 'dislike') {
        if (!memory.dislikes.some(d => d.toLowerCase() === val.toLowerCase())) {
            updated.dislikes = [...memory.dislikes, val];
            console.log('💔 Nuevo disgusto aprendido:', val);
        }
    } else if (type === 'interest') {
        if (!memory.interests.some(i => i.toLowerCase() === val.toLowerCase())) {
            updated.interests = [...memory.interests, val];
            console.log('🌟 Nuevo interés aprendido:', val);
        }
    } else if (type === 'habit') { // Guardar hábitos como facts por ahora, o crear campo nuevo
        const habitFact = `Tiene el hábito de: ${val}`;
        return addFact(memory, habitFact);
    }

    saveMemory(updated);
    return updated;
}

// Añadir recordatorio
export function addReminder(memory: NovaMemory, message: string, triggerTime: number): NovaMemory {
    const reminder: Reminder = {
        id: `rem_${Date.now()}`,
        message,
        triggerTime,
        created: Date.now(),
        completed: false
    };
    const updated = { ...memory, reminders: [...memory.reminders, reminder] };
    saveMemory(updated);
    console.log('⏰ Recordatorio creado:', message, 'para', new Date(triggerTime).toLocaleString());
    return updated;
}

// Marcar recordatorio como completado
export function completeReminder(memory: NovaMemory, reminderId: string): NovaMemory {
    const updated = {
        ...memory,
        reminders: memory.reminders.map(r =>
            r.id === reminderId ? { ...r, completed: true } : r
        )
    };
    saveMemory(updated);
    return updated;
}

// Obtener recordatorios pendientes activos (y auto-archivar vencidos)
export function getPendingReminders(memory: NovaMemory): Reminder[] {
    const now = Date.now();
    const fiveMinutesMs = 5 * 60 * 1000;
    let modified = false;

    const activeReminders: Reminder[] = [];
    const updatedReminders = memory.reminders.map(r => {
        if (!r.completed && r.triggerTime < (now - fiveMinutesMs)) {
            modified = true;
            return { ...r, completed: true };
        }
        if (!r.completed) {
            activeReminders.push(r);
        }
        return r;
    });

    if (modified) {
        saveMemory({ ...memory, reminders: updatedReminders });
    }

    return activeReminders;
}

// Guardar una conversación importante
export function saveConversation(
    memory: NovaMemory,
    userMessage: string,
    aiResponse: string,
    important = false
): NovaMemory {
    // Solo guardar conversaciones importantes o cada 10ma conversación
    if (!important && memory.totalConversations % 10 !== 0) {
        return { ...memory, totalConversations: memory.totalConversations + 1 };
    }

    const convo: ConversationMemory = {
        id: `conv_${Date.now()}`,
        timestamp: Date.now(),
        userMessage: userMessage.slice(0, 200), // Limitar longitud
        aiResponse: aiResponse.slice(0, 500),
        important
    };

    // Mantener solo las últimas 50 conversaciones
    const conversations = [...memory.conversations, convo].slice(-50);

    const updated = {
        ...memory,
        conversations,
        totalConversations: memory.totalConversations + 1
    };
    saveMemory(updated);
    return updated;
}

// Actualizar hora activa (para patrones)
export function updateActiveHour(memory: NovaMemory): NovaMemory {
    const hour = new Date().getHours();
    const activeHours = [...new Set([...memory.activeHours, hour])].slice(-24);
    const updated = { ...memory, activeHours };
    saveMemory(updated);
    return updated;
}

// Generar resumen de memoria para el system prompt de Gemini
export function generateMemorySummary(memory: NovaMemory): string {
    const parts: string[] = [];

    if (memory.userName && memory.userName !== 'Usuario') {
        parts.push(`El usuario se llama ${memory.userName}.`);
    }

    if (memory.facts.length > 0) {
        parts.push(`Datos importantes: ${memory.facts.slice(0, 10).join('. ')}`);
    }

    if (memory.likes.length > 0) {
        parts.push(`Le gusta: ${memory.likes.slice(0, 5).join(', ')}`);
    }

    if (memory.dislikes.length > 0) {
        parts.push(`No le gusta: ${memory.dislikes.slice(0, 5).join(', ')}`);
    }

    if (memory.interests.length > 0) {
        parts.push(`Intereses: ${memory.interests.slice(0, 5).join(', ')}`);
    }

    const pendingReminders = getPendingReminders(memory);
    if (pendingReminders.length > 0) {
        parts.push(`⏰ Recordatorios pendientes: ${pendingReminders.map(r => r.message).join(', ')}`);
    }

    // Estadísticas de interacción
    const daysSinceFirst = Math.floor((Date.now() - memory.firstInteraction) / (1000 * 60 * 60 * 24));
    if (daysSinceFirst > 0) {
        parts.push(`Llevas ${daysSinceFirst} días interactuando con el usuario (${memory.totalConversations} conversaciones).`);
    }

    return parts.length > 0
        ? `[MEMORIA DEL USUARIO]\n${parts.join('\n')}\n[/MEMORIA]`
        : '';
}

// Detectar hechos aprendibles en el texto (básico)
export function extractLearnableFacts(text: string): { type: 'fact' | 'like' | 'dislike' | 'interest', content: string }[] {
    const facts: { type: 'fact' | 'like' | 'dislike' | 'interest', content: string }[] = [];

    // Patrones simples de detección
    const patterns = [
        { regex: /me llamo (\w+)/i, type: 'fact' as const, template: 'Se llama $1' },
        { regex: /trabajo (?:en|como) (.+?)[\.,]/i, type: 'fact' as const, template: 'Trabaja como $1' },
        { regex: /me gusta (?:mucho )?(.+?)[\.,]/i, type: 'like' as const, template: '$1' },
        { regex: /me encanta (.+?)[\.,]/i, type: 'like' as const, template: '$1' },
        { regex: /no me gusta (.+?)[\.,]/i, type: 'dislike' as const, template: '$1' },
        { regex: /odio (.+?)[\.,]/i, type: 'dislike' as const, template: '$1' },
        { regex: /tengo un(?:a)? (\w+ llamad[oa] \w+)/i, type: 'fact' as const, template: 'Tiene un/a $1' },
        { regex: /mi (\w+) se llama (\w+)/i, type: 'fact' as const, template: 'Su $1 se llama $2' },
    ];

    for (const pattern of patterns) {
        const match = text.match(pattern.regex);
        if (match) {
            let content = pattern.template;
            for (let i = 1; i < match.length; i++) {
                content = content.replace(`$${i}`, match[i]);
            }
            facts.push({ type: pattern.type, content });
        }
    }

    return facts;
}

// Generar saludo según hora y memoria
export function generateGreeting(memory: NovaMemory): string {
    const hour = new Date().getHours();
    const name = memory.userName !== 'Usuario' ? memory.userName : '';

    let greeting = '';
    if (hour >= 5 && hour < 12) {
        greeting = '¡Buenos días';
    } else if (hour >= 12 && hour < 19) {
        greeting = '¡Buenas tardes';
    } else {
        greeting = '¡Buenas noches';
    }

    if (name) {
        greeting += `, ${name}`;
    }
    greeting += '!';

    // Añadir contexto basado en memoria
    const daysSinceLast = Math.floor((Date.now() - memory.lastInteraction) / (1000 * 60 * 60 * 24));
    if (daysSinceLast > 1) {
        greeting += ` ¡Hace ${daysSinceLast} días que no hablamos!`;
    }

    const pending = getPendingReminders(memory);
    if (pending.length > 0) {
        greeting += ` Por cierto, tienes ${pending.length} recordatorio${pending.length > 1 ? 's' : ''} pendiente${pending.length > 1 ? 's' : ''}.`;
    }

    return greeting;
}
