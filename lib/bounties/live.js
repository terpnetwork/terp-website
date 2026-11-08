// Live bounty list for /bounties: reads the deployed terp-bounty-escrow (code 104) on morocco-1.
//
// Why this file exists (live1): the page used to read a *proposed* bounty board (board.js: `tasks`,
// one escrow per task). That board was never deployed, so public/config.json had no board contract and
// data.js fell back to its empty state ("First bounties coming soon") while 20 bounties sat open in the
// real escrow. The escrow deployed on chain is a single contract with the query/execute shapes of
// crates/terp-rs/contracts/revenue/bounty-escrow/src/msg.rs, read here directly.
//
// Data:     LCD smart query {"bounties":{start_after,limit}} until a short page; config {} for the gates.
// Details:  <detailsBase>/<details_hash>.json (terp-bounty-details/v1). The file name is the sha256 of the
//           exact bytes, so it is checked in the browser (crypto.subtle) before it is shown.
// Actions:  every action builds the exact MsgExecuteContract for msg.rs ExecuteMsg. An address the contract
//           would accept (submit1: assignee for Submit after CanSubmit; approver/proposer for the rest) gets a
//           sign button that calls wallet.js executeContract; everyone keeps the copy-message fallback.
// Category: the details doc's `category` (data.js CATEGORIES keys); while it isn't loaded (or on a preview
//           origin the bucket refuses), the bounty_ref prefix (CAT_BY_PREFIX). The doc wins when they differ.
//
// STACK GAPS (source notes, not shown in the UI):
//  - Signing: wired through lib/wallet.js executeContract (submit.js holds the role and stake gates). The old
//    dev signer (escrow-signer.js) is limited to dev chains and is not used.
//  - Details CORS: the static bucket answers with Access-Control-Allow-Origin: https://terp.network only, so
//    previews on other origins (local, staging) can't read the brief; the dialog says so and links the file.
//  - details_cid is null on every bounty today, so IPFS gateways are not tried; the hash file is the only source.
//  - Submit needs the work document stored under its CID first. There is no upload path yet (DEV NOTE in
//    submit.js, DEV NOTES block at the end of howto.js); the builder seals the document and hands it over as a
//    download, then takes the CID once the user has pinned it.
//  - The nine-light category shield (shield.js) is drawn in live mode from these bounties (main.js liveShield).
//  - Applications are off chain in this contract: "work on this" means asking the approver to send assign.

import { formatMicro } from '/lib/amount.js?v=2cb261fcfb-r2';   // amount1: exact half-up base-unit formatting
import { CAT_BY_KEY } from '/lib/bounties/data.js?v=eeb0c09c37';
import * as SB from '/lib/bounties/submit.js?v=4a2d047454';
const TERP_DECIMALS = 6;
const PAGE_CHAIN = 30;     // per LCD request; the loop follows start_after
const PAGE_UI = 8;         // rows per page in the list
export const STATUSES = ['pending', 'open', 'assigned', 'submitted', 'accepted', 'paid', 'cancelled', 'refunded', 'expired'];
const STATUS_TEXT = { pending: 'Pending', open: 'Open', assigned: 'Assigned', submitted: 'In review', accepted: 'Accepted', paid: 'Paid', cancelled: 'Cancelled', refunded: 'Refunded', expired: 'Expired' };
const AREA = { OPS: 'Chain ops', LIQ: 'Liquidity', IBC: 'IBC', COM: 'Community', PLT: 'Platform', QA: 'QA', CAN: 'Cannabis', DOC: 'Docs', CNT: 'Content', SEC: 'Security' };
const WASM_EXECUTE = '/cosmwasm.wasm.v1.MsgExecuteContract';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const b64 = (s) => btoa(unescape(encodeURIComponent(s)));
export const prefixOf = (ref) => (String(ref || '').match(/^TB-([A-Z]+)-/) || [])[1] || 'OTHER';
export const areaName = (p) => AREA[p] || p;
/** bounty_ref prefix -> shield category, used until the details doc names one. */
export const CAT_BY_PREFIX = { OPS: 'ops', SEC: 'ops', LIQ: 'liquidity', IBC: 'ibc', COM: 'community', CAN: 'community', PLT: 'apps', QA: 'protocol', DOC: 'docs', CNT: 'docs' };
const docCat = new Map();   // details_hash -> category key from the doc
export function catKeyOf(b) {
  const d = docCat.get(b.details_hash);
  if (d && CAT_BY_KEY[d]) return d;
  return CAT_BY_PREFIX[prefixOf(b.bounty_ref)] || 'ops';
}

/** micro amount string -> "1,234.57": exact BigInt math, half-up at 2 decimals (lib/amount.js). */
export const terp = (micro) => (/^\d+$/.test(String(micro ?? '0')) ? formatMicro(micro, TERP_DECIMALS, 2) : '—');
const nsToDate = (ns) => (ns ? new Date(Number(BigInt(ns) / 1000000n)) : null);
const utc = (d) => (d ? d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '');
/** "in 62 days" / "3 hours ago" */
export function rel(d, now = Date.now()) {
  if (!d) return '—';
  const s = Math.round((d.getTime() - now) / 1000), a = Math.abs(s);
  const [n, u] = a < 90 ? [a, 'second'] : a < 5400 ? [Math.round(a / 60), 'minute'] : a < 129600 ? [Math.round(a / 3600), 'hour'] : [Math.round(a / 86400), 'day'];
  const t = `${n} ${u}${n === 1 ? '' : 's'}`;
  return s >= 0 ? `in ${t}` : `${t} ago`;
}
const timeEl = (d, lead = '') => (d ? `<time datetime="${d.toISOString()}" title="${utc(d)}">${lead}${rel(d)}</time>` : '—');
const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-6)}` : '—');

// ── chain reads ─────────────────────────────────────────────────────────────────────────────────────────
export async function smart(rest, contract, msg, ms = 10000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`${rest.replace(/\/+$/, '')}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodeURIComponent(b64(JSON.stringify(msg)))}`, { credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok || !j || !('data' in j)) throw new Error((j && j.message) || 'HTTP ' + r.status);
    return j.data;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'the network took too long to answer' : e.message); }
  finally { clearTimeout(t); }
}
export async function readAll(rest, contract, max = 2000) {
  const out = [];
  let after = null;
  while (out.length < max) {
    const r = await smart(rest, contract, { bounties: { ...(after != null ? { start_after: after } : {}), limit: PAGE_CHAIN } });
    const rows = (r && r.bounties) || [];
    out.push(...rows);
    if (rows.length < PAGE_CHAIN) break;
    after = rows[rows.length - 1].id;
  }
  return out;
}

const docCache = new Map();
/** Fetch the details file and check its sha256 against the name. */
export async function loadDetails(base, hash) {
  if (!/^[0-9a-f]{64}$/.test(hash || '')) throw Object.assign(new Error('no details hash'), { code: 'nohash' });
  if (docCache.has(hash)) return docCache.get(hash);
  const url = `${base.replace(/\/+$/, '')}/${hash}.json`;
  let buf;
  try {
    const r = await fetch(url, { credentials: 'omit', cache: 'force-cache' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    buf = await r.arrayBuffer();
  } catch (e) { throw Object.assign(new Error(e.message), { code: 'fetch', url }); }
  let verified = null;
  if (globalThis.crypto && crypto.subtle) {
    const h = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buf))].map((x) => x.toString(16).padStart(2, '0')).join('');
    if (h !== hash) throw Object.assign(new Error('the file does not match its hash'), { code: 'hash', url });
    verified = true;
  }
  const doc = JSON.parse(new TextDecoder().decode(buf));
  const out = { doc, url, verified };
  docCache.set(hash, out);
  if (doc && typeof doc.category === 'string') docCat.set(hash, doc.category);
  return out;
}

// ── messages (msg.rs ExecuteMsg, snake_case) ────────────────────────────────────────────────────────────
export function execMsg(sender, contract, msg, funds = []) {
  return { typeUrl: WASM_EXECUTE, value: { sender, contract, msg, funds } };
}
const ACTIONS = {
  // key: [label, who may send, statuses, build(b, f)]
  assign:   ['Assign a worker', 'proposer or approver', ['open'], (b, f) => ({ assign: { id: b.id, assignee: f.assignee } })],
  submit:   ['Hand in work', 'the assigned worker', ['assigned'], (b, f) => ({ submit: { id: b.id, submission_hash: f.submission_hash, cid: f.cid } })],
  unassign: ['Put back on the board', 'proposer or approver', ['assigned'], (b) => ({ unassign: { id: b.id } })],
  request_changes: ['Ask for changes', 'proposer or approver', ['submitted'], (b, f) => ({ request_changes: { id: b.id, reason: f.reason || null } })],
  accept:   ['Accept the work', 'approver', ['submitted'], (b) => ({ accept: { id: b.id } })],
  payout:   ['Pay the worker', 'approver', ['accepted'], (b) => ({ payout: { id: b.id, amount: null } })],
  approve:  ['List it', 'approver', ['pending'], (b) => ({ approve: { id: b.id } })],
  reject:   ['Turn it down', 'approver', ['pending'], (b, f) => ({ reject: { id: b.id, reason: f.reason || null } })],
  cancel:   ['Cancel and refund', 'proposer (or approver)', ['pending', 'open', 'assigned'], (b) => ({ cancel: { id: b.id } })],
  expire:   ['Close after the deadline', 'anyone', ['pending', 'open', 'assigned'], (b) => ({ expire: { id: b.id } })],
};
export function actionsFor(b) { return Object.entries(ACTIONS).filter(([, a]) => a[2].includes(b.status)).map(([k, a]) => ({ key: k, label: a[0], who: a[1] })); }
export function buildAction(key, b, contract, sender, f = {}) {
  const a = ACTIONS[key];
  if (!a) throw new Error('unknown action ' + key);
  return execMsg(sender || '(your address)', contract, a[3](b, f));
}

// ── view ────────────────────────────────────────────────────────────────────────────────────────────────
/** Row skeleton: same inner structure as a real row (nbsp lines), so heights match and nothing jumps. */
const GHOST = `<li class="bxl-row is-ghost" aria-hidden="true"><span class="bxl-open"><span class="bxl-ref">&nbsp;</span><span class="bxl-title">&nbsp;</span><span class="bxl-summary">&nbsp;</span><span class="bxl-meta"><span class="bxl-status">&nbsp;</span></span><span class="bxl-reward">&nbsp;</span></span></li>`;
/** The live view's markup. pages/bounties.html carries the same string as static HTML (the skeleton seen during the
 *  orb transition), so mounting swaps nothing in and out: it fills the skeleton in place. */
export function liveTemplate() {
  return `
    <div class="bxl-tabs" role="tablist" aria-label="Bounty views">
      <button type="button" role="tab" id="bxl-tab-list" data-view="list" aria-selected="true" aria-controls="bxl-pane-list">Bounties</button>
      <button type="button" role="tab" id="bxl-tab-feed" data-view="feed" aria-selected="false" aria-controls="bxl-pane-feed" tabindex="-1">Submissions</button>
      <button type="button" role="tab" id="bxl-tab-desk" data-view="desk" aria-selected="false" aria-controls="bxl-pane-desk" tabindex="-1">Review desk</button>
    </div>
    <div class="bxl-sum" id="bxl-sum" role="status" aria-live="polite"><span class="bxl-spin" aria-hidden="true"></span>Reading the bounty escrow…</div>
    <div role="tabpanel" id="bxl-pane-list" aria-labelledby="bxl-tab-list">
      <form class="bxl-filters" id="bxl-filters" role="search" aria-label="Filter bounties">
        <div class="bxl-seg" role="group" aria-label="Status" id="bxl-status"></div>
        <label class="bxl-q"><span class="bxl-sr">Search</span><input type="search" id="bxl-q" placeholder="Search title, ref or summary" autocomplete="off"></label>
        <div class="bxl-areas" role="group" aria-label="Category" id="bxl-areas"></div>
        <p class="bxl-catbar" id="bxl-cat" aria-live="polite" hidden></p>
      </form>
      <ol class="bxl-list" id="bxl-list" aria-label="Bounty list">${GHOST.repeat(PAGE_UI)}</ol>
      <nav class="bxl-pager" id="bxl-pager" aria-label="Pages" hidden></nav>
    </div>
    <div role="tabpanel" id="bxl-pane-feed" aria-labelledby="bxl-tab-feed" hidden></div>
    <div role="tabpanel" id="bxl-pane-desk" aria-labelledby="bxl-tab-desk" hidden></div>`;
}
const FIRST_PAINT_WAIT = 1400;   // ms: wait this long for the briefs so chips, rows and the shield agree on first paint

// ── view ────────────────────────────────────────────────────────────────────────────────────────────────
export async function mountLive(root, live) {
  let host = root.querySelector('#bx-live');
  if (!host) {
    host = document.createElement('section'); host.id = 'bx-live';
    host.className = 'bxl is-skel'; host.setAttribute('aria-busy', 'true'); host.setAttribute('aria-label', 'Bounties');
    host.innerHTML = liveTemplate(); root.append(host);
  }
  const $ = (s) => host.querySelector(s);
  const dlg = makeDialog(root, live);

  const st = { all: [], cfg: null, status: 'open', cat: null, q: '', page: 0, docs: 0 };
  const subs = new Set();
  const changed = () => subs.forEach((f) => { try { f(); } catch { /* ignore */ } });
  async function load() {
    $('#bxl-sum').innerHTML = '<span class="bxl-spin" aria-hidden="true"></span>Reading the bounty escrow…';
    $('#bxl-sum').className = 'bxl-sum';
    if (!host.classList.contains('is-skel')) $('#bxl-list').innerHTML = GHOST.repeat(PAGE_UI);
    try {
      const [rows, cfg] = await Promise.all([readAll(live.rest, live.escrow), smart(live.rest, live.escrow, { config: {} }).catch(() => null)]);
      st.all = rows; st.cfg = cfg; live.cfg = cfg;
      if (!rows.some((b) => b.status === st.status)) st.status = 'all';
      api.docsReady = st.all.length ? loadDocs() : Promise.resolve();
      await Promise.race([api.docsReady, new Promise((r) => setTimeout(r, FIRST_PAINT_WAIT))]);
      root.dataset.loaded = 'live';
      paintFilters(); paint(); ready(); changed();
    } catch (e) {
      root.dataset.loaded = 'error';
      $('#bxl-sum').className = 'bxl-sum is-err';
      $('#bxl-sum').innerHTML = `Couldn’t read the bounties right now (${esc(e.message)}). <button type="button" class="plane-link secondary" id="bxl-retry">Try again</button>`;
      $('#bxl-list').replaceChildren(); ready();
      $('#bxl-retry').addEventListener('click', load);
    }
  }
  const matches = (b, ignore) => (ignore === 'status' || st.status === 'all' || b.status === st.status)
    && (ignore === 'cat' || !st.cat || catKeyOf(b) === st.cat)
    && (!st.q || `${b.bounty_ref} ${b.title} ${b.summary}`.toLowerCase().includes(st.q));
  function paintFilters() {
    $('#bxl-filters').hidden = false;
    const cc = st.cat && CAT_BY_KEY[st.cat];
    $('#bxl-cat').hidden = !cc;
    if (cc) $('#bxl-cat').innerHTML = `<span>Showing <b>${esc(cc.name)}</b></span><button type="button" class="plane-link secondary" data-cat-clear>Show every category</button>`;
    const sc = {}; st.all.forEach((b) => { if (matches(b, 'status')) sc[b.status] = (sc[b.status] || 0) + 1; });
    const sOpts = ['all', ...STATUSES.filter((s) => sc[s] || s === 'open')];
    $('#bxl-status').innerHTML = sOpts.map((s) => `<button type="button" data-status="${s}" aria-pressed="${st.status === s}">${s === 'all' ? 'All' : STATUS_TEXT[s]}<span class="bxl-n">${s === 'all' ? Object.values(sc).reduce((a, n) => a + n, 0) : sc[s] || 0}</span></button>`).join('');
    // r3: one taxonomy. These chips are the shield's nine categories (data.js CATEGORIES), counted the same way.
    const cc2 = {}; st.all.forEach((b) => { if (matches(b, 'cat')) { const k = catKeyOf(b); cc2[k] = (cc2[k] || 0) + 1; } });
    const keys = Object.keys(CAT_BY_KEY).filter((k) => st.all.some((b) => catKeyOf(b) === k));
    $('#bxl-areas').innerHTML = `<button type="button" data-catk="" aria-pressed="${!st.cat}">All categories</button>` +
      keys.map((k) => `<button type="button" data-catk="${k}" aria-pressed="${st.cat === k}" title="${esc(CAT_BY_KEY[k].name)}"><i class="bxl-sw" style="--sw:${esc(CAT_BY_KEY[k].color)}" aria-hidden="true"></i>${esc(CAT_BY_KEY[k].short || CAT_BY_KEY[k].name)}<span class="bxl-n">${cc2[k] || 0}</span></button>`).join('');
  }
  function paint() {
    const rows = st.all.filter((b) => matches(b));
    const open = st.all.filter((b) => b.status === 'open');
    const locked = st.all.reduce((s, b) => s + BigInt(b.reward.denom === 'uterp' ? b.reward.amount : 0) - BigInt(b.paid || 0) - BigInt(b.refunded || 0), 0n);
    $('#bxl-sum').className = 'bxl-sum';
    $('#bxl-sum').innerHTML = `<span class="bxl-big">${open.length}</span> open of ${st.all.length} · <span class="bxl-big">${terp(locked)}</span> TERP held in escrow`;
    const pages = Math.max(1, Math.ceil(rows.length / PAGE_UI));
    st.page = Math.min(st.page, pages - 1);
    const slice = rows.slice(st.page * PAGE_UI, st.page * PAGE_UI + PAGE_UI);
    const list = $('#bxl-list');
    if (!rows.length) {
      list.innerHTML = `<li class="bxl-empty">${st.all.length ? 'No bounties match these filters.' : 'No bounties yet.'}${st.all.length ? ' <button type="button" class="plane-link secondary" data-reset>Show all</button>' : ''}</li>`;
    } else {
      list.innerHTML = slice.map((b) => {
        const exp = nsToDate(b.expires_at), cr = nsToDate(b.created_at), ck = CAT_BY_KEY[catKeyOf(b)] || {};
        return `<li class="bxl-row" data-id="${b.id}">
          <button type="button" class="bxl-open" data-open="${b.id}" aria-haspopup="dialog">
            <span class="bxl-ref">${esc(b.bounty_ref)}<span class="bxl-area">${esc(ck.short || ck.name || '')}</span></span>
            <span class="bxl-title">${esc(b.title)}</span>
            <span class="bxl-summary">${esc(b.summary)}</span>
            <span class="bxl-meta">
              <span class="bxl-status is-${esc(b.status)}">${STATUS_TEXT[b.status] || esc(b.status)}</span>
              <span>Closes ${timeEl(exp)}</span>
              <span>Posted ${timeEl(cr)}</span>
              <span>${b.submission_count} ${b.submission_count === 1 ? 'submission' : 'submissions'}</span>
              ${b.assignee ? `<span>Assigned to <code title="${esc(b.assignee)}">${short(b.assignee)}</code></span>` : ''}
            </span>
            <span class="bxl-reward"><b>${terp(b.reward.amount)}</b> ${b.reward.denom === 'uterp' ? 'TERP' : esc(b.reward.denom)}</span>
          </button></li>`;
      }).join('');
    }
    const pager = $('#bxl-pager');
    pager.hidden = pages < 2;
    pager.innerHTML = `<button type="button" class="plane-link secondary" data-page="-1" ${st.page ? '' : 'disabled'}>Previous</button>
      <span>Page ${st.page + 1} of ${pages} · ${rows.length} ${rows.length === 1 ? 'bounty' : 'bounties'}</span>
      <button type="button" class="plane-link secondary" data-page="1" ${st.page < pages - 1 ? '' : 'disabled'}>Next</button>`;
    window.__bxLive = { total: st.all.length, shown: rows.length, onPage: slice.length, page: st.page, pages, status: st.status, cat: st.cat, docs: st.docs };
  }
  host.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.dataset.status) { st.status = t.dataset.status; st.page = 0; paintFilters(); paint(); changed(); }
    else if (t.dataset.catk != null) { const k = t.dataset.catk || null; api.onCat(k === st.cat ? null : k); }
    else if (t.dataset.view) setView(t.dataset.view);
    else if (t.dataset.page) { st.page += Number(t.dataset.page); paint(); $('#bxl-list').scrollIntoView({ block: 'nearest' }); }
    else if (t.hasAttribute('data-reset')) { st.status = 'all'; st.q = ''; $('#bxl-q').value = ''; paintFilters(); paint(); if (st.cat) api.onCat(null); else changed(); }
    else if (t.hasAttribute('data-cat-clear')) api.onCat(null);
    else if (t.dataset.open) { const b = st.all.find((x) => String(x.id) === t.dataset.open); if (b) dlg.open(b, t); }
  });
  $('#bxl-filters').addEventListener('submit', (e) => e.preventDefault());
  $('#bxl-q').addEventListener('input', (e) => { st.q = e.target.value.trim().toLowerCase(); st.page = 0; paintFilters(); paint(); changed(); });
  // Read every brief once (in the background, a few at a time) so the category comes from the doc.
  async function loadDocs() {
    const todo = st.all.filter((b) => /^[0-9a-f]{64}$/.test(b.details_hash || ''));
    let i = 0;
    await Promise.all(Array.from({ length: 5 }, async () => { while (i < todo.length) { const b = todo[i++]; try { const r = await loadDetails(live.detailsBase, b.details_hash); if (r && r.doc) b.__doc = r.doc; st.docs++; } catch { /* prefix fallback */ } } }));
    paintFilters(); paint(); changed();
  }
  function ready() {
    if (!host.classList.contains('is-skel')) return;
    host.classList.remove('is-skel'); host.removeAttribute('aria-busy');
    host.classList.add('is-ready');   // CSS fades the filled rows in (none under prefers-reduced-motion)
  }
  // Tabs: Bounties | Submissions (public, no wallet) | Review desk (approver / FIAB). ?view= keeps the choice.
  const views = { list: null, feed: null, desk: null };
  async function setView(v, push = true) {
    if (!(v in views)) v = 'list';
    host.querySelectorAll('[role=tab]').forEach((t) => { const on = t.dataset.view === v; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    for (const k of Object.keys(views)) $('#bxl-pane-' + k).hidden = k !== v;
    $('#bxl-sum').hidden = v !== 'list';
    host.dataset.view = v;
    if (push) { const u = new URL(location.href); if (v === 'list') u.searchParams.delete('view'); else u.searchParams.set('view', v); history.replaceState(history.state, '', u); }
    if (v === 'feed' && !views.feed) { views.feed = true; const F = await import('/lib/bounties/feed.js?v=d1e46d9d84'); views.feed = await F.mountFeed($('#bxl-pane-feed'), { live, bounties: () => st.all, smart }); }
    else if (v === 'feed' && views.feed && views.feed.refresh) views.feed.refresh();
    if (v === 'desk' && !views.desk) { views.desk = true; const D = await import('/lib/bounties/desk.js?v=33e144c262'); views.desk = await D.mountDesk($('#bxl-pane-desk'), { live, bounties: () => st.all, smart, reload: load }); }
  }
  host.querySelector('[role=tablist]').addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
    const tabs = [...host.querySelectorAll('[role=tab]')], i = tabs.indexOf(document.activeElement); if (i < 0) return;
    const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); setView(n.dataset.view);
  });
  const api = {
    reload: load, state: st, setView,
    docsReady: Promise.resolve(),
    /** category filter driven by the shield (main.js); null clears it */
    setCat(key) { const k = key && CAT_BY_KEY[key] ? key : null; if (k === st.cat) return; st.cat = k; st.page = 0; paintFilters(); paint(); changed(); },
    onCat: (k) => api.setCat(k),     // main.js replaces this to keep the URL hash and the shield in step
    onChange(f) { subs.add(f); return () => subs.delete(f); },
    /** true when b passes every filter except the category (the shield dims the rest) */
    matchIgnoringCat: (b) => matches(b, 'cat'),
    open(ref, from) { const b = st.all.find((x) => x.bounty_ref === ref || String(x.id) === String(ref)); if (b) dlg.open(b, from); return !!b; },
    catKeyOf,
  };
  await load();
  const v0 = new URLSearchParams(location.search).get('view'); if (v0 && v0 !== 'list') setView(v0, false);
  const want = new URLSearchParams(location.search).get('bounty');
  const hit = want && st.all.find((b) => b.bounty_ref === want || String(b.id) === want);
  if (hit) dlg.open(hit);
  return api;
}

function makeDialog(root, live) {
  const d = document.createElement('dialog');
  d.className = 'bx3-dlg bxl-dlg';
  d.id = 'bxl-dlg';
  d.setAttribute('aria-labelledby', 'bxl-dlg-t');
  root.append(d);
  let opener = null, cur = null;
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });
  d.addEventListener('close', () => {
    try { const u = new URL(location.href); u.searchParams.delete('bounty'); history.replaceState(history.state, '', u.href); } catch { /* ignore */ }
    opener?.focus({ preventScroll: true }); opener = null;
  });

  async function sender() {
    try { const { sessionAccount } = await import('/lib/bounties/chain.js?v=30c45273bf'); const s = await sessionAccount(); return s && s.address; } catch { return null; }
  }

  function open(b, from) {
    cur = b; opener = from || null;
    const exp = nsToDate(b.expires_at), cr = nsToDate(b.created_at), up = nsToDate(b.updated_at);
    const den = b.reward.denom === 'uterp' ? 'TERP' : esc(b.reward.denom);
    const acts = actionsFor(b);
    d.innerHTML = `<div class="bx3-dlg-head"><h2 id="bxl-dlg-t"><span class="bxl-ref">${esc(b.bounty_ref)}</span> ${esc(b.title)}</h2><button type="button" class="bx3-x" aria-label="Close">×</button></div>
      <div class="bxl-dlg-body">
        <div class="bxl-hero">
          <div><span class="bxl-k">Reward</span><span class="bxl-v bxl-big">${terp(b.reward.amount)} ${den}</span></div>
          <div><span class="bxl-k">Status</span><span class="bxl-v"><span class="bxl-status is-${esc(b.status)}">${STATUS_TEXT[b.status] || esc(b.status)}</span></span></div>
          <div><span class="bxl-k">Closes</span><span class="bxl-v">${timeEl(exp)}</span></div>
        </div>
        <section class="bxl-brief" id="bxl-brief" aria-live="polite"><p class="bxl-summary-full">${esc(b.summary)}</p><p class="bxl-dim"><span class="bxl-spin" aria-hidden="true"></span>Loading the full brief…</p></section>
        <section class="bxl-act" aria-labelledby="bxl-act-h">
          <h3 id="bxl-act-h">Take part</h3>
          ${b.status === 'open' ? `<p>Want this job? One worker is picked per bounty. Send the approver a short plan; if it fits, they assign the bounty to your address.</p>` : ''}
          <div class="bxs-wallet" id="bxs-wallet" aria-live="polite"></div>
          <div class="bxs-mine" id="bxs-mine"></div>
          <div class="bxs-hand" id="bxs-hand">
            <div class="bxs-gate" id="bxs-gate" aria-live="polite"></div>
            ${['open', 'assigned', 'submitted'].includes(b.status) ? `<button type="button" class="plane-link secondary" id="bxs-build-open" aria-expanded="false" aria-controls="bxs-builder">Build a submission</button>
            <div class="bxs-builder" id="bxs-builder" hidden></div>` : ''}
          </div>
          ${acts.length ? `<details class="bxs-copy" id="bxs-copy"><summary>Sign somewhere else</summary>
          <div class="bxl-act-row"><label class="bx3-field"><span class="bx3-lbl">Message</span><select id="bxl-act">${acts.map((a) => `<option value="${a.key}">${esc(a.label)} (${esc(a.who)})</option>`).join('')}</select></label></div>
          <div id="bxl-act-fields"></div>
          <pre class="bxl-msg" id="bxl-msg" tabindex="0" aria-label="Message to sign"></pre>
          <p class="bxl-dim">Copy this into your wallet or the terpd CLI to sign it.</p>
          <button type="button" class="plane-link secondary" id="bxl-copy">Copy message</button></details>` : '<p class="bxl-dim">Nothing left to do on this bounty.</p>'}
        </section>
        <section class="bxs-subs-sec" id="bxs-subs" aria-labelledby="bxs-sub-h"></section>
        <details class="bxl-raw"><summary>On-chain record</summary>
          <dl class="bxl-dl">
            <dt>Escrow id</dt><dd>${b.id}</dd>
            <dt>Reference</dt><dd>${esc(b.bounty_ref)}</dd>
            <dt>Reward</dt><dd>${terp(b.reward.amount)} ${den} <span class="bxl-dim">(${esc(b.reward.amount)} ${esc(b.reward.denom)})</span></dd>
            <dt>Paid</dt><dd>${terp(b.paid)} ${den}</dd>
            <dt>Refunded</dt><dd>${terp(b.refunded)} ${den}</dd>
            <dt>Proposer</dt><dd><code>${esc(b.proposer)}</code></dd>
            <dt>Assignee</dt><dd>${b.assignee ? `<code>${esc(b.assignee)}</code>` : 'Nobody yet'}</dd>
            <dt>Posted</dt><dd>${timeEl(cr)} <span class="bxl-dim">at block ${Number(b.created_height).toLocaleString('en-US')}</span></dd>
            <dt>Closes</dt><dd>${timeEl(exp)}</dd>
            <dt>Last change</dt><dd>${timeEl(up)}</dd>
            <dt>Submissions</dt><dd>${b.submission_count}</dd>
            <dt>Brief hash</dt><dd><code class="bxl-wrap">${esc(b.details_hash)}</code></dd>
            <dt>Brief CID</dt><dd>${b.details_cid ? `<code class="bxl-wrap">${esc(b.details_cid)}</code>` : 'None'}</dd>
            <dt>Rules version</dt><dd><code class="bxl-wrap">${esc(b.params_version)}</code></dd>
          </dl>
        </details>
      </div>`;
    d.querySelector('.bx3-x').addEventListener('click', () => d.close());
    if (!d.open) { d.parentNode.append(d); d.showModal(); }
    d.scrollTop = 0;
    try { const u = new URL(location.href); u.searchParams.set('bounty', b.bounty_ref); history.replaceState(history.state, '', u.href); } catch { /* ignore */ }
    wireActions(b);
    wireSign(b);
    loadBrief(b);
    SB.paintSubmissions(d.querySelector('#bxs-subs'), b, live, smart, () => cur === b);
  }

  // submit1: role-gated signing in place (wallet.js executeContract), the builder, and the CanSubmit gate.
  let briefDoc = null;
  async function wireSign(b) {
    const W = await SB.walletApi();
    if (cur !== b) return;
    const chainCfg = live.chainCfg ? { ...live.chainCfg, chainId: live.chainId } : null;
    const walletEl = d.querySelector('#bxs-wallet'), mine = d.querySelector('#bxs-mine'), gate = d.querySelector('#bxs-gate');
    const bo = d.querySelector('#bxs-build-open'), bh = d.querySelector('#bxs-builder');
    let me = SB.myAddress(W), sealed = null, builder = null, canSubmit = null, picked = null;
    const roles = () => SB.rolesOf(me, b, live.cfg);
    async function paintWallet() {
      walletEl.innerHTML = me
        ? `<span class="bxl-dim">Signing as <code title="${esc(me)}">${short(me)}</code>${roles().approver ? ' · approver' : roles().assignee ? ' · assigned worker' : ''}</span>`
        : `<span class="bxl-dim">No wallet connected.</span> <button type="button" class="plane-link" data-connect>Connect wallet</button>`;
    }
    async function refreshGate() {
      gate.dataset.state = '';
      const block = SB.submitBlock(b, me);
      if (block) { gate.dataset.state = block.code; gate.innerHTML = b.status === 'open' && !me ? '' : `<p class="bxs-why">${esc(block.text)}</p>${block.code === 'nowallet' && b.status === 'assigned' ? '<button type="button" class="plane-link" data-connect>Connect wallet</button>' : ''}`; return; }
      gate.innerHTML = '<p class="bxl-dim"><span class="bxl-spin" aria-hidden="true"></span>Checking your stake…</p>';
      try { canSubmit = await smart(live.rest, live.escrow, { can_submit: { address: me } }); } catch { canSubmit = null; }
      if (cur !== b) return;
      const sb = SB.stakeBlock(canSubmit);
      gate.dataset.state = sb ? 'stake' : 'eligible';
      gate.innerHTML = sb ? `<p class="bxs-why">${esc(sb)}</p>` : `<p class="bxl-dim">You can hand in work: ${terp(canSubmit.staked)} TERP staked.</p>`;
      paintMine();
    }
    function paintMine() {
      const list = SB.signableFor(b, roles());
      if (!me || !list.length) { mine.innerHTML = ''; return; }
      mine.innerHTML = `<div class="bxs-acts" role="group" aria-label="What you can sign">${list.map((a) => {
        const off = a.key === 'submit' && !(canSubmit && canSubmit.eligible && sealed);
        return `<button type="button" class="plane-link${picked === a.key ? '' : ' secondary'}" data-sign="${a.key}" aria-pressed="${picked === a.key}"${off ? ' disabled' : ''}>${esc(a.label)}</button>`; }).join('')}</div>
        ${list.some((a) => a.key === 'submit') && !sealed ? '<p class="bxl-dim">Build the submission and add its CID first.</p>' : ''}
        <div class="bxs-signpanel" id="bxs-signpanel"></div>`;
      if (picked) paintPanel();
    }
    function bodyFor(k, f) {
      if (k === 'submit') return { submit: { id: b.id, submission_hash: sealed.hash, cid: sealed.cid } };
      return buildAction(k, b, live.escrow, me, f).value.msg;
    }
    function paintPanel() {
      const p = d.querySelector('#bxs-signpanel'); if (!p) return;
      const k = picked, f = p._f || (p._f = {});
      const field = k === 'assign' ? `<label class="bx3-field"><span class="bx3-lbl">Worker address</span><input id="bxs-f-assignee" value="${esc(f.assignee || '')}" placeholder="terp1…" spellcheck="false"></label>`
        : (k === 'request_changes' || k === 'reject') ? `<label class="bx3-field"><span class="bx3-lbl">Reason (optional)</span><input id="bxs-f-reason" value="${esc(f.reason || '')}"></label>` : '';
      p.innerHTML = `${field}<pre class="bxl-msg" id="bxs-exec" tabindex="0" aria-label="Message your wallet will sign"></pre>
        <div class="bxs-row"><button type="button" class="plane-link" id="bxs-send">Sign with wallet</button><span class="bxl-dim">Your wallet shows the message and asks before anything is sent.</span></div>
        <p class="bxs-result" id="bxs-result" aria-live="polite"></p>`;
      const show = () => { const ok = k !== 'assign' || /^terp1[0-9a-z]{38,}$/.test(f.assignee || ''); p.querySelector('#bxs-exec').textContent = JSON.stringify(bodyFor(k, { ...f, assignee: f.assignee || '(worker address)' }), null, 2); p.querySelector('#bxs-send').disabled = !ok; };
      p.querySelectorAll('input').forEach((i) => i.addEventListener('input', () => { f.assignee = (p.querySelector('#bxs-f-assignee') || {}).value?.trim(); f.reason = (p.querySelector('#bxs-f-reason') || {}).value; show(); }));
      show();
      p.querySelector('#bxs-send').addEventListener('click', async (e) => {
        const btn = e.currentTarget, res = p.querySelector('#bxs-result');
        btn.disabled = true; res.className = 'bxs-result'; res.textContent = 'Waiting for your wallet…';
        try {
          if (SB.myAddress(W) !== me) throw new Error('The connected wallet changed. Check the address and try again.');
          const msg = bodyFor(k, f);
          const r = await W.executeContract(live.escrow, msg, { memo: `${b.bounty_ref} ${k}` });
          const hash = (r && (r.txHash || r.transactionHash || r.hash)) || (typeof r === 'string' ? r : '');
          res.className = 'bxs-result is-ok'; res.textContent = hash ? `Sent. Transaction ${hash}. The list updates once the block is final.` : 'Sent.';
          p.dataset.sent = k;
        } catch (err) { res.className = 'bxs-result is-bad'; res.textContent = `Not sent: ${err && err.message ? err.message : err}`; btn.disabled = false; }
      });
    }
    d.querySelector('.bxl-act').addEventListener('click', async (e) => {
      const t = e.target.closest('button'); if (!t || cur !== b) return;
      if (t.hasAttribute('data-connect')) {
        t.disabled = true; const prev = t.textContent; t.textContent = 'Connecting…';
        try { me = await SB.connectHere(W, chainCfg); await paintWallet(); await refreshGate(); paintMine(); if (builder) { bh.hidden = true; builder = null; bo && bo.setAttribute('aria-expanded', 'false'); } }
        catch (err) { t.disabled = false; t.textContent = prev; walletEl.insertAdjacentHTML('beforeend', `<p class="bxs-why">${esc(err.message || String(err))}</p>`); }
      } else if (t.dataset.sign) { picked = picked === t.dataset.sign ? null : t.dataset.sign; paintMine(); }
      else if (t.id === 'bxs-build-open') {
        const open = bh.hidden; bh.hidden = !open; t.setAttribute('aria-expanded', String(open));
        if (open && !builder) builder = await SB.mountBuilder(bh, { b, live, doc: briefDoc && briefDoc.ref === b.bounty_ref ? briefDoc.doc : null, me, wallet: (W && W.getSnapshot && W.getSnapshot().provider) || '', onSealed: (x) => { sealed = x; paintMine(); } });
      }
    });
    if (W && W.onWalletChange) W.onWalletChange(() => { if (cur !== b || !d.open) return; const a = SB.myAddress(W); if (a !== me) { me = a; picked = null; paintWallet(); refreshGate(); paintMine(); } });
    await paintWallet(); await refreshGate(); paintMine();
  }

  async function loadBrief(b) {
    const el = d.querySelector('#bxl-brief');
    try {
      const { doc, verified } = await loadDetails(live.detailsBase, b.details_hash);
      if (cur !== b) return;
      if (doc.bounty_ref && doc.bounty_ref !== b.bounty_ref) throw Object.assign(new Error('mismatch'), { code: 'ref' });
      briefDoc = { ref: b.bounty_ref, doc };
      const li = (xs) => (xs || []).map((x) => `<li>${esc(x)}</li>`).join('');
      el.innerHTML = `<p class="bxl-summary-full">${esc(doc.description || doc.summary || b.summary)}</p>
        ${doc.acceptance_criteria?.length ? `<h3>Done means</h3><ul class="bxl-check">${li(doc.acceptance_criteria)}</ul>` : ''}
        ${doc.evidence_required?.length ? `<h3>Hand in</h3><ul>${li(doc.evidence_required)}</ul>` : ''}
        <p class="bxl-tags">${(doc.capabilities || []).map((c) => `<span>${esc(c)}</span>`).join('')}${doc.priority ? `<span>Priority ${esc(doc.priority)}</span>` : ''}${doc.tier ? `<span>Tier ${esc(doc.tier)}</span>` : ''}</p>
        <p class="bxl-dim">${verified ? 'Brief checked against its on-chain hash.' : 'Brief loaded.'}</p>`;
      el.dataset.state = 'loaded';
    } catch (e) {
      if (cur !== b) return;
      el.dataset.state = 'error';
      const msg = e.code === 'hash' || e.code === 'ref' ? 'The brief file doesn’t match this bounty, so it isn’t shown.' : 'The full brief couldn’t be loaded here.';
      el.innerHTML = `<p class="bxl-summary-full">${esc(b.summary)}</p><p class="bxl-note">${msg}${e.url && e.code === 'fetch' ? ` <a href="${esc(e.url)}" target="_blank" rel="noopener">Open the brief file</a>` : ''}</p>`;
    }
  }

  function wireActions(b) {
    const sel = d.querySelector('#bxl-act');
    if (!sel) return;
    const fields = d.querySelector('#bxl-act-fields'), out = d.querySelector('#bxl-msg');
    const f = {};
    let me = null;
    sender().then((a) => { me = a; if (sel.value === 'assign' && !f.assignee && a) f.assignee = a; render(); });
    const gate = live.cfg && live.cfg.min_submit_stake ? `You need ${terp(live.cfg.min_submit_stake)} TERP staked to hand in work.` : '';
    function form() {
      const k = sel.value;
      if (k === 'assign') fields.innerHTML = `<label class="bx3-field"><span class="bx3-lbl">Worker address</span><input id="bxl-f-assignee" placeholder="terp1…" value="${esc(f.assignee || me || '')}" spellcheck="false"></label>`;
      else if (k === 'submit') fields.innerHTML = `<label class="bx3-field"><span class="bx3-lbl">Link to the finished work</span><input id="bxl-f-link" placeholder="https://github.com/…" value="${esc(f.link || '')}"></label>
        <label class="bx3-field"><span class="bx3-lbl">Short note</span><textarea id="bxl-f-note" rows="2">${esc(f.note || '')}</textarea></label><p class="bx3-hint">${gate} The note and link become a small document; its fingerprint goes on chain.</p>`;
      else if (k === 'reject' || k === 'request_changes') fields.innerHTML = `<label class="bx3-field"><span class="bx3-lbl">Reason (optional)</span><input id="bxl-f-reason" value="${esc(f.reason || '')}"></label>`;
      else if (k === 'expire') fields.innerHTML = `<p class="bx3-hint">${Date.now() * 1e6 >= Number(b.expires_at) ? 'The deadline has passed, so anyone can close it and the reward goes back to the proposer.' : `Only possible once the deadline passes (${rel(nsToDate(b.expires_at))}). Sent earlier, the contract refuses it.`}</p>`;
      else fields.innerHTML = '';
      fields.querySelectorAll('input,textarea').forEach((i) => i.addEventListener('input', read));
    }
    async function read() {
      const v = (id) => (fields.querySelector(id) || {}).value;
      Object.assign(f, { assignee: v('#bxl-f-assignee') ?? f.assignee, link: v('#bxl-f-link') ?? f.link, note: v('#bxl-f-note') ?? f.note, reason: v('#bxl-f-reason') ?? f.reason });
      await msg();
    }
    async function msg() {
      const k = sel.value, extra = { ...f };
      if (k === 'assign' && !extra.assignee) extra.assignee = '(worker address)';
      if (k === 'submit') {
        const s = await sealSubmission(b, live, extra, me);
        Object.assign(extra, s);
      }
      out.textContent = JSON.stringify(buildAction(k, b, live.escrow, me, extra), null, 2);
    }
    function render() { form(); msg(); }
    sel.addEventListener('change', render);
    d.querySelector('#bxl-copy').addEventListener('click', async (e) => {
      try { await navigator.clipboard.writeText(out.textContent); e.target.textContent = 'Copied'; } catch { e.target.textContent = 'Select the text to copy'; }
      setTimeout(() => { e.target.textContent = 'Copy message'; }, 1600);
    });
    render();
  }
  return { open };
}

/** terp-bounty-submission/v1 sealed with the site's schema bundle -> { submission_hash, cid }. */
async function sealSubmission(b, live, f, me) {
  try {
    const { Schemas } = await import('/lib/bounties/chain.js?v=30c45273bf');
    const doc = Schemas.submissionTemplate({
      bounty_ref: b.bounty_ref, chain_id: live.chainId, contract: live.escrow, bounty_id: b.id, submitter: me || '',
      summary: f.note || '', evidence: f.link ? [{ kind: /github\.com\/.+\/pull\//.test(f.link) ? 'pr' : 'url', uri: f.link }] : [], acceptance: [], details_hash: b.details_hash,
    });
    const s = Schemas.seal(doc);
    return { submission_hash: s.hash, cid: s.cid };
  } catch { return { submission_hash: '(sha256 of your submission document)', cid: '(CID of your submission document)' }; }
}
