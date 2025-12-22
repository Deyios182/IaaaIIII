
import React from 'react';

interface AccountSettingsProps {
  isPro: boolean;
}

const AccountSettings: React.FC<AccountSettingsProps> = ({ isPro }) => {
  return (
    <div className="flex-1 max-w-7xl mx-auto w-full px-8 py-12 overflow-y-auto custom-scrollbar">
      <div className="mb-10">
        <h1 className="text-3xl font-black tracking-tight mb-2">Configuración de Cuenta</h1>
        <p className="text-slate-400">Gestiona tu perfil, monitoriza tu consumo y administra tus pagos.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <aside className="lg:col-span-3">
          <div className="sticky top-8 flex flex-col gap-1 bg-surface-dark p-4 rounded-2xl border border-surface-border">
             <div className="flex items-center gap-3 px-3 py-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-gradient-to-tr from-primary to-purple-500 flex items-center justify-center text-white font-bold">JD</div>
                <div className="flex flex-col overflow-hidden">
                   <span className="text-white font-bold truncate">Usuario Demo</span>
                   <span className="text-slate-500 text-[10px] truncate uppercase tracking-tighter">usuario@ejemplo.com</span>
                </div>
             </div>
             {['Perfil General', 'Suscripción', 'Consumo', 'Seguridad'].map((item, i) => (
               <button key={item} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${i === 0 ? 'bg-surface-dark-lighter text-white' : 'text-slate-400 hover:text-white hover:bg-white/5'}`}>
                 <span className="material-symbols-outlined text-[20px]">{['person', 'credit_card', 'bar_chart', 'lock'][i]}</span>
                 <span className="text-sm font-medium">{item}</span>
               </button>
             ))}
          </div>
        </aside>

        <main className="lg:col-span-9 space-y-8 pb-12">
           <section className="bg-surface-dark rounded-2xl border border-surface-border overflow-hidden">
              <div className="p-8 border-b border-surface-border">
                 <div className="flex flex-col md:flex-row gap-6 items-center justify-between">
                    <div className="flex gap-5 items-center">
                       <div className="w-24 h-24 rounded-full bg-slate-800 border-4 border-surface-dark-lighter shrink-0 flex items-center justify-center">
                          <span className="material-symbols-outlined text-4xl text-slate-600">person</span>
                       </div>
                       <div>
                          <h3 className="text-2xl font-bold">Perfil Público</h3>
                          <p className="text-slate-400 text-sm">Visible para otros usuarios en la comunidad.</p>
                       </div>
                    </div>
                    <button className="bg-surface-dark-lighter hover:bg-[#34344a] text-white px-5 py-2.5 rounded-xl text-sm font-bold transition-all">Cambiar Foto</button>
                 </div>
              </div>
              <div className="p-8 grid grid-cols-1 md:grid-cols-2 gap-6">
                 <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-300">Nombre de Usuario</label>
                    <input className="w-full bg-[#15151e] border border-surface-border text-white text-sm rounded-xl p-3.5 focus:ring-1 focus:ring-primary outline-none" defaultValue="Usuario Demo" />
                 </div>
                 <div className="flex flex-col gap-2">
                    <label className="text-sm font-medium text-slate-300">Correo Electrónico</label>
                    <input className="w-full bg-[#15151e] border border-surface-border text-white text-sm rounded-xl p-3.5 focus:ring-1 focus:ring-primary outline-none" defaultValue="usuario@ejemplo.com" />
                 </div>
                 <div className="md:col-span-2 flex justify-end">
                    <button className="bg-primary hover:bg-blue-600 text-white px-8 py-3 rounded-xl text-sm font-bold transition-all shadow-lg shadow-primary/20">Guardar Cambios</button>
                 </div>
              </div>
           </section>

           <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="bg-surface-dark rounded-2xl border border-surface-border p-8">
                 <div className="flex items-center gap-2 mb-6">
                    <span className="material-symbols-outlined text-primary">analytics</span>
                    <h3 className="text-lg font-bold">Consumo Mensual</h3>
                 </div>
                 <div className="flex items-end gap-2 mb-2">
                    <span className="text-4xl font-black">1,240</span>
                    <span className="text-slate-500 text-sm mb-1.5">/ 2,000 Mensajes</span>
                 </div>
                 <div className="w-full bg-[#15151e] rounded-full h-3 mb-2">
                    <div className="bg-primary h-3 rounded-full" style={{ width: '62%' }}></div>
                 </div>
                 <p className="text-[10px] text-slate-500 text-right uppercase font-bold tracking-widest">62% utilizado</p>
              </div>

              <div className="bg-gradient-to-br from-primary/20 to-surface-dark rounded-2xl border border-primary/30 p-8 flex flex-col justify-between relative overflow-hidden">
                 <div className="relative z-10">
                    <div className="flex justify-between items-start mb-4">
                       <div>
                          <span className="inline-flex px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 text-[10px] font-black uppercase tracking-widest mb-2">Activo</span>
                          <h3 className="text-2xl font-black">Plan Pro</h3>
                       </div>
                       <span className="material-symbols-outlined text-primary text-3xl">verified</span>
                    </div>
                    <p className="text-blue-100/70 text-xs leading-relaxed mb-6">Acceso ilimitado a modelos avanzados, memoria extendida y respuesta ultra rápida.</p>
                 </div>
                 <div className="flex items-center justify-between">
                    <span className="text-xl font-bold">$19.99<span className="text-xs text-slate-500 font-normal"> / mes</span></span>
                    <button className="bg-white text-primary px-4 py-2 rounded-xl text-xs font-bold hover:bg-gray-100 transition-all">Gestionar</button>
                 </div>
              </div>
           </div>
        </main>
      </div>
    </div>
  );
};

export default AccountSettings;
