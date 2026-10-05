// about-network.js — live mainnet figures for the About → Network tab.
// Session-level module (lives under /lib/fractal/ so the shell keeps it across
// soft navigations): it fills [data-live] fields inside #about-network when
// that tab is on screen, and leaves the static text alone when the endpoints
// can't be reached.

const LCD = 'https://api.terp.network';
const RPC = 'https://rpc.terp.network';
const FRESH_MS = 60_000;
let last = 0;
let busy = false;
let lastTry = 0;

const fmtInt = (n) => Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 });
const pct = (x, d = 1) => `${(Number(x) * 100).toFixed(d).replace(/\.0+$/, '')}%`;
const micro = (a) => Number(a) / 1e6;
function dur(sec) {
  const s = Number(String(sec).replace(/s$/, ''));
  if (!Number.isFinite(s)) return '—';
  if (s % 86400 === 0) return `${s / 86400} day${s === 86400 ? '' : 's'}`;
  if (s % 3600 === 0) return `${s / 3600} hours`;
  return `${fmtInt(s)} s`;
}
const PERM = { Everybody: 'Anyone', Nobody: 'No one', AnyOfAddresses: 'Listed addresses only', OnlyAddress: 'One address only' };

async function getJson(url) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), 8000);
  try {
    const r = await fetch(url, { signal: ctl.signal, cache: 'no-store' });
    if (!r.ok) throw new Error(String(r.status));
    return await r.json();
  } finally { clearTimeout(t); }
}
const lcd = (p) => getJson(LCD + p);

function root() { return document.getElementById('about-network'); }
function onScreen(el) {
  const d = document.documentElement;
  if (d.getAttribute('data-tn-world') !== 'panel') return true; // plain layout shows every tab
  return d.getAttribute('data-tn-section') === 'network';
}
function set(el, key, text, title) {
  el.querySelectorAll(`[data-live="${key}"]`).forEach((n) => {
    n.textContent = text;
    if (title) n.title = title; else n.removeAttribute('title');
  });
}

async function load(el) {
  if (busy) return;
  busy = true;
  lastTry = Date.now();
  const jobs = {
    latest: lcd('/cosmos/base/tendermint/v1beta1/blocks/latest'),
    pool: lcd('/cosmos/staking/v1beta1/pool'),
    bonded: lcd('/cosmos/staking/v1beta1/validators?status=BOND_STATUS_BONDED&pagination.limit=1&pagination.count_total=true'),
    all: lcd('/cosmos/staking/v1beta1/validators?pagination.limit=1&pagination.count_total=true'),
    staking: lcd('/cosmos/staking/v1beta1/params'),
    terp: lcd('/cosmos/bank/v1beta1/supply/by_denom?denom=uterp'),
    thiol: lcd('/cosmos/bank/v1beta1/supply/by_denom?denom=uthiol'),
    inflation: lcd('/cosmos/mint/v1beta1/inflation'),
    mint: lcd('/cosmos/mint/v1beta1/params'),
    sa: lcd('/terp/smartaccount/params'),
    wasm: lcd('/cosmwasm/wasm/v1/codes/params'),
    feeshare: lcd('/terp/feeshare/v1/params'),
    tf: lcd('/osmosis/tokenfactory/v1beta1/params'),
    channels: lcd('/ibc/core/channel/v1/channels?pagination.limit=500'),
    transfer: lcd('/ibc/apps/transfer/v1/params'),
    icaHost: lcd('/ibc/apps/interchain_accounts/host/v1/params'),
    icaCtl: lcd('/ibc/apps/interchain_accounts/controller/v1/params'),
    gov: lcd('/cosmos/gov/v1/params/tallying'),
    prop: lcd('/cosmos/gov/v1/proposals?pagination.limit=1&pagination.reverse=true'),
  };
  const keys = Object.keys(jobs);
  const settled = await Promise.allSettled(keys.map((k) => jobs[k]));
  const v = {};
  keys.forEach((k, i) => { if (settled[i].status === 'fulfilled') v[k] = settled[i].value; });
  let got = 0;
  const ok = (fn) => { try { if (fn() !== false) got++; } catch { /* leave the placeholder */ } };

  // Height and block time: LCD first, RPC /status as the fallback for height.
  let height = Number(v.latest?.block?.header?.height);
  let tipTime = v.latest?.block?.header?.time;
  if (!height) {
    try {
      const s = await getJson(`${RPC}/status`);
      height = Number(s.result.sync_info.latest_block_height);
      tipTime = s.result.sync_info.latest_block_time;
    } catch { /* offline */ }
  }
  if (height) {
    set(el, 'height', fmtInt(height)); got++;
    try {
      const back = 100;
      const old = await lcd(`/cosmos/base/tendermint/v1beta1/blocks/${height - back}`);
      const dt = (Date.parse(tipTime) - Date.parse(old.block.header.time)) / 1000 / back;
      if (dt > 0 && dt < 600) set(el, 'blocktime', `${dt.toFixed(2)} s`);
    } catch { /* keep placeholder */ }
  }
  ok(() => {
    const act = Number(v.bonded.pagination.total); const tot = Number(v.all.pagination.total);
    set(el, 'validators', `${fmtInt(act)} / ${fmtInt(tot)}`);
  });
  ok(() => {
    const b = micro(v.pool.pool.bonded_tokens); const sup = micro(v.terp.amount.amount);
    set(el, 'bonded', pct(b / sup, 2), `${fmtInt(b)} of ${fmtInt(sup)} TERP`);
    set(el, 'bonded-amt', `${fmtInt(b)} TERP`);
  });
  ok(() => set(el, 'supply-terp', fmtInt(micro(v.terp.amount.amount))));
  ok(() => set(el, 'supply-thiol', fmtInt(micro(v.thiol.amount.amount))));
  ok(() => {
    const p = v.staking.params;
    set(el, 'max-validators', fmtInt(p.max_validators));
    set(el, 'unbonding', dur(p.unbonding_time));
  });
  ok(() => set(el, 'inflation', pct(v.inflation.inflation, 2)));
  ok(() => set(el, 'inflation-range', `${pct(v.mint.params.inflation_min, 2)} – ${pct(v.mint.params.inflation_max, 2)}`));
  ok(() => {
    const p = v.sa.params;
    set(el, 'sa-active', p.is_smart_account_active ? 'On' : 'Paused');
    set(el, 'sa-gas', `${fmtInt(p.maximum_unauthenticated_gas)} gas`);
  });
  ok(() => {
    const p = v.wasm.params;
    set(el, 'wasm-upload', PERM[p.code_upload_access.permission] || p.code_upload_access.permission);
    set(el, 'wasm-inst', PERM[p.instantiate_default_permission] || p.instantiate_default_permission);
  });
  ok(() => set(el, 'feeshare', v.feeshare.params.enable_fee_share ? pct(v.feeshare.params.developer_shares, 0) : 'Off'));
  ok(() => {
    const fee = v.tf.params.denom_creation_fee || [];
    set(el, 'tf-fee', fee.length ? fee.map((c) => `${fmtInt(micro(c.amount))} ${c.denom.replace(/^u/, '').toUpperCase()}`).join(' + ') : 'None beyond gas');
  });
  ok(() => set(el, 'channels', fmtInt(v.channels.channels.filter((c) => c.state === 'STATE_OPEN').length)));
  ok(() => { const p = v.transfer.params; set(el, 'transfer', p.send_enabled && p.receive_enabled ? 'Send and receive on' : p.send_enabled ? 'Send only' : p.receive_enabled ? 'Receive only' : 'Off'); });
  ok(() => set(el, 'ica', [v.icaHost.params.host_enabled ? 'host' : '', v.icaCtl.params.controller_enabled ? 'controller' : ''].filter(Boolean).join(' and ') || 'Off'));
  ok(() => {
    const p = v.gov.params;
    const dep = (p.min_deposit || []).find((c) => c.denom === 'uterp');
    set(el, 'gov-deposit', dep ? `${fmtInt(micro(dep.amount))} TERP` : '—');
    set(el, 'gov-voting', dur(p.voting_period));
    set(el, 'gov-quorum', pct(p.quorum));
    set(el, 'gov-threshold', pct(p.threshold));
    set(el, 'gov-veto', pct(p.veto_threshold));
    set(el, 'gov-expedited', `${dur(p.expedited_voting_period)} · pass ${pct(p.expedited_threshold)}`);
  });
  ok(() => {
    const p = v.prop.proposals[0];
    const st = String(p.status).replace('PROPOSAL_STATUS_', '').toLowerCase().replace(/_/g, ' ');
    set(el, 'gov-latest', `#${p.id} · ${p.title || 'untitled'} · ${st}`);
  });

  const status = el.querySelector('[data-live="status"]');
  if (got) {
    last = Date.now();
    el.dataset.live = 'ok';
    if (status) status.textContent = `Live from mainnet morocco-1 · updated ${new Date().toISOString().slice(11, 16)} UTC`;
  } else {
    el.dataset.live = 'offline';
    if (status) status.textContent = 'Live figures are unavailable right now. They are read from api.terp.network and rpc.terp.network; everything else on this tab still applies.';
  }
  busy = false;
}

function check() {
  const el = root();
  if (!el || !onScreen(el) || document.hidden) return;
  if (Date.now() - lastTry < 15_000 && el.dataset.live) return;
  if (Date.now() - last > FRESH_MS || el.dataset.live !== 'ok') load(el);
}

// A fresh page body resets the figures; reload them when the tab shows again.
addEventListener('tn:navigated', () => { last = 0; check(); });
addEventListener('hashchange', () => setTimeout(check, 0));
document.addEventListener('visibilitychange', check);
new MutationObserver(check).observe(document.documentElement, { attributes: true, attributeFilter: ['data-tn-section', 'data-tn-world'] });
setInterval(check, 30_000);
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', check, { once: true });
else check();
