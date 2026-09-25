/**
 * AgentTaskRunner — Motor de Ejecución de Tareas Multi-Paso para Nova
 *
 * Ejecuta listas ordenadas de acciones del sistema (clic, escritura, teclas,
 * portapapeles, scroll, enfoque de ventana, etc.) paso a paso con delays
 * configurables entre cada acción.
 *
 * Diseñado para ser llamado desde el handler de la herramienta `executeAgentTask`
 * de Gemini Live, permitiendo a Nova trabajar de forma autónoma en la PC del usuario.
 */

export type AgentAction =
  | 'typeText'
  | 'mouseClick'
  | 'mouseMove'
  | 'pressKey'
  | 'focusWindow'
  | 'readClipboard'
  | 'writeClipboard'
  | 'captureScreen'
  | 'runCommand'
  | 'openApp'
  | 'openUrl'
  | 'scroll'
  | 'wait';

export interface AgentStep {
  action: AgentAction;
  /** Texto a escribir, tecla, nombre de app/ventana, URL, comando, etc. */
  value?: string;
  /** Coordenada X del clic/movimiento (en pixels de pantalla) */
  x?: number;
  /** Coordenada Y del clic/movimiento (en pixels de pantalla) */
  y?: number;
  /** Botón del mouse: 'left' | 'right' | 'middle' (default: 'left') */
  button?: 'left' | 'right' | 'middle';
  /** Doble clic (default: false) */
  double?: boolean;
  /** Unidades de scroll: positivo = arriba, negativo = abajo (default: 3) */
  scrollDelta?: number;
  /** Milisegundos de espera ANTES de ejecutar este paso (default: 300) */
  delayMs?: number;
}

export interface AgentTaskResult {
  success: boolean;
  completedSteps: number;
  totalSteps: number;
  error?: string;
  /** Contenido del portapapeles si algún paso lo leyó */
  clipboardContent?: string;
  /** Output de stdout si algún paso ejecutó un comando */
  commandOutput?: string;
  /** Screenshot final en base64 si algún paso lo capturó */
  screenshotAfter?: string;
}

const DEFAULT_DELAY_MS = 350;

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Ejecuta una lista ordenada de pasos en la PC del usuario vía electronAPI.
 * Retorna un resumen del resultado para que Nova lo reporte al usuario.
 */
export async function runAgentTask(steps: AgentStep[]): Promise<AgentTaskResult> {
  const api = (window as any).electronAPI;
  if (!api) {
    return {
      success: false,
      completedSteps: 0,
      totalSteps: steps.length,
      error: 'electronAPI no disponible. La app debe ejecutarse en Electron.'
    };
  }

  let completedSteps = 0;
  let clipboardContent: string | undefined;
  let commandOutput: string | undefined;
  let screenshotAfter: string | undefined;

  for (const step of steps) {
    const delay = step.delayMs ?? DEFAULT_DELAY_MS;
    if (delay > 0) await sleep(delay);

    try {
      console.log(`🤖 [AgentTask] Paso ${completedSteps + 1}/${steps.length}: ${step.action}`, step.value ?? '');

      switch (step.action) {
        case 'typeText': {
          if (!step.value) break;
          await api.typeText(step.value);
          break;
        }

        case 'mouseClick': {
          await api.mouseClick({
            x: step.x,
            y: step.y,
            button: step.button ?? 'left',
            double: step.double ?? false
          });
          break;
        }

        case 'mouseMove': {
          if (step.x !== undefined && step.y !== undefined) {
            await api.mouseMove(step.x, step.y);
          }
          break;
        }

        case 'pressKey': {
          if (!step.value) break;
          await api.pressKey(step.value);
          break;
        }

        case 'focusWindow': {
          if (!step.value) break;
          // Restaurar + enfocar la ventana por nombre de proceso/título
          await api.controlWindow('restore', step.value);
          await sleep(200);
          break;
        }

        case 'readClipboard': {
          const result = await api.readClipboard?.();
          clipboardContent = result?.text ?? '';
          console.log(`📋 [AgentTask] Portapapeles leído: "${clipboardContent?.slice(0, 80)}..."`);
          break;
        }

        case 'writeClipboard': {
          if (!step.value) break;
          await api.writeClipboard?.(step.value);
          console.log(`📋 [AgentTask] Portapapeles escrito: "${step.value.slice(0, 80)}"`);
          break;
        }

        case 'scroll': {
          await api.mouseScroll?.({
            x: step.x,
            y: step.y,
            delta: step.scrollDelta ?? 3
          });
          break;
        }

        case 'captureScreen': {
          const frame = await api.captureScreenFrame?.();
          if (frame) screenshotAfter = frame;
          break;
        }

        case 'runCommand': {
          if (!step.value) break;
          const res = await api.runCommand(step.value, { timeout: 30000 });
          commandOutput = res?.stdout || res?.stderr || '';
          if (!res?.success) {
            throw new Error(`Command failed: ${res?.error || res?.stderr}`);
          }
          break;
        }

        case 'openApp': {
          if (!step.value) break;
          await api.openApp(step.value);
          break;
        }

        case 'openUrl': {
          if (!step.value) break;
          await api.openUrl(step.value);
          break;
        }

        case 'wait': {
          // Solo el delay ya aplicado al inicio del paso es suficiente.
          // Pero si el usuario especificó un delayMs extra, esperamos más.
          await sleep(step.value ? parseInt(step.value, 10) : 500);
          break;
        }

        default:
          console.warn(`⚠️ [AgentTask] Acción desconocida: ${step.action}`);
      }

      completedSteps++;
    } catch (err: any) {
      console.error(`❌ [AgentTask] Error en paso ${completedSteps + 1} (${step.action}):`, err?.message || err);
      return {
        success: false,
        completedSteps,
        totalSteps: steps.length,
        error: `Paso ${completedSteps + 1} (${step.action}): ${err?.message || String(err)}`,
        clipboardContent,
        commandOutput,
        screenshotAfter
      };
    }
  }

  console.log(`✅ [AgentTask] Tarea completada: ${completedSteps}/${steps.length} pasos.`);
  return {
    success: true,
    completedSteps,
    totalSteps: steps.length,
    clipboardContent,
    commandOutput,
    screenshotAfter
  };
}
