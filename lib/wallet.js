// wallet.js — single session for terp.network (cosmes / @goblinhunt/cosmes only).
// Minimal surface: ensureLibs → connect / tryReconnect / disconnect / broadcast.
// No cosmjs dependency for signing; pages share one storage key + terp:wallet events.
//
// Load-on-intent: this module is small and imports no chain libraries up
// front. The ~6 MB cosmes graph is fetched only by loadLibs(), a module-level
// singleton promise, which runs on the first connect / reconnect / signing
// call (or when a caller passes { eager: true }). ensureLibs() now resolves
// the chain config only. Read-only contract queries use a tiny built-in
// RPC abci_query (with LCD fallback) until cosmes is loaded anyway.

import {
  buildChainSuggest,
  buildCosmesChainInfo,
  cosmesBaseUrl,
  loadSiteConfig,
} from '/lib/config.js';
import { executeWithSmartAccount } from '/lib/smart-account-tx.js';

const STORAGE_KEY = 'terp-wallet-v1';
const EVENT = 'terp:wallet';
const COSMES = cosmesBaseUrl();

/** @type {{
 *  address: string|null,
 *  wallet: object|null,
 *  controller: object|null,
 *  provider: 'keplr'|null,
 *  chainId: string|null,
 *  libsLoaded: boolean,
 *  config: object|null,
 *  KeplrController: any,
 *  WalletType: any,
 *  queryContract: any,
 *  MsgExecuteContract: any,
 *  unsubDisconnect: (()=>void)|null,
 *  unsubAccount: (()=>void)|null,
 *  connecting: Promise<any>|null,
 * }} */
const state = {
  address: null,
  wallet: null,
  controller: null,
  provider: null,
  chainId: null,
  libsLoaded: false,
  config: null,
  KeplrController: null,
  WalletType: null,
  queryContract: null,
  MsgExecuteContract: null,
  unsubDisconnect: null,
  unsubAccount: null,
  connecting: null,
};

const listeners = new Set();
/** @type {Promise<boolean>|null} */
let libsPromise = null;

// ── Billboards name for the connected address ─────────────────────────────
// Looked up once per chain+address after connecting (one LCD smart query), cached
// for the session. Anything that shows the account reads snap.name first.
const NAME_CACHE = 'tn-name:';
const names = new Map();
let nameFor = '';

function nameKey(chainId, address) {
  return `${chainId || ''}|${address || ''}`;
}

function cachedName(chainId, address) {
  const k = nameKey(chainId, address);
  if (names.has(k)) return names.get(k);
  try {
    const v = sessionStorage.getItem(NAME_CACHE + k);
    if (v !== null) {
      names.set(k, v || null);
      return v || null;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

/** Remember a name (e.g. right after registering one). `null` = none. */
export function setAccountName(address, name, chainId = state.chainId) {
  const k = nameKey(chainId, address);
  names.set(k, name || null);
  try {
    sessionStorage.setItem(NAME_CACHE + k, name || '');
  } catch {
    /* ignore */
  }
  if (address && address === state.address) emit();
}

/** reverse_map_account on the Billboards collection. Resolves null when there is none. */
export async function lookupAccountName(address, config = state.config) {
  const cfg = config || (typeof window !== 'undefined' ? window.__TERP_CONFIG : null) || {};
  const chainId = cfg.chainId || state.chainId;
  const known = cachedName(chainId, address);
  if (known !== undefined) return known;
  const rest = String(cfg.rest || '').replace(/\/$/, '');
  const coll = cfg.accountContract || cfg.contracts?.terp721Account;
  if (!rest || !coll || !address) return null;
  const q = btoa(JSON.stringify({ reverse_map_account: { address } }));
  const res = await fetch(`${rest}/cosmwasm/wasm/v1/contract/${coll}/smart/${encodeURIComponent(q)}`, {
    credentials: 'omit',
    cache: 'no-store',
  });
  const text = await res.text();
  let name = null;
  if (res.ok) {
    try {
      const d = JSON.parse(text)?.data;
      name = typeof d === 'string' ? d : d?.account || d?.name || null;
    } catch {
      name = null;
    }
  } else if (!/no account|not found|associated/i.test(text)) {
    throw new Error(`name lookup ${res.status}`);
  }
  const k = nameKey(chainId, address);
  names.set(k, name);
  try {
    sessionStorage.setItem(NAME_CACHE + k, name || '');
  } catch {
    /* ignore */
  }
  return name;
}

function refreshName() {
  if (!state.wallet || !state.address) return;
  const k = nameKey(state.chainId, state.address);
  if (nameFor === k || cachedName(state.chainId, state.address) !== undefined) return;
  nameFor = k;
  lookupAccountName(state.address)
    .then((n) => {
      if (n && nameKey(state.chainId, state.address) === k) emit();
    })
    .catch(() => {
      nameFor = '';
    });
}

function emit() {
  refreshName();
  const detail = getSnapshot();
  for (const cb of listeners) {
    try {
      cb(detail);
    } catch (e) {
      console.error('[terp-wallet] listener', e);
    }
  }
  try {
    window.dispatchEvent(new CustomEvent(EVENT, { detail }));
  } catch {
    /* ignore */
  }
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStored(payload) {
  try {
    if (!payload) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem('terp-mint-address');
    localStorage.removeItem('terp-names-address');
    localStorage.removeItem('terp_fab_wallet');
  } catch {
    /* ignore */
  }
}

/** Live session only when we have a cosmes ConnectedWallet. */
export function getSnapshot() {
  const live = !!(state.wallet && state.address);
  return {
    connected: live,
    address: live ? state.address : null,
    chainId: state.chainId,
    provider: state.provider,
    /** Billboards name, when the address has one (null = none or not known yet). */
    name: live ? cachedName(state.chainId, state.address) || null : null,
    wallet: state.wallet,
    libsLoaded: state.libsLoaded,
    /** Hint from last session (UI only; not signed-in) */
    lastAddress: readStored()?.address || null,
  };
}

/**
 * Subscribe to session changes. When the app shell is active and this is
 * called from page code, the subscription is removed automatically when the
 * user navigates away (pass { persistent: true } for session-level UI).
 * @param {(snap: object) => void} cb
 * @param {{ persistent?: boolean }} [opts]
 */
export function onWalletChange(cb, opts = {}) {
  listeners.add(cb);
  const unsub = () => listeners.delete(cb);
  const shell = typeof window !== 'undefined' ? window.__tnShell : null;
  if (shell && !opts.persistent) shell.onTeardown(unsub);
  return unsub;
}

export function getState() {
  return state;
}

/**
 * Resolve page config: ensure chainSuggest + cosmesChainInfo exist.
 * @param {object|null|undefined} config
 */
export function normalizeConfig(config) {
  const cfg =
    config ||
    state.config ||
    (typeof window !== 'undefined' ? window.__TERP_CONFIG : null);
  if (!cfg?.chainId) return null;
  if (!cfg.chainSuggest) cfg.chainSuggest = buildChainSuggest(cfg);
  if (!cfg.cosmesChainInfo) cfg.cosmesChainInfo = buildCosmesChainInfo(cfg);
  // Normalize RPC URLs
  if (cfg.rpc) cfg.rpc = String(cfg.rpc).replace(/\/$/, '');
  if (cfg.rest) cfg.rest = String(cfg.rest).replace(/\/$/, '');
  if (cfg.chainSuggest?.rpc) {
    cfg.chainSuggest.rpc = String(cfg.chainSuggest.rpc).replace(/\/$/, '');
  }
  if (Array.isArray(cfg.cosmesChainInfo)) {
    cfg.cosmesChainInfo.forEach((c) => {
      if (c.rpc) c.rpc = String(c.rpc).replace(/\/$/, '');
      // cosmes expects gasPrice as { amount: string, denom: string }
      if (c.gasPrice && typeof c.gasPrice.amount !== 'string') {
        c.gasPrice = {
          amount: String(c.gasPrice.amount ?? '0.025'),
          denom: c.gasPrice.denom || cfg.denom || 'uthiol',
        };
      }
    });
  }
  return cfg;
}

/**
 * Load the cosmes wallet + client modules exactly once per session.
 * Concurrent and repeated callers share one promise; a failed load is retried
 * on the next call.
 * @returns {Promise<boolean>}
 */
export function loadLibs() {
  if (state.libsLoaded && state.KeplrController && state.WalletType) return Promise.resolve(true);
  if (libsPromise) return libsPromise;
  libsPromise = (async () => {
    try {
      const [walletMod, clientMod] = await Promise.all([
        import(/* @vite-ignore */ `${COSMES}/wallet`),
        import(/* @vite-ignore */ `${COSMES}/client`),
      ]);

      if (!walletMod?.KeplrController || !walletMod?.WalletType) {
        throw new Error('cosmes/wallet missing KeplrController or WalletType');
      }
      if (!clientMod?.MsgExecuteContract || !clientMod?.queryContract) {
        throw new Error('cosmes/client missing MsgExecuteContract or queryContract');
      }

      state.KeplrController = walletMod.KeplrController;
      state.WalletType = walletMod.WalletType;
      state.queryContract = clientMod.queryContract;
      state.MsgExecuteContract = clientMod.MsgExecuteContract;
      state.libsLoaded = true;
      return true;
    } catch (err) {
      console.error('[terp-wallet] cosmes load failed', err);
      state.libsLoaded = false;
      libsPromise = null;
      return false;
    }
  })();
  return libsPromise;
}

/**
 * Resolve page chain config (site config.json + state.json overlay).
 * Chain libraries are NOT loaded here any more; they load on connect intent
 * via loadLibs(). Pass { eager: true } to also load them now.
 * @param {object} [pageConfig]
 * @param {{ pageId?: string, eager?: boolean }} [opts]
 * @returns {Promise<boolean>}
 */
export async function ensureLibs(pageConfig, opts = {}) {
  if (pageConfig) {
    await loadSiteConfig(pageConfig, opts);
    state.config = normalizeConfig(pageConfig) || pageConfig;
    state.chainId = pageConfig.chainId;
  }
  if (opts.eager) return loadLibs();
  return true;
}

// ── Minimal CosmWasm smart query over Tendermint RPC (no cosmes needed) ──
function pbVarint(n) {
  const out = [];
  while (n > 0x7f) {
    out.push((n & 0x7f) | 0x80);
    n >>>= 7;
  }
  out.push(n);
  return out;
}

function pbBytesField(field, bytes) {
  return [(field << 3) | 2, ...pbVarint(bytes.length), ...bytes];
}

function pbReadBytesField(buf, want) {
  let i = 0;
  const varint = () => {
    let shift = 0;
    let v = 0;
    for (;;) {
      const b = buf[i++];
      v += (b & 0x7f) * 2 ** shift;
      if (b < 0x80) return v;
      shift += 7;
    }
  };
  while (i < buf.length) {
    const key = varint();
    const field = Math.floor(key / 8);
    const wire = key & 7;
    if (wire === 2) {
      const len = varint();
      const chunk = buf.subarray(i, i + len);
      i += len;
      if (field === want) return chunk;
    } else if (wire === 0) varint();
    else if (wire === 1) i += 8;
    else if (wire === 5) i += 4;
    else break;
  }
  return new Uint8Array(0);
}

/** QuerySmartContractState via RPC abci_query; same result shape as cosmes queryContract. */
async function rpcSmartQuery(endpoint, address, query) {
  const enc = new TextEncoder();
  const req = new Uint8Array([
    ...pbBytesField(1, enc.encode(address)),
    ...pbBytesField(2, enc.encode(JSON.stringify(query))),
  ]);
  const hex = Array.from(req, (b) => b.toString(16).padStart(2, '0')).join('');
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'abci_query',
      params: { path: '/cosmwasm.wasm.v1.Query/SmartContractState', data: hex, prove: false },
    }),
  });
  if (!res.ok) throw new Error(`RPC query failed: ${res.status}`);
  const json = await res.json();
  const r = json?.result?.response;
  if (!r) throw new Error(json?.error?.message || 'RPC query: empty response');
  if (r.code) throw new Error(r.log || `RPC query error code ${r.code}`);
  const raw = Uint8Array.from(atob(r.value || ''), (c) => c.charCodeAt(0));
  const data = pbReadBytesField(raw, 1);
  return JSON.parse(new TextDecoder().decode(data));
}

export function createQueryAdapter(rpc, rest) {
  const endpoint = rpc || state.config?.rpc;
  const lcd = (rest || state.config?.rest || '').replace(/\/$/, '');
  if (!endpoint && !lcd) throw new Error('No RPC or REST endpoint');
  const viaLcd = async (addr, query) => {
    const json = JSON.stringify(query);
    const b64 = btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    const res = await fetch(`${lcd}/cosmwasm/wasm/v1/contract/${addr}/smart/${b64}`);
    if (!res.ok) throw new Error(`LCD query failed: ${res.status}`);
    return (await res.json()).data;
  };
  return {
    queryContractSmart: async (addr, query) => {
      if (endpoint) {
        try {
          if (state.queryContract) {
            return await state.queryContract(endpoint, { address: addr, query });
          }
          return await rpcSmartQuery(endpoint, addr, query);
        } catch (e) {
          if (!lcd) throw e;
        }
      }
      return viaLcd(addr, query);
    },
  };
}

export function createSigningAdapter(wallet, rpc) {
  if (!state.queryContract || !state.MsgExecuteContract) {
    throw new Error('Libraries not loaded — call ensureLibs first');
  }
  const endpoint = rpc || state.config?.rpc;
  const w = wallet || state.wallet;
  if (!w) throw new Error('Wallet not connected');
  return {
    queryContractSmart: (addr, query) =>
      state.queryContract(endpoint, { address: addr, query }),
    execute: async (sender, contractAddress, msg, _fee, memo, funds) => {
      const execMsg = new state.MsgExecuteContract({
        sender,
        contract: contractAddress,
        msg,
        funds: funds || [],
      });
      return w.broadcastTxSync({ msgs: [execMsg], memo: memo || '' }, 1.4);
    },
  };
}

/**
 * Prefer Keplr when present (many wallets inject keplr-compat).
 * @returns {'keplr'|null}
 */
export function detectExtension() {
  if (typeof window === 'undefined') return null;
  if (window.keplr) return 'keplr';
  return null;
}

function clearControllerHooks() {
  try {
    state.unsubDisconnect?.();
  } catch {
    /* ignore */
  }
  try {
    state.unsubAccount?.();
  } catch {
    /* ignore */
  }
  state.unsubDisconnect = null;
  state.unsubAccount = null;
}

function clearSession(disconnectController = true) {
  clearControllerHooks();
  if (disconnectController && state.controller && state.chainId) {
    try {
      state.controller.disconnect([state.chainId]);
    } catch {
      /* ignore */
    }
  }
  state.address = null;
  state.wallet = null;
  state.provider = null;
  state.controller = null;
  writeStored(null);
}

/**
 * Suggest + enable chain on the extension, then cosmes connect.
 * @param {object} [config]
 * @param {{ provider?: 'keplr' }} [opts]
 */
export async function connect(config, opts = {}) {
  // Serialize concurrent connects
  if (state.connecting) return state.connecting;

  const run = (async () => {
    const cfg = normalizeConfig(config);
    if (!cfg?.chainId) {
      throw new Error('No chain config — call ensureLibs(CONFIG) first');
    }

    await ensureLibs(cfg);

    const preferred = opts.provider || detectExtension();
    if (!preferred) {
      const err = new Error('Please install the Keplr wallet extension');
      err.code = 'NO_WALLET';
      throw err;
    }

    if (preferred === 'keplr' && !window.keplr) {
      const err = new Error(`Wallet extension "${preferred}" not available`);
      err.code = 'NO_WALLET';
      throw err;
    }

    // First real connect intent with a usable extension: fetch chain libs (once).
    const ok = await loadLibs();
    if (!ok) throw new Error('Blockchain libraries failed to load (cosmes)');

    // Already live on this chain
    if (
      state.wallet &&
      state.address &&
      state.chainId === cfg.chainId &&
      state.provider === preferred
    ) {
      return getSnapshot();
    }

    // Tear down previous controller cleanly
    clearSession(true);

    const suggest = cfg.chainSuggest || buildChainSuggest(cfg);
    const cosmesInfo = cfg.cosmesChainInfo || buildCosmesChainInfo(cfg);

    // Suggest + enable via extension APIs
    if (preferred === 'keplr' && window.keplr) {
      try {
        await window.keplr.experimentalSuggestChain(suggest);
      } catch (e) {
        // Some wallets reject re-suggest if already added — continue to enable
        console.warn('[terp-wallet] suggestChain', e?.message || e);
      }
      await window.keplr.enable(cfg.chainId);
    } else {
      const err = new Error(`Wallet extension "${preferred}" not available`);
      err.code = 'NO_WALLET';
      throw err;
    }

    const controller = new state.KeplrController('');

    const wallets = await controller.connect(state.WalletType.EXTENSION, cosmesInfo);
    const wallet = wallets.get(cfg.chainId);
    if (!wallet?.address) {
      throw new Error(`Failed to connect to ${cfg.chainName || cfg.chainId}`);
    }

    state.controller = controller;
    state.wallet = wallet;
    state.address = wallet.address;
    state.provider = preferred;
    state.chainId = cfg.chainId;
    state.config = cfg;

    writeStored({
      address: wallet.address,
      chainId: cfg.chainId,
      provider: preferred,
    });

    // cosmes onAccountChange: disconnects first, then fires with old wallets.
    // Correct response is re-connect, not reuse those wallet instances.
    state.unsubAccount = controller.onAccountChange?.(() => {
      console.info('[terp-wallet] account change — reconnecting');
      state.wallet = null;
      state.address = null;
      emit();
      connect(cfg, { provider: preferred }).catch((e) => {
        console.warn('[terp-wallet] reconnect after account change failed', e?.message || e);
        clearSession(true);
        emit();
      });
    });

    state.unsubDisconnect = controller.onDisconnect?.((wallets) => {
      // Ignore if we're mid-reconnect (wallet already null)
      const ids = (wallets || []).map((w) => w.chainId);
      if (!ids.includes(cfg.chainId)) return;
      // Account-change path already clears; avoid double-clear fighting reconnect
      if (!state.wallet) return;
      console.info('[terp-wallet] disconnect event');
      clearSession(false);
      emit();
    });

    emit();
    return getSnapshot();
  })();

  state.connecting = run;
  try {
    return await run;
  } finally {
    state.connecting = null;
  }
}

export async function disconnect() {
  clearSession(true);
  emit();
}

/**
 * Quiet rehydrate from storage if extension is unlocked.
 * Does not prompt suggestChain aggressively; enables + cosmes connect only.
 */
export async function tryReconnect(config) {
  const cfg = normalizeConfig(config);
  const saved = readStored();
  if (!cfg?.chainId || !saved?.address) return getSnapshot();

  const ext = detectExtension();
  if (!ext) return getSnapshot();

  // Already live
  if (state.wallet && state.address && state.chainId === cfg.chainId) {
    return getSnapshot();
  }

  try {
    return await connect(cfg, { provider: 'keplr' });
  } catch (e) {
    // User rejection / locked extension — leave storage for next click
    console.warn('[terp-wallet] tryReconnect', e?.message || e);
    return getSnapshot();
  }
}

/**
 * Ensure a live signing wallet (reconnect, else interactive connect).
 */
export async function ensureWallet(config) {
  const snap = getSnapshot();
  if (snap.wallet && snap.address) return snap;
  const cfg = normalizeConfig(config);
  if (!cfg) throw new Error('No chain config for wallet');
  await ensureLibs(cfg);
  const again = await tryReconnect(cfg);
  if (again.wallet && again.address) return again;
  return connect(cfg);
}

/**
 * Bind a connect/disconnect button to the shared session.
 */
export function bindWalletButton(elOrId, config, ui = {}) {
  const el = typeof elOrId === 'string' ? document.getElementById(elOrId) : elOrId;
  if (!el) return () => {};

  const toast = ui.onToast || (() => {});

  const paint = (snap) => {
    if (snap.connected && snap.address) {
      el.textContent = snap.name || `${snap.address.slice(0, 8)}…${snap.address.slice(-4)}`;
      el.classList.add('connected');
      el.title = snap.name ? `${snap.name} · ${snap.address}` : snap.address;
    } else {
      el.textContent = ui.connectLabel || 'Connect Wallet';
      el.classList.remove('connected');
      el.removeAttribute('title');
    }
    ui.onChange?.(snap);
  };

  paint(getSnapshot());
  const unsub = onWalletChange(paint);

  const handler = async () => {
    if (state.wallet && state.address) {
      await disconnect();
      toast('Wallet disconnected', 'info');
      return;
    }
    const prev = el.textContent;
    el.textContent = 'Connecting…';
    el.disabled = true;
    try {
      const cfg = normalizeConfig(config);
      await ensureLibs(cfg);
      await connect(cfg);
      const a = state.address;
      if (a) toast(`Connected: ${a.slice(0, 10)}…${a.slice(-6)}`, 'success');
    } catch (err) {
      console.error('[terp-wallet] connect', err);
      if (err.code === 'NO_WALLET') {
        toast(err.message, 'error');
        window.open('https://www.keplr.app/download', '_blank');
      } else if ((err.message || '').toLowerCase().includes('reject')) {
        toast('Connection rejected by user', 'info');
      } else {
        toast(err.message || 'Failed to connect wallet', 'error');
      }
    } finally {
      el.disabled = false;
      paint(getSnapshot());
      if (!state.address && prev) {
        /* paint already set label */
      }
    }
  };

  el.addEventListener('click', handler);
  window.handleWalletClick = handler;

  return () => {
    el.removeEventListener('click', handler);
    unsub();
  };
}

/** Broadcast signed msgs via cosmes ConnectedWallet.broadcastTxSync */
export async function broadcast(msgs, memo = '', gasMultiplier = 1.4) {
  if (!state.wallet) throw new Error('Wallet not connected');
  if (!Array.isArray(msgs) || !msgs.length) throw new Error('No messages to broadcast');
  return state.wallet.broadcastTxSync({ msgs, memo }, gasMultiplier);
}

/**
 * Convenience: execute a CosmWasm contract msg with the live session.
 * @param {string} contract
 * @param {object} msg
 * @param {{ funds?: object[], memo?: string, gasMultiplier?: number }} [opts]
 */
function getDirectSigner() {
  const chainId = state.chainId;
  if (!chainId) return null;
  if (state.provider === 'keplr' && window.keplr?.getOfflineSigner) {
    return window.keplr.getOfflineSigner(chainId);
  }
  return null;
}

function chainForSa() {
  const cfg = state.config || {};
  return {
    chainId: state.chainId || cfg.chainId || 'morocco-1',
    rpc: cfg.rpc || 'https://rpc.terp.network',
    rest: cfg.rest || 'https://api.terp.network',
    denom: cfg.denom || 'uthiol',
    gasPrice: cfg.gasPrice || '0.025uthiol',
  };
}

/**
 * CosmWasm execute with generic smart-account TxExtension when the account
 * has authenticators. Falls back to cosmes broadcast for amino-only sessions.
 */
export async function executeContract(contract, msg, opts = {}) {
  if (!state.wallet || !state.address) throw new Error('Wallet not connected');
  const signer = getDirectSigner();
  if (signer && typeof signer.signDirect === 'function') {
    return executeWithSmartAccount({
      chain: chainForSa(),
      wallet: signer,
      address: state.address,
      contract,
      msg,
      funds: opts.funds || [],
      feeGranter: opts.feeGranter || '',
      memo: opts.memo || '',
      authenticatorId: opts.authenticatorId,
      instructions: opts.instructions,
      signatureBytes: opts.signatureBytes,
      gas: opts.gas,
    });
  }
  if (!state.MsgExecuteContract) throw new Error('Libraries not loaded');
  const execMsg = new state.MsgExecuteContract({
    sender: state.address,
    contract,
    msg,
    funds: opts.funds || [],
  });
  return broadcast([execMsg], opts.memo || '', opts.gasMultiplier ?? 1.4);
}

export function MsgExecuteContract(...args) {
  if (!state.MsgExecuteContract) throw new Error('Libraries not loaded');
  // Support both `new MsgExecuteContract({...})` style via construct
  if (args.length === 1 && args[0] && typeof args[0] === 'object' && !Array.isArray(args[0])) {
    return new state.MsgExecuteContract(args[0]);
  }
  return new state.MsgExecuteContract(...args);
}

export { STORAGE_KEY, EVENT, COSMES };
