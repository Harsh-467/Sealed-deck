# Running Sealed Deck on a Mac — exhaustive step-by-step

This is the complete, nothing-assumed guide to hosting Sealed Deck on a Mac so a remote
player can join over your VPN and play one full hand. Follow it top to bottom.

> **Roles.** The **Mac is the host**: it runs the relay server + the web app in Docker.
> You (host player) can play in a browser **on the Mac**. The **guest** plays from their own
> machine over the VPN. The poker contract itself lives on the **Avalanche Fuji testnet**, not
> on the Mac — so both players' wallets talk to Fuji directly.

> **Shell.** macOS uses **zsh** by default. Every command below is run in **Terminal**
> (Applications → Utilities → Terminal, or press ⌘-Space and type "Terminal").

---

## 0. What you need before you start

- A Mac (Apple Silicon M1/M2/M3/M4 **or** Intel — both work).
- Admin rights on the Mac (to install software).
- Your VPN already running on the Mac **and** the guest (you said it's set up).
- Two MetaMask wallets you already created, each funded with Fuji test AVAX
  (see [DEMO.md](DEMO.md) §"Get test AVAX"; you need ~0.1 AVAX per wallet, or set a tiny
  buy-in as shown there). The **host** wallet lives in the Mac's browser; the **guest**
  wallet lives in the guest's browser.

You will install, in order: Command Line Tools → Homebrew → Git → Node → Docker Desktop →
(optional) Foundry. Then get the code, configure, deploy, and run.

---

## 1. Install the prerequisites

### 1.1 Xcode Command Line Tools (gives you git + compilers)
```zsh
xcode-select --install
```
A dialog pops up → click **Install** → wait for it to finish. If it says
"already installed", great, move on.

### 1.2 Homebrew (the macOS package manager)
Check if you already have it:
```zsh
brew --version
```
If that errors with "command not found", install it:
```zsh
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```
At the end it prints **two `echo ... >> ~/.zprofile` lines** (only on Apple Silicon). Run
exactly those two lines it shows, then:
```zsh
source ~/.zprofile
brew --version          # should now print a version
```
> On Apple Silicon, Homebrew lives at `/opt/homebrew`; on Intel at `/usr/local`. The two
> lines above put it on your PATH. If `brew` still isn't found, close and reopen Terminal.

### 1.3 Git
```zsh
brew install git
git --version
```

### 1.4 Node.js 20+
```zsh
brew install node@20
# Put it on PATH (Apple Silicon path shown; Intel: /usr/local/opt/node@20/bin):
echo 'export PATH="/opt/homebrew/opt/node@20/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node --version          # must be v20.x or higher
npm --version
```
> If `node --version` shows an older version from another install, that's fine as long as
> it's ≥ 20. If it's < 20, the line above forces the Homebrew node@20 ahead on PATH.

### 1.5 Docker Desktop (runs the app with one command)
1. Download from <https://www.docker.com/products/docker-desktop/>. **Pick the right chip:**
   "Apple Silicon" for M-series, "Intel chip" for Intel Macs. If unsure which you have:
   Apple menu  → **About This Mac** → look at "Chip"/"Processor".
2. Open the downloaded `.dmg`, drag **Docker** to **Applications**.
3. Launch **Docker** from Applications. Accept the terms. Wait until the whale icon in the
   top menu bar stops animating and says **"Docker Desktop is running."**
4. Verify in Terminal:
   ```zsh
   docker --version
   docker compose version
   ```
   Both must print a version. If `docker` is "not found", Docker Desktop isn't running or
   finished setting up — open the app and wait.

### 1.6 Foundry — ONLY if you will deploy the contract from the Mac
You can skip this if you already deployed the table from your Windows machine and will just
reuse that address (a contract on Fuji is reachable from anywhere). To deploy from the Mac:
```zsh
curl -L https://foundry.paradigm.xyz | bash
# It prints a line to source; usually:
source ~/.zshenv 2>/dev/null; source ~/.zshrc 2>/dev/null
foundryup
forge --version         # should print forge 1.x
```
> If `forge` is "not found" after `foundryup`, run `echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.zshrc && source ~/.zshrc`.

### 1.7 Browser(s) with MetaMask — how many wallets you need

**Sealed Deck is heads-up: two players = two DISTINCT wallet addresses.** The same address
can never take both seats. *Where* those two wallets live depends on how you're running it:

**Scenario A — real demo, two people on two machines (the normal case).**
On the **Mac** you only set up the **host's** wallet. The **guest** uses *their own* MetaMask on
*their own* computer over the VPN — there is nothing to install on the Mac for the guest. So:
one wallet on the Mac, the second wallet is on the guest's machine.

**Scenario B — you alone, playing BOTH seats from the Mac (for testing before the guest joins).**
Then you need **two** wallets *on the Mac*, each in its **own browser profile** so each has an
independent "selected account":
- Chrome **Profile 1** → MetaMask account **A**
- Chrome **Profile 2** (or a second browser like Firefox) → MetaMask account **B**
Both accounts must be funded on Fuji. You'll open `http://localhost:5173` in each profile and
act as each player in turn (each action confirms in that profile's MetaMask).

**Setup either way:** install **Chrome** (or Brave/Firefox) + the **MetaMask** extension, import
your throwaway wallet(s), and add the Fuji network to each (see [DEMO.md](DEMO.md) §"Add Fuji"):
- Network name: `Avalanche Fuji C-Chain`
- RPC URL: `https://api.avax-test.network/ext/bc/C/rpc`
- Chain ID: `43113`
- Symbol: `AVAX`
- Explorer: `https://testnet.snowtrace.io`

> To create a second browser profile in Chrome: top-right profile icon → **Add** → set it up →
> install MetaMask in that profile and import the **second** key. The two profiles keep separate
> MetaMask states, which is what lets one Mac drive both seats.

---

## 2. Get the code onto the Mac

Pick **one** of these.

### Option A — clone from GitHub (recommended)
On your **Windows** machine, push the repo to a (private) GitHub repo first:
```bash
# (run on Windows, in d:\TrialandError\Sealed-deck)
git add -A
git commit -m "Sealed Deck"
git branch -M main
git remote add origin https://github.com/<you>/sealed-deck.git
git push -u origin main
```
Then on the **Mac**:
```zsh
cd ~
git clone https://github.com/<you>/sealed-deck.git
cd sealed-deck
```

### Option B — copy the folder directly (no GitHub)
Zip the project on Windows **without** `node_modules` (it's big and rebuilds on the Mac), e.g.
right-click the `Sealed-deck` folder → Send to → Compressed folder, then AirDrop/USB/`scp` it
over. On the Mac, unzip it into your home folder and:
```zsh
cd ~/Sealed-deck          # wherever you unzipped it
```
> If you copied `node_modules` too, delete it so it's rebuilt for macOS/arm64:
> `rm -rf node_modules **/node_modules`

### Verify you're in the right place
```zsh
ls
# you should see: contracts  docker-compose.yml  frontend  package.json  packages  server  README.md ...
```

---

## 3. Install JavaScript dependencies
```zsh
cd ~/sealed-deck          # the repo root (where package.json + docker-compose.yml are)
npm install
```
This installs every workspace (server, frontend, packages). It takes a minute or two and may
print audit warnings — those are fine for a testnet PoC.

> Note: `docker compose up --build` also runs `npm install` inside the image, so this host-side
> install is mainly for running `forge`/scripts and for IDE comfort. Do it anyway.

---

## 4. Create your environment files

```zsh
cp .env.example .env
cp frontend/.env.example frontend/.env
```

Open `.env` in an editor (`open -e .env` opens it in TextEdit, or use VS Code `code .env`).
Fill in **at minimum**:

```ini
# A FRESH throwaway key — the wallet you'll deploy with. NEVER a real-funds key.
PRIVATE_KEY=0xYOUR_THROWAWAY_DEPLOYER_KEY

# Leave these as-is for Fuji:
FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
CHAIN_ID=43113
SNOWTRACE_API_KEY=verifyContract

# Server binds to all interfaces so the VPN can reach it:
SERVER_HOST=0.0.0.0
SERVER_PORT=8787

# You'll fill POKER_TABLE_ADDRESS and the VITE_ values in steps 6–7.
```

> **Where do I get `PRIVATE_KEY`?** In MetaMask: choose your **deployer** throwaway account →
> three-dot menu → Account details → **Show private key** → enter your MetaMask password →
> copy it. Prefix it with `0x` in the file. This account must hold a little Fuji AVAX for gas.
> The `.env` file is gitignored — it will not be committed.

Leave `frontend/.env` for now; you'll set its two values in step 7.

---

## 5. Make sure both wallets have Fuji AVAX

Each wallet (host + guest) needs Fuji test AVAX for its buy-in + gas. If you haven't already:
get it from <https://faucet.avax.network> (2 AVAX/claim; free coupon at
<https://guild.xyz/avalanche> if it asks) or the no-signup <https://thirdweb.com/avalanche-fuji>
(0.01 AVAX/day). Full details are in [DEMO.md](DEMO.md).

**If you used the small 0.01/day faucet, shrink the buy-in before deploying** by adding to `.env`:
```ini
BUY_IN_WEI=1000000000000000      # 0.001 AVAX
SMALL_BLIND_WEI=100000000000000  # 0.0001 AVAX
BIG_BLIND_WEI=200000000000000    # 0.0002 AVAX
TIMEOUT_BLOCKS=30
```

---

## 6. Deploy a fresh table to Fuji

> A table contract is **one hand**. Deploy a fresh one right before the demo. You can deploy
> from the Mac (needs Foundry from step 1.6) **or** from Windows and just paste the address here.

From the Mac:
```zsh
cd ~/sealed-deck/contracts
source ~/.zshrc                              # ensure forge is on PATH

# The deploy script reads PRIVATE_KEY from the ENVIRONMENT, and forge only auto-loads a
# .env in the CURRENT folder — yours is one level up — so load it explicitly:
export $(grep '^PRIVATE_KEY=' ../.env | xargs)
echo "$PRIVATE_KEY"      # sanity: must print your real 0x key, NOT 0xYOUR_THROWAWAY_PRIVATE_KEY

forge script script/Deploy.s.sol:Deploy \
  --rpc-url "https://api.avax-test.network/ext/bc/C/rpc" \
  --broadcast
```
> Make sure you **edited `.env` first** and replaced `PRIVATE_KEY=0xYOUR_THROWAWAY_PRIVATE_KEY`
> with your real throwaway key (MetaMask → Account details → Show private key). That account
> must hold a little **Fuji AVAX for gas** — use one of the two wallets you funded.
> If you see `environment variable "PRIVATE_KEY" not found`, you skipped the `export` line above
> or are running from the wrong folder.
The output ends with a line like:
```
PokerTable deployed at: 0xABCD...1234
```
**Copy that address.** (Optional verification on Snowtrace is in [README.md](README.md); not
required to play.)

Now put the address into BOTH env files. Back at the repo root:
```zsh
cd ~/sealed-deck
```
- In `.env`:            set `POKER_TABLE_ADDRESS=0xABCD...1234`
- In `frontend/.env`:   set `VITE_POKER_TABLE_ADDRESS=0xABCD...1234`

---

## 7. Find the Mac's VPN IP and set the public URL

The guest's browser downloads the app from the Mac, then must connect **back** to the Mac's
relay. So the app has to be told the Mac's VPN address — `localhost` would point the guest at
their own machine and fail.

Find the Mac's VPN IP:
- **Tailscale:** `tailscale ip -4`  → something like `100.101.102.103`
- **WireGuard / other:** list interfaces and find the VPN one (often `utun*`):
  ```zsh
  ifconfig | grep "inet " | grep -v 127.0.0.1
  ```
  Use the address on your VPN's subnet (your VPN dashboard also shows the Mac's IP).

Then edit `frontend/.env`:
```ini
VITE_PUBLIC_SERVER_URL=http://<MAC_VPN_IP>:8787   # e.g. http://100.101.102.103:8787
VITE_FUJI_RPC_URL=https://api.avax-test.network/ext/bc/C/rpc
VITE_POKER_TABLE_ADDRESS=0xABCD...1234
VITE_CHAIN_ID=43113
```
And, so the relay and frontend agree, set the same base in `.env`:
```ini
PUBLIC_SERVER_URL=http://<MAC_VPN_IP>:8787
```

> **Critical:** `VITE_PUBLIC_SERVER_URL` MUST be the Mac's VPN IP (not `localhost`), or the
> guest can't reach the relay. The host (on the Mac) can use the same URL — the Mac can reach
> its own VPN IP fine.

---

## 8. Start everything with Docker

Make sure **Docker Desktop is running** (whale icon in the menu bar). Then, from the repo root:
```zsh
cd ~/sealed-deck
docker compose up --build
```
First run builds the image (a few minutes). When it's ready you'll see logs like:
```
server-1  | [sealed-deck] relay listening on http://0.0.0.0:8787
web-1     |   VITE v6 ready ... Local: http://localhost:5173
```
Leave this Terminal window open — it's running the demo. (To run detached so you can close the
window: `docker compose up --build -d`, and view logs later with `docker compose logs -f`.)

> If you change any `.env` / `frontend/.env` value later, restart so containers pick it up:
> `docker compose down && docker compose up --build`.

---

## 9. Verify it's actually up

In a **new** Terminal tab (⌘-T):
```zsh
# Relay health (from the Mac itself):
curl http://localhost:8787/health        # -> {"ok":true}
curl http://localhost:8787/config        # -> {"chainId":43113,...}

# Reachable over the VPN IP too:
curl http://<MAC_VPN_IP>:8787/health      # -> {"ok":true}
```
Open the app on the Mac: <http://localhost:5173>. You should see the gold "Sealed Deck"
landing screen.

---

## 10. Allow incoming connections (macOS firewall)

If the guest can't reach `http://<MAC_VPN_IP>:5173`, the Mac firewall may be blocking it:
1. Apple menu  → **System Settings** → **Network** → **Firewall**.
2. If Firewall is **On**, click **Options…** and either:
   - turn off "Block all incoming connections", and
   - ensure **Docker** (or "com.docker.backend") is set to **Allow incoming connections**.
3. Most mesh VPNs (Tailscale/WireGuard) tunnel traffic and aren't affected, but if the guest
   times out, this is the first thing to check. You can temporarily toggle the Firewall **Off**
   to confirm that's the cause, then re-enable with Docker allowed.

> Corporate VPNs sometimes isolate clients from each other ("client isolation"). If the guest
> can ping the Mac's VPN IP but the port won't connect, that policy is the cause — test with a
> VPN that allows peer-to-peer (Tailscale does by default).

---

## 10.5 What the guest does (how the second player connects their wallet)

The guest's wallet connects **entirely inside the guest's own browser** — the Mac only serves
the web page. Only the page (`:5173`) and the WebSocket relay (`:8787`) travel over the VPN to
the Mac; the guest's MetaMask signing and the blockchain transactions go **directly from the
guest's browser to Fuji's public RPC**, never through the Mac. The Mac never sees the guest's
key.

**The guest needs only three things on their machine** (no code, no Docker, no Foundry, no
deploy):
1. A desktop browser (Chrome/Brave/Firefox) with the **MetaMask** extension installed & unlocked.
2. Their **own** throwaway wallet, **funded with Fuji AVAX**, with the **Fuji network added**
   (chainId `43113`, RPC `https://api.avax-test.network/ext/bc/C/rpc`). See [DEMO.md](DEMO.md).
3. The **VPN connected**, so they can reach the Mac's IP.

**The guest's steps:**
1. You send them the URL: `http://<MAC_VPN_IP>:5173`.
2. They open it → the app loads in their browser.
3. Click **Connect Wallet** → their local MetaMask pops up → **Connect** → choose their account.
   (This is `window.ethereum` in their browser; the Mac is not involved in the wallet handshake.)
4. If they see "Wrong network", click **Switch to Fuji** (or add Fuji if it's missing).
5. **Take a Seat** → confirm the buy-in transaction in their MetaMask → they're in.

> Keep the page on plain **`http://`** over the VPN (not `https://`). Injected MetaMask works on
> an http LAN/VPN address; an https page talking to a `ws://` relay is what breaks (mixed
> content). If MetaMask never pops up, the extension isn't installed/unlocked in that browser, or
> they opened the wrong URL.

---

## 11. Both players join and play one hand

| Step | Host (on the Mac) | Guest (over the VPN) |
|---|---|---|
| 1 | Open <http://localhost:5173> | Open `http://<MAC_VPN_IP>:5173` |
| 2 | **Connect Wallet** (host MetaMask) | **Connect Wallet** (their MetaMask) |
| 3 | If prompted, **Switch to Fuji** | Same |
| 4 | **Take a Seat** → confirm the tx in MetaMask | **Take a Seat** → confirm |
| 5 | App auto-posts your shuffle commitment (confirm tx) | Same |
| 6 | The padlock dance runs; your hole cards appear, sealed then revealed to you only | Same, their own cards |
| 7 | Bet across preflop→flop→turn→river (Fold/Check/Call/Raise) — each is a MetaMask tx | Same, on their turn |
| 8 | At showdown: reveal seed (tx) + sign the outcome | Same |
| 9 | `settleHand` pays the winner → **Snowtrace** link appears | Verify result + open Snowtrace |

> Each on-chain action requires confirming a transaction in that player's MetaMask. Keep the
> MetaMask popup visible. The **Provably Fair** button on the table opens the live
> commitment/seed verification panel.

> **Testing solo (Scenario B)?** Both "players" are on the Mac: open `http://localhost:5173` in
> **Chrome Profile 1** (account A) and again in **Profile 2 / another browser** (account B), and
> alternate between them for each player's turn. Everything else is identical.

### If someone stalls (this is the timeout safety net)
If a player goes away mid-hand, the other can **claim the timeout** after `TIMEOUT_BLOCKS`
(~1 minute on Fuji): the staller is slashed and the honest player takes the pot. The table can
never permanently freeze.

---

## 12. Play another hand (reset)

A table is one hand. To play again, **deploy a fresh table** and update the address:
```zsh
cd ~/sealed-deck/contracts
export $(grep '^PRIVATE_KEY=' ../.env | xargs)
forge script script/Deploy.s.sol:Deploy --rpc-url "https://api.avax-test.network/ext/bc/C/rpc" --broadcast
```
Put the new address in `.env` (`POKER_TABLE_ADDRESS`) and `frontend/.env`
(`VITE_POKER_TABLE_ADDRESS`), then:
```zsh
cd ~/sealed-deck
docker compose down && docker compose up --build
```
Both players reload and play again.

---

## 13. Stopping, restarting, logs

```zsh
# Stop (Ctrl-C in the foreground window), or if detached:
docker compose down

# Restart after an env change:
docker compose down && docker compose up --build

# Follow logs (detached mode):
docker compose logs -f
docker compose logs -f server      # just the relay
docker compose logs -f web         # just the web app

# Rebuild from scratch if something is stale:
docker compose build --no-cache && docker compose up
```

---

## 14. Troubleshooting (every gotcha)

- **`docker: command not found`** → Docker Desktop isn't installed/running. Open the Docker app,
  wait for "Docker Desktop is running", reopen Terminal.
- **Build fails in `npm install` with `gyp ERR! find Python` / `bufferutil` build error** → the
  image needs a C toolchain to compile an optional native add-on. The `Dockerfile` already
  installs `python3 make g++` for this; if you hit it, you're on an old copy — pull the latest
  `Dockerfile` and rerun `docker compose up --build`.
- **`Docker Compose requires buildx plugin` / you typed `docker-compose`** → use the v2 form with
  a space: `docker compose up --build`. (The hyphenated `docker-compose` is the legacy v1 CLI.)
- **`port is already allocated` / `address already in use`** → something else uses 8787 or 5173.
  Find and stop it: `lsof -i :8787` then `kill <PID>`, or change the host port in
  `docker-compose.yml` (e.g. `"8788:8787"`) and update `VITE_PUBLIC_SERVER_URL` to match.
- **Guest sees the page but it never connects / "Offline" in the header** →
  `VITE_PUBLIC_SERVER_URL` is wrong. It must be `http://<MAC_VPN_IP>:8787`, not `localhost`.
  Fix `frontend/.env`, then `docker compose down && up --build`.
- **Guest can't load the page at all** → firewall (step 10) or VPN client-isolation. Confirm the
  guest can `ping <MAC_VPN_IP>` and `curl http://<MAC_VPN_IP>:8787/health`.
- **"Wrong network" banner** → the wallet isn't on Fuji. Click **Switch to Fuji**, or add the
  network (step 1.7).
- **"No table configured"** → `VITE_POKER_TABLE_ADDRESS` is empty. Set it (step 6) and restart.
- **Buy-in tx reverts / "insufficient funds"** → that wallet has no Fuji AVAX, or the buy-in is
  bigger than its balance. Re-faucet (step 5) or lower `BUY_IN_WEI` and redeploy.
- **"already joined" / can't take the second seat** → you're trying to seat the same address
  twice. The host and guest must be **different** wallet addresses.
- **MetaMask shows nothing to confirm** → the popup may be hidden; click the MetaMask extension
  icon to bring it forward. Some actions only appear when it's your turn.
- **Changed `.env` but nothing changed** → containers read env at startup. Run
  `docker compose down && docker compose up --build`.
- **Apple Silicon image issues** → the base image is multi-arch and builds natively; if you ever
  see a platform warning, run `docker compose build --no-cache`.
- **`forge: command not found` on the Mac** → see step 1.6; or deploy from Windows and paste the
  address. The contract on Fuji is reachable either way.
- **Transactions are slow** → Fuji is usually ~1–2s finality; if the public RPC is congested,
  swap `FUJI_RPC_URL` / `VITE_FUJI_RPC_URL` for another Fuji RPC (e.g. an Ankr/Infura/QuickNode
  Fuji endpoint) and restart.

---

## 15. One-page quick reference

```zsh
# install (once)
xcode-select --install
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
brew install git node@20
# install Docker Desktop from docker.com, launch it
curl -L https://foundry.paradigm.xyz | bash && foundryup    # optional, for deploying here

# get code + deps
git clone https://github.com/<you>/sealed-deck.git && cd sealed-deck
npm install
cp .env.example .env && cp frontend/.env.example frontend/.env
#   edit .env:           PRIVATE_KEY=...   (and optional small BUY_IN_WEI)
# deploy a fresh table  (edit ../.env first so PRIVATE_KEY is your real key)
cd contracts
export $(grep '^PRIVATE_KEY=' ../.env | xargs)
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://api.avax-test.network/ext/bc/C/rpc --broadcast
cd ..
#   put the printed address in .env (POKER_TABLE_ADDRESS) and frontend/.env (VITE_POKER_TABLE_ADDRESS)
#   set frontend/.env  VITE_PUBLIC_SERVER_URL=http://<MAC_VPN_IP>:8787   (tailscale ip -4)

# run
docker compose up --build
#   host:  http://localhost:5173       guest:  http://<MAC_VPN_IP>:5173
```
