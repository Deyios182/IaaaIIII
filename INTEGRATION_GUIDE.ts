/**
 * INTEGRACIÓN DE SISTEMAS AVANZADOS EN AvatarViewer3D.tsx
 * 
 * Este archivo contiene fragmentos de código para integrar los nuevos sistemas
 * en AvatarViewer3D.tsx. Copiar y pegar en las ubicaciones indicadas.
 */

// ============================================
// 1. AGREGAR DESPUÉS DE LA LÍNEA 557 (después de mixerRef.update)
// ============================================

/*
        // === ACTUALIZAR NUEVOS SISTEMAS ===
        
        // 1. Animation Manager
        if (animationManagerRef.current) {
            animationManagerRef.current.update(delta);
        }

        // 2. IK Controller - head & eye tracking del mouse
        if (ikControllerRef.current?.isInitialized()) {
            ikControllerRef.current.setLookTargetFromScreen(state.pointer.x, state.pointer.y, 3);
            ikControllerRef.current.update(delta);
        }

        // 3. Mood System - obtener influencias
        const moodInfluence = moodSystemRef.current?.getInfluence() || {
            breathingSpeed: 1, gestureFrequency: 1, expressionIntensity: 1,
            idleVariation: 1, timeScale: 1
        };
*/

// ============================================
// 2. MODIFICAR RESPIRACIÓN (líneas 565-567) para usar mood influence
// ============================================

/*
        // ANTES:
        const breathSpeed = isHotMode ? 8 : 2;
        const breathAmp = isHotMode ? 0.008 : 0.003;

        // DESPUÉS:
        const breathSpeed = (isHotMode ? 8 : 2) * moodInfluence.breathingSpeed;
        const breathAmp = (isHotMode ? 0.008 : 0.003) * moodInfluence.expressionIntensity;
*/

// ============================================
// 3. AGREGAR EVENT LISTENERS PARA INTERACCIONES
// Agregar este useEffect después del useEffect de clothingManager
// ============================================

/*
    // Interaction System - detectar clicks en el avatar
    const { camera } = useThree();
    const interactionSystemRef = useRef<InteractionSystem | null>(null);

    useEffect(() => {
        if (!modelRef.current || !camera) return;

        // Inicializar sistema de interacciones
        interactionSystemRef.current = new InteractionSystem();
        interactionSystemRef.current.initialize(modelRef.current,camera);

        // Event listeners para clicks
        const handleClick = (event: MouseEvent) => {
            const canvas = event.target as HTMLCanvasElement;
            interactionSystemRef.current?.handlePointerEvent(event, canvas, 'click');
        };

        const handleMove = (event: MouseEvent) => {
            const canvas = event.target as HTMLCanvasElement;
            interactionSystemRef.current?.handlePointerEvent(event, canvas, 'move');
        };

        window.addEventListener('click', handleClick);
        window.addEventListener('pointermove', handleMove);

        return () => {
            window.removeEventListener('click', handleClick);
            window.removeEventListener('pointermove', handleMove);
        };
    }, [modelRef.current, camera]);
*/

// ============================================
// 4. HANDLER PARA REACCIONES DE INTERACCIÓN
// Agregar este useEffect para escuchar eventos de avatar-interaction
// ============================================

/*
    useEffect(() => {
        const handleInteraction = (event: any) => {
            const { zone, action } = event.detail;

            if (action === 'blush_smile') {
                // Tocar cabeza -> blush + sonrisa
                console.log('💕 Tocaste mi cabeza!');
                // Aquí puedes cambiar emoción temporalmente o activar animación
                if (animationManagerRef.current?.hasAnimation('Happy')) {
                    animationManagerRef.current.play('Happy', { 
                        priority: 8, 
                        loop: false, 
                        blendDuration: 0.5 
                    });
                }
            } else if (action === 'wave') {
                // Tocar mano -> saludo
                console.log('👋 Respondiendo saludo!');
                if (animationManagerRef.current?.hasAnimation('Wave')) {
                    animationManagerRef.current.play('Wave', { 
                        priority: 7, 
                        loop: false 
                    });
                }
            } else if (action === 'look_at_cursor') {
                // Hover en cara -> activar IK tracking (ya activo por defecto)
                console.log('👀 Mirando al cursor...');
            }
        };

        window.addEventListener('avatar-interaction', handleInteraction);
        return () => window.removeEventListener('avatar-interaction', handleInteraction);
    }, []);
*/

// ============================================
// 5. AGREGAR AL CANVAS (en AvatarViewer3D component)
// Para habilitar raycasting de interacciones
// ============================================

/*
    const handleCanvasClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
        // El InteractionSystem ya maneja esto via window events
    };

    return (
        <div className="..." onPointerMove={handlePointerMove}>
            <Canvas ...>
*/

// ============================================
// 6. EXPONER API PÚBLICA PARA CONTROL EXTERNO
// Agregar al final del componente AvatarModel
// ============================================

/*
    // Exponer APIs públicas via eventos globales
    useEffect(() => {
        const handleCommand = (event: any) => {
            const { command, params } = event.detail;

            switch (command) {
                case 'play_animation':
                    animationManagerRef.current?.play(params.name, params.config);
                    break;
                case 'set_mood':
                    moodSystemRef.current?.setMood(params.mood, params.intensity);
                    break;
                case 'apply_palette':
                    materialManagerRef.current?.applyPalette(params.palette);
                    break;
                case 'toggle_ik':
                    if (params.enabled) {
                        ikControllerRef.current?.setLookTarget(params.target, true);
                    } else {
                        ikControllerRef.current?.disableLookAt();
                    }
                    break;
            }
        };

        window.addEventListener('avatar-command', handleCommand);
        return () => window.removeEventListener('avatar-command', handleCommand);
    }, []);
*/

// ============================================
// 7. EJEMPLO DE USO DESDE OTROS COMPONENTES
// ============================================

/*
    // Desde cualquier componente React, puedes controlar el avatar:

    // Cambiar mood
    window.dispatchEvent(new CustomEvent('avatar-command', {
        detail: {
            command: 'set_mood',
            params: { mood: 'energetic', intensity: 0.8 }
        }
    }));

    // Reproducir animación
    window.dispatchEvent(new CustomEvent('avatar-command', {
        detail: {
            command: 'play_animation',
            params: { 
                name: 'Dance_01', 
                config: { priority: 9, loop: true } 
            }
        }
    }));

    // Cambiar colores
    window.dispatchEvent(new CustomEvent('avatar-command', {
        detail: {
            command: 'apply_palette',
            params: { 
                palette: { 
                    hair: new THREE.Color('#ff00ff'),
                    eyes: new THREE.Color('#00ffff')
                } 
            }
        }
    }));
*/

export { };
