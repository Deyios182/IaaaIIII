/**
 * gym/GymEnvironment.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Entorno físico estático del Gimnasio usando @react-three/rapier.
 * Usa Colisionadores manuales explícitos para mayor velocidad y robustez.
 */

import React from 'react';
import { RigidBody, CuboidCollider } from '@react-three/rapier';
import { Grid } from '@react-three/drei';

export default function GymEnvironment() {
  return (
    <>
      {/* Suelo físico con masa infinita (fixed) y alta fricción */}
      <RigidBody type="fixed" friction={1.0} restitution={0.0} colliders={false}>
        <mesh receiveShadow position={[0, -0.025, 0]}>
          <boxGeometry args={[20, 0.05, 20]} />
          <meshStandardMaterial color="#0f172a" metalness={0.2} roughness={0.8} />
        </mesh>
        <CuboidCollider args={[10, 0.025, 10]} position={[0, -0.025, 0]} />
      </RigidBody>

      {/* Grilla visual de referencia */}
      <Grid
        position={[0, 0.001, 0]}
        args={[20, 20]}
        cellSize={0.5}
        cellThickness={0.5}
        cellColor="#1e3a5f"
        sectionSize={2}
        sectionThickness={1}
        sectionColor="#0ea5e9"
        fadeDistance={12}
        fadeStrength={1}
        followCamera={false}
        infiniteGrid={false}
      />

      {/* Paredes limitadoras físicas para evitar que el robot caiga al vacío */}
      {[
        { pos: [0, 1, -10] as [number, number, number], args: [10, 1, 0.05] as [number, number, number], size: [20, 2, 0.1] },
        { pos: [0, 1, 10] as [number, number, number], args: [10, 1, 0.05] as [number, number, number], size: [20, 2, 0.1] },
        { pos: [-10, 1, 0] as [number, number, number], args: [0.05, 1, 10] as [number, number, number], size: [0.1, 2, 20] },
        { pos: [10, 1, 0] as [number, number, number], args: [0.05, 1, 10] as [number, number, number], size: [0.1, 2, 20] },
      ].map((wall, i) => (
        <RigidBody key={`wall-${i}`} type="fixed" colliders={false}>
          <mesh position={wall.pos}>
            <boxGeometry args={wall.size as [number, number, number]} />
            <meshStandardMaterial color="#0f172a" transparent opacity={0.1} />
          </mesh>
          <CuboidCollider args={wall.args} position={wall.pos} />
        </RigidBody>
      ))}

      {/* Marcador de Spawn */}
      <mesh position={[0, 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.2, 32]} />
        <meshStandardMaterial color="#3b82f6" emissive="#2563eb" emissiveIntensity={0.5} transparent opacity={0.7} />
      </mesh>

      {/* Marcador de Objetivo (Z = 5) */}
      <mesh position={[0, 0.01, 5]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.3, 32]} />
        <meshStandardMaterial color="#22c55e" emissive="#16a34a" emissiveIntensity={0.5} transparent opacity={0.7} />
      </mesh>
    </>
  );
}
