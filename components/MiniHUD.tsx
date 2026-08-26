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
  isGlobalScreenSharing?: boolean;
  onManualScan?: () => void;
}

export const MiniHUD: React.FC<MiniHUDProps> = ({
  currentMode,
  isAiSpeaking = false,
  onRestoreAvatar,
  sendMultimodalFrame,
  lastTranscript = '',
  isGlobalScreenSharing = false,
  onManualScan,
}) => {
  const [tacticalLog, setTacticalLog] = useState<{ text: string; time: string; type: 'ai' | 'sys' }[]>([]);
  const [scanPulse, setScanPulse] = useState(false);
  const [glitchFactor, setGlitchFactor] = useState(0);
  
  const intervalRef = useRef<any>(null);
  const frameCountRef = useRef(0);
  const [fakeLatency, setFakeLatency] = useState(12);

  // Telemetry fluctuation
  useEffect(() => {
    const t = setInterval(() => {
      setFakeLatency(prev => {
        const target = isGlobalScreenSharing ? 8 + Math.floor(Math.random() * 6) : 0;
        return prev + (target - prev) * 0.3;
      });
      if (Math.random() > 0.95) setGlitchFactor(1);
      else setGlitchFactor(0);
    }, 500);
    return () => clearInterval(t);
  }, [isGlobalScreenSharing]);

  // Multimodal visual pulse (Fake pulse since Dashboard handles the real capture)
  useEffect(() => {
    if (isGlobalScreenSharing) {
      intervalRef.current = setInterval(() => {
        frameCountRef.current = (frameCountRef.current + 1) % 3;
        const shouldTriggerVoice = frameCountRef.current === 0 && !isAiSpeaking;
        setScanPulse(true);
        setTimeout(() => setScanPulse(false), 300);
        
        if (shouldTriggerVoice) {
          addSysLog('SCAN_COMPLETE: ANALIZANDO PANTALLA...');
        }
      }, 5000); // Pulse every 5s
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => clearInterval(intervalRef.current);
  }, [isGlobalScreenSharing, isAiSpeaking]);

  // Tactical Log
  const addSysLog = (msg: string) => {
    const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 2 } as any);
    setTacticalLog(prev => [{ text: msg, time, type: 'sys' as const }, ...prev].slice(0, 8));
  };

  useEffect(() => {
    if (lastTranscript) {
      const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      setTacticalLog(prev => [{ text: lastTranscript, time, type: 'ai' as const }, ...prev].slice(0, 8));
    }
  }, [lastTranscript]);

  return (
    <div className="relative w-full h-full bg-[#02050a] text-cyan-500 font-mono overflow-hidden flex flex-col justify-between" style={{
      filter: glitchFactor > 0 ? 'hue-rotate(90deg) contrast(150%)' : 'none',
      transition: 'filter 0.1s ease-out'
    }}>
      
      {/* BACKGROUND SCENE */}
      <div className="absolute inset-0 z-0 pointer-events-none opacity-20"
           style={{
             backgroundImage: 'linear-gradient(rgba(0, 255, 255, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 255, 255, 0.1) 1px, transparent 1px)',
             backgroundSize: '40px 40px',
             backgroundPosition: 'center center',
             transform: 'perspective(500px) rotateX(60deg) scale(2.5) translateY(-100px)',
             transformOrigin: 'top center'
           }}
      />
      <div className="absolute inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_0%,#02050a_80%)] pointer-events-none" />

      {/* TOP BAR - TELEMETRY & ACTIONS */}
      <div className="relative z-10 p-6 flex justify-between items-start pointer-events-none">
        {/* Left: Telemetry Panel */}
        <div className="flex flex-col gap-1">
          <div className="text-3xl font-black tracking-tighter flex items-center gap-2 drop-shadow-[0_0_15px_rgba(6,182,212,0.8)]">
            <span className="text-white">NOVA</span>
            <span className="text-cyan-400">SYS_HUD</span>
            <div className={`w-3 h-3 rounded-full ${isGlobalScreenSharing ? 'bg-cyan-400 animate-pulse' : 'bg-red-500'}`} />
          </div>
          <div className="flex gap-4 text-xs font-bold mt-2">
            <div className="flex flex-col">
              <span className="text-cyan-800">VSYNC_LINK</span>
              <span className={isGlobalScreenSharing ? 'text-cyan-300' : 'text-red-400'}>
                {isGlobalScreenSharing ? 'ACTIVE' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-cyan-800">LATENCY</span>
              <span className="text-cyan-300">{Math.round(fakeLatency)} MS</span>
            </div>
            <div className="flex flex-col">
              <span className="text-cyan-800">CORTEX_LOAD</span>
              <span className="text-cyan-300">{Math.round(20 + Math.random()*15)}%</span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="pointer-events-auto flex items-center gap-3">
          {onManualScan && isGlobalScreenSharing && (
            <button
              onClick={() => {
                onManualScan();
                setScanPulse(true);
                setTimeout(() => setScanPulse(false), 500);
                addSysLog('TACTICAL_SCAN: ENVIANDO FRAME DIRECTO A NOVA...');
              }}
              className="group flex items-center gap-2 px-3 py-1.5 border border-cyan-500/60 bg-cyan-950/40 hover:bg-cyan-500/20 hover:border-cyan-400 rounded-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer shadow-[0_0_15px_rgba(6,182,212,0.3)] hover:shadow-[0_0_20px_rgba(6,182,212,0.6)]"
              title="Forzar análisis táctico inmediato de pantalla"
            >
              <span className="material-symbols-outlined text-sm text-cyan-400 animate-pulse">photo_camera</span>
              <span className="text-xs font-bold text-cyan-300 uppercase tracking-widest">ESCANEAR YA</span>
            </button>
          )}

          {onRestoreAvatar && (
            <button
              onClick={onRestoreAvatar}
              className="group flex items-center gap-2 px-3 py-1.5 border border-cyan-800 bg-cyan-950/30 hover:bg-cyan-900/50 hover:border-cyan-400 rounded-lg backdrop-blur-md transition-all active:scale-95 cursor-pointer"
            >
              <span className="material-symbols-outlined text-sm text-cyan-500 group-hover:text-cyan-300">logout</span>
              <span className="text-xs font-bold text-cyan-600 group-hover:text-cyan-300 uppercase tracking-widest">Exit HUD</span>
            </button>
          )}
        </div>
      </div>

      {/* CENTER: RADAR & STATUS */}
      <div className="relative z-10 flex-1 flex items-center justify-center pointer-events-none">
        <div className="relative w-64 h-64 sm:w-80 sm:h-80 flex items-center justify-center">
          {/* Radar Circles */}
          <div className={`absolute inset-0 rounded-full border-2 ${isAiSpeaking ? 'border-cyan-300' : 'border-cyan-800/50'}`} />
          <div className="absolute inset-4 rounded-full border border-cyan-800/30" />
          <div className="absolute inset-12 rounded-full border border-dashed border-cyan-800/40 animate-spin-slow" />
          
          {/* Crosshair */}
          <div className="absolute top-0 bottom-0 left-1/2 w-[1px] bg-cyan-800/30" />
          <div className="absolute left-0 right-0 top-1/2 h-[1px] bg-cyan-800/30" />

          {/* Scanner Sweep */}
          {isGlobalScreenSharing && (
            <div 
              className="absolute top-1/2 left-1/2 w-1/2 h-1/2 origin-top-left bg-gradient-to-br from-cyan-400/20 to-transparent animate-radar-sweep rounded-br-full"
            />
          )}

          {/* Core Reactivity */}
          <div className={`relative z-20 w-24 h-24 rounded-full flex items-center justify-center bg-[#02050a] border-4 transition-all duration-300 shadow-[0_0_50px_rgba(0,0,0,0.8)]
            ${isAiSpeaking ? 'border-cyan-400 scale-110 shadow-[0_0_30px_rgba(34,211,238,0.5)]' : 'border-cyan-900 scale-100'}
            ${scanPulse ? 'ring-8 ring-cyan-500/30' : ''}
          `}>
            {/* Audio Bars inside core */}
            <div className="flex items-center gap-1">
              {[1,2,3,4].map(i => (
                <div 
                  key={i} 
                  className={`w-1 rounded-full ${isAiSpeaking ? 'bg-cyan-300' : 'bg-cyan-900'}`}
                  style={{
                    height: isAiSpeaking ? `${20 + Math.random()*60}%` : '4px',
                    transition: 'height 0.1s ease'
                  }}
                />
              ))}
            </div>
          </div>
          
          {/* HUD Text Under Core */}
          <div className="absolute top-[70%] text-[10px] font-bold tracking-widest text-cyan-600 bg-[#02050a] px-2">
            {isAiSpeaking ? 'AUDIO_OUT' : (isGlobalScreenSharing ? 'VISUAL_SYNC_ON' : 'NO_SIGNAL')}
          </div>
        </div>
      </div>

      {/* BOTTOM AREA: TERMINAL FEED */}
      <div className="relative z-10 p-6 pointer-events-none w-full max-w-2xl mb-24 lg:mb-32">
        <div className="flex flex-col gap-1 bg-[#02050a]/80 border-l-2 border-cyan-800 p-4 backdrop-blur-sm relative">
          
          <div className="absolute top-0 left-0 w-2 h-2 border-t-2 border-l-2 border-cyan-400 -ml-2.5 -mt-0.5" />
          <div className="absolute bottom-0 left-0 w-2 h-2 border-b-2 border-l-2 border-cyan-400 -ml-2.5 -mb-0.5" />

          <div className="text-[10px] text-cyan-700 font-bold mb-2 flex justify-between">
            <span>[TERMLOG://NOVA_LINK]</span>
            <span className="animate-pulse">_</span>
          </div>
          
          <div className="flex flex-col gap-1.5 h-[120px] overflow-hidden">
            {tacticalLog.length === 0 ? (
              <div className="text-cyan-800 text-xs mt-auto">Waiting for events...</div>
            ) : (
              tacticalLog.map((log, i) => (
                <div key={i} className={`text-[11px] sm:text-xs flex gap-3 ${i === 0 ? 'opacity-100' : 'opacity-40'}`}>
                  <span className="text-cyan-700 shrink-0">[{log.time}]</span>
                  <span className={log.type === 'sys' ? 'text-cyan-500' : 'text-white'}>
                    {log.type === 'sys' ? '>> ' : '> '}{log.text}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* CUSTOM CSS INJECTIONS FOR HUD ANIMATIONS */}
      <style>{`
        @keyframes radar-sweep {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        .animate-radar-sweep {
          animation: radar-sweep 2s linear infinite;
        }
        .animate-spin-slow {
          animation: spin 10s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default MiniHUD;
