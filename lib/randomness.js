// lib/randomness.js — Randomness page (terp.network/randomness).
//
// Reads the terp-beacon contract (drand beacon + nois-proxy drop-in) with smart queries over LCD.
// Kept from the nois randomness dashboard: the recent-rounds list (round, publish time,
// randomness), a per-round detail view and the submission badges (here: attestors who signed).
// Dropped: bot rewards, monikers/allowlist and per-tx hash lookups (terp-beacon has no bot
// incentives; the round itself is the proof).
//
// Layout follows /oracle: recent rounds live in the navigation shield on the left (Home on top,
// W/E page through them), this column has tabs (Round · Rounds · Job lookup). "Verify in
// browser" re-checks the drand BLS signature with @noble/curves (public/vendor/drand-verify.js).
// The only transaction is the optional, permissionless Process queue (wallet connected only);
// it is shown as steps and one button, never as raw message JSON.
import * as FX from './randomness-fixtures.js';

const PAGE = 10;
const SCHEME_NAME = { 'bls-unchained-g1-rfc9380': 'quicknet', 'pedersen-bls-chained': 'mainnet (default)' };
const NETWORK_NAME = { '52db9ba70e0cc0f6eaf7803dd07447a1f5477735fd3f661792ba94600c84e971': 'League of Entropy quicknet', '8990e7a9aaed2ffed73dbd7092123d6f289930540d7651336225dc172e51b2ce': 'League of Entropy mainnet' };

const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v; else if (k === 'style') el.style.cssText = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else el.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null) el.append(c.nodeType ? c : document.createTextNode(String(c)));
  return el;
};
const short = (x, a = 8, b = 6) => (!x ? '—' : x.length <= a + b + 1 ? x : `${x.slice(0, a)}…${x.slice(-b)}`);
const nsToSec = (ns) => Number(BigInt(ns) / 1000000000n);
const fmtTime = (sec) => sec == null ? '—' : new Date(sec * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
let clockOffset = 0; // mock mode pins 'now' just after the newest fixture round
const nowSec = () => Date.now() / 1000 - clockOffset;
function fmtAge(sec) { if (sec == null) return ''; const s = nowSec() - sec; if (s < 0) return `in ${fmtSpan(-s)}`; return `${fmtSpan(s)} ago`; }
function fmtSpan(s) { if (s < 90) return `${Math.round(s)} s`; if (s < 5400) return `${Math.round(s / 60)} min`; if (s < 172800) return `${Math.round(s / 3600)} h`; return `${Math.round(s / 86400)} d`; }

/** First drand round published strictly after `afterSec` (terp-beacon/nois round_after). */
export function roundAfter(chain, afterSec) {
  const g = nsToSec(chain.genesis_time);
  if (afterSec < g) return 1;
  return Math.floor((afterSec - g) / chain.period_seconds) + 2;
}
export function publishedAt(chain, round) { return nsToSec(chain.genesis_time) + (round - 1) * chain.period_seconds; }

// ── data sources ────────────────────────────────────────────────
function mockSource() {
  const chain = { ...FX.QUICKNET, required_attestations: 0, prices: [] };
  const att = FX.EXAMPLE_ATTESTORS;
  const row = ([round, signature, randomness]) => {
    const signed = FX.EXAMPLE_SIGNED[round] || [];
    return { round, signature, randomness, published: publishedAt(chain, round), verified_at: publishedAt(chain, round) + 4, attestation_count: signed.length, deliverable: signed.length >= chain.required_attestations };
  };
  const rows = FX.QUICKNET_ROUNDS.map(row);
  return {
    mode: 'example', chain,
    async recent() { return rows; },
    async beacon(r) { return rows.find((x) => x.round === r) || null; },
    async attestors() { return att; },
    async attestations(r) { return (FX.EXAMPLE_SIGNED[r] || []).map((i) => ({ pubkey: att[i] })); },
    async job(requester, id) {
      const j = requester === FX.EXAMPLE_REQUESTER && FX.EXAMPLE_JOBS[id];
      if (!j) return { state: 'none' };
      return { state: j.delivered ? 'delivered' : 'pending', round: j.round };
    },
  };
}

function liveSource(cfg) {
  const smart = async (msg) => {
    const r = await fetch(`${cfg.rest}/cosmwasm/wasm/v1/contract/${cfg.beaconContract}/smart/${encodeURIComponent(btoa(JSON.stringify(msg)))}`);
    if (!r.ok) { const e = new Error(`query ${r.status}`); e.status = r.status; throw e; }
    return (await r.json()).data;
  };
  const txs = async (query, limit = 30) => {
    const u = `${cfg.rest}/cosmos/tx/v1beta1/txs?query=${encodeURIComponent(query)}&order_by=ORDER_BY_DESC&pagination.limit=${limit}`;
    const r = await fetch(u); if (!r.ok) throw new Error(`txs ${r.status}`);
    return (await r.json()).tx_responses || [];
  };
  const wasmAttr = (tx, key) => {
    const out = [];
    for (const ev of tx.events || []) if (ev.type === 'wasm') for (const a of ev.attributes || []) if (a.key === key) out.push(a.value);
    return out;
  };
  const toRow = (b) => b && ({ round: Number(b.round), signature: b.signature, randomness: b.randomness, published: nsToSec(b.published), verified_at: nsToSec(b.verified_at), attestation_count: b.attestation_count, deliverable: b.deliverable, source: b.source });
  const beacon = async (r) => { try { return toRow(await smart({ beacon: { round: r } })); } catch { return null; } };
  let chain = null;
  return {
    mode: 'live',
    get chain() { return chain; },
    async init() { chain = await smart({ config: {} }); return chain; },
    async recent() {
      const n = Number(cfg.recentRounds || 30);
      let rounds = [];
      try {
        const list = await txs(`wasm._contract_address='${cfg.beaconContract}' AND wasm.action='add_round'`, n);
        rounds = [...new Set(list.flatMap((t) => wasmAttr(t, 'round')).map(Number))].filter(Boolean);
      } catch { /* tx index off: probe recent drand rounds instead */ }
      if (!rounds.length) {
        const now = roundAfter(chain, Date.now() / 1000) - 1;
        rounds = Array.from({ length: Number(cfg.scanRounds || 20) }, (_, i) => now - i).filter((r) => r > 0);
      }
      const rows = (await Promise.all(rounds.slice(0, n).map(beacon))).filter(Boolean);
      return rows.sort((a, b) => b.round - a.round);
    },
    beacon,
    async attestors() { return ((await smart({ attestors: {} })).attestors || []).map((a) => a.pubkey); },
    async attestations(r) { return (await smart({ attestations: { round: r } })).attestations || []; },
    async job(requester, id) {
      const q = await smart({ job: { requester, job_id: id } });
      if (q.job) return { state: 'pending', round: Number(q.job.round) };
      // Jobs leave the queue when delivered; the request tx still names the committed round.
      try {
        const list = await txs(`wasm._contract_address='${cfg.beaconContract}' AND wasm.job_id='${id.replace(/'/g, '')}' AND wasm.requester='${requester.replace(/'/g, '')}'`, 5);
        const r = list.flatMap((t) => wasmAttr(t, 'round')).map(Number).find(Boolean);
        if (r) return { state: 'delivered', round: r };
      } catch { /* no tx index */ }
      return { state: 'none' };
    },
  };
}

// ── views ───────────────────────────────────────────────────────
const verifier = () => import('/public/vendor/drand-verify.js?v=43890ed1ae');

async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; } catch {
    const ta = h('textarea', { style: 'position:fixed;opacity:0' }); ta.value = t; document.body.append(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch {} ta.remove(); return ok;
  }
}
/** Long hex: middle-truncated, full value on demand, copy button. */
export function hexField(value, label) {
  if (!value) return h('span', {}, '—');
  const code = h('code', { class: 'rnd-hexv', title: value }, short(value, 12, 10));
  const more = h('button', { type: 'button', class: 'rnd-mini', 'aria-expanded': 'false', 'aria-label': `Show full ${label}` }, 'Show all');
  more.addEventListener('click', () => { const open = more.getAttribute('aria-expanded') !== 'true'; more.setAttribute('aria-expanded', String(open)); code.textContent = open ? value : short(value, 12, 10); code.classList.toggle('is-full', open); more.textContent = open ? 'Less' : 'Show all'; });
  const note = h('span', { class: 'rnd-copied', role: 'status', 'aria-live': 'polite' });
  const copy = h('button', { type: 'button', class: 'rnd-mini', 'aria-label': `Copy ${label}` }, 'Copy');
  copy.addEventListener('click', async () => { note.textContent = (await copyText(value)) ? 'Copied' : 'Copy failed'; setTimeout(() => { note.textContent = ''; }, 1600); });
  return h('span', { class: 'rnd-hexf' }, code, h('span', { class: 'rnd-hexb' }, more, copy, note));
}

function statusOf(b, chain) {
  if (!b) return { key: 'missing', text: 'Not on Terp yet' };
  if (b.deliverable) return { key: 'ok', text: 'Verified' };
  return { key: 'wait', text: `Verified · ${b.attestation_count}/${chain.required_attestations} attestations` };
}
function badge(st) { return h('span', { class: `rnd-badge is-${st.key}` }, st.text); }

// Chained drand (mainnet default chain): terp-beacon stores only the round's signature, so Verify fetches
// previous_signature from the public drand API. The BLS check still runs here against the on-chain pubkey.
async function drandPrev(chain, round, src) {
  for (const api of (src && src.cfg && src.cfg.drandApi) || window.__TERP_CONFIG?.drandApi || ['https://api.drand.sh']) {
    try { const r = await fetch(`${api}/${chain.chain_hash}/public/${round}`); if (r.ok) { const j = await r.json(); if (j.previous_signature) return j.previous_signature; } } catch {}
  }
  return null;
}
function roundView(b, chain, src, example) {
  if (!b) return h('p', { class: 'orc-pick' }, 'No rounds on Terp yet.');
  const result = h('p', { class: 'rnd-verify', role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' });
  const vbtn = h('button', { type: 'button', class: 'orc-btn rnd-vbtn' }, 'Verify in browser');
  vbtn.addEventListener('click', async () => {
    vbtn.disabled = true; result.className = 'rnd-verify is-busy'; result.textContent = 'Checking the drand signature…';
    try {
      const { verifyBeacon } = await verifier();
      const prev = b.previous_signature || (String(chain.scheme).includes('chained') ? await drandPrev(chain, b.round, src) : null);
      const v = verifyBeacon({ scheme: chain.scheme, pubkey: chain.pubkey, round: b.round, signature: b.signature, previous_signature: prev, randomness: b.randomness });
      const pass = v.ok && v.randomnessOk !== false;
      result.className = `rnd-verify ${pass ? 'is-pass' : 'is-fail'}`;
      result.replaceChildren(h('span', { class: 'rnd-vicon', 'aria-hidden': 'true' }, pass ? '✓' : '✕'), h('span', {}, h('b', {}, pass ? `Pass: round ${b.round} is genuine. ` : `Fail: round ${b.round} did not verify. `), pass
        ? 'The signature checks out against the drand public key, and the randomness equals sha256(signature). Checked in this browser, not by our servers.'
        : (v.randomnessOk === false && v.ok ? 'The signature is valid, but the randomness is not sha256(signature).' : `${v.reason || 'Signature did not verify'}.`)));
    } catch (e) { result.className = 'rnd-verify is-fail'; result.replaceChildren(h('span', { class: 'rnd-vicon', 'aria-hidden': 'true' }, '✕'), h('span', {}, h('b', {}, 'Fail: '), `could not run the check (${e?.message || e}).`)); }
    vbtn.disabled = false;
  });
  const signers = h('div', { class: 'rnd-signers' }, h('span', { class: 'orc-pick' }, 'Loading attestors…'));
  Promise.all([src.attestors().catch(() => []), src.attestations(b.round).catch(() => [])]).then(([all, got]) => {
    const did = new Set(got.map((a) => a.pubkey));
    signers.replaceChildren(...(all.length ? all.map((pk) => h('span', { class: `rnd-signer ${did.has(pk) ? 'is-signed' : ''}`, title: pk }, `${did.has(pk) ? '✓' : '·'} ${short(pk, 6, 4)}`))
      : [h('span', { class: 'orc-pick' }, 'No attestors registered. Drand verification alone is enough to deliver.')]),
    ...(example && all.length ? [h('span', { class: 'orc-example' }, 'Example')] : []));
  });
  const st = statusOf(b, chain);
  return h('div', { class: 'orc-detail rnd-detail', 'aria-live': 'polite' },
    h('div', { class: 'orc-detail-head' },
      h('div', {}, h('h3', {}, `Round ${b.round}`), h('p', {}, fmtTime(b.published), ' · ', badge(st)))),
    h('dl', { class: 'orc-meta rnd-meta1' },
      h('div', {}, h('dt', {}, 'Randomness · sha256(signature)'), h('dd', {}, hexField(b.randomness, 'randomness'))),
      h('div', {}, h('dt', {}, 'Drand signature'), h('dd', {}, hexField(b.signature, 'signature'))),
      b.source != null ? h('div', {}, h('dt', {}, 'Source'), h('dd', {}, typeof b.source === 'string' ? b.source : Object.keys(b.source)[0] || 'drand')) : null,
      h('div', {}, h('dt', {}, `Attestors who signed (${b.attestation_count}${chain.required_attestations ? ` of ${chain.required_attestations} needed` : ''})`), h('dd', {}, signers))),
    h('div', { class: 'orc-action' }, vbtn, result));
}

function listView(rows, chain, onPick, example) {
  const st = { q: '', page: 0 };
  const input = h('input', { type: 'search', inputmode: 'numeric', placeholder: 'Search round or randomness', autocomplete: 'off', 'aria-label': 'Search rounds', class: 'rnd-input' });
  const tbody = h('tbody'); const pager = h('nav', { class: 'bxl-pager', 'aria-label': 'Pages' });
  const empty = h('p', { class: 'bxl-empty', hidden: true }, 'No rounds match that search.');
  const paint = () => {
    const hit = rows.filter((r) => !st.q || String(r.round).includes(st.q) || r.randomness.startsWith(st.q));
    const pages = Math.max(1, Math.ceil(hit.length / PAGE)); st.page = Math.min(st.page, pages - 1);
    tbody.replaceChildren(...hit.slice(st.page * PAGE, st.page * PAGE + PAGE).map((r) => h('tr', { tabindex: 0, class: 'rnd-tr', onclick: () => onPick(r.round), onkeydown: (e) => { if (e.key === 'Enter') onPick(r.round); } },
      h('td', {}, h('b', {}, `#${r.round}`)),
      h('td', { class: 'orc-hide-n' }, fmtTime(r.published).slice(11)),
      h('td', { class: 'rnd-mono', title: r.randomness }, short(r.randomness, 8, 4)),
      h('td', {}, badge(statusOf(r, chain))),
      h('td', { class: 'num' }, String(r.attestation_count)))));
    empty.hidden = hit.length > 0; pager.hidden = pages < 2;
    pager.replaceChildren(
      h('button', { type: 'button', class: 'plane-link secondary', disabled: st.page === 0, onclick: () => { st.page--; paint(); } }, 'Previous'),
      h('span', {}, `Page ${st.page + 1} of ${pages} · ${hit.length} ${hit.length === 1 ? 'round' : 'rounds'}`),
      h('button', { type: 'button', class: 'plane-link secondary', disabled: st.page >= pages - 1, onclick: () => { st.page++; paint(); } }, 'Next'));
  };
  input.addEventListener('input', () => { st.q = input.value.trim().toLowerCase().replace(/^#/, ''); st.page = 0; paint(); });
  paint();
  return h('div', { class: 'orc-list' },
    h('form', { class: 'bxl-filters', role: 'search', onsubmit: (e) => e.preventDefault() }, h('label', { class: 'bxl-q' }, input)),
    example ? h('p', { class: 'orc-pick' }, 'Real drand quicknet rounds; on-chain status and attestations are examples.') : null,
    h('div', { class: 'res-table-wrap' }, h('table', { class: 'res-table' },
      h('thead', {}, h('tr', {}, h('th', {}, 'Round'), h('th', { class: 'orc-hide-n' }, 'Published'), h('th', {}, 'Randomness'), h('th', {}, 'Status'), h('th', { class: 'num' }, 'Attest.'))),
      tbody)), empty, pager);
}

function jobView(src, chain, onPick, example) {
  const req = h('input', { type: 'text', name: 'requester', placeholder: 'Requester contract (terp1…)', autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Requester address', class: 'rnd-input', value: example ? FX.EXAMPLE_REQUESTER : '' });
  const id = h('input', { type: 'text', name: 'job_id', placeholder: 'Job id, e.g. raffle-0', autocomplete: 'off', 'aria-label': 'Job id', class: 'rnd-input', value: example ? 'raffle-0' : '' });
  const out = h('div', { class: 'rnd-job-out', 'aria-live': 'polite' });
  const go = h('button', { type: 'submit', class: 'orc-btn' }, 'Look up');
  const form = h('form', { class: 'rnd-job', onsubmit: async (e) => {
    e.preventDefault();
    const r = req.value.trim(), j = id.value.trim();
    if (!r || !j) { out.replaceChildren(h('p', { class: 'orc-msg' }, 'Enter both the requester and the job id.')); return; }
    go.disabled = true; out.replaceChildren(h('p', { class: 'orc-pick' }, 'Looking up…'));
    try {
      const res = await src.job(r, j);
      if (res.state === 'none') out.replaceChildren(h('p', { class: 'orc-pick' }, 'No job with that requester and id. It was never requested, or the id is spelled differently.'));
      else {
        const b = await src.beacon(res.round);
        const when = publishedAt(chain, res.round);
        out.replaceChildren(h('dl', { class: 'orc-meta rnd-meta1' },
          h('div', {}, h('dt', {}, 'Status'), h('dd', {}, h('span', { class: `rnd-badge is-${res.state === 'delivered' ? 'ok' : 'wait'}` }, res.state === 'delivered' ? 'Delivered' : 'Pending'),
            res.state === 'pending' ? ` ${b ? 'round is on Terp; waiting for attestations or Process queue' : `waiting for round ${res.round} (${when > nowSec() ? 'publishes ' : 'drand published '}${fmtAge(when)})`}` : ' randomness was sent to the requester')),
          h('div', {}, h('dt', {}, 'Committed round'), h('dd', {}, b ? h('button', { type: 'button', class: 'rnd-link', onclick: () => onPick(res.round) }, `#${res.round}`) : `#${res.round}`, ` · ${fmtTime(when)}`))),
        example ? h('span', { class: 'orc-example' }, 'Example') : null);
      }
    } catch (e2) { out.replaceChildren(h('p', { class: 'orc-msg' }, `Lookup failed: ${e2?.message || e2}`)); }
    go.disabled = false;
  } }, h('label', {}, h('span', {}, 'Requester'), req), h('label', {}, h('span', {}, 'Job id'), id), go);
  return h('div', { class: 'rnd-jobwrap' }, h('p', { class: 'orc-pick' }, 'A request commits to the first drand round after its time. Delivered jobs leave the queue.'), form, out);
}

function syncShield(rows, selected, onPick, example) {
  const list = rows.map((r) => ({
    id: String(r.round), label: `…${String(r.round).slice(-4)}`, sub: r.randomness.slice(0, 4),
    color: r.deliverable ? '#7fe3cf' : '#e8b86a', fresh: r.deliverable ? 1 : 0.5, stale: !r.deliverable,
    name: `Round ${r.round}${example ? ' (example)' : ''}`,
    desc: `Round ${r.round} · ${fmtTime(r.published)} · ${r.deliverable ? 'verified' : 'waiting for attestations'}`,
  }));
  let tries = 0;
  const go = () => {
    const w = window.__tnWorld;
    if (w && w.setCatalog) return w.setCatalog('/randomness', { list, selected: selected && String(selected), onPick: (id) => onPick(Number(id)) });
    if (++tries < 60) setTimeout(go, 100);
  };
  go();
}

// Process queue: permissionless, shown only with a connected wallet. Steps + one button.
function queueAction(cfg, src) {
  const box = h('div', { class: 'orc-action rnd-queue', hidden: true });
  const paint = (snap) => {
    box.hidden = !(snap && snap.connected);
    if (box.hidden) return;
    box.replaceChildren(h('button', { type: 'button', class: 'orc-ghost', onclick: () => queueSheet(cfg, src) }, 'Process queue'),
      h('p', { class: 'orc-hint' }, 'Anyone can push waiting jobs along. Free apart from gas.'));
  };
  import('/lib/wallet.js?v=761f859bba').then((w) => { paint(w.getSnapshot()); w.onWalletChange(paint); }).catch(() => {});
  return box;
}
function queueSheet(cfg, src) {
  const live = src.mode === 'live';
  const steps = [['sign', 'Sign', 'you, in your wallet'], ['deliver', 'Deliver', 'up to 10 waiting jobs'], ['done', 'Done', 'requesters get randomness']];
  const orbs = h('ol', { class: 'orc-flow rnd-flow', 'aria-label': 'Steps' }, steps.map(([id, t, who]) => h('li', { 'data-step': id }, h('span', { class: 'shield-disc' }), h('span', { class: 't' }, t), h('span', { class: 'who' }, who))));
  const mark = (id, s) => { const li = orbs.querySelector(`[data-step="${id}"]`); if (li) { li.classList.remove('is-active', 'is-done', 'is-err'); li.classList.add(`is-${s}`); } };
  const msg = h('p', { class: 'orc-msg', role: 'status' }, live ? '' : 'Available once the beacon is deployed. Nothing will be signed.');
  const go = h('button', { class: 'orc-btn', type: 'button', disabled: !live }, 'Process queue');
  const close = () => { sheet.remove(); document.removeEventListener('keydown', esc); };
  const esc = (e) => { if (e.key === 'Escape') close(); };
  const sheet = h('div', { class: 'orc-sheet', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'rnd-sheet-t', onclick: (e) => { if (e.target === sheet) close(); } },
    h('div', { class: 'orc-card' }, h('h2', { id: 'rnd-sheet-t' }, 'Process the queue'),
      h('p', {}, 'Jobs whose drand round is already on Terp get their randomness now. Your wallet shows the transaction before you sign.'),
      orbs, msg, h('div', { class: 'orc-row' }, h('button', { class: 'orc-ghost', type: 'button', onclick: close }, 'Cancel'), go)));
  document.body.append(sheet); document.addEventListener('keydown', esc); go.focus();
  go.addEventListener('click', async () => {
    go.disabled = true; mark('sign', 'active'); msg.textContent = 'Approve in your wallet…';
    try {
      const w = await import('/lib/wallet.js?v=761f859bba');
      await w.ensureWallet(cfg);
      const res = await w.executeContract(cfg.beaconContract, { process_queue: {} });
      mark('sign', 'done'); mark('deliver', 'done'); mark('done', 'done');
      msg.textContent = `Done${res?.transactionHash || res?.txhash ? ` · tx ${short(res.transactionHash || res.txhash)}` : ''}.`;
    } catch (e) { mark('sign', 'err'); msg.textContent = `Stopped: ${e?.message || e}.`; go.disabled = false; }
  });
}

export async function mountRandomness(root, cfg) {
  const forceMock = new URLSearchParams(location.search).get('mock') === '1';
  let src = forceMock || !cfg.beaconContract ? mockSource() : liveSource(cfg);
  let reason = forceMock ? 'mock' : !cfg.beaconContract ? 'undeployed' : null;
  if (src.mode === 'live') { try { await src.init(); } catch { src = mockSource(); reason = 'error'; } }
  const example = src.mode !== 'live';
  clockOffset = example ? Date.now() / 1000 - (publishedAt(src.chain, FX.QUICKNET_ROUNDS[0][0]) + 2) : 0;
  const chain = src.chain;
  const rows = await src.recent().catch(() => []);
  const latest = rows[0];

  const state = example
    ? h('div', { class: 'orc-state', role: 'status' }, h('span', { class: 'orc-dot' }), h('div', {},
        h('b', {}, reason === 'error' ? 'Beacon not reachable right now. ' : reason === 'mock' ? 'Mock mode. ' : 'Not deployed yet. '),
        'Rounds below are real drand quicknet beacons, so Verify works; their on-chain status, attestors and jobs are examples.', h('span', { class: 'orc-example' }, 'Example')))
    : h('div', { class: 'orc-state is-live', role: 'status' }, h('span', { class: 'orc-dot' }), h('div', {}, h('b', {}, 'Live. '), 'Drand beacons verified on Terp. Randomness is sha256 of the drand signature, so nobody on Terp can choose it.'));

  const net = NETWORK_NAME[chain.chain_hash] || `drand ${short(chain.chain_hash, 8, 4)}`;
  const meta = h('dl', { class: 'orc-meta rnd-top' },
    h('div', {}, h('dt', {}, 'Latest verified round'), h('dd', { class: 'orc-big' }, latest ? `#${latest.round}` : '—')),
    h('div', {}, h('dt', {}, 'Published'), h('dd', {}, latest ? fmtTime(latest.published) : '—', latest ? h('small', { class: 'rnd-sub' }, fmtAge(latest.published)) : null)),
    h('div', {}, h('dt', {}, 'Drand chain'), h('dd', {}, `${net} · every ${chain.period_seconds} s`, h('small', { class: 'rnd-sub' }, chain.scheme))),
    h('div', { class: 'rnd-wide' }, h('dt', {}, 'Latest randomness'), h('dd', {}, latest ? hexField(latest.randomness, 'latest randomness') : '—')));

  let tab = ({ '#rounds': 'list', '#job': 'job' })[location.hash] || 'round';
  let sel = latest ? latest.round : null;
  const detail = h('div', { role: 'tabpanel', id: 'rnd-pane-round', 'aria-labelledby': 'rnd-tab-round' });
  const pick = async (r) => {
    sel = r;
    const b = rows.find((x) => x.round === r) || await src.beacon(r);
    detail.replaceChildren(roundView(b, chain, src, example));
    syncShield(rows, r, pick, example);
    if (tab !== 'round') setTab('round');
  };
  const panes = {
    round: detail,
    list: h('div', { role: 'tabpanel', id: 'rnd-pane-list', 'aria-labelledby': 'rnd-tab-list' }, listView(rows, chain, pick, example)),
    job: h('div', { role: 'tabpanel', id: 'rnd-pane-job', 'aria-labelledby': 'rnd-tab-job' }, jobView(src, chain, pick, example)),
  };
  const tabBtns = [['round', 'Round'], ['list', 'Rounds'], ['job', 'Job lookup']].map(([id, t]) => h('button', { type: 'button', role: 'tab', id: `rnd-tab-${id}`, 'aria-controls': `rnd-pane-${id}`, 'data-view': id }, t));
  const order = tabBtns.map((b) => b.dataset.view);
  const setTab = (id) => { tab = id; for (const b of tabBtns) { const on = b.dataset.view === id; b.setAttribute('aria-selected', String(on)); b.tabIndex = on ? 0 : -1; } for (const [k, p] of Object.entries(panes)) p.hidden = k !== id;
    history.replaceState(null, '', location.pathname + location.search + (id === 'list' ? '#rounds' : id === 'job' ? '#job' : '')); };
  tabBtns.forEach((b) => b.addEventListener('click', () => setTab(b.dataset.view)));
  const tabs = h('div', { class: 'bxl-tabs', role: 'tablist', 'aria-label': 'Randomness views', onkeydown: (e) => {
    const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (!d) return;
    setTab(order[(order.indexOf(tab) + d + order.length) % order.length]); root.querySelector(`#rnd-tab-${tab}`).focus(); } }, tabBtns);

  root.replaceChildren(state, meta, h('div', { class: 'bxl orc-views' }, tabs, panes.round, panes.list, panes.job), queueAction(cfg, src));
  if (sel) { detail.replaceChildren(roundView(rows[0], chain, src, example)); syncShield(rows, sel, pick, example); }
  else detail.replaceChildren(roundView(null, chain, src, example));
  setTab(tab);
  window.__rnd = { pick, rows, mode: src.mode, openQueue: () => queueSheet(cfg, src) };
}
