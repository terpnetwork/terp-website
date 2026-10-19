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
# Mainnet default = last recommended_version in terp-core versions.json, read at
# fetch time (VERSIONS_JSON_URL). Override with --version x.y.z or TERPD_VERSION.
# Testnet still follows releases/terp-core/channels/<chain-id>.
VERSIONS_JSON_URL="${VERSIONS_JSON_URL:-https://terp.network/public/data/versions.json}"
VERSIONS_JSON_FALLBACK="${VERSIONS_JSON_FALLBACK:-https://raw.githubusercontent.com/terpnetwork/terp-core/main/networks/chain-registry/terpnetwork/versions.json}"
MAINNET_VERSION="${MAINNET_VERSION:-6.4.0}"   # offline fallback only
TESTNET_VERSION="${TESTNET_VERSION:-6.2.1}"
RELEASES_BASE="${RELEASES_BASE:-https://s3.terp.network/releases/terp-core}"
S3_BASE="${S3_BASE:-https://s3.terp.network/snapshots}"
CHANNEL_BASE="${CHANNEL_BASE:-${RELEASES_BASE}/channels}"
BINARY_DEST="${TERPD_BIN:-$HOME/go/bin/terpd}"
# Live P2P + light-client RPC pin (Akash sentries are NodePorts, not :26656).
MAINNET_BOOTSTRAP_JSON="${MAINNET_BOOTSTRAP_JSON:-https://s3.terp.network/snapshots/mainnet/morocco-1/bootstrap.json}"
TESTNET_BOOTSTRAP_JSON="${TESTNET_BOOTSTRAP_JSON:-https://s3.terp.network/snapshots/testnet/120u-1/bootstrap.json}"
DEFAULT_MAINNET_PEERS="079328a5209e58dbb7658202bd0e00f8c50e07d0@provider.akash-palmito.org:30873,8392513d34207c9cec15d5d6a45fc1bd41691bf4@provider.h6i-dedicated.eu-se-1.digitalfrontier.so:30147,58e01ab84eb931a82a024324520021d2e075ec67@185.248.24.16:29656,b04c5acab1c821b95f26662d8ebb7ccd4a39e97f@144.76.97.251:34656,5ba3e8458f584edfe5434186af74f846190d5475@213.133.100.93:16056,a16e78921e03a9953178038c2c39d1f31252655c@135.181.60.157:26716"

# ── --version override (consumed here, not passed to terpd bootstrap) ──
_n=$#
while [ "$_n" -gt 0 ]; do
    _a="$1"; shift; _n=$((_n - 1))
    case "$_a" in
        --version)
            if [ "$_n" -lt 1 ]; then echo "Error: --version needs a value (e.g. --version v6.4.0)" >&2; exit 1; fi
            TERPD_VERSION="$1"; shift; _n=$((_n - 1)) ;;
        --version=*) TERPD_VERSION="${_a#--version=}" ;;
        *) set -- "$@" "$_a" ;;
    esac
done
if [ -n "${TERPD_VERSION:-}" ]; then TERPD_VERSION="${TERPD_VERSION#v}"; _ver_src="override"; fi

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

# confirm "Prompt" [default Y|N] — hint is y/N (default no) or Y/n (default yes).
confirm() {
    local __prompt=$1 __default=${2:-N}
    local __hint __yn
    case "$__default" in
        [yY]*) __hint="Y/n" ;;
        *)     __hint="y/N" ;;
    esac
    if [ -t 0 ]; then
        printf "%s [%s] " "$__prompt" "$__hint"
        read -r __yn
    elif [ -e /dev/tty ]; then
        printf "%s [%s] " "$__prompt" "$__hint" > /dev/tty
        read -r __yn < /dev/tty
    else
        __yn="$__default"
    fi
    [ -z "$__yn" ] && __yn="$__default"
    case "$__yn" in [yY]|[yY][eE][sS]) return 0;; *) return 1;; esac
}

# terpd does not expand ~. Interactive "~/.terpd-testing" must become $HOME/...
expand_node_home() {
    _p="$1"
    [ -n "$_p" ] || { printf '%s\n' "${HOME}/.terpd"; return 0; }
    # Do not use case '~/'*) or ${_p#~/}: sh expands ~ in those patterns.
    _lead="$(printf '%s' "$_p" | cut -c1-2)"
    if [ "$_p" = "~" ]; then
        _p="$HOME"
    elif [ "$_lead" = "~/" ]; then
        _p="${HOME}/$(printf '%s' "$_p" | cut -c3-)"
    fi
    _abslead="$(printf '%s' "$_p" | cut -c1)"
    if [ "$_abslead" != "/" ]; then
        _p="${PWD}/${_p}"
    fi
    mkdir -p "$_p"
    (cd "$_p" && pwd)
}

cmd_get_home() {
    _rest="$1"
    _h=""
    while [ -n "$_rest" ]; do
        _tok="${_rest%% *}"
        _rest="${_rest#"$_tok"}"
        _rest="${_rest# }"
        case "$_tok" in
            --home)
                _h="${_rest%% *}"
                break
                ;;
            --home=*) _h="${_tok#--home=}"; break ;;
        esac
    done
    if [ -z "$_h" ]; then
        printf '%s\n' "${HOME}/.terpd"
    else
        expand_node_home "$_h"
    fi
}

cmd_set_home() {
    _in="$1"
    _abs="$2"
    _out=""
    _seen=0
    _rest="$_in"
    while [ -n "$_rest" ]; do
        _tok="${_rest%% *}"
        _rest="${_rest#"$_tok"}"
        _rest="${_rest# }"
        case "$_tok" in
            --home)
                _skip="${_rest%% *}"
                _rest="${_rest#"$_skip"}"
                _rest="${_rest# }"
                _out="${_out} --home ${_abs}"
                _seen=1
                ;;
            --home=*)
                _out="${_out} --home=${_abs}"
                _seen=1
                ;;
            *) _out="${_out} ${_tok}" ;;
        esac
    done
    [ "$_seen" = 1 ] || _out="${_out} --home ${_abs}"
    printf '%s' "$_out" | sed 's/^ //'
}

ensure_priv_validator_state() {
    _h="$1"
    mkdir -p "${_h}/data"
    if [ ! -f "${_h}/data/priv_validator_state.json" ]; then
        printf '%s\n' '{"height":"0","round":0,"step":0}' > "${_h}/data/priv_validator_state.json"
        echo "  wrote ${_h}/data/priv_validator_state.json"
    fi
}

# Discover id@ip:port from the public RPC. Never use ListenAddr 0.0.0.0/10.x
# or a hardcoded provider hostname — those rotate with the lease.
# Order: GET /p2p (nginx advertise JSON), then /status if listen_addr is routable.
fetch_rpc_persistent_peer() {
    _rpc="${1:-https://rpc.terp.network:443}"
    command -v python3 >/dev/null 2>&1 || { echo "python3 required to discover P2P from RPC" >&2; return 1; }
    python3 - "$_rpc" <<'PY'
import ipaddress, json, socket, ssl, sys, urllib.error, urllib.request

rpc = sys.argv[1].rstrip("/")
ctx = ssl.create_default_context()
hdr = {"User-Agent": "terp-installer", "Accept": "application/json"}

def get(url, timeout=15):
    req = urllib.request.Request(url, headers=hdr)
    with urllib.request.urlopen(req, context=ctx, timeout=timeout) as r:
        return r.read()

def routable(host):
    host = (host or "").strip().strip("[]")
    if not host or host.lower() in ("0.0.0.0", "::", "localhost", "*"):
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except socket.gaierror:
        return False
    for info in infos:
        ip = info[4][0]
        try:
            addr = ipaddress.ip_address(ip)
        except ValueError:
            continue
        if addr.is_unspecified or addr.is_loopback or addr.is_link_local or addr.is_multicast or addr.is_private:
            return False
        return True
    return False

def parse_hostport(raw):
    s = str(raw).strip()
    if "@" in s:
        s = s.split("@", 1)[1]
    s = s.replace("tcp://", "").replace("udp://", "")
    if s.startswith("["):
        br = s.find("]")
        host, rest = s[1:br], s[br + 1:]
        port = rest[1:] if rest.startswith(":") else "26656"
        return host, port
    if ":" in s:
        return s.rsplit(":", 1)
    return s, "26656"

def public_ip(host, port):
    if not routable(host):
        return None
    try:
        ip = socket.getaddrinfo(host, int(port), socket.AF_INET, socket.SOCK_STREAM)[0][4][0]
    except Exception:
        ip = host
    return ip if routable(ip) else None

def peer_from_mapping(d, nid):
    if not isinstance(d, dict):
        return None
    nid = d.get("id") or d.get("node_id") or nid
    for key in ("peer", "p2p", "address", "listen_addr", "listenAddr", "external_address", "externalAddress"):
        val = d.get(key)
        if not val:
            continue
        if isinstance(val, str) and "@" in val:
            nid = val.split("@", 1)[0] or nid
        host, port = parse_hostport(val)
        ip = public_ip(host, port)
        if nid and ip:
            return f"{nid}@{ip}:{port}"
    return None

nid, listen = "", ""
try:
    st = json.loads(get(rpc + "/status"))
    ni = (st.get("result") or st).get("node_info") or {}
    nid = ni.get("id") or ni.get("default_node_id") or ""
    listen = ni.get("listen_addr") or ""
except Exception as e:
    print(f"status failed: {e}", file=sys.stderr)
    sys.exit(1)

# Dedicated advertise document on the product RPC (not /net_info — that stays 403).
for path in ("/p2p", "/p2p.json"):
    try:
        raw = get(rpc + path)
        body = json.loads(raw)
        if isinstance(body, dict) and "result" in body:
            body = body["result"]
        peer = peer_from_mapping(body, nid)
        if peer:
            print(peer)
            sys.exit(0)
    except Exception:
        pass

host, port = parse_hostport(listen)
ip = public_ip(host, port)
if nid and ip:
    print(f"{nid}@{ip}:{port}")
    sys.exit(0)

print(
    "public RPC did not advertise a routable P2P address "
    f"(id={nid or '?'} listen_addr={listen or 'missing'}; GET {rpc}/p2p expected JSON "
    '{"id","listen_addr"} with a public IP:port). /net_info is intentionally closed.',
    file=sys.stderr,
)
sys.exit(1)
PY
}

# terpd bootstrap --public is required to allow statesync; then we lock P2P.
lock_p2p_toml() {
    _home="$1"
    _peer="$2"
    _pex="$3"
    python3 - "$_home/config/config.toml" "$_peer" "$_pex" <<'PY'
import sys
path, peer, pex = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(path).read()
lines = text.splitlines(True)
out, sec = [], ""
for line in lines:
    if line.startswith("[") and line.strip().endswith("]"):
        sec = line.strip()
    stripped = line.lstrip()
    key = stripped.split("=", 1)[0].strip() if "=" in stripped else ""
    if sec == "[p2p]" and key == "persistent_peers":
        line = f'persistent_peers = "{peer}"\n'
    elif sec == "[p2p]" and key == "seeds":
        line = 'seeds = ""\n'
    elif sec == "[p2p]" and key == "pex":
        line = f'pex = {pex}\n'
    elif sec == "[p2p]" and key == "max_num_inbound_peers":
        line = "max_num_inbound_peers = 0\n" if pex == "false" else line
    elif sec == "[p2p]" and key == "unconditional_peer_ids":
        nid = peer.split("@", 1)[0]
        line = f'unconditional_peer_ids = "{nid}"\n'
    out.append(line)
open(path, "w").write("".join(out))
print(f"P2P locked persistent_peers={peer} pex={pex}")
PY
}

patch_statesync_toml() {
    _home="$1"
    python3 - "$_home/config/config.toml" <<'PY'
import sys
path = sys.argv[1]
lines = open(path).read().splitlines(True)
out, sec = [], ""
for line in lines:
    if line.startswith("[") and line.strip().endswith("]"):
        sec = line.strip()
    stripped = line.lstrip()
    key = stripped.split("=", 1)[0].strip() if "=" in stripped else ""
    if sec == "[statesync]" and key == "chunk_request_timeout":
        line = 'chunk_request_timeout = "60s"\n'
    elif sec == "[statesync]" and key == "discovery_time":
        line = 'discovery_time = "30s"\n'
    out.append(line)
open(path, "w").write("".join(out))
print("statesync chunk_request_timeout=60s discovery_time=30s")
PY
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
# Mainnet: latest recommended_version from versions.json.
if [ -z "${TERPD_VERSION:-}" ] && [ "$NETWORK" = "morocco-1" ]; then
    _vj="$(curl -fsSL "$VERSIONS_JSON_URL" 2>/dev/null || curl -fsSL "$VERSIONS_JSON_FALLBACK" 2>/dev/null || true)"
    _vr="$(printf '%s' "$_vj" | grep -o '"recommended_version"[[:space:]]*:[[:space:]]*"[^"]*"' | tail -n 1 | sed 's/.*"\([^"]*\)"$/\1/' | tr -d 'v' || true)"
    if [ -n "$_vr" ]; then
        _default_ver="$_vr"
        _ver_src="versions.json"
    fi
fi
# Testnet (or versions.json unreachable): channel file pin, then script default.
if [ -z "${TERPD_VERSION:-}" ] && [ -z "${_ver_src:-}" ]; then
    _ch="$(curl -fsSL "${CHANNEL_BASE}/${NETWORK}" 2>/dev/null || true)"
    _ch="$(printf '%s' "$_ch" | tr -d 'v \t\r\n')"
    if [ -n "$_ch" ]; then
        _default_ver="$_ch"
    fi
fi
TERPD_VERSION="${TERPD_VERSION:-$_default_ver}"
echo "Resolved terpd version: v${TERPD_VERSION} (source: ${_ver_src:-channel/default})"

load_bootstrap_pin() {
    _json_url="$1"
    BOOTSTRAP_PEERS="${BOOTSTRAP_PEERS:-}"
    BOOTSTRAP_RPCS="${BOOTSTRAP_RPCS:-}"
    BOOTSTRAP_TRUST_OFFSET="${BOOTSTRAP_TRUST_OFFSET:-200}"
    _raw="$(curl -fsSL "$_json_url" 2>/dev/null || true)"
    if [ -n "$_raw" ] && command -v python3 >/dev/null 2>&1; then
        _parsed="$(printf '%s' "$_raw" | python3 -c 'import json,sys
d=json.load(sys.stdin)
peers=",".join(d.get("peers") or [])
rpcs=",".join(d.get("rpc") or [])
off=d.get("trust_offset") or 2000
print(peers)
print(rpcs)
print(off)
' 2>/dev/null || true)"
        if [ -n "$_parsed" ]; then
            BOOTSTRAP_PEERS="$(printf '%s' "$_parsed" | sed -n '1p')"
            BOOTSTRAP_RPCS="$(printf '%s' "$_parsed" | sed -n '2p')"
            BOOTSTRAP_TRUST_OFFSET="$(printf '%s' "$_parsed" | sed -n '3p')"
        fi
    fi
    [ -n "$BOOTSTRAP_PEERS" ] || BOOTSTRAP_PEERS="$DEFAULT_MAINNET_PEERS"
    [ -n "$BOOTSTRAP_RPCS" ] || true
}

if [ "$NETWORK" = "120u-1" ]; then
    load_bootstrap_pin "$TESTNET_BOOTSTRAP_JSON"
    [ -n "$BOOTSTRAP_RPCS" ] || BOOTSTRAP_RPCS="https://testnet-rpc.terp.network:443,https://testnet-rpc.terp.network:443"
else
    load_bootstrap_pin "$MAINNET_BOOTSTRAP_JSON"
    [ -n "$BOOTSTRAP_RPCS" ] || BOOTSTRAP_RPCS="https://rpc.terp.network:443,https://rpc.terp.network:443"
fi

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
STATESYNC_LOCK_PEER=""
STATESYNC_LOCK_PEX="false"
if [ $# -gt 0 ]; then
    # Explicit flags from command line — keep them, pin RPC/P2P unless already set.
    EXTRA=""
    case " $* " in
        *" --statesync-rpcs "*) ;;
        *) EXTRA="$EXTRA --statesync-rpcs $BOOTSTRAP_RPCS" ;;
    esac
    case " $* " in
    *" --sync-mode statesync "*)
        RPC_PEER="$(fetch_rpc_persistent_peer "${BOOTSTRAP_RPCS%%,*}")"
        case " $* " in
            *" --bootstrap-peers "*) ;;
            *) EXTRA="$EXTRA --bootstrap-peers $RPC_PEER" ;;
        esac
        case " $* " in
            *" --setup-only "*) ;;
            *) EXTRA="$EXTRA --setup-only" ;;
        esac
        case " $* " in
            *" --public "*) ;;
            *) EXTRA="$EXTRA --public" ;;
        esac
        STATESYNC_LOCK_PEER="$RPC_PEER"
        STATESYNC_LOCK_PEX="false"
        case " $* " in *" --public "*) STATESYNC_LOCK_PEX="true" ;; esac
        ;;
    *)
        case " $* " in
            *" --bootstrap-peers "*) ;;
            *) EXTRA="$EXTRA --bootstrap-peers $BOOTSTRAP_PEERS --bootstrap-seeds $BOOTSTRAP_PEERS" ;;
        esac
        ;;
    esac
    case " $* " in
        *" --trust-offset "*) ;;
        *) EXTRA="$EXTRA --trust-offset $BOOTSTRAP_TRUST_OFFSET" ;;
    esac
    BOOTSTRAP_CMD="$BINARY_DEST bootstrap $* $EXTRA"
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

    # 2. Custom home directory (~ is expanded; terpd will not do that)
    prompt TERP_HOME "Home directory [${HOME}/.terpd]:" ""
    if [ -n "$TERP_HOME" ]; then
        TERP_HOME="$(expand_node_home "$TERP_HOME")"
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --home $TERP_HOME"
        echo "  -> ${TERP_HOME}"
    fi
    echo ""

    # 3. Custom moniker
    prompt MONIKER "Node moniker [auto-generated]:" ""
    [ -n "$MONIKER" ] && BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --moniker $MONIKER"
    echo ""

    # 4. P2P mode (private statesync is allowed: one persistent peer, PEX off)
    echo "2) P2P mode"
    echo "   private — PEX off, no inbound. State-sync uses only rpc.terp.network as a peer."
    echo "   public  — gossip and accept extra peers."
    PRIVATE_NODE=1
    if confirm "Public mode (enable PEX gossip and accept peers)?" "N"; then
        PRIVATE_NODE=0
        echo "  -> public"
    else
        echo "  -> private"
    fi
    echo ""

    # 5. Sync mode
    echo "3) Sync Mode"
    echo "   State-sync is fastest — recent state via rpc.terp.network (works private or public)."
    echo "   Snapshot restores a pruned pack from s3.terp.network."
    prompt SYNC_CHOICE "Sync mode [1=state-sync, 2=snapshot, Enter=1]:" "1"
    case "$SYNC_CHOICE" in
        2) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --sync-mode snapshot"
           echo "  -> snapshot" ;;
        *) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --sync-mode statesync"
           echo "  -> state-sync" ;;
    esac
    echo ""

    # 6. State-sync RPCs or snapshot class
    if [ "$SYNC_CHOICE" != "2" ]; then
        DEFAULT_RPCS="$BOOTSTRAP_RPCS"
        prompt RPC_CHOICE "State-sync RPCs (comma-separated) [${DEFAULT_RPCS}]:" ""
        [ -z "$RPC_CHOICE" ] && RPC_CHOICE="$DEFAULT_RPCS"
        RPC_PEER="$(fetch_rpc_persistent_peer "${RPC_CHOICE%%,*}")" || {
            echo "Could not discover a public P2P address from ${RPC_CHOICE%%,*} (need GET /p2p JSON)." >&2
            exit 1
        }
        echo "  persistent peer: ${RPC_PEER}"
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --statesync-rpcs $RPC_CHOICE"
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --bootstrap-peers $RPC_PEER"
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --trust-offset ${BOOTSTRAP_TRUST_OFFSET}"
        # Binary refuses private+statesync; --public is only the gate, then we lock P2P.
        BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --public --setup-only"
        STATESYNC_LOCK_PEER="$RPC_PEER"
        STATESYNC_LOCK_PEX="false"
        [ "$PRIVATE_NODE" = "0" ] && STATESYNC_LOCK_PEX="true"
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
                _cat="${S3_BASE}/${_netpath}/pruned/snapshot.json"
            else
                _cat="${S3_BASE}/${_netpath}/pruned/snapshot.json"
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

    # Snapshot path still needs live P2P to catch the tip after restore.
    case "$BOOTSTRAP_FLAGS" in
        *--bootstrap-peers*) ;;
        *) BOOTSTRAP_FLAGS="$BOOTSTRAP_FLAGS --bootstrap-peers $BOOTSTRAP_PEERS --bootstrap-seeds $BOOTSTRAP_PEERS" ;;
    esac
    BOOTSTRAP_CMD="$BINARY_DEST bootstrap $BOOTSTRAP_FLAGS"
else
    # Non-interactive: pin house RPC + Akash P2P (never chaintools / :26656 sentries).
    BOOTSTRAP_CMD="$BINARY_DEST bootstrap --network ${NETWORK} --sync-mode snapshot --snapshot-class pruned --statesync-rpcs ${BOOTSTRAP_RPCS} --bootstrap-peers ${BOOTSTRAP_PEERS} --bootstrap-seeds ${BOOTSTRAP_PEERS} --trust-offset ${BOOTSTRAP_TRUST_OFFSET}"
fi

# ── Run bootstrap ───────────────────────────────────────────────────────
echo "╔══════════════════════════════════════════════════════════╗"
echo "║  Bootstrap Command                                      ║"
echo "║  $BOOTSTRAP_CMD"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""
echo "Executing bootstrap..."

# Statesync/snapshot cannot load leftover IAVL. A July ~/.terpd at store
# 21465807 has no hashmerchant (added at v6 halt 22810000) and terpd start
# exits: "version of store hashmerchant mismatch root store's version".
bootstrap_home="$(cmd_get_home "$BOOTSTRAP_CMD")"
BOOTSTRAP_CMD="$(cmd_set_home "$BOOTSTRAP_CMD" "$bootstrap_home")"
echo "  Node home: ${bootstrap_home}"
if [ -d "$bootstrap_home/data/application.db" ] || [ -d "$bootstrap_home/data/data/application.db" ]; then
    echo "Existing chain data at ${bootstrap_home}/data is from an older store or a nested snapshot extract."
    echo "Keeping config/ and keyring; removing data/, wasm/, ibc_08-wasm/ so statesync or a pruned pack can load."
    rm -rf "$bootstrap_home/data" "$bootstrap_home/wasm" "$bootstrap_home/ibc_08-wasm"
    # Comet requires this file; terpd init is skipped when config/ already exists.
    ensure_priv_validator_state "$bootstrap_home"
fi
ensure_priv_validator_state "$bootstrap_home"
# Flatten a nested extract (terpd bootstrap unpacks into home/data, but house
# packs are tar -C home of data/ + wasm/, so application.db lands at data/data/).
flatten_nested_snapshot() {
    _h="$1"
    if [ -d "$_h/data/data/application.db" ]; then
        echo "Flattening nested snapshot under ${_h}/data/data -> ${_h}/data"
        _tmp="$(mktemp -d "${TMPDIR:-/tmp}/terp-snap.XXXXXX")"
        mv "$_h/data/data" "$_tmp/data"
        if [ -d "$_h/data/wasm" ]; then
            mv "$_h/data/wasm" "$_tmp/wasm"
        fi
        rm -rf "$_h/data"
        mv "$_tmp/data" "$_h/data"
        if [ -d "$_tmp/wasm" ]; then
            rm -rf "$_h/wasm"
            mv "$_tmp/wasm" "$_h/wasm"
        fi
        rmdir "$_tmp" 2>/dev/null || true
    fi
}

# House packs extract with -C <home>. terpd bootstrap HTTP path uses -C <home>/data.
# Pre-extract here and drop --snapshot-url so bootstrap will not nest the tree.
case " $BOOTSTRAP_CMD " in
    *" --sync-mode snapshot "*|*" --snapshot-url "*|*" --snapshot-class "*)
        _snap_url=""
        _scan="$BOOTSTRAP_CMD"
        while [ -n "$_scan" ]; do
            _tok="${_scan%% *}"
            _scan="${_scan#"$_tok"}"
            _scan="${_scan# }"
            case "$_tok" in
                --snapshot-url)
                    _snap_url="${_scan%% *}"
                    _scan="${_scan#"$_snap_url"}"
                    _scan="${_scan# }"
                    ;;
                --snapshot-url=*) _snap_url="${_tok#--snapshot-url=}" ;;
            esac
        done
        if [ -z "$_snap_url" ]; then
            _netpath="mainnet/${NETWORK}"
            [ "$NETWORK" = "120u-1" ] && _netpath="testnet/120u-1"
            _cat="${S3_BASE}/${_netpath}/pruned/snapshot.json"
            if command -v python3 >/dev/null 2>&1; then
                _snap_url="$(curl -fsSL "$_cat" 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin)
u=d.get("latest") or d.get("url") or ((d.get("snapshots") or [None])[0])
print(u or "")' 2>/dev/null || true)"
            fi
        fi
        if [ -n "$_snap_url" ]; then
            echo "Extracting snapshot into ${bootstrap_home} (data/ + wasm/ at home, not home/data/data/)"
            echo "  $_snap_url"
            mkdir -p "$bootstrap_home"
            if command -v lz4 >/dev/null 2>&1; then
                curl -fSL "$_snap_url" | lz4 -dc | tar xf - -C "$bootstrap_home"
            else
                echo "Error: lz4 is required to unpack .tar.lz4 snapshots" >&2
                exit 1
            fi
            flatten_nested_snapshot "$bootstrap_home"
            if [ ! -d "$bootstrap_home/data/application.db" ]; then
                echo "Error: snapshot extract did not produce ${bootstrap_home}/data/application.db" >&2
                exit 1
            fi
            echo "  application.db present; wasm=$( [ -d "$bootstrap_home/wasm" ] && echo yes || echo missing )"
            # Drop URL so terpd bootstrap does not extract again into home/data.
            _new=""
            _scan="$BOOTSTRAP_CMD"
            while [ -n "$_scan" ]; do
                _tok="${_scan%% *}"
                _scan="${_scan#"$_tok"}"
                _scan="${_scan# }"
                case "$_tok" in
                    --snapshot-url|--snapshot-class)
                        _skip="${_scan%% *}"
                        _scan="${_scan#"$_skip"}"
                        _scan="${_scan# }"
                        ;;
                    --snapshot-url=*|--snapshot-class=*) ;;
                    *) _new="${_new} ${_tok}" ;;
                esac
            done
            BOOTSTRAP_CMD="$(printf '%s' "$_new" | sed 's/^ //')"
        fi
        ;;
esac
flatten_nested_snapshot "$bootstrap_home"

# shellcheck disable=SC2086
$BOOTSTRAP_CMD
_bs_rc=$?
[ "$_bs_rc" -eq 0 ] || exit "$_bs_rc"

if [ -n "${STATESYNC_LOCK_PEER:-}" ]; then
    lock_p2p_toml "$bootstrap_home" "$STATESYNC_LOCK_PEER" "$STATESYNC_LOCK_PEX"
    patch_statesync_toml "$bootstrap_home"
    ensure_priv_validator_state "$bootstrap_home"
    echo "Starting node at ${bootstrap_home} ..."
    exec "$BINARY_DEST" start --home "$bootstrap_home"
fi