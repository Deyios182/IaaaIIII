import React, { useRef, useEffect, Suspense, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { EffectComposer, Bloom, ToneMapping, Vignette } from '@react-three/postprocessing';
import { ToneMappingMode } from 'postprocessing';
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
import { isMixamoAnimation, retargetMixamoClip, getModelBoneNames } from '../utils/mixamoRetargeter';
import { SimplexNoise } from '../utils/perlin';

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

function AvatarModel({ modelUrl, emotion, action, audioElement, isAiSpeaking, isHotMode = false, hairColor, audioAnalyser }: {
    modelUrl: string;
    emotion: Emotion;
    action?: string | null;
    audioElement: HTMLAudioElement | null;
    isAiSpeaking: boolean;
    isHotMode?: boolean;
    hairColor?: string;
    audioAnalyser: AnalyserNode | null;
}) {
    // Si no hay URL, usamos Grokani como base por ser el más estable
    const safeModelUrl = modelUrl || '/models/grokani_lipsync.glb';

    const gltf = useLoader(GLTFLoader, safeModelUrl);

    const modelRef = useRef<THREE.Group>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const lipSyncRef = useRef<LipSyncAnalyzer | null>(null);

    // Generador de Ruido Orgánico (Perlin)
    const simplex = React.useMemo(() => new SimplexNoise(), []);

    // Refs específicos para GrokAni / Anime
    const tongueRef = useRef<number | null>(null);
    const tongueMeshRef = useRef<THREE.Mesh | null>(null);

    // Refs de huesos estándar
    const headBoneRef = useRef<THREE.Bone | null>(null);
    const rightArmRef = useRef<THREE.Bone | null>(null);
    const leftArmRef = useRef<THREE.Bone | null>(null);
    const rightArmOriginalRot = useRef<THREE.Euler | null>(null); // Rotación original
    const leftArmOriginalRot = useRef<THREE.Euler | null>(null);
    const rightForeArmRef = useRef<THREE.Bone | null>(null);
    const leftForeArmRef = useRef<THREE.Bone | null>(null);
    const leftLegRef = useRef<THREE.Bone | null>(null);
    const rightLegRef = useRef<THREE.Bone | null>(null);
    // Body Parts Refs
    const hipsRef = useRef<THREE.Object3D | null>(null); // Detected Hips
    const spineRef = useRef<THREE.Object3D | null>(null); // Para respiración mejorada
    const lastSpineRot = useRef<THREE.Euler>(new THREE.Euler()); // Para inercia
    const musicEnergyRef = useRef(0); // Audio Reactivity Energy

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
    const leftBreastRef = useRef<THREE.Bone | null>(null);
    const rightBreastRef = useRef<THREE.Bone | null>(null);
    const leftButtRef = useRef<THREE.Bone | null>(null);
    const rightButtRef = useRef<THREE.Bone | null>(null);
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

    // --- DANCE & SWAY REFS ---
    const isDancing = useRef(false);
    const hairBonesRef = useRef<THREE.Object3D[]>([]);
    const skirtBonesRef = useRef<THREE.Object3D[]>([]);

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
            // NOTA: Añadimos morphs de VRoid/VRM comunes ('Joy', 'Fun', 'Fcl_ALL_Joy', etc)
            // porque si se quedan atascados en 1.0, bloquean completamente el movimiento de los labios.
            const morphsToReset = ['BrowsDown', 'BrowsUp', 'Smile', 'Frown', 'MouthOpen', 'Joy', 'Fun', 'Angry', 'Sorrow', 'Fcl_ALL_Joy', 'Fcl_ALL_Fun', 'Fcl_ALL_Angry', 'Fcl_ALL_Sorrow', 'Fcl_MTH_Joy', 'Fcl_MTH_Fun'];
            morphsToReset.forEach(m => {
                // Busqueda case insensitive
                const key = Object.keys(mesh.morphTargetDictionary).find(k => k.toLowerCase() === m.toLowerCase());
                if (key !== undefined) {
                    const idx = mesh.morphTargetDictionary[key];
                    if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 0, 0.1);
                }
            });

            const morphKeys = Object.keys(mesh.morphTargetDictionary);
            const closeMorphs = morphKeys.filter(k => {
                const lower = k.toLowerCase();
                return lower.includes('sil') || lower === 'vrc.v_sil' || lower.includes('mouthclose') || lower === 'fcl_mth_close';
            });
            
            closeMorphs.forEach(m => {
                const idx = mesh.morphTargetDictionary[m];
                const targetVal = isSpeaking ? 0.0 : 1.0;
                if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], targetVal, 0.2);
            });

            // Aplicar nuevos según emoción
            if (currentEmotion === 'angry') {
                const idx = mesh.morphTargetDictionary['BrowsDown'];
                if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 1.0, 0.1);
            } else if (currentEmotion === 'happy' || currentEmotion === 'excited') {
                const idx = mesh.morphTargetDictionary['Smile'];
                if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 0.7, 0.1);
            } else if (currentEmotion === 'sad') {
                const idx = mesh.morphTargetDictionary['Frown'];
                if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 0.8, 0.1);
                const idxBrows = mesh.morphTargetDictionary['BrowsUp'];
                if (idxBrows !== undefined) mesh.morphTargetInfluences![idxBrows] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idxBrows], 0.5, 0.1);
            } else if (currentEmotion === 'surprised') {
                const idx = mesh.morphTargetDictionary['BrowsUp'];
                if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 1.0, 0.1);
                const idxMouth = mesh.morphTargetDictionary['MouthOpen'];
                if (idxMouth !== undefined) mesh.morphTargetInfluences![idxMouth] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idxMouth], 0.4, 0.1);
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
                                meshName.includes('blush')
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
                                mat.side = THREE.DoubleSide;
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
                                mat.transparent = false;
                                mat.depthWrite = true;
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

            modelRef.current.traverse((child) => {
                if (child instanceof THREE.Mesh) {
                    const name = child.name.toLowerCase();

                    // DETECCIÓN DE PARTES ESPECIALES
                    // CRÍTICO: Ocultar el blush por defecto - cubre toda la cara
                    if (name.includes('blush')) {
                        if (SHOW_VERBOSE_LOGS) console.log('😊 Ocultando mesh de blush:', child.name);
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
                const isJigglePart = /breast|ass_|ass-|pectoral|glute|butt/.test(lowerName);

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

                    if (name.includes('head')) headBoneRef.current = child as any;
                    if (name.includes('spine') || name.includes('body')) spineRef.current = child as any;
                    if (name.includes('hips') || name.includes('pelvis') || name.includes('grokani_hips')) {
                        if (SHOW_VERBOSE_LOGS) console.log('💃 Hips/Pelvis found:', name);
                        hipsRef.current = child as any;
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
                    // Nombres reales encontrados en el dump: wgt-grokani_breast_masterl, etc.
                    const exactName = child.name;
                    // Normalizar: quitar prefijos molestos si queremos, pero mejor check directo

                    if (exactName === 'breast_master.L' || name === 'wgt-grokani_breast_masterl' || name === 'wgt-grokani_breastl') {
                        if (SHOW_VERBOSE_LOGS) console.log('🎯 HARDCODED HIT: Left Breast');
                        leftBreastRef.current = child as any;
                    }
                    if (exactName === 'breast_master.R' || name === 'wgt-grokani_breast_masterr' || name === 'wgt-grokani_breastr') {
                        if (SHOW_VERBOSE_LOGS) console.log('🎯 HARDCODED HIT: Right Breast');
                        rightBreastRef.current = child as any;
                    }
                    if (exactName === 'ass_master.L' || name === 'wgt-grokani_ass_masterl') {
                        if (SHOW_VERBOSE_LOGS) console.log('🎯 HARDCODED HIT: Left Butt');
                        leftButtRef.current = child as any;
                    }
                    if (exactName === 'ass_master.R' || name === 'wgt-grokani_ass_masterr') {
                        if (SHOW_VERBOSE_LOGS) console.log('🎯 HARDCODED HIT: Right Butt');
                        rightButtRef.current = child as any;
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
                    // Agregado 'ass' para modelos Rigify/Blender
                    if (name.includes('glute') || name.includes('butt') || name.includes('pelvis') || name.includes('ass_') || name.includes('ass-')) {
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

                    // Huesos de labios
                    if (name.includes('lip')) {
                        if (SHOW_VERBOSE_LOGS) console.log('🔍 Hueso con "lip":', child.name);
                    }
                    if (name === 'def-lip.t.l' && !lipTopBoneRef.current) {
                        lipTopBoneRef.current = child as any;
                        lipTopOriginalPos.current = child.position.clone();
                    }
                    if (name === 'def-lip.t.r' && !lipTopRightRef.current) {
                        lipTopRightRef.current = child as any;
                        lipTopRightOriginalPos.current = child.position.clone();
                    }
                    if (name === 'def-lip.b.l' && !lipBottomBoneRef.current) {
                        lipBottomBoneRef.current = child as any;
                        lipBottomOriginalPos.current = child.position.clone();
                    }
                    if (name === 'def-lip.b.r' && !lipBottomRightRef.current) {
                        lipBottomRightRef.current = child as any;
                        lipBottomRightOriginalPos.current = child.position.clone();
                    }
                    // Huesos externos (.001)
                    if (name === 'def-lip.t.l.001' && !lipTopOuterRef.current) {
                        lipTopOuterRef.current = child as any;
                        lipTopOuterOriginalPos.current = child.position.clone();
                    }
                    if (name === 'def-lip.t.r.001' && !lipTopRightOuterRef.current) {
                        lipTopRightOuterRef.current = child as any;
                        lipTopRightOuterOriginalPos.current = child.position.clone();
                    }
                    if (name === 'def-lip.b.l.001' && !lipBottomOuterRef.current) {
                        lipBottomOuterRef.current = child as any;
                        lipBottomOuterOriginalPos.current = child.position.clone();
                    }
                    if (name === 'def-lip.b.r.001' && !lipBottomRightOuterRef.current) {
                        lipBottomRightOuterRef.current = child as any;
                        lipBottomRightOuterOriginalPos.current = child.position.clone();
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
                        if (isRight) {
                            if (isDef || !rightForeArmRef.current) {
                                rightForeArmRef.current = child as any;
                                if (SHOW_VERBOSE_LOGS) console.log('💪 Antebrazo DERECHO asignado:', child.name);
                            }
                        }
                        if (isLeft) {
                            if (isDef || !leftForeArmRef.current) {
                                leftForeArmRef.current = child as any;
                                if (SHOW_VERBOSE_LOGS) console.log('💪 Antebrazo IZQUIERDO asignado:', child.name);
                            }
                        }
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

                    // Piernas (thigh/upleg)
                    const isLeg = name.includes('thigh') || name.includes('upleg') || name.includes('upper_leg') || name.includes('upperleg');
                    if (isLeg) {
                        const isDef = name.startsWith('def-');
                        if (isRight) {
                            if (isDef || !rightLegRef.current) {
                                rightLegRef.current = child as any;
                                rightLegOriginalRot.current = child.rotation.clone();
                                rightLegOriginalPos.current = child.position.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('🦵 Pierna DERECHA asignada:', child.name);
                            }
                        }
                        if (isLeft) {
                            if (isDef || !leftLegRef.current) {
                                leftLegRef.current = child as any;
                                leftLegOriginalRot.current = child.rotation.clone();
                                leftLegOriginalPos.current = child.position.clone();
                                if (SHOW_VERBOSE_LOGS) console.log('🦵 Pierna IZQUIERDA asignada:', child.name);
                            }
                        }
                    }

                    // Espinilla/Tibia (shin/calf) — para flexión de rodilla
                    const isShinBone = name.includes('shin') || name.includes('calf') || name.includes('lower_leg') || name.includes('lowerleg') || name.includes('knee');
                    if (isShinBone) {
                        const isDef = name.startsWith('def-');
                        if (isRight && (isDef || !rightShineRef.current)) {
                            rightShineRef.current = child as any;
                            rightShineOriginalRot.current = child.rotation.clone();
                            if (SHOW_VERBOSE_LOGS) console.log('🦵 Espinilla DERECHA asignada:', child.name);
                        }
                        if (isLeft && (isDef || !leftShineRef.current)) {
                            leftShineRef.current = child as any;
                            leftShineOriginalRot.current = child.rotation.clone();
                            if (SHOW_VERBOSE_LOGS) console.log('🦵 Espinilla IZQUIERDA asignada:', child.name);
                        }
                    }
                }
            });

            setMorphTargetMeshes(meshes);
            setVisemeMap(newVisemeMap);

            // Inicializar LipSync
            if (!lipSyncRef.current) lipSyncRef.current = new LipSyncAnalyzer();
            lipSyncRef.current.initialize(modelRef.current);

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
            isGrokAniRef.current = isGrokAni;

            if (gltf.animations.length > 0) {
                // FILTRAR tracks de brazos/manos de las animaciones para que el sistema procedural los controle
                const filteredAnims = gltf.animations.map(clip => {
                    const filtered = clip.clone();
                    filtered.tracks = clip.tracks.filter(track => {
                        const tn = track.name.toLowerCase();
                        if (isGrokAni) {
                            // Excluir tracks de brazos, manos, dedos Y PIERNAS para control procedural total
                            const isControlledByProc = (
                                /upper_?arm|fore_?arm|lower_?arm|hand|shoulder|clavicle|elbow|wrist|finger|f_index|f_middle|f_ring|f_pinky|thumb|palm/i.test(tn) ||
                                /thigh|upleg|upper_?leg|shin|calf|lower_?leg/i.test(tn)
                            );
                            return !isControlledByProc;
                        } else {
                            // Para otros modelos, no removemos piernas ni caderas, solo los tracks de brazos
                            const isArmTrack = (
                                /upper_?arm|fore_?arm|lower_?arm|hand|shoulder|elbow|wrist/i.test(tn)
                            );
                            return !isArmTrack;
                        }
                    });
                    console.log(`🎬 Clip "${clip.name}": ${clip.tracks.length} tracks → ${filtered.tracks.length} (${clip.tracks.length - filtered.tracks.length} arm tracks removidos)`);
                    return filtered;
                });
                animationManagerRef.current = new AnimationManager(modelRef.current, filteredAnims);
                console.log('✅ AnimationManager inicializado con', filteredAnims.length, 'clips (brazos libres)');
            } else {
                console.warn('⚠️ No hay animaciones en el modelo - AnimationManager no inicializado');
            }

            // 2. IK Controller - Head & Eye tracking + Arm IK (Sistema Nervioso)
            ikControllerRef.current = new IKController();
            ikControllerRef.current.initialize(modelRef.current);

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

            console.log(`📍 RESUMEN MODELO:`,
                `Meshes con morphs: ${meshes.length}`,
                `| VisemeMap: ${Object.keys(newVisemeMap).join(', ') || 'NINGUNO'}`,
                `| JawBone: ${jawBoneRef.current?.name || 'NO ENCONTRADO'}`,
                `| Animaciones: ${gltf.animations.map(a => a.name).join(', ') || 'NINGUNA'}`,
                `| Huesos (${allBones.length}):`, allBones.join(', ')
            );

            // --- CONFIGURACIÓN DE VISIBILIDAD POR DEFECTO PARA ANI NOVA ---
            if (isGrokAni) {
                modelRef.current.traverse((child: any) => {
                    if (child.isMesh) {
                        const name = child.name;
                        // Ocultar meshes conflictivos/duplicados para evitar z-fighting e interferencias visuales
                        if (name === 'Ani_MainFlatFooted' || name === 'Boots' || name === 'Pants' || name === 'Dress002' || name === 'Ani_GlovesSexy' || name === 'Skirt') {
                            child.visible = false;
                            console.log(`🚫 [DefaultVisibility] Ocultando mesh conflictivo: ${name}`);
                        }
                    }
                });
            }

            // --- FORZAR POSE NEUTRA (BRAZOS ABAJO) ---
            // DIAGNÓSTICO FINAL: 
            // - Z (+75) -> Atrás
            // - X (+75) -> ARRIBA (Confirmado por foto)
            // CONCLUSIÓN: X es el eje Vertical. Positivo es Arriba.
            // SOLUCIÓN: Usar X NEGATIVO para bajar los brazos.
            // INICIALIZAR GESTOR DE ROPA
            getClothingManager().initialize(modelRef.current);

            const forceArmsDown = () => {
                const armDownRot = THREE.MathUtils.degToRad(-80); // 80 grados ABAJO (Negativo)

                if (rightArmRef.current) {
                    rightArmRef.current.rotation.set(0, 0, 0);
                    rightArmRef.current.rotation.z = 0;
                    rightArmRef.current.rotation.x = armDownRot; // X Negativo

                    // Ajuste sutil Z para naturalidad (separar del cuerpo)
                    rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(10);
                    rightArmOriginalRot.current = rightArmRef.current.rotation.clone();
                }
                if (leftArmRef.current) {
                    leftArmRef.current.rotation.set(0, 0, 0);
                    // X Negativo también (si +X fue arriba en el izquierdo, -X es abajo)
                    leftArmRef.current.rotation.x = armDownRot;

                    // Ajuste sutil
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
        }

        // Cleanup on unmount
        return () => {
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
                    console.log(`📦 GLB cargado: ${animations.length} animaciones`);
                }

                if (animations.length > 0) {
                    const boneNames = getModelBoneNames(modelRef.current!);

                    // Encontrar el skeleton del modelo target
                    let skeleton: THREE.Skeleton | null = null;
                    modelRef.current!.traverse((child: any) => {
                        if (child.isSkinnedMesh && child.skeleton && !skeleton) {
                            skeleton = child.skeleton;
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

            const animName = getAnimationName(action);

            // 1. Intentar con AnimationManager (clips de Blender)
            let played = false;
            if (animationManagerRef.current) {
                const finalName = animName === 'Idle' && !action.toLowerCase().includes('idle')
                    ? action.charAt(0).toUpperCase() + action.slice(1).toLowerCase()
                    : animName;
                played = animationManagerRef.current.play(finalName, { priority: 10, loop: true });
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

        // === ACTUALIZAR NUEVOS SISTEMAS ===
        if (animationManagerRef.current) animationManagerRef.current.update(delta);
        if (proceduralAnimatorRef.current) proceduralAnimatorRef.current.update(t, delta);

        // === Si hay animación externa (Mixamo), procesar parpadeo ===
        if (externalAnimPlayingRef.current) {
            // Solo actualizar parpadeo y lipsync (no afectan huesos directamente)
            blinkTimer.current += delta;
            if (blinkTimer.current >= nextBlinkTime.current) {
                isBlinking.current = true;
                if (blinkTimer.current >= nextBlinkTime.current + blinkDuration) {
                    isBlinking.current = false;
                    blinkTimer.current = 0;
                    nextBlinkTime.current = 2.5 + Math.random() * 4;
                }
            }
            // NOTA: No retornamos temprano para permitir que el IK y gesticulación procedural operen sobre el esqueleto
        }

        // --- SACCADIC EYE MOVEMENTS (MICRO-MOVIMIENTOS) ---
        if (ikControllerRef.current?.isInitialized()) {
            saccadeTimer.current += delta;
            if (saccadeTimer.current > nextSaccadeTime.current) {
                // Generar nuevo micro-offset aleatorio
                const range = 0.05; // Rango muy sutil (en metros/world units)
                const microOffset = new THREE.Vector3(
                    (Math.random() - 0.5) * range * 0.5, // X: Izq/Der
                    (Math.random() - 0.5) * range * 0.2, // Y: Arriba/Abajo (menos rango)
                    0
                );

                ikControllerRef.current.setMicroOffset(microOffset);

                saccadeTimer.current = 0;
                nextSaccadeTime.current = 2.0 + Math.random() * 3.0; // 2-5 segundos entre saltos
            }

            ikControllerRef.current.setLookTargetFromScreen(state.pointer.x, state.pointer.y, 3);
            ikControllerRef.current.update(delta, externalAnimPlayingRef.current);
        }

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
            // A. RESPIRACIÓN REALISTA (No solo arriba/abajo, sino expansión de pecho)
            const breathT = t * (isHotMode ? 3.0 : 1.0) * moodInfluence.breathingSpeed;
            const inhale = Math.sin(breathT); // -1 a 1

            // Movimiento vertical sutil (Pecho sube al inhalar)
            // Usamos lerp para suavizar cambios bruscos de mood
            const targetY = -0.5 + (inhale * 0.005 * moodInfluence.expressionIntensity * proceduralLayerWeight);
            modelRef.current.position.y = THREE.MathUtils.lerp(modelRef.current.position.y, targetY, 0.1);

            // B. MICRO-BALANCEO (Spine/Columna)
            // Esto evita que parezca "clavada" al suelo. Se balancea sutilmente como si mantuviera el equilibrio.
            if (spineRef.current && proceduralLayerWeight > 0.01) {
                // Ruido orgánico para rotación (Simplex)
                // Multiplicamos por proceduralLayerWeight para que no afecte a poses de animaciones (ej: sentada)
                const noiseX = simplex.noise2D(t * 0.5, 0) * 0.02 * moodInfluence.idleVariation * proceduralLayerWeight;
                const noiseY = simplex.noise2D(t * 0.3, 100) * 0.015 * moodInfluence.idleVariation * proceduralLayerWeight;
                const noiseZ = simplex.noise2D(t * 0.4, 200) * 0.01 * moodInfluence.idleVariation * proceduralLayerWeight;

                // Combinar micro-balanceo con respiración (hot breathing)
                const breathIntensity = spineRef.current.userData.hotBreathIntensity || 1.0;
                const breathX = inhale * 0.015 * breathIntensity * proceduralLayerWeight;
                const targetRotX = noiseX + breathX;

                // Aplicar suavemente
                spineRef.current.rotation.x = THREE.MathUtils.lerp(spineRef.current.rotation.x, targetRotX, 0.1);
                spineRef.current.rotation.y = THREE.MathUtils.lerp(spineRef.current.rotation.y, noiseY, 0.1);
                spineRef.current.rotation.z = THREE.MathUtils.lerp(spineRef.current.rotation.z, noiseZ, 0.1);

                // Mover piernas sutilmente junto con el balanceo del cuerpo
                if (rightLegRef.current) {
                    rightLegRef.current.rotation.z = THREE.MathUtils.lerp(rightLegRef.current.rotation.z, noiseZ * 0.35, 0.05);
                }
                if (leftLegRef.current) {
                    leftLegRef.current.rotation.z = THREE.MathUtils.lerp(leftLegRef.current.rotation.z, -noiseZ * 0.35, 0.05);
                }

                // Extra en Hot Mode
                if (isHotMode) {
                    spineRef.current.rotation.z += Math.sin(t * 2) * 0.02 * proceduralLayerWeight;
                }
            }

            // C. CABEZA "FLOTANTE" (Head Stabilization)
            if (headBoneRef.current && spineRef.current && proceduralLayerWeight > 0.01) {
                // Contrarrestar sutilmente el movimiento del cuerpo para mantener la mirada estable
                const counterX = -spineRef.current.rotation.x * 0.5;
                const counterY = -spineRef.current.rotation.y * 0.5;

                // Añadir "Sacadas" (movimientos rápidos y pequeños de atención) - Simplex Noise
                const attentionNoise = simplex.noise2D(t, 600) * 0.05 * moodInfluence.expressionIntensity * proceduralLayerWeight;

                // Aplicar suavemente
                headBoneRef.current.rotation.x = THREE.MathUtils.lerp(headBoneRef.current.rotation.x, counterX + attentionNoise * 0.2, 0.1);
                headBoneRef.current.rotation.y = THREE.MathUtils.lerp(headBoneRef.current.rotation.y, counterY + attentionNoise, 0.1);
            }
        }

        // --- GESTOS / ACCIONES ---
        // Gestión de brazos: si el ProceduralAnimator está activo, él controla los brazos.
        // Si no, devolvemos suavemente a pose de descanso natural.

        // --- 🦵 REALISTIC BIOMECHANICS & KNEE HANGING PHYSICS ---
        if (!externalAnimPlayingRef.current && leftLegRef.current && rightLegRef.current) {
            const legReturnSpeed = 0.025;
            const isActive = !action && proceduralLayerWeight > 0.01;

            if (isActive) {
                // --- MODO INACTIVO (REPOSO): Retornar suavemente al STAND con cambio de peso orgánico (Weight Shifting) ---
                // Dos ondas súper lentas, desfasadas y con ritmos distintos para evitar simetría robótica
                const leftIdleLift = Math.max(0, Math.sin(t * 0.45) * 0.03 - 0.008);  // Ritmo 1: ~14 segundos por ciclo (elevación ultra sutil ~1.2°)
                const rightIdleLift = Math.max(0, Math.sin(t * 0.31 + 2.5) * 0.03 - 0.008); // Ritmo 2: ~20 segundos por ciclo, desfasado

                if (leftLegOriginalRot.current) {
                    leftLegRef.current.rotation.x = THREE.MathUtils.lerp(
                        leftLegRef.current.rotation.x,
                        leftLegOriginalRot.current.x + leftIdleLift, // Micro-elevación ociosa
                        legReturnSpeed
                    );
                    leftLegRef.current.rotation.y = THREE.MathUtils.lerp(
                        leftLegRef.current.rotation.y,
                        leftLegOriginalRot.current.y - leftIdleLift * 0.12, // Apertura rotacional ociosa
                        legReturnSpeed
                    );
                    leftLegRef.current.rotation.z = THREE.MathUtils.lerp(
                        leftLegRef.current.rotation.z,
                        leftLegOriginalRot.current.z - leftIdleLift * 0.15, // Abducción lateral ociosa
                        legReturnSpeed
                    );
                }
                if (leftLegOriginalPos.current) {
                    // Retornar posición a original
                    leftLegRef.current.position.copy(leftLegOriginalPos.current);
                }

                if (rightLegOriginalRot.current) {
                    rightLegRef.current.rotation.x = THREE.MathUtils.lerp(
                        rightLegRef.current.rotation.x,
                        rightLegOriginalRot.current.x + rightIdleLift,
                        legReturnSpeed
                    );
                    rightLegRef.current.rotation.y = THREE.MathUtils.lerp(
                        rightLegRef.current.rotation.y,
                        rightLegOriginalRot.current.y + rightIdleLift * 0.12,
                        legReturnSpeed
                    );
                    rightLegRef.current.rotation.z = THREE.MathUtils.lerp(
                        rightLegRef.current.rotation.z,
                        rightLegOriginalRot.current.z + rightIdleLift * 0.15,
                        legReturnSpeed
                    );
                }
                if (rightLegOriginalPos.current) {
                    rightLegRef.current.position.copy(rightLegOriginalPos.current);
                }

                // Cuelgue natural leve + rodilla colgante proporcional al peso ocioso levantado
                const naturalKneeFlex = THREE.MathUtils.degToRad(3);
                if (leftShineRef.current && leftShineOriginalRot.current) {
                    leftShineRef.current.rotation.x = THREE.MathUtils.lerp(
                        leftShineRef.current.rotation.x,
                        leftShineOriginalRot.current.x + naturalKneeFlex + leftIdleLift * 0.9,
                        legReturnSpeed
                    );
                }
                if (rightShineRef.current && rightShineOriginalRot.current) {
                    rightShineRef.current.rotation.x = THREE.MathUtils.lerp(
                        rightShineRef.current.rotation.x,
                        rightShineOriginalRot.current.x + naturalKneeFlex + rightIdleLift * 0.9,
                        legReturnSpeed
                    );
                }
            } else {
                // --- MODO ACTIVO (LEVANTADO): Biomecánica Realista y Gravedad ---
                // 1. Flexión del fémur: Desviación absoluta respecto al reposo únicamente en el eje X (elevación frontal)
                // Excluimos Z e Y de este cálculo para romper el bucle de retroalimentación infinita
                const leftFemurFlex = leftLegOriginalRot.current
                    ? Math.abs(leftLegRef.current.rotation.x - leftLegOriginalRot.current.x)
                    : 0;
                const rightFemurFlex = rightLegOriginalRot.current
                    ? Math.abs(rightLegRef.current.rotation.x - rightLegOriginalRot.current.x)
                    : 0;

                // 2. ABDUCCIÓN (Abrir hacia afuera) y ROTACIÓN EXTERNA:
                // Si el fémur sube, se abre lateralmente y gira el muslo hacia afuera (diva)
                if (leftLegOriginalRot.current && leftFemurFlex > 0.05) {
                    // Abrir hacia afuera (Z negativo en este rig) y rotación externa (Y negativo)
                    leftLegRef.current.rotation.z = THREE.MathUtils.lerp(
                        leftLegRef.current.rotation.z,
                        leftLegOriginalRot.current.z - leftFemurFlex * 0.15, // Suavizado a 0.15 para una abducción más contenida y estética
                        0.1
                    );
                    leftLegRef.current.rotation.y = THREE.MathUtils.lerp(
                        leftLegRef.current.rotation.y,
                        leftLegOriginalRot.current.y - leftFemurFlex * 0.08, // Suavizado a 0.08 para evitar enrosques de cadera
                        0.1
                    );
                }
                if (rightLegOriginalRot.current && rightFemurFlex > 0.05) {
                    // Abrir hacia afuera (Z positivo en este rig) y rotación externa (Y positivo)
                    rightLegRef.current.rotation.z = THREE.MathUtils.lerp(
                        rightLegRef.current.rotation.z,
                        rightLegOriginalRot.current.z + rightFemurFlex * 0.15,
                        0.1
                    );
                    rightLegRef.current.rotation.y = THREE.MathUtils.lerp(
                        rightLegRef.current.rotation.y,
                        rightLegOriginalRot.current.y + rightFemurFlex * 0.08,
                        0.1
                    );
                }

                // 3. CORRECTOR DE VOLUMEN DE GLÚTEO (Corrective Joint Translation):
                // Para evitar que la malla del glúteo se aplaste al levantar el fémur, desplazamos ligeramente el fémur hacia adelante y abajo para preservar el volumen
                if (leftLegOriginalPos.current && leftFemurFlex > 0.05) {
                    leftLegRef.current.position.y = THREE.MathUtils.lerp(
                        leftLegRef.current.position.y,
                        leftLegOriginalPos.current.y - leftFemurFlex * 0.015, // Mover sutilmente abajo para relajar la malla del glúteo
                        0.1
                    );
                    leftLegRef.current.position.x = THREE.MathUtils.lerp(
                        leftLegRef.current.position.x,
                        leftLegOriginalPos.current.x - leftFemurFlex * 0.008, // Mover sutilmente hacia afuera
                        0.1
                    );
                }
                if (rightLegOriginalPos.current && rightFemurFlex > 0.05) {
                    rightLegRef.current.position.y = THREE.MathUtils.lerp(
                        rightLegRef.current.position.y,
                        rightLegOriginalPos.current.y - rightFemurFlex * 0.015,
                        0.1
                    );
                    rightLegRef.current.position.x = THREE.MathUtils.lerp(
                        rightLegRef.current.position.x,
                        rightLegOriginalPos.current.x + rightFemurFlex * 0.008,
                        0.1
                    );
                }

                // 4. CAÍDA POR GRAVEDAD (Flexión de Rodilla / Tibia):
                // Cuanto más se levanta el fémur, más cae la rodilla hacia atrás por el peso de la pierna y el pie
                if (leftShineRef.current && leftShineOriginalRot.current && leftFemurFlex > 0.05) {
                    const kneeTarget = leftShineOriginalRot.current.x + leftFemurFlex * 0.9; // Bending de rodilla natural y elegante
                    leftShineRef.current.rotation.x = THREE.MathUtils.lerp(
                        leftShineRef.current.rotation.x,
                        kneeTarget,
                        0.15
                    );
                }
                if (rightShineRef.current && rightShineOriginalRot.current && rightFemurFlex > 0.05) {
                    const kneeTarget = rightShineOriginalRot.current.x + rightFemurFlex * 0.9;
                    rightShineRef.current.rotation.x = THREE.MathUtils.lerp(
                        rightShineRef.current.rotation.x,
                        kneeTarget,
                        0.15
                    );
                }
            }
        }

        if (!isProceduralPlaying && !action && !externalAnimPlayingRef.current && isGrokAniRef.current) {
            // --- RELAX / IDLE ARMS ---
            const baseDownX = THREE.MathUtils.degToRad(-82);
            const baseForwardZ = THREE.MathUtils.degToRad(-10);

            if (isAiSpeaking) {
                // --- AUTO GESTOS AL HABLAR ---
                const gestureSpeed = 5;
                const noise = Math.sin(t * gestureSpeed) * Math.cos(t * gestureSpeed * 0.7);
                const liftAmount = THREE.MathUtils.degToRad(25);

                if (rightArmRef.current) {
                    const targetX = baseDownX + (liftAmount * (0.5 + 0.5 * Math.sin(t * 3)));
                    const targetZ = THREE.MathUtils.degToRad(-15) + (noise * 0.1);
                    rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetX, 0.06);
                    rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetZ, 0.06);
                }
                if (leftArmRef.current) {
                    const targetX = baseDownX + (liftAmount * (0.5 + 0.5 * Math.sin(t * 3 + 1)));
                    const targetZ = THREE.MathUtils.degToRad(15) - (noise * 0.1);
                    leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetX, 0.06);
                    leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetZ, 0.06);
                }

                // Flexión natural de los codos (forearms) al hablar
                if (rightForeArmRef.current) {
                    const targetElbow = THREE.MathUtils.degToRad(35 + Math.sin(t * 4) * 20);
                    rightForeArmRef.current.rotation.z = THREE.MathUtils.lerp(rightForeArmRef.current.rotation.z, targetElbow, 0.06);
                }
                if (leftForeArmRef.current) {
                    const targetElbow = THREE.MathUtils.degToRad(-35 - Math.sin(t * 4 + 1) * 20);
                    leftForeArmRef.current.rotation.z = THREE.MathUtils.lerp(leftForeArmRef.current.rotation.z, targetElbow, 0.06);
                }

                // Ciclado de posturas de las manos
                const now = state.clock.elapsedTime;
                if (now - lastHandPoseTime.current > 2.0) {
                    lastHandPoseTime.current = now;
                    speakerPoseIndex.current = (speakerPoseIndex.current + 1) % speakerPoseCycle.current.length;
                    const nextPose = speakerPoseCycle.current[speakerPoseIndex.current];
                    window.dispatchEvent(new CustomEvent('aiko-hand-pose', {
                        detail: { side: 'BOTH', pose: nextPose }
                    }));
                }
                wasSpeakingRef.current = true;
            } else {
                // --- POSE DE DESCANSO (brazos abajo con micro-movimientos) ---
                const lerpReturn = 0.04; // Velocidad suave de retorno
                const microSway = Math.sin(t * 0.8) * THREE.MathUtils.degToRad(2); // Micro-balanceo natural

                if (rightArmRef.current) {
                    rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, baseDownX + microSway, lerpReturn);
                    rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, baseForwardZ, lerpReturn);
                }
                if (leftArmRef.current) {
                    leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, baseDownX - microSway, lerpReturn);
                    leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, -baseForwardZ, lerpReturn);
                }

                // Retornar codos suavemente a 0
                if (rightForeArmRef.current) {
                    rightForeArmRef.current.rotation.z = THREE.MathUtils.lerp(rightForeArmRef.current.rotation.z, 0, lerpReturn);
                }
                if (leftForeArmRef.current) {
                    leftForeArmRef.current.rotation.z = THREE.MathUtils.lerp(leftForeArmRef.current.rotation.z, 0, lerpReturn);
                }

                // Retornar manos a RELAX al dejar de hablar (solo update interno)
                if (wasSpeakingRef.current) {
                    wasSpeakingRef.current = false;
                    fingerPoseRef.current.name = 'RELAX';
                    fingerPoseRef.current.timer = 0;
                }
            }
        }
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

        // --- 2. CONTROL \"MODO HOT\" (Lengua) ---
        if (tongueMeshRef.current && tongueRef.current !== null) {
            const current = tongueMeshRef.current.morphTargetInfluences![tongueRef.current];
            const targetTongue = isHotMode ? 0.6 : 0;
            tongueMeshRef.current.morphTargetInfluences![tongueRef.current] =
                THREE.MathUtils.lerp(current, targetTongue, delta * 5);
        }

        // --- 3. PARPADEO Y LIPSYNC ---
        blinkTimer.current += delta;
        if (blinkTimer.current >= nextBlinkTime.current) {
            isBlinking.current = true;
            if (blinkTimer.current >= nextBlinkTime.current + blinkDuration) {
                isBlinking.current = false;
                blinkTimer.current = 0;
                nextBlinkTime.current = 2.5 + Math.random() * 4;
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

        const blinkValue = isBlinking.current ? 1 : (isHotMode ? 0.3 : 0);

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

        // Si el AI está hablando pero no hay audio analizado, usar ciclo procedimental de vocales
        if (isAiSpeaking && (mouthIntensity < 0.05 || !audioAnalyser)) {
            const cycleSpeed = 8; // velocidad de cambio de vocal
            const visemeCycle = ['A', 'E', 'I', 'O', 'U'];
            const cycleIndex = Math.floor(t * cycleSpeed) % visemeCycle.length;
            currentViseme = visemeCycle[cycleIndex];
            mouthIntensity = 0.45 + Math.sin(t * 12) * 0.25; // oscilar para que no esté estático
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
            // 🆕 Validar que jawOriginalRotation tenga valores válidos
            if (isNaN(jawOriginalRotation.current.x) || isNaN(jawOriginalRotation.current.z)) {
                console.warn('⚠️ jawOriginalRotation tiene valores inválidos, resetando...');
                jawOriginalRotation.current.copy(jawBoneRef.current.rotation);
            }

            // Determinar factor de apertura del jaw según el viseme
            let jawFactor = 0;
            if (isAiSpeaking) {
                if (currentViseme === 'A') jawFactor = 1.0;
                else if (currentViseme === 'E') jawFactor = 0.6;
                else if (currentViseme === 'I') jawFactor = 0.3;
                else if (currentViseme === 'O') jawFactor = 0.8;
                else if (currentViseme === 'U') jawFactor = 0.45;
                else jawFactor = 0.5;
            }

            // Rotar la mandíbula para abrir la boca
            const maxJawRotation = Math.PI / 6.5; // ~27 grados max

            const jawName = jawBoneRef.current.name.toLowerCase();
            const isDazModel = jawName.includes('lowerjaw') || jawName.includes('genesis');

            if (isDazModel) {
                // DAZ: rotación en Z (hacia abajo)
                const baseJawZ = isAiSpeaking ? 0 : 0.05; // Forzar cierre (Z positivo sube mandíbula)
                const targetZ = jawOriginalRotation.current.z + baseJawZ - (autoMouthOpen * jawFactor * maxJawRotation);
                const clampedTargetZ = THREE.MathUtils.clamp(
                    targetZ,
                    jawOriginalRotation.current.z - Math.PI / 4,
                    jawOriginalRotation.current.z + Math.PI / 12
                );

                jawBoneRef.current.rotation.z = THREE.MathUtils.lerp(
                    jawBoneRef.current.rotation.z,
                    clampedTargetZ,
                    0.25
                );

                if (isNaN(jawBoneRef.current.rotation.z)) {
                    jawBoneRef.current.rotation.z = jawOriginalRotation.current.z;
                }
            } else {
                // Blender/otros: rotación en X
                // Sin forzar cierre para evitar que los dientes sobresalgan hacia adelante
                const baseJawX = 0; 
                const targetX = jawOriginalRotation.current.x + baseJawX + (autoMouthOpen * jawFactor * maxJawRotation);
                const clampedTargetX = THREE.MathUtils.clamp(
                    targetX,
                    jawOriginalRotation.current.x - Math.PI / 12,
                    jawOriginalRotation.current.x + Math.PI / 4
                );

                jawBoneRef.current.rotation.x = THREE.MathUtils.lerp(
                    jawBoneRef.current.rotation.x,
                    clampedTargetX,
                    0.25
                );

                if (isNaN(jawBoneRef.current.rotation.x)) {
                    jawBoneRef.current.rotation.x = jawOriginalRotation.current.x;
                }
            }

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

            // Calcular offsets de labios 3D según el viseme
            // Dejar que el modelo mantenga su pose original
            let topYOffset = 0;    
            let topZOffset = 0;    
            let bottomYOffset = 0;
            let bottomZOffset = 0;      
            let cornerXOffset = 0;

            if (isAiSpeaking && autoMouthOpen > 0.01) {
                const amt = autoMouthOpen;
                switch (currentViseme) {
                    case 'A':
                        topZOffset = -0.022 * amt;
                        bottomZOffset = 0.03 * amt;
                        cornerXOffset = -0.005 * amt;
                        break;
                    case 'E':
                        topZOffset = -0.008 * amt;
                        bottomZOffset = 0.012 * amt;
                        cornerXOffset = 0.000 * amt; // pull outward
                        break;
                    case 'I':
                        topZOffset = -0.004 * amt;
                        bottomZOffset = 0.005 * amt;
                        cornerXOffset = 0.022 * amt; // pull outward strongly
                        break;
                    case 'O':
                        topZOffset = -0.012 * amt;
                        bottomZOffset = 0.018 * amt;
                        topYOffset = 0.014 * amt; // push forward
                        bottomYOffset = 0.014 * amt;
                        cornerXOffset = -0.012 * amt; // pull inward
                        break;
                    case 'U':
                        topZOffset = -0.006 * amt;
                        bottomZOffset = 0.008 * amt;
                        topYOffset = 0.02 * amt; // push forward strongly
                        bottomYOffset = 0.02 * amt;
                        cornerXOffset = -0.02 * amt; // pull inward tightly
                        break;
                    default:
                        topZOffset = -0.01 * amt;
                        bottomZOffset = 0.015 * amt;
                        break;
                }
            }

            // Aplicar a los huesos de labios con lerp suave
            const boneLerp = 0.25;

            // Labio superior izquierdo (DEF-lip.T.L)
            if (lipTopBoneRef.current && lipTopOriginalPos.current) {
                lipTopBoneRef.current.position.z = THREE.MathUtils.lerp(
                    lipTopBoneRef.current.position.z,
                    lipTopOriginalPos.current.z + topZOffset,
                    boneLerp
                );
                lipTopBoneRef.current.position.y = THREE.MathUtils.lerp(
                    lipTopBoneRef.current.position.y,
                    lipTopOriginalPos.current.y + topYOffset,
                    boneLerp
                );
                lipTopBoneRef.current.position.x = THREE.MathUtils.lerp(
                    lipTopBoneRef.current.position.x,
                    lipTopOriginalPos.current.x + cornerXOffset,
                    boneLerp
                );
            }

            // Labio superior derecho (DEF-lip.T.R)
            if (lipTopRightRef.current && lipTopRightOriginalPos.current) {
                lipTopRightRef.current.position.z = THREE.MathUtils.lerp(
                    lipTopRightRef.current.position.z,
                    lipTopRightOriginalPos.current.z + topZOffset,
                    boneLerp
                );
                lipTopRightRef.current.position.y = THREE.MathUtils.lerp(
                    lipTopRightRef.current.position.y,
                    lipTopRightOriginalPos.current.y + topYOffset,
                    boneLerp
                );
                lipTopRightRef.current.position.x = THREE.MathUtils.lerp(
                    lipTopRightRef.current.position.x,
                    lipTopRightOriginalPos.current.x - cornerXOffset, // eje inverso
                    boneLerp
                );
            }

            // Labio inferior izquierdo (DEF-lip.B.L)
            if (lipBottomBoneRef.current && lipBottomOriginalPos.current) {
                lipBottomBoneRef.current.position.z = THREE.MathUtils.lerp(
                    lipBottomBoneRef.current.position.z,
                    lipBottomOriginalPos.current.z + bottomZOffset,
                    boneLerp
                );
                lipBottomBoneRef.current.position.y = THREE.MathUtils.lerp(
                    lipBottomBoneRef.current.position.y,
                    lipBottomOriginalPos.current.y + bottomYOffset,
                    boneLerp
                );
                lipBottomBoneRef.current.position.x = THREE.MathUtils.lerp(
                    lipBottomBoneRef.current.position.x,
                    lipBottomOriginalPos.current.x + cornerXOffset * 0.7,
                    boneLerp
                );
            }

            // Labio inferior derecho (DEF-lip.B.R)
            if (lipBottomRightRef.current && lipBottomRightOriginalPos.current) {
                lipBottomRightRef.current.position.z = THREE.MathUtils.lerp(
                    lipBottomRightRef.current.position.z,
                    lipBottomRightOriginalPos.current.z + bottomZOffset,
                    boneLerp
                );
                lipBottomRightRef.current.position.y = THREE.MathUtils.lerp(
                    lipBottomRightRef.current.position.y,
                    lipBottomRightOriginalPos.current.y + bottomYOffset,
                    boneLerp
                );
                lipBottomRightRef.current.position.x = THREE.MathUtils.lerp(
                    lipBottomRightRef.current.position.x,
                    lipBottomRightOriginalPos.current.x - cornerXOffset * 0.7, // eje inverso
                    boneLerp
                );
            }

            // Animar también huesos externos (.001) para mayor suavidad y realismo de contorno de boca
            if (lipTopOuterRef.current && lipTopOuterOriginalPos.current) {
                lipTopOuterRef.current.position.z = THREE.MathUtils.lerp(
                    lipTopOuterRef.current.position.z,
                    lipTopOuterOriginalPos.current.z + topZOffset * 0.85,
                    boneLerp
                );
                lipTopOuterRef.current.position.x = THREE.MathUtils.lerp(
                    lipTopOuterRef.current.position.x,
                    lipTopOuterOriginalPos.current.x + cornerXOffset * 0.9,
                    boneLerp
                );
            }
            if (lipTopRightOuterRef.current && lipTopRightOuterOriginalPos.current) {
                lipTopRightOuterRef.current.position.z = THREE.MathUtils.lerp(
                    lipTopRightOuterRef.current.position.z,
                    lipTopRightOuterOriginalPos.current.z + topZOffset * 0.85,
                    boneLerp
                );
                lipTopRightOuterRef.current.position.x = THREE.MathUtils.lerp(
                    lipTopRightOuterRef.current.position.x,
                    lipTopRightOuterOriginalPos.current.x - cornerXOffset * 0.9,
                    boneLerp
                );
            }
            if (lipBottomOuterRef.current && lipBottomOuterOriginalPos.current) {
                lipBottomOuterRef.current.position.z = THREE.MathUtils.lerp(
                    lipBottomOuterRef.current.position.z,
                    lipBottomOuterOriginalPos.current.z + bottomZOffset * 0.85,
                    boneLerp
                );
                lipBottomOuterRef.current.position.x = THREE.MathUtils.lerp(
                    lipBottomOuterRef.current.position.x,
                    lipBottomOuterOriginalPos.current.x + cornerXOffset * 0.7,
                    boneLerp
                );
            }
            if (lipBottomRightOuterRef.current && lipBottomRightOuterOriginalPos.current) {
                lipBottomRightOuterRef.current.position.z = THREE.MathUtils.lerp(
                    lipBottomRightOuterRef.current.position.z,
                    lipBottomRightOuterOriginalPos.current.z + bottomZOffset * 0.85,
                    boneLerp
                );
                lipBottomRightOuterRef.current.position.x = THREE.MathUtils.lerp(
                    lipBottomRightOuterRef.current.position.x,
                    lipBottomRightOuterOriginalPos.current.x - cornerXOffset * 0.7,
                    boneLerp
                );
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
                // Intentamos usar el mapa detectado (A, E, I, O, U)
                if (isAiSpeaking) {
                    const mappings: Record<string, string> = {
                        'A': 'viseme_aa',
                        'E': 'viseme_E',
                        'I': 'viseme_I',
                        'O': 'viseme_O',
                        'U': 'viseme_U'
                    };

                    const activeTargetKey = mappings[currentViseme] || 'viseme_aa';
                    const activeIdx = visemeMap[activeTargetKey];

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

                    // Multiplicador para aumentar la apertura
                    const mouthIntensity = autoMouthOpen * 0.9;
                    const clampedIntensity = THREE.MathUtils.clamp(mouthIntensity, 0, 0.85);

                    if (activeIdx !== undefined) {
                        mesh.morphTargetInfluences[activeIdx] = THREE.MathUtils.lerp(
                            mesh.morphTargetInfluences[activeIdx],
                            clampedIntensity,
                            0.3
                        );
                    } else {
                        // Fallback a cualquier morph "open"
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
                    const visemeKeys = ['viseme_aa', 'viseme_E', 'viseme_I', 'viseme_O', 'viseme_U'];
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

        // --- Breast and Butt Jiggle Physics ---
        if (leftBreastRef.current || rightBreastRef.current || leftButtRef.current || rightButtRef.current) {
            const jiggleStiffness = 0.15;
            const jiggleDamping = 0.85;
            let hotFactor = 1.0;

            if (isHotMode) {
                hotFactor = 1.5;

                // Aplicar amplificación de velocidad solicitada en el parche
                jiggleState.current.lBreast.velocity *= hotFactor;
                jiggleState.current.rBreast.velocity *= hotFactor;

                // Oscilación orgánica sensual adicional en hot mode
                jiggleState.current.lBreast.velocity += Math.sin(t * 8) * 0.015;
                jiggleState.current.rBreast.velocity += Math.sin(t * 8 + Math.PI) * 0.015;
                jiggleState.current.lButt.velocity += Math.cos(t * 6) * 0.01;
                jiggleState.current.rButt.velocity += Math.cos(t * 6 + Math.PI) * 0.01;
            } else {
                // Movimiento muy sutil en reposo normal
                jiggleState.current.lBreast.velocity += Math.sin(t * 4) * 0.002;
                jiggleState.current.rBreast.velocity += Math.sin(t * 4 + Math.PI) * 0.002;
            }

            // Left Breast
            if (leftBreastRef.current) {
                const force = (0 - jiggleState.current.lBreast.position) * jiggleStiffness;
                jiggleState.current.lBreast.velocity += force;
                jiggleState.current.lBreast.velocity *= jiggleDamping;
                jiggleState.current.lBreast.position += jiggleState.current.lBreast.velocity;
                leftBreastRef.current.rotation.x = jiggleState.current.lBreast.position;
            }

            // Right Breast
            if (rightBreastRef.current) {
                const force = (0 - jiggleState.current.rBreast.position) * jiggleStiffness;
                jiggleState.current.rBreast.velocity += force;
                jiggleState.current.rBreast.velocity *= jiggleDamping;
                jiggleState.current.rBreast.position += jiggleState.current.rBreast.velocity;
                rightBreastRef.current.rotation.x = jiggleState.current.rBreast.position;
            }

            // Left Butt
            if (leftButtRef.current) {
                const force = (0 - jiggleState.current.lButt.position) * jiggleStiffness;
                jiggleState.current.lButt.velocity += force;
                jiggleState.current.lButt.velocity *= jiggleDamping;
                jiggleState.current.lButt.position += jiggleState.current.lButt.velocity;
                leftButtRef.current.rotation.x = jiggleState.current.lButt.position;
            }

            // Right Butt
            if (rightButtRef.current) {
                const force = (0 - jiggleState.current.rButt.position) * jiggleStiffness;
                jiggleState.current.rButt.velocity += force;
                jiggleState.current.rButt.velocity *= jiggleDamping;
                jiggleState.current.rButt.position += jiggleState.current.rButt.velocity;
                rightButtRef.current.rotation.x = jiggleState.current.rButt.position;
            }
        }

        // --- SECONDARY PHYSICS (HAIR & SKIRT SWAY) ---
        const windX = simplex.noise2D(t * 1.5, 0) * 0.05;
        const windZ = simplex.noise2D(0, t * 1.5) * 0.05;

        // Animar cabello de forma fluida
        if (hairBonesRef.current.length > 0) {
            hairBonesRef.current.forEach(bone => {
                const state = swayState.current[bone.uuid];
                if (state) {
                    const targetRotX = state.baseRot.x + windX;
                    const targetRotZ = state.baseRot.z + windZ;
                    bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetRotX, 0.1);
                    bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetRotZ, 0.1);
                }
            });
        }

        // Animar vestido/falda: viento + SEGUIMIENTO DE PIERNAS (evitar clipping)
        if (skirtBonesRef.current.length > 0) {
            // Leer cuánto se desvió cada pierna de su posición de reposo
            const leftLegDelta = (leftLegRef.current && leftLegOriginalRot.current)
                ? leftLegRef.current.rotation.x - leftLegOriginalRot.current.x
                : 0;
            const rightLegDelta = (rightLegRef.current && rightLegOriginalRot.current)
                ? rightLegRef.current.rotation.x - rightLegOriginalRot.current.x
                : 0;

            // Influencia proporcional: 60% del movimiento de la pierna se transfiere al vestido
            const LEG_INFLUENCE = 0.60;

            skirtBonesRef.current.forEach(bone => {
                const st = swayState.current[bone.uuid];
                if (!st) return;

                const bn = bone.name.toLowerCase();
                const isL = bn.includes('.l') || bn.includes('_l') || bn.includes('left') || bn.endsWith('l');
                const isR = bn.includes('.r') || bn.includes('_r') || bn.includes('right') || bn.endsWith('r');

                // Influencia de pierna correspondiente
                let legInfluenceX = 0;
                if (isL) legInfluenceX = leftLegDelta * LEG_INFLUENCE;
                else if (isR) legInfluenceX = rightLegDelta * LEG_INFLUENCE;
                else legInfluenceX = (leftLegDelta + rightLegDelta) * 0.3; // Huesos centrales: promedio

                // Target = base de reposo + viento sutil + influencia de pierna
                const targetRotX = st.baseRot.x + windX * 0.3 + legInfluenceX;
                const targetRotZ = st.baseRot.z + windZ * 0.3;

                // Lerp más rápido al seguir la pierna (0.12), retorno más suave (0.06)
                const lerpSpeed = Math.abs(legInfluenceX) > 0.05 ? 0.12 : 0.06;
                bone.rotation.x = THREE.MathUtils.lerp(bone.rotation.x, targetRotX, lerpSpeed);
                bone.rotation.z = THREE.MathUtils.lerp(bone.rotation.z, targetRotZ, lerpSpeed);
            });
        }
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

            // Reset básico
            // IMPORTANTE: Resetear rotación del modelo entero por si acaso (missionary)
            if (modelRef.current) modelRef.current.rotation.x = 0;

            spineRef.current.rotation.set(0, 0, 0);
            rightArmRef.current.rotation.set(0, 0, 0);
            leftArmRef.current.rotation.set(0, 0, 0);

            // Forzar brazos abajo (Neutro)
            const baseDownX = THREE.MathUtils.degToRad(-80);
            rightArmRef.current.rotation.x = baseDownX;
            leftArmRef.current.rotation.x = baseDownX;

            if (pose === 'doggy') {
                // Doggy: Inclinar tronco adelante, brazos apoyados?
                spineRef.current.rotation.x = THREE.MathUtils.degToRad(70);
                // Brazos hacia adelante para apoyar
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(45);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(45);
            } else if (pose === 'kneeling') {
                // Kneeling: Troco recto, quizás manos en muslos?
                // Simulación visual solo con tronco/brazos ya que piernas no suelen tener IK completo aquí
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(-20);
                rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(-20); // Manos al centro
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(-20);
                leftArmRef.current.rotation.z = THREE.MathUtils.degToRad(20);
            } else if (pose === 'spread_legs') {
                // Spread legs: Si está sentada o acostada.
                // Como es avatar de medio cuerpo mayormente, simulamos con brazos abiertos invitando
                rightArmRef.current.rotation.z = THREE.MathUtils.degToRad(-45); // Abrir brazo
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(-60);
                leftArmRef.current.rotation.z = THREE.MathUtils.degToRad(45); // Abrir brazo
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(-60);

                // Inclinar atrás sugerente
                spineRef.current.rotation.x = THREE.MathUtils.degToRad(-20);
            } else if (pose === 'missionary') {
                // Acostada boca arriba
                if (modelRef.current) modelRef.current.rotation.x = THREE.MathUtils.degToRad(-90); // Rotar todo el modelo
                // Brazos arriba (abrazando)
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(160);
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(160);
            } else if (pose === 'cowgirl') {
                // Sentada encima: Tronco recto, saltando levemente (animado en useFrame si quisiéramos)
                spineRef.current.rotation.x = THREE.MathUtils.degToRad(-15); // Echarse atrás placer
                rightArmRef.current.rotation.x = THREE.MathUtils.degToRad(150); // Manos en el pecho del usuario/cabeza
                leftArmRef.current.rotation.x = THREE.MathUtils.degToRad(150);
            } else if (pose === 'stand' || pose === 'default') {
                if (modelRef.current) modelRef.current.rotation.x = 0; // Reset rotación modelo
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

        return () => {
            window.removeEventListener('nova-clothing-action', handleClothingAction);
            window.removeEventListener('nova-action', handleNovaAction);
            window.removeEventListener('nova-pose', handleNovaPose);
            window.removeEventListener('nova-fluid', handleNovaFluid);
        };
    }, []);

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
        // Decay gradual del impacto musical
        musicEnergyRef.current = THREE.MathUtils.lerp(musicEnergyRef.current, 0, delta * 3);

        // Si hay energía musical, modular animación
        if (musicEnergyRef.current > 0.01) {
            // 1. Acelerar ligeramente animaciones (vibe)
            if (mixerRef.current) {
                // Base 1.0 -> Hasta 1.3 en beat fuerte
                mixerRef.current.timeScale = THREE.MathUtils.lerp(mixerRef.current.timeScale, 1.0 + musicEnergyRef.current * 0.3, 0.1);
            }
            // 2. Head Bobbing sutil 
            if (headBoneRef.current) {
                // Un pequeño movimiento rítmico
                const beatBounce = Math.sin(state.clock.elapsedTime * 15) * musicEnergyRef.current * 0.02;
                headBoneRef.current.rotation.x += beatBounce * 0.2; // Cabeceo
            }
        } else {
            // Restaurar velocidad normal suavemente
            if (mixerRef.current) {
                mixerRef.current.timeScale = THREE.MathUtils.lerp(mixerRef.current.timeScale, 1.0, 0.1);
            }
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

    return (
        <primitive
            ref={modelRef}
            object={gltf.scene}
            scale={2.5}
            position={[0, -1.5, 0]}
        />
    );
}

function FallbackAvatar() {
    return (
        <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial color="#555" wireframe />
        </mesh>
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

    const cameraFov = disableControls ? 30 : 50;

    return (
        <div className="w-full h-full rounded-2xl overflow-hidden bg-gradient-to-br from-slate-900 to-slate-800">
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
                    />
                </Suspense>

                {!disableControls && (
                    <OrbitControls
                        ref={controlsRef}
                        enabled={true}
                        // Target inicial (se sobreescribe por CameraManager)
                        target={[0, 2.2, 0]}
                    />
                )}
            </Canvas>
        </div>
    );
};

export default AvatarViewer3D;