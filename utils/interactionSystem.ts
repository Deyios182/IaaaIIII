/**
 * Interaction System - Sistema de detección de interacciones físicas
 * Usa raycasting para detectar clicks/hover en partes del avatar
 */

import * as THREE from 'three';

export interface InteractionZone {
    name: string;
    meshNames: string[]; // Nombres de meshes que pertenecen a esta zona
    meshes: THREE.Mesh[]; // Referencias a meshes
    onTouch?: () => void;
    onHover?: () => void;
    onLeave?: () => void;
}

export interface InteractionEvent {
    zone: string;
    type: 'touch' | 'hover' | 'leave';
    intersection?: THREE.Intersection;
}

/**
 * InteractionSystem - Detecta interacciones del usuario con el avatar
 */
export class InteractionSystem {
    private zones: InteractionZone[] = [];
    private raycaster: THREE.Raycaster = new THREE.Raycaster();
    private hoveredZone: string | null = null;
    private camera: THREE.Camera | null = null;

    constructor() {
        this.raycaster = new THREE.Raycaster();
    }

    /**
     * Inicializar con modelo y cámara
     */
    initialize(model: THREE.Object3D, camera: THREE.Camera): void {
        this.camera = camera;
        this.detectZones(model);
    }

    /**
     * Detectar zonas de interacción automáticamente
     */
    private detectZones(model: THREE.Object3D): void {
        const meshMap = new Map<string, THREE.Mesh>();

        // Recolectar todos los meshes
        model.traverse((child) => {
            if ((child as any).isMesh) {
                meshMap.set(child.name.toLowerCase(), child as THREE.Mesh);
            }
        });

        // Definir zonas de interacción
        this.zones = [
            {
                name: 'head',
                meshNames: ['face', 'head', 'hair'],
                meshes: [],
                onTouch: () => this.headTouchReaction(),
                onHover: () => this.headHoverReaction()
            },
            {
                name: 'hand_left',
                meshNames: ['hand_l', 'hand.l', 'def-hand.l'],
                meshes: [],
                onTouch: () => this.handTouchReaction('left')
            },
            {
                name: 'hand_right',
                meshNames: ['hand_r', 'hand.r', 'def-hand.r'],
                meshes: [],
                onTouch: () => this.handTouchReaction('right')
            },
            {
                name: 'body',
                meshNames: ['body', 'torso', 'chest'],
                meshes: [],
                onTouch: () => this.bodyTouchReaction()
            }
        ];

        // Asignar meshes a zonas
        this.zones.forEach(zone => {
            zone.meshNames.forEach(meshName => {
                const mesh = meshMap.get(meshName);
                if (mesh) {
                    zone.meshes.push(mesh);
                }
            });

            if (zone.meshes.length > 0) {
                console.log(`🖱️ Zona de interacción "${zone.name}": ${zone.meshes.length} meshes`);
            }
        });
    }

    /**
     * Procesar evento de puntero (click o move)
     */
    handlePointerEvent(
        event: MouseEvent | PointerEvent,
        domElement: HTMLElement,
        eventType: 'click' | 'move'
    ): InteractionEvent | null {
        if (!this.camera) return null;

        // Calcular coordenadas normalizadas (-1 a 1)
        const rect = domElement.getBoundingClientRect();
        const mouse = new THREE.Vector2(
            ((event.clientX - rect.left) / rect.width) * 2 - 1,
            -((event.clientY - rect.top) / rect.height) * 2 + 1
        );

        // Raycast
        this.raycaster.setFromCamera(mouse, this.camera);

        // Obtener todos los meshes de todas las zonas
        const allMeshes: THREE.Mesh[] = [];
        this.zones.forEach(zone => allMeshes.push(...zone.meshes));

        const intersects = this.raycaster.intersectObjects(allMeshes, false);

        if (intersects.length > 0) {
            const hitMesh = intersects[0].object as THREE.Mesh;
            const hitZone = this.zones.find(zone => zone.meshes.includes(hitMesh));

            if (hitZone) {
                if (eventType === 'click' && hitZone.onTouch) {
                    hitZone.onTouch();
                    return { zone: hitZone.name, type: 'touch', intersection: intersects[0] };
                }

                if (eventType === 'move') {
                    // Detectar hover enter
                    if (this.hoveredZone !== hitZone.name) {
                        // Leave anterior
                        if (this.hoveredZone) {
                            const prevZone = this.zones.find(z => z.name === this.hoveredZone);
                            if (prevZone?.onLeave) prevZone.onLeave();
                        }

                        // Enter nuevo
                        this.hoveredZone = hitZone.name;
                        if (hitZone.onHover) {
                            hitZone.onHover();
                        }
                        return { zone: hitZone.name, type: 'hover', intersection: intersects[0] };
                    }
                }
            }
        } else if (eventType === 'move' && this.hoveredZone) {
            // Mouse salió de todas las zonas
            const prevZone = this.zones.find(z => z.name === this.hoveredZone);
            if (prevZone?.onLeave) prevZone.onLeave();

            const leftZone = this.hoveredZone;
            this.hoveredZone = null;
            return { zone: leftZone, type: 'leave' };
        }

        return null;
    }

    // === REACCIONES ===

    private headTouchReaction(): void {
        console.log('💖 Tocaste mi cabeza!');
        // Disparar evento personalizado para que AvatarViewer3D reaccione
        window.dispatchEvent(new CustomEvent('avatar-interaction', {
            detail: { zone: 'head', action: 'blush_smile' }
        }));
    }

    private headHoverReaction(): void {
        console.log('👀 Mirando mi cara...');
        window.dispatchEvent(new CustomEvent('avatar-interaction', {
            detail: { zone: 'head', action: 'look_at_cursor' }
        }));
    }

    private handTouchReaction(hand: 'left' | 'right'): void {
        console.log(`👋 Tocaste mi mano ${hand}!`);
        window.dispatchEvent(new CustomEvent('avatar-interaction', {
            detail: { zone: `hand_${hand}`, action: 'wave' }
        }));
    }

    private bodyTouchReaction(): void {
        console.log('😳 Tocaste mi cuerpo!');
        window.dispatchEvent(new CustomEvent('avatar-interaction', {
            detail: { zone: 'body', action: 'surprise' }
        }));
    }

    /**
     * Agregar zona personalizada
     */
    addZone(zone: InteractionZone): void {
        this.zones.push(zone);
    }

    /**
     * Obtener zonas activas
     */
    getZones(): InteractionZone[] {
        return this.zones;
    }

    /**
     * Verificar si hay zona en hover
     */
    getHoveredZone(): string | null {
        return this.hoveredZone;
    }
}
