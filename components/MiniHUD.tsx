import React, { useEffect, useState, useRef } from 'react';
import { useScreenCapture } from '../hooks/useScreenCapture';

interface MiniHUDProps {
  currentMode: string;
  isAiSpeaking?: boolean;
  onRestoreAvatar?: () => void;
  onSwitchMode?: (mode: string) => void;
  sendMultimodalFrame?: (base64: string, triggerVoiceReaction?: boolean) => void;
  onTriggerSearch?: (query: string) => void;
  lastTranscript?: string;
  themeColor?: string;
}

export const MiniHUD: React.FC<MiniHUDProps> = ({
  currentMode,
  isAiSpeaking = false,
  onRestoreAvatar,
  onSwitchMode,
  sendMultimodalFrame,
  onTriggerSearch,
  lastTranscript = '',
  themeColor = '#10b981'
}) => {
  const { isCapturing, startScreenCapture, getScreenFrameBase64, stopScreenCapture } = useScreenCapture();
  const [tacticalLog, setTacticalLog] = useState<string[]>([]);
  const [scanPulse, setScanPulse] = useState(false);
  const intervalRef = useRef<any>(null);
  const frameCountRef = useRef(0);

  // Iniciar automáticamente captura de pantalla al entrar al HUD
  useEffect(() => {
    if (!isCapturing) {
      startScreenCapture().catch(e => console.warn('Autostart screen capture:', e));
    }
  }, []);

  // Bucle de visión: 1 frame cada 3s; cada 3 frames (~9s) dispara reacción de voz proactiva si hay silencio
  useEffect(() => {
    if (isCapturing && sendMultimodalFrame) {
      intervalRef.current = setInterval(() => {
        const frame = getScreenFrameBase64();
        if (frame) {
          frameCountRef.current = (frameCountRef.current + 1) % 3;
          const shouldTriggerVoice = frameCountRef.current === 0 && !isAiSpeaking;
          sendMultimodalFrame(frame, shouldTriggerVoice);
          setScanPulse(true);
          setTimeout(() => setScanPulse(false), 250);
        }
      }, 3000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isCapturing, sendMultimodalFrame, getScreenFrameBase64, isAiSpeaking]);

  // Escaneo manual inmediato con reacción de voz forzada
  const triggerInstantScan = () => {
    if (getScreenFrameBase64 && sendMultimodalFrame) {
      const frame = getScreenFrameBase64();
      if (frame) {
        sendMultimodalFrame(frame, true);
        setTacticalLog(prev => ['📸 Escaneando pantalla... Nova comentando en tiempo real', ...prev.slice(0, 3)]);
        setScanPulse(true);
        setTimeout(() => setScanPulse(false), 400);
      }
    }
  };

  // Agregar transcripciones al log táctico
  useEffect(() => {
    if (lastTranscript) {
      setTacticalLog(prev => [lastTranscript, ...prev.slice(0, 3)]);
    }
  }, [lastTranscript]);

  return (
    <div className="relative w-full h-full flex flex-col justify-between p-4 sm:p-6 md:p-8 bg-gradient-to-b from-[#05080e] via-[#030508] to-[#010204] text-white select-none overflow-hidden font-mono">
      
      {/* Grid de fondo cibernético sutil */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff05_1px,transparent_1px),linear-gradient(to_bottom,#ffffff05_1px,transparent_1px)] bg-[size:4rem_4rem] pointer-events-none" />

      {/* ─── BARRA SUPERIOR HUD ─── */}
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3">
        
        {/* Badge de Estado */}
        <div className="flex items-center gap-3">
          <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-black/60 border border-emerald-500/30 shadow-lg">
            <span className="text-xl">🎮</span>
            <div className={`absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full ${scanPulse ? 'bg-cyan-400 scale-150' : 'bg-emerald-400 animate-ping'}`} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md border border-emerald-500/40 text-emerald-400 bg-emerald-950/40">
                COPILOTO GAMER ZERO-LAG
              </span>
              <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-950/30 border border-emerald-500/20">
                GPU: 0% 3D LOAD
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Visión activa. Nova reconoce cualquier juego o busca guías en internet.
            </p>
          </div>
        </div>

        {/* Acciones Rápidas */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
          {/* Botón Escaneo Inmediato */}
          <button
            onClick={triggerInstantScan}
            title="Envía una captura instantánea para que Nova comente o aconseje"
            className="px-3 py-1.5 rounded-xl border border-cyan-500/40 bg-cyan-950/40 hover:bg-cyan-900/60 text-cyan-300 text-xs font-bold uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.25)] active:scale-95"
          >
            <span className="material-symbols-outlined text-sm">center_focus_strong</span>
            <span>Escanear Pantalla</span>
          </button>

          {/* Toggle Transmisión */}
          <button
            onClick={isCapturing ? stopScreenCapture : startScreenCapture}
            className={`px-3 py-1.5 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer ${
              isCapturing
                ? 'bg-emerald-600/30 border-emerald-400 text-emerald-300 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
                : 'bg-white/5 border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
            }`}
          >
            <span className="material-symbols-outlined text-sm">{isCapturing ? 'videocam' : 'screen_share'}</span>
            <span>{isCapturing ? 'Ojo Multimodal ON' : 'Compartir Pantalla'}</span>
          </button>

          {onRestoreAvatar && (
            <button
              onClick={onRestoreAvatar}
              className="px-3 py-1.5 rounded-xl border border-white/10 bg-white/5 hover:bg-white/15 text-slate-300 hover:text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm">view_in_ar</span>
              <span className="hidden sm:inline">Restaurar 3D</span>
            </button>
          )}
        </div>
      </div>

      {/* ─── CENTRO: ORBE DE VOZ & ESTADO EN VIVO ─── */}
      <div className="relative z-10 flex-1 flex flex-col items-center justify-center my-4">
        
        {/* Orbe Central Reactivo */}
        <div className="relative flex items-center justify-center w-40 h-40 sm:w-56 sm:h-56">
          <div
            className="absolute inset-0 rounded-full border border-dashed border-emerald-500/40 opacity-40 animate-spin"
            style={{ animationDuration: '20s' }}
          />
          <div
            className="absolute inset-4 rounded-full border border-emerald-400/30 opacity-30 animate-spin"
            style={{ animationDuration: '10s', animationDirection: 'reverse' }}
          />

          {/* Anillos de pulsación */}
          <div
            className={`w-24 h-24 sm:w-32 sm:h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 ${
              isAiSpeaking ? 'scale-110 shadow-2xl animate-pulse bg-emerald-950/80 border-emerald-400' : 'scale-100 opacity-90 bg-black/80 border-emerald-500/40'
            } border`}
            style={{
              boxShadow: `0 0 ${isAiSpeaking ? '50px' : '20px'} rgba(16,185,129,0.4)`
            }}
          >
            <span className="text-3xl sm:text-4xl drop-shadow-md">🎮</span>
            <span className="text-[9px] font-black uppercase tracking-widest mt-1 text-emerald-300">
              {isAiSpeaking ? 'Hablando' : isCapturing ? 'Viendo Pantalla' : 'Atenta'}
            </span>
          </div>
        </div>

        {/* Visualizador de Barras de Sonido */}
        <div className="flex items-end justify-center gap-1 h-7 mt-3">
          {[...Array(20)].map((_, i) => (
            <div
              key={i}
              className={`w-1 rounded-full transition-all duration-75 ${isAiSpeaking ? 'bg-emerald-400' : 'bg-slate-700'}`}
              style={{
                height: isAiSpeaking ? `${25 + Math.random() * 75}%` : '20%',
                animationDelay: `${i * 0.05}s`
              }}
            />
          ))}
        </div>
      </div>

      {/* ─── BARRA INFERIOR: LOGS & CONVERSACIÓN ─── */}
      <div className="relative z-10 flex flex-col items-center justify-center pt-2 mb-20 sm:mb-24 border-t border-white/10 w-full">
        <div className="w-full max-w-2xl bg-black/75 backdrop-blur-md rounded-2xl border border-white/10 p-3 shadow-xl">
          <div className="flex items-center justify-between text-[10px] text-slate-500 uppercase tracking-widest mb-1.5 px-1">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              Copiloto Gamer en Vivo
            </span>
            <span className="text-emerald-400 font-bold">CANAL BIDIRECCIONAL</span>
          </div>
          <div className="space-y-1 text-xs px-1">
            {tacticalLog.length > 0 ? (
              tacticalLog.map((log, index) => (
                <p key={index} className={`truncate ${index === 0 ? 'text-emerald-300 font-bold' : 'text-slate-500 text-[11px]'}`}>
                  {index === 0 ? '▶ ' : '  '}{log}
                </p>
              ))
            ) : (
              <p className="text-slate-400 italic text-[11px]">
                Habla con Nova o dile: "Nova, ¿qué juego es este?", "¿qué build me recomiendas?", "¿ves peligro en el minimapa?"
              </p>
            )}
          </div>
        </div>
      </div>

    </div>
  );
};

export default MiniHUD;
