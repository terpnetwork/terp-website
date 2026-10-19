// lib/staking.js — the Staking panel on /eco (catalog card "staking").
// Plain DOM, no framework. Reads over LCD (lib/staking-tx.js). Signing goes through
// one adapter (lib/staking-signer.js) that picks the path for the account the
// Connect panel connected: Keplr (direct), Keplr in Ledger mode (amino-JSON),
// a passkey device key or an Ethereum authenticator (direct + TxExtension).
// Every step (estimate, signature, hash, block) shows inside the panel.
//
//   mountStaking(el, CONFIG)   CONFIG is the page config (window.__TERP_CONFIG)
//
// URL state: ?stake=<terp1…> views any address read-only (shareable).
// Network: an explicit choice (?chain= or the Connect panel's network switch,
// stored as terp-chain-id) wins over the page default.

import * as T from '/lib/staking-tx.js';
import * as SG from '/lib/staking-signer.js';
import { whyHtml, shortLine } from '/lib/ui/why.js';

const STYLE_ID = 'stk-styles';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (a) => (!a ? '' : a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);
const pct = (x, d = 1) => `${(x * 100).toFixed(d)}%`;
const WHEN = { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' };
const BECH = /^terp1[02-9ac-hj-np-z]{38,58}$/;

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
  .stk { display: grid; gap: 1rem; font-size: var(--eco-text, 0.92rem); color: var(--tn-text); min-width: 0; }
  .stk h4 { margin: 0 0 0.45rem; font-size: var(--eco-label, 0.8rem); font-weight: 500; text-transform: uppercase; letter-spacing: var(--tn-track-label); color: rgb(var(--tn-teal-rgb) / max(0.8, var(--tn-alpha-floor))); }
  .stk p { margin: 0; line-height: 1.5; }
  .stk .muted { color: var(--tn-text-muted); font-size: var(--eco-text-xs, 0.82rem); }
  .stk code, .stk .mono { font-family: var(--tn-font-mono); font-size: 0.82em; overflow-wrap: anywhere; }
  .stk-head { display: flex; flex-wrap: wrap; gap: 0.4rem 0.75rem; align-items: center; justify-content: space-between; }
  .stk-pill { display: inline-block; border: 1px solid rgb(var(--tn-teal-rgb) / 0.35); border-radius: var(--tn-radius-ctl); padding: 0.05rem 0.45rem; font-size: 0.72rem; color: var(--tn-teal); vertical-align: middle; white-space: nowrap; }
  .stk-pill.current { color: var(--tn-mint); border-color: rgb(var(--tn-teal-rgb) / 0.55); background: rgb(var(--tn-teal-rgb) / 0.1); }
  .stk-pill.pending { color: var(--tn-amber); border-color: rgb(var(--tn-amber-rgb) / 0.45); background: rgb(var(--tn-amber-rgb) / 0.1); }
  .stk-pill.upcoming { color: var(--tn-purple); border-color: rgb(var(--tn-purple-rgb) / 0.45); background: rgb(var(--tn-purple-rgb) / 0.1); }
  .stk-pill.unverified { color: var(--tn-text-dim); border-color: rgb(var(--tn-text-dim-rgb) / 0.45); background: rgb(var(--tn-text-dim-rgb) / 0.12); }
  .stk-pill.err { color: var(--tn-error); border-color: rgb(var(--tn-error-rgb) / 0.45); background: rgb(var(--tn-error-rgb) / 0.08); }
  .stk-who { display: grid; gap: 0.5rem; padding: 0.75rem 0.85rem; border: 1px solid rgb(var(--tn-teal-rgb) / 0.14); border-radius: var(--tn-radius-sm); background: rgb(var(--tn-shade-rgb) / 0.25); }
  .stk-who .name { color: var(--tn-mint); font-weight: 500; font-size: 1rem; overflow-wrap: anywhere; }
  .stk-row { display: flex; flex-wrap: wrap; gap: 0.45rem; align-items: center; }
  .stk-btn { min-height: 34px; padding: 0.35rem 0.8rem; border-radius: var(--tn-radius-ctl); border: 1px solid rgb(var(--tn-teal-rgb) / 0.35); background: transparent; color: var(--tn-text-bright); font: 500 0.84rem/1.2 var(--tn-font); cursor: pointer; }
  .stk-btn:hover:not(:disabled), .stk-btn:focus-visible { border-color: var(--tn-teal); color: var(--tn-teal); }
  .stk-btn.primary { color: var(--tn-teal); border-color: rgb(var(--tn-teal-rgb) / 0.6); background: rgb(var(--tn-teal-rgb) / 0.1); }
  .stk-btn.warn { color: var(--tn-coral); border-color: rgb(var(--tn-coral-rgb) / 0.45); }
  .stk-btn.small { min-height: 28px; padding: 0.2rem 0.55rem; font-size: 0.78rem; }
  .stk-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .stk-btn[aria-pressed="true"] { color: var(--tn-teal); border-color: var(--tn-teal); background: rgb(var(--tn-teal-rgb) / 0.12); }
  .stk-sort { display: grid; gap: 0.3rem; margin-bottom: 0.4rem; }
  .stk-signwith { display: grid; gap: 0.35rem; }
  .stk-signwith legend { font-size: var(--eco-label, 0.8rem); text-transform: uppercase; letter-spacing: var(--tn-track-label); color: var(--tn-text-muted); margin-bottom: 0.25rem; }
  .stk-signwith label { align-items: flex-start; }
  .stk-signwith label.off { opacity: 0.7; }
  .stk-signwith .stk-why { font-size: 0.78rem; }
  .stk :focus-visible { outline: 2px solid var(--tn-teal); outline-offset: 2px; }
  .stk-input { min-height: 36px; padding: 0.4rem 0.6rem; border-radius: var(--tn-radius-ctl); border: 1px solid rgb(var(--tn-teal-rgb) / 0.25); background: rgb(var(--tn-shade-rgb) / 0.3); color: var(--tn-text-bright); font: 0.88rem var(--tn-font); min-width: 0; }
  .stk-input.mono { font-family: var(--tn-font-mono); font-size: 0.8rem; }
  .stk-input[aria-invalid="true"] { border-color: rgb(var(--tn-error-rgb) / 0.7); }
  .stk-kv { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 0.5rem; }
  .stk-kv > div { padding: 0.55rem 0.7rem; border: 1px solid rgb(var(--tn-teal-rgb) / 0.12); border-radius: var(--tn-radius-sm); min-width: 0; }
  .stk-kv dt { font-size: var(--tn-size-label); text-transform: uppercase; letter-spacing: var(--tn-track-label); color: var(--tn-text-muted); }
  .stk-kv dd { margin: 0.15rem 0 0; font-family: var(--tn-font-mono); font-size: 0.92rem; color: var(--tn-text-bright); overflow-wrap: anywhere; }
  .stk-kv dd small { display: block; font-family: var(--tn-font); font-size: 0.74rem; color: var(--tn-text-muted); }
  .stk-table-wrap { overflow-x: auto; border: 1px solid rgb(var(--tn-teal-rgb) / 0.12); border-radius: var(--tn-radius-sm); }
  .stk-table { width: 100%; border-collapse: collapse; font-size: 0.86rem; }
  .stk-table th, .stk-table td { text-align: left; padding: 0.45rem 0.7rem; border-bottom: 1px solid rgb(var(--tn-teal-rgb) / 0.07); vertical-align: middle; }
  .stk-table th { font-weight: 500; font-size: 0.72rem; text-transform: uppercase; letter-spacing: var(--tn-track-label); color: rgb(var(--tn-teal-rgb) / max(0.7, var(--tn-alpha-floor))); background: rgb(var(--tn-teal-rgb) / 0.03); }
  .stk-table td.num { font-family: var(--tn-font-mono); font-size: 0.82rem; white-space: nowrap; }
  .stk-table tr:last-child td { border-bottom: 0; }
  .stk-table .val { color: var(--tn-mint); font-weight: 500; }
  .stk-table .acts { display: flex; flex-wrap: wrap; gap: 0.3rem; }
  .stk-empty { padding: 0.75rem; color: var(--tn-text-muted); font-size: 0.86rem; }
  .stk-sheet { border-top: 1px solid rgb(var(--tn-teal-rgb) / 0.45); padding: 0.85rem 0 0.25rem; display: grid; gap: 0.75rem; }
  .stk-sheet[hidden] { display: none; }
  .stk-sheet h3 { margin: 0; font-size: 1.02rem; color: var(--tn-mint); font-weight: 500; }
  .stk-field { display: grid; gap: 0.3rem; }
  .stk-field label, .stk-field legend { font-size: var(--eco-label, 0.8rem); color: var(--tn-text-muted); padding: 0; }
  .stk-amount { display: flex; gap: 0.4rem; }
  .stk-amount .stk-input { flex: 1; font-family: var(--tn-font-mono); }
  .stk-picker { border: 1px solid rgb(var(--tn-teal-rgb) / 0.14); border-radius: var(--tn-radius-sm); max-height: 260px; overflow-y: auto; margin: 0; padding: 0; }
  .stk-picker label { display: grid; grid-template-columns: auto 1fr auto; gap: 0.15rem 0.6rem; align-items: center; padding: 0.45rem 0.65rem; border-bottom: 1px solid rgb(var(--tn-teal-rgb) / 0.07); cursor: pointer; color: var(--tn-text); }
  .stk-picker label:last-child { border-bottom: 0; }
  .stk-picker label[hidden] { display: none; }
  .stk-picker label:has(input:checked) { background: rgb(var(--tn-teal-rgb) / 0.08); }
  .stk-picker input { accent-color: var(--tn-teal); }
  .stk-picker .m { color: var(--tn-text-bright); overflow-wrap: anywhere; }
  .stk-picker .meta { grid-column: 2 / 4; font-size: 0.76rem; color: var(--tn-text-muted); }
  .stk-note { padding: 0.6rem 0.75rem; border-left: 2px solid rgb(var(--tn-amber-rgb) / 0.6); background: rgb(var(--tn-amber-rgb) / 0.06); font-size: 0.86rem; line-height: 1.5; }
  .stk-note.info { border-left-color: rgb(var(--tn-teal-rgb) / 0.5); background: rgb(var(--tn-teal-rgb) / 0.05); }
  .stk-check { display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.86rem; }
  .stk-check input { margin-top: 0.2rem; accent-color: var(--tn-teal); }
  .stk-est { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 0.4rem; font-size: 0.84rem; }
  .stk-est > div:not(.tn-why) { display: grid; }
  .stk-est > .tn-why { grid-column: 1 / -1; margin: 0; }
  .stk-est > div:not(.tn-why) > span:first-child { font-size: var(--tn-size-label); text-transform: uppercase; letter-spacing: var(--tn-track-label); color: var(--tn-text-muted); }
  .stk-est > div:not(.tn-why) > span:last-child { font-family: var(--tn-font-mono); color: var(--tn-text-bright); }
  .stk-status { font-size: 0.88rem; min-height: 1.3em; overflow-wrap: anywhere; }
  .stk-status.err { color: var(--tn-error); }
  .stk-status.ok { color: var(--tn-success); }
  .stk-status a { color: var(--tn-teal); }
  .stk details > summary { cursor: pointer; color: var(--tn-teal); font-size: 0.84rem; }
  .stk pre { margin: 0.4rem 0 0; padding: 0.6rem; max-height: 220px; overflow: auto; background: var(--tn-code-bg); color: var(--tn-code-text); border: 1px solid var(--tn-code-border); border-radius: var(--tn-radius-sm); font: 0.74rem/1.45 var(--tn-font-mono); white-space: pre-wrap; word-break: break-all; }
  .stk-sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  @media (max-width: 560px) {
    .stk-table thead { display: none; }
    .stk-table tr { display: grid; grid-template-columns: 1fr 1fr; gap: 0.15rem 0.6rem; padding: 0.55rem 0.7rem; border-bottom: 1px solid rgb(var(--tn-teal-rgb) / 0.1); }
    .stk-table td { padding: 0; border: 0; }
    .stk-table td[data-label]::before { content: attr(data-label); display: block; font-size: var(--tn-size-label); text-transform: uppercase; letter-spacing: var(--tn-track-label); color: var(--tn-text-muted); }
    .stk-table td.full { grid-column: 1 / -1; }
  }`;
  document.head.appendChild(s);
}

// ── chain + endpoint choice ───────────────────────────────────────────────

function chosenChainId(cfg) {
  try {
    const q = new URLSearchParams(location.search).get('chain');
    if (q === 'morocco-1' || q === '120u-1') return q;
    const s = localStorage.getItem('terp-chain-id');
    if (s === 'morocco-1' || s === '120u-1') return s;
  } catch { /* ignore */ }
  return cfg.chainId || 'morocco-1';
}

async function resolveChain(cfg) {
  const chainId = chosenChainId(cfg);
  let slice = {};
  try {
    const { getChainConfig } = await import('/lib/config.js');
    slice = (await getChainConfig(chainId)) || {};
  } catch { /* config.json missing: page config only */ }
  const testnet = chainId === '120u-1';
  const origin = location.origin;
  const sameOrigin = /^(www\.)?terp\.network$/.test(location.hostname) ? `${origin}/${testnet ? 'lcd-testnet' : 'lcd'}` : null;
  // Same-origin proxy first (prod), then the configured LCD, then the public one.
  const candidates = [sameOrigin, cfg.chainId === chainId ? cfg.rest : null, slice.rest, testnet ? null : 'https://api.terp.network'];
  const picked = await T.pickLcd(candidates, chainId);
  const d = slice.denom || {};
  const step = slice.gasPriceStep || cfg.gasPriceStep || {};
  return {
    chainId,
    testnet,
    name: testnet ? 'Testnet' : 'Mainnet',
    rest: picked.rest,
    tried: picked.tried,
    explorer: slice.explorer ?? cfg.explorerBase ?? '',
    stakeDenom: d.stake || cfg.stakeDenom || 'uterp',
    stakeDisplay: d.stakeDisplay || cfg.stakeDisplay || 'TERP',
    feeDenom: d.fee || cfg.denom || 'uthiol',
    feeDisplay: d.feeDisplay || cfg.denomDisplay || 'THIOL',
    decimals: d.decimals ?? cfg.denomDecimals ?? 6,
    configGas: Number(step.average || 0.05),
    contracts: slice.contracts || {},
  };
}

// ── panel ────────────────────────────────────────────────────────────────

/** @param {HTMLElement} el @param {object} cfg */
export async function mountStaking(el, cfg = window.__TERP_CONFIG || {}) {
  if (!el) return;
  if (el.__stk) { el.__stk.refresh(); return el.__stk; }
  injectStyles();
  el.innerHTML = '<div class="stk"><p class="muted" role="status">Reading the chain…</p></div>';
  const root = el.firstElementChild;
  const $ = (sel) => root.querySelector(sel);
  const moniker = (op) => S.byOp.get(op)?.description?.moniker || short(op);
  let timer = null;

  const S = { cfg, ch: null, params: null, gas: null, all: [], active: [], byOp: new Map(), viewing: null, own: null, provider: null, ownName: null, acct: null, sheet: null, wallet: null,
    signers: null, signersFor: null, signerId: null, order: 'spread', seed: (Math.random() * 2 ** 32) >>> 0 };
  const api = { refresh: () => { if (!S.ready) return Promise.resolve(); paintWho(); return loadAccount(); }, state: S };
  el.__stk = api;

  // Session from the site's Connect panel (wallet.js is small; chain libs stay unloaded).
  try {
    S.wallet = await import('/lib/wallet.js');
    const snap = S.wallet.getSnapshot();
    S.own = snap.connected ? snap.address : null;
    S.provider = snap.provider;
    S.ownName = snap.name;
    S.wallet.onWalletChange((n) => {
      const was = S.own;
      S.own = n.connected ? n.address : null;
      S.provider = n.provider;
      S.ownName = n.name;
      if (!S.viewing || S.viewing === was) S.viewing = S.own || urlAddress();
      S.signers = null; S.signersFor = null; S.signerId = null;
      api.refresh();
    });
  } catch { /* wallet module unavailable: read-only */ }

  S.ch = await resolveChain(cfg);
  const fmt = (u, d = S.ch.decimals) => T.fromMicro(u, d, d);
  const stakeFmt = (u) => `${fmt(u)} ${S.ch.stakeDisplay}`;
  const denomLabel = (denom) => (denom === S.ch.stakeDenom ? S.ch.stakeDisplay : denom === S.ch.feeDenom ? S.ch.feeDisplay : denom.startsWith('ibc/') ? `${denom.slice(0, 10)}…` : denom);
  const coinsFmt = (coins) => (coins || []).filter((c) => T.microOf(c.amount) > 0n).map((c) => `${fmt(T.microOf(c.amount))} ${denomLabel(c.denom)}`).join(' + ') || '0';

  if (!S.ch.rest) {
    root.innerHTML = `
      ${whyHtml('Staking can’t reach the network right now. Try again in a minute.', `No LCD answered from this browser: ${S.ch.tried.map((t) => `${t.url} (${t.why || 'ok'})`).join(' · ')}.`, { tone: 'err', attrs: 'role="alert"' })}`;
    return api;
  }

  try {
    const [params, min, vals] = await Promise.all([T.stakingParams(S.ch.rest), T.minGasPrice(S.ch.rest), T.fetchValidators(S.ch.rest)]);
    S.params = params;
    // Fee price: never below what the node enforces (config.json can lag it).
    const nodeMin = min && min.denom === S.ch.feeDenom ? min.amount : 0;
    S.gas = { amount: Math.max(S.ch.configGas, nodeMin), denom: S.ch.feeDenom, nodeMin, config: S.ch.configGas };
    S.all = vals;
    S.active = T.activeValidators(vals);
    S.byOp = new Map(vals.map((v) => [v.operator_address, v]));
  } catch (e) {
    root.innerHTML = whyHtml('Staking can’t load right now. Try again in a minute.', `Reading staking data failed: ${e.message}`, { tone: 'err', attrs: 'role="alert"' });
    return api;
  }

  const unbondSecs = Number(String(S.params.unbonding_time || '0').replace(/s$/, '')) || 0;
  const unbondDays = Math.round(unbondSecs / 86400);
  const host = new URL(S.ch.rest).host;

  root.innerHTML = `
    <div class="stk-head">
      <p>Delegate ${esc(S.ch.stakeDisplay)} to validators who run Terp. Unbonding takes <strong>${unbondDays} days</strong>. Fees are paid in ${esc(S.ch.feeDisplay)}.</p>
    </div>
    <section class="stk-who" id="stk-who" aria-label="Account"></section>
    <section aria-labelledby="stk-h-sum"><h4 id="stk-h-sum">Balance</h4><dl class="stk-kv" id="stk-sum"></dl></section>
    <div class="stk-row" id="stk-main-acts">
      <button type="button" class="stk-btn primary" data-act="delegate">Delegate</button>
      <button type="button" class="stk-btn" data-act="claimAll">Claim all rewards</button>
    </div>
    <section class="stk-sheet" id="stk-sheet" hidden aria-labelledby="stk-sheet-title"></section>
    <section aria-labelledby="stk-h-del"><h4 id="stk-h-del">Delegations and pending rewards</h4><div id="stk-del"></div></section>
    <section aria-labelledby="stk-h-unb"><h4 id="stk-h-unb">Unbonding</h4><div id="stk-unb"></div></section>
    <details id="stk-vals"><summary>Validators · ${S.active.length} active of ${S.all.length}</summary><div style="margin-top:0.5rem">${sortHtml()}</div><div id="stk-vals-body" style="margin-top:0.5rem"></div></details>
    <p class="muted">${S.ch.testnet ? `On ${esc(S.ch.name.toLowerCase())} <code>${esc(S.ch.chainId)}</code> (switch in Connect). ` : ''}Reads from <code>${esc(host)}</code> (LCD). Gas price ${S.gas.amount} ${esc(S.ch.feeDenom)}${S.gas.nodeMin > S.gas.config ? ` (node minimum; site config says ${S.gas.config})` : ''}. Max ${esc(S.params.max_entries)} unbonding entries per validator.</p>`;

  root.addEventListener('click', onClick);

  paintValidators();
  S.viewing = urlAddress() || S.own;
  paintWho();
  S.ready = true;
  await loadAccount();
  return api;

  // ── who ────────────────────────────────────────────────────────────────
  function urlAddress() {
    try { const a = new URLSearchParams(location.search).get('stake'); return a && BECH.test(a) ? a : null; } catch { return null; }
  }
  function setUrlAddress(a) {
    try {
      const u = new URL(location.href);
      if (a && a !== S.own) u.searchParams.set('stake', a); else u.searchParams.delete('stake');
      history.replaceState(history.state, '', u);
    } catch { /* ignore */ }
  }
  // ── signer (lib/staking-signer.js) ─────────────────────────────────────
  function currentSigner() {
    return (S.signers || []).find((o) => o.id === S.signerId) || null;
  }
  function canSign() {
    return !!(S.own && S.viewing === S.own && currentSigner()?.ok);
  }
  function signCtx() {
    return { chainId: S.ch.chainId, rest: S.ch.rest, address: S.own, provider: S.provider, contracts: S.ch.contracts };
  }
  async function loadSigners() {
    if (!S.own || S.viewing !== S.own) return;
    if (S.signersFor === S.own && S.signers) return;
    const who = S.own;
    let list = [];
    try { list = await SG.listSigners(signCtx()); } catch (e) { list = [{ id: 'none', kind: 'none', ok: false, label: 'Wallet', reason: e.message }]; }
    if (S.own !== who) return;
    S.signers = list;
    S.signersFor = who;
    if (!list.some((o) => o.id === S.signerId && o.ok)) S.signerId = SG.pickDefault(list);
    paintWho();
    paintSignWith();
    if (S.sheet) update();
  }
  // fin1: ELI5 first line for a signer that can't be used; the full reason sits behind "why?".
  function signerShort(o) {
    const r = String(o.reason || '');
    if (o.kind === 'keplr') return /not installed/i.test(r) ? 'Keplr isn’t in this browser.' : /active account/i.test(r) ? 'Keplr is on another account.' : 'Keplr can’t sign for this account.';
    if (o.kind === 'passkey') return 'This passkey can’t sign here.';
    if (o.kind === 'eth') return /switched off/i.test(r) ? 'Not available on this network yet.' : 'Needs an Ethereum wallet.';
    if (o.kind === 'abstract') return 'Not supported here yet.';
    return 'Can’t sign this way.';
  }
  function signWithHtml() {
    const list = S.signers;
    if (!S.own || S.viewing !== S.own) return '';
    if (!list) return '<p class="muted" id="stk-signwith">Checking how this account can sign…</p>';
    return `<fieldset class="stk-field stk-signwith" id="stk-signwith" style="border:0;margin:0;padding:0"><legend>Sign with</legend>
      ${list.map((o) => `<label class="stk-check${o.ok ? '' : ' off'}" data-kind="${esc(o.kind)}"><input type="radio" name="signer" value="${esc(o.id)}" ${o.id === S.signerId ? 'checked' : ''} ${o.ok ? '' : 'disabled'}>
        <span><span>${esc(o.label)}</span>${o.mode ? ` <span class="stk-pill unverified">${o.mode === 'amino' ? 'amino-JSON' : 'direct'}</span>` : ''}${o.ok ? '' : `<span class="stk-why">${whyHtml(signerShort(o), o.reason, { tone: '' })}</span>`}</span></label>`).join('')}
    </fieldset>`;
  }
  function paintSignWith() {
    const box = $('#stk-sheet #stk-signwith');
    if (box) box.outerHTML = signWithHtml();
  }
  function adapterFor() {
    const o = currentSigner();
    return o?.ok ? SG.resolveAdapter(o, signCtx()) : null;
  }

  // ── validator order ────────────────────────────────────────────────────
  function sortHtml() {
    const b = (k, t) => `<button type="button" class="stk-btn small" data-act="sort" data-sort="${k}" aria-pressed="${S.order === k}">${t}</button>`;
    return `<div class="stk-sort"><div class="stk-row" role="group" aria-label="Sort validators">${b('spread', 'Spread stake')}${b('power', 'Voting power')}${b('commission', 'Commission')}</div>
      <p class="muted stk-sort-why">Smaller validators come first, lightly shuffled among similar sizes, so new stake spreads out instead of piling onto the top third.</p></div>`;
  }
  function ordered(list) { return T.orderValidators(list, S.order, S.seed); }
  function setOrder(k) {
    if (!['spread', 'power', 'commission'].includes(k)) return;
    S.order = k;
    root.querySelectorAll('button[data-act="sort"]').forEach((x) => x.setAttribute('aria-pressed', String(x.dataset.sort === k)));
    paintValidators();
    root.querySelectorAll('.stk-picker[data-name]').forEach((p) => {
      const checked = p.querySelector('input:checked')?.value || '';
      p.innerHTML = pickerRows(p.dataset.name, p.dataset.exclude || null, checked);
      const q = p.parentElement.querySelector('[data-filter]')?.value.trim().toLowerCase();
      if (q) p.querySelectorAll('label[data-hay]').forEach((l) => { l.hidden = !l.dataset.hay.includes(q); });
    });
  }
  function paintWho() {
    const w = $('#stk-who');
    if (!w) return;
    const mine = S.own && S.viewing === S.own;
    const head = S.viewing
      ? `<div>${mine && S.ownName ? `<div class="name">${esc(S.ownName)}</div>` : ''}<div class="mono">${esc(S.viewing)}</div>
          <div class="stk-row" style="margin-top:0.35rem">${mine ? `<span class="stk-pill current">connected · ${esc(S.provider || 'wallet')}</span>${currentSigner() ? ` <span class="stk-pill" id="stk-signer-pill">signs with ${esc(currentSigner().label)}</span>` : S.signers ? ' <span class="stk-pill err" id="stk-signer-pill">no signer here</span>' : ''}` : '<span class="stk-pill unverified">read-only view</span>'}</div></div>`
      : '<p>Connect a wallet to stake, or look up any address to see its stake.</p>';
    w.innerHTML = `${head}
      <div class="stk-row">
        ${S.own ? (mine ? '' : '<button type="button" class="stk-btn small" data-act="mine">Back to my account</button>') : '<button type="button" class="stk-btn primary small" data-act="connect">Connect</button>'}
        <form class="stk-row" id="stk-look" role="search" style="flex:1;min-width:220px">
          <label class="stk-sr" for="stk-look-in">Address to view</label>
          <input id="stk-look-in" class="stk-input mono" style="flex:1" placeholder="terp1… (view any address)" autocomplete="off" spellcheck="false" value="">
          <button class="stk-btn small" type="submit">View</button>
        </form>
      </div>`;
    w.querySelector('#stk-look').addEventListener('submit', (e) => {
      e.preventDefault();
      const inp = w.querySelector('#stk-look-in');
      const a = inp.value.trim();
      if (!BECH.test(a)) { inp.setAttribute('aria-invalid', 'true'); inp.focus(); return; }
      S.viewing = a;
      setUrlAddress(a);
      closeSheet();
      paintWho();
      loadAccount();
    });
  }

  // ── account reads ──────────────────────────────────────────────────────
  async function loadAccount() {
    loadSigners();
    const a = S.viewing;
    if (!a) { S.acct = null; paintAccount(); return; }
    if (!S.acct || S.acct.address !== a) $('#stk-sum').innerHTML = '<div><dt>Status</dt><dd>Reading…</dd></div>';
    $('#stk-sum').setAttribute('aria-busy', 'true');
    try {
      const acct = await T.fetchAccount(S.ch.rest, a);
      if (S.viewing !== a) return;
      S.acct = { ...acct, address: a };
    } catch (e) {
      S.acct = { error: e.message, address: a };
    }
    $('#stk-sum').removeAttribute('aria-busy');
    paintAccount();
  }

  function bal(denom) {
    return T.microOf((S.acct?.balances || []).find((b) => b.denom === denom)?.amount);
  }
  function rewardsOf(op) {
    return (S.acct?.rewards?.rewards || []).find((r) => r.validator_address === op)?.reward || [];
  }
  function hasRewards(op) { return rewardsOf(op).some((c) => T.microOf(c.amount) > 0n); }

  function valStatus(v) {
    if (!v) return '<span class="stk-pill unverified">unknown</span>';
    if (v.jailed) return '<span class="stk-pill err">jailed</span>';
    if (v.status === 'BOND_STATUS_BONDED') return '<span class="stk-pill current">active</span>';
    if (v.status === 'BOND_STATUS_UNBONDING') return '<span class="stk-pill pending">leaving set</span>';
    return '<span class="stk-pill unverified">inactive</span>';
  }

  function paintAccount() {
    const sum = $('#stk-sum');
    const del = $('#stk-del');
    const unb = $('#stk-unb');
    const acts = $('#stk-main-acts');
    if (!S.acct) {
      sum.innerHTML = '<div><dt>Account</dt><dd>—<small>Connect or view an address</small></dd></div>';
      del.innerHTML = '<p class="stk-empty">No address selected.</p>';
      unb.innerHTML = '<p class="stk-empty">No address selected.</p>';
      acts.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      return;
    }
    if (S.acct.error) {
      sum.innerHTML = `<div><dt>Error</dt><dd>${esc(S.acct.error)}</dd></div>`;
      del.innerHTML = unb.innerHTML = '';
      return;
    }
    const staked = S.acct.delegations.reduce((n, d) => n + T.microOf(d.balance?.amount), 0n);
    const unbonding = S.acct.unbonding.reduce((n, u) => n + u.entries.reduce((m, e) => m + T.microOf(e.balance), 0n), 0n);
    sum.innerHTML = `
      <div><dt>Available</dt><dd>${esc(stakeFmt(bal(S.ch.stakeDenom)))}<small>in the wallet, can be delegated</small></dd></div>
      <div><dt>Staked</dt><dd>${esc(stakeFmt(staked))}<small>${S.acct.delegations.length} validator${S.acct.delegations.length === 1 ? '' : 's'}</small></dd></div>
      <div><dt>Pending rewards</dt><dd>${esc(coinsFmt(S.acct.rewards.total))}<small>claimable now</small></dd></div>
      <div><dt>Unbonding</dt><dd>${esc(stakeFmt(unbonding))}<small>${S.acct.unbonding.reduce((n, u) => n + u.entries.length, 0)} entr${S.acct.unbonding.reduce((n, u) => n + u.entries.length, 0) === 1 ? 'y' : 'ies'}</small></dd></div>
      <div><dt>For fees</dt><dd>${esc(`${fmt(bal(S.ch.feeDenom))} ${S.ch.feeDisplay}`)}<small>fees are paid in ${esc(S.ch.feeDisplay)}</small></dd></div>`;
    acts.querySelector('[data-act="claimAll"]').disabled = !S.acct.rewards.rewards?.some((r) => hasRewards(r.validator_address));

    del.innerHTML = S.acct.delegations.length
      ? `<div class="stk-table-wrap"><table class="stk-table"><thead><tr><th scope="col">Validator</th><th scope="col">Staked</th><th scope="col">Pending rewards</th><th scope="col">Status</th><th scope="col"><span class="stk-sr">Actions</span></th></tr></thead><tbody>
        ${S.acct.delegations.map((d) => {
          const op = d.delegation.validator_address;
          const v = S.byOp.get(op);
          return `<tr>
            <td class="full" data-label="Validator"><span class="val">${esc(moniker(op))}</span>${v ? ` <span class="muted">· ${pct(+v.commission.commission_rates.rate, 0)} commission</span>` : ''}</td>
            <td class="num" data-label="Staked">${esc(stakeFmt(T.microOf(d.balance.amount)))}</td>
            <td class="num" data-label="Pending rewards">${esc(coinsFmt(rewardsOf(op)))}</td>
            <td data-label="Status">${valStatus(v)}</td>
            <td class="full"><div class="acts">
              <button type="button" class="stk-btn small" data-act="claim" data-op="${esc(op)}" ${hasRewards(op) ? '' : 'disabled'}>Claim</button>
              <button type="button" class="stk-btn small" data-act="delegate" data-op="${esc(op)}" ${v && !v.jailed && v.status === 'BOND_STATUS_BONDED' ? '' : 'disabled'}>Add</button>
              <button type="button" class="stk-btn small" data-act="redelegate" data-op="${esc(op)}">Move</button>
              <button type="button" class="stk-btn small warn" data-act="undelegate" data-op="${esc(op)}">Unbond</button>
            </div></td></tr>`;
        }).join('')}</tbody></table></div>`
      : `<p class="stk-empty">No delegations yet.${bal(S.ch.stakeDenom) > 0n ? ' Delegate to start earning.' : ''}</p>`;

    const entries = S.acct.unbonding.flatMap((u) => u.entries.map((e) => ({ op: u.validator_address, ...e })))
      .sort((a, b) => Date.parse(a.completion_time) - Date.parse(b.completion_time));
    unb.innerHTML = entries.length
      ? `<div class="stk-table-wrap"><table class="stk-table"><thead><tr><th scope="col">Validator</th><th scope="col">Amount</th><th scope="col">Completes</th><th scope="col">Status</th></tr></thead><tbody>
        ${entries.map((e) => {
          const t = new Date(e.completion_time);
          const days = Math.max(0, (t - Date.now()) / 86400000);
          return `<tr>
            <td class="full" data-label="Validator"><span class="val">${esc(moniker(e.op))}</span></td>
            <td class="num" data-label="Amount">${esc(stakeFmt(T.microOf(e.balance)))}</td>
            <td data-label="Completes"><time datetime="${esc(e.completion_time)}">${esc(t.toLocaleString(undefined, WHEN))}</time> <span class="muted">· ${days < 1 ? `in ${Math.max(1, Math.round(days * 24))} h` : `in ${days.toFixed(1)} days`}</span></td>
            <td data-label="Status"><span class="stk-pill pending">unbonding</span></td></tr>`;
        }).join('')}</tbody></table></div>`
      : '<p class="stk-empty">Nothing unbonding.</p>';
  }

  function paintValidators() {
    const body = $('#stk-vals-body');
    const inactive = S.all.filter((v) => !(v.status === 'BOND_STATUS_BONDED' && !v.jailed)).sort((a, b) => (BigInt(b.tokens) > BigInt(a.tokens) ? 1 : BigInt(b.tokens) < BigInt(a.tokens) ? -1 : 0));
    const row = (v) => `<tr>
        <td class="num" data-label="#">${v.rank || '—'}</td>
        <td class="full" data-label="Validator"><span class="val">${esc(v.description?.moniker || short(v.operator_address))}</span>${v.cumBefore !== undefined && v.cumBefore < 1 / 3 ? ' <span class="stk-pill unverified">top ⅓</span>' : ''}<br><code class="muted">${esc(short(v.operator_address))}</code></td>
        <td class="num" data-label="Voting power">${v.share !== undefined ? pct(v.share) : '—'} <span class="muted">${esc(T.fromMicro(v.tokens, S.ch.decimals, 0))}</span></td>
        <td class="num" data-label="Commission">${pct(+v.commission.commission_rates.rate, 1)}</td>
        <td data-label="Status">${valStatus(v)}</td>
        <td>${v.rank ? `<button type="button" class="stk-btn small" data-act="delegate" data-op="${esc(v.operator_address)}">Delegate</button>` : ''}</td></tr>`;
    const table = (list) => `<div class="stk-table-wrap"><table class="stk-table"><thead><tr><th scope="col" title="Voting-power rank">#</th><th scope="col">Validator</th><th scope="col">Voting power</th><th scope="col">Commission</th><th scope="col">Status</th><th scope="col"><span class="stk-sr">Action</span></th></tr></thead><tbody>${list.map(row).join('')}</tbody></table></div>`;
    body.innerHTML = `<p class="muted" style="margin-bottom:0.4rem">Those marked <span class="stk-pill unverified">top ⅓</span> together hold over a third of the stake; # is the voting-power rank.</p>
      ${table(ordered(S.active))}
      ${inactive.length ? `<details style="margin-top:0.5rem"><summary>${inactive.length} inactive or jailed (can’t be delegated to here)</summary><div style="margin-top:0.4rem">${table(inactive)}</div></details>` : ''}`;
  }

  // ── actions ────────────────────────────────────────────────────────────
  function onClick(e) {
    const b = e.target.closest('button[data-act]');
    if (!b || !root.contains(b)) return;
    const act = b.dataset.act;
    if (act === 'connect') return connect();
    if (act === 'mine') { S.viewing = S.own; setUrlAddress(null); closeSheet(); paintWho(); loadAccount(); return; }
    if (act === 'close') return closeSheet(true);
    if (act === 'sort') return setOrder(b.dataset.sort);
    if (['delegate', 'redelegate', 'undelegate', 'claim', 'claimAll'].includes(act)) openSheet(act, b.dataset.op || null, b);
  }

  async function connect() {
    const btn = document.getElementById('tn-wallet-btn');
    if (btn) { btn.click(); return; }
    try {
      const m = await import('/lib/wallet-modal.js');
      await m.openWalletModal({ config: S.cfg });
    } catch (e) { console.warn('[staking] connect', e); }
  }

  function closeSheet(restore = false) {
    const sh = $('#stk-sheet');
    if (!sh) return;
    const from = S.sheet?.from;
    S.sheet = null;
    sh.hidden = true;
    sh.innerHTML = '';
    if (restore && from?.isConnected) from.focus();
  }

  function delegationOf(op) {
    return T.microOf(S.acct?.delegations.find((d) => d.delegation.validator_address === op)?.balance?.amount);
  }

  function pickerRows(name, exclude, selected) {
    const list = ordered(S.active.filter((v) => v.operator_address !== exclude));
    return list.map((v) => `<label data-hay="${esc(`${v.description?.moniker || ''} ${v.operator_address}`.toLowerCase())}">
          <input type="radio" name="${name}" value="${esc(v.operator_address)}" ${v.operator_address === selected ? 'checked' : ''}>
          <span class="m">${esc(v.description?.moniker || short(v.operator_address))}</span>
          <span class="mono muted">${pct(+v.commission.commission_rates.rate, 0)} fee</span>
          <span class="meta">#${v.rank} · ${pct(v.share)} of voting power${T.inTopThird(v) ? ' · top ⅓' : ''} · <code>${esc(short(v.operator_address))}</code></span>
        </label>`).join('') || '<p class="stk-empty">No other active validators.</p>';
  }
  function pickerHtml(name, exclude, selected) {
    return `<fieldset class="stk-field" style="border:0;margin:0;padding:0">
      <legend>${name === 'dst' ? 'Move to' : 'Validator'}</legend>
      ${sortHtml()}
      <input type="search" class="stk-input" data-filter placeholder="Search by name or address" aria-label="Search validators" autocomplete="off">
      <div class="stk-picker" role="radiogroup" aria-label="Validators" data-name="${name}" data-exclude="${esc(exclude || '')}">
        ${pickerRows(name, exclude, selected)}
      </div></fieldset>`;
  }

  function openSheet(kind, op, from) {
    if (!S.viewing) { connect(); return; }
    const sh = $('#stk-sheet');
    const titles = { delegate: `Delegate ${S.ch.stakeDisplay}`, redelegate: 'Move stake to another validator', undelegate: 'Unbond', claim: 'Claim rewards', claimAll: 'Claim all rewards' };
    S.sheet = { kind, op, from, estimate: null, busy: false, seq: 0 };
    const amountKind = ['delegate', 'redelegate', 'undelegate'].includes(kind);
    const until = new Date(Date.now() + unbondSecs * 1000);
    const claimOps = kind === 'claimAll' ? (S.acct?.rewards?.rewards || []).filter((r) => hasRewards(r.validator_address)).map((r) => r.validator_address) : [op];
    S.sheet.claimOps = claimOps;
    const untilTxt = until.toLocaleString(undefined, WHEN);
    sh.innerHTML = `
      <div class="stk-head"><h3 id="stk-sheet-title" tabindex="-1">${esc(titles[kind])}</h3><button type="button" class="stk-btn small" data-act="close">Cancel</button></div>
      ${kind === 'delegate' ? pickerHtml('val', null, op || '') : ''}
      ${kind === 'redelegate' || kind === 'undelegate' ? `<p>From <strong>${esc(moniker(op))}</strong> · ${esc(stakeFmt(delegationOf(op)))} staked</p>` : ''}
      ${kind === 'redelegate' ? pickerHtml('dst', op, '') + `<p class="stk-note info">Moving is immediate and the stake keeps earning. Stake you move can’t be moved again from the new validator for ${unbondDays} days. Pending rewards on ${esc(moniker(op))} are paid out to you by the move.</p>` : ''}
      ${kind === 'undelegate' ? `<div class="stk-note" id="stk-unbond-note"><strong>Unbonding takes ${unbondDays} days.</strong> Until about ${esc(untilTxt)} this ${esc(S.ch.stakeDisplay)} earns no rewards, can’t be sent or moved, and can still be slashed if the validator misbehaves. Pending rewards on this validator are paid out when you unbond. If you only want a different validator, use <em>Move</em> instead: it has no waiting period.</div>
        <label class="stk-check"><input type="checkbox" id="stk-ack" aria-describedby="stk-unbond-note"> I understand the ${esc(S.ch.stakeDisplay)} stays locked for ${unbondDays} days.</label>` : ''}
      ${kind === 'claim' || kind === 'claimAll' ? `<p>${claimOps.length ? `${esc(coinsFmt(kind === 'claim' ? rewardsOf(op) : S.acct.rewards.total))} from ${claimOps.length} validator${claimOps.length === 1 ? '' : 's'}${kind === 'claimAll' ? ', in one transaction' : ''}.` : 'No rewards to claim.'}</p>` : ''}
      ${amountKind ? `<div class="stk-field"><label for="stk-amt">Amount (${esc(S.ch.stakeDisplay)})</label>
        <div class="stk-amount"><input id="stk-amt" class="stk-input" inputmode="decimal" autocomplete="off" placeholder="0.0" aria-describedby="stk-amt-help"><button type="button" class="stk-btn small" id="stk-max">Max</button></div>
        <p class="muted" id="stk-amt-help"></p></div>` : ''}
      ${signWithHtml()}
      <div class="stk-est" id="stk-est" aria-live="polite"></div>
      <details id="stk-json"><summary>Messages to sign</summary><pre></pre></details>
      <div class="stk-row"><button type="button" class="stk-btn primary" id="stk-go" disabled>Sign and send</button><span class="muted" id="stk-sign-why"></span></div>
      <p class="stk-status" id="stk-status" role="status" aria-live="polite"></p>`;
    sh.hidden = false;
    sh.querySelectorAll('[data-filter]').forEach((f) => f.addEventListener('input', () => {
      const q = f.value.trim().toLowerCase();
      f.parentElement.querySelectorAll('label[data-hay]').forEach((l) => { l.hidden = q && !l.dataset.hay.includes(q); });
    }));
    sh.addEventListener('change', (e) => {
      if (e.target?.name === 'signer') { S.signerId = e.target.value; paintWho(); }
      update();
    });
    sh.querySelector('#stk-amt')?.addEventListener('input', () => update());
    sh.querySelector('#stk-max')?.addEventListener('click', () => {
      const m = maxFor();
      sh.querySelector('#stk-amt').value = m > 0n ? T.fromMicro(m, S.ch.decimals).replace(/,/g, '') : '0';
      update();
    });
    sh.querySelector('#stk-go').addEventListener('click', () => go());
    sh.querySelector('#stk-sheet-title').focus({ preventScroll: true });
    sh.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    update();
  }

  /**
   * Spendable for this action. Fees are paid in THIOL (fee denom ≠ stake denom on
   * Terp), so Max is the whole TERP balance with nothing held back. The reserve
   * branch only exists for a chain whose fee and stake denoms are the same.
   */
  function maxFor() {
    const k = S.sheet.kind;
    if (k === 'redelegate' || k === 'undelegate') return delegationOf(S.sheet.op);
    const avail = bal(S.ch.stakeDenom);
    if (S.ch.feeDenom !== S.ch.stakeDenom) return avail;
    const est = S.sheet.estimate ? BigInt(S.sheet.estimate.fee[0].amount) : 0n;
    const reserve = (est > 0n ? est * 2n : BigInt(Math.ceil(400000 * S.gas.amount))) ;
    return avail > reserve ? avail - reserve : 0n;
  }

  function buildMsgs() {
    const sh = $('#stk-sheet');
    const k = S.sheet.kind;
    const d = S.viewing;
    const val = sh.querySelector('input[name="val"]:checked')?.value;
    const dst = sh.querySelector('input[name="dst"]:checked')?.value;
    if (k === 'claim' || k === 'claimAll') return T.msgWithdrawAll({ delegator: d, validators: S.sheet.claimOps });
    const raw = sh.querySelector('#stk-amt').value;
    const amount = { denom: S.ch.stakeDenom, amount: T.toMicro(raw, S.ch.decimals).toString() };
    const n = BigInt(amount.amount);
    const max = maxFor();
    if (n > max) throw new Error(`More than ${k === 'delegate' ? 'you can delegate' : 'you have staked here'} (max ${T.fromMicro(max, S.ch.decimals)} ${S.ch.stakeDisplay})`);
    if (k === 'delegate') { if (!val) throw new Error('Pick a validator'); return [T.msgDelegate({ delegator: d, validator: val, amount })]; }
    if (k === 'redelegate') { if (!dst) throw new Error('Pick where to move it'); return [T.msgRedelegate({ delegator: d, src: S.sheet.op, dst, amount })]; }
    const entries = S.acct.unbonding.find((u) => u.validator_address === S.sheet.op)?.entries.length || 0;
    if (entries >= Number(S.params.max_entries)) throw new Error(`This validator already has ${entries} unbonding entries (the chain allows ${S.params.max_entries}). Wait for one to finish.`);
    return [T.msgUndelegate({ delegator: d, validator: S.sheet.op, amount })];
  }

  function update() {
    const sh = $('#stk-sheet');
    if (!S.sheet || !sh) return;
    const help = sh.querySelector('#stk-amt-help');
    if (help) {
      const k = S.sheet.kind;
      const max = maxFor();
      help.textContent = k === 'delegate'
        ? (S.ch.feeDenom !== S.ch.stakeDenom
          ? `${T.fromMicro(max, S.ch.decimals)} ${S.ch.stakeDisplay} available. Fees are paid in ${S.ch.feeDisplay}, so Max can use all of it.`
          : `Max keeps a fee reserve: ${T.fromMicro(max, S.ch.decimals)} ${S.ch.stakeDisplay}.`)
        : `${T.fromMicro(max, S.ch.decimals)} ${S.ch.stakeDisplay} staked with this validator.`;
    }
    const est = sh.querySelector('#stk-est');
    const go = sh.querySelector('#stk-go');
    const why = sh.querySelector('#stk-sign-why');
    const pre = sh.querySelector('#stk-json pre');
    const amtEl = sh.querySelector('#stk-amt');
    S.sheet.estimate = null;
    go.disabled = true;
    let msgs;
    try {
      if (amtEl && !amtEl.value.trim()) throw new Error('');
      msgs = buildMsgs();
      amtEl?.setAttribute('aria-invalid', 'false');
    } catch (e) {
      if (amtEl && e.message && /amount|decimal|max|zero/i.test(e.message)) amtEl.setAttribute('aria-invalid', 'true');
      est.innerHTML = e.message ? `<div style="grid-column:1/-1">${whyHtml(shortLine(e.message, 'Check the amount.'), e.message, { tone: 'err' })}</div>` : '';
      pre.textContent = '';
      why.textContent = '';
      return;
    }
    S.sheet.msgs = msgs;
    pre.textContent = JSON.stringify({ chain_id: S.ch.chainId, messages: T.toProtoJson(msgs) }, null, 2);
    est.innerHTML = '<div><span>Fee</span><span>Estimating…</span></div>';
    const seq = ++S.sheet.seq;
    clearTimeout(timer);
    timer = setTimeout(async () => {
      let pubkey = null;
      let mode = T.SIGN_MODE.direct;
      let extensions = [];
      try {
        const ad = canSign() ? adapterFor() : null;
        if (ad) {
          await ad.prepare?.(msgs.length);
          pubkey = await ad.pubkey();
          mode = ad.mode === 'amino' ? T.SIGN_MODE.amino : T.SIGN_MODE.direct;
          extensions = ad.extensions(msgs.length);
        }
      } catch { /* adapter not ready: estimate on the plain path with the on-chain key */ }
      try {
        const r = await T.simulate({ rest: S.ch.rest, address: S.viewing, msgs, pubkey, gasPrice: S.gas, mode, extensions });
        if (!S.sheet || seq !== S.sheet.seq) return;
        S.sheet.estimate = r;
        const feeU = BigInt(r.fee[0].amount);
        const feeBal = bal(S.ch.feeDenom) - (S.ch.feeDenom === S.ch.stakeDenom && S.sheet.kind === 'delegate' ? T.toMicro(amtEl.value, S.ch.decimals) : 0n);
        const lowFee = feeBal < feeU;
        est.innerHTML = `<div><span>Gas used (simulated)</span><span>${r.gasUsed.toLocaleString('en-US')}</span></div>
          <div><span>Gas limit (×1.4)</span><span>${r.gas.toLocaleString('en-US')}</span></div>
          <div><span>Fee</span><span>${esc(T.fromMicro(feeU, S.ch.decimals))} ${esc(S.ch.feeDisplay)}</span></div>
          ${lowFee ? `<div style="grid-column:1/-1">${whyHtml(`Not enough ${S.ch.feeDisplay} for the fee.`, `The fee is ${T.fromMicro(feeU, S.ch.decimals)} ${S.ch.feeDisplay}; this account has less than that free.`, { tone: 'err' })}</div>` : ''}`;
        const ack = S.sheet.kind !== 'undelegate' || sh.querySelector('#stk-ack')?.checked;
        const ok = canSign() && !lowFee && ack;
        go.disabled = !ok || S.sheet.busy;
        why.textContent = !S.own ? 'Connect a wallet to sign.' : S.viewing !== S.own ? 'Read-only: this is not your connected address.' : !canSign() ? (currentSigner() ? signerShort(currentSigner()) : (S.signers ? 'No way to sign for this account here. See “Sign with”.' : 'Checking how this account can sign…')) : !ack ? 'Tick the unbonding note first.' : '';
      } catch (e) {
        if (!S.sheet || seq !== S.sheet.seq) return;
        est.innerHTML = `<div style="grid-column:1/-1">${whyHtml('The chain would refuse this, so nothing can be sent.', `Simulation failed: ${e.message}`, { tone: 'err' })}</div>`;
        why.textContent = '';
      }
    }, 350);
  }

  async function go() {
    const sh = $('#stk-sheet');
    const st = sh.querySelector('#stk-status');
    const btn = sh.querySelector('#stk-go');
    if (!S.sheet?.estimate || S.sheet.busy) return;
    S.sheet.busy = true;
    btn.disabled = true;
    sh.querySelectorAll('input, .stk-btn').forEach((x) => { if (x !== btn && x.dataset.act !== 'close') x.disabled = true; });
    const link = (h) => (S.ch.explorer ? `<a href="${esc(S.ch.explorer)}/tx/${esc(h)}" target="_blank" rel="noopener"><code>${esc(h)}</code></a>` : `<code>${esc(h)}</code>`);
    const say = (msg, cls = '', hash = '') => { st.className = `stk-status ${cls}`; st.innerHTML = `${esc(msg)}${hash ? `<br>Tx ${link(hash)}` : ''}`; };
    try {
      const adapter = adapterFor();
      const r = await T.signAndBroadcast({ rest: S.ch.rest, chainId: S.ch.chainId, msgs: S.sheet.msgs, estimate: S.sheet.estimate, adapter, onStep: (m, x) => say(m, '', x?.hash || '') });
      say(r.pending ? 'Sent. Not in a block yet; check the explorer.' : `Done in block ${r.height}.`, 'ok', r.hash);
      btn.textContent = 'Sent';
      loadAccount();
    } catch (e) {
      const rejected = /reject|denied|cancel/i.test(e.message || '');
      if (rejected) say('You declined in the wallet. Nothing was sent.', 'err', e.hash || '');
      else { st.className = 'stk-status'; st.innerHTML = whyHtml(`Not sent. ${shortLine(e.message, 'The chain or wallet said no.')}`, e.message, { tone: 'err' }) + (e.hash ? `Tx ${link(e.hash)}` : ''); }
      S.sheet.busy = false;
      sh.querySelectorAll('input, .stk-btn').forEach((x) => { x.disabled = false; });
      update();
    }
  }
}
