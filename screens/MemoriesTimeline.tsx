import React, { useState, useEffect, useMemo } from 'react';
import {
  loadAllMemory,
  deleteMemory,
  deleteFact,
  deleteReminder,
  purgeBiometricJunk,
  deduplicateFacts,
  purgeUnknownPeople
} from '../services/MemoryService';

interface TimelineItem {
  id: string;
  type: 'memory' | 'fact' | 'reminder' | 'person';
  date: Date;
  title: string;
  description: string;
  extra?: string;
  category?: string;
  completed?: boolean;
  photoData?: string;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

const WEEKDAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

const MemoriesTimeline: React.FC = () => {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'memory' | 'fact' | 'reminder' | 'person'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [actionStatus, setActionStatus] = useState<{ msg: string; type: 'info' | 'success' | 'error' } | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [isMaintenanceOpen, setIsMaintenanceOpen] = useState(false);

  // Estado del Calendario Visual
  const [calendarDate, setCalendarDate] = useState<Date>(new Date());
  const [selectedDateFilter, setSelectedDateFilter] = useState<string | null>(null); // 'YYYY-MM-DD' o null

  const fetchData = async () => {
    setLoading(true);
    try {
      const data = await loadAllMemory();
      const timeline: TimelineItem[] = [];

      // 1. Conversaciones (Memories)
      (data.recentMemories || []).forEach((m: any) => {
        if (m.user_message?.includes('[BIOMETRIA_VOCAL]') || m.ai_response?.includes('[ESTADO_EMOCIONAL]')) {
          return; // Filtrar telemetría
        }
        timeline.push({
          id: `mem_${m.id}`,
          type: 'memory',
          date: new Date(m.timestamp || m.created_at || Date.now()),
          title: 'Conversación / Chat',
          description: m.user_message || 'Mensaje',
          extra: m.ai_response || '',
          category: m.emotion || 'chat'
        });
      });

      // 2. Datos Aprendidos (Facts)
      (data.facts || []).forEach((f: any) => {
        timeline.push({
          id: `fact_${f.id}`,
          type: 'fact',
          date: new Date(f.learned_at || Date.now()),
          title: `Dato Aprendido (${f.category || 'general'})`,
          description: f.content,
          category: f.category || 'fact'
        });
      });

      // 3. Recordatorios
      (data.pendingReminders || []).forEach((r: any) => {
        timeline.push({
          id: `rem_${r.id}`,
          type: 'reminder',
          date: new Date(r.trigger_time || r.created_at || Date.now()),
          title: 'Recordatorio Programado',
          description: r.message,
          completed: r.completed,
          extra: r.completed ? 'Estado: Completado' : 'Estado: Pendiente',
          category: 'recordatorio'
        });
      });

      // 4. Personas Conocidas
      (data.knownPeople || []).forEach((p: any) => {
        timeline.push({
          id: `person_${p.id}`,
          type: 'person',
          date: new Date(p.lastSeen || p.createdAt || Date.now()),
          title: `Persona: ${p.name}`,
          description: `Relación: ${p.relationship || 'Amigo'}. ${p.visualDescription || ''}`,
          category: 'contacto',
          photoData: p.photo_data || p.photoData
        });
      });

      // Ordenar por fecha descendente
      timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
      setItems(timeline);
    } catch (error) {
      console.error('Error loading memory timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDeleteItem = async (item: TimelineItem) => {
    setDeletingId(item.id);
    try {
      let success = false;
      if (item.type === 'memory') {
        success = await deleteMemory(item.id);
      } else if (item.type === 'fact') {
        success = await deleteFact(item.id);
      } else if (item.type === 'reminder') {
        success = await deleteReminder(item.id);
      } else {
        success = true;
      }

      if (success) {
        setItems(prev => prev.filter(i => i.id !== item.id));
        setActionStatus({ msg: `🗑️ Registro eliminado correctamente.`, type: 'success' });
      }
    } catch (err) {
      console.error('Error eliminando recuerdo:', err);
      setActionStatus({ msg: '❌ Error al eliminar.', type: 'error' });
    } finally {
      setDeletingId(null);
      setTimeout(() => setActionStatus(null), 3000);
    }
  };

  // 🧹 1. Fusionar y Deduplicar Datos Repetidos (Conserva el original más antiguo)
  const handleDeduplicateFacts = async () => {
    setActionStatus({ msg: '🔍 Analizando y deduplicando hechos en la base de datos...', type: 'info' });
    try {
      const res = await deduplicateFacts();
      setActionStatus({
        msg: `✅ Se fusionaron y eliminaron ${res.merged} hechos duplicados (se conservó el registro original más antiguo).`,
        type: 'success'
      });
      await fetchData();
    } catch (e) {
      setActionStatus({ msg: '❌ Error en la deduplicación de hechos.', type: 'error' });
    }
    setTimeout(() => setActionStatus(null), 5000);
  };

  // 🧹 2. Purgar Basura Biometría
  const handlePurgeBiometrics = async () => {
    setActionStatus({ msg: '🧹 Purgando registros biométricos de Supabase...', type: 'info' });
    try {
      const count = await purgeBiometricJunk();
      setActionStatus({ msg: `✅ Se eliminaron ${count} registros biométricos de telemetría.`, type: 'success' });
      await fetchData();
    } catch (err) {
      setActionStatus({ msg: '❌ Error al purgar registros.', type: 'error' });
    }
    setTimeout(() => setActionStatus(null), 4000);
  };

  // 🧹 3. Purgar Personas Desconocidas
  const handlePurgeUnknowns = async () => {
    setActionStatus({ msg: '👥 Purgando perfiles desconocidos no guardados...', type: 'info' });
    try {
      const count = await purgeUnknownPeople();
      setActionStatus({ msg: `✅ Se eliminaron ${count} perfiles desconocidos.`, type: 'success' });
      await fetchData();
    } catch (err) {
      setActionStatus({ msg: '❌ Error al purgar personas.', type: 'error' });
    }
    setTimeout(() => setActionStatus(null), 4000);
  };

  // Mapa de fechas con recuerdos para el calendario
  const dateCounts = useMemo(() => {
    const map: Record<string, { count: number; types: Set<string> }> = {};
    items.forEach(item => {
      const d = item.date;
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map[key]) {
        map[key] = { count: 0, types: new Set() };
      }
      map[key].count++;
      map[key].types.add(item.type);
    });
    return map;
  }, [items]);

  // Generación de días del mes para el Calendario
  const calendarDays = useMemo(() => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    const firstDayIndex = (new Date(year, month, 1).getDay() + 6) % 7; // Lunes = 0
    const totalDays = new Date(year, month + 1, 0).getDate();

    const days: Array<{
      dayNumber: number;
      dateKey: string;
      isCurrentMonth: boolean;
      data?: { count: number; types: Set<string> };
    }> = [];

    const prevMonthTotal = new Date(year, month, 0).getDate();
    for (let i = firstDayIndex - 1; i >= 0; i--) {
      const dayNum = prevMonthTotal - i;
      const prevMonth = month === 0 ? 12 : month;
      const prevYear = month === 0 ? year - 1 : year;
      const dateKey = `${prevYear}-${String(prevMonth).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
      days.push({ dayNumber: dayNum, dateKey, isCurrentMonth: false });
    }

    for (let i = 1; i <= totalDays; i++) {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({
        dayNumber: i,
        dateKey,
        isCurrentMonth: true,
        data: dateCounts[dateKey]
      });
    }

    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextMonth = month + 2 > 12 ? 1 : month + 2;
      const nextYear = month + 2 > 12 ? year + 1 : year;
      const dateKey = `${nextYear}-${String(nextMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`;
      days.push({ dayNumber: i, dateKey, isCurrentMonth: false });
    }

    return days;
  }, [calendarDate, dateCounts]);

  const prevMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
  };

  const nextMonth = () => {
    setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
  };

  // Filtrado de elementos
  const filteredItems = useMemo(() => {
    return items.filter(item => {
      if (filter !== 'all' && item.type !== filter) return false;

      if (selectedDateFilter) {
        const d = item.date;
        const itemDateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
        if (itemDateKey !== selectedDateFilter) return false;
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchTitle = item.title.toLowerCase().includes(q);
        const matchDesc = item.description.toLowerCase().includes(q);
        const matchExtra = item.extra ? item.extra.toLowerCase().includes(q) : false;
        if (!matchTitle && !matchDesc && !matchExtra) return false;
      }

      return true;
    });
  }, [items, filter, selectedDateFilter, searchQuery]);

  const groupedItems = useMemo(() => {
    const grouped: { [key: string]: TimelineItem[] } = {};
    filteredItems.forEach(item => {
      const dateStr = item.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      if (!grouped[dateStr]) grouped[dateStr] = [];
      grouped[dateStr].push(item);
    });
    return grouped;
  }, [filteredItems]);

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-[#0a0c12] text-white p-4 sm:p-8">
      <div className="max-w-6xl mx-auto space-y-6 sm:space-y-8">
        
        {/* Cabecera Principal */}
        <header className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4 pb-4 border-b border-white/10">
          <div>
            <h1 className="text-3xl sm:text-4xl font-black bg-gradient-to-r from-purple-400 via-pink-400 to-cyan-400 bg-clip-text text-transparent flex items-center gap-3">
              <span>🧠</span> Memoria, Chats & Línea del Tiempo
            </h1>
            <p className="text-slate-400 mt-1 text-xs sm:text-sm">
              Conversaciones reales, hechos aprendidos y recordatorios con filtrado visual por calendario.
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setIsMaintenanceOpen(!isMaintenanceOpen)}
              className={`px-3.5 py-2 rounded-xl border text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md ${
                isMaintenanceOpen ? 'bg-purple-600 border-purple-400 text-white' : 'bg-white/5 border-white/10 text-slate-300 hover:bg-white/10'
              }`}
            >
              <span className="material-symbols-outlined text-sm">tune</span>
              Herramientas de Limpieza
            </button>

            <button
              onClick={fetchData}
              className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-xs font-black uppercase tracking-wider transition-all flex items-center gap-2 cursor-pointer shadow-md"
            >
              <span className="material-symbols-outlined text-sm">refresh</span>
              Actualizar
            </button>
          </div>
        </header>

        {/* 🛠️ PANEL DE MANTENIMIENTO Y LIMPIEZA DE BASE DE DATOS */}
        {isMaintenanceOpen && (
          <div className="bg-surface-dark border border-purple-500/30 rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 animate-in fade-in slide-in-from-top-3 duration-300">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-purple-400 text-xl">auto_fix_high</span>
                <h3 className="text-sm font-black uppercase tracking-wider text-white">Centro de Mantenimiento de Base de Datos</h3>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Control Supabase</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Botón 1: Deduplicar Hechos */}
              <button
                onClick={handleDeduplicateFacts}
                className="p-4 rounded-2xl bg-purple-950/40 hover:bg-purple-900/50 border border-purple-500/30 text-left transition-all flex flex-col justify-between gap-2 group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">🧹</span>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-purple-500/20 text-purple-300">DEDUPLICAR</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-white group-hover:text-purple-300">Fusionar Hechos Repetidos</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    Elimina repeticiones de datos (ej: "Se llama Deyios") y conserva el primer registro original emitido.
                  </p>
                </div>
              </button>

              {/* Botón 2: Limpiar Biometría */}
              <button
                onClick={handlePurgeBiometrics}
                className="p-4 rounded-2xl bg-red-950/30 hover:bg-red-900/40 border border-red-500/30 text-left transition-all flex flex-col justify-between gap-2 group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">🗑️</span>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-red-500/20 text-red-300">PURGA</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-white group-hover:text-red-300">Limpiar Basura Biometría</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    Elimina todos los registros de cadencia vocal residuales que saturaban la tabla de memoria.
                  </p>
                </div>
              </button>

              {/* Botón 3: Limpiar Desconocidos */}
              <button
                onClick={handlePurgeUnknowns}
                className="p-4 rounded-2xl bg-cyan-950/30 hover:bg-cyan-900/40 border border-cyan-500/30 text-left transition-all flex flex-col justify-between gap-2 group cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xl">👥</span>
                  <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-cyan-500/20 text-cyan-300">CONTACTOS</span>
                </div>
                <div>
                  <h4 className="text-xs font-black text-white group-hover:text-cyan-300">Limpiar Desconocidos</h4>
                  <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">
                    Elimina perfiles de rostros no identificados (Desconocido #1, #2) guardados por error.
                  </p>
                </div>
              </button>
            </div>
          </div>
        )}

        {actionStatus && (
          <div className={`p-3.5 rounded-2xl border text-xs font-bold shadow-lg animate-in fade-in ${
            actionStatus.type === 'success' ? 'bg-emerald-950/80 border-emerald-500/50 text-emerald-200' :
            actionStatus.type === 'error' ? 'bg-red-950/80 border-red-500/50 text-red-200' :
            'bg-purple-950/80 border-purple-500/50 text-purple-200'
          }`}>
            {actionStatus.msg}
          </div>
        )}

        {/* ─── GRID: CALENDARIO VISUAL INTERACTIVO & BUSCADOR ─── */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          
          {/* 📅 CALENDARIO INTERACTIVO (4 Columnas en Desktop) */}
          <div className="lg:col-span-4 bg-surface-dark border border-white/10 rounded-2xl sm:rounded-3xl p-5 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-black uppercase tracking-widest text-slate-300 flex items-center gap-2">
                <span>📅</span> {MONTH_NAMES[calendarDate.getMonth()]} {calendarDate.getFullYear()}
              </h2>
              <div className="flex items-center gap-1">
                <button
                  onClick={prevMonth}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">chevron_left</span>
                </button>
                <button
                  onClick={nextMonth}
                  className="p-1.5 rounded-lg bg-white/5 hover:bg-white/15 text-slate-400 hover:text-white transition-all cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">chevron_right</span>
                </button>
              </div>
            </div>

            {/* Días de la semana */}
            <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-black uppercase text-slate-500 pb-1">
              {WEEKDAY_NAMES.map(d => (
                <div key={d}>{d}</div>
              ))}
            </div>

            {/* Cuadrícula de días */}
            <div className="grid grid-cols-7 gap-1">
              {calendarDays.map((d, index) => {
                const isSelected = selectedDateFilter === d.dateKey;
                const hasMemories = d.data && d.data.count > 0;

                return (
                  <button
                    key={`${d.dateKey}-${index}`}
                    onClick={() => {
                      if (isSelected) {
                        setSelectedDateFilter(null);
                      } else {
                        setSelectedDateFilter(d.dateKey);
                      }
                    }}
                    className={`h-9 rounded-xl text-xs font-black transition-all flex flex-col items-center justify-center relative cursor-pointer ${
                      isSelected
                        ? 'bg-purple-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.5)] scale-105 ring-1 ring-purple-400'
                        : hasMemories
                        ? 'bg-white/10 text-white hover:bg-white/20 hover:scale-105'
                        : d.isCurrentMonth
                        ? 'text-slate-400 hover:bg-white/5 hover:text-white'
                        : 'text-slate-600 opacity-40'
                    }`}
                  >
                    <span>{d.dayNumber}</span>
                    {hasMemories && (
                      <div className="flex items-center gap-0.5 mt-0.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 shadow-[0_0_4px_#22d3ee]" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Estado del filtro de fecha */}
            {selectedDateFilter && (
              <div className="pt-2 flex items-center justify-between border-t border-white/10 text-xs">
                <span className="text-purple-300 font-bold">Filtrando: {selectedDateFilter}</span>
                <button
                  onClick={() => setSelectedDateFilter(null)}
                  className="text-[10px] font-black uppercase px-2 py-0.5 rounded bg-white/10 hover:bg-white/20 text-slate-300 cursor-pointer"
                >
                  Ver Todo
                </button>
              </div>
            )}
          </div>

          {/* 🔍 BARRA DE BÚSQUEDA Y FILTROS DE CATEGORÍA (8 Columnas) */}
          <div className="lg:col-span-8 flex flex-col justify-between gap-4">
            
            {/* Buscador de Texto */}
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 text-lg">search</span>
              <input
                type="text"
                placeholder="Buscar en recuerdos y chats (ej: Albion, Deyios, música, chaqueta...)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full bg-surface-dark border border-white/10 rounded-2xl pl-10 pr-10 py-3 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500 focus:ring-1 focus:ring-purple-500 shadow-xl transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
            </div>

            {/* Selector de Tipo de Recuerdo */}
            <div className="flex items-center gap-2 flex-wrap">
              {[
                { id: 'all', label: 'Todos', icon: 'auto_awesome', count: items.length },
                { id: 'memory', label: 'Chats / Conversaciones', icon: 'forum', count: items.filter(i => i.type === 'memory').length },
                { id: 'fact', label: 'Datos Aprendidos', icon: 'lightbulb', count: items.filter(i => i.type === 'fact').length },
                { id: 'reminder', label: 'Recordatorios', icon: 'event_available', count: items.filter(i => i.type === 'reminder').length },
                { id: 'person', label: 'Personas', icon: 'group', count: items.filter(i => i.type === 'person').length },
              ].map(tab => (
                <button
                  key={tab.id}
                  onClick={() => setFilter(tab.id as any)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-black uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer ${
                    filter === tab.id
                      ? 'bg-purple-600 text-white shadow-lg shadow-purple-600/30'
                      : 'bg-white/5 border border-white/10 text-slate-400 hover:text-white hover:bg-white/10'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">{tab.icon}</span>
                  <span>{tab.label}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-black/40 text-slate-300 font-mono">
                    {tab.count}
                  </span>
                </button>
              ))}
            </div>

            {/* Resumen de Resultados */}
            <div className="flex items-center justify-between text-xs text-slate-400 px-1">
              <span>Mostrando <b>{filteredItems.length}</b> recuerdos guardados</span>
              {selectedDateFilter && (
                <span className="text-cyan-400 font-mono">📅 Fecha: {selectedDateFilter}</span>
              )}
            </div>

          </div>

        </div>

        {/* ─── CONTENIDO: LÍNEA DEL TIEMPO Y CHATS ─── */}
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-60">
            <div className="size-10 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-bold tracking-widest text-xs uppercase text-purple-300">Cargando base de datos de memoria...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="text-center py-20 bg-surface-dark rounded-3xl border border-dashed border-white/10 p-8 space-y-3">
            <span className="material-symbols-outlined text-6xl text-slate-700">history_toggle_off</span>
            <p className="text-slate-400 font-bold text-sm">No se encontraron recuerdos con estos filtros.</p>
            <p className="text-slate-500 text-xs max-w-md mx-auto">
              Intenta seleccionar otra fecha en el calendario, borrar la búsqueda o cambiar de categoría.
            </p>
          </div>
        ) : (
          <div className="space-y-10">
            {Object.entries(groupedItems).map(([date, dayItems]) => (
              <section key={date}>
                <h2 className="text-xs font-black text-purple-400 uppercase tracking-[0.2em] mb-4 flex items-center gap-3">
                  <span>📅 {date}</span>
                  <div className="h-px bg-white/10 flex-1"></div>
                  <span className="text-[10px] text-slate-500 font-mono">{dayItems.length} entradas</span>
                </h2>
                
                <div className="space-y-3.5 ml-3 sm:ml-4 border-l-2 border-white/10 pl-6 sm:pl-8 relative">
                  {dayItems.map(item => (
                    <div key={item.id} className="relative group">
                      
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[31px] sm:-left-[37px] top-5 size-3.5 sm:size-4 rounded-full border-2 border-[#0a0c12] z-10 transition-transform group-hover:scale-125 ${
                        item.type === 'memory' ? 'bg-purple-500 shadow-[0_0_8px_#a855f7]' : 
                        item.type === 'fact' ? 'bg-cyan-400 shadow-[0_0_8px_#22d3ee]' : 
                        item.type === 'reminder' ? 'bg-amber-400 shadow-[0_0_8px_#f59e0b]' :
                        'bg-emerald-400 shadow-[0_0_8px_#10b981]'
                      }`} />

                      {/* Tarjeta de Recuerdo */}
                      <div className="bg-surface-dark border border-white/10 rounded-2xl p-4 sm:p-5 transition-all hover:border-white/20 hover:bg-white/[0.03] shadow-xl relative">
                        <div className="flex justify-between items-start mb-3 gap-2">
                          <div className="flex items-center gap-3">
                            {item.photoData ? (
                              <img
                                src={item.photoData.startsWith('data:') ? item.photoData : `data:image/jpeg;base64,${item.photoData}`}
                                alt={item.title}
                                className="w-10 h-10 rounded-full object-cover border-2 border-emerald-400 shadow-[0_0_10px_rgba(16,185,129,0.4)] shrink-0"
                              />
                            ) : (
                              <span className={`material-symbols-outlined p-2 rounded-xl text-sm ${
                                item.type === 'memory' ? 'bg-purple-500/20 text-purple-300' : 
                                item.type === 'fact' ? 'bg-cyan-500/20 text-cyan-300' : 
                                item.type === 'reminder' ? 'bg-amber-500/20 text-amber-300' :
                                'bg-emerald-500/20 text-emerald-300'
                              }`}>
                                {item.type === 'memory' ? 'forum' : item.type === 'fact' ? 'lightbulb' : item.type === 'reminder' ? 'event_available' : 'person'}
                              </span>
                            )}
                            <div>
                              <h3 className="text-xs sm:text-sm font-black text-white leading-tight">{item.title}</h3>
                              <span className="text-[9px] text-slate-500 font-mono">{item.date.toLocaleTimeString()}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {item.category && (
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 bg-white/5 border border-white/10 text-slate-400 rounded-md">
                                {item.category}
                              </span>
                            )}

                            {/* Botón de Borrado Individual */}
                            <button
                              onClick={() => handleDeleteItem(item)}
                              disabled={deletingId === item.id}
                              className="p-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/30 text-red-400 hover:text-red-300 border border-red-500/20 transition-all cursor-pointer shadow-sm disabled:opacity-50"
                              title="Borrar este recuerdo permanentemente"
                            >
                              <span className="material-symbols-outlined text-sm">
                                {deletingId === item.id ? 'sync' : 'delete'}
                              </span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2">
                          <p className="text-xs sm:text-sm text-slate-200 leading-relaxed font-medium">
                            "{item.description}"
                          </p>
                          {item.extra && (
                            <div className="bg-black/40 rounded-xl p-3 text-[11px] text-slate-400 border-l-2 border-purple-500/40 mt-2">
                              <span className="block text-[9px] font-black text-purple-300 uppercase mb-0.5">Respuesta de Nova</span>
                              {item.extra}
                            </div>
                          )}
                        </div>
                      </div>

                    </div>
                  ))}
                </div>
              </section>
            ))}
          </div>
        )}

      </div>
    </div>
  );
};

export default MemoriesTimeline;
