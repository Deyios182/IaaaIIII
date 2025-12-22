
import React, { useState } from 'react';
import { AvatarSettings } from '../types';
import { generateAvatarImage, checkApiKeySelection } from '../geminiService';

interface PersonalizationProps {
  avatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
}

const Personalization: React.FC<PersonalizationProps> = ({ avatar, updateAvatar }) => {
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState("https://lh3.googleusercontent.com/aida-public/AB6AXuC4Jn8rnAcFABO-P2zrGS8ZYlcD5SbgirhnV_mpuZWuuzvHkIvmrfvcbGm_DsmYoNwxOmehBXxHsZa2YbiSaekzwdQkdRA6g3o1m_hiwjPitxPXNCPxlBqo_tAuuXvBrp6uUg88ssTRg2ZVnvA1OJ2po4nRA7b-hncDWHbuHCM9qonavRJ1IEFacHYGpltlLInsULe55WhUcNoPF1vF0ZusAl8r8KmuziQkwwVnYsskt3Dj_QvDFKyxr7GD78KDpcmqnoZ_VRnh1u6C");

  const handleApplyChanges = async () => {
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
          
          <div className="space-y-4">
             <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Esqueleto Lógico</label>
             <div className="grid grid-cols-2 gap-2">
               {['Humanoide', 'Cyborg', 'Anime', 'Ultra Realista'].map(m => (
                 <button 
                  key={m} 
                  onClick={() => updateAvatar({ baseModel: m })}
                  className={`p-3 rounded-xl border-2 text-[11px] font-bold transition-all ${avatar.baseModel === m ? (avatar.isBoldMode ? 'border-pink-500 bg-pink-500/10 text-pink-100' : 'border-primary bg-primary/10 text-white') : 'border-surface-border hover:bg-white/5 text-slate-400'}`}
                 >
                   {m}
                 </button>
               ))}
             </div>
          </div>

          <div className="space-y-4">
             <label className="text-xs font-bold text-slate-500 uppercase tracking-tighter">Vestimenta</label>
             <select 
               className="w-full bg-[#15151e] border-none rounded-xl p-3.5 text-sm focus:ring-1 focus:ring-pink-500"
               value={avatar.outfit}
               onChange={(e) => updateAvatar({ outfit: e.target.value })}
             >
               <option>Traje Futurista Ajustado</option>
               <option>Lencería de Neón</option>
               <option>Outfit Casual (Top & Jeans)</option>
               <option>Ropa de Deporte</option>
               <option>Uniforme de Exploración</option>
             </select>
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
