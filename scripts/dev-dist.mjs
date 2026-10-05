#!/usr/bin/env node
// Local preview of the built site (dist/) with the production route map, and
// a rebuild whenever lib/, pages/, public/ or build.js change.
//
//   npm run dev                       # http://127.0.0.1:4317
//   PORT=4400 node scripts/dev-dist.mjs
//   WATCH=0 node scripts/dev-dist.mjs # serve only, no rebuilds
//
// Routes mirror nginx/terp.network.conf: /, /eco, /resources, /ibc, /svg,
// /no-rick, /about, /wip and the old .html names redirect to them.
// Local preview only; nothing here deploys anything.
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const root = path.join(site, 'dist');
const port = +(process.env.PORT || 4317);
const host = process.env.HOST || '127.0.0.1';
const pages = { '/': 'index', '/eco': 'tabs', '/ibc': 'ibc', '/svg': 'svg', '/no-rick': 'no-rick', '/about': 'about', '/resources': 'snapshots', '/wip': 'wip' };
const redirects = { '/tabs': '/eco', '/tabs.html': '/eco', '/ibc.html': '/ibc', '/svg.html': '/svg', '/no-rick.html': '/no-rick', '/about.html': '/about', '/resources.html': '/resources', '/snapshots': '/resources', '/snapshots.html': '/resources', '/wip.html': '/wip', '/index.html': '/' };
const types = { '.html': 'text/html; charset=utf-8', '.js': 'application/javascript', '.mjs': 'application/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.sh': 'text/x-shellscript', '.md': 'text/markdown', '.txt': 'text/plain' };
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(u.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p.length > 1 && p.endsWith('/') && pages[p.slice(0, -1)]) p = p.slice(0, -1);
  if (redirects[p]) { res.writeHead(301, { Location: redirects[p] + u.search }); return res.end(); }
  const file = path.join(root, pages[p] ? path.join('pages', pages[p] + '.html') : p);
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404, { 'content-type': 'text/plain' }); return res.end('404'); }
  const body = fs.readFileSync(file);
  const h = { 'content-type': types[path.extname(file)] || 'application/octet-stream', 'cache-control': 'no-cache' };
  if (/gzip/.test(req.headers['accept-encoding'] || '') && /text|javascript|json|svg/.test(h['content-type'])) { h['content-encoding'] = 'gzip'; res.writeHead(200, h); return res.end(zlib.gzipSync(body)); }
  res.writeHead(200, h); res.end(body);
}).listen(port, host, () => log(`serving ${root} at http://${host}:${port}/`));

let building = false, again = false, timer = null;
function build() {
  if (building) { again = true; return; }
  building = true;
  const t0 = Date.now();
  const child = spawn(process.execPath, ['build.js'], { cwd: site });
  let out = '';
  child.stdout.on('data', (d) => (out += d)); child.stderr.on('data', (d) => (out += d));
  child.on('close', (code) => {
    building = false;
    const id = (out.match(/tn-build: (\w+)/) || [])[1];
    log(code === 0 ? `rebuilt tn-build: ${id} (${Date.now() - t0} ms)` : `build failed (exit ${code})\n${out}`);
    if (again) { again = false; build(); }
  });
}
if (process.env.WATCH !== '0') {
  for (const d of ['lib', 'pages', 'public']) {
    fs.watch(path.join(site, d), { recursive: true }, (ev, f) => { if (f && /(^|\/)\.|~$|\.swp$/.test(f)) return; clearTimeout(timer); timer = setTimeout(build, 250); });
  }
  fs.watch(path.join(site, 'build.js'), () => { clearTimeout(timer); timer = setTimeout(build, 250); });
  log('watching lib/, pages/, public/, build.js');
}
if (!fs.existsSync(path.join(root, 'pages', 'index.html')) || process.env.BUILD_ON_START === '1') build();
