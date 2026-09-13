import React, { useState, useEffect } from 'react';

export interface ScreenSource {
  id: string;
  name: string;
  thumbnail: string;
}

interface ScreenSharePickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectSource: (sourceId?: string, captureAudio?: boolean, sourceName?: string) => void;
  isElectron: boolean;
  getSources?: () => Promise<ScreenSource[]>;
}

export const ScreenSharePickerModal: React.FC<ScreenSharePickerModalProps> = ({
  isOpen,
  onClose,
  onSelectSource,
  isElectron,
  getSources,
}) => {
  const [activeTab, setActiveTab] = useState<'screens' | 'windows'>('screens');
  const [sources, setSources] = useState<ScreenSource[]>([]);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [shareAudio, setShareAudio] = useState<boolean>(true);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  useEffect(() => {
    if (!isOpen) return;

    // Reset selección
    setSelectedSourceId(null);

    if (isElectron && getSources) {
      setIsLoading(true);
      getSources()
        .then((items) => {
          setSources(items || []);
          // Seleccionar por defecto la primera pantalla completa si existe
          const defaultScreen = items.find(
            (s) => s.name.toLowerCase().includes('screen') || s.name.toLowerCase().includes('pantalla')
          ) || items[0];
          if (defaultScreen) {
            setSelectedSourceId(defaultScreen.id);
          }
        })
        .catch((err) => {
          console.error('Error cargando fuentes de pantalla:', err);
          setSources([]);
        })
        .finally(() => setIsLoading(false));
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, isElectron]);

  if (!isOpen) return null;

  // Filtrar pantallas vs ventanas
  const screenSources = sources.filter(
    (s) => s.name.toLowerCase().includes('screen') || s.name.toLowerCase().includes('pantalla') || s.id.startsWith('screen:')
  );
  const windowSources = sources.filter(
    (s) => !s.name.toLowerCase().includes('screen') && !s.name.toLowerCase().includes('pantalla') && !s.id.startsWith('screen:')
  );

  const displayedSources = activeTab === 'screens' ? screenSources : windowSources;

  const handleConfirm = () => {
    if (isElectron) {
      if (!selectedSourceId) return;
      const selectedSource = sources.find((s) => s.id === selectedSourceId);
      onSelectSource(selectedSourceId, shareAudio, selectedSource?.name);
    } else {
      // En modo web el navegador abre su propio selector nativo de pestaña/ventana/pantalla
      onSelectSource(undefined, shareAudio);
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div className="relative w-full max-w-2xl bg-[#0d0f17] border border-cyan-500/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header estilo Meet / Modern Dark */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-white/5">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
              <span className="material-symbols-outlined text-xl">screen_share</span>
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-white tracking-wide">
                Compartir pantalla con Nova
              </h2>
              <p className="text-xs text-gray-400">
                Selecciona qué ventana o pantalla deseas mostrar y el audio a incluir
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white flex items-center justify-center transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Tabs: Pantallas vs Ventanas (Solo en Electron) */}
        {isElectron && (
          <div className="flex items-center gap-2 px-6 pt-3 pb-1 border-b border-white/5 bg-black/20">
            <button
              onClick={() => setActiveTab('screens')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'screens'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-sm">desktop_windows</span>
              Pantalla completa ({screenSources.length})
            </button>
            <button
              onClick={() => setActiveTab('windows')}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                activeTab === 'windows'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                  : 'text-gray-400 hover:text-white hover:bg-white/5'
              }`}
            >
              <span className="material-symbols-outlined text-sm">web_asset</span>
              Ventana de aplicación ({windowSources.length})
            </button>
          </div>
        )}

        {/* Contenido principal: Grid de thumbnails */}
        <div className="flex-1 overflow-y-auto p-6 custom-scrollbar min-h-[220px]">
          {isElectron ? (
            isLoading ? (
              <div className="h-48 flex flex-col items-center justify-center gap-3 text-gray-400">
                <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-400 rounded-full animate-spin" />
                <span className="text-xs">Detectando pantallas y ventanas activas...</span>
              </div>
            ) : displayedSources.length === 0 ? (
              <div className="h-48 flex flex-col items-center justify-center gap-2 text-gray-400">
                <span className="material-symbols-outlined text-3xl text-gray-600">visibility_off</span>
                <span className="text-xs">No se encontraron {activeTab === 'screens' ? 'pantallas' : 'ventanas'} disponibles.</span>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                {displayedSources.map((source) => {
                  const isSelected = selectedSourceId === source.id;
                  return (
                    <div
                      key={source.id}
                      onClick={() => setSelectedSourceId(source.id)}
                      className={`group relative rounded-xl border p-2 cursor-pointer transition-all flex flex-col gap-2 ${
                        isSelected
                          ? 'bg-cyan-500/15 border-cyan-400 ring-2 ring-cyan-500/40 shadow-lg shadow-cyan-950/50'
                          : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10'
                      }`}
                    >
                      <div className="relative aspect-video w-full rounded-lg overflow-hidden bg-black/60 border border-white/5">
                        {source.thumbnail ? (
                          <img
                            src={source.thumbnail}
                            alt={source.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-gray-600">
                            <span className="material-symbols-outlined text-3xl">desktop_windows</span>
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-1.5 right-1.5 w-5 h-5 rounded-full bg-cyan-500 text-black flex items-center justify-center shadow-md">
                            <span className="material-symbols-outlined text-sm font-bold">check</span>
                          </div>
                        )}
                      </div>
                      <span className="text-[11px] font-medium text-gray-200 truncate px-1" title={source.name}>
                        {source.name}
                      </span>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center p-6 gap-3">
              <div className="w-12 h-12 rounded-2xl bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center text-cyan-400">
                <span className="material-symbols-outlined text-2xl">tab</span>
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Selector nativo del navegador</h3>
                <p className="text-xs text-gray-400 mt-1 max-w-sm">
                  Al presionar Compartir, tu navegador te permitirá elegir entre toda la pantalla, una ventana específica o una pestaña.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Toggle de Audio (como en Google Meet) + Botones de Acción */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 px-6 py-4 border-t border-white/10 bg-black/40">
          <label className="flex items-center gap-3 cursor-pointer group select-none">
            <div
              onClick={() => setShareAudio(!shareAudio)}
              className={`w-10 h-5 rounded-full transition-colors relative flex items-center p-0.5 ${
                shareAudio ? 'bg-cyan-500' : 'bg-gray-700'
              }`}
            >
              <div
                className={`w-4 h-4 rounded-full bg-white transition-transform ${
                  shareAudio ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </div>
            <div className="flex items-center gap-1.5 text-xs font-medium text-gray-300 group-hover:text-white transition-colors">
              <span className="material-symbols-outlined text-sm text-cyan-400">
                {shareAudio ? 'volume_up' : 'volume_off'}
              </span>
              <span>Compartir también el audio del sistema (música/juegos/videos)</span>
            </div>
          </label>

          <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-gray-400 hover:text-white hover:bg-white/10 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleConfirm}
              disabled={isElectron && !selectedSourceId}
              className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-bold text-black transition-all shadow-md active:scale-95 ${
                isElectron && !selectedSourceId
                  ? 'bg-gray-600 cursor-not-allowed opacity-50'
                  : 'bg-gradient-to-r from-cyan-400 to-teal-400 hover:from-cyan-300 hover:to-teal-300 shadow-cyan-500/20'
              }`}
            >
              <span className="material-symbols-outlined text-sm font-bold">screen_share</span>
              Compartir
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
