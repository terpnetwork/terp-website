// /eco → SVG plane: live collection list, read straight from mainnet.
// Loads the contract bundles only when the SVG card is opened; no wallet code.
import { loadSiteConfig } from '/lib/config.js';

let host = null;

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const fmt = (coin) => {
  if (!coin) return '—';
  const n = Number(BigInt(coin.amount)) / 1e6;
  const d = coin.denom === 'uthiol' ? 'THIOL' : coin.denom === 'uterp' ? 'TERP' : coin.denom;
  return `${n.toLocaleString()} ${d}`;
};
const STATUS = { open: 'Live', 'sold-out': 'Sold out', upcoming: 'Upcoming', closed: 'Closed' };

async function load() {
  host.setAttribute('aria-busy', 'true');
  host.innerHTML = '<p class="eco-svg-state">Reading collections from the network…</p>';
  try {
    const cfg = { pageId: 'svg', chainId: 'morocco-1', rpc: 'https://rpc.terp.network', rest: 'https://api.terp.network', minterContract: '', staticCollections: [] };
    await loadSiteConfig(cfg, { pageId: 'svg' });
    // Public LCD (CORS open), the same endpoint the /svg page reads from.
    const rest = cfg.rest || 'https://api.terp.network';
    const minter = cfg.minterContract || cfg.contracts?.cwSvgMinter;
    if (!minter) { host.innerHTML = '<p class="eco-svg-state">No SVG minter is listed for this network yet.</p>'; return; }
    const [M, C] = await Promise.all([import('/lib/contracts/cw-svg-minter.js'), import('/lib/contracts/cw721-svg.js')]);
    const { collections } = await M.listCollections(rest, minter);
    if (!collections.length) { host.innerHTML = '<p class="eco-svg-state">No collections yet.</p>'; return; }
    const rows = await Promise.all(collections.map((c) => C.summary(rest, c.contract).then((s) => ({ c, s }), () => ({ c, s: null }))));
    host.innerHTML = `<table class="eco-svg-table"><thead><tr><th scope="col">Collection</th><th scope="col">Price</th><th scope="col">Minted</th><th scope="col">Status</th></tr></thead><tbody>${rows.map(({ c, s }) => `
      <tr><td><a href="/svg" class="eco-svg-name">${esc(c.name || s?.name || c.contract.slice(0, 14))}</a><span class="eco-svg-sym">${esc(c.symbol || s?.symbol || '')}</span></td>
      <td>${s ? esc(fmt(s.price)) : '—'}</td><td>${s ? `${s.minted.toLocaleString()} / ${s.total ? s.total.toLocaleString() : '∞'}` : '—'}</td>
      <td>${s ? esc(s.chainCanMint === false && s.status === 'open' ? 'Opens after upgrade' : STATUS[s.status] || s.status) : 'Unavailable'}</td></tr>`).join('')}</tbody></table>`;
  } catch (e) {
    console.warn('[eco-svg]', e);
    host.innerHTML = '<p class="eco-svg-state">Collections could not be loaded. <button type="button" class="eco-svg-retry">Try again</button></p>';
    host.querySelector('.eco-svg-retry')?.addEventListener('click', () => load());
  } finally {
    host.removeAttribute('aria-busy');
  }
}

/** Called by /eco when the SVG card opens; loads once per page visit. */
export function mountSvgPlane() {
  const h = document.getElementById('eco-svg-live');
  if (!h || h.dataset.ready) return;
  h.dataset.ready = '1';
  host = h;
  load();
}
