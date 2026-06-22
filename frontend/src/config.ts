/** Frontend runtime config (Vite injects VITE_* at build/dev time). */
export const APP = {
  serverUrl: import.meta.env.VITE_PUBLIC_SERVER_URL ?? 'http://localhost:8787',
  rpcUrl: import.meta.env.VITE_FUJI_RPC_URL ?? 'https://api.avax-test.network/ext/bc/C/rpc',
  tableAddress: (import.meta.env.VITE_POKER_TABLE_ADDRESS ?? '') as `0x${string}` | '',
  chainId: Number(import.meta.env.VITE_CHAIN_ID ?? '43113'),
};

/** http(s) base -> ws(s) base for the WebSocket relay. */
export function wsUrl(): string {
  const u = new URL(APP.serverUrl);
  u.protocol = u.protocol === 'https:' ? 'wss:' : 'ws:';
  u.pathname = '/ws';
  return u.toString();
}

export const SNOWTRACE = 'https://testnet.snowtrace.io';
