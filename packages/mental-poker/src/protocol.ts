/**
 * Wire protocol shared by the relay server and the browser clients.
 *
 * Design invariant — the server is a RELAY and never learns a secret card:
 *  - hole-card reveal shares are forwarded to ONE recipient only (the owner), so the
 *    server only ever holds one of the two locks on a private card and cannot read it;
 *  - community/showdown cards are public anyway, so relaying both shares is fine.
 *  - all card secrecy/decoding happens client-side via @sealed-deck/mental-poker.
 *
 * Money/turn truth lives ON-CHAIN (PokerTable). The server mirrors chain events for
 * instant UX and orchestrates the off-chain card protocol around each street.
 */

/** Public per-hand phases (a strict, illegal-transition-proof FSM). */
export type Phase =
  | 'lobby' // waiting for 2 players to join (on-chain)
  | 'commit' // both joined; posting shuffle commitments (on-chain)
  | 'shuffle' // padlock dance over WS (encrypt+shuffle, then per-card relock)
  | 'deal' // exchanging reveal shares for hole cards
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown' // seeds + remaining shares revealed; winner computed; signing settlement
  | 'settled' // pot paid on-chain
  | 'aborted'; // timeout/slash or void

export interface PlayerView {
  seat: 0 | 1;
  address: string | null;
  connected: boolean;
  committed: boolean;
  revealed: boolean;
  /** wei strings (from chain) */
  stack: string;
  contributed: string;
}

export interface PublicState {
  tableId: string;
  contractAddress: string | null;
  chainId: number;
  phase: Phase;
  buyIn: string;
  smallBlind: string;
  bigBlind: string;
  pot: string;
  currentBet: string;
  street: number; // 0..3
  toActSeat: 0 | 1 | null;
  players: PlayerView[];
  /** keccak256 shuffle commitments for the fairness panel (hex or null). */
  commitments: (string | null)[];
  /** revealed shuffle seeds (hex) once players reveal at showdown. */
  seeds: (string | null)[];
  /** revealed community card indices; null = still sealed. length 5. */
  board: (number | null)[];
  /** populated at showdown. */
  result: ShowdownPublic | null;
  /** your seat (filled per-connection on send). */
  youSeat: 0 | 1 | null;
}

export interface ShowdownPublic {
  winnerSeat: 0 | 1 | 'tie';
  handName: string;
  description: string;
  /** opponent hole cards become public at showdown. */
  holeBySeat: [number[], number[]];
  settleTxHash: string | null;
}

/** Stage labels for the off-chain padlock dance. */
export type ShuffleStage = 'encShuffleA' | 'encShuffleB' | 'relockA' | 'relockB';

// --------------------------- client -> server ---------------------------- //

export type ClientMessage =
  | { t: 'hello'; tableId: string; address: string }
  | { t: 'shuffle'; stage: ShuffleStage; deck: string[] } // bigints as decimal strings
  | { t: 'dealReady' } // client finished local deal/hole-card read
  | { t: 'revealShare'; toSeat: 0 | 1; position: number; share: string }
  | { t: 'revealSeed'; seed: string } // shuffle seed (hex) for fairness panel
  | { t: 'showdownHole'; hole: number[] } // owner publishes its cards at showdown
  | { t: 'settleSig'; winnerSeat: 0 | 1 | 'tie'; nonce: string; sig: string } // EIP-712 settlement sig
  | { t: 'chatPing' }; // keep-alive / presence

// --------------------------- server -> client ---------------------------- //

export type ServerMessage =
  | { t: 'state'; state: PublicState }
  | { t: 'seat'; seat: 0 | 1 }
  | { t: 'shuffle'; stage: ShuffleStage; deck: string[]; fromSeat: 0 | 1 }
  | { t: 'startShuffle' } // server tells seat 0 to begin the dance
  | { t: 'dealHole'; positions: number[] } // your hole-card positions in the final deck
  | { t: 'revealShare'; fromSeat: 0 | 1; position: number; share: string }
  | { t: 'needShares'; positions: number[]; forPhase: Phase } // reveal these to opponent/community
  | { t: 'settleSig'; fromSeat: 0 | 1; winnerSeat: 0 | 1 | 'tie'; nonce: string; sig: string }
  | { t: 'error'; message: string }
  | { t: 'info'; message: string };

/** Card position layout in the final 52-card deck after the dance (fixed by convention). */
export const LAYOUT = {
  holeSeat0: [0, 1],
  holeSeat1: [2, 3],
  flop: [4, 5, 6],
  turn: [7],
  river: [8],
} as const;
