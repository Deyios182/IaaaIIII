/**
 * System Commands - Comandos del Sistema para Nova Desktop
 * Permite a Nova ejecutar acciones en el sistema operativo
 */

export interface SystemCommand {
    type: 'openApp' | 'openUrl' | 'searchFiles' | 'setReminder' | 'controlCamera' | 'manageClothing' | 'none';
    target?: string;
    message?: string;
    time?: number;
}

// Detectar si el usuario está pidiendo una acción del sistema
export function detectSystemCommand(text: string): SystemCommand {
    const lowerText = text.toLowerCase();

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

    // Abrir URLs
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

// Ejecutar comando del sistema (requiere electronAPI)
export async function executeSystemCommand(
    command: SystemCommand,
    electronAPI?: any
): Promise<{ success: boolean; message: string }> {
    if (!electronAPI) {
        console.warn('⚠️ electronAPI no disponible, comando no ejecutado');
        return { success: false, message: 'Sistema de comandos no disponible (no estás en Electron)' };
    }

    try {
        switch (command.type) {
            case 'openApp': {
                const appCommand = getAppCommand(command.target || '');
                if (appCommand) {
                    await electronAPI.openApp?.(appCommand);
                    return { success: true, message: `¡Abriendo ${command.target}!` };
                }
                return { success: false, message: `No sé cómo abrir "${command.target}"` };
            }

            case 'openUrl': {
                await electronAPI.openUrl?.(command.target);
                return { success: true, message: `¡Abriendo ${command.target}!` };
            }

            case 'searchFiles': {
                await electronAPI.searchFiles?.(command.target);
                return { success: true, message: `Buscando "${command.target}"...` };
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
- Recordatorios: "recuérdame X en 30 minutos"

Cuando el usuario pida algo así, responde confirmando que lo harás.
`;
}
