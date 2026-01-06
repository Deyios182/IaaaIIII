
import React, { useState, useEffect } from 'react';

interface AccountSettingsProps {
   isPro: boolean;
   userName: string;
   avatar: any; // Using any for simplicity as AppState type is external
   updateAvatar: (settings: any) => void;
   updateUserName: (name: string) => void;
}

interface MediaDeviceInfo {
   deviceId: string;
   label: string;
   kind: string;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ isPro, userName, avatar, updateAvatar, updateUserName }) => {
   const [showClearDialog, setShowClearDialog] = useState(false);
   const [editingName, setEditingName] = useState(false);
   const [tempName, setTempName] = useState(userName);

   // Device selection states
   const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
   const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
   const [selectedMic, setSelectedMic] = useState(localStorage.getItem('nova_selectedMic') || '');
   const [selectedCamera, setSelectedCamera] = useState(localStorage.getItem('nova_selectedCamera') || '');

   // Load available devices
   useEffect(() => {
      const loadDevices = async () => {
         try {
            // Request permission first to get device labels
            await navigator.mediaDevices.getUserMedia({ audio: true, video: true }).then(stream => {
               stream.getTracks().forEach(track => track.stop());
            }).catch(() => { });

            const devices = await navigator.mediaDevices.enumerateDevices();
            const mics = devices.filter(d => d.kind === 'audioinput').map(d => ({
               deviceId: d.deviceId,
               label: d.label || `Micrófono ${d.deviceId.slice(0, 8)}`,
               kind: d.kind
            }));
            const cams = devices.filter(d => d.kind === 'videoinput').map(d => ({
               deviceId: d.deviceId,
               label: d.label || `Cámara ${d.deviceId.slice(0, 8)}`,
               kind: d.kind
            }));

            setMicrophones(mics);
            setCameras(cams);

            // Set default if not selected
            if (!selectedMic && mics.length > 0) {
               setSelectedMic(mics[0].deviceId);
            }
            if (!selectedCamera && cams.length > 0) {
               setSelectedCamera(cams[0].deviceId);
            }
         } catch (err) {
            console.error('Error loading devices:', err);
         }
      };

      loadDevices();
   }, []);

   // Save device selection
   const handleMicChange = (deviceId: string) => {
      setSelectedMic(deviceId);
      localStorage.setItem('nova_selectedMic', deviceId);
      // Notify global
      (window as any).novaSelectedMic = deviceId;
   };

   const handleCameraChange = (deviceId: string) => {
      setSelectedCamera(deviceId);
      localStorage.setItem('nova_selectedCamera', deviceId);
      // Notify global
      (window as any).novaSelectedCamera = deviceId;
   };

   const handleClearMemory = () => {
      console.log('🗑️ Borrando memoria...');

      // 0. MARCAR FLAG DE RESET para evitar que App.tsx guarde el estado al salir
      localStorage.setItem('nova_reset_pending', 'true');

      // 1. Borrar keys críticos
      localStorage.removeItem('nova_memory');
      localStorage.removeItem('nova_app_state');
      localStorage.clear();

      // 3. Feedback visual
      const btn = document.getElementById('btn-clear-memory');
      if (btn) btn.innerText = "¡Memoria Borrada!";

      // 4. Recargar página para reiniciar estados
      setTimeout(() => {
         window.location.reload();
      }, 1000); // Dar un segundo para que se procese
   };

   return (
      <div className="flex-1 max-w-7xl mx-auto w-full px-8 py-12 overflow-y-auto custom-scrollbar">

         {/* ... (Modal logic remains same) ... */}
         {showClearDialog && (
            <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999] flex items-center justify-center p-4">
               <div className="bg-surface-dark border border-red-500/30 rounded-3xl p-8 max-w-md w-full shadow-2xl shadow-red-500/10">
                  <div className="flex items-center gap-4 mb-6">
                     <div className="w-14 h-14 rounded-2xl bg-red-500/20 flex items-center justify-center">
                        <span className="material-symbols-outlined text-red-500 text-3xl">warning</span>
                     </div>
                     <div>
                        <h3 className="text-xl font-black text-white">¿Borrar toda la memoria?</h3>
                        <p className="text-slate-400 text-sm">Esta acción no se puede deshacer</p>
                     </div>
                  </div>
                  <p className="text-slate-300 text-sm mb-8 leading-relaxed">
                     Se eliminarán <strong className="text-red-400">todas las conversaciones</strong>, configuraciones guardadas y Nova olvidará todo lo que han hablado. Tendrás que empezar desde cero.
                  </p>
                  <div className="flex gap-4">
                     <button
                        onClick={() => setShowClearDialog(false)}
                        className="flex-1 bg-surface-dark-lighter hover:bg-[#34344a] text-white px-6 py-4 rounded-2xl text-sm font-bold transition-all"
                     >
                        Cancelar
                     </button>
                     <button
                        onClick={handleClearMemory}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white px-6 py-4 rounded-2xl text-sm font-bold transition-all shadow-lg shadow-red-600/30"
                     >
                        Sí, borrar todo
                     </button>
                  </div>
               </div>
            </div>
         )}

         <div className="mb-10">
            <h1 className="text-3xl font-black tracking-tight mb-2">Configuración de Cuenta & Avatar</h1>
            <p className="text-slate-400">Personaliza la apariencia de Nova, tu nombre y gestiona tu memoria.</p>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            <aside className="lg:col-span-3">
               <div className="sticky top-8 flex flex-col gap-1 bg-surface-dark p-4 rounded-2xl border border-surface-border">
                  <div className="flex items-center gap-3 px-3 py-3 mb-4">
                     <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center text-white font-bold">
                        {userName.substring(0, 2).toUpperCase()}
                     </div>
                     <div className="flex flex-col overflow-hidden">
                        <span className="text-white font-bold truncate">{userName}</span>
                        <span className="text-slate-500 text-[10px] truncate uppercase tracking-tighter">PRO MEMBER</span>
                     </div>
                  </div>
                  {['Avatar', 'Perfil', 'Suscripción', 'Memoria'].map((item, i) => (
                     <button key={item} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${i === 0 ? 'bg-surface-dark-lighter text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                        <span className="material-symbols-outlined text-[20px]">{['face', 'person', 'credit_card', 'delete'][i]}</span>
                        <span className="text-sm font-medium">{item}</span>
                     </button>
                  ))}
               </div>
            </aside>

            <main className="lg:col-span-9 space-y-8 pb-12">

               <div className="flex flex-col gap-8">
                  {/* Configuración de Identidad */}
                  <div className="rounded-3xl border border-surface-border bg-surface-dark p-8">
                     <div className="flex items-center gap-4 mb-6">
                        <span className="material-symbols-outlined text-primary text-3xl">badge</span>
                        <h2 className="text-2xl font-black">Tu Identidad</h2>
                     </div>
                     <div className="space-y-4">
                        <div>
                           <label className="text-sm font-bold text-slate-400 mb-2 block">¿Cómo te llamas?</label>
                           {editingName ? (
                              <div className="flex gap-2">
                                 <input
                                    type="text"
                                    value={tempName}
                                    onChange={(e) => setTempName(e.target.value)}
                                    className="flex-1 bg-surface-dark-lighter border border-surface-border rounded-xl px-4 py-3 text-white"
                                    placeholder="Tu nombre"
                                    autoFocus
                                 />
                                 <button
                                    onClick={() => {
                                       if (tempName.trim()) {
                                          updateUserName(tempName.trim());
                                          setEditingName(false);
                                       }
                                    }}
                                    className="bg-primary text-white px-6 py-3 rounded-xl font-bold hover:bg-primary/80"
                                 >
                                    Guardar
                                 </button>
                                 <button
                                    onClick={() => {
                                       setTempName(userName);
                                       setEditingName(false);
                                    }}
                                    className="bg-surface-dark-lighter text-white px-4 py-3 rounded-xl"
                                 >
                                    Cancelar
                                 </button>
                              </div>
                           ) : (
                              <div className="flex items-center gap-3">
                                 <span className="text-2xl font-bold text-white">{userName}</span>
                                 <button
                                    onClick={() => setEditingName(true)}
                                    className="text-primary hover:text-primary/80 text-sm font-bold"
                                 >
                                    Cambiar
                                 </button>
                              </div>
                           )}
                           <p className="text-xs text-slate-500 mt-2">Nova usará este nombre para dirigirse a ti</p>
                        </div>
                     </div>
                  </div>

                  {/* Configuración de Dispositivos */}
                  <div className="rounded-3xl border border-surface-border bg-surface-dark p-8">
                     <div className="flex items-center gap-4 mb-6">
                        <span className="material-symbols-outlined text-purple-500 text-3xl">settings_input_component</span>
                        <h2 className="text-2xl font-black">Dispositivos de Entrada</h2>
                     </div>

                     <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Micrófono */}
                        <div className="space-y-3">
                           <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
                              <span className="material-symbols-outlined text-lg">mic</span>
                              Micrófono
                           </label>
                           <select
                              value={selectedMic}
                              onChange={(e) => handleMicChange(e.target.value)}
                              className="w-full bg-surface-dark-lighter border border-surface-border rounded-xl px-4 py-3 text-white appearance-none cursor-pointer hover:border-purple-500/50 transition-colors"
                           >
                              {microphones.length === 0 ? (
                                 <option value="">Cargando dispositivos...</option>
                              ) : (
                                 microphones.map(mic => (
                                    <option key={mic.deviceId} value={mic.deviceId}>
                                       {mic.label}
                                    </option>
                                 ))
                              )}
                           </select>
                           <p className="text-xs text-slate-500">Selecciona el micrófono para las llamadas con Nova</p>
                        </div>

                        {/* Cámara */}
                        <div className="space-y-3">
                           <label className="text-sm font-bold text-slate-400 flex items-center gap-2">
                              <span className="material-symbols-outlined text-lg">videocam</span>
                              Cámara
                           </label>
                           <select
                              value={selectedCamera}
                              onChange={(e) => handleCameraChange(e.target.value)}
                              className="w-full bg-surface-dark-lighter border border-surface-border rounded-xl px-4 py-3 text-white appearance-none cursor-pointer hover:border-purple-500/50 transition-colors"
                           >
                              {cameras.length === 0 ? (
                                 <option value="">Cargando dispositivos...</option>
                              ) : (
                                 cameras.map(cam => (
                                    <option key={cam.deviceId} value={cam.deviceId}>
                                       {cam.label}
                                    </option>
                                 ))
                              )}
                           </select>
                           <p className="text-xs text-slate-500">Selecciona la cámara para las videollamadas</p>
                        </div>
                     </div>

                     <div className="mt-6 p-4 bg-purple-500/10 border border-purple-500/20 rounded-xl">
                        <p className="text-sm text-purple-300 flex items-center gap-2">
                           <span className="material-symbols-outlined text-lg">info</span>
                           Los cambios se aplicarán en la próxima llamada
                        </p>
                     </div>
                  </div>

               </div>

               <section className="bg-surface-dark rounded-2xl border border-red-500/20 overflow-hidden">
                  <div className="p-8">
                     <div className="flex items-center gap-3 mb-4">
                        <span className="material-symbols-outlined text-red-500">delete_forever</span>
                        <h3 className="text-lg font-bold text-white">Gestión de Memoria</h3>
                     </div>
                     <p className="text-slate-400 text-sm mb-6">Nova recuerda todas tus conversaciones. Puedes borrar toda la memoria si deseas empezar de nuevo.</p>
                     <button
                        onClick={() => setShowClearDialog(true)}
                        className="bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 hover:text-red-300 px-6 py-3 rounded-xl text-sm font-bold transition-all flex items-center gap-2"
                     >
                        <span className="material-symbols-outlined text-lg">delete</span>
                        Borrar toda la memoria
                     </button>
                  </div>
               </section>
            </main>
         </div>
      </div>
   );
};

export default AccountSettings;
