
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './screens/Dashboard';
import Personalization from './screens/Personalization';
import MemorySettings from './screens/MemorySettings';
import VoiceSettings from './screens/VoiceSettings';
import ChatHistory from './screens/ChatHistory';
import MemoriesTimeline from './screens/MemoriesTimeline';
import AccountSettings from './screens/AccountSettings';
import PerformanceSettings from './screens/PerformanceSettings';
import AvatarStudio from './screens/AvatarStudio';
import { AppState, MemoryRetention, ConversationStyle, PersonEntry } from './types';
import AvatarViewer3D from './components/AvatarViewer3D';
import { loadAllMemory } from './services/MemoryService';

const STORAGE_KEY = 'nova_app_state';

const getDefaultState = (): AppState => ({
  userName: 'Usuario',
  knownPeople: [], // Se llenará dinámicamente al cambiar el nombre
  avatar: {
    baseModel: 'Realista',
    modelUrl: '/models/grokani_lipsync.glb', // Default LOCAL seguro
    hairStyle: 'Ondulado',
    hairColor: '#e2b464',
    outfit: 'Traje Futurista',
    isBoldMode: false,
    voiceName: 'Zephyr',
    voiceTone: 'Femenina, dulce',
    voiceAccent: 'Latino neutro',
    voicePitch: 1.0,
    personality: { playfulness: 70, extraversion: 80, boldness: 50 }
  },
  memoryRetention: MemoryRetention.LONG_TERM,
  conversationStyle: ConversationStyle.EMPATHIC,
  isPro: true,
  allowWebSearch: false, // Default OFF
  messages: [],
  lastSessionTime: Date.now(),
  sessionStartTime: Date.now(),
  userProfile: {
    likes: [],
    dislikes: [],
    interests: [],
    facts: [],
    habits: []
  },
  selectedBrain: 'gemini-live' // Default: Gemini Live (nativo, rápido)
});

const loadState = (): AppState => {
  try {
    // CHECK CRÍTICO: Si hay un reset pendiente, ignorar todo y devolver default
    if (localStorage.getItem('nova_reset_pending')) {
      console.log('🧹 Ejecutando limpieza profunda de memoria...');
      localStorage.removeItem('nova_reset_pending');
      localStorage.removeItem(STORAGE_KEY);
      return getDefaultState();
    }

    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Sanitización de URLs rotas (Fix para URLs antiguas que dan 404)
      const brokenUrls = [
        '676ee526026e476839359e1c', // Cyber Nova rota 1
        '676ed830026e476839352e82', // Original rota
        '64b590e38055615783515494', // Business rota 1
        '63c0cd0c7f0e3600966f976a', // Business rota 2 (Official Demo Failed)
        '638df693d72bffc6fa17943c', // Cyberpunk possible fail
        '64b58e65805561578351544a', // Cyber Nova rota 2
        '6185a4acfb622cf1cdc49348', // Cyberpunk RPM - crash GPU
      ];

      // También resetear modelos locales que causan crash GPU
      const crashingModels = ['Android.glb', 'android.glb', 'nova_anime.glb'];

      const isBrokenUrl = brokenUrls.some(id => parsed.avatar?.modelUrl?.includes(id));
      const isCrashingModel = crashingModels.some(m => parsed.avatar?.modelUrl?.includes(m));

      if (isBrokenUrl || isCrashingModel) {
        console.warn('⚠️ Avatar URL problemática detectada, restaurando default.');
        parsed.avatar.modelUrl = '/models/nova-avatar.glb';
      }

      // Actualizar tiempos de sesión
      return {
        ...getDefaultState(),
        ...parsed,
        // Asegurar que el objeto avatar tenga la estructura correcta
        avatar: {
          ...getDefaultState().avatar,
          ...parsed.avatar,
          // Force override si sigue rota (doble check)
          modelUrl: (isBrokenUrl || isCrashingModel)
            ? '/models/nova-avatar.glb'
            : (parsed.avatar?.modelUrl || getDefaultState().avatar.modelUrl)
        },
        // Asegurar que el perfil de usuario existe y está actualizado
        knownPeople: (() => {
          const people = parsed.knownPeople || [];
          const userProfile = people.find((p: any) => p.id === 'user-identity');

          if (!userProfile) {
            // Crear perfil de usuario si no existe
            return [{
              id: 'user-identity',
              name: parsed.userName || 'Usuario',
              relationship: 'Usuario Principal (Tus Ojos)',
              visualDescription: 'El protagonista. Debes aprender sus rasgos.',
              voiceDescription: 'La voz que te habla ahora mismo.'
            }, ...people];
          } else {
            // Actualizar nombre del perfil de usuario si cambió
            return people.map((p: any) =>
              p.id === 'user-identity'
                ? { ...p, name: parsed.userName || p.name }
                : p
            );
          }
        })(),
        lastSessionTime: parsed.sessionStartTime || Date.now(),
        sessionStartTime: Date.now()
      };
    }
  } catch (e) {
    console.error('Error loading state:', e);
  }
  return getDefaultState();
};

const AppContent: React.FC<{
  state: AppState;
  setState: React.Dispatch<React.SetStateAction<AppState>>;
  updateAvatar: (settings: Partial<AppState['avatar']>) => void;
  setBoldMode: (val: boolean) => void;
  addMessage: (msg: any) => void;
  isMiniMode: boolean;
}> = ({ state, setState, updateAvatar, setBoldMode, addMessage, isMiniMode }) => {
  const location = useLocation();
  const isDashboardRoute = location.pathname === '/';
  const isAvatarStudioRoute = location.pathname === '/avatar-studio';

  return (
    <div className={`flex h-screen w-full bg-background-dark text-white overflow-hidden transition-colors duration-1000 ${state.avatar.isBoldMode ? 'selection:bg-pink-500' : 'selection:bg-primary'}`}>
      {/* Sidebar - oculto en mini mode */}
      {!isMiniMode && <Sidebar isPro={state.isPro} isBold={state.avatar.isBoldMode} />}
      <div className="flex flex-col flex-1 overflow-hidden">
        {/* Header - oculto en mini mode */}
        {!isMiniMode && <Header userInitials={state.userName.substring(0, 2).toUpperCase()} isBold={state.avatar.isBoldMode} />}
        <main className="flex-1 overflow-auto relative">

          {/* DASHBOARD PERSISTENTE: Oculto cuando estamos en Avatar Studio (tiene su propio visor 3D) */}
          <div className={`${isDashboardRoute ? 'block h-full' : 'hidden'}`}>
            <Dashboard
              state={state}
              addMessage={addMessage}
              setBoldMode={setBoldMode}
              updateKnownPeople={(people) => setState(p => ({ ...p, knownPeople: people }))}
              updateUserProfile={(profile) => setState(p => ({ ...p, userProfile: profile }))}
              isMiniMode={isMiniMode}
            />
          </div>

          <Routes>
            <Route path="/" element={<></>} /> {/* Dummy route para el path '/' */}
            <Route path="/personalize" element={<Navigate to="/avatar-studio" />} />
            <Route path="/voice" element={<VoiceSettings avatar={state.avatar} updateAvatar={updateAvatar} selectedBrain={state.selectedBrain} setSelectedBrain={(brain) => setState(p => ({ ...p, selectedBrain: brain }))} />} />
            <Route path="/memory" element={<MemorySettings
              retention={state.memoryRetention}
              style={state.conversationStyle}
              knownPeople={state.knownPeople}
              setRetention={(r) => setState(p => ({ ...p, memoryRetention: r }))}
              setStyle={(s) => setState(p => ({ ...p, conversationStyle: s }))}
              removePerson={(id) => setState(p => ({
                ...p,
                knownPeople: p.knownPeople.filter(person => person.id !== id)
              }))}
              updateKnownPeople={(people) => setState(p => ({ ...p, knownPeople: people }))}
            />} />
            <Route path="/history" element={<ChatHistory messages={state.messages} />} />
            <Route path="/memories" element={<MemoriesTimeline />} />
            <Route path="/account" element={<AccountSettings
              isPro={state.isPro}
              userName={state.userName}
              avatar={state.avatar}
              updateAvatar={updateAvatar}
              updateUserName={(name) => {
                setState(p => ({
                  ...p,
                  userName: name,
                  knownPeople: p.knownPeople.map(person =>
                    person.id === 'user-identity'
                      ? { ...person, name: name }
                      : person
                  )
                }));
              }}
            />} />
            <Route path="/performance" element={<PerformanceSettings onClose={() => window.history.back()} />} />
            <Route path="/avatar-studio" element={
              <AvatarStudio
                avatar={state.avatar}
                updateAvatar={updateAvatar}
                allowWebSearch={state.allowWebSearch}
                setAllowWebSearch={(val) => setState(p => ({ ...p, allowWebSearch: val }))}
              />
            } />
            <Route path="*" element={<Navigate to="/" />} />
          </Routes>
        </main>
      </div>
    </div>
  );
};

const App: React.FC = () => {
  const [state, setState] = useState<AppState>(loadState);
  const [isMiniMode, setIsMiniMode] = useState(false);

  // ... (useEffect hooks preserved implicitly by outer scope if not moved)
  // WAIT, hooks must be inside the component.
  // I need to refactor App to separate logic or use useLocation inside HashRouter.
  // `useLocation` only works inside HashRouter.
  // So I must split App into AppWrapper (Router) and MainApp (Content).

  // Escuchar cambios de modo mini desde Electron
  useEffect(() => {
    const electronAPI = (window as any).electronAPI;
    if (electronAPI?.onMiniModeChange) {
      electronAPI.onMiniModeChange((isMini: boolean) => {
        setIsMiniMode(isMini);
        console.log('🐾 Mini Mode:', isMini);
      });
    }
  }, []);

  // Guardar en localStorage cada vez que cambie el estado
  useEffect(() => {
    if (localStorage.getItem('nova_reset_pending')) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Error saving state:', e);
    }
  }, [state]);

  // Guardar antes de cerrar la página
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (localStorage.getItem('nova_reset_pending')) return;
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...state,
        sessionStartTime: Date.now()
      }));
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [state]);

  const updateAvatar = (newSettings: Partial<AppState['avatar']>) => {
    setState(prev => ({ ...prev, avatar: { ...prev.avatar, ...newSettings } }));
  };

  const setBoldMode = (val: boolean) => {
    setState(prev => ({
      ...prev,
      avatar: { ...prev.avatar, isBoldMode: val },
      conversationStyle: val ? ConversationStyle.UNFILTERED : ConversationStyle.EMPATHIC
    }));
  };

  // Cargar memoria desde Supabase al inicio
  useEffect(() => {
    const loadCloudMemory = async () => {
      try {
        const memory = await loadAllMemory();
        console.log('☁️ Sincronizando memoria desde Supabase...');

        const people: PersonEntry[] = (memory.knownPeople || []).map(p => ({
          id: p.id || crypto.randomUUID(),
          name: p.name,
          relationship: p.relationship || 'Conocido',
          visualDescription: p.visual_description || '',
          voiceDescription: p.voice_description || '',
          faceDescriptor: p.face_descriptor ? Array.from(p.face_descriptor) : undefined,
          photoData: p.photo_data,
          isUnknown: p.is_unknown || false,
          detectedAt: p.first_seen ? new Date(p.first_seen).getTime() : Date.now(),
          lastSeen: p.last_seen ? new Date(p.last_seen).getTime() : Date.now()
        }));

        setState(prev => {
          const resolvedName = memory.username || prev.userName;
          // Buscar si el usuario ya tiene descriptor registrado
          const userPerson = people.find(p => p.name.toLowerCase().trim() === resolvedName.toLowerCase().trim());
          const existingUserDescriptor = userPerson?.faceDescriptor || prev.userFaceDescriptor;

          if (userPerson && userPerson.faceDescriptor) {
            console.log('👤 Descriptor facial del usuario recuperado de la nube.');
          }

          return {
            ...prev,
            userName: resolvedName,
            knownPeople: people,
            userFaceDescriptor: existingUserDescriptor,
            // También cargar preferencias
            userProfile: {
              ...prev.userProfile,
              likes: memory.likes || [],
              dislikes: memory.dislikes || [],
              interests: memory.interests || [],
              facts: memory.facts?.map(f => f.content) || []
            }
          };
        });
      } catch (e) {
        console.error('Error loading cloud memory:', e);
      }
    };
    loadCloudMemory();
  }, []);

  const addMessage = (msg: { text: string; sender: 'user' | 'ai'; tags?: string[]; isImage?: boolean }) => {
    setState(prev => {
      // OPTIMIZATION: Cap history at 100 messages to prevent OOM (Out Of Memory) crashes
      // during long sessions.
      const newHistory = [...prev.messages, { id: Math.random().toString(36), timestamp: Date.now(), ...msg }];
      if (newHistory.length > 100) {
        return { ...prev, messages: newHistory.slice(-100) };
      }
      return { ...prev, messages: newHistory };
    });
  };

  return (
    <HashRouter>
      <AppContent
        state={state}
        setState={setState}
        updateAvatar={updateAvatar}
        setBoldMode={setBoldMode}
        addMessage={addMessage}
        isMiniMode={isMiniMode}
      />
    </HashRouter>
  );
};

export default App;
