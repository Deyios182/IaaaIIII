/**
 * Model Store - Almacén persistente en IndexedDB para modelos 3D del usuario (PMX, GLB, VRM, PMD).
 * Permite que los modelos cargados manualmente se conserven entre recargas de la app.
 */

const DB_NAME = 'NovaModelDB';
const STORE_NAME = 'activeModel';
const CURRENT_KEY = 'current_user_model';
const LIBRARY_PREFIX = 'model_lib_';

export interface SavedModelInfo {
  fileName: string;
  fileSize: number;
  fileType: string;
  savedAt: number;
}

interface StoredModelRecord extends SavedModelInfo {
  data: Blob;
}

let activeBlobUrl: string | null = null;
type ModelChangeListener = (info: SavedModelInfo | null) => void;
const listeners: Set<ModelChangeListener> = new Set();

function notify(info: SavedModelInfo | null) {
  listeners.forEach(fn => {
    try {
      fn(info);
    } catch (e) {
      console.error('Error en listener de modelStore:', e);
    }
  });
}

function getDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 2);
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

export const modelStore = {
  /**
   * Guarda un archivo de modelo en IndexedDB (activo + biblioteca) y devuelve una Blob URL utilizable.
   */
  async saveModel(file: File): Promise<string> {
    const ext = file.name.split('.').pop()?.toLowerCase() || 'pmx';
    const record: StoredModelRecord = {
      data: file,
      fileName: file.name,
      fileSize: file.size,
      fileType: ext,
      savedAt: Date.now()
    };

    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const req1 = store.put(record, CURRENT_KEY);
        const req2 = store.put(record, `${LIBRARY_PREFIX}${file.name}`);
        req1.onerror = () => reject(req1.error);
        req2.onerror = () => reject(req2.error);
        tx.oncomplete = () => resolve();
      });

      // Liberar URL anterior si era un blob
      if (activeBlobUrl && activeBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrl.split('#')[0]);
      }

      // Crear nueva URL con el nombre original como hash para que los loaders conozcan la extensión
      const rawBlobUrl = URL.createObjectURL(file);
      activeBlobUrl = `${rawBlobUrl}#${encodeURIComponent(file.name)}`;

      notify({
        fileName: record.fileName,
        fileSize: record.fileSize,
        fileType: record.fileType,
        savedAt: record.savedAt
      });

      return activeBlobUrl;
    } catch (err) {
      console.error('❌ Error guardando modelo en IndexedDB:', err);
      // Fallback a URL en memoria sin persistencia
      if (activeBlobUrl && activeBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrl.split('#')[0]);
      }
      const rawBlobUrl = URL.createObjectURL(file);
      activeBlobUrl = `${rawBlobUrl}#${encodeURIComponent(file.name)}`;
      return activeBlobUrl;
    }
  },

  /**
   * Carga el modelo previamente guardado desde IndexedDB si existe.
   */
  async loadModel(): Promise<{ url: string; info: SavedModelInfo } | null> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const record = await new Promise<StoredModelRecord | undefined>((resolve, reject) => {
        const req = store.get(CURRENT_KEY);
        req.onsuccess = () => resolve(req.result as StoredModelRecord | undefined);
        req.onerror = () => reject(req.error);
      });

      if (!record || !record.data) {
        return null;
      }

      if (activeBlobUrl && activeBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrl.split('#')[0]);
      }

      const rawBlobUrl = URL.createObjectURL(record.data);
      activeBlobUrl = `${rawBlobUrl}#${encodeURIComponent(record.fileName)}`;

      const info: SavedModelInfo = {
        fileName: record.fileName,
        fileSize: record.fileSize,
        fileType: record.fileType,
        savedAt: record.savedAt
      };

      notify(info);
      return { url: activeBlobUrl, info };
    } catch (err) {
      console.error('❌ Error cargando modelo desde IndexedDB:', err);
      return null;
    }
  },

  /**
   * Carga un modelo específico de la biblioteca por su nombre y lo establece como activo.
   */
  async loadModelByName(fileName: string): Promise<{ url: string; info: SavedModelInfo } | null> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      const record = await new Promise<StoredModelRecord | undefined>((resolve, reject) => {
        const req = store.get(`${LIBRARY_PREFIX}${fileName}`);
        req.onsuccess = () => resolve(req.result as StoredModelRecord | undefined);
        req.onerror = () => reject(req.error);
      });

      if (!record || !record.data) {
        return null;
      }

      // Establecer como modelo activo actual
      store.put(record, CURRENT_KEY);

      if (activeBlobUrl && activeBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrl.split('#')[0]);
      }

      const rawBlobUrl = URL.createObjectURL(record.data);
      activeBlobUrl = `${rawBlobUrl}#${encodeURIComponent(record.fileName)}`;

      const info: SavedModelInfo = {
        fileName: record.fileName,
        fileSize: record.fileSize,
        fileType: record.fileType,
        savedAt: record.savedAt
      };

      notify(info);
      return { url: activeBlobUrl, info };
    } catch (err) {
      console.error('❌ Error cargando modelo de la biblioteca:', err);
      return null;
    }
  },

  /**
   * Obtiene la lista de todos los modelos guardados en la biblioteca.
   */
  async getAllSavedModels(): Promise<SavedModelInfo[]> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);

      const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
        const req = store.getAllKeys();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });

      const libKeys = keys.filter(k => typeof k === 'string' && (k as string).startsWith(LIBRARY_PREFIX));
      const models: SavedModelInfo[] = [];

      for (const k of libKeys) {
        const record = await new Promise<StoredModelRecord | undefined>((resolve) => {
          const req = store.get(k);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(undefined);
        });
        if (record) {
          models.push({
            fileName: record.fileName,
            fileSize: record.fileSize,
            fileType: record.fileType,
            savedAt: record.savedAt
          });
        }
      }

      return models.sort((a, b) => b.savedAt - a.savedAt);
    } catch (err) {
      console.error('❌ Error listando modelos guardados:', err);
      return [];
    }
  },

  /**
   * Elimina un modelo de la biblioteca.
   */
  async deleteSavedModel(fileName: string): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);

      await new Promise<void>((resolve, reject) => {
        const req = store.delete(`${LIBRARY_PREFIX}${fileName}`);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      const current = await this.getModelInfo();
      if (current && current.fileName === fileName) {
        await this.clearModel();
      }
    } catch (err) {
      console.error('❌ Error eliminando modelo guardado:', err);
    }
  },

  /**
   * Obtiene la metadata del modelo guardado sin crear URLs.
   */
  async getModelInfo(): Promise<SavedModelInfo | null> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const record = await new Promise<StoredModelRecord | undefined>((resolve, reject) => {
        const req = store.get(CURRENT_KEY);
        req.onsuccess = () => resolve(req.result as StoredModelRecord | undefined);
        req.onerror = () => reject(req.error);
      });

      if (!record) return null;
      return {
        fileName: record.fileName,
        fileSize: record.fileSize,
        fileType: record.fileType,
        savedAt: record.savedAt
      };
    } catch {
      return null;
    }
  },

  /**
   * Borra el modelo guardado de IndexedDB y restaura el default.
   */
  async clearModel(): Promise<void> {
    try {
      const db = await getDB();
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      await new Promise<void>((resolve, reject) => {
        const req = store.delete(CURRENT_KEY);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });

      if (activeBlobUrl && activeBlobUrl.startsWith('blob:')) {
        URL.revokeObjectURL(activeBlobUrl.split('#')[0]);
        activeBlobUrl = null;
      }

      notify(null);
    } catch (err) {
      console.error('❌ Error borrando modelo de IndexedDB:', err);
    }
  },

  /**
   * Suscribirse a cambios en el modelo guardado
   */
  subscribe(fn: ModelChangeListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
};
