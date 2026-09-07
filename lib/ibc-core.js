// ibc-core.js — live IBC data (LCD + optional proxy), no mock balances.
// Fallback: cw-orch state.json `ibc_data` (S3 + same-origin public/ibc-state.json),
// kept fresh via terp-rs `cargo run -p scripts --bin ibc` (see scripts/sync-ibc-state.sh).

import { detectChainId, fetchSiteConfig, getChainConfig } from '/lib/config.js';

/** Same-origin extract of morocco-1.ibc_data (synced from terp-rs). */
export const LOCAL_IBC_STATE_PATH = '/public/ibc-state.json';
/** Published cw-orch state (includes contracts + ibc_data). */
export const DEFAULT_STATE_JSON_URL =
  'https://s3.terp.network/snapshots/mainnet/morocco-1/state.json';

/** Default chain metadata for counterparty LCD queries & fund UI */
export const DEFAULT_CHAINS = {
  terp: {
    key: 'terp',
    chain_id: 'morocco-1',
    name: 'Terp Network',
    color: '#00d4a0',
    rpc: 'https://rpc.terp.network:443',
    rest: 'https://api.terp.network',
    prefix: 'terp',
    denom: 'uthiol',
    stake: 'uterp',
    decimals: 6,
    icon: '🌿',
    gasPrice: '0.025uthiol',
  },
  juno: {
    key: 'juno',
    chain_id: 'juno-1',
    name: 'Juno',
    color: '#f0824c',
    rpc: 'https://juno-rpc.polkachu.com',
    // Browser-safe same-origin proxy on api.terp.network (see flea-flicker nginx)
    rest: 'https://api.terp.network/x/juno',
    restDirect: 'https://juno-api.polkachu.com',
    prefix: 'juno',
    denom: 'ujuno',
    decimals: 6,
    icon: '⚡',
    gasPrice: '0.075ujuno',
  },
  osmosis: {
    key: 'osmosis',
    chain_id: 'osmosis-1',
    name: 'Osmosis',
    color: '#8b5cf6',
    rpc: 'https://rpc.osmosis.zone',
    rest: 'https://api.terp.network/x/osmosis',
    restDirect: 'https://lcd.osmosis.zone',
    prefix: 'osmo',
    denom: 'uosmo',
    decimals: 6,
    icon: '⚪',
    gasPrice: '0.025uosmo',
  },
  stargaze: {
    key: 'stargaze',
    chain_id: 'stargaze-1',
    name: 'Stargaze',
    color: '#e54c6d',
    rpc: 'https://rpc.stargaze-apis.com',
    rest: 'https://api.terp.network/x/stargaze',
    restDirect: 'https://rest.stargaze-apis.com',
    prefix: 'stars',
    denom: 'ustars',
    decimals: 6,
    icon: '🌟',
    gasPrice: '1ustars',
  },
  akash: {
    key: 'akash',
    chain_id: 'akashnet-2',
    name: 'Akash',
    color: '#e65100',
    rpc: 'https://akash-rpc.polkachu.com',
    rest: 'https://api.terp.network/x/akash',
    restDirect: 'https://akash-api.polkachu.com',
    prefix: 'akash',
    denom: 'uakt',
    decimals: 6,
    icon: '☁️',
    gasPrice: '0.025uakt',
  },
  atomone: {
    key: 'atomone',
    chain_id: 'atomone-1',
    name: 'AtomOne',
    color: '#7c3aed',
    rpc: 'https://atomone-rpc.polkachu.com',
    // No stable public LCD proxy yet — cards still show address for deposit
    rest: '',
    prefix: 'atone',
    denom: 'uatone',
    decimals: 6,
    icon: '☀️',
    gasPrice: '0.025uatone',
  },
  secret: {
    key: 'secret',
    chain_id: 'secret-4',
    name: 'Secret Network',
    color: '#a855f7',
    rpc: 'https://rpc.secret.express',
    rest: 'https://lcd.secret.express',
    prefix: 'secret',
    denom: 'uscrt',
    decimals: 6,
    icon: '🔐',
    gasPrice: '0.1uscrt',
  },
  cosmoshub: {
    key: 'cosmoshub',
    chain_id: 'cosmoshub-4',
    name: 'Cosmos Hub',
    color: '#2e3148',
    rpc: 'https://cosmos-rpc.polkachu.com',
    rest: 'https://api.terp.network/x/cosmoshub',
    restDirect: 'https://cosmos-api.polkachu.com',
    prefix: 'cosmos',
    denom: 'uatom',
    decimals: 6,
    icon: '⚛️',
    gasPrice: '0.025uatom',
  },
  bitsong: {
    key: 'bitsong',
    chain_id: 'bitsong-2b',
    name: 'BitSong',
    color: '#ff2d55',
    rpc: 'https://rpc.explorebitsong.com',
    rest: 'https://api.terp.network/x/bitsong',
    restDirect: 'https://lcd.explorebitsong.com',
    prefix: 'bitsong',
    denom: 'ubtsg',
    decimals: 6,
    icon: '🎵',
    gasPrice: '0.025ubtsg',
  },
  jackal: {
    key: 'jackal',
    chain_id: 'jackal-1',
    name: 'Jackal',
    color: '#0d6efd',
    rpc: 'https://rpc.jackalprotocol.com',
    rest: 'https://api.terp.network/x/jackal',
    restDirect: 'https://api.jackalprotocol.com',
    prefix: 'jkl',
    denom: 'ujkl',
    decimals: 6,
    icon: '🐺',
    gasPrice: '0.02ujkl',
  },
  penumbra: {
    key: 'penumbra',
    chain_id: 'penumbra-1',
    name: 'Penumbra',
    color: '#7c3aed',
    // Shielded; LCD bank queries may not apply — address still listed for funding UX
    rpc: '',
    rest: '',
    prefix: 'penumbra',
    denom: 'upenumbra',
    decimals: 6,
    icon: '🌑',
    gasPrice: '',
  },
};

const cache = new Map();
const CACHE_MS = 45_000;

function cacheGet(key) {
  const e = cache.get(key);
  if (!e) return null;
  if (Date.now() - e.ts > CACHE_MS) {
    cache.delete(key);
    return null;
  }
  return e.v;
}

function cacheSet(key, v) {
  cache.set(key, { ts: Date.now(), v });
  return v;
}

async function fetchJson(url, { timeoutMs = 12000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * Merge site config into DEFAULT_CHAINS (rpc/rest overrides + foundation relayers).
 */
export async function loadIbcContext() {
  const site = await fetchSiteConfig().catch(() => ({}));
  const chainId = detectChainId();
  let terp = null;
  try {
    terp = await getChainConfig(chainId);
  } catch {
    terp = site.chains?.[chainId] || site.chains?.['morocco-1'];
  }

  const chains = JSON.parse(JSON.stringify(DEFAULT_CHAINS));
  if (terp) {
    chains.terp = {
      ...chains.terp,
      chain_id: terp.chainId || chains.terp.chain_id,
      name: terp.chainName || chains.terp.name,
      rpc: terp.rpc || chains.terp.rpc,
      rest: (terp.rest || chains.terp.rest).replace(/\/$/, ''),
      denom: terp.denom?.fee || chains.terp.denom,
      stake: terp.denom?.stake || chains.terp.stake,
      decimals: terp.denom?.decimals ?? 6,
    };
  }

  // Optional per-chain overrides in config.json → ibc.chains
  const ibc = site.ibc || {};
  if (ibc.chains && typeof ibc.chains === 'object') {
    for (const [key, ov] of Object.entries(ibc.chains)) {
      chains[key] = { ...(chains[key] || { key }), ...ov, key };
    }
  }

  const foundationRelayers = Array.isArray(ibc.foundationRelayers)
    ? ibc.foundationRelayers
    : defaultFoundationRelayers(chains);

  const stateJson =
    ibc.stateJson ||
    site.services?.stateJson ||
    site.stateJsonUrl ||
    terp?.services?.stateJson ||
    DEFAULT_STATE_JSON_URL;
  const stateJsonLocal = ibc.stateJsonLocal || LOCAL_IBC_STATE_PATH;

  return {
    site,
    chainId,
    terp,
    chains,
    proxyUrl: ibc.proxyUrl || 'https://ibc-proxy.terp.network',
    /** Same-origin nginx path when dedicated proxy host is down */
    proxyUrlFallback: ibc.proxyUrlFallback || '/ibc-proxy',
    foundationRelayers,
    /** Primary: S3/cw-orch state.json; secondary: local extract for CORS/offline */
    stateJson,
    stateJsonLocal,
  };
}

/** Placeholder structure — fill addresses in public/config.json → ibc.foundationRelayers */
function defaultFoundationRelayers(chains) {
  return [
    {
      id: 'foundation-hermes',
      label: 'Foundation Hermes',
      note: 'Gas wallets for public IBC paths. Set addresses in config.json.',
      accounts: Object.fromEntries(
        Object.values(chains)
          .filter((c) => c.rest)
          .map((c) => [
            c.chain_id,
            {
              chainKey: c.key,
              address: '', // fill via config
              denom: c.denom,
              minSuggested: '1000000', // 1 token in base units (display only)
            },
          ]),
      ),
    },
  ];
}

export function chainById(chains, chainId) {
  return Object.values(chains).find((c) => c.chain_id === chainId) || null;
}

export function chainByKey(chains, key) {
  return chains[key] || null;
}

/**
 * Live bank balances for an address.
 * Tries primary `rest`, then optional `restDirect` (for when proxy LCD is down).
 * @param {string|object} restOrChain — LCD URL or chain meta with .rest / .restDirect
 * @param {string} address
 */
export async function fetchBalances(restOrChain, address) {
  if (!address) return [];
  const urls = [];
  if (typeof restOrChain === 'string') {
    if (restOrChain) urls.push(restOrChain);
  } else if (restOrChain && typeof restOrChain === 'object') {
    if (restOrChain.rest) urls.push(restOrChain.rest);
    if (restOrChain.restDirect) urls.push(restOrChain.restDirect);
  }
  if (!urls.length) return [];

  for (const rest of urls) {
    const base = rest.replace(/\/$/, '');
    const key = `bal:${base}:${address}`;
    const hit = cacheGet(key);
    if (hit) return hit;
    try {
      const data = await fetchJson(
        `${base}/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}?pagination.limit=200`,
        { timeoutMs: 8000 },
      );
      const balances = data.balances || [];
      return cacheSet(key, balances);
    } catch (e) {
      console.warn('[ibc-core] balances', base, e.message);
    }
  }
  return [];
}

export function formatAmount(amount, decimals = 6, maxFrac = 4) {
  try {
    const n = Number(amount) / 10 ** decimals;
    if (!Number.isFinite(n)) return '0';
    return n.toLocaleString(undefined, { maximumFractionDigits: maxFrac });
  } catch {
    return '0';
  }
}

export function pickDisplayBalance(balances, preferDenom, decimals = 6) {
  if (!balances?.length) return { amount: '0', denom: preferDenom || '', display: '0' };
  const hit =
    balances.find((b) => b.denom === preferDenom) ||
    balances.find((b) => !b.denom.startsWith('ibc/')) ||
    balances[0];
  return {
    amount: hit.amount,
    denom: hit.denom,
    display: formatAmount(hit.amount, decimals),
    all: balances,
  };
}

/**
 * Live IBC channels from Terp LCD (paginated).
 */
export async function fetchChannelsFromLcd(rest) {
  const base = rest.replace(/\/$/, '');
  const channels = [];
  let next = '';
  do {
    const url =
      `${base}/ibc/core/channel/v1/channels?pagination.limit=100` +
      (next ? `&pagination.key=${encodeURIComponent(next)}` : '');
    const data = await fetchJson(url);
    for (const ch of data.channels || []) {
      channels.push(ch);
    }
    next = data.pagination?.next_key || '';
  } while (next);
  return channels;
}

export async function fetchConnectionsFromLcd(rest) {
  const base = rest.replace(/\/$/, '');
  const connections = [];
  let next = '';
  do {
    const url =
      `${base}/ibc/core/connection/v1/connections?pagination.limit=100` +
      (next ? `&pagination.key=${encodeURIComponent(next)}` : '');
    const data = await fetchJson(url);
    for (const c of data.connections || []) connections.push(c);
    next = data.pagination?.next_key || '';
  } while (next);
  return connections;
}

/** Paginated client states from LCD (low-hanging raw IBC inventory). */
export async function fetchClientStatesFromLcd(rest) {
  const base = rest.replace(/\/$/, '');
  const clients = [];
  let next = '';
  do {
    const url =
      `${base}/ibc/core/client/v1/client_states?pagination.limit=100` +
      (next ? `&pagination.key=${encodeURIComponent(next)}` : '');
    const data = await fetchJson(url);
    for (const row of data.client_states || data.clientStates || []) {
      const id = row.client_id || row.clientId;
      const cs = row.client_state || row.clientState || {};
      const typeUrl = cs['@type'] || cs.type_url || cs.typeUrl || '';
      const chainId =
        cs.chain_id ||
        cs.chainId ||
        cs.value?.chain_id ||
        null;
      clients.push({
        clientId: id,
        typeUrl,
        chainId,
        family: classifyClientType(typeUrl),
        // keep payload small for UI — drop deep proof_specs from raw in list views
        raw: { client_id: id, typeUrl, chainId },
      });
    }
    next = data.pagination?.next_key || '';
  } while (next);
  return clients;
}

/** Map client type_url → modular family id used by client type tabs. */
export function classifyClientType(typeUrl = '') {
  const t = String(typeUrl).toLowerCase();
  if (!t) return 'unknown';
  if (t.includes('tendermint') || t.includes('07-tendermint')) return 'tendermint';
  if (t.includes('wasm') || t.includes('08-wasm')) return 'ibc-wasm';
  if (t.includes('localhost') || t.includes('09-localhost')) return 'localhost';
  if (t.includes('solomachine') || t.includes('06-solomachine')) return 'solomachine';
  if (t.includes('crosslink')) return 'crosslink';
  if (t.includes('tactic')) return 'tactic';
  if (t.includes('ibc.core.client.v2') || t.includes('ibcv2') || t.includes('v2/')) return 'ibcv2';
  if (t.includes('bitcoin') || t.includes('btc') || t.includes('bitcoinbridge')) return 'bitcoin-bridge';
  if (t.includes('zcash') || t.includes('zec')) return 'zcash-bridge';
  if (t.includes('spv')) return 'spv-client';
  if (t.includes('grandpa') || t.includes('substrate')) return 'substrate';
  if (t.includes('ethereum') || t.includes('eth') || t.includes('solidity')) return 'evm-client';
  return 'other';
}

/**
 * Resolve which side of an ibc_data entry is Terp (morocco-1 / chain_name terp).
 */
function terpSideOfEntry(entry) {
  const c1 = entry?.chain_1 || {};
  const c2 = entry?.chain_2 || {};
  const isTerp = (c) =>
    c.chain_name === 'terp' ||
    c.chain_id === 'morocco-1' ||
    c.chainId === 'morocco-1';
  if (isTerp(c1)) return { terp: c1, counterparty: c2, terpKey: 'chain_1', cpKey: 'chain_2' };
  if (isTerp(c2)) return { terp: c2, counterparty: c1, terpKey: 'chain_2', cpKey: 'chain_1' };
  // Fallback: assume chain_2 is terp (common alpha order)
  return { terp: c2, counterparty: c1, terpKey: 'chain_2', cpKey: 'chain_1' };
}

/**
 * Convert cw-orch / terp-rs `ibc_data` map into the page snapshot shape.
 * @param {object} ibcData — morocco-1.ibc_data
 * @param {object} chains — ctx.chains
 * @param {string} [sourceLabel]
 */
export function snapshotFromStateIbcData(ibcData, chains = {}, sourceLabel = 'state') {
  const channels = [];
  const connections = [];
  const clients = [];
  const connSeen = new Set();
  const clientSeen = new Set();

  if (!ibcData || typeof ibcData !== 'object') {
    return {
      channels: [],
      connections: [],
      clients: [],
      byFamily: {},
      source: sourceLabel,
      proxyConnected: false,
      lcdOk: false,
      stats: {
        openChannels: 0,
        connections: 0,
        clients: 0,
        source: sourceLabel,
        proxyConnected: false,
        error: 'empty ibc_data',
      },
    };
  }

  for (const [cpKey, entry] of Object.entries(ibcData)) {
    if (!entry || typeof entry !== 'object' || cpKey === '') continue;
    if (!entry.chain_1 && !entry.chain_2) continue;

    const { terp, counterparty, terpKey, cpKey: sideCp } = terpSideOfEntry(entry);
    const status = entry.client_status || entry.clientStatus || 'Active';
    const active = String(status).toLowerCase() === 'active';
    const cpChainId = counterparty.chain_id || counterparty.chainId || '';
    const cpName = counterparty.chain_name || counterparty.chainName || cpKey;
    const cpMeta =
      chainById(chains, cpChainId) ||
      chains[cpKey] ||
      chains[cpName] ||
      null;

    const terpClient = terp.client_id || terp.clientId || '';
    const terpConn = terp.connection_id || terp.connectionId || '';

    if (terpClient && !clientSeen.has(terpClient)) {
      clientSeen.add(terpClient);
      clients.push({
        clientId: terpClient,
        client_id: terpClient,
        chainId: cpChainId || null,
        family: classifyClientType('07-tendermint'),
        typeUrl: '/ibc.lightclients.tendermint.v1.ClientState',
        status,
        source: sourceLabel,
      });
    }
    if (terpConn && !connSeen.has(terpConn)) {
      connSeen.add(terpConn);
      connections.push({
        id: terpConn,
        client_id: terpClient,
        clientId: terpClient,
        counterparty: {
          client_id: counterparty.client_id || counterparty.clientId || '',
          connection_id: counterparty.connection_id || counterparty.connectionId || '',
        },
        state: active ? 'STATE_OPEN' : 'STATE_UNKNOWN',
        source: sourceLabel,
      });
    }

    for (const ch of entry.channels || []) {
      const terpCh = ch[terpKey] || {};
      const cpCh = ch[sideCp] || {};
      const tags = ch.tags || {};
      const tagStatus = (tags.status || status || 'ACTIVE').toString().toUpperCase();
      const isOpen = tagStatus === 'ACTIVE' || active;
      if (!isOpen) continue;

      const chId = terpCh.channel_id || terpCh.channelId || '';
      if (!chId) continue;

      channels.push({
        id: chId,
        port: terpCh.port_id || terpCh.portId || 'transfer',
        counterparty: {
          chain: cpMeta?.key || cpName || 'unknown',
          chainId: cpChainId || cpMeta?.chain_id || null,
          channel: cpCh.channel_id || cpCh.channelId || '',
          port: cpCh.port_id || cpCh.portId || 'transfer',
        },
        state: 'STATE_OPEN',
        ordering: ch.ordering || 'unordered',
        version: ch.version || 'ics20-1',
        connection: terpConn,
        client: terpClient,
        preferred: !!tags.preferred,
        txCount: 0,
        pending: 0,
        source: sourceLabel,
      });
    }
  }

  const byFamily = {};
  for (const c of clients) {
    const f = c.family || 'unknown';
    byFamily[f] = (byFamily[f] || 0) + 1;
  }

  return {
    channels,
    connections,
    clients,
    byFamily,
    source: sourceLabel,
    proxyConnected: false,
    lcdOk: false,
    counts: { lcd: 0, proxy: 0, open: channels.length, state: channels.length },
    stats: {
      openChannels: channels.length,
      connections: connections.length,
      clients: clients.length,
      source: sourceLabel,
      proxyConnected: false,
      error: null,
      fallback: true,
    },
  };
}

/**
 * Load ibc_data from S3 state.json and/or same-origin public/ibc-state.json.
 * Accepts either full multi-chain state or a slim { chainId, ibc_data } extract.
 */
export async function loadIbcDataFromState(ctx = {}) {
  const chainId = ctx.chainId || ctx.chains?.terp?.chain_id || 'morocco-1';
  const urls = [
    ctx.stateJson,
    ctx.stateJsonLocal || LOCAL_IBC_STATE_PATH,
    DEFAULT_STATE_JSON_URL,
  ].filter(Boolean);
  // de-dupe
  const seen = new Set();
  const unique = urls.filter((u) => {
    if (seen.has(u)) return false;
    seen.add(u);
    return true;
  });

  for (const url of unique) {
    try {
      const data = await fetchJson(url, { timeoutMs: 12000 });
      let ibcData = null;
      let sourceLabel = 'state';

      if (data?.ibc_data && typeof data.ibc_data === 'object') {
        // slim extract: { chainId, ibc_data, updatedAt }
        ibcData = data.ibc_data;
        sourceLabel = data.source || (String(url).includes('/public/') ? 'local-state' : 'state');
      } else if (data?.[chainId]?.ibc_data) {
        ibcData = data[chainId].ibc_data;
        sourceLabel = String(url).includes('s3.terp.network') ? 's3-state' : 'state';
      } else if (data?.['morocco-1']?.ibc_data) {
        ibcData = data['morocco-1'].ibc_data;
        sourceLabel = 's3-state';
      }

      if (ibcData && Object.keys(ibcData).length) {
        return {
          ibcData,
          sourceLabel,
          url,
          updatedAt: data.updatedAt || data.updated_at || null,
        };
      }
    } catch (e) {
      console.warn('[ibc-core] state.json', url, e.message || e);
    }
  }
  return null;
}

/**
 * Fast cache-only snapshot: published S3/local state.json, no live LCD.
 * Paint this immediately, then reload live in the background and re-paint.
 * Returns null when no cache is available (caller falls back to full load).
 */
export async function loadIbcSnapshotCached(ctx = {}) {
  const packed = await loadIbcDataFromState(ctx).catch(() => null);
  if (!packed?.ibcData) return null;
  const snap = snapshotFromStateIbcData(packed.ibcData, ctx.chains, packed.sourceLabel);
  snap.stateUrl = packed.url;
  snap.updatedAt = packed.updatedAt;
  snap.stats = { ...(snap.stats || {}), fallback: true, refreshing: true };
  return snap;
}

/**
 * Full low-hanging snapshot: channels + connections + clients (LCD + optional proxy).
 * Falls back to cw-orch state.json ibc_data when live queries fail or return empty.
 * Returns { channels, connections, clients, byFamily, stats, source, lcdOk, lcdError, proxyConnected }
 */
export async function loadIbcSnapshot(ctx) {
  const rest = (ctx.chains.terp.rest || 'https://api.terp.network').replace(/\/$/, '');
  let live = {
    channels: [],
    proxyConnected: false,
    lcdOk: false,
    lcdError: null,
    source: 'none',
    counts: { lcd: 0, proxy: 0, open: 0 },
  };
  try {
    live = await loadLiveChannels(ctx);
  } catch (e) {
    live.lcdError = e.message || String(e);
    console.warn('[ibc-core] loadLiveChannels', e);
  }

  let connections = [];
  let clients = [];
  try {
    connections = await fetchConnectionsFromLcd(rest);
  } catch (e) {
    console.warn('[ibc-core] connections', e.message);
  }
  try {
    clients = await fetchClientStatesFromLcd(rest);
  } catch (e) {
    console.warn('[ibc-core] clients', e.message);
  }

  // Enrich only missing chain ids (cap concurrency cost)
  await Promise.all(
    clients
      .filter((c) => c.clientId && !c.chainId)
      .slice(0, 24)
      .map(async (c) => {
        try {
          c.chainId = await resolveClientChainId(rest, c.clientId);
          if (c.chainId && !c.family) c.family = 'tendermint';
        } catch { /* ignore */ }
      }),
  );

  const byFamily = {};
  for (const c of clients) {
    const f = c.family || 'unknown';
    byFamily[f] = (byFamily[f] || 0) + 1;
  }

  const openChannels = live.channels?.length || 0;
  const liveUseful = openChannels > 0 || connections.length > 0 || clients.length > 0;

  // Live path succeeded with data
  if (liveUseful) {
    return {
      ...live,
      connections,
      clients,
      byFamily,
      lcdOk: !live.lcdError,
      stats: {
        openChannels,
        connections: connections.length,
        clients: clients.length,
        source: live.source || (openChannels ? 'lcd' : 'none'),
        proxyConnected: !!live.proxyConnected,
        error: live.lcdError || null,
      },
    };
  }

  // Fallback: cw-orch / terp-rs state.json ibc_data (S3 + local extract)
  console.warn('[ibc-core] live IBC empty/failed — trying state.json ibc_data fallback');
  const packed = await loadIbcDataFromState(ctx);
  if (packed?.ibcData) {
    const snap = snapshotFromStateIbcData(packed.ibcData, ctx.chains, packed.sourceLabel);
    snap.stateUrl = packed.url;
    snap.updatedAt = packed.updatedAt;
    snap.stats = {
      ...snap.stats,
      error: live.lcdError
        ? `live failed (${live.lcdError}); using ${packed.sourceLabel}`
        : null,
      liveError: live.lcdError || null,
      fallback: true,
    };
    // Soft warning, not hard error cards — data is present
    if (snap.channels.length) {
      snap.stats.error = null;
    }
    return snap;
  }

  return {
    ...live,
    connections,
    clients,
    byFamily,
    lcdOk: false,
    stats: {
      openChannels: 0,
      connections: connections.length,
      clients: clients.length,
      source: 'none',
      proxyConnected: !!live.proxyConnected,
      error: live.lcdError || 'No IBC data from LCD, proxy, or state.json',
    },
  };
}

/** Client id → counterparty chain_id via client_status / client_state */
export async function resolveClientChainId(rest, clientId) {
  const base = rest.replace(/\/$/, '');
  const key = `client:${base}:${clientId}`;
  const hit = cacheGet(key);
  if (hit) return hit;
  try {
    // Prefer client_state JSON (LCD often returns unpacked tendermint ClientState)
    const data = await fetchJson(`${base}/ibc/core/client/v1/client_states/${clientId}`);
    const cs = data.client_state || data.clientState || data;
    const nested =
      cs?.chain_id ||
      cs?.chainId ||
      cs?.value?.chain_id ||
      (typeof cs === 'object' && cs['@type'] && cs.chain_id) ||
      null;
    if (nested) return cacheSet(key, nested);
    // Some nodes wrap as { client_state: { type_url, value: base64 } } — skip binary decode for now
  } catch { /* try status */ }
  try {
    const st = await fetchJson(`${base}/ibc/core/client/v1/client_status/${clientId}`);
    // status alone doesn't give chain id
    void st;
  } catch { /* ignore */ }
  return cacheSet(key, null);
}

/**
 * Normalize LCD channels into page channel objects with counterparty chain key.
 */
export async function buildLiveChannelList(chains, terpRest) {
  const [rawChannels, connections] = await Promise.all([
    fetchChannelsFromLcd(terpRest),
    fetchConnectionsFromLcd(terpRest).catch(() => []),
  ]);

  const connById = Object.fromEntries(
    connections.map((c) => [c.id, c]),
  );

  const clientChain = {};
  const clientIds = [
    ...new Set(
      connections
        .map((c) => c.client_id || c.clientId)
        .filter(Boolean),
    ),
  ];
  await Promise.all(
    clientIds.map(async (id) => {
      clientChain[id] = await resolveClientChainId(terpRest, id);
    }),
  );

  const open = rawChannels.filter(
    (ch) =>
      (ch.state || '').includes('OPEN') ||
      ch.state === 'STATE_OPEN' ||
      ch.state === 3,
  );

  return open.map((ch) => {
    const hops = ch.connection_hops || ch.connectionHops || [];
    const connId = hops[0] || '';
    const conn = connById[connId];
    const clientId = conn?.client_id || conn?.clientId || '';
    const cpChainId = clientChain[clientId] || null;
    const cpMeta = cpChainId ? chainById(chains, cpChainId) : null;
    const cp = ch.counterparty || {};

    return {
      id: ch.channel_id || ch.channelId,
      port: ch.port_id || ch.portId || 'transfer',
      counterparty: {
        chain: cpMeta?.key || (cpChainId ? cpChainId : 'unknown'),
        chainId: cpChainId,
        channel: cp.channel_id || cp.channelId || '',
        port: cp.port_id || cp.portId || 'transfer',
      },
      state: ch.state || 'STATE_OPEN',
      ordering: ch.ordering || 'ORDER_UNORDERED',
      version: ch.version || 'ics20-1',
      connection: connId,
      client: clientId,
      txCount: 0,
      pending: 0,
      source: 'lcd',
    };
  });
}

/** Optional proxy `/ibc/all` */
export async function fetchFromProxy(proxyUrl) {
  try {
    const data = await fetchJson(`${proxyUrl.replace(/\/$/, '')}/ibc/all`, {
      timeoutMs: 10000,
    });
    if (data.error) throw new Error(data.error);
    return data;
  } catch (e) {
    console.warn('[ibc-core] proxy', e.message);
    return null;
  }
}

export function proxyChannelsToPage(data, chains) {
  if (!data?.channels) return [];
  const clientChainMap = {};
  if (data.clients && data.tendermintStates) {
    for (let i = 0; i < data.clients.length; i++) {
      const tm = data.tendermintStates[i];
      if (tm?.chainId) clientChainMap[data.clients[i].clientId] = tm.chainId;
    }
  }
  const connMap = {};
  for (const conn of data.connections || []) {
    const cid = clientChainMap[conn.clientId];
    if (!cid) continue;
    const meta = chainById(chains, cid);
    connMap[conn.id] = meta?.key || cid;
  }

  return (data.channels || [])
    .filter((ch) => String(ch.state || '').includes('OPEN') || ch.state === 'STATE_OPEN')
    .map((ch) => {
      const connId = ch.connectionHops?.[0] || '';
      return {
        id: ch.channelId,
        port: ch.portId,
        counterparty: {
          chain: connMap[connId] || 'unknown',
          channel: ch.counterparty?.channelId || '',
          port: ch.counterparty?.portId || 'transfer',
        },
        state: ch.state,
        ordering: ch.ordering || 'ORDER_UNORDERED',
        version: ch.version || 'ics20-1',
        connection: connId,
        client: '',
        txCount: 0,
        pending: 0,
        source: 'proxy',
      };
    });
}

/**
 * Load channels: prefer proxy if up, always merge/fallback to LCD for truth.
 */
export async function loadLiveChannels(ctx) {
  const terpRest = ctx.chains.terp.rest;
  let proxyConnected = false;
  let proxyChannels = [];
  // Prefer dedicated proxy; fall back to same-origin /ibc-proxy (nginx)
  let proxyData = await fetchFromProxy(ctx.proxyUrl);
  if (!proxyData && ctx.proxyUrlFallback) {
    proxyData = await fetchFromProxy(ctx.proxyUrlFallback);
  }
  if (proxyData) {
    proxyConnected = true;
    proxyChannels = proxyChannelsToPage(proxyData, ctx.chains);
  }

  let lcdChannels = [];
  let lcdError = null;
  try {
    lcdChannels = await buildLiveChannelList(ctx.chains, terpRest);
  } catch (e) {
    lcdError = e.message;
    console.warn('[ibc-core] lcd channels', e);
  }

  // Prefer LCD as source of truth when available; else proxy
  const channels = lcdChannels.length ? lcdChannels : proxyChannels;
  return {
    channels,
    proxyConnected,
    lcdOk: !lcdError && lcdChannels.length >= 0 && !lcdError,
    lcdError,
    source: lcdChannels.length ? 'lcd' : proxyConnected ? 'proxy' : 'none',
    counts: {
      lcd: lcdChannels.length,
      proxy: proxyChannels.length,
      open: channels.length,
    },
  };
}

/** Snapshot foundation relayer balances across chains (parallel, throttled). */
export async function loadFoundationBalances(ctx) {
  const rows = [];
  for (const relayer of ctx.foundationRelayers) {
    const accounts = relayer.accounts || {};
    const entries = Object.entries(accounts);
    const balances = await Promise.all(
      entries.map(async ([chainId, acct]) => {
        const meta = chainById(ctx.chains, chainId) || ctx.chains[acct.chainKey];
        if (!meta?.rest || !acct.address) {
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
            display: acct.address ? '—' : 'not set',
            raw: null,
            low: false,
          };
        }
        // Prefer chain meta (rest + restDirect fallbacks) so donation seats work without ibc-proxy
        const bals = await fetchBalances(meta, acct.address);
        const pick = pickDisplayBalance(bals, acct.denom || meta.denom, meta.decimals ?? 6);
        const min = BigInt(acct.minSuggested || '0');
        const low = min > 0n && BigInt(pick.amount || '0') < min;
        return {
          chainId,
          chainKey: meta.key,
          name: meta.name,
          color: meta.color,
          icon: meta.icon,
          address: acct.address,
          configured: true,
          denom: pick.denom,
          decimals: meta.decimals ?? 6,
          display: pick.display,
          raw: pick.amount,
          low,
          all: bals,
        };
      }),
    );
    rows.push({
      id: relayer.id,
      label: relayer.label,
      note: relayer.note || '',
      accounts: balances,
    });
  }
  return rows;
}

/**
 * Build Keplr chain suggest for a counterparty (deposit gas).
 */
export function buildKeplrSuggest(chain) {
  const dec = chain.decimals ?? 6;
  const display = (chain.denom || '').replace(/^u/, '').toUpperCase() || 'TOKEN';
  return {
    chainId: chain.chain_id,
    chainName: chain.name,
    rpc: chain.rpc,
    rest: chain.rest,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: chain.prefix,
      bech32PrefixAccPub: `${chain.prefix}pub`,
      bech32PrefixValAddr: `${chain.prefix}valoper`,
      bech32PrefixValPub: `${chain.prefix}valoperpub`,
      bech32PrefixConsAddr: `${chain.prefix}valcons`,
      bech32PrefixConsPub: `${chain.prefix}valconspub`,
    },
    currencies: [
      { coinDenom: display, coinMinimalDenom: chain.denom, coinDecimals: dec },
    ],
    feeCurrencies: [
      {
        coinDenom: display,
        coinMinimalDenom: chain.denom,
        coinDecimals: dec,
        gasPriceStep: { low: 0.01, average: 0.025, high: 0.04 },
      },
    ],
    stakeCurrency: {
      coinDenom: display,
      coinMinimalDenom: chain.denom,
      coinDecimals: dec,
    },
  };
}

/**
 * Fund a foundation address with native tokens via Keplr bank send.
 */
export async function fundRelayerAccount({ chain, toAddress, amountBase, memo = 'terp foundation relayer gas' }) {
  if (!window.keplr) throw new Error('Keplr required');
  if (!toAddress) throw new Error('Relayer address not configured');
  if (!amountBase || BigInt(amountBase) <= 0n) throw new Error('Invalid amount');

  await window.keplr.experimentalSuggestChain(buildKeplrSuggest(chain));
  await window.keplr.enable(chain.chain_id);
  const offlineSigner = window.keplr.getOfflineSigner(chain.chain_id);
  const accounts = await offlineSigner.getAccounts();
  const from = accounts[0]?.address;
  if (!from) throw new Error('No account');

  // Prefer keplr.sendTx with amino if available; else use experimental
  if (typeof window.keplr.signAndBroadcastAmino === 'function') {
    // not standard
  }

  // Cosmos-sdk MsgSend via keplr's experimental suggestTx or sendMessages
  const msg = {
    typeUrl: '/cosmos.bank.v1beta1.MsgSend',
    value: {
      fromAddress: from,
      toAddress,
      amount: [{ denom: chain.denom, amount: String(amountBase) }],
    },
  };

  // Keplr: use getOfflineSigner + cosmjs if present; fallback to window.keplr.sendTx raw is hard.
  // Use keplr's experimental API: signAmino + broadcast when possible through cosmes if loaded.
  const { SigningStargateClient } = await import(
    'https://esm.sh/@cosmjs/stargate@0.32.4'
  ).catch(() => ({}));

  if (SigningStargateClient?.connectWithSigner) {
    const client = await SigningStargateClient.connectWithSigner(chain.rpc, offlineSigner, {
      gasPrice: undefined,
    });
    const result = await client.sendTokens(
      from,
      toAddress,
      [{ denom: chain.denom, amount: String(amountBase) }],
      'auto',
      memo,
    );
    return { txHash: result.transactionHash, from };
  }

  // Last resort: open deposit instructions (no cosmjs)
  throw new Error(
    'Signing client unavailable — copy the relayer address and send funds manually from Keplr',
  );
}

/** User wallet balances across listed chains (for token picker — live, not mock). */
export async function fetchUserMultiChainBalances(chains, addressByChainId) {
  const out = [];
  await Promise.all(
    Object.entries(addressByChainId || {}).map(async ([chainId, address]) => {
      const meta = chainById(chains, chainId);
      if (!meta?.rest || !address) return;
      const bals = await fetchBalances(meta.rest, address);
      for (const b of bals) {
        out.push({
          chainId,
          chainKey: meta.key,
          chainName: meta.name,
          icon: meta.icon,
          symbol: b.denom.startsWith('ibc/')
            ? b.denom.slice(0, 12) + '…'
            : b.denom.replace(/^u/, '').toUpperCase(),
          denom: b.denom,
          amount: b.amount,
          display: formatAmount(b.amount, meta.decimals ?? 6),
          decimals: meta.decimals ?? 6,
        });
      }
    }),
  );
  return out;
}
