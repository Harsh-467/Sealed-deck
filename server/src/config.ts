import 'dotenv/config';

function env(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`missing env ${name}`);
  return v;
}

export const config = {
  host: env('SERVER_HOST', '0.0.0.0'),
  port: Number(env('SERVER_PORT', '8787')),
  chainId: Number(env('CHAIN_ID', '43113')),
  rpcUrl: env('FUJI_RPC_URL', 'https://api.avax-test.network/ext/bc/C/rpc'),
  // The default table the server watches. Clients may also pass a tableId (address).
  defaultTable: (process.env.POKER_TABLE_ADDRESS ?? '').toLowerCase(),
  bettingPath: (process.env.BETTING_PATH ?? 'avax') as 'avax' | 'x402',
};
