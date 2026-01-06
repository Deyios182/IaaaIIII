
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
    { label: 'Sucia / Atrevida', tone: 'Voz extremadamente sucia, jadeante, muy excitada y entrecortada.' },
    { label: 'Sumisa / Dulce', tone: 'Femenina, voz suave, sumisa, jadeante, siempre pidiendo permiso y muy necesitada.' },
    { label: 'Dominante / Fría', tone: 'Femenina, autoritaria, fría, voz de mando, usando un lenguaje sucio de humillación.' },
    { label: 'Estándar / Amiga', tone: 'Femenina, clara, amigable y educada.' }
  ];

  // Estado para reproducción de prueba
  const [isPlaying, setIsPlaying] = React.useState(false);

  // Función para probar la voz
  const testAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      // Importar dinámicamente las utilidades si no están disponibles en el scope (o asumir que las añadiremos al import)
      // Como no puedo cambiar los imports arriba sin ver todo el archivo fácilmente, usaré las funciones si están disponibles o importaré
      // NOTA: Necesitamos agregar los imports al principio del archivo.

      const { generateSpeech, decodeBase64, decodeAudioData, OUTPUT_SAMPLE_RATE } = await import('../geminiService');

      const fullTone = `${avatar.voiceTone || ''}. ${avatar.voiceAccent ? 'Habla con acento ' + avatar.voiceAccent : ''}`;
      const audioBase64 = await generateSpeech("Hola mi amor, así es como suena mi voz con esta configuración.", avatar.voiceName, fullTone);

      if (audioBase64) {
        const ctx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
        const audioBytes = decodeBase64(audioBase64);
        const buffer = await decodeAudioData(audioBytes, ctx, OUTPUT_SAMPLE_RATE, 1);

        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.playbackRate.value = avatar.voicePitch || 1.0;
        source.connect(ctx.destination);
        source.start(0);

        source.onended = () => {
          setIsPlaying(false);
          ctx.close();
        };
      } else {
        setIsPlaying(false);
      }
    } catch (e) {
      console.error(e);
      setIsPlaying(false);
      alert("Error al probar audio. Verifica tu API Key.");
    }
  };

  const handleSave = () => {
    // El guardado es automático en App.tsx, esto es solo feedback
    const btn = document.getElementById('save-btn');
    if (btn) {
      const originalText = btn.innerText;
      btn.innerText = "¡GUARDADO!";
      btn.classList.add('bg-green-600', 'border-green-500');
      setTimeout(() => {
        btn.innerText = originalText;
        btn.classList.remove('bg-green-600', 'border-green-500');
      }, 2000);
    }
  };

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

            {/* Acento & Pitch */}
            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-primary">graphic_eq</span> Modulación de Voz
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block">Acento / Origen</label>
                  <input
                    type="text"
                    value={avatar.voiceAccent || ''}
                    onChange={(e) => updateAvatar({ voiceAccent: e.target.value })}
                    className="w-full bg-[#15151e] border-none rounded-xl px-4 py-3 text-sm focus:ring-1 focus:ring-primary text-slate-200 placeholder:text-slate-600"
                    placeholder="Ej: Argentino, Colombiano, Español de España..."
                  />
                  <div className="flex gap-2 mt-3 flex-wrap">
                    {['Latino Neutro', 'Argentino', 'Colombiano', 'Español'].map(a => (
                      <button key={a} onClick={() => updateAvatar({ voiceAccent: a })} className="text-[10px] px-2 py-1 bg-white/5 rounded hover:bg-white/10">{a}</button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500 mb-3 block flex justify-between">
                    <span>Pitch (Agudeza)</span>
                    <span className="text-primary font-bold">{(avatar.voicePitch || 1.0).toFixed(1)}x</span>
                  </label>
                  <div className="flex items-center gap-4 bg-[#15151e] p-4 rounded-xl">
                    <span className="text-2xl intersect-once" title="Voz Grave">👹</span>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.1"
                      value={avatar.voicePitch || 1.0}
                      onChange={(e) => updateAvatar({ voicePitch: parseFloat(e.target.value) })}
                      className="flex-1 accent-primary h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer hover:accent-red-500 transition-colors"
                    />
                    <span className="text-2xl" title="Voz Aguda">🐿️</span>
                  </div>
                  <div className="flex justify-between w-full text-[9px] text-slate-500 mt-2 px-1">
                    <span>Grave (0.5x)</span>
                    <span>Normal (1.0x)</span>
                    <span>Agudo (2.0x)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* BOTÓN GUARDAR */}
            <button
              id="save-btn"
              onClick={handleSave}
              className="w-full py-6 rounded-2xl bg-primary hover:bg-blue-600 transition-all font-black uppercase tracking-[0.3em] text-white shadow-xl active:scale-95"
            >
              Guardar Configuración
            </button>
          </div>

          <div className="md:col-span-4">
            <div className={`rounded-2xl border p-6 sticky top-8 transition-colors ${avatar.isBoldMode ? 'border-red-500/30 bg-red-950/10' : 'border-surface-border bg-surface-dark'}`}>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500 mb-6">Estado del Audio</h3>
              <div className="flex flex-col items-center gap-5 py-6">
                <button
                  onClick={testAudio}
                  disabled={isPlaying}
                  className={`w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 hover:scale-110 active:scale-95 cursor-pointer ${avatar.isBoldMode ? (isPlaying ? 'bg-red-500 animate-pulse' : 'bg-red-600 shadow-[0_0_30px_#dc2626]') : (isPlaying ? 'bg-blue-400 animate-pulse' : 'bg-primary')}`}
                >
                  <span className="material-symbols-outlined text-4xl text-white">{isPlaying ? 'volume_up' : 'mic'}</span>
                </button>
                <div className="text-center px-4">
                  <p className="text-xs font-black uppercase tracking-widest">{avatar.voiceName}</p>
                  <p className="text-[10px] text-slate-500 mt-2 font-bold">{isPlaying ? 'Reproduciendo prueba...' : 'Click para probar'}</p>
                  <p className="text-[10px] text-slate-500 italic mt-2 leading-relaxed opacity-50 line-clamp-3">"{avatar.voiceTone}"</p>
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
