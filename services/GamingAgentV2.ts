import { getVisionActionEngine } from './VisionActionEngine';

export interface GameProfile {
  name: string;
  // Coordenadas aproximadas relativas al frame (0 a 1) para monitorear vida (Reflejos locales)
  healthBarX?: number; 
  healthBarY?: number;
  healthBarWidth?: number;
  healthBarHeight?: number;
  healKey?: string;
  healthThresholdPct?: number; 
}

export const AlbionProfile: GameProfile = {
  name: 'albion',
  healthBarX: 0.45,
  healthBarY: 0.90,
  healthBarWidth: 0.10,
  healthBarHeight: 0.02,
  healKey: 'f',
  healthThresholdPct: 0.35 
};

export type GamingEventHandler = (message: string) => void;

/**
 * GamingAgentV2: Player 2 Híbrido (Opción C)
 * Combina reflejos locales rápidos (10 FPS) con visión estratégica (VisionActionEngine).
 */
export class GamingAgentV2 {
  private active: boolean = false;
  private currentProfile: GameProfile | null = null;
  private loopTimer: NodeJS.Timeout | null = null;
  private visionTimer: NodeJS.Timeout | null = null;
  private onEventCb: GamingEventHandler | null = null;
  private lastHealTime: number = 0;
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D | null;
  private img: HTMLImageElement;
  private visionEngine = getVisionActionEngine();

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
    
    if (profileName.toLowerCase().includes('albion')) {
      this.currentProfile = AlbionProfile;
    } else {
      this.currentProfile = { name: profileName, healKey: 'h', healthThresholdPct: 0.3 };
    }

    this.active = true;
    console.log(`🎮 [GamingAgentV2] Iniciado Híbrido (Opción C) para: ${this.currentProfile.name}`);
    if (this.onEventCb) {
      this.onEventCb(`[SYSTEM_GAMING: Modo Player 2 activado para ${this.currentProfile.name}. Reflejos a 10FPS + Visión Estratégica en segundo plano.]`);
    }
    
    this.tickReflexes();
    this.tickVision();
  }

  public stop() {
    this.active = false;
    if (this.loopTimer) clearTimeout(this.loopTimer);
    if (this.visionTimer) clearTimeout(this.visionTimer);
    this.loopTimer = null;
    this.visionTimer = null;
    console.log(`🎮 [GamingAgentV2] Detenido.`);
    if (this.onEventCb) this.onEventCb(`[SYSTEM_GAMING: Modo Player 2 desactivado.]`);
  }

  public isActive(): boolean {
    return this.active;
  }

  // --- CAPA 1: REFLEJOS RÁPIDOS LOCALES (10 FPS) ---
  private async tickReflexes() {
    if (!this.active || !this.currentProfile) return;
    
    const startTime = performance.now();
    try {
      await this.processFastFrame();
    } catch (e) {
      console.error('🎮 [GamingAgentV2] Error en reflex frame:', e);
    }
    
    const elapsed = performance.now() - startTime;
    const nextTickDelay = Math.max(10, 100 - elapsed); // ~10 FPS
    
    if (this.active) {
      this.loopTimer = setTimeout(() => this.tickReflexes(), nextTickDelay);
    }
  }

  private async processFastFrame() {
    const api = (window as any).electronAPI;
    if (!api || !api.captureScreenFrame) return;

    const res = await api.captureScreenFrame();
    if (!res.success || !res.imageBase64) return;

    await new Promise<void>((resolve, reject) => {
      this.img.onload = () => resolve();
      this.img.onerror = reject;
      this.img.src = `data:image/jpeg;base64,${res.imageBase64}`;
    });

    if (!this.ctx) return;
    this.canvas.width = this.img.width;
    this.canvas.height = this.img.height;
    this.ctx.drawImage(this.img, 0, 0);

    if (this.currentProfile?.healthBarX !== undefined) {
      this.analyzeHealthBar();
    }
  }

  private analyzeHealthBar() {
    if (!this.ctx || !this.currentProfile) return;
    const p = this.currentProfile;
    
    const x = Math.floor(p.healthBarX! * this.canvas.width);
    const y = Math.floor(p.healthBarY! * this.canvas.height);
    const w = Math.max(1, Math.floor(p.healthBarWidth! * this.canvas.width));
    const h = Math.max(1, Math.floor(p.healthBarHeight! * this.canvas.height));

    const imageData = this.ctx.getImageData(x, y, w, h);
    const data = imageData.data;
    
    let healthPixels = 0;
    let totalPixels = w * h;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i+1];
      const b = data[i+2];
      if (r > 100 && r > g * 1.5 && r > b * 1.5) {
        healthPixels++;
      }
    }

    const healthPct = healthPixels / totalPixels;
    const now = Date.now();
    if (healthPct > 0.05 && healthPct < p.healthThresholdPct! && (now - this.lastHealTime) > 10000) {
      console.log(`🩸 [GamingAgentV2] ¡Salud crítica detectada! (${Math.round(healthPct*100)}%).`);
      this.lastHealTime = now;
      
      const api = (window as any).electronAPI;
      if (api && api.pressKey && p.healKey) {
        api.pressKey(p.healKey).catch(console.error);
      }

      if (this.onEventCb) {
        this.onEventCb(`[SYSTEM_GAMING: Curación de emergencia (Reflejo local) - Vida al ${Math.round(healthPct*100)}%]`);
      }
    }
  }

  // --- CAPA 2: VISIÓN ESTRATÉGICA LENTA (cada 5-10s o a pedido) ---
  private async tickVision() {
    if (!this.active) return;

    // Solo un ejemplo: cada 10 segundos intentamos encontrar un enemigo o recurso.
    // Lo ideal es que esto sea disparado por comandos de voz del usuario a través de LLM.
    try {
      // Omitir si no estamos en un perfil que lo necesite por ahora.
      // Esta función se puede llamar directamente desde el exterior.
    } catch(e) {}

    if (this.active) {
      this.visionTimer = setTimeout(() => this.tickVision(), 10000);
    }
  }

  /**
   * Ejecuta una acción de alto nivel pedida por el usuario
   */
  public async executeStrategicAction(instruction: string): Promise<boolean> {
    if (!this.active) return false;
    console.log(`🎮 [GamingAgentV2] Ejecutando acción estratégica: ${instruction}`);
    
    // Requiere confirmación si lo configuramos, pero al estar jugando, quizás no.
    const result = await this.visionEngine.executeVisualAction(instruction, this.currentProfile?.name, true);
    
    if (result.success) {
      if (this.onEventCb) {
        this.onEventCb(`[SYSTEM_GAMING: Acción completada: ${instruction} en (${result.x}, ${result.y})]`);
      }
      return true;
    } else {
      if (this.onEventCb) {
        this.onEventCb(`[SYSTEM_GAMING: No pude ejecutar: ${instruction}. Razón: ${result.error}]`);
      }
      return false;
    }
  }
}

let agentInstance: GamingAgentV2 | null = null;
export function getGamingAgentV2(): GamingAgentV2 {
  if (!agentInstance) {
    agentInstance = new GamingAgentV2();
  }
  return agentInstance;
}
