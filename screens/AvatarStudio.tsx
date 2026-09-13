/**
 * Avatar Studio - Centro unificado de personalización del avatar
 * Fusiona: selección de modelo, ropa, animaciones, gestos, y configuración
 */

import React, { useState, useRef, useCallback, useEffect } from 'react';
import AvatarViewer3D from '../components/AvatarViewer3D';
import { animationStore, StoredAnimation, LegCalibrationData, DEFAULT_LEG_CALIBRATION, BoneOffsets } from '../utils/animationStore';
import { modelStore, SavedModelInfo } from '../utils/modelStore';
import { AvatarSettings } from '../types';
import { BoneMappingResult } from '../utils/mixamoRetargeter';
import { inspectVmd } from '../utils/vmdLoader';
import { AvatarLearningService, AvatarPreference } from '../services/AvatarLearningService';
import { gestureRegistry, GestureDefinition } from '../utils/gestureRegistry';
import { idleOverrideRegistry, IDLE_SLOT_DEFINITIONS, IdleSlotDefinition, IdleSlotId } from '../utils/idleOverrideRegistry';
import { getClothingManager, ClothingItem, ClothingCategory } from '../utils/clothingManager';
import { stageStore, StagePreset } from '../utils/stageStore';
import { multiVmdManager, GroupSlotConfig } from '../utils/multiVmdManager';

const CLOTHING_CATEGORIES: { id: string; label: string; icon: string; category?: ClothingCategory }[] = [
  { id: 'all', label: 'Todo', icon: '🌟' },
  { id: 'outfit', label: 'Outfits', icon: '👗', category: 'outfit' },
  { id: 'underwear', label: 'Lencería', icon: '🩱', category: 'underwear' },
  { id: 'shoes', label: 'Calzado', icon: '👠', category: 'shoes' },
  { id: 'accessory', label: 'Accesorios', icon: '🎀', category: 'accessory' },
  { id: 'other', label: 'Otros', icon: '📦', category: 'other' }
];

const ANIMATION_CATEGORIES = [
  { id: 'all', label: 'Todas', icon: '🌟' },
  { id: 'dance', label: 'Baile / MMD', icon: '💃' },
  { id: 'greeting', label: 'Saludos', icon: '👋' },
  { id: 'reaction', label: 'Reacciones', icon: '😊' },
  { id: 'charm', label: 'Coqueta / Sexy', icon: '💖' },
  { id: 'song', label: 'Canción', icon: '🎵' },
  { id: 'body', label: 'Posturas', icon: '🤸' },
  { id: 'other', label: 'Otros', icon: '📦' }
];

const GESTURE_CATEGORIES = [
  { id: 'all', label: 'Todos', icon: '🌟' },
  { id: 'greeting', label: 'Saludos', icon: '👋' },
  { id: 'reaction', label: 'Reacciones', icon: '😊' },
  { id: 'emotion', label: 'Emociones', icon: '😄' },
  { id: 'charm', label: 'Coqueteo', icon: '💖' },
  { id: 'dance', label: 'Baile y Ritmo', icon: '💃' },
  { id: 'body', label: 'Cuerpo', icon: '🤸' }
];

/** Tipo para categorías personalizadas guardadas en localStorage */
interface CustomCategory { id: string; label: string; icon: string; }
const CUSTOM_CATS_KEY = 'nova_custom_anim_categories';
const CUSTOM_GESTURE_CATS_KEY = 'nova_custom_gesture_categories';

// --- Error Boundary local para evitar crasheos del motor 3D ---
class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error: any, errorInfo: any) { console.error("3D Render Error:", error, errorInfo); }
  render() {
    if (this.state.hasError) return this.props.fallback;
    return this.props.children;
  }
}

interface AvatarStudioProps {
  avatar: AvatarSettings;
  updateAvatar: (settings: Partial<AvatarSettings>) => void;
  allowWebSearch?: boolean;
  setAllowWebSearch?: (val: boolean) => void;
}

const GESTURES = [
  { id: 'happy', icon: '😊', name: 'Feliz', dur: 2500 },
  { id: 'sad', icon: '😢', name: 'Triste', dur: 3000 },
  { id: 'angry', icon: '😤', name: 'Enojada', dur: 2000 },
  { id: 'surprised', icon: '😲', name: 'Sorprendida', dur: 1500 },
  { id: 'confused', icon: '🤔', name: 'Confundida', dur: 2000 },
  { id: 'shy', icon: '🥺', name: 'Tímida', dur: 2500 },
  { id: 'wave', icon: '👋', name: 'Saludar', dur: 2500 },
  { id: 'nod', icon: '✅', name: 'Asentir', dur: 1500 },
  { id: 'shake_head', icon: '❌', name: 'Negar', dur: 1800 },
  { id: 'shrug', icon: '🤷', name: 'Encogerse', dur: 2000 },
  { id: 'point', icon: '👉', name: 'Señalar', dur: 2000 },
  { id: 'clap', icon: '👏', name: 'Aplaudir', dur: 2000 },
  { id: 'dance', icon: '💃', name: 'Bailar', dur: 4000 },
  { id: 'bow', icon: '🙇', name: 'Reverencia', dur: 2500 },
  { id: 'stretch', icon: '🧘', name: 'Estirar', dur: 3000 },
  { id: 'laugh', icon: '😂', name: 'Reír', dur: 2500 },
  { id: 'thinking', icon: '💭', name: 'Pensar', dur: 3000 },
  { id: 'flirt', icon: '😏', name: 'Coqueta', dur: 3000 },
];

const MODEL_PRESETS = [
  { name: 'Grokani', url: '/models/grokani_lipsync.glb', color: '#ec4899', emoji: '💖' },
  { name: 'Anie Chafa', url: '/models/anichafa.glb', color: '#f59e0b', emoji: '✨' },
  { name: 'Nova Anime', url: '/models/nova-avatar.glb', color: '#2563eb', emoji: '🌸' },
];

const HAIR_COLORS = [
  { color: '#e2b464', name: 'Rubio' },
  { color: '#8B4513', name: 'Castaño' },
  { color: '#ffffff', name: 'Platino' },
  { color: '#ec4899', name: 'Rosa' },
  { color: '#a855f7', name: 'Violeta' },
  { color: '#1313ec', name: 'Azul' },
  { color: '#ef4444', name: 'Rojo' },
  { color: '#1a1a1a', name: 'Negro' },
];

type Tab = 'model' | 'stage' | 'clothing' | 'gestures' | 'animations' | 'calibration' | 'learning';

const AvatarStudio: React.FC<AvatarStudioProps> = ({ avatar, updateAvatar, allowWebSearch, setAllowWebSearch }) => {
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [storedAnims, setStoredAnims] = useState<StoredAnimation[]>(animationStore.getAll());
  const [isDragging, setIsDragging] = useState(false);
  const [uploadStatus, setUploadStatus] = useState('');
  const [activeTab, setActiveTab] = useState<Tab>('model');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const selectedAnimForAudioRef = useRef<string | null>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const selectedAnimForCameraRef = useRef<string | null>(null);
  const facialInputRef = useRef<HTMLInputElement>(null);
  const selectedAnimForFacialRef = useRef<string | null>(null);
  const extraMotionInputRef = useRef<HTMLInputElement>(null);
  const selectedExtraMotionTargetRef = useRef<{ animName: string; dancerId: string; name: string; role: string; offsetX: number; offsetZ: number } | null>(null);
  const [pickingLibraryForExtra, setPickingLibraryForExtra] = useState<{ animName: string; dancerId: string; name: string; role: string; offsetX: number; offsetZ: number } | null>(null);
  const [savedModelInfo, setSavedModelInfo] = useState<SavedModelInfo | null>(null);
  const [savedModelList, setSavedModelList] = useState<SavedModelInfo[]>([]);
  const actionTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [boneMapping, setBoneMapping] = useState<BoneMappingResult[]>([]);
  const [boneMappingRaw, setBoneMappingRaw] = useState<Record<string, string>>({});
  const [modelBones, setModelBones] = useState<string[]>([]);
  const [boneSearch, setBoneSearch] = useState('');
  const [prefResetTrigger, setPrefResetTrigger] = useState(0);

  // Estados para Gestos y Vinculación VMD
  const [gestureCategoryFilter, setGestureCategoryFilter] = useState<string>('all');
  const [gestureSearch, setGestureSearch] = useState<string>('');
  const [gestureOverrides, setGestureOverrides] = useState<Map<string, string>>(new Map());
  const [assigningGesture, setAssigningGesture] = useState<GestureDefinition | null>(null);

  // Categorías personalizadas de gestos
  const [customGestureCategories, setCustomGestureCategories] = useState<CustomCategory[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_GESTURE_CATS_KEY) || '[]'); } catch { return []; }
  });
  const [showNewGestureCatForm, setShowNewGestureCatForm] = useState(false);
  const [newGestureCatLabel, setNewGestureCatLabel] = useState('');
  const [newGestureCatIcon, setNewGestureCatIcon] = useState('✨');

  const saveCustomGestureCategories = (cats: CustomCategory[]) => {
    setCustomGestureCategories(cats);
    try { localStorage.setItem(CUSTOM_GESTURE_CATS_KEY, JSON.stringify(cats)); } catch { }
  };

  const handleAddCustomGestureCategory = () => {
    const label = newGestureCatLabel.trim();
    if (!label) return;
    const id = 'gcat_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (customGestureCategories.some(c => c.id === id) || GESTURE_CATEGORIES.some(c => c.id === id)) return;
    saveCustomGestureCategories([...customGestureCategories, { id, label, icon: newGestureCatIcon }]);
    setNewGestureCatLabel('');
    setNewGestureCatIcon('✨');
    setShowNewGestureCatForm(false);
  };

  const handleDeleteCustomGestureCategory = (id: string) => {
    saveCustomGestureCategories(customGestureCategories.filter(c => c.id !== id));
    if (gestureCategoryFilter === id) setGestureCategoryFilter('all');
  };

  // Modal para Crear Nuevo Gesto en Catálogo
  const [showCreateGestureModal, setShowCreateGestureModal] = useState(false);
  const [newGestureName, setNewGestureName] = useState('');
  const [newGestureId, setNewGestureId] = useState('');
  const [newGestureIcon, setNewGestureIcon] = useState('✨');
  const [newGestureCategory, setNewGestureCategory] = useState<string>('greeting');
  const [newGestureAliases, setNewGestureAliases] = useState('');
  const [newGestureDuration, setNewGestureDuration] = useState('3.0');
  const [newGestureAssignAnim, setNewGestureAssignAnim] = useState<string>('');

  const handleCreateUserGesture = () => {
    const name = newGestureName.trim();
    if (!name) return;
    const id = (newGestureId.trim() || name).toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    const aliases = newGestureAliases
      .split(',')
      .map(a => a.trim().toLowerCase())
      .filter(Boolean);

    gestureRegistry.addUserGesture({
      id,
      name,
      category: newGestureCategory as any,
      description: `Gesto personalizado creado por el usuario: ${name}`,
      aliases,
      defaultDuration: parseFloat(newGestureDuration) || 3.0,
      icon: newGestureIcon || '✨'
    }, newGestureAssignAnim || undefined);

    // Limpiar y cerrar
    setNewGestureName('');
    setNewGestureId('');
    setNewGestureIcon('✨');
    setNewGestureAliases('');
    setNewGestureDuration('3.0');
    setNewGestureAssignAnim('');
    setShowCreateGestureModal(false);
    setUploadStatus(`✅ Gesto "${name}" creado exitosamente`);
    setTimeout(() => setUploadStatus(''), 3000);
  };

  // Estados para Poses Idle / Habla (overrides)
  const [idleOverrides, setIdleOverrides] = useState<Record<string, string>>({});
  const [assigningIdleSlot, setAssigningIdleSlot] = useState<IdleSlotDefinition | null>(null);

  // Estados para Animaciones (Búsqueda y Categorización para solucionar nombres chinos)
  const [animCategoryFilter, setAnimCategoryFilter] = useState<string>('all');
  const [animSearch, setAnimSearch] = useState<string>('');

  // Categorías personalizadas de animaciones (persistidas en localStorage)
  const [customCategories, setCustomCategories] = useState<CustomCategory[]>(() => {
    try { return JSON.parse(localStorage.getItem(CUSTOM_CATS_KEY) || '[]'); } catch { return []; }
  });
  const [showNewCatForm, setShowNewCatForm] = useState(false);
  const [newCatLabel, setNewCatLabel] = useState('');
  const [newCatIcon, setNewCatIcon] = useState('📌');

  const saveCustomCategories = (cats: CustomCategory[]) => {
    setCustomCategories(cats);
    try { localStorage.setItem(CUSTOM_CATS_KEY, JSON.stringify(cats)); } catch { }
  };

  const handleAddCustomCategory = () => {
    const label = newCatLabel.trim();
    if (!label) return;
    const id = 'custom_' + label.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
    if (customCategories.some(c => c.id === id)) return;
    saveCustomCategories([...customCategories, { id, label, icon: newCatIcon }]);
    setNewCatLabel('');
    setNewCatIcon('📌');
    setShowNewCatForm(false);
  };

  const handleDeleteCustomCategory = (id: string) => {
    saveCustomCategories(customCategories.filter(c => c.id !== id));
    if (animCategoryFilter === id) setAnimCategoryFilter('all');
  };

  // Todas las categorías de animaciones: base + custom
  const allAnimCategories = [
    ...ANIMATION_CATEGORIES,
    ...customCategories,
  ];

  // Estados para Escenarios (Stages)
  const [stageList, setStageList] = useState<StagePreset[]>(stageStore.getAll());
  const [activeStageId, setActiveStageId] = useState<string>(stageStore.getActiveStage().id);
  const stageInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsub = stageStore.subscribe(() => {
      setStageList(stageStore.getAll());
      setActiveStageId(stageStore.getActiveStage().id);
    });
    return unsub;
  }, []);

  const handleStageUpload = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      setUploadStatus(`⏳ Importando escenario ${file.name}...`);
      const newStage = await stageStore.addCustomStage(file);
      setUploadStatus(`✅ Escenario "${newStage.name}" listo`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error importando escenario`);
    } finally {
      if (stageInputRef.current) stageInputRef.current.value = '';
    }
  };

  // Estados para Coreografías Grupales (2-5 bailarines)
  const [groupState, setGroupState] = useState(multiVmdManager.getState());
  const groupSlotInputRef = useRef<HTMLInputElement>(null);
  const activeSlotIdRef = useRef<string | null>(null);
  const groupAudioInputRef = useRef<HTMLInputElement>(null);
  const groupCameraInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    multiVmdManager.init().then(() => {
      setGroupState(multiVmdManager.getState());
    });
    const unsub = multiVmdManager.subscribe(() => {
      setGroupState(multiVmdManager.getState());
    });
    return unsub;
  }, []);

  // Estados para selector de biblioteca en puestos de grupo y audio/cámara
  const [assigningSlotAnim, setAssigningSlotAnim] = useState<GroupSlotConfig | null>(null);
  const [assigningGroupAudio, setAssigningGroupAudio] = useState(false);
  const [assigningGroupCamera, setAssigningGroupCamera] = useState(false);

  const handleAssignSlotVmd = (slotId: string) => {
    const slot = groupState.slots.find(s => s.id === slotId);
    if (slot) {
      setAssigningSlotAnim(slot);
    } else {
      activeSlotIdRef.current = slotId;
      groupSlotInputRef.current?.click();
    }
  };

  const handlePickAnimationForSlot = async (slotId: string, anim: StoredAnimation) => {
    try {
      setUploadStatus(`⏳ Asignando "${anim.displayName || anim.name}" al puesto...`);
      const buffer = await animationStore.getFileBuffer(anim.name);
      if (!buffer) {
        setUploadStatus(`⚠️ No se pudo cargar el archivo binario de ${anim.name}`);
        setTimeout(() => setUploadStatus(''), 2500);
        return;
      }
      multiVmdManager.setSlotVmd(slotId, anim.displayName || anim.name, buffer, undefined, anim.name);

      // Si el slot es el centro o el grupo aún no tiene audio/cámara y la animación sí los tiene, sugerir / autovincularlos
      if (!groupState.audioUrl && (anim.audioUrl || anim.audioFileName)) {
        if (anim.audioUrl) {
          multiVmdManager.setAudio(anim.audioFileName || `Audio ${anim.displayName || anim.name}`, anim.audioUrl);
        }
      }
      if (!groupState.cameraBuffer && (anim.hasCamera || anim.cameraUrl)) {
        const camBuf = await animationStore.getCameraBuffer(anim.name);
        if (camBuf) {
          multiVmdManager.setCamera(anim.cameraFileName || `Cámara ${anim.displayName || anim.name}`, camBuf, anim.name);
        }
      }

      setUploadStatus(`💃 ¡"${anim.displayName || anim.name}" asignado con éxito!`);
      setTimeout(() => setUploadStatus(''), 2500);
      setAssigningSlotAnim(null);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error asignando animación al puesto`);
      setTimeout(() => setUploadStatus(''), 2500);
    }
  };

  const handlePickAudioForGroup = (anim: StoredAnimation) => {
    if (anim.audioUrl) {
      multiVmdManager.setAudio(anim.audioFileName || `Audio (${anim.displayName || anim.name})`, anim.audioUrl);
      setUploadStatus(`🎵 Audio vinculado desde "${anim.displayName || anim.name}"`);
      setTimeout(() => setUploadStatus(''), 2500);
      setAssigningGroupAudio(false);
    }
  };

  const handlePickCameraForGroup = async (anim: StoredAnimation) => {
    try {
      setUploadStatus(`⏳ Vinculando cámara de "${anim.displayName || anim.name}"...`);
      const camBuf = await animationStore.getCameraBuffer(anim.name);
      if (camBuf) {
        multiVmdManager.setCamera(anim.cameraFileName || `Cámara (${anim.displayName || anim.name})`, camBuf, anim.name);
        setUploadStatus(`🎥 Cámara grupal vinculada`);
      } else {
        setUploadStatus(`⚠️ Esta animación no tiene archivo de cámara .vmd guardado`);
      }
      setTimeout(() => setUploadStatus(''), 2500);
      setAssigningGroupCamera(false);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error vinculando cámara`);
      setTimeout(() => setUploadStatus(''), 2500);
    }
  };

  const handleSlotVmdFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const slotId = activeSlotIdRef.current;
    if (!file || !slotId) return;
    try {
      const buffer = await file.arrayBuffer();
      multiVmdManager.setSlotVmd(slotId, file.name, buffer);
      setUploadStatus(`💃 VMD asignado a puesto`);
      setTimeout(() => setUploadStatus(''), 2500);
    } catch (err) {
      setUploadStatus(`❌ Error leyendo VMD`);
    } finally {
      if (groupSlotInputRef.current) groupSlotInputRef.current.value = '';
      setAssigningSlotAnim(null);
    }
  };

  const handleGroupAudioUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    multiVmdManager.setAudio(file.name, url, file);
    setUploadStatus(`🎵 Audio grupal listo`);
    setTimeout(() => setUploadStatus(''), 2500);
    if (groupAudioInputRef.current) groupAudioInputRef.current.value = '';
    setAssigningGroupAudio(false);
  };

  const handleGroupCameraUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const buffer = await file.arrayBuffer();
      multiVmdManager.setCamera(file.name, buffer);
      setUploadStatus(`🎥 Cámara grupal vinculada`);
      setTimeout(() => setUploadStatus(''), 2500);
    } catch (err) {
      setUploadStatus(`❌ Error en cámara`);
    } finally {
      if (groupCameraInputRef.current) groupCameraInputRef.current.value = '';
      setAssigningGroupCamera(false);
    }
  };

  // Estados para Ropa y Accesorios Dinámicos por Modelo
  const [clothingItems, setClothingItems] = useState<ClothingItem[]>([]);
  const [clothingCategoryFilter, setClothingCategoryFilter] = useState<string>('all');
  const [clothingSearch, setClothingSearch] = useState<string>('');

  // Sincronizar catálogo dinámico de prendas del modelo activo
  useEffect(() => {
    const cm = getClothingManager();
    setClothingItems([...cm.getItems()]);

    const handleUpdate = () => {
      setClothingItems([...cm.getItems()]);
    };

    const unsub = cm.subscribe(() => {
      setClothingItems([...cm.getItems()]);
    });

    window.addEventListener('nova-clothing-items-updated', handleUpdate);

    return () => {
      unsub();
      window.removeEventListener('nova-clothing-items-updated', handleUpdate);
    };
  }, [avatar.modelUrl]);

  const handleToggleClothingItem = (meshName: string, visible: boolean) => {
    const cm = getClothingManager();
    cm.setItemVisibility(meshName, visible);
    setClothingItems([...cm.getItems()]);
  };

  const handleToggleClothingCategory = (category: ClothingCategory, visible: boolean) => {
    const cm = getClothingManager();
    cm.setCategoryVisibility(category, visible);
    setClothingItems([...cm.getItems()]);
  };

  const handleApplyClothingPreset = (preset: 'dressed' | 'underwear' | 'accessories' | 'nude') => {
    const cm = getClothingManager();
    cm.applyPreset(preset);
    setClothingItems([...cm.getItems()]);
  };

  // Estado para calibración de piernas / VMD (Cinemática Inversa)
  const [legCalibration, setLegCalibration] = useState<LegCalibrationData>({ ...DEFAULT_LEG_CALIBRATION });

  // Animación actualmente en reproducción (VMD, FBX o GLB)
  const activeAnim = React.useMemo(() => {
    return storedAnims.find(a => a.name === activeAction) || null;
  }, [storedAnims, activeAction]);

  // Sincronizar calibración cuando cambia la animación en reproducción
  useEffect(() => {
    if (activeAnim?.legCalibration) {
      setLegCalibration(activeAnim.legCalibration);
    } else if (activeAnim) {
      setLegCalibration({ ...DEFAULT_LEG_CALIBRATION });
    }
  }, [activeAnim?.name]);

  const handleLegCalibrationChange = (key: keyof LegCalibrationData, value: any) => {
    const updated = { ...legCalibration, [key]: value };
    setLegCalibration(updated);
    // ⚡ Efecto EN VIVO instantáneo para el siguiente frame en AvatarViewer3D (VMD y FBX)
    window.dispatchEvent(new CustomEvent('nova-leg-calibration', { detail: updated }));
    // Si hay una animación activa, persistir en animationStore
    if (activeAnim) {
      animationStore.updateLegCalibration(activeAnim.name, { [key]: value });
    }
  };

  const applyVmdPreset = (presetType: 'vrm' | 'pmx' | 'reset') => {
    let p: LegCalibrationData;
    if (presetType === 'vrm') {
      p = {
        scale: 0.025,
        groundY: 0.0,
        offsetLX: 0,
        offsetLZ: 0,
        offsetRX: 0,
        offsetRZ: 0,
        kneeAngle: 1.0,
        invertKnee: false,
        ikWeight: 0.85,
        freezeHipY: false,
      };
    } else if (presetType === 'pmx') {
      p = {
        scale: 0.22,
        groundY: 0.0,
        offsetLX: 0,
        offsetLZ: 0,
        offsetRX: 0,
        offsetRZ: 0,
        kneeAngle: 1.0,
        invertKnee: false,
        ikWeight: 0.95,
        freezeHipY: false,
      };
    } else {
      p = { ...DEFAULT_LEG_CALIBRATION };
    }
    setLegCalibration(p);
    window.dispatchEvent(new CustomEvent('nova-leg-calibration', { detail: p }));
    if (activeAnim) {
      animationStore.updateLegCalibration(activeAnim.name, p);
    }
  };

  // Cargar y escuchar cambios en el modelo persistido en IndexedDB y la biblioteca
  useEffect(() => {
    const refreshModels = () => {
      modelStore.getModelInfo().then(info => setSavedModelInfo(info));
      modelStore.getAllSavedModels().then(list => setSavedModelList(list));
    };
    refreshModels();
    const unsub = modelStore.subscribe(() => {
      refreshModels();
    });
    return unsub;
  }, []);

  useEffect(() => {
    const handleReset = () => setPrefResetTrigger(prev => prev + 1);
    window.addEventListener('nova-avatar-prefs-reset', handleReset);
    return () => window.removeEventListener('nova-avatar-prefs-reset', handleReset);
  }, []);

  // 🛑 Al salir de Avatar Studio (desmontar componente), detener cualquier animación de prueba, audio o cámara
  useEffect(() => {
    return () => {
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
        actionTimeoutRef.current = null;
      }
      window.dispatchEvent(new CustomEvent('nova-stop-animation'));
      window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: null } }));
    };
  }, []);
  const [availableModels, setAvailableModels] = useState<{ name: string, url: string, emoji?: string }[]>([]);
  const [jointValues, setJointValues] = useState<Record<string, number>>({
    rightArmX: -80,
    rightElbow: 0,
    leftArmX: -80,
    leftElbow: 0,
    torsoX: 0,
    hipsZ: 0,
    rightLegZ: 0,
    leftLegZ: 0,
    rightFingers: 0,
    leftFingers: 0,
  });

  const handleJointChange = (joint: string, degVal: number) => {
    setJointValues(prev => ({ ...prev, [joint]: degVal }));
    const rad = (degVal * Math.PI) / 180;
    window.dispatchEvent(new CustomEvent('aiko-studio-joint', { detail: { joint, val: rad } }));
  };

  // Cargar modelos disponibles desde el sistema de archivos (Electron)
  useEffect(() => {
    const fetchModels = async () => {
      if ((window as any).isElectron && (window as any).electronAPI?.getAvailableModels) {
        try {
          const models = await (window as any).electronAPI.getAvailableModels();
          if (models && models.length > 0) {
            // Asignar emojis divertidos aleatorios a los modelos nuevos si no tienen
            const emojis = ['🤖', '🦊', '👤', '🎭', '✨', '🌟', '💎', '🎨'];
            const mappedModels = models.map((m: any, i: number) => ({
              ...m,
              emoji: m.name.toLowerCase().includes('nova') ? '🌸' :
                m.name.toLowerCase().includes('grok') ? '💖' :
                  emojis[i % emojis.length]
            }));
            setAvailableModels(mappedModels);
          } else {
            setAvailableModels(MODEL_PRESETS);
          }
        } catch (e) {
          console.error("Error fetching models:", e);
          setAvailableModels(MODEL_PRESETS);
        }
      } else {
        setAvailableModels(MODEL_PRESETS);
      }
    };
    fetchModels();
  }, []);

  useEffect(() => {
    const updateOverrides = () => {
      setGestureOverrides(gestureRegistry.getAllOverrides());
      setIdleOverrides(idleOverrideRegistry.getAllOverrides());
    };
    updateOverrides();
    window.addEventListener('nova-gestures-updated', updateOverrides);
    window.addEventListener('nova-idle-overrides-updated', updateOverrides);
    const unsubIdle = idleOverrideRegistry.subscribe(updateOverrides);
    const unsub = animationStore.subscribe(() => {
      setStoredAnims(animationStore.getAll());
      updateOverrides();
    });
    return () => {
      window.removeEventListener('nova-gestures-updated', updateOverrides);
      window.removeEventListener('nova-idle-overrides-updated', updateOverrides);
      unsubIdle();
      unsub();
    };
  }, []);

  // Actualizar bone mapping desde el retargeter
  useEffect(() => {
    const interval = setInterval(() => {
      const results = (window as any).__lastBoneMapping;
      const map = (window as any).__lastBoneMappingMap;
      if (results && results.length > 0) {
        setBoneMapping(results);
        if (map) setBoneMappingRaw(map);
      }
      const bones = (window as any).__modelBoneNames;
      if (bones && bones.length > 0) setModelBones(bones);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // 🔄 Listener para sincronizar estado de reproducción: cuando una animación de 1 sola vez termina,
  // restaurar activeAction a null para que los botones cambien inmediatamente de "Parar" a "Probar" / "play"
  useEffect(() => {
    const handleActionFinished = () => {
      if (actionTimeoutRef.current) {
        clearTimeout(actionTimeoutRef.current);
        actionTimeoutRef.current = null;
      }
      setActiveAction(null);
    };

    window.addEventListener('nova-action-ended', handleActionFinished);
    window.addEventListener('nova-animation-ended', handleActionFinished);
    window.addEventListener('nova-stop-animation', handleActionFinished);

    return () => {
      window.removeEventListener('nova-action-ended', handleActionFinished);
      window.removeEventListener('nova-animation-ended', handleActionFinished);
      window.removeEventListener('nova-stop-animation', handleActionFinished);
    };
  }, []);

  const triggerAction = useCallback((actionId: string | null, duration?: number) => {
    if (actionTimeoutRef.current) {
      clearTimeout(actionTimeoutRef.current);
      actionTimeoutRef.current = null;
    }

    if (!actionId) {
      setActiveAction(null);
      window.dispatchEvent(new CustomEvent('nova-stop-animation'));
      window.dispatchEvent(new CustomEvent('nova-multi-dance-stop'));
      window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: null } }));
      return;
    }

    // Si ya está activa esta acción y el usuario vuelve a hacer clic, la detenemos
    if (activeAction === actionId) {
      setActiveAction(null);
      window.dispatchEvent(new CustomEvent('nova-stop-animation'));
      window.dispatchEvent(new CustomEvent('nova-multi-dance-stop'));
      window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: null } }));
      return;
    }

    // Si la acción tiene un override a una animación externa o es directamente una animación externa
    const overrideName = gestureRegistry.getGestureOverride(actionId);
    const targetAnimName = overrideName || actionId;
    const externalAnim = animationStore.get(targetAnimName) || animationStore.get(actionId);
    const isLooping = !!externalAnim?.loop;
    if (externalAnim) {
      window.dispatchEvent(new CustomEvent('nova-load-animation', {
        detail: {
          url: externalAnim.url,
          name: externalAnim.name,
          type: externalAnim.type,
          autoplay: true,
          loop: isLooping
        }
      }));
    }

    setActiveAction(actionId);
    window.dispatchEvent(new CustomEvent('nova-action', { detail: { action: actionId } }));

    // Si no está en bucle y se pasa una duración fija o calculada, restaurar el botón a estado inactivo al terminar
    const animDuration = duration || (externalAnim?.duration ? externalAnim.duration * 1000 : 0);
    if (!isLooping && animDuration && animDuration > 0) {
      actionTimeoutRef.current = setTimeout(() => {
        setActiveAction(null);
      }, animDuration);
    }
  }, [activeAction]);

  const handleAnimationUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const fileList = Array.from(files);

    // Separar archivos por tipo
    const audioExts = ['mp3', 'wav', 'ogg', 'm4a', 'aac'];
    let motionFile: File | null = null;
    let cameraFile: File | null = null;
    let audioFile: File | null = null;
    let facialFile: File | null = null;
    const extraAnimFiles: File[] = [];

    for (const file of fileList) {
      const ext = file.name.split('.').pop()?.toLowerCase();
      if (audioExts.includes(ext || '')) {
        audioFile = file;
      } else if (ext === 'vmd') {
        const buf = await file.arrayBuffer();
        const insp = inspectVmd(buf);
        const lowerName = file.name.toLowerCase();
        const isFaceName = lowerName.includes('face') || lowerName.includes('facial') || lowerName.includes('lip') || lowerName.includes('mueca') || lowerName.includes('expresion');
        const isCamName = lowerName.includes('cam') || lowerName.includes('camera');

        if ((insp.hasMorphs && !insp.hasMotions) || (insp.hasMorphs && isFaceName && insp.motionCount < 10)) {
          facialFile = file;
        } else if ((insp.hasCameras && !insp.hasMotions) || isCamName) {
          cameraFile = file;
        } else {
          motionFile = file;
        }
      } else if (ext === 'fbx' || ext === 'glb') {
        if (!motionFile) motionFile = file;
        else extraAnimFiles.push(file);
      }
    }

    // Caso A: El usuario arrastró un archivo de expresiones faciales VMD de forma independiente
    if (!motionFile && facialFile) {
      const targetAnim = activeAction ? animationStore.get(activeAction) : storedAnims[storedAnims.length - 1];
      if (targetAnim) {
        setUploadStatus(`⏳ Vinculando facial ${facialFile.name} a "${targetAnim.name}"...`);
        await animationStore.setFacial(targetAnim.name, facialFile);
        setUploadStatus(`🎭 Expresiones faciales "${facialFile.name}" vinculadas a "${targetAnim.name}"`);
        setTimeout(() => setUploadStatus(''), 3500);
        return;
      }
    }

    // Caso B: El usuario arrastró un archivo de cámara VMD de forma independiente
    if (!motionFile && cameraFile) {
      const targetAnim = activeAction ? animationStore.get(activeAction) : storedAnims[storedAnims.length - 1];
      if (targetAnim) {
        setUploadStatus(`⏳ Vinculando cámara ${cameraFile.name} a "${targetAnim.name}"...`);
        await animationStore.setCamera(targetAnim.name, cameraFile);
        setUploadStatus(`🎥 Cámara "${cameraFile.name}" vinculada a "${targetAnim.name}"`);
        setTimeout(() => setUploadStatus(''), 3500);
        return;
      }
    }

    // Caso C: El usuario arrastró un archivo de audio independiente
    if (!motionFile && audioFile) {
      const targetAnim = activeAction ? animationStore.get(activeAction) : storedAnims[storedAnims.length - 1];
      if (targetAnim) {
        setUploadStatus(`⏳ Vinculando audio ${audioFile.name} a "${targetAnim.name}"...`);
        await animationStore.setAudio(targetAnim.name, audioFile);
        setUploadStatus(`🎵 Audio "${audioFile.name}" vinculado a "${targetAnim.name}"`);
        setTimeout(() => setUploadStatus(''), 3500);
        return;
      }
    }

    // Caso D: Hay un archivo de animación/baile principal (y opcionalmente audio, cámara o facial en el mismo drop)
    const animsToProcess = motionFile ? [motionFile, ...extraAnimFiles] : extraAnimFiles;
    for (const file of animsToProcess) {
      const ext = file.name.split('.').pop()?.toLowerCase() as 'glb' | 'fbx' | 'vmd';
      if (ext !== 'glb' && ext !== 'fbx' && ext !== 'vmd') continue;
      setUploadStatus(`⏳ Cargando ${file.name}...`);
      try {
        const url = URL.createObjectURL(file);
        const animName = file.name.replace(/\.(glb|fbx|vmd)$/i, '');

        let hasCamera = false;
        let hasFacial = false;
        if (ext === 'vmd') {
          const buf = await file.arrayBuffer();
          const insp = inspectVmd(buf);
          hasCamera = insp.hasCameras;
          hasFacial = insp.hasMorphs;
        }

        await animationStore.add({
          name: animName,
          url,
          type: ext,
          source: ext === 'vmd' ? 'custom' : 'mixamo',
          hasCamera,
          useCamera: true,
          hasFacial: hasFacial || !!facialFile,
          useFacial: true
        }, file);

        // Si se subió un archivo de expresiones faciales separado junto con el baile, vincularlo
        if (facialFile) {
          await animationStore.setFacial(animName, facialFile);
        }

        // Si se subió un archivo de cámara separado junto con el baile, vincularlo
        if (cameraFile) {
          await animationStore.setCamera(animName, cameraFile);
        }

        // Si se subió un archivo de audio junto con el baile, vincularlo
        if (audioFile) {
          await animationStore.setAudio(animName, audioFile);
        }

        window.dispatchEvent(new CustomEvent('nova-load-animation', {
          detail: { url, name: animName, type: ext, autoplay: false }
        }));

        let msg = `✅ "${animName}" cargado`;
        if (facialFile || hasFacial) msg += ' con facial 🎭';
        if (cameraFile || hasCamera) msg += ' con cámara 🎥';
        if (audioFile) msg += ' y audio 🎵';
        setUploadStatus(msg);
        setTimeout(() => setUploadStatus(''), 4000);
      } catch {
        setUploadStatus(`❌ Error cargando ${file.name}`);
      }
    }
  }, [activeAction, storedAnims]);

  const handleModelUpload = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    const file = files[0];
    const ext = file.name.split('.').pop()?.toLowerCase();
    const isArchive = ['zip', 'rar', '7z', 'tar'].includes(ext || '') ||
      file.name.toLowerCase().endsWith('.tar.gz') || file.name.toLowerCase().endsWith('.tar.bz2');
    if (ext !== 'glb' && ext !== 'vrm' && ext !== 'pmx' && ext !== 'pmd' && !isArchive) {
      setUploadStatus(`❌ Usa .glb, .vrm, .pmx, o paquete comprimido (.zip .rar .7z .tar.gz)`);
      return;
    }
    setUploadStatus(`⏳ Guardando modelo ${file.name}...`);
    try {
      const finalUrl = await modelStore.saveModel(file);
      updateAvatar({ modelUrl: finalUrl });
      setUploadStatus(`✅ Modelo "${file.name}" guardado en caché permanente`);
      setTimeout(() => setUploadStatus(''), 3500);
    } catch (err) {
      console.error('Error guardando modelo:', err);
      setUploadStatus(`❌ Error guardando modelo`);
    }
  }, [updateAvatar]);

  const handleResetDefaultModel = useCallback(async () => {
    await modelStore.clearModel();
    updateAvatar({ modelUrl: '/models/grokani_lipsync.glb' });
    setUploadStatus('✅ Restaurado al modelo por defecto');
    setTimeout(() => setUploadStatus(''), 3000);
  }, [updateAvatar]);

  const handleSelectAudioForAnim = useCallback((animName: string) => {
    selectedAnimForAudioRef.current = animName;
    audioInputRef.current?.click();
  }, []);

  const handleAudioFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const animName = selectedAnimForAudioRef.current;
    if (!file || !animName) return;
    try {
      setUploadStatus(`⏳ Asignando audio ${file.name} a "${animName}"...`);
      await animationStore.setAudio(animName, file);
      setUploadStatus(`🎵 Audio "${file.name}" guardado para "${animName}"`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error asignando audio`);
    } finally {
      if (audioInputRef.current) audioInputRef.current.value = '';
      selectedAnimForAudioRef.current = null;
    }
  }, []);

  const handleRemoveAudioForAnim = useCallback(async (animName: string) => {
    await animationStore.removeAudio(animName);
    setUploadStatus(`🗑️ Audio removido de "${animName}"`);
    setTimeout(() => setUploadStatus(''), 2500);
  }, []);

  const handleSelectCameraForAnim = useCallback((animName: string) => {
    selectedAnimForCameraRef.current = animName;
    cameraInputRef.current?.click();
  }, []);

  const handleCameraFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const animName = selectedAnimForCameraRef.current;
    if (!file || !animName) return;
    try {
      setUploadStatus(`⏳ Asignando cámara ${file.name} a "${animName}"...`);
      await animationStore.setCamera(animName, file);
      setUploadStatus(`🎥 Cámara "${file.name}" vinculada a "${animName}"`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error asignando cámara VMD`);
    } finally {
      if (cameraInputRef.current) cameraInputRef.current.value = '';
      selectedAnimForCameraRef.current = null;
    }
  }, []);

  const handleRemoveCameraForAnim = useCallback(async (animName: string) => {
    await animationStore.removeCamera(animName);
    setUploadStatus(`🗑️ Cámara desvinculada de "${animName}"`);
    setTimeout(() => setUploadStatus(''), 2500);
  }, []);

  const handleToggleCameraForAnim = useCallback((animName: string) => {
    const isEnabled = animationStore.toggleCamera(animName);
    setUploadStatus(isEnabled ? `🎥 Cámara cinemática activada` : `🎥 Cámara cinemática desactivada (fija/libre)`);
    setTimeout(() => setUploadStatus(''), 2500);
  }, []);

  const handleSelectFacialForAnim = useCallback((animName: string) => {
    selectedAnimForFacialRef.current = animName;
    facialInputRef.current?.click();
  }, []);

  const handleFacialFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const animName = selectedAnimForFacialRef.current;
    if (!file || !animName) return;
    try {
      setUploadStatus(`⏳ Asignando expresiones faciales ${file.name} a "${animName}"...`);
      await animationStore.setFacial(animName, file);
      setUploadStatus(`🎭 Expresiones faciales "${file.name}" vinculadas a "${animName}"`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error asignando archivo facial VMD`);
    } finally {
      if (facialInputRef.current) facialInputRef.current.value = '';
      selectedAnimForFacialRef.current = null;
    }
  }, []);

  const handleRemoveFacialForAnim = useCallback(async (animName: string) => {
    await animationStore.removeFacial(animName);
    setUploadStatus(`🗑️ Expresiones faciales desvinculadas de "${animName}"`);
    setTimeout(() => setUploadStatus(''), 2500);
  }, []);

  const handleToggleFacialForAnim = useCallback((animName: string) => {
    const isEnabled = animationStore.toggleFacial(animName);
    setUploadStatus(isEnabled ? `🎭 Expresiones faciales activadas` : `🎭 Expresiones faciales desactivadas`);
    setTimeout(() => setUploadStatus(''), 2500);
  }, []);

  const handleSelectExtraMotionFile = useCallback((animName: string, dancerId: string, name: string, role: string, offsetX: number, offsetZ: number = 0) => {
    selectedExtraMotionTargetRef.current = { animName, dancerId, name, role, offsetX, offsetZ };
    extraMotionInputRef.current?.click();
  }, []);

  const handleExtraMotionFileChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const target = selectedExtraMotionTargetRef.current;
    if (!file || !target) return;
    try {
      setUploadStatus(`⏳ Asignando motion ${file.name} a ${target.name}...`);
      await animationStore.setExtraMotionFile(
        target.animName,
        target.dancerId,
        target.name,
        target.role,
        file,
        target.offsetX,
        target.offsetZ
      );
      setUploadStatus(`💃 Motion "${file.name}" asignado a ${target.name}`);
      setTimeout(() => setUploadStatus(''), 3000);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error asignando motion VMD`);
    } finally {
      if (extraMotionInputRef.current) extraMotionInputRef.current.value = '';
      selectedExtraMotionTargetRef.current = null;
    }
  }, []);

  const handlePickExtraMotionFromLibrary = useCallback(async (sourceAnim: StoredAnimation) => {
    const target = pickingLibraryForExtra;
    if (!target) return;
    try {
      setUploadStatus(`⏳ Asignando "${sourceAnim.displayName || sourceAnim.name}" a ${target.name}...`);
      await animationStore.setExtraMotionFromExisting(
        target.animName,
        target.dancerId,
        target.name,
        target.role,
        sourceAnim.name,
        target.offsetX,
        target.offsetZ
      );
      setUploadStatus(`💃 "${sourceAnim.displayName || sourceAnim.name}" asignado a ${target.name}`);
      setTimeout(() => setUploadStatus(''), 3000);
      setPickingLibraryForExtra(null);
    } catch (err) {
      console.error(err);
      setUploadStatus(`❌ Error asignando motion de biblioteca`);
    }
  }, [pickingLibraryForExtra]);

  const handleRemoveExtraMotion = useCallback(async (animName: string, dancerId: string) => {
    await animationStore.removeExtraMotion(animName, dancerId);
    setUploadStatus(`🗑️ Bailarín removido`);
    setTimeout(() => setUploadStatus(''), 2500);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); }, []);
  const handleDragLeave = useCallback(() => setIsDragging(false), []);
  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (activeTab === 'model') handleModelUpload(e.dataTransfer.files);
    else handleAnimationUpload(e.dataTransfer.files);
  }, [activeTab, handleAnimationUpload, handleModelUpload]);

  const tabs: { id: Tab; label: string; icon: string }[] = [
    { id: 'model', label: 'Modelo', icon: 'face' },
    { id: 'stage', label: 'Escenario', icon: 'theater_comedy' },
    { id: 'clothing', label: 'Ropa', icon: 'checkroom' },
    { id: 'gestures', label: 'Gestos', icon: 'waving_hand' },
    { id: 'animations', label: 'Anims', icon: 'animation' },
    { id: 'calibration', label: 'Calibrar', icon: 'tune' },
    { id: 'learning', label: 'Aprendizaje', icon: 'psychology' },
  ];

  return (
    <div className="flex flex-col md:flex-row h-full overflow-hidden bg-[#0e0e18]">
      {/* LEFT PANEL - Controles */}
      <div className="w-full md:w-[360px] lg:w-[420px] shrink-0 bg-[#0e0e18] border-b md:border-b-0 md:border-r border-white/5 flex flex-col overflow-hidden min-h-0 max-h-[50vh] md:max-h-full">
        <div className="px-4 sm:px-5 pt-3 sm:pt-5 pb-2 sm:pb-3">
          <h1 className="text-base sm:text-lg font-bold flex items-center gap-2">
            <span className="material-symbols-outlined text-lg sm:text-xl text-violet-400">theater_comedy</span>
            Avatar Studio
          </h1>
        </div>

        <div className="flex flex-wrap px-2 gap-0.5 border-b border-white/5">
          {tabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`flex items-center justify-center gap-1 px-2 py-2 text-[9px] sm:text-[10px] font-semibold uppercase tracking-wider border-b-2 transition-all min-w-[18%] grow ${activeTab === tab.id ? 'border-violet-400 text-violet-400' : 'border-transparent text-slate-500 hover:text-slate-300'
                }`}>
              <span className="material-symbols-outlined text-xs">{tab.icon}</span>
              {tab.label}
              {tab.id === 'animations' && storedAnims.length > 0 && (
                <span className="bg-violet-500/30 text-violet-300 text-[8px] px-1 rounded-full ml-0.5">{storedAnims.length}</span>
              )}
            </button>
          ))}
        </div>

        {uploadStatus && (
          <div className={`mx-3 mt-3 px-3 py-2 rounded-lg text-[10px] font-medium ${uploadStatus.startsWith('✅') ? 'bg-emerald-500/10 text-emerald-400' :
              uploadStatus.startsWith('❌') ? 'bg-red-500/10 text-red-400' :
                'bg-blue-500/10 text-blue-400'
            }`}>{uploadStatus}</div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto overflow-x-hidden p-4 space-y-4 custom-scrollbar">

          {/* ═══ TAB: MODELO ═══ */}
          {activeTab === 'model' && (<>
            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Modelos Detectados ({availableModels.length})</label>
              <div className="grid grid-cols-2 gap-2">
                {availableModels.map(p => (
                  <button key={p.url} onClick={() => updateAvatar({ modelUrl: p.url })}
                    className={`p-3 rounded-xl border-2 transition-all text-center group ${avatar.modelUrl === p.url
                        ? 'border-violet-500 bg-violet-500/10 shadow-lg shadow-violet-500/10'
                        : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                      }`}>
                    <span className="text-2xl block mb-1 group-hover:scale-110 transition-transform">{p.emoji || '📦'}</span>
                    <span className={`text-[9px] font-bold block truncate ${avatar.modelUrl === p.url ? 'text-violet-400' : 'text-slate-400'}`}>
                      {p.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => modelInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-all ${isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 hover:border-violet-500/30'
                }`}>
              <span className="material-symbols-outlined text-2xl text-slate-600 mb-1 block">deployed_code</span>
              <p className="text-[10px] text-slate-400">Arrastra modelo .glb / .vrm / .pmx / .zip / .rar / .7z</p>
              <p className="text-[8px] text-slate-500 mt-0.5">Se guarda automáticamente en tu navegador</p>
              <input ref={modelInputRef} type="file" accept=".glb,.vrm,.pmx,.pmd,.zip,.rar,.7z,.tar,.tar.gz,.tar.bz2" className="hidden"
                onChange={(e) => handleModelUpload(e.target.files)} />
            </div>

            {/* 💾 Biblioteca de Modelos Guardados en IndexedDB */}
            {savedModelList.length > 0 && (
              <div className="bg-white/[0.02] border border-violet-500/20 rounded-xl p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-violet-400 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-sm">inventory_2</span>
                    Modelos Guardados ({savedModelList.length})
                  </label>
                  <span className="text-[8px] text-slate-500">Persisten al reiniciar</span>
                </div>

                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {savedModelList.map(item => {
                    const isActive = savedModelInfo?.fileName === item.fileName;
                    return (
                      <div
                        key={item.fileName}
                        className={`flex items-center justify-between p-2 rounded-lg border transition-all ${isActive
                            ? 'bg-violet-600/20 border-violet-500 text-white shadow-sm'
                            : 'bg-black/20 border-white/5 hover:border-white/20 text-slate-300'
                          }`}
                      >
                        <button
                          type="button"
                          onClick={async () => {
                            setUploadStatus(`⏳ Cargando modelo ${item.fileName}...`);
                            const res = await modelStore.loadModelByName(item.fileName);
                            if (res) {
                              updateAvatar({ modelUrl: res.url });
                              setUploadStatus(`✅ Modelo "${item.fileName}" activado`);
                              setTimeout(() => setUploadStatus(''), 3000);
                            }
                          }}
                          className="flex items-center gap-2 flex-1 text-left min-w-0"
                          title="Clic para activar este modelo"
                        >
                          <span className={`material-symbols-outlined text-sm shrink-0 ${isActive ? 'text-violet-400' : 'text-slate-500'}`}>
                            {isActive ? 'check_circle' : 'deployed_code'}
                          </span>
                          <div className="min-w-0 truncate">
                            <span className="text-[10px] font-bold block truncate">{item.fileName}</span>
                            <span className="text-[8px] text-slate-500 block">
                              .{item.fileType} • {(item.fileSize / (1024 * 1024)).toFixed(1)} MB {isActive ? '• ACTIVO' : ''}
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`¿Eliminar "${item.fileName}" de tus modelos guardados?`)) {
                              await modelStore.deleteSavedModel(item.fileName);
                              const list = await modelStore.getAllSavedModels();
                              setSavedModelList(list);
                              if (isActive) {
                                handleResetDefaultModel();
                              }
                            }
                          }}
                          className="p-1 text-slate-500 hover:text-red-400 transition-colors ml-1"
                          title="Eliminar de la biblioteca"
                        >
                          <span className="material-symbols-outlined text-xs">delete</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="relative">
              <input type="text" placeholder="URL de modelo (.glb, .pmx, .zip)..."
                className="w-full bg-[#15151e] border border-white/5 text-white text-[10px] rounded-lg pl-3 pr-14 py-2 outline-none focus:border-violet-500/50 transition-all"
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    const val = e.currentTarget.value;
                    if (val.includes('.glb') || val.includes('.vrm') || val.includes('.pmx') || val.includes('.zip')) updateAvatar({ modelUrl: val });
                  }
                }} />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[8px] text-slate-600 font-bold">ENTER</span>
            </div>

            <div className="h-px bg-white/5"></div>

            <div>
              <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-2">Color de Cabello</label>
              <div className="flex gap-2 flex-wrap">
                {HAIR_COLORS.map(hc => (
                  <button key={hc.color} onClick={() => updateAvatar({ hairColor: hc.color })}
                    title={hc.name}
                    className={`w-7 h-7 rounded-full border-2 transition-transform hover:scale-110 ${avatar.hairColor === hc.color ? 'border-white ring-2 ring-violet-500 shadow-lg' : 'border-transparent'
                      }`}
                    style={{ backgroundColor: hc.color }} />
                ))}
              </div>
            </div>

            {setAllowWebSearch && (
              <>
                <div className="h-px bg-white/5"></div>
                <div className="flex items-center justify-between bg-white/[0.02] p-3 rounded-lg border border-white/5">
                  <div>
                    <span className="text-xs font-bold block">Búsqueda Web</span>
                    <span className="text-[9px] text-slate-500">Nova busca en Google</span>
                  </div>
                  <button onClick={() => setAllowWebSearch(!allowWebSearch)}
                    className={`w-10 h-5 rounded-full p-0.5 transition-all ${allowWebSearch ? 'bg-violet-600' : 'bg-slate-700'}`}>
                    <div className={`h-4 w-4 bg-white rounded-full transition-all ${allowWebSearch ? 'translate-x-5' : 'translate-x-0'}`}></div>
                  </button>
                </div>
              </>
            )}
          </>)}

          {/* ═══ TAB: ESCENARIOS (STAGES) ═══ */}
          {activeTab === 'stage' && (<>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-2">
                  Escenarios Disponibles ({stageList.length})
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {stageList.map(st => (
                    <button
                      key={st.id}
                      onClick={() => stageStore.setActiveStage(st.id)}
                      className={`p-3 rounded-xl border-2 transition-all text-left group relative ${activeStageId === st.id
                          ? 'border-cyan-500 bg-cyan-500/10 shadow-lg shadow-cyan-500/10'
                          : 'border-white/5 bg-white/[0.02] hover:border-white/20'
                        }`}
                    >
                      <span className="text-2xl block mb-1 group-hover:scale-110 transition-transform">{st.icon}</span>
                      <span className={`text-[10px] font-bold block truncate ${activeStageId === st.id ? 'text-cyan-400' : 'text-slate-300'}`}>
                        {st.name}
                      </span>
                      <span className="text-[8px] text-slate-500 block truncate mt-0.5">
                        {st.description}
                      </span>
                      {st.type === 'custom' && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            stageStore.deleteCustomStage(st.id);
                          }}
                          className="absolute top-2 right-2 text-slate-500 hover:text-red-400 text-xs"
                          title="Eliminar escenario"
                        >
                          ✕
                        </button>
                      )}
                    </button>
                  ))}
                </div>
              </div>

              {/* Zona de subida de escenarios MMD y 3D */}
              <div
                onClick={() => stageInputRef.current?.click()}
                className="border-2 border-dashed border-white/10 hover:border-cyan-500/30 rounded-xl p-4 text-center cursor-pointer transition-all"
              >
                <span className="material-symbols-outlined text-2xl text-cyan-400 mb-1 block">theater_comedy</span>
                <p className="text-[10px] text-slate-300 font-bold">Cargar Escenario MMD / 3D (.pmx, .zip, .rar, .glb)</p>
                <p className="text-[8px] text-slate-500 mt-0.5">Soporta stages completos con texturas en archivo comprimido</p>
                <input
                  ref={stageInputRef}
                  type="file"
                  accept=".pmx,.glb,.gltf,.zip,.rar,.7z"
                  className="hidden"
                  onChange={(e) => handleStageUpload(e.target.files)}
                />
              </div>

              <div className="bg-cyan-950/20 border border-cyan-500/20 rounded-xl p-3 text-[9px] text-slate-400 leading-relaxed">
                <span className="text-cyan-300 font-bold block mb-1">💡 Consejos para Stages MMD</span>
                Los escenarios MMD suelen venir en carpetas con un archivo <code className="text-white">.pmx</code> y texturas. Puedes comprimir esa carpeta en un archivo <code className="text-white">.zip</code> o <code className="text-white">.rar</code> y soltarlo directamente aquí.
              </div>
            </div>
          </>)}



          {/* ═══ TAB: ROPA ═══ */}
          {activeTab === 'clothing' && (<>
            <div className="flex flex-col gap-3">
              {/* Encabezado y Resumen del Modelo Activo */}
              <div className="flex items-center justify-between bg-white/[0.02] border border-white/5 p-2.5 rounded-xl">
                <div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-bold text-white">Guardarropa 3D</span>
                    <span className="text-[9px] px-1.5 py-0.2 bg-violet-500/20 text-violet-300 border border-violet-500/30 rounded font-semibold">
                      {avatar.modelUrl?.split('/').pop()?.replace('.glb', '') || 'Modelo'}
                    </span>
                  </div>
                  <p className="text-[9px] text-slate-400 mt-0.5">
                    Personaliza prendas individuales. Se guardan por modelo.
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-bold text-cyan-400">
                    {clothingItems.filter(i => i.visible).length} / {clothingItems.length}
                  </span>
                  <span className="text-[9px] text-slate-500 block">visibles</span>
                </div>
              </div>

              {/* Presets Rápidos */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">Presets Rápidos</label>
                <div className="grid grid-cols-4 gap-1.5">
                  <button
                    onClick={() => handleApplyClothingPreset('dressed')}
                    className="p-2 bg-white/[0.03] hover:bg-white/[0.07] border border-white/10 hover:border-violet-500/40 rounded-xl text-center transition-all group"
                    title="Vestir todas las prendas"
                  >
                    <span className="text-lg block group-hover:scale-110 transition-transform">👗</span>
                    <span className="text-[9px] font-bold block text-slate-200">Vestida</span>
                  </button>
                  <button
                    onClick={() => handleApplyClothingPreset('underwear')}
                    className="p-2 bg-pink-500/5 hover:bg-pink-500/15 border border-pink-500/20 hover:border-pink-500/40 rounded-xl text-center transition-all group"
                    title="Solo ropa interior y accesorios"
                  >
                    <span className="text-lg block group-hover:scale-110 transition-transform">🩱</span>
                    <span className="text-[9px] font-bold block text-pink-300">Lencería</span>
                  </button>
                  <button
                    onClick={() => handleApplyClothingPreset('accessories')}
                    className="p-2 bg-amber-500/5 hover:bg-amber-500/15 border border-amber-500/20 hover:border-amber-500/40 rounded-xl text-center transition-all group"
                    title="Solo accesorios y joyería"
                  >
                    <span className="text-lg block group-hover:scale-110 transition-transform">🎀</span>
                    <span className="text-[9px] font-bold block text-amber-300">Accesorios</span>
                  </button>
                  <button
                    onClick={() => handleApplyClothingPreset('nude')}
                    className="p-2 bg-red-500/5 hover:bg-red-500/15 border border-red-500/20 hover:border-red-500/40 rounded-xl text-center transition-all group"
                    title="Quitar todas las prendas removibles"
                  >
                    <span className="text-lg block group-hover:scale-110 transition-transform">✨</span>
                    <span className="text-[9px] font-bold block text-red-300">Desnuda</span>
                  </button>
                </div>
              </div>

              {/* Filtro por Categorías */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                {CLOTHING_CATEGORIES.map(cat => {
                  const count = cat.id === 'all'
                    ? clothingItems.length
                    : clothingItems.filter(i => i.category === cat.category).length;

                  if (count === 0 && cat.id !== 'all') return null;

                  return (
                    <button
                      key={cat.id}
                      onClick={() => setClothingCategoryFilter(cat.id)}
                      className={`px-2.5 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${clothingCategoryFilter === cat.id
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                      <span className="text-[8px] opacity-70">({count})</span>
                    </button>
                  );
                })}
              </div>

              {/* Buscador de prendas */}
              <div className="relative">
                <input
                  type="text"
                  value={clothingSearch}
                  onChange={(e) => setClothingSearch(e.target.value)}
                  placeholder="🔍 Buscar prenda o accesorio..."
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-violet-500"
                />
                {clothingSearch && (
                  <button
                    onClick={() => setClothingSearch('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Listado de Categorías y Checkboxes de Prendas */}
              {clothingItems.length === 0 ? (
                <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl text-center">
                  <span className="text-2xl block mb-2 opacity-50">👗</span>
                  <p className="text-xs font-semibold text-slate-300">Sin prendas separables detectadas</p>
                  <p className="text-[9px] text-slate-500 mt-1 max-w-xs mx-auto">
                    El modelo cargado puede tener una sola malla unificada o aún se está inicializando en el visor 3D.
                  </p>
                  <button
                    onClick={() => {
                      const cm = getClothingManager();
                      setClothingItems([...cm.getItems()]);
                    }}
                    className="mt-3 px-3 py-1 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-[10px] font-bold text-cyan-300"
                  >
                    🔄 Re-escanear mallas
                  </button>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  {CLOTHING_CATEGORIES.filter(c => c.category).map(cat => {
                    let itemsInCat = clothingItems.filter(i => i.category === cat.category);
                    if (clothingSearch) {
                      const q = clothingSearch.toLowerCase();
                      itemsInCat = itemsInCat.filter(i =>
                        i.displayName.toLowerCase().includes(q) ||
                        i.name.toLowerCase().includes(q)
                      );
                    }

                    if (clothingCategoryFilter !== 'all' && clothingCategoryFilter !== cat.id) {
                      return null;
                    }

                    if (itemsInCat.length === 0) return null;

                    const allVisible = itemsInCat.every(i => i.visible);
                    const noneVisible = itemsInCat.every(i => !i.visible);

                    return (
                      <div key={cat.id} className="bg-white/[0.02] border border-white/5 rounded-xl p-2.5">
                        {/* Cabecera de Categoría */}
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">{cat.icon}</span>
                            <span className="text-[10px] font-bold text-slate-300 uppercase tracking-wide">
                              {cat.label}
                            </span>
                            <span className="text-[9px] text-slate-500">
                              ({itemsInCat.filter(i => i.visible).length}/{itemsInCat.length})
                            </span>
                          </div>

                          {/* Botones de acción masiva */}
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleToggleClothingCategory(cat.category!, true)}
                              title="Mostrar todas en esta categoría"
                              className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded text-[8px] font-semibold text-cyan-300 transition-colors"
                            >
                              Mostrar
                            </button>
                            <button
                              onClick={() => handleToggleClothingCategory(cat.category!, false)}
                              title="Ocultar todas en esta categoría"
                              className="px-1.5 py-0.5 bg-white/5 hover:bg-white/15 border border-white/10 rounded text-[8px] font-semibold text-slate-400 hover:text-red-300 transition-colors"
                            >
                              Ocultar
                            </button>
                          </div>
                        </div>

                        {/* Lista de Items con Checkbox */}
                        <div className="flex flex-col gap-1.5">
                          {itemsInCat.map(item => (
                            <div
                              key={item.name}
                              onClick={() => handleToggleClothingItem(item.name, !item.visible)}
                              className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${item.visible
                                  ? 'bg-violet-950/20 border-violet-500/30 hover:bg-violet-950/30'
                                  : 'bg-black/20 border-white/5 hover:bg-white/[0.02] opacity-60'
                                }`}
                            >
                              <div className="flex items-center gap-2.5 overflow-hidden">
                                {/* Custom Checkbox */}
                                <div className={`w-4 h-4 rounded flex items-center justify-center transition-all ${item.visible
                                    ? 'bg-violet-600 border border-violet-400 text-white shadow-sm shadow-violet-500/50'
                                    : 'border border-slate-600 bg-black/40'
                                  }`}>
                                  {item.visible && <span className="text-[10px] font-black">✓</span>}
                                </div>

                                {/* Textos */}
                                <div className="truncate">
                                  <span className={`text-[10px] font-bold block truncate ${item.visible ? 'text-white' : 'text-slate-400'
                                    }`}>
                                    {item.displayName}
                                  </span>
                                  <span className="text-[8px] text-slate-500 block truncate font-mono">
                                    {item.name}
                                  </span>
                                </div>
                              </div>

                              {/* Indicador visual de estado */}
                              <div className="flex items-center gap-1.5 shrink-0 pl-2">
                                <span className={`text-[9px] px-1.5 py-0.2 rounded font-medium ${item.visible
                                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                                    : 'bg-slate-800 text-slate-500 border border-slate-700/50'
                                  }`}>
                                  {item.visible ? 'Visible' : 'Oculto'}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>)}

          {/* ═══ TAB: GESTOS ═══ */}
          {activeTab === 'gestures' && (<>
            <div className="flex flex-col gap-3">

              {/* ── SECCIÓN: POSES IDLE & GESTOS DE HABLA PERSONALIZABLES ── */}
              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-3">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <label className="text-[10px] font-bold text-violet-300 uppercase tracking-wider block flex items-center gap-1">
                      <span>🎭</span> Poses Idle & Gestos de Habla
                    </label>
                    <p className="text-[8px] text-slate-500">Reemplaza las poses base de reposo y de habla con animaciones de tu biblioteca</p>
                  </div>
                  <span className="text-[8px] px-2 py-0.5 rounded-full bg-violet-950/70 text-violet-300 border border-violet-500/30">
                    {Object.keys(idleOverrides).length} / {IDLE_SLOT_DEFINITIONS.length} personalizados
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {IDLE_SLOT_DEFINITIONS.map(slot => {
                    const overrideAnim = idleOverrides[slot.id];
                    const assigned = overrideAnim ? animationStore.get(overrideAnim) : null;
                    const isPlaying = activeAction === overrideAnim;

                    return (
                      <div
                        key={slot.id}
                        className={`p-2.5 rounded-xl border transition-all flex flex-col justify-between ${overrideAnim
                            ? 'bg-violet-950/20 border-violet-500/40 shadow-sm'
                            : 'bg-black/20 border-white/5 hover:border-white/10'
                          }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-base">{slot.icon}</span>
                            <div>
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] font-bold text-white">{slot.label}</span>
                                <span className={`text-[7px] px-1 py-0.2 rounded font-semibold uppercase ${slot.group === 'idle' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                                  }`}>
                                  {slot.group === 'idle' ? 'Reposo' : 'Habla'}
                                </span>
                              </div>
                              <p className="text-[8px] text-slate-400 line-clamp-1">{slot.description}</p>
                            </div>
                          </div>
                        </div>

                        {overrideAnim && (
                          <div className="mt-2 py-1 px-2 rounded bg-violet-500/10 border border-violet-500/20 text-[8px] text-violet-300 flex items-center justify-between">
                            <span className="truncate font-medium">🎬 {assigned?.name || overrideAnim}</span>
                            <span className="text-[7px] text-violet-400 shrink-0 ml-1">Custom</span>
                          </div>
                        )}

                        <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-white/5">
                          {overrideAnim ? (
                            <>
                              <button
                                onClick={() => triggerAction(overrideAnim)}
                                className={`flex-1 py-1 rounded text-[9px] font-bold flex items-center justify-center gap-1 transition-all ${isPlaying ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20 text-white'
                                  }`}
                              >
                                <span className="material-symbols-outlined text-[11px]">
                                  {isPlaying ? 'pause' : 'play_arrow'}
                                </span>
                                {isPlaying ? 'Parar' : 'Probar'}
                              </button>
                              <button
                                onClick={() => setAssigningIdleSlot(slot)}
                                className="px-2 py-1 rounded text-[9px] font-medium bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40"
                              >
                                Cambiar
                              </button>
                              <button
                                onClick={() => idleOverrideRegistry.removeOverride(slot.id)}
                                className="p-1 rounded text-slate-400 hover:text-red-300 hover:bg-red-500/10"
                                title="Restaurar a procedural"
                              >
                                <span className="material-symbols-outlined text-[12px]">restart_alt</span>
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => setAssigningIdleSlot(slot)}
                              className="w-full py-1 rounded text-[9px] font-semibold bg-white/5 hover:bg-violet-600/30 text-slate-300 hover:text-white border border-white/5 hover:border-violet-500/40 transition-all flex items-center justify-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[11px]">add_circle</span>
                              Reemplazar por Animación
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* ── SECCIÓN: CATÁLOGO DE GESTOS ACCIONABLES ── */}
              <div className="flex items-center justify-between mt-1">
                <div>
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Catálogo de Gestos</label>
                  <p className="text-[9px] text-slate-500">Reemplaza gestos procedurales o crea nuevos para Nova</p>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setShowCreateGestureModal(true)}
                    className="px-2.5 py-1 rounded-lg text-[9px] font-bold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow flex items-center gap-1 transition-all cursor-pointer"
                  >
                    <span>＋</span>
                    <span>Nuevo Gesto</span>
                  </button>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-cyan-950/70 text-cyan-300 border border-cyan-500/30">
                    {gestureOverrides.size} con VMD / Pack
                  </span>
                </div>
              </div>

              {/* Filtro de Categorías de Gestos (Base + Personalizadas) */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                {[...GESTURE_CATEGORIES, ...customGestureCategories].map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setGestureCategoryFilter(cat.id)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${gestureCategoryFilter === cat.id
                        ? 'bg-violet-600 text-white shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                    {/* Botón eliminar para categorías personalizadas */}
                    {cat.id.startsWith('gcat_') && (
                      <span
                        role="button"
                        onClick={(e) => { e.stopPropagation(); handleDeleteCustomGestureCategory(cat.id); }}
                        className="ml-0.5 text-[9px] text-red-400 hover:text-red-300"
                        title="Eliminar categoría"
                      >✕</span>
                    )}
                  </button>
                ))}
                {/* Botón para añadir nueva categoría de gestos */}
                <button
                  onClick={() => setShowNewGestureCatForm(v => !v)}
                  className="px-2 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-500/30 flex items-center gap-1 transition-all"
                  title="Crear categoría de gestos personalizada"
                >
                  <span>＋</span><span>Nueva Cat.</span>
                </button>
              </div>

              {/* Formulario inline para nueva categoría de gestos */}
              {showNewGestureCatForm && (
                <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                  <input
                    type="text"
                    value={newGestureCatIcon}
                    onChange={e => setNewGestureCatIcon(e.target.value)}
                    maxLength={2}
                    className="w-9 text-center bg-black/30 border border-white/10 rounded px-1 py-1 text-sm outline-none focus:border-emerald-400"
                    placeholder="✨"
                  />
                  <input
                    type="text"
                    value={newGestureCatLabel}
                    onChange={e => setNewGestureCatLabel(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleAddCustomGestureCategory()}
                    placeholder="Nombre de categoría para gestos..."
                    className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder:text-slate-600 outline-none focus:border-emerald-400"
                  />
                  <button
                    onClick={handleAddCustomGestureCategory}
                    className="px-2 py-1 rounded text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                  >Crear</button>
                  <button
                    onClick={() => setShowNewGestureCatForm(false)}
                    className="text-slate-400 hover:text-white text-xs px-1"
                  >✕</button>
                </div>
              )}

              {/* Buscador de Gestos */}
              <div className="relative">
                <input
                  type="text"
                  value={gestureSearch}
                  onChange={(e) => setGestureSearch(e.target.value)}
                  placeholder="🔍 Buscar gesto (ej. saludar, reverencia, baile)..."
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-violet-500"
                />
                {gestureSearch && (
                  <button
                    onClick={() => setGestureSearch('')}
                    className="absolute right-2 top-1.5 text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Grid de Gestos */}
              <div className="grid grid-cols-2 gap-2 max-h-[50vh] overflow-y-auto pr-1">
                {gestureRegistry.getAllStandard()
                  .filter(g => {
                    if (gestureCategoryFilter !== 'all' && g.category !== gestureCategoryFilter) return false;
                    if (gestureSearch) {
                      const q = gestureSearch.toLowerCase();
                      return g.name.toLowerCase().includes(q) || g.id.toLowerCase().includes(q) || g.description.toLowerCase().includes(q);
                    }
                    return true;
                  })
                  .map(g => {
                    const overrideName = gestureOverrides.get(g.id);
                    const assignedAnim = overrideName ? animationStore.get(overrideName) : null;
                    const isPlaying = activeAction === g.id || (overrideName && activeAction === overrideName);
                    const isUserCreated = gestureRegistry.isUserGesture(g.id);

                    return (
                      <div
                        key={g.id}
                        className={`flex flex-col justify-between p-2.5 rounded-xl border transition-all ${isPlaying
                            ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.2)]'
                            : overrideName
                              ? 'bg-white/[0.04] border-cyan-500/30 hover:border-cyan-500/50'
                              : isUserCreated
                                ? 'bg-violet-950/20 border-violet-500/30 hover:border-violet-500/50'
                                : 'bg-white/[0.02] border-white/5 hover:border-violet-500/30'
                          }`}
                      >
                        <div>
                          {/* Encabezado: Icono, Nombre e ID */}
                          <div className="flex items-start justify-between gap-1 mb-1">
                            <div className="flex items-center gap-1.5 min-w-0">
                              <span className="text-base shrink-0">{g.icon || '✨'}</span>
                              <div className="min-w-0">
                                <span className="text-[11px] font-bold text-white block truncate leading-tight">
                                  {g.name}
                                </span>
                                <span className="text-[8px] font-mono text-slate-500 block truncate">
                                  {g.id}
                                </span>
                              </div>
                            </div>
                            {/* Botón para borrar si fue creado por el usuario */}
                            {isUserCreated && (
                              <button
                                onClick={() => {
                                  gestureRegistry.removeUserGesture(g.id);
                                  setUploadStatus(`🗑️ Gesto "${g.name}" eliminado`);
                                  setTimeout(() => setUploadStatus(''), 2500);
                                }}
                                className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors"
                                title="Eliminar gesto personalizado"
                              >
                                <span className="material-symbols-outlined text-xs">delete</span>
                              </button>
                            )}
                          </div>

                          {/* Insignia de Estado */}
                          <div className="my-1.5">
                            {overrideName ? (
                              <div className="flex flex-col gap-0.5">
                                <span className="text-[8px] font-semibold text-cyan-300 bg-cyan-950/80 border border-cyan-500/40 px-1.5 py-0.5 rounded flex items-center gap-1 truncate" title={assignedAnim?.displayName || overrideName}>
                                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse shrink-0" />
                                  <span className="truncate">🎬 {assignedAnim?.displayName || overrideName}</span>
                                </span>
                                {(assignedAnim?.hasCamera || assignedAnim?.hasFacial || assignedAnim?.audioUrl || assignedAnim?.audioFileName) && (
                                  <div className="flex items-center gap-1 text-[8px] text-slate-400 mt-0.5">
                                    {assignedAnim.hasCamera && <span title="Incluye cámara cinemática">🎥</span>}
                                    {assignedAnim.hasFacial && <span title="Incluye gestos faciales">🎭</span>}
                                    {(assignedAnim.audioUrl || assignedAnim.audioFileName) && <span title="Incluye música sincronizada">🎵</span>}
                                    <span className="text-[7px] text-emerald-400 font-bold uppercase">Pack Completo</span>
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className={`text-[8px] font-medium px-1.5 py-0.5 rounded inline-block ${isUserCreated
                                  ? 'text-cyan-300 bg-cyan-950/60 border border-cyan-500/30'
                                  : 'text-violet-300 bg-violet-950/60 border border-violet-500/30'
                                }`}>
                                {isUserCreated ? '✨ Creado por Usuario' : '⚡ Procedural'}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botones de Acción */}
                        <div className="flex flex-col gap-1 mt-2 pt-1.5 border-t border-white/5">
                          <div className="flex items-center gap-1">
                            {/* Botón Probar */}
                            <button
                              onClick={() => triggerAction(g.id, g.defaultDuration ? g.defaultDuration * 1000 : 2500)}
                              className={`flex-1 py-1 rounded text-[9px] font-bold flex items-center justify-center gap-1 transition-all ${isPlaying
                                  ? 'bg-amber-500 text-black font-extrabold'
                                  : 'bg-white/10 hover:bg-white/20 text-white'
                                }`}
                            >
                              <span className="material-symbols-outlined text-[11px]">
                                {isPlaying ? 'pause' : 'play_arrow'}
                              </span>
                              {isPlaying ? 'Parar' : 'Probar'}
                            </button>

                            {/* Botón Vincular de Biblioteca */}
                            <button
                              onClick={() => setAssigningGesture(g)}
                              className="px-2 py-1 rounded text-[9px] font-medium bg-violet-500/20 hover:bg-violet-500/30 text-violet-200 border border-violet-500/40 transition-all flex items-center gap-0.5"
                              title="Seleccionar animación cargada de la biblioteca"
                            >
                              <span className="material-symbols-outlined text-[11px]">link</span>
                              {overrideName ? 'Cambiar' : 'Asignar'}
                            </button>
                          </div>

                          {/* Botón Restaurar Procedural si está personalizado */}
                          {overrideName && (
                            <button
                              onClick={() => gestureRegistry.removeGestureOverride(g.id)}
                              className="w-full py-0.5 rounded text-[8px] text-slate-400 hover:text-red-300 hover:bg-red-500/10 transition-colors flex items-center justify-center gap-0.5"
                              title="Volver al gesto procedural estándar"
                            >
                              <span className="material-symbols-outlined text-[10px]">restart_alt</span>
                              Restaurar Procedural
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          </>)}

          {/* ═══ TAB: ANIMACIONES ═══ */}
          {activeTab === 'animations' && (<>
            {/* ═══ MÓDULO INTEGRADO: COREOGRAFÍA GRUPAL (2-5 BAILARINES) ═══ */}
            <div className="bg-gradient-to-br from-violet-950/40 via-purple-950/20 to-black/30 border border-violet-500/30 rounded-2xl p-3.5 space-y-3.5 shadow-lg shadow-violet-950/20">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="w-8 h-8 rounded-xl bg-violet-600/30 border border-violet-400/30 flex items-center justify-center text-base">
                    👥
                  </span>
                  <div>
                    <h3 className="text-xs font-bold text-white flex items-center gap-1.5">
                      <span>Coreografía Grupal</span>
                      <span className="text-[8px] font-bold px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30">
                        {groupState.dancerCount} Bailarines
                      </span>
                    </h3>
                    <p className="text-[8px] text-slate-400">Clona al avatar activo y sincroniza múltiples motions VMD</p>
                  </div>
                </div>

                {groupState.isPlaying ? (
                  <button
                    onClick={() => multiVmdManager.stopGroupDance()}
                    className="px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-red-600/30 transition-all flex items-center gap-1 shrink-0"
                  >
                    <span>⏹</span> Detener
                  </button>
                ) : (
                  <button
                    onClick={() => multiVmdManager.playGroupDance()}
                    className="px-3 py-1.5 bg-gradient-to-r from-violet-600 to-fuchsia-600 hover:opacity-90 text-white rounded-lg text-[10px] font-bold shadow-lg shadow-violet-600/30 transition-all flex items-center gap-1 shrink-0"
                  >
                    <span>▶</span> Iniciar Baile
                  </button>
                )}
              </div>

              {/* Selector de número de bailarines */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block mb-1.5">
                  Cantidad de Bailarines en Escena:
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[2, 3, 4, 5].map(cnt => (
                    <button
                      key={cnt}
                      onClick={() => multiVmdManager.setDancerCount(cnt)}
                      className={`py-1.5 rounded-lg text-[10px] font-bold border transition-all ${groupState.dancerCount === cnt
                          ? 'bg-violet-600 border-violet-400 text-white shadow-sm'
                          : 'bg-white/5 border-white/5 text-slate-400 hover:text-white'
                        }`}
                    >
                      {cnt} Personajes
                    </button>
                  ))}
                </div>
              </div>

              {/* Slots de bailarines con selector rápido */}
              <div className="space-y-1.5">
                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                  Asignación por Puesto:
                </label>
                {groupState.slots.map((slot, idx) => (
                  <div
                    key={slot.id}
                    className="p-2 rounded-xl border border-white/5 bg-black/30 flex items-center justify-between"
                  >
                    <div className="min-w-0 flex-1 mr-2">
                      <div className="flex items-center gap-1.5">
                        <span className="w-4 h-4 rounded-full bg-violet-600/30 text-violet-300 flex items-center justify-center text-[9px] font-bold shrink-0">
                          {idx + 1}
                        </span>
                        <span className="text-[10px] font-bold text-white truncate">{slot.name}</span>
                      </div>
                      <span className="text-[8px] text-slate-500 block truncate mt-0.5">
                        X: {slot.defaultOffsetX}m {slot.vmdName ? `• ${slot.vmdName}` : '• (Sin archivo)'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      {slot.vmdName ? (
                        <>
                          <span className="text-[8px] text-emerald-400 font-bold mr-1">✓ Listo</span>
                          <button
                            onClick={() => handleAssignSlotVmd(slot.id)}
                            className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white rounded text-[8px] transition-all"
                            title="Cambiar motion VMD"
                          >
                            Cambiar
                          </button>
                          <button
                            onClick={() => multiVmdManager.clearSlot(slot.id)}
                            className="text-slate-500 hover:text-red-400 text-xs px-1"
                            title="Quitar VMD"
                          >
                            ✕
                          </button>
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleAssignSlotVmd(slot.id)}
                            className="px-2 py-0.5 bg-violet-600/30 hover:bg-violet-600/50 border border-violet-500/40 rounded text-[8px] font-bold text-violet-200 transition-all flex items-center gap-0.5"
                            title="Seleccionar de tus 200+ bailes ya cargados"
                          >
                            <span>📂</span> Biblioteca
                          </button>
                          <button
                            onClick={() => {
                              activeSlotIdRef.current = slot.id;
                              groupSlotInputRef.current?.click();
                            }}
                            className="px-1.5 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[8px] text-slate-400 hover:text-cyan-300 transition-all"
                            title="O subir un archivo .vmd nuevo"
                          >
                            ⬆️
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Música y Cámara Cinematográfica Grupal */}
              <div className="p-2.5 bg-black/40 border border-white/5 rounded-xl space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    <span className="text-xs">🎵</span>
                    <div className="truncate">
                      <span className="text-[9px] font-bold text-slate-300 block truncate">Audio / Canción</span>
                      <span className="text-[8px] text-slate-500 block truncate">{groupState.audioName || 'Opcional'}</span>
                    </div>
                  </div>
                  {groupState.audioName ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAssigningGroupAudio(true)}
                        className="text-[8px] px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded"
                      >
                        Cambiar
                      </button>
                      <button onClick={() => multiVmdManager.clearAudio()} className="text-slate-400 hover:text-red-400 text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAssigningGroupAudio(true)}
                        className="px-2 py-0.5 bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 rounded text-[8px] font-bold text-violet-300"
                        title="Vincular audio de uno de tus bailes ya cargados"
                      >
                        📂 De Biblioteca
                      </button>
                      <button
                        onClick={() => groupAudioInputRef.current?.click()}
                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[8px] text-slate-400 hover:text-white"
                        title="Subir archivo de audio (.mp3, .wav)"
                      >
                        ⬆️ Subir
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-between border-t border-white/5 pt-1.5">
                  <div className="flex items-center gap-1.5 min-w-0 flex-1 mr-2">
                    <span className="text-xs">🎥</span>
                    <div className="truncate">
                      <span className="text-[9px] font-bold text-slate-300 block truncate">Cámara Grupal</span>
                      <span className="text-[8px] text-slate-500 block truncate">{groupState.cameraName || 'Cámara .vmd'}</span>
                    </div>
                  </div>
                  {groupState.cameraName ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAssigningGroupCamera(true)}
                        className="text-[8px] px-1.5 py-0.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded"
                      >
                        Cambiar
                      </button>
                      <button onClick={() => multiVmdManager.clearCamera()} className="text-slate-400 hover:text-red-400 text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => setAssigningGroupCamera(true)}
                        className="px-2 py-0.5 bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/30 rounded text-[8px] font-bold text-cyan-300"
                        title="Vincular cámara de uno de tus bailes ya cargados"
                      >
                        📂 De Biblioteca
                      </button>
                      <button
                        onClick={() => groupCameraInputRef.current?.click()}
                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[8px] text-slate-400 hover:text-white"
                        title="Subir archivo de cámara .vmd"
                      >
                        ⬆️ Subir
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Inputs ocultos para carga de grupo */}
              <input ref={groupSlotInputRef} type="file" accept=".vmd" className="hidden" onChange={handleSlotVmdFileChange} />
              <input ref={groupAudioInputRef} type="file" accept=".mp3,.wav,.ogg,.m4a" className="hidden" onChange={handleGroupAudioUpload} />
              <input ref={groupCameraInputRef} type="file" accept=".vmd" className="hidden" onChange={handleGroupCameraUpload} />
            </div>

            {/* Zona de Arrastre de Animaciones Individuales */}
            <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${isDragging ? 'border-violet-400 bg-violet-500/10' : 'border-white/10 hover:border-violet-500/30'
                }`}>
              <span className="material-symbols-outlined text-3xl text-slate-600 mb-1 block">upload_file</span>
              <p className="text-[10px] font-medium text-slate-300">Arrastra animaciones (.vmd, .fbx, .glb), música o cámaras</p>
              <p className="text-[9px] text-slate-500 mt-1">Soporta packs MMD completos (baile + cámara + música) juntos</p>
              <input ref={fileInputRef} type="file" accept=".glb,.fbx,.vmd,.mp3,.wav,.ogg,.m4a" multiple className="hidden"
                onChange={(e) => handleAnimationUpload(e.target.files)} />
            </div>

            {storedAnims.length > 0 && (
              <div className="space-y-2 mt-2">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Cargadas ({storedAnims.length})
                  </label>
                  <span className="text-[9px] text-slate-500">
                    Organiza y nombra en español
                  </span>
                </div>

                {/* Filtro por Categorías de Animaciones */}
                <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none">
                  {allAnimCategories.map(cat => (
                    <button
                      key={cat.id}
                      onClick={() => setAnimCategoryFilter(cat.id)}
                      className={`px-2 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${animCategoryFilter === cat.id
                          ? 'bg-violet-600 text-white shadow-sm'
                          : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                        }`}
                    >
                      <span>{cat.icon}</span>
                      <span>{cat.label}</span>
                      {/* Delete button for custom categories */}
                      {cat.id.startsWith('custom_') && (
                        <span
                          role="button"
                          onClick={(e) => { e.stopPropagation(); handleDeleteCustomCategory(cat.id); }}
                          className="ml-0.5 text-[9px] text-red-400 hover:text-red-300"
                          title="Eliminar categoría"
                        >✕</span>
                      )}
                    </button>
                  ))}
                  {/* Botón para añadir nueva categoría */}
                  <button
                    onClick={() => setShowNewCatForm(v => !v)}
                    className="px-2 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap bg-emerald-900/40 text-emerald-300 hover:bg-emerald-900/60 border border-emerald-500/30 flex items-center gap-1 transition-all"
                    title="Crear categoría personalizada"
                  >
                    <span>＋</span><span>Nueva</span>
                  </button>
                </div>

                {/* Formulario inline para nueva categoría */}
                {showNewCatForm && (
                  <div className="flex items-center gap-1.5 p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30">
                    <input
                      type="text"
                      value={newCatIcon}
                      onChange={e => setNewCatIcon(e.target.value)}
                      maxLength={2}
                      className="w-9 text-center bg-black/30 border border-white/10 rounded px-1 py-1 text-sm outline-none focus:border-emerald-400"
                      placeholder="📌"
                    />
                    <input
                      type="text"
                      value={newCatLabel}
                      onChange={e => setNewCatLabel(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAddCustomCategory()}
                      placeholder="Nombre de categoría..."
                      className="flex-1 bg-black/30 border border-white/10 rounded px-2 py-1 text-[10px] text-white placeholder:text-slate-600 outline-none focus:border-emerald-400"
                    />
                    <button
                      onClick={handleAddCustomCategory}
                      className="px-2 py-1 rounded text-[9px] font-bold bg-emerald-600 hover:bg-emerald-500 text-white transition-colors"
                    >Crear</button>
                    <button
                      onClick={() => setShowNewCatForm(false)}
                      className="text-slate-400 hover:text-white text-xs px-1"
                    >✕</button>
                  </div>
                )}

                {/* Buscador de Animaciones */}
                <div className="relative">
                  <input
                    type="text"
                    value={animSearch}
                    onChange={(e) => setAnimSearch(e.target.value)}
                    placeholder="🔍 Buscar por nombre, alias o etiqueta..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-violet-500"
                  />
                  {animSearch && (
                    <button
                      onClick={() => setAnimSearch('')}
                      className="absolute right-2 top-1.5 text-slate-400 hover:text-white text-xs"
                    >
                      ✕
                    </button>
                  )}
                </div>

                <div className="space-y-2 max-h-[50vh] overflow-y-auto pr-1">
                  {storedAnims
                    .filter(anim => {
                      if (animCategoryFilter !== 'all' && (anim.category || 'other') !== animCategoryFilter) return false;
                      if (animSearch) {
                        const q = animSearch.toLowerCase();
                        return anim.name.toLowerCase().includes(q) ||
                          (anim.displayName && anim.displayName.toLowerCase().includes(q)) ||
                          (anim.customTag && anim.customTag.toLowerCase().includes(q));
                      }
                      return true;
                    })
                    .map(anim => (
                      <div key={anim.name} className="flex flex-col gap-2 p-2.5 rounded-lg bg-white/[0.02] border border-white/5 group hover:border-violet-500/20 transition-all">
                        <div className="flex items-center justify-between">
                          <button onClick={() => triggerAction(anim.name)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                            <span className={`material-symbols-outlined text-xs shrink-0 ${activeAction === anim.name ? 'text-amber-400 animate-pulse' : 'text-emerald-400'}`}>
                              {activeAction === anim.name ? 'pause_circle' : 'play_circle'}
                            </span>
                            <div className="min-w-0 flex-1">
                              <span className={`text-[11px] font-bold block truncate ${activeAction === anim.name ? 'text-violet-300' : 'text-white'}`}>
                                {anim.displayName || anim.name}
                              </span>
                              {anim.displayName && (
                                <span className="text-[8px] text-slate-500 block truncate font-mono">
                                  Archivo: {anim.name}
                                </span>
                              )}
                              <span className="text-[8px] text-slate-500 block truncate">
                                {activeAction === anim.name ? '▶ En reproducción (clic para parar)' : `${anim.source} • .${anim.type}`}
                              </span>
                            </div>
                          </button>
                          <div className="flex items-center gap-1">
                            <button onClick={() => {
                              if (activeAction === anim.name) {
                                triggerAction(anim.name);
                              }
                              animationStore.remove(anim.name);
                            }}
                              className="opacity-0 group-hover:opacity-100 text-slate-500 hover:text-red-400 transition-all p-1">
                              <span className="material-symbols-outlined text-xs">delete</span>
                            </button>
                          </div>
                        </div>

                        {/* Alias en español y Categoría para resolver nombres chinos */}
                        <div className="grid grid-cols-2 gap-1.5 pt-1.5 border-t border-white/5">
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[8px] font-bold text-slate-400 uppercase">Alias en español:</label>
                            <input
                              type="text"
                              placeholder="Ej: Baile Gokuraku"
                              defaultValue={anim.displayName || ''}
                              onBlur={(e) => {
                                const val = e.target.value.trim();
                                animationStore.updateMeta(anim.name, { displayName: val || undefined });
                              }}
                              className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-[9px] text-cyan-200 placeholder:text-slate-600 outline-none focus:border-cyan-400"
                            />
                          </div>
                          <div className="flex flex-col gap-0.5">
                            <label className="text-[8px] font-bold text-slate-400 uppercase">Categoría:</label>
                            <select
                              value={anim.category || 'other'}
                              onChange={(e) => {
                                animationStore.updateMeta(anim.name, { category: e.target.value });
                              }}
                              className="w-full bg-black/30 border border-white/10 rounded px-1.5 py-1 text-[9px] text-slate-300 outline-none focus:border-violet-500 cursor-pointer"
                            >
                              <option value="dance">💃 Baile / MMD</option>
                              <option value="greeting">👋 Saludos</option>
                              <option value="reaction">😊 Reacciones</option>
                              <option value="charm">💖 Coqueta / Sexy</option>
                              <option value="song">🎵 Canción</option>
                              <option value="body">🤸 Posturas</option>
                              <option value="other">📦 Otros</option>
                              {customCategories.map(cc => (
                                <option key={cc.id} value={cc.id}>{cc.icon} {cc.label}</option>
                              ))}
                            </select>
                          </div>
                        </div>

                        {/* Si está asignada a un gesto */}
                        {anim.assignedGesture && (
                          <div className="flex items-center justify-between px-2 py-1 rounded bg-cyan-950/60 border border-cyan-500/30 text-[9px] text-cyan-300">
                            <span className="flex items-center gap-1 truncate">
                              <span className="material-symbols-outlined text-[11px] shrink-0">link</span>
                              <span className="truncate">
                                Vinculado a: <strong>{gestureRegistry.getGesture(anim.assignedGesture)?.name || anim.assignedGesture}</strong>
                              </span>
                            </span>
                            <button
                              onClick={() => gestureRegistry.removeGestureOverride(anim.assignedGesture!)}
                              className="text-slate-400 hover:text-red-400 text-[9px] shrink-0 ml-1"
                              title="Desvincular del gesto"
                            >
                              Desvincular
                            </button>
                          </div>
                        )}

                        <div className="flex flex-col gap-1 w-full">
                          <input
                            type="text"
                            placeholder="Etiqueta alternativa (ej: baile)"
                            defaultValue={anim.customTag || ''}
                            onBlur={(e) => {
                              const val = e.target.value.trim().toLowerCase();
                              animationStore.updateMeta(anim.name, { customTag: val || undefined });
                            }}
                            className="w-full bg-black/20 border border-white/10 rounded px-2 py-1 text-[9px] text-slate-300 placeholder:text-slate-600 outline-none focus:border-violet-500"
                          />

                          {/* NUEVO: Botón Auto-Fix A-Pose */}
                          <div className="pt-2 mt-1 border-t border-white/5 flex flex-col gap-1.5">
                            <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center justify-between">
                              <span>Auto-Calibración</span>
                              <span className="material-symbols-outlined text-[10px] text-emerald-400">magic_button</span>
                            </label>
                            <button
                              onClick={() => {
                                const newPreset = anim.posePreset === 'vrm' ? 'none' : 'vrm';
                                animationStore.updateMeta(anim.name, { posePreset: newPreset });
                                const isCurrentlyActive = activeAction === anim.name;
                                // Recargar la animación y reanudar inmediatamente si está activa
                                window.dispatchEvent(new CustomEvent('nova-load-animation', {
                                  detail: { url: anim.url, name: anim.name, type: anim.type, autoplay: isCurrentlyActive }
                                }));
                              }}
                              className={`w-full py-1.5 text-[10px] font-bold tracking-wider rounded-lg border transition-all ${anim.posePreset === 'vrm'
                                  ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 hover:bg-emerald-500/30'
                                  : 'bg-white/5 text-slate-400 border-white/10 hover:bg-white/10'
                                }`}
                            >
                              {anim.posePreset === 'vrm' ? '🪄 A-POSE (ANIME) APLICADO' : 'APLICAR FIX A-POSE (ANIME)'}
                            </button>
                          </div>

                          {/* 🎛️ Ajuste manual de pose (solo Mixamo/FBX) */}
                          {(anim.type === 'fbx' || anim.type === 'glb') && (
                            <div className="pt-2 mt-1 border-t border-white/5 flex flex-col gap-2">
                              <label className="text-[9px] font-bold text-slate-500 uppercase flex items-center justify-between">
                                <span>Ajuste Manual de Pose</span>
                                <span className="material-symbols-outlined text-[10px] text-cyan-400">tune</span>
                              </label>

                              {/* Helper para crear un slider */}
                              {([
                                { key: 'spineTiltX' as keyof BoneOffsets, label: 'Espalda adelante/atrás', min: -60, max: 60, icon: '🫀' },
                                { key: 'hipTiltX' as keyof BoneOffsets, label: 'Cadera adelante/atrás', min: -45, max: 45, icon: '🦴' },
                                { key: 'armDownL' as keyof BoneOffsets, label: 'Brazo Izq. abajo', min: -120, max: 120, icon: '💪' },
                                { key: 'armDownR' as keyof BoneOffsets, label: 'Brazo Der. abajo', min: -120, max: 120, icon: '💪' },
                                { key: 'spineTiltZ' as keyof BoneOffsets, label: 'Inclin. lateral torso', min: -30, max: 30, icon: '↔️' },
                              ] as { key: keyof BoneOffsets; label: string; min: number; max: number; icon: string }[]).map(({ key, label, min, max, icon }) => {
                                const val = anim.boneOffsets?.[key] ?? 0;
                                return (
                                  <div key={key} className="flex flex-col gap-0.5">
                                    <div className="flex items-center justify-between">
                                      <span className="text-[8px] text-slate-400">{icon} {label}</span>
                                      <span className="text-[8px] font-mono text-cyan-300">{Number(val).toFixed(0)}°</span>
                                    </div>
                                    <input
                                      type="range"
                                      min={min}
                                      max={max}
                                      step={1}
                                      value={val as number}
                                      onChange={(e) => {
                                        const newOffsets: BoneOffsets = { ...(anim.boneOffsets || {}), [key]: Number(e.target.value) };
                                        animationStore.updateMeta(anim.name, { boneOffsets: newOffsets });
                                      }}
                                      onMouseUp={() => {
                                        // Recargar animación al soltar para aplicar el offset
                                        window.dispatchEvent(new CustomEvent('nova-load-animation', {
                                          detail: { url: anim.url, name: anim.name, type: anim.type, autoplay: activeAction === anim.name }
                                        }));
                                      }}
                                      className="w-full h-1 accent-cyan-400 cursor-pointer"
                                    />
                                  </div>
                                );
                              })}

                              {/* Botón reset */}
                              {anim.boneOffsets && Object.values(anim.boneOffsets).some(v => v !== 0 && v !== undefined) && (
                                <button
                                  onClick={() => {
                                    animationStore.updateMeta(anim.name, { boneOffsets: {} });
                                    window.dispatchEvent(new CustomEvent('nova-load-animation', {
                                      detail: { url: anim.url, name: anim.name, type: anim.type, autoplay: activeAction === anim.name }
                                    }));
                                  }}
                                  className="w-full py-1 text-[9px] text-slate-500 hover:text-red-400 border border-white/5 hover:border-red-500/30 rounded transition-all"
                                >
                                  ↺ Resetear ajustes
                                </button>
                              )}
                            </div>
                          )}

                          {/* 🎵 Sección de Audio Sincronizado por Animación */}
                          <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className={`material-symbols-outlined text-xs ${anim.audioUrl ? 'text-violet-400' : 'text-slate-600'}`}>
                                music_note
                              </span>
                              {anim.audioFileName ? (
                                <span className="text-[9px] text-violet-300 font-medium truncate max-w-[130px]" title={anim.audioFileName}>
                                  {anim.audioFileName}
                                </span>
                              ) : (
                                <span className="text-[8px] text-slate-500">Sin audio</span>
                              )}
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => handleSelectAudioForAnim(anim.name)}
                                className="text-[9px] px-2 py-0.5 rounded bg-violet-500/10 hover:bg-violet-500/20 text-violet-300 border border-violet-500/30 transition-all flex items-center gap-0.5"
                                title="Asignar archivo de música (.mp3, .wav, .ogg)"
                              >
                                <span className="material-symbols-outlined text-[10px]">upload</span>
                                {anim.audioFileName ? 'Cambiar' : 'Audio'}
                              </button>
                              {anim.audioFileName && (
                                <button
                                  onClick={() => handleRemoveAudioForAnim(anim.name)}
                                  className="text-[9px] p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                                  title="Quitar audio"
                                >
                                  <span className="material-symbols-outlined text-[11px]">close</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 🎥 Sección de Cámara Cinemática VMD */}
                          <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className={`material-symbols-outlined text-xs ${(anim.cameraUrl || anim.hasCamera) ? (anim.useCamera !== false ? 'text-amber-400' : 'text-slate-500') : 'text-slate-600'}`}>
                                videocam
                              </span>
                              <div className="truncate">
                                {anim.cameraFileName ? (
                                  <span className="text-[9px] text-amber-300 font-medium truncate max-w-[120px] block" title={anim.cameraFileName}>
                                    {anim.cameraFileName}
                                  </span>
                                ) : anim.hasCamera ? (
                                  <span className="text-[9px] text-amber-300 font-medium block">Cámara integrada</span>
                                ) : (
                                  <span className="text-[8px] text-slate-500 block">Sin cámara VMD</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {(anim.cameraUrl || anim.hasCamera) && (
                                <button
                                  onClick={() => handleToggleCameraForAnim(anim.name)}
                                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all ${anim.useCamera !== false
                                      ? 'bg-amber-500/20 text-amber-300 border-amber-500/50'
                                      : 'bg-white/5 text-slate-400 border-white/10'
                                    }`}
                                  title={anim.useCamera !== false ? 'Cámara Cinemática Activada (clic para cámara fija/ratón)' : 'Cámara Libre (clic para activar cinemática)'}
                                >
                                  {anim.useCamera !== false ? 'CINEMÁTICA' : 'LIBRE'}
                                </button>
                              )}
                              <button
                                onClick={() => handleSelectCameraForAnim(anim.name)}
                                className="text-[9px] px-2 py-0.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 transition-all flex items-center gap-0.5"
                                title="Asignar archivo de cámara VMD (.vmd)"
                              >
                                <span className="material-symbols-outlined text-[10px]">upload</span>
                                {anim.cameraFileName ? 'Cambiar' : 'Cámara'}
                              </button>
                              {anim.cameraFileName && (
                                <button
                                  onClick={() => handleRemoveCameraForAnim(anim.name)}
                                  className="text-[9px] p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                                  title="Quitar cámara"
                                >
                                  <span className="material-symbols-outlined text-[11px]">close</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 🎭 Sección de Expresiones Faciales VMD */}
                          <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between">
                            <div className="flex items-center gap-1.5 overflow-hidden">
                              <span className={`material-symbols-outlined text-xs ${(anim.facialUrl || anim.hasFacial) ? (anim.useFacial !== false ? 'text-emerald-400' : 'text-slate-500') : 'text-slate-600'}`}>
                                mood
                              </span>
                              <div className="truncate">
                                {anim.facialFileName ? (
                                  <span className="text-[9px] text-emerald-300 font-medium truncate max-w-[120px] block" title={anim.facialFileName}>
                                    {anim.facialFileName}
                                  </span>
                                ) : anim.hasFacial ? (
                                  <span className="text-[9px] text-emerald-300 font-medium block">Facial integrada</span>
                                ) : (
                                  <span className="text-[8px] text-slate-500 block">Sin facial VMD</span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-1">
                              {(anim.facialUrl || anim.hasFacial) && (
                                <button
                                  onClick={() => handleToggleFacialForAnim(anim.name)}
                                  className={`text-[8px] font-bold px-1.5 py-0.5 rounded border transition-all ${anim.useFacial !== false
                                      ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50'
                                      : 'bg-white/5 text-slate-400 border-white/10'
                                    }`}
                                  title={anim.useFacial !== false ? 'Expresiones Faciales Activadas' : 'Expresiones Faciales Desactivadas'}
                                >
                                  {anim.useFacial !== false ? 'FACIAL' : 'OFF'}
                                </button>
                              )}
                              <button
                                onClick={() => handleSelectFacialForAnim(anim.name)}
                                className="text-[9px] px-2 py-0.5 rounded bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 transition-all flex items-center gap-0.5"
                                title="Asignar archivo de expresiones faciales VMD (.vmd)"
                              >
                                <span className="material-symbols-outlined text-[10px]">upload</span>
                                {anim.facialFileName ? 'Cambiar' : 'Facial'}
                              </button>
                              {anim.facialFileName && (
                                <button
                                  onClick={() => handleRemoveFacialForAnim(anim.name)}
                                  className="text-[9px] p-0.5 text-slate-500 hover:text-red-400 transition-colors"
                                  title="Quitar facial"
                                >
                                  <span className="material-symbols-outlined text-[11px]">close</span>
                                </button>
                              )}
                            </div>
                          </div>

                          {/* 🔁 Sección Bucle Continuo & 🎥 Cámara por Defecto */}
                          <div className="pt-2 mt-1 border-t border-white/5 flex items-center justify-between gap-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={!!anim.loop}
                                onChange={(e) => {
                                  const isLoop = e.target.checked;
                                  animationStore.updateMeta(anim.name, { loop: isLoop });
                                  if (activeAction === anim.name) {
                                    // Re-disparar con el nuevo modo de bucle si está sonando ahora
                                    triggerAction(anim.name);
                                  }
                                }}
                                className="w-3.5 h-3.5 rounded border-white/20 bg-black/40 text-violet-600 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-violet-500"
                              />
                              <span className="text-[9px] font-bold text-slate-300 flex items-center gap-1">
                                <span>🔁</span>
                                <span className={anim.loop ? 'text-violet-300' : 'text-slate-400'}>
                                  {anim.loop ? 'Bucle infinito' : '1 sola vez'}
                                </span>
                              </span>
                            </label>

                            <div className="flex items-center gap-1">
                              <span className="text-[8px] font-bold text-slate-500 uppercase">Cámara:</span>
                              <select
                                value={anim.cameraMode || (anim.hasCamera || anim.cameraUrl ? 'vmd' : 'dynamic')}
                                onChange={(e) => {
                                  const mode = e.target.value as any;
                                  animationStore.updateMeta(anim.name, { cameraMode: mode });
                                  window.dispatchEvent(new CustomEvent('nova-camera-preset', {
                                    detail: { preset: mode }
                                  }));
                                }}
                                className="bg-black/40 border border-white/10 rounded px-1.5 py-0.5 text-[8px] font-semibold text-cyan-300 outline-none focus:border-cyan-400 cursor-pointer"
                                title="Cámara al reproducir si no tiene VMD cinemático"
                              >
                                <option value="dynamic">🎬 Dinámica (Orbital)</option>
                                <option value="default">📐 Frontal</option>
                                <option value="face">👤 Rostro</option>
                                <option value="full">🧍 Cuerpo entero</option>
                                <option value="free">🖱️ Libre (Ratón)</option>
                              </select>
                            </div>
                          </div>

                          {/* 👥 SECCIÓN: BAILARINES EXTRA / COREOGRAFÍA GRUPAL (2-5 PERSONAJES) */}
                          <div className="pt-2.5 mt-1 border-t border-violet-500/20 bg-violet-950/20 rounded-xl p-2.5 space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs">👥</span>
                                <div>
                                  <span className="text-[10px] font-bold text-violet-200 block">
                                    Bailarines del Grupo ({1 + (anim.extraMotions?.length || 0)}/5)
                                  </span>
                                  <span className="text-[7px] text-slate-400 block">
                                    Clona a Nova para acompañar en puestos laterales (Dúo, Trío, etc.)
                                  </span>
                                </div>
                              </div>

                              {/* Selector rápido para añadir bailarines */}
                              {(!anim.extraMotions || anim.extraMotions.length < 4) && (
                                <div className="flex items-center gap-1">
                                  {[
                                    { id: 'dancer_2', name: 'Bailarín 2', role: 'Izquierda', offsetX: -1.8, offsetZ: 0 },
                                    { id: 'dancer_3', name: 'Bailarín 3', role: 'Derecha', offsetX: 1.8, offsetZ: 0 },
                                    { id: 'dancer_4', name: 'Bailarín 4', role: 'Extremo Izq.', offsetX: -3.6, offsetZ: -0.3 },
                                    { id: 'dancer_5', name: 'Bailarín 5', role: 'Extremo Der.', offsetX: 3.6, offsetZ: -0.3 },
                                  ]
                                    .filter(candidate => !anim.extraMotions?.some(m => m.id === candidate.id))
                                    .slice(0, 1) // Agregar el siguiente bailarín en orden
                                    .map(candidate => (
                                      <button
                                        key={candidate.id}
                                        type="button"
                                        onClick={() => {
                                          setPickingLibraryForExtra({
                                            animName: anim.name,
                                            dancerId: candidate.id,
                                            name: candidate.name,
                                            role: candidate.role,
                                            offsetX: candidate.offsetX,
                                            offsetZ: candidate.offsetZ
                                          });
                                        }}
                                        className="px-2 py-1 rounded-lg bg-violet-600/40 hover:bg-violet-600/60 border border-violet-400/40 text-violet-200 text-[8px] font-bold flex items-center gap-1 transition-all"
                                        title={`Añadir ${candidate.name} (${candidate.role})`}
                                      >
                                        <span>+</span>
                                        <span>{candidate.name} ({candidate.role})</span>
                                      </button>
                                    ))}
                                </div>
                              )}
                            </div>

                            {/* Lista de bailarines extra ya asignados a este baile */}
                            {anim.extraMotions && anim.extraMotions.length > 0 && (
                              <div className="space-y-1.5 pt-1">
                                {anim.extraMotions.map(dancer => (
                                  <div
                                    key={dancer.id}
                                    className="p-2 rounded-lg bg-black/40 border border-white/5 flex items-center justify-between gap-2"
                                  >
                                    <div className="min-w-0 flex-1">
                                      <div className="flex items-center gap-1.5">
                                        <span className="text-[9px] font-bold text-white truncate">
                                          {dancer.name}
                                        </span>
                                        <span className="text-[7px] px-1.5 py-0.2 rounded bg-violet-500/20 text-violet-300 font-bold border border-violet-500/30">
                                          {dancer.role} (X: {dancer.defaultOffsetX}m)
                                        </span>
                                      </div>
                                      <span className="text-[8px] text-cyan-300 block truncate mt-0.5" title={dancer.vmdFileName}>
                                        Motion: {dancer.vmdFileName || '(Sin archivo)'}
                                      </span>
                                    </div>

                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPickingLibraryForExtra({
                                            animName: anim.name,
                                            dancerId: dancer.id,
                                            name: dancer.name,
                                            role: dancer.role,
                                            offsetX: dancer.defaultOffsetX,
                                            offsetZ: dancer.defaultOffsetZ
                                          });
                                        }}
                                        className="px-2 py-0.5 rounded bg-violet-500/20 hover:bg-violet-500/30 border border-violet-500/30 text-violet-200 text-[8px] font-bold transition-all flex items-center gap-0.5"
                                        title="Cambiar motion seleccionando de tus 200 bailes"
                                      >
                                        <span>📂</span> Biblioteca
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleSelectExtraMotionFile(anim.name, dancer.id, dancer.name, dancer.role, dancer.defaultOffsetX, dancer.defaultOffsetZ)}
                                        className="px-1.5 py-0.5 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white text-[8px] transition-all"
                                        title="Subir archivo .vmd para este bailarín"
                                      >
                                        ⬆️
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveExtraMotion(anim.name, dancer.id)}
                                        className="text-slate-500 hover:text-red-400 p-1 text-xs transition-colors"
                                        title="Eliminar este bailarín del baile"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}

                            {(!anim.extraMotions || anim.extraMotions.length === 0) && (
                              <p className="text-[8px] text-slate-500 italic">
                                Baile en solitario (1 avatar). Pulsa el botón superior para agregar un bailarín al lado.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Input oculto para carga de audio */}
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.ogg,.m4a,.aac"
              className="hidden"
              onChange={handleAudioFileChange}
            />

            {/* Input oculto para carga de cámara VMD */}
            <input
              ref={cameraInputRef}
              type="file"
              accept=".vmd"
              className="hidden"
              onChange={handleCameraFileChange}
            />

            {/* Input oculto para carga de expresiones faciales VMD */}
            <input
              ref={facialInputRef}
              type="file"
              accept=".vmd"
              className="hidden"
              onChange={handleFacialFileChange}
            />

            {/* Input oculto para carga de motions de bailarines extra VMD */}
            <input
              ref={extraMotionInputRef}
              type="file"
              accept=".vmd"
              className="hidden"
              onChange={handleExtraMotionFileChange}
            />

            <div className="bg-gradient-to-br from-orange-500/5 to-violet-500/5 border border-white/5 rounded-lg p-3">
              <h3 className="font-semibold text-[10px] flex items-center gap-1 mb-2">💡 Mixamo</h3>
              <ol className="text-[9px] text-slate-400 space-y-1">
                <li><span className="text-violet-400 font-bold">1.</span> Ve a <a href="https://www.mixamo.com" target="_blank" className="text-violet-400 underline">mixamo.com</a></li>
                <li><span className="text-violet-400 font-bold">2.</span> Busca "Hip Hop Dance", "Salsa", etc.</li>
                <li><span className="text-violet-400 font-bold">3.</span> Download → <strong className="text-white">FBX Binary</strong> → "Without Skin"</li>
                <li><span className="text-violet-400 font-bold">4.</span> Arrastra el .fbx aquí ¡directo, sin convertir!</li>
              </ol>
            </div>
          </>)}

          {/* ═══ TAB: CALIBRACIÓN ═══ */}
          {activeTab === 'calibration' && (<>
            {/* 🦵 PANEL: CALIBRACIÓN DE PIERNAS Y SUELO (FBX / VMD EN VIVO) */}
            <div className="bg-white/[0.02] border border-cyan-500/20 rounded-xl p-4 space-y-4 mb-4">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <label className="text-[10px] font-black text-cyan-400 uppercase tracking-widest block flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs">accessibility_new</span>
                  Calibración de Suelo y Piernas (En Vivo)
                </label>
                {activeAnim ? (
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                    En vivo: {activeAnim.name} ({activeAnim.type?.toUpperCase() || 'ANIM'})
                  </span>
                ) : (
                  <span className="text-[8px] text-amber-400/80 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Sin animación activa
                  </span>
                )}
              </div>

              {!activeAnim && (
                <div className="p-2 bg-amber-500/5 border border-amber-500/15 rounded-lg flex items-center gap-2 text-[9px] text-amber-300/90">
                  <span className="material-symbols-outlined text-xs shrink-0">info</span>
                  <span>Reproduce cualquier animación (FBX o VMD) para calibrar el suelo y las piernas en vivo.</span>
                </div>
              )}

              {/* 3 PRESETS GORDOS */}
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => applyVmdPreset('vrm')}
                  className="py-2 px-1 bg-violet-500/10 hover:bg-violet-500/25 text-violet-300 hover:text-white border border-violet-500/30 rounded-lg text-center transition-all flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-[10px] font-bold">Anime / VRM</span>
                  <span className="text-[7px] text-violet-400/70">Escala natural (0.025) • Suelo auto</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyVmdPreset('pmx')}
                  className="py-2 px-1 bg-cyan-500/10 hover:bg-cyan-500/25 text-cyan-300 hover:text-white border border-cyan-500/30 rounded-lg text-center transition-all flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-[10px] font-bold">PMX Exportado</span>
                  <span className="text-[7px] text-cyan-400/70">Escala PMX (0.035) • Suelo auto</span>
                </button>
                <button
                  type="button"
                  onClick={() => applyVmdPreset('reset')}
                  className="py-2 px-1 bg-white/5 hover:bg-white/10 text-slate-300 hover:text-white border border-white/10 rounded-lg text-center transition-all flex flex-col items-center justify-center gap-0.5"
                >
                  <span className="text-[10px] font-bold">Reset</span>
                  <span className="text-[7px] text-slate-400/70">Por defecto</span>
                </button>
              </div>

              {/* 6 CONTROLES */}
              <div className="space-y-3 text-[10px]">
                {/* 1. Escala IK */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-300">
                    <span>1. Escala IK (Unidades VMD → Modelo)</span>
                    <span className="text-cyan-300 font-bold font-mono">{legCalibration.scale.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min="0.005"
                    max="0.50"
                    step="0.005"
                    value={legCalibration.scale}
                    onChange={(e) => handleLegCalibrationChange('scale', parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500">
                    <span>0.010 (Corto)</span>
                    <span>0.025 (Natural Anime)</span>
                    <span>0.080 (Amplio)</span>
                  </div>
                </div>

                {/* 2. Altura de suelo */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-300">
                    <span>2. Altura de suelo (Ajuste fino)</span>
                    <span className="text-cyan-300 font-bold font-mono">
                      {((Math.abs(legCalibration.groundY || 0) >= 0.8 ? 0.0 : (legCalibration.groundY || 0)) >= 0 ? '+' : '') +
                        (Math.abs(legCalibration.groundY || 0) >= 0.8 ? 0.0 : (legCalibration.groundY || 0)).toFixed(2)}m (0 = Suelo natural)
                    </span>
                  </div>
                  <input
                    type="range"
                    min="-0.40"
                    max="0.40"
                    step="0.01"
                    value={Math.abs(legCalibration.groundY || 0) >= 0.8 ? 0.0 : (legCalibration.groundY || 0)}
                    onChange={(e) => handleLegCalibrationChange('groundY', parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500">
                    <span>-0.40m (Baja)</span>
                    <span>0.00m (Suelo natural)</span>
                    <span>+0.40m (Eleva)</span>
                  </div>
                </div>

                {/* 3. Offsets pie L / R */}
                <div className="space-y-1.5 p-2 bg-black/20 rounded-lg border border-white/5">
                  <span className="font-bold text-slate-400 block text-[9px]">3. Offset de Pies (Lateral y Frente/Atrás)</span>

                  {/* Pie Izquierdo */}
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <div className="flex justify-between text-[8px] text-slate-400">
                        <span>Pie L Lateral (X)</span>
                        <span className="text-cyan-300 font-mono">{legCalibration.offsetLX > 0 ? '+' : ''}{legCalibration.offsetLX.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.02"
                        value={legCalibration.offsetLX}
                        onChange={(e) => handleLegCalibrationChange('offsetLX', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[8px] text-slate-400">
                        <span>Pie L Frente/Atrás (Z)</span>
                        <span className="text-cyan-300 font-mono">{legCalibration.offsetLZ > 0 ? '+' : ''}{legCalibration.offsetLZ.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.02"
                        value={legCalibration.offsetLZ}
                        onChange={(e) => handleLegCalibrationChange('offsetLZ', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>

                  {/* Pie Derecho */}
                  <div className="grid grid-cols-2 gap-2 pt-1 border-t border-white/5">
                    <div>
                      <div className="flex justify-between text-[8px] text-slate-400">
                        <span>Pie R Lateral (X)</span>
                        <span className="text-cyan-300 font-mono">{legCalibration.offsetRX > 0 ? '+' : ''}{legCalibration.offsetRX.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.02"
                        value={legCalibration.offsetRX}
                        onChange={(e) => handleLegCalibrationChange('offsetRX', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                    <div>
                      <div className="flex justify-between text-[8px] text-slate-400">
                        <span>Pie R Frente/Atrás (Z)</span>
                        <span className="text-cyan-300 font-mono">{legCalibration.offsetRZ > 0 ? '+' : ''}{legCalibration.offsetRZ.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-0.5"
                        max="0.5"
                        step="0.02"
                        value={legCalibration.offsetRZ}
                        onChange={(e) => handleLegCalibrationChange('offsetRZ', parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                      />
                    </div>
                  </div>
                </div>

                {/* 4. Doblez de rodilla + toggle Invertir rodilla */}
                <div className="space-y-1.5 p-2 bg-black/20 rounded-lg border border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-400 text-[9px]">4. Doblez de Rodilla</span>
                    <label className="flex items-center gap-1.5 cursor-pointer text-[9px] text-amber-300 hover:text-amber-200">
                      <input
                        type="checkbox"
                        checked={legCalibration.invertKnee}
                        onChange={(e) => handleLegCalibrationChange('invertKnee', e.target.checked)}
                        className="rounded border-white/20 accent-amber-400 cursor-pointer"
                      />
                      <span>Invertir rodilla</span>
                    </label>
                  </div>
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Sensibilidad flexión</span>
                    <span className="text-cyan-300 font-bold">{Math.round(legCalibration.kneeAngle * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1.5"
                    step="0.05"
                    value={legCalibration.kneeAngle}
                    onChange={(e) => handleLegCalibrationChange('kneeAngle', parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500">
                    <span>0% (Palo recto)</span>
                    <span>100% (Normal)</span>
                    <span>150% (Pronunciado)</span>
                  </div>
                </div>

                {/* 5. Peso IK vs FK */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-300">
                    <span>5. Peso IK vs FK (Planta vs Cadera)</span>
                    <span className="text-cyan-300 font-bold">{Math.round(legCalibration.ikWeight * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.02"
                    value={legCalibration.ikWeight}
                    onChange={(e) => handleLegCalibrationChange('ikWeight', parseFloat(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-cyan-400"
                  />
                  <div className="flex justify-between text-[8px] text-slate-500">
                    <span>0% (VMD crudo / sigue cadera)</span>
                    <span>85% (Recomendado)</span>
                    <span>100% (IK puro)</span>
                  </div>
                </div>

                {/* 6. Congelar cadera Y */}
                <div className="flex items-center justify-between p-2 bg-black/20 rounded-lg border border-white/5">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-300 block text-[9px]">6. Congelar cadera Y</span>
                    <span className="text-[8px] text-slate-500 block">Evita que センター arrastre las piernas hacia arriba</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={legCalibration.freezeHipY}
                      onChange={(e) => handleLegCalibrationChange('freezeHipY', e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-8 h-4 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3.5 after:transition-all peer-checked:bg-cyan-500"></div>
                  </label>
                </div>

                {/* Botón Guardar en esta animación */}
                {activeAnim && (
                  <button
                    type="button"
                    onClick={() => {
                      animationStore.updateLegCalibration(activeAnim.name, legCalibration);
                      setUploadStatus(`💾 Calibración guardada para "${activeAnim.name}"`);
                      setTimeout(() => setUploadStatus(''), 2500);
                    }}
                    className="w-full py-2 bg-cyan-500/15 hover:bg-cyan-500/30 text-cyan-300 hover:text-white border border-cyan-500/40 rounded-lg transition-all font-bold uppercase tracking-wider text-[9px] flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-xs">save</span>
                    Guardar Calibración para "{activeAnim.name}"
                  </button>
                )}

                {/* GUÍA DE DIAGNÓSTICO RÁPIDA */}
                <div className="p-2.5 bg-cyan-950/20 border border-cyan-500/20 rounded-lg space-y-1 text-[8.5px] text-cyan-200/80">
                  <div className="font-bold text-cyan-300 flex items-center gap-1 mb-1 text-[9px]">
                    <span className="material-symbols-outlined text-xs">help_outline</span>
                    Guía de Diagnóstico Rápido
                  </div>
                  <p className="flex items-start gap-1">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span><strong>Flotan ambos pies:</strong> Ajusta Altura de suelo o Escala IK.</span>
                  </p>
                  <p className="flex items-start gap-1">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span><strong>Un pie bien y el otro no:</strong> Ajusta Offset pie L o R.</span>
                  </p>
                  <p className="flex items-start gap-1">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span><strong>Se balancean rígidas con cadera:</strong> Sube el Peso IK vs FK (≥ 85%).</span>
                  </p>
                  <p className="flex items-start gap-1">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span><strong>Rodilla al revés / pierna rota:</strong> Activa el toggle "Invertir rodilla".</span>
                  </p>
                  <p className="flex items-start gap-1">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span><strong>Cuerpo sube y piernas cuelgan:</strong> Activa "Congelar cadera Y".</span>
                  </p>
                  <p className="flex items-start gap-1">
                    <span className="text-cyan-400 font-bold">•</span>
                    <span><strong>Pasos enanos o zancadas enormes:</strong> Ajusta Escala IK (0.05 a 0.20).</span>
                  </p>
                </div>
              </div>
            </div>

            {/* 🎛️ SLIDERS DE PRUEBA DE ARTICULACIONES Y DEDOS */}
            <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
              <label className="text-[10px] font-black text-violet-400 uppercase tracking-widest block flex items-center gap-1.5">
                <span className="material-symbols-outlined text-xs">tune</span>
                Mando de Pruebas Articulares (QA Manual)
              </label>

              <div className="space-y-3 text-[10px]">
                {/* Brazo Derecho */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Brazo Derecho (Ángulo)</span>
                    <span className="text-violet-300 font-bold">{jointValues.rightArmX}°</span>
                  </div>
                  <input type="range" min="-120" max="90" value={jointValues.rightArmX}
                    onChange={(e) => handleJointChange('rightArmX', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Codo Derecho */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Codo Derecho (Flexión)</span>
                    <span className="text-violet-300 font-bold">{jointValues.rightElbow}°</span>
                  </div>
                  <input type="range" min="0" max="130" value={jointValues.rightElbow}
                    onChange={(e) => handleJointChange('rightElbow', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Dedos Derechos */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Dedos Derechos (Grip)</span>
                    <span className="text-violet-300 font-bold">{Math.round((jointValues.rightFingers / 70) * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="70" value={jointValues.rightFingers}
                    onChange={(e) => handleJointChange('rightFingers', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Brazo Izquierdo */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Brazo Izquierdo (Ángulo)</span>
                    <span className="text-violet-300 font-bold">{jointValues.leftArmX}°</span>
                  </div>
                  <input type="range" min="-120" max="90" value={jointValues.leftArmX}
                    onChange={(e) => handleJointChange('leftArmX', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Codo Izquierdo */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Codo Izquierdo (Flexión)</span>
                    <span className="text-violet-300 font-bold">{jointValues.leftElbow}°</span>
                  </div>
                  <input type="range" min="0" max="130" value={jointValues.leftElbow}
                    onChange={(e) => handleJointChange('leftElbow', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Dedos Izquierdos */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Dedos Izquierdos (Grip)</span>
                    <span className="text-violet-300 font-bold">{Math.round((jointValues.leftFingers / 70) * 100)}%</span>
                  </div>
                  <input type="range" min="0" max="70" value={jointValues.leftFingers}
                    onChange={(e) => handleJointChange('leftFingers', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Torso */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Inclinación Torso</span>
                    <span className="text-violet-300 font-bold">{jointValues.torsoX}°</span>
                  </div>
                  <input type="range" min="-15" max="20" value={jointValues.torsoX}
                    onChange={(e) => handleJointChange('torsoX', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Caderas */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Giro Cadera (Sway)</span>
                    <span className="text-violet-300 font-bold">{jointValues.hipsZ}°</span>
                  </div>
                  <input type="range" min="-15" max="15" value={jointValues.hipsZ}
                    onChange={(e) => handleJointChange('hipsZ', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                {/* Piernas */}
                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Pierna Derecha</span>
                    <span className="text-violet-300 font-bold">{jointValues.rightLegZ}°</span>
                  </div>
                  <input type="range" min="-15" max="30" value={jointValues.rightLegZ}
                    onChange={(e) => handleJointChange('rightLegZ', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                <div className="space-y-1">
                  <div className="flex justify-between font-medium text-slate-400">
                    <span>Pierna Izquierda</span>
                    <span className="text-violet-300 font-bold">{jointValues.leftLegZ}°</span>
                  </div>
                  <input type="range" min="-30" max="15" value={jointValues.leftLegZ}
                    onChange={(e) => handleJointChange('leftLegZ', Number(e.target.value))}
                    className="w-full h-1 bg-white/10 rounded-full appearance-none cursor-pointer accent-violet-400" />
                </div>

                <button
                  onClick={() => {
                    const defaults = { rightArmX: -80, rightElbow: 0, leftArmX: -80, leftElbow: 0, torsoX: 0, hipsZ: 0, rightLegZ: 0, leftLegZ: 0, rightFingers: 0, leftFingers: 0 };
                    Object.entries(defaults).forEach(([k, v]) => handleJointChange(k, v));
                  }}
                  className="w-full bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 hover:text-white border border-violet-500/30 rounded-lg py-2 mt-2 transition-all font-bold uppercase tracking-wider text-[9px]"
                >
                  Restablecer Pose
                </button>
              </div>
            </div>

            <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mt-4 mb-2">Mapeo de Huesos para Animaciones FBX</label>

            {boneMapping.length === 0 ? (
              <div className="text-center py-4 bg-white/[0.01] border border-white/5 rounded-xl">
                <span className="material-symbols-outlined text-xl text-slate-600 block mb-1">skeleton</span>
                <p className="text-[9px] text-slate-400">Carga una animación .fbx para ver el mapeo automático</p>
              </div>
            ) : (<>
              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-2 text-center">
                  <span className="text-sm font-bold text-emerald-400 block">
                    {boneMapping.filter(b => b.targetBone && b.priority >= 5).length}
                  </span>
                  <span className="text-[8px] text-emerald-400/70">Conectados</span>
                </div>
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
                  <span className="text-sm font-bold text-red-400 block">
                    {boneMapping.filter(b => !b.targetBone && b.priority >= 5).length}
                  </span>
                  <span className="text-[8px] text-red-400/70">Sin Match</span>
                </div>
                <div className="bg-violet-500/10 border border-violet-500/20 rounded-lg p-2 text-center">
                  <span className="text-sm font-bold text-violet-400 block">
                    {Math.round(boneMapping.filter(b => b.priority >= 5).reduce((acc, b) => acc + b.confidence, 0) / Math.max(boneMapping.filter(b => b.priority >= 5).length, 1) * 100)}%
                  </span>
                  <span className="text-[8px] text-violet-400/70">Confianza</span>
                </div>
              </div>

              {/* Bone list - principales */}
              <div>
                <label className="text-[9px] font-bold text-slate-500 uppercase block mb-1.5">Huesos Principales</label>
                <div className="space-y-1">
                  {boneMapping.filter(b => b.priority >= 7).map(b => (
                    <div key={b.mixamoBone} className={`flex items-center gap-2 p-1.5 rounded text-[9px] ${b.targetBone ? 'bg-emerald-500/5' : 'bg-red-500/5'
                      }`}>
                      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${b.confidence > 0.7 ? 'bg-emerald-400' : b.confidence > 0.3 ? 'bg-yellow-400' : 'bg-red-400'
                        }`}></span>
                      <span className="text-slate-400 w-[120px] shrink-0 truncate" title={b.mixamoBone}>
                        {b.mixamoBone.replace('mixamorig', '')}
                      </span>
                      <span className="text-slate-600">→</span>
                      <span className={`truncate font-mono ${b.targetBone ? 'text-white' : 'text-red-400'}`} title={b.targetBone || 'NO MATCH'}>
                        {b.targetBone || '✗ sin match'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Huesos secundarios (dedos, etc) */}
              <details className="group">
                <summary className="text-[9px] font-bold text-slate-500 uppercase cursor-pointer hover:text-slate-300 transition-colors">
                  Huesos Secundarios ({boneMapping.filter(b => b.priority < 7).length})
                  <span className="text-slate-600 ml-1">▼</span>
                </summary>
                <div className="space-y-0.5 mt-1.5">
                  {boneMapping.filter(b => b.priority < 7).map(b => (
                    <div key={b.mixamoBone} className="flex items-center gap-1.5 px-1 text-[8px]">
                      <span className={`w-1 h-1 rounded-full shrink-0 ${b.targetBone ? 'bg-emerald-400/50' : 'bg-slate-600'
                        }`}></span>
                      <span className="text-slate-500 truncate">{b.mixamoBone.replace('mixamorig', '')}</span>
                      <span className="text-slate-700">→</span>
                      <span className="text-slate-400 truncate font-mono">{b.targetBone || '—'}</span>
                    </div>
                  ))}
                </div>
              </details>

              <div className="bg-blue-500/5 border border-blue-500/10 rounded-lg p-3 text-[9px] text-slate-400">
                <p className="flex items-center gap-1 font-medium text-blue-300 mb-1">
                  <span className="material-symbols-outlined text-xs">info</span> Sobre la calibración
                </p>
                <p>El sistema auto-detecta los huesos escaneando el modelo. Si un hueso principal muestra <span className="text-red-400">✗</span>, la animación no se aplicará bien en esa parte del cuerpo.</p>
              </div>
            </>)}

            {/* Todos los huesos del modelo — lista completa con scroll y buscador */}
            {modelBones.length > 0 && (
              <div className="bg-white/[0.02] border border-orange-500/20 rounded-xl p-3 space-y-2">
                <label className="text-[10px] font-black text-orange-400 uppercase tracking-widest block">
                  🦴 Huesos del Modelo ({modelBones.length})
                </label>
                <input
                  type="search"
                  value={boneSearch}
                  onChange={(e) => setBoneSearch(e.target.value)}
                  placeholder="Buscar: 尻 胸 siri butt hip…"
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-[10px] text-slate-200 placeholder:text-slate-600 outline-none focus:border-orange-400/50"
                />
                <p className="text-[8px] text-slate-500">Rosa = pecho · Violeta = culo · Copia el nombre exacto si el culo no se mueve.</p>
                <div className="p-2 bg-black/40 rounded-lg max-h-[min(50vh,28rem)] overflow-y-auto overflow-x-hidden custom-scrollbar">
                  <div className="flex flex-wrap gap-1">
                    {modelBones
                      .filter(b => {
                        const q = boneSearch.trim().toLowerCase();
                        return !q || b.toLowerCase().includes(q) || b.includes(boneSearch.trim());
                      })
                      .map(bone => {
                        const n = bone.toLowerCase();
                        const isBreast = n.includes('breast') || n.includes('boob') || n.includes('mune') || n.includes('oppai') || n.includes('bust') || bone.includes('胸') || bone.includes('乳');
                        const isButt = n.includes('butt') || n.includes('glute') || n.includes('shiri') || n.includes('siri') || n.includes('ass') || bone.includes('尻') || bone.includes('臀') || bone.includes('ケツ') || bone.includes('お尻');
                        return (
                          <button
                            type="button"
                            key={bone}
                            title="Clic para copiar"
                            onClick={() => {
                              navigator.clipboard?.writeText(bone);
                              setUploadStatus(`📋 Copiado: ${bone}`);
                              setTimeout(() => setUploadStatus(''), 2000);
                            }}
                            className={`px-1.5 py-0.5 rounded text-[8px] font-mono text-left ${isBreast ? 'bg-rose-500/25 text-rose-200 ring-1 ring-rose-400/40' :
                                isButt ? 'bg-violet-500/25 text-violet-200 ring-1 ring-violet-400/40' :
                                  bone.startsWith('DEF-') ? 'bg-emerald-500/10 text-emerald-400' :
                                    bone.includes('J_Bip') ? 'bg-blue-500/10 text-blue-400' :
                                      'bg-slate-500/10 text-slate-400'
                              }`}
                          >{bone}</button>
                        );
                      })}
                  </div>
                </div>
              </div>
            )}
          </>)}

          {/* ═══ TAB: APRENDIZAJE ═══ */}
          {activeTab === 'learning' && (
            <div className="space-y-4">
              <div className="bg-white/[0.02] border border-white/5 rounded-xl p-4 space-y-4">
                <label className="text-[10px] font-black text-violet-400 uppercase tracking-widest block flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-xs">psychology</span>
                  Preferencias de Avatar Aprendidas
                </label>

                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Nova aprende de forma autónoma qué avatar prefieres según el contexto de la conversación (temas, estados de ánimo o la hora del día).
                </p>

                {AvatarLearningService.getLocalPreferences().length === 0 ? (
                  <div className="text-center py-6 border border-dashed border-white/5 rounded-xl">
                    <span className="material-symbols-outlined text-xl text-slate-600 block mb-1">sentiment_neutral</span>
                    <p className="text-[9px] text-slate-500">Aún no he aprendido ninguna preferencia. ¡Habla conmigo para empezar!</p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {AvatarLearningService.getLocalPreferences()
                      .sort((a, b) => b.confidence - a.confidence)
                      .map((pref, idx) => (
                        <div key={idx} className="bg-white/[0.01] border border-white/5 rounded-lg p-2.5 flex items-center justify-between text-[10px]">
                          <div>
                            <div className="flex items-center gap-1.5 mb-1">
                              <span className="text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded font-mono uppercase">
                                {pref.context_type === 'explicit' ? '💬 explícito' : pref.context_type === 'mood' ? '🎭 emoción' : pref.context_type === 'topic' ? '📚 tema' : '🕒 hora'}
                              </span>
                              <span className="text-slate-300 font-bold capitalize">{pref.context_value}</span>
                            </div>
                            <div className="text-slate-400">
                              Avatar preferido: <span className="text-violet-300 font-bold">{pref.avatar_name}</span>
                            </div>
                          </div>
                          <div className="text-right flex flex-col items-end">
                            <span className="text-violet-400 font-bold font-mono">{(pref.confidence * 100).toFixed(0)}%</span>
                            <span className="text-[8px] text-slate-500">{pref.hits}/{pref.total_uses} usos</span>
                          </div>
                        </div>
                      ))}

                    <button
                      onClick={() => {
                        AvatarLearningService.resetPreferences();
                        window.dispatchEvent(new Event('nova-avatar-prefs-reset'));
                      }}
                      className="w-full bg-red-500/10 hover:bg-red-500/20 text-red-400 hover:text-white border border-red-500/30 rounded-lg py-2 mt-2 transition-all font-bold uppercase tracking-wider text-[9px]"
                    >
                      Resetear Aprendizaje
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* RIGHT: Vista Previa en Vivo del Avatar */}
      <div className="flex-1 relative bg-[#080812]">
        <ErrorBoundary fallback={
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-900 z-50 p-6 text-center">
            <div className="text-red-500 text-4xl mb-4">⚠️</div>
            <h3 className="text-white font-bold mb-2">Error en el Visor 3D</h3>
            <p className="text-slate-400 text-xs mb-4">No se pudo cargar el modelo o hubo un fallo de renderizado.</p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-violet-600 hover:bg-violet-500 text-white text-xs rounded-lg transition-colors"
            >
              Reiniciar Aplicación
            </button>
          </div>
        }>
          <React.Suspense fallback={
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/20 backdrop-blur-sm z-50">
              <div className="w-8 h-8 border-2 border-violet-500/20 border-t-violet-500 rounded-full animate-spin mb-2"></div>
              <p className="text-violet-400 text-[9px] font-medium animate-pulse uppercase">Cargando Motor 3D...</p>
            </div>
          }>
            <AvatarViewer3D
              key={avatar.modelUrl}
              avatar={avatar}
              activeAction={activeAction}
              emotion="neutral"
              isAiSpeaking={false}
              isHotMode={avatar.isBoldMode}
              showInteractionTools={false}
            />
          </React.Suspense>
        </ErrorBoundary>

        {/* Indicador Live y Selector de Modo de Cámara */}
        <div className="absolute top-3 left-3 z-10 flex items-center gap-2">
          <div className="flex items-center gap-2 bg-black/60 backdrop-blur-md px-2.5 py-1 rounded-full border border-white/10">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            <span className="text-[9px] font-medium text-slate-300">Preview 3D</span>
          </div>

          {/* 🎥 Selector Rápido de Cámara */}
          <div className="flex items-center bg-black/60 backdrop-blur-md p-0.5 rounded-full border border-white/10 shadow-lg">
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
                window.dispatchEvent(new CustomEvent('nova-camera-preset', { detail: { preset: 'default' } }));
              }}
              className="px-2 py-0.5 rounded-full text-[8px] font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Cámara frontal libre"
            >
              🖱️ Libre
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
                window.dispatchEvent(new CustomEvent('nova-camera-preset', { detail: { preset: 'dynamic' } }));
              }}
              className="px-2 py-0.5 rounded-full text-[8px] font-bold text-cyan-300 hover:text-cyan-200 hover:bg-cyan-500/20 transition-colors"
              title="Cámara cinemática orbital suave"
            >
              🎬 Dinámica
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
                window.dispatchEvent(new CustomEvent('nova-camera-preset', { detail: { preset: 'face' } }));
              }}
              className="px-2 py-0.5 rounded-full text-[8px] font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Cámara enfocada en el rostro"
            >
              👤 Rostro
            </button>
            <button
              onClick={() => {
                window.dispatchEvent(new CustomEvent('nova-vmd-camera-stop'));
                window.dispatchEvent(new CustomEvent('nova-camera-preset', { detail: { preset: 'full' } }));
              }}
              className="px-2 py-0.5 rounded-full text-[8px] font-bold text-slate-300 hover:text-white hover:bg-white/10 transition-colors"
              title="Cámara de cuerpo entero"
            >
              🧍 Cuerpo
            </button>
          </div>
        </div>

        {/* Acción activa */}
        {activeAction && (
          <div className="absolute top-3 right-3 z-10 bg-violet-500/20 backdrop-blur-sm px-2.5 py-1 rounded-full border border-violet-500/30">
            <span className="text-[9px] font-medium text-violet-300">▶ {activeAction}</span>
          </div>
        )}
      </div>

      {/* ═══ MODAL SELECTOR DE ANIMACIONES PARA GESTOS ═══ */}
      {assigningGesture && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#121220] border border-white/10 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden">

            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xl shadow-inner">
                  {assigningGesture.icon || '✨'}
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Vincular a: {assigningGesture.name}</span>
                    <span className="text-[10px] font-mono text-cyan-400 bg-cyan-950/70 px-1.5 py-0.5 rounded border border-cyan-500/30">
                      {assigningGesture.id}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Selecciona una animación cargada. Se ejecutará con su cuerpo, cara, música y cámara.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssigningGesture(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Controls: Search & Categories */}
            <div className="p-3 border-b border-white/5 flex flex-col gap-2 bg-black/20">
              <div className="relative">
                <input
                  type="text"
                  value={animSearch}
                  onChange={(e) => setAnimSearch(e.target.value)}
                  placeholder="🔍 Buscar animación por nombre, alias en español..."
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-slate-500 outline-none focus:border-cyan-400"
                />
                {animSearch && (
                  <button
                    onClick={() => setAnimSearch('')}
                    className="absolute right-2.5 top-1.5 text-slate-400 hover:text-white text-xs"
                  >
                    ✕
                  </button>
                )}
              </div>

              {/* Categorías */}
              <div className="flex items-center gap-1 overflow-x-auto pb-0.5 scrollbar-none">
                {ANIMATION_CATEGORIES.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setAnimCategoryFilter(cat.id)}
                    className={`px-2 py-1 rounded-lg text-[9px] font-semibold whitespace-nowrap transition-all flex items-center gap-1 ${animCategoryFilter === cat.id
                        ? 'bg-cyan-600 text-white shadow-sm'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-white'
                      }`}
                  >
                    <span>{cat.icon}</span>
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Modal Body: Lista de Animaciones */}
            <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[55vh]">
              {storedAnims.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <span className="material-symbols-outlined text-4xl text-slate-600 mb-2 block">folder_open</span>
                  <p className="text-xs font-bold text-slate-300">No hay animaciones cargadas</p>
                  <p className="text-[10px] text-slate-500 mt-1 max-w-sm mx-auto">
                    Ve a la pestaña <strong>"Anims"</strong> para arrastrar y cargar tus archivos .vmd o packs MMD completos.
                  </p>
                </div>
              ) : (
                storedAnims
                  .filter(anim => {
                    if (animCategoryFilter !== 'all' && (anim.category || 'other') !== animCategoryFilter) return false;
                    if (animSearch) {
                      const q = animSearch.toLowerCase();
                      return anim.name.toLowerCase().includes(q) ||
                        (anim.displayName && anim.displayName.toLowerCase().includes(q)) ||
                        (anim.customTag && anim.customTag.toLowerCase().includes(q));
                    }
                    return true;
                  })
                  .map(anim => {
                    const isCurrentOverride = gestureOverrides.get(assigningGesture.id) === anim.name;
                    const isPreviewing = activeAction === anim.name;

                    return (
                      <div
                        key={anim.name}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${isCurrentOverride
                            ? 'bg-cyan-950/40 border-cyan-500/60 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                            : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                          }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">
                              {anim.category === 'dance' ? '💃' : anim.category === 'greeting' ? '👋' : anim.category === 'charm' ? '💖' : '🎬'}
                            </span>
                            <span className="text-xs font-bold text-white truncate block">
                              {anim.displayName || anim.name}
                            </span>
                            {isCurrentOverride && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-cyan-500 text-black shrink-0 uppercase">
                                Actual
                              </span>
                            )}
                          </div>

                          {anim.displayName && (
                            <span className="text-[9px] text-slate-500 block truncate font-mono mt-0.5">
                              Archivo: {anim.name}
                            </span>
                          )}

                          {/* Badges del Pack */}
                          <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                            <span className="text-[8px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400 font-medium">
                              .{anim.type}
                            </span>
                            {anim.hasCamera && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/30 flex items-center gap-0.5 font-medium">
                                🎥 Cámara
                              </span>
                            )}
                            {anim.hasFacial && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-0.5 font-medium">
                                🎭 Facial
                              </span>
                            )}
                            {(anim.audioUrl || anim.audioFileName) && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/30 flex items-center gap-0.5 font-medium">
                                🎵 Música
                              </span>
                            )}
                            {anim.assignedGesture && anim.assignedGesture !== assigningGesture.id && (
                              <span className="text-[8px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-white/10">
                                Vinculado a {gestureRegistry.getGesture(anim.assignedGesture)?.name || anim.assignedGesture}
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Botones de Selección y Preview */}
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => triggerAction(anim.name)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${isPreviewing
                                ? 'bg-amber-500 text-black'
                                : 'bg-white/10 hover:bg-white/20 text-white'
                              }`}
                            title="Previsualizar animación en el modelo"
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {isPreviewing ? 'pause' : 'play_arrow'}
                            </span>
                            {isPreviewing ? 'Parar' : 'Probar'}
                          </button>

                          <button
                            onClick={() => {
                              gestureRegistry.setGestureOverride(assigningGesture.id, anim.name);
                              animationStore.updateMeta(anim.name, { assignedGesture: assigningGesture.id });
                              setAssigningGesture(null);
                              // Reproducir la nueva animación asignada inmediatamente
                              setTimeout(() => {
                                triggerAction(assigningGesture.id);
                              }, 100);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${isCurrentOverride
                                ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                                : 'bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 text-white shadow-md'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">check</span>
                            {isCurrentOverride ? 'Asignada' : 'Seleccionar'}
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">
                {storedAnims.length} animaciones disponibles en biblioteca
              </span>
              <button
                onClick={() => setAssigningGesture(null)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: SELECCIONAR ANIMACIÓN PARA SLOT IDLE / HABLA */}
      {assigningIdleSlot && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121f] border border-violet-500/30 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl flex flex-col max-h-[85vh]">

            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-3">
                <span className="text-2xl">{assigningIdleSlot.icon}</span>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    Vincular: <span className="text-violet-400">{assigningIdleSlot.label}</span>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${assigningIdleSlot.group === 'idle' ? 'bg-blue-500/20 text-blue-300' : 'bg-amber-500/20 text-amber-300'
                      }`}>
                      {assigningIdleSlot.group === 'idle' ? 'Pose de Reposo' : 'Gesto de Habla'}
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Elige la animación que sustituirá a este estado {assigningIdleSlot.group === 'idle' ? 'cuando el avatar esté en reposo' : 'mientras hable'}.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssigningIdleSlot(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Modal Controls: Search */}
            <div className="p-3 border-b border-white/5 bg-black/20">
              <input
                type="text"
                value={animSearch}
                onChange={(e) => setAnimSearch(e.target.value)}
                placeholder="🔍 Buscar animación por nombre..."
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-slate-500 outline-none focus:border-violet-400"
              />
            </div>

            {/* Modal Body: Lista de Animaciones */}
            <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[55vh]">
              {storedAnims.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <span className="material-symbols-outlined text-4xl text-slate-600 mb-2 block">folder_open</span>
                  <p className="text-xs font-bold text-slate-300">No hay animaciones cargadas</p>
                  <p className="text-[10px] text-slate-500 mt-1">Carga animaciones en la pestaña "Anims" primero.</p>
                </div>
              ) : (
                storedAnims
                  .filter(anim => {
                    if (animSearch) {
                      const q = animSearch.toLowerCase();
                      return anim.name.toLowerCase().includes(q) || (anim.displayName && anim.displayName.toLowerCase().includes(q));
                    }
                    return true;
                  })
                  .map(anim => {
                    const isCurrentOverride = idleOverrides[assigningIdleSlot.id] === anim.name;
                    const isPreviewing = activeAction === anim.name;

                    return (
                      <div
                        key={anim.name}
                        className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${isCurrentOverride
                            ? 'bg-violet-950/40 border-violet-500/60 shadow-[0_0_15px_rgba(139,92,246,0.15)]'
                            : 'bg-white/[0.02] border-white/5 hover:border-white/20'
                          }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm">🎬</span>
                            <span className="text-xs font-bold text-white truncate block">
                              {anim.displayName || anim.name}
                            </span>
                            {isCurrentOverride && (
                              <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-violet-500 text-white shrink-0 uppercase">
                                Actual
                              </span>
                            )}
                          </div>
                          <span className="text-[8px] text-slate-500 block font-mono mt-0.5">
                            .{anim.type} {anim.hasFacial ? '• 🎭 Facial' : ''} {anim.audioFileName ? '• 🎵 Audio' : ''}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() => triggerAction(anim.name)}
                            className={`px-2.5 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${isPreviewing ? 'bg-amber-500 text-black' : 'bg-white/10 hover:bg-white/20 text-white'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">
                              {isPreviewing ? 'pause' : 'play_arrow'}
                            </span>
                            {isPreviewing ? 'Parar' : 'Probar'}
                          </button>

                          <button
                            onClick={() => {
                              idleOverrideRegistry.setOverride(assigningIdleSlot.id, anim.name);
                              setAssigningIdleSlot(null);
                              // Probar inmediatamente
                              setTimeout(() => {
                                triggerAction(anim.name);
                              }, 100);
                            }}
                            className={`px-3 py-1.5 rounded-lg text-[10px] font-bold flex items-center gap-1 transition-all ${isCurrentOverride
                                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                                : 'bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white shadow-md'
                              }`}
                          >
                            <span className="material-symbols-outlined text-[13px]">check</span>
                            {isCurrentOverride ? 'Asignada' : 'Seleccionar'}
                          </button>
                        </div>
                      </div>
                    );
                  })
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{storedAnims.length} animaciones disponibles</span>
              <button
                onClick={() => setAssigningIdleSlot(null)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>

          </div>
        </div>
      )}

      {/* MODAL: CREAR NUEVO GESTO EN CATÁLOGO */}
      {showCreateGestureModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#12121f] border border-cyan-500/30 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl flex flex-col">

            {/* Modal Header */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-black/40">
              <div className="flex items-center gap-2">
                <span className="text-xl">✨</span>
                <div>
                  <h3 className="text-sm font-bold text-white">Crear Nuevo Gesto</h3>
                  <p className="text-[10px] text-slate-400">Añade un nuevo gesto al catálogo para Nova y el chat</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateGestureModal(false)}
                className="text-slate-400 hover:text-white transition-colors"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-4 space-y-3 max-h-[70vh] overflow-y-auto">
              {/* Icono y Nombre */}
              <div className="flex gap-2">
                <div className="w-16">
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Emoji</label>
                  <input
                    type="text"
                    value={newGestureIcon}
                    onChange={e => setNewGestureIcon(e.target.value)}
                    maxLength={3}
                    className="w-full text-center bg-black/30 border border-white/10 rounded-lg py-1.5 text-base text-white outline-none focus:border-cyan-400"
                    placeholder="✨"
                  />
                </div>
                <div className="flex-1">
                  <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Nombre del Gesto *</label>
                  <input
                    type="text"
                    value={newGestureName}
                    onChange={e => {
                      setNewGestureName(e.target.value);
                      if (!newGestureId) {
                        setNewGestureId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''));
                      }
                    }}
                    placeholder="Ej: Saludo Militar, Guiño Coqueto..."
                    className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-slate-500 outline-none focus:border-cyan-400"
                  />
                </div>
              </div>

              {/* ID Técnico (etiqueta [DO:ID]) */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                  ID de Acción (etiqueta: <code className="text-cyan-300">[DO:{newGestureId.toUpperCase() || 'ACCION'}]</code>)
                </label>
                <input
                  type="text"
                  value={newGestureId}
                  onChange={e => setNewGestureId(e.target.value.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, ''))}
                  placeholder="ej: saludo_militar"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] font-mono text-cyan-300 placeholder:text-slate-600 outline-none focus:border-cyan-400"
                />
              </div>

              {/* Categoría */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Categoría</label>
                <select
                  value={newGestureCategory}
                  onChange={e => setNewGestureCategory(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white outline-none focus:border-cyan-400 cursor-pointer"
                >
                  {GESTURE_CATEGORIES.filter(c => c.id !== 'all').map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label}</option>
                  ))}
                  {customGestureCategories.map(c => (
                    <option key={c.id} value={c.id}>{c.icon} {c.label} (Personalizada)</option>
                  ))}
                </select>
              </div>

              {/* Aliases de voz / texto */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                  Palabras clave / Aliases (separados por coma)
                </label>
                <input
                  type="text"
                  value={newGestureAliases}
                  onChange={e => setNewGestureAliases(e.target.value)}
                  placeholder="ej: firmes, militar, soldado, saludo respetuoso"
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white placeholder:text-slate-500 outline-none focus:border-cyan-400"
                />
              </div>

              {/* Duración en segundos */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">Duración predeterminada (segundos)</label>
                <input
                  type="number"
                  step="0.5"
                  min="1"
                  max="30"
                  value={newGestureDuration}
                  onChange={e => setNewGestureDuration(e.target.value)}
                  className="w-full bg-black/30 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-white outline-none focus:border-cyan-400"
                />
              </div>

              {/* Asignar de inmediato una animación existente */}
              <div>
                <label className="text-[9px] font-bold text-slate-400 uppercase block mb-1">
                  Asignar animación de biblioteca de inmediato (opcional)
                </label>
                <select
                  value={newGestureAssignAnim}
                  onChange={e => setNewGestureAssignAnim(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 rounded-lg px-2.5 py-1.5 text-[10px] text-slate-200 outline-none focus:border-cyan-400 cursor-pointer"
                >
                  <option value="">Ninguna (usar motor procedural)</option>
                  {storedAnims.map(a => (
                    <option key={a.name} value={a.name}>
                      🎬 {a.displayName || a.name} (.{a.type})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-end gap-2">
              <button
                onClick={() => setShowCreateGestureModal(false)}
                className="px-3 py-1.5 rounded-lg text-[10px] font-semibold bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={handleCreateUserGesture}
                disabled={!newGestureName.trim()}
                className="px-4 py-1.5 rounded-lg text-[10px] font-bold bg-gradient-to-r from-violet-600 to-cyan-600 hover:from-violet-500 hover:to-cyan-500 disabled:opacity-40 text-white shadow-md transition-all cursor-pointer"
              >
                Crear Gesto
              </button>
            </div>

          </div>
        </div>
      )}
      {/* MODAL: SELECCIONAR ANIMACIÓN DE BIBLIOTECA PARA PUESTO DE GRUPO */}
      {assigningSlotAnim && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#121220] border border-violet-500/30 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-[0_20px_60px_rgba(0,0,0,0.85)] overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xl shadow-inner">
                  👥
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Asignar a Puesto: <strong className="text-violet-400">{assigningSlotAnim.name}</strong></span>
                    <span className="text-[10px] text-slate-400 font-mono">X: {assigningSlotAnim.defaultOffsetX}m</span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Selecciona uno de tus bailes ya cargados para este bailarín.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssigningSlotAnim(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Buscador */}
            <div className="p-3 border-b border-white/5 bg-black/20">
              <input
                type="text"
                value={animSearch}
                onChange={(e) => setAnimSearch(e.target.value)}
                placeholder="🔍 Buscar en tus más de 200 bailes..."
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-slate-500 outline-none focus:border-violet-400"
              />
            </div>

            {/* Lista de animaciones */}
            <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[55vh]">
              {storedAnims
                .filter(anim => {
                  if (animSearch) {
                    const q = animSearch.toLowerCase();
                    return anim.name.toLowerCase().includes(q) ||
                      (anim.displayName && anim.displayName.toLowerCase().includes(q)) ||
                      (anim.customTag && anim.customTag.toLowerCase().includes(q));
                  }
                  return true;
                })
                .map(anim => {
                  const isCurrent = assigningSlotAnim.vmdName === (anim.displayName || anim.name);
                  return (
                    <div
                      key={anim.name}
                      className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${isCurrent ? 'bg-violet-950/40 border-violet-500/60' : 'bg-white/[0.02] border-white/5 hover:border-violet-500/30'
                        }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">💃</span>
                          <span className="text-xs font-bold text-white truncate block">
                            {anim.displayName || anim.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[8px] text-slate-400">
                          <span className="font-mono">.{anim.type}</span>
                          {anim.hasCamera && <span className="text-amber-400 font-bold">• 🎥 Cámara</span>}
                          {(anim.audioUrl || anim.audioFileName) && <span className="text-violet-400 font-bold">• 🎵 Música</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => triggerAction(anim.name)}
                          className="px-2 py-1 rounded text-[9px] bg-white/10 hover:bg-white/20 text-white font-medium"
                        >
                          Probar
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePickAnimationForSlot(assigningSlotAnim.id, anim)}
                          className="px-3 py-1 rounded-lg text-[9px] font-bold bg-violet-600 hover:bg-violet-500 text-white shadow transition-all"
                        >
                          {isCurrent ? '✓ Reasignar' : 'Asignar Puesto'}
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{storedAnims.length} bailes en tu colección</span>
              <button
                onClick={() => setAssigningSlotAnim(null)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SELECCIONAR AUDIO PARA EL GRUPO */}
      {assigningGroupAudio && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#121220] border border-violet-500/30 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center text-xl">
                  🎵
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Elegir Música de tus Bailes</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Selecciona una canción ya guardada en cualquiera de tus bailes para la coreografía grupal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssigningGroupAudio(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[55vh]">
              {storedAnims.filter(a => a.audioUrl || a.audioFileName).length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No hay canciones vinculadas en tus bailes. Puedes subir una directamente con el botón "Subir".
                </div>
              ) : (
                storedAnims
                  .filter(a => a.audioUrl || a.audioFileName)
                  .map(anim => (
                    <div
                      key={anim.name}
                      className="p-2.5 rounded-xl border border-white/5 bg-black/30 flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <span className="text-xs font-bold text-white truncate block">
                          {anim.audioFileName || `Audio de ${anim.displayName || anim.name}`}
                        </span>
                        <span className="text-[8px] text-violet-400 block truncate">
                          Del baile: {anim.displayName || anim.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handlePickAudioForGroup(anim)}
                        className="px-3 py-1 rounded-lg text-[9px] font-bold bg-violet-600 hover:bg-violet-500 text-white shadow"
                      >
                        Usar Audio
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-end">
              <button
                onClick={() => setAssigningGroupAudio(false)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SELECCIONAR CÁMARA PARA EL GRUPO */}
      {assigningGroupCamera && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#121220] border border-cyan-500/30 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 border border-cyan-500/30 flex items-center justify-center text-xl">
                  🎥
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Elegir Cámara Cinemática VMD</h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Vincula una cámara VMD guardada en tus bailes para enfocar la coreografía grupal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setAssigningGroupCamera(false)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm"
              >
                ✕
              </button>
            </div>

            <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[55vh]">
              {storedAnims.filter(a => a.cameraUrl || a.cameraFileName || a.hasCamera).length === 0 ? (
                <div className="text-center py-8 text-slate-500 text-xs">
                  No hay cámaras cinemáticas guardadas en tus bailes. Puedes subir un .vmd de cámara con el botón "Subir".
                </div>
              ) : (
                storedAnims
                  .filter(a => a.cameraUrl || a.cameraFileName || a.hasCamera)
                  .map(anim => (
                    <div
                      key={anim.name}
                      className="p-2.5 rounded-xl border border-white/5 bg-black/30 flex items-center justify-between"
                    >
                      <div className="min-w-0 flex-1 mr-2">
                        <span className="text-xs font-bold text-white truncate block">
                          {anim.cameraFileName || `Cámara VMD de ${anim.displayName || anim.name}`}
                        </span>
                        <span className="text-[8px] text-cyan-400 block truncate">
                          Del baile: {anim.displayName || anim.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handlePickCameraForGroup(anim)}
                        className="px-3 py-1 rounded-lg text-[9px] font-bold bg-cyan-600 hover:bg-cyan-500 text-white shadow"
                      >
                        Usar Cámara
                      </button>
                    </div>
                  ))
              )}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-end">
              <button
                onClick={() => setAssigningGroupCamera(false)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: SELECCIONAR MOTION DE LA BIBLIOTECA PARA BAILARÍN EXTRA */}
      {pickingLibraryForExtra && (
        <div className="fixed inset-0 z-[9999] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-200">
          <div className="bg-[#121220] border border-violet-500/40 rounded-2xl w-full max-w-xl max-h-[85vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Cabecera */}
            <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-600/30 border border-violet-400/30 flex items-center justify-center text-xl">
                  💃
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white flex items-center gap-2">
                    <span>Elegir Motion para {pickingLibraryForExtra.name}</span>
                    <span className="text-[9px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 font-bold border border-violet-500/30">
                      {pickingLibraryForExtra.role} (X: {pickingLibraryForExtra.offsetX}m)
                    </span>
                  </h3>
                  <p className="text-[10px] text-slate-400 mt-0.5">
                    Asigna un baile de tu colección para este puesto lateral.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setPickingLibraryForExtra(null)}
                className="w-8 h-8 rounded-lg bg-white/5 hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center text-sm transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Buscador */}
            <div className="p-3 border-b border-white/5 bg-black/20">
              <input
                type="text"
                value={animSearch}
                onChange={(e) => setAnimSearch(e.target.value)}
                placeholder="🔍 Buscar en tus más de 200 bailes cargados..."
                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-1.5 text-[11px] text-white placeholder:text-slate-500 outline-none focus:border-violet-400"
              />
            </div>

            {/* Lista de animaciones */}
            <div className="p-3 overflow-y-auto flex-1 space-y-2 max-h-[55vh]">
              {storedAnims
                .filter(anim => {
                  if (animSearch) {
                    const q = animSearch.toLowerCase();
                    return anim.name.toLowerCase().includes(q) ||
                      (anim.displayName && anim.displayName.toLowerCase().includes(q)) ||
                      (anim.customTag && anim.customTag.toLowerCase().includes(q));
                  }
                  return true;
                })
                .map(anim => {
                  return (
                    <div
                      key={anim.name}
                      className="p-2.5 rounded-xl border border-white/5 bg-white/[0.02] hover:border-violet-500/30 transition-all flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="text-sm">🌸</span>
                          <span className="text-xs font-bold text-white truncate block">
                            {anim.displayName || anim.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 mt-1 text-[8px] text-slate-400">
                          <span className="font-mono">.{anim.type}</span>
                          {anim.hasCamera && <span className="text-amber-400 font-bold">• 🎥 Cámara</span>}
                          {(anim.audioUrl || anim.audioFileName) && <span className="text-violet-400 font-bold">• 🎵 Música</span>}
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => triggerAction(anim.name)}
                          className="px-2 py-1 rounded text-[9px] bg-white/10 hover:bg-white/20 text-white font-medium"
                        >
                          Probar
                        </button>
                        <button
                          type="button"
                          onClick={() => handlePickExtraMotionFromLibrary(anim)}
                          className="px-3 py-1 rounded-lg text-[9px] font-bold bg-violet-600 hover:bg-violet-500 text-white shadow transition-all cursor-pointer"
                        >
                          Asignar Puesto
                        </button>
                      </div>
                    </div>
                  );
                })}
            </div>

            <div className="p-3 border-t border-white/10 bg-black/30 flex items-center justify-between">
              <span className="text-[10px] text-slate-500">{storedAnims.length} bailes disponibles</span>
              <button
                onClick={() => setPickingLibraryForExtra(null)}
                className="px-4 py-1.5 rounded-lg text-[10px] font-semibold bg-white/10 hover:bg-white/15 text-white transition-colors cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AvatarStudio;
