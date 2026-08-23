
export enum MemoryRetention {
  SESSION = 'Session',
  SHORT_TERM = '30 Days',
  LONG_TERM = 'Permanent'
}

export enum ConversationStyle {
  EMPATHIC = 'Empático',
  ANALYTICAL = 'Analítico',
  CREATIVE = 'Creativo',
  UNFILTERED = 'Sin Filtros'
}

export interface ChatMessage {
  id: string;
  sender: 'user' | 'ai';
  text: string;
  timestamp: number;
  isImage?: boolean;
  tags?: string[];
}

export interface MemoryEntry {
  id: string;
  category: string;
  content: string;
  timestamp: number;
}

export interface PersonEntry {
  id: string;
  name: string;
  relationship: string;
  visualDescription: string;
  voiceDescription: string;
  photoData?: string; // Base64 JPEG del frame capturado
  audioSample?: string; // Base64 audio clip de su voz
  isUnknown?: boolean; // Si es una persona aún sin identificar
  detectedAt?: number; // Timestamp de detección
  lastSeen?: number;
  // 🆕 Biometric Recognition
  faceDescriptor?: number[]; // 128D embedding facial para reconocimiento
  lastRecognitionConfidence?: number; // 0-1 score de última detección
  // 🆕 Voice Biometrics
  voiceSignature?: {
    avgPitch: number;      // Frecuencia fundamental media (Hz)
    pitchVariance: number; // Varianza de tono (Expresividad)
    spectralCentroid?: number; // Timbre (Brillo)
  };
}

export type NovaFunctionalMode =
  | 'assistant'    // 🌸 Asistente & Compañera General (Búsqueda, recordatorios, control OS)
  | 'companion'    // Alias
  | 'productivity' // 💼 Productividad & Dev (Código, terminal, Supabase, multitarea)
  | 'developer'    // Alias
  | 'gaming'       // 🎮 Gaming & Copiloto Táctico (MiniHUD Zero-Lag, visión de pantalla, Albion)
  | 'gamer'        // Alias
  | 'sexting'      // 🔥 Sexting & Romance Íntimo (Modo ninfómana blindado, pasión, dirty talk)
  | 'intimate'     // Alias
  | 'nympho'       // Alias
  | 'music'        // 🎵 Modo Musical & DJ (Analizador FFT de beats, tempo, canciones)
  | 'therapy'      // 🧘‍♀️ Terapia & Confidente Zen (Salud mental, escucha activa profunda)
  | 'therapist'    // Alias
  | 'latenight';   // 🌙 Nocturna & Lo-Fi (Calma y susurros)

export type NovaPersonalityTrait =
  // 🌟 Ánimo & Energía
  | 'cheerful'       // ☀️ Alegre / Radiante & Optimista
  | 'melancholic'    // 🌧️ Melancólica / Nostálgica & Introspectiva
  | 'hyperactive'    // ⚡ Eufórica / Hiperactiva & Hype total
  | 'chill'          // ☕ Relajada / Serena & Despreocupada

  // 🧠 Actitud & Intelecto
  | 'sarcastic'      // 🤖 Sarcástica / Ácida (Estilo Grok)
  | 'tsundere'       // 👑 Mandona / Disciplinaria & Orgullosa
  | 'analytical'     // 🧠 Analítica / Meticulosa & Racional
  | 'playful_tease'  // 🃏 Burlona / Pícara & Bromista

  // 💖 Afecto & Vínculo
  | 'waifu'          // ✨ Waifu Anime / Devota & Kawaii
  | 'sweet'          // 🍯 Dulce / Empática & Afectuosa
  | 'provocative'    // 🔥 Provocativa / Seductora & Coqueta
  | 'protective'     // 🛡️ Protectora / Leal & Guardiana

  // ⛓️ Temperamento & Dinámica
  | 'dominant'       // ⛓️ Dominante / Autoritária & Con voz de mando
  | 'shy'            // 🌸 Tímida / Vergonzosa & Tierna
  | 'chaotic'        // 🌀 Rebelde / Caótica & Desinhibida
  | 'philosophical'  // 🧘‍♀️ Filosófica / Profunda & Existencial

  // 🔥 Crudos, Explícitos & Sin Filtro (+18)
  | 'nymphomaniac'   // 🔥 Ninfómana / Insaciable & Dirty Talk explícito
  | 'vulgar'         // 🤬 Grosera / Malhablada & Callejera sin filtro
  | 'yandere_toxic'  // 😈 Tóxica / Yandere & Posesiva obsesiva
  | 'sadistic'       // ⛓️ Sádica / Burlona Cruel & Humillación juguetona
  | 'nihilistic'     // 🚬 Cínica / Nihilista & Cero corrección política
  | 'unhinged';      // 🍺 Descontrolada / Sin frenos & Descarada

export type NovaRegionalSlang =
  | 'neutral'     // 🌐 Neutro / Latino Internacional
  | 'chilean'     // 🇨🇱 Chilena (weón, cachai, bacán, po, al tiro, filete)
  | 'colombian'   // 🇨🇴 Colombiana / Paisa (parce, mor, pues, papacito, chimba)
  | 'argentine'   // 🇦🇷 Argentina (che, boludo, re, quilombo, posta, viste)
  | 'mexican'     // 🇲🇽 Mexicana (wey, no manches, chido, cabrón, neta, padrísimo)
  | 'spanish'     // 🇪🇸 Española (tío, mola, chaval, hostia, flipar, guay)
  | 'peruvian'    // 🇵🇪 Peruana (causa, pe, chévere, asu mare, pucha, pata, qué palta)
  | 'brazilian'   // 🇧🇷 Brasileña / Portuñol (cara, legal, beleza, gostoso, você, né, meu amor)
  | 'japanese'    // 🇯🇵 Japonesa / Kawaii (senpai, daisuki, arigato, baka, sugoi, kawaii, uwu)
  | 'venezuelan'  // 🇻🇪 Venezolana (chamo, pana, chévere, arrecho, burda, qué ladilla, fino)
  | (string & {}); // 🌎 Jerga / Nacionalidad personalizada abierta

export type NovaPersonalityMode =
  | 'companion'
  | 'nympho'
  | 'grok'
  | 'gamer'
  | 'chilean'
  | 'hacker'
  | 'tsundere'
  | 'zen'
  | 'waifu'
  | 'latenight';

export interface AvatarSettings {
  name: string;
  baseModel: string;
  modelUrl?: string; // URL personalizada del modelo (opcional)
  hairStyle: string;
  hairColor: string;
  outfit: string;
  isBoldMode: boolean;
  functionalMode?: NovaFunctionalMode; // 🛠️ Rol/Función operativa principal
  personalityTraits?: NovaPersonalityTrait[]; // 🎭 Hasta 3 rasgos psicológicos simultáneos al unísono
  regionalSlang?: NovaRegionalSlang; // 🌎 Nacionalidad / Jerga regional
  themeColor?: string; // 🎨 Color de acento de interfaz y aura
  personalityMode?: NovaPersonalityMode; // Retrocompatibilidad
  voiceName: string; // Zephyr, Puck, Charon, Kore, Fenrir
  voiceTone: string; // Descripción del tono
  voiceAccent: string; // Acento
  voicePitch: number; // 0.5 a 2.0 (1.0 = normal)
  personality: {
    playfulness: number;
    extraversion: number;
    boldness: number;
  };
}

export interface AppState {
  userName: string; // Nombre del usuario principal
  knownPeople: PersonEntry[]; // Lista de personas conocidas
  avatar: AvatarSettings;
  memoryRetention: MemoryRetention;
  conversationStyle: ConversationStyle;
  isPro: boolean;
  allowWebSearch: boolean; // Nuevo: Configuración global de búsqueda
  messages: ChatMessage[];
  lastSessionTime: number; // Timestamp de la última sesión
  sessionStartTime: number; // Cuando empezó esta sesión
  userProfile: {
    likes: string[];
    dislikes: string[];
    interests: string[];
    facts: string[];
    habits: string[];
  };
  userFaceDescriptor?: number[]; // 🆕 Descriptor facial del usuario principal
  selectedBrain: 'gemini-live' | 'grok' | 'gpt4o' | 'claude'; // 🆕 Modelo de IA para conversaciones
}
