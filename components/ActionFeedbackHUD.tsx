import React, { useEffect, useState, useRef } from 'react';
import { gestureRegistry } from '../utils/gestureRegistry';
import { NovaPersonalityMode } from '../types';

interface ActionFeedbackHUDProps {
  personalityMode?: NovaPersonalityMode;
  isHotMode?: boolean;
  isAiSpeaking?: boolean;
  lastMessage?: string;
  onTriggerAction?: (actionId: string) => void;
}

interface ActiveActionInfo {
  id: string;
  name: string;
  icon: string;
  category: string;
  type: 'clip' | 'procedural';
  duration: number;
  startTime: number;
}

interface LoadingInfo {
  isLoading: boolean;
  message: string;
  progress?: number;
}

export const ActionFeedbackHUD: React.FC<ActionFeedbackHUDProps> = ({
  personalityMode = 'companion',
  isHotMode = false,
  isAiSpeaking = false,
  lastMessage = '',
  onTriggerAction
}) => {
  const [activeAction, setActiveAction] = useState<ActiveActionInfo | null>(null);
  const [loadingInfo, setLoadingInfo] = useState<LoadingInfo>({ isLoading: false, message: '' });
  const [isMusicActive, setIsMusicActive] = useState<boolean>(false);
  const [progressPercent, setProgressPercent] = useState<number>(100);
  const animFrameRef = useRef<number | null>(null);

  // 1. Escuchar inicio y fin de acciones para dar respuesta visual inmediata (Feedback UX)
  useEffect(() => {
    const handleActionStarted = (e: any) => {
      const detail = e.detail || {};
      const actionName = detail.action || 'wave';
      const def = gestureRegistry.getGesture(actionName);

      const info: ActiveActionInfo = {
        id: actionName,
        name: def?.name || actionName.charAt(0).toUpperCase() + actionName.slice(1),
        icon: def?.icon || (detail.type === 'clip' ? '🎬' : '⚡'),
        category: def?.category || 'body',
        type: detail.type || 'procedural',
        duration: detail.duration || def?.defaultDuration || 2.5,
        startTime: Date.now()
      };

      setActiveAction(info);
      setProgressPercent(100);
    };

    const handleActionEnded = () => {
      setActiveAction(null);
    };

    window.addEventListener('nova-action-started', handleActionStarted);
    window.addEventListener('nova-action-ended', handleActionEnded);

    return () => {
      window.removeEventListener('nova-action-started', handleActionStarted);
      window.removeEventListener('nova-action-ended', handleActionEnded);
    };
  }, []);

  // 2. Barra de progreso animada mientras la acción está activa
  useEffect(() => {
    if (!activeAction) {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      return;
    }

    const durationMs = activeAction.duration * 1000;
    const tick = () => {
      const elapsed = Date.now() - activeAction.startTime;
      const remaining = Math.max(0, 1 - (elapsed / durationMs));
      setProgressPercent(remaining * 100);

      if (remaining > 0) {
        animFrameRef.current = requestAnimationFrame(tick);
      } else {
        setTimeout(() => setActiveAction(null), 250);
      }
    };

    animFrameRef.current = requestAnimationFrame(tick);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [activeAction]);

  // 3. Escuchar estados de carga claros (Loading State)
  useEffect(() => {
    const handleAnimLoading = (e: any) => {
      const { isLoading, text, message, progress } = e.detail || {};
      setLoadingInfo({
        isLoading: !!isLoading,
        message: text || message || 'Cargando animación...',
        progress
      });
    };

    window.addEventListener('nova-anim-loading', handleAnimLoading);
    return () => window.removeEventListener('nova-anim-loading', handleAnimLoading);
  }, []);

  // 4. Detección musical y actualización de anticipación
  useEffect(() => {
    const handleMusicSync = (e: any) => {
      const active = !!(e.detail?.isPlaying || e.detail?.energy > 0.08);
      setIsMusicActive(active);
    };

    window.addEventListener('nova-music-player-sync', handleMusicSync);
    window.addEventListener('aiko-music-playing', () => setIsMusicActive(true));
    window.addEventListener('aiko-music-stopped', () => setIsMusicActive(false));

    return () => {
      window.removeEventListener('nova-music-player-sync', handleMusicSync);
    };
  }, []);

  return (
    <div className="absolute inset-0 pointer-events-none z-[990] flex flex-col justify-between p-4 sm:p-6 overflow-hidden">
      
      {/* ─── ZONA SUPERIOR: ESTADO DE CARGA Y FEEDBACK DE ACCIÓN ACTIVA ─── */}
      <div className="flex flex-col items-center gap-3 w-full">
        
        {/* INDICADOR DE CARGA CLARO (Loading State) */}
        {loadingInfo.isLoading && (
          <div className="pointer-events-auto flex items-center gap-3 px-5 py-2.5 rounded-full bg-slate-950/85 border border-cyan-500/40 shadow-[0_0_25px_rgba(6,182,212,0.3)] backdrop-blur-xl animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="relative flex items-center justify-center w-5 h-5">
              <div className="w-5 h-5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
              <div className="absolute w-2 h-2 bg-cyan-400 rounded-full animate-ping" />
            </div>
            <span className="text-xs font-medium text-cyan-200 tracking-wide">
              {loadingInfo.message}
            </span>
            {loadingInfo.progress !== undefined && (
              <span className="text-xs font-mono font-bold text-cyan-400">
                {Math.round(loadingInfo.progress)}%
              </span>
            )}
          </div>
        )}

        {/* FEEDBACK DE ACCIÓN EN EJECUCIÓN (Action Response Feedback) */}
        {activeAction && (
          <div className="pointer-events-auto flex flex-col items-center min-w-[240px] max-w-sm rounded-2xl bg-slate-950/90 border border-white/15 p-3 shadow-[0_12px_40px_rgba(0,0,0,0.6)] backdrop-blur-2xl animate-in zoom-in-95 fade-in duration-200">
            <div className="flex items-center justify-between w-full gap-3">
              
              {/* Icono animado con halo */}
              <div className="relative flex items-center justify-center w-9 h-9 rounded-xl bg-white/10 text-xl shadow-inner">
                <span>{activeAction.icon}</span>
                <span className="absolute -inset-1 rounded-xl bg-cyan-400/20 animate-pulse pointer-events-none" />
              </div>

              {/* Nombre y categoría */}
              <div className="flex flex-col flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-sm font-semibold text-white truncate">
                    {activeAction.name}
                  </span>
                  <span className="text-[10px] uppercase font-bold px-1.5 py-0.5 rounded text-cyan-300 bg-cyan-950/80 border border-cyan-500/30">
                    {activeAction.type === 'clip' ? '🎬 Alta Calidad' : '⚡ Procedural'}
                  </span>
                </div>
                <span className="text-[11px] text-slate-400 capitalize">
                  {activeAction.category} {isMusicActive ? '• 🎵 Tempo Sincronizado' : ''}
                </span>
              </div>

              {/* Duración */}
              <span className="text-xs font-mono font-medium text-slate-300 tabular-nums">
                {activeAction.duration.toFixed(1)}s
              </span>
            </div>

            {/* Barra de progreso de la acción */}
            <div className="w-full h-1.5 bg-white/10 rounded-full mt-2.5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 rounded-full transition-all duration-75"
                style={{ width: `${progressPercent}%` }}
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
