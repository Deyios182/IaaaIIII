
import React from 'react';

interface HeaderProps {
  userInitials: string;
  isBold?: boolean;
}

const Header: React.FC<HeaderProps> = ({ userInitials, isBold }) => {
  const gradientClass = isBold
    ? "from-pink-500 to-purple-600"
    : "from-primary to-purple-500";

  // Detectar si estamos en Electron
  const isElectron = typeof window !== 'undefined' && (window as any).isElectron === true;
  const electronAPI = isElectron ? (window as any).electronAPI : null;

  const handleMinimize = () => electronAPI?.minimize();
  const handleMaximize = () => electronAPI?.maximize();
  const handleClose = () => electronAPI?.close();

  return (
    <header
      className="flex items-center justify-between px-6 py-3 border-b border-surface-border bg-background-dark/80 backdrop-blur-md shrink-0 z-20"
      style={{ WebkitAppRegion: 'drag' } as any} // Permite arrastrar la ventana
    >
      <div className="flex items-center gap-4" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <h2 className="text-lg font-bold tracking-tight">Panel de Control</h2>
        <div className="hidden md:flex px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 items-center gap-1.5 ml-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-xs font-medium text-green-500">En Línea</span>
        </div>
      </div>
      <div className="flex items-center gap-2" style={{ WebkitAppRegion: 'no-drag' } as any}>
        <button className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <span className="material-symbols-outlined">settings</span>
        </button>
        <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-xs font-bold text-white ml-2 transition-all duration-1000`}>
          {userInitials}
        </div>

        {/* Controles de ventana (solo en Electron) */}
        {isElectron && (
          <div className="flex items-center gap-1 ml-4 pl-4 border-l border-white/10">
            <button
              onClick={handleMinimize}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Minimizar"
            >
              <span className="material-symbols-outlined text-lg">remove</span>
            </button>
            <button
              onClick={handleMaximize}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Maximizar"
            >
              <span className="material-symbols-outlined text-lg">crop_square</span>
            </button>
            <button
              onClick={handleClose}
              className="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
              title="Cerrar"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;

