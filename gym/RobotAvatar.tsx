/**
 * gym/RobotAvatar.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Avatar InMoov — Animación directa de huesos.
 *
 * CARACTERÍSTICAS CLAVE:
 *  - Carga el GLB con query param '?gym=true' para aislamiento completo.
 *  - Desactiva el Frustum Culling en todas las mallas para evitar que desaparezca
 *    la ropa, falda o pelo del modelo al girar o alejar la cámara.
 *  - Autocalibra la altura y mide la distancia hips-to-foot de forma relativa.
 */

import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import { RigidBody, CuboidCollider, RapierRigidBody } from '@react-three/rapier';
import { useGLTF } from '@react-three/drei';
import * as THREE from 'three';
import { JointCommand, JointName, TelemetryFrame, INMOOV_JOINT_LIMITS } from './types/gym.types';
import { useGymTelemetry } from './hooks/useGymTelemetry';

// ─────────────────────────────────────────────────────────────────────────────
const DAMPING_PER_SEC = 0.4;   // Amortiguación angular
const MAX_VEL        = 6.0;    // Velocidad máxima
const TORQUE_SCALE   = 0.04;   // Fuerza del torque
const LIMITS         = INMOOV_JOINT_LIMITS;

interface RobotAvatarProps {
  commandQueueRef: React.MutableRefObject<JointCommand[]>;
  onTelemetry: (frame: TelemetryFrame) => void;
  initialPosition?: [number, number, number];
  activeModelUrl?: string;
}

interface JS { angle: number; velocity: number; torque: number; }
const mkJS = (): JS => ({ angle: 0, velocity: 0, torque: 0 });

// Ejes de rotación por articulación
const AXES: Partial<Record<JointName, THREE.Vector3>> = {
  neck_yaw:         new THREE.Vector3(0, 1, 0),
  neck_pitch:       new THREE.Vector3(1, 0, 0),
  torso_rotation:   new THREE.Vector3(0, 1, 0),
  l_shoulder_pitch: new THREE.Vector3(1, 0, 0),
  l_shoulder_yaw:   new THREE.Vector3(0, 0, 1),
  l_elbow:          new THREE.Vector3(1, 0, 0),
  l_wrist:          new THREE.Vector3(0, 0, 1),
  l_thumb: new THREE.Vector3(1,0,0), l_index: new THREE.Vector3(1,0,0),
  l_middle:new THREE.Vector3(1,0,0), l_ring:  new THREE.Vector3(1,0,0),
  l_pinky: new THREE.Vector3(1,0,0),
  r_shoulder_pitch: new THREE.Vector3(1, 0, 0),
  r_shoulder_yaw:   new THREE.Vector3(0, 0,-1),
  r_elbow:          new THREE.Vector3(1, 0, 0),
  r_wrist:          new THREE.Vector3(0, 0, 1),
  r_thumb: new THREE.Vector3(1,0,0), r_index: new THREE.Vector3(1,0,0),
  r_middle:new THREE.Vector3(1,0,0), r_ring:  new THREE.Vector3(1,0,0),
  r_pinky: new THREE.Vector3(1,0,0),
  left_hip:    new THREE.Vector3(1,0,0), right_hip:   new THREE.Vector3(1,0,0),
  left_knee:   new THREE.Vector3(1,0,0), right_knee:  new THREE.Vector3(1,0,0),
  left_ankle:  new THREE.Vector3(1,0,0), right_ankle: new THREE.Vector3(1,0,0),
};

// ─────────────────────────────────────────────────────────────────────────────

export default function RobotAvatar({
  commandQueueRef, onTelemetry,
  initialPosition = [0, 0.02, 0],
  activeModelUrl = '/models/grokani_lipsync.glb',
}: RobotAvatarProps) {
  const { buildTelemetryFrame, resetEpisode } = useGymTelemetry();
  
  // Aislamiento mediante query param
  const gymModelUrl = useMemo(() => {
    return `${activeModelUrl}?gym=true`;
  }, [activeModelUrl]);

  const { scene, animations } = useGLTF(gymModelUrl) as any;

  // ── DESACTIVAR FRUSTUM CULLING ─────────────────────────────────────────────
  // Esto evita que las mallas del pelo, falda o extremidades desaparezcan (culling)
  // al rotar la cámara fuera del bounding box inicial del modelo.
  useEffect(() => {
    scene.traverse((node: THREE.Object3D) => {
      if ((node as any).isMesh) {
        node.frustumCulled = false;
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });
  }, [scene]);

  // Detener animaciones automáticas en este modelo
  useEffect(() => {
    if (animations && animations.length > 0) {
      const mixer = new THREE.AnimationMixer(scene);
      mixer.stopAllAction();
    }
  }, [scene, animations]);

  // Encontrar huesos en la escena aislada
  const bones = useMemo(() => {
    const all: { name: string; bone: THREE.Bone }[] = [];
    scene.traverse((n: THREE.Object3D) => {
      if ((n as any).isBone || n.type === 'Bone') {
        all.push({ name: n.name, bone: n as THREE.Bone });
      }
    });

    const findBone = (side: 'l' | 'r' | null, keywords: string[], exclude: string[] = []) => {
      const globalExclude = ['twist', 'ik', 'skirt', 'cloth', 'spring', 'phys', 'helper', 'collider', 'tie', 'hair'];
      return all.find(({ name }) => {
        const nl = name.toLowerCase();
        
        if (side === 'l') {
          const isL = nl.includes('left') || nl.includes('_l_') || nl.includes('.l') || nl.startsWith('l') || nl.includes('mixamorigleft');
          if (!isL) return false;
        } else if (side === 'r') {
          const isR = nl.includes('right') || nl.includes('_r_') || nl.includes('.r') || nl.startsWith('r') || nl.includes('mixamorigright');
          if (!isR) return false;
        }

        if (globalExclude.some(ex => nl.includes(ex))) return false;
        if (exclude.some(ex => nl.includes(ex))) return false;
        return keywords.some(kw => nl.includes(kw));
      })?.bone ?? null;
    };

    const mappedBones = {
      hips:       findBone(null, ['hips', 'pelvis', 'root']),
      spine:      findBone(null, ['spine', 'torso'], ['1', '2', 'chest']),
      neck:       findBone(null, ['neck']),
      head:       findBone(null, ['head']),
      lShoulder:  findBone('l', ['shoulder', 'clavicle']),
      rShoulder:  findBone('r', ['shoulder', 'clavicle']),
      lUpperArm:  findBone('l', ['upperarm', 'uparm', 'arm'], ['fore', 'lower', 'hand', 'shoulder']),
      lForearm:   findBone('l', ['forearm', 'lowerarm', 'fore', 'arm'], ['upper', 'up', 'shoulder', 'hand']),
      lHand:      findBone('l', ['hand'], ['thumb', 'index', 'middle', 'ring', 'pinky', 'arm']),
      rUpperArm:  findBone('r', ['upperarm', 'uparm', 'arm'], ['fore', 'lower', 'hand', 'shoulder']),
      rForearm:   findBone('r', ['forearm', 'lowerarm', 'fore', 'arm'], ['upper', 'up', 'shoulder', 'hand']),
      rHand:      findBone('r', ['hand'], ['thumb', 'index', 'middle', 'ring', 'pinky', 'arm']),
      lThumb:     findBone('l', ['thumb']),
      lIndex:     findBone('l', ['index']),
      lMiddle:    findBone('l', ['middle']),
      lRing:      findBone('l', ['ring']),
      lPinky:     findBone('l', ['pinky', 'little']),
      rThumb:     findBone('r', ['thumb']),
      rIndex:     findBone('r', ['index']),
      rMiddle:    findBone('r', ['middle']),
      rRing:      findBone('r', ['ring']),
      rPinky:     findBone('r', ['pinky', 'little']),
      leftThigh:  findBone('l', ['thigh', 'upleg', 'upper_leg']),
      leftShin:   findBone('l', ['shin', 'leg', 'lower_leg'], ['up']),
      leftFoot:   findBone('l', ['foot']),
      rightThigh: findBone('r', ['thigh', 'upleg', 'upper_leg']),
      rightShin:  findBone('r', ['shin', 'leg', 'lower_leg'], ['up']),
      rightFoot:  findBone('r', ['foot']),
    };

    console.log("🦴 HUESOS ENCONTRADOS EN GYM AVATAR:", 
      Object.entries(mappedBones)
        .filter(([_, val]) => val !== null)
        .map(([key, val]) => `${key} -> ${(val as any).name}`)
    );

    return mappedBones;
  }, [scene]);

  // Autocalibración de altura
  const yOffset = useMemo(() => {
    let offset = 0;
    if (bones.leftFoot || bones.rightFoot) {
      const foot = bones.leftFoot || bones.rightFoot;
      const footWorldPos = new THREE.Vector3();
      scene.updateMatrixWorld(true);
      foot.getWorldPosition(footWorldPos);
      offset = -footWorldPos.y;
    }
    return offset;
  }, [bones, scene]);

  // Quaterniones de reposo
  const restQ = useMemo(() => {
    const q: Record<string, THREE.Quaternion> = {};
    Object.entries(bones).forEach(([k, b]) => { if (b) q[k] = b.quaternion.clone(); });
    return q;
  }, [bones]);

  // Estado de joints
  const js = useRef<Record<JointName, JS>>({
    neck_yaw: mkJS(), neck_pitch: mkJS(), torso_rotation: mkJS(),
    l_shoulder_pitch: mkJS(), l_shoulder_yaw: mkJS(), l_elbow: mkJS(), l_wrist: mkJS(),
    l_thumb: mkJS(), l_index: mkJS(), l_middle: mkJS(), l_ring: mkJS(), l_pinky: mkJS(),
    r_shoulder_pitch: mkJS(), r_shoulder_yaw: mkJS(), r_elbow: mkJS(), r_wrist: mkJS(),
    r_thumb: mkJS(), r_index: mkJS(), r_middle: mkJS(), r_ring: mkJS(), r_pinky: mkJS(),
    left_hip: mkJS(), right_hip: mkJS(),
    left_knee: mkJS(), right_knee: mkJS(),
    left_ankle: mkJS(), right_ankle: mkJS(),
  });

  const isInitializedRef = useRef(false);
  const torsoRef = useRef<RapierRigidBody>(null);
  const qTmp = useMemo(() => new THREE.Quaternion(), []);

  const J2B: Partial<Record<JointName, string>> = {
    neck_yaw: 'neck', neck_pitch: 'head', torso_rotation: 'spine',
    l_shoulder_pitch: 'lUpperArm', l_shoulder_yaw: 'lShoulder', l_elbow: 'lForearm', l_wrist: 'lHand',
    l_thumb: 'lThumb', l_index: 'lIndex', l_middle: 'lMiddle', l_ring: 'lRing', l_pinky: 'lPinky',
    r_shoulder_pitch: 'rUpperArm', r_shoulder_yaw: 'rShoulder', r_elbow: 'rForearm', r_wrist: 'rHand',
    r_thumb: 'rThumb', r_index: 'rIndex', r_middle: 'rMiddle', r_ring: 'rRing', r_pinky: 'rPinky',
    left_hip: 'leftThigh', right_hip: 'rightThigh',
    left_knee: 'leftShin', right_knee: 'rightShin',
    left_ankle: 'leftFoot', right_ankle: 'rightFoot',
  };

  const renderPosition = useMemo(() => {
    return [initialPosition[0], initialPosition[1] + yOffset, initialPosition[2]] as [number, number, number];
  }, [initialPosition, yOffset]);

  // Frame Loop
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05);
    const states = js.current;

    // Procesar comandos
    const queue = commandQueueRef.current;
    while (queue.length > 0) {
      const cmd = queue.shift()!;
      if (cmd.action === 'apply_torque' && cmd.joint && cmd.value !== undefined) {
        const s = states[cmd.joint];
        if (s) {
          s.velocity = Math.max(-MAX_VEL, Math.min(MAX_VEL, s.velocity + cmd.value * TORQUE_SCALE));
          s.torque = cmd.value;
        }
      } else if (cmd.action === 'set_angle' && cmd.joint && cmd.value !== undefined) {
        const s = states[cmd.joint];
        if (s) {
          const lim = LIMITS[cmd.joint];
          s.angle = lim ? Math.max(lim.lower, Math.min(lim.upper, cmd.value)) : cmd.value;
          s.velocity = 0;
          s.torque = 0;
        }
      } else if (cmd.action === 'reset_robot') {
        (Object.keys(states) as JointName[]).forEach(k => {
          states[k].angle = 0; states[k].velocity = 0; states[k].torque = 0;
        });
        isInitializedRef.current = false;
        resetEpisode();
      }
    }

    // Integrar velocidades
    const dampFactor = Math.pow(DAMPING_PER_SEC, dt);
    (Object.keys(states) as JointName[]).forEach(name => {
      const s = states[name];
      if (Math.abs(s.velocity) < 0.001) return;
      s.velocity *= dampFactor;
      s.angle += s.velocity * dt;

      const lim = LIMITS[name];
      if (lim) {
        if (s.angle < lim.lower) { s.angle = lim.lower; s.velocity *= -0.2; }
        if (s.angle > lim.upper) { s.angle = lim.upper; s.velocity *= -0.2; }
      }
    });

    // Aplicar transformaciones a los huesos
    (Object.keys(J2B) as JointName[]).forEach(jName => {
      const boneName = J2B[jName]!;
      const bone = (bones as any)[boneName] as THREE.Bone | null;
      if (!bone) return;

      const axis  = AXES[jName];
      const angle = states[jName].angle;
      const rq = restQ[boneName];

      if (!axis || Math.abs(angle) < 0.0005) {
        if (rq) bone.quaternion.copy(rq);
        return;
      }

      qTmp.setFromAxisAngle(axis, angle);
      if (rq) bone.quaternion.copy(rq).multiply(qTmp);
      else     bone.quaternion.copy(qTmp);
    });

    scene.updateMatrixWorld(true);

    // Altura relativa
    let worldY = 1.0;
    if (bones.hips && (bones.leftFoot || bones.rightFoot)) {
      const hipsWP = new THREE.Vector3();
      const footWP = new THREE.Vector3();
      bones.hips.getWorldPosition(hipsWP);
      const foot = bones.leftFoot || bones.rightFoot;
      foot.getWorldPosition(footWP);
      worldY = Math.max(0.0, hipsWP.y - footWP.y);
    }
    
    if (worldY > 0.4) isInitializedRef.current = true;
    const done = isInitializedRef.current && worldY < 0.15;

    // Telemetría
    const pos = scene.position;
    const frame = buildTelemetryFrame({
      torsoPosition:    new THREE.Vector3(pos.x, worldY, pos.z),
      torsoOrientation: new THREE.Quaternion(0, 0, 0, 1),
      torsoLinearVel:   new THREE.Vector3(0, 0, 0),
      torsoAngularVel:  new THREE.Vector3(0, 0, 0),
      joints: (Object.keys(states) as JointName[]).map(n => ({
        name: n, angle: states[n].angle,
        velocity: states[n].velocity, lastTorque: states[n].torque,
      })),
      done,
    });
    onTelemetry(frame);
  });

  return (
    <>
      <primitive object={scene} position={renderPosition} />
      <RigidBody ref={torsoRef} type="kinematicPosition" position={renderPosition} colliders={false}>
        <CuboidCollider args={[0.25, 0.05, 0.25]} />
      </RigidBody>
    </>
  );
}
