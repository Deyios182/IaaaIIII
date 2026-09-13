import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { useFrame } from '@react-three/fiber';
import { loadVmdAnimationClip, loadVmdCameraClip, MmdLegIkController } from '../utils/vmdLoader';
import { PmxAnimationController } from '../utils/pmxLoader';
import { GroupSlotConfig } from '../utils/multiVmdManager';

interface GroupDanceOverlayProps {
  currentAvatarScene: THREE.Group | null;
  isPMX: boolean;
}

interface DancerInstance {
  id: string;
  name: string;
  cloneGroup: THREE.Group;
  mixer: THREE.AnimationMixer;
  action: THREE.AnimationAction;
  duration: number;
  pmxController?: PmxAnimationController | null;
  legIkController?: MmdLegIkController | null;
  hipsBone?: THREE.Object3D | null;
  hasIK?: boolean;
}

export const GroupDanceOverlay: React.FC<GroupDanceOverlayProps> = ({ currentAvatarScene, isPMX }) => {
  const [dancers, setDancers] = useState<DancerInstance[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const containerRef = useRef<THREE.Group>(null);

  useEffect(() => {
    let groupTimer: any = null;

    const handlePlayGroup = async (e: Event) => {
      const detail = (e as CustomEvent).detail;
      const avatarScene = currentAvatarScene || (typeof window !== 'undefined' ? (window as any).__activeAvatarScene : null);
      if (!detail || !detail.slots || !avatarScene) return;

      const effectiveIsPMX = isPMX || (typeof window !== 'undefined' && !!(window as any).__activeAvatarIsPMX);
      const slots: GroupSlotConfig[] = detail.slots;
      console.log(`💃 [GroupDanceOverlay] Preparando coreografía grupal con ${slots.length} puestos (isPMX=${effectiveIsPMX}).`);

      // 1. Limpiar bailarines previos y temporizadores
      if (groupTimer) {
        clearTimeout(groupTimer);
        groupTimer = null;
      }

      setDancers(prev => {
        prev.forEach(d => {
          try {
            d.mixer.stopAllAction();
            d.pmxController?.reset();
            d.legIkController?.dispose();
            d.cloneGroup.parent?.remove(d.cloneGroup);
          } catch (_) {}
        });
        return [];
      });

      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (_) {}
        audioRef.current = null;
      }

      // 2. Crear los clones de los puestos (desde el puesto 1 hasta N)
      const newDancers: DancerInstance[] = [];
      let maxDuration = 0;

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        if (!slot.vmdBuffer || slot.vmdBuffer.byteLength < 30) {
          console.warn(`⚠️ [GroupDanceOverlay] Slot ${slot.name} no contiene buffer de animación válido.`);
          continue;
        }

        try {
          // Validar cabecera VMD (30 bytes de magic string)
          const headerBytes = new Uint8Array(slot.vmdBuffer.slice(0, 30));
          const headerStr = String.fromCharCode(...headerBytes);
          const isVmdHeader = headerStr.startsWith('Vocaloid Motion Data');

          if (!isVmdHeader) {
            console.warn(`⚠️ [GroupDanceOverlay] Slot "${slot.name}" tiene un archivo que no es formato VMD (cabecera: "${headerStr.substring(0, 15)}...").`);
            continue;
          }

          // Pasar siempre una copia fresca del buffer para evitar desacoples
          const safeBuffer = slot.vmdBuffer.slice(0);

          // 🛡️ Prevenir error de estructura circular en SkeletonUtils.clone
          const stashUserData = new Map<THREE.Object3D, Record<string, any>>();
          avatarScene.traverse((obj: THREE.Object3D) => {
            if (obj.userData && typeof obj.userData === 'object') {
              const saved: Record<string, any> = {};
              for (const key of Object.keys(obj.userData)) {
                const val = obj.userData[key];
                if (val !== null && (typeof val === 'object' || typeof val === 'function')) {
                  saved[key] = val;
                  delete obj.userData[key];
                }
              }
              if (Object.keys(saved).length > 0) {
                stashUserData.set(obj, saved);
              }
            }
          });

          let clone: THREE.Group;
          try {
            clone = SkeletonUtils.clone(avatarScene) as THREE.Group;
          } finally {
            // Restaurar inmediatamente en el modelo original del avatar
            stashUserData.forEach((saved, obj) => {
              Object.assign(obj.userData, saved);
            });
          }

          // Cargar por defecto tal como viene el modelo y el VMD, sin escalas ni offsets artificiales para encajar perfectamente con la cámara
          clone.position.copy(avatarScene.position);
          clone.scale.copy(avatarScene.scale);
          clone.rotation.copy(avatarScene.rotation);
          clone.visible = true;

          // Crear AnimationMixer dedicado para este clon
          const mixer = new THREE.AnimationMixer(clone);

          // Extraer nombres de huesos, SkinnedMesh y morphs
          let clonedSkinnedMesh: THREE.SkinnedMesh | null = null;
          let hipsBone: THREE.Object3D | null = null;
          const cloneBoneNames = new Set<string>();
          const cloneRestPoses = new Map<string, THREE.Quaternion>();
          const cloneRestPositions = new Map<string, THREE.Vector3>();
          const targetMorphMeshes: Array<{ name: string; dictionary: Record<string, number> }> = [];

          clone.traverse((child: any) => {
            if (child.isSkinnedMesh && !clonedSkinnedMesh) {
              clonedSkinnedMesh = child;
            }
            if (child.isBone || child.type === 'Bone') {
              cloneBoneNames.add(child.name);
              cloneRestPoses.set(child.name, child.quaternion.clone());
              cloneRestPositions.set(child.name, child.position.clone());

              const n = child.name.toLowerCase();
              if (!hipsBone && (n.includes('hips') || n.includes('pelvis') || child.name === '下半身' || child.name === 'センター')) {
                hipsBone = child;
              }
            }
            if (child.isMesh && child.morphTargetDictionary) {
              if (!child.name) child.name = effectiveIsPMX ? 'MMD_Mesh' : ('Mesh_' + targetMorphMeshes.length);
              targetMorphMeshes.push({
                name: child.name,
                dictionary: child.morphTargetDictionary
              });
            }
          });

          // Cargar clip VMD adaptado para este clon
          const vmdClip = await loadVmdAnimationClip(
            safeBuffer,
            `${slot.name}_vmd`,
            cloneBoneNames,
            cloneRestPoses,
            cloneRestPositions,
            effectiveIsPMX,
            targetMorphMeshes
          );

          if (vmdClip && vmdClip.tracks.length > 0) {
            const action = mixer.clipAction(vmdClip);
            action.reset();
            action.setLoop(THREE.LoopOnce, 1);
            action.clampWhenFinished = true;
            action.play();

            if (vmdClip.duration > maxDuration) {
              maxDuration = vmdClip.duration;
            }

            // 🦵 INICIALIZAR CINEMÁTICA Y FÍSICA DE PIERNAS (IK) PARA EL CLON
            let dancerPmxController: PmxAnimationController | null = null;
            let dancerLegIkController: MmdLegIkController | null = null;
            const hasIK = effectiveIsPMX 
              ? (vmdClip.tracks.some(t => t.name.includes('ＩＫ') || t.name.includes('IK')) || true)
              : !!vmdClip.userData?.ikData;

            if (effectiveIsPMX && clonedSkinnedMesh) {
              try {
                // Obtener cadenas IK y Concesiones (Grants) de la geometría o del avatar original
                let originalSkinnedMesh: THREE.SkinnedMesh | null = null;
                avatarScene.traverse((child: any) => {
                  if (child.isSkinnedMesh && !originalSkinnedMesh) {
                    originalSkinnedMesh = child;
                  }
                });

                const iks = (clonedSkinnedMesh as any).geometry?.userData?.MMD?.iks
                  || (clonedSkinnedMesh as any).geometry?.userData?.iks
                  || (originalSkinnedMesh as any)?.geometry?.userData?.MMD?.iks
                  || (originalSkinnedMesh as any)?.geometry?.userData?.iks
                  || (avatarScene.userData?.pmxController as any)?.validIks
                  || [];

                const grants = (clonedSkinnedMesh as any).geometry?.userData?.MMD?.grants
                  || (clonedSkinnedMesh as any).geometry?.userData?.grants
                  || (originalSkinnedMesh as any)?.geometry?.userData?.MMD?.grants
                  || (originalSkinnedMesh as any)?.geometry?.userData?.grants
                  || (avatarScene.userData?.pmxController as any)?.grantSolver?.grants
                  || [];

                dancerPmxController = new PmxAnimationController(clonedSkinnedMesh, iks, grants);
                const ikBones = dancerPmxController.mesh?.skeleton?.bones;
                if (ikBones) {
                  (dancerPmxController as any)._restQuats = ikBones.map((b: THREE.Bone) => b.quaternion.clone());
                }
                console.log(`🦵 [GroupDanceOverlay] PmxAnimationController activado para clon "${slot.name}" (${iks.length} cadenas IK, ${grants.length} grants).`);
              } catch (ikErr) {
                console.warn(`⚠️ [GroupDanceOverlay] Error inicializando PmxAnimationController en clon:`, ikErr);
              }
            } else if (!effectiveIsPMX && vmdClip.userData?.ikData) {
              try {
                dancerLegIkController = new MmdLegIkController();
                let thighL: THREE.Bone | null = null;
                let shinL: THREE.Bone | null = null;
                let footL: THREE.Bone | null = null;
                let thighR: THREE.Bone | null = null;
                let shinR: THREE.Bone | null = null;
                let footR: THREE.Bone | null = null;

                clone.traverse((child: any) => {
                  if (child.isBone || child.type === 'Bone') {
                    const n = child.name.toLowerCase();
                    if (!thighL && (n.includes('leftupperleg') || n.includes('left_leg') || n.includes('leftleg') || child.name === '左足' || (n.includes('thigh') && (n.includes('l') || n.includes('left'))))) {
                      thighL = child;
                    }
                    if (!shinL && (n.includes('leftlowerleg') || n.includes('left_knee') || n.includes('leftshin') || child.name === '左ひざ' || ((n.includes('shin') || n.includes('calf') || n.includes('knee')) && (n.includes('l') || n.includes('left'))))) {
                      shinL = child;
                    }
                    if (!footL && (n.includes('leftfoot') || n.includes('left_foot') || child.name === '左足首' || child.name === '左足' || ((n.includes('foot') || n.includes('ankle')) && (n.includes('l') || n.includes('left'))))) {
                      footL = child;
                    }
                    if (!thighR && (n.includes('rightupperleg') || n.includes('right_leg') || n.includes('rightleg') || child.name === '右足' || (n.includes('thigh') && (n.includes('r') || n.includes('right'))))) {
                      thighR = child;
                    }
                    if (!shinR && (n.includes('rightlowerleg') || n.includes('right_knee') || n.includes('rightshin') || child.name === '右ひざ' || ((n.includes('shin') || n.includes('calf') || n.includes('knee')) && (n.includes('r') || n.includes('right'))))) {
                      shinR = child;
                    }
                    if (!footR && (n.includes('rightfoot') || n.includes('right_foot') || child.name === '右足首' || child.name === '右足' || ((n.includes('foot') || n.includes('ankle')) && (n.includes('r') || n.includes('right'))))) {
                      footR = child;
                    }
                  }
                });

                dancerLegIkController.bindBones({
                  hips: hipsBone || clone.getObjectByName('Hips') || clone.getObjectByName('下半身') || clone.getObjectByName('センター') as any,
                  thighL,
                  shinL,
                  footL,
                  thighR,
                  shinR,
                  footR
                });

                dancerLegIkController.setIkData(vmdClip.userData.ikData as any);
                dancerLegIkController.setCalibration({ scale: 0.035, ikWeight: 0.95 });
                console.log(`🦵 [GroupDanceOverlay] MmdLegIkController activado para clon "${slot.name}".`);
              } catch (ikErr) {
                console.warn(`⚠️ [GroupDanceOverlay] Error inicializando MmdLegIkController en clon:`, ikErr);
              }
            }

            newDancers.push({
              id: slot.id,
              name: slot.name,
              cloneGroup: clone,
              mixer,
              action,
              duration: vmdClip.duration,
              pmxController: dancerPmxController,
              legIkController: dancerLegIkController,
              hipsBone,
              hasIK
            });
          } else {
            console.warn(`⚠️ [GroupDanceOverlay] No se pudieron generar tracks válidos para slot "${slot.name}".`);
          }
        } catch (err: any) {
          console.error(`⚠️ [GroupDanceOverlay] Error procesando slot ${slot.name}:`, err?.message || err);
        }
      }

      if (newDancers.length > 0) {
        setDancers(newDancers);
        console.log(`💃 [GroupDanceOverlay] Coreografía iniciada con éxito: ${newDancers.length} bailarín(es) activo(s).`);

        // 3. Reproducir audio si está presente
        if (detail.audioUrl) {
          const audio = new Audio(detail.audioUrl);
          audio.volume = 0.85;
          audio.play().catch(() => {});
          audioRef.current = audio;
          (window as any).__novaAnimAudio = audio;
        }

        // 4. Reproducir cámara cinemática grupal si está presente
        if (detail.cameraBuffer) {
          try {
            const camClip = loadVmdCameraClip(detail.cameraBuffer, 'group_camera', 0.22, -1.5);
            if (camClip) {
              window.dispatchEvent(new CustomEvent('nova-vmd-camera-play', {
                detail: { clip: camClip, name: 'group_camera' }
              }));
              console.log('🎥 [GroupDanceOverlay] Cámara cinemática grupal VMD activada');
            }
          } catch (camErr) {
            console.warn('⚠️ [GroupDanceOverlay] Error en cámara VMD grupal:', camErr);
          }
        }

        // Temporizador de finalización si no está en bucle
        if (maxDuration > 0) {
          groupTimer = setTimeout(() => {
            handleStopGroup();
          }, (maxDuration + 0.5) * 1000);
        }
      }
    };

    const handleStopGroup = () => {
      if (groupTimer) {
        clearTimeout(groupTimer);
        groupTimer = null;
      }
      setDancers(prev => {
        prev.forEach(d => {
          try {
            d.mixer.stopAllAction();
            d.pmxController?.reset();
            d.legIkController?.dispose();
            d.cloneGroup.parent?.remove(d.cloneGroup);
          } catch (_) {}
        });
        return [];
      });

      const avatarScene = currentAvatarScene || (typeof window !== 'undefined' ? (window as any).__activeAvatarScene : null);
      if (avatarScene) {
        avatarScene.visible = true;
      }

      if (audioRef.current) {
        try { audioRef.current.pause(); } catch (_) {}
        audioRef.current = null;
      }
      console.log('🛑 [GroupDanceOverlay] Coreografía grupal finalizada y clones desmontados.');
    };

    window.addEventListener('nova-multi-dance-play', handlePlayGroup);
    window.addEventListener('nova-multi-dance-stop', handleStopGroup);

    return () => {
      if (groupTimer) clearTimeout(groupTimer);
      window.removeEventListener('nova-multi-dance-play', handlePlayGroup);
      window.removeEventListener('nova-multi-dance-stop', handleStopGroup);
      handleStopGroup();
    };
  }, [currentAvatarScene, isPMX]);

  // Actualizar mixers e IK de todos los bailarines en cada frame
  useFrame((_, delta) => {
    if (dancers.length > 0) {
      const safeDelta = Math.min(delta, 1 / 20);
      for (let i = 0; i < dancers.length; i++) {
        const d = dancers[i];

        // 1. Restaurar huesos para PMX antes de que el mixer evalúe el nuevo delta
        if (d.pmxController) {
          d.pmxController.restoreBones();
        }

        // 2. Actualizar el mixer
        d.mixer.update(safeDelta);

        // 3. PMX: guardar pose limpia y calcular IK + Concesiones (Grants/D-Bones)
        if (d.pmxController) {
          d.pmxController.saveBones();
          d.cloneGroup.updateMatrixWorld(true);
          d.pmxController.update(d.hasIK !== false);
          d.cloneGroup.traverse((child: any) => {
            if (child.isSkinnedMesh && child.skeleton) {
              child.skeleton.update();
            }
          });
        } else if (d.legIkController?.isEnabled()) {
          // 4. VRM / GLB: calcular Two-Bone IK para las piernas
          d.cloneGroup.updateMatrixWorld(true);
          const clipTime = d.action ? d.action.time : 0;
          d.legIkController.update(clipTime, d.hipsBone as any);
          d.cloneGroup.traverse((child: any) => {
            if (child.isSkinnedMesh && child.skeleton) {
              child.skeleton.update();
            }
          });
        }
      }
    }
  });

  if (dancers.length === 0) return null;

  return (
    <group ref={containerRef}>
      {dancers.map(d => (
        <primitive key={d.id} object={d.cloneGroup} />
      ))}
    </group>
  );
};
