/**
 * Jiggle Physics System - Físicas de rebote para huesos dinámicos
 * Aplica spring physics a huesos de pechos, cabello, falda, etc.
 */

import * as THREE from 'three';

export interface JiggleBone {
    bone: THREE.Object3D;
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
    maxAngle: number;   // Ángulo máximo de deformación en radianes
}

// Configuración por defecto
export const DEFAULT_JIGGLE_SETTINGS: JiggleSettings = {
    stiffness: 0.3,
    damping: 0.7,
    gravity: 0.02,
    intensity: 1.0,
    maxAngle: Math.PI / 4 // 45 grados por defecto
};

// Patrones de nombres de huesos que deben tener jiggle (MÁS ESTRICTO)
const JIGGLE_PATTERNS = [
    // Pechos (Confirmados)
    'breast', 'boob',
    // Trasero
    'ass', 'butt', 'glute',
    // Pelo
    'hair', 'ponytail', 'tail', 'bangs', 'front',
    // Orejas
    'ear',
    // Ropa/Accesorios (Solo lazos y cintas, no estructuras del cuerpo)
    'bow', 'ribbon', 'sleeve'
];

// Huesos estructurales que NUNCA deben tener jiggle (Evita deformar espalda, panza y piernas)
const EXCLUDE_PATTERNS = [
    'sticker', 'vignette', 'effect', 'particle',
    'mch-', 'org-', 'vis_', 'wgt-', 'def-spine', 'def-hand', 'def-f_',
    'ik', 'fk', 'ctrl', 'target', 'pole', 'socket', 'parent',
    'tweak', 'pivot', 'widget', 'driver', 'offset', 'swing',
    'spine', 'torso', 'chest', 'neck', 'head', 'pelvis', 'hips',
    'belly', 'stomach', 'thigh', 'calf', 'shin', 'leg', 'foot', 'toe'
];

// Configuración de rebote por tipo (User provided)
export function getPhysicsSettings(boneName: string): Partial<JiggleSettings> {
    const n = boneName.toLowerCase();

    // Configura la "suavidad" según la parte del cuerpo
    // GRAVEDAD: La ponemos a 0 para todas estas partes carnosas. 
    // Ajustamos stiffness (rigidez) muy baja y damping alto para máximo rebote y jugosidad (el damping retiene energía).
    if (n.includes('breast') || n.includes('boob')) return { stiffness: 0.08, damping: 0.85, gravity: 0, maxAngle: Math.PI / 3 }; // Muy suave, rebota mucho con el baile
    if (n.includes('ass') || n.includes('butt') || n.includes('glute')) return { stiffness: 0.12, damping: 0.82, gravity: 0, maxAngle: Math.PI / 3 }; // Casi tan suave como los pechos
    if (n.includes('ear')) return { stiffness: 0.4, damping: 0.6, gravity: 0, maxAngle: Math.PI / 4 };    
    
    // PELO Y ROPA: Stiffness alto y damping reducido para que se mueva rápido pero no muy exagerado.
    // GRAVEDAD: Eliminada porque aplicar rotación X ciega causa que el cabello vuele hacia atrás si su eje local apunta hacia abajo.
    if (n.includes('hair') || n.includes('tail') || n.includes('ponytail')) return { stiffness: 0.8, damping: 0.6, gravity: 0, maxAngle: Math.PI / 6 }; 
    if (n.includes('bow') || n.includes('ribbon') || n.includes('skirt') || n.includes('cloth') || n.includes('dress') || n.includes('sleeve')) return { stiffness: 0.8, damping: 0.7, gravity: 0, maxAngle: Math.PI / 6 };  
    
    return { stiffness: 0.5, damping: 0.5, gravity: 0, maxAngle: Math.PI / 6 };
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
    private windX: number = 0;
    private windZ: number = 0;

    constructor(settings: Partial<JiggleSettings> = {}) {
        this.settings = { ...DEFAULT_JIGGLE_SETTINGS, ...settings };
    }

    // Inicializar con un modelo 3D
    initialize(model: THREE.Object3D): void {
        this.bones = [];

        model.traverse((child: any) => {
            // Aceptar cualquier Object3D excepto mallas completas, si su nombre cuadra
            const isValidNode = child.isBone || child.type === 'Object3D' || child.type === 'Group' || child.isGroup;
            if (isValidNode && !child.isMesh && isJiggleBone(child.name)) {
                const bone = child as THREE.Object3D;
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

    // Permitir añadir huesos manualmente (ignora reglas de exclusión de nombres)
    addBone(bone: THREE.Object3D, settingsOverrides?: Partial<JiggleSettings>): void {
        if (!bone) return;
        // Evitar duplicados
        if (this.bones.some(b => b.bone.uuid === bone.uuid)) return;
        
        const boneSettings = { ...this.settings, ...getPhysicsSettings(bone.name), ...settingsOverrides };
        
        this.bones.push({
            bone,
            originalRotation: bone.rotation.clone(),
            velocity: new THREE.Vector3(),
            targetRotation: bone.rotation.clone(),
            settings: boneSettings as JiggleSettings
        });
        console.log(`🌊 Jiggle Physics: Añadido manualmente el hueso ${bone.name}`);
    }

    // Aplicar fuerza externa (ej. interacción del ratón) a huesos específicos
    applyImpulse(boneKeyword: string, force: THREE.Vector3): void {
        const lowerKeyword = boneKeyword.toLowerCase();
        for (const jb of this.bones) {
            if (jb.bone.name.toLowerCase().includes(lowerKeyword)) {
                jb.velocity.add(force);
            }
        }
    }

    // Actualizar cada frame
    update(delta: number, rootObject?: THREE.Object3D, time?: number): void {
        if (this.bones.length === 0 || delta <= 0) return;

        // Calcular viento global basado en el tiempo
        if (time !== undefined) {
            this.windX = Math.sin(time * 1.5) * 0.03 + Math.sin(time * 0.5) * 0.015;
            this.windZ = Math.cos(time * 1.2) * 0.03;
        }

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
            
            // Permitir que IKController u otros sistemas dicten una rotación base dinámica
            let targetRot = jb.originalRotation;
            if (jb.bone.userData.ikBaseRotation) {
                // Reutilizamos un Euler temporal o creamos uno para no generar basura excesiva, pero esto es simple:
                targetRot = new THREE.Euler().setFromQuaternion(jb.bone.userData.ikBaseRotation);
            }

            // Fuerza de retorno al origen (spring)
            const returnForceX = (targetRot.x - jb.bone.rotation.x) * stiffness;
            const returnForceZ = (targetRot.z - jb.bone.rotation.z) * stiffness;

            // Aplicar fuerzas
            jb.velocity.x += returnForceX * intensity;
            jb.velocity.z += returnForceZ * intensity;

            // Gravedad (solo afecta Y, convertido a rotación X)
            // Ya que el modelo está de pie correctamente a 0 grados, += jala hacia el suelo (hacia los pies).
            jb.velocity.x += gravity * intensity;

            // Reacción al movimiento del root
            if (this.rootVelocity.length() > 0.001) {
                jb.velocity.x -= this.rootVelocity.y * 0.1 * intensity;
                jb.velocity.z -= this.rootVelocity.x * 0.1 * intensity;
            }

            // Viento a la ropa y pelo
            const n = jb.bone.name.toLowerCase();
            const isClothingOrHair = n.includes('hair') || n.includes('skirt') || n.includes('dress') || n.includes('cloth') || n.includes('bow');
            if (isClothingOrHair) {
                 jb.velocity.x += this.windX * intensity;
                 jb.velocity.z += this.windZ * intensity;
            }

            // Damping (fricción)
            jb.velocity.multiplyScalar(damping);

            // Aplicar velocidad a la rotación
            jb.bone.rotation.x += jb.velocity.x * delta * 10;
            jb.bone.rotation.z += jb.velocity.z * delta * 10;

            // Límites para evitar distorsiones extremas (relativos al targetRot dinámico)
            const limitAngle = jb.settings?.maxAngle || (Math.PI / 4); 
            jb.bone.rotation.x = THREE.MathUtils.clamp(
                jb.bone.rotation.x,
                targetRot.x - limitAngle,
                targetRot.x + limitAngle
            );
            jb.bone.rotation.z = THREE.MathUtils.clamp(
                jb.bone.rotation.z,
                targetRot.z - limitAngle,
                targetRot.z + limitAngle
            );
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
