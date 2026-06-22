import { C, FONT } from '../theme';
import { Kicker } from './primitives';
import type { GameView } from '../game/useGame';

export function Landing({ game }: { game: GameView }): JSX.Element {
  return (
    <section style={{ position: 'relative', minHeight: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', padding: '60px 24px' }}>
      <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'radial-gradient(60% 50% at 50% 42%, rgba(201,160,92,.10) 0%, rgba(201,160,92,.03) 40%, transparent 70%)', animation: 'sd-spotbreath 6s ease-in-out infinite' }} />
      <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'radial-gradient(75% 70% at 50% 45%, transparent 48%, rgba(6,4,4,.85) 100%)' }} />

      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'sd-rise .8s ease both' }}>
        <div style={{ marginBottom: 30 }}>
          <Kicker>By Invitation</Kicker>
        </div>

        <GrandSeal />

        <h1 style={{ margin: 0, fontFamily: FONT.serif, fontWeight: 800, fontSize: 84, lineHeight: 0.92, letterSpacing: '.02em', textTransform: 'uppercase', background: 'linear-gradient(180deg,#f6e6bf 0%,#dcb978 42%,#a87e3c 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 2px 10px rgba(0,0,0,.5))' }}>
          Sealed Deck
        </h1>
        <div style={{ marginTop: 8, display: 'flex', alignItems: 'center', gap: 16, color: C.inkFaint, fontSize: 11, letterSpacing: '.5em', textTransform: 'uppercase' }}>
          <span style={{ width: 50, height: 1, background: 'rgba(201,160,92,.4)' }} />
          Heads-Up · No House
          <span style={{ width: 50, height: 1, background: 'rgba(201,160,92,.4)' }} />
        </div>

        <p style={{ maxWidth: 560, margin: '34px 0 0', fontFamily: FONT.serif, fontStyle: 'italic', fontWeight: 500, fontSize: 23, lineHeight: 1.5, color: '#cabfa9' }}>
          Poker with no house. The deck is sealed by cryptography, the pot pays itself.
        </p>

        <button onClick={game.connectWallet} style={connectBtn}>
          <span style={{ fontSize: 17 }}>◆</span> Connect Wallet
        </button>

        <div style={{ marginTop: 30, display: 'flex', alignItems: 'center', gap: 11, color: C.cyanDim, fontSize: 12, letterSpacing: '.06em' }}>
          <span style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, borderRadius: '50%', border: '1px solid rgba(69,212,224,.5)', background: 'rgba(69,212,224,.08)', color: C.cyan, fontSize: 11 }}>✓</span>
          Provably-fair shuffle · settles on-chain
        </div>
      </div>
    </section>
  );
}

function GrandSeal(): JSX.Element {
  return (
    <div style={{ position: 'relative', width: 108, height: 108, borderRadius: '50%', display: 'grid', placeItems: 'center', marginBottom: 26, background: 'radial-gradient(circle at 38% 30%, #f3dca4, #c9a05c 44%, #7d5f2c 100%)', boxShadow: 'inset 0 2px 4px rgba(255,248,224,.85), inset 0 -6px 14px rgba(50,32,8,.75), 0 10px 34px rgba(0,0,0,.6), 0 0 0 7px rgba(201,160,92,.08)', border: '1px solid rgba(120,90,40,.8)' }}>
      <span style={{ position: 'absolute', inset: 8, borderRadius: '50%', border: '1.5px dashed rgba(70,48,18,.5)' }} />
      <span style={{ fontFamily: FONT.serif, fontSize: 50, lineHeight: 1, color: '#3a2a12' }}>♠</span>
      <span style={{ position: 'absolute', right: 4, bottom: 4, width: 30, height: 30, borderRadius: '50%', background: '#0c1316', display: 'grid', placeItems: 'center', border: '1.5px solid rgba(69,212,224,.55)', boxShadow: '0 0 14px rgba(69,212,224,.55), inset 0 0 8px rgba(69,212,224,.25)', fontSize: 14, color: C.cyan }}>🔒</span>
    </div>
  );
}

const connectBtn: React.CSSProperties = {
  marginTop: 42,
  display: 'flex',
  alignItems: 'center',
  gap: 14,
  fontFamily: FONT.sans,
  fontWeight: 600,
  fontSize: 15,
  letterSpacing: '.14em',
  textTransform: 'uppercase',
  color: '#2a1e0c',
  padding: '18px 40px',
  borderRadius: 10,
  cursor: 'pointer',
  background: 'linear-gradient(180deg,#f4dca0,#cba055 55%,#a67d39)',
  border: '1px solid #7d5f2c',
  boxShadow: 'inset 0 1px 1px rgba(255,248,222,.9), inset 0 -3px 7px rgba(70,48,16,.55), 0 10px 26px rgba(0,0,0,.5)',
};
