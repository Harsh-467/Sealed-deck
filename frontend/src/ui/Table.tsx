import { useState } from 'react';
import { C, FONT } from '../theme';
import { CardFace, LockedCard, Chips } from './primitives';
import { avax, shortAddr } from './format';
import { FairnessPanel } from './FairnessPanel';
import { ActionBar } from './ActionBar';
import type { GameView } from '../game/useGame';

const PHASE_LABEL: Record<string, string> = {
  commit: 'Posting shuffle commitments',
  shuffle: 'Sealing the deck · padlock dance',
  deal: 'Dealing sealed hole cards',
  preflop: 'Pre-Flop',
  flop: 'Flop',
  turn: 'Turn',
  river: 'River',
};

export function Table({ game }: { game: GameView }): JSX.Element {
  const s = game.state!;
  const [fair, setFair] = useState(false);
  const mySeat = game.seat ?? 0;
  const oppSeat = mySeat === 0 ? 1 : 0;
  const opp = s.players[oppSeat];
  const me = s.players[mySeat];
  const settling = !!game.busy && /settl|sign|reveal/i.test(game.busy);

  return (
    <section style={{ position: 'relative', minHeight: 'calc(100vh - 68px)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 24px 10px' }}>
      <div style={{ pointerEvents: 'none', position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)', width: 900, height: 560, background: 'radial-gradient(closest-side, rgba(214,176,108,.16), rgba(214,176,108,.04) 55%, transparent 75%)', animation: 'sd-spotbreath 7s ease-in-out infinite' }} />

      <div style={{ position: 'relative', zIndex: 2, marginBottom: 8, fontFamily: FONT.sans, fontSize: 11, letterSpacing: '.24em', textTransform: 'uppercase', color: C.inkDim }}>
        {PHASE_LABEL[s.phase] ?? s.phase}
      </div>

      {/* felt rail */}
      <div style={{ position: 'relative', width: '100%', maxWidth: 1020, borderRadius: 120, padding: 15, background: 'linear-gradient(180deg,#dcb872 0%,#a37e38 48%,#6e521f 100%)', boxShadow: '0 34px 70px rgba(0,0,0,.62), inset 0 2px 3px rgba(255,246,216,.7), inset 0 -5px 10px rgba(46,30,8,.6)' }}>
        <div style={{ position: 'relative', height: 480, borderRadius: 108, overflow: 'hidden', background: 'radial-gradient(120% 125% at 50% 32%, #204a40 0%, #173329 46%, #0e2019 80%, #0a1611 100%)', boxShadow: 'inset 0 0 60px rgba(0,0,0,.55), inset 0 6px 20px rgba(0,0,0,.5)' }}>
          <div style={{ pointerEvents: 'none', position: 'absolute', inset: 0, background: 'radial-gradient(48% 52% at 50% 42%, rgba(214,176,108,.10), transparent 62%)' }} />

          {/* fairness seal */}
          <button onClick={() => setFair(true)} style={{ position: 'absolute', top: 200, right: 24, zIndex: 6, display: 'flex', alignItems: 'center', gap: 9, padding: '7px 13px 7px 7px', borderRadius: 999, cursor: 'pointer', color: '#9fdfe6', fontFamily: FONT.sans, fontSize: 11, fontWeight: 600, letterSpacing: '.1em', textTransform: 'uppercase', background: 'rgba(8,20,22,.7)', border: '1px solid rgba(69,212,224,.35)', boxShadow: '0 0 14px rgba(69,212,224,.16)' }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 24, height: 24, borderRadius: '50%', background: 'radial-gradient(circle at 38% 32%,#f0d79e,#c9a05c 60%,#8a6a32)', color: '#0c1316', fontWeight: 700, fontSize: 12 }}>✓</span>
            Provably Fair
          </button>

          {/* opponent pod */}
          <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Pod name={shortAddr(opp.address) || 'Opponent'} stack={avax(opp.stack)} active={s.toActSeat === oppSeat} letter="V" />
          </div>
          {/* opponent hole (sealed) */}
          <div style={{ position: 'absolute', top: 72, left: '50%', transform: 'translateX(-50%)', zIndex: 4, display: 'flex', gap: 8 }}>
            <LockedCard brass /> <LockedCard brass />
          </div>

          {/* opponent bet chips */}
          {BigInt(opp.contributed) > 0n && (
            <div style={{ position: 'absolute', top: 158, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', alignItems: 'center', gap: 8 }}>
              <Chips tone="red" count={3} />
              <span style={{ fontFamily: FONT.serif, fontSize: 13, color: '#cdb98e' }}>{avax(opp.contributed)}</span>
            </div>
          )}

          {/* pot */}
          <div style={{ position: 'absolute', top: 186, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', flexDirection: 'column', alignItems: 'center', animation: 'sd-potpulse 3.2s ease-in-out infinite' }}>
            <div style={{ fontFamily: FONT.sans, fontSize: 9, letterSpacing: '.34em', textTransform: 'uppercase', color: C.inkDim, marginBottom: 3 }}>Pot</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <Chips tone="gold" count={2} />
              <div style={{ fontFamily: FONT.serif, fontWeight: 700, fontSize: 33, lineHeight: 1, color: C.potText, textShadow: '0 2px 8px rgba(0,0,0,.5)' }}>{avax(s.pot)}</div>
            </div>
            <div style={{ marginTop: 4, fontFamily: FONT.sans, fontSize: 9, letterSpacing: '.08em', color: '#8c8170' }}>AVAX · sealed pot</div>
          </div>

          {/* community */}
          <div style={{ position: 'absolute', top: 250, left: '50%', transform: 'translateX(-50%)', zIndex: 4, display: 'flex', gap: 9 }}>
            {s.board.map((c, i) => (c == null ? <LockedCard key={i} /> : <CardFace key={i} index={c} deal />))}
          </div>

          {/* your hole */}
          <div style={{ position: 'absolute', bottom: 12, left: '50%', transform: 'translateX(-50%)', zIndex: 5, display: 'flex', gap: 10 }}>
            {game.myHole.length === 2 ? game.myHole.map((c, i) => <CardFace key={i} index={c} w={70} h={98} deal />) : (<><LockedCard w={70} h={98} /> <LockedCard w={70} h={98} /></>)}
          </div>

          {/* your pod */}
          <div style={{ position: 'absolute', bottom: 16, left: 40, zIndex: 5, display: 'flex', alignItems: 'center', gap: 12 }}>
            <Pod name="You" stack={avax(me.stack)} active={s.toActSeat === mySeat} letter="A" addr={shortAddr(me.address)} />
          </div>

          {settling && <SettlingOverlay label={game.busy ?? ''} />}
        </div>
      </div>

      <ActionBar game={game} />
      {game.error && <div style={{ marginTop: 10, color: '#e8a99f', fontSize: 12, fontFamily: FONT.sans }}>{game.error}</div>}

      {fair && <FairnessPanel state={s} onClose={() => setFair(false)} />}
    </section>
  );
}

function Pod({ name, stack, active, letter, addr }: { name: string; stack: string; active: boolean; letter: string; addr?: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ position: 'relative', width: 58, height: 58 }}>
        <svg viewBox="0 0 100 100" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', transform: 'rotate(-90deg)' }}>
          <circle cx="50" cy="50" r="44" fill="none" stroke="rgba(255,255,255,.08)" strokeWidth="5" />
          {active && <circle cx="50" cy="50" r="44" fill="none" stroke={C.cyan} strokeWidth="5" strokeLinecap="round" strokeDasharray="276" style={{ filter: `drop-shadow(0 0 4px ${C.cyan})`, animation: 'sd-ring 18s linear infinite' }} />}
        </svg>
        <div style={{ position: 'absolute', inset: 6, borderRadius: '50%', background: 'linear-gradient(160deg,#2c3a36,#15211d)', border: '1px solid rgba(201,160,92,.5)', display: 'grid', placeItems: 'center', fontFamily: FONT.serif, fontSize: 21, color: C.goldText }}>{letter}</div>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontFamily: FONT.serif, fontSize: 15, color: C.ink }}>{name}</span>
        {addr && <span style={{ fontFamily: FONT.sans, fontSize: 10, color: '#8c8170' }}>{addr}</span>}
        <span style={{ fontFamily: FONT.serif, fontSize: 16, color: C.goldText }}>{stack} AVAX</span>
      </div>
    </div>
  );
}

function SettlingOverlay({ label }: { label: string }): JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 8, display: 'grid', placeItems: 'center', background: 'radial-gradient(40% 40% at 50% 50%, rgba(6,14,12,.55), rgba(6,14,12,.82))' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', display: 'grid', placeItems: 'center', background: 'radial-gradient(circle at 38% 32%,#f6e6bf,#b98e44 65%,#7d5f2c)', color: '#3a2a12', fontSize: 22, fontFamily: FONT.serif, animation: 'sd-coinflip 1.9s ease-in-out infinite' }}>◆</div>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontFamily: FONT.serif, fontSize: 19, color: '#9fdfe6' }}>{label}</div>
          <div style={{ marginTop: 5, fontFamily: FONT.sans, fontSize: 11, letterSpacing: '.18em', textTransform: 'uppercase', color: C.cyanDim }}>on-chain · please confirm in wallet</div>
        </div>
      </div>
    </div>
  );
}
