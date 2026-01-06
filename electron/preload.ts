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

    // SYSTEM COMMANDS - Abrir apps, URLs, notificaciones
    openApp: (appName) => ipcRenderer.invoke('system:open-app', appName),
    openUrl: (url) => ipcRenderer.invoke('system:open-url', url),
    showNotification: (title, body) => ipcRenderer.invoke('system:notification', title, body),
    searchFiles: (query) => ipcRenderer.invoke('system:search-files', query),

    // Información de la plataforma
    platform: process.platform,

    // Versiones
    versions: {
        node: process.versions.node,
        chrome: process.versions.chrome,
        electron: process.versions.electron
    }
});

// Exponer detector de si estamos en Electron
contextBridge.exposeInMainWorld('isElectron', true);
