# Terp Network Website

Official website for Terp Network, featuring the terp-core installer integration.

## Shared frontend runtime (2026-07)

| Module | Role |
|--------|------|
| `lib/config.js` | Load `public/config.json`, chain detect, Keplr suggest builders |
| `lib/wallet.js` | Single session (`terp-wallet-v1` + `terp:wallet` events) |
| `lib/pmoney-egg.js` | permissionless.money **easter-egg** generative mint inside SVG page |
| `lib/ibc-core.js` | Live IBC channels (LCD + proxy), balances, foundation relayer helpers |
| `lib/ibc-fund-bar.js` | Deposit desk UI for foundation relayer gas wallets |
| `lib/ibc-page.js` | Boots `ibc.html` onto live data + shared wallet |
| `lib/fab.js` | Nav FAB that listens to shared wallet (no parallel stack) |

**Pages wired:** `tabs.html`, `svg.html`, `ibc.html`, `no-rick.html`.

**IBC foundation funding:** addresses + recommended amounts live in `public/config.json` → `ibc.foundationRelayers` (also rendered on the homepage and `ibc.html` fund bar). Balances load live from each chain LCD where available.

**Installer checksums:** homepage “Verify” hashes `get/terp-installer.sh` (+ py) client-side, compares on-chain account TextRecords when queryable, then falls back to `checksums.installers` in config.json (from `scripts/build-config.sh`).

**norick-wasm rebuild:** see comments at top of `lib/norick.js` (`wasm-pack build --target web` into `pkg/`).

**p.money egg unlock (on `/svg.html`):** Konami code, 5× click page title, or `?egg=pmoney`.

```bash
just serve          # local :3000
# optional chain: ?chain=120u-1 or localStorage terp-chain-id
```

## TODO
- migrate `no-rick.html` + `ibc.html` onto `TerpWallet`
- smart-account / text-records UI
- vendor cosmes (drop esm.sh runtime risk)
- indexer-backed balance queries
- IBC tx preview hardening

## Features
- wallet connecting && chain client via cosmes: <https://www.npmjs.com/package/@goblinhunt/cosmes>
- zero-config installer for terp-core
- svg collection mint, browse and view
- terp-account-billboard (TAB) nft mints
- local testing suite for development sessions

## Installation Scripts

### Quick Install (Interactive)

**One-line install:**

```bash
curl -fsSL https://terp.network/get/terp-installer.sh | bash
```

The installer resolves the terpd version from terp-core `versions.json` at fetch time (last `recommended_version` for the network; testnet uses the release channel until `versions.json` has 120u-1 entries), prints it, downloads the matching build and verifies it against the release `sha256sum.txt`. With no published build for your platform (e.g. darwin) it builds from source. Then it runs `terpd bootstrap` (init, genesis, state-sync or snapshot, pruning, cosmovisor, systemd).

### Command-Line Options

```bash
curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --help
curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --dry-run --network 120u-1
curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --network morocco-1 --version vX.Y.Z
```

**Installer flags:** `--network <morocco-1|120u-1>`, `--version <x.y.z>`, `--dry-run`, `-y/--yes`, `--non-interactive`, `-h/--help`. All other flags (`--home`, `--moniker`, `--sync-mode`, `--pruning`, `--cosmovisor`, `--service`, `--setup-only`, ...) are passed to `terpd bootstrap`.

### Alternative: UV Tool

```bash
uvx --from terp-core terpd
```

⚠️ **Security Note:** Always verify checksums from multiple trusted sources (GitHub releases, official documentation, etc.) to ensure the checksums themselves haven't been tampered with.

## Running Locally
  
## Deployment
  
## Installation Script Endpoints

- `/get/terp-installer.sh` - The installer (`curl -fsSL https://terp.network/get/terp-installer.sh | bash`)
- `/get/` - Directory access for individual files and checksum verification

## Development

The website uses:

- Pure HTML/CSS/JavaScript (no build tools required)
- Satoshi font from CDN Fonts
- SVG graphics for icons and logos
- Canvas API for animated background effects

## Links

- Documentation: <https://docs.terp.network>
- GitHub: <https://github.com/terpnetwork>
- Twitter: <https://x.com/terpnetofficial>
- Discord: <https://discord.gg/W3QnHe77S6>

## License

See the main Terp Network repository for licensing information.
