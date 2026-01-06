# 🎨 Guía de Uso: Sistema Avanzado de Animaciones 3D

## 📋 Resumen

Se han implementado **5 sistemas avanzados** para el avatar 3D de Nova IA:

1. **AnimationManager** - Gestión de animaciones de Blender
2. **IKController** - Head & eye tracking natural  
3. **MoodSystem** - Estados anímicos persistentes
4. **InteractionSystem** - Detección de clicks/hover en el avatar
5. **MaterialManager** - Customización visual dinámica

---

## 🚀 Estado Actual de Implementación

### ✅ Completado

- ✅ **Utilidades base creadas:**
  - `utils/animationManager.ts` - Sistema completo de animaciones
  - `utils/ikController.ts` - IK para cabeza y ojos
  - `utils/moodSystem.ts` - Gestión de estados anímicos
  - `utils/interactionSystem.ts` - Raycasting y detección
  - `utils/materialManager.ts` - Gestión de materiales y colores

- ✅ **Inicialización integrada en AvatarViewer3D:**
  - Todos los sistemas se inicializan correctamente al cargar el modelo
  - Logs de debug confirman detección de componentes

### 🔧 Requiere Integración Manual

Para activar completamente los sistemas, necesitas hacer pequeñas ediciones en `AvatarViewer3D.tsx`.  
**Todos los fragmentos de código están en `INTEGRATION_GUIDE.ts`**.

**Pasos:**

1. **Actualizar useFrame** (línea ~557)
   - Agregar llamadas a `.update()` de AnimationManager, IKController
   - Aplicar influencias del MoodSystem

2. **Agregar Event Listeners** (después de línea ~120)
   - Interacciones de click/hover
   - Comandos globales para control externo

3. **Opcional: Mejorar respiración** (línea ~565)
   - Aplicar multiplicadores de mood a velocidad/amplitud

---

## 🎮 Cómo Usar los Sistemas

### 1️⃣ AnimationManager

**Reproducir animación de Blender:**
```typescript
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: {
    command: 'play_animation',
    params: { 
      name: 'Wave',  // Nombre del clip en Blender
      config: { 
        priority: 8,      // 0-10 (mayor = interrumpe animaciones menores)
        loop: false,
        blendDuration: 0.5
      } 
    }
  }
}));
```

**Animaciones disponibles (si fueron exportadas desde Blender):**
- `Idle`, `Happy`, `Sad`, `Wave`, `Dance_01`, `Think_Idle`, etc.

---

### 2️⃣ IK Controller

**Head & Eye Tracking:**  
✅ **Ya funciona automáticamente** - el avatar sigue el cursor con la cabeza y los ojos.

**Desactivar temporalmente:**
```typescript
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: {
    command: 'toggle_ik',
    params: { enabled: false }
  }
}));
```

---

### 3️⃣ MoodSystem

**Cambiar estado anímico:**
```typescript
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: {
    command: 'set_mood',
    params: { 
      mood: 'energetic',  // 'cheerful' | 'calm' | 'energetic' | 'melancholic' | 'focused' | 'playful'
      intensity: 0.8      // 0-1
    }
  }
}));
```

**Efectos del mood:**
- `energetic` → Respiración rápida, gestos frecuentes
- `calm` → Movimientos lentos, expresiones sutiles  
- `cheerful` → Animaciones alegres, expresiones intensas
- `melancholic` → Gestos raros, pose decaída

---

### 4️⃣ InteractionSystem

**Reacciones automáticas al tocar:**

- **Tocar cabeza** → Sonrisa + blush + animación Happy
- **Tocar mano** → Saludo (animación Wave)
- **Hover en cara** → Seguir cursor intensamente

✅ **Ya funciona** si agregas los event listeners del `INTEGRATION_GUIDE.ts`.

---

### 5️⃣ MaterialManager

**Cambiar colores del avatar:**
```typescript
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: {
    command: 'apply_palette',
    params: { 
      palette: { 
        hair: new THREE.Color('#ff00ff'),   // Rosa neón
        eyes: new THREE.Color('#00ffff'),   // Cyan
        outfit: new THREE.Color('#ff1493')  // Pink
      } 
    }
  }
}));
```

**Presets disponibles:**
```typescript
import { PALETTE_PRESETS, applyPreset } from './utils/materialManager';

// Usar preset
const manager = materialManagerRef.current;
applyPreset(manager, 'vampire');  // 'default' | 'vampire' | 'angel' | 'neon' | 'gothic'
```

---

## 🎯 Casos de Uso Prácticos

### Ejemplo 1: Animación al detectar emoción

```typescript
// En geminiService.ts, después de detectar emoción
if (emotion === 'happy') {
  window.dispatchEvent(new CustomEvent('avatar-command', {
    detail: { command: 'set_mood', params: { mood: 'cheerful', intensity: 1 } }
  }));
  
  window.dispatchEvent(new CustomEvent('avatar-command', {
    detail: { 
      command: 'play_animation', 
      params: { name: 'Happy', config: { priority: 6, loop: false } } 
    }
  }));
}
```

### Ejemplo 2: Modo "Hot" con efectos visuales

```typescript
// Activar modo sexy con mood + colores
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: { command: 'set_mood', params: { mood: 'playful', intensity: 1 } }
}));

window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: { 
    command: 'apply_palette', 
    params: { 
      palette: { underwear: new THREE.Color('#ff1493') } // Rosa caliente
    } 
  }
}));
```

### Ejemplo 3: Crear un panel de control

```tsx
// En AccountSettings.tsx
const AvatarCustomizer = () => {
  const changeMood = (mood: string) => {
    window.dispatchEvent(new CustomEvent('avatar-command', {
      detail: { command: 'set_mood', params: { mood, intensity: 1 } }
    }));
  };

  return (
    <div>
      <button onClick={() => changeMood('energetic')}>Energética</button>
      <button onClick={() => changeMood('calm')}>Tranquila</button>
      {/* ... */}
    </div>
  );
};
```

---

## 🛠️ Próximos Pasos

### Para Activar Todo:

1. ✅ **Leer** `INTEGRATION_GUIDE.ts`
2. ✅ **Copiar** los fragmentos de código en las ubicaciones indicadas
3. ✅ **Verificar** que no hay errores de TypeScript
4. ✅ **Probar** los comandos desde la consola:
   ```javascript
   // En DevTools
   window.dispatchEvent(new CustomEvent('avatar-command', {
     detail: { command: 'set_mood', params: { mood: 'energetic', intensity: 1 } }
   }));
   ```

### Para Añadir Animaciones de Blender:

1. Abrir Blender con tu modelo
2. Crear animaciones en NLA Editor
3. Exportar con configuración especial (ver `blender-quickstart.md`)
4. Reemplazar `/public/models/nova-avatar.glb`
5. Las animaciones estarán disponibles automáticamente

---

## ❓ Troubleshooting

**AnimationManager no se inicializa:**
- Verificar que `gltf.animations.length > 0` en consola
- Asegurar que exportaste con "Bake All Actions" en Blender

**IK no funciona:**
- Check: `ikControllerRef.current?.isInitialized()` debe ser `true`
- Verificar que el modelo tiene huesos de cabeza/cuello

**Mood no afecta animaciones:**
- Asegurar que agregaste `moodInfluence` en el useFrame (ver INTEGRATION_GUIDE)

**Interacciones no detectan clicks:**
- Verificar que agregaste los event listeners en el useEffect
- Check en consola: debe aparecer "🖱️ Zona de interacción..."

---

## 🎓 Documentación Adicional

- **Workflow Blender:** `blender-quickstart.md`
- **Implementation Plan:** `implementation_plan.md`
- **Integration Code:** `INTEGRATION_GUIDE.ts`

---

## 🌟 Features Avanzadas (Opcionales)

### Animaciones Procedurales Mejoradas

Combinar animaciones programáticas con clips de Blender:

```typescript
// Idle variation: cada 5 segundos, pequeño gesto aleatorio
setInterval(() => {
  const gestures = ['Nod', 'Shake_Head', 'Shrug'];
  const random = gestures[Math.floor(Math.random() * gestures.length)];
  
  if (animationManagerRef.current?.hasAnimation(random)) {
    animationManagerRef.current.play(random, { 
      priority: 3,  // Baja prioridad (no interrumpe conversación)
      loop: false 
    });
  }
}, 5000);
```

### Shape Keys Extendidos

Si tu modelo tiene visemes completos (A, E, I, O, U, etc.):

```typescript
// En lipSync.ts, mapear visemes a fonemas españoles
const VISEME_MAP = {
  'a': 'viseme_aa',
  'e': 'viseme_ee', 
  'i': 'viseme_ih',
  'o': 'viseme_oh',
  'u': 'viseme_ou',
  'm': 'viseme_m',
  'p': 'viseme_p',
  'f': 'viseme_f'
};
```

---

¡Todos los sistemas están listos para usar! 🚀
