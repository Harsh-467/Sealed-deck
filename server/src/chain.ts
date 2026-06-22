/**
 * Read-only view of a PokerTable on Fuji + an event watcher. The server uses this to
 * mirror on-chain truth (pot, turn, street, commitments, settlement) into public game
 * state. It holds NO private key and signs nothing — money only ever moves via the
 * players' own wallets.
 */
import { createPublicClient, http, type Address, type PublicClient } from 'viem';
import { avalancheFuji } from 'viem/chains';
import { pokerTableAbi } from '@sealed-deck/contracts-abi';
import { config } from './config.js';

export interface ChainState {
  exists: boolean;
  state: number; // PokerTable.State enum
  numPlayers: number;
  players: [Address | null, Address | null];
  pot: bigint;
  currentBet: bigint;
  street: number;
  toAct: Address | null;
  buyIn: bigint;
  smallBlind: bigint;
  bigBlind: bigint;
  contributed: [bigint, bigint];
  commitments: [`0x${string}` | null, `0x${string}` | null];
  revealed: [boolean, boolean];
}

const ZERO = '0x0000000000000000000000000000000000000000';

export class TableChain {
  readonly address: Address;
  readonly client: PublicClient;
  private unwatch: (() => void) | null = null;

  constructor(address: string) {
    this.address = address as Address;
    this.client = createPublicClient({
      chain: avalancheFuji,
      transport: http(config.rpcUrl),
    });
  }

  private read<T>(functionName: string, args: unknown[] = []): Promise<T> {
    return this.client.readContract({
      address: this.address,
      abi: pokerTableAbi,
      functionName: functionName as never,
      args: args as never,
    }) as Promise<T>;
  }

  async readState(): Promise<ChainState> {
    try {
      const [state, numPlayers, pot, currentBet, street, toAct, buyIn, sb, bb] = await Promise.all([
        this.read<number>('state'),
        this.read<number>('numPlayers'),
        this.read<bigint>('pot'),
        this.read<bigint>('currentBet'),
        this.read<number>('street'),
        this.read<Address>('toAct'),
        this.read<bigint>('buyIn'),
        this.read<bigint>('smallBlind'),
        this.read<bigint>('bigBlind'),
      ]);

      const p0 = numPlayers >= 1 ? await this.read<Address>('players', [0n]) : null;
      const p1 = numPlayers >= 2 ? await this.read<Address>('players', [1n]) : null;

      const contributed: [bigint, bigint] = [0n, 0n];
      const commitments: [`0x${string}` | null, `0x${string}` | null] = [null, null];
      const revealed: [boolean, boolean] = [false, false];
      for (const [i, p] of [p0, p1].entries()) {
        if (!p || p === ZERO) continue;
        contributed[i] = await this.read<bigint>('contributed', [p]);
        const c = await this.read<`0x${string}`>('shuffleCommit', [p]);
        commitments[i] = c && c !== `0x${'0'.repeat(64)}` ? c : null;
        revealed[i] = await this.read<boolean>('hasRevealed', [p]);
      }

      return {
        exists: true,
        state,
        numPlayers,
        players: [norm(p0), norm(p1)],
        pot,
        currentBet,
        street,
        toAct: norm(toAct),
        buyIn,
        smallBlind: sb,
        bigBlind: bb,
        contributed,
        commitments,
        revealed,
      };
    } catch {
      return emptyState();
    }
  }

  /** Re-read and notify on every PokerTable event. */
  watch(onChange: (eventName: string, args: Record<string, unknown>) => void): void {
    this.unwatch = this.client.watchContractEvent({
      address: this.address,
      abi: pokerTableAbi,
      onLogs: (logs) => {
        for (const log of logs) {
          const name = (log as { eventName?: string }).eventName ?? 'unknown';
          const args = ((log as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>;
          onChange(name, args);
        }
      },
      onError: () => {
        /* transient RPC errors are tolerated; periodic readState() reconciles state */
      },
    });
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
  }
}

function norm(a: Address | null): Address | null {
  if (!a || a === ZERO) return null;
  return a.toLowerCase() as Address;
}

function emptyState(): ChainState {
  return {
    exists: false,
    state: 0,
    numPlayers: 0,
    players: [null, null],
    pot: 0n,
    currentBet: 0n,
    street: 0,
    toAct: null,
    buyIn: 0n,
    smallBlind: 0n,
    bigBlind: 0n,
    contributed: [0n, 0n],
    commitments: [null, null],
    revealed: [false, false],
  };
}
