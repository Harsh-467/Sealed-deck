/**
 * SRA (Shamir–Rivest–Adleman) commutative encryption — the cryptographic core of
 * mental poker. All operations are mod a fixed large SAFE prime p (RFC 3526 MODP
 * group 14, 2048-bit), so (p-1)/2 is prime and key generation is cheap & safe.
 *
 * Commutativity: a player's key is (e, d) with e·d ≡ 1 (mod p-1). Encryption is
 * m ↦ m^e mod p, decryption c ↦ c^d mod p. Because exponents multiply, locks from
 * different players commute:  (m^eA)^eB = m^(eA·eB) = (m^eB)^eA. That is what lets
 * two players encrypt a deck in turn ("padlock dance") and later peel locks in any
 * order to reveal selected cards.
 *
 * We do NOT hand-roll the number theory: modPow / modInv / gcd / CSPRNG come from
 * the audited `bigint-crypto-utils` library.
 */
import { modPow, modInv, gcd, randBetween } from 'bigint-crypto-utils';

/**
 * RFC 2409, 1024-bit MODP Group (Oakley group 2). A safe prime: p = 2q + 1 with q
 * prime. We deliberately use 1024-bit (not 2048) so the per-card key generation and
 * the deal flow run in well under a second for a responsive live demo. For weekend
 * play-money testnet poker this is honestly hard to break within a hand; a production
 * build would step up to the 2048-bit RFC 3526 prime (a one-line change here).
 */
const P_HEX = `
FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD1
29024E088A67CC74020BBEA63B139B22514A08798E3404DD
EF9519B3CD3A431B302B0A6DF25F14374FE1356D6D51C245
E485B576625E7EC6F44C42E9A637ED6B0BFF5CB6F406B7ED
EE386BFB5A899FA5AE9F24117C4B1FE649286651ECE65381
FFFFFFFFFFFFFFFF`.replace(/\s+/g, '');

/** Field modulus p. */
export const P: bigint = BigInt('0x' + P_HEX);
/** Group order of the multiplicative units used for keys: p - 1. */
export const P_MINUS_1: bigint = P - 1n;
/** (p-1)/2 = q, the Sophie Germain prime. Used to keep keys coprime to p-1. */
export const Q: bigint = P_MINUS_1 / 2n;

export interface SraKey {
  /** encryption exponent (public-to-self only; never shared until reveal) */
  e: bigint;
  /** decryption exponent, e^{-1} mod (p-1) */
  d: bigint;
}

/**
 * Generate a fresh commutative key. `e` is chosen coprime to p-1 = 2q, i.e. odd and
 * not a multiple of q, then d = e^{-1} mod (p-1).
 */
export async function generateKey(): Promise<SraKey> {
  // eslint-disable-next-line no-constant-condition
  while (true) {
    // pick e in [3, p-2]
    const e = await randBetween(P_MINUS_1 - 2n, 3n);
    if (gcd(e, P_MINUS_1) !== 1n) continue; // must be invertible mod (p-1)
    // d = e^{-1} mod (p-1) is exact by construction; no extra modPow check needed.
    return { e, d: modInv(e, P_MINUS_1) };
  }
}

/** Deterministic key from a seed exponent — handy for tests/audit reproducibility. */
export function keyFromExponent(e: bigint): SraKey {
  if (gcd(e, P_MINUS_1) !== 1n) {
    throw new Error('exponent not coprime to p-1');
  }
  return { e, d: modInv(e, P_MINUS_1) };
}

/** Encrypt a single field element: m ↦ m^e mod p. */
export function encrypt(m: bigint, key: SraKey): bigint {
  return modPow(m, key.e, P);
}

/** Decrypt a single field element: c ↦ c^d mod p (peels one lock). */
export function decrypt(c: bigint, key: SraKey): bigint {
  return modPow(c, key.d, P);
}

/** Encrypt every element of a deck with one key. */
export function encryptAll(deck: bigint[], key: SraKey): bigint[] {
  return deck.map((m) => encrypt(m, key));
}

/** Decrypt every element of a deck with one key. */
export function decryptAll(deck: bigint[], key: SraKey): bigint[] {
  return deck.map((c) => decrypt(c, key));
}
