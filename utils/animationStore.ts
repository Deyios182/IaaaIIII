/**
 * Animation Store - Almacén global persistente de animaciones cargadas
 * Sobrevive a la navegación entre páginas
 */

export interface StoredAnimation {
  name: string;
  url: string;            // Blob URL o path
  type: 'glb' | 'fbx';
  source: 'mixamo' | 'custom' | 'procedural';
  addedAt: number;
  duration?: number;
}

// Almacén en memoria (sobrevive navegación, se pierde al recargar)
let loadedAnimations: StoredAnimation[] = [];

// Callbacks de suscripción
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notify() {
  listeners.forEach(fn => fn());
}

export const animationStore = {
  /** Obtener todas las animaciones cargadas */
  getAll(): StoredAnimation[] {
    return [...loadedAnimations];
  },

  /** Agregar una animación */
  add(anim: Omit<StoredAnimation, 'addedAt'>): StoredAnimation {
    // Evitar duplicados por nombre
    const existing = loadedAnimations.find(a => a.name === anim.name);
    if (existing) {
      console.log(`🎬 Animación "${anim.name}" ya existe, actualizando...`);
      loadedAnimations = loadedAnimations.filter(a => a.name !== anim.name);
    }

    const entry: StoredAnimation = {
      ...anim,
      addedAt: Date.now()
    };
    loadedAnimations.push(entry);
    notify();

    // Guardar metadatos en localStorage (sin blob URLs que no persisten)
    try {
      const meta = loadedAnimations.map(a => ({ name: a.name, type: a.type, source: a.source }));
      localStorage.setItem('nova_animations_meta', JSON.stringify(meta));
    } catch (e) { /* ignore */ }

    console.log(`🎬 Animación "${anim.name}" agregada al store (total: ${loadedAnimations.length})`);
    return entry;
  },

  /** Remover una animación */
  remove(name: string): void {
    const anim = loadedAnimations.find(a => a.name === name);
    if (anim?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(anim.url);
    }
    loadedAnimations = loadedAnimations.filter(a => a.name !== name);
    notify();
  },

  /** Obtener por nombre */
  get(name: string): StoredAnimation | undefined {
    return loadedAnimations.find(a => a.name === name);
  },

  /** Suscribirse a cambios */
  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Cantidad */
  count(): number {
    return loadedAnimations.length;
  }
};
