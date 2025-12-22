
import React from 'react';
import { MemoryRetention, ConversationStyle } from '../types';

interface MemorySettingsProps {
  retention: MemoryRetention;
  style: ConversationStyle;
  setRetention: (r: MemoryRetention) => void;
  setStyle: (s: ConversationStyle) => void;
}

const MemorySettings: React.FC<MemorySettingsProps> = ({ retention, style, setRetention, setStyle }) => {
  return (
    <div className="flex-1 px-8 py-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight">Configuración de Memoria</h1>
          <p className="text-slate-400 text-lg">Gestiona cómo tu compañero IA almacena, recuerda y utiliza la información sobre ti.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-primary">psychology</span> Nivel de Retención
              </h2>
              <div className="space-y-4">
                {[
                  { value: MemoryRetention.SESSION, title: 'Amnésico (Solo sesión)', desc: 'La IA olvidará todo al reiniciar. Máxima privacidad.' },
                  { value: MemoryRetention.SHORT_TERM, title: 'Corto Plazo (30 días)', desc: 'Mantiene contexto de interacciones recientes.' },
                  { value: MemoryRetention.LONG_TERM, title: 'Largo Plazo (Indefinido)', desc: 'Construye una base de conocimiento permanente.' }
                ].map(opt => (
                  <label key={opt.value} className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${retention === opt.value ? 'border-primary bg-primary/5' : 'border-surface-border hover:border-white/10'}`}>
                    <input 
                      type="radio" 
                      name="retention" 
                      checked={retention === opt.value} 
                      onChange={() => setRetention(opt.value)} 
                      className="mt-1 text-primary focus:ring-primary border-slate-600 bg-transparent"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">{opt.title}</span>
                      <span className="text-xs text-slate-400 mt-1">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-primary">record_voice_over</span> Estilo de Conversación
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {Object.values(ConversationStyle).map(s => (
                  <button 
                    key={s}
                    onClick={() => setStyle(s)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${style === s ? 'border-primary bg-primary/10' : 'border-surface-border hover:bg-white/5'}`}
                  >
                    <span className="material-symbols-outlined text-2xl">{s === ConversationStyle.EMPATHIC ? 'sentiment_satisfied' : s === ConversationStyle.ANALYTICAL ? 'rocket_launch' : 'lightbulb'}</span>
                    <span className="text-xs font-bold">{s}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="rounded-2xl border border-surface-border bg-surface-dark flex flex-col h-full min-h-[400px]">
              <div className="p-6 border-b border-surface-border">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">bookmarks</span> Recuerdos Destacados
                </h2>
              </div>
              <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar">
                <div className="p-4 rounded-xl bg-surface-dark-lighter border border-surface-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Hecho Personal</span>
                    <span className="text-[10px] text-slate-500">Hace 2 días</span>
                  </div>
                  <p className="text-xs leading-relaxed">Usuario mencionó que su cumpleaños es el 12 de Octubre.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-dark-lighter border border-surface-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Profesional</span>
                    <span className="text-[10px] text-slate-500">Hace 1 semana</span>
                  </div>
                  <p className="text-xs leading-relaxed">Trabaja como Diseñador UI Senior enfocado en accesibilidad.</p>
                </div>
              </div>
              <div className="p-4 border-t border-surface-border">
                <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500/10 transition-colors">
                  <span className="material-symbols-outlined text-sm">delete_forever</span> Borrar toda la memoria
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemorySettings;
