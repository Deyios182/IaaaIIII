import React, { useEffect, useState, useRef } from 'react';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { stageStore, StagePreset } from '../utils/stageStore';
import { loadPMXModel } from '../utils/pmxLoader';

interface StageRendererProps {
  customStage?: StagePreset;
}

export const StageRenderer: React.FC<StageRendererProps> = ({ customStage }) => {
  const [activeStage, setActiveStage] = useState<StagePreset>(customStage || stageStore.getActiveStage());
  const customModelRef = useRef<THREE.Group | null>(null);
  const [loadedCustomScene, setLoadedCustomScene] = useState<THREE.Group | null>(null);

  useEffect(() => {
    const unsub = stageStore.subscribe(() => {
      setActiveStage(stageStore.getActiveStage());
    });
    const handleStageEvent = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.activeStage) {
        setActiveStage(detail.activeStage);
      }
    };
    window.addEventListener('nova-stage-changed', handleStageEvent);
    return () => {
      unsub();
      window.removeEventListener('nova-stage-changed', handleStageEvent);
    };
  }, []);

  // Cargar modelo 3D personalizado si el stage es custom (.pmx o .glb)
  useEffect(() => {
    let isMounted = true;
    if (activeStage.type === 'custom' && activeStage.url) {
      const url = activeStage.url;
      const fileName = (activeStage.fileName || '').toLowerCase();

      if (fileName.includes('.pmx') || fileName.includes('.zip') || fileName.includes('.rar') || fileName.includes('.7z')) {
        const fullUrl = fileName ? `${url}#${fileName}` : url;
        loadPMXModel(fullUrl)
          .then(res => {
            if (!isMounted) return;
            // Ajustar posición base del stage para que coincida con el suelo (-1.5)
            res.scene.position.set(0, -1.5 + (activeStage.groundOffset || 0), 0);
            setLoadedCustomScene(res.scene);
          })
          .catch(err => {
            console.warn('⚠️ [StageRenderer] Error cargando escenario PMX/Archive:', err);
          });
      } else {
        const loader = new GLTFLoader();
        loader.load(url, (gltf) => {
          if (!isMounted) return;
          const scene = gltf.scene;
          scene.position.set(0, -1.5 + (activeStage.groundOffset || 0), 0);
          scene.traverse((c: any) => {
            if (c.isMesh) {
              c.receiveShadow = true;
              c.castShadow = false; // Escenario normalmente no proyecta sombra sobre sí mismo de forma pesada
            }
          });
          setLoadedCustomScene(scene);
        }, undefined, (err) => {
          console.warn('⚠️ [StageRenderer] Error cargando escenario GLTF/GLB:', err);
        });
      }
    } else {
      setLoadedCustomScene(null);
    }

    return () => {
      isMounted = false;
    };
  }, [activeStage]);

  // Si el escenario es "none", solo mostramos el suelo clásico suave
  if (activeStage.id === 'none') {
    return (
      <group position={[0, -1.5, 0]}>
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
          <planeGeometry args={[16, 16]} />
          <shadowMaterial opacity={0.35} />
        </mesh>
        <gridHelper args={[16, 32, '#38bdf8', '#1e293b']} position={[0, 0, 0]} />
      </group>
    );
  }

  // Escenario personal cargado por archivo
  if (activeStage.type === 'custom' && loadedCustomScene) {
    return (
      <group>
        <primitive object={loadedCustomScene} />
        {/* Sombra de contacto sobre el piso del stage */}
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.49 + (activeStage.groundOffset || 0), 0]} receiveShadow>
          <planeGeometry args={[18, 18]} />
          <shadowMaterial opacity={0.4} />
        </mesh>
      </group>
    );
  }

  // PRESETS VIRTUALES RICOS:
  switch (activeStage.id) {
    case 'idol_concert':
      return (
        <group position={[0, -1.5, 0]}>
          {/* Tarima principal circular */}
          <mesh position={[0, 0.1, 0]} receiveShadow>
            <cylinderGeometry args={[6, 6.3, 0.2, 64]} />
            <meshStandardMaterial color="#1e1035" roughness={0.2} metalness={0.8} />
          </mesh>
          {/* Anillo de neón exterior */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.21, 0]}>
            <ringGeometry args={[5.7, 5.9, 64]} />
            <meshBasicMaterial color="#ec4899" toneMapped={false} />
          </mesh>
          {/* Anillo de neón interior */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.21, 0]}>
            <ringGeometry args={[3.2, 3.35, 48]} />
            <meshBasicMaterial color="#38bdf8" toneMapped={false} />
          </mesh>
          {/* Focos de concierto verticales detrás */}
          {[-4, -2, 0, 2, 4].map((x, i) => (
            <group key={i} position={[x, 0, -4]}>
              <mesh position={[0, 2.5, 0]}>
                <cylinderGeometry args={[0.08, 0.08, 5, 16]} />
                <meshStandardMaterial color="#334155" metalness={0.9} />
              </mesh>
              <pointLight position={[0, 4.8, 0.3]} intensity={1.8} distance={8} color={i % 2 === 0 ? '#ec4899' : '#06b6d4'} />
            </group>
          ))}
          {/* Sombra de contacto */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.21, 0]} receiveShadow>
            <planeGeometry args={[12, 12]} />
            <shadowMaterial opacity={0.45} />
          </mesh>
        </group>
      );

    case 'cyberpunk_grid':
      return (
        <group position={[0, -1.5, 0]}>
          {/* Pista negra espejada */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[26, 26]} />
            <meshStandardMaterial color="#04060d" roughness={0.1} metalness={0.9} />
          </mesh>
          {/* Cuadrícula holográfica cian */}
          <gridHelper args={[26, 40, '#06b6d4', '#4c1d95']} position={[0, 0.01, 0]} />
          {/* Sombra de contacto */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.015, 0]} receiveShadow>
            <planeGeometry args={[14, 14]} />
            <shadowMaterial opacity={0.5} />
          </mesh>
        </group>
      );

    case 'anime_shrine':
      return (
        <group position={[0, -1.5, 0]}>
          {/* Suelo de tablones de madera tradicional */}
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.05, 0]} receiveShadow>
            <planeGeometry args={[14, 14]} />
            <meshStandardMaterial color="#2b1810" roughness={0.6} metalness={0.1} />
          </mesh>
          {/* Bordura de madera rojiza */}
          <mesh position={[0, 0.04, 0]}>
            <boxGeometry args={[14.4, 0.1, 14.4]} />
            <meshStandardMaterial color="#7f1d1d" roughness={0.4} />
          </mesh>
          {/* Faroles sutiles a los lados */}
          <pointLight position={[-4, 1.5, -2]} intensity={1.5} distance={6} color="#f59e0b" />
          <pointLight position={[4, 1.5, -2]} intensity={1.5} distance={6} color="#f59e0b" />
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.055, 0]} receiveShadow>
            <planeGeometry args={[12, 12]} />
            <shadowMaterial opacity={0.4} />
          </mesh>
        </group>
      );

    case 'void_black':
      return (
        <group position={[0, -1.5, 0]}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]} receiveShadow>
            <planeGeometry args={[30, 30]} />
            <meshBasicMaterial color="#020204" />
          </mesh>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
            <planeGeometry args={[10, 10]} />
            <shadowMaterial opacity={0.6} />
          </mesh>
        </group>
      );

    default:
      return null;
  }
};
