import React, { useState, useEffect } from 'react';
import { performanceMonitor } from '../utils/performanceMonitor';

interface PerformanceSettingsProps {
    onClose: () => void;
}

export default function PerformanceSettings({ onClose }: PerformanceSettingsProps) {
    const [autoStart, setAutoStart] = useState(false);
    const [startMode, setStartMode] = useState<'tray' | 'mini' | 'normal'>('tray');
    const [metrics, setMetrics] = useState({
        memoryUsage: 0,
        fps: 0,
        activeResources: 0
    });
    const [loading, setLoading] = useState(true);

    // Cargar configuración inicial
    useEffect(() => {
        loadSettings();

        // Actualizar métricas cada segundo
        const interval = setInterval(() => {
            const currentMetrics = performanceMonitor.getMetrics();
            setMetrics({
                memoryUsage: currentMetrics.memoryUsage,
                fps: currentMetrics.fps,
                activeResources: currentMetrics.activeResources
            });
        }, 1000);

        return () => clearInterval(interval);
    }, []);

    const loadSettings = async () => {
        try {
            if ((window as any).electron) {
                const settings = await (window as any).electron.invoke('settings:get');
                setAutoStart(settings.autoStart);
                setStartMode(settings.startMode);
            }
        } catch (error) {
            console.error('Error cargando configuración:', error);
        } finally {
            setLoading(false);
        }
    };

    const handleToggleAutoStart = async () => {
        try {
            if ((window as any).electron) {
                const result = await (window as any).electron.invoke('settings:toggle-autostart');
                setAutoStart(result.enabled);
            }
        } catch (error) {
            console.error('Error toggling auto-start:', error);
        }
    };

    const handleChangeStartMode = async (mode: 'tray' | 'mini' | 'normal') => {
        try {
            if ((window as any).electron) {
                await (window as any).electron.invoke('settings:set-start-mode', mode);
                setStartMode(mode);
            }
        } catch (error) {
            console.error('Error changing start mode:', error);
        }
    };

    const handleForceCleanup = () => {
        performanceMonitor.forceCleanup();
    };

    if (loading) {
        return (
            <div style={styles.container}>
                <div style={styles.loading}>Cargando configuración...</div>
            </div>
        );
    }

    return (
        <div style={styles.container}>
            <div style={styles.header}>
                <h2 style={styles.title}>⚡ Rendimiento  y Auto-inicio</h2>
                <button onClick={onClose} style={styles.closeButton}>✕</button>
            </div>

            <div style={styles.content}>
                {/* Métricas en tiempo real */}
                <section style={styles.section}>
                    <h3 style={styles.sectionTitle}>📊 Métricas en Tiempo Real</h3>
                    <div style={styles.metricsGrid}>
                        <div style={styles.metricCard}>
                            <div style={styles.metricLabel}>Memoria</div>
                            <div style={styles.metricValue}>{metrics.memoryUsage} MB</div>
                        </div>
                        <div style={styles.metricCard}>
                            <div style={styles.metricLabel}>FPS</div>
                            <div style={styles.metricValue}>{metrics.fps}</div>
                        </div>
                        <div style={styles.metricCard}>
                            <div style={styles.metricLabel}>Recursos Activos</div>
                            <div style={styles.metricValue}>{metrics.activeResources}</div>
                        </div>
                    </div>
                    <button onClick={handleForceCleanup} style={styles.cleanupButton}>
                        🧹 Limpieza Manual
                    </button>
                </section>

                {/* Auto-inicio */}
                <section style={styles.section}>
                    <h3 style={styles.sectionTitle}>🚀 Auto-inicio con Windows</h3>
                    <div style={styles.settingRow}>
                        <div>
                            <div style={styles.settingLabel}>Iniciar con Windows</div>
                            <div style={styles.settingDescription}>
                                Nova IA se iniciará automáticamente al encender tu PC
                            </div>
                        </div>
                        <button
                            onClick={handleToggleAutoStart}
                            style={{
                                ...styles.toggle,
                                ...(autoStart ? styles.toggleActive : {})
                            }}
                        >
                            {autoStart ? 'Activado' : 'Desactivado'}
                        </button>
                    </div>

                    {autoStart && (
                        <div style={styles.startModeContainer}>
                            <div style={styles.settingLabel}>Modo de Inicio</div>
                            <div style={styles.startModeButtons}>
                                {(['tray', 'mini', 'normal'] as const).map((mode) => (
                                    <button
                                        key={mode}
                                        onClick={() => handleChangeStartMode(mode)}
                                        style={{
                                            ...styles.modeButton,
                                            ...(startMode === mode ? styles.modeButtonActive : {})
                                        }}
                                    >
                                        <div style={styles.modeIcon}>
                                            {mode === 'tray' && '📁'}
                                            {mode === 'mini' && '🐾'}
                                            {mode === 'normal' && '🖥️'}
                                        </div>
                                        <div style={styles.modeName}>
                                            {mode === 'tray' && 'Bandeja del Sistema'}
                                            {mode === 'mini' && 'Modo Mini (Mascota)'}
                                            {mode === 'normal' && 'Ventana Normal'}
                                        </div>
                                        <div style={styles.modeDescription}>
                                            {mode === 'tray' && 'Oculto en segundo plano'}
                                            {mode === 'mini' && 'Compacto en la esquina'}
                                            {mode === 'normal' && 'Ventana completa minimizada'}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </section>

                {/* Información */}
                <section style={styles.section}>
                    <h3 style={styles.sectionTitle}>💡 Atajos de Teclado</h3>
                    <div style={styles.shortcutsList}>
                        <div style={styles.shortcut}>
                            <kbd style={styles.kbd}>Alt</kbd> + <kbd style={styles.kbd}>N</kbd>
                            <span style={styles.shortcutDesc}>Mostrar/Ocultar Nova</span>
                        </div>
                        <div style={styles.shortcut}>
                            <kbd style={styles.kbd}>Alt</kbd> + <kbd style={styles.kbd}>M</kbd>
                            <span style={styles.shortcutDesc}>Modo Mini (Desktop Pet)</span>
                        </div>
                        <div style={styles.shortcut}>
                            <kbd style={styles.kbd}>Ctrl</kbd> + <kbd style={styles.kbd}>Shift</kbd> + <kbd style={styles.kbd}>N</kbd>
                            <span style={styles.shortcutDesc}>Siempre Encima</span>
                        </div>
                    </div>
                </section>
            </div>
        </div>
    );
}

const styles: Record<string, React.CSSProperties> = {
    container: {
        width: '100%',
        height: '100%',
        backgroundColor: '#0a0a0f',
        color: '#e0e0e0',
        fontFamily: '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
        overflow: 'auto',
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '24px 32px',
        borderBottom: '1px solid #1a1a2e',
    },
    title: {
        margin: 0,
        fontSize: '24px',
        fontWeight: '600',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
    },
    closeButton: {
        background: 'none',
        border: 'none',
        color: '#888',
        fontSize: '24px',
        cursor: 'pointer',
        padding: '4px 12px',
        transition: 'color 0.2s',
    },
    content: {
        padding: '32px',
        maxWidth: '800px',
        margin: '0 auto',
    },
    section: {
        marginBottom: '32px',
        padding: '24px',
        backgroundColor: '#12121a',
        borderRadius: '12px',
        border: '1px solid #1a1a2e',
    },
    sectionTitle: {
        margin: '0 0 20px 0',
        fontSize: '18px',
        fontWeight: '600',
        color: '#e0e0e0',
    },
    metricsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '16px',
        marginBottom: '16px',
    },
    metricCard: {
        padding: '16px',
        backgroundColor: '#1a1a2e',
        borderRadius: '8px',
        textAlign: 'center' as const,
    },
    metricLabel: {
        fontSize: '12px',
        color: '#888',
        marginBottom: '8px',
        textTransform: 'uppercase' as const,
    },
    metricValue: {
        fontSize: '24px',
        fontWeight: '700',
        color: '#667eea',
    },
    cleanupButton: {
        width: '100%',
        padding: '12px',
        backgroundColor: '#667eea',
        color: 'white',
        border: 'none',
        borderRadius: '8px',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.2s',
    },
    settingRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px',
    },
    settingLabel: {
        fontSize: '16px',
        fontWeight: '600',
        color: '#e0e0e0',
        marginBottom: '4px',
    },
    settingDescription: {
        fontSize: '13px',
        color: '#888',
    },
    toggle: {
        padding: '8px 16px',
        borderRadius: '20px',
        border: '2px solid #333',
        backgroundColor: '#1a1a2e',
        color: '#888',
        fontSize: '14px',
        fontWeight: '600',
        cursor: 'pointer',
        transition: 'all 0.3s',
    },
    toggleActive: {
        backgroundColor: '#667eea',
        borderColor: '#667eea',
        color: 'white',
    },
    startModeContainer: {
        marginTop: '24px',
        paddingTop: '24px',
        borderTop: '1px solid #1a1a2e',
    },
    startModeButtons: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginTop: '12px',
    },
    modeButton: {
        padding: '16px',
        backgroundColor: '#1a1a2e',
        border: '2px solid #1a1a2e',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 0.3s',
        textAlign: 'center' as const,
    },
    modeButtonActive: {
        borderColor: '#667eea',
        backgroundColor: '#22223a',
    },
    modeIcon: {
        fontSize: '32px',
        marginBottom: '8px',
    },
    modeName: {
        fontSize: '14px',
        fontWeight: '600',
        color: '#e0e0e0',
        marginBottom: '4px',
    },
    modeDescription: {
        fontSize: '11px',
        color: '#888',
    },
    shortcutsList: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: '12px',
    },
    shortcut: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
    },
    kbd: {
        padding: '4px 8px',
        backgroundColor: '#1a1a2e',
        border: '1px solid #333',
        borderRadius: '4px',
        fontSize: '12px',
        fontWeight: '600',
        fontFamily: 'monospace',
    },
    shortcutDesc: {
        fontSize: '14px',
        color: '#888',
    },
    loading: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        fontSize: '18px',
        color: '#888',
    },
};
