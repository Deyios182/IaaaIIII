
import React from 'react';
import PingIndicator from './PingIndicator';

interface HeaderProps {
  userInitials: string;
  isBold?: boolean;
  onToggleMobileMenu?: () => void;
}

const Header: React.FC<HeaderProps> = ({ userInitials, isBold, onToggleMobileMenu }) => {
  const gradientClass = isBold
    ? "from-pink-500 to-purple-600"
    : "from-primary to-purple-500";

  // Detectar si estamos en Electron
  const isElectron = typeof window !== 'undefined' && (window as any).isElectron === true;
  const electronAPI = isElectron ? (window as any).electronAPI : null;

  const handleMinimize = () => electronAPI?.minimize();
  const handleMaximize = () => electronAPI?.maximize();
  const handleClose = () => electronAPI?.close();

  const handleToggleMenu = () => {
    if (onToggleMobileMenu) {
      onToggleMobileMenu();
    } else {
      window.dispatchEvent(new CustomEvent('nova-toggle-sidebar'));
    }
  };

  return (
    <header
      className="flex items-center justify-between px-3 sm:px-6 py-2.5 sm:py-3 border-b border-surface-border bg-background-dark/90 backdrop-blur-md shrink-0 z-20 gap-2"
      style={{ WebkitAppRegion: 'drag' } as any} // Permite arrastrar la ventana
    >
      <div className="flex items-center gap-2 sm:gap-4 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Botón de menú móvil para pantallas pequeñas */}
        <button
          onClick={handleToggleMenu}
          className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-white/10 transition-colors"
          title="Abrir Menú"
        >
          <span className="material-symbols-outlined text-xl">menu</span>
        </button>

        <h2 className="text-sm sm:text-base font-bold tracking-tight truncate max-w-[120px] sm:max-w-none">
          Panel de Control
        </h2>

        {/* Indicador En Línea */}
        <div className="hidden sm:flex px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 items-center gap-1.5">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-[11px] font-medium text-green-400">En Línea</span>
        </div>

        {/* Pequeño Indicador de Ping / Latencia */}
        <PingIndicator compact={true} className="hidden xs:inline-flex" />
      </div>

      <div className="flex items-center gap-1 sm:gap-2 shrink-0" style={{ WebkitAppRegion: 'no-drag' } as any}>
        {/* Ping en pantallas muy pequeñas */}
        <div className="xs:hidden">
          <PingIndicator compact={true} />
        </div>

        <button className="p-1.5 sm:p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <span className="material-symbols-outlined text-lg sm:text-xl">notifications</span>
        </button>
        <button className="p-1.5 sm:p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <span className="material-symbols-outlined text-lg sm:text-xl">settings</span>
        </button>

        <div className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-[11px] sm:text-xs font-bold text-white ml-1 sm:ml-2 transition-all duration-1000 shadow-md`}>
          {userInitials}
        </div>

        {/* Controles de ventana (solo en Electron) */}
        {isElectron && (
          <div className="flex items-center gap-0.5 sm:gap-1 ml-2 sm:ml-4 pl-2 sm:pl-4 border-l border-white/10">
            <button
              onClick={handleMinimize}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Minimizar"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">remove</span>
            </button>
            <button
              onClick={handleMaximize}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 rounded transition-colors"
              title="Maximizar"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">crop_square</span>
            </button>
            <button
              onClick={handleClose}
              className="w-7 h-7 sm:w-8 sm:h-8 flex items-center justify-center text-slate-400 hover:text-red-400 hover:bg-red-500/20 rounded transition-colors"
              title="Cerrar"
            >
              <span className="material-symbols-outlined text-base sm:text-lg">close</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;


