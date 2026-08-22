import React, { useRef, useEffect, Suspense, useState } from 'react';
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
import { IKController } from '../utils/ikController';
import { MoodSystem } from '../utils/moodSystem';
import { InteractionSystem } from '../utils/interactionSystem';
import { MaterialManager } from '../utils/materialManager';
import { ProceduralAnimator } from '../utils/proceduralAnimations';
import { getPropManager } from '../utils/propManager';
import { isMixamoAnimation, retargetMixamoClip, getModelBoneNames } from '../utils/mixamoRetargeter';
import { SimplexNoise } from '../utils/perlin';
import { AvatarInteractionLayer, type InteractionLayerRef } from './AvatarInteractionLayer';
import { InteractionToolbar, type InteractionTool } from './InteractionToolbar';
import { HandTrackingOverlay } from './HandTrackingOverlay';
import { UserAvatar3D } from './UserAvatar3D';

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
}

// Simulación de Ruido Perlin simple (Legacy removed - using SimplexNoise class)

function AvatarModel({ modelUrl, emotion, action, audioElement, isAiSpeaking, isHotMode = false, hairColor, audioAnalyser, currentTool, showDebugZones, physicsSensitivity, physicsMaxAngle, resetPhysicsTrigger }: {
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
    // Si no hay URL, usamos Grokani como base por ser el más estable
    const safeModelUrl = modelUrl || '/models/grokani_lipsync.glb';

    const gltf = useLoader(GLTFLoader, safeModelUrl);

    const modelRef = useRef<THREE.Group>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const lipSyncRef = useRef<LipSyncAnalyzer | null>(null);
    const jigglePhysicsRef = useRef<JigglePhysicsSystem | null>(null);

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
            const morphsToReset = ['BrowsDown', 'BrowsUp', 'Smile', 'Frown', 'MouthOpen', 'Joy', 'Fun', 'Angry', 'Sorrow', 'Fcl_ALL_Joy', 'Fcl_ALL_Fun', 'Fcl_ALL_Angry', 'Fcl_ALL_Sorrow', 'Fcl_MTH_Joy', 'Fcl_MTH_Fun', 'Grin', 'Laugh', 'Ahegao', 'Teeth', 'Happy', 'sil', 'vrc.v_sil', 'mouthclose', 'fcl_mth_close'];
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

            // Aplicar nuevos según emoción
            if (currentEmotion === 'angry') {
                applyMorph('BrowsDown', 1.0);
                applyMorph('Angry', 0.8);
            } else if (currentEmotion === 'happy' || currentEmotion === 'excited') {
                applyMorph('Smile', 0.7);
                applyMorph('Joy', 0.7);
            } else if (currentEmotion === 'sad') {
                applyMorph('Frown', 0.8);
                applyMorph('BrowsUp', 0.5);
                applyMorph('Sorrow', 0.7);
            } else if (currentEmotion === 'surprised') {
                applyMorph('BrowsUp', 1.0);
                applyMorph('MouthOpen', 0.4);
                applyMorph('Surprised', 0.8);
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

    // Initializion logic for Clothing Manager
    useEffect(() => {
        if (modelRef.current) {
            const cm = getClothingManager();
            cm.initialize(modelRef.current);
            clothingManagerRef.current = cm;
        }
    }, [modelRef.current]);

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

    // Cleanup function to dispose resources
    const cleanupResources = () => {
        console.log('🧹 Limpiando recursos del modelo...');

        // Dispose mixer
        if (mixerRef.current) {
            mixerRef.current.stopAllAction();
            mixerRef.current = null;
        }

        // Dispose lip sync
        if (lipSyncRef.current) {
            lipSyncRef.current = null;
        }

        // Dispose model resources
        if (modelRef.current) {
            modelRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    if (child.geometry) {
                        child.geometry.dispose();
                    }
                    if (child.material) {
                        if (Array.isArray(child.material)) {
                            child.material.forEach(mat => {
                                if (mat.map) mat.map.dispose();
                                if (mat.normalMap) mat.normalMap.dispose();
                                if (mat.roughnessMap) mat.roughnessMap.dispose();
                                if (mat.metalnessMap) mat.metalnessMap.dispose();
                                mat.dispose();
                            });
                        } else {
                            if (child.material.map) child.material.map.dispose();
                            if (child.material.normalMap) child.material.normalMap.dispose();
                            if (child.material.roughnessMap) child.material.roughnessMap.dispose();
                            if (child.material.metalnessMap) child.material.metalnessMap.dispose();
                            child.material.dispose();
                        }
                    }
                }
            });
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
                            } else if (meshName.includes('eye')) {
                                // OJOS: Mantener brillantes
                                mat.side = THREE.DoubleSide;
                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.roughness = 1.0;
                                    mat.metalness = 0.0;
                                    mat.envMapIntensity = 0.0;
                                    // Mantener emissive intacto
                                }
                                if (SHOW_VERBOSE_LOGS) console.log('👁️ Configurado como OJO:', child.name);
                            } else if (isSkin) {
                                // PIEL/CUERPO: Material mate suave (Anime)
                                // CRÍTICO: FrontSide para evitar Z-fighting de las caras internas (cuello negro)
                                mat.side = THREE.FrontSide;
                                mat.transparent = false;
                                mat.depthWrite = true;
                                mat.polygonOffset = false;

                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.roughness = 1.0;         // Completamente mate
                                    mat.metalness = 0.0;         // Nada metálico
                                    mat.envMapIntensity = 0.1;   // Casi sin reflejo de entorno

                                    // Restaurar aoMapIntensity para evitar sombras sucias
                                    mat.aoMapIntensity = 0.5;

                                    // Forzar colorSpace correcto
                                    if (mat.map) {
                                        mat.map.colorSpace = THREE.SRGBColorSpace;
                                        mat.map.needsUpdate = true;
                                    }
                                    if (!mat.map) {
                                        mat.color.set(0xffe0c8);
                                    }
                                    mat.needsUpdate = true;
                                }
                            } else {
                                // Ropa, pelo, accesorios, etc. (Anime)
                                mat.side = THREE.DoubleSide;
                                // Preservar transparencia original para encajes y ropa interior
                                if (mat.transparent) {
                                    mat.depthWrite = false;
                                    mat.alphaTest = 0.3; // Cortar píxeles casi transparentes
                                } else {
                                    mat.depthWrite = true;
                                }
                                mat.polygonOffset = false;

                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    mat.roughness = 1.0; // Pelo/ropa mate
                                    mat.metalness = 0.0; // Nada metálico (corrige el pelo rojo metálico)
                                    mat.envMapIntensity = 0.1;
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
                    // CRÍTICO: Ocultar el blush o sombras por defecto - cubre toda la cara o ensucia el cuello
                    if (name.includes('blush') || name.includes('shadow') || name.includes('sombra')) {
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
                                    console.log("💀 BONES DUMP:", allBones.join(', '));
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
                                // - Anime: a, aa, fcl_mth_a
                                // - RPM: mouthOpen, viseme_aa
                                // - DAZ: eCTRLMouthOpen, eCTRLJawOpen, eCTRLvAA
                                if (
                                    k === 'a' || k === 'aa' ||
                                    k === 'mouthopen' || k === 'mouth_open' ||
                                    k === 'fcl_mth_a' ||
                                    k.includes('mouthopen') || k.includes('jawopen') ||
                                    k.includes('ectrlmouthopen') || k.includes('ectrljawopen') ||
                                    k.includes('ctrlvaa') || k.includes('viseme_aa')
                                ) {
                                    newVisemeMap['viseme_aa'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de boca encontrado: ${key} → viseme_aa`);
                                }
                                if (k === 'e' || k === 'ee' || k === 'fcl_mth_e' || k.includes('viseme_e') || k.includes('ctrlvee') || k.includes('mouthee')) {
                                    newVisemeMap['viseme_E'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal E encontrado: ${key} → viseme_E`);
                                }
                                if (k === 'i' || k === 'ih' || k === 'fcl_mth_i' || k.includes('viseme_i') || k.includes('ctrlvih') || k.includes('mouthih')) {
                                    newVisemeMap['viseme_I'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal I encontrado: ${key} → viseme_I`);
                                }
                                if (k === 'o' || k === 'oh' || k === 'fcl_mth_o' || k.includes('viseme_o') || k.includes('ctrlvoh') || k.includes('mouthfunnel') || k.includes('mouth_funnel')) {
                                    newVisemeMap['viseme_O'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal O encontrado: ${key} → viseme_O`);
                                }
                                if (k === 'u' || k === 'ou' || k === 'fcl_mth_u' || k.includes('viseme_u') || k.includes('ctrlvou') || k.includes('mouthpucker') || k.includes('mouth_pucker')) {
                                    newVisemeMap['viseme_U'] = dict[key];
                                    if (SHOW_VERBOSE_LOGS) console.log(`👄 Morph de vocal U encontrado: ${key} → viseme_U`);
                                }

                                // Morphs de consonantes y cierre bilabial (M, P, B, F, TH)
                                if (
                                    k === 'm' || k === 'b' || k === 'p' || k === 'pp' ||
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
                const isJigglePart = /breast|ass|pectoral|glute|butt/.test(lowerName) && !lowerName.includes('glass') && !lowerName.includes('class');

                if (child instanceof THREE.Bone || isJigglePart) {
                    const name = lowerName; // Ya lo tenemos calculado
                    const originalName = child.name;
                    const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r') || originalName.endsWith('R') || originalName.endsWith('_R') || originalName.endsWith('.R');
                    const isLeft = name.includes('left') || name.includes('_l') || name.endsWith('.l') || originalName.endsWith('L') || originalName.endsWith('_L') || originalName.endsWith('.L');

                    // DEPURACIÓN: DUMP DE JERARQUÍA DE HUESOS (Desactivado)
                    /*
                    if (debugDumpCount.current < 200) {
                         console.log(`🦴 NODE [${child.type}]: "${child.name}" (Bone? ${child instanceof THREE.Bone})`);
                         debugDumpCount.current++;
                    }
                    */

                    // Match the actual head bone, avoiding hair nodes or end tips
                    // PRIORIDAD ABSOLUTA a huesos de deformación reales (VRM/Mixamo)
                    const isDeformHead = name === 'j_bip_c_head' || name === 'mixamorighead' || name === 'def-head' || name === 'bip01_head';
                    const isExactHead = isDeformHead || name === 'head';
                    const isFuzzyHead = name.includes('head') && !name.includes('top') && !name.includes('end') && !name.includes('hair') && !name.includes('accessory');

                    if (isExactHead || isFuzzyHead) {
                        const isDeforming = validSkinBones.has(child as THREE.Bone);
                        if (isDeforming || isDeformHead) {
                            if (isDeformHead || !headBoneRef.current || (isExactHead && !headBoneRef.current.name.toLowerCase().includes('j_bip'))) {
                                headBoneRef.current = child as any;
                            }
                        }
                    }

                    // PRIORIDAD a espina base / abdomen (Excluyendo cuello def-spine.004, 005, 006 y cabeza)
                    const isNeckBone = name.includes('spine.004') || name.includes('spine.005') || name.includes('spine.006') || name.includes('neck') || name.includes('head');
                    const isDeformSpine = !isNeckBone && (name === 'j_bip_c_spine' || name === 'mixamorigspine' || name === 'def-spine' || name === 'def-spine.001' || name === 'spine' || name === 'spine.001');
                    const isFuzzySpine = !isNeckBone && (name.includes('spine') || name.includes('chest'));
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
                    const isDeformHips = !isSingleSide && (name === 'j_bip_c_hips' || name === 'mixamorighips' || name === 'bip01_pelvis');
                    const isExactHips = isDeformHips || (!isSingleSide && (name === 'hips' || name === 'def-hips' || name === 'pelvis'));
                    const isFuzzyHips = !isSingleSide && (name.includes('hips') || name === 'pelvis' || name === 'torso' || name.includes('grokani_hips'));

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

                    if (fuzzyCheck && (name.includes('pectoral') || name.includes('breast') || name.includes('chestlower'))) {
                        if (SHOW_VERBOSE_LOGS) console.log('✅ Found Breast Bone candidate:', name);
                        const isL = isLeft || name.startsWith('lpectoral') || name.startsWith('l_');
                        const isR = isRight || name.startsWith('rpectoral') || name.startsWith('r_');

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
                    if (fuzzyCheck && (name.includes('hair') || name.includes('ponytail') || name.includes('bangs'))) {
                        // Preferir huesos frontales o colas principales
                        if (!hairRef.current || name.includes('front') || name.includes('tail')) hairRef.current = child as any;
                    }

                    // Agregado 'ass' para modelos Rigify/Blender
                    if (name.includes('glute') || name.includes('butt') || name.includes('ass_') || name.includes('ass-')) {
                        if (SHOW_VERBOSE_LOGS) console.log('✅ Found Butt Bone candidate:', name);
                        const isL = isLeft || name.startsWith('lglute') || name.startsWith('l_') || name.includes('.l');
                        const isR = isRight || name.startsWith('rglute') || name.startsWith('r_') || name.includes('.r');

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
                        const isRightSide = name.includes('.r') || name.includes('_r') || name.includes('right');
                        const isLeftSide = name.includes('.l') || name.includes('_l') || name.includes('left');
                        const isThigh = name.includes('thigh') || name.includes('upleg') || name.includes('upper_leg') || name.includes('upperleg');
                        
                        if (isThigh) {
                            const isDef = name.startsWith('def-');
                            if (isRightSide && (isDef || !rightLegRef.current)) rightLegRef.current = child as any;
                            if (isLeftSide && (isDef || !leftLegRef.current)) leftLegRef.current = child as any;
                        }

                        if (name === 'mixamorigrightleg' || name === 'mixamorigrightfoot' || name === 'def-foot.r' || name === 'j_bip_r_foot' || name === 'r_foot') {
                            if (!rightFootRef.current) rightFootRef.current = child as any;
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
                    const isUpperArm = name.includes('upper_arm') || (name.includes('arm') && !name.includes('fore') && !name.includes('hand') && !name.includes('shoulder'));
                    if (isUpperArm) {
                        const isDef = name.startsWith('def-');
                        if (isRight) {
                            if (isDef || !rightArmRef.current) {
                                rightArmRef.current = child as any;
                                rightArmOriginalRot.current = child.rotation.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('💪 Brazo DERECHO asignado:', child.name);
                            }
                        }
                        if (isLeft) {
                            if (isDef || !leftArmRef.current) {
                                leftArmRef.current = child as any;
                                leftArmOriginalRot.current = child.rotation.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('💪 Brazo IZQUIERDO asignado:', child.name);
                            }
                        }
                    }

                    // Antebrazos
                    const isForeArm = name.includes('forearm') || name.includes('fore_arm') || name.includes('lowerarm') || name.includes('lower_arm') || name.includes('elbow');
                    if (isForeArm) {
                        const isDef = name.startsWith('def-');
                        if (isRight && (isDef || !rightForeArmRef.current)) rightForeArmRef.current = child as any;
                        if (isLeft && (isDef || !leftForeArmRef.current)) leftForeArmRef.current = child as any;
                    }

                    // Manos
                    const isHand = name.includes('hand') || name.includes('wrist') || name.includes('muñeca');
                    if (isHand && !name.includes('finger') && !name.includes('thumb')) {
                        const isDef = name.startsWith('def-');
                        if (isRight && (isDef || !rightHandRef.current)) rightHandRef.current = child as any;
                        if (isLeft && (isDef || !leftHandRef.current)) leftHandRef.current = child as any;
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
                    const isLegHelper = name.includes('.0') || name.includes('twist') || name.includes('ik') || name.includes('mch') || name.includes('org') || name.includes('toe') || name.includes('pole');
                    const isLeg = !isLegHelper && (name.includes('thigh') || name.includes('upleg') || name.includes('upper_leg') || name.includes('upperleg'));
                    if (isLeg) {
                        const isDef = name.startsWith('def-');
                        if (isRight) {
                            if ((isDef && !rightLegRef.current?.name.toLowerCase().startsWith('def-')) || !rightLegRef.current) {
                                rightLegRef.current = child as any;
                                rightLegOriginalRot.current = child.rotation.clone();
                                rightLegOriginalPos.current = child.position.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('🦵 Pierna DERECHA asignada:', child.name);
                            }
                        }
                        if (isLeft) {
                            if ((isDef && !leftLegRef.current?.name.toLowerCase().startsWith('def-')) || !leftLegRef.current) {
                                leftLegRef.current = child as any;
                                leftLegOriginalRot.current = child.rotation.clone();
                                leftLegOriginalPos.current = child.position.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('🦵 Pierna IZQUIERDA asignada:', child.name);
                            }
                        }
                    }

                    // Espinilla/Tibia (shin/calf) — para flexión de rodilla
                    const isShinHelper = name.includes('.0') || name.includes('twist') || name.includes('ik') || name.includes('mch') || name.includes('org') || name.includes('toe') || name.includes('pole');
                    const isShinBone = !isShinHelper && (name.includes('shin') || name.includes('calf') || name.includes('lower_leg') || name.includes('lowerleg') || name.includes('knee'));
                    if (isShinBone) {
                        const isDef = name.startsWith('def-');
                        if (isRight) {
                            if ((isDef && !rightShineRef.current?.name.toLowerCase().startsWith('def-')) || !rightShineRef.current) {
                                rightShineRef.current = child as any;
                                rightShineOriginalRot.current = child.rotation.clone();
                            }
                        }
                        if (isLeft) {
                            if ((isDef && !leftShineRef.current?.name.toLowerCase().startsWith('def-')) || !leftShineRef.current) {
                                leftShineRef.current = child as any;
                                leftShineOriginalRot.current = child.rotation.clone();
                            }
                        }
                    }

                    // Pies (foot/ankle) — Excluir toe, twist, .001, ik, mch, org
                    const isFootHelper = name.includes('.0') || name.includes('twist') || name.includes('ik') || name.includes('mch') || name.includes('org') || name.includes('toe') || name.includes('pole');
                    const isFoot = !isFootHelper && (name.includes('foot') || name.includes('ankle') || name.includes('pie'));
                    if (isFoot) {
                        const isDef = name.startsWith('def-');
                        if (isRight && ((isDef && !rightFootRef.current?.name.toLowerCase().startsWith('def-')) || !rightFootRef.current)) {
                            rightFootRef.current = child as any;
                        }
                        if (isLeft && ((isDef && !leftFootRef.current?.name.toLowerCase().startsWith('def-')) || !leftFootRef.current)) {
                            leftFootRef.current = child as any;
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
            // Inicializar LipSync (DESPUÉS de isGrokAni para pasar opciones específicas)
            if (!lipSyncRef.current) lipSyncRef.current = new LipSyncAnalyzer();
            lipSyncRef.current.initialize(modelRef.current, {
                disableBones: false, // ¡DEJAMOS QUE UNIVERSAL LIP SYNC TOME EL CONTROL TOTAL!
                restingTopLipOffsetY: isGrokAni ? -0.0012 : 0, // Corregir mueca nativa
                jawMovementScale: isGrokAni ? 0.8 : 1.0      // Multiplicador original (2.5 -> 1.2) para que la mandíbula se note
            });

            if (gltf.animations.length > 0) {
                // FILTRAR tracks de brazos/manos de las animaciones para que el sistema procedural los controle
                const filteredAnims = gltf.animations.map(clip => {
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

            // 2. Cirugía ortopédica para reconectar la cara y el pelo al cráneo (Arreglo para jerarquías aplastadas por glTF)
            if (headBoneRef.current) {
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
                    // Esto filtra automáticamente la Vagina/Pelvis (spine.006) que está abajo,
                    // pero incluye los huesos spine/neck secundarios de la malla del pelo que están arriba!
                    if (distance > 0.7) return false;

                    // EXCLUSIÓN ESPECÍFICA: No anclar a la cabeza accesorios del cuello/pecho (collar, choker, necklace, cuello, cape, etc)
                    if (n.includes('spine.006') || n.includes('garter') || n.includes('thigh') || n.includes('leg') || n.includes('panties') ||
                        n.includes('collar') || n.includes('choker') || n.includes('necklace') || n.includes('cuello') || n.includes('tie') || n.includes('cape')) {
                        return false;
                    }

                    // Excluir hombros, brazos y pechos explícitamente por si caen dentro del radio
                    if (n.includes('shoulder') || n.includes('arm') || n.includes('hand') ||
                        n.includes('finger') || n.includes('breast') || n.includes('chest') ||
                        n.includes('clavicle')) {
                        return false;
                    }

                    // Cualquier otro hueso huérfano cerca de la cabeza (pelo, ojos, cuello secundario) es bienvenido!
                    return true;
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

            // 2.5 Jiggle Physics - Ropa, Cabello, Pechos
            jigglePhysicsRef.current = new JigglePhysicsSystem();
            jigglePhysicsRef.current.initialize(modelRef.current);

            // Forzar registro manual de glúteos para asegurar rebote
            if (leftButtRef.current && !leftButtRef.current.name.toLowerCase().includes('pelvis')) {
                jigglePhysicsRef.current.addBone(leftButtRef.current, { stiffness: 0.05, damping: 0.1, maxAngle: Math.PI / 3 });
            }
            if (rightButtRef.current && !rightButtRef.current.name.toLowerCase().includes('pelvis')) {
                jigglePhysicsRef.current.addBone(rightButtRef.current, { stiffness: 0.05, damping: 0.1, maxAngle: Math.PI / 3 });
            }

            // Agrandar pechos según solicitud del usuario
            if (leftBreastRef.current) leftBreastRef.current.scale.set(1.4, 1.4, 1.4);
            if (rightBreastRef.current) rightBreastRef.current.scale.set(1.4, 1.4, 1.4);

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

                    // Asegurar que las submallas tengan DoubleSide para que el interior no se vea negro ni transparente
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach((m: any) => {
                            if (m) m.side = THREE.DoubleSide;
                        });
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
            });

            // --- FORZAR POSE NEUTRA (BRAZOS ABAJO) ---
            // DIAGNÓSTICO FINAL: 
            // - Z (+75) -> Atrás
            // - X (+75) -> ARRIBA (Confirmado por foto)
            // CONCLUSIÓN: X es el eje Vertical. Positivo es Arriba.
            // SOLUCIÓN: Usar X NEGATIVO para bajar los brazos.
            // INICIALIZAR GESTOR DE ROPA Y VESTIR COMPLETAMENTE POR DEFECTO
            const cm = getClothingManager();
            cm.initialize(modelRef.current);
            cm.presetFullClothed();

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

            // Registrar listener de acciones procedurales disparadas por el sistema nervioso
            if (typeof window !== 'undefined') {
                const proceduralHandler = (e: Event) => {
                    const { action } = (e as CustomEvent<{ action: string }>).detail;
                    if (proceduralAnimatorRef.current) {
                        proceduralAnimatorRef.current.play(action);
                    }
                };
                window.addEventListener('aiko-play-procedural', proceduralHandler);
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
    }, [gltf]);


    // --- EFECTO: CARGAR ANIMACIONES EXTERNAS (Mixamo, etc.) ---
    useEffect(() => {
        const handler = async (e: Event) => {
            const { url, name, type } = (e as CustomEvent).detail;
            if (!url || !modelRef.current) return;

            console.log(`🎬 Cargando animación externa: ${name} (.${type})`);

            try {
                let animations: THREE.AnimationClip[] = [];
                let sourceRestPoses: Map<string, THREE.Quaternion> | undefined;

                if (type === 'fbx') {
                    const fbxLoader = new FBXLoader();
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
                    console.log(`📦 FBX: ${animations.length} anims, ${sourceRestPoses.size} huesos rest-pose`);
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

                if (animations.length > 0) {
                    const boneNames = getModelBoneNames(modelRef.current!);

                    // Encontrar el skeleton del modelo target
                    let skeleton: THREE.Skeleton | null = null;
                    modelRef.current!.traverse((child: any) => {
                        if (child.isSkinnedMesh && child.skeleton && !skeleton) {
                            skeleton = child.skeleton;
                            // TEST DE DIAGNÓSTICO: Listar los huesos reales del Skeleton
                            const skeletonBoneNames = skeleton.bones.map(b => b.name);
                            console.log('💀 HUESOS REALES DEL SKELETON (SKINNED MESH):', skeletonBoneNames.join(', '));

                            const hasDefAss = skeletonBoneNames.some(b => b.toLowerCase().includes('def-ass.l'));
                            console.log(`¿El Skeleton incluye DEF-ass.L? -> ${hasDefAss ? 'SÍ' : 'NO (¡EXCLUIDO POR EXPORTER!)'}`);
                        }
                    });

                    // IMPORTANTE: Resetear a bind pose para capturar las rotaciones REALES de reposo
                    // (si hay una animación corriendo, bone.quaternion tiene valores animados, no de reposo)
                    if (skeleton) {
                        (skeleton as THREE.Skeleton).pose();
                        console.log(`🔧 Skeleton reseteado a bind-pose para captura`);
                    }

                    // Ahora capturar las rotaciones de reposo correctas
                    const targetRestPoses = new Map<string, THREE.Quaternion>();
                    modelRef.current!.traverse((child: any) => {
                        if (child.isBone) {
                            targetRestPoses.set(child.name, child.quaternion.clone());
                        }
                    });
                    console.log(`🦴 Target: ${boneNames.size} huesos, ${targetRestPoses.size} rest-poses capturadas`);

                    const processedClips: THREE.AnimationClip[] = [];

                    animations.forEach((clip: THREE.AnimationClip) => {
                        clip.name = name;

                        if (isMixamoAnimation(clip)) {
                            console.log(`🔄 Retargeteando con corrección rest-pose...`);
                            const retargeted = retargetMixamoClip(
                                clip, boneNames, modelRef.current!,
                                sourceRestPoses, targetRestPoses
                            );
                            retargeted.name = name;
                            processedClips.push(retargeted);
                        } else {
                            processedClips.push(clip);
                        }

                        console.log(`✅ "${name}": ${clip.duration.toFixed(1)}s, ${clip.tracks.length} tracks`);
                    });

                    if (processedClips.length > 0 && mixerRef.current) {
                        // Parar TODAS las animaciones actuales en el mixer original
                        mixerRef.current.stopAllAction();

                        // Reproducir el clip retargetado en el mixer ORIGINAL del modelo
                        // Esto es crucial: el mixer original está conectado a TODAS las mallas
                        // (body, face, clothing, shoes), no solo al skeleton
                        const clipAction = mixerRef.current.clipAction(processedClips[0]);
                        clipAction.reset();
                        clipAction.setLoop(THREE.LoopRepeat, Infinity);
                        clipAction.clampWhenFinished = false;
                        clipAction.play();

                        externalAnimPlayingRef.current = true;
                        console.log(`🎯 Animación "${name}" reproduciéndose en mixer original - TODAS las mallas se actualizan`);
                    }
                } else {
                    console.warn(`⚠️ "${name}" no contiene animaciones`);
                }
            } catch (err) {
                console.error(`❌ Error cargando "${name}":`, err);
            }
        };

        window.addEventListener('nova-load-animation', handler);
        return () => window.removeEventListener('nova-load-animation', handler);
    }, [gltf]);


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

            let animName = getAnimationName(action);

            // Eliminar animación de sentarse porque está rota (piernas estiradas, caderas flotando)
            if (animName.toLowerCase() === 'sit' || animName.toLowerCase() === 'sitting') {
                console.log("⚠️ Animación de sentarse desactivada a petición del usuario. Cambiando a Idle.");
                animName = 'Idle';
            }

            // 1. Intentar con AnimationManager (clips de Blender)
            let played = false;
            if (animationManagerRef.current) {
                const finalName = animName === 'Idle' && !action.toLowerCase().includes('idle')
                    ? action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
                    : animName;

                // Si la acción es Idle, forzamos la limpieza del esqueleto antes de reproducirla
                if (finalName.toLowerCase().includes('idle')) {
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
                    // SOLO reproducimos Idle en el AnimationManager para evitar el bug de mallas dobles (Rigify)
                    played = animationManagerRef.current.play(finalName, { priority: 10, loop: true });
                } else {
                    // Para cualquier otra acción, forzamos el uso de animaciones procedurales 
                    // porque las animaciones de Mixamo/Blender rompen la columna (vertex weights desalineados)
                    console.log(`⚠️ Ignorando clip de animación ${finalName} para evitar deformación de malla. Usando procedural.`);
                    played = false;
                }
            }

            // 2. Fallback: ProceduralAnimator (gestos por huesos)
            if (!played && proceduralAnimatorRef.current) {
                console.log('🎭 Usando animación procedural para:', action);
                proceduralAnimatorRef.current.play(action);
            }
        } else {
            // Volver a Idle / detener procedural
            externalAnimPlayingRef.current = false;
            if (mixerRef.current) mixerRef.current.stopAllAction();

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

    // OPTIMIZACIÓN: Limitador de frame rate y render condicional
    const lastFrameTimeRef = useRef(0);
    const lastAnimationUpdateRef = useRef(0);
    const targetFPS = 45; // Reducido de 60 a 45 para mejor rendimiento
    const frameInterval = 1000 / targetFPS;
    const animationUpdateInterval = 1000 / 30; // Actualizar animaciones a 30fps

    // Estados internos para Saccades
    const saccadeTimer = useRef(0);
    const nextSaccadeTime = useRef(0.5);

    useFrame((state, delta) => {
        // OPTIMIZACIÓN: Limitar FPS para reducir carga de CPU/GPU
        const now = performance.now();
        if (now - lastFrameTimeRef.current < frameInterval) {
            return; // Skip frame
        }
        lastFrameTimeRef.current = now;

        // OPTIMIZACIÓN: Actualizar animaciones menos frecuentemente
        const shouldUpdateAnimation = (now - lastAnimationUpdateRef.current) >= animationUpdateInterval;
        if (shouldUpdateAnimation) {
            lastAnimationUpdateRef.current = now;
        }

        const t = state.clock.elapsedTime;
        if (mixerRef.current) mixerRef.current.update(delta);

        // Recalibrate IKController bind pose after AnimationMixer has applied the standing animation
        if (ikRecalibrateFrames.current > 0) {
            ikRecalibrateFrames.current--;
            if (ikRecalibrateFrames.current === 0) {
                if (ikControllerRef.current) {
                    ikControllerRef.current.recalibrateBindPose();
                }

                // CRÍTICO: Recalibrar headOriginalQuat.current y headOriginalPos.current
                // para que el sistema de huesos huérfanos (pelo, ojos) calcule el delta
                // respecto al mismo punto de referencia que el IKController.
                if (headBoneRef.current) {
                    headOriginalQuat.current.copy(headBoneRef.current.quaternion);
                    headOriginalPos.current.copy(headBoneRef.current.position);

                    // Forzar actualización global de matrices para capturar offset real
                    headBoneRef.current.updateWorldMatrix(true, false);
                    const headWorldInv = headBoneRef.current.matrixWorld.clone().invert();

                    // También recalibrar los originalQuat de los huérfanos y su offsetMatrix mundial
                    headOrphansRef.current.forEach(orphan => {
                        orphan.originalQuat.copy(orphan.bone.quaternion);
                        orphan.originalPos.copy(orphan.bone.position);

                        orphan.bone.updateWorldMatrix(true, false);
                        orphan.offsetMatrix = headWorldInv.clone().multiply(orphan.bone.matrixWorld);
                    });
                    console.log('✅ headOriginalQuat + orphans recalibrados al estado Idle estabilizado');
                }

                // CRÍTICO: Recalibrar también userData.baseQuat para que cualquier reseteo (como al volver a Idle)
                if (modelRef.current) {
                    modelRef.current.traverse((child: any) => {
                        if (child.isBone) {
                            const name = child.name.toLowerCase();
                            const isArm = name.includes('arm') || name.includes('hand') || name.includes('shoulder') ||
                                name.includes('elbow') || name.includes('wrist') || name.includes('finger') ||
                                name.includes('thumb');
                            if (!isArm) {
                                child.userData.baseQuat = child.quaternion.clone();
                            }
                        }
                    });
                    console.log("✅ Recalibración dinámica de userData.baseQuat completa (brazos excluidos)");
                }
            }
        }

        // === ACTUALIZAR NUEVOS SISTEMAS ===
        if (animationManagerRef.current) animationManagerRef.current.update(delta);
        if (proceduralAnimatorRef.current) proceduralAnimatorRef.current.update(t, delta);

        // === Si hay animación externa (Mixamo), proceduralAnimator o idle ===
        // El parpadeo y lipsync se procesan de forma unificada más abajo en el render loop

        // --- SACCADIC EYE MOVEMENTS (MICRO-MOVIMIENTOS OCULARES BIOLÓGICOS) ---
        if (ikControllerRef.current?.isInitialized()) {
            saccadeTimer.current += delta;
            if (saccadeTimer.current > nextSaccadeTime.current) {
                // Saccades humanos: predominantemente horizontales (relación 3:1 o 4:1)
                // Rango muy sutil (~3.5cm horizontal, ~1cm vertical)
                const rangeX = 0.035;
                const rangeY = 0.010;
                const microOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * rangeX * 2, // X: Escaneo horizontal
                    (Math.random() - 0.5) * rangeY * 2, // Y: Micro-fijación vertical
                    0
                );

                ikControllerRef.current.setMicroOffset(microOffset);

                saccadeTimer.current = 0;
                // Intervalo biológico: micro-fijaciones entre 1.8s y 4.5s con probabilidad de doble fijación
                const isDoubleFixation = Math.random() < 0.15;
                nextSaccadeTime.current = isDoubleFixation ? 0.35 + Math.random() * 0.4 : 1.8 + Math.random() * 2.7;
            }

            // Seguir dinámicamente la cámara 3D para que el avatar te mire a los ojos al mover la cámara
            ikControllerRef.current.setLookTarget(state.camera.position, true);

            // Inyectar el estado del baile actual (calculado en el frame anterior o actual)
            ikControllerRef.current.setDanceState(musicEnergyRef.current, danceTimeRef.current);
            ikControllerRef.current.update(delta, externalAnimPlayingRef.current);
        }

        // --- SINCRONIZACIÓN DE CABELLO SE MOVIÓ AL FINAL DEL FRAME ---

        const moodInfluence = moodSystemRef.current?.getInfluence() || {
            breathingSpeed: 1, gestureFrequency: 1, expressionIntensity: 1, idleVariation: 1, timeScale: 1
        };

        // --- CALCULAR PESO DE CAPA PROCEDURAL ---
        // Si hay una animación activa (clip o procedural), reducir influencia del idle arm code
        const isIdlePlaying = animationManagerRef.current?.isPlaying('Idle') ?? true;
        const isProceduralPlaying = proceduralAnimatorRef.current?.isPlaying() ?? false;
        const proceduralLayerWeight = (isIdlePlaying && !action && !isProceduralPlaying) ? 1.0 : 0.0;

        // --- 1. MOVIMIENTO "VIVO" AVANZADO (Procedural Animation) ---
        if (modelRef.current && !externalAnimPlayingRef.current) {

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

            // A. RESPIRACIÓN REALISTA ASIMÉTRICA (Inhalación activa, meseta y exhalación relajada lenta)
            const breathSpeed = (isHotMode ? 2.4 : 1.0) * moodInfluence.breathingSpeed * 0.28;
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

            // Movimiento vertical sutil (Pecho sube al inhalar)
            let baseY = -0.5; // El offset base necesario para este modelo (evita flotar)
            if (currentBasePoseRef.current === 'sit') baseY = -0.9;
            if (currentBasePoseRef.current === 'lie') baseY = -1.5;

            const targetY = baseY + (inhale * 0.0045 * moodInfluence.expressionIntensity * proceduralLayerWeight);
            modelRef.current.position.y = THREE.MathUtils.lerp(modelRef.current.position.y, targetY, 0.08);

            // B. MICRO-BALANCEO (REMOVED)
            // Removido porque lerp() hacia el ruido (que está cerca de 0) forzaba la columna a estar recta, 
            // rompiendo la pose de la animación (ej. sentada) y desencajando la malla.

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

        // --- 🖐️ FINGER PROCEDURAL ANIMATION ---
        // Usa targets ABSOLUTOS en local-space para evitar acumulación del origX del bind-pose.
        // Los targets fueron calibrados para el GrokAni Rigify rig.
        if (isGrokAniRef.current && !externalAnimPlayingRef.current) {
            fingerPoseRef.current.timer += delta;

            if (fingerPoseRef.current.timer > 4.5 + Math.random() * 2) {
                fingerPoseRef.current.timer = 0;
                const poses = isAiSpeaking
                    ? ['OPEN', 'PINCH', 'POINT', 'RELAX']
                    : ['RELAX', 'SOFT_CURL', 'RELAX', 'OPEN'];
                fingerPoseRef.current.name = poses[Math.floor(Math.random() * poses.length)];
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

            // Actualizar dinámicas de Props (humo, vapor, pulso de poción)
            getPropManager().update(delta, t);

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
        // Al no tener morphs de sonrisa, usamos los OJOS para expresar emoción (anime style).

        // Mouse Tracking
        const mouse = state.pointer;
        lookTarget.current.lerp(mouse, 0.1);

        let targetPupilScale = 0;
        let eyeDirectionX = lookTarget.current.x * -0.5;
        let eyeDirectionY = lookTarget.current.y * 0.5;

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
                targetPupilScale = 0;
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

        const blinkValue = THREE.MathUtils.clamp(
            isBlinking.current ? blinkCurve : (isHotMode ? 0.25 : 0),
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

            // Actualizar morphs faciales (ojos, cejas, boca base)
            updateFacialExpression(morphTargetMeshes, emotion, isAiSpeaking);
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

        if (morphTargetMeshes.length > 0) {
            morphTargetMeshes.forEach(mesh => {
                if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

                // Aplicar Parpadeo (Busca nombres comunes de Blink)
                ['eyeBlinkLeft', 'blink_L', 'Fcl_EYE_Close_L', 'Blink'].forEach(key => {
                    const idx = mesh.morphTargetDictionary![key];
                    if (idx !== undefined) mesh.morphTargetInfluences![idx] = blinkValue;
                });
                ['eyeBlinkRight', 'blink_R', 'Fcl_EYE_Close_R'].forEach(key => {
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
                            if (k.toLowerCase().includes('open') || k.toLowerCase().includes('aa')) {
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
                        if (kl.includes('open') || kl.includes('aa') ||
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

        // Agrandar proporciones permanentemente cada frame (para sobreescribir animaciones)
        if (leftBreastRef.current) leftBreastRef.current.scale.set(1.4, 1.4, 1.4);
        if (rightBreastRef.current) rightBreastRef.current.scale.set(1.4, 1.4, 1.4);
        if (leftButtRef.current) leftButtRef.current.scale.set(1.3, 1.3, 1.3);
        if (rightButtRef.current) rightButtRef.current.scale.set(1.3, 1.3, 1.3);
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
                // Forzar escala gigante cada frame para evitar que la animación lo reinicie
                secondary.scale.set(1.4, 1.4, 1.4);
                primary.scale.set(1.4, 1.4, 1.4);
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
        // CRÍTICO: Debe correr DESPUÉS de sincronizar el cabello, para que jiggle 
        // aplique su simulación física sobre la base (ikBaseRotation) recién sincronizada.
        if (jigglePhysicsRef.current) {
            jigglePhysicsRef.current.update(delta, spineRef.current || modelRef.current, t);
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
            console.log('👄 [AvatarViewer3D] Acción HOT:', act);
            // Configurar trigger de animación interna (tongueRef en useFrame)
            if (act === 'suck' || act === 'lick' || act === 'tongue_out') {
                if (tongueMeshRef.current && tongueRef.current !== null) {
                    tongueMeshRef.current.morphTargetInfluences![tongueRef.current] = 1.0;
                }
            } else if (act === 'ahegao') {
                if (tongueMeshRef.current && tongueRef.current !== null) {
                    tongueMeshRef.current.morphTargetInfluences![tongueRef.current] = 0.8;
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
        window.addEventListener('nova-pose', handleNovaPose);
        window.addEventListener('nova-fluid', handleNovaFluid);
        window.addEventListener('nova-touch', handleNovaTouch);

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
            window.removeEventListener('nova-pose', handleNovaPose);
            window.removeEventListener('nova-fluid', handleNovaFluid);
            window.removeEventListener('nova-touch', handleNovaTouch);
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
            bone.rotation[axis] += offset;
            bone.userData[key] = offset;
        };

        if (leftLegRef.current) applyTransientOffset(leftLegRef.current, 'x', -leftKneeUp);
        if (rightLegRef.current) applyTransientOffset(rightLegRef.current, 'x', -rightKneeUp);
        if (leftShineRef.current) applyTransientOffset(leftShineRef.current, 'x', leftKneeUp * 1.5);
        if (rightShineRef.current) applyTransientOffset(rightShineRef.current, 'x', rightKneeUp * 1.5);

        // (Moved applyTransientOffset above)

        // Helper para aplicar offsets de POSICIÓN (para brincos/rebotes)
        const applyTransientPositionOffset = (bone: THREE.Object3D, axis: 'x' | 'y' | 'z', offset: number) => {
            const key = `dancePosOffset_${axis}`;
            if (bone.userData[key]) {
                bone.position[axis] -= bone.userData[key];
            }
            bone.position[axis] += offset;
            bone.userData[key] = offset;
        };

        // Caderas: Balanceo de rotación más lento (igual que las piernas)
        if (hipsRef.current) {
            const swayRot = Math.cos(stepSpeed) * 0.04 * energy; // stepSpeed = t * 0.25 (reducido para no deformar)
            applyTransientOffset(hipsRef.current, 'z', swayRot);
            applyTransientOffset(hipsRef.current, 'y', swayRot * 0.5);
            // Eliminado el offset de posición (bobbing) porque desconecta la cadera de la espina
        }

        // Espalda/Torso y Cuello: Sigue a las caderas con desfase para mover todo el tren superior
        if (spineRef.current) {
            applyTransientOffset(spineRef.current, 'z', Math.sin(stepSpeed) * 0.02 * energy); // Reducido drásticamente
            applyTransientOffset(spineRef.current, 'x', Math.cos(stepSpeed * 2.0) * 0.02 * energy); // Reducido drásticamente
        }

        // Hombros / Brazos: Paso del pachito (Translación alternada para activar jiggle)
        if (leftArmRef.current && rightArmRef.current) {
            // Translación alternada rápida (uno adelante, uno atrás)
            const armShimmy = Math.sin(t * 1.5) * 0.01 * energy; // Reducido para mayor sutileza

            // Pequeño encogimiento de hombros al ritmo
            const shoulderShrug = Math.abs(Math.sin(t * 1.0)) * 0.015 * energy; // Reducido para mayor sutileza

            // Rotación original para los hombros
            applyTransientOffset(leftArmRef.current, 'z', shoulderShrug);
            applyTransientOffset(rightArmRef.current, 'z', -shoulderShrug);

            // TRANSLACIÓN en el eje X (Local) para el paso del pachito (Adelante/Atrás)
            // Como los huesos izquierdo y derecho están espejados en el esqueleto,
            // usar el mismo signo (armShimmy) hará que se muevan alternadamente en el mundo real.
            applyTransientPositionOffset(leftArmRef.current, 'x', armShimmy);
            applyTransientPositionOffset(rightArmRef.current, 'x', armShimmy);

            // Repercusión del movimiento en el pecho (Sincronizado con los hombros)
            if (leftBreastRef.current) {
                applyTransientPositionOffset(leftBreastRef.current, 'x', armShimmy * 0.8);
            }
            if (rightBreastRef.current) {
                applyTransientPositionOffset(rightBreastRef.current, 'x', armShimmy * 0.8);
            }
        }

        // Movimiento procedural de cabeza eliminado para evitar que se desincronice
        // del cuello y del cabello (spine.004, spine.005) durante los bailes.

        // Antebrazos y Muñecas: Movimiento con inercia
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

    return (
        <group>
            <primitive
                ref={modelRef}
                object={gltf.scene}
                scale={2.5}
                position={[0, -1.5, 0]}
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

function FallbackAvatar() {
    const { progress } = useProgress();
    return (
        <Html center>
            <div className="flex flex-col items-center justify-center p-5 bg-[#0a0a14]/90 backdrop-blur-xl rounded-2xl border border-primary/40 shadow-[0_0_30px_rgba(19,19,236,0.3)] text-center min-w-[220px]">
                <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3 shadow-lg"></div>
                <span className="text-sm font-bold text-white tracking-wide">Cargando a Nova...</span>
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

    // Coordenadas objetivo para cada modo
    const targets: Record<string, { pos: THREE.Vector3, look: THREE.Vector3 }> = {
        default: { pos: new THREE.Vector3(0, 3.2, 4.2), look: new THREE.Vector3(0, 2.2, 0) },
        face: { pos: new THREE.Vector3(0, 2.75, 1.6), look: new THREE.Vector3(0, 2.65, 0) },
        body: { pos: new THREE.Vector3(0, 1.5, 2.6), look: new THREE.Vector3(0, 1.1, 0) },
        full: { pos: new THREE.Vector3(0, 1.4, 3.8), look: new THREE.Vector3(0, 1.0, 0) },
        selfie: { pos: new THREE.Vector3(0.4, 2.8, 1.0), look: new THREE.Vector3(0, 2.6, 0) },
        back: { pos: new THREE.Vector3(0, 1.6, -3.8), look: new THREE.Vector3(0, 1.5, 0) },
    };

    // Detectar cambio de modo
    useEffect(() => {
        isTransitioning.current = true;

        // Failsafe: dejar de forzar después de 2s si no ha llegado
        const timer = setTimeout(() => { isTransitioning.current = false; }, 2000);
        return () => clearTimeout(timer);
    }, [viewMode]);

    // Detectar interacción del usuario para cancelar transición
    useEffect(() => {
        const controls = controlsRef.current;
        if (!controls) return;

        const onStart = () => {
            // Si el usuario toca los controles, paramos la transición automática
            isTransitioning.current = false;
        };

        controls.addEventListener('start', onStart);
        return () => controls.removeEventListener('start', onStart);
    }, [controlsRef]);

    useFrame((state, delta) => {
        if (!isTransitioning.current) return;

        const target = targets[viewMode] || targets.default;
        const lerpFactor = 5.0 * delta; // Velocidad de transición

        // Calcular distancias
        const distPos = camera.position.distanceTo(target.pos);
        const distLook = controlsRef.current ? controlsRef.current.target.distanceTo(target.look) : 0;

        // Si estamos muy cerca, terminamos la transición para ahorrar recursos y liberar control
        if (distPos < 0.05 && distLook < 0.05) {
            isTransitioning.current = false;
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
    audioAnalyser = null
}) => {
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
        <div className={`w-full h-full relative rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800 ${getCursorClass()}`}>

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

                {/* ILUMINACIÓN SUAVE ESTILO ANIME: Mayor luz ambiente para reducir sombras duras */}
                <ambientLight intensity={1.2} color="#ffffff" />
                <directionalLight
                    position={[2, 5, 5]}
                    intensity={0.8}
                    color="#fff0e0"
                    castShadow
                />
                {/* Fill light suave para resaltar detalles sin quemar */}
                <pointLight position={[-1.5, 1.5, 3]} intensity={0.5} color="#ffd4a0" />

                {/* Environment neutro para reflejos mínimos */}
                <Environment preset="studio" environmentIntensity={0.2} />

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