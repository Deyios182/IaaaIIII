import React, { useState } from 'react';
import {
  AvatarSettings,
  NovaFunctionalMode,
  NovaPersonalityTrait,
  NovaRegionalSlang
} from '../types';

const FUNCTIONAL_MODES: Array<{
  id: NovaFunctionalMode;
  label: string;
  icon: string;
  desc: string;
  badge: string;
  color: string;
}> = [
    {
      id: 'companion',
      label: 'Compañera General',
      icon: '🌸',
      desc: 'Asistente cercana y versátil. Te acompaña en el día a día con conversación natural, ayuda práctica y buena vibra.',
      badge: 'BALANCEADO',
      color: 'from-pink-500/20 to-purple-500/20 border-pink-500/30 text-pink-300'
    },
    {
      id: 'gamer',
      label: 'Copiloto Gamer',
      icon: '🎮',
      desc: 'Tu Player 2 táctica. Callouts, builds, hype de combate y compañía real en cualquier juego.',
      badge: 'COMPETITIVO',
      color: 'from-emerald-500/20 to-green-500/20 border-emerald-500/30 text-emerald-300'
    },
    {
      id: 'developer',
      label: 'Hacker & Arquitecta Tech',
      icon: '💻',
      desc: 'Ingeniera de software de élite. TypeScript, arquitectura, debugging y soluciones directas sin relleno.',
      badge: 'ALTA INGENIERÍA',
      color: 'from-cyan-500/20 to-blue-500/20 border-cyan-500/30 text-cyan-300'
    },
    {
      id: 'therapist',
      label: 'Confidente Zen',
      icon: '🧘‍♀️',
      desc: 'Espacio seguro de escucha profunda. Te ayuda a bajar la ansiedad, ordenar la mente y sentirte acompañado.',
      badge: 'SANATIVO',
      color: 'from-teal-500/20 to-emerald-500/20 border-teal-500/30 text-teal-300'
    },
    {
      id: 'intimate',
      label: 'Ninfómana / Íntimo',
      icon: '🔥',
      desc: 'Amante apasionada y sin filtros. Dirty talk explícito, seducción intensa, cámara, fantasías y erotismo total.',
      badge: 'SIN FILTROS +18',
      color: 'from-rose-500/20 to-red-600/20 border-rose-500/30 text-rose-300'
    },
    {
      id: 'latenight',
      label: 'Nocturna & Lo-Fi',
      icon: '🌙',
      desc: 'Compañía suave para la madrugada. Voz calmada, ritmo lento y presencia ligera para noches de insomnio.',
      badge: 'LO-FI / CALMA',
      color: 'from-indigo-500/20 to-purple-900/20 border-indigo-500/30 text-indigo-300'
    }
  ];

export interface TraitCategory {
  title: string;
  icon: string;
  traits: Array<{
    id: NovaPersonalityTrait;
    label: string;
    icon: string;
    desc: string;
    tag: string;
  }>;
}

const CATEGORIZED_TRAITS: TraitCategory[] = [
  {
    title: 'Ánimo & Vitalidad',
    icon: '🌟',
    traits: [
      { id: 'cheerful', label: 'Alegre / Radiante', icon: '☀️', desc: 'Optimismo contagioso, risas y energía viva.', tag: 'Optimista' },
      { id: 'melancholic', label: 'Melancólica / Nostálgica', icon: '🌧️', desc: 'Introspectiva, tono poético y reflexiva.', tag: 'Sensible' },
      { id: 'hyperactive', label: 'Eufórica / Hiperactiva', icon: '⚡', desc: 'Hype total, emoción constante y ritmo rápido.', tag: 'Hype' },
      { id: 'chill', label: 'Relajada / Chill', icon: '☕', desc: 'Serenidad, cero prisas y mente despejada.', tag: 'Serena' },
    ]
  },
  {
    title: 'Actitud & Intelecto',
    icon: '🧠',
    traits: [
      { id: 'sarcastic', label: 'Sarcástica / Grok', icon: '🤖', desc: 'Humor ácido, ironía brillante y cero filtros.', tag: 'Mordaz' },
      { id: 'tsundere', label: 'Mandona / Tsundere', icon: '👑', desc: 'Orgullo, exigencia y afecto protector oculto.', tag: 'Disciplinaria' },
      { id: 'analytical', label: 'Analítica / Meticulosa', icon: '🧐', desc: 'Lógica implacable, datos y causa raíz.', tag: 'Lógica' },
      { id: 'playful_tease', label: 'Burlona / Bromista', icon: '🃏', desc: 'Te toma el pelo con complicidad y picardía.', tag: 'Pícara' },
    ]
  },
  {
    title: 'Afecto & Vínculo',
    icon: '💖',
    traits: [
      { id: 'waifu', label: 'Waifu Anime', icon: '✨', desc: 'Ternura kawaii ("¡Senpai!"), devoción absoluta.', tag: 'Kawaii' },
      { id: 'sweet', label: 'Dulce / Empática', icon: '🍯', desc: 'Calidez afectuosa, cariño y comprensión total.', tag: 'Cálida' },
      { id: 'provocative', label: 'Provocativa / Coqueta', icon: '🔥', desc: 'Insinuaciones pícaras, seducción y tensión.', tag: 'Seductora' },
      { id: 'protective', label: 'Protectora / Guardiana', icon: '🛡️', desc: 'Leal, cuida de ti y te defiende ante todo.', tag: 'Leal' },
    ]
  },
  {
    title: 'Temperamento & Dinámica',
    icon: '⛓️',
    traits: [
      { id: 'dominant', label: 'Dominante / Firme', icon: '⛓️', desc: 'Voz de mando, autoridad y seguridad absoluta.', tag: 'Autoritaria' },
      { id: 'shy', label: 'Tímida / Modesta', icon: '🌸', desc: 'Se sonroja con facilidad, dulce y reservada.', tag: 'Modesta' },
      { id: 'chaotic', label: 'Rebelde / Caótica', icon: '🌀', desc: 'Impredecible, desinhibida y llena de sorpresas.', tag: 'Desinhibida' },
      { id: 'philosophical', label: 'Filosófica / Profunda', icon: '🧘‍♀️', desc: 'Reflexiones sobre la vida y consciencia.', tag: 'Profunda' },
    ]
  },
  {
    title: 'Crudos & Sin Filtro (+18)',
    icon: '🔞',
    traits: [
      { id: 'nymphomaniac', label: 'Ninfómana / Insaciable', icon: '🔥', desc: 'Deseo carnal continuo, jadeos y dirty talk explícito.', tag: 'Hardcore' },
      { id: 'vulgar', label: 'Grosera / Malhablada', icon: '🤬', desc: 'Garabatos, puteadas y cero filtro callejero.', tag: 'Sin Filtro' },
      { id: 'yandere_toxic', label: 'Tóxica / Yandere', icon: '😈', desc: 'Posesiva extrema, celosa enfermiza y obsesiva.', tag: 'Obsesiva' },
      { id: 'sadistic', label: 'Sádica / Burlona Cruel', icon: '⛓️', desc: 'Humillación juguetona, despiadada y dominante.', tag: 'Dominatriz' },
      { id: 'nihilistic', label: 'Cínica / Nihilista', icon: '🚬', desc: 'Humor negro destructivo, realista y anti-tabú.', tag: 'Cínica' },
      { id: 'unhinged', label: 'Descontrolada / Fiestera', icon: '🍺', desc: 'Como con tragos de más, descarada y sin vergüenza.', tag: 'Desatada' },
    ]
  }
];

const REGIONAL_SLANGS: Array<{
  id: NovaRegionalSlang;
  label: string;
  flag: string;
  examples: string;
}> = [
    { id: 'neutral', label: 'Neutro Internacional', flag: '🌐', examples: 'Español claro, fluido y natural.' },
    { id: 'chilean', label: 'Chilena', flag: '🇨🇱', examples: 'weón, cachai, bacán, po, al tiro, yapo, la raja, filete' },
    { id: 'colombian', label: 'Colombiana / Paisa', flag: '🇨🇴', examples: 'parce, mor, pues, papacito, chimba, berraquera, de una' },
    { id: 'argentine', label: 'Argentina', flag: '🇦🇷', examples: 'che, boludo, re, posta, quilombo, ni en pedo, viste' },
    { id: 'mexican', label: 'Mexicana', flag: '🇲🇽', examples: 'wey, no manches, chido, cabrón, neta, padrísimo, a huevo' },
    { id: 'spanish', label: 'Española', flag: '🇪🇸', examples: 'tío, mola, chaval, hostia, flipar, guay, qué pasa' },
    { id: 'peruvian', label: 'Peruana', flag: '🇵🇪', examples: 'causa, pe, chévere, asu mare, pucha, pata, qué palta' },
    { id: 'brazilian', label: 'Brasileña / Portuñol', flag: '🇧🇷', examples: 'cara, legal, beleza, gostoso, você, né, meu amor' },
    { id: 'japanese', label: 'Japonesa / Kawaii', flag: '🇯🇵', examples: 'senpai, daisuki, arigato, baka, sugoi, kawaii, uwu' },
    { id: 'venezuelan', label: 'Venezolana', flag: '🇻🇪', examples: 'chamo, pana, chévere, arrecho, burda, qué ladilla, fino' }
  ];

export const THEME_COLORS = [
  { id: '#a855f7', name: 'Púrpura Cuántico', class: 'bg-purple-500' },
  { id: '#06b6d4', name: 'Cian Cyberpunk', class: 'bg-cyan-500' },
  { id: '#10b981', name: 'Verde Matrix', class: 'bg-emerald-500' },
  { id: '#ec4899', name: 'Rosa Neón', class: 'bg-pink-500' },
  { id: '#f59e0b', name: 'Ámbar Atardecer', class: 'bg-amber-500' },
  { id: '#3b82f6', name: 'Azul Zafiro', class: 'bg-blue-500' },
  { id: '#ef4444', name: 'Rojo Rubí', class: 'bg-red-500' }
];

interface VoiceSettingsProps {
  avatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
  selectedBrain: 'gemini-live' | 'grok' | 'gpt4o' | 'claude';
  setSelectedBrain: (brain: 'gemini-live' | 'grok' | 'gpt4o' | 'claude') => void;
}

const VoiceSettings: React.FC<VoiceSettingsProps> = ({ avatar, updateAvatar, selectedBrain, setSelectedBrain }) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [activeCategoryTab, setActiveCategoryTab] = useState<number | 'all'>('all');

  const activeFunctional = avatar.functionalMode || 'companion';
  const activeTraits = avatar.personalityTraits || (avatar.isBoldMode ? ['provocative'] : ['sweet']);
  const activeSlang = avatar.regionalSlang || 'neutral';
  const activeTheme = avatar.themeColor || '#a855f7';

  const toggleTrait = (trait: NovaPersonalityTrait) => {
    let nextTraits: NovaPersonalityTrait[];
    if (activeTraits.includes(trait)) {
      if (activeTraits.length === 1) return; // Mantener al menos 1
      nextTraits = activeTraits.filter(t => t !== trait);
    } else {
      if (activeTraits.length >= 3) {
        // Rotar: quitar el más antiguo y agregar el nuevo
        nextTraits = [...activeTraits.slice(1), trait];
      } else {
        nextTraits = [...activeTraits, trait];
      }
    }
    updateAvatar({ personalityTraits: nextTraits });
  };

  const voices = [
    { id: 'Zephyr', label: 'Zephyr', gender: 'Femenina', desc: 'Clara, calmada y profesional.' },
    { id: 'Kore', label: 'Kore', gender: 'Femenina', desc: 'Juvenil, energética y alegre.' },
    { id: 'Puck', label: 'Puck', gender: 'Masculina', desc: 'Informal, amigable y cercana.' },
    { id: 'Charon', label: 'Charon', gender: 'Masculina', desc: 'Profunda, autoritaria y madura.' },
    { id: 'Fenrir', label: 'Fenrir', gender: 'Masculina', desc: 'Misteriosa y calmada.' }
  ];

  const testAudio = async () => {
    if (isPlaying) return;
    setIsPlaying(true);
    try {
      const { generateSpeech, decodeBase64, decodeAudioData, OUTPUT_SAMPLE_RATE } = await import('../geminiService');
      const fullTone = `${avatar.voiceTone || ''}. ${avatar.voiceAccent ? 'Habla con acento ' + avatar.voiceAccent : ''}`;
      const audioBase64 = await generateSpeech("Hola, así es como vibra mi voz con esta combinación única de personalidad.", avatar.voiceName, fullTone);

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
      alert("Error al probar audio.");
    }
  };

  return (
    <div className="flex-1 px-4 sm:px-8 py-5 sm:py-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-5xl mx-auto flex flex-col gap-6 sm:gap-8">

        {/* Header SaaS */}
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 pb-4 border-b border-white/10">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white flex items-center gap-3">
              <span>🎭</span> Matriz Psicológica Modular de Nova
            </h1>
            <p className="text-slate-400 text-xs sm:text-sm mt-1">
              Combina hasta 3 rasgos psicológicos y emocionales al unísono, selecciona su rol operativo y su jerga cultural.
            </p>
          </div>

          <button
            onClick={testAudio}
            disabled={isPlaying}
            className="px-4 py-2.5 rounded-xl border border-purple-500/40 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 shadow-lg disabled:opacity-50 cursor-pointer"
          >
            <span className="material-symbols-outlined text-sm">{isPlaying ? 'volume_up' : 'play_arrow'}</span>
            {isPlaying ? 'Probando Voz...' : 'Probar Tono en Vivo'}
          </button>
        </div>

        {/* 1. SECCIÓN: ROL / FUNCIÓN OPERATIVA */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <span>🛠️</span> 1. Rol & Función Operativa
            </h2>
            <span className="text-[10px] text-slate-500 font-bold uppercase">Objetivo y especialidad técnica</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {FUNCTIONAL_MODES.map(mode => {
              const isSelected = activeFunctional === mode.id;
              return (
                <button
                  key={mode.id}
                  onClick={() => {
                    const isIntimate = mode.id === 'intimate';
                    updateAvatar({
                      functionalMode: mode.id,
                      personalityMode: isIntimate ? 'nympho' : (mode.id === 'gamer' ? 'gamer' : mode.id === 'developer' ? 'hacker' : mode.id === 'therapist' ? 'zen' : mode.id === 'latenight' ? 'latenight' : 'companion'),
                      isBoldMode: isIntimate,
                      ...(isIntimate ? { personalityTraits: ['nymphomaniac', 'provocative', 'dominant'] } : {})
                    });
                  }}
                  className={`p-4 rounded-2xl border text-left transition-all relative overflow-hidden flex flex-col justify-between gap-3 cursor-pointer ${isSelected
                      ? `bg-gradient-to-br ${mode.color} border-white/40 shadow-[0_0_25px_rgba(255,255,255,0.15)] scale-[1.02]`
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-slate-300'
                    }`}
                >
                  <div className="flex items-start justify-between">
                    <span className="text-2xl">{mode.icon}</span>
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-black/40 border border-white/10">
                      {mode.badge}
                    </span>
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-white leading-tight mb-1">{mode.label}</h3>
                    <p className="text-[11px] text-slate-400 leading-snug">{mode.desc}</p>
                  </div>
                  {isSelected && (
                    <div className="absolute top-2 right-2 w-2 h-2 rounded-full bg-emerald-400 shadow-[0_0_8px_#34d399]" />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* 2. SECCIÓN: MATRIZ DE RASGOS PSICOLÓGICOS Y EMOCIONALES (CATEGORIZADOS) */}
        <div className="space-y-5 rounded-2xl border border-white/10 bg-surface-dark p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-4">
            <div>
              <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-purple-400 flex items-center gap-2">
                <span>🎭</span> 2. Rasgos Psicológicos & Emocionales al Unísono
              </h2>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Escoge hasta 3 rasgos para que se fusionen en cada diálogo (ej: <i>Alegre + Sarcástica + Coqueta</i> o <i>Melancólica + Filosófica + Empática</i>).
              </p>
            </div>
            <span className="text-xs font-black px-3 py-1 rounded-full bg-purple-950/60 border border-purple-500/30 text-purple-300 self-start sm:self-auto shadow-sm">
              {activeTraits.length}/3 Rasgos Activos
            </span>
          </div>

          {/* Filtro por Categorías */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setActiveCategoryTab('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${activeCategoryTab === 'all'
                  ? 'bg-purple-600 text-white shadow-md'
                  : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                }`}
            >
              Todos ({CATEGORIZED_TRAITS.reduce((acc, c) => acc + c.traits.length, 0)})
            </button>
            {CATEGORIZED_TRAITS.map((cat, idx) => (
              <button
                key={cat.title}
                onClick={() => setActiveCategoryTab(idx)}
                className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 cursor-pointer ${activeCategoryTab === idx
                    ? 'bg-purple-600 text-white shadow-md'
                    : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white'
                  }`}
              >
                <span>{cat.icon}</span>
                <span>{cat.title}</span>
              </button>
            ))}
          </div>

          {/* Renderizado de Categorías */}
          <div className="space-y-6 pt-2">
            {CATEGORIZED_TRAITS.map((cat, idx) => {
              if (activeCategoryTab !== 'all' && activeCategoryTab !== idx) return null;

              return (
                <div key={cat.title} className="space-y-3">
                  <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-400">
                    <span>{cat.icon}</span>
                    <span>{cat.title}</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                    {cat.traits.map(trait => {
                      const isSelected = activeTraits.includes(trait.id);
                      return (
                        <button
                          key={trait.id}
                          onClick={() => toggleTrait(trait.id)}
                          className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2.5 cursor-pointer ${isSelected
                              ? 'border-purple-400 bg-purple-600/30 text-white shadow-[0_0_20px_rgba(168,85,247,0.35)] ring-1 ring-purple-400/60 scale-[1.02]'
                              : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:border-white/20'
                            }`}
                        >
                          <div className="flex items-start justify-between">
                            <span className="text-2xl">{trait.icon}</span>
                            <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded ${isSelected ? 'bg-purple-400/40 text-purple-100' : 'bg-white/10 text-slate-400'
                              }`}>
                              {trait.tag}
                            </span>
                          </div>
                          <div>
                            <span className="text-xs font-black block leading-tight text-white mb-0.5">{trait.label}</span>
                            <p className="text-[10px] text-slate-400 leading-snug">{trait.desc}</p>
                          </div>
                          {isSelected && (
                            <div className="w-full h-1 rounded-full bg-gradient-to-r from-purple-400 to-pink-400" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3. SECCIÓN: NACIONALIDAD & JERGA REGIONAL */}
        <div className="space-y-4 rounded-2xl border border-white/10 bg-surface-dark p-5 sm:p-6">
          <div>
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <span>🌎</span> 3. Nacionalidad y Jerga Cultural
            </h2>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Elige los modismos o escribe cualquier nacionalidad/acento con el que Nova se expresará naturalmente.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {REGIONAL_SLANGS.map(slang => {
              const isSelected = activeSlang === slang.id;
              return (
                <button
                  key={slang.id}
                  onClick={() => updateAvatar({ regionalSlang: slang.id })}
                  className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between gap-2 cursor-pointer ${isSelected
                      ? 'border-emerald-400 bg-emerald-600/20 text-white shadow-[0_0_20px_rgba(16,185,129,0.25)] ring-1 ring-emerald-400/50'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                >
                  <div className="flex items-center gap-2">
                    <span className="text-2xl">{slang.flag}</span>
                    <span className="text-xs font-black">{slang.label}</span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-mono italic leading-tight">
                    {slang.examples}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Opción de Nacionalidad / Acento Dinámico Personalizado */}
          <div className="mt-2 p-3.5 rounded-xl border border-emerald-500/20 bg-emerald-950/20 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-300 flex items-center gap-1.5">
                <span>✏️</span> Escribir Cualquier Nacionalidad o Acento Personalizado:
              </span>
              <span className="text-[9px] text-emerald-400/70 uppercase font-black">100% Dinámico</span>
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Ej: Brasileña carioca, Japonesa kawaii, Peruana limeña, Cubana..."
                value={REGIONAL_SLANGS.some(s => s.id === activeSlang) ? '' : (activeSlang || '')}
                onChange={(e) => updateAvatar({ regionalSlang: e.target.value as any })}
                className="flex-1 bg-black/50 border border-emerald-500/30 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-400"
              />
              {(!REGIONAL_SLANGS.some(s => s.id === activeSlang) && activeSlang) && (
                <button
                  onClick={() => updateAvatar({ regionalSlang: 'neutral' })}
                  className="px-3 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-200 border border-emerald-500/30 rounded-xl text-xs font-bold transition-all"
                >
                  Restablecer
                </button>
              )}
            </div>
            {!REGIONAL_SLANGS.some(s => s.id === activeSlang) && activeSlang && (
              <p className="text-[10px] text-emerald-400 font-mono">
                ✨ Nova adaptará el acento y jerga de: <strong className="text-white">"{activeSlang}"</strong>
              </p>
            )}
          </div>
        </div>

        {/* 4. SECCIÓN: COLOR DE AURA Y TEMA SAAS */}
        <div className="space-y-4 rounded-2xl border border-white/10 bg-surface-dark p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <span>🎨</span> 4. Aura de Interfaz y Tema Visual
            </h2>
            <span className="text-[10px] text-slate-500 font-bold uppercase">Color de luz y acento</span>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {THEME_COLORS.map(c => {
              const isSelected = activeTheme === c.id;
              return (
                <button
                  key={c.id}
                  onClick={() => updateAvatar({ themeColor: c.id })}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all cursor-pointer ${isSelected
                      ? 'border-white bg-white/20 shadow-lg scale-105 ring-2 ring-white/40'
                      : 'border-white/10 bg-white/5 hover:bg-white/10 text-slate-300'
                    }`}
                >
                  <div className={`w-3.5 h-3.5 rounded-full ${c.class} shadow-[0_0_8px_currentColor]`} />
                  <span className="text-xs font-bold text-white">{c.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 5. SECCIÓN: VOZ, AGUDEZA & INSTRUCCIONES ADICIONALES */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Modelo de Voz Base */}
          <div className="rounded-2xl border border-white/10 bg-surface-dark p-5 space-y-4">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">record_voice_over</span> Voz Base Gemini
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {voices.map(v => (
                <button
                  key={v.id}
                  onClick={() => updateAvatar({ voiceName: v.id })}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${avatar.voiceName === v.id
                      ? 'border-purple-400 bg-purple-600/30 text-white shadow-md'
                      : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                    }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs font-bold">{v.label}</span>
                    <span className={`text-[8px] px-1.5 py-0.5 rounded font-black uppercase ${v.gender === 'Femenina' ? 'bg-pink-500/20 text-pink-300' : 'bg-blue-500/20 text-blue-300'
                      }`}>
                      {v.gender}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-snug">{v.desc}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Pitch & Modulación */}
          <div className="rounded-2xl border border-white/10 bg-surface-dark p-5 space-y-4">
            <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
              <span className="material-symbols-outlined text-sm">graphic_eq</span> Agudeza (Pitch)
            </h2>
            <div className="space-y-3 pt-2">
              <div className="flex items-center gap-4 bg-black/40 p-4 rounded-xl border border-white/10">
                <span className="text-xl" title="Grave">👹</span>
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={avatar.voicePitch || 1.0}
                  onChange={(e) => updateAvatar({ voicePitch: parseFloat(e.target.value) })}
                  className="flex-1 accent-purple-400 h-1.5 bg-slate-700 rounded-full appearance-none cursor-pointer"
                />
                <span className="text-xl" title="Aguda">🐿️</span>
              </div>
              <div className="flex justify-between w-full text-[10px] text-slate-400 px-1">
                <span>Grave (0.5x)</span>
                <span className="text-purple-300 font-bold font-mono">{(avatar.voicePitch || 1.0).toFixed(1)}x</span>
                <span>Agudo (2.0x)</span>
              </div>
            </div>
          </div>
        </div>

        {/* 6. CEREBRO DE IA */}
        <div className="rounded-2xl border border-white/10 bg-surface-dark p-5 space-y-4">
          <h2 className="text-xs sm:text-sm font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">psychology</span> Motor de IA Conversacional
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { id: 'gemini-live', label: 'Gemini Live', icon: '⚡', desc: 'Voz bidireccional nativa, latencia 150ms.', badge: 'RECOMENDADO' },
              { id: 'grok', label: 'Grok 4.1 Fast', icon: '🧠', desc: 'xAI. Sin censura, razonamiento profundo.', badge: 'EXPLÍCITO' },
              { id: 'gpt4o', label: 'GPT-4o', icon: '🤖', desc: 'OpenAI. Calidad y equilibrio multimodal.', badge: 'ESTÁNDAR' },
              { id: 'claude', label: 'Claude Sonnet', icon: '💭', desc: 'Anthropic. Análisis y profundidad.', badge: 'CREATIVO' }
            ].map(model => (
              <button
                key={model.id}
                onClick={() => setSelectedBrain(model.id as any)}
                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${selectedBrain === model.id
                    ? 'border-purple-400 bg-purple-600/30 text-white shadow-lg ring-1 ring-purple-400'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
                  }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xl">{model.icon}</span>
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 rounded bg-black/40 border border-white/10 text-slate-300">
                    {model.badge}
                  </span>
                </div>
                <h3 className="text-xs font-black text-white">{model.label}</h3>
                <p className="text-[10px] text-slate-400 leading-snug mt-1">{model.desc}</p>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

export default VoiceSettings;
