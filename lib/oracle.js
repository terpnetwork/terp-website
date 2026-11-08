// lib/oracle.js — Price oracle page (terp.network/oracle).
//
// Reads the deployed hash-merchant oracle on Terp mainnet (morocco-1) over LCD:
//   registry   (cw-oracle-registry, code 108; migrated by Foundation DAO prop 16)
//              {latest:{market_id}}, {history:{market_id,limit}}, {config:{}}, {twap:{…}}
//   aggregator (cw-oracle-aggregator, code 89) {median:{market_id, window}}
// Observations arrive from Osmosis over Polytone (note on channel-15).
// "Refresh prices" re-reads the chain. "Refresh from source" appears only when the
// registry allows permissionless filing (open_submit) or an IBC-v2 quote path
// (ibc2_source_client). Today both are off — see alignment-log.
// No raw tx JSON is rendered.

const FEEDS = [
  { market_id: 'OSMO/USDC', symbol: 'OSMO', name: 'Osmosis', color: 'coral', pools: '1464' },
  { market_id: 'BTC/USDC', symbol: 'allBTC', name: 'Bitcoin (Osmosis allBTC)', color: 'amber', pools: '1942', scale: 100 },
  { market_id: 'ETH/USDC', symbol: 'allETH', name: 'Ether (Osmosis allETH)', color: 'purple', pools: '1948', scale: 1e12 },
  { market_id: 'ATOM/USDC', symbol: 'ATOM', name: 'Cosmos Hub', color: 'teal', pools: '1251' },
  { market_id: 'AKT/USDC', symbol: 'AKT', name: 'Akash', color: 'coral', pools: '1301' },
  { market_id: 'INJ/USDC', symbol: 'INJ', name: 'Injective', color: 'teal', pools: '1319', scale: 1e12 },
  { market_id: 'NYM/USDC', symbol: 'NYM', name: 'Nym', color: 'mint', pools: '3335' },
  { market_id: 'PHOTON/USDC', symbol: 'PHOTON', name: 'Photon (AtomOne)', color: 'amber', pools: '3220' },
  { market_id: 'JUNO/OSMO', symbol: 'JUNO', name: 'Juno', color: 'success', pools: '497', quote: 'OSMO' },
  { market_id: 'ATOMONE/OSMO', symbol: 'ATOMONE', name: 'AtomOne', color: 'purple', pools: '2960', quote: 'OSMO', thin: 'about $1.3k in the pool' },
];
const COLOR_RGB = { amber: '--tn-amber-rgb', purple: '--tn-purple-rgb', teal: '--tn-teal-rgb', mint: '--tn-mint-rgb', coral: '--tn-coral-rgb', success: '--tn-success-rgb' };
const PAGE = 10;
const MEDIAN_WINDOW = 24;
const BLOCK_SECS = 6;
const STALE_SECS = 3600;
const REFRESH_MS = 45000;
const HISTORY_LIMIT = 64;
const OSMOSIS_POOL = (id) => `https://app.osmosis.zone/pool/${id}`;

const h = (tag, attrs = {}, ...kids) => {
  const svg = tag.startsWith('svg:');
  const el = svg ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.setAttribute('class', v); else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};

function fmtUsd(v) {
  if (v == null) return '—';
  const n = Number(v); if (!isFinite(n)) return '—';
  if (n >= 1000) return '$' + n.toLocaleString('en-US', { maximumFractionDigits: 0 });
  if (n >= 1) return '$' + n.toFixed(2);
  return '$' + n.toPrecision(3);
}
function fmtNum(v) { const n = Number(v); return !isFinite(n) ? '—' : n >= 1 ? n.toLocaleString('en-US', { maximumFractionDigits: 4 }) : n.toPrecision(4); }
function fmtAge(s) { if (s == null) return 'never'; if (s < 90) return `${Math.round(s)} s ago`; if (s < 5400) return `${Math.round(s / 60)} min ago`; if (s < 172800) return `${Math.round(s / 3600)} h ago`; return `${Math.round(s / 86400)} d ago`; }
const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-6)}` : '—');
const poolIdOf = (f) => f.pool ?? null;

export function isEmptyErr(msg) { return /not found|no observations/i.test(String(msg || '')); }

async function smart(cfg, addr, msg) {
  const q = encodeURIComponent(btoa(JSON.stringify(msg)));
  const r = await fetch(`${cfg.rest}/cosmwasm/wasm/v1/contract/${addr}/smart/${q}?_=${Date.now()}`, { cache: 'no-store' });
  const j = await r.json().catch(() => ({}));
  if (r.ok) return { ok: true, data: j.data };
  if (isEmptyErr(j.message)) return { ok: true, data: null };
  throw new Error(`query ${r.status}`);
}
async function block(cfg, which) {
  try {
    const r = await fetch(`${cfg.rest}/cosmos/base/tendermint/v1beta1/blocks/${which}?_=${Date.now()}`, { cache: 'no-store' });
    const hd = (await r.json()).block?.header || {};
    const t = Date.parse(hd.time);
    return { height: Number(hd.height) || null, time: isFinite(t) ? t : null };
  } catch { return { height: null, time: null }; }
}
const blockTimes = new Map();
async function blockTime(cfg, ht) {
  if (!blockTimes.has(ht)) { const b = await block(cfg, ht); if (b.time == null) return null; blockTimes.set(ht, b.time); }
  return blockTimes.get(ht);
}

/** Permissionless source refresh is allowed when the registry races Submit, or when IBC-v2 quotes are registered (RequestQuote has no sender gate). */
export function canRefreshFromSource(reg = {}) {
  return !!(reg.open_submit || reg.ibc2_source_client);
}


// Resolve the note's actual channel, not an inferred per-observation sequence.
const noteChannels = new Map();
async function loadChannel(cfg, note) {
  if (!note) return null;
  const key = `${cfg.rest}:${note}`;
  if (noteChannels.has(key)) return noteChannels.get(key);
  try {
    const r = await fetch(`${cfg.rest}/ibc/core/channel/v1/channels?pagination.limit=1000`, { cache: 'no-store' });
    if (!r.ok) return null;
    const c = (await r.json()).channels?.find((c) => c.port_id === `wasm.${note}` && c.state === 'STATE_OPEN');
    if (c) noteChannels.set(key, c);
    return c || null;
  } catch { return null; }
}

export async function load(cfg) {
  if (!cfg.registryContract || !cfg.aggregatorContract) return { mode: 'error', feeds: [] };
  try {
    const [rc, tip, rows] = await Promise.all([
      smart(cfg, cfg.registryContract, { config: {} }),
      block(cfg, 'latest'),
      Promise.all(FEEDS.map(async (f) => {
        try {
          const [l, m] = await Promise.all([
            smart(cfg, cfg.registryContract, { latest: { market_id: f.market_id } }),
            smart(cfg, cfg.aggregatorContract, { median: { market_id: f.market_id, window: MEDIAN_WINDOW } }),
          ]);
          const obs = l.data, med = m.data;
          const sc = (v) => (v == null || !isFinite(Number(v)) ? null : Number(v) * (f.scale || 1));
          return { ...f, observation: obs, price: sc(obs?.mid), n: med?.n ?? 0, height: obs?.height ?? null, source: obs?.source ?? null, sourceChain: obs?.source_chain ?? null, pool: obs?.pool_id ?? null, mid: sc(obs?.mid), median: sc(med?.value), age: null };
        } catch {
          return { ...f, price: null, n: 0, height: null, source: null, sourceChain: null, pool: null, mid: null, median: null, age: null };
        }
      })),
    ]);
    const osmoFeed = rows.find((r) => r.market_id === 'OSMO/USDC');
    const osmo = osmoFeed?.price ?? null;
    const channel = await loadChannel(cfg, rc.data?.note || cfg.polytoneNote);
    for (const r of rows) r.channel = channel;
    for (const r of rows) if (r.quote === 'OSMO') {
      r.inOsmo = r.price; r.derived = true; r.usdPool = osmoFeed?.pool ?? null;
      for (const k of ['price', 'mid', 'median']) r[k] = r[k] == null || osmo == null ? null : r[k] * osmo;
    }
    const heights = [...new Set(rows.map((r) => r.height).filter((x) => x != null).map(Number))];
    const times = new Map(await Promise.all(heights.map(async (x) => [x, await blockTime(cfg, x)])));
    const now = Date.now();
    for (const r of rows) if (r.height != null) {
      const t = times.get(Number(r.height));
      r.updatedAt = t ?? null;
      r.age = t != null ? Math.max(0, (now - t) / 1000) : tip.height ? Math.max(0, (tip.height - Number(r.height)) * BLOCK_SECS) : null;
    }
    return { mode: 'live', registry: rc.data || {}, feeds: rows, tip: tip.height, checkedAt: now };
  } catch { return { mode: 'error', feeds: FEEDS.map((f) => ({ ...f, price: null, n: 0, age: null })) }; }
}

export async function loadHistory(cfg, feed) {
  if (!cfg.registryContract || !feed?.market_id) return [];
  try {
    const res = await smart(cfg, cfg.registryContract, { history: { market_id: feed.market_id, limit: HISTORY_LIMIT } });
    const rows = res.data?.observations || [];
    const sc = (v) => (v == null || !isFinite(Number(v)) ? null : Number(v) * (feed.scale || 1));
    let pts = rows.map((o) => ({ height: Number(o.height), mid: sc(o.mid), pool: o.pool_id ?? null })).filter((p) => p.height && p.mid != null);
    if (feed.quote === 'OSMO') {
      const osmoHist = await smart(cfg, cfg.registryContract, { history: { market_id: 'OSMO/USDC', limit: HISTORY_LIMIT } });
      const osmoPts = (osmoHist.data?.observations || []).map((o) => ({ height: Number(o.height), mid: Number(o.mid) })).filter((p) => p.height && isFinite(p.mid));
      const osmoAt = (h) => {
        let best = null;
        for (const p of osmoPts) if (p.height <= h && (!best || p.height > best.height)) best = p;
        return best?.mid ?? osmoPts[0]?.mid ?? null;
      };
      pts = pts.map((p) => { const o = osmoAt(p.height); return o == null ? null : { ...p, mid: p.mid * o }; }).filter(Boolean);
    }
    return pts.sort((a, b) => a.height - b.height);
  } catch { return []; }
}

function hexOf(name) {
  const v = getComputedStyle(document.documentElement).getPropertyValue(COLOR_RGB[name] || '--tn-teal-rgb').trim().split(/[\s,]+/).map(Number);
  return v.length >= 3 && v.every((x) => isFinite(x)) ? '#' + v.slice(0, 3).map((x) => Math.round(x).toString(16).padStart(2, '0')).join('') : '#7fe3cf';
}
function noteOf(f) { return [f.derived ? `derived: ${f.symbol}/OSMO × OSMO/USDC` : '', f.thin ? `low liquidity (${f.thin})` : ''].filter(Boolean).join(' · '); }
function srcOf(f) { const p = poolIdOf(f); return `${f.source || 'Osmosis'}${f.sourceChain ? ` (${f.sourceChain})` : ''}${p ? ` · pool ${p}` : ''}`; }
function freshOf(f) { return f.age == null ? 0 : Math.max(0, 1 - f.age / STALE_SECS); }
function syncShield(feeds, example, selected, onPick) {
  const list = feeds.map((f) => ({
    id: f.symbol, label: f.symbol, sub: fmtUsd(f.price), color: hexOf(f.color), fresh: freshOf(f), stale: f.age != null && f.age > STALE_SECS,
    name: `${f.symbol} ${fmtUsd(f.price)}${example ? ' (example)' : ''}`,
    desc: `${f.name} · ${fmtUsd(f.price)}${example ? ' (example)' : ''} · ${f.height == null ? 'no observations yet' : `${srcOf(f)} · block ${f.height}${f.n ? ` · median of ${f.n}` : ''} · ${f.age != null && f.age > STALE_SECS ? 'stale' : 'fresh'}${noteOf(f) ? ` · ${noteOf(f)}` : ''}`}`,
  }));
  let tries = 0;
  const go = () => {
    const w = window.__tnWorld;
    if (w && w.setCatalog) return w.setCatalog('/oracle', { list, selected, onPick: (id) => onPick(feeds.find((f) => f.symbol === id)) });
    if (++tries < 60) setTimeout(go, 100);
  };
  go();
}

function chartView(points, colorCss) {
  const wrap = h('div', { class: 'orc-chart', 'aria-label': 'Price history' });
  if (!points.length) {
    wrap.append(h('p', { class: 'orc-chart-empty' }, 'No history filed yet for this market.'));
    return wrap;
  }
  const W = 320, H = 96, padX = 8, padY = 10;
  const xs = points.map((p) => p.height), ys = points.map((p) => p.mid);
  let minX = Math.min(...xs), maxX = Math.max(...xs);
  const minY = Math.min(...ys), maxY = Math.max(...ys);
  // One filing: flat mid-line across the plot so the panel is not blank.
  const pts = points.length === 1
    ? [{ height: minX - 1, mid: points[0].mid }, points[0], { height: maxX + 1, mid: points[0].mid }]
    : points;
  if (points.length === 1) { minX -= 1; maxX += 1; }
  const dx = Math.max(1, maxX - minX), dy = Math.max(Math.abs(maxY - minY), Math.abs(maxY) * 0.02, 1e-12);
  const xOf = (x) => padX + ((x - minX) / dx) * (W - padX * 2);
  const yOf = (y) => H - padY - ((y - minY) / dy) * (H - padY * 2);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${xOf(p.height).toFixed(1)},${yOf(p.mid).toFixed(1)}`).join(' ');
  const area = `${d} L${xOf(pts[pts.length - 1].height).toFixed(1)},${H - padY} L${xOf(pts[0].height).toFixed(1)},${H - padY} Z`;
  const svg = h('svg:svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: String(H), role: 'img', 'aria-label': `${points.length} filings from block ${xs[0]} to ${xs[xs.length - 1]}` },
    h('svg:path', { class: 'orc-chart-area', d: area, fill: colorCss, 'fill-opacity': '0.12' }),
    h('svg:path', { class: 'orc-chart-line', d, fill: 'none', stroke: colorCss, 'stroke-width': '1.6', 'stroke-linejoin': 'round', 'stroke-linecap': 'round' }),
    ...points.map((p) => h('svg:circle', { cx: xOf(p.height), cy: yOf(p.mid), r: points.length < 3 ? 3 : 1.6, fill: colorCss })));
  wrap.append(
    svg,
    h('div', { class: 'orc-chart-axis' },
      h('span', {}, `block ${minX}`),
      h('span', {}, `${points.length} filing${points.length === 1 ? '' : 's'}`),
      h('span', {}, `block ${maxX}`)),
    h('div', { class: 'orc-chart-axis' },
      h('span', {}, fmtUsd(minY)),
      h('span', {}, 'USD'),
      h('span', {}, fmtUsd(maxY))));
  return wrap;
}

function poolLink(f, id = poolIdOf(f), pair = f.market_id) {
  if (id == null || id === '') return h('span', {}, 'No pool in observation');
  return h('a', { href: OSMOSIS_POOL(id), target: '_blank', rel: 'noopener', class: 'orc-pool-link' }, `${pair} · pool ${id} ↗`);
}

function receiptView(f) {
  const o = f.observation || {};
  const hash = o.tx_hash || o.transaction_hash || o.txhash;
  // The deployed registry currently returns no tx hash or packet sequence.
  // Never substitute a request/filing transaction for an IBC-result receipt.
  if (typeof hash === 'string' && /^[a-fA-F0-9]{64}$/.test(hash)) {
    return h('a', { class: 'orc-pool-link', href: `https://explorer.chaintools.tech/terp/tx/${hash}`, target: '_blank', rel: 'noopener', title: hash }, `${short(hash)} ↗`);
  }
  return h('span', { class: 'orc-note' }, 'Not returned by registry latest/history (no result tx hash).');
}
function packetView(f) {
  const o = f.observation || {}, c = f.channel;
  const seq = o.packet_sequence ?? o.sequence;
  const actual = o.channel_id || o.channel;
  return h('span', {},
    actual ? `${actual}` : c ? `Note route: ${c.channel_id} ↔ ${c.counterparty?.channel_id || 'unknown'}` : 'Channel not available',
    seq != null ? ` · packet sequence ${seq}` : ' · result packet sequence not returned',
    c && !actual ? h('small', { class: 'orc-note orc-subline' }, 'Configured Polytone route, not a per-result packet identifier.') : null);
}

function detailView(f, example, cfg, histPts, data) {
  if (!f) return h('p', { class: 'orc-pick' }, 'No prices yet.');
  const col = `rgb(var(${COLOR_RGB[f.color] || '--tn-teal-rgb'}))`;
  const stale = f.age != null && f.age > STALE_SECS;
  const row = (label, ...value) => h('div', {}, h('dt', {}, label), h('dd', {}, ...value));
  const recorded = f.updatedAt == null ? null : new Date(f.updatedAt).toLocaleString('en-GB', { timeZone: 'Africa/Dakar', dateStyle: 'medium', timeStyle: 'short' });
  return h('div', { class: 'orc-detail', 'aria-live': 'polite' },
    h('div', { class: 'orc-detail-head' },
      h('span', { class: 'shield-disc orc-detail-orb', 'aria-hidden': 'true', style: `--c:${col}` }),
      h('div', {}, h('h3', {}, f.symbol), h('p', {}, f.name)),
      h('strong', { class: 'orc-big orc-head-price' }, fmtUsd(f.price))),
    h('section', { class: 'orc-history', 'aria-label': 'Price history' },
      h('h4', { class: 'orc-meta-h' }, 'History · USD'), chartView(histPts || [], col)),
    h('section', { class: 'orc-metadata', 'aria-label': 'Observation details' },
      h('h4', { class: 'orc-meta-h' }, 'Observation details'),
      h('dl', { class: 'orc-meta orc-meta-compact' },
        row('Market', f.market_id),
        row('Median', f.median == null ? 'no observations yet' : `${fmtUsd(f.median)} · ${f.n} observation${f.n === 1 ? '' : 's'} / ${MEDIAN_WINDOW}-filing window`),
        f.derived ? row('USD conversion', `${fmtNum(f.inOsmo)} OSMO × OSMO/USDC`, h('small', { class: 'orc-note orc-subline' }, 'Derived USD price; source market is quoted in OSMO.')) : null,
        row('Source pool', poolLink(f), h('small', { class: 'orc-note orc-subline' }, `${f.source || 'No source'}${f.sourceChain ? ` · ${f.sourceChain}` : ''}`)),
        f.derived ? row('USD quote pool', poolLink(f, f.usdPool, 'OSMO/USDC'), h('small', { class: 'orc-note orc-subline' }, 'Converts the OSMO quote to USD; pool ID from the OSMO/USDC observation.')) : null,
        row('Recorded / updated', f.height == null ? 'no observations yet' : `Block ${f.height}${recorded ? ` · ${recorded} (Dakar UTC+0)` : ''}`,
          f.age == null ? null : h('small', { class: 'orc-subline ' + (stale ? 'orc-warn' : 'orc-note') }, `${fmtAge(f.age)} · ${stale ? 'stale (over 1 h)' : 'fresh'}`)),
        row('IBC result tx', receiptView(f)),
        row('IBC packet', packetView(f)),
        row('Chain', `morocco-1 · current block ${data.tip || 'unavailable'}`),
        row('Registry', h('a', { href: `https://explorer.chaintools.tech/terp/account/${cfg.registryContract}`, target: '_blank', rel: 'noopener', class: 'orc-pool-link', title: cfg.registryContract }, short(cfg.registryContract), ' ↗')),
        row('Update policy', canRefreshFromSource(data.registry) ? 'Permissionless source refresh' : 'Foundation relayer only'),
        f.thin ? row('Liquidity', h('span', { class: 'orc-warn' }, `Low: ${f.thin}. Treat this price with care.`)) : null)));
}

function listView(feeds, example, st = { q: '', page: 0 }) {
  const input = h('input', { class: 'orc-search', type: 'search', placeholder: 'Search asset or name', autocomplete: 'off', 'aria-label': 'Search prices', value: st.q || null });
  const tbody = h('tbody');
  const pager = h('nav', { class: 'bxl-pager', 'aria-label': 'Pages' });
  const empty = h('p', { class: 'bxl-empty', hidden: true }, 'No assets match that search.');
  const paint = () => {
    const rows = feeds.filter((f) => !st.q || `${f.symbol} ${f.name}`.toLowerCase().includes(st.q));
    const pages = Math.max(1, Math.ceil(rows.length / PAGE)); st.page = Math.min(st.page, pages - 1);
    tbody.replaceChildren(...rows.slice(st.page * PAGE, st.page * PAGE + PAGE).map((f) => {
      const id = poolIdOf(f);
      return h('tr', {},
        h('td', {}, h('span', { class: 'orc-sw', style: `--c: rgb(var(${COLOR_RGB[f.color] || '--tn-teal-rgb'}))` }), h('b', {}, f.symbol)),
        h('td', { class: 'orc-hide-n' }, f.name, noteOf(f) ? h('small', { class: 'orc-note' }, ` · ${noteOf(f)}`) : null),
        h('td', { class: 'num' }, fmtUsd(f.price), example ? h('span', { class: 'orc-example' }, 'Example') : null),
        h('td', {}, f.age == null ? 'no observations yet' : fmtAge(f.age), f.height != null ? h('small', { class: 'orc-note orc-block' }, h('br'), `block ${f.height}`) : null),
        h('td', { class: 'orc-hide-n' }, poolLink(f), f.derived ? h('small', { class: 'orc-subline' }, 'USD via ', poolLink(f, f.usdPool, 'OSMO/USDC')) : null));
    }));
    empty.hidden = rows.length > 0;
    pager.hidden = pages < 2;
    pager.replaceChildren(
      h('button', { type: 'button', class: 'plane-link secondary', disabled: st.page === 0, onclick: () => { st.page--; paint(); } }, 'Previous'),
      h('span', {}, `Page ${st.page + 1} of ${pages} · ${rows.length} ${rows.length === 1 ? 'asset' : 'assets'}`),
      h('button', { type: 'button', class: 'plane-link secondary', disabled: st.page >= pages - 1, onclick: () => { st.page++; paint(); } }, 'Next'));
  };
  input.addEventListener('input', () => { st.q = input.value.trim().toLowerCase(); st.page = 0; paint(); });
  paint();
  return h('div', { class: 'orc-list' },
    h('form', { class: 'bxl-filters orc-search-form', role: 'search', onsubmit: (e) => e.preventDefault() }, h('label', { class: 'bxl-q' }, input)),
    h('div', { class: 'res-table-wrap' }, h('table', { class: 'res-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Asset'), h('th', { class: 'orc-hide-n' }, 'Name'), h('th', { class: 'num' }, 'Price (USD)'), h('th', {}, 'Updated'), h('th', { class: 'orc-hide-n' }, 'Source'))),
      tbody)), empty, pager);
}

export async function mountOracle(root, cfg) {
  let tab = (location.hash === '#list') ? 'list' : 'shield';
  let selSym = null;
  const listSt = { q: '', page: 0 };
  let busy = false, timer = null, histCache = new Map();

  const histFor = async (f) => {
    if (!f) return [];
    if (histCache.has(f.market_id)) return histCache.get(f.market_id);
    const pts = await loadHistory(cfg, f);
    histCache.set(f.market_id, pts);
    return pts;
  };

  const render = async () => {
    if (busy) return; busy = true;
    const btn = root.querySelector('.orc-refresh');
    const hadFocus = !!btn && document.activeElement === btn;
    if (btn) { btn.disabled = true; btn.setAttribute('aria-busy', 'true'); btn.textContent = 'Refreshing…'; }
    let data;
    try { data = await load(cfg); histCache.clear(); } finally { busy = false; }
    const focusedRefresh = hadFocus;
    const focusedSearch = document.activeElement?.matches?.('#orc-pane-list input[type=search]');
    const feeds = data.feeds;
    const example = false;
    const any = feeds.some((f) => f.price != null);
    const reg = data.registry || {};
    const openRelay = canRefreshFromSource(reg);

    const state = data.mode !== 'live'
      ? h('div', { class: 'orc-state', role: 'status' }, h('span', { class: 'orc-dot' }),
          h('div', {}, h('b', {}, 'Oracle not reachable right now. '), 'Try again in a moment.'))
      : any
        ? h('div', { class: 'orc-state is-live', role: 'status' }, h('span', { class: 'orc-dot' }),
            h('div', {}, h('b', {}, 'Live. '), `Each price is the newest observation filed from Osmosis over Polytone, read straight from the chain. Checked ${new Date(data.checkedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}; refreshes every ${REFRESH_MS / 1000} s.`))
        : h('div', { class: 'orc-state orc-empty', role: 'status' }, h('span', { class: 'orc-dot' }),
            h('div', {}, h('b', {}, 'No observations yet. '), 'The oracle is live on Terp, but no price has been recorded for these markets yet. Prices will appear here once the first one lands.'));

    let sel = feeds.find((f) => f.symbol === selSym) || feeds[0];
    const detail = h('div', { role: 'tabpanel', id: 'orc-pane-shield', 'aria-labelledby': 'orc-tab-shield' });
    let detailVersion = 0;
    const paintDetail = async (f) => {
      const version = ++detailVersion;
      const pts = await histFor(f);
      if (version !== detailVersion) return;
      detail.replaceChildren(detailView(f, example, cfg, pts, data));
    };
    const onPick = (f) => { if (!f) return; sel = f; selSym = f.symbol; paintDetail(f); if (tab !== 'shield') setTab('shield'); };
    syncShield(feeds, example, sel && sel.symbol, onPick);
    paintDetail(sel);
    const panes = { shield: detail,
      list: h('div', { role: 'tabpanel', id: 'orc-pane-list', 'aria-labelledby': 'orc-tab-list' }, listView(feeds, example, listSt)) };
    const tabBtns = [['shield', 'Asset'], ['list', 'Price list']].map(([id, t]) => h('button', { type: 'button', role: 'tab', id: `orc-tab-${id}`, 'aria-controls': `orc-pane-${id}`, 'data-view': id }, t));
    const setTab = (id) => { tab = id; for (const b of tabBtns) { const on = b.dataset.view === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; } for (const [k, p] of Object.entries(panes)) p.hidden = k !== id; history.replaceState(null, '', id === 'list' ? '#list' : location.pathname); };
    tabBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.view)));
    const tabs = h('div', { class: 'bxl-tabs', role: 'tablist', 'aria-label': 'Price views', onkeydown: (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { setTab(tab === 'shield' ? 'list' : 'shield'); root.querySelector(`#orc-tab-${tab}`).focus(); } } }, tabBtns);

    const hint = h('p', { class: 'orc-hint' },
      openRelay
        ? 'Anyone can file or request a fresh observation. Refresh prices re-reads the chain; Refresh from source opens a wallet flow.'
        : 'Prices are filed by the Foundation DAO\'s approved relayer. Refreshing only re-reads the chain; there is no paid refresh, so nothing here asks you to sign.');
    const refresh = h('button', { type: 'button', class: 'orc-btn orc-refresh', 'aria-label': 'Refresh prices from the chain', onclick: () => { render(); schedule(); } }, 'Refresh prices');
    const actions = [refresh];
    if (openRelay) {
      actions.push(h('button', {
        type: 'button', class: 'orc-btn orc-ghost-btn orc-refresh-source',
        'aria-label': 'Refresh prices from the Osmosis source',
        onclick: () => {
          const reason = reg.open_submit
            ? 'open_submit is on: a Submit message with a fresh mid can be filed by anyone.'
            : 'ibc2_source_client is set: RequestQuote is open to anyone.';
          root.querySelector('.orc-hint')?.replaceChildren(document.createTextNode(`Refresh from source is available (${reason}) Wire the wallet execute in a follow-up; config change is live.`));
        },
      }, 'Refresh from source'));
    }
    root.replaceChildren(state, h('div', { class: 'bxl orc-views' }, tabs, panes.shield, panes.list), h('div', { class: 'orc-action' }, ...actions, hint));
    setTab(tab);
    if (focusedRefresh) refresh.focus();
    if (focusedSearch) { const i = panes.list.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); }
  };
  const schedule = () => { clearInterval(timer); timer = setInterval(() => { if (!document.hidden) render(); }, REFRESH_MS); };
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { render(); schedule(); } });
  await render();
  schedule();
}
