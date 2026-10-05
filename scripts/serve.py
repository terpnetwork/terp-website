#!/usr/bin/env python3
"""Dev server with clean URL routing matching nginx config."""
import http.server
import os
import urllib.request
import urllib.error

PORT = int(os.environ.get("WEBSITE_PORT", "3000"))
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__),'..'))
print(f"ROOT = {ROOT}")
print(f"pages dir exists: {os.path.isdir(os.path.join(ROOT, 'pages'))}")
if os.path.isdir(os.path.join(ROOT, 'pages')):
    print(f"pages contents: {os.listdir(os.path.join(ROOT, 'pages'))}")
RPC_PROXY = os.environ.get("CHAIN_RPC", "http://localhost:26657")  # proxied at /rpc to avoid CORS in dev
# Public snapshots bucket (same keys as minio.terp.network). Loopback MinIO optional.
SNAPSHOTS_PROXY = os.environ.get(
    "SNAPSHOTS_PROXY", "https://s3.terp.network/snapshots"
).rstrip("/")
UPGRADES_PROXY = os.environ.get(
    "UPGRADES_PROXY", "https://s3.terp.network/upgrades"
).rstrip("/")

# Auto-discover routes from pages/*.html
# /mint -> pages/mint.html, /no-rick -> pages/no-rick.html, etc.
ROUTES = {}
_pages_dir = os.path.join(ROOT, "pages")
if os.path.isdir(_pages_dir):
    for f in os.listdir(_pages_dir):
        if f.endswith(".html") and f != "index.html":
            slug = "/" + f[:-5]  # strip .html -> /mint, /no-rick, etc.
            ROUTES[slug] = f

# nginx aliases (terp.network.conf) — these are what the chrome/nav uses
ROUTES.setdefault("/eco", "tabs.html")
ROUTES.setdefault("/resources", "snapshots.html")

# soon/ pages (mint, passkey, …) live outside pages/
SOON_ROUTES = {}
_soon_dir = os.path.join(ROOT, "soon")
if os.path.isdir(_soon_dir):
    for f in os.listdir(_soon_dir):
        if f.endswith(".html"):
            SOON_ROUTES["/" + f[:-5]] = f

# Suppress noisy auto-requests that are never meaningful in dev
SILENT_404 = {
    "/.well-known/appspecific/com.chrome.devtools.json",
}

_HOP_HEADERS = {"host", "transfer-encoding", "content-length"}


def _proxy_url(handler, method, base, strip_prefix):
    """Forward strip_prefix[/path] → base[/path]."""
    raw_path = handler.path.split("?", 1)
    path = raw_path[0]
    qs = ("?" + raw_path[1]) if len(raw_path) > 1 else ""
    suffix = path[len(strip_prefix) :] or "/"
    url = base + suffix + qs
    length = int(handler.headers.get("Content-Length", 0) or 0)
    body = handler.rfile.read(length) if length else None
    req = urllib.request.Request(url, data=body, method=method)
    for k, v in handler.headers.items():
        if k.lower() not in _HOP_HEADERS:
            req.add_unredirected_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            raw = b"" if method == "HEAD" else r.read()
            handler.send_response(r.status)
            for k, v in r.headers.items():
                if k.lower() not in _HOP_HEADERS:
                    handler.send_header(k, v)
            if method != "HEAD":
                handler.send_header("Content-Length", str(len(raw)))
            handler.end_headers()
            if method != "HEAD":
                handler.wfile.write(raw)
    except urllib.error.HTTPError as e:
        raw = e.read()
        handler.send_response(e.code)
        handler.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
        handler.send_header("Content-Length", str(len(raw)))
        handler.end_headers()
        if method != "HEAD":
            handler.wfile.write(raw)
    except Exception as exc:
        handler.send_error(502, f"proxy {strip_prefix}: {exc}")


def _proxy_rpc(handler, method):
    """Forward /rpc[/path][?query] → RPC_PROXY[/path][?query]."""
    _proxy_url(handler, method, RPC_PROXY, "/rpc")


def _proxy_snapshots(handler, method):
    """Forward /snapshots/… → MinIO snapshots bucket (path-style)."""
    _proxy_url(handler, method, SNAPSHOTS_PROXY, "/snapshots")


def _proxy_upgrades(handler, method):
    """Forward /upgrades/… → upgrades bucket (guide.md, cosmovisor.json)."""
    _proxy_url(handler, method, UPGRADES_PROXY, "/upgrades")


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def _is_rpc(self):
        return self.path == "/rpc" or self.path.startswith(("/rpc/", "/rpc?"))

    def _is_snapshots_obj(self):
        p = self.path.split("?", 1)[0]
        return p.startswith("/snapshots/")

    def _is_upgrades_obj(self):
        p = self.path.split("?", 1)[0]
        return p.startswith("/upgrades/")

    def do_HEAD(self):
        if self._is_rpc():
            _proxy_rpc(self, "HEAD")
            return
        if self._is_snapshots_obj():
            _proxy_snapshots(self, "HEAD")
            return
        if self._is_upgrades_obj():
            _proxy_upgrades(self, "HEAD")
            return
        super().do_HEAD()

    def do_GET(self):
        if self._is_rpc():
            _proxy_rpc(self, "GET")
            return
        if self._is_snapshots_obj():
            _proxy_snapshots(self, "GET")
            return
        if self._is_upgrades_obj():
            _proxy_upgrades(self, "GET")
            return
        # Silence known browser noise with a quiet 204
        if self.path in SILENT_404:
            self.send_response(204)
            self.end_headers()
            return
        # Strip query string for routing
        clean = self.path.split("?")[0]
        if clean in ("/get", "/get/"):
            self.path = "/get/terp-installer.sh"
        elif clean in ("/tabs", "/tabs.html"):
            self.send_response(301)
            self.send_header("Location", "/eco")
            self.end_headers()
            return
        if clean == "/eco":
            self.path = "/pages/tabs.html"
        elif clean in ("/resources", "/resources.html"):
            self.path = "/pages/snapshots.html"
        elif clean in ("/snapshots", "/snapshots.html"):
            self.send_response(301)
            self.send_header("Location", "/resources" + (("?" + self.path.split("?", 1)[1]) if "?" in self.path else ""))
            self.end_headers()
            return
        # Clean-URL routing: /mint -> pages/mint.html
        elif clean in ROUTES:
            self.path = "/pages/" + ROUTES[clean]
        elif clean in SOON_ROUTES:
            self.path = "/soon/" + SOON_ROUTES[clean]
        elif clean == "/":
            self.path = "/pages/index.html"
        # Direct .html requests: /foo.html -> /pages/foo.html
        elif (
            clean.endswith(".html")
            and not clean.startswith("/pages/")
            and not clean.startswith("/public/")
        ):
            self.path = "/pages" + clean
        super().do_GET()

    def do_POST(self):
        if self._is_rpc():
            _proxy_rpc(self, "POST")
            return
        self.send_error(405)

    def guess_type(self, path):
        if path.endswith(".wasm"):
            return "application/wasm"
        if path.endswith(".js"):
            return "application/javascript; charset=utf-8"
        if path.endswith(".sh"):
            return "text/x-shellscript; charset=utf-8"
        return super().guess_type(path)

    def end_headers(self):
        # Disable caching for HTML so changes are always picked up immediately
        if self.path.endswith(".html"):
            self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
            self.send_header("Pragma", "no-cache")
        super().end_headers()

    def log_message(self, format, *args):
        # Suppress 204 responses from the silent-404 list to keep output clean
        if args and str(args[1]) == "204":
            return
        super().log_message(format, *args)


print(f"Serving at http://localhost:{PORT}")
print(f"  http://localhost:{PORT}/       -> index.html")
for slug in sorted(ROUTES):
    print(f"  http://localhost:{PORT}{slug:<12} -> pages/{ROUTES[slug]}")
for slug in sorted(SOON_ROUTES):
    print(f"  http://localhost:{PORT}{slug:<12} -> soon/{SOON_ROUTES[slug]}")
print(f"  http://localhost:{PORT}/rpc    -> {RPC_PROXY}  (CORS proxy)")
print(f"  http://localhost:{PORT}/snapshots/ -> {SNAPSHOTS_PROXY}/  (MinIO snapshots)")
print(f"  http://localhost:{PORT}/upgrades/  -> {UPGRADES_PROXY}/  (upgrade guide.md)")
http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
