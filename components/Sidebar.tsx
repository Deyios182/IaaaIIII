
import React, { useState, useEffect } from 'react';
import { NavLink, useLocation } from 'react-router-dom';

interface SidebarProps {
  isPro: boolean;
  isBold?: boolean;
}

const Sidebar: React.FC<SidebarProps> = ({ isPro, isBold }) => {
  const [isOpenMobile, setIsOpenMobile] = useState(false);
  const location = useLocation();

  const navItems = [
    { path: '/', icon: 'smart_toy', label: 'Inicio' },
    { path: '/memories', icon: 'timeline', label: 'Línea de Vida' },
    { path: '/history', icon: 'history', label: 'Chat Reciente' },
    { path: '/avatar-studio', icon: 'theater_comedy', label: 'Avatar Studio' },
    { path: '/voice', icon: 'volume_up', label: 'Voz y Tono' },
    { path: '/memory', icon: 'psychology', label: 'Memoria' },
    { path: '/performance', icon: 'speed', label: 'Rendimiento' },
    { path: '/account', icon: 'settings', label: 'Ajustes' },
    { path: '/gym', icon: 'sports_gymnastics', label: 'Robot Gym β' },
  ];

  const brandColor = isBold ? 'bg-pink-600 shadow-pink-500/20' : 'bg-primary shadow-primary/20';

  // Escuchar evento global para abrir/cerrar sidebar en móvil
  useEffect(() => {
    const handleToggle = () => setIsOpenMobile(prev => !prev);
    window.addEventListener('nova-toggle-sidebar', handleToggle);
    return () => window.removeEventListener('nova-toggle-sidebar', handleToggle);
  }, []);

  // Cerrar el drawer móvil al cambiar de ruta
  useEffect(() => {
    setIsOpenMobile(false);
  }, [location.pathname]);

  const sidebarContent = (
    <>
      <div className="px-5 mb-6 flex items-center justify-between w-full">
        <div className="flex items-center gap-3">
          <div className={`size-9 sm:size-10 rounded-full ${brandColor} flex items-center justify-center text-white transition-all duration-1000 shadow-lg`}>
            <span className="material-symbols-outlined text-lg sm:text-xl">smart_toy</span>
          </div>
          <div>
            <h1 className="text-sm font-bold">Nova IA</h1>
            <p className="text-[10px] text-slate-400">{isBold ? 'Vínculo Intenso' : (isPro ? 'Versión Pro' : 'Básico')}</p>
          </div>
        </div>

        {/* Botón cerrar solo visible en móvil */}
        <button
          onClick={() => setIsOpenMobile(false)}
          className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10"
        >
          <span className="material-symbols-outlined text-lg">close</span>
        </button>
      </div>

      <nav className="flex-1 w-full px-3 sm:px-4 space-y-1 sm:space-y-1.5 overflow-y-auto custom-scrollbar">
        {navItems.map((item) => (
          <NavLink
            key={item.path}
            to={item.path}
            onClick={() => setIsOpenMobile(false)}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2 sm:py-2.5 rounded-xl transition-all text-xs sm:text-sm font-medium ${isActive
                ? (isBold ? 'bg-pink-500/20 text-pink-400 border border-pink-500/30' : 'bg-primary/20 text-white border border-primary/30')
                : 'text-slate-400 hover:text-white hover:bg-white/5'
              }`
            }
          >
            <span className="material-symbols-outlined text-base sm:text-lg">{item.icon}</span>
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      <div className="px-3 sm:px-4 mt-auto w-full pt-4">
        <div className={`p-3 sm:p-4 rounded-xl border transition-all duration-1000 ${isBold ? 'bg-pink-500/5 border-pink-500/20' : 'bg-primary/5 border-primary/20'}`}>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-widest text-slate-400">Sintonía</span>
            <span className={`text-[9px] sm:text-[10px] font-bold ${isBold ? 'text-pink-400' : 'text-primary'}`}>88%</span>
          </div>
          <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-1000 ${isBold ? 'bg-pink-500' : 'bg-primary'}`} style={{ width: '88%' }}></div>
          </div>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-56 lg:w-64 bg-[#111118] border-r border-surface-border py-5 lg:py-6 items-start shrink-0 z-10 select-none">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer (Visible sólo cuando isOpenMobile es true en pantallas < md) */}
      {isOpenMobile && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpenMobile(false)}
          />
          {/* Drawer Panel */}
          <div className="relative flex flex-col w-64 max-w-[80vw] h-full bg-[#111118] border-r border-surface-border py-5 shadow-2xl z-10 animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  );
};

export default Sidebar;

