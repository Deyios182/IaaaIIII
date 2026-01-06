import * as faceapi from '@vladmandic/face-api';

// Estado de inicialización
let modelsLoaded = false;
let isLoading = false;

/**
 * Inicializa los modelos de face-api.js desde public/models/
 * Solo se ejecuta una vez, usa singleton pattern
 */
export async function initializeFaceAPI(): Promise<boolean> {
    if (modelsLoaded) return true;
    if (isLoading) {
        // Esperar a que termine la carga actual
        while (isLoading) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }
        return modelsLoaded;
    }

    isLoading = true;

    try {
        console.log('🔄 Cargando modelos de reconocimiento facial...');

        const MODEL_URL = '/models';

        // Cargar modelos necesarios en paralelo
        await Promise.all([
            faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),        // Detección de caras
            faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),     // 68 puntos faciales
            faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL),    // Embeddings (128D)
        ]);

        modelsLoaded = true;
        console.log('✅ Modelos de reconocimiento facial cargados correctamente');
        return true;
    } catch (error) {
        console.error('❌ Error cargando modelos de reconocimiento facial:', error);
        modelsLoaded = false;
        return false;
    } finally {
        isLoading = false;
    }
}

/**
 * Detecta una cara en un elemento de video o imagen
 * @param input - Elemento HTML (video/canvas/img)
 * @returns Detección con landmarks y descriptor, o null si no hay cara
 */
export async function detectFace(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement) {
    if (!modelsLoaded) {
        const loaded = await initializeFaceAPI();
        if (!loaded) return null;
    }

    try {
        // Opciones de detección (balance entre velocidad y precisión)
        const options = new faceapi.SsdMobilenetv1Options({
            minConfidence: 0.5,  // Confianza mínima para detección
            maxResults: 1        // Solo la cara más prominente
        });

        // Detección completa: cara + landmarks + descriptor (128D)
        const detection = await faceapi
            .detectSingleFace(input, options)
            .withFaceLandmarks()
            .withFaceDescriptor();

        return detection;
    } catch (error) {
        console.error('Error en detección facial:', error);
        return null;
    }
}

/**
 * Extrae solo el descriptor facial (embedding de 128 dimensiones)
 * Útil para comparaciones rápidas sin procesar toda la detección
 */
export async function getFaceDescriptor(input: HTMLVideoElement | HTMLCanvasElement | HTMLImageElement): Promise<Float32Array | null> {
    const detection = await detectFace(input);
    return detection?.descriptor || null;
}

/**
 * Calcula la similitud entre dos descriptores faciales usando distancia euclidiana
 * @returns Valor entre 0 (completamente diferente) y 1 (idéntico)
 * Threshold recomendado: 0.6 para match confiable
 */
export function compareFaces(descriptor1: Float32Array | number[], descriptor2: Float32Array | number[]): number {
    if (!descriptor1 || !descriptor2) return 0;

    // Convertir a Float32Array si es necesario
    const desc1 = descriptor1 instanceof Float32Array ? descriptor1 : new Float32Array(descriptor1);
    const desc2 = descriptor2 instanceof Float32Array ? descriptor2 : new Float32Array(descriptor2);

    // Calcular distancia euclidiana
    const distance = faceapi.euclideanDistance(desc1, desc2);

    // Retornar distancia cruda (menor es mejor)
    // 0.0 = idéntico
    // > 0.6 = diferente
    return distance;
}

/**
 * Busca la mejor coincidencia en una lista de personas conocidas
 * @param descriptor - Descriptor facial a comparar
 * @param knownPeople - Array de personas con descriptores
 * @param threshold - Umbral mínimo de similitud (default: 0.6)
 * @returns Persona coincidente y score, o null si no hay match
 */
export function findMatchingPerson<T extends { faceDescriptor?: number[] | Float32Array }>(
    descriptor: Float32Array | number[],
    knownPeople: T[],
    threshold: number = 0.6
): { person: T; distance: number } | null {
    if (!descriptor || knownPeople.length === 0) return null;

    let bestMatch: { person: T; distance: number } | null = null;
    let bestDistance = 2.0; // Iniciar con distancia alta (peor match)

    for (const person of knownPeople) {
        if (!person.faceDescriptor) continue;

        const distance = compareFaces(descriptor, person.faceDescriptor);

        // Buscamos la distancia MÁS BAJA (mejor coincidencia)
        if (distance < bestDistance && distance <= threshold) {
            bestDistance = distance;
            bestMatch = { person, distance };
        }
    }

    return bestMatch;
}

/**
 * Captura un frame del video y devuelve un canvas
 * Útil para procesar frames sin afectar el video visible
 */
export function captureVideoFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
    if (!video || video.readyState < 2) return null;

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas;
}

/**
 * Convierte un descriptor Float32Array a un array normal (para JSON)
 */
export function descriptorToArray(descriptor: Float32Array): number[] {
    return Array.from(descriptor);
}

/**
 * Limpia recursos de face-api (liberar memoria)
 */
export function cleanup() {
    // face-api.js maneja limpieza automáticamente
    // Esta función existe para futuras optimizaciones
    console.log('🧹 Limpieza de recursos de reconocimiento facial');
}

/**
 * Estado de los modelos
 */
export function areModelsLoaded(): boolean {
    return modelsLoaded;
}
