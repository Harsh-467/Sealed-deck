import { keccak256, type Hex } from 'viem';
import { C, FONT } from '../theme';
import type { PublicState } from '@sealed-deck/mental-poker';
import { shortAddr } from './format';

/** Live provably-fair panel: shuffle commitments, revealed seeds, and on-the-spot
 *  verification that keccak256(seed) === commitment (the same check the contract runs). */
export function FairnessPanel({ state, onClose }: { state: PublicState; onClose: () => void }): JSX.Element {
  return (
    <div style={{ position: 'absolute', inset: 0, zIndex: 12, display: 'grid', placeItems: 'center', background: 'radial-gradient(50% 50% at 50% 50%, rgba(6,14,12,.65), rgba(6,14,12,.88))' }}>
      <div style={{ width: 460, maxWidth: '92%', borderRadius: 16, padding: '22px 24px', background: 'linear-gradient(180deg,#0e1a1c,#0a1214)', border: '1px solid rgba(69,212,224,.3)', boxShadow: '0 24px 60px rgba(0,0,0,.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ display: 'grid', placeItems: 'center', width: 26, height: 26, borderRadius: '50%', background: 'radial-gradient(circle at 38% 32%,#f0d79e,#c9a05c 60%,#8a6a32)', color: '#0c1316', fontWeight: 700, fontSize: 13 }}>✓</span>
            <span style={{ fontFamily: FONT.serif, fontSize: 18, color: '#9fdfe6' }}>Provably Fair</span>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 0, color: C.inkDim, fontSize: 20, cursor: 'pointer' }}>×</button>
        </div>

        <div style={{ fontFamily: FONT.sans, fontSize: 11, lineHeight: 1.6, color: C.inkDim, marginBottom: 16 }}>
          Each player commits <code style={{ color: C.cyanDim }}>keccak256(seed)</code> on-chain <em>before</em> any card moves, so neither can re-pick their shuffle after seeing the other's deck. After the hand, seeds are revealed and verified.
        </div>

        {state.players.map((p, i) => {
          const commit = state.commitments[i] as Hex | null;
          const seed = state.seeds[i] as Hex | null;
          const verified = !!seed && !!commit && keccak256(seed).toLowerCase() === commit.toLowerCase();
          return (
            <div key={i} style={{ marginBottom: 12, padding: '12px 14px', borderRadius: 10, background: 'rgba(255,255,255,.03)', border: '1px solid rgba(69,212,224,.15)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontFamily: FONT.sans, fontSize: 12, color: C.ink }}>
                  Seat {i} · {shortAddr(p.address)}
                </span>
                <Badge ok={p.committed} label={p.committed ? 'Committed' : 'Pending'} />
              </div>
              <Row label="commit" value={commit ? `${commit.slice(0, 18)}…` : '—'} />
              <Row label="seed" value={seed ? `${seed.slice(0, 18)}…` : 'sealed until showdown'} />
              {seed && (
                <div style={{ marginTop: 6 }}>
                  <Badge ok={verified} label={verified ? 'Hash verified ✓' : 'MISMATCH'} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }): JSX.Element {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'monospace', fontSize: 11, color: C.inkDim, padding: '2px 0' }}>
      <span style={{ letterSpacing: '.1em', textTransform: 'uppercase', fontFamily: FONT.sans, fontSize: 9 }}>{label}</span>
      <span style={{ color: C.cyanDim }}>{value}</span>
    </div>
  );
}

function Badge({ ok, label }: { ok: boolean; label: string }): JSX.Element {
  return (
    <span style={{ fontFamily: FONT.sans, fontSize: 10, letterSpacing: '.08em', textTransform: 'uppercase', padding: '3px 8px', borderRadius: 999, border: `1px solid ${ok ? 'rgba(69,212,224,.5)' : 'rgba(201,160,92,.4)'}`, background: ok ? 'rgba(69,212,224,.1)' : 'rgba(201,160,92,.08)', color: ok ? C.cyan : C.goldText }}>
      {label}
    </span>
  );
}
