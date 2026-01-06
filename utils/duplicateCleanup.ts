import { PersonEntry } from '../types';
import { compareFaces } from './faceRecognition';

/**
 * Resultado de la limpieza de duplicados
 */
export interface CleanupResult {
    duplicatesFound: number;
    entriesMerged: number;
    finalEntries: PersonEntry[];
    report: string[];
}

/**
 * Fusiona dos entradas de personas, combinando su información
 * @param primary - Entrada principal (se mantiene)
 * @param duplicate - Entrada duplicada (se fusiona)
 * @returns Entrada fusionada
 */
function mergePerson(primary: PersonEntry, duplicate: PersonEntry): PersonEntry {
    return {
        ...primary,
        // Mantener el nombre más descriptivo (más largo generalmente es mejor)
        name: primary.name.length >= duplicate.name.length ? primary.name : duplicate.name,

        // Combinar descripciones si son diferentes
        visualDescription: primary.visualDescription.length > duplicate.visualDescription.length
            ? primary.visualDescription
            : duplicate.visualDescription,

        voiceDescription: primary.voiceDescription || duplicate.voiceDescription,

        // Mantener la foto más reciente (mayor timestamp)
        photoData: (primary.lastSeen || 0) > (duplicate.lastSeen || 0)
            ? primary.photoData
            : duplicate.photoData,

        // Mantener el descriptor facial más confiable
        faceDescriptor: (primary.lastRecognitionConfidence || 0) > (duplicate.lastRecognitionConfidence || 0)
            ? primary.faceDescriptor
            : duplicate.faceDescriptor,

        // Actualizar timestamps
        detectedAt: Math.min(primary.detectedAt || Date.now(), duplicate.detectedAt || Date.now()),
        lastSeen: Math.max(primary.lastSeen || 0, duplicate.lastSeen || 0),

        // Mantener la mayor confianza
        lastRecognitionConfidence: Math.max(
            primary.lastRecognitionConfidence || 0,
            duplicate.lastRecognitionConfidence || 0
        ),

        // No es desconocido si alguno tiene nombre identificado
        isUnknown: primary.isUnknown && duplicate.isUnknown,
    };
}

/**
 * Encuentra y fusiona personas duplicadas basándose en embeddings faciales
 * @param people - Array de personas a analizar
 * @param threshold - Umbral de similitud (default: 0.7 para duplicados obvios)
 * @returns Resultado de la limpieza con estadísticas
 */
export function cleanupDuplicates(
    people: PersonEntry[],
    threshold: number = 0.6
): CleanupResult {
    const report: string[] = [];
    const merged: Set<string> = new Set();
    const finalEntries: PersonEntry[] = [];

    // 1. Eliminar entradas corruptas (Desconocidos sin descriptor facial)
    // Estas entradas nunca podrán ser reconocidas de nuevo, por lo que son basura.
    const validPeople = people.filter(p => {
        if (p.isUnknown && !p.faceDescriptor) {
            report.push(`🗑️ Eliminando registro corrupto: "${p.name}" (sin datos biométricos)`);
            return false;
        }
        return true;
    });

    // Agrupar por similitud facial
    for (let i = 0; i < validPeople.length; i++) {
        if (merged.has(validPeople[i].id)) continue; // Ya fusionado

        const current = validPeople[i];
        const duplicates: PersonEntry[] = [];

        // Buscar duplicados de esta persona
        for (let j = i + 1; j < validPeople.length; j++) {
            if (merged.has(validPeople[j].id)) continue;

            const other = validPeople[j];

            // Comparación por descriptor facial
            if (current.faceDescriptor && other.faceDescriptor) {
                const distance = compareFaces(current.faceDescriptor, other.faceDescriptor);

                if (distance <= threshold) {
                    duplicates.push(other);
                    merged.add(other.id);
                    report.push(
                        `✅ Fusionando "${other.name}" → "${current.name}" (distancia: ${distance.toFixed(3)})`
                    );
                }
            }
            // Fallback: Comparación por nombre exacto (solo si no hay descriptores)
            else if (!current.faceDescriptor && !other.faceDescriptor) {
                if (current.name.toLowerCase().trim() === other.name.toLowerCase().trim()) {
                    duplicates.push(other);
                    merged.add(other.id);
                    report.push(
                        `📝 Fusionando "${other.name}" → "${current.name}" (nombre idéntico)`
                    );
                }
            }
        }

        // Fusionar duplicados encontrados
        let mergedPerson = current;
        for (const dup of duplicates) {
            mergedPerson = mergePerson(mergedPerson, dup);
        }

        finalEntries.push(mergedPerson);
        merged.add(current.id);
    }

    const duplicatesFound = merged.size - finalEntries.length;

    report.unshift(`📊 Análisis completado:`);
    report.unshift(`   - Entradas originales: ${people.length}`);
    report.unshift(`   - Duplicados detectados: ${duplicatesFound}`);
    report.unshift(`   - Entradas finales: ${finalEntries.length}`);

    return {
        duplicatesFound,
        entriesMerged: duplicatesFound,
        finalEntries,
        report,
    };
}

/**
 * Identifica personas sin descriptor facial (necesitan re-escaneo)
 */
export function findPeopleWithoutDescriptor(people: PersonEntry[]): PersonEntry[] {
    return people.filter(p => !p.faceDescriptor);
}

/**
 * Estadísticas de la base de datos de personas
 */
export function getPersonStats(people: PersonEntry[]) {
    const withDescriptor = people.filter(p => p.faceDescriptor).length;
    const withPhoto = people.filter(p => p.photoData).length;
    const unknown = people.filter(p => p.isUnknown).length;

    return {
        total: people.length,
        withFaceDescriptor: withDescriptor,
        withPhoto,
        unknown,
        identified: people.length - unknown,
        needsRescan: people.length - withDescriptor,
    };
}
