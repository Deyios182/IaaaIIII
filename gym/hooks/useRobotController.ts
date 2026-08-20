/**
 * gym/hooks/useRobotController.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook del Sistema Nervioso: gestiona la conexión WebSocket con el cerebro IA.
 *
 * ⚠️  ARQUITECTURA CRÍTICA — DOS HILOS LÓGICOS:
 *
 *  [Hilo de Red]     WebSocket.onmessage → empuja a commandQueueRef (solo escritura)
 *  [Hilo de Física]  useFrame() en RobotAvatar → drena commandQueueRef (solo lectura)
 *
 *  NUNCA se aplican fuerzas dentro del callback de red. Hacerlo causaría jitter
 *  porque los comandos llegarían fuera del tick del motor de físicas.
 *
 *  TELEMETRÍA: Throttled a 30 Hz. El servidor RL estándar (Gymnasium, Stable-Baselines3)
 *  trabaja a 30 Hz o menos. Enviar a 60 FPS saturaría el socket sin beneficio.
 */

import { useEffect, useRef, useCallback, useState } from 'react';
import {
  JointCommand,
  TelemetryFrame,
  GymControllerState,
  WsStatus,
} from '../types/gym.types';

const WS_URL = 'ws://localhost:8080';
/** Tick rate de telemetría en Hz (envío máximo al servidor IA) */
const TELEMETRY_HZ = 30;
const TELEMETRY_INTERVAL_MS = 1000 / TELEMETRY_HZ; // ~33.33 ms

// ─────────────────────────────────────────────────────────────────────────────

export interface UseRobotControllerReturn {
  /**
   * Cola de comandos entrantes del servidor IA.
   * Es un REF (no state) para evitar re-renders.
   * SOLO se debe leer/vaciar dentro de useFrame() en el componente de física.
   */
  commandQueueRef: React.MutableRefObject<JointCommand[]>;

  /**
   * Envía un frame de telemetría al servidor IA.
   * Internamente aplica throttling a 30 Hz: si se llama en cada frame (60fps),
   * solo transmitirá ~cada 33ms. Llama esta función desde useFrame().
   */
  sendTelemetry: (frame: TelemetryFrame) => void;

  /** Estado reactivo de la conexión (para mostrar en el HUD) */
  controllerState: GymControllerState;

  /** Reinicia manualmente la conexión WebSocket */
  reconnect: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────

export function useRobotController(): UseRobotControllerReturn {
  // ── Cola de comandos: escrita desde la red, leída desde físicas ────────────
  const commandQueueRef = useRef<JointCommand[]>([]);

  // ── WebSocket ref (persistente entre renders) ─────────────────────────────
  const wsRef = useRef<WebSocket | null>(null);

  // ── Throttle: timestamp del último frame de telemetría enviado ────────────
  const lastTelemetryTimeRef = useRef<number>(0);

  // ── Contador de frame de telemetría (monotónico) ──────────────────────────
  const frameIdRef = useRef<number>(0);

  // ── Estado reactivo (solo para UI/HUD) ───────────────────────────────────
  const [controllerState, setControllerState] = useState<GymControllerState>({
    status: 'connecting',
    lastCommand: null,
    framesSent: 0,
    commandsReceived: 0,
    latencyMs: 0,
    activePolicy: 'stand',
    episode: 0,
    totalReward: 0,
  });

  // Helper: actualizar estado parcialmente sin mutaciones directas
  const patchState = useCallback((patch: Partial<GymControllerState>) => {
    setControllerState(prev => ({ ...prev, ...patch }));
  }, []);

  // ── Función de conexión (reutilizable para reconexión) ────────────────────
  const connect = useCallback(() => {
    // Cerrar conexión previa si existe
    if (wsRef.current && wsRef.current.readyState !== WebSocket.CLOSED) {
      wsRef.current.close();
    }

    console.log(`[GymWS] Conectando a ${WS_URL}...`);
    patchState({ status: 'connecting' });

    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log('[GymWS] ✅ Conectado al cerebro IA');
      patchState({ status: 'connected' });

      // Enviar handshake de identificación
      ws.send(JSON.stringify({
        type: 'gym_hello',
        client: 'robot_gym_frontend',
        version: '1.0.0',
        timestamp: Date.now(),
      }));
    };

    ws.onmessage = (event: MessageEvent) => {
      // ⚠️ ZONA CRÍTICA: Solo encolamos. Nunca aplicamos física aquí.
      try {
        const cmd = JSON.parse(event.data as string) as JointCommand;

        // Filtrar mensajes de control (no son comandos de articulación)
        if (!cmd.action) return;

        // Enqueue: el comando esperará hasta el próximo tick de físicas
        commandQueueRef.current.push(cmd);

        // Actualizar estado UI (no bloqueante)
        patchState(prev => ({
          commandsReceived: prev.commandsReceived + 1,
          lastCommand: cmd,
          // Calcular latencia si el servidor incluyó su timestamp
          latencyMs: cmd.serverTs ? Date.now() - cmd.serverTs : prev.latencyMs,
        } as any));

      } catch (err) {
        console.warn('[GymWS] Comando mal formado:', event.data, err);
      }
    };

    ws.onclose = (event) => {
      console.log(`[GymWS] Desconectado. Código: ${event.code}`);
      patchState({ status: 'disconnected' });

      // Auto-reconexión en 3 segundos si no fue cierre limpio
      if (event.code !== 1000) {
        setTimeout(() => {
          console.log('[GymWS] Intentando reconexión...');
          connect();
        }, 3000);
      }
    };

    ws.onerror = (error) => {
      console.error('[GymWS] ❌ Error:', error);
      patchState({ status: 'error' });
    };
  }, [patchState]);

  // ── Conectar al montar, desconectar al desmontar ──────────────────────────
  useEffect(() => {
    connect();
    return () => {
      wsRef.current?.close(1000, 'Component unmounted');
    };
  }, [connect]);

  // ── Escuchar comandos procedentes del Chatbot (Nova) en tiempo real ─────────
  useEffect(() => {
    const channel = new BroadcastChannel('gym_channel');
    channel.onmessage = (event) => {
      const { action, parameter } = event.data;
      console.log(`📡 [GymWS] Comando local del chatbot recibido: ${action} -> ${parameter}`);
      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        if (action === 'set_policy') {
          wsRef.current.send(JSON.stringify({ type: 'set_policy', policy: parameter }));
        } else if (action === 'push') {
          wsRef.current.send(JSON.stringify({ type: 'apply_push', direction: parameter, force: 15 }));
        }
      }
    };
    return () => channel.close();
  }, []);

  // ── sendTelemetry: llamar desde useFrame(), throttled a 30 Hz ────────────
  const sendTelemetry = useCallback((frame: TelemetryFrame) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

    const now = performance.now();

    // ── THROTTLE: solo transmitir si pasaron al menos ~33ms ─────────────────
    if (now - lastTelemetryTimeRef.current < TELEMETRY_INTERVAL_MS) return;

    lastTelemetryTimeRef.current = now;
    frameIdRef.current += 1;

    const payload: TelemetryFrame = {
      ...frame,
      frameId: frameIdRef.current,
      timestamp: Date.now(),
    };

    try {
      wsRef.current.send(JSON.stringify(payload));
      patchState(prev => ({ framesSent: prev.framesSent + 1 } as any));
    } catch (err) {
      console.warn('[GymWS] Error enviando telemetría:', err);
    }
  }, [patchState]);

  return {
    commandQueueRef,
    sendTelemetry,
    controllerState,
    reconnect: connect,
  };
}
