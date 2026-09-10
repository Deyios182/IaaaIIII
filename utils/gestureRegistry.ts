/**
 * Gesture Registry - Catálogo Central y Despachador Inteligente de Gestos y Animaciones
 * 
 * Permite que Nova cuente con una librería estándar de gestos procedurales para todas
 * sus acciones conocidas, pudiendo ser reemplazados de forma fluida y transparente
 * por animaciones de alta calidad (Mixamo, VMD, GLB) cargadas en el sistema.
 * Mantiene a Nova consciente de todo su repertorio en tiempo real y sincronizable con la música.
 */

export type GestureCategory = 'greeting' | 'reaction' | 'emotion' | 'charm' | 'body' | 'dance';

export interface GestureDefinition {
  id: string;
  name: string;
  category: GestureCategory;
  description: string;
  aliases: string[];
  defaultDuration: number;
  icon?: string;
  isRhythmic?: boolean;
}

export interface ResolvedAction {
  type: 'clip' | 'procedural';
  name: string;
  duration?: number;
  isLoop?: boolean;
  priority?: number;
}

// ─── CATÁLOGO ESTÁNDAR DE GESTOS PROCEDURALES DE NOVA ───────────────────────────
export const STANDARD_GESTURES: GestureDefinition[] = [
  // 1. Saludos y Cortesía
  {
    id: 'wave',
    name: 'Saludar',
    category: 'greeting',
    description: 'Levanta la mano derecha saludando amistosamente con balanceo natural.',
    aliases: ['wave', 'saludo', 'hola', 'saludar', 'chau', 'adios', 'bye'],
    defaultDuration: 2.6,
    icon: '👋'
  },
  {
    id: 'bow',
    name: 'Reverencia',
    category: 'greeting',
    description: 'Reverencia elegante inclinando torso y cabeza con respeto.',
    aliases: ['bow', 'reverencia', 'agradecer', 'gracias'],
    defaultDuration: 2.6,
    icon: '🙇‍♀️'
  },

  // 2. Reacciones y Escucha
  {
    id: 'nod',
    name: 'Asentir',
    category: 'reaction',
    description: 'Asiente con la cabeza confirmando o mostrando acuerdo.',
    aliases: ['nod', 'asentir', 'si', 'afirmar', 'de_acuerdo'],
    defaultDuration: 1.6,
    icon: '😊'
  },
  {
    id: 'shake_head',
    name: 'Negar',
    category: 'reaction',
    description: 'Mueve la cabeza de lado a lado en desacuerdo o incredulidad.',
    aliases: ['shake_head', 'negar', 'no', 'rechazar', 'desacuerdo'],
    defaultDuration: 1.9,
    icon: '🙅‍♀️'
  },
  {
    id: 'shrug',
    name: 'Encogerse de hombros',
    category: 'reaction',
    description: 'Encoge los hombros con manos abiertas indicando duda o indiferencia.',
    aliases: ['shrug', 'encoger_hombros', 'duda', 'no_se', 'quien_sabe'],
    defaultDuration: 2.2,
    icon: '🤷‍♀️'
  },
  {
    id: 'thinking',
    name: 'Pensar',
    category: 'reaction',
    description: 'Mano en la barbilla y cabeza ladeada con mirada reflexiva.',
    aliases: ['thinking', 'pensar', 'pensando', 'reflexionar', 'duda_mental'],
    defaultDuration: 3.2,
    icon: '🤔'
  },
  {
    id: 'confused',
    name: 'Confundida',
    category: 'reaction',
    description: 'Inclinación de cabeza interrogativa con expresión desorientada.',
    aliases: ['confused', 'confundida', 'confusa', 'que', 'desorientada'],
    defaultDuration: 2.2,
    icon: '🤨'
  },
  {
    id: 'listen_attentive',
    name: 'Escuchar atentamente',
    category: 'reaction',
    description: 'Inclinación hacia el usuario con atención concentrada.',
    aliases: ['listen_attentive', 'escuchar', 'atenta', 'oír', 'prestar_atencion'],
    defaultDuration: 3.6,
    icon: '👂'
  },
  {
    id: 'curious_lean',
    name: 'Inclinación curiosa',
    category: 'reaction',
    description: 'Se acerca con curiosidad hacia el frente con la cabeza inclinada.',
    aliases: ['curious_lean', 'curiosa', 'curiosidad', 'asomarse'],
    defaultDuration: 3.2,
    icon: '👀'
  },

  // 3. Emociones y Alegría
  {
    id: 'happy',
    name: 'Feliz',
    category: 'emotion',
    description: 'Rebote suave de alegría con brazos festivos relajados.',
    aliases: ['happy', 'feliz', 'contenta', 'alegria', 'sonreir'],
    defaultDuration: 2.6,
    isRhythmic: true,
    icon: '😄'
  },
  {
    id: 'excited',
    name: 'Emocionada',
    category: 'emotion',
    description: 'Movimiento enérgico y entusiasta con vitalidad.',
    aliases: ['excited', 'emocionada', 'entusiasta', 'animo', 'euforia'],
    defaultDuration: 2.6,
    isRhythmic: true,
    icon: '🤩'
  },
  {
    id: 'laugh',
    name: 'Reírse',
    category: 'emotion',
    description: 'Risa natural con balanceo de cabeza y torso hacia atrás.',
    aliases: ['laugh', 'reir', 'risa', 'jaja', 'carcajada'],
    defaultDuration: 2.6,
    icon: '😂'
  },
  {
    id: 'clap',
    name: 'Aplaudir',
    category: 'emotion',
    description: 'Aplaude con ambas manos frente al pecho celebrando.',
    aliases: ['clap', 'aplaudir', 'aplausos', 'felicitaciones', 'bravo'],
    defaultDuration: 2.2,
    isRhythmic: true,
    icon: '👏'
  },
  {
    id: 'celebrate',
    name: 'Celebrar',
    category: 'emotion',
    description: 'Levanta ambos brazos al cielo festejando un logro o victoria.',
    aliases: ['celebrate', 'celebrar', 'festejar', 'victoria', 'ganamos'],
    defaultDuration: 3.0,
    isRhythmic: true,
    icon: '🎉'
  },
  {
    id: 'surprised',
    name: 'Sorprendida',
    category: 'emotion',
    description: 'Sobresalto con manos abiertas levantadas a la altura del pecho.',
    aliases: ['surprised', 'sorpresa', 'asombrada', 'oh', 'impactada'],
    defaultDuration: 1.6,
    icon: '😲'
  },
  {
    id: 'sad',
    name: 'Triste',
    category: 'emotion',
    description: 'Cabeza gacha y hombros caídos con aire melancólico.',
    aliases: ['sad', 'triste', 'pena', 'desanimada', 'bajon'],
    defaultDuration: 3.2,
    icon: '🥺'
  },
  {
    id: 'angry',
    name: 'Enojada',
    category: 'emotion',
    description: 'Cuerpo erguido y firme con tensión defensiva.',
    aliases: ['angry', 'enojada', 'molesta', 'enfado', 'furiosa'],
    defaultDuration: 2.2,
    icon: '😠'
  },

  // 4. Coqueteo, Afecto y Encanto
  {
    id: 'flirt',
    name: 'Coquetear',
    category: 'charm',
    description: 'Inclinación seductora de cadera y torso con mirada coqueta.',
    aliases: ['flirt', 'coquetear', 'coqueta', 'seductora', 'guina'],
    defaultDuration: 3.2,
    icon: '😉'
  },
  {
    id: 'shy',
    name: 'Tímida',
    category: 'charm',
    description: 'Cabeza gacha hacia el lado con encogimiento tímido y dulce.',
    aliases: ['shy', 'timida', 'verguenza', 'apenada', 'sonrojada'],
    defaultDuration: 2.6,
    icon: '😳'
  },
  {
    id: 'blow_kiss',
    name: 'Lanzar beso',
    category: 'charm',
    description: 'Lleva la mano a los labios y lanza un beso hacia el usuario.',
    aliases: ['blow_kiss', 'beso', 'besar', 'kiss', 'muak', 'lanzar_beso'],
    defaultDuration: 3.2,
    icon: '💋'
  },
  {
    id: 'playful_tease',
    name: 'Pícara / Burlona',
    category: 'charm',
    description: 'Balanceo pícaro con mano en la cadera y cabeza ladeada.',
    aliases: ['playful_tease', 'picara', 'burlona', 'tease', 'juguetona'],
    defaultDuration: 3.2,
    icon: '😜'
  },
  {
    id: 'pose_sexy',
    name: 'Pose atractiva',
    category: 'charm',
    description: 'Pose elegante con cadera acentuada y brazos estilizados.',
    aliases: ['pose_sexy', 'pose', 'sexy', 'modelar', 'pose_diva'],
    defaultDuration: 3.4,
    icon: '💃'
  },
  {
    id: 'peace',
    name: 'Signo de Paz / Victoria',
    category: 'charm',
    description: 'Levanta la mano derecha haciendo el signo V de victoria con picardía.',
    aliases: ['peace', 'paz', 'victoria', 'signo_v', 'peace_sign'],
    defaultDuration: 2.4,
    icon: '✌️'
  },
  {
    id: 'sensual_hip_sway',
    name: 'Bamboleo sensual',
    category: 'charm',
    description: 'Movimiento circular y balanceo seductor de caderas con ritmo provocativo.',
    aliases: ['sensual_hip_sway', 'bamboleo', 'caderas_sexy', 'meneito', 'sway_sensual'],
    defaultDuration: 4.2,
    isRhythmic: true,
    icon: '🔥'
  },
  {
    id: 'chest_caress',
    name: 'Caricia en el pecho',
    category: 'charm',
    description: 'Desliza una mano suavemente por el escote y pecho con picardía.',
    aliases: ['chest_caress', 'caricia_pecho', 'tocar_pecho', 'caricia_escote', 'escote'],
    defaultDuration: 3.6,
    icon: '💋'
  },
  {
    id: 'hair_touch',
    name: 'Acariciar cabello',
    category: 'charm',
    description: 'Pasa la mano lentamente por el cabello con mirada seductora.',
    aliases: ['hair_touch', 'pelo_coqueta', 'peinarse_dedos', 'acomodar_pelo'],
    defaultDuration: 3.4,
    icon: '✨'
  },
  {
    id: 'seductive_look',
    name: 'Mirada seductora',
    category: 'charm',
    description: 'Ladea la cabeza con hombros insinuantes y mirada felina directa.',
    aliases: ['seductive_look', 'mirada_sexy', 'seductora', 'provocar', 'ojos_ardientes'],
    defaultDuration: 3.5,
    icon: '😏'
  },
  {
    id: 'arch_back',
    name: 'Arqueo seductor',
    category: 'charm',
    description: 'Arquea la espalda con pecho elevado y caderas curvadas en pose tentadora.',
    aliases: ['arch_back', 'arquearse', 'pose_sensual', 'curvas', 'tentacion'],
    defaultDuration: 3.8,
    icon: '🫦'
  },
  {
    id: 'submissive_lean',
    name: 'Inclinación insinuante',
    category: 'charm',
    description: 'Se inclina hacia adelante suavemente acentuando el escote y la mirada.',
    aliases: ['submissive_lean', 'inclinacion_sexy', 'acercarse_sensual', 'agacharse_coqueta'],
    defaultDuration: 3.6,
    icon: '🫣'
  },

  // 5. Posturas y Consciencia Corporal
  {
    id: 'touch_chest',
    name: 'Mano al pecho',
    category: 'body',
    description: 'Coloca la mano derecha sobre el corazón con emoción profunda.',
    aliases: ['touch_chest', 'mano_pecho', 'corazon', 'sincera', 'sentimiento'],
    defaultDuration: 3.0,
    icon: '💖'
  },
  {
    id: 'touch_head',
    name: 'Tocar cabeza',
    category: 'body',
    description: 'Lleva la mano suavemente al cabello o sien.',
    aliases: ['touch_head', 'toca_cabeza', 'mano_cabeza', 'arreglar_pelo'],
    defaultDuration: 3.0,
    icon: '💆‍♀️'
  },
  {
    id: 'hands_on_hips',
    name: 'Manos en caderas',
    category: 'body',
    description: 'Coloca las manos en la cintura en postura segura y decidida.',
    aliases: ['hands_on_hips', 'manos_caderas', 'caderas', 'brazos_cintura'],
    defaultDuration: 3.0,
    icon: '🧍‍♀️'
  },
  {
    id: 'hug_self',
    name: 'Abrazarse',
    category: 'body',
    description: 'Cruza los brazos sobre el torso dándose un autoabrazo acogedor.',
    aliases: ['hug_self', 'abrazarse', 'abrazo', 'autoabrazo', 'frio'],
    defaultDuration: 3.5,
    icon: '🫂'
  },
  {
    id: 'stretch',
    name: 'Estirarse',
    category: 'body',
    description: 'Estira ambos brazos hacia arriba arqueando la espalda con placer.',
    aliases: ['stretch', 'estirarse', 'stretch_relax', 'desperezarse', 'relajo'],
    defaultDuration: 3.5,
    icon: '🙆‍♀️'
  },
  {
    id: 'point',
    name: 'Señalar',
    category: 'body',
    description: 'Apunta con el brazo derecho y el dedo índice hacia el usuario.',
    aliases: ['point', 'apuntar', 'senalar', 'tu', 'mira'],
    defaultDuration: 2.2,
    icon: '👉'
  },
  {
    id: 'crouch',
    name: 'Agacharse',
    category: 'body',
    description: 'Flexiona las rodillas y baja el centro de gravedad.',
    aliases: ['crouch', 'agachate', 'agacharse', 'bajar'],
    defaultDuration: 3.5,
    icon: '🧎‍♀️'
  },
  {
    id: 'balance',
    name: 'Equilibrio',
    category: 'body',
    description: 'Brazos extendidos a los lados manteniendo el balance con gracia.',
    aliases: ['balance', 'equilibrio', 'acrobacia', 'cuerda_floja'],
    defaultDuration: 3.5,
    icon: '⚖️'
  },

  // 6. Música, Baile y Ritmo
  {
    id: 'dance',
    name: 'Bailar',
    category: 'dance',
    description: 'Baile rítmico continuo con balanceo armónico de caderas, torso y brazos.',
    aliases: ['dance', 'bailar', 'baile', 'bailando', 'danza'],
    defaultDuration: 5.0,
    isRhythmic: true,
    icon: '💃'
  },
  {
    id: 'sing',
    name: 'Cantar',
    category: 'dance',
    description: 'Postura escénica expresiva de cantante con gesticulación melódica.',
    aliases: ['sing', 'cantar', 'cancion', 'interpretacion', 'cantando'],
    defaultDuration: 8.0,
    isRhythmic: true,
    icon: '🎤'
  },
  {
    id: 'rhythm_bounce',
    name: 'Rebote de ritmo',
    category: 'dance',
    description: 'Balanceo rítmico sincronizado con el tempo de la música que suena.',
    aliases: ['rhythm_bounce', 'ritmo', 'beat', 'groove', 'rebote_musical'],
    defaultDuration: 4.0,
    isRhythmic: true,
    icon: '🎵'
  }
];

import { animationStore } from './animationStore';

export class GestureRegistry {
  private standardGestures: Map<string, GestureDefinition> = new Map();
  private aliasMap: Map<string, string> = new Map();
  private customAnimations: Map<string, { tag: string; duration?: number; isRhythmic?: boolean }> = new Map();
  // Overrides de gestos: standardGestureId (ej: 'wave') -> animationName cargada en AnimationStore
  private gestureOverrides: Map<string, string> = new Map();

  private userGestures: Map<string, GestureDefinition> = new Map();

  constructor() {
    this.initStandardGestures();
    if (typeof window !== 'undefined') {
      try {
        this.loadUserGesturesFromStorage();
        this.loadOverridesFromStorage();
        animationStore.subscribe(() => {
          this.syncFromAnimationStore();
        });
        this.syncFromAnimationStore();
      } catch (_) {}
    }
  }

  private loadUserGesturesFromStorage(): void {
    try {
      const stored = localStorage.getItem('nova_user_gestures');
      if (stored) {
        const parsed: GestureDefinition[] = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach(g => {
            if (g && g.id) {
              const cleanId = g.id.toLowerCase().replace(/[\s-]/g, '_');
              const def = { ...g, id: cleanId };
              this.userGestures.set(cleanId, def);
              this.standardGestures.set(cleanId, def);
              this.aliasMap.set(cleanId, cleanId);
              (g.aliases || []).forEach(alias => {
                this.aliasMap.set(alias.toLowerCase().replace(/[\s-]/g, '_'), cleanId);
              });
            }
          });
        }
      }
    } catch (_) {}
  }

  private saveUserGesturesToStorage(): void {
    try {
      const list = Array.from(this.userGestures.values());
      localStorage.setItem('nova_user_gestures', JSON.stringify(list));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nova-gestures-updated'));
      }
    } catch (_) {}
  }

  /**
   * Registra o actualiza un gesto creado por el usuario en el catálogo
   */
  addUserGesture(gesture: GestureDefinition, initialAnimationName?: string): void {
    const cleanId = gesture.id.toLowerCase().replace(/[\s-]/g, '_');
    const def: GestureDefinition = {
      ...gesture,
      id: cleanId,
      aliases: Array.from(new Set([cleanId, ...(gesture.aliases || []).map(a => a.toLowerCase().replace(/[\s-]/g, '_'))])),
      defaultDuration: gesture.defaultDuration || 3.0,
      icon: gesture.icon || '✨'
    };

    this.userGestures.set(cleanId, def);
    this.standardGestures.set(cleanId, def);
    this.aliasMap.set(cleanId, cleanId);
    def.aliases.forEach(alias => {
      this.aliasMap.set(alias, cleanId);
    });

    this.saveUserGesturesToStorage();

    if (initialAnimationName) {
      this.setGestureOverride(cleanId, initialAnimationName);
    }

    console.log(`✨ [GestureRegistry] Gesto de usuario registrado: "${def.name}" (${cleanId})`);
  }

  /**
   * Elimina un gesto creado por el usuario
   */
  removeUserGesture(gestureId: string): void {
    const cleanId = gestureId.toLowerCase().replace(/[\s-]/g, '_');
    if (this.userGestures.has(cleanId)) {
      this.userGestures.delete(cleanId);
      this.standardGestures.delete(cleanId);
      this.removeGestureOverride(cleanId);
      this.saveUserGesturesToStorage();
      console.log(`🗑️ [GestureRegistry] Gesto de usuario eliminado: ${cleanId}`);
    }
  }

  /**
   * Verifica si un gesto fue creado por el usuario
   */
  isUserGesture(gestureId: string): boolean {
    return this.userGestures.has(gestureId.toLowerCase().replace(/[\s-]/g, '_'));
  }

  private loadOverridesFromStorage(): void {
    try {
      const stored = localStorage.getItem('nova_gesture_overrides');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          parsed.forEach(([k, v]) => {
            if (k && v) this.gestureOverrides.set(k.toLowerCase(), v);
          });
        }
      }
    } catch (_) {}
  }

  private saveOverridesToStorage(): void {
    try {
      const entries = Array.from(this.gestureOverrides.entries());
      localStorage.setItem('nova_gesture_overrides', JSON.stringify(entries));
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('nova-gestures-updated'));
      }
    } catch (_) {}
  }

  private initStandardGestures(): void {
    this.standardGestures.clear();
    this.aliasMap.clear();

    STANDARD_GESTURES.forEach(g => {
      this.standardGestures.set(g.id, g);
      this.aliasMap.set(g.id.toLowerCase(), g.id);

      g.aliases.forEach(alias => {
        this.aliasMap.set(alias.toLowerCase().replace(/[\s-]/g, '_'), g.id);
      });
    });

    // Re-aplicar gestos de usuario en memoria
    this.userGestures.forEach(g => {
      this.standardGestures.set(g.id, g);
      this.aliasMap.set(g.id, g.id);
      g.aliases.forEach(alias => {
        this.aliasMap.set(alias, g.id);
      });
    });
  }

  /** Sincroniza animaciones guardadas en AnimationStore */
  syncFromAnimationStore(): void {
    try {
      this.loadOverridesFromStorage();
      const all = animationStore.getAll();
      all.forEach(a => {
        this.registerCustomAnimation(a.name, a.customTag || a.assignedGesture, a.duration);
        // Si la animación tiene asignado explícitamente un gesto procedural
        if (a.assignedGesture) {
          this.gestureOverrides.set(a.assignedGesture.toLowerCase(), a.name);
        } else if (a.customTag) {
          const tag = a.customTag.toLowerCase();
          if (this.standardGestures.has(tag) && !this.gestureOverrides.has(tag)) {
            this.gestureOverrides.set(tag, a.name);
          }
        }
      });
    } catch (_) {}
  }

  /**
   * Asigna una animación cargada de alta calidad a un gesto procedural estándar
   */
  setGestureOverride(gestureId: string, animationName: string): void {
    const cleanId = gestureId.toLowerCase().replace(/[\s-]/g, '_');
    this.gestureOverrides.set(cleanId, animationName);
    this.saveOverridesToStorage();

    // Actualizar también en animationStore
    try {
      animationStore.updateMeta(animationName, { assignedGesture: cleanId });
    } catch (_) {}

    console.log(`🎬 [GestureRegistry] Gesto procedural "${cleanId}" sustituido por animación: "${animationName}"`);
  }

  /**
   * Restaura el gesto a su comportamiento procedural estándar original
   */
  removeGestureOverride(gestureId: string): void {
    const cleanId = gestureId.toLowerCase().replace(/[\s-]/g, '_');
    const existingAnim = this.gestureOverrides.get(cleanId);
    this.gestureOverrides.delete(cleanId);
    this.saveOverridesToStorage();

    if (existingAnim) {
      try {
        const anim = animationStore.get(existingAnim);
        if (anim && anim.assignedGesture === cleanId) {
          animationStore.updateMeta(existingAnim, { assignedGesture: undefined });
        }
      } catch (_) {}
    }

    console.log(`⚡ [GestureRegistry] Gesto "${cleanId}" restaurado al motor procedural estándar.`);
  }

  /**
   * Obtiene el nombre de la animación que sustituye a un gesto (o undefined si es procedural)
   */
  getGestureOverride(gestureId: string): string | undefined {
    return this.gestureOverrides.get(gestureId.toLowerCase().replace(/[\s-]/g, '_'));
  }

  /**
   * Verifica si un gesto tiene override de animación VMD/clip
   */
  hasGestureOverride(gestureId: string): boolean {
    return this.gestureOverrides.has(gestureId.toLowerCase().replace(/[\s-]/g, '_'));
  }

  /**
   * Retorna todos los overrides actuales
   */
  getAllOverrides(): Map<string, string> {
    return new Map(this.gestureOverrides);
  }

  /**
   * Obtiene la lista de todos los gestos estándar
   */
  getAllStandard(): GestureDefinition[] {
    return Array.from(this.standardGestures.values());
  }

  /**
   * Obtiene todos los IDs de gestos conocidos (estándar + personalizados)
   */
  getAllGestureIds(): string[] {
    const ids = Array.from(this.standardGestures.keys());
    const custom = Array.from(this.customAnimations.keys());
    return Array.from(new Set([...ids, ...custom]));
  }

  /**
   * Obtiene la definición de un gesto por id o alias
   */
  getGesture(idOrAlias: string): GestureDefinition | undefined {
    if (!idOrAlias) return undefined;
    const clean = idOrAlias.toLowerCase().replace(/[\s-]/g, '_');
    const standardId = this.aliasMap.get(clean) || clean;
    return this.standardGestures.get(standardId);
  }

  /**
   * Motor de Anticipación Proactiva: Predice lo que el usuario deseará antes de que lo pida
   * basándose en contexto musical, estado de conversación, modo de personalidad y tono.
   */
  getAnticipatedGestures(context: {
    isMusicPlaying?: boolean;
    lastMessage?: string;
    emotion?: string;
    personalityMode?: string;
    isHotMode?: boolean;
  }): GestureDefinition[] {
    const text = (context.lastMessage || '').toLowerCase();
    const suggestions: string[] = [];

    // 1. Música activa o ritmo detectado en analizador
    if (context.isMusicPlaying) {
      suggestions.push('dance', 'rhythm_bounce', 'sing', 'celebrate');
    }

    // 2. Saludo o despedida
    if (text.includes('hola') || text.includes('buenas') || text.includes('hey') || text.includes('salud') || text.includes('chao') || text.includes('adiós') || text.includes('bye')) {
      suggestions.push('wave', 'bow', 'curious_lean');
    }

    // 3. Elogios, cariño o modo ninfómano / waifu
    if (context.isHotMode || context.personalityMode === 'nympho' || context.personalityMode === 'waifu' || text.includes('linda') || text.includes('hermosa') || text.includes('te quiero') || text.includes('beso') || text.includes('guapa') || text.includes('sexy')) {
      suggestions.push('blow_kiss', 'pose_sexy', 'flirt', 'shy', 'playful_tease');
    }

    // 4. Preguntas, dudas o reflexión
    if (text.includes('?') || text.includes('cómo') || text.includes('por qué') || text.includes('qué opinas') || text.includes('crees')) {
      suggestions.push('thinking', 'listen_attentive', 'curious_lean', 'confused');
    }

    // 5. Éxito, alegría o festejo
    if (text.includes('bien') || text.includes('gracias') || text.includes('genial') || text.includes('lo logramos') || text.includes('excelente') || text.includes('perfecto')) {
      suggestions.push('celebrate', 'clap', 'peace', 'happy');
    }

    // Default balanceado e inteligente si no hay match directo
    if (suggestions.length === 0) {
      if (context.isHotMode || context.personalityMode === 'nympho') {
        suggestions.push('pose_sexy', 'blow_kiss', 'flirt', 'playful_tease');
      } else {
        suggestions.push('wave', 'curious_lean', 'rhythm_bounce', 'peace');
      }
    }

    const uniqueIds = Array.from(new Set(suggestions)).slice(0, 4);
    return uniqueIds
      .map(id => this.standardGestures.get(id))
      .filter((g): g is GestureDefinition => !!g);
  }

  /**
   * Registra una animación externa o custom (ej. Mixamo, VMD, FBX subida por el usuario)
   */
  registerCustomAnimation(name: string, customTag?: string, duration?: number, isRhythmic?: boolean): void {
    const cleanName = name.toLowerCase().replace(/[\s-]/g, '_');
    this.customAnimations.set(cleanName, {
      tag: customTag || cleanName,
      duration,
      isRhythmic: isRhythmic ?? (cleanName.includes('dance') || cleanName.includes('kpop') || cleanName.includes('hiphop'))
    });

    if (customTag) {
      const cleanTag = customTag.toLowerCase().replace(/[\s-]/g, '_');
      this.customAnimations.set(cleanTag, {
        tag: cleanTag,
        duration,
        isRhythmic: isRhythmic ?? (cleanTag.includes('dance') || cleanTag.includes('kpop') || cleanTag.includes('hiphop'))
      });
    }

    console.log(`✨ [GestureRegistry] Animación custom registrada: "${name}" ${customTag ? `(tag: ${customTag})` : ''}`);
  }

  /**
   * Despachador inteligente: resuelve si una acción solicitada por Nova o el usuario
   * debe reproducirse como un clip de animación real (si existe) o como gesto procedural estándar.
   */
  resolveAction(
    actionName: string,
    hasClipFn?: (name: string) => boolean
  ): ResolvedAction {
    if (!actionName) {
      return { type: 'procedural', name: 'wave', duration: 2.6 };
    }

    const raw = actionName.toLowerCase().replace(/[\s-]/g, '_');
    const standardId = this.aliasMap.get(raw) || raw;

    // 0. VERIFICAR OVERRIDE EXPLÍCITO DE ALTA CALIDAD (VMD / PACK ASIGNADO POR EL USUARIO)
    const overrideName = this.gestureOverrides.get(standardId) || this.gestureOverrides.get(raw);
    if (overrideName) {
      // 🔒 REGLA: Los gestos y bailes conscientes deben reproducirse 1 sola vez (no bucle infinito)
      const isLoop = overrideName.toLowerCase() === 'idle';
      return {
        type: 'clip',
        name: overrideName,
        isLoop,
        priority: 10
      };
    }

    // 1. Verificar si existe un clip de animación real de alta calidad en AnimationManager
    if (hasClipFn) {
      const capitalized = standardId.charAt(0).toUpperCase() + standardId.slice(1);
      const candidates = [
        standardId,
        raw,
        capitalized,
        raw.charAt(0).toUpperCase() + raw.slice(1),
        `${standardId}_01`,
        `${capitalized}_01`,
        `${standardId}_idle`,
        `${standardId}idle`
      ];

      for (const cand of candidates) {
        if (hasClipFn(cand)) {
          const isLoop = cand.toLowerCase().includes('idle');
          return { type: 'clip', name: cand, isLoop };
        }
      }

      // Probar coincidencia en animaciones custom registradas
      if (this.customAnimations.has(raw)) {
        const custom = this.customAnimations.get(raw)!;
        if (hasClipFn(custom.tag)) {
          return { type: 'clip', name: custom.tag, duration: custom.duration };
        }
      }
    }

    // 2. Si no hay clip real, caer de forma transparente y fluida en el gesto procedural estándar
    const def = this.standardGestures.get(standardId);

    return {
      type: 'procedural',
      name: standardId,
      duration: def?.defaultDuration || 2.5
    };
  }

  /**
   * Genera el bloque de instrucciones dinámicas para el System Prompt de Gemini (Nova)
   * Informa a Nova de todos los gestos estándar + todas las animaciones personalizadas agregadas.
   */
  generatePromptContext(): string {
    const greetings = STANDARD_GESTURES.filter(g => g.category === 'greeting').map(g => `[DO:${g.id.toUpperCase()}] (${g.name})`).join(' | ');
    const reactions = STANDARD_GESTURES.filter(g => g.category === 'reaction').map(g => `[DO:${g.id.toUpperCase()}] (${g.name})`).join(' | ');
    const emotions = STANDARD_GESTURES.filter(g => g.category === 'emotion').map(g => `[DO:${g.id.toUpperCase()}] (${g.name})`).join(' | ');
    const charms = STANDARD_GESTURES.filter(g => g.category === 'charm').map(g => `[DO:${g.id.toUpperCase()}] (${g.name})`).join(' | ');
    const body = STANDARD_GESTURES.filter(g => g.category === 'body').map(g => `[DO:${g.id.toUpperCase()}] (${g.name})`).join(' | ');
    const dances = STANDARD_GESTURES.filter(g => g.category === 'dance').map(g => `[DO:${g.id.toUpperCase()}] (${g.name})`).join(' | ');

    let customStr = '';
    if (this.customAnimations.size > 0) {
      const customTags = Array.from(new Set(Array.from(this.customAnimations.values()).map(c => c.tag.toUpperCase())));
      customStr = `\n       - ANIMACIONES ADICIONALES INSTALADAS: ${customTags.map(t => `[DO:${t}]`).join(' | ')}`;
    }

    return `
    REPERTORIO ESTÁNDAR DE GESTOS Y ANIMACIONES (TOTALMENTE ACTIVO Y DISPONIBLE):
    Puedes invocar cualquiera de estas acciones temporales usando la etiqueta [DO:ACCIÓN] en tu respuesta:
       - Saludos: ${greetings}
       - Reacciones y Diálogo: ${reactions}
       - Emociones: ${emotions}
       - Coqueteo y Encanto: ${charms}
       - Posturas Corporales: ${body}
       - Música y Baile: ${dances}${customStr}

    REGLA: Usa estas acciones con naturalidad mientras hablas o escuchas música para dar vida a tu cuerpo 3D.
    Si el usuario pone música o te pide bailar, usa [DO:DANCE], [DO:RHYTHM_BOUNCE] o [DO:SING]. El sistema sincroniza automáticamente tu movimiento al ritmo de la música.
    `;
  }
}

// Instancia global compartida
export const gestureRegistry = new GestureRegistry();
