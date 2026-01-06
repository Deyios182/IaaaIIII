/**
 * Performance Monitor - Sistema de monitoreo y optimización de rendimiento
 * Monitorea uso de memoria, CPU, y gestiona limpieza automática de recursos
 */

interface PerformanceMetrics {
    memoryUsage: number;
    fps: number;
    lastCleanup: number;
    activeResources: number;
}

class PerformanceMonitor {
    private static instance: PerformanceMonitor;
    private metrics: PerformanceMetrics = {
        memoryUsage: 0,
        fps: 0,
        lastCleanup: Date.now(),
        activeResources: 0
    };

    private fpsHistory: number[] = [];
    private lastFrameTime: number = performance.now();
    private cleanupInterval: NodeJS.Timeout | null = null;
    private trackedResources: Set<any> = new Set();

    private constructor() {
        this.startMonitoring();
    }

    static getInstance(): PerformanceMonitor {
        if (!PerformanceMonitor.instance) {
            PerformanceMonitor.instance = new PerformanceMonitor();
        }
        return PerformanceMonitor.instance;
    }

    /**
     * Iniciar monitoreo automático
     */
    private startMonitoring() {
        // Monitorear FPS cada frame
        this.updateFPS();

        // Limpieza periódica cada 5 minutos
        this.cleanupInterval = setInterval(() => {
            this.performCleanup();
        }, 5 * 60 * 1000);

        // Log de métricas cada minuto en modo desarrollo
        const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
        if (isDev) {
            setInterval(() => {
                this.logMetrics();
            }, 60 * 1000);
        }
    }

    /**
     * Actualizar FPS
     */
    private updateFPS() {
        const now = performance.now();
        const delta = now - this.lastFrameTime;
        this.lastFrameTime = now;

        const currentFPS = 1000 / delta;
        this.fpsHistory.push(currentFPS);

        // Mantener solo últimos 60 frames
        if (this.fpsHistory.length > 60) {
            this.fpsHistory.shift();
        }

        // Calcular FPS promedio
        this.metrics.fps = Math.round(
            this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length
        );

        requestAnimationFrame(() => this.updateFPS());
    }

    /**
     * Obtener uso de memoria (si está disponible)
     */
    getMemoryUsage(): number {
        if ('memory' in performance && (performance as any).memory) {
            const mem = (performance as any).memory;
            return Math.round(mem.usedJSHeapSize / 1048576); // MB
        }
        return 0;
    }

    /**
     * Registrar recurso para tracking
     */
    trackResource(resource: any) {
        this.trackedResources.add(resource);
        this.metrics.activeResources = this.trackedResources.size;
    }

    /**
     * Liberar recurso
     */
    freeResource(resource: any) {
        this.trackedResources.delete(resource);
        this.metrics.activeResources = this.trackedResources.size;
    }

    /**
     * Realizar limpieza de recursos
     */
    private performCleanup() {
        console.log('🧹 Ejecutando limpieza automática de recursos...');

        // Forzar garbage collection si está disponible (solo en dev)
        const isDev = typeof import.meta !== 'undefined' && (import.meta as any).env?.DEV;
        if (isDev && (window as any).gc) {
            (window as any).gc();
        }

        this.metrics.lastCleanup = Date.now();
        this.metrics.memoryUsage = this.getMemoryUsage();

        console.log(`✅ Limpieza completada. Memoria: ${this.metrics.memoryUsage}MB, FPS: ${this.metrics.fps}`);
    }

    /**
     * Forzar limpieza manual
     */
    forceCleanup() {
        this.performCleanup();
    }

    /**
     * Obtener métricas actuales
     */
    getMetrics(): PerformanceMetrics {
        return {
            ...this.metrics,
            memoryUsage: this.getMemoryUsage()
        };
    }

    /**
     * Log de métricas
     */
    private logMetrics() {
        const metrics = this.getMetrics();
        console.log(`📊 Performance Metrics:`, {
            memoria: `${metrics.memoryUsage}MB`,
            fps: metrics.fps,
            recursos: metrics.activeResources,
            ultimaLimpieza: new Date(metrics.lastCleanup).toLocaleTimeString()
        });
    }

    /**
     * Detener monitoreo
     */
    stop() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
        }
    }
}

// Singleton export
export const performanceMonitor = PerformanceMonitor.getInstance();

/**
 * Hook para throttling de funciones
 */
export function throttle<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let lastCall = 0;
    let timeoutId: NodeJS.Timeout | null = null;

    return function (this: any, ...args: Parameters<T>) {
        const now = Date.now();

        if (now - lastCall >= delay) {
            lastCall = now;
            func.apply(this, args);
        } else {
            if (timeoutId) clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                lastCall = Date.now();
                func.apply(this, args);
            }, delay - (now - lastCall));
        }
    };
}

/**
 * Hook para debouncing de funciones
 */
export function debounce<T extends (...args: any[]) => any>(
    func: T,
    delay: number
): (...args: Parameters<T>) => void {
    let timeoutId: NodeJS.Timeout | null = null;

    return function (this: any, ...args: Parameters<T>) {
        if (timeoutId) clearTimeout(timeoutId);

        timeoutId = setTimeout(() => {
            func.apply(this, args);
        }, delay);
    };
}
