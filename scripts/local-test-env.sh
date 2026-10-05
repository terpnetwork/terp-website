#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════
# local-test-env.sh — Full local test environment for terp.network
#
# Spins up localterp, deploys all contracts, configures the website,
# and starts the dev server. One command to go from zero to testable.
#
# Usage:
#   ./tests/local-test-env.sh
#   HOT_WALLET_ADDRESS=terp1abc... ./tests/local-test-env.sh
#   SKIP_DOCKER=true ./tests/local-test-env.sh   # chain already running
# ═══════════════════════════════════════════════════════════════════
set -euo pipefail

# ─── Paths ─────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WEBSITE_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
CW_INFUSER_DIR="$HOME/cw-infuser"
TERP_ACCOUNTS_DIR="$HOME/terp-account-billboards"
TERP_CORE_DIR="$HOME/terp-core"
CW_ORCH_STATE="$HOME/.cw-orchestrator/state_local.json"

# ─── Config ────────────────────────────────────────────────────
CHAIN_ID="240u-1"
CHAIN_RPC="http://localhost:26657"      # direct chain RPC (health checks, docker exec)
LOCAL_RPC="http://localhost:3000/rpc"  # browser-facing RPC (proxied by serve.py, no CORS)
LOCAL_REST="http://localhost:1317"
LOCAL_GRPC="http://localhost:9090"
LOCAL_FAUCET="http://localhost:5000"
CONTAINER_NAME="localterp"
DOCKER_IMAGE="terpnetwork/terp-core:localterp"
WEBSITE_PORT="${WEBSITE_PORT:-3000}"

# ─── Local env (single source of truth for deploy mnemonic) ───
ENV_LOCAL="$SCRIPT_DIR/.env.local"
if [ ! -f "$ENV_LOCAL" ]; then
    echo "Missing $ENV_LOCAL — create it with LOCAL_MNEMONIC=\"your 24-word mnemonic\""
    exit 1
fi
# shellcheck source=.env.local
source "$ENV_LOCAL"

if [ -z "${LOCAL_MNEMONIC:-}" ]; then
    echo "LOCAL_MNEMONIC not set in $ENV_LOCAL"
    exit 1
fi
DEPLOYER_MNEMONIC="$LOCAL_MNEMONIC"

# Propagate .env.local to both deploy repos so cw-orch picks up LOCAL_MNEMONIC
cp "$ENV_LOCAL" "$CW_INFUSER_DIR/.env"
cp "$ENV_LOCAL" "$TERP_ACCOUNTS_DIR/.env"

# Optional: fund this address for browser wallet testing
HOT_WALLET_ADDRESS="${HOT_WALLET_ADDRESS:-}"
if [ -z "$HOT_WALLET_ADDRESS" ]; then
    echo -n "Hot wallet address to fund (or Enter to skip): "
    read -r HOT_WALLET_ADDRESS
fi

# Control flags
SKIP_DOCKER="${SKIP_DOCKER:-false}"
SKIP_BUILD="${SKIP_BUILD:-false}"
ENABLE_AKASH="${ENABLE_AKASH:-false}"
ENABLE_IBC="${ENABLE_IBC:-false}"

# Chain B (second local chain for IBC testing)
CHAIN2_ID="120u-2"
CHAIN2_CONTAINER="localterp-2"
CHAIN2_RPC_PORT=26658
CHAIN2_REST_PORT=1318
CHAIN2_GRPC_PORT=9091
CHAIN2_FAUCET_PORT=5001
CHAIN2_RPC="http://localhost:$CHAIN2_RPC_PORT"
CHAIN2_REST="http://localhost:$CHAIN2_REST_PORT"
CHAIN2_FAUCET="http://localhost:$CHAIN2_FAUCET_PORT"

# Akash devnet paths
OLINE_DIR="${OLINE_DIR:-$HOME/o-line}"
AKASH_DEVNET_SCRIPT="$OLINE_DIR/tests/akash-devnet.sh"

# Akash devnet state (populated in start_akash_devnet)
AKASH_RPC=""
AKASH_REST=""
AKASH_GRPC=""
AKASH_PROVIDER=""
AKASH_CHAIN_ID=""
AKASH_FAUCET_MNEMONIC=""
AKASH_DEPLOYER_MNEMONIC=""

# IBC test denoms (populated in ibc_test_transfers)
TF_DENOM_IBC_TEST_A=""
TF_DENOM_IBC_TEST_B=""

# Captured contract addresses (populated during deployment)
ADDR_CW_SVG_MINTER=""
ADDR_CW721_SVG=""
ADDR_CW_INFUSION_MINTER=""
ADDR_TERP721_ACCOUNT=""
ADDR_TERP721_MANIFOLD=""
ADDR_SHITSTRAP_FACTORY=""
MERKLE_SERVER_URL="${MERKLE_SERVER_URL:-}"
DOCS_PID=""
DOCS_DIR="$HOME/websites/terp-docs"

# Tokenfactory denoms created during bootstrap (set in mint_tokenfactory_tokens)
TF_DENOM_ATOM=""
TF_DENOM_BTC=""
TF_DENOM_AKT=""
TF_DENOM_ETH=""
TF_DENOM_USDC=""

# ─── Portable in-place sed (no .bak files) ─────────────────────
sedi() {
    if [[ "$(uname)" == "Darwin" ]]; then
        sed -i '' "$@"
    else
        sed -i "$@"
    fi
}

# ─── Colors ────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[+]${NC} $*"; }
warn() { echo -e "${YELLOW}[!]${NC} $*"; }
err()  { echo -e "${RED}[x]${NC} $*" >&2; }

# Read a contract address from cw-orchestrator state file
# Usage: orch_addr <chain_id> <contract_name> [state_file]
orch_addr() {
    local chain_id="$1" name="$2" file="${3:-$CW_ORCH_STATE}"
    [ -f "$file" ] || return 1
    jq -r ".[\"$chain_id\"].default[\"$name\"] // empty" "$file"
}
step() { echo -e "\n${CYAN}═══ $* ═══${NC}\n"; }

# ─── Prerequisites ─────────────────────────────────────────────
check_prereqs() {
    step "Checking prerequisites"

    # ── CLI tools ──
    local missing=()
    command -v docker >/dev/null || missing+=("docker")
    command -v cargo  >/dev/null || missing+=("cargo (Rust toolchain)")
    command -v jq     >/dev/null || missing+=("jq")
    command -v curl   >/dev/null || missing+=("curl")
    command -v python3 >/dev/null || missing+=("python3")

    if [ ${#missing[@]} -gt 0 ]; then
        err "Missing CLI tools: ${missing[*]}"
        exit 1
    fi

    # ── Expected crate directories ──
    local missing_dirs=()
    [ -d "$TERP_CORE_DIR" ]                             || missing_dirs+=("terp-core: $TERP_CORE_DIR")
    [ -d "$CW_INFUSER_DIR" ]                            || missing_dirs+=("cw-infuser: $CW_INFUSER_DIR")
    [ -d "$CW_INFUSER_DIR/artifacts" ]                  || missing_dirs+=("cw-infuser artifacts: $CW_INFUSER_DIR/artifacts (run optimizer)")
    [ -d "$TERP_ACCOUNTS_DIR" ]                         || missing_dirs+=("terp-account-billboards: $TERP_ACCOUNTS_DIR")
    [ -d "$TERP_ACCOUNTS_DIR/artifacts" ]               || missing_dirs+=("terp-account-billboards artifacts: $TERP_ACCOUNTS_DIR/artifacts (run optimizer)")

    if [ ${#missing_dirs[@]} -gt 0 ]; then
        err "Missing directories:"
        for d in "${missing_dirs[@]}"; do
            err "  - $d"
        done
        err "See tests/README.md for setup instructions."
        exit 1
    fi

    log "All prerequisites found"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 1: Docker — Start local chain
# ═══════════════════════════════════════════════════════════════
start_chain() {
    step "Phase 1: Starting local Terp chain"

    if [ "$SKIP_DOCKER" = "true" ]; then
        warn "SKIP_DOCKER=true — assuming chain is already running"
        return
    fi

    # Stop existing container if running
    if docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
        warn "Stopping existing $CONTAINER_NAME container..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
        sleep 2
    fi

    # Build image if needed
    if [ "$SKIP_BUILD" = "true" ]; then
        warn "SKIP_BUILD=true — skipping Docker image build"
    elif ! docker image inspect "$DOCKER_IMAGE" >/dev/null 2>&1; then
        log "Building localterp Docker image..."
        (cd "$TERP_CORE_DIR" && docker buildx build --target localterp -t "$DOCKER_IMAGE" --load .)
    else
        log "Docker image $DOCKER_IMAGE already exists"
    fi

    log "Starting $CONTAINER_NAME container..."
    docker run --rm -d \
        --name "$CONTAINER_NAME" \
        -p 26657:26657 \
        -p 1317:1317 \
        -p 8545:8545 \
        -p 9090:9090 \
        -p 5000:5000 \
        -v "$SCRIPT_DIR/post_init.sh:/root/post_init.sh" \
        "$DOCKER_IMAGE"

    log "Container started. Waiting for chain to produce blocks..."

    # Wait for health (up to 120s)
    # NOTE: avoid piping curl|jq inside `until` — pipefail causes
    # spurious failures when curl closes the connection before jq reads.
    local attempts=0
    local max_attempts=60
    local height=0
    while true; do
        height=$(curl -sf "$CHAIN_RPC/status" 2>/dev/null \
            | jq -r '.result.sync_info.latest_block_height // "0"' 2>/dev/null) || height="0"
        [[ "$height" =~ ^[0-9]+$ ]] && [ "$height" -gt 0 ] && break

        attempts=$((attempts + 1))
        if [ "$attempts" -ge "$max_attempts" ]; then
            err "Chain did not start within ${max_attempts}x2s. Check: docker logs $CONTAINER_NAME"
            exit 1
        fi
        [ $((attempts % 5)) -eq 0 ] && warn "Still waiting... (attempt $attempts/$max_attempts)"
        sleep 2
    done

    log "Chain is live at block $height"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 1b: Start second local chain for IBC testing
# ═══════════════════════════════════════════════════════════════
start_chain2() {
    # Only needed for local IBC mode (not Akash — that has its own chain B)
    if [ "$ENABLE_IBC" != "true" ] || [ "$ENABLE_AKASH" = "true" ]; then
        return
    fi

    step "Phase 1b: Starting second local Terp chain (${CHAIN2_ID})"

    # Stop existing container if running
    docker stop "$CHAIN2_CONTAINER" 2>/dev/null || true
    docker rm "$CHAIN2_CONTAINER" 2>/dev/null || true

    log "Starting $CHAIN2_CONTAINER container..."
    docker run --rm -d --name "$CHAIN2_CONTAINER" \
        -p ${CHAIN2_RPC_PORT}:26657 \
        -p ${CHAIN2_REST_PORT}:1317 \
        -p ${CHAIN2_GRPC_PORT}:9090 \
        -p ${CHAIN2_FAUCET_PORT}:5000 \
        -v "$SCRIPT_DIR/post_init_chain2.sh:/root/post_init.sh" \
        "$DOCKER_IMAGE"

    log "Waiting for $CHAIN2_ID to start..."
    local attempts=0
    local max_attempts=60
    local height=0
    while true; do
        height=$(curl -sf "$CHAIN2_RPC/status" 2>/dev/null \
            | jq -r '.result.sync_info.latest_block_height // "0"' 2>/dev/null) || height="0"
        [[ "$height" =~ ^[0-9]+$ ]] && [ "$height" -gt 0 ] && break

        attempts=$((attempts + 1))
        if [ "$attempts" -ge "$max_attempts" ]; then
            err "$CHAIN2_ID did not start within ${max_attempts}x2s. Check: docker logs $CHAIN2_CONTAINER"
            exit 1
        fi
        [ $((attempts % 5)) -eq 0 ] && warn "Still waiting for $CHAIN2_ID... (attempt $attempts/$max_attempts)"
        sleep 2
    done

    log "$CHAIN2_ID is live at block $height"

    # Fund the deployer on chain2 via its faucet
    log "Waiting for $CHAIN2_ID faucet..."
    local faucet_attempts=0
    until curl -sf "$CHAIN2_FAUCET/status" >/dev/null 2>&1; do
        faucet_attempts=$((faucet_attempts + 1))
        if [ "$faucet_attempts" -ge 30 ]; then
            warn "$CHAIN2_ID faucet not responding — continuing..."
            return
        fi
        sleep 2
    done

    # Derive deployer key on chain2 and fund it
    log "Setting up deployer on $CHAIN2_ID..."
    echo "$DEPLOYER_MNEMONIC" | docker exec -i "$CHAIN2_CONTAINER" \
        terpd keys add deployer --recover --keyring-backend test --output json 2>/dev/null | jq -r '.address' || true

    local chain2_deployer_addr
    chain2_deployer_addr=$(docker exec "$CHAIN2_CONTAINER" terpd keys show deployer --keyring-backend test --address 2>/dev/null) || true
    if [ -n "$chain2_deployer_addr" ]; then
        log "Funding deployer ($chain2_deployer_addr) on $CHAIN2_ID..."
        for _ in 1 2 3; do
            curl -sf "$CHAIN2_FAUCET/faucet?address=$chain2_deployer_addr" 2>&1 || true
            sleep 1
        done
    fi

    log "$CHAIN2_ID is ready"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 2: Fund accounts
# ═══════════════════════════════════════════════════════════════
fund_accounts() {
    step "Phase 2: Funding accounts"

    # Wait for faucet to be ready
    local attempts=0
    until curl -sf "$LOCAL_FAUCET/status" >/dev/null 2>&1; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 30 ]; then
            warn "Faucet not responding — genesis accounts are pre-funded, continuing..."
            return
        fi
        sleep 2
    done
    log "Faucet is ready"

    # Fund hot wallet if specified
    if [ -n "$HOT_WALLET_ADDRESS" ]; then
        log "Funding hot wallet: $HOT_WALLET_ADDRESS"
        local resp
        resp=$(curl -sf "$LOCAL_FAUCET/faucet?address=$HOT_WALLET_ADDRESS" 2>&1) || true
        log "Faucet response: $resp"

        # Also send uthiol to the hot wallet via bank send from account 'a'
        # Account 'a' has both uterp and uthiol from genesis
        log "Sending uthiol to hot wallet via docker exec..."
        docker exec "$CONTAINER_NAME" terpd tx bank send a "$HOT_WALLET_ADDRESS" \
            1000000000uthiol \
            --from a --gas-prices 0.25uterp -y --output json 2>/dev/null | jq -r '.txhash' || warn "uthiol send may have failed"
    else
        warn "HOT_WALLET_ADDRESS not set — skipping browser wallet funding"
        warn "Set it: HOT_WALLET_ADDRESS=terp1... ./tests/local-test-env.sh"
    fi

    # Fund the deployer account (LOCAL_MNEMONIC used by cw-orch deploy scripts)
    # Derive the address from the same mnemonic cw-orch will use
    log "Deriving deployer address from mnemonic..."
    DEPLOYER_ADDRESS=$(echo "$DEPLOYER_MNEMONIC" | docker exec -i "$CONTAINER_NAME" \
        terpd keys add deployer --recover --keyring-backend test --output json 2>/dev/null \
        | jq -r '.address')

    if [ -z "$DEPLOYER_ADDRESS" ]; then
        err "Failed to derive deployer address from mnemonic"
        exit 1
    fi
    log "Deployer address: $DEPLOYER_ADDRESS"

    log "Funding deployer account via faucet..."
    # Hit faucet multiple times to ensure enough uterp for store + instantiate
    for _ in 1 2 3; do
        curl -sf "$LOCAL_FAUCET/faucet?address=$DEPLOYER_ADDRESS" 2>&1 || true
        sleep 1
    done

    # Wait a few blocks for funding txs to confirm
    sleep 4
    log "Deployer account funded"

    log "Genesis accounts (validator, a, b, c, d) are pre-funded"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 2.5: Create tokenfactory tokens for shitstrap testing
#
# Creates two test denoms from the deployer address and mints
# them to all genesis test wallets + the hot wallet.
#
# The resulting denom format is:
#   factory/<deployer_address>/<subdenom>
#
# These denoms are printed in the summary so contract deploy
# scripts can reference them as accepted shitstrap payment tokens.
# ═══════════════════════════════════════════════════════════════
mint_tokenfactory_tokens() {
    step "Phase 2.5: Creating tokenfactory tokens for shitstrap testing"

    if [ -z "${DEPLOYER_ADDRESS:-}" ]; then
        err "DEPLOYER_ADDRESS not set — run fund_accounts first"
        exit 1
    fi

    local SUBDENOMS="atom btc akt eth usdc"
    local MINT_AMOUNT="${MINT_AMOUNT:-1000000000000}"  # 1M tokens at 6 decimals
    local SHARE="${SHARE:-100000000000}"               # 100K tokens per test wallet
    local TERPD="docker exec $CONTAINER_NAME terpd"
    # --generate-only: emit unsigned tx JSON, no broadcast, no sequence query
    local GEN_FLAGS="--from deployer --keyring-backend test --chain-id $CHAIN_ID --fees 1000000uterp --gas 500000 --generate-only"

    local tmpdir
    tmpdir=$(mktemp -d)

    # Collect recipient addresses once
    local RECIPIENTS=""
    for key in validator a b c d; do
        local addr
        addr=$($TERPD keys show "$key" --keyring-backend test --address 2>/dev/null) || continue
        RECIPIENTS="$RECIPIENTS $addr"
    done
    [ -n "${HOT_WALLET_ADDRESS:-}" ] && RECIPIENTS="$RECIPIENTS $HOT_WALLET_ADDRESS"

    echo "Creator   : $DEPLOYER_ADDRESS"
    echo "Denoms    : $SUBDENOMS"
    echo ""

    # ── Generate all messages offline ─────────────────────────────
    echo "=== Generating messages ==="
    local idx=0

    for subdenom in $SUBDENOMS; do
        local denom="factory/$DEPLOYER_ADDRESS/$subdenom"
        echo "  $denom"

        $TERPD tx tokenfactory create-denom "$subdenom" $GEN_FLAGS > "$tmpdir/$idx.json" 2>&1
        idx=$((idx + 1))

        $TERPD tx tokenfactory mint "${MINT_AMOUNT}${denom}" $GEN_FLAGS > "$tmpdir/$idx.json" 2>&1
        idx=$((idx + 1))

        for addr in $RECIPIENTS; do
            $TERPD tx bank send deployer "$addr" "${SHARE}${denom}" $GEN_FLAGS > "$tmpdir/$idx.json" 2>&1
            idx=$((idx + 1))
        done
    done

    # ── Validate every generated file before merging ──────────────
    echo ""
    echo "=== Validating $idx generated msgs ==="
    local ok=true
    for i in $(seq 0 $((idx - 1))); do
        if ! jq -e '.body.messages | length > 0' "$tmpdir/$i.json" > /dev/null 2>&1; then
            err "msg $i failed to generate:"
            jq '.' "$tmpdir/$i.json" 2>/dev/null || cat "$tmpdir/$i.json"
            ok=false
        fi
    done
    if [ "$ok" = false ]; then
        rm -rf "$tmpdir"
        exit 1
    fi

    # ── Merge all msgs into one tx doc ────────────────────────────
    local all_files=""
    for i in $(seq 0 $((idx - 1))); do
        all_files="$all_files $tmpdir/$i.json"
    done

    local total_gas=$(( idx * 900000 ))
    local total_fee=$(( total_gas / 4 ))  # 0.25 uterp per gas unit
    echo ""
    echo "=== Merging $idx msgs → 1 tx (gas=$total_gas fee=${total_fee}uterp) ==="

    # shellcheck disable=SC2086
    jq -s --argjson gas "$total_gas" --argjson fee "$total_fee" '
      . as $txs |
      $txs[0] |
      .body.messages = [ $txs[] | .body.messages[] ] |
      .auth_info.fee.gas_limit = ($gas | tostring) |
      .auth_info.fee.amount = [{"denom":"uterp","amount":($fee | tostring)}]
    ' $all_files > "$tmpdir/unsigned.json"

    # ── Sign ──────────────────────────────────────────────────────
    docker cp "$tmpdir/unsigned.json" "$CONTAINER_NAME:/tmp/tf_unsigned.json"

    local acct_json acct_num seq
    acct_json=$($TERPD query auth account "$DEPLOYER_ADDRESS" --output json 2>/dev/null)
    acct_num=$(echo "$acct_json" | jq -r '.account_number // .account.account_number // "0"')
    seq=$(echo "$acct_json" | jq -r '.sequence // .account.sequence // "0"')

    echo "=== Signing (account=$acct_num sequence=$seq) ==="
    docker exec "$CONTAINER_NAME" terpd tx sign /tmp/tf_unsigned.json \
        --from deployer --keyring-backend test \
        --chain-id "$CHAIN_ID" \
        --account-number "$acct_num" \
        --sequence "$seq" \
        --output-document /tmp/tf_signed.json

    # ── Broadcast + poll for DeliverTx result ─────────────────────
    echo "=== Broadcasting ==="
    docker exec "$CONTAINER_NAME" terpd tx broadcast /tmp/tf_signed.json \
        --broadcast-mode sync --output json > "$tmpdir/broadcast.json" 2>&1 || true

    local txhash
    txhash=$(jq -r '.txhash // "n/a"' "$tmpdir/broadcast.json" 2>/dev/null || echo "n/a")
    echo "  txhash : $txhash"

    if [ "$txhash" = "n/a" ]; then
        err "Broadcast failed — no txhash returned:"
        cat "$tmpdir/broadcast.json"
        rm -rf "$tmpdir"
        exit 1
    fi

    echo "  polling for DeliverTx..."
    local attempts=0
    local code="pending"
    while [ "$code" = "pending" ]; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 30 ]; then
            err "Tx not confirmed after 30 attempts — check: terpd q tx $txhash"
            rm -rf "$tmpdir"
            exit 1
        fi
        sleep 2
        local tx_result
        tx_result=$(docker exec "$CONTAINER_NAME" terpd q tx "$txhash" --output json 2>/dev/null) || { sleep 2; continue; }
        code=$(echo "$tx_result" | jq -r '.code // 0')
    done

    echo "  confirmed (code=$code)"
    if [ "$code" != "0" ]; then
        err "Tx failed on-chain (code=$code):"
        echo "$tx_result" | jq -r '.raw_log // .'
        rm -rf "$tmpdir"
        exit 1
    fi

    rm -rf "$tmpdir"

    # ── Store denom vars for summary ──────────────────────────────
    TF_DENOM_ATOM="factory/$DEPLOYER_ADDRESS/atom"
    TF_DENOM_BTC="factory/$DEPLOYER_ADDRESS/btc"
    TF_DENOM_AKT="factory/$DEPLOYER_ADDRESS/akt"
    TF_DENOM_ETH="factory/$DEPLOYER_ADDRESS/eth"
    TF_DENOM_USDC="factory/$DEPLOYER_ADDRESS/usdc"

    echo ""
    echo "=== Tokenfactory denoms ready ==="
    for subdenom in $SUBDENOMS; do
        echo "  factory/$DEPLOYER_ADDRESS/$subdenom"
    done
    echo ""
    echo "Set CREATOR=$DEPLOYER_ADDRESS in your .env before running integration scripts."
}

# ═══════════════════════════════════════════════════════════════
# PHASE 3: Deploy cw-infuser contracts
# ═══════════════════════════════════════════════════════════════
deploy_cw_infuser() {
    step "Phase 3: Deploying cw-infuser contracts"

    if [ ! -d "$CW_INFUSER_DIR/scripts" ]; then
        err "cw-infuser not found at $CW_INFUSER_DIR"
        return 1
    fi

    log "Running cw-infuser integration script..."
    (cd "$CW_INFUSER_DIR" && RUST_LOG=info cargo run -p cw-infuser-scripts --bin integration -- --network local --single 2>&1) || {
        err "cw-infuser deployment failed"
        exit 1
    }

    # Read contract addresses from cw-orchestrator state
    log "Reading addresses from $CW_ORCH_STATE..."
    ADDR_CW_SVG_MINTER=$(orch_addr "$CHAIN_ID" "cw-svg-minter")
    ADDR_CW721_SVG=$(orch_addr "$CHAIN_ID" "cw721-svg")
    ADDR_CW_INFUSION_MINTER=$(orch_addr "$CHAIN_ID" "cw-infuser")
    ADDR_SHITSTRAP_FACTORY=$(orch_addr "$CHAIN_ID" "cw-shitstrap-factory")

    if [ -z "$ADDR_CW_SVG_MINTER" ]; then
        err "cw-svg-minter not found in $CW_ORCH_STATE"
        exit 1
    fi
    if [ -z "$ADDR_CW721_SVG" ]; then
        err "cw721-svg not found in $CW_ORCH_STATE"
        exit 1
    fi
    [ -z "$ADDR_CW_INFUSION_MINTER" ] && warn "cw-infuser not in state (optional)" || log "cw-infuser: $ADDR_CW_INFUSION_MINTER"
    [ -z "$ADDR_SHITSTRAP_FACTORY" ]   && warn "cw-shitstrap-factory not in state (optional)" || log "cw-shitstrap-factory: $ADDR_SHITSTRAP_FACTORY"

    log "cw-svg-minter: $ADDR_CW_SVG_MINTER"
    log "cw721-svg: $ADDR_CW721_SVG"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 4: Deploy terp-account-billboards
# ═══════════════════════════════════════════════════════════════
deploy_terp_accounts() {
    step "Phase 4: Deploying terp-account-billboards contracts"

    if [ ! -d "$TERP_ACCOUNTS_DIR/scripts" ]; then
        err "terp-account-billboards not found at $TERP_ACCOUNTS_DIR"
        return 1
    fi

    log "Running terp-accounts deploy script..."
    (cd "$TERP_ACCOUNTS_DIR" && RUST_LOG=info cargo run -p terp-account-scripts --bin deploy -- --network local 2>&1) || {
        err "terp-accounts deployment failed"
        exit 1
    }

    # Read contract addresses from cw-orchestrator state
    log "Reading addresses from $CW_ORCH_STATE..."
    ADDR_TERP721_ACCOUNT=$(orch_addr "$CHAIN_ID" "terp721-account")
    ADDR_TERP721_MANIFOLD=$(orch_addr "$CHAIN_ID" "terp721-account-manifold")

    if [ -z "$ADDR_TERP721_ACCOUNT" ]; then
        err "terp721-account not found in $CW_ORCH_STATE"
        exit 1
    fi
    if [ -z "$ADDR_TERP721_MANIFOLD" ]; then
        err "terp721-account-manifold not found in $CW_ORCH_STATE"
        exit 1
    fi

    log "terp721-account: $ADDR_TERP721_ACCOUNT"
    log "terp721-account-manifold: $ADDR_TERP721_MANIFOLD"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 5: Configure website & start dev server
# ═══════════════════════════════════════════════════════════════
configure_website() {
    step "Phase 5: Configuring website for local network"

    # ─── Update config.json with local chain entry ─────────
    log "Writing local config to public/config.json..."
    local _config="$WEBSITE_DIR/public/config.json"
    jq --arg cid "$CHAIN_ID" \
       --arg rpc "$LOCAL_RPC" \
       --arg rest "$LOCAL_REST" \
       --arg grpc "$LOCAL_GRPC" \
       --arg cw721svg "${ADDR_CW721_SVG:-}" \
       --arg terp721acc "${ADDR_TERP721_ACCOUNT:-}" \
       --arg accMinter "${ADDR_TERP721_MANIFOLD:-}" \
       --arg svgMinter "${ADDR_CW_SVG_MINTER:-}" \
       --arg infMinter "${ADDR_CW_INFUSION_MINTER:-}" \
       --arg sstrapFact "${ADDR_SHITSTRAP_FACTORY:-}" \
       --arg merkle "${MERKLE_SERVER_URL:-}" \
       '.chains[$cid] = (.chains[$cid] // {}) * {
            chainId: $cid,
            chainName: "Local Terp",
            rpc: $rpc,
            rest: $rest,
            grpc: $grpc,
            contracts: {
                cw721Svg: $cw721svg,
                terp721Account: $terp721acc,
                accountMinter: $accMinter,
                cwSvgMinter: $svgMinter,
                cwInfusionMinter: $infMinter,
                shitstrapFactory: $sstrapFact
            },
            services: {
                merkleServer: $merkle,
                indexer: ""
            }
        }' "$_config" > "${_config}.tmp" && mv "${_config}.tmp" "$_config"

    log "config.json updated for local network"

    # Print summary
    echo ""
    log "Contract addresses:"
    echo "  cw-svg-minter:              ${ADDR_CW_SVG_MINTER:-'(not deployed)'}"
    echo "  cw721-svg (last):           ${ADDR_CW721_SVG:-'(not deployed)'}"
    echo "  cw-infusion-minter:         ${ADDR_CW_INFUSION_MINTER:-'(not deployed)'}"
    echo "  terp721-account:            ${ADDR_TERP721_ACCOUNT:-'(not deployed)'}"
    echo "  terp721-account-manifold:   ${ADDR_TERP721_MANIFOLD:-'(not deployed)'}"
    echo "  shitstrap-factory:          ${ADDR_SHITSTRAP_FACTORY:-'(not deployed)'}"
    echo ""
    log "Tokenfactory denoms (for shitstrap testing):"
    for _tf in "$TF_DENOM_ATOM" "$TF_DENOM_BTC" "$TF_DENOM_AKT" "$TF_DENOM_ETH" "$TF_DENOM_USDC"; do
        [ -n "$_tf" ] && echo "  $_tf" || true
    done
    [ -z "$TF_DENOM_ATOM" ] && echo "  (not created)"
    echo ""
    if [ -n "$TF_DENOM_IBC_TEST_A" ]; then
        log "IBC test denoms:"
        echo "  $TF_DENOM_IBC_TEST_A"
        echo "  $TF_DENOM_IBC_TEST_B"
        echo ""
    fi
    log "Endpoints:"
    echo "  RPC:    $LOCAL_RPC  (serve.py proxy → $CHAIN_RPC)"
    echo "  REST:   $LOCAL_REST"
    echo "  gRPC:   $LOCAL_GRPC"
    echo "  Faucet: $LOCAL_FAUCET"
    if [ "$ENABLE_IBC" = "true" ] && [ "$ENABLE_AKASH" != "true" ]; then
        echo ""
        log "Chain B (local IBC):"
        echo "  Chain ID: $CHAIN2_ID"
        echo "  RPC:      $CHAIN2_RPC"
        echo "  REST:     $CHAIN2_REST"
        echo "  Faucet:   $CHAIN2_FAUCET"
    fi
    if [ -n "$AKASH_RPC" ]; then
        echo ""
        log "Akash devnet endpoints:"
        echo "  Chain ID: $AKASH_CHAIN_ID"
        echo "  RPC:      $AKASH_RPC"
        echo "  REST:     $AKASH_REST"
        echo "  gRPC:     $AKASH_GRPC"
        echo "  Provider: $AKASH_PROVIDER"
    fi
    echo ""
}

# ═══════════════════════════════════════════════════════════════
# PHASE 6: Configure & start terp-docs (optional)
# ═══════════════════════════════════════════════════════════════
start_terp_docs() {
    step "Phase 6: terp-docs documentation site"

    if [ ! -d "$DOCS_DIR" ]; then
        warn "terp-docs not found at $DOCS_DIR — skipping"
        return
    fi

    if ! command -v pnpm &>/dev/null; then
        warn "pnpm not installed — skipping terp-docs"
        return
    fi

    log "Writing .env.local for terp-docs..."
    cat > "$DOCS_DIR/.env.local" <<ENVEOF
# Generated by local-test-env.sh — do not edit manually
NEXT_PUBLIC_CHAIN_ENV=local
NEXT_PUBLIC_TERP721_ACCOUNT=${ADDR_TERP721_ACCOUNT:-}
NEXT_PUBLIC_CALENDAR=
ENVEOF

    log "Installing terp-docs dependencies..."
    (cd "$DOCS_DIR" && pnpm install --frozen-lockfile 2>&1) || {
        warn "pnpm install failed for terp-docs — skipping"
        return
    }

    log "Starting terp-docs dev server on port 3001..."
    (cd "$DOCS_DIR" && pnpm dev --port 3001 &)
    DOCS_PID=$!

    log "terp-docs running (PID=$DOCS_PID) at http://localhost:3001"
}

start_dev_server() {
    log "Starting website dev server on port $WEBSITE_PORT..."
    echo ""
    echo "  Open: http://localhost:$WEBSITE_PORT"
    echo "  Mint: http://localhost:$WEBSITE_PORT/mint"
    echo "  Names: http://localhost:$WEBSITE_PORT/tabs.html"
    echo ""
    echo "  Press Ctrl+C to stop."
    echo ""

    cd "$WEBSITE_DIR"
    python3 serve.py
}

# ═══════════════════════════════════════════════════════════════
# PHASE 7: Akash devnet (gated behind ENABLE_AKASH=true)
# ═══════════════════════════════════════════════════════════════
start_akash_devnet() {
    if [ "$ENABLE_AKASH" != "true" ]; then
        return
    fi

    step "Phase 7: Starting Akash devnet"

    if [ ! -f "$AKASH_DEVNET_SCRIPT" ]; then
        err "Akash devnet script not found at $AKASH_DEVNET_SCRIPT"
        err "Set OLINE_DIR to your o-line checkout (default: ~/o-line)"
        exit 1
    fi

    log "Calling akash-devnet.sh wait (starts node + provider, blocks until ready)..."
    local akash_json
    akash_json=$("$AKASH_DEVNET_SCRIPT" wait)

    if [ -z "$akash_json" ]; then
        err "akash-devnet.sh wait returned empty output"
        exit 1
    fi

    # Parse JSON endpoints
    AKASH_RPC=$(echo "$akash_json" | jq -r '.rpc')
    AKASH_REST=$(echo "$akash_json" | jq -r '.rest')
    AKASH_GRPC=$(echo "$akash_json" | jq -r '.grpc')
    AKASH_PROVIDER=$(echo "$akash_json" | jq -r '.provider')
    AKASH_CHAIN_ID=$(echo "$akash_json" | jq -r '.chain_id')
    AKASH_FAUCET_MNEMONIC=$(echo "$akash_json" | jq -r '.faucet_mnemonic')
    AKASH_DEPLOYER_MNEMONIC=$(echo "$akash_json" | jq -r '.deployer_mnemonic')

    log "Akash devnet is ready"
    echo "  Chain ID:  $AKASH_CHAIN_ID"
    echo "  RPC:       $AKASH_RPC"
    echo "  REST:      $AKASH_REST"
    echo "  gRPC:      $AKASH_GRPC"
    echo "  Provider:  $AKASH_PROVIDER"
}

# ═══════════════════════════════════════════════════════════════
# PHASE 8: IBC Relayer (Akash devnet OR local two-chain)
# ═══════════════════════════════════════════════════════════════
start_ibc_relayer() {
    # Determine which mode we're in
    local IBC_MODE=""
    if [ "$ENABLE_AKASH" = "true" ] && [ -n "$AKASH_RPC" ]; then
        IBC_MODE="akash"
    elif [ "$ENABLE_IBC" = "true" ]; then
        IBC_MODE="local"
    else
        return
    fi

    step "Phase 8: Starting IBC relayer (mode=$IBC_MODE)"

    # ── Chain B config based on mode ──────────────────────────────
    local CHAIN_B_ID CHAIN_B_RPC_DOCKER CHAIN_B_GRPC_DOCKER
    local CHAIN_B_PREFIX CHAIN_B_GAS CHAIN_B_KEY_NAME CHAIN_B_KEY_MNEMONIC
    local CHAIN_B_ALIAS  # alias used in relayer config & path name

    if [ "$IBC_MODE" = "akash" ]; then
        CHAIN_B_ALIAS="akash"
        CHAIN_B_ID="$AKASH_CHAIN_ID"
        CHAIN_B_RPC_DOCKER=$(echo "$AKASH_RPC" | sed 's|http://127\.0\.0\.1|http://host.docker.internal|')
        CHAIN_B_GRPC_DOCKER=$(echo "$AKASH_GRPC" | sed 's|http://127\.0\.0\.1|host.docker.internal|; s|http://||')
        CHAIN_B_PREFIX="akash"
        CHAIN_B_GAS="0.025uakt"
        CHAIN_B_KEY_NAME="relayer-akash"
        CHAIN_B_KEY_MNEMONIC="$AKASH_FAUCET_MNEMONIC"
    else
        # Local mode: second terp chain
        CHAIN_B_ALIAS="terp2"
        CHAIN_B_ID="$CHAIN2_ID"
        CHAIN_B_RPC_DOCKER="http://host.docker.internal:$CHAIN2_RPC_PORT"
        CHAIN_B_GRPC_DOCKER="host.docker.internal:$CHAIN2_GRPC_PORT"
        CHAIN_B_PREFIX="terp"
        CHAIN_B_GAS="0.025uterp"
        CHAIN_B_KEY_NAME="relayer-terp2"
        CHAIN_B_KEY_MNEMONIC="$DEPLOYER_MNEMONIC"
    fi

    local PATH_NAME="terp-${CHAIN_B_ALIAS}"
    local RLY_CONFIG="/tmp/rly-config.yaml"
    local RLY_CONTAINER="ibc-relayer"
    local RLY_IMAGE="ghcr.io/cosmos/relayer:latest"

    local TERP_RPC="http://host.docker.internal:26657"
    local TERP_GRPC="host.docker.internal:9090"

    log "Generating relayer config (path=$PATH_NAME)..."
    cat > "$RLY_CONFIG" <<YAML
global:
  api-listen-addr: :5183
  timeout: 10s
  memo: "${PATH_NAME}-e2e"
  light-cache-size: 20
chains:
  terp:
    type: cosmos
    value:
      key-directory: /root/.relayer/keys
      key: relayer-terp
      chain-id: ${CHAIN_ID}
      rpc-addr: ${TERP_RPC}
      grpc-addr: ${TERP_GRPC}
      account-prefix: terp
      keyring-backend: test
      gas-adjustment: 1.5
      gas-prices: 0.025uterp
      min-gas-amount: 0
      max-gas-amount: 0
      debug: true
      timeout: 20s
      block-timeout: ""
      output-format: json
      sign-mode: direct
      extra-codecs: []
      coin-type: 118
      signing-algorithm: ""
      broadcast-mode: batch
      min-loop-duration: 0s
      extension-options: []
      feegrants: null
  ${CHAIN_B_ALIAS}:
    type: cosmos
    value:
      key-directory: /root/.relayer/keys
      key: ${CHAIN_B_KEY_NAME}
      chain-id: ${CHAIN_B_ID}
      rpc-addr: ${CHAIN_B_RPC_DOCKER}
      grpc-addr: ${CHAIN_B_GRPC_DOCKER}
      account-prefix: ${CHAIN_B_PREFIX}
      keyring-backend: test
      gas-adjustment: 1.5
      gas-prices: ${CHAIN_B_GAS}
      min-gas-amount: 0
      max-gas-amount: 0
      debug: true
      timeout: 20s
      block-timeout: ""
      output-format: json
      sign-mode: direct
      extra-codecs: []
      coin-type: 118
      signing-algorithm: ""
      broadcast-mode: batch
      min-loop-duration: 0s
      extension-options: []
      feegrants: null
paths:
  ${PATH_NAME}:
    src:
      chain-id: ${CHAIN_ID}
    dst:
      chain-id: ${CHAIN_B_ID}
YAML

    # Stop any existing relayer container
    docker stop "$RLY_CONTAINER" 2>/dev/null || true
    docker rm "$RLY_CONTAINER" 2>/dev/null || true

    # Start the relayer container (init keys, fund, create link, then start)
    log "Starting relayer container..."
    docker run -d --name "$RLY_CONTAINER" --network host \
        -v "$RLY_CONFIG:/root/.relayer/config/config.yaml" \
        --entrypoint sh \
        "$RLY_IMAGE" -c "sleep infinity"

    # Wait for container to be running
    local attempts=0
    until docker inspect -f '{{.State.Running}}' "$RLY_CONTAINER" 2>/dev/null | grep -q true; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 10 ]; then
            err "Relayer container did not start"
            exit 1
        fi
        sleep 1
    done

    # Restore keys from mnemonics
    log "Importing relayer keys..."
    echo "$DEPLOYER_MNEMONIC" | docker exec -i "$RLY_CONTAINER" \
        rly keys restore terp relayer-terp - 2>&1 || warn "terp key may already exist"
    echo "$CHAIN_B_KEY_MNEMONIC" | docker exec -i "$RLY_CONTAINER" \
        rly keys restore "$CHAIN_B_ALIAS" "$CHAIN_B_KEY_NAME" - 2>&1 || warn "$CHAIN_B_ALIAS key may already exist"

    # Show relayer addresses for debugging
    local RELAYER_TERP_ADDR RELAYER_B_ADDR
    RELAYER_TERP_ADDR=$(docker exec "$RLY_CONTAINER" rly keys show terp relayer-terp 2>/dev/null) || true
    RELAYER_B_ADDR=$(docker exec "$RLY_CONTAINER" rly keys show "$CHAIN_B_ALIAS" "$CHAIN_B_KEY_NAME" 2>/dev/null) || true
    log "Relayer terp address:         $RELAYER_TERP_ADDR"
    log "Relayer $CHAIN_B_ALIAS address: $RELAYER_B_ADDR"

    # Fund the relayer's terp-side address via the local faucet
    if [ -n "$RELAYER_TERP_ADDR" ]; then
        log "Funding relayer on terp chain..."
        for _ in 1 2 3; do
            curl -sf "$LOCAL_FAUCET/faucet?address=$RELAYER_TERP_ADDR" 2>&1 || true
            sleep 1
        done
    fi

    # Fund the relayer on chain B
    if [ -n "$RELAYER_B_ADDR" ]; then
        if [ "$IBC_MODE" = "local" ]; then
            log "Funding relayer on $CHAIN2_ID via faucet..."
            for _ in 1 2 3; do
                curl -sf "$CHAIN2_FAUCET/faucet?address=$RELAYER_B_ADDR" 2>&1 || true
                sleep 1
            done
        else
            log "Funding relayer on akash chain..."
            warn "Akash relayer funding relies on the faucet account being pre-funded at genesis"
        fi
    fi

    # Wait for both chains to have a few blocks before creating clients
    sleep 5

    # Create clients, connections, and channel in one shot
    log "Creating IBC link (clients + connection + channel)..."
    docker exec "$RLY_CONTAINER" rly tx link "$PATH_NAME" \
        --src-port transfer --dst-port transfer --version ics20-1 2>&1 || {
        err "IBC link creation failed — relayer will start but may not relay packets"
        warn "You can retry manually: docker exec $RLY_CONTAINER rly tx link $PATH_NAME"
    }

    # Stop the sleep-infinity process and restart with the relayer
    docker stop "$RLY_CONTAINER" 2>/dev/null || true
    docker rm "$RLY_CONTAINER" 2>/dev/null || true

    log "Starting relayer process..."
    docker run -d --name "$RLY_CONTAINER" --network host \
        -v "$RLY_CONFIG:/root/.relayer/config/config.yaml" \
        "$RLY_IMAGE" rly start "$PATH_NAME" --debug-addr "" 2>&1

    # Verify relayer is running
    sleep 3
    if docker ps --filter "name=$RLY_CONTAINER" --format '{{.Names}}' | grep -q "$RLY_CONTAINER"; then
        log "IBC relayer is running"
    else
        warn "IBC relayer container may have exited — check: docker logs $RLY_CONTAINER"
    fi
}

# ═══════════════════════════════════════════════════════════════
# PHASE 9: IBC Test Transfers (requires relayer — Akash or local)
# ═══════════════════════════════════════════════════════════════
ibc_test_transfers() {
    # Determine mode (same logic as start_ibc_relayer)
    local IBC_MODE=""
    if [ "$ENABLE_AKASH" = "true" ] && [ -n "$AKASH_RPC" ]; then
        IBC_MODE="akash"
    elif [ "$ENABLE_IBC" = "true" ]; then
        IBC_MODE="local"
    else
        return
    fi

    # Check that the relayer container is actually running
    if ! docker ps --filter "name=ibc-relayer" --format '{{.Names}}' | grep -q "ibc-relayer"; then
        warn "IBC relayer not running — skipping IBC test transfers"
        return
    fi

    step "Phase 9: IBC test transfers (mode=$IBC_MODE)"

    if [ -z "${DEPLOYER_ADDRESS:-}" ]; then
        err "DEPLOYER_ADDRESS not set — run fund_accounts first"
        return
    fi

    # Chain B receiver config
    local CHAIN_B_ALIAS CHAIN_B_KEY_NAME CHAIN_B_REST
    if [ "$IBC_MODE" = "akash" ]; then
        CHAIN_B_ALIAS="akash"
        CHAIN_B_KEY_NAME="relayer-akash"
        CHAIN_B_REST="$AKASH_REST"
    else
        CHAIN_B_ALIAS="terp2"
        CHAIN_B_KEY_NAME="relayer-terp2"
        CHAIN_B_REST="$CHAIN2_REST"
    fi

    local TERPD="docker exec $CONTAINER_NAME terpd"

    # ── Create IBC test subdenoms ─────────────────────────────────
    log "Creating IBC test tokenfactory denoms..."

    local IBC_SUBDENOMS="ibc-test-a ibc-test-b"
    local IBC_MINT_AMOUNT="1000000000000"  # 1M tokens at 6 decimals
    local GEN_FLAGS="--from deployer --keyring-backend test --chain-id $CHAIN_ID --fees 1000000uterp --gas 500000 --generate-only"

    local tmpdir
    tmpdir=$(mktemp -d)
    local idx=0

    for subdenom in $IBC_SUBDENOMS; do
        local denom="factory/$DEPLOYER_ADDRESS/$subdenom"
        log "  Creating $denom"

        $TERPD tx tokenfactory create-denom "$subdenom" $GEN_FLAGS > "$tmpdir/$idx.json" 2>&1
        idx=$((idx + 1))

        $TERPD tx tokenfactory mint "${IBC_MINT_AMOUNT}${denom}" $GEN_FLAGS > "$tmpdir/$idx.json" 2>&1
        idx=$((idx + 1))
    done

    # Merge, sign, broadcast (same pattern as mint_tokenfactory_tokens)
    local all_files=""
    for i in $(seq 0 $((idx - 1))); do
        # Validate
        if ! jq -e '.body.messages | length > 0' "$tmpdir/$i.json" > /dev/null 2>&1; then
            err "IBC test denom msg $i failed to generate"
            rm -rf "$tmpdir"
            return
        fi
        all_files="$all_files $tmpdir/$i.json"
    done

    local total_gas=$(( idx * 900000 ))
    local total_fee=$(( total_gas / 4 ))

    # shellcheck disable=SC2086
    jq -s --argjson gas "$total_gas" --argjson fee "$total_fee" '
      . as $txs |
      $txs[0] |
      .body.messages = [ $txs[] | .body.messages[] ] |
      .auth_info.fee.gas_limit = ($gas | tostring) |
      .auth_info.fee.amount = [{"denom":"uterp","amount":($fee | tostring)}]
    ' $all_files > "$tmpdir/unsigned.json"

    docker cp "$tmpdir/unsigned.json" "$CONTAINER_NAME:/tmp/ibc_unsigned.json"

    local acct_json acct_num seq
    acct_json=$($TERPD query auth account "$DEPLOYER_ADDRESS" --output json 2>/dev/null)
    acct_num=$(echo "$acct_json" | jq -r '.account_number // .account.account_number // "0"')
    seq=$(echo "$acct_json" | jq -r '.sequence // .account.sequence // "0"')

    log "Signing IBC test denom tx (account=$acct_num sequence=$seq)..."
    docker exec "$CONTAINER_NAME" terpd tx sign /tmp/ibc_unsigned.json \
        --from deployer --keyring-backend test \
        --chain-id "$CHAIN_ID" \
        --account-number "$acct_num" \
        --sequence "$seq" \
        --output-document /tmp/ibc_signed.json

    log "Broadcasting IBC test denom tx..."
    docker exec "$CONTAINER_NAME" terpd tx broadcast /tmp/ibc_signed.json \
        --broadcast-mode sync --output json > "$tmpdir/broadcast.json" 2>&1 || true

    local txhash
    txhash=$(jq -r '.txhash // "n/a"' "$tmpdir/broadcast.json" 2>/dev/null || echo "n/a")

    if [ "$txhash" = "n/a" ]; then
        err "IBC test denom broadcast failed"
        rm -rf "$tmpdir"
        return
    fi

    # Poll for confirmation
    local attempts=0 code="pending"
    while [ "$code" = "pending" ]; do
        attempts=$((attempts + 1))
        if [ "$attempts" -ge 30 ]; then
            warn "IBC test denom tx not confirmed after 30 attempts"
            rm -rf "$tmpdir"
            return
        fi
        sleep 2
        local tx_result
        tx_result=$(docker exec "$CONTAINER_NAME" terpd q tx "$txhash" --output json 2>/dev/null) || { sleep 2; continue; }
        code=$(echo "$tx_result" | jq -r '.code // 0')
    done

    if [ "$code" != "0" ]; then
        err "IBC test denom tx failed on-chain (code=$code)"
        rm -rf "$tmpdir"
        return
    fi

    TF_DENOM_IBC_TEST_A="factory/$DEPLOYER_ADDRESS/ibc-test-a"
    TF_DENOM_IBC_TEST_B="factory/$DEPLOYER_ADDRESS/ibc-test-b"
    log "IBC test denoms created:"
    echo "  $TF_DENOM_IBC_TEST_A"
    echo "  $TF_DENOM_IBC_TEST_B"

    # ── IBC transfer from terp to chain B ─────────────────────────
    # Get the chain B receiver address (use the relayer's chain B key)
    local RECV_ADDR
    RECV_ADDR=$(docker exec ibc-relayer rly keys show "$CHAIN_B_ALIAS" "$CHAIN_B_KEY_NAME" 2>/dev/null) || true

    if [ -z "$RECV_ADDR" ]; then
        warn "Could not get $CHAIN_B_ALIAS receiver address — skipping IBC transfer test"
        rm -rf "$tmpdir"
        return
    fi

    log "Sending IBC transfer: 1000000 ibc-test-a from terp to $CHAIN_B_ALIAS ($RECV_ADDR)..."

    # Execute the IBC transfer directly (not generate-only) for simplicity
    local ibc_result
    ibc_result=$(docker exec "$CONTAINER_NAME" terpd tx ibc-transfer transfer \
        transfer/channel-0 "$RECV_ADDR" \
        "1000000${TF_DENOM_IBC_TEST_A}" \
        --from deployer --keyring-backend test \
        --chain-id "$CHAIN_ID" \
        --fees 500000uterp --gas 400000 \
        --packet-timeout-height 0-0 \
        --packet-timeout-timestamp 0 \
        -y --output json 2>/dev/null) || true

    local ibc_txhash
    ibc_txhash=$(echo "$ibc_result" | jq -r '.txhash // "n/a"' 2>/dev/null || echo "n/a")
    log "IBC transfer txhash: $ibc_txhash"

    if [ "$ibc_txhash" = "n/a" ]; then
        warn "IBC transfer broadcast may have failed — check manually"
        rm -rf "$tmpdir"
        return
    fi

    # Wait for the packet to be relayed (give the relayer time)
    log "Waiting for IBC packet relay (up to 30s)..."
    sleep 10

    # Verify the transfer on chain B via REST
    # The IBC denom on chain B will be: ibc/<SHA256(transfer/channel-0/<terp_denom>)>
    local denom_path="transfer/channel-0/$TF_DENOM_IBC_TEST_A"
    local ibc_denom_hash
    ibc_denom_hash=$(echo -n "$denom_path" | shasum -a 256 | awk '{print toupper($1)}')
    local ibc_denom_on_b="ibc/$ibc_denom_hash"

    log "Expected IBC denom on $CHAIN_B_ALIAS: $ibc_denom_on_b"
    log "Denom trace: $denom_path"

    # Query chain B REST for the receiver's balance
    local b_balance
    b_balance=$(curl -sf "${CHAIN_B_REST}/cosmos/bank/v1beta1/balances/${RECV_ADDR}" 2>/dev/null) || true

    if [ -n "$b_balance" ]; then
        log "$CHAIN_B_ALIAS receiver balances:"
        echo "$b_balance" | jq '.balances' 2>/dev/null || echo "$b_balance"

        # Check if the IBC denom appears
        local ibc_amount
        ibc_amount=$(echo "$b_balance" | jq -r ".balances[] | select(.denom == \"$ibc_denom_on_b\") | .amount // \"0\"" 2>/dev/null || echo "0")
        if [ -n "$ibc_amount" ] && [ "$ibc_amount" != "0" ] && [ "$ibc_amount" != "" ]; then
            log "IBC transfer verified: $ibc_amount of $ibc_denom_on_b on $CHAIN_B_ALIAS"
        else
            warn "IBC denom not yet visible on $CHAIN_B_ALIAS — packet may still be in flight"
            warn "Check manually: curl ${CHAIN_B_REST}/cosmos/bank/v1beta1/balances/${RECV_ADDR}"
        fi
    else
        warn "Could not query $CHAIN_B_ALIAS REST for balances"
    fi

    rm -rf "$tmpdir"
    log "IBC test transfer phase complete"
}

# ─── Cleanup on exit ──────────────────────────────────────────
cleanup() {
    # # Restore website files from backups
    # for f in pages/index.html pages/tabs.html pages/mint.html; do
    #     if [ -f "$WEBSITE_DIR/${f}.bak" ]; then
    #         mv "$WEBSITE_DIR/${f}.bak" "$WEBSITE_DIR/${f}"
    #     fi
    # done
    # log "Restored website files from backups"

    # Stop terp-docs
    if [ -n "$DOCS_PID" ] && kill -0 "$DOCS_PID" 2>/dev/null; then
        log "Stopping terp-docs (PID=$DOCS_PID)..."
        kill "$DOCS_PID" 2>/dev/null || true
    fi

    # Stop IBC relayer container
    if docker ps -q --filter "name=ibc-relayer" | grep -q .; then
        log "Stopping IBC relayer..."
        docker stop ibc-relayer 2>/dev/null || true
        docker rm ibc-relayer 2>/dev/null || true
    fi

    # Stop second local chain (local IBC mode)
    if [ "$ENABLE_IBC" = "true" ] && docker ps -q --filter "name=$CHAIN2_CONTAINER" | grep -q .; then
        log "Stopping $CHAIN2_CONTAINER..."
        docker stop "$CHAIN2_CONTAINER" 2>/dev/null || true
    fi

    # Stop Akash devnet
    if [ "$ENABLE_AKASH" = "true" ] && [ -f "$AKASH_DEVNET_SCRIPT" ]; then
        log "Stopping Akash devnet..."
        "$AKASH_DEVNET_SCRIPT" stop 2>/dev/null || true
    fi

    if [ "$SKIP_DOCKER" != "true" ]; then
        log "Stopping $CONTAINER_NAME..."
        docker stop "$CONTAINER_NAME" 2>/dev/null || true
    fi
}
trap cleanup EXIT

# ═══════════════════════════════════════════════════════════════
# MAIN
# ═══════════════════════════════════════════════════════════════
main() {
    step "Local Test Environment for terp.network"
    echo "Chain ID:  $CHAIN_ID"
    echo "Website:   $WEBSITE_DIR"
    echo "cw-infuser:  $CW_INFUSER_DIR"
    echo "terp-accounts: $TERP_ACCOUNTS_DIR"
    echo "Akash devnet: $ENABLE_AKASH"
    echo "Local IBC:    $ENABLE_IBC"
    echo ""

    check_prereqs
    start_chain
    start_chain2             # Phase 1b (gated: ENABLE_IBC=true, not ENABLE_AKASH)
    fund_accounts
    mint_tokenfactory_tokens
    deploy_cw_infuser
    deploy_terp_accounts
    start_akash_devnet       # Phase 7 (gated: ENABLE_AKASH=true)
    start_ibc_relayer        # Phase 8 (Akash or local IBC)
    ibc_test_transfers       # Phase 9 (requires Phase 8)
    configure_website
    start_terp_docs          # Phase 6 (optional, needs pnpm + terp-docs)
    start_dev_server
}

main "$@"
