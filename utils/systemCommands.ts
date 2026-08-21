/**
 * System Commands - Comandos del Sistema para Nova Desktop
 * Permite a Nova ejecutar acciones en el sistema operativo
 */

export interface SystemCommand {
    type: 'openApp' | 'openUrl' | 'searchFiles' | 'setReminder' | 'controlCamera' | 'manageClothing' | 'mouseClick' | 'mouseMove' | 'typeText' | 'pressKey' | 'windowControl' | 'runCommand' | 'runMacro' | 'captureScreen' | 'startCall' | 'endCall' | 'none';
    target?: string;
    message?: string;
    time?: number;
    x?: number;
    y?: number;
    button?: 'left' | 'right' | 'middle';
    double?: boolean;
    key?: string;
    windowAction?: 'minimize' | 'maximize' | 'restore' | 'minimize_all';
    command?: string;
    macro?: string;
}

// Detectar si el usuario está pidiendo una acción del sistema
export function detectSystemCommand(text: string): SystemCommand {
    const lowerText = text.toLowerCase().trim();

    // 0. Comandos de Llamada (Iniciar / Cerrar llamada por voz)
    const endCallRegex = /(?:termina|terminar|finaliza|finalizar|cierra|cerrar|corta|cortar|desactiva|desactivar|apaga|apagar|cuelga|colgar|det[eé]n|detener|para|parar|cancela|cancelar)\s+(?:la\s+)?(?:llamada|videollamada|video|conexi[oó]n)/i;
    const endCallPhrases = /(?:adi[oó]s|chao|hasta\s+luego|nos\s+vemos)\s+nova/i;
    const endCallDirect = /nova\s+(?:adi[oó]s|chao|cuelga|corta|para|detente|silencio|ap[aá]gate|descon[eé]ctate|descansa)/i;
    const endCallShort = /^(?:cuelga|corta|desconectar|terminar|apagar\s+llamada|cerrar\s+llamada|desactivar\s+llamada)$/i;

    if (endCallRegex.test(lowerText) || endCallPhrases.test(lowerText) || endCallDirect.test(lowerText) || endCallShort.test(lowerText)) {
        return { type: 'endCall' };
    }

    const startCallRegex = /(?:inicia|iniciar|comienza|comenzar|activa|activar|pon|abre|abrir|hacer|haz)\s+(?:la\s+)?(?:llamada|videollamada|video|conexi[oó]n)/i;
    const startCallPhrases = /(?:hey|hola|ok)\s+nova/i;
    const startCallDirect = /(?:nova\s+)?(?:despierta|con[eé]ctate|act[ií]vate)/i;

    if (startCallRegex.test(lowerText) || startCallPhrases.test(lowerText) || startCallDirect.test(lowerText)) {
        return { type: 'startCall' };
    }

    // 1. Detección de Búsquedas en YouTube y Google por voz
    const ytSearchMatch = text.match(/(?:busca|pon|reproduce|escuchar?|ver?)\s+(.+?)\s+en\s+youtube/i)
      || text.match(/(?:busca|pon|reproduce|escuchar?|ver?)\s+youtube\s+(?:para\s+)?(.+)/i);
    if (ytSearchMatch && ytSearchMatch[1]) {
        const query = ytSearchMatch[1].trim();
        return { type: 'openUrl', target: `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}` };
    }

    const googleSearchMatch = text.match(/(?:busca|buscar?)\s+(.+?)\s+en\s+(?:google|internet|web)/i)
      || text.match(/(?:busca|buscar?)\s+(?:en\s+)?google\s+(.+)/i);
    if (googleSearchMatch && googleSearchMatch[1]) {
        const query = googleSearchMatch[1].trim();
        return { type: 'openUrl', target: `https://www.google.com/search?q=${encodeURIComponent(query)}` };
    }

    // 2. Abrir URLs directas o dominios conocidos
    const urlPatterns = [
        { regex: /(?:abre?|ir a|visita)\s+(?:la\s+)?(?:página\s+)?(?:de\s+)?(\w+(?:\.\w+)+)/i, type: 'openUrl' as const },
        { regex: /(https?:\/\/[^\s]+)/i, type: 'openUrl' as const },
        { regex: /(?:abre?|ir a)\s+youtube/i, type: 'openUrl' as const, target: 'https://youtube.com' },
        { regex: /(?:abre?|ir a)\s+google/i, type: 'openUrl' as const, target: 'https://google.com' },
        { regex: /(?:abre?|ir a)\s+twitter/i, type: 'openUrl' as const, target: 'https://twitter.com' },
        { regex: /(?:abre?|ir a)\s+discord/i, type: 'openApp' as const, target: 'discord' },
    ];

    for (const pattern of urlPatterns) {
        if (pattern.target && pattern.regex.test(lowerText)) {
            return { type: pattern.type, target: pattern.target };
        }
        const match = text.match(pattern.regex);
        if (match) {
            let target = match[1];
            if (!target.startsWith('http')) {
                target = `https://${target}`;
            }
            return { type: 'openUrl', target };
        }
    }

    // Abrir aplicaciones
    const appPatterns = [
        { regex: /abre?\s+(?:el\s+)?(\w+)/i, type: 'openApp' as const },
        { regex: /abrir\s+(?:la\s+)?(\w+)/i, type: 'openApp' as const },
        { regex: /lanzar?\s+(\w+)/i, type: 'openApp' as const },
        { regex: /iniciar?\s+(\w+)/i, type: 'openApp' as const },
        { regex: /ejecutar?\s+(\w+)/i, type: 'openApp' as const },
    ];

    for (const pattern of appPatterns) {
        const match = text.match(pattern.regex);
        if (match) {
            return { type: 'openApp', target: match[1] };
        }
    }

    // Cámara
    const cameraPatterns = [
        // Face / Cara
        { regex: /(?:sube|muestra|pon|enfoca)\s+(?:la\s+)?(?:cara|rostro)|primer\s+plano|mírame\s+a\s+los\s+ojos/i, type: 'controlCamera', target: 'face' },
        { regex: /^la\s+cara$/i, type: 'controlCamera', target: 'face' }, // Frase exacta simple

        // Full Body / Cuerpo Completo
        { regex: /cuerpo\s+(?:entero|completo)|aléjate|vista\s+completa|full\s+body/i, type: 'controlCamera', target: 'full' },

        // Selfie
        { regex: /ponte\s+(?:en\s+)?selfie|tómate\s+una\s+foto|modo\s+selfie/i, type: 'controlCamera', target: 'selfie' },
        { regex: /^selfie$/i, type: 'controlCamera', target: 'selfie' },

        // Body / Torso
        { regex: /enfoca\s+(?:el\s+)?cuerpo|medio\s+cuerpo|torso/i, type: 'controlCamera', target: 'body' },

        // Default / Reset
        { regex: /vista\s+normal|restablece\s+cámara|posición\s+inicial|reset\s+c[áa]mara/i, type: 'controlCamera', target: 'default' },

        // Back / Espalda
        { regex: /espalda|atrás|trasero|posterior|giro\s+completo|date\s+(?:la\s+)?vuelta|voltéate/i, type: 'controlCamera', target: 'back' },
    ];

    for (const pattern of cameraPatterns) {
        if (pattern.regex.test(text)) {
            return { type: 'controlCamera', target: pattern.target } as any;
        }
    }

    // Ropa (Solo si es Bold Mode, pero detectamos el comando aquí)
    const clothingPatterns = [
        { regex: /quítate\s+(?:la\s+)?ropa|desnúdate|strip/i, type: 'manageClothing', target: 'strip_layer' },
        { regex: /vístete|ponte\s+(?:la\s+)?ropa/i, type: 'manageClothing', target: 'dress_full' },
        { regex: /quítate\s+(?:los\s+)?accesorios/i, type: 'manageClothing', target: 'strip_layer' },
    ];

    for (const pattern of clothingPatterns) {
        if (pattern.regex.test(text)) {
            return { type: 'manageClothing', target: pattern.target } as any;
        }
    }

    // Recordatorios
    const reminderPatterns = [
        /recuérdame\s+(.+?)\s+en\s+(\d+)\s+(minutos?|horas?)/i,
        /ponme?\s+(?:un\s+)?recordatorio\s+(.+?)\s+en\s+(\d+)\s+(minutos?|horas?)/i,
        /avísame\s+(.+?)\s+en\s+(\d+)\s+(minutos?|horas?)/i,
    ];

    for (const pattern of reminderPatterns) {
        const match = text.match(pattern);
        if (match) {
            const message = match[1];
            const amount = parseInt(match[2]);
            const unit = match[3].toLowerCase();

            let ms = amount * 60 * 1000; // minutos por defecto
            if (unit.startsWith('hora')) {
                ms = amount * 60 * 60 * 1000;
            }

            return {
                type: 'setReminder',
                message,
                time: Date.now() + ms
            };
        }
    }

    // Automatización de Teclado (Escribir texto)
    const typeMatch = text.match(/(?:escribe|tipea|ingresa|redacta)\s+(?:el\s+texto\s+)?(.+)/i);
    if (typeMatch) {
        const targetText = typeMatch[1].trim().replace(/^["']|["']$/g, '');
        if (targetText) {
            return { type: 'typeText', target: targetText };
        }
    }

    // Automatización de Teclado (Presionar tecla o atajo)
    const keyMatch = text.match(/(?:presiona|pulsa|presionar|pulsar|haz)\s+(?:la\s+tecla\s+)?(enter|tab|esc|escape|backspace|delete|espacio|space|ctrl\+[a-z]|alt\+tab|win\+d)/i);
    if (keyMatch) {
        return { type: 'pressKey', key: keyMatch[1] };
    }

    // Automatización de Mouse (Mover mouse)
    const moveMatch = text.match(/(?:mueve|mover)\s+(?:el\s+)?mouse(?:\s+(?:a|al|hacia))?\s*(\d+|centro|izquierda|derecha|arriba|abajo)?(?:\s*,\s*(\d+))?/i);
    if (moveMatch) {
        let x = 960;
        let y = 540;
        const arg1 = moveMatch[1]?.toLowerCase();
        const arg2 = moveMatch[2];

        if (arg1 && arg2 && !isNaN(Number(arg1)) && !isNaN(Number(arg2))) {
            x = parseInt(arg1);
            y = parseInt(arg2);
        } else if (arg1 === 'izquierda') {
            x = 480; y = 540;
        } else if (arg1 === 'derecha') {
            x = 1440; y = 540;
        } else if (arg1 === 'arriba') {
            x = 960; y = 270;
        } else if (arg1 === 'abajo') {
            x = 960; y = 810;
        }
        return { type: 'mouseMove', x, y };
    }

    // Automatización de Mouse (Clic)
    const clickMatch = text.match(/(?:haz\s+)?clic(?:\s+(derecho|izquierdo|doble))?(?:\s+en\s+(\d+)\s*,\s*(\d+))?/i);
    if (clickMatch) {
        const btnType = clickMatch[1]?.toLowerCase();
        const button = btnType === 'derecho' ? 'right' : 'left';
        const isDouble = btnType === 'doble';
        const x = clickMatch[2] ? parseInt(clickMatch[2]) : undefined;
        const y = clickMatch[3] ? parseInt(clickMatch[3]) : undefined;
        return { type: 'mouseClick', button, double: isDouble, x, y };
    }

    // Control de Ventanas (Minimizar todo, Minimizar, Maximizar, Restaurar)
    if (/(?:minimiza|minimizar)\s+todo|minimiza\s+todas/i.test(text)) {
        return { type: 'windowControl', windowAction: 'minimize_all' };
    }
    const minMatch = text.match(/(?:minimiza|minimizar)\s+(?:la\s+ventana\s+de\s+)?([^\s]+)?/i);
    if (minMatch) {
        const t = minMatch[1] ? minMatch[1].toLowerCase() : '';
        const target = t && !['la', 'esta', 'ventana', 'todo', 'todas'].includes(t) ? minMatch[1] : 'active';
        return { type: 'windowControl', windowAction: 'minimize', target };
    }
    const maxMatch = text.match(/(?:maximiza|maximizar)\s+(?:la\s+ventana\s+de\s+)?([^\s]+)?/i);
    if (maxMatch) {
        const t = maxMatch[1] ? maxMatch[1].toLowerCase() : '';
        const target = t && !['la', 'esta', 'ventana'].includes(t) ? maxMatch[1] : 'active';
        return { type: 'windowControl', windowAction: 'maximize', target };
    }
    const restMatch = text.match(/(?:restaura|restaurar)\s+(?:la\s+ventana\s+de\s+)?([^\s]+)?/i);
    if (restMatch) {
        const t = restMatch[1] ? restMatch[1].toLowerCase() : '';
        const target = t && !['la', 'esta', 'ventana'].includes(t) ? restMatch[1] : 'active';
        return { type: 'windowControl', windowAction: 'restore', target };
    }

    // Control Corporal / Gestos 3D directos
    const bodyPatterns: Array<{ regex: RegExp; actionType: string; gesture?: string; limb?: string; target?: string; walkDirection?: string }> = [
        { regex: /(?:saluda|salúdame|mueve\s+la\s+mano|di\s+hola\s+con\s+la\s+mano)/i, actionType: 'play_gesture', gesture: 'wave' },
        { regex: /(?:asiente|asentir|asiente\s+con\s+la\s+cabeza|di\s+que\s+s[íi]\s+con\s+la\s+cabeza)/i, actionType: 'play_gesture', gesture: 'nod' },
        { regex: /(?:niega|negar|di\s+que\s+no\s+con\s+la\s+cabeza|mueve\s+la\s+cabeza\s+diciendo\s+no)/i, actionType: 'play_gesture', gesture: 'shake_head' },
        { regex: /(?:baila|bailar|haz\s+un\s+baile|danza|tírate\s+un\s+paso)/i, actionType: 'play_gesture', gesture: 'dance' },
        { regex: /(?:celebra|celebrar|alza\s+los\s+brazos|festeja)/i, actionType: 'move_limb', limb: 'BOTH_ARMS', target: 'CELEBRATE' },
        { regex: /(?:aplaude|aplaudir|da\s+aplausos|haz\s+palmas)/i, actionType: 'play_gesture', gesture: 'clap' },
        { regex: /(?:agáchate|agachate|ponte\s+de\s+cuclillas)/i, actionType: 'play_gesture', gesture: 'crouch' },
        { regex: /(?:abrázate|abrazate|abrazo\s+a\s+ti\s+misma)/i, actionType: 'play_gesture', gesture: 'hug_self' },
        { regex: /(?:manos\s+en\s+la\s+cintura|manos\s+en\s+las\s+caderas)/i, actionType: 'play_gesture', gesture: 'hands_on_hips' },
        { regex: /(?:toca\s+tu\s+cabeza|mano\s+en\s+la\s+cabeza)/i, actionType: 'play_gesture', gesture: 'touch_head' },
        { regex: /(?:toca\s+tu\s+pecho|mano\s+en\s+el\s+pecho|mano\s+al\s+coraz[óo]n)/i, actionType: 'play_gesture', gesture: 'touch_chest' },
        { regex: /(?:inclina\s+la\s+cabeza|inclina\s+tu\s+cuello)/i, actionType: 'move_limb', limb: 'HEAD', target: 'TILT_LEFT' },
        { regex: /(?:camina\s+adelante|acércate|ven\s+aqu[íi]|da\s+un\s+paso)/i, actionType: 'walk_to', walkDirection: 'forward' },
        { regex: /(?:retrocede|aléjate|camina\s+atr[áa]s)/i, actionType: 'walk_to', walkDirection: 'backward' },
        { regex: /(?:postura\s+normal|relájate|baja\s+los\s+brazos|reset\s+cuerpo)/i, actionType: 'reset' },
    ];

    for (const bp of bodyPatterns) {
        if (bp.regex.test(text)) {
            return {
                type: 'controlBody' as any,
                target: bp.actionType,
                message: bp.gesture || bp.target || bp.walkDirection,
                key: bp.limb,
            };
        }
    }

    return { type: 'none' };
}

// Mapeo de nombres de apps a ejecutables de Windows
const APP_MAP: Record<string, string> = {
    // Navegadores
    'chrome': 'chrome',
    'firefox': 'firefox',
    'edge': 'msedge',
    'brave': 'brave',
    'opera': 'opera',

    // Comunicación
    'discord': 'discord',
    'teams': 'ms-teams',
    'zoom': 'zoom',
    'slack': 'slack',
    'whatsapp': 'whatsapp',
    'telegram': 'telegram',

    // Productividad
    'word': 'winword',
    'excel': 'excel',
    'powerpoint': 'powerpnt',
    'outlook': 'outlook',
    'onenote': 'onenote',
    'notepad': 'notepad',
    'bloc': 'notepad',
    'calculadora': 'calc',
    'calculator': 'calc',

    // Desarrollo
    'code': 'code',
    'vscode': 'code',
    'visual': 'code',
    'terminal': 'wt',
    'cmd': 'cmd',
    'powershell': 'powershell',

    // Sistema
    'explorador': 'explorer',
    'explorer': 'explorer',
    'archivos': 'explorer',
    'configuración': 'ms-settings:',
    'settings': 'ms-settings:',

    // Multimedia
    'spotify': 'spotify',
    'vlc': 'vlc',

    // Gaming
    'steam': 'steam',
    'epic': 'com.epicgames.launcher:',
};

// Obtener el comando para abrir una app
export function getAppCommand(appName: string): string | null {
    const normalized = appName.toLowerCase().trim();
    return APP_MAP[normalized] || null;
}

// Mapear coordenadas (soporta píxeles reales o escala 0-1000 de Gemini Visual Grounding)
export function parseScreenCoordinates(rawX?: number | string, rawY?: number | string): { x?: number; y?: number } {
    let numX = typeof rawX === 'number' ? rawX : (rawX !== undefined && rawX !== null && rawX !== '' ? Number(rawX) : NaN);
    let numY = typeof rawY === 'number' ? rawY : (rawY !== undefined && rawY !== null && rawY !== '' ? Number(rawY) : NaN);

    if (!isNaN(numX) && !isNaN(numY)) {
        const screenW = typeof window !== 'undefined' ? (window.screen?.width || 1920) : 1920;
        const screenH = typeof window !== 'undefined' ? (window.screen?.height || 1080) : 1080;

        // Si las coordenadas están en escala normalizada 0-1000 (Visual Grounding de Gemini)
        if (numX >= 0 && numX <= 1000 && numY >= 0 && numY <= 1000) {
            if (screenW > 1000 || screenH > 1000) {
                const realX = Math.round((numX / 1000) * screenW);
                const realY = Math.round((numY / 1000) * screenH);
                return { x: realX, y: realY };
            }
        }
        return { x: Math.round(numX), y: Math.round(numY) };
    }
    return {};
}

// Ejecutar comando del sistema
export async function executeSystemCommand(
    command: SystemCommand,
    electronAPI?: any
): Promise<{ success: boolean; message: string }> {
    if (!electronAPI && command.type !== 'openUrl') {
        console.warn('⚠️ electronAPI no disponible, comando no ejecutado');
        return { success: false, message: 'Sistema de comandos no disponible (no estás en Electron)' };
    }

    try {
        switch (command.type) {
            case 'openApp': {
                const appCommand = getAppCommand(command.target || '');
                const targetToSend = appCommand || command.target || '';

                if (!targetToSend) {
                    return { success: false, message: `No sé cómo abrir "${command.target}"` };
                }

                const result = await electronAPI.openApp?.(targetToSend);

                // 🆕 Respuestas inteligentes según el resultado
                if (result?.alreadyOpen) {
                    return { success: true, message: `${command.target} ya la tenías abierta, la traje al frente` };
                }
                if (result?.notFound) {
                    return { success: false, message: `No encontré "${command.target}" instalada en tu sistema` };
                }
                if (result?.success) {
                    return { success: true, message: `¡Abriendo ${command.target}!` };
                }
                return { success: false, message: `No pude abrir "${command.target}"` };
            }

            case 'openUrl': {
                const targetUrl = /^https?:\/\//i.test(command.target || '')
                    ? (command.target || '')
                    : `https://${command.target}`;
                if (electronAPI?.openUrl) {
                    await electronAPI.openUrl(targetUrl);
                } else {
                    window.open(targetUrl, '_blank');
                }
                return { success: true, message: `¡Abriendo ${targetUrl}!` };
            }

            case 'searchFiles': {
                const result = await electronAPI.searchFiles?.(command.target);
                // 🆕 Manejar archivo no encontrado
                if (result?.notFound) {
                    return { success: false, message: `No encontré la ruta "${command.target}"` };
                }
                return { success: true, message: `Buscando "${command.target}"...` };
            }

            case 'mouseClick': {
                const coords = parseScreenCoordinates(command.x, command.y);
                await electronAPI?.mouseClick?.({ x: coords.x, y: coords.y, button: command.button, double: command.double });
                return { success: true, message: `Clic de mouse ejecutado` };
            }

            case 'mouseMove': {
                const coords = parseScreenCoordinates(command.x || 960, command.y || 540);
                await electronAPI?.mouseMove?.(coords.x || 960, coords.y || 540);
                return { success: true, message: `Mouse movido a ${coords.x}, ${coords.y}` };
            }

            case 'typeText': {
                await electronAPI?.typeText?.(command.target || '');
                return { success: true, message: `Texto escrito: ${command.target}` };
            }

            case 'pressKey': {
                await electronAPI?.pressKey?.(command.key || command.target || '');
                return { success: true, message: `Tecla presionada: ${command.key || command.target}` };
            }

            case 'startCall': {
                if (electronAPI?.startCall) {
                    await electronAPI.startCall();
                } else {
                    window.dispatchEvent(new CustomEvent('nova-voice-call-control', { detail: { action: 'start' } }));
                }
                return { success: true, message: 'Iniciando llamada...' };
            }

            case 'endCall': {
                if (electronAPI?.endCall) {
                    await electronAPI.endCall();
                } else {
                    window.dispatchEvent(new CustomEvent('nova-voice-call-control', { detail: { action: 'end' } }));
                }
                return { success: true, message: 'Finalizando llamada...' };
            }

            case 'runCommand': {
                const cmd = command.command || command.target;
                if (!cmd) return { success: false, message: 'Comando no especificado' };
                if (electronAPI?.runCommand) {
                    const result = await electronAPI.runCommand(cmd);
                    return {
                        success: result.success,
                        message: result.success ? `Comando ejecutado exitosamente:\n${result.stdout || 'OK'}` : `Error en comando:\n${result.stderr || result.error}`,
                        result
                    };
                }
                return { success: false, message: 'Ejecución de terminal solo disponible en la app de escritorio' };
            }

            case 'runMacro': {
                const macro = command.macro || command.target;
                if (!macro) return { success: false, message: 'Macro no especificada' };
                if (electronAPI?.runMacro) {
                    const result = await electronAPI.runMacro(macro);
                    return {
                        success: result.success,
                        message: result.message || (result.success ? `Macro '${macro}' ejecutada.` : `Error: ${result.error}`),
                        result
                    };
                }
                return { success: false, message: 'Macros de sistema solo disponibles en la app de escritorio' };
            }

            case 'captureScreen': {
                if (electronAPI?.captureScreenFrame) {
                    const result = await electronAPI.captureScreenFrame();
                    return {
                        success: result.success,
                        message: result.success ? 'Captura de pantalla obtenida.' : 'Error capturando pantalla',
                        imageBase64: result.imageBase64
                    };
                }
                return { success: false, message: 'Captura nativa no disponible en navegador web' };
            }

            default:
                return { success: false, message: 'Comando no reconocido' };
        }
    } catch (error) {
        console.error('Error ejecutando comando:', error);
        return { success: false, message: 'Error al ejecutar el comando' };
    }
}

// Generar texto de herramientas para Gemini
export function getToolsDescription(): string {
    return `
Puedes ejecutar comandos del sistema cuando el usuario te lo pida:
- Abrir aplicaciones: "abre Chrome", "lanza Discord", "abre el explorador"
- Abrir URLs: "abre youtube.com", "ve a google.com"
- Terminal y Scripts: "ejecuta git status", "corre npm run build", "haz un ping a google"
- Macros de Entorno: "activa el entorno de EasyPatagonia", "modo Albion Online"
- Controlar Mouse: "haz clic", "clic derecho", "mueve el mouse a 500, 300"
- Controlar Teclado: "escribe Hola Mundo", "presiona enter", "presiona tab", "presiona ctrl+v", "presiona win+d"
- Controlar Ventanas: "minimiza todo", "minimiza esta ventana", "minimiza chrome", "maximiza discord", "restaura la ventana"

Formatos de comando rápido:
[SYSTEM_CMD: openApp nombre]
[SYSTEM_CMD: openUrl url]
[SYSTEM_CMD: runCommand comando_a_ejecutar]
[SYSTEM_CMD: runMacro easypatagonia]
[SYSTEM_CMD: typeText texto a escribir]
[SYSTEM_CMD: pressKey enter] (o tab, esc, backspace, ctrl+c, ctrl+v, win+d)
[SYSTEM_CMD: mouseClick 500,300] (o right, double)
[SYSTEM_CMD: mouseMove 800,600]
[SYSTEM_CMD: minimizeWindow nombreApp] (o active)
[SYSTEM_CMD: maximizeWindow nombreApp] (o active)
[SYSTEM_CMD: minimizeAll]

Cuando el usuario te pida realizar una acción física o técnica en su computadora, responde confirmando y usa la etiqueta correspondiente.
`;
}
