/**
 * gym/GymPoseCapture.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * CAPTURA DE POSE CORPORAL — El avatar te copia en tiempo real.
 *
 * Usa MediaPipe Pose (cargado desde CDN) para detectar 33 puntos del cuerpo
 * y los convierte en ángulos de articulación para el avatar 3D.
 *
 * CÓMO FUNCIONA:
 *  1. Activa la cámara web.
 *  2. MediaPipe detecta tu esqueleto (33 landmarks 3D).
 *  3. Calculamos ángulos: hombro, codo, muñeca, cadera, rodilla, tobillo.
 *  4. Enviamos comandos `set_angle` a la cola del RobotAvatar.
 *  5. El avatar se mueve en espejo.
 *
 * USO:
 *  <GymPoseCapture commandQueueRef={ref} onStatusChange={fn} />
 */

import React, { useRef, useEffect, useState, useCallback } from 'react';
import { JointCommand, JointName } from './types/gym.types';

// ─────────────────────────────────────────────────────────────────────────────
// TIPOS MediaPipe
// ─────────────────────────────────────────────────────────────────────────────

interface Landmark { x: number; y: number; z: number; visibility?: number; }

// Índices MediaPipe Pose
const LM = {
  NOSE: 0, L_EAR: 7, R_EAR: 8,
  L_SHOULDER: 11, R_SHOULDER: 12,
  L_ELBOW: 13,    R_ELBOW: 14,
  L_WRIST: 15,    R_WRIST: 16,
  L_HIP: 23,      R_HIP: 24,
  L_KNEE: 25,     R_KNEE: 26,
  L_ANKLE: 27,    R_ANKLE: 28,
};

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS MATEMÁTICOS
// ─────────────────────────────────────────────────────────────────────────────

function sub(a: Landmark, b: Landmark) {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function dot(a: { x:number;y:number;z:number }, b: { x:number;y:number;z:number }) {
  return a.x*b.x + a.y*b.y + a.z*b.z;
}

function mag(v: { x:number;y:number;z:number }) {
  return Math.sqrt(v.x*v.x + v.y*v.y + v.z*v.z);
}

/** Ángulo en el vértice B formado por A–B–C */
function angleBetween(a: Landmark, b: Landmark, c: Landmark): number {
  const ba = sub(a, b);
  const bc = sub(c, b);
  const cos = dot(ba, bc) / (mag(ba) * mag(bc) + 1e-9);
  return Math.acos(Math.max(-1, Math.min(1, cos)));
}

/** Ángulo de elevación: qué tan arriba/abajo va el vector A→B respecto al eje Y */
function elevationAngle(from: Landmark, to: Landmark): number {
  const d = sub(to, from);
  return Math.atan2(d.y, Math.sqrt(d.x*d.x + d.z*d.z));
}

/** Ángulo en el plano horizontal (yaw) del vector A→B */
function yawAngle(from: Landmark, to: Landmark): number {
  const d = sub(to, from);
  return Math.atan2(d.x, d.z);
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSIÓN LANDMARKS → ÁNGULOS DE JOINT
// ─────────────────────────────────────────────────────────────────────────────

function landmarksToJoints(wl: Landmark[]): Partial<Record<JointName, number>> {
  const angles: Partial<Record<JointName, number>> = {};

  const vis = (idx: number) => (wl[idx]?.visibility ?? 0) > 0.4;

  // ── CUELLO / CABEZA ────────────────────────────────────────────────────────
  if (vis(LM.NOSE) && vis(LM.L_SHOULDER) && vis(LM.R_SHOULDER)) {
    const midShoulder: Landmark = {
      x: (wl[LM.L_SHOULDER].x + wl[LM.R_SHOULDER].x) / 2,
      y: (wl[LM.L_SHOULDER].y + wl[LM.R_SHOULDER].y) / 2,
      z: (wl[LM.L_SHOULDER].z + wl[LM.R_SHOULDER].z) / 2,
    };
    // Pitch de cabeza (asiente)
    angles.neck_pitch = clamp(
      elevationAngle(midShoulder, wl[LM.NOSE]) - 0.3, // offset pose natural
      -0.6, 0.6
    );
    // Yaw del cuello (girar)
    angles.neck_yaw = clamp(
      yawAngle(wl[LM.R_SHOULDER], wl[LM.NOSE]) * 0.5,
      -0.8, 0.8
    );
  }

  // ── BRAZO IZQUIERDO ────────────────────────────────────────────────────────
  if (vis(LM.L_SHOULDER) && vis(LM.L_ELBOW)) {
    // Shoulder pitch: elevación del brazo (arriba/abajo)
    angles.l_shoulder_pitch = clamp(
      -elevationAngle(wl[LM.L_SHOULDER], wl[LM.L_ELBOW]),
      -Math.PI / 2, Math.PI / 2
    );

    if (vis(LM.L_ELBOW) && vis(LM.L_WRIST)) {
      // Elbow: ángulo de flexión del codo
      const elbowAngle = angleBetween(wl[LM.L_SHOULDER], wl[LM.L_ELBOW], wl[LM.L_WRIST]);
      // π = brazo extendido, 0 = doblado completamente
      angles.l_elbow = clamp(Math.PI - elbowAngle, 0, Math.PI * 0.9);

      // Shoulder yaw: rotación lateral del hombro
      angles.l_shoulder_yaw = clamp(
        yawAngle(wl[LM.L_SHOULDER], wl[LM.L_ELBOW]) * 0.7,
        -Math.PI / 2, Math.PI / 2
      );
    }
  }

  // ── BRAZO DERECHO ──────────────────────────────────────────────────────────
  if (vis(LM.R_SHOULDER) && vis(LM.R_ELBOW)) {
    angles.r_shoulder_pitch = clamp(
      -elevationAngle(wl[LM.R_SHOULDER], wl[LM.R_ELBOW]),
      -Math.PI / 2, Math.PI / 2
    );

    if (vis(LM.R_ELBOW) && vis(LM.R_WRIST)) {
      const elbowAngle = angleBetween(wl[LM.R_SHOULDER], wl[LM.R_ELBOW], wl[LM.R_WRIST]);
      angles.r_elbow = clamp(Math.PI - elbowAngle, 0, Math.PI * 0.9);

      angles.r_shoulder_yaw = clamp(
        -yawAngle(wl[LM.R_SHOULDER], wl[LM.R_ELBOW]) * 0.7,
        -Math.PI / 2, Math.PI / 2
      );
    }
  }

  // ── PIERNA IZQUIERDA ───────────────────────────────────────────────────────
  if (vis(LM.L_HIP) && vis(LM.L_KNEE)) {
    angles.left_hip = clamp(
      -elevationAngle(wl[LM.L_HIP], wl[LM.L_KNEE]) + 0.1,
      -Math.PI / 2, Math.PI / 2
    );

    if (vis(LM.L_KNEE) && vis(LM.L_ANKLE)) {
      const kneeAngle = angleBetween(wl[LM.L_HIP], wl[LM.L_KNEE], wl[LM.L_ANKLE]);
      angles.left_knee = clamp(Math.PI - kneeAngle, 0, Math.PI * 0.8);
    }
  }

  // ── PIERNA DERECHA ─────────────────────────────────────────────────────────
  if (vis(LM.R_HIP) && vis(LM.R_KNEE)) {
    angles.right_hip = clamp(
      -elevationAngle(wl[LM.R_HIP], wl[LM.R_KNEE]) + 0.1,
      -Math.PI / 2, Math.PI / 2
    );

    if (vis(LM.R_KNEE) && vis(LM.R_ANKLE)) {
      const kneeAngle = angleBetween(wl[LM.R_HIP], wl[LM.R_KNEE], wl[LM.R_ANKLE]);
      angles.right_knee = clamp(Math.PI - kneeAngle, 0, Math.PI * 0.8);
    }
  }

  return angles;
}

// ─────────────────────────────────────────────────────────────────────────────

interface GymPoseCaptureProps {
  commandQueueRef: React.MutableRefObject<JointCommand[]>;
  onStatusChange?: (status: 'idle' | 'loading' | 'active' | 'error') => void;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function GymPoseCapture({ commandQueueRef, onStatusChange }: GymPoseCaptureProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const poseRef   = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'active' | 'error'>('idle');
  const [fps, setFps] = useState(0);
  const [smoothing, setSmoothing] = useState(0.4);
  const prevAngles = useRef<Partial<Record<JointName, number>>>({});
  const lastFpsTime = useRef(Date.now());
  const frameCount = useRef(0);

  const updateStatus = useCallback((s: typeof status) => {
    setStatus(s);
    onStatusChange?.(s);
  }, [onStatusChange]);

  // ── Cargar MediaPipe scripts (CDN) ────────────────────────────────────────
  const loadScript = (src: string): Promise<void> =>
    new Promise((res, rej) => {
      if (document.querySelector(`script[src="${src}"]`)) { res(); return; }
      const s = document.createElement('script');
      s.src = src; s.crossOrigin = 'anonymous';
      s.onload = () => res();
      s.onerror = () => rej(new Error(`No se pudo cargar: ${src}`));
      document.head.appendChild(s);
    });

  // ── Dibujar landmarks en el canvas ───────────────────────────────────────
  const drawResults = useCallback((results: any) => {
    const canvas = canvasRef.current;
    const video  = videoRef.current;
    if (!canvas || !video) return;
    const ctx = canvas.getContext('2d')!;
    canvas.width  = video.videoWidth  || 320;
    canvas.height = video.videoHeight || 240;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Espejo horizontal
    ctx.save();
    ctx.scale(-1, 1);
    ctx.translate(-canvas.width, 0);

    // Dibujar imagen
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Dibujar conexiones
    const CONNECTIONS = [
      [11,12],[11,13],[13,15],[12,14],[14,16],
      [11,23],[12,24],[23,24],[23,25],[24,26],[25,27],[26,28],
    ];
    if (results.poseLandmarks) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      CONNECTIONS.forEach(([a, b]) => {
        const la = results.poseLandmarks[a];
        const lb = results.poseLandmarks[b];
        if (!la || !lb) return;
        ctx.beginPath();
        ctx.moveTo(la.x * canvas.width, la.y * canvas.height);
        ctx.lineTo(lb.x * canvas.width, lb.y * canvas.height);
        ctx.stroke();
      });

      // Dibujar puntos
      results.poseLandmarks.forEach((lm: Landmark, i: number) => {
        const isKey = Object.values(LM).includes(i);
        ctx.beginPath();
        ctx.arc(lm.x * canvas.width, lm.y * canvas.height, isKey ? 5 : 3, 0, Math.PI * 2);
        ctx.fillStyle = isKey ? '#22c55e' : 'rgba(14,165,233,0.6)';
        ctx.fill();
      });
    }

    ctx.restore();
  }, []);

  // ── Callback cuando MediaPipe detecta una pose ─────────────────────────────
  const onResults = useCallback((results: any) => {
    drawResults(results);

    // FPS counter
    frameCount.current++;
    const now = Date.now();
    if (now - lastFpsTime.current > 1000) {
      setFps(frameCount.current);
      frameCount.current = 0;
      lastFpsTime.current = now;
    }

    if (!results.poseWorldLandmarks?.length) return;

    const rawAngles = landmarksToJoints(results.poseWorldLandmarks);

    // Suavizado exponencial
    const angles = { ...rawAngles };
    (Object.keys(angles) as JointName[]).forEach(joint => {
      const prev = prevAngles.current[joint];
      if (prev !== undefined) {
        angles[joint] = prev + smoothing * (angles[joint]! - prev);
      }
    });
    prevAngles.current = { ...angles };

    // Enviar a la cola como set_angle
    const cmds: JointCommand[] = (Object.keys(angles) as JointName[]).map(joint => ({
      action: 'set_angle',
      joint,
      value: angles[joint],
    }));
    commandQueueRef.current.push(...cmds);
  }, [drawResults, smoothing, commandQueueRef]);

  // ── Iniciar captura ───────────────────────────────────────────────────────
  const startCapture = useCallback(async () => {
    updateStatus('loading');
    try {
      // 1. Obtener cámara
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480, facingMode: 'user' },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // 2. Cargar MediaPipe desde CDN
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils@0.3.1675466862/camera_utils.js');
      await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/pose.js');

      const mp = (window as any);

      // 3. Configurar Pose
      const pose = new mp.Pose({
        locateFile: (file: string) =>
          `https://cdn.jsdelivr.net/npm/@mediapipe/pose@0.5.1675469404/${file}`,
      });
      pose.setOptions({
        modelComplexity: 1,
        smoothLandmarks: true,
        enableSegmentation: false,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.6,
      });
      pose.onResults(onResults);
      poseRef.current = pose;

      // 4. Iniciar Camera loop
      const camera = new mp.Camera(videoRef.current!, {
        onFrame: async () => {
          if (videoRef.current && poseRef.current) {
            await poseRef.current.send({ image: videoRef.current });
          }
        },
        width: 640, height: 480,
      });
      await camera.start();
      cameraRef.current = camera;

      updateStatus('active');
    } catch (err: any) {
      console.error('[PoseCapture]', err);
      updateStatus('error');
    }
  }, [onResults, updateStatus]);

  // ── Detener captura ───────────────────────────────────────────────────────
  const stopCapture = useCallback(() => {
    cameraRef.current?.stop();
    if (videoRef.current?.srcObject) {
      const tracks = (videoRef.current.srcObject as MediaStream).getTracks();
      tracks.forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    poseRef.current = null;
    cameraRef.current = null;

    // Resetear ángulos del avatar
    commandQueueRef.current.push({ action: 'reset_robot' });
    prevAngles.current = {};

    updateStatus('idle');
  }, [commandQueueRef, updateStatus]);

  useEffect(() => () => stopCapture(), [stopCapture]);

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

  const isActive  = status === 'active';
  const isLoading = status === 'loading';

  return (
    <div style={{
      background: 'rgba(2,6,23,0.95)',
      border: `1px solid ${isActive ? 'rgba(34,197,94,0.4)' : 'rgba(14,165,233,0.2)'}`,
      borderRadius: 10, overflow: 'hidden',
      fontFamily: '"Inter", monospace',
      boxShadow: isActive ? '0 0 20px rgba(34,197,94,0.2)' : 'none',
      transition: 'border-color 0.3s, box-shadow 0.3s',
    }}>

      {/* Header */}
      <div style={{ padding: '10px 12px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 14 }}>📷</span>
          <div>
            <div style={{ color: '#f1f5f9', fontSize: 11, fontWeight: 700 }}>Pose Capture</div>
            <div style={{ color: '#334155', fontSize: 9, fontFamily: 'monospace' }}>
              {isActive ? `Activo · ${fps} fps` : isLoading ? 'Cargando MediaPipe...' : 'Inactivo'}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {isActive && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 6px #22c55e', animation: 'pulse 1s infinite' }} />
          )}
          <button
            onClick={isActive ? stopCapture : startCapture}
            disabled={isLoading}
            style={{
              background: isActive ? 'rgba(239,68,68,0.2)' : 'rgba(34,197,94,0.2)',
              border: `1px solid ${isActive ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)'}`,
              color: isActive ? '#fca5a5' : '#86efac',
              borderRadius: 6, padding: '4px 10px',
              fontSize: 10, fontWeight: 700, cursor: isLoading ? 'wait' : 'pointer',
              fontFamily: '"Inter", sans-serif',
              transition: 'all 0.15s',
            }}
          >
            {isLoading ? '⏳ Cargando...' : isActive ? '⏹ Detener' : '▶ Iniciar'}
          </button>
        </div>
      </div>

      {/* Canvas de cámara */}
      <div style={{ position: 'relative', width: '100%', aspectRatio: '4/3', background: '#0f172a', minHeight: 120 }}>
        {!isActive && !isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 28 }}>📷</span>
            <span style={{ color: '#334155', fontSize: 10, fontFamily: 'monospace', textAlign: 'center' }}>
              Pulsa ▶ Iniciar<br/>para activar la cámara
            </span>
          </div>
        )}
        {isLoading && (
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
            <span style={{ fontSize: 28 }}>⏳</span>
            <span style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace', textAlign: 'center' }}>
              Cargando MediaPipe<br/>(requiere internet la 1ª vez)
            </span>
          </div>
        )}
        <video ref={videoRef} style={{ display: 'none' }} playsInline muted />
        <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: isActive ? 'block' : 'none' }} />

        {/* Overlay info cuando activo */}
        {isActive && (
          <div style={{ position: 'absolute', top: 6, left: 6, background: 'rgba(0,0,0,0.6)', borderRadius: 4, padding: '2px 6px' }}>
            <span style={{ color: '#22c55e', fontSize: 8, fontFamily: 'monospace' }}>🔴 LIVE · {fps} FPS</span>
          </div>
        )}
      </div>

      {/* Suavizado */}
      {isActive && (
        <div style={{ padding: '8px 12px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ color: '#475569', fontSize: 9, fontFamily: 'monospace' }}>Suavizado</span>
            <span style={{ color: '#64748b', fontSize: 9, fontFamily: 'monospace' }}>{(smoothing * 100).toFixed(0)}%</span>
          </div>
          <input type="range" min={0.05} max={1} step={0.05}
            value={smoothing}
            onChange={e => setSmoothing(parseFloat(e.target.value))}
            style={{ width: '100%', accentColor: '#38bdf8', height: 4 }}
          />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span style={{ color: '#1e293b', fontSize: 8, fontFamily: 'monospace' }}>Suave</span>
            <span style={{ color: '#1e293b', fontSize: 8, fontFamily: 'monospace' }}>Inmediato</span>
          </div>
        </div>
      )}

      {/* Error */}
      {status === 'error' && (
        <div style={{ padding: '8px 12px', background: 'rgba(239,68,68,0.1)', borderTop: '1px solid rgba(239,68,68,0.2)' }}>
          <p style={{ color: '#fca5a5', fontSize: 9, fontFamily: 'monospace', margin: 0, lineHeight: 1.5 }}>
            ⚠️ Error al cargar MediaPipe.<br/>
            Verifica conexión a internet.<br/>
            O instala: npm i @mediapipe/pose
          </p>
        </div>
      )}
    </div>
  );
}
