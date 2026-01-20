/**
 * Jiggle Physics System - Físicas de rebote para huesos dinámicos
 * Aplica spring physics a huesos de pechos, cabello, falda, etc.
 */

import * as THREE from 'three';

export interface JiggleBone {
    bone: THREE.Bone;
    originalRotation: THREE.Euler;
    velocity: THREE.Vector3;
    targetRotation: THREE.Euler;
    settings?: JiggleSettings; // Configuración específica por hueso
}

export interface JiggleSettings {
    stiffness: number;  // Qué tan rápido vuelve a posición (0.1-1)
    damping: number;    // Qué tan rápido se detiene (0.1-1)
    gravity: number;    // Efecto de gravedad
    intensity: number;  // Intensidad global (0-2)
}

// Configuración por defecto
export const DEFAULT_JIGGLE_SETTINGS: JiggleSettings = {
    stiffness: 0.3,
    damping: 0.7,
    gravity: 0.02,
    intensity: 1.0
};

// Patrones de nombres de huesos que deben tener jiggle (MÁS ESTRICTO)
const JIGGLE_PATTERNS = [
    // Pechos (Ya los tenías, pero confirmados)
    'breast', 'boob', 'chest',
    // Trasero (Nuevo detectado)
    'ass', 'butt', 'glute',
    // Pelo (Gran hallazgo: hairFront y hairTail)
    'hair', 'ponytail', 'tail', 'bangs', 'front',
    // Orejas (Nuevo: ear y ear_end)
    'ear',
    // Ropa/Accesorios (Nuevo: bow_tail)
    'bow', 'ribbon', 'skirt', 'dress', 'cloth', 'sleeve'
];

// Huesos que NUNCA deben tener jiggle
const EXCLUDE_PATTERNS = [
    'sticker', 'vignette', 'effect', 'particle',
    'mch-', 'org-', 'vis_', 'wgt-', 'def-spine', 'def-hand', 'def-f_',
    'ik', 'fk', 'ctrl', 'target', 'pole', 'socket', 'parent', 'master',
    'tweak', 'pivot', 'widget', 'driver', 'offset', 'swing'
];

// Configuración de rebote por tipo (User provided)
export function getPhysicsSettings(boneName: string): Partial<JiggleSettings> {
    const n = boneName.toLowerCase();

    // Configura la "suavidad" según la parte del cuerpo
    if (n.includes('breast') || n.includes('boob')) return { stiffness: 0.2, damping: 0.1, gravity: 0.5 }; // Rebote suave
    if (n.includes('ass') || n.includes('butt')) return { stiffness: 0.3, damping: 0.2, gravity: 0.2 };    // Más firme
    if (n.includes('ear')) return { stiffness: 0.1, damping: 0.1, gravity: 0.1 };    // Muy ligero
    if (n.includes('hair') || n.includes('tail') || n.includes('ponytail')) return { stiffness: 0.15, damping: 0.15, gravity: 0.8 }; // Fluido
    if (n.includes('bow') || n.includes('ribbon') || n.includes('skirt')) return { stiffness: 0.1, damping: 0.2, gravity: 0.6 };    // Tela

    return { stiffness: 0.3, damping: 0.3, gravity: 0.5 }; // Default
}

// Detectar si un hueso es de tipo jiggle (más estricto)
export function isJiggleBone(boneName: string): boolean {
    const lower = boneName.toLowerCase();

    // Primero verificar exclusiones
    if (EXCLUDE_PATTERNS.some(pattern => lower.includes(pattern))) {
        return false;
    }

    // Solo incluir si coincide con patrones de jiggle
    return JIGGLE_PATTERNS.some(pattern => lower.includes(pattern));
}

// Clase principal para manejar jiggle physics
export class JigglePhysicsSystem {
    private bones: JiggleBone[] = [];
    private settings: JiggleSettings;
    private lastTime: number = 0;
    private rootVelocity: THREE.Vector3 = new THREE.Vector3();
    private lastRootPosition: THREE.Vector3 = new THREE.Vector3();

    constructor(settings: Partial<JiggleSettings> = {}) {
        this.settings = { ...DEFAULT_JIGGLE_SETTINGS, ...settings };
    }

    // Inicializar con un modelo 3D
    initialize(model: THREE.Object3D): void {
        this.bones = [];

        model.traverse((child) => {
            if ((child as any).isBone && isJiggleBone(child.name)) {
                const bone = child as THREE.Bone;
                // Mix global settings with bone-specific settings
                const boneSettings = { ...this.settings, ...getPhysicsSettings(bone.name) };

                this.bones.push({
                    bone,
                    originalRotation: bone.rotation.clone(),
                    velocity: new THREE.Vector3(),
                    targetRotation: bone.rotation.clone(),
                    settings: boneSettings as JiggleSettings
                });
            }
        });

        // Guardar posición inicial del root
        if (model.position) {
            this.lastRootPosition.copy(model.position);
        }

        console.log(`🌊 Jiggle Physics: ${this.bones.length} huesos detectados`);
        if (this.bones.length > 0) {
            console.log('  Huesos:', this.bones.map(b => b.bone.name).slice(0, 10).join(', '));
        }
    }

    // Actualizar cada frame
    update(delta: number, rootObject?: THREE.Object3D): void {
        if (this.bones.length === 0 || delta <= 0) return;

        // Calcular velocidad del root (para reaccionar al movimiento)
        if (rootObject) {
            this.rootVelocity.subVectors(rootObject.position, this.lastRootPosition);
            this.rootVelocity.multiplyScalar(1 / delta);
            this.lastRootPosition.copy(rootObject.position);
        }

        const globalSettings = this.settings;

        for (const jb of this.bones) {
            // Use bone specific settings if available, else global
            const { stiffness, damping, gravity, intensity } = jb.settings || globalSettings;
            // Fuerza de retorno al origen (spring)
            const returnForceX = (jb.originalRotation.x - jb.bone.rotation.x) * stiffness;
            const returnForceZ = (jb.originalRotation.z - jb.bone.rotation.z) * stiffness;

            // Aplicar fuerzas
            jb.velocity.x += returnForceX * intensity;
            jb.velocity.z += returnForceZ * intensity;

            // Gravedad (solo afecta Y, convertido a rotación X)
            jb.velocity.x += gravity * intensity;

            // Reacción al movimiento del root
            if (this.rootVelocity.length() > 0.001) {
                jb.velocity.x -= this.rootVelocity.y * 0.1 * intensity;
                jb.velocity.z -= this.rootVelocity.x * 0.1 * intensity;
            }

            // Damping (fricción)
            jb.velocity.multiplyScalar(damping);

            // Aplicar velocidad a la rotación
            jb.bone.rotation.x += jb.velocity.x * delta * 10;
            jb.bone.rotation.z += jb.velocity.z * delta * 10;

            // Límites para evitar distorsiones extremas
            const maxAngle = Math.PI / 4; // 45 grados máximo
            jb.bone.rotation.x = THREE.MathUtils.clamp(
                jb.bone.rotation.x,
                jb.originalRotation.x - maxAngle,
                jb.originalRotation.x + maxAngle
            );
            jb.bone.rotation.z = THREE.MathUtils.clamp(
                jb.bone.rotation.z,
                jb.originalRotation.z - maxAngle,
                jb.originalRotation.z + maxAngle
            );
        }
    }

    // Aplicar un "golpe" de física (para simular movimiento brusco)
    applyImpulse(force: THREE.Vector3): void {
        for (const jb of this.bones) {
            jb.velocity.add(force);
        }
    }

    // Obtener cantidad de huesos detectados
    getBoneCount(): number {
        return this.bones.length;
    }

    // Obtener nombres de huesos
    getBoneNames(): string[] {
        return this.bones.map(b => b.bone.name);
    }

    // Actualizar configuración
    updateSettings(settings: Partial<JiggleSettings>): void {
        this.settings = { ...this.settings, ...settings };
    }
}
