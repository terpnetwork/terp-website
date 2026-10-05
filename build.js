import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { execFileSync } from 'child_process';

const require = createRequire(import.meta.url);
const { minify } = require('html-minifier-terser');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 10);
}

// Contract bundle sources: built by esbuild (buildContracts), not copied as-is.
const CONTRACT_SRC = path.join('lib', 'contracts', 'src');
const ESBUILD_VERSION = '0.28.2';

function copyJsTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
    if (entry.isDirectory() && from === CONTRACT_SRC) continue;
    if (entry.isDirectory()) copyJsTree(from, to);
    else if (entry.name.endsWith('.js') || entry.name.endsWith('.map')) {
      fs.copyFileSync(from, to);
    }
  }
}

function collectVersions(root, prefix, versions) {
  if (!fs.existsSync(root)) return;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const full = path.join(root, entry.name);
    const key = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) collectVersions(full, key, versions);
    else if (/\.(js|css|json|wasm)$/i.test(entry.name)) {
      versions[key] = hashFile(full);
    }
  }
}

/** Stamp only href/src attributes pointing at /public or /lib. */
function stampHtmlAttrs(html, versions) {
  return html.replace(
    /(href|src)="(\/(?:public|lib|pkg)\/[^"?#]+)(?:\?[^"]*)?"/g,
    (_, attr, assetPath) => {
      const key = assetPath.replace(/^\//, '');
      const v = versions[key] || versions._build;
      return `${attr}="${assetPath}?v=${v}"`;
    }
  );
}

// Absolute module specifiers inside JS: `from '/lib/x.js'`, `import('/lib/x.js')`,
// and side-effect `import '/lib/x.js'`.
const JS_IMPORT_RES = [
  /(from\s+['"])(\/(?:lib|public|pkg)\/[^'"?]+)(?:\?[^'"]*)?(['"])/g,
  /(import\s*\(\s*['"])(\/(?:lib|public|pkg)\/[^'"?]+)(?:\?[^'"]*)?(['"]\s*\))/g,
  /(\bimport\s+['"])(\/(?:lib|public|pkg)\/[^'"?]+)(?:\?[^'"]*)?(['"])/g,
];

/** Stamp ESM from '/lib/...' and import('/lib/...') inside a JS string. */
function stampJsImports(js, versions) {
  let out = js;
  for (const re of JS_IMPORT_RES) {
    out = out.replace(re, (_, a, assetPath, c) => {
      const key = assetPath.replace(/^\//, '');
      const v = versions[key] || versions._build;
      return `${a}${assetPath}?v=${v}${c}`;
    });
  }
  return out;
}

/** Absolute /lib|/public|/pkg specifiers imported by a JS source. */
function jsImportKeys(js) {
  const keys = new Set();
  for (const re of JS_IMPORT_RES) {
    for (const m of js.matchAll(new RegExp(re.source, 'g'))) keys.add(m[2].replace(/^\//, ''));
  }
  return [...keys];
}

/**
 * Stamp every module under dist/lib with ONE content version per file, used
 * identically by HTML and by other modules. A module's version hashes its own
 * stamped source, which embeds its dependencies' versions (Merkle-style), so a
 * dependency change also changes every importer's URL. Import cycles fall back
 * to the raw content hash for the back-edge.
 *
 * Previously lib-to-lib imports used pre-stamp hashes while HTML used
 * post-stamp hashes, so the same module could load under two URLs (two module
 * instances, split state: e.g. two wallet sessions).
 */
function stampLibTreeConsistent(outdir, versions) {
  const libRoot = path.join(outdir, 'lib');
  const files = new Map(); // key 'lib/x.js' -> abs path
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.js')) {
        files.set(path.posix.join('lib', path.relative(libRoot, p).split(path.sep).join('/')), p);
      }
    }
  })(libRoot);

  const raw = new Map([...files].map(([k, p]) => [k, fs.readFileSync(p, 'utf8')]));
  const final = new Map();
  const visiting = new Set();
  const hash = (text) => crypto.createHash('sha256').update(text).digest('hex').slice(0, 10);

  function resolve(key) {
    if (final.has(key)) return final.get(key).v;
    if (!raw.has(key)) return versions[key] || versions._build;
    if (visiting.has(key)) return hash(raw.get(key)); // cycle back-edge
    visiting.add(key);
    const src = raw.get(key);
    const depV = {};
    for (const dep of jsImportKeys(src)) if (dep !== key) depV[dep] = resolve(dep);
    const stamped = stampJsImports(src, { ...versions, ...depV });
    const v = hash(stamped);
    visiting.delete(key);
    final.set(key, { v, stamped });
    return v;
  }

  for (const key of files.keys()) resolve(key);
  for (const [key, { v, stamped }] of final) {
    fs.writeFileSync(files.get(key), stamped);
    versions[key] = v;
  }
  return versions;
}

/**
 * Process HTML: stamp attrs, stamp imports inside <script type="module">, inject version map.
 * Minify without touching script bodies.
 */
async function processHtml(content, versions) {
  // Inject version map once for runtime debugging / future dynamic loaders
  // tn-build changes whenever any asset version changes; the app shell does a
  // full page load instead of a soft swap when it differs (new deploy), so one
  // session never mixes module versions.
  const stamp =
    `<meta name="tn-build" content="${versions._deploy}">` +
    `<script>window.__TN_ASSET_V="${versions._build}";</script>`;
  let html = content.includes('</head>')
    ? content.replace('</head>', `${stamp}</head>`)
    : content;

  html = stampHtmlAttrs(html, versions);

  // Stamp module script import paths without minifying them
  html = html.replace(
    /(<script\b[^>]*type=["']module["'][^>]*>)([\s\S]*?)(<\/script>)/gi,
    (_, open, body, close) => open + stampJsImports(body, versions) + close
  );

  // Safe minify: never minifyJS, never process script contents
  try {
    html = await minify(html, {
      collapseWhitespace: true,
      conservativeCollapse: true,
      minifyJS: false,
      minifyCSS: false,
      removeComments: false,
      // Keep script/style contents untouched
      ignoreCustomComments: [/^!/],
    });
  } catch (e) {
    console.warn('[build] minify skipped:', e.message);
  }
  return html;
}

/** esbuild: the installed module, or the CLI on PATH (same version for identical output). */
async function loadEsbuild() {
  try {
    const mod = await import('esbuild');
    return { version: mod.version, build: (o) => mod.build(o) };
  } catch { /* not installed here; try the CLI */ }
  const dirs = (process.env.PATH || '').split(path.delimiter).concat(['/opt/homebrew/bin', '/usr/local/bin']);
  const bin = dirs.map((d) => path.join(d, 'esbuild')).find((f) => fs.existsSync(f));
  if (!bin) throw new Error(`[build] esbuild ${ESBUILD_VERSION} is required for lib/contracts (npm i -D esbuild@${ESBUILD_VERSION}, or the esbuild CLI on PATH)`);
  const version = execFileSync(bin, ['--version'], { encoding: 'utf8' }).trim();
  return {
    version,
    build: async (o) => {
      execFileSync(bin, [o.entryPoints[0], '--bundle', '--format=esm', '--minify', `--target=${o.target}`,
        `--outfile=${o.outfile}`, `--banner:js=${o.banner.js}`, '--log-level=warning'], { stdio: 'inherit' });
    },
  };
}

/**
 * One self-contained ES module per contract: lib/contracts/src/<name>.js
 * (plus the shared _*.js helpers it imports) → dist/lib/contracts/<name>.js.
 * Pages load them lazily with import('/lib/contracts/<name>.js'), stamped
 * ?v=<content hash> like every other module.
 */
async function buildContracts(outdir) {
  if (!fs.existsSync(CONTRACT_SRC)) return [];
  const entries = fs.readdirSync(CONTRACT_SRC).filter((f) => f.endsWith('.js') && !f.startsWith('_')).sort();
  if (!entries.length) return [];
  const esbuild = await loadEsbuild();
  if (esbuild.version !== ESBUILD_VERSION) console.warn(`[build] esbuild ${esbuild.version} (expected ${ESBUILD_VERSION}); bundle hashes may differ`);
  const srcHash = crypto.createHash('sha256');
  for (const f of fs.readdirSync(CONTRACT_SRC).sort()) srcHash.update(f).update(fs.readFileSync(path.join(CONTRACT_SRC, f)));
  const src = srcHash.digest('hex').slice(0, 10);
  const out = [];
  for (const f of entries) {
    const name = f.replace(/\.js$/, '');
    const outfile = path.join(outdir, 'lib', 'contracts', f);
    fs.mkdirSync(path.dirname(outfile), { recursive: true });
    await esbuild.build({
      entryPoints: [path.join(CONTRACT_SRC, f)], bundle: true, format: 'esm', minify: true, target: 'es2020',
      outfile, banner: { js: `/*! terp.network contract bundle: ${name} (src ${src}) */` }, logLevel: 'warning',
    });
    out.push(name);
  }
  return out;
}

/**
 * The home navigation (lib/fractal/routes.js) and the router (lib/shell/shell.js)
 * must agree: every internal section is a soft-navigable route, and every
 * page listed there loads the navigation module.
 */
async function checkWorldRoutes() {
  const { PAGES } = await import('./lib/fractal/routes.js');
  const shellSrc = fs.readFileSync(path.join('lib', 'shell', 'shell.js'), 'utf8');
  const table = shellSrc.match(/var ROUTES = \{([\s\S]*?)\};/);
  const known = new Set(table ? [...table[1].matchAll(/'([^']+)'\s*:/g)].map((m) => m[1]) : []);
  const pageFile = { '/': 'index.html', '/resources': 'snapshots.html', '/eco': 'tabs.html' };
  const problems = [];
  for (const id of PAGES) {
    if (!known.has(id)) problems.push(`${id} is not a route in lib/shell/shell.js`);
    const file = path.join('pages', pageFile[id] || `${id.slice(1)}.html`);
    if (!fs.existsSync(file)) problems.push(`${id}: missing ${file}`);
    else if (!fs.readFileSync(file, 'utf8').includes('/lib/fractal/world.js')) problems.push(`${file} does not load /lib/fractal/world.js`);
  }
  if (problems.length) throw new Error('[build] navigation routes:\n  ' + problems.join('\n  '));
  return PAGES.length;
}

async function build() {
  const worldPages = await checkWorldRoutes();
  const outdir = 'dist';
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  copyJsTree('lib', path.join(outdir, 'lib'));
  const contracts = await buildContracts(outdir);
  fs.cpSync('public', path.join(outdir, 'public'), { recursive: true, force: true });

  if (fs.existsSync('get')) {
    const getOut = path.join(outdir, 'get');
    fs.mkdirSync(getOut, { recursive: true });
    for (const file of fs.readdirSync('get')) {
      const src = path.join('get', file);
      if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(getOut, file));
    }
  }
  if (fs.existsSync('pkg')) {
    fs.cpSync('pkg', path.join(outdir, 'pkg'), { recursive: true, force: true });
    // Also expose passkey wasm under public/wasm for alternate load path
    const pkJs = path.join('pkg', 'passkey_wasm.js');
    const pkWasm = path.join('pkg', 'passkey_wasm_bg.wasm');
    if (fs.existsSync(pkJs) && fs.existsSync(pkWasm)) {
      const dest = path.join(outdir, 'public', 'wasm', 'passkey');
      fs.mkdirSync(dest, { recursive: true });
      fs.copyFileSync(pkJs, path.join(dest, 'passkey_wasm.js'));
      fs.copyFileSync(pkWasm, path.join(dest, 'passkey_wasm_bg.wasm'));
    }
    for (const name of ['norick', 'zkjwt']) {
      const js = path.join('pkg', `${name}_wasm.js`);
      const wa = path.join('pkg', `${name}_wasm_bg.wasm`);
      if (fs.existsSync(js) && fs.existsSync(wa)) {
        const dest = path.join(outdir, 'public', 'wasm', name);
        fs.mkdirSync(dest, { recursive: true });
        fs.copyFileSync(js, path.join(dest, `${name}_wasm.js`));
        fs.copyFileSync(wa, path.join(dest, `${name}_wasm_bg.wasm`));
      }
    }
  }

  // 1) Hash non-module assets (public/*, json, css, wasm).
  const versions = { _build: hashFile(path.join(outdir, 'public', 'global.css')) };
  collectVersions(path.join(outdir, 'lib'), 'lib', versions);
  collectVersions(path.join(outdir, 'public'), 'public', versions);

  // 2) Stamp modules with one consistent, dependency-aware version per file.
  // A dep change rewrites parent import strings, so the parent version changes
  // and HTML loads a new ibc-page.js?v=… URL. That bypasses Cloudflare
  // Origin-variant cache entries that otherwise keep serving a stale module
  // graph (Unexpected token '*'). The same URL is used by HTML, modulepreload
  // and every importer, so each module is instantiated once per session.
  stampLibTreeConsistent(outdir, versions);
  versions._deploy = crypto
    .createHash('sha256')
    .update(JSON.stringify(versions, Object.keys(versions).sort()))
    .digest('hex')
    .slice(0, 10);

  if (contracts.length) {
    const bundles = {};
    for (const name of contracts) {
      const key = `lib/contracts/${name}.js`;
      bundles[name] = { url: `/${key}?v=${versions[key]}`, hash: versions[key] };
    }
    fs.writeFileSync(path.join(outdir, 'lib', 'contracts', 'manifest.json'),
      JSON.stringify({ build: versions._deploy, bundles }, null, 2));
  }

  fs.writeFileSync(
    path.join(outdir, 'public', 'asset-versions.json'),
    JSON.stringify(versions, null, 2)
  );

  for (const file of fs.readdirSync('pages').filter((f) => f.endsWith('.html'))) {
    const srcPath = path.join('pages', file);
    const content = fs.readFileSync(srcPath, 'utf8');
    const out = await processHtml(content, versions);
    const dest = path.join(outdir, 'pages', file);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, out, 'utf8');
  }

  console.log('Build complete (static-S3 safe)');
  console.log('  build id / global.css:', versions._build);
  console.log('  public/global.css:', versions['public/global.css']);
  console.log('  lib/fab.js:', versions['lib/fab.js']);
  console.log('  lib/ecosystem.js:', versions['lib/ecosystem.js']);
  console.log('  lib/wallet.js:', versions['lib/wallet.js']);
  console.log('  lib/ibc-page.js:', versions['lib/ibc-page.js']);
  console.log('  lib/ibc-clients.js:', versions['lib/ibc-clients.js']);
  console.log('  lib/shell/shell.js:', versions['lib/shell/shell.js']);
  console.log('  lib/fractal/world.js:', versions['lib/fractal/world.js'], `(${worldPages} sections)`);
  console.log('  lib/fractal/routes.js:', versions['lib/fractal/routes.js']);
  console.log('  public/world.css:', versions['public/world.css']);
  for (const name of contracts) console.log(`  lib/contracts/${name}.js:`, versions[`lib/contracts/${name}.js`]);
  console.log('  tn-build:', versions._deploy);
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
