import { useEffect, useRef, useState, useCallback } from 'react';
import { NovaFunctionalMode } from '../types';
import { useScreenCapture } from './useScreenCapture';
import { useMusicAnalyzer } from './useMusicAnalyzer';

export interface HardwareProfile {
  mode: NovaFunctionalMode;
  render3D: boolean;           // Si el motor Three.js debe correr o desmontarse para 0% GPU
  screenCaptureActive: boolean;// Si se envía video de pantalla a Gemini Multimodal
  faceRecognitionActive: boolean; // Si Face-API está buscando rostros en la webcam
  musicAnalyzerActive: boolean; // Si el analizador FFT de beats está activo
  asmrAutoPlay?: string;      // Sonido ASMR de fondo para modos nocturnos/terapia
  fpsCap: number;              // Límite de FPS (60 para 3D completo, 0 para MiniHUD)
  multimodalFps: number;       // FPS de captura de pantalla (ej: 1 o 2)
}

export const HARDWARE_PROFILES: Record<string, HardwareProfile> = {
  gaming: {
    mode: 'gaming',
    render3D: false,            // 0% GPU
    screenCaptureActive: true,  // Visión de pantalla cada 1s para juegos
    faceRecognitionActive: false,// 0% CPU de webcam
    musicAnalyzerActive: false,
    fpsCap: 0,
    multimodalFps: 1
  },
  gamer: {
    mode: 'gaming',
    render3D: false,
    screenCaptureActive: true,
    faceRecognitionActive: false,
    musicAnalyzerActive: false,
    fpsCap: 0,
    multimodalFps: 1
  },
  productivity: {
    mode: 'productivity',
    render3D: false,            // MiniHUD o 3D muy ligero
    screenCaptureActive: true,  // Visión de VS Code y pantalla
    faceRecognitionActive: false,
    musicAnalyzerActive: false,
    fpsCap: 0,
    multimodalFps: 1
  },
  developer: {
    mode: 'productivity',
    render3D: false,
    screenCaptureActive: true,
    faceRecognitionActive: false,
    musicAnalyzerActive: false,
    fpsCap: 0,
    multimodalFps: 1
  },
  music: {
    mode: 'music',
    render3D: true,             // 3D con luces audio-reactivas
    screenCaptureActive: false,
    faceRecognitionActive: false,
    musicAnalyzerActive: true,  // FFT activo disparando 'nova-beat'
    fpsCap: 60,
    multimodalFps: 0
  },
  therapy: {
    mode: 'therapy',
    render3D: true,
    screenCaptureActive: false,
    faceRecognitionActive: true,// Lectura de micro-expresiones
    musicAnalyzerActive: false,
    asmrAutoPlay: 'BREATHING',
    fpsCap: 60,
    multimodalFps: 0
  },
  therapist: {
    mode: 'therapy',
    render3D: true,
    screenCaptureActive: false,
    faceRecognitionActive: true,
    musicAnalyzerActive: false,
    asmrAutoPlay: 'BREATHING',
    fpsCap: 60,
    multimodalFps: 0
  },
  latenight: {
    mode: 'latenight',
    render3D: true,
    screenCaptureActive: false,
    faceRecognitionActive: false,// Ahorro de CPU
    musicAnalyzerActive: false,
    asmrAutoPlay: 'RAIN',
    fpsCap: 30,                 // 30 FPS para ultra bajo consumo
    multimodalFps: 0
  },
  sexting: {
    mode: 'sexting',
    render3D: true,             // 3D Full Jiggle Physics
    screenCaptureActive: false,
    faceRecognitionActive: true,
    musicAnalyzerActive: false,
    fpsCap: 60,
    multimodalFps: 0
  },
  nympho: {
    mode: 'sexting',
    render3D: true,
    screenCaptureActive: false,
    faceRecognitionActive: true,
    musicAnalyzerActive: false,
    fpsCap: 60,
    multimodalFps: 0
  },
  assistant: {
    mode: 'assistant',
    render3D: true,             // 3D Balanceado
    screenCaptureActive: false,
    faceRecognitionActive: true,
    musicAnalyzerActive: false,
    fpsCap: 60,
    multimodalFps: 0
  },
  companion: {
    mode: 'assistant',
    render3D: true,
    screenCaptureActive: false,
    faceRecognitionActive: true,
    musicAnalyzerActive: false,
    fpsCap: 60,
    multimodalFps: 0
  }
};

export const useHardwarePipeline = (currentMode: NovaFunctionalMode, isCallActive: boolean) => {
  const profile = HARDWARE_PROFILES[currentMode] || HARDWARE_PROFILES.assistant;
  
  const screenCapture = useScreenCapture();
  const musicAnalyzer = useMusicAnalyzer();

  // Control Automático de Captura de Pantalla
  useEffect(() => {
    if (isCallActive && profile.screenCaptureActive) {
      screenCapture.startScreenCapture();
    } else {
      screenCapture.stopScreenCapture();
    }
  }, [isCallActive, profile.screenCaptureActive]);

  // Control Automático del Analizador Musical FFT
  useEffect(() => {
    if (isCallActive && profile.musicAnalyzerActive) {
      musicAnalyzer.startListening();
    } else {
      musicAnalyzer.stopListening();
    }
  }, [isCallActive, profile.musicAnalyzerActive]);

  return {
    profile,
    screenCapture,
    musicAnalyzer
  };
};
