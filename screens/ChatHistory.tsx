
import React from 'react';
import { ChatMessage } from '../types';

interface ChatHistoryProps {
  messages: ChatMessage[];
}

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages }) => {
  return (
    <div className="flex h-full overflow-hidden">
      <aside className="w-80 lg:w-96 flex flex-col border-r border-surface-border bg-[#111118]">
        <div className="p-4 border-b border-surface-border">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-3 text-slate-500">search</span>
            <input className="w-full h-11 bg-surface-dark border-none rounded-xl pl-10 pr-4 text-sm focus:ring-2 focus:ring-primary text-white placeholder-slate-500" placeholder="Buscar conversaciones..." />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto custom-scrollbar p-2">
          <div className="flex gap-3 p-3 rounded-xl bg-primary/10 border border-primary/30 cursor-pointer relative overflow-hidden mb-2">
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-primary"></div>
            <div className="w-12 h-12 rounded-full bg-slate-800 shrink-0 border border-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-primary">smart_toy</span>
            </div>
            <div className="flex flex-col flex-1 min-w-0 justify-center">
              <div className="flex justify-between items-baseline">
                <h3 className="text-sm font-bold truncate">Nova</h3>
                <span className="text-[10px] text-primary">Ahora</span>
              </div>
              <p className="text-xs text-slate-400 truncate mt-1">Chat activo...</p>
            </div>
          </div>
          <div className="p-3 rounded-xl hover:bg-white/5 cursor-pointer flex gap-3 transition-all grayscale opacity-60">
             <div className="w-12 h-12 rounded-full bg-slate-800 shrink-0 border border-white/10 flex items-center justify-center">
              <span className="material-symbols-outlined text-slate-600">person</span>
            </div>
            <div className="flex-1 min-w-0">
               <div className="flex justify-between items-baseline">
                <h3 className="text-sm font-medium">Asistente Anterior</h3>
                <span className="text-[10px] text-slate-600">Ayer</span>
              </div>
              <p className="text-xs text-slate-500 truncate">Sesión finalizada el 24 de Oct.</p>
            </div>
          </div>
        </div>
      </aside>

      <main className="flex-1 flex flex-col bg-[#0c0c16] relative overflow-hidden">
        <div className="flex-1 overflow-y-auto p-8 space-y-6 flex flex-col custom-scrollbar">
          <div className="flex justify-center mb-8">
            <span className="px-3 py-1 bg-surface-dark-lighter rounded-full text-[10px] font-bold text-slate-400 uppercase tracking-widest">Historial Reciente</span>
          </div>
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-4 ${m.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
               <div className={`flex flex-col gap-1 max-w-[70%] ${m.sender === 'user' ? 'items-end' : 'items-start'}`}>
                 <div className={`p-4 rounded-2xl text-sm ${m.sender === 'user' ? 'bg-primary text-white rounded-tr-none' : 'bg-surface-dark-lighter text-slate-200 rounded-tl-none border border-white/5'}`}>
                   {m.text}
                 </div>
                 <span className="text-[10px] text-slate-600 mt-1">{new Date(m.timestamp).toLocaleString()}</span>
               </div>
            </div>
          ))}
        </div>
        <div className="p-6 border-t border-surface-border bg-[#111118]/80 backdrop-blur-md">
          <div className="flex justify-center">
             <button className="flex items-center gap-2 bg-surface-dark hover:bg-surface-dark-lighter text-white px-6 py-3 rounded-xl transition-all font-bold text-sm border border-white/5">
                <span className="material-symbols-outlined">history_edu</span> Retomar esta conversación
             </button>
          </div>
        </div>
      </main>
    </div>
  );
};

export default ChatHistory;
