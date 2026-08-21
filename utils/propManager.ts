/**
 * PropManager - Sistema de Accesorios y Props 3D Interactivos para Nova
 * Permite instanciar y anclar objetos (taza de café, smartphone, libro, pociones)
 * a los sockets de las manos del avatar con alineación y poses automáticas.
 */

import * as THREE from 'three';

export type PropType = 'COFFEE_CUP' | 'SMARTPHONE' | 'BOOK' | 'POTION' | 'MICROPHONE' | 'NONE';
export type HandSide = 'RIGHT' | 'LEFT';

export interface PropConfig {
    type: PropType;
    hand?: HandSide;
    scale?: number;
    customColor?: string;
}

class PropManager {
    private static instance: PropManager | null = null;
    private rightHandBone: THREE.Bone | null = null;
    private leftHandBone: THREE.Bone | null = null;
    private currentRightProp: THREE.Group | null = null;
    private currentLeftProp: THREE.Group | null = null;
    private currentRightPropType: PropType = 'NONE';
    private currentLeftPropType: PropType = 'NONE';
    private scene: THREE.Scene | null = null;
    private dynamicObjects: { update: (delta: number, time: number) => void }[] = [];

    private constructor() {
        if (typeof window !== 'undefined') {
            window.addEventListener('aiko-prop', (e: Event) => {
                const detail = (e as CustomEvent<PropConfig>).detail;
                if (detail) {
                    this.setProp(detail.type, detail.hand || 'RIGHT', detail.scale, detail.customColor);
                }
            });
        }
    }

    public static getInstance(): PropManager {
        if (!PropManager.instance) {
            PropManager.instance = new PropManager();
        }
        return PropManager.instance;
    }

    public initialize(scene: THREE.Scene, rightHand?: THREE.Bone, leftHand?: THREE.Bone): void {
        this.scene = scene;
        this.rightHandBone = rightHand || null;
        this.leftHandBone = leftHand || null;
        console.log('🪄 [PropManager] Inicializado con sockets de mano:', {
            rightHand: !!this.rightHandBone,
            leftHand: !!this.leftHandBone
        });
    }

    public updateSockets(rightHand?: THREE.Bone, leftHand?: THREE.Bone): void {
        if (rightHand) this.rightHandBone = rightHand;
        if (leftHand) this.leftHandBone = leftHand;
    }

    /**
     * Equipa o retira un prop en una mano específica
     */
    public setProp(type: PropType, hand: HandSide = 'RIGHT', scale: number = 1.0, customColor?: string): void {
        const targetBone = hand === 'RIGHT' ? this.rightHandBone : this.leftHandBone;

        if (type === 'NONE' || !type) {
            this.removeProp(hand);
            return;
        }

        if (!targetBone) {
            console.warn(`⚠️ [PropManager] Hueso de mano ${hand} no disponible para acoplar prop: ${type}`);
            return;
        }

        // Remover prop anterior si existía
        this.removeProp(hand);

        // Crear el nuevo prop
        const propGroup = this.createPropGeometry(type, customColor);
        if (!propGroup) return;

        propGroup.scale.setScalar(scale);

        // Ajuste de offset de posición y rotación según la mano y el tipo de prop
        this.applySocketOffset(propGroup, type, hand);

        // Emparentar al socket de la mano
        targetBone.add(propGroup);

        if (hand === 'RIGHT') {
            this.currentRightProp = propGroup;
            this.currentRightPropType = type;
        } else {
            this.currentLeftProp = propGroup;
            this.currentLeftPropType = type;
        }

        console.log(`✨ [PropManager] Prop "${type}" equipado en mano ${hand}`);

        // Disparar automáticamente la pose de agarre adecuada
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aiko-hand-pose', {
                detail: { side: hand, pose: 'GRIP' }
            }));

            // Levantar sutilmente el antebrazo para sostener el objeto
            window.dispatchEvent(new CustomEvent('aiko-movement', {
                detail: {
                    limb: hand === 'RIGHT' ? 'RIGHT_FOREARM' : 'LEFT_FOREARM',
                    target: 'BEND'
                }
            }));
        }
    }

    /**
     * Retira el prop equipado en una mano
     */
    public removeProp(hand: HandSide = 'RIGHT'): void {
        const targetProp = hand === 'RIGHT' ? this.currentRightProp : this.currentLeftProp;
        const targetBone = hand === 'RIGHT' ? this.rightHandBone : this.leftHandBone;

        if (targetProp && targetBone) {
            targetBone.remove(targetProp);
            this.disposeHierarchy(targetProp);
        }

        if (hand === 'RIGHT') {
            this.currentRightProp = null;
            this.currentRightPropType = 'NONE';
        } else {
            this.currentLeftProp = null;
            this.currentLeftPropType = 'NONE';
        }

        // Restablecer pose de mano a relajada
        if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('aiko-hand-pose', {
                detail: { side: hand, pose: 'RELAX' }
            }));
        }
    }

    public update(delta: number, time: number): void {
        for (const item of this.dynamicObjects) {
            item.update(delta, time);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // GENERADORES PROCEDURALES DE MODELOS 3D
    // ─────────────────────────────────────────────────────────────────────────────

    private createPropGeometry(type: PropType, customColor?: string): THREE.Group | null {
        const group = new THREE.Group();
        group.name = `PROP_${type}`;

        switch (type) {
            case 'COFFEE_CUP':
                return this.createCoffeeCup(group, customColor);
            case 'SMARTPHONE':
                return this.createSmartphone(group, customColor);
            case 'BOOK':
                return this.createBook(group, customColor);
            case 'POTION':
                return this.createPotion(group, customColor);
            case 'MICROPHONE':
                return this.createMicrophone(group, customColor);
            default:
                return null;
        }
    }

    /**
     * Taza de Café / Té humeante con vapor sutil
     */
    private createCoffeeCup(group: THREE.Group, color = '#f8fafc'): THREE.Group {
        // 1. Cuerpo de la taza (Cilindro hueco)
        const cupGeo = new THREE.CylinderGeometry(0.045, 0.035, 0.08, 24);
        const cupMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            roughness: 0.2,
            metalness: 0.1,
        });
        const cupMesh = new THREE.Mesh(cupGeo, cupMat);
        cupMesh.castShadow = true;
        group.add(cupMesh);

        // 2. Líquido café
        const liquidGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.005, 24);
        const liquidMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x3e2723), // Marrón café oscuro
            roughness: 0.1,
            metalness: 0.2
        });
        const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
        liquidMesh.position.y = 0.032;
        group.add(liquidMesh);

        // 3. Asa de la taza (Torus)
        const handleGeo = new THREE.TorusGeometry(0.024, 0.006, 12, 24, Math.PI);
        const handleMesh = new THREE.Mesh(handleGeo, cupMat);
        handleMesh.position.set(0.042, 0.005, 0);
        handleMesh.rotation.z = -Math.PI / 2;
        group.add(handleMesh);

        // 4. Vapor procedural animado
        const steamCount = 8;
        const steamSpheres: THREE.Mesh[] = [];
        const steamMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.25
        });

        for (let i = 0; i < steamCount; i++) {
            const steamGeo = new THREE.SphereGeometry(0.008 + i * 0.002, 8, 8);
            const steamMesh = new THREE.Mesh(steamGeo, steamMat.clone());
            steamMesh.position.set(
                (Math.random() - 0.5) * 0.02,
                0.05 + i * 0.015,
                (Math.random() - 0.5) * 0.02
            );
            group.add(steamMesh);
            steamSpheres.push(steamMesh);
        }

        this.dynamicObjects.push({
            update: (delta, time) => {
                steamSpheres.forEach((s, idx) => {
                    const offset = idx * 0.5;
                    s.position.y = 0.045 + ((time * 0.4 + offset) % 0.12);
                    s.position.x = Math.sin(time * 2 + idx) * 0.01;
                    const progress = (s.position.y - 0.045) / 0.12;
                    (s.material as THREE.MeshBasicMaterial).opacity = Math.sin(progress * Math.PI) * 0.3;
                });
            }
        });

        return group;
    }

    /**
     * Smartphone elegante con pantalla OLED brillante
     */
    private createSmartphone(group: THREE.Group, bodyColor = '#1e293b'): THREE.Group {
        const bodyGeo = new THREE.BoxGeometry(0.07, 0.14, 0.008);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(bodyColor),
            roughness: 0.3,
            metalness: 0.8
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        group.add(bodyMesh);

        const screenGeo = new THREE.PlaneGeometry(0.064, 0.13);
        const screenMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(0x0284c7),
            emissive: new THREE.Color(0x0369a1),
            emissiveIntensity: 0.6,
            roughness: 0.1
        });
        const screenMesh = new THREE.Mesh(screenGeo, screenMat);
        screenMesh.position.z = 0.0042;
        group.add(screenMesh);

        const camGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.002, 16);
        const camMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.1 });
        const camMesh = new THREE.Mesh(camGeo, camMat);
        camMesh.rotation.x = Math.PI / 2;
        camMesh.position.set(0.02, 0.05, -0.0045);
        group.add(camMesh);

        return group;
    }

    /**
     * Libro / Cuaderno de notas
     */
    private createBook(group: THREE.Group, coverColor = '#7c2d12'): THREE.Group {
        const coverGeo = new THREE.BoxGeometry(0.12, 0.16, 0.022);
        const coverMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(coverColor),
            roughness: 0.6,
            metalness: 0.1
        });
        const coverMesh = new THREE.Mesh(coverGeo, coverMat);
        group.add(coverMesh);

        const pagesGeo = new THREE.BoxGeometry(0.114, 0.154, 0.018);
        const pagesMat = new THREE.MeshStandardMaterial({
            color: 0xfef3c7,
            roughness: 0.8
        });
        const pagesMesh = new THREE.Mesh(pagesGeo, pagesMat);
        pagesMesh.position.x = 0.004;
        group.add(pagesMesh);

        return group;
    }

    /**
     * Poción mágica con fluido brillante pulsante (Albion Online / RPG)
     */
    private createPotion(group: THREE.Group, fluidColor = '#8b5cf6'): THREE.Group {
        const flaskGeo = new THREE.SphereGeometry(0.04, 24, 24);
        const glassMat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.35,
            roughness: 0.05,
            transmission: 0.9,
            thickness: 0.02
        });
        const flaskMesh = new THREE.Mesh(flaskGeo, glassMat);
        group.add(flaskMesh);

        const neckGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.03, 16);
        const neckMesh = new THREE.Mesh(neckGeo, glassMat);
        neckMesh.position.y = 0.045;
        group.add(neckMesh);

        const corkGeo = new THREE.CylinderGeometry(0.014, 0.012, 0.018, 16);
        const corkMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.9 });
        const corkMesh = new THREE.Mesh(corkGeo, corkMat);
        corkMesh.position.y = 0.06;
        group.add(corkMesh);

        const liquidGeo = new THREE.SphereGeometry(0.036, 20, 20);
        const col = new THREE.Color(fluidColor);
        const liquidMat = new THREE.MeshStandardMaterial({
            color: col,
            emissive: col,
            emissiveIntensity: 0.7,
            roughness: 0.2
        });
        const liquidMesh = new THREE.Mesh(liquidGeo, liquidMat);
        liquidMesh.position.y = -0.004;
        group.add(liquidMesh);

        this.dynamicObjects.push({
            update: (delta, time) => {
                liquidMat.emissiveIntensity = 0.5 + Math.sin(time * 3) * 0.35;
            }
        });

        return group;
    }

    /**
     * Micrófono de estudio o escenario
     */
    private createMicrophone(group: THREE.Group, micColor = '#3b82f6'): THREE.Group {
        const headGeo = new THREE.SphereGeometry(0.028, 20, 20);
        const headMat = new THREE.MeshStandardMaterial({
            color: 0xcccccc,
            metalness: 0.9,
            roughness: 0.2
        });
        const headMesh = new THREE.Mesh(headGeo, headMat);
        headMesh.position.y = 0.09;
        group.add(headMesh);

        const bodyGeo = new THREE.CylinderGeometry(0.014, 0.01, 0.12, 16);
        const bodyMat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(micColor),
            metalness: 0.5,
            roughness: 0.4
        });
        const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
        bodyMesh.position.y = 0.02;
        group.add(bodyMesh);

        return group;
    }

    /**
     * Posiciona y rota el prop en la mano del avatar de forma ergonómica
     */
    private applySocketOffset(group: THREE.Group, type: PropType, hand: HandSide): void {
        const isRight = hand === 'RIGHT';

        switch (type) {
            case 'COFFEE_CUP':
                group.position.set(isRight ? 0.02 : -0.02, 0.04, 0.03);
                group.rotation.set(0, 0, isRight ? -Math.PI / 12 : Math.PI / 12);
                break;
            case 'SMARTPHONE':
                group.position.set(isRight ? 0.015 : -0.015, 0.05, 0.02);
                group.rotation.set(Math.PI / 6, 0, isRight ? -Math.PI / 8 : Math.PI / 8);
                break;
            case 'BOOK':
                group.position.set(isRight ? 0.03 : -0.03, 0.06, 0.02);
                group.rotation.set(Math.PI / 4, isRight ? Math.PI / 6 : -Math.PI / 6, 0);
                break;
            case 'POTION':
                group.position.set(isRight ? 0.015 : -0.015, 0.03, 0.02);
                group.rotation.set(0, 0, 0);
                break;
            case 'MICROPHONE':
                group.position.set(0, 0.02, 0.02);
                group.rotation.set(Math.PI / 4, 0, 0);
                break;
        }
    }

    private disposeHierarchy(obj: THREE.Object3D): void {
        obj.traverse(child => {
            if ((child as THREE.Mesh).isMesh) {
                const mesh = child as THREE.Mesh;
                mesh.geometry?.dispose();
                if (Array.isArray(mesh.material)) {
                    mesh.material.forEach(m => m.dispose());
                } else if (mesh.material) {
                    mesh.material.dispose();
                }
            }
        });
    }
}

export const getPropManager = (): PropManager => PropManager.getInstance();
export default PropManager;
