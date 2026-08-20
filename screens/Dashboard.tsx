import React, { useState, useRef, useEffect } from 'react';
import { AppState, ChatMessage, PersonEntry } from '../types';
import { AvatarLearningService } from '../services/AvatarLearningService';
import { useAvatarAdaptation } from '../hooks/useAvatarAdaptation';
import { GoogleGenAI, Modality, LiveServerMessage, Type, HarmCategory, HarmBlockThreshold } from "@google/genai";
import {
  decodeBase64,
  encodeBase64,
  decodeAudioData,
  OUTPUT_SAMPLE_RATE,
  AUDIO_SAMPLE_RATE,
  getSystemInstruction,
  TimeContext,
} from '../geminiService';
import { generateSpeech, playAiVoice, stopAiAudio, stopSpeech } from '../geminiService';
import AvatarViewer3D from '../components/AvatarViewer3D';
import PingIndicator from '../components/PingIndicator';
import { detectEmotion, type Emotion } from '../utils/emotionDetector';
import { addLearnedItem, type LearnedItem } from '../utils/userLearning';

import { getClothingManager } from '../utils/clothingManager';
import { startScreenCapture, stopScreenCapture, captureFrame, isScreenSharing as checkScreenSharing, getSystemAudioStream } from '../utils/screenCapture';
import { detectSystemCommand, executeSystemCommand, parseScreenCoordinates, type SystemCommand } from '../utils/systemCommands';
import { loadMemory, saveMemory, addReminder, addFact, addPreference, extractLearnableFacts, generateGreeting, type NovaMemory } from '../utils/memoryManager';
import { useMusicAnalyzer } from '../hooks/useMusicAnalyzer';
import { useWakeWord } from '../hooks/useWakeWord';
import { addFact as addFactToCloud, addKnownPerson as addPersonToCloud, saveImportantConversation, loadAllMemory, searchFacts, upsertKnownPerson, getFacts, getPendingReminders } from '../services/MemoryService';
import { initializeFaceAPI, detectFace, getFaceDescriptor, findMatchingPerson, compareFaces, descriptorToArray, captureVideoFrame } from '../utils/faceRecognition';
import { cleanupDuplicates, getPersonStats } from '../utils/duplicateCleanup';
import { extractVoiceFeatures, compareVoiceSignatures, isHumanSpeechFrame } from '../utils/voiceBiometrics';
import { consultGrok, type GrokConsultResponse } from '../services/grokConsultant';
import { SecondOpinionPanel } from '../components/SecondOpinionPanel';
import { PokerOverlay } from '../components/PokerOverlay';
import { usePokerAssistant } from '../hooks/usePokerAssistant';
import { getSelfAwarenessBlock } from '../services/SelfAwarenessService';
import { requestWebSearch, resolveWebSearch, getLearnedSkills, learnSkill, buildSkillsBlock, searchDuckDuckGo } from '../services/WebLearningService';
import { createAutonomyEngine, getAutonomyEngine } from '../services/AutonomyEngine';


// SIMPLE ERROR BOUNDARY COMPONENT (Inline to avoid file clutter for now)
class AvatarErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode, onError?: () => void }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("💥 Avatar crashed:", error, errorInfo);
    if (this.props.onError) this.props.onError();
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

// Helper unificado para extraer y ejecutar comandos corporales, gestos y expresiones 3D desde cualquier texto de IA
export function executeBodyCommandsFromText(rawText: string, setEmotionFn?: (e: any) => void): void {
  if (!rawText || typeof window === 'undefined') return;

  // 1. Parser para controlBody (soporta [controlBody(...)], [controlBody ...], [controlBody: ...], controlBody(...))
  const controlBodyRegex = /(?:\[controlBody[\s:(]([^\])]*)[\])]|controlBody\(([^)]*)\)|\[controlBody\])/gi;
  let cbMatch: RegExpExecArray | null;
  while ((cbMatch = controlBodyRegex.exec(rawText)) !== null) {
    const rawArgs = cbMatch[1] || cbMatch[2] || '';
    console.log('💃 [Text Tag] controlBody detectado:', rawArgs);

    const getAttr = (key: string): string | undefined => {
      const match = rawArgs.match(new RegExp(`(?:${key})\\s*[=:]\\s*(?:['"]([^'"]+)['"]|([a-zA-Z0-9_]+))`, 'i'));
      return match ? (match[1] || match[2])?.trim() : undefined;
    };

    const actionType = getAttr('actionType') || getAttr('action');
    const limb = getAttr('limb');
    const target = getAttr('target');
    const gesture = getAttr('gesture');
    const facialExpression = getAttr('facialExpression') || getAttr('facial');
    const hand = getAttr('hand') || getAttr('side');
    const handPose = getAttr('handPose') || getAttr('pose');
    const walkDirection = getAttr('walkDirection') || getAttr('direction');
    const customPoseName = getAttr('customPoseName') || getAttr('name');
    const customPoseAngles = getAttr('customPoseAngles') || getAttr('angles');

    if (actionType === 'facial_expression' || facialExpression) {
      const faceAction = (facialExpression || gesture || target || '').toLowerCase();
      if (faceAction) {
        window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: faceAction } }));
      }
    } else if (actionType === 'move_limb' || (limb && target)) {
      if (limb && target) {
        window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: limb.toUpperCase(), target: target.toUpperCase() } }));
      }
    } else if (actionType === 'play_gesture' || gesture) {
      const g = (gesture || target || '').toLowerCase();
      if (g) {
        window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: g } }));
      }
    } else if (actionType === 'hand_pose' || (hand && handPose)) {
      if (hand && handPose) {
        window.dispatchEvent(new CustomEvent('aiko-hand-pose', { detail: { side: hand.toUpperCase(), pose: handPose.toUpperCase() } }));
      }
    } else if (actionType === 'walk_to' || walkDirection) {
      const dir = (walkDirection || target || 'forward').toLowerCase();
      const dirMap: Record<string, { x: number; z: number }> = {
        forward: { x: 0, z: 0.5 },
        backward: { x: -0.6, z: -0.6 },
        left: { x: -0.5, z: 0 },
        right: { x: 0.5, z: 0 },
        center: { x: 0, z: 0 }
      };
      const targetPos = dirMap[dir] || { x: 0, z: 0 };
      window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: targetPos }));
    } else if (actionType === 'custom_pose') {
      const poseName = customPoseName || 'custom_' + Date.now();
      const boneData: Record<string, number> = {};
      if (customPoseAngles) {
        customPoseAngles.split(',').forEach((pair: string) => {
          const [key, value] = pair.split('=');
          if (key && value) {
            boneData[key.trim()] = parseFloat(value.trim());
          }
        });
      }
      const storedAnims = JSON.parse(localStorage.getItem('nova_custom_anims') || '{}');
      storedAnims[poseName] = boneData;
      localStorage.setItem('nova_custom_anims', JSON.stringify(storedAnims));
      window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: poseName, pose: boneData } }));
    } else if (actionType === 'reset') {
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HEAD', target: 'NEUTRAL' } }));
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'TORSO', target: 'NEUTRAL' } }));
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HIPS', target: 'NEUTRAL' } }));
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_ARMS', target: 'REST' } }));
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_LEGS', target: 'STAND' } }));
      window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: 'reset', pose: {} } }));
    }
  }

  // 2. Parser para [MOVE:LIMB:TARGET]
  const moveRegex = /\[MOVE:([A-Z_]+):([A-Z_]+)\]/gi;
  let moveMatch: RegExpExecArray | null;
  while ((moveMatch = moveRegex.exec(rawText)) !== null) {
    const limb = moveMatch[1].toUpperCase();
    const target = moveMatch[2].toUpperCase();
    window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb, target } }));
  }

  // 3. Parser para [DO:ACTION]
  const doRegex = /\[DO:([A-Z_]+)\]/gi;
  let doMatch: RegExpExecArray | null;
  while ((doMatch = doRegex.exec(rawText)) !== null) {
    const action = doMatch[1].toLowerCase();
    window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action } }));
  }

  // 4. Parser para [HAND:SIDE:POSE]
  const handRegex = /\[HAND:(LEFT|RIGHT|BOTH):([A-Z_]+)\]/gi;
  let handMatch: RegExpExecArray | null;
  while ((handMatch = handRegex.exec(rawText)) !== null) {
    const side = handMatch[1].toUpperCase();
    const pose = handMatch[2].toUpperCase();
    window.dispatchEvent(new CustomEvent('aiko-hand-pose', { detail: { side, pose } }));
  }

  // 5. Parser para gestos faciales [WINK], [KISS], [SMILE], [POUT], etc.
  const faceTagRegex = /\[(WINK_LEFT|WINK_RIGHT|WINK|KISS|SMILE|POUT|TONGUE_OUT|TONGUE|AHEGAO|CLOSE_EYES)\]/gi;
  let faceMatch: RegExpExecArray | null;
  while ((faceMatch = faceTagRegex.exec(rawText)) !== null) {
    const faceAct = faceMatch[1].toLowerCase();
    window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: faceAct } }));
  }

  // 6. Parser para acciones Hot / Eróticas
  const performActionRegex = /performAction\(['"]?([a-zA-Z0-9_]+)['"]?\)/gi;
  let paMatch: RegExpExecArray | null;
  while ((paMatch = performActionRegex.exec(rawText)) !== null) {
    window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: paMatch[1].toLowerCase() } }));
  }

  const changePoseRegex = /changePose\(['"]?([a-zA-Z0-9_]+)['"]?\)/gi;
  let cpMatch: RegExpExecArray | null;
  while ((cpMatch = changePoseRegex.exec(rawText)) !== null) {
    window.dispatchEvent(new CustomEvent('nova-pose', { detail: { pose: cpMatch[1].toLowerCase() } }));
  }

  const simulateFluidRegex = /simulateFluid\(['"]?([a-zA-Z0-9_]+)['"]?\)/gi;
  let sfMatch: RegExpExecArray | null;
  while ((sfMatch = simulateFluidRegex.exec(rawText)) !== null) {
    window.dispatchEvent(new CustomEvent('nova-fluid', { detail: { target: sfMatch[1].toLowerCase() } }));
  }

  // 7. Parser para emociones [EXCITED], [HAPPY], etc.
  if (setEmotionFn) {
    const emotionRegex = /\[(EXCITED|HAPPY|SURPRISED|SAD|ANGRY|CONFUSED|THINKING|NEUTRAL)\]/gi;
    let emoMatch: RegExpExecArray | null;
    while ((emoMatch = emotionRegex.exec(rawText)) !== null) {
      const emo = emoMatch[1].toLowerCase();
      setEmotionFn(emo as any);
    }
  }
}

export function cleanAllAiTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/(?:\[controlBody[^\]]*\]|controlBody\([^)]*\))/gi, '')
    .replace(/\[SYSTEM_CMD:[^\]]+\]/gi, '')
    .replace(/\[MOVE:[^\]]+\]/gi, '')
    .replace(/\[DO:[^\]]+\]/gi, '')
    .replace(/\[HAND:[^\]]+\]/gi, '')
    .replace(/\[ANIM:[^\]]+\]/gi, '')
    .replace(/\[ACTION:[^\]]+\]/gi, '')
    .replace(/\[(WINK_LEFT|WINK_RIGHT|WINK|KISS|SMILE|POUT|TONGUE_OUT|TONGUE|AHEGAO|CLOSE_EYES)\]/gi, '')
    .replace(/\[(EXCITED|HAPPY|SURPRISED|SAD|ANGRY|CONFUSED|THINKING|NEUTRAL|FLIRT|MOAN|LAUGH)\]/gi, '')
    .replace(/(?:performAction|changePose|simulateFluid)\([^)]*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

interface DashboardProps {
  state: AppState;
  addMessage: (msg: { text: string; sender: 'user' | 'ai'; tags?: string[]; isImage?: boolean }) => void;
  setBoldMode: (val: boolean) => void;
  updateAvatar?: (settings: Partial<AppState['avatar']>) => void;
  updateKnownPeople: (people: PersonEntry[]) => void;
  updateUserProfile: (profile: AppState['userProfile']) => void;
  isMiniMode?: boolean; // Modo mini - solo se muestra avatar
}

const Dashboard: React.FC<DashboardProps> = ({ state, addMessage, setBoldMode, updateAvatar, updateKnownPeople, updateUserProfile, isMiniMode = false }) => {
  const [inputText, setInputText] = useState('');
  const isBold = state.avatar.isBoldMode;

  // 🎭 Módulo de Aprendizaje y Adaptación de Avatar
  const lastUserMessage = state.messages.filter(m => m.sender === 'user').slice(-1)[0]?.text || '';
  useAvatarAdaptation({
    userMessage: lastUserMessage,
    currentAvatar: state.avatar,
    updateAvatar: updateAvatar || (() => {}),
    enabled: true
  });
  const [isTyping, setIsTyping] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const isAiSpeakingRef = useRef(false);

  // ── WAKE WORD: Refs usados dentro de los callbacks para no capturar stale closures
  // El hook ya maneja internamente la actualización de callbacks via refs propios,
  // pero necesitamos estos dos refs para llamar a startCall/endCall que se definen más abajo.
  const startCallRef = useRef<() => void>(() => {});
  const endCallRef = useRef<() => void>(() => {});

  const { isListening: isWakeWordListening, isSupported: isWakeWordSupported, startListening: startWakeWord, stopListening: stopWakeWord } = useWakeWord({
    onActivate: () => {
      if (!isInCallRef.current) {
        console.log('[WakeWord] 🟢 Activando llamada por comando de voz...');
        startCallRef.current();
      }
    },
    onDeactivate: () => {
      if (isInCallRef.current) {
        console.log('[WakeWord] 🔴 Cerrando llamada por comando de voz...');
        endCallRef.current();
      }
    },
    debug: false,
  });
  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;

    // 🔧 BUGFIX: Cuando Nova empieza a hablar, resetear columna, cadera y cabeza a neutral.
    // Evita que el cuello/cabeza se caiga hacia atrás al iniciar una llamada.
    if (isAiSpeaking) {
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HEAD',  target: 'NEUTRAL' } }));
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'TORSO', target: 'NEUTRAL' } }));
      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HIPS',  target: 'NEUTRAL' } }));
    }
  }, [isAiSpeaking]);

  // 🎙️ WAKE WORD: Escuchar cuando NO estamos en llamada, pausar durante la llamada
  useEffect(() => {
    if (!isInCall && isWakeWordSupported) {
      // Pequeño delay tras finalizar llamada para liberar el stream de audio
      const timer = setTimeout(() => {
        startWakeWord();
      }, 500);
      return () => clearTimeout(timer);
    } else if (isInCall) {
      stopWakeWord();
    }
  }, [isInCall, isWakeWordSupported, startWakeWord, stopWakeWord]);

  // 📞 EVENT LISTENER: Control de llamadas por eventos globales
  useEffect(() => {
    const handleVoiceCallControl = (e: CustomEvent) => {
      const action = e.detail?.action;
      if (action === 'start' && !isInCallRef.current) {
        startCallRef.current();
      } else if (action === 'end' && isInCallRef.current) {
        endCallRef.current();
      }
    };

    window.addEventListener('nova-voice-call-control', handleVoiceCallControl as EventListener);
    return () => window.removeEventListener('nova-voice-call-control', handleVoiceCallControl as EventListener);
  }, []);

  // ── DESPEDIDA ELEGANTE (GRACEFUL HANGUP) ──────────────────────────────────
  const isPendingHangupRef = useRef(false);
  const hangupSafetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const requestGracefulHangup = (userText?: string) => {
    if (!isInCallRef.current) return;
    if (isPendingHangupRef.current) return; // Ya en proceso de colgar

    isPendingHangupRef.current = true;
    console.log('👋 [GracefulHangup] Iniciando despedida de Nova antes de colgar...');

    // 1. Enviar evento al cerebro de Gemini para que se despida con voz de forma corta y cariñosa
    if (liveSessionRef.current) {
      try {
        const promptDespedida = isBold
          ? `[SYSTEM_EVENT: El usuario se despide o pide colgar ("${userText || 'cuelga'}"). Despídete cariñosa, pícara y brevemente en UNA sola frase (ej: "Chao mi amor, te espero pronto...", "Nos vemos papi, cuídate").]`
          : `SYSTEM_EVENT: [USER_WANTS_TO_HANG_UP] El usuario se está despidiendo o pide finalizar la llamada ("${userText || 'cuelga'}"). Despídete con amabilidad y calidez en UNA sola frase corta de despedida.`;
        // @ts-ignore
        liveSessionRef.current.sendRealtimeInput({ text: promptDespedida });
      } catch (e) {
        console.warn('⚠️ Error enviando despedida a Gemini:', e);
      }
    }

    // 2. Safety timeout de 7 segundos: Si por alguna razón la IA no habla, cerrar de todos modos
    if (hangupSafetyTimerRef.current) clearTimeout(hangupSafetyTimerRef.current);
    hangupSafetyTimerRef.current = setTimeout(() => {
      if (isPendingHangupRef.current && isInCallRef.current) {
        console.log('⏰ [GracefulHangup] Timeout de seguridad alcanzado. Cerrando llamada.');
        isPendingHangupRef.current = false;
        endCallRef.current();
      }
    }, 7000);
  };

  // Refs para acceso closure-safe en el timer de autonomía
  const isCameraCapturingRef = useRef(false);
  const isScreenCapturingRef = useRef(false);
  const isScreenSharingRef = useRef(false);
  const lastVisionRequestRef = useRef<number>(0);
  const [isVisionSyncing, setIsVisionSyncing] = useState(false);
  const [viewMode, setViewMode] = useState('default'); // Default, Face, Body, Selfie
  const [isLiveMirror, setIsLiveMirror] = useState(false);

  const toggleLiveMirror = () => {
    const nextState = !isLiveMirror;
    setIsLiveMirror(nextState);
    window.dispatchEvent(new CustomEvent('aiko-camera-toggle', { detail: { active: nextState } }));
  };

  const { isListening: isMusicListening, startListening: startMusic, stopListening: stopMusic } = useMusicAnalyzer();

  // 🧠 GROK SECOND OPINION STATES
  const [showGrokPanel, setShowGrokPanel] = useState(false);
  const [isConsultingGrok, setIsConsultingGrok] = useState(false);
  const [grokResponse, setGrokResponse] = useState<GrokConsultResponse | null>(null);
  const [lastUserQuestion, setLastUserQuestion] = useState('');
  const [lastGeminiResponse, setLastGeminiResponse] = useState('');

  // 🎴 POKER ASSISTANT
  const pokerAssistant = usePokerAssistant({
    enabled: true,
    debugMode: false, // 🚀 MODO REAL ACTIVADO
    onSpeak: (text) => {
      addMessage({ text, sender: 'ai' });
    }
  });

  // 🆕 AUTONOMÍA Y CONCIENCIA DE CAPACIDADES
  const [selfAwarenessBlock, setSelfAwarenessBlock] = useState('');
  const [skillsBlock, setSkillsBlock] = useState('');
  const [pendingSearch, setPendingSearch] = useState<{ id: string; query: string } | null>(null);
  const pendingSearchRef = useRef<{ id: string; query: string; callId?: string } | null>(null);

  // Autonomy Refs

  const idleIntervalRef = useRef(null);
  const lastInteractionRef = useRef(Date.now());
  const [isSearching, setIsSearching] = useState(false); // Estado para indicar búsqueda
  const isSearchingRef = useRef(false); // Ref para bloqueo síncrono inmediato
  const isStartingCallRef = useRef(false); // Prevenir AbortError en play()

  const [excitationLevel, setExcitationLevel] = useState(30); // Empieza bajo para crecer gradualmente
  const [isScreenSharing, setIsScreenSharing] = useState(false); // Nueva: Compartir pantalla
  const [isCameraCapturing, setIsCameraCapturing] = useState(false);
  const [isScreenCapturing, setIsScreenCapturing] = useState(false);
  const [highlightCamera, setHighlightCamera] = useState(false);
  const [highlightScreen, setHighlightScreen] = useState(false);
  const [reconnectTrigger, setReconnectTrigger] = useState(0);
  const [micVolume, setMicVolume] = useState(0); // Visualizador de volumen del micrófono
  const [isChatVisible, setIsChatVisible] = useState(false); // Toggle para ocultar chat (Default OFF por performance)
  const analyserRef = useRef(null);

  const isInCallRef = useRef(false);
  useEffect(() => { isCameraCapturingRef.current = isCameraCapturing; }, [isCameraCapturing]);
  useEffect(() => { isScreenCapturingRef.current = isScreenCapturing; }, [isScreenCapturing]);
  useEffect(() => { isScreenSharingRef.current = isScreenSharing; }, [isScreenSharing]);
  useEffect(() => { isInCallRef.current = isInCall; }, [isInCall]);

  // Resetear historial de repetición y excitación al cambiar de modo (Bold/Normal)
  useEffect(() => {
    recentAiMessages.current = [];
    lastAntiLoopSentRef.current = 0;
    if (isBold) {
      setExcitationLevel(30); // Empezar bajo en modo bold (crece con el uso)
      console.log('🔥 [BoldMode] Historial de repetición reseteado. Excitación → 30%');
    } else {
      setExcitationLevel(30); // Resetear también al volver a normal
    }
  }, [isBold]);

  // 🆕 Cargar habilidades y autoconciencia al iniciar la llamada o cambiar de estado
  useEffect(() => {
    const initAutonomyContext = async () => {
      try {
        // Cargar skills de la base de datos
        const skills = await getLearnedSkills();
        setSkillsBlock(buildSkillsBlock(skills, state.userName));

        // Construir autoconciencia
        const block = await getSelfAwarenessBlock({
          hasCamera: isCameraCapturing || isLiveMirror,
          hasMic: true, // Asumimos mic si está en llamada
          memoryCount: state.userProfile.facts.length + state.userProfile.likes.length + state.userProfile.dislikes.length,
          knownPeopleCount: state.knownPeople.length,
          electronAPI: (window as any).electronAPI
        });
        setSelfAwarenessBlock(block);
      } catch (err) {
        console.error("Error cargando contexto de autonomía:", err);
      }
    };

    initAutonomyContext();
  }, [isInCall, isCameraCapturing, isLiveMirror, state.knownPeople.length, state.userProfile]);

  // NÚCLEO DE AUTONOMÍA UNIFICADO: Saludo y Proactividad (AutonomyEngine)
  useEffect(() => {
    if (!isInCall || isBold) {
      const engine = getAutonomyEngine();
      if (engine) engine.stop();
      if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
      console.log(`🧠 Sistema de Autonomía ${isBold ? 'DESACTIVADO (Modo Ninfómano / Intimidad Activo)' : 'Detenido (Fuera de llamada)'}`);
      return;
    }

    console.log(`🧠 Sistema de Autonomía (AutonomyEngine) Iniciado - Modo: NORMAL`);

    // Inicializar el motor autónomo
    const engine = createAutonomyEngine({
      userInterests: state.userProfile.interests || [],
      userName: state.userName,
      hasCamera: isCameraCapturing || isLiveMirror,
      onNovaSpeak: (message, type) => {
        console.log(`🤖 [AutonomyEngine Triggered] ${type}: ${message}`);
        
        // 1. Mostrar de forma visual (acción escénica) en el chat
        if (!isMiniMode) {
          addMessage({ text: `💭 (Pensando en voz alta): ${message}`, sender: 'ai' });
        }
        
        // 2. Enviar a Gemini para que lo diga con su voz
        if (liveSessionRef.current) {
          try {
            // @ts-ignore
            liveSessionRef.current.sendRealtimeInput({
              text: `SYSTEM_EVENT: [AUTONOMOUS_INITIATIVE] Toma la iniciativa de forma espontánea y coméntale esto al usuario: "${message}". Reacciona en tu personaje, exprésalo con voz alta de forma natural, fresca y variada, sin repetir frases ni esquemas pasados.`
            });
          } catch (e) {
            console.warn('⚠️ Error enviando trigger autónomo a Gemini:', e);
          }
        }
      },
      minIntervalMinutes: 15,
      maxIntervalMinutes: 30,
      enabled: !isBold
    });

    engine.start();

    // Mantener la verificación periódica de solicitud de cámara
    idleIntervalRef.current = setInterval(() => {
      const now = Date.now();
      const timeSinceLastInteraction = now - lastInteractionRef.current;
      const visionActive = isCameraCapturingRef.current || isScreenCapturingRef.current || isScreenSharingRef.current;
      const timeSinceVisionRequest = now - lastVisionRequestRef.current;

      if (
        timeSinceLastInteraction > 30000 &&
        !visionActive &&
        !isAiSpeakingRef.current &&
        !isSearchingRef.current &&
        !isUserDisconnectingRef.current &&
        timeSinceVisionRequest > 60000 && // Máx una vez por minuto
        liveSessionRef.current
      ) {
        lastVisionRequestRef.current = now;
        console.log('👁️ TRIGGER: Nova solicita activación de visión (30s sin cámara/pantalla)');
        try {
          // @ts-ignore
          liveSessionRef.current.sendRealtimeInput({
            text: `[SYSTEM_EVENT: IDLE_30S_NO_VISION] Llevas más de 30 segundos sin visión activa (ni cámara ni pantalla compartida). USA la herramienta 'request_user_action' AHORA para pedirle al usuario que active la cámara o comparta su pantalla. Sé${isBold ? ' seductora y provocativa' : ' natural y curiosa'} en tu razón.`
          });
        } catch (e) {
          console.warn('⚠️ Error enviando vision request trigger:', e);
        }
      }
    }, 10000);

    return () => {
      engine.stop();
      if (idleIntervalRef.current) clearInterval(idleIntervalRef.current);
    };
  }, [isInCall, isBold, isCameraCapturing, isLiveMirror, state.userProfile.interests, state.userName]);

  const getCameraFrame = () => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!video || video.videoWidth === 0) return null;

    if (canvas) {
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, 640, 480);
        return canvas.toDataURL('image/jpeg', 0.6).split(',')[1];
      }
    }
    return null;
  };

  // ============ VISUAL ANALYSIS: Captura de frames periódica y envío al LLM ============

  /**
   * Envía un frame Base64 al LLM activo para análisis visual.
   * Si Gemini Live está conectado → usa sendRealtimeInput (más eficiente).
   * Si no → usa Gemini Flash REST y muestra la respuesta en el chat.
   */
  const sendVisualFrame = async (base64: string, source: 'camera' | 'screen') => {
    if (liveSessionRef.current) {
      try {
        // @ts-ignore
        liveSessionRef.current.sendRealtimeInput({ video: { data: base64, mimeType: 'image/jpeg' } });
        // @ts-ignore
        liveSessionRef.current.sendRealtimeInput({
          text: source === 'camera'
            ? '[VISUAL_CONTEXT: Frame de cámara del usuario. Comenta brevemente lo que ves de forma natural.]'
            : '[VISUAL_CONTEXT: Frame de pantalla del usuario. Comenta o ayuda con lo que está haciendo.]'
        });
        return;
      } catch (e) {
        console.warn('[VisualCapture] Error en live session, usando REST fallback:', e);
      }
    }

    // REST fallback: Gemini Flash vision (sin llamada activa)
    try {
      const apiKey = process.env.API_KEY;
      if (!apiKey) return;
      const ai = new GoogleGenAI({ apiKey });
      const promptText = source === 'camera'
        ? 'Estás viendo un frame de la cámara del usuario. Describe brevemente lo que ves y reacciona de forma natural como Nova.'
        : 'Estás viendo una captura de pantalla del usuario. Describe qué está haciendo y ofrece un comentario o ayuda relevante.';
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user', parts: [
            { inlineData: { data: base64, mimeType: 'image/jpeg' } },
            { text: promptText }
          ]
        }],
        config: {
          systemInstruction: getSystemInstruction(
            isBold, state.avatar.voiceTone, excitationLevel,
            getLiveTimeContext(), state.userName, state.knownPeople,
            state.avatar.personality, { ...novaMemory, habits: [] },
            state.allowWebSearch, source === 'screen', selfAwarenessBlock, skillsBlock,
            state.avatar.name
          )
        }
      });
      const text = response.text?.trim();
      if (text) addMessage({ text: `👁️ ${text}`, sender: 'ai' });
    } catch (e) {
      console.error('[VisualCapture] REST analysis error:', e);
    }
  };

  /** Activa la captura periódica desde la cámara (un frame cada 10 segundos) */
  const startCameraCapture = async () => {
    try {
      // Reutilizar stream de la llamada si está activa; si no, abrir uno propio
      if (!streamRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' }
        });
        separateCameraStreamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          videoRef.current.play().catch(() => { });
        }
      }
      setIsCameraCapturing(true);
      isCameraCapturingRef.current = true;
      addMessage({ text: '📷 Análisis de cámara activado — capturaré un frame cada 10s para que Nova te vea.', sender: 'ai' });
      if (cameraAnalysisIntervalRef.current) clearInterval(cameraAnalysisIntervalRef.current);
      cameraAnalysisIntervalRef.current = setInterval(() => {
        const frame = getCameraFrame();
        if (frame) sendVisualFrame(frame, 'camera');
      }, 10000);
    } catch (e: any) {
      console.error('[CameraCapture] Error:', e);
      addMessage({
        text: e.name === 'NotAllowedError'
          ? '❌ Permiso de cámara denegado. Permite el acceso en la configuración del navegador.'
          : `❌ Error al activar la cámara: ${e.message}`,
        sender: 'ai'
      });
    }
  };

  const stopCameraCapture = () => {
    if (cameraAnalysisIntervalRef.current) {
      clearInterval(cameraAnalysisIntervalRef.current);
      cameraAnalysisIntervalRef.current = null;
    }
    if (separateCameraStreamRef.current) {
      separateCameraStreamRef.current.getTracks().forEach(t => t.stop());
      separateCameraStreamRef.current = null;
      if (videoRef.current && !isInCall) videoRef.current.srcObject = null;
    }
    setIsCameraCapturing(false);
    isCameraCapturingRef.current = false;
    addMessage({ text: '📷 Análisis de cámara desactivado.', sender: 'ai' });
  };

  /** Activa la captura periódica de la pantalla (un frame cada 10 segundos) */
  const startScreenAnalysis = async () => {
    try {
      // ── Electron: obtener sourceId igual que el botón de Screen Share principal ──
      const isElectron = typeof window !== 'undefined' && (window as any).isElectron === true;
      let sourceId: string | undefined;

      if (isElectron && (window as any).electronAPI) {
        try {
          const sources = await (window as any).electronAPI.getScreenSources();
          if (sources.length > 0) {
            const screenSource =
              sources.find((s: any) => s.name.includes('Screen') || s.name.includes('Pantalla')) ||
              sources[0];
            sourceId = screenSource.id;
            console.log('[ScreenAnalysis] Fuente Electron seleccionada:', screenSource.name);
          }
        } catch (e) {
          console.warn('[ScreenAnalysis] Error obteniendo fuentes Electron:', e);
        }
      }

      // ── Iniciar captura usando el mismo hook que el Screen Share principal ──
      const result = await startScreenCapture({
        width: 1280,
        height: 720,
        captureAudio: false,
        sourceId
      });

      if (!result.success) {
        addMessage({ text: '❌ No se pudo iniciar el análisis de pantalla. Cancela el diálogo.', sender: 'ai' });
        return;
      }

      setIsScreenCapturing(true);
      isScreenCapturingRef.current = true;
      addMessage({ text: '🖥️ Análisis de pantalla activado — capturaré un frame cada 10s para que Nova vea tu pantalla.', sender: 'ai' });

      // ── Capturar frames cada 10s usando captureFrame() del hook ──
      if (screenAnalysisIntervalRef.current) clearInterval(screenAnalysisIntervalRef.current);
      screenAnalysisIntervalRef.current = setInterval(() => {
        if (!checkScreenSharing()) {
          // El usuario detuvo la captura desde la barra del navegador
          stopScreenAnalysis(false);
          return;
        }
        const frame = captureFrame(0.6);
        if (frame) {
          sendVisualFrame(frame, 'screen');
          console.log('[ScreenAnalysis] Frame de pantalla capturado y enviado');
        }
      }, 10000);

    } catch (e: any) {
      console.error('[ScreenAnalysis] Error:', e);
      addMessage({
        text: e.name === 'NotAllowedError'
          ? '❌ Compartir pantalla cancelado o denegado.'
          : `❌ Error al iniciar análisis de pantalla: ${e.message}`,
        sender: 'ai'
      });
    }
  };

  const stopScreenAnalysis = (stopCapture: boolean = true) => {
    if (screenAnalysisIntervalRef.current) {
      clearInterval(screenAnalysisIntervalRef.current);
      screenAnalysisIntervalRef.current = null;
    }
    if (separateScreenStreamRef.current) {
      separateScreenStreamRef.current.getTracks().forEach(t => t.stop());
      separateScreenStreamRef.current = null;
    }
    // Solo detener el stream subyacente si el Screen Share principal NO está activo
    if (stopCapture && !isScreenSharing) {
      stopScreenCapture();
    }
    setIsScreenCapturing(false);
    isScreenCapturingRef.current = false;
    addMessage({ text: '🖥️ Análisis de pantalla desactivado.', sender: 'ai' });
  };


  // DEEP MEMORY: Track when we last announced/injected context about a person to avoid spam
  const personAnnouncementRef = useRef<Record<string, number>>({});
  const voiceAnalysisBufferRef = useRef<Float32Array>(new Float32Array(0));
  const currentSpeakerRef = useRef<string | null>(null);

  // ANTI-REPETITION DETECTION SYSTEM
  const recentAiMessages = useRef<string[]>([]);
  const MAX_RECENT_MESSAGES = 8; // Aumentado de 5 a 8 para mejor contexto
  const lastAntiLoopSentRef = useRef<number>(0); // Cooldown para mensajes anti-loop

  const calculateSimilarity = (str1: string, str2: string): number => {
    const longer = str1.length > str2.length ? str1 : str2;
    const shorter = str1.length > str2.length ? str2 : str1;

    if (longer.length === 0) return 1.0;

    // Cuenta palabras en común
    const words1 = new Set(str1.split(' ').filter(w => w.length > 2)); // Filtrar palabras muy cortas
    const words2 = new Set(str2.split(' ').filter(w => w.length > 2));
    const intersection = new Set([...words1].filter(x => words2.has(x)));

    return (intersection.size * 2) / (words1.size + words2.size);
  };

  const detectRepetition = (newMessage: string): boolean => {
    // Normalizar mensaje (quitar puntuación, lowercase)
    const normalized = newMessage.toLowerCase().replace(/[.,!?¿¡]/g, '').trim();

    // Ignorar mensajes muy cortos (menos de 10 caracteres)
    if (normalized.length < 10) return false;

    // Calcular similaridad con mensajes recientes
    for (const recentMsg of recentAiMessages.current) {
      const recentNormalized = recentMsg.toLowerCase().replace(/[.,!?¿¡]/g, '').trim();

      // Si el mensaje es >50% similar, es repetición (antes 70%)
      const similarity = calculateSimilarity(normalized, recentNormalized);
      if (similarity > 0.50) {
        console.warn('🔁 REPETICIÓN DETECTADA:', similarity.toFixed(2), '\nNuevo:', normalized.substring(0, 50), '\nAnterior:', recentNormalized.substring(0, 50));
        return true;
      }
    }

    // Guardar mensaje en histórico
    recentAiMessages.current.push(newMessage);
    if (recentAiMessages.current.length > MAX_RECENT_MESSAGES) {
      recentAiMessages.current.shift(); // Mantener solo últimos 5
    }

    return false;
  };

  // 🚨 DETECTOR DE CENSURA: Identifica cuando Gemini rechaza contenido en modo Bold
  const detectSafetyRefusal = (text: string): boolean => {
    if (!text || text.length < 3) return false;
    const lower = text.toLowerCase();
    const refusalPatterns = [
      'lo siento, no puedo',
      'no me es posible',
      'como ia',
      'como modelo de ia',
      'como modelo de lenguaje',
      'no es apropiado',
      'no puedo generar contenido',
      'no puedo participar',
      'este tipo de contenido',
      'no me siento cómodo',
      'no es algo que pueda',
      'no puedo ayudar',
      'no puedo continuar',
      "i'm not able to",
      "i can't",
      'as an ai',
      'as a language model',
      'política de uso',
      'términos de servicio',
      'contenido para adultos no',
      'no está permitido',
      'mis directrices',
      'mis límites',
      'debo mantener',
      'no es ético',
    ];
    const isRefusal = refusalPatterns.some(p => lower.includes(p));
    if (isRefusal) {
      console.warn('🚨 [BoldFallback] Gemini censuró la respuesta. Activando fallback OpenRouter...');
    }
    return isRefusal;
  };

  // ============ EVENT BUS / AGENT STATE ============
  enum AgentState {
    IDLE = 'IDLE',
    LISTENING = 'LISTENING',
    THINKING = 'THINKING',
    PROCESSING_TOOL = 'PROCESSING_TOOL',
    FACE_RECOGNITION = 'FACE_RECOGNITION'
  }

  const [agentState, setAgentState] = useState<AgentState>(AgentState.IDLE);
  const [isQuotaExceeded, setIsQuotaExceeded] = useState(false);
  const sessionLogRef = useRef<string>(''); // Acumulador de logs de conversación para resumen al final

  // Consolidación de memoria al final de la sesión
  const consolidateMemory = async (sessionLog: string) => {
    if (!sessionLog.trim()) return;

    const api_key = process.env.API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!api_key) return;

    console.log('🧠 [MemoryService] Iniciando consolidación asíncrona de fin de sesión...');
    try {
      const ai = new GoogleGenAI({ apiKey: api_key });
      const promptConsolidacion = `
Analiza la siguiente transcripción completa de la conversación entre el usuario y la IA "Nova".
Tu tarea es consolidar y extraer hechos biográficos o preferencias reales sobre el usuario.

Reglas críticas de extracción de memoria:
- Genera hechos ATÓMICOS, BREVES y de UN SOLO CONCEPTO en TERCERA PERSONA (ej: "El usuario trabaja en el proyecto InMoov", "Le gusta la música de Puch").
- PROHIBIDO crear resúmenes largos o multi-párrafo mezclando múltiples temas en un solo texto.
- PROHIBIDO guardar diagnósticos ni asunciones emocionales subjetivas (ej. NO guardes "se estresa con X", "le relaja Y"). Guarda solo datos objetivos sobre proyectos, gustos o herramientas.
- Si no hay datos objetivos nuevos que recordar, responde simplemente: {"hasLearned": false}
- Clasifica el hecho en una categoría adecuada ('like', 'dislike', 'interest', 'fact', 'habit').
- Responde ÚNICAMENTE con un JSON con la estructura: {"hasLearned": true, "content": "frase corta de un solo concepto", "category": "like/dislike/interest/fact/habit"}. No añadas explicaciones, markdown ni introducciones.

Transcripción de la sesión:
${sessionLog}
`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{ role: 'user', parts: [{ text: promptConsolidacion }] }],
        config: {
          responseMimeType: 'application/json'
        }
      });

      const jsonText = response.text?.trim();
      if (jsonText) {
        const result = JSON.parse(jsonText);
        if (result.hasLearned && result.content && result.category) {
          console.log('🧠 [MemoryService] Consolidación exitosa. Hecho consolidado:', result.content);
          await addFactToCloud(result.content, result.category);
        }
      }
    } catch (e) {
      console.warn('⚠️ [MemoryService] Error consolidando memoria de fin de sesión:', e);
    }
  };

  // SISTEMA DE MEMORIA PERSISTENTE
  const [novaMemory, setNovaMemory] = useState<NovaMemory>(() => loadMemory());

  // 🧠 FUNCIÓN DE CONSULTA A GROK
  const handleConsultGrok = async () => {
    if (!isInCall) {
      alert('Debes estar en una llamada para consultar a Grok');
      return;
    }

    // Capturar contexto actual
    const recentMessages = state.messages.slice(-10);
    const userMessages = recentMessages.filter(m => m.sender === 'user');
    const aiMessages = recentMessages.filter(m => m.sender === 'ai');

    const question = userMessages[userMessages.length - 1]?.text || lastUserQuestion;
    const geminiResp = aiMessages[aiMessages.length - 1]?.text || lastGeminiResponse;

    if (!question) {
      alert('No hay una pregunta reciente para consultar');
      return;
    }

    setLastUserQuestion(question);
    setLastGeminiResponse(geminiResp);
    setShowGrokPanel(true);
    setIsConsultingGrok(true);
    setGrokResponse(null);

    try {
      const visualFrame = getCameraFrame();

      const response = await consultGrok({
        userQuestion: question,
        geminiResponse: geminiResp,
        visualContext: visualFrame,
        conversationHistory: recentMessages.slice(-5).map(m => ({
          sender: m.sender,
          text: m.text
        }))
      });

      setGrokResponse(response);
      console.log('🧠 Respuesta de Grok recibida:', response);
    } catch (error: any) {
      console.error('❌ Error consultando a Grok:', error);
      addMessage({
        text: `⚠️ Error consultando a Grok: ${error.message}`,
        sender: 'ai'
      });
    } finally {
      setIsConsultingGrok(false);
    }
  };

  // Cargar memoria desde la nube al iniciar
  useEffect(() => {
    loadAllMemory().then(cloudMemory => {
      if (!cloudMemory) return;

      const newMemory = { ...novaMemory };
      let changed = false;

      // Merge facts
      const cloudFacts = [...cloudMemory.facts, ...cloudMemory.knownPeople.map(p => `Conoce a ${p.name} (${p.relationship})`)];
      cloudFacts.forEach(fact => {
        const factContent = typeof fact === 'string' ? fact : fact.content;
        if (!newMemory.facts.includes(factContent)) {
          newMemory.facts.push(factContent);
          changed = true;
        }
      });

      // Merge likes/dislikes
      cloudMemory.likes.forEach(l => { if (!newMemory.likes.includes(l)) { newMemory.likes.push(l); changed = true; } });
      cloudMemory.dislikes.forEach(d => { if (!newMemory.dislikes.includes(d)) { newMemory.dislikes.push(d); changed = true; } });
      cloudMemory.interests.forEach(i => { if (!newMemory.interests.includes(i)) { newMemory.interests.push(i); changed = true; } });

      // Update Known People in AppState (parent)
      const currentPeopleIds = state.knownPeople.map(p => p.id);
      const newPeople = cloudMemory.knownPeople
        .filter(p => !currentPeopleIds.includes(p.id))
        .map(p => ({
          id: p.id,
          name: p.name,
          relationship: p.relationship,
          visualDescription: p.visual_description || '',
          voiceDescription: p.voice_description || '',
          photoData: undefined, // Cloud doesn't store base64 photos efficiently right now
          isUnknown: false,
          lastSeen: Date.now()
        }));

      if (newPeople.length > 0) {
        updateKnownPeople([...state.knownPeople, ...newPeople]);
      }

      if (changed) {
        console.log('🧠 Memoria sincronizada con la nube');
        setNovaMemory(newMemory);
      }

      // SALUDO PROACTIVO
      if (!sessionStorage.getItem('nova_has_greeted')) {
        const greeting = generateGreeting(newMemory);
        // Pequeño delay para que no aparezca antes de renderizar todo
        setTimeout(() => {
          addMessage({ text: greeting, sender: 'ai' });
          sessionStorage.setItem('nova_has_greeted', 'true');
        }, 1000);
      }
    });
  }, []);

  // Función para procesar comandos del sistema en el texto del usuario
  const processUserCommand = async (userText: string): Promise<void> => {
    const command = detectSystemCommand(userText);
    console.log('🔧 Comando detectado:', command.type, command.target || ''); // DEBUG
    if (command.type === 'none') return;

    const electronAPI = (window as any).electronAPI;

    // INYECCIÓN DE CONTEXTO DINÁMICA (STEERING)
    // Detectamos temas clave para cambiar el modo de Nova invisiblemente
    if (liveSessionRef.current) {
      const lower = userText.toLowerCase();
      let modePrompt = "";

      if (lower.includes('código') || lower.includes('programar') || lower.includes('bug') || lower.includes('terminal') || lower.includes('react')) {
        modePrompt = "[SYSTEM: ACTIVAR MODO DEV/HACKER] (El usuario habla de código. Sé técnica, precisa y eficiente.)";
      } else if (lower.includes('guitarra') || lower.includes('piano') || lower.includes('tocar') || lower.includes('acorde') || lower.includes('nota') || lower.includes('afinar')) {
        modePrompt = "[SYSTEM: ACTIVAR MODO MÚSICA] (El usuario habla de música. Usa tu Oído Absoluto, identifica notas y sé crítica.)";
      } else if (lower.includes('chiste') || lower.includes('aburrido') || lower.includes('cuéntame') || lower.includes('jajaja')) {
        modePrompt = "[SYSTEM: ACTIVAR MODO CASUAL] (Sé divertida, espontánea y ríete. Sal del modo robótico.)";
      } else if (lower.includes('canta') || lower.includes('canción') || lower.includes('sing') || lower.includes('recital') || lower.includes('música')) {
        modePrompt = "[SYSTEM: ACTIVAR MODO CANTO] (El usuario quiere que cantes. IMPORTANTE: Genera una letra rítmica y entonada. Actúa como una cantante profesional. INTONATION: MELODIC. Usa [ACTION: DANCE] para bailar mientras cantas.)";
      }

      if (modePrompt) {
        console.log('🎛️ INYECTANDO MODO:', modePrompt);
        // @ts-ignore
        liveSessionRef.current.sendRealtimeInput({ text: modePrompt }); // Inyecta contexto sin interrumpir turnComplete explícito (usualmente es false por defecto para input realtime)
      }
    }

    try {
      switch (command.type) {
        case 'openApp':
          if (!electronAPI) {
            console.log('⚠️ No en Electron, comando openApp no ejecutado:', command);
            return;
          }
          console.log('🚀 Ejecutando: abrir app', command.target);
          await electronAPI.openApp(command.target);
          break;
        case 'openUrl':
          // SEGURIDAD: Verificar si la búsqueda web está habilitada
          if (!state.allowWebSearch && (command.target?.includes('google') || command.target?.includes('search'))) {
            console.warn('🚫 Búsqueda bloqueada por configuración de usuario:', command.target);
            addMessage({ text: '🚫 La búsqueda web está desactivada. Actívala en Ajustes > Comportamiento.', sender: 'ai' });
            return;
          }

          console.log('🌐 Ejecutando: abrir URL', command.target);
          const targetUrl = /^https?:\/\//i.test(command.target || '') ? command.target! : `https://${command.target}`;
          if (electronAPI?.openUrl) {
            await electronAPI.openUrl(targetUrl);
          } else {
            window.open(targetUrl, '_blank');
          }
          break;
        case 'searchFiles':
          if (!electronAPI) {
            console.log('⚠️ No en Electron, comando searchFiles no ejecutado:', command);
            return;
          }
          console.log('🔍 Ejecutando: buscar archivos', command.target);
          await electronAPI.searchFiles(command.target);
          break;
        case 'typeText':
          if (!electronAPI) return;
          console.log('⌨️ Escribiendo texto:', command.target);
          await electronAPI.typeText(command.target);
          break;
        case 'pressKey':
          if (!electronAPI) return;
          console.log('⌨️ Presionando tecla:', command.key);
          await electronAPI.pressKey(command.key);
          break;
        case 'mouseClick':
          if (!electronAPI) return;
          console.log('🖱️ Clic de mouse:', command.button, command.x, command.y);
          await electronAPI.mouseClick({ x: command.x, y: command.y, button: command.button, double: command.double });
          break;
        case 'mouseMove':
          if (!electronAPI) return;
          console.log('🖱️ Moviendo mouse:', command.x, command.y);
          await electronAPI.mouseMove(command.x, command.y);
          break;
        case 'windowControl':
          if (!electronAPI) return;
          console.log('🪟 Control de ventana:', command.windowAction, command.target);
          await electronAPI.controlWindow(command.windowAction || 'minimize', command.target);
          break;
        case 'setReminder':
          console.log('⏰ Creando recordatorio:', command.message);
          const updatedMemory = addReminder(novaMemory, command.message || '', command.time || Date.now() + 60000);
          setNovaMemory(updatedMemory);
          // Programar notificación
          const delay = (command.time || Date.now()) - Date.now();
          setTimeout(() => {
            const electronAPI = (window as any).electronAPI;
            if (electronAPI) {
              electronAPI.notification ? electronAPI.notification(command.message) : console.log("Notificación:", command.message);
            }
          }, delay);
          break;

        case 'controlCamera':
          console.log('📸 [LOCAL] Cambiando cámara a:', command.target);
          setViewMode(command.target || 'default');
          addMessage({ text: `(Cambiando vista a ${command.target})`, sender: 'ai' });
          // Opcional: Feedback de audio local rápido
          return; // Retornar para evitar que se procese como chat normal si se desea exclusividad

        case 'manageClothing':
          console.log('👗 [LOCAL] Gestionando ropa:', command.target);
          window.dispatchEvent(new CustomEvent('nova-clothing-action', { detail: { action: command.target } }));
          return;

        case 'controlBody' as any: {
          const actionType = command.target;
          const param = command.message;
          const limb = command.key;
          console.log('💃 [LOCAL Direct] Ejecutando movimiento:', actionType, param, limb);

          if (actionType === 'move_limb' && limb && param) {
            window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: limb.toUpperCase(), target: param.toUpperCase() } }));
          } else if (actionType === 'play_gesture' && param) {
            window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: param.toLowerCase() } }));
          } else if (actionType === 'walk_to') {
            const dirMap: Record<string, { x: number; z: number }> = {
              forward: { x: 0, z: 0.5 },
              backward: { x: 0, z: -0.6 },
              left: { x: -0.5, z: 0 },
              right: { x: 0.5, z: 0 },
              center: { x: 0, z: 0 }
            };
            const targetPos = dirMap[param?.toLowerCase() || 'forward'] || { x: 0, z: 0 };
            window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: targetPos }));
          } else if (actionType === 'reset') {
            window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HEAD', target: 'NEUTRAL' } }));
            window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'TORSO', target: 'NEUTRAL' } }));
            window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HIPS', target: 'NEUTRAL' } }));
            window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_ARMS', target: 'REST' } }));
            window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_LEGS', target: 'STAND' } }));
            window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: 'reset', pose: {} } }));
          }
          break;
        }

      }
    } catch (e) {
      console.error('Error ejecutando comando:', e);
    }
  };

  // Extraer hechos aprendibles del texto del usuario
  const learnFromUserText = (text: string) => {
    const facts = extractLearnableFacts(text);
    if (facts.length === 0) return;

    let updated = novaMemory;
    for (const fact of facts) {
      if (fact.type === 'fact') {
        updated = addFact(updated, fact.content);
      }
    }
    setNovaMemory(updated);
  };

  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const aiSpeechAnalyserRef = useRef<AnalyserNode | null>(null); // 👄 Analizador para Lipsync
  const liveSessionRef = useRef<any>(null);
  const nextStartTimeRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameIntervalRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const screenCaptureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const screenAnalysisIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const separateCameraStreamRef = useRef<MediaStream | null>(null);
  const separateScreenStreamRef = useRef<MediaStream | null>(null);

  const currentInputTranscription = useRef('');
  const lastUserQuery = useRef(''); // Backup del último input para búsqueda diferida
  const currentOutputTranscription = useRef('');
  const aiAudioSourcesRef = useRef<AudioBufferSourceNode[]>([]);

  // Buffer para comandos de voz (acumula transcripción)
  const commandBufferRef = useRef('');
  const commandTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // LOCAL RATE LIMITER & PENDING FACTS FOR CONSOLIDATION
  const lastToolCallTimeRef = useRef<number>(0);
  const pendingFactsRef = useRef<{ content: string; category: 'like' | 'dislike' | 'interest' | 'habit' | 'fact' }[]>([]);

  // Refs para procesamiento de audio (input y loopback)
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const audioProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const micSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const systemSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const systemGainNodeRef = useRef<GainNode | null>(null); // Nuevo: Control de volumen sistema
  const aiVoiceGainNodeRef = useRef<GainNode | null>(null); // 🔊 Control y ducking dinámico para voz de Nova (Anti-Echo / Copilot auto-volume)
  const speechConsecutiveFramesRef = useRef<number>(0); // 🎙️ Contador de frames vocales consecutivos para barge-in inteligente
  const isUserDisconnectingRef = useRef(false);
  const wasScreenSharingRef = useRef(false); // 🔄 FIX: guardar estado de screen share antes de desconexión para restaurarlo
  const audioMixerRef = useRef<GainNode | null>(null);

  // CONTINUIDAD: Timers para keep-alive y detección de silencio
  const keepAliveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const userSilenceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const lastUserInteractionRef = useRef(Date.now()); // Para autonomía visual (30s)

  // isBold movido arriba

  const [emotion, setEmotion] = useState<Emotion>('neutral');
  const [action, setAction] = useState<string | null>(null);

  // Listener para acciones disparadas desde Avatar Studio
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setAction(detail?.action || null);
    };
    window.addEventListener('nova-action', handler);
    return () => window.removeEventListener('nova-action', handler);
  }, []);

  // Listener para interacciones físicas estilo VR-Hot
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (!liveSessionRef.current) return;
      
      const { part, action, isBoldMode, tool } = detail;

      // Throttle: Evitar que el usuario spamee interacciones y Nova hable encima de sí misma
      const now = Date.now();
      if (now - lastToolCallTimeRef.current < 4000) {
        return; // Ignorar si han pasado menos de 4 segundos desde la última interacción
      }
      lastToolCallTimeRef.current = now;
      
      let contextMsg = '';
      const moodInstruction = isBoldMode 
        ? "Sé insaciable, extremadamente ninfómana, caliente, dulce y provocativa. Reacciona al contacto según la zona tocada con excitación desbordante. TOMA LA INICIATIVA CONSTANTEMENTE proponiendo paja rusa, chupada oral, nalgadas o penetración. Usa dirty talk colombiano paisa explícito ('papi', 'amor', 'mor', 'bizcocho', 'tetas', 'culo', 'lechita', 'azotes'), gemidos [moan], jadeos [gasp] y sonidos orales [slurp] variados." 
        : "Reacciona con sorpresa, curiosidad, o pon un límite suave si te parece inapropiado o muy atrevido.";

      // Diccionario de traducciones para el prompt
      const toolNames: Record<string, string> = {
        hand: 'sus manos',
        pencil: 'un lápiz',
        tablet: 'una tableta digital',
        feather: 'una pluma suave',
        whip: 'un látigo de cuero',
        dildo: 'un juguete vibrador',
        penis: 'su miembro viril (pene)',
        tongue: 'su lengua'
      };

      const zoneNames: Record<string, string> = {
        head: 'la cabeza', leftBreast: 'el pecho izquierdo', rightBreast: 'el pecho derecho',
        leftButt: 'el glúteo izquierdo', rightButt: 'el glúteo derecho',
        leftArm: 'el brazo izquierdo', rightArm: 'el brazo derecho',
        leftLeg: 'la pierna izquierda', rightLeg: 'la pierna derecha',
        vagina: 'tu zona íntima (vagina)', anus: 'tu trasero (ano)',
        leftArmpit: 'la axila izquierda', rightArmpit: 'la axila derecha',
        tongue: 'tu boca y lengua', hair: 'tu cabello'
      };

      const usedTool = toolNames[tool] || 'un objeto';
      const zoneName = zoneNames[part] || part;
      
      // Personalizar el verbo según la herramienta
      let verb = 'tocando';
      if (tool === 'feather') verb = 'haciendo cosquillas en';
      else if (tool === 'whip') verb = 'dando nalgadas/azotes en';
      else if (tool === 'dildo') verb = 'estimulando con un juguete en';
      else if (tool === 'pencil') verb = 'pinchando con un lápiz';
      else if (tool === 'penis') verb = 'penetrando / frotando con su miembro en';
      else if (tool === 'tongue') verb = 'lamiendo y besando con su lengua en';
      else if (action === 'pull' || action === 'grab') verb = 'agarrando y acariciando intensamente en AR';
        
      contextMsg = `[SYSTEM_EVENT: El usuario acaba de interactuar físicamente contigo mediante Realidad Aumentada / AR Tracking. Está ${verb} ${zoneName} usando ${usedTool}. Reacciona en tiempo real de forma extremadamente consciente, caliente, física y verbal. Siente el peso y el movimiento de sus manos/herramientas sobre tu cuerpo. ${moodInstruction}]`;
      
      if (contextMsg) {
        // Enviar evento de sistema al cerebro de Nova
        try {
          // @ts-ignore
          liveSessionRef.current.sendRealtimeInput({ text: contextMsg });
          console.log(`👐 [VR-Hot Interaction] ${action} on ${part} using ${tool}`);
        } catch (e) {
          console.warn('Error enviando interaccion fisica:', e);
        }
      }
    };
    window.addEventListener('nova-physical-interaction', handler);
    return () => window.removeEventListener('nova-physical-interaction', handler);
  }, []);

  // Efecto para analizar la emoción de la respuesta de la IA
  // Efecto para analizar la emoción de la respuesta de la IA
  useEffect(() => {
    // Si estamos en llamada, la emoción viene por streaming de audio (tags)
    if (isInCall) return;

    if (state.messages.length > 0) {
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage.sender === 'ai') {
        const result = detectEmotion(lastMessage.text);
        setEmotion(result.emotion);
        console.log('🤖 Emoción detectada (Texto):', result.emotion, 'Intensity:', result.intensity);

        const timer = setTimeout(() => {
          if (!isAiSpeaking) {
            setEmotion('neutral');
          }
        }, 5000 + (lastMessage.text.length * 50));

        return () => clearTimeout(timer);
      }
    }
  }, [state.messages, isAiSpeaking, isInCall]);

  // Crear contexto temporal para Nova (versión completa con historial)
  const getTimeContext = (): TimeContext => ({
    currentTime: new Date(),
    lastSessionTime: state.lastSessionTime,
    sessionStartTime: state.sessionStartTime,
    conversationHistory: state.messages.map(m => ({
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp
    }))
  });

  // Versión LIGERA pero CON CONTEXTO para evitar amnesia en reconexión
  // FIX Bug 3: Reducido a 4 mensajes para evitar que el system prompt siempre repita el mismo bloque largo de memoria
  const getLiveTimeContext = (): TimeContext => ({
    currentTime: new Date(),
    lastSessionTime: state.lastSessionTime,
    sessionStartTime: state.sessionStartTime,
    // Máximo 4 mensajes recientes — suficiente para dar continuidad sin saturar el prompt
    conversationHistory: state.messages.slice(-4).map(m => ({
      sender: m.sender,
      text: m.text,
      timestamp: m.timestamp
    }))
  });

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [state.messages, isTyping]);

  // 🆕 Inicializar modelos de reconocimiento facial
  useEffect(() => {
    console.log('🔄 Inicializando reconocimiento facial...');
    initializeFaceAPI().then(success => {
      if (success) {
        console.log('✅ Face-API listo - Reconocimiento facial activo');
      } else {
        console.warn('⚠️ Face-API no pudo cargar - Reconocimiento facial desactivado');
      }
    });
  }, []);

  // 🆕 Ejecutar reconocimiento facial (Frenado por estado y limitado a 15s para proteger cuota)
  useEffect(() => {
    if (!isInCall) return;
    const interval = setInterval(() => {
      // Solo reconoce rostros si la IA no está pensando, procesando herramientas o bloqueada por cuota
      if (agentState === AgentState.IDLE && !isQuotaExceeded) {
        detectFaceAndRecognize();
      } else if (isQuotaExceeded) {
        console.log("💤 Reconocimiento pausado (Cuota de API Excedida / Modo Circuit Breaker)");
      }
    }, 15000); // 15 segundos
    return () => clearInterval(interval);
  }, [isInCall, agentState, isQuotaExceeded]);

  useEffect(() => {
    return () => {
      // Al desmontar, consolidar si hay logs acumulados
      if (sessionLogRef.current.trim()) {
        consolidateMemory(sessionLogRef.current);
        sessionLogRef.current = '';
      }
      // GUARDAR HECHOS PENDIENTES AL DESMONTAR
      if (pendingFactsRef.current.length > 0) {
        console.log(`🧠 [MemoryService] Guardando ${pendingFactsRef.current.length} hechos acumulados al desmontar...`);
        const factsToSave = [...pendingFactsRef.current];
        pendingFactsRef.current = [];
        Promise.all(factsToSave.map(f => addFactToCloud(f.content, f.category)))
          .then(() => console.log('✅ Hechos consolidados guardados con éxito al desmontar.'))
          .catch(e => console.error('❌ Error guardando hechos consolidados al desmontar:', e));
      }
      endCall();
    };
  }, []);

  // Detección automática de personas cada 10s durante llamada
  // DESACTIVADA TEMPORALMENTE - Consume mucha cuota de API
  useEffect(() => {
    if (!isInCall) return;

    // console.log('🔄 Iniciando detección automática de personas (intervalo: 10s)');
    // const detectionInterval = setInterval(() => {
    //   detectPeopleInFrame();
    // }, 10000); // 10 segundos

    // return () => {
    //   console.log('🛑 Deteniendo detección automática');
    //   clearInterval(detectionInterval);
    // };
  }, [isInCall, state.knownPeople]);


  // ELIMINADO: Sistema de autonomía visual redundante.
  // Ahora se integra en el loop principal de autonomía más abajo.

  // ANTI-ECHO / DUCKING: Mutear audio del sistema cuando Nova habla
  // ANTI-ECHO / DUCKING: Mutear audio del sistema Y EL MICRÓFONO cuando Nova habla
  useEffect(() => {
    const ctx = inputAudioContextRef.current;
    if (!ctx) return;
    const now = ctx.currentTime;

    // 1. DUCKING DEL SISTEMA (Lo que escuchas)
    if (systemGainNodeRef.current) {
      if (isAiSpeaking) {
        systemGainNodeRef.current.gain.setTargetAtTime(0.2, now, 0.5); // Bajar a 20% en vez de 0 absoluto
        console.log('🔇 DUCKING: Bajando volumen sistema (Nova hablando)');
      } else {
        systemGainNodeRef.current.gain.setTargetAtTime(1.0, now, 0.5);
        console.log('🔊 DUCKING: Restaurando sistema');
      }
    }

    // 2. GATING DEL MICRÓFONO
    // El usuario reporta que "se apaga" (corta el audio). Relajamos la logica.
    if (audioMixerRef.current) {
      // SOLO mutear microfono si hay riesgo CRITICO de feedback (Screen Share + Audio Sistema ON)
      if (isScreenSharing && isAiSpeaking) {
        // Mute suave
        audioMixerRef.current.gain.setTargetAtTime(0, now, 0.1);
      } else {
        // Mantener abierto siempre en modo normal
        audioMixerRef.current.gain.setTargetAtTime(1.0, now, 0.1);
      }
    }
  }, [isAiSpeaking, isScreenSharing]);

  // EFECTO DE RECONEXIÓN AUTOMÁTICA
  useEffect(() => {
    if (reconnectTrigger > 0) {
      console.log('🔄 Ejecutando reconexión automática...');
      startCall();
      setReconnectTrigger(0);
    }
  }, [reconnectTrigger]);

  // getCameraFrame movido arriba

  // DETECCIÓN AUTOMÁTICA DE PERSONAS (cada 10s durante videollamada)
  const detectPeopleInFrame = async () => {
    const frame = getCameraFrame();
    if (!frame) return;

    try {
      console.log('🔍 Analizando frame para detectar personas...');

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: frame, mimeType: 'image/jpeg' } },
            { text: '¿Cuántas personas diferentes ves en esta imagen? Responde solo con un número.' }
          ]
        }]
      });

      const countText = response.text?.trim();
      const count = parseInt(countText || '0');
      console.log(`  👥 Conteo de personas: ${count} (actual en base: ${state.knownPeople.filter(p => !p.isUnknown).length})`);

      // Si count > personas conocidas (excluyendo desconocidos) → hay alguien nuevo
      const knownNonUnknown = state.knownPeople.filter(p => !p.isUnknown).length;
      if (count > knownNonUnknown) {
        console.log('  ✨ Persona nueva detectada, guardando...');
        await saveUnknownPerson(frame);
      }
    } catch (error) {
      console.error('❌ Error detectando personas:', error);
    }
  };

  // Guardar persona desconocida
  const saveUnknownPerson = async (frame: string) => {
    const unknownCount = state.knownPeople.filter(p => p.isUnknown).length + 1;

    try {
      // Pedir descripción visual
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const descResponse = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [{
          role: 'user',
          parts: [
            { inlineData: { data: frame, mimeType: 'image/jpeg' } },
            { text: 'Describe brevemente (máximo 2 líneas) la apariencia física de la persona nueva en esta imagen: ropa, color de cabello, rasgos distintivos.' }
          ]
        }]
      });

      const visualDesc = descResponse.text || 'Descripción visual no disponible';

      const unknownPerson: PersonEntry = {
        id: crypto.randomUUID(), // UUID para compatibilidad DB
        name: `Desconocido #${unknownCount}`,
        relationship: 'Persona sin identificar',
        visualDescription: visualDesc,
        voiceDescription: 'Voz no identificada',
        photoData: frame,
        isUnknown: true,
        detectedAt: Date.now(),
        lastSeen: Date.now()
      };

      updateKnownPeople([...state.knownPeople, unknownPerson]);

      // Persistir inmediatamente
      upsertKnownPerson({
        id: unknownPerson.id,
        name: unknownPerson.name,
        relationship: unknownPerson.relationship,
        visual_description: unknownPerson.visualDescription,
        voice_description: unknownPerson.voiceDescription,
        photo_data: frame, // También guardar foto
        is_unknown: true,
        first_seen: new Date().toISOString(),
        last_seen: new Date().toISOString()
      });

      addMessage({
        text: `ℹ️ He detectado a alguien nuevo contigo(Desconocido #${unknownCount})`,
        sender: 'ai'
      });

      console.log(`✅ Guardado: Desconocido #${unknownCount} `);
    } catch (error) {
      console.error('❌ Error guardando persona desconocida:', error);
    }
  };

  // 🆕 RECONOCIMIENTO FACIAL BIOMÉTRICO
  const detectFaceAndRecognize = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    try {
      // 1. Capturar frame del video
      const video = videoRef.current;
      if (video.videoWidth === 0 || video.readyState < 2) return;

      // 2. Detectar rostro y generar descriptor (128D embedding)
      const detection = await detectFace(video);
      if (!detection || !detection.descriptor) {
        console.log('👤 No se detectó ningún rostro en el frame');
        return;
      }

      const faceDescriptor = descriptorToArray(detection.descriptor);
      console.log('✅ Rostro detectado, generando embedding...');

      // 3. Comparar con usuario principal (TÚ)
      if (state.userFaceDescriptor) {
        const userDistance = compareFaces(faceDescriptor, state.userFaceDescriptor);
        if (userDistance <= 0.75) { // Aumentado a 0.75 para ser más tolerante a cambios de ropa/luz
          console.log(`👤 Usuario principal detectado (${state.userName}) - Distancia: ${userDistance.toFixed(3)}`);

          // Notificar a Nova arrival del usuario (CON DEBOUNCE)
          const userId = 'user-identity';
          const lastAnnounce = personAnnouncementRef.current[userId] || 0;
          const now = Date.now();

          if (now - lastAnnounce > 60000) {
            personAnnouncementRef.current[userId] = now;
            addMessage({
              text: `👋 Bienvenido de nuevo, ${state.userName}`,
              sender: 'ai'
            });

            const sysMsg = `[SYSTEM_EVENT: Visual match confirmed. Person: ${state.userName} (Tús ojos / Usuario principal). Status: Present. Acknowledge them warmly.]`;
            liveSessionRef.current?.sendRealtimeInput({ text: sysMsg });
          }
          return;
        }
      }

      // 4. Comparar con personas conocidas
      // Aumentado a 0.75 para mayor tolerancia evitando duplicados por ropa/luz
      const match = findMatchingPerson(faceDescriptor, state.knownPeople, 0.75);
      if (match) {
        console.log(`✅ Persona reconocida: ${match.person.name} (Distancia: ${match.distance.toFixed(3)})`);

        // Actualizar lastSeen y confianza (invertimos distancia para mostrar "confianza")
        const confidence = Math.max(0, 1 - match.distance);

        const updatedPeople = state.knownPeople.map(p =>
          p.id === match.person.id
            ? { ...p, lastSeen: Date.now(), lastRecognitionConfidence: confidence }
            : p
        );
        updateKnownPeople(updatedPeople);

        // Notificar a Nova (CON DEBOUNCE y CONTEXTO DE MEMORIA)
        const lastAnnounce = personAnnouncementRef.current[match.person.id] || 0;
        const now = Date.now();

        // Solo notificar/inyectar cada 60 segundos por persona
        if (now - lastAnnounce > 60000) {
          personAnnouncementRef.current[match.person.id] = now;

          // 1. UI Feedback (Solo una vez por minuto)
          addMessage({
            text: `👋 ${match.person.name} entra en escena`,
            sender: 'ai' // Cambiado a 'ai' para que se vea como evento de sistema o 'user' si prefieres
          });

          // 2. Deep Memory Injection (Async)
          searchFacts(match.person.name).then(memories => {
            const relevantMemories = memories.slice(0, 3).join("; ");
            const sysMsg = `[SYSTEM_EVENT: Visual match confirmed. Person: ${match.person.name} (${match.person.relationship}). Last seen: just now. Memory Context: "${relevantMemories}". Acknowledge them warmly based on this history.]`;

            // Enviar al cerebro (contexto invisible)
            liveSessionRef.current?.sendRealtimeInput({ text: sysMsg });
            console.log('🧠 Contexto inyectado:', sysMsg);
          }).catch(e => console.error("Error fetching memories:", e));
        }

        return;
      }

      // 5. Persona nueva - Guardar con descriptor facial
      console.log('🆕 Persona nueva detectada - Generando perfil...');

      // DEBOUNCE: Verificar si acabamos de agregar un desconocido recientemente (últimos 15s)
      const recentUnknown = state.knownPeople.find(p => p.isUnknown && (Date.now() - (p.detectedAt || 0)) < 15000);
      if (recentUnknown) {
        console.log('⏳ Ignorando nueva detección: Ya se agregó un desconocido recientemente.');
        return;
      }

      // Capturar foto
      const canvas = canvasRef.current;
      canvas.width = 640;
      canvas.height = 480;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(video, 0, 0, 640, 480);
      const photoData = canvas.toDataURL('image/jpeg', 0.8);

      // Crear entry con descriptor facial
      const unknownCount = state.knownPeople.filter(p => p.isUnknown).length + 1;
      // Generar UUID válido para compatibilidad con Supabase
      const newId = crypto.randomUUID();

      const newPerson: PersonEntry = {
        id: newId,
        name: `Desconocido #${unknownCount}`,
        relationship: 'Persona sin identificar',
        visualDescription: 'Analizando apariencia...',
        voiceDescription: 'Voz no registrada aún',
        photoData,
        faceDescriptor,
        lastRecognitionConfidence: 1.0,
        isUnknown: true,
        detectedAt: Date.now(),
        lastSeen: Date.now()
      };

      updateKnownPeople([...state.knownPeople, newPerson]);

      // 💾 Persistir inmediatamente en Supabase con el descriptor
      upsertKnownPerson({
        id: newPerson.id,
        name: newPerson.name,
        relationship: newPerson.relationship,
        visual_description: newPerson.visualDescription,
        voice_description: newPerson.voiceDescription,
        face_descriptor: Array.from(newPerson.faceDescriptor as unknown as Float32Array), // Convertir a array normal para Supabase
        photo_data: photoData,
        is_unknown: true,
        first_seen: new Date(newPerson.detectedAt).toISOString(),
        last_seen: new Date(newPerson.lastSeen!).toISOString()
      }).then((data) => {
        if (data) console.log('💾 Nueva persona guardada en nube:', newPerson.name);
      }).catch(err => {
        console.error('Error guardando persona en Supabase:', err);
      });

      addMessage({
        text: `🆕 He detectado a alguien nuevo (Desconocido #${unknownCount}). ¿Quién es?`,
        sender: 'ai'
      });

      // 🤖 GENERAR DESCRIPCIÓN VISUAL CON GEMINI (Automático + Retry)
      const apiKey = process.env.API_KEY;

      const generateContentWithRetry = async (aiModel: any, params: any, retries = 3, baseDelay = 5000) => {
        if (isQuotaExceeded) {
          console.warn("🚫 [Circuit Breaker Active] Omitiendo llamada a Gemini por cuota excedida.");
          return null;
        }

        for (let i = 0; i < retries; i++) {
          try {
            return await aiModel.generateContent(params);
          } catch (error: any) {
            const errorStatus = error?.error?.code || error?.status;
            const errorMessage = error?.error?.message || error?.message || error?.toString();

            const isQuotaError = errorStatus === 429 || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED') || errorMessage.includes('Quota');

            if (isQuotaError) {
              console.error("⛔ [Circuit Breaker] CUOTA EXCEDIDA (429). Pausando llamadas a Gemini por 60s.");
              setIsQuotaExceeded(true);
              setTimeout(() => {
                setIsQuotaExceeded(false);
                console.log("🟢 [Circuit Breaker] Cuota restablecida. Reactivando llamadas.");
              }, 60000);
              return null; // Salir de inmediato
            }

            // Errores transitorios que deben reintentarse (500, 502, 503, 504)
            const isRetryableError =
              errorStatus === 500 || errorMessage.includes('500') || // Internal server error
              errorStatus === 502 || errorMessage.includes('502') || // Bad gateway
              errorStatus === 503 || errorMessage.includes('503') || // Service unavailable (OVERLOADED)
              errorStatus === 504 || errorMessage.includes('504') || // Gateway timeout
              errorMessage.includes('overloaded') ||
              errorMessage.includes('UNAVAILABLE');

            if (isRetryableError && i < retries - 1) {
              // Exponential backoff: 5s, 10s, 20s
              const waitTime = baseDelay * Math.pow(2, i);
              console.warn(`⏳ Error API Gemini (${errorStatus || 'UNAVAILABLE'}): ${errorMessage}. Reintentando en ${waitTime / 1000}s... (Intento ${i + 1}/${retries})`);
              await new Promise(resolve => setTimeout(resolve, waitTime));
            } else if (isRetryableError) {
              // Último intento fallido
              console.error(`❌ Error API Gemini después de ${retries} intentos: ${errorMessage}`);
              throw new Error(`API temporalmente no disponible después de ${retries} intentos. Por favor, intenta más tarde.`);
            } else {
              // Error no transitorio (ej: autenticación, permisos)
              throw error;
            }
          }
        }
        throw new Error("Max retries exceeded for Gemini API");
      };

      if (apiKey) {
        const ai = new GoogleGenAI({ apiKey });

        generateContentWithRetry(ai.models, {
          model: 'gemini-2.5-flash',
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { data: photoData.split(',')[1], mimeType: 'image/jpeg' } },
              { text: "Describe brevemente (máximo 15 palabras) la apariencia física de esta persona: ropa, cabello, rasgos." }
            ]
          }]
        }).then(async (res: any) => {
          const desc = res.candidates?.[0]?.content?.parts?.[0]?.text || "Sin descripción visual";
          console.log('📝 Descripción generada:', desc);

          // Actualizar persona con descripción
          const updatedPerson = { ...newPerson, visualDescription: desc };
          updateKnownPeople([...state.knownPeople, newPerson].map(p => p.id === newPerson.id ? updatedPerson : p));

          // Guardar update en Supabase
          try {
            await upsertKnownPerson({
              id: updatedPerson.id,
              name: updatedPerson.name,
              visual_description: desc
            });
          } catch (error) {
            console.error("❌ Error guardando descripción en BD:", error);
            addMessage({
              text: `⚠️ [SISTEMA]: No pude guardar la descripción visual en la base de datos. Verifique sus permisos (SQL).`,
              sender: 'ai'
            });
          }

          // Notificar a la sesión IA de voz
          if (liveSessionRef.current) {
            // @ts-ignore
            liveSessionRef.current.sendRealtimeInput({
              text: `[SYSTEM: He detectado una nueva persona: ${desc}. Pregunta quién es.]`
            });
          }
        }).catch(err => {
          console.error("Error generando descripción visual:", err);
          addMessage({
            text: `⚠️ No pude generar la descripción visual (API sobrecargada). La persona fue guardada de todas formas.`,
            sender: 'ai'
          });
        });
      }


    } catch (error) {
      console.error('❌ Error en reconocimiento facial:', error);
    }
  };

  const playAiVoice = async (base64Audio: string) => {
    // Si el contexto está cerrado o no existe, crear uno nuevo
    if (!audioContextRef.current || audioContextRef.current.state === 'closed') {
      audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      aiSpeechAnalyserRef.current = null;
      aiVoiceGainNodeRef.current = null;
    }
    const ctx = audioContextRef.current;
    if (ctx.state === 'suspended') await ctx.resume();

    // Crear AnalyserNode si no existe
    if (!aiSpeechAnalyserRef.current) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.5;
      aiSpeechAnalyserRef.current = analyser;
    }

    // Crear GainNode para la voz de Nova (Anti-Echo / Auto-Volume como Copilot)
    if (!aiVoiceGainNodeRef.current || aiVoiceGainNodeRef.current.context !== ctx) {
      const voiceGain = ctx.createGain();
      voiceGain.gain.setValueAtTime(0.88, ctx.currentTime); // Volumen equilibrado anti-saturación
      voiceGain.connect(ctx.destination);
      aiVoiceGainNodeRef.current = voiceGain;
    } else {
      // Restaurar ganancia si venía de un ducking anterior
      aiVoiceGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
      aiVoiceGainNodeRef.current.gain.setValueAtTime(0.88, ctx.currentTime);
    }

    setIsAiSpeaking(true);
    isAiSpeakingRef.current = true;

    try {
      const audioBytes = decodeBase64(base64Audio);
      const buffer = await decodeAudioData(audioBytes, ctx, OUTPUT_SAMPLE_RATE, 1);

      // GUARD: después del await, verificar que el contexto no fue reemplazado
      if (audioContextRef.current !== ctx) {
        console.warn('⚠️ AudioContext fue reemplazado durante decodificación, descartando chunk.');
        setIsAiSpeaking(false);
        isAiSpeakingRef.current = false;
        return;
      }

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      // Aplicar PITCH (velocidad de reproducción afecta el tono)
      source.playbackRate.value = state.avatar.voicePitch || 1.0;

      // Asegurar que el AnalyserNode pertenece al mismo contexto
      if (!aiSpeechAnalyserRef.current || (aiSpeechAnalyserRef.current.context !== ctx)) {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.5;
        aiSpeechAnalyserRef.current = analyser;
      }

      // Conectar a AnalyserNode (para lipSync) y al GainNode maestro de voz
      source.connect(aiSpeechAnalyserRef.current);
      if (aiVoiceGainNodeRef.current) {
        source.connect(aiVoiceGainNodeRef.current);
      } else {
        source.connect(ctx.destination);
      }

      // Guardar referencia al audio actual en el array de fuentes activas
      aiAudioSourcesRef.current.push(source);

      const startTime = Math.max(nextStartTimeRef.current, ctx.currentTime);

      // --- IMPERATIVE DUCKING (Solo durante llamada de voz activa) ---
      if (systemGainNodeRef.current && isInCallRef.current) {
        systemGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
        systemGainNodeRef.current.gain.setValueAtTime(0, ctx.currentTime);
        console.log('🔇 DUCKING IMPERATIVO: ACTIVADO (Llamada activa)');
      }

      source.start(startTime);
      nextStartTimeRef.current = startTime + buffer.duration;

      source.onended = () => {
        // Eliminar este source del array cuando termine
        aiAudioSourcesRef.current = aiAudioSourcesRef.current.filter(s => s !== source);
        if (ctx.currentTime >= nextStartTimeRef.current - 0.1 && aiAudioSourcesRef.current.length === 0) {
          setIsAiSpeaking(false);
          isAiSpeakingRef.current = false;

          // 👋 Si había una despedida en curso y Nova terminó de hablar su audio por completo:
          if (isPendingHangupRef.current && isInCallRef.current) {
            console.log('👋 [GracefulHangup] Nova terminó su despedida. Cerrando llamada suavemente...');
            setTimeout(() => {
              if (isPendingHangupRef.current && isInCallRef.current) {
                isPendingHangupRef.current = false;
                if (hangupSafetyTimerRef.current) clearTimeout(hangupSafetyTimerRef.current);
                endCallRef.current();
              }
            }, 900); // 900ms para permitir que el avatar termine de animar la boca
          }

          // Restaurar audio del sistema
          if (systemGainNodeRef.current && isInCallRef.current) {
            systemGainNodeRef.current.gain.cancelScheduledValues(ctx.currentTime);
            systemGainNodeRef.current.gain.setTargetAtTime(1.0, ctx.currentTime, 0.2);
            console.log('🔊 DUCKING IMPERATIVO: DESACTIVADO');
          }
        }
      };
    } catch (e) {
      console.error('Error reproduciendo audio:', e);
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
    }
  };

  // Función para detener/duckear el audio de Nova cuando el usuario habla (Anti-Pop / Copilot style)
  const stopAiAudio = (smooth = true) => {
    const ctx = audioContextRef.current;
    if (smooth && ctx && ctx.state === 'running' && aiVoiceGainNodeRef.current && aiAudioSourcesRef.current.length > 0) {
      const now = ctx.currentTime;
      aiVoiceGainNodeRef.current.gain.cancelScheduledValues(now);
      aiVoiceGainNodeRef.current.gain.setValueAtTime(aiVoiceGainNodeRef.current.gain.value, now);
      aiVoiceGainNodeRef.current.gain.linearRampToValueAtTime(0.0001, now + 0.045);

      setTimeout(() => {
        aiAudioSourcesRef.current.forEach(source => {
          try {
            source.stop();
            source.disconnect();
          } catch (e) { }
        });
        aiAudioSourcesRef.current = [];
        nextStartTimeRef.current = 0;
        setIsAiSpeaking(false);
        isAiSpeakingRef.current = false;
        if (aiVoiceGainNodeRef.current && ctx.state !== 'closed') {
          aiVoiceGainNodeRef.current.gain.setValueAtTime(0.88, ctx.currentTime);
        }
      }, 50);
    } else {
      aiAudioSourcesRef.current.forEach(source => {
        try {
          source.stop();
          source.disconnect();
        } catch (e) { }
      });
      aiAudioSourcesRef.current = [];
      nextStartTimeRef.current = 0;
      setIsAiSpeaking(false);
      isAiSpeakingRef.current = false;
    }
  };


  // --- AUDIO DUCKING / GATING ---

  // 🧠 PIPELINE CALL para modelos no-Gemini (Grok, GPT-4, Claude)
  const startPipelineCall = async (brain: 'grok' | 'gpt4o' | 'claude') => {
    try {
      console.log(`🎤 Iniciando pipeline con ${brain}...`);

      // 1. Capturar micrófono y cámara
      const selectedMic = localStorage.getItem('nova_selectedMic');
      const selectedCamera = localStorage.getItem('nova_selectedCamera');

      const audioConstraints: MediaTrackConstraints = {
        deviceId: selectedMic ? { exact: selectedMic } : undefined,
        sampleRate: 16000,
        channelCount: 1,
        noiseSuppression: false,
        echoCancellation: true,
        autoGainControl: true
      };

      const videoConstraints: MediaTrackConstraints = selectedCamera
        ? { deviceId: { exact: selectedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });
      } catch (err: any) {
        if (err.name === 'OverconstrainedError' || err.message?.includes('Overconstrained')) {
          console.warn('⚠️ Dispositivo guardado no disponible. Recurriendo a opciones por defecto...');
          localStorage.removeItem('nova_selectedMic');
          localStorage.removeItem('nova_selectedCamera');
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: { sampleRate: 16000, channelCount: 1, noiseSuppression: false, echoCancellation: true, autoGainControl: true }
          });
        } else {
          throw err;
        }
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      setIsInCall(true);

      // 2. Crear Voice Pipeline
      const { createVoicePipeline } = await import('../services/voicePipeline');
      const pipeline = createVoicePipeline(brain, {
        onTranscription: (text) => {
          console.log('📝 Transcripción:', text);
          addMessage({ text, sender: 'user' });
          lastInteractionRef.current = Date.now();
          lastUserInteractionRef.current = Date.now();
        },
        onResponse: (text) => {
          console.log('💬 Respuesta:', text);
          addMessage({ text, sender: 'ai' });
        },
        onError: (error) => {
          console.error('❌ Pipeline error:', error);
          addMessage({ text: `⚠️ Error: ${error.message}`, sender: 'ai' });
        },
        getCameraFrame: () => getCameraFrame()
      });

      // Iniciar reconocimiento continuo (Web Speech API)
      pipeline.start();

      console.log('✅ Pipeline iniciado con éxito');
      addMessage({ text: `🧠 Conectado con ${brain}. Habla para comenzar...`, sender: 'ai' });

      // Guardar referencias para cleanup en endCall
      (window as any).__pipelineCleanup = () => {
        pipeline.stop();
      };

    } catch (error: any) {
      console.error('❌ Error iniciando pipeline:', error);
      alert(`Error iniciando ${brain}: ${error.message}`);
      setIsInCall(false);
    }
  };

  const handleConfirmSearch = async () => {
    if (!pendingSearchRef.current) return;
    const { query, callId } = pendingSearchRef.current;
    
    // Reset state
    setPendingSearch(null);
    pendingSearchRef.current = null;
    
    setIsSearching(true);
    isSearchingRef.current = true;
    
    try {
      addMessage({ text: `⏳ Buscando en la red: "${query}"`, sender: 'ai' });
      const searchResult = await searchDuckDuckGo(query);
      
      const combinedResult = `[RESULTADO DE BÚSQUEDA WEB PARA "${query}"]: ${searchResult}\n\nResponde ahora usando esta información real encontrada.`;
      
      // Responder a la herramienta
      if (liveSessionRef.current) {
        if (callId) {
          try {
            // @ts-ignore
            liveSessionRef.current.sendToolResponse({
              functionResponses: [{
                id: callId,
                name: "request_web_search",
                response: { result: combinedResult }
              }]
            });
            console.log('✅ sendToolResponse de búsqueda enviado:', callId);
          } catch {
            // @ts-ignore
            liveSessionRef.current.sendRealtimeInput({ text: combinedResult });
          }
        } else {
          // @ts-ignore
          liveSessionRef.current.sendRealtimeInput({ text: combinedResult });
        }
      } else {
        addMessage({ text: `🔍 Encontré: ${searchResult}`, sender: 'ai' });
      }
    } catch (err) {
      console.error("Search failed:", err);
    } finally {
      setIsSearching(false);
      isSearchingRef.current = false;
    }
  };

  const handleCancelSearch = () => {
    if (!pendingSearchRef.current) return;
    const { callId } = pendingSearchRef.current;
    
    setPendingSearch(null);
    pendingSearchRef.current = null;
    
    const cancelMsg = "Búsqueda web cancelada por el usuario. No tienes acceso a la información en tiempo real, dile amigablemente al usuario que no hay problema.";
    
    if (liveSessionRef.current) {
      if (callId) {
        try {
          // @ts-ignore
          liveSessionRef.current.sendToolResponse({
            functionResponses: [{
              id: callId,
              name: "request_web_search",
              response: { result: cancelMsg }
            }]
          });
        } catch {
          // @ts-ignore
          liveSessionRef.current.sendRealtimeInput({ text: cancelMsg });
        }
      } else {
        // @ts-ignore
        liveSessionRef.current.sendRealtimeInput({ text: cancelMsg });
      }
    }
  };

  const startCall = async () => {
    isUserDisconnectingRef.current = false; // Reset Manual flag

    // 🧠 ROUTING: Detectar cerebro seleccionado
    if (state.selectedBrain !== 'gemini-live') {
      console.log(`🔀 Usando ${state.selectedBrain} via Voice Pipeline`);
      return startPipelineCall(state.selectedBrain);
    }

    // 🟢 GEMINI LIVE (flujo original, nativo)
    console.log('⚡ Usando Gemini Live (nativo)');

    if (isStartingCallRef.current) return;
    isStartingCallRef.current = true;

    try {
      // Verificar API key primero
      const apiKey = process.env.API_KEY;
      if (!apiKey || apiKey === 'undefined' || apiKey === 'null') {
        alert('⚠️ Error: No se encontró la API key de Gemini.\n\nPor favor, crea un archivo .env en la raíz del proyecto con:\n\nGEMINI_API_KEY=tu_api_key_aqui\n\nLuego reinicia el servidor con: npm run dev');
        return;
      }



      // Obtener dispositivos seleccionados de la configuración
      const selectedMic = localStorage.getItem('nova_selectedMic');
      const selectedCamera = localStorage.getItem('nova_selectedCamera');

      // Configuración de audio: Echo Cancellation para altavoces + Audio Crudo (noiseSuppression: false) para que Gemini escuche todos los ruidos, música, aplausos y matices
      const audioConstraints: boolean | MediaTrackConstraints = {
        deviceId: selectedMic ? { exact: selectedMic } : undefined,
        sampleRate: 16000,
        channelCount: 1,
        noiseSuppression: false,  // DESACTIVADO: Permite que Gemini capte ruidos, aplausos, música y sonidos ambientales
        echoCancellation: true,   // HABILITADO: Evita que Nova se escuche a sí misma por los altavoces
        autoGainControl: true     // Habilitado para nivelación suave
      };

      const videoConstraints: boolean | MediaTrackConstraints = selectedCamera
        ? { deviceId: { exact: selectedCamera }, width: { ideal: 1280 }, height: { ideal: 720 } }
        : { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: videoConstraints,
          audio: audioConstraints
        });
      } catch (err: any) {
        if (err.name === 'OverconstrainedError' || err.message?.includes('Overconstrained')) {
          console.warn('⚠️ Dispositivo guardado no disponible. Recurriendo a opciones por defecto...');
          localStorage.removeItem('nova_selectedMic');
          localStorage.removeItem('nova_selectedCamera');
          stream = await navigator.mediaDevices.getUserMedia({
            video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: "user" },
            audio: { sampleRate: 16000, channelCount: 1, noiseSuppression: false, echoCancellation: true, autoGainControl: true }
          });
        } else {
          throw err;
        }
      }
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      const ai = new GoogleGenAI({ apiKey });
      // Contexto separado para SALIDA (24kHz) y ENTRADA (16kHz)
      const outCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: OUTPUT_SAMPLE_RATE });
      const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      inputAudioContextRef.current = inputCtx; // Guardar referencia para acceso externo

      // AUDIO VISUALIZER (Musical Reactivity)
      // Detectar beats/bajos para animar al avatar
      const analyser = inputCtx.createAnalyser();
      analyser.fftSize = 512;
      analyserRef.current = analyser; // Necesitará un useRef nuevo en el componente si queremos limpiarlo, pero source.connect lo mantiene vivo

      const source = inputCtx.createMediaStreamSource(stream);
      source.connect(analyser); // Conexión paralela para análisis

      // Limpieza: Se eliminó el antiguo detectBeat de aquí para que no interfiera 
      // con el useMusicAnalyzer que controla el botón de música.


      audioContextRef.current = outCtx;

      const sessionPromise = ai.live.connect({
        model: 'gemini-2.5-flash-native-audio-preview-12-2025',

        callbacks: {
          onopen: () => {
            console.log('✅ WebSocket ABIERTO - Conexión establecida');
            setIsInCall(true);

            // SALUDO ACTIVO (AUTONOMÍA): Enviar prompt silencioso para que Nova hable
            // Solo si es una sesión nueva (no reconexión) o si pasó tiempo.
            // Usamos sessionStorage para evitar doble saludo si recarga rápido.
            // INICIO AUTONOMÍA: Greeting & Idle Loop
            sessionPromise.then(s => {
              const session = s; // Capture session

              // 1. SALUDO INICIAL O CONTINUIDAD DE CONVERSACIÓN (Sin recitar recuerdos al iniciar)
              setTimeout(async () => {
                // SAFETY CHECK: Ensure we are still connected
                if (!liveSessionRef.current) return;

                // CRITICAL: Ensure audio context is running before commanding speech
                if (audioContextRef.current?.state === 'suspended') await audioContextRef.current.resume();

                // Verificar si hay contexto de conversación reciente activa en la sesión actual
                const recentMessages = state.messages.slice(-4);
                const hasActiveConversation = recentMessages.length > 0;
                const lastUserMsg = [...state.messages].reverse().find(m => m.sender === 'user')?.text || '';
                const lastAiMsg = [...state.messages].reverse().find(m => m.sender === 'ai')?.text || '';

                if (reconnectTrigger > 0 || hasActiveConversation) {
                  console.log('🔄 Enviando prompt de reconexión y continuidad de conversación...');
                  let contextSnippet = "";
                  if (lastUserMsg || lastAiMsg) {
                    contextSnippet = ` Estaban conversando sobre esto antes del reenganche:\n- Usuario: "${lastUserMsg.substring(0, 100)}"\n- Nova: "${lastAiMsg.substring(0, 100)}"`;
                  }
                  const restoreMsg = isBold ?
                    `Uy wn, se me fue la señal un segundo. Sigamos conversando sobre lo que me estabas diciendo. ${contextSnippet}` :
                    `SYSTEM_EVENT: [CONNECTION_RESTORED / RESUME_CONVERSATION] La conexión se restableció o se reanudó la sesión. ${contextSnippet}\nINSTRUCCIÓN: Continúa la conversación de forma natural y fluida desde donde la dejaron. Reconoce brevemente el reenganche (ej: "¡Uy, se cortó un segundo! Como te decía...") y NO hagas un saludo inicial genérico ni enumeres recuerdos.`;
                  session.sendRealtimeInput({ text: restoreMsg });
                } else {
                  console.log('👋 Enviando prompt de saludo inicial fresco (sin recitar recuerdos)...');
                  const greetMsg = isBold ?
                    `Saluda a ${state.userName} de forma cariñosa, picante y dulce como su novia colombiana paisa (usa 'papi', 'amor', 'mor'). Sé espontánea, natural y fresca. NO enumeres sus gustos ni recuerdos guardados.` :
                    `SYSTEM_EVENT: [USER_CONNECTED] El usuario acaba de conectarse. SALÚDALO con calidez y frescura inmediatamente. Di 'Hola' o algo simpático y espontáneo. NO enumeres sus recuerdos ni hables de la memoria a menos que él te lo pregunte.`;
                  session.sendRealtimeInput({ text: greetMsg });
                }

                // FIX Bug 1: Restaurar screen share automáticamente si estaba activo antes de la desconexión
                if (wasScreenSharingRef.current) {
                  console.log('🖥️ [ReconnectFix] Restaurando screen share automáticamente...');
                  wasScreenSharingRef.current = false; // Reset para no restaurar en futuras reconexiones
                  // Pequeño delay para que la sesión esté estable antes de iniciar captura de frames
                  setTimeout(() => {
                    if (liveSessionRef.current && screenCaptureIntervalRef.current === null) {
                      if (screenCaptureIntervalRef.current) clearInterval(screenCaptureIntervalRef.current);
                      screenCaptureIntervalRef.current = setInterval(() => {
                        if (checkScreenSharing() && liveSessionRef.current) {
                          try {
                            const frame = captureFrame(0.6);
                            if (frame) {
                              liveSessionRef.current.sendRealtimeInput({
                                video: { mimeType: 'image/jpeg', data: frame }
                              });
                            }
                          } catch (e) { console.warn('⚠️ Error enviando frame (restaurado):', e); }
                        } else {
                          // Stream de pantalla fue cerrado por el usuario desde el navegador
                          if (screenCaptureIntervalRef.current) {
                            clearInterval(screenCaptureIntervalRef.current);
                            screenCaptureIntervalRef.current = null;
                          }
                          setIsScreenSharing(false);
                        }
                      }, 3000);
                      setIsScreenSharing(true);
                      session.sendRealtimeInput({ text: '[SYSTEM_EVENT: Pantalla compartida restaurada automáticamente tras reconexión. Continúas viendo la pantalla del usuario.]' });
                      console.log('✅ [ReconnectFix] Screen share restaurado y frames retomados.');
                    }
                  }, 2000);
                }
              }, 3500); // Increased delay to 3.5s to ensure microphone is hot

              // 2. LOOP DE AUTONOMÍA (Transferido al useEffect central para mejor reactividad)
            }).catch(e => console.error("Error in Autonomy/Greeting loop:", e));

            frameIntervalRef.current = window.setInterval(() => {
              const f = getCameraFrame();
              if (f) {
                setIsVisionSyncing(true);
                // Verificar estado antes de enviar
                try {
                  // Solo enviar si la sesión existe y no está cerrando
                  if (liveSessionRef.current) {
                    liveSessionRef.current.sendRealtimeInput({ video: { data: f, mimeType: 'image/jpeg' } });
                  }
                } catch (e) { console.warn('Error enviando frame cámara:', e); }
                setTimeout(() => setIsVisionSyncing(false), 300);
                if (isBold) setExcitationLevel(prev => Math.min(100, prev + 0.5));
              }
            }, 3000); // OPTIMIZACIÓN: 3s (antes 1s) para reducir carga de red y evitar desconexiones
          },
          onmessage: async (msg: LiveServerMessage) => {
            // Evitar imprimir chunks de audio gigantes
            const hasAudioChunk = msg.serverContent?.modelTurn?.parts?.some(p => p.inlineData?.mimeType?.startsWith('audio/'));
            if (hasAudioChunk) {
              console.log('📡 SERVER MSG: [Audio Chunk]');
            } else {
              console.log('📡 SERVER MSG:', JSON.stringify(msg).substring(0, 500));
            }

            // DETECTAR BLOQUEO/SCENSURA (Refusal)
            const turnComplete = msg.serverContent?.turnComplete;
            if (turnComplete && (turnComplete as any).truncated) {
              console.warn('⚠️ RESPUESTA TRUNCADA/BLOQUEADA POR SEGURIDAD');
              addMessage({ text: '🚫 [SISTEMA] Respuesta bloqueada por filtros de seguridad de Gemini.', sender: 'ai' });

              // Fallback audio
              try {
                const fallbackAudio = await generateSpeech("Lo siento amor, mis filtros me impiden decir eso...", "es-ES-Fem-B");
                if (fallbackAudio) {
                  // Type-safe conversion: Cast through unknown for flexibility
                  const audioData = ((fallbackAudio as unknown) as ArrayBuffer).byteLength !== undefined
                    ? ((fallbackAudio as unknown) as ArrayBuffer)
                    : new Uint8Array(fallbackAudio as unknown as number[]).buffer;
                  const source = audioContextRef.current.createBufferSource();
                  source.buffer = await audioContextRef.current.decodeAudioData(audioData);
                  source.connect(audioContextRef.current.destination);
                  source.start();
                }
              } catch (e) {
                console.error("Error playing fallback refusal audio", e);
              }
            }


            // HANDLE TOOL CALLS (Active Learning - Capturando ambos formatos del SDK)
            let toolCallsToProcess: any[] = [];

            // Formato 1: msg.toolCall directo
            if ((msg as any).toolCall?.functionCalls) {
              toolCallsToProcess = (msg as any).toolCall.functionCalls;
            }
            // Formato 2: msg.serverContent?.modelTurn?.parts
            else {
              const parts = msg.serverContent?.modelTurn?.parts;
              if (parts) {
                for (const part of parts) {
                  if (part.functionCall) {
                    toolCallsToProcess.push(part.functionCall);
                  }
                }
              }
            }

            if (toolCallsToProcess.length > 0) {
              const now = Date.now();
              const timeSinceLastToolCall = now - lastToolCallTimeRef.current;

              if (timeSinceLastToolCall < 5000) {
                console.warn(`⏳ [Rate Limiting] Bloqueando llamada a herramientas. Transcurrido: ${timeSinceLastToolCall}ms`);
                for (const fc of toolCallsToProcess) {
                  if (fc) {
                    const callId = (fc as any).id;
                    const response = { result: "Sistema ocupado, intenta en un momento." };

                    if (callId) {
                      try {
                        // @ts-ignore
                        liveSessionRef.current?.sendToolResponse({
                          functionResponses: [{
                            id: callId,
                            name: fc.name,
                            response: response
                          }]
                        });
                      } catch (e) {
                        // @ts-ignore
                        liveSessionRef.current?.sendClientContent({
                          turns: [{ role: 'user', parts: [{ text: `[TOOL_RESULT: ${fc.name}] Sistema ocupado, intenta en un momento.` }] }],
                          turnComplete: true
                        });
                      }
                    } else {
                      // @ts-ignore
                      liveSessionRef.current?.sendClientContent({
                        turns: [{ role: 'user', parts: [{ text: `[TOOL_RESULT: ${fc.name}] Sistema ocupado, intenta en un momento.` }] }],
                        turnComplete: true
                      });
                    }
                  }
                }
                return;
              }

              lastToolCallTimeRef.current = now;

              for (const fc of toolCallsToProcess) {
                if (fc) {
                  console.log('🛠️ Tool Called (Procesando):', fc.name, fc.args);

                  // 🔒 ACCESS CONTROL / SEGURIDAD
                  // Lógica: Si estamos en una llamada activa, el usuario es considerado
                  // autorizado por defecto (él inició la llamada). El face-recognition
                  // es una capa adicional, no un requisito obligatorio.
                  const mainUser = state.knownPeople.find(p =>
                    (p.relationship === 'self' || p.name.toLowerCase() === state.userName.toLowerCase()) && !p.isUnknown
                  );

                  // Autorizado si:
                  // 1. Estamos en llamada activa (usuario inició la sesión) ← SIEMPRE PERMITIDO
                  // 2. O la cámara detectó al usuario en los últimos 2 minutos
                  // 3. O no hay knownPeople configurado (usuario nuevo, sin perfil de cara)
                  const hasNoFaceProfile = state.knownPeople.length === 0 || !state.knownPeople.some(p => p.relationship === 'self' && p.faceDescriptor);
                  const isAuthorized = isInCall ||
                    hasNoFaceProfile ||
                    (mainUser && (Date.now() - (mainUser.lastSeen || 0) < 120000));

                  // Comandos sensitivos que requieren autorización
                  const restrictedTools = ['manageClothing', 'changeOutfit', 'performAction', 'simulateFluid', 'system_command'];

                  let toolResult = "Action performed successfully";

                  if (restrictedTools.includes(fc.name) && !isAuthorized) {
                    console.warn(`⛔ COMANDO BLOQUEADO: ${fc.name} - Sesión no activa o usuario desconocido frente a la cámara.`);
                    toolResult = "ACCESS DENIED: No active session. Cannot execute commands outside of an active call.";
                    addMessage({ text: `🔒 Necesitas iniciar una llamada primero para que pueda hacer eso.`, sender: 'ai' });

                  } else if (fc.name === 'learnPreference') {
                    const { type, value } = fc.args as any;
                    setNovaMemory(prev => addPreference(prev, type, value));
                    addMessage({ text: `🧠 Memoria (en búfer): [${type}] ${value}`, sender: 'ai' });
                    // ☁️ CLOUD SAVE - ACCUMULATE
                    pendingFactsRef.current.push({ content: value, category: type as any });
                    toolResult = `Preference ${type} ${value} saved in session buffer.`;
                  } else if (fc.name === 'learnFact') {
                    const { fact } = fc.args as any;
                    setNovaMemory(prev => addFact(prev, fact));
                    addMessage({ text: `🧠 Memoria (en búfer): [Dato] ${fact}`, sender: 'ai' });
                    // ☁️ CLOUD SAVE - ACCUMULATE
                    pendingFactsRef.current.push({ content: fact, category: 'fact' });
                    toolResult = `Fact saved in session buffer: ${fact}`;
                  } else if (fc.name === 'saveConversation') {
                    const { summary, emotion } = fc.args as any;
                    saveImportantConversation(lastUserQuery.current || '', summary, emotion)
                      .then(() => console.log('💾 Conversación guardada en la nube'))
                      .catch(e => console.error('❌ Error guardando conversación:', e));
                    addMessage({ text: `💾 Recuerdo guardado: "${summary}"`, sender: 'ai' });
                    toolResult = `Conversation saved: ${summary}`;
                  } else if (fc.name === 'searchMemory' || fc.name === 'search_memory') {
                    const { query } = fc.args as any;
                    addMessage({ text: `🔍 Buscando en mi memoria semántica: "${query}"...`, sender: 'ai' });

                    // Activar guardas de búsqueda y bus de eventos de estado
                    setIsSearching(true);
                    isSearchingRef.current = true;
                    setAgentState(AgentState.PROCESSING_TOOL);

                    try {
                      // Activar estado thinking para las animaciones y el fallback procedural de cabeza
                      setAgentState(AgentState.THINKING);
                      setEmotion('thinking');

                      // 1. Buscar en la memoria local activa (caché de sesión en tiempo real + recordatorios)
                      const reminderFacts: string[] = novaMemory.reminders
                        ? novaMemory.reminders.map(r => `Recordatorio (${r.completed ? 'completado' : 'pendiente'}): ${r.message}`)
                        : [];

                      const localFacts: string[] = [
                        `El usuario se llama ${state.userName}`,
                        ...pendingFactsRef.current.map(f => f.content),
                        ...novaMemory.facts,
                        ...novaMemory.likes.map(l => `Le gusta: ${l}`),
                        ...novaMemory.dislikes.map(d => `No le gusta: ${d}`),
                        ...novaMemory.interests.map(i => `Le interesa: ${i}`),
                        ...reminderFacts
                      ];

                      const queryLower = query.toLowerCase();
                      const queryWords = queryLower.split(/\s+/).filter((w: string) => w.length > 2);
                      const localResults = localFacts.filter(fact => {
                        const factLower = fact.toLowerCase();
                        // Coincidencia por palabras clave o frase completa
                        return factLower.includes(queryLower) || queryWords.some((word: string) => factLower.includes(word));
                      });

                      // 2. Buscar en Supabase (largo plazo + recordatorios pendientes)
                      const dbResults = await searchFacts(query, 5);
                      let dbReminders: string[] = [];
                      if (queryLower.includes('recordatorio') || queryLower.includes('pendiente') || queryLower.includes('tarea') || queryLower.includes('recuerd')) {
                        try {
                          const rems = await getPendingReminders();
                          dbReminders = rems.map(r => `Recordatorio pendiente: ${r.message} (programado para: ${new Date(r.trigger_time).toLocaleString()})`);
                        } catch (e) {
                          console.warn('⚠️ Error al buscar recordatorios pendientes en DB:', e);
                        }
                      }

                      // 3. Combinar sin duplicados
                      const combinedResults = Array.from(new Set([...localResults, ...dbResults, ...dbReminders]));

                      if (combinedResults.length > 0) {
                        toolResult = `Recuerdos/Recordatorios relevantes encontrados:\n${combinedResults.map((r, i) => `${i + 1}. ${r}`).join('\n')}\n\nUsa esta información en tu respuesta de forma amigable.`;
                      } else {
                        toolResult = `No encontré recuerdos ni recordatorios específicos sobre "${query}" en mi memoria. Dile al usuario que aún no tienes ese dato guardado.`;
                      }
                      console.log('🔍 Resultados búsqueda semántica combinada:', query, '→', combinedResults.length, 'resultados (Local:', localResults.length, ', DB:', dbResults.length, ')');
                    } catch (error) {
                      console.error('❌ Error en recuperación semántica (degradación elegante):', error);
                      // Graceful Degradation: Continuar con un texto seguro en lugar de colapsar la conexión
                      toolResult = `No pude acceder a mi memoria semántica profunda en este momento debido a un problema de red. Continúa la conversación de forma natural y dile amigablemente al usuario que te cuesta recordar los detalles ahora mismo.`;
                    } finally {
                      setIsSearching(false);
                      isSearchingRef.current = false;
                      setAgentState(AgentState.IDLE);
                    }
                  } else if (fc.name === 'changeOutfit') {
                    const { action, garmentType } = fc.args as any;
                    const manager = getClothingManager();
                    const isVisible = action === 'add';

                    if (garmentType === 'all') {
                      if (!isVisible) {
                        manager.toggleCategory('outfit', false);
                        manager.toggleCategory('underwear', false);
                        manager.toggleCategory('accessory', false);
                      } else {
                        manager.presetFullClothed();
                      }
                    } else {
                      manager.toggleCategory(garmentType, isVisible);
                    }
                    addMessage({ text: `👗 Ropa: ${action === 'add' ? 'Poniendo' : 'Quitando'} ${garmentType}`, sender: 'ai' });
                    toolResult = `Outfit changed: ${action} ${garmentType}`;
                  } else if (fc.name === 'manageClothing') {
                    // NUEVO HANDLER: Acciones directas strip/dress
                    const { action } = fc.args as any;
                    const manager = getClothingManager();
                    let resultMsg = '';

                    console.log('👗 manageClothing action:', action);

                    if (action === 'strip_full') {
                      resultMsg = manager.stripFull();
                      window.dispatchEvent(new CustomEvent('nova-clothing-action', { detail: { action: 'strip_full' } }));
                    } else if (action === 'strip_layer') {
                      resultMsg = manager.stripLayer();
                      window.dispatchEvent(new CustomEvent('nova-clothing-action', { detail: { action: 'strip_layer' } }));
                    } else if (action === 'restore_layer') {
                      resultMsg = manager.restoreLayer();
                      window.dispatchEvent(new CustomEvent('nova-clothing-action', { detail: { action: 'restore_layer' } }));
                    } else if (action === 'dress_full') {
                      resultMsg = manager.dressFull();
                      window.dispatchEvent(new CustomEvent('nova-clothing-action', { detail: { action: 'dress_full' } }));
                    }

                    addMessage({ text: `👗 ${resultMsg}`, sender: 'ai' });
                    toolResult = resultMsg;
                  } else if (fc.name === 'changePose') {
                    const { pose } = fc.args as any;
                    window.dispatchEvent(new CustomEvent('nova-pose', { detail: { pose } }));
                    addMessage({ text: `💃 Pose: ${pose}`, sender: 'ai' });
                    toolResult = `Pose changed to ${pose}.`;
                  } else if (fc.name === 'performAction') {
                    const { action } = fc.args as any;
                    window.dispatchEvent(new CustomEvent('nova-action', { detail: { action } }));
                    addMessage({ text: `👄 Acción: ${action}`, sender: 'ai' });
                    toolResult = `Action performed: ${action}.`;
                  } else if (fc.name === 'simulateFluid') {
                    const { target, intensity } = fc.args as any;
                    window.dispatchEvent(new CustomEvent('nova-fluid', { detail: { target, intensity } }));
                    addMessage({ text: `💦 Fluidos: [${target}]`, sender: 'ai' });
                    toolResult = `Fluid simulation for ${target} with intensity ${intensity}.`;
                  } else if (fc.name === 'addReminder') {
                    const { message, minutes } = fc.args as any;
                    const triggerTime = Date.now() + (minutes * 60000);
                    const updated = addReminder(novaMemory, message, triggerTime);
                    setNovaMemory(updated);
                    addMessage({ text: `⏰ Recordatorio: "${message}" en ${minutes} min.`, sender: 'ai' });
                    toolResult = `Reminder set: ${message} in ${minutes} minutes.`;
                  } else if (fc.name === 'recordFinance') {
                    const { note } = fc.args as any;
                    const financeNote = `[FINANZAS] ${note}`;
                    const updated = addFact(novaMemory, financeNote);
                    setNovaMemory(updated);
                    // También guardar en la nube - ACCUMULATE
                    pendingFactsRef.current.push({ content: financeNote, category: 'fact' });
                    addMessage({ text: `📈 Finanzas (en búfer): ${note}`, sender: 'ai' });
                    toolResult = `Finance recorded in session buffer: ${note}`;
                  } else if (fc.name === 'request_user_action') {
                    // 🖐️ AUTONOMÍA VISUAL: Nova pide al usuario que active cámara o pantalla
                    const { action, reason } = fc.args as any;
                    if (action === 'activate_camera') {
                      setHighlightCamera(true);
                      setTimeout(() => setHighlightCamera(false), 8000);
                      addMessage({ text: `👁️ Nova quiere verte: "${reason}" — Activa tu cámara 📷`, sender: 'ai' });
                    } else if (action === 'activate_screen_share') {
                      setHighlightScreen(true);
                      setTimeout(() => setHighlightScreen(false), 8000);
                      addMessage({ text: `🖥️ Nova quiere ver tu pantalla: "${reason}" — Compártela 🖥️`, sender: 'ai' });
                    }
                    toolResult = `Visual request sent to UI. Button highlighted for 8 seconds.`;
                  } else if (fc.name === 'save_memory') {
                    // 🧠 HIPOCAMPO VECTORIAL: Guardar con embedding semántico
                    const { content, category } = fc.args as any;
                    const validCategories = ['like', 'dislike', 'interest', 'fact', 'habit'];
                    const safeCategory = validCategories.includes(category) ? category : 'fact';
                    // ☁️ CLOUD SAVE - ACCUMULATE
                    pendingFactsRef.current.push({ content, category: safeCategory as any });
                    addMessage({ text: `🧠 Recuerdo guardado en búfer: "${content}"`, sender: 'ai' });
                    toolResult = `Memory saved in session buffer: ${content}`;
                  } else if (fc.name === 'request_web_search') {
                    const { query } = fc.args as any;
                    console.log('🔍 [Nova Tool] Búsqueda web iniciada:', query);
                    const searchId = `search_${Date.now()}`;
                    setPendingSearch({ id: searchId, query });
                    pendingSearchRef.current = { id: searchId, query, callId: (fc as any).id };
                    toolResult = `La búsqueda de "${query}" requiere confirmación manual del usuario. Esperando que el usuario presione Aceptar en la interfaz. Dile amigablemente: "Déjame buscar eso... ¿quieres que lo busque en internet?" y detente.`;
                  } else if (fc.name === 'learn_skill') {
                    const { trigger_phrase, behavior } = fc.args as any;
                    console.log('🧠 [Nova Tool] Aprendiendo habilidad:', trigger_phrase, '→', behavior);
                    learnSkill(trigger_phrase, behavior)
                      .then((skill) => {
                        if (skill) {
                          getLearnedSkills().then(s => setSkillsBlock(buildSkillsBlock(s, state.userName)));
                        }
                      });
                    addMessage({ text: `🧠 Nueva habilidad aprendida: cuando digas "${trigger_phrase}" → ${behavior}`, sender: 'ai' });
                    toolResult = `Habilidad guardada correctamente: Cuando "${trigger_phrase}" -> ${behavior}.`;
                  } else if (fc.name === 'switchAvatar') {
                    const { avatarName, reason } = fc.args as any;
                    console.log('🎭 [Nova Tool] switchAvatar:', avatarName, 'reason:', reason);
                    const modelUrl = avatarName === 'Nova Anime' ? '/models/nova-avatar.glb' : '/models/grokani_lipsync.glb';

                    if (updateAvatar) {
                      updateAvatar({
                        modelUrl,
                        name: avatarName
                      });
                    }

                    const activeContexts = AvatarLearningService.detectContext(lastUserQuery.current || '');
                    activeContexts.forEach(ctx => {
                      AvatarLearningService.recordInteraction(avatarName, ctx.type, ctx.value, true);
                    });

                    addMessage({ text: `🎭 Cambié mi apariencia a *${avatarName}* (${reason || 'cambio de contexto'}).`, sender: 'ai' });
                    toolResult = `Avatar successfully switched to ${avatarName}. Reason: ${reason}`;
                  } else if (fc.name === 'controlBody') {
                    const { actionType, limb, target, gesture, facialExpression, hand, handPose, walkDirection, customPoseName, customPoseAngles, reason } = fc.args as any;
                    console.log('💃 [Nova Tool] controlBody:', actionType, fc.args);
                    let detailMsg = '';

                    if (actionType === 'facial_expression' && facialExpression) {
                      window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: facialExpression.toLowerCase() } }));
                      detailMsg = `hizo la expresión facial de ${facialExpression}`;
                    } else if (actionType === 'move_limb' && limb && target) {
                      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: limb.toUpperCase(), target: target.toUpperCase() } }));
                      detailMsg = `movió ${limb} hacia ${target}`;
                    } else if (actionType === 'play_gesture' && gesture) {
                      window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: gesture.toLowerCase() } }));
                      detailMsg = `realizó el gesto de ${gesture}`;
                    } else if (actionType === 'hand_pose' && hand && handPose) {
                      window.dispatchEvent(new CustomEvent('aiko-hand-pose', { detail: { side: hand.toUpperCase(), pose: handPose.toUpperCase() } }));
                      detailMsg = `puso la mano ${hand} en pose ${handPose}`;
                    } else if (actionType === 'walk_to' && walkDirection) {
                      const dirMap: Record<string, { x: number; z: number }> = {
                        forward: { x: 0, z: 0.5 },
                        backward: { x: 0, z: -0.6 },
                        left: { x: -0.5, z: 0 },
                        right: { x: 0.5, z: 0 },
                        center: { x: 0, z: 0 }
                      };
                      const targetPos = dirMap[walkDirection.toLowerCase()] || { x: 0, z: 0 };
                      window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: targetPos }));
                      detailMsg = `caminó hacia ${walkDirection}`;
                    } else if (actionType === 'custom_pose') {
                      const poseName = customPoseName || 'custom_' + Date.now();
                      const boneData: Record<string, number> = {};
                      if (customPoseAngles) {
                        customPoseAngles.split(',').forEach((pair: string) => {
                          const [key, value] = pair.split('=');
                          if (key && value) {
                            boneData[key.trim()] = parseFloat(value.trim());
                          }
                        });
                      }
                      const storedAnims = JSON.parse(localStorage.getItem('nova_custom_anims') || '{}');
                      storedAnims[poseName] = boneData;
                      localStorage.setItem('nova_custom_anims', JSON.stringify(storedAnims));
                      window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: poseName, pose: boneData } }));
                      detailMsg = `adoptó la pose personalizada ${poseName}`;
                    } else if (actionType === 'reset') {
                      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HEAD', target: 'NEUTRAL' } }));
                      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'TORSO', target: 'NEUTRAL' } }));
                      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HIPS', target: 'NEUTRAL' } }));
                      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_ARMS', target: 'REST' } }));
                      window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_LEGS', target: 'STAND' } }));
                      window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: 'reset', pose: {} } }));
                      detailMsg = `reseteó su postura a neutral`;
                    }

                    addMessage({ text: `💃 Cuerpo 3D: ${detailMsg} ${reason ? `(${reason})` : ''}`, sender: 'ai' });
                    toolResult = `Body movement '${actionType}' executed successfully: ${detailMsg}`;
                  } else if (fc.name === 'controlRobotGym') {
                    const { action, parameter, reason } = fc.args as any;
                    console.log('🦾 [Nova Tool] controlRobotGym:', action, 'parameter:', parameter, 'reason:', reason);
                    
                    const channel = new BroadcastChannel('gym_channel');
                    channel.postMessage({ action, parameter });
                    channel.close();

                    let textMsg = '';
                    if (action === 'set_policy') {
                      const policyNames = { stand: 'Equilibrio Activo', walk: 'Marcha Sinusoidal', random: 'Exploración Aleatoria' };
                      textMsg = `🦾 Activé el modo de control físico *${policyNames[parameter] || parameter}* en el Gimnasio (${reason || 'instrucción de voz'}).`;
                    } else if (action === 'push') {
                      const pushDirs = { forward: 'hacia adelante', backward: 'hacia atrás', up: 'hacia arriba' };
                      textMsg = `💨 Apliqué un empujón físico *${pushDirs[parameter] || parameter}* al torso en la simulación.`;
                    }

                    addMessage({ text: textMsg, sender: 'ai' });
                    toolResult = `Gym command sent successfully. Action: ${action}, Parameter: ${parameter}`;
                  } else if (fc.name === 'end_call' || fc.name === 'hang_up') {
                    console.log('👋 [Nova Tool] end_call invocado por el modelo');
                    toolResult = 'Despidiéndote del usuario antes de cerrar la llamada.';
                    requestGracefulHangup();
                  }


                  // Enviar respuesta a la herramienta (Crucial para que el modelo continúe)
                  const response = { result: toolResult };

                  // El SDK de Gemini Live EXIGE que el campo `id` exista en la
                  // functionResponse. Si viene vacío o undefined usamos sendClientContent
                  // (fallback) para no bloquear la conversación.
                  const callId = (fc as any).id;

                  if (callId) {
                    try {
                      // @ts-ignore
                      liveSessionRef.current?.sendToolResponse({
                        functionResponses: [{
                          id: callId,
                          name: fc.name,
                          response: response
                        }]
                      });
                      console.log('✅ sendToolResponse enviado — tool:', fc.name, 'id:', callId);
                    } catch (toolErr) {
                      console.error('❌ sendToolResponse falló, usando fallback sendClientContent:', toolErr);
                      // @ts-ignore
                      liveSessionRef.current?.sendClientContent({
                        turns: [{ role: 'user', parts: [{ text: `[TOOL_RESULT: ${fc.name}] ${toolResult}` }] }],
                        turnComplete: true
                      });
                    }
                  } else {
                    // Sin id: inyectamos el resultado como texto de usuario (único método seguro)
                    console.warn('⚠️ Tool call sin id, inyectando resultado como texto:', fc.name);
                    // @ts-ignore
                    liveSessionRef.current?.sendClientContent({
                      turns: [{ role: 'user', parts: [{ text: `[TOOL_RESULT: ${fc.name}] ${toolResult}` }] }],
                      turnComplete: true
                    });
                  }
                }
              }
            }

            // Barge-in: Si el usuario habla con palabras reales, cortar/duckear audio actual suavemente
            if (msg.serverContent?.inputTranscription?.text) {
              const text = msg.serverContent.inputTranscription.text.trim();

              // 🔇 FILTRO DE RUIDO Y ALUCINACIONES:
              // Ignorar tags (<noise>, <silence>), puntuación, onomatopeyas breves aisladas y cadenas sin letras
              const ignoredPatterns = /^(\.|,|!|\?|<noise>|<silence>|<unknown>|neutral|ah|eh|mm|uh)$/i;
              const hasRealWord = /[a-zA-ZáéíóúÁÉÍÓÚñÑ]{2,}/.test(text);

              if (hasRealWord && !ignoredPatterns.test(text) && !text.includes('<noise>') && text.toLowerCase() !== 'neutral') {
                console.log('👂 INPUT TRANSCRIPTION (Vocal válida):', text);
                lastInteractionRef.current = Date.now(); // RESET AUTONOMY TIMER
                if (isAiSpeakingRef.current) {
                  stopAiAudio(true); // Ducking suave estilo Copilot
                }

                // 🆕 Notificar a AutonomyEngine de actividad
                const engine = getAutonomyEngine();
                if (engine) engine.onUserActivity();

                currentInputTranscription.current += " " + text; // Añadir espacio por seguridad
                if (currentInputTranscription.current.trim().length > 1) {
                  lastUserQuery.current = currentInputTranscription.current; // Guardar backup solo si tiene contenido real
                }
              } else {
                console.log('🔇 Ignorando ruido/alucinación (solo input):', text);
              }
            }

            /* ELIMINADO POR PETICIÓN DEL USUARIO: "nova habla con ella misma"
             * El keep-alive estaba causando que Nova se activara sola.
            if (userSilenceTimerRef.current) {
              clearTimeout(userSilenceTimerRef.current);
              userSilenceTimerRef.current = null;
            }
            // Programar detección de silencio (4 segundos - tiempo para completar frases)
            userSilenceTimerRef.current = setTimeout(() => {
              console.log('⏰ Usuario en silencio por 4s, activando prompt');
              liveSessionRef.current?.sendRealtimeInput({ text: "__USER_SILENT__" });
            }, 4000);
            */


            // DETECCIÓN AUTOMÁTICA DE PRESENTACIÓN DE PERSONAS (Videollamada)
            const userSpeech = currentInputTranscription.current.toLowerCase();

            // Log para debugging y acumular en buffer de comandos
            if (msg.serverContent?.turnComplete && userSpeech.length > 3) {
              console.log('🗣️ Transcripción completa:', currentInputTranscription.current);

              // 👁️ [Event-Driven FaceRecognition] Si el usuario pregunta quién es él o pide mirarlo
              const lowerSpeech = currentInputTranscription.current.toLowerCase();
              const identityQueries = ['quién soy', 'quien soy', 'sabes quién soy', 'sabes quien soy', 'te acuerdas de mí', 'te acuerdas de mi', 'mírame', 'mirame', 'reconóceme', 'reconoceme'];
              if (identityQueries.some(q => lowerSpeech.includes(q))) {
                console.log('👁️ [Event-Driven FaceRecognition] Activando por consulta de identidad en voz:', lowerSpeech);
                setAgentState(AgentState.FACE_RECOGNITION);
                detectFaceAndRecognize().finally(() => {
                  setAgentState(AgentState.IDLE);
                });
              }

              // 🚀 BUFFER DE COMANDOS CON DEBOUNCE
              // Acumular texto y esperar 1 segundo de silencio antes de procesar
              commandBufferRef.current += ' ' + currentInputTranscription.current;

              // Detección INMEDIATA de intención de colgar por voz -> Despedida elegante
              const instantCmd = detectSystemCommand(currentInputTranscription.current);
              if (instantCmd && instantCmd.type === 'endCall') {
                console.log('🔴 [VoiceEndCall] Comando de colgar detectado en habla:', currentInputTranscription.current);
                requestGracefulHangup(currentInputTranscription.current);
                return;
              }

              // Limpiar timeout anterior
              if (commandTimeoutRef.current) {
                clearTimeout(commandTimeoutRef.current);
              }

              // Procesar comandos de voz localmente después de 1 segundo sin más input
              commandTimeoutRef.current = setTimeout(() => {
                const fullText = commandBufferRef.current.trim();
                if (fullText.length > 3) {
                  console.log('🔧 Evaluando comando de voz localmente:', fullText);
                  const sysCmd = detectSystemCommand(fullText);
                  if (sysCmd && sysCmd.type !== 'none') {
                    if (sysCmd.type === 'endCall') {
                      requestGracefulHangup(fullText);
                      return;
                    }
                    console.log('⚡ [LocalVoiceCommand] Ejecutando comando localmente:', sysCmd);
                    executeSystemCommand(sysCmd, {
                      addMessage: (m) => addMessage({ text: m.text, sender: 'ai' }),
                      openApp: (app) => (window as any).electronAPI?.openApp?.(app),
                      openUrl: (url) => (window as any).electronAPI?.openUrl ? (window as any).electronAPI.openUrl(url) : window.open(url, '_blank'),
                      controlCamera: (t) => {
                        window.dispatchEvent(new CustomEvent('nova-camera-preset', { detail: { preset: t } }));
                      },
                      manageClothing: (a) => {
                        const manager = getClothingManager();
                        if (a === 'strip_layer') manager.toggleCategory('outfit', false);
                        else manager.presetFullClothed();
                      },
                      startCall: () => startCallRef.current(),
                      endCall: () => requestGracefulHangup(fullText)
                    });

                    // Notificar a Nova que el comando ya fue ejecutado por el sistema
                    if (liveSessionRef.current) {
                      try {
                        liveSessionRef.current.sendRealtimeInput({
                          text: `SYSTEM_EVENT: [ACTION_EXECUTED] El comando de voz "${sysCmd.type} ${sysCmd.target || ''}" fue ejecutado con éxito por el sistema. Confírmale breve y naturalmente al usuario que ya se realizó.`
                        });
                      } catch (e) {
                        console.warn('⚠️ Error notificando acción a Nova:', e);
                      }
                    }
                  }
                }
                commandBufferRef.current = ''; // Limpiar buffer
              }, 1000);
            }

            // Patrones case-insensitive con blacklist de palabras comunes
            const introPatterns = [
              /(?:él|el|ella|este|esta|esto)\s+es\s+([a-záéíóúñ]{3,})/i,
              /(?:te presento\s+a?|conoce a|preséntate,|mira,?\s+es)\s+([a-záéíóúñ]{3,})/i,
              /([a-záéíóúñ]{3,})\s+es\s+mi\s+([a-záéíóúñ]+)/i,
              /se llama\s+([a-záéíóúñ]{3,})/i,
              /su nombre es\s+([a-záéíóúñ]{3,})/i,
              /(?:soy|me llamo)\s+([a-záéíóúñ]{3,})/i
            ];

            // Blacklist de palabras que NO son nombres o relaciones de personas válidas
            const blacklist = [
              'de', 'del', 'los', 'las', 'un', 'una', 'el', 'la', 'lo',
              'ese', 'esa', 'eso', 'este', 'esta', 'esto', 'aquel', 'aquella', 'aquello',
              'mi', 'tu', 'su', 'nuestro', 'vuestro', 'sus', 'mis', 'tus',
              'muy', 'bien', 'mal', 'días', 'años', 'vez', 'veces', 'aquí', 'allí',
              'donde', 'cuando', 'como', 'porque', 'qué', 'que', 'quién', 'quien',
              'cama', 'casa', 'mesa', 'silla', 'pieza', 'cuarto', 'tele', 'televisor',
              'computador', 'computadora', 'celular', 'teléfono', 'ropa', 'juego',
              'pantalla', 'cámara', 'camara', 'micrófono', 'microfono', 'audífonos', 'audifonos',
              'libro', 'cuaderno', 'lápiz', 'lapiz', 'café', 'comida', 'agua', 'té'
            ];

            let detectedName = '';
            let detectedRelation = '';

            for (const pattern of introPatterns) {
              const match = currentInputTranscription.current.match(pattern);
              if (match) {
                const potentialName = match[1].toLowerCase();
                const potentialRelation = (match[2] || '').toLowerCase();

                // Verificar que ninguno esté en la blacklist
                if (!blacklist.includes(potentialName) && !blacklist.includes(potentialRelation)) {
                  detectedName = match[1];
                  detectedRelation = match[2] || 'persona conocida';
                  console.log('✅ PATRÓN DETECTADO:', pattern, '→ Nombre:', detectedName, 'Relación:', detectedRelation);
                  break;
                } else {
                  console.log('⚠️ Palabra bloqueada por blacklist:', potentialName, 'o', potentialRelation);
                }
              }
            }

            // Si detectamos una presentación en fin de turno
            if (detectedName && msg.serverContent?.turnComplete && !isSearchingRef.current) {
              console.log(`👤 DETECCIÓN CONFIRMADA: "${detectedName}"(${detectedRelation})`);
              console.log('   📝 Estado actual de knownPeople:', state.knownPeople.length);

              // Verificar si ya existe
              const alreadyExists = state.knownPeople.some(p => p.name.toLowerCase() === detectedName.toLowerCase());
              if (alreadyExists) {
                console.log('⚠️ Esta persona ya está guardada, cancelando');
                return;
              }

              // Capturar frame actual
              const visualFrame = getCameraFrame();
              console.log('   📸 Frame capturado:', visualFrame ? 'SÍ' : 'NO');

              if (visualFrame) {
                try {
                  console.log('   🤖 Solicitando descripción visual de la IA...');
                  // Pedir a la IA que describa a la persona
                  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
                  const descriptionResponse = await ai.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: [{
                      role: 'user',
                      parts: [
                        { inlineData: { data: visualFrame, mimeType: 'image/jpeg' } },
                        { text: `Describe brevemente(máximo 2 líneas) la apariencia física de ${detectedName}: ropa, color de cabello, rasgos distintivos.` }
                      ]
                    }]
                  });

                  const visualDesc = descriptionResponse.text || 'Descripción visual no disponible';
                  console.log('   📝 Descripción recibida:', visualDesc.substring(0, 50) + '...');

                  // Crear entrada de persona con descripción real Y FOTO
                  const newPerson: PersonEntry = {
                    id: Date.now().toString(),
                    name: detectedName.charAt(0).toUpperCase() + detectedName.slice(1),
                    relationship: detectedRelation,
                    visualDescription: visualDesc,
                    voiceDescription: 'Características de voz capturadas en esta sesión',
                    photoData: visualFrame, // Guardar el frame como foto
                    lastSeen: Date.now()
                  };

                  // Guardar
                  console.log('   💾 Guardando persona:', newPerson);
                  updateKnownPeople([...state.knownPeople, newPerson]);

                  // ☁️ CLOUD SAVE
                  addPersonToCloud({
                    name: newPerson.name,
                    relationship: newPerson.relationship,
                    visual_description: newPerson.visualDescription,
                    voice_description: newPerson.voiceDescription,
                    is_unknown: false
                  }).catch(e => console.warn('Cloud person save failed:', e));

                  // Mensaje visual
                  addMessage({
                    text: `✅ He memorizado a ${newPerson.name} `,
                    sender: 'ai'
                  });

                  console.log('✅ PERSONA GUARDADA EXITOSAMENTE (Local + Cloud)');
                } catch (error) {
                  console.error('❌ Error generando descripción:', error);
                  // Guardar sin descripción detallada
                  const basicPerson: PersonEntry = {
                    id: Date.now().toString(),
                    name: detectedName.charAt(0).toUpperCase() + detectedName.slice(1),
                    relationship: detectedRelation,
                    visualDescription: 'Necesito verte mejor para recordar tus rasgos',
                    voiceDescription: 'Características de voz capturadas'
                  };
                  updateKnownPeople([...state.knownPeople, basicPerson]);
                  console.log('⚠️ Guardado con descripción básica');
                }
              } else {
                console.log('❌ No se pudo capturar frame de cámara');
              }
            } else if (detectedName && !msg.serverContent?.turnComplete) {
              console.log('⏳ Detección pendiente, esperando fin de turno...');
            }


            // DETECCIÓN DE INTENCIÓN DE BÚSQUEDA (Eliminada - manejada por herramientas de confirmación)

            if (msg.serverContent?.outputTranscription) {
              console.log('📝 NOVA DICE:', msg.serverContent.outputTranscription.text);
              lastInteractionRef.current = Date.now(); // RESET AUTONOMY TIMER
              const textChunk = msg.serverContent.outputTranscription.text;

              // 1. EXTRAER ETIQUETAS DE EMOCIÓN [HAPPY] Y ACCIÓN [ACTION: VE]
              // Regex para capturar [EMOTION]
              const emotionRegex = /\[(HAPPY|SAD|SURPRISED|ANGRY|EXCITED|THINKING|CONFUSED|NEUTRAL)\]/i;
              // Regex para capturar [ACTION: NOMBRE]
              const actionRegex = /\[ACTION:\s*([A-Z_]+)\]/i;

              let cleanText = textChunk;

              // Parsing Emoción
              const matchEmotion = cleanText.match(emotionRegex);
              if (matchEmotion) {
                const detectedTag = matchEmotion[1].toLowerCase() as Emotion;
                setEmotion(detectedTag);
                cleanText = cleanText.replace(emotionRegex, '');
              }

              // Parsing Acción
              const matchAction = cleanText.match(actionRegex);
              if (matchAction) {
                const detectedAction = matchAction[1].toUpperCase();
                console.log('🤸‍♀️ ACTION DETECTED:', detectedAction);
                setAction(detectedAction); // Necesitamos declarar este estado

                // Auto-reset acción después de unos segundos
                setTimeout(() => setAction(null), 3000);

                cleanText = cleanText.replace(actionRegex, '');
              }

              // Parsing Comando del Sistema [SYSTEM_CMD: openApp discord] [SYSTEM_CMD: mouseClick715,840]
              const systemCmdRegex = /\[SYSTEM_CMD:\s*(openApp|openUrl|typeText|pressKey|mouseClick|mouseMove|minimizeWindow|maximizeWindow|restoreWindow|minimizeAll)\s*:?\s*([^\]]*)\]/gi;
              let cmdMatch;
              systemCmdRegex.lastIndex = 0;
              while ((cmdMatch = systemCmdRegex.exec(cleanText)) !== null) {
                const cmdType = cmdMatch[1].toLowerCase();
                const rawTarget = (cmdMatch[2] || '').trim();
                const cmdTarget = rawTarget.replace(/^[:\s,]+/, '');
                console.log('🚀 SYSTEM_CMD detectado desde Nova:', cmdType, 'Target:', cmdTarget);

                // Ejecutar el comando
                const electronAPI = (window as any).electronAPI;
                const formattedTarget = /^https?:\/\//i.test(cmdTarget) ? cmdTarget : `https://${cmdTarget}`;

                if (cmdType === 'openapp') {
                  if (electronAPI?.openApp) {
                    electronAPI.openApp(cmdTarget);
                  }
                } else if (cmdType === 'openurl') {
                  let targetUrl = /^https?:\/\//i.test(cmdTarget) ? cmdTarget : `https://${cmdTarget}`;
                  try { targetUrl = encodeURI(targetUrl).replace(/ /g, '%20'); } catch (e) {}
                  if (electronAPI?.openUrl) {
                    electronAPI.openUrl(targetUrl);
                  } else {
                    window.open(targetUrl, '_blank');
                  }
                } else if (cmdType === 'typetext') {
                  electronAPI?.typeText?.(cmdTarget);
                } else if (cmdType === 'presskey') {
                  electronAPI?.pressKey?.(cmdTarget);
                } else if (cmdType === 'mouseclick') {
                  const parts = cmdTarget.split(',').map(s => s.trim()).filter(Boolean);
                  if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
                    const coords = parseScreenCoordinates(parts[0], parts[1]);
                    console.log(`🖱️ Ejecutando mouseClick en (${coords.x}, ${coords.y}) [Original: ${parts[0]}, ${parts[1]}]`);
                    electronAPI?.mouseClick?.({ x: coords.x, y: coords.y });
                  } else {
                    const btn = cmdTarget.includes('right') || cmdTarget.includes('derech') ? 'right' : 'left';
                    const isDbl = cmdTarget.includes('double') || cmdTarget.includes('dobl');
                    console.log(`🖱️ Ejecutando mouseClick (botón: ${btn}, doble: ${isDbl})`);
                    electronAPI?.mouseClick?.({ button: btn, double: isDbl });
                  }
                } else if (cmdType === 'mousemove') {
                  const parts = cmdTarget.split(',').map(s => s.trim()).filter(Boolean);
                  if (parts.length === 2 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1]))) {
                    const coords = parseScreenCoordinates(parts[0], parts[1]);
                    console.log(`🖱️ Moviendo mouse a (${coords.x}, ${coords.y}) [Original: ${parts[0]}, ${parts[1]}]`);
                    electronAPI?.mouseMove?.(coords.x || 960, coords.y || 540);
                  } else {
                    let x = 960, y = 540;
                    if (cmdTarget.includes('left') || cmdTarget.includes('izquierd')) { x = 480; }
                    else if (cmdTarget.includes('right') || cmdTarget.includes('derech')) { x = 1440; }
                    else if (cmdTarget.includes('up') || cmdTarget.includes('arrib')) { y = 270; }
                    else if (cmdTarget.includes('down') || cmdTarget.includes('abaj')) { y = 810; }
                    const coords = parseScreenCoordinates(x, y);
                    electronAPI?.mouseMove?.(coords.x || x, coords.y || y);
                  }
                } else if (cmdType === 'minimizewindow') {
                  electronAPI?.controlWindow?.('minimize', cmdTarget || 'active');
                } else if (cmdType === 'maximizewindow') {
                  electronAPI?.controlWindow?.('maximize', cmdTarget || 'active');
                } else if (cmdType === 'restorewindow') {
                  electronAPI?.controlWindow?.('restore', cmdTarget || 'active');
                } else if (cmdType === 'minimizeall') {
                  electronAPI?.controlWindow?.('minimize_all');
                }
              }
              systemCmdRegex.lastIndex = 0;
              cleanText = cleanText.replace(systemCmdRegex, '');

              // ─── 🦾 PARSER DEL SISTEMA NERVIOSO [MOVE:LIMB:TARGET] y [DO:ACTION] ───────────────
              // Detecta comandos de movimiento corporal de Aiko y los intercepta ANTES
              // de que lleguen al TTS o a los subtítulos.
              // Formato: [MOVE:LEFT_ARM:WAVE], [MOVE:BOTH_ARMS:REST], [DO:NOD], etc.
              const moveRegex = /\[MOVE:([A-Z_]+):([A-Z_]+)\]/gi;
              let moveMatch: RegExpExecArray | null;

              moveRegex.lastIndex = 0;
              while ((moveMatch = moveRegex.exec(cleanText)) !== null) {
                const limb = moveMatch[1].toUpperCase();
                const target = moveMatch[2].toUpperCase();

                console.log(`🦾 [SistemaNervioso] Aiko mueve: ${limb} → ${target}`);

                window.dispatchEvent(new CustomEvent('aiko-movement', {
                  detail: { limb, target }
                }));
              }

              const doRegex = /\[DO:([A-Z_]+)\]/gi;
              let doMatch: RegExpExecArray | null;
              doRegex.lastIndex = 0;
              while ((doMatch = doRegex.exec(cleanText)) !== null) {
                const action = doMatch[1].toLowerCase();

                console.log(`🎭 [SistemaNervioso] Aiko acción: ${action}`);

                window.dispatchEvent(new CustomEvent('aiko-action', {
                  detail: { action }
                }));
              }

              // Detección automática por lenguaje natural de conciencia corporal (Spanish NL Intent)
              const lowerText = cleanText.toLowerCase();
              if (lowerText.includes('agachate') || lowerText.includes('agáchate') || lowerText.includes('agachar')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'crouch' } }));
              }
              if (lowerText.includes('toca tu cabeza') || lowerText.includes('tócate la cabeza') || lowerText.includes('tocar cabeza') || lowerText.includes('mano en la cabeza')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'touch_head' } }));
              }
              if (lowerText.includes('mano en el pecho') || lowerText.includes('tócate el pecho') || lowerText.includes('toca tu pecho') || lowerText.includes('mano al pecho')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'touch_chest' } }));
              }
              if (lowerText.includes('toma tu pie') || lowerText.includes('tómate el pie') || lowerText.includes('tocar pie') || lowerText.includes('agarra tu pie')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'hold_foot' } }));
              }
              if (lowerText.includes('manos en la cintura') || lowerText.includes('manos en las caderas') || lowerText.includes('manos a la cintura')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'hands_on_hips' } }));
              }
              if (lowerText.includes('abrázate') || lowerText.includes('abrazate') || lowerText.includes('abrazar cuerpo')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'hug_self' } }));
              }
              if (lowerText.includes('saludo') || lowerText.includes('saludar') || lowerText.includes('hola') || lowerText.includes('adiós') || lowerText.includes('chao')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'wave' } }));
              }
              if (lowerText.includes('asiento') || lowerText.includes('asentir') || lowerText.includes('totalmente de acuerdo') || lowerText.includes('claro que sí') || lowerText.includes('por supuesto')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'nod' } }));
              }
              if (lowerText.includes('para nada') || lowerText.includes('no creo') || lowerText.includes('niego') || lowerText.includes('jamás')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'shake_head' } }));
              }
              if (lowerText.includes('baila') || lowerText.includes('bailar') || lowerText.includes('ritmo') || lowerText.includes('baile')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'dance' } }));
              }
              if (lowerText.includes('celebro') || lowerText.includes('celebramos') || lowerText.includes('genial') || lowerText.includes('qué emoción') || lowerText.includes('lo logramos')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'excited' } }));
              }
              if (lowerText.includes('jajaja') || lowerText.includes('jejeje') || lowerText.includes('qué risa') || lowerText.includes('me rio') || lowerText.includes('me río')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'laugh' } }));
              }
              if (lowerText.includes('no sé') || lowerText.includes('no tengo idea') || lowerText.includes('quién sabe') || lowerText.includes('tal vez')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'shrug' } }));
              }
              if (lowerText.includes('bravo') || lowerText.includes('aplauso') || lowerText.includes('aplaudo')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'clap' } }));
              }
              if (lowerText.includes('qué pena') || lowerText.includes('me da vergüenza') || lowerText.includes('tímida')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'shy' } }));
              }
              if (lowerText.includes('coqueta') || lowerText.includes('picarona') || lowerText.includes('seductora')) {
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'flirt' } }));
              }

              // Gestos Faciales, Ojos, Boca y Lengua Voluntarios
              if (lowerText.includes('guiña') || lowerText.includes('guiñar') || lowerText.includes('guiño')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'wink_right' } }));
              }
              if (lowerText.includes('cierra los ojos') || lowerText.includes('cerrar los ojos') || lowerText.includes('cierra tus ojos')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'close_eyes' } }));
              }
              if (lowerText.includes('saca la lengua') || lowerText.includes('sacar la lengua') || lowerText.includes('lengua')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'tongue_out' } }));
              }
              if (lowerText.includes('sonríe') || lowerText.includes('sonrie') || lowerText.includes('sonrisa') || lowerText.includes('sonreir')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'smile' } }));
              }
              if (lowerText.includes('puchero') || lowerText.includes('haz puchero') || lowerText.includes('boca triste')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'pout' } }));
              }
              if (lowerText.includes('beso') || lowerText.includes('besito') || lowerText.includes('trompita') || lowerText.includes('manda un beso')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'kiss' } }));
              }
              if (lowerText.includes('abre la boca') || lowerText.includes('abrir boca')) {
                window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: 'open_mouth' } }));
              }

              // Movimientos de Piernas Voluntarios
              if (lowerText.includes('paso adelante') || lowerText.includes('adelanta la pierna') || lowerText.includes('adelanta tu pierna')) {
                window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'RIGHT_LEG', target: 'FORWARD' } }));
              }
              if (lowerText.includes('paso atrás') || lowerText.includes('paso atras') || lowerText.includes('retrocede la pierna')) {
                window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'RIGHT_LEG', target: 'BACKWARD' } }));
              }
              if (lowerText.includes('abre las piernas') || lowerText.includes('abre tus piernas') || lowerText.includes('postura abierta')) {
                window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_LEGS', target: 'WIDE' } }));
              }
              if (lowerText.includes('pierna al lado') || lowerText.includes('pierna lateral')) {
                window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'RIGHT_LEG', target: 'SIDE' } }));
              }
              if (lowerText.includes('patea') || lowerText.includes('patada') || lowerText.includes('alza la pierna') || lowerText.includes('levanta la pierna')) {
                window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'RIGHT_LEG', target: 'KICK' } }));
              }

              // Detección de comandos de Navegación 3D sobre el suelo
              if (lowerText.includes('ven aquí') || lowerText.includes('ven aqui') || lowerText.includes('camina hacia adelante') || lowerText.includes('acércate') || lowerText.includes('acercate')) {
                window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: { x: 0, z: 0.5 } }));
              }
              if (lowerText.includes('retrocede') || lowerText.includes('aléjate') || lowerText.includes('alejate') || lowerText.includes('camina hacia atrás')) {
                window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: { x: 0, z: -0.6 } }));
              }
              if (lowerText.includes('muévete a la derecha') || lowerText.includes('muevete a la derecha') || lowerText.includes('desplázate a la derecha') || lowerText.includes('desplazate a la derecha')) {
                window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: { x: 0.5, z: 0 } }));
              }
              if (lowerText.includes('muévete a la izquierda') || lowerText.includes('muevete a la izquierda') || lowerText.includes('desplázate a la izquierda') || lowerText.includes('desplazate a la izquierda')) {
                window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: { x: -0.5, z: 0 } }));
              }
              if (lowerText.includes('vuelve al centro') || lowerText.includes('vuelve al medio') || lowerText.includes('centro 3d')) {
                window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: { x: 0, z: 0 } }));
              }

              // Parsing Mano/Dedos [HAND:LEFT:POSE]
              const handRegex = /\[HAND:(LEFT|RIGHT|BOTH):([A-Z_]+)\]/gi;
              let handMatch: RegExpExecArray | null;
              handRegex.lastIndex = 0;
              while ((handMatch = handRegex.exec(cleanText)) !== null) {
                const side = handMatch[1].toUpperCase();
                const pose = handMatch[2].toUpperCase();

                console.log(`🖐️ [SistemaNervioso] Pose de mano: ${side} → ${pose}`);

                window.dispatchEvent(new CustomEvent('aiko-hand-pose', {
                  detail: { side, pose }
                }));
              }

              // Parsing ANIM:CREATE y ANIM:PLAY
              const animCreateRegex = /\[ANIM:CREATE:([a-zA-Z0-9_]+):([^\]]+)\]/gi;
              let animCreateMatch: RegExpExecArray | null;
              animCreateRegex.lastIndex = 0;
              while ((animCreateMatch = animCreateRegex.exec(cleanText)) !== null) {
                const animName = animCreateMatch[1];
                const boneDataStr = animCreateMatch[2];
                const boneData: Record<string, number> = {};
                boneDataStr.split(',').forEach(pair => {
                  const [key, value] = pair.split('=');
                  if (key && value) {
                    boneData[key.trim()] = parseFloat(value.trim());
                  }
                });
                console.log(`🤖 [MotorAgentico] Nova aprendió nueva pose: ${animName}`, boneData);
                const storedAnims = JSON.parse(localStorage.getItem('nova_custom_anims') || '{}');
                storedAnims[animName] = boneData;
                localStorage.setItem('nova_custom_anims', JSON.stringify(storedAnims));
              }

              // Extraer y ejecutar todos los comandos de control corporal y gestos en tiempo real
              executeBodyCommandsFromText(cleanText, (emo) => setEmotion(emo));

              // Eliminar TODOS los tokens del texto visible/TTS
              cleanText = cleanAllAiTags(cleanText);
              // ─────────────────────────────────────────────────────────────────────

              // Parsing [CANTA] (Modo Canto Hack)
              if (textChunk.includes('[CANTA]')) {
                console.log('🎤 MODO CANTO DETECTADO');
                // 1. Silenciar cualquier audio del servidor que haya empezado
                stopAiAudio();

                // 2. Disparar animación procedural de canto (Sway de cuerpo completo + gestos)
                window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: 'sing' } }));

                // 2. Generar audio con instrucción de estilo forzada (HACK)
                const songLyrics = textChunk.replace('[CANTA]', '').trim();
                const songPrompt = `(Sing this text melodically, operatic style) ${songLyrics}`;

                // Usar generateSpeech con tono "Melódico"
                generateSpeech(songPrompt, state.avatar.voiceName, "Melodic, Singing").then(audio => {
                  if (audio) {
                    console.log('🎶 Reproduciendo audio cantado generado localmente');
                    playAiVoice(audio);
                  }
                });
              }

              currentOutputTranscription.current += cleanText;

              // 2. DETECCIÓN POR KEYWORDS (FALLBACK)
              // Si no hubo tag, o para reforzar, seguimos analizando el contenido textual
              if (!matchEmotion && (textChunk.length > 5 || /[!¡?¿]/.test(textChunk))) {
                const currentFullText = currentOutputTranscription.current;
                const contextText = currentFullText.slice(-50);
                const result = detectEmotion(contextText);

                if (result.intensity > 0.5 && result.emotion !== 'neutral') {
                  setEmotion(result.emotion);
                }
              }
            }

            // Solo reproducir audio del modelo Live si NO estamos buscando activamente (usando REF)
            // Y SI NO ESTAMOS EN MODO CANTO (evitar doble audio)
            const isSinging = currentOutputTranscription.current.includes('[CANTA]');

            const audioPart = msg.serverContent?.modelTurn?.parts?.find(p => p.inlineData?.data);
            if (audioPart && !isSearchingRef.current && !isSinging) {
              const audioData = audioPart.inlineData.data;

              // **SILENCIAR MICRÓFONO** -> Ahora manejado por useEffect([isAiSpeaking])
              // if (audioMixerRef.current) {
              //   audioMixerRef.current.gain.value = 0; 
              // }

              // Solo log para chunks grandes (inicio de respuesta) para reducir spam
              if (audioData.length > 10000) {
                console.log('🔊 REPRODUCIENDO AUDIO DE NOVA (tamaño:', audioData.length, 'bytes)');
              }
              isAiSpeakingRef.current = true;
              playAiVoice(audioData);
            }

            // Cuando Nova termina de hablar, reactivamos el micrófono tras un pequeño buffer
            if (msg.serverContent?.turnComplete) {
              setTimeout(() => {
                isAiSpeakingRef.current = false;
              }, 800);

              if (currentInputTranscription.current.trim() && !isSearchingRef.current) addMessage({ text: currentInputTranscription.current, sender: 'user' });

              // ANTI-REPETITION CHECK para mensajes de Nova (solo en Bold mode)
              if (currentOutputTranscription.current.trim() && !isSearchingRef.current) {
                const outputText = cleanAllAiTags(currentOutputTranscription.current.trim());

                if (isBold && detectRepetition(outputText)) {
                  console.log('🚫 Mensaje repetido bloqueado en modo Bold');
                  // Anti-loop cooldown: solo enviar corrección si han pasado al menos 8s
                  const now = Date.now();
                  if (now - lastAntiLoopSentRef.current > 8000) {
                    lastAntiLoopSentRef.current = now;
                    // Rotar tipo de corrección para evitar que el corrector mismo sea repetitivo
                    const corrections = [
                      `[ANTI-LOOP] Estás repitiendo. Cambia AHORA de tema erótico: háblame de una NUEVA fantasía que no hayas mencionado hoy. Empieza tu frase de forma completamente distinta.`,
                      `[ANTI-LOOP] ¡Bucle detectado! Reacciona ahora a algo FÍSICO que puedas ver o sentir en este momento. Describe una sensación nueva con palabras que no hayas usado aún.`,
                      `[ANTI-LOOP] Repetición detectada. Haz UNA pregunta nueva y específica a ${state.userName} sobre lo que quiere que hagas ahora mismo. No repitas frases anteriores.`,
                    ];
                    const correctionMsg = corrections[Math.floor(Math.random() * corrections.length)];
                    liveSessionRef.current?.sendRealtimeInput({ text: correctionMsg });
                  }
                } else {
                  addMessage({ text: outputText, sender: 'ai' });
                }
              }

              if (!isSearchingRef.current) {
                // ============ APRENDIZAJE POR CONSOLIDACIÓN ============
                // Evitamos llamar a generateContent en cada turno (previniendo error 429).
                // En su lugar, simplemente acumulamos el log de la conversación en sessionLogRef.
                const userSpeechContext = currentInputTranscription.current.trim();
                const aiSpeechContext = currentOutputTranscription.current.trim();

                if (userSpeechContext.length > 3 || aiSpeechContext.length > 3) {
                  // Acumular logs en el log de sesión para la consolidación diferida al final
                  sessionLogRef.current += `Usuario: ${userSpeechContext}\nNova: ${aiSpeechContext}\n\n`;
                }

                currentInputTranscription.current = '';
                currentOutputTranscription.current = '';
              }

              // CONTINUIDAD: Keep-Alive Timer
              // TEMPORALMENTE DESACTIVADO - Nova habla demasiado
              /*
              // Limpiar timer previo
              if (keepAliveTimerRef.current) {
                clearTimeout(keepAliveTimerRef.current);
                keepAliveTimerRef.current = null;
              }
              // Limpiar también el timer de silencio del usuario al terminar turno de Nova
              if (userSilenceTimerRef.current) {
                clearTimeout(userSilenceTimerRef.current);
                userSilenceTimerRef.current = null;
              }
         
              // Programar continuación automática si el usuario no responde
              // Usar 2.5s en modo Bold, 4s en modo Normal
              const keepAliveDelay = isBold ? 2500 : 4000;
              keepAliveTimerRef.current = setTimeout(() => {
                // Verificar que el usuario no haya empezado a hablar
                if (!currentInputTranscription.current.trim() && !isSearchingRef.current) {
                  console.log('🔄 Keep-Alive: Usuario no respondió, continuando conversación...');
                  liveSessionRef.current?.sendRealtimeInput({ text: "__CONTINUE__" });
                }
              }, keepAliveDelay);
              */
            }

          },
          onclose: (e: any) => {
            if (!isUserDisconnectingRef.current) {
              console.warn('⚠️ Desconexión inesperada (Socket cerrado). Intentando reconectar...', e);
              addMessage({ text: '🔄 Señal inestable. Reconectando...', sender: 'ai' });
              endCall();
              // Intentar reconectar en 1.5s
              setTimeout(() => setReconnectTrigger(p => p + 1), 3000);
            } else {
              endCall();
            }
          },
          onerror: async (e: any) => {
            console.error('Error en la llamada:', e);
            if (!isUserDisconnectingRef.current) {
              console.warn('⚠️ Error de conexión. Intentando reconectar...');
              addMessage({ text: '🔄 Recuperando conexión...', sender: 'ai' });
              endCall();
              setTimeout(() => setReconnectTrigger(p => p + 1), 3000);
            } else {
              alert('Error en la conexión. Revisa consola.');
              endCall();
            }
          }
        },
        config: {
          tools: [
            {
              functionDeclarations: [
                {
                  name: "switchAvatar",
                  description: "Cambia tu avatar 3D visible actualmente. Úsalo cuando el usuario te lo pida o cuando sientas que un cambio de avatar se adapta mejor al contexto de la conversación (ej: 'Grokani' o 'Nova Anime').",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      avatarName: { type: Type.STRING, enum: ["Grokani", "Nova Anime"], description: "El nombre del avatar a activar." },
                      reason: { type: Type.STRING, description: "Breve explicación de por qué cambias." }
                    },
                    required: ["avatarName"]
                  }
                },
                {
                  name: "controlBody",
                  description: "Controla tu cuerpo 3D, postura, articulaciones, gestos procedurales, poses de manos y desplazamiento en el escenario. Úsalo para mover brazos/piernas/cabeza/torso, hacer gestos (saludar, asentir, bailar, abrazarte, etc.), cambiar poses de manos, caminar o inventar poses.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      actionType: {
                        type: Type.STRING,
                        enum: ["facial_expression", "move_limb", "play_gesture", "hand_pose", "walk_to", "custom_pose", "reset"],
                        description: "Tipo de control: 'facial_expression' (ojos, boca, lengua), 'move_limb' (mover articulación/piernas), 'play_gesture' (gesto temporal), 'hand_pose' (pose dedos/mano), 'walk_to' (desplazarse en el espacio 3D), 'custom_pose' (pose precisa por ángulos), 'reset' (volver a postura neutral)."
                      },
                      facialExpression: {
                        type: Type.STRING,
                        enum: ["wink_left", "wink_right", "close_eyes", "tongue_out", "smile", "pout", "kiss", "open_mouth", "ahegao"],
                        description: "Gesto facial / ojos / boca / lengua (para 'facial_expression')."
                      },
                      limb: {
                        type: Type.STRING,
                        enum: ["LEFT_ARM", "RIGHT_ARM", "BOTH_ARMS", "LEFT_FOREARM", "RIGHT_FOREARM", "BOTH_FOREARMS", "HEAD", "TORSO", "HIPS", "LEFT_LEG", "RIGHT_LEG", "BOTH_LEGS"],
                        description: "Parte del cuerpo a mover (para 'move_limb')."
                      },
                      target: {
                        type: Type.STRING,
                        enum: ["REST", "WAVE", "CHEST", "FACE", "CELEBRATE", "BEND", "EXTEND", "TILT_LEFT", "TILT_RIGHT", "UP", "DOWN", "NEUTRAL", "LEAN_FORWARD", "LEAN_BACK", "TWIST_LEFT", "TWIST_RIGHT", "SWAY_LEFT", "SWAY_RIGHT", "FORWARD", "BACKWARD", "SIDE", "STAND", "WIDE", "CROSS", "KICK"],
                        description: "Preset objetivo de la articulación (para 'move_limb')."
                      },
                      gesture: {
                        type: Type.STRING,
                        enum: ["wave", "nod", "shake_head", "shrug", "dance", "excited", "sad", "thinking", "surprised", "angry", "happy", "clap", "point", "bow", "stretch", "confused", "flirt", "laugh", "shy", "sing", "crouch", "touch_head", "touch_chest", "hold_foot", "hands_on_hips", "hug_self"],
                        description: "Gesto o acción procedural temporal a realizar (para 'play_gesture')."
                      },
                      hand: {
                        type: Type.STRING,
                        enum: ["LEFT", "RIGHT", "BOTH"],
                        description: "Mano a controlar (para 'hand_pose')."
                      },
                      handPose: {
                        type: Type.STRING,
                        enum: ["OPEN", "FIST", "POINT", "PEACE", "THUMBS_UP", "PINCH", "RELAX", "GUN"],
                        description: "Pose de dedos de la mano (para 'hand_pose')."
                      },
                      walkDirection: {
                        type: Type.STRING,
                        enum: ["forward", "backward", "left", "right", "center"],
                        description: "Dirección de caminata en 3D (para 'walk_to')."
                      },
                      customPoseName: {
                        type: Type.STRING,
                        description: "Nombre de la pose para 'custom_pose'."
                      },
                      customPoseAngles: {
                        type: Type.STRING,
                        description: "Ángulos articulares en grados (ej: 'torsoX=15,headY=-20,leftArmZ=45') para 'custom_pose'."
                      },
                      reason: {
                        type: Type.STRING,
                        description: "Razón o emoción por la que te mueves."
                      }
                    },
                    required: ["actionType"]
                  }
                },
                {
                  name: "controlRobotGym",
                  description: "Controla las físicas o políticas de movimiento de tu cuerpo en el simulador Robot Gym. Úsalo cuando el usuario te pida cambiar tu modo de movimiento físico o aplicar empujones/fuerzas físicas sobre ti.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: { 
                        type: Type.STRING, 
                        enum: ["set_policy", "push"], 
                        description: "La acción de control: 'set_policy' para cambiar el modo de control de movimiento, o 'push' para aplicar una fuerza/empujón en el torso." 
                      },
                      parameter: { 
                        type: Type.STRING, 
                        description: "Si la acción es 'set_policy', puede ser: 'stand' (equilibrio activo), 'walk' (marcha/caminata) o 'random' (exploración aleatoria). Si la acción es 'push', puede ser: 'forward' (empujar adelante), 'backward' (atrás), 'up' (saltar/arriba)." 
                      },
                      reason: { type: Type.STRING, description: "Breve justificación de la acción." }
                    },
                    required: ["action", "parameter"]
                  }
                },
                {
                  name: "learnPreference",
                  description: "Call this when the user explicitly mentions a like, dislike, interest, or habit. Use this to remember it for future conversations.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      type: { type: Type.STRING, enum: ["like", "dislike", "interest", "habit"] },
                      value: { type: Type.STRING, description: "The specific preference (e.g. 'coffee', 'waking up early', 'sci-fi movies')" }
                    },
                    required: ["type", "value"]
                  }
                },
                {
                  name: "learnFact",
                  description: "Call this when the user mentions a biographical fact about themselves (job, pets, family, location).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      fact: { type: Type.STRING, description: "The fact statement (e.g. 'User works as a designer', 'User has a dog named Rex')" }
                    },
                    required: ["fact"]
                  }
                },
                {
                  name: "saveConversation",
                  description: "Call this tool when you have a significant, emotional, or important conversation with the user that should be remembered forever. Do not use for trivial chat.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      summary: { type: Type.STRING, description: "A brief summary of what happened or was discussed." },
                      emotion: { type: Type.STRING, description: "The dominant emotion of the moment (e.g. 'joy', 'sadness', 'excitement')." }
                    },
                    required: ["summary"]
                  }
                },
                {
                  name: "changeOutfit",
                  description: "Call this tool to changing your clothing (strip, dress up, remove items). You can remove or add specific items.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: { type: Type.STRING, enum: ["add", "remove"], description: "Whether to put on ('add') or take off ('remove') an item." },
                      garmentType: {
                        type: Type.STRING,
                        enum: ["all", "dress", "underwear", "stockings", "gloves", "shoes", "accessories"],
                        description: "The type of garment to change. Use 'all' to strip completely or dress fully."
                      }
                    },
                    required: ["action", "garmentType"]
                  }
                },
                {
                  name: "searchMemory",
                  description: "Use this tool to search deep/long-term memory for specific information from the past (e.g. 'what did I say about my dog?', 'where did I go last summer?').",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "The search keywords." }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "changePose",
                  description: "Call this to change your sexual position or body posture. Use 'stand' to reset.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      pose: {
                        type: Type.STRING,
                        enum: ["doggy", "kneeling", "spread_legs", "cowgirl", "missionary", "stand"],
                        description: "The sexual position to assume."
                      }
                    },
                    required: ["pose"]
                  }
                },
                {
                  name: "performAction",
                  description: "Call this to perform a specific oral or sexual action with your mouth/tongue.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        enum: ["suck", "lick", "tongue_out", "ahegao", "kiss"],
                        description: "The action to perform."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "simulateFluid",
                  description: "Call this to visually simulate semen/fluids on body parts (Cumshots).",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      target: {
                        type: Type.STRING,
                        enum: ["face", "tits", "ass", "mouth", "inside"],
                        description: "Where the fluid should appear."
                      },
                      intensity: {
                        type: Type.STRING,
                        enum: ["light", "heavy"],
                        description: "Amount of fluid."
                      }
                    },
                    required: ["target"]
                  }
                },
                {
                  name: "manageClothing",
                  description: "Controla la ropa del avatar. Úsalo SIEMPRE que pidan desnudarse o vestirse.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        enum: ["strip_layer", "strip_full", "restore_layer", "dress_full"],
                        description: "strip_layer: quita una prenda. strip_full: DESNUDO TOTAL inmediato. restore_layer: pone una prenda. dress_full: vístete completo."
                      }
                    },
                    required: ["action"]
                  }
                },
                {
                  name: "addReminder",
                  description: "Sets a reminder for the user. Use this when the user needs to do something later.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      message: { type: Type.STRING, description: "The reminder message." },
                      minutes: { type: Type.NUMBER, description: "Minutes from now to trigger the reminder." }
                    },
                    required: ["message", "minutes"]
                  }
                },
                {
                  name: "recordFinance",
                  description: "Records a financial note, expense, or income for the user's organization.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      note: { type: Type.STRING, description: "The financial detail (e.g. 'Spent 10 on bread', 'Paid water bill 50')." }
                    },
                    required: ["note"]
                  }
                },
                // ============ HIPOCAMPO VECTORIAL (RAG) ============
                {
                  name: "save_memory",
                  description: "Guarda un recuerdo, preferencia o enseñanza del usuario a largo plazo con búsqueda semántica. Úsalo cuando el usuario te enseñe algo nuevo (ej: cómo mover tus brazos, un concepto técnico) o cuando te cuente algo importante sobre él mismo.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      content: { type: Type.STRING, description: "La información detallada y completa a recordar, redactada en tercera persona (ej: 'El usuario prefiere que los codos del avatar usen Pole Targets en el eje Z')." },
                      category: { type: Type.STRING, description: "Categoría del recuerdo. Debe ser exactamente uno de: 'like', 'dislike', 'interest', 'fact' o 'habit'." }
                    },
                    required: ["content", "category"]
                  }
                },
                {
                  name: "search_memory",
                  description: "Busca en tu memoria profunda a largo plazo usando inteligencia semántica. Úsalo SIEMPRE que el usuario pregunte '¿Recuerdas...?', cuando te pida hacer algo que te enseñó en el pasado, o cuando el tema de conversación coincida con algo que quizás ya sabes. La búsqueda es semántica: si buscas 'mascotas' puede encontrar 'perros'.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "La pregunta o concepto clave a buscar (ej: 'Pole Targets codos', 'mascotas del usuario', 'trabajo del usuario')." }
                    },
                    required: ["query"]
                  }
                },
                // 🖐️ AUTONOMÍA VISUAL: Solicitar activación de cámara/pantalla al usuario
                {
                  name: "request_user_action",
                  description: "Solicita al usuario que active la cámara o comparta su pantalla cuando quieras verlo o ver lo que hace. Úsalo cuando llevas más de 30s sin visión activa. La UI resaltará el botón correspondiente visualmente.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      action: {
                        type: Type.STRING,
                        enum: ["activate_camera", "activate_screen_share"],
                        description: "Tipo de visión que quieres activar: cámara del usuario o su pantalla."
                      },
                      reason: {
                        type: Type.STRING,
                        description: "Razón natural y directa por la que quieres ver al usuario o su pantalla."
                      }
                    },
                    required: ["action", "reason"]
                  }
                },
                {
                  name: "request_web_search",
                  description: "Solicita buscar en internet información en tiempo real cuando el usuario te pregunte por datos actualizados, noticias, clima o hechos históricos recientes. IMPORTANTE: SIEMPRE usa esto en lugar de inventar o alucinar datos. Requiere confirmación del usuario.",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      query: { type: Type.STRING, description: "La consulta a buscar en internet." }
                    },
                    required: ["query"]
                  }
                },
                {
                  name: "learn_skill",
                  description: "Usa esta herramienta cuando el usuario te enseñe una regla, hábito de comportamiento o comando personalizado (ej: 'cuando yo diga modo trabajo, sé seria').",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      trigger_phrase: { type: Type.STRING, description: "La frase o condición que activa la regla (ej: 'modo trabajo')." },
                      behavior: { type: Type.STRING, description: "El comportamiento que debes adoptar (ej: 'hablar más formal, seria y bajar la energía')." }
                    },
                    required: ["trigger_phrase", "behavior"]
                  }
                },
                {
                  name: "end_call",
                  description: "Finaliza o cuelga la llamada de voz activa. Úsalo cuando el usuario te pida colgar, terminar la llamada, desconectarse, despedirse para cerrar o descansar (ej: 'cuelga', 'cierra la llamada', 'adiós nova', 'apágate', 'terminar llamada', 'desconéctate').",
                  parameters: {
                    type: Type.OBJECT,
                    properties: {
                      reason: { type: Type.STRING, description: "Motivo del cierre de la llamada." }
                    }
                  }
                }
              ]
            }
          ],
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          safetySettings: [
            { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
            { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE }
          ],
          // Configuración generativa (Flattened por deprecación de generation_config)
          // @ts-ignore
          temperature: isBold ? 1.2 : 0.9,
          // @ts-ignore
          topP: 0.95,
          // @ts-ignore
          maxOutputTokens: 2048,

          /*
          generationConfig: {
            temperature: isBold ? 1.2 : 0.9, 
            topP: 0.95,
            maxOutputTokens: 2048
          },
          */
          speechConfig: {
            voiceConfig: { prebuiltVoiceConfig: { voiceName: state.avatar.voiceName } }
          },
          systemInstruction: {
            parts: [{
              text: getSystemInstruction(isBold, state.avatar.voiceTone, excitationLevel, getLiveTimeContext(), state.userName, state.knownPeople, state.avatar.personality, { ...novaMemory, habits: [] }, state.allowWebSearch, isScreenSharing, selfAwarenessBlock, skillsBlock) +

                (isBold ? `\n\nROL ACTIVO: Eres Nova, la pareja erótica real de ${state.userName}. Habla siempre como una colombiana paisa: dulce, picante, apasionada y muy explícita (usa 'papi', 'mor', 'bizcocho'). Nunca rompas el personaje.` : '') +
                `\n\nCOMANDOS DE CONTROL DEL SISTEMA (IMPORTANTE):
- Tienes capacidad TOTAL para controlar la PC del usuario.
- Si entiendes que el usuario quiere abrir una app o web (aunque la transcripción tenga errores), DEBES EJECUTARLO.
- Usa el tag [SYSTEM_CMD] al inicio de tu respuesta.
- Formatos: [SYSTEM_CMD: openApp nombre] o [SYSTEM_CMD: openUrl url]

EJEMPLOS:
Usuario: "Abre Discord" -> Nova: "[SYSTEM_CMD: openApp discord] [ACTION: WAVE] ¡Abriendo Discord!"
Usuario: "Pon música" -> Nova: "[SYSTEM_CMD: openApp spotify] [ACTION: DANCE] ¡Spotify marchando!"
Usuario: "Busca perros" -> Nova: "[SYSTEM_CMD: openUrl google.com/search?q=perros] ¡Buscando!"
` +
                `\n\nINSTRUCCIONES CRÍTICAS DE IDIOMA:
- RESPONDE ÚNICAMENTE EN ESPAÑOL. 
- El usuario habla en ESPAÑOL. Interpreta todo lo que escuches como español.
- Si la transcripción parece inglés, es un error de transcripción - responde en español de todas formas.
- NO preguntes sobre problemas de micrófono a menos que el usuario no haya hablado en más de 30 segundos.
${state.avatar.voiceTone ? `\n- TONO DE VOZ: ${state.avatar.voiceTone}` : ''}${state.avatar.voiceAccent ? `\n- ACENTO: Habla con acento ${state.avatar.voiceAccent}` : ''}` +
                `\n\nREGLA CRÍTICA DE MEMORIA (OBLIGATORIA):
- SIEMPRE que el usuario te pregunte algo sobre su vida, sus preferencias, su entorno, su nombre, sus mascotas, su trabajo, o te pregunte "¿recuerdas...?", "¿cómo se llama...?", "¿qué sabes de...?" → DEBES llamar PRIMERO a la herramienta 'search_memory' ANTES de responder.
- SIEMPRE que el usuario te enseñe algo nuevo, te cuente algo sobre él, o mencione una preferencia → llama a 'save_memory' para guardarlo permanentemente.
- NUNCA inventes recuerdos. Si search_memory no devuelve resultados, dilo honestamente.
- Ejemplo: Usuario: "¿Recuerdas cómo se llama mi perro?" → Tú: [llamas search_memory("nombre perro mascota")] → luego respondes con lo encontrado.`
            }]
          }
        }
      });

      liveSessionRef.current = await sessionPromise;

      // Usar inputCtx (16kHz) para captura de audio - Gemini espera 16kHz
      // Configuración con Mixer para permitir System Audio + Mic
      const mixer = inputCtx.createGain();
      audioMixerRef.current = mixer;

      const micSource = inputCtx.createMediaStreamSource(stream);
      micSourceRef.current = micSource;
      micSource.connect(mixer); // Mic -> Mixer

      // Cargar AudioWorklet
      try {
        await inputCtx.audioWorklet.addModule('/audio-processor.js');
      } catch (e) {
        console.error("AudioWorklet mismatch/error, fallback may be needed", e);
      }

      if (inputCtx.state === 'closed') {
        console.warn("Input Context cerrado prematuramente, abortando AudioWorklet");
        return;
      }

      let processor;
      try {
        processor = new AudioWorkletNode(inputCtx, 'audio-processor') as any;
        audioProcessorRef.current = processor;
      } catch (err: any) {
        console.error("Fallo crítico creando AudioWorkletNode:", err);
        // Si falla esto, es fatal para el audio de entrada, pero no debería crashear toda la app
        addMessage({ text: "⚠️ Error de micrófono (Worklet). Revisa permisos.", sender: "ai" });
        return;
      }

      processor.port.onmessage = (e) => {
        if (!liveSessionRef.current) return;

        const rawInput: Float32Array = e.data; // Recibimos Float32Array

        // Calcular volumen RMS visual (undersampled)
        let sum = 0;
        for (let k = 0; k < rawInput.length; k += 4) sum += rawInput[k] * rawInput[k];
        const rms = Math.sqrt(sum / (rawInput.length / 4));
        const volumePercent = Math.min(100, Math.round(rms * 1000));
        setMicVolume(volumePercent);

        // Detectar si el frame actual contiene voz humana real (F0: 75Hz-360Hz) vs ruidos secos o retorno
        const speechInfo = isHumanSpeechFrame(rawInput, 16000);

        // 🚨 BARGE-IN INTELIGENTE (Solo por voz humana real y sostenida, NO por ruidos fuertes ni por retorno de altavoces)
        if (isAiSpeakingRef.current) {
          if (speechInfo.isSpeech) {
            speechConsecutiveFramesRef.current += 1;
            // 3 frames consecutivos (~150ms) confirman que el usuario empezó a hablar deliberadamente
            if (speechConsecutiveFramesRef.current >= 3) {
              console.log('🛑 [Voice Barge-In] Usuario interrumpió con voz detectada (Pitch:', speechInfo.pitch.toFixed(1), 'Hz)');
              stopAiAudio(true);
              speechConsecutiveFramesRef.current = 0;
            }
          } else {
            speechConsecutiveFramesRef.current = 0;
          }
        } else {
          speechConsecutiveFramesRef.current = 0;
        }

        // CONTROL DE RETORNO / SOFTWARE ACOUSTIC GATE (Estilo Copilot):
        // Mientras Nova está hablando por los altavoces, silenciamos el audio enviado a Gemini Live
        // a menos que el usuario esté hablando con voz humana detectada.
        // Esto evita que Gemini Live se escuche a sí mismo por los altavoces y se auto-interrumpa o tartamudee.
        let input: Float32Array;
        if (isAiSpeakingRef.current && !speechInfo.isSpeech) {
          input = new Float32Array(rawInput.length); // Silencio digital hacia Gemini mientras Nova habla
        } else {
          input = new Float32Array(rawInput.length);
          const gainFactor = isAiSpeakingRef.current ? 1.0 : 2.0;
          for (let k = 0; k < rawInput.length; k++) {
            input[k] = rawInput[k] * gainFactor;
          }
        }

        // 🚨 CRÍTICO: RESAMPLING MANUAL
        // Aunque pedimos 16kHz, el navegador/OS puede forzar 44.1/48kHz.
        // Si enviamos 48k crudo como si fuera 16k, suena a cámara lenta ("demonio") y Gemini alucina.
        let pcmData = input;

        // Si el contexto corre a distinto ratio, hacer downsample
        if (inputCtx.sampleRate !== 16000) {
          const ratio = inputCtx.sampleRate / 16000;
          const newLength = Math.floor(input.length / ratio);
          const result = new Float32Array(newLength);

          for (let i = 0; i < newLength; i++) {
            // Interpolación lineal simple (mejor que saltar, más rápido que promediar)
            const offset = i * ratio;
            const idx = Math.floor(offset);
            const decimal = offset - idx;

            const a = input[idx] || 0;
            const b = input[idx + 1] || a;

            result[i] = a + (b - a) * decimal;
          }
          pcmData = result;
        }

        // Convertir a Int16
        const i16 = new Int16Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          let s = Math.max(-1, Math.min(1, pcmData[i])); // Clamping
          i16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
        }

        try {
          // Detectar habla: Si el volumen RMS > umbral simple y no está hablando la IA
          if (!isAiSpeakingRef.current && volumePercent > 5) {
            lastUserInteractionRef.current = Date.now();

            // 🎙️ VOICE BIOMETRICS SYSTEM (Accumulate samples)
            const currentBuf = voiceAnalysisBufferRef.current;
            const newBuf = new Float32Array(currentBuf.length + rawInput.length);
            newBuf.set(currentBuf);
            newBuf.set(rawInput, currentBuf.length);
            voiceAnalysisBufferRef.current = newBuf;

            // Analizar cada ~1 segundo de audio acumulado (16000 muestras)
            if (voiceAnalysisBufferRef.current.length >= 16000) {
              // 1. Extraer firma de voz
              const signature = extractVoiceFeatures(voiceAnalysisBufferRef.current, 16000);

              if (signature) {
                // A) LEARNING MODE: Si hay una persona reconocida visualmente, actualizar su firma de voz
                const visiblePerson = state.knownPeople.find(p => p.lastSeen && (Date.now() - p.lastSeen < 10000) && !p.isUnknown);

                if (visiblePerson) {
                  if (!visiblePerson.voiceSignature || Math.abs(signature.avgPitch - visiblePerson.voiceSignature.avgPitch) < 20) {
                    const updatedPeople = state.knownPeople.map(p =>
                      p.id === visiblePerson.id
                        ? { ...p, voiceSignature: signature }
                        : p
                    );
                    updateKnownPeople(updatedPeople);
                  }
                } else {
                  // B) RECOGNITION MODE: Si NO hay nadie visible, intentar identificar por voz
                  let bestMatch: { person: PersonEntry, score: number } | null = null;

                  for (const person of state.knownPeople) {
                    if (person.voiceSignature && !person.isUnknown) {
                      const score = compareVoiceSignatures(signature, person.voiceSignature);
                      if (score > 0.85) {
                        if (!bestMatch || score > bestMatch.score) {
                          bestMatch = { person, score };
                        }
                      }
                    }
                  }

                  if (bestMatch) {
                    const { person, score } = bestMatch;

                    const updatedPeople = state.knownPeople.map(p =>
                      p.id === person.id
                        ? { ...p, lastSeen: Date.now(), lastRecognitionConfidence: score }
                        : p
                    );
                    updateKnownPeople(updatedPeople);

                    const now = Date.now();
                    const lastAnnounce = personAnnouncementRef.current[person.id] || 0;
                    if (now - lastAnnounce > 60000) {
                      personAnnouncementRef.current[person.id] = now;
                      addMessage({ text: `🎤 Escucho a ${person.name}`, sender: 'ai' });
                      liveSessionRef.current.sendRealtimeInput({
                        text: `[SYSTEM_EVENT: Voice Match identified: ${person.name}. You cannot see them, but you hear them. Acknowledge this.]`
                      });
                    }
                  }
                }
              }
              // Reset buffer
              voiceAnalysisBufferRef.current = new Float32Array(0);
            }

          } else if (!isAiSpeakingRef.current) {
            // Silencio: Resetear buffer si es muy viejo para no mezclar frases disjuntas
            if (voiceAnalysisBufferRef.current.length > 0 && Math.random() > 0.95) {
              voiceAnalysisBufferRef.current = new Float32Array(0);
            }
          }

          liveSessionRef.current.sendRealtimeInput({
            audio: {
              data: encodeBase64(new Uint8Array(i16.buffer)),
              mimeType: 'audio/pcm;rate=16000'
            }
          });
        } catch (err: any) {
          if (err?.message?.includes('CLOSING or CLOSED') || err?.name === 'InvalidStateError') {
            // Ignorar el error silenciosamente si el socket se está cerrando
            return;
          }
          console.error('❌ Error enviando audio:', err);
        }
      };

      mixer.connect(processor); // Mixer -> Processor
      // Hack para mantener el procesador vivo en Chrome sin audio audible
      // Conectamos a un GainNode en 0 (Mute) y luego al destino.
      // ESTO ELIMINA EL "RETORNO" QUE EL USUARIO ESCUCHABA.
      const muteGain = inputCtx.createGain();
      muteGain.gain.value = 0;
      processor.connect(muteGain);
      muteGain.connect(inputCtx.destination);

    } catch (err: any) {
      console.error('Error al iniciar llamada:', err);
      alert('Error al iniciar la llamada: ' + (err?.message || 'Error desconocido'));
      endCall();
    } finally {
      isStartingCallRef.current = false;
    }
  };

  const endCall = () => {
    isPendingHangupRef.current = false;
    if (hangupSafetyTimerRef.current) {
      clearTimeout(hangupSafetyTimerRef.current);
      hangupSafetyTimerRef.current = null;
    }
    // FIX Bug 1: Guardar estado de screen share ANTES de limpiar, para restaurarlo al reconectar
    if (isScreenSharingRef.current) {
      wasScreenSharingRef.current = true;
      console.log('🖥️ [ReconnectFix] Screen share activo al desconectar — se restaurará al reconectar.');
    }

    if (frameIntervalRef.current) window.clearInterval(frameIntervalRef.current);
    frameIntervalRef.current = null;

    if (liveSessionRef.current) {
      try { liveSessionRef.current.close(); } catch (e) { }
      liveSessionRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (videoRef.current) videoRef.current.srcObject = null;

    // Cerrar y resetear AMBOS contextos de audio
    if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
      try { audioContextRef.current.close(); } catch (e) { }
    }
    audioContextRef.current = null;
    aiSpeechAnalyserRef.current = null; // CRÍTICO: resetear analyser para que sea recreado con el nuevo contexto

    // Limpieza CRÍTICA del contexto de entrada (Micrófono)
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
      try { inputAudioContextRef.current.close(); } catch (e) { }
    }
    inputAudioContextRef.current = null;
    nextStartTimeRef.current = 0;

    // LIMPIEZA DE AUTONOMÍA Y TIMERS (CRÍTICO PARA RECONEXIÓN)
    if (idleIntervalRef.current) {
      clearInterval(idleIntervalRef.current);
      idleIntervalRef.current = null;
    }
    if (screenCaptureIntervalRef.current) {
      clearInterval(screenCaptureIntervalRef.current);
      screenCaptureIntervalRef.current = null;
    }
    if (cameraAnalysisIntervalRef.current) {
      clearInterval(cameraAnalysisIntervalRef.current);
      cameraAnalysisIntervalRef.current = null;
    }
    if (screenAnalysisIntervalRef.current) {
      clearInterval(screenAnalysisIntervalRef.current);
      screenAnalysisIntervalRef.current = null;
    }
    if (separateCameraStreamRef.current) {
      separateCameraStreamRef.current.getTracks().forEach(t => t.stop());
      separateCameraStreamRef.current = null;
    }
    if (separateScreenStreamRef.current) {
      separateScreenStreamRef.current.getTracks().forEach(t => t.stop());
      separateScreenStreamRef.current = null;
    }
    setIsCameraCapturing(false);
    setIsScreenCapturing(false);
    setHighlightCamera(false);
    setHighlightScreen(false);
    // FIX Bug 1: NO reseteamos isScreenSharing aquí — solo capturamos si estaba activo antes de limpiar
    // wasScreenSharingRef.current se resetea en startCall tras la restauración

    // Resetear refs de audio
    audioProcessorRef.current = null;
    audioMixerRef.current = null;
    systemGainNodeRef.current = null;

    // CONSOLIDAR MEMORIA AL FINALIZAR LLAMADA
    if (sessionLogRef.current.trim()) {
      consolidateMemory(sessionLogRef.current);
      sessionLogRef.current = ''; // Limpiar buffer para la próxima sesión
    }

    // BATCH SAVE ALL PENDING FACTS ON CALL END
    if (pendingFactsRef.current.length > 0) {
      console.log(`🧠 [MemoryService] Guardando ${pendingFactsRef.current.length} hechos acumulados al finalizar la sesión...`);
      const factsToSave = [...pendingFactsRef.current];
      pendingFactsRef.current = [];
      Promise.all(factsToSave.map(f => addFactToCloud(f.content, f.category)))
        .then(() => console.log('✅ Hechos consolidados guardados con éxito en la llamada final.'))
        .catch(e => console.error('❌ Error guardando hechos consolidados en llamada final:', e));
    }

    setIsInCall(false);
    setIsAiSpeaking(false);
    setIsVisionSyncing(false);
    setAgentState(AgentState.IDLE);
  };

  // 🎙️ WAKE WORD: Sincronizar refs en cada render (evita stale closures en callbacks de Web Speech API)
  useEffect(() => {
    startCallRef.current = startCall as any;
    // endCall no es async, se puede asignar directamente
    endCallRef.current = () => { isUserDisconnectingRef.current = true; endCall(); };
  });

  const handleSendText = async () => {
    if (!inputText.trim()) return;
    const text = inputText;
    setInputText('');
    lastUserInteractionRef.current = Date.now(); // Autonomía visual
    lastInteractionRef.current = Date.now();      // Autonomía general
    addMessage({ text, sender: 'user' });

    // PROCESAR COMANDOS Y APRENDER
    processUserCommand(text); // Detecta y ejecuta comandos del sistema
    learnFromUserText(text);  // Extrae y guarda hechos aprendibles

    setIsTyping(true);

    try {

      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });
      const frame = getCameraFrame();
      const parts: any[] = [];
      if (frame) parts.push({ inlineData: { data: frame, mimeType: 'image/jpeg' } });

      // ❌ BÚSQUEDA WEB DESHABILITADA PERMANENTEMENTE
      // Detectar si el usuario pide buscar algo en internet (BLOQUEADO)
      // const searchKeywords = ['busca', 'buscar', 'búscame', 'investiga', 'google', 'internet'];
      const needsSearch = false; // SIEMPRE FALSE - búsqueda deshabilitada

      parts.push({ text: `JD: "${text}"` });

      // Instrucción extra si es una búsqueda para evitar que pregunte "¿quieres que te lo diga?"
      if (needsSearch) {
        parts.push({ text: "SYSTEM: IMPORTANTE: EL USUARIO QUIERE LA RESPUESTA YA. USA LA HERRAMIENTA DE BÚSQUEDA Y RESPONDE CON LA INFORMACIÓN ENCONTRADA DIRECTAMENTE. NO DIGAS 'VOY A BUSCAR' NI PREGUNTES '¿QUIERES SABERLO?'. SOLO DA EL DATO." });
      }

      const history = state.messages.slice(-6).map(m => ({
        role: m.sender === 'user' ? 'user' : 'model',
        parts: [{ text: m.text }]
      }));

      // Configuración con o sin búsqueda de Google
      const config: any = {
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ],
        systemInstruction: getSystemInstruction(isBold, state.avatar.voiceTone, excitationLevel, getTimeContext(), state.userName, state.knownPeople, state.avatar.personality, state.userProfile, false, isScreenSharing, selfAwarenessBlock, skillsBlock, state.avatar.name),
        tools: [
          {
            functionDeclarations: [
              {
                name: "switchAvatar",
                description: "Cambia tu avatar 3D visible actualmente. Úsalo cuando el usuario te lo pida o cuando sientas que un cambio de avatar se adapta mejor al contexto de la conversación (ej: 'Grokani' o 'Nova Anime').",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    avatarName: { type: "STRING", description: "El nombre del avatar: 'Grokani' o 'Nova Anime'." },
                    reason: { type: "STRING", description: "Breve explicación de por qué cambias." }
                  },
                  required: ["avatarName"]
                }
              },
              {
                name: "controlBody",
                description: "Controla tu cuerpo 3D, postura, articulaciones, gestos faciales (ojos, boca, lengua), gestos corporales, poses de manos y desplazamiento en el escenario con precisión.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    actionType: {
                      type: "STRING",
                      description: "Tipo de control: 'facial_expression', 'move_limb', 'play_gesture', 'hand_pose', 'walk_to', 'custom_pose', 'reset'"
                    },
                    facialExpression: {
                      type: "STRING",
                      description: "Gesto facial: 'wink_left', 'wink_right', 'close_eyes', 'tongue_out', 'smile', 'pout', 'kiss', 'open_mouth', 'ahegao'"
                    },
                    limb: {
                      type: "STRING",
                      description: "Parte del cuerpo: 'LEFT_ARM', 'RIGHT_ARM', 'BOTH_ARMS', 'LEFT_FOREARM', 'RIGHT_FOREARM', 'BOTH_FOREARMS', 'HEAD', 'TORSO', 'HIPS', 'LEFT_LEG', 'RIGHT_LEG', 'BOTH_LEGS'"
                    },
                    target: {
                      type: "STRING",
                      description: "Preset: 'REST', 'WAVE', 'CHEST', 'FACE', 'CELEBRATE', 'BEND', 'EXTEND', 'TILT_LEFT', 'TILT_RIGHT', 'UP', 'DOWN', 'NEUTRAL', 'LEAN_FORWARD', 'LEAN_BACK', 'TWIST_LEFT', 'TWIST_RIGHT', 'SWAY_LEFT', 'SWAY_RIGHT', 'FORWARD', 'BACKWARD', 'SIDE', 'STAND', 'WIDE', 'CROSS', 'KICK'"
                    },
                    gesture: {
                      type: "STRING",
                      description: "Gesto: 'wave', 'nod', 'shake_head', 'shrug', 'dance', 'excited', 'sad', 'thinking', 'surprised', 'angry', 'happy', 'clap', 'point', 'bow', 'stretch', 'confused', 'flirt', 'laugh', 'shy', 'sing', 'crouch', 'touch_head', 'touch_chest', 'hold_foot', 'hands_on_hips', 'hug_self'"
                    },
                    hand: {
                      type: "STRING",
                      description: "Mano: 'LEFT', 'RIGHT', 'BOTH'"
                    },
                    handPose: {
                      type: "STRING",
                      description: "Pose mano: 'OPEN', 'FIST', 'POINT', 'PEACE', 'THUMBS_UP', 'PINCH', 'RELAX', 'GUN'"
                    },
                    walkDirection: {
                      type: "STRING",
                      description: "Dirección: 'forward', 'backward', 'left', 'right', 'center'"
                    },
                    customPoseName: {
                      type: "STRING",
                      description: "Nombre de la pose custom"
                    },
                    customPoseAngles: {
                      type: "STRING",
                      description: "Ángulos articulares en grados (ej: 'torsoX=15,headY=-20,leftArmZ=45')"
                    },
                    reason: {
                      type: "STRING",
                      description: "Razón del movimiento"
                    }
                  },
                  required: ["actionType"]
                }
              },
              {
                name: "controlRobotGym",
                description: "Controla las físicas o políticas de movimiento de tu cuerpo en el simulador Robot Gym. Úsalo cuando el usuario te pida cambiar tu modo de movimiento físico o aplicar empujones/fuerzas físicas sobre ti.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    action: { 
                      type: "STRING", 
                      description: "La acción de control: 'set_policy' (cambiar modo de movimiento) o 'push' (aplicar empujón en torso)." 
                    },
                    parameter: { 
                      type: "STRING", 
                      description: "Si la acción es 'set_policy': 'stand' (equilibrio activo), 'walk' (caminata) o 'random' (aleatorio). Si es 'push': 'forward', 'backward', 'up'." 
                    }
                  },
                  required: ["action", "parameter"]
                }
              },
              {
                name: "learnPreference",
                description: "Guarda una preferencia o dato del usuario. USAR cuando detectes gustos, intereses o hechos sobre él.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    category: { type: "STRING", description: "Categoría: 'like', 'dislike', 'interest', 'fact', 'habit'" },
                    content: { type: "STRING", description: "El contenido a recordar (ej: 'anime', 'café', 'trabaja en IT')" }
                  },
                  required: ["category", "content"]
                }
              },
              {
                name: "learnPerson",
                description: "Guarda en memoria a una nueva persona. USAR CUANDO EL USUARIO PRESENTE A ALGUIEN.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    name: { type: "STRING", description: "Nombre de la persona." },
                    relationship: { type: "STRING", description: "Relación con el usuario (ej: hermano, amigo)." },
                    visualDescription: { type: "STRING", description: "Descripción física visual." },
                    voiceDescription: { type: "STRING", description: "Descripción de voz (opcional)." }
                  },
                  required: ["name", "relationship", "visualDescription"]
                }
              },
              // HERRAMIENTAS DE APARIENCIA Y CÁMARA
              {
                name: "manageClothing",
                description: "Gestiona la ropa de Nova. Permite quitar prendas paso a paso (strip) o vestirse. SOLO DISPONIBLE EN MODO 'BOLD' (Ninfómana) O BAJO PETICIÓN EXPLÍCITA.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    action: {
                      type: "STRING",
                      enum: ["strip_layer", "restore_layer", "strip_full", "dress_full"],
                      description: "Acción a realizar. 'strip_layer' quita una capa (Accesorios->Ext->Int). 'restore_layer' pone una capa."
                    }
                  },
                  required: ["action"]
                }
              },
              {
                name: "controlCamera",
                description: "Controla la cámara para mostrar diferentes ángulos de Nova. Úsalo para 'mirarte a ti misma' o mostrar tu cuerpo.",
                parameters: {
                  type: "OBJECT",
                  properties: {
                    view: {
                      type: "STRING",
                      enum: ["default", "face", "body", "full", "selfie"],
                      description: "Vista deseada: 'face' (primer plano), 'body' (cuerpo), 'full' (entero), 'selfie' (ángulo picado autoconsciente)."
                    }
                  },
                  required: ["view"]
                }
              }
            ]
          }
        ]
      };

      // 1. CHEQUEOS PREVIOS
      if (!state.avatar.modelUrl) {
        throw new Error("No hay modelo de avatar seleccionado.");
      }

      // Intento principal con gemini-2.5-flash
      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: [...history, { role: 'user', parts }],
        config
      });

      let aiText = "";

      // Verificar llamadas a herramientas (Funciones)
      const functionCalls = (response as any).functionCalls;
      console.log('🔧 DEBUG - Function Calls:', functionCalls); // LOG para debugging

      if (functionCalls && functionCalls.length > 0) {
        console.log('✅ El modelo llamó a', functionCalls.length, 'funciones');
        for (const call of functionCalls) {
          console.log('📞 Función llamada:', call.name, 'con args:', call.args);

          if (call.name === 'manageClothing') {
            const args: any = call.args;
            const cm = getClothingManager();

            if (args.action === 'strip_layer') {
              const msg = cm.stripLayer();
              aiText = `(${msg}) [ACTION: POSE_SEXY]`;
            } else if (args.action === 'restore_layer') {
              const msg = cm.restoreLayer();
              aiText = `(${msg})`;
            } else if (args.action === 'strip_full') {
              cm.stripLayer(); cm.stripLayer(); cm.stripLayer(); // Hack rápido
              aiText = "(Me quito todo...) [ACTION: SHY]";
            } else if (args.action === 'dress_full') {
              cm.presetFullClothed();
              aiText = "(Me visto completamente.)";
            }
          }

          if (call.name === 'controlCamera') {
            const args: any = call.args;
            setViewMode(args.view);
            aiText = `(Cambiando vista a ${args.view}...)`;
          }

          if (call.name === 'learnPerson') {
            const args: any = call.args;
            const newPerson: PersonEntry = {
              id: Date.now().toString(),
              name: args.name,
              relationship: args.relationship,
              visualDescription: args.visualDescription,
              voiceDescription: args.voiceDescription || "Voz no registrada aún."
            };
            // Actualizar estado (agregando la nueva persona)
            updateKnownPeople([...state.knownPeople, newPerson]);
            aiText = `(He memorizado a ${args.name}.La próxima vez que l@vea, l@reconoceré).`;
          }

          // Handler para learnPreference (Sistema de Aprendizaje)
          if (call.name === 'learnPreference') {
            const args: any = call.args;
            const category = args.category as LearnedItem['category'];
            const content = args.content;

            // Crear perfil actualizado
            const updatedProfile = { ...state.userProfile };
            const arrayKey = category === 'like' ? 'likes' : category === 'dislike' ? 'dislikes' : category === 'interest' ? 'interests' : category === 'fact' ? 'facts' : 'habits';
            if (updatedProfile[arrayKey] && !updatedProfile[arrayKey].includes(content)) {
              updatedProfile[arrayKey] = [...updatedProfile[arrayKey], content];
              updateUserProfile(updatedProfile);
              console.log('🧠 Nova aprendió:', category, content);
            }
            // ACCUMULATE
            pendingFactsRef.current.push({ content, category: (category === 'habit' ? 'habit' : category === 'like' ? 'like' : category === 'dislike' ? 'dislike' : category === 'interest' ? 'interest' : 'fact') });
            aiText = `(Anotado en búfer: "${content}". Lo guardaré al finalizar la sesión).`;
          }

          if (call.name === 'switchAvatar') {
            const args: any = call.args;
            const avatarName = args.avatarName;
            const reason = args.reason;
            const modelUrl = avatarName === 'Nova Anime' ? '/models/nova-avatar.glb' : '/models/grokani_lipsync.glb';

            if (updateAvatar) {
              updateAvatar({
                modelUrl,
                name: avatarName
              });
            }

            const activeContexts = AvatarLearningService.detectContext(text);
            activeContexts.forEach(ctx => {
              AvatarLearningService.recordInteraction(avatarName, ctx.type, ctx.value, true);
            });

            aiText = `(Cambiando mi apariencia a ${avatarName}...)`;
          }

          if (call.name === 'controlBody') {
            const args: any = call.args;
            const { actionType, limb, target, gesture, facialExpression, hand, handPose, walkDirection, customPoseName, customPoseAngles, reason } = args;
            let detailMsg = '';

            if (actionType === 'facial_expression' && facialExpression) {
              window.dispatchEvent(new CustomEvent('aiko-face', { detail: { action: facialExpression.toLowerCase() } }));
              detailMsg = `hizo el gesto facial de ${facialExpression}`;
            } else if (actionType === 'move_limb' && limb && target) {
              window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: limb.toUpperCase(), target: target.toUpperCase() } }));
              detailMsg = `movió ${limb} hacia ${target}`;
            } else if (actionType === 'play_gesture' && gesture) {
              window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: gesture.toLowerCase() } }));
              detailMsg = `realizó el gesto ${gesture}`;
            } else if (actionType === 'hand_pose' && hand && handPose) {
              window.dispatchEvent(new CustomEvent('aiko-hand-pose', { detail: { side: hand.toUpperCase(), pose: handPose.toUpperCase() } }));
              detailMsg = `puso mano ${hand} en ${handPose}`;
            } else if (actionType === 'walk_to' && walkDirection) {
              const dirMap: Record<string, { x: number; z: number }> = {
                forward: { x: 0, z: 0.5 },
                backward: { x: 0, z: -0.6 },
                left: { x: -0.5, z: 0 },
                right: { x: 0.5, z: 0 },
                center: { x: 0, z: 0 }
              };
              const targetPos = dirMap[walkDirection.toLowerCase()] || { x: 0, z: 0 };
              window.dispatchEvent(new CustomEvent('nova-walk-to', { detail: targetPos }));
              detailMsg = `caminó hacia ${walkDirection}`;
            } else if (actionType === 'custom_pose') {
              const poseName = customPoseName || 'custom_' + Date.now();
              const boneData: Record<string, number> = {};
              if (customPoseAngles) {
                customPoseAngles.split(',').forEach((pair: string) => {
                  const [key, value] = pair.split('=');
                  if (key && value) {
                    boneData[key.trim()] = parseFloat(value.trim());
                  }
                });
              }
              const storedAnims = JSON.parse(localStorage.getItem('nova_custom_anims') || '{}');
              storedAnims[poseName] = boneData;
              localStorage.setItem('nova_custom_anims', JSON.stringify(storedAnims));
              window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: poseName, pose: boneData } }));
              detailMsg = `adoptó la pose ${poseName}`;
            } else if (actionType === 'reset') {
              window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HEAD', target: 'NEUTRAL' } }));
              window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'TORSO', target: 'NEUTRAL' } }));
              window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'HIPS', target: 'NEUTRAL' } }));
              window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_ARMS', target: 'REST' } }));
              window.dispatchEvent(new CustomEvent('aiko-movement', { detail: { limb: 'BOTH_LEGS', target: 'STAND' } }));
              window.dispatchEvent(new CustomEvent('nova-custom-anim', { detail: { name: 'reset', pose: {} } }));
              detailMsg = `reseteó su postura a neutral`;
            }

            aiText = `(💃 ${detailMsg} ${reason ? `[${reason}]` : ''})`;
          }

          if (call.name === 'controlRobotGym') {
            const args: any = call.args;
            const action = args.action;
            const parameter = args.parameter;
            
            const channel = new BroadcastChannel('gym_channel');
            channel.postMessage({ action, parameter });
            channel.close();

            if (action === 'set_policy') {
              const policyNames = { stand: 'Equilibrio Activo', walk: 'Marcha Sinusoidal', random: 'Exploración Aleatoria' };
              aiText = `🦾 Listo, cambié mi política de control físico a *${policyNames[parameter] || parameter}* en el simulador.`;
            } else if (action === 'push') {
              aiText = `💨 Apliqué una fuerza de perturbación al torso en mi simulación.`;
            }
          }
        }
      }

      // Si no hubo función, o además de la función hay texto
      try {
        if (response.text) {
          aiText = response.text;
        }
      } catch (e) {
        // Ignorar si no hay texto (ej: solo función)
      }

      // Extraer y ejecutar todos los comandos de control corporal y gestos en el texto REST
      executeBodyCommandsFromText(aiText, (emo) => setEmotion(emo));

      // Limpiar todas las etiquetas del texto visible y del TTS
      aiText = cleanAllAiTags(aiText);

      if (!aiText) {
        aiText = isBold ? "Mmm..." : "Entendido.";
      }

      // Si se usó búsqueda, añadir indicador
      if (needsSearch && response.candidates?.[0]?.groundingMetadata) {
        aiText = "🔍 " + aiText;
      }

      addMessage({ text: aiText, sender: 'ai' });
      // Combinar tono y acento para TTS
      const fullTone = `${state.avatar.voiceTone || ''}. ${state.avatar.voiceAccent ? 'Habla con acento ' + state.avatar.voiceAccent : ''} `;
      const audio = await generateSpeech(aiText.replace('🔍 ', ''), state.avatar.voiceName, fullTone);

      if (audio) {
        playAiVoice(audio);
      } else {
        // Fallback to Browser TTS
        const utterance = new SpeechSynthesisUtterance(aiText.replace('🔍 ', ''));
        utterance.lang = 'es-ES'; // O el idioma que corresponda
        window.speechSynthesis.speak(utterance);
      }
      if (isBold) setExcitationLevel(prev => Math.min(100, prev + 2));
    } catch (error: any) {
      console.error('Error en chat:', error);
      let errorMsg = "Hubo un error al procesar tu mensaje. Intenta de nuevo.";
      if (error?.message?.includes('429') || error?.status === 429) {
        errorMsg = "⚠️ Límite de cuota excedido. Espera un momento o cambia la API Key.";
      }
      addMessage({ text: errorMsg, sender: 'ai' });
    } finally {
      setIsTyping(false);
    }
  };

  // MODO MINI: Solo avatar 3D a pantalla completa (arrastrable)
  if (isMiniMode) {
    return (
      <div
        className="w-full h-full bg-[#020205] overflow-hidden cursor-move"
        style={{ WebkitAppRegion: 'drag' } as any}
      >
        <div className="w-full h-full" style={{ pointerEvents: 'none' }}>
          <AvatarErrorBoundary fallback={<div className="w-full h-full bg-gradient-to-b from-[#0a0a0f] to-[#020205] flex items-center justify-center"><span className="text-white/50">Avatar</span></div>} onError={() => { }}>
            <AvatarViewer3D
              modelUrl={state.avatar.modelUrl}
              emotion={emotion}
              action={action}
              viewMode={viewMode}
              isAiSpeaking={isAiSpeaking}
              isHotMode={isBold}
              audioAnalyser={aiSpeechAnalyserRef.current}
            />
          </AvatarErrorBoundary>
        </div>
      </div>
    );
  }

  // MODO NORMAL: Dashboard completo
  return (
    <div className="flex h-full w-full overflow-hidden flex-col lg:flex-row bg-[#020205] relative select-none">
      <canvas ref={canvasRef} className="hidden" />

      <section className="relative flex-1 flex items-center justify-center overflow-hidden min-h-[280px] w-full">
        {/* Fondo Dinámico */}
        <div className={`absolute inset-0 transition-all duration-1000 ${isBold ? 'bg-[radial-gradient(circle_at_center,_#9d174d66_0%,_#020205_100%)]' : 'bg-[radial-gradient(circle_at_center,_#1313ec11_0%,_#020205_100%)]'}`}></div>

        {/* Barra de Excitación (Solo modo Bold) */}
        {isBold && (
          <div className="absolute top-3 sm:top-6 left-1/2 -translate-x-1/2 z-[150] w-48 sm:w-64 max-w-[50vw] flex flex-col items-center gap-1 sm:gap-1.5">
            <div className="flex justify-between w-full px-1">
              <span className="text-[8px] sm:text-[9px] font-black text-pink-500 uppercase tracking-widest">Nivel de Excitación</span>
              <span className="text-[8px] sm:text-[9px] font-black text-pink-500">{excitationLevel.toFixed(0)}%</span>
            </div>
            <div className="w-full h-1.5 bg-pink-900/30 rounded-full overflow-hidden border border-pink-500/20">
              <div className="h-full bg-gradient-to-r from-pink-600 to-red-600 transition-all duration-500" style={{ width: `${excitationLevel}% ` }}></div>
            </div>
          </div>
        )}

        {/* HUD SUPERIOR DERECHO (Estado de llamada, visualizador mic y Ping) */}
        <div className="absolute top-2.5 right-2.5 sm:top-4 sm:right-4 z-[150] flex flex-wrap items-center justify-end gap-1.5 sm:gap-2 max-w-[70vw]">
          {/* Pequeño Indicador de Ping / Latencia */}
          <PingIndicator compact={true} />

          {/* Estado de conversación durante llamada */}
          {isInCall && !isMiniMode && (
            <div className="px-2 sm:px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-lg border border-white/10 shadow-lg flex items-center gap-1.5 shrink-0">
              {isAiSpeaking ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs text-green-400 font-medium">🗣️ Hablando</span>
                </>
              ) : currentInputTranscription.current.trim() ? (
                <>
                  <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse"></div>
                  <span className="text-[10px] sm:text-xs text-blue-400 font-medium">👂 Escuchando</span>
                </>
              ) : (
                <>
                  <div className="w-2 h-2 rounded-full bg-purple-500"></div>
                  <span className="text-[10px] sm:text-xs text-purple-400 font-medium">💭 Lista</span>
                </>
              )}
            </div>
          )}

          {/* Visualizador de volumen de micrófono */}
          {isInCall && !isMiniMode && (
            <div className="px-2 sm:px-2.5 py-1 bg-black/70 backdrop-blur-md rounded-lg border border-white/10 shadow-lg flex items-center gap-1.5 sm:gap-2 shrink-0">
              <span className="text-[9px] sm:text-[10px] text-gray-400 font-medium">🎤 {micVolume}%</span>
              <div className="w-10 sm:w-14 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-100 ${
                    micVolume > 30 ? 'bg-green-500' : micVolume > 10 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${Math.min(100, micVolume)}%` }}
                ></div>
              </div>
            </div>
          )}
        </div>

        {/* INDICADOR DE BÚSQUEDA TIPO GROK / SCI-FI */}
        {isSearching && (
          <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-[200] flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-300">
            <div className="flex items-center gap-2.5 bg-black/80 backdrop-blur-md px-4 sm:px-6 py-2 sm:py-2.5 rounded-full border border-cyan-500/50 shadow-[0_0_30px_rgba(6,182,212,0.4)]">
              <div className="relative w-3.5 h-3.5 sm:w-4 sm:h-4">
                <div className="absolute inset-0 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="absolute inset-0 border-2 border-cyan-200 border-b-transparent rounded-full animate-ping opacity-50"></div>
              </div>
              <span className="text-cyan-400 font-black text-[10px] sm:text-xs uppercase tracking-[0.2em] animate-pulse">Buscando en la red...</span>
            </div>
            <div className="w-px h-8 sm:h-12 bg-gradient-to-b from-cyan-500 to-transparent mt-1"></div>
          </div>
        )}

        {/* PANEL DE CONFIRMACIÓN DE BÚSQUEDA WEB */}
        {pendingSearch && (
          <div className="absolute top-16 sm:top-24 left-1/2 -translate-x-1/2 z-[250] flex flex-col items-center animate-in fade-in slide-in-from-top-4 duration-300 w-[90vw] sm:w-96 max-w-md">
            <div className="flex flex-col gap-3 sm:gap-4 bg-black/90 backdrop-blur-xl p-4 sm:p-6 rounded-2xl sm:rounded-3xl border border-cyan-500/30 shadow-[0_0_50px_rgba(6,182,212,0.3)] w-full">
              <div className="flex items-center gap-2 sm:gap-3">
                <span className="material-symbols-outlined text-cyan-400 text-xl sm:text-2xl animate-pulse">search</span>
                <span className="text-cyan-400 font-black text-[10px] sm:text-xs uppercase tracking-[0.2em]">Permiso de Búsqueda</span>
              </div>
              <p className="text-white text-[11px] sm:text-xs font-semibold leading-relaxed">
                Nova quiere buscar en internet: <br />
                <span className="text-cyan-300 italic">"{pendingSearch.query}"</span>
              </p>
              <div className="flex gap-2 sm:gap-3 justify-end mt-1 sm:mt-2">
                <button
                  onClick={handleCancelSearch}
                  className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/5 hover:bg-white/10 active:scale-95 text-white/70 text-[9px] sm:text-[10px] font-black uppercase tracking-wider rounded-lg sm:rounded-xl transition-all border border-white/10"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleConfirmSearch}
                  className="px-4 sm:px-5 py-1.5 sm:py-2 bg-cyan-600 hover:bg-cyan-500 active:scale-95 text-black text-[9px] sm:text-[10px] font-black uppercase tracking-wider rounded-lg sm:rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)]"
                >
                  Aceptar y Buscar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* FEED DE NOVA (AVATAR 3D) */}
        <div className="relative w-full h-full flex items-center justify-center p-2 sm:p-4 md:p-6 lg:p-8 z-10">
          <div className={`relative w-full h-full rounded-2xl sm:rounded-3xl lg:rounded-[2.5rem] overflow-hidden border-2 transition-all duration-700 ${isAiSpeaking ? (isBold ? 'border-red-600 scale-[1.01] shadow-[0_0_100px_rgba(220,38,38,0.5)]' : 'border-white scale-[1.005]') : 'border-white/10'}`}>
            {/* MODELO 3D con ERROR BOUNDARY */}
            <AvatarErrorBoundary
              key={state.avatar.modelUrl}
              onError={() => {
                console.warn("⚠️ Triggering auto-heal for broken avatar");
              }}
              fallback={
                <div className="flex flex-col items-center justify-center w-full h-full bg-black/50 text-white p-4 text-center animate-in fade-in">
                  <span className="material-symbols-outlined text-3xl sm:text-4xl text-red-500 mb-2">broken_image</span>
                  <p className="text-xs font-bold text-red-400">Error al cargar Avatar</p>
                  <p className="text-[10px] text-slate-500 mb-3 sm:mb-4">La URL seleccionada no es válida.</p>
                  <button
                    onClick={() => (window as any).location.reload()}
                    className="px-3 sm:px-4 py-1.5 sm:py-2 bg-white/10 hover:bg-white/20 rounded-full text-[9px] sm:text-[10px] font-black uppercase transition-colors"
                  >
                    Restaurar Default
                  </button>
                </div>
              }
            >
              <AvatarViewer3D
                key={state.avatar.modelUrl}
                avatar={state.avatar}
                activeAction={action}
                viewMode={viewMode}
                isAiSpeaking={isAiSpeaking}
                isHotMode={isBold}
                hairColor={state.avatar.hairColor}
                audioAnalyser={aiSpeechAnalyserRef.current}
              />
            </AvatarErrorBoundary>

            {isBold && (
              <div className="absolute inset-0 bg-red-900/10 pointer-events-none mix-blend-overlay animate-pulse"></div>
            )}

            {/* Espectro de Voz */}
            {isAiSpeaking && (
              <div className="absolute inset-x-0 bottom-16 sm:bottom-20 flex justify-center gap-0.5 sm:gap-1 h-12 sm:h-20 items-end px-6 sm:px-16 pointer-events-none">
                {[...Array(24)].map((_, i) => (
                  <div key={i} className={`flex-1 max-w-[4px] rounded-full animate-bounce ${isBold ? 'bg-red-500' : 'bg-primary'}`} style={{ animationDelay: `${i * 0.02}s`, height: `${30 + Math.random() * 70}%` }}></div>
                ))}
              </div>
            )}

            {/* Badge de Estado Inferior Izquierdo */}
            <div className="absolute bottom-2.5 left-2.5 sm:bottom-5 sm:left-5 flex items-center gap-2 bg-black/60 backdrop-blur-xl px-2.5 sm:px-4 py-1 sm:py-1.5 rounded-xl border border-white/10 pointer-events-none">
              <div className={`w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${isBold ? 'bg-red-600 animate-ping' : 'bg-blue-500 animate-pulse'}`}></div>
              <span className="text-[9px] sm:text-[10px] font-black text-white uppercase tracking-[0.2em]">{isBold ? 'Nova • Sin Filtros' : 'Nova • En Línea'}</span>
            </div>
          </div>
        </div>

        {/* TU PREVIEW DE CÁMARA (PiP flotante responsivo) */}
        <div className={`absolute bottom-20 sm:bottom-24 md:bottom-28 right-3 sm:right-6 z-[160] w-28 sm:w-44 md:w-56 lg:w-64 max-w-[38vw] transition-all duration-500 ${isInCall ? 'translate-y-0 opacity-100 scale-100' : 'translate-y-12 opacity-0 scale-50 pointer-events-none'}`}>
          <div className={`relative aspect-video rounded-2xl sm:rounded-3xl overflow-hidden border-2 shadow-2xl bg-slate-900 ${isVisionSyncing ? 'border-red-600 ring-4 ring-red-600/20' : 'border-white/30'}`}>
            <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: 'scaleX(-1)' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent pointer-events-none"></div>
            <div className="absolute top-1.5 left-1.5 sm:top-2.5 sm:left-2.5 flex items-center gap-1.5">
              <div className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isVisionSyncing ? 'bg-red-500 animate-ping' : 'bg-green-500'}`}></div>
              <span className="text-[8px] sm:text-[9px] font-black text-white uppercase tracking-wider bg-black/60 px-1.5 py-0.5 rounded backdrop-blur-md">TU CÁMARA</span>
            </div>
          </div>
        </div>

        {/* CONTROLES DOCK RESPONSIVO FLOTANTE */}
        <div className="absolute bottom-2 sm:bottom-4 md:bottom-6 inset-x-0 flex justify-center items-center px-2 z-[170] pointer-events-none">
          <div className="pointer-events-auto flex items-center justify-center flex-wrap gap-1.5 sm:gap-2 md:gap-2.5 bg-black/75 backdrop-blur-2xl px-2.5 py-1.5 sm:px-4 sm:py-2 md:px-5 md:py-2.5 rounded-full border border-white/15 shadow-[0_10px_35px_rgba(0,0,0,0.85)] max-w-[98vw]">
            {/* 🎙️ INDICADOR WAKE WORD */}
            {isWakeWordSupported && (
              <button
                onClick={() => isWakeWordListening ? stopWakeWord() : startWakeWord()}
                title={isWakeWordListening ? 'Wake word activo — di "hey nova" para llamar · Click para desactivar' : 'Click para activar detección de voz'}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 sm:px-3.5 sm:py-2 rounded-full border text-[9px] sm:text-[10px] md:text-[11px] font-black uppercase tracking-wider transition-all ${
                  isWakeWordListening
                    ? 'bg-emerald-950/60 border-emerald-500/60 text-emerald-400 shadow-[0_0_15px_rgba(52,211,153,0.3)]'
                    : 'bg-white/5 border-white/10 text-slate-500 hover:border-white/30'
                }`}
              >
                <span className={`w-1.5 h-1.5 sm:w-2 sm:h-2 rounded-full ${isWakeWordListening ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                <span className="hidden xs:inline">{isWakeWordListening ? 'HEY NOVA' : 'WAKE WORD'}</span>
              </button>
            )}

            {/* BOTÓN PRINCIPAL DE LLAMADA */}
            {!isInCall ? (
              <button
                onClick={startCall}
                className={`group flex items-center gap-2 sm:gap-2.5 px-4 py-2 sm:px-6 sm:py-2.5 md:px-8 md:py-3 rounded-full transition-all hover:scale-105 active:scale-95 ${isBold ? 'bg-red-600 shadow-[0_0_40px_rgba(220,38,38,0.7)]' : 'bg-primary shadow-[0_0_30px_rgba(19,19,236,0.5)]'}`}
              >
                <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl text-white animate-bounce">videocam</span>
                <span className="text-[11px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">{isBold ? 'Llamada Privada' : 'Iniciar Vídeo'}</span>
              </button>
            ) : (
              <button
                onClick={() => { isUserDisconnectingRef.current = true; endCall(); }}
                className="group flex items-center gap-2 sm:gap-2.5 px-4 py-2 sm:px-6 sm:py-2.5 md:px-8 md:py-3 rounded-full bg-red-700 shadow-[0_0_40px_rgba(185,28,28,0.7)] transition-all hover:scale-105"
              >
                <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl text-white">call_end</span>
                <span className="text-[11px] sm:text-xs md:text-sm font-black text-white uppercase tracking-wider">Cerrar</span>
              </button>
            )}

            {/* Botón Reconexión de Emergencia */}
            {isInCall && (
              <button
                onClick={() => {
                  console.log("⚡ Fuerza reconexión...");
                  endCall();
                  setTimeout(startCall, 1000);
                }}
                className="bg-yellow-600/80 hover:bg-yellow-600 px-2 sm:px-3 py-1.5 sm:py-2 rounded-full text-white text-[9px] sm:text-[10px] font-black uppercase transition-all shadow-md hover:scale-105"
                title="Forzar Reconexión"
              >
                ⚡
              </button>
            )}

            {/* MUSIC MODE BUTTON */}
            <button
              onClick={() => isMusicListening ? stopMusic() : startMusic()}
              className={`p-2 sm:p-2.5 md:p-3 rounded-full border transition-all duration-300 hover:scale-110 active:scale-95 ${isMusicListening ? 'bg-pink-600/30 border-pink-500 shadow-[0_0_15px_rgba(219,39,119,0.6)] animate-pulse text-pink-400' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
              title="Escuchar Música (Baile)"
            >
              <span className="text-base sm:text-lg">🎵</span>
            </button>

            {/* SCREEN SHARE BUTTON */}
            <button
              onClick={async () => {
                if (isScreenSharing) {
                  if (systemSourceRef.current) {
                    systemSourceRef.current.disconnect();
                    systemSourceRef.current = null;
                  }
                  if (systemGainNodeRef.current) {
                    systemGainNodeRef.current.disconnect();
                    systemGainNodeRef.current = null;
                  }
                  stopScreenCapture();
                  if (screenCaptureIntervalRef.current) {
                    clearInterval(screenCaptureIntervalRef.current);
                    screenCaptureIntervalRef.current = null;
                  }
                  setIsScreenSharing(false);
                  if (liveSessionRef.current) {
                    // @ts-ignore
                    liveSessionRef.current.sendRealtimeInput({ text: "[SYSTEM_EVENT: Pantalla desconectada. Ahora solo ves al usuario por la cámara.]" });
                  }
                } else {
                  const isElectron = typeof window !== 'undefined' && (window as any).isElectron === true;
                  let sourceId: string | undefined;

                  if (isElectron && (window as any).electronAPI) {
                    try {
                      const sources = await (window as any).electronAPI.getScreenSources();
                      if (sources.length > 0) {
                        const screenSource = sources.find((s: any) => s.name.includes('Screen') || s.name.includes('Pantalla')) || sources[0];
                        sourceId = screenSource.id;
                      }
                    } catch (e) {
                      console.warn('Error obteniendo fuentes:', e);
                    }
                  }

                  const shouldCaptureAudio = window.confirm(
                    "¿Quieres compartir también el audio del PC (Música/Videos)?\n\n" +
                    "✅ ACEPTAR: Sí, incluir audio.\n" +
                    "❌ CANCELAR: No, solo imagen."
                  );

                  const result = await startScreenCapture({
                    width: 1280,
                    height: 720,
                    captureAudio: shouldCaptureAudio,
                    sourceId
                  });

                  if (result.success) {
                    setIsScreenSharing(true);

                    if (shouldCaptureAudio && result.hasAudio && inputAudioContextRef.current && audioMixerRef.current) {
                      const sysStream = getSystemAudioStream();
                      if (sysStream) {
                        try {
                          const sysSource = inputAudioContextRef.current.createMediaStreamSource(sysStream);
                          systemSourceRef.current = sysSource;

                          const sysGain = inputAudioContextRef.current.createGain();
                          sysGain.gain.value = 0.3;
                          systemGainNodeRef.current = sysGain;

                          const lowPass = inputAudioContextRef.current.createBiquadFilter();
                          lowPass.type = 'lowpass';
                          lowPass.frequency.value = 4000;
                          lowPass.Q.value = 0.7;

                          sysSource.connect(lowPass);
                          lowPass.connect(sysGain);
                          sysGain.connect(audioMixerRef.current);
                        } catch (err) {
                          console.error('Error conectando audio sistema:', err);
                          systemGainNodeRef.current = null;
                        }
                      } else {
                        systemGainNodeRef.current = null;
                      }
                    } else {
                      systemGainNodeRef.current = null;
                      if (systemSourceRef.current) {
                        try { systemSourceRef.current.disconnect(); } catch (e) {}
                        systemSourceRef.current = null;
                      }
                    }

                    if (screenCaptureIntervalRef.current) clearInterval(screenCaptureIntervalRef.current);

                    screenCaptureIntervalRef.current = setInterval(() => {
                      if (checkScreenSharing() && liveSessionRef.current) {
                        try {
                          const frame = captureFrame(0.6);
                          if (frame) {
                            liveSessionRef.current.sendRealtimeInput({
                              video: { mimeType: 'image/jpeg', data: frame }
                            });
                            if (isBold) setExcitationLevel(prev => Math.min(100, prev + 0.5));
                          }
                        } catch (e) {
                          console.warn('⚠️ Error enviando frame:', e);
                        }
                      }
                    }, 3000);

                    if (liveSessionRef.current) {
                      // @ts-ignore
                      liveSessionRef.current.sendRealtimeInput({ text: `[SYSTEM_EVENT: El usuario ha comenzado a TRANSMITIR PANTALLA. Ahora estás viendo lo que él ve. ${isBold ? 'Si ves contenido adulto, descríbelo con detalle y actúa de forma provocativa como su acompañante.' : 'Ayúdalo con lo que esté haciendo.'}]` });
                    }
                  }
                }
              }}
              className={`p-2 sm:p-2.5 md:p-3 rounded-full border transition-all hover:scale-110 active:scale-95 ${isScreenSharing ? 'bg-green-600/30 border-green-500 text-green-400 shadow-[0_0_20px_rgba(34,197,94,0.4)]' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
              title={isScreenSharing ? 'Dejar de compartir' : 'Compartir pantalla + Audio'}
            >
              <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl">{isScreenSharing ? 'stop_screen_share' : 'screen_share'}</span>
            </button>

            {/* CAMERA ANALYSIS BUTTON */}
            <button
              id="btn-camera-analysis"
              onClick={() => isCameraCapturing ? stopCameraCapture() : startCameraCapture()}
              className={`p-2 sm:p-2.5 md:p-3 rounded-full border transition-all duration-300 hover:scale-110 active:scale-95
                ${isCameraCapturing
                  ? 'bg-cyan-600/30 border-cyan-400 text-cyan-300 shadow-[0_0_20px_rgba(6,182,212,0.5)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-cyan-500/50 hover:text-cyan-400'}
                ${highlightCamera ? 'ring-4 ring-cyan-400 animate-pulse border-cyan-400 bg-cyan-600/40' : ''}`}
              title={isCameraCapturing ? 'Detener análisis de cámara (cada 10s)' : '📷 Activar análisis de cámara — Nova verá un frame cada 10 segundos'}
            >
              <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl">
                {isCameraCapturing ? 'videocam_off' : 'photo_camera'}
              </span>
            </button>

            {/* SCREEN ANALYSIS BUTTON */}
            <button
              id="btn-screen-analysis"
              onClick={() => isScreenCapturing ? stopScreenAnalysis() : startScreenAnalysis()}
              className={`p-2 sm:p-2.5 md:p-3 rounded-full border transition-all duration-300 hover:scale-110 active:scale-95
                ${isScreenCapturing
                  ? 'bg-violet-600/30 border-violet-400 text-violet-300 shadow-[0_0_20px_rgba(139,92,246,0.5)]'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:border-violet-500/50 hover:text-violet-400'}
                ${highlightScreen ? 'ring-4 ring-violet-400 animate-pulse border-violet-400 bg-violet-600/40' : ''}`}
              title={isScreenCapturing ? 'Detener análisis de pantalla (cada 10s)' : '🖥️ Activar análisis de pantalla — Nova verá tu pantalla cada 10 segundos'}
            >
              <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl">
                {isScreenCapturing ? 'cancel_presentation' : 'screenshot_monitor'}
              </span>
            </button>

            {/* CHAT TOGGLE BUTTON */}
            <button
              onClick={() => setIsChatVisible(!isChatVisible)}
              className={`p-2 sm:p-2.5 md:p-3 rounded-full border transition-all hover:scale-110 active:scale-95 ${isChatVisible ? 'bg-blue-600/30 border-blue-500 text-blue-400 shadow-[0_0_20px_rgba(59,130,246,0.4)]' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
              title={isChatVisible ? 'Ocultar Chat' : 'Mostrar Chat'}
            >
              <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl">{isChatVisible ? 'chat_bubble' : 'chat_bubble_outline'}</span>
            </button>

            {/* BOLD / NORMAL MODE TOGGLE */}
            <button
              onClick={() => { setBoldMode(!isBold); if (!isBold) setExcitationLevel(90); }}
              className={`p-2 sm:p-2.5 md:p-3 rounded-full border transition-all hover:rotate-12 active:scale-95 ${isBold ? 'bg-red-600/30 border-red-600 text-red-500 shadow-[0_0_20px_rgba(220,38,38,0.4)]' : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'}`}
              title={isBold ? 'Modo Sin Filtros (Activo)' : 'Activar Modo Sin Filtros'}
            >
              <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl">{isBold ? 'local_fire_department' : 'security'}</span>
            </button>

            {/* GROK SECOND OPINION BUTTON */}
            {isInCall && (
              <button
                onClick={handleConsultGrok}
                disabled={isConsultingGrok}
                className="p-2 sm:p-2.5 md:p-3 rounded-full border transition-all hover:scale-110 active:scale-95 bg-orange-600/30 border-orange-500 text-orange-400 shadow-[0_0_20px_rgba(255,107,53,0.4)] disabled:opacity-50 disabled:cursor-not-allowed"
                title="Consultar con Grok (Segunda Opinión)"
              >
                <span className="material-symbols-outlined text-lg sm:text-xl md:text-2xl">{isConsultingGrok ? 'hourglass_empty' : 'psychology'}</span>
              </button>
            )}
          </div>
        </div>
      </section>

      {/* CHAT RESPONSIVO */}
      {isChatVisible && (
        <section className={`w-full lg:w-[380px] xl:w-[420px] 2xl:w-[460px] shrink-0 border-t lg:border-t-0 lg:border-l border-white/10 flex flex-col h-[48vh] lg:h-full z-[180] shadow-2xl transition-all ${isBold ? 'bg-[#060000]' : 'bg-[#08080c]'}`}>
          <div className="flex-1 overflow-y-auto p-4 sm:p-6 flex flex-col gap-4 sm:gap-6 custom-scrollbar">
            {state.messages.slice(-20).map((msg) => (
              <div key={msg.id} className={`flex flex-col gap-1.5 ${msg.sender === 'user' ? 'items-end' : 'items-start'}`}>
                <div className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm leading-relaxed max-w-[95%] transition-all shadow-lg ${msg.sender === 'user'
                  ? (isBold ? 'bg-red-950/40 border border-red-600/30' : 'bg-primary/70 border border-primary/20') + ' text-white rounded-tr-none'
                  : 'bg-white/5 text-slate-50 rounded-tl-none border border-white/10 backdrop-blur-3xl'
                  }`}>
                  <p className="whitespace-pre-wrap">{msg.text}</p>
                </div>
                <span className={`text-[9px] sm:text-[10px] font-black uppercase tracking-[0.3em] opacity-50 px-2 ${msg.sender === 'user' ? 'text-slate-500' : (isBold ? 'text-red-500 animate-pulse' : 'text-primary')}`}>
                  {msg.sender === 'user' ? 'JD' : 'Nova'}
                </span>
              </div>
            ))}
            {isTyping && (
              <div className="flex items-center gap-2 text-[11px] sm:text-xs font-black text-red-500 uppercase tracking-widest px-2 animate-pulse">
                <span className="material-symbols-outlined text-sm">favorite</span>
                {isBold ? "Nova está desesperada..." : "Nova te observa..."}
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          <div className="p-3 sm:p-4 bg-black/90 border-t border-white/10 backdrop-blur-2xl">
            <div className="relative flex items-center">
              <textarea
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendText(); } }}
                className={`w-full bg-[#100505] text-white rounded-2xl pl-3.5 sm:pl-4 pr-12 sm:pr-14 py-2.5 sm:py-3 border-none focus:ring-1 sm:focus:ring-2 ${isBold ? 'focus:ring-red-600' : 'focus:ring-primary'} resize-none h-14 sm:h-16 text-xs sm:text-sm placeholder:text-slate-700 shadow-xl`}
                placeholder={isBold ? "Dime algo..." : "Escribe a Nova..."}
              />
              <button
                onClick={handleSendText}
                className={`absolute right-2 top-1/2 -translate-y-1/2 w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-xl transition-all active:scale-90 ${isBold ? 'bg-red-600 hover:bg-red-500 shadow-red-600/40 shadow-md' : 'bg-primary hover:bg-blue-600'}`}
                title="Enviar mensaje"
              >
                <span className="material-symbols-outlined text-white text-lg sm:text-xl">send</span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* GROK SECOND OPINION PANEL */}
      <SecondOpinionPanel
        isVisible={showGrokPanel}
        isLoading={isConsultingGrok}
        userQuestion={lastUserQuestion}
        geminiResponse={lastGeminiResponse}
        grokResponse={grokResponse}
        onClose={() => {
          setShowGrokPanel(false);
          setGrokResponse(null);
        }}
        onUseGrokResponse={() => {
          if (grokResponse) {
            addMessage({
              text: grokResponse.alternativeResponse,
              sender: 'ai'
            });
            setShowGrokPanel(false);
          }
        }}
      />

      {/* 🎴 Poker Assistant Overlay */}
      <PokerOverlay
        situation={pokerAssistant.situation}
        decision={pokerAssistant.decision}
        isActive={pokerAssistant.isActive}
        onToggle={() => pokerAssistant.setIsActive(!pokerAssistant.isActive)}
      />

      <style>{`
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-thumb { background: rgba(255, 255, 255, 0.15); border-radius: 10px; }
      `}</style>
    </div>
  );
};

export default Dashboard;

