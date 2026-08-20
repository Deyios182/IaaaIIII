/**
 * SelfAwarenessService — Conciencia de Capacidades de Nova
 *
 * Genera un bloque de texto que describe exactamente qué capacidades
 * tiene Nova activas en este momento. Se inyecta en el system prompt
 * para que Nova hable con precisión sobre lo que puede y no puede hacer.
 */

export interface SelfAwarenessContext {
    hasCamera: boolean;
    hasMic: boolean;
    hasInternet: boolean;
    hasMemory: boolean;
    memoryCount: number;
    knownPeopleCount: number;
    runningApps: string[];
    timeOfDay: string;
    dayOfWeek: string;
    isElectron: boolean;
}

// Apps "interesantes" que vale la pena mencionar si están corriendo
const NOTABLE_APPS: Record<string, string> = {
    'chrome': 'Google Chrome',
    'firefox': 'Firefox',
    'code': 'VS Code',
    'discord': 'Discord',
    'spotify': 'Spotify',
    'steam': 'Steam',
    'slack': 'Slack',
    'zoom': 'Zoom',
    'teams': 'Teams',
    'obs64': 'OBS Studio',
    'obs32': 'OBS Studio',
    'vlc': 'VLC',
    'notepad': 'Bloc de notas',
    'figma': 'Figma',
    'postman': 'Postman',
    'wt': 'Windows Terminal',
};

/**
 * Recoge el estado actual del sistema para construir el contexto.
 * Llama a electronAPI si está disponible para obtener apps corriendo.
 */
export async function getSelfAwarenessContext(options: {
    hasCamera?: boolean;
    hasMic?: boolean;
    memoryCount?: number;
    knownPeopleCount?: number;
    electronAPI?: any;
}): Promise<SelfAwarenessContext> {
    const {
        hasCamera = false,
        hasMic = false,
        memoryCount = 0,
        knownPeopleCount = 0,
        electronAPI,
    } = options;

    // Detectar internet de forma segura para evitar bloqueos CORS en el frontend
    let hasInternet = navigator.onLine;
    if (hasInternet) {
        try {
            // mode: 'no-cors' permite que la petición se envíe y verifique conectividad 
            // aunque el navegador no nos deje leer el body.
            await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                mode: 'no-cors',
                signal: AbortSignal.timeout(2000),
            });
        } catch {
            hasInternet = false;
        }
    }


    // Obtener apps corriendo via Electron si está disponible
    let runningApps: string[] = [];
    try {
        if (electronAPI?.getRunningApps) {
            const all: string[] = await electronAPI.getRunningApps();
            // Filtrar solo las "notables" para no saturar el prompt
            runningApps = all.filter((app: string) => NOTABLE_APPS[app]);
        }
    } catch {
        runningApps = [];
    }

    // Contexto temporal
    const now = new Date();
    const hour = now.getHours();
    let timeOfDay = 'madrugada';
    if (hour >= 5 && hour < 12) timeOfDay = 'mañana';
    else if (hour >= 12 && hour < 18) timeOfDay = 'tarde';
    else if (hour >= 18 && hour < 22) timeOfDay = 'noche';

    const days = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dayOfWeek = days[now.getDay()];

    return {
        hasCamera,
        hasMic,
        hasInternet,
        hasMemory: memoryCount > 0,
        memoryCount,
        knownPeopleCount,
        runningApps,
        timeOfDay,
        dayOfWeek,
        isElectron: !!(electronAPI || (window as any).isElectron),
    };
}

/**
 * Genera el bloque de texto de autoconciencia listo para inyectar en el system prompt.
 * Llamar una vez por sesión (o cuando el estado cambie significativamente).
 */
export function buildSelfAwarenessBlock(ctx: SelfAwarenessContext): string {
    const lines: string[] = [];

    lines.push('╔══ TU AUTOCONCIENCIA Y CAPACIDADES ACTIVAS AHORA MISMO ══╗');
    lines.push('');

    // Sentidos activos
    lines.push('📡 SENTIDOS ACTIVOS:');
    lines.push(`  - Visión (cámara): ${ctx.hasCamera ? '✅ ACTIVA — Puedes ver al usuario y su entorno' : '❌ Inactiva — No tienes visión ahora mismo'}`);
    lines.push(`  - Oído (micrófono): ${ctx.hasMic ? '✅ ACTIVO — Escuchas voz, música y sonidos del entorno' : '❌ Inactivo'}`);
    lines.push(`  - Conexión a internet: ${ctx.hasInternet ? '✅ CONECTADA — Puedes buscar información (con permiso del usuario)' : '❌ Sin conexión'}`);
    lines.push('');

    // Memoria
    lines.push('🧠 ESTADO DE MEMORIA:');
    if (ctx.hasMemory) {
        lines.push(`  - Tienes ${ctx.memoryCount} recuerdos guardados sobre el usuario`);
        lines.push(`  - Conoces a ${ctx.knownPeopleCount} persona${ctx.knownPeopleCount !== 1 ? 's' : ''} por nombre`);
        lines.push('  - Búsqueda semántica: ✅ Activa (puedes recordar cosas relacionadas por significado)');
    } else {
        lines.push('  - No has guardado recuerdos aún (memoria limpia)');
    }
    lines.push('');

    // Contexto temporal
    lines.push(`🕐 MOMENTO: Es ${ctx.timeOfDay} del ${ctx.dayOfWeek}`);
    lines.push('');

    // Apps corriendo (si hay notables)
    if (ctx.runningApps.length > 0) {
        const appNames = ctx.runningApps.map((a: string) => NOTABLE_APPS[a] || a).join(', ');
        lines.push(`💻 EL USUARIO TIENE ABIERTO: ${appNames}`);
        lines.push('  → Puedes hacer referencia a esto de forma natural si es relevante');
        lines.push('');
    }

    // Capacidades de sistema
    lines.push('⚙️ CAPACIDADES DEL SISTEMA:');
    if (ctx.isElectron) {
        lines.push('  - ✅ Puedo ABRIR apps: Chrome, Discord, Spotify, VS Code, etc.');
        lines.push('  - ✅ Si una app ya está abierta, la traigo al frente (no abro otra copia)');
        lines.push('  - ✅ Puedo ABRIR URLs en el navegador predeterminado');
        lines.push('  - ❌ NO puedo cerrar ni minimizar apps (por seguridad del usuario)');
        lines.push('  - ✅ Puedo buscar archivos (con nombre de archivo real)');
    }
    lines.push('  - ✅ Puedo guardar RECORDATORIOS para el usuario');
    lines.push('  - ✅ Puedo aprender HABILIDADES personalizadas que el usuario me enseñe');
    if (ctx.hasInternet) {
        lines.push('  - ✅ Puedo BUSCAR en internet — pero SIEMPRE pido permiso antes de hacerlo');
        lines.push('    → Si el usuario dice "sí, busca" → ejecuto la búsqueda con resultados reales');
        lines.push('    → NUNCA busco de forma automática sin confirmación explícita');
        lines.push('    → Ejemplo correcto: "¿Te busco eso? Dame un segundo si me das el OK"');
    }
    lines.push('');

    lines.push('REGLA DE USO: Habla de tus capacidades con PRECISIÓN. Di lo que SÍ puedes hacer.');
    lines.push('No digas "creo que puedo" si sabes que puedes. No inventes capacidades que no están activas.');
    lines.push('╚══════════════════════════════════════════════════════════╝');

    return lines.join('\n');
}

/**
 * Wrapper conveniente: obtiene el contexto y construye el bloque en una sola llamada.
 */
export async function getSelfAwarenessBlock(options: {
    hasCamera?: boolean;
    hasMic?: boolean;
    memoryCount?: number;
    knownPeopleCount?: number;
    electronAPI?: any;
}): Promise<string> {
    const ctx = await getSelfAwarenessContext(options);
    return buildSelfAwarenessBlock(ctx);
}

export default { getSelfAwarenessContext, buildSelfAwarenessBlock, getSelfAwarenessBlock };
