import React, { useEffect, useState } from 'react';

export type PendingAction = {
  id: string;
  type: 'mouseClick' | 'mouseMove' | 'typeText' | 'pressKey' | 'openApp';
  x?: number;
  y?: number;
  target?: string;
  description?: string;
  timestamp: number;
};

interface ActionPermissionOverlayProps {
  pendingAction: PendingAction | null;
  onApprove: (actionId: string) => void;
  onReject: (actionId: string) => void;
}

export function ActionPermissionOverlay({ pendingAction, onApprove, onReject }: ActionPermissionOverlayProps) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (pendingAction) {
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [pendingAction]);

  if (!pendingAction || !isVisible) return null;

  // Determinar la posición del diálogo
  const hasCoordinates = pendingAction.x !== undefined && pendingAction.y !== undefined;
  const x = hasCoordinates ? pendingAction.x! : window.innerWidth / 2;
  const y = hasCoordinates ? pendingAction.y! : window.innerHeight / 2;

  // Ajustar la posición del popup para que no se salga de la pantalla
  const popupX = Math.min(Math.max(x + 20, 20), window.innerWidth - 300);
  const popupY = Math.min(Math.max(y - 50, 20), window.innerHeight - 150);

  const getActionText = () => {
    switch (pendingAction.type) {
      case 'mouseClick': return `Hacer clic en (${x}, ${y})`;
      case 'mouseMove': return `Mover cursor a (${x}, ${y})`;
      case 'typeText': return `Escribir "${pendingAction.target}"`;
      case 'pressKey': return `Presionar tecla "${pendingAction.target}"`;
      case 'openApp': return `Abrir aplicación "${pendingAction.target}"`;
      default: return 'Acción desconocida';
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] pointer-events-none" style={{ background: 'rgba(0,0,0,0.1)' }}>
      <style>{`
        @keyframes popIn {
          from { opacity: 0; transform: scale(0.9) translateY(10px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
      
      {/* Retícula (Crosshair) visual en las coordenadas indicadas */}
      {hasCoordinates && (
        <>
          <div 
            className="absolute bg-red-500 rounded-full"
            style={{ 
              left: x - 4, 
              top: y - 4, 
              width: 8, 
              height: 8,
              boxShadow: '0 0 10px 2px rgba(239, 68, 68, 0.8)'
            }}
          />
          {/* Círculo animado */}
          <div 
            className="absolute border-2 border-red-500 rounded-full animate-ping"
            style={{ 
              left: x - 15, 
              top: y - 15, 
              width: 30, 
              height: 30,
              opacity: 0.7
            }}
          />
          {/* Líneas guía sutiles */}
          <div className="absolute top-0 bottom-0 border-l border-red-500/20" style={{ left: x }} />
          <div className="absolute left-0 right-0 border-t border-red-500/20" style={{ top: y }} />
        </>
      )}

      {/* Pop-up de permisos */}
      <div 
        className="absolute pointer-events-auto bg-black/80 backdrop-blur-md border border-red-500/50 rounded-xl p-4 shadow-2xl text-white transition-all duration-300 ease-out"
        style={{ 
          left: popupX, 
          top: popupY,
          width: '280px',
          animation: 'popIn 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">⚠️</span>
          <h3 className="font-bold text-sm text-red-400 uppercase tracking-wider">Permiso Requerido</h3>
        </div>
        
        <p className="text-sm text-gray-300 mb-4 line-clamp-2">
          Nova quiere: <strong className="text-white block mt-1">{getActionText()}</strong>
          {pendingAction.description && (
            <span className="block text-xs text-gray-400 mt-1">"{pendingAction.description}"</span>
          )}
        </p>

        <div className="flex gap-2">
          <button 
            onClick={() => onReject(pendingAction.id)}
            className="flex-1 bg-gray-800 hover:bg-gray-700 text-gray-300 text-xs font-bold py-2 px-4 rounded transition-colors"
          >
            Rechazar
          </button>
          <button 
            onClick={() => onApprove(pendingAction.id)}
            className="flex-1 bg-red-600 hover:bg-red-500 text-white text-xs font-bold py-2 px-4 rounded shadow-[0_0_10px_rgba(220,38,38,0.5)] transition-colors"
          >
            Permitir
          </button>
        </div>
        <div className="text-[10px] text-gray-500 text-center mt-2">
          También puedes decir "sí" o "no"
        </div>
      </div>
    </div>
  );
}
