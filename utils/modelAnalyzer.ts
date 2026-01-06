/**
 * Model Analyzer - Analiza modelos GLB/GLTF para detectar capacidades
 * Detecta: huesos, morph targets, meshes, animaciones, físicas
 */

export interface ModelCapabilities {
    // Información básica
    name: string;
    url: string;

    // Meshes encontrados (para toggle de ropa)
    meshes: {
        name: string;
        visible: boolean;
        vertexCount: number;
        hasMorphTargets: boolean;
    }[];

    // Huesos del esqueleto
    bones: {
        name: string;
        isPhysicsBone: boolean; // Jiggle bones
    }[];

    // Morph targets para expresiones
    morphTargets: string[];

    // Animaciones incluidas
    animations: {
        name: string;
        duration: number;
    }[];

    // Capacidades detectadas
    capabilities: {
        hasExpressions: boolean;  // Tiene morph targets faciales
        hasJiggleBones: boolean;  // Tiene huesos de físicas
        hasClothingLayers: boolean; // Tiene meshes de ropa separados
        hasTongue: boolean;       // Tiene hueso/morph de lengua
        hasEyeTracking: boolean;  // Tiene huesos de ojos
        hasAnimations: boolean;   // Tiene animaciones
    };
}

// Patrones para detectar huesos de físicas
const PHYSICS_BONE_PATTERNS = [
    'jiggle', 'physics', 'phys', 'dynamic',
    'breast', 'bust', 'chest_j', 'boob',
    'butt', 'hip_j', 'ass',
    'hair_', 'ponytail', 'bangs',
    'skirt', 'cloth', 'ribbon',
    'tail', 'cape', 'coat'
];

// Patrones para detectar meshes de ropa
const CLOTHING_PATTERNS = [
    'clothes', 'clothing', 'outfit', 'dress',
    'shirt', 'pants', 'skirt', 'jacket',
    'underwear', 'bra', 'panties', 'lingerie',
    'shoes', 'boots', 'socks', 'stockings',
    'hat', 'glasses', 'accessory', 'acc',
    'sexy', 'normal', 'casual', 'formal'
];

// Patrones para expresiones faciales
const EXPRESSION_PATTERNS = [
    'eyeblink', 'eye_blink', 'blink',
    'mouthopen', 'mouth_open', 'jawopen',
    'smile', 'sad', 'angry', 'surprised',
    'aa', 'ee', 'ii', 'oo', 'uu', // Visemas
    'viseme', 'phoneme'
];

export function isPhysicsBone(boneName: string): boolean {
    const lower = boneName.toLowerCase();
    return PHYSICS_BONE_PATTERNS.some(pattern => lower.includes(pattern));
}

export function isClothingMesh(meshName: string): boolean {
    const lower = meshName.toLowerCase();
    return CLOTHING_PATTERNS.some(pattern => lower.includes(pattern));
}

export function isExpressionMorph(morphName: string): boolean {
    const lower = morphName.toLowerCase();
    return EXPRESSION_PATTERNS.some(pattern => lower.includes(pattern));
}

// Función para analizar un modelo cargado en Three.js
export function analyzeLoadedModel(gltf: any, url: string): ModelCapabilities {
    const meshes: ModelCapabilities['meshes'] = [];
    const bones: ModelCapabilities['bones'] = [];
    const morphTargets: string[] = [];
    const animations: ModelCapabilities['animations'] = [];

    let hasTongue = false;
    let hasEyeTracking = false;

    // Analizar la escena
    gltf.scene.traverse((child: any) => {
        // Meshes
        if (child.isMesh) {
            const hasMorphs = child.morphTargetDictionary && Object.keys(child.morphTargetDictionary).length > 0;

            meshes.push({
                name: child.name,
                visible: child.visible,
                vertexCount: child.geometry?.attributes?.position?.count || 0,
                hasMorphTargets: hasMorphs
            });

            // Extraer morph targets
            if (child.morphTargetDictionary) {
                Object.keys(child.morphTargetDictionary).forEach(name => {
                    if (!morphTargets.includes(name)) {
                        morphTargets.push(name);
                    }
                });
            }
        }

        // Huesos
        if (child.isBone) {
            const isPhysics = isPhysicsBone(child.name);
            bones.push({
                name: child.name,
                isPhysicsBone: isPhysics
            });

            // Detectar capacidades especiales
            const lower = child.name.toLowerCase();
            if (lower.includes('tongue')) hasTongue = true;
            if (lower.includes('eye') && (lower.includes('look') || lower.includes('target'))) {
                hasEyeTracking = true;
            }
        }
    });

    // Animaciones
    if (gltf.animations && gltf.animations.length > 0) {
        gltf.animations.forEach((anim: any) => {
            animations.push({
                name: anim.name,
                duration: anim.duration
            });
        });
    }

    // Determinar capacidades
    const capabilities = {
        hasExpressions: morphTargets.some(m => isExpressionMorph(m)),
        hasJiggleBones: bones.some(b => b.isPhysicsBone),
        hasClothingLayers: meshes.filter(m => isClothingMesh(m.name)).length >= 2,
        hasTongue: hasTongue || morphTargets.some(m => m.toLowerCase().includes('tongue')),
        hasEyeTracking: hasEyeTracking,
        hasAnimations: animations.length > 0
    };

    // Extraer nombre del archivo
    const name = url.split('/').pop()?.replace('.glb', '').replace('.gltf', '') || 'Unknown';

    console.log('📊 Modelo analizado:', {
        name,
        meshes: meshes.length,
        bones: bones.length,
        morphTargets: morphTargets.length,
        animations: animations.length,
        capabilities
    });

    return {
        name,
        url,
        meshes,
        bones,
        morphTargets,
        animations,
        capabilities
    };
}

// Función para escanear modelos locales en la carpeta public/models
export async function scanLocalModels(): Promise<{ name: string; url: string; }[]> {
    // En producción, esto vendría de un endpoint o file system
    // Por ahora, retornamos los modelos conocidos + cualquiera que el usuario haya agregado
    const defaultModels = [
        { name: 'Nova Original', url: '/models/nova-avatar.glb' },
    ];

    // Intentar detectar modelos adicionales (esto funcionaría mejor con un backend)
    // Por ahora el usuario puede agregar manualmente o usar el input de URL

    return defaultModels;
}

// Función para formatear el reporte de capacidades
export function formatCapabilitiesReport(caps: ModelCapabilities): string {
    const lines = [
        `📦 MODELO: ${caps.name}`,
        ``,
        `📐 MESHES (${caps.meshes.length}):`,
        ...caps.meshes.map(m => `  ${m.visible ? '👁' : '🚫'} ${m.name} (${m.vertexCount} verts${m.hasMorphTargets ? ', morphs' : ''})`),
        ``,
        `🦴 HUESOS (${caps.bones.length}):`,
        ...caps.bones.filter(b => b.isPhysicsBone).map(b => `  🎯 ${b.name} (PHYSICS)`),
        `  ... y ${caps.bones.filter(b => !b.isPhysicsBone).length} huesos normales`,
        ``,
        `😀 MORPH TARGETS (${caps.morphTargets.length}):`,
        ...caps.morphTargets.slice(0, 10).map(m => `  • ${m}`),
        caps.morphTargets.length > 10 ? `  ... y ${caps.morphTargets.length - 10} más` : '',
        ``,
        `🎬 ANIMACIONES (${caps.animations.length}):`,
        ...caps.animations.map(a => `  ▶ ${a.name} (${a.duration.toFixed(1)}s)`),
        ``,
        `✨ CAPACIDADES:`,
        `  ${caps.capabilities.hasExpressions ? '✅' : '❌'} Expresiones faciales`,
        `  ${caps.capabilities.hasJiggleBones ? '✅' : '❌'} Físicas (jiggle bones)`,
        `  ${caps.capabilities.hasClothingLayers ? '✅' : '❌'} Capas de ropa`,
        `  ${caps.capabilities.hasTongue ? '✅' : '❌'} Control de lengua`,
        `  ${caps.capabilities.hasEyeTracking ? '✅' : '❌'} Eye tracking`,
        `  ${caps.capabilities.hasAnimations ? '✅' : '❌'} Animaciones`
    ];

    return lines.filter(l => l !== '').join('\n');
}
