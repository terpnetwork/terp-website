#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# sync-bundles.sh — Build & sync contract TS bundles into website/lib/
#
# Regenerates TypeScript clients from contract schemas, bundles them
# with esbuild, and copies the ESM output to the website's lib/ dir.
#
# Usage:
#   ./tests/sync-bundles.sh              # rebuild + copy all
#   ./tests/sync-bundles.sh --copy-only  # skip codegen, just copy existing dist/
#   ./tests/sync-bundles.sh --list       # show what would be copied
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
LIB_DIR="$WEBSITE_DIR/lib"

# ─── Bundle sources ──────────────────────────────────────────────
# Each entry: <repo_root>|<ts_dir_relative_to_repo>|<bundle1>,<bundle2>,...
#
# To add a new contract repo, append a line here.
# The bundle names match the `outName` field in that repo's codegen.ts.
BUNDLE_SOURCES=(
    "$HOME/terp-account-billboards|scripts/ts|account-minter,terp721-account"
    "$HOME/cw-infuser|scripts/ts|cw-infuser,cw721-svg,cw-svg-minter,cw-infuser-factory,whitelist-merkletree"
    "$HOME/shitstrap|scripts/ts|cw-shitstrap,cw-shitstrap-factory"
)

# ─── Colors ──────────────────────────────────────────────────────
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
CYAN='\033[0;36m'
NC='\033[0m'
log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

# ─── Flags ───────────────────────────────────────────────────────
COPY_ONLY=false
LIST_ONLY=false
for arg in "$@"; do
    case "$arg" in
        --copy-only) COPY_ONLY=true ;;
        --list)      LIST_ONLY=true ;;
        -h|--help)
            echo "Usage: $0 [--copy-only] [--list]"
            echo "  --copy-only  Skip codegen/build, just copy existing dist/ bundles"
            echo "  --list       Show what would be copied without doing anything"
            exit 0
            ;;
        *) err "Unknown flag: $arg"; exit 1 ;;
    esac
done

# ─── Main ────────────────────────────────────────────────────────
mkdir -p "$LIB_DIR"

total=0
for source in "${BUNDLE_SOURCES[@]}"; do
    IFS='|' read -r repo_root ts_rel bundles_csv <<< "$source"
    ts_dir="$repo_root/$ts_rel"
    dist_esm="$ts_dir/dist/esm"

    repo_name=$(basename "$repo_root")

    if [ ! -d "$ts_dir" ]; then
        warn "Skipping $repo_name — $ts_dir not found"
        continue
    fi

    echo -e "\n${CYAN}── $repo_name ──${NC}"

    # Rebuild if not --copy-only / --list
    if [ "$COPY_ONLY" = false ] && [ "$LIST_ONLY" = false ]; then
        if [ ! -f "$ts_dir/package.json" ]; then
            warn "No package.json in $ts_dir — skipping build"
        else
            log "Running codegen in $ts_dir ..."
            (cd "$ts_dir" && npm run codegen)
        fi
    fi

    # Copy each bundle
    IFS=',' read -ra bundle_names <<< "$bundles_csv"
    for name in "${bundle_names[@]}"; do
        src="$dist_esm/${name}.js"
        dst="$LIB_DIR/${name}.js"

        if [ "$LIST_ONLY" = true ]; then
            if [ -f "$src" ]; then
                echo "  $src -> $dst"
            else
                echo "  $src  (NOT FOUND)"
            fi
            continue
        fi

        if [ ! -f "$src" ]; then
            warn "  ${name}.js not found at $dist_esm — run codegen first?"
            continue
        fi

        cp "$src" "$dst"
        # Copy sourcemap if available
        [ -f "${src}.map" ] && cp "${src}.map" "${dst}.map"
        log "  ${name}.js"
        total=$((total + 1))
    done
done

if [ "$LIST_ONLY" = true ]; then
    echo ""
    log "Dry run — no files copied"
else
    echo ""
    log "Synced $total bundle(s) to $LIB_DIR"
fi
