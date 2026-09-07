// app-state.js — published cw-orch state.json as a readable directory.

import {
  esc,
  directoryHtml,
  rowsFromMaps,
  bindCopy,
  bindFilter,
  isLocalAccount,
} from '/lib/contract-strip.js';

const CHAIN_LABEL = {
  'morocco-1': 'Mainnet',
  '120u-1': 'Testnet',
};

/**
 * @param {HTMLElement} host
 * @param {{ url?: string, defaultChain?: string, explorer?: string }} [opts]
 */
export async function mountAppState(host, opts = {}) {
  if (!host) return;
  const url = opts.url || 'https://s3.terp.network/snapshots/mainnet/morocco-1/state.json';
  const defaultChain = opts.defaultChain || 'morocco-1';
  const explorer = (opts.explorer || 'https://ping.pub/terp').replace(/\/$/, '');
  host.innerHTML = `<p class="muted">Loading published app state…</p>`;

  let json;
  try {
    const res = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const t = await res.text();
    if (!t || /^\s*</.test(t)) throw new Error('not JSON');
    json = JSON.parse(t);
  } catch {
    host.innerHTML = `
      <article class="snap-card">
        <p class="res-kicker">App state</p>
        <h3>Deployed programs</h3>
        <p class="state-status err">Could not load the published address file.</p>
      </article>`;
    return;
  }

  const skip = new Set(['source', 'note']);
  const chainIds = Object.keys(json).filter((k) => {
    if (skip.has(k)) return false;
    const sl = json[k];
    if (!sl || typeof sl !== 'object' || Array.isArray(sl)) return false;
    const n = Object.keys(sl.default || {}).length + Object.keys(sl.code_ids || {}).length;
    return n > 0;
  });
  chainIds.sort((a, b) => {
    const rank = (id) => (id === defaultChain ? 0 : id === '120u-1' ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  const paint = (id, includeLocal) => {
    const slice = json[id] || {};
    const raw = slice.default || {};
    const codeIds = slice.code_ids || {};
    const localN = Object.keys(raw).filter(isLocalAccount).length;
    const rows = rowsFromMaps(raw, codeIds, { includeLocal });
    const body = host.querySelector('#as-body');
    body.innerHTML = `
      <p class="res-note">${rows.length} entries on <code>${esc(id)}</code>${
        localN ? ` · ${localN} local Abstract accounts` : ''
      }</p>
      ${directoryHtml(rows, { explorer })}`;
    bindCopy(body);
    bindFilter(body, host.querySelector('#as-filter'));
  };

  host.innerHTML = `
    <article class="snap-card res-index">
      <p class="res-kicker">App state</p>
      <h3>Deployed programs</h3>
      <p class="res-note">
        Every named contract in the published cw-orch file, grouped by what it is.
        Mainnet first. Local Abstract accounts are hidden unless you turn them on.
        <a href="${esc(url)}" target="_blank" rel="noopener">Source JSON</a>
      </p>
      <div class="tabs-row" id="as-tabs" role="tablist"></div>
      <label class="muted" style="display:flex;gap:0.4rem;align-items:center;margin:0.35rem 0 0.5rem;">
        <input type="checkbox" id="as-local"> Show local Abstract accounts
      </label>
      <input type="search" class="res-filter" id="as-filter" placeholder="Filter by name or address" aria-label="Filter app state">
      <div id="as-body"></div>
    </article>`;

  const tabs = host.querySelector('#as-tabs');
  const localEl = host.querySelector('#as-local');
  chainIds.forEach((id, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab-btn' + (i === 0 ? ' active' : '');
    const n = Object.keys((json[id].default || {})).filter((k) => !isLocalAccount(k)).length;
    b.textContent = `${CHAIN_LABEL[id] || id} (${n})`;
    b.dataset.chain = id;
    b.addEventListener('click', () => {
      tabs.querySelectorAll('.tab-btn').forEach((x) => x.classList.remove('active'));
      b.classList.add('active');
      paint(id, localEl.checked);
    });
    tabs.appendChild(b);
  });
  localEl.addEventListener('change', () => {
    const id = tabs.querySelector('.tab-btn.active')?.dataset.chain || chainIds[0];
    paint(id, localEl.checked);
  });
  paint(chainIds[0] || defaultChain, false);
}
