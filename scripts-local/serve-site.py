#!/usr/bin/env python3
"""Local review server for websites/terp.network. Mirrors nginx/terp.network.conf
routes (clean URLs, 301s, same-origin /rpc /lcd proxies) against the source tree.
Read-only preview only — do not use for production.

Usage: python3 scripts-local/serve-site.py  (serves 127.0.0.1:5173)
"""
import posixpath
import ssl
import urllib.request
from http.server import BaseHTTPRequestHandler, HTTPServer
from urllib.parse import urlsplit


def _ssl_context():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except ImportError:
        return ssl.create_default_context()

ROOT = __import__('pathlib').Path(__file__).resolve().parents[1]

CLEAN = {
    '/': 'pages/index.html',
    '/eco': 'pages/tabs.html',
    '/ibc': 'pages/ibc.html',
    '/svg': 'pages/svg.html',
    '/svg/create': 'pages/create-svg.html',
    '/no-rick': 'pages/no-rick.html',
    '/about': 'pages/about.html',
    '/resources': 'pages/snapshots.html',
}
MOVED = {
    '/tabs': '/eco', '/tabs.html': '/eco',
    '/ibc.html': '/ibc', '/svg.html': '/svg',
    '/no-rick.html': '/no-rick', '/about.html': '/about',
    '/resources.html': '/resources', '/snapshots': '/resources',
    '/snapshots.html': '/resources',
    '/pages/index.html': '/', '/pages/tabs.html': '/eco', '/pages/ibc.html': '/ibc', '/pages/svg.html': '/svg', '/pages/no-rick.html': '/no-rick', '/pages/about.html': '/about', '/pages/snapshots.html': '/resources', '/pages/wip.html': '/', '/pages/create-svg.html': '/svg/create', '/create-svg': '/svg/create', '/create-svg.html': '/svg/create', '/svg/create/': '/svg/create', '/wip': '/', '/wip.html': '/',
}
PROXY = {
    '/rpc': 'https://rpc.terp.network/',
    '/rpc-testnet': 'https://testnet-rpc.terp.network/',
    '/lcd': 'https://api.terp.network/',
}

TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript',
         '.mjs': 'text/javascript', '.json': 'application/json',
         '.css': 'text/css', '.svg': 'image/svg+xml',
         '.png': 'image/png', '.wasm': 'application/wasm'}


class Handler(BaseHTTPRequestHandler):
    server_version = 'terp-review/1'

    def log_message(self, *a):
        pass

    def _send_file(self, rel):
        p = (ROOT / rel.lstrip('/')).resolve()
        if not str(p).startswith(str(ROOT)) or not p.is_file():
            self.send_error(404, rel)
            return
        body = p.read_bytes()
        self.send_response(200)
        self.send_header('Content-Type', TYPES.get(p.suffix.lower(), 'application/octet-stream'))
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        if p.suffix.lower() in ('.html',):
            self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(body)

    def _proxy(self, base):
        url = base + urlsplit(self.path).path[len(self.command_path):].lstrip('/') + \
            ('?' + urlsplit(self.path).query if urlsplit(self.path).query else '')
        data = None
        if self.command == 'POST':
            ln = int(self.headers.get('Content-Length', 0))
            data = self.rfile.read(ln) if ln else None
        req = urllib.request.Request(url, data=data, method=self.command)
        ctype = self.headers.get('Content-Type')
        if ctype:
            req.add_header('Content-Type', ctype)
        try:
            with urllib.request.urlopen(req, timeout=30, context=_ssl_context()) as r:
                body = r.read()
        except Exception as e:
            self.send_error(502, f'upstream: {e}')
            return
        self.send_response(200)
        self.send_header('Content-Type', r.headers.get_content_type())
        self.send_header('Content-Length', str(len(body)))
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(body)

    def _route(self):
        parts = urlsplit(self.path)
        path = posixpath.normpath(parts.path)
        if path in MOVED:
            self.send_response(301)
            self.send_header('Location', MOVED[path])
            self.end_headers()
            return
        if path in CLEAN:
            self._send_file(CLEAN[path])
            return
        for prefix, base in PROXY.items():
            if parts.path == prefix or parts.path.startswith(prefix + '/'):
                self.command_path = prefix
                self._proxy(base)
                return
        # same-origin testnet lcd twin of /lcd
        if parts.path == '/lcd-testnet' or parts.path.startswith('/lcd-testnet/'):
            self.command_path = '/lcd-testnet'
            self._proxy('https://testnet-api.terp.network/')
            return
        self._send_file(path)

    def do_GET(self):
        self._route()

    def do_POST(self):
        self._route()


if __name__ == '__main__':
    srv = HTTPServer(('127.0.0.1', 5173), Handler)
    print('terp.network review server on http://127.0.0.1:5173/')
    srv.serve_forever()
