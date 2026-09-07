/**
 * PMX / MMD Avatar Loader
 * Carga modelos .pmx y paquetes .zip (con .pmx y texturas)
 * para renderizar avatares nativos de MikuMikuDance en Three.js.
 */

import * as THREE from 'three';
import { MMDLoader, CCDIKSolver } from 'three-stdlib';
import JSZip from 'jszip';

export interface PMXModelResult {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  isPMX: true;
}

/**
 * Carga un modelo PMX desde una URL o un archivo Blob/File
 * Si es un ZIP, descomprime las texturas y crea Object URLs en memoria para que MMDLoader las resuelva.
 */
export async function loadPMXModel(urlOrFile: string | File): Promise<PMXModelResult> {
  let fileBuffer: ArrayBuffer;
  let fileName = 'model.pmx';
  const blobUrls: string[] = [];

  const manager = new THREE.LoadingManager();

  if (typeof urlOrFile === 'string') {
    const res = await fetch(urlOrFile);
    fileBuffer = await res.arrayBuffer();

    // Limpiar hash o query parameters para obtener el nombre real si vino con #archivo.ext
    const decodedUrl = decodeURIComponent(urlOrFile);
    const hashPart = decodedUrl.split('#')[1];
    if (hashPart) {
      fileName = hashPart.split('?')[0];
    } else {
      fileName = decodedUrl.split('/').pop()?.split('?')[0] || 'model.pmx';
    }
  } else {
    fileBuffer = await urlOrFile.arrayBuffer();
    fileName = urlOrFile.name;
  }

  const isZip = fileName.toLowerCase().endsWith('.zip');

  if (isZip) {
    console.log(`📦 [PMXLoader] Descomprimiendo paquete ZIP de modelo PMX: ${fileName}`);

    // Intentamos cargar el ZIP soportando codificaciones asiáticas comunes (GBK/GB2312, Shift-JIS, UTF-8)
    // usando la API nativa de TextDecoder del navegador (sin depender del módulo Buffer de Node)
    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(fileBuffer, {
        decodeFileName: (bytes: Uint8Array) => {
          try {
            // Intentar UTF-8 estricto
            return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
          } catch {
            try {
              // Intentar GBK (Chino simplificado, estándar en modelos ZZZ/Genshin/Honkai)
              return new TextDecoder('gbk', { fatal: true }).decode(bytes);
            } catch {
              try {
                // Intentar Shift-JIS (Japonés, estándar en modelos MMD originales)
                return new TextDecoder('shift_jis', { fatal: true }).decode(bytes);
              } catch {
                try {
                  return new TextDecoder('windows-1252').decode(bytes);
                } catch {
                  return new TextDecoder().decode(bytes);
                }
              }
            }
          }
        }
      });
    } catch (e) {
      console.warn('⚠️ [PMXLoader] Falló carga con decodificador personalizado, reintentando por defecto:', e);
      zip = await JSZip.loadAsync(fileBuffer);
    }

    // Mapeo de archivos dentro del zip a Blob URLs
    const fileMap = new Map<string, string>();
    let pmxPath = '';

    // 1. Primer pase: buscar .pmx o .pmd
    for (const relativePath of Object.keys(zip.files)) {
      const entry = zip.files[relativePath];
      if (entry.dir) continue;

      const lower = relativePath.toLowerCase();
      if (!pmxPath && (lower.endsWith('.pmx') || lower.endsWith('.pmd') || lower.includes('.pmx') || lower.includes('.pmd'))) {
        pmxPath = relativePath;
      }
    }

    // 2. Si no encontró por extensión (por corrupción de nombre), buscar por firma mágica en los primeros bytes
    if (!pmxPath) {
      for (const relativePath of Object.keys(zip.files)) {
        const entry = zip.files[relativePath];
        if (entry.dir) continue;
        try {
          const slice = await entry.async('uint8array');
          // Firma PMX: "PMX " (0x50, 0x4D, 0x58, 0x20) o PMD: "Pmd" (0x50, 0x6D, 0x64)
          if (slice.length >= 4) {
            if (slice[0] === 0x50 && slice[1] === 0x4D && slice[2] === 0x58 && slice[3] === 0x20) {
              pmxPath = relativePath;
              console.log(`🌸 [PMXLoader] Modelo PMX identificado por firma mágica: ${relativePath}`);
              break;
            }
            if (slice[0] === 0x50 && slice[1] === 0x6D && slice[2] === 0x64) {
              pmxPath = relativePath;
              console.log(`🌸 [PMXLoader] Modelo PMD identificado por firma mágica: ${relativePath}`);
              break;
            }
          }
        } catch {
          // continuar
        }
      }
    }

    if (!pmxPath) {
      const filesFound = Object.keys(zip.files).slice(0, 10).join(', ');
      throw new Error(`El archivo ZIP no contiene ningún modelo .pmx o .pmd. Archivos encontrados: [${filesFound}...]`);
    }

    // Extraer todos los archivos a Blob URLs
    for (const relativePath of Object.keys(zip.files)) {
      const entry = zip.files[relativePath];
      if (entry.dir) continue;

      const fileData = await entry.async('blob');
      const blobUrl = URL.createObjectURL(fileData);
      blobUrls.push(blobUrl);

      // Guardar con ruta normalizada
      const cleanPath = relativePath.replace(/\\/g, '/');
      fileMap.set(cleanPath, blobUrl);
      fileMap.set(cleanPath.toLowerCase(), blobUrl);

      // Guardar también solo por nombre de archivo base para búsquedas relativas
      const baseName = cleanPath.split('/').pop() || cleanPath;
      fileMap.set(baseName, blobUrl);
      fileMap.set(baseName.toLowerCase(), blobUrl);
    }

    console.log(`🌸 [PMXLoader] Modelo PMX encontrado en ZIP: ${pmxPath}`);

    // Determinar la subcarpeta donde reside el PMX dentro del ZIP
    const pmxDir = pmxPath.includes('/') ? pmxPath.substring(0, pmxPath.lastIndexOf('/') + 1) : '';

    // Configurar URLModifier para que MMDLoader obtenga las texturas de la memoria del ZIP
    manager.setURLModifier((requestedUrl: string) => {
      if (requestedUrl.startsWith('data:')) {
        return requestedUrl;
      }

      // Limpiar URL: Extraer ruta real tras el host o blob
      let cleanReq = requestedUrl;
      if (cleanReq.startsWith('blob:')) {
        try {
          const parsed = new URL(cleanReq.replace(/^blob:/, ''));
          cleanReq = parsed.pathname.replace(/^\/+/, '');
        } catch {
          cleanReq = cleanReq.replace(/^blob:https?:\/\/[^\/]+\//, '');
        }
      }

      cleanReq = decodeURIComponent(cleanReq).replace(/\\/g, '/');
      const baseReq = cleanReq.split('/').pop() || cleanReq;
      const lowerReq = cleanReq.toLowerCase();
      const lowerBase = baseReq.toLowerCase();

      // 1. Coincidencia exacta con la ruta guardada en el ZIP
      if (fileMap.has(cleanReq)) return fileMap.get(cleanReq)!;
      if (fileMap.has(lowerReq)) return fileMap.get(lowerReq)!;

      // 2. Coincidencia relativa a la carpeta del archivo PMX dentro del ZIP
      if (pmxDir) {
        const fullRel = (pmxDir + cleanReq).replace(/\\/g, '/');
        if (fileMap.has(fullRel)) return fileMap.get(fullRel)!;
        if (fileMap.has(fullRel.toLowerCase())) return fileMap.get(fullRel.toLowerCase())!;
      }

      // 3. Coincidencia por nombre base de archivo
      if (fileMap.has(baseReq)) return fileMap.get(baseReq)!;
      if (fileMap.has(lowerBase)) return fileMap.get(lowerBase)!;

      // 4. Búsqueda si alguna ruta en el ZIP termina con la ruta solicitada o su nombre base
      for (const [key, url] of fileMap.entries()) {
        if (key.endsWith('/' + lowerReq) || key.endsWith('/' + lowerBase) || key === lowerReq || key === lowerBase) {
          return url;
        }
      }

      // Si ya era un blob URL registrado (ej. el del propio PMX), devolverlo
      if (requestedUrl.startsWith('blob:') && blobUrls.includes(requestedUrl)) {
        return requestedUrl;
      }

      console.warn(`[PMXLoader] Textura no encontrada en ZIP: ${requestedUrl} (limpia: ${cleanReq})`);
      return requestedUrl;
    });

    const pmxBlob = await zip.files[pmxPath].async('blob');
    const pmxBlobUrl = URL.createObjectURL(pmxBlob);
    blobUrls.push(pmxBlobUrl);

    const isPmd = pmxPath.toLowerCase().endsWith('.pmd');
    return await loadMeshWithMMDLoader(pmxBlobUrl, manager, isPmd ? 'pmd' : 'pmx');
  } else {
    // Archivo PMX directo
    const blob = new Blob([fileBuffer]);
    const blobUrl = URL.createObjectURL(blob);
    blobUrls.push(blobUrl);

    const isPmd = fileName.toLowerCase().endsWith('.pmd');
    return await loadMeshWithMMDLoader(blobUrl, manager, isPmd ? 'pmd' : 'pmx');
  }
}

/**
 * Solver para Huesos de Concesión / Grants (付与) en modelos PMX / MMD.
 * Transfiere la rotación de los huesos estándar (ej. 左足, 左ひざ, 左足首)
 * hacia los D-Bones (準標準ボーン: 左足D, 左ひざD, 左足首D, 回転, etc.),
 * que es donde reside el 100% del peso de los vértices de la malla en casi todos los modelos PMX.
 */
export class PmxGrantSolver {
  private mesh: THREE.SkinnedMesh;
  private grants: any[];
  private _q: THREE.Quaternion = new THREE.Quaternion();

  constructor(mesh: THREE.SkinnedMesh, grants: any[] = []) {
    this.mesh = mesh;
    // Ordenar grants por transformationClass (orden de evaluación de PMX)
    this.grants = grants.slice().sort((a, b) => (a.transformationClass || 0) - (b.transformationClass || 0));
  }

  update(): void {
    const bones = this.mesh.skeleton?.bones;
    if (!bones || this.grants.length === 0) return;

    for (let i = 0; i < this.grants.length; i++) {
      const g = this.grants[i];
      if (g.affectRotation) {
        const bone = bones[g.index];
        const parent = bones[g.parentIndex];
        if (!bone || !parent) continue;

        this._q.set(0, 0, 0, 1);
        this._q.slerp(parent.quaternion, g.ratio);
        bone.quaternion.multiply(this._q);
      }
    }
  }
}

const _qTarget = new THREE.Quaternion();
const _qParent = new THREE.Quaternion();

/**
 * Controlador Integral de Animación para Modelos PMX / MMD.
 * Resuelve:
 * 1. Cinemática Inversa (CCDIKSolver) para mover piernas y pies siguiendo targets IK de VMD.
 * 2. Solver de Concesiones (PmxGrantSolver) para que los D-Bones (con pesos de malla) sigan las rotaciones.
 * 3. Restauración de pose base en eslabones IK para evitar acumulación de rotaciones de CCDIK.
 */
export class PmxAnimationController {
  public mesh: THREE.SkinnedMesh;
  public ikSolver: any | null = null;
  public grantSolver: PmxGrantSolver;
  private validIks: any[] = [];
  private backupBones: Float32Array | null = null;
  private isSaved: boolean = false;
  private _pristineBones: Float32Array | null = null;

  constructor(mesh: THREE.SkinnedMesh, iks: any[] = [], grants: any[] = []) {
    this.mesh = mesh;

    // Filtrar cadenas IK válidas (evitar links rotos donde link0.parent !== link1)
    const validIks: any[] = [];
    const bones = mesh.skeleton?.bones || [];

    // Guardar postura inicial prístina (bind pose) de todos los huesos al cargar el modelo
    if (bones && bones.length > 0) {
      this._pristineBones = new Float32Array(bones.length * 7);
      for (let i = 0; i < bones.length; i++) {
        const offset = i * 7;
        bones[i].position.toArray(this._pristineBones, offset);
        bones[i].quaternion.toArray(this._pristineBones, offset + 3);
      }
    }

    if (iks && iks.length > 0 && CCDIKSolver) {
      for (const ik of iks) {
        if (!ik.links || ik.links.length === 0) continue;
        let valid = true;
        let link0 = bones[ik.effector];
        for (let j = 0; j < ik.links.length; j++) {
          const link1 = bones[ik.links[j].index];
          if (link0 && link1 && link0.parent !== link1) {
            valid = false;
            break;
          }
          link0 = link1;

          // Si el eslabón tiene límites exclusivamente en X (como las rodillas 'ひざ' en MMD),
          // fijar limitation en (1, 0, 0) para que actúe como bisagra perfecta sin torsión lateral
          const l = ik.links[j];
          if (l.rotationMin && l.rotationMax &&
              Math.abs(l.rotationMin.y) < 0.001 && Math.abs(l.rotationMax.y) < 0.001 &&
              Math.abs(l.rotationMin.z) < 0.001 && Math.abs(l.rotationMax.z) < 0.001) {
            l.limitation = new THREE.Vector3(1, 0, 0);
          }
        }
        if (valid) {
          // Limitar iteraciones y ángulo máximo para evitar giros bruscos, fatiga y torsiones anómalas
          if (ik.iteration !== undefined) ik.iteration = Math.min(ik.iteration, 15);
          if (ik.maxAngle !== undefined) ik.maxAngle = Math.min(ik.maxAngle, 0.8);
          validIks.push(ik);
        }
      }

      this.validIks = validIks;

      try {
        this.ikSolver = new CCDIKSolver(mesh, validIks);
      } catch (e) {
        console.warn('⚠️ [PmxAnimationController] Error creando CCDIKSolver:', e);
      }
    }

    this.grantSolver = new PmxGrantSolver(mesh, grants);
  }

  /**
   * Restaura los huesos a la pose limpia post-mixer del frame anterior
   * antes de que el mixer evalúe el nuevo delta, evitando que CCDIK o Grants acumulen rotaciones continuas
   * y que las piernas giren o se tuerzan en espiral.
   */
  restoreBones(): void {
    if (!this.isSaved || !this.backupBones) return;
    const bones = this.mesh.skeleton?.bones;
    if (!bones) return;

    for (let i = 0, il = bones.length; i < il; i++) {
      if (bones[i].userData?.isJiggleBone) continue;
      const offset = i * 7;
      bones[i].position.fromArray(this.backupBones, offset);
      bones[i].quaternion.fromArray(this.backupBones, offset + 3);
    }
  }

  /**
   * Guarda el estado limpio de los huesos inmediatamente tras mixer.update().
   * Sirve de base pura para aplicar IK y Grants sin que las modificaciones se acumulen.
   */
  saveBones(): void {
    const bones = this.mesh.skeleton?.bones;
    if (!bones) return;

    if (!this.backupBones || this.backupBones.length !== bones.length * 7) {
      this.backupBones = new Float32Array(bones.length * 7);
    }

    for (let i = 0, il = bones.length; i < il; i++) {
      const offset = i * 7;
      bones[i].position.toArray(this.backupBones, offset);
      bones[i].quaternion.toArray(this.backupBones, offset + 3);
    }
    this.isSaved = true;
  }

  /**
   * Resetea el solver y restaura los huesos a la postura inicial prístina de reposo.
   * Evita que los huesos retengan deformaciones o posiciones del baile anterior.
   */
  reset(): void {
    this.isSaved = false;
    this.backupBones = null;
    const bones = this.mesh.skeleton?.bones;
    if (bones && this._pristineBones) {
      for (let i = 0; i < bones.length; i++) {
        const offset = i * 7;
        bones[i].position.fromArray(this._pristineBones, offset);
        bones[i].quaternion.fromArray(this._pristineBones, offset + 3);
      }
      this.mesh.updateMatrixWorld(true);
      if (this.mesh.skeleton) {
        this.mesh.skeleton.update();
      }
    }
  }

  update(hasIK: boolean = true): void {
    const bones = this.mesh.skeleton?.bones;
    if (!bones) return;

    if (hasIK && this.ikSolver) {
      // 1. Actualizar matrices globales y resolver IK (piernas y punta de pies)
      this.mesh.updateMatrixWorld(true);
      try {
        this.ikSolver.update();
      } catch (err) {
        // Ignorar fallos transitorios
      }

      // 2. Si el modelo no cuenta con cadena IK para la punta del pie (つま先IK),
      // alinear la orientación mundial del tobillo con el objetivo IK sin heredar la flexión de la rodilla.
      // Si el modelo ya tiene cadena つま先IK, CCDIKSolver resuelve automáticamente la postura del pie en el suelo.
      for (let i = 0; i < this.validIks.length; i++) {
        const ik = this.validIks[i];
        const effector = bones[ik.effector];
        const target = bones[ik.target];
        if (!effector || !target || !effector.parent) continue;

        const isAnkle = effector.name.includes('足首') || effector.name.toLowerCase().includes('ankle');
        if (isAnkle) {
          const hasToeIk = this.validIks.some(otherIk => otherIk.links?.some((l: any) => l.index === ik.effector));
          if (!hasToeIk) {
            target.getWorldQuaternion(_qTarget);
            effector.parent.getWorldQuaternion(_qParent);
            effector.quaternion.copy(_qParent.invert().multiply(_qTarget));
          }
        }
      }
    }

    // 3. Resolver Grants (D-bones) de forma exacta y estable
    this.grantSolver.update();

    // 4. Actualizar matrices del SkinnedMesh
    this.mesh.updateMatrixWorld(true);
  }
}

/**
 * Genera un gradiente suave y rico para sombreado anime (Cel-Shading),
 * con sombras cálidas y vivas en lugar de tonos grisáceos/planos.
 */
function createSmoothToonGradient(): THREE.DataTexture {
  const colors = new Uint8Array([
    160, 130, 140, 255,  // Sombra anime cálida y rica (elimina palidez grisácea)
    215, 200, 205, 255,  // Medio tono suave y definido
    255, 255, 255, 255   // Luz limpia y viva
  ]);
  const texture = new THREE.DataTexture(colors, 3, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.NearestFilter;
  texture.magFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Carga un SkinnedMesh mediante MMDLoader y lo envuelve en un THREE.Group
 */
function loadMeshWithMMDLoader(url: string, manager: THREE.LoadingManager, forcedExtension: 'pmx' | 'pmd' = 'pmx'): Promise<PMXModelResult> {
  return new Promise((resolve, reject) => {
    const loader = new MMDLoader(manager);

    // FIX CRÍTICO: Sobrescribir _extractExtension para URLs de tipo Blob (blob:http://...)
    // Usar (loader as any) para evitar el error TS2339 sobre el método privado.
    const loaderAny = loader as any;
    const originalExtract = loaderAny._extractExtension.bind(loader);
    loaderAny._extractExtension = function (inputUrl: string) {
      const clean = inputUrl.split('?')[0].split('#')[0];
      const ext = originalExtract(clean);
      if (ext === 'pmx' || ext === 'pmd') return ext;

      const hash = inputUrl.split('#')[1];
      if (hash) {
        const hashExt = originalExtract(hash);
        if (hashExt === 'pmx' || hashExt === 'pmd') return hashExt;
      }

      return forcedExtension;
    };

    const cleanToonGradient = createSmoothToonGradient();

    // Silenciar advertencias de propiedades de material obsoletas de Three.js r150+ durante la carga de MMD
    const origWarn = console.warn;
    console.warn = function (msg?: any, ...args: any[]) {
      if (typeof msg === 'string' && (
        msg.includes('is not a property of THREE.MeshToonMaterial') ||
        msg.includes('THREE.Material:')
      )) {
        return;
      }
      origWarn.call(console, msg, ...args);
    };

    const restoreWarn = () => {
      console.warn = origWarn;
    };

    loader.load(
      url,
      (mesh: any) => {
        restoreWarn();
        console.log(`✅ [PMXLoader] Modelo MMD cargado exitosamente:`, mesh);

        if (!mesh.name) mesh.name = 'MMD_Mesh';

        // Envolver en un Group para tener la misma interfaz que GLTF.scene
        const group = new THREE.Group();
        group.name = 'PMX_Avatar_Root';
        group.add(mesh);

        // Inicializar solver de Cinemática Inversa (CCDIKSolver) y Solver de Concesiones (Grants/D-Bones)
        try {
          const iks = mesh.geometry?.userData?.MMD?.iks || mesh.geometry?.userData?.iks || [];
          const grants = mesh.geometry?.userData?.MMD?.grants || mesh.geometry?.userData?.grants || [];
          const pmxController = new PmxAnimationController(mesh, iks, grants);
          mesh.userData.ikSolver = pmxController;
          mesh.userData.pmxController = pmxController;
          group.userData.ikSolver = pmxController;
          group.userData.pmxController = pmxController;
          console.log(`🦵 [PMXLoader] PmxAnimationController inicializado con ${iks.length} cadenas IK y ${grants.length} grants (D-bones soportados).`);
        } catch (ikErr) {
          console.warn(`⚠️ [PMXLoader] No se pudo inicializar PmxAnimationController:`, ikErr);
        }

        // Ajustar materiales para evitar palidez excesiva, sobreexposición y shadow acne
        mesh.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            // Desactivar receiveShadow en el modelo anime para eliminar Shadow Acne (rayas negras de autosilueta)
            child.receiveShadow = false;

            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m: any) => {
                if (m) {
                  // Reemplazar gradiente toon por uno con contraste y sombras limpias
                  m.gradientMap = cleanToonGradient;

                  // 1. Espacio de color sRGB y filtrado anisotrópico para máxima nitidez y saturación
                  if (m.map) {
                    m.map.colorSpace = THREE.SRGBColorSpace;
                    m.map.anisotropy = 16;
                    m.map.minFilter = THREE.LinearMipmapLinearFilter;
                    m.map.magFilter = THREE.LinearFilter;
                    const img = m.map.image as any;
                    if (img && (img.width > 0 || img.data)) {
                      m.map.generateMipmaps = true;
                      m.map.needsUpdate = true;
                    } else {
                      m.map.needsUpdate = false;
                    }
                  }

                  // FIX CRÍTICO: MMDLoader asigna el color 'ambient' de MMD como 'emissive' en Three.js.
                  // Con las luces de Three.js (ambientLight + directionalLight), un emissive no nulo
                  // actúa como fluorescencia blanca y quema las texturas haciendo que el modelo se vea plano y blanquecino.
                  if (m.emissive) {
                    m.emissive.setRGB(0, 0, 0);
                  }

                  // 2. Preservar pureza y viveza de la textura sin tintes que la apaguen
                  if (m.color) {
                    if (m.map) {
                      m.color.setRGB(1.0, 1.0, 1.0);
                    }
                  }

                  // 3. Especular controlado anime: evita película blanca deslumbrante sobre la piel
                  if (m.specular) {
                    m.specular.setRGB(0.04, 0.04, 0.04);
                  }
                  m.shininess = 30;

                  // Evitar Z-Fighting de outlines
                  if (m.side === THREE.DoubleSide) {
                    m.side = THREE.FrontSide;
                  }

                  // Si el material tiene mapa difuso con transparencia, asegurar alphaTest para no glitchar profundidad
                  if (m.transparent && m.map) {
                    m.alphaTest = 0.05;
                    m.depthWrite = true;
                  }

                  m.needsUpdate = true;
                }
              });
            }
          }
        });

        resolve({
          scene: group,
          animations: [],
          isPMX: true
        });
      },
      undefined,
      (error: any) => {
        restoreWarn();
        console.error(`❌ [PMXLoader] Error cargando modelo PMX:`, error);
        reject(error);
      }
    );
  });
}
