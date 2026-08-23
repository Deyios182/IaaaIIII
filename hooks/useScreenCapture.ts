import { useRef, useCallback, useState } from 'react';
import {
  startScreenCapture as startNativeCapture,
  stopScreenCapture as stopNativeCapture,
  captureOptimizedFrame,
  getAvailableSources,
  isInElectron,
  checkScreenSharing
} from '../utils/screenCapture';

export const useScreenCapture = () => {
  const [isCapturing, setIsCapturing] = useState(false);

  const startScreenCapture = useCallback(async () => {
    try {
      let sourceId: string | undefined;
      if (isInElectron()) {
        const sources = await getAvailableSources();
        if (sources.length > 0) {
          const screenSource = sources.find(s => s.name.includes('Screen') || s.name.includes('Pantalla')) || sources[0];
          sourceId = screenSource.id;
        }
      }

      const result = await startNativeCapture({
        width: 1280,
        height: 720,
        captureAudio: false,
        sourceId
      });

      if (result.success) {
        setIsCapturing(true);
        console.log('🖥️ [useScreenCapture] Captura iniciada con soporte Electron/Browser');
        return true;
      }
      setIsCapturing(false);
      return false;
    } catch (err) {
      console.error('❌ [useScreenCapture] Error al capturar pantalla:', err);
      setIsCapturing(false);
      return false;
    }
  }, []);

  const getScreenFrameBase64 = useCallback((): string | null => {
    if (!checkScreenSharing()) return null;
    const { frame } = captureOptimizedFrame({ quality: 0.55 });
    return frame || null;
  }, []);

  const stopScreenCapture = useCallback(() => {
    stopNativeCapture();
    setIsCapturing(false);
    console.log('🛑 [useScreenCapture] Captura de pantalla detenida.');
  }, []);

  return {
    isCapturing,
    startScreenCapture,
    getScreenFrameBase64,
    stopScreenCapture
  };
};
