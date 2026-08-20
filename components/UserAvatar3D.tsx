import React, { useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import * as THREE from 'three';

interface UserAvatar3DProps {
  handPos?: { x: number; y: number; isPinching: boolean; gesture: string } | null;
  activeTool?: string;
  isHotMode?: boolean;
}

export const UserAvatar3D: React.FC<UserAvatar3DProps> = ({ handPos, activeTool = 'hand', isHotMode = false }) => {
  const { camera, size } = useThree();
  const leftHandMeshRef = useRef<THREE.Group>(null);
  const penisMeshRef = useRef<THREE.Group>(null);
  const cumParticlesRef = useRef<THREE.Points>(null);

  // Estado de eyaculación (venida)
  const isCummingRef = useRef<boolean>(false);
  const cumTimeRef = useRef<number>(0);

  const tongueMeshRef = useRef<THREE.Group>(null);
  const lastRaycastTimeRef = useRef<number>(0);

  useFrame((state, delta) => {
    const t = state.clock.getElapsedTime();

    // 1. Mover mano 3D si hay tracking por cámara y emitir interacciones 3D continuas con el modelo de Nova
    if (handPos && leftHandMeshRef.current) {
      const vec = new THREE.Vector3();
      const pos = new THREE.Vector3();
      vec.set((handPos.x / size.width) * 2 - 1, -(handPos.y / size.height) * 2 + 1, 0.5);
      vec.unproject(camera);
      vec.sub(camera.position).normalize();
      pos.copy(camera.position).add(vec.multiplyScalar(2.2));
      leftHandMeshRef.current.position.lerp(pos, 0.3);

      // Raycasting optimizado con Throttle (solo 15 veces por segundo para mantener 60+ FPS fluidos en WebGL)
      const now = performance.now();
      if (!lastRaycastTimeRef.current) lastRaycastTimeRef.current = 0;

      if (now - lastRaycastTimeRef.current > 65) {
        lastRaycastTimeRef.current = now;
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(
          new THREE.Vector2((handPos.x / size.width) * 2 - 1, -(handPos.y / size.height) * 2 + 1),
          camera
        );
        const intersects = raycaster.intersectObjects(state.scene.children, true);
        if (intersects.length > 0) {
          const hit = intersects[0];
          if (hit.object) {
            const hitName = hit.object.name || '';
            let targetPart = 'leftBreast';
            if (hitName.toLowerCase().includes('breast.l') || hitName.toLowerCase().includes('breast_l')) targetPart = 'leftBreast';
            else if (hitName.toLowerCase().includes('breast.r') || hitName.toLowerCase().includes('breast_r')) targetPart = 'rightBreast';
            else if (hitName.toLowerCase().includes('butt') || hitName.toLowerCase().includes('ass') || hitName.toLowerCase().includes('glute')) targetPart = 'leftButt';
            else if (hitName.toLowerCase().includes('head') || hitName.toLowerCase().includes('face') || hitName.toLowerCase().includes('mouth')) targetPart = 'mouth';

            // 1. Físicas de rebote suave en tiempo real
            window.dispatchEvent(new CustomEvent('nova-jiggle-trigger', {
              detail: {
                part: targetPart,
                tool: activeTool,
                isPinching: handPos.isPinching,
                screenX: handPos.x,
                screenY: handPos.y
              }
            }));

            // 2. Diálogo con Nova: SOLO si el usuario realiza un PINCH voluntario e intencionado con los dedos
            if (handPos.isPinching === true) {
              window.dispatchEvent(new CustomEvent('nova-physical-interaction', {
                detail: {
                  part: targetPart,
                  action: 'grab',
                  isBoldMode: isHotMode,
                  tool: activeTool
                }
              }));
            }
          }
        }
      }
    }

    // 2. LENGUA 3D INDEPENDIENTE (Sincronizada con el movimiento)
    if (tongueMeshRef.current) {
      const isTongueActive = activeTool === 'tongue' || handPos?.gesture.includes('LENGUA');
      tongueMeshRef.current.visible = isTongueActive;
      if (isTongueActive && handPos) {
        const vec = new THREE.Vector3((handPos.x / size.width) * 2 - 1, -(handPos.y / size.height) * 2 + 1, 0.5);
        vec.unproject(camera);
        vec.sub(camera.position).normalize();
        
        // Auto-alinear 3D hacia la cara/senos de Nova
        const tongueTargetPos = camera.position.clone().add(vec.multiplyScalar(2.05));
        tongueMeshRef.current.position.lerp(tongueTargetPos, 0.4);

        // Animación fluida de vaivén de lengüetazo en tiempo real
        tongueMeshRef.current.rotation.x = Math.sin(t * 14) * 0.4;
        tongueMeshRef.current.rotation.y = Math.cos(t * 7) * 0.15;
      }
    }

    // 3. MIEMBRO 3D (Visibilidad condicional: Solo si el usuario lo selecciona o se detecta 1 mano/cuerpo sin tapar con las 2 manos)
    if (penisMeshRef.current) {
      const gesture = handPos?.gesture || '';
      const isPenisToolSelected = activeTool === 'penis';
      // Si el usuario usa 2 MANOS DUALES, ocultar el miembro 3D automáticamente a menos que esté seleccionada la herramienta
      const isDualHands = gesture.includes('DOS MANOS') || gesture.includes('DUAL');
      const isEroticJobActive = (gesture.includes('MIEMBRO') || gesture.includes('BJ')) && !isDualHands;
      const shouldShowPenis = isPenisToolSelected || isEroticJobActive;

      penisMeshRef.current.visible = shouldShowPenis;

      if (shouldShowPenis) {
        let targetPos = new THREE.Vector3(0, 1.45, 0.45);
        let targetRotation = new THREE.Euler(Math.PI / 2, 0, 0);

        if (handPos) {
          // Si el usuario mueve la mano/cuerpo en la cámara AR, el miembro 3D SIGUE EL MOVIMIENTO EN TIEMPO REAL
          const vec = new THREE.Vector3((handPos.x / size.width) * 2 - 1, -(handPos.y / size.height) * 2 + 1, 0.5);
          vec.unproject(camera);
          vec.sub(camera.position).normalize();
          targetPos.copy(camera.position).add(vec.multiplyScalar(2.0));
        }

        // Auto-alineación sutil a las zonas sensibles de Nova mientras se mueve a ritmo
        if (gesture.includes('BOCA') || gesture.includes('LENGUA')) {
          const strokeOffset = Math.sin(t * 9) * 0.08;
          targetPos.set(targetPos.x * 0.3, 1.55, 0.30 + strokeOffset);
        } else if (gesture.includes('PECHO') || gesture.includes('SENOS')) {
          const strokeOffset = Math.sin(t * 9) * 0.07;
          targetPos.set(targetPos.x * 0.3, 1.35 + Math.cos(t * 9) * 0.02, 0.30 + strokeOffset);
        } else if (gesture.includes('GLÚTEO') || gesture.includes('ANAL')) {
          const strokeOffset = Math.sin(t * 10) * 0.09;
          targetPos.set(targetPos.x * 0.3, 1.05, -0.26 - strokeOffset);
        }

        penisMeshRef.current.position.lerp(targetPos, 0.35);
        penisMeshRef.current.rotation.x = THREE.MathUtils.lerp(penisMeshRef.current.rotation.x, targetRotation.x, 0.3);
        penisMeshRef.current.rotation.y = THREE.MathUtils.lerp(penisMeshRef.current.rotation.y, targetRotation.y, 0.3);
        penisMeshRef.current.rotation.z = THREE.MathUtils.lerp(penisMeshRef.current.rotation.z, targetRotation.z, 0.3);
      }
    }
  });

  const cumParticlesCount = 60;
  const cumPositions = new Float32Array(cumParticlesCount * 3);
  for (let i = 0; i < cumParticlesCount * 3; i += 3) {
    cumPositions[i] = (Math.random() - 0.5) * 0.1;
    cumPositions[i + 1] = Math.random() * 0.1;
    cumPositions[i + 2] = Math.random() * 0.2;
  }

  return (
    <group>
      {/* 1. MODELO 3D DE LAS MANOS DEL USUARIO */}
      <group ref={leftHandMeshRef} visible={!!handPos}>
        <mesh castShadow receiveShadow>
          <boxGeometry args={[0.12, 0.14, 0.04]} />
          <meshStandardMaterial color="#fcd34d" roughness={0.3} metalness={0.1} />
        </mesh>
        <mesh position={[0, 0.09, -0.02]} rotation={[handPos?.isPinching ? 0.8 : 0.1, 0, 0]}>
          <capsuleGeometry args={[0.015, 0.08, 8, 16]} />
          <meshStandardMaterial color="#fbbf24" roughness={0.3} />
        </mesh>
      </group>

      {/* 2. LENGUA 3D DEL USUARIO */}
      <group ref={tongueMeshRef} visible={false}>
        <mesh castShadow>
          <coneGeometry args={[0.035, 0.14, 16]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.15} />
        </mesh>
      </group>

      {/* 2. MIEMBRO VIRIL 3D CON AUTO-POSICIONAMIENTO RÍTMICO Y EYACULACIÓN 3D */}
      <group ref={penisMeshRef} visible={false}>
        {/* Cuerpo del miembro 3D */}
        <mesh position={[0, 0, 0.15]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <cylinderGeometry args={[0.034, 0.037, 0.34, 32]} />
          <meshStandardMaterial color="#fda4af" roughness={0.3} />
        </mesh>
        {/* Glande 3D */}
        <mesh position={[0, 0, 0.32]} rotation={[Math.PI / 2, 0, 0]} castShadow>
          <sphereGeometry args={[0.04, 32, 16]} />
          <meshStandardMaterial color="#f43f5e" roughness={0.2} />
        </mesh>

        {/* Partículas de lechita / Eyaculación 3D (Cumshot) al venirse */}
        <points ref={cumParticlesRef} position={[0, 0.02, 0.33]} visible={false}>
          <bufferGeometry>
            <bufferAttribute
              attach="attributes-position"
              count={cumParticlesCount}
              array={cumPositions}
              itemSize={3}
            />
          </bufferGeometry>
          <pointsMaterial size={0.018} color="#ffffff" transparent opacity={0.9} />
        </points>
      </group>
    </group>
  );
};
