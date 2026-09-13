/**
 * Animation Store - Almacén global persistente de animaciones cargadas
 * Guarda archivos en IndexedDB para persistir recargas.
 */

import { LegCalibrationData, DEFAULT_LEG_CALIBRATION } from './legIkSolver';
export type { LegCalibrationData };
export { DEFAULT_LEG_CALIBRATION };

export interface ExtraDancerMotion {
  id: string;             // Ej: 'dancer_2', 'dancer_3', etc.
  name: string;           // Ej: 'Bailarín 2 (Izquierda)'
  role: string;           // Ej: 'Izquierda', 'Derecha', etc.
  vmdFileName?: string;   // Nombre del archivo .vmd asignado
  vmdUrl?: string;        // Blob URL o referencia
  vmdSourceAnim?: string; // Nombre del baile de la biblioteca si fue tomado de uno existente
  defaultOffsetX: number; // Offset horizontal en metros (ej: -1.8, 1.8)
  defaultOffsetZ: number; // Offset de profundidad (ej: 0, -0.3)
}

export interface StoredAnimation {
  name: string;
  url: string;            // Blob URL (se regenera en cada sesión)
  type: 'glb' | 'fbx' | 'vmd';
  source: 'mixamo' | 'custom' | 'procedural';
  addedAt: number;
  duration?: number;
  customTag?: string;     // Etiqueta personalizada para que Nova la use, ej: 'hiphop'
  fixArms?: boolean;      // Hack para arreglar brazos invertidos en modelos anime
  posePreset?: 'none' | 'vrm'; // Preset de calibración (ej: levantar brazos para VRM A-Pose)
  audioUrl?: string;      // Blob URL del audio asociado a esta animación (temporal)
  audioFileName?: string; // Nombre del archivo de audio original (para restaurar)
  cameraUrl?: string;     // Blob URL del archivo de cámara VMD asociado
  cameraFileName?: string;// Nombre del archivo de cámara (ej: camera.vmd)
  hasCamera?: boolean;    // Si tiene cámara cinemática (integrada o vinculada)
  useCamera?: boolean;    // Si la reproducción debe activar la cámara cinemática
  facialUrl?: string;     // Blob URL del archivo de expresiones faciales / morphs VMD asociado
  facialFileName?: string;// Nombre del archivo facial (ej: face.vmd, facial.vmd)
  hasFacial?: boolean;    // Si tiene animación facial (integrada o vinculada)
  useFacial?: boolean;    // Si la reproducción debe aplicar expresiones faciales
  legCalibration?: LegCalibrationData; // Parámetros IK de piernas para animaciones VMD
  displayName?: string;   // Nombre amigable en español/inglés (ej: "Baile Gokuraku") para facilitar identificación de nombres en chino
  category?: string;      // Categoría: 'dance' | 'greeting' | 'reaction' | 'charm' | 'song' | 'body' | 'other'
  assignedGesture?: string; // ID del gesto procedural al que sustituye (ej: 'wave', 'dance', 'bow')
  loop?: boolean;         // Reproducción en bucle continuo
  cameraMode?: 'vmd' | 'dynamic' | 'free' | 'full' | 'face'; // Modo de cámara preferido
  boneOffsets?: BoneOffsets; // Ajustes manuales de rotación por grupo de huesos (grados)
  extraMotions?: ExtraDancerMotion[]; // Bailarines extra / motions secundarios para coreografías grupales (2-5 personajes)
}

/** Ajustes manuales de rotación para corrección fina del retargeting */
export interface BoneOffsets {
  spineTiltX?: number;  // Inclinación adelante(+)/atrás(-) del torso en grados
  spineTiltZ?: number;  // Inclinación lateral izquierda(+)/derecha(-) del torso
  armDownL?: number;    // Rotación del brazo izquierdo hacia abajo (+) en grados
  armDownR?: number;    // Rotación del brazo derecho hacia abajo (+) en grados
  hipTiltX?: number;    // Inclinación de la cadera adelante(+)/atrás(-) en grados
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
const AUDIO_STORE_NAME = 'audioFiles';
const CAMERA_STORE_NAME = 'cameraFiles';
const FACIAL_STORE_NAME = 'facialFiles';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4); // version 4: añade facialFiles store
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(AUDIO_STORE_NAME)) {
        db.createObjectStore(AUDIO_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(CAMERA_STORE_NAME)) {
        db.createObjectStore(CAMERA_STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FACIAL_STORE_NAME)) {
        db.createObjectStore(FACIAL_STORE_NAME);
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
        keysRequest.onsuccess = async () => {
          const files = request.result as File[];
          const keys = keysRequest.result as string[];
          
          let storedMeta: any[] = [];
          try {
            storedMeta = JSON.parse(localStorage.getItem('nova_animations_meta') || '[]');
          } catch (e) {}

          // Restaurar audio guardado
          const audioUrls = new Map<string, string>();
          try {
            const db2 = await getDB();
            const audioTx = db2.transaction(AUDIO_STORE_NAME, 'readonly');
            const audioStore = audioTx.objectStore(AUDIO_STORE_NAME);
            const audioReq = audioStore.getAll();
            const audioKeysReq = audioStore.getAllKeys();
            await new Promise<void>(resolve => {
              audioReq.onsuccess = () => {
                audioKeysReq.onsuccess = () => {
                  const audioFiles = audioReq.result as File[];
                  const audioKeys = audioKeysReq.result as string[];
                  audioFiles.forEach((file, i) => {
                    audioUrls.set(audioKeys[i] as string, URL.createObjectURL(file));
                  });
                  resolve();
                };
              };
              audioReq.onerror = () => resolve();
            });
          } catch (_) {}

          // Restaurar cámaras VMD guardadas
          const cameraUrls = new Map<string, string>();
          try {
            const db3 = await getDB();
            const camTx = db3.transaction(CAMERA_STORE_NAME, 'readonly');
            const camStore = camTx.objectStore(CAMERA_STORE_NAME);
            const camReq = camStore.getAll();
            const camKeysReq = camStore.getAllKeys();
            await new Promise<void>(resolve => {
              camReq.onsuccess = () => {
                camKeysReq.onsuccess = () => {
                  const camFiles = camReq.result as File[];
                  const camKeys = camKeysReq.result as string[];
                  camFiles.forEach((file, i) => {
                    cameraUrls.set(camKeys[i] as string, URL.createObjectURL(file));
                  });
                  resolve();
                };
              };
              camReq.onerror = () => resolve();
            });
          } catch (_) {}

          // Restaurar expresiones faciales VMD guardadas
          const facialUrls = new Map<string, string>();
          try {
            const db4 = await getDB();
            const faceTx = db4.transaction(FACIAL_STORE_NAME, 'readonly');
            const faceStore = faceTx.objectStore(FACIAL_STORE_NAME);
            const faceReq = faceStore.getAll();
            const faceKeysReq = faceStore.getAllKeys();
            await new Promise<void>(resolve => {
              faceReq.onsuccess = () => {
                faceKeysReq.onsuccess = () => {
                  const faceFiles = faceReq.result as File[];
                  const faceKeys = faceKeysReq.result as string[];
                  faceFiles.forEach((file, i) => {
                    facialUrls.set(faceKeys[i] as string, URL.createObjectURL(file));
                  });
                  resolve();
                };
              };
              faceReq.onerror = () => resolve();
            });
          } catch (_) {}

          files.forEach((file, index) => {
            const name = keys[index];
            const meta = storedMeta.find(m => m.name === name) || {};
            const url = URL.createObjectURL(file);
            const audioUrl = audioUrls.get(`audio_${name}`);
            const cameraUrl = cameraUrls.get(`camera_${name}`);
            const facialUrl = facialUrls.get(`facial_${name}`);
            const extType = file.name.endsWith('.fbx') ? 'fbx' : file.name.endsWith('.vmd') ? 'vmd' : 'glb';
            
            loadedAnimations.push({
              name,
              url,
              type: meta.type || extType,
              source: meta.source || (extType === 'vmd' ? 'custom' : 'mixamo'),
              addedAt: meta.addedAt || Date.now(),
              customTag: meta.customTag,
              fixArms: meta.fixArms || false,
              posePreset: meta.posePreset || 'none',
              audioUrl,
              audioFileName: meta.audioFileName,
              cameraUrl,
              cameraFileName: meta.cameraFileName,
              hasCamera: meta.hasCamera || !!cameraUrl,
              useCamera: meta.useCamera !== false,
              facialUrl,
              facialFileName: meta.facialFileName,
              hasFacial: meta.hasFacial || !!facialUrl,
              useFacial: meta.useFacial !== false,
              legCalibration: meta.legCalibration,
              displayName: meta.displayName,
              category: meta.category,
              assignedGesture: meta.assignedGesture,
              loop: !!meta.loop,
              cameraMode: meta.cameraMode,
              boneOffsets: meta.boneOffsets,
              extraMotions: meta.extraMotions,
            });

            
            window.dispatchEvent(new CustomEvent('nova-load-animation', { 
                detail: { url, name, type: meta.type || extType, autoplay: false } 
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
        posePreset: a.posePreset, audioFileName: a.audioFileName,
        cameraFileName: a.cameraFileName, hasCamera: a.hasCamera, useCamera: a.useCamera,
        legCalibration: a.legCalibration,
        displayName: a.displayName, category: a.category, assignedGesture: a.assignedGesture,
        loop: a.loop, cameraMode: a.cameraMode, boneOffsets: a.boneOffsets
      }));

      localStorage.setItem('nova_animations_meta', JSON.stringify(meta));
    } catch (e) { }
  },

  /** Alternar bucle continuo para una animación */
  toggleLoop(animName: string, enabled?: boolean): boolean {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (!anim) return false;
    const newVal = enabled !== undefined ? enabled : !anim.loop;
    this.updateMeta(animName, { loop: newVal });
    return newVal;
  },

  /** Actualizar la calibración IK de piernas para una animación VMD */
  updateLegCalibration(animName: string, calibration: Partial<LegCalibrationData>) {
    const idx = loadedAnimations.findIndex(a => a.name === animName);
    if (idx !== -1) {
      const currentCal = loadedAnimations[idx].legCalibration || { ...DEFAULT_LEG_CALIBRATION };
      const updatedCal: LegCalibrationData = { ...currentCal, ...calibration };
      loadedAnimations[idx].legCalibration = updatedCal;
      this.saveMeta();
      notify();
      window.dispatchEvent(new CustomEvent('nova-leg-calibration', { detail: updatedCal }));
    }
  },

  /** Asignar un archivo de audio a una animación y persistirlo en IndexedDB */
  async setAudio(animName: string, audioFile: File): Promise<string> {
    const audioUrl = URL.createObjectURL(audioFile);
    this.updateMeta(animName, { audioUrl, audioFileName: audioFile.name });
    try {
      const db = await getDB();
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      tx.objectStore(AUDIO_STORE_NAME).put(audioFile, `audio_${animName}`);
    } catch (err) {
      console.error('Error guardando audio en IndexedDB:', err);
    }
    return audioUrl;
  },

  /** Quitar el audio de una animación */
  async removeAudio(animName: string): Promise<void> {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (anim?.audioUrl?.startsWith('blob:')) URL.revokeObjectURL(anim.audioUrl);
    this.updateMeta(animName, { audioUrl: undefined, audioFileName: undefined });
    try {
      const db = await getDB();
      const tx = db.transaction(AUDIO_STORE_NAME, 'readwrite');
      tx.objectStore(AUDIO_STORE_NAME).delete(`audio_${animName}`);
    } catch (err) {
      console.error('Error borrando audio de IndexedDB:', err);
    }
  },

  /** Asignar un archivo de cámara VMD a una animación y persistirlo en IndexedDB */
  async setCamera(animName: string, cameraFile: File): Promise<string> {
    const cameraUrl = URL.createObjectURL(cameraFile);
    this.updateMeta(animName, { cameraUrl, cameraFileName: cameraFile.name, hasCamera: true, useCamera: true });
    try {
      const db = await getDB();
      const tx = db.transaction(CAMERA_STORE_NAME, 'readwrite');
      tx.objectStore(CAMERA_STORE_NAME).put(cameraFile, `camera_${animName}`);
      console.log(`🎥 Cámara guardada en IndexedDB para "${animName}"`);
    } catch (err) {
      console.error('Error guardando cámara en IndexedDB:', err);
    }
    return cameraUrl;
  },

  /** Quitar la cámara de una animación */
  async removeCamera(animName: string): Promise<void> {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (anim?.cameraUrl?.startsWith('blob:')) URL.revokeObjectURL(anim.cameraUrl);
    this.updateMeta(animName, { cameraUrl: undefined, cameraFileName: undefined, hasCamera: false });
    try {
      const db = await getDB();
      const tx = db.transaction(CAMERA_STORE_NAME, 'readwrite');
      tx.objectStore(CAMERA_STORE_NAME).delete(`camera_${animName}`);
    } catch (err) {
      console.error('Error borrando cámara de IndexedDB:', err);
    }
  },

  /** Alternar o fijar si la cámara cinemática debe activarse al reproducir */
  toggleCamera(animName: string, enabled?: boolean): boolean {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (!anim) return false;
    const newVal = enabled !== undefined ? enabled : !(anim.useCamera !== false);
    this.updateMeta(animName, { useCamera: newVal });
    return newVal;
  },

  /** Asignar un archivo de expresiones faciales / morphs VMD a una animación y persistirlo en IndexedDB */
  async setFacial(animName: string, facialFile: File): Promise<string> {
    const facialUrl = URL.createObjectURL(facialFile);
    this.updateMeta(animName, { facialUrl, facialFileName: facialFile.name, hasFacial: true, useFacial: true });
    try {
      const db = await getDB();
      const tx = db.transaction(FACIAL_STORE_NAME, 'readwrite');
      tx.objectStore(FACIAL_STORE_NAME).put(facialFile, `facial_${animName}`);
      console.log(`🎭 Facial guardado en IndexedDB para "${animName}"`);
    } catch (err) {
      console.error('Error guardando facial en IndexedDB:', err);
    }
    return facialUrl;
  },

  /** Quitar la animación facial de una animación */
  async removeFacial(animName: string): Promise<void> {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (anim?.facialUrl?.startsWith('blob:')) URL.revokeObjectURL(anim.facialUrl);
    this.updateMeta(animName, { facialUrl: undefined, facialFileName: undefined, hasFacial: false });
    try {
      const db = await getDB();
      const tx = db.transaction(FACIAL_STORE_NAME, 'readwrite');
      tx.objectStore(FACIAL_STORE_NAME).delete(`facial_${animName}`);
    } catch (err) {
      console.error('Error borrando facial de IndexedDB:', err);
    }
  },

  /** Alternar o fijar si las expresiones faciales deben aplicarse al reproducir */
  toggleFacial(animName: string, enabled?: boolean): boolean {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (!anim) return false;
    const newVal = enabled !== undefined ? enabled : !(anim.useFacial !== false);
    this.updateMeta(animName, { useFacial: newVal });
    return newVal;
  },

  async remove(name: string) {
    const anim = loadedAnimations.find(a => a.name === name);
    if (anim?.url?.startsWith('blob:')) {
      URL.revokeObjectURL(anim.url);
    }
    if (anim?.audioUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(anim.audioUrl);
    }
    if (anim?.cameraUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(anim.cameraUrl);
    }
    if (anim?.facialUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(anim.facialUrl);
    }
    loadedAnimations = loadedAnimations.filter(a => a.name !== name);
    this.saveMeta();
    notify();

    try {
      const db = await getDB();
      const tx = db.transaction([STORE_NAME, AUDIO_STORE_NAME, CAMERA_STORE_NAME, FACIAL_STORE_NAME], 'readwrite');
      tx.objectStore(STORE_NAME).delete(name);
      tx.objectStore(AUDIO_STORE_NAME).delete(`audio_${name}`);
      tx.objectStore(CAMERA_STORE_NAME).delete(`camera_${name}`);
      tx.objectStore(FACIAL_STORE_NAME).delete(`facial_${name}`);
    } catch (err) {
      console.error("Error borrando archivo de IndexedDB:", err);
    }
  },

  get(name: string): StoredAnimation | undefined {
    if (!name) return undefined;
    const clean = name.toLowerCase().trim().replace(/[\s-_]+/g, '');
    return loadedAnimations.find(a => {
      const aName = a.name.toLowerCase().replace(/[\s-_]+/g, '');
      const aTag = a.customTag?.toLowerCase().replace(/[\s-_]+/g, '');
      const aGest = a.assignedGesture?.toLowerCase().replace(/[\s-_]+/g, '');
      return a.name === name || aName === clean || (aTag && aTag === clean) || (aGest && aGest === clean);
    });
  },

  getByTag(tag: string): StoredAnimation | undefined {
    if (!tag) return undefined;
    const clean = tag.toLowerCase().trim().replace(/[\s-_]+/g, '');
    return loadedAnimations.find(a => a.customTag?.toLowerCase().replace(/[\s-_]+/g, '') === clean);
  },

  async getFileBuffer(name: string): Promise<ArrayBuffer | null> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(name);
      return new Promise((resolve) => {
        req.onsuccess = async () => {
          const file = req.result as File | undefined;
          if (file) {
            const buf = await file.arrayBuffer();
            resolve(buf);
          } else {
            // Intentar con la URL blob si existe en memoria
            const anim = loadedAnimations.find(a => a.name === name);
            if (anim?.url) {
              try {
                const resp = await fetch(anim.url);
                const buf = await resp.arrayBuffer();
                resolve(buf);
                return;
              } catch (_) {}
            }
            resolve(null);
          }
        };
      });
    } catch (err) {
      console.error('Error obteniendo buffer de IndexedDB:', err);
      return null;
    }
  },

  async getCameraBuffer(name: string): Promise<ArrayBuffer | null> {
    try {
      const db = await getDB();
      const tx = db.transaction(CAMERA_STORE_NAME, 'readonly');
      const store = tx.objectStore(CAMERA_STORE_NAME);
      const req = store.get(`camera_${name}`);
      return new Promise((resolve) => {
        req.onsuccess = async () => {
          const file = req.result as File | undefined;
          if (file) {
            const buf = await file.arrayBuffer();
            resolve(buf);
          } else {
            const anim = loadedAnimations.find(a => a.name === name);
            if (anim?.cameraUrl) {
              try {
                const resp = await fetch(anim.cameraUrl);
                const buf = await resp.arrayBuffer();
                resolve(buf);
                return;
              } catch (_) {}
            }
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.error('Error obteniendo buffer de cámara de IndexedDB:', err);
      return null;
    }
  },

  /** Asignar un motion VMD a un bailarín secundario desde un archivo subido */
  async setExtraMotionFile(animName: string, dancerId: string, name: string, role: string, file: File, offsetX: number, offsetZ: number = 0): Promise<void> {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (!anim) return;

    const vmdUrl = URL.createObjectURL(file);
    const existingMotions = anim.extraMotions ? [...anim.extraMotions] : [];
    const idx = existingMotions.findIndex(m => m.id === dancerId);
    const newEntry: ExtraDancerMotion = {
      id: dancerId,
      name,
      role,
      vmdFileName: file.name,
      vmdUrl,
      defaultOffsetX: offsetX,
      defaultOffsetZ: offsetZ
    };

    if (idx >= 0) existingMotions[idx] = newEntry;
    else existingMotions.push(newEntry);

    this.updateMeta(animName, { extraMotions: existingMotions });

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(file, `extramotion_${animName}_${dancerId}`);
      console.log(`💃 Motion extra guardado en IndexedDB para "${animName}" (${dancerId})`);
    } catch (err) {
      console.error('Error guardando motion extra en IndexedDB:', err);
    }
  },

  /** Asignar un motion VMD a un bailarín secundario reutilizando un baile de la biblioteca */
  async setExtraMotionFromExisting(animName: string, dancerId: string, name: string, role: string, sourceAnimName: string, offsetX: number, offsetZ: number = 0): Promise<void> {
    const anim = loadedAnimations.find(a => a.name === animName);
    const sourceAnim = loadedAnimations.find(a => a.name === sourceAnimName);
    if (!anim || !sourceAnim) return;

    const existingMotions = anim.extraMotions ? [...anim.extraMotions] : [];
    const idx = existingMotions.findIndex(m => m.id === dancerId);
    const newEntry: ExtraDancerMotion = {
      id: dancerId,
      name,
      role,
      vmdFileName: sourceAnim.displayName || sourceAnim.name,
      vmdSourceAnim: sourceAnim.name,
      vmdUrl: sourceAnim.url,
      defaultOffsetX: offsetX,
      defaultOffsetZ: offsetZ
    };

    if (idx >= 0) existingMotions[idx] = newEntry;
    else existingMotions.push(newEntry);

    this.updateMeta(animName, { extraMotions: existingMotions });
  },

  /** Quitar bailarín secundario / motion extra de una animación */
  async removeExtraMotion(animName: string, dancerId: string): Promise<void> {
    const anim = loadedAnimations.find(a => a.name === animName);
    if (!anim || !anim.extraMotions) return;

    const target = anim.extraMotions.find(m => m.id === dancerId);
    if (target?.vmdUrl && target.vmdUrl.startsWith('blob:') && !target.vmdSourceAnim) {
      URL.revokeObjectURL(target.vmdUrl);
    }

    const updated = anim.extraMotions.filter(m => m.id !== dancerId);
    this.updateMeta(animName, { extraMotions: updated.length > 0 ? updated : undefined });

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(`extramotion_${animName}_${dancerId}`);
    } catch (err) {
      console.error('Error eliminando motion extra de IndexedDB:', err);
    }
  },

  /** Obtener el ArrayBuffer del motion de un bailarín secundario */
  async getExtraMotionBuffer(animName: string, dancerId: string): Promise<ArrayBuffer | null> {
    const anim = loadedAnimations.find(a => a.name === animName);
    const extra = anim?.extraMotions?.find(m => m.id === dancerId);
    if (!extra) return null;

    // Si viene de un baile existente de la biblioteca, cargar su buffer
    if (extra.vmdSourceAnim) {
      return this.getFileBuffer(extra.vmdSourceAnim);
    }

    // Si se subió directamente para este puesto
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(`extramotion_${animName}_${dancerId}`);
      return new Promise((resolve) => {
        req.onsuccess = async () => {
          const file = req.result as File | undefined;
          if (file) {
            resolve(await file.arrayBuffer());
          } else if (extra.vmdUrl) {
            try {
              const resp = await fetch(extra.vmdUrl);
              resolve(await resp.arrayBuffer());
            } catch {
              resolve(null);
            }
          } else {
            resolve(null);
          }
        };
        req.onerror = () => resolve(null);
      });
    } catch (err) {
      console.error('Error obteniendo buffer de motion extra:', err);
      return null;
    }
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};

// Autocargar al inicio
animationStore.init();
