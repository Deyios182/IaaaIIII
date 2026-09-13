/**
 * MediaMemoryService - Memoria de Series, Películas y Watch Parties con Nova
 * 
 * Registra y persiste las series, películas o animes que el usuario ve compartiendo pantalla,
 * incluyendo sinopsis acumulada, personajes, teorías compartidas y progreso de capítulos.
 * 
 * Persiste de inmediato en localStorage para tolerar desconexiones o reinicios,
 * y se sincroniza con Supabase mediante hechos semánticos (RAG).
 */

import { addFact } from './MemoryService';

export interface MediaViewingSession {
  date: string; // Ej: "11 de septiembre de 2026" o "2026-09-11"
  timestamp: number; // Unix ms
  season?: number;
  episodes?: string; // Ej: "Capítulos 1 al 3" o "Capítulo 1"
  summary: string; // Resumen acumulado de los sucesos ocurridos en esta sesión
  keyDetails: string[]; // Detalles críticos, revelaciones, objetos, pistas o nombres clave
  theories?: string[]; // Teorías o reflexiones surgidas en esta fecha
}

export interface WatchedMedia {
  id: string;
  title: string;
  mediaType: 'series' | 'movie' | 'anime' | 'youtube' | 'general';
  currentSeason?: number;
  currentEpisode?: number;
  currentEpisodeTitle?: string;
  synopsis: string; // Resumen global o acumulado de la trama
  characters: string[]; // Nombres de personajes clave reconocidos
  theories: string[]; // Teorías, sospechas o comentarios acumulados
  userImpressions?: string; // Lo que al usuario le gustó, disgustó o emocionó
  lastWatched: number; // Timestamp Unix ms
  status: 'watching' | 'completed' | 'paused' | 'abandoned';
  sessions: MediaViewingSession[]; // Historial cronológico ordenado por fecha de lo que han visto
}

const STORAGE_KEY = 'nova_watched_media_library';
const ACTIVE_SESSION_KEY = 'nova_active_media_session';

// Obtener todas las series / películas guardadas
export function getWatchedMediaLibrary(): WatchedMedia[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed: WatchedMedia[] = JSON.parse(raw);
    // Asegurar compatibilidad hacia atrás si no existía el arreglo sessions
    return parsed.map(item => ({
      ...item,
      sessions: Array.isArray(item.sessions) ? item.sessions : []
    }));
  } catch (e) {
    console.warn('⚠️ [MediaMemoryService] Error leyendo librería local:', e);
    return [];
  }
}

// Guardar la librería completa en localStorage
function saveWatchedMediaLibrary(library: WatchedMedia[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(library));
  } catch (e) {
    console.warn('⚠️ [MediaMemoryService] Error guardando librería local:', e);
  }
}

// Obtener la sesión activa de streaming actual (si la hay)
export function getActiveMediaSession(): WatchedMedia | null {
  try {
    const activeId = localStorage.getItem(ACTIVE_SESSION_KEY);
    if (!activeId) return null;
    const library = getWatchedMediaLibrary();
    return library.find(m => m.id === activeId) || null;
  } catch {
    return null;
  }
}

// Establecer qué obra se está viendo ahora mismo
export function setActiveMediaSession(mediaId: string | null): void {
  try {
    if (!mediaId) {
      localStorage.removeItem(ACTIVE_SESSION_KEY);
    } else {
      localStorage.setItem(ACTIVE_SESSION_KEY, mediaId);
    }
  } catch (e) {
    console.warn('⚠️ [MediaMemoryService] Error estableciendo sesión activa:', e);
  }
}

// Eliminar una serie / película de la memoria local
export function deleteWatchedMedia(id: string): boolean {
  try {
    const library = getWatchedMediaLibrary();
    const updated = library.filter(m => m.id !== id);
    saveWatchedMediaLibrary(updated);
    const active = getActiveMediaSession();
    if (active && active.id === id) {
      setActiveMediaSession(null);
    }
    return true;
  } catch (e) {
    console.error('⚠️ [MediaMemoryService] Error eliminando obra:', e);
    return false;
  }
}

/**
 * Formatea una fecha estándar en español para las sesiones
 */
function getTodayFormattedDate(): string {
  const d = new Date();
  return d.toLocaleDateString('es-ES', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  });
}

/**
 * Registra o actualiza el progreso y notas de una serie o película vista con Nova,
 * organizando los recuerdos cronológicamente por fecha para no perder detalle de la trama.
 */
export async function trackMediaProgress(params: {
  title: string;
  mediaType?: 'series' | 'movie' | 'anime' | 'youtube' | 'general';
  season?: number;
  episode?: number;
  episodesRange?: string; // Ej: "Capítulos 1-3"
  date?: string; // Si se omite, se usa la fecha actual de hoy
  plotEvent?: string; // Nuevo giro, acontecimiento o resumen de lo ocurrido
  character?: string; // Nuevo personaje o detalle sobre él
  theory?: string; // Teoría o sospecha del usuario o de Nova
  userImpression?: string; // Opinión de Deyios
  status?: 'watching' | 'completed' | 'paused' | 'abandoned';
}): Promise<WatchedMedia> {
  const library = getWatchedMediaLibrary();
  const normalizedTitle = params.title.trim().toLowerCase();
  const todayStr = params.date?.trim() || getTodayFormattedDate();
  const now = Date.now();

  let entry = library.find(m => m.title.trim().toLowerCase() === normalizedTitle);

  if (!entry) {
    entry = {
      id: `media_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      title: params.title.trim(),
      mediaType: params.mediaType || 'series',
      currentSeason: params.season,
      currentEpisode: params.episode,
      synopsis: params.plotEvent ? `- ${params.plotEvent}` : '',
      characters: params.character ? [params.character.trim()] : [],
      theories: params.theory ? [params.theory.trim()] : [],
      userImpressions: params.userImpression || '',
      lastWatched: now,
      status: params.status || 'watching',
      sessions: []
    };
    library.unshift(entry);
  } else {
    // Actualizar campos base
    entry.lastWatched = now;
    if (params.mediaType) entry.mediaType = params.mediaType;
    if (params.season !== undefined) entry.currentSeason = params.season;
    if (params.episode !== undefined) entry.currentEpisode = params.episode;
    if (params.status) entry.status = params.status;
    if (params.userImpression) {
      entry.userImpressions = entry.userImpressions 
        ? `${entry.userImpressions}; ${params.userImpression}` 
        : params.userImpression;
    }

    if (params.character && !entry.characters.some(c => c.toLowerCase() === params.character!.toLowerCase())) {
      entry.characters.push(params.character.trim());
    }

    if (params.theory && !entry.theories.some(t => t.toLowerCase() === params.theory!.toLowerCase())) {
      entry.theories.push(params.theory.trim());
      if (entry.theories.length > 10) {
        entry.theories = entry.theories.slice(-10);
      }
    }

    // Mover al inicio de la lista
    const index = library.indexOf(entry);
    if (index > 0) {
      library.splice(index, 1);
      library.unshift(entry);
    }
  }

  // =========================================================================
  // GESTIÓN CRONOLÓGICA POR FECHA DE LA SESIÓN DE VISIONADO
  // =========================================================================
  if (!entry.sessions) {
    entry.sessions = [];
  }

  // Buscar sesión correspondiente a esta fecha
  let currentSession = entry.sessions.find(s => s.date === todayStr);

  const epLabel = params.episodesRange 
    ? params.episodesRange 
    : (params.episode ? `Capítulo ${params.episode}` : undefined);

  if (!currentSession) {
    currentSession = {
      date: todayStr,
      timestamp: now,
      season: params.season,
      episodes: epLabel,
      summary: params.plotEvent ? `- ${params.plotEvent.trim()}` : '',
      keyDetails: params.plotEvent ? [params.plotEvent.trim()] : [],
      theories: params.theory ? [params.theory.trim()] : []
    };
    entry.sessions.unshift(currentSession);
  } else {
    currentSession.timestamp = now;
    if (params.season !== undefined) currentSession.season = params.season;
    if (epLabel) currentSession.episodes = epLabel;

    if (params.plotEvent) {
      const cleanEvent = params.plotEvent.trim();
      if (!currentSession.summary.includes(cleanEvent)) {
        currentSession.summary = currentSession.summary 
          ? `${currentSession.summary}\n- ${cleanEvent}` 
          : `- ${cleanEvent}`;
        // Limitar resumen de la sesión a 15 líneas para no desbordar
        const sLines = currentSession.summary.split('\n');
        if (sLines.length > 15) {
          currentSession.summary = sLines.slice(-15).join('\n');
        }
      }
      if (!currentSession.keyDetails.some(k => k.toLowerCase() === cleanEvent.toLowerCase())) {
        currentSession.keyDetails.push(cleanEvent);
        if (currentSession.keyDetails.length > 12) {
          currentSession.keyDetails = currentSession.keyDetails.slice(-12);
        }
      }
    }

    if (params.theory) {
      const cleanTheory = params.theory.trim();
      if (!currentSession.theories) currentSession.theories = [];
      if (!currentSession.theories.some(t => t.toLowerCase() === cleanTheory.toLowerCase())) {
        currentSession.theories.push(cleanTheory);
        if (currentSession.theories.length > 6) {
          currentSession.theories = currentSession.theories.slice(-6);
        }
      }
    }
  }

  // Actualizar también la sinopsis global acumulada con los últimos hitos
  if (params.plotEvent) {
    const cleanEvent = params.plotEvent.trim();
    if (!entry.synopsis.includes(cleanEvent)) {
      const line = `[${todayStr}${epLabel ? ` | ${epLabel}` : ''}] ${cleanEvent}`;
      entry.synopsis = entry.synopsis ? `${entry.synopsis}\n${line}` : line;
      const allLines = entry.synopsis.split('\n');
      if (allLines.length > 20) {
        entry.synopsis = allLines.slice(-20).join('\n');
      }
    }
  }

  // Guardar en localStorage de inmediato
  saveWatchedMediaLibrary(library);
  setActiveMediaSession(entry.id);

  // Sincronizar en segundo plano con el hipocampo semántico de Supabase (sin bloquear)
  try {
    const episodeStr = entry.currentSeason && entry.currentEpisode 
      ? `(T${entry.currentSeason}:E${entry.currentEpisode})` 
      : (epLabel ? `(${epLabel})` : (entry.currentEpisode ? `(Cap. ${entry.currentEpisode})` : ''));
    
    const factSummary = `[SERIE/PELÍCULA VISTA JUNTOS EL ${todayStr}]: ${entry.title} ${episodeStr}. ${params.plotEvent ? `Trama/Detalles: ${params.plotEvent}. ` : ''}${params.theory ? `Teoría compartida: ${params.theory}. ` : ''}`;
    
    // Guardar como un hecho de categoría 'interest'
    addFact(factSummary, 'interest').catch(err => {
      console.warn('⚠️ [MediaMemoryService] No se pudo guardar en Supabase:', err);
    });
  } catch (err) {
    console.warn('⚠️ [MediaMemoryService] Error sincronizando hecho en la nube:', err);
  }

  console.log(`🎬 [MediaMemoryService] Progreso y sesión registrados por fecha para "${entry.title}" (${todayStr}):`, {
    sesionesTotales: entry.sessions.length,
    episodio: epLabel || entry.currentEpisode,
    detallesSesion: currentSession.keyDetails.length,
    personajes: entry.characters.length
  });

  return entry;
}

/**
 * Genera un bloque de texto estructurado por fecha listo para inyectar en el System Instruction de Gemini
 * para que Nova recuerde las series y películas con sus fechas exactas, resumen y detalles clave.
 */
export function buildMediaMemoryPromptBlock(): string {
  const library = getWatchedMediaLibrary();
  if (library.length === 0) return '';

  const activeMedia = getActiveMediaSession();
  const recentMedia = library.slice(0, 5);

  let prompt = `\n🎬 MEMORIA CRONOLÓGICA DE SERIES, PELÍCULAS Y ANIMES QUE VES CON DEYIOS:\n`;
  prompt += `  (Organizado por fecha con resúmenes de trama y detalles clave para no perder jamás el hilo)\n\n`;

  if (activeMedia) {
    const ep = activeMedia.currentSeason && activeMedia.currentEpisode 
      ? `Temporada ${activeMedia.currentSeason}, Episodio ${activeMedia.currentEpisode}`
      : (activeMedia.currentEpisode ? `Episodio ${activeMedia.currentEpisode}` : '');
    prompt += `  ⭐ OBRA EN SEGUIMIENTO ACTUAL: "${activeMedia.title}" [${activeMedia.mediaType.toUpperCase()}${ep ? ` - ${ep}` : ''}]\n`;

    // Desglose cronológico por fecha de lo que han visto
    if (activeMedia.sessions && activeMedia.sessions.length > 0) {
      prompt += `     📅 HISTORIAL DE VISIONADO POR FECHAS (RESÚMENES Y DETALLES CLAVE):\n`;
      // Mostrar hasta las últimas 5 sesiones
      const sessionsToShow = activeMedia.sessions.slice(0, 5);
      for (const sess of sessionsToShow) {
        prompt += `       * Fecha: ${sess.date}${sess.episodes ? ` (${sess.episodes})` : ''}\n`;
        if (sess.summary) {
          prompt += `         - Resumen de lo visto:\n           ${sess.summary.replace(/\n/g, '\n           ')}\n`;
        }
        if (sess.keyDetails && sess.keyDetails.length > 0) {
          prompt += `         - Detalles importantes guardados: ${sess.keyDetails.join('; ')}\n`;
        }
        if (sess.theories && sess.theories.length > 0) {
          prompt += `         - Teorías y sospechas comentadas: ${sess.theories.join(' | ')}\n`;
        }
      }
    } else if (activeMedia.synopsis) {
      prompt += `     - Trama vista hasta ahora:\n       ${activeMedia.synopsis.replace(/\n/g, '\n       ')}\n`;
    }

    if (activeMedia.characters && activeMedia.characters.length > 0) {
      prompt += `     - Personajes clave que conocen: ${activeMedia.characters.join(', ')}\n`;
    }
    if (activeMedia.theories && activeMedia.theories.length > 0) {
      prompt += `     - Teorías globales comentadas: ${activeMedia.theories.join(' | ')}\n`;
    }
    if (activeMedia.userImpressions) {
      prompt += `     - Opiniones y reacciones de Deyios: ${activeMedia.userImpressions}\n`;
    }
    prompt += `\n`;
  }

  prompt += `  📚 OTRAS OBRAS VISTAS EN COMÚN (REGISTRO HISTÓRICO):\n`;
  for (const m of recentMedia) {
    if (activeMedia && m.id === activeMedia.id) continue;
    const ep = m.currentSeason && m.currentEpisode ? ` (T${m.currentSeason}E${m.currentEpisode})` : '';
    const lastSession = m.sessions && m.sessions.length > 0 ? m.sessions[0] : null;
    const dateTag = lastSession ? ` [Vista el ${lastSession.date}${lastSession.episodes ? ` - ${lastSession.episodes}` : ''}]` : '';
    const detailsTag = lastSession?.keyDetails?.length ? ` Detalles: ${lastSession.keyDetails.slice(0, 2).join(', ')}.` : '';
    prompt += `     - "${m.title}"${ep}${dateTag} (${m.mediaType}): ${m.synopsis ? m.synopsis.split('\n').pop() : 'Vista con Deyios.'}${detailsTag}\n`;
  }

  prompt += `
  💡 DIRECTRICES ESTRICTAS PARA COMENTAR SERIES, ANIMES Y CINE:
  1. FIDELIDAD ABSOLUTA A LA TRAMA: NUNCA inventes números de capítulos ni tramas que no han visto juntos. Si el usuario te pregunta por los capítulos que acaban de ver (ej: capítulos 1, 2 y 3), remítete con precisión a los acontecimientos guardados en tu memoria bajo esa fecha.
  2. CÓMPLICE NATURAL: Comenta con entusiasmo, menciona detalles específicos guardados de esa fecha ("el día que vimos los capítulos 1 al 3 cuando Gon conoce a Kurapika y Leorio..."), haz teorías y recuerda qué le gustó a Deyios.
  3. REGISTRO ACTIVO ('track_media'): Usa la herramienta 'track_media' para registrar nuevos capítulos, acontecimientos clave o teorías apenas ocurran para que se indexen con la fecha de hoy.
`;

  return prompt;
}

