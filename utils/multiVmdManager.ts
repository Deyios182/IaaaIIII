/**
 * Multi VMD Manager - Gestor de Coreografías Grupales (2 a 5 Bailarines)
 * Permite asignar pistas VMD individuales a posiciones en el escenario,
 * sincronizar mixers de animación de clones y coordinar audio + cámara cinematográfica.
 * Persiste la configuración en localStorage y los buffers en IndexedDB (NovaGroupDanceDB).
 */

import { animationStore } from './animationStore';

export interface GroupSlotConfig {
  id: string;
  name: string;        // ej: "Puesto 1 (Centro / Líder)"
  role: 'center' | 'left1' | 'right1' | 'left2' | 'right2';
  defaultOffsetX: number;
  defaultOffsetZ: number;
  vmdName?: string;
  vmdBuffer?: ArrayBuffer;
  vmdUrl?: string;
  sourceAnimName?: string; // Nombre de la animación en animationStore
}

export interface GroupDanceState {
  dancerCount: number; // 2, 3, 4 o 5
  slots: GroupSlotConfig[];
  audioUrl?: string;
  audioName?: string;
  cameraBuffer?: ArrayBuffer;
  cameraName?: string;
  isPlaying: boolean;
}

export const DEFAULT_GROUP_SLOTS: GroupSlotConfig[] = [
  { id: 'slot_center', name: 'Centro (Líder)', role: 'center', defaultOffsetX: 0, defaultOffsetZ: 0 },
  { id: 'slot_left1', name: 'Izquierda 1', role: 'left1', defaultOffsetX: -1.6, defaultOffsetZ: -0.2 },
  { id: 'slot_right1', name: 'Derecha 1', role: 'right1', defaultOffsetX: 1.6, defaultOffsetZ: -0.2 },
  { id: 'slot_left2', name: 'Extremo Izquierdo', role: 'left2', defaultOffsetX: -3.2, defaultOffsetZ: -0.5 },
  { id: 'slot_right2', name: 'Extremo Derecho', role: 'right2', defaultOffsetX: 3.2, defaultOffsetZ: -0.5 }
];

const DB_NAME = 'NovaGroupDanceDB';
const STORE_NAME = 'buffers';
const LOCAL_STORAGE_KEY = 'nova_group_dance_config';

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB no está disponible'));
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
  });
}

async function saveDBBuffer(key: string, data: any): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, key);
  } catch (err) {
    console.warn(`⚠️ [MultiVmdManager] Error guardando ${key} en IndexedDB:`, err);
  }
}

async function getDBBuffer(key: string): Promise<any | null> {
  try {
    const db = await getDB();
    return new Promise(resolve => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(key);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

async function deleteDBBuffer(key: string): Promise<void> {
  try {
    const db = await getDB();
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
  } catch {}
}

class MultiVmdManager {
  private dancerCount: number = 3;
  private slots: GroupSlotConfig[] = JSON.parse(JSON.stringify(DEFAULT_GROUP_SLOTS));
  private audioUrl: string | undefined = undefined;
  private audioName: string | undefined = undefined;
  private cameraBuffer: ArrayBuffer | undefined = undefined;
  private cameraName: string | undefined = undefined;
  private cameraSourceAnimName: string | undefined = undefined;
  private isPlaying: boolean = false;
  private listeners: Set<() => void> = new Set();
  private isInitialized: boolean = false;

  constructor() {
    this.init();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
  }

  private saveMeta() {
    try {
      const meta = {
        dancerCount: this.dancerCount,
        slots: this.slots.map(s => ({
          id: s.id,
          name: s.name,
          role: s.role,
          defaultOffsetX: s.defaultOffsetX,
          defaultOffsetZ: s.defaultOffsetZ,
          vmdName: s.vmdName,
          sourceAnimName: s.sourceAnimName
        })),
        audioName: this.audioName,
        cameraName: this.cameraName,
        cameraSourceAnimName: this.cameraSourceAnimName
      };
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(meta));
    } catch (err) {
      console.warn('⚠️ [MultiVmdManager] Error guardando metadatos en localStorage:', err);
    }
  }

  public async init(): Promise<void> {
    if (this.isInitialized) return;
    this.isInitialized = true;

    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (saved) {
        const meta = JSON.parse(saved);
        if (meta.dancerCount) {
          this.dancerCount = Math.max(2, Math.min(5, meta.dancerCount));
        }
        if (Array.isArray(meta.slots)) {
          meta.slots.forEach((sMeta: any) => {
            const slot = this.slots.find(s => s.id === sMeta.id);
            if (slot) {
              slot.vmdName = sMeta.vmdName;
              slot.sourceAnimName = sMeta.sourceAnimName;
              if (sMeta.defaultOffsetX !== undefined) slot.defaultOffsetX = sMeta.defaultOffsetX;
              if (sMeta.defaultOffsetZ !== undefined) slot.defaultOffsetZ = sMeta.defaultOffsetZ;
            }
          });
        }
        if (meta.audioName) {
          this.audioName = meta.audioName;
        }
        if (meta.cameraName) {
          this.cameraName = meta.cameraName;
          this.cameraSourceAnimName = meta.cameraSourceAnimName;
        }
      }

      // Rehidratar buffers de cada slot desde IndexedDB o animationStore
      for (const slot of this.slots) {
        if (slot.vmdName) {
          let buf: ArrayBuffer | null = await getDBBuffer(`slot_buf_${slot.id}`);
          if (!buf && slot.sourceAnimName) {
            try {
              buf = await animationStore.getFileBuffer(slot.sourceAnimName);
              if (buf) {
                await saveDBBuffer(`slot_buf_${slot.id}`, buf);
              }
            } catch (_) {}
          }
          if (buf && buf.byteLength > 0) {
            slot.vmdBuffer = buf;
          }
        }
      }

      // Rehidratar audio
      const audioData = await getDBBuffer('group_audio');
      if (audioData) {
        const blob = audioData instanceof Blob ? audioData : new Blob([audioData], { type: 'audio/mpeg' });
        this.audioUrl = URL.createObjectURL(blob);
      }

      // Rehidratar cámara
      let camBuf: ArrayBuffer | null = await getDBBuffer('group_camera');
      if (!camBuf && this.cameraSourceAnimName) {
        try {
          camBuf = await animationStore.getCameraBuffer(this.cameraSourceAnimName);
          if (camBuf) {
            await saveDBBuffer('group_camera', camBuf);
          }
        } catch (_) {}
      }
      if (camBuf && camBuf.byteLength > 0) {
        this.cameraBuffer = camBuf;
      }

      console.log(`💾 [MultiVmdManager] Configuración de coreografía grupal restaurada exitosamente.`);
      this.notify();
    } catch (err) {
      console.warn('⚠️ [MultiVmdManager] Error inicializando estado persistente:', err);
    }
  }

  public getState(): GroupDanceState {
    return {
      dancerCount: this.dancerCount,
      slots: this.slots.slice(0, this.dancerCount),
      audioUrl: this.audioUrl,
      audioName: this.audioName,
      cameraBuffer: this.cameraBuffer,
      cameraName: this.cameraName,
      isPlaying: this.isPlaying
    };
  }

  public setDancerCount(count: number) {
    this.dancerCount = Math.max(2, Math.min(5, count));
    this.saveMeta();
    this.notify();
  }

  public async setSlotVmd(slotId: string, vmdName: string, buffer: ArrayBuffer, url?: string, sourceAnimName?: string) {
    const slot = this.slots.find(s => s.id === slotId);
    if (slot) {
      slot.vmdName = vmdName;
      slot.vmdBuffer = buffer;
      slot.vmdUrl = url;
      slot.sourceAnimName = sourceAnimName;
      this.saveMeta();
      this.notify();

      if (buffer && buffer.byteLength > 0) {
        await saveDBBuffer(`slot_buf_${slotId}`, buffer);
      }
    }
  }

  public async clearSlot(slotId: string) {
    const slot = this.slots.find(s => s.id === slotId);
    if (slot) {
      slot.vmdName = undefined;
      slot.vmdBuffer = undefined;
      slot.vmdUrl = undefined;
      slot.sourceAnimName = undefined;
      this.saveMeta();
      this.notify();
      await deleteDBBuffer(`slot_buf_${slotId}`);
    }
  }

  public async setAudio(name: string, url: string, fileOrBlob?: Blob | File | ArrayBuffer) {
    this.audioName = name;
    this.audioUrl = url;
    this.saveMeta();
    this.notify();

    if (fileOrBlob) {
      await saveDBBuffer('group_audio', fileOrBlob);
    } else if (url && (url.startsWith('blob:') || url.startsWith('data:') || url.startsWith('http'))) {
      try {
        const resp = await fetch(url);
        const blob = await resp.blob();
        await saveDBBuffer('group_audio', blob);
      } catch (err) {
        console.warn('⚠️ [MultiVmdManager] No se pudo persistir el blob de audio:', err);
      }
    }
  }

  public async clearAudio() {
    if (this.audioUrl && this.audioUrl.startsWith('blob:')) {
      try { URL.revokeObjectURL(this.audioUrl); } catch (_) {}
    }
    this.audioName = undefined;
    this.audioUrl = undefined;
    this.saveMeta();
    this.notify();
    await deleteDBBuffer('group_audio');
  }

  public async setCamera(name: string, buffer: ArrayBuffer, sourceAnimName?: string) {
    this.cameraName = name;
    this.cameraBuffer = buffer;
    this.cameraSourceAnimName = sourceAnimName;
    this.saveMeta();
    this.notify();

    if (buffer && buffer.byteLength > 0) {
      await saveDBBuffer('group_camera', buffer);
    }
  }

  public async clearCamera() {
    this.cameraName = undefined;
    this.cameraBuffer = undefined;
    this.cameraSourceAnimName = undefined;
    this.saveMeta();
    this.notify();
    await deleteDBBuffer('group_camera');
  }

  public playGroupDance() {
    const activeSlots = this.slots.slice(0, this.dancerCount);
    const hasAnyMotion = activeSlots.some(s => !!s.vmdBuffer || !!s.vmdUrl);
    if (!hasAnyMotion) {
      console.warn('⚠️ [MultiVmdManager] Asigna al menos 1 archivo VMD a algún puesto para reproducir.');
      return false;
    }

    this.isPlaying = true;
    this.notify();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nova-multi-dance-play', {
        detail: {
          slots: activeSlots,
          dancerCount: this.dancerCount,
          audioUrl: this.audioUrl,
          cameraBuffer: this.cameraBuffer,
          cameraName: this.cameraName
        }
      }));
    }
    return true;
  }

  public stopGroupDance() {
    this.isPlaying = false;
    this.notify();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nova-multi-dance-stop'));
    }
  }
}

export const multiVmdManager = new MultiVmdManager();
