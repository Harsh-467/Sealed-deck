/**
 * One Room = one PokerTable hand. It owns the two WebSocket connections, mirrors
 * on-chain truth, orchestrates the off-chain padlock dance + street reveals, and
 * relays opaque card blobs. It never holds a key and can never read a private card
 * (it only ever forwards ONE of the two locks on a hole card).
 */
import type { WebSocket } from 'ws';
import {
  type ClientMessage,
  type ServerMessage,
  type PublicState,
  type Phase,
  type PlayerView,
  type ShuffleStage,
  LAYOUT,
  evaluateShowdown,
  openCommunity,
} from '@sealed-deck/mental-poker';
import { TableChain, type ChainState } from './chain.js';
import { config } from './config.js';

type Seat = 0 | 1;

// PokerTable.State enum order.
const S = { Open: 0, Committing: 1, Betting: 2, Revealing: 3, Settled: 4, Voided: 5 } as const;

const SHUFFLE_SEQ: ShuffleStage[] = ['encShuffleA', 'encShuffleB', 'relockA', 'relockB'];
const SHUFFLE_SENDER: Record<ShuffleStage, Seat> = {
  encShuffleA: 0,
  encShuffleB: 1,
  relockA: 0,
  relockB: 1,
};

interface Conn {
  ws: WebSocket;
  seat: Seat;
  address: string;
}

export class Room {
  readonly tableId: string;
  private chain: TableChain;
  private conns: (Conn | null)[] = [null, null];
  // Connections whose wallet hasn't appeared in the on-chain players[] yet. They are
  // promoted to a real seat by reconcileSeats() once their joinTable() is observed.
  private pending: { ws: WebSocket; address: string }[] = [];

  private chainState: ChainState | null = null;

  // --- off-chain progress ---
  private nextStage = 0; // index into SHUFFLE_SEQ
  private finalDeck: string[] | null = null; // D4 ciphertext blobs (opaque to server)
  private dealReady: [boolean, boolean] = [false, false];
  private dealRequested = false;
  private board: (number | null)[] = [null, null, null, null, null];
  private communityShares: Map<number, [bigint | null, bigint | null]> = new Map();
  private revealRequestedForStreet = -1;
  private seeds: [string | null, string | null] = [null, null];
  private showHole: [number[] | null, number[] | null] = [null, null];
  private result: PublicState['result'] = null;
  private settleTxHash: string | null = null;

  private poll: NodeJS.Timeout | null = null;

  constructor(tableId: string) {
    this.tableId = tableId.toLowerCase();
    this.chain = new TableChain(this.tableId);
    this.chain.watch((name, args) => this.onChainEvent(name, args));
    this.poll = setInterval(() => void this.refresh(), 4000);
    void this.refresh();
  }

  // ----------------------------- connections ----------------------------- //

  async attach(ws: WebSocket, address: string): Promise<void> {
    await this.refresh();
    const addr = address.toLowerCase();

    ws.on('close', () => {
      for (const s of [0, 1] as Seat[]) if (this.conns[s]?.ws === ws) this.conns[s] = null;
      this.pending = this.pending.filter((p) => p.ws !== ws);
      this.broadcastState();
    });

    const seat = this.seatOf(addr);
    console.log(
      `[room ${short(this.tableId)}] attach ${short(addr)} -> seat ${seat ?? 'PENDING'} ` +
        `(chain players: ${this.chainState?.players.map((p) => (p ? short(p) : '—')).join(', ')})`,
    );

    if (seat === null) {
      // Wallet connected before its joinTable() is on-chain. Remember it and stream state;
      // reconcileSeats() promotes it to a seat as soon as the join is observed.
      this.pending.push({ ws, address: addr });
      send(ws, { t: 'info', message: 'Waiting to be seated — take a seat on-chain.' });
      this.sendState(ws, null);
      return;
    }
    this.seatConn(ws, addr, seat);
    this.maybeOrchestrate();
  }

  /** Wire a connection into a concrete seat. */
  private seatConn(ws: WebSocket, addr: string, seat: Seat): void {
    this.conns[seat]?.ws.close(); // replace any stale connection for this seat
    const conn: Conn = { ws, seat, address: addr };
    this.conns[seat] = conn;
    send(ws, { t: 'seat', seat });
    ws.on('message', (raw) => void this.handle(conn, raw.toString()));
    this.broadcastState();
  }

  /** Promote any pending connection whose wallet now appears in players[]. */
  private reconcileSeats(): void {
    if (this.pending.length === 0) return;
    const still: { ws: WebSocket; address: string }[] = [];
    for (const p of this.pending) {
      if (p.ws.readyState !== p.ws.OPEN) continue;
      const seat = this.seatOf(p.address);
      if (seat === null) {
        still.push(p);
      } else {
        console.log(`[room ${short(this.tableId)}] promoted ${short(p.address)} -> seat ${seat}`);
        this.seatConn(p.ws, p.address, seat);
      }
    }
    this.pending = still;
  }

  private seatOf(addr: string): Seat | null {
    const p = this.chainState?.players ?? [null, null];
    if (p[0] === addr) return 0;
    if (p[1] === addr) return 1;
    return null;
  }

  isEmpty(): boolean {
    return this.conns[0] === null && this.conns[1] === null;
  }

  dispose(): void {
    if (this.poll) clearInterval(this.poll);
    this.chain.stop();
  }

  // --------------------------- client messages --------------------------- //

  private async handle(conn: Conn, raw: string): Promise<void> {
    let msg: ClientMessage;
    try {
      msg = JSON.parse(raw) as ClientMessage;
    } catch {
      return send(conn.ws, { t: 'error', message: 'bad json' });
    }

    switch (msg.t) {
      case 'hello':
        await this.refresh();
        this.broadcastState();
        this.maybeOrchestrate();
        break;

      case 'shuffle':
        this.onShuffle(conn, msg.stage, msg.deck);
        break;

      case 'revealShare':
        // Forward exactly one lock-share to the intended recipient (hole-card deal).
        this.toSeat(msg.toSeat, {
          t: 'revealShare',
          fromSeat: conn.seat,
          position: msg.position,
          share: msg.share,
        });
        // If it's a community position, the server also collects shares to decode the board.
        this.collectCommunityShare(conn.seat, msg.position, msg.share);
        break;

      case 'dealReady':
        this.dealReady[conn.seat] = true;
        this.broadcastState();
        break;

      case 'revealSeed':
        this.seeds[conn.seat] = msg.seed;
        this.broadcastState();
        break;

      case 'showdownHole':
        this.showHole[conn.seat] = msg.hole;
        this.tryComputeResult();
        this.broadcastState();
        break;

      case 'settleSig': {
        // Relay this player's settlement signature to the other seat (who submits).
        const other: Seat = conn.seat === 0 ? 1 : 0;
        this.toSeat(other, {
          t: 'settleSig',
          fromSeat: conn.seat,
          winnerSeat: msg.winnerSeat,
          nonce: msg.nonce,
          sig: msg.sig,
        });
        break;
      }

      case 'chatPing':
        break;
    }
  }

  // ------------------------------ shuffle -------------------------------- //

  private onShuffle(conn: Conn, stage: ShuffleStage, deck: string[]): void {
    const expected = SHUFFLE_SEQ[this.nextStage];
    console.log(`[room ${short(this.tableId)}] shuffle '${stage}' from seat${conn.seat} (expected '${expected}')`);
    if (stage !== expected || SHUFFLE_SENDER[stage] !== conn.seat) {
      console.warn(`[room ${short(this.tableId)}] REJECT shuffle '${stage}' from seat${conn.seat}`);
      return send(conn.ws, { t: 'error', message: `unexpected shuffle stage ${stage}` });
    }
    const other: Seat = conn.seat === 0 ? 1 : 0;

    if (stage === 'relockB') {
      // Final double-locked deck. Opaque to the server.
      this.finalDeck = deck;
      // seat1 produced it; make sure seat0 also receives it.
      this.toSeat(0, { t: 'shuffle', stage, deck, fromSeat: 1 });
      this.nextStage = SHUFFLE_SEQ.length;
      this.requestDeal();
    } else {
      this.toSeat(other, { t: 'shuffle', stage, deck, fromSeat: conn.seat });
      this.nextStage++;
    }
    this.broadcastState();
  }

  private startShuffleIfNeeded(): void {
    if (this.nextStage === 0 && !this.finalDeck) {
      const have0 = this.conns[0] !== null;
      console.log(`[room ${short(this.tableId)}] kick shuffle -> seat0 (connected=${have0})`);
      this.toSeat(0, { t: 'startShuffle' });
    }
  }

  // -------------------------------- deal --------------------------------- //

  private requestDeal(): void {
    if (this.dealRequested) return;
    this.dealRequested = true;
    console.log(`[room ${short(this.tableId)}] final deck ready -> dealing hole cards`);
    // Tell each seat its hole positions, and ask each to send the OPPONENT their
    // share for the opponent's hole positions.
    this.toSeat(0, { t: 'dealHole', positions: [...LAYOUT.holeSeat0] });
    this.toSeat(1, { t: 'dealHole', positions: [...LAYOUT.holeSeat1] });
    this.toSeat(0, { t: 'needShares', positions: [...LAYOUT.holeSeat1], forPhase: 'deal' });
    this.toSeat(1, { t: 'needShares', positions: [...LAYOUT.holeSeat0], forPhase: 'deal' });
  }

  // --------------------------- community reveal -------------------------- //

  private requestStreetReveal(street: number): void {
    if (this.revealRequestedForStreet >= street) return;
    this.revealRequestedForStreet = street;
    let positions: number[] = [];
    if (street === 1) positions = [...LAYOUT.flop];
    else if (street === 2) positions = [...LAYOUT.turn];
    else if (street === 3) positions = [...LAYOUT.river];
    if (positions.length === 0) return;
    // Both players publish their shares for the community positions (public cards).
    const phase = street === 1 ? 'flop' : street === 2 ? 'turn' : 'river';
    for (const seat of [0, 1] as Seat[]) {
      this.toSeat(seat, { t: 'needShares', positions, forPhase: phase as Phase });
    }
  }

  private collectCommunityShare(seat: Seat, position: number, share: string): void {
    const communityPositions: number[] = [...LAYOUT.flop, ...LAYOUT.turn, ...LAYOUT.river];
    if (!communityPositions.includes(position)) return;
    const entry = this.communityShares.get(position) ?? [null, null];
    entry[seat] = BigInt(share);
    this.communityShares.set(position, entry);
    // Also forward to the other player so they can decode the public card.
    const other: Seat = seat === 0 ? 1 : 0;
    this.toSeat(other, { t: 'revealShare', fromSeat: seat, position, share });

    if (entry[0] !== null && entry[1] !== null && this.finalDeck) {
      try {
        const idx = openCommunity(BigInt(this.finalDeck[position]), entry[0], entry[1]);
        const boardIdx = communityPositions.indexOf(position);
        this.board[boardIdx] = idx;
        this.broadcastState();
      } catch {
        /* shares not yet consistent; ignore */
      }
    }
  }

  // ------------------------------ showdown ------------------------------- //

  private tryComputeResult(): void {
    if (this.result) return;
    const [h0, h1] = this.showHole;
    if (!h0 || !h1) return;
    if (this.board.some((b) => b === null)) return;
    const board = this.board as number[];
    const r = evaluateShowdown(h0, h1, board);
    const winnerSeat = r.winner === 'A' ? 0 : r.winner === 'B' ? 1 : 'tie';
    const won = r.winner === 'A' ? r.a : r.winner === 'B' ? r.b : r.a;
    this.result = {
      winnerSeat,
      handName: won.name,
      description: won.descr,
      holeBySeat: [h0, h1],
      settleTxHash: this.settleTxHash,
    };
  }

  // ---------------------------- chain events ----------------------------- //

  private onChainEvent(name: string, args: Record<string, unknown>): void {
    if (name === 'Settled' || name === 'Slashed') {
      // capture the settlement tx if present on the log (filled in refresh too)
    }
    void this.refresh();
  }

  private async refresh(): Promise<void> {
    const prev = this.chainState;
    this.chainState = await this.chain.readState();
    // Seat anyone who has now joined on-chain, then run state-driven orchestration.
    this.reconcileSeats();
    this.maybeOrchestrate();
    if (
      !prev ||
      prev.state !== this.chainState.state ||
      prev.street !== this.chainState.street ||
      prev.pot !== this.chainState.pot ||
      prev.toAct !== this.chainState.toAct
    ) {
      this.broadcastState();
    }
  }

  private maybeOrchestrate(): void {
    const cs = this.chainState;
    if (!cs) return;
    if (cs.state === S.Betting) {
      if (!this.finalDeck) {
        this.startShuffleIfNeeded();
      } else if (this.dealReady[0] && this.dealReady[1]) {
        // betting underway; reveal community cards as streets advance
        this.requestStreetReveal(cs.street);
      }
    }
    if (cs.state === S.Revealing) {
      // showdown: ask both to reveal seeds + hole cards (idempotent on client)
      for (const seat of [0, 1] as Seat[]) {
        this.toSeat(seat, { t: 'info', message: 'showdown' });
      }
      this.tryComputeResult();
    }
  }

  // ------------------------------- state --------------------------------- //

  private derivePhase(cs: ChainState): Phase {
    switch (cs.state) {
      case S.Open:
        return 'lobby';
      case S.Committing:
        return 'commit';
      case S.Betting:
        if (!this.finalDeck) return 'shuffle';
        if (!(this.dealReady[0] && this.dealReady[1])) return 'deal';
        return (['preflop', 'flop', 'turn', 'river'] as Phase[])[cs.street] ?? 'preflop';
      case S.Revealing:
        return 'showdown';
      case S.Settled:
        return 'settled';
      case S.Voided:
        return 'aborted';
      default:
        return 'lobby';
    }
  }

  private buildState(): PublicState {
    const cs = this.chainState ?? null;
    const phase: Phase = cs ? this.derivePhase(cs) : 'lobby';
    const players: PlayerView[] = ([0, 1] as Seat[]).map((seat) => ({
      seat,
      address: cs?.players[seat] ?? null,
      connected: this.conns[seat] !== null,
      committed: cs?.commitments[seat] != null,
      revealed: cs?.revealed[seat] ?? false,
      stack: cs ? (cs.buyIn - cs.contributed[seat]).toString() : '0',
      contributed: cs ? cs.contributed[seat].toString() : '0',
    }));

    const toActSeat: Seat | null =
      cs?.toAct && cs.players[0] === cs.toAct ? 0 : cs?.toAct && cs.players[1] === cs.toAct ? 1 : null;

    if (this.result) this.result.settleTxHash = this.settleTxHash;

    return {
      tableId: this.tableId,
      contractAddress: this.tableId,
      chainId: config.chainId,
      phase,
      buyIn: cs ? cs.buyIn.toString() : '0',
      smallBlind: cs ? cs.smallBlind.toString() : '0',
      bigBlind: cs ? cs.bigBlind.toString() : '0',
      pot: cs ? cs.pot.toString() : '0',
      currentBet: cs ? cs.currentBet.toString() : '0',
      street: cs?.street ?? 0,
      toActSeat,
      players,
      commitments: cs?.commitments ?? [null, null],
      seeds: this.seeds,
      board: this.board,
      result: this.result,
      youSeat: null,
    };
  }

  private sendState(ws: WebSocket, youSeat: Seat | null): void {
    const state = this.buildState();
    state.youSeat = youSeat;
    send(ws, { t: 'state', state });
  }

  private broadcastState(): void {
    for (const seat of [0, 1] as Seat[]) {
      const c = this.conns[seat];
      if (c) this.sendState(c.ws, seat);
    }
  }

  private toSeat(seat: Seat, msg: ServerMessage): void {
    const c = this.conns[seat];
    if (c) send(c.ws, msg);
  }
}

function send(ws: WebSocket, msg: ServerMessage): void {
  if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function short(s: string): string {
  return s.length > 10 ? `${s.slice(0, 6)}…${s.slice(-4)}` : s;
}
