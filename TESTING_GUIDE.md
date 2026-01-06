# 🎉 Testing Guide - Sistema de Animaciones 3D

## ⚡ Quick Test (Desde Consola del Navegador)

Abre las DevTools (F12) y prueba estos comandos:

### 1. Cambiar Mood
```javascript
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: { command: 'set_mood', params: { mood: 'energetic', intensity: 1 } }
}));
```

Deberías ver:
- Respiración más rápida
- Movimientos más enérgicos
- Log: "🌟 Mood cambiado: calm → energetic"

### 2. Probar Animación (si tienes clips de Blender)
```javascript
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: { 
    command: 'play_animation', 
    params: { name: 'Wave', config: { priority: 8, loop: false } } 
  }
}));
```

### 3. Cambiar Colores
```javascript
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
```

### 4. Verificar Sistemas Activos
```javascript
// En consola, verificar logs de inicialización:
// ✅ AnimationManager inicializado con N clips
// ✅ IK Controller: N/4 huesos encontrados
// 🎨 MaterialManager: N materiales detectados
```

---

## 🎯 Test IK (Automático)

**Mover el mouse sobre el avatar** - La cabeza y los ojos deben seguir el cursor suavemente.

---

## 🖱️ Test de Interacciones (Requiere configuración adicional)

Para activar raycasting, necesitas agregar el InteractionSystem al Canvas.
Ver `INTEGRATION_GUIDE.ts` sección 3 para código completo.

---

## 📊 Verificar en Consola

Deberías ver estos logs al cargar:
```
🎬 AnimationManager: N clips cargados
👤 IK: Head bone encontrado: DEF-head
👁️ IK: Left eye bone encontrado
👁️ IK: Right eye bone encontrado  
✅ IK Controller: 4/4 huesos encontrados
🎨 MaterialManager: N materiales detectados
```

---

## 🎨 Presets de Colores

```javascript
// Vampire
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: { 
    command: 'apply_palette', 
    params: { palette: { 
      hair: new THREE.Color('#1a0a0a'),
      eyes: new THREE.Color('#ff0000'),
      skin: new THREE.Color('#e8d5d5')
    }}
  }
}));

// Neon
window.dispatchEvent(new CustomEvent('avatar-command', {
  detail: { 
    command: 'apply_palette', 
    params: { palette: { 
      hair: new THREE.Color('#ff00ff'),
      eyes: new THREE.Color('#00ffff'),
      outfit: new THREE.Color('#ff1493')
    }}
  }
}));
```

---

## ✅ Checklist de Funcionalidad

- [ ] IK tracking sigue el cursor
- [ ] Mood cambia velocidad de respiración
- [ ] AnimationManager acepta comandos
- [ ] MaterialManager cambia colores
- [ ] No hay errores en consola
- [ ] Performance es fluido (30+ FPS)

---

¡Listo para probar! 🚀
