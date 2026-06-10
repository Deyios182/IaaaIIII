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
    private availableMorphs: Map<string, { mesh: THREE.Mesh, index: number }> = new Map();

    // Configuración
    private smoothing = 0.15; // Suavizado de transiciones (0-1)
    private silenceThreshold = 0.02; // Umbral de silencio
    private resetDelay = 150; // ms después de dejar de hablar para resetear

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
    initialize(model: THREE.Object3D): { mode: 'morphs' | 'bone' | 'none', details: string } {
        this.morphMeshes = [];
        this.availableMorphs.clear();
        this.jawBone = null;

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

            // Buscar huesos de MANDÍBULA SOLAMENTE (no mentón/chin)
            if ((child as any).isBone) {
                const bone = child as THREE.Bone;
                const lower = bone.name.toLowerCase();

                // Solo buscar huesos que contengan 'jaw' (mandíbula real)
                // NO incluir 'chin' porque es el mentón, no la mandíbula
                const isJawBone = (lower.includes('jaw') && !lower.includes('chin')) ||
                    lower.includes('mandible') ||
                    lower.includes('lowerjaw');

                if (isJawBone) {
                    // Priorizar huesos de deformación (DEF-) sobre control bones
                    const isDeformBone = lower.startsWith('def-') || lower.startsWith('def_');
                    const isControlBone = lower.includes('master') || lower.includes('(drv)') ||
                        lower.includes('_drv') || lower.includes('ik') ||
                        lower.includes('fk') || lower.includes('ctrl');

                    // Priorizar DEF-jaw central (sin L/R suffix) sobre los laterales
                    const isCentralJaw = lower === 'def-jaw' || lower === 'jaw' || lower === 'lowerjaw';
                    const isSideJaw = lower.includes('jawl') || lower.includes('jawr');

                    // Solo asignar si:
                    // 1. No tenemos uno aún
                    // 2. Encontramos el jaw central (mejor que lateral)
                    // 3. Es DEF- y no tenemos DEF- aún
                    if (isCentralJaw) {
                        // El jaw central siempre gana
                        this.jawBone = bone;
                        this.jawOriginalRotation = bone.rotation.clone();
                        console.log(`👄 Jaw bone central encontrado: ${bone.name}`);
                    } else if (!this.jawBone && isDeformBone && !isSideJaw) {
                        // Fallback a DEF-jaw_master si no hay central
                        this.jawBone = bone;
                        this.jawOriginalRotation = bone.rotation.clone();
                    } else if (!this.jawBone && !isControlBone) {
                        // Último recurso: cualquier jaw que no sea de control
                        this.jawBone = bone;
                        this.jawOriginalRotation = bone.rotation.clone();
                    }
                }
            }
        });

        // Reportar resultado
        if (this.availableMorphs.size > 0) {
            const morphNames = Array.from(this.availableMorphs.keys());
            if (SHOW_VERBOSE_LOGS) console.log(`👄 LipSync inicializado (MORPHS): ${morphNames.join(', ')}`);
            return { mode: 'morphs', details: `${this.availableMorphs.size} morphs: ${morphNames.slice(0, 5).join(', ')}` };
        } else if (this.jawBone) {
            if (SHOW_VERBOSE_LOGS) console.log(`👄 LipSync inicializado (BONE): ${this.jawBone.name}`);
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
            this.analyser.getByteFrequencyData(this.dataArray);

            // Calcular intensidad
            const average = this.dataArray.reduce((a, b) => a + b, 0) / this.dataArray.length;
            this.state.targetIntensity = Math.min(average / 180, 1); // Normalizar

            // Detectar si hay habla
            if (this.state.targetIntensity > this.silenceThreshold) {
                this.state.isSpeaking = true;
                this.state.lastSpeakTime = now;

                // Determinar visema basado en frecuencias
                this.state.targetViseme = this.analyzeFrequencies();
            }
        }

        // Si se indica que está hablando, mantener estado
        if (isSpeaking) {
            this.state.isSpeaking = true;
            this.state.lastSpeakTime = now;
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

        // Aplicar al modelo
        this.applyToModel();
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

        // Mapear a visemas basado en características de frecuencia
        if (low > 0.4 && mid < 0.2) {
            return 'O'; // Vocales graves, redondeadas
        } else if (high > 0.3 && low < 0.2) {
            return 'I'; // Vocales agudas, estrechas
        } else if (mid > 0.35) {
            return 'A'; // Vocal abierta
        } else if (low > 0.25 && mid > 0.2) {
            return 'U'; // Vocal cerrada, redondeada
        } else if (mid > 0.15) {
            return 'E'; // Vocal media
        }

        return 'A'; // Default a boca abierta cuando hay sonido
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
        // Método 2: Hueso de mandíbula (fallback)
        else if (this.jawBone && this.jawOriginalRotation) {
            this.applyJawBone(intensity);
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
                'neutral': []
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
     * Aplica lip sync via rotación de hueso de mandíbula
     * Prueba diferentes ejes ya que cada modelo puede tener orientación diferente
     */
    private applyJawBone(intensity: number): void {
        if (!this.jawBone || !this.jawOriginalRotation) return;

        // Amplificar intensidad para que sea más visible
        const adjustedIntensity = Math.min(intensity * 1.5, 1);

        // Rotar mandíbula - probar múltiples ejes
        // La mayoría de modelos usan X o Z para abrir la boca
        const maxRotation = Math.PI / 6; // ~30 grados máximo

        // Calcular target basado en eje X (rotación hacia abajo)
        const targetX = this.jawOriginalRotation.x + (adjustedIntensity * maxRotation);
        // También probar Z negativo (algunos modelos Blender)
        const targetZ = this.jawOriginalRotation.z - (adjustedIntensity * maxRotation * 0.5);

        // Aplicar suavizado
        this.jawBone.rotation.x = THREE.MathUtils.lerp(
            this.jawBone.rotation.x,
            targetX,
            this.smoothing * 1.5
        );

        this.jawBone.rotation.z = THREE.MathUtils.lerp(
            this.jawBone.rotation.z,
            targetZ,
            this.smoothing * 1.5
        );

        // Debug para verificar que se está aplicando
        if (SHOW_VERBOSE_LOGS && adjustedIntensity > 0.1 && Math.random() < 0.01) {
            console.log(`👄 Jaw rotation: intensity=${adjustedIntensity.toFixed(2)}, x=${this.jawBone.rotation.x.toFixed(3)}`);
        }
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

