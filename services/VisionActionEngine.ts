import { getCoordMemoryCache } from './CoordMemoryCache';
import { analyzeScreenForAction } from '../geminiService';

export interface ActionResult {
  success: boolean;
  x?: number;
  y?: number;
  description?: string;
  error?: string;
}

export class VisionActionEngine {
  private resolution: string = '1920x1080';
  private requiresConfirmation: boolean = true;
  private memoryCache = getCoordMemoryCache();

  constructor() {
    this.detectResolution();
  }

  private async detectResolution() {
    const api = (window as any).electronAPI;
    if (api && api.captureScreenFrame) {
      try {
        const res = await api.captureScreenFrame();
        if (res.success && res.screenW && res.screenH) {
          this.resolution = `${res.screenW}x${res.screenH}`;
        }
      } catch (e) {
        console.error('Error detecting resolution:', e);
      }
    }
  }

  /**
   * Ejecuta una acción visual.
   * Si requiere confirmación, debería solicitarla antes de hacer clic en acciones destructivas.
   * Sin embargo, como el usuario pide permiso para acciones destructivas, delegamos el permiso
   * a la capa de UI/LLM, o bien podemos implementar un callback aquí si se requiriera.
   * Para simplificar, este motor devuelve las coordenadas y la ejecución del clic puede ser
   * disparada después de la confirmación, o lo hace directo si es seguro.
   */
  public async executeVisualAction(instruction: string, appName?: string, autoClick: boolean = true): Promise<ActionResult> {
    try {
      console.log(`👁️ [VisionActionEngine] Iniciando tarea: "${instruction}"`);
      
      // 1. Check cache first
      const cached = this.memoryCache.get(instruction, this.resolution, appName);
      if (cached) {
        console.log(`🧠 [VisionActionEngine] Usando memoria de caché para: ${instruction} -> {x: ${cached.x}, y: ${cached.y}}`);
        if (autoClick) {
            return await this.performClick(cached.x, cached.y, instruction, appName, true);
        }
        return { success: true, x: cached.x, y: cached.y, description: "Encontrado en caché" };
      }

      // 2. Capture screen
      const api = (window as any).electronAPI;
      if (!api || !api.captureScreenFrame) {
        return { success: false, error: 'API de captura no disponible' };
      }

      const screenRes = await api.captureScreenFrame();
      if (!screenRes.success || !screenRes.imageBase64) {
        return { success: false, error: 'Fallo al capturar pantalla' };
      }

      // 3. Ask Vision model
      console.log(`🤖 [VisionActionEngine] Consultando a Gemini Vision...`);
      const analysis = await analyzeScreenForAction(screenRes.imageBase64, instruction, appName ? `Aplicación activa: ${appName}` : '');

      if (analysis.x === -1 || analysis.y === -1) {
        console.warn(`❌ [VisionActionEngine] Vision no pudo encontrar el elemento: ${analysis.description}`);
        return { success: false, error: analysis.description };
      }

      console.log(`🎯 [VisionActionEngine] Elemento encontrado en {x: ${analysis.x}, y: ${analysis.y}}: ${analysis.description}`);

      if (autoClick) {
        return await this.performClick(analysis.x, analysis.y, instruction, appName, false);
      }
      return { success: true, x: analysis.x, y: analysis.y, description: analysis.description };

    } catch (e: any) {
      console.error('Error en executeVisualAction:', e);
      return { success: false, error: String(e) };
    }
  }

  private async performClick(x: number, y: number, instruction: string, appName: string | undefined, fromCache: boolean): Promise<ActionResult> {
    const api = (window as any).electronAPI;
    if (api && api.mouseClickPrecise) {
        // Usa el handler preciso nuevo
        await api.mouseClickPrecise({ x, y, description: instruction });
    } else if (api && api.mouseClick) {
        // Fallback al anterior
        await api.mouseClick({ x, y });
    }

    // Opcional: Podríamos verificar el estado después del clic capturando la pantalla de nuevo.
    // Por ahora, asumimos éxito y guardamos.
    if (!fromCache) {
      this.memoryCache.store(instruction, x, y, this.resolution, appName);
    }
    
    return { success: true, x, y, description: 'Clic ejecutado' };
  }

  public async findElement(instruction: string, appName?: string): Promise<{x: number, y: number} | null> {
      const res = await this.executeVisualAction(instruction, appName, false);
      if (res.success && res.x !== undefined && res.y !== undefined) {
          return { x: res.x, y: res.y };
      }
      return null;
  }
}

let instance: VisionActionEngine | null = null;
export function getVisionActionEngine(): VisionActionEngine {
  if (!instance) {
    instance = new VisionActionEngine();
  }
  return instance;
}
