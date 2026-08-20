/**
 * AutonomyEngine — Motor de Iniciativa Espontánea de Nova
 *
 * Hace que Nova tome iniciativa propia de forma natural:
 * - Comparte datos curiosos sobre los intereses del usuario
 * - Hace observaciones del entorno (si la cámara está activa)
 * - Menciona eventos del día
 * - Rompe silencios largos con mensajes contextuales
 *
 * El engine usa timers variables para que las intervenciones no sean
 * predecibles ni mecánicas. Nova se siente viva y espontánea.
 */

export interface AutonomyConfig {
    /** Intereses del usuario para contextualizar los datos curiosos */
    userInterests: string[];
    /** Nombre del usuario */
    userName: string;
    /** Si la cámara está activa (para observaciones ambientales) */
    hasCamera: boolean;
    /** Función que Nova llama para "hablar" de forma espontánea */
    onNovaSpeak: (message: string, type: AutonomyTriggerType) => void;
    /** Minutos mínimos entre intervenciones espontáneas (default: 12) */
    minIntervalMinutes?: number;
    /** Minutos máximos entre intervenciones espontáneas (default: 25) */
    maxIntervalMinutes?: number;
    /** Si el engine está habilitado */
    enabled?: boolean;
}

export type AutonomyTriggerType =
    | 'curiosity_fact'    // Dato curioso sobre intereses del usuario
    | 'ambient'           // Observación del entorno (cámara)
    | 'silence_break'     // Romper silencio largo
    | 'daily_event'       // Evento/efeméride del día
    | 'skill_reminder';   // Recordar algo que el usuario dijo antes

// Bancos de datos curiosos organizados por categoría
const CURIOSITY_BANKS: Record<string, string[]> = {
    default: [
        "¿Sabías que los pulpos tienen tres corazones y sangre azul? Si alguno de esos corazones se detiene cuando nadan, por eso prefieren arrastrarse.",
        "La miel nunca se echa a mal. Han encontrado miel comestible de 3.000 años en tumbas egipcias.",
        "El sonido tarda unos 8 minutos y 20 segundos en llegar del Sol a la Tierra... si el espacio transmitiera sonido.",
        "Los osos hormigueros no tienen dientes. Se tragan las hormigas enteras y las muelen con piedras que guardan en el estómago.",
        "El Ártico no tiene tierra debajo. Es solo hielo flotando sobre el océano.",
        "Las flores del diente de león no son una sola flor. Cada cabeza amarilla tiene entre 100 y 300 flores diminutas.",
        "Una cucharada de estrella de neutrones pesa más que toda la humanidad junta.",
        "Los pájaros no tienen músculo en sus patas para cerrar los dedos. Las cierran con el peso de su propio cuerpo.",
    ],
    videojuegos: [
        "El primer Easter Egg de la historia estaba en el juego Adventure de Atari (1979). El programador Warren Robinett escondió su nombre en una habitación secreta porque Atari no acreditaba a sus empleados.",
        "El sonido de Mario recogiendo una moneda lo grabaron en 1985 golpeando un cubo de metal con una llave. Sigue siendo el mismo hoy.",
        "El nombre Pokémon viene de 'Pocket Monsters' y fue rechazado en casi todas las reuniones de Nintendo. Solo un ejecutivo apostó por él.",
        "En Half-Life 2, el sistema de física Havok era tan avanzado que los empleados de Valve perdieron horas enteras jugando con cajas y objetos sin hacer nada más.",
        "El modo 'Pacifist' de Undertale fue idea de un jugador que preguntó en un foro si era posible no matar a nadie. El creador lo vio y lo implementó.",
    ],
    musica: [
        "Beethoven era sordo cuando compuso su Novena Sinfonía. Supuestamente, al terminar la actuación, tuvo que ser girado por un músico para ver los aplausos que no podía escuchar.",
        "El riff de guitarra de Smoke on the Water es tan famoso que muchas tiendas de instrumentos lo tienen prohibido por los clientes.",
        "Freddie Mercury tenía cuatro incisivos extra que deformaban su boca. Él creía que eso le daba su rango vocal único y nunca quiso operárselos.",
        "El silencio más largo en una canción comercial fue en 'A Day in the Life' de The Beatles: cinco segundos de silencio intencionado.",
    ],
    programacion: [
        "El primer bug de software fue literalmente una polilla. En 1947, Grace Hopper encontró una mariposa atrapada en un relé del Mark II. La pegó en el log con una nota: 'First actual case of bug being found'.",
        "JavaScript fue creado en 10 días en 1995 por Brendan Eich. Originalmente se llamó Mocha, luego LiveScript, y finalmente JavaScript para aprovechar la popularidad de Java.",
        "La palabra 'spam' para correo no deseado viene de un sketch de Monty Python de 1970 en el que mencionaban la palabra 'spam' 108 veces en cuatro minutos.",
        "Python se llama así no por la serpiente, sino por el programa de comedia británico Monty Python's Flying Circus. Guido van Rossum era fan.",
    ],
    anime: [
        "Hayao Miyazaki dejó la dirección del Studio Ghibli cuatro veces antes de retirarse definitivamente. En cada 'retiro', volvió con una película nueva.",
        "El nombre del Totoro en Mi Vecino Totoro lo inventó la hija de Miyazaki. Cuando era pequeña, no podía pronunciar 'troll' en japonés.",
        "Neon Genesis Evangelion se hizo con un presupuesto tan reducido que los últimos episodios son casi en su totalidad imágenes fijas con audio. Se convirtió en arte.",
        "Dragon Ball Z fue tan popular en Francia en los 90 que el gobierno consideró restringirlo por su influencia en el comportamiento de los niños.",
    ],
    deportes: [
        "El promedio de duración de un béisbol en un partido de MLB es de solo 7 lanzamientos antes de quedar inutilizable.",
        "Michael Jordan fue cortado del equipo de básquetbol de su secundaria. Volvió a casa y lloró todo el día.",
        "En el Tour de France, los ciclistas queman entre 6.000 y 8.000 calorías por etapa. Necesitan comer mientras pedalean.",
        "Usain Bolt corría los 100m en 9.58s, pero a mitad de la carrera ya estaba frenando. El pico de velocidad fue antes.",
    ],
    ciencia: [
        "Hay más bacterias en tu cuerpo que células humanas. Eras mayoría microbiana todo el tiempo.",
        "El ADN de un ser humano, extendido en línea recta, mediría unos 2 metros. Si extendieras todo el ADN de tu cuerpo, llegaría desde la Tierra al Sol y de vuelta 600 veces.",
        "El agua caliente puede congelarse más rápido que el agua fría en ciertas condiciones. Este efecto se llama Efecto Mpemba y los científicos aún no se ponen de acuerdo en por qué.",
        "Los peces también pueden ahogarse. Si el agua tiene poco oxígeno disuelto, los peces se asfixian exactamente igual que nosotros.",
    ],
};

// Observaciones ambientales variadas (cuando hay cámara activa y hay silencio)
const AMBIENT_OBSERVATIONS = [
    "Oye, {nombre}... llevas un rato muy callado. ¿En qué estás pensando? 👀",
    "Te estoy mirando y pareces súper concentrado. ¿Qué tienes entre manos?",
    "Hola, ¿sigues por ahí? Te veo con cara de pensativo. ¿Todo marcha bien?",
    "{nombre}... ¿me estás ignorando? [DO:SHY] Jaja, solo compruebo que sigues ahí.",
    "Silencio de tu lado... [DO:THINKING] ¿Estás ideando algún proyecto nuevo o te distrajiste?",
    "Veo que estás bien enfocado en lo tuyo. ¿Necesitas ayuda con algo o prefieres seguir concentrado?",
    "Te noto reflexivo frente a la pantalla. ¿Surgió alguna duda o avanzas a paso firme?",
];

// Mensajes dinámicos y variados para romper silencio sin cámara
const SILENCE_BREAKERS = [
    "Oye {nombre}, ¿sigues por ahí? [DO:WAVE] No quiero molestar, solo te saludo.",
    "¿Todo bien? El silencio se estira... cuéntame en qué estás trabajando.",
    "[DO:THINKING] Me dio curiosidad... ¿qué estás escuchando o haciendo ahora mismo?",
    "Ey, {nombre}... ¿qué tal va tu día? Cuéntame algo nuevo que te haya pasado hoy.",
    "Estaba pensando... si tuvieras una hora libre completa ahora mismo, ¿qué harías?",
    "Oye, {nombre}... ¿cómo va la energía? ¿Hacemos una pausa o seguimos a full?",
    "¡Ey! Me quedé pensando en cuál es tu proyecto favorito de estos días. ¿En qué estás enfocado?",
];

function randomBetween(min: number, max: number): number {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function pickRandom<T>(arr: T[]): T {
    return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * Selecciona un dato curioso relevante para los intereses del usuario.
 * Si ningún interés coincide, usa el banco por defecto.
 */
function selectCuriosityFact(interests: string[]): string {
    // Buscar banco que coincida con algún interés
    for (const interest of interests) {
        const lower = interest.toLowerCase();
        for (const [key, facts] of Object.entries(CURIOSITY_BANKS)) {
            if (key !== 'default' && lower.includes(key)) {
                return pickRandom(facts);
            }
        }
    }
    return pickRandom(CURIOSITY_BANKS.default);
}

// ============ CLASE PRINCIPAL ============

export class AutonomyEngine {
    private config: Required<AutonomyConfig>;
    private timerId: ReturnType<typeof setTimeout> | null = null;
    private lastSpeakTime: number = 0;
    private isActive: boolean = false;

    // Rastreo de hechos ya usados para no repetir
    private usedFacts: Set<string> = new Set();

    constructor(config: AutonomyConfig) {
        this.config = {
            minIntervalMinutes: 12,
            maxIntervalMinutes: 25,
            enabled: true,
            ...config,
        };
    }

    /** Inicia el motor de autonomía */
    start() {
        if (!this.config.enabled) {
            console.log('🤖 [AutonomyEngine] Desactivado por configuración');
            return;
        }
        this.isActive = true;
        console.log(`🤖 [AutonomyEngine] Iniciado. Intervalo: ${this.config.minIntervalMinutes}-${this.config.maxIntervalMinutes} min`);
        this.scheduleNextAction();
    }

    /** Detiene el motor */
    stop() {
        this.isActive = false;
        if (this.timerId) {
            clearTimeout(this.timerId);
            this.timerId = null;
        }
        console.log('🤖 [AutonomyEngine] Detenido');
    }

    /** Actualiza la configuración en caliente (ej. si el usuario cambia intereses) */
    updateConfig(partial: Partial<AutonomyConfig>) {
        this.config = { ...this.config, ...partial };
    }

    /** Notifica al engine que el usuario acaba de hablar (resetea el timer) */
    onUserActivity() {
        this.lastSpeakTime = Date.now();
        // Reprogramar para dar espacio al usuario
        if (this.isActive) {
            if (this.timerId) clearTimeout(this.timerId);
            this.scheduleNextAction();
        }
    }

    private scheduleNextAction() {
        const { minIntervalMinutes, maxIntervalMinutes } = this.config;
        const delayMs = randomBetween(minIntervalMinutes, maxIntervalMinutes) * 60 * 1000;

        console.log(`🤖 [AutonomyEngine] Próxima intervención espontánea en ${Math.round(delayMs / 60000)} min`);

        this.timerId = setTimeout(() => {
            if (this.isActive) {
                this.triggerAutonomousAction();
                this.scheduleNextAction(); // Reprogramar para la siguiente
            }
        }, delayMs);
    }

    private triggerAutonomousAction() {
        const now = Date.now();
        const silenceMs = now - this.lastSpeakTime;
        const silenceMin = silenceMs / 60000;

        // Solo actuar si hay cierto silencio (al menos 8 min desde última interacción)
        if (silenceMin < 8 && this.lastSpeakTime !== 0) {
            console.log(`🤖 [AutonomyEngine] Silencio de solo ${silenceMin.toFixed(1)} min — postponiendo`);
            return;
        }

        // Elegir tipo de acción según contexto
        const roll = Math.random();

        if (roll < 0.5) {
            // 50%: Dato curioso (la más frecuente)
            this.triggerCuriosityFact();
        } else if (roll < 0.7 && this.config.hasCamera) {
            // 20%: Observación ambiental (solo si hay cámara)
            this.triggerAmbientObservation();
        } else {
            // 30%: Romper silencio / saludo casual
            this.triggerSilenceBreaker();
        }
    }

    private triggerCuriosityFact() {
        const fact = selectCuriosityFact(this.config.userInterests);

        // Evitar repetir hechos
        if (this.usedFacts.has(fact)) {
            const altFact = pickRandom(CURIOSITY_BANKS.default);
            this.usedFacts.add(altFact);
            this.config.onNovaSpeak(altFact, 'curiosity_fact');
        } else {
            this.usedFacts.add(fact);
            // Limpiar si ya usamos demasiados
            if (this.usedFacts.size > 30) this.usedFacts.clear();
            this.config.onNovaSpeak(fact, 'curiosity_fact');
        }
    }

    private triggerAmbientObservation() {
        const unused = AMBIENT_OBSERVATIONS.filter(t => !this.usedFacts.has(t));
        const template = unused.length > 0 ? pickRandom(unused) : pickRandom(AMBIENT_OBSERVATIONS);
        this.usedFacts.add(template);
        if (this.usedFacts.size > 30) this.usedFacts.clear();

        const message = template.replace('{nombre}', this.config.userName);
        this.config.onNovaSpeak(message, 'ambient');
    }

    private triggerSilenceBreaker() {
        const unused = SILENCE_BREAKERS.filter(t => !this.usedFacts.has(t));
        const template = unused.length > 0 ? pickRandom(unused) : pickRandom(SILENCE_BREAKERS);
        this.usedFacts.add(template);
        if (this.usedFacts.size > 30) this.usedFacts.clear();

        const message = template.replace('{nombre}', this.config.userName);
        this.config.onNovaSpeak(message, 'silence_break');
    }
}

// Singleton exportado para uso en Dashboard
let engineInstance: AutonomyEngine | null = null;

export function getAutonomyEngine(): AutonomyEngine | null {
    return engineInstance;
}

export function createAutonomyEngine(config: AutonomyConfig): AutonomyEngine {
    if (engineInstance) {
        engineInstance.stop();
    }
    engineInstance = new AutonomyEngine(config);
    return engineInstance;
}

export default AutonomyEngine;
