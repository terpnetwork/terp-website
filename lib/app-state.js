// app-state.js — published cw-orch state.json as a readable directory.
// Categories use the shared section picker (#app-state/<category>).

import {
  esc,
  directoryHtml,
  rowsFromMaps,
  bindCopy,
  bindFilter,
  isLocalAccount,
  GROUP_ORDER,
  groupSlug,
} from '/lib/contract-strip.js';
import { mountShield } from '/lib/section-shield.js';

const CHAIN_LABEL = {
  'morocco-1': 'Mainnet',
  '120u-1': 'Testnet',
};

/**
 * @param {HTMLElement} host
 * @param {{ url?: string, defaultChain?: string, explorer?: string, category?: string }} [opts]
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
      <article class="snap-card res-index">
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
    return rowsFromMaps(sl.default || {}, sl.code_ids || {}, { includeLocal: false }).length > 0;
  });
  chainIds.sort((a, b) => {
    const rank = (id) => (id === defaultChain ? 0 : id === '120u-1' ? 1 : 2);
    return rank(a) - rank(b) || a.localeCompare(b);
  });

  let chain = chainIds.includes(defaultChain) ? defaultChain : chainIds[0] || defaultChain;

  const categoriesFor = (id) => {
    const slice = json[id] || {};
    const rows = rowsFromMaps(slice.default || {}, slice.code_ids || {}, { includeLocal: false });
    const by = new Map();
    for (const r of rows) {
      const g = r.group || 'Other';
      if (!by.has(g)) by.set(g, []);
      by.get(g).push(r);
    }
    const order = [...GROUP_ORDER, ...[...by.keys()].filter((g) => !GROUP_ORDER.includes(g))];
    return order.filter((g) => by.has(g)).map((g) => ({ name: g, slug: groupSlug(g), rows: by.get(g) }));
  };

  const paint = () => {
    const cats = categoriesFor(chain);
    const want = opts.category || '';
    const def = cats.some((c) => c.slug === want) ? want : cats[0]?.slug || '';
    const body = host.querySelector('#as-body');
    if (!body) return;

    if (!cats.length) {
      body.innerHTML = `<p class="res-note">No published programs on <code>${esc(chain)}</code>.</p>`;
      return;
    }

    // Destroy a previous picker so remounting a chain does not keep a stale controller.
    if (body.shield) body.shield.destroy();

    body.innerHTML = `
      <p class="res-note"><span data-live="as-count">${cats.reduce((n, c) => n + c.rows.length, 0)}</span> entries on <code>${esc(chain)}</code></p>
      <input type="search" class="res-filter" id="as-filter" placeholder="Filter by name or address" aria-label="Filter app state">
      <div data-shield data-shield-hash="app-state" data-shield-label="Program categories" data-shield-default="${esc(def)}" data-shield-cols="${Math.min(6, cats.length)}" data-shield-cols-narrow="3">
        <div data-shield-orbs></div>
        ${cats
          .map(
            (c) => `<section data-shield-panel="${esc(c.slug)}" data-shield-title="${esc(c.name)}" aria-label="${esc(c.name)}">
          ${directoryHtml(c.rows, { explorer, flat: true, compact: true })}
        </section>`,
          )
          .join('')}
      </div>`;

    const root = body.querySelector('[data-shield]');
    mountShield(root, { hash: 'app-state', default: def });
    bindCopy(body);
    bindFilter(body, body.querySelector('#as-filter'));
  };

  host.innerHTML = `
    <article class="snap-card res-index">
      <p class="res-kicker">App state</p>
      <h3>Deployed programs</h3>
      <p class="res-note">
        Named contracts in the published address file, by category. Mainnet first.
        <a class="snap-btn" href="${esc(url)}" target="_blank" rel="noopener">Source JSON</a>
      </p>
      <div class="tabs-row as-chains" id="as-tabs" role="tablist" aria-label="Network"></div>
      <div id="as-body"></div>
    </article>`;

  const tabs = host.querySelector('#as-tabs');
  chainIds.forEach((id) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tab-btn' + (id === chain ? ' active' : '');
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', id === chain ? 'true' : 'false');
    const n = Object.keys(json[id].default || {}).filter((k) => !isLocalAccount(k)).length;
    b.textContent = `${CHAIN_LABEL[id] || id} · ${n}`;
    b.dataset.chain = id;
    b.addEventListener('click', () => {
      chain = id;
      tabs.querySelectorAll('.tab-btn').forEach((x) => {
        const on = x === b;
        x.classList.toggle('active', on);
        x.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      // Keep the open category when switching chains when it still exists.
      const cur = host.querySelector('[data-shield]')?.shield?.current;
      opts.category = cur || opts.category;
      paint();
    });
    tabs.appendChild(b);
  });

  paint();
  host.__selectCategory = (slug) => {
    opts.category = slug;
    const sh = host.querySelector('[data-shield]')?.shield;
    if (sh) sh.select(slug);
    else paint();
  };
}
