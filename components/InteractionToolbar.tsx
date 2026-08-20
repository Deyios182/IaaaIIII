import React from 'react';

export type InteractionTool = 'hand' | 'pencil' | 'tablet' | 'feather' | 'whip' | 'dildo' | 'penis' | 'tongue';

interface InteractionToolbarProps {
    isBoldMode: boolean;
    activeTool: InteractionTool;
    setActiveTool: (tool: InteractionTool) => void;
    showDebugZones: boolean;
    setShowDebugZones: (show: boolean) => void;
    physicsSensitivity: number;
    setPhysicsSensitivity: (val: number) => void;
    physicsMaxAngle: number;
    setPhysicsMaxAngle: (val: number) => void;
    resetPhysics: () => void;
    isHandTrackingActive?: boolean;
    toggleHandTracking?: () => void;
}

export const InteractionToolbar: React.FC<InteractionToolbarProps> = ({
    isBoldMode,
    activeTool,
    setActiveTool,
    showDebugZones,
    setShowDebugZones,
    physicsSensitivity,
    setPhysicsSensitivity,
    physicsMaxAngle,
    setPhysicsMaxAngle,
    resetPhysics,
    isHandTrackingActive,
    toggleHandTracking
}) => {

    const safeTools = [
        { id: 'hand', icon: '🖐️', label: 'Mano (Tocar)' },
        { id: 'pencil', icon: '✏️', label: 'Lápiz (Pinchar)' },
        { id: 'tablet', icon: '📱', label: 'Tableta (Golpear levemente)' },
        { id: 'feather', icon: '🪶', label: 'Pluma (Cosquillas)' }
    ];

    const boldTools = [
        { id: 'hand', icon: '🖐️', label: 'Mano (Tocar/Agarrar)' },
        { id: 'tongue', icon: '👅', label: 'Lengua (Lamer/Besar)' },
        { id: 'penis', icon: '🥒', label: 'Miembro viril (Frotar/Penetrar)' },
        { id: 'dildo', icon: '🍆', label: 'Vibrador' },
        { id: 'whip', icon: '💥', label: 'Látigo (Azotar)' }
    ];

    const currentTools = isBoldMode ? boldTools : safeTools;

    return (
        <div className="absolute left-6 top-24 flex flex-col gap-4 z-[999]">
            {/* Botón de Cámara AR / Tracking de Mano */}
            {toggleHandTracking && (
                <button
                    onClick={toggleHandTracking}
                    title="Realidad Aumentada: Rastrear Mano con la Webcam"
                    className={`p-3 rounded-2xl border backdrop-blur flex flex-col items-center justify-center transition-all duration-300 pointer-events-auto group ${
                        isHandTrackingActive
                            ? 'bg-pink-600 border-pink-400 text-white shadow-[0_0_20px_rgba(236,72,153,0.6)] animate-pulse'
                            : 'bg-slate-900/80 border-slate-700 text-slate-300 hover:bg-slate-800 hover:text-white'
                    }`}
                >
                    <span className="text-xl">📷</span>
                    <span className="text-[9px] font-bold uppercase tracking-wider mt-1">
                        {isHandTrackingActive ? 'AR Activo' : 'Cámara AR'}
                    </span>
                </button>
            )}

            {/* Toolbox */}
            <div className="bg-slate-900/80 backdrop-blur border border-slate-700 p-2 rounded-2xl flex flex-col gap-2 shadow-lg pointer-events-auto transition-colors duration-300">
                {currentTools.map((tool) => {
                    const Icon = tool.icon;
                    const isActive = activeTool === tool.id;
                    
                    return (
                        <button
                            key={tool.id}
                            onClick={() => setActiveTool(tool.id as InteractionTool)}
                            title={tool.label}
                            className={`p-3 rounded-xl transition-all duration-200 relative group flex items-center justify-center text-2xl
                                ${isActive 
                                    ? isBoldMode ? 'bg-pink-500 text-white shadow-[0_0_15px_rgba(236,72,153,0.5)]' : 'bg-blue-500 text-white shadow-[0_0_15px_rgba(59,130,246,0.5)]'
                                    : 'bg-transparent text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                                }`}
                        >
                            <span>{tool.icon}</span>
                            
                            {/* Tooltip */}
                            <span className="absolute left-full ml-4 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 z-50">
                                {tool.label}
                            </span>
                        </button>
                    );
                })}
                
                {/* Separador */}
                <div className="h-px bg-slate-700 w-full my-1 rounded"></div>
                
                {/* Debug Toggle */}
                <button
                    onClick={() => setShowDebugZones(!showDebugZones)}
                    title="Mostrar Zonas Físicas"
                    className={`p-3 rounded-xl transition-all duration-200 relative group flex items-center justify-center text-xl
                        ${showDebugZones 
                            ? 'bg-yellow-500/80 text-white shadow-[0_0_10px_rgba(234,179,8,0.5)]' 
                            : 'bg-transparent text-slate-400 hover:bg-slate-800 hover:text-yellow-400'
                        }`}
                >
                    <span>👁️</span>
                    
                    {/* Tooltip */}
                    <span className="absolute left-full ml-4 bg-slate-800 text-white text-xs px-3 py-1.5 rounded-lg whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none border border-slate-700 z-50">
                        Ver zonas interactivas
                    </span>
                </button>
            </div>

            {/* Calibración Física (solo visible en modo debug) */}
            {showDebugZones && (
                <div className="absolute left-full ml-4 bottom-0 bg-slate-900/90 backdrop-blur border border-slate-700 p-4 rounded-2xl flex flex-col gap-3 shadow-lg pointer-events-auto w-48 transition-all">
                    <div className="text-[10px] font-bold text-green-400 uppercase tracking-widest text-center border-b border-slate-700 pb-2">
                        Físicas
                    </div>
                    
                    <div className="flex flex-col gap-1">
                        <label className="text-xs text-slate-300 flex justify-between">
                            <span>Sensibilidad</span>
                            <span className="text-slate-400">{(physicsSensitivity * 1000).toFixed(1)}</span>
                        </label>
                        <input 
                            type="range" 
                            min="0.001" 
                            max="0.025" 
                            step="0.001" 
                            value={physicsSensitivity}
                            onChange={(e) => setPhysicsSensitivity(parseFloat(e.target.value))}
                            className="accent-green-500 cursor-pointer"
                        />
                    </div>

                    <div className="flex flex-col gap-1 mt-1">
                        <label className="text-xs text-slate-300 flex justify-between">
                            <span>Límite Ángulo</span>
                            <span className="text-slate-400">{Math.round(physicsMaxAngle * 180 / Math.PI)}°</span>
                        </label>
                        <input 
                            type="range" 
                            min="0.5" 
                            max="3.14" 
                            step="0.1" 
                            value={physicsMaxAngle}
                            onChange={(e) => setPhysicsMaxAngle(parseFloat(e.target.value))}
                            className="accent-green-500 cursor-pointer"
                        />
                    </div>
                    
                    <button 
                        onClick={resetPhysics}
                        className="mt-2 w-full py-2 bg-slate-800 hover:bg-slate-700 active:bg-slate-600 text-white text-xs font-bold rounded-lg border border-slate-600 transition-colors"
                    >
                        Resetear Postura
                    </button>
                </div>
            )}
        </div>
    );
};
