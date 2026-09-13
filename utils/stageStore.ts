/**
 * Stage Store - Gestor de Escenarios 3D (Stages)
 * Almacena y persiste en IndexedDB escenarios MMD (.pmx, .zip, .rar) o modelos 3D (.glb).
 * Incluye presets virtuales listos para usar sin necesidad de archivos externos.
 */

export interface StagePreset {
  id: string;
  name: string;
  icon: string;
  description: string;
  type: 'virtual' | 'custom';
  url?: string;
  fileName?: string;
  addedAt?: number;
  environmentIntensity?: number;
  fogColor?: string;
  fogDensity?: number;
  groundOffset?: number;
  lightPreset?: 'cyberpunk' | 'idol' | 'studio' | 'concert' | 'void';
}

const DB_NAME = 'NovaStagesDB';
const STORE_NAME = 'stages';
const ACTIVE_STAGE_KEY = 'nova_active_stage_id';

export const BUILTIN_STAGES: StagePreset[] = [
  {
    id: 'none',
    name: 'Estudio Clásico',
    icon: '🏢',
    description: 'Estudio neutro con rejilla sutil y sombra de contacto',
    type: 'virtual',
    environmentIntensity: 0.45,
    lightPreset: 'studio'
  },
  {
    id: 'idol_concert',
    name: 'Escenario Idol Concert',
    icon: '✨',
    description: 'Plataforma circular con focos de concierto y destellos de neón',
    type: 'virtual',
    environmentIntensity: 0.65,
    lightPreset: 'concert',
    fogColor: '#0b061a',
    fogDensity: 0.02
  },
  {
    id: 'cyberpunk_grid',
    name: 'Cyberpunk Neon Plaza',
    icon: '🌆',
    description: 'Pista oscura reflectante con líneas holográficas cian y magenta',
    type: 'virtual',
    environmentIntensity: 0.7,
    lightPreset: 'cyberpunk',
    fogColor: '#050510',
    fogDensity: 0.025
  },
  {
    id: 'anime_shrine',
    name: 'Santuario Crepuscular',
    icon: '⛩️',
    description: 'Ambiente cálido místico con faroles y cielo atardecer',
    type: 'virtual',
    environmentIntensity: 0.8,
    lightPreset: 'idol',
    fogColor: '#1f0d14',
    fogDensity: 0.015
  },
  {
    id: 'void_black',
    name: 'Void Stage (Negro Puro)',
    icon: '🌌',
    description: 'Escenario minimalista para destacar al 100% las siluetas y coreografía',
    type: 'virtual',
    environmentIntensity: 0.3,
    lightPreset: 'void'
  }
];

class StageStore {
  private customStages: StagePreset[] = [];
  private activeStageId: string = 'none';
  private db: IDBDatabase | null = null;
  private listeners: Set<() => void> = new Set();

  constructor() {
    if (typeof window !== 'undefined') {
      this.activeStageId = localStorage.getItem(ACTIVE_STAGE_KEY) || 'none';
      this.initDB();
    }
  }

  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = (e: any) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e: any) => {
        this.db = e.target.result;
        this.loadCustomStagesFromDB().then(() => resolve(this.db!));
      };
      request.onerror = (e) => reject(e);
    });
  }

  private async loadCustomStagesFromDB() {
    if (!this.db) return;
    try {
      const tx = this.db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.getAll();
      req.onsuccess = () => {
        const records: any[] = req.result || [];
        this.customStages = records.map(r => {
          const blob = new Blob([r.buffer], { type: r.mimeType || 'application/octet-stream' });
          const url = URL.createObjectURL(blob);
          return {
            id: r.id,
            name: r.name,
            icon: r.icon || '🏛️',
            description: r.description || 'Escenario 3D importado',
            type: 'custom',
            url,
            fileName: r.fileName,
            addedAt: r.addedAt,
            environmentIntensity: r.environmentIntensity ?? 0.6,
            lightPreset: r.lightPreset || 'studio',
            groundOffset: r.groundOffset ?? 0
          };
        });
        this.notify();
      };
    } catch (err) {
      console.error('Error cargando escenarios de IndexedDB:', err);
    }
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach(fn => fn());
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('nova-stage-changed', {
        detail: { activeStage: this.getActiveStage() }
      }));
    }
  }

  public getAll(): StagePreset[] {
    return [...BUILTIN_STAGES, ...this.customStages];
  }

  public getActiveStage(): StagePreset {
    const all = this.getAll();
    return all.find(s => s.id === this.activeStageId) || BUILTIN_STAGES[0];
  }

  public setActiveStage(id: string) {
    this.activeStageId = id;
    if (typeof window !== 'undefined') {
      localStorage.setItem(ACTIVE_STAGE_KEY, id);
    }
    this.notify();
  }

  public async addCustomStage(file: File): Promise<StagePreset> {
    const db = await this.initDB();
    const buffer = await file.arrayBuffer();
    const id = 'stage_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    const cleanName = file.name.replace(/\.[^/.]+$/, '').replace(/[_\\-]/g, ' ');

    const record = {
      id,
      name: cleanName.length > 25 ? cleanName.substring(0, 25) + '...' : cleanName,
      icon: '🏛️',
      description: `Escenario importado (${file.name})`,
      fileName: file.name,
      mimeType: file.type,
      buffer,
      addedAt: Date.now(),
      environmentIntensity: 0.65,
      lightPreset: 'studio',
      groundOffset: 0
    };

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put(record);

      req.onsuccess = () => {
        const blob = new Blob([buffer]);
        const url = URL.createObjectURL(blob);
        const newPreset: StagePreset = {
          id: record.id,
          name: record.name,
          icon: record.icon,
          description: record.description,
          type: 'custom',
          url,
          fileName: record.fileName,
          addedAt: record.addedAt,
          environmentIntensity: record.environmentIntensity,
          lightPreset: 'studio',
          groundOffset: 0
        };
        this.customStages.push(newPreset);
        this.setActiveStage(newPreset.id);
        this.notify();
        resolve(newPreset);
      };
      req.onerror = (e) => reject(e);
    });
  }

  public async deleteCustomStage(id: string): Promise<boolean> {
    if (!this.db) await this.initDB();
    if (!this.db) return false;

    return new Promise((resolve) => {
      const tx = this.db!.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(id);

      req.onsuccess = () => {
        const idx = this.customStages.findIndex(s => s.id === id);
        if (idx !== -1) {
          if (this.customStages[idx].url) {
            URL.revokeObjectURL(this.customStages[idx].url!);
          }
          this.customStages.splice(idx, 1);
        }
        if (this.activeStageId === id) {
          this.setActiveStage('none');
        }
        this.notify();
        resolve(true);
      };
      req.onerror = () => resolve(false);
    });
  }
}

export const stageStore = new StageStore();
