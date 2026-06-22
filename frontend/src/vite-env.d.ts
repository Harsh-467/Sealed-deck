/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PUBLIC_SERVER_URL?: string;
  readonly VITE_FUJI_RPC_URL?: string;
  readonly VITE_POKER_TABLE_ADDRESS?: string;
  readonly VITE_CHAIN_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
