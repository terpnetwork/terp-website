// snapshots.js — class manifests only. Never chain-root snapshot.json.
// GET pruned|archive /snapshot.json. `latest` is a URL string.

export const MINIO_SNAPSHOTS = 'https://minio.terp.network/snapshots';
export const S3_SNAPSHOTS = 'https://s3.terp.network/snapshots';

const SNAP_RE =
  /^(?<chain>[^/]+)_(?<height>\d+)_(?<ts>\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}Z)\.tar\.lz4$/;

const V6_HALT = 22810000;
const TERPD_V6 = 'terpd v6';
const NETWORKS = [{ network: 'mainnet', chainId: 'morocco-1' }];
const CLASSES = [
  { id: 'pruned', label: 'Pruned (fast sync)' },
  { id: 'archive', label: 'Archive (full data + wasm)' },
];

function objectPath(minioOrPath) {
  const s = String(minioOrPath || '');
  const i = s.indexOf('/snapshots/');
  if (i >= 0) return s.slice(i + '/snapshots/'.length);
  if (s.startsWith('/snapshots/')) return s.slice('/snapshots/'.length);
  return s.replace(/^\//, '');
}

export function publicObjectUrl(minioOrPath, base = S3_SNAPSHOTS) {
  const s = String(minioOrPath || '');
  if (/^https?:\/\//i.test(s) && !s.includes('://terp.network/snapshots/')) return s;
  return `${base}/${objectPath(s)}`;
}

export function latestUrl(manifest) {
  if (!manifest) return '';
  if (typeof manifest.latest === 'string' && manifest.latest) return manifest.latest;
  if (Array.isArray(manifest.snapshots) && typeof manifest.snapshots[0] === 'string') {
    return manifest.snapshots[0];
  }
  return '';
}

export function parseSnapshotUrl(url) {
  const abs = publicObjectUrl(url);
  const filename = (abs || '').split('/').pop() || '';
  const m = SNAP_RE.exec(filename);
  if (!m?.groups) return { url: abs, filename };
  const iso = m.groups.ts.replace(/T(\d{2})-(\d{2})-(\d{2})Z$/, 'T$1:$2:$3Z');
  return {
    url: abs,
    filename,
    chainId: m.groups.chain,
    height: Number(m.groups.height),
    createdAt: iso,
    compression: 'lz4',
  };
}

export function humanBytes(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x <= 0) return '—';
  const gib = 1024 ** 3;
  const mib = 1024 ** 2;
  if (x >= gib) return `${x >= 10 * gib ? Math.round(x / gib) : (x / gib).toFixed(1)} GiB`;
  if (x >= mib) return `${Math.round(x / mib)} MiB`;
  if (x >= 1024) return `${Math.round(x / 1024)} KiB`;
  return `${x} B`;
}

async function readJson(r) {
  const t = await r.text();
  if (!t || /^\s*</.test(t)) return null;
  try {
    return JSON.parse(t);
  } catch {
    return null;
  }
}

async function fetchJson(urls) {
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: { Accept: 'application/json' }, cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await readJson(r);
      if (j) return j;
    } catch {
      /* next host */
    }
  }
  return null;
}

export async function sizeBytes(url) {
  const path = objectPath(url);
  for (const base of [S3_SNAPSHOTS, MINIO_SNAPSHOTS]) {
    try {
      const r = await fetch(`${base}/${path}`, { method: 'HEAD', cache: 'no-cache' });
      if (!r.ok) continue;
      const n = r.headers.get('content-length');
      if (n) return Number(n);
    } catch {
      /* next */
    }
  }
  return undefined;
}

export async function loadClass(network, chainId, cls) {
  if (cls !== 'pruned' && cls !== 'archive') return null;
  const path = `${network}/${chainId}/${cls}/snapshot.json`;
  return fetchJson([`${S3_SNAPSHOTS}/${path}`, `${MINIO_SNAPSHOTS}/${path}`]);
}

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function publishedDate(iso) {
  if (!iso) return '—';
  return iso.slice(0, 10);
}

function classCopy(cls, height) {
  const staleArchive = cls === 'archive' && Number(height) > 0 && Number(height) < V6_HALT;
  if (cls === 'archive') {
    return {
      title: staleArchive ? 'Archive (not current)' : 'Archive',
      blurb: staleArchive
        ? `Full history at height ${Number(height).toLocaleString()}. Taken before the v6 upgrade. Use pruned to join the live chain.`
        : 'The full chain state, including historic blocks. Larger download.',
      retention: staleArchive ? 'Older than the v6 upgrade.' : 'Full history.',
    };
  }
  return {
    title: 'Latest snapshot (pruned)',
    blurb: 'State a node needs to join the live chain, without historic blocks. Start with terpd v6.',
    retention: 'No historic blocks. This is the current snapshot.',
  };
}

export function restoreBash({ cls, latest, filename, height, genesis, home }) {
  const dl = publicObjectUrl(latest);
  const file = filename || (dl.split('/').pop() || 'snapshot.tar.lz4');
  const gen = publicObjectUrl(genesis);
  const dest = home || '$HOME/.terp';
  const prune = cls === 'pruned' ? `# 2 · pruned pack — start with terpd v6\n` : `# 2 · archive pack\n`;
  return `# 1 · stop the node first, if it is already running
# terpd stop

${prune}# 3 · download (no keys in this file)
curl -L -o ${file} "${dl}"

# 4 · unpack into the chain home
mkdir -p ${dest}
lz4 -dc ${file} | tar -x -C ${dest}

# 5 · genesis if this is a new home
mkdir -p ${dest}/config
curl -L -o ${dest}/config/genesis.json "${gen}"

# 6 · start with terpd v6 — resumes from height ${height ?? 'the snapshot height'}
terpd start`;
}

async function paintCard(host, ctx) {
  const { network, chainId, cls, manifest, err } = ctx;
  const latest = latestUrl(manifest);
  const meta = latest ? parseSnapshotUrl(latest) : {};
  const copy = classCopy(cls, meta.height);
  const card = document.createElement('article');
  card.className = 'snap-card snap-hero';
  if (err) {
    card.innerHTML = `<h3>${esc(copy.title)}</h3><p class="state-status err">${esc(err)}</p>`;
    host.appendChild(card);
    return { cls, bash: '' };
  }
  if (!latest) {
    card.innerHTML = `<h3>${esc(copy.title)}</h3><p class="muted">No snapshot yet.</p>`;
    host.appendChild(card);
    return { cls, bash: '' };
  }

  const dl = publicObjectUrl(latest);
  const genesis = publicObjectUrl(`${network}/${chainId}/genesis.json`);
  const bash = restoreBash({
    cls,
    latest: dl,
    filename: meta.filename,
    height: meta.height,
    genesis,
  });

  card.innerHTML = `
    <h3>${esc(copy.title)}</h3>
    <p class="snap-blurb">${esc(copy.blurb)}</p>
    <p class="snap-height">Block ${meta.height != null ? Number(meta.height).toLocaleString() : '—'}</p>
    <dl class="snap-meta snap-facts">
      <dt>Published</dt><dd>${esc(publishedDate(meta.createdAt))}</dd>
      <dt>Size</dt><dd class="snap-size">Checking…</dd>
      <dt>Built with</dt><dd>${esc(cls === 'pruned' ? TERPD_V6 : 'pre-v6')}</dd>
      <dt>Retention</dt><dd>${esc(copy.retention)}</dd>
    </dl>
    <div class="snap-actions">
      <a class="snap-btn primary" href="${esc(dl)}" rel="noopener">Direct download</a>
      <a class="snap-btn" href="${esc(genesis)}" rel="noopener">Genesis</a>
    </div>
    <p class="muted snap-file"><code>${esc(meta.filename)}</code> · morocco-1 · ${esc(network)}</p>
  `;
  host.appendChild(card);

  const bytes = await sizeBytes(dl);
  const sizeEl = card.querySelector('.snap-size');
  if (sizeEl) sizeEl.textContent = humanBytes(bytes);
  return { cls, bash, filename: meta.filename, height: meta.height };
}

function mountRunBox(host, snippets) {
  const box = document.createElement('section');
  box.className = 'snap-run';
  box.innerHTML = `
    <h3>Run a node</h3>
    <p class="muted">Start from the <strong>pruned</strong> pack with <code>terpd</code> v6. Need <code>lz4</code> and <code>tar</code>. Stop <code>terpd</code> first.</p>
    <div class="snap-run-tabs" role="tablist">
      <button type="button" class="tab-btn active" data-run="pruned">Pruned</button>
      <button type="button" class="tab-btn" data-run="archive">Archive</button>
    </div>
    <pre class="snap-code" id="snap-run-pre"></pre>
    <div class="snap-actions">
      <button type="button" class="snap-btn primary" id="snap-run-copy">Copy</button>
      <a class="snap-btn" href="/get">Installer</a>
    </div>
  `;
  host.appendChild(box);
  const pre = box.querySelector('#snap-run-pre');
  let kind = snippets.pruned ? 'pruned' : 'archive';
  const paint = () => {
    pre.textContent = snippets[kind] || `# no ${kind} snapshot yet`;
    box.querySelectorAll('[data-run]').forEach((b) => b.classList.toggle('active', b.dataset.run === kind));
  };
  box.querySelectorAll('[data-run]').forEach((b) => {
    b.addEventListener('click', () => {
      kind = b.dataset.run;
      paint();
    });
  });
  box.querySelector('#snap-run-copy')?.addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    try {
      await navigator.clipboard.writeText(pre.textContent);
      btn.textContent = 'Copied';
    } catch {
      btn.textContent = 'Copy failed';
    }
    setTimeout(() => {
      btn.textContent = 'Copy';
    }, 1400);
  });
  paint();
}

export async function mountSnapshotPanel(host) {
  if (!host) return;
  host.innerHTML = `<p class="muted">Loading snapshot manifests…</p>`;
  const net = NETWORKS[0];
  const wrap = document.createElement('div');
  wrap.innerHTML = `
    <p class="snap-lead">
      Current snapshot is the <strong>pruned</strong> pack. Download it, unpack with <code>lz4</code> and <code>tar</code>, start <code>terpd</code> v6.
      Archive is a full-history pack from before the v6 upgrade.
    </p>
    <div id="snap-cards"></div>
    <div id="snap-run-host"></div>
  `;
  host.innerHTML = '';
  host.appendChild(wrap);
  const cards = wrap.querySelector('#snap-cards');
  const snippets = { pruned: '', archive: '' };

  const loaded = await Promise.all(
    CLASSES.map(async (cls) => {
      const manifest = await loadClass(net.network, net.chainId, cls.id);
      return { cls: cls.id, manifest, err: manifest ? '' : 'Could not load this class manifest.' };
    }),
  );
  for (const row of loaded) {
    const painted = await paintCard(cards, {
      ...net,
      cls: row.cls,
      manifest: row.manifest,
      err: row.manifest ? undefined : row.err,
    });
    if (painted?.bash) snippets[painted.cls] = painted.bash;
  }
  mountRunBox(wrap.querySelector('#snap-run-host'), snippets);
}
