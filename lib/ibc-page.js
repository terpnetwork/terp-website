/**
 * ibc-page.js — boot modular IBC page (site design language).
 *
 * Restores low-hanging LCD clarity (channels / connections / clients)
 * while client **types** mount as recursive tabs via ibc-clients registry.
 */
import { loadSiteConfig } from '/lib/config.js';
import * as TerpWallet from '/lib/wallet.js';
import {
  loadIbcContext,
  loadIbcSnapshot,
  loadIbcSnapshotCached,
  loadFoundationBalances,
  formatAmount,
} from '/lib/ibc-core.js';
import { mountFundBar } from '/lib/ibc-fund-bar.js';
import {
  installDefaultClientTypes,
  mountClientTypeTabs,
} from '/lib/ibc-clients.js';

const CONFIG = {
  pageId: 'ibc',
  chainId: 'morocco-1',
  chainName: 'Terp Network',
  rpc: 'https://rpc.terp.network',
  rest: 'https://api.terp.network',
  denom: 'uthiol',
  denomDisplay: 'THIOL',
  denomDecimals: 6,
  bech32Prefix: 'terp',
};

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// Natural sort for client/channel/connection ids so 07-tendermint-2
// comes before 07-tendermint-10 (LCD returns them lexical).
function naturalId(a, b) {
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
}

function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

function paintStats(snap, isLoading = false) {
  const set = (id, v) => {
    const n = document.getElementById(id);
    if (n) n.textContent = v;
  };
  const setClass = (id, cls) => {
    const n = document.getElementById(id);
    if (n) n.className = (n.className || '').split(' ').filter((c) => c !== 'skeleton' && c !== 'err').join(' ').trim() + (cls ? ' ' + cls : '');
  };

  // Loading skeleton
  if (isLoading) {
    set('stat-channels', '—');
    setClass('stat-channels', 'skeleton');
    set('stat-channels-src', 'loading');
    setClass('stat-channels-src', 'skeleton');
    set('stat-connections', '—');
    setClass('stat-connections', 'skeleton');
    set('stat-clients', '—');
    setClass('stat-clients', 'skeleton');
    set('stat-clients-meta', 'loading…');
    setClass('stat-clients-meta', 'skeleton');
    set('stat-source', 'querying…');
    set('stat-proxy', '…');
    // Clear error borders
    document.querySelectorAll('.stat-card.err').forEach((c) => c.classList.remove('err'));
    return;
  }

  const open = snap.stats?.openChannels ?? snap.channels?.length;
  const hasError = snap.stats?.error != null;

  // Error state highlighting
  document.querySelectorAll('.stat-card').forEach((c) => {
    c.classList.toggle('err', hasError);
  });

  set('stat-channels', open != null ? String(open) : '—');
  setClass('stat-channels', '');
  set(
    'stat-channels-src',
    hasError
      ? `err: ${String(snap.stats.error).slice(0, 80)}`
      : snap.source
        ? `via ${snap.source}`
        : snap.stats?.source
          ? `via ${snap.stats.source}`
          : '',
  );
  setClass('stat-channels-src', '');
  set('stat-connections', String(snap.stats?.connections ?? snap.connections?.length ?? '—'));
  setClass('stat-connections', '');
  set('stat-clients', String(snap.stats?.clients ?? snap.clients?.length ?? '—'));
  setClass('stat-clients', '');
  const fam = snap.byFamily || {};
  const famStr = Object.entries(fam)
    .map(([k, v]) => `${k}:${v}`)
    .join(' · ') || '—';
  set('stat-clients-meta', famStr);
  setClass('stat-clients-meta', '');
  set('stat-source', snap.source || snap.stats?.source || '—');
  const proxyLabel = snap.stats?.fallback
    ? 'cached list'
    : snap.proxyConnected || snap.stats?.proxyConnected
      ? 'proxy up'
      : 'proxy off';
  set('stat-proxy', proxyLabel);
}

function tableShell(headers, rowsHtml, emptyMsg) {
  if (!rowsHtml) {
    return el(`<div class="section-card"><p class="muted">${esc(emptyMsg)}</p></div>`);
  }
  return el(`
    <div class="section-card">
      <div class="data-table-wrap">
        <table class="data-table">
          <thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    </div>`);
}

/** Overview: full inventory clarity */
function mountOverview(body, ctx) {
  const snap = ctx.snapshot;
  const ch = snap.channels || [];
  const conns = snap.connections || [];
  const clients = snap.clients || [];

  const src = ctx.snapshot?.source || ctx.snapshot?.stats?.source || 'live';
  const fallbackNote = ctx.snapshot?.stats?.fallback
    ? ' Live query was empty — showing the last published channel list.'
    : '';
  body.appendChild(
    el(`<p class="type-panel-blurb">IBC inventory for <strong style="color:#cfffcf">${esc(ctx.config.chainId)}</strong>
      (source: <strong style="color:#98e8c1">${esc(src)}</strong>) —
      open channels, connections, and light clients. Refresh re-queries the chain.${fallbackNote}</p>`),
  );

  const bar = el(`<div class="toolbar">
    <span class="muted">${esc(String(ch.length))} open channels · ${esc(String(conns.length))} connections · ${esc(String(clients.length))} clients</span>
    <button type="button" class="btn-quiet" id="ibc-refresh">Refresh</button>
  </div>`);
  body.appendChild(bar);
  bar.querySelector('#ibc-refresh')?.addEventListener('click', () => ctx.refresh?.());

  // Channels compact
  const chSorted = ch.slice().sort((a, b) => naturalId(a.id, b.id));
  const chRows = chSorted
    .slice(0, 100)
    .map(
      (c) => `<tr>
      <td>${esc(c.port)}/${esc(c.id)}</td>
      <td class="human">${esc(c.counterparty?.chain || '?')}</td>
      <td>${esc(c.counterparty?.channel || '')}</td>
      <td class="muted">${esc(c.connection || '')}</td>
      <td class="muted">${esc(c.client || '')}</td>
      <td class="muted">${esc(c.version || '')}</td>
    </tr>`,
    )
    .join('');
  body.appendChild(el('<h3 class="type-panel-title" style="margin:1rem 0 0.5rem;font-size:0.95rem;">Channels</h3>'));
  body.appendChild(
    tableShell(
      ['Port / channel', 'Counterparty', 'Cp channel', 'Connection', 'Client', 'Version'],
      chRows,
      'No open channels from LCD/proxy.',
    ),
  );

  const connSorted = conns.slice().sort((a, b) => naturalId(a.id || a.connection_id, b.id || b.connection_id));
  const connRows = connSorted
    .slice(0, 80)
    .map((c) => {
      const id = c.id || c.connection_id || '';
      const client = c.client_id || c.clientId || '';
      const state = c.state || c.connection?.state || '';
      return `<tr>
        <td>${esc(id)}</td>
        <td>${esc(client)}</td>
        <td class="muted">${esc(state)}</td>
      </tr>`;
    })
    .join('');
  body.appendChild(el('<h3 class="type-panel-title" style="margin:1rem 0 0.5rem;font-size:0.95rem;">Connections</h3>'));
  body.appendChild(
    tableShell(['Connection', 'Client', 'State'], connRows, 'No connections returned.'),
  );

  const clSorted = clients.slice().sort((a, b) => naturalId(a.clientId, b.clientId));
  const clRows = clSorted
    .slice(0, 80)
    .map(
      (c) => `<tr>
      <td>${esc(c.clientId)}</td>
      <td class="human">${esc(c.family)}</td>
      <td class="human">${esc(c.chainId || '—')}</td>
      <td class="muted" style="max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.typeUrl || '')}</td>
    </tr>`,
    )
    .join('');
  body.appendChild(el('<h3 class="type-panel-title" style="margin:1rem 0 0.5rem;font-size:0.95rem;">Clients</h3>'));
  body.appendChild(
    tableShell(['Client id', 'Family', 'Chain id', 'Type URL'], clRows, 'No client states returned.'),
  );
}

/** Transfer: ICS-20 focused channel table */
function mountTransfer(body, ctx) {
  const snap = ctx.snapshot;
  const ch = (snap.channels || []).filter(
    (c) => (c.port || '').includes('transfer') || c.port === 'transfer',
  );
  body.appendChild(
    el(`<p class="type-panel-blurb">ICS-20 transfer ports only (${ch.length} open). Same raw LCD data as Overview, filtered.</p>`),
  );
  const rows = ch
    .map(
      (c) => `<tr>
      <td>${esc(c.id)}</td>
      <td class="human">${esc(c.counterparty?.chain || c.counterparty?.chainId || '?')}</td>
      <td>${esc(c.counterparty?.channel || '')}</td>
      <td class="muted">${esc(c.ordering || '')}</td>
      <td class="muted">${esc(c.client || '')}</td>
    </tr>`,
    )
    .join('');
  body.appendChild(
    tableShell(
      ['Channel', 'Counterparty', 'Cp channel', 'Ordering', 'Client'],
      rows,
      'No transfer channels open (or still loading).',
    ),
  );
}

/**
 * Modular capability card registry.
 * Each card is protocol-agnostic — describes the *capability* not the *specific chain*.
 * Add/remove/reorder cards by editing the array. Cards render identically.
 *
 * @typedef {{ id: string, title: string, icon: string, status: string,
 *   desc: string, features: string[], families: string[] }} CapCard
 */

/** IBC-WASM capability cards — novel light-client verification capabilities */
const WASM_CAPABILITY_CARDS = [
  {
    id: 'zk-proof-verify',
    title: 'ZK Proof Verification',
    icon: '◈',
    status: 'planned',
    desc: 'Verify any zero-knowledge proof system — Halo2, Plonk, Groth16, or custom circuits — directly in a light client, no trusted setup required.',
    features: ['Proof-system agnostic', 'Trustless', 'No setup'],
    families: ['crosslink', 'ibc-wasm'],
  },
  {
    id: 'wasm-custom-logic',
    title: 'WASM Custom Logic',
    icon: '▣',
    status: 'planned',
    desc: 'Deploy arbitrary verification logic as CosmWasm bytecode. Any consensus engine, any state machine, any verification rule you can compile to WASM.',
    features: ['Chain-agnostic', 'Upgradeable', 'Community modules'],
    families: ['ibc-wasm', 'tactic'],
  },
  {
    id: 'spv-header-verify',
    title: 'SPV Header Verification',
    icon: '⬡',
    status: 'planned',
    desc: 'Verify Simplified Payment Verification headers from any chain. Lightweight proof that a transaction occurred without running a full node.',
    features: ['Lightweight', 'Any SPV chain', 'Minimal state'],
    families: ['spv-client', 'bitcoin-bridge', 'ibc-wasm'],
  },
  {
    id: 'threshold-verify',
    title: 'Threshold Signature Verification',
    icon: '⚙',
    status: 'planned',
    desc: 'Verify multi-party threshold signatures as a light-client primitive. Enables federated consensus verification without full BFT replication.',
    features: ['Multi-party', 'Federated', 'No BFT replay'],
    families: ['solomachine', 'ibc-wasm'],
  },
  {
    id: 'private-state-verify',
    title: 'Private State Verification',
    icon: '◐',
    status: 'planned',
    desc: 'Verify shielded or encrypted state transitions without revealing the underlying data. Proofs over private state, not the state itself.',
    features: ['Privacy-preserving', 'Shielded state', 'Selective disclosure'],
    families: ['zcash-bridge', 'crosslink', 'ibc-wasm'],
  },
  {
    id: 'historical-proof',
    title: 'Historical State Proofs',
    icon: '◷',
    status: 'planned',
    desc: 'Verify past state at any block height. Enables time-travel queries, audit trails, and retrospective verification without archive nodes.',
    features: ['Any height', 'No archive node', 'Audit trail'],
    families: ['ibc-wasm', 'tendermint'],
  },
  {
    id: 'state-aggregation',
    title: 'Cross-Chain State Aggregation',
    icon: '⊞',
    status: 'planned',
    desc: 'Aggregate and verify state from multiple chains in a single light client. Enables cross-chain composition without per-chain relayers.',
    features: ['Multi-chain', 'Single client', 'Composable'],
    families: ['ibc-wasm', 'ibcv2'],
  },
  {
    id: 'light-mesh',
    title: 'Light-Client Verification Mesh',
    icon: '✦',
    status: 'planned',
    desc: 'Peer-to-peer light-client verification mesh where clients verify each other. Rapid path establishment without centralized relayers.',
    features: ['P2P mesh', 'No relays', 'Rapid paths'],
    families: ['tactic', 'ibc-wasm'],
  },
  {
    id: 'timelock-verify',
    title: 'Timelock Verification',
    icon: '⏑',
    status: 'planned',
    desc: 'Verify time-based conditions and delayed execution in a light client. Enables timelocked transfers, vesting, and deadline-bound proofs.',
    features: ['Time-based', 'Delayed exec', 'Deadline proofs'],
    families: ['ibc-wasm'],
  },
  {
    id: 'oracle-state',
    title: 'Oracle-Verified State',
    icon: '◎',
    status: 'planned',
    desc: 'Verify external oracle attestations as IBC client state. Bridge real-world data into IBC verification without trusting a single oracle.',
    features: ['Oracle-agnostic', 'Multi-source', 'Verifiable'],
    families: ['ibc-wasm', 'ibcv2'],
  },
];

/** IBC v2 capability cards — next-gen verification beyond IBC v1 */
const IBCV2_CAPABILITY_CARDS = [
  {
    id: 'v2-multi-consensus',
    title: 'Multi-Consensus Verification',
    icon: '⬡',
    status: 'planned',
    desc: 'Verify multiple consensus engines through a single IBC v2 client. Switch between Tendermint, GRANDPA, HotStuff, or custom consensus without re-deploying.',
    features: ['Consensus-agnostic', 'Hot-swappable', 'Unified interface'],
    families: ['ibcv2', 'substrate'],
  },
  {
    id: 'v2-cross-vm',
    title: 'Cross-VM State Verification',
    icon: '▤',
    status: 'planned',
    desc: 'Verify state from any virtual machine — EVM, SVM, MoveVM, or custom runtimes — through a single IBC v2 light-client interface.',
    features: ['VM-agnostic', 'EVM / SVM / Move', 'Unified proofs'],
    families: ['ibcv2', 'evm-client'],
  },
  {
    id: 'v2-recursive-proof',
    title: 'Recursive Proof Composition',
    icon: '↻',
    status: 'planned',
    desc: 'Compose and verify recursive proofs where one proof verifies another. Enables infinite proof chains, rollup verification, and nested state proofs.',
    features: ['Recursive', 'Proof chains', 'Rollup-ready'],
    families: ['ibcv2', 'crosslink', 'ibc-wasm'],
  },
  {
    id: 'v2-identity-verify',
    title: 'Identity-Bound Verification',
    icon: '⚷',
    status: 'planned',
    desc: 'Verify state transitions bound to specific identities — WebAuthn passkeys, DIDs, or threshold groups — rather than consensus participants.',
    features: ['Identity-bound', 'Passkey-ready', 'DID-compatible'],
    families: ['ibcv2', 'passkey-lc'],
  },
  {
    id: 'v2-data-availability',
    title: 'Data Availability Proofs',
    icon: '⊟',
    status: 'planned',
    desc: 'Verify that data was published and is available without downloading it. Enables light-client verification of data availability layers and blob stores.',
    features: ['DA verification', 'No download', 'Blob-ready'],
    families: ['ibcv2', 'ibc-wasm'],
  },
  {
    id: 'v2-fault-proof',
    title: 'Fault Proof Verification',
    icon: '⚡',
    status: 'planned',
    desc: 'Verify fault proofs — interactive or one-shot — that demonstrate incorrect state transitions. Enables optimistic verification without full execution.',
    features: ['Fault proofs', 'Optimistic', 'Minimal exec'],
    families: ['ibcv2', 'ibc-wasm'],
  },
  {
    id: 'v2-atomic-swap',
    title: 'Atomic Swap Verification',
    icon: '⇄',
    status: 'planned',
    desc: 'Verify atomic swap conditions — HTLCs, hash preimages, timelocks — natively in the light client. Cross-chain swaps without intermediaries.',
    features: ['Atomic', 'No intermediary', 'HTLC-native'],
    families: ['ibcv2', 'ibc-wasm'],
  },
  {
    id: 'v2-state-channel',
    title: 'Off-Chain State Channel Verification',
    icon: '⬡',
    status: 'planned',
    desc: 'Verify off-chain state channel updates on-chain through a light client. Enables instant finality for high-frequency interactions.',
    features: ['Off-chain', 'Instant finality', 'High-frequency'],
    families: ['ibcv2', 'ibc-wasm'],
  },
];

/**
 * Mount a grid of capability cards into a container.
 * @param {HTMLElement} body
 * @param {{ id: string, title: string, icon: string, status: string, desc: string, features: string[], families: string[] }[]} cards
 * @param {object} snap — IBC snapshot for live family counts
 */
function mountCapCardGrid(body, cards, snap) {
  const grid = el(`<div class="ibc-cap-grid"></div>`);
  for (const card of cards) {
    const live = snap?.clients
      ? snap.clients.filter((c) => card.families.includes(c.family)).length
      : 0;
    const statusClass = card.status === 'live' ? '' : ' planned';
    grid.appendChild(el(`
      <div class="ibc-cap-card${statusClass}">
        <div class="ibc-cap-card-head">
          <span class="ibc-cap-icon">${card.icon}</span>
          <span class="ibc-cap-title">${esc(card.title)}</span>
          <span class="ibc-cap-status${statusClass}">${card.status}</span>
        </div>
        <p class="ibc-cap-desc">${esc(card.desc)}</p>
        <div class="ibc-cap-features">
          ${card.features
            .map(
              (f) =>
                `<span class="ibc-cap-tag${card.status === 'live' ? ' live' : ' planned-tag'}">${esc(f)}</span>`,
            )
            .join('')}
          ${live > 0 ? `<span class="ibc-cap-tag live">${live} on-chain</span>` : ''}
        </div>
      </div>
    `));
  }
  body.appendChild(grid);
}

/** IBC-WASM: 08-wasm light client inventory + modular capability cards */
function mountWasmClients(body, ctx) {
  const clients = (ctx.snapshot.clients || []).filter(
    (c) => c.family === 'ibc-wasm' || c.family === 'crosslink' || c.family === 'tactic',
  );
  body.appendChild(
    el(
      `<p class="type-panel-blurb">${clients.length} IBC-WASM (08-wasm) light client(s) on LCD. WASM clients enable modular, chain-agnostic light-client verification — deploy any verification logic as CosmWasm bytecode, no protocol-specific wrappers needed.</p>`,
    ),
  );

  // Sub-family breakdown
  const sub = {};
  for (const c of clients) {
    const f = c.family || 'unknown';
    sub[f] = (sub[f] || 0) + 1;
  }
  const subStr = Object.entries(sub)
    .map(([k, v]) => `${k}:${v}`)
    .join(' · ');
  if (subStr) {
    body.appendChild(
      el(
        `<p class="type-panel-blurb" style="margin-bottom:0.5rem;font-size:0.82rem;color:rgba(152,232,193,0.6);">${subStr}</p>`,
      ),
    );
  }

  const rows = clients
    .slice(0, 80)
    .map(
      (c) => `<tr>
      <td>${esc(c.clientId)}</td>
      <td class="human">${esc(c.family)}</td>
      <td class="human">${esc(c.chainId || '—')}</td>
      <td class="muted" style="max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.typeUrl || '')}</td>
    </tr>`,
    )
    .join('');
  body.appendChild(
    tableShell(
      ['Client id', 'Family', 'Counterparty chain', 'Type URL'],
      rows,
      'No 08-wasm clients on LCD yet.',
    ),
  );

  // Modular capability cards — protocol-agnostic, showcase creative IBC client capabilities
  mountCapCardGrid(body, WASM_CAPABILITY_CARDS, ctx.snapshot);
}

/** IBC v2: next-gen client types + modular capability cards */
function mountIbcV2(body, ctx) {
  const clients = (ctx.snapshot.clients || []).filter(
    (c) =>
      c.family === 'ibcv2' ||
      c.family === 'bitcoin-bridge' ||
      c.family === 'zcash-bridge' ||
      c.family === 'spv-client' ||
      c.family === 'substrate' ||
      c.family === 'evm-client',
  );
  body.appendChild(
    el(
      `<p class="type-panel-blurb">${clients.length} next-gen IBC v2 client(s) on LCD. IBC v2 expands the light-client interface with a protocol-agnostic verification layer — any consensus engine, any VM, any proof system can be verified through a unified interface.</p>`,
    ),
  );

  const rows = clients
    .slice(0, 80)
    .map(
      (c) => `<tr>
      <td>${esc(c.clientId)}</td>
      <td class="human">${esc(c.family)}</td>
      <td class="human">${esc(c.chainId || '—')}</td>
      <td class="muted" style="max-width:12rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${esc(c.typeUrl || '')}</td>
    </tr>`,
    )
    .join('');
  body.appendChild(
    tableShell(
      ['Client id', 'Family', 'Counterparty chain', 'Type URL'],
      rows,
      'No IBC v2 clients on LCD yet.',
    ),
  );

  // Modular capability cards — protocol-agnostic, showcase creative IBC v2 capabilities
  mountCapCardGrid(body, IBCV2_CAPABILITY_CARDS, ctx.snapshot);
}

/** Tendermint LC family inventory */
function mountTendermint(body, ctx) {
  const clients = (ctx.snapshot.clients || [])
    .filter((c) => c.family === 'tendermint')
    .sort((a, b) => naturalId(a.clientId, b.clientId));
  body.appendChild(
    el(`<p class="type-panel-blurb">${clients.length} tendermint light client(s) on LCD. Future: status + trusting period panels per client.</p>`),
  );
  const rows = clients
    .map(
      (c) => `<tr>
      <td>${esc(c.clientId)}</td>
      <td class="human">${esc(c.chainId || '—')}</td>
      <td class="muted">${esc((c.typeUrl || '').split('.').slice(-1)[0] || c.typeUrl || '')}</td>
    </tr>`,
    )
    .join('');
  body.appendChild(
    tableShell(['Client', 'Counterparty chain', 'Type'], rows, 'No 07-tendermint clients listed.'),
  );

  // Channels using those clients
  const ids = new Set(clients.map((c) => c.clientId));
  const linked = (ctx.snapshot.channels || []).filter((c) => ids.has(c.client));
  if (linked.length) {
    body.appendChild(
      el(`<p class="type-panel-blurb" style="margin-top:1rem;">${linked.length} open channel(s) hop through those clients.</p>`),
    );
  }
}

async function mountRelayer(body, ctx) {
  body.appendChild(
    el(`<p class="type-panel-blurb">Deposit gas so public Hermes paths keep relaying. Seat inventory with live balances below; Deposit opens the funding flow per chain. Addresses from <code>config.json → ibc.foundationRelayers</code>.</p>`),
  );
  // Seat inventory table (same snapshot the strip paints). Deposit buttons
  // forward to the matching seat button in the fund bar, which owns the
  // deposit modal flow — this tab never reimplements it.
  let seats = [];
  try {
    if (ctx.ibcCtx) {
      const rows = await loadFoundationBalances(ctx.ibcCtx);
      seats = (rows || []).flatMap((r) => (r.accounts || []).map((a) => ({ ...a, set: r.label || '' })));
    }
  } catch (e) {
    console.warn('[ibc] relayer seats', e);
  }
  if (seats.length) {
    const rowsHtml = seats
      .map((a) => {
        const status = !a.configured ? 'not set' : a.low ? 'low' : 'ok';
        return `<tr>
        <td>${esc(a.name || a.chainId)}<div class="muted" style="font-size:0.75rem;">${esc(a.set || '')}</div></td>
        <td class="human">${esc(a.display || '—')}</td>
        <td><code style="font-size:0.75rem;">${esc(a.address || '—')}</code></td>
        <td class="muted">${esc(status)}</td>
        <td style="white-space:nowrap;">
          <button type="button" class="rel-mini" data-relay-copy="${esc(a.address || '')}" ${a.configured ? '' : 'disabled'}>Copy</button>
          <button type="button" class="rel-mini primary" data-relay-deposit="${esc(a.chainId || '')}" ${a.configured ? '' : 'disabled'}>Deposit</button>
        </td>
      </tr>`;
      })
      .join('');
    body.appendChild(tableShell(['Chain', 'Balance', 'Address', 'Status', 'Actions'], rowsHtml, 'No relayer seats configured.'));
    if (!body.dataset.relayBound) {
      body.dataset.relayBound = '1';
      if (!document.getElementById('rel-mini-styles')) {
        const style = document.createElement('style');
        style.id = 'rel-mini-styles';
        style.textContent = `
        .rel-mini { font-size: 0.78rem; padding: 0.35rem 0.6rem; margin-right: 0.3rem;
          border-radius: 5px; border: 1px solid rgba(255,255,255,0.1);
          background: transparent; color: #d2d3d8; cursor: pointer; font-family: inherit; }
        .rel-mini:hover:not(:disabled) { border-color: #98e8c1; color: #98e8c1; }
        .rel-mini.primary { border-color: rgba(152,232,193,0.4); color: #98e8c1; }
        .rel-mini:disabled { opacity: 0.4; cursor: default; }`;
        document.head.appendChild(style);
      }
      body.addEventListener('click', (e) => {
        const copyBtn = e.target?.closest?.('[data-relay-copy]');
        if (copyBtn?.dataset.relayCopy) {
          e.preventDefault();
          navigator.clipboard?.writeText(copyBtn.dataset.relayCopy).catch(() => null);
          return;
        }
        const depBtn = e.target?.closest?.('[data-relay-deposit]');
        if (!depBtn?.dataset.relayDeposit) return;
        e.preventDefault();
        const chainId = depBtn.dataset.relayDeposit;
        const seatBtn = body.querySelector(`#ibc-fund-mount [data-act="fund"][data-chain="${CSS.escape(chainId)}"]`);
        if (seatBtn && !seatBtn.disabled) {
          seatBtn.scrollIntoView({ block: 'nearest' });
          seatBtn.click();
        }
      });
    }
  } else {
    body.appendChild(
      el(`<div class="section-card"><p class="muted">No relayer seats found. Add <code>ibc.foundationRelayers</code> in <code>public/config.json</code>.</p></div>`),
    );
  }
  // Fund bar lives in this tab (not pinned above the page): the table
  // Deposit buttons forward to the seat buttons in the mount below,
  // which owns the deposit modal flow.
  const card = el(`<div class="section-card" id="relayer-fund-section"><div id="ibc-fund-mount"></div></div>`);
  body.appendChild(card);
  const mount = card.querySelector('#ibc-fund-mount');
  if (mount && ctx.ibcCtx) {
    try {
      await mountFundBar(mount, {
        ctx: ctx.ibcCtx,
        embedded: true,
        getUserAddress: () => TerpWallet.getSnapshot().address,
      });
    } catch (e) {
      mount.innerHTML =
        `<p style="color:#fe7d7d;font-size:0.85rem;">Relayer fund bar: ${esc(e.message || e)}</p>
         <p class="muted" style="font-size:0.82rem;margin-top:0.35rem;">Configure foundation addresses in public/config.json → ibc.foundationRelayers</p>`;
    }
  } else if (mount) {
    mount.innerHTML = `<p class="muted" style="font-size:0.85rem;">Relayer fund bar: IBC context not available</p>`;
  }
}

export async function bootIbcPage() {
  await loadSiteConfig(CONFIG, { pageId: 'ibc' });
  window.__TERP_CONFIG = CONFIG;

  // Show loading skeleton immediately
  paintStats(null, true);

  const ibcCtx = await loadIbcContext().catch((e) => {
    console.warn('[ibc] context', e);
    return null;
  });

  // Align Terp REST with page config (CORS-friendly mainnet LCD)
  if (ibcCtx?.chains?.terp && CONFIG.rest) {
    ibcCtx.chains.terp.rest = CONFIG.rest.replace(/\/$/, '');
    if (CONFIG.rpc) ibcCtx.chains.terp.rpc = CONFIG.rpc;
  }

  let snapshot = {
    channels: [],
    connections: [],
    clients: [],
    byFamily: {},
    stats: {},
    source: 'none',
    proxyConnected: false,
  };

  async function refresh(quiet = false) {
    if (!ibcCtx) {
      paintStats(snapshot);
      return;
    }
    if (!quiet) paintStats(null, true);
    try {
      snapshot = await loadIbcSnapshot(ibcCtx);
    } catch (e) {
      console.warn('[ibc] refresh snapshot', e);
      snapshot = {
        ...snapshot,
        stats: { ...snapshot.stats, error: e.message || String(e) },
      };
    }
    window.__TERP_IBC_SNAPSHOT = snapshot;
    paintStats(snapshot);
    if (window.__TERP_IBC_TABS) {
      window.__TERP_IBC_TABS.select(window.__TERP_IBC_TABS.getActive());
    }
  }

  if (ibcCtx) {
    // Cache-first paint: show the published snapshot immediately, then
    // reload live channels/clients/connections in the background.
    let paintedCache = false;
    try {
      const cached = await loadIbcSnapshotCached(ibcCtx);
      if (cached && (cached.channels?.length || cached.connections?.length || cached.clients?.length)) {
        snapshot = cached;
        paintedCache = true;
      }
    } catch (e) {
      console.warn('[ibc] cached snapshot', e);
    }
    if (paintedCache) {
      paintStats(snapshot);
      window.__TERP_IBC_SNAPSHOT = snapshot;
      refresh(true).catch((e) => console.warn('[ibc] background refresh', e));
    } else {
      try {
        snapshot = await loadIbcSnapshot(ibcCtx);
      } catch (e) {
        console.warn('[ibc] snapshot', e);
        snapshot.stats = { error: e.message || String(e), openChannels: 0, connections: 0, clients: 0 };
      }
      paintStats(snapshot);
      window.__TERP_IBC_SNAPSHOT = snapshot;
    }
  } else {
    snapshot.stats = { error: 'IBC context failed to load — check config.json', openChannels: 0 };
    paintStats(snapshot);
    window.__TERP_IBC_SNAPSHOT = snapshot;
  }
  window.__TERP_IBC = { formatAmount, CONFIG, snapshot };

  // Wallet via shared FAB only (no page-level Connect button)
  await TerpWallet.ensureLibs(CONFIG, { pageId: 'ibc' }).catch(() => null);
  await TerpWallet.tryReconnect(CONFIG).catch(() => null);

  const pageCtx = {
    get snapshot() {
      return snapshot;
    },
    config: CONFIG,
    ibcCtx,
    refresh,
  };

  installDefaultClientTypes({
    overview: (el, ctx) => mountOverview(el, ctx),
    transfer: (el, ctx) => mountTransfer(el, ctx),
    tendermint: (el, ctx) => mountTendermint(el, ctx),
    relayer: (el, ctx) => mountRelayer(el, ctx),
    wasm: (el, ctx) => mountWasmClients(el, ctx),
    ibcv2: (el, ctx) => mountIbcV2(el, ctx),
  });

  const nav = document.getElementById('type-tabs');
  const host = document.getElementById('type-panel-host');
  window.__TERP_IBC_TABS = mountClientTypeTabs(nav, host, pageCtx, {
    initialId: 'overview',
  });
}
