#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# build-config.sh — Compute SHA-256 checksums into public/config.json
#
# Hashes all installer scripts and lib bundles, writing the results
# into the checksums section of config.json. Run before docker build
# so the served config includes integrity hashes for client-side
# verification.
#
# Usage:
#   ./scripts/build-config.sh            # compute & write checksums
#   ./scripts/build-config.sh --verify   # check files match existing checksums
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# scripts/ is one level under the website root (terp.network/)
WEBSITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$WEBSITE_DIR/public/config.json"

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

if [ ! -f "$CONFIG" ]; then
    echo -e "${RED}[x]${NC} $CONFIG not found" >&2
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo -e "${RED}[x]${NC} jq is required: brew install jq" >&2
    exit 1
fi

# ─── SHA-256 portable helper ──────────────────────────────────────
sha256_file() {
    if command -v shasum &>/dev/null; then
        shasum -a 256 "$1" | cut -d' ' -f1
    elif command -v sha256sum &>/dev/null; then
        sha256sum "$1" | cut -d' ' -f1
    else
        echo -e "${RED}[x]${NC} No sha256 tool found" >&2
        exit 1
    fi
}

# ─── Verify mode ─────────────────────────────────────────────────
if [ "${1:-}" = "--verify" ]; then
    ok=0; fail=0; skip=0
    for section in installers bundles; do
        keys=$(jq -r ".checksums.$section | keys[]" "$CONFIG")
        for key in $keys; do
            filepath="$WEBSITE_DIR/$key"
            expected=$(jq -r ".checksums.$section[\"$key\"]" "$CONFIG")
            if [ ! -f "$filepath" ]; then
                echo -e "  ${YELLOW}SKIP${NC}  $key (file not found)"
                skip=$((skip + 1))
                continue
            fi
            if [ -z "$expected" ]; then
                echo -e "  ${YELLOW}SKIP${NC}  $key (no checksum recorded)"
                skip=$((skip + 1))
                continue
            fi
            actual=$(sha256_file "$filepath")
            if [ "$actual" = "$expected" ]; then
                echo -e "  ${GREEN}OK${NC}    $key"
                ok=$((ok + 1))
            else
                echo -e "  ${RED}FAIL${NC}  $key"
                echo "         expected: $expected"
                echo "         actual:   $actual"
                fail=$((fail + 1))
            fi
        done
    done
    echo ""
    echo "$ok ok, $fail failed, $skip skipped"
    [ "$fail" -eq 0 ]
    exit
fi

# ─── Build mode: compute checksums ──────────────────────────────
echo -e "${GREEN}[+]${NC} Computing checksums..."

tmp=$(mktemp)
cp "$CONFIG" "$tmp"

for section in installers bundles; do
    keys=$(jq -r ".checksums.$section | keys[]" "$CONFIG")
    for key in $keys; do
        filepath="$WEBSITE_DIR/$key"
        if [ ! -f "$filepath" ]; then
            echo -e "  ${YELLOW}SKIP${NC}  $key (not found)"
            continue
        fi
        hash=$(sha256_file "$filepath")
        tmp2=$(mktemp)
        jq ".checksums.$section[\"$key\"] = \"$hash\"" "$tmp" > "$tmp2"
        mv "$tmp2" "$tmp"
        echo -e "  ${GREEN}OK${NC}    $key  $hash"
    done
done

mv "$tmp" "$CONFIG"
echo ""
echo -e "${GREEN}[+]${NC} Checksums written to $CONFIG"
