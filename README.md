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

The installer will automatically:

1. Check/install Python 3.6+
2. Guide you through selecting installation type (node/client/localterp)
3. Help you choose network (mainnet/testnet)
4. Configure your node settings
5. Optionally install cosmovisor and systemd service

### Command-Line Options

You can also use flags to skip certain prompts:

```bash
curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --install node --network morocco-1 --moniker "my-node"
```

**Available flags:**

- `--install <node|client|localterp>` - Installation type
- `--network <morocco-1|90u-4>` - Network to join
- `--home <path>` - Installation directory (default: ~/.terp)
- `--moniker <name>` - Node moniker (default: terp)
- `--pruning <default|nothing|everything>` - Pruning settings
- `--cosmovisor` - Install with cosmovisor
- `--service` - Setup systemd service (Linux only)
- `--overwrite` - Overwrite existing installation

### Alternative: UV Tool

```bash
uvx --from terp-core terpd
```

⚠️ **Security Note:** Always verify checksums from multiple trusted sources (GitHub releases, official documentation, etc.) to ensure the checksums themselves haven't been tampered with.

## Running Locally
  
## Deployment
  
## Installation Script Endpoints

- `/get` - Shell wrapper script (downloads and runs Python installer)
- `/run` - Python installer script (main installation logic)
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
