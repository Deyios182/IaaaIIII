/**
 * Universal Lip Sync System v2.0
 * Funciona con cualquier modelo: morphs (VRM, RPM) o huesos de mandíbula
 * Incluye suavizado, transiciones y reset apropiado al terminar
 */

import * as THREE from 'three';

const SHOW_VERBOSE_LOGS = false;

export type Viseme = 'neutral' | 'A' | 'E' | 'I' | 'O' | 'U' | 'F' | 'M' | 'TH' | 'L';

export interface LipSyncState {
    currentViseme: Viseme;
    targetViseme: Viseme;
    intensity: number;
    targetIntensity: number;
    isSpeaking: boolean;
    lastSpeakTime: number;
}

// Mapeo universal de nombres de morph targets para diferentes formatos
const MORPH_MAPPINGS = {
    // ReadyPlayerMe / VRM estándar
    'viseme_aa': ['viseme_aa', 'aa', 'A', 'mouthOpen', 'jawOpen', 'Fcl_MTH_A'],
    'viseme_E': ['viseme_E', 'ee', 'E', 'Fcl_MTH_E'],
    'viseme_I': ['viseme_I', 'ih', 'I', 'Fcl_MTH_I'],
    'viseme_O': ['viseme_O', 'oh', 'O', 'mouthFunnel', 'Fcl_MTH_O'],
    'viseme_U': ['viseme_U', 'ou', 'U', 'mouthPucker', 'Fcl_MTH_U'],
    'viseme_FF': ['viseme_FF', 'ff', 'F', 'mouthLowerDown'],
    'viseme_PP': ['viseme_PP', 'pp', 'M', 'B', 'P', 'mouthClose'],
    'viseme_TH': ['viseme_TH', 'th', 'DD'],
    'mouthSmile': ['mouthSmile', 'mouthSmileLeft', 'mouthSmileRight', 'smile'],
};

// Nombres de huesos de mandíbula para fallback
const JAW_BONE_NAMES = [
    'jaw', 'jaw_bone', 'DEF-jaw', 'ORG-jaw',
    'chin', 'mandible', 'lower_jaw',
    'Jaw', 'Head_Jaw', 'CC_Base_Jaw'
];

export class UniversalLipSync {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private dataArray: Uint8Array | null = null;
    private sourceNode: MediaElementAudioSourceNode | null = null;

    // Estado del lip sync
    private state: LipSyncState = {
        currentViseme: 'neutral',
        targetViseme: 'neutral',
        intensity: 0,
        targetIntensity: 0,
        isSpeaking: false,
        lastSpeakTime: 0
    };

    // Modelo y referencias
    private morphMeshes: THREE.Mesh[] = [];
    private jawBone: THREE.Bone | null = null;
    private jawOriginalRotation: THREE.Euler | null = null;

    // Huesos faciales avanzados (Rigify)
    private lipTopBones: THREE.Bone[] = [];
    private lipBottomBones: THREE.Bone[] = [];
    private cornerLeftBones: THREE.Bone[] = [];
    private cornerRightBones: THREE.Bone[] = [];

    // Transforms originales para reset
    private originalTransforms: Map<string, { rot: THREE.Euler, pos: THREE.Vector3 }> = new Map();

    private availableMorphs: Map<string, { mesh: THREE.Mesh, index: number }> = new Map();

    // Configuración
    private smoothing = 0.15; // Suavizado de transiciones (0-1)
    private silenceThreshold = 0.02; // Umbral de silencio
    private resetDelay = 150; // ms después de dejar de hablar para resetear
    // Bandera para deshabilitar manipulación de huesos interna
    public disableBoneManipulation: boolean = false;

    // Offset base para corregir el labio superior si el modelo viene con una mueca/sonrisa forzada de fábrica
    public restingTopLipOffsetY: number = 0;
    
    // Escala del movimiento de mandíbula (útil para modelos anime donde la mandíbula se mueve poco)
    public jawMovementScale: number = 1.0;
    
    // Escala global para compensar exportaciones de Blender (ej: escala 0.01)
    public positionScale: number = 1.0;

    constructor() {
        if (typeof window !== 'undefined') {
            try {
                this.audioContext = new AudioContext();
                this.analyser = this.audioContext.createAnalyser();
                this.analyser.fftSize = 256;
                this.analyser.smoothingTimeConstant = 0.5;
                const bufferLength = this.analyser.frequencyBinCount;
                this.dataArray = new Uint8Array(bufferLength);
            } catch (e) {
                console.warn('⚠️ LipSync: No se pudo crear AudioContext');
            }
        }
    }

    /**
     * Inicializa el sistema con un modelo 3D
     * Detecta automáticamente si usar morphs o huesos
     */
    initialize(model: THREE.Object3D, options?: { disableBones?: boolean, restingTopLipOffsetY?: number, jawMovementScale?: number }): { mode: 'morphs' | 'bone' | 'none', details: string } {
        if (options && options.disableBones) {
            this.disableBoneManipulation = true;
            console.log('🛑 UniversalLipSync: Manipulación de huesos interna DESHABILITADA (AvatarViewer3D tiene el control).');
        } else {
            this.disableBoneManipulation = false;
        }

        this.restingTopLipOffsetY = options?.restingTopLipOffsetY || 0;
        this.jawMovementScale = options?.jawMovementScale !== undefined ? options.jawMovementScale : 1.0;

        this.morphMeshes = [];
        this.availableMorphs.clear();
        this.jawBone = null;
        this.lipTopBones = [];
        this.lipBottomBones = [];
        this.cornerLeftBones = [];
        this.cornerRightBones = [];
        this.originalTransforms.clear();

        // Buscar meshes con morph targets y hueso de mandíbula
        model.traverse((child) => {
            // Buscar morphs
            if ((child as any).isMesh) {
                const mesh = child as THREE.Mesh;
                if (mesh.morphTargetDictionary && mesh.morphTargetInfluences) {
                    this.morphMeshes.push(mesh);

                    // Mapear morphs disponibles
                    for (const [targetName, aliases] of Object.entries(MORPH_MAPPINGS)) {
                        for (const alias of aliases) {
                            const index = mesh.morphTargetDictionary[alias];
                            if (index !== undefined && !this.availableMorphs.has(targetName)) {
                                this.availableMorphs.set(targetName, { mesh, index });
                            }
                        }
                    }
                }
            }

            if ((child as any).isBone) {
                const bone = child as THREE.Bone;
                const lower = bone.name.toLowerCase();
                const isJaw = (lower.includes('jaw') || lower.includes('mandible')) && !lower.includes('chin');

                if (isJaw && !this.jawBone) {
                    this.jawBone = bone;
                    this.jawOriginalRotation = bone.rotation.clone();
                }

                // Detectar labios y comisuras
                const isLipTop = lower.includes('liptop') || lower.includes('lip.t') || lower.includes('lipt') || lower.includes('upperlip') || lower.includes('upper_lip');
                const isLipBottom = lower.includes('lipbot') || lower.includes('lip.b') || lower.includes('lipb') || lower.includes('lowerlip') || lower.includes('lower_lip');
                const isCornerLeft = lower.includes('corner') && lower.includes('l');
                const isCornerRight = lower.includes('corner') && lower.includes('r');

                if (isLipTop) {
                    this.lipTopBones.push(bone);
                    this.originalTransforms.set(bone.uuid, { rot: bone.rotation.clone(), pos: bone.position.clone() });
                }
                if (isLipBottom) {
                    this.lipBottomBones.push(bone);
                    this.originalTransforms.set(bone.uuid, { rot: bone.rotation.clone(), pos: bone.position.clone() });
                }
                if (isCornerLeft) {
                    this.cornerLeftBones.push(bone);
                    this.originalTransforms.set(bone.uuid, { rot: bone.rotation.clone(), pos: bone.position.clone() });
                }
                if (isCornerRight) {
                    this.cornerRightBones.push(bone);
                    this.originalTransforms.set(bone.uuid, { rot: bone.rotation.clone(), pos: bone.position.clone() });
                }
            }
        });

        // Calcular escala de posición (compensar exportaciones 0.01 de Blender)
        this.positionScale = 1.0;
        const refBone = this.lipTopBones[0] || this.jawBone;
        if (refBone) {
            const worldScale = new THREE.Vector3();
            refBone.getWorldScale(worldScale);
            if (worldScale.y > 0.0001 && worldScale.y < 0.1) {
                this.positionScale = 1.0 / worldScale.y;
                console.log(`📏 UniversalLipSync: Escala compensada detectada (x${this.positionScale})`);
            }
        }

        // Reportar resultado
        if (this.availableMorphs.size > 0) {
            const morphNames = Array.from(this.availableMorphs.keys());
            if (SHOW_VERBOSE_LOGS) console.log(`👄 LipSync inicializado (MORPHS): ${morphNames.join(', ')}`);
            return { mode: 'morphs', details: `${this.availableMorphs.size} morphs: ${morphNames.slice(0, 5).join(', ')}` };
        } else if (this.jawBone) {
            console.log(`👄 LipSync inicializado (BONE): ${this.jawBone.name}. Lips detectados: Top(${this.lipTopBones.length}), Bot(${this.lipBottomBones.length}), Corners(${this.cornerLeftBones.length + this.cornerRightBones.length})`);
            return { mode: 'bone', details: `Hueso: ${this.jawBone.name}` };
        } else {
            if (SHOW_VERBOSE_LOGS) console.log('👄 LipSync: Modelo sin soporte (sin morphs ni hueso de mandíbula)');
            return { mode: 'none', details: 'Sin morphs ni hueso de mandíbula' };
        }
    }

    /**
     * Conecta una fuente de audio para análisis
     */
    connectAudio(audioElement: HTMLAudioElement): boolean {
        if (!this.audioContext || !this.analyser) return false;

        try {
            // Evitar reconectar el mismo elemento
            if (this.sourceNode) {
                return true;
            }

            // Resumir contexto si está suspendido
            if (this.audioContext.state === 'suspended') {
                this.audioContext.resume();
            }

            this.sourceNode = this.audioContext.createMediaElementSource(audioElement);
            this.sourceNode.connect(this.analyser);
            this.analyser.connect(this.audioContext.destination);

            return true;
        } catch (e) {
            console.warn('⚠️ LipSync: Error conectando audio', e);
            return false;
        }
    }

    /**
     * Actualiza el lip sync - llamar cada frame
     * @param delta Tiempo desde último frame en segundos
     * @param isSpeaking Si el AI está hablando actualmente
     */
    update(delta: number, isSpeaking: boolean = false): void {
        const now = Date.now();

        // Analizar audio si está disponible
        if (this.analyser && this.dataArray) {
            this.analyser.getByteFrequencyData(this.dataArray as any);

            // Calcular intensidad (Promedio de frecuencias)
            const average = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;

            // Umbral ajustado: Dividimos por un valor más bajo (90 en lugar de 180) para que voces suaves también muevan la boca.
            // Usamos una curva no lineal (pow) para que responda mejor a cambios de volumen.
            let normalized = Math.min(average / 90, 1.0);
            this.state.targetIntensity = Math.pow(normalized, 1.2);

            // Detectar si hay habla
            if (this.state.targetIntensity > this.silenceThreshold) {
                this.state.isSpeaking = true;
                this.state.lastSpeakTime = now;

                // Determinar visema basado en frecuencias
                this.state.targetViseme = this.analyzeFrequencies();
            }
        }

        // Si se indica externamente que está hablando (ej: LLM generando texto)
        if (isSpeaking) {
            this.state.isSpeaking = true;
            this.state.lastSpeakTime = now;
            
            // Si el analizador de audio no está dando datos (estamos probando el botón "Hablar"),
            // darle un pequeño empujón de intensidad fijo para que abra un poquito la boca si no hay audio,
            // pero sin el ciclo procedimental loco.
            if (this.state.targetIntensity < 0.1 && !this.analyser) {
                this.state.targetIntensity = 0.5;
                if (this.state.targetViseme === 'neutral') {
                    this.state.targetViseme = 'A';
                }
            }
        }

        // Reset después de silencio
        if (now - this.state.lastSpeakTime > this.resetDelay) {
            this.state.isSpeaking = false;
            this.state.targetViseme = 'neutral';
            this.state.targetIntensity = 0;
        }

        // Suavizar transiciones
        this.state.intensity = THREE.MathUtils.lerp(
            this.state.intensity,
            this.state.targetIntensity,
            this.smoothing
        );

        // Actualizar visema actual
        // Actualizar visema actual
        this.state.currentViseme = this.state.targetViseme;

        // 3. Aplicar al modelo
        // Siempre aplicar morphs si existen
        if (this.morphMeshes.length > 0 && this.availableMorphs.size > 0) {
            this.applyMorphs(this.state.intensity);
        }

        // Siempre aplicar huesos si existen y no están deshabilitados
        if (!this.disableBoneManipulation) {
            // applyJawBone internamente aplica mandíbula, labios y comisuras
            this.applyJawBone(this.state.intensity);
        }
    }

    private speechFrameCount: number = 0;

    public applyMorphTargets(intensity: number, viseme?: Viseme): void {
        this.applyMorphs(intensity);
    }

    /**
     * Analiza frecuencias para determinar visema
     */
    private analyzeFrequencies(): Viseme {
        if (!this.dataArray) return 'neutral';

        // Dividir en rangos de frecuencia
        const length = this.dataArray.length;
        const lowEnd = Math.floor(length * 0.15);
        const midEnd = Math.floor(length * 0.4);

        let low = 0, mid = 0, high = 0;
        for (let i = 0; i < length; i++) {
            const val = this.dataArray[i] / 255;
            if (i < lowEnd) low += val;
            else if (i < midEnd) mid += val;
            else high += val;
        }
        low /= lowEnd;
        mid /= (midEnd - lowEnd);
        high /= (length - midEnd);

        // Cadencia de habla (intercalar cierres bilabiales M/P de forma natural durante habla fluida)
        this.speechFrameCount = (this.speechFrameCount || 0) + 1;

        // Detectar cierre bilabial (M, P, B):
        // 1. Murmullo nasal / baja energía en agudos y medios
        // 2. Transición silábica cadenciada (cada ~16 a 22 frames de habla, cerrar labios brevemente)
        const cadenceClosure = (this.speechFrameCount % 20) >= 16;
        const isNasalResonance = (low > 0.18 && mid < 0.22 && high < 0.10);

        if (isNasalResonance || cadenceClosure) {
            return 'M'; // Cierre de labios bilabial (M, P, B)
        }

        // Mapear a visemas basado en características de frecuencia
        if (high > 0.32 && low < 0.18) {
            return 'F'; // Fricativa labiodental (F, V)
        } else if (high > 0.28 && low < 0.2) {
            return 'I'; // Vocales agudas, estrechas
        } else if (low > 0.4 && mid < 0.2) {
            return 'O'; // Vocales graves, redondeadas
        } else if (mid > 0.35) {
            return 'A'; // Vocal abierta
        } else if (low > 0.25 && mid > 0.2) {
            return 'U'; // Vocal cerrada, redondeada
        } else if (mid > 0.15) {
            return 'E'; // Vocal media
        }

        return 'M'; // Fallback a labios juntos entre fonemas
    }

    /**
     * Aplica el lip sync al modelo
     */
    private applyToModel(): void {
        const intensity = this.state.intensity;

        // Método 1: Morphs (preferido)
        if (this.availableMorphs.size > 0) {
            this.applyMorphs(intensity);
        }
        
        // Método 2: Hueso de mandíbula / labios
        if (this.jawBone || this.lipTopBones.length > 0) {
            if (!this.disableBoneManipulation) {
                this.applyJawBone(intensity);
            }
        }
    }

    /**
     * Aplica lip sync via morph targets
     */
    private applyMorphs(intensity: number): void {
        const viseme = this.state.isSpeaking ? this.state.targetViseme : 'neutral';

        // Resetear todos los morphs primero
        for (const [targetName, { mesh, index }] of this.availableMorphs) {
            if (mesh.morphTargetInfluences) {
                mesh.morphTargetInfluences[index] = THREE.MathUtils.lerp(
                    mesh.morphTargetInfluences[index],
                    0,
                    this.smoothing * 2
                );
            }
        }

        // Aplicar morph del visema actual
        if (viseme !== 'neutral' && intensity > this.silenceThreshold) {
            const mappings: Record<Viseme, string[]> = {
                'A': ['viseme_aa'],
                'E': ['viseme_E'],
                'I': ['viseme_I'],
                'O': ['viseme_O'],
                'U': ['viseme_U'],
                'F': ['viseme_FF'],
                'M': ['viseme_PP'],
                'TH': ['viseme_TH'],
                'L': ['viseme_aa'],
                'neutral': ['viseme_PP']
            };

            const targets = mappings[viseme] || ['viseme_aa'];
            for (const target of targets) {
                const morphInfo = this.availableMorphs.get(target);
                if (morphInfo && morphInfo.mesh.morphTargetInfluences) {
                    morphInfo.mesh.morphTargetInfluences[morphInfo.index] = intensity;
                }
            }
        }
    }

    /**
     * Aplica lip sync avanzado manipulando mandíbula, labios y comisuras
     */
    private applyJawBone(intensity: number): void {
        const viseme = this.state.isSpeaking ? this.state.targetViseme : 'neutral';
        const adjustedIntensity = Math.min(intensity * 1.5, 1);

        // Variables de target (relativas a las posiciones/rotaciones originales)
        let jawRotX = 0;
        let lipTopPosY = 0;
        let lipTopPosZ = 0;
        let lipBottomPosY = 0;
        let lipBottomPosZ = 0;
        let cornersPosX = 0; // Positivo = sonrisa/estirar
        let cornersPosY = 0;

        // Configuración de visemas basada en fonética
        // ADVERTENCIA: La mandíbula en anime se mueve MUY POCO (Math.PI / 32 = 5.6 grados máx)
        // Valores más altos rompen el mesh y esconden los dientes.
        switch (viseme) {
            case 'A':
                jawRotX = Math.PI / 32; // Apertura original manual
                lipTopPosY = 0;         // Quieto
                lipBottomPosY = 0.001;  // (+) Baja casi nada (la mandíbula ya lo baja)
                cornersPosX = -0.002;
                break;
            case 'O':
                jawRotX = Math.PI / 32;
                cornersPosX = -0.006;   // Fruncir suave
                lipTopPosY = 0;
                lipBottomPosY = 0.001;
                lipTopPosZ = -0.005;    // (-) Empuja hacia adelante suavemente
                lipBottomPosZ = -0.005;
                break;
            case 'E':
                jawRotX = (Math.PI / 32) * 0.6; // 60% de A
                lipTopPosY = 0;
                lipBottomPosY = 0.001;
                cornersPosX = 0.005;    // Sonrisa suave
                cornersPosY = -0.002;   // Sube comisuras apenas
                break;
            case 'I':
                jawRotX = (Math.PI / 32) * 0.3; // 30% de A
                lipTopPosY = 0;
                lipBottomPosY = 0.001;
                cornersPosX = 0.008;    // Estirar un poco más que E
                cornersPosY = -0.001;
                break;
            case 'U':
                jawRotX = (Math.PI / 32) * 0.45; // 45% de A
                cornersPosX = -0.008;   // Fruncir 
                lipTopPosY = 0;
                lipBottomPosY = 0.001;
                lipTopPosZ = -0.006;    // Empujar hacia adelante
                lipBottomPosZ = -0.006;
                break;
            case 'M':
                // ¡CIERRE REAL DE LABIOS PARA M, P, B!
                jawRotX = 0; // Mandíbula cerrada
                lipTopPosY = -0.0018 * this.positionScale;   // Empujar labio superior abajo
                lipBottomPosY = 0.0022 * this.positionScale; // Empujar labio inferior arriba a sellar
                lipTopPosZ = 0.001 * this.positionScale;
                lipBottomPosZ = 0.001 * this.positionScale;
                cornersPosX = -0.003;
                break;
            case 'F':
                jawRotX = (Math.PI / 32) * 0.12; // Mandíbula casi cerrada
                lipTopPosY = -0.0005 * this.positionScale;
                lipBottomPosY = 0.0020 * this.positionScale; // Labio inferior toca dientes superiores
                break;
            case 'TH':
                jawRotX = (Math.PI / 32) * 0.2;
                lipTopPosY = 0;
                lipBottomPosY = 0;
                break;
            case 'neutral':
            default:
                jawRotX = 0;
                lipTopPosY = 0;
                lipBottomPosY = 0;
                cornersPosX = 0;
                cornersPosY = 0;
                break;
        }

        // Aplicar intensidad
        jawRotX *= adjustedIntensity * this.jawMovementScale;
        lipTopPosY *= adjustedIntensity;
        lipTopPosZ *= adjustedIntensity;
        lipBottomPosY *= adjustedIntensity;
        lipBottomPosZ *= adjustedIntensity;
        cornersPosX *= adjustedIntensity;
        cornersPosY *= adjustedIntensity;

        // 1. Aplicar Mandíbula
        if (this.jawBone && this.jawOriginalRotation) {
            const jawName = this.jawBone.name.toLowerCase();
            const isDazModel = jawName.includes('lowerjaw') || jawName.includes('genesis');

            if (isDazModel || (window as any).forceJawAxisZ) {
                // DAZ/otros: rotación en Z (hacia abajo)
                // Restamos jawRotX porque Z negativo suele abrir la mandíbula
                const targetJawZ = this.jawOriginalRotation.z - jawRotX;
                this.jawBone.rotation.z = THREE.MathUtils.lerp(
                    this.jawBone.rotation.z,
                    targetJawZ,
                    this.smoothing * 1.5
                );
            } else {
                // Blender/otros: rotación en X
                const targetJawX = this.jawOriginalRotation.x + jawRotX;
                this.jawBone.rotation.x = THREE.MathUtils.lerp(
                    this.jawBone.rotation.x,
                    targetJawX,
                    this.smoothing * 1.5
                );
            }
        }

        // 2. Aplicar Labio Superior
        this.lipTopBones.forEach(bone => {
            const orig = this.originalTransforms.get(bone.uuid);
            if (orig) {
                const isRight = bone.name.toLowerCase().includes('.r') || bone.name.toLowerCase().includes('_r') || bone.name.toLowerCase().includes('right');
                const isLeft = bone.name.toLowerCase().includes('.l') || bone.name.toLowerCase().includes('_l') || bone.name.toLowerCase().includes('left');
                const cornerX = isRight ? -cornersPosX : (isLeft ? cornersPosX : 0); 
                
                bone.position.y = THREE.MathUtils.lerp(bone.position.y, orig.pos.y + this.restingTopLipOffsetY + lipTopPosY, this.smoothing * 1.5);
                bone.position.z = THREE.MathUtils.lerp(bone.position.z, orig.pos.z + lipTopPosZ, this.smoothing * 1.5);
                bone.position.x = THREE.MathUtils.lerp(bone.position.x, orig.pos.x + cornerX, this.smoothing * 1.5);
            }
        });

        // 3. Aplicar Labio Inferior
        this.lipBottomBones.forEach(bone => {
            const orig = this.originalTransforms.get(bone.uuid);
            if (orig) {
                const isRight = bone.name.toLowerCase().includes('.r') || bone.name.toLowerCase().includes('_r') || bone.name.toLowerCase().includes('right');
                const isLeft = bone.name.toLowerCase().includes('.l') || bone.name.toLowerCase().includes('_l') || bone.name.toLowerCase().includes('left');
                const cornerX = isRight ? -cornersPosX * 0.7 : (isLeft ? cornersPosX * 0.7 : 0);
                
                bone.position.y = THREE.MathUtils.lerp(bone.position.y, orig.pos.y + lipBottomPosY, this.smoothing * 1.5);
                bone.position.z = THREE.MathUtils.lerp(bone.position.z, orig.pos.z + lipBottomPosZ, this.smoothing * 1.5);
                bone.position.x = THREE.MathUtils.lerp(bone.position.x, orig.pos.x + cornerX, this.smoothing * 1.5);
            }
        });

        // 4. Aplicar Comisuras
        this.cornerLeftBones.forEach(bone => {
            const orig = this.originalTransforms.get(bone.uuid);
            if (orig) {
                // En Blender, Left corner +X va hacia la izquierda (afuera), depende de simetría
                bone.position.x = THREE.MathUtils.lerp(bone.position.x, orig.pos.x + cornersPosX, this.smoothing * 1.5);
                bone.position.y = THREE.MathUtils.lerp(bone.position.y, orig.pos.y + cornersPosY, this.smoothing * 1.5);
            }
        });

        this.cornerRightBones.forEach(bone => {
            const orig = this.originalTransforms.get(bone.uuid);
            if (orig) {
                // Right corner -X va hacia la derecha (afuera), asumimos simetría
                bone.position.x = THREE.MathUtils.lerp(bone.position.x, orig.pos.x - cornersPosX, this.smoothing * 1.5);
                bone.position.y = THREE.MathUtils.lerp(bone.position.y, orig.pos.y + cornersPosY, this.smoothing * 1.5);
            }
        });
    }

    /**
     * Fuerza un reset inmediato (boca cerrada)
     */
    forceReset(): void {
        this.state = {
            currentViseme: 'neutral',
            targetViseme: 'neutral',
            intensity: 0,
            targetIntensity: 0,
            isSpeaking: false,
            lastSpeakTime: 0
        };

        // Reset morphs
        for (const [_, { mesh, index }] of this.availableMorphs) {
            if (mesh.morphTargetInfluences) {
                mesh.morphTargetInfluences[index] = 0;
            }
        }

        // Reset hueso
        if (this.jawBone && this.jawOriginalRotation) {
            this.jawBone.rotation.copy(this.jawOriginalRotation);
        }

        // Reset advanced bones
        const resetBones = (bones: THREE.Bone[]) => {
            bones.forEach(bone => {
                const orig = this.originalTransforms.get(bone.uuid);
                if (orig) {
                    bone.rotation.copy(orig.rot);
                    bone.position.copy(orig.pos);
                }
            });
        };

        resetBones(this.lipTopBones);
        resetBones(this.lipBottomBones);
        resetBones(this.cornerLeftBones);
        resetBones(this.cornerRightBones);
    }

    /**
     * Configura parámetros del sistema
     */
    configure(options: { smoothing?: number; silenceThreshold?: number; resetDelay?: number }): void {
        if (options.smoothing !== undefined) this.smoothing = options.smoothing;
        if (options.silenceThreshold !== undefined) this.silenceThreshold = options.silenceThreshold;
        if (options.resetDelay !== undefined) this.resetDelay = options.resetDelay;
    }

    /**
     * Establece un AnalyserNode externo
     */
    setExternalAnalyser(analyser: AnalyserNode): void {
        this.analyser = analyser;
        const bufferLength = this.analyser.frequencyBinCount;
        this.dataArray = new Uint8Array(bufferLength);
        console.log('👄 LipSync: Analizador externo conectado.');
    }

    /**
     * Verifica si ya hay un analizador configurado
     */
    hasAnalyser(): boolean {
        return this.analyser !== null;
    }

    /**
     * Obtiene el estado actual del lipsync
     */
    getState(): LipSyncState {
        return this.state;
    }

    /**
     * Obtiene el nombre del hueso de mandíbula detectado (para depuración)
     */
    getJawBoneName(): string {
        return this.jawBone ? this.jawBone.name : 'NINGUNO_DETECTADO';
    }

    /**
     * Verifica si el sistema está activo
     */
    isActive(): boolean {
        return this.availableMorphs.size > 0 || this.jawBone !== null;
    }

    /**
     * Obtiene información de estado para debug
     */
    getDebugInfo(): string {
        return `Viseme: ${this.state.targetViseme} | Intensity: ${this.state.intensity.toFixed(2)} | Speaking: ${this.state.isSpeaking}`;
    }

    /**
     * Limpia recursos
     */
    dispose(): void {
        this.forceReset();
        // Solo cerrar el audioContext si lo creamos nosotros internamente
        if (this.audioContext && !this.analyser) {
            this.audioContext.close().catch(() => { });
        }
    }
}

// Exportar clase legacy para compatibilidad
export { UniversalLipSync as LipSyncAnalyzer };

