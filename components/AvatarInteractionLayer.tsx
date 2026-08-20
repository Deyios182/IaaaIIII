import React, { useRef, useState, useMemo, useEffect, useImperativeHandle, forwardRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface InteractionLayerProps {
    bones: {
        head?: THREE.Bone | null;
        leftBreast?: THREE.Bone | null;
        rightBreast?: THREE.Bone | null;
        leftButt?: THREE.Bone | null;
        rightButt?: THREE.Bone | null;
        leftArm?: THREE.Bone | null;
        rightArm?: THREE.Bone | null;
        leftForeArm?: THREE.Bone | null;
        rightForeArm?: THREE.Bone | null;
        leftHand?: THREE.Bone | null;
        rightHand?: THREE.Bone | null;
        leftLeg?: THREE.Bone | null;
        rightLeg?: THREE.Bone | null;
        leftFoot?: THREE.Bone | null;
        rightFoot?: THREE.Bone | null;
        hips?: THREE.Bone | null;
        spine?: THREE.Bone | null;
        vagina?: THREE.Bone | null;
        anus?: THREE.Bone | null;
        lips?: THREE.Bone | null;
    };
    onInteract?: (partName: string, action: 'touch' | 'grab' | 'pull' | 'release' | 'hit', type?: 'sensory' | 'pose', tool?: string) => void;
    isBoldMode?: boolean;
    showDebugZones?: boolean;
    dragSensitivity?: number;
    maxAngle?: number;
    currentTool?: string;
}

const HITBOX_ZONES = [
    { id: 'head', name: 'cabeza', radius: 0.20, offset: [0, 0.12, -0.02], boneTarget: 'head', type: 'pose' as const },

    // Brazos pose - Pseudo-IK rotando desde la raíz
    { id: 'leftArm', name: 'hombro izquierdo', radius: 0.1, offset: [0, 0, 0], boneTarget: 'leftArm', type: 'pose' as const },
    { id: 'rightArm', name: 'hombro derecho', radius: 0.1, offset: [0, 0, 0], boneTarget: 'rightArm', type: 'pose' as const },
    { id: 'leftForeArm', name: 'codo izquierdo', radius: 0.1, offset: [0, 0, 0], boneTarget: 'leftForeArm', type: 'pose' as const },
    { id: 'rightForeArm', name: 'codo derecho', radius: 0.1, offset: [0, 0, 0], boneTarget: 'rightForeArm', type: 'pose' as const },
    { id: 'leftHand', name: 'mano izquierda', radius: 0.12, offset: [0, 0, 0], boneTarget: 'leftHand', type: 'pose' as const },
    { id: 'rightHand', name: 'mano derecha', radius: 0.12, offset: [0, 0, 0], boneTarget: 'rightHand', type: 'pose' as const },

    // Piernas pose - Convertidas a sensory por petición del usuario para hacerlas rebotar
    { id: 'leftThigh', name: 'muslo izquierdo', radius: 0.12, offset: [0.05, 0.5, 0.05], boneTarget: 'leftLeg', type: 'sensory' as const },
    { id: 'rightThigh', name: 'muslo derecho', radius: 0.12, offset: [-0.05, 0.5, 0.05], boneTarget: 'rightLeg', type: 'sensory' as const },
    { id: 'leftKnee', name: 'rodilla izquierda', radius: 0.1, offset: [0, 1, 0], boneTarget: 'leftLeg', type: 'sensory' as const },
    { id: 'rightKnee', name: 'rodilla derecha', radius: 0.1, offset: [0, 1, 0], boneTarget: 'rightLeg', type: 'sensory' as const },
    { id: 'leftLeg', name: 'pie izquierdo', radius: 0.12, offset: [0, 0, 0], boneTarget: 'leftFoot', type: 'sensory' as const },
    { id: 'rightLeg', name: 'pie derecho', radius: 0.12, offset: [0, 0, 0], boneTarget: 'rightFoot', type: 'sensory' as const },

    // Pechos y glúteos
    { id: 'leftBreast', name: 'pecho izquierdo', radius: 0.12, offset: [-0.01, 0.2, 0], boneTarget: 'leftBreast', type: 'sensory' as const },
    { id: 'rightBreast', name: 'pecho derecho', radius: 0.12, offset: [-0.01, 0.2, 0], boneTarget: 'rightBreast', type: 'sensory' as const },
    { id: 'leftButt', name: 'glúteo izquierdo', radius: 0.12, offset: [0, 0, -0.2], boneTarget: 'leftButt', type: 'sensory' as const },
    { id: 'rightButt', name: 'glúteo derecho', radius: 0.12, offset: [0, 0, 0.2], boneTarget: 'rightButt', type: 'sensory' as const },

    // Zonas Extras de Jiggle
    { id: 'belly', name: 'vientre', radius: 0.12, offset: [0, 0, 0.15], boneTarget: 'belly', type: 'sensory' as const },
    { id: 'hair', name: 'cabello', radius: 0.15, offset: [0, 0.15, -0.1], boneTarget: 'hair', type: 'sensory' as const },

    // Torso y Zonas íntimas
    { id: 'leftShoulder', name: 'hombro izquierdo', radius: 0.1, offset: [0.1, 0.2, 0], boneTarget: 'leftShoulder', type: 'pose' as const },
    { id: 'rightShoulder', name: 'hombro derecho', radius: 0.1, offset: [-0.1, 0.2, 0], boneTarget: 'rightShoulder', type: 'pose' as const },

    // Parte inferior
    { id: 'vagina', name: 'zona íntima', radius: 0.03, offset: [0, 0, 0], boneTarget: 'vagina', type: 'sensory' as const },
    { id: 'anus', name: 'trasero', radius: 0.03, offset: [0, 0, 0], boneTarget: 'anus', type: 'sensory' as const },

    // Cabeza/Boca
    { id: 'mouth', name: 'boca', radius: 0.06, offset: [0, -0.05, 0.12], boneTarget: 'lips', type: 'sensory' as const },
];

export interface InteractionLayerRef {
    updatePhysics: (delta: number) => void;
    resetPhysics: () => void;
    getOffset: (zoneId: string) => THREE.Vector3 | null;
}

export const AvatarInteractionLayer = forwardRef<InteractionLayerRef, InteractionLayerProps>(({
    bones,
    onInteract,
    isBoldMode,
    showDebugZones,
    dragSensitivity = 0.008,
    maxAngle = Math.PI / 3,
    currentTool = 'hand'
}, ref) => {
    const { camera, controls } = useThree();

    // Type definition for the hitboxes to prevent TS errors
    type HitboxZone = typeof HITBOX_ZONES[0];

    const hitboxRefs = useRef<Record<string, THREE.Mesh | null>>({});
    const offsets = useRef<Record<string, THREE.Vector3>>({});

    // Aquí es donde marcamos explícitamente el tipado completo
    const activeDrag = useRef<{
        zone: HitboxZone;
        isDragging: boolean;
        button: number;
    } | null>(null);

    useMemo(() => {
        HITBOX_ZONES.forEach(z => {
            if (!offsets.current[z.id]) {
                offsets.current[z.id] = new THREE.Vector3(0, 0, 0);
            }
        });
    }, []);

    const tempVec = useMemo(() => new THREE.Vector3(), []);
    const tempVecOffset = useMemo(() => new THREE.Vector3(), []);
    const tempWorldQuat = useMemo(() => new THREE.Quaternion(), []);

    const updatePhysics = (delta: number) => {
        // Sync hitboxes
        HITBOX_ZONES.forEach(zone => {
            const bone = bones[zone.boneTarget as keyof typeof bones];
            const hitbox = hitboxRefs.current[zone.id];
            if (hitbox && bone) {
                // Forzar actualización de la matriz para evitar 1-frame lag durante animaciones (bailes)
                if (bone.parent) {
                    bone.parent.updateWorldMatrix(true, false);
                }
                bone.updateWorldMatrix(true, false);

                bone.getWorldPosition(tempVec);
                bone.getWorldQuaternion(tempWorldQuat);
                tempVecOffset.set(zone.offset[0], zone.offset[1], zone.offset[2]);
                tempVecOffset.applyQuaternion(tempWorldQuat);
                tempVec.add(tempVecOffset);
                hitbox.position.copy(tempVec);
                hitbox.quaternion.copy(tempWorldQuat);
            }
        });

        if (!activeDrag.current) {
            Object.entries(offsets.current).forEach(([zoneId, offset]) => {
                offset.lerp(new THREE.Vector3(0, 0, 0), delta * 5);

                const hitbox = HITBOX_ZONES.find(z => z.id === zoneId);
                if (hitbox) {
                    const bone = (bones as any)[hitbox.boneTarget];
                    if (bone) {
                        // Liberar el hueso para que el AnimationMixer recupere el control
                        // IMPORTANTE: Para translación (como pechos estirados), debemos asegurarnos
                        // de que la física (velPos) se haya detenido y el hueso haya regresado al origen.
                        const isPosSettled = !bone.userData.dragStartPos || (
                            bone.userData.velPos &&
                            bone.userData.velPos.lengthSq() < 0.0001 &&
                            bone.position.distanceToSquared(bone.userData.dragStartPos) < 0.0001
                        );

                        if (offset.lengthSq() < 0.001 && isPosSettled) {
                            offset.set(0, 0, 0);

                            // Forzar posición exacta final por si quedó un micro-offset
                            if (bone.userData.dragStartPos) {
                                bone.position.copy(bone.userData.dragStartPos);
                            }

                            bone.userData.dragStartQuat = null;
                            bone.userData.dragStartPos = null;
                            bone.userData.velPos = null;
                            return; // Ya no aplicar físicas a este hueso, dejar que baile
                        }

                        // Return Rotation (pose only)
                        if (hitbox.type === 'pose' && bone.userData.dragStartQuat) {
                            const targetQuat = bone.userData.dragStartQuat.clone();
                            const eulerOffset = new THREE.Euler(offset.y * 2, offset.x * 2, 0);
                            targetQuat.multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                            bone.quaternion.slerp(targetQuat, 0.2);
                        }

                        // Return Position with Spring Bounce (All zones)
                        const applyBounce = (b: THREE.Bone, isGlute: boolean) => {
                            if (b.userData.dragStartPos) {
                                if (!b.userData.velPos) b.userData.velPos = new THREE.Vector3();
                                // Para MÁS rebote, necesitamos que el resorte jale con fuerza (stiffness alto) 
                                // y que no pierda la energía (damping muy cerca a 1).
                                const stiffness = isGlute ? 0.40 : 0.35; // Pechos casi tan rígidos como glúteos para un rebote más rápido y snapy
                                const damping = isGlute ? 0.985 : 0.985; // Misma retención de energía perfecta

                                const force = new THREE.Vector3().subVectors(b.userData.dragStartPos, b.position).multiplyScalar(stiffness);
                                b.userData.velPos.add(force);
                                b.userData.velPos.multiplyScalar(damping);
                                b.position.add(b.userData.velPos);

                                // Detener micro-movimientos (Bajamos el umbral para que tiemble hasta el último milímetro)
                                if (offset.lengthSq() < 0.001 && b.userData.velPos.lengthSq() < 0.000001) {
                                    b.position.copy(b.userData.dragStartPos);
                                    b.userData.dragStartQuat = null;
                                    b.userData.dragStartPos = null;
                                    b.userData.velPos = null;
                                }
                            }
                        };

                        const isGluteZone = zoneId === 'leftButt' || zoneId === 'rightButt';

                        if (isGluteZone) {
                            let rootNode: THREE.Object3D = bone;
                            while (rootNode.parent) rootNode = rootNode.parent;

                            rootNode.traverse((child: any) => {
                                if (child.isBone) {
                                    const n = child.name.toLowerCase();
                                    const isL = zoneId === 'leftButt' && (n.includes('l') && !n.includes('r'));
                                    const isR = zoneId === 'rightButt' && (n.includes('r') && !n.includes('l'));
                                    if ((n.includes('ass') || n.includes('glute')) && (isL || isR)) {
                                        applyBounce(child, true);
                                    }
                                }
                            });
                        } else {
                            applyBounce(bone, false);
                        }
                    }
                }
            });
            return;
        }

        const { zone, isDragging } = activeDrag.current;
        if (!isDragging) return;

        // BLOQUEAR FÍSICAS PARA SENSORES PUROS SI NO TIENEN HUESO PROPIO
        // (Belly y hair ahora tienen huesos si se detectan en el modelo)
        if (zone.id === 'back') return;

        const offset = offsets.current[zone.id];
        const isRightClick = activeDrag.current.button === 2;
        const isSensory = zone.type === 'sensory';

        // OVERRIDE: Si tocamos cabeza, movemos físicamente la columna (spine)
        let activeBoneTarget = zone.boneTarget;
        if (zone.id === 'head') {
            activeBoneTarget = 'spine';
        }

        // Si es click derecho O es una zona sensorial (pechos, glúteos, muslos), hacemos translación (estiramiento)
        if (isRightClick || isSensory) {
            // Translación simple para IK-like stretching y flesh stretching
            const bone = (bones as any)[activeBoneTarget];
            // Bloquear translación de la columna vertebral para no romper el modelo al bailar
            if (activeBoneTarget === 'spine') return;

            if (bone && bone.userData.dragStartPos) {
                if (bone.userData.velPos) bone.userData.velPos.set(0, 0, 0); // Stop bouncing while dragging

                const worldToLocal = bone.parent ? bone.parent.matrixWorld.clone().invert() : new THREE.Matrix4();

                // Convertir desplazamiento de pantalla a espacio de mundo según la cámara, y luego a local
                const deltaWorld = new THREE.Vector3(offset.x * 0.5, -offset.y * 0.5, 0).applyQuaternion(camera.quaternion);
                const deltaPos = deltaWorld.transformDirection(worldToLocal);

                // LÍMITE MÁXIMO DE ESTIRAMIENTO (clamp)
                const isGlute = zone.id === 'leftButt' || zone.id === 'rightButt';
                const isIntimate = zone.id === 'vagina' || zone.id === 'anus';
                
                // Limitar drásticamente el estiramiento de los huesos íntimos (0.5cm) para que no deformen la malla,
                // mientras que pechos/glúteos se mantienen en 5cm.
                const stretchLimit = isIntimate ? 0.005 : (isGlute ? 0.05 : 0.05);

                deltaPos.clampLength(0, isSensory ? stretchLimit : 0.015);

                const targetPos = bone.userData.dragStartPos.clone().add(deltaPos);

                // TEST DEFINITIVO RESTAURADO: Movemos TODOS los huesos "ass" al mismo tiempo (Shotgun)
                // Usando un límite de estiramiento pequeño (2.5cm) para no deformar en exceso.
                if (isGlute) {
                    let rootNode: THREE.Object3D = bone;
                    while (rootNode.parent) rootNode = rootNode.parent;

                    rootNode.traverse((child: any) => {
                        if (child.isBone) {
                            const n = child.name.toLowerCase();
                            // Mover solo los del lado correspondiente
                            const isL = zone.id === 'leftButt' && (n.includes('l') && !n.includes('r'));
                            const isR = zone.id === 'rightButt' && (n.includes('r') && !n.includes('l'));

                            if ((n.includes('ass') || n.includes('glute')) && (isL || isR)) {
                                if (!child.userData.dragStartPos) child.userData.dragStartPos = child.position.clone();

                                // Dividimos el delta local por 2 para que si están en cadena no se sume tanto el efecto
                                const localDeltaPos = deltaPos.clone().multiplyScalar(0.5);

                                const localTarget = child.userData.dragStartPos.clone().add(localDeltaPos);
                                child.position.lerp(localTarget, 0.5);

                                if (child.userData.dragStartQuat) {
                                    // Rotación muy sutil
                                    const testEuler = new THREE.Euler(offset.y * 0.2, offset.x * 0.2, 0);
                                    const targetQuat = child.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(testEuler));
                                    child.quaternion.slerp(targetQuat, 0.5);
                                }
                            }
                        }
                    });
                } else {
                    bone.position.lerp(targetPos, 0.4);
                }
            }
        } else {
            // Rotación FK (Left Click para zonas no sensoriales)
            if (zone.id === 'head' || zone.id === 'hair') {
                const bone = (bones as any)[activeBoneTarget];
                if (bone && bone.userData.dragStartQuat && bone.userData.dragStartPos) {
                    // ROTACIÓN
                    const eulerOffset = new THREE.Euler(offset.y * 2.5, offset.x * 2.5, 0);
                    const targetQuat = bone.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                    bone.quaternion.slerp(targetQuat, 0.3);
                }
            }
            // (La rotación de isSensory fue eliminada ya que ahora hace translación en el bloque de arriba)
            else if (zone.id === 'hips') {
                const bone = (bones as any)[zone.boneTarget];
                if (bone && bone.userData.dragStartQuat && bone.userData.dragStartPos) {
                    // ROTACIÓN
                    const eulerOffset = new THREE.Euler(-offset.y * 1.5, offset.x * 1.5, 0);
                    const targetQuat = bone.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                    bone.quaternion.slerp(targetQuat, 0.3);

                    // TRANSLACIÓN (Mover todo el cuerpo)
                    const dragWorldPos = new THREE.Vector3();
                    bone.getWorldPosition(dragWorldPos);
                    dragWorldPos.x += offset.x * 0.25; // Más sensible para la cadera
                    dragWorldPos.y -= offset.y * 0.25;
                    dragWorldPos.z -= (offset.x * 0.1); // Leve profundidad al mover

                    const targetLocalPos = bone.parent ? bone.parent.worldToLocal(dragWorldPos) : dragWorldPos;
                    const localDelta = targetLocalPos.clone().sub(bone.userData.dragStartPos);
                    localDelta.clampLength(0, 0.5); // Permitir más movimiento que el cuello

                    const targetPos = bone.userData.dragStartPos.clone().add(localDelta);
                    bone.position.lerp(targetPos, 0.3);
                }
            }
            else if (['leftHand', 'rightHand', 'leftFoot', 'rightFoot', 'leftArm', 'rightArm', 'leftForeArm', 'rightForeArm', 'leftLeg', 'rightLeg', 'leftKnee', 'rightKnee', 'leftThigh', 'rightThigh', 'leftShoulder', 'rightShoulder'].includes(zone.id)) {
                const bone = (bones as any)[zone.boneTarget];
                if (bone && bone.userData.dragStartQuat) {
                    const eulerOffset = new THREE.Euler(-offset.y * 2, offset.x * 2, 0);
                    const targetQuat = bone.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                    bone.quaternion.slerp(targetQuat, 0.3);
                }
            }
        }
    };

    useImperativeHandle(ref, () => ({
        updatePhysics,
        resetPhysics: () => {
            Object.values(offsets.current).forEach(o => o.set(0, 0, 0));
        },
        getOffset: (zoneId: string) => offsets.current[zoneId] || null
    }));

    const handlePointerDown = (e: any, zone: typeof HITBOX_ZONES[0]) => {
        const bone = bones[zone.boneTarget as keyof typeof bones];
        if (!bone) return;
        e.stopPropagation();

        // Si usamos herramientas de golpear (whip, bat, dildo), no se arrastra
        if (currentTool === 'whip' || currentTool === 'bat' || currentTool === 'dildo') {
            if (onInteract) onInteract(zone.id, 'hit' as any, zone.type, currentTool);
            return;
        }

        try {
            if (e.pointerId !== undefined) {
                (e.target as HTMLElement)?.setPointerCapture?.(e.pointerId);
            }
        } catch (err) {
            // Ignorar error cuando el evento PointerEvent es sintetizado virtualmente por la cámara AR
        }

        if (!bone.userData.dragStartQuat) bone.userData.dragStartQuat = bone.quaternion.clone();
        if (!bone.userData.dragStartPos) bone.userData.dragStartPos = bone.position.clone();

        const stateControls = controls as any;
        if (stateControls) stateControls.enabled = false;

        // Save button (0 = left, 2 = right)
        activeDrag.current = { zone, isDragging: true, button: e.button };
        if (onInteract) onInteract(zone.id, 'grab', zone.type, currentTool);
    };

    const handlePointerMove = (e: any) => {
        if (!activeDrag.current || !activeDrag.current.isDragging) return;

        const zone = activeDrag.current.zone;
        if (!zone) return;

        // BLOQUEAR COMPLETAMENTE EL ARRASTRE PARA SENSORES PUROS SIN HUESO
        if (zone.id === 'back') return;

        e.stopPropagation();

        const offset = offsets.current[activeDrag.current.zone.id];
        if (offset) {
            const deltaX = e.movementX || 0;
            const deltaY = e.movementY || 0;

            // Usar dragSensitivity o default
            const sensitivity = dragSensitivity;

            offset.x += deltaX * sensitivity;
            offset.y += deltaY * sensitivity;

            // LÍMITE DE ROTACIÓN: Prevenir que la espina/cabeza se rompa hacia atrás
            const limit = maxAngle / 50;
            offset.x = Math.max(-limit, Math.min(limit, offset.x));
            offset.y = Math.max(-limit, Math.min(limit, offset.y));
        }
    };

    const handlePointerUp = (e: any) => {
        const dragState = activeDrag.current;
        if (dragState && dragState.isDragging) {
            e.stopPropagation();

            // Clear reference FIRST to prevent re-entrancy crashes
            activeDrag.current = null;

            try {
                if (e.pointerId !== undefined) {
                    (e.target as HTMLElement)?.releasePointerCapture?.(e.pointerId);
                }
            } catch (err) {
                // Ignorar error al liberar capturas sintetizadas por AR
            }

            const stateControls = controls as any;
            if (stateControls) stateControls.enabled = true;

            if (onInteract && dragState.zone) {
                onInteract(dragState.zone.id, 'release', dragState.zone.type);
            }
        }
    };

    return (
        <group>
            {HITBOX_ZONES.map(zone => {
                const bone = bones[zone.boneTarget as keyof typeof bones];
                if (!bone) return null;

                return (
                    <group key={zone.id}>
                        <mesh
                            ref={(el) => { hitboxRefs.current[zone.id] = el; }}
                            visible={true}
                            onPointerDown={(e: any) => handlePointerDown(e, zone)}
                            onPointerMove={handlePointerMove}
                            onPointerUp={handlePointerUp}
                            onPointerOut={handlePointerUp}
                            onPointerLeave={handlePointerUp}
                            onContextMenu={(e: any) => e.stopPropagation()}
                        >
                            <sphereGeometry args={[zone.radius, 16, 16]} />
                            <meshBasicMaterial
                                color={zone.type === 'pose' ? '#22c55e' : (isBoldMode ? '#ff0000' : '#22c55e')}
                                transparent={true}
                                opacity={showDebugZones ? (zone.type === 'sensory' ? 0.25 : 0.3) : 0.0}
                                wireframe={showDebugZones && zone.type === 'pose'}
                                depthTest={false}
                                depthWrite={false}
                            />
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
});
