/**
 * Showdown evaluation. We do NOT implement hand ranking ourselves — we delegate to
 * the well-known `pokersolver` library. The same function runs on the server and in
 * the browser, so either player (or an auditor) can independently recompute the
 * winner from the revealed cards.
 */
// @ts-expect-error pokersolver ships no type declarations
import pokersolver from 'pokersolver';
import { cardCode, cardView, CardView } from './cards.js';

// pokersolver is CommonJS; grab Hand through the default import for ESM interop.
const { Hand } = pokersolver as unknown as { Hand: any };

export type Winner = 'A' | 'B' | 'tie';

export interface ShowdownResult {
  winner: Winner;
  a: { cards: CardView[]; name: string; descr: string };
  b: { cards: CardView[]; name: string; descr: string };
  board: CardView[];
}

/**
 * @param holeA      2 card indices for player A
 * @param holeB      2 card indices for player B
 * @param community  5 community card indices
 */
export function evaluateShowdown(
  holeA: number[],
  holeB: number[],
  community: number[],
): ShowdownResult {
  if (holeA.length !== 2 || holeB.length !== 2) throw new Error('each player needs 2 hole cards');
  if (community.length !== 5) throw new Error('need exactly 5 community cards');

  const boardCodes = community.map(cardCode);
  const handA = Hand.solve([...holeA.map(cardCode), ...boardCodes]);
  const handB = Hand.solve([...holeB.map(cardCode), ...boardCodes]);
  const winners = Hand.winners([handA, handB]);

  let winner: Winner;
  if (winners.length === 2) winner = 'tie';
  else if (winners[0] === handA) winner = 'A';
  else winner = 'B';

  return {
    winner,
    a: { cards: holeA.map(cardView), name: handA.name, descr: handA.descr },
    b: { cards: holeB.map(cardView), name: handB.name, descr: handB.descr },
    board: community.map(cardView),
  };
}
