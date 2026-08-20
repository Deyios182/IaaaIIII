/**
 * gym/GymScene.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Escena principal — InMoov Full Body
 *
 * Modos:
 *  - RL Training: el servidor gym-server.js controla el avatar
 *  - Pose Capture: la cámara web mueve el avatar en espejo
 */

import React, { useState, useCallback, Suspense, useRef } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls, Environment, Stats } from '@react-three/drei';
import { Physics } from '@react-three/rapier';

import GymEnvironment from './GymEnvironment';
import RobotAvatar from './RobotAvatar';
import GymTelemetry from './GymTelemetry';
import GymPoseCapture from './GymPoseCapture';
import { useRobotController } from './hooks/useRobotController';
import { TelemetryFrame, JointCommand } from './types/gym.types';

// ─────────────────────────────────────────────────────────────────────────────

function GymContent({ commandQueueRef, onTelemetry, activeModelUrl }: {
  commandQueueRef: React.MutableRefObject<JointCommand[]>;
  onTelemetry: (frame: TelemetryFrame) => void;
  activeModelUrl: string;
}) {
  return (
    <>
      <Physics gravity={[0, -9.81, 0]} timestep="vary">
        <GymEnvironment />
        <RobotAvatar
          commandQueueRef={commandQueueRef}
          onTelemetry={onTelemetry}
          initialPosition={[0, 0.02, 0]}
          activeModelUrl={activeModelUrl}
        />
      </Physics>
      <OrbitControls target={[0, 1.0, 0]} minDistance={1.5} maxDistance={12} maxPolarAngle={Math.PI * 0.85} />
      <Environment preset="city" />
      <Stats />
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GymScene() {
  const [latestFrame, setLatestFrame] = useState<TelemetryFrame | null>(null);
  const [mode, setMode] = useState<'rl' | 'pose'>('rl');
  const { commandQueueRef, sendTelemetry, controllerState } = useRobotController();

  // Cola unificada: tanto el servidor RL como el PoseCapture escriben aquí
  const handleTelemetry = useCallback((frame: TelemetryFrame) => {
    sendTelemetry(frame);
    setLatestFrame(frame);
  }, [sendTelemetry]);

  const getAvatarUrl = () => {
    try {
      const s = localStorage.getItem('nova_app_state');
      if (s) {
        const p = JSON.parse(s);
        if (p?.avatar?.modelUrl) return p.avatar.modelUrl;
      }
    } catch {}
    return '/models/grokani_lipsync.glb';
  };

  return (
    <div style={{ width: '100%', height: '100%', position: 'relative', background: '#020617' }}>

      {/* ── Panel izquierdo — HUD RL ────────────────────────────────────── */}
      <GymTelemetry
        controllerState={controllerState}
        latestFrame={latestFrame}
        mode={mode}
        onModeChange={setMode}
      />

      {/* ── Panel de Pose Capture (esquina superior izquierda, al lado del HUD) ── */}
      {mode === 'pose' && (
        <div style={{
          position: 'absolute',
          top: 16, left: 390,             // justo a la derecha del panel principal (16px + 360px + offset)
          width: 260,
          zIndex: 110,
        }}>
          <GymPoseCapture commandQueueRef={commandQueueRef} />
        </div>
      )}

      {/* ── Canvas 3D ───────────────────────────────────────────────────── */}
      <Canvas
        shadows
        camera={{ position: [0, 1.8, 4.5], fov: 50, near: 0.1, far: 100 }}
        gl={{ antialias: true, toneMapping: 3, toneMappingExposure: 1.0 }}
        style={{ width: '100%', height: '100%' }}
      >
        <Suspense fallback={null}>
          <GymContent
            commandQueueRef={commandQueueRef}
            onTelemetry={handleTelemetry}
            activeModelUrl={getAvatarUrl()}
          />
        </Suspense>
      </Canvas>

      {/* Badge de modo activo */}
      <div style={{
        position: 'absolute', bottom: 16, right: 180, zIndex: 110,
        background: 'rgba(2,6,23,0.85)', border: '1px solid rgba(14,165,233,0.2)',
        borderRadius: 6, padding: '5px 12px',
        display: 'flex', gap: 8,
      }}>
        {(['rl', 'pose'] as const).map(m => (
          <button key={m} onClick={() => setMode(m)}
            style={{
              background: mode === m ? 'rgba(14,165,233,0.25)' : 'transparent',
              border: `1px solid ${mode === m ? 'rgba(14,165,233,0.5)' : 'transparent'}`,
              borderRadius: 5, padding: '3px 10px',
              color: mode === m ? '#38bdf8' : '#334155',
              fontSize: 10, fontWeight: 700, cursor: 'pointer',
              fontFamily: 'monospace', transition: 'all 0.15s',
            }}>
            {m === 'rl' ? '🤖 RL' : '📷 Pose'}
          </button>
        ))}
      </div>
    </div>
  );
}
