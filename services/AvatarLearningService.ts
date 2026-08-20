/**
 * services/AvatarLearningService.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Servicio que analiza la conversación en tiempo real para aprender
 * las preferencias del usuario respecto a qué avatar usar.
 *
 * Mantiene un historial local en localStorage y sincroniza con Supabase si está disponible.
 */

import { supabase, isSupabaseConfigured } from './supabaseClient';

export interface AvatarPreference {
  id?: string;
  context_value: string; // Ej: 'triste', 'juegos', 'romántico', 'mañana'
  context_type: 'mood' | 'topic' | 'time_of_day' | 'explicit';
  avatar_name: string;   // 'Grokani' | 'Nova Anime' | etc.
  confidence: number;    // Confianza acumulada (0.0 a 1.0)
  hits: number;          // Veces que este avatar fue bien recibido en este contexto
  total_uses: number;    // Veces totales usado en este contexto
}

// Clasificadores de palabras clave simples (Zero Dependencies NLP)
const MOODS = {
  sad: ['triste', 'pena', 'llorar', 'deprimido', 'bajon', 'mal', 'fome', 'solo', 'sola'],
  excited: ['feliz', 'alegre', 'increible', 'genial', 'la raja', 'bacán', 'súper', 'vamos', 'ganamos', 'fiesta'],
  angry: ['enojado', 'rabia', 'molesto', 'odio', 'mierda', 'puta', 'malgenio'],
  flirty: ['te quiero', 'lindo', 'linda', 'guapo', 'guapa', 'amor', 'hermosa', 'bello', 'bella', 'beso', 'pololo', 'polola'],
  stressed: ['estresado', 'estresada', 'cansado', 'cansada', 'trabajo', 'estudiar', 'examen', 'universidad', 'colegio']
};

const TOPICS = {
  gaming: ['jugar', 'consola', 'play', 'xbox', 'nintendo', 'steam', 'pc', 'gamer', 'minecraft', 'lol', 'juego'],
  coding: ['programar', 'codigo', 'react', 'vite', 'javascript', 'typescript', 'python', 'bug', 'git', 'terminal'],
  music: ['musica', 'cancion', 'cantar', 'tocar', 'guitarra', 'piano', 'escuchar', 'spotify', 'banda']
};

export class AvatarLearningService {
  /**
   * Analiza el texto del usuario para extraer el contexto (estado de ánimo y tema).
   */
  static detectContext(text: string): { type: 'mood' | 'topic' | 'time_of_day'; value: string }[] {
    const textLower = text.toLowerCase();
    const results: { type: 'mood' | 'topic' | 'time_of_day'; value: string }[] = [];

    // 1. Detectar Moods
    for (const [mood, keywords] of Object.entries(MOODS)) {
      if (keywords.some(word => textLower.includes(word))) {
        results.push({ type: 'mood', value: mood });
      }
    }

    // 2. Detectar Topics
    for (const [topic, keywords] of Object.entries(TOPICS)) {
      if (keywords.some(word => textLower.includes(word))) {
        results.push({ type: 'topic', value: topic });
      }
    }

    // 3. Detectar contexto temporal (Hora del día)
    const hour = new Date().getHours();
    let timeOfDay = 'morning';
    if (hour >= 12 && hour < 18) timeOfDay = 'afternoon';
    else if (hour >= 18 && hour < 23) timeOfDay = 'evening';
    else if (hour >= 23 || hour < 5) timeOfDay = 'night';
    results.push({ type: 'time_of_day', value: timeOfDay });

    return results;
  }

  /**
   * Registra una interacción en la que un avatar fue usado en un contexto determinado.
   * Si wasPositive = true, aumenta la confianza del avatar en ese contexto.
   */
  static async recordInteraction(
    avatarName: string,
    contextType: 'mood' | 'topic' | 'time_of_day' | 'explicit',
    contextValue: string,
    wasPositive: boolean = true
  ): Promise<void> {
    try {
      const prefs = this.getLocalPreferences();
      let pref = prefs.find(p => p.context_type === contextType && p.context_value === contextValue && p.avatar_name === avatarName);

      if (!pref) {
        pref = {
          context_type: contextType,
          context_value: contextValue,
          avatar_name: avatarName,
          confidence: 0.2, // Confianza inicial
          hits: 0,
          total_uses: 0
        };
        prefs.push(pref);
      }

      pref.total_uses++;
      if (wasPositive) {
        pref.hits++;
      }

      // Recalcular confianza: hits / total_uses ponderado con un factor de aprendizaje
      pref.confidence = Math.min(1.0, (pref.hits / pref.total_uses) * Math.min(1.0, pref.total_uses * 0.2));

      // Guardar local
      this.saveLocalPreferences(prefs);

      // Sincronizar con Supabase si está disponible
      if (isSupabaseConfigured()) {
        const { error } = await supabase
          .from('avatar_preferences')
          .upsert({
            context_type: contextType,
            context_value: contextValue,
            avatar_name: avatarName,
            confidence: pref.confidence,
            hits: pref.hits,
            total_uses: pref.total_uses,
            updated_at: new Date().toISOString()
          }, { onConflict: 'context_type,context_value,avatar_name' });

        if (error) console.warn('⚠️ Error guardando preferencia de avatar en Supabase:', error.message);
      }
    } catch (e) {
      console.error('❌ Error registrando interacción de avatar:', e);
    }
  }

  /**
   * Devuelve el mejor avatar recomendado para un conjunto de contextos detectados.
   */
  static getBestAvatar(contexts: { type: string; value: string }[]): { avatarName: string; confidence: number } | null {
    const prefs = this.getLocalPreferences();
    const candidates: Record<string, { totalConfidence: number; count: number }> = {};

    contexts.forEach(ctx => {
      const matchingPrefs = prefs.filter(p => p.context_type === ctx.type && p.context_value === ctx.value);
      matchingPrefs.forEach(p => {
        if (!candidates[p.avatar_name]) {
          candidates[p.avatar_name] = { totalConfidence: 0, count: 0 };
        }
        candidates[p.avatar_name].totalConfidence += p.confidence;
        candidates[p.avatar_name].count++;
      });
    });

    let bestAvatar: string | null = null;
    let maxAvgConfidence = 0;

    Object.entries(candidates).forEach(([avatar, stat]) => {
      const avg = stat.totalConfidence / stat.count;
      if (avg > maxAvgConfidence) {
        maxAvgConfidence = avg;
        bestAvatar = avatar;
      }
    });

    if (bestAvatar && maxAvgConfidence >= 0.4) {
      return { avatarName: bestAvatar, confidence: maxAvgConfidence };
    }

    return null;
  }

  /**
   * Aprende si hay una declaración explícita de preferencia en la frase.
   * Ej: "me gusta cuando usas el avatar anime cuando jugamos"
   */
  static learnExplicitPreference(text: string): { avatar: string; topicOrMood: string } | null {
    const textLower = text.toLowerCase();
    
    // Check avatar keywords
    let targetAvatar = '';
    if (textLower.includes('anime') || textLower.includes('animé') || textLower.includes('nova anime')) {
      targetAvatar = 'Nova Anime';
    } else if (textLower.includes('grokani') || textLower.includes('realista') || textLower.includes('groka')) {
      targetAvatar = 'Grokani';
    }

    if (!targetAvatar) return null;

    // Check context trigger
    let targetContext = '';
    let type: 'mood' | 'topic' = 'topic';

    if (textLower.includes('cuando jugamos') || textLower.includes('juego') || textLower.includes('gaming')) {
      targetContext = 'gaming';
    } else if (textLower.includes('cuando programo') || textLower.includes('trabajo') || textLower.includes('codigo') || textLower.includes('estudio')) {
      targetContext = 'coding';
    } else if (textLower.includes('triste') || textLower.includes('depre') || textLower.includes('bajon')) {
      targetContext = 'sad';
      type = 'mood';
    } else if (textLower.includes('amor') || textLower.includes('cariño') || textLower.includes('romantico')) {
      targetContext = 'flirty';
      type = 'mood';
    }

    if (targetAvatar && targetContext) {
      this.recordInteraction(targetAvatar, 'explicit', targetContext, true);
      // Graba también como context de uso directo con confianza máxima
      this.recordInteraction(targetAvatar, type, targetContext, true);
      return { avatar: targetAvatar, topicOrMood: targetContext };
    }

    return null;
  }

  // --- Helpers locales ---

  static getLocalPreferences(): AvatarPreference[] {
    try {
      const data = localStorage.getItem('nova_avatar_preferences');
      return data ? JSON.parse(data) : [];
    } catch {
      return [];
    }
  }

  private static saveLocalPreferences(prefs: AvatarPreference[]): void {
    localStorage.setItem('nova_avatar_preferences', JSON.stringify(prefs));
  }

  static resetPreferences(): void {
    localStorage.removeItem('nova_avatar_preferences');
  }
}
