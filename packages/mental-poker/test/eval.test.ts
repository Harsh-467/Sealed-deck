import { describe, it, expect } from 'vitest';
import { evaluateShowdown } from '../src/eval.js';
import { cardCode } from '../src/cards.js';

// Index helpers: rank 0..12 (2..A), suit 0..3 (s,h,d,c) -> idx = suit*13 + rank
const card = (rank: number, suit: number) => suit * 13 + rank;
const A_ = 12, K_ = 11, Q_ = 10, J_ = 9, T_ = 8, TWO = 0, THREE = 1;
const S = 0, H = 1, D = 2, C = 3;

describe('showdown evaluation (pokersolver)', () => {
  it('royal flush beats a low pair', () => {
    const holeA = [card(A_, S), card(K_, S)]; // As Ks
    const holeB = [card(TWO, C), card(TWO, D)]; // 2c 2d
    const board = [card(Q_, S), card(J_, S), card(T_, S), card(TWO, H), card(THREE, D)];
    const r = evaluateShowdown(holeA, holeB, board);
    expect(r.winner).toBe('A');
    expect(r.a.name).toMatch(/Royal Flush|Straight Flush/);
  });

  it('detects a tie when both play the board', () => {
    // Both hold low offsuit cards that can't beat a board straight A-high.
    const holeA = [card(TWO, C), card(THREE, D)];
    const holeB = [card(TWO, H), card(THREE, S)];
    const board = [card(T_, S), card(J_, H), card(Q_, D), card(K_, C), card(A_, S)]; // T J Q K A straight
    const r = evaluateShowdown(holeA, holeB, board);
    expect(r.winner).toBe('tie');
  });

  it('produces valid pokersolver codes', () => {
    expect(cardCode(card(A_, S))).toBe('As');
    expect(cardCode(card(TWO, C))).toBe('2c');
    expect(cardCode(card(T_, D))).toBe('Td');
  });
});
