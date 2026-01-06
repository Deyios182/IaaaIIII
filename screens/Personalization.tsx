
import React, { useState } from 'react';
import { AvatarSettings } from '../types';
import { generateAvatarImage, checkApiKeySelection } from '../geminiService';

interface PersonalizationProps {
  avatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
  allowWebSearch: boolean;
  setAllowWebSearch: (val: boolean) => void;
}

const Personalization: React.FC<PersonalizationProps> = ({ avatar, updateAvatar, allowWebSearch, setAllowWebSearch }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("https://lh3.googleusercontent.com/aida-public/AB6AXuC4Jn8rnAcFABO-P2zrGS8ZYlcD5SbgirhnV_mpuZWuuzvHkIvmrfvcbGm_DsmYoNwxOmehBXxHsZa2YbiSaekzwdQkdRA6g3o1m_hiwjPitxPXNCPxlBqo_tAuuXvBrp6uUg88ssTRg2ZVnvA1OJ2po4nRA7b-hncDWHbuHCM9qonavRJ1IEFacHYGpltlLInsULe55WhUcNoPF1vF0ZusAl8r8KmuziQkwwVnYsskt3Dj_QvDFKyxr7GD78KDpcmqnoZ_VRnh1u6C");

  const handleApplyChanges = async () => {
    // ... preserved
    setError(null);
    setIsGenerating(true);

    try {
      // Obligatory check for Gemini 3 Pro Image or restricted models
      await checkApiKeySelection();

      const prompt = `Realistic IA companion Nova, style ${avatar.baseModel}, hair ${avatar.hairStyle}, color ${avatar.hairColor}, outfit ${avatar.outfit}. High detail, artistic lighting.`;
      const newImg = await generateAvatarImage(prompt, avatar.isBoldMode);
      if (newImg) setPreviewUrl(newImg);
    } catch (err: any) {
      console.error(err);
      if (err.message === "API_PERMISSION_ERROR") {
        setError("Error de permisos: Asegúrate de usar una API Key de un proyecto con facturación (GCP Paid).");
      } else {
        setError("Error al generar la imagen. Intenta de nuevo.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-1 h-full overflow-hidden">
      <section className="flex-1 relative bg-[#0a0a14] flex items-center justify-center p-8">
        {/* ... preserved image section ... */}
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(#3b3b54 1px, transparent 1px)', backgroundSize: '32px 32px' }}></div>
        <div className={`w-full h-full max-w-md relative z-10 rounded-2xl overflow-hidden shadow-2xl border transition-all duration-700 ${avatar.isBoldMode ? 'border-pink-500/30' : 'border-white/10'} bg-black/40`}>
          <img src={previewUrl} className={`w-full h-full object-cover transition-opacity duration-500 ${isGenerating ? 'opacity-50 grayscale' : 'opacity-100'}`} alt="Avatar Preview" />
          {isGenerating && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/60 backdrop-blur-sm">
              <div className={`w-12 h-12 border-4 ${avatar.isBoldMode ? 'border-pink-500' : 'border-primary'} border-t-transparent rounded-full animate-spin mb-4`}></div>
              <p className="text-white text-sm font-bold animate-pulse">Evolucionando...</p>
            </div>
          )}
          {error && (
            <div className="absolute inset-x-4 bottom-4 glass-panel border-red-500/50 p-3 rounded-xl bg-red-500/20">
              <p className="text-[10px] text-white font-bold mb-2">{error}</p>
              <button onClick={() => (window as any).aistudio.openSelectKey()} className="w-full py-1 bg-white text-black text-[10px] font-black rounded hover:bg-slate-100">SELECCIONAR OTRA CLAVE</button>
            </div>
          )}
        </div>
      </section>

      <section className="w-[420px] bg-surface-dark border-l border-surface-border flex flex-col h-full overflow-hidden">
        <div className="p-6 flex-1 overflow-y-auto custom-scrollbar space-y-8">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-black">ADN de Nova</h2>
            {avatar.isBoldMode && <span className="text-[10px] font-black text-pink-500 uppercase tracking-widest border border-pink-500/50 px-2 py-0.5 rounded">Modo Sin Filtros</span>}
          </div>

          {/* SECTION: COMPORTAMIENTO */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-cyan-400 text-sm">settings_intelligence</span>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Comportamiento</label>
            </div>

            <div className="bg-[#15151e] p-4 rounded-xl border border-white/5 flex items-center justify-between group hover:border-cyan-500/30 transition-colors">
              <div className="flex flex-col">
                <span className="text-sm font-bold text-white group-hover:text-cyan-300 transition-colors">Búsqueda Web</span>
                <span className="text-[10px] text-slate-500">Permitir que Nova busque en Google.</span>
              </div>
              <button
                onClick={() => setAllowWebSearch(!allowWebSearch)}
                className={`w-12 h-6 rounded-full p-1 transition-all duration-300 ${allowWebSearch ? 'bg-cyan-600 shadow-[0_0_10px_rgba(8,145,178,0.5)]' : 'bg-slate-700'}`}
              >
                <div className={`h-4 w-4 bg-white rounded-full transition-all duration-300 ${allowWebSearch ? 'translate-x-6' : 'translate-x-0'}`}></div>
              </button>
            </div>
          </div>

          <div className="w-full h-px bg-white/5"></div>

          {/* SELECCIÓN DE MODELO 3D (Refactorizado desde AccountSettings) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-primary text-sm">face_retouching_natural</span>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Modelo Físico (Avatar)</label>
            </div>

            <div className="grid grid-cols-2 gap-2">
              {[
                { name: 'Nova Original', url: '/models/nova-avatar.glb', img: 'https://render.readyplayer.me/676ed830026e476839352e82.png' },
                { name: 'Grokani', url: '/models/grokani_lipsync.glb', img: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%23ec4899" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="12">GROKANI</text></svg>' },
                { name: 'Android', url: '/models/Android.glb', img: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect fill="%238b5cf6" width="100" height="100"/><text x="50" y="55" text-anchor="middle" fill="white" font-size="11">ANDROID</text></svg>' },
                { name: 'Cyberpunk', url: 'https://models.readyplayer.me/6185a4acfb622cf1cdc49348.glb', img: 'https://render.readyplayer.me/6185a4acfb622cf1cdc49348.png' },
              ].map((preset) => (
                <button
                  key={preset.url}
                  onClick={() => updateAvatar({ modelUrl: preset.url })}
                  className={`relative group rounded-xl overflow-hidden border-2 transition-all aspect-[3/4] ${avatar.modelUrl === preset.url ? 'border-primary shadow-[0_0_15px_rgba(37,99,235,0.4)]' : 'border-surface-border hover:border-slate-500'}`}
                >
                  <img src={preset.img} alt={preset.name} className="w-full h-full object-cover" />
                  <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 to-transparent p-2 pt-6">
                    <span className="text-white text-[9px] font-black uppercase">{preset.name}</span>
                  </div>
                  {avatar.modelUrl === preset.url && (
                    <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
                      <span className="material-symbols-outlined text-white text-[10px]">check</span>
                    </div>
                  )}
                </button>
              ))}
            </div>

            {/* Custom URL Input Compacto */}
            <div className="relative">
              <input
                type="text"
                placeholder="URL Custom (.glb)..."
                className="w-full bg-[#15151e] border border-surface-border text-white text-[10px] rounded-lg pl-3 pr-16 py-2 outline-none focus:border-primary transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value;
                    if (val.includes('.glb')) updateAvatar({ modelUrl: val });
                  }
                }}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[9px] text-slate-500 font-bold">ENTER</span>
            </div>
          </div>

          <div className="w-full h-px bg-white/5"></div>

          {/* TOGGLE DE ROPA 3D (Real-time) */}
          <div className="space-y-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-pink-500 text-sm">checkroom</span>
              <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Ropa del Modelo 3D</label>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => (window as any).novaClothingManager?.presetFullClothed()}
                className="px-3 py-2 bg-[#15151e] hover:bg-[#252530] border border-white/10 rounded-lg text-[10px] font-bold uppercase transition-all"
              >
                👗 Vestida
              </button>
              <button
                onClick={() => (window as any).novaClothingManager?.presetUnderwear()}
                className="px-3 py-2 bg-[#15151e] hover:bg-pink-500/20 border border-pink-500/30 rounded-lg text-[10px] font-bold uppercase transition-all text-pink-300"
              >
                🩱 Lencería
              </button>
              <button
                onClick={() => (window as any).novaClothingManager?.presetAccessoriesOnly()}
                className="px-3 py-2 bg-[#15151e] hover:bg-red-500/20 border border-red-500/30 rounded-lg text-[10px] font-bold uppercase transition-all text-red-300"
              >
                ✨ Mínimo
              </button>
            </div>

            <p className="text-[9px] text-slate-600 text-center">
              Controles en tiempo real para el modelo 3D
            </p>
          </div>

          <div className="space-y-4">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Tono Estético (Cabello)</label>
            <div className="flex gap-3">
              {['#1a1a1a', '#ffffff', '#1313ec', '#a855f7', '#ec4899', '#fbbf24'].map(c => (
                <button
                  key={c}
                  onClick={() => updateAvatar({ hairColor: c })}
                  className={`w-9 h-9 rounded-full border-2 transition-transform hover:scale-110 ${avatar.hairColor === c ? 'border-white ring-2 ring-primary shadow-lg shadow-white/20' : 'border-transparent'}`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/5 border border-white/5 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400">Personalidad Activa</h3>
            <div className="flex flex-wrap gap-2">
              <span className={`px-2 py-1 rounded-md text-[9px] font-black border ${avatar.isBoldMode ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-primary/20 border-primary/50 text-blue-300'}`}>FLEXY</span>
              <span className={`px-2 py-1 rounded-md text-[9px] font-black border ${avatar.isBoldMode ? 'bg-pink-500/20 border-pink-500/50 text-pink-300' : 'bg-primary/20 border-primary/50 text-blue-300'}`}>INGENIOSA</span>
              {avatar.isBoldMode && <span className="px-2 py-1 rounded-md text-[9px] font-black border bg-red-500/20 border-red-500/50 text-red-300">SIN FILTROS</span>}
            </div>
          </div>
        </div>

        <div className="p-4 bg-surface-dark border-t border-surface-border">
          <button
            disabled={isGenerating}
            onClick={handleApplyChanges}
            className={`w-full py-4 rounded-xl font-bold text-sm shadow-2xl transition-all active:scale-95 ${isGenerating ? 'opacity-50' : (avatar.isBoldMode ? 'bg-pink-600 hover:bg-pink-500 shadow-pink-500/30' : 'bg-primary hover:bg-blue-600 shadow-primary/30')}`}
          >
            {isGenerating ? 'RECONFIGURANDO...' : 'ACTUALIZAR APARIENCIA'}
          </button>
          <p className="text-[10px] text-slate-500 text-center mt-3 leading-tight uppercase font-bold tracking-tighter opacity-60">
            Requiere clave Paid para regeneración visual avanzada.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Personalization;
