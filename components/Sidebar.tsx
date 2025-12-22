
import React from 'react';
import { NavLink } from 'react-router-dom';

interface SidebarProps {
  isPro: boolean;
  isBold?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isPro, isBold }) => {
  const navItems = [
    { path: '/', icon: 'smart_toy', label: 'Inicio' },
    { path: '/history', icon: 'history', label: 'Recuerdos' },
    { path: '/personalize', icon: 'person', label: 'Personalización' },
    { path: '/voice', icon: 'volume_up', label: 'Voz y Tono' },
    { path: '/memory', icon: 'psychology', label: 'Memoria' },
    { path: '/account', icon: 'settings', label: 'Ajustes' },
  ];

  const brandColor = isBold ? 'bg-pink-600 shadow-pink-500/20' : 'bg-primary shadow-primary/20';

  return (
    <aside className="hidden md:flex flex-col w-64 bg-[#111118] border-r border-surface-border py-6 items-start shrink-0 z-10">
      <div className="px-6 mb-8 flex items-center gap-3">
        <div className={`size-10 rounded-full ${brandColor} flex items-center justify-center text-white transition-all duration-1000 shadow-lg`}>
          <span className="material-symbols-outlined">smart_toy</span>
        </div>
        <div>
          <h1 className="text-sm font-bold">Nova IA</h1>
          <p className="text-[10px] text-slate-400">{isBold ? 'Vínculo Intenso' : (isPro ? 'Versión Pro' : 'Básico')}</p>
        </div>
      </div>

      <nav className="flex-1 w-full px-4 space-y-2">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all ${
                isActive
                  ? (isBold ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-primary/20 text-white border border-primary/30')
                  : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <span className="material-symbols-outlined">{item.icon}</span>
            <span className="text-sm font-medium">{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-4 mt-auto w-full">
        <div className={`p-4 rounded-xl border transition-all duration-1000 ${isBold ? 'bg-pink-500/5 border-pink-500/20' : 'bg-primary/5 border-primary/20'}`}>
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Sintonía</span>
            <span className={`text-[10px] font-bold ${isBold ? 'text-pink-400' : 'text-primary'}`}>88%</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
             <div className={`h-full transition-all duration-1000 ${isBold ? 'bg-pink-500' : 'bg-primary'}`} style={{ width: '88%' }}></div>
          </div>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
