
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
}

export interface AvatarSettings {
  baseModel: string;
  modelUrl?: string; // URL personalizada del modelo (opcional)
  hairStyle: string;
  hairColor: string;
  outfit: string;
  isBoldMode: boolean;
  voiceName: string; // Zephyr, Puck, Charon, Kore, Fenrir
  voiceTone: string; // Descripción del tono
  voiceAccent: string; // Nuevo: Acento
  voicePitch: number; // Nuevo: 0.5 a 2.0 (1.0 = normal)
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
}
