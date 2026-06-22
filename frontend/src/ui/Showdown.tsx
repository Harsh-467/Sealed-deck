import { C, FONT } from '../theme';
import { CardFace, LockedCard, Chips, Kicker } from './primitives';
import { avax } from './format';
import { SNOWTRACE, APP } from '../config';
import type { GameView } from '../game/useGame';

export function Showdown({ game }: { game: GameView }): JSX.Element {
  const s = game.state!;
  const mySeat = game.seat ?? 0;
  const oppSeat = mySeat === 0 ? 1 : 0;
  const r = s.result;
  const settled = s.phase === 'settled';
  const aborted = s.phase === 'aborted';

  const outcome =
    aborted ? 'Hand Voided'
    : !r ? 'Showdown'
    : r.winnerSeat === 'tie' ? 'Split Pot'
    : r.winnerSeat === mySeat ? 'You Win'
    : 'You Lose';

  const oppHole = r?.holeBySeat[oppSeat] ?? null;
  const txHash = r?.settleTxHash ?? null;

  return (
    <section style={{ position: 'relative', minHeight: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '14px 24px' }}>
      <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'radial-gradient(54% 60% at 50% 44%, rgba(214,176,108,.10), transparent 64%)' }} />

      {/* opponent hand */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
        <span style={{ fontFamily: FONT.sans, fontSize: 11, letterSpacing: '.28em', textTransform: 'uppercase', color: '#8c8170' }}>Opponent</span>
        <div style={{ display: 'flex', gap: 9 }}>
          {oppHole ? oppHole.map((c, i) => <CardFace key={i} index={c} w={54} h={76} />) : (<><LockedCard brass w={54} h={76} /> <LockedCard brass w={54} h={76} /></>)}
        </div>
      </div>

      {/* board */}
      <div style={{ position: 'relative', display: 'flex', gap: 8, margin: '4px 0' }}>
        {s.board.map((c, i) => (c == null ? <LockedCard key={i} w={54} h={76} /> : <CardFace key={i} index={c} w={54} h={76} winning={r?.winnerSeat === mySeat} />))}
      </div>

      {/* banner */}
      <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, margin: '3px 0', animation: 'sd-rise .6s ease both' }}>
        <Kicker>{outcome}</Kicker>
        {r && !aborted && (
          <div style={{ fontFamily: FONT.serif, fontWeight: 800, fontSize: 40, lineHeight: 1, background: 'linear-gradient(180deg,#f6e6bf,#dcb978 45%,#a87e3c)', WebkitBackgroundClip: 'text', backgroundClip: 'text', WebkitTextFillColor: 'transparent', filter: 'drop-shadow(0 2px 8px rgba(0,0,0,.5))' }}>
            {r.handName}
          </div>
        )}
        {r && <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 15, color: '#cabfa9' }}>{r.description}</div>}
        {aborted && <div style={{ fontFamily: FONT.serif, fontStyle: 'italic', fontSize: 15, color: '#cabfa9' }}>Stakes refunded to each player.</div>}

        {!aborted && (
          <div style={{ marginTop: 7, display: 'flex', alignItems: 'center', gap: 14, padding: '9px 18px', borderRadius: 999, background: 'rgba(201,160,92,.1)', border: '1px solid rgba(201,160,92,.35)' }}>
            <Chips tone="gold" count={3} />
            <span style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 24, color: C.potText }}>{avax(s.pot)} AVAX</span>
            <span style={{ fontFamily: FONT.sans, fontSize: 11, letterSpacing: '.14em', textTransform: 'uppercase', color: C.inkDim }}>
              {settled ? 'settled' : 'pot'}
            </span>
          </div>
        )}

        {game.busy && <div style={{ marginTop: 8, fontFamily: FONT.sans, fontSize: 12, color: C.cyanDim }}>{game.busy}</div>}

        {/* tie/void action */}
        {r?.winnerSeat === 'tie' && !settled && !aborted && (
          <button onClick={game.voidHand} style={{ marginTop: 12, fontFamily: FONT.sans, fontSize: 12, padding: '10px 18px', borderRadius: 10, border: '1px solid rgba(201,160,92,.35)', background: 'rgba(201,160,92,.08)', color: C.goldText, cursor: 'pointer' }}>
            Void & Refund (after timeout)
          </button>
        )}

        {/* snowtrace links */}
        <div style={{ marginTop: 12, display: 'flex', gap: 16, fontFamily: FONT.sans, fontSize: 12, color: C.cyanDim }}>
          {txHash && (
            <a href={`${SNOWTRACE}/tx/${txHash}`} target="_blank" rel="noreferrer" style={link}>
              ↗ Settlement on Snowtrace
            </a>
          )}
          {APP.tableAddress && (
            <a href={`${SNOWTRACE}/address/${APP.tableAddress}`} target="_blank" rel="noreferrer" style={link}>
              ↗ Table contract
            </a>
          )}
        </div>
      </div>
    </section>
  );
}

const link: React.CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 6,
  textDecoration: 'none',
  color: C.cyanDim,
  padding: '7px 12px',
  borderRadius: 8,
  border: '1px solid rgba(69,212,224,.25)',
  background: 'rgba(69,212,224,.06)',
};
