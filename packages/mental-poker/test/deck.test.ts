import { describe, it, expect } from 'vitest';
import {
  Participant,
  freshDeck,
  peelWithShare,
  openCommunity,
  seededShuffle,
} from '../src/deck.js';
import { decodeCard } from '../src/cards.js';

describe('seeded shuffle (commit-reveal fairness)', () => {
  it('is deterministic for a given seed and differs across seeds', () => {
    const seedA = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const seedB = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2]);
    const deck = Array.from({ length: 52 }, (_, i) => BigInt(i));
    const s1 = seededShuffle(deck, seedA);
    const s2 = seededShuffle(deck, seedA);
    const s3 = seededShuffle(deck, seedB);
    expect(s1).toEqual(s2); // same seed -> same permutation (verifiable replay)
    expect(s1).not.toEqual(s3); // different seed -> different permutation
    expect([...s1].sort((a, b) => Number(a - b))).toEqual(deck); // still a permutation
  });
});

/**
 * Drives the full two-party padlock dance and a deal, asserting:
 *  - the dealt cards are 9 distinct valid cards (2+2 hole, 5 community)
 *  - a hole card is readable by its owner but NOT by the opponent (secrecy)
 *  - community cards open identically regardless of peel order (commutativity)
 */
describe('mental-poker deck protocol (padlock dance + selective reveal)', () => {
  it('shuffles, relocks, and deals distinct valid cards', async () => {
    const A = new Participant();
    const B = new Participant();
    await A.init();
    await B.init();

    const D0 = freshDeck();
    const D1 = A.encryptAndShuffle(D0);
    const D2 = B.encryptAndShuffle(D1);
    const D3 = await A.relock(D2);
    const D4 = await B.relock(D3);

    expect(D4.length).toBe(52);

    // Deal: pos 0,1 -> A hole; 2,3 -> B hole; 4..8 -> community.
    const aHolePos = [0, 1];
    const bHolePos = [2, 3];
    const communityPos = [4, 5, 6, 7, 8];

    // A reads its own hole cards: opponent (B) supplies its share, A peels both locks.
    const aHole = aHolePos.map((pos) => {
      const afterB = peelWithShare(D4[pos], B.revealShare(pos));
      return decodeCard(A.peelOwn(afterB, pos));
    });

    // B reads its own hole cards.
    const bHole = bHolePos.map((pos) => {
      const afterA = peelWithShare(D4[pos], A.revealShare(pos));
      return decodeCard(B.peelOwn(afterA, pos));
    });

    // Community: both shares known.
    const board = communityPos.map((pos) =>
      openCommunity(D4[pos], A.revealShare(pos), B.revealShare(pos)),
    );

    const all = [...aHole, ...bHole, ...board];
    // all valid card indices
    for (const c of all) expect(c).toBeGreaterThanOrEqual(0), expect(c).toBeLessThan(52);
    // all distinct
    expect(new Set(all).size).toBe(9);
  });

  it('keeps a hole card secret from the opponent', async () => {
    const A = new Participant();
    const B = new Participant();
    await A.init();
    await B.init();

    const D4 = await B.relock(await A.relock(B.encryptAndShuffle(A.encryptAndShuffle(freshDeck()))));

    // Position 2 is B's hole card. B can read it (with A's share + own key).
    const pos = 2;
    const bReads = decodeCard(B.peelOwn(peelWithShare(D4[pos], A.revealShare(pos)), pos));
    expect(bReads).toBeGreaterThanOrEqual(0);
    expect(bReads).toBeLessThan(52);

    // A, WITHOUT B's share, cannot recover a valid card: peeling only A's own lock
    // leaves it still encrypted under B's per-card key, so decode must fail.
    const aOnlyPeel = A_peelOnlyOwn(A, D4[pos], pos);
    expect(() => decodeCard(aOnlyPeel)).toThrow();
  });

  it('community card opens identically regardless of peel order', async () => {
    const A = new Participant();
    const B = new Participant();
    await A.init();
    await B.init();
    const D4 = await B.relock(await A.relock(B.encryptAndShuffle(A.encryptAndShuffle(freshDeck()))));

    const pos = 6;
    const ab = openCommunity(D4[pos], A.revealShare(pos), B.revealShare(pos));
    // peel B first then A — must match
    const ba = decodeCard(peelWithShare(peelWithShare(D4[pos], B.revealShare(pos)), A.revealShare(pos)));
    expect(ab).toBe(ba);
  });
});

// helper: A peels only its own per-card lock (simulating a cheat with no B share)
function A_peelOnlyOwn(A: Participant, value: bigint, pos: number): bigint {
  return A.peelOwn(value, pos);
}
