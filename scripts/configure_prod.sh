#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# configure_prod.sh — Inject mainnet values into public/config.json
#
# Local-first: reads live addresses from ~/.cw-orchestrator/state.json
# (cw-orch deploy state). Does NOT deploy or contact groot2.
#
# Usage:
#   ./scripts/configure_prod.sh
#   CW_ORCH_STATE=/path/to/state.json ./scripts/configure_prod.sh
#   ./scripts/configure_prod.sh --dry-run   # print resolved values only
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CONFIG="$WEBSITE_DIR/public/config.json"
DRY_RUN=0
if [ "${1:-}" = "--dry-run" ]; then
    DRY_RUN=1
fi

if [ ! -f "$CONFIG" ]; then
    echo "[x] $CONFIG not found" >&2
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo "[x] jq is required: brew install jq" >&2
    exit 1
fi

# ── Mainnet values ────────────────────────────────────────────────
CHAIN_ID="morocco-1"
CHAIN_NAME="Terp Network"
RPC="https://rpc.terp.network"
REST="https://api.terp.network"
# public gRPC is typically TLS-terminated at the edge; prefer https hostname form
GRPC="${GRPC:-https://grpc.terp.network}"
CW_ORCH_STATE="${CW_ORCH_STATE:-$HOME/.cw-orchestrator/state.json}"

# Read a contract address from cw-orchestrator state file.
# Tries each key name in order (cw-orch id variants differ by crate).
orch_addr() {
    local chain_id="$1"
    shift
    local file="${CW_ORCH_STATE}"
    local name val
    [ -f "$file" ] || return 0
    for name in "$@"; do
        val=$(jq -r --arg c "$chain_id" --arg n "$name" '.[$c].default[$n] // empty' "$file")
        if [ -n "$val" ] && [ "$val" != "null" ]; then
            printf '%s' "$val"
            return 0
        fi
    done
    return 0
}

if [ ! -f "$CW_ORCH_STATE" ]; then
    echo "[!] cw-orchestrator state not found: $CW_ORCH_STATE" >&2
    echo "    Contract fields will be left empty where not resolved." >&2
else
    echo "[+] Reading contract addresses from $CW_ORCH_STATE"
fi

# Map config.json contract keys → possible cw-orch state keys
# (see ~/.cw-orchestrator/state.json morocco-1.default)
ADDR_CW721_SVG=$(orch_addr "$CHAIN_ID" "cw721_svg" "cw721-svg" "crates.io:cw721-svg")
ADDR_TERP721_ACCOUNT=$(orch_addr "$CHAIN_ID" "crates.io:terp721-account" "terp721-account" "terp721_account")
ADDR_ACCOUNT_MINTER=$(orch_addr "$CHAIN_ID" "crates.io:terp721-account-manifold" "terp721-account-manifold" "terp721_account_manifold")
ADDR_CW_SVG_MINTER=$(orch_addr "$CHAIN_ID" "cw-svg-minter" "cw_svg_minter")
ADDR_CW_INFUSION_MINTER=$(orch_addr "$CHAIN_ID" "cw-infuser" "cw_infuser")
ADDR_SHITSTRAP_FACTORY=$(orch_addr "$CHAIN_ID" "cw-shitstrap-factory" "cw_shitstrap_factory")
# optional / often empty on mainnet until deployed
ADDR_HEADSTASH=$(orch_addr "$CHAIN_ID" "headstash" "crates.io:headstash")
ADDR_HEADSTASH_MANIFOLD=$(orch_addr "$CHAIN_ID" "headstash-manifold" "headstash_manifold")
ADDR_DAO_CALENDAR=$(orch_addr "$CHAIN_ID" "dao-calendar" "dao_calendar" "crates.io:dao-calendar")
ADDR_WHITELIST=$(orch_addr "$CHAIN_ID" "whitelist-mtree" "whitelist_mtree" "whitelist-merkletree")
# Abstract stack (optional keys in config under contracts.abstract*)
ADDR_ABS_REGISTRY=$(orch_addr "$CHAIN_ID" "abstract:registry")
ADDR_ABS_ANS=$(orch_addr "$CHAIN_ID" "abstract:ans-host")
ADDR_ABS_IBC_CLIENT=$(orch_addr "$CHAIN_ID" "abstract:ibc-client")
ADDR_ABS_IBC_HOST=$(orch_addr "$CHAIN_ID" "abstract:ibc-host")
ADDR_ABS_MODULE_FACTORY=$(orch_addr "$CHAIN_ID" "abstract:module-factory")

MERKLE_SERVER_URL="${MERKLE_SERVER_URL:-}"
INDEXER_URL="${INDEXER_URL:-}"
HEADSTASH_SERVER_URL="${HEADSTASH_SERVER_URL:-}"

echo "[+] Configuring config.json for mainnet ($CHAIN_ID)"
echo ""
echo "  Chain:"
echo "    chainId   : $CHAIN_ID"
echo "    rpc       : $RPC"
echo "    rest      : $REST"
echo "    grpc      : $GRPC"
echo ""
echo "  Contracts (from cw-orch):"
echo "    cw721Svg           : ${ADDR_CW721_SVG:-(not set)}"
echo "    terp721Account     : ${ADDR_TERP721_ACCOUNT:-(not set)}"
echo "    accountMinter      : ${ADDR_ACCOUNT_MINTER:-(not set)}"
echo "    cwSvgMinter        : ${ADDR_CW_SVG_MINTER:-(not set)}"
echo "    cwInfusionMinter   : ${ADDR_CW_INFUSION_MINTER:-(not set)}"
echo "    shitstrapFactory   : ${ADDR_SHITSTRAP_FACTORY:-(not set)}"
echo "    headstash          : ${ADDR_HEADSTASH:-(not set)}"
echo "    daoCalendar        : ${ADDR_DAO_CALENDAR:-(not set)}"
echo "    whitelist (info)   : ${ADDR_WHITELIST:-(not set)}"
echo ""
echo "  Services:"
echo "    merkleServer       : ${MERKLE_SERVER_URL:-(not set)}"
echo "    indexer            : ${INDEXER_URL:-(not set)}"
echo "    headstashServer    : ${HEADSTASH_SERVER_URL:-(not set)}"
echo ""

if [ "$DRY_RUN" -eq 1 ]; then
    echo "[+] Dry run — config.json not modified."
    exit 0
fi

# Preserve existing contract fields; only overwrite when we resolved a non-empty address.
jq --arg cid "$CHAIN_ID" \
   --arg cname "$CHAIN_NAME" \
   --arg rpc "$RPC" \
   --arg rest "$REST" \
   --arg grpc "$GRPC" \
   --arg cw721svg "$ADDR_CW721_SVG" \
   --arg terp721acc "$ADDR_TERP721_ACCOUNT" \
   --arg accMinter "$ADDR_ACCOUNT_MINTER" \
   --arg svgMinter "$ADDR_CW_SVG_MINTER" \
   --arg infMinter "$ADDR_CW_INFUSION_MINTER" \
   --arg sstrapFact "$ADDR_SHITSTRAP_FACTORY" \
   --arg headstash "$ADDR_HEADSTASH" \
   --arg headstashManifold "$ADDR_HEADSTASH_MANIFOLD" \
   --arg daoCalendar "$ADDR_DAO_CALENDAR" \
   --arg absRegistry "$ADDR_ABS_REGISTRY" \
   --arg absAns "$ADDR_ABS_ANS" \
   --arg absIbcClient "$ADDR_ABS_IBC_CLIENT" \
   --arg absIbcHost "$ADDR_ABS_IBC_HOST" \
   --arg absModFactory "$ADDR_ABS_MODULE_FACTORY" \
   --arg merkle "$MERKLE_SERVER_URL" \
   --arg indexer "$INDEXER_URL" \
   --arg headstashServer "$HEADSTASH_SERVER_URL" \
   '
   def setif($v): if ($v | length) > 0 then $v else . end;
   .chains[$cid] = ((.chains[$cid] // {}) * {
        chainId: $cid,
        chainName: $cname,
        rpc: $rpc,
        rest: $rest,
        grpc: $grpc
   })
   | .chains[$cid].contracts = ((.chains[$cid].contracts // {})
        | .cw721Svg |= setif($cw721svg)
        | .terp721Account |= setif($terp721acc)
        | .accountMinter |= setif($accMinter)
        | .cwSvgMinter |= setif($svgMinter)
        | .cwInfusionMinter |= setif($infMinter)
        | .shitstrapFactory |= setif($sstrapFact)
        | .headstash |= setif($headstash)
        | .headstashManifold |= setif($headstashManifold)
        | .daoCalendar |= setif($daoCalendar)
        | .abstractRegistry |= setif($absRegistry)
        | .abstractAnsHost |= setif($absAns)
        | .abstractIbcClient |= setif($absIbcClient)
        | .abstractIbcHost |= setif($absIbcHost)
        | .abstractModuleFactory |= setif($absModFactory)
   )
   | .chains[$cid].services = ((.chains[$cid].services // {})
        | .merkleServer |= setif($merkle)
        | .indexer |= setif($indexer)
        | .headstashServer |= setif($headstashServer)
   )
   ' "$CONFIG" > "${CONFIG}.tmp" && mv "${CONFIG}.tmp" "$CONFIG"

pending=0
for v in "$ADDR_CW721_SVG" "$ADDR_TERP721_ACCOUNT" "$ADDR_ACCOUNT_MINTER" \
         "$ADDR_CW_SVG_MINTER" "$ADDR_CW_INFUSION_MINTER" "$ADDR_SHITSTRAP_FACTORY"; do
    [ -z "$v" ] && pending=1
done

if [ "$pending" -eq 1 ]; then
    echo "[!] Some core contracts unresolved — check cw-orch key names in $CW_ORCH_STATE"
    echo "    Expected keys under morocco-1.default, e.g.:"
    echo "      cw721_svg, crates.io:terp721-account, crates.io:terp721-account-manifold,"
    echo "      cw-svg-minter, cw-infuser, cw-shitstrap-factory"
    echo ""
fi

echo "[+] Done. Next (local only): just build-config && just verify-config && just build"
echo "    Deploy to MinIO/groot2 is intentionally separate."
