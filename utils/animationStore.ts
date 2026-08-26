/**
 * Animation Store - Almacén global persistente de animaciones cargadas
 * Guarda archivos en IndexedDB para persistir recargas.
 */

export interface StoredAnimation {
  name: string;
  url: string;            // Blob URL (se regenera en cada sesión)
  type: 'glb' | 'fbx';
  source: 'mixamo' | 'custom' | 'procedural';
  addedAt: number;
  duration?: number;
  customTag?: string;     // Etiqueta personalizada para que Nova la use, ej: 'hiphop'
  fixArms?: boolean;      // Hack para arreglar brazos invertidos en modelos anime
  posePreset?: 'none' | 'vrm'; // Preset de calibración (ej: levantar brazos para VRM A-Pose)
}

// Almacén en memoria
let loadedAnimations: StoredAnimation[] = [];
type Listener = () => void;
const listeners: Set<Listener> = new Set();

function notify() {
  listeners.forEach(fn => fn());
}

// Inicialización de IndexedDB
const DB_NAME = 'NovaAnimationsDB';
const STORE_NAME = 'files';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

export const animationStore = {
  /** Inicializar y cargar animaciones guardadas */
  async init() {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      const keysRequest = store.getAllKeys();

      request.onsuccess = () => {
        keysRequest.onsuccess = () => {
          const files = request.result as File[];
          const keys = keysRequest.result as string[];
          
          let storedMeta: any[] = [];
          try {
            storedMeta = JSON.parse(localStorage.getItem('nova_animations_meta') || '[]');
          } catch (e) {}

          files.forEach((file, index) => {
            const name = keys[index];
            const meta = storedMeta.find(m => m.name === name) || {};
            const url = URL.createObjectURL(file);
            
            loadedAnimations.push({
              name,
              url,
              type: meta.type || (file.name.endsWith('.fbx') ? 'fbx' : 'glb'),
              source: meta.source || 'mixamo',
              addedAt: meta.addedAt || Date.now(),
              customTag: meta.customTag,
              fixArms: meta.fixArms || false,
              posePreset: meta.posePreset || 'none'
            });
            
            // Disparar evento para que el visor 3D sepa que hay una animación lista
            // (Si el modelo ya cargó, las procesará en el background)
            window.dispatchEvent(new CustomEvent('nova-load-animation', { 
                detail: { url, name, type: meta.type || 'fbx' } 
            }));
          });
          
          console.log(`🎬 AnimationStore inicializado: ${loadedAnimations.length} animaciones restauradas.`);
          notify();
        };
      };
    } catch (err) {
      console.error("Error inicializando AnimationStore:", err);
    }
  },

  getAll(): StoredAnimation[] {
    return [...loadedAnimations];
  },

  async add(anim: Omit<StoredAnimation, 'addedAt'>, file?: File): Promise<StoredAnimation> {
    const existing = loadedAnimations.find(a => a.name === anim.name);
    if (existing) {
      loadedAnimations = loadedAnimations.filter(a => a.name !== anim.name);
    }

    const entry: StoredAnimation = {
      ...anim,
      addedAt: Date.now()
    };
    loadedAnimations.push(entry);
    notify();
    this.saveMeta();

    if (file) {
      try {
        const db = await getDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(file, anim.name);
      } catch (err) {
        console.error("Error guardando archivo en IndexedDB:", err);
      }
    }

    return entry;
  },

  updateMeta(name: string, data: Partial<StoredAnimation>) {
    const idx = loadedAnimations.findIndex(a => a.name === name);
    if (idx !== -1) {
      loadedAnimations[idx] = { ...loadedAnimations[idx], ...data };
      this.saveMeta();
      notify();
    }
  },

  saveMeta() {
    try {
      const meta = loadedAnimations.map(a => ({ 
        name: a.name, type: a.type, source: a.source, 
        addedAt: a.addedAt, customTag: a.customTag, fixArms: a.fixArms,
        posePreset: a.posePreset
      }));
      localStorage.setItem('nova_animations_meta', JSON.stringify(meta));
    } catch (e) { }
  },

  async remove(name: string) {
    const anim = loadedAnimations.find(a => a.name === name);
    if (anim?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(anim.url);
    }
    loadedAnimations = loadedAnimations.filter(a => a.name !== name);
    this.saveMeta();
    notify();

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(name);
    } catch (err) {
      console.error("Error borrando archivo de IndexedDB:", err);
    }
  },

  get(name: string): StoredAnimation | undefined {
    return loadedAnimations.find(a => a.name === name);
  },

  getByTag(tag: string): StoredAnimation | undefined {
    return loadedAnimations.find(a => a.customTag === tag);
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};

// Autocargar al inicio
animationStore.init();
