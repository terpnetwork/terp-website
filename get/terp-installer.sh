#!/bin/sh
# terp-installer.sh — Install terpd and interactively bootstrap a node
#
# Downloads the terpd binary for your platform (Linux/macOS), then runs an
# interactive setup wizard before delegating to `terpd bootstrap`.
#
# Usage:
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --network morocco-1
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --setup-only
#
# Flags after -- are passed through to `terpd bootstrap`, which handles:
#   init, genesis download, state-sync, pruning, cosmovisor, systemd
#
# When no flags are given and the terminal is interactive, a setup wizard
# walks through network, sync mode, pruning, and other options interactively.

set -euo pipefail

# ── Configuration (user‑overridable via env vars) ────────────────────────
# Keep in sync with public/config + releases/terp-core/vX.Y.Z on s3.terp.network
TERPD_VERSION="${TERPD_VERSION:-6.0.0}"
# Versioned binaries: https://s3.terp.network/releases/terp-core/v6.0.0/terpd-6.0.0-linux-amd64.tar.gz
# Upgrade info for cosmovisor: https://s3.terp.network/upgrades/<name>/cosmovisor.json
RELEASES_BASE="${RELEASES_BASE:-https://s3.terp.network/releases/terp-core}"
S3_BASE="${S3_BASE:-https://s3.terp.network/snapshots}"
BINARY_DEST="${TERPD_BIN:-$HOME/go/bin/terpd}"

# ── TTY helpers (work with curl | bash pipes) ──────────────────────────
# stdin_available returns 0 if user interaction is possible.
stdin_available() {
    [ -t 0 ] || [ -e /dev/tty ]
}

# prompt VAR "Display text" [default] — reads one line into VAR.
# If stdin is piped and /dev/tty is available, reads from /dev/tty.
prompt() {
    local __var=$1 __prompt=$2 __default=${3:-}
    local __val
    if [ -t 0 ]; then
        printf "%s " "$__prompt"
        read -r __val
    elif [ -e /dev/tty ]; then
        printf "%s " "$__prompt" > /dev/tty
        read -r __val < /dev/tty
    else
        __val="$__default"
    fi
    [ -z "$__val" ] && __val="$__default"
    eval "$__var=\$__val"
}

# confirm "Prompt" [default] — returns 0 if yes, 1 if no.
confirm() {
    local __prompt=$1 __default=${2:-N}
    local __yn
    if [ -t 0 ]; then
        printf "%s [%s/%s] " "$__prompt" "$(echo "$__default" | tr 'YN' 'yn')" "$(echo "$__default" | tr 'YN' 'YN')"
        read -r __yn
    elif [ -e /dev/tty ]; then
        printf "%s [%s/%s] " "$__prompt" "$(echo "$__default" | tr 'YN' 'yn')" "$(echo "$__default" | tr 'YN' 'YN')" > /dev/tty
        read -r __yn < /dev/tty
    else
        __yn="$__default"
    fi
    [ -z "$__yn" ] && __yn="$__default"
    case "$__yn" in [yY]|[yY][eE][sS]) return 0;; *) return 1;; esac
}

# ── Animated TERP intro (grok-remote hole → figlet) ────────────────────
COLOR=0
if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then
    COLOR=1
fi
if [ "${FORCE_COLOR:-}" = "1" ]; then
    COLOR=1
fi

_rgb() { [ "$COLOR" = "1" ] && printf '\033[38;2;%s;%s;%sm' "$1" "$2" "$3"; }
_reset() { [ "$COLOR" = "1" ] && printf '\033[0m'; }
_hide_cursor() { [ "$COLOR" = "1" ] && printf '\033[?25l'; }
_show_cursor() { [ "$COLOR" = "1" ] && printf '\033[?25h'; }
_move_up() { [ "$COLOR" = "1" ] && [ "$1" -gt 0 ] && printf '\033[%sA' "$1"; }

print_terp_logo() {
    printf '%s████████╗███████╗██████╗ ██████╗       █████╗  █████╗ ██████╗ ███████╗%s\n' "$(_rgb 177 235 235)" "$(_reset)"
    printf '%s╚══██╔══╝██╔════╝██╔══██╗██╔══██╗      ██╔══██╗██╔══██╗██╔══██╗██╔════╝%s\n' "$(_rgb 150 220 228)" "$(_reset)"
    printf '%s   ██║   █████╗  ██████╔╝██████╔╝█████╗██║  ╚═╝██║  ██║██████╔╝█████╗  %s\n' "$(_rgb 121 192 255)" "$(_reset)"
    printf '%s   ██║   ██╔══╝  ██╔══██╗██╔═══╝ ╚════╝██║  ██╗██║  ██║██╔══██╗██╔══╝  %s\n' "$(_rgb 94 180 240)" "$(_reset)"
    printf '%s   ██║   ███████╗██║  ██║██║           ╚█████╔╝╚█████╔╝██║  ██║███████╗%s\n' "$(_rgb 80 160 220)" "$(_reset)"
    printf '%s   ╚═╝   ╚══════╝╚═╝  ╚═╝╚═╝            ╚════╝  ╚════╝ ╚═╝  ╚═╝╚════╝ %s\n' "$(_rgb 74 83 96)" "$(_reset)"
}

_print_hole_frame() {
    # $1 = frame index 0-7
    case "$1" in
        0) printf '                   \n                   \n                   \n                   \n                   \n                   \n' ;;
        1) printf '                   \n                   \n         ·         \n         ·         \n                   \n                   \n' ;;
        2) printf '                   \n        ░░░        \n       ░   ░       \n       ░   ░       \n        ░░░        \n                   \n' ;;
        3) printf '       ░░░░░       \n      ░▒▒▒▒▒░      \n     ░▒▓▓▓▓▓▒░     \n     ░▒▓▓▓▓▓▒░     \n      ░▒▒▒▒▒░      \n       ░░░░░       \n' ;;
        4) printf '     ░░░░░░░░░     \n    ░▒▒▒▓▓▓▒▒▒░    \n   ░▒▓▓█████▓▓▒░   \n   ░▒▓▓█████▓▓▒░   \n    ░▒▒▒▓▓▓▒▒▒░    \n     ░░░░░░░░░     \n' ;;
        5) printf '    ░░░░░░░░░░░    \n  ░▒▒▒▒▓▓▓▓▓▒▒▒▒░  \n ░▒▓▓▓███████▓▓▓▒░ \n ░▒▓▓▓███████▓▓▓▒░ \n  ░▒▒▒▒▓▓▓▓▓▒▒▒▒░  \n    ░░░░░░░░░░░    \n' ;;
        6) printf '    ▓▓▓▓▓▓▓▓▓▓▓    \n  ▓███████████████ \n █████████████████ \n █████████████████ \n  ▓███████████████ \n    ▓▓▓▓▓▓▓▓▓▓▓    \n' ;;
        7) printf '███████████████████\n███████████████████\n███████████████████\n███████████████████\n███████████████████\n███████████████████\n' ;;
    esac
}

intro_terp() {
    trap '_show_cursor' EXIT INT TERM
    if [ "$COLOR" != "1" ] || [ ! -t 1 ] || [ -n "${NO_ANIMATE:-}" ]; then
        print_terp_logo
        printf '        ·  t e r p   n e t w o r k  ·  installer\n'
        printf '        join morocco-1 or 120u-1\n\n'
        return
    fi
    _hide_cursor
    i=0
    while [ "$i" -lt 6 ]; do
        printf '\n'
        i=$((i + 1))
    done
    _move_up 6
    # hole open → pulse → flash (same cadence as grok-remote installer.ts)
    for triple in "0:0.06:hole" "1:0.11:hole" "2:0.11:hole" "3:0.13:hole" "4:0.15:hole" "5:0.28:hole" "6:0.07:pulse" "7:0.055:flash"; do
        idx=${triple%%:*}
        rest=${triple#*:}
        hold=${rest%%:*}
        phase=${rest##*:}
        case "$phase" in
            flash) cr=232; cg=240; cb=248 ;;
            pulse) cr=94;  cg=234; cb=212 ;;
            *)     cr=94;  cg=234; cb=212 ;;
        esac
        _print_hole_frame "$idx" | while IFS= read -r line; do
            printf '\033[2K\r'
            printf '%s%s%s\n' "$(_rgb "$cr" "$cg" "$cb")" "$line" "$(_reset)"
        done
        _move_up 6
        sleep "$hold" 2>/dev/null || sleep 1
    done
    print_terp_logo
    printf '        ·  t e r p   n e t w o r k  ·  installer\n'
    printf '        join morocco-1 or 120u-1\n\n'
    _show_cursor
}

# ── Platform detection ─────────────────────────────────────────────────
OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
ARCH="$(uname -m)"

case "$ARCH" in
    x86_64)  ARCH="amd64" ;;
    aarch64) ARCH="arm64" ;;
    arm64)   ARCH="arm64" ;;
    armv7l)  ARCH="arm64" ;;
    *)
        echo "Error: Unsupported architecture '$ARCH'" >&2
        exit 1
        ;;
esac

case "$OS" in
    linux)  BINARY_NAME="terpd-linux-${ARCH}" ;;
    darwin) BINARY_NAME="terpd-darwin-${ARCH}" ;;
    *)
        echo "Error: Unsupported OS '$OS'" >&2
        exit 1
        ;;
esac

# ── Detect network from flags or env, else default to mainnet ──────────
if echo "$*" | grep -q -- "--network 120u-1\|--network=120u-1"; then
    NETWORK="120u-1"
elif [ "${TERP_NETWORK:-}" = "120u-1" ]; then
    NETWORK="120u-1"
else
    NETWORK="morocco-1"
fi

# Map network name to S3 snapshot folder (archives / chain json — not binaries)
case "$NETWORK" in
    120u-1)    S3_NET="testnet"  ;;
    morocco-1) S3_NET="mainnet"  ;;
    *)         S3_NET="mainnet"  ;;
esac

# Prefer versioned release objects: releases/<repo>/<tag>/
# Fallback order: versioned tarball → plain binary → legacy snapshots/.../releases/latest/
DOWNLOAD_URL_TGZ="${RELEASES_BASE}/v${TERPD_VERSION}/terpd-${TERPD_VERSION}-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="${RELEASES_BASE}/v${TERPD_VERSION}/${BINARY_NAME}"
DOWNLOAD_URL_LEGACY="${S3_BASE}/${S3_NET}/releases/latest/${BINARY_NAME}"

# ── Header ──────────────────────────────────────────────────────────────
intro_terp
echo "=== Terp Network Installer v${TERPD_VERSION} ==="
echo ""
echo "  Platform : ${OS}/${ARCH}"
echo "  Network  : ${NETWORK}"
echo "  Binary   : ${BINARY_DEST}"
echo "  Source   : ${DOWNLOAD_URL_TGZ}"
echo ""

# ── Ensure binary directory exists ──────────────────────────────────────
BIN_DIR="$(dirname "$BINARY_DEST")"
mkdir -p "$BIN_DIR"

# ── Download binary ────────────────────────────────────────────────────
echo "Downloading terpd v${TERPD_VERSION}..."
TMPFILE="$(mktemp /tmp/terpd.XXXXXX)"
DOWNLOAD_OK=0
EXTRACTED=0

try_download() {
    _url="$1"
    echo "  Trying: ${_url}"
    if command -v curl >/dev/null 2>&1; then
        curl -fSL "$_url" -o "$TMPFILE" 2>/dev/null && return 0
    elif command -v wget >/dev/null 2>&1; then
        wget -q "$_url" -O "$TMPFILE" 2>/dev/null && return 0
    fi
    return 1
}

if try_download "$DOWNLOAD_URL_TGZ"; then
    DOWNLOAD_OK=1
    EXTRACTED=1
elif try_download "$DOWNLOAD_URL"; then
    DOWNLOAD_OK=1
elif try_download "$DOWNLOAD_URL_LEGACY"; then
    DOWNLOAD_OK=1
    echo "  (used legacy snapshots path)"
fi

if [ "$DOWNLOAD_OK" = "1" ] && [ -s "$TMPFILE" ]; then
    if [ "$EXTRACTED" = "1" ]; then
        TMPDIR_EXT="$(mktemp -d /tmp/terpd-ext.XXXXXX)"
        tar -xzf "$TMPFILE" -C "$TMPDIR_EXT" 2>/dev/null || tar -xf "$TMPFILE" -C "$TMPDIR_EXT" 2>/dev/null || true
        FOUND="$(find "$TMPDIR_EXT" -type f \( -name 'terpd' -o -name 'terpd-linux-*' -o -name 'terpd-darwin-*' \) 2>/dev/null | head -1)"
        if [ -n "$FOUND" ] && [ -s "$FOUND" ]; then
            mv "$FOUND" "$TMPFILE"
        fi
        rm -rf "$TMPDIR_EXT"
    fi
    chmod +x "$TMPFILE"
    if [ -w "$BIN_DIR" ]; then
        mv "$TMPFILE" "$BINARY_DEST"
    else
        echo ""
        echo "Installing to ${BIN_DIR} requires root access."
        echo "Enter your password (sudo) to complete installation."
        sudo mv "$TMPFILE" "$BINARY_DEST"
        sudo chown "$(id -u):$(id -g)" "$BINARY_DEST" 2>/dev/null || true
        sudo chmod +x "$BINARY_DEST"
    fi
else
    # ── Fallback: build from source (local checkout or go install) ────
    rm -f "$TMPFILE"
    echo ""
    echo "Binary download failed. Attempting to build terpd from source..."
    echo ""

    if command -v go >/dev/null 2>&1; then
        # Try local terp-core checkout first
        if [ -d "$HOME/terp-core/cmd/terpd" ]; then
            echo "Found local clone at $HOME/terp-core. Building..."
            cd "$HOME/terp-core"
            go build -o "$BINARY_DEST" ./cmd/terpd/
            cd "$OLDPWD"
        elif [ -d "$HOME/abstract/terp-core/cmd/terpd" ]; then
            echo "Found local clone at $HOME/abstract/terp-core. Building..."
            cd "$HOME/abstract/terp-core"
            go build -o "$BINARY_DEST" ./cmd/terpd/
            cd "$OLDPWD"
        else
            echo "Attempting go install (requires a tagged release on GitHub)..."
            go install "github.com/terpnetwork/terp-core/v6/cmd/terpd@v${TERPD_VERSION}" 2>/dev/null && {
                GO_BIN="$(go env GOPATH)/bin/terpd"
                if [ "$GO_BIN" != "$BINARY_DEST" ] && [ -f "$GO_BIN" ]; then
                    cp "$GO_BIN" "$BINARY_DEST"
                fi
            } || {
                echo ""
                echo "Error: Could not build terpd from source."
                echo "Install Go from https://go.dev/dl/ then run:"
                echo "  git clone https://github.com/terpnetwork/terp-core ~/terp-core"
                echo "  cd ~/terp-core && go build -o $BINARY_DEST ./cmd/terpd/"
                exit 1
            }
        fi
        # Verify
        if [ ! -f "$BINARY_DEST" ] || ! "$BINARY_DEST" version >/dev/null 2>&1; then
            echo "Error: Built binary failed to run." >&2
            exit 1
        fi
        echo "Build complete."
    else
        echo "Error: Go is required to build terpd from source." >&2
        echo "Install Go from https://go.dev/dl/ or: brew install go" >&2
        exit 1
    fi
fi

# ── PATH hint ────────────────────────────────────────────────────────────
case ":${PATH}:" in
    *":${BIN_DIR}:") ;;
    *)
        echo ""
        echo "Note: ${BIN_DIR} is not on your PATH."
        echo "Add it with:  export PATH=\"${BIN_DIR}:\$PATH\""
        echo "Or add to ~/.profile for persistence."
        ;;
esac

# ── Verify binary ───────────────────────────────────────────────────────
echo ""
echo "Verifying installation..."
export PATH="${BIN_DIR}:${PATH}"
terpd version || { echo "Error: terpd binary failed to run" >&2; exit 1; }

echo ""
echo "terpd v${TERPD_VERSION} installed successfully."
echo ""

# ── Bootstrap phase ─────────────────────────────────────────────────────
# Build bootstrap flags.  If the user already passed explicit flags, use
# those verbatim.  If no flags and we have a terminal, run the wizard.
if [ $# -gt 0 ]; then
    # Explicit flags from command line — pass them through
    BOOTSTRAP_CMD="terpd bootstrap $*"
elif stdin_available; then
    # ── Interactive Setup Wizard ──────────────────────────────────────
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║        Terp Node Setup Wizard                            ║"
    echo "║  Press Enter to accept defaults in [brackets].           ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    # 1. Network
    echo "1) Network & Chain"
    echo "   1) morocco-1   (mainnet)"
    echo "   2) 120u-1     (testnet)"
    prompt NET_CHOICE "Enter choice [1]:" "1"
    case "$NET_CHOICE" in
        2) BOOTSTRAP_FLAGS="--network 120u-1"
           NETWORK="120u-1" ;;
        *) BOOTSTRAP_FLAGS="--network morocco-1"
           NETWORK="morocco-1" ;;
    esac
    echo "  -> ${NETWORK}"
    echo ""

    # 2. Custom home directory
    prompt TERP_HOME "Home directory [~/.terpd]:" ""
    [ -n "$TERP_HOME" ] && BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --home $TERP_HOME"
    echo ""

    # 3. Custom moniker
    prompt MONIKER "Node moniker [auto-generated]:" ""
    [ -n "$MONIKER" ] && BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --moniker $MONIKER"
    echo ""

    # 4. P2P mode (ask before sync — private cannot statesync)
    echo "2) P2P mode"
    echo "   private — no PEX, no inbound peers (default). Cannot use state-sync."
    echo "   public  — gossip and accept peers. State-sync allowed."
    PRIVATE_NODE=1
    if confirm "Public mode (enable PEX gossip and accept peers)?" "N"; then
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --public"
        PRIVATE_NODE=0
        echo "  -> public"
    else
        echo "  -> private (statesync prohibited)"
    fi
    echo ""

    # 5. Sync mode
    echo "3) Sync Mode"
    if [ "$PRIVATE_NODE" = "1" ]; then
        echo "   Private node: state-sync is disabled (needs public P2P)."
        echo "   Snapshot: lightweight (small recent state) or pruned (pruned pack)."
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --sync-mode snapshot"
        SYNC_CHOICE="2"
        echo "  -> snapshot"
    else
        echo "   State-sync is fastest — downloads recent state only (public P2P)."
        echo "   Snapshot restores a pack (lightweight or pruned)."
        prompt SYNC_CHOICE "Sync mode [1=state-sync, 2=snapshot, Enter=1]:" "1"
        case "$SYNC_CHOICE" in
            2) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --sync-mode snapshot"
               echo "  -> snapshot" ;;
            *) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --sync-mode statesync"
               echo "  -> state-sync" ;;
        esac
    fi
    echo ""

    # 6. State-sync RPCs or snapshot class
    if [ "$SYNC_CHOICE" != "2" ]; then
        if [ "$NETWORK" = "120u-1" ]; then
            DEFAULT_RPCS="https://testnet-rpc.terp.network:443,https://testnet-rpc.terp.network:443"
        else
            DEFAULT_RPCS="https://rpc.terp.network:443,https://rpc.terp.network:443"
        fi
        prompt RPC_CHOICE "State-sync RPCs (comma-separated) [${DEFAULT_RPCS}]:" ""
        [ -n "$RPC_CHOICE" ] && BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --statesync-rpcs $RPC_CHOICE"
    else
        echo "   Snapshot class"
        echo "   1) lightweight — small recent state (snapshot_light / pruned class)"
        echo "   2) pruned      — pruned pack from minio.terp.network"
        prompt SNAP_CLASS "Snapshot class [1=lightweight, 2=pruned, Enter=1]:" "1"
        case "$SNAP_CLASS" in
            2) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --snapshot-class pruned"
               echo "  -> pruned" ;;
            *) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --snapshot-class light"
               echo "  -> lightweight" ;;
        esac
        prompt SNAP_URL "Override snapshot URL (empty = resolve from catalog):" ""
        [ -n "$SNAP_URL" ] && BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --snapshot-url $SNAP_URL"
    fi
    echo ""

    # 7. Pruning
    echo "4) Pruning"
    echo "   default   — keep last 100 states (balanced)"
    echo "   nothing   — keep all states (lots of disk space)"
    echo "   everything — prune all but current state (minimal disk)"
    prompt PRUNE_CHOICE "Pruning [default/nothing/everything, Enter=default]:" "default"
    BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --pruning $PRUNE_CHOICE"
    echo "  -> ${PRUNE_CHOICE}"
    echo ""

    # 7. Trust offset (only for statesync)
    if [ "$SYNC_CHOICE" != "2" ]; then
        prompt TRUST_OFFSET "Trust offset blocks [1000]:" ""
        [ -n "$TRUST_OFFSET" ] && BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --trust-offset $TRUST_OFFSET"
    fi
    echo ""

    # 8. Cosmovisor
    if confirm "Install cosmovisor for automatic upgrades?" "N"; then
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --cosmovisor"
    fi
    echo ""

    # 9. Systemd service (Linux only)
    if [ "$OS" = "linux" ] && confirm "Create systemd service?" "N"; then
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --service"
    fi
    echo ""

    BOOTSTRAP_CMD="terpd bootstrap $BOOTSTRAP_FLAGS"
else
    # Non-interactive with no flags — use defaults for mainnet
    BOOTSTRAP_CMD="terpd bootstrap"
fi

# ── Run bootstrap ───────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Bootstrap Command                                      ║"
echo "║  $BOOTSTRAP_CMD"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Executing bootstrap..."

# shellcheck disable=SC2086
$BOOTSTRAP_CMD