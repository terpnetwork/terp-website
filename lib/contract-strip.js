// contract-strip.js — morocco-1 contract directory from published state.json.

import { loadStateContracts, STATE_JSON_URL } from '/lib/assets-registry.js';

const KEY_MAP = {
  'cw-shitstrap-factory': { label: 'Shitstrap factory', tag: 'Apps' },
  'cw-svg-minter': { label: 'SVG minter', tag: 'Accounts & collections' },
  cw721_svg: { label: 'SVG collection', tag: 'Accounts & collections' },
  'crates.io:terp721-account-manifold': { label: 'Account minter', tag: 'Accounts & collections' },
  'crates.io:terp721-account': { label: 'terp721 account', tag: 'Accounts & collections' },
  'cw-infuser': { label: 'Infuser', tag: 'Apps' },
  'abstract:registry': { label: 'Registry', tag: 'Abstract' },
  'abstract:ans-host': { label: 'ANS host', tag: 'Abstract' },
  'abstract:ibc-client': { label: 'IBC client', tag: 'Abstract' },
  'abstract:ibc-host': { label: 'IBC host', tag: 'Abstract' },
  'abstract:ibc_host': { label: 'IBC host', tag: 'Abstract' },
  'abstract:module-factory': { label: 'Module factory', tag: 'Abstract' },
  'polytone:note': { label: 'Polytone note', tag: 'IBC' },
  'polytone:voice': { label: 'Polytone voice', tag: 'IBC' },
  'whitelist-mtree': { label: 'Whitelist (merkle)', tag: 'Apps' },
  cw_admin_factory: { label: 'Admin factory', tag: 'Apps' },
};

const GROUP_ORDER = [
  'Abstract',
  'Accounts & collections',
  'Apps',
  'IBC',
  'Authenticators',
  'Other',
];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

export function prettyLabel(key) {
  if (KEY_MAP[key]?.label) return KEY_MAP[key].label;
  return String(key)
    .replace(/^crates\.io:/, '')
    .replace(/^abstract:/, '')
    .replace(/[-_]/g, ' ');
}

export function groupFor(key) {
  if (KEY_MAP[key]?.tag) return KEY_MAP[key].tag;
  const k = String(key).toLowerCase();
  if (k.startsWith('abstract:account-local')) return 'Local accounts';
  if (k.startsWith('abstract:')) return 'Abstract';
  if (k.includes('polytone') || k.includes('ibc')) return 'IBC';
  if (k.startsWith('terp-') || k.includes('passkey') || k.includes('ed25519')) return 'Authenticators';
  if (k.includes('721') || k.includes('svg') || k.includes('account')) return 'Accounts & collections';
  if (k.includes('infuser') || k.includes('shitstrap') || k.includes('whitelist')) return 'Apps';
  return 'Other';
}

export function isLocalAccount(key) {
  return String(key).startsWith('abstract:account-local-');
}

function bindCopy(root) {
  root.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.addEventListener('click', () => {
      navigator.clipboard.writeText(btn.dataset.copy).then(() => {
        btn.textContent = 'Copied';
        setTimeout(() => {
          btn.textContent = 'Copy';
        }, 1200);
      }).catch(() => {});
    });
  });
}

function bindFilter(root, input) {
  input?.addEventListener('input', (e) => {
    const q = e.target.value.trim().toLowerCase();
    root.querySelectorAll('tbody tr').forEach((tr) => {
      tr.style.display = !q || (tr.dataset.filter || '').includes(q) ? '' : 'none';
    });
    root.querySelectorAll('.res-group').forEach((g) => {
      const vis = [...g.querySelectorAll('tbody tr')].some((tr) => tr.style.display !== 'none');
      g.style.display = vis ? '' : 'none';
    });
  });
}

/**
 * @param {{ label: string, key: string, addr?: string, codeId?: string|number, group: string }[]} rows
 * @param {{ explorer: string, showEmpty?: boolean }} opts
 */
export function directoryHtml(rows, opts = {}) {
  const explorer = (opts.explorer || 'https://ping.pub/terp').replace(/\/$/, '');
  const groups = new Map();
  for (const r of rows) {
    const g = r.group || 'Other';
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g).push(r);
  }
  const order = [...GROUP_ORDER, ...[...groups.keys()].filter((g) => !GROUP_ORDER.includes(g))];
  return order
    .filter((g) => groups.has(g))
    .map((g) => {
      const list = groups.get(g);
      const body = list
        .map((r) => {
          const addr = r.addr || '';
          const code = r.codeId || '';
          return `<tr data-filter="${esc((r.label + ' ' + r.key + ' ' + addr + ' ' + g).toLowerCase())}">
            <td>${esc(r.label)}<div class="cid">${esc(r.key)}</div></td>
            <td class="addr-cell">${
              addr
                ? `<code class="addr-full" title="${esc(addr)}">${esc(addr)}</code>
                   <div class="addr-actions">
                     <button type="button" class="snap-btn" data-copy="${esc(addr)}">Copy</button>
                     <a href="${esc(explorer)}/cosmwasm/contract/${encodeURIComponent(addr)}" target="_blank" rel="noopener">Explorer</a>
                   </div>`
                : '—'
            }</td>
            <td>${code !== '' ? `<code>${esc(code)}</code>` : '—'}</td>
          </tr>`;
        })
        .join('');
      return `<div class="res-group">
        <h4>${esc(g)} <span class="count">${list.length}</span></h4>
        <div class="res-table-wrap"><table class="res-table">
          <thead><tr><th>Name</th><th>Address</th><th>Code</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>
      </div>`;
    })
    .join('');
}

function rowsFromMaps(raw, codeIds, { includeLocal = false } = {}) {
  const keys = new Set([...Object.keys(raw || {}), ...Object.keys(codeIds || {})]);
  const rows = [];
  for (const key of keys) {
    if (!includeLocal && isLocalAccount(key)) continue;
    const addr = raw[key];
    const codeId = codeIds[key];
    if (!addr && (codeId == null || codeId === '')) continue;
    if (addr && typeof addr === 'string' && !addr.startsWith('terp') && !addr.startsWith('juno') && !addr.startsWith('osmo')) continue;
    rows.push({
      key,
      label: prettyLabel(key),
      addr: typeof addr === 'string' ? addr : '',
      codeId: codeId ?? '',
      group: groupFor(key),
    });
  }
  rows.sort((a, b) => a.group.localeCompare(b.group) || a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
  return rows;
}

export async function mountContractStrip(host, config = {}) {
  if (!host) return;
  host.innerHTML = `<p class="muted">Loading published contracts…</p>`;

  const chainId = config.chainId || 'morocco-1';
  const stateUrl = config.stateJsonUrl || config.services?.stateJson || STATE_JSON_URL;
  const explorer = (config.explorerBase || 'https://ping.pub/terp').replace(/\/$/, '');

  let raw = {};
  let codeIds = {};
  try {
    const result = await loadStateContracts(stateUrl, chainId);
    raw = result.raw || {};
    codeIds = result.codeIds || {};
  } catch {
    host.innerHTML = `<p class="state-status err">Could not load published contracts.</p>`;
    return;
  }

  for (const [key, addr] of Object.entries(config.contracts || {})) {
    if (addr && !raw[key]) raw[key] = addr;
  }

  const rows = rowsFromMaps(raw, codeIds, { includeLocal: false });
  if (!rows.length) {
    host.innerHTML = `<p class="muted">No contracts published for <code>${esc(chainId)}</code>.</p>`;
    return;
  }

  host.innerHTML = `
    <article class="snap-card res-index">
      <p class="res-kicker">Contracts</p>
      <h3>On-chain programs</h3>
      <p class="res-note">
        Names, addresses, and code IDs from the published app-state file for <code>${esc(chainId)}</code>.
        Copy an address or open it in the explorer.
        <a href="${esc(stateUrl)}" target="_blank" rel="noopener">Source JSON</a>
      </p>
      <input type="search" class="res-filter" id="cs-filter" placeholder="Filter by name or address" aria-label="Filter contracts">
      <div id="cs-dir">${directoryHtml(rows, { explorer })}</div>
    </article>`;

  bindCopy(host);
  bindFilter(host, host.querySelector('#cs-filter'));
}

export { rowsFromMaps, bindCopy, bindFilter };
