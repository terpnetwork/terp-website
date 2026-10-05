// wallet-modal.js — the account panel behind Connect.
// Loaded on demand by lib/fab.js (never at page start). Chain reads, the fee-grant desk
// and smart-account signing live in lib/account-chain.js, imported when a view needs them.
//
// Layout: no backdrop and no box. The panel takes the page column (sub-pages), the
// landing column (home, the mark makes room) or a side drawer (plain pages), with a
// rule in the section colour. Esc, a click outside or Close dismisses it.

import * as TerpWallet from '/lib/wallet.js';
import { loadWasm, registerPasskey, listLocalPasskeys, removeLocalPasskey } from '/lib/auth.js';
import { bindFaucetPanel } from '/lib/faucet.js';
import { detectChainId, setChainIdOverride } from '/lib/config.js';

const STYLE_ID = 'tn-wallet-modal-styles';
const ROOT_ID = 'tn-wallet-modal';
const REOPEN_KEY = 'tn-account-reopen';
const VIEWS = [
  ['network', 'Network'],
  ['passkeys', 'Passkeys'],
  ['name', 'Name'],
  ['smart', 'Smart account'],
  ['abstract', 'Abstract Accounts'],
];

// Smart-account setups, the fee grant and the fee desk open in a later release.
// Until then the Smart account tab shows the account's state and a preview.
const SMART_SETUP_OPEN = false;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const short = (a) => (!a ? '' : a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);

const ctx = {
  opts: {},
  config: {},
  view: 'network',
  chainId: 'morocco-1',
  lastFocus: null,
  cache: new Map(), // per chain+address reads, so switching tabs does not refetch
  grant: null,      // result of a fee-grant request this session
  pendingRemove: null,
  pendingName: null,
  name: null,
  token: 0,
};

let acPromise = null;
const ac = () => (acPromise ||= import('/lib/account-chain.js').catch((e) => { acPromise = null; throw e; }));

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  const R = `#${ROOT_ID}`;
  const T = 'var(--tnw-tint, 152, 232, 193)';
  s.textContent = `
    ${R} { display: none; position: fixed; z-index: 60; box-sizing: border-box; top: calc(var(--tn-chrome-h, 56px) + 8px); right: 12px;
      width: min(440px, calc(100vw - 24px)); max-height: calc(100svh - var(--tn-chrome-h, 56px) - 16px); overflow-y: auto; overscroll-behavior: contain;
      padding: 14px 16px 18px; color: var(--tnw-ink, #e9f7d2); font: 14px/1.5 var(--tn-font, system-ui, sans-serif);
      background: var(--tn-canvas); border: 0; border-top: 1px solid rgba(${T}, .45); text-align: left; }
    ${R}.open { display: block; }
    html[data-tn-world] ${R} { background: none; text-shadow: var(--tnw-halo); }
    ${R} * { box-sizing: border-box; }
    ${R} h2, ${R} h3, ${R} p { margin: 0; }
    ${R} .acc-head { display: flex; align-items: flex-start; gap: 12px; }
    ${R} .acc-id { flex: 1; min-width: 0; }
    ${R} .acc-kicker { font-size: 12px; letter-spacing: .04em; color: var(--tnw-ink-dim, var(--tn-text-muted)); }
    ${R} .acc-kicker b { font-weight: 500; color: rgb(${T}); }
    ${R} h2 { font-size: 20px; font-weight: 500; line-height: 1.3; margin-top: 2px; overflow-wrap: anywhere; }
    ${R} .acc-addr { font: 12px/1.45 var(--tn-font-mono, ui-monospace, monospace); color: var(--tnw-ink-dim, var(--tn-text-muted)); overflow-wrap: anywhere; margin-top: 2px; }
    ${R} .acc-addr.is-empty { font: 13px/1.45 var(--tn-font, system-ui, sans-serif); }
    ${R} .acc-x { flex: none; width: 36px; height: 36px; border: 0; border-radius: 50%; background: none; color: var(--tnw-ink-dim, var(--tn-text-muted)); font: 22px/1 var(--tn-font, system-ui, sans-serif); cursor: pointer; }
    ${R} .acc-x:hover { color: var(--tnw-ink, #e9f7d2); }
    ${R} .acc-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; margin-top: 10px; }
    ${R} button.acc-b, ${R} a.acc-b { display: inline-flex; align-items: center; justify-content: center; min-height: 34px; padding: 5px 14px; border: 0; border-radius: var(--tn-radius-ctl, 2px);
      background: none; color: var(--tnw-ink, #e9f7d2); box-shadow: inset 0 0 0 1px rgba(${T}, .35); font: 500 13px/1.2 var(--tn-font, system-ui, sans-serif);
      text-decoration: none; text-shadow: none; cursor: pointer; }
    ${R} .acc-b:hover:not(:disabled), ${R} .acc-b:focus-visible { box-shadow: inset 0 0 0 1px rgb(${T}); color: var(--tn-text-bright); }
    ${R} .acc-b.primary { color: rgb(${T}); box-shadow: inset 0 0 0 1px rgba(${T}, .6); }
    ${R} .acc-b.warn { color: var(--tn-error); box-shadow: inset 0 0 0 1px rgb(var(--tn-error-rgb) / .45); }
    ${R} .acc-b:disabled { opacity: .45; cursor: not-allowed; }
    ${R} .acc-b.small { min-height: 28px; padding: 3px 10px; font-size: 12px; }
    ${R} :focus-visible { outline: 2px solid rgb(${T}); outline-offset: 2px; }
    ${R} [role="tablist"] { display: flex; flex-wrap: wrap; gap: 4px 18px; margin: 16px 0 0; padding: 0 0 6px; border-bottom: 1px solid rgba(${T}, .18); }
    ${R} [role="tab"] { border: 0; background: none; padding: 6px 0; min-height: 36px; color: var(--tnw-ink-dim, var(--tn-text-muted)); font: 500 14px/1.3 var(--tn-font, system-ui, sans-serif); cursor: pointer; text-shadow: inherit;
      box-shadow: inset 0 -2px 0 transparent; }
    ${R} [role="tab"]:hover { color: var(--tnw-ink, #e9f7d2); }
    ${R} [role="tab"][aria-selected="true"] { color: rgb(${T}); box-shadow: inset 0 -2px 0 rgb(${T}); }
    ${R} .acc-view { padding-top: 6px; }
    ${R} .acc-view:focus { outline: none; }
    ${R} h3 { font-size: 13px; font-weight: 600; letter-spacing: .03em; color: rgb(${T}); margin: 16px 0 4px; }
    ${R} .acc-note { font-size: 13px; color: var(--tnw-ink-dim, var(--tn-text-muted)); margin-top: 6px; }
    ${R} .acc-note a, ${R} .acc-link { color: rgb(${T}); }
    ${R} ul.acc-list { list-style: none; margin: 4px 0 0; padding: 0; }
    ${R} ul.acc-list > li { display: flex; align-items: center; gap: 10px; padding: 8px 0; border-bottom: 1px solid rgba(${T}, .1); }
    ${R} ul.acc-list > li:last-child { border-bottom: 0; }
    ${R} .acc-li-main { flex: 1; min-width: 0; }
    ${R} .acc-li-main > span { display: block; overflow-wrap: anywhere; }
    ${R} .acc-big { font-size: 18px; }
    ${R} .acc-sub { font-size: 12px; color: var(--tnw-ink-dim, var(--tn-text-muted)); }
    ${R} .acc-mono { font-family: var(--tn-font-mono, ui-monospace, monospace); font-size: 12px; }
    ${R} .acc-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; margin-right: 6px; vertical-align: 1px; background: var(--tn-text-muted); }
    ${R} .acc-dot.up { background: var(--tn-teal); } ${R} .acc-dot.down { background: var(--tn-error); } ${R} .acc-dot.wait { background: var(--tn-warn); }
    ${R} .acc-tag { font-size: 11px; font-weight: 600; letter-spacing: .04em; padding: 1px 8px; border-radius: var(--tn-radius-ctl, 2px); color: rgb(${T}); box-shadow: inset 0 0 0 1px rgba(${T}, .5); margin-left: 6px; }
    ${R} label.acc-field { display: block; margin-top: 10px; font-size: 13px; color: var(--tnw-ink-dim, var(--tn-text-muted)); }
    ${R} input.acc-in { display: block; width: 100%; margin-top: 4px; min-height: 36px; padding: 6px 10px; border: 0; border-radius: 6px; background: rgb(var(--tn-tint-rgb) / .04);
      box-shadow: inset 0 0 0 1px rgba(${T}, .28); color: var(--tnw-ink, #e9f7d2); font: 14px/1.3 var(--tn-font, system-ui, sans-serif); text-shadow: none; }
    ${R} select.acc-in { display: block; width: 100%; margin-top: 4px; min-height: 36px; padding: 6px 10px; border: 0; border-radius: 6px; background: var(--tn-canvas);
      box-shadow: inset 0 0 0 1px rgba(${T}, .28); color: var(--tnw-ink, #e9f7d2); font: 13px/1.3 var(--tn-font, system-ui, sans-serif); }
    ${R} .acc-plan pre { margin: 6px 0; }
    ${R} input.acc-in.mono { font-family: var(--tn-font-mono, ui-monospace, monospace); font-size: 12px; }
    ${R} input.acc-in:focus { outline: none; box-shadow: inset 0 0 0 1px rgb(${T}); }
    ${R} fieldset.acc-choice { border: 0; margin: 8px 0 0; padding: 0; }
    ${R} fieldset.acc-choice label { display: flex; gap: 8px; align-items: baseline; padding: 3px 0; font-size: 13px; }
    ${R} fieldset.acc-choice input { accent-color: rgb(${T}); }
    ${R} .acc-msg { font-size: 13px; margin-top: 8px; min-height: 1em; overflow-wrap: anywhere; }
    ${R} .acc-msg.ok { color: var(--tn-teal); } ${R} .acc-msg.err { color: var(--tn-error); }
    ${R} details.acc-tpl { border-bottom: 1px solid rgba(${T}, .1); padding: 6px 0; }
    ${R} .acc-soon { position: relative; margin-top: 8px; }
    ${R} .acc-soon-preview { filter: blur(3px); opacity: .45; pointer-events: none; user-select: none; }
    ${R} .acc-soon-card { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(92%, 360px); text-align: center; padding: 14px 16px; border-radius: 12px; background: rgb(var(--tn-canvas-rgb) / .82); box-shadow: inset 0 0 0 1px rgba(${T}, .35); }
    ${R} .acc-soon-title { margin: 0 0 4px; font-weight: 600; color: rgb(${T}); letter-spacing: .02em; }
    @media (prefers-reduced-transparency: reduce) { ${R} .acc-soon-preview { filter: none; opacity: .25; } }
    ${R} details.acc-tpl summary { cursor: pointer; font-size: 13px; padding: 4px 0; }
    ${R} details.acc-tpl pre { margin: 6px 0; padding: 6px 0 6px 10px; border-left: 2px solid rgba(${T}, .3); white-space: pre-wrap; overflow-wrap: anywhere;
      font: 11.5px/1.45 var(--tn-font-mono, ui-monospace, monospace); color: var(--tnw-ink, #e9f7d2); text-shadow: none; max-height: 260px; overflow: auto; }
    ${R} .acc-status { font-size: 13px; margin-top: 12px; min-height: 1em; color: var(--tnw-ink-dim, var(--tn-text-muted)); }
    ${R} .acc-status.err { color: var(--tn-error); }
    ${R} .wm-faucet-bal { font-size: 13px; margin-top: 4px; }
    ${R} .wm-faucet-result { font-size: 13px; margin-top: 6px; color: var(--tn-teal); } ${R} .wm-faucet-result.err { color: var(--tn-error); }

    /* home: the landing column; the mark moves over to make room */
    html[data-tn-world="home"] ${R} { top: auto; bottom: 0; left: 0; right: auto; width: min(520px, 100%); height: min(700px, calc(100svh - var(--tn-chrome-h, 56px) - 16px));
      max-height: none; padding: 16px 24px 28px; }
    html[data-tn-world="home"][data-tn-account] body > .container > :not(.site-chrome-wrap) { visibility: hidden; }
    /* sub-pages: the page column, like the page's own dialogs */
    html[data-tn-world="panel"] ${R} { top: calc(var(--tn-chrome-h, 56px) + 4px); left: var(--tnw-left); right: 0; bottom: 0; width: auto; max-height: none; padding: 12px 40px 40px 32px; z-index: 200; }
    html[data-tn-world="panel"] ${R} > * { max-width: 640px; }
    @media (max-width: 899px) {
      html[data-tn-world="home"] ${R} { position: absolute; top: calc(var(--tn-chrome-h, 56px) + 34vh + 40px); bottom: auto; right: 0; width: auto; height: auto; overflow: visible; padding: 12px 16px 48px; }
      html[data-tn-world="panel"] ${R} { position: absolute; left: 0; right: 0; bottom: auto; overflow: visible; padding: 12px 16px 48px; }
    }
    @media (prefers-reduced-motion: no-preference) { ${R}.open { animation: tn-acc-in 180ms linear both; } }
    @keyframes tn-acc-in { from { opacity: 0; } to { opacity: 1; } }
  `;
  document.head.appendChild(s);
}

function ensureRoot() {
  injectStyles();
  let root = document.getElementById(ROOT_ID);
  if (root && !root.querySelector('.acc-head')) { root.remove(); root = null; }
  if (root) return root;
  root = document.createElement('section');
  root.id = ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'false');
  root.setAttribute('aria-labelledby', 'acc-title');
  root.innerHTML = `
    <div class="acc-head">
      <div class="acc-id">
        <p class="acc-kicker">Account · <b id="acc-net">Mainnet</b></p>
        <h2 id="acc-title">Not connected</h2>
        <p class="acc-addr" id="acc-addr"></p>
      </div>
      <button type="button" class="acc-x" id="acc-close" aria-label="Close account">×</button>
    </div>
    <div class="acc-row" id="acc-actions"></div>
    <div role="tablist" aria-label="Account sections">
      ${VIEWS.map(([id, label]) => `<button type="button" role="tab" id="acc-tab-${id}" aria-controls="acc-view" aria-selected="false" tabindex="-1" data-view="${id}">${label}</button>`).join('')}
    </div>
    <div class="acc-view" id="acc-view" role="tabpanel" tabindex="0"></div>
    <p class="acc-status" id="acc-status" role="status" aria-live="polite"></p>`;
  document.body.appendChild(root);

  root.querySelector('#acc-close').addEventListener('click', () => closeWalletModal());
  const tabs = [...root.querySelectorAll('[role="tab"]')];
  tabs.forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
  root.querySelector('[role="tablist"]').addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    let j = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') j = (i + 1) % tabs.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') j = (i - 1 + tabs.length) % tabs.length;
    else if (e.key === 'Home') j = 0;
    else if (e.key === 'End') j = tabs.length - 1;
    if (j == null) return;
    e.preventDefault();
    showView(tabs[j].dataset.view);
    tabs[j].focus();
  });

  // Esc closes (before the page's own Esc handling); so does a click outside or going back.
  window.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !isWalletModalOpen()) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    closeWalletModal();
  }, true);
  document.addEventListener('click', (e) => {
    if (!isWalletModalOpen()) return;
    const t = e.target;
    if (!(t instanceof Element) || !t.isConnected) return;
    if (root.contains(t) || t.closest('#tn-wallet-btn') || t.closest('.tn-toast, [class*="toast"]')) return;
    closeWalletModal({ restoreFocus: false });
  });
  window.addEventListener('popstate', () => { if (isWalletModalOpen()) closeWalletModal({ restoreFocus: false }); });
  return root;
}

function setStatus(msg, err = false) {
  const el = document.getElementById('acc-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'acc-status' + (err ? ' err' : '');
}

function netName(id) { return id === '120u-1' ? 'Testnet' : 'Mainnet'; }

async function chainInfo(chainId = ctx.chainId) {
  const m = await ac();
  const c = (await m.chainSlice(chainId)) || {};
  return {
    chainId,
    rpc: c.rpc || '',
    rest: c.rest || '',
    denom: c.denom?.fee || 'uthiol',
    display: c.denom?.feeDisplay || 'THIOL',
    decimals: c.denom?.decimals ?? 6,
    explorer: c.explorer || '',
    contracts: c.contracts || {},
    services: c.services || {},
  };
}

function amount(u, ch) {
  const n = Number(u || 0) / 10 ** (ch?.decimals ?? 6);
  return `${n.toLocaleString(undefined, { maximumFractionDigits: 6 })} ${ch?.display || 'THIOL'}`;
}

function txLink(ch, hash) {
  if (!hash) return '';
  const h = esc(hash);
  return ch.explorer ? `<a class="acc-link" href="${esc(ch.explorer)}/tx/${h}" target="_blank" rel="noopener">${h.slice(0, 12)}…</a>` : `<span class="acc-mono">${h.slice(0, 12)}…</span>`;
}

/** Cached read keyed by view + chain + address. */
function cached(key, fn) {
  const k = `${ctx.chainId}|${TerpWallet.getSnapshot().address || ''}|${key}`;
  if (ctx.cache.has(k)) return ctx.cache.get(k);
  const p = fn().catch((e) => { ctx.cache.delete(k); throw e; });
  ctx.cache.set(k, p);
  return p;
}

// ── header ────────────────────────────────────────────────────────────────

function paintHead() {
  const root = document.getElementById(ROOT_ID);
  if (!root) return;
  const snap = TerpWallet.getSnapshot();
  root.querySelector('#acc-net').textContent = `${netName(ctx.chainId)} · ${ctx.chainId}`;
  // A Billboards name leads; the address follows as the secondary line.
  const name = snap.connected ? (ctx.name || snap.name || null) : null;
  root.querySelector('#acc-title').textContent = snap.connected ? (name || short(snap.address)) : 'Not connected';
  root.querySelector('#acc-title').classList.toggle('is-named', !!name);
  const addr = root.querySelector('#acc-addr');
  addr.textContent = snap.connected ? snap.address : 'Connect a wallet to see your account on Terp.';
  addr.classList.toggle('is-empty', !snap.connected);
  const act = root.querySelector('#acc-actions');
  act.innerHTML = snap.connected
    ? '<button type="button" class="acc-b" id="acc-copy">Copy address</button><button type="button" class="acc-b warn" id="acc-disconnect">Disconnect</button>'
    : '<button type="button" class="acc-b primary" id="acc-keplr">Connect Keplr</button>';
  act.querySelector('#acc-copy')?.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(snap.address); setStatus('Address copied.'); } catch { setStatus('Could not copy.', true); }
  });
  act.querySelector('#acc-disconnect')?.addEventListener('click', async () => {
    await TerpWallet.disconnect();
    ctx.name = null;
    setStatus('Disconnected.');
    repaint();
  });
  act.querySelector('#acc-keplr')?.addEventListener('click', () => connectKeplr());
}

async function connectKeplr() {
  setStatus('Connecting…');
  try {
    await TerpWallet.ensureLibs(ctx.config);
    const next = await TerpWallet.connect(ctx.config, { provider: 'keplr' });
    setStatus(next.connected ? `Connected ${short(next.address)}.` : 'Could not connect.', !next.connected);
    repaint();
  } catch (e) {
    if (e.code === 'NO_WALLET') {
      setStatus('Keplr is not installed in this browser.', true);
      const act = document.getElementById('acc-actions');
      if (act && !act.querySelector('#acc-get-keplr')) act.insertAdjacentHTML('beforeend', '<a class="acc-b" id="acc-get-keplr" href="https://www.keplr.app/download" target="_blank" rel="noopener">Get Keplr</a>');
    } else setStatus(e.message || String(e), true);
  }
}

// ── views ─────────────────────────────────────────────────────────────────

function showView(id) {
  if (!VIEWS.some(([v]) => v === id)) id = 'network';
  ctx.view = id;
  const root = document.getElementById(ROOT_ID);
  for (const t of root.querySelectorAll('[role="tab"]')) {
    const on = t.dataset.view === id;
    t.setAttribute('aria-selected', String(on));
    t.tabIndex = on ? 0 : -1;
  }
  const view = root.querySelector('#acc-view');
  view.setAttribute('aria-labelledby', `acc-tab-${id}`);
  ctx.pendingRemove = null;
  ctx.pendingName = null;
  const fn = { network: viewNetwork, passkeys: viewPasskeys, name: viewName, smart: viewSmart, abstract: viewAbstract }[id];
  const token = ++ctx.token;
  view.innerHTML = '<p class="acc-note">Loading…</p>';
  Promise.resolve(fn(view, () => token === ctx.token)).catch((e) => {
    if (token === ctx.token) view.innerHTML = `<p class="acc-msg err">${esc(e.message || e)}</p>`;
  });
}

function repaint() {
  paintHead();
  if (isWalletModalOpen()) showView(ctx.view);
}

// Network: which one you're on, the status of each, switching, testnet faucet.
async function viewNetwork(view, live) {
  const m = await ac();
  if (!live()) return;
  const snap = TerpWallet.getSnapshot();
  view.innerHTML = `
    <h3>Networks</h3>
    <ul class="acc-list" id="acc-nets">
      ${m.NETWORKS.map((n) => `
        <li data-net="${n.id}">
          <div class="acc-li-main">
            <span>${esc(n.name)} <span class="acc-sub acc-mono">${esc(n.id)}</span>${n.id === ctx.chainId ? '<span class="acc-tag">In use</span>' : ''}</span>
            <span class="acc-sub" data-stat><span class="acc-dot wait"></span>Checking…</span>
          </div>
          ${n.id === ctx.chainId ? '' : `<button type="button" class="acc-b small" data-switch="${n.id}">Use ${esc(n.name.toLowerCase())}</button>`}
        </li>`).join('')}
    </ul>
    <p class="acc-note">Switching reloads the page on the other network. Keplr asks to connect again there.</p>
    ${ctx.chainId === '120u-1' ? `
    <section id="wm-faucet-section">
      <h3>Testnet faucet</h3>
      <p class="acc-sub acc-mono" id="wm-faucet-addr">${esc(snap.address || 'Connect a wallet to receive test tokens')}</p>
      <p class="acc-note" id="wm-faucet-status">Checking the faucet…</p>
      <div class="wm-faucet-bal" id="wm-faucet-bal"></div>
      <div class="acc-row"><button type="button" class="acc-b primary" id="wm-faucet-send" ${snap.connected ? '' : 'disabled'}>Send test tokens</button></div>
      <div class="wm-faucet-result" id="wm-faucet-result"></div>
    </section>` : ''}`;

  for (const b of view.querySelectorAll('[data-switch]')) {
    b.addEventListener('click', () => {
      const id = b.dataset.switch;
      setChainIdOverride(id);
      try { sessionStorage.setItem(REOPEN_KEY, 'network'); } catch { /* ignore */ }
      setStatus(`Switching to ${netName(id)}…`);
      const u = new URL(location.href);
      if (u.searchParams.has('chain')) { u.searchParams.set('chain', id); location.assign(u.toString()); } else location.reload();
    });
  }
  if (ctx.chainId === '120u-1') {
    const ch = await chainInfo('120u-1');
    if (live()) bindFaucetPanel(view, { address: snap.address || ctx.opts.defaultAddress || '', rest: ch.rest, config: ctx.config });
  }
  await Promise.all(m.NETWORKS.map(async (n) => {
    const st = await m.networkStatus(n.id);
    if (!live()) return;
    const el = view.querySelector(`[data-net="${n.id}"] [data-stat]`);
    if (!el) return;
    if (!st.up) el.innerHTML = `<span class="acc-dot down"></span>Offline · ${esc(st.reason)}`;
    else if (st.mismatch) el.innerHTML = `<span class="acc-dot down"></span>Endpoint answers as ${esc(st.network)}`;
    else el.innerHTML = `<span class="acc-dot ${st.catchingUp ? 'wait' : 'up'}"></span>${st.catchingUp ? 'Catching up' : 'Online'} · block ${st.height.toLocaleString()}`;
  }));
}

// Passkeys: this browser's list (add / forget) and the account's on-chain authenticators.
async function viewPasskeys(view, live) {
  const snap = TerpWallet.getSnapshot();
  const local = listLocalPasskeys();
  view.innerHTML = `
    <h3>On this device</h3>
    <ul class="acc-list" id="acc-pk-local">
      ${local.length ? local.map((p) => `
        <li>
          <div class="acc-li-main"><span>${esc(p.label || 'Passkey')}</span>
            <span class="acc-sub"><span class="acc-mono">${esc(short(p.credentialId))}</span> · ${esc(p.rpId || '')} · ${esc((p.createdAt || '').slice(0, 10))}</span></div>
          <button type="button" class="acc-b small warn" data-forget="${esc(p.credentialId)}" aria-label="Remove ${esc(p.label || 'passkey')}">Remove</button>
        </li>`).join('') : '<li><span class="acc-sub">No passkeys saved in this browser yet.</span></li>'}
    </ul>
    <label class="acc-field" for="acc-pk-label">Name for a new passkey</label>
    <input class="acc-in" id="acc-pk-label" maxlength="40" placeholder="e.g. Laptop" autocomplete="off">
    <div class="acc-row"><button type="button" class="acc-b primary" id="acc-pk-add">Add a passkey</button></div>
    <p class="acc-msg" id="acc-pk-msg"></p>
    <p class="acc-note">Removing forgets the passkey in this browser. To delete it for good, remove it from your device’s password settings too.</p>
    <h3>Keys locked by a passkey</h3>
    <div id="acc-pk-dev"></div>
    <h3>On your account</h3>
    <div id="acc-pk-chain"><p class="acc-note">${snap.connected ? 'Loading…' : 'Connect a wallet to see the authenticators on your address.'}</p></div>`;

  const msg = view.querySelector('#acc-pk-msg');
  for (const b of view.querySelectorAll('[data-forget]')) {
    b.addEventListener('click', () => {
      removeLocalPasskey(b.dataset.forget);
      setStatus('Passkey removed from this browser.');
      showView('passkeys');
    });
  }
  view.querySelector('#acc-pk-add').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    msg.className = 'acc-msg';
    msg.textContent = 'Follow your device’s prompt…';
    try {
      if (!window.PublicKeyCredential) throw new Error('This browser does not support passkeys.');
      const ok = await loadWasm();
      if (!ok) throw new Error('Passkeys are not available on this page right now.');
      const label = view.querySelector('#acc-pk-label').value.trim() || 'Terp passkey';
      const r = await registerPasskey({ label, discoverable: false });
      if (!r) { msg.textContent = 'Cancelled.'; return; }
      setStatus(`Passkey “${label}” saved in this browser.`);
      showView('passkeys');
    } catch (err) {
      msg.className = 'acc-msg err';
      msg.textContent = err.message || String(err);
    } finally { btn.disabled = false; }
  });

  const dk = await import('/lib/device-key.js');
  const devBox = view.querySelector('#acc-pk-dev');
  const devKeys = dk.listDeviceKeys(snap.address || undefined);
  const paintDev = (onChain = null) => {
    devBox.innerHTML = devKeys.length ? `<ul class="acc-list">${devKeys.map((k) => `
      <li><div class="acc-li-main"><span>${esc(k.label || 'Key')}</span>
        <span class="acc-sub">${esc((k.createdAt || '').slice(0, 10))}${onChain ? (onChain.has(k.pubkey) ? ' · on your account' : ' · not on your account') : ''}</span></div>
        <button type="button" class="acc-b small warn" data-dev-forget="${esc(k.credentialId)}">Forget</button></li>`).join('')}</ul>
      <p class="acc-note">Forgetting deletes the locked key from this browser. If it is on your account, remove it there first.</p>`
      : '<p class="acc-note">None in this browser.</p>';
    for (const b of devBox.querySelectorAll('[data-dev-forget]')) b.addEventListener('click', () => {
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = 'Confirm forget'; return; }
      dk.forgetDeviceKey(b.dataset.devForget);
      setStatus('Key forgotten in this browser.');
      showView('passkeys');
    });
  };
  paintDev();

  if (!snap.connected) return;
  const m = await ac();
  const ch = await chainInfo();
  const box = view.querySelector('#acc-pk-chain');
  let auths;
  try { auths = await cached('auths', () => m.listAuthenticators(ch.rest, snap.address)); } catch (e) {
    if (live()) box.innerHTML = `<p class="acc-msg err">Could not read authenticators: ${esc(e.message)}</p>`;
    return;
  }
  if (!live()) return;
  const devPubs = new Set(devKeys.map((k) => k.pubkey));
  paintDev(new Set(auths.filter((a) => a.type === m.SIG_TYPE).map((a) => a.config)));
  const kindOf = (a) => devPubs.has(a.config) ? 'Passkey-protected key (this device)' : a.type === m.SIG_TYPE ? 'Wallet key' : a.type === m.COSMWASM_TYPE ? 'Contract authenticator' : a.type === m.ANY_OF_TYPE ? 'Any of several signers' : a.type;
  box.innerHTML = auths.length ? `
    <ul class="acc-list">${auths.map((a) => `
      <li data-auth="${esc(a.id)}">
        <div class="acc-li-main"><span>${esc(kindOf(a))} <span class="acc-sub">#${esc(a.id)}</span></span>
          <span class="acc-sub acc-mono">${esc(m.describeAuthenticator(a))}</span></div>
        <button type="button" class="acc-b small warn" data-remove="${esc(a.id)}">Remove</button>
      </li>`).join('')}</ul>
    <p class="acc-msg" id="acc-rm-msg"></p>
    <p class="acc-note">Removing signs a transaction from this wallet. Keep at least one way to sign.</p>`
    : '<p class="acc-note">None yet. This address signs with its key only.</p>';
  for (const b of box.querySelectorAll('[data-remove]')) b.addEventListener('click', () => removeAuthenticator(b, box, auths));
}

async function removeAuthenticator(btn, box, auths) {
  const id = btn.dataset.remove;
  const out = box.querySelector('#acc-rm-msg');
  if (ctx.pendingRemove !== id) {
    ctx.pendingRemove = id;
    for (const b of box.querySelectorAll('[data-remove]')) b.textContent = 'Remove';
    btn.textContent = `Confirm remove #${id}`;
    out.className = 'acc-msg';
    out.textContent = auths.length === 1 ? 'This is the last authenticator: the address goes back to plain key signing. Press again to sign.' : 'Press again to sign the removal.';
    return;
  }
  ctx.pendingRemove = null;
  btn.disabled = true;
  out.className = 'acc-msg';
  out.textContent = 'Waiting for your wallet…';
  try {
    const m = await ac();
    const ch = await chainInfo();
    const snap = TerpWallet.getSnapshot();
    const r = await m.signAccountMsgs({ chain: ch, provider: snap.provider || 'keplr', address: snap.address,
      messages: [{ typeUrl: m.MSG_REMOVE, value: m.encodeRemove({ sender: snap.address, id }) }] });
    out.className = 'acc-msg ok';
    out.innerHTML = `Sent. Transaction ${txLink(ch, r.txhash)}`;
    ctx.cache.clear();
  } catch (e) {
    out.className = 'acc-msg err';
    out.textContent = e.message || String(e);
    btn.disabled = false;
    btn.textContent = 'Remove';
  }
}

// Name: the Terp Account Billboards username.
async function viewName(view, live) {
  const m = await ac();
  const ch = await chainInfo();
  if (!live()) return;
  const snap = TerpWallet.getSnapshot();
  const minter = ch.contracts.accountMinter, coll = ch.contracts.terp721Account;
  if (!minter || !coll) {
    view.innerHTML = `<p class="acc-note">Names are not available on ${esc(netName(ctx.chainId))} yet.</p>`;
    return;
  }
  view.innerHTML = `
    <h3>Your name</h3>
    <div id="acc-name-mine"><p class="acc-note">${snap.connected ? 'Loading…' : 'Connect a wallet to see your name.'}</p></div>
    <h3>Register a name</h3>
    <label class="acc-field" for="acc-name-in">Name</label>
    <input class="acc-in" id="acc-name-in" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="yourname" maxlength="64">
    <p class="acc-msg" id="acc-name-msg"></p>
    <div class="acc-row">
      <button type="button" class="acc-b" id="acc-name-check">Check</button>
      <button type="button" class="acc-b primary" id="acc-name-reg" disabled>Register</button>
    </div>
    <p class="acc-note">A name points at your address, so people can use it instead of a long address. Short names cost more. <a href="/eco#billboards">Terp Account Billboards</a></p>`;

  const out = view.querySelector('#acc-name-msg');
  const input = view.querySelector('#acc-name-in');
  const reg = view.querySelector('#acc-name-reg');
  const loadParams = () => cached('name-params', () => Promise.all([m.nameParams(ch.rest, minter), m.nameMintStart(ch.rest, minter).catch(() => null)]));
  let params = null, start = null;
  loadParams().then(([p, s]) => { params = p; start = s; }).catch(() => {});

  const resetReg = () => { reg.disabled = true; ctx.pendingName = null; reg.textContent = 'Register'; };
  const check = async () => {
    const name = input.value.trim().toLowerCase();
    input.value = name;
    resetReg();
    try {
      if (!params) [params, start] = await loadParams();
    } catch (e) { out.className = 'acc-msg err'; out.textContent = `Could not read the name registry: ${e.message}`; return; }
    const bad = m.validName(name, params);
    if (bad) { out.className = 'acc-msg err'; out.textContent = bad; return; }
    out.className = 'acc-msg';
    out.textContent = 'Checking…';
    let taken;
    try { taken = await m.nameTaken(ch.rest, minter, name); } catch (e) { out.className = 'acc-msg err'; out.textContent = `Could not check: ${e.message}`; return; }
    if (!live()) return;
    if (taken) { out.className = 'acc-msg err'; out.textContent = `“${name}” is taken.`; return; }
    const price = m.namePrice(name.length, params);
    const opensLater = start && start > new Date();
    const connected = TerpWallet.getSnapshot().connected;
    out.className = 'acc-msg ok';
    out.textContent = `“${name}” is free · ${amount(price, ch)}${opensLater ? ` · registration opens ${start.toLocaleDateString()}` : ''}${connected ? '' : ' · connect a wallet to register'}`;
    reg.disabled = !connected || !!opensLater;
    reg.dataset.name = name;
    reg.dataset.price = price;
  };
  view.querySelector('#acc-name-check').addEventListener('click', check);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); check(); } });
  input.addEventListener('input', resetReg);
  reg.addEventListener('click', async () => {
    const name = reg.dataset.name, price = reg.dataset.price;
    if (ctx.pendingName !== name) {
      ctx.pendingName = name;
      reg.textContent = `Confirm: ${amount(price, ch)}`;
      return;
    }
    ctx.pendingName = null;
    reg.disabled = true;
    out.className = 'acc-msg';
    out.textContent = 'Waiting for your wallet…';
    try {
      await TerpWallet.ensureLibs(ctx.config);
      const s = TerpWallet.getSnapshot();
      const msgs = [
        TerpWallet.MsgExecuteContract({ sender: s.address, contract: coll, msg: { approve_all: { operator: minter } }, funds: [] }),
        TerpWallet.MsgExecuteContract({ sender: s.address, contract: minter, msg: { mint_and_list: { account: name } }, funds: [{ denom: ch.denom, amount: price }] }),
      ];
      const r = await TerpWallet.broadcast(msgs, '');
      const hash = typeof r === 'string' ? r : r?.hash || r?.transactionHash || r?.txhash || '';
      out.className = 'acc-msg ok';
      out.innerHTML = `Registered “${esc(name)}”. ${hash ? `Transaction ${txLink(ch, String(hash))}` : ''}`;
      ctx.cache.clear();
      ctx.name = name;
      TerpWallet.setAccountName(s.address, name);
      paintHead();
    } catch (e) {
      out.className = 'acc-msg err';
      out.textContent = e.message || String(e);
      reg.disabled = false;
      reg.textContent = 'Register';
    }
  });

  if (!snap.connected) return;
  const mine = view.querySelector('#acc-name-mine');
  try {
    const [name, owned] = await cached('names', () => Promise.all([m.nameOf(ch.rest, coll, snap.address), m.namesOwned(ch.rest, coll, snap.address).catch(() => [])]));
    if (!live()) return;
    ctx.name = name || null;
    if ((snap.name || null) !== ctx.name) TerpWallet.setAccountName(snap.address, ctx.name);
    paintHead();
    const others = owned.filter((n) => n !== name);
    mine.innerHTML = `${name ? `<p><span class="acc-big">${esc(name)}</span> <span class="acc-sub">points at this address</span></p>` : '<p class="acc-note">No name points at this address yet.</p>'}
      ${others.length ? `<p class="acc-note">Also yours: ${others.map(esc).join(', ')}</p>` : ''}`;
  } catch (e) {
    if (live()) mine.innerHTML = `<p class="acc-msg err">Could not read names: ${esc(e.message)}</p>`;
  }
}

// Smart account: status now; fee grant and setups that sign for real open later (SMART_SETUP_OPEN).
const UNAVAILABLE = [
  {
    id: 'passkey-contract',
    title: 'Passkey as a contract authenticator',
    reason: 'Not offered. The passkey contract on Terp (code 84) checks the credential id and site but does not verify the passkey’s signature yet, so it would not protect the account. Use a passkey-protected key on this device instead.',
  },
  {
    id: 'redpallas',
    title: 'RedPallas signature (Penumbra-style offline signing)',
    reason: 'Not available. Terp smart accounts verify secp256k1 keys natively and other schemes through contracts, and no RedPallas authenticator contract exists on Terp yet.',
  },
];

// Abstract Accounts owned by this wallet (read-only).
async function viewAbstract(view, live) {
  const m = await ac();
  const ch = await chainInfo();
  if (!live()) return;
  const snap = TerpWallet.getSnapshot();
  view.innerHTML = `
    <p class="acc-note">Abstract Accounts are modular smart-contract accounts on Terp. Here are the ones this wallet owns.</p>
    <div id="acc-sa-abs"><p class="acc-note">${ch.contracts.abstractRegistry ? (snap.connected ? 'Loading…' : 'Connect a wallet to list the Abstract Accounts you own.') : `Not available on ${esc(netName(ctx.chainId))}.`}</p></div>`;
  if (!snap.connected || !ch.contracts.abstractRegistry) return;
  const abs = view.querySelector('#acc-sa-abs');
  try {
    const r = await cached('abstract', () => m.abstractAccountsOf(ch.rest, ch.contracts.abstractRegistry, snap.address));
    const named = await Promise.all(r.accounts.map(async (a) => ({ ...a, billboard: await TerpWallet.lookupAccountName(a.address, { ...ctx.config, rest: ch.rest, chainId: ctx.chainId, accountContract: ch.contracts.terp721Account }).catch(() => null) })));
    if (!live()) return;
    abs.innerHTML = named.length
      ? `<ul class="acc-list">${named.map((a) => `<li><div class="acc-li-main"><span>${esc(a.billboard || a.name || `Account ${a.seq}`)} <span class="acc-sub">${a.billboard && a.name ? `${esc(a.name)} · ` : ''}local-${esc(a.seq)}</span></span><span class="acc-sub acc-mono">${esc(a.address)}</span></div></li>`).join('')}</ul>`
      : `<p class="acc-note">You don’t own an Abstract Account on Terp yet${r.total > r.scanned ? ` (checked the latest ${r.scanned} of ${r.total})` : ''}. Create one with <a href="https://docs.abstract.money" target="_blank" rel="noopener">Abstract</a>.</p>`;
  } catch (e) {
    if (live()) abs.innerHTML = `<p class="acc-msg err">Could not read Abstract Accounts: ${esc(e.message)}</p>`;
  }
}

function smartStateHtml(m, auths, params, pkIds) {
  const active = params ? params.is_smart_account_active !== false : null;
  return `
        <p>${auths.length ? `Smart account · ${auths.length} authenticator${auths.length > 1 ? 's' : ''}` : 'Plain key account'}</p>
        ${auths.length ? `<ul class="acc-list">${auths.map((a) => `<li><div class="acc-li-main"><span>${esc(pkIds.has(a.id) ? 'Passkey' : a.type === m.SIG_TYPE ? 'Key' : a.type)} <span class="acc-sub">#${esc(a.id)} · ${esc(a.type)}</span></span><span class="acc-sub acc-mono">${esc(m.describeAuthenticator(a))}</span></div></li>`).join('')}</ul>` : ''}
        <p class="acc-note">${active === false ? 'Smart accounts are switched off on this network right now.' : active ? 'Smart accounts are on for this network.' : ''}</p>`;
}

// What the Smart account tab shows until setups open: the real state plus a preview.
const SOON_HTML = `
    <div class="acc-soon">
      <div class="acc-soon-preview" aria-hidden="true" inert>
        <h3>Fee grant</h3>
        <p class="acc-note">Setup fees covered for addresses with a history on Terp.</p>
        <div class="acc-row"><button type="button" class="acc-b primary" tabindex="-1" disabled>Sign and request</button></div>
        <h3>Set up and sign</h3>
        <details class="acc-tpl"><summary>Add this wallet’s key</summary></details>
        <details class="acc-tpl"><summary>Add a passkey-protected key on this device</summary></details>
        <details class="acc-tpl"><summary>Add an Ethereum wallet</summary></details>
        <details class="acc-tpl"><summary>Any one of several signers</summary></details>
      </div>
      <div class="acc-soon-card" role="note">
        <p class="acc-soon-title">Coming soon</p>
        <p class="acc-sub">Add passkeys, Ethereum wallets and backup signers to your account, with setup fees covered for eligible addresses.</p>
      </div>
    </div>`;

async function viewSmartSoon(view, live, m, ch, snap) {
  view.innerHTML = `
    <h3>This address</h3>
    <div id="acc-sa-state"><p class="acc-note">${snap.connected ? 'Loading…' : 'Connect a wallet to see its smart account.'}</p></div>
    ${SOON_HTML}`;
  if (!snap.connected) return;
  const st = view.querySelector('#acc-sa-state');
  try {
    const dk = await import('/lib/device-key.js');
    const [p, auths] = await Promise.all([cached('sa-params', () => m.smartAccountParams(ch.rest)).catch(() => null), cached('auths', () => m.listAuthenticators(ch.rest, snap.address))]);
    const pkIds = await passkeyAuthIds(m, ch, auths, dk.listDeviceKeys(snap.address));
    if (live()) st.innerHTML = smartStateHtml(m, auths, p, pkIds);
  } catch (e) {
    if (live()) st.innerHTML = `<p class="acc-msg err">Could not read the account: ${esc(e.message)}</p>`;
  }
}

async function passkeyAuthIds(m, ch, auths, deviceKeys) {
  const ids = new Set();
  const pubs = new Set(deviceKeys.map((k) => k.pubkey));
  for (const a of auths) {
    if (a.type === m.SIG_TYPE && pubs.has(a.config)) ids.add(a.id);
    if (a.type === m.ANY_OF_TYPE && (m.compositeSubs(a) || []).some((x) => x.type === m.SIG_TYPE && pubs.has(x.config))) ids.add(a.id);
  }
  const code = Number(ch.contracts.passkeyAuthenticatorCode || 0);
  if (code) {
    for (const e of m.cosmwasmEntries(auths)) {
      if (ids.has(e.id)) continue;
      try { if ((await m.contractCodeId(ch.rest, e.contract)) === code) ids.add(e.id); } catch { /* skip */ }
    }
  }
  return ids;
}

async function viewSmart(view, live) {
  const m = await ac();
  const dk = await import('/lib/device-key.js');
  const ch = await chainInfo();
  if (!live()) return;
  const snap = TerpWallet.getSnapshot();
  if (!SMART_SETUP_OPEN) return viewSmartSoon(view, live, m, ch, snap);
  view.innerHTML = `
    <h3>This address</h3>
    <div id="acc-sa-state"><p class="acc-note">${snap.connected ? 'Loading…' : 'Connect a wallet to see its smart account.'}</p></div>
    <h3>Fee grant</h3>
    <p class="acc-note">The fee desk pays the fee for adding authenticators and sends a little THIOL to start.</p>
    <p class="acc-sub" id="acc-desk"><span class="acc-dot wait"></span>Checking the fee desk…</p>
    <div id="acc-g-age">
      <p class="acc-sub">For addresses older than 30 days. Signing a message is free.</p>
      <p class="acc-note">Your Ethereum wallet (for example MetaMask) signs a short message naming this address, then Keplr signs the same message. Nothing is sent to the chain. The desk checks that this address signed a transaction more than <span id="acc-age-days">30</span> days ago.</p>
      <details class="acc-tpl"><summary>Message you will sign</summary><pre id="acc-age-msg"></pre></details>
      <div class="acc-row"><button type="button" class="acc-b primary" id="acc-age-go" ${snap.connected ? '' : 'disabled'}>Sign and request</button></div>
    </div>
    <p class="acc-msg" id="acc-sa-msg"></p>
    <h3>Set up and sign</h3>
    <p class="acc-note">Each setup shows the exact messages first. Nothing is signed until you confirm.</p>
    <div id="acc-tpl"><p class="acc-note">${snap.connected ? 'Loading…' : 'Connect a wallet to set up its smart account.'}</p></div>`;

  const out = view.querySelector('#acc-sa-msg');
  let desk = null;
  const say = (el, text, cls = '') => { el.className = `acc-msg${cls ? ` ${cls}` : ''}`; el.textContent = text; };

  // fee grant: by account age
  const agePreview = (ethAddress = '0x…') => m.ethAgeMessage({ address: snap.address || 'terp1…', ethAddress, chainId: ctx.chainId, nonce: '…', issuedAt: m.isoSeconds() });
  view.querySelector('#acc-age-msg').textContent = agePreview();
  const grantDone = (r) => {
    ctx.grant = r;
    out.className = 'acc-msg ok';
    const age = r.eligibility?.first_tx?.time ? ` First transaction ${esc(String(r.eligibility.first_tx.time).slice(0, 10))}.` : '';
    out.innerHTML = `Fee grant ready${r.granter ? ` from <span class="acc-mono">${esc(short(r.granter))}</span>` : ''}.${age}${r.txhash ? ` Transaction ${txLink(ch, r.txhash)}.` : ''}${r.runwayTx ? ` Starter THIOL ${txLink(ch, r.runwayTx)}.` : ''} Setups below can now use it.`;
    paintTemplates();
  };
  view.querySelector('#acc-age-go').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    btn.disabled = true;
    try {
      const s = TerpWallet.getSnapshot();
      if (!desk?.ethAge) throw new Error('The fee desk does not offer this yet.');
      say(out, 'Asking your Ethereum wallet…');
      const eth = await m.ethAccount();
      const message = m.ethAgeMessage({ address: s.address, ethAddress: eth, chainId: ctx.chainId, nonce: m.newNonce(), issuedAt: m.isoSeconds() });
      view.querySelector('#acc-age-msg').textContent = message;
      const sig = await m.ethPersonalSign(message, eth);
      say(out, 'Now approve the same message in Keplr…');
      const cosmos = await m.cosmosSignArbitrary(ctx.chainId, s.provider || 'keplr', s.address, message);
      say(out, 'Asking the fee desk…');
      grantDone(await m.requestEthAgeGrant({ chainId: ctx.chainId, address: s.address, message, signature: sig.hex, cosmosSignature: cosmos, minDays: desk.ethAgeDays }));
    } catch (err) {
      say(out, err.message || String(err), 'err');
    } finally { btn.disabled = !TerpWallet.getSnapshot().connected; }
  });

  // setups
  let auths = [];
  let deviceKeys = [];
  let pkIds = new Set();
  let ethSigners = [];
  const ethCode = Number(ch.contracts.ethAuthenticatorCode || 0);

  const signerOptions = () => {
    const opts = [{ value: 'wallet', label: 'This wallet (Keplr)' }];
    for (const k of deviceKeys) if (m.findAuthForKey(auths, k.pubkey)) opts.push({ value: `device:${k.credentialId}`, label: `Passkey-protected key · ${k.label}` });
    for (const e of ethSigners) opts.push({ value: `eth:${e.id}:${e.signer}`, label: `Ethereum wallet ${short(e.signer)}` });
    return opts;
  };
  const resolveSigner = async (value) => {
    if (!value || value === 'wallet') return { kind: 'wallet' };
    if (value.startsWith('device:')) return { kind: 'device', wallet: await dk.unlockDeviceKey(value.slice(7)) };
    const [, authId, account] = value.split(':');
    const now = await m.ethAccount();
    if (now !== account) throw new Error(`Switch your Ethereum wallet to ${short(account)} first.`);
    return { kind: 'eth', authId, account };
  };

  // Each setup: build() → { steps: [{ label, messages | next(prev), gas, grantable }], preview }
  const s0 = () => TerpWallet.getSnapshot();
  const keplrPub = async () => {
    const pub = await m.signerPubkey(ch.chainId, s0().provider || 'keplr');
    if (!pub) throw new Error('This needs Keplr or Leap (direct signing).');
    return pub;
  };
  const ethSteps = (addr, eth, finalData) => ([
    { label: 'Create the Ethereum authenticator contract', gas: 500000, grantable: false,
      messages: [m.instantiateMsg({ sender: addr, admin: addr, codeId: ethCode, label: `terp-eth ${eth}`, msg: { owner: addr, signer: eth } })] },
    { label: 'Add it to the account', gas: 700000, grantable: true, next: (prev) => {
      const contract = m.instantiatedAddress(prev);
      if (!contract) throw new Error('Could not read the new contract address. Check the first transaction, then try again.');
      return finalData(contract);
    } },
  ]);
  const ethMember = (contract, eth) => m.cosmwasmAuthData(contract, { eth_address: eth });

  const setups = () => {
    const s = s0();
    const addr = s.address;
    const devBlock = dk.deviceKeyBlocker();
    const ethBlock = !ethCode ? `No Ethereum authenticator contract on ${netName(ctx.chainId)}.` : !m.ethProvider() ? 'No Ethereum wallet (such as MetaMask) in this browser.' : '';
    const list = [
      { id: 'key', title: 'Add this wallet’s key',
        note: 'Makes the address a smart account approved by the key it already has. Data is the 33-byte public key.',
        build: async () => {
          const pub = await keplrPub();
          return { steps: [{ label: 'Add authenticator', gas: 400000, grantable: true, messages: [m.addMsg(addr, m.SIG_TYPE, m.b64ToBytes(pub), pub)] }] };
        } },
      { id: 'device', title: 'Add a passkey-protected key on this device',
        note: 'Creates a key in this browser, locked by a passkey (Face ID, Touch ID, Windows Hello or a security key), and adds it to the account. The passkey unlocks the key; the key signs.',
        blocked: devBlock,
        build: async () => {
          let rec = deviceKeys.find((k) => !m.findAuthForKey(auths, k.pubkey));
          if (!rec) {
            setStatus('Follow your device’s passkey prompt…');
            rec = await dk.createDeviceKey({ label: 'This device', account: addr });
            if (!rec) throw new Error('Cancelled.');
            deviceKeys = dk.listDeviceKeys(addr);
            setStatus('Key created and locked by your passkey.');
          }
          return { steps: [{ label: 'Add authenticator', gas: 400000, grantable: true, messages: [m.addMsg(addr, m.SIG_TYPE, m.b64ToBytes(rec.pubkey), rec.pubkey)] }] };
        } },
      { id: 'eth', title: 'Add an Ethereum wallet',
        note: 'Lets an Ethereum wallet approve this account’s transactions with a personal signature (EIP-191). Two transactions: create your authenticator contract (code ' + (ethCode || '—') + '), then add it.',
        blocked: ethBlock,
        build: async () => {
          const eth = await m.ethAccount();
          return { steps: ethSteps(addr, eth, (contract) => [m.addMsg(addr, m.COSMWASM_TYPE, ethMember(contract, eth), { contract, params: { eth_address: eth } })]) };
        } },
      { id: 'anyof', title: 'Any one of several signers',
        note: 'One AnyOf authenticator: any listed signer can approve. Pick at least two.',
        options: [
          { id: 'key', label: 'This wallet’s key', on: true },
          { id: 'device', label: 'Passkey-protected key on this device', blocked: devBlock },
          { id: 'eth', label: 'Ethereum wallet', blocked: ethBlock },
          { id: 'passkey', label: 'Passkey (contract)', blocked: 'Not offered: the passkey contract does not verify signatures yet.' },
          { id: 'redpallas', label: 'RedPallas', blocked: 'Not available on Terp yet.' },
        ],
        build: async (picked) => {
          if (picked.length < 2) throw new Error('Pick at least two signers.');
          const subs = [];
          const shown = [];
          if (picked.includes('key')) { const pub = await keplrPub(); subs.push(m.subAuth(m.SIG_TYPE, m.b64ToBytes(pub))); shown.push({ type: m.SIG_TYPE, config: pub }); }
          if (picked.includes('device')) {
            let rec = deviceKeys[0];
            if (!rec) {
              setStatus('Follow your device’s passkey prompt…');
              rec = await dk.createDeviceKey({ label: 'This device', account: addr });
              if (!rec) throw new Error('Cancelled.');
              deviceKeys = dk.listDeviceKeys(addr);
            }
            subs.push(m.subAuth(m.SIG_TYPE, m.b64ToBytes(rec.pubkey)));
            shown.push({ type: m.SIG_TYPE, config: rec.pubkey });
          }
          const data = (extra = []) => m.compositeData([...subs, ...extra]);
          if (!picked.includes('eth')) return { steps: [{ label: 'Add authenticator', gas: 500000, grantable: true, messages: [m.addMsg(addr, m.ANY_OF_TYPE, data(), shown)] }] };
          const eth = await m.ethAccount();
          return { steps: ethSteps(addr, eth, (contract) => {
            const member = m.subAuth(m.COSMWASM_TYPE, ethMember(contract, eth));
            return [m.addMsg(addr, m.ANY_OF_TYPE, data([member]), [...shown, { type: m.COSMWASM_TYPE, config: { contract, params: { eth_address: eth } } }])];
          }) };
        } },
    ];
    if (pkIds.size) {
      list.push({ id: 'remove-passkey', title: 'Remove passkey authenticator',
        note: 'Removes a passkey authenticator from the account. Keep at least one other way to sign.',
        pick: auths.filter((a) => pkIds.has(a.id)),
        build: async (_p, id) => ({ steps: [{ label: 'Remove authenticator', gas: 300000, grantable: false, messages: [m.removeMsg(addr, id)] }] }) });
    }
    list.push({ id: 'remove', title: 'Remove an authenticator',
      note: 'Removes one authenticator. Signed by the account; if it has other authenticators, one of them can approve.',
      blocked: auths.length ? '' : 'This address has no authenticators yet.',
      pick: auths,
      build: async (_p, id) => ({ steps: [{ label: 'Remove authenticator', gas: 300000, grantable: false, messages: [m.removeMsg(addr, id)] }] }) });
    return list;
  };

  const authLabel = (a) => `#${a.id} · ${pkIds.has(a.id) ? 'passkey · ' : ''}${a.type === m.SIG_TYPE ? 'key' : a.type} · ${m.describeAuthenticator(a)}`;

  function paintTemplates() {
    if (!live()) return;
    const box = view.querySelector('#acc-tpl');
    const s = s0();
    if (!s.connected) { box.innerHTML = '<p class="acc-note">Connect a wallet to set up its smart account.</p>'; return; }
    const list = setups();
    const signers = signerOptions();
    box.innerHTML = list.map((t) => `
      <details class="acc-tpl" data-tpl="${t.id}"><summary>${esc(t.title)}${t.blocked ? ' <span class="acc-sub">· unavailable</span>' : ''}</summary>
        <p class="acc-sub">${esc(t.note)}</p>
        ${t.blocked ? `<p class="acc-note">${esc(t.blocked)}</p>` : `
        ${t.options ? `<fieldset class="acc-choice"><legend class="acc-sub">Signers</legend>${t.options.map((o) => `<label><input type="checkbox" value="${o.id}" ${o.on && !o.blocked ? 'checked' : ''} ${o.blocked ? 'disabled' : ''}> ${esc(o.label)}${o.blocked ? ` <span class="acc-sub">(${esc(o.blocked)})</span>` : ''}</label>`).join('')}</fieldset>` : ''}
        ${t.pick ? `<label class="acc-field">Authenticator<select class="acc-in" data-pick>${t.pick.map((a) => `<option value="${esc(a.id)}">${esc(authLabel(a))}</option>`).join('')}</select></label>` : ''}
        ${signers.length > 1 ? `<label class="acc-field">Sign with<select class="acc-in" data-signer>${signers.map((o) => `<option value="${esc(o.value)}">${esc(o.label)}</option>`).join('')}</select></label>` : ''}
        <div class="acc-plan"></div>
        <div class="acc-row"><button type="button" class="acc-b primary" data-go>Sign &amp; broadcast</button><button type="button" class="acc-b small" data-cancel hidden>Cancel</button></div>
        <p class="acc-msg" data-out></p>`}
      </details>`).join('') + UNAVAILABLE.map((u) => `
      <details class="acc-tpl" data-tpl="${u.id}"><summary>${esc(u.title)} <span class="acc-sub">· unavailable</span></summary><p class="acc-note">${esc(u.reason)}</p></details>`).join('');
    for (const t of list) {
      if (t.blocked) continue;
      const el = box.querySelector(`[data-tpl="${t.id}"]`);
      wireTemplate(t, el);
    }
  }

  function wireTemplate(t, el) {
    const go = el.querySelector('[data-go]');
    const cancel = el.querySelector('[data-cancel]');
    const plan = el.querySelector('.acc-plan');
    const res = el.querySelector('[data-out]');
    let ready = null;
    const reset = () => { ready = null; plan.innerHTML = ''; go.textContent = 'Sign & broadcast'; cancel.hidden = true; };
    el.addEventListener('change', (e) => { if (!e.target.closest('[data-signer]')) reset(); });
    cancel.addEventListener('click', () => { reset(); say(res, 'Cancelled. Nothing was signed.'); });
    go.addEventListener('click', async () => {
      go.disabled = true;
      try {
        if (!ready) {
          // Step 1: build the real messages and show them. Nothing is signed yet.
          say(res, 'Preparing…');
          const picked = [...el.querySelectorAll('input[type="checkbox"]:checked')].map((x) => x.value);
          const id = el.querySelector('[data-pick]')?.value;
          const built = await t.build(picked, id);
          const grant = ctx.grant?.granter || '';
          plan.innerHTML = built.steps.map((st, i) => {
            const payer = grant && st.grantable ? `the fee grant (<span class="acc-mono">${esc(short(grant))}</span>)` : `this address, about ${esc(amount(Math.ceil(st.gas * 0.025), ch))}`;
            return `<p class="acc-sub">${built.steps.length > 1 ? `Transaction ${i + 1} of ${built.steps.length}: ` : ''}${esc(st.label)} · fee paid by ${payer}</p>
              <pre>${esc(JSON.stringify(st.messages ? m.describeMsgs(st.messages) : '(filled in from transaction 1: the new contract address)', null, 2))}</pre>`;
          }).join('');
          ready = built;
          go.textContent = built.steps.length > 1 ? `Confirm and sign ${built.steps.length} transactions` : 'Confirm and sign';
          cancel.hidden = false;
          say(res, 'Check the messages, then confirm. Your wallet asks before anything is sent.');
          return;
        }
        // Step 2: confirmed. Sign and broadcast each transaction in order.
        const s = s0();
        const signer = await resolveSigner(el.querySelector('[data-signer]')?.value);
        const hashes = [];
        let prev = null;
        for (const [i, st] of ready.steps.entries()) {
          const messages = st.messages || st.next(prev);
          say(res, ready.steps.length > 1 ? `Waiting for your wallet (${i + 1} of ${ready.steps.length})…` : 'Waiting for your wallet…');
          const r = await m.signAccountMsgs({ chain: ch, provider: s.provider || 'keplr', address: s.address, messages, gas: st.gas,
            feeGranter: st.grantable ? ctx.grant?.granter || '' : '', signer: i === 0 ? signer : { kind: 'wallet' } });
          hashes.push(r.txhash);
          if (i < ready.steps.length - 1) {
            say(res, 'Waiting for the transaction to land…');
            prev = await m.waitTx(ch.rest, r.txhash);
            if (!prev) throw new Error(`Transaction ${r.txhash.slice(0, 12)}… has not landed yet. Check it, then try again.`);
            if (prev.code) throw new Error(prev.raw_log || `Transaction failed (code ${prev.code})`);
          }
        }
        res.className = 'acc-msg ok';
        res.innerHTML = `Sent. ${hashes.map((h) => `Transaction ${txLink(ch, h)}`).join(' · ')}`;
        ctx.cache.clear();
        reset();
        setTimeout(() => { if (live()) refreshAccount(); }, 6000);
      } catch (err) {
        say(res, err.message || String(err), 'err');
        if (!ready) reset();
      } finally { go.disabled = false; }
    });
  }

  async function refreshAccount() {
    const s = s0();
    if (!s.connected) { paintTemplates(); return; }
    const st = view.querySelector('#acc-sa-state');
    deviceKeys = dk.listDeviceKeys(s.address);
    try {
      const [p, list] = await Promise.all([cached('sa-params', () => m.smartAccountParams(ch.rest)).catch(() => null), cached('auths', () => m.listAuthenticators(ch.rest, s.address))]);
      auths = list;
      [pkIds, ethSigners] = await Promise.all([passkeyAuthIds(m, ch, auths, deviceKeys), m.ethAuthenticators(ch.rest, auths, ethCode).catch(() => [])]);
      if (!live()) return;
      st.innerHTML = smartStateHtml(m, auths, p, pkIds);
    } catch (e) {
      if (live()) st.innerHTML = `<p class="acc-msg err">Could not read the account: ${esc(e.message)}</p>`;
    }
    paintTemplates();
  }

  const tasks = [];
  tasks.push(m.onboardStatus(ctx.chainId).then((d) => {
    desk = d;
    if (!live()) return;
    const el = view.querySelector('#acc-desk');
    if (!d.ok) { el.innerHTML = `<span class="acc-dot down"></span>Fee desk unavailable · ${esc(d.reason || 'not ready')}`; return; }
    const covers = (d.allowed || []).map((u) => u.split('.').pop()).join(', ') || 'MsgAddAuthenticator';
    el.innerHTML = `<span class="acc-dot up"></span>Fee desk ready · pays from <span class="acc-mono">${esc(short(d.feeGranter))}</span> · covers ${esc(covers)}${d.spendLimit ? ` up to ${esc(amount(d.spendLimit, ch))}` : ''}${d.runway ? ` · sends ${esc(amount(d.runway, ch))} to start` : ''}`;
    view.querySelector('#acc-age-days').textContent = String(d.ethAgeDays || 30);
    if (!d.ethAge) {
      const go = view.querySelector('#acc-age-go');
      go.disabled = true;
      go.insertAdjacentHTML('afterend', '<span class="acc-sub">The fee desk does not offer this yet.</span>');
    }
  }).catch(() => {}));

  if (snap.connected) {
    tasks.push(refreshAccount());
  } else paintTemplates();
  await Promise.all(tasks);
}

// ── open / close ──────────────────────────────────────────────────────────

let walletUnsub = null;

/**
 * @param {{ config?: object, isTestnet?: boolean, defaultAddress?: string,
 *   onNetworkToggle?: () => void, focusFaucet?: boolean, view?: string }} [opts]
 */
export async function openWalletModal(opts = {}) {
  const root = ensureRoot();
  const wasOpen = isWalletModalOpen();
  ctx.opts = opts;
  ctx.config = opts.config || window.__TERP_CONFIG || {};
  ctx.chainId = ctx.config.chainId || detectChainId();
  if (!wasOpen) ctx.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  if (opts.focusFaucet) ctx.view = 'network';
  else if (opts.view) ctx.view = opts.view;

  if (!walletUnsub) {
    walletUnsub = TerpWallet.onWalletChange(() => { if (isWalletModalOpen()) { ctx.cache.clear(); repaint(); } }, { persistent: true });
  }
  root.classList.add('open');
  document.getElementById('tn-wallet-btn')?.setAttribute('aria-expanded', 'true');
  setStatus('');
  paintHead();
  showView(ctx.view);
  if (!wasOpen) root.querySelector(`#acc-tab-${ctx.view}`)?.focus({ preventScroll: true });
  if (opts.focusFaucet) requestAnimationFrame(() => root.querySelector('#wm-faucet-section')?.scrollIntoView({ block: 'nearest' }));
}

export function closeWalletModal({ restoreFocus = true } = {}) {
  const root = document.getElementById(ROOT_ID);
  if (!root || !root.classList.contains('open')) return;
  root.classList.remove('open');
  ctx.token++;
  const btn = document.getElementById('tn-wallet-btn');
  btn?.setAttribute('aria-expanded', 'false');
  if (restoreFocus) (btn || ctx.lastFocus)?.focus({ preventScroll: true });
}

export function isWalletModalOpen() {
  return !!document.getElementById(ROOT_ID)?.classList.contains('open');
}

export { REOPEN_KEY };
