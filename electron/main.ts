import { app, BrowserWindow, globalShortcut, Tray, Menu, nativeImage, desktopCapturer, screen, ipcMain, shell, Notification } from 'electron';
import path from 'path';
import { fileURLToPath } from 'url';
import { exec } from 'child_process';
import fs from 'fs';

// ============================================================
// HELPER: Verifica si un proceso está corriendo (Windows)
// Devuelve true si se encuentra el proceso en tasklist
// ============================================================
function checkIfProcessRunning(processName: string): Promise<boolean> {
    return new Promise((resolve) => {
        // tasklist /FI filtra por nombre de imagen, /NH sin cabecera, /FO CSV formato
        exec(`tasklist /FI "IMAGENAME eq ${processName}*" /NH /FO CSV`, (error, stdout) => {
            if (error) {
                resolve(false);
                return;
            }
            // Si el output contiene el nombre del proceso, está corriendo
            const isRunning = stdout.toLowerCase().includes(processName.toLowerCase());
            resolve(isRunning);
        });
    });
}

// Mapeo de nombre amigable → nombre de proceso en Windows
const PROCESS_NAMES: Record<string, string> = {
    'chrome': 'chrome.exe',
    'firefox': 'firefox.exe',
    'edge': 'msedge.exe',
    'msedge': 'msedge.exe',
    'brave': 'brave.exe',
    'discord': 'discord.exe',
    'spotify': 'spotify.exe',
    'steam': 'steam.exe',
    'code': 'code.exe',
    'vscode': 'code.exe',
    'notepad': 'notepad.exe',
    'calc': 'calculator.exe',
    'wt': 'wt.exe',
    'cmd': 'cmd.exe',
    'powershell': 'powershell.exe',
    'explorer': 'explorer.exe',
    'zoom': 'zoom.exe',
    'slack': 'slack.exe',
    'teams': 'teams.exe',
};

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
    startMode: 'normal'
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
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'nova-icon.png');
    const hasIcon = fs.existsSync(iconPath);

    win = new BrowserWindow({
        title: 'Nova IA',
        width: 1400,
        height: 900,
        minWidth: 1000,
        minHeight: 700,
        ...(hasIcon ? { icon: iconPath } : {}),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            nodeIntegration: false,
            contextIsolation: true,
        },
        frame: false, // Sin barra de título nativa
        transparent: false, // Fondo opaco
        backgroundColor: '#08080c',
        show: true, // Mostrar de inmediato
    });

    win.center();
    win.show();
    win.focus();
    win.setAlwaysOnTop(true);
    win.setAlwaysOnTop(false);

    // Mostrar ventana cuando esté lista
    win.once('ready-to-show', () => {
        win?.show();
        win?.focus();
        win?.setAlwaysOnTop(true);
        win?.setAlwaysOnTop(false);
    });

    // Cargar la app
    const targetUrl = VITE_DEV_SERVER_URL || 'http://localhost:3001';
    if (VITE_DEV_SERVER_URL || !app.isPackaged) {
        let isLoaded = false;
        const loadDevUrl = () => {
            if (isLoaded || !win) return;
            win.loadURL(targetUrl).catch(() => {
                setTimeout(loadDevUrl, 500);
            });
        };

        win.webContents.on('did-finish-load', () => {
            isLoaded = true;
            win?.show();
            win?.focus();
        });

        win.webContents.on('did-fail-load', (_event, errorCode) => {
            if (!isLoaded && (errorCode === -102 || errorCode === -105 || errorCode === -100)) {
                setTimeout(loadDevUrl, 500);
            }
        });

        loadDevUrl();
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
            if (tray && typeof tray.displayBalloon === 'function' && hasIcon) {
                try {
                    tray.displayBalloon({
                        title: 'Nova IA',
                        content: 'Nova está ejecutándose en segundo plano. Usa Alt+N para mostrarla.',
                        icon: iconPath
                    });
                } catch (_) {}
            }
        }
    });
}

function createTray() {
    const iconPath = path.join(process.env.VITE_PUBLIC || '', 'nova-icon.png');
    const icon = fs.existsSync(iconPath)
        ? nativeImage.createFromPath(iconPath)
        : nativeImage.createFromBuffer(Buffer.from([
            0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
            0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x10, 0x00, 0x00, 0x00, 0x10,
            0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0xf3, 0xff, 0x61, 0x00, 0x00, 0x00,
            0x19, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x60, 0x60, 0x60, 0xf8,
            0xcf, 0xc0, 0x80, 0xe1, 0xc4, 0x8c, 0x1c, 0x00, 0x24, 0x5d, 0x01, 0x10,
            0x00, 0x00, 0xff, 0xff, 0x03, 0x00, 0x00, 0x01, 0x00, 0x01, 0x7e, 0x40,
            0x4c, 0x4a, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42,
            0x60, 0x82
        ]));
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

    // Abrir aplicación — con detección de proceso ya corriendo
    // Abrir aplicación — con apertura forzada de ventana/pestaña
    ipcMain.handle('system:open-app', async (_event: any, appName: string) => {
        try {
            const normalizedName = appName.toLowerCase().trim();

            // 1. Resolver el comando/URI de la app
            let command = APP_COMMANDS[normalizedName];

            // 2. Si hay comando o alias conocido, abrir directamente (crea ventana/pestaña nueva)
            if (command) {
                console.log('🚀 Abriendo app (Alias):', normalizedName, '→', command);
                if (command.includes('://')) {
                    await shell.openExternal(command);
                } else {
                    exec(`start "" "${command}"`);
                }
                return { success: true, alreadyOpen: false, appName };
            }

            // 3. Detección de proceso + Búsqueda inteligente via PowerShell (Start Menu)
            console.log('🔍 Buscando app en sistema:', appName);
            const psCommand = `Get-StartApps | Where-Object { $_.Name -like "*${appName}*" } | Select-Object -First 1`;

            return new Promise((resolve) => {
                exec(`powershell -Command "${psCommand} | ConvertTo-Json"`, (error, stdout) => {
                    if (!error && stdout.trim()) {
                        try {
                            const appInfo = JSON.parse(stdout);
                            const appId = appInfo.AppID;
                            console.log('🚀 App encontrada:', appInfo.Name, 'ID:', appId);
                            exec(`explorer "shell:AppsFolder\\${appId}"`, (err) => {
                                if (err) console.error('Error lanzando AppID:', err);
                            });
                            resolve({ success: true, alreadyOpen: false, appName: appInfo.Name });
                        } catch (e) {
                            exec(`start "" "${appName}"`, (err) => {
                                if (err) resolve({ success: false, notFound: true, appName });
                                else resolve({ success: true, alreadyOpen: false, appName });
                            });
                        }
                    } else {
                        console.log('⚠️ No encontrada en Start Apps, intentando ejecución directa:', appName);
                        exec(`start "" "${appName}"`, (err) => {
                            if (err) {
                                console.error('Error final:', err);
                                resolve({ success: false, notFound: true, appName });
                            } else {
                                resolve({ success: true, alreadyOpen: false, appName });
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

    // Obtener lista de procesos corriendo (para self-awareness de Nova)
    ipcMain.handle('system:get-running-apps', async () => {
        return new Promise((resolve) => {
            exec('tasklist /NH /FO CSV', (error, stdout) => {
                if (error) {
                    resolve([]);
                    return;
                }
                // Parsear CSV: "nombre.exe",PID,"session",num,"memoria"
                const apps = stdout
                    .split('\n')
                    .filter(line => line.trim())
                    .map(line => {
                        const parts = line.split(',');
                        return parts[0]?.replace(/"/g, '').replace('.exe', '').toLowerCase();
                    })
                    .filter(Boolean);
                // Deduplicar y retornar lista limpia
                resolve([...new Set(apps)]);
            });
        });
    });

    // Abrir URL con codificación segura (espacios, acentos) y fallback a Windows start
    // Abrir URL con codificación segura de espacios/acentos y ejecución infalible en Windows
    ipcMain.handle('system:open-url', async (_event: any, rawUrl: string) => {
        try {
            let formattedUrl = /^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${rawUrl}`;
            try {
                // Encode URI y reemplazar espacios no codificados por %20
                formattedUrl = encodeURI(formattedUrl).replace(/ /g, '%20');
            } catch (encErr) {
                formattedUrl = formattedUrl.replace(/ /g, '%20');
            }

            console.log('🌐 [Electron Main] Abriendo URL:', formattedUrl);
            
            // Intentar shell.openExternal
            try {
                await shell.openExternal(formattedUrl);
            } catch (shellErr) {
                console.warn('⚠️ shell.openExternal falló:', shellErr);
            }

            // Ejecutar cmd start en Windows para garantizar apertura física en el navegador predeterminado
            if (process.platform === 'win32') {
                exec(`cmd /c start "" "${formattedUrl}"`, (err) => {
                    if (err) console.error('❌ Error en cmd start fallback:', err);
                });
            }

            return { success: true };
        } catch (e) {
            console.error('❌ Error abriendo URL:', e);
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

    // LISTAR MODELOS DISPONIBLES
    ipcMain.handle('get-available-models', async () => {
        try {
            const modelsPath = path.join(process.env.VITE_PUBLIC!, 'models');
            if (!fs.existsSync(modelsPath)) return [];
            
            const files = fs.readdirSync(modelsPath);
            return files
                .filter(file => file.toLowerCase().endsWith('.glb') || file.toLowerCase().endsWith('.vrm'))
                .map(file => ({
                    name: file.replace(/\.(glb|vrm)$/i, '').replace(/[-_]/g, ' '),
                    url: `/models/${file}`,
                    file: file
                }));
        } catch (e) {
            console.error('Error listando modelos:', e);
            return [];
        }
    });

    // Buscar archivos o abrir ruta (con validación previa)
    ipcMain.handle('system:search-files', async (_event: any, query: string) => {
        try {
            if (process.platform === 'win32') {
                // Si el query parece una ruta de archivo/carpeta, validar que exista
                const looksLikePath = query.includes('\\') || query.includes('/') || /^[A-Za-z]:\//.test(query);
                if (looksLikePath) {
                    if (!fs.existsSync(query)) {
                        console.warn('⚠️ [Nova] Ruta no encontrada:', query);
                        return { success: false, notFound: true, query };
                    }
                    // Ruta existe: abrir directamente con explorer
                    exec(`explorer "${query}"`);
                    console.log('📂 Abriendo ruta:', query);
                    return { success: true };
                }
                // Query de texto: abrir búsqueda de Windows Explorer
                const encoded = encodeURIComponent(query);
                exec(`explorer "search-ms:query=${encoded}&crumb=location:C%3A%5C"`, (error: any) => {
                    if (error) console.error('Error buscando archivos:', error);
                });
            }
            console.log('🔍 Buscando archivos:', query);
            return { success: true };
        } catch (e) {
            console.error('Error buscando archivos:', e);
            return { success: false, error: String(e) };
        }
    });

    // KEYBOARD AND MOUSE AUTOMATION (WINDOWS NATIVE)

    // Clic de mouse (izquierdo, derecho, doble) y movimiento opcional
    ipcMain.handle('system:mouse-click', async (_event: any, options: { x?: number; y?: number; button?: 'left' | 'right' | 'middle'; double?: boolean }) => {
        try {
            const { x, y, button = 'left', double = false } = options || {};
            const isRight = button === 'right';
            const isMiddle = button === 'middle';

            const downFlag = isRight ? 0x0008 : isMiddle ? 0x0020 : 0x0002;
            const upFlag = isRight ? 0x0010 : isMiddle ? 0x0040 : 0x0004;

            let psCmd = `if (-not ([System.Management.Automation.PSTypeName]'WinMouse').Type) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinMouse { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); [DllImport("user32.dll")] public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo); }'; } `;
            
            if (typeof x === 'number' && typeof y === 'number') {
                psCmd += `[WinMouse]::SetCursorPos(${Math.round(x)}, ${Math.round(y)}); Start-Sleep -Milliseconds 50; `;
            }

            psCmd += `[WinMouse]::mouse_event(${downFlag}, 0, 0, 0, 0); [WinMouse]::mouse_event(${upFlag}, 0, 0, 0, 0);`;

            if (double) {
                psCmd += ` Start-Sleep -Milliseconds 100; [WinMouse]::mouse_event(${downFlag}, 0, 0, 0, 0); [WinMouse]::mouse_event(${upFlag}, 0, 0, 0, 0);`;
            }

            exec(`powershell -NoProfile -Command "${psCmd}"`);
            console.log('🖱️ Mouse click:', button, { x, y, double });
            return { success: true };
        } catch (e) {
            console.error('Error en mouse-click:', e);
            return { success: false, error: String(e) };
        }
    });

    // Mover mouse
    ipcMain.handle('system:mouse-move', async (_event: any, options: { x: number; y: number }) => {
        try {
            const { x, y } = options;
            const psCmd = `if (-not ([System.Management.Automation.PSTypeName]'WinMouseMove').Type) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinMouseMove { [DllImport("user32.dll")] public static extern bool SetCursorPos(int x, int y); }'; } [WinMouseMove]::SetCursorPos(${Math.round(x)}, ${Math.round(y)});`;
            exec(`powershell -NoProfile -Command "${psCmd}"`);
            console.log('🖱️ Mouse move:', x, y);
            return { success: true };
        } catch (e) {
            console.error('Error en mouse-move:', e);
            return { success: false, error: String(e) };
        }
    });

    // Escribir texto
    ipcMain.handle('system:type-text', async (_event: any, text: string) => {
        try {
            if (!text) return { success: false, error: 'Texto vacío' };
            const escaped = text.replace(/'/g, "''").replace(/[\+\^\%~\(\)\{\}\[\]]/g, '{$&}');
            const psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${escaped}')`;
            exec(`powershell -NoProfile -Command "${psCmd}"`);
            console.log('⌨️ Escribiendo texto:', text);
            return { success: true };
        } catch (e) {
            console.error('Error en type-text:', e);
            return { success: false, error: String(e) };
        }
    });

    // Presionar tecla o combinación
    ipcMain.handle('system:press-key', async (_event: any, keyString: string) => {
        try {
            const lower = keyString.toLowerCase().trim();

            if (lower === 'win+d' || lower === 'desktop') {
                exec(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).ToggleDesktop()"`);
                return { success: true };
            }

            const KEY_MAP: Record<string, string> = {
                'enter': '{ENTER}',
                'intro': '{ENTER}',
                'tab': '{TAB}',
                'esc': '{ESC}',
                'escape': '{ESC}',
                'backspace': '{BACKSPACE}',
                'delete': '{DELETE}',
                'up': '{UP}',
                'down': '{DOWN}',
                'left': '{LEFT}',
                'right': '{RIGHT}',
                'space': ' ',
                'ctrl+c': '^c',
                'ctrl+v': '^v',
                'ctrl+a': '^a',
                'ctrl+z': '^z',
                'ctrl+s': '^s',
                'alt+tab': '%{TAB}',
                'alt+f4': '%{F4}',
            };

            const sendKeysValue = KEY_MAP[lower] || (lower.length === 1 ? lower : `{${lower.toUpperCase()}}`);
            const psCmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${sendKeysValue}')`;
            exec(`powershell -NoProfile -Command "${psCmd}"`);
            console.log('⌨️ Tecla presionada:', keyString, '→', sendKeysValue);
            return { success: true };
        } catch (e) {
            console.error('Error en press-key:', e);
            return { success: false, error: String(e) };
        }
    });

    // Control de ventanas del sistema (Minimizar, Maximizar, Restaurar)
    ipcMain.handle('system:window-control', async (_event: any, options: { action: 'minimize' | 'maximize' | 'restore' | 'minimize_all'; target?: string }) => {
        try {
            const { action, target } = options || {};

            if (action === 'minimize_all') {
                exec(`powershell -NoProfile -Command "(New-Object -ComObject Shell.Application).MinimizeAll()"`);
                console.log('🪟 Ventanas: Minimizar todo');
                return { success: true };
            }

            const showCmdMap: Record<string, number> = {
                'minimize': 6, // SW_MINIMIZE
                'maximize': 3, // SW_MAXIMIZE
                'restore': 9   // SW_RESTORE
            };
            const cmdCode = showCmdMap[action] || 3;

            let psCmd = `if (-not ([System.Management.Automation.PSTypeName]'WinControl').Type) { Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public class WinControl { [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow); [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd); [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow(); }'; } `;

            if (target && target.trim() && target.toLowerCase() !== 'current' && target.toLowerCase() !== 'active') {
                const cleanTarget = target.trim().replace(/['"]/g, '');
                psCmd += `Get-Process | Where-Object { ($_.MainWindowTitle -like '*${cleanTarget}*' -or $_.ProcessName -like '*${cleanTarget}*') -and $_.MainWindowHandle -ne [IntPtr]::Zero } | ForEach-Object { [WinControl]::ShowWindow($_.MainWindowHandle, ${cmdCode}); [WinControl]::SetForegroundWindow($_.MainWindowHandle) }`;
            } else {
                psCmd += `$hwnd = [WinControl]::GetForegroundWindow(); if ($hwnd -ne [IntPtr]::Zero) { [WinControl]::ShowWindow($hwnd, ${cmdCode}) }`;
            }

            exec(`powershell -NoProfile -Command "${psCmd}"`);
            console.log('🪟 Control de Ventana:', action, target || 'activa');
            return { success: true };
        } catch (e) {
            console.error('Error en window-control:', e);
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
