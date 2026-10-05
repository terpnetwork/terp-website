// lib/faucet.js — Faucet client for terp network (dev & production)

const FAUCET_BASE = 'https://faucet.terp.network';

/**
 * Request funds from the faucet.
 * @param {string} address — bech32 address to fund (e.g. terp1...)
 * @returns {Promise<Object>} faucet response — { txhash: "..." }
 */
export async function faucetFund(address) {
    const res = await fetch(`${FAUCET_BASE}/faucet?address=${address}`);
    if (!res.ok) throw new Error(`Faucet error: ${res.status} ${res.statusText}`);
    return res.json();
}

/**
 * Check faucet health/status.
 * @returns {Promise<Object>} status response
 */
export async function faucetStatus() {
    const res = await fetch(`${FAUCET_BASE}/status`);
    if (!res.ok) throw new Error(`Faucet status error: ${res.status}`);
    return res.json();
}

/**
 * Bind faucet controls inside an already-rendered wallet modal body.
 * Called by wallet-modal.js with the modal body and the current context.
 * Wires #wm-faucet-status (health), #wm-faucet-send (fund button) and
 * #wm-faucet-result (outcome). Never throws — all failures surface as text.
 *
 * @param {HTMLElement} body — modal body containing the wm-faucet-* nodes
 * @param {Object} ctx
 * @param {string} [ctx.address] — prefill/connected address
 * @param {string} [ctx.rest] — reserved: chain REST endpoint for future per-network faucet routing
 * @param {Object} [ctx.config] — reserved: site config
 */
export function bindFaucetPanel(body, { address = '', rest = '', config = {} } = {}) {
    void rest;
    void config;
    const status = body.querySelector('#wm-faucet-status');
    const result = body.querySelector('#wm-faucet-result');
    const send = body.querySelector('#wm-faucet-send');
    const addrNode = body.querySelector('#wm-faucet-addr');
    const setText = (el, msg) => { if (el) el.textContent = msg; };

    setText(status, 'Checking faucet…');
    faucetStatus().then(
        () => setText(status, 'Faucet online — testnet only'),
        (e) => setText(status, 'Faucet unreachable: ' + (e.message || e)),
    );

    if (!send) return;
    send.addEventListener('click', async () => {
        const shown = (addrNode?.textContent || '').trim();
        const target = (!shown || /connect a wallet/i.test(shown) ? address : shown).trim();
        if (!target) { setText(result, 'Connect a wallet first'); return; }
        setText(result, 'Requesting funds…');
        try {
            const resp = await faucetFund(target);
            setText(result, 'Funded! Tx: ' + (resp.txhash || JSON.stringify(resp)));
        } catch (e) {
            setText(result, 'Error: ' + (e.message || e));
        }
    });
}
/**
 * Show standalone faucet modal with address input + fund button.
 * @param {string} [defaultAddress] — pre-fill address (e.g. connected wallet)
 */
export function showFaucetModal(defaultAddress = '') {
    // Remove existing modal if any
    const existing = document.getElementById('faucet-modal');
    if (existing) existing.remove();

    const modal = document.createElement('div');
    modal.id = 'faucet-modal';
    modal.style.cssText = `
        position: fixed; inset: 0; z-index: 10000;
        display: flex; align-items: center; justify-content: center;
        background: rgba(0,0,0,0.7); backdrop-filter: blur(6px);
    `;
    modal.innerHTML = `
        <div style="
            background: #1a1a2e; border: 1px solid rgb(var(--tn-teal-rgb) / 0.2);
            border-radius: 8px; padding: 2rem; max-width: 420px; width: 90%;
            font-family: var(--tn-font); color: var(--tn-text-bright);
        ">
            <h3 style="margin: 0 0 1rem; color: var(--tn-teal); font-size: 1.1rem;">Terp Faucet</h3>
            <input id="faucet-addr" type="text" placeholder="terp1..."
                value="${defaultAddress}"
                style="
                    width: 100%; padding: 0.6rem 0.8rem; margin-bottom: 1rem;
                    background: rgb(var(--tn-tint-rgb) / 0.05); border: 1px solid rgb(var(--tn-teal-rgb) / 0.2);
                    border-radius: 4px; color: var(--tn-text-bright); font-family: var(--tn-font-mono); font-size: 0.85rem;
                " />
            <div style="display:flex; gap:0.5rem;">
                <button id="faucet-send" style="
                    flex: 1; padding: 0.5rem; cursor: pointer; border-radius: 4px;
                    background: rgb(var(--tn-teal-rgb) / 0.15); border: 1px solid rgb(var(--tn-teal-rgb) / 0.3);
                    color: var(--tn-teal); font-family: var(--tn-font); font-size: 0.85rem;
                ">Fund</button>
                <button id="faucet-close" style="
                    padding: 0.5rem 1rem; cursor: pointer; border-radius: 4px;
                    background: rgb(var(--tn-tint-rgb) / 0.05); border: 1px solid rgb(var(--tn-tint-rgb) / 0.1);
                    color: var(--tn-text); font-family: var(--tn-font); font-size: 0.85rem;
                ">Close</button>
            </div>
            <div id="faucet-result" style="margin-top:0.75rem; font-size:0.8rem; color:var(--tn-text);"></div>
        </div>
    `;
    document.body.appendChild(modal);

    // Close on backdrop click or close button
    modal.addEventListener('click', (e) => {
        if (e.target === modal) modal.remove();
    });
    document.getElementById('faucet-close').addEventListener('click', () => modal.remove());

    // Fund button
    document.getElementById('faucet-send').addEventListener('click', async () => {
        const addr = document.getElementById('faucet-addr').value.trim();
        const result = document.getElementById('faucet-result');
        if (!addr) { result.textContent = 'Enter an address'; return; }
        result.textContent = 'Requesting funds...';
        result.style.color = '#d2d3d8';
        try {
            const resp = await faucetFund(addr);
            result.textContent = 'Funded! Tx: ' + (resp.txhash || JSON.stringify(resp));
            result.style.color = '#98e8c1';
        } catch (e) {
            result.textContent = 'Error: ' + e.message;
            result.style.color = '#ff5555';
        }
    });
}