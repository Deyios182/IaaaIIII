/**
 * gym/hooks/useGymTelemetry.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Hook auxiliar para calcular la señal de RECOMPENSA del episodio RL
 * y agregar el estado del robot en un TelemetryFrame listo para enviar.
 *
 * La recompensa base mide qué tan erguido está el robot:
 *   reward = (altura_actual_torso / altura_inicial_torso) - penalización_movimiento
 *
 * Este cálculo es intencionalmente simple y extensible.
 */

import { useRef, useCallback } from 'react';
import * as THREE from 'three';
import { TelemetryFrame, JointState, JointName } from '../types/gym.types';

// ─────────────────────────────────────────────────────────────────────────────

interface JointReadings {
  name: JointName;
  angle: number;
  velocity: number;
  lastTorque: number;
}

interface UseGymTelemetryReturn {
  buildTelemetryFrame: (params: {
    torsoPosition: THREE.Vector3;
    torsoOrientation: THREE.Quaternion;
    torsoLinearVel: THREE.Vector3;
    torsoAngularVel: THREE.Vector3;
    joints: JointReadings[];
    done: boolean;
  }) => TelemetryFrame;
  resetEpisode: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────

/** Altura inicial del torso al comenzar el episodio (para calcular reward).
 *  InMoov mide ~1.8m — torso a ~1.0m del suelo con pies incluidos. */
const INITIAL_TORSO_HEIGHT = 1.6; // metros aprox (InMoov full body)

export function useGymTelemetry(): UseGymTelemetryReturn {
  const episodeStartTimeRef = useRef<number>(Date.now());

  const resetEpisode = useCallback(() => {
    episodeStartTimeRef.current = Date.now();
  }, []);

  const buildTelemetryFrame = useCallback((params: {
    torsoPosition: THREE.Vector3;
    torsoOrientation: THREE.Quaternion;
    torsoLinearVel: THREE.Vector3;
    torsoAngularVel: THREE.Vector3;
    joints: JointReadings[];
    done: boolean;
  }): TelemetryFrame => {
    const {
      torsoPosition, torsoOrientation,
      torsoLinearVel, torsoAngularVel,
      joints, done
    } = params;

    // ── Calcular recompensa ──────────────────────────────────────────────────
    // Recompensa de supervivencia: mantener el torso a altura razonable
    const heightRatio = Math.max(0, torsoPosition.y / INITIAL_TORSO_HEIGHT);
    const heightReward = heightRatio > 0.5 ? 1.0 : -1.0; // Penalizar caídas

    // Penalizar movimiento lateral excesivo (el robot debe ir hacia adelante)
    const lateralPenalty = Math.abs(torsoPosition.x) * 0.1;

    // Recompensar velocidad hacia adelante
    const forwardReward = Math.max(0, torsoLinearVel.z) * 0.5;

    const reward = heightReward + forwardReward - lateralPenalty;

    // ── Construir mapa de articulaciones ─────────────────────────────────────
    const jointMap: Partial<Record<JointName, JointState>> = {};
    for (const j of joints) {
      jointMap[j.name] = {
        angle: j.angle,
        velocity: j.velocity,
        torque: j.lastTorque,
      };
    }

    return {
      frameId: 0, // Asignado por useRobotController al enviar
      timestamp: Date.now(),
      robot: {
        position: [torsoPosition.x, torsoPosition.y, torsoPosition.z],
        orientation: [torsoOrientation.x, torsoOrientation.y, torsoOrientation.z, torsoOrientation.w],
        linearVelocity: [torsoLinearVel.x, torsoLinearVel.y, torsoLinearVel.z],
        angularVelocity: [torsoAngularVel.x, torsoAngularVel.y, torsoAngularVel.z],
      },
      joints: jointMap,
      reward,
      done,
      info: {
        episodeDuration: Date.now() - episodeStartTimeRef.current,
        heightRatio: heightRatio.toFixed(3),
      }
    };
  }, []);

  return { buildTelemetryFrame, resetEpisode };
}
