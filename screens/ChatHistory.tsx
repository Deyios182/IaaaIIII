import React, { useState, useEffect, useMemo } from 'react';
import { ChatMessage, PersonEntry } from '../types';
import { getRecentMemories, deleteMemory } from '../services/MemoryService';

interface ChatHistoryProps {
  messages: ChatMessage[];
  userName?: string;
  knownPeople?: PersonEntry[];
}

interface UnifiedChatTurn {
  id: string;
  date: Date;
  dateKey: string; // 'YYYY-MM-DD'
  userMessage: string;
  aiResponse: string;
  emotion?: string;
  source: 'live' | 'cloud';
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const ChatHistory: React.FC<ChatHistoryProps> = ({ messages, userName = 'Usuario', knownPeople = [] }) => {
  const [cloudTurns, setCloudTurns] = useState<UnifiedChatTurn[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDateKey, setSelectedDateKey] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  // Buscar foto del usuario en knownPeople
  const userPhoto = useMemo(() => {
    const userPerson = knownPeople.find(
      p => p.id === 'user-identity' || p.name.toLowerCase().trim() === userName.toLowerCase().trim()
    );
    return userPerson?.photoData;
  }, [knownPeople, userName]);

  // Cargar historial de conversaciones desde Supabase
  const loadCloudHistory = async () => {
    setLoading(true);
    try {
      const data = await getRecentMemories(300);
      const turns: UnifiedChatTurn[] = [];

      (data || []).forEach((m: any) => {
        // Filtrar telemetría
        if (m.user_message?.includes('[BIOMETRIA_VOCAL]') || m.ai_response?.includes('[ESTADO_EMOCIONAL]')) {
          return;
        }

        const d = new Date(m.timestamp || m.created_at || Date.now());
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

        turns.push({
          id: `mem_${m.id}`,
          date: d,
          dateKey,
          userMessage: m.user_message || '',
          aiResponse: m.ai_response || '',
          emotion: m.emotion || 'neutral',
          source: 'cloud'
        });
      });

      setCloudTurns(turns);
    } catch (e) {
      console.error('Error cargando historial de chat:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadCloudHistory();
  }, []);

  // Unificar mensajes en vivo actuales con los turnos de la nube
  const allTurns = useMemo(() => {
    const map = new Map<string, UnifiedChatTurn>();

    // 1. Agregar turnos de la nube
    cloudTurns.forEach(t => map.set(t.id, t));

    // 2. Emparejar mensajes de la sesión en vivo actual si existen
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      if (msg.sender === 'user') {
        const nextMsg = messages[i + 1];
        const aiText = nextMsg && nextMsg.sender === 'ai' ? nextMsg.text : '';
        const d = new Date(msg.timestamp);
        const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        
        const turnId = `live_${msg.id}`;
        // Evitar duplicar si ya existe un turno idéntico
        const isDuplicate = cloudTurns.some(ct => ct.userMessage === msg.text && Math.abs(ct.date.getTime() - d.getTime()) < 60000);
        if (!isDuplicate) {
          map.set(turnId, {
            id: turnId,
            date: d,
            dateKey,
            userMessage: msg.text,
            aiResponse: aiText,
            source: 'live'
          });
        }
      }
    }

    const list = Array.from(map.values());
    list.sort((a, b) => b.date.getTime() - a.date.getTime());
    return list;
  }, [cloudTurns, messages]);

  // Agrupar por fechas disponibles para el selector lateral
  const sessionsByDate = useMemo(() => {
    const groups: Record<string, { date: Date; dateKey: string; count: number; lastMessage: string }> = {};
    
    allTurns.forEach(turn => {
      if (!groups[turn.dateKey]) {
        groups[turn.dateKey] = {
          date: turn.date,
          dateKey: turn.dateKey,
          count: 0,
          lastMessage: turn.userMessage
        };
      }
      groups[turn.dateKey].count++;
    });

    return Object.values(groups).sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [allTurns]);

  // Si no hay fecha seleccionada, seleccionar la primera por defecto
  useEffect(() => {
    if (!selectedDateKey && sessionsByDate.length > 0) {
      setSelectedDateKey(sessionsByDate[0].dateKey);
    }
  }, [sessionsByDate, selectedDateKey]);

  // Filtrado de turnos
  const filteredTurns = useMemo(() => {
    return allTurns.filter(turn => {
      if (selectedDateKey && turn.dateKey !== selectedDateKey) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchUser = turn.userMessage.toLowerCase().includes(q);
        const matchAi = turn.aiResponse.toLowerCase().includes(q);
        if (!matchUser && !matchAi) return false;
      }

      return true;
    });
  }, [allTurns, selectedDateKey, searchQuery]);

  const handleCopyTurn = (turn: UnifiedChatTurn) => {
    const text = `[${turn.date.toLocaleTimeString()}] ${userName}: ${turn.userMessage}\nNova: ${turn.aiResponse}`;
    navigator.clipboard.writeText(text);
    setCopiedId(turn.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDeleteTurn = async (turn: UnifiedChatTurn) => {
    try {
      if (turn.source === 'cloud') {
        await deleteMemory(turn.id);
      }
      setCloudTurns(prev => prev.filter(t => t.id !== turn.id));
      setStatusMsg('🗑️ Conversación eliminada.');
      setTimeout(() => setStatusMsg(null), 3000);
    } catch (e) {
      console.error('Error eliminando turno:', e);
    }
  };

  const handleExportChat = () => {
    const lines = filteredTurns.map(
      t => `[${t.date.toLocaleString()}]\n${userName}: ${t.userMessage}\nNova: ${t.aiResponse}\n`
    );
    const blob = new Blob([lines.join('\n---\n\n')], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat_nova_${selectedDateKey || 'completo'}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-[#0a0c12] text-white">
      
      {/* ─── SIDEBAR: SESIONES Y FILTRADO POR FECHA ─── */}
      <aside className="w-full md:w-80 lg:w-96 shrink-0 flex flex-col border-b md:border-b-0 md:border-r border-white/10 bg-[#0e1017]">
        
        {/* Cabecera del Sidebar */}
        <div className="p-4 border-b border-white/10 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black uppercase tracking-widest text-purple-400 flex items-center gap-2">
              <span>📅</span> Historial por Fechas
            </h2>
            <button
              onClick={loadCloudHistory}
              className="p-1 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-all cursor-pointer"
              title="Recargar conversaciones"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
            </button>
          </div>

          {/* Buscador de Texto */}
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">search</span>
            <input
              type="text"
              placeholder="Buscar en el chat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full h-9 bg-surface-dark border border-white/10 rounded-xl pl-9 pr-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 transition-all"
            />
          </div>
        </div>

        {/* Lista de Fechas / Sesiones */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-3 space-y-2">
          {/* Botón Ver Todo */}
          <button
            onClick={() => setSelectedDateKey(null)}
            className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
              selectedDateKey === null
                ? 'bg-purple-600/30 border-purple-500/50 shadow-lg shadow-purple-600/20'
                : 'bg-surface-dark border-white/5 hover:bg-white/5 text-slate-400'
            }`}
          >
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/30 flex items-center justify-center text-purple-300">
                <span className="material-symbols-outlined text-lg">all_inclusive</span>
              </div>
              <div>
                <h3 className="text-xs font-black text-white leading-tight">Todas las Conversaciones</h3>
                <span className="text-[10px] text-slate-400 font-mono">{allTurns.length} turnos guardados</span>
              </div>
            </div>
          </button>

          {loading ? (
            <div className="py-8 text-center text-slate-500 text-xs flex flex-col items-center gap-2">
              <div className="size-6 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
              <span>Cargando sesiones...</span>
            </div>
          ) : sessionsByDate.length === 0 ? (
            <div className="text-center py-8 text-slate-500 text-xs">
              No hay sesiones guardadas todavía.
            </div>
          ) : (
            sessionsByDate.map(session => {
              const isSelected = selectedDateKey === session.dateKey;
              const dateObj = session.date;
              const isToday = new Date().toDateString() === dateObj.toDateString();
              const dateLabel = isToday
                ? 'Hoy'
                : `${dateObj.getDate()} de ${MONTH_NAMES[dateObj.getMonth()]}`;

              return (
                <button
                  key={session.dateKey}
                  onClick={() => setSelectedDateKey(session.dateKey)}
                  className={`w-full text-left p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between relative overflow-hidden group ${
                    isSelected
                      ? 'bg-purple-600/20 border-purple-500/60 shadow-lg shadow-purple-600/20 ring-1 ring-purple-500/40'
                      : 'bg-surface-dark border-white/5 hover:bg-white/5 text-slate-400'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute left-0 top-0 bottom-0 w-1 bg-purple-500" />
                  )}

                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                      isSelected
                        ? 'bg-purple-600 border-purple-400 text-white shadow-md'
                        : 'bg-white/5 border-white/10 text-slate-400 group-hover:text-white'
                    }`}>
                      <span className="material-symbols-outlined text-lg">chat_bubble</span>
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <h3 className="text-xs font-black text-white truncate">{dateLabel}</h3>
                        <span className="text-[9px] text-purple-300 font-mono shrink-0">{session.count} chats</span>
                      </div>
                      <p className="text-[10px] text-slate-400 truncate mt-0.5 italic">
                        "{session.lastMessage}"
                      </p>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* ─── MAIN: CHAT VIEW & BURBUJAS DE CONVERSACIÓN ─── */}
      <main className="flex-1 flex flex-col bg-[#07090e] relative overflow-hidden">
        
        {/* Cabecera del Chat */}
        <header className="p-4 border-b border-white/10 bg-[#0e1017]/80 backdrop-blur-md flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-purple-600 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-600/30">
              <span className="material-symbols-outlined text-white text-lg">smart_toy</span>
            </div>
            <div>
              <h2 className="text-sm font-black text-white flex items-center gap-2">
                <span>Conversación con Nova</span>
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              </h2>
              <span className="text-[10px] text-slate-400 font-mono">
                {selectedDateKey ? `Fecha: ${selectedDateKey}` : 'Historial Global'} • {filteredTurns.length} turnos
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleExportChat}
              disabled={filteredTurns.length === 0}
              className="px-3 py-1.5 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40"
              title="Exportar esta conversación a texto plano"
            >
              <span className="material-symbols-outlined text-sm">download</span>
              Exportar
            </button>
          </div>
        </header>

        {statusMsg && (
          <div className="p-2.5 bg-emerald-950/80 border border-emerald-500/40 text-emerald-200 text-xs text-center animate-in fade-in">
            {statusMsg}
          </div>
        )}

        {/* Lista de Mensajes */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6 flex flex-col custom-scrollbar">
          {loading ? (
            <div className="flex-1 flex flex-col items-center justify-center opacity-60">
              <div className="size-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-3"></div>
              <p className="text-xs font-black uppercase tracking-widest text-purple-300">Cargando diálogo...</p>
            </div>
          ) : filteredTurns.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 space-y-3 opacity-60">
              <span className="material-symbols-outlined text-6xl text-slate-700">forum</span>
              <p className="text-slate-400 font-bold text-sm">No hay mensajes registrados en esta fecha.</p>
              <p className="text-slate-500 text-xs max-w-sm">
                Habla con Nova o selecciona otra fecha en el panel lateral para revivir tus conversaciones pasadas.
              </p>
            </div>
          ) : (
            filteredTurns.map(turn => (
              <div key={turn.id} className="space-y-3 group/turn">
                
                {/* 👤 MENSAJE DEL USUARIO */}
                <div className="flex justify-end gap-3 items-start">
                  <div className="flex flex-col items-end gap-1 max-w-[85%] sm:max-w-[75%]">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-bold text-slate-400">{userName}</span>
                      <span className="text-[9px] text-slate-500 font-mono">{turn.date.toLocaleTimeString()}</span>
                    </div>

                    <div className="p-4 rounded-2xl rounded-tr-none bg-purple-600 text-white text-xs sm:text-sm font-medium shadow-lg shadow-purple-600/20 leading-relaxed">
                      {turn.userMessage}
                    </div>
                  </div>

                  {/* Foto del Usuario si existe, o Avatar */}
                  {userPhoto ? (
                    <img
                      src={userPhoto.startsWith('data:') ? userPhoto : `data:image/jpeg;base64,${userPhoto}`}
                      alt={userName}
                      className="w-8 h-8 rounded-full object-cover border-2 border-purple-400 shadow-md shrink-0 mt-4"
                    />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-purple-900 border border-purple-500 flex items-center justify-center text-xs font-bold text-purple-200 shrink-0 mt-4 shadow-md">
                      {userName.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>

                {/* 🤖 RESPUESTA DE NOVA */}
                {turn.aiResponse && (
                  <div className="flex justify-start gap-3 items-start">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-pink-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold shrink-0 mt-4 shadow-[0_0_10px_rgba(236,72,153,0.4)]">
                      <span className="material-symbols-outlined text-sm">smart_toy</span>
                    </div>

                    <div className="flex flex-col items-start gap-1 max-w-[85%] sm:max-w-[75%]">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-pink-400 flex items-center gap-1">
                          <span>Nova</span>
                          {turn.emotion && (
                            <span className="text-[8px] uppercase px-1.5 py-0.2 rounded bg-pink-500/20 text-pink-300 font-mono">
                              {turn.emotion}
                            </span>
                          )}
                        </span>
                        <span className="text-[9px] text-slate-500 font-mono">{turn.date.toLocaleTimeString()}</span>
                      </div>

                      <div className="p-4 rounded-2xl rounded-tl-none bg-surface-dark border border-white/10 text-slate-200 text-xs sm:text-sm font-normal shadow-xl leading-relaxed relative group">
                        {turn.aiResponse}

                        {/* Botones de acción en hover */}
                        <div className="absolute right-2 -bottom-3 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity bg-[#0e1017] border border-white/10 rounded-lg p-0.5 shadow-md">
                          <button
                            onClick={() => handleCopyTurn(turn)}
                            className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                            title="Copiar diálogo"
                          >
                            <span className="material-symbols-outlined text-xs">
                              {copiedId === turn.id ? 'check' : 'content_copy'}
                            </span>
                          </button>
                          <button
                            onClick={() => handleDeleteTurn(turn)}
                            className="p-1 rounded text-red-400 hover:text-red-300 transition-colors"
                            title="Borrar este turno"
                          >
                            <span className="material-symbols-outlined text-xs">delete</span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

              </div>
            ))
          )}
        </div>

      </main>
    </div>
  );
};

export default ChatHistory;
