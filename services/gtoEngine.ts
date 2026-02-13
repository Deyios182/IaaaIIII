/**
 * GTO Engine
 * 
 * Motor de decisiones basado en Game Theory Optimal para poker.
 * Calcula la acción óptima basándose en ranges, equity y pot odds.
 */

import { PokerCard, PokerSituation, cardToString } from './pokerVision';

export interface GTODecision {
    action: 'fold' | 'check' | 'call' | 'bet' | 'raise';
    size?: number; // En BBs o cantidad absoluta
    frequency: number; // 0-100, % de veces que debe hacerse
    reasoning: string; // Explicación para el usuario
    equity?: number; // % de equity estimado
    ev?: number; // Expected value estimado
}

/**
 * Calcula la decisión GTO óptima para una situación dada
 */
export function calculateGTODecision(
    situation: PokerSituation
): GTODecision {
    const { heroCards, boardCards, pot, heroStack, position, street } = situation;

    // Si no tenemos cartas, no podemos decidir
    if (!heroCards) {
        return {
            action: 'fold',
            frequency: 100,
            reasoning: 'No se detectaron las cartas del héroe'
        };
    }

    // Pre-flop: Usar ranges estándar
    if (street === 'preflop') {
        return calculatePreflopDecision(heroCards, position, pot, heroStack);
    }

    // Post-flop: Heurísticas básicas
    return calculatePostflopDecision(heroCards, boardCards, position, pot, heroStack, street);
}

/**
 * Decisiones pre-flop basadas en ranges GTO
 */
function calculatePreflopDecision(
    heroCards: [PokerCard, PokerCard],
    position: string,
    pot: number,
    stack: number
): GTODecision {
    const hand = `${cardToString(heroCards[0])}${cardToString(heroCards[1])}`;
    const handStrength = evaluateHandStrength(heroCards);

    // Ranges simplificados por posición
    const ranges = {
        'UTG': 0.12, // 12% de manos
        'MP': 0.15,
        'CO': 0.25,
        'BTN': 0.45,
        'SB': 0.35,
        'BB': 1.0 // Defiende amplio vs robo
    };

    const positionThreshold = ranges[position as keyof typeof ranges] || 0.2;

    // ¿Está nuestra mano en el range?
    if (handStrength >= positionThreshold) {
        // Raise para iniciar pot (RFI - Raise First In)
        const raiseSize = 2.5; // 2.5 BBs estándar

        return {
            action: 'raise',
            size: raiseSize,
            frequency: 100,
            reasoning: `Mano fuerte para ${position}. RFI estándar.`,
            equity: handStrength * 100
        };
    } else {
        return {
            action: 'fold',
            frequency: 100,
            reasoning: `Mano débil para ${position}. Fold estándar.`,
            equity: handStrength * 100
        };
    }
}

/**
 * Decisiones post-flop (simplificadas)
 */
function calculatePostflopDecision(
    heroCards: [PokerCard, PokerCard],
    boardCards: PokerCard[],
    position: string,
    pot: number,
    stack: number,
    street: string
): GTODecision {
    // Evaluar nuestra mano vs el board
    const handValue = evaluatePostflopHand(heroCards, boardCards);

    // Heurística simple: si tenemos par o mejor, apostar
    if (handValue >= 2) { // 2 = par
        const betSize = pot * 0.66; // 2/3 pot estándar

        return {
            action: 'bet',
            size: betSize,
            frequency: 75,
            reasoning: `Tienes ${getHandName(handValue)}. C-bet estándar.`,
            equity: 60
        };
    } else if (handValue === 1) { // High card pero puede mejorar
        return {
            action: 'check',
            frequency: 100,
            reasoning: 'Sin conexión con el board. Check para ver turn gratis.',
            equity: 35
        };
    } else {
        return {
            action: 'fold',
            frequency: 100,
            reasoning: 'Sin equity. Fold correcto.',
            equity: 15
        };
    }
}

/**
 * Evalúa fuerza de mano pre-flop (0-1)
 * Basado en Chen Formula simplificada
 */
function evaluateHandStrength(cards: [PokerCard, PokerCard]): number {
    const ranks = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
    const getValue = (rank: string) => ranks.indexOf(rank) + 2;

    const val1 = getValue(cards[0].rank);
    const val2 = getValue(cards[1].rank);
    const isPair = val1 === val2;
    const isSuited = cards[0].suit === cards[1].suit;
    const gap = Math.abs(val1 - val2);

    let score = Math.max(val1, val2) / 14; // Carta alta

    if (isPair) score += 0.5; // Bonus por pareja
    if (isSuited) score += 0.1; // Bonus por suited
    if (gap <= 1) score += 0.05; // Bonus por conectadas

    return Math.min(score, 1);
}

/**
 * Evalúa mano post-flop
 * Retorna: 0=nada, 1=carta alta, 2=par, 3=dos pares, 4=trío, etc.
 */
function evaluatePostflopHand(
    heroCards: [PokerCard, PokerCard],
    boardCards: PokerCard[]
): number {
    // Combinar cartas del héroe con el board
    const allCards = [...heroCards, ...boardCards];
    const ranks = allCards.map(c => c.rank);

    // Contar frecuencias
    const freq: Record<string, number> = {};
    ranks.forEach(r => freq[r] = (freq[r] || 0) + 1);

    const counts = Object.values(freq).sort((a, b) => b - a);

    // Evaluar mano
    if (counts[0] === 4) return 7; // Poker
    if (counts[0] === 3 && counts[1] === 2) return 6; // Full house
    if (counts[0] === 3) return 4; // Trío
    if (counts[0] === 2 && counts[1] === 2) return 3; // Dos pares
    if (counts[0] === 2) return 2; // Par
    return 1; // High card
}

/**
 * Nombre de la mano para mostrar al usuario
 */
function getHandName(value: number): string {
    const names = ['Nada', 'Carta alta', 'Par', 'Dos pares', 'Trío', 'Escalera',
        'Color', 'Full house', 'Poker', 'Escalera de color'];
    return names[value] || 'Desconocido';
}

/**
 * Calcula pot odds
 */
export function calculatePotOdds(pot: number, betToCall: number): number {
    return betToCall / (pot + betToCall);
}

/**
 * Determina si un call es +EV basado en equity
 */
export function isCallProfitable(equity: number, potOdds: number): boolean {
    return equity > potOdds;
}
