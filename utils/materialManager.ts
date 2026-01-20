/**
 * Material Manager - Sistema de gestión de materiales dinámicos
 * Permite cambios de color, texturas y efectos en tiempo real
 */

import * as THREE from 'three';

export interface ColorPalette {
    hair?: THREE.Color;
    eyes?: THREE.Color;
    skin?: THREE.Color;
    outfit?: THREE.Color;
    underwear?: THREE.Color;
}

export interface MaterialReference {
    mesh: THREE.Mesh;
    material: THREE.Material;
    originalColor?: THREE.Color;
    category: 'hair' | 'eyes' | 'skin' | 'outfit' | 'underwear' | 'other';
}

/**
 * MaterialManager - Gestiona materiales del avatar
 */
export class MaterialManager {
    private materials: MaterialReference[] = [];
    private currentPalette: ColorPalette = {};

    /**
     * Inicializar con modelo 3D
     */
    initialize(model: THREE.Object3D): void {
        this.materials = [];

        model.traverse((child) => {
            if (!(child as any).isMesh) return;

            const mesh = child as THREE.Mesh;
            const name = mesh.name.toLowerCase();
            const category = this.categorizeMesh(name);

            // Procesar materiales
            const processMaterial = (mat: THREE.Material) => {
                if (mat instanceof THREE.MeshStandardMaterial) {
                    const ref: MaterialReference = {
                        mesh,
                        material: mat,
                        originalColor: mat.color.clone(),
                        category
                    };
                    this.materials.push(ref);
                }
            };

            if (Array.isArray(mesh.material)) {
                mesh.material.forEach(processMaterial);
            } else if (mesh.material) {
                processMaterial(mesh.material);
            }
        });

        console.log(`🎨 MaterialManager: ${this.materials.length} materiales detectados`);

        // === FIX AUTOMÁTICO DE PIEL ===
        // Aplicar configuración realista a todo lo detectado como 'skin' inmediatamente
        this.materials.forEach(ref => {
            if (ref.category === 'skin' && ref.material instanceof THREE.MeshStandardMaterial) {
                // Piel humana: Baja metalicidad, rugosidad media
                ref.material.roughness = 0.45; // Ni muy brillante (sudor), ni muy mate (tiza)
                ref.material.metalness = 0.1;  // La piel no es metal

                // TRUCO PRO: Tintar el color ligeramente hacia rojo/naranja para simular sangre bajo la piel
                // Solo si el color es muy pálido
                const color = ref.material.color;
                if (color.r > 0.8 && color.g > 0.8 && color.b > 0.8) {
                    // Es blanco/gris, darle un tono "carne" sutil
                    ref.material.color.setHex(0xffe0bd);
                }
                ref.material.needsUpdate = true;
                console.log('🎨 Skin material optimizado:', ref.mesh.name);
            }

            // Ojos: Configuración más equilibrada (evitar demasiado brillo)
            if (ref.category === 'eyes' && ref.material instanceof THREE.MeshStandardMaterial) {
                ref.material.roughness = 0.5; // Menos brillante
                ref.material.metalness = 0.0;
                ref.material.envMapIntensity = 0.5; // Reducir reflejos
                ref.material.needsUpdate = true;
                console.log('👁️ Eye material optimizado (Toned down):', ref.mesh.name);
            }
        });

        // Guardar paleta actual
        this.currentPalette = this.extractCurrentPalette();
    }

    /**
     * Categorizar mesh por nombre
     */
    private categorizeMesh(name: string): MaterialReference['category'] {
        if (name.includes('hair')) return 'hair';
        if (name.includes('eye') && !name.includes('lash')) return 'eyes';
        if (name.includes('body') || name.includes('face') || name.includes('skin')) return 'skin';
        if (name.includes('underwear') || name.includes('bra') || name.includes('panties')) return 'underwear';
        if (name.includes('cloth') || name.includes('dress') || name.includes('outfit')) return 'outfit';
        return 'other';
    }

    /**
     * Extraer paleta actual del modelo
     */
    private extractCurrentPalette(): ColorPalette {
        const palette: ColorPalette = {};

        ['hair', 'eyes', 'skin', 'outfit', 'underwear'].forEach(category => {
            const ref = this.materials.find(m => m.category === category);
            if (ref && ref.material instanceof THREE.MeshStandardMaterial) {
                palette[category as keyof ColorPalette] = ref.material.color.clone();
            }
        });

        return palette;
    }

    /**
     * Aplicar paleta de colores
     */
    applyPalette(palette: Partial<ColorPalette>, smooth: boolean = true): void {
        Object.entries(palette).forEach(([category, color]) => {
            if (!color) return;

            this.materials
                .filter(ref => ref.category === category)
                .forEach(ref => {
                    if (ref.material instanceof THREE.MeshStandardMaterial) {
                        if (smooth) {
                            // Transición suave
                            this.smoothColorTransition(ref.material, color);
                        } else {
                            // Cambio inmediato
                            ref.material.color.copy(color);
                        }
                    }
                });
        });

        // Actualizar paleta actual
        this.currentPalette = { ...this.currentPalette, ...palette };
        console.log(`🎨 Paleta aplicada:`, palette);
    }

    /**
     * Transición suave de color
     */
    private smoothColorTransition(material: THREE.MeshStandardMaterial, targetColor: THREE.Color, duration: number = 0.5): void {
        const startColor = material.color.clone();
        const startTime = Date.now();

        const animate = () => {
            const elapsed = (Date.now() - startTime) / 1000;
            const progress = Math.min(elapsed / duration, 1);

            material.color.lerpColors(startColor, targetColor, progress);

            if (progress < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    /**
     * Cambiar color de categoría específica
     */
    setColor(category: keyof ColorPalette, color: THREE.Color | string): void {
        const colorObj = typeof color === 'string' ? new THREE.Color(color) : color;
        this.applyPalette({ [category]: colorObj });
    }

    /**
     * Resetear a colores originales
     */
    resetToOriginal(): void {
        this.materials.forEach(ref => {
            if (ref.originalColor && ref.material instanceof THREE.MeshStandardMaterial) {
                ref.material.color.copy(ref.originalColor);
            }
        });
        console.log('🔄 Materiales reseteados a originales');
    }

    /**
     * Obtener paleta actual
     */
    getCurrentPalette(): ColorPalette {
        return { ...this.currentPalette };
    }

    /**
     * Aplicar efecto glow a categoría
     */
    applyGlow(category: keyof ColorPalette, intensity: number = 0.5): void {
        this.materials
            .filter(ref => ref.category === category)
            .forEach(ref => {
                if (ref.material instanceof THREE.MeshStandardMaterial) {
                    ref.material.emissive.copy(ref.material.color);
                    ref.material.emissiveIntensity = intensity;
                }
            });
    }

    /**
     * Remover efecto glow
     */
    removeGlow(category?: keyof ColorPalette): void {
        const refs = category
            ? this.materials.filter(ref => ref.category === category)
            : this.materials;

        refs.forEach(ref => {
            if (ref.material instanceof THREE.MeshStandardMaterial) {
                ref.material.emissiveIntensity = 0;
            }
        });
    }

    /**
     * Ajustar metalness/roughness
     */
    setMaterialProperties(
        category: keyof ColorPalette,
        properties: { metalness?: number; roughness?: number; transparent?: boolean; opacity?: number }
    ): void {
        this.materials
            .filter(ref => ref.category === category)
            .forEach(ref => {
                if (ref.material instanceof THREE.MeshStandardMaterial) {
                    if (properties.metalness !== undefined) ref.material.metalness = properties.metalness;
                    if (properties.roughness !== undefined) ref.material.roughness = properties.roughness;
                    if (properties.transparent !== undefined) ref.material.transparent = properties.transparent;
                    if (properties.opacity !== undefined) ref.material.opacity = properties.opacity;
                    ref.material.needsUpdate = true;
                }
            });
    }
}

// === PRESETS DE PALETAS ===

export const PALETTE_PRESETS: Record<string, ColorPalette> = {
    default: {
        hair: new THREE.Color('#2c1810'),
        eyes: new THREE.Color('#4a90e2'),
        skin: new THREE.Color('#f5d7c3'),
        outfit: new THREE.Color('#e74c3c'),
        underwear: new THREE.Color('#ffffff')
    },
    vampire: {
        hair: new THREE.Color('#1a0a0a'),
        eyes: new THREE.Color('#ff0000'),
        skin: new THREE.Color('#e8d5d5'),
        outfit: new THREE.Color('#1c1c1c'),
        underwear: new THREE.Color('#8b0000')
    },
    angel: {
        hair: new THREE.Color('#f0e68c'),
        eyes: new THREE.Color('#87ceeb'),
        skin: new THREE.Color('#ffe4e1'),
        outfit: new THREE.Color('#ffffff'),
        underwear: new THREE.Color('#f0f8ff')
    },
    neon: {
        hair: new THREE.Color('#ff00ff'),
        eyes: new THREE.Color('#00ffff'),
        skin: new THREE.Color('#ffd7be'),
        outfit: new THREE.Color('#ff1493'),
        underwear: new THREE.Color('#7fff00')
    },
    gothic: {
        hair: new THREE.Color('#000000'),
        eyes: new THREE.Color('#9370db'),
        skin: new THREE.Color('#f5f5dc'),
        outfit: new THREE.Color('#2f2f2f'),
        underwear: new THREE.Color('#4b0082')
    }
};

/**
 * Helper para aplicar preset
 */
export function applyPreset(manager: MaterialManager, presetName: string): boolean {
    const preset = PALETTE_PRESETS[presetName];
    if (!preset) {
        console.warn(`⚠️ Preset no encontrado: ${presetName}`);
        return false;
    }

    manager.applyPalette(preset);
    console.log(`✨ Preset aplicado: ${presetName}`);
    return true;
}
