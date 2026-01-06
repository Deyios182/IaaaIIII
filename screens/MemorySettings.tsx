import React, { useState } from 'react';
import { MemoryRetention, ConversationStyle, PersonEntry } from '../types';
import { cleanupDuplicates } from '../utils/duplicateCleanup';
import { deleteKnownPerson, upsertKnownPerson } from '../services/MemoryService';

interface MemorySettingsProps {
  retention: MemoryRetention;
  style: ConversationStyle;
  knownPeople: PersonEntry[];
  setRetention: (r: MemoryRetention) => void;
  setStyle: (s: ConversationStyle) => void;
  removePerson: (id: string) => void;
  updateKnownPeople: (people: PersonEntry[]) => void;
}

const MemorySettings: React.FC<MemorySettingsProps> = ({ retention, style, knownPeople, setRetention, setStyle, removePerson, updateKnownPeople }) => {
  const [cleanupReport, setCleanupReport] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<{ name: string; relationship: string }>({ name: '', relationship: '' });

  const handleCleanup = async () => {
    setCleanupReport("Analizando duplicados...");
    const result = await cleanupDuplicates(knownPeople);

    if (result.entriesMerged > 0) {
      const finalIds = new Set(result.finalEntries.map(p => p.id));
      const deletedPeople = knownPeople.filter(p => !finalIds.has(p.id));

      setCleanupReport(`🗑️ Eliminando ${deletedPeople.length} registros obsoletos...`);
      for (const p of deletedPeople) {
        await deleteKnownPerson(p.id);
      }

      setCleanupReport(`💾 Guardando cambios...`);
      for (const p of result.finalEntries) {
        await upsertKnownPerson({
          id: p.id,
          name: p.name,
          relationship: p.relationship,
          visual_description: p.visualDescription,
          voice_description: p.voiceDescription,
          face_descriptor: p.faceDescriptor,
          photo_data: p.photoData,
          is_unknown: p.isUnknown,
          last_seen: new Date(p.lastSeen || Date.now()).toISOString()
        });
      }

      updateKnownPeople(result.finalEntries);
      setCleanupReport(`✅ Limpieza completada: ${result.entriesMerged} duplicados fusionados.`);
    } else {
      setCleanupReport("✅ No se encontraron duplicados.");
    }
    setTimeout(() => setCleanupReport(null), 5000);
  };

  const startEditing = (person: PersonEntry) => {
    setEditingId(person.id);
    setEditForm({ name: person.name, relationship: person.relationship });
  };

  const saveEdit = async (person: PersonEntry) => {
    if (!editForm.name.trim()) return;

    const updatedPerson = {
      ...person,
      name: editForm.name,
      relationship: editForm.relationship,
      isUnknown: false // If we edit it, it's no longer unknown
    };

    // Update locally immediately
    updateKnownPeople(knownPeople.map(p => p.id === person.id ? updatedPerson : p));
    setEditingId(null);

    // Save to cloud
    await upsertKnownPerson({
      ...updatedPerson,
      last_seen: new Date(person.lastSeen || Date.now()).toISOString()
    });
  };

  return (
    <div className="flex-1 px-8 py-8 overflow-y-auto custom-scrollbar">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        <div className="flex flex-col gap-2">
          <h1 className="text-3xl font-black tracking-tight">Configuración de Memoria</h1>
          <p className="text-slate-400 text-lg">Gestiona cómo tu compañero IA almacena, recuerda y utiliza la información sobre ti.</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-7 flex flex-col gap-6">
            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-6">
                <span className="material-symbols-outlined text-primary">psychology</span> Nivel de Retención
              </h2>
              <div className="space-y-4">
                {[
                  { value: MemoryRetention.SESSION, title: 'Amnésico (Solo sesión)', desc: 'La IA olvidará todo al reiniciar. Máxima privacidad.' },
                  { value: MemoryRetention.SHORT_TERM, title: 'Corto Plazo (30 días)', desc: 'Mantiene contexto de interacciones recientes.' },
                  { value: MemoryRetention.LONG_TERM, title: 'Largo Plazo (Indefinido)', desc: 'Construye una base de conocimiento permanente.' }
                ].map(opt => (
                  <label key={opt.value} className={`flex items-start gap-4 p-4 rounded-xl border-2 cursor-pointer transition-all ${retention === opt.value ? 'border-primary bg-primary/5' : 'border-surface-border hover:border-white/10'}`}>
                    <input
                      type="radio"
                      name="retention"
                      checked={retention === opt.value}
                      onChange={() => setRetention(opt.value)}
                      className="mt-1 text-primary focus:ring-primary border-slate-600 bg-transparent"
                    />
                    <div className="flex flex-col">
                      <span className="text-sm font-bold">{opt.title}</span>
                      <span className="text-xs text-slate-400 mt-1">{opt.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-primary">record_voice_over</span> Estilo de Conversación
              </h2>
              <div className="grid grid-cols-3 gap-3">
                {Object.values(ConversationStyle).map(s => (
                  <button
                    key={s}
                    onClick={() => setStyle(s)}
                    className={`flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all ${style === s ? 'border-primary bg-primary/10' : 'border-surface-border hover:bg-white/5'}`}
                  >
                    <span className="material-symbols-outlined text-2xl">{s === ConversationStyle.EMPATHIC ? 'sentiment_satisfied' : s === ConversationStyle.ANALYTICAL ? 'rocket_launch' : 'lightbulb'}</span>
                    <span className="text-xs font-bold">{s}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* PERSONAS CONOCIDAS */}
            <div className="rounded-2xl border border-surface-border bg-surface-dark p-6">
              <h2 className="text-xl font-bold flex items-center gap-2 mb-5">
                <span className="material-symbols-outlined text-primary">groups</span> Personas Conocidas ({knownPeople?.length || 0})
                <div className="ml-auto flex items-center gap-2">
                  {cleanupReport && <span className="text-xs text-green-400 font-mono animate-pulse">{cleanupReport}</span>}
                  <button
                    onClick={handleCleanup}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 text-xs font-bold rounded-lg transition-colors border border-blue-500/30"
                  >
                    <span className="material-symbols-outlined text-sm">cleaning_services</span>
                    Limpiar Duplicados
                  </button>
                </div>
              </h2>

              {(!knownPeople || knownPeople.length === 0) ? (
                <div className="text-center py-8 border-2 border-dashed border-surface-border rounded-xl">
                  <span className="material-symbols-outlined text-4xl text-slate-600 mb-2">visibility_off</span>
                  <p className="text-slate-400 text-sm">Aún no reconocemos a nadie.</p>
                  <p className="text-slate-500 text-xs mt-1">Preséntale personas a Nova por cámara.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {knownPeople.map(person => (
                    <div key={person.id} className={`group relative border rounded-xl overflow-hidden transition-colors ${editingId === person.id ? 'border-primary bg-primary/5' : 'bg-[#15151e] border-surface-border hover:border-primary/50'}`}>
                      {/* Foto de la persona si existe */}
                      {person.photoData && !editingId && (
                        <div className="relative h-48 overflow-hidden bg-black/30">
                          <img
                            src={person.photoData.startsWith('data:image') ? person.photoData : `data:image/jpeg;base64,${person.photoData}`}
                            alt={person.name}
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-[#15151e] to-transparent opacity-80"></div>
                        </div>
                      )}

                      <div className="p-4">
                        {editingId === person.id ? (
                          // MODO EDICIÓN
                          <div className="flex flex-col gap-3">
                            <div>
                              <label className="text-[10px] uppercase text-slate-500 font-bold">Nombre</label>
                              <input
                                type="text"
                                value={editForm.name}
                                onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                className="w-full bg-black/40 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:border-primary outline-none"
                              />
                            </div>
                            <div>
                              <label className="text-[10px] uppercase text-slate-500 font-bold">Relación</label>
                              <input
                                type="text"
                                value={editForm.relationship}
                                onChange={e => setEditForm({ ...editForm, relationship: e.target.value })}
                                className="w-full bg-black/40 border border-slate-600 rounded px-2 py-1 text-white text-sm focus:border-primary outline-none"
                              />
                            </div>
                            <div className="flex gap-2 mt-2">
                              <button
                                onClick={() => saveEdit(person)}
                                className="flex-1 bg-primary text-black font-bold text-xs py-1.5 rounded hover:bg-primary-light"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditingId(null)}
                                className="flex-1 bg-white/5 text-white font-bold text-xs py-1.5 rounded hover:bg-white/10"
                              >
                                Cancelar
                              </button>
                            </div>
                          </div>
                        ) : (
                          // MODO VISUALIZACIÓN
                          <>
                            <div className="flex justify-between items-start mb-2">
                              <div>
                                <h3 className="font-bold text-white text-lg">{person.name}</h3>
                                <div className="flex gap-2 items-center flex-wrap mt-1">
                                  <span className="text-xs font-semibold text-primary bg-primary/10 px-2 py-0.5 rounded-full whitespace-nowrap">{person.relationship}</span>
                                  {person.isUnknown && <span className="text-[10px] font-bold text-yellow-400 border border-yellow-400/30 px-1.5 rounded whitespace-nowrap">NUEVO</span>}
                                </div>
                              </div>
                              <div className="flex gap-1 shrink-0">
                                <button
                                  onClick={() => startEditing(person)}
                                  className="bg-white/5 border border-white/10 text-slate-300 hover:text-white hover:bg-white/20 p-2 rounded-lg transition-all"
                                  title="Editar nombre/relación"
                                >
                                  <span className="material-symbols-outlined text-lg">edit</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    try {
                                      const updatedPerson = { ...person, name: "Usuario Principal", relationship: "self", isUnknown: false };
                                      updateKnownPeople(knownPeople.map(p => p.id === person.id ? updatedPerson : p));
                                      await upsertKnownPerson({
                                        ...updatedPerson,
                                        last_seen: new Date().toISOString()
                                      });
                                    } catch (e) {
                                      console.error("Error setting as main user:", e);
                                      alert("Error al guardar cambios. Verifique consola.");
                                    }
                                  }}
                                  className="bg-blue-500/10 border border-blue-500/30 text-blue-400 hover:text-blue-300 hover:bg-blue-500/20 p-2 rounded-lg transition-all"
                                  title="Soy Yo (Usuario Principal)"
                                >
                                  <span className="material-symbols-outlined text-lg">person_check</span>
                                </button>
                                <button
                                  onClick={async () => {
                                    if (window.confirm(`¿Eliminar a ${person.name}?`)) {
                                      try {
                                        await removePerson(person.id);
                                      } catch (e) {
                                        console.error("Error deleting person:", e);
                                        alert("Error al eliminar. Verifique la conexión a base de datos.");
                                      }
                                    }
                                  }}
                                  className="bg-red-500/10 border border-red-500/30 text-red-500 hover:text-red-400 hover:bg-red-500/20 p-2 rounded-lg transition-all"
                                  title="Eliminar persona"
                                >
                                  <span className="material-symbols-outlined text-lg">delete</span>
                                </button>
                              </div>
                            </div>

                            <div className="space-y-2 mt-3">
                              <div className="text-xs text-slate-400 bg-black/20 p-2 rounded-lg">
                                <strong className="text-slate-500 uppercase tracking-wider text-[10px] block mb-1">Apariencia</strong>
                                <p className="line-clamp-2">{person.visualDescription}</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-5 flex flex-col gap-6">
            <div className="rounded-2xl border border-surface-border bg-surface-dark flex flex-col h-full min-h-[400px]">
              <div className="p-6 border-b border-surface-border">
                <h2 className="text-lg font-bold flex items-center gap-2">
                  <span className="material-symbols-outlined text-primary">bookmarks</span> Recuerdos Destacados
                </h2>
              </div>
              <div className="flex-1 p-4 space-y-3 overflow-y-auto custom-scrollbar">
                <div className="p-4 rounded-xl bg-surface-dark-lighter border border-surface-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Hecho Personal</span>
                    <span className="text-[10px] text-slate-500">Hace 2 días</span>
                  </div>
                  <p className="text-xs leading-relaxed">Usuario mencionó que su cumpleaños es el 12 de Octubre.</p>
                </div>
                <div className="p-4 rounded-xl bg-surface-dark-lighter border border-surface-border">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">Profesional</span>
                    <span className="text-[10px] text-slate-500">Hace 1 semana</span>
                  </div>
                  <p className="text-xs leading-relaxed">Trabaja como Diseñador UI Senior enfocado en accesibilidad.</p>
                </div>
              </div>
              <div className="p-4 border-t border-surface-border">
                <button className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-red-500/30 text-red-500 text-xs font-bold hover:bg-red-500/10 transition-colors">
                  <span className="material-symbols-outlined text-sm">delete_forever</span> Borrar toda la memoria
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MemorySettings;
