// Preload script - CommonJS format for Electron
const { contextBridge, ipcRenderer } = require('electron');

// Exponer APIs seguras al renderer process
contextBridge.exposeInMainWorld('electronAPI', {
    // Controlar ventana
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),

    // Obtener fuentes de captura de pantalla (via main process)
    getScreenSources: () => ipcRenderer.invoke('get-screen-sources'),

    // MINI MODE - Desktop Pet
    toggleMiniMode: () => ipcRenderer.invoke('toggle-mini-mode'),
    isMiniMode: () => ipcRenderer.invoke('is-mini-mode'),
    onMiniModeChange: (callback) => {
        ipcRenderer.on('mini-mode-changed', (_event, isMini) => callback(isMini));
    },

    // ⚡ GLOBAL HOTKEY - Iniciar / Toggle Llamada de Voz (Alt+Space o F8)
    onToggleCall: (callback) => {
        ipcRenderer.on('nova:toggle-call', () => callback());
    },

    // SYSTEM COMMANDS - Abrir apps, URLs, notificaciones
    openApp: (appName) => ipcRenderer.invoke('system:open-app', appName),
    openUrl: (url) => ipcRenderer.invoke('system:open-url', url),
    showNotification: (title, body) => ipcRenderer.invoke('system:notification', title, body),
    searchFiles: (query) => ipcRenderer.invoke('system:search-files', query),
    // 🆕 Detectar apps corriendo (para SelfAwareness de Nova)
    getRunningApps: () => ipcRenderer.invoke('system:get-running-apps'),

    // 🆕 AUTOMATIZACIÓN DE TECLADO Y MOUSE Y VENTANAS
    mouseClick: (options) => ipcRenderer.invoke('system:mouse-click', options),
    mouseMove: (x, y) => ipcRenderer.invoke('system:mouse-move', { x, y }),
    typeText: (text) => ipcRenderer.invoke('system:type-text', text),
    pressKey: (key) => ipcRenderer.invoke('system:press-key', key),
    controlWindow: (action, target) => ipcRenderer.invoke('system:window-control', { action, target }),

    // ⚡ TERMINAL Y MACROS DE DESARROLLO / TRABAJO
    runCommand: (command, options) => ipcRenderer.invoke('system:run-command', command, options),
    runMacro: (macroName, params) => ipcRenderer.invoke('system:run-macro', macroName, params),
    captureScreenFrame: () => ipcRenderer.invoke('system:capture-screen-frame'),

    // Información de la plataforma
    platform: process.platform,

    // Versiones
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron
    },
    
    // Modelos
    getAvailableModels: () => ipcRenderer.invoke('get-available-models')
});

// Exponer detector de si estamos en Electron
contextBridge.exposeInMainWorld('isElectron', true);
