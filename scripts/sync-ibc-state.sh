#!/usr/bin/env bash
# sync-ibc-state.sh — Refresh IBC inventory used by the site fallback path.
#
# Live path: LCD + optional ibc-proxy.
# Fallback:  cw-orch state.json → morocco-1.ibc_data
#            (S3 URL + same-origin public/ibc-state.json)
#
# Generator (critical): terp-rs scripts bin `ibc` (tests/bin/ibc_info.rs)
#   uses cw-orchestrator Daemon + Ibc querier to scrape clients / connections /
#   channels and write schema-compliant ibc_data into state + public/ibc-data/.
#
# Usage:
#   ./scripts/sync-ibc-state.sh              # extract from existing state only
#   ./scripts/sync-ibc-state.sh --scrape     # run cargo bin ibc, then extract
#   ./scripts/sync-ibc-state.sh --from-s3    # download published state, extract
#   TERP_RS=/path/to/terp-rs ./scripts/sync-ibc-state.sh --scrape
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
# terp-core/crates/terp-rs (monorepo layout)
DEFAULT_TERP_RS="$(cd "$SITE_DIR/../../crates/terp-rs" 2>/dev/null && pwd || true)"
TERP_RS="${TERP_RS:-$DEFAULT_TERP_RS}"
OUT_JSON="$SITE_DIR/public/ibc-state.json"
S3_STATE_URL="${S3_STATE_URL:-https://s3.terp.network/snapshots/mainnet/morocco-1/state.json}"
CHAIN_ID="${CHAIN_ID:-morocco-1}"

SCRAPE=0
FROM_S3=0
for arg in "$@"; do
  case "$arg" in
    --scrape) SCRAPE=1 ;;
    --from-s3) FROM_S3=1 ;;
    -h|--help)
      sed -n '2,20p' "$0"
      exit 0
      ;;
  esac
done

tmpdir="$(mktemp -d)"
trap 'rm -rf "$tmpdir"' EXIT
STATE_FILE=""

if [[ "$SCRAPE" -eq 1 ]]; then
  if [[ -z "$TERP_RS" || ! -d "$TERP_RS/tests" ]]; then
    echo "❌ TERP_RS not found (looked for crates/terp-rs). Set TERP_RS=/path/to/terp-rs"
    exit 1
  fi
  echo "==> Scraping live IBC via cw-orch (cargo run -p scripts --bin ibc)"
  echo "    cwd: $TERP_RS/tests"
  (
    cd "$TERP_RS/tests"
    # Binary name is `ibc` (path tests/bin/ibc_info.rs)
    cargo run -p scripts --bin ibc --release
  )
  # Prefer public/state.json written next to ibc-data
  if [[ -f "$TERP_RS/public/state.json" ]]; then
    STATE_FILE="$TERP_RS/public/state.json"
  elif [[ -f "${HOME}/.cw-orchestrator/state.json" ]]; then
    STATE_FILE="${HOME}/.cw-orchestrator/state.json"
  else
    echo "⚠ scrape finished but no state.json found — try --from-s3 or point at a state file"
  fi
fi

if [[ -z "$STATE_FILE" && "$FROM_S3" -eq 1 ]]; then
  echo "==> Downloading $S3_STATE_URL"
  curl -fsSL --max-time 60 "$S3_STATE_URL" -o "$tmpdir/state.json"
  STATE_FILE="$tmpdir/state.json"
fi

if [[ -z "$STATE_FILE" ]]; then
  # Prefer local terp-rs public, then S3
  if [[ -n "$TERP_RS" && -f "$TERP_RS/public/state.json" ]]; then
    STATE_FILE="$TERP_RS/public/state.json"
    echo "==> Using $STATE_FILE"
  else
    echo "==> No local state — downloading $S3_STATE_URL"
    curl -fsSL --max-time 60 "$S3_STATE_URL" -o "$tmpdir/state.json"
    STATE_FILE="$tmpdir/state.json"
  fi
fi

echo "==> Extracting $CHAIN_ID.ibc_data → $OUT_JSON"
python3 - "$STATE_FILE" "$OUT_JSON" "$CHAIN_ID" <<'PY'
import json, sys, time
from pathlib import Path

src, dest, chain_id = sys.argv[1], sys.argv[2], sys.argv[3]
state = json.loads(Path(src).read_text())
slice_ = state.get(chain_id) or state.get("morocco-1") or {}
ibc = slice_.get("ibc_data") or {}
if isinstance(ibc, dict):
    ibc = {
        k: v
        for k, v in ibc.items()
        if k
        and isinstance(v, dict)
        and (v.get("chain_1") or v.get("chain_2") or v.get("channels"))
    }
if not ibc:
    print(f"ERROR: no ibc_data for {chain_id} in {src}", file=sys.stderr)
    sys.exit(1)

out = {
    "chainId": chain_id,
    "source": "local-state",
    "updatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    "generatedFrom": str(Path(src).resolve()),
    "note": (
        "IBC inventory fallback for terp.network. "
        "Regenerate with: websites/terp.network/scripts/sync-ibc-state.sh --scrape "
        "(runs terp-rs `cargo run -p scripts --bin ibc` via cw-orchestrator)."
    ),
    "ibc_data": ibc,
}
Path(dest).parent.mkdir(parents=True, exist_ok=True)
Path(dest).write_text(json.dumps(out, indent=2) + "\n")
print(f"  ✓ {len(ibc)} counterparty entries, {Path(dest).stat().st_size} bytes")
for k in sorted(ibc.keys()):
    chans = ibc[k].get("channels") or []
    print(f"    - {k}: {len(chans)} channel(s), status={ibc[k].get('client_status', '?')}")
PY

echo ""
echo "✅ IBC state extract ready: $OUT_JSON"
echo "   Site fallback order: LCD → proxy → S3 stateJson → this local file"
echo "   Rebuild/deploy site after sync: (cd $SITE_DIR && node build.js && ./scripts/deploy-sites.sh)"
echo "   Publish full state.json to S3 separately (minio/mc) when scrape updated contracts+ibc_data."
