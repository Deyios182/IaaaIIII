/**
 * Poker Assistant Demo Mode
 * 
 * Genera situaciones de poker simuladas para probar el overlay sin necesidad
 * de detección visual real. Útil para desarrollo y testing.
 */

import { PokerCard, PokerSituation } from './pokerVision';
import { GTODecision, calculateGTODecision } from './gtoEngine';

/**
 * Genera una situación de poker aleatoria para demo
 */
export function generateDemoSituation(): PokerSituation {
    const situations: PokerSituation[] = [
        // Escenario 1: AA preflop en BTN
        {
            heroCards: [
                { rank: 'A', suit: 's' },
                { rank: 'A', suit: 'h' }
            ],
            boardCards: [],
            pot: 15,
            heroStack: 200,
            position: 'BTN',
            street: 'preflop',
            activePlayer: 'hero',
            confidence: 0.95
        },
        // Escenario 2: Top pair en flop
        {
            heroCards: [
                { rank: 'A', suit: 'h' },
                { rank: 'K', suit: 'd' }
            ],
            boardCards: [
                { rank: 'A', suit: 'c' },
                { rank: '9', suit: 's' },
                { rank: '3', suit: 'h' }
            ],
            pot: 45,
            heroStack: 185,
            position: 'CO',
            street: 'flop',
            activePlayer: 'hero',
            confidence: 0.88
        },
        // Escenario 3: Trash hand UTG
        {
            heroCards: [
                { rank: '7', suit: 'c' },
                { rank: '2', suit: 'd' }
            ],
            boardCards: [],
            pot: 3,
            heroStack: 200,
            position: 'UTG',
            street: 'preflop',
            activePlayer: 'hero',
            confidence: 0.92
        },
        // Escenario 4: Flush draw en turn
        {
            heroCards: [
                { rank: 'K', suit: 'h' },
                { rank: 'Q', suit: 'h' }
            ],
            boardCards: [
                { rank: 'A', suit: 'h' },
                { rank: '9', suit: 'h' },
                { rank: '3', suit: 'd' },
                { rank: '5', suit: 's' }
            ],
            pot: 120,
            heroStack: 150,
            position: 'BTN',
            street: 'turn',
            activePlayer: 'hero',
            confidence: 0.85
        }
    ];

    // Retornar situación aleatoria
    return situations[Math.floor(Math.random() * situations.length)];
}

/**
 * Modo demo que cicla entre diferentes situaciones
 */
export function createPokerDemo(
    onUpdate: (situation: PokerSituation, decision: GTODecision) => void,
    intervalMs: number = 5000
): () => void {
    const interval = setInterval(() => {
        const situation = generateDemoSituation();
        const decision = calculateGTODecision(situation);
        onUpdate(situation, decision);
    }, intervalMs);

    // Retornar función de cleanup
    return () => clearInterval(interval);
}
