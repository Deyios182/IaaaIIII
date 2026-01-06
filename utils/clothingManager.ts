/**
 * Clothing Manager - Sistema de toggle de ropa para modelos 3D
 * Permite mostrar/ocultar diferentes meshes de ropa
 */

import * as THREE from 'three';

export interface ClothingItem {
    name: string;
    displayName: string;
    visible: boolean;
    mesh: THREE.Mesh;
    category: 'outfit' | 'accessory' | 'underwear' | 'body' | 'other';
}

export interface ClothingState {
    items: ClothingItem[];
}

// Patrones para categorizar ropa
const CATEGORY_PATTERNS: Record<string, string[]> = {
    outfit: ['dress', 'clothes', 'outfit', 'normal', 'shirt', 'pants', 'skirt', 'jacket', 'coat', 'cloth'],
    underwear: ['underwear', 'bra', 'panties', 'lingerie', 'sexy', 'bikini'],
    accessory: ['glasses', 'hat', 'ribbon', 'bow', 'necklace', 'earring', 'acc', 'stockings', 'socks'],
    body: ['body', 'skin', 'face', 'eye', 'hair', 'head', 'hand', 'foot', 'arm', 'leg', 'tongue', 'lash', 'blush', 'sticker', 'brows'],
};

// Determinar categoría de un mesh por su nombre
export function getCategoryForMesh(meshName: string): ClothingItem['category'] {
    const lower = meshName.toLowerCase();

    for (const [category, patterns] of Object.entries(CATEGORY_PATTERNS)) {
        if (patterns.some(pattern => lower.includes(pattern))) {
            return category as ClothingItem['category'];
        }
    }

    return 'other';
}

// Generar nombre legible para display
export function getDisplayName(meshName: string): string {
    // Limpiar prefijos comunes
    let clean = meshName
        .replace(/^(Ani_|Ani |DEF_|MCH_|ORG_)/i, '')
        .replace(/_/g, ' ')
        .replace(/\./g, ' ')
        .trim();

    // Capitalizar primera letra
    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Clase principal para manejar ropa
export class ClothingManager {
    private items: ClothingItem[] = [];
    private model: THREE.Object3D | null = null;

    // Inicializar con un modelo 3D
    initialize(model: THREE.Object3D): ClothingItem[] {
        this.model = model;
        this.items = [];

        model.traverse((child) => {
            if ((child as any).isMesh) {
                const mesh = child as THREE.Mesh;
                const category = getCategoryForMesh(mesh.name);

                // Solo incluir items que no son parte del cuerpo
                if (category !== 'body') {
                    this.items.push({
                        name: mesh.name,
                        displayName: getDisplayName(mesh.name),
                        visible: mesh.visible,
                        mesh,
                        category
                    });
                }
            }
        });

        console.log(`👗 Clothing Manager: ${this.items.length} prendas detectadas`);
        this.items.forEach(item => {
            console.log(`  ${item.visible ? '👁' : '🚫'} [${item.category}] ${item.displayName}`);
        });

        return this.items;
    }

    // Toggle visibilidad de un item
    toggleItem(meshName: string): boolean {
        const item = this.items.find(i => i.name === meshName);
        if (item) {
            item.visible = !item.visible;
            item.mesh.visible = item.visible;
            return item.visible;
        }
        return false;
    }

    // Mostrar un item
    showItem(meshName: string): void {
        const item = this.items.find(i => i.name === meshName);
        if (item) {
            item.visible = true;
            item.mesh.visible = true;
        }
    }

    // Ocultar un item
    hideItem(meshName: string): void {
        const item = this.items.find(i => i.name === meshName);
        if (item) {
            item.visible = false;
            item.mesh.visible = false;
        }
    }

    // Toggle por categoría
    toggleCategory(category: ClothingItem['category'], visible?: boolean): void {
        this.items
            .filter(item => item.category === category)
            .forEach(item => {
                const newVisible = visible !== undefined ? visible : !item.visible;
                item.visible = newVisible;
                item.mesh.visible = newVisible;
            });
    }

    // Obtener todos los items
    getItems(): ClothingItem[] {
        return this.items;
    }

    // Obtener items por categoría
    getItemsByCategory(category: ClothingItem['category']): ClothingItem[] {
        return this.items.filter(item => item.category === category);
    }

    // Preset: Solo ropa interior
    presetUnderwear(): void {
        this.toggleCategory('outfit', false);
        this.toggleCategory('underwear', true);
        this.toggleCategory('accessory', true);
    }

    // Preset: Ropa completa
    presetFullClothed(): void {
        this.toggleCategory('outfit', true);
        this.toggleCategory('underwear', true);
        this.toggleCategory('accessory', true);
    }

    // Preset: Solo accesorios
    presetAccessoriesOnly(): void {
        this.toggleCategory('outfit', false);
        this.toggleCategory('underwear', false);
        this.toggleCategory('accessory', true);
    }

    // --- STRIP LOGIC ---
    private currentStripLevel = 0; // 0=Full, 1=NoAcc, 2=NoOutfit, 3=Naked

    stripLayer(): string {
        this.currentStripLevel++;
        if (this.currentStripLevel > 3) this.currentStripLevel = 3;

        switch (this.currentStripLevel) {
            case 1: // Quitar Accesorios
                this.toggleCategory('accessory', false);
                return "Quitando accesorios...";
            case 2: // Quitar Ropa Principal (Queda en Ropa Interior)
                this.toggleCategory('outfit', false);
                return "Quitando ropa exterior...";
            case 3: // Quitar Ropa Interior (Desnuda)
                this.toggleCategory('underwear', false);
                return "Quitando ropa interior...";
            default:
                return "Ya no tengo nada más que quitarme.";
        }
    }

    restoreLayer(): string {
        this.currentStripLevel--;
        if (this.currentStripLevel < 0) this.currentStripLevel = 0;

        switch (this.currentStripLevel) {
            case 2: // Poner Ropa Interior (vuelta de desnuda)
                this.toggleCategory('underwear', true);
                return "Poniéndome ropa interior...";
            case 1: // Poner Ropa Principal
                this.toggleCategory('outfit', true);
                return "Vistiéndome...";
            case 0: // Poner Accesorios (Full)
                this.toggleCategory('accessory', true);
                return "Poniéndome accesorios...";
            default:
                this.presetFullClothed(); // Fallback
                return "Completamente vestida.";
        }
    }

    getStripLevel(): number {
        return this.currentStripLevel;
    }

    stripFull(): string {
        this.currentStripLevel = 3;
        this.toggleCategory('accessory', false);
        this.toggleCategory('outfit', false);
        this.toggleCategory('underwear', false);
        return "Me he quitado todo.";
    }

    dressFull(): string {
        this.currentStripLevel = 0;
        this.toggleCategory('accessory', true);
        this.toggleCategory('outfit', true);
        this.toggleCategory('underwear', true);
        return "Me he vestido completamente.";
    }
}

// Singleton instance para uso global
let clothingManagerInstance: ClothingManager | null = null;

export function getClothingManager(): ClothingManager {
    if (!clothingManagerInstance) {
        clothingManagerInstance = new ClothingManager();
    }
    return clothingManagerInstance;
}

export function resetClothingManager(): void {
    clothingManagerInstance = null;
}
