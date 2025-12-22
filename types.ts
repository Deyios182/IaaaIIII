
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

export interface AvatarSettings {
  baseModel: string;
  hairStyle: string;
  hairColor: string;
  outfit: string;
  isBoldMode: boolean;
  voiceName: string; // Zephyr, Puck, Charon, Kore, Fenrir
  voiceTone: string; // Descripción del tono/acento
  personality: {
    playfulness: number;
    extraversion: number;
    boldness: number;
  };
}

export interface AppState {
  avatar: AvatarSettings;
  memoryRetention: MemoryRetention;
  conversationStyle: ConversationStyle;
  isPro: boolean;
  messages: ChatMessage[];
}
