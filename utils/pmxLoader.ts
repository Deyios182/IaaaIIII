/**
 * PMX / MMD / FBX / GLTF Avatar Loader
 * Carga modelos .pmx, .fbx, .glb y paquetes .zip / .rar / .7z / .tar.gz
 * para renderizar avatares en Three.js con soporte universal de texturas y materiales.
 */

import * as THREE from 'three';
import { MMDLoader, CCDIKSolver } from 'three-stdlib';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extractArchive, isSupportedArchive } from './archiveExtractor';

export interface PMXModelResult {
  scene: THREE.Group;
  animations: THREE.AnimationClip[];
  isPMX: boolean;
}

/**
 * Carga un modelo (PMX, FBX, GLTF) desde una URL o un archivo Blob/File.
 * Si es un paquete comprimido (ZIP/RAR/7z), descomprime las texturas y crea
 * Object URLs en memoria para que el loader correspondiente las resuelva automáticamente.
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

  const isArchive = isSupportedArchive(fileName);

  if (isArchive) {
    console.log(`📦 [ModelLoader] Descomprimiendo paquete de modelo: ${fileName}`);

    // Extrae ZIP / RAR / 7z / tar / gz en un mapa normalizado
    const { fileMap: blobMap, modelPath, modelType, secondaryModelPath } = await extractArchive(fileBuffer, fileName);

    // Convertir Blob map a URL map para el URLModifier de Three.js
    const fileMap = new Map<string, string>();
    for (const [key, blob] of blobMap.entries()) {
      const url = URL.createObjectURL(blob);
      blobUrls.push(url);
      fileMap.set(key, url);
    }

    console.log(`🌸 [ModelLoader] Modelo ${modelType.toUpperCase()} encontrado en archivo: ${modelPath}`);

    // Determinar la subcarpeta donde reside el modelo dentro del archivo
    const modelDir = modelPath.includes('/') ? modelPath.substring(0, modelPath.lastIndexOf('/') + 1) : '';

    // Configurar URLModifier para que los loaders obtengan las texturas de la memoria
    manager.setURLModifier((requestedUrl: string) => {
      if (requestedUrl.startsWith('data:')) return requestedUrl;

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

      // 1. Coincidencia exacta
      if (fileMap.has(cleanReq)) return fileMap.get(cleanReq)!;
      if (fileMap.has(lowerReq)) return fileMap.get(lowerReq)!;

      // 2. Relativa a la carpeta del modelo
      if (modelDir) {
        const fullRel = (modelDir + cleanReq).replace(/\\/g, '/');
        if (fileMap.has(fullRel)) return fileMap.get(fullRel)!;
        if (fileMap.has(fullRel.toLowerCase())) return fileMap.get(fullRel.toLowerCase())!;
      }

      // 3. Por nombre base
      if (fileMap.has(baseReq)) return fileMap.get(baseReq)!;
      if (fileMap.has(lowerBase)) return fileMap.get(lowerBase)!;

      // 4. Búsqueda parcial
      for (const [key, url] of fileMap.entries()) {
        if (key.endsWith('/' + lowerReq) || key.endsWith('/' + lowerBase) || key === lowerReq || key === lowerBase) {
          return url;
        }
      }

      // 5. Coincidencia ignorando extensión (ej: sink2.bmp -> sink2.png / sink22.png)
      const baseNoExt = lowerBase.replace(/\.[^/.]+$/, '');
      for (const [key, url] of fileMap.entries()) {
        const keyBaseNoExt = (key.split('/').pop() || key).toLowerCase().replace(/\.[^/.]+$/, '');
        if (keyBaseNoExt === baseNoExt) {
          console.log(`🔄 [ModelLoader] Textura resuelta por extensión alternativa: "${requestedUrl}" -> "${key}"`);
          return url;
        }
      }

      // 6. Coincidencia inteligente para piel / cuerpo (ej: Body.png / skin.png -> skin.bmp / bodytoon.bmp)
      if (lowerBase.includes('body') || lowerBase.includes('skin') || lowerBase.includes('肌') || lowerBase.includes('face') || lowerBase.includes('颜')) {
        for (const [key, url] of fileMap.entries()) {
          const lKey = key.toLowerCase();
          if (lKey.includes('skin.bmp') || lKey.includes('skin.png') || lKey.includes('body.bmp') || lKey.includes('bodytoon') || lKey.includes('body.png') || lKey.includes('_skin')) {
            console.log(`✨ [ModelLoader] Textura de piel/cuerpo mapeada inteligentemente: "${requestedUrl}" -> "${key}"`);
            return url;
          }
        }
      }

      // 7. Coincidencia difusa para nombres con variantes (sink2 -> sink22, 1010浣 -> starby1010浣)
      for (const [key, url] of fileMap.entries()) {
        const lKey = key.toLowerCase();
        if (baseNoExt.startsWith('sink') && lKey.includes('sink')) {
          console.log(`🔄 [ModelLoader] Textura mapeada por prefijo: "${requestedUrl}" -> "${key}"`);
          return url;
        }
        if (lowerBase.includes('1010') && lKey.includes('1010')) {
          console.log(`🔄 [ModelLoader] Textura mapeada por patrón: "${requestedUrl}" -> "${key}"`);
          return url;
        }
      }

      if (requestedUrl.startsWith('blob:') && blobUrls.includes(requestedUrl)) return requestedUrl;

      // Si todo falla y es una textura de piel/cuerpo, usar cualquier textura de piel disponible
      if (lowerBase.includes('body') || lowerBase.includes('skin')) {
        for (const [key, url] of fileMap.entries()) {
          if (key.toLowerCase().includes('skin')) {
            console.log(`✨ [ModelLoader] Textura de piel fallback aplicada: "${key}"`);
            return url;
          }
        }
      }

      console.warn(`[ModelLoader] Textura no encontrada en archivo: ${requestedUrl} (limpia: ${cleanReq})`);
      return requestedUrl;
    });

    // Ignorar errores de texturas faltantes no críticas para no abortar la carga del modelo
    manager.onError = (url) => {
      console.warn(`⚠️ [ModelLoader] Textura accesoria omitida: ${url}`);
    };

    const modelBlobUrl = fileMap.get(modelPath) || fileMap.get(modelPath.toLowerCase()) || '';
    if (!modelBlobUrl) throw new Error(`No se pudo obtener Blob URL del modelo: ${modelPath}`);

    if (modelType === 'fbx') {
      const secondaryBlobUrl = secondaryModelPath ? (fileMap.get(secondaryModelPath) || fileMap.get(secondaryModelPath.toLowerCase())) : undefined;
      return await loadMeshWithFBXLoader(modelBlobUrl, manager, secondaryBlobUrl, fileMap);
    } else if (modelType === 'glb' || modelType === 'gltf') {
      return await loadMeshWithGLTFLoader(modelBlobUrl, manager);
    } else {
      const isPmd = modelType === 'pmd';
      const secondaryBlobUrl = secondaryModelPath ? (fileMap.get(secondaryModelPath) || fileMap.get(secondaryModelPath.toLowerCase())) : undefined;
      return await loadMeshWithMMDLoader(modelBlobUrl, manager, isPmd ? 'pmd' : 'pmx', fileMap, secondaryBlobUrl);
    }
  } else {
    // Archivo directo sin comprimir
    const lowerName = fileName.toLowerCase();
    const blob = new Blob([fileBuffer]);
    const blobUrl = URL.createObjectURL(blob);
    blobUrls.push(blobUrl);

    if (lowerName.endsWith('.fbx')) {
      return await loadMeshWithFBXLoader(blobUrl, manager);
    } else if (lowerName.endsWith('.glb') || lowerName.endsWith('.gltf')) {
      return await loadMeshWithGLTFLoader(blobUrl, manager);
    } else {
      const isPmd = lowerName.endsWith('.pmd');
      return await loadMeshWithMMDLoader(blobUrl, manager, isPmd ? 'pmd' : 'pmx');
    }
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

const _sharedTextureLoader = new THREE.TextureLoader();

/**
 * Inyecta sombreado realista con dispersión subsuperficial (Subsurface Scattering / SSS Wrap)
 * y Half-Lambert adaptativo en MeshStandardMaterial via onBeforeCompile.
 * Elimina completamente el aspecto de "plasticina / plastilina" (sombras cortadas duras y brillos plásticos)
 * produciendo piel suave y viva con rubor cálido en la penumbra, pelo sedoso y telas aterciopeladas.
 */
function applyRealisticSSSShader(mat: THREE.MeshStandardMaterial, category: 'skin' | 'hair' | 'cloth') {
  mat.customProgramCacheKey = () => `sss_v3_${category}`;

  mat.onBeforeCompile = (shader) => {
    // 1. Modificar el cálculo de irradiance en RE_Direct_Physical de lights_physical_pars_fragment
    let replacement = '';
    if (category === 'skin') {
      replacement = `
        float rawDotNL = dot( geometryNormal, directLight.direction );
        // Wrap Half-Lambert suave para piel viva y translúcida (elimina corte duro de plasticina)
        float dotNL = saturate( ( rawDotNL + 0.38 ) / 1.38 );
        // Dispersión subcutánea cálida (rubor melocotón/coral suave en la penumbra de transición)
        float sssFactor = smoothstep( -0.25, 0.20, rawDotNL ) * ( 1.0 - smoothstep( 0.05, 0.55, rawDotNL ) );
        vec3 sssBlush = vec3( 0.22, 0.08, 0.04 ) * ( sssFactor * 0.45 );
        vec3 irradiance = ( dotNL * directLight.color ) + ( sssBlush * directLight.color );
      `;
    } else if (category === 'hair') {
      replacement = `
        float rawDotNL = dot( geometryNormal, directLight.direction );
        // Difusión translúcida para pelo sedoso y orgánico
        float dotNL = saturate( ( rawDotNL + 0.28 ) / 1.28 );
        float hairScatter = smoothstep( -0.20, 0.25, rawDotNL ) * ( 1.0 - smoothstep( 0.05, 0.50, rawDotNL ) );
        vec3 hairBlush = vec3( 0.10, 0.05, 0.02 ) * ( hairScatter * 0.30 );
        vec3 irradiance = ( dotNL * directLight.color ) + ( hairBlush * directLight.color );
      `;
    } else { // cloth
      replacement = `
        float rawDotNL = dot( geometryNormal, directLight.direction );
        // Caída de luz suave y aterciopelada en tejidos textiles (sin sombras rígidas de arcilla/plasticina)
        float dotNL = saturate( ( rawDotNL + 0.22 ) / 1.22 );
        vec3 irradiance = dotNL * directLight.color;
      `;
    }

    const directLightRegex = /float\s+dotNL\s*=\s*saturate\(\s*dot\(\s*geometryNormal\s*,\s*directLight\.direction\s*\)\s*\);\s*vec3\s+irradiance\s*=\s*dotNL\s*\*\s*directLight\.color;/;
    if (directLightRegex.test(shader.fragmentShader)) {
      shader.fragmentShader = shader.fragmentShader.replace(directLightRegex, replacement);
    }

    // 2. Para piel, atenuar el specular directo para que no brille como plástico aceitoso
    if (category === 'skin') {
      const specRegex = /reflectedLight\.directSpecular\s*\+=\s*irradiance\s*\*\s*BRDF_GGX_Multiscatter\(\s*directLight\.direction\s*,\s*geometryViewDir\s*,\s*geometryNormal\s*,\s*material\s*\);/;
      const specReplacement = 'reflectedLight.directSpecular += ( directLight.color * ( dotNL * 0.35 ) ) * BRDF_GGX_Multiscatter( directLight.direction, geometryViewDir, geometryNormal, material );';
      if (specRegex.test(shader.fragmentShader)) {
        shader.fragmentShader = shader.fragmentShader.replace(specRegex, specReplacement);
      }
    }
  };
}

/**
 * Busca texturas complementarias genuinas (Normal Maps, Roughness Maps, Emissive Maps)
 * dentro del archivo descomprimido para potenciar el realismo y profundidad 3D.
 * Excluye máscaras y mapas empaquetados que corrompen las normales o causan texturas negras.
 */
function findCompanionTexture(
  materialName: string,
  mapUrl: string | undefined,
  type: 'normal' | 'roughness' | 'emissive',
  fileMap?: Map<string, string>
): string | undefined {
  if (!fileMap || fileMap.size === 0) return undefined;

  const extractStem = (str: string): string => {
    let clean = str.replace(/\\/g, '/').split('/').pop() || str;
    clean = clean.split('?')[0].split('#')[0];
    clean = clean.replace(/\.[^/.]+$/, ''); // quitar extensión
    // quitar sufijos comunes de diffuse / albedo
    clean = clean.replace(/([_-])?(diffuse|diff|basecolor|albedo|col|color|d)$/i, '');
    return clean.toLowerCase();
  };

  const stems: string[] = [];
  if (materialName) stems.push(extractStem(materialName));
  if (mapUrl) stems.push(extractStem(mapUrl));

  // Palabras prohibidas que NUNCA son mapas normales o roughness PBR estándar en Three.js
  const forbiddenMasks = ['mask', 'sdf', 'wenli', 'ao', 'light', 'shadow', 'flow', 'ramp', 'curve', 'star'];

  if (type === 'normal') {
    for (const [key, url] of fileMap.entries()) {
      const kl = key.toLowerCase();
      if (forbiddenMasks.some(bad => kl.includes(bad))) continue;

      const isNormalFile = /(_n|_norm|_normal|_nrm)\.(png|jpg|jpeg|tga|bmp|dds)$/i.test(kl);
      if (!isNormalFile) continue;

      for (const stem of stems) {
        if (!stem || stem.length < 2) continue;
        const keyFile = (key.replace(/\\/g, '/').split('/').pop() || key).toLowerCase().replace(/\.[^/.]+$/, '');
        if (keyFile.startsWith(stem)) {
          return url;
        }
      }
    }
    return undefined;
  }

  if (type === 'roughness') {
    for (const [key, url] of fileMap.entries()) {
      const kl = key.toLowerCase();
      if (forbiddenMasks.some(bad => kl.includes(bad))) continue;

      const isRoughnessFile = /(_roughness|_rough|_r)\.(png|jpg|jpeg|tga|bmp|dds)$/i.test(kl);
      if (!isRoughnessFile) continue;

      for (const stem of stems) {
        if (!stem || stem.length < 2) continue;
        const keyFile = (key.replace(/\\/g, '/').split('/').pop() || key).toLowerCase().replace(/\.[^/.]+$/, '');
        if (keyFile.startsWith(stem)) {
          return url;
        }
      }
    }
    return undefined;
  }

  if (type === 'emissive') {
    for (const [key, url] of fileMap.entries()) {
      const kl = key.toLowerCase();
      const isEmissiveFile = /(_em|_emission|_emit|_emissive)\.(png|jpg|jpeg|tga|bmp|dds)$/i.test(kl);
      if (!isEmissiveFile) continue;

      for (const stem of stems) {
        if (!stem || stem.length < 2) continue;
        const keyFile = (key.replace(/\\/g, '/').split('/').pop() || key).toLowerCase().replace(/\.[^/.]+$/, '');
        if (keyFile.startsWith(stem) || kl.includes(stem)) {
          return url;
        }
      }
      if (stems.some(s => s.includes('lucy') || s.includes('hdmf') || s.includes('head') || s.includes('body'))) {
        if (kl.includes('hdmf_em') || kl.includes('_em.png')) {
          return url;
        }
      }
    }
    return undefined;
  }

  return undefined;
}

/**
 * Convierte y calibra materiales de modelos PMX/FBX a MeshStandardMaterial (PBR realista con SSS)
 * con propiedades físicas ajustadas por semántica anatómica (piel aterciopelada viva, pelo sedoso,
 * telas mate con caída suave, cuero y metales reflectantes), evitando totalmente texturas negras
 * y el aspecto artificial de plasticina.
 */
function upgradeMaterialToRealisticPBR(
  oldMat: any,
  meshName: string,
  fileMap?: Map<string, string>
): THREE.MeshStandardMaterial {
  const matName = (oldMat.name || '').toLowerCase();
  const mName = (meshName || '').toLowerCase();
  const fullId = `${matName} ${mName}`;

  // 1. Detección semántica de partes
  const isEye = /eye|pupil|iris|cornea|sclera|shirome|白目|瞳|目|眼|ハイライト|catchlight/i.test(fullId);
  const isSkin = !isEye && /body|skin|肌|体|颜|顔|face|head|cheek|arm|leg|foot|hand|ani_main|ani_body/i.test(fullId);
  const isHair = !isEye && /hair|bangs|tail|ponytail|kaminoke|strand|髪|发|毛|辮/i.test(fullId);
  const isMetal = !isEye && /metal|gold|silver|iron|steel|brass|chain|ring|buckle|金|银|铁|金属/i.test(fullId);
  const isLeather = !isEye && /leather|belt|boot|shoe|strap|革|皮|靴/i.test(fullId);
  const isDecal = !isEye && (/sticker|tattoo|mark|wenli/i.test(fullId) || (!/eye|shirome|白目/i.test(fullId) && /blush|shadow|sombra/i.test(fullId)));
  const isCloth = !isSkin && !isHair && !isEye && !isMetal && !isDecal;

  // 2. Parámetros PBR físicamente basados (calibrados para aspecto orgánico y natural, sin plasticina)
  let roughness = 0.72;
  let metalness = 0.0;
  let envMapIntensity = 0.20;

  if (isSkin) {
    roughness = 0.68; // Piel aterciopelada y suave (sin brillo aceitoso de plástico)
    metalness = 0.0;
    envMapIntensity = 0.18;
  } else if (isHair) {
    roughness = 0.44; // Cabello sedoso y orgánico con brillo longitudinal sutil
    metalness = 0.0;
    envMapIntensity = 0.35;
  } else if (isEye) {
    roughness = 0.04; // Córnea húmeda cristalina con catchlights nítidos
    metalness = 0.0;
    envMapIntensity = 1.0;
  } else if (isMetal) {
    roughness = 0.22; // Metal pulido
    metalness = 0.85;
    envMapIntensity = 0.90;
  } else if (isLeather) {
    roughness = 0.45;
    metalness = 0.05;
    envMapIntensity = 0.35;
  } else if (isCloth) {
    roughness = 0.76; // Tejido textil mate y suave
    metalness = 0.0;
    envMapIntensity = 0.15;
  }

  // 3. Preparar texturas difusas (sRGB y filtrado anisotrópico 16x para máxima nitidez)
  let baseMap = oldMat.map;
  let mapSrc: string | undefined = undefined;
  if (baseMap) {
    baseMap.colorSpace = THREE.SRGBColorSpace;
    baseMap.anisotropy = 16;
    baseMap.minFilter = THREE.LinearMipmapLinearFilter;
    baseMap.magFilter = THREE.LinearFilter;
    baseMap.generateMipmaps = true;
    baseMap.needsUpdate = true;
    mapSrc = (baseMap.image as any)?.src || baseMap.name;
  }

  // 4. Color base: 100% pureza si hay textura para que el arte original no se oscurezca ni altere
  let color = oldMat.color ? oldMat.color.clone() : new THREE.Color(1, 1, 1);
  if (!baseMap && isSkin) {
    color.setHex(0xffdfd0); // Tono carne cálido si no tiene textura
  } else if (baseMap) {
    color.setRGB(1.0, 1.0, 1.0);
  }

  // 5. Configurar transparencia y alphaTest
  let transparent = false;
  let opacity = oldMat.opacity !== undefined ? oldMat.opacity : 1.0;
  let alphaTest = 0;
  let depthWrite = true;

  if (isEye) {
    // Córnea / Iris / Ojos: Siempre sólidos y con depthWrite=true
    transparent = false;
    opacity = 1.0;
    depthWrite = true;
    alphaTest = 0;
  } else if (isSkin) {
    // La piel debe ser siempre sólida y opaca para evitar Z-fighting o huecos negros
    transparent = false;
    opacity = 1.0;
    depthWrite = true;
    alphaTest = 0;
  } else if (isHair) {
    // Cabello: CUTOUT mode (transparent=false + alphaTest) - renderiza en el pass opaco con depth correcto
    // transparent=true + depthWrite=true causaba que el pelo se viera a través de sí mismo por el Z-sorting
    transparent = false;
    alphaTest = 0.15;
    depthWrite = true;
  } else if (isDecal) {
    transparent = true;
    depthWrite = false;
    alphaTest = 0.02;
  } else {
    // Ropa / accesorios: opacos por defecto para evitar sorting glitches
    if (oldMat.transparent && oldMat.opacity < 0.95) {
      transparent = true;
      opacity = oldMat.opacity;
      alphaTest = 0.05;
      depthWrite = false; // FIX: blend transparency REQUIERE depthWrite=false
    } else {
      transparent = false;
      opacity = 1.0;
      depthWrite = true;
      alphaTest = 0;
    }
  }

  // 6. Instanciar MeshStandardMaterial con DoubleSide universal (previene caras negras invertidas)
  const stdMat = new THREE.MeshStandardMaterial({
    name: oldMat.name || meshName,
    map: baseMap,
    color,
    roughness,
    metalness,
    envMapIntensity,
    transparent,
    opacity,
    alphaTest,
    depthWrite,
    side: THREE.DoubleSide
  });

  // Marcar material como calibrado para protegerlo de sobreescrituras en otros módulos
  stdMat.userData.isCalibrated = true;

  if (isDecal) {
    stdMat.polygonOffset = true;
    stdMat.polygonOffsetFactor = -4;
    stdMat.polygonOffsetUnits = -4;
  }

  // Emissive a negro por defecto para evitar quemar o descolorar el modelo
  stdMat.emissive.setRGB(0, 0, 0);

  // 7. Descubrimiento y enlace de texturas complementarias genuinas
  if (fileMap && fileMap.size > 0) {
    const normalUrl = findCompanionTexture(oldMat.name, mapSrc, 'normal', fileMap);
    if (normalUrl) {
      try {
        const normTex = _sharedTextureLoader.load(normalUrl);
        normTex.colorSpace = THREE.NoColorSpace;
        normTex.wrapS = THREE.RepeatWrapping;
        normTex.wrapT = THREE.RepeatWrapping;
        normTex.anisotropy = 16;
        normTex.minFilter = THREE.LinearMipmapLinearFilter;
        normTex.magFilter = THREE.LinearFilter;
        stdMat.normalMap = normTex;
        stdMat.normalScale = new THREE.Vector2(0.50, 0.50);
        console.log(`✨ [ModelLoader] Normal Map genuino vinculado a "${stdMat.name}": ${normalUrl.slice(-30)}`);
      } catch (e) {
        console.warn(`[ModelLoader] Error cargando normal map:`, e);
      }
    }

    const roughUrl = findCompanionTexture(oldMat.name, mapSrc, 'roughness', fileMap);
    if (roughUrl) {
      try {
        const rTex = _sharedTextureLoader.load(roughUrl);
        rTex.colorSpace = THREE.NoColorSpace;
        rTex.anisotropy = 16;
        stdMat.roughnessMap = rTex;
        // NOTA CRÍTICA: JAMÁS asignar metalnessMap aquí; hace que los modelos se vuelvan negros
        console.log(`✨ [ModelLoader] Roughness Map vinculado a "${stdMat.name}"`);
      } catch (e) {
        console.warn(`[ModelLoader] Error cargando roughness map:`, e);
      }
    }

    const emissiveUrl = findCompanionTexture(oldMat.name, mapSrc, 'emissive', fileMap);
    if (emissiveUrl) {
      try {
        const emTex = _sharedTextureLoader.load(emissiveUrl);
        emTex.colorSpace = THREE.SRGBColorSpace;
        emTex.anisotropy = 16;
        stdMat.emissiveMap = emTex;
        stdMat.emissive = new THREE.Color(0xffffff);
        console.log(`💡 [ModelLoader] Emissive Map vinculado a "${stdMat.name}"`);
      } catch (e) {
        console.warn(`[ModelLoader] Error cargando emissive map:`, e);
      }
    }
  }

  // 8. Inyección de Shader SSS (Subsurface Scattering Wrap) para realismo orgánico sin aspecto de plasticina
  if (isSkin) {
    applyRealisticSSSShader(stdMat, 'skin');
  } else if (isHair) {
    applyRealisticSSSShader(stdMat, 'hair');
  } else if (isCloth) {
    applyRealisticSSSShader(stdMat, 'cloth');
  }

  // Liberar recursos del material anterior
  if (typeof oldMat.dispose === 'function') {
    oldMat.dispose();
  }

  return stdMat;
}

/**
 * Genera un gradiente continuo de 256 texeles con interpolación bilineal (LinearFilter).
 * Implementa una curva Half-Lambert fotográfica con dispersión subsuperficial (SSS)
 * que baña la penumbra de las sombras con un rubor cálido y aterciopelado (melocotón/coral),
 * eliminando el aspecto de plasticina y las sombras duras de comic.
 */
function createPhotorealisticSSSGradient(): THREE.DataTexture {
  const width = 256;
  const data = new Uint8Array(width * 4);

  for (let i = 0; i < width; i++) {
    const x = i / (width - 1); // 0.0 (lado de sombra completa) a 1.0 (lado de luz frontal)

    let r: number, g: number, b: number;

    if (x < 0.45) {
      // Sombra ambiental rica y contrastada (evita aspecto lavado/grisáceo)
      const t = x / 0.45;
      r = THREE.MathUtils.lerp(75, 140, t);
      g = THREE.MathUtils.lerp(65, 120, t);
      b = THREE.MathUtils.lerp(75, 125, t);
    } else if (x < 0.70) {
      // Penumbra con SSS cálido y saturado (rubor subcutáneo)
      const t = (x - 0.45) / 0.25;
      r = THREE.MathUtils.lerp(140, 230, t);
      g = THREE.MathUtils.lerp(120, 190, t);
      b = THREE.MathUtils.lerp(125, 185, t);
    } else {
      // Luz directa limpia con brillo total pero manteniendo saturación
      const t = (x - 0.70) / 0.30;
      r = THREE.MathUtils.lerp(230, 255, t);
      g = THREE.MathUtils.lerp(190, 255, t);
      b = THREE.MathUtils.lerp(185, 255, t);
    }

    const idx = i * 4;
    data[idx] = Math.round(r);
    data[idx + 1] = Math.round(g);
    data[idx + 2] = Math.round(b);
    data[idx + 3] = 255;
  }

  const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

/**
 * Carga un SkinnedMesh mediante MMDLoader y lo envuelve en un THREE.Group
 */
function loadMeshWithMMDLoader(
  url: string,
  manager: THREE.LoadingManager,
  forcedExtension: 'pmx' | 'pmd' = 'pmx',
  fileMap?: Map<string, string>,
  secondaryPmxUrl?: string
): Promise<PMXModelResult> {
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

        // Preservar y calibrar materiales nativos de MMDLoader con gradiente SSS fotográfico continuo
        const photorealisticGradient = createPhotorealisticSSSGradient();

        mesh.traverse((child: any) => {
          if (child.isMesh) {
            child.castShadow = true;
            child.receiveShadow = false;

            if (child.material) {
              const mats = Array.isArray(child.material) ? child.material : [child.material];
              mats.forEach((m: any) => {
                if (!m) return;

                // Marcar como calibrado para que AvatarViewer3D jamás lo sobreescriba con roughness=1.0
                m.userData = m.userData || {};
                m.userData.isCalibrated = true;

                // 1. Asignar el gradiente SSS continuo (256 texeles con LinearFilter)
                // Convierte la iluminación toon en una caída Half-Lambert fotográfica continua y suave,
                // con rubor subcutáneo cálido en la penumbra y sin cortes duros de plasticina.
                if ('gradientMap' in m) {
                  m.gradientMap = photorealisticGradient;
                }

                // 2. Espacio de color sRGB y filtrado anisotrópico 16x para máxima nitidez y viveza
                if (m.map) {
                  m.map.colorSpace = THREE.SRGBColorSpace;
                  m.map.anisotropy = 16;
                  m.map.minFilter = THREE.LinearMipmapLinearFilter;
                  m.map.magFilter = THREE.LinearFilter;
                  const img = m.map.image as any;
                  if (img && (img.width > 0 || img.data)) {
                    m.map.generateMipmaps = true;
                    m.map.needsUpdate = true;
                  }
                }

                // 3. MMDLoader asigna el color 'ambient' de MMD como 'emissive' en Three.js.
                // Resetear emissive a 0 para que la textura original conserve su viveza, color y contraste natural
                // sin verse fluorescente ni desteñida por sobreiluminación propia.
                if (m.emissive) {
                  m.emissive.setRGB(0, 0, 0);
                }

                // 4. Si hay textura, mantener color difuso al 100% de pureza (blanco neutro)
                // para que el arte original del modelo no sufra tintes oscuros
                if (m.color && m.map) {
                  m.color.setRGB(1.0, 1.0, 1.0);
                }

                // 5. Reflejos especulares suaves y calibrados
                if (m.specular) {
                  const nameLower = (m.name || child.name || '').toLowerCase();
                  if (nameLower.includes('eye') || nameLower.includes('pupil') || nameLower.includes('cornea')) {
                    m.specular.setRGB(0.5, 0.5, 0.5);
                    m.shininess = 60;
                  } else if (nameLower.includes('metal') || nameLower.includes('gold') || nameLower.includes('silver')) {
                    m.specular.setRGB(0.6, 0.6, 0.6);
                    m.shininess = 80;
                  } else {
                    m.specular.setRGB(0.08, 0.08, 0.08);
                    m.shininess = 25;
                  }
                }

                // 6. Configuración de caras y profundidad calibrada para modelos PMX:
                // - Sombras: SIEMPRE FrontSide para que las caras invertidas NUNCA proyecten sombras negras sobre el cuerpo (shadow acne)
                m.shadowSide = THREE.FrontSide;

                const mName = (m.name || child.name || '').toLowerCase();
                const isEyeMat = /eye|pupil|iris|cornea|sclera|shirome|白目|瞳|目|眼/i.test(mName);
                const isFacialOverlay = !isEyeMat && /tear|gag|eyeline|highlight|catchlight|涙|ハイライト/i.test(mName);
                const isSkinOrFace = !isEyeMat && !isFacialOverlay && /skin|body|肌|体|颜|face|head|human|mouth|teeth|tongue|唇|歯|牙|舌|口/i.test(mName);
                const isDecal = !isEyeMat && !isFacialOverlay && (/tattoo|紋|sticker/i.test(mName) || (!/eye|shirome|白目/i.test(mName) && /blush|shadow|decal/i.test(mName)));
                const isClothing = /swim|dress|skirt|cloth|clothes|clothing|outfit|suit|pants|shorts|socks|stocking|bottom|top|corset|underwear|bra|panty|panties|lingerie|bikini|服|衣服|上衣|外套|衣装|スカート|裾|ドレス|ワンピース|ワンピ|コルセット|パンツ|ブラ|内衣|文胸|胸罩|内裤|胖次|安全裤|泳装|泳衣|比基尼|裙|褲襪|膝襪/i.test(mName);

                if (isDecal || isFacialOverlay) {
                  // Tatuajes / Calcomanías sobre la piel / Lágrimas / Expresiones / Delineado de ojos superpuesto:
                  m.side = THREE.FrontSide;
                  m.transparent = true;
                  m.depthWrite = false;
                  m.polygonOffset = true;
                  m.polygonOffsetFactor = -1.0;
                  m.polygonOffsetUnits = -1.0;
                  m.alphaTest = 0.05;
                } else {
                  // Piel, ropa, accesorios, cabello, ojos: DoubleSide universal para que NUNCA se vean negros
                  m.side = THREE.DoubleSide;
                  m.polygonOffset = false;
                }

                // 7. Configuración de transparencia y alphaTest limpia para MMD
                const isHairMat = !isEyeMat && !isFacialOverlay && /hair|bangs|tail|ponytail|kaminoke|strand|前发|后发|刘海|髪|发|毛/i.test(mName);
                if (isEyeMat) {
                  // Ojos / Esclera / Córnea / Iris / Pupila: 100% sólidos, opacos y vivos
                  m.transparent = false;
                  m.opacity = 1.0;
                  m.depthWrite = true;
                  m.depthTest = true;
                  m.alphaTest = 0;
                  m.polygonOffset = true;
                  m.polygonOffsetFactor = -2.0;
                  m.polygonOffsetUnits = -2.0;

                  // Desactivar emissive artificial en ojos/pupilas: el emissive blanco blanquea y deslava el iris
                  if (m.emissive) {
                    m.emissive.setRGB(0, 0, 0);
                  }

                  // Si tiene textura de ojo/pupila, mantener color base en blanco puro para no oscurecer ni distorsionar
                  if (m.map && m.color) {
                    m.color.setRGB(1.0, 1.0, 1.0);
                  } else if (m.color) {
                    // Esclera/blanco del ojo sin textura
                    if (m.color.r < 0.2 && m.color.g < 0.2 && m.color.b < 0.2 && !mName.includes('pupil') && !mName.includes('瞳')) {
                      m.color.setRGB(1.0, 1.0, 1.0);
                    }
                  }
                } else if (isHairMat) {
                  // Pelo MMD → CUTOUT obligatorio: transparent=false + alphaTest=0.2 + depthWrite=true
                  // Elimina completamente los artefactos de Z-sorting (ver el cráneo o ropa a través del pelo)
                  m.transparent = false;
                  m.opacity = 1.0;
                  m.alphaTest = 0.2;
                  m.depthWrite = true;
                  m.depthTest = true;
                } else if (isFacialOverlay) {
                  // Ya configurado arriba (transparent=true, depthWrite=false)
                } else if (isSkinOrFace) {
                  // Piel, rostro, cabeza y globos oculares integrados: SIEMPRE 100% sólidos y opacos
                  m.transparent = false;
                  m.opacity = 1.0;
                  m.depthWrite = true;
                  m.depthTest = true;
                  m.alphaTest = 0;
                } else {
                  // Ropa, vestidos, mangas, faldas, lazos, velos y accesorios:
                  // Los modelos PMX frecuentemente tienen flags de transparencia o valores de opacidad < 1.0
                  // por descuido del autor o para técnicas de sombreado MMD que en WebGL Three.js rompen
                  // el Z-buffer y provocan que se vean transparentes o desteñidos.
                  // Forzamos CUTOUT sólido en TODOS: transparent=false, opacity=1.0, depthWrite=true.
                  // Si tienen textura con canal alfa (bordes recortados), alphaTest se encarga de recortar
                  // limpiamente sin volverse semitransparente.
                  m.transparent = false;
                  m.opacity = 1.0;
                  m.depthWrite = true;
                  m.depthTest = true;
                  m.alphaTest = m.map ? 0.2 : 0;
                }

                // 8. Buscar si hay mapa emisivo genuino (como T_HDMF_EM.png)
                if (fileMap && fileMap.size > 0) {
                  const emissiveUrl = findCompanionTexture(m.name, (m.map?.image as any)?.src || m.name, 'emissive', fileMap);
                  if (emissiveUrl) {
                    try {
                      const emTex = _sharedTextureLoader.load(emissiveUrl);
                      emTex.colorSpace = THREE.SRGBColorSpace;
                      m.emissiveMap = emTex;
                      m.emissive = new THREE.Color(0xffffff);
                      console.log(`💡 [PMXLoader] Emissive Map vinculado a "${m.name}": ${emissiveUrl.slice(-30)}`);
                    } catch (e) {
                      console.warn(`[PMXLoader] Error vinculando emissive map:`, e);
                    }
                  }
                }

                // 9. FIX CRÍTICO SHADER: Safeguard contra 'MORPHTARGETS_COUNT undeclared identifier'
                // Three.js r182 define USE_MORPHTARGETS si geometry.morphAttributes.position !== undefined,
                // pero si morphTargetsCount es 0, no define MORPHTARGETS_COUNT ni MORPHTARGETS_TEXTURE_STRIDE,
                // provocando que el shader vertex de MeshToonMaterial (ej. Weapon) falle al compilar.
                const origOnBeforeCompile = m.onBeforeCompile;
                m.onBeforeCompile = (shader: any, renderer: any) => {
                  if (origOnBeforeCompile) {
                    origOnBeforeCompile(shader, renderer);
                  }
                  const morphGuard = `
#ifdef USE_MORPHTARGETS
  #ifndef MORPHTARGETS_COUNT
    #define MORPHTARGETS_COUNT 1
  #endif
  #ifndef MORPHTARGETS_TEXTURE_STRIDE
    #define MORPHTARGETS_TEXTURE_STRIDE 1
  #endif
#endif
`;
                  if (!shader.vertexShader.includes('#define MORPHTARGETS_COUNT')) {
                    shader.vertexShader = morphGuard + shader.vertexShader;
                  }
                };

                m.needsUpdate = true;
              });
            }
          }
        });

        // ── LIMPIEZA CRÍTICA DE MORPH ATTRIBUTES VACÍOS ──────────────────────────────────────────
        // Si geometry.morphAttributes.position existe pero está vacío ([]), Three.js r182
        // activa USE_MORPHTARGETS pero no define MORPHTARGETS_COUNT, rompiendo el vertex shader.
        mesh.traverse((child: any) => {
          if (child.isMesh && child.geometry?.morphAttributes) {
            for (const key of Object.keys(child.geometry.morphAttributes)) {
              const attr = child.geometry.morphAttributes[key];
              if (!attr || (Array.isArray(attr) && attr.length === 0)) {
                delete child.geometry.morphAttributes[key];
              }
            }
          }
        });
        // ─────────────────────────────────────────────────────────────────────────────────────────

        // ── SEPARACIÓN DE OVERLAYS FACIALES EN SUB-MESH INDEPENDIENTE ──────────────────────────────
        // En Three.js, una sola SkinnedMesh con multi-material renderiza los grupos en orden de
        // geometry.groups. Los materiales transparentes (tear/gag/eyeline) pueden bloquear el Z-buffer
        // de los grupos de ojo aunque tengan depthWrite=false — porque el renderer mezcla opaque y
        // transparent render queues en el mismo draw call list. La solución definitiva es extraer
        // todos los grupos de overlay a una nueva SkinnedMesh que comparta el mismo esqueleto,
        // y darle renderOrder=1 para que se dibuje DESPUÉS de que los ojos ya estén en el Z-buffer.
        mesh.traverse((child: any) => {
          if (!child.isSkinnedMesh) return;
          if (!Array.isArray(child.material)) return;
          const geo = child.geometry;
          if (!geo || !geo.groups || geo.groups.length === 0) return;

          const OVERLAY_RE = /tear|gag|eyeline|highlight|catchlight|涙|ハイライト/i;
          const overlayIndices: number[] = [];
          const baseIndices: number[] = [];

          child.material.forEach((m: any, i: number) => {
            const mName = (m?.name || '').toLowerCase();
            if (OVERLAY_RE.test(mName)) {
              overlayIndices.push(i);
            } else {
              baseIndices.push(i);
            }
          });

          if (overlayIndices.length === 0) return; // Nada que separar en este modelo

          // Construir la nueva geometría de overlays con solo los grupos correspondientes
          const overlayGeo = geo.clone();
          overlayGeo.clearGroups();
          // Limpiar morphAttributes residuales o vacíos en la sub-geometría de overlays
          if (overlayGeo.morphAttributes) {
            for (const key of Object.keys(overlayGeo.morphAttributes)) {
              const attr = overlayGeo.morphAttributes[key];
              if (!attr || (Array.isArray(attr) && attr.length === 0)) {
                delete overlayGeo.morphAttributes[key];
              }
            }
          }

          const overlayMats: any[] = [];
          // Mapear cada origIdx al nuevo índice de material en la sub-mesh
          const overlayMatIndexMap = new Map<number, number>();
          overlayIndices.forEach((origIdx) => {
            const mat = child.material[origIdx];
            if (mat) {
              const clonedMat = mat.clone();
              clonedMat.transparent = true;
              clonedMat.depthWrite = false;
              clonedMat.alphaTest = 0.05;
              clonedMat.needsUpdate = true;
              const newIdx = overlayMats.length;
              overlayMats.push(clonedMat);
              overlayMatIndexMap.set(origIdx, newIdx);
            }
          });

          if (overlayMats.length === 0) return;

          // Añadir a overlayGeo todos los grupos cuyo materialIndex esté en overlayIndices
          geo.groups.forEach((g: any) => {
            if (g && overlayMatIndexMap.has(g.materialIndex)) {
              overlayGeo.addGroup(g.start, g.count, overlayMatIndexMap.get(g.materialIndex)!);
            }
          });

          // Crear la sub-mesh que comparte el esqueleto
          const overlayMesh = new THREE.SkinnedMesh(overlayGeo, overlayMats);
          overlayMesh.name = `${child.name}_FacialOverlays`;
          overlayMesh.skeleton = child.skeleton;
          overlayMesh.bindMatrix = child.bindMatrix.clone();
          overlayMesh.bindMatrixInverse = child.bindMatrixInverse.clone();
          overlayMesh.castShadow = false;
          overlayMesh.receiveShadow = false;
          overlayMesh.renderOrder = 2; // Dibujarse DESPUÉS de la malla base (donde están los ojos)
          overlayMesh.frustumCulled = false;

          // Añadir la sub-mesh como hermana al mismo padre
          if (child.parent) {
            child.parent.add(overlayMesh);
          } else {
            group.add(overlayMesh);
          }

          // En la malla base, ocultamos los materiales de overlay sin eliminar elementos del array
          // de materiales ni alterar geo.groups. Esto previene que loaders de texturas asíncronos
          // de Three.js / MMDLoader fallen buscando groups[materialIndex].start.
          overlayIndices.forEach((origIdx) => {
            const m = child.material[origIdx];
            if (m) {
              m.visible = false;
              m.opacity = 0;
              m.transparent = true;
              m.depthWrite = false;
              m.depthTest = false;
            }
          });
          child.renderOrder = 0;

          console.log(`👁️ [PMXLoader] Overlays faciales separados: ${overlayIndices.length} materiales → "${overlayMesh.name}"`);
        });
        // ─────────────────────────────────────────────────────────────────────────────────────────────

        // ── CARGAR MODELO SECUNDARIO (ARMA / ACCESORIO) SI EXISTE ───────────────────
        if (secondaryPmxUrl) {
          loader.load(
            secondaryPmxUrl,
            (secMesh: any) => {
              if (secMesh) {
                secMesh.name = secMesh.name || 'MMD_Secondary_Weapon';
                secMesh.castShadow = true;
                secMesh.receiveShadow = false;

                // Limpiar morphAttributes vacíos
                if (secMesh.geometry?.morphAttributes) {
                  for (const key of Object.keys(secMesh.geometry.morphAttributes)) {
                    const attr = secMesh.geometry.morphAttributes[key];
                    if (!attr || (Array.isArray(attr) && attr.length === 0)) {
                      delete secMesh.geometry.morphAttributes[key];
                    }
                  }
                }

                // Calibrar materiales del arma/accesorio con safeguard de shaders
                const secMats = Array.isArray(secMesh.material) ? secMesh.material : [secMesh.material];
                secMats.forEach((m: any) => {
                  if (!m) return;
                  m.userData = m.userData || {};
                  m.userData.isCalibrated = true;
                  if ('gradientMap' in m) m.gradientMap = photorealisticGradient;
                  m.side = THREE.DoubleSide;
                  m.transparent = false;
                  m.depthWrite = true;
                  m.depthTest = true;

                  const origOnBeforeCompile = m.onBeforeCompile;
                  m.onBeforeCompile = (shader: any, renderer: any) => {
                    if (origOnBeforeCompile) origOnBeforeCompile(shader, renderer);
                    const morphGuard = `
#ifdef USE_MORPHTARGETS
  #ifndef MORPHTARGETS_COUNT
    #define MORPHTARGETS_COUNT 1
  #endif
  #ifndef MORPHTARGETS_TEXTURE_STRIDE
    #define MORPHTARGETS_TEXTURE_STRIDE 1
  #endif
#endif
`;
                    if (!shader.vertexShader.includes('#define MORPHTARGETS_COUNT')) {
                      shader.vertexShader = morphGuard + shader.vertexShader;
                    }
                  };
                  m.needsUpdate = true;
                });

                group.add(secMesh);
                console.log(`🗡️ [PMXLoader] Arma/accesorio PMX secundario vinculado a la escena: "${secMesh.name}"`);
              }
              resolve({
                scene: group,
                animations: [],
                isPMX: true
              });
            },
            undefined,
            (secErr: any) => {
              console.warn(`⚠️ [PMXLoader] No se pudo cargar modelo secundario opcional:`, secErr);
              resolve({
                scene: group,
                animations: [],
                isPMX: true
              });
            }
          );
          return;
        }

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

/**
 * Carga un modelo FBX (con posibles mallas secundarias _SMM como accesorios)
 * y normaliza su escala y materiales para Three.js.
 */
async function loadMeshWithFBXLoader(
  url: string,
  manager: THREE.LoadingManager,
  secondaryFbxUrl?: string,
  fileMap?: Map<string, string>
): Promise<PMXModelResult> {
  const loader = new FBXLoader(manager);
  const fbx = await new Promise<THREE.Group>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  // Si hay una malla secundaria (como _SMM.fbx para accesorios o armas de Lucy), cargar e incorporar
  if (secondaryFbxUrl) {
    try {
      const smmFbx = await new Promise<THREE.Group>((resolve, reject) => {
        loader.load(secondaryFbxUrl, resolve, undefined, reject);
      });
      fbx.add(smmFbx);
      console.log(`🗡️ [FBXLoader] Malla accesoria secundaria vinculada al modelo.`);
    } catch (smmErr) {
      console.warn(`⚠️ [FBXLoader] No se pudo cargar malla secundaria opcional:`, smmErr);
    }
  }

  // Normalizar escala de FBX:
  // FBX de Unreal Engine / ZZZ mide comúnmente ~160-180 unidades (centímetros).
  // Dado que el wrapper de AvatarViewer3D aplica scale=2.5 para modelos no-PMX,
  // normalizamos la altura del grupo a ~0.7 unidades para que 0.7 * 2.5 = 1.75m en pantalla.
  const box = new THREE.Box3().setFromObject(fbx);
  const size = new THREE.Vector3();
  box.getSize(size);
  console.log(`📦 [FBXLoader] Dimensiones FBX detectadas: x=${size.x.toFixed(2)}, y=${size.y.toFixed(2)}, z=${size.z.toFixed(2)}`);

  if (size.y > 10) {
    const targetHeight = 0.7;
    const scaleFactor = targetHeight / size.y;
    fbx.scale.set(scaleFactor, scaleFactor, scaleFactor);
    console.log(`📏 [FBXLoader] Modelo FBX normalizado con factor: ${scaleFactor.toFixed(5)}`);
  }

  // Configurar sombras y materiales PBR realistas
  fbx.traverse((child: any) => {
    if (child.isMesh || child.isSkinnedMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
      if (child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => upgradeMaterialToRealisticPBR(m, child.name, fileMap));
        } else {
          child.material = upgradeMaterialToRealisticPBR(child.material, child.name, fileMap);
        }
      }
    }
  });

  return {
    scene: fbx,
    animations: fbx.animations || [],
    isPMX: false
  };
}

/**
 * Carga un modelo GLTF/GLB dentro de un paquete comprimido
 */
async function loadMeshWithGLTFLoader(
  url: string,
  manager: THREE.LoadingManager,
  fileMap?: Map<string, string>
): Promise<PMXModelResult> {
  const loader = new GLTFLoader(manager);
  const gltf = await new Promise<any>((resolve, reject) => {
    loader.load(url, resolve, undefined, reject);
  });

  const scene = gltf.scene || gltf.scenes[0];
  if (scene) {
    scene.traverse((child: any) => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map((m: any) => upgradeMaterialToRealisticPBR(m, child.name, fileMap));
        } else {
          child.material = upgradeMaterialToRealisticPBR(child.material, child.name, fileMap);
        }
      }
    });
  }

  return {
    scene,
    animations: gltf.animations || [],
    isPMX: false
  };
}

