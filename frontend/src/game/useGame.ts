import { useCallback, useEffect, useRef, useState } from 'react';
import { useAccount, useConnect, useDisconnect, useSwitchChain } from 'wagmi';
import type { Address, Hex } from 'viem';
import type { PublicState, ServerMessage } from '@sealed-deck/mental-poker';
import { GameSocket } from '../lib/ws';
import { GameCrypto } from './crypto';
import { tx, signSettlement, read } from '../lib/contract';
import { APP } from '../config';

type Seat = 0 | 1;

export interface GameView {
  connected: boolean;
  address?: Address;
  wrongChain: boolean;
  connectWallet: () => void;
  disconnect: () => void;
  switchToFuji: () => void;

  wsStatus: 'connecting' | 'open' | 'closed';
  state: PublicState | null;
  seat: Seat | null;
  myHole: number[];
  busy: string | null;
  error: string | null;

  join: () => Promise<void>;
  check: () => Promise<void>;
  call: () => Promise<void>;
  raise: (total: bigint) => Promise<void>;
  fold: () => Promise<void>;
  voidHand: () => Promise<void>;
}

export function useGame(): GameView {
  const { address, isConnected, chainId } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();

  const [wsStatus, setWsStatus] = useState<'connecting' | 'open' | 'closed'>('closed');
  const [state, setState] = useState<PublicState | null>(null);
  const [seat, setSeat] = useState<Seat | null>(null);
  const [myHole, setMyHole] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sockRef = useRef<GameSocket | null>(null);
  const cryptoRef = useRef<GameCrypto>(new GameCrypto());
  const seatRef = useRef<Seat | null>(null);
  const stateRef = useRef<PublicState | null>(null);
  const flags = useRef({ committed: false, dealReady: false, revealed: false, signed: false, submitted: false });
  const sigs = useRef<[Hex | null, Hex | null]>([null, null]);

  const wrongChain = isConnected && chainId !== APP.chainId;

  const connectWallet = useCallback(() => {
    const injected = connectors.find((c) => c.type === 'injected') ?? connectors[0];
    if (injected) connect({ connector: injected });
  }, [connect, connectors]);

  const switchToFuji = useCallback(() => switchChain({ chainId: APP.chainId as 43113 }), [switchChain]);

  // ----- connect WS once wallet + table are known -----
  useEffect(() => {
    if (!isConnected || !address || !APP.tableAddress) return;
    const sock = new GameSocket(APP.tableAddress, address, handleMessage, setWsStatus);
    sockRef.current = sock;
    sock.connect();
    return () => {
      sock.close();
      sockRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, address]);

  const send = (m: Parameters<GameSocket['send']>[0]) => sockRef.current?.send(m);
  const opp = (): Seat => (seatRef.current === 0 ? 1 : 0);

  // ------------------------------ messages ------------------------------ //
  function handleMessage(msg: ServerMessage): void {
    const c = cryptoRef.current;
    if (msg.t !== 'state') console.log('[sealed-deck ws<-]', msg.t, msg);
    switch (msg.t) {
      case 'seat':
        seatRef.current = msg.seat;
        setSeat(msg.seat);
        break;

      case 'state':
        stateRef.current = msg.state;
        setState(msg.state);
        void onState(msg.state);
        break;

      case 'startShuffle':
        console.log('[sealed-deck] starting shuffle dance (seat 0)…');
        c.startShuffle()
          .then((deck) => {
            console.log('[sealed-deck] sent encShuffleA');
            send({ t: 'shuffle', stage: 'encShuffleA', deck });
          })
          .catch((e) => {
            console.error('[sealed-deck] startShuffle FAILED:', e);
            setError(`Shuffle failed: ${errMsg(e)}`);
          });
        break;

      case 'shuffle':
        console.log('[sealed-deck] got shuffle stage', msg.stage);
        c.onShuffle(msg.stage, msg.deck)
          .then((nxt) => {
            if (nxt) {
              console.log('[sealed-deck] sending next stage', nxt.stage);
              send({ t: 'shuffle', stage: nxt.stage, deck: nxt.deck });
            } else {
              console.log('[sealed-deck] final deck received; awaiting deal');
            }
          })
          .catch((e) => {
            console.error('[sealed-deck] onShuffle FAILED at', msg.stage, e);
            setError(`Deck sealing failed: ${errMsg(e)}`);
          });
        break;

      case 'dealHole':
        console.log('[sealed-deck] my hole positions', msg.positions);
        c.setHolePositions(msg.positions);
        break;

      case 'needShares':
        try {
          const shares = c.sharesFor(msg.positions);
          console.log('[sealed-deck] sending', shares.length, 'shares for', msg.positions);
          for (const { position, share } of shares) {
            send({ t: 'revealShare', toSeat: opp(), position, share });
          }
        } catch (e) {
          console.error('[sealed-deck] sharesFor FAILED:', e);
          setError(`Reveal failed: ${errMsg(e)}`);
        }
        break;

      case 'revealShare': {
        const idx = c.onShare(msg.position, msg.share);
        console.log('[sealed-deck] got share for pos', msg.position, '-> decoded card', idx);
        if (idx != null) setMyHole([...c.holeCards()]);
        if (c.holeReady() && !flags.current.dealReady) {
          flags.current.dealReady = true;
          console.log('[sealed-deck] both hole cards read; dealReady');
          send({ t: 'dealReady' });
        }
        break;
      }

      case 'settleSig':
        sigs.current[msg.fromSeat] = msg.sig as Hex;
        void trySubmitSettlement();
        break;

      case 'error':
        setError(msg.message);
        break;

      case 'info':
        break;
    }
  }

  // ------------------------- phase-driven autopilot --------------------- //
  async function onState(s: PublicState): Promise<void> {
    const mySeat = seatRef.current;
    if (mySeat == null) return;

    // Auto-commit the shuffle seed once we're in the commit phase.
    if (s.phase === 'commit' && !flags.current.committed && !s.players[mySeat].committed) {
      flags.current.committed = true;
      try {
        const { commitment } = cryptoRef.current.ensureSeed();
        setBusy('Posting shuffle commitment…');
        await tx.commit(commitment);
      } catch (e) {
        flags.current.committed = false;
        setError(errMsg(e));
      } finally {
        setBusy(null);
      }
    }

    // Showdown: reveal seed on-chain + publish seed/hole over WS, then sign settlement.
    if (s.phase === 'showdown' && !flags.current.revealed) {
      flags.current.revealed = true;
      try {
        const seedHex = cryptoRef.current.seedHex();
        send({ t: 'revealSeed', seed: seedHex });
        send({ t: 'showdownHole', hole: cryptoRef.current.holeCards() });
        setBusy('Revealing shuffle seed on-chain…');
        await tx.revealShuffle(seedHex);
      } catch (e) {
        setError(errMsg(e));
      } finally {
        setBusy(null);
      }
    }
    if (s.phase === 'showdown' && s.result) {
      await maybeSign(s);
    }
  }

  async function maybeSign(s: PublicState): Promise<void> {
    const mySeat = seatRef.current;
    if (mySeat == null || flags.current.signed) return;
    if (s.result?.winnerSeat === 'tie') return; // tie -> void path
    const winnerSeat = s.result!.winnerSeat as Seat;
    const winner = s.players[winnerSeat].address as Address;
    if (!winner) return;
    flags.current.signed = true;
    try {
      const nonce = await read<bigint>('settleNonce');
      const sig = await signSettlement(winner, BigInt(s.pot), nonce);
      sigs.current[mySeat] = sig;
      send({ t: 'settleSig', winnerSeat, nonce: nonce.toString(), sig });
      await trySubmitSettlement();
    } catch (e) {
      flags.current.signed = false;
      setError(errMsg(e));
    }
  }

  // Seat 0 submits settleHand once both signatures are in hand.
  async function trySubmitSettlement(): Promise<void> {
    const s = stateRef.current;
    if (!s || seatRef.current !== 0 || flags.current.submitted) return;
    const [s0, s1] = sigs.current;
    if (!s0 || !s1 || !s.result || s.result.winnerSeat === 'tie') return;
    const winner = s.players[s.result.winnerSeat as Seat].address as Address;
    flags.current.submitted = true;
    try {
      const nonce = await read<bigint>('settleNonce');
      setBusy('Settling the pot on-chain…');
      await tx.settleHand(winner, nonce, s0, s1);
    } catch (e) {
      flags.current.submitted = false;
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  }

  // ------------------------------ actions ------------------------------- //
  const guard = (label: string, fn: () => Promise<unknown>) => async () => {
    setError(null);
    setBusy(label);
    try {
      await fn();
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  const join = guard('Joining table…', async () => {
    const buyIn = await read<bigint>('buyIn');
    await tx.join(buyIn);
  });
  const check = guard('Checking…', () => tx.check());
  const call = guard('Calling…', () => tx.callBet());
  const fold = guard('Folding…', () => tx.fold());
  const voidHand = guard('Voiding hand…', () => tx.voidAndRefund());
  const raise = async (total: bigint) => {
    setError(null);
    setBusy('Raising…');
    try {
      await tx.raiseTo(total);
    } catch (e) {
      setError(errMsg(e));
    } finally {
      setBusy(null);
    }
  };

  return {
    connected: isConnected,
    address,
    wrongChain: !!wrongChain,
    connectWallet,
    disconnect,
    switchToFuji,
    wsStatus,
    state,
    seat,
    myHole,
    busy,
    error,
    join,
    check,
    call,
    raise,
    fold,
    voidHand,
  };
}

function errMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  // Trim viem's verbose multi-line errors to the first useful line.
  return m.split('\n')[0].slice(0, 200);
}
