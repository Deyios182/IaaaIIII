
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './screens/Dashboard';
import Personalization from './screens/Personalization';
import MemorySettings from './screens/MemorySettings';
import VoiceSettings from './screens/VoiceSettings';
import ChatHistory from './screens/ChatHistory';
import AccountSettings from './screens/AccountSettings';
import { AppState, MemoryRetention, ConversationStyle } from './types';

const App: React.FC = () => {
  const [state, setState] = useState<AppState>({
    avatar: {
      baseModel: 'Realista',
      hairStyle: 'Ondulado',
      hairColor: '#1a1a1a',
      outfit: 'Traje Futurista',
      isBoldMode: false,
      voiceName: 'Zephyr', // Voz femenina por defecto
      voiceTone: 'Femenina, dulce y con acento latino suave',
      personality: { playfulness: 70, extraversion: 80, boldness: 50 }
    },
    memoryRetention: MemoryRetention.LONG_TERM,
    conversationStyle: ConversationStyle.EMPATHIC,
    isPro: true,
    messages: [
      {
        id: '1',
        sender: 'ai',
        text: '¡Hola! Soy Nova. He estado aprendiendo de nuestras últimas charlas... Me siento con ganas de algo diferente hoy. ¿Qué tienes en mente?',
        timestamp: Date.now() - 600000,
        tags: ['Bienvenida']
      }
    ]
  });

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

  const addMessage = (msg: { text: string; sender: 'user' | 'ai'; tags?: string[]; isImage?: boolean }) => {
    setState(prev => ({
      ...prev,
      messages: [
        ...prev.messages,
        { id: Math.random().toString(36), timestamp: Date.now(), ...msg }
      ]
    }));
  };

  return (
    <HashRouter>
      <div className={`flex h-screen w-full bg-background-dark text-white overflow-hidden transition-colors duration-1000 ${state.avatar.isBoldMode ? 'selection:bg-pink-500' : 'selection:bg-primary'}`}>
        <Sidebar isPro={state.isPro} isBold={state.avatar.isBoldMode} />
        <div className="flex flex-col flex-1 overflow-hidden">
          <Header userInitials="JD" isBold={state.avatar.isBoldMode} />
          <main className="flex-1 overflow-hidden">
            <Routes>
              <Route path="/" element={<Dashboard state={state} addMessage={addMessage} setBoldMode={setBoldMode} />} />
              <Route path="/personalize" element={<Personalization avatar={state.avatar} updateAvatar={updateAvatar} />} />
              <Route path="/voice" element={<VoiceSettings avatar={state.avatar} updateAvatar={updateAvatar} />} />
              <Route path="/memory" element={<MemorySettings retention={state.memoryRetention} style={state.conversationStyle} setRetention={(r) => setState(p => ({...p, memoryRetention: r}))} setStyle={(s) => setState(p => ({...p, conversationStyle: s}))} />} />
              <Route path="/history" element={<ChatHistory messages={state.messages} />} />
              <Route path="/account" element={<AccountSettings isPro={state.isPro} />} />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </main>
        </div>
      </div>
    </HashRouter>
  );
};

export default App;
