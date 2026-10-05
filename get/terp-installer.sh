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
# Keep in sync with get/terp-installer.py and s3.terp.network/releases/terp-core/vX.Y.Z
# morocco-1 (mainnet) stays on the rolling patch until the v6.1 halt.
# 120u-1 (testnet) is the dual-upgrade line (v6.2.0 includes v6.1).
MAINNET_VERSION="${MAINNET_VERSION:-6.0.1}"
TESTNET_VERSION="${TESTNET_VERSION:-6.2.0}"
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

# ── Detect network from flags or env. Interactive: ask before download. ──
NETWORK_LOCKED=""
if echo "$*" | grep -q -- "--network 120u-1\|--network=120u-1"; then
    NETWORK="120u-1"
    NETWORK_LOCKED=1
elif echo "$*" | grep -q -- "--network morocco-1\|--network=morocco-1"; then
    NETWORK="morocco-1"
    NETWORK_LOCKED=1
elif [ "${TERP_NETWORK:-}" = "120u-1" ] || [ "${TERP_NETWORK:-}" = "morocco-1" ]; then
    NETWORK="$TERP_NETWORK"
    NETWORK_LOCKED=1
else
    NETWORK=""
fi

# ── Header ──────────────────────────────────────────────────────────────
intro_terp
echo "=== Terp Network Installer ==="
echo ""
echo "  Platform : ${OS}/${ARCH}"
echo "  Binary   : ${BINARY_DEST}"
echo "  Mainnet  : morocco-1  terpd v${MAINNET_VERSION}"
echo "  Testnet  : 120u-1     terpd v${TESTNET_VERSION}"
echo ""

# Ask network before downloading so testnet does not get the mainnet ELF.
if [ -z "$NETWORK" ]; then
    if stdin_available; then
        echo "1) Network"
        echo "   1) morocco-1   (mainnet, v${MAINNET_VERSION})"
        echo "   2) 120u-1      (testnet, v${TESTNET_VERSION})"
        prompt NET_CHOICE "Enter choice [1]:" "1"
        case "$NET_CHOICE" in
            2) NETWORK="120u-1" ;;
            *) NETWORK="morocco-1" ;;
        esac
        NETWORK_LOCKED=1
        echo "  -> ${NETWORK}"
        echo ""
    else
        NETWORK="morocco-1"
    fi
fi

case "$NETWORK" in
    120u-1)    S3_NET="testnet";  _default_ver="$TESTNET_VERSION" ;;
    morocco-1) S3_NET="mainnet";  _default_ver="$MAINNET_VERSION" ;;
    *)         S3_NET="mainnet";  _default_ver="$MAINNET_VERSION" ;;
esac
TERPD_VERSION="${TERPD_VERSION:-$_default_ver}"

DOWNLOAD_URL_TGZ="${RELEASES_BASE}/v${TERPD_VERSION}/terpd-${TERPD_VERSION}-${OS}-${ARCH}.tar.gz"
DOWNLOAD_URL="${RELEASES_BASE}/v${TERPD_VERSION}/${BINARY_NAME}"
DOWNLOAD_URL_LEGACY="${S3_BASE}/${S3_NET}/releases/latest/${BINARY_NAME}"
SUMS_URL="${RELEASES_BASE}/v${TERPD_VERSION}/sha256sum.txt"

echo "  Network  : ${NETWORK}"
echo "  Version  : v${TERPD_VERSION}"
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

sha256_file() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        sha256sum "$1" | awk '{print $1}'
    fi
}

verify_tarball_sum() {
    _tar="$1"
    _name="$2"
    _want=""
    if command -v curl >/dev/null 2>&1; then
        _want="$(curl -fsSL "$SUMS_URL" 2>/dev/null | awk -v n="$_name" '$2 == n {print $1; exit}')" || true
    fi
    if [ -z "$_want" ]; then
        if [ "$OS" = "linux" ]; then
            echo "Error: $SUMS_URL has no $_name (refusing unsigned linux ELF)" >&2
            return 1
        fi
        echo "  (no sha256sum.txt entry for $_name — darwin pack may not be published yet)"
        return 0
    fi
    _got="$(sha256_file "$_tar")"
    if [ "$_got" != "$_want" ]; then
        echo "Error: checksum mismatch for $_name" >&2
        echo "  want $_want" >&2
        echo "  got  $_got" >&2
        return 1
    fi
    echo "  checksum ok $_name"
}

# Published darwin ELFs must not rpath this clone. If the tarball still
# links libwasmvm.dylib, put the dylib next to terpd and add @loader_path.
fix_darwin_wasmvm() {
    [ "$OS" = "darwin" ] || return 0
    command -v otool >/dev/null 2>&1 || return 0
    if ! otool -L "$BINARY_DEST" | grep -q libwasmvm.dylib; then
        return 0
    fi
    if [ -n "${WASMVM_DYLIB:-}" ] && [ -f "$WASMVM_DYLIB" ]; then
        cp -f "$WASMVM_DYLIB" "$BIN_DIR/libwasmvm.dylib"
        chmod 755 "$BIN_DIR/libwasmvm.dylib"
    fi
    if [ ! -f "$BIN_DIR/libwasmvm.dylib" ]; then
        echo "Error: terpd links libwasmvm.dylib but it was not in the tarball." >&2
        echo "This is the v6.0.0 darwin rpath bug. Rebuild with:" >&2
        echo "  make build-darwin-arm64   # static_wasm, no dylib" >&2
        return 1
    fi
    if command -v install_name_tool >/dev/null 2>&1; then
        install_name_tool -add_rpath "@loader_path" "$BINARY_DEST" 2>/dev/null || true
        install_name_tool -add_rpath "$BIN_DIR" "$BINARY_DEST" 2>/dev/null || true
    fi
    echo "  placed $BIN_DIR/libwasmvm.dylib (@loader_path)"
}

build_from_source() {
    _src=""
    for _cand in "$HOME/abstract/terp-core" "$HOME/terp-core"; do
        if [ -d "$_cand/cmd/terpd" ]; then
            _src="$_cand"
            break
        fi
    done
    if [ -z "$_src" ]; then
        echo "Error: no published ${OS}/${ARCH} tarball for v${TERPD_VERSION} and no local terp-core clone." >&2
        echo "Linux: wait for releases/terp-core/v${TERPD_VERSION}/" >&2
        echo "Darwin: git clone https://github.com/terpnetwork/terp-core ~/terp-core" >&2
        echo "  cd ~/terp-core && make build-darwin-arm64 && cp build/terpd-darwin-arm64 $BINARY_DEST" >&2
        return 1
    fi
    echo "Found local clone at $_src. Building (static wasmvm on darwin)..."
    (
        cd "$_src"
        if [ "$OS" = "darwin" ]; then
            make build-darwin-arm64
            cp -f build/terpd-darwin-arm64 "$BINARY_DEST"
        else
            GOWORK=off go build -mod=mod -tags "netgo ledger" -o "$BINARY_DEST" ./cmd/terpd
        fi
    )
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
    WASMVM_DYLIB=""
    if [ "$EXTRACTED" = "1" ]; then
        verify_tarball_sum "$TMPFILE" "terpd-${TERPD_VERSION}-${OS}-${ARCH}.tar.gz" || { rm -f "$TMPFILE"; exit 1; }
        TMPDIR_EXT="$(mktemp -d /tmp/terpd-ext.XXXXXX)"
        tar -xzf "$TMPFILE" -C "$TMPDIR_EXT" 2>/dev/null || tar -xf "$TMPFILE" -C "$TMPDIR_EXT" 2>/dev/null || true
        FOUND="$(find "$TMPDIR_EXT" -type f \( -name 'terpd' -o -name 'terpd-linux-*' -o -name 'terpd-darwin-*' \) 2>/dev/null | head -1)"
        DYLIB_FOUND="$(find "$TMPDIR_EXT" -type f -name 'libwasmvm.dylib' 2>/dev/null | head -1)"
        if [ -n "$FOUND" ] && [ -s "$FOUND" ]; then
            mv "$FOUND" "$TMPFILE"
        fi
        if [ -n "$DYLIB_FOUND" ] && [ -s "$DYLIB_FOUND" ]; then
            WASMVM_DYLIB="$BIN_DIR/libwasmvm.dylib"
            cp -f "$DYLIB_FOUND" "$WASMVM_DYLIB"
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
        [ -n "$WASMVM_DYLIB" ] && [ -f "$WASMVM_DYLIB" ] && sudo chmod 755 "$WASMVM_DYLIB" || true
    fi
    fix_darwin_wasmvm || { echo "Error: darwin wasmvm dylib missing" >&2; exit 1; }
else
    rm -f "$TMPFILE"
    echo ""
    echo "Binary download failed (no object at ${DOWNLOAD_URL_TGZ})."
    echo "Attempting to build terpd v${TERPD_VERSION} from source..."
    echo ""
    if ! command -v go >/dev/null 2>&1; then
        echo "Error: Go is required to build terpd from source." >&2
        echo "Install Go from https://go.dev/dl/ or: brew install go" >&2
        exit 1
    fi
    build_from_source || exit 1
    echo "Build complete."
fi

# Persist PATH in files the login shell actually reads (zsh ignores ~/.profile).
ensure_path_file() {
    _file="$1"
    _dir="$2"
    _mark="# terp-installer: PATH ${_dir}"
    _line="export PATH=\"${_dir}:\$PATH\""
    touch "$_file" 2>/dev/null || return 0
    if grep -Fq "$_mark" "$_file" 2>/dev/null; then
        return 0
    fi
    printf '\n%s\n%s\n' "$_mark" "$_line" >> "$_file"
    echo "  PATH += ${_dir}  ($_file)"
}

link_terpd_on_path() {
    _d=""
    for _d in /opt/homebrew/bin /usr/local/bin "$HOME/.local/bin"; do
        if [ "$_d" = "$HOME/.local/bin" ]; then
            mkdir -p "$_d"
        fi
        if [ -d "$_d" ] && [ -w "$_d" ]; then
            ln -sf "$BINARY_DEST" "$_d/terpd"
            echo "  linked ${_d}/terpd -> ${BINARY_DEST}"
            return 0
        fi
    done
    return 1
}

echo ""
echo "Installing terpd on PATH..."
export PATH="${BIN_DIR}:${PATH}"
link_terpd_on_path || true
ensure_path_file "$HOME/.zprofile" "$BIN_DIR"
ensure_path_file "$HOME/.zshrc" "$BIN_DIR"
ensure_path_file "$HOME/.bash_profile" "$BIN_DIR"
ensure_path_file "$HOME/.profile" "$BIN_DIR"
if [ -d "$HOME/.local/bin" ]; then
    export PATH="${HOME}/.local/bin:${PATH}"
    ensure_path_file "$HOME/.zprofile" "$HOME/.local/bin"
    ensure_path_file "$HOME/.zshrc" "$HOME/.local/bin"
fi
hash -r 2>/dev/null || true
command -v rehash >/dev/null 2>&1 && rehash || true

# ── Verify binary ───────────────────────────────────────────────────────
echo ""
echo "Verifying installation..."
if ! "$BINARY_DEST" version; then
    echo "Error: terpd binary failed to run ($BINARY_DEST)" >&2
    exit 1
fi
echo "  binary: $BINARY_DEST"
command -v terpd >/dev/null && echo "  command: $(command -v terpd)" || echo "  command: open a new terminal (or: source ~/.zprofile)"

echo ""
echo "terpd v${TERPD_VERSION} installed successfully."
echo ""

# ── Bootstrap phase ─────────────────────────────────────────────────────
# Build bootstrap flags.  If the user already passed explicit flags, use
# those verbatim.  If no flags and we have a terminal, run the wizard.
if [ $# -gt 0 ]; then
    # Explicit flags from command line — pass them through
    BOOTSTRAP_CMD="$BINARY_DEST bootstrap $*"
elif stdin_available; then
    # ── Interactive Setup Wizard ──────────────────────────────────────
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║        Terp Node Setup Wizard                            ║"
    echo "║  Press Enter to accept defaults in [brackets].           ║"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""

    # 1. Network (already chosen before download so the ELF matches the chain)
    echo "1) Network & Chain: ${NETWORK} (terpd v${TERPD_VERSION})"
    BOOTSTRAP_FLAGS="--network ${NETWORK}"
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
            2) SNAP_KIND="pruned" ;;
            *) SNAP_KIND="light" ;;
        esac
        echo "  -> ${SNAP_KIND}"
        prompt SNAP_URL "Override snapshot URL (empty = resolve from catalog):" ""
        if [ -n "$SNAP_URL" ]; then
            BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --snapshot-url $SNAP_URL"
        elif "$BINARY_DEST" bootstrap -h 2>&1 | grep -q -- '--snapshot-class'; then
            BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --snapshot-class $SNAP_KIND"
        else
            # v6.0.1 has --sync-mode snapshot but not --snapshot-class.
            _netpath="mainnet/${NETWORK}"
            [ "$NETWORK" = "120u-1" ] && _netpath="testnet/120u-1"
            if [ "$SNAP_KIND" = "pruned" ]; then
                _cat="https://minio.terp.network/snapshots/${_netpath}/pruned/snapshot.json"
            else
                _cat="https://minio.terp.network/snapshots/${_netpath}/snapshot_light.json"
            fi
            _resolved=""
            if command -v python3 >/dev/null 2>&1; then
                _resolved="$(curl -fsSL "$_cat" 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin)
u=d.get("latest") or d.get("url") or ((d.get("snapshots") or [None])[0])
print(u or "")' 2>/dev/null || true)"
            fi
            if [ -n "$_resolved" ]; then
                BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --snapshot-url $_resolved"
                echo "  catalog $_cat"
            else
                echo "  (no catalog URL; pass --snapshot-url or the node will sync from genesis)"
            fi
        fi
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

    BOOTSTRAP_CMD="$BINARY_DEST bootstrap $BOOTSTRAP_FLAGS"
else
    # Non-interactive with no flags — use defaults for mainnet
    BOOTSTRAP_CMD="$BINARY_DEST bootstrap --network ${NETWORK}"
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