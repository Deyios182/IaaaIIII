/**
 * Poker Vision Service
 * 
 * Analiza frames de video de mesas de poker para extraer:
 * - Cartas del héroe y board
 * - Pot size y stacks
 * - Posición en la mesa
 * - Acciones previas
 */

export interface PokerCard {
    rank: '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';
    suit: 's' | 'h' | 'd' | 'c'; // spades, hearts, diamonds, clubs
}

export interface PokerSituation {
    heroCards: [PokerCard, PokerCard] | null;
    boardCards: PokerCard[];
    pot: number;
    heroStack: number;
    position: 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB' | 'unknown';
    street: 'preflop' | 'flop' | 'turn' | 'river';
    activePlayer: 'hero' | 'villain' | 'unknown';
    lastAction?: {
        type: 'fold' | 'check' | 'call' | 'raise' | 'bet';
        amount?: number;
    };
    confidence: number; // 0-1, qué tan seguro está el detector
}

/**
 * Analiza un frame de video y extrae información de poker
 */
export async function analyzePokerScreen(
    videoFrame: string | HTMLVideoElement
): Promise<PokerSituation> {
    // Convertir a canvas para procesamiento
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        throw new Error('No se pudo crear contexto de canvas');
    }

    // Capturar frame
    let imageData: ImageData;

    if (typeof videoFrame === 'string') {
        // Es base64
        const img = new Image();
        img.src = videoFrame;
        await new Promise(resolve => img.onload = resolve);
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } else {
        // Es elemento video
        canvas.width = videoFrame.videoWidth;
        canvas.height = videoFrame.videoHeight;
        ctx.drawImage(videoFrame, 0, 0);
        imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    }

    // Detectar cartas del héroe (esquina inferior)
    const heroCards = await detectHeroCards(imageData, canvas);

    // Detectar cartas del board (centro superior)
    const boardCards = await detectBoardCards(imageData, canvas);

    // Detectar pot y stack (OCR numérico)
    const { pot, stack } = await detectNumbers(imageData);

    // Detectar posición (basado en layout)
    const position = detectPosition(imageData);

    // Determinar street
    const street = boardCards.length === 0 ? 'preflop'
        : boardCards.length === 3 ? 'flop'
            : boardCards.length === 4 ? 'turn'
                : 'river';

    return {
        heroCards,
        boardCards,
        pot,
        heroStack: stack,
        position,
        street,
        activePlayer: 'unknown',
        confidence: 0.7 // Por ahora hardcoded, mejorar después
    };
}

/**
 * Detecta las 2 cartas del héroe en la esquina inferior
 * GGPoker: Central inferior
 */
async function detectHeroCards(
    imageData: ImageData,
    canvas: HTMLCanvasElement
): Promise<[PokerCard, PokerCard] | null> {
    const { width, height, data } = imageData;

    // Región GGPoker (ajustada para 16:9)
    const heroX = width * 0.45;
    const heroY = height * 0.72;
    const heroW = width * 0.1;
    const heroH = height * 0.1;

    // Escanear suits por color (GGPoker 4-color deck)
    // Corazones: Rojo, Diamantes: Azul, Tréboles: Verde, Picas: Negro
    const suits: PokerCard['suit'][] = [];

    // Simplificación: buscar píxeles de colores clave en áreas de cartas
    const detectSuit = (x: number, y: number): PokerCard['suit'] | null => {
        const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Rojo (corazones)
        if (r > 150 && g < 80 && b < 80) return 'h';
        // Azul (diamantes)
        if (r < 80 && g < 150 && b > 180) return 'd';
        // Verde (tréboles)
        if (r < 80 && g > 150 && b < 80) return 'c';
        // Negro/Gris oscuro (picas)
        if (r < 50 && g < 50 && b < 50) return 's';

        return null;
    };

    const s1 = detectSuit(heroX + heroW * 0.25, heroY + heroH * 0.5);
    const s2 = detectSuit(heroX + heroW * 0.75, heroY + heroH * 0.5);

    if (s1 && s2) {
        // Rangos aleatorios por ahora hasta tener OCR de rangos estable
        const ranks: PokerCard['rank'][] = ['A', 'K', 'Q', 'J', 'T', '9', '8', '7', '6', '5', '4', '3', '2'];
        const r1 = ranks[Math.floor(Math.random() * ranks.length)];
        const r2 = ranks[Math.floor(Math.random() * ranks.length)];

        return [
            { rank: r1, suit: s1 },
            { rank: r2, suit: s2 }
        ];
    }

    return null;
}

/**
 * Detecta cartas del board (flop/turn/river)
 * GGPoker: Centro horizontal
 */
async function detectBoardCards(
    imageData: ImageData,
    canvas: HTMLCanvasElement
): Promise<PokerCard[]> {
    const { width, height, data } = imageData;
    const boardCards: PokerCard[] = [];

    const boardX = width * 0.35;
    const boardY = height * 0.45;
    const step = width * 0.06;

    const detectSuit = (x: number, y: number): PokerCard['suit'] | null => {
        const idx = (Math.floor(y) * width + Math.floor(x)) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        if (r > 150 && g < 80 && b < 80) return 'h';
        if (r < 80 && g < 150 && b > 180) return 'd';
        if (r < 80 && g > 150 && b < 80) return 'c';
        if (r < 50 && g < 50 && b < 50) return 's';
        return null;
    };

    for (let i = 0; i < 5; i++) {
        const s = detectSuit(boardX + i * step, boardY);
        if (s) {
            boardCards.push({ rank: 'A', suit: s }); // Rank temporal
        }
    }

    return boardCards;
}

/**
 * Detecta números (pot, stacks) usando OCR simple o simulado
 */
async function detectNumbers(
    imageData: ImageData
): Promise<{ pot: number; stack: number }> {
    // En una versión real usaríamos Tesseract.js aquí
    return {
        pot: Math.floor(Math.random() * 50) + 10,
        stack: 100
    };
}

/**
 * Detecta la posición del héroe basándose en el botón dealer
 * GGPoker: El botón es una ficha amarilla/naranja que se mueve
 */
function detectPosition(
    imageData: ImageData
): 'UTG' | 'MP' | 'CO' | 'BTN' | 'SB' | 'BB' | 'unknown' {
    // Por ahora rotamos posiciones para demo interna funcional
    const positions: any[] = ['UTG', 'MP', 'CO', 'BTN', 'SB', 'BB'];
    return positions[Math.floor(Date.now() / 10000) % 6];
}

/**
 * Helper: Convierte carta a string (ej: As, Kh)
 */
export function cardToString(card: PokerCard): string {
    return `${card.rank}${card.suit}`;
}

/**
 * Helper: Convierte string a carta
 */
export function stringToCard(str: string): PokerCard {
    return {
        rank: str[0] as PokerCard['rank'],
        suit: str[1] as PokerCard['suit']
    };
}
