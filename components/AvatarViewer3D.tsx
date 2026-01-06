import React, { useRef, useEffect, Suspense, useState } from 'react';
import { Canvas, useFrame, useLoader, useThree } from '@react-three/fiber';
import { OrbitControls, PerspectiveCamera, Environment } from '@react-three/drei';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
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

interface AvatarViewer3DProps {
    modelUrl?: string;
    emotion?: Emotion;
    action?: string | null;
    audioElement?: HTMLAudioElement | null;
    isAiSpeaking?: boolean;
    disableControls?: boolean;
    isHotMode?: boolean;
}

function AvatarModel({ modelUrl, emotion, action, audioElement, isAiSpeaking, isHotMode = false }: {
    modelUrl: string;
    emotion: Emotion;
    action?: string | null;
    audioElement: HTMLAudioElement | null;
    isAiSpeaking: boolean;
    isHotMode?: boolean;
}) {
    const gltf = useLoader(GLTFLoader, modelUrl);
    const modelRef = useRef<THREE.Group>(null);
    const mixerRef = useRef<THREE.AnimationMixer | null>(null);
    const lipSyncRef = useRef<LipSyncAnalyzer | null>(null);

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
    const spineRef = useRef<THREE.Bone | null>(null); // Para respiración mejorada
    const musicEnergyRef = useRef(0); // Audio Reactivity Energy

    // --- HELPER FUNCTIONS FOR EXPRESIONS ---
    const getEmotionIntensity = (currentEmotion: string): number => {
        // Simple mapping: if defined emotion, return high intensity
        return currentEmotion && currentEmotion !== 'neutral' ? 1.0 : 0.0;
    };

    const updateFacialExpression = (meshes: THREE.Mesh[], currentEmotion: string) => {
        // Reset morphs first (simple approach)
        // ... implementation details for brows/mouth based on emotion ...
        meshes.forEach(mesh => {
            if (!mesh.morphTargetDictionary || !mesh.morphTargetInfluences) return;

            // Mapeo básico de emociones a morphs comunes
            const morphsToReset = ['BrowsDown', 'BrowsUp', 'Smile', 'Frown', 'MouthOpen'];
            morphsToReset.forEach(m => {
                const idx = mesh.morphTargetDictionary[m];
                if (idx !== undefined) mesh.morphTargetInfluences![idx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences![idx], 0, 0.1);
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

    // Refs para huesos de labios (modelos Rigify como GrokAni)
    const lipTopBoneRef = useRef<THREE.Bone | null>(null);      // DEF-lipTL
    const lipTopRightRef = useRef<THREE.Bone | null>(null);     // DEF-lipTR
    const lipBottomBoneRef = useRef<THREE.Bone | null>(null);   // DEF-lipBL
    const lipBottomRightRef = useRef<THREE.Bone | null>(null);  // DEF-lipBR
    const lipTopOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipTopRightOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipBottomOriginalPos = useRef<THREE.Vector3 | null>(null);
    const lipBottomRightOriginalPos = useRef<THREE.Vector3 | null>(null);

    // Refs para morphs DAZ JCM de mandíbula (abrir boca/labios)
    const dazJawMorphs = useRef<Array<{ mesh: THREE.Mesh, index: number, name: string }>>([]);

    // Reference to Clothing Manager
    const clothingManagerRef = useRef<any>(null);

    // NEW SYSTEMS REFS
    const animationManagerRef = useRef<AnimationManager | null>(null);
    const ikControllerRef = useRef<IKController | null>(null);
    const moodSystemRef = useRef<MoodSystem | null>(null);
    const materialManagerRef = useRef<MaterialManager | null>(null);

    // Initializion logic for Clothing Manager
    useEffect(() => {
        if (modelRef.current) {
            const cm = getClothingManager();
            cm.initialize(modelRef.current);
            clothingManagerRef.current = cm;
        }
    }, [modelRef.current]);

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
            const meshes: THREE.Mesh[] = [];
            const newVisemeMap: Record<string, number> = {};

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
                            console.log('🎨 Procesando material:', child.name, 'tipo:', mat.type);

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
                                    meshName.includes('head')
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
                                console.log('✨ Configurado como DECAL:', child.name);
                            } else if (meshName.includes('eye')) {
                                // OJOS: Preservar configuración original
                                mat.side = THREE.DoubleSide;
                                console.log('👁️ Configurado como OJO:', child.name);
                            } else if (isSkin) {
                                // PIEL/CUERPO: Material sólido normal
                                mat.side = THREE.DoubleSide;
                                mat.transparent = false;
                                mat.depthWrite = true;
                                mat.polygonOffset = false;

                                // CRÍTICO: Asegurar que el material tenga color
                                if (mat instanceof THREE.MeshStandardMaterial) {
                                    // Si el material no tiene textura de color, mantener el color que trae
                                    mat.needsUpdate = true;
                                }
                                console.log('🧍 Configurado como PIEL:', child.name);
                            } else {
                                // Resto de partes (ropa, accesorios, etc.)
                                mat.side = THREE.DoubleSide;
                                mat.transparent = false;
                                mat.depthWrite = true;
                                mat.polygonOffset = false;
                                console.log('👕 Configurado como OTRO:', child.name);
                            }
                        };
                        if (Array.isArray(child.material)) child.material.forEach(fixMaterial);
                        else fixMaterial(child.material);
                    }

                    const name = child.name.toLowerCase();

                    // DETECCIÓN DE PARTES ESPECIALES
                    // CRÍTICO: Ocultar el blush por defecto - cubre toda la cara
                    if (name.includes('blush')) {
                        console.log('😊 Ocultando mesh de blush:', child.name);
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
                            console.log(`🎭 MESH "${child.name}" Morph List:`, morphNames);

                            // DEBUG: Buscar TODOS los morphs relacionados con boca/labios
                            const mouthMorphs = morphNames.filter(m => {
                                const ml = m.toLowerCase();
                                return ml.includes('mouth') || ml.includes('lip') || ml.includes('open') ||
                                    ml.includes('jaw') || ml.includes('smile') || ml.includes('frown');
                            });
                            if (mouthMorphs.length > 0) {
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
                                    console.log(`👄 Morph de boca encontrado: ${key} → viseme_aa`);
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
                                    console.log(`🦷 DAZ JCM Morph encontrado: ${key} (index: ${dict[key]})`);
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

                // 2. BÚSQUEDA DE HUESOS (Más tolerante)
                if (child instanceof THREE.Bone) {
                    const name = child.name.toLowerCase();
                    const isRight = name.includes('right') || name.includes('_r') || name.endsWith('.r');
                    const isLeft = name.includes('left') || name.includes('_l') || name.endsWith('.l');

                    if (name.includes('head')) headBoneRef.current = child;
                    if (name.includes('spine') || name.includes('body')) spineRef.current = child;

                    // Mandíbula para LipSync - buscar varios nombres posibles
                    // DEF-jaw (Blender), jaw (Unity), mandible, etc.
                    if (!jawBoneRef.current) {
                        const isJawBone = (
                            name === 'def-jaw' ||
                            name === 'jaw' ||
                            name === 'cc_base_jaw' ||
                            name.includes('mandible') ||
                            (name.includes('jaw') && !name.includes('jawl') && !name.includes('jawr') && !name.includes('jaw.l') && !name.includes('jaw.r'))
                        );
                        if (isJawBone) {
                            jawBoneRef.current = child;
                            jawOriginalRotation.current = child.rotation.clone();
                            console.log('🦷 Hueso de mandíbula encontrado:', child.name);
                        }
                    }

                    // Huesos de labios para Rigify (GrokAni) - lip.T, lip.B
                    // Debug: mostrar huesos que contengan "lip"
                    if (name.includes('lip')) {
                        console.log('🔍 Hueso con "lip":', child.name);
                    }

                    // Detectar DEF-lipTL (labio superior izquierdo)
                    if (name === 'def-liptl' && !lipTopBoneRef.current) {
                        lipTopBoneRef.current = child;
                        lipTopOriginalPos.current = child.position.clone();
                        console.log('👄 Hueso DEFORM labio SUPERIOR IZQ encontrado:', child.name);
                    }
                    // Detectar DEF-lipTR (labio superior derecho)
                    if (name === 'def-liptr' && !lipTopRightRef.current) {
                        lipTopRightRef.current = child;
                        lipTopRightOriginalPos.current = child.position.clone();
                        console.log('👄 Hueso DEFORM labio SUPERIOR DER encontrado:', child.name);
                    }
                    // Detectar DEF-lipBL (labio inferior izquierdo)
                    if (name === 'def-lipbl' && !lipBottomBoneRef.current) {
                        lipBottomBoneRef.current = child;
                        lipBottomOriginalPos.current = child.position.clone();
                        console.log('👄 Hueso DEFORM labio INFERIOR IZQ encontrado:', child.name);
                    }
                    // Detectar DEF-lipBR (labio inferior derecho)
                    if (name === 'def-lipbr' && !lipBottomRightRef.current) {
                        lipBottomRightRef.current = child;
                        lipBottomRightOriginalPos.current = child.position.clone();
                        console.log('👄 Hueso DEFORM labio INFERIOR DER encontrado:', child.name);
                    }

                    // Brazos (Upper Arm) - Soporta múltiples convenciones de nombres
                    // Rigify: DEF-upper_armL, DEF-upper_armR (name is lowercase: def-upper_arml)
                    // SOLO detectar huesos DEF- para animación (son los que deforman)
                    const isDefUpperArm = name === 'def-upper_arml' || name === 'def-upper_armr';
                    const isRPMArm = (name.includes('arm') && !name.includes('fore') && !name.includes('hand') && !name.includes('upper_arm'));

                    if (isDefUpperArm) {
                        // Rigify DEF bones
                        if (name === 'def-upper_arml' && !rightArmRef.current) {
                            rightArmRef.current = child;
                            rightArmOriginalRot.current = child.rotation.clone();
                            console.log('💪 Brazo DERECHO (DEF) asignado:', child.name);
                        }
                        if (name === 'def-upper_armr' && !leftArmRef.current) {
                            leftArmRef.current = child;
                            leftArmOriginalRot.current = child.rotation.clone();
                            console.log('💪 Brazo IZQUIERDO (DEF) asignado:', child.name);
                        }
                    } else if (isRPMArm) {
                        // RPM naming
                        if (isRight && !rightArmRef.current) {
                            rightArmRef.current = child;
                            console.log('💪 Brazo DERECHO (RPM) asignado:', child.name);
                        }
                        if (isLeft && !leftArmRef.current) {
                            leftArmRef.current = child;
                            console.log('💪 Brazo IZQUIERDO (RPM) asignado:', child.name);
                        }
                    }
                    // Antebrazos (Lower Arm)
                    if (name.includes('fore') || name.includes('lower') || name.includes('elbow')) {
                        if (isRight && !rightForeArmRef.current) rightForeArmRef.current = child;
                        if (isLeft && !leftForeArmRef.current) leftForeArmRef.current = child;
                    }
                }
            });

            setMorphTargetMeshes(meshes);
            setVisemeMap(newVisemeMap);

            // Inicializar LipSync
            if (!lipSyncRef.current) lipSyncRef.current = new LipSyncAnalyzer();
            lipSyncRef.current.initialize(modelRef.current);

            // === INICIALIZAR NUEVOS SISTEMAS AVANZADOS ===

            // 1. Animation Manager - Gestiona animaciones de Blender
            if (gltf.animations.length > 0) {
                animationManagerRef.current = new AnimationManager(modelRef.current, gltf.animations);
                console.log('✅ AnimationManager inicializado con', gltf.animations.length, 'clips');
            } else {
                console.warn('⚠️ No hay animaciones en el modelo - AnimationManager no inicializado');
            }

            // 2. IK Controller - Head & Eye tracking natural
            ikControllerRef.current = new IKController();
            ikControllerRef.current.initialize(modelRef.current);

            // 3. Mood System - Estados anímicos persistentes
            moodSystemRef.current = new MoodSystem('calm');

            // 4. Material Manager - Customización visual
            materialManagerRef.current = new MaterialManager();
            materialManagerRef.current.initialize(modelRef.current);

            // Mixer (necesario para AnimationManager pero ya no lo usamos directamente)
            mixerRef.current = new THREE.AnimationMixer(modelRef.current);

            // DEBUG: Resumen de detección para este modelo
            console.log(`📍 RESUMEN MODELO:`,
                `Meshes con morphs: ${meshes.length}`,
                `| VisemeMap: ${Object.keys(newVisemeMap).join(', ') || 'NINGUNO'}`,
                `| JawBone: ${jawBoneRef.current?.name || 'NO ENCONTRADO'}`,
                `| Animaciones: ${gltf.animations.map(a => a.name).join(', ') || 'NINGUNA'}`
            );

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
            forceArmsDown();
        }

        // Cleanup on unmount
        return () => {
            cleanupResources();
        };
    }, [gltf]);

    // OPTIMIZACIÓN: Limitador de frame rate y render condicional
    const lastFrameTimeRef = useRef(0);
    const lastAnimationUpdateRef = useRef(0);
    const targetFPS = 45; // Reducido de 60 a 45 para mejor rendimiento
    const frameInterval = 1000 / targetFPS;
    const animationUpdateInterval = 1000 / 30; // Actualizar animaciones a 30fps

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
        if (ikControllerRef.current?.isInitialized()) {
            ikControllerRef.current.setLookTargetFromScreen(state.pointer.x, state.pointer.y, 3);
            ikControllerRef.current.update(delta);
        }
        const moodInfluence = moodSystemRef.current?.getInfluence() || {
            breathingSpeed: 1, gestureFrequency: 1, expressionIntensity: 1, idleVariation: 1, timeScale: 1
        };

        // --- 1. MOVIMIENTO "VIVO" (RESPIRACIÓN Y BRAZOS) ---
        // Solo actualizar cuando shouldUpdateAnimation es true para reducir carga

        if (shouldUpdateAnimation && modelRef.current) {
            // Respiración influenciada por mood
            const breathSpeed = (isHotMode ? 8 : 2) * moodInfluence.breathingSpeed;
            const breathAmp = (isHotMode ? 0.008 : 0.003) * moodInfluence.expressionIntensity;
            modelRef.current.position.y = -1.5 + Math.sin(t * breathSpeed) * breathAmp;

            // Sutil movimiento de columna
            if (spineRef.current) {
                spineRef.current.rotation.x = Math.sin(t * 1) * 0.02 * moodInfluence.idleVariation;
                if (isHotMode) {
                    spineRef.current.rotation.z = Math.sin(t * 2) * 0.03;
                }
            }
        }

        // --- GESTOS / ACCIONES ---
        // SOLO aplicar rotación cuando hay una acción activa
        // Cuando no hay acción, dejar los brazos en su pose original del modelo
        if (action && (rightArmRef.current || leftArmRef.current)) {
            let targetRightArmZ = 0;
            let targetLeftArmZ = 0;
            let targetRightArmX = 0;
            let targetLeftArmX = 0;
            let shouldAnimate = false;

            // Aplicar gesto según la acción
            if (action === 'WAVE') {
                // Saludar con mano derecha
                targetRightArmZ = THREE.MathUtils.degToRad(60); // Levantar brazo
                targetRightArmX = Math.sin(t * 12) * 0.3; // Movimiento de saludo
                shouldAnimate = true;

            } else if (action === 'SHRUG') {
                // Encogerse de hombros
                targetRightArmZ = THREE.MathUtils.degToRad(30);
                targetLeftArmZ = THREE.MathUtils.degToRad(-30);
                shouldAnimate = true;

            } else if (action === 'CROSS_ARMS') {
                // Cruzar brazos (hacia adentro)
                targetRightArmZ = THREE.MathUtils.degToRad(-45);
                targetLeftArmZ = THREE.MathUtils.degToRad(45);
                shouldAnimate = true;

            } else if (action === 'HANDS_ON_HIPS') {
                // Manos en cadera
                targetRightArmZ = THREE.MathUtils.degToRad(-30);
                targetLeftArmZ = THREE.MathUtils.degToRad(30);
                shouldAnimate = true;

            }

            if (shouldAnimate) {
                const lerpFactor = 0.1;
                if (rightArmRef.current) {
                    rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetRightArmZ, lerpFactor);
                    rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetRightArmX, lerpFactor);
                }
                if (leftArmRef.current) {
                    leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetLeftArmZ, lerpFactor);
                    leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetLeftArmX, lerpFactor);
                }
            }
        } else if (isAiSpeaking && !action) {
            // --- AUTO GESTOS AL HABLAR ---
            // Base: Brazos abajo (-80 deg X) + Ligeramente adelante (-0.2 Z)

            const gestureSpeed = 5;
            const noise = Math.sin(t * gestureSpeed) * Math.cos(t * gestureSpeed * 0.7);
            const liftAmount = THREE.MathUtils.degToRad(25);
            const baseDownX = THREE.MathUtils.degToRad(-80);
            const baseForwardZ = -0.2; // Ligeramente hacia adelante

            // Brazo DERECHO
            if (rightArmRef.current) {
                const targetX = baseDownX + (liftAmount * (0.5 + 0.5 * Math.sin(t * 3)));
                // Z: Base Forward + Gesto lateral sutil
                const targetZ = baseForwardZ + THREE.MathUtils.degToRad(5) + (noise * 0.1);

                rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, targetX, 0.1);
                rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, targetZ, 0.1);
            }
            // Brazo IZQUIERDO (Espejo Z?)
            if (leftArmRef.current) {
                const targetX = baseDownX + (liftAmount * (0.5 + 0.5 * Math.sin(t * 3 + 1)));
                // Z en izquierdo suele ser opuesto para "adelante" si los ejes son espejo.
                // Si Z+ fue Atrás en ambos (asumido), entonces Z- es Adelante en ambos?
                // En T-Pose, Z apunta hacia arriba.
                // Si rotamos X (-80), el Z local cambia.
                // Vamos a asumir espejo simétrico: Si Right Z=-0.2 es adelante, Left Z=+0.2 podría ser adelante?
                // O si el usuario dijo que Z+75 fue atrás...
                // Vamos a probar Z = +0.2 para izquierdo (espejo).
                const targetZ = -baseForwardZ + THREE.MathUtils.degToRad(-5) - (noise * 0.1);

                leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, targetX, 0.1);
                leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, targetZ, 0.1);
            }
        } else if (!action) {
            // --- RELAX (Return to Idle Pose) ---
            // Pose base: X=-80, Z=-0.2 (Adelante)
            const lerpReturn = 0.05;
            const baseDownX = THREE.MathUtils.degToRad(-80);
            const baseForwardZ = -0.2;

            if (rightArmRef.current) {
                rightArmRef.current.rotation.x = THREE.MathUtils.lerp(rightArmRef.current.rotation.x, baseDownX, lerpReturn);
                rightArmRef.current.rotation.z = THREE.MathUtils.lerp(rightArmRef.current.rotation.z, baseForwardZ, lerpReturn);
            }
            if (leftArmRef.current) {
                // Espejo para izquierdo
                leftArmRef.current.rotation.x = THREE.MathUtils.lerp(leftArmRef.current.rotation.x, baseDownX, lerpReturn);
                leftArmRef.current.rotation.z = THREE.MathUtils.lerp(leftArmRef.current.rotation.z, -baseForwardZ, lerpReturn);
            }
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
        let eyeDirectionX = lookTarget.current.x * 0.5;
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

        // Cálculo de apertura de boca para hablar
        // Si no hay audio analizado, usamos una onda simple cuando isAiSpeaking es true
        const lipTime = t * 20;
        const autoMouthOpen = isAiSpeaking ? (Math.sin(lipTime) * 0.5 + 0.5) : 0;

        // --- JAW BONE LIP SYNC (para modelos sin morph targets de boca) ---
        if (jawBoneRef.current && jawOriginalRotation.current) {
            // Rotar la mandíbula para abrir la boca
            // Diferentes modelos usan diferentes ejes:
            // - Blender/Rigify: X axis
            // - DAZ/Genesis: Z axis  
            // - Unity Humanoid: X axis
            const maxJawRotation = Math.PI / 4; // ~45 grados (más abierto)

            const jawName = jawBoneRef.current.name.toLowerCase();
            const isDazModel = jawName.includes('lowerjaw') || jawName.includes('genesis');

            if (isDazModel) {
                // DAZ: rotación en Z (hacia abajo)
                const targetZ = jawOriginalRotation.current.z - (autoMouthOpen * maxJawRotation);
                jawBoneRef.current.rotation.z = THREE.MathUtils.lerp(
                    jawBoneRef.current.rotation.z, targetZ, 0.3
                );
            } else {
                // Blender/otros: rotación en X
                const targetX = jawOriginalRotation.current.x + (autoMouthOpen * maxJawRotation);
                jawBoneRef.current.rotation.x = THREE.MathUtils.lerp(
                    jawBoneRef.current.rotation.x, targetX, 0.3
                );
            }

            // ACTIVAR MORPHS JCM DE DAZ (para que los labios sigan a la mandíbula)
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
            if (stickerDropRef.current) stickerDropRef.current.visible = emotion === 'sad' || emotion === 'confused'; // Gota para tristeza/confusión

            // Actualizar morphs faciales (ojos, cejas, boca base)
            updateFacialExpression(morphTargetMeshes, emotion);

            // Animar labio inferior (ambos lados) junto con la mandíbula
            const lipMoveAmount = autoMouthOpen * 0.03; // Pequeño movimiento hacia abajo

            // Labio superior IZQUIERDO (sube un poco - menos que el inferior)
            const lipTopMoveAmount = autoMouthOpen * 0.015; // La mitad del inferior
            if (lipTopBoneRef.current && lipTopOriginalPos.current) {
                lipTopBoneRef.current.position.z = THREE.MathUtils.lerp(
                    lipTopBoneRef.current.position.z,
                    lipTopOriginalPos.current.z - lipTopMoveAmount, // Sube (Z negativo)
                    0.3
                );
            }
            // Labio superior DERECHO
            if (lipTopRightRef.current && lipTopRightOriginalPos.current) {
                lipTopRightRef.current.position.z = THREE.MathUtils.lerp(
                    lipTopRightRef.current.position.z,
                    lipTopRightOriginalPos.current.z - lipTopMoveAmount,
                    0.3
                );
            }

            // Labio inferior IZQUIERDO
            if (lipBottomBoneRef.current && lipBottomOriginalPos.current) {
                lipBottomBoneRef.current.position.z = THREE.MathUtils.lerp(
                    lipBottomBoneRef.current.position.z,
                    lipBottomOriginalPos.current.z + lipMoveAmount,
                    0.3
                );
            }
            // Labio inferior DERECHO
            if (lipBottomRightRef.current && lipBottomRightOriginalPos.current) {
                lipBottomRightRef.current.position.z = THREE.MathUtils.lerp(
                    lipBottomRightRef.current.position.z,
                    lipBottomRightOriginalPos.current.z + lipMoveAmount,
                    0.3
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
                // Intentamos usar el mapa detectado (A, I, U, E, O)
                if (isAiSpeaking) {
                    // Si encontramos una vocal 'A' o 'MouthOpen', la usamos
                    const openIdx = visemeMap['viseme_aa'];
                    // Multiplicador para aumentar la apertura
                    const mouthIntensity = autoMouthOpen * 10; // 10x más abierto

                    if (openIdx !== undefined) {
                        mesh.morphTargetInfluences[openIdx] = THREE.MathUtils.lerp(
                            mesh.morphTargetInfluences[openIdx],
                            Math.min(mouthIntensity, 1), // Clamp a 1
                            0.3 // Más rápido
                        );
                    } else {
                        // Fallback: Busca cualquier cosa que parezca "Open"
                        Object.keys(mesh.morphTargetDictionary!).forEach(k => {
                            if (k.toLowerCase().includes('open') || k.toLowerCase().includes('aa')) {
                                const idx = mesh.morphTargetDictionary![k];
                                mesh.morphTargetInfluences![idx] = Math.min(mouthIntensity, 1);
                            }
                        });
                    }
                } else {
                    // Cerrar boca suavemente
                    const openIdx = visemeMap['viseme_aa'];
                    if (openIdx !== undefined) {
                        mesh.morphTargetInfluences[openIdx] = THREE.MathUtils.lerp(mesh.morphTargetInfluences[openIdx], 0, 0.2);
                    }
                }
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
                    roughness: 0.2,
                    metalness: 0.1,
                    transmission: 0.8, // Transparencia lechosa
                    thickness: 0.2,
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
        default: { pos: new THREE.Vector3(0, 1.4, 3.8), look: new THREE.Vector3(0, 1.3, 0) },
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

const AvatarViewer3D: React.FC<AvatarViewer3DProps & { action?: string | null, viewMode?: string }> = ({
    modelUrl = '/models/nova-avatar.glb',
    emotion = 'neutral',
    action = null,
    viewMode = 'default',
    audioElement = null,
    isAiSpeaking = false,
    disableControls = false,
    isHotMode = false
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
                }}
                onCreated={(state) => {
                    // WebGL Context Loss Handler
                    const canvas = state.gl.domElement;

                    canvas.addEventListener('webglcontextlost', (event) => {
                        console.error('⚠️ Contexto WebGL perdido!');
                        event.preventDefault();
                        // Notify user
                        console.log('🔄 Intentando recuperar...');
                    });

                    canvas.addEventListener('webglcontextrestored', () => {
                        console.log('✅ Contexto WebGL restaurado!');
                        // Force re-render
                        state.gl.resetState();
                    });

                    // Set pixel ratio limit to prevent excessive memory usage
                    state.gl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
                }}
            >
                <PerspectiveCamera
                    makeDefault
                    fov={cameraFov}
                    // Position inicial (se sobreescribe por CameraManager)
                    position={[-0.007, 2.458, 3.815]}
                />

                <CameraManager viewMode={viewMode} controlsRef={controlsRef} />

                <ambientLight intensity={0.8} /> {/* Luz ambiental subida para evitar sombras negras en la cara */}
                <directionalLight position={[2, 5, 5]} intensity={1.2} castShadow />
                <spotLight position={[-2, 5, 5]} intensity={0.5} color="#b0c4de" />
                <Environment preset="city" />

                <Suspense fallback={<FallbackAvatar />}>
                    <AvatarModel
                        modelUrl={modelUrl}
                        emotion={emotion}
                        action={action}
                        audioElement={audioElement}
                        isAiSpeaking={isAiSpeaking}
                        isHotMode={isHotMode}
                    />
                </Suspense>

                {!disableControls && (
                    <OrbitControls
                        ref={controlsRef}
                        enabled={true}
                        // Target inicial (se sobreescribe por CameraManager)
                        target={[0.025, 1.430, -0.125]}
                    />
                )}
            </Canvas>
        </div>
    );
};

export default AvatarViewer3D;