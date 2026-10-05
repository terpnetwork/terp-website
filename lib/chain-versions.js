// chain-versions.js — upgrades + releases from S3 object listings (not a stale prefix dump).

const RELEASES = 'https://s3.terp.network/releases';
const UPGRADES = 'https://s3.terp.network/upgrades';
const LCDS = [
  '/lcd/cosmos/upgrade/v1beta1/current_plan',
  'https://api.terp.network/cosmos/upgrade/v1beta1/current_plan',
];
const IPFS_GW = 'https://ipfs.terp.network/ipfs';
const GOV = 'https://www.ping.pub/terp/gov';
const GH_TAG = 'https://github.com/terpnetwork/terp-core/releases/tag';

function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function inlineMd(s) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** Small markdown subset for upgrade guides (headings, lists, fences, links). */
export function renderGuideMd(src) {
  const lines = String(src || '').replace(/\r\n/g, '\n').split('\n');
  const out = [];
  let i = 0;
  let list = null;
  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  while (i < lines.length) {
    const line = lines[i];
    if (line.startsWith('```')) {
      closeList();
      const buf = [];
      i += 1;
      while (i < lines.length && !lines[i].startsWith('```')) {
        buf.push(lines[i]);
        i += 1;
      }
      out.push(`<pre class="snap-code"><code>${esc(buf.join('\n'))}</code></pre>`);
      i += 1;
      continue;
    }
    if (/^---+$/.test(line.trim())) {
      closeList();
      out.push('<hr>');
      i += 1;
      continue;
    }
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      closeList();
      const n = h[1].length;
      out.push(`<h${n + 2} class="guide-h">${inlineMd(h[2])}</h${n + 2}>`);
      i += 1;
      continue;
    }
    const ul = line.match(/^[-*]\s+(.*)$/);
    if (ul) {
      if (list !== 'ul') {
        closeList();
        out.push('<ul>');
        list = 'ul';
      }
      out.push(`<li>${inlineMd(ul[1])}</li>`);
      i += 1;
      continue;
    }
    const ol = line.match(/^\d+\.\s+(.*)$/);
    if (ol) {
      if (list !== 'ol') {
        closeList();
        out.push('<ol>');
        list = 'ol';
      }
      out.push(`<li>${inlineMd(ol[1])}</li>`);
      i += 1;
      continue;
    }
    if (!line.trim()) {
      closeList();
      i += 1;
      continue;
    }
    closeList();
    out.push(`<p>${inlineMd(line)}</p>`);
    i += 1;
  }
  closeList();
  return out.join('\n');
}

function ensureGuideModal() {
  let root = document.getElementById('upgrade-guide-modal');
  if (root) return root;
  root = document.createElement('div');
  root.id = 'upgrade-guide-modal';
  root.className = 'res-info-overlay';
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.innerHTML = `
    <div class="res-info-modal res-guide-modal">
      <div class="guide-modal-head">
        <h3 id="upgrade-guide-title">Upgrade guide</h3>
        <button type="button" class="close-info" id="upgrade-guide-close" aria-label="Close">Close</button>
      </div>
      <div id="upgrade-guide-body" class="md-guide">Loading…</div>
    </div>`;
  document.body.appendChild(root);
  const close = () => root.classList.remove('open');
  root.querySelector('#upgrade-guide-close')?.addEventListener('click', close);
  root.addEventListener('click', (e) => {
    if (e.target === root) close();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') close();
  });
  return root;
}

function looksLikeHtml(ct, text) {
  if (/html/i.test(ct || '')) return true;
  const t = String(text || '').trim();
  return /^<!doctype html/i.test(t) || /^<html[\s>]/i.test(t);
}

export async function openUpgradeGuide(planName = 'v6') {
  const root = ensureGuideModal();
  const body = root.querySelector('#upgrade-guide-body');
  const title = root.querySelector('#upgrade-guide-title');
  if (title) title.textContent = `Upgrade guide · ${planName}`;
  body.innerHTML = '<p class="muted">Loading guide…</p>';
  root.classList.add('open');
  // Same-origin /upgrades/* is the upgrades MinIO bucket on some edges and
  // the SPA index.html on others (200 text/html). Never treat HTML as a guide.
  const urls = [
    `/public/upgrades/${planName}/guide.md`,
    `${UPGRADES}/${planName}/guide.md`,
    `/upgrades/${planName}/guide.md`,
  ];
  let text = '';
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) continue;
      const raw = await r.text();
      const ct = r.headers.get('content-type') || '';
      if (looksLikeHtml(ct, raw)) continue;
      if (raw.trim()) {
        text = raw;
        break;
      }
    } catch {
      /* next */
    }
  }
  if (!text) {
    body.innerHTML = `<p class="state-status err">Could not load the upgrade guide for <code>${esc(planName)}</code>.</p>`;
    return;
  }
  body.innerHTML = renderGuideMd(text);
}

function humanSize(n) {
  const x = Number(n);
  if (!Number.isFinite(x) || x < 0) return '—';
  if (x < 1024) return `${x} B`;
  if (x < 1024 ** 2) return `${(x / 1024).toFixed(x < 10 * 1024 ? 1 : 0)} KiB`;
  if (x < 1024 ** 3) return `${(x / 1024 ** 2).toFixed(x < 10 * 1024 ** 2 ? 1 : 1)} MiB`;
  return `${(x / 1024 ** 3).toFixed(1)} GiB`;
}

function parseListXml(xml) {
  const prefixes = [...xml.matchAll(/<CommonPrefixes>\s*<Prefix>([^<]+)<\/Prefix>/g)].map((m) => m[1]);
  const contents = [];
  const re =
    /<Contents>\s*<Key>([^<]+)<\/Key>\s*<LastModified>([^<]+)<\/LastModified>[\s\S]*?<Size>([^<]+)<\/Size>/g;
  let m;
  while ((m = re.exec(xml))) {
    contents.push({ key: m[1], lastModified: m[2], size: Number(m[3]) });
  }
  const truncated = /<IsTruncated>true<\/IsTruncated>/.test(xml);
  const token = (xml.match(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/) || [])[1];
  return { prefixes, contents, truncated, token };
}

async function s3List({ bucketUrl, prefix, delimiter = '', max = 1000 }) {
  const all = { prefixes: [], contents: [] };
  let token = '';
  for (let i = 0; i < 8; i++) {
    const q = new URLSearchParams({
      'list-type': '2',
      prefix,
      'max-keys': String(max),
    });
    if (delimiter) q.set('delimiter', delimiter);
    if (token) q.set('continuation-token', token);
    const res = await fetch(`${bucketUrl}?${q}`, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status} listing ${prefix}`);
    const xml = await res.text();
    const page = parseListXml(xml);
    all.prefixes.push(...page.prefixes);
    all.contents.push(...page.contents);
    if (!page.truncated || !page.token) break;
    token = page.token;
  }
  return all;
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

async function loadJson(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
    if (!r.ok) return null;
    return readJson(r);
  } catch {
    return null;
  }
}

async function loadText(url) {
  try {
    const r = await fetch(url, { cache: 'no-cache' });
    if (!r.ok) return '';
    return r.text();
  } catch {
    return '';
  }
}

function parseSha256sum(text) {
  const map = new Map();
  for (const line of String(text || '').split('\n')) {
    const m = line.trim().match(/^([a-fA-F0-9]{64})\s+\*?(\S+)/);
    if (m) map.set(m[2].replace(/^\.\//, ''), m[1].toLowerCase());
  }
  return map;
}

function ipfsIndex(meta) {
  const map = new Map();
  const snaps = meta?.snapshots || {};
  for (const [k, v] of Object.entries(snaps)) {
    const key = v?.key || k;
    if (v?.ipfs_cid) map.set(key, v);
    const short = String(key).split('/').slice(-2).join('/');
    if (v?.ipfs_cid) map.set(short, v);
    const file = String(key).split('/').pop();
    if (file && v?.ipfs_cid && !map.has(file)) map.set(file, v);
  }
  return map;
}

function tagRank(tag) {
  if (tag === 'latest') return 0;
  const m = tag.match(/^v?(\d+)\.(\d+)\.(\d+)(.*)$/);
  if (!m) return 9000;
  const pre = m[4] ? 1 : 0;
  return 1000 - (Number(m[1]) * 10000 + Number(m[2]) * 100 + Number(m[3])) + pre;
}

function sortTags(tags) {
  return [...tags].sort((a, b) => tagRank(a) - tagRank(b) || b.localeCompare(a));
}

function objectRow(obj, { prefix, hashes, ipfs }) {
  const name = obj.key.slice(prefix.length);
  if (!name || name.endsWith('/')) return '';
  const href = `${RELEASES}/${esc(obj.key)}`;
  const hash = hashes.get(name) || hashes.get(obj.key) || '';
  const pin = ipfs.get(obj.key) || ipfs.get(name);
  const cid = pin?.ipfs_cid || '';
  const when = obj.lastModified ? obj.lastModified.replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '—';
  return `<tr>
    <td><a href="${href}" target="_blank" rel="noopener">${esc(name)}</a></td>
    <td>${esc(humanSize(obj.size))}</td>
    <td class="hash">${hash ? `<code>${esc(hash)}</code>` : ''}</td>
    <td>${
      cid
        ? `<a class="ipfs" href="${IPFS_GW}/${esc(cid)}" target="_blank" rel="noopener">/ipfs/${esc(cid.slice(0, 12))}…</a><div class="cid">${esc(cid)}</div>`
        : ''
    }</td>
    <td>${esc(when)}</td>
  </tr>`;
}

function objectsTable(rowsHtml) {
  return `<div class="res-table-wrap"><table class="res-table">
    <thead><tr><th>Object</th><th>Size</th><th>SHA-256</th><th>IPFS</th><th>Modified</th></tr></thead>
    <tbody>${rowsHtml || '<tr><td colspan="5">No objects in this prefix.</td></tr>'}</tbody>
  </table></div>`;
}

async function loadPrefixCatalog(prefix) {
  const [listed, shaText, meta] = await Promise.all([
    s3List({ bucketUrl: RELEASES, prefix, max: 1000 }),
    loadText(`${RELEASES}/${prefix}sha256sum.txt`),
    loadJson(`${RELEASES}/metadata.json`),
  ]);
  const hashes = parseSha256sum(shaText);
  const ipfs = ipfsIndex(meta);
  const files = listed.contents.filter((c) => !c.key.endsWith('/') && c.key !== prefix);
  files.sort((a, b) => a.key.localeCompare(b.key));
  return { files, hashes, ipfs };
}

async function currentPlan() {
  let last = '';
  for (const url of LCDS) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) {
        last = `HTTP ${r.status}`;
        continue;
      }
      const j = await readJson(r);
      if (!j) continue;
      return j.plan || j.current_plan || {};
    } catch (e) {
      last = e.message || String(e);
    }
  }
  return { _error: last };
}

function parsePlanInfo(info) {
  if (!info) return {};
  try {
    return typeof info === 'string' ? JSON.parse(info) : info;
  } catch {
    return { raw: info };
  }
}

async function liveChainHeight() {
  const urls = ['/lcd/cosmos/base/tendermint/v1beta1/blocks/latest', 'https://api.terp.network/cosmos/base/tendermint/v1beta1/blocks/latest'];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await readJson(r);
      if (!j) continue;
      const h = Number(j.block?.header?.height || j.height || 0);
      if (h > 0) return h;
    } catch {
      /* next */
    }
  }
  return 0;
}

function proposalPlan(doc) {
  const msg = doc?.messages?.find((m) => m?.plan || m?.['@type']?.includes('SoftwareUpgrade')) || doc?.messages?.[0];
  return msg?.plan || doc?.plan || {};
}

/** Last-resort heights from chain-registry / applied history when LCD draft JSON has height 0. */
const PLAN_META = {
  v520: { height: 21725359, tag: 'v5.2.0' },
  v6: { height: 22810000, proposal: 58, tag: 'v6.0.0' },
  'v6.1': { height: 23191300, proposal: 59, tag: 'v6.1.0' },
  'v6.2': { height: 23191302, tag: 'v6.2.0', note: 'armed by v6.1 at apply+2' },
};

async function appliedPlanHeight(name) {
  const urls = [
    `/lcd/cosmos/upgrade/v1beta1/applied_plan/${encodeURIComponent(name)}`,
    `https://api.terp.network/cosmos/upgrade/v1beta1/applied_plan/${encodeURIComponent(name)}`,
  ];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await readJson(r);
      const h = Number(j?.height || j?.Height || 0);
      if (h > 0) return h;
    } catch {
      /* next */
    }
  }
  return 0;
}

async function loadGovUpgradePlans() {
  const urls = [
    '/lcd/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_PASSED&pagination.limit=200',
    'https://api.terp.network/cosmos/gov/v1/proposals?proposal_status=PROPOSAL_STATUS_PASSED&pagination.limit=200',
  ];
  let proposals = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { cache: 'no-cache' });
      if (!r.ok) continue;
      const j = await readJson(r);
      proposals = j?.proposals || [];
      if (proposals.length) break;
    } catch {
      /* next */
    }
  }
  const byName = {};
  for (const p of proposals) {
    const status = String(p.status || '');
    if (status && !status.includes('PASSED') && !status.includes('VOTING')) continue;
    const id = p.id || p.proposal_id || '';
    const walk = (msgs) => {
      for (const m of msgs || []) {
        const plan = m.plan || m.content?.plan || {};
        if (plan.name) {
          const h = Number(plan.height || 0);
          const prev = byName[plan.name];
          if (!prev || (h > 0 && h >= (prev.height || 0))) {
            byName[plan.name] = {
              height: h,
              proposalId: id,
              title: p.title || '',
              info: plan.info || '',
            };
          }
        }
        if (m.messages) walk(m.messages);
      }
    };
    walk(p.messages);
  }
  return byName;
}

function pickHeight(name, { draft, live, gov, applied }) {
  const draftH = Number(draft?.height || 0);
  if (draftH > 0) return draftH;
  if (live?.name === name && Number(live.height) > 0) return Number(live.height);
  if (gov[name]?.height > 0) return Number(gov[name].height);
  if (applied > 0) return applied;
  if (PLAN_META[name]?.height > 0) return PLAN_META[name].height;
  if (name === 'v6.2' && gov['v6.1']?.height > 0) return Number(gov['v6.1'].height) + 2;
  if (name === 'v6.2' && live?.name === 'v6.1' && Number(live.height) > 0) return Number(live.height) + 2;
  return 0;
}

async function roomRecognized(name) {
  const listed = await s3List({ bucketUrl: UPGRADES, prefix: `${name}/`, max: 200 }).catch(() => ({ contents: [] }));
  const files = (listed.contents || []).map((c) => c.key.slice(`${name}/`.length));
  const has = (n) => files.includes(n);
  return {
    files: listed.contents || [],
    ok: has('draft_proposal.json') || has('cosmovisor.json') || has('guide.md') || has('ARTIFACT_LOCK'),
  };
}


const MANUAL_UPGRADES_URL = '/public/data/upgrades.json';

async function loadManualUpgrades() {
  try {
    const r = await fetch(MANUAL_UPGRADES_URL, { cache: 'no-cache' });
    if (!r.ok) return { entries: [], error: `HTTP ${r.status}` };
    const j = await r.json();
    return { entries: Array.isArray(j.entries) ? j.entries : [], updated: j.updated || '', source: j.source || '' };
  } catch (e) {
    return { entries: [], error: String(e && e.message || e) };
  }
}

/** Versions under releases/terp-core/ that publish OPERATOR.html (S3 list-type=2). */
async function listOperatorReleases() {
  try {
    const listed = await s3List({ bucketUrl: RELEASES, prefix: 'terp-core/', max: 1000 });
    const items = [];
    for (const c of listed.contents || []) {
      const m = String(c.key).match(/^terp-core\/([^/]+)\/OPERATOR\.html$/);
      if (!m) continue;
      items.push({
        version: m[1],
        operator: `${RELEASES}/${c.key}`,
        lastModified: c.lastModified || '',
      });
    }
    return { items, error: null };
  } catch (e) {
    return { items: [], error: String(e && e.message || e) };
  }
}

function mergeAnnouncements(manual, s3) {
  const by = new Map();
  for (const m of manual.entries || []) {
    if (!m || !m.version) continue;
    by.set(m.version, {
      version: m.version,
      title: m.title || m.version,
      summary: m.summary || '',
      tags: Array.isArray(m.tags) ? [...m.tags] : [],
      operator: m.operator || `${RELEASES}/terp-core/${m.version}/OPERATOR.html`,
      completed: !!m.completed,
      fromManual: true,
      fromS3: false,
      lastModified: '',
    });
  }
  for (const s of s3.items || []) {
    const cur = by.get(s.version);
    if (cur) {
      cur.fromS3 = true;
      cur.operator = cur.operator || s.operator;
      cur.lastModified = s.lastModified || cur.lastModified;
    } else {
      by.set(s.version, {
        version: s.version,
        title: s.version,
        summary: '',
        tags: [],
        operator: s.operator,
        completed: false,
        fromManual: false,
        fromS3: true,
        lastModified: s.lastModified || '',
      });
    }
  }
  return [...by.values()].sort((a, b) =>
    b.version.localeCompare(a.version, undefined, { numeric: true }),
  );
}

function tagPill(tag) {
  const t = String(tag);
  const cls = t === 'rolling-coordination' ? 'res-pill rolling-coordination' : 'res-pill';
  const label = t === 'rolling-coordination' ? 'rolling coordination' : t.replace(/-/g, ' ');
  return `<span class="${cls}">${esc(label)}</span>`;
}

/** Approximate order key from a semver-ish tag so rolling notes can sit with gov plans. */
function versionOrder(v) {
  const m = String(v || '').match(/v?(\d+)(?:\.(\d+))?(?:\.(\d+))?/);
  if (!m) return 0;
  return (Number(m[1]) || 0) * 1e9 + (Number(m[2]) || 0) * 1e6 + (Number(m[3]) || 0) * 1e3;
}

function renderRollingItem(a) {
  const rawTags = [...new Set([...(a.tags || []), 'rolling-coordination'])];
  const tags = rawTags.map(tagPill).join(' ');
  const done = a.completed ? ' <span class="res-pill applied">completed</span>' : '';
  const sum = a.summary ? `<p class="upg-summary">${esc(a.summary)}</p>` : '';
  const op = a.operator
    ? `<p class="upg-actions"><a class="snap-btn" href="${esc(a.operator)}" target="_blank" rel="noopener">Operator notes</a></p>`
    : '';
  return `<li class="upg-item" data-kind="rolling">
    <div class="upg-item-head">
      <span class="res-tag">${esc(a.title || a.version)}</span>
      ${tags}${done}
    </div>
    ${sum}
    ${op}
  </li>`;
}

function attachGovRow(list, row, packed, liveName, tip, plan) {
  const { name, p, heightN, gov: g } = row;
  const height = heightN ? String(heightN) : '';
  const matchesLive = liveName && (liveName === name || (name === 'v6' && (liveName === 'v6' || liveName === 'v6.0.0')));
  const applied = !matchesLive && heightN > 0 && tip > 0 && heightN <= tip;
  const scheduled = !matchesLive && !applied && heightN > 0;
  const pill = matchesLive
    ? ' <span class="res-pill">upcoming</span>'
    : applied
      ? ' <span class="res-pill">applied</span>'
      : scheduled
        ? ' <span class="res-pill">scheduled</span>'
        : '';
  const wrap = document.createElement('details');
  wrap.className = 'res-release';
  wrap.dataset.kind = 'governance';
  if (name === packed[0]?.name) wrap.open = true;
  wrap.innerHTML = `<summary><span class="res-tag">${esc(name)}</span> <span class="muted">height ${
    heightN ? heightN.toLocaleString() : '—'
  }</span> ${tagPill('governance')}${pill}</summary><div class="res-release-body muted">Loading…</div>`;
  list.appendChild(wrap);

  const fill = async () => {
    if (wrap.dataset.ready) return;
    const body = wrap.querySelector('.res-release-body');
    const cv = await loadJson(`${UPGRADES}/${name}/cosmovisor.json`);
    const liveInfo = matchesLive ? parsePlanInfo(plan.info) : {};
    const info = liveInfo.binaries
      ? liveInfo
      : parsePlanInfo(p.info || g?.info || '') || {};
    const binaries = info.binaries || cv?.binaries || {};
    const binRows = Object.entries(binaries)
      .map(([plat, url]) => {
        const u = String(url);
        const checksum = (u.match(/checksum=sha256:([a-fA-F0-9]{64})/) || [])[1] || '';
        const href = u.split('?')[0];
        const file = href.split('/').pop();
        return `<tr>
          <td><code>${esc(plat)}</code></td>
          <td><a href="${esc(href)}" target="_blank" rel="noopener">${esc(file)}</a></td>
          <td class="hash">${checksum ? `<code>${esc(checksum)}</code>` : ''}</td>
        </tr>`;
      })
      .join('');
    const listedFiles = await s3List({ bucketUrl: UPGRADES, prefix: `${name}/`, max: 1000 }).catch(() => ({
      contents: [],
    }));
    const fileRows = (listedFiles.contents || [])
      .filter((c) => !c.key.endsWith('/'))
      .map((c) => {
        const file = c.key.slice(`${name}/`.length);
        return `<tr>
          <td><a href="${UPGRADES}/${esc(c.key)}" target="_blank" rel="noopener">${esc(file)}</a></td>
          <td>${esc(humanSize(c.size))}</td>
          <td></td><td></td>
          <td>${esc((c.lastModified || '').replace('T', ' ').replace(/\.\d+Z$/, ' UTC'))}</td>
        </tr>`;
      })
      .join('');
    const propId = g?.proposalId || PLAN_META[name]?.proposal;
    const ghTag = PLAN_META[name]?.tag || (/^v\d+\.\d+$/.test(name) ? `${name}.0` : name === 'v6' ? 'v6.0.0' : name);
    const statusLine = applied
      ? `Applied at height <code>${esc(height)}</code>.`
      : matchesLive
        ? `The chain will halt at height <code>${esc(height)}</code> and restart as <code>${esc(liveName)}</code>.`
        : scheduled
          ? `Halt height <code>${esc(height)}</code>${PLAN_META[name]?.note ? ` (${esc(PLAN_META[name].note)})` : ''}.`
          : height
            ? `Halt height <code>${esc(height)}</code>.`
            : '';
    body.innerHTML = `
      <div class="snap-actions" style="margin:0 0 0.85rem;">
        <button type="button" class="snap-btn primary upg-guide">How to upgrade</button>
      </div>
      <p class="res-note">
        ${statusLine}
        ${propId ? `<a href="${GOV}/${esc(propId)}" target="_blank" rel="noopener">Proposal ${esc(propId)}</a> · ` : ''}
        <a href="${GH_TAG}/${esc(ghTag)}" target="_blank" rel="noopener">GitHub</a>.
      </p>
      ${
        binRows
          ? `<h4 class="res-subhead">Cosmovisor binaries</h4>
             <div class="res-table-wrap"><table class="res-table">
               <thead><tr><th>Platform</th><th>Object</th><th>SHA-256</th></tr></thead>
               <tbody>${binRows}</tbody>
             </table></div>`
          : ''
      }
      <h4 class="res-subhead">Files</h4>
      ${objectsTable(fileRows)}`;
    body.querySelector('.upg-guide')?.addEventListener('click', (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      openUpgradeGuide(name);
    });
    wrap.dataset.ready = '1';
  };
  wrap.addEventListener('toggle', () => {
    if (wrap.open) fill();
  });
  if (wrap.open) fill();
}

async function mountUpgrades(host) {
  const [plan, listed, tip, gov, manual, operators] = await Promise.all([
    currentPlan(),
    s3List({ bucketUrl: UPGRADES, prefix: '', delimiter: '/', max: 100 }).catch(() => ({ prefixes: [] })),
    liveChainHeight(),
    loadGovUpgradePlans(),
    loadManualUpgrades(),
    listOperatorReleases(),
  ]);
  const announcements = mergeAnnouncements(manual, operators);
  const liveName = String(plan.name || '');
  const fromS3 = listed.prefixes
    .map((p) => p.replace(/\/$/, ''))
    .filter((p) => p && p !== 'metadata.json' && !p.includes('.'));
  const names = new Set(fromS3);
  if (liveName) names.add(liveName);
  Object.keys(gov).forEach((n) => names.add(n));
  Object.keys(PLAN_META).forEach((n) => {
    if (fromS3.includes(n) || n === liveName || gov[n]) names.add(n);
  });

  const packed = (
    await Promise.all(
      [...names].map(async (name) => {
        const [proposal, applied, rec] = await Promise.all([
          loadJson(`${UPGRADES}/${name}/draft_proposal.json`),
          appliedPlanHeight(name),
          roomRecognized(name),
        ]);
        const p = proposalPlan(proposal || {});
        const heightN = pickHeight(name, { draft: p, live: plan, gov, applied });
        const recognized = rec.ok || !!gov[name] || liveName === name || heightN > 0;
        return { name, proposal, p, heightN, recognized, files: rec.files, gov: gov[name], applied };
      }),
    )
  ).filter((row) => row.recognized);
  packed.sort((a, b) => {
    if (a.heightN && b.heightN && a.heightN !== b.heightN) return b.heightN - a.heightN;
    if (a.heightN && !b.heightN) return -1;
    if (!a.heightN && b.heightN) return 1;
    return b.name.localeCompare(a.name, undefined, { numeric: true });
  });

  // Unified chronological stream: gov by halt height; rolling by version order next to peers.
  const maxH = packed.reduce((m, r) => Math.max(m, r.heightN || 0), 0) || 1;
  const unified = [];
  for (const row of packed) {
    unified.push({
      kind: 'governance',
      sort: row.heightN || versionOrder(row.name),
      row,
    });
  }
  for (const a of announcements) {
    const vo = versionOrder(a.version);
    const peer = packed.find((r) => versionOrder(r.name) <= vo);
    const sort = peer?.heightN ? peer.heightN + vo / 1e12 : maxH + vo;
    unified.push({ kind: 'rolling', sort, announce: a });
  }
  unified.sort((a, b) => b.sort - a.sort || String(b.row?.name || b.announce?.version || '').localeCompare(String(a.row?.name || a.announce?.version || ''), undefined, { numeric: true }));

  const s3Warn = operators.error
    ? `<p class="res-note">Live listing unavailable (${esc(operators.error)}); showing the notes kept in this site.</p>`
    : '';
  const src = manual.source || 'https://s3.terp.network/releases/terp-core/';

  host.innerHTML = `
    <article class="snap-card res-index">
      <p class="res-kicker">Upgrades</p>
      <p class="res-note">Governance halt plans and rolling operator notes in one list, newest first. Source: <a href="${esc(src)}" target="_blank" rel="noopener">s3.terp.network/releases/terp-core</a>.</p>
      ${s3Warn}
      <div class="upg-filters" role="group" aria-label="Filter upgrades">
        <button type="button" class="upg-filter is-on" data-filter="all">All</button>
        <button type="button" class="upg-filter" data-filter="governance">Governance</button>
        <button type="button" class="upg-filter" data-filter="rolling">Rolling coordination</button>
      </div>
      <div id="upg-list" class="upg-unified"></div>
    </article>`;
  const list = host.querySelector('#upg-list');
  if (!unified.length) {
    list.innerHTML = '<p class="state-status err">No upgrades found yet.</p>';
    return;
  }

  const govPacked = unified.filter((u) => u.kind === 'governance').map((u) => u.row);
  for (const item of unified) {
    if (item.kind === 'rolling') {
      const tmp = document.createElement('div');
      tmp.innerHTML = renderRollingItem(item.announce);
      const el = tmp.firstElementChild;
      if (el) list.appendChild(el);
    } else {
      attachGovRow(list, item.row, govPacked, liveName, tip, plan);
    }
  }

  const filters = host.querySelector('.upg-filters');
  filters?.addEventListener('click', (ev) => {
    const btn = ev.target.closest('.upg-filter');
    if (!btn) return;
    const f = btn.dataset.filter || 'all';
    filters.querySelectorAll('.upg-filter').forEach((b) => b.classList.toggle('is-on', b === btn));
    list.querySelectorAll('[data-kind]').forEach((el) => {
      const k = el.dataset.kind;
      el.hidden = f !== 'all' && k !== f;
    });
  });
}

async function mountReleases(host, opts = {}) {
  let prefixes = [];
  try {
    const listed = await s3List({
      bucketUrl: RELEASES,
      prefix: 'terp-core/',
      delimiter: '/',
      max: 1000,
    });
    prefixes = listed.prefixes.filter((p) => p !== 'terp-core/');
  } catch (e) {
    host.innerHTML = `<p class="state-status err">Could not list releases: ${esc(e.message || e)}</p>`;
    return;
  }

  const tags = sortTags(
    prefixes.map((p) => p.replace(/^terp-core\//, '').replace(/\/$/, '')).filter((t) => t && t !== 'commits'),
  );
  // Rooms follow the Upgrades tab: live plan is current; later tags stay unverified.
  const plan = await currentPlan();
  const planName = String(plan.name || '');
  const currentTag =
    planName === 'v6' || planName === 'v6.0.0'
      ? 'v6.0.0'
      : planName && /^v\d/.test(planName)
        ? planName.includes('.')
          ? planName
          : `${planName}.0.0`
        : 'v6.0.0';
  const featured = tags.includes(opts.selected)
    ? opts.selected
    : tags.includes(currentTag)
    ? currentTag
    : tags.find((t) => t === 'v6.0.0') || tags.find((t) => /^v\d/.test(t) && !t.includes('-dev')) || tags[0];

  host.innerHTML = `
    <article class="snap-card res-index">
      <p class="res-kicker">Releases</p>
      <h3>terpd binaries</h3>
      <p class="res-note">
        Newest version first. Open a tag, download the file for your OS.
      </p>
      <div id="rel-list"></div>
    </article>`;

  const list = host.querySelector('#rel-list');
  for (const tag of tags) {
    const prefix = `terp-core/${tag}/`;
    const wrap = document.createElement('details');
    wrap.className = 'res-release';
    wrap.dataset.tag = tag;
    const wantOpen = opts.openTag || opts.selected ? tag === (opts.openTag || opts.selected) : tag === featured;
    if (wantOpen) wrap.open = true;
    const unverified = /^v6\.[12]\.0$/.test(tag) || (tag !== featured && tagRank(tag) < tagRank(featured) && /^v\d/.test(tag) && !tag.includes('-dev'));
    const pill =
      tag === featured
        ? ' <span class="res-pill">current</span>'
        : unverified
          ? ' <span class="res-pill">unverified</span>'
          : '';
    wrap.innerHTML = `<summary><span class="res-tag">${esc(tag)}</span>${pill}</summary><div class="res-release-body muted">Loading…</div>`;
    list.appendChild(wrap);

    const fill = async () => {
      if (wrap.dataset.ready) return;
      const body = wrap.querySelector('.res-release-body');
      try {
        const catalog = await loadPrefixCatalog(prefix);
        const rows = catalog.files
          .map((f) => objectRow(f, { prefix, hashes: catalog.hashes, ipfs: catalog.ipfs }))
          .join('');
        body.innerHTML = objectsTable(rows);
        wrap.dataset.ready = '1';
      } catch (e) {
        body.innerHTML = `<p class="state-status err">${esc(e.message || e)}</p>`;
      }
    };
    wrap.addEventListener('toggle', () => {
      if (wrap.open) {
        fill();
        const next = `#releases/${tag}`;
        if (location.hash !== next) history.replaceState(null, '', next);
      }
    });
    if (wrap.open) fill();
  }

  host.__selectRelease = (tag) => {
    const el = [...list.querySelectorAll('details')].find((d) => d.dataset.tag === tag);
    if (el) el.open = true;
  };
}

export async function mountChainResource(host, kind, opts = {}) {
  if (!host) return;
  host.innerHTML = `<p class="muted">Loading…</p>`;
  if (kind === 'upgrades') return mountUpgrades(host);
  if (kind === 'releases') return mountReleases(host, opts);
  host.innerHTML = `<p class="muted">Unknown resource: ${esc(kind)}</p>`;
}
