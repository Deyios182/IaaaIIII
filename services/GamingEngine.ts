/**
 * GamingEngine — Motor Local de Reflejos para Nova (Player 2)
 *
 * Se ejecuta independientemente del LLM para analizar la pantalla en tiempo real (10-15 FPS),
 * detectar eventos críticos (ej. barra de vida baja) y ejecutar acciones locales (ej. curar)
 * en milisegundos, reportando al LLM de forma asíncrona.
 */

export interface GameProfile {
  name: string;
  // Coordenadas aproximadas relativas al frame (0 a 1) para monitorear vida
  healthBarX?: number; 
  healthBarY?: number;
  healthBarWidth?: number;
  healthBarHeight?: number;
  // Tecla a presionar cuando la vida baja de un umbral
  healKey?: string;
  healthThresholdPct?: number; // ej: 0.3 = 30%
}

// Perfil genérico/base de Albion Online
export const AlbionProfile: GameProfile = {
  name: 'albion',
  // Estas coordenadas son teóricas y deberán ajustarse según la UI real del usuario
  healthBarX: 0.45,
  healthBarY: 0.90,
  healthBarWidth: 0.10,
  healthBarHeight: 0.02,
  healKey: 'f', // Por ejemplo, poción en F
  healthThresholdPct: 0.35 
};

export type GamingEventHandler = (message: string) => void;

class GamingEngine {
  private active: boolean = false;
  private currentProfile: GameProfile | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private onEventCb: GamingEventHandler | null = null;
  private lastHealTime: number = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private img: HTMLImageElement;

  constructor() {
    this.canvas = document.createElement('canvas');
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    this.img = new Image();
  }

  public setEventHandler(cb: GamingEventHandler) {
    this.onEventCb = cb;
  }

  public async start(profileName: string) {
    if (this.active) this.stop();
    
    // Seleccionar perfil (por ahora solo albion)
    if (profileName.toLowerCase().includes('albion')) {
      this.currentProfile = AlbionProfile;
    } else {
      // Perfil genérico por defecto
      this.currentProfile = { name: profileName, healKey: 'h', healthThresholdPct: 0.3 };
    }

    this.active = true;
    console.log(`🎮 [GamingEngine] Iniciado con perfil: ${this.currentProfile.name}`);
    if (this.onEventCb) this.onEventCb(`[SYSTEM_GAMING: Modo Player 2 activado para el juego ${this.currentProfile.name}. El motor visual local está corriendo a 10 FPS monitorizando la pantalla.]`);
    
    this.tick();
  }

  public stop() {
    this.active = false;
    if (this.loopTimer) {
      clearTimeout(this.loopTimer);
      this.loopTimer = null;
    }
    console.log(`🎮 [GamingEngine] Detenido.`);
    if (this.onEventCb) this.onEventCb(`[SYSTEM_GAMING: Modo Player 2 desactivado.]`);
  }

  public isActive(): boolean {
    return this.active;
  }

  private async tick() {
    if (!this.active || !this.currentProfile) return;
    
    const startTime = performance.now();
    try {
      await this.processFrame();
    } catch (e) {
      console.error('🎮 [GamingEngine] Error en frame:', e);
    }
    
    const elapsed = performance.now() - startTime;
    // Apuntar a ~10 FPS (100ms)
    const nextTickDelay = Math.max(10, 100 - elapsed);
    
    if (this.active) {
      this.loopTimer = setTimeout(() => this.tick(), nextTickDelay);
    }
  }

  private async processFrame() {
    const api = (window as any).electronAPI;
    if (!api || !api.captureScreenFrame) return;

    // Obtener frame rápido en baja resolución/thumbnail si es posible
    const res = await api.captureScreenFrame();
    if (!res.success || !res.imageBase64) return;

    // Decodificar imagen para análisis de píxeles
    await new Promise<void>((resolve, reject) => {
      this.img.onload = () => resolve();
      this.img.onerror = reject;
      this.img.src = `data:image/jpeg;base64,${res.imageBase64}`;
    });

    if (!this.ctx) return;
    this.canvas.width = this.img.width;
    this.canvas.height = this.img.height;
    this.ctx.drawImage(this.img, 0, 0);

    // Si el perfil tiene coords de health bar, analizamos
    if (this.currentProfile.healthBarX !== undefined) {
      this.analyzeHealthBar();
    }
  }

  private analyzeHealthBar() {
    if (!this.ctx || !this.currentProfile) return;
    const p = this.currentProfile;
    
    // Coordenadas absolutas
    const x = Math.floor(p.healthBarX! * this.canvas.width);
    const y = Math.floor(p.healthBarY! * this.canvas.height);
    const w = Math.max(1, Math.floor(p.healthBarWidth! * this.canvas.width));
    const h = Math.max(1, Math.floor(p.healthBarHeight! * this.canvas.height));

    const imageData = this.ctx.getImageData(x, y, w, h);
    const data = imageData.data;
    
    // Simulación: Contar cuántos píxeles "rojos" o "verdes" quedan 
    // (Esta lógica es un placeholder genérico para medir vida)
    let healthPixels = 0;
    let totalPixels = w * h;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      // Detectar píxeles rojos (salud) o verdes - lógica simplificada
      if (r > 100 && r > g * 1.5 && r > b * 1.5) {
        healthPixels++;
      }
    }

    const healthPct = healthPixels / totalPixels;

    // Si la salud detectada cae por debajo del umbral, y no hemos curado recientemente
    const now = Date.now();
    if (healthPct > 0.05 && healthPct < p.healthThresholdPct! && (now - this.lastHealTime) > 10000) {
      console.log(`🩸 [GamingEngine] ¡Salud crítica detectada! (${Math.round(healthPct*100)}%). Acción evasiva.`);
      this.lastHealTime = now;
      
      // 1. REFLEJO LOCAL INMEDIATO (Milisegundos)
      const api = (window as any).electronAPI;
      if (api && api.pressKey && p.healKey) {
        api.pressKey(p.healKey).catch(console.error);
        console.log(`🛡️ [GamingEngine] Tecla de curación pulsada: [${p.healKey}]`);
      }

      // 2. AVISO AL CEREBRO (LLM) ASÍNCRONO
      if (this.onEventCb) {
        this.onEventCb(`[SYSTEM_GAMING: El sistema local detectó que tu vida bajó al ${Math.round(healthPct*100)}% y presionó automáticamente la tecla '${p.healKey}' para curarte. Dile algo para calmarlo o reacciona al peligro.]`);
      }
    }
  }
}

// Singleton export
let engineInstance: GamingEngine | null = null;
export function getGamingEngine(): GamingEngine {
  if (!engineInstance) {
    engineInstance = new GamingEngine();
  }
  return engineInstance;
}
