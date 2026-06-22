import { C, FONT } from '../theme';
import { Kicker, Panel } from './primitives';
import { avax, shortAddr } from './format';
import { APP } from '../config';
import type { GameView } from '../game/useGame';

export function Lobby({ game }: { game: GameView }): JSX.Element {
  const s = game.state;
  const buyIn = s ? avax(s.buyIn) : '—';
  const joined = s ? s.players.filter((p) => p.address).length : 0;
  const mySeated = game.seat != null && s?.players[game.seat]?.address;
  const code = APP.tableAddress || '(set VITE_POKER_TABLE_ADDRESS)';

  return (
    <section style={{ position: 'relative', minHeight: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 24px' }}>
      <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'radial-gradient(60% 50% at 50% 40%, rgba(201,160,92,.08), transparent 70%)' }} />
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'sd-rise .6s ease both' }}>
        <Kicker>Private Table</Kicker>

        <Panel style={{ marginTop: 26, width: 440, padding: '28px 30px' }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 10, letterSpacing: '.3em', textTransform: 'uppercase', color: C.inkDim }}>Buy-In</div>
            <div style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 46, color: C.potText, lineHeight: 1.1 }}>{buyIn} <span style={{ fontSize: 18, color: C.goldText }}>AVAX</span></div>
          </div>

          <div style={{ marginTop: 22, padding: '12px 14px', borderRadius: 10, background: 'rgba(8,5,5,.5)', border: '1px solid rgba(201,160,92,.16)' }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 9, letterSpacing: '.24em', textTransform: 'uppercase', color: C.inkDim, marginBottom: 5 }}>Table Code</div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <code style={{ fontFamily: 'monospace', fontSize: 12, color: C.cyanDim, wordBreak: 'break-all' }}>{code}</code>
              <button onClick={() => navigator.clipboard?.writeText(code)} style={copyBtn}>Copy</button>
            </div>
          </div>

          <div style={{ marginTop: 16, display: 'flex', justifyContent: 'space-between', fontFamily: FONT.sans, fontSize: 12, color: C.inkDim }}>
            <span>Seats filled</span>
            <span style={{ color: C.goldText }}>{joined} / 2</span>
          </div>

          {game.wrongChain ? (
            <button onClick={game.switchToFuji} style={goldBtn}>Switch to Fuji</button>
          ) : mySeated ? (
            <div style={{ marginTop: 22, textAlign: 'center', fontFamily: FONT.sans, fontSize: 13, letterSpacing: '.1em', textTransform: 'uppercase', color: C.cyanDim }}>
              <span style={{ display: 'inline-flex', gap: 5, marginRight: 8 }}>
                {[0, 1, 2].map((i) => (
                  <span key={i} style={{ width: 7, height: 7, borderRadius: '50%', background: C.cyan, animation: `sd-blink 1.2s ease-in-out ${i * 0.2}s infinite` }} />
                ))}
              </span>
              Waiting for opponent
            </div>
          ) : (
            <button onClick={game.join} disabled={!!game.busy} style={goldBtn}>
              {game.busy ?? `Take a Seat · ${buyIn} AVAX`}
            </button>
          )}

          {game.error && <div style={{ marginTop: 12, color: '#e8a99f', fontSize: 12, fontFamily: FONT.sans, textAlign: 'center' }}>{game.error}</div>}
        </Panel>

        <div style={{ marginTop: 20, maxWidth: 440, textAlign: 'center', fontFamily: FONT.sans, fontSize: 11, lineHeight: 1.6, color: C.inkFaint }}>
          Both players stake the buy-in into the contract. The deck is shuffled and sealed between you — neither side, nor the server, knows the order until cards are dealt.
        </div>
      </div>
    </section>
  );
}

const goldBtn: React.CSSProperties = {
  marginTop: 22,
  width: '100%',
  fontFamily: FONT.sans,
  fontWeight: 700,
  fontSize: 14,
  letterSpacing: '.12em',
  textTransform: 'uppercase',
  color: '#2a1e0c',
  padding: 16,
  borderRadius: 11,
  cursor: 'pointer',
  background: 'linear-gradient(180deg,#f6e6bf,#d6b06c 55%,#b1863f)',
  border: '1px solid #7d5f2c',
  boxShadow: 'inset 0 1px 1px rgba(255,248,222,.9), 0 8px 20px rgba(0,0,0,.5)',
};

const copyBtn: React.CSSProperties = {
  fontFamily: FONT.sans,
  fontSize: 10,
  letterSpacing: '.08em',
  textTransform: 'uppercase',
  padding: '5px 10px',
  borderRadius: 6,
  border: '1px solid rgba(69,212,224,.35)',
  background: 'rgba(69,212,224,.08)',
  color: C.cyan,
  cursor: 'pointer',
  whiteSpace: 'nowrap',
};
