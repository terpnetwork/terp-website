import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const require = createRequire(import.meta.url);
const { minify } = require('html-minifier-terser');

function hashFile(filePath) {
  return crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex').slice(0, 10);
}

function copyJsTree(srcDir, destDir) {
  fs.mkdirSync(destDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    const from = path.join(srcDir, entry.name);
    const to = path.join(destDir, entry.name);
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

/** Stamp ESM from '/lib/...' and import('/lib/...') inside a JS string. */
function stampJsImports(js, versions) {
  let out = js;
  out = out.replace(
    /(from\s+['"])(\/(?:lib|public|pkg)\/[^'"?]+)(?:\?[^'"]*)?(['"])/g,
    (_, a, assetPath, c) => {
      const key = assetPath.replace(/^\//, '');
      const v = versions[key] || versions._build;
      return `${a}${assetPath}?v=${v}${c}`;
    }
  );
  out = out.replace(
    /(import\s*\(\s*['"])(\/(?:lib|public|pkg)\/[^'"?]+)(?:\?[^'"]*)?(['"]\s*\))/g,
    (_, a, assetPath, c) => {
      const key = assetPath.replace(/^\//, '');
      const v = versions[key] || versions._build;
      return `${a}${assetPath}?v=${v}${c}`;
    }
  );
  return out;
}

/**
 * Process HTML: stamp attrs, stamp imports inside <script type="module">, inject version map.
 * Minify without touching script bodies.
 */
async function processHtml(content, versions) {
  // Inject version map once for runtime debugging / future dynamic loaders
  const stamp = `<script>window.__TN_ASSET_V="${versions._build}";</script>`;
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

async function build() {
  const outdir = 'dist';
  fs.rmSync(outdir, { recursive: true, force: true });
  fs.mkdirSync(outdir, { recursive: true });

  copyJsTree('lib', path.join(outdir, 'lib'));
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

  // 1) Hash unstamped assets — used inside modules as import ?v= targets
  const depVersions = { _build: hashFile(path.join(outdir, 'public', 'global.css')) };
  collectVersions(path.join(outdir, 'lib'), 'lib', depVersions);
  collectVersions(path.join(outdir, 'public'), 'public', depVersions);

  // 2) Stamp absolute /lib|/public|/pkg imports inside every shipped module
  function stampLibTree(dir) {
    for (const name of fs.readdirSync(dir)) {
      const p = path.join(dir, name);
      if (fs.statSync(p).isDirectory()) stampLibTree(p);
      else if (name.endsWith('.js')) {
        fs.writeFileSync(p, stampJsImports(fs.readFileSync(p, 'utf8'), depVersions));
      }
    }
  }
  stampLibTree(path.join(outdir, 'lib'));

  // 3) Re-hash AFTER stamping for HTML/src references. A dep change rewrites parent
  // import strings, so the parent file hash changes and HTML loads a new
  // ibc-page.js?v=… URL. That bypasses Cloudflare Origin-variant cache entries
  // that otherwise keep serving a stale module graph (Unexpected token '*').
  const versions = { _build: depVersions._build };
  collectVersions(path.join(outdir, 'lib'), 'lib', versions);
  collectVersions(path.join(outdir, 'public'), 'public', versions);

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
}

build().catch((e) => {
  console.error(e);
  process.exit(1);
});
