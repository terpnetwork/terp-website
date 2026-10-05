# Local Test Environment

End-to-end local testing: Docker chain(s), contract deployment, website config.

There are two ways to run the test environment:

| Method | Command | What it does |
|--------|---------|--------------|
| **Rust (recommended)** | `just test-rs` | ict-rs spawns chain, cw-orch deploys contracts |
| **Shell (legacy)** | `just test-local` | Shell script spawns Docker, runs deploy binaries |

The Rust path uses `scripts/` (the `scripts` crate). The shell path uses `tests/local-test-env.sh`.

---

## Quick Start (Rust)

```bash
# Prerequisites: Docker running, terp-core local-zk image built

# 1. Single chain — deploy all suites, keep running
cd ~/websites/terp.network
just test-rs

# 2. Dual chain + IBC relayer
just test-rs-ibc

# 3. Attach to running chain (skip spawn)
just test-rs-attach

# 4. Full multi-collection deploy
just test-rs-full
```

### Building the Docker Image

The Rust scripts default to `terpnetwork/terp-core:local-zk` (override with `TERP_IMAGE_REPO`/`TERP_IMAGE_VERSION` env vars).

```bash
cd ~/ZK/terp-core
docker buildx build --target local-zk -t terpnetwork/terp-core:local-zk --load .
```

To use the older `localterp` image instead:

```bash
TERP_IMAGE_VERSION=localterp just test-rs
```

---

## What Gets Deployed

### Single-Chain Mode (`just test-rs`)

```
scripts/src/main.rs  deploy --network local --keep-alive
  |
  +-- 1. Spawn chain via ict-rs
  |     chain_spawn::spawn_local_chain()
  |     Image: terpnetwork/terp-core:local-zk
  |     Chain ID: 120u-1
  |     Genesis: uterp + uthiol, fast governance (90s), vote extensions enabled
  |     Faucet: port 5000 (uterp, uthiol)
  |
  +-- 2. Connect cw-orch Daemon to gRPC
  |
  +-- 3. Deploy contract suites (conditional on TerpNetworkDeployData fields)
  |     +-- CwSvgSuite: cw721-svg + cw-svg-minter + cw-infuser + shitstrap-factory
  |     +-- TerpAccountSuite: terp721-account + manifold minter
  |     +-- DaoDaoSuite: dao-core + proposal/voting/staking + calendar + externals
  |
  +-- 4. Print CONTRACT_ADDR lines
  |
  +-- 5. Block on Ctrl+C (--keep-alive)
  |
  +-- 6. Cleanup containers
```

### Dual-Chain + IBC Mode (`just test-rs-ibc`)

```
scripts/src/main.rs  deploy --network local --ibc --keep-alive
  |
  +-- 1. Spawn dual chain via ict-rs
  |     chain_spawn::spawn_dual_chain()
  |     Chain A: 120u-1, Chain B: 120u-2
  |     Hermes relayer: ibc-path (transfer channel)
  |     Both use local-zk image
  |
  +-- 2. Connect cw-orch to Chain A gRPC
  |
  +-- 3. Deploy suites on Chain A (same as single-chain)
  |
  +-- 4. Print Chain B endpoints (for IBC page testing)
  |
  +-- 5. Block on Ctrl+C
  |
  +-- 6. Cleanup: ic.close() (stops both chains + relayer)
```

---

## Chain Endpoints

### Single-Chain

| Service | URL | Notes |
|---------|-----|-------|
| RPC | Printed at startup | Dynamic host port |
| gRPC | Printed at startup | Dynamic host port |
| Faucet | `http://localhost:5000` | In-container |

The actual port numbers are printed by ict-rs on startup. They're also stored in the cw-orch `state.json`.

### Dual-Chain

Both chains get dynamic host ports. The startup output prints all four (gRPC + RPC for each chain). Hermes connects internally via Docker network.

---

## Deployed Contracts

After `just test-rs` completes deployment, you'll see output like:

```
--- Deployed Contracts ---
CONTRACT_ADDR:cw_svg_minter=terp1...
CONTRACT_ADDR:cw721_svg=terp1...
CONTRACT_ADDR:cw_infuser=terp1...
CONTRACT_ADDR:cw_shitstrap_factory=terp1...
CONTRACT_ADDR:terp_account_minter=terp1...
CONTRACT_ADDR:terp721_account=terp1...
CONTRACT_ADDR:dao_core=terp1...
CONTRACT_ADDR:dao_calendar=terp1...
```

These addresses are also persisted in `~/.cw-orchestrator/state.json`. View them anytime:

```bash
just status
# or: cd scripts && cargo run -- status
```

---

## Environment Variables

### Rust Scripts

| Variable | Default | Description |
|----------|---------|-------------|
| `TERP_IMAGE_REPO` | `terpnetwork/terp-core` | Docker image repository |
| `TERP_IMAGE_VERSION` | `local-zk` | Docker image tag |
| `RUST_LOG` | (none) | Log level: `info`, `debug`, `scripts=debug,ict_rs=info` |
| `ICT_KEEP_CONTAINERS` | `0` | Set to `1` to skip cleanup (keep containers for debugging) |
| `ICT_SHOW_LOGS` | (none) | `1` = dump on failure, `always` = always dump |
| `ZK_ROOT` | `~/ZK/terp-core` | Path to terp-core (for ZK contract artifacts) |

### Legacy Shell Scripts

| Variable | Default | Description |
|----------|---------|-------------|
| `HOT_WALLET_ADDRESS` | (none) | Fund a browser wallet via faucet |
| `SKIP_DOCKER` | `false` | Skip Docker startup |
| `SKIP_BUILD` | `false` | Skip Docker image build |
| `WEBSITE_PORT` | `3000` | Dev server port |
| `ENABLE_IBC` | `false` | Two-chain IBC testing |

---

## Faucet

The in-container faucet dispenses `uterp` and `uthiol`:

```bash
# Fund an address (from host)
curl "http://localhost:5000/faucet?address=terp1..."

# Check faucet status
curl "http://localhost:5000/status"
```

In the browser (dev mode), the No-Rick and other pages show a "Faucet" button when connected to chain `120u-1`. This calls the same endpoint via `lib/faucet.js`.

---

## Website Pages

After deploying, start the dev server and open pages:

```bash
# Start dev server (separate terminal)
just serve              # port 3000
# or: python3 serve.py

# Open in browser:
# http://localhost:3000/mint.html     — SVG minting
# http://localhost:3000/tabs.html     — Account names
# http://localhost:3000/ibc.html      — IBC transfers
# http://localhost:3000/no-rick.html  — ZK proof demo
# http://localhost:3000/oline.html    — O-Line SDL
# http://localhost:3000/passkey.html  — Passkey auth
```

Pages auto-detect `120u-1` chain from `public/config.json` and show the Faucet button in dev mode.

### No-Rick ZK Demo

Requires:
1. `terpnetwork/terp-core:local-zk` image (has halo2 verification in wasmvm)
2. ZK contract deployed (via `deploy_zk.rs` or manually)
3. `norick-wasm` built: `cd crates/zk/norick-wasm && wasm-pack build --target web --out-dir ../../../websites/terp.network/pkg/norick-wasm`
4. Proof file at `public/circuits/no_rick_proof.json` (copy from `terp-core/tests/interchaintest/circuits/`)

---

## Manual Step-by-Step (Rust)

If the `just` recipes don't work for your setup:

```bash
# 1. Build scripts crate
cd ~/websites/terp.network/scripts
cargo build

# 2. Single chain deploy
RUST_LOG=info cargo run -- deploy --network local --keep-alive

# 3. Dual chain + IBC
RUST_LOG=info cargo run -- deploy --network local --ibc --keep-alive

# 4. Attach to running chain (skip Docker spawn)
RUST_LOG=info cargo run -- deploy --network local --skip-spawn

# 5. Full multi-collection deploy
RUST_LOG=info cargo run -- deploy --network local --full --keep-alive

# 6. Stop containers manually
cargo run -- stop
# or: docker ps -q --filter label=ict-rs | xargs docker rm -f
```

---

## Cleanup

### Rust (automatic)
Ctrl+C during `--keep-alive` triggers cleanup automatically. ict-rs removes containers, volumes, and networks.

### Manual
```bash
# Stop all ict-rs containers
just stop
# or:
cd scripts && cargo run -- stop
# or:
docker ps -q --filter label=ict-rs | xargs docker rm -f
```

### Debug (keep containers alive)
```bash
ICT_KEEP_CONTAINERS=1 just test-rs
# Containers stay running after Ctrl+C
# Inspect: docker ps --filter label=ict-rs
# Clean up later: just stop
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `local-zk` image not found | Build it: `cd ~/ZK/terp-core && docker buildx build --target local-zk -t terpnetwork/terp-core:local-zk --load .` |
| gRPC connection refused | Chain may still be starting. Check: `docker logs <container>`. ict-rs waits for first block automatically. |
| "insufficient funds" from cw-orch | Faucet sends uterp; uthiol comes from genesis. Ensure `bootstrap_local.sh` or `modify_genesis` runs correctly. |
| Contract address not in state.json | Check deploy output for errors. Run `just status` to inspect state. |
| Port conflict | Stop existing containers: `just stop` or `docker ps` |
| IBC transfer not relaying | Check Hermes logs. Ensure both chains are producing blocks. Try `ICT_SHOW_LOGS=always` to see relay logs. |
| WASM not loading in browser | Build with wasm-pack first. Check browser console for CORS errors. Ensure dev server is running. |
| `cargo check` fails on scripts | Ensure all path deps exist: `~/abstract/`, `~/abstract/dao-contracts/`, `~/terp-rs/crates/public/` |

---

## Repository Layout

```
~/websites/terp.network/
  scripts/
    src/
      main.rs            # CLI: deploy, stop, status
      chain_spawn.rs     # ict-rs chain spawn (single + dual)
      suite.rs           # TerpNetworkSuite: cw-orch deploy
      deploy_data.rs     # TerpNetworkDeployData config
      deploy_zk.rs       # ZK contract deployment via chain_exec
      lib.rs             # module re-exports
    Cargo.toml           # deps: cw-orch, ict-rs, dao-testing, etc.
  tests/
    README.md            # this file
    local-test-env.sh    # legacy shell orchestrator
    PLAN.md              # architecture docs
  lib/
    faucet.js            # dev faucet client
    norick.js            # No-Rick WASM loader
    ibc-client.js        # IBC / Skip Go client
    ...                  # contract bundle JS modules
  pages/
    no-rick.html         # ZK proof demo
    mint.html            # SVG minting
    ibc.html             # IBC transfers
    ...
  public/
    config.json          # chain configs, contract addresses, app list
  justfile               # build recipes (just test-rs, etc.)
```
