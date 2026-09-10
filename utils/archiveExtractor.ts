/**
 * archiveExtractor.ts
 * Extractor universal de archivos comprimidos para modelos PMX/MMD.
 * Soporta: .zip, .rar, .7z, .tar, .tar.gz, .tar.bz2
 */

import JSZip from 'jszip';

export type ArchiveModelType = 'pmx' | 'pmd' | 'fbx' | 'gltf' | 'glb';

export interface ArchiveResult {
  fileMap: Map<string, Blob>;
  modelPath: string;
  modelType: ArchiveModelType;
  secondaryModelPath?: string;
  pmxPath: string; // Para compatibilidad
}

function detectMagicBytes(bytes: Uint8Array): 'zip' | 'rar' | '7z' | 'tar' | 'gz' | 'bz2' | 'unknown' {
  if (bytes.length < 6) return 'unknown';
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x03 && bytes[3] === 0x04) return 'zip';
  if (bytes[0] === 0x50 && bytes[1] === 0x4B && bytes[2] === 0x05 && bytes[3] === 0x06) return 'zip';
  if (bytes[0] === 0x52 && bytes[1] === 0x61 && bytes[2] === 0x72 && bytes[3] === 0x21 && bytes[4] === 0x1A && bytes[5] === 0x07) return 'rar';
  if (bytes[0] === 0x37 && bytes[1] === 0x7A && bytes[2] === 0xBC && bytes[3] === 0xAF) return '7z';
  if (bytes[0] === 0x1F && bytes[1] === 0x8B) return 'gz';
  if (bytes[0] === 0x42 && bytes[1] === 0x5A && bytes[2] === 0x68) return 'bz2';
  if (bytes.length > 262) {
    const ustar = String.fromCharCode(bytes[257], bytes[258], bytes[259], bytes[260], bytes[261]);
    if (ustar === 'ustar') return 'tar';
  }
  return 'unknown';
}

/**
 * Busca el modelo 3D en el mapa (PMX, PMD, FBX, GLTF, GLB),
 * prefiriendo paths completos sobre basenames.
 */
async function findModelInMap(fileMap: Map<string, Blob>): Promise<{ modelPath: string; modelType: ArchiveModelType; secondaryModelPath?: string }> {
  // 1. Prioridad: PMX / PMD (MMD nativo)
  let bestPmx = '';
  for (const key of fileMap.keys()) {
    const l = key.toLowerCase();
    if (!l.endsWith('.pmx') && !l.endsWith('.pmd')) continue;

    if (!bestPmx) {
      bestPmx = key;
    } else {
      const currentHasDir = key.includes('/');
      const bestHasDir = bestPmx.includes('/');
      if (currentHasDir && !bestHasDir) {
        bestPmx = key;
      } else if (currentHasDir === bestHasDir && key.length > bestPmx.length) {
        bestPmx = key;
      }
    }
  }

  if (bestPmx) {
    const isPmd = bestPmx.toLowerCase().endsWith('.pmd');
    return { modelPath: bestPmx, modelType: isPmd ? 'pmd' : 'pmx' };
  }

  // Segundo pase: firma mágica PMX/PMD
  for (const [key, blob] of fileMap.entries()) {
    const l = key.toLowerCase();
    if (l.endsWith('.png') || l.endsWith('.jpg') || l.endsWith('.jpeg') || l.endsWith('.bmp') || l.endsWith('.tga') || l.endsWith('.json') || l.endsWith('.txt')) continue;
    try {
      const buf = await blob.slice(0, 8).arrayBuffer();
      const b = new Uint8Array(buf);
      if (b[0] === 0x50 && b[1] === 0x4D && b[2] === 0x58 && b[3] === 0x20) {
        console.log(`🌸 [ArchiveExtractor] Encontrado PMX por firma mágica: "${key}"`);
        return { modelPath: key, modelType: 'pmx' };
      }
      if (b[0] === 0x50 && b[1] === 0x6D && b[2] === 0x64) {
        console.log(`🌸 [ArchiveExtractor] Encontrado PMD por firma mágica: "${key}"`);
        return { modelPath: key, modelType: 'pmd' };
      }
    } catch { }
  }

  // 2. Prioridad: FBX (.fbx)
  const fbxEntries = [...fileMap.entries()].filter(([k]) => k.toLowerCase().endsWith('.fbx'));
  if (fbxEntries.length > 0) {
    // Preferir paths con directorios (para evitar duplicados por basename)
    const withDirs = fbxEntries.filter(([k]) => k.includes('/'));
    const candidates = withDirs.length > 0 ? withDirs : fbxEntries;

    // Ordenar: separar accesorios/props (_smm, _weapon, _acc) del cuerpo principal, y preferir mayor tamaño de archivo
    candidates.sort((a, b) => {
      const aIsSub = /(_smm|_weapon|_prop|_acc|_part)/i.test(a[0]);
      const bIsSub = /(_smm|_weapon|_prop|_acc|_part)/i.test(b[0]);
      if (aIsSub !== bIsSub) return aIsSub ? 1 : -1;
      return b[1].size - a[1].size;
    });

    const mainFbx = candidates[0][0];
    const secondaryFbx = candidates.find(([k]) => k !== mainFbx && /(_smm|_weapon|_acc)/i.test(k))?.[0];

    console.log(`📦 [ArchiveExtractor] Encontrado modelo FBX principal: "${mainFbx}"` + (secondaryFbx ? `, secundario: "${secondaryFbx}"` : ''));
    return {
      modelPath: mainFbx,
      modelType: 'fbx',
      secondaryModelPath: secondaryFbx
    };
  }

  // 3. Prioridad: GLTF / GLB (.glb, .gltf)
  const gltfEntries = [...fileMap.entries()].filter(([k]) => {
    const l = k.toLowerCase();
    return l.endsWith('.glb') || l.endsWith('.gltf');
  });
  if (gltfEntries.length > 0) {
    const withDirs = gltfEntries.filter(([k]) => k.includes('/'));
    const candidates = withDirs.length > 0 ? withDirs : gltfEntries;
    candidates.sort((a, b) => b[1].size - a[1].size);
    const mainGltf = candidates[0][0];
    console.log(`📦 [ArchiveExtractor] Encontrado modelo GLTF/GLB: "${mainGltf}"`);
    return {
      modelPath: mainGltf,
      modelType: mainGltf.toLowerCase().endsWith('.glb') ? 'glb' : 'gltf'
    };
  }

  return { modelPath: '', modelType: 'pmx' };
}

async function extractZip(buffer: ArrayBuffer): Promise<Map<string, Blob>> {
  const fileMap = new Map<string, Blob>();
  const decoders = ['utf-8', 'gbk', 'shift_jis', 'windows-1252'];
  let zip: JSZip | null = null;
  for (const enc of decoders) {
    try {
      zip = await JSZip.loadAsync(buffer, {
        decodeFileName: (bytes: Uint8Array) => {
          try { return new TextDecoder(enc, { fatal: true }).decode(bytes); } catch { return new TextDecoder().decode(bytes); }
        }
      });
      break;
    } catch { }
  }
  if (!zip) zip = await JSZip.loadAsync(buffer);
  for (const [relativePath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const blob = await entry.async('blob');
    const clean = relativePath.replace(/\\/g, '/');
    const base = clean.split('/').pop() || clean;
    fileMap.set(clean, blob);
    fileMap.set(clean.toLowerCase(), blob);
    fileMap.set(base, blob);
    fileMap.set(base.toLowerCase(), blob);
  }
  return fileMap;
}

let libarchiveModule: any = null;

async function getLibarchive(): Promise<any> {
  if (libarchiveModule) return libarchiveModule;
  const mod = await import('libarchive.js/dist/libarchive.js');
  const Archive = mod.Archive || mod.default;
  Archive.init({ workerUrl: '/worker-bundle.js' });
  libarchiveModule = Archive;
  return Archive;
}

/**
 * Aplana el objeto anidado de libarchive.js extractFiles() a un mapa plano.
 * Guarda AMBAS la ruta completa Y el nombre base para maxima compatibilidad
 * con el URLModifier de MMDLoader.
 */
function flattenLibarchiveResult(obj: any, currentPath: string, fileMap: Map<string, Blob>): void {
  if (!obj) return;
  // Soporte robusto: File/Blob nativo o duck-typing (por si proviene de worker con prototype distinto)
  const isBlobOrFile = obj instanceof File || obj instanceof Blob || (typeof obj === 'object' && typeof obj.slice === 'function' && typeof obj.size === 'number');
  if (isBlobOrFile) {
    const clean = currentPath.replace(/\\/g, '/').replace(/^\//, '');
    const base = clean.split('/').pop() || clean;
    // Guardar ruta completa (para URLModifier con pmxDir correcto)
    fileMap.set(clean, obj as Blob);
    fileMap.set(clean.toLowerCase(), obj as Blob);
    // Guardar nombre base (fallback cuando no hay directorio)
    if (base !== clean) {
      fileMap.set(base, obj as Blob);
      fileMap.set(base.toLowerCase(), obj as Blob);
    }
    return;
  }
  if (typeof obj === 'object') {
    for (const [key, value] of Object.entries(obj)) {
      const childPath = currentPath ? (currentPath + '/' + key) : key;
      flattenLibarchiveResult(value, childPath, fileMap);
    }
  }
}

async function extractWithLibarchive(buffer: ArrayBuffer, fileName: string): Promise<Map<string, Blob>> {
  const fileMap = new Map<string, Blob>();
  const Archive = await getLibarchive();

  const file = new File([buffer], fileName);
  const archive = await Archive.open(file);

  // extractFiles() devuelve arbol anidado { "dir/": { "file.pmx": File } }
  const filesObj = await archive.extractFiles();
  console.log('[ArchiveExtractor] Estructura raíz extraída de libarchive:', Object.keys(filesObj || {}));

  // Aplanar el arbol de directorios a un mapa plano
  flattenLibarchiveResult(filesObj, '', fileMap);

  // Cerrar el worker para liberar memoria
  try { await archive.close?.(); } catch { }

  // Log: mostrar TODOS los archivos de textura para debuggear nombres alternativos
  const imgExts = ['.png', '.jpg', '.jpeg', '.bmp', '.tga', '.dds', '.tif', '.tiff', '.gif', '.webp'];
  const textureFiles = [...fileMap.keys()].filter(k => {
    const l = k.toLowerCase();
    return imgExts.some(e => l.endsWith(e)) && k.includes('/'); // solo paths completos
  });
  if (textureFiles.length > 0) {
    console.log('[ArchiveExtractor] Texturas encontradas en el archivo (' + textureFiles.length + '):', textureFiles.slice(0, 10).join(', ') + (textureFiles.length > 10 ? '...' : ''));
  }

  // Log: mostrar todos los archivos que NO son texturas
  const nonTextureFiles = [...new Set([...fileMap.keys()].filter(k => {
    const l = k.toLowerCase();
    return !imgExts.some(e => l.endsWith(e)) && k.includes('/');
  }))];
  console.log('[ArchiveExtractor] Archivos que NO son textura (' + nonTextureFiles.length + '):', nonTextureFiles.join(', '));

  return fileMap;
}

export const SUPPORTED_ARCHIVE_EXTENSIONS = ['.zip', '.rar', '.7z', '.tar', '.tar.gz', '.tar.bz2', '.tgz', '.tbz2'];

export function isSupportedArchive(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return SUPPORTED_ARCHIVE_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export async function extractArchive(buffer: ArrayBuffer, fileName: string): Promise<ArchiveResult> {
  const bytes = new Uint8Array(buffer.slice(0, 8));
  const magic = detectMagicBytes(bytes);
  const lowerName = fileName.toLowerCase();
  console.log('[ArchiveExtractor] Detectado: "' + fileName + '" tipo: ' + magic);

  let fileMap: Map<string, Blob>;

  if (magic === 'zip' || lowerName.endsWith('.zip')) {
    fileMap = await extractZip(buffer);
  } else if (
    magic === 'rar' || lowerName.endsWith('.rar') ||
    magic === '7z' || lowerName.endsWith('.7z') ||
    magic === 'tar' || lowerName.endsWith('.tar') ||
    magic === 'gz' || lowerName.endsWith('.gz') || lowerName.endsWith('.tgz') ||
    magic === 'bz2' || lowerName.endsWith('.bz2') || lowerName.endsWith('.tbz2')
  ) {
    fileMap = await extractWithLibarchive(buffer, fileName);
  } else {
    try {
      fileMap = await extractZip(buffer);
      console.log('[ArchiveExtractor] Fallback ZIP exitoso para "' + fileName + '"');
    } catch {
      fileMap = await extractWithLibarchive(buffer, fileName);
    }
  }

  // Descomprimir automáticamente archivos comprimidos anidados (ej: tex/替换.rar)
  // Muchos paquetes de MMD incluyen ropa/skins/texturas alternativas en archivos .rar/.zip internos
  const nestedArchives = [...fileMap.entries()].filter(([k]) => {
    const l = k.toLowerCase();
    return (l.endsWith('.rar') || l.endsWith('.zip') || l.endsWith('.7z')) && k.includes('/') && k === k.toLowerCase();
  });

  for (const [nestedPath, nestedBlob] of nestedArchives) {
    console.log(`📦 [ArchiveExtractor] Descomprimiendo paquete anidado: "${nestedPath}" (${(nestedBlob.size / 1024 / 1024).toFixed(2)} MB)...`);
    try {
      const nestedBuf = await nestedBlob.arrayBuffer();
      const isZip = nestedPath.toLowerCase().endsWith('.zip');
      const subMap = isZip ? await extractZip(nestedBuf) : await extractWithLibarchive(nestedBuf, nestedPath);

      const parentDir = nestedPath.includes('/') ? nestedPath.substring(0, nestedPath.lastIndexOf('/') + 1) : '';
      const folderNoExt = nestedPath.substring(0, nestedPath.lastIndexOf('.'));

      for (const [sKey, sBlob] of subMap.entries()) {
        fileMap.set(folderNoExt + '/' + sKey, sBlob);
        fileMap.set((folderNoExt + '/' + sKey).toLowerCase(), sBlob);
        fileMap.set(parentDir + sKey, sBlob);
        fileMap.set((parentDir + sKey).toLowerCase(), sBlob);
        const sBase = sKey.split('/').pop() || sKey;
        fileMap.set(sBase, sBlob);
        fileMap.set(sBase.toLowerCase(), sBlob);
      }
      console.log(`✅ [ArchiveExtractor] Se extrajeron ${subMap.size / 2} archivos de "${nestedPath}"`);
    } catch (nErr) {
      console.warn(`⚠️ [ArchiveExtractor] No se pudo extraer paquete anidado "${nestedPath}":`, nErr);
    }
  }

  let { modelPath, modelType, secondaryModelPath } = await findModelInMap(fileMap);

  if (!modelPath) {
    const imgExts = ['.png', '.jpg', '.jpeg', '.bmp', '.tga', '.dds', '.tif', '.tiff', '.gif', '.webp'];
    const uniqueFiles = [...new Set([...fileMap.keys()].filter(k => k.includes('/') || !k.includes('/')))];
    const nonImg = uniqueFiles.filter(k => {
      const l = k.toLowerCase();
      return !imgExts.some(e => l.endsWith(e)) && !l.endsWith('.json');
    });

    // Detectar otros formatos 3D no soportados presentes (ej: blend, pskx, obj)
    const formats3D = uniqueFiles.filter(k => {
      const l = k.toLowerCase();
      return l.endsWith('.obj') || l.endsWith('.blend') || l.endsWith('.pskx') || l.endsWith('.smd') || l.endsWith('.x') || l.endsWith('.uemodel');
    });

    let errMsg = `El archivo "${fileName}" no contiene ningún modelo 3D compatible (.pmx, .pmd, .fbx, .glb, .gltf).`;
    if (formats3D.length > 0) {
      errMsg += ` Se detectaron archivos 3D no soportados directamente: [${formats3D.join(', ')}].`;
    }
    if (nonImg.length > 0) {
      errMsg += ` Archivos encontrados: [${nonImg.slice(0, 15).join(', ')}]`;
    } else {
      errMsg += ` Solo se encontraron texturas y archivos JSON.`;
    }
    console.error('[ArchiveExtractor] ' + errMsg);
    throw new Error(errMsg);
  }

  console.log(`[ArchiveExtractor] Modelo ${modelType.toUpperCase()} encontrado: "${modelPath}" (${fileMap.size / 2} archivos)`);
  return { fileMap, modelPath, modelType, secondaryModelPath, pmxPath: modelPath };
}
