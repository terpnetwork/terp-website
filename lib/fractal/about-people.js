// about-people.js — About → People (TerpNET Foundation) live figures, and the
// Genesis history timeline. Session-level module (under /lib/fractal/ so the
// shell keeps it across soft navigations). Read-only queries against the
// public LCD; when they fail, the dated figures in the page stay as they are.

const LCD = 'https://api.terp.network';
const DAO = 'terp14w2qva6dx6wcsmq5fvplh7cr7nvptejznyvpe5hp5mtyqhxxjamsz3kw2w';
const ALLOC = 'terp1qfpnat6kc99gsc3233cw6fq0s0fdv7cq06alqu';
const OTHER = 'terp1x8rxh2k68xawu5pep8rd2fzy2j0v47cfwp424q';
const NAMES = 'terp143r4y9wn3g06j5z425cunfc6g3fz9gsedptgrxc8w6ktvflpe45s94903c'; // Terp Account Billboards
const PROPOSAL_MODULES = [
  'terp1p5582k3sw008jkmw0f48ucszn660nazqr9x3ut6h5aqj4frq8f0shaey4g', // single choice
  'terp1ptgs78khanfuzjldx4q0880ksf33ty29q0mw7650mhtnyhyxyq6sllt2dr', // multiple choice
];
const KNOWN = { uterp: ['TERP', 6], uthiol: ['THIOL', 6], ubtsg: ['BTSG', 6] };
const FRESH_MS = 120_000;
let last = 0, lastTry = 0, busy = false;

const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: d });
const micro = (a) => Number(a) / 1e6;
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
function dur(s) {
  s = Number(s);
  if (s % 86400 === 0) return `${s / 86400} day${s === 86400 ? '' : 's'}`;
  if (s % 3600 === 0) return `${s / 3600} hours`;
  return `${fmt(s)} s`;
}
async function getJson(path) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(LCD + path, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(t); }
}
const smart = (addr, msg) => getJson(`/cosmwasm/wasm/v1/contract/${addr}/smart/${btoa(JSON.stringify(msg))}`).then((r) => r.data);
const balances = (a) => getJson(`/cosmos/bank/v1beta1/balances/${a}?pagination.limit=100`).then((r) => r.balances || []);
const amountOf = (list, denom) => micro((list.find((c) => c.denom === denom) || { amount: 0 }).amount);

// cw4-group members from raw contract state (its list query fails on this chain):
// keys are a 2-byte namespace length, the namespace "members", then the address.
async function groupMembers(group) {
  const r = await getJson(`/cosmwasm/wasm/v1/contract/${group}/state?pagination.limit=200`);
  const out = [];
  let total = null;
  for (const m of r.models || []) {
    const k = m.key.match(/../g).map((h) => parseInt(h, 16));
    const n = (k[0] << 8) | k[1];
    const ns = String.fromCharCode(...k.slice(2, 2 + n));
    let val; try { val = JSON.parse(atob(m.value)); } catch { continue; }
    if (ns === 'members' && k.length > 2 + n) out.push({ address: String.fromCharCode(...k.slice(2 + n)), weight: Number(val) });
    else if (n > 0x40 && String.fromCharCode(...k) === 'total') total = Number(val); // Item keys carry no length prefix
  }
  return { members: out, total };
}
async function nameOf(address) {
  try { const r = await smart(NAMES, { reverse_map_account: { address } }); return typeof r === 'string' ? r : r?.account || r?.name || null; } catch { return null; }
}

function root() { return document.getElementById('about-people'); }
function onScreen() {
  const d = document.documentElement;
  if (d.getAttribute('data-tn-world') !== 'panel') return true;
  return d.getAttribute('data-tn-section') === 'people';
}
const set = (el, key, text) => el.querySelectorAll(`[data-live="${key}"]`).forEach((n) => { n.textContent = text; });

async function load(el) {
  if (busy) return;
  busy = true; lastTry = Date.now();
  let got = 0;
  const step = async (fn) => { try { await fn(); got++; } catch { /* keep the dated figure */ } };
  await Promise.all([
    step(async () => {
      const vm = await smart(DAO, { voting_module: {} });
      const group = await smart(vm, { group_contract: {} });
      const { members, total } = await groupMembers(group);
      if (!members.length) throw new Error('no members');
      const sum = total ?? members.reduce((a, m) => a + m.weight, 0);
      members.sort((a, b) => b.weight - a.weight || a.address.localeCompare(b.address));
      const names = await Promise.all(members.map((m) => nameOf(m.address)));
      const body = el.querySelector('[data-live="member-rows"]');
      if (body) body.innerHTML = members.map((m, i) => `<tr><td>${names[i] ? `<b>${esc(names[i])}</b><br>` : ''}<a class="gd-addr" href="https://ping.pub/terp/account/${esc(m.address)}" target="_blank" rel="noopener">${esc(m.address)}</a></td><td class="r n">${fmt(m.weight)}</td><td class="r n">${((m.weight / sum) * 100).toFixed(2)}%</td></tr>`).join('');
      set(el, 'members', fmt(members.length));
      set(el, 'total-weight', fmt(sum));
    }),
    step(async () => {
      const counts = await Promise.all(PROPOSAL_MODULES.map((a) => smart(a, { proposal_count: {} })));
      set(el, 'proposals', fmt(counts.reduce((a, n) => a + Number(n || 0), 0)));
      const c = await smart(PROPOSAL_MODULES[0], { config: {} });
      const q = c?.threshold?.threshold_quorum?.quorum?.percent;
      if (q) set(el, 'quorum', `${fmt(Number(q) * 100, 2)}%`);
      if (c?.max_voting_period?.time) set(el, 'voting', dur(c.max_voting_period.time));
      if (c?.veto?.timelock_duration?.time) set(el, 'timelock', dur(c.veto.timelock_duration.time));
    }),
    step(async () => {
      const b = await balances(DAO);
      set(el, 'tre-terp', fmt(amountOf(b, 'uterp')));
      const dl = el.querySelector('[data-live="treasury"]');
      if (!dl || !b.length) return;
      const rows = await Promise.all(b.map(async (c) => {
        let base = c.denom, via = '';
        if (c.denom.startsWith('ibc/')) {
          try { base = (await getJson(`/ibc/apps/transfer/v1/denoms/${c.denom.slice(4)}`)).denom.base; via = 'Over IBC.'; } catch { via = 'IBC token.'; }
        }
        const k = KNOWN[base];
        const name = k ? k[0] : base.split('/').pop();
        const amt = k ? `<span class="n">${fmt(Number(c.amount) / 10 ** k[1], 6)}</span>` : `<span class="n">${fmt(c.amount)}</span> base units`;
        return { order: base === 'uterp' ? 0 : base === 'uthiol' ? 1 : 2, html: `<dt>${esc(name)}</dt><dd>${amt}${via ? `<small>${via}</small>` : ''}</dd>` };
      }));
      dl.innerHTML = rows.sort((x, y) => x.order - y.order).map((r) => r.html).join('');
    }),
    step(async () => {
      const [acct, dels, bank, spend] = await Promise.all([
        getJson(`/cosmos/auth/v1beta1/accounts/${ALLOC}`).then((r) => r.account),
        getJson(`/cosmos/staking/v1beta1/delegations/${ALLOC}?pagination.limit=200`).then((r) => r.delegation_responses || []),
        balances(ALLOC),
        getJson(`/cosmos/bank/v1beta1/spendable_balances/${ALLOC}`).then((r) => r.balances || []),
      ]);
      const bv = acct?.base_vesting_account;
      if (bv) {
        set(el, 'v-orig', fmt(amountOf(bv.original_vesting || [], 'uterp')));
        set(el, 'v-end', `${new Date(Number(bv.end_time) * 1000).toISOString().replace('T', ' ').slice(0, 19)} UTC`);
      }
      const staked = dels.reduce((a, d) => a + micro(d.balance?.denom === 'uterp' ? d.balance.amount : 0), 0);
      set(el, 'a-staked', fmt(staked, 2));
      set(el, 'a-vals', fmt(dels.length));
      set(el, 'a-bank', fmt(amountOf(bank, 'uterp'), 2));
      set(el, 'a-spend', fmt(amountOf(spend, 'uterp'), 2));
      set(el, 'a-thiol', fmt(amountOf(bank, 'uthiol'), 2));
    }),
    step(async () => {
      const b = await balances(OTHER);
      set(el, 'x-terp', fmt(amountOf(b, 'uterp'), 2));
      set(el, 'x-thiol', fmt(amountOf(b, 'uthiol'), 2));
    }),
  ]);
  const status = el.querySelector('[data-live="status"]');
  if (got) {
    last = Date.now();
    el.dataset.live = 'ok';
    if (status) status.textContent = `Live from mainnet morocco-1 · updated ${new Date().toISOString().slice(11, 16)} UTC`;
  } else {
    el.dataset.live = 'offline';
  }
  busy = false;
}

function check() {
  const el = root();
  if (!el || !onScreen() || document.hidden) return;
  if (Date.now() - lastTry < 15_000 && el.dataset.live) return;
  if (Date.now() - last > FRESH_MS || el.dataset.live !== 'ok') load(el);
}

// ── Genesis history timeline: one event open at a time ─────────────────────
// Without this script every panel shows, one after the other.
function tlInit() {
  document.querySelectorAll('[data-tl]:not([data-tl-on])').forEach((tl) => {
    tl.setAttribute('data-tl-on', '');
    const open = tl.querySelector('.tl-ev[aria-expanded="true"]') || tl.querySelector('.tl-ev');
    if (open) tlSelect(tl, open, false);
  });
}
function tlSelect(tl, btn, focus) {
  tl.querySelectorAll('.tl-ev').forEach((b) => {
    const on = b === btn;
    b.setAttribute('aria-expanded', String(on));
    const p = document.getElementById(b.getAttribute('aria-controls'));
    if (p) p.hidden = !on;
  });
  if (focus) btn.focus();
}
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('[data-tl-on] .tl-ev');
  if (b) tlSelect(b.closest('[data-tl]'), b, false);
});
document.addEventListener('keydown', (e) => {
  const b = e.target.closest && e.target.closest('[data-tl-on] .tl-ev');
  if (!b) return;
  const all = [...b.closest('[data-tl]').querySelectorAll('.tl-ev')], i = all.indexOf(b);
  const to = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: all.length - 1 }[e.key];
  if (to === undefined) return;
  e.preventDefault();
  const t = all[(to + all.length) % all.length];
  tlSelect(b.closest('[data-tl]'), t, true);
});

function boot() { tlInit(); check(); }
addEventListener('tn:navigated', () => { last = 0; boot(); });
addEventListener('hashchange', () => setTimeout(check, 0));
document.addEventListener('visibilitychange', check);
new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tn-section', 'data-tn-world'] });
setInterval(check, 30_000);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot, { once: true });
else boot();
