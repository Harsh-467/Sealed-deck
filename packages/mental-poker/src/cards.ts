/**
 * Card model: a deck is the integers 0..51.
 *   rank = idx % 13   (0='2' … 12='A')
 *   suit = idx / 13   (0='s' spades, 1='h' hearts, 2='d' diamonds, 3='c' clubs)
 *
 * For SRA each card must be a quadratic residue mod p, otherwise the Legendre symbol
 * could leak information through encryption. We encode card `idx` as (idx+2)^2 mod p,
 * which is a QR by construction and—because the bases 2..53 are tiny relative to p—
 * collision-free, so decoding is an exact reverse lookup.
 */
import { P } from './sra.js';

export const DECK_SIZE = 52;

const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'] as const;
const SUITS = ['s', 'h', 'd', 'c'] as const;
const SUIT_NAMES = ['Spades', 'Hearts', 'Diamonds', 'Clubs'] as const;

export interface CardView {
  index: number;
  /** pokersolver short code, e.g. "As", "Td", "2c" */
  code: string;
  rank: string;
  suit: string;
  suitName: string;
}

export function cardCode(idx: number): string {
  if (idx < 0 || idx >= DECK_SIZE) throw new Error(`bad card index ${idx}`);
  return RANKS[idx % 13] + SUITS[Math.floor(idx / 13)];
}

export function cardView(idx: number): CardView {
  const rank = RANKS[idx % 13];
  const suitIdx = Math.floor(idx / 13);
  return {
    index: idx,
    code: rank + SUITS[suitIdx],
    rank,
    suit: SUITS[suitIdx],
    suitName: SUIT_NAMES[suitIdx],
  };
}

/** Plaintext field element for a card index (a quadratic residue mod p). */
export function encodeCard(idx: number): bigint {
  if (idx < 0 || idx >= DECK_SIZE) throw new Error(`bad card index ${idx}`);
  const base = BigInt(idx + 2);
  return (base * base) % P;
}

/** The canonical, un-encrypted, ordered deck as field elements. */
export function plaintextDeck(): bigint[] {
  return Array.from({ length: DECK_SIZE }, (_, i) => encodeCard(i));
}

const DECODE = new Map<bigint, number>();
for (let i = 0; i < DECK_SIZE; i++) DECODE.set(encodeCard(i), i);

/** Reverse a fully-decrypted field element back to its card index. */
export function decodeCard(m: bigint): number {
  const idx = DECODE.get(m);
  if (idx === undefined) throw new Error('value is not a valid card (wrong keys?)');
  return idx;
}
