/**
 * Client-side mental-poker engine. Holds THIS player's secret material (shuffle seed,
 * SRA global key, per-card keys) and drives the padlock dance in response to relay
 * messages. The relay never sees any of this — only the resulting ciphertext blobs and
 * single lock-shares pass through it.
 */
import {
  Participant,
  freshDeck,
  peelWithShare,
  decodeCard,
  type ShuffleStage,
} from '@sealed-deck/mental-poker';
import { keccak256, toHex, type Hex } from 'viem';

const enc = (deck: bigint[]): string[] => deck.map((x) => x.toString());
const dec = (deck: string[]): bigint[] => deck.map((s) => BigInt(s));

export class GameCrypto {
  seed: Uint8Array | null = null;
  private participant = new Participant();
  private inited = false;
  finalDeck: bigint[] | null = null;
  myHolePositions: number[] = [];
  /** position -> decoded card index, for every card this player is entitled to see. */
  revealed = new Map<number, number>();

  /** Generate (once) this hand's shuffle seed and return its on-chain commitment. */
  ensureSeed(): { seedHex: Hex; commitment: Hex } {
    if (!this.seed) {
      this.seed = crypto.getRandomValues(new Uint8Array(32));
    }
    const seedHex = toHex(this.seed);
    return { seedHex, commitment: keccak256(seedHex) };
  }

  seedHex(): Hex {
    if (!this.seed) throw new Error('no seed');
    return toHex(this.seed);
  }

  private async ensureInit(): Promise<void> {
    if (!this.inited) {
      await this.participant.init();
      this.inited = true;
    }
  }

  // Idempotency caches: re-processing the same stage (e.g. after a reconnect or a
  // duplicate relay) must NOT regenerate keys — that would corrupt the deck. We cache
  // each stage's output and replay it verbatim.
  private encA: string[] | null = null;
  private stageOut = new Map<ShuffleStage, { stage: ShuffleStage; deck: string[] } | null>();

  /** Seat 0 begins the dance. Returns the encShuffleA deck to send (cached/idempotent). */
  async startShuffle(): Promise<string[]> {
    this.ensureSeed();
    await this.ensureInit();
    if (!this.encA) this.encA = enc(this.participant.encryptAndShuffle(freshDeck(), this.seed!));
    return this.encA;
  }

  /**
   * Handle an incoming shuffle stage. Returns the next stage to broadcast (or null if
   * this stage produced the final deck for us). Idempotent per stage.
   */
  async onShuffle(
    stage: ShuffleStage,
    deck: string[],
  ): Promise<{ stage: ShuffleStage; deck: string[] } | null> {
    if (this.stageOut.has(stage)) return this.stageOut.get(stage)!;
    const d = dec(deck);
    let out: { stage: ShuffleStage; deck: string[] } | null = null;
    switch (stage) {
      case 'encShuffleA': {
        // we are seat 1: add our global lock + seeded shuffle
        this.ensureSeed();
        await this.ensureInit();
        if (!this.encA) this.encA = enc(this.participant.encryptAndShuffle(d, this.seed!));
        out = { stage: 'encShuffleB', deck: this.encA };
        break;
      }
      case 'encShuffleB': {
        // we are seat 0: strip global, add per-card locks
        out = { stage: 'relockA', deck: enc(await this.participant.relock(d)) };
        break;
      }
      case 'relockA': {
        // we are seat 1: strip global, add per-card locks -> final deck
        const d4 = await this.participant.relock(d);
        this.finalDeck = d4;
        out = { stage: 'relockB', deck: enc(d4) };
        break;
      }
      case 'relockB': {
        // we are seat 0: this is the final double-locked deck
        this.finalDeck = d;
        out = null;
        break;
      }
    }
    this.stageOut.set(stage, out);
    return out;
  }

  setHolePositions(positions: number[]): void {
    this.myHolePositions = positions;
  }

  /** Our decryption shares for the given positions (to hand to the opponent/relay). */
  sharesFor(positions: number[]): { position: number; share: string }[] {
    return positions.map((p) => ({ position: p, share: this.participant.revealShare(p).toString() }));
  }

  /** A share arrived from the opponent for `position`; peel both locks and decode. */
  onShare(position: number, share: string): number | null {
    if (!this.finalDeck) return null;
    if (this.revealed.has(position)) return this.revealed.get(position)!;
    try {
      const afterOther = peelWithShare(this.finalDeck[position], BigInt(share));
      const plain = this.participant.peelOwn(afterOther, position);
      const idx = decodeCard(plain);
      this.revealed.set(position, idx);
      return idx;
    } catch {
      return null; // not enough/again-consistent shares yet
    }
  }

  holeCards(): number[] {
    return this.myHolePositions.map((p) => this.revealed.get(p)).filter((x): x is number => x != null);
  }

  holeReady(): boolean {
    return this.myHolePositions.length === 2 && this.holeCards().length === 2;
  }

  reset(): void {
    this.seed = null;
    this.participant = new Participant();
    this.inited = false;
    this.finalDeck = null;
    this.myHolePositions = [];
    this.revealed = new Map();
  }
}
