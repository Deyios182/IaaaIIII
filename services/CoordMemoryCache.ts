export interface CachedCoord {
  element: string;       // e.g., "botón cerrar Chrome"
  x: number;
  y: number;
  successCount: number;
  failureCount: number;
  lastUsed: number;
  screenResolution: string; // e.g., "1920x1080"
  appName?: string;
}

export class CoordMemoryCache {
  private cache: Map<string, CachedCoord> = new Map();
  private maxCacheSize: number = 1000;

  constructor() {
    this.loadCache();
  }

  private getCacheKey(element: string, resolution: string, appName?: string): string {
    return `${element}_${resolution}_${appName || 'global'}`.toLowerCase();
  }

  public get(element: string, resolution: string, appName?: string): CachedCoord | null {
    const key = this.getCacheKey(element, resolution, appName);
    const entry = this.cache.get(key);
    
    // Only return if it's reliable enough
    if (entry && entry.successCount > 2 && entry.failureCount < 3) {
      entry.lastUsed = Date.now();
      this.saveCache();
      return entry;
    }
    
    return null;
  }

  public store(element: string, x: number, y: number, resolution: string, appName?: string) {
    const key = this.getCacheKey(element, resolution, appName);
    const existing = this.cache.get(key);

    if (existing) {
      // Update existing
      existing.x = x;
      existing.y = y;
      existing.successCount += 1;
      existing.lastUsed = Date.now();
    } else {
      // Create new
      if (this.cache.size >= this.maxCacheSize) {
        this.evictOldest();
      }
      this.cache.set(key, {
        element,
        x,
        y,
        successCount: 1,
        failureCount: 0,
        lastUsed: Date.now(),
        screenResolution: resolution,
        appName
      });
    }
    this.saveCache();
  }

  public markFailure(element: string, resolution: string, appName?: string) {
    const key = this.getCacheKey(element, resolution, appName);
    const existing = this.cache.get(key);
    if (existing) {
      existing.failureCount += 1;
      this.saveCache();
    }
  }

  private evictOldest() {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, value] of this.cache.entries()) {
      if (value.lastUsed < oldestTime) {
        oldestTime = value.lastUsed;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  private loadCache() {
    try {
      const stored = localStorage.getItem('nova_coord_cache');
      if (stored) {
        const parsed = JSON.parse(stored);
        for (const key of Object.keys(parsed)) {
          this.cache.set(key, parsed[key]);
        }
      }
    } catch (e) {
      console.warn('Failed to load coordinate cache', e);
    }
  }

  private saveCache() {
    try {
      const obj = Object.fromEntries(this.cache.entries());
      localStorage.setItem('nova_coord_cache', JSON.stringify(obj));
    } catch (e) {
      console.warn('Failed to save coordinate cache', e);
    }
  }
}

let instance: CoordMemoryCache | null = null;
export function getCoordMemoryCache(): CoordMemoryCache {
  if (!instance) {
    instance = new CoordMemoryCache();
  }
  return instance;
}
