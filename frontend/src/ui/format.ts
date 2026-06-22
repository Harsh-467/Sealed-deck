import { formatEther } from 'viem';

/** Compact AVAX label from a wei string, e.g. "0.05". */
export function avax(wei: string | bigint, dp = 3): string {
  const v = Number(formatEther(typeof wei === 'bigint' ? wei : BigInt(wei || '0')));
  if (v === 0) return '0';
  const s = v.toFixed(dp);
  return s.replace(/\.?0+$/, '');
}

export function shortAddr(a?: string | null): string {
  if (!a) return '—';
  return `${a.slice(0, 4)}…${a.slice(-2)}`;
}

export const SUIT = {
  s: { sym: '♠', color: '#2a2118' },
  h: { sym: '♥', color: '#b3403a' },
  d: { sym: '♦', color: '#b3403a' },
  c: { sym: '♣', color: '#2a2118' },
} as const;
