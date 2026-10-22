#!/usr/bin/env bash
# terp-installer.sh — Install terpd and bootstrap a Terp Network node
#
# Downloads the terpd binary for your platform (linux/darwin, amd64/arm64),
# verifies it against the release sha256sum.txt, then runs a setup wizard
# (or a non-interactive default) before delegating to `terpd bootstrap`.
#
# Usage:
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --network morocco-1
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --setup-only
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --version vX.Y.Z
#   curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- --dry-run
#
# Installer flags (consumed here): --version, --dry-run, --yes, --non-interactive, --help.
# Every other flag is passed through to `terpd bootstrap`, which handles
# init, genesis download, state-sync, pruning, cosmovisor, systemd.
#
# The whole script is function definitions; `main "$@"` is the final line, so
# a truncated download (curl | bash) defines functions but never runs anything.

# Refuse plain sh/dash early (this line must stay POSIX).
if [ -z "${BASH_VERSION:-}" ]; then echo "terp-installer: please run with bash (curl ... | bash)" >&2; exit 1; fi
set -euo pipefail

# ── Configuration (user-overridable via env vars) ────────────────────────
# No version is hard-coded. The default comes from terp-core versions.json
# (last entry's recommended_version) at fetch time; testnet follows the
# release channel file. Override with --version x.y.z or TERPD_VERSION.
VERSIONS_JSON_URL="${VERSIONS_JSON_URL:-https://terp.network/public/data/versions.json}"
VERSIONS_JSON_FALLBACK="${VERSIONS_JSON_FALLBACK:-https://raw.githubusercontent.com/terpnetwork/terp-core/main/networks/chain-registry/terpnetwork/versions.json}"
RELEASES_BASE="${RELEASES_BASE:-https://s3.terp.network/releases/terp-core}"
S3_BASE="${S3_BASE:-https://s3.terp.network/snapshots}"
CHANNEL_BASE="${CHANNEL_BASE:-${RELEASES_BASE}/channels}"
BINARY_DEST="${TERPD_BIN:-$HOME/go/bin/terpd}"
TERP_CORE_REPO="${TERP_CORE_REPO:-https://github.com/terpnetwork/terp-core}"
# Object layout in s3.terp.network/releases (checked 2026-10-22):
#   terp-core/v<ver>/terpd-<ver>-<os>-<arch>.tar.gz   (preferred, listed in sha256sum.txt)
#   terp-core/v<ver>/terpd-<os>-<arch>                (raw binary, listed in sha256sum.txt)
#   terp-core/v<ver>/sha256sum.txt                    (lists exactly the platforms published)
# Darwin builds are cut separately and may lag Linux; sha256sum.txt is the
# source of truth for "is there a build for me".
# Live P2P + light-client RPC pin (Akash sentries are NodePorts, not :26656).
MAINNET_BOOTSTRAP_JSON="${MAINNET_BOOTSTRAP_JSON:-https://s3.terp.network/snapshots/mainnet/morocco-1/bootstrap.json}"
TESTNET_BOOTSTRAP_JSON="${TESTNET_BOOTSTRAP_JSON:-https://s3.terp.network/snapshots/testnet/120u-1/bootstrap.json}"
DEFAULT_TESTNET_PEERS="9e194721d68dd28d3c4b625c17b2cb287ef30327@peer-testnet.terp.network:26656"
DEFAULT_MAINNET_PEERS="079328a5209e58dbb7658202bd0e00f8c50e07d0@provider.akash-palmito.org:30873,8392513d34207c9cec15d5d6a45fc1bd41691bf4@provider.h6i-dedicated.eu-se-1.digitalfrontier.so:30147,58e01ab84eb931a82a024324520021d2e075ec67@185.248.24.16:29656,b04c5acab1c821b95f26662d8ebb7ccd4a39e97f@144.76.97.251:34656,5ba3e8458f584edfe5434186af74f846190d5475@213.133.100.93:16056,a16e78921e03a9953178038c2c39d1f31252655c@135.181.60.157:26716"

# ── Runtime state ────────────────────────────────────────────────────────
DRY_RUN=0
ASSUME_YES=0
NONINTERACTIVE="${TERP_NONINTERACTIVE:-0}"
NETWORK=""
PASS_ARGS=()
PASS_STR=""
TMPFILE=""
TMPDIR_EXT=""
_ver_src=""
_DEFAULT_VERSION=""
COLOR=0

usage() {
    cat <<'USAGE'
terp-installer.sh — install terpd and bootstrap a Terp Network node

Usage: curl -fsSL https://terp.network/get/terp-installer.sh | bash -s -- [flags]

Installer flags:
  --network <id>      morocco-1 (mainnet, default) or 120u-1 (testnet)
  --version <x.y.z>   terpd version (default: last recommended_version for the
                      network in terp-core versions.json; testnet uses the release
                      channel file until versions.json has 120u-1 entries)
  --dry-run           resolve version/URLs and print the plan; download,
                      write and execute nothing
  -y, --yes           consent to destructive/privileged steps: clearing stale data/
                      of an existing node home, or sudo if the binary dir is not
                      writable. config/, keys and keyring are never touched
  --non-interactive   never prompt (also automatic when no terminal is available)
  -h, --help          show this help

All other flags (e.g. --setup-only, --home, --sync-mode, --moniker) are passed
to `terpd bootstrap`.

Environment: TERPD_VERSION, TERPD_BIN (binary path, default ~/go/bin/terpd),
TERP_NETWORK, TERP_NONINTERACTIVE=1, NO_COLOR, NO_ANIMATE,
TERP_ALLOW_UNVERIFIED=1 (install a binary with no sha256sum.txt entry; not recommended).
USAGE
}

die() { echo "Error: $*" >&2; exit 1; }
warn() { echo "Warning: $*" >&2; }

cleanup() {
    [ -n "${TMPFILE:-}" ] && rm -f "$TMPFILE" 2>/dev/null
    [ -n "${TMPDIR_EXT:-}" ] && rm -rf "$TMPDIR_EXT" 2>/dev/null
    [ "${COLOR:-0}" = "1" ] && printf '\033[?25h'
    return 0
}

parse_args() {
    while [ $# -gt 0 ]; do
        case "$1" in
            --version)
                [ $# -ge 2 ] || die "--version needs a value (e.g. --version vX.Y.Z)"
                TERPD_VERSION="$2"; shift 2; continue ;;
            --version=*) TERPD_VERSION="${1#--version=}" ;;
            --dry-run) DRY_RUN=1 ;;
            -y|--yes) ASSUME_YES=1 ;;
            --non-interactive) NONINTERACTIVE=1 ;;
            -h|--help) usage; exit 0 ;;
            --network)
                [ $# -ge 2 ] || die "--network needs a value (morocco-1 or 120u-1)"
                NETWORK="$2"
                PASS_ARGS+=("$1" "$2"); shift 2; continue ;;
            --network=*) NETWORK="${1#--network=}"; PASS_ARGS+=("$1") ;;
            *) PASS_ARGS+=("$1") ;;
        esac
        shift
    done
    if [ -z "$NETWORK" ] && [ -n "${TERP_NETWORK:-}" ]; then
        NETWORK="$TERP_NETWORK"
    fi
    case "$NETWORK" in
        ""|morocco-1|120u-1) ;;
        *) die "unknown network '$NETWORK' (expected morocco-1 or 120u-1)" ;;
    esac
    if [ -n "${TERPD_VERSION:-}" ]; then
        TERPD_VERSION="${TERPD_VERSION#v}"
        _ver_src="override"
        printf '%s' "$TERPD_VERSION" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+([-+.][0-9A-Za-z.-]+)?$' \
            || die "invalid --version '$TERPD_VERSION' (expected x.y.z)"
    fi
    PASS_STR="${PASS_ARGS[*]-}"
}

# ── TTY helpers (work with curl | bash pipes) ──────────────────────────
# can_prompt returns 0 only if we can really talk to a user: stdin is a TTY,
# or /dev/tty can actually be opened (it "exists" in CI/containers but fails).
can_prompt() {
    [ "$NONINTERACTIVE" = "1" ] && return 1
    [ "$DRY_RUN" = "1" ] && return 1
    [ -t 0 ] && return 0
    { : </dev/tty; } 2>/dev/null
}

# prompt VAR "Display text" [default] — reads one line into VAR.
prompt() {
    local __var=$1 __prompt=$2 __default=${3:-}
    local __val=""
    if [ "$NONINTERACTIVE" != "1" ] && [ -t 0 ]; then
        printf "%s " "$__prompt"
        read -r __val || true
    elif can_prompt; then
        printf "%s " "$__prompt" > /dev/tty
        read -r __val < /dev/tty || true
    fi
    [ -z "$__val" ] && __val="$__default"
    printf -v "$__var" '%s' "$__val"
}

# confirm "Prompt" [default Y|N] — hint is y/N (default no) or Y/n (default yes).
confirm() {
    local __prompt=$1 __default=${2:-N}
    local __hint __yn=""
    case "$__default" in
        [yY]*) __hint="Y/n" ;;
        *)     __hint="y/N" ;;
    esac
    if [ "$NONINTERACTIVE" != "1" ] && [ -t 0 ]; then
        printf "%s [%s] " "$__prompt" "$__hint"
        read -r __yn || true
    elif can_prompt; then
        printf "%s [%s] " "$__prompt" "$__hint" > /dev/tty
        read -r __yn < /dev/tty || true
    fi
    [ -z "$__yn" ] && __yn="$__default"
    case "$__yn" in [yY]|[yY][eE][sS]) return 0;; *) return 1;; esac
}

# ── HTTP helpers: https only, bounded retries and timeouts ──────────────
# net_get URL [max_seconds] — small documents (JSON, checksums, channel files).
net_get() {
    if command -v curl >/dev/null 2>&1; then
        curl -fsSL --proto '=https' --tlsv1.2 --retry 3 --retry-delay 2 \
            --connect-timeout 10 --max-time "${2:-30}" "$1"
    else
        wget -q -O - --tries=3 --timeout="${2:-30}" "$1"
    fi
}

# net_download URL OUT — large files; abort if slower than 1 KiB/s for 60s.
net_download() {
    if command -v curl >/dev/null 2>&1; then
        curl -fSL --proto '=https' --tlsv1.2 --retry 3 --retry-delay 3 \
            --connect-timeout 15 --speed-limit 1024 --speed-time 60 -o "$2" "$1"
    else
        wget -q --tries=3 --timeout=60 -O "$2" "$1"
    fi
}


# terpd does not expand ~. Interactive "~/.terpd-testing" must become $HOME/...
expand_node_home() {
    _p="$1"
    [ -n "$_p" ] || { printf '%s\n' "${HOME}/.terpd"; return 0; }
    # Do not use case '~/'*) or ${_p#~/}: sh expands ~ in those patterns.
    _lead="$(printf '%s' "$_p" | cut -c1-2)"
    # shellcheck disable=SC2088  # literal "~/" prefix test, intentional
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
detect_platform() {
    OS="$(uname -s | tr '[:upper:]' '[:lower:]')"
    ARCH="$(uname -m)"
    case "$ARCH" in
        x86_64|amd64)  ARCH="amd64" ;;
        aarch64|arm64) ARCH="arm64" ;;
        *) die "unsupported architecture '$ARCH' (terpd is published for amd64 and arm64 only)" ;;
    esac
    case "$OS" in
        linux|darwin) BINARY_NAME="terpd-${OS}-${ARCH}" ;;
        *) die "unsupported OS '$OS' (supported: linux, darwin; on Windows use WSL2)" ;;
    esac
}

require_tools() {
    command -v curl >/dev/null 2>&1 || command -v wget >/dev/null 2>&1 || die "curl or wget is required"
    command -v tar >/dev/null 2>&1 || die "tar is required"
    command -v shasum >/dev/null 2>&1 || command -v sha256sum >/dev/null 2>&1 \
        || die "shasum or sha256sum is required to verify the download"
    command -v python3 >/dev/null 2>&1 || warn "python3 not found: bootstrap.json, snapshot catalog and state-sync peer discovery will be skipped"
}

# ── Version resolution ──────────────────────────────────────────────────
# versions.json is the single source of truth for the default version, using
# the last-entry rule: the last versions[] entry for the network that has a
# recommended_version wins. An entry belongs to testnet when its chain_id (or
# network) is "120u-1"; entries with neither field are mainnet (morocco-1).
# terp-core versions.json has no testnet entries today, so testnet falls back
# to the release channel file until it does.
#
# TODO: this will later move to an on-chain text record in the foundation DAO
# contract. Everything about *where* the default comes from lives in
# default_version_for(); swapping the source is a change to that one function.
#
# default_version_for NETWORK — sets _DEFAULT_VERSION and _ver_src.
# Never called in $(...) so both globals survive.
default_version_for() {
    local _net="$1" _vj="" _url
    _DEFAULT_VERSION=""
    for _url in "$VERSIONS_JSON_URL" "$VERSIONS_JSON_FALLBACK"; do
        _vj="$(net_get "$_url" 20 2>/dev/null)" || _vj=""
        if [ -n "$_vj" ]; then _ver_src="versions.json (${_url})"; break; fi
    done
    if [ -n "$_vj" ]; then
        if command -v python3 >/dev/null 2>&1; then
            _DEFAULT_VERSION="$(printf '%s' "$_vj" | python3 -c 'import json,sys
net=sys.argv[1]
d=json.load(sys.stdin)
def owner(v):
    return v.get("chain_id") or v.get("network") or "morocco-1"
r=[v["recommended_version"] for v in d.get("versions",[]) if v.get("recommended_version") and owner(v)==net]
print(r[-1][1:] if r and r[-1].startswith("v") else (r[-1] if r else ""))' "$_net" 2>/dev/null || true)"
        elif [ "$_net" = "morocco-1" ]; then
            # No python3: crude last-match parse (mainnet only; cannot filter by chain).
            _DEFAULT_VERSION="$(printf '%s' "$_vj" | grep -o '"recommended_version"[[:space:]]*:[[:space:]]*"[^"]*"' \
                | tail -n 1 | sed 's/.*"v\{0,1\}\([^"]*\)"$/\1/' || true)"
        fi
    fi
    if [ -z "$_DEFAULT_VERSION" ] && [ "$_net" = "120u-1" ]; then
        # Testnet only: versions.json has no 120u-1 entries yet.
        _DEFAULT_VERSION="$(net_get "${CHANNEL_BASE}/${_net}" 15 2>/dev/null | tr -d 'v \t\r\n' || true)"
        _ver_src="release channel (${CHANNEL_BASE}/${_net}; versions.json has no 120u-1 entries)"
    fi
    [ -n "$_DEFAULT_VERSION" ]
}

resolve_version() {
    if [ -n "${TERPD_VERSION:-}" ]; then
        _ver_src="override"
    else
        default_version_for "$NETWORK" || true
        TERPD_VERSION="$_DEFAULT_VERSION"
    fi
    [ -n "${TERPD_VERSION:-}" ] || die "could not resolve the terpd version for ${NETWORK} (versions.json / channel unreachable). Re-run with --version x.y.z"
    echo "Resolved terpd version: v${TERPD_VERSION} (source: ${_ver_src})"
}

load_bootstrap_pin() {
    local _json_url="$1" _default_peers="$2" _raw="" _parsed=""
    BOOTSTRAP_PEERS="${BOOTSTRAP_PEERS:-}"
    BOOTSTRAP_RPCS="${BOOTSTRAP_RPCS:-}"
    BOOTSTRAP_TRUST_OFFSET="${BOOTSTRAP_TRUST_OFFSET:-200}"
    _raw="$(net_get "$_json_url" 20 2>/dev/null || true)"
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
    [ -n "$BOOTSTRAP_PEERS" ] || BOOTSTRAP_PEERS="$_default_peers"
}

# ── Download + verify ──────────────────────────────────────────────────
sha256_file() {
    if command -v shasum >/dev/null 2>&1; then
        shasum -a 256 "$1" | awk '{print $1}'
    else
        sha256sum "$1" | awk '{print $1}'
    fi
}

SUMS_TXT=""
# verify_sum FILE NAME — FILE must match NAME's entry in the release sha256sum.txt.
verify_sum() {
    local _file="$1" _name="$2" _want="" _got=""
    if [ -z "$SUMS_TXT" ]; then
        SUMS_TXT="$(net_get "$SUMS_URL" 30 2>/dev/null || true)"
    fi
    _want="$(printf '%s\n' "$SUMS_TXT" | awk -v n="$_name" '$2 == n || $2 == "*"n {print $1; exit}')"
    if [ -z "$_want" ]; then
        if [ "${TERP_ALLOW_UNVERIFIED:-0}" = "1" ]; then
            warn "$SUMS_URL has no entry for $_name; installing UNVERIFIED (TERP_ALLOW_UNVERIFIED=1)"
            return 0
        fi
        echo "Error: $SUMS_URL has no sha256 for $_name; refusing to install an unverified binary." >&2
        echo "  (set TERP_ALLOW_UNVERIFIED=1 to override at your own risk)" >&2
        return 1
    fi
    _got="$(sha256_file "$_file")"
    if [ "$_got" != "$_want" ]; then
        echo "Error: checksum mismatch for $_name" >&2
        echo "  want $_want" >&2
        echo "  got  $_got" >&2
        return 1
    fi
    echo "  checksum ok $_name"
}

# Published darwin builds must not rpath this clone. If the tarball still
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
        echo "This is the v6.0.0 darwin rpath bug. Rebuild from source at the tag:" >&2
        echo "  tools/builders/host/build_macos_static_arm64.sh && make build-darwin-arm64   # static_wasm, no dylib" >&2
        return 1
    fi
    if command -v install_name_tool >/dev/null 2>&1; then
        install_name_tool -add_rpath "@loader_path" "$BINARY_DEST" 2>/dev/null || true
        install_name_tool -add_rpath "$BIN_DIR" "$BINARY_DEST" 2>/dev/null || true
    fi
    echo "  placed $BIN_DIR/libwasmvm.dylib (@loader_path)"
}

# published_platforms — "linux-amd64 linux-arm64 ..." from sha256sum.txt.
published_platforms() {
    [ -n "$SUMS_TXT" ] || SUMS_TXT="$(net_get "$SUMS_URL" 30 2>/dev/null || true)"
    printf '%s\n' "$SUMS_TXT" | awk '{print $2}' | sed -n 's/^\*\{0,1\}terpd-[0-9][^-]*-\(.*\)\.tar\.gz$/\1/p; s/^\*\{0,1\}terpd-\([a-z]*-[a-z0-9]*\)$/\1/p' | sort -u | tr '\n' ' '
}

# platform_published — 0 if sha256sum.txt lists a build for OS-ARCH.
platform_published() {
    case " $(published_platforms) " in *" ${OS}-${ARCH} "*) return 0;; esac
    return 1
}

# Source build. terp-core's Makefile (v6.4.0) provides:
#   make build               -> build/terpd (any host; on Darwin adds static_wasm
#                               when x/wasm/wasmvm/internal/api/libwasmvmstatic_darwin.a exists)
#   make build-darwin-arm64  -> build/terpd-darwin-arm64, host darwin/arm64, REQUIRES
#                               libwasmvmstatic_darwin.a (built by
#                               tools/builders/host/build_macos_static_arm64.sh, needs cargo)
# Without the static archive a Darwin terpd links the clone's libwasmvm.dylib by
# absolute rpath; we then ship that dylib next to terpd with @loader_path.
# The build always happens in a fresh clone at tag v${TERPD_VERSION} (never the
# user's working tree, never their GOBIN unless TERPD_BIN points there).
build_from_source() {
    local _tag="v${TERPD_VERSION}" _work _src _local="" _cand _static=""
    command -v git >/dev/null 2>&1 || { echo "Error: git is required to build terpd from source." >&2; return 1; }
    command -v make >/dev/null 2>&1 || { echo "Error: make is required (xcode-select --install on macOS)." >&2; return 1; }
    _work="$(mktemp -d "${TMPDIR:-/tmp}/terp-core-src.XXXXXX")"
    _src="$_work/terp-core"
    for _cand in "${TERP_CORE_SRC:-}" "$HOME/abstract/terp-core" "$HOME/terp-core"; do
        [ -n "$_cand" ] && [ -d "$_cand/.git" ] && git -C "$_cand" rev-parse -q --verify "refs/tags/${_tag}" >/dev/null 2>&1 && { _local="$_cand"; break; }
    done
    if [ -n "$_local" ]; then
        echo "  cloning ${_tag} from local repo ${_local} (read-only)"
        git clone -q --no-checkout --shared "$_local" "$_src" && git -C "$_src" -c advice.detachedHead=false checkout -q "$_tag" || return 1
    else
        echo "  cloning ${TERP_CORE_REPO} @ ${_tag}"
        git clone -q --depth 1 --branch "$_tag" "$TERP_CORE_REPO" "$_src" || { echo "Error: could not clone ${TERP_CORE_REPO} at ${_tag}" >&2; return 1; }
    fi
    (
        set -e
        cd "$_src"
        export GOWORK=off
        if [ "$OS" = "darwin" ]; then
            _static="x/wasm/wasmvm/internal/api/libwasmvmstatic_darwin.a"
            if [ ! -f "$_static" ] && [ -n "${TERP_WASMVM_STATIC_A:-}" ] && [ -f "$TERP_WASMVM_STATIC_A" ]; then
                echo "  using static wasmvm from TERP_WASMVM_STATIC_A"; cp -f "$TERP_WASMVM_STATIC_A" "$_static"
            fi
            if [ ! -f "$_static" ] && [ "$ARCH" = "arm64" ] && [ "${TERP_BUILD_STATIC_WASMVM:-1}" = "1" ] && command -v cargo >/dev/null 2>&1 \
               && [ -f tools/builders/host/build_macos_static_arm64.sh ]; then
                echo "  building static libwasmvm (cargo, several minutes)"
                bash tools/builders/host/build_macos_static_arm64.sh || rm -f "$_static"
            fi
            if [ -f "$_static" ] && [ "$ARCH" = "arm64" ] && make -n build-darwin-arm64 >/dev/null 2>&1; then
                echo "  make build-darwin-arm64 (static wasmvm)"
                make build-darwin-arm64
                cp -f build/terpd-darwin-arm64 "$BINARY_DEST"
            else
                echo "  no static libwasmvm: make build, then ship libwasmvm.dylib next to terpd (@loader_path)"
                make build
                cp -f build/terpd "$BINARY_DEST"
                if otool -L "$BINARY_DEST" | grep -q libwasmvm.dylib; then
                    cp -f x/wasm/wasmvm/internal/api/libwasmvm.dylib "$BIN_DIR/libwasmvm.dylib"
                    chmod 755 "$BIN_DIR/libwasmvm.dylib"
                    install_name_tool -add_rpath "@loader_path" "$BINARY_DEST" 2>/dev/null || true
                    # drop the absolute rpath into the temp clone so only @loader_path resolves
                    otool -l "$BINARY_DEST" | awk '/LC_RPATH/{f=1} f&&/path /{print $2; f=0}' | grep -F "$(basename "$_work")" | while read -r _rp; do
                        install_name_tool -delete_rpath "$_rp" "$BINARY_DEST" 2>/dev/null || true; done
                    codesign -f -s - "$BINARY_DEST" 2>/dev/null || true
                    echo "  placed $BIN_DIR/libwasmvm.dylib (@loader_path)"
                fi
            fi
        else
            make build
            cp -f build/terpd "$BINARY_DEST"
        fi
    ) || { echo "Error: source build of ${_tag} failed (clone kept at ${_src})." >&2; return 1; }
    chmod 755 "$BINARY_DEST"
    "$BINARY_DEST" version >/dev/null 2>&1 || { echo "Error: built terpd does not run" >&2; return 1; }
    echo "  built terpd $("$BINARY_DEST" version 2>&1 | head -1) -> $BINARY_DEST"
    rm -rf "$_work"
}

# place_binary SRC — move into BINARY_DEST; sudo only if the dir is not writable
# and the user agrees.
place_binary() {
    local _src="$1"
    chmod +x "$_src"
    if [ -w "$BIN_DIR" ]; then
        mv -f "$_src" "$BINARY_DEST"
        return 0
    fi
    command -v sudo >/dev/null 2>&1 || die "${BIN_DIR} is not writable and sudo is unavailable. Re-run with TERPD_BIN=\$HOME/.local/bin/terpd"
    if [ "$ASSUME_YES" = "1" ] || { can_prompt && confirm "${BIN_DIR} is not writable. Use sudo to install terpd there?" "N"; }; then
        sudo mv -f "$_src" "$BINARY_DEST"
        sudo chown "$(id -u):$(id -g)" "$BINARY_DEST" 2>/dev/null || true
        sudo chmod 755 "$BINARY_DEST"
        if [ -n "${WASMVM_DYLIB:-}" ] && [ -f "$WASMVM_DYLIB" ]; then sudo chmod 755 "$WASMVM_DYLIB" || true; fi
    else
        die "${BIN_DIR} is not writable. Re-run with TERPD_BIN=\$HOME/.local/bin/terpd (no sudo needed)"
    fi
}

install_binary() {
    BIN_DIR="$(dirname "$BINARY_DEST")"
    mkdir -p "$BIN_DIR" 2>/dev/null || true

    # Idempotent re-run: keep an existing binary that already reports this version.
    if [ -x "$BINARY_DEST" ] && [ "${TERP_FORCE_DOWNLOAD:-0}" != "1" ]; then
        local _have=""
        _have="$("$BINARY_DEST" version 2>&1 | head -n 1 | tr -d 'v \r' || true)"
        if [ "$_have" = "$TERPD_VERSION" ]; then
            echo "terpd v${TERPD_VERSION} already installed at ${BINARY_DEST}; skipping download (TERP_FORCE_DOWNLOAD=1 to re-fetch)."
            return 0
        fi
    fi

    echo "Downloading terpd v${TERPD_VERSION}..."
    TMPFILE="$(mktemp "${TMPDIR:-/tmp}/terpd.XXXXXX")"
    WASMVM_DYLIB=""
    local _got=""
    if ! platform_published; then
        echo "  No ${OS}-${ARCH} build is published for v${TERPD_VERSION}."
        echo "  ${SUMS_URL} lists: $(published_platforms)"
        [ "$OS" = "darwin" ] && echo "  (macOS releases are cut separately and can lag Linux.)"
    elif echo "  Trying: ${DOWNLOAD_URL_TGZ}" && net_download "$DOWNLOAD_URL_TGZ" "$TMPFILE" 2>/dev/null && [ -s "$TMPFILE" ]; then
        verify_sum "$TMPFILE" "terpd-${TERPD_VERSION}-${OS}-${ARCH}.tar.gz" || exit 1
        TMPDIR_EXT="$(mktemp -d "${TMPDIR:-/tmp}/terpd-ext.XXXXXX")"
        tar -xzf "$TMPFILE" -C "$TMPDIR_EXT" 2>/dev/null || tar -xf "$TMPFILE" -C "$TMPDIR_EXT" \
            || die "could not extract $(basename "$DOWNLOAD_URL_TGZ")"
        local _found _dylib
        _found="$(find "$TMPDIR_EXT" -type f \( -name 'terpd' -o -name 'terpd-linux-*' -o -name 'terpd-darwin-*' \) 2>/dev/null | head -1)"
        _dylib="$(find "$TMPDIR_EXT" -type f -name 'libwasmvm.dylib' 2>/dev/null | head -1)"
        [ -n "$_found" ] && [ -s "$_found" ] || die "tarball did not contain a terpd binary"
        mv -f "$_found" "$TMPFILE"
        if [ -n "$_dylib" ] && [ -s "$_dylib" ]; then
            WASMVM_DYLIB="$BIN_DIR/libwasmvm.dylib"
            cp -f "$_dylib" "$WASMVM_DYLIB"
        fi
        _got=1
    else
        local _u
        for _u in "$DOWNLOAD_URL"; do
            echo "  Trying: ${_u}"
            if net_download "$_u" "$TMPFILE" 2>/dev/null && [ -s "$TMPFILE" ]; then
                # Same versioned sha256sum.txt for the raw and legacy paths.
                verify_sum "$TMPFILE" "$BINARY_NAME" || exit 1
                _got=1
                break
            fi
        done
    fi

    if [ -n "$_got" ]; then
        place_binary "$TMPFILE"
        TMPFILE=""
        fix_darwin_wasmvm || die "darwin wasmvm dylib missing"
    else
        echo ""
        echo "Building terpd v${TERPD_VERSION} from source for ${OS}/${ARCH} (tag v${TERPD_VERSION})."
        echo ""
        command -v go >/dev/null 2>&1 || die "Go is required to build terpd from source. Install Go from https://go.dev/dl/ or: brew install go"
        rm -f "$TMPFILE"; TMPFILE=""
        build_from_source || exit 1
        echo "Build complete."
    fi
}

# Persist PATH in files the login shell actually reads (zsh ignores ~/.profile).
ensure_path_file() {
    local _file="$1" _dir="$2"
    local _mark="# terp-installer: PATH ${_dir}"
    local _line="export PATH=\"${_dir}:\$PATH\""
    touch "$_file" 2>/dev/null || return 0
    if grep -Fq "$_mark" "$_file" 2>/dev/null; then
        return 0
    fi
    printf '\n%s\n%s\n' "$_mark" "$_line" >> "$_file"
    echo "  PATH += ${_dir}  ($_file)"
}

link_terpd_on_path() {
    local _d
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

setup_path() {
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

    echo ""
    echo "Verifying installation..."
    "$BINARY_DEST" version || die "terpd binary failed to run ($BINARY_DEST)"
    echo "  binary: $BINARY_DEST"
    if command -v terpd >/dev/null; then echo "  command: $(command -v terpd)"; else echo "  command: open a new terminal (or: source ~/.zprofile)"; fi
    echo ""
    echo "terpd v${TERPD_VERSION} installed successfully."
    echo ""
}

# ── Bootstrap command ──────────────────────────────────────────────────
# Explicit flags are used verbatim (plus RPC/P2P pins); otherwise the wizard
# runs when a terminal is available, else a non-interactive default.
build_bootstrap_cmd() {
    STATESYNC_LOCK_PEER=""
    STATESYNC_LOCK_PEX="false"
    if [ "${#PASS_ARGS[@]}" -gt 0 ]; then
        local EXTRA="" RPC_PEER=""
        case " $PASS_STR " in
            *" --statesync-rpcs "*) ;;
            *) EXTRA="$EXTRA --statesync-rpcs $BOOTSTRAP_RPCS" ;;
        esac
        case " $PASS_STR " in
        *" --sync-mode statesync "*)
            if [ "$DRY_RUN" = "1" ]; then
                RPC_PEER="<peer discovered from ${BOOTSTRAP_RPCS%%,*}/p2p at run time>"
            else
                RPC_PEER="$(fetch_rpc_persistent_peer "${BOOTSTRAP_RPCS%%,*}")" \
                    || die "could not discover a public P2P address from ${BOOTSTRAP_RPCS%%,*} (need GET /p2p JSON); pass --bootstrap-peers"
            fi
            case " $PASS_STR " in
                *" --bootstrap-peers "*) ;;
                *) EXTRA="$EXTRA --bootstrap-peers $RPC_PEER" ;;
            esac
            case " $PASS_STR " in
                *" --setup-only "*) ;;
                *) EXTRA="$EXTRA --setup-only" ;;
            esac
            case " $PASS_STR " in
                *" --public "*) ;;
                *) EXTRA="$EXTRA --public" ;;
            esac
            STATESYNC_LOCK_PEER="$RPC_PEER"
            STATESYNC_LOCK_PEX="false"
            case " $PASS_STR " in *" --public "*) STATESYNC_LOCK_PEX="true" ;; esac
            ;;
        *)
            case " $PASS_STR " in
                *" --bootstrap-peers "*) ;;
                *) EXTRA="$EXTRA --bootstrap-peers $BOOTSTRAP_PEERS --bootstrap-seeds $BOOTSTRAP_PEERS" ;;
            esac
            ;;
        esac
        case " $PASS_STR " in
            *" --trust-offset "*) ;;
            *) EXTRA="$EXTRA --trust-offset $BOOTSTRAP_TRUST_OFFSET" ;;
        esac
        # --network is required by terpd bootstrap; add it if only TERP_NETWORK/the prompt chose it.
        case " $PASS_STR " in
            *" --network "*|*" --network="*) ;;
            *) EXTRA="$EXTRA --network $NETWORK" ;;
        esac
        BOOTSTRAP_CMD="$BINARY_DEST bootstrap $PASS_STR$EXTRA"
    elif can_prompt; then
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
                    _resolved="$(net_get "$_cat" 20 2>/dev/null | python3 -c 'import json,sys
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
}

# Flatten a nested extract (terpd bootstrap unpacks into home/data, but house
# packs are tar -C home of data/ + wasm/, so application.db lands at data/data/).
flatten_nested_snapshot() {
    local _h="$1" _tmp
    if [ -d "$_h/data/data/application.db" ]; then
        echo "Flattening nested snapshot under ${_h}/data/data -> ${_h}/data"
        _tmp="$(mktemp -d "${TMPDIR:-/tmp}/terp-snap.XXXXXX")"
        mv "$_h/data/data" "$_tmp/data"
        if [ -d "$_h/data/wasm" ]; then
            mv "$_h/data/wasm" "$_tmp/wasm"
        fi
        # Keep the validator double-sign guard across the flatten.
        if [ -f "$_h/data/priv_validator_state.json" ] && [ ! -f "$_tmp/data/priv_validator_state.json" ]; then
            mv "$_h/data/priv_validator_state.json" "$_tmp/data/priv_validator_state.json"
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

# Statesync/snapshot cannot load leftover IAVL (e.g. a pre-v6 store without
# hashmerchant). Clearing data/ needs explicit consent; config/ (node and
# validator keys) and the keyring are never touched, and
# data/priv_validator_state.json is preserved so a validator cannot double-sign.
clear_stale_data() {
    local _h="$1" _pvs=""
    if [ ! -d "$_h/data/application.db" ] && [ ! -d "$_h/data/data/application.db" ]; then
        return 0
    fi
    echo "Existing chain data found at ${_h}/data (older store or nested snapshot extract)."
    echo "To state-sync or restore a pack, data/, wasm/ and ibc_08-wasm/ must be removed."
    echo "config/ (node + validator keys) and the keyring are kept; priv_validator_state.json is preserved."
    if [ "$ASSUME_YES" = "1" ] || { can_prompt && confirm "Remove ${_h}/data, wasm, ibc_08-wasm now?" "N"; }; then
        if [ -f "$_h/data/priv_validator_state.json" ]; then
            _pvs="$(mktemp "${TMPDIR:-/tmp}/terp-pvs.XXXXXX")"
            cp -p "$_h/data/priv_validator_state.json" "$_pvs"
        fi
        rm -rf "$_h/data" "$_h/wasm" "$_h/ibc_08-wasm"
        mkdir -p "$_h/data"
        if [ -n "$_pvs" ]; then
            mv "$_pvs" "$_h/data/priv_validator_state.json"
            echo "  restored ${_h}/data/priv_validator_state.json"
        fi
    else
        die "refusing to remove existing chain data at ${_h}. Re-run with --yes, or choose another --home."
    fi
}

# House packs extract with -C <home>. terpd bootstrap HTTP path uses -C <home>/data.
# Pre-extract here and drop --snapshot-url so bootstrap will not nest the tree.
pre_extract_snapshot() {
    local _h="$1" _snap_url="" _scan _tok _skip _new _netpath _cat
    case " $BOOTSTRAP_CMD " in
        *" --sync-mode snapshot "*|*" --snapshot-url "*|*" --snapshot-class "*) ;;
        *) return 0 ;;
    esac
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
            _snap_url="$(net_get "$_cat" 20 2>/dev/null | python3 -c 'import json,sys
d=json.load(sys.stdin)
u=d.get("latest") or d.get("url") or ((d.get("snapshots") or [None])[0])
print(u or "")' 2>/dev/null || true)"
        fi
    fi
    [ -n "$_snap_url" ] || return 0
    if [ "$DRY_RUN" = "1" ]; then
        echo "  would stream-extract snapshot ${_snap_url} into ${_h}"
        return 0
    fi
    command -v lz4 >/dev/null 2>&1 || die "lz4 is required to unpack .tar.lz4 snapshots"
    echo "Extracting snapshot into ${_h} (data/ + wasm/ at home, not home/data/data/)"
    echo "  $_snap_url"
    mkdir -p "$_h"
    curl -fSL --proto '=https' --tlsv1.2 --connect-timeout 15 --speed-limit 1024 --speed-time 120 "$_snap_url" \
        | lz4 -dc | tar xf - -C "$_h"
    flatten_nested_snapshot "$_h"
    [ -d "$_h/data/application.db" ] || die "snapshot extract did not produce ${_h}/data/application.db"
    echo "  application.db present; wasm=$( [ -d "$_h/wasm" ] && echo yes || echo missing )"
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
}

run_bootstrap() {
    local bootstrap_home
    bootstrap_home="$(cmd_get_home "$BOOTSTRAP_CMD")"
    BOOTSTRAP_CMD="$(cmd_set_home "$BOOTSTRAP_CMD" "$bootstrap_home")"
    echo "╔══════════════════════════════════════════════════════════╗"
    echo "║  Bootstrap Command                                      ║"
    echo "║  $BOOTSTRAP_CMD"
    echo "╚══════════════════════════════════════════════════════════╝"
    echo ""
    echo "  Node home: ${bootstrap_home}"

    clear_stale_data "$bootstrap_home"
    ensure_priv_validator_state "$bootstrap_home"
    pre_extract_snapshot "$bootstrap_home"
    flatten_nested_snapshot "$bootstrap_home"

    echo "Executing bootstrap..."
    # shellcheck disable=SC2086
    $BOOTSTRAP_CMD

    if [ -n "${STATESYNC_LOCK_PEER:-}" ]; then
        lock_p2p_toml "$bootstrap_home" "$STATESYNC_LOCK_PEER" "$STATESYNC_LOCK_PEX"
        patch_statesync_toml "$bootstrap_home"
        ensure_priv_validator_state "$bootstrap_home"
        echo "Starting node at ${bootstrap_home} ..."
        exec "$BINARY_DEST" start --home "$bootstrap_home"
    fi
}

# Dry run: show the plan; download, write and execute nothing.
print_dry_run() {
    local _h
    # cmd_get_home -> expand_node_home would mkdir; compute without side effects.
    _h="${HOME}/.terpd"
    case " $BOOTSTRAP_CMD " in *" --home "*|*" --home="*) _h="(from --home)";; esac
    echo "── DRY RUN: nothing will be downloaded, written or executed ──"
    echo "  would download : ${DOWNLOAD_URL_TGZ}"
    echo "  fallback       : ${DOWNLOAD_URL}"
    echo "  published      : $(published_platforms)(from sha256sum.txt)"
    echo "  verify against : ${SUMS_URL}"
    local _sums _n="terpd-${TERPD_VERSION}-${OS}-${ARCH}.tar.gz"
    _sums="$(net_get "$SUMS_URL" 30 2>/dev/null || true)"
    if printf '%s\n' "$_sums" | awk -v n="$_n" -v b="$BINARY_NAME" '$2==n||$2==b{f=1} END{exit !f}'; then
        echo "                   (entry for ${_n} or ${BINARY_NAME} present)"
    else
        echo "                   (no ${OS}-${ARCH} build published: a real run skips the download and builds"
        echo "                    v${TERPD_VERSION} from a fresh clone at tag v${TERPD_VERSION}:"
        if [ "$OS" = "darwin" ]; then
            echo "                    make build-darwin-arm64 with static libwasmvm if available,"
            echo "                    else make build + libwasmvm.dylib next to terpd via @loader_path)"
        else
            echo "                    make build)"
        fi
        command -v go >/dev/null 2>&1 && echo "                   go: $(go version 2>/dev/null)" || echo "                   go: NOT FOUND (a source build would stop here)"
    fi
    echo "  install to     : ${BINARY_DEST}"
    echo "  PATH files     : ~/.zprofile ~/.zshrc ~/.bash_profile ~/.profile (marker-guarded)"
    echo "  node home      : ${_h}"
    echo "  bootstrap      : ${BOOTSTRAP_CMD}"
    pre_extract_snapshot "${_h}"
    [ -n "${STATESYNC_LOCK_PEER:-}" ] && echo "  then           : lock P2P to ${STATESYNC_LOCK_PEER} (pex=${STATESYNC_LOCK_PEX}) and exec terpd start"
    echo "  existing data/ : would be cleared only with --yes or an interactive yes"
    return 0
}

main() {
    trap cleanup EXIT
    trap 'exit 130' INT TERM
    parse_args "$@"
    if [ -z "${NO_COLOR:-}" ] && [ -t 1 ]; then COLOR=1; fi
    if [ "${FORCE_COLOR:-}" = "1" ]; then COLOR=1; fi

    detect_platform
    require_tools

    intro_terp
    echo "=== Terp Network Installer ==="
    echo ""
    echo "  Platform : ${OS}/${ARCH}"
    echo "  Binary   : ${BINARY_DEST}"
    [ "$DRY_RUN" = "1" ] && echo "  Mode     : dry run"
    echo ""

    # Ask network before downloading so testnet does not get the mainnet build.
    if [ -z "$NETWORK" ]; then
        if can_prompt; then
            echo "1) Network"
            echo "   1) morocco-1   (mainnet)"
            echo "   2) 120u-1      (testnet)"
            prompt NET_CHOICE "Enter choice [1]:" "1"
            case "$NET_CHOICE" in
                2) NETWORK="120u-1" ;;
                *) NETWORK="morocco-1" ;;
            esac
            echo "  -> ${NETWORK}"
            echo ""
        else
            NETWORK="morocco-1"
        fi
    fi
    case "$NETWORK" in
        120u-1) S3_NET="testnet" ;;
        *)      S3_NET="mainnet" ;;
    esac

    resolve_version

    if [ "$NETWORK" = "120u-1" ]; then
        load_bootstrap_pin "$TESTNET_BOOTSTRAP_JSON" "$DEFAULT_TESTNET_PEERS"
        [ -n "$BOOTSTRAP_RPCS" ] || BOOTSTRAP_RPCS="https://testnet-rpc.terp.network:443,https://testnet-rpc.terp.network:443"
    else
        load_bootstrap_pin "$MAINNET_BOOTSTRAP_JSON" "$DEFAULT_MAINNET_PEERS"
        [ -n "$BOOTSTRAP_RPCS" ] || BOOTSTRAP_RPCS="https://rpc.terp.network:443,https://rpc.terp.network:443"
    fi

    DOWNLOAD_URL_TGZ="${RELEASES_BASE}/v${TERPD_VERSION}/terpd-${TERPD_VERSION}-${OS}-${ARCH}.tar.gz"
    DOWNLOAD_URL="${RELEASES_BASE}/v${TERPD_VERSION}/${BINARY_NAME}"
    SUMS_URL="${RELEASES_BASE}/v${TERPD_VERSION}/sha256sum.txt"

    echo "  Network  : ${NETWORK}"
    echo "  Version  : v${TERPD_VERSION}"
    echo "  Source   : ${DOWNLOAD_URL_TGZ}"
    echo ""

    if [ "$DRY_RUN" = "1" ]; then
        build_bootstrap_cmd
        print_dry_run
        return 0
    fi

    install_binary
    setup_path
    build_bootstrap_cmd
    run_bootstrap
}

main "$@"
