/**
 * Two-player mental-poker deck protocol built on SRA commutative encryption.
 *
 * The "padlock dance" has two phases:
 *
 *  Phase 1 — shuffle under a single global key each (hides the permutation):
 *    1. A: D1 = shuffle( encrypt(D0, KA) )          → sends to B
 *    2. B: D2 = shuffle( encrypt(D1, KB) )          → sends to A
 *       now D2[i] = D0[?]^(eA·eB) in a doubly-shuffled, unknown order.
 *
 *  Phase 2 — swap each global key for PER-CARD keys (enables selective reveal;
 *  positions are now fixed, no more shuffling):
 *    3. A: D3[i] = encrypt( decrypt(D2[i], KA), KA_i )   → sends to B   (keeps {KA_i})
 *    4. B: D4[i] = encrypt( decrypt(D3[i], KB), KB_i )   → keeps {KB_i}
 *       now D4[i] = D0[?]^(eA_i · eB_i): each position locked by exactly one
 *       per-card key from each player.
 *
 * Reveal at position i:
 *   - to A only (A's hole card): B hands A its share KB_i.d; A peels KB_i then KA_i.
 *   - to both (community card):  both publish their share; either peels both.
 *   - to B only (B's hole card): A hands B its share KA_i.d; B peels KA_i then KB_i.
 *
 * The relay server only ever moves these blobs; it holds no keys and sees no card.
 */
import { SraKey, generateKey, encrypt, decrypt, encryptAll, decryptAll } from './sra.js';
import { plaintextDeck, decodeCard, DECK_SIZE } from './cards.js';

/** Unbiased Fisher–Yates shuffle using the platform CSPRNG (Node 20+ / browser). */
export function secureShuffle<T>(arr: readonly T[]): T[] {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomIndex(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function randomIndex(n: number): number {
  // Rejection sampling for a uniform integer in [0, n).
  const max = Math.floor(0xffffffff / n) * n;
  const buf = new Uint32Array(1);
  let x = 0;
  do {
    globalThis.crypto.getRandomValues(buf);
    x = buf[0];
  } while (x >= max);
  return x % n;
}

/**
 * Deterministic shuffle whose permutation is fully determined by `seed`. This is the
 * fairness-critical primitive: a player commits keccak256(seed) ON-CHAIN before any
 * cards move, so they cannot re-pick their shuffle after seeing the opponent's deck.
 * Revealing `seed` lets the counterparty replay and verify the exact permutation.
 *
 * RNG: SplitMix64 keyed by a 64-bit digest of the seed bytes — deterministic across
 * Node and browser, adequate for binding a 52-card permutation (it is not, and need
 * not be, a secrecy mechanism; SRA encryption provides secrecy).
 */
export function seededShuffle<T>(arr: readonly T[], seed: Uint8Array): T[] {
  const a = arr.slice();
  let state = digest64(seed);
  const next = (): bigint => {
    // SplitMix64
    state = (state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return (z ^ (z >> 31n)) & MASK64;
  };
  const indexBelow = (n: bigint): number => {
    // rejection sampling over 64-bit range for a uniform [0,n)
    const limit = MASK64 - (MASK64 % n);
    let r: bigint;
    do {
      r = next();
    } while (r > limit);
    return Number(r % n);
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = indexBelow(BigInt(i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const MASK64 = (1n << 64n) - 1n;

function digest64(seed: Uint8Array): bigint {
  // FNV-1a 64-bit over the seed bytes — a deterministic, well-mixed key for SplitMix64.
  let h = 0xcbf29ce484222325n;
  for (const b of seed) {
    h ^= BigInt(b);
    h = (h * 0x100000001b3n) & MASK64;
  }
  return h;
}

/**
 * One participant's secret material + protocol steps. Each player constructs one of
 * these locally; keys never leave the instance until an explicit reveal share.
 */
export class Participant {
  globalKey!: SraKey;
  perCardKeys: SraKey[] = [];

  /** Generate this participant's global shuffle key. */
  async init(): Promise<void> {
    this.globalKey = await generateKey();
  }

  /**
   * Phase 1: encrypt the incoming deck under the global key and shuffle. If `seed` is
   * given the permutation is derived from it (commit-reveal fairness); otherwise a
   * fresh CSPRNG permutation is used (fine for isolated crypto tests).
   */
  encryptAndShuffle(deck: bigint[], seed?: Uint8Array): bigint[] {
    const encrypted = encryptAll(deck, this.globalKey);
    return seed ? seededShuffle(encrypted, seed) : secureShuffle(encrypted);
  }

  /**
   * Phase 2: remove the global lock and re-lock every position with a fresh per-card
   * key. Positions are now frozen. Must be called after init() and after this player
   * has already participated in phase 1.
   */
  async relock(deck: bigint[]): Promise<bigint[]> {
    const stripped = decryptAll(deck, this.globalKey); // peel our global lock
    this.perCardKeys = [];
    const out: bigint[] = new Array(deck.length);
    for (let i = 0; i < deck.length; i++) {
      const k = await generateKey();
      this.perCardKeys.push(k);
      out[i] = encrypt(stripped[i], k);
    }
    return out;
  }

  /** The decryption share that lets the *other* player peel our lock at position i. */
  revealShare(position: number): bigint {
    return this.perCardKeys[position].d;
  }

  /** Peel our own per-card lock at a position (we already removed the other's). */
  peelOwn(value: bigint, position: number): bigint {
    return decrypt(value, this.perCardKeys[position]);
  }
}

/** Peel a single lock given a raw decryption-share exponent `d`. */
export function peelWithShare(value: bigint, share: bigint): bigint {
  // decrypt() takes an SraKey; we only need d here.
  return decrypt(value, { e: 0n, d: share });
}

/**
 * Fully open a position for which BOTH players' shares are known (community card),
 * returning the card index. Order of peeling does not matter (commutativity).
 */
export function openCommunity(value: bigint, shareA: bigint, shareB: bigint): number {
  const once = peelWithShare(value, shareA);
  const twice = peelWithShare(once, shareB);
  return decodeCard(twice);
}

/** The canonical ordered plaintext deck (D0) every hand starts from. */
export function freshDeck(): bigint[] {
  return plaintextDeck();
}

export { DECK_SIZE };
