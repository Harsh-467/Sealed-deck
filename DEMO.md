# Demo runbook — one full hand over VPN

Host = your Mac (running Docker). Guest = the remote machine on your VPN.

---

## Phase 0 — check it locally first (on your Windows PC)

Do these in order. Levels 1–2 need no Mac and no VPN.

### Level 1 — logic only (no wallet, no chain)
```bash
cd contracts && forge test          # 26 pass
cd .. && npm run test:crypto         # 13 pass
```

### Level 2 — the full app on your PC, against the real Fuji testnet (recommended)
This is identical to the Mac demo except the app runs on `localhost` instead of Docker.
You play BOTH seats yourself using two wallets.

1. **Two throwaway wallets, both funded.** In MetaMask create two accounts (A and B), or
   import two throwaway keys. Fund each from https://faucet.avax.network (Fuji AVAX).
2. **Deploy one table to Fuji** (a table = one hand; deploy a fresh one each time):
   ```bash
   cd contracts
   forge script script/Deploy.s.sol:Deploy --rpc-url "$FUJI_RPC_URL" --broadcast
   ```
   Copy the printed address.
3. **Point the app at it** (localhost server):
   - `.env`:            `POKER_TABLE_ADDRESS=0x...`
   - `frontend/.env`:   `VITE_POKER_TABLE_ADDRESS=0x...` and `VITE_PUBLIC_SERVER_URL=http://localhost:8787`
4. **Run both processes** (two terminals):
   ```bash
   npm run dev:server     # relay on :8787
   npm run dev:web        # app on :5173
   ```
5. **Open two browser profiles** so each has its own selected MetaMask account:
   - Chrome profile 1 → MetaMask account **A** → http://localhost:5173
   - Chrome profile 2 (or Firefox/Edge) → MetaMask account **B** → http://localhost:5173
   - (Same address can't take both seats — you need two distinct accounts.)
6. Play the hand (table below). Each action pops a MetaMask confirm in that profile.
   When it settles, follow the Snowtrace link.

If Level 2 works on localhost, the Mac demo will work — it's the same Fuji contract.

### Level 3 — fully offline with anvil (optional, no testnet)
Not wired by default (the app targets Fuji). Ask and I'll add a `localhost`/anvil chain
mode (wagmi config + chain watcher + a 31337 entry) so you can test with zero faucet use.

---

## Phase 1 — the VPN demo (Mac host)

## Before the demo

1. **Throwaway wallet + funds**
   - Create a fresh MetaMask account (no real funds).
   - Fund it from the Avalanche Fuji faucet: https://faucet.avax.network (AVAX).
   - For the x402 USDC path only: also get test USDC from https://faucet.circle.com (Avalanche Fuji).
2. **Deploy the table** (once):
   ```bash
   cd contracts
   forge script script/Deploy.s.sol:Deploy --rpc-url "$FUJI_RPC_URL" --broadcast --verify \
     --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
     --etherscan-api-key verifyContract
   ```
   Note the deployed address.
3. **Point the app at the Mac's VPN IP.** In `.env`:
   ```
   POKER_TABLE_ADDRESS=0x...deployed
   VITE_POKER_TABLE_ADDRESS=0x...deployed
   VITE_PUBLIC_SERVER_URL=http://<MAC_VPN_IP>:8787
   ```
   Find `<MAC_VPN_IP>` with `ipconfig getifaddr <vpn-iface>` or your VPN dashboard (e.g. Tailscale `100.x.y.z`).
4. **Start the host:**
   ```bash
   docker compose up --build
   ```
   - Relay: `http://<MAC_VPN_IP>:8787/health` should return `{"ok":true}`.
   - Web: `http://<MAC_VPN_IP>:5173`.

## The hand

| Step | Player A (host) | Player B (guest over VPN) |
|---|---|---|
| 1 | Open `http://localhost:5173`, Connect Wallet | Open `http://<MAC_VPN_IP>:5173`, Connect Wallet |
| 2 | Confirm network = Fuji (43113) | Same |
| 3 | **Take a Seat** (joinTable tx) | **Take a Seat** (joinTable tx) |
| 4 | Auto: posts shuffle commitment | Auto: posts shuffle commitment |
| 5 | Padlock dance runs (watch **Provably Fair**) | Hole cards appear sealed → revealed to owner only |
| 6 | Bet across preflop→river | Bet across preflop→river |
| 7 | Showdown: reveal seed + sign outcome | Same |
| 8 | `settleHand` pays winner → **Snowtrace** link | Verify result + Snowtrace |

## If it freezes (this is the point of the timeout)

If a player stalls, the other clicks through to **claim timeout** after `TIMEOUT_BLOCKS` (~1 min on Fuji): the staller is slashed and the honest player takes the pot. The table can never permanently freeze.

## Gotchas

- **Mixed content**: keep both the page and the WebSocket on plain `http`/`ws` over the VPN IP. Don't put the page on https with a ws:// relay.
- **Wrong network**: the app shows a "Switch to Fuji" gate.
- **No funds**: buy-in tx will revert; re-faucet.
- **Both wallets are distinct accounts** — you can't seat the same address twice.
