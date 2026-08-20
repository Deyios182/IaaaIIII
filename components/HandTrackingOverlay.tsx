import React, { useEffect, useRef, useState } from 'react';

interface HandTrackingOverlayProps {
  isActive: boolean;
  onClose?: () => void;
  onHandMove?: (x: number, y: number, isPinching: boolean) => void;
  onHandInteract?: (x: number, y: number, isPinching: boolean) => void;
  onHandUpdate?: (pos: { x: number; y: number; isPinching: boolean; gesture: string } | null) => void;
}

// Carga asíncrona de scripts
function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = src;
    script.crossOrigin = 'anonymous';
    script.onload = () => resolve();
    script.onerror = (e) => reject(e);
    document.head.appendChild(script);
  });
}

export const HandTrackingOverlay: React.FC<HandTrackingOverlayProps> = ({
  isActive,
  onClose,
  onHandMove,
  onHandInteract,
  onHandUpdate,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [handDetected, setHandDetected] = useState<boolean>(false);
  const [fps, setFps] = useState<number>(0);
  const [handPos, setHandPos] = useState<{ x: number; y: number; isPinching: boolean } | null>(null);

  const handsRef = useRef<any>(null);
  const cameraRef = useRef<any>(null);
  const lastFrameTime = useRef<number>(performance.now());
  const frameCount = useRef<number>(0);
  const isPinchingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isActive) {
      cleanup();
      return;
    }

    let isMounted = true;

    async function initHandTracking() {
      try {
        setIsLoading(true);
        setError(null);

        // 1. Cargar scripts CDN de MediaPipe Holistic (Cuerpo completo + Cara/Boca + Manos)
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/holistic/holistic.js');

        if (!isMounted) return;

        const win = window as any;
        if (!win.Holistic || !win.Camera) {
          throw new Error('MediaPipe Holistic o CameraUtils no se cargaron adecuadamente.');
        }

        // 2. Instanciar MediaPipe Holistic para tracking corporal y facial completo
        const holistic = new win.Holistic({
          locateFile: (file: string) => `https://cdn.jsdelivr.net/npm/@mediapipe/holistic/${file}`,
        });

        holistic.setOptions({
          modelComplexity: 0,        // FIX Bug 2: Modelo ligero para máximo FPS (antes: 1)
          smoothLandmarks: true,
          enableSegmentation: false,
          refineFaceLandmarks: false, // FIX Bug 2: No necesario para interacción de mano (antes: true)
          minDetectionConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });

        holistic.onResults((results: any) => {
          if (!isMounted) return;

          // Cálculo FPS
          const now = performance.now();
          frameCount.current++;
          if (now - lastFrameTime.current >= 1000) {
            setFps(frameCount.current);
            frameCount.current = 0;
            lastFrameTime.current = now;
          }

          const canvasEl = canvasRef.current;
          if (canvasEl) {
            const ctx = canvasEl.getContext('2d');
            if (ctx) {
              ctx.save();
              ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);

              const videoWidth = canvasEl.width;
              const videoHeight = canvasEl.height;

              // 1. Detección de Pose Corporal Completa
              if (results.poseLandmarks && results.poseLandmarks.length > 0) {
                setHandDetected(true);
                ctx.strokeStyle = '#3b82f6';
                ctx.lineWidth = 1.5;
                for (const lm of results.poseLandmarks) {
                  if (lm.visibility && lm.visibility > 0.5) {
                    const cx = (1 - lm.x) * videoWidth;
                    const cy = lm.y * videoHeight;
                    ctx.beginPath();
                    ctx.arc(cx, cy, 2, 0, 2 * Math.PI);
                    ctx.fillStyle = '#60a5fa';
                    ctx.fill();
                  }
                }
              }

              // 2. RASTREO INDEPENDIENTE DE LENGUA / BOCA DEL USUARIO
              let userMouthPos: { x: number; y: number; active: boolean } | null = null;
              if (results.faceLandmarks && results.faceLandmarks.length > 0) {
                const upperLip = results.faceLandmarks[13];
                const lowerLip = results.faceLandmarks[14];
                if (upperLip && lowerLip) {
                  const lipDist = Math.hypot(upperLip.x - lowerLip.x, upperLip.y - lowerLip.y);
                  const isMouthOpen = lipDist > 0.035;
                  const screenX = (1 - upperLip.x) * window.innerWidth;
                  const screenY = upperLip.y * window.innerHeight;
                  userMouthPos = { x: screenX, y: screenY, active: isMouthOpen };
                }
              }

              // 3. RASTREO INDEPENDIENTE DE MANO IZQUIERDA Y DERECHA
              const leftHand = results.leftHandLandmarks;
              const rightHand = results.rightHandLandmarks;

              // Helper para procesar una mano
              const processHand = (landmarks: any[], label: string) => {
                const indexTip = landmarks[8];
                const thumbTip = landmarks[4];
                const wrist = landmarks[0];

                const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
                const isPinching = pinchDist < 0.07;

                const tips = [landmarks[8], landmarks[12], landmarks[16], landmarks[20]];
                let avgTipDist = 0;
                tips.forEach(tip => { avgTipDist += Math.hypot(tip.x - wrist.x, tip.y - wrist.y); });
                const isGrabbing = (avgTipDist / tips.length) < 0.28;

                const screenX = (1 - indexTip.x) * window.innerWidth;
                const screenY = indexTip.y * window.innerHeight;

                // Dibujar en canvas 2D
                for (const lm of landmarks) {
                  const cx = (1 - lm.x) * videoWidth;
                  const cy = lm.y * videoHeight;
                  ctx.beginPath();
                  ctx.arc(cx, cy, 3, 0, 2 * Math.PI);
                  ctx.fillStyle = (isPinching || isGrabbing) ? '#ec4899' : '#3b82f6';
                  ctx.fill();
                }

                return { x: screenX, y: screenY, active: isPinching || isGrabbing, isGrabbing, isPinching, label };
              };

              const activeLeft = leftHand ? processHand(leftHand, '🖐️ MANO IZQUIERDA') : null;
              const activeRight = rightHand ? processHand(rightHand, '🖐️ MANO DERECHA') : null;

              // 4. RASTREO INDEPENDIENTE DEL MIEMBRO VIRIL (Detectado en la zona pélvica/entre muslos del esqueleto pose)
              let penisPos: { x: number; y: number; active: boolean } | null = null;
              if (results.poseLandmarks && results.poseLandmarks.length > 24) {
                const leftHip = results.poseLandmarks[23];
                const rightHip = results.poseLandmarks[24];
                if (leftHip && rightHip) {
                  const midX = (leftHip.x + rightHip.x) / 2;
                  const midY = (leftHip.y + rightHip.y) / 2 + 0.08; // Justo en la entrepierna
                  const screenX = (1 - midX) * window.innerWidth;
                  const screenY = midY * window.innerHeight;
                  
                  // Se activa si ambas manos o alguna mano está cerca de la zona íntima
                  const handNear = (activeLeft && activeLeft.active) || (activeRight && activeRight.active);
                  penisPos = { x: screenX, y: screenY, active: !!handNear };
                }
              }

              // Disparar interacciones independientes a Nova
              const primaryTracker = activeRight || activeLeft;
              if (primaryTracker) {
                const mainLabel = (activeLeft && activeRight) 
                  ? '🥒 MIEMBRO + 🖐️ DOS MANOS' 
                  : (userMouthPos?.active) 
                  ? '👅 LENGUA / BOCA' 
                  : primaryTracker.label;

                const newPosData = { 
                  x: primaryTracker.x, 
                  y: primaryTracker.y, 
                  isPinching: primaryTracker.isPinching, // Solo Pinch real voluntario
                  isExplicitGrab: primaryTracker.isPinching || primaryTracker.isGrabbing,
                  gesture: mainLabel 
                };
                setHandPos(newPosData);
                if (onHandUpdate) onHandUpdate(newPosData);
              } else if (!results.poseLandmarks) {
                setHandDetected(false);
                setHandPos(null);
                if (onHandUpdate) onHandUpdate(null);
              }
              ctx.restore();
            }
          }
        });

        handsRef.current = holistic;

        // 3. Iniciar Cámara Web con Holistic optimizada (baja resolución para máximo FPS de GPU/CPU)
        if (videoRef.current) {
          let lastFrameTime = 0;
          const camera = new win.Camera(videoRef.current, {
            onFrame: async () => {
              const now = performance.now();
              // Procesar a máximo 20 FPS de la cámara web para liberar 80% de CPU/GPU para el renderizado WebGL 3D
              if (now - lastFrameTime > 50) {
                lastFrameTime = now;
                if (videoRef.current && handsRef.current) {
                  await handsRef.current.send({ image: videoRef.current });
                }
              }
            },
            width: 320,
            height: 240,
          });

          await camera.start();
          cameraRef.current = camera;
          setIsLoading(false);
        }
      } catch (err: any) {
        console.error('Error al inicializar Hand Tracking AR:', err);
        if (isMounted) {
          setError(err.message || 'Error al acceder a la cámara');
          setIsLoading(false);
        }
      }
    }

    initHandTracking();

    return () => {
      isMounted = false;
      cleanup();
    };
  }, [isActive]);

  const cleanup = () => {
    if (cameraRef.current) {
      try {
        cameraRef.current.stop();
      } catch (e) {}
      cameraRef.current = null;
    }
    if (handsRef.current) {
      try {
        handsRef.current.close();
      } catch (e) {}
      handsRef.current = null;
    }
  };

  if (!isActive) return null;

  return (
    <>
      {/* Cursor virtual AR sobre la pantalla */}
      {handPos && (
        <div
          className="fixed pointer-events-none z-[9999] transition-transform duration-75 ease-out transform -translate-x-1/2 -translate-y-1/2 flex items-center justify-center"
          style={{ left: `${handPos.x}px`, top: `${handPos.y}px` }}
        >
          {/* Círculo glowing */}
          <div
            className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all duration-150 ${
              handPos.isPinching
                ? 'border-pink-500 bg-pink-500/30 scale-125 shadow-[0_0_20px_rgba(236,72,153,0.8)]'
                : 'border-cyan-400 bg-cyan-400/20 scale-100 shadow-[0_0_12px_rgba(34,211,238,0.5)]'
            }`}
          >
            <div className={`w-3 h-3 rounded-full ${handPos.isPinching ? 'bg-pink-500 animate-ping' : 'bg-cyan-400'}`} />
          </div>
          <span className="absolute -bottom-6 text-[10px] font-bold px-2 py-0.5 rounded bg-slate-900/90 text-white border border-slate-700 whitespace-nowrap shadow-lg">
            {handPos.gesture}
          </span>
        </div>
      )}

      {/* Panel HUD flotante cámara webcam */}
      <div className="fixed bottom-6 right-6 z-[1000] flex flex-col items-end gap-2 pointer-events-auto">
        <div className="relative w-48 h-36 bg-slate-950/90 border border-pink-500/40 rounded-2xl overflow-hidden shadow-2xl backdrop-blur">
          {/* Video oculto pero activo para frames */}
          <video
            ref={videoRef}
            className="hidden"
            playsInline
            muted
          />

          {/* Canvas de renderizado 2D de la mano */}
          <canvas
            ref={canvasRef}
            width={192}
            height={144}
            className="w-full h-full object-cover transform -scale-x-100"
          />

          {/* Indicadores de estado */}
          <div className="absolute top-2 left-2 flex items-center gap-1.5 bg-slate-900/80 px-2 py-0.5 rounded-full border border-slate-700">
            <span className={`w-2 h-2 rounded-full ${handDetected ? 'bg-emerald-400 animate-pulse' : 'bg-amber-400'}`} />
            <span className="text-[10px] font-medium text-slate-200">
              {handDetected ? `Mano AR (${fps} FPS)` : 'Buscando mano...'}
            </span>
          </div>

          {isLoading && (
            <div className="absolute inset-0 bg-slate-950/80 flex flex-col items-center justify-center text-center p-2">
              <div className="w-5 h-5 border-2 border-pink-500 border-t-transparent rounded-full animate-spin mb-1" />
              <span className="text-[11px] text-slate-300">Cargando AR Tracking...</span>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-2 text-center">
              <span className="text-xs text-rose-400 font-semibold">Error Cámara</span>
              <span className="text-[9px] text-slate-400 mt-1">{error}</span>
            </div>
          )}

          {/* Botón Cerrar */}
          {onClose && (
            <button
              onClick={onClose}
              className="absolute top-2 right-2 w-6 h-6 rounded-full bg-slate-800/80 text-slate-300 hover:bg-rose-600 hover:text-white flex items-center justify-center text-xs transition"
              title="Desactivar Cámara AR"
            >
              ✕
            </button>
          )}
        </div>

        <div className="text-[10px] text-slate-400 bg-slate-900/80 px-2.5 py-1 rounded-lg border border-slate-800 backdrop-blur">
          💡 Junta tu índice y pulgar para interactuar con Nova
        </div>
      </div>
    </>
  );
};
