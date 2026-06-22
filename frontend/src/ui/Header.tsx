import { C, FONT } from '../theme';
import { Seal } from './primitives';
import { shortAddr } from './format';
import type { GameView } from '../game/useGame';

export function Header({ game }: { game: GameView }): JSX.Element {
  return (
    <header
      style={{
        position: 'relative',
        zIndex: 40,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: 18,
        padding: '14px 26px',
        borderBottom: '1px solid rgba(201,160,92,.16)',
        background: 'linear-gradient(180deg, rgba(20,12,11,.86), rgba(20,12,11,.4))',
        backdropFilter: 'blur(6px)',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <Seal />
        <div style={{ display: 'flex', flexDirection: 'column', lineHeight: 0.95 }}>
          <span style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 19, letterSpacing: '.16em', color: C.goldText, textTransform: 'uppercase' }}>Sealed</span>
          <span style={{ fontFamily: FONT.sans, fontWeight: 500, fontSize: 9.5, letterSpacing: '.52em', color: C.inkDim, textTransform: 'uppercase', marginTop: 2 }}>Deck</span>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14, fontFamily: FONT.sans, fontSize: 11, letterSpacing: '.04em', color: C.inkDim }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: game.wsStatus === 'open' ? C.cyan : '#6a6258', boxShadow: game.wsStatus === 'open' ? `0 0 8px ${C.cyan}` : 'none', animation: 'sd-blink 2.4s ease-in-out infinite' }} />
          {game.wsStatus === 'open' ? 'Live · WS' : game.wsStatus === 'connecting' ? 'Connecting…' : 'Offline'}
        </span>
        <span style={{ width: 1, height: 14, background: 'rgba(201,160,92,.2)' }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 11px', borderRadius: 999, border: '1px solid rgba(232,73,58,.4)', background: 'rgba(232,73,58,.08)', color: '#e8a99f' }}>
          <span style={{ width: 14, height: 14, borderRadius: 3, background: 'linear-gradient(135deg,#e84142,#a8302f)' }} />
          Fuji Testnet
        </span>
        {game.connected ? (
          <button onClick={game.disconnect} style={pill}>
            {shortAddr(game.address)}
          </button>
        ) : null}
      </div>
    </header>
  );
}

const pill: React.CSSProperties = {
  fontFamily: FONT.sans,
  fontSize: 11,
  letterSpacing: '.06em',
  padding: '6px 12px',
  borderRadius: 999,
  border: '1px solid rgba(201,160,92,.3)',
  background: 'rgba(201,160,92,.08)',
  color: C.goldText,
  cursor: 'pointer',
};
