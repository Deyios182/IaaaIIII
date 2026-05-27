
import React, { useState, useEffect } from 'react';
import { loadAllMemory, Memory, Fact, Reminder, KnownPerson } from '../services/MemoryService';

interface TimelineItem {
  id: string;
  type: 'memory' | 'fact' | 'reminder' | 'person';
  date: Date;
  title: string;
  description: string;
  extra?: string;
  category?: string;
  completed?: boolean;
}

const MemoriesTimeline: React.FC = () => {
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'memory' | 'fact' | 'reminder'>('all');

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      try {
        const data = await loadAllMemory();
        const timeline: TimelineItem[] = [];

        // Process Memories (Conversations)
        data.recentMemories.forEach((m: any) => {
          timeline.push({
            id: `mem_${m.id}`,
            type: 'memory',
            date: new Date(m.timestamp || m.created_at || Date.now()),
            title: 'Conversación Importante',
            description: m.user_message,
            extra: m.ai_response,
            category: m.emotion || 'neutral'
          });
        });

        // Process Facts
        data.facts.forEach((f: any) => {
          timeline.push({
            id: `fact_${f.id}`,
            type: 'fact',
            date: new Date(f.learned_at || Date.now()),
            title: 'Dato Aprendido',
            description: f.content,
            category: f.category
          });
        });

        // Process Reminders
        data.pendingReminders.forEach((r: any) => {
          timeline.push({
            id: `rem_${r.id}`,
            type: 'reminder',
            date: new Date(r.trigger_time || r.created_at || Date.now()),
            title: 'Recordatorio',
            description: r.message,
            completed: r.completed,
            extra: r.completed ? 'Completado' : 'Pendiente'
          });
        });

        // Sort by date desc
        timeline.sort((a, b) => b.date.getTime() - a.date.getTime());
        setItems(timeline);
      } catch (error) {
        console.error('Error loading timeline:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredItems = filter === 'all' ? items : items.filter(i => i.type === filter);

  // Group by date
  const groupedItems: { [key: string]: TimelineItem[] } = {};
  filteredItems.forEach(item => {
    const dateStr = item.date.toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    if (!groupedItems[dateStr]) groupedItems[dateStr] = [];
    groupedItems[dateStr].push(item);
  });

  return (
    <div className="flex-1 h-full overflow-y-auto custom-scrollbar bg-[#0f0f17] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <header className="mb-10 flex justify-between items-end">
          <div>
            <h1 className="text-4xl font-black bg-gradient-to-r from-primary to-purple-500 bg-clip-text text-transparent">Línea del Tiempo</h1>
            <p className="text-slate-400 mt-2 text-lg">Todos tus recuerdos y datos guardados por Nova.</p>
          </div>
          <div className="flex bg-surface-dark border border-white/5 rounded-xl p-1 p-1">
            {(['all', 'memory', 'fact', 'reminder'] as const).map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${filter === f ? 'bg-primary text-black shadow-lg shadow-primary/20' : 'text-slate-400 hover:text-white'}`}
              >
                {f.toUpperCase()}
              </button>
            ))}
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 opacity-50">
            <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
            <p className="font-bold tracking-widest text-xs uppercase">Sincronizando con la nube...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="text-center py-20 bg-surface-dark rounded-3xl border border-dashed border-white/10">
            <span className="material-symbols-outlined text-6xl text-slate-700 mb-4">history_toggle_off</span>
            <p className="text-slate-500 font-medium">No hay recuerdos registrados todavía.</p>
            <p className="text-slate-600 text-sm mt-1">Dile algo importante a Nova para que lo guarde.</p>
          </div>
        ) : (
          <div className="space-y-12">
            {Object.entries(groupedItems).map(([date, dayItems]) => (
              <section key={date}>
                <h2 className="text-sm font-bold text-slate-500 uppercase tracking-[0.2em] mb-6 flex items-center gap-4">
                  <span className="shrink-0">{date}</span>
                  <div className="h-px bg-white/5 flex-1"></div>
                </h2>
                
                <div className="space-y-6 ml-4 border-l-2 border-white/5 pl-8 relative">
                  {dayItems.map(item => (
                    <div key={item.id} className="relative group">
                      {/* Timeline Dot */}
                      <div className={`absolute -left-[37px] top-6 size-4 rounded-full border-2 border-[#0f0f17] z-10 transition-transform group-hover:scale-125 ${
                        item.type === 'memory' ? 'bg-purple-500' : 
                        item.type === 'fact' ? 'bg-blue-500' : 
                        'bg-orange-500'
                      }`}></div>

                      <div className="bg-surface-dark border border-white/5 rounded-2xl p-6 transition-all hover:border-white/20 hover:bg-surface-dark-lighter shadow-xl">
                        <div className="flex justify-between items-start mb-4">
                          <div className="flex items-center gap-3">
                            <span className={`material-symbols-outlined p-2 rounded-lg text-sm ${
                              item.type === 'memory' ? 'bg-purple-500/20 text-purple-400' : 
                              item.type === 'fact' ? 'bg-blue-500/20 text-blue-400' : 
                              'bg-orange-500/20 text-orange-400'
                            }`}>
                              {item.type === 'memory' ? 'forum' : item.type === 'fact' ? 'lightbulb' : 'event_available'}
                            </span>
                            <div>
                              <h3 className="font-bold text-white leading-tight">{item.title}</h3>
                              <span className="text-[10px] text-slate-500 font-mono">{item.date.toLocaleTimeString()}</span>
                            </div>
                          </div>
                          {item.category && (
                            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-1 bg-white/5 text-slate-400 rounded">
                              {item.category}
                            </span>
                          )}
                        </div>

                        <div className="space-y-3">
                          <p className="text-sm text-slate-300 leading-relaxed italic">
                            "{item.description}"
                          </p>
                          {item.extra && (
                            <div className="bg-black/20 rounded-xl p-4 text-xs text-slate-400 border-l-2 border-primary/30">
                              <span className="block text-[10px] font-bold text-primary uppercase mb-1">Respuesta de Nova</span>
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
