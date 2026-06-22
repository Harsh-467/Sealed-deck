import type { CSSProperties, ReactNode } from 'react';
import { cardView } from '@sealed-deck/mental-poker';
import { C, FONT } from '../theme';
import { SUIT } from './format';

/** The brass spade seal with the cyan lock node — the brand emblem. */
export function Seal({ size = 38 }: { size?: number }): JSX.Element {
  const lock = Math.round(size * 0.34);
  return (
    <span
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: '50%',
        display: 'grid',
        placeItems: 'center',
        background: 'radial-gradient(circle at 38% 32%, #f0d79e, #c9a05c 46%, #8a6a32 100%)',
        boxShadow:
          'inset 0 1px 2px rgba(255,245,220,.8), inset 0 -3px 6px rgba(60,40,12,.7), 0 2px 6px rgba(0,0,0,.6)',
        border: '1px solid rgba(120,90,40,.7)',
      }}
    >
      <span style={{ position: 'absolute', inset: 3, borderRadius: '50%', border: '1px dashed rgba(70,48,18,.55)' }} />
      <span style={{ fontFamily: FONT.serif, fontSize: size * 0.5, lineHeight: 1, color: '#3a2a12' }}>♠</span>
      <span
        style={{
          position: 'absolute',
          right: -2,
          bottom: -2,
          width: lock,
          height: lock,
          borderRadius: '50%',
          background: '#0e1416',
          display: 'grid',
          placeItems: 'center',
          border: '1px solid rgba(69,212,224,.6)',
          boxShadow: '0 0 8px rgba(69,212,224,.5)',
          fontSize: lock * 0.6,
          color: C.cyan,
        }}
      >
        🔒
      </span>
    </span>
  );
}

/** A revealed playing card face. */
export function CardFace({
  index,
  w = 56,
  h = 78,
  deal = false,
  winning = false,
}: {
  index: number;
  w?: number;
  h?: number;
  deal?: boolean;
  winning?: boolean;
}): JSX.Element {
  const v = cardView(index);
  const suit = SUIT[v.suit as keyof typeof SUIT];
  const big = Math.round(w * 0.64);
  const pip = Math.round(w * 0.3);
  const rk = Math.round(w * 0.3);
  return (
    <div
      title={`${v.rank} of ${v.suitName}`}
      style={{
        position: 'relative',
        width: w,
        height: h,
        borderRadius: 7,
        background: C.cardFace,
        border: `1px solid ${winning ? C.gold : '#cdbd9a'}`,
        boxShadow: winning
          ? `0 0 0 2px rgba(201,160,92,.5), 0 8px 18px rgba(0,0,0,.5)`
          : 'inset 0 1px 2px rgba(255,255,255,.9), 0 6px 13px rgba(0,0,0,.4)',
        display: 'grid',
        placeItems: 'center',
        fontFamily: FONT.serif,
        animation: deal ? 'sd-deal .5s ease both' : undefined,
      }}
    >
      <span style={{ position: 'absolute', top: 4, left: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.85, color: suit.color }}>
        <span style={{ fontSize: rk, fontWeight: 600 }}>{v.rank}</span>
        <span style={{ fontSize: pip }}>{suit.sym}</span>
      </span>
      <span style={{ fontSize: big, color: suit.color }}>{suit.sym}</span>
      <span style={{ position: 'absolute', bottom: 4, right: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', lineHeight: 0.85, color: suit.color, transform: 'rotate(180deg)' }}>
        <span style={{ fontSize: rk, fontWeight: 600 }}>{v.rank}</span>
        <span style={{ fontSize: pip }}>{suit.sym}</span>
      </span>
    </div>
  );
}

/** A sealed card: brass back + cyan shimmer + glowing padlock. */
export function LockedCard({ w = 56, h = 78, brass = false }: { w?: number; h?: number; brass?: boolean }): JSX.Element {
  return (
    <div style={{ width: w, height: h }} title="Sealed by cryptography">
      <div
        style={{
          position: 'relative',
          width: '100%',
          height: '100%',
          borderRadius: 7,
          overflow: 'hidden',
          background: brass
            ? 'repeating-linear-gradient(45deg,#6e1a20 0 7px,#561318 7px 14px)'
            : 'repeating-linear-gradient(45deg,#3a181b 0 7px,#2a1013 7px 14px)',
          border: `1.5px solid ${brass ? 'rgba(201,160,92,.55)' : 'rgba(69,212,224,.35)'}`,
          boxShadow: '0 7px 16px rgba(0,0,0,.5)',
        }}
      >
        <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(110deg,transparent 30%,rgba(69,212,224,.28) 50%,transparent 70%)', backgroundSize: '220% 100%', mixBlendMode: 'screen', animation: 'sd-shimmer 2.6s linear infinite' }} />
        <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: w * 0.42, color: C.cyan, animation: 'sd-lockglow 2.4s ease-in-out infinite' }}>🔒</div>
      </div>
    </div>
  );
}

/** A small stack of chips (gold or red). */
export function Chips({ tone = 'gold', count = 2 }: { tone?: 'gold' | 'red'; count?: number }): JSX.Element {
  const base = tone === 'gold'
    ? ['radial-gradient(circle at 50% 35%,#f0d79e,#a37e38)', 'radial-gradient(circle at 50% 35%,#f6e6bf,#b98e44)', 'radial-gradient(circle at 50% 35%,#f8eecb,#c79b4c)']
    : ['radial-gradient(circle at 50% 35%,#3a181b,#1c0c0e)', 'radial-gradient(circle at 50% 35%,#4a1f23,#240e10)', 'radial-gradient(circle at 50% 35%,#5a262b,#2a1013)'];
  return (
    <div style={{ position: 'relative', width: 30, height: 12 + count * 5 }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ position: 'absolute', bottom: i * 5, left: 0, width: 30, height: 11, borderRadius: '50%', background: base[i % base.length], border: '2px dashed rgba(60,40,12,.5)' }} />
      ))}
    </div>
  );
}

export function Panel({ children, style }: { children: ReactNode; style?: CSSProperties }): JSX.Element {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg,#241612,#150e0c)',
        border: '1px solid rgba(201,160,92,.28)',
        borderRadius: 14,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function Kicker({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, color: C.inkDim, fontSize: 11, letterSpacing: '.42em', textTransform: 'uppercase', fontFamily: FONT.sans }}>
      <span style={{ width: 34, height: 1, background: 'linear-gradient(90deg,transparent,#c9a05c)' }} />
      {children}
      <span style={{ width: 34, height: 1, background: 'linear-gradient(90deg,#c9a05c,transparent)' }} />
    </div>
  );
}
