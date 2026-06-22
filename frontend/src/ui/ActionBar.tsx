import { useState } from 'react';
import { parseEther } from 'viem';
import { C, FONT } from '../theme';
import { Chips } from './primitives';
import { avax } from './format';
import type { GameView } from '../game/useGame';

export function ActionBar({ game }: { game: GameView }): JSX.Element | null {
  const s = game.state;
  const [raiseOpen, setRaiseOpen] = useState(false);
  const [raiseAmt, setRaiseAmt] = useState('');

  if (!s || game.seat == null) return null;
  const myTurn = s.toActSeat === game.seat;
  const owed = (BigInt(s.currentBet) - BigInt(s.players[game.seat].contributed)) > 0n;
  const toCall = s.currentBet; // simplified label
  const minRaise = (Number(avax(s.bigBlind)) || 0.001).toString();
  const maxRaise = avax(s.players[game.seat].stack);

  if (game.busy) {
    return <Waiting label={game.busy} active />;
  }
  if (!myTurn) {
    return <Waiting label="Waiting on opponent" />;
  }

  const placeRaise = async () => {
    const total = parseEther(raiseAmt || minRaise);
    await game.raise(total);
    setRaiseOpen(false);
  };

  return (
    <div style={{ position: 'relative', width: '100%', maxWidth: 760, marginTop: 14 }}>
      {raiseOpen && (
        <div style={{ position: 'absolute', zIndex: 60, left: 0, right: 0, bottom: 'calc(100% + 12px)', padding: '18px 22px', borderRadius: 14, background: 'linear-gradient(180deg,#241612,#150e0c)', border: '1px solid rgba(201,160,92,.34)', boxShadow: '0 24px 60px rgba(0,0,0,.85)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
            <span style={{ fontFamily: FONT.sans, fontSize: 11, letterSpacing: '.2em', textTransform: 'uppercase', color: C.inkDim }}>Raise To</span>
            <span style={{ fontFamily: FONT.serif, fontSize: 26, color: C.potText }}>{raiseAmt || minRaise} AVAX</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 14 }}>
            <Chips tone="gold" count={3} />
            <input type="range" min={minRaise} max={maxRaise} step={minRaise} value={raiseAmt || minRaise} onChange={(e) => setRaiseAmt(e.target.value)} style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button onClick={() => setRaiseOpen(false)} style={ghost}>Cancel</button>
            <button onClick={placeRaise} style={{ ...cyan, flex: 3 }}>Place Bet · {raiseAmt || minRaise}</button>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 12, alignItems: 'stretch' }}>
        <button onClick={game.fold} style={{ ...dark, flex: 1 }}>Fold</button>
        {!owed && <button onClick={game.check} style={{ ...dark, flex: 1 }}>Check</button>}
        {owed && (
          <button onClick={game.call} style={{ ...gold, flex: 1.2, flexDirection: 'column' }}>
            Call<span style={{ fontFamily: FONT.serif, fontSize: 15, letterSpacing: 0, textTransform: 'none' }}>{avax(toCall)} AVAX</span>
          </button>
        )}
        <button onClick={() => setRaiseOpen((v) => !v)} style={{ ...goldBright, flex: 1.2 }}>Raise</button>
      </div>
    </div>
  );
}

function Waiting({ label, active }: { label: string; active?: boolean }): JSX.Element {
  return (
    <div style={{ width: '100%', maxWidth: 760, marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: 20, borderRadius: 12, background: 'rgba(20,12,11,.6)', border: '1px solid rgba(201,160,92,.14)' }}>
      <span style={{ display: 'flex', gap: 5 }}>
        {[0, 1, 2].map((i) => (
          <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.cyan, animation: `sd-blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />
        ))}
      </span>
      <span style={{ fontFamily: FONT.sans, fontSize: 13, letterSpacing: '.14em', textTransform: 'uppercase', color: active ? C.cyanDim : C.inkDim }}>{label}</span>
    </div>
  );
}

const base: React.CSSProperties = { fontFamily: FONT.sans, fontWeight: 600, fontSize: 14, letterSpacing: '.12em', textTransform: 'uppercase', padding: 17, borderRadius: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2 };
const dark: React.CSSProperties = { ...base, color: C.goldText, background: 'linear-gradient(180deg,#2c2320,#1c1614)', border: '1px solid rgba(201,160,92,.35)' };
const gold: React.CSSProperties = { ...base, color: '#2a1e0c', background: 'linear-gradient(180deg,#f4dca0,#cba055 55%,#a67d39)', border: '1px solid #7d5f2c' };
const goldBright: React.CSSProperties = { ...base, fontWeight: 700, color: '#2a1e0c', background: 'linear-gradient(180deg,#f6e6bf,#d6b06c 55%,#b1863f)', border: '1px solid #7d5f2c' };
const cyan: React.CSSProperties = { ...base, fontWeight: 700, color: '#062020', background: 'linear-gradient(180deg,#7fe9f0,#3fc6d2 60%,#2a9aa6)', border: '1px solid #1f7a84' };
const ghost: React.CSSProperties = { ...base, flex: 1, color: C.inkDim, background: 'transparent', border: '1px solid rgba(201,160,92,.25)' };
