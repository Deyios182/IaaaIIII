/**
 * Avatar Studio - Centro unificado de personalización del avatar
 * Fusiona: selección de modelo, ropa, animaciones, gestos, y configuración
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import AvatarViewer3D from '../components/AvatarViewer3D';
import { animationStore, StoredAnimation } from '../utils/animationStore';
import { AvatarSettings } from '../types';
import { BoneMappingResult } from '../utils/mixamoRetargeter';

// --- Error Boundary local para evitar crasheos del motor 3D ---
class ErrorBoundary extends React.Component<{children: React.ReactNode, fallback: React.ReactNode}, {hasError: boolean}> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("3D Render Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface AvatarStudioProps {
  avatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
  allowWebSearch?: boolean;
  setAllowWebSearch?: (val: boolean) => void;
}

const GESTURES = [
  { id: 'happy', icon: '😊', name: 'Feliz', dur: 2500 },
  { id: 'sad', icon: '😢', name: 'Triste', dur: 3000 },
  { id: 'angry', icon: '😤', name: 'Enojada', dur: 2000 },
  { id: 'surprised', icon: '😲', name: 'Sorprendida', dur: 1500 },
  { id: 'confused', icon: '🤔', name: 'Confundida', dur: 2000 },
  { id: 'shy', icon: '🥺', name: 'Tímida', dur: 2500 },
  { id: 'wave', icon: '👋', name: 'Saludar', dur: 2500 },
  { id: 'nod', icon: '✅', name: 'Asentir', dur: 1500 },
  { id: 'shake_head', icon: '❌', name: 'Negar', dur: 1800 },
  { id: 'shrug', icon: '🤷', name: 'Encogerse', dur: 2000 },
  { id: 'point', icon: '👉', name: 'Señalar', dur: 2000 },
  { id: 'clap', icon: '👏', name: 'Aplaudir', dur: 2000 },
  { id: 'dance', icon: '💃', name: 'Bailar', dur: 4000 },
  { id: 'bow', icon: '🙇', name: 'Reverencia', dur: 2500 },
  { id: 'stretch', icon: '🧘', name: 'Estirar', dur: 3000 },
  { id: 'laugh', icon: '😂', name: 'Reír', dur: 2500 },
  { id: 'thinking', icon: '💭', name: 'Pensar', dur: 3000 },
  { id: 'flirt', icon: '😏', name: 'Coqueta', dur: 3000 },
];

const MODEL_PRESETS = [
  { name: 'Grokani', url: '/models/grokani_lipsync.glb', color: '#ec4899', emoji: '💖' },
  { name: 'Nova Anime', url: '/models/nova-avatar.glb', color: '#2563eb', emoji: '🌸' },
];

const HAIR_COLORS = [
  { color: '#e2b464', name: 'Rubio' },
  { color: '#8B4513', name: 'Castaño' },
  { color: '#ffffff', name: 'Platino' },
  { color: '#ec4899', name: 'Rosa' },
  { color: '#a855f7', name: 'Violeta' },
  { color: '#1313ec', name: 'Azul' },
  { color: '#ef4444', name: 'Rojo' },
  { color: '#1a1a1a', name: 'Negro' },
];

type Tab = 'model' | 'gestures' | 'animations' | 'clothing' | 'calibration';

const AvatarStudio: React.FC<AvatarStudioProps> = ({ avatar, updateAvatar, allowWebSearch, setAllowWebSearch }) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [storedAnims, setStoredAnims] = useState<StoredAnimation[]>(animationStore.getAll());
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('model');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const actionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [boneMapping, setBoneMapping] = useState<BoneMappingResult[]>([]);
  const [boneMappingRaw, setBoneMappingRaw] = useState<Record<string, string>>({});
  const [modelBones, setModelBones] = useState<string[]>([]);
  const [availableModels, setAvailableModels] = useState<{name: string, url: string, emoji?: string}[]>([]);

  // Cargar modelos disponibles desde el sistema de archivos (Electron)
  useEffect(() => {
    const fetchModels = async () => {
      if ((window as any).isElectron && (window as any).electronAPI?.getAvailableModels) {
        try {
          const models = await (window as any).electronAPI.getAvailableModels();
          if (models && models.length > 0) {
            // Asignar emojis divertidos aleatorios a los modelos nuevos si no tienen
            const emojis = ['🤖', '🦊', '👤', '🎭', '✨', '🌟', '💎', '🎨'];
            const mappedModels = models.map((m: any, i: number) => ({
              ...m,
              emoji: m.name.toLowerCase().includes('nova') ? '🌸' : 
                     m.name.toLowerCase().includes('grok') ? '💖' : 
                     emojis[i % emojis.length]
            }));
            setAvailableModels(mappedModels);
          } else {
            setAvailableModels(MODEL_PRESETS);
          }
        } catch (e) {
          console.error("Error fetching models:", e);
          setAvailableModels(MODEL_PRESETS);
        }
      } else {
        setAvailableModels(MODEL_PRESETS);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => animationStore.subscribe(() => setStoredAnims(animationStore.getAll())), []);

  // Actualizar bone mapping desde el retargeter
  useEffect(() => {
    const interval = setInterval(() => {
      const results = (window as any).__lastBoneMapping;
      const map = (window as any).__lastBoneMappingMap;
      if (results && results.length > 0) {
        setBoneMapping(results);
        if (map) setBoneMappingRaw(map);
      }
      const bones = (window as any).__modelBoneNames;
      if (bones && bones.length > 0) setModelBones(bones);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const triggerAction = useCallback((actionId: string, duration = 2500) => {
    if (actionTimeoutRef.current) clearTimeout(actionTimeoutRef.current);
    
    // Si es una animación externa, primero nos aseguramos de cargarla en el visor
    const externalAnim = animationStore.get(actionId);
    if (externalAnim) {
      window.dispatchEvent(new CustomEvent('nova-load-animation', { 
        detail: { 
          name: actionId, 
          animations: [externalAnim] 
        } 
      }));
    }

    setActiveAction(actionId);
    window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: actionId } }));
    
    actionTimeoutRef.current = setTimeout(() => {
      setActiveAction(null);
      window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: null } }));
    }, duration);
  }, []);

  const handleAnimationUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    for (const file of Array.from(files)) {
      const ext = file.name.split('.').pop()?.toLowerCase() as 'glb' | 'fbx';
      if (ext !== 'glb' && ext !== 'fbx') { setUploadStatus(`❌ Usa .glb o .fbx`); continue; }
      setUploadStatus(`⏳ Cargando ${file.name}...`);
      try {
        const url = URL.createObjectURL(file);
        const animName = file.name.replace(/\.(glb|fbx)$/i, '');
        animationStore.add({ name: animName, url, type: ext, source: 'mixamo' });
        window.dispatchEvent(new CustomEvent('nova-load-animation', { detail: { url, name: animName, type: ext } }));
        setUploadStatus(`✅ "${animName}" cargado`);
        setTimeout(() => setUploadStatus(''), 3000);
      } catch { setUploadStatus(`❌ Error cargando`); }
    }
  }, []);

  const handleModelUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext !== 'glb' && ext !== 'vrm') { setUploadStatus(`❌ Usa .glb o .vrm`); return; }
    updateAvatar({ modelUrl: URL.createObjectURL(file) });
    setUploadStatus(`✅ Modelo "${file.name}" aplicado`);
    setTimeout(() => setUploadStatus(''), 3000);
  }, [updateAvatar]);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (activeTab === 'model') handleModelUpload(e.dataTransfer.files);
    else handleAnimationUpload(e.dataTransfer.files);
  }, [activeTab, handleAnimationUpload, handleModelUpload]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'model', label: 'Modelo', icon: 'face' },
    { id: 'clothing', label: 'Ropa', icon: 'checkroom' },
    { id: 'gestures', label: 'Gestos', icon: 'waving_hand' },
    { id: 'animations', label: 'Anims', icon: 'animation' },
    { id: 'calibration', label: 'Calibrar', icon: 'tune' },
  ];

  return (
    <div className="flex h-full">
      {/* LEFT PANEL - Controles */}
      <div className="w-[360px] shrink-0 bg-[#0e0e18] border-r border-white/5 flex flex-col overflow-hidden">
        <div className="px-5 pt-5 pb-3">
          <h1 className="text-lg font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-violet-400">theater_comedy</span>
            Avatar Studio
          </h1>
        </div>

        <div className="flex px-3 gap-0.5 border-b border-white/5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex-1 flex items-center justify-center gap-1 px-2 py-2.5 text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-all ${
                activeTab === tab.id ? 'border-violet-400 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}>
              <span className="material-symbols-outlined text-xs">{tab.icon}</span>
              {tab.label}
              {tab.id === 'animations' && storedAnims.length > 0 && (
                <span className="bg-violet-500/30 text-violet-300 text-[8px] px-1 rounded-full ml-0.5">{storedAnims.length}</span>
              )}
            </button>
          ))}
        </div>

        {uploadStatus && (
          <div className={`mx-3 mt-3 px-3 py-2 rounded-lg text-[10px] font-medium ${
            uploadStatus.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' :
            uploadStatus.startsWith('❌') ? 'bg-red-500/10 text-red-400' :
            'bg-blue-500/10 text-blue-400'
          }`}>{uploadStatus}</div>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">

          {/* ═══ TAB: MODELO ═══ */}
          {activeTab === 'model' && (<>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Modelos Detectados ({availableModels.length})</label>
              <div className="grid grid-cols-2 gap-2">
                {availableModels.map(p => (
                  <button key={p.url} onClick={() => updateAvatar({ modelUrl: p.url })}
                    className={`p-3 rounded-xl border-2 transition-all text-center group ${
                      avatar.modelUrl === p.url
                        ? 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                    }`}>
                    <span className="text-2xl block mb-1 group-hover:scale-110 transition-transform">{p.emoji || '📦'}</span>
                    <span className={`text-[9px] font-bold block truncate ${avatar.modelUrl === p.url ? 'text-violet-400' : 'text-slate-400'}`}>
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => modelInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${
                isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 hover:border-violet-500/30'
              }`}>
              <span className="material-symbols-outlined text-2xl text-slate-600 mb-1 block">deployed_code</span>
              <p className="text-[10px] text-slate-400">Arrastra modelo .glb / .vrm</p>
              <input ref={modelInputRef} type="file" accept=".glb,.vrm" className="hidden"
                onChange={(e) => handleModelUpload(e.target.files)} />
            </div>

            <div className="relative">
              <input type="text" placeholder="URL de modelo (.glb)..."
                className="w-full bg-[#15151e] border border-white/5 text-white text-[10px] rounded-lg pl-3 pr-14 py-2 outline-none focus:border-violet-500/50 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value;
                    if (val.includes('.glb') || val.includes('.vrm')) updateAvatar({ modelUrl: val });
                  }
                }} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] text-slate-600 font-bold">ENTER</span>
            </div>

            <div className="h-px bg-white/5"></div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Color de Cabello</label>
              <div className="flex gap-2 flex-wrap">
                {HAIR_COLORS.map(hc => (
                  <button key={hc.color} onClick={() => updateAvatar({ hairColor: hc.color })}
                    title={hc.name}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${
                      avatar.hairColor === hc.color ? 'border-white ring-2 ring-violet-500 shadow-lg' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: hc.color }} />
                ))}
              </div>
            </div>

            {setAllowWebSearch && (
              <>
                <div className="h-px bg-white/5"></div>
                <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-lg border border-white/5">
                  <div>
                    <span className="text-xs font-bold block">Búsqueda Web</span>
                    <span className="text-[9px] text-slate-500">Nova busca en Google</span>
                  </div>
                  <button onClick={() => setAllowWebSearch(!allowWebSearch)}
                    className={`w-10 h-5 rounded-full p-0.5 transition-all ${allowWebSearch ? 'bg-violet-600' : 'bg-slate-700'}`}>
                    <div className={`h-4 w-4 bg-white rounded-full transition-all ${allowWebSearch ? 'translate-x-5' : 'translate-x-0'}`}></div>
                  </button>
                </div>
              </>
            )}
          </>)}

          {/* ═══ TAB: ROPA ═══ */}
          {activeTab === 'clothing' && (<>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Presets de Ropa</label>
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => (window as any).novaClothingManager?.presetFullClothed()}
                className="p-3 bg-white/[0.03] hover:bg-white/[0.06] border border-white/10 rounded-xl text-center transition-all">
                <span className="text-xl block mb-1">👗</span>
                <span className="text-[10px] font-bold">Vestida</span>
              </button>
              <button onClick={() => (window as any).novaClothingManager?.presetUnderwear()}
                className="p-3 bg-pink-500/5 hover:bg-pink-500/10 border border-pink-500/20 rounded-xl text-center transition-all">
                <span className="text-xl block mb-1">🩱</span>
                <span className="text-[10px] font-bold text-pink-300">Lencería</span>
              </button>
              <button onClick={() => (window as any).novaClothingManager?.presetAccessoriesOnly()}
                className="p-3 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-xl text-center transition-all">
                <span className="text-xl block mb-1">✨</span>
                <span className="text-[10px] font-bold text-red-300">Mínimo</span>
              </button>
            </div>
          </>)}

          {/* ═══ TAB: GESTOS ═══ */}
          {activeTab === 'gestures' && (<>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Gestos Procedurales</label>
            <div className="grid grid-cols-3 gap-2">
              {GESTURES.map(g => (
                <button key={g.id} onClick={() => triggerAction(g.id, g.dur)}
                  disabled={activeAction !== null}
                  className={`p-2 rounded-lg border transition-all text-center ${
                    activeAction === g.id
                      ? 'bg-violet-500/20 border-violet-500/50'
                      : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-violet-500/30'
                  } ${activeAction && activeAction !== g.id ? 'opacity-25 cursor-not-allowed' : ''}`}>
                  <span className="text-lg block">{g.icon}</span>
                  <span className="text-[9px] font-medium block mt-0.5">{g.name}</span>
                  {activeAction === g.id && (
                    <div className="h-0.5 bg-violet-500/30 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-violet-400 rounded-full animate-pulse" style={{ width: '60%' }}></div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </>)}

          {/* ═══ TAB: ANIMACIONES ═══ */}
          {activeTab === 'animations' && (<>
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 hover:border-violet-500/30'
              }`}>
              <span className="material-symbols-outlined text-3xl text-slate-600 mb-1 block">upload_file</span>
              <p className="text-[10px] font-medium text-slate-300">Arrastra .glb de Mixamo</p>
              <p className="text-[9px] text-slate-600 mt-1">Se retargetea automáticamente</p>
              <input ref={fileInputRef} type="file" accept=".glb,.fbx" multiple className="hidden"
                onChange={(e) => handleAnimationUpload(e.target.files)} />
            </div>

            {storedAnims.length > 0 && (
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">
                  Cargadas ({storedAnims.length})
                </label>
                <div className="space-y-1.5">
                  {storedAnims.map(anim => (
                    <div key={anim.name}
                      className="flex items-center justify-between p-2.5 rounded-lg bg-white/[0.02] border border-white/5 group hover:border-violet-500/20 transition-all">
                      <button onClick={() => triggerAction(anim.name, 4000)} className="flex items-center gap-2 flex-1 text-left">
                        <span className="material-symbols-outlined text-xs text-emerald-400">play_circle</span>
                        <div>
                          <span className="text-[10px] font-medium block">{anim.name}</span>
                          <span className="text-[8px] text-slate-500">{anim.source} • .{anim.type}</span>
                        </div>
                      </button>
                      <button onClick={() => animationStore.remove(anim.name)}
                        className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all">
                        <span className="material-symbols-outlined text-xs">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-gradient-to-br from-orange-500/5 to-violet-500/5 border border-white/5 rounded-lg p-3">
              <h3 className="font-semibold text-[10px] flex items-center gap-1 mb-2">💡 Mixamo</h3>
              <ol className="text-[9px] text-slate-400 space-y-1">
                <li><span className="text-violet-400 font-bold">1.</span> Ve a <a href="https://www.mixamo.com" target="_blank" className="text-violet-400 underline">mixamo.com</a></li>
                <li><span className="text-violet-400 font-bold">2.</span> Busca "Hip Hop Dance", "Salsa", etc.</li>
                <li><span className="text-violet-400 font-bold">3.</span> Download → <strong className="text-white">FBX Binary</strong> → "Without Skin"</li>
                <li><span className="text-violet-400 font-bold">4.</span> Arrastra el .fbx aquí ¡directo, sin convertir!</li>
              </ol>
            </div>
          </>)}

          {/* ═══ TAB: CALIBRACIÓN ═══ */}
          {activeTab === 'calibration' && (<>
            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">Mapeo de Huesos</label>

            {boneMapping.length === 0 ? (
              <div className="text-center py-8">
                <span className="material-symbols-outlined text-3xl text-slate-600 block mb-2">skeleton</span>
                <p className="text-[10px] text-slate-400">Carga una animación .fbx para ver el mapeo de huesos</p>
                <p className="text-[9px] text-slate-600 mt-1">El sistema auto-detecta los huesos del modelo</p>
              </div>
            ) : (<>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                  <span className="text-sm font-bold text-emerald-400 block">
                    {boneMapping.filter(b => b.targetBone && b.priority >= 5).length}
                  </span>
                  <span className="text-[8px] text-emerald-400/70">Conectados</span>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                  <span className="text-sm font-bold text-red-400 block">
                    {boneMapping.filter(b => !b.targetBone && b.priority >= 5).length}
                  </span>
                  <span className="text-[8px] text-red-400/70">Sin Match</span>
                </div>
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2 text-center">
                  <span className="text-sm font-bold text-violet-400 block">
                    {Math.round(boneMapping.filter(b => b.priority >= 5).reduce((acc, b) => acc + b.confidence, 0) / Math.max(boneMapping.filter(b => b.priority >= 5).length, 1) * 100)}%
                  </span>
                  <span className="text-[8px] text-violet-400/70">Confianza</span>
                </div>
              </div>

              {/* Bone list - principales */}
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1.5">Huesos Principales</label>
                <div className="space-y-1">
                  {boneMapping.filter(b => b.priority >= 7).map(b => (
                    <div key={b.mixamoBone} className={`flex items-center gap-2 p-1.5 rounded text-[9px] ${
                      b.targetBone ? 'bg-emerald-500/5' : 'bg-red-500/5'
                    }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                        b.confidence > 0.7 ? 'bg-emerald-400' : b.confidence > 0.3 ? 'bg-yellow-400' : 'bg-red-400'
                      }`}></span>
                      <span className="text-slate-400 w-[120px] shrink-0 truncate" title={b.mixamoBone}>
                        {b.mixamoBone.replace('mixamorig', '')}
                      </span>
                      <span className="text-slate-600">→</span>
                      <span className={`truncate font-mono ${b.targetBone ? 'text-white' : 'text-red-400'}`} title={b.targetBone || 'NO MATCH'}>
                        {b.targetBone || '✗ sin match'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Huesos secundarios (dedos, etc) */}
              <details className="group">
                <summary className="text-[9px] font-bold text-slate-500 uppercase cursor-pointer hover:text-slate-300 transition-colors">
                  Huesos Secundarios ({boneMapping.filter(b => b.priority < 7).length})
                  <span className="text-slate-600 ml-1">▼</span>
                </summary>
                <div className="space-y-0.5 mt-1.5">
                  {boneMapping.filter(b => b.priority < 7).map(b => (
                    <div key={b.mixamoBone} className="flex items-center gap-1.5 px-1 text-[8px]">
                      <span className={`w-1 h-1 rounded-full shrink-0 ${
                        b.targetBone ? 'bg-emerald-400/50' : 'bg-slate-600'
                      }`}></span>
                      <span className="text-slate-500 truncate">{b.mixamoBone.replace('mixamorig', '')}</span>
                      <span className="text-slate-700">→</span>
                      <span className="text-slate-400 truncate font-mono">{b.targetBone || '—'}</span>
                    </div>
                  ))}
                </div>
              </details>

              <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-[9px] text-slate-400">
                <p className="flex items-center gap-1 font-medium text-blue-300 mb-1">
                  <span className="material-symbols-outlined text-xs">info</span> Sobre la calibración
                </p>
                <p>El sistema auto-detecta los huesos escaneando el modelo. Si un hueso principal muestra <span className="text-red-400">✗</span>, la animación no se aplicará bien en esa parte del cuerpo.</p>
              </div>
            </>)}

            {/* Todos los huesos del modelo */}
            {modelBones.length > 0 && (
              <details className="group" open={boneMapping.filter(b => b.targetBone).length === 0}>
                <summary className="text-[9px] font-bold text-orange-400/70 uppercase cursor-pointer hover:text-orange-300 transition-colors">
                  🦴 Huesos del Modelo ({modelBones.filter(b => !b.startsWith('MCH-') && !b.startsWith('VIS_')).length} relevantes / {modelBones.length} total)
                  <span className="text-slate-600 ml-1">▼</span>
                </summary>
                <div className="mt-1.5 p-2 bg-black/30 rounded-lg max-h-64 overflow-y-auto custom-scrollbar">
                  <div className="flex flex-wrap gap-1">
                    {modelBones
                      .filter(b => !b.startsWith('MCH-') && !b.startsWith('VIS_') && !b.startsWith('VIS-') && !b.includes('tweak') && !b.includes('_parent'))
                      .slice(0, 200)
                      .map(bone => (
                        <span key={bone} className={`px-1.5 py-0.5 rounded text-[7px] font-mono ${
                          bone.startsWith('DEF-') ? 'bg-emerald-500/10 text-emerald-400' :
                          bone.includes('J_Bip') ? 'bg-blue-500/10 text-blue-400' :
                          bone.startsWith('ORG-') ? 'bg-red-500/10 text-red-400/50' :
                          'bg-slate-500/10 text-slate-400'
                        }`}>{bone}</span>
                      ))}
                  </div>
                </div>
              </details>
            )}
          </>)}
        </div>
      </div>

      {/* RIGHT: Vista Previa en Vivo del Avatar */}
      <div className="flex-1 relative bg-[#080812]">
        <ErrorBoundary fallback={
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-50 p-6 text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h3 className="text-white font-bold mb-2">Error en el Visor 3D</h3>
            <p className="text-slate-400 text-xs mb-4">No se pudo cargar el modelo o hubo un fallo de renderizado.</p>
            <button 
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg transition-colors"
            >
              Reiniciar Aplicación
            </button>
          </div>
        }>
          <React.Suspense fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm z-50">
              <div className="w-8 h-8 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-2"></div>
              <p className="text-violet-400 text-[9px] font-medium animate-pulse uppercase">Cargando Motor 3D...</p>
            </div>
          }>
            <AvatarViewer3D 
              key={avatar.modelUrl}
              avatar={avatar} 
              activeAction={activeAction}
              emotion="neutral"
              isAiSpeaking={false}
            />
          </React.Suspense>
        </ErrorBoundary>
        
        {/* Indicador Live */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2 bg-black/50 backdrop-blur-sm px-2.5 py-1 rounded-full">
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
          </span>
          <span className="text-[9px] font-medium text-slate-400">Preview</span>
        </div>

        {/* Acción activa */}
        {activeAction && (
          <div className="absolute top-3 right-3 z-10 bg-violet-500/20 backdrop-blur-sm px-2.5 py-1 rounded-full border border-violet-500/30">
            <span className="text-[9px] font-medium text-violet-300">▶ {activeAction}</span>
          </div>
        )}

        {/* Avatar 3D - Preview dedicado */}
        <AvatarViewer3D
          modelUrl={avatar.modelUrl || '/models/nova-avatar.glb'}
          emotion="neutral"
          action={activeAction}
          audioElement={null}
          isAiSpeaking={false}
          isHotMode={avatar.isBoldMode}
          hairColor={avatar.hairColor}
        />
      </div>
    </div>
  );
};

export default AvatarStudio;
