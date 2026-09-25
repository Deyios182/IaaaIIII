/**
 * Clothing Manager - Sistema de toggle de ropa para modelos 3D
 * Permite mostrar/ocultar diferentes meshes de ropa
 */

import * as THREE from 'three';

export type ClothingCategory = 'outfit' | 'underwear' | 'shoes' | 'accessory' | 'other' | 'body';

export interface ClothingItem {
    name: string;
    displayName: string;
    visible: boolean;
    mesh?: THREE.Mesh;
    material?: THREE.Material;
    category: ClothingCategory;
}

export interface ClothingState {
    items: ClothingItem[];
}

// Determinar categoría de un mesh o material por su nombre (soporta inglés, español, chino y japonés)
export function getCategoryForMesh(meshName: string): ClothingCategory {
    const lower = meshName.toLowerCase();

    // 1. BASURA DEL RIG (WIDGETS), COLISIONES Y MALLAS DUPLICADAS/ROTAS - IGNORAR SIEMPRE
    if (
        lower.startsWith('wgt') ||
        lower.includes('collision') ||
        lower.includes('ik_') ||
        lower.includes('boots2') ||
        lower.includes('bots2') ||
        lower.includes('flatfooted')
    ) {
        return 'body'; // Protegido / Oculto de la lista
    }

    // 2. PARTES ANATÓMICAS VITALES DEL CUERPO (PROTEGIDAS - NO DESARMABLES)
    const bodyKeywords = [
        'ani_main', 'base_body', 'body', 'cuerpo', 'skin', 'piel', 'torso',
        'head', 'cabeza', 'face', 'cara', 'eye', 'ojo', 'pupil', 'iris', 'sclera',
        'brows', 'ceja', 'lash', 'pestana', 'mouth', 'boca', 'teeth', 'diente',
        'tongue', 'lengua', 'ani_blush', 'blush', 'rubor', 'glows', 'tear', 'lagrima',
        'outline', 'shadow',
        // Chino / Japonés común en modelos MMD / PMX
        '身体', '身体2', '脸', '脸部', '面部', '头部', '头', '皮肤', '素体', '眼睛',
        '眼', '瞳', '眉', '睫', '嘴', '牙', '舌', '脸红', '白眼'
    ];

    if (bodyKeywords.some(part => lower.includes(part)) &&
        !lower.includes('suit') && !lower.includes('stocking') && !lower.includes('cloth') &&
        !lower.includes('泳装') && !lower.includes('内衣')) {
        return 'body';
    }

    // 3. CALZADO (Zapatos, Botas, etc.)
    const shoesKeywords = [
        'shoe', 'shoes', 'boot', 'boots', 'sneaker', 'sneakers', 'heel', 'heels',
        'sandal', 'sandals', 'zapato', 'zapatos', 'bota', 'botas', 'kutsu', 'footwear',
        'loafer', 'pumps', 'slippers',
        // Chino / Japonés
        '鞋', '鞋子', '靴', '靴子', '高跟', '高跟鞋', '拖鞋', '凉鞋', '皮鞋'
    ];
    if (shoesKeywords.some(k => lower.includes(k))) {
        return 'shoes';
    }

    // 4. ROPA INTERIOR Y LENCERÍA
    const underwearKeywords = [
        'underwear', 'bra', 'brassiere', 'sujetador', 'panties', 'panty', 'braga',
        'bragas', 'calzon', 'thong', 'tanga', 'lingerie', 'lenceria', 'bikini',
        'swimsuit', 'pantu', 'shitagi', 'garter', 'stocking', 'stockings',
        'medias', 'calcetin', 'calcetines', 'socks', 'tights', 'under',
        // Chino / Japonés
        '内衣', '文胸', '胸罩', '内裤', '胖次', '安全裤', '泳装', '泳衣', '比基尼',
        '吊带', '吊带袜', '丝袜', '袜子', '腿环', '乳贴', '丁字裤'
    ];
    if (underwearKeywords.some(k => lower.includes(k))) {
        return 'underwear';
    }

    // 5. ACCESORIOS Y JOYERÍA
    const accessoryKeywords = [
        'glasses', 'gafas', 'lentes', 'hat', 'sombrero', 'gorro', 'cap', 'ribbon',
        'lazo', 'mono', 'bow', 'necklace', 'collar', 'choker', 'gargantilla',
        'earring', 'earrings', 'pendiente', 'pendientes', 'arete', 'aretes',
        'ring', 'anillo', 'wrist', 'muñequera', 'bracelet', 'pulsera', 'belt',
        'cinturon', 'cinto', 'headband', 'diadema', 'piercing', 'tail', 'cola',
        'ears', 'orejas', 'wings', 'alas', 'horn', 'horns', 'cuernos', 'mask',
        'mascara', 'tie', 'corbata', 'badge', 'brooch', 'pin', 'acc', 'accesorio',
        'accessory', 'deco', 'prop',
        // Chino / Japonés
        '饰品', '首饰', '项链', '项圈', '手镯', '手链', '戒指', '耳环', '耳饰',
        '帽子', '发饰', '头饰', '蝴蝶结', '手套', '翅膀', '尾巴', '角', '面具',
        '围巾', '领带', '领结', '胸针', '披风', '斗篷', '光环'
    ];
    if (accessoryKeywords.some(k => lower.includes(k))) {
        return 'accessory';
    }

    // 6. ROPA EXTERIOR / OUTFIT
    const outfitKeywords = [
        'dress', 'vestido', 'skirt', 'falda', 'shirt', 'camisa', 'camiseta',
        'tshirt', 'blouse', 'blusa', 'top', 'tops', 'bottom', 'bottoms',
        'pants', 'pantalon', 'pantalones', 'shorts', 'jacket', 'chaqueta',
        'campera', 'coat', 'abrigo', 'suit', 'traje', 'uniform', 'uniforme',
        'sweater', 'sueter', 'cardigan', 'hoodie', 'sudadera', 'vest', 'chaleco',
        'apron', 'delantal', 'gloves', 'guantes', 'ani_gloves', 'sleeve',
        'sleeves', 'manga', 'mangas', 'fuku', 'seifuku', 'onepiece', 'costume',
        'ropa', 'outfit', 'cloth', 'clothes', 'outer', 'over',
        // Chino / Japonés
        '外套', '大衣', '上衣', '衣服', '裙子', '短裙', '长裙', '半身裙', '百褶裙',
        '连衣裙', '裤子', '长裤', '短裤', '热裤', '衬衫', '毛衣', '卫衣', '制服',
        '水手服', '旗袍', '女仆装', '和服', '浴衣', '西装', '礼服', '背心', '吊带衫'
    ];
    if (outfitKeywords.some(k => lower.includes(k))) {
        return 'outfit';
    }

    // 7. Si no es parte vital del cuerpo, es una prenda o elemento removible del modelo
    return 'other';
}

// Generar nombre legible en español para display
export function getDisplayName(meshName: string): string {
    let clean = meshName
        .replace(/^(Ani_|Ani |DEF_|MCH_|ORG_|Mesh_|Obj_|Model_)/i, '')
        .replace(/_/g, ' ')
        .replace(/\./g, ' ')
        .trim();

    const translations: [RegExp, string][] = [
        // Chino común en MMD
        [/^(外套|大衣|风衣)/i, 'Chaqueta / Abrigo'],
        [/^(上衣|衣服|衬衫|衬衣)/i, 'Camisa / Top'],
        [/^(连衣裙)/i, 'Vestido'],
        [/^(短裙|裙子|长裙|半身裙|百褶裙)/i, 'Falda'],
        [/^(短裤|热裤)/i, 'Pantalón Corto'],
        [/^(裤子|长裤)/i, 'Pantalón'],
        [/^(内衣|文胸|胸罩)/i, 'Sujetador / Ropa Interior'],
        [/^(内裤|胖次)/i, 'Bragas / Ropa Interior'],
        [/^(安全裤)/i, 'Pantalón de Seguridad'],
        [/^(泳装|泳衣|比基尼)/i, 'Bikini / Traje de Baño'],
        [/^(丝袜|袜子|吊带袜)/i, 'Medias / Calcetines'],
        [/^(鞋子|鞋|靴子|靴|高跟鞋|高跟)/i, 'Calzado / Zapatos'],
        [/^(饰品|首饰|项链|项圈)/i, 'Collar / Accesorio'],
        [/^(手套)/i, 'Guantes'],
        [/^(帽子|发饰|头饰|蝴蝶结)/i, 'Accesorio de Cabeza'],
        [/^(耳环|耳饰)/i, 'Pendientes'],
        [/^(手镯|手链|戒指)/i, 'Joyería'],
        [/^(翅膀|羽翼)/i, 'Alas'],
        [/^(尾巴)/i, 'Cola'],
        [/^(披风|斗篷)/i, 'Capa / Mantón'],
        [/^(和服|浴衣|旗袍|女仆装|制服)/i, 'Traje Especial / Uniforme'],
        // Inglés / Occidental
        [/^dress/i, 'Vestido'],
        [/^skirt/i, 'Falda'],
        [/^jacket/i, 'Chaqueta'],
        [/^coat/i, 'Abrigo'],
        [/^pants/i, 'Pantalón'],
        [/^shorts/i, 'Pantalón Corto'],
        [/^shirt/i, 'Camisa'],
        [/^blouse/i, 'Blusa'],
        [/^top/i, 'Top / Prenda Superior'],
        [/^bottom/i, 'Prenda Inferior'],
        [/^sweater/i, 'Suéter'],
        [/^hoodie/i, 'Sudadera con Capucha'],
        [/^cardigan/i, 'Cárdigan'],
        [/^suit/i, 'Traje'],
        [/^uniform/i, 'Uniforme'],
        [/^boots?/i, 'Botas'],
        [/^shoes?/i, 'Zapatos'],
        [/^heels?/i, 'Tacones'],
        [/^sandals?/i, 'Sandalias'],
        [/^socks?/i, 'Calcetines'],
        [/^stockings?/i, 'Medias'],
        [/^tights?/i, 'Medias'],
        [/^bra(ssiere)?/i, 'Sujetador'],
        [/^panties?/i, 'Ropa Interior (Bragas)'],
        [/^underwear/i, 'Ropa Interior'],
        [/^lingerie/i, 'Lencería'],
        [/^bikini/i, 'Bikini'],
        [/^thong/i, 'Tanga'],
        [/^garter/i, 'Liguero'],
        [/^gloves?/i, 'Guantes'],
        [/^sleeves?/i, 'Mangas'],
        [/^glasses/i, 'Gafas'],
        [/^hat/i, 'Sombrero'],
        [/^cap/i, 'Gorra'],
        [/^ribbon/i, 'Lazo'],
        [/^bow/i, 'Moño / Lazo'],
        [/^necklace/i, 'Collar'],
        [/^choker/i, 'Gargantilla'],
        [/^earrings?/i, 'Pendientes'],
        [/^belt/i, 'Cinturón'],
        [/^headband/i, 'Diadema'],
        [/^tie/i, 'Corbata'],
        [/^tail/i, 'Cola'],
        [/^ears?/i, 'Orejas'],
        [/^wings?/i, 'Alas'],
        [/^horns?/i, 'Cuernos'],
    ];

    for (const [regex, spanish] of translations) {
        if (regex.test(clean)) {
            const rest = clean.replace(regex, '').trim();
            return rest ? `${spanish} (${rest})` : spanish;
        }
    }

    return clean.charAt(0).toUpperCase() + clean.slice(1);
}

// Clase principal para manejar ropa
export class ClothingManager {
    private items: ClothingItem[] = [];
    private model: THREE.Object3D | null = null;
    private currentModelId: string = 'default';
    private listeners: Set<() => void> = new Set();
    private currentStripLevel = 0; // 0=Full, 1=NoAcc, 2=NoOutfit, 3=Naked

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    private notify(): void {
        this.listeners.forEach(fn => fn());
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('nova-clothing-items-updated', {
                detail: {
                    modelId: this.currentModelId,
                    items: this.getItems().map(i => ({
                        name: i.name,
                        displayName: i.displayName,
                        visible: i.visible,
                        category: i.category
                    }))
                }
            }));
        }
    }

    // Inicializar con un modelo 3D y su identificador
    initialize(model: THREE.Object3D, modelId: string = 'default'): ClothingItem[] {
        this.model = model;
        
        // 0. Extraer un ID estable si es una URL Blob (ej: blob:http://...#MiModelo.pmx) o ruta completa
        let stableId = modelId;
        if (modelId.startsWith('blob:') && modelId.includes('#')) {
            stableId = decodeURIComponent(modelId.split('#')[1]);
        } else if (modelId.includes('/')) {
            stableId = modelId.split('/').pop() || modelId;
        }
        this.currentModelId = stableId;
        
        this.items = [];

        // 1. Recolectar todas las mallas
        const meshes: THREE.Mesh[] = [];
        model.traverse((child) => {
            if ((child as any).isMesh) {
                meshes.push(child as THREE.Mesh);
            }
        });

        // 2. Procesar cada malla
        for (const mesh of meshes) {
            const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
            
            if (materials.length > 1) {
                // La malla tiene múltiples materiales (Típico de PMX o modelos combinados)
                // Se ocultan los materiales individuales, no la malla entera.
                materials.forEach((mat: any, idx: number) => {
                    const matName = mat.name || `${mesh.name}_Mat_${idx + 1}`;
                    const category = getCategoryForMesh(matName);
                    if (category !== 'body') {
                        this.items.push({
                            name: matName,
                            displayName: getDisplayName(matName),
                            visible: mat.visible !== false,
                            material: mat,
                            category
                        });
                    }
                });
            } else {
                // La malla tiene un solo material (Típico de GLTF/FBX modular)
                // Se oculta la malla entera.
                const category = getCategoryForMesh(mesh.name);
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
        }

        // Restaurar estado guardado para este modelo específico
        this.loadSettings(this.currentModelId);
        this.notify();

        console.log(`👗 [ClothingManager] Modelo "${modelId}": ${this.items.length} prendas y accesorios configurados.`);
        return this.items;
    }

    // Aplicar visibilidad física y de render a un item (malla o material de textura)
    private applyItemVisibility(item: ClothingItem, visible: boolean): void {
        item.visible = visible;
        if (item.mesh) {
            item.mesh.visible = visible;
        }
        if (item.material) {
            const mat = item.material as any;
            mat.visible = visible;
            mat.opacity = visible ? 1.0 : 0.0;
            mat.transparent = !visible;
            mat.depthWrite = visible;
            mat.needsUpdate = true;
        }
    }

    // Toggle visibilidad de un item
    toggleItem(meshName: string): boolean {
        const item = this.items.find(i => i.name === meshName);
        if (item) {
            const newVis = !item.visible;
            this.applyItemVisibility(item, newVis);
            this.saveSettings(this.currentModelId);
            this.notify();
            return newVis;
        }
        return false;
    }

    // Establecer visibilidad explícita de un item
    setItemVisibility(meshName: string, visible: boolean): void {
        const item = this.items.find(i => i.name === meshName);
        if (item) {
            this.applyItemVisibility(item, visible);
            this.saveSettings(this.currentModelId);
            this.notify();
        }
    }

    // Mostrar un item
    showItem(meshName: string): void {
        this.setItemVisibility(meshName, true);
    }

    // Ocultar un item
    hideItem(meshName: string): void {
        this.setItemVisibility(meshName, false);
    }

    // Toggle por categoría
    toggleCategory(category: ClothingCategory, visible?: boolean): void {
        this.items
            .filter(item => item.category === category)
            .forEach(item => {
                const newVisible = visible !== undefined ? visible : !item.visible;
                this.applyItemVisibility(item, newVisible);
            });
        this.saveSettings(this.currentModelId);
        this.notify();
    }

    // Establecer visibilidad para toda una categoría
    setCategoryVisibility(category: ClothingCategory, visible: boolean): void {
        this.toggleCategory(category, visible);
    }

    // Obtener todos los items del modelo actual
    getItems(): ClothingItem[] {
        return this.items;
    }

    // Obtener items por categoría
    getItemsByCategory(category: ClothingCategory): ClothingItem[] {
        return this.items.filter(item => item.category === category);
    }

    // Preset: Ropa completa
    presetFullClothed(): void {
        this.items.forEach(item => {
            this.applyItemVisibility(item, true);
        });
        this.currentStripLevel = 0;
        this.saveSettings(this.currentModelId);
        this.notify();
    }

    // Preset: Solo ropa interior
    presetUnderwear(): void {
        this.items.forEach(item => {
            if (item.category === 'outfit' || item.category === 'shoes') {
                this.applyItemVisibility(item, false);
            } else if (item.category === 'underwear' || item.category === 'accessory') {
                this.applyItemVisibility(item, true);
            }
        });
        this.currentStripLevel = 2;
        this.saveSettings(this.currentModelId);
        this.notify();
    }

    // Preset: Solo accesorios
    presetAccessoriesOnly(): void {
        this.items.forEach(item => {
            if (item.category === 'accessory') {
                this.applyItemVisibility(item, true);
            } else {
                this.applyItemVisibility(item, false);
            }
        });
        this.hideNeckAccessories();
        this.currentStripLevel = 1;
        this.saveSettings(this.currentModelId);
        this.notify();
    }

    // Preset: Mínimo / Desnuda
    presetNaked(): void {
        this.items.forEach(item => {
            this.applyItemVisibility(item, false);
        });
        this.currentStripLevel = 3;
        this.saveSettings(this.currentModelId);
        this.notify();
    }

    // Ocultar gargantillas y accesorios de cuello que causan desprendimiento o clipping
    hideNeckAccessories(): void {
        const keywords = ['choker', 'necklace', 'collar', 'neckband', 'neckstrap', 'neck_ribbon', 'neck_acc', 'neck_accessory', 'neckacc', '项链', '项圈'];
        this.items.forEach(item => {
            const lower = item.name.toLowerCase();
            if (keywords.some(k => lower.includes(k))) {
                this.applyItemVisibility(item, false);
            }
        });
    }

    // Persistencia por modelo (Visibilidad y Categorías Manuales)
    saveSettings(modelId: string): void {
        try {
            const keyVis = `nova_clothing_settings_${modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const keyCat = `nova_clothing_cat_${modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const visMap: Record<string, boolean> = {};
            const catMap: Record<string, ClothingCategory> = {};
            
            this.items.forEach(i => {
                visMap[i.name] = i.visible;
                catMap[i.name] = i.category;
            });
            
            localStorage.setItem(keyVis, JSON.stringify(visMap));
            localStorage.setItem(keyCat, JSON.stringify(catMap));
        } catch (_) {}
    }

    loadSettings(modelId: string): void {
        try {
            const keyVis = `nova_clothing_settings_${modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            const keyCat = `nova_clothing_cat_${modelId.replace(/[^a-zA-Z0-9_-]/g, '_')}`;
            
            const savedVis = localStorage.getItem(keyVis);
            const savedCat = localStorage.getItem(keyCat);
            
            let visMap: Record<string, boolean> = {};
            let catMap: Record<string, ClothingCategory> = {};
            
            if (savedVis) visMap = JSON.parse(savedVis);
            if (savedCat) catMap = JSON.parse(savedCat);
            
            this.items.forEach(item => {
                if (visMap[item.name] !== undefined) {
                    this.applyItemVisibility(item, !!visMap[item.name]);
                }
                if (catMap[item.name] !== undefined) {
                    item.category = catMap[item.name];
                }
            });
        } catch (_) {}
    }

    // Cambiar la categoría manualmente (Calibración Manual)
    setItemCategory(itemName: string, category: ClothingCategory): void {
        const item = this.items.find(i => i.name === itemName);
        if (item) {
            item.category = category;
            this.saveSettings(this.currentModelId);
            this.notify();
        }
    }

    // --- STRIP LOGIC ---
    stripLayer(): string {
        this.currentStripLevel++;
        if (this.currentStripLevel > 3) this.currentStripLevel = 3;

        switch (this.currentStripLevel) {
            case 1:
                this.toggleCategory('accessory', false);
                return "Quitando accesorios...";
            case 2:
                this.toggleCategory('outfit', false);
                this.toggleCategory('shoes', false);
                return "Quitando ropa exterior...";
            case 3:
                this.presetNaked();
                return "Quitando ropa interior...";
            default:
                return "Ya no tengo nada más que quitarme.";
        }
    }

    restoreLayer(): string {
        this.currentStripLevel--;
        if (this.currentStripLevel < 0) this.currentStripLevel = 0;

        switch (this.currentStripLevel) {
            case 2:
                this.toggleCategory('underwear', true);
                return "Poniéndome ropa interior...";
            case 1:
                this.toggleCategory('outfit', true);
                this.toggleCategory('shoes', true);
                return "Vistiéndome...";
            case 0:
                this.presetFullClothed();
                return "Poniéndome accesorios...";
            default:
                this.presetFullClothed();
                return "Completamente vestida.";
        }
    }

    getStripLevel(): number {
        return this.currentStripLevel;
    }

    stripFull(): string {
        this.presetNaked();
        return "Me he quitado todo.";
    }

    dressFull(): string {
        this.presetFullClothed();
        return "Me he vestido completamente.";
    }

    applyPreset(preset: 'dressed' | 'underwear' | 'accessories' | 'nude'): void {
        switch (preset) {
            case 'dressed':
                this.presetFullClothed();
                break;
            case 'underwear':
                this.presetUnderwear();
                break;
            case 'accessories':
                this.presetAccessoriesOnly();
                break;
            case 'nude':
                this.presetNaked();
                break;
        }
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
