// ibc-clients.js — recursive modular client-type registry for the IBC page.
// Each type is a tab; types may nest children; live modules implement mount(el, ctx).
// Security: same-origin modules only; no remote code load.
// Note: avoid nested block-comments / heavy JSDoc here — a nested /** */ once broke
// module parse in production (Unexpected token '*') under CDN cache.

/** @type {Map<string, object>} */
const registry = new Map();

/** @param {object} def */
export function registerClientType(def) {
  if (!def?.id) throw new Error('registerClientType: id required');
  registry.set(def.id, { children: [], ...def });
  return def.id;
}

export function getClientType(id) {
  return registry.get(id) || null;
}

export function listClientTypes() {
  // top-level only (not nested children as root tabs)
  const nested = new Set();
  for (const d of registry.values()) {
    for (const c of d.children || []) nested.add(c.id);
  }
  return [...registry.values()].filter((d) => !nested.has(d.id));
}

export function clearClientTypes() {
  registry.clear();
}

/**
 * Pill tablist (matches ecosystem .plane-nav language).
 * @param {HTMLElement} navEl
 * @param {HTMLElement} panelHost
 * @param {object} pageCtx — { snapshot, config, wallet, re-render hooks }
 * @param {{ initialId?: string }} [opts]
 */
export function mountClientTypeTabs(navEl, panelHost, pageCtx, opts = {}) {
  if (!navEl || !panelHost) return { select() {} };

  const types = listClientTypes();
  navEl.innerHTML = '';
  navEl.classList.add('plane-nav');
  navEl.setAttribute('role', 'tablist');
  navEl.setAttribute('aria-label', 'IBC client types');

  let activeId = opts.initialId || types[0]?.id;

  const buttons = new Map();

  function paintTabs() {
    navEl.innerHTML = '';
    for (const t of types) {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'plane-tab' + (t.id === activeId ? ' active' : '');
      btn.setAttribute('role', 'tab');
      btn.setAttribute('aria-selected', t.id === activeId ? 'true' : 'false');
      btn.dataset.typeId = t.id;
      btn.textContent = t.title;
      if (t.status === 'planned') {
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = 'soon';
        btn.appendChild(document.createTextNode(' '));
        btn.appendChild(badge);
      }
      btn.addEventListener('click', () => select(t.id));
      navEl.appendChild(btn);
      buttons.set(t.id, btn);
    }
  }

  async function select(id) {
    const def = registry.get(id);
    if (!def) return;
    activeId = id;
    for (const [tid, btn] of buttons) {
      const on = tid === id;
      btn.classList.toggle('active', on);
      btn.setAttribute('aria-selected', on ? 'true' : 'false');
    }
    if (location.hash !== `#${id}`) {
      try { history.replaceState(null, '', `#${id}`); } catch { /* ignore */ }
    }
    panelHost.innerHTML = '';
    panelHost.dataset.activeType = id;
    await mountTypeTree(panelHost, def, pageCtx, 0);
  }

  paintTabs();

  // hash bootstrap
  const h = (location.hash || '').replace(/^#/, '');
  if (h && registry.has(h)) activeId = h;
  select(activeId);

  return { select, getActive: () => activeId };
}

/**
 * Recursive mount: type shell + optional children as nested tabs.
 */
async function mountTypeTree(host, def, pageCtx, depth) {
  const shell = document.createElement('section');
  shell.className = 'type-panel' + (depth > 0 ? ' type-panel-nested' : '');
  shell.dataset.typeId = def.id;

  const head = document.createElement('div');
  head.className = 'type-panel-head';
  const h = document.createElement(depth === 0 ? 'h2' : 'h3');
  h.className = 'type-panel-title';
  h.textContent = def.title;
  head.appendChild(h);
  if (def.status) {
    const st = document.createElement('span');
    st.className = `type-status status-${def.status}`;
    st.textContent = def.status;
    head.appendChild(st);
  }
  shell.appendChild(head);

  if (def.blurb) {
    const p = document.createElement('p');
    p.className = 'type-panel-blurb';
    p.textContent = def.blurb;
    shell.appendChild(p);
  }

  const body = document.createElement('div');
  body.className = 'type-panel-body';
  shell.appendChild(body);
  host.appendChild(shell);

  // Live mount or planned placeholder
  if (typeof def.mount === 'function') {
    await def.mount(body, { ...pageCtx, typeId: def.id, depth });
  } else {
    body.appendChild(buildPlannedShell(def, pageCtx));
  }

  // Nested children → recursive sub-tablist (register inline defs if needed)
  const childDefs = (def.children || [])
    .map((c) => {
      if (typeof c === 'string') return registry.get(c);
      if (c?.id) {
        if (!registry.has(c.id)) registerClientType(c);
        return registry.get(c.id) || c;
      }
      return null;
    })
    .filter(Boolean);

  if (childDefs.length) {
    const subNav = document.createElement('nav');
    subNav.className = 'plane-nav nested';
    const subHost = document.createElement('div');
    subHost.className = 'type-nested-host';
    shell.appendChild(subNav);
    shell.appendChild(subHost);

    const paintSub = async (id) => {
      subNav.innerHTML = '';
      for (const c of childDefs) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'plane-tab' + (c.id === id ? ' active' : '');
        b.textContent = c.title;
        b.addEventListener('click', () => paintSub(c.id));
        subNav.appendChild(b);
      }
      subHost.innerHTML = '';
      const child = registry.get(id) || childDefs.find((x) => x.id === id);
      if (child) await mountTypeTree(subHost, child, pageCtx, depth + 1);
    };
    await paintSub(childDefs[0].id);
  }
}

function buildPlannedShell(def, pageCtx) {
  const wrap = document.createElement('div');
  wrap.className = 'section-card planned-shell';
  const snap = pageCtx.snapshot;
  const families = def.families || [];
  let related = 0;
  if (snap?.clients && families.length) {
    related = snap.clients.filter((c) => families.includes(c.family)).length;
  }
  const lines = [
    'This client type is a modular slot — UI and execute paths land here without rewriting the page.',
  ];
  if (related > 0) {
    lines.push(`On-chain clients matching this family right now: ${related}.`);
  } else if (families.length) {
    lines.push('No LCD clients of this family reported yet (or still loading).');
  }
  for (const line of lines) {
    const p = document.createElement('p');
    p.className = 'type-panel-blurb';
    p.textContent = line;
    wrap.appendChild(p);
  }
  return wrap;
}

/**
 * Default type tree for Terp IBC desk (call once at boot).
 * Live modules receive mount functions from ibc-page.js.
 */
export function installDefaultClientTypes(mounts = {}) {
  clearClientTypes();

  registerClientType({
    id: 'overview',
    title: 'Overview',
    status: 'live',
    blurb: 'Raw IBC inventory from LCD — channels, connections, clients.',
    mount: mounts.overview,
  });

  registerClientType({
    id: 'transfer',
    title: 'Transfer',
    status: 'live',
    blurb: 'ICS-20 / transfer ports — open channels and counterparty paths.',
    families: ['tendermint'],
    mount: mounts.transfer,
  });

  registerClientType({
    id: 'tendermint',
    title: 'Tendermint LC',
    status: 'live',
    blurb: 'Classic 07-tendermint light clients (most Cosmos paths today).',
    families: ['tendermint'],
    mount: mounts.tendermint,
  });

  registerClientType({
    id: 'ibc-wasm',
    title: 'IBC-WASM',
    status: 'live',
    blurb: '08-wasm / CosmWasm light-client surfaces — deploy any verification logic as bytecode: ZK proofs, SPV headers, threshold signatures, or custom consensus.',
    families: ['ibc-wasm', 'crosslink', 'tactic'],
    mount: mounts.wasm,
    children: [
      {
        id: 'ibc-wasm-crosslink',
        title: 'Crosslink',
        status: 'planned',
        blurb: 'ZK / wasmvm bridge client family — Halo2 proofs for trustless non-Cosmos verification.',
        families: ['crosslink', 'ibc-wasm'],
      },
      {
        id: 'ibc-wasm-tactic',
        title: 'Tactic',
        status: 'planned',
        blurb: 'Tactic light-client mesh for rapid IBC path establishment.',
        families: ['tactic', 'ibc-wasm'],
      },
    ],
  });

  registerClientType({
    id: 'ibcv2',
    title: 'IBC v2',
    status: 'live',
    blurb: 'Next-gen client / channel stacks — protocol-agnostic verification layer supporting any consensus engine, any VM, any proof system through a unified interface.',
    families: ['ibcv2', 'bitcoin-bridge', 'zcash-bridge', 'spv-client', 'evm-client', 'substrate'],
    mount: mounts.ibcv2,
    children: [
      {
        id: 'ibcv2-bitcoin',
        title: 'Bitcoin bridge',
        status: 'planned',
        blurb: 'Bitcoin SPV light client verifying BTC headers via IBC v2.',
        families: ['bitcoin-bridge', 'spv-client'],
      },
      {
        id: 'ibcv2-zcash',
        title: 'Zcash crosslink',
        status: 'planned',
        blurb: 'Halo2-based Zcash light client via Crosslink WASM — shielded asset transfers.',
        families: ['zcash-bridge', 'crosslink'],
      },
      {
        id: 'ibcv2-evm',
        title: 'EVM clients',
        status: 'planned',
        blurb: 'Ethereum / Solidity-based light clients for IBC v2.',
        families: ['evm-client'],
      },
    ],
  });

  registerClientType({
    id: 'relayer',
    title: 'Relayer gas',
    status: 'live',
    blurb: 'Foundation Hermes wallets — keep public paths funded.',
    mount: mounts.relayer,
  });

  registerClientType({
    id: 'tailscale-lc',
    title: 'Tailscale LC',
    status: 'planned',
    blurb: 'Private-mesh verification clients.',
  });

  registerClientType({
    id: 'passkey-lc',
    title: 'Passkey LC',
    status: 'planned',
    blurb: 'WebAuthn-backed client identity.',
  });

  // Ensure nested planned children are registered for recursive mount
  for (const parentId of ['ibc-wasm', 'ibcv2']) {
    const parent = getClientType(parentId);
    if (parent?.children) {
      for (const c of parent.children) {
        if (c.id && !registry.has(c.id)) registerClientType(c);
      }
    }
  }
}
