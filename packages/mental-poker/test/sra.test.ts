import { describe, it, expect } from 'vitest';
import {
  generateKey,
  keyFromExponent,
  encrypt,
  decrypt,
  P,
} from '../src/sra.js';
import { encodeCard, decodeCard, plaintextDeck } from '../src/cards.js';

describe('SRA commutative encryption', () => {
  it('e and d are inverses: decrypt(encrypt(m)) === m', async () => {
    const k = await generateKey();
    const m = encodeCard(17);
    expect(decrypt(encrypt(m, k), k)).toBe(m);
  });

  it('encryption commutes: (m^eA)^eB === (m^eB)^eA', async () => {
    const A = await generateKey();
    const B = await generateKey();
    const m = encodeCard(42);
    const ab = encrypt(encrypt(m, A), B);
    const ba = encrypt(encrypt(m, B), A);
    expect(ab).toBe(ba);
  });

  it('locks peel in ANY order back to the plaintext', async () => {
    const A = await generateKey();
    const B = await generateKey();
    const m = encodeCard(7);
    const locked = encrypt(encrypt(m, A), B); // A then B
    // peel A first, then B
    expect(decrypt(decrypt(locked, A), B)).toBe(m);
    // peel B first, then A
    expect(decrypt(decrypt(locked, B), A)).toBe(m);
  });

  it('card round-trips through a full double-lock and back', async () => {
    const A = await generateKey();
    const B = await generateKey();
    for (let idx = 0; idx < 52; idx++) {
      const m = encodeCard(idx);
      const locked = encrypt(encrypt(m, A), B);
      const opened = decrypt(decrypt(locked, B), A);
      expect(decodeCard(opened)).toBe(idx);
    }
  });

  it('all 52 encoded cards are distinct and in-field', () => {
    const deck = plaintextDeck();
    const set = new Set(deck.map((x) => x.toString()));
    expect(set.size).toBe(52);
    for (const m of deck) {
      expect(m > 0n && m < P).toBe(true);
    }
  });

  it('deterministic keys from exponents reproduce the same ciphertext', () => {
    const k1 = keyFromExponent(65537n);
    const k2 = keyFromExponent(65537n);
    const m = encodeCard(3);
    expect(encrypt(m, k1)).toBe(encrypt(m, k2));
    expect(decrypt(encrypt(m, k1), k2)).toBe(m);
  });
});
