/** Design tokens lifted from "Sealed Deck.dc.html" — Vegas high-roller palette.
 *  gold = money, cyan = trust/cryptography. */
export const C = {
  bg: '#0c0807',
  ink: '#ece3d2',
  inkDim: '#9a8f7e',
  inkFaint: '#7c715f',
  // gold / brass (money)
  gold: '#c9a05c',
  goldLt: '#f6e6bf',
  goldMd: '#dcb978',
  goldDk: '#a87e3c',
  goldText: '#e7cf9b',
  potText: '#f3e1b4',
  // cyan (trust / locks)
  cyan: '#45d4e0',
  cyanDim: '#7fb8bf',
  cyanGlow: 'rgba(69,212,224,.5)',
  // felt
  felt0: '#204a40',
  felt1: '#173329',
  felt2: '#0e2019',
  // avalanche red
  avax: '#e84142',
  // card faces
  cardFace: 'linear-gradient(162deg,#f8f2e6,#e9ddc5)',
  cardRed: '#b3403a',
  cardBlack: '#2a2118',
} as const;

export const FONT = {
  serif: "'Bodoni Moda', serif",
  sans: "'Archivo', sans-serif",
} as const;

/** Keyframes + base resets injected once at app start. */
export const GLOBAL_CSS = `
*{ box-sizing:border-box; }
html,body{ margin:0; padding:0; background:#0c0807; }
#root{ min-height:100vh; }
::selection{ background:rgba(201,160,92,.3); color:#f3e8d0; }
input[type=range]{ -webkit-appearance:none; appearance:none; background:transparent; }
input[type=range]::-webkit-slider-runnable-track{ height:5px; border-radius:3px; background:linear-gradient(90deg,#c9a05c,#7d5f2c); }
input[type=range]::-webkit-slider-thumb{ -webkit-appearance:none; appearance:none; margin-top:-7px; width:19px; height:19px; border-radius:50%; background:radial-gradient(circle at 38% 32%,#f6e6bf,#b98e44 65%,#7d5f2c); border:1px solid #7d5f2c; box-shadow:0 2px 6px rgba(0,0,0,.5); cursor:pointer; }
@keyframes sd-shimmer { 0%{background-position:-180% 0} 100%{background-position:280% 0} }
@keyframes sd-lockglow { 0%,100%{opacity:.55; filter:drop-shadow(0 0 6px rgba(69,212,224,.5))} 50%{opacity:1; filter:drop-shadow(0 0 16px rgba(69,212,224,.95))} }
@keyframes sd-potpulse { 0%,100%{transform:scale(1); filter:drop-shadow(0 0 0 rgba(201,160,92,0))} 50%{transform:scale(1.045); filter:drop-shadow(0 0 22px rgba(201,160,92,.45))} }
@keyframes sd-spotbreath { 0%,100%{opacity:.92} 50%{opacity:1} }
@keyframes sd-deal { 0%{ transform:translateY(-46px) rotate(-7deg) scale(.9); opacity:0 } 100%{ transform:translateY(0) rotate(0) scale(1); opacity:1 } }
@keyframes sd-coinflip { 0%{ transform:rotateY(0deg) } 100%{ transform:rotateY(1440deg) } }
@keyframes sd-arc { 0%{ stroke-dashoffset:163 } 100%{ stroke-dashoffset:0 } }
@keyframes sd-ring { 0%{ stroke-dashoffset:0 } 100%{ stroke-dashoffset:264 } }
@keyframes sd-rise { 0%{ transform:translateY(16px); opacity:0 } 100%{ transform:translateY(0); opacity:1 } }
@keyframes sd-flip { 0%{ transform:rotateY(180deg) } 100%{ transform:rotateY(0deg) } }
@keyframes sd-blink { 0%,100%{ opacity:1 } 50%{ opacity:.25 } }
@keyframes sd-spin { 0%{ transform:rotate(0) } 100%{ transform:rotate(360deg) } }
`;
