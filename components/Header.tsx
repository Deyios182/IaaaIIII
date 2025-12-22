
import React from 'react';

interface HeaderProps {
  userInitials: string;
  // Added isBold property to HeaderProps to fix the error in App.tsx
  isBold?: boolean;
}

const Header: React.FC<HeaderProps> = ({ userInitials, isBold }) => {
  // Use dynamic gradient based on isBold mode
  const gradientClass = isBold 
    ? "from-pink-500 to-purple-600" 
    : "from-primary to-purple-500";

  return (
    <header className="flex items-center justify-between px-6 py-4 border-b border-surface-border bg-background-dark/80 backdrop-blur-md shrink-0 z-20">
      <div className="flex items-center gap-4">
        <h2 className="text-lg font-bold tracking-tight">Panel de Control</h2>
        <div className="hidden md:flex px-2 py-0.5 rounded-full bg-green-500/10 border border-green-500/20 items-center gap-1.5 ml-2">
          <div className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></div>
          <span className="text-xs font-medium text-green-500">En Línea</span>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <span className="material-symbols-outlined">notifications</span>
        </button>
        <button className="p-2 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-white/5">
          <span className="material-symbols-outlined">settings</span>
        </button>
        {/* Dynamic gradient for profile icon based on isBold mode */}
        <div className={`w-8 h-8 rounded-full bg-gradient-to-tr ${gradientClass} flex items-center justify-center text-xs font-bold text-white ml-2 transition-all duration-1000`}>
          {userInitials}
        </div>
      </div>
    </header>
  );
};

export default Header;
