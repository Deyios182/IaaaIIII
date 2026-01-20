import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, desktopCapturer, screen, ipcMain, shell, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import fs from 'fs';

// ES Module compatible __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// The built directory structure
//
// ├─┬ dist-electron
// │ ├── main.js
// │ └── preload.js
// ├─┬ dist
// │ └── index.html
// └── ...

process.env.DIST = path.join(__dirname, '../dist');
process.env.VITE_PUBLIC = app.isPackaged
    ? process.env.DIST
    : path.join(process.env.DIST, '../public');

let win: BrowserWindow | null = null;
let tray: Tray | null = null;
let isQuitting = false; // Flag para controlar cierre

// CONFIGURACIÓN DE AUTO-INICIO
interface AppSettings {
    autoStart: boolean;
    startMode: 'tray' | 'mini' | 'normal';
}

const DEFAULT_SETTINGS: AppSettings = {
    autoStart: false,
    startMode: 'tray'
};

let appSettings: AppSettings = { ...DEFAULT_SETTINGS };

// Cargar configuración al inicio
function loadSettings(): AppSettings {
    try {
        const configPath = path.join(app.getPath('userData'), 'settings.json');
        if (fs.existsSync(configPath)) {
            const data = fs.readFileSync(configPath, 'utf8');
            return { ...DEFAULT_SETTINGS, ...JSON.parse(data) };
        }
    } catch (error) {
        console.error('Error cargando configuración:', error);
    }
    return { ...DEFAULT_SETTINGS };
}

// Guardar configuración
function saveSettings(settings: AppSettings) {
    try {
        const configPath = path.join(app.getPath('userData'), 'settings.json');
        fs.writeFileSync(configPath, JSON.stringify(settings, null, 2));
        appSettings = settings;

        // Actualizar auto-inicio de Windows
        app.setLoginItemSettings({
            openAtLogin: settings.autoStart,
            openAsHidden: settings.autoStart && settings.startMode === 'tray',
            path: process.execPath,
            args: settings.autoStart ? ['--auto-start'] : []
        });

        console.log('⚙️ Configuración guardada:', settings);
    } catch (error) {
        console.error('Error guardando configuración:', error);
    }
}

// Vite dev server URL
const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL'];

function createWindow() {
    win = new BrowserWindow({
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        icon: path.join(process.env.VITE_PUBLIC!, 'nova-icon.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        frame: false, // Sin barra de título nativa
        transparent: false, // Fondo opaco
        backgroundColor: '#08080c',
        show: false, // No mostrar hasta que esté listo
    });

    // Mostrar ventana cuando esté lista
    win.once('ready-to-show', () => {
        win?.show();
    });

    // Cargar la app
    if (VITE_DEV_SERVER_URL) {
        win.loadURL(VITE_DEV_SERVER_URL);
        win.webContents.openDevTools(); // Abrir DevTools en desarrollo
    } else {
        win.loadFile(path.join(process.env.DIST!, 'index.html'));
    }

    // Minimizar a tray en lugar de cerrar
    win.on('close', (event) => {
        if (!isQuitting) {
            event.preventDefault();
            win?.hide();
            // Notificar al usuario que está en tray
            if (tray) {
                tray.displayBalloon({
                    title: 'Nova IA',
                    content: 'Nova está ejecutándose en segundo plano. Usa Alt+N para mostrarla.',
                    icon: path.join(process.env.VITE_PUBLIC!, 'nova-icon.png')
                });
            }
        }
    });
}

function createTray() {
    // Crear icono para tray (usa un icono genérico por ahora)
    const icon = nativeImage.createEmpty();
    tray = new Tray(icon);

    const contextMenu = Menu.buildFromTemplate([
        {
            label: 'Mostrar Nova',
            click: () => win?.show()
        },
        { type: 'separator' },
        {
            label: 'Salir',
            click: () => {
                isQuitting = true;
                app.quit();
            }
        }
    ]);

    tray.setToolTip('Nova IA');
    tray.setContextMenu(contextMenu);

    tray.on('double-click', () => {
        win?.show();
    });
}

function registerGlobalShortcuts() {
    // Alt+N para mostrar/ocultar Nova
    globalShortcut.register('Alt+N', () => {
        if (win?.isVisible()) {
            win.hide();
        } else {
            win?.show();
            win?.focus();
        }
    });

    // Ctrl+Shift+N para Toggle "Always on Top"
    globalShortcut.register('Ctrl+Shift+N', () => {
        const isOnTop = win?.isAlwaysOnTop();
        win?.setAlwaysOnTop(!isOnTop);
        console.log('Always on Top:', !isOnTop);
    });

    // Alt+M para Toggle "Mini Mode"
    globalShortcut.register('Alt+M', () => {
        toggleMiniMode();
    });
}

// Estado del modo mini
let isMiniMode = false;
let savedBounds = { width: 1400, height: 900, x: 0, y: 0 };

function toggleMiniMode() {
    if (!win) return;

    if (isMiniMode) {
        // Restaurar tamaño normal
        win.setAlwaysOnTop(false);
        win.setResizable(true);
        win.setMinimumSize(1000, 700);
        win.setSize(savedBounds.width, savedBounds.height);
        win.setPosition(savedBounds.x, savedBounds.y);
        win.show();
        win.focus();
        win.webContents.send('mini-mode-changed', false);
        console.log('📺 Modo Normal');
    } else {
        // Guardar posición actual
        const bounds = win.getBounds();
        savedBounds = { width: bounds.width, height: bounds.height, x: bounds.x, y: bounds.y };

        // Primero cambiar tamaño mínimo
        win.setMinimumSize(200, 250);

        // Luego el tamaño
        win.setSize(350, 450);

        // Posicionar en esquina inferior derecha
        const primaryDisplay = screen.getPrimaryDisplay();
        const { width, height } = primaryDisplay.workAreaSize;

        // Calcular posición
        const x = width - 370;
        const y = height - 470;

        win.setPosition(x > 0 ? x : 100, y > 0 ? y : 100);
        win.setAlwaysOnTop(true, 'screen-saver'); // Nivel más alto de always on top
        win.setResizable(true);
        win.setSkipTaskbar(true); // Ocultar de la barra de tareas
        win.show();
        win.focus();

        win.webContents.send('mini-mode-changed', true);
        console.log('🐾 Modo Mini (Desktop Pet) - Posición:', x, y);
    }

    isMiniMode = !isMiniMode;
}


// Cuando Electron esté listo
app.whenReady().then(() => {
    // Cargar configuración
    appSettings = loadSettings();
    console.log('⚙️ Configuración cargada:', appSettings);

    // Detectar si se inició automáticamente
    const isAutoStart = process.argv.includes('--auto-start');
    console.log('🚀 Auto-inicio:', isAutoStart, '| Modo:', appSettings.startMode);

    createWindow();
    createTray();
    registerGlobalShortcuts();

    // Aplicar modo de inicio si es auto-start
    if (isAutoStart && win) {
        switch (appSettings.startMode) {
            case 'tray':
                win.hide();
                console.log('📁 Iniciado en modo TRAY (oculto)');
                break;
            case 'mini':
                // Esperar a que la ventana esté lista antes de aplicar modo mini
                win.once('ready-to-show', () => {
                    setTimeout(() => toggleMiniMode(), 500);
                });
                console.log('🐾 Iniciando en modo MINI');
                break;
            case 'normal':
                // Mostrar ventana normalmente
                console.log('🖥️ Iniciado en modo NORMAL');
                break;
        }
    }

    // IPC Handlers (ipcMain is imported at top)

    ipcMain.handle('toggle-mini-mode', () => {
        toggleMiniMode();
        return isMiniMode;
    });

    ipcMain.handle('is-mini-mode', () => {
        return isMiniMode;
    });

    // Handler para obtener fuentes de pantalla
    ipcMain.handle('get-screen-sources', async () => {
        const sources = await desktopCapturer.getSources({
            types: ['window', 'screen'],
            fetchWindowIcons: true
        });
        return sources.map(source => ({
            id: source.id,
            name: source.name,
            thumbnail: source.thumbnail.toDataURL(),
        }));
    });

    // Handlers para controles de ventana (frameless)
    ipcMain.on('window:minimize', () => win?.minimize());
    ipcMain.on('window:maximize', () => {
        if (win?.isMaximized()) {
            win.unmaximize();
        } else {
            win?.maximize();
        }
    });
    ipcMain.on('window:close', () => {
        if (!isMiniMode) {
            win?.hide(); // Minimizar a tray en lugar de cerrar
        }
    });
    ipcMain.handle('window:is-maximized', () => win?.isMaximized());

    // SYSTEM COMMANDS - Abrir apps, URLs, notificaciones

    // Mapeo de apps a comandos/URIs de Windows
    const APP_COMMANDS: Record<string, string> = {
        'discord': 'discord://',
        'spotify': 'spotify://',
        'steam': 'steam://',
        'chrome': 'chrome',
        'firefox': 'firefox',
        'edge': 'msedge',
        'code': 'code',
        'vscode': 'code',
        'notepad': 'notepad',
        'calculadora': 'calc',
        'calc': 'calc',
        'explorer': 'explorer',
        'explorador': 'explorer',
        'terminal': 'wt',
        'cmd': 'cmd',
        'powershell': 'powershell',
        // Gaming
        'minecraft': 'minecraft://',
        'lol': 'leagueoflegends://',
        'league': 'leagueoflegends://',
        'leagueoflegends': 'leagueoflegends://',
        'valorant': 'valorant://',
        'epic': 'com.epicgames.launcher://',
        'epicgames': 'com.epicgames.launcher://',
    };

    // Abrir aplicación
    ipcMain.handle('system:open-app', async (_event: any, appName: string) => {
        try {
            const normalizedName = appName.toLowerCase().trim();

            // 1. Intentar alias directos
            let command = APP_COMMANDS[normalizedName];

            if (command) {
                console.log('🚀 Abriendo app (Alias):', normalizedName, '→', command);
                if (command.includes('://')) {
                    await shell.openExternal(command);
                } else {
                    exec(`start "" "${command}"`);
                }
                return { success: true };
            }

            // 2. Intentar ejecución directa (por si está en PATH)
            // Esto cubre "notepad", "calc", etc. si no estuvieran en el mapa
            // Pero "start name" a veces falla si no es exacto.

            // 3. Búsqueda inteligente via PowerShell (Start Menu)
            console.log('🔍 Buscando app en sistema:', appName);
            const psCommand = `Get-StartApps | Where-Object { $_.Name -like "*${appName}*" } | Select-Object -First 1`;

            return new Promise((resolve) => {
                exec(`powershell -Command "${psCommand} | ConvertTo-Json"`, (error, stdout) => {
                    if (!error && stdout.trim()) {
                        try {
                            const appInfo = JSON.parse(stdout);
                            const appId = appInfo.AppID;
                            console.log('🚀 App encontrada:', appInfo.Name, 'ID:', appId);

                            // Abrir usando shell:AppsFolder
                            exec(`explorer "shell:AppsFolder\\${appId}"`, (err) => {
                                if (err) console.error('Error lanzando AppID:', err);
                            });
                            resolve({ success: true, message: `Abriendo ${appInfo.Name}` });
                        } catch (e) {
                            // Fallback a intento directo
                            exec(`start "" "${appName}"`, (err) => {
                                if (err) resolve({ success: false, error: 'No encontrada' });
                                else resolve({ success: true });
                            });
                        }
                    } else {
                        // Fallback final: Intentar lanzar el comando directo
                        console.log('⚠️ No encontrada en Start Apps, intentando ejecución directa:', appName);
                        exec(`start "" "${appName}"`, (err) => {
                            if (err) {
                                console.error('Error final:', err);
                                resolve({ success: false, error: 'Aplicación no encontrada' });
                            } else {
                                resolve({ success: true });
                            }
                        });
                    }
                });
            });

        } catch (e) {
            console.error('Error crítico abriendo app:', e);
            return { success: false, error: String(e) };
        }
    });

    // Abrir URL
    ipcMain.handle('system:open-url', async (_event: any, url: string) => {
        try {
            await shell.openExternal(url);
            console.log('🌐 Abriendo URL:', url);
            return { success: true };
        } catch (e) {
            console.error('Error abriendo URL:', e);
            return { success: false, error: String(e) };
        }
    });

    // Mostrar notificación
    ipcMain.handle('system:notification', async (_event: any, title: string, body: string) => {
        try {
            const notification = new Notification({ title, body, icon: path.join(process.env.VITE_PUBLIC!, 'nova-icon.png') });
            notification.show();
            console.log('🔔 Notificación:', title);
            return { success: true };
        } catch (e) {
            console.error('Error mostrando notificación:', e);
            return { success: false, error: String(e) };
        }
    });

    // GESTIÓN DE CONFIGURACIÓN

    // Obtener configuración actual
    ipcMain.handle('settings:get', async () => {
        return appSettings;
    });

    // Guardar configuración
    ipcMain.handle('settings:save', async (_event: any, settings: AppSettings) => {
        try {
            saveSettings(settings);
            return { success: true, settings: appSettings };
        } catch (e) {
            console.error('Error guardando configuración:', e);
            return { success: false, error: String(e) };
        }
    });

    // Toggle auto-inicio
    ipcMain.handle('settings:toggle-autostart', async () => {
        appSettings.autoStart = !appSettings.autoStart;
        saveSettings(appSettings);
        return { enabled: appSettings.autoStart };
    });

    // Cambiar modo de inicio
    ipcMain.handle('settings:set-start-mode', async (_event: any, mode: 'tray' | 'mini' | 'normal') => {
        appSettings.startMode = mode;
        saveSettings(appSettings);
        return { mode: appSettings.startMode };
    });

    // Buscar archivos (abre explorador con búsqueda)
    ipcMain.handle('system:search-files', async (_event: any, query: string) => {
        try {
            if (process.platform === 'win32') {
                exec(`explorer "search-ms:query=${query}"`, (error: any) => {
                    if (error) console.error('Error buscando:', error);
                });
            }
            console.log('🔍 Buscando archivos:', query);
            return { success: true };
        } catch (e) {
            console.error('Error buscando archivos:', e);
            return { success: false, error: String(e) };
        }
    });

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

// Limpiar shortcuts al cerrar
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});

// Cerrar app cuando todas las ventanas estén cerradas (excepto en macOS)
app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
