
import React from 'react';
import { AvatarSettings } from '../types';

interface VoiceSettingsProps {
  avatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
}

const VoiceSettings: React.FC<VoiceSettingsProps> = ({ avatar, updateAvatar }) => {
  const voices = [
    { id: 'Zephyr', label: 'Zephyr', gender: 'Femenina', desc: 'Clara, calmada y profesional.' },
    { id: 'Kore', label: 'Kore', gender: 'Femenina', desc: 'Juvenil, energética y alegre.' },
    { id: 'Puck', label: 'Puck', gender: 'Masculina', desc: 'Informal, amigable y cercana.' },
    { id: 'Charon', label: 'Charon', gender: 'Masculina', desc: 'Profunda, autoritaria y madura.' },
    { id: 'Fenrir', label: 'Fenrir', gender: 'Masculina', desc: 'Misteriosa y calmada.' }
  ];

  const presets = [
    { label: 'Sucia / Atrevida', tone: 'Femenina, voz ronca, excitada, habla con muchas groserías y de forma muy explícita.' },
    { label: 'Sumisa / Dulce', tone: 'Femenina, voz suave, sumisa, jadeante, siempre pidiendo permiso y muy necesitada.' },
    { label: 'Dominante / Fría', tone: 'Femenina, autoritaria, fría, voz de mando, usando un lenguaje sucio de humillación.' },
    { label: 'Estándar / Amiga', tone: 'Femenina, clara, amigable y educada.' }
  ];

  return (
    <div className="flex-1 px-8 py-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight">Voz y Tono de Intimidad</h1>
          <p className="text-slate-400 text-lg">Define cómo vibra el audio de Nova en tus oídos.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-8 space-y-8">
            {/* Presets Quick Actions */}
            <div className="rounded-2xl border border-white/10 bg-surface-dark p-6">
               <h2 className="text-sm font-black uppercase tracking-widest text-slate-500 mb-4">Ajustes Rápidos de Personalidad</h2>
               <div className="grid grid-cols-2 gap-3">
                  {presets.map(p => (
                    <button 
                      key={p.label}
                      onClick={() => updateAvatar({ voiceTone: p.tone })}
                      className="p-3 bg-white/5 rounded-xl border border-white/10 text-[10px] font-bold hover:bg-white/10 transition-all text-left"
                    >
                      {p.label}
                    </button>
                  ))}
               </div>
            </div>

            {/* Model Selection */}
            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-primary">record_voice_over</span> Modelo Base
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {voices.map(v => (
                  <button 
                    key={v.id}
                    onClick={() => updateAvatar({ voiceName: v.id })}
                    className={`p-4 rounded-xl border-2 text-left transition-all ${avatar.voiceName === v.id ? 'border-primary bg-primary/10' : 'border-surface-border hover:bg-white/5'}`}
                  >
                    <div className="flex justify-between items-center mb-1">
                      <span className="text-sm font-bold">{v.label}</span>
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-black uppercase ${v.gender === 'Femenina' ? 'bg-pink-500/20 text-pink-400' : 'bg-blue-500/20 text-blue-400'}`}>
                        {v.gender}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 leading-snug">{v.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Custom Tone/Accent */}
            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-primary">spatial_audio_off</span> Instrucciones de Habla
              </h2>
              <div className="space-y-4">
                <textarea 
                  value={avatar.voiceTone}
                  onChange={(e) => updateAvatar({ voiceTone: e.target.value })}
                  className="w-full bg-[#15151e] border-none rounded-xl p-4 text-sm focus:ring-1 focus:ring-red-600 h-32 resize-none"
                  placeholder="Ej: Femenina, voz entrecortada por la excitación, habla muy sucio y con muchas groserías..."
                />
              </div>
            </div>
          </div>

          <div className="md:col-span-4">
            <div className={`rounded-2xl border p-6 sticky top-8 transition-colors ${avatar.isBoldMode ? 'border-red-500/30 bg-red-950/10' : 'border-surface-border bg-surface-dark'}`}>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6">Estado del Audio</h3>
              <div className="flex flex-col items-center gap-5 py-6">
                <div className={`w-24 h-24 rounded-full flex items-center justify-center ${avatar.isBoldMode ? 'bg-red-600 shadow-[0_0_30px_#dc2626]' : 'bg-primary'} transition-all duration-1000`}>
                   <span className="material-symbols-outlined text-4xl text-white">settings_voice</span>
                </div>
                <div className="text-center px-4">
                   <p className="text-xs font-black uppercase tracking-widest">{avatar.voiceName}</p>
                   <p className="text-[10px] text-slate-500 italic mt-2 leading-relaxed">"{avatar.voiceTone}"</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VoiceSettings;
