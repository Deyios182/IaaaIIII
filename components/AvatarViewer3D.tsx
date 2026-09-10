import React, { useRef, useEffect, Suspense, useState, useMemo, useCallback } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment, Html, useProgress } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as THREE from 'three';
import { LipSyncAnalyzer } from '../utils/lipSync';
import { emotionToFacialExpression, type Emotion } from '../utils/emotionDetector';
import { JigglePhysicsSystem } from '../utils/jigglePhysics';
import { getClothingManager } from '../utils/clothingManager';
import { performanceMonitor } from '../utils/performanceMonitor';
import { AnimationManager, getAnimationName } from '../utils/animationManager';
import { animationStore } from '../utils/animationStore';
import { IKController } from '../utils/ikController';
import { MoodSystem } from '../utils/moodSystem';
import { InteractionSystem } from '../utils/interactionSystem';
import { MaterialManager } from '../utils/materialManager';
import { ProceduralAnimator } from '../utils/proceduralAnimations';
import { gestureRegistry } from '../utils/gestureRegistry';
import { idleOverrideRegistry, type IdleSlotId } from '../utils/idleOverrideRegistry';
import { getPropManager } from '../utils/propManager';
import { isMixamoAnimation, isGenericFKAnimation, retargetMixamoClip, getModelBoneNames } from '../utils/mixamoRetargeter';
import { loadVmdAnimationClip, loadVmdCameraClip, MmdLegIkController } from '../utils/vmdLoader';
import { isClothingOrNudityMorph, isFacialMorph } from '../utils/vmdRetargeter';
import { loadPMXModel, type PMXModelResult } from '../utils/pmxLoader';
import { SimplexNoise } from '../utils/perlin';
import { AvatarInteractionLayer, type InteractionLayerRef } from './AvatarInteractionLayer';
import { InteractionToolbar, type InteractionTool } from './InteractionToolbar';
import { HandTrackingOverlay } from './HandTrackingOverlay';
import { UserAvatar3D } from './UserAvatar3D';
import { ActionFeedbackHUD } from './ActionFeedbackHUD';

import { NovaPersonalityMode } from '../types';

const MODE_3D_LIGHTS: Record<NovaPersonalityMode, {
    ambientColor: string;
    ambientIntensity: number;
    dirLightColor: string;
    dirLightIntensity: number;
    pointLightColor: string;
    pointLightIntensity: number;
    rimLightColor: string;
    containerBg: string;
}> = {
    companion: {
        ambientColor: '#ffffff',
        ambientIntensity: 1.2,
        dirLightColor: '#e0f2fe',
        dirLightIntensity: 0.9,
        pointLightColor: '#38bdf8',
        pointLightIntensity: 0.6,
        rimLightColor: '#3b82f6',
        containerBg: 'from-slate-950 via-blue-950/30 to-slate-900'
    },
    nympho: {
        ambientColor: '#ffe4e6',
        ambientIntensity: 1.1,
        dirLightColor: '#fda4af',
        dirLightIntensity: 1.1,
        pointLightColor: '#f43f5e',
        pointLightIntensity: 0.8,
        rimLightColor: '#fb7185',
        containerBg: 'from-slate-950 via-rose-950/40 to-slate-900'
    },
    grok: {
        ambientColor: '#f3e8ff',
        ambientIntensity: 1.1,
        dirLightColor: '#c084fc',
        dirLightIntensity: 1.0,
        pointLightColor: '#a855f7',
        pointLightIntensity: 0.8,
        rimLightColor: '#e879f9',
        containerBg: 'from-slate-950 via-purple-950/40 to-slate-900'
    },
    gamer: {
        ambientColor: '#d1fae5',
        ambientIntensity: 1.1,
        dirLightColor: '#34d399',
        dirLightIntensity: 1.0,
        pointLightColor: '#10b981',
        pointLightIntensity: 0.8,
        rimLightColor: '#6ee7b7',
        containerBg: 'from-slate-950 via-emerald-950/40 to-slate-900'
    },
    chilean: {
        ambientColor: '#fee2e2',
        ambientIntensity: 1.2,
        dirLightColor: '#f87171',
        dirLightIntensity: 0.9,
        pointLightColor: '#ef4444',
        pointLightIntensity: 0.7,
        rimLightColor: '#60a5fa',
        containerBg: 'from-slate-950 via-red-950/30 to-slate-900'
    },
    hacker: {
        ambientColor: '#cffafe',
        ambientIntensity: 1.0,
        dirLightColor: '#22d3ee',
        dirLightIntensity: 1.0,
        pointLightColor: '#06b6d4',
        pointLightIntensity: 0.9,
        rimLightColor: '#38bdf8',
        containerBg: 'from-slate-950 via-cyan-950/40 to-slate-900'
    },
    tsundere: {
        ambientColor: '#fef3c7',
        ambientIntensity: 1.2,
        dirLightColor: '#fbbf24',
        dirLightIntensity: 1.0,
        pointLightColor: '#f59e0b',
        pointLightIntensity: 0.7,
        rimLightColor: '#fb923c',
        containerBg: 'from-slate-950 via-amber-950/40 to-slate-900'
    },
    zen: {
        ambientColor: '#ccfbf1',
        ambientIntensity: 1.2,
        dirLightColor: '#2dd4bf',
        dirLightIntensity: 0.8,
        pointLightColor: '#14b8a6',
        pointLightIntensity: 0.6,
        rimLightColor: '#5eead4',
        containerBg: 'from-slate-950 via-teal-950/30 to-slate-900'
    },
    waifu: {
        ambientColor: '#fce7f3',
        ambientIntensity: 1.3,
        dirLightColor: '#f472b6',
        dirLightIntensity: 0.9,
        pointLightColor: '#ec4899',
        pointLightIntensity: 0.8,
        rimLightColor: '#fbcfe8',
        containerBg: 'from-slate-950 via-pink-950/40 to-slate-900'
    },
    latenight: {
        ambientColor: '#e0e7ff',
        ambientIntensity: 0.8,
        dirLightColor: '#818cf8',
        dirLightIntensity: 0.7,
        pointLightColor: '#6366f1',
        pointLightIntensity: 0.6,
        rimLightColor: '#a5b4fc',
        containerBg: 'from-slate-950 via-indigo-950/50 to-slate-900'
    }
};

interface AvatarViewer3DProps {
    avatar?: any; // El estado del avatar desde App.tsx
    modelUrl?: string; // Permitir modelUrl directo para retrocompatibilidad
    emotion?: Emotion;
    activeAction?: string | null;
    action?: string | null; // Permitir action directo para retrocompatibilidad
    audioElement?: HTMLAudioElement | null;
    isAiSpeaking?: boolean;
    disableControls?: boolean;
    viewMode?: string;
    isHotMode?: boolean;
    hairColor?: string;
    audioAnalyser?: AnalyserNode | null;
    personalityMode?: NovaPersonalityMode;
}

// Simulación de Ruido Perlin simple (Legacy removed - using SimplexNoise class)

interface AvatarModelInnerProps {
    modelData: { scene: THREE.Group; animations: THREE.AnimationClip[] };
    modelUrl?: string;
    isPMX?: boolean;
    emotion: Emotion;
    action?: string | null;
    audioElement: HTMLAudioElement | null;
    isAiSpeaking: boolean;
    isHotMode?: boolean;
    hairColor?: string;
    audioAnalyser: AnalyserNode | null;
    currentTool: InteractionTool;
    showDebugZones: boolean;
    physicsSensitivity: number;
    physicsMaxAngle: number;
    resetPhysicsTrigger: number;
}

function AvatarModelInner({
    modelData,
    modelUrl = 'default',
    isPMX = false,
    emotion,
    action,
    audioElement,
    isAiSpeaking,
    isHotMode = false,
    hairColor,
    audioAnalyser,
    currentTool,
    showDebugZones,
    physicsSensitivity,
    physicsMaxAngle,
    resetPhysicsTrigger
}: AvatarModelInnerProps) {
    const modelRef = useRef<THREE.Group>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const lipSyncRef = useRef<LipSyncAnalyzer | null>(null);
    const jigglePhysicsRef = useRef<JigglePhysicsSystem | null>(null);
    // Ref para IK Solver nativo de MMD / PMX (resuelve rodillas y piernas para animación VMD)
    const ikSolverRef = useRef<any>(null);
    const legIkControllerRef = useRef<MmdLegIkController | null>(null);
    const activeClipActionRef = useRef<THREE.AnimationAction | null>(null);
    // TRUE solo cuando la animación activa tiene tracks IK (animaciones VMD). Cuando es FALSE
    // (animaciones Mixamo/FK), el IK Solver NO debe correr para no pisar las rotaciones FK.
    const hasIKTracksRef = useRef<boolean>(false);
    const activeClipHasMorphsRef = useRef<boolean>(false);
    const ccdikLoggedRef = useRef<boolean>(false);
    // Audio sincronizado con la animación activa
    const animAudioRef = useRef<HTMLAudioElement | null>(null);

    // Refs inmutables para capturar la postura prístina original (bind pose) del modelo
    const pristineRestPosesRef = useRef<Map<string, THREE.Quaternion>>(new Map());
    const pristineRestPositionsRef = useRef<Map<string, THREE.Vector3>>(new Map());
    const pristineWorldRestPosesRef = useRef<Map<string, THREE.Quaternion>>(new Map());

    // Inicializar o sincronizar el IK Solver y capturar la postura prístina si el modelo cargado lo provee
    useEffect(() => {
        if (modelData?.scene) {
            pristineRestPosesRef.current.clear();
            pristineRestPositionsRef.current.clear();
            pristineWorldRestPosesRef.current.clear();

            modelData.scene.updateMatrixWorld(true);
            modelData.scene.traverse((child: any) => {
                if (child.isBone) {
                    pristineRestPosesRef.current.set(child.name, child.quaternion.clone());
                    pristineRestPositionsRef.current.set(child.name, child.position.clone());
                    const wq = new THREE.Quaternion();
                    child.getWorldQuaternion(wq);
                    pristineWorldRestPosesRef.current.set(child.name, wq);
                }
            });
            console.log(`🦴 [AvatarModelInner] Postura prístina capturada para ${pristineRestPosesRef.current.size} huesos.`);

            ikSolverRef.current = modelData.scene.userData?.ikSolver || null;
            if (!ikSolverRef.current) {
                // Buscar si alguna malla hija tiene el solver asignado
                modelData.scene.traverse((child: any) => {
                    if (child.userData?.ikSolver) {
                        ikSolverRef.current = child.userData.ikSolver;
                    }
                });
            }
            if (ikSolverRef.current) {
                const ikBones = ikSolverRef.current.mesh?.skeleton?.bones;
                if (ikBones) {
                    ikSolverRef.current._restQuats = ikBones.map((b: THREE.Bone) => b.quaternion.clone());
                }
                console.log('🦵 [AvatarModelInner] IK Solver vinculado al bucle de animación con rest quaternions cacheados.');
            }
        }
    }, [modelData?.scene]);

    // Resetea completamente el modelo a su postura de reposo prístina (evita que un baile empiece desde la deformación del anterior)
    const resetToPristinePose = useCallback(() => {
        if (!modelRef.current) return;

        // 1. Restaurar cada hueso a su posición y rotación original de reposo (bind pose)
        modelRef.current.traverse((child: any) => {
            if (child.isBone) {
                const origQ = pristineRestPosesRef.current.get(child.name);
                const origP = pristineRestPositionsRef.current.get(child.name);
                if (origQ) child.quaternion.copy(origQ);
                if (origP) child.position.copy(origP);
            }
            if (child.isMesh && child.morphTargetInfluences) {
                child.morphTargetInfluences.fill(0);
            }
        });

        // 2. Resetear el solver PMX si existe (vacía backupBones y restaura bind pose)
        if (ikSolverRef.current?.reset) {
            ikSolverRef.current.reset();
        }

        // 3. Actualizar matrices globales y esqueletos GPU
        modelRef.current.updateMatrixWorld(true);
        modelRef.current.traverse((child: any) => {
            if (child.isSkinnedMesh && child.skeleton) {
                child.skeleton.update();
            }
        });
        // Skeleton reset completo (log silenciado)
    }, []);

    // Generador de Ruido Orgánico (Perlin)
    const simplex = React.useMemo(() => new SimplexNoise(), []);

    const interactionLayerRef = useRef<InteractionLayerRef>(null);

    // Refs específicos para GrokAni / Anime
    const tongueRef = useRef<number | null>(null);
    const tongueMeshRef = useRef<THREE.Mesh | null>(null);

    // Refs de huesos estándar
    const headBoneRef = useRef<THREE.Bone | null>(null);
    const rightArmRef = useRef<THREE.Bone | null>(null);
    const leftArmRef = useRef<THREE.Bone | null>(null);
    const rightArmOriginalRot = useRef<THREE.Euler | null>(null); // Rotación original
    const leftArmOriginalRot = useRef<THREE.Euler | null>(null);
    const headOriginalQuat = useRef(new THREE.Quaternion());
    const headOriginalPos = useRef(new THREE.Vector3());
    const headOrphansRef = useRef<{
        bone: THREE.Bone;
        offsetPos: THREE.Vector3;   // Posición relativa al headBone en espacio local del head
        offsetQuat: THREE.Quaternion; // Rotación relativa al headBone
        originalPos: THREE.Vector3;
        originalQuat: THREE.Quaternion;
        offsetMatrix?: THREE.Matrix4;
    }[]>([]);
    const rightForeArmRef = useRef<THREE.Bone | null>(null);
    const leftForeArmRef = useRef<THREE.Bone | null>(null);
    const leftLegRef = useRef<THREE.Bone | null>(null);
    const rightLegRef = useRef<THREE.Bone | null>(null);
    // Body Parts Refs
    const hipsRef = useRef<THREE.Object3D | null>(null); // Detected Hips
    const spineRef = useRef<THREE.Object3D | null>(null); // Para respiración mejorada
    const lastSpineRot = useRef<THREE.Euler>(new THREE.Euler()); // Para inercia
    const musicEnergyRef = useRef(0); // Audio Reactivity Energy
    const danceTimeRef = useRef(0); // Procedural dance phase

    // --- FINGER BONE REFS ---
    const fingerBonesRef = useRef<{
        left: Array<{ bone: THREE.Bone; segment: number; isThumb: boolean; fingerName: string }>;
        right: Array<{ bone: THREE.Bone; segment: number; isThumb: boolean; fingerName: string }>;
    }>({ left: [], right: [] });
    const fingerPoseRef = useRef<{ name: string; timer: number }>({ name: 'RELAX', timer: 0 });

    // --- LEG / KNEE REFS ---
    const leftShineRef = useRef<THREE.Bone | null>(null);
    const rightShineRef = useRef<THREE.Bone | null>(null);
    const leftLegOriginalRot = useRef<THREE.Euler | null>(null);
    const rightLegOriginalRot = useRef<THREE.Euler | null>(null);
    const leftLegOriginalPos = useRef<THREE.Vector3 | null>(null);
    const rightLegOriginalPos = useRef<THREE.Vector3 | null>(null);
    const leftShineOriginalRot = useRef<THREE.Euler | null>(null);
    const rightShineOriginalRot = useRef<THREE.Euler | null>(null);

    // --- JIGGLE PHYSICS REFS ---
    const legResetTargetRef = useRef<THREE.Euler | null>(null);

    // Sistema de Pose Base (stand, sit, lie)
    const currentBasePoseRef = useRef<'stand' | 'sit' | 'lie'>('stand');
    const poseWeightsRef = useRef({ sit: 0, lie: 0 });
    const leftBreastRef = useRef<THREE.Bone | null>(null);
    const rightBreastRef = useRef<THREE.Bone | null>(null);
    const leftButtRef = useRef<THREE.Bone | null>(null);
    const rightButtRef = useRef<THREE.Bone | null>(null);
    const vaginaRef = useRef<THREE.Bone | null>(null);
    const anusRef = useRef<THREE.Bone | null>(null);
    const lipsRef = useRef<THREE.Bone | null>(null);

    // Zonas extra sensoriales
    const bellyRef = useRef<THREE.Bone | null>(null);
    const hairRef = useRef<THREE.Bone | null>(null);

    const [interactionBoneTarget, setInteractionBoneTarget] = useState<string | null>(null);

    // Manos y Pies explícitos para InteractionLayer
    const leftHandRef = useRef<THREE.Bone | null>(null);
    const rightHandRef = useRef<THREE.Bone | null>(null);
    const leftFootRef = useRef<THREE.Bone | null>(null);
    const rightFootRef = useRef<THREE.Bone | null>(null);
    const bootsMeshRef = useRef<THREE.Mesh | null>(null);
    const armatureSyncMapRef = useRef<{ secondary: THREE.Bone, primary: THREE.Bone, offsetPos: THREE.Vector3, offsetQuat: THREE.Quaternion }[]>([]);

    const debugDumpCount = useRef(0); // Counter for hierarchy dump

    // Physics State: { velocity, position } for each part
    const jiggleState = useRef({
        lBreast: { velocity: 0, position: 0 },
        rBreast: { velocity: 0, position: 0 },
        lButt: { velocity: 0, position: 0 },
        rButt: { velocity: 0, position: 0 }
    });

    const dragState = useRef({
        active: false,
        part: '' as string,
        startY: 0,
        currentY: 0
    });

    const lastHandPoseTime = useRef(0);
    const speakerPoseCycle = useRef(['OPEN', 'PINCH', 'RELAX']);
    const speakerPoseIndex = useRef(0);
    const wasSpeakingRef = useRef(false);

    // --- CUSTOM ANIM & 3D NAVIGATION SYSTEM REFS ---
    const activeCustomPoseRef = useRef<Record<string, number> | null>(null);
    const target3DPos = useRef<THREE.Vector3>(new THREE.Vector3(0, 0, 0));
    const isNavigating3D = useRef<boolean>(false);

    // --- IDLE CYCLE STATE REFS (5-state organic idle rotation) ---
    type IdleState = 'relaxed' | 'weight_shift' | 'cute_waist' | 'thoughtful' | 'curious_look';
    const IDLE_STATES: IdleState[] = ['relaxed', 'weight_shift', 'cute_waist', 'thoughtful', 'curious_look'];
    const currentIdleStateRef = useRef<IdleState>('relaxed');
    const nextIdleSwitchTimeRef = useRef<number>(12 + Math.random() * 6); // First switch 12-18s
    const idleStateTimerRef = useRef<number>(0);
    const idleBlendRef = useRef<number>(0); // 0 = previous state, 1 = current state
    const prevIdleStateRef = useRef<IdleState>('relaxed');
    // Ref to track speech gestures smoothly
    const speechGesturePhaseRef = useRef<number>(0);
    const prevSpeechStyleRef = useRef<number>(-1);
    const activeOverrideSlotRef = useRef<string | null>(null);
    // 🔒 Dedup: evita que la misma acción se dispare dos veces en <300ms (bug doble load)
    const lastExecutedActionRef = useRef<{ name: string; ts: number }>({ name: '', ts: 0 });

    // Helper para reproducir una animación de override para un slot de idle o habla
    const checkAndTriggerSlotOverride = useCallback((slotId: IdleSlotId, loop: boolean = false) => {
        const animName = idleOverrideRegistry.getOverride(slotId);
        if (!animName) return false;

        const storedAnim = animationStore.get(animName);
        if (storedAnim) {
            activeOverrideSlotRef.current = slotId;
            window.dispatchEvent(new CustomEvent('nova-load-animation', {
                detail: {
                    url: storedAnim.url,
                    name: storedAnim.name,
                    type: storedAnim.type,
                    autoplay: true,
                    loop
                }
            }));
            return true;
        } else if (animationManagerRef.current?.hasAnimation(animName)) {
            activeOverrideSlotRef.current = slotId;
            animationManagerRef.current.play(animName, { priority: 10, loop });
            return true;
        }
        return false;
    }, []);

    useEffect(() => {
        // Limpiar animaciones guardadas viejas/descalibradas
        try {
            localStorage.removeItem('nova_custom_anims');
        } catch (err) {}

        const handleCustomAnim = (e: any) => {
            if (e.detail) {
                if (e.detail.name === 'reset') {
                    activeCustomPoseRef.current = null;
                    console.log("Reset pose custom");
                } else if (e.detail.pose) {
                    activeCustomPoseRef.current = { ...(activeCustomPoseRef.current || {}), ...e.detail.pose };
                    console.log("Aplicando pose customizada (Merged): ", e.detail.name, activeCustomPoseRef.current);
                }
            }
        };
        window.addEventListener('nova-custom-anim', handleCustomAnim);
        return () => window.removeEventListener('nova-custom-anim', handleCustomAnim);
    }, []);

    // --- DANCE & SWAY REFS ---
    const isDancing = useRef(false);
    const ikRecalibrateFrames = useRef(30); // 30 frames para que Idle se estabilice antes de capturar bind pose del cuello/cabeza
    const hairBonesRef = useRef<THREE.Object3D[]>([]);
    const skirtBonesRef = useRef<THREE.Object3D[]>([]);
    const morphMeshesRef = useRef<THREE.Mesh[]>([]); // Para acceso global a meshes con morphs

    // Sway State (Rotation Physics)
    // Structure: { [uuid]: { velocity: 0, rotation: 0, baseRot: THREE.Euler } }
    const swayState = useRef<Record<string, { velocity: number, rotation: number, baseRot: THREE.Euler }>>({});

    // LISTENER PARA ARRASTRAR (Drag-to-Jiggle)
    useEffect(() => {
        const handleDragMove = (e: MouseEvent) => {
            if (dragState.current.active) {
                dragState.current.currentY = e.clientY;
            }
        };
        const handleDragUp = () => {
            if (dragState.current.active) {
                dragState.current.active = false;
                console.log('🍒 Soltando rebote!');
            }
        };
        window.addEventListener('mousemove', handleDragMove);
        window.addEventListener('mouseup', handleDragUp);

        return () => {
            window.removeEventListener('mousemove', handleDragMove);
            window.removeEventListener('mouseup', handleDragUp);
        };
    }, []);

    // --- HELPER FUNCTIONS FOR EXPRESIONS ---
    const getEmotionIntensity = (currentEmotion: string): number => {
        // Simple mapping: if defined emotion, return high intensity
        return currentEmotion && currentEmotion !== 'neutral' ? 1.0 : 0.0;
    };

    const updateFacialExpression = (meshes: THREE.Mesh[], currentEmotion: string, isSpeaking: boolean) => {
        // Reset morphs first (simple approach)
        // ... implementation details for brows/mouth based on emotion ...
        meshes.forEach(mesh => {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

            // Mapeo básico de emociones a morphs comunes
            // Añadimos morphs de cierre ('sil', 'mouthclose') a la lista de reseteo
            // porque forzarlos a 1.0 en reposo estaba causando una sonrisa forzada/mueca.
            const morphsToReset = ['BrowsDown', 'BrowsUp', 'Smile', 'Frown', 'MouthOpen', 'Joy', 'Fun', 'Angry', 'Sorrow', 'Fcl_ALL_Joy', 'Fcl_ALL_Fun', 'Fcl_ALL_Angry', 'Fcl_ALL_Sorrow', 'Fcl_MTH_Joy', 'Fcl_MTH_Fun', 'Grin', 'Laugh', 'Ahegao', 'Teeth', 'Happy', 'sil', 'vrc.v_sil', 'mouthclose', 'fcl_mth_close', '笑い', 'にこり', '怒り', '困り', 'びっくり'];
            morphsToReset.forEach(m => {
                // Búsqueda case insensitive con INCLUDES y FILTER para resetear TODOS los morphs que coincidan
                const lowerM = m.toLowerCase();
                const keys = Object.keys(mesh.morphTargetDictionary).filter(k => k.toLowerCase().includes(lowerM));
                keys.forEach(key => {
                    const idx = mesh.morphTargetDictionary[key];
                    if (idx !== undefined) {
                        mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 0, 0.1);
                    }
                });
            });

            // Función auxiliar para aplicar morph difuso (a TODOS los que coincidan)
            const applyMorph = (morphName: string, value: number, speed: number = 0.1) => {
                const lowerName = morphName.toLowerCase();
                const keys = Object.keys(mesh.morphTargetDictionary!).filter(k => k.toLowerCase().includes(lowerName));
                keys.forEach(key => {
                    const idx = mesh.morphTargetDictionary![key];
                    if (idx !== undefined) {
                        mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], value, speed);
                    }
                });
            };

            // Aplicar nuevos según emoción (soporte VRM, DAZ, Blender y PMX/MMD)
            if (currentEmotion === 'angry') {
                applyMorph('BrowsDown', 1.0);
                applyMorph('Angry', 0.8);
                applyMorph('怒り', 0.8);
            } else if (currentEmotion === 'happy' || currentEmotion === 'excited') {
                applyMorph('Smile', 0.7);
                applyMorph('Joy', 0.7);
                applyMorph('笑い', 0.7);
                applyMorph('にこり', 0.7);
            } else if (currentEmotion === 'sad') {
                applyMorph('Frown', 0.8);
                applyMorph('BrowsUp', 0.5);
                applyMorph('Sorrow', 0.7);
                applyMorph('困り', 0.7);
            } else if (currentEmotion === 'surprised') {
                applyMorph('BrowsUp', 1.0);
                applyMorph('MouthOpen', 0.4);
                applyMorph('Surprised', 0.8);
                applyMorph('びっくり', 0.8);
            }
        });
    };

    // Refs para LipSync basado en hueso de mandíbula
    const jawBoneRef = useRef<THREE.Bone | null>(null);
    const jawOriginalRotation = useRef<THREE.Euler | null>(null);

    // 🆕 Ref para suavizar apertura de boca y permitir decay gradual
    const autoMouthOpenRef = useRef<{ value: number } | null>(null);

    // Refs para huesos de labios (modelos Rigify como GrokAni)
    const lipTopBoneRef = useRef<THREE.Bone | null>(null);      // DEF-lip.T.L
    const lipTopRightRef = useRef<THREE.Bone | null>(null);     // DEF-lip.T.R
    const lipBottomBoneRef = useRef<THREE.Bone | null>(null);   // DEF-lip.B.L
    const lipBottomRightRef = useRef<THREE.Bone | null>(null);  // DEF-lip.B.R
    const lipTopOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipTopRightOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipBottomOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipBottomRightOriginalPos = useRef<THREE.Vector3 | null>(null);

    // Refs para huesos externos de labios (.001)
    const lipTopOuterRef = useRef<THREE.Bone | null>(null);      // DEF-lip.T.L.001
    const lipTopRightOuterRef = useRef<THREE.Bone | null>(null); // DEF-lip.T.R.001
    const lipBottomOuterRef = useRef<THREE.Bone | null>(null);   // DEF-lip.B.L.001
    const lipBottomRightOuterRef = useRef<THREE.Bone | null>(null); // DEF-lip.B.R.001
    const lipTopOuterOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipTopRightOuterOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipBottomOuterOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipBottomRightOuterOriginalPos = useRef<THREE.Vector3 | null>(null);

    // Refs para morphs DAZ JCM de mandíbula (abrir boca/labios)
    const dazJawMorphs = useRef<Array<{ mesh: THREE.Mesh, index: number, name: string }>>([]);

    // Reference to Clothing Manager
    const clothingManagerRef = useRef<any>(null);

    // NEW SYSTEMS REFS
    const animationManagerRef = useRef<AnimationManager | null>(null);
    const ikControllerRef = useRef<IKController | null>(null);
    const moodSystemRef = useRef<MoodSystem | null>(null);
    const materialManagerRef = useRef<MaterialManager | null>(null);
    const proceduralAnimatorRef = useRef<ProceduralAnimator | null>(null);
    const externalAnimPlayingRef = useRef(false);
    const isGrokAniRef = useRef(false);

    // Ref para gestos faciales/ojos/lengua voluntarios
    const activeFacialActionRef = useRef<{ action: string; timer: number; duration: number } | null>(null);

    // 🛑 Detener cualquier animación externa, clip o gesto activo y regresar suavemente a Idle
    const stopCurrentAnimation = useCallback(() => {
        externalAnimPlayingRef.current = false;
        hasIKTracksRef.current = false;
        activeClipHasMorphsRef.current = false;
        musicEnergyRef.current = 0;
        danceTimeRef.current = 0;
        isDancing.current = false;
        if (activeClipActionRef.current) {
            activeClipActionRef.current.stop();
            activeClipActionRef.current = null;
        }
        legIkControllerRef.current?.setIkData(null);
        if (mixerRef.current) mixerRef.current.stopAllAction();
        resetToPristinePose();
        if (animationManagerRef.current) {
            animationManagerRef.current.stopAll(0);
            animationManagerRef.current.play('Idle', { priority: 1, loop: true, blendDuration: 0.5 });
        }
        if (proceduralAnimatorRef.current) {
            proceduralAnimatorRef.current.stop();
        }
        // 🎵 Detener audio de animación
        if (animAudioRef.current) {
            animAudioRef.current.pause();
            animAudioRef.current.currentTime = 0;
            animAudioRef.current = null;
        }
        if ((window as any).__novaAnimAudio) {
            try {
                (window as any).__novaAnimAudio.pause();
                (window as any).__novaAnimAudio.currentTime = 0;
            } catch (_) {}
            (window as any).__novaAnimAudio = null;
        }
        // 🎥 Detener cámara cinemática VMD
        window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
        console.log('🛑 [AvatarViewer3D] Animación, música y cámara detenidas por completo.');
    }, [resetToPristinePose]);

    // 🎭 Despachador unificado de acciones (Clips de alta calidad vs Gestos Procedurales estándar)
    const executeAction = useCallback((actionName: string, customDuration?: number) => {
        if (!actionName || actionName === 'none') {
            proceduralAnimatorRef.current?.stop();
            return;
        }

        // 🔒 DEDUP: Ignorar la misma acción si ya se ejecutó hace menos de 300ms
        // Esto evita el bug de doble-carga cuando IKController y gesture parser disparan simultáneamente
        const now = Date.now();
        const last = lastExecutedActionRef.current;
        if (last.name === actionName && (now - last.ts) < 300) {
            return; // Duplicado ignorado
        }
        lastExecutedActionRef.current = { name: actionName, ts: now };

        let cleanAction = actionName;
        const lower = cleanAction.toLowerCase();
        if (lower === 'sit' || lower === 'sitting') {
            console.log("⚠️ Animación de sentarse desactivada. Cambiando a Idle.");
            cleanAction = 'Idle';
        }

        // Si es Idle o reset, asegurar reseteo de la espina
        if (cleanAction.toLowerCase().includes('idle')) {
            if (spineRef.current) {
                spineRef.current.traverse((child: any) => {
                    if (child.isBone && (child.name.toLowerCase().includes('spine') || child.name.toLowerCase().includes('chest'))) {
                        if (child.userData.baseQuat) {
                            child.quaternion.copy(child.userData.baseQuat);
                        } else {
                            child.rotation.set(0, 0, 0);
                        }
                    }
                });
            }
            animationManagerRef.current?.play('Idle', { priority: 10, loop: true, blendDuration: 0.5 });
            proceduralAnimatorRef.current?.stop();
            return;
        }

        // Resolver acción mediante GestureRegistry
        const res = gestureRegistry.resolveAction(
            cleanAction,
            (name) => animationManagerRef.current?.hasAnimation(name) ?? false
        );

        // Notificar inicio de acción para Feedback UX inmediato
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nova-action-started', {
                detail: {
                    action: cleanAction,
                    resolvedName: res.name,
                    type: res.type,
                    duration: customDuration || res.duration || 2.5
                }
            }));
        }

        // 1. Si existe en AnimationStore (VMD/MMD pack completo con audio, cámara y facial)
        const storedAnim = animationStore.get(res.name) || animationStore.get(cleanAction);
        if (storedAnim) {
            console.log(`🎬 [AvatarViewer3D] Ejecutando pack completo VMD para "${cleanAction}":`, storedAnim.name);
            window.dispatchEvent(new CustomEvent('nova-load-animation', { 
                detail: { 
                    url: storedAnim.url, 
                    name: storedAnim.name, 
                    type: storedAnim.type, 
                    autoplay: true,
                    loop: false // 🔒 REGLA: Ejecutar SOLO 1 VEZ (LoopOnce), sin bucle infinito
                } 
            }));
            proceduralAnimatorRef.current?.stop();
            return;
        }

        // 2. Si existe clip de animación real de alta calidad (Mixamo/VMD/GLB) en AnimationManager, usarlo
        let clipPlayed = false;
        if (res.type === 'clip' && animationManagerRef.current) {
            clipPlayed = animationManagerRef.current.play(res.name, {
                priority: res.priority ?? 10,
                loop: false, // 🔒 REGLA: Ejecutar SOLO 1 VEZ
                onComplete: () => {
                    console.log(`🏁 [AvatarViewer3D] Clip "${res.name}" terminado. Volviendo a Idle.`);
                    stopCurrentAnimation();
                }
            });
            if (clipPlayed) {
                proceduralAnimatorRef.current?.stop();
                return;
            }
        }

        // 2. Fallback: Gesto procedural estándar de Nova con naturalidad biológica garantizada
        if (proceduralAnimatorRef.current) {
            proceduralAnimatorRef.current.play(res.name, customDuration || res.duration);
        }
    }, [stopCurrentAnimation]);

    // Initializion logic for Clothing Manager
    useEffect(() => {
        if (modelRef.current) {
            const cm = getClothingManager();
            cm.initialize(modelRef.current, modelUrl || 'default');
            clothingManagerRef.current = cm;
            (window as any).novaClothingManager = cm;
            console.log(`👗 [AvatarViewer3D] ClothingManager vinculado para "${modelUrl || 'default'}"`);

            const handleToggle = (e: Event) => {
                const ce = e as CustomEvent<{ meshName: string; visible: boolean }>;
                if (ce.detail) {
                    cm.setItemVisibility(ce.detail.meshName, ce.detail.visible);
                }
            };
            const handlePreset = (e: Event) => {
                const ce = e as CustomEvent<{ preset: 'dressed' | 'underwear' | 'accessories' | 'nude' }>;
                if (ce.detail?.preset) {
                    cm.applyPreset(ce.detail.preset);
                }
            };
            const handleCategory = (e: Event) => {
                const ce = e as CustomEvent<{ category: any; visible: boolean }>;
                if (ce.detail) {
                    cm.setCategoryVisibility(ce.detail.category, ce.detail.visible);
                }
            };

            window.addEventListener('nova-clothing-toggle', handleToggle);
            window.addEventListener('nova-clothing-preset', handlePreset);
            window.addEventListener('nova-clothing-category', handleCategory);

            return () => {
                window.removeEventListener('nova-clothing-toggle', handleToggle);
                window.removeEventListener('nova-clothing-preset', handlePreset);
                window.removeEventListener('nova-clothing-category', handleCategory);
            };
        }
    }, [modelRef.current, modelUrl]);

    // Connect external audio analyser to the LipSync system
    useEffect(() => {
        if (lipSyncRef.current && audioAnalyser) {
            console.log('🎙️ [AvatarViewer3D] Conectando analizador de audio de Nova');
            lipSyncRef.current.setExternalAnalyser(audioAnalyser);
        }
    }, [audioAnalyser, lipSyncRef.current]);

    // Hook para controlar el modo hot / ninfómana
    useEffect(() => {
        if (isHotMode) {
            console.log("🔥 MODO NINFÓMANO ACTIVADO - Intensidad máxima");

            // Aumentar física de jiggle
            if (jiggleState.current) {
                jiggleState.current.lBreast.velocity = 1.2;
                jiggleState.current.rBreast.velocity = 1.2;
                jiggleState.current.lButt.velocity = 1.0;
                jiggleState.current.rButt.velocity = 1.0;
            }

            // Breathing más sensual
            if (spineRef.current) {
                spineRef.current.userData.hotBreathIntensity = 1.5;
            }

            // Sway de caderas más pronunciado
            proceduralAnimatorRef.current?.setSwayIntensity(1.4);
        } else {
            if (spineRef.current) {
                spineRef.current.userData.hotBreathIntensity = 1.0;
            }
            proceduralAnimatorRef.current?.setSwayIntensity(1.0);
        }
    }, [isHotMode]);

    // 🫁 Sincronización Fisiológica con Motor ASMR y Latidos (BPM)
    const activeBpmRef = useRef<number>(72);
    useEffect(() => {
        const handleBpmUpdate = (e: any) => {
            if (e.detail?.bpm) {
                activeBpmRef.current = e.detail.bpm;
            }
        };
        window.addEventListener('nova-bpm-update', handleBpmUpdate);
        return () => {
            window.removeEventListener('nova-bpm-update', handleBpmUpdate);
        };
    }, []);

    const [morphTargetMeshes, setMorphTargetMeshes] = useState<THREE.Mesh[]>([]);

    // Refs para stickers de emociones
    const stickerHeartRef = useRef<THREE.Mesh | null>(null); // Sticker001 (Heart) - Joy/Love
    const stickerVeinRef = useRef<THREE.Mesh | null>(null);  // Sticker001 1 (Veins) - Anger
    const stickerDropRef = useRef<THREE.Mesh | null>(null);  // Sticker001 2 (Drop) - Sadness/Shame

    // FLUID SIMULATION REF
    const fluidParticlesRef = useRef<Array<{ mesh: THREE.Mesh, life: number, velocity: THREE.Vector3 }>>([]);

    // Estados internos

    // Estados internos
    const blinkTimer = useRef(0);
    const nextBlinkTime = useRef(2);
    const isBlinking = useRef(false);
    const blinkDuration = 0.2;
    const lookTarget = useRef(new THREE.Vector2(0, 0)); // Para suavizar la mirada

    // Diccionario de mapeo para LipSync (Anime -> Standard)
    const [visemeMap, setVisemeMap] = useState<Record<string, number>>({});

    // Cleanup function to dispose runtime controllers and animation state
    const cleanupResources = () => {
        console.log('🧹 Limpiando recursos del modelo...');

        // Dispose mixer
        if (mixerRef.current) {
            mixerRef.current.stopAllAction();
            mixerRef.current = null;
        }

        // Dispose IK controller & event listeners
        if (ikControllerRef.current) {
            ikControllerRef.current.dispose();
        }

        if (legIkControllerRef.current) {
            legIkControllerRef.current.dispose();
            legIkControllerRef.current = null;
        }

        // Dispose lip sync
        if (lipSyncRef.current) {
            lipSyncRef.current = null;
        }

        console.log('✅ Recursos limpiados');
    };

    useEffect(() => {
        if (modelRef.current) {
            const SHOW_VERBOSE_LOGS = false;
            const meshes: THREE.Mesh[] = [];
            morphMeshesRef.current = []; // Limpiar antes de llenar
            const newVisemeMap: Record<string, number> = {};

            // Pre-detectar si el modelo es GrokAni por la presencia de sus huesos clave en la jerarquía
            let isModelGrokAni = false;
            modelRef.current.traverse((c: any) => {
                if (c.isBone) {
                    const nameLower = c.name.toLowerCase();
                    if (nameLower.includes('grokani') || nameLower.includes('breast_master') || nameLower.includes('jaw_master') || nameLower.includes('org-breast') || nameLower.includes('def-breast')) {
                        isModelGrokAni = true;
                    }
                }
            });

            if (SHOW_VERBOSE_LOGS) console.log('🧐 [AvatarViewer3D] ¿Es modelo GrokAni detectado en precarga?:', isModelGrokAni);

            // 1. RECORRIDO INICIAL Y FIX DE MATERIALES
            modelRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    // FIX CRÍTICO: Evita que desaparezcan partes de la cara al girar
                    child.frustumCulled = false;

                    // FIX MATERIALES:
                    if (child.material) {
                        const meshName = child.name.toLowerCase();
                        const fixMaterial = (mat: THREE.Material) => {
                            // FIX CRÍTICO: Los modelos PMX/MMD/calibrados ya tienen sus materiales calibrados con PBR realista y SSS
                            // (MeshStandardMaterial con Normal Maps, rugosidad aterciopelada y reflejos calculados).
                            // NO sobreescribir con roughness=1.0 ni envMapIntensity=0.1 (que los vuelve pálidos y planos).
                            if (isPMX || (mat as any).userData?.isCalibrated) return;

                            // DEBUG: Log para ver qué meshes estamos procesando
                            if (SHOW_VERBOSE_LOGS) console.log('🎨 Procesando material:', child.name, 'tipo:', mat.type);

                            // CRÍTICO: Verificar PRIMERO si es un decal, ANTES de verificar si es piel
                            // Esto es importante porque "FaceLashes" contiene "face" pero debe ser decal
                            const isDecal = (
                                meshName.includes('sticker') ||
                                meshName.includes('lashes') ||
                                meshName.includes('blush') ||
                                meshName.includes('shadow') ||
                                meshName.includes('sombra')
                            );

                            // IMPORTANTE: Detectar si es parte del cuerpo base
                            // Solo se aplica si NO es un decal
                            const isSkin = (
                                !isDecal && (
                                    meshName.includes('body') ||
                                    meshName.includes('face') ||
                                    meshName.includes('skin') ||
                                    meshName.includes('head') ||
                                    meshName.includes('retopo') ||
                                    meshName.includes('human_') ||
                                    meshName.includes('ani_main') || // GrokAni cuerpo principal
                                    meshName.includes('ani_body') ||
                                    meshName === 'ani_main'           // Nombre exacto
                                )
                            );

                            if (isDecal) {
                                // Decals/Stickers: Overlay transparente sobre la piel
                                mat.side = THREE.FrontSide;
                                mat.transparent = true;
                                mat.depthWrite = false;
                                // FIX Z-FIGHTING: offset para renderizar encima
                                mat.polygonOffset = true;
                                mat.polygonOffsetFactor = -2;
                                mat.polygonOffsetUnits = -2;
                                child.renderOrder = 999;

                                // Asegurar alpha blending correcto
                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.alphaTest = 0.01; // Descartar píxeles casi transparentes
                                }
                                if (SHOW_VERBOSE_LOGS) console.log('✨ Configurado como DECAL:', child.name);
                            } else if (meshName.includes('eye') && !meshName.includes('eyebrow') && !meshName.includes('eyelash')) {
                                // OJOS: Córnea brillante y húmeda con catchlights vivos
                                mat.side = THREE.DoubleSide;
                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.roughness = 0.05;        // FIX: córnea cristalina (0 = espejo, evita ojos negros)
                                    mat.metalness = 0.0;
                                    mat.envMapIntensity = 0.70;  // FIX: reflejo de entorno visible (sin esto quedan negros)
                                    // Mantener emissive intacto
                                }
                                if (SHOW_VERBOSE_LOGS) console.log('👁️ Configurado como OJO:', child.name);
                            } else if (isSkin) {
                                // PIEL/CUERPO: Material mate suave (Anime)
                                // CRÍTICO: DoubleSide para evitar caras negras al flexionar (cuello, axilas)
                                mat.side = THREE.DoubleSide;
                                mat.transparent = false;
                                mat.depthWrite = true;
                                mat.polygonOffset = false;

                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.roughness = 0.78;        // FIX: mate suave, no totalmente negro en sombras
                                    mat.metalness = 0.0;         // Nada metálico
                                    mat.envMapIntensity = 0.18;  // FIX: mínimo reflejo de entorno para evitar negro total

                                    // Restaurar aoMapIntensity para evitar sombras sucias
                                    mat.aoMapIntensity = 0.5;

                                    // Forzar colorSpace correcto
                                    if (mat.map) {
                                        mat.map.colorSpace = THREE.SRGBColorSpace;
                                        const img = mat.map.image as any;
                                        if (img && (img.width > 0 || img.data)) {
                                            mat.map.needsUpdate = true;
                                        } else {
                                            mat.map.needsUpdate = false;
                                        }
                                    }
                                    if (!mat.map) {
                                        mat.color.set(0xffe0c8);
                                    }
                                    mat.needsUpdate = true;
                                }
                            } else {
                                // Ropa, pelo, accesorios, etc. (Anime)
                                mat.side = THREE.DoubleSide;
                                mat.polygonOffset = false;

                                // Detectar si es pelo (necesita CUTOUT en vez de BLEND para evitar ver a través)
                                const isHairMesh = (
                                    meshName.includes('hair') || meshName.includes('pelo') ||
                                    meshName.includes('strand') || meshName.includes('bangs') ||
                                    meshName.includes('ponytail') || meshName.includes('braid') ||
                                    meshName.includes('kaminoke') || meshName.includes('前发') ||
                                    meshName.includes('后发') || meshName.includes('刘海')
                                );

                                if (mat.transparent) {
                                    if (isHairMesh) {
                                        // ✅ PELO → modo CUTOUT: renderiza en el pass opaco con depth correcto
                                        // Elimina COMPLETAMENTE el artefacto de "ver a través del pelo"
                                        mat.transparent = false;
                                        mat.alphaTest = 0.15; // Cortar bordes semitransparentes del pelo
                                        mat.depthWrite = true;
                                    } else {
                                        // ✅ Ropa/encajes con transparencia real → BLEND correcto
                                        // depthWrite=false es el único modo correcto para blend transparency
                                        mat.alphaTest = 0.05;
                                        mat.depthWrite = false;
                                    }
                                } else {
                                    mat.alphaTest = 0;
                                    mat.depthWrite = true;
                                }

                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.roughness = 0.80;
                                    mat.metalness = 0.0;
                                    mat.envMapIntensity = 0.12;
                                    mat.needsUpdate = true;
                                }
                                if (SHOW_VERBOSE_LOGS) console.log('👕 Configurado como OTRO:', child.name);
                            }
                        };
                        if (Array.isArray(child.material)) child.material.forEach(fixMaterial);
                        else fixMaterial(child.material);
                    }
                }
            });

            // 1.1 FIX UNIVERSAL DE TRANSPARENCIA Y CARAS NEGRAS (Aplica a FBX, GLTF, VRM; preserva PMX ya calibrados)
            modelRef.current.traverse((child: any) => {
                if (child.isMesh && child.material) {
                    // Si el modelo es PMX o el material ya fue calibrado en pmxLoader, omitir para no alterar sus tonos
                    if (isPMX || child.name.includes('MMD_Mesh')) return;

                    const mName = (child.name || '').toLowerCase();
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach((mat: any) => {
                        if (!mat || mat.userData?.isCalibrated) return;
                        const matName = (mat.name || '').toLowerCase();
                        const isEye = /eye|pupil|iris|cornea|sclera|shirome|白目|瞳|目|眼|ハイライト|catchlight/i.test(matName) || /eye|pupil|iris|cornea|sclera|shirome|白目|瞳|目|眼|ハイライト|catchlight/i.test(mName);
                        const isDecal = !isEye && ((/tattoo|紋|sticker/i.test(matName) || (!/eye|shirome|白目/i.test(matName) && /blush|shadow|decal|lashes|eyelash/i.test(matName))) || (/tattoo|紋|sticker/i.test(mName) || (!/eye|shirome|白目/i.test(mName) && /blush|shadow|decal|lashes|eyelash/i.test(mName))));
                        const isHair = !isEye && (/hair|bangs|tail|ponytail|kaminoke|strand|前发|后发|刘海|髪|发|毛|pelo/i.test(matName) || /hair|bangs|tail|ponytail|kaminoke|strand|前发|后发|刘海|髪|发|毛|pelo/i.test(mName));
                        const isSkin = !isEye && !isDecal && (/skin|body|肌|体|颜|face|head|human/i.test(matName) || /skin|body|肌|体|颜|face|head|human/i.test(mName));

                        // 1. Evitar que partes se vean negras por el reverso (faldas, cuellos, cabello, ropa):
                        if (!isDecal) {
                            mat.side = THREE.DoubleSide;
                        }

                        // 2. Corregir transparencia / ver a través:
                        if (isEye) {
                            // Los ojos y córnea NUNCA deben ser transparentes (evita ojos huecos o ver a través de la cabeza)
                            mat.transparent = false;
                            mat.opacity = 1.0;
                            mat.depthWrite = true;
                            mat.depthTest = true;
                            mat.alphaTest = 0;
                            mat.polygonOffset = false;

                            if (mat.color) {
                                if (!mat.map || (mat.color.r < 0.2 && mat.color.g < 0.2 && mat.color.b < 0.2 && !matName.includes('pupil') && !matName.includes('瞳'))) {
                                    mat.color.setRGB(1.0, 1.0, 1.0);
                                }
                            }
                            if (mat.emissive) {
                                mat.emissive.setRGB(0.18, 0.18, 0.18);
                            }
                            if (child.isMesh && !isPMX && !(mat as any).userData?.isCalibrated) {
                                child.renderOrder = 2;
                            }
                        } else if (isSkin) {
                            // La piel y el rostro NUNCA deben ser transparentes
                            mat.transparent = false;
                            mat.opacity = 1.0;
                            mat.depthWrite = true;
                            mat.depthTest = true;
                            mat.alphaTest = 0;
                        } else if (isHair) {
                            // El cabello en Three.js con transparent=true se vuelve transparente y se ve el cráneo/fondo
                            // MODO CUTOUT: transparent=false + alphaTest + depthWrite=true
                            mat.transparent = false;
                            if (mat.alphaTest === undefined || mat.alphaTest < 0.1) {
                                mat.alphaTest = 0.2;
                            }
                            mat.depthWrite = true;
                        } else if (!isDecal) {
                            // Ropa y accesorios: Por defecto sólidos y opacos para evitar que se transparenten
                            if (mat.opacity !== undefined && mat.opacity < 0.85) {
                                // Ropa con transparencia intencional real (velos, encajes)
                                mat.transparent = true;
                                mat.depthWrite = false;
                                mat.alphaTest = 0.05;
                            } else {
                                mat.transparent = false;
                                mat.depthWrite = true;
                                mat.alphaTest = mat.map ? 0.15 : 0;
                            }
                        }
                        mat.needsUpdate = true;
                    });
                }
            });

            // Código de depuración para exportar datos de materiales a un archivo
            try {
                const debugData: any[] = [];
                modelRef.current.traverse((child: any) => {
                    if (child.isMesh) {
                        // DIAGNÓSTICO DE HUESOS
                        if (child.isSkinnedMesh && child.skeleton) {
                            const skeletonBoneNames = child.skeleton.bones.map((b: any) => b.name);
                            const gluteBonesInSkin = skeletonBoneNames.filter((b: string) => {
                                const lower = b.toLowerCase();
                                return (lower.includes('ass') || lower.includes('glute') || lower.includes('butt')) && !lower.includes('glass') && !lower.includes('class');
                            });
                            // console.log('🔍 HUESOS DE GLÚTEOS CONECTADOS A LA PIEL:', gluteBonesInSkin.length > 0 ? gluteBonesInSkin.join(', ') : '¡NINGUNO!');
                        }

                        const matList = Array.isArray(child.material) ? child.material : [child.material];
                        matList.forEach((mat: any) => {
                            if (mat) {
                                debugData.push({
                                    meshName: child.name,
                                    materialName: mat.name,
                                    type: mat.type,
                                    color: mat.color ? mat.color.getHexString() : null,
                                    hasMap: !!mat.map,
                                    mapUrl: mat.map ? mat.map.uuid : null,
                                    roughness: mat.roughness,
                                    metalness: mat.metalness,
                                    transparent: mat.transparent,
                                    opacity: mat.opacity
                                });
                            }
                        });
                    }
                });
                if (SHOW_VERBOSE_LOGS) console.log('📝 [Debug] Guardando información de materiales a debug_materials.json');
                // Guardar la información a un evento o log
                (window as any).__debugMaterials = debugData;
            } catch (err) {
                console.error("Error en debug logging:", err);
            }

            // ACTUALIZAR MATRICES GLOBALES ANTES DE LA CIRUGÍA ESPACIAL
            modelRef.current.updateMatrixWorld(true);

            // Collect all bones used by SkinnedMeshes to filter out dummy transform bones
            const validSkinBones = new Set<THREE.Bone>();
            modelRef.current.traverse((child) => {
                if ((child as any).isSkinnedMesh) {
                    const sm = child as THREE.SkinnedMesh;
                    if (sm.skeleton && sm.skeleton.bones) {
                        sm.skeleton.bones.forEach(b => validSkinBones.add(b));
                        // Removed spatial surgery block because spine.004 and spine.005 actually control the hair
                    }
                }
            });

            modelRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const name = child.name.toLowerCase();

                    // DETECCIÓN DE PARTES ESPECIALES
                    // CRÍTICO: Ocultar el blush o sombras de sticker por defecto en modelos no-PMX (cubre toda la cara o ensucia el cuello)
                    if (!isPMX && (name.includes('blush') || name.includes('sombra') || (name.includes('shadow') && (name.includes('face') || name.includes('decal'))))) {
                        if (SHOW_VERBOSE_LOGS) console.log('😊 Ocultando mesh especial (blush/shadow):', child.name);
                        child.visible = false;
                    } else if (name.includes('sticker001 1') || name.includes('sticker001_1')) {
                        stickerVeinRef.current = child; // Anger
                        child.visible = false;
                    } else if (name.includes('sticker001 2') || name.includes('sticker001_2')) {
                        stickerDropRef.current = child; // Drop (Shame/Sadness)
                        child.visible = false;
                    } else if (name.includes('sticker001')) {
                        child.visible = false;
                    } else if (name.includes('sticker') || name.includes('lashes')) {
                        // Otros stickers o pestañas (si hubiera)
                        // child.visible = false; // Las pestañas NO deben ocultarse
                        if (name.includes('sticker')) child.visible = false;
                    } else {
                        // Es un mesh del cuerpo/cara
                        if (child.morphTargetDictionary) {
                            meshes.push(child);
                            morphMeshesRef.current.push(child);

                            // DEBUG: Mostrar morphs encontrados en este mesh
                            const morphNames = Object.keys(child.morphTargetDictionary);
                            if (SHOW_VERBOSE_LOGS) console.log(`🎭 MESH "${child.name}" Morph List:`, morphNames);

                            if (child.name === 'Ani_Main') {
                                if (SHOW_VERBOSE_LOGS) {
                                    console.log("🔥 SHAPE KEYS ENCONTRADAS EN ANI_MAIN:");
                                    console.log(Object.keys(child.morphTargetDictionary));
                                }

                                // Intenta buscar automáticamente las de interés:
                                const keys = Object.keys(child.morphTargetDictionary);
                                const tongueKey = keys.find(k => k.toLowerCase().includes('tongue'));
                                const ahegaoKey = keys.find(k => k.toLowerCase().includes('ahegao') || k.toLowerCase().includes('roll'));

                                // DUMP ALL RELEVANT BONES
                                if (SHOW_VERBOSE_LOGS) {
                                    const allBones: string[] = [];
                                    child.parent?.parent?.traverse((node: any) => {
                                        if (node.isBone) {
                                            const n = node.name.toLowerCase();
                                            if (n.includes('spine') || n.includes('head') || n.includes('neck') || n.includes('hair')) {
                                                allBones.push(node.name);
                                            }
                                        }
                                    });
                                    // console.log("💀 BONES DUMP:", allBones.join(', ')); // DEBUG ONLY - muy costoso
                                }

                                if (tongueKey && SHOW_VERBOSE_LOGS) console.log(`👅 Clave de lengua detectada: "${tongueKey}"`);
                                if (ahegaoKey && SHOW_VERBOSE_LOGS) console.log(`🥵 Clave Ahegao detectada: "${ahegaoKey}"`);
                            }

                            // DEBUG: Buscar TODOS los morphs relacionados con boca/labios
                            const mouthMorphs = morphNames.filter(m => {
                                const ml = m.toLowerCase();
                                return ml.includes('mouth') || ml.includes('lip') || ml.includes('open') ||
                                    ml.includes('jaw') || ml.includes('smile') || ml.includes('frown');
                            });
                            if (mouthMorphs.length > 0 && SHOW_VERBOSE_LOGS) {
                                console.log(`👄 MORPHS DE BOCA en "${child.name}":`, mouthMorphs.join(', '));
                            }

                            // MAPEO DE LIPSYNC INTELIGENTE
                            // Busca nombres comunes en VARIOS tipos de modelos
                            const dict = child.morphTargetDictionary;
                            Object.keys(dict).forEach(key => {
                                const k = key.toLowerCase();

                                // Mapear "boca abierta" de varios formatos:
                                // - Anime / MMD / PMX: あ, ワ, わ, 大, a, aa, fcl_mth_a
                                // - RPM: mouthOpen, viseme_aa
                                // - DAZ: eCTRLMouthOpen, eCTRLJawOpen, eCTRLvAA
                                if (
                                    k === 'a' || k === 'aa' ||
                                    k === 'mouthopen' || k === 'mouth_open' ||
                                    k === 'fcl_mth_a' ||
                                    k === 'あ' || k === 'ワ' || k === 'わ' || k === '大' || k.includes('あ') ||
                                    k.includes('mouthopen') || k.includes('jawopen') ||
                                    k.includes('ectrlmouthopen') || k.includes('ectrljawopen') ||
                                    k.includes('ctrlvaa') || k.includes('viseme_aa')
                                ) {
                                    newVisemeMap['viseme_aa'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de boca encontrado: ${key} → viseme_aa`);
                                }
                                if (k === 'e' || k === 'ee' || k === 'fcl_mth_e' || k === 'え' || k.includes('え') || k.includes('viseme_e') || k.includes('ctrlvee') || k.includes('mouthee')) {
                                    newVisemeMap['viseme_E'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal E encontrado: ${key} → viseme_E`);
                                }
                                if (k === 'i' || k === 'ih' || k === 'fcl_mth_i' || k === 'い' || k.includes('い') || k.includes('viseme_i') || k.includes('ctrlvih') || k.includes('mouthih')) {
                                    newVisemeMap['viseme_I'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal I encontrado: ${key} → viseme_I`);
                                }
                                if (k === 'o' || k === 'oh' || k === 'fcl_mth_o' || k === 'お' || k.includes('お') || k.includes('viseme_o') || k.includes('ctrlvoh') || k.includes('mouthfunnel') || k.includes('mouth_funnel')) {
                                    newVisemeMap['viseme_O'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal O encontrado: ${key} → viseme_O`);
                                }
                                if (k === 'u' || k === 'ou' || k === 'fcl_mth_u' || k === 'う' || k.includes('う') || k.includes('viseme_u') || k.includes('ctrlvou') || k.includes('mouthpucker') || k.includes('mouth_pucker')) {
                                    newVisemeMap['viseme_U'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal U encontrado: ${key} → viseme_U`);
                                }

                                // Morphs de consonantes y cierre bilabial (M, P, B, F, TH)
                                if (
                                    k === 'm' || k === 'b' || k === 'p' || k === 'pp' ||
                                    k === 'ん' || k === 'む' ||
                                    k === 'viseme_pp' || k === 'viseme_p' || k === 'mouthclose' || k === 'mouth_close' ||
                                    k === 'fcl_mth_close' || k.includes('viseme_pp') || k.includes('ctrlvpp') || k.includes('ectrlvpp')
                                ) {
                                    newVisemeMap['viseme_PP'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de cierre bilabial (M/P/B) encontrado: ${key} → viseme_PP`);
                                }
                                if (k === 'f' || k === 'ff' || k === 'viseme_ff' || k.includes('viseme_ff') || k.includes('ctrlvff')) {
                                    newVisemeMap['viseme_FF'] = dict[key];
                                }
                                if (k === 'th' || k === 'viseme_th' || k.includes('viseme_th')) {
                                    newVisemeMap['viseme_TH'] = dict[key];
                                }

                                // DAZ JCM - Morphs que se activan con rotación de mandíbula
                                // Buscar: pJCMJaw*, eCTRLMouth*, *jawdown*, *jawopen*, *mouthopen*
                                if (
                                    k.includes('pjcmjaw') || k.includes('jcmjaw') ||
                                    k.includes('jawdown') || k.includes('jaw_down') ||
                                    k.includes('jawopen') || k.includes('jaw_open') ||
                                    k.includes('mouthopen') || k.includes('mouth_open') ||
                                    k.includes('ectrlmouth') || k.includes('lipopen')
                                ) {
                                    dazJawMorphs.current.push({
                                        mesh: child as THREE.Mesh,
                                        index: dict[key],
                                        name: key
                                    });
                                    if (SHOW_VERBOSE_LOGS) console.log(`🦷 DAZ JCM Morph encontrado: ${key} (index: ${dict[key]})`);
                                }

                                // Detectar lengua
                                if (k.includes('tongue') || k.includes('m_t')) {
                                    tongueRef.current = dict[key];
                                    tongueMeshRef.current = child;
                                }
                            });
                        }
                    }
                }

                // 2. BÚSQUEDA DE HUESOS (Más tolerante: Acepta Object3D si tiene nombre clave)
                const lowerName = child.name.toLowerCase();
                const isJigglePart = (/breast|ass|pectoral|glute|butt|oppai|mune|shiri/.test(lowerName) ||
                    child.name.includes('胸') || child.name.includes('尻') || child.name.includes('髪') || child.name.includes('スカート')) &&
                    !lowerName.includes('glass') && !lowerName.includes('class');

                if (child instanceof THREE.Bone || isJigglePart) {
                    const name = lowerName; // Ya lo tenemos calculado
                    const originalName = child.name;
                    const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r') || originalName.endsWith('R') || originalName.endsWith('_R') || originalName.endsWith('.R') || originalName.includes('右') || originalName.startsWith('r_') || originalName.startsWith('R_');
                    const isLeft = name.includes('left') || name.includes('_l') || name.endsWith('.l') || originalName.endsWith('L') || originalName.endsWith('_L') || originalName.endsWith('.L') || originalName.includes('左') || originalName.startsWith('l_') || originalName.startsWith('L_');

                    // DEPURACIÓN: DUMP DE JERARQUÍA DE HUESOS (Desactivado)
                    /*
                    if (debugDumpCount.current < 200) {
                         console.log(`🦴 NODE [${child.type}]: "${child.name}" (Bone? ${child instanceof THREE.Bone})`);
                         debugDumpCount.current++;
                    }
                    */

                    // Match the actual head bone, avoiding hair nodes or end tips
                    // PRIORIDAD ABSOLUTA a huesos de deformación reales (VRM/Mixamo/PMX)
                    const isDeformHead = name === 'j_bip_c_head' || name === 'mixamorighead' || name === 'def-head' || name === 'bip01_head' || originalName === '頭';
                    const isExactHead = isDeformHead || name === 'head' || originalName === '頭';
                    const isFuzzyHead = (name.includes('head') || originalName.includes('頭')) && !name.includes('top') && !name.includes('end') && !name.includes('hair') && !name.includes('accessory');

                    if (isExactHead || isFuzzyHead) {
                        const isDeforming = validSkinBones.has(child as THREE.Bone);
                        if (isDeforming || isDeformHead) {
                            if (isDeformHead || !headBoneRef.current || (isExactHead && !headBoneRef.current.name.toLowerCase().includes('j_bip'))) {
                                headBoneRef.current = child as any;
                            }
                        }
                    }

                    // PRIORIDAD a espina base / abdomen (Excluyendo cuello def-spine.004, 005, 006 y cabeza)
                    const isNeckBone = name.includes('spine.004') || name.includes('spine.005') || name.includes('spine.006') || name.includes('neck') || name.includes('head') || originalName === '首' || originalName === '頭';
                    const isDeformSpine = !isNeckBone && (name === 'j_bip_c_spine' || name === 'mixamorigspine' || name === 'def-spine' || name === 'def-spine.001' || name === 'spine' || name === 'spine.001' || originalName === '上半身' || originalName === '上半身2');
                    const isFuzzySpine = !isNeckBone && (name.includes('spine') || name.includes('chest') || originalName.includes('上半身'));
                    if (isDeformSpine || (!spineRef.current && isFuzzySpine)) {
                        if (validSkinBones.has(child as THREE.Bone) || isDeformSpine) {
                            if (isDeformSpine || !spineRef.current) {
                                spineRef.current = child as any;
                                if (!spineRef.current.userData.basePos) spineRef.current.userData.basePos = spineRef.current.position.clone();
                            }
                        }
                    }

                    // PRIORIDAD a caderas / pelvis central (EXCLUYENDO huesos unilaterales como DEF-pelvis.L/R que desgarran la columna)
                    const isSingleSide = name.includes('.l') || name.includes('.r') || name.includes('_l') || name.includes('_r') || name.endsWith('.l') || name.endsWith('.r') || name.endsWith('l') || name.endsWith('r');
                    const isDeformHips = !isSingleSide && (name === 'j_bip_c_hips' || name === 'mixamorighips' || name === 'bip01_pelvis' || originalName === 'センター' || originalName === '下半身');
                    const isExactHips = isDeformHips || (!isSingleSide && (name === 'hips' || name === 'def-hips' || name === 'pelvis' || originalName === 'グルーブ' || originalName === '全ての親' || originalName === '腰'));
                    const isFuzzyHips = !isSingleSide && (name.includes('hips') || name === 'pelvis' || name === 'torso' || name.includes('grokani_hips') || originalName.includes('下半身') || originalName.includes('センター'));

                    if (isExactHips || isFuzzyHips) {
                        if (validSkinBones.has(child as THREE.Bone) || isDeformHips) {
                            if (isDeformHips || !hipsRef.current || (isExactHips && !hipsRef.current.name.toLowerCase().includes('j_bip'))) {
                                hipsRef.current = child as any;
                                if (!hipsRef.current.userData.basePos) hipsRef.current.userData.basePos = hipsRef.current.position.clone();
                            }
                        }
                    }

                    // --- DANCE: Detección de Pelo y Ropa ---
                    if (name.includes('hair') || name.includes('ponytail') || name.includes('braid')) {
                        // Evitar duplicados
                        if (!hairBonesRef.current.some(b => b.uuid === child.uuid)) {
                            if (SHOW_VERBOSE_LOGS) console.log('💇 Hair bone found:', name);
                            hairBonesRef.current.push(child);
                            swayState.current[child.uuid] = {
                                velocity: 0,
                                rotation: 0,
                                baseRot: child.rotation.clone() // GUARDAR POSICIÓN ORIGINAL
                            };
                        }
                    }
                    if (name.includes('skirt') || name.includes('dress') || name.includes('cloth') || name.includes('apron')) {
                        if (!skirtBonesRef.current.some(b => b.uuid === child.uuid)) {
                            if (SHOW_VERBOSE_LOGS) console.log('👗 Skirt bone found:', name);
                            skirtBonesRef.current.push(child);
                            swayState.current[child.uuid] = {
                                velocity: 0,
                                rotation: 0,
                                baseRot: child.rotation.clone() // GUARDAR POSICIÓN ORIGINAL
                            };
                        }
                    }



                    // 0. HARDCODED USER REQUEST (Máxima prioridad)
                    // Nombres reales encontrados: DEF-breast.L, DEF-breast.R, etc.
                    const exactName = child.name;

                    if (name === 'def-breast.l' || name === 'def-breast.001.l' || exactName === 'breast_master.L') {
                        leftBreastRef.current = child as any;
                    }
                    if (name === 'def-breast.r' || name === 'def-breast.001.r' || exactName === 'breast_master.R') {
                        rightBreastRef.current = child as any;
                    }
                    // Búsqueda de huesos deformadores para glúteos
                    if (name.includes('glute') || name.includes('butt') || name.includes('ass')) {
                        if (!name.includes('hole') && !name.includes('collision')) { // Evitar colliders y otros
                            const isL = isLeft || name.includes('.l') || name.includes('_l');
                            const isR = isRight || name.includes('.r') || name.includes('_r');
                            const isDef = name.includes('def-');

                            if (isL) {
                                // Priorizar huesos "DEF-", sino el primero encontrado
                                const currentName = leftButtRef.current ? leftButtRef.current.name.toLowerCase() : '';
                                const currentIsDef = currentName.includes('def-');

                                if (!leftButtRef.current ||
                                    currentName.includes('pelvis') ||
                                    (isDef && !currentIsDef)) {
                                    leftButtRef.current = child as any;
                                    console.log('🍑 ASIGNADO GLÚTEO IZQUIERDO:', child.name);
                                }
                            }
                            if (isR) {
                                const currentName = rightButtRef.current ? rightButtRef.current.name.toLowerCase() : '';
                                const currentIsDef = currentName.includes('def-');

                                if (!rightButtRef.current ||
                                    currentName.includes('pelvis') ||
                                    (isDef && !currentIsDef)) {
                                    rightButtRef.current = child as any;
                                    console.log('🍑 ASIGNADO GLÚTEO DERECHO:', child.name);
                                }
                            }
                        }
                    }
                    if (name === 'def-pelvis.l' && !leftButtRef.current) { leftButtRef.current = child as any; console.log('🍑 ASIGNADO GLÚTEO IZQ (PELVIS FALLBACK):', child.name); }
                    if (name === 'def-pelvis.r' && !rightButtRef.current) { rightButtRef.current = child as any; console.log('🍑 ASIGNADO GLÚTEO DER (PELVIS FALLBACK):', child.name); }

                    // Zonas íntimas y boca (pussy, vagina, asshole, lips)
                    if (name.includes('pussy') || name.includes('vagina') || name.includes('lip_down') || name.includes('labia')) {
                        if (!vaginaRef.current) vaginaRef.current = child as any;
                    }
                    if (name.includes('asshole') || name.includes('anus')) {
                        if (!anusRef.current) anusRef.current = child as any;
                    }
                    if (name.includes('lips') || name.includes('mouth')) {
                        if (!lipsRef.current) lipsRef.current = child as any;
                    }

                    // JIGGLE BONES DETECTION (Fuzzy Fallback)
                    // Prioridad: "master" > normal > "front"/"tip"
                    // Nota: La detección fuzzy falló antes porque 'masterl' no terminaba en '.l' ni '_l'
                    // Solo activamos fallback si NO se asignó arriba
                    const fuzzyCheck = !leftBreastRef.current || !rightBreastRef.current || !leftButtRef.current || !rightButtRef.current;

                    const isBreastCandidate = name.includes('pectoral') || name.includes('breast') || name.includes('chestlower') ||
                        name.includes('oppai') || name.includes('mune') || originalName.includes('胸');

                    if (fuzzyCheck && isBreastCandidate) {
                        if (SHOW_VERBOSE_LOGS) console.log('✅ Found Breast Bone candidate:', originalName);
                        const isL = isLeft || name.startsWith('lpectoral') || name.startsWith('l_') || originalName.includes('左');
                        const isR = isRight || name.startsWith('rpectoral') || name.startsWith('r_') || originalName.includes('右');

                        // Si es "master", tiene prioridad absoluta. Si no, solo si no hay uno asignado.
                        const isMaster = name.includes('master') || name.includes('pectoral');

                        if (isL) {
                            if (isMaster || !leftBreastRef.current) leftBreastRef.current = child as any;
                        } else if (isR) {
                            if (isMaster || !rightBreastRef.current) rightBreastRef.current = child as any;
                        }
                    }

                    // Extra sensory zones (Belly, Hair)
                    if (fuzzyCheck && (name.includes('belly') || name.includes('stomach') || name.includes('abdomen'))) {
                        if (!bellyRef.current) bellyRef.current = child as any;
                    }
                    if (fuzzyCheck && (name.includes('hair') || name.includes('ponytail') || name.includes('bangs') || originalName.includes('髪'))) {
                        // Preferir huesos frontales o colas principales
                        if (!hairRef.current || name.includes('front') || name.includes('tail')) hairRef.current = child as any;
                    }

                    // Agregado 'ass' para modelos Rigify/Blender y '尻' para PMX
                    const isButtCandidate = name.includes('glute') || name.includes('butt') || name.includes('ass_') || name.includes('ass-') ||
                        name.includes('shiri') || originalName.includes('尻');

                    if (isButtCandidate) {
                        if (SHOW_VERBOSE_LOGS) console.log('✅ Found Butt Bone candidate:', originalName);
                        const isL = isLeft || name.startsWith('lglute') || name.startsWith('l_') || name.includes('.l') || originalName.includes('左');
                        const isR = isRight || name.startsWith('rglute') || name.startsWith('r_') || name.includes('.r') || originalName.includes('右');

                        const isMaster = name.includes('master') || name.includes('glute');

                        if (isL) {
                            if (isMaster || !leftButtRef.current) leftButtRef.current = child as any;
                        } else if (isR) {
                            if (isMaster || !rightButtRef.current) rightButtRef.current = child as any;
                        }
                    }

                    // Mandíbula para LipSync
                    if (!jawBoneRef.current) {
                        const isJawBone = (
                            name === 'def-jaw' ||
                            name === 'jaw' ||
                            name === 'cc_base_jaw' ||
                            name.includes('mandible') ||
                            (name.includes('jaw') && !name.includes('jawl') && !name.includes('jawr') && !name.includes('jaw.l') && !name.includes('jaw.r'))
                        );
                        if (isJawBone) {
                            jawBoneRef.current = child as any;
                            jawOriginalRotation.current = child.rotation.clone();
                            if (SHOW_VERBOSE_LOGS) console.log('🦷 Hueso de mandíbula encontrado:', child.name);
                        }
                    }

                    // --- PIERNAS Y BOTAS (FIX FLOTANTES Y MOVIMIENTO) ---
                    if ((child as any).isBone) {
                        const isRightSide = isRight || originalName.includes('右') || originalName.includes('.R') || originalName.includes('.r');
                        const isLeftSide = isLeft || originalName.includes('左') || originalName.includes('.L') || originalName.includes('.l');
                        const isMmdThigh = (originalName === '左足' || originalName === '右足' || originalName === '足.L' || originalName === '足.R' || originalName === '足D.L' || originalName === '足D.R');
                        const isThigh = isMmdThigh || (!name.includes('ik') && !originalName.includes('IK') && !originalName.includes('ＩＫ') && (name.includes('thigh') || name.includes('upleg') || name.includes('upper_leg') || name.includes('upperleg')));
                        
                        if (isThigh) {
                            const isDef = name.startsWith('def-');
                            if (isRightSide && (isDef || !rightLegRef.current)) rightLegRef.current = child as any;
                            if (isLeftSide && (isDef || !leftLegRef.current)) leftLegRef.current = child as any;
                        }

                        if (name === 'mixamorigleftfoot' || name === 'def-foot.l' || name === 'j_bip_l_foot' || name === 'l_foot' || originalName === '左足首') {
                            if (!leftFootRef.current || name === 'def-foot.l' || originalName === '左足首') leftFootRef.current = child as any;
                        }
                        if (name === 'mixamorigrightfoot' || name === 'def-foot.r' || name === 'j_bip_r_foot' || name === 'r_foot' || originalName === '右足首') {
                            if (!rightFootRef.current || name === 'def-foot.r' || originalName === '右足首') rightFootRef.current = child as any;
                        }
                    }
                    if ((child as any).isMesh && (name.toLowerCase().includes('bots2') || name.toLowerCase().includes('boots2') || name === 'bots2 2')) {
                        if (!bootsMeshRef.current) bootsMeshRef.current = child as any;
                    }

                    // Huesos de labios (Mejorado para soportar Rigify con y sin prefijo 'def-')
                    // CRÍTICO: Excluir MCH y ORG porque en glTF no deforman la malla, solo los DEF lo hacen
                    if (name.includes('lip') && !name.includes('mch-') && !name.includes('mch_') && !name.includes('org-') && !name.includes('org_')) {
                        const isTop = name.includes('lip.t') || name.includes('lipt') || name.includes('upperlip') || name.includes('upper_lip');
                        const isBottom = name.includes('lip.b') || name.includes('lipb') || name.includes('lowerlip') || name.includes('lower_lip');
                        const isLeft = name.includes('.l') || name.includes('_l');
                        const isRight = name.includes('.r') || name.includes('_r');
                        const isOuter = name.includes('001') || name.includes('01') || name.includes('corner');

                        if (isTop && !isOuter) {
                            if (isLeft || (!isLeft && !isRight)) {
                                if (!lipTopBoneRef.current) {
                                    lipTopBoneRef.current = child as any;
                                    lipTopOriginalPos.current = child.position.clone();
                                }
                            }
                            if (isRight || (!isLeft && !isRight)) {
                                if (!lipTopRightRef.current) {
                                    lipTopRightRef.current = child as any;
                                    lipTopRightOriginalPos.current = child.position.clone();
                                }
                            }
                        }
                        if (isBottom && !isOuter) {
                            if (isLeft || (!isLeft && !isRight)) {
                                if (!lipBottomBoneRef.current) {
                                    lipBottomBoneRef.current = child as any;
                                    lipBottomOriginalPos.current = child.position.clone();
                                }
                            }
                            if (isRight || (!isLeft && !isRight)) {
                                if (!lipBottomRightRef.current) {
                                    lipBottomRightRef.current = child as any;
                                    lipBottomRightOriginalPos.current = child.position.clone();
                                }
                            }
                        }
                        // Huesos externos (comisuras de los labios)
                        else if (isTop && isLeft && isOuter && !lipTopOuterRef.current) {
                            lipTopOuterRef.current = child as any;
                            lipTopOuterOriginalPos.current = child.position.clone();
                        }
                        else if (isTop && isRight && isOuter && !lipTopRightOuterRef.current) {
                            lipTopRightOuterRef.current = child as any;
                            lipTopRightOuterOriginalPos.current = child.position.clone();
                        }
                        else if (isBottom && isLeft && isOuter && !lipBottomOuterRef.current) {
                            lipBottomOuterRef.current = child as any;
                            lipBottomOuterOriginalPos.current = child.position.clone();
                        }
                        else if (isBottom && isRight && isOuter && !lipBottomRightOuterRef.current) {
                            lipBottomRightOuterRef.current = child as any;
                            lipBottomRightOuterOriginalPos.current = child.position.clone();
                        }
                    }

                    // Brazos (Upper Arm)
                    const isUpperArmMmd = originalName === '左腕' || originalName === '右腕';
                    const isUpperArm = isUpperArmMmd || name.includes('upper_arm') || (name.includes('arm') && !name.includes('fore') && !name.includes('hand') && !name.includes('shoulder'));
                    if (isUpperArm) {
                        const isDef = name.startsWith('def-');
                        if (isRight || originalName === '右腕') {
                            if (isDef || !rightArmRef.current) {
                                rightArmRef.current = child as any;
                                rightArmOriginalRot.current = child.rotation.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('💪 Brazo DERECHO asignado:', child.name);
                            }
                        }
                        if (isLeft || originalName === '左腕') {
                            if (isDef || !leftArmRef.current) {
                                leftArmRef.current = child as any;
                                leftArmOriginalRot.current = child.rotation.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('💪 Brazo IZQUIERDO asignado:', child.name);
                            }
                        }
                    }

                    // Antebrazos
                    const isForeArmMmd = originalName.includes('ひじ') || originalName.includes('肘');
                    const isForeArm = isForeArmMmd || name.includes('forearm') || name.includes('fore_arm') || name.includes('lowerarm') || name.includes('lower_arm') || name.includes('elbow');
                    if (isForeArm) {
                        const isDef = name.startsWith('def-');
                        if ((isRight || originalName.includes('右')) && (isDef || !rightForeArmRef.current)) rightForeArmRef.current = child as any;
                        if ((isLeft || originalName.includes('左')) && (isDef || !leftForeArmRef.current)) leftForeArmRef.current = child as any;
                    }

                    // Manos
                    const isHandMmd = originalName === '左手首' || originalName === '右手首' || originalName === '左手' || originalName === '右手';
                    const isHand = isHandMmd || ((name.includes('hand') || name.includes('wrist') || name.includes('muñeca')) && !name.includes('finger') && !name.includes('thumb'));
                    if (isHand) {
                        const isDef = name.startsWith('def-');
                        if ((isRight || originalName.includes('右')) && (isDef || !rightHandRef.current)) rightHandRef.current = child as any;
                        if ((isLeft || originalName.includes('左')) && (isDef || !leftHandRef.current)) leftHandRef.current = child as any;
                    }

                    // --- FINGERS: Capturar TODOS los segmentos (proximal, medio, distal) ---
                    const isFingerBone = (
                        name.includes('f_index') || name.includes('f_middle') ||
                        name.includes('f_ring') || name.includes('f_pinky') || name.includes('thumb') ||
                        /def-f_\w+\.\d+/.test(name)
                    );
                    if (isFingerBone) {
                        // Detectar qué dedo es por nombre
                        const isThumb = name.includes('thumb');
                        const fingerN = isThumb ? 'thumb'
                            : name.includes('index') ? 'index'
                                : name.includes('middle') ? 'middle'
                                    : name.includes('ring') ? 'ring'
                                        : name.includes('pinky') ? 'pinky'
                                            : 'unknown';

                        // Segmento: .01 = proximal, .02 = medio, .03 = distal
                        const segMatch = name.match(/\.(0[1-3])(?:\.[lr])?$/);
                        const segment = segMatch ? parseInt(segMatch[1]) : 1;

                        // Solo segmentos 1-3 (no palm ni bones sin índice)
                        if (segment >= 1 && segment <= 3 && fingerN !== 'unknown') {
                            if (isLeft) fingerBonesRef.current.left.push({
                                bone: child as any,
                                segment,
                                isThumb,
                                fingerName: fingerN
                            });
                            else if (isRight) fingerBonesRef.current.right.push({
                                bone: child as any,
                                segment,
                                isThumb,
                                fingerName: fingerN
                            });
                        }
                    }

                    // Piernas (thigh/upleg) - Excluir twist, .001, ik, mch, org, toe, pole
                    const isLegHelper = name.includes('.0') || name.includes('twist') || name.includes('ik') || name.includes('mch') || name.includes('org') || name.includes('toe') || name.includes('pole') || originalName.includes('IK') || originalName.includes('ＩＫ');
                    const isMmdThigh2 = (originalName === '左足' || originalName === '右足' || originalName === '足.L' || originalName === '足.R' || originalName === '足D.L' || originalName === '足D.R');
                    const isLeg = isMmdThigh2 || (!isLegHelper && (name.includes('thigh') || name.includes('upleg') || name.includes('upper_leg') || name.includes('upperleg')));
                    if (isLeg) {
                        const isDef = name.startsWith('def-');
                        const isDBone = originalName.includes('D') || originalName.includes('Ｄ');
                        if (isRight || originalName.includes('右')) {
                            if ((isDef && !rightLegRef.current?.name.toLowerCase().startsWith('def-')) || isDBone || !rightLegRef.current) {
                                rightLegRef.current = child as any;
                                rightLegOriginalRot.current = child.rotation.clone();
                                rightLegOriginalPos.current = child.position.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('🦵 Pierna DERECHA asignada:', child.name);
                            }
                        }
                        if (isLeft || originalName.includes('左')) {
                            if ((isDef && !leftLegRef.current?.name.toLowerCase().startsWith('def-')) || isDBone || !leftLegRef.current) {
                                leftLegRef.current = child as any;
                                leftLegOriginalRot.current = child.rotation.clone();
                                leftLegOriginalPos.current = child.position.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('🦵 Pierna IZQUIERDA asignada:', child.name);
                            }
                        }
                    }

                    // Espinilla/Tibia (shin/calf) — para flexión de rodilla
                    const isShinHelper = name.includes('.0') || name.includes('twist') || name.includes('ik') || name.includes('mch') || name.includes('org') || name.includes('toe') || name.includes('pole') || originalName.includes('IK') || originalName.includes('ＩＫ');
                    const isMmdShin = originalName.includes('ひざ') || originalName.includes('膝');
                    const isShinBone = isMmdShin || (!isShinHelper && (name.includes('shin') || name.includes('calf') || name.includes('lower_leg') || name.includes('lowerleg') || name.includes('knee')));
                    if (isShinBone) {
                        const isDef = name.startsWith('def-');
                        const isDBone = originalName.includes('D') || originalName.includes('Ｄ');
                        if (isRight || originalName.includes('右')) {
                            if ((isDef && !rightShineRef.current?.name.toLowerCase().startsWith('def-')) || isDBone || !rightShineRef.current) {
                                rightShineRef.current = child as any;
                                rightShineOriginalRot.current = child.rotation.clone();
                            }
                        }
                        if (isLeft || originalName.includes('左')) {
                            if ((isDef && !leftShineRef.current?.name.toLowerCase().startsWith('def-')) || isDBone || !leftShineRef.current) {
                                leftShineRef.current = child as any;
                                leftShineOriginalRot.current = child.rotation.clone();
                            }
                        }
                    }

                    // Pies (foot/ankle) — Excluir toe, twist, .001, ik, mch, org, extra
                    const isFootHelper = name.includes('.0') || name.includes('twist') || name.includes('ik') || name.includes('mch') || name.includes('org') || name.includes('toe') || name.includes('pole') || name.includes('extra') || originalName.includes('IK') || originalName.includes('ＩＫ');
                    const isMmdFoot = originalName.includes('足首');
                    const isFoot = isMmdFoot || (!isFootHelper && (name.includes('foot') || name.includes('ankle') || name.includes('pie')));
                    if (isFoot) {
                        const isDef = name.startsWith('def-');
                        const isDBone = originalName.includes('D') || originalName.includes('Ｄ');
                        const isExactL = name === 'def-foot.l' || name === 'mixamorigleftfoot' || originalName === '左足首';
                        const isExactR = name === 'def-foot.r' || name === 'mixamorigrightfoot' || originalName === '右足首';
                        if (isRight || originalName.includes('右')) {
                            if (isExactR || (isDef && !rightFootRef.current?.name.toLowerCase().startsWith('def-')) || isDBone || !rightFootRef.current) {
                                rightFootRef.current = child as any;
                            }
                        }
                        if (isLeft || originalName.includes('左')) {
                            if (isExactL || (isDef && !leftFootRef.current?.name.toLowerCase().startsWith('def-')) || isDBone || !leftFootRef.current) {
                                leftFootRef.current = child as any;
                            }
                        }
                    }
                }
            });

            setMorphTargetMeshes(meshes);
            setVisemeMap(newVisemeMap);

            // DEBUG: Resumen de detección para este modelo
            const allBones: string[] = [];
            modelRef.current.traverse((c: any) => { if (c.isBone) allBones.push(c.name); });
            (window as any).__modelBoneNames = allBones;

            // Inicializar o re-vincular el Leg IK Controller para animaciones de baile VMD
            if (!legIkControllerRef.current) {
                legIkControllerRef.current = new MmdLegIkController();
            }
            legIkControllerRef.current.bindBones({
                hips: hipsRef.current,
                thighL: leftLegRef.current,
                shinL: leftShineRef.current,
                footL: leftFootRef.current,
                thighR: rightLegRef.current,
                shinR: rightShineRef.current,
                footR: rightFootRef.current
            });
            
            // LEG BINDING log silenciado - huesos vinculados correctamente

            // === INICIALIZAR NUEVOS SISTEMAS AVANZADOS ===

            // 1. Animation Manager - Gestiona animaciones de Blender
            const isGrokAni = allBones.some(name => {
                const ln = name.toLowerCase();
                return ln.includes('grokani') ||
                    ln.includes('breast_master') ||
                    ln.includes('jaw_master') ||
                    ln.includes('org-breast') ||
                    ln.includes('def-breast');
            });
            isGrokAniRef.current = isGrokAni && !isPMX;
            // Inicializar LipSync (DESPUÉS de isGrokAni para pasar opciones específicas)
            if (!lipSyncRef.current) lipSyncRef.current = new LipSyncAnalyzer();
            lipSyncRef.current.initialize(modelRef.current, {
                disableBones: false, // ¡DEJAMOS QUE UNIVERSAL LIP SYNC TOME EL CONTROL TOTAL!
                restingTopLipOffsetY: isGrokAni ? -0.0012 : 0, // Corregir mueca nativa
                jawMovementScale: isGrokAni ? 0.8 : 1.0      // Multiplicador original (2.5 -> 1.2) para que la mandíbula se note
            });

            if (modelData.animations && modelData.animations.length > 0) {
                // FILTRAR tracks de brazos/manos de las animaciones para que el sistema procedural los controle
                const filteredAnims = modelData.animations.map(clip => {
                    const filtered = clip.clone();
                    filtered.tracks = clip.tracks.filter(track => {
                        const tn = track.name.toLowerCase();

                        // CRÍTICO: Filtrar tracks que animen root, armature o torso
                        // Estos tracks contienen la rotación de -90° X de Blender y tumban al avatar de espaldas
                        if (tn.startsWith('root.') || tn.startsWith('armature.') || tn.startsWith('torso.') ||
                            tn.includes('root.quaternion') || tn.includes('armature.quaternion') || tn.includes('torso.quaternion') ||
                            tn.includes('root.position') || tn.includes('armature.position') || tn.includes('torso.position')) {
                            return false;
                        }

                        if (isGrokAni) {
                            return true;
                        } else {
                            // Para otros modelos, no removemos piernas ni caderas, solo los tracks de brazos
                            const isArmTrack = (
                                tn.includes('arm') || tn.includes('hand') || tn.includes('shoulder') ||
                                tn.includes('wrist') || tn.includes('finger') || tn.includes('thumb') ||
                                tn.includes('clavicle')
                            );
                            return !isArmTrack;
                        }
                    });
                    return filtered;
                });

                const animManager = new AnimationManager(modelRef.current, filteredAnims);
                animationManagerRef.current = animManager;

                // Play Idle immediately with NO blend duration so it snaps instantly
                // This ensures baseQuat captures the 100% standing pose on frame 5!
                animManager.play('Idle', { blendDuration: 0 });
                console.log(`🎬 AnimationManager: ${filteredAnims.length} clips cargados y jugando Idle`);
            } else {
                console.warn('⚠️ No hay animaciones en el modelo - AnimationManager no inicializado');
            }

            // EXTREME FALLBACK: La mandíbula (jaw) SIEMPRE es hija directa de la cabeza real.
            // Si encontramos la mandíbula, su padre es indiscutiblemente el hueso real de la cabeza (cráneo).
            if (jawBoneRef.current && jawBoneRef.current.parent) {
                const trueHead = jawBoneRef.current.parent;
                headBoneRef.current = trueHead as any;
                if (SHOW_VERBOSE_LOGS) console.log('🎯 Hueso de cabeza deducido desde el padre de la mandíbula:', trueHead.name);
            } else if (morphMeshesRef.current.length > 0 && !headBoneRef.current) {
                // Si no hay mandíbula ni cabeza detectada, buscar en la malla de lipsync
                const faceSm = morphMeshesRef.current[0] as THREE.SkinnedMesh;
                if (faceSm.skeleton && faceSm.skeleton.bones) {
                    const faceBones = faceSm.skeleton.bones;
                    // Buscar estrictamente "head", ignorar "face" para no agarrar huesos faciales parciales que derriten la cara
                    const realHeadBone = faceBones.find(b => {
                        const bn = b.name.toLowerCase();
                        return bn.includes('head') && !bn.includes('hair') && !bn.includes('top');
                    });

                    if (realHeadBone) {
                        headBoneRef.current = realHeadBone as any;
                        if (SHOW_VERBOSE_LOGS) console.log('🎯 Hueso de cabeza extraído directamente de la malla de lipsync:', realHeadBone.name);
                    }
                }
            }

            // 2. IK Controller - Head & Eye tracking + Arm IK (Sistema Nervioso)
            ikControllerRef.current = new IKController();
            ikControllerRef.current.initialize(modelRef.current);
            // PASO CRÍTICO: Sobrescribir el hueso de la cabeza que encontró el IKController con el que nosotros validamos usando validSkinBones
            // Esto asegura que la cara (malla) y el cabello (física) se muevan simultáneamente si están separados.
            if (headBoneRef.current) {
                ikControllerRef.current.setExplicitHeadBone(headBoneRef.current);
            }

            // --- RIGIFY SPLIT HIERARCHY FIX ---
            // 1. Sincronizar huesos de control principales (cráneo, controladores paralelos)
            const rigifyHeadBones = modelRef.current.getObjectsByProperty('isBone', true).filter(b => {
                const n = b.name.toLowerCase();
                const isExactHead = n === 'head' || n === 'def-head' || n === 'org-head' || n === 'j_bip_c_head' || n === 'mixamorighead';
                return isExactHead;
            }) as THREE.Bone[];

            if (headBoneRef.current) {
                headOriginalQuat.current.copy(headBoneRef.current.quaternion);
                headOriginalPos.current.copy(headBoneRef.current.position);
            }

            if (rigifyHeadBones.length > 0) {
                ikControllerRef.current.setSyncHeadBones(rigifyHeadBones);
                if (SHOW_VERBOSE_LOGS) console.log(`🔗 Huesos de cabeza sincronizados (IK):`, rigifyHeadBones.map(b => b.name).join(', '));
            }

            // 2. Cirugía ortopédica para reconectar la cara y el pelo al cráneo (Arreglo EXCLUSIVO para jerarquías aplastadas de Blender/Rigify glTF)
            // En modelos PMX / MMD nativos, la jerarquía ya es correcta y anclar huesos al cráneo deformaría pechos (おっぱい) y hombros (肩P)
            if (headBoneRef.current && !isPMX) {
                const headBone = headBoneRef.current;

                const isDescendant = (child: THREE.Bone, parent: THREE.Bone) => {
                    let current = child.parent;
                    while (current) {
                        if (current === parent) return true;
                        current = current.parent;
                    }
                    return false;
                };

                const isAncestor = (bone: THREE.Bone, descendant: THREE.Bone) => {
                    let current = descendant.parent;
                    while (current) {
                        if (current === bone) return true;
                        current = current.parent;
                    }
                    return false;
                };

                headBone.updateWorldMatrix(true, false);
                const headWPosBase = new THREE.Vector3();
                headBone.getWorldPosition(headWPosBase);

                const safeOrphans = modelRef.current.getObjectsByProperty('isBone', true).filter(b => {
                    if (b === headBone) return false;
                    if (isDescendant(b as THREE.Bone, headBone)) return false;
                    if (isAncestor(b as THREE.Bone, headBone)) return false;

                    b.updateWorldMatrix(true, false);
                    const bWPos = new THREE.Vector3();
                    b.getWorldPosition(bWPos);

                    const distance = bWPos.distanceTo(headWPosBase);

                    const n = b.name.toLowerCase();

                    // CRÍTICO: Excluir todo lo que esté a más de 0.7 metros de la cabeza.
                    if (distance > 0.7) return false;

                    // EXCLUSIÓN ESPECÍFICA: No anclar a la cabeza accesorios del cuello/pecho/pelvis
                    if (n.includes('spine.006') || n.includes('garter') || n.includes('thigh') || n.includes('leg') || n.includes('panties') ||
                        n.includes('collar') || n.includes('choker') || n.includes('necklace') || n.includes('cuello') || n.includes('tie') || n.includes('cape')) {
                        return false;
                    }

                    // Excluir terminantemente hombros, brazos, pechos, alas y torso (tanto en inglés como en japonés)
                    if (n.includes('shoulder') || n.includes('arm') || n.includes('hand') ||
                        n.includes('finger') || n.includes('breast') || n.includes('chest') ||
                        n.includes('clavicle') || n.includes('wing') || n.includes('spine') ||
                        n.includes('torso') || n.includes('hip') || n.includes('pelvis') ||
                        b.name.includes('おっぱい') || b.name.includes('胸') || b.name.includes('乳') ||
                        b.name.includes('肩') || b.name.includes('腕') || b.name.includes('手') ||
                        b.name.includes('指') || b.name.includes('鎖骨') || b.name.includes('翼') ||
                        b.name.includes('Wing') || b.name.includes('Piao')) {
                        return false;
                    }

                    // Solo anclar huesos que inequívocamente pertenezcan al cabello o rostro
                    return n.includes('hair') || n.includes('bang') || n.includes('ponytail') ||
                           n.includes('pigtail') || n.includes('ahoge') || b.name.includes('髪') ||
                           b.name.includes('毛') || n.includes('face') || n.includes('eye');
                }) as THREE.Bone[];

                if (safeOrphans.length > 0) {
                    // CRÍTICO: Solo anclar los huesos RAÍZ de cada cadena de cabello.
                    // Los huesos hijos (.001-.004) siguen a su padre automáticamente
                    // por la jerarquía de Three.js. Anclarlos todos causaría conflictos.
                    const safeOrphanSet = new Set(safeOrphans.map(b => b.uuid));
                    const rootOrphans = safeOrphans.filter(b => !b.parent || !safeOrphanSet.has(b.parent.uuid));

                    console.log(`🔗 ANCLANDO ${rootOrphans.length} raíces al cráneo (de ${safeOrphans.length} candidatos):`,
                        rootOrphans.map(b => b.name).join(', '));

                    // Aseguramos matrices actualizadas antes de calcular el offset
                    headBone.updateWorldMatrix(true, true);

                    const headWPos = new THREE.Vector3();
                    const headWQuat = new THREE.Quaternion();
                    headBone.getWorldPosition(headWPos);
                    headBone.getWorldQuaternion(headWQuat);
                    const headWQuatInv = headWQuat.clone().invert();

                    headOrphansRef.current = rootOrphans.map(bone => {
                        bone.updateWorldMatrix(true, false);

                        const boneWPos = new THREE.Vector3();
                        const boneWQuat = new THREE.Quaternion();
                        bone.getWorldPosition(boneWPos);
                        bone.getWorldQuaternion(boneWQuat);

                        // Offset en espacio local del headBone:
                        const offsetPos = boneWPos.clone().sub(headWPos).applyQuaternion(headWQuatInv);
                        const offsetQuat = headWQuatInv.clone().multiply(boneWQuat);

                        return {
                            bone,
                            offsetPos,
                            offsetQuat,
                            originalPos: bone.position.clone(),
                            originalQuat: bone.quaternion.clone()
                        };
                    });

                    // BUGFIX: Registrar los mismos huérfanos en el IKController como syncHeadBones.
                    // Esto asegura que cuando el IK rota la cabeza principal, los huesos de
                    // pelo/ojos reciben la misma rotación sin desprenderse.
                    if (ikControllerRef.current) {
                        const hairOrphansForIK = rootOrphans.filter(b => {
                            const n = b.name.toLowerCase();
                            return n.includes('hair') || n.includes('ponytail') || n.includes('twin') ||
                                n.includes('bangs') || n.includes('braid') ||
                                n.includes('pigtail') || n.includes('ahoge') || n.includes('fringe') ||
                                n.includes('pelo') || n.includes('cabello') || n.includes('mechon') ||
                                n.includes('front') || n.includes('top_hair');
                        });
                        if (hairOrphansForIK.length > 0) {
                            ikControllerRef.current.setSyncHeadBones(hairOrphansForIK);
                            console.log(`🔗 IK: ${hairOrphansForIK.length} huesos de cabello registrados como syncHeadBones`);
                        }
                    }
                }
            } else if (isPMX) {
                headOrphansRef.current = [];
            }

            // --- GLOBAL DUAL-ARMATURE SYNC (Fix for Vroid/Rigify mesh tearing) ---
            const allBonesInModel = modelRef.current.getObjectsByProperty('isBone', true) as THREE.Bone[];

            const primaryBones: THREE.Bone[] = [];
            const duplicatePrimaryBones: THREE.Bone[] = [];
            const primaryNames = new Set<string>();

            allBonesInModel.forEach(b => {
                const n = b.name.toLowerCase();
                if (n.includes('mixamorig') || n.includes('j_bip') || n.startsWith('def-') || n.startsWith('org-') || n === 'root' || n === 'hips') {
                    if (primaryNames.has(n)) {
                        duplicatePrimaryBones.push(b);
                    } else {
                        primaryNames.add(n);
                        primaryBones.push(b);
                    }
                }
            });

            const secondaryBones = allBonesInModel.filter(b => {
                const n = b.name.toLowerCase();
                // Exclude facial morph bones or pure hair chains to not mess up IK
                if (n.includes('lip') || n.includes('hair') || n.includes('jaw') || n.includes('mouth')) return false;

                // EXCLUIR HUESOS ESTRUCTURALES DE COLUMNA/CUELLO:
                // Sincronizar huesos de columna en cadena (spine -> spine.001 -> spine.002) duplica secuencialmente la rotación,
                // provocando que la espina se incline salvajemente hacia adelante.
                if (n.includes('spine') || n.includes('torso') || n.includes('chest') || n.includes('neck') || n.includes('head')) return false;

                // Si es un hueso primario, solo sincronizar si es un duplicado o un hueso secundario real (ej: botas/accesorios)
                if (n.includes('mixamorig') || n.includes('j_bip') || n === 'root' || n === 'hips') {
                    return duplicatePrimaryBones.includes(b);
                }

                // EXCLUIR los huesos de deformación estructural principal (DEF-thigh, DEF-shin, DEF-foot, etc) para no romper la cinemática de las piernas
                if (n.startsWith('def-') || n.startsWith('org-')) {
                    const isAccessory = n.includes('boot') || n.includes('shoe') || n.includes('dress') || n.includes('skirt') || n.includes('cloth') || n.includes('garter');
                    if (!isAccessory) return false;
                }

                // EXCLUIR ÚNICAMENTE LOS HUESOS SENSORES DE INTERACCIÓN (que el usuario arrastra con el ratón)
                if (n.includes('ass') || n.includes('glute') || n.includes('breast') || n.includes('belly')) return false;

                // Sincronizar todos los huesos (brazos, piernas, columna, pelvis) para que los accesorios (boots2, cinturones) 
                // no se queden flotando. Al usar Position-Only sync, no hay riesgo de rotaciones rotas.
                if (n === 'root') return false;

                // FIX CRÍTICO: Prevenir "Feedback Loops" infinitos que hacen volar al personaje
                // Si este hueso secundario contiene un hueso primario como hijo, NO sincronizarlo.
                let hasPrimaryDescendant = false;
                b.traverse(child => {
                    if (child === b) return; // omit self
                    const cn = child.name.toLowerCase();
                    if (cn.includes('mixamorig') || cn.includes('j_bip') || cn.startsWith('def-') || cn === 'hips' || cn === 'pelvis') {
                        hasPrimaryDescendant = true;
                    }
                });

                if (hasPrimaryDescendant) {
                    // console.warn(`⚠️ OMITIENDO SYNC para ${b.name} porque contiene un hueso primario como hijo (evita salir volando).`);
                    return false;
                }

                return true;
            });

            armatureSyncMapRef.current = [];

            if (duplicatePrimaryBones.length > 0 && primaryBones.length > 0 && secondaryBones.length > 0) {
                modelRef.current.updateMatrixWorld(true);

                const getDepth = (obj: THREE.Object3D) => {
                    let d = 0;
                    let p = obj.parent;
                    while (p) { d++; p = p.parent; }
                    return d;
                };

                secondaryBones.forEach(sec => {
                    sec.updateWorldMatrix(true, false);
                    const secPos = new THREE.Vector3();
                    sec.getWorldPosition(secPos);
                    const secQuat = new THREE.Quaternion();
                    sec.getWorldQuaternion(secQuat);

                    let closestPrim: THREE.Bone | null = null;
                    let minScore = Infinity;
                    let bestPrimWPos = new THREE.Vector3();
                    let bestPrimWQuat = new THREE.Quaternion();
                    const sName = sec.name.toLowerCase();

                    const getSide = (n: string): 'L' | 'R' | 'N' => {
                        if (n.includes('left') || n.includes('_l_') || n.includes('_l.') || n.endsWith('.l') || n.endsWith('_l') || n.includes('.l.')) return 'L';
                        if (n.includes('right') || n.includes('_r_') || n.includes('_r.') || n.endsWith('.r') || n.endsWith('_r') || n.includes('.r.')) return 'R';
                        return 'N';
                    };
                    const secSide = getSide(sName);

                    primaryBones.forEach(prim => {
                        prim.updateWorldMatrix(true, false);
                        const primPos = new THREE.Vector3();
                        prim.getWorldPosition(primPos);
                        const primQuat = new THREE.Quaternion();
                        prim.getWorldQuaternion(primQuat);
                        const dst = secPos.distanceTo(primPos);
                        let penalty = 0;
                        const pName = prim.name.toLowerCase();

                        // IMPEDIR CRUCE DE LADOS (Evita que accesorios/huesos de pierna izquierda se enganchen a la derecha)
                        const primSide = getSide(pName);
                        if (secSide !== 'N' && primSide !== 'N' && secSide !== primSide) {
                            penalty += 1000.0;
                        }

                        // Si los nombres son EXACTAMENTE iguales (ej. un hueso de bota mixamorigLeftFoot buscando el del cuerpo)
                        // Le damos una prioridad absoluta (penalidad muy negativa) para que se emparejen sí o sí.
                        if (sName === pName) {
                            penalty -= 100.0;
                        }

                        // Heurísticas de nombres para emparejar huesos desplazados (espaldas rotas en Rigify, accesorios, botas, ojos)
                        if (sName.includes('spine') && pName.includes('spine')) penalty -= 5.0;
                        if (sName.includes('pelvis') && (pName.includes('hips') || pName.includes('pelvis'))) penalty -= 5.0;
                        if (sName.includes('neck') && pName.includes('neck')) penalty -= 5.0;
                        if (sName.includes('head') && pName.includes('head')) penalty -= 5.0;
                        if (sName.includes('chest') && (pName.includes('spine') || pName.includes('chest'))) penalty -= 5.0;
                        if (sName.includes('breast') && pName.includes('breast')) penalty -= 5.0;
                        if (sName.includes('shoulder') && pName.includes('shoulder')) penalty -= 5.0;

                        // 🥾 BOTAS Y CALZADO (boots2 / boots / shoes / feet)
                        if ((sName.includes('boot') || sName.includes('boots') || sName.includes('shoe') || sName.includes('foot') || sName.includes('toe') || sName.includes('leg')) &&
                            (pName.includes('foot') || pName.includes('toe') || pName.includes('leg') || pName.includes('shin') || pName.includes('ankle') || pName.includes('calf'))) {
                            penalty -= 50.0; // Prioridad máxima para fijar boots2
                        }

                        // 👁️ BRILLO DE OJOS Y PUPILAS (eye shine / highlights / iris / pupil)
                        if ((sName.includes('eye') || sName.includes('shine') || sName.includes('highlight') || sName.includes('pupil') || sName.includes('iris') || sName.includes('brillo')) &&
                            (pName.includes('head') || pName.includes('eye'))) {
                            penalty -= 30.0;
                        }

                        // 🎗️ ACCESORIO DEL CUELLO (collar / choker / necklace / cuello / ribbon / tie / cape / hombrera)
                        if (sName.includes('collar') || sName.includes('choker') || sName.includes('necklace') || sName.includes('cuello') || sName.includes('ribbon') || sName.includes('tie') || sName.includes('cape')) {
                            if (pName.includes('neck') || pName.includes('chest') || pName.includes('spine')) {
                                penalty -= 80.0; // Pegar firmemente al cuello/pecho
                            } else if (pName.includes('head')) {
                                penalty += 100.0; // Impedir estrictamente que se pegue a la cabeza
                            }
                        }

                        // Evitar que el estómago se conecte a las piernas
                        if ((sName.includes('spine') || sName.includes('pelvis')) && (pName.includes('leg') || pName.includes('arm'))) penalty += 10.0;

                        const score = dst + penalty;

                        if (score < minScore) {
                            minScore = score;
                            closestPrim = prim;
                            bestPrimWPos.copy(primPos);
                            bestPrimWQuat.copy(primQuat);
                        }
                    });

                    // Aceptamos si la distancia es menor a 80cm o si el score es negativo (heurística de nombre exitosa)
                    if (closestPrim && (minScore < 0.80 || minScore < 0)) {
                        const primWQuatInv = bestPrimWQuat.clone().invert();
                        // Solo resetear offset a (0,0,0) si es un duplicado exacto por nombre (penalidad -100)
                        const isExactDuplicate = minScore <= -95;

                        // Si es un duplicado exacto por nombre, usamos offset cero. De lo contrario, preservamos la distancia real entre huesos.
                        const offsetPos = isExactDuplicate ? new THREE.Vector3(0, 0, 0) : secPos.clone().sub(bestPrimWPos).applyQuaternion(primWQuatInv);
                        const offsetQuat = isExactDuplicate ? new THREE.Quaternion() : primWQuatInv.clone().multiply(secQuat);

                        armatureSyncMapRef.current.push({
                            secondary: sec,
                            primary: closestPrim,
                            offsetPos,
                            offsetQuat
                        });
                    }
                });

                // ORDENAR POR PROFUNDIDAD: Procesamos los padres antes que los hijos para evitar romper la cinemática directa (FK).
                armatureSyncMapRef.current.sort((a, b) => getDepth(a.secondary) - getDepth(b.secondary));
                console.log(`🔗 GLOBAL ARMATURE SYNC: Emparejados ${armatureSyncMapRef.current.length} huesos secundarios.`);
            }

            // 2.5 Jiggle Physics - Ropa, Cabello, Pechos, Trasero
            jigglePhysicsRef.current = new JigglePhysicsSystem();
            jigglePhysicsRef.current.initialize(modelRef.current);

            // Forzar registro manual de pechos para asegurar rebote elástico firme (PMX y modelos genéricos)
            // Firme y turgente: rebote elástico contenido que NUNCA traspasa el sujetador ni la ropa
            if (leftBreastRef.current) {
                jigglePhysicsRef.current.addBone(leftBreastRef.current, { 
                    stiffness: 0.60, 
                    damping: 0.90, 
                    gravity: 0.0005, 
                    intensity: isPMX ? 0.15 : 0.85, 
                    maxAngle: isPMX ? (Math.PI / 40) : (Math.PI / 22) 
                });
            }
            if (rightBreastRef.current) {
                jigglePhysicsRef.current.addBone(rightBreastRef.current, { 
                    stiffness: 0.60, 
                    damping: 0.90, 
                    gravity: 0.0005, 
                    intensity: isPMX ? 0.15 : 0.85, 
                    maxAngle: isPMX ? (Math.PI / 40) : (Math.PI / 22) 
                });
            }

            // Forzar registro manual de glúteos para asegurar rebote elástico y firme
            // Firme y redondeado: evita que cuelgue hacia abajo o se hunda con el movimiento de piernas
            if (leftButtRef.current && !leftButtRef.current.name.toLowerCase().includes('pelvis')) {
                jigglePhysicsRef.current.addBone(leftButtRef.current, { 
                    stiffness: 0.35, 
                    damping: 0.78, 
                    gravity: 0.002, 
                    intensity: isPMX ? 0.30 : 1.05, 
                    maxAngle: isPMX ? (Math.PI / 18) : (Math.PI / 9) 
                });
            }
            if (rightButtRef.current && !rightButtRef.current.name.toLowerCase().includes('pelvis')) {
                jigglePhysicsRef.current.addBone(rightButtRef.current, { 
                    stiffness: 0.35, 
                    damping: 0.78, 
                    gravity: 0.002, 
                    intensity: isPMX ? 0.30 : 1.05, 
                    maxAngle: isPMX ? (Math.PI / 18) : (Math.PI / 9) 
                });
            }

            // 2.6 Dynamic Body Colliders (Anti-clipping, contorno de ropa sobre piernas, agarre y colisión de cráneo con pelo)
            jigglePhysicsRef.current.setupBodyColliders({
                head: headBoneRef.current,
                spine: spineRef.current,
                hips: hipsRef.current,
                leftLeg: leftLegRef.current,
                rightLeg: rightLegRef.current,
                leftKnee: leftShineRef.current,
                rightKnee: rightShineRef.current,
                leftFoot: leftFootRef.current,
                rightFoot: rightFootRef.current,
                leftHand: leftHandRef.current,
                rightHand: rightHandRef.current,
                leftForeArm: leftForeArmRef.current,
                rightForeArm: rightForeArmRef.current,
                leftBreast: leftBreastRef.current,
                rightBreast: rightBreastRef.current,
            }, modelRef.current);

            // Mantener escala natural 1.0 para evitar distorsión de malla en animaciones
            if (leftBreastRef.current) leftBreastRef.current.scale.set(1.0, 1.0, 1.0);
            if (rightBreastRef.current) rightBreastRef.current.scale.set(1.0, 1.0, 1.0);

            // 3. Mood System - Estados anímicos persistentes
            moodSystemRef.current = new MoodSystem('calm');

            // 4. Material Manager - Customización visual
            materialManagerRef.current = new MaterialManager();
            materialManagerRef.current.initialize(modelRef.current, isGrokAni);
            // Solo aplicar color de pelo si NO es el negro por defecto (el modelo ya trae su color original)
            if (hairColor && hairColor !== '#1a1a1a') {
                materialManagerRef.current.setColor('hair', hairColor);
            }

            // Mixer (necesario para AnimationManager pero ya no lo usamos directamente)
            mixerRef.current = new THREE.AnimationMixer(modelRef.current);

            // console.log(`📍 RESUMEN MODELO:`,
            //     `Meshes con morphs: ${meshes.length}`,
            //     `| VisemeMap: ${Object.keys(newVisemeMap).join(', ') || 'NINGUNO'}`,
            //     `| JawBone: ${jawBoneRef.current?.name || 'NO ENCONTRADO'}`,
            //     `| Animaciones: ${gltf.animations.map(a => a.name).join(', ') || 'NINGUNA'}`,
            //     `| Huesos (${allBones.length}):`, allBones.join(', ')
            // );

            // --- CONFIGURACIÓN DE VISIBILIDAD Y MATERIALES POR DEFECTO ---
            modelRef.current.traverse((child: any) => {
                if (child.isMesh) {
                    const name = child.name;
                    const lower = name.toLowerCase();

                    const isSkinMesh = /skin|body|肌|体|颜|face|head|human|ani_main|ani_body/i.test(name);

                    // Asegurar que todos los morphs de ropa, rotura, daño o no-faciales inicien estrictamente en 0
                    // Si es un modelo PMX, resetear TODOS los morphs al iniciar para evitar que morphs de ojos (como 白目消し o parpadeo congelado) lo dejen ciego/transparente
                    if (child.morphTargetDictionary && child.morphTargetInfluences) {
                        if (isPMX) {
                            child.morphTargetInfluences.fill(0);
                        } else {
                            for (const key in child.morphTargetDictionary) {
                                if (isClothingOrNudityMorph(key) || !isFacialMorph(key)) {
                                    const idx = child.morphTargetDictionary[key];
                                    if (idx !== undefined) child.morphTargetInfluences[idx] = 0;
                                }
                            }
                        }
                    }

                    if (isPMX) {
                        // Los materiales PMX ya fueron calibrados con precisión y orden de renderizado en pmxLoader.ts
                        // Reforzamos shadowSide y nos aseguramos de que no quede ninguna transparencia residual (excepto sub-malla de overlays)
                        if (child.material) {
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            const isOverlaySubmesh = child.name.includes('FacialOverlays');
                            mats.forEach((m: any) => {
                                if (m) {
                                    m.shadowSide = THREE.FrontSide;
                                    if (m.emissive && (/eye|pupil|iris|cornea|sclera|shirome|白目|瞳|目|眼/i.test(m.name || ''))) {
                                        m.emissive.setRGB(0, 0, 0);
                                    }
                                    if (!isOverlaySubmesh) {
                                        // Ropa, pelo, cuerpo y ojos: sólidos con depthWrite activado
                                        m.transparent = false;
                                        m.opacity = 1.0;
                                        m.depthWrite = true;
                                        m.depthTest = true;
                                        if (m.alphaTest === undefined || m.alphaTest < 0.1) {
                                            m.alphaTest = m.map ? 0.2 : 0;
                                        }
                                    }
                                }
                            });
                        }
                    } else if (isGrokAni) {
                        // Ajustes exclusivos para la plantilla modular Ani/GrokAni (decals, ropa superpuesta)
                        if (child.material) {
                            const mats = Array.isArray(child.material) ? child.material : [child.material];
                            mats.forEach((m: any) => {
                                if (m) {
                                    const mName = (m.name || name).toLowerCase();
                                    const isDecalMat = /tattoo|紋|sticker|blush|shadow|decal|lashes|eyelash/i.test(mName);
                                    if (isDecalMat) {
                                        m.side = THREE.FrontSide;
                                        m.transparent = true;
                                        m.depthWrite = false;
                                        m.polygonOffset = true;
                                        m.polygonOffsetFactor = -2.0;
                                        m.polygonOffsetUnits = -2.0;
                                    } else {
                                        m.side = THREE.DoubleSide;
                                        m.polygonOffset = false;
                                    }
                                    m.needsUpdate = true;
                                }
                            });
                        }

                        // RenderOrder para GrokAni: Piel en 0, Ropa en 1, Decals en 2
                        if (isSkinMesh) {
                            child.renderOrder = 0;
                        } else if (/sticker|lashes|blush|shadow|pastie/i.test(name)) {
                            child.renderOrder = 2;
                        } else {
                            child.renderOrder = 1;
                        }

                        // Ocultar solo mallas duplicadas/incompatibles de la plantilla base (boots2, flatfooted)
                        if (
                            name === 'Ani_MainFlatFooted' ||
                            lower.includes('flatfooted') ||
                            lower.includes('boots2') ||
                            lower.includes('bots2')
                        ) {
                            child.visible = false;
                            console.log(`🚫 [DefaultVisibility] Ocultando mesh duplicado base: ${name}`);
                        }
                    }
                }
            });

            // --- FORZAR POSE NEUTRA (BRAZOS ABAJO) ---
            // DIAGNÓSTICO FINAL: 
            // - Z (+75) -> Atrás
            // - X (+75) -> ARRIBA (Confirmado por foto)
            // CONCLUSIÓN: X es el eje Vertical. Positivo es Arriba.
            // SOLUCIÓN: Usar X NEGATIVO para bajar los brazos.
            // INICIALIZAR GESTOR DE ROPA Y VESTIR COMPLETAMENTE POR DEFECTO (Solo para modelos base GLB/VRM)
            if (!isPMX) {
                const cm = getClothingManager();
                cm.initialize(modelRef.current);
                cm.presetFullClothed();
            }

            const forceArmsDown = () => {
                const armDownRot = THREE.MathUtils.degToRad(-80); // 80 grados ABAJO (Negativo)

                if (rightArmRef.current) {
                    rightArmRef.current.rotation.set(0, 0, 0);
                    rightArmRef.current.rotation.z = 0;
                    rightArmRef.current.rotation.x = armDownRot; // X Negativo
                    rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(10);
                    rightArmOriginalRot.current = rightArmRef.current.rotation.clone();
                }
                if (leftArmRef.current) {
                    leftArmRef.current.rotation.set(0, 0, 0);
                    leftArmRef.current.rotation.x = armDownRot;
                    leftArmRef.current.rotation.z = THREE.MathUtils.degToRad(-10);
                    leftArmOriginalRot.current = leftArmRef.current.rotation.clone();
                }

            };
            if (isGrokAni) {
                forceArmsDown();
            } else {
                if (rightArmRef.current) rightArmOriginalRot.current = rightArmRef.current.rotation.clone();
                if (leftArmRef.current) leftArmOriginalRot.current = leftArmRef.current.rotation.clone();
            }

            // 🦾 SISTEMA NERVIOSO — Conectar cuerpo completo al IK Controller
            // IMPORTANTE: Llamar DESPUÉS de forceArmsDown() para que originalRot
            // capture la posición de descanso final (no la T-pose del modelo).
            if (ikControllerRef.current) {
                ikControllerRef.current.initializeFullBody({
                    leftArm: leftArmRef.current || undefined,
                    rightArm: rightArmRef.current || undefined,
                    leftForeArm: leftForeArmRef.current || undefined,
                    rightForeArm: rightForeArmRef.current || undefined,
                    torso: spineRef.current as THREE.Bone || undefined,
                    hips: hipsRef.current as THREE.Bone || undefined,
                    leftLeg: leftLegRef.current || undefined,
                    rightLeg: rightLegRef.current || undefined,
                });
                console.log('🦾 Sistema Nervioso: Cuerpo completo conectado al IK Controller');
            }

            // 5. Procedural Animator - Gestos sin clips de Blender
            proceduralAnimatorRef.current = new ProceduralAnimator();
            proceduralAnimatorRef.current.initialize({
                head: headBoneRef.current || undefined,
                spine: spineRef.current || undefined,
                hips: hipsRef.current || undefined,
                rightArm: rightArmRef.current || undefined,
                leftArm: leftArmRef.current || undefined,
                rightForeArm: rightForeArmRef.current || undefined,
                leftForeArm: leftForeArmRef.current || undefined,
            });
            console.log('✅ ProceduralAnimator inicializado');

            // Registrar listener de acciones disparadas por el sistema nervioso o eventos globales
            if (typeof window !== 'undefined') {
                const proceduralHandler = (e: Event) => {
                    const { action: act } = (e as CustomEvent<{ action: string }>).detail || {};
                    if (act) executeAction(act);
                };
                window.addEventListener('aiko-play-procedural', proceduralHandler);
                window.addEventListener('aiko-action', proceduralHandler);
            }

            // 🪄 PROPS MANAGER — Inicializar Sockets de Manos para Accesorios 3D
            const propMgr = getPropManager();
            propMgr.initialize(modelRef.current as any, rightHandRef.current || undefined, leftHandRef.current || undefined);
        }

        // Guardar la rotación original (Bind Pose) de todos los huesos para poder resetearlos sin deformarlos
        if (modelRef.current) {
            modelRef.current.traverse((child: any) => {
                if (child.isBone && !child.userData.baseQuat) {
                    child.userData.baseQuat = child.quaternion.clone();
                }
            });

            // CUSTOM SCALING (Solicitado por el usuario)
            // Agrandar los glúteos de forma sutil pero notoria
            const buttScale = 1.35; // 35% más grandes
            if (leftButtRef.current) leftButtRef.current.scale.set(buttScale, buttScale, buttScale);
            if (rightButtRef.current) rightButtRef.current.scale.set(buttScale, buttScale, buttScale);
        }

        // Cleanup on unmount
        return () => {
            ikRecalibrateFrames.current = 30; // Resetear para que al cargar nuevo modelo se recalibre de nuevo
            ikControllerRef.current?.resetCalibration(); // Deshabilitar head tracking hasta que el nuevo Idle se estabilice
            cleanupResources();
        };
    }, [modelData.scene]);


    // --- EFECTO: CARGAR ANIMACIONES EXTERNAS (Mixamo, etc.) ---
    useEffect(() => {
        const handler = async (e: Event) => {
            const { url, name, type } = (e as CustomEvent).detail;
            if (!url || !modelRef.current) return;

            console.log(`🎬 Cargando animación externa: ${name} (.${type})`);
            if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('nova-anim-loading', {
                    detail: { isLoading: true, message: `Cargando ${name} (.${type})...` }
                }));
            }

            try {
                let animations: THREE.AnimationClip[] = [];
                let sourceRestPoses: Map<string, THREE.Quaternion> | undefined;

                if (type === 'fbx') {
                    const manager = new THREE.LoadingManager();
                    // Evitar peticiones de red para texturas embebidas obsoletas en archivos de animación FBX
                    // Reemplazamos la URL de imágenes por un data URI transparente de 1x1 pixel
                    const EMPTY_PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
                    manager.setURLModifier((itemUrl: string) => {
                        // Si la URL es de una imagen (png, jpg, jpeg, etc.) y no es el FBX en sí, devolver pixel vacío
                        if (/\.(png|jpe?g|tga|bmp|webp)(\?.*)?$/i.test(itemUrl) || (itemUrl.startsWith('blob:') && itemUrl !== url)) {
                            return EMPTY_PIXEL;
                        }
                        return itemUrl;
                    });
                    manager.onError = (itemUrl: string) => {
                        console.debug('ℹ️ Textura accesoria de animación no requerida ignorada:', itemUrl);
                    };
                    const fbxLoader = new FBXLoader(manager);
                    const fbxResult = await new Promise<any>((resolve, reject) => {
                        fbxLoader.load(url, resolve, undefined, reject);
                    });
                    animations = fbxResult.animations || [];

                    // Extraer rest poses del esqueleto Mixamo (FBX)
                    sourceRestPoses = new Map();
                    fbxResult.traverse((child: any) => {
                        if (child.isBone) {
                            sourceRestPoses!.set(child.name, child.quaternion.clone());
                        }
                    });
                    // FBX cargado (log silenciado)
                } else if (type === 'vmd') {
                    // Carga diferida de VMD abajo tras obtener las targetRestPoses
                } else {
                    const gltfLoader = new GLTFLoader();
                    const gltfResult = await new Promise<any>((resolve, reject) => {
                        gltfLoader.load(url, resolve, undefined, reject);
                    });
                    animations = gltfResult.animations || [];

                    // Extraer rest poses del esqueleto (GLB)
                    sourceRestPoses = new Map();
                    if (gltfResult.scene || gltfResult.scenes?.length > 0) {
                        const sceneToTraverse = gltfResult.scene || gltfResult.scenes[0];
                        sceneToTraverse.traverse((child: any) => {
                            if (child.isBone) {
                                sourceRestPoses!.set(child.name, child.quaternion.clone());
                            }
                        });
                    }
                    console.log(`📦 GLB cargado: ${animations.length} anims, ${sourceRestPoses.size} huesos rest-pose`);
                }

                if (animations.length > 0 || type === 'vmd') {
                    const boneNames = getModelBoneNames(modelRef.current!);

                    // Encontrar el skeleton del modelo target
                    let skeleton: THREE.Skeleton | null = null;
                    modelRef.current!.traverse((child: any) => {
                        if (child.isSkinnedMesh && child.skeleton && !skeleton) {
                            skeleton = child.skeleton;
                            // Solo loguear en modo debug (evitar spam en consola que bloquea el hilo)
                            const hasDefAss = skeleton.bones.some((b: any) => b.name.toLowerCase().includes('def-ass.l'));
                            if (hasDefAss) console.log('✅ Skeleton incluye DEF-ass.L');
                            // console.log('💀 HUESOS REALES DEL SKELETON (SKINNED MESH):', skeleton.bones.map(b => b.name).join(', ')); // DEBUG ONLY
                        }
                    });

                    // 1. Resetear el esqueleto a la postura prístina ANTES de retargetear el nuevo clip
                    resetToPristinePose();

                    if (pristineRestPosesRef.current.size === 0) {
                        modelRef.current!.traverse((child: any) => {
                            if (child.isBone) {
                                pristineRestPosesRef.current.set(child.name, child.quaternion.clone());
                                pristineRestPositionsRef.current.set(child.name, child.position.clone());
                                const worldQ = new THREE.Quaternion();
                                child.getWorldQuaternion(worldQ);
                                pristineWorldRestPosesRef.current.set(child.name, worldQ);
                            }
                        });
                    }

                    // Usar las posturas de reposo prístinas e inmutables (evita arrastrar deformaciones de bailes previos)
                    const targetRestPoses = pristineRestPosesRef.current;
                    const targetRestPositions = pristineRestPositionsRef.current;
                    const targetWorldRestPoses = pristineWorldRestPosesRef.current;
                    // Target rest-poses silenciadas (log eliminado)

                    if (type === 'vmd') {
                        console.log(`🌸 Cargando y retargeteando movimiento VMD: ${name}`);
                        const response = await fetch(url);
                        const buffer = await response.arrayBuffer();

                        // Recopilar mallas con morph target dictionary para enlazar tracks faciales (ojos, cejas, boca)
                        const targetMorphMeshes: Array<{ name: string; dictionary: Record<string, number> }> = [];
                        modelRef.current?.traverse((child: any) => {
                            if (child.isMesh && child.morphTargetDictionary) {
                                if (!child.name) child.name = isPMX ? 'MMD_Mesh' : ('Mesh_' + targetMorphMeshes.length);
                                targetMorphMeshes.push({
                                    name: child.name,
                                    dictionary: child.morphTargetDictionary
                                });
                            }
                        });

                        const vmdClip = await loadVmdAnimationClip(buffer, name, boneNames, targetRestPoses, targetRestPositions, isPMX, targetMorphMeshes);
                        if (vmdClip) {
                            animations = [vmdClip];
                        }
                    }

                    const storedAnim = animationStore.get(name);

                    // 🎭 Inyección y Fusión de Expresiones Faciales VMD (si hay un archivo facial vinculado)
                    if (storedAnim?.facialUrl && storedAnim.useFacial !== false) {
                        try {
                            console.log(`🎭 [AvatarViewer3D] Cargando expresiones faciales VMD vinculadas para "${name}"...`);
                            const faceResp = await fetch(storedAnim.facialUrl);
                            const faceBuffer = await faceResp.arrayBuffer();

                            // Asegurar recopilación de targetMorphMeshes
                            const targetMorphMeshes: Array<{ name: string; dictionary: Record<string, number> }> = [];
                            modelRef.current?.traverse((child: any) => {
                                if (child.isMesh && child.morphTargetDictionary) {
                                    if (!child.name) child.name = isPMX ? 'MMD_Mesh' : ('Mesh_' + targetMorphMeshes.length);
                                    targetMorphMeshes.push({
                                        name: child.name,
                                        dictionary: child.morphTargetDictionary
                                    });
                                }
                            });

                            const facialClip = await loadVmdAnimationClip(faceBuffer, `${name}_facial`, boneNames, targetRestPoses, targetRestPositions, isPMX, targetMorphMeshes);
                            if (facialClip && facialClip.tracks.length > 0) {
                                const morphTracks = facialClip.tracks.filter(t => t.name.includes('morphTargetInfluences'));
                                if (morphTracks.length > 0) {
                                    if (animations.length > 0) {
                                        const mainClip = animations[0];
                                        const nonMorphTracks = mainClip.tracks.filter(t => !t.name.includes('morphTargetInfluences'));
                                        mainClip.tracks = [...nonMorphTracks, ...morphTracks];
                                        mainClip.duration = Math.max(mainClip.duration, facialClip.duration);
                                        console.log(`🎭 [AvatarViewer3D] Fusión exitosa: ${morphTracks.length} tracks faciales integrados a "${name}" (Duración: ${mainClip.duration.toFixed(1)}s)`);
                                    } else {
                                        const combinedClip = new THREE.AnimationClip(name, facialClip.duration, morphTracks);
                                        animations = [combinedClip];
                                    }
                                }
                            }
                        } catch (faceErr) {
                            console.warn('⚠️ [AvatarViewer3D] Error cargando expresiones faciales VMD vinculadas:', faceErr);
                        }
                    }

                    const processedClips: THREE.AnimationClip[] = [];
                    const posePreset = storedAnim?.posePreset || 'none';

                    animations.forEach((clip: THREE.AnimationClip) => {
                        clip.name = name;

                        if (type === 'vmd') {
                            const isPureFk = !!clip.userData?.hasRealFkLegs;
                            const clipHasIK = isPMX
                                ? (!!(clip.userData?.rawIkData as any)?.leftFoot?.length || clip.tracks.some(t => t.name.includes('ＩＫ') || t.name.includes('IK')))
                                : (!isPureFk && (!!clip.userData?.ikData || clip.tracks.some(t => t.name.includes('ＩＫ') || t.name.includes('IK'))));
                            hasIKTracksRef.current = clipHasIK;
                            activeClipHasMorphsRef.current = clip.tracks.some(t => t.name.includes('morphTargetInfluences'));

                            if (clipHasIK && clip.userData?.ikData) {
                                if (!legIkControllerRef.current) {
                                    legIkControllerRef.current = new MmdLegIkController();
                                }
                                legIkControllerRef.current.bindBones({
                                    hips: (hipsRef.current as any) ||
                                          (modelRef.current?.getObjectByName('Hips') as any) ||
                                          (modelRef.current?.getObjectByName('下半身') as any) ||
                                          (modelRef.current?.getObjectByName('センター') as any),
                                    thighL: leftLegRef.current,
                                    shinL: leftShineRef.current,
                                    footL: leftFootRef.current,
                                    thighR: rightLegRef.current,
                                    shinR: rightShineRef.current,
                                    footR: rightFootRef.current
                                });
                                legIkControllerRef.current.setIkData(clip.userData.ikData as any);

                                const defaultScale = isPMX ? 0.22 : 0.035;
                                if (storedAnim?.legCalibration) {
                                    legIkControllerRef.current.setCalibration(storedAnim.legCalibration);
                                    window.dispatchEvent(new CustomEvent('nova-leg-calibration', { detail: storedAnim.legCalibration }));
                                } else {
                                    legIkControllerRef.current.setCalibration({ scale: defaultScale, ikWeight: 0.95 });
                                }
                                console.log(`🦵 [AvatarViewer3D] Leg IK Controller activado para "${name}" (isPMX=${isPMX}, scale=${defaultScale})`);
                            } else {
                                legIkControllerRef.current?.setIkData(null);
                                console.log(`💃 [AvatarViewer3D] VMD "${name}": reproducción FK directa de autor (${isPureFk ? 'FK explícito detectado' : 'sin IK tracks'}) - sin solver restrictivo`);
                            }
                            console.log(`🦵 VMD "${name}": hasIK=${clipHasIK}, isPureFk=${isPureFk}, isPMX=${isPMX}`);
                            processedClips.push(clip);
                        } else if (isMixamoAnimation(clip) || isGenericFKAnimation(clip, boneNames)) {
                            // Mixamo/FK: NO usar IK Solver → evita piernas rígidas en animaciones de baile
                            hasIKTracksRef.current = false;
                            legIkControllerRef.current?.setIkData(null);
                            // Retargeteo iniciado
                            
                            const retargeted = retargetMixamoClip(
                                clip, boneNames, modelRef.current!,
                                sourceRestPoses, targetRestPoses, targetWorldRestPoses, posePreset
                            );
                            retargeted.name = name;
                            processedClips.push(retargeted);
                        } else {
                            // 🧹 LIMPIEZA DE ANIMACIÓN HORNEADA (FBX / GLB de Blender/Rokoko):
                            // 1. Descartamos TODOS los tracks de .scale (evita deformaciones)
                            // 2. Descartamos TODOS los tracks de .position (en esqueletos jerárquicos como Rigify,
                            //    los tracks de posición en DEF-pelvis / torso / etc. separan la pelvis de la columna
                            //    debido a discrepancias de escala métrica 1 vs 100 de FBX o jerarquías desvinculadas).
                            // 3. Descartamos tracks cuyos huesos o nodos no existan en el modelo destino (evita PropertyBinding warnings).
                            console.log(`🧹 Limpiando tracks de animación horneada (reproducción 100% por rotación jerárquica)...`);
                            // Animación horneada GLB/Blender: sin IK tracks → no usar CCDIKSolver
                            hasIKTracksRef.current = false;
                            const cleanedTracks = clip.tracks.filter(track => {
                                const lower = track.name.toLowerCase();
                                
                                // Eliminar tracks de escala y posición
                                if (lower.endsWith('.scale') || lower.endsWith('.position')) return false;

                                // Extraer el nombre del nodo / hueso antes de la propiedad (ej: "bone_Hips.quaternion" -> "bone_Hips")
                                const dotIndex = track.name.lastIndexOf('.');
                                const nodeName = dotIndex !== -1 ? track.name.substring(0, dotIndex) : track.name;

                                // Si el nodo no existe en el esqueleto ni en la jerarquía del modelo, descartar track
                                if (!boneNames.has(nodeName) && !modelRef.current!.getObjectByName(nodeName)) {
                                    return false;
                                }

                                return true;
                            });

                            clip.tracks = cleanedTracks;
                            processedClips.push(clip);
                        }

                        console.log(`✅ "${name}": ${clip.duration.toFixed(1)}s, ${clip.tracks.length} tracks`);
                    });

                    if (processedClips.length > 0 && mixerRef.current) {
                        if ((e as CustomEvent).detail.autoplay !== false) {
                            // Parar TODAS las animaciones actuales en el mixer original
                            mixerRef.current.stopAllAction();
                            if (animationManagerRef.current) {
                                animationManagerRef.current.stopAll(0);
                            }

                            // Asegurar que el esqueleto esté 100% limpio en su postura neutra antes de arrancar
                            resetToPristinePose();

                            // Reproducir el clip retargetado en el mixer ORIGINAL del modelo
                            const clipAction = mixerRef.current.clipAction(processedClips[0]);
                            activeClipActionRef.current = clipAction;
                            clipAction.reset();

                            // 🔒 REGLA: Reproducir SOLO 1 VEZ (LoopOnce) por defecto. NUNCA bucle infinito a menos que se solicite loop: true
                            const shouldLoop = (e as CustomEvent).detail?.loop === true;
                            clipAction.setLoop(shouldLoop ? THREE.LoopRepeat : THREE.LoopOnce, shouldLoop ? Infinity : 1);
                            clipAction.clampWhenFinished = true;
                            // Fade in suave para una entrada fluida
                            clipAction.fadeIn(0.35);
                            clipAction.play();
                            
                            externalAnimPlayingRef.current = true;
                            console.log(`🎬 Animación "${name}" reproduciéndose (${shouldLoop ? 'bucle' : 'reproducción única (1 sola vez)'})`);

                            // 🎵 Reproducir audio asociado a la animación (si existe)
                            const storedAnimForAudio = animationStore.get(name);
                            if (storedAnimForAudio?.audioUrl) {
                                if (animAudioRef.current) {
                                    animAudioRef.current.pause();
                                    animAudioRef.current.currentTime = 0;
                                }
                                if ((window as any).__novaAnimAudio) {
                                    try {
                                        (window as any).__novaAnimAudio.pause();
                                        (window as any).__novaAnimAudio.currentTime = 0;
                                    } catch (_) {}
                                }
                                const audio = new Audio(storedAnimForAudio.audioUrl);
                                audio.loop = shouldLoop;
                                audio.volume = 0.85;
                                audio.play().catch(() => {});
                                animAudioRef.current = audio;
                                (window as any).__novaAnimAudio = audio;
                                console.log(`🎵 Audio "${storedAnimForAudio.audioFileName}" iniciado con animación (loop=${shouldLoop})`);
                            } else if (animAudioRef.current) {
                                animAudioRef.current.pause();
                                animAudioRef.current = null;
                                if ((window as any).__novaAnimAudio) {
                                    try {
                                        (window as any).__novaAnimAudio.pause();
                                        (window as any).__novaAnimAudio.currentTime = 0;
                                    } catch (_) {}
                                    (window as any).__novaAnimAudio = null;
                                }
                            }

                            // 🛑 Finalización automática tras 1 sola reproducción si no está en bucle
                            if (!shouldLoop) {
                                let finishedFired = false;
                                const cleanupAndReturnToIdle = () => {
                                    if (finishedFired) return;
                                    finishedFired = true;
                                    mixerRef.current?.removeEventListener('finished', onFinished);
                                    console.log(`🏁 [AvatarViewer3D] Animación "${name}" finalizada (1 sola vez). Regresando suavemente a Idle.`);
                                    clipAction.fadeOut(0.4);
                                    setTimeout(() => {
                                        if (activeClipActionRef.current === clipAction) {
                                            stopCurrentAnimation();
                                        }
                                    }, 400);
                                };

                                const onFinished = (event: any) => {
                                    if (event.action === clipAction) {
                                        cleanupAndReturnToIdle();
                                    }
                                };
                                mixerRef.current.addEventListener('finished', onFinished);

                                // Fallback de seguridad: duración calculada del clip o audio
                                const durationSec = Math.max(processedClips[0].duration || 0, storedAnimForAudio?.duration || 0);
                                if (durationSec > 0 && isFinite(durationSec)) {
                                    setTimeout(() => {
                                        if (activeClipActionRef.current === clipAction && externalAnimPlayingRef.current) {
                                            cleanupAndReturnToIdle();
                                        }
                                    }, (durationSec + 0.35) * 1000);
                                }
                            }

                            // 🎥 Reproducir cámara cinematográfica VMD (si existe y está habilitada)
                            const shouldPlayCamera = storedAnim ? (storedAnim.useCamera !== false) : true;
                            let cameraClipToPlay: THREE.AnimationClip | null = (processedClips[0]?.userData?.cameraClip as THREE.AnimationClip) || null;

                            if (!cameraClipToPlay && storedAnim?.cameraUrl) {
                                try {
                                    console.log(`🎥 Cargando cámara VMD externa vinculada para "${name}"...`);
                                    const camResp = await fetch(storedAnim.cameraUrl);
                                    const camBuf = await camResp.arrayBuffer();
                                    // Escala 0.22 y offset Y -1.5 coinciden exactamente con la posición del avatar en el visor
                                    cameraClipToPlay = loadVmdCameraClip(camBuf, `${name}_camera`, 0.22, -1.5);
                                } catch (camErr) {
                                    console.warn('⚠️ Error cargando archivo de cámara VMD:', camErr);
                                }
                            }

                            if (cameraClipToPlay && shouldPlayCamera) {
                                window.dispatchEvent(new CustomEvent('nova-vmd-camera-play', { 
                                    detail: { clip: cameraClipToPlay, name } 
                                }));
                                console.log(`🎥 Cámara cinemática VMD iniciada para "${name}"`);
                            } else {
                                window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
                            }
                        } else {
                            console.log(`🎬 Animación "${name}" registrada exitosamente en background.`);
                        }

                        // NUEVO: Guardar en el AnimationManager para que Nova pueda invocarla luego por su nombre (etiqueta)
                        if (animationManagerRef.current) {
                            animationManagerRef.current.registerAnimation(name.toLowerCase(), processedClips[0]);
                            if (storedAnim?.customTag) {
                                animationManagerRef.current.registerAnimation(storedAnim.customTag.toLowerCase(), processedClips[0]);
                            }
                            // Registrar en GestureRegistry para que Nova y el catálogo conozcan la nueva animación
                            gestureRegistry.registerCustomAnimation(name, storedAnim?.customTag, processedClips[0]?.duration);

                            // Reproducir automáticamente si coincide con la acción actual
                            const currentAction = action;
                            if (currentAction && (currentAction.toLowerCase() === name.toLowerCase() || currentAction.toLowerCase() === storedAnim?.customTag?.toLowerCase())) {
                                animationManagerRef.current!.play(currentAction.toLowerCase(), { priority: 10, loop: false });
                            }
                        }
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('nova-anim-loading', {
                                detail: { isLoading: false, message: `"${name}" lista ✓` }
                            }));
                        }
                    } else if (animations.length === 0) {
                        console.warn(`⚠️ "${name}" no contiene animaciones o no se pudo retargetear`);
                        if (typeof window !== 'undefined') {
                            window.dispatchEvent(new CustomEvent('nova-anim-loading', {
                                detail: { isLoading: false, message: `"${name}" no contiene animaciones válidas` }
                            }));
                        }
                    }
                } else {
                    console.warn(`⚠️ "${name}" no contiene animaciones`);
                    if (typeof window !== 'undefined') {
                        window.dispatchEvent(new CustomEvent('nova-anim-loading', {
                            detail: { isLoading: false, message: `"${name}" no contiene animaciones` }
                        }));
                    }
                }
            } catch (err) {
                console.error(`❌ Error cargando "${name}":`, err);
                if (typeof window !== 'undefined') {
                    window.dispatchEvent(new CustomEvent('nova-anim-loading', {
                        detail: { isLoading: false, message: `Error cargando "${name}"` }
                    }));
                }
            }
        };

        window.addEventListener('nova-load-animation', handler);

        return () => {
            window.removeEventListener('nova-load-animation', handler);
            if (animAudioRef.current) {
                animAudioRef.current.pause();
                animAudioRef.current.currentTime = 0;
                animAudioRef.current = null;
            }
            if ((window as any).__novaAnimAudio) {
                try {
                    (window as any).__novaAnimAudio.pause();
                    (window as any).__novaAnimAudio.currentTime = 0;
                } catch (_) {}
                (window as any).__novaAnimAudio = null;
            }
        };
    }, [modelData?.scene]);


    // --- EFECTO: WEBCAM MOTION CAPTURE (REALTIME RETARGETING) ---
    useEffect(() => {
        let stream: MediaStream | null = null;
        let videoEl: HTMLVideoElement | null = null;
        let mcap: any = null;

        const toggleHandler = async (e: Event) => {
            const { active } = (e as CustomEvent<{ active: boolean }>).detail;

            if (active) {
                console.log('🎥 [AvatarViewer3D] Solicitando cámara para Live Mirror...');
                // Detener cualquier animación en el mixer para que el IK tenga control 100% libre sobre los huesos
                if (mixerRef.current) mixerRef.current.stopAllAction();
                if (animationManagerRef.current) {
                    animationManagerRef.current.stopAll();
                }
                externalAnimPlayingRef.current = false;

                try {
                    stream = await navigator.mediaDevices.getUserMedia({
                        video: { width: 640, height: 480, facingMode: 'user' }
                    });

                    videoEl = document.createElement('video');
                    videoEl.srcObject = stream;
                    videoEl.autoplay = true;
                    videoEl.playsInline = true;
                    videoEl.style.position = 'fixed';
                    videoEl.style.bottom = '20px';
                    videoEl.style.right = '20px';
                    videoEl.style.width = '160px';
                    videoEl.style.height = '120px';
                    videoEl.style.borderRadius = '12px';
                    videoEl.style.border = '3px solid #ff4a9e';
                    videoEl.style.boxShadow = '0 8px 30px rgba(0,0,0,0.5)';
                    videoEl.style.zIndex = '99999';
                    videoEl.style.transform = 'scaleX(-1)'; // Modo espejo visual
                    document.body.appendChild(videoEl);

                    // Import dinámico de MotionCaptureSystem para evitar cargar código si no se usa
                    const { MotionCaptureSystem } = await import('../utils/motionCapture');
                    mcap = new MotionCaptureSystem();

                    await mcap.start(videoEl, (rotations: any) => {
                        if (ikControllerRef.current) {
                            ikControllerRef.current.applyWebcamRotations(rotations);
                        }
                    });

                    console.log('✅ [AvatarViewer3D] Live Mirror activo y gesticulando');
                } catch (err) {
                    console.error('❌ [AvatarViewer3D] Error iniciando Mirror:', err);
                    window.dispatchEvent(new CustomEvent('aiko-camera-error', { detail: { error: String(err) } }));
                    // Detener si falló
                    if (videoEl) videoEl.remove();
                    if (stream) stream.getTracks().forEach(t => t.stop());
                }
            } else {
                console.log('🎥 [AvatarViewer3D] Apagando Live Mirror...');
                if (mcap) {
                    mcap.stop();
                    mcap = null;
                }
                if (stream) {
                    stream.getTracks().forEach(track => track.stop());
                    stream = null;
                }
                if (videoEl) {
                    videoEl.remove();
                    videoEl = null;
                }
                if (ikControllerRef.current) {
                    ikControllerRef.current.resetAllLimbs();
                }
                // Restaurar la animación por defecto de Idle al apagar el mirror
                if (animationManagerRef.current) {
                    animationManagerRef.current.play('Idle', { priority: 1, loop: true, blendDuration: 0.5 });
                }
            }
        };

        window.addEventListener('aiko-camera-toggle', toggleHandler);
        return () => {
            window.removeEventListener('aiko-camera-toggle', toggleHandler);
            if (mcap) mcap.stop();
            if (stream) stream.getTracks().forEach(track => track.stop());
            if (videoEl) videoEl.remove();
        };
    }, []);


    // --- EFECTO: APLICAR COLOR DE CABELLO ---
    useEffect(() => {
        // Solo aplicamos si el color NO es el negro por defecto heredado de versiones anteriores (#1a1a1a)
        // O si el usuario ha seleccionado explícitamente otro color.
        if (hairColor && hairColor !== '#1a1a1a' && materialManagerRef.current) {
            console.log('💇 Aplicando color de cabello personalizado:', hairColor);
            materialManagerRef.current.setColor('hair', hairColor);
        } else if (hairColor === '#1a1a1a' && materialManagerRef.current) {
            // Si es el negro por defecto, restaurar el original del modelo (ej: rubio)
            console.log('💇 Restaurando color de cabello original del modelo');
            materialManagerRef.current.resetCategoryToOriginal('hair');
        }
    }, [hairColor]);

    // --- EFECTO: DISPARAR ANIMACIONES DESDE PROP 'ACTION' ---
    useEffect(() => {
        if (action) {
            console.log('🎬 Action prop changed:', action);
            executeAction(action);
        } else {
            // Volver a Idle / detener procedural
            externalAnimPlayingRef.current = false;
            hasIKTracksRef.current = false; // Deshabilitar IK solver al volver a Idle
            ccdikLoggedRef.current = false;
            legIkControllerRef.current?.setIkData(null);
            activeClipActionRef.current = null;
            if (mixerRef.current) mixerRef.current.stopAllAction();
            // 🎵 Detener audio de animación al volver a Idle
            if (animAudioRef.current) {
                animAudioRef.current.pause();
                animAudioRef.current.currentTime = 0;
                animAudioRef.current = null;
            }
            if ((window as any).__novaAnimAudio) {
                try {
                    (window as any).__novaAnimAudio.pause();
                    (window as any).__novaAnimAudio.currentTime = 0;
                } catch (_) {}
                (window as any).__novaAnimAudio = null;
            }
            // 🎥 Detener cámara cinemática VMD al volver a Idle
            window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));

            // FIX PARA BUG DE COLUMNA CAÍDA: Solo reseteamos rotaciones para no romper accesorios/pelo
            if (spineRef.current) {
                spineRef.current.traverse((child: any) => {
                    if (child.isBone) {
                        const n = child.name.toLowerCase();
                        if (n.includes('spine') || n.includes('chest') || n.includes('body') || n.includes('torso')) {
                            if (child.userData.baseQuat) {
                                child.quaternion.copy(child.userData.baseQuat);
                            } else {
                                child.rotation.set(0, 0, 0);
                            }
                        }
                    }
                });
            }

            if (animationManagerRef.current) {
                animationManagerRef.current.play('Idle', { priority: 1, loop: true, blendDuration: 0.5 });
            }
            if (proceduralAnimatorRef.current) {
                proceduralAnimatorRef.current.stop();
            }
        }
    }, [action]);

    // Estados internos para Saccades
    const saccadeTimer = useRef(0);
    const nextSaccadeTime = useRef(0.5);

    useFrame((state, delta) => {
        // Limitar delta extremo (por ejemplo al cambiar de pestaña) para evitar saltos bruscos
        const safeDelta = Math.min(delta, 0.1);

        const isExternalAnimPlaying = (animationManagerRef.current?.isPlayingExternal() ?? false) || externalAnimPlayingRef.current;

        const t = state.clock.elapsedTime;

        // 1. En modelos PMX, restaurar huesos al estado post-mixer limpio para evitar acumulación continua
        if (isPMX && ikSolverRef.current?.restoreBones) {
            ikSolverRef.current.restoreBones();
        }

        if (mixerRef.current) mixerRef.current.update(safeDelta);

        // 🔒 BLINDAJE DE VESTIMENTA: Asegurar que ningún morph de eliminación de ropa, rotura o no-facial permanezca activo
        if (modelRef.current) {
            modelRef.current.traverse((child: any) => {
                if (child.isMesh && child.morphTargetDictionary && child.morphTargetInfluences) {
                    const dict = child.morphTargetDictionary;
                    const infl = child.morphTargetInfluences;
                    for (const key in dict) {
                        if (isClothingOrNudityMorph(key) || !isFacialMorph(key)) {
                            const idx = dict[key];
                            if (idx !== undefined && infl[idx] > 0) {
                                infl[idx] = 0;
                            }
                        }
                    }
                }
            });
        }

        // 2. En modelos PMX, guardar estado limpio del mixer
        if (isPMX && ikSolverRef.current?.saveBones) {
            ikSolverRef.current.saveBones();
        }

        // Cinemática Inversa y Grants de Piernas para VMD (PMX, GLTF, VRM, Mixamo):
        // En PMX: PmxAnimationController resuelve IK si la animación tiene IK, y SIEMPRE resuelve Grants (D-bones)
        // En VRM/GLTF: legIkController resuelve IK analítico cuando la animación tiene IK
        if (modelRef.current && (isPMX ? !!ikSolverRef.current : (hasIKTracksRef.current && (ikSolverRef.current || legIkControllerRef.current?.isEnabled())))) {
            // 1. Calcular world matrices de los huesos tras la actualización del mixer
            modelRef.current.updateMatrixWorld(true);

            // 2. Aplicar Cinemática Inversa y Concesiones (Grants)
            if (ikSolverRef.current) {
                if (typeof ikSolverRef.current.update === 'function') {
                    ikSolverRef.current.update(hasIKTracksRef.current);
                }
            } else if (legIkControllerRef.current?.isEnabled()) {
                const clipTime = activeClipActionRef.current ? activeClipActionRef.current.time : 0;
                legIkControllerRef.current.update(clipTime, hipsRef.current as any);
            }

            // 3. Actualizar esqueletos para que el skinning en GPU use las nuevas matrices inmediatamente
            modelRef.current.traverse((child: any) => {
                if (child.isSkinnedMesh && child.skeleton) {
                    child.skeleton.update();
                }
            });
        }

        // === ACTUALIZAR NUEVOS SISTEMAS (Solo si NO hay animación externa activa para evitar conflicto de mixers y velocidad 2x) ===
        if (animationManagerRef.current && !isExternalAnimPlaying) animationManagerRef.current.update(safeDelta);
        if (proceduralAnimatorRef.current && !isExternalAnimPlaying) {
            let musicEnergy = 0;
            let isMusicPlaying = false;
            if (audioAnalyser) {
                try {
                    const freqData = new Uint8Array(audioAnalyser.frequencyBinCount);
                    audioAnalyser.getByteFrequencyData(freqData);
                    let sum = 0;
                    for (let i = 0; i < freqData.length; i++) sum += freqData[i];
                    const avg = sum / freqData.length;
                    musicEnergy = avg / 128.0;
                    isMusicPlaying = avg > 6;
                } catch (_) {}
            }
            proceduralAnimatorRef.current.setMusicSync(activeBpmRef.current || 120, musicEnergy, isMusicPlaying);
            proceduralAnimatorRef.current.update(t, safeDelta);
        }

        // === Si hay animación externa (Mixamo), proceduralAnimator o idle ===
        // El parpadeo y lipsync se procesan de forma unificada más abajo en el render loop

        // --- GAZE PSICOLÓGICO Y SACCADIC EYE MOVEMENTS COGNITIVOS ---
        if (ikControllerRef.current?.isInitialized()) {
            saccadeTimer.current += delta;

            const currentAction = proceduralAnimatorRef.current?.getCurrentAction() || action;
            const isThinking = currentAction === 'thinking' || currentAction === 'confused';
            const isFlirtOrShy = currentAction === 'flirt' || currentAction === 'shy' || currentAction === 'playful_tease' || currentAction === 'picara';
            const isIntimate = isHotMode || currentAction === 'listen_attentive' || currentAction === 'blow_kiss' || currentAction === 'beso';

            if (saccadeTimer.current > nextSaccadeTime.current) {
                let rangeX = 0.035;
                let rangeY = 0.010;
                let offsetX = (Math.random() - 0.5) * rangeX * 2;
                let offsetY = (Math.random() - 0.5) * rangeY * 2;

                if (isThinking) {
                    // 🧠 THINKING GAZE: Desvío cognitivo hacia arriba a la izquierda (acceso de memoria / reflexión)
                    offsetX = -0.18 + (Math.random() - 0.5) * 0.04;
                    offsetY = 0.12 + (Math.random() - 0.5) * 0.03;
                } else if (isFlirtOrShy) {
                    // 🙈 SHY/FLIRT GAZE: Mirada hacia abajo-derecha momentánea y luego reconexión con el usuario
                    const glanceDown = Math.random() < 0.6;
                    offsetX = glanceDown ? 0.12 : (Math.random() - 0.5) * 0.02;
                    offsetY = glanceDown ? -0.10 : (Math.random() - 0.5) * 0.01;
                } else if (isIntimate) {
                    // 💖 TENDER / INTIMATE GAZE: Mirada fija penetrante a los ojos (micro-sacadas ultracortas de alta intensidad)
                    rangeX = 0.010;
                    rangeY = 0.004;
                    offsetX = (Math.random() - 0.5) * rangeX * 2;
                    offsetY = (Math.random() - 0.5) * rangeY * 2;
                }

                const microOffset = new THREE.Vector3(offsetX, offsetY, 0);
                ikControllerRef.current.setMicroOffset(microOffset);

                saccadeTimer.current = 0;
                const isDoubleFixation = Math.random() < 0.15;
                nextSaccadeTime.current = isThinking 
                    ? 0.8 + Math.random() * 0.6 
                    : (isDoubleFixation ? 0.35 + Math.random() * 0.4 : 1.8 + Math.random() * 2.7);
            }

            // Seguir dinámicamente la posición de la cámara 3D (para que el avatar te mire a los ojos y siga la cámara al rotar/mover la vista)
            ikControllerRef.current.setLookTarget(state.camera.position, true);
        }

        // Recalibrar bind pose para IK una vez que el modelo esté estabilizado
        if (ikRecalibrateFrames.current > 0) {
            ikRecalibrateFrames.current--;
            if (ikRecalibrateFrames.current === 0) {
                ikControllerRef.current?.recalibrateBindPose();
            }
        }

        // Inyectar el estado del baile actual (calculado en el frame anterior o actual)
        if (ikControllerRef.current?.isInitialized()) {
            ikControllerRef.current.setDanceState(musicEnergyRef.current, danceTimeRef.current);
            // En modelos PMX o durante animación externa, no sobreescribir las piernas con el solver de Mixamo
            ikControllerRef.current.update(delta, isExternalAnimPlaying || isPMX);
        }

        // --- SINCRONIZACIÓN DE CABELLO SE MOVIÓ AL FINAL DEL FRAME ---

        const moodInfluence = moodSystemRef.current?.getInfluence() || {
            breathingSpeed: 1, gestureFrequency: 1, expressionIntensity: 1, idleVariation: 1, timeScale: 1
        };

        // --- CALCULAR PESO DE CAPA PROCEDURAL ---
        // Si hay una animación activa (clip o procedural), reducir influencia del idle arm code
        // En PMX no hay clips embebidos de Blender, por lo que idle siempre está activo en reposo
        const isIdlePlaying = isPMX ? true : (animationManagerRef.current?.isPlaying('Idle') ?? true);
        const isProceduralPlaying = proceduralAnimatorRef.current?.isPlaying() ?? false;
        const proceduralLayerWeight = (isIdlePlaying && !action && !isProceduralPlaying && !isExternalAnimPlaying) ? 1.0 : 0.0;

        // --- 1. MOVIMIENTO "VIVO" AVANZADO (Procedural Animation) ---
        if (modelRef.current && !isExternalAnimPlaying) {

            // --- 0. INTERACCIÓN FÍSICA A MORPH TARGETS ---
            if (interactionLayerRef.current) {
                const mouthOffset = interactionLayerRef.current.getOffset('mouth');
                const vaginaOffset = interactionLayerRef.current.getOffset('vagina');
                const anusOffset = interactionLayerRef.current.getOffset('anus');

                let mouthTarget = 0;
                let tongueTarget = 0;
                let vaginaTarget = 0;
                let anusTarget = 0;

                if (mouthOffset) {
                    mouthTarget = Math.max(0, -mouthOffset.y * 3); // Tirar hacia abajo abre la boca
                    tongueTarget = Math.max(0, mouthOffset.x * 3); // Tirar hacia los lados saca la lengua
                }
                if (vaginaOffset) {
                    // Multiplicador reducido de 4 a 1.5 para hacer el movimiento mucho más leve
                    vaginaTarget = Math.min(1, Math.abs(vaginaOffset.y) * 0.1 + Math.abs(vaginaOffset.x) * 0.1);
                }
                if (anusOffset) {
                    // Multiplicador reducido de 4 a 1.5 para hacer el movimiento mucho más leve
                    anusTarget = Math.min(1, Math.abs(anusOffset.y) * 0.1 + Math.abs(anusOffset.x) * 0.1);
                }

                morphMeshesRef.current.forEach(mesh => {
                    if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

                    const dict = mesh.morphTargetDictionary;
                    const infl = mesh.morphTargetInfluences;

                    const applyMorph = (keys: string[], targetVal: number) => {
                        keys.forEach(k => {
                            // Find case insensitive match
                            const exactKey = Object.keys(dict).find(dk => dk.toLowerCase().includes(k.toLowerCase()));
                            if (exactKey !== undefined) {
                                const idx = dict[exactKey];
                                if (idx !== undefined) infl[idx] = THREE.MathUtils.lerp(infl[idx], targetVal, 0.2);
                            }
                        });
                    };

                    if (mouthOffset || isHotMode) {
                        const eroticStroke = Math.abs(Math.sin(t * 8));
                        applyMorph(['MouthOpen', 'Fcl_MTH_A', 'mouth_a', 'open'], Math.max(mouthTarget, eroticStroke * 0.7));
                        applyMorph(['TongueOut', 'tongue', 'roll', 'Fcl_MTH_O'], Math.max(tongueTarget, eroticStroke * 0.8));
                        // Expresión Ahegao al recibir la mamada/interacción rítmica
                        if (eroticStroke > 0.5 && isHotMode) {
                            applyMorph(['Joy', 'Fcl_EYE_Joy', 'Ahegao', 'wink'], 0.6);
                        }
                    }
                    if (vaginaOffset) {
                        applyMorph(['vagina', 'pussy', 'hole', 'Fcl_MTH_O'], vaginaTarget);
                    }
                    if (anusOffset) {
                        applyMorph(['anus', 'ass', 'hole'], anusTarget);
                    }
                });
            }

            // A. RESPIRACIÓN REALISTA ASIMÉTRICA SINCRONIZADA CON BPM (IK + ASMR)
            // En modo Ninfómano / Hot, el BPM sube a ~120-135 BPM (respiración jadeante agitada y caliente)
            const targetBpm = activeBpmRef.current || (isHotMode ? 128 : 68);
            const bpmSpeedMultiplier = (targetBpm / 60) * 0.28;
            const breathSpeed = bpmSpeedMultiplier * moodInfluence.breathingSpeed;
            const breathCycle = ((t * breathSpeed) % 1.0 + 1.0) % 1.0;
            let inhaleNorm = 0;
            if (breathCycle < 0.38) {
                // Inhalación (rápida y activa)
                const p = breathCycle / 0.38;
                inhaleNorm = Math.sin(p * Math.PI * 0.5);
            } else if (breathCycle < 0.46) {
                // Pausa / retención elástica en el pico
                inhaleNorm = 1.0;
            } else {
                // Exhalación lenta (relajación diafragmática)
                const p = (breathCycle - 0.46) / 0.54;
                inhaleNorm = Math.cos(p * Math.PI * 0.5);
            }
            const inhale = (inhaleNorm - 0.5) * 2.0; // -1 a 1

            // Expansión dinámica del pecho proporcional a la agitación/BPM (más intensa y jadeante en hot mode)
            const breathAmplitude = isHotMode ? 0.013 : (targetBpm > 90 ? 0.0075 : 0.0045);
            let baseY = isPMX ? -1.5 : -0.5; // El offset base necesario para este modelo (evita flotar)
            if (currentBasePoseRef.current === 'sit') baseY = isPMX ? -1.9 : -0.9;
            if (currentBasePoseRef.current === 'lie') baseY = isPMX ? -2.3 : -1.5;

            const targetY = baseY + (inhale * breathAmplitude * moodInfluence.expressionIntensity * proceduralLayerWeight);
            modelRef.current.position.y = THREE.MathUtils.lerp(modelRef.current.position.y, targetY, 0.08);

            // B. VIDA PROCEDURAL EN REPOSO (5-State Idle Cycle + Speech Gestures + Nympho Mode)
            if (!isExternalAnimPlaying && !activeCustomPoseRef.current && proceduralLayerWeight > 0.01) {

                // ── B0. ACTUALIZAR TIMER DEL CICLO IDLE ──
                idleStateTimerRef.current += delta;
                if (idleStateTimerRef.current >= nextIdleSwitchTimeRef.current) {
                    idleStateTimerRef.current = 0;
                    nextIdleSwitchTimeRef.current = 10 + Math.random() * 6; // 10-16s entre transiciones
                    prevIdleStateRef.current = currentIdleStateRef.current;
                    const others = IDLE_STATES.filter(s => s !== currentIdleStateRef.current);
                    const nextState = others[Math.floor(Math.random() * others.length)];
                    currentIdleStateRef.current = nextState;
                    idleBlendRef.current = 0; // Reiniciar blend

                    // Si hay una animación de override asignada a este estado de Idle, dispararla
                    const slotId = `idle_${nextState}` as IdleSlotId;
                    checkAndTriggerSlotOverride(slotId, true);
                }
                // Blend suave entre estados (0 -> 1 en ~2s)
                idleBlendRef.current = Math.min(1, idleBlendRef.current + delta / 2.0);
                const curState = currentIdleStateRef.current;

                // Nympho mode multiplier
                const isNymphoMode = isHotMode;
                const nymphoMult = isNymphoMode ? 2.2 : 1.0;

                // Helper deg->rad inline
                const d2r = THREE.MathUtils.degToRad;

                // ── B1. COLUMNA / TORSO — POSES VISIBLES Y DIFERENCIADAS ──
                if (spineRef.current) {
                    const spineBaseQuat = spineRef.current.userData.baseQuat;
                    const breathPitch = inhale * (isNymphoMode ? 0.045 : 0.025) * moodInfluence.expressionIntensity;

                    let sP = 0, sY = 0, sR = 0;
                    if (curState === 'relaxed') {
                        sP = breathPitch + d2r(2);
                        sY = Math.sin(t * 0.7) * d2r(3);
                        sR = Math.cos(t * 0.5) * d2r(2);
                    } else if (curState === 'weight_shift') {
                        sP = d2r(-3) * nymphoMult;
                        sY = Math.sin(t * 0.45) * d2r(7);
                        sR = Math.sin(t * 0.3) * d2r(5) * nymphoMult;
                    } else if (curState === 'cute_waist') {
                        sP = d2r(6);
                        sY = Math.sin(t * 0.55) * d2r(4);
                        sR = d2r(7) * Math.sin(t * 0.25);
                    } else if (curState === 'thoughtful') {
                        sP = d2r(9);
                        sY = d2r(-5) + Math.sin(t * 0.4) * d2r(2);
                        sR = d2r(3);
                    } else if (curState === 'curious_look') {
                        sP = d2r(4);
                        sY = Math.sin(t * 0.5) * d2r(4);
                        sR = d2r(8) + Math.sin(t * 0.3) * d2r(2);
                    }
                    // En modo ninfómano: arqueo lumbar sensual (pecho hacia afuera, culo respingado)
                    if (isNymphoMode) {
                        sP -= d2r(14); // Inclinación lumbar más pronunciada
                        sR += Math.sin(t * 1.8) * d2r(2.5); // Micro-temblor de éxtasis
                    }

                    const spDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(sP, sY, sR));
                    if (spineBaseQuat) {
                        spineRef.current.quaternion.slerp(spineBaseQuat.clone().multiply(spDelta), 0.05);
                    } else {
                        spineRef.current.quaternion.slerp(spDelta, 0.05);
                    }
                }

                // ── B2. CADERAS — BALANCEO EXPRESIVO ──
                if (hipsRef.current) {
                    const hipsBaseQuat = hipsRef.current.userData.baseQuat;
                    let hY = 0, hZ = 0;
                    if (curState === 'relaxed') {
                        hY = Math.sin(t * 0.5) * d2r(2.5);
                        hZ = Math.cos(t * 0.4) * d2r(2);
                    } else if (curState === 'weight_shift') {
                        hY = Math.sin(t * 0.4) * d2r(6) * nymphoMult;
                        hZ = Math.sin(t * 0.3) * d2r(7) * nymphoMult;
                    } else if (curState === 'cute_waist') {
                        hY = Math.sin(t * 0.55) * d2r(5);
                        hZ = Math.cos(t * 0.4) * d2r(4.5);
                    } else if (curState === 'thoughtful') {
                        hY = 0; hZ = d2r(3.5);
                    } else if (curState === 'curious_look') {
                        hY = Math.sin(t * 0.5) * d2r(4);
                        hZ = Math.cos(t * 0.38) * d2r(3.5);
                    }
                    if (isNymphoMode) {
                        // Vaivén constante de caderas seductor
                        hY += Math.sin(t * 1.2) * d2r(4);
                        hZ += Math.cos(t * 1.0) * d2r(5);
                    }
                    const hDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, hY, hZ));
                    if (hipsBaseQuat) {
                        hipsRef.current.quaternion.slerp(hipsBaseQuat.clone().multiply(hDelta), 0.05);
                    }
                }

                // ── B3. BRAZOS + ANTEBRAZOS EN IDLE — POSES DISTINTAS Y VISIBLES ──
                const lipSyncVolume = lipSyncRef.current ? (lipSyncRef.current.getState?.()?.intensity ?? 0) : 0;
                const isSpeechActive = isAiSpeaking || lipSyncVolume > 0.04;

                if (!isSpeechActive) {
                    // BRAZO IZQUIERDO
                    if (leftArmRef.current && leftArmRef.current.userData.baseQuat) {
                        let lP = inhale * 0.02, lR = 0;
                        if (curState === 'relaxed')      { lP += d2r(3);  lR = Math.sin(t * 0.55) * d2r(3); }
                        if (curState === 'weight_shift') { lP += d2r(5);  lR = d2r(-4); }
                        if (curState === 'cute_waist')   { lP += d2r(8);  lR = d2r(-6); }
                        if (curState === 'thoughtful')   { lP += d2r(18); lR = d2r(-10); }
                        if (curState === 'curious_look') { lP += d2r(6);  lR = d2r(5); }
                        leftArmRef.current.quaternion.slerp(leftArmRef.current.userData.baseQuat.clone().multiply(
                            new THREE.Quaternion().setFromEuler(new THREE.Euler(lP, 0, lR))), 0.06);
                    }
                    // ANTEBRAZO IZQUIERDO
                    if (leftForeArmRef.current && leftForeArmRef.current.userData.baseQuat) {
                        let lfP = 0, lfR = 0;
                        if (curState === 'relaxed')      { lfP = d2r(5);  lfR = Math.sin(t * 0.6) * d2r(4); }
                        if (curState === 'weight_shift') { lfP = d2r(10); lfR = d2r(-5); }
                        if (curState === 'cute_waist')   { lfP = d2r(15); lfR = d2r(-8); }
                        if (curState === 'thoughtful')   { lfP = d2r(35); lfR = d2r(-5); }
                        if (curState === 'curious_look') { lfP = d2r(8);  lfR = d2r(6); }
                        leftForeArmRef.current.quaternion.slerp(leftForeArmRef.current.userData.baseQuat.clone().multiply(
                            new THREE.Quaternion().setFromEuler(new THREE.Euler(lfP, 0, lfR))), 0.06);
                    }
                    // BRAZO DERECHO
                    if (rightArmRef.current && rightArmRef.current.userData.baseQuat) {
                        let rP = inhale * 0.02, rR = 0;
                        if (curState === 'relaxed')      { rP += d2r(3);  rR = -Math.sin(t * 0.55) * d2r(3); }
                        if (curState === 'weight_shift') { rP += d2r(6);  rR = d2r(-5) * nymphoMult; }
                        if (curState === 'cute_waist')   { rP += d2r(4);  rR = d2r(-3); }
                        if (curState === 'thoughtful')   { rP += d2r(5);  rR = d2r(-4); }
                        if (curState === 'curious_look') { rP += d2r(8);  rR = d2r(6); }
                        rightArmRef.current.quaternion.slerp(rightArmRef.current.userData.baseQuat.clone().multiply(
                            new THREE.Quaternion().setFromEuler(new THREE.Euler(rP, 0, rR))), 0.06);
                    }
                    // ANTEBRAZO DERECHO
                    if (rightForeArmRef.current && rightForeArmRef.current.userData.baseQuat) {
                        let rfP = 0, rfR = 0;
                        if (curState === 'relaxed')      { rfP = d2r(5);  rfR = -Math.sin(t * 0.6) * d2r(4); }
                        if (curState === 'weight_shift') { rfP = d2r(12); rfR = d2r(-7); }
                        if (curState === 'cute_waist')   { rfP = d2r(8);  rfR = d2r(-5); }
                        if (curState === 'thoughtful')   { rfP = d2r(10); rfR = d2r(-6); }
                        if (curState === 'curious_look') { rfP = d2r(18); rfR = d2r(8); }
                        rightForeArmRef.current.quaternion.slerp(rightForeArmRef.current.userData.baseQuat.clone().multiply(
                            new THREE.Quaternion().setFromEuler(new THREE.Euler(rfP, 0, rfR))), 0.06);
                    }
                }

                // ── B4. GESTOS DE HABLA — 4 ESTILOS DISTINTOS CON BRAZOS VISIBLES ──
                if (isSpeechActive) {
                    speechGesturePhaseRef.current += delta;
                    const ph = speechGesturePhaseRef.current;
                    const energy = Math.min(1, Math.max(lipSyncVolume * 2.5, isAiSpeaking ? 0.7 : 0));
                    const gestStyle = Math.floor(ph / 8) % 4; // Cambia estilo cada 8s

                    // Si cambia de estilo de habla y hay override asignado, dispararlo
                    if (prevSpeechStyleRef.current !== gestStyle) {
                        prevSpeechStyleRef.current = gestStyle;
                        const SPEECH_SLOT_MAP: IdleSlotId[] = ['speech_explain', 'speech_emphasis', 'speech_seductive', 'speech_animated'];
                        checkAndTriggerSlotOverride(SPEECH_SLOT_MAP[gestStyle], false);
                    }

                    // TORSO: lean-in conversacional notable
                    if (spineRef.current && spineRef.current.userData.baseQuat) {
                        const leanDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                            d2r(7) * energy, Math.sin(ph * 2.0) * d2r(4) * energy, Math.cos(ph * 1.4) * d2r(2) * energy));
                        spineRef.current.quaternion.slerp(spineRef.current.userData.baseQuat.clone().multiply(leanDelta), 0.1);
                    }
                    // CADERAS: ritmo sutil al hablar
                    if (hipsRef.current && hipsRef.current.userData.baseQuat) {
                        const hRhyDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(ph * 1.2) * d2r(2.5) * energy, 0));
                        hipsRef.current.quaternion.slerp(hipsRef.current.userData.baseQuat.clone().multiply(hRhyDelta), 0.08);
                    }

                    if (gestStyle === 0) {
                        // "Explicar" — brazo izq sube y gesticula
                        const sweep = Math.sin(ph * 1.5) * d2r(20) * energy;
                        if (leftArmRef.current?.userData.baseQuat)
                            leftArmRef.current.quaternion.slerp(leftArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(25) + sweep, 0, d2r(-10)))), 0.1);
                        if (leftForeArmRef.current?.userData.baseQuat)
                            leftForeArmRef.current.quaternion.slerp(leftForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.sin(ph * 1.8) * d2r(15) * energy + d2r(20), 0, 0))), 0.1);
                        if (rightArmRef.current?.userData.baseQuat)
                            rightArmRef.current.quaternion.slerp(rightArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(8), 0, d2r(-5)))), 0.07);
                        if (rightForeArmRef.current?.userData.baseQuat)
                            rightForeArmRef.current.quaternion.slerp(rightForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(15), 0, 0))), 0.07);
                    } else if (gestStyle === 1) {
                        // "Énfasis" — ambos brazos se abren
                        const sp = (Math.sin(ph * 1.3) * 0.5 + 0.5) * energy;
                        if (leftArmRef.current?.userData.baseQuat)
                            leftArmRef.current.quaternion.slerp(leftArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(20 + sp * 15), 0, d2r(-8 - sp * 12)))), 0.1);
                        if (rightArmRef.current?.userData.baseQuat)
                            rightArmRef.current.quaternion.slerp(rightArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(20 + sp * 15), 0, d2r(-8 - sp * 12)))), 0.1);
                        if (leftForeArmRef.current?.userData.baseQuat)
                            leftForeArmRef.current.quaternion.slerp(leftForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(25), 0, d2r(5 * sp)))), 0.1);
                        if (rightForeArmRef.current?.userData.baseQuat)
                            rightForeArmRef.current.quaternion.slerp(rightForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(25), 0, d2r(-5 * sp)))), 0.1);
                    } else if (gestStyle === 2) {
                        // "Seductora" — brazo der sube lentamente
                        const sw = Math.sin(ph * 0.7) * energy;
                        if (rightArmRef.current?.userData.baseQuat)
                            rightArmRef.current.quaternion.slerp(rightArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(30 + sw * 15), d2r(5), d2r(-12)))), 0.08);
                        if (rightForeArmRef.current?.userData.baseQuat)
                            rightForeArmRef.current.quaternion.slerp(rightForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(40 + sw * 10), 0, 0))), 0.08);
                        if (leftArmRef.current?.userData.baseQuat)
                            leftArmRef.current.quaternion.slerp(leftArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(10), 0, d2r(-4)))), 0.06);
                        if (leftForeArmRef.current?.userData.baseQuat)
                            leftForeArmRef.current.quaternion.slerp(leftForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(20), 0, 0))), 0.06);
                    } else {
                        // "Animada" — ambos brazos gestualizan rápido alternado
                        const aL = Math.sin(ph * 2.2) * energy;
                        const aR = Math.cos(ph * 2.0) * energy;
                        if (leftArmRef.current?.userData.baseQuat)
                            leftArmRef.current.quaternion.slerp(leftArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(15 + aL * 20), 0, d2r(-6 - aL * 8)))), 0.14);
                        if (leftForeArmRef.current?.userData.baseQuat)
                            leftForeArmRef.current.quaternion.slerp(leftForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(20 + aL * 15), 0, 0))), 0.14);
                        if (rightArmRef.current?.userData.baseQuat)
                            rightArmRef.current.quaternion.slerp(rightArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(15 + aR * 20), 0, d2r(-6 - aR * 8)))), 0.14);
                        if (rightForeArmRef.current?.userData.baseQuat)
                            rightForeArmRef.current.quaternion.slerp(rightForeArmRef.current.userData.baseQuat.clone().multiply(
                                new THREE.Quaternion().setFromEuler(new THREE.Euler(d2r(20 + aR * 15), 0, 0))), 0.14);
                    }

                    // CABEZA: micro-nods al hablar (solo si IK no activo)
                    if (headBoneRef.current?.userData.baseQuat && !ikControllerRef.current?.isInitialized()) {
                        const nodDelta = new THREE.Quaternion().setFromEuler(new THREE.Euler(
                            Math.sin(ph * 2.5) * d2r(4) * energy, Math.cos(ph * 1.6) * d2r(3) * energy, 0));
                        headBoneRef.current.quaternion.slerp(headBoneRef.current.userData.baseQuat.clone().multiply(nodDelta), 0.09);
                    }
                } else {
                    speechGesturePhaseRef.current *= 0.94;
                }
            }

            // C. CABEZA "FLOTANTE" (Head Stabilization)
            // NOTA: El IKController maneja la rotación de cabeza vía quaternion.slerp().
            // Modificar rotation.x/y aquí directamente CONFLICTA con el IK y produce la cabeza girada 90°.
            // Solo aplicamos ruido de atención MÍNIMO cuando el IK no está activo (primeros frames).
            // El "counterX/counterY" ha sido ELIMINADO porque el IK ya maneja el look-at de forma correcta.
            if (headBoneRef.current && spineRef.current && proceduralLayerWeight > 0.01 && !ikControllerRef.current?.isInitialized()) {
                // Solo correr si el IK aún no se ha inicializado (fase de arranque)
                const attentionNoise = simplex.noise2D(t, 600) * 0.005 * moodInfluence.expressionIntensity;
                headBoneRef.current.rotation.y = THREE.MathUtils.lerp(headBoneRef.current.rotation.y, attentionNoise, 0.05);
            }

            // --- D. AGENTIC GENERATIVE MOTOR SYSTEM ---
            if (activeCustomPoseRef.current) {
                const pose = activeCustomPoseRef.current;

                const applyCustomLimbPose = (
                    boneRef: React.RefObject<THREE.Bone | THREE.Object3D>,
                    rotations: { x?: number; y?: number; z?: number },
                    clamps: {
                        minX?: number; maxX?: number;
                        minY?: number; maxY?: number;
                        minZ?: number; maxZ?: number;
                    }
                ) => {
                    if (!boneRef.current) return;
                    const bone = boneRef.current;
                    const baseQuat = bone.userData.baseQuat || bone.userData.ikBaseRotation;

                    const safeX = rotations.x !== undefined ? THREE.MathUtils.clamp(rotations.x, clamps.minX ?? -45, clamps.maxX ?? 45) : 0;
                    const safeY = rotations.y !== undefined ? THREE.MathUtils.clamp(rotations.y, clamps.minY ?? -45, clamps.maxY ?? 45) : 0;
                    const safeZ = rotations.z !== undefined ? THREE.MathUtils.clamp(rotations.z, clamps.minZ ?? -45, clamps.maxZ ?? 45) : 0;

                    const deltaEuler = new THREE.Euler(
                        THREE.MathUtils.degToRad(safeX),
                        THREE.MathUtils.degToRad(safeY),
                        THREE.MathUtils.degToRad(safeZ)
                    );
                    const deltaQuat = new THREE.Quaternion().setFromEuler(deltaEuler);

                    if (baseQuat) {
                        const targetQuat = baseQuat.clone().multiply(deltaQuat);
                        bone.quaternion.slerp(targetQuat, 0.1);
                    } else {
                        bone.quaternion.slerp(deltaQuat, 0.1);
                    }
                };

                // Limites anatómicos estrictos para la columna y el tronco
                applyCustomLimbPose(spineRef, 
                    { x: pose.torsoX, y: pose.torsoY, z: pose.torsoZ }, 
                    { minX: -20, maxX: 25, minY: -30, maxY: 30, minZ: -15, maxZ: 15 }
                );

                applyCustomLimbPose(headBoneRef, 
                    { x: pose.headX, y: pose.headY, z: pose.headZ }, 
                    { minX: -25, maxX: 25, minY: -40, maxY: 40, minZ: -20, maxZ: 20 }
                );

                applyCustomLimbPose(leftArmRef, 
                    { x: pose.leftArmX, z: pose.leftArmZ }, 
                    { minX: -90, maxX: 90, minZ: -90, maxZ: 90 }
                );

                applyCustomLimbPose(rightArmRef, 
                    { x: pose.rightArmX, z: pose.rightArmZ }, 
                    { minX: -90, maxX: 90, minZ: -90, maxZ: 90 }
                );

                applyCustomLimbPose(leftLegRef, 
                    { x: pose.leftLegX, y: pose.leftLegY, z: pose.leftLegZ }, 
                    { minX: -35, maxX: 35, minY: -30, maxY: 30, minZ: -25, maxZ: 25 }
                );

                applyCustomLimbPose(rightLegRef, 
                    { x: pose.rightLegX, y: pose.rightLegY, z: pose.rightLegZ }, 
                    { minX: -35, maxX: 35, minY: -30, maxY: 30, minZ: -25, maxZ: 25 }
                );

                applyCustomLimbPose(leftShineRef, { x: pose.leftKneeX }, { minX: -30, maxX: 30 });
                applyCustomLimbPose(rightShineRef, { x: pose.rightKneeX }, { minX: -30, maxX: 30 });
            }
        }

        // --- GESTOS / ACCIONES ---
        // Gestión de brazos: si el ProceduralAnimator está activo, él controla los brazos.
        // Si no, devolvemos suavemente a pose de descanso natural.

        // --- 🦵 PROCEDURAL POSE OVERRIDES (SIT/LIE) ---
        // Deshabilitado temporalmente por petición del usuario (animaciones generadas proceduralmente)
        if (modelRef.current) {
            modelRef.current.rotation.x = THREE.MathUtils.lerp(modelRef.current.rotation.x, 0, 0.05);

            // --- 🏃 DESPLAZAMIENTO NAVEGACIÓN 3D SOBRE EL SUELO ---
            if (isNavigating3D.current) {
                const curPos = modelRef.current.position;
                const tgtPos = target3DPos.current;
                const dist2D = new THREE.Vector2(curPos.x, curPos.z).distanceTo(new THREE.Vector2(tgtPos.x, tgtPos.z));

                if (dist2D > 0.03) {
                    curPos.x = THREE.MathUtils.lerp(curPos.x, tgtPos.x, 0.05);
                    curPos.z = THREE.MathUtils.lerp(curPos.z, tgtPos.z, 0.05);
                } else {
                    isNavigating3D.current = false;
                    console.log('🏁 [AvatarViewer3D] Llegó al destino 3D');
                }
            }
        }

        // --- RELAX / IDLE ARMS (DELETED) ---
        // Ya no sobreescribimos los brazos manualmente porque el AnimationManager (Mixamo/Blender Idle)
        // lo hace 1000 veces mejor y evita las torceduras ("brazo torcida") del bind pose roto.
        // Si isProceduralPlaying === true, el ProceduralAnimator controla los brazos en su update().

        // Actualizar dinámicas de Props (humo, vapor, pulso de poción)
        getPropManager().update(delta, t);

        // --- 🖐️ FINGER PROCEDURAL ANIMATION ---
        // Solo para modelos Rigify/GrokAni cuando está hablando la IA o hay acción explícita
        if (isGrokAniRef.current && !isExternalAnimPlaying) {
            fingerPoseRef.current.timer += delta;

            if (isAiSpeaking) {
                if (fingerPoseRef.current.timer > 4.5 + Math.random() * 2) {
                    fingerPoseRef.current.timer = 0;
                    const poses = ['OPEN', 'PINCH', 'POINT', 'RELAX'];
                    fingerPoseRef.current.name = poses[Math.floor(Math.random() * poses.length)];
                }
            } else {
                // En reposo/idle, mantener siempre postura relajada sin ciclar aleatoriamente
                fingerPoseRef.current.name = 'RELAX';
                fingerPoseRef.current.timer = 0;
            }

            const pose = fingerPoseRef.current.name;
            // TABLAS DE ÁNGULOS POR POSE, SEGMENTO Y TIPO DE DEDO
            // Segmento 1=proximal, 2=medio, 3=distal — cada articulación tiene su propio target
            // Ángulos en Rigify rotation.x (flexión hacia palma) y rotation.y (para pulgar)
            type PoseTable = { x: number; y?: number; z?: number };
            const FINGER_ANGLES: Record<string, Record<string, PoseTable[]>> = {
                // [pose][seg1, seg2, seg3]
                RELAX: { normal: [{ x: 8 }, { x: 5 }, { x: 3 }], thumb: [{ x: 5, y: -8 }, { x: 3 }, { x: 2 }] },
                SOFT_CURL: { normal: [{ x: 30 }, { x: 25 }, { x: 18 }], thumb: [{ x: 20, y: -5 }, { x: 15 }, { x: 10 }] },
                OPEN: { normal: [{ x: -5, z: 0 }, { x: -3 }, { x: -2 }], thumb: [{ x: -3, y: -12 }, { x: -2 }, { x: -1 }] },
                PINCH: {
                    normal: [{ x: 45 }, { x: 40 }, { x: 30 }],
                    thumb: [{ x: 35, y: -5 }, { x: 25 }, { x: 15 }]
                },
                POINT: { normal: [{ x: 40 }, { x: 35 }, { x: 25 }], thumb: [{ x: 5, y: -10 }, { x: 3 }, { x: 2 }] },
                GRIP: {
                    normal: [{ x: 55 }, { x: 50 }, { x: 40 }],
                    thumb: [{ x: 45, y: -15 }, { x: 35 }, { x: 25 }]
                },
                HOLD: {
                    normal: [{ x: 45 }, { x: 40 }, { x: 30 }],
                    thumb: [{ x: 30, y: -10 }, { x: 20 }, { x: 15 }]
                }
            };
            // Para PINCH/POINT el índice se extiende
            const POINT_INDEX: PoseTable[] = [{ x: -5 }, { x: -3 }, { x: -2 }];
            const PINCH_INDEX: PoseTable[] = [{ x: 50 }, { x: 45 }, { x: 35 }];

            const applyFingerPose = (fingers: typeof fingerBonesRef.current.left) => {
                fingers.forEach(({ bone, segment, isThumb, fingerName }) => {
                    const table = FINGER_ANGLES[pose] || FINGER_ANGLES.RELAX;
                    let entry: PoseTable;

                    if (isThumb) {
                        entry = table.thumb[segment - 1] || table.thumb[0];
                    } else if (pose === 'POINT' && fingerName === 'index') {
                        entry = POINT_INDEX[segment - 1] || POINT_INDEX[0];
                    } else if (pose === 'PINCH' && (fingerName === 'index' || fingerName === 'thumb')) {
                        entry = PINCH_INDEX[segment - 1] || PINCH_INDEX[0];
                    } else {
                        entry = table.normal[segment - 1] || table.normal[0];
                    }

                    const tX = THREE.MathUtils.degToRad(entry.x ?? 0);
                    const tY = THREE.MathUtils.degToRad(entry.y ?? 0);
                    const tZ = THREE.MathUtils.degToRad(entry.z ?? 0);

                    bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, tX, 0.18);
                    bone.rotation.y = THREE.MathUtils.lerp(bone.rotation.y, tY, 0.18);
                    bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, tZ, 0.18);
                });
            };

            applyFingerPose(fingerBonesRef.current.left);
            applyFingerPose(fingerBonesRef.current.right);
        }

        // --- 2. CONTROL "MODO HOT" Y GESTOS FACIALES VOLUNTARIOS (Ojos, Boca, Lengua) ---
        let currentTongueTarget = isHotMode ? 0.6 : 0;

        if (activeFacialActionRef.current) {
            const act = activeFacialActionRef.current;
            act.timer += delta;
            const progress = act.timer / act.duration;
            const intensity = progress < 0.15 ? progress / 0.15 : progress > 0.8 ? (1 - progress) / 0.2 : 1.0;

            morphMeshesRef.current.forEach(mesh => {
                if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;
                const dict = mesh.morphTargetDictionary;
                const infl = mesh.morphTargetInfluences;

                const applyMorphKeys = (keys: string[], val: number) => {
                    keys.forEach(k => {
                        const foundKey = Object.keys(dict).find(dk => dk.toLowerCase().includes(k.toLowerCase()));
                        if (foundKey !== undefined) {
                            const idx = dict[foundKey];
                            infl[idx] = THREE.MathUtils.lerp(infl[idx], val, 0.25);
                        }
                    });
                };

                if (act.action.includes('wink_left') || act.action === 'wink_l') {
                    applyMorphKeys(['eyeblink_l', 'blink_l', 'fcl_eye_close_l', 'vrc.blink_left'], intensity);
                } else if (act.action.includes('wink_right') || act.action === 'wink_r' || act.action === 'wink') {
                    applyMorphKeys(['eyeblink_r', 'blink_r', 'fcl_eye_close_r', 'vrc.blink_right'], intensity);
                } else if (act.action.includes('close_eyes') || act.action.includes('cerrar_ojos')) {
                    applyMorphKeys(['eyeblink', 'blink', 'fcl_eye_close', 'vrc.blink'], intensity);
                } else if (act.action.includes('tongue') || act.action.includes('lengua')) {
                    currentTongueTarget = intensity * 0.95;
                    applyMorphKeys(['tongue', 'fcl_mth_tongue', 'tongueout', 'tongue_out'], intensity * 0.95);
                } else if (act.action.includes('smile') || act.action.includes('sonre')) {
                    applyMorphKeys(['smile', 'joy', 'fcl_mth_joy', 'fcl_all_joy'], intensity * 0.85);
                } else if (act.action.includes('pout') || act.action.includes('puchero')) {
                    applyMorphKeys(['frown', 'sorrow', 'fcl_mth_sorrow', 'pout'], intensity * 0.75);
                } else if (act.action.includes('kiss') || act.action.includes('beso')) {
                    applyMorphKeys(['mouthpucker', 'fcl_mth_u', 'viseme_u', 'kiss'], intensity * 0.9);
                } else if (act.action.includes('open_mouth') || act.action.includes('abrir_boca')) {
                    applyMorphKeys(['mouthopen', 'fcl_mth_a', 'viseme_aa'], intensity * 0.7);
                } else if (act.action.includes('ahegao')) {
                    currentTongueTarget = intensity * 0.95;
                    applyMorphKeys(['ahegao', 'roll', 'tongue', 'fcl_mth_tongue'], intensity * 0.9);
                }
            });

            if (act.timer >= act.duration) {
                activeFacialActionRef.current = null;
            }
        }

        if (tongueMeshRef.current && tongueRef.current !== null) {
            const current = tongueMeshRef.current.morphTargetInfluences![tongueRef.current];
            tongueMeshRef.current.morphTargetInfluences![tongueRef.current] =
                THREE.MathUtils.lerp(current, currentTongueTarget, delta * 8);
        }

        // --- 3. PARPADEO BIOLÓGICO CON CURVA ASIMÉTRICA Y ADAPTACIÓN EMOCIONAL ---
        blinkTimer.current += delta;
        let blinkCurve = 0;

        if (blinkTimer.current >= nextBlinkTime.current) {
            isBlinking.current = true;
            const blinkElapsed = blinkTimer.current - nextBlinkTime.current;
            const totalDuration = blinkDuration; // ~0.20s

            if (blinkElapsed < totalDuration * 0.35) {
                // Fase 1: Cierre rápido (inercia del párpado superior ~70ms)
                const p = blinkElapsed / (totalDuration * 0.35);
                blinkCurve = p * p;
            } else if (blinkElapsed < totalDuration) {
                // Fase 2: Reapertura más suave y gradual (~130ms)
                const p = (blinkElapsed - totalDuration * 0.35) / (totalDuration * 0.65);
                blinkCurve = 1.0 - Math.sin(p * Math.PI * 0.5);
            } else {
                // Parpadeo finalizado: calcular el siguiente intervalo según estado emocional
                isBlinking.current = false;
                blinkTimer.current = 0;

                let minInterval = 2.4;
                let maxInterval = 4.6;
                if (emotion === 'happy' || emotion === 'excited') {
                    minInterval = 1.8; maxInterval = 3.6;
                } else if (emotion === 'sad') {
                    minInterval = 3.4; maxInterval = 6.2;
                } else if (emotion === 'angry') {
                    minInterval = 4.5; maxInterval = 7.5; // mirada fija
                } else if (emotion === 'thinking') {
                    minInterval = 2.5; maxInterval = 4.6;
                }

                // Posibilidad de micro doble parpadeo humano natural (~8% de probabilidad)
                const isDoubleBlink = Math.random() < 0.08;
                nextBlinkTime.current = isDoubleBlink ? 0.12 + Math.random() * 0.16 : minInterval + Math.random() * (maxInterval - minInterval);
            }
        }

        // --- 3. EXPRESIVIDAD: OJOS Y MIRADA ---
        // Expresividad de ojos controlada por emociones e IK de cámara (sin tracking 2D del ratón)
        let targetPupilScale = 0;
        let eyeDirectionX = 0;
        let eyeDirectionY = 0;

        switch (emotion) {
            case 'happy':
            case 'excited':
                targetPupilScale = 1.0; // Ojos brillantes/grandes
                break;
            case 'sad':
                eyeDirectionY = THREE.MathUtils.lerp(eyeDirectionY, -0.6, 0.8); // Mirar abajo
                targetPupilScale = -0.2;
                break;
            case 'angry':
                targetPupilScale = -0.8;
                eyeDirectionX *= 0.3; // Mirar fijo
                break;
            case 'surprised':
                targetPupilScale = 0.5;
                break;
            case 'thinking':
                eyeDirectionY += 0.4;
                eyeDirectionX += 0.4;
                break;
            default: // neutral
                targetPupilScale = isHotMode ? 0.75 : 0; // Dilatación por excitación en Hot Mode
        }
        if (isHotMode && targetPupilScale <= 0) {
            targetPupilScale = 0.65;
        }

        // Aplicar a Morphs de Ojos Detectados
        // Morph List: 'Eye_L_pupil_small', 'Eye_L_iris_small', 'Eye_L_pupil_large', ...

        const applyEyeMorphs = (mesh: THREE.Mesh, prefix: string) => {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

            // PUPILAS
            const idxLarge = mesh.morphTargetDictionary[`${prefix}_pupil_large`] ?? mesh.morphTargetDictionary['Eye_L_pupil_large']; // Fallback a nombre exacto del log
            const idxSmall = mesh.morphTargetDictionary[`${prefix}_pupil_small`] ?? mesh.morphTargetDictionary['Eye_L_pupil_small'];

            if (idxLarge !== undefined && idxSmall !== undefined) {
                if (targetPupilScale > 0) {
                    // Dilatar
                    mesh.morphTargetInfluences[idxLarge] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxLarge], targetPupilScale, 0.1);
                    mesh.morphTargetInfluences[idxSmall] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxSmall], 0, 0.1);
                } else {
                    // Contraer (o normal)
                    mesh.morphTargetInfluences[idxLarge] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxLarge], 0, 0.1);
                    mesh.morphTargetInfluences[idxSmall] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxSmall], Math.abs(targetPupilScale), 0.1);
                }
            }

            // DIRECCIÓN (Si tiene morphs de dirección 'up', 'down')
            const idxUp = mesh.morphTargetDictionary['up'];
            const idxDown = mesh.morphTargetDictionary['down'];
            const idxLeft = mesh.morphTargetDictionary['left'];
            const idxRight = mesh.morphTargetDictionary['right'] ?? mesh.morphTargetDictionary['rightdown'];
            // const idxLeft = mesh.morphTargetDictionary['left']; // Omitir lados para no bizquear con OrbitControls

            // Y API (Interactive)
            if (idxDown !== undefined && eyeDirectionY < 0) {
                mesh.morphTargetInfluences[idxDown] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxDown], Math.abs(eyeDirectionY), 0.1);
                if (idxUp !== undefined) mesh.morphTargetInfluences[idxUp] = 0;
            } else if (idxUp !== undefined && eyeDirectionY > 0) {
                mesh.morphTargetInfluences[idxUp] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxUp], Math.abs(eyeDirectionY), 0.1);
                if (idxDown !== undefined) mesh.morphTargetInfluences[idxDown] = 0;
            }

            // X API (Interactive)
            if (idxLeft !== undefined && eyeDirectionX > 0) {
                mesh.morphTargetInfluences[idxLeft] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxLeft], Math.abs(eyeDirectionX), 0.1);
                if (idxRight !== undefined) mesh.morphTargetInfluences[idxRight] = 0;
            } else if (idxRight !== undefined && eyeDirectionX < 0) {
                mesh.morphTargetInfluences[idxRight] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[idxRight], Math.abs(eyeDirectionX), 0.1);
                if (idxLeft !== undefined) mesh.morphTargetInfluences[idxLeft] = 0;
            }
        };

        if (morphTargetMeshes.length > 0) {
            morphTargetMeshes.forEach(mesh => {
                const name = mesh.name.toLowerCase();
                if (name.includes('eye')) {
                    // Determinar si es L o R para prefix (aunque el modelo parece compartir nombres "Eye_L_" en ambos)
                    // Según logs: Eye_L y Eye_R tienen los MISMOS nombres de morphs (Eye_L_...).
                    applyEyeMorphs(mesh, 'Eye_L');
                }
            });
        }

        // Bedroom eyes: mirada lasciva entrecerrada (0.38) constante en Hot Mode
        const bedroomEyeBase = isHotMode ? 0.38 : 0;
        const blinkValue = THREE.MathUtils.clamp(
            isBlinking.current ? Math.max(blinkCurve, bedroomEyeBase) : bedroomEyeBase,
            0,
            1
        );

        // --- ANÁLISIS DE AUDIO Y DETECCIÓN DE VISEMAS (Vocales) ---
        let currentViseme: string = 'neutral';
        let mouthIntensity = 0;

        if (lipSyncRef.current) {
            // Asegurar que si recibimos el prop audioAnalyser lo pasemos
            if (audioAnalyser && !lipSyncRef.current.hasAnalyser()) {
                lipSyncRef.current.setExternalAnalyser(audioAnalyser);
            }
            lipSyncRef.current.update(delta, isAiSpeaking);
            const lsState = lipSyncRef.current.getState();
            currentViseme = lsState.currentViseme;
            mouthIntensity = lsState.intensity;
        }

        // Si el AI está hablando pero no hay audio analizado, usar ciclo procedimental de visemas (incluyendo cierres bilabiales)
        if (isAiSpeaking && (mouthIntensity < 0.05 || !audioAnalyser)) {
            const cycleSpeed = 7; // velocidad de cambio de visema
            const visemeCycle = ['A', 'M', 'E', 'O', 'M', 'I', 'U', 'P', 'A', 'M', 'E'];
            const cycleIndex = Math.floor(t * cycleSpeed) % visemeCycle.length;
            currentViseme = visemeCycle[cycleIndex];
            if (currentViseme === 'M' || currentViseme === 'P') {
                mouthIntensity = 0;
            } else {
                mouthIntensity = 0.45 + Math.sin(t * 12) * 0.25; // oscilar para que no esté estático
            }
        }

        // Suavizar intensidad final
        if (!autoMouthOpenRef.current) {
            autoMouthOpenRef.current = { value: 0 };
        }
        const lerpSpeed = isAiSpeaking ? 0.35 : 0.18;
        autoMouthOpenRef.current.value = THREE.MathUtils.lerp(
            autoMouthOpenRef.current.value,
            isAiSpeaking ? mouthIntensity : 0,
            lerpSpeed
        );
        const autoMouthOpen = THREE.MathUtils.clamp(autoMouthOpenRef.current.value, 0, 1);

        const hasActiveExternalMorphs = isExternalAnimPlaying && activeClipHasMorphsRef.current;

        // --- JAW BONE LIP SYNC (para modelos sin morph targets de boca) ---
        if (jawBoneRef.current && jawOriginalRotation.current) {
            // ACTIVAR MORPHS JCM DE DAZ
            if (dazJawMorphs.current.length > 0) {
                dazJawMorphs.current.forEach(({ mesh, index }) => {
                    if (mesh.morphTargetInfluences) {
                        mesh.morphTargetInfluences[index] = autoMouthOpen;
                    }
                });
            }

            // Control de Stickers (Emoticones)
            if (stickerHeartRef.current) stickerHeartRef.current.visible = getEmotionIntensity(emotion) > 0.3 && (emotion === 'happy' || emotion === 'excited' || emotion === 'surprised');
            if (stickerVeinRef.current) stickerVeinRef.current.visible = emotion === 'angry';
            if (stickerDropRef.current) stickerDropRef.current.visible = emotion === 'sad' || emotion === 'confused';

            // Actualizar morphs faciales (ojos, cejas, boca base) SOLO si no hay una animación facial externa activa
            if (!hasActiveExternalMorphs) {
                updateFacialExpression(morphTargetMeshes, emotion, isAiSpeaking);
            }

            const boneLerp = isAiSpeaking ? 0.35 : 0.18;
            const topZOffset = autoMouthOpen * 0.015;
            const bottomZOffset = -autoMouthOpen * 0.025;
            const cornerXOffset = autoMouthOpen * 0.008;

            if (lipTopOuterRef.current && lipTopOuterOriginalPos.current) {
                lipTopOuterRef.current.position.z = THREE.MathUtils.lerp(lipTopOuterRef.current.position.z, lipTopOuterOriginalPos.current.z + topZOffset * 0.85, boneLerp);
                lipTopOuterRef.current.position.x = THREE.MathUtils.lerp(lipTopOuterRef.current.position.x, lipTopOuterOriginalPos.current.x + cornerXOffset * 0.9, boneLerp);
            }
            if (lipTopRightOuterRef.current && lipTopRightOuterOriginalPos.current) {
                lipTopRightOuterRef.current.position.z = THREE.MathUtils.lerp(lipTopRightOuterRef.current.position.z, lipTopRightOuterOriginalPos.current.z + topZOffset * 0.85, boneLerp);
                lipTopRightOuterRef.current.position.x = THREE.MathUtils.lerp(lipTopRightOuterRef.current.position.x, lipTopRightOuterOriginalPos.current.x - cornerXOffset * 0.9, boneLerp);
            }
            if (lipBottomOuterRef.current && lipBottomOuterOriginalPos.current) {
                lipBottomOuterRef.current.position.z = THREE.MathUtils.lerp(lipBottomOuterRef.current.position.z, lipBottomOuterOriginalPos.current.z + bottomZOffset * 0.85, boneLerp);
                lipBottomOuterRef.current.position.x = THREE.MathUtils.lerp(lipBottomOuterRef.current.position.x, lipBottomOuterOriginalPos.current.x + cornerXOffset * 0.7, boneLerp);
            }
            if (lipBottomRightOuterRef.current && lipBottomRightOuterOriginalPos.current) {
                lipBottomRightOuterRef.current.position.z = THREE.MathUtils.lerp(lipBottomRightOuterRef.current.position.z, lipBottomRightOuterOriginalPos.current.z + bottomZOffset * 0.85, boneLerp);
                lipBottomRightOuterRef.current.position.x = THREE.MathUtils.lerp(lipBottomRightOuterRef.current.position.x, lipBottomRightOuterOriginalPos.current.x - cornerXOffset * 0.7, boneLerp);
            }
        }

        if (morphTargetMeshes.length > 0 && !hasActiveExternalMorphs) {
            morphTargetMeshes.forEach(mesh => {
                if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

                // Aplicar Parpadeo (Busca nombres comunes de Blink en inglés y japonés PMX)
                ['eyeBlinkLeft', 'blink_L', 'Fcl_EYE_Close_L', 'Blink', 'まばたき', 'ウィンク', 'ウインク'].forEach(key => {
                    const idx = mesh.morphTargetDictionary![key];
                    if (idx !== undefined) mesh.morphTargetInfluences![idx] = blinkValue;
                });
                ['eyeBlinkRight', 'blink_R', 'Fcl_EYE_Close_R', 'まばたき', 'ウィンク右', 'ウインク右'].forEach(key => {
                    const idx = mesh.morphTargetDictionary![key];
                    if (idx !== undefined) mesh.morphTargetInfluences![idx] = blinkValue;
                });

                // Aplicar LipSync
                if (isAiSpeaking) {
                    const mappings: Record<string, string> = {
                        'A': 'viseme_aa',
                        'E': 'viseme_E',
                        'I': 'viseme_I',
                        'O': 'viseme_O',
                        'U': 'viseme_U',
                        'M': 'viseme_PP',
                        'P': 'viseme_PP',
                        'B': 'viseme_PP',
                        'F': 'viseme_FF',
                        'TH': 'viseme_TH',
                        'neutral': 'viseme_PP'
                    };

                    const activeTargetKey = mappings[currentViseme];
                    const isClosureViseme = currentViseme === 'M' || currentViseme === 'P' || currentViseme === 'B' || currentViseme === 'neutral';

                    // Resetear los otros morphs de visemas que no estén activos
                    Object.entries(mappings).forEach(([vowel, key]) => {
                        if (vowel !== currentViseme) {
                            const inactiveIdx = visemeMap[key];
                            if (inactiveIdx !== undefined) {
                                mesh.morphTargetInfluences![inactiveIdx] = THREE.MathUtils.lerp(
                                    mesh.morphTargetInfluences![inactiveIdx],
                                    0,
                                    0.25
                                );
                            }
                        }
                    });

                    const activeIdx = activeTargetKey ? visemeMap[activeTargetKey] : undefined;
                    const mouthIntensityVal = autoMouthOpen * 0.9;
                    const clampedIntensity = THREE.MathUtils.clamp(mouthIntensityVal, 0, 0.85);

                    if (activeIdx !== undefined) {
                        mesh.morphTargetInfluences[activeIdx] = THREE.MathUtils.lerp(
                            mesh.morphTargetInfluences[activeIdx],
                            isClosureViseme ? 0.8 : clampedIntensity,
                            0.3
                        );
                    } else if (!isClosureViseme) {
                        // Fallback a cualquier morph "open" SOLO si NO es un visema de cierre
                        Object.keys(mesh.morphTargetDictionary!).forEach(k => {
                            const kl = k.toLowerCase();
                            if (kl.includes('open') || kl.includes('aa') || kl === 'あ' || kl === 'ワ' || kl === 'わ') {
                                const idx = mesh.morphTargetDictionary![k];
                                mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(
                                    mesh.morphTargetInfluences![idx],
                                    clampedIntensity,
                                    0.3
                                );
                            }
                        });
                    }
                } else {
                    // Cerrar boca suavemente - resetear todos los morphs de visemas
                    const visemeKeys = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U', 'viseme_PP', 'viseme_FF', 'viseme_TH'];
                    visemeKeys.forEach(key => {
                        const idx = visemeMap[key];
                        if (idx !== undefined) {
                            mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(
                                mesh.morphTargetInfluences![idx],
                                0,
                                0.2
                            );
                        }
                    });

                    // También resetear cualquier otro morph de boca que pueda estar activo
                    Object.keys(mesh.morphTargetDictionary!).forEach(k => {
                        const kl = k.toLowerCase();
                        if (kl.includes('open') || kl.includes('aa') || kl === 'あ' || kl === 'ワ' || kl === 'わ' ||
                            (kl.includes('mouth') && !kl.includes('smile') && !kl.includes('frown'))) {
                            const idx = mesh.morphTargetDictionary![k];
                            if (idx !== undefined && mesh.morphTargetInfluences![idx] > 0.01) {
                                mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(
                                    mesh.morphTargetInfluences![idx],
                                    0,
                                    0.15
                                );
                            }
                        }
                    });
                }
            });
        }


        // === 3. APLICAR CAPA DE INTERACCIÓN FÍSICA Y ARRASTRE AL FINAL ===
        // Esto garantiza que el usuario pueda sobreescribir cualquier animación

        // 6. Interaction Layer - Física de arrastre con el cursor
        // (Modifica huesos como la cabeza si el usuario los arrastra)
        if (interactionLayerRef.current) {
            interactionLayerRef.current.updatePhysics(delta);
        }

        // 7. SINCRONIZACIÓN PERFECTA DE CABELLO/CARA (PEGADO AL HEADBONE)
        // CRÍTICO: Se movió aquí al final para que la cabeza ya tenga su transform FINAL
        // después de IK, Custom Poses, y Arrastre (InteractionLayer).
        if (headBoneRef.current && headOrphansRef.current.length > 0) {
            const head = headBoneRef.current;
            head.updateWorldMatrix(true, false);

            const headWPos = new THREE.Vector3();
            const headWQuat = new THREE.Quaternion();
            head.getWorldPosition(headWPos);
            head.getWorldQuaternion(headWQuat);

            headOrphansRef.current.forEach(({ bone, offsetPos, offsetQuat }) => {
                // Calcular posición y rotación mundial objetivo = headBone + offset (en espacio del head)
                const targetWPos = offsetPos.clone().applyQuaternion(headWQuat).add(headWPos);
                const targetWQuat = headWQuat.clone().multiply(offsetQuat);

                // Convertir a espacio local del padre del hueso de cabello
                if (bone.parent) {
                    bone.parent.updateWorldMatrix(true, true);
                    bone.position.copy(bone.parent.worldToLocal(targetWPos.clone()));
                    const parentWQuat = new THREE.Quaternion();
                    bone.parent.getWorldQuaternion(parentWQuat);
                    bone.quaternion.copy(parentWQuat.clone().invert().multiply(targetWQuat));
                } else {
                    bone.position.copy(targetWPos);
                    bone.quaternion.copy(targetWQuat);
                }

                // Registrar la rotación base para JigglePhysics
                bone.userData.ikBaseRotation = bone.quaternion.clone();
            });
        }

        // Mantener escala natural 1.0 para evitar estiramientos o desgarros de malla al bailar o rotar
        if (leftBreastRef.current) leftBreastRef.current.scale.set(1.0, 1.0, 1.0);
        if (rightBreastRef.current) rightBreastRef.current.scale.set(1.0, 1.0, 1.0);
        if (leftButtRef.current) leftButtRef.current.scale.set(1.1, 1.1, 1.1);
        if (rightButtRef.current) rightButtRef.current.scale.set(1.1, 1.1, 1.1);
        // Mantener escala uniforme de piernas para evitar torcedura ("pierna chueca") y descalibración de botas/anillos
        if (leftLegRef.current) leftLegRef.current.scale.set(1.0, 1.0, 1.0);
        if (rightLegRef.current) rightLegRef.current.scale.set(1.0, 1.0, 1.0);

        // =========================================================================
        // 🔧 ZONA DE AJUSTE MANUAL DE ROPA Y ACCESORIOS (Para ti)
        // =========================================================================
        // Ajusta estos valores (en metros) si ves que la ropa o el brillo de los ojos 
        // quedan flotando o "más arriba". 
        // - Valores negativos (ej: -0.05) bajan la pieza 5 centímetros.
        // - Valores positivos (ej: 0.05) la suben 5 centímetros.
        const manualOffsets = {
            pelvis: 0.0,    // Falda y caderas
            spine: 0.0,     // Espalda baja y estómago
            chest: 0.0,     // Pecho y corsé
            breast: 0.0,    // Pechos (jiggle)
            neck: 0.0,      // Collar y accesorios del cuello
            head: 0.0,      // Brillo de ojos, pelo, sombreros
            leg: 0.0,       // Piernas y botas (boots2)
            arm: 0.0        // Brazos y guantes
        };
        // =========================================================================

        // --- GLOBAL ARMATURE SYNC (Position & Rotation Copy with Offsets) ---
        armatureSyncMapRef.current.forEach(({ secondary, primary, offsetPos, offsetQuat }) => {
            primary.updateWorldMatrix(true, true);
            const primWPos = new THREE.Vector3();
            const primWQuat = new THREE.Quaternion();
            primary.getWorldPosition(primWPos);
            primary.getWorldQuaternion(primWQuat);

            // Sumamos el offset original al mundo conservando la pose de binding
            const targetWPos = offsetPos.clone().applyQuaternion(primWQuat).add(primWPos);
            const targetWQuat = primWQuat.clone().multiply(offsetQuat);

            // Aplicar el ajuste manual que configuraste arriba
            const sName = secondary.name.toLowerCase();
            if (sName.includes('pelvis')) targetWPos.y += manualOffsets.pelvis;
            else if (sName.includes('spine')) targetWPos.y += manualOffsets.spine;
            else if (sName.includes('chest')) targetWPos.y += manualOffsets.chest;
            else if (sName.includes('breast')) {
                targetWPos.y += manualOffsets.breast;
                secondary.scale.set(1.0, 1.0, 1.0);
                primary.scale.set(1.0, 1.0, 1.0);
            }
            else if (sName.includes('neck')) targetWPos.y += manualOffsets.neck;
            else if (sName.includes('head') || sName.includes('eye')) targetWPos.y += manualOffsets.head;
            else if (sName.includes('leg') || sName.includes('thigh') || sName.includes('calf') || sName.includes('foot') || sName.includes('toe')) targetWPos.y += manualOffsets.leg;
            else if (sName.includes('arm') || sName.includes('hand') || sName.includes('finger')) targetWPos.y += manualOffsets.arm;

            if (secondary.parent) {
                secondary.parent.updateWorldMatrix(true, true);
                secondary.position.copy(secondary.parent.worldToLocal(targetWPos.clone()));

                const parentWQuat = new THREE.Quaternion();
                secondary.parent.getWorldQuaternion(parentWQuat);
                secondary.quaternion.copy(parentWQuat.clone().invert().multiply(targetWQuat));
            } else {
                secondary.position.copy(targetWPos);
                secondary.quaternion.copy(targetWQuat);
            }

            // Registrar rotación base para JigglePhysics (pechos, faldas, etc.)
            secondary.userData.ikBaseRotation = secondary.quaternion.clone();

            secondary.updateMatrixWorld(true);
        });

        // 8. Actualizar Jiggle Physics (Ropa, Cabello, Pechos)
        // CRÍTICO: Debe correr DESPUÉS de sincronizar el esqueleto y usar la posición mundial real de caderas/espina
        if (jigglePhysicsRef.current) {
            jigglePhysicsRef.current.update(delta, hipsRef.current || spineRef.current || modelRef.current, t);
            // Actualizar matrices de esqueletos para que el rebote físico se refleje inmediatamente en los vértices del SkinnedMesh
            modelRef.current?.traverse((child: any) => {
                if (child.isSkinnedMesh && child.skeleton) {
                    child.skeleton.update();
                }
            });
        }

        // 9. Attach floating boots to the right foot (REMOVED)
        // No debemos trasladar un SkinnedMesh porque ya es deformado por sus huesos.
    });

    // LISTENER PARA COMANDOS DE ROPA Y HOT MODE
    useEffect(() => {
        const handleClothingAction = (event: any) => {
            const action = event.detail?.action;
            if (!action || !clothingManagerRef.current) return;
            console.log('👗 [AvatarViewer3D] Recibido evento de ropa:', action);

            try {
                if (action === 'strip_layer') clothingManagerRef.current.stripLayer();
                else if (action === 'restore_layer') clothingManagerRef.current.restoreLayer();
                else if (action === 'strip_full') clothingManagerRef.current.stripFull();
                else if (action === 'dress_full') clothingManagerRef.current.dressFull();
            } catch (err) {
                console.error("Error ejecutando acción de ropa:", err);
            }
        };

        const handleNovaAction = (event: any) => {
            const act = event.detail?.action;
            console.log('👄 [AvatarViewer3D] Acción:', act);

            // Si se pasa null, 'stop', 'idle' o cadena vacía, detener animación actual y su música
            if (!act || act === 'stop' || act === 'idle') {
                stopCurrentAnimation();
                return;
            }

            // Configurar trigger de animación interna (tongueRef en useFrame)
            if (act === 'suck' || act === 'lick' || act === 'tongue_out' || act === 'deepthroat') {
                if (tongueMeshRef.current && tongueRef.current !== null) {
                    tongueMeshRef.current.morphTargetInfluences![tongueRef.current] = act === 'deepthroat' ? 1.0 : 0.85;
                }
                // Si es deepthroat, inclinar cabeza hacia atrás o adelante con boca abierta
                if (act === 'deepthroat' && headBoneRef.current) {
                    headBoneRef.current.rotation.x = THREE.MathUtils.degToRad(-25);
                }
            } else if (act === 'touch_tits') {
                // Manos acariciando el pecho
                if (rightArmRef.current && leftArmRef.current) {
                    rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(-35), THREE.MathUtils.degToRad(20), THREE.MathUtils.degToRad(-40));
                    leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(-35), THREE.MathUtils.degToRad(-20), THREE.MathUtils.degToRad(40));
                    if (rightForeArmRef.current && leftForeArmRef.current) {
                        rightForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(55), 0, 0);
                        leftForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(55), 0, 0);
                    }
                }
            } else if (act === 'masturbate' || act === 'touch_pussy') {
                // Mano derecha baja a tocarse la entrepierna, mano izquierda al pecho
                if (rightArmRef.current && leftArmRef.current) {
                    rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(-75), THREE.MathUtils.degToRad(-15), THREE.MathUtils.degToRad(-15));
                    if (rightForeArmRef.current) rightForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(35), 0, 0);
                    leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(-30), THREE.MathUtils.degToRad(-15), THREE.MathUtils.degToRad(35));
                    if (leftForeArmRef.current) leftForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(45), 0, 0);
                }
                if (spineRef.current && spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-15), 0, 0))));
                }
            } else if (act === 'spank_self') {
                // Brazo derecho atrás golpeando el glúteo
                if (rightArmRef.current) {
                    rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(-55), THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(40));
                    if (rightForeArmRef.current) rightForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(50), 0, 0);
                }
                if (jigglePhysicsRef.current) {
                    jigglePhysicsRef.current.applyImpulse('butt', new THREE.Vector3(0, -0.015, -0.025));
                }
            } else if (act === 'sensual_dance') {
                // Ondulación sensual
                if (rightArmRef.current && leftArmRef.current) {
                    rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(15), THREE.MathUtils.degToRad(45));
                    leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(-15), THREE.MathUtils.degToRad(-15), THREE.MathUtils.degToRad(-45));
                }
            } else if (act === 'ahegao') {
                if (tongueMeshRef.current && tongueRef.current !== null) {
                    tongueMeshRef.current.morphTargetInfluences![tongueRef.current] = 1.0;
                    // Ahegao eyes
                    if (morphTargetMeshes.length > 0) {
                        morphTargetMeshes.forEach(mesh => {
                            if (mesh.name.toLowerCase().includes('eye')) {
                                // Subir ojos (morph 'up')
                                const upIdx = mesh.morphTargetDictionary!['up'];
                                if (upIdx !== undefined) mesh.morphTargetInfluences![upIdx] = 1.0;
                            }
                        });
                    }
                }
            }

            // Ejecutar la acción resuelta (VMD pack completo o procedural)
            executeAction(act, event.detail?.duration);
        };

        const handleNovaPose = (event: any) => {
            const pose = event.detail?.pose;
            console.log('💃 [AvatarViewer3D] Pose:', pose);

            if (!spineRef.current || !rightArmRef.current || !leftArmRef.current) return;

            // RESET OBLIGATORIO: Mantener la raíz del modelo siempre vertical (0°)
            // NUNCA inclinar modelRef.current porque despega la ropa y los accesorios en espacio 3D
            if (modelRef.current) {
                modelRef.current.rotation.x = 0;
                modelRef.current.rotation.y = 0;
                modelRef.current.rotation.z = 0;
            }

            // Reset básico de la columna y pelvis
            spineRef.current.traverse((child: any) => {
                if (child.isBone) {
                    const n = child.name.toLowerCase();
                    if (n.includes('spine') || n.includes('chest') || n.includes('body') || n.includes('torso')) {
                        if (child.userData.baseQuat) {
                            child.quaternion.copy(child.userData.baseQuat);
                        } else {
                            child.rotation.set(0, 0, 0);
                        }
                    }
                }
            });
            if (spineRef.current.userData.baseQuat) {
                spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat);
            } else {
                spineRef.current.rotation.set(0, 0, 0);
            }

            if (hipsRef.current) {
                if (hipsRef.current.userData.baseQuat) {
                    hipsRef.current.quaternion.copy(hipsRef.current.userData.baseQuat);
                } else {
                    hipsRef.current.rotation.set(0, 0, 0);
                }
            }

            if (leftLegRef.current) {
                if (leftLegRef.current.userData.baseQuat) leftLegRef.current.quaternion.copy(leftLegRef.current.userData.baseQuat);
                else leftLegRef.current.rotation.set(0, 0, 0);
            }
            if (rightLegRef.current) {
                if (rightLegRef.current.userData.baseQuat) rightLegRef.current.quaternion.copy(rightLegRef.current.userData.baseQuat);
                else rightLegRef.current.rotation.set(0, 0, 0);
            }
            if (leftShineRef.current) {
                if (leftShineRef.current.userData.baseQuat) leftShineRef.current.quaternion.copy(leftShineRef.current.userData.baseQuat);
                else leftShineRef.current.rotation.set(0, 0, 0);
            }
            if (rightShineRef.current) {
                if (rightShineRef.current.userData.baseQuat) rightShineRef.current.quaternion.copy(rightShineRef.current.userData.baseQuat);
                else rightShineRef.current.rotation.set(0, 0, 0);
            }

            rightArmRef.current.rotation.set(0, 0, 0);
            leftArmRef.current.rotation.set(0, 0, 0);

            // Forzar brazos relajados (Neutro mejorado)
            const baseDownX = THREE.MathUtils.degToRad(-70);
            const baseDownZ = THREE.MathUtils.degToRad(15);
            rightArmRef.current.rotation.x = baseDownX;
            rightArmRef.current.rotation.z = baseDownZ;
            leftArmRef.current.rotation.x = baseDownX;
            leftArmRef.current.rotation.z = -baseDownZ;

            if (pose === 'lie') {
                currentBasePoseRef.current = 'lie';
            } else {
                currentBasePoseRef.current = 'stand';
            }

            console.log(` Pose cambiada a: ${currentBasePoseRef.current}`);

            if (pose === 'doggy') {
                // Inclinar tronco adelante suavemente (sin rotar el contenedor)
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(35), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(35);
                }
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(45);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(45);
            } else if (pose === 'kneeling') {
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(-20);
                rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(-20);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(-20);
                leftArmRef.current.rotation.z = THREE.MathUtils.degToRad(20);
            } else if (pose === 'spread_legs') {
                rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(-45);
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(-60);
                leftArmRef.current.rotation.z = THREE.MathUtils.degToRad(45);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(-60);
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-15), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(-15);
                }
            } else if (pose === 'arch_back') {
                // Arqueo lumbar sensual: tronco inclinado ligeramente al frente, pecho adelante, brazos apoyados atrás
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-25), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(-25);
                }
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(-45);
                rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(30);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(-45);
                leftArmRef.current.rotation.z = THREE.MathUtils.degToRad(-30);
            } else if (pose === 'titfuck' || pose === 'paizuri') {
                // Pecho erguido, brazos juntando y apretando los pechos
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-10), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(-10);
                }
                rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(-25), THREE.MathUtils.degToRad(25), THREE.MathUtils.degToRad(-35));
                leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(-25), THREE.MathUtils.degToRad(-25), THREE.MathUtils.degToRad(35));
                if (rightForeArmRef.current && leftForeArmRef.current) {
                    rightForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(60), 0, 0);
                    leftForeArmRef.current.rotation.set(THREE.MathUtils.degToRad(60), 0, 0);
                }
            } else if (pose === 'spanking' || pose === 'bent_over') {
                // Inclinada hacia adelante a 45 grados ofreciendo el trasero para nalgadas
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(42), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(42);
                }
                if (hipsRef.current && hipsRef.current.userData.baseQuat) {
                    hipsRef.current.quaternion.copy(hipsRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-15), 0, 0))));
                }
                rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(35), 0, THREE.MathUtils.degToRad(20));
                leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(35), 0, THREE.MathUtils.degToRad(-20));
            } else if (pose === 'feet_present' || pose === 'footjob') {
                // Inclinada hacia atrás con piernas flexionadas elevando los pies hacia la cámara
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-30), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(-30);
                }
                rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(-50), 0, THREE.MathUtils.degToRad(25));
                leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(-50), 0, THREE.MathUtils.degToRad(-25));
                if (rightLegRef.current) rightLegRef.current.rotation.set(THREE.MathUtils.degToRad(-50), THREE.MathUtils.degToRad(15), 0);
                if (leftLegRef.current) leftLegRef.current.rotation.set(THREE.MathUtils.degToRad(-50), THREE.MathUtils.degToRad(-15), 0);
            } else if (pose === 'riding') {
                // Postura de cabalgata pélvica erguida con caderas basculadas
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-10), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(-10);
                }
                rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(20), 0, THREE.MathUtils.degToRad(35));
                leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(20), 0, THREE.MathUtils.degToRad(-35));
            } else if (pose === 'erotic_squat') {
                // En cuclillas abiertas
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(20), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(20);
                }
                rightArmRef.current.rotation.set(THREE.MathUtils.degToRad(-40), 0, THREE.MathUtils.degToRad(30));
                leftArmRef.current.rotation.set(THREE.MathUtils.degToRad(-40), 0, THREE.MathUtils.degToRad(-30));
            } else if (pose === 'missionary' || pose === 'lie' || pose === 'cowgirl') {
                if (spineRef.current.userData.baseQuat) {
                    spineRef.current.quaternion.copy(spineRef.current.userData.baseQuat.clone().multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(THREE.MathUtils.degToRad(-15), 0, 0))));
                } else {
                    spineRef.current.rotation.x = THREE.MathUtils.degToRad(-15);
                }
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(120);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(120);
            }
        };

        // Exponer la función para testear desde la consola
        (window as any).changePose = (poseName: 'stand' | 'sit' | 'lie') => {
            handleNovaPose({ detail: { pose: poseName } });
        };

        const handleNovaTouch = (event: any) => {
            const { target, forceX, forceY, forceZ } = event.detail;
            if (jigglePhysicsRef.current && target) {
                const force = new THREE.Vector3(forceX || 0, forceY || 0, forceZ || 0);
                jigglePhysicsRef.current.applyImpulse(target, force);
                console.log(`👐 [AvatarViewer3D] Física aplicada a ${target}:`, force);
            }
        };

        const handleNovaFluid = (event: any) => {
            const { target, intensity } = event.detail;
            console.log('💦 [AvatarViewer3D] Fluidos en:', target);

            // Determine target bone
            let targetBone: THREE.Object3D | null = null;
            let offset = new THREE.Vector3(0, 0, 0);

            // Mapping targets to bones
            if (target === 'face' || target === 'mouth') {
                targetBone = headBoneRef.current;
                offset.set(0, 0.05, 0.12); // Cara frontal
            } else if (target === 'tits' || target === 'chest') {
                targetBone = spineRef.current;
                offset.set(0, 0.15, 0.15); // Pecho
            } else if (target === 'ass') {
                // Hips suele ser el root o cerca
                targetBone = spineRef.current?.parent || modelRef.current;
                offset.set(0, 0, -0.2); // Trasero
            }

            if (!targetBone) targetBone = modelRef.current;

            if (targetBone) {
                const count = intensity === 'heavy' ? 25 : 10;
                const geo = new THREE.SphereGeometry(0.008, 6, 6); // Gotas pequeñas
                const mat = new THREE.MeshPhysicalMaterial({
                    color: 0xffffff,
                    roughness: 0.1,  // Muy brillante (líquido)
                    metalness: 0.0,
                    transmission: 0.8, // Transparencia lechosa
                    thickness: 0.5,    // Grosor para refracción
                    transparent: true,
                    opacity: 0.9,
                    side: THREE.DoubleSide
                });

                for (let i = 0; i < count; i++) {
                    const mesh = new THREE.Mesh(geo, mat);

                    // Random spread
                    const spread = 0.08;
                    mesh.position.copy(offset).add(new THREE.Vector3(
                        (Math.random() - 0.5) * spread,
                        (Math.random() - 0.5) * spread,
                        (Math.random() - 0.5) * 0.02
                    ));

                    // Add to bone
                    targetBone.add(mesh);

                    // Track for animation
                    fluidParticlesRef.current.push({
                        mesh,
                        life: 1.0,
                        velocity: new THREE.Vector3(0, -0.001 - Math.random() * 0.002, 0) // Goteo
                    });
                }
            }
        };

        window.addEventListener('nova-clothing-action', handleClothingAction);
        window.addEventListener('nova-action', handleNovaAction);
        window.addEventListener('nova-stop-animation', stopCurrentAnimation);
        window.addEventListener('nova-pose', handleNovaPose);
        window.addEventListener('nova-fluid', handleNovaFluid);
        window.addEventListener('nova-touch', handleNovaTouch);

        const handleNovaDance = (event: any) => {
            const style = event.detail?.style;
            if (style && animationManagerRef.current) {
                console.log(`💃 [AvatarViewer3D] Reproduciendo baile: ${style}`);
                animationManagerRef.current.play(style, { loop: false, blendDuration: 0.5, priority: 8, onComplete: () => stopCurrentAnimation() });
            }
        };
        const handleNovaStopDance = () => {
            console.log(`🛑 [AvatarViewer3D] Deteniendo baile y volviendo a Idle`);
            stopCurrentAnimation();
        };
        window.addEventListener('nova-dance', handleNovaDance);
        window.addEventListener('nova-stop-dance', handleNovaStopDance);

        const handleNovaWalkTo = (event: any) => {
            const { x, z, y } = event.detail || {};
            if (x !== undefined && z !== undefined) {
                target3DPos.current.set(x, y || 0, z);
                isNavigating3D.current = true;
                console.log(`🚶 [AvatarViewer3D] Navegando 3D hacia: (${x}, ${z})`);
            }
        };
        window.addEventListener('nova-walk-to', handleNovaWalkTo);

        return () => {
            window.removeEventListener('nova-clothing-action', handleClothingAction);
            window.removeEventListener('nova-action', handleNovaAction);
            window.removeEventListener('nova-stop-animation', stopCurrentAnimation);
            window.removeEventListener('nova-pose', handleNovaPose);
            window.removeEventListener('nova-fluid', handleNovaFluid);
            window.removeEventListener('nova-touch', handleNovaTouch);
            window.removeEventListener('nova-dance', handleNovaDance);
            window.removeEventListener('nova-stop-dance', handleNovaStopDance);
            window.removeEventListener('nova-walk-to', handleNovaWalkTo);
        };
    }, []);

    // Efecto para escuchar el trigger de reset de físicas
    useEffect(() => {
        if (resetPhysicsTrigger > 0 && interactionLayerRef.current) {
            interactionLayerRef.current.resetPhysics();
        }
    }, [resetPhysicsTrigger]);

    // LISTENER PARA INTERACCIONES CON EL AVATAR
    useEffect(() => {
        const handleInteraction = (event: any) => {
            const { zone, action } = event.detail;

            if (action === 'blush_smile') {
                console.log('💕 Tocaste mi cabeza!');
                if (animationManagerRef.current?.hasAnimation('Happy')) {
                    animationManagerRef.current.play('Happy', { priority: 8, loop: false, blendDuration: 0.5 });
                }
            } else if (action === 'wave') {
                console.log('👋 Respondiendo saludo!');
                if (animationManagerRef.current?.hasAnimation('Wave')) {
                    animationManagerRef.current.play('Wave', { priority: 7, loop: false });
                }
            } else if (action === 'look_at_cursor') {
                console.log('👀 Mirando al cursor...');
            }
        };

        window.addEventListener('avatar-interaction', handleInteraction);
        return () => window.removeEventListener('avatar-interaction', handleInteraction);
    }, []);

    // LISTENER PARA COMANDOS GLOBALES
    useEffect(() => {
        const handleCommand = (event: any) => {
            const { command, params } = event.detail;

            switch (command) {
                case 'play_animation':
                    animationManagerRef.current?.play(params.name, params.config);
                    break;
                case 'set_mood':
                    moodSystemRef.current?.setMood(params.mood, params.intensity);
                    break;
                case 'apply_palette':
                    materialManagerRef.current?.applyPalette(params.palette);
                    break;
                case 'toggle_ik':
                    if (params.enabled) {
                        ikControllerRef.current?.setLookTarget(params.target, true);
                    } else {
                        ikControllerRef.current?.disableLookAt();
                    }
                    break;
            }
        };

        window.addEventListener('avatar-command', handleCommand);
        return () => window.removeEventListener('avatar-command', handleCommand);
    }, []);

    // AUDIO REACTIVITY (Beat Listener & Vibe)
    useEffect(() => {
        const handleBeat = (e: any) => {
            // e.detail.intensity es 0.0 - 1.0
            musicEnergyRef.current = e.detail.intensity;
        };
        window.addEventListener('nova-beat', handleBeat);
        return () => window.removeEventListener('nova-beat', handleBeat);
    }, []);

    useFrame((state, delta) => {
        const isExternalAnimPlaying = (animationManagerRef.current?.isPlayingExternal() ?? false) || externalAnimPlayingRef.current;
        // Decay gradual del impacto musical (CRITICO para que deje de moverse)
        musicEnergyRef.current = THREE.MathUtils.lerp(musicEnergyRef.current, 0, delta * 3);

        // Si hay energía musical, modular animación y aplicar baile procedural
        // Siempre ejecutamos la interpolación para que regresen suavemente a 0 cuando se apague
        if (mixerRef.current) {
            const targetTimeScale = musicEnergyRef.current > 0.01 ? 1.0 + musicEnergyRef.current * 0.3 : 1.0;
            mixerRef.current.timeScale = THREE.MathUtils.lerp(mixerRef.current.timeScale, targetTimeScale, 0.1);
        }

        // Incrementar tiempo de baile dinámicamente según la intensidad de la música
        danceTimeRef.current += delta * (1 + musicEnergyRef.current * 8);
        const t = danceTimeRef.current;
        const energy = musicEnergyRef.current; // Multiplicador de amplitud

        // PIERNAS Y RODILLAS: Paso de marcha alternado (más lento, subiendo la rodilla)
        // Ritmo reducido a la mitad (cada 2 tiempos)
        const stepSpeed = t * 0.25;

        // Osciladores perfectamente alternados
        const leftStep = Math.sin(stepSpeed);
        const rightStep = -Math.sin(stepSpeed); // Fase exactamente opuesta

        // Math.max(0, osc) asegura que la pierna solo suba hacia adelante y repose cuando le toca estar atrás
        // Multiplicador 0.4 para que levante la pierna notoriamente
        const leftKneeUp = Math.max(0, leftStep) * 0.4 * energy;
        const rightKneeUp = Math.max(0, rightStep) * 0.4 * energy;

        // Helper para aplicar offsets transitorios sin corromper la rotación base
        const applyTransientOffset = (bone: THREE.Object3D, axis: 'x' | 'y' | 'z', offset: number) => {
            const key = `danceOffset_${axis}`;
            if (bone.userData[key]) {
                bone.rotation[axis] -= bone.userData[key];
            }
            if (Math.abs(offset) > 0.0001) {
                bone.rotation[axis] += offset;
                bone.userData[key] = offset;
            } else {
                delete bone.userData[key];
            }
        };

        // Helper para aplicar offsets de POSICIÓN (para brincos/rebotes)
        const applyTransientPositionOffset = (bone: THREE.Object3D, axis: 'x' | 'y' | 'z', offset: number) => {
            const key = `dancePosOffset_${axis}`;
            if (bone.userData[key]) {
                bone.position[axis] -= bone.userData[key];
            }
            if (Math.abs(offset) > 0.0001) {
                bone.position[axis] += offset;
                bone.userData[key] = offset;
            } else {
                delete bone.userData[key];
            }
        };

        // Solo calcular y aplicar movimiento rítmico si realmente hay energía musical activa
        if (energy > 0.005) {
            // Piernas y caderas: SOLO SI NO hay una animación externa o VMD activa (evita pisar o patear piernas animadas)
            if (!isExternalAnimPlaying && !hasIKTracksRef.current) {
                if (leftLegRef.current) applyTransientOffset(leftLegRef.current, 'x', -leftKneeUp);
                if (rightLegRef.current) applyTransientOffset(rightLegRef.current, 'x', -rightKneeUp);
                if (leftShineRef.current) applyTransientOffset(leftShineRef.current, 'x', leftKneeUp * 1.5);
                if (rightShineRef.current) applyTransientOffset(rightShineRef.current, 'x', rightKneeUp * 1.5);

                // Caderas: Balanceo de rotación más lento (igual que las piernas)
                if (hipsRef.current) {
                    const swayRot = Math.cos(stepSpeed) * 0.04 * energy;
                    applyTransientOffset(hipsRef.current, 'z', swayRot);
                    applyTransientOffset(hipsRef.current, 'y', swayRot * 0.5);
                }
            } else {
                // Limpiar offsets de piernas/caderas si hay animación externa
                if (leftLegRef.current) applyTransientOffset(leftLegRef.current, 'x', 0);
                if (rightLegRef.current) applyTransientOffset(rightLegRef.current, 'x', 0);
                if (leftShineRef.current) applyTransientOffset(leftShineRef.current, 'x', 0);
                if (rightShineRef.current) applyTransientOffset(rightShineRef.current, 'x', 0);
                if (hipsRef.current) {
                    applyTransientOffset(hipsRef.current, 'z', 0);
                    applyTransientOffset(hipsRef.current, 'y', 0);
                }
            }

            // Espalda/Torso: Sigue a las caderas con desfase (solo si no hay animación externa)
            if (spineRef.current && !isExternalAnimPlaying) {
                applyTransientOffset(spineRef.current, 'z', Math.sin(stepSpeed) * 0.02 * energy);
                applyTransientOffset(spineRef.current, 'x', Math.cos(stepSpeed * 2.0) * 0.02 * energy);
            }

            // Hombros / Brazos / Manos: solo si no hay animación externa
            if (!isExternalAnimPlaying) {
                if (leftArmRef.current && rightArmRef.current) {
                    const armShimmy = Math.sin(t * 1.5) * 0.01 * energy;
                    const shoulderShrug = Math.abs(Math.sin(t * 1.0)) * 0.015 * energy;

                    applyTransientOffset(leftArmRef.current, 'z', shoulderShrug);
                    applyTransientOffset(rightArmRef.current, 'z', -shoulderShrug);

                    applyTransientPositionOffset(leftArmRef.current, 'x', armShimmy);
                    applyTransientPositionOffset(rightArmRef.current, 'x', armShimmy);
                }

                // Antebrazos y Muñecas
                if (leftForeArmRef.current) {
                    applyTransientOffset(leftForeArmRef.current, 'x', Math.sin(t - 0.5) * 0.2 * energy);
                }
                if (rightForeArmRef.current) {
                    applyTransientOffset(rightForeArmRef.current, 'x', Math.sin(t - 0.5 + Math.PI) * 0.2 * energy);
                }

                if (leftHandRef.current) {
                    applyTransientOffset(leftHandRef.current, 'z', Math.sin(t - 1.0) * 0.3 * energy);
                }
                if (rightHandRef.current) {
                    applyTransientOffset(rightHandRef.current, 'z', Math.sin(t - 1.0 + Math.PI) * 0.3 * energy);
                }
            }
        } else {
            // Limpieza inmediata de offsets residuales cuando la música para
            if (leftHandRef.current) applyTransientOffset(leftHandRef.current, 'z', 0);
            if (rightHandRef.current) applyTransientOffset(rightHandRef.current, 'z', 0);
            if (leftForeArmRef.current) applyTransientOffset(leftForeArmRef.current, 'x', 0);
            if (rightForeArmRef.current) applyTransientOffset(rightForeArmRef.current, 'x', 0);
            if (leftArmRef.current) {
                applyTransientOffset(leftArmRef.current, 'z', 0);
                applyTransientPositionOffset(leftArmRef.current, 'x', 0);
            }
            if (rightArmRef.current) {
                applyTransientOffset(rightArmRef.current, 'z', 0);
                applyTransientPositionOffset(rightArmRef.current, 'x', 0);
            }
            if (spineRef.current) {
                applyTransientOffset(spineRef.current, 'z', 0);
                applyTransientOffset(spineRef.current, 'x', 0);
            }
            if (hipsRef.current) {
                applyTransientOffset(hipsRef.current, 'z', 0);
                applyTransientOffset(hipsRef.current, 'y', 0);
            }
            if (leftLegRef.current) applyTransientOffset(leftLegRef.current, 'x', 0);
            if (rightLegRef.current) applyTransientOffset(rightLegRef.current, 'x', 0);
            if (leftShineRef.current) applyTransientOffset(leftShineRef.current, 'x', 0);
            if (rightShineRef.current) applyTransientOffset(rightShineRef.current, 'x', 0);
        }

        // --- 4. FLUID PARTICLE ANIMATION ---
        if (fluidParticlesRef.current.length > 0) {
            for (let i = fluidParticlesRef.current.length - 1; i >= 0; i--) {
                const p = fluidParticlesRef.current[i];
                p.life -= delta * 0.5; // Fade out slowly

                // Drip movement
                p.mesh.position.add(p.velocity);

                // Opacity fade
                if (p.mesh.material instanceof THREE.Material) {
                    // @ts-ignore
                    if (p.mesh.material.opacity) p.mesh.material.opacity = Math.min(0.9, p.life);
                }

                if (p.life <= 0) {
                    // Remove from scene and array
                    p.mesh.parent?.remove(p.mesh);
                    if (p.mesh.geometry) p.mesh.geometry.dispose();
                    if (p.mesh.material) (p.mesh.material as THREE.Material).dispose();
                    fluidParticlesRef.current.splice(i, 1);
                }
            }
        }
    });

    // Listener de físicas Jiggle y estiramiento de masa en tiempo real para interacción AR 3D
    useEffect(() => {
        const jiggleHandler = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            if (detail?.part) {
                const partName = detail.part;
                const isBack = partName.toLowerCase().includes('butt') || partName.toLowerCase().includes('anus');
                
                // 1. Aplicar Impulso Físico Elástico Aislado a la Masa Suave (Soft-flesh Jiggle)
                if (jigglePhysicsRef.current) {
                    let jiggleTarget = '';
                    if (partName === 'leftBreast') jiggleTarget = 'breast.l';
                    else if (partName === 'rightBreast') jiggleTarget = 'breast.r';
                    else if (partName === 'leftButt' || partName === 'anus') jiggleTarget = 'ass.l';
                    else if (partName === 'rightButt') jiggleTarget = 'ass.r';

                    if (jiggleTarget) {
                        const impulse = new THREE.Vector3(
                            (Math.random() - 0.5) * 0.4,
                            (Math.random() - 0.5) * 0.4,
                            isBack ? 0.8 : -0.8
                        );
                        jigglePhysicsRef.current.applyImpulse(jiggleTarget, impulse);
                    }
                }

                // 2. Aplicar Deformación/Estiramiento Directo de Masa Mamaria / Glúteos (Agarrar en VR/AR)
                if (detail.screenX && detail.screenY) {
                    const canvas = document.querySelector('canvas');
                    if (canvas) {
                        const evtDown = new PointerEvent('pointerdown', {
                            clientX: detail.screenX,
                            clientY: detail.screenY,
                            bubbles: true,
                            cancelable: true,
                            button: 0,
                            buttons: 1,
                            pointerId: 1
                        });
                        const evtMove = new PointerEvent('pointermove', {
                            clientX: detail.screenX + (Math.random() - 0.5) * 30,
                            clientY: detail.screenY + (Math.random() - 0.5) * 30,
                            bubbles: true,
                            cancelable: true,
                            button: 0,
                            buttons: 1,
                            pointerId: 1
                        });
                        try {
                            canvas.dispatchEvent(evtDown);
                            canvas.dispatchEvent(evtMove);
                        } catch (err) {
                            // Silencioso
                        }
                    }
                }
            }
        };
        window.addEventListener('nova-jiggle-trigger', jiggleHandler);
        return () => window.removeEventListener('nova-jiggle-trigger', jiggleHandler);
    }, []);

    // Manejo de eventos de interacción física y envío al systemBus/geminiService
    const handleAvatarInteract = (partName: string, interactionType: string, type?: 'sensory' | 'pose', tool?: string) => {
        // Evitamos spamear eventos, solo enviamos 'pull' o 'grab' o 'hit'
        if (interactionType === 'grab' || interactionType === 'pull' || interactionType === 'hit') {

            // Si es un golpe, aplicar físicas de impacto instantáneo (Spank/Hit)
            if (interactionType === 'hit' && jigglePhysicsRef.current) {
                const isBack = partName.toLowerCase().includes('butt') || partName.toLowerCase().includes('anus');
                // Golpe hacia adelante o hacia atrás dependiendo de la zona
                const impulse = new THREE.Vector3(0, 0, isBack ? 2.5 : -2.5);

                // Mapear el hitbox a los nombres de huesos físicos
                let jiggleTarget = partName;
                if (partName === 'leftButt' || partName === 'anus') jiggleTarget = 'ass.l';
                if (partName === 'rightButt') jiggleTarget = 'ass.r';
                if (partName === 'leftBreast') jiggleTarget = 'breast.l';
                if (partName === 'rightBreast') jiggleTarget = 'breast.r';
                if (partName === 'mouth' || partName === 'head') jiggleTarget = 'head';

                jigglePhysicsRef.current.applyImpulse(jiggleTarget, impulse);
            }

            // Si el punto es solo para 'pose' (mover/agitar miembros) y estamos usando la mano, NO enviamos el evento al cerebro (es silencioso).
            if (type === 'pose' && currentTool === 'hand') {
                return; // Solo se mueven las físicas
            }

            const event = new CustomEvent('nova-physical-interaction', {
                detail: { part: partName, action: interactionType, isBoldMode: isHotMode, tool: currentTool }
            });
            window.dispatchEvent(event);
        }
    };

    // Escala y posición base: PMX suele venir en escala de unidades MMD (1/10 de metro aprox),
    // mientras que GLTF de Blender usa escala métrica estándar (scale=2.5, pos=[0, -1.5, 0]).
    // Para PMX, scale=0.25 suele ser 1.8m de altura.
    const modelScale = isPMX ? 0.22 : 2.5;
    const modelPosition: [number, number, number] = isPMX ? [0, -1.5, 0] : [0, -1.5, 0];

    return (
        <group>
            <primitive
                ref={modelRef}
                object={modelData.scene}
                scale={modelScale}
                position={modelPosition}
            />
            <AvatarInteractionLayer
                ref={interactionLayerRef}
                bones={{
                    head: headBoneRef.current,
                    leftBreast: leftBreastRef.current,
                    rightBreast: rightBreastRef.current,
                    leftButt: leftButtRef.current,
                    rightButt: rightButtRef.current,
                    leftArm: leftArmRef.current,
                    rightArm: rightArmRef.current,
                    leftForeArm: leftForeArmRef.current,
                    rightForeArm: rightForeArmRef.current,
                    leftHand: leftHandRef.current,
                    rightHand: rightHandRef.current,
                    leftLeg: leftLegRef.current,
                    rightLeg: rightLegRef.current,
                    leftFoot: leftFootRef.current,
                    rightFoot: rightFootRef.current,
                    hips: hipsRef.current as THREE.Bone,
                    spine: spineRef.current as THREE.Bone,
                    vagina: vaginaRef.current || (hipsRef.current as THREE.Bone),
                    anus: anusRef.current || (hipsRef.current as THREE.Bone),
                    lips: lipsRef.current || headBoneRef.current
                }}
                currentTool={currentTool}
                onInteract={handleAvatarInteract}
                isBoldMode={isHotMode}
                showDebugZones={showDebugZones}
                dragSensitivity={physicsSensitivity}
                maxAngle={physicsMaxAngle}
            />
        </group>
    );
}

/**
 * Loader específico para modelos GLTF/GLB
 */
function GLTFAvatarModel({ modelUrl, ...props }: {
    modelUrl: string;
    emotion: Emotion;
    action?: string | null;
    audioElement: HTMLAudioElement | null;
    isAiSpeaking: boolean;
    isHotMode?: boolean;
    hairColor?: string;
    audioAnalyser: AnalyserNode | null;
    currentTool: InteractionTool;
    showDebugZones: boolean;
    physicsSensitivity: number;
    physicsMaxAngle: number;
    resetPhysicsTrigger: number;
}) {
    const gltf = useLoader(GLTFLoader, modelUrl);
    const modelData = useMemo(() => ({
        scene: gltf.scene,
        animations: gltf.animations || []
    }), [gltf.scene, gltf.animations]);

    return <AvatarModelInner modelData={modelData} modelUrl={modelUrl} isPMX={false} {...props} />;
}

/**
 * Loader específico para modelos PMX / PMD / ZIP
 */
function PMXAvatarModel({ modelUrl, ...props }: {
    modelUrl: string;
    emotion: Emotion;
    action?: string | null;
    audioElement: HTMLAudioElement | null;
    isAiSpeaking: boolean;
    isHotMode?: boolean;
    hairColor?: string;
    audioAnalyser: AnalyserNode | null;
    currentTool: InteractionTool;
    showDebugZones: boolean;
    physicsSensitivity: number;
    physicsMaxAngle: number;
    resetPhysicsTrigger: number;
}) {
    const [pmxResult, setPmxResult] = useState<PMXModelResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        let isCancelled = false;
        console.log(`🌸 [PMXAvatarModel] Iniciando carga de modelo PMX/ZIP: ${modelUrl}`);

        loadPMXModel(modelUrl)
            .then(result => {
                if (!isCancelled) {
                    setPmxResult(result);
                    if (typeof window !== 'undefined') {
                        (window as any).__lastLoadedIsPMX = result.isPMX;
                    }
                }
            })
            .catch(err => {
                if (!isCancelled) {
                    console.error('❌ Error cargando modelo:', err);
                    setError(err.message || 'Error al procesar modelo 3D');
                }
            });

        return () => {
            isCancelled = true;
        };
    }, [modelUrl]);

    const modelData = useMemo(() => {
        if (!pmxResult) return null;
        return {
            scene: pmxResult.scene,
            animations: pmxResult.animations || []
        };
    }, [pmxResult]);

    if (error) {
        return (
            <Html center>
                <div className="bg-red-950/80 border border-red-500/50 p-4 rounded-xl text-red-200 text-xs backdrop-blur-md">
                    ⚠️ Error al cargar modelo: {error}
                </div>
            </Html>
        );
    }

    if (!modelData) {
        return <FallbackAvatar text="Cargando modelo 3D..." />;
    }

    return <AvatarModelInner modelData={modelData} modelUrl={modelUrl} isPMX={pmxResult?.isPMX ?? true} {...props} />;
}

/**
 * Selector inteligente de loader según la extensión o formato del modelo
 */
function AvatarModel(props: {
    modelUrl: string;
    emotion: Emotion;
    action?: string | null;
    audioElement: HTMLAudioElement | null;
    isAiSpeaking: boolean;
    isHotMode?: boolean;
    hairColor?: string;
    audioAnalyser: AnalyserNode | null;
    currentTool: InteractionTool;
    showDebugZones: boolean;
    physicsSensitivity: number;
    physicsMaxAngle: number;
    resetPhysicsTrigger: number;
}) {
    const safeModelUrl = props.modelUrl || '/models/grokani_lipsync.glb';
    const lowerUrl = safeModelUrl.toLowerCase();

    // Detección estricta del tipo de modelo 3D: si es GLB/GLTF directo jamás debe pasar a MMDLoader
    const isDirectGLTF = (lowerUrl.includes('.glb') || lowerUrl.includes('.gltf') || lowerUrl.includes('.vrm')) && !lowerUrl.includes('.zip') && !lowerUrl.includes('.rar') && !lowerUrl.includes('.7z');
    const isArchiveOrCustom = !isDirectGLTF && (lowerUrl.includes('.pmx') || lowerUrl.includes('.pmd') || lowerUrl.includes('.zip') || lowerUrl.includes('.rar') || lowerUrl.includes('.7z') || lowerUrl.includes('.fbx'));

    if (isArchiveOrCustom) {
        return <PMXAvatarModel {...props} modelUrl={safeModelUrl} />;
    }

    return <GLTFAvatarModel {...props} modelUrl={safeModelUrl} />;
}

function FallbackAvatar({ text = 'Cargando a Nova...' }: { text?: string }) {
    const { progress } = useProgress();
    return (
        <Html center>
            <div className="flex flex-col items-center justify-center p-5 bg-[#0a0a14]/90 backdrop-blur-xl rounded-2xl border border-primary/40 shadow-[0_0_30px_rgba(19,19,236,0.3)] text-center min-w-[220px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3 shadow-lg"></div>
                <span className="text-sm font-bold text-white tracking-wide">{text}</span>
                <span className="text-xs text-cyan-400 font-semibold mt-1.5">{progress > 0 ? `${progress.toFixed(0)}%` : 'Descargando modelo 3D...'}</span>
            </div>
        </Html>
    );
}

// --- CAMERA MANAGER ---
function CameraManager({ viewMode, controlsRef }: { viewMode: string, controlsRef: React.RefObject<any> }) {
    const { camera } = useThree();
    const isTransitioning = useRef(false);
    const lastViewMode = useRef(viewMode);

    // Cinemática VMD
    const vmdCameraMixerRef = useRef<THREE.AnimationMixer | null>(null);
    const cameraTargetRef = useRef<THREE.Object3D>(new THREE.Object3D());
    const isVmdCameraActive = useRef<boolean>(false);
    const defaultFovRef = useRef<number>(camera instanceof THREE.PerspectiveCamera ? camera.fov : 50);
    // Guardar posición y target previos a la cinemática VMD para restaurarlos con precisión al terminar
    const savedPreVmdState = useRef<{ pos: THREE.Vector3; target: THREE.Vector3 } | null>(null);

    // Coordenadas objetivo para cada modo
    const targets: Record<string, { pos: THREE.Vector3, look: THREE.Vector3 }> = {
        default: { pos: new THREE.Vector3(0, 3.2, 4.2), look: new THREE.Vector3(0, 2.2, 0) },
        face: { pos: new THREE.Vector3(0, 2.75, 1.6), look: new THREE.Vector3(0, 2.65, 0) },
        body: { pos: new THREE.Vector3(0, 1.5, 2.6), look: new THREE.Vector3(0, 1.1, 0) },
        full: { pos: new THREE.Vector3(0, 1.4, 3.8), look: new THREE.Vector3(0, 1.0, 0) },
        selfie: { pos: new THREE.Vector3(0.4, 2.8, 1.0), look: new THREE.Vector3(0, 2.6, 0) },
        back: { pos: new THREE.Vector3(0, 1.6, -3.8), look: new THREE.Vector3(0, 1.5, 0) },
    };

    const [currentViewMode, setCurrentViewMode] = useState<string>(viewMode || 'default');

    // Adjuntar el objeto target al camera para que mixer encuentre target.position
    useEffect(() => {
        cameraTargetRef.current.name = 'target';
        camera.add(cameraTargetRef.current);
        return () => {
            camera.remove(cameraTargetRef.current);
        };
    }, [camera]);

    // Listener para eventos de cámara VMD
    useEffect(() => {
        const handlePlay = (e: Event) => {
            const { clip } = (e as CustomEvent<{ clip: THREE.AnimationClip; name: string }>).detail;
            if (!clip) return;

            // Guardar posición de cámara y target previos para volver al terminar
            const currentTarget = controlsRef.current?.target 
                ? controlsRef.current.target.clone() 
                : (targets[currentViewMode]?.look?.clone() || targets.default.look.clone());
            savedPreVmdState.current = {
                pos: camera.position.clone(),
                target: currentTarget
            };

            if (vmdCameraMixerRef.current) {
                vmdCameraMixerRef.current.stopAllAction();
            }

            vmdCameraMixerRef.current = new THREE.AnimationMixer(camera);
            const action = vmdCameraMixerRef.current.clipAction(clip);
            action.reset();
            action.setLoop(THREE.LoopRepeat, Infinity);
            action.play();

            isVmdCameraActive.current = true;
            isTransitioning.current = false;
            if (controlsRef.current) {
                controlsRef.current.enabled = false; // Pausar OrbitControls durante cinemática
            }
            console.log(`🎥 [CameraManager] Cinemática iniciada: ${clip.name} (${clip.duration.toFixed(1)}s). Posición inicial guardada.`);
        };

        const handleStop = () => {
            if (isVmdCameraActive.current) {
                if (vmdCameraMixerRef.current) {
                    vmdCameraMixerRef.current.stopAllAction();
                    vmdCameraMixerRef.current = null;
                }
                isVmdCameraActive.current = false;

                if (camera instanceof THREE.PerspectiveCamera) {
                    camera.fov = defaultFovRef.current;
                    camera.updateProjectionMatrix();
                }

                // Restaurar el control de OrbitControls y suavizar de vuelta a la vista guardada o actual
                if (controlsRef.current) {
                    controlsRef.current.enabled = true;
                }

                // Activar transición de regreso suave
                isTransitioning.current = true;
                setTimeout(() => {
                    isTransitioning.current = false;
                    savedPreVmdState.current = null;
                }, 2500);

                console.log('🎥 [CameraManager] Cinemática detenida, restaurando cámara suavemente a la posición original.');
            }
        };

        window.addEventListener('nova-vmd-camera-play', handlePlay);
        window.addEventListener('nova-vmd-camera-stop', handleStop);

        return () => {
            window.removeEventListener('nova-vmd-camera-play', handlePlay);
            window.removeEventListener('nova-vmd-camera-stop', handleStop);
            handleStop();
        };
    }, [camera, controlsRef, currentViewMode]);

    // Sincronizar con prop viewMode
    useEffect(() => {
        if (viewMode && viewMode !== currentViewMode) {
            setCurrentViewMode(viewMode);
        }
    }, [viewMode]);

    // Listener para eventos de cámara disparados por comandos de voz/texto y Gemini
    useEffect(() => {
        const handlePresetEvent = (e: Event) => {
            const detail = (e as CustomEvent).detail;
            const preset = (detail?.preset || detail?.view || '').toLowerCase().trim();
            if (preset && targets[preset]) {
                console.log(`🎥 [CameraManager] Preset de cámara recibido vía evento: "${preset}"`);
                setCurrentViewMode(preset);
                isTransitioning.current = true;
            }
        };

        window.addEventListener('nova-camera-preset', handlePresetEvent);
        window.addEventListener('aiko-camera-view', handlePresetEvent);
        window.addEventListener('aiko-camera-preset', handlePresetEvent);

        return () => {
            window.removeEventListener('nova-camera-preset', handlePresetEvent);
            window.removeEventListener('aiko-camera-view', handlePresetEvent);
            window.removeEventListener('aiko-camera-preset', handlePresetEvent);
        };
    }, []);

    // Detectar cambio de modo de vista
    useEffect(() => {
        if (!isVmdCameraActive.current) {
            isTransitioning.current = true;
            const timer = setTimeout(() => { isTransitioning.current = false; }, 2500);
            return () => clearTimeout(timer);
        }
    }, [currentViewMode]);

    // Detectar interacción del usuario para cancelar transición
    useEffect(() => {
        const controls = controlsRef.current;
        if (!controls) return;

        const onStart = () => {
            // Si el usuario toca los controles, paramos la transición automática
            isTransitioning.current = false;
            // Si el usuario arrastra manualmente la pantalla mientras la cámara cinemática corre, liberar control
            if (isVmdCameraActive.current) {
                window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
            }
        };

        controls.addEventListener('start', onStart);
        return () => controls.removeEventListener('start', onStart);
    }, [controlsRef]);

    useFrame((state, delta) => {
        // 1. Si la cámara cinemática VMD está activa, tiene control total
        if (isVmdCameraActive.current && vmdCameraMixerRef.current) {
            vmdCameraMixerRef.current.update(delta);
            if (camera instanceof THREE.PerspectiveCamera) {
                camera.updateProjectionMatrix();
            }
            if (controlsRef.current) {
                controlsRef.current.target.copy(cameraTargetRef.current.position);
            }
            return;
        }

        // 2. Transición suave de modos de vista o restauración tras cinemática
        if (!isTransitioning.current) return;

        // Si tenemos un estado guardado antes de una cinemática VMD, restaurar hacia ese estado exacto
        const target = savedPreVmdState.current 
            ? { pos: savedPreVmdState.current.pos, look: savedPreVmdState.current.target } 
            : (targets[currentViewMode] || targets.default);
        const lerpFactor = 5.0 * delta; // Velocidad de transición

        // Calcular distancias
        const distPos = camera.position.distanceTo(target.pos);
        const distLook = controlsRef.current ? controlsRef.current.target.distanceTo(target.look) : 0;

        // Si estamos muy cerca, terminamos la transición para ahorrar recursos y liberar control
        if (distPos < 0.05 && distLook < 0.05) {
            isTransitioning.current = false;
            savedPreVmdState.current = null;
        }

        // Mover cámara
        camera.position.lerp(target.pos, lerpFactor);

        // Mover target de los controles
        if (controlsRef.current) {
            controlsRef.current.target.lerp(target.look, lerpFactor);
            controlsRef.current.update();
        }
    });

    return null;
}

const AvatarViewer3D: React.FC<AvatarViewer3DProps> = ({
    avatar,
    modelUrl,
    emotion = 'neutral',
    activeAction = null,
    action = null,
    audioElement = null,
    isAiSpeaking = false,
    disableControls = false,
    viewMode = 'default',
    isHotMode = false,
    hairColor = '#e2b464',
    audioAnalyser = null,
    personalityMode
}) => {
    const effectiveMode: NovaPersonalityMode = personalityMode || avatar?.personalityMode || (isHotMode ? 'nympho' : 'companion');
    const modeLights = MODE_3D_LIGHTS[effectiveMode] || MODE_3D_LIGHTS.companion;
    // Referencia para manipular OrbitControls
    const controlsRef = useRef<any>(null);

    // Estado para la herramienta de interacción activa (fuera del modelo para que la UI no recargue el canvas)
    const [activeTool, setActiveTool] = useState<InteractionTool>('hand');
    const [showDebugZones, setShowDebugZones] = useState<boolean>(false);
    const [isHandTrackingActive, setIsHandTrackingActive] = useState<boolean>(false);
    const [handPosData, setHandPosData] = useState<{ x: number; y: number; isPinching: boolean; gesture: string } | null>(null);

    // Estado de calibración física
    const [physicsSensitivity, setPhysicsSensitivity] = useState(0.015);
    const [physicsMaxAngle, setPhysicsMaxAngle] = useState(Math.PI / 1.5);
    const [resetPhysicsTrigger, setResetPhysicsTrigger] = useState(0);

    const cameraFov = disableControls ? 30 : 50;

    // Handler para simular interacción 3D cuando el tracking de mano hace pinch o agarre en pantalla
    const handleHandInteract = (screenX: number, screenY: number, isPinching: boolean) => {
        // Si OrbitControls o HandTracking están activos, evitamos que los eventos del canvas desplacen la cámara
        const canvasEl = document.querySelector('canvas');
        if (canvasEl && isPinching) {
            const eventType = 'pointermove';
            const pointerEvent = new PointerEvent(eventType, {
                bubbles: false,
                cancelable: true,
                clientX: screenX,
                clientY: screenY,
                button: 0,
                pointerId: 1,
                pointerType: 'touch',
                isPrimary: true,
            });
            canvasEl.dispatchEvent(pointerEvent);
        }
    };

    // Determinar cursor
    const getCursorClass = () => {
        if (activeTool === 'hand') return 'cursor-grab active:cursor-grabbing';
        if (activeTool === 'pencil') return 'cursor-crosshair';
        return 'cursor-crosshair'; // Default genérico para otras herramientas
    };

    return (
        <div className={`w-full h-full relative rounded-2xl overflow-hidden bg-gradient-to-br ${modeLights.containerBg} ${getCursorClass()}`}>

            <InteractionToolbar
                isBoldMode={isHotMode || false}
                activeTool={activeTool}
                setActiveTool={setActiveTool}
                showDebugZones={showDebugZones}
                setShowDebugZones={setShowDebugZones}
                physicsSensitivity={physicsSensitivity}
                setPhysicsSensitivity={setPhysicsSensitivity}
                physicsMaxAngle={physicsMaxAngle}
                setPhysicsMaxAngle={setPhysicsMaxAngle}
                resetPhysics={() => setResetPhysicsTrigger(prev => prev + 1)}
                isHandTrackingActive={isHandTrackingActive}
                toggleHandTracking={() => setIsHandTrackingActive(prev => !prev)}
            />

            <HandTrackingOverlay
                isActive={isHandTrackingActive}
                onClose={() => setIsHandTrackingActive(false)}
                onHandInteract={handleHandInteract}
                onHandUpdate={(pos) => setHandPosData(pos)}
            />

            {/* HUD DE FEEDBACK VISUAL, ESTADO DE CARGA Y MOTOR DE ANTICIPACIÓN PROACTIVA */}
            <ActionFeedbackHUD
                personalityMode={effectiveMode}
                isHotMode={isHotMode}
                isAiSpeaking={isAiSpeaking}
                onTriggerAction={(actionId) => {
                    window.dispatchEvent(new CustomEvent('aiko-action', { detail: { action: actionId } }));
                }}
            />

            <Canvas
                shadows
                gl={{
                    powerPreference: 'high-performance',
                    antialias: true,
                    stencil: false,
                    depth: true,
                    preserveDrawingBuffer: false,
                    failIfMajorPerformanceCaveat: false,
                    toneMapping: THREE.ACESFilmicToneMapping,
                    toneMappingExposure: 1.0,
                    outputColorSpace: THREE.SRGBColorSpace,
                }}
                onCreated={(state) => {
                    // WebGL Context Loss Handler
                    const canvas = state.gl.domElement;

                    canvas.addEventListener('webglcontextlost', (event) => {
                        console.error('⚠️ Contexto WebGL perdido!');
                        event.preventDefault();
                        console.log('🔄 Intentando recuperar...');
                    });

                    canvas.addEventListener('webglcontextrestored', () => {
                        console.log('✅ Contexto WebGL restaurado!');
                        state.gl.resetState();
                    });

                    // Pixel ratio limit
                    state.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                    // Tone mapping y exposición correctos (exposure 1.0 = neutro, sin sobreexposición)
                    state.gl.toneMapping = THREE.ACESFilmicToneMapping;
                    state.gl.toneMappingExposure = 1.0;
                }}
            >
                <PerspectiveCamera
                    makeDefault
                    fov={cameraFov}
                    // Position inicial (se sobreescribe por CameraManager)
                    position={[0, 3.2, 4.2]}
                />

                <CameraManager viewMode={viewMode} controlsRef={controlsRef} />

                {/* CUERPO Y HERRAMIENTAS 3D DEL USUARIO DENTRO DEL ESCENARIO WEBGL (Solo activo si el botón AR está encendido) */}
                {isHandTrackingActive && (
                    <UserAvatar3D
                        handPos={handPosData}
                        activeTool={activeTool}
                        isHotMode={isHotMode}
                    />
                )}

                {/* ILUMINACIÓN DINÁMICA: Calibrada para sombreado PBR realista con reflejos y sombras suaves */}
                {(() => {
                    const raw = (modelUrl || avatar?.modelUrl || '').toLowerCase();
                    const isGLTFModel = raw.includes('.glb') || raw.includes('.gltf') || raw.includes('.vrm');
                    const isPMXModel = !isGLTFModel && (raw.includes('.pmx') || raw.includes('.pmd') || raw.includes('.zip') || raw.includes('.rar') || raw.includes('.7z'));

                    if (isPMXModel) {
                        // ── ILUMINACIÓN PMX/MMD ──────────────────────────────────────────────────────
                        // Luces equilibradas para evitar lavar las texturas ni crear sobreexposición (washed out).
                        return (
                            <>
                                <ambientLight intensity={0.95} color="#ffffff" />
                                <directionalLight
                                    position={[2, 4, 4]}
                                    intensity={0.85}
                                    color="#fffaf0"
                                    castShadow
                                />
                                {/* Fill frontal suave para iluminar sombras sin blanquear */}
                                <directionalLight position={[-1.5, 1.5, 3]} intensity={0.35} color="#fff0e6" />
                                {/* Rim trasero sutil */}
                                <pointLight position={[0, 2.5, -2]} intensity={0.3} color="#dbeafe" />
                            </>
                        );
                    } else {
                        // ── ILUMINACIÓN GLB/GLTF/VRM ─────────────────────────────────────────────────
                        return (
                            <>
                                <ambientLight intensity={modeLights.ambientIntensity} color={modeLights.ambientColor} />
                                <directionalLight
                                    position={[2, 5, 5]}
                                    intensity={modeLights.dirLightIntensity}
                                    color={modeLights.dirLightColor}
                                    castShadow
                                />
                                {/* Fill light adaptada al modo */}
                                <pointLight position={[-1.5, 1.5, 3]} intensity={modeLights.pointLightIntensity * 0.7} color={modeLights.pointLightColor} />
                                {/* Luz Rim de realce trasero */}
                                <pointLight position={[0, 2.5, -2]} intensity={0.4} color={modeLights.rimLightColor} />
                            </>
                        );
                    }
                })()}

                {/* Environment studio para reflejos físicos en ojos, pelo sedoso y joyería */}
                {(() => {
                    const raw = (modelUrl || avatar?.modelUrl || '').toLowerCase();
                    const isPMXModel = !raw.includes('.glb') && !raw.includes('.gltf') && !raw.includes('.vrm') &&
                        (raw.includes('.pmx') || raw.includes('.pmd') || raw.includes('.zip') || raw.includes('.rar') || raw.includes('.7z'));
                    return <Environment preset="studio" environmentIntensity={isPMXModel ? 0.65 : 0.35} />;
                })()}

                {/* SUELO Y SOMBRA DE CONTACTO: Da anclaje espacial para que los pies no floten en el vacío */}
                <group position={[0, -1.5, 0]}>
                    {/* Sombra de contacto circular suave debajo de los pies */}
                    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
                        <planeGeometry args={[12, 12]} />
                        <shadowMaterial opacity={0.35} />
                    </mesh>
                    {/* Piso sutil con cuadrícula/reflejo tenue de estudio */}
                    <gridHelper args={[16, 32, '#38bdf8', '#1e293b']} position={[0, 0, 0]} />
                </group>

                <Suspense fallback={<FallbackAvatar />}>
                    <AvatarModel
                        key={modelUrl || avatar?.modelUrl || 'default-model'}
                        modelUrl={modelUrl || avatar?.modelUrl || '/models/grokani_lipsync.glb'}
                        emotion={emotion}
                        action={activeAction || action}
                        audioElement={audioElement}
                        isAiSpeaking={isAiSpeaking}
                        isHotMode={isHotMode}
                        hairColor={hairColor}
                        audioAnalyser={audioAnalyser}
                        currentTool={activeTool}
                        showDebugZones={showDebugZones}
                        physicsSensitivity={physicsSensitivity}
                        physicsMaxAngle={physicsMaxAngle}
                        resetPhysicsTrigger={resetPhysicsTrigger}
                    />
                </Suspense>

                {!disableControls && (
                    <OrbitControls
                        makeDefault
                        ref={controlsRef}
                        enabled={!isHandTrackingActive}
                        // Target inicial (se sobreescribe por CameraManager)
                        target={[0, 2.2, 0]}
                        mouseButtons={{
                            LEFT: undefined as any, // Deshabilitar rotación con click izquierdo
                            MIDDLE: THREE.MOUSE.ROTATE, // Rotar con la rueda del ratón
                            RIGHT: THREE.MOUSE.PAN
                        }}
                    />
                )}
            </Canvas>
        </div>
    );
};

export default AvatarViewer3D;