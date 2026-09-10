/**
 * idleOverrideRegistry.ts
 * Permite reemplazar cualquier estado idle o gesto de habla procedural
 * con una animacion personalizada cargada en animationStore.
 */

export type IdleSlotId =
    | 'idle_relaxed'
    | 'idle_weight_shift'
    | 'idle_cute_waist'
    | 'idle_thoughtful'
    | 'idle_curious_look'
    | 'speech_explain'
    | 'speech_emphasis'
    | 'speech_seductive'
    | 'speech_animated';

export interface IdleSlotDefinition {
    id: IdleSlotId;
    label: string;
    icon: string;
    description: string;
    group: 'idle' | 'speech';
}

export const IDLE_SLOT_DEFINITIONS: IdleSlotDefinition[] = [
    { id: 'idle_relaxed',       label: 'Relajada',       icon: '😌', description: 'Pose neutral tranquila',                    group: 'idle' },
    { id: 'idle_weight_shift',  label: 'Peso Desplazado',icon: '💃', description: 'Cadera desplazada, espalda curvada',        group: 'idle' },
    { id: 'idle_cute_waist',    label: 'Cintura Cute',   icon: '🥰', description: 'Postura kawaii inclinada',                  group: 'idle' },
    { id: 'idle_thoughtful',    label: 'Pensativa',      icon: '🤔', description: 'Lean hacia adelante, brazo en barbilla',    group: 'idle' },
    { id: 'idle_curious_look',  label: 'Curiosa',        icon: '👀', description: 'Ladeada, brazos abiertos',                  group: 'idle' },
    { id: 'speech_explain',     label: 'Explicar',       icon: '☝️', description: 'Brazo izq sube y gesticula',               group: 'speech' },
    { id: 'speech_emphasis',    label: 'Énfasis',        icon: '🙌', description: 'Ambos brazos se abren juntos',             group: 'speech' },
    { id: 'speech_seductive',   label: 'Seductora',      icon: '💅', description: 'Brazo der sube lentamente',                group: 'speech' },
    { id: 'speech_animated',    label: 'Animada',        icon: '✨',  description: 'Ambos brazos rápido alternado',            group: 'speech' },
];

const STORAGE_KEY = 'nova_idle_overrides';
type OverrideMap = Record<string, string>;

function load(): OverrideMap {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
}
function save(map: OverrideMap) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

type Listener = () => void;
const listeners: Set<Listener> = new Set();
function notify() {
    listeners.forEach(fn => fn());
    window.dispatchEvent(new CustomEvent('nova-idle-overrides-updated'));
}

export const idleOverrideRegistry = {
    getOverride(slotId: IdleSlotId): string | undefined {
        return load()[slotId];
    },
    getAllOverrides(): OverrideMap {
        return load();
    },
    setOverride(slotId: IdleSlotId, animName: string) {
        const map = load();
        map[slotId] = animName;
        save(map);
        notify();
    },
    removeOverride(slotId: IdleSlotId) {
        const map = load();
        delete map[slotId];
        save(map);
        notify();
    },
    subscribe(fn: Listener) {
        listeners.add(fn);
        return () => listeners.delete(fn);
    },
};
