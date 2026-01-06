// Utilidad para captura de pantalla + audio del sistema
// Permite a Nova ver y escuchar lo que el usuario está haciendo
// Soporta tanto navegador como Electron (nativo)

declare global {
    interface Window {
        isElectron?: boolean;
        electronAPI?: {
            getScreenSources: () => Promise<Array<{ id: string; name: string; thumbnail: string }>>;
            startNativeCapture: (sourceId: string) => Promise<{ success: boolean; hasVideo: boolean; hasAudio: boolean; streamId?: string; error?: string }>;
        };
    }
}

let screenStream: MediaStream | null = null;
let captureCanvas: HTMLCanvasElement | null = null;
let captureContext: CanvasRenderingContext2D | null = null;
let videoElement: HTMLVideoElement | null = null;

export interface ScreenCaptureOptions {
    width?: number;
    height?: number;
    frameRate?: number;
    captureAudio?: boolean;
    sourceId?: string; // Para Electron: ID de la fuente específica
}

export interface ScreenCaptureResult {
    success: boolean;
    hasAudio: boolean;
    hasVideo?: boolean;
    isNative?: boolean;
}

// Detectar si estamos en Electron
export function isInElectron(): boolean {
    return typeof window !== 'undefined' && window.isElectron === true;
}

// Obtener fuentes de pantalla disponibles (solo en Electron)
export async function getAvailableSources(): Promise<Array<{ id: string; name: string; thumbnail: string }>> {
    if (isInElectron() && window.electronAPI) {
        return await window.electronAPI.getScreenSources();
    }
    return [];
}

export async function startScreenCapture(options: ScreenCaptureOptions = {}): Promise<ScreenCaptureResult> {
    try {
        // MODO ELECTRON: Captura nativa con audio del sistema
        if (isInElectron() && window.electronAPI && options.sourceId) {
            console.log('🖥️ Usando captura NATIVA de Electron...');

            // Usar getUserMedia con chromeMediaSource para Electron
            screenStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                    }
                } as any,
                video: {
                    mandatory: {
                        chromeMediaSource: 'desktop',
                        chromeMediaSourceId: options.sourceId,
                        maxWidth: options.width || 1920,
                        maxHeight: options.height || 1080,
                        maxFrameRate: options.frameRate || 30
                    }
                } as any
            });

            const hasAudio = screenStream.getAudioTracks().length > 0;
            const hasVideo = screenStream.getVideoTracks().length > 0;

            console.log('🔊 Audio NATIVO del sistema:', hasAudio ? '✅ CAPTURADO' : '❌ No disponible');
            console.log('📺 Video:', hasVideo ? '✅ CAPTURADO' : '❌ No disponible');

            setupVideoCapture(options);
            return { success: true, hasAudio, hasVideo, isNative: true };
        }

        // MODO WEB: Usar getDisplayMedia (limitado)
        console.log('🌐 Usando captura de navegador (limitada)...');
        screenStream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                width: { ideal: options.width || 1280 },
                height: { ideal: options.height || 720 },
                frameRate: { ideal: options.frameRate || 5 }
            },
            audio: options.captureAudio !== false
        });

        const hasAudio = screenStream.getAudioTracks().length > 0;
        console.log('🔊 Audio del navegador:', hasAudio ? 'CAPTURADO' : 'No disponible');

        setupVideoCapture(options);
        return { success: true, hasAudio, isNative: false };

    } catch (error) {
        console.error('Error al iniciar captura de pantalla:', error);
        return { success: false, hasAudio: false };
    }
}

function setupVideoCapture(options: ScreenCaptureOptions): void {
    if (!screenStream) return;

    // Crear canvas para captura de frames
    captureCanvas = document.createElement('canvas');
    captureCanvas.width = options.width || 1280;
    captureCanvas.height = options.height || 720;
    captureContext = captureCanvas.getContext('2d');

    // Crear video element para recibir el stream
    videoElement = document.createElement('video');
    videoElement.srcObject = screenStream;
    videoElement.muted = true; // Muted para evitar feedback
    videoElement.play();

    console.log('🖥️ Captura de pantalla iniciada');

    // Detectar cuando el usuario deja de compartir
    if (screenStream.getVideoTracks().length > 0) {
        screenStream.getVideoTracks()[0].addEventListener('ended', () => {
            console.log('🖥️ Usuario dejó de compartir pantalla');
            stopScreenCapture();
        });
    }
}

export function stopScreenCapture(): void {
    if (screenStream) {
        screenStream.getTracks().forEach(track => track.stop());
        screenStream = null;
    }
    if (videoElement) {
        videoElement.pause();
        videoElement.srcObject = null;
        videoElement = null;
    }
    captureCanvas = null;
    captureContext = null;
    console.log('🖥️ Captura de pantalla detenida');
}

export function captureFrame(quality: number = 0.7): string | null {
    if (!videoElement || !captureCanvas || !captureContext) {
        return null;
    }

    // Dibujar frame actual en canvas
    captureContext.drawImage(
        videoElement,
        0, 0,
        captureCanvas.width,
        captureCanvas.height
    );

    // Convertir a base64 JPEG
    const dataUrl = captureCanvas.toDataURL('image/jpeg', quality);

    // Remover el prefijo "data:image/jpeg;base64," para obtener solo el base64
    return dataUrl.split(',')[1];
}

export function isScreenSharing(): boolean {
    return screenStream !== null && screenStream.active;
}

// Obtener el stream de audio del sistema para enviarlo a Gemini
export function getSystemAudioStream(): MediaStream | null {
    if (!screenStream) return null;

    const audioTracks = screenStream.getAudioTracks();
    if (audioTracks.length === 0) return null;

    return new MediaStream(audioTracks);
}

// Verificar si hay audio disponible
export function hasSystemAudio(): boolean {
    return screenStream !== null && screenStream.getAudioTracks().length > 0;
}

// Captura automática cada N segundos
let captureInterval: NodeJS.Timeout | null = null;

export function startAutoCapture(
    callback: (frame: string) => void,
    intervalMs: number = 3000
): void {
    if (captureInterval) {
        clearInterval(captureInterval);
    }

    captureInterval = setInterval(() => {
        if (isScreenSharing()) {
            const frame = captureFrame();
            if (frame) {
                callback(frame);
            }
        }
    }, intervalMs);
}

export function stopAutoCapture(): void {
    if (captureInterval) {
        clearInterval(captureInterval);
        captureInterval = null;
    }
}
