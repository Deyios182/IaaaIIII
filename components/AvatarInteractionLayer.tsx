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
        leftKnee?: THREE.Bone | null;
        rightKnee?: THREE.Bone | null;
        leftFoot?: THREE.Bone | null;
        rightFoot?: THREE.Bone | null;
        hips?: THREE.Bone | null;
        spine?: THREE.Bone | null;
        chest?: THREE.Bone | null;
        vagina?: THREE.Bone | null;
        anus?: THREE.Bone | null;
        lips?: THREE.Bone | null;
        belly?: THREE.Bone | null;
        hair?: THREE.Bone | null;
    };
    hasDiscreteBreasts?: boolean;
    hasDiscreteButt?: boolean;
    isPMX?: boolean;
    onInteract?: (partName: string, action: 'touch' | 'grab' | 'pull' | 'release' | 'hit', type?: 'sensory' | 'pose', tool?: string) => void;
    isBoldMode?: boolean;
    showDebugZones?: boolean;
    dragSensitivity?: number;
    maxAngle?: number;
    currentTool?: string;
}

export interface InteractionLayerRef {
    updatePhysics: (delta: number) => void;
    resetPhysics: () => void;
    getOffset: (zoneId: string) => THREE.Vector3 | null;
    handleSurfacePointerDown?: (e: any) => void;
}

/**
 * =========================================================================================
 * ⚙️ PARÁMETROS DE ESTIRAMIENTO Y REBOTE AL INTERACTUAR / APRETAR (PECHOS Y GLÚTEOS)
 * =========================================================================================
 */
export const SENSORY_PHYSICS_CONFIG = {
    stretchLimit: 0.08,
    stretchFactor: 0.14,
    squashFactor: 0.10,
    dragMultiplier: 0.65,
    bounceStiffness: 0.40,
    bounceDamping: 0.86,
    volumeRecoverSpeed: 0.22,
};

/**
 * =========================================================================================
 * HITBOX_ZONES canónicas — no recalibrar radios/offsets
 * =========================================================================================
 */
const HITBOX_ZONES = [
    // Cabeza y Rostro
    { id: 'head', name: 'cabeza', radius: 0.18, offset: [0, 0.08, 0.02], fallbackOffset: [0, 0.08, 0.02], boneTarget: 'head', type: 'pose' as const },
    { id: 'mouth', name: 'boca', radius: 0.07, offset: [0, 0.01, 0.10], fallbackOffset: [0, 0.01, 0.10], boneTarget: 'lips', type: 'sensory' as const },
    { id: 'hair', name: 'cabello', radius: 0.15, offset: [0, 0.10, -0.10], fallbackOffset: [0, 0.10, -0.10], boneTarget: 'hair', type: 'sensory' as const },

    // Brazos y Manos
    { id: 'leftArm', name: 'hombro izquierdo', radius: 0.10, offset: [0, 0, 0], fallbackOffset: [0, 0, 0], boneTarget: 'leftArm', type: 'pose' as const },
    { id: 'rightArm', name: 'hombro derecho', radius: 0.10, offset: [0, 0, 0], fallbackOffset: [0, 0, 0], boneTarget: 'rightArm', type: 'pose' as const },
    { id: 'leftForeArm', name: 'codo izquierdo', radius: 0.09, offset: [0, 0, 0], fallbackOffset: [0, 0, 0], boneTarget: 'leftForeArm', type: 'pose' as const },
    { id: 'rightForeArm', name: 'codo derecho', radius: 0.09, offset: [0, 0, 0], fallbackOffset: [0, 0, 0], boneTarget: 'rightForeArm', type: 'pose' as const },
    { id: 'leftHand', name: 'mano izquierda', radius: 0.10, offset: [0, 0, 0], fallbackOffset: [0, 0, 0], boneTarget: 'leftHand', type: 'pose' as const },
    { id: 'rightHand', name: 'mano derecha', radius: 0.10, offset: [0, 0, 0], fallbackOffset: [0, 0, 0], boneTarget: 'rightHand', type: 'pose' as const },

    // Pechos
    { id: 'leftBreast', name: 'pecho izquierdo', radius: 0.26, offset: [0, 0, 0.06], fallbackOffset: [-0.09, -0.2, 0.12], boneTarget: 'leftBreast', type: 'sensory' as const },
    { id: 'rightBreast', name: 'pecho derecho', radius: 0.26, offset: [0, 0, 0.06], fallbackOffset: [0.09, -0.2, 0.12], boneTarget: 'rightBreast', type: 'sensory' as const },

    // Vientre
    { id: 'belly', name: 'vientre', radius: 0.13, offset: [0, -0.3, 0.09], fallbackOffset: [0, -0.04, 0.09], boneTarget: 'belly', type: 'sensory' as const },

    // Glúteos y Zonas Íntimas (calibración canónica)
    { id: 'leftButt', name: 'glúteo izquierdo', radius: 0.26, offset: [0, 0, -0.06], fallbackOffset: [-0.15, -0.4, -0.10], boneTarget: 'leftButt', type: 'sensory' as const },
    { id: 'rightButt', name: 'glúteo derecho', radius: 0.26, offset: [0, 0, -0.06], fallbackOffset: [0.15, -0.4, -0.10], boneTarget: 'rightButt', type: 'sensory' as const },
    { id: 'vagina', name: 'zona íntima', radius: 0.09, offset: [0, 0, 0.02], fallbackOffset: [0, -0.5, 0.045], boneTarget: 'vagina', type: 'sensory' as const },
    { id: 'anus', name: 'trasero', radius: 0.09, offset: [0, 0, -0.02], fallbackOffset: [0, -0.5, -0.2], boneTarget: 'anus', type: 'sensory' as const },

    // Piernas
    { id: 'leftThigh', name: 'muslo izquierdo', radius: 0.10, offset: [-0.04, -0.5, 0.01], fallbackOffset: [-0.04, -0.22, 0.01], boneTarget: 'leftLeg', type: 'pose' as const },
    { id: 'rightThigh', name: 'muslo derecho', radius: 0.10, offset: [0.04, -0.5, 0.01], fallbackOffset: [0.04, -0.22, 0.01], boneTarget: 'rightLeg', type: 'pose' as const },
    { id: 'leftKnee', name: 'rodilla izquierda', radius: 0.09, offset: [0, 0, 0.04], fallbackOffset: [0, 0, 0.04], boneTarget: 'leftKnee', type: 'pose' as const },
    { id: 'rightKnee', name: 'rodilla derecha', radius: 0.09, offset: [0, 0, 0.04], fallbackOffset: [0, 0, 0.04], boneTarget: 'rightKnee', type: 'pose' as const },
    { id: 'leftFoot', name: 'pie izquierdo', radius: 0.085, offset: [0, -0.04, 0.03], fallbackOffset: [0, -0.04, 0.03], boneTarget: 'leftFoot', type: 'pose' as const },
    { id: 'rightFoot', name: 'pie derecho', radius: 0.085, offset: [0, -0.04, 0.03], fallbackOffset: [0, -0.04, 0.03], boneTarget: 'rightFoot', type: 'pose' as const },
];

const isStructuralBone = (b: THREE.Bone | null | undefined, bones: InteractionLayerProps['bones']) =>
    !!b && (b === bones.hips || b === bones.spine || b === bones.leftLeg || b === bones.rightLeg || b === bones.chest);

export const AvatarInteractionLayer = forwardRef<InteractionLayerRef, InteractionLayerProps>(({
    bones,
    hasDiscreteBreasts = false,
    hasDiscreteButt = false,
    isPMX = false,
    onInteract,
    isBoldMode,
    showDebugZones,
    dragSensitivity = 0.008,
    maxAngle = Math.PI / 3,
    currentTool = 'hand'
}, ref) => {
    const { camera, controls } = useThree();

    type HitboxZone = typeof HITBOX_ZONES[0];

    const hitboxRefs = useRef<Record<string, THREE.Mesh | null>>({});
    const offsets = useRef<Record<string, THREE.Vector3>>({});

    const cachedGluteBonesL = useRef<THREE.Bone[]>([]);
    const cachedGluteBonesR = useRef<THREE.Bone[]>([]);
    const cachedBreastBonesL = useRef<THREE.Bone[]>([]);
    const cachedBreastBonesR = useRef<THREE.Bone[]>([]);
    const lastSceneUuid = useRef<string>('');

    useEffect(() => {
        const rootCandidate = bones.hips || bones.spine || bones.head;
        if (!rootCandidate) return;

        let rootNode: THREE.Object3D = rootCandidate;
        while (rootNode.parent) rootNode = rootNode.parent;

        if (
            lastSceneUuid.current === rootNode.uuid &&
            cachedBreastBonesL.current.length > 0 &&
            (cachedGluteBonesL.current.length > 0 || cachedGluteBonesR.current.length > 0)
        ) {
            return;
        }
        lastSceneUuid.current = rootNode.uuid;

        cachedGluteBonesL.current = [];
        cachedGluteBonesR.current = [];
        cachedBreastBonesL.current = [];
        cachedBreastBonesR.current = [];

        rootNode.traverse((child: any) => {
            if (child.isBone) {
                let isWeaponOrAcc = false;
                let cp: THREE.Object3D | null = child;
                while (cp) {
                    const pn = (cp.name || '').toLowerCase();
                    if (
                        pn.includes('weapon') ||
                        pn.includes('knife') ||
                        pn.includes('blade') ||
                        pn.includes('sword') ||
                        pn.includes('gun') ||
                        pn.includes('dagger') ||
                        pn.includes('shield') ||
                        pn.includes('bow') ||
                        pn.includes('arrow') ||
                        pn.includes('sheath') ||
                        pn.includes('holster') ||
                        pn.includes('accessory') ||
                        pn.includes('acc_') ||
                        pn.includes('prop') ||
                        pn.includes('item') ||
                        cp.name === 'MMD_Secondary_Weapon'
                    ) {
                        isWeaponOrAcc = true;
                        break;
                    }
                    cp = cp.parent;
                }
                if (isWeaponOrAcc) return;

                const n = child.name.toLowerCase();
                const raw = child.name;
                if (n.startsWith('wgt-') || n.includes('collision') || n.includes('hole')) return;

                const isL = (/(?:^|[._\-])(?:l|left)(?:$|[._\-\d])/i).test(n) || raw.includes('左');
                const isR = (/(?:^|[._\-])(?:r|right)(?:$|[._\-\d])/i).test(n) || raw.includes('右');

                const isSafeAss = (/(?:^|[._\-\s])ass(?:$|[._\-\s\d])/i.test(n) || n === 'ass') &&
                    !n.includes('passive') && !n.includes('assault') && !n.includes('glass') &&
                    !n.includes('grass') && !n.includes('bass') && !n.includes('class') &&
                    !n.includes('compass') && !n.includes('mass') && !n.includes('asset') &&
                    !n.includes('assist');

                const hasLegDescendant = child.children && child.children.some((c: any) => {
                    const cn = (c.name || '').toLowerCase();
                    return cn.includes('thigh') || cn.includes('leg') || cn.includes('knee') || cn.includes('foot') || (c.name || '').includes('足');
                });

                const isRealButt = (
                    n.includes('butt') ||
                    n.includes('glute') ||
                    n.includes('shiri') ||
                    n.includes('siri') ||
                    n.includes('trasero') ||
                    n.includes('booty') ||
                    n.includes('nalga') ||
                    n.includes('buttock') ||
                    raw.includes('尻') ||
                    raw.includes('臀') ||
                    raw.includes('ケツ') ||
                    raw.includes('お尻') ||
                    raw.includes('屁股') ||
                    isSafeAss
                ) && !n.includes('pelvis') && !n.includes('hip') && !n.includes('thigh') && !n.includes('leg') && !hasLegDescendant;

                if (isRealButt && !isStructuralBone(child, bones)) {
                    if (isL && !isR) cachedGluteBonesL.current.push(child);
                    else if (isR && !isL) cachedGluteBonesR.current.push(child);
                    else {
                        cachedGluteBonesL.current.push(child);
                        cachedGluteBonesR.current.push(child);
                    }
                }

                const isBreast = n.includes('breast') || n.includes('boob') || n.includes('oppai') || n.includes('bust') || n.includes('mune') || raw.includes('胸') || raw.includes('乳');
                if (isBreast && !n.includes('chest') && !n.includes('torso') && raw !== '上半身2') {
                    if (isL && !isR) cachedBreastBonesL.current.push(child);
                    else if (isR && !isL) cachedBreastBonesR.current.push(child);
                    else {
                        cachedBreastBonesL.current.push(child);
                        cachedBreastBonesR.current.push(child);
                    }
                }
            }
        });

        // No filtrar solo DEF-: un solo hueso chico se ve como pellizco.
        // Se mueven todos los huesos de masa detectados.

        const isBoneNotWeapon = (b: THREE.Bone | null | undefined): boolean => {
            if (!b) return false;
            let p: THREE.Object3D | null = b;
            while (p) {
                const pn = (p.name || '').toLowerCase();
                if (pn.includes('weapon') || pn.includes('knife') || pn.includes('blade') || pn.includes('sword') || pn.includes('gun') || pn.includes('accessory') || p.name === 'MMD_Secondary_Weapon') return false;
                p = p.parent;
            }
            return true;
        };

        if (isBoneNotWeapon(bones.leftButt) && !isStructuralBone(bones.leftButt, bones) && !cachedGluteBonesL.current.includes(bones.leftButt!)) {
            if (cachedGluteBonesL.current.length === 0 || bones.leftButt!.name.toLowerCase().includes('def-')) {
                cachedGluteBonesL.current.push(bones.leftButt!);
            }
        }
        if (isBoneNotWeapon(bones.rightButt) && !isStructuralBone(bones.rightButt, bones) && !cachedGluteBonesR.current.includes(bones.rightButt!)) {
            if (cachedGluteBonesR.current.length === 0 || bones.rightButt!.name.toLowerCase().includes('def-')) {
                cachedGluteBonesR.current.push(bones.rightButt!);
            }
        }
        if (isBoneNotWeapon(bones.leftBreast) && !cachedBreastBonesL.current.includes(bones.leftBreast!)) cachedBreastBonesL.current.push(bones.leftBreast!);
        if (isBoneNotWeapon(bones.rightBreast) && !cachedBreastBonesR.current.includes(bones.rightBreast!)) cachedBreastBonesR.current.push(bones.rightBreast!);
    }, [bones]);

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
    const tempBodyQuat = useMemo(() => new THREE.Quaternion(), []);
    const tempVecBounce = useMemo(() => new THREE.Vector3(), []);
    const tempSurfaceA = useMemo(() => new THREE.Vector3(), []);
    const tempSurfaceB = useMemo(() => new THREE.Vector3(), []);
    const tempSurfaceC = useMemo(() => new THREE.Vector3(), []);
    const tempSurfaceQuat = useMemo(() => new THREE.Quaternion(), []);

    const updatePhysics = (delta: number) => {
        const hipsBone = bones.hips || bones.spine;
        if (hipsBone) {
            hipsBone.getWorldQuaternion(tempBodyQuat);
        }

        HITBOX_ZONES.forEach(zone => {
            const bone = bones[zone.boneTarget as keyof typeof bones];
            const hitbox = hitboxRefs.current[zone.id];
            if (hitbox && bone) {
                bone.getWorldPosition(tempVec);

                const quatToUse = (hipsBone && (isPMX || zone.type === 'sensory' || zone.id.includes('Breast') || zone.id.includes('Butt') || zone.id.includes('Knee') || zone.id.includes('Thigh') || zone.id === 'belly' || zone.id === 'vagina' || zone.id === 'anus'))
                    ? tempBodyQuat
                    : bone.getWorldQuaternion(tempWorldQuat);

                let [ox, oy, oz] = zone.offset;

                if (zone.id === 'leftBreast' && !hasDiscreteBreasts) {
                    [ox, oy, oz] = zone.fallbackOffset || [-0.09, -0.2, 0.12];
                } else if (zone.id === 'rightBreast' && !hasDiscreteBreasts) {
                    [ox, oy, oz] = zone.fallbackOffset || [0.09, -0.2, 0.12];
                } else if (zone.id === 'leftButt' && !hasDiscreteButt) {
                    [ox, oy, oz] = zone.fallbackOffset || [-0.15, -0.4, -0.10];
                } else if (zone.id === 'rightButt' && !hasDiscreteButt) {
                    [ox, oy, oz] = zone.fallbackOffset || [0.15, -0.4, -0.10];
                } else if (zone.id === 'vagina' && bones.vagina === bones.hips) {
                    [ox, oy, oz] = zone.fallbackOffset || [0, -0.5, 0.045];
                } else if (zone.id === 'anus' && bones.anus === bones.hips) {
                    [ox, oy, oz] = zone.fallbackOffset || [0, -0.5, -0.2];
                }

                tempVecOffset.set(ox, oy, oz);
                tempVecOffset.applyQuaternion(quatToUse);
                tempVec.add(tempVecOffset);

                hitbox.position.copy(tempVec);
                hitbox.quaternion.copy(quatToUse);
            }
        });

        if (!activeDrag.current) {
            Object.entries(offsets.current).forEach(([zoneId, offset]) => {
                offset.lerp(new THREE.Vector3(0, 0, 0), delta * 4.5);

                const hitbox = HITBOX_ZONES.find(z => z.id === zoneId);
                if (hitbox) {
                    const bone = (bones as any)[hitbox.boneTarget];
                    if (bone) {
                        const isPosSettled = !bone.userData.dragStartPos || (
                            bone.userData.velPos &&
                            bone.userData.velPos.lengthSq() < 0.00008 &&
                            bone.position.distanceToSquared(bone.userData.dragStartPos) < 0.00008
                        );

                        if (offset.lengthSq() < 0.0005 && isPosSettled) {
                            offset.set(0, 0, 0);

                            if (bone.userData.dragStartPos && !isStructuralBone(bone, bones)) {
                                bone.position.copy(bone.userData.dragStartPos);
                            }
                            if (bone.userData.baseScale && !isStructuralBone(bone, bones)) {
                                bone.scale.copy(bone.userData.baseScale);
                            }

                            if (!isStructuralBone(bone, bones)) {
                                bone.userData.dragStartQuat = null;
                                bone.userData.dragStartPos = null;
                                bone.userData.velPos = null;
                            }
                            return;
                        }

                        if (hitbox.type === 'pose' && bone.userData.dragStartQuat) {
                            const targetQuat = bone.userData.dragStartQuat.clone();
                            const eulerOffset = new THREE.Euler(offset.y * 2, offset.x * 2, 0);
                            targetQuat.multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                            bone.quaternion.slerp(targetQuat, 0.2);
                        }

                        const applyBounce = (b: THREE.Bone, isGlute: boolean, isBreast: boolean) => {
                            if (isStructuralBone(b, bones)) return;
                            if (b.userData.dragStartPos) {
                                if (!b.userData.velPos) b.userData.velPos = new THREE.Vector3();
                                const stiffness = (isGlute || isBreast) ? SENSORY_PHYSICS_CONFIG.bounceStiffness : 0.30;
                                const damping = (isGlute || isBreast) ? SENSORY_PHYSICS_CONFIG.bounceDamping : 0.85;

                                const force = tempVecBounce.subVectors(b.userData.dragStartPos, b.position).multiplyScalar(stiffness);

                                b.userData.velPos.add(force);
                                b.userData.velPos.multiplyScalar(damping);
                                b.position.add(b.userData.velPos);

                                if (b.userData.baseScale) {
                                    b.scale.lerp(b.userData.baseScale, SENSORY_PHYSICS_CONFIG.volumeRecoverSpeed);
                                }

                                if (offset.lengthSq() < 0.0005 && b.userData.velPos.lengthSq() < 0.00001) {
                                    b.position.copy(b.userData.dragStartPos);
                                    if (b.userData.baseScale) b.scale.copy(b.userData.baseScale);
                                    b.userData.dragStartQuat = null;
                                    b.userData.dragStartPos = null;
                                    b.userData.velPos = null;
                                }
                            }
                        };

                        const isGluteZone = zoneId === 'leftButt' || zoneId === 'rightButt';
                        const isBreastZone = zoneId === 'leftBreast' || zoneId === 'rightBreast';

                        if (isGluteZone) {
                            const bonesToBounce = zoneId === 'leftButt' ? cachedGluteBonesL.current : cachedGluteBonesR.current;
                            const usable = bonesToBounce.filter(b => !isStructuralBone(b, bones));
                            if (usable.length > 0) {
                                usable.forEach(b => applyBounce(b, true, false));
                            }
                        } else if (isBreastZone) {
                            const bonesToBounce = zoneId === 'leftBreast' ? cachedBreastBonesL.current : cachedBreastBonesR.current;
                            if (bonesToBounce.length > 0) {
                                bonesToBounce.forEach(b => applyBounce(b, false, true));
                            } else if (bone && !isStructuralBone(bone, bones)) {
                                applyBounce(bone, false, true);
                                if (bone.userData.dragStartQuat) {
                                    bone.quaternion.slerp(bone.userData.dragStartQuat, 0.25);
                                    if (offset.lengthSq() < 0.0005) {
                                        bone.quaternion.copy(bone.userData.dragStartQuat);
                                    }
                                }
                            }
                        } else if (bone && !isStructuralBone(bone, bones)) {
                            applyBounce(bone, false, false);
                        }
                    }
                }
            });
            return;
        }

        const { zone, isDragging } = activeDrag.current;
        if (!isDragging) return;

        if (zone.id === 'back') return;

        const offset = offsets.current[zone.id];
        const isRightClick = activeDrag.current.button === 2;
        const isSensory = zone.type === 'sensory';

        let activeBoneTarget = zone.boneTarget;
        if (zone.id === 'head') {
            activeBoneTarget = 'spine';
        }

        if (isRightClick || isSensory) {
            const isGlute = zone.id === 'leftButt' || zone.id === 'rightButt';
            const isBreast = zone.id === 'leftBreast' || zone.id === 'rightBreast';

            if (!isGlute && !isBreast) return;

            const bone = (bones as any)[activeBoneTarget];
            const refParent = (bone && bone.parent && !isStructuralBone(bone, bones))
                ? bone.parent
                : (bones.hips || bones.spine);

            const stretchLimit = SENSORY_PHYSICS_CONFIG.stretchLimit;

            const worldToLocal = refParent ? refParent.matrixWorld.clone().invert() : new THREE.Matrix4();
            const deltaWorld = new THREE.Vector3(
                offset.x * SENSORY_PHYSICS_CONFIG.dragMultiplier,
                -offset.y * SENSORY_PHYSICS_CONFIG.dragMultiplier,
                0
            ).applyQuaternion(camera.quaternion);
            const deltaPos = deltaWorld.transformDirection(worldToLocal);

            const rawLen = deltaPos.length();
            if (rawLen > 0.0001) {
                const normalized = Math.min(rawLen / stretchLimit, 1.0);
                const elasticCurve = Math.sin(normalized * Math.PI * 0.5);
                deltaPos.setLength(elasticCurve * stretchLimit);
            }

            const applyMolding = (targetBone: THREE.Bone) => {
                if (isStructuralBone(targetBone, bones)) return;
                if (!targetBone.userData.baseScale) {
                    targetBone.userData.baseScale = targetBone.scale.clone();
                }
                const pullFactor = Math.min(deltaPos.length() / (stretchLimit || 1), 1.0);
                const stretchZ = 1.0 + pullFactor * SENSORY_PHYSICS_CONFIG.stretchFactor;
                const squashXY = 1.0 - pullFactor * SENSORY_PHYSICS_CONFIG.squashFactor;

                targetBone.scale.set(
                    targetBone.userData.baseScale.x * squashXY,
                    targetBone.userData.baseScale.y * squashXY,
                    targetBone.userData.baseScale.z * stretchZ
                );
            };

            if (isGlute) {
                const targetBones = zone.id === 'leftButt' ? cachedGluteBonesL.current : cachedGluteBonesR.current;
                const usable = targetBones.filter(b => !isStructuralBone(b, bones));

                if (usable.length > 0) {
                    usable.forEach(child => {
                        if (!child.userData.dragStartPos) child.userData.dragStartPos = child.position.clone();
                        const localTarget = child.userData.dragStartPos.clone().add(deltaPos);
                        child.position.lerp(localTarget, 0.85);
                        applyMolding(child);
                    });
                } else if (bone && !isStructuralBone(bone, bones)) {
                    if (!bone.userData.dragStartPos) bone.userData.dragStartPos = bone.position.clone();
                    bone.position.lerp(bone.userData.dragStartPos.clone().add(deltaPos), 0.85);
                    applyMolding(bone);
                } else {
                    // Sin hueso de nalga: solo jiggle. Nunca rotar/mover hips (arranca la pierna).
                    window.dispatchEvent(new CustomEvent('nova-jiggle-trigger', {
                        detail: { part: zone.id }
                    }));
                }
            } else if (isBreast) {
                const targetBones = zone.id === 'leftBreast' ? cachedBreastBonesL.current : cachedBreastBonesR.current;
                if (targetBones.length > 0) {
                    targetBones.forEach(child => {
                        if (isStructuralBone(child, bones)) return;
                        if (!child.userData.dragStartPos) child.userData.dragStartPos = child.position.clone();
                        const localTarget = child.userData.dragStartPos.clone().add(deltaPos);
                        child.position.lerp(localTarget, 0.85);
                        applyMolding(child);
                    });
                } else if (bone && !isStructuralBone(bone, bones)) {
                    if (!bone.userData.dragStartPos) bone.userData.dragStartPos = bone.position.clone();
                    const targetPos = bone.userData.dragStartPos.clone().add(deltaPos);
                    bone.position.lerp(targetPos, 0.85);
                    applyMolding(bone);
                } else if (bone) {
                    if (!bone.userData.dragStartQuat) bone.userData.dragStartQuat = bone.quaternion.clone();
                    const tiltEuler = new THREE.Euler(
                        deltaPos.y * 0.4,
                        (zone.id === 'leftBreast' ? -1 : 1) * Math.abs(deltaPos.x) * 0.3,
                        0
                    );
                    const targetQuat = bone.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(tiltEuler));
                    bone.quaternion.slerp(targetQuat, 0.35);
                }
            }
        } else {
            if (zone.id === 'head' || zone.id === 'hair') {
                const bone = (bones as any)[activeBoneTarget];
                if (bone && bone.userData.dragStartQuat && bone.userData.dragStartPos) {
                    const eulerOffset = new THREE.Euler(offset.y * 2.5, offset.x * 2.5, 0);
                    const targetQuat = bone.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                    bone.quaternion.slerp(targetQuat, 0.3);
                }
            }
            else if (zone.id === 'hips') {
                const bone = (bones as any)[zone.boneTarget];
                if (bone && bone.userData.dragStartQuat && bone.userData.dragStartPos) {
                    const eulerOffset = new THREE.Euler(-offset.y * 1.5, offset.x * 1.5, 0);
                    const targetQuat = bone.userData.dragStartQuat.clone().multiply(new THREE.Quaternion().setFromEuler(eulerOffset));
                    bone.quaternion.slerp(targetQuat, 0.3);

                    const dragWorldPos = new THREE.Vector3();
                    bone.getWorldPosition(dragWorldPos);
                    dragWorldPos.x += offset.x * 0.25;
                    dragWorldPos.y -= offset.y * 0.25;
                    dragWorldPos.z -= (offset.x * 0.1);

                    const targetLocalPos = bone.parent ? bone.parent.worldToLocal(dragWorldPos) : dragWorldPos;
                    const localDelta = targetLocalPos.clone().sub(bone.userData.dragStartPos);
                    localDelta.clampLength(0, 0.5);

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

    const handlePointerDown = (e: any, zone: typeof HITBOX_ZONES[0]) => {
        const bone = bones[zone.boneTarget as keyof typeof bones];
        const isButtZone = zone.id === 'leftButt' || zone.id === 'rightButt';
        if (!bone && !isButtZone) return;
        e.stopPropagation();

        if (currentTool === 'whip' || currentTool === 'bat' || currentTool === 'dildo') {
            if (onInteract) onInteract(zone.id, 'hit' as any, zone.type, currentTool);
            return;
        }

        if (bone) {
            if (!bone.userData.dragStartQuat) bone.userData.dragStartQuat = bone.quaternion.clone();
            if (!isStructuralBone(bone, bones) && !bone.userData.dragStartPos) bone.userData.dragStartPos = bone.position.clone();
            if (!isStructuralBone(bone, bones) && !bone.userData.baseScale) bone.userData.baseScale = bone.scale.clone();
        }

        if (zone.id === 'leftButt' || zone.id === 'rightButt') {
            const targetBones = zone.id === 'leftButt' ? cachedGluteBonesL.current : cachedGluteBonesR.current;
            targetBones.forEach(b => {
                if (isStructuralBone(b, bones)) return;
                if (!b.userData.dragStartPos) b.userData.dragStartPos = b.position.clone();
                if (!b.userData.dragStartQuat) b.userData.dragStartQuat = b.quaternion.clone();
                if (!b.userData.baseScale) b.userData.baseScale = b.scale.clone();
            });
        } else if (zone.id === 'leftBreast' || zone.id === 'rightBreast') {
            const targetBones = zone.id === 'leftBreast' ? cachedBreastBonesL.current : cachedBreastBonesR.current;
            targetBones.forEach(b => {
                if (!b.userData.dragStartPos) b.userData.dragStartPos = b.position.clone();
                if (!b.userData.dragStartQuat) b.userData.dragStartQuat = b.quaternion.clone();
                if (!b.userData.baseScale) b.userData.baseScale = b.scale.clone();
            });
        }

        const stateControls = controls as any;
        if (stateControls) stateControls.enabled = false;

        activeDrag.current = { zone, isDragging: true, button: e.button };

        const onWindowMove = (ev: PointerEvent) => {
            if (!activeDrag.current || !activeDrag.current.isDragging) return;
            const curZone = activeDrag.current.zone;
            if (!curZone || curZone.id === 'back') return;

            const off = offsets.current[curZone.id];
            if (off) {
                const deltaX = ev.movementX || 0;
                const deltaY = ev.movementY || 0;
                const sensitivity = dragSensitivity;

                off.x += deltaX * sensitivity;
                off.y += deltaY * sensitivity;

                const limit = curZone.type === 'sensory' ? Math.max(2.5, maxAngle / 20) : (maxAngle / 50);
                off.x = Math.max(-limit, Math.min(limit, off.x));
                off.y = Math.max(-limit, Math.min(limit, off.y));
            }
        };

        const onWindowUp = () => {
            window.removeEventListener('pointermove', onWindowMove);
            window.removeEventListener('pointerup', onWindowUp);
            window.removeEventListener('pointercancel', onWindowUp);

            const dragState = activeDrag.current;
            if (dragState && dragState.isDragging) {
                activeDrag.current = null;
                const sc = controls as any;
                if (sc) sc.enabled = true;

                if (onInteract && dragState.zone) {
                    onInteract(dragState.zone.id, 'release', dragState.zone.type);
                }
            }
        };

        window.addEventListener('pointermove', onWindowMove, { passive: true });
        window.addEventListener('pointerup', onWindowUp, { passive: true });
        window.addEventListener('pointercancel', onWindowUp, { passive: true });

        if (onInteract) onInteract(zone.id, 'grab', zone.type, currentTool);
    };

    const handleSurfacePointerDown = (e: any) => {
        if (activeDrag.current && activeDrag.current.isDragging) return;
        if (!e.point) return;

        const clickPoint = e.point as THREE.Vector3;
        const hipsBone = bones.hips || bones.spine;
        if (hipsBone) {
            hipsBone.getWorldQuaternion(tempBodyQuat);
            hipsBone.getWorldPosition(tempSurfaceA);
        } else {
            tempSurfaceA.set(0, 0, 0);
        }

        const relVec = tempSurfaceB.subVectors(clickPoint, tempSurfaceA);
        const bodyInvQuat = tempSurfaceQuat.copy(tempBodyQuat).invert();
        const relLocal = tempSurfaceC.copy(relVec).applyQuaternion(bodyInvQuat);

        let bestZoneId = 'head';

        if (relLocal.y > 0.48) {
            if (relLocal.z > 0.07 && relLocal.y < 0.68) {
                bestZoneId = 'mouth';
            } else if (relLocal.z < -0.06) {
                bestZoneId = 'hair';
            } else {
                bestZoneId = 'head';
            }
        } else if (relLocal.y >= 0.12 && relLocal.y <= 0.48 && relLocal.z > 0.015) {
            bestZoneId = relLocal.x < 0 ? 'leftBreast' : 'rightBreast';
        } else if (relLocal.y > -0.05 && relLocal.y < 0.14 && relLocal.z > 0.02) {
            bestZoneId = 'belly';
        } else if (relLocal.y >= -0.34 && relLocal.y <= 0.12 && relLocal.z < -0.012) {
            bestZoneId = relLocal.x < 0 ? 'leftButt' : 'rightButt';
        } else if (relLocal.y >= -0.22 && relLocal.y <= -0.05 && Math.abs(relLocal.x) < 0.075) {
            bestZoneId = relLocal.z >= -0.02 ? 'vagina' : 'anus';
        } else if (relLocal.y < -0.20) {
            if (relLocal.z < -0.015 && relLocal.y >= -0.35) {
                bestZoneId = relLocal.x < 0 ? 'leftButt' : 'rightButt';
            } else {
                const isL = relLocal.x < 0;
                if (relLocal.y > -0.52) {
                    bestZoneId = isL ? 'leftThigh' : 'rightThigh';
                } else if (relLocal.y > -0.85) {
                    bestZoneId = isL ? 'leftKnee' : 'rightKnee';
                } else {
                    bestZoneId = isL ? 'leftFoot' : 'rightFoot';
                }
            }
        } else if (Math.abs(relLocal.x) > 0.18) {
            const isL = relLocal.x < 0;
            if (relLocal.y < 0.0) {
                bestZoneId = isL ? 'leftHand' : 'rightHand';
            } else if (relLocal.y < 0.25) {
                bestZoneId = isL ? 'leftForeArm' : 'rightForeArm';
            } else {
                bestZoneId = isL ? 'leftArm' : 'rightArm';
            }
        } else {
            bestZoneId = relLocal.z > 0 ? (relLocal.x < 0 ? 'leftBreast' : 'rightBreast') : (relLocal.x < 0 ? 'leftButt' : 'rightButt');
        }

        const matchedZone = HITBOX_ZONES.find(z => z.id === bestZoneId);
        if (matchedZone) {
            handlePointerDown(e, matchedZone);
        }
    };

    const lastTickTime = useRef(0);
    useFrame((_, delta) => {
        const now = performance.now();
        if (now - lastTickTime.current < 2) return;
        lastTickTime.current = now;
        updatePhysics(delta);
    });

    useImperativeHandle(ref, () => ({
        updatePhysics,
        resetPhysics: () => {
            Object.values(offsets.current).forEach(o => o.set(0, 0, 0));
        },
        getOffset: (zoneId: string) => offsets.current[zoneId] || null,
        handleSurfacePointerDown
    }));

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
                            renderOrder={showDebugZones ? 9999 : 0}
                            onPointerDown={(e: any) => handlePointerDown(e, zone)}
                            onContextMenu={(e: any) => e.stopPropagation()}
                        >
                            <sphereGeometry args={[zone.radius, 16, 16]} />
                            <meshBasicMaterial
                                visible={true}
                                colorWrite={Boolean(showDebugZones)}
                                transparent={true}
                                opacity={showDebugZones ? 0.45 : 0.0}
                                depthTest={false}
                                depthWrite={false}
                                color={
                                    zone.id.includes('Breast') ? '#f43f5e' :
                                        zone.id.includes('Butt') ? '#a855f7' :
                                            zone.id === 'vagina' ? '#ec4899' :
                                                zone.id === 'anus' ? '#d946ef' :
                                                    zone.id === 'belly' ? '#f59e0b' :
                                                        zone.type === 'sensory' ? '#eab308' : '#06b6d4'
                                }
                            />
                            {showDebugZones && (
                                <mesh renderOrder={10000}>
                                    <sphereGeometry args={[zone.radius * 1.002, 14, 14]} />
                                    <meshBasicMaterial
                                        wireframe={true}
                                        transparent={true}
                                        opacity={0.85}
                                        depthTest={false}
                                        depthWrite={false}
                                        color={
                                            zone.id.includes('Breast') ? '#fda4af' :
                                                zone.id.includes('Butt') ? '#d8b4fe' :
                                                    zone.id === 'vagina' ? '#f472b6' :
                                                        zone.id === 'anus' ? '#e879f9' :
                                                            zone.id === 'belly' ? '#fde68a' :
                                                                zone.type === 'sensory' ? '#fef08a' : '#67e8f9'
                                        }
                                    />
                                </mesh>
                            )}
                        </mesh>
                    </group>
                );
            })}
        </group>
    );
});
