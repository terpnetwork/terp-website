// wallet-modal.js — Account / authenticator popup for site chrome
// Opens a centered modal: session info, Keplr connect, passkey+secp256k1 register, network.

import * as TerpWallet from '/lib/wallet.js';
import {
  loadWasm,
  registerPasskeyForAccount,
  listLocalPasskeys,
  clearLocalPasskeys,
} from '/lib/auth.js';
import { resolveSmartAccountContract } from '/lib/auth-extension.js';
import { bindFaucetPanel } from '/lib/faucet.js';

const STYLE_ID = 'tn-wallet-modal-styles';
const ROOT_ID = 'tn-wallet-modal';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #${ROOT_ID} {
      position: fixed; inset: 0; z-index: 10050;
      display: none; align-items: center; justify-content: center;
      padding: 1rem;
      background: rgba(0,0,0,0.72);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
    }
    #${ROOT_ID}.open { display: flex; }
    #${ROOT_ID} .wm-panel {
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
    #${ROOT_ID} .wm-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 0.75rem; margin-bottom: 0.85rem;
    }
    #${ROOT_ID} .wm-kicker {
      font-size: 0.7rem; letter-spacing: 0.12em; text-transform: uppercase;
      color: #98e8c1; margin-bottom: 0.2rem;
    }
    #${ROOT_ID} .wm-title {
      font-size: 1.15rem; font-weight: 600; color: #cfffcf; margin: 0;
    }
    #${ROOT_ID} .wm-close {
      width: 32px; height: 32px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.12);
      background: transparent; color: #6272a4; font-size: 1.15rem; cursor: pointer; flex-shrink: 0;
    }
    #${ROOT_ID} .wm-close:hover { color: #f8f8f2; border-color: #98e8c1; }
    #${ROOT_ID} .wm-section {
      margin-bottom: 0.9rem; padding-bottom: 0.85rem;
      border-bottom: 1px solid rgba(152,232,193,0.1);
    }
    #${ROOT_ID} .wm-section:last-child { border-bottom: none; margin-bottom: 0; padding-bottom: 0; }
    #${ROOT_ID} .wm-label {
      font-size: 0.72rem; letter-spacing: 0.08em; text-transform: uppercase;
      color: #6272a4; margin-bottom: 0.45rem;
    }
    #${ROOT_ID} .wm-row {
      display: flex; flex-wrap: wrap; gap: 0.4rem; align-items: center;
    }
    #${ROOT_ID} .wm-addr {
      font-family: var(--tn-font-mono, ui-monospace, monospace);
      font-size: 0.82rem; color: #98e8c1; word-break: break-all;
      background: rgba(0,0,0,0.35); border: 1px solid rgba(152,232,193,0.12);
      border-radius: 8px; padding: 0.5rem 0.65rem; width: 100%;
    }
    #${ROOT_ID} .wm-addr.empty { color: #6272a4; }
    #${ROOT_ID} .wm-meta {
      font-size: 0.82rem; color: #a0a8c0; line-height: 1.45; margin-top: 0.35rem;
    }
    #${ROOT_ID} .wm-btn {
      font-family: inherit; font-size: 0.85rem; font-weight: 500;
      padding: 0.45rem 0.75rem; border-radius: 999px; cursor: pointer;
      border: 1px solid rgba(152,232,193,0.3); background: rgba(152,232,193,0.08);
      color: #98e8c1;
    }
    #${ROOT_ID} .wm-btn:hover { background: rgba(152,232,193,0.16); }
    #${ROOT_ID} .wm-btn.primary {
      background: #98e8c1; color: #0a0a0f; border-color: #98e8c1;
    }
    #${ROOT_ID} .wm-btn.danger {
      border-color: rgba(254,125,125,0.4); color: #fe7d7d;
      background: rgba(254,125,125,0.08);
    }
    #${ROOT_ID} .wm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    #${ROOT_ID} .wm-list {
      list-style: none; padding: 0; margin: 0.4rem 0 0;
    }
    #${ROOT_ID} .wm-list li {
      font-size: 0.82rem; color: #d2d3d8; padding: 0.4rem 0.5rem;
      border: 1px solid rgba(255,255,255,0.06); border-radius: 8px;
      margin-bottom: 0.35rem; display: flex; justify-content: space-between; gap: 0.5rem;
    }
    #${ROOT_ID} .wm-list code {
      font-size: 0.75rem; color: #98e8c1; word-break: break-all;
    }
    #${ROOT_ID} .wm-note {
      font-size: 0.78rem; color: #6272a4; line-height: 1.5; margin-top: 0.45rem;
    }
    #${ROOT_ID} .wm-status {
      font-size: 0.8rem; min-height: 1.2em; margin-top: 0.5rem; color: #98e8c1;
    }
    #${ROOT_ID} .wm-status.err { color: #fe7d7d; }
    #${ROOT_ID} .wm-switch-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 0.75rem; padding: 0.35rem 0;
    }
    #${ROOT_ID} .tn-switch {
      position: relative; width: 42px; height: 22px; border-radius: 999px;
      background: #334155; flex-shrink: 0; cursor: pointer; border: none;
    }
    #${ROOT_ID} .tn-switch::after {
      content: ''; position: absolute; top: 3px; left: 3px;
      width: 16px; height: 16px; border-radius: 50%; background: #fff;
      transition: left 0.15s;
    }
    #${ROOT_ID} .tn-switch.on { background: #ffb86c; }
    #${ROOT_ID} .tn-switch.on::after { left: 22px; }
    #${ROOT_ID} .wm-faucet-bal {
      font-family: var(--tn-font-mono, ui-monospace, monospace);
      font-size: 0.85rem; color: #cfffcf; margin-top: 0.4rem;
    }
    #${ROOT_ID} .wm-faucet-result { font-size: 0.78rem; margin-top: 0.45rem; color: #98e8c1; }
    #${ROOT_ID} .wm-faucet-result.err { color: #fe7d7d; }
  `;
  document.head.appendChild(s);
}

function short(a) {
  if (!a) return '';
  return a.length > 16 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

function ensureRoot() {
  injectStyles();
  let root = document.getElementById(ROOT_ID);
  if (root) return root;
  root = document.createElement('div');
  root.id = ROOT_ID;
  root.setAttribute('role', 'dialog');
  root.setAttribute('aria-modal', 'true');
  root.setAttribute('aria-labelledby', 'wm-title');
  root.innerHTML = `
    <div class="wm-panel">
      <div class="wm-head">
        <div>
          <div class="wm-kicker">Account</div>
          <h2 class="wm-title" id="wm-title">Account</h2>
        </div>
        <button type="button" class="wm-close" id="wm-close" aria-label="Close">×</button>
      </div>
      <div id="wm-body"></div>
      <div class="wm-status" id="wm-status"></div>
    </div>
  `;
  document.body.appendChild(root);
  root.querySelector('#wm-close').addEventListener('click', closeWalletModal);
  root.addEventListener('click', (e) => {
    if (e.target === root) closeWalletModal();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && root.classList.contains('open')) closeWalletModal();
  });
  return root;
}

function setStatus(msg, err = false) {
  const el = document.getElementById('wm-status');
  if (!el) return;
  el.textContent = msg || '';
  el.className = 'wm-status' + (err ? ' err' : '');
}

/**
 * @param {{
 *   config?: object,
 *   isTestnet?: boolean,
 *   onNetworkToggle?: ()=>void,
 *   onFaucet?: ()=>void,
 * }} [opts]
 */
export async function openWalletModal(opts = {}) {
  const root = ensureRoot();
  const body = root.querySelector('#wm-body');
  const config = opts.config || window.__TERP_CONFIG || {};
  const smartAcct = resolveSmartAccountContract(config);

  // Warm passkey wasm in background
  loadWasm().catch(() => {});

  const paint = () => {
    const snap = TerpWallet.getSnapshot();
    const passkeys = listLocalPasskeys();

    body.innerHTML = `
      <div class="wm-section">
        <div class="wm-label">Session</div>
        <div class="wm-addr ${snap.connected ? '' : 'empty'}" id="wm-addr">
          ${snap.connected ? snap.address : 'Not connected'}
        </div>
        <div class="wm-meta">
          ${snap.connected
            ? `Provider: ${snap.provider || '—'} · Chain: ${snap.chainId || config.chainId || '—'}`
            : 'Connect Keplr. Optional: add a passkey so this browser can sign without a seed phrase every time.'}
        </div>
        <div class="wm-row" style="margin-top:0.55rem;">
          ${snap.connected
            ? `<button type="button" class="wm-btn danger" id="wm-disconnect">Disconnect</button>
               <button type="button" class="wm-btn" id="wm-copy">Copy address</button>`
            : `<button type="button" class="wm-btn primary" id="wm-keplr">Keplr</button>`}
        </div>
      </div>

      <details class="wm-section">
        <summary class="wm-label" style="cursor:pointer">Advanced</summary>
        <div class="wm-meta">
          ${smartAcct ? `Account: <code>${short(smartAcct)}</code>` : 'Passkey is optional.'}
        </div>
        <p class="wm-note">
          Face ID or fingerprint on this device. No seed phrase to write down.
        </p>
        <ul class="wm-list" id="wm-passkey-list">
          ${passkeys.length
            ? passkeys
                .map(
                  (p) =>
                    `<li><span>${p.label || 'passkey'}<br><code>${short(p.credentialId)}</code></span>
                     <span style="color:#6272a4;font-size:0.72rem;">${(p.createdAt || '').slice(0, 10)}</span></li>`,
                )
                .join('')
            : '<li style="color:#6272a4;">No local passkeys yet</li>'}
        </ul>
        <div class="wm-row" style="margin-top:0.55rem;">
          <button type="button" class="wm-btn" id="wm-reg-passkey">Register passkey</button>
          ${passkeys.length ? `<button type="button" class="wm-btn danger" id="wm-clear-passkeys">Clear local list</button>` : ''}
        </div>
        <div class="wm-switch-row">
          <span class="wm-meta" style="margin:0;">Testnet mode</span>
          <button type="button" class="tn-switch ${opts.isTestnet ? 'on' : ''}" id="wm-testnet" aria-label="Toggle testnet"></button>
        </div>
        <div class="wm-meta" id="wm-net-label">${opts.isTestnet ? 'Testnet · 120u-1' : 'Mainnet · morocco-1'}</div>
      </details>

      ${opts.isTestnet ? `
      <div class="wm-section" id="wm-faucet-section">
        <div class="wm-label">Faucet</div>
        <div class="wm-addr ${snap.connected ? '' : 'empty'}" id="wm-faucet-addr">${snap.address || 'Connect a wallet to fund'}</div>
        <div class="wm-meta" id="wm-faucet-status">Checking faucet…</div>
        <div class="wm-faucet-bal" id="wm-faucet-bal"></div>
        <div class="wm-row" style="margin-top:0.5rem;">
          <button type="button" class="wm-btn primary" id="wm-faucet-send" ${snap.connected ? '' : 'disabled'}>Fund this address</button>
        </div>
        <div class="wm-faucet-result" id="wm-faucet-result"></div>
      </div>` : ''}
    `;

    body.querySelector('#wm-disconnect')?.addEventListener('click', async () => {
      await TerpWallet.disconnect();
      setStatus('Disconnected');
      paint();
    });
    body.querySelector('#wm-copy')?.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(snap.address);
        setStatus('Address copied');
      } catch {
        setStatus('Copy failed', true);
      }
    });
    body.querySelector('#wm-keplr')?.addEventListener('click', () => connectProvider('keplr'));
    body.querySelector('#wm-reg-passkey')?.addEventListener('click', () => onRegisterPasskey());
    body.querySelector('#wm-clear-passkeys')?.addEventListener('click', () => {
      if (confirm('Remove local passkey metadata from this browser? (Device credentials remain until revoked in OS settings.)')) {
        clearLocalPasskeys();
        setStatus('Local passkey list cleared');
        paint();
      }
    });
    body.querySelector('#wm-testnet')?.addEventListener('click', () => {
      opts.onNetworkToggle?.();
    });
    if (opts.isTestnet) {
      const rest =
        (config.chainId === '120u-1' && config.rest) ||
        'https://api-testnet.terp.network';
      bindFaucetPanel(body, {
        address: snap.address || opts.defaultAddress || '',
        rest,
        config,
      });
    }
  };

  async function connectProvider(provider) {
    setStatus('Connecting…');
    try {
      await TerpWallet.ensureLibs(config);
      const next = await TerpWallet.connect(config, { provider });
      if (next.connected) setStatus(`Connected ${short(next.address)}`);
      else setStatus('Connect failed', true);
      paint();
    } catch (e) {
      setStatus(e.message || String(e), true);
      if (e.code === 'NO_WALLET') {
        window.open('https://www.keplr.app/download', '_blank');
      }
    }
  }

  async function onRegisterPasskey() {
    setStatus('Creating passkey…');
    try {
      const ok = await loadWasm();
      if (!ok) throw new Error('Passkeys aren’t available on this page right now.');
      const result = await registerPasskeyForAccount(config, {
        label: 'terp-passkey',
        discoverable: false,
      });
      if (!result) {
        setStatus('Registration cancelled', true);
        return;
      }
      let msg = 'Passkey saved in this browser.';
      if (result.onChain?.supported && result.onChain.contract) {
        const snap = TerpWallet.getSnapshot();
        if (snap.connected && result.onChain.msg) {
          try {
            await TerpWallet.executeContract(result.onChain.contract, result.onChain.msg, {
              memo: 'register passkey authenticator',
            });
            msg = 'Passkey saved and registered on-chain.';
          } catch {
            msg = 'Passkey saved here. Connect Keplr and try again to register it on-chain.';
          }
        } else {
          msg = 'Passkey saved here. Connect Keplr to register it on-chain.';
        }
      }
      setStatus(msg);
      paint();
    } catch (e) {
      setStatus(e.message || String(e), true);
    }
  }

  paint();
  TerpWallet.onWalletChange(() => {
    if (root.classList.contains('open')) paint();
  });

  root.classList.add('open');
  document.body.style.overflow = 'hidden';
  setStatus('');
  if (opts.focusFaucet) {
    root.querySelector('#wm-faucet-section')?.scrollIntoView({ block: 'nearest' });
  }
}

export function closeWalletModal() {
  const root = document.getElementById(ROOT_ID);
  if (root) root.classList.remove('open');
  document.body.style.overflow = '';
}

export function isWalletModalOpen() {
  return !!document.getElementById(ROOT_ID)?.classList.contains('open');
}
