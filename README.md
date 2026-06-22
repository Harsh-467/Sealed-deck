# Sealed Deck

**Trustless, provably-fair heads-up poker on Avalanche.** No house. Two players collaboratively shuffle and encrypt the deck so that neither side — nor the relay server — knows the card order, and the pot settles on-chain on the Avalanche **Fuji C-Chain** (chainId `43113`).

Built for an Avalanche hackathon. Everything points at the real Avalanche networks: Fuji C-Chain, native **AVAX** for the default table, Avalanche's native Circle **USDC** (`0x5425890298aed601595a70AB815c96711a31Bc65`) for the **x402** buy-in path, Avalanche x402 facilitators, and **Snowtrace** verification. Moving to Avalanche mainnet C-Chain is a chain-id/RPC change.

> Weekend PoC. Heads-up only. Fairness uses **commit-reveal** (shuffle seed) + **SRA commutative encryption** (card secrecy) — *not* full zero-knowledge shuffle proofs. We chose a working, auditable end-to-end hand over breadth. Every stub is flagged in [Stubs & assumptions](#stubs--assumptions).

---

## What works today

| Layer | Status |
|---|---|
| `PokerTable.sol` (AVAX) — join/commit/reveal/bet/settle/timeout | ✅ **21/21 Foundry tests** |
| `PokerTableUSDC.sol` + `MockUSDC.sol` (x402 / EIP-3009 buy-in) | ✅ **5/5 Foundry tests** |
| SRA mental-poker crypto (commutativity, round-trip, hole-card secrecy, seeded shuffle) | ✅ **13/13 Vitest** |
| Relay server (WS card-blob relay + per-hand FSM + Fuji chain watcher) | ✅ boots, typechecks |
| x402 HTTP-402 buy-in middleware (Avalanche Fuji USDC) | ✅ typechecks, contract-tested |
| Frontend (React/Vite, all screens from the design, wagmi/viem + WS) | ✅ typechecks, builds |
| Docker / docker-compose one-command host | ✅ |
| Live Fuji deploy + Snowtrace verify + end-to-end hand | ⏳ **your step** (needs a funded throwaway wallet) — runbook below |

---

## Architecture

```
┌──────────────┐   WS (encrypted card blobs, never cleartext)   ┌──────────────┐
│  Player A    │◀──────────────────────────────────────────────▶│  Player B    │
│  browser     │                                                 │  browser     │
│  (wagmi+SRA) │            ┌───────────────────────┐            │  (wagmi+SRA) │
└──────┬───────┘            │   Relay / coordinator  │            └──────┬───────┘
       │   wallet tx        │  (Node, holds NO key)  │   wallet tx       │
       │                    │  - WS relay + FSM      │                   │
       ▼                    │  - Fuji chain watcher  │                   ▼
┌──────────────────────────┐│  - x402 buy-in route   │┌──────────────────────────┐
│ PokerTable(USDC) @ Fuji  │└───────────────────────┘│  AVAX / USDC, Snowtrace   │
│ pot custody + settlement │◀─── both wallets ──────▶│  43113 C-Chain            │
└──────────────────────────┘                          └──────────────────────────┘
```

- **Contracts** (`contracts/`, Solidity + Foundry): on-chain custody, betting accounting, commit/reveal, dual-signed settlement, timeout/slash.
- **Crypto** (`packages/mental-poker/`): SRA commutative encryption, the padlock dance, hand evaluation via `pokersolver`. Shared by server and browser; runs client-side so the server never sees a private card.
- **Server** (`server/`): WebSocket relay + per-hand state machine + Fuji event watcher + x402 buy-in middleware. **Holds no key; signs nothing** (the x402 *facilitator* role is separate and optional).
- **Frontend** (`frontend/`): the "Sealed Deck" design rebuilt in React.

---

## The `settleHand` trust model (the hard design question)

The pot only ever moves four ways — **no player can claim unilaterally**:

1. **Cooperative settle** — both players sign an **EIP-712** `Settlement{table, winner, pot, nonce}`. `settleHand` verifies *both* signatures match the two seats and agree on the identical struct, then pays the winner. Replay-guarded by `nonce` + a one-way `Revealing → Settled` transition.
2. **Fold** — the folder's opponent takes the pot immediately.
3. **Timeout / slash** — `claimTimeout(delinquent)` is callable by the other player once `N` blocks pass with the delinquent as the expected actor. The delinquent **forfeits their entire stake**; the honest player takes the whole table balance. This is the mandatory anti-freeze guarantee.
4. **Dispute void** — if both reveal but never agree on a signed winner, either may `voidAndRefund` after the deadline; **each is refunded exactly their own contribution**. A griefer can force a void but can **never steal** the opponent's chips.

**What we trust:** an honest player always recovers their funds (worst case: they win by waiting out a timeout, or get refunded by a void). **What we do NOT do:** reconstruct/evaluate cards on-chain — that's the ZK-shuffle territory we scoped out. The residual weakness is a malicious loser griefing into a *void* (nobody profits) rather than auto-losing. Documented and accepted for a PoC.

Bets draw from the **staked buy-in** (you buy in once, bet from your stack) — there is no per-bet transfer. This is the correct custody model for a trustless pot and is where the x402 buy-in plugs in.

---

## x402 on Avalanche — the verification result

**x402 settles on Fuji.** Confirmed: native Circle **USDC** is live on Fuji at `0x5425890298aed601595a70AB815c96711a31Bc65` with **EIP-3009 `transferWithAuthorization`** (gasless), there's a [Circle faucet](https://faucet.circle.com), and there are multiple Avalanche x402 facilitators (Thirdweb x402, PayAI, Ultravioleta DAO, the self-hostable `x402-rs`).

**How we use it (honestly):** bet-by-bet x402 conflicts with a trustless escrowed pot, so x402 funds the **buy-in**. The buy-in is an EIP-3009 authorization the player signs off-chain (the `X-PAYMENT`), with `to =` the table — which *is* the x402 settlement primitive. `PokerTableUSDC.joinWithAuthorization(...)` settles it, and the pot/payout are USDC.

- Contract path: **tested offline** against `MockUSDC` (`PokerTableUSDC.t.sol`).
- Server path: `GET/POST /x402/buyin/:table` issues the 402 + settles via an external facilitator **or** self-facilitator relayer key (`server/src/x402.ts`).
- **The AVAX-native table is the safe demo default** (`BETTING_PATH=avax`); the USDC/x402 table is switchable (`BETTING_PATH=x402-usdc`).
- The single piece exercised live (not offline) is the facilitator hop on Fuji — flagged below.

---

## Run it

Prereqs: **Node ≥ 20**, **Foundry** (`curl -L https://foundry.paradigm.xyz | bash && foundryup`), and a **MetaMask** with the Fuji network.

```bash
git clone <this repo> && cd Sealed-deck
cp .env.example .env          # fill in PRIVATE_KEY (throwaway!) etc.
npm install                   # installs all workspaces
```

### 1. Contracts (tests first)

```bash
cd contracts
forge test -vv                # 26 tests: 21 AVAX + 5 USDC/x402
```

Local deploy against anvil:

```bash
anvil &                       # in another shell
PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  forge script script/Deploy.s.sol:Deploy --rpc-url http://127.0.0.1:8545 --broadcast
```

### 2. Crypto (proven in isolation)

```bash
npm run test:crypto           # 13 Vitest: commutativity, round-trip, secrecy, seeded shuffle
```

### 3. Server

```bash
npm run dev:server            # relay on http://0.0.0.0:8787  (WS at /ws)
```

### 4. Frontend

```bash
cp frontend/.env.example frontend/.env   # set VITE_POKER_TABLE_ADDRESS after deploy
npm run dev:web               # http://localhost:5173
```

### Or everything in Docker (the demo host)

```bash
docker compose up --build     # server :8787, web :5173
```

---

## Deploy to Fuji + verify on Snowtrace (your step)

You need a **fresh throwaway wallet** funded from the [Avalanche Fuji faucet](https://faucet.avax.network). Put its key in `.env` as `PRIVATE_KEY` (gitignored).

```bash
cd contracts
# The deploy script reads PRIVATE_KEY (+ table params) from the environment. forge only
# auto-loads a .env in the CURRENT folder, so load the repo-root one explicitly first:
set -a; source ../.env; set +a
echo "$PRIVATE_KEY"   # sanity: your real 0x key, not the placeholder

# AVAX table (default demo)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url "$FUJI_RPC_URL" --broadcast \
  --verify --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
  --etherscan-api-key "verifyContract"

# USDC / x402 table (optional)
forge script script/DeployUSDC.s.sol:DeployUSDC \
  --rpc-url "$FUJI_RPC_URL" --broadcast --verify \
  --verifier-url "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan" \
  --etherscan-api-key "verifyContract"
```

Copy the deployed address into `POKER_TABLE_ADDRESS` (.env) and `VITE_POKER_TABLE_ADDRESS` (frontend/.env), then restart.

### End-to-end demo (one full hand)

1. Both players open the frontend, **Connect Wallet**, ensure Fuji + faucet AVAX.
2. Both **Take a Seat** (each `joinTable` stakes the buy-in). The client auto-posts its shuffle commitment.
3. The padlock dance runs over WS; hole cards are dealt sealed and only the owner can read them. Watch the **Provably Fair** panel.
4. Bet across preflop/flop/turn/river (fold/check/call/raise). Each bet is an on-chain tx.
5. At showdown both reveal seeds on-chain (contract verifies `keccak256(seed) == commitment`), both sign the EIP-712 outcome, and `settleHand` pays the winner. The result links to **Snowtrace**.

### VPN demo on a Mac (your setup)

`docker compose up --build` on the Mac. In `.env` set `VITE_PUBLIC_SERVER_URL=http://<MAC_VPN_IP>:8787` and the table address. The remote player opens `http://<MAC_VPN_IP>:5173`, adds Fuji + faucet funds to their own wallet, and plays. Keep page + WS on plain `http`/`ws` over the VPN IP (no mixed content). See [DEMO.md](DEMO.md) for the checklist.

---

## Stubs & assumptions

- **No on-chain card evaluation.** Disputes resolve via timeout/void, not by recomputing the winner on-chain (by design — ZK shuffle is out of scope).
- **SRA prime size.** Uses the 1024-bit RFC 2409 safe prime for sub-second deals; production would use the 2048-bit RFC 3526 prime (one-line change in `packages/mental-poker/src/sra.ts`). Commit-reveal binds the shuffle *permutation*; SRA keys provide secrecy.
- **Betting legality** is enforced on-chain for the safety-critical parts (can't act out of turn, can't bet beyond your stack) and mirrored by the server FSM; some exotic poker edge cases aren't re-derived on-chain.
- **x402 facilitator hop is the only piece not exercised offline.** The EIP-3009 buy-in contract is fully tested with a mock; the live facilitator settlement on Fuji is verified at demo time. The frontend currently drives the **AVAX** table end-to-end; wiring the USDC-mode buy-in button into the frontend is the remaining integration (server + contract are done).
- **One hand per contract instance** (per spec). The "table code" is the contract address.
- **Server relay** is trusted only for liveness/coordination, never for funds or card secrecy. No automated WS integration test ships; the relay is validated by the end-to-end hand.
- **Dependency audit warnings** come from `pokersolver`'s transitive deps; acceptable for a testnet PoC.

## Layout

```
contracts/   Foundry: PokerTable.sol, PokerTableUSDC.sol, MockUSDC.sol, tests, deploy scripts
packages/
  mental-poker/   SRA crypto + padlock-dance protocol + pokersolver eval + WS protocol types
  contracts-abi/  generated ABIs shared by server + frontend
server/      Express + WS relay, per-hand FSM, Fuji watcher, x402 middleware
frontend/    React/Vite: Landing, Lobby, Table, Fairness panel, Showdown
```
