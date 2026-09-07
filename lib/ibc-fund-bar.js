// ibc-fund-bar.js — foundation relayer balances + deposit helpers (widget-only)
// Deposit UI uses the same modal language as wallet-modal / site account chrome.

import {
  formatAmount,
  fundRelayerAccount,
  loadFoundationBalances,
} from '/lib/ibc-core.js';

const STYLE_ID = 'ibc-fund-bar-styles';
const ROOT_ID = 'ibc-fund-bar';
const MODAL_ID = 'ibc-fund-modal';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #${ROOT_ID} {
      width: 100%;
      box-sizing: border-box;
      margin-bottom: 0.85rem;
      padding: 0.35rem 0 0.65rem;
      border-bottom: 1px solid var(--border, rgba(152,232,193,0.14));
    }
    #${ROOT_ID}.ifb-embedded {
      background: transparent;
      border-radius: 0;
      border-top: none;
      margin-top: 0;
    }
    #${ROOT_ID} .ifb-head {
      display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between;
      gap: 0.5rem 1rem; margin-bottom: 0.55rem;
    }
    #${ROOT_ID} .ifb-head-compact {
      justify-content: flex-end;
      margin-bottom: 0.4rem;
    }
    #${ROOT_ID} .ifb-title {
      font-size: 0.82rem; letter-spacing: 0.08em; text-transform: uppercase;
      color: var(--teal, #98e8c1); font-weight: 600;
    }
    #${ROOT_ID} .ifb-sub {
      font-size: 0.88rem; color: var(--text-dim, #6272a4); max-width: 52rem; line-height: 1.5;
    }
    #${ROOT_ID} .ifb-actions { display: flex; gap: 0.4rem; align-items: center; }
    #${ROOT_ID} .ifb-btn {
      font-size: 0.82rem; padding: 0.4rem 0.75rem; border-radius: 999px;
      border: 1px solid rgba(152,232,193,0.3); background: rgba(152,232,193,0.08);
      color: #98e8c1; cursor: pointer; font-family: inherit;
    }
    #${ROOT_ID} .ifb-btn:hover { background: rgba(152,232,193,0.16); }
    #${ROOT_ID} .ifb-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    #${ROOT_ID} .ifb-row {
      display: flex; gap: 0.5rem; overflow-x: auto; padding-bottom: 0.15rem;
      scrollbar-width: thin;
    }
    #${ROOT_ID} .ifb-card {
      flex: 0 0 auto; min-width: 148px; max-width: 180px;
      padding: 0.5rem 0.6rem;
      border-radius: 8px;
      border: 1px solid rgba(255,255,255,0.08);
      background: rgba(0,0,0,0.35);
    }
    #${ROOT_ID} .ifb-card.low {
      border-color: rgba(255,184,108,0.55);
      box-shadow: 0 0 0 1px rgba(255,184,108,0.12);
    }
    #${ROOT_ID} .ifb-card.unset {
      opacity: 0.55; border-style: dashed;
    }
    #${ROOT_ID} .ifb-chain {
      display: flex; align-items: center; gap: 0.35rem;
      font-size: 0.9rem; font-weight: 600; color: #f8f8f2;
      margin-bottom: 0.2rem;
    }
    #${ROOT_ID} .ifb-dot {
      width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0;
    }
    #${ROOT_ID} .ifb-bal {
      font-size: 1.05rem; font-variant-numeric: tabular-nums;
      color: #98e8c1; margin-bottom: 0.15rem;
    }
    #${ROOT_ID} .ifb-bal small {
      font-size: 0.75rem; color: #6272a4; margin-left: 0.2rem;
    }
    #${ROOT_ID} .ifb-addr {
      font-size: 0.75rem; color: #6272a4; font-family: var(--tn-font-mono);
      word-break: break-all; margin-bottom: 0.4rem; min-height: 1.6em;
    }
    #${ROOT_ID} .ifb-card-actions {
      display: flex; gap: 0.3rem;
    }
    #${ROOT_ID} .ifb-mini {
      flex: 1; font-size: 0.78rem; padding: 0.35rem;
      border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);
      background: transparent; color: #d2d3d8; cursor: pointer; font-family: inherit;
    }
    #${ROOT_ID} .ifb-mini:hover { border-color: #98e8c1; color: #98e8c1; }
    #${ROOT_ID} .ifb-mini.primary {
      border-color: rgba(152,232,193,0.4); color: #98e8c1;
    }
    #${ROOT_ID} .ifb-status {
      font-size: 0.7rem; color: #6272a4; margin-top: 0.4rem;
    }
    #${ROOT_ID} .ifb-status.err { color: #fe7d7d; }
    #${ROOT_ID} .ifb-status.ok { color: #98e8c1; }

    /* Fund modal — same language as #tn-wallet-modal (account chrome) */
    #${MODAL_ID} {
      position: fixed; inset: 0; z-index: 100100; /* above site FAB (z≈99999) */
      display: none; align-items: center; justify-content: center;
      padding: 1rem;
      background: rgba(0,0,0,0.72);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    #${MODAL_ID}.open { display: flex; }
    #${MODAL_ID} .ifm-panel {
      width: min(440px, 100%);
      max-height: min(90vh, 720px);
      overflow: auto;
      background: linear-gradient(165deg, rgba(20,22,28,0.98), rgba(8,10,14,0.98));
      border: 1px solid rgba(152, 232, 193, 0.22);
      border-radius: 14px;
      box-shadow: 0 16px 60px rgba(0,0,0,0.55);
      color: #f8f8f2;
      font-family: var(--tn-font, 'Satoshi', system-ui, sans-serif);
      padding: 1.15rem 1.2rem 1.25rem;
    }
    #${MODAL_ID} .ifm-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 0.75rem; margin-bottom: 0.85rem;
    }
    #${MODAL_ID} .ifm-kicker {
      font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase;
      color: #98e8c1; margin-bottom: 0.2rem;
    }
    #${MODAL_ID} .ifm-title {
      font-size: 1.15rem; font-weight: 600; color: #cfffcf; margin: 0;
      display: flex; align-items: center; gap: 0.45rem;
    }
    #${MODAL_ID} .ifm-dot {
      width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0;
    }
    #${MODAL_ID} .ifm-close {
      width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
      background: transparent; color: #6272a4; font-size: 1.15rem; cursor: pointer; flex-shrink: 0;
    }
    #${MODAL_ID} .ifm-close:hover { color: #f8f8f2; border-color: #98e8c1; }
    #${MODAL_ID} .ifm-section {
      margin-bottom: 0.9rem; padding-bottom: 0.85rem;
      border-bottom: 1px solid rgba(152,232,193,0.1);
    }
    #${MODAL_ID} .ifm-section:last-of-type { border-bottom: none; margin-bottom: 0.5rem; padding-bottom: 0; }
    #${MODAL_ID} .ifm-label {
      font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
      color: #6272a4; margin-bottom: 0.45rem;
    }
    #${MODAL_ID} .ifm-addr {
      font-family: var(--tn-font-mono, ui-monospace, monospace);
      font-size: 0.82rem; color: #98e8c1; word-break: break-all;
      background: rgba(0,0,0,0.35); border: 1px solid rgba(152,232,193,0.12);
      border-radius: 8px; padding: 0.5rem 0.65rem; width: 100%;
      box-sizing: border-box;
    }
    #${MODAL_ID} .ifm-meta {
      font-size: 0.82rem; color: #a0a8c0; line-height: 1.45; margin-top: 0.35rem;
    }
    #${MODAL_ID} .ifm-meta.low { color: #ffb86c; }
    #${MODAL_ID} .ifm-note {
      font-size: 0.78rem; color: #6272a4; line-height: 1.5; margin-top: 0.35rem;
    }
    #${MODAL_ID} .ifm-input-wrap {
      display: flex; align-items: stretch; gap: 0;
      border: 1px solid rgba(152,232,193,0.18);
      border-radius: 10px; overflow: hidden;
      background: rgba(0,0,0,0.35);
    }
    #${MODAL_ID} .ifm-input-wrap:focus-within {
      border-color: rgba(152,232,193,0.45);
      box-shadow: 0 0 0 2px rgba(152,232,193,0.08);
    }
    #${MODAL_ID} .ifm-input {
      flex: 1; min-width: 0;
      font-family: var(--tn-font-mono, ui-monospace, monospace);
      font-size: 1.05rem; font-variant-numeric: tabular-nums;
      color: #f8f8f2; background: transparent; border: none;
      padding: 0.65rem 0.75rem; outline: none;
    }
    #${MODAL_ID} .ifm-denom {
      display: flex; align-items: center;
      padding: 0 0.85rem;
      font-size: 0.82rem; font-weight: 600; letter-spacing: 0.04em;
      color: #98e8c1; background: rgba(152,232,193,0.06);
      border-left: 1px solid rgba(152,232,193,0.12);
      text-transform: uppercase;
    }
    #${MODAL_ID} .ifm-presets {
      display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.55rem;
    }
    #${MODAL_ID} .ifm-btn {
      font-family: inherit; font-size: 0.85rem; font-weight: 500;
      padding: 0.45rem 0.75rem; border-radius: 999px; cursor: pointer;
      border: 1px solid rgba(152,232,193,0.3); background: rgba(152,232,193,0.08);
      color: #98e8c1;
    }
    #${MODAL_ID} .ifm-btn:hover { background: rgba(152,232,193,0.16); }
    #${MODAL_ID} .ifm-btn.primary {
      background: #98e8c1; color: #0a0a0f; border-color: #98e8c1;
    }
    #${MODAL_ID} .ifm-btn.ghost {
      border-color: rgba(255,255,255,0.12); color: #a0a8c0; background: transparent;
    }
    #${MODAL_ID} .ifm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    #${MODAL_ID} .ifm-actions {
      display: flex; flex-wrap: wrap; gap: 0.45rem; justify-content: flex-end;
      margin-top: 0.35rem;
    }
    #${MODAL_ID} .ifm-status {
      font-size: 0.8rem; min-height: 1.2em; margin-top: 0.55rem; color: #98e8c1;
    }
    #${MODAL_ID} .ifm-status.err { color: #fe7d7d; }
    #${MODAL_ID} .ifm-base {
      font-size: 0.75rem; color: #6272a4; font-family: var(--tn-font-mono, ui-monospace, monospace);
      margin-top: 0.4rem;
    }
  `;
  document.head.appendChild(s);
}

function shortAddr(a) {
  if (!a) return '— not configured —';
  if (a.length < 16) return a;
  return `${a.slice(0, 10)}…${a.slice(-6)}`;
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function displayDenom(denom) {
  if (!denom) return 'TOKEN';
  return denom.startsWith('u') && denom.length > 1 ? denom.slice(1).toUpperCase() : denom.toUpperCase();
}

/** Human decimal string → base integer string (no scientific notation). */
function humanToBase(human, decimals) {
  const raw = String(human ?? '').trim().replace(/,/g, '');
  if (!raw || !/^\d+(\.\d+)?$/.test(raw)) return null;
  const [whole, frac = ''] = raw.split('.');
  const d = Math.max(0, Number(decimals) || 0);
  const fracPadded = (frac + '0'.repeat(d)).slice(0, d);
  const base = `${whole.replace(/^0+(?=\d)/, '') || '0'}${fracPadded}`.replace(/^0+(?=\d)/, '') || '0';
  return base;
}

function defaultHumanAmount(acct, meta) {
  const decimals = meta.decimals ?? acct.decimals ?? 6;
  const one = 10 ** decimals;
  try {
    if (acct.raw != null && BigInt(acct.raw) < BigInt(one)) return '1';
  } catch { /* ignore */ }
  return '5';
}

/** @type {null | ((v: string|null) => void)} */
let fundModalSettle = null;

function closeFundModal(result = null) {
  const root = document.getElementById(MODAL_ID);
  if (root) root.classList.remove('open');
  const settle = fundModalSettle;
  fundModalSettle = null;
  if (settle) settle(result);
}

/**
 * Site-styled deposit dialog (matches wallet-modal chrome).
 * @returns {Promise<string|null>} base amount string, or null if cancelled
 */
function openFundModal({ acct, meta }) {
  injectStyles();
  // Cancel any prior open dialog
  if (fundModalSettle) closeFundModal(null);

  let root = document.getElementById(MODAL_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = MODAL_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'ifm-title');
    document.body.appendChild(root);
    root.addEventListener('click', (e) => {
      if (e.target === root) closeFundModal(null);
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && root.classList.contains('open')) closeFundModal(null);
    });
  }

  const decimals = meta.decimals ?? acct.decimals ?? 6;
  const denomLabel = displayDenom(acct.denom || meta.denom);
  const baseDenom = acct.denom || meta.denom || '';
  const defaultHuman = defaultHumanAmount(acct, meta);
  const balLine =
    acct.display && acct.display !== '…' && acct.display !== '—'
      ? `${acct.display} ${denomLabel.toLowerCase()}`
      : acct.configured
        ? 'balance loading or unavailable'
        : 'not configured';

  root.innerHTML = `
    <div class="ifm-panel">
      <div class="ifm-head">
        <div>
          <div class="ifm-kicker">Foundation relayer</div>
          <h2 class="ifm-title" id="ifm-title">
            <span class="ifm-dot" style="background:${esc(acct.color || meta.color || '#98e8c1')}"></span>
            <span>Deposit ${esc(acct.name || meta.name || 'gas')}</span>
          </h2>
        </div>
        <button type="button" class="ifm-close" id="ifm-close" aria-label="Close">×</button>
      </div>

      <div class="ifm-section">
        <div class="ifm-label">Destination</div>
        <div class="ifm-addr" id="ifm-addr">${esc(acct.address)}</div>
        <div class="ifm-meta ${acct.low ? 'low' : ''}">
          Seat balance: ${esc(balLine)}${acct.low ? ' · low gas' : ''}
        </div>
        <div class="ifm-note">
          Top up public Hermes so ${esc(meta.name || 'this chain')} ↔ Terp paths keep relaying.
          Wallet must be on <strong>${esc(meta.chain_id || acct.chainId)}</strong>.
        </div>
      </div>

      <div class="ifm-section">
        <div class="ifm-label">Amount</div>
        <div class="ifm-input-wrap">
          <input class="ifm-input" id="ifm-amount" type="text" inputmode="decimal"
            autocomplete="off" spellcheck="false" value="${esc(defaultHuman)}"
            aria-label="Deposit amount in ${esc(denomLabel)}" />
          <span class="ifm-denom">${esc(denomLabel)}</span>
        </div>
        <div class="ifm-presets">
          <button type="button" class="ifm-btn ghost" data-preset="1">1 ${esc(denomLabel)}</button>
          <button type="button" class="ifm-btn ghost" data-preset="5">5 ${esc(denomLabel)}</button>
          <button type="button" class="ifm-btn ghost" data-preset="10">10 ${esc(denomLabel)}</button>
        </div>
        <div class="ifm-base" id="ifm-base"></div>
      </div>

      <div class="ifm-actions">
        <button type="button" class="ifm-btn ghost" id="ifm-cancel">Cancel</button>
        <button type="button" class="ifm-btn" id="ifm-copy">Copy address</button>
        <button type="button" class="ifm-btn primary" id="ifm-submit">Deposit with Keplr</button>
      </div>
      <div class="ifm-status" id="ifm-status"></div>
    </div>
  `;

  const amountEl = root.querySelector('#ifm-amount');
  const baseEl = root.querySelector('#ifm-base');
  const statusEl = root.querySelector('#ifm-status');
  const submitBtn = root.querySelector('#ifm-submit');

  const paintBase = () => {
    const base = humanToBase(amountEl.value, decimals);
    if (!base || base === '0') {
      baseEl.textContent = `Enter amount · ${baseDenom || 'base denom'} (×10^${decimals})`;
      return null;
    }
    baseEl.textContent = `= ${base} ${baseDenom}`;
    return base;
  };
  paintBase();
  amountEl.addEventListener('input', paintBase);

  root.querySelectorAll('[data-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      amountEl.value = btn.getAttribute('data-preset') || '1';
      paintBase();
      amountEl.focus();
    });
  });

  const setModalStatus = (msg, err = false) => {
    statusEl.textContent = msg || '';
    statusEl.className = 'ifm-status' + (err ? ' err' : '');
  };

  root.querySelector('#ifm-close').onclick = () => closeFundModal(null);
  root.querySelector('#ifm-cancel').onclick = () => closeFundModal(null);
  root.querySelector('#ifm-copy').onclick = async () => {
    try {
      await navigator.clipboard.writeText(acct.address);
      setModalStatus('Address copied');
    } catch {
      setModalStatus('Copy failed', true);
    }
  };

  submitBtn.onclick = () => {
    const base = paintBase();
    if (!base || base === '0') {
      setModalStatus('Enter a valid amount', true);
      amountEl.focus();
      return;
    }
    closeFundModal(base);
  };

  amountEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      submitBtn.click();
    }
  });

  root.classList.add('open');
  requestAnimationFrame(() => {
    amountEl.focus();
    amountEl.select();
  });

  return new Promise((resolve) => {
    fundModalSettle = resolve;
  });
}

/**
 * @param {HTMLElement} mountEl
 * @param {{
 *   ctx: object,
 *   embedded?: boolean,
 *   onNotify?: (msg:string, type?:string)=>void,
 *   getUserAddress?: ()=>string|null,
 * }} opts
 */
export async function mountFundBar(mountEl, opts) {
  const { ctx, embedded = false, onNotify = () => {}, getUserAddress = () => null } = opts;
  if (!mountEl) return;
  injectStyles();

  // Always own a single root under the provided mount (reparent if misplaced)
  let root = document.getElementById(ROOT_ID);
  if (!root) {
    root = document.createElement('div');
    root.id = ROOT_ID;
  }
  if (root.parentElement !== mountEl) {
    mountEl.prepend(root);
  }
  root.classList.toggle('ifb-embedded', !!embedded);

  let loading = false;
  let snapshots = [];

  const paint = () => {
    const relayer = snapshots[0];
    const accounts = relayer?.accounts || [];
    // Embedded in Relayer gas card: no page-header-style title strip
    const headHtml = embedded
      ? `<div class="ifb-head ifb-head-compact">
          <div class="ifb-actions">
            <button type="button" class="ifb-btn" id="ifb-refresh" data-act="refresh" ${loading ? 'disabled' : ''}>
              ${loading ? 'Refreshing…' : 'Refresh balances'}
            </button>
          </div>
        </div>`
      : `<div class="ifb-head">
          <div>
            <div class="ifb-title">Live balances · deposit</div>
            <div class="ifb-sub">
              ${relayer?.label || 'Foundation relayer'} —
              ${relayer?.note || 'Top up low chains so public IBC paths keep relaying.'}
            </div>
          </div>
          <div class="ifb-actions">
            <button type="button" class="ifb-btn" id="ifb-refresh" data-act="refresh" ${loading ? 'disabled' : ''}>
              ${loading ? 'Refreshing…' : 'Refresh balances'}
            </button>
          </div>
        </div>`;
    root.innerHTML = `
      ${headHtml}
      <div class="ifb-row">
        ${accounts
          .map(
            (a) => `
          <div class="ifb-card ${a.low ? 'low' : ''} ${a.configured ? '' : 'unset'}" data-chain="${esc(a.chainId)}">
            <div class="ifb-chain">
              <span class="ifb-dot" style="background:${esc(a.color)}"></span>
              <span>${esc(a.name)}</span>
            </div>
            <div class="ifb-bal">
              ${a.configured ? esc(a.display) : '—'}
              <small>${esc((a.denom || '').replace(/^u/, '') || '')}${a.low ? ' · low' : ''}</small>
            </div>
            <div class="ifb-addr" title="${esc(a.address || '')}">${esc(shortAddr(a.address))}</div>
            <div class="ifb-card-actions">
              <button type="button" class="ifb-mini" data-act="copy" data-addr="${esc(a.address || '')}" ${a.configured ? '' : 'disabled'}>Copy</button>
              <button type="button" class="ifb-mini primary" data-act="fund" data-chain="${esc(a.chainId)}" ${a.configured ? '' : 'disabled'}>Deposit</button>
            </div>
          </div>`,
          )
          .join('')}
      </div>
      <div class="ifb-status" id="ifb-status"></div>
    `;
    // Clicks use delegated handler on root (bound once) so balance re-paints never drop Deposit.
  };

  function setStatus(msg, kind = '') {
    const el = root.querySelector('#ifb-status');
    if (!el) return;
    el.textContent = msg || '';
    el.className = 'ifb-status' + (kind ? ` ${kind}` : '');
  }

  async function onFund(chainId) {
    const relayer = snapshots[0];
    const acct = relayer?.accounts?.find((a) => a.chainId === chainId);
    if (!acct?.address) {
      setStatus('Account not configured for this chain', 'err');
      return;
    }
    // Prefer chain registry; fall back to seat metadata so modal always opens
    const meta =
      Object.values(ctx.chains || {}).find((c) => c.chain_id === chainId) ||
      (acct.chainKey && ctx.chains?.[acct.chainKey]) ||
      {
        key: acct.chainKey || chainId,
        chain_id: chainId,
        name: acct.name || chainId,
        denom: acct.denom,
        decimals: acct.decimals ?? 6,
        color: acct.color,
        icon: acct.icon,
        rpc: acct.rpc,
        rest: acct.rest,
      };

    const amountBase = await openFundModal({ acct, meta });
    if (amountBase == null) return;

    setStatus('Opening Keplr…');
    try {
      const result = await fundRelayerAccount({
        chain: meta,
        toAddress: acct.address,
        amountBase,
      });
      setStatus(`Sent · tx ${result.txHash?.slice(0, 16) || ''}…`, 'ok');
      onNotify(`Funded ${meta.name || acct.name} relayer`, 'success');
      await refresh();
    } catch (e) {
      console.error(e);
      setStatus(e.message || String(e), 'err');
      onNotify(e.message || 'Deposit failed', 'error');
    }
  }

  /** Seats from config only — always paint even when LCD/proxy is down. */
  function seatsFromConfig() {
    const relayers = ctx.foundationRelayers || [];
    if (!relayers.length) {
      return [
        {
          id: 'empty',
          label: 'Foundation Hermes',
          note: 'Add ibc.foundationRelayers in public/config.json',
          accounts: Object.values(ctx.chains || {})
            .filter((c) => c.rest || c.restDirect)
            .map((c) => ({
              chainId: c.chain_id,
              name: c.name,
              color: c.color,
              icon: c.icon,
              address: '',
              configured: false,
              denom: c.denom,
              display: '—',
              low: false,
            })),
        },
      ];
    }
    return relayers.map((relayer) => ({
      id: relayer.id,
      label: relayer.label,
      note: relayer.note || '',
      accounts: Object.entries(relayer.accounts || {}).map(([chainId, acct]) => {
        const meta =
          Object.values(ctx.chains || {}).find((c) => c.chain_id === chainId) ||
          ctx.chains?.[acct.chainKey];
        return {
          chainId,
          chainKey: acct.chainKey || meta?.key,
          name: meta?.name || chainId,
          color: meta?.color || '#666',
          icon: meta?.icon || '·',
          address: acct.address || '',
          configured: !!acct.address,
          denom: acct.denom || meta?.denom,
          decimals: meta?.decimals ?? 6,
          display: acct.address ? '…' : 'not set',
          raw: null,
          low: false,
        };
      }),
    }));
  }

  async function refresh() {
    // Always show donation seats first (config), then fill balances
    if (!snapshots.length) {
      snapshots = seatsFromConfig();
      paint();
    }
    loading = true;
    paint();
    try {
      const live = await loadFoundationBalances(ctx);
      if (live?.length) snapshots = live;
      loading = false;
      paint();
      const configured = snapshots[0]?.accounts?.filter((a) => a.configured).length || 0;
      const withBal = snapshots[0]?.accounts?.filter((a) => a.raw != null).length || 0;
      const low = snapshots[0]?.accounts?.filter((a) => a.low).length || 0;
      setStatus(
        configured
          ? `Seats ${configured} · balances ${withBal}/${configured}${low ? ` · ${low} low` : ''}`
          : 'Configure foundation addresses in config.json → ibc.foundationRelayers',
        configured ? 'ok' : '',
      );
      void getUserAddress;
      void formatAmount;
    } catch (e) {
      loading = false;
      if (!snapshots.length) snapshots = seatsFromConfig();
      paint();
      setStatus(
        `${e.message || 'Balance query failed'} — seats still shown; copy address to deposit`,
        'err',
      );
    }
  }

  // One-time delegated actions — survives paint() innerHTML swaps
  if (!root.dataset.ifbBound) {
    root.dataset.ifbBound = '1';
    root.addEventListener('click', (e) => {
      const btn = e.target?.closest?.('[data-act]');
      if (!btn || !root.contains(btn) || btn.disabled) return;
      const act = btn.getAttribute('data-act');
      if (act === 'refresh') {
        e.preventDefault();
        refresh();
        return;
      }
      if (act === 'copy') {
        e.preventDefault();
        const addr = btn.getAttribute('data-addr');
        if (!addr) return;
        navigator.clipboard
          .writeText(addr)
          .then(() => {
            setStatus('Address copied', 'ok');
            onNotify('Relayer address copied', 'success');
          })
          .catch(() => setStatus('Copy failed', 'err'));
        return;
      }
      if (act === 'fund') {
        e.preventDefault();
        e.stopPropagation();
        void onFund(btn.getAttribute('data-chain'));
      }
    });
  }

  // Immediate seats (no wait on proxy/LCD)
  snapshots = seatsFromConfig();
  paint();
  await refresh();
  return { refresh };
}
