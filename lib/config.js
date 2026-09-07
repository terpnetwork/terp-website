// config.js — load chain config from public/config.json (static-first, local-accurate)
// Optional on-chain text-record overlay can return later without changing page APIs.

const CONFIG_URL = '/public/config.json';
const COSMES_PIN = 'https://esm.sh/@goblinhunt/cosmes@0.0.71-ghunt.21';

/** @type {object|null} */
let _site = null;
/** @type {object|null} */
let _chain = null;

/**
 * Detect active chain id from host / query / localStorage override.
 * Priority: ?chain= → localStorage terp-chain-id → host heuristics
 */
export function detectChainId() {
  try {
    const q = new URLSearchParams(window.location.search).get('chain');
    if (q === 'morocco-1' || q === '120u-1') return q;
  } catch { /* ignore */ }

  try {
    const stored = localStorage.getItem('terp-chain-id');
    if (stored === 'morocco-1' || stored === '120u-1') return stored;
  } catch { /* ignore */ }

  const host = (typeof location !== 'undefined' && location.hostname) || '';
  if (
    host === 'localhost' ||
    host === '127.0.0.1' ||
    host.startsWith('192.168.') ||
    host.startsWith('10.') ||
    host.includes('testnet')
  ) {
    return '120u-1';
  }
  return 'morocco-1';
}

/** Persist chain preference (dev / FAB network toggle). */
export function setChainIdOverride(chainId) {
  if (chainId !== 'morocco-1' && chainId !== '120u-1') return;
  try {
    localStorage.setItem('terp-chain-id', chainId);
  } catch { /* ignore */ }
  _chain = null;
}

function setNested(obj, dotPath, value) {
  const parts = dotPath.split('.');
  let cur = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (cur[parts[i]] == null || typeof cur[parts[i]] !== 'object') cur[parts[i]] = {};
    cur = cur[parts[i]];
  }
  cur[parts[parts.length - 1]] = value;
}

/**
 * Flatten chain config into the shape pages historically expected on CONFIG.
 * Mutates `defaults` in place and returns it.
 */
export function applyChainToDefaults(defaults, chain) {
  if (!defaults || !chain) return defaults;

  if (chain.chainId) defaults.chainId = chain.chainId;
  if (chain.chainName) defaults.chainName = chain.chainName;
  if (chain.rpc) defaults.rpc = chain.rpc;
  if (chain.rest) defaults.rest = chain.rest;
  if (chain.rpcLab) defaults.rpcLab = chain.rpcLab;
  if (chain.restLab) defaults.restLab = chain.restLab;
  if (chain.grpc) defaults.grpc = chain.grpc;
  if (chain.explorer) defaults.explorerBase = chain.explorer;
  if (chain.bech32Prefix) defaults.bech32Prefix = chain.bech32Prefix;

  if (chain.denom) {
    defaults.denom = chain.denom.fee || defaults.denom;
    defaults.denomDisplay = chain.denom.feeDisplay || defaults.denomDisplay;
    defaults.denomDecimals = chain.denom.decimals ?? defaults.denomDecimals;
    defaults.stakeDenom = chain.denom.stake || defaults.stakeDenom;
    defaults.stakeDisplay = chain.denom.stakeDisplay || defaults.stakeDisplay;
  }

  if (chain.gasPriceStep) defaults.gasPriceStep = chain.gasPriceStep;

  // hash-market merkle/BUD host (NFT whitelist proofs; VE disabled on that host)
  if (chain.services) {
    defaults.services = { ...(defaults.services || {}), ...chain.services };
    if (chain.services.merkleServer) {
      defaults.merkleServerUrl = chain.services.merkleServer;
      defaults.merkleServer = chain.services.merkleServer;
    }
    if (chain.services.whitelistTreeId) {
      defaults.whitelistTreeId = chain.services.whitelistTreeId;
    }
  }
  if (chain.whitelistTreeId) defaults.whitelistTreeId = chain.whitelistTreeId;

  if (chain.contracts) {
    defaults.contracts = { ...(defaults.contracts || {}), ...chain.contracts };
    for (const [k, v] of Object.entries(chain.contracts)) {
      if (v) setNested(defaults, `contracts.${k}`, v);
    }
    // Page convenience aliases
    if (chain.contracts.cw721Svg) defaults.staticCollections = [chain.contracts.cw721Svg];
    if (chain.contracts.shitstrapFactory) defaults.shitstrapFactory = chain.contracts.shitstrapFactory;
    if (chain.contracts.accountMinter) defaults.accountMinterContract = chain.contracts.accountMinter;
    if (chain.contracts.terp721Account) defaults.accountContract = chain.contracts.terp721Account;
    // minterContract meaning differs by page (tabs = account manifold, svg = svg minter)
    if (defaults.pageId === 'tabs') {
      if (chain.contracts.accountMinter) defaults.minterContract = chain.contracts.accountMinter;
    } else if (chain.contracts.cwSvgMinter) {
      defaults.minterContract = chain.contracts.cwSvgMinter;
    } else if (chain.contracts.accountMinter && !defaults.minterContract) {
      defaults.minterContract = chain.contracts.accountMinter;
    }
    if (chain.contracts.cwInfusionMinter) defaults.cwInfusionMinter = chain.contracts.cwInfusionMinter;
    if (chain.contracts.headstash) defaults.headstashContract = chain.contracts.headstash;
    if (chain.contracts.headstashManifold) defaults.headstashManifoldContract = chain.contracts.headstashManifold;
  }

  if (chain.services) {
    defaults.services = { ...(defaults.services || {}), ...chain.services };
    if (chain.services.merkleServer) defaults.merkleServerUrl = chain.services.merkleServer;
    if (chain.services.indexer) defaults.indexerBase = chain.services.indexer;
    if (chain.services.headstashServer) defaults.headstashServerUrl = chain.services.headstashServer;
  }

  if (Array.isArray(chain.defaultApps)) defaults.apps = chain.defaultApps;

  return defaults;
}

/**
 * Public testnet DNS can lag the lab hub. If the configured No-Rick
 * contract is missing on `rest`, switch RPC/REST to the lab hub.
 */
export async function preferHubIfContractMissing(cfg) {
  if (!cfg) return cfg;
  const addr = cfg.contracts?.zkWasmvmTest;
  const publicRest = cfg.rest;
  const labRest = cfg.restLab;
  const labRpc = cfg.rpcLab;
  if (!addr || !labRest) return cfg;
  try {
    const r = await fetch(
      `${String(publicRest).replace(/\/$/, '')}/cosmwasm/wasm/v1/contract/${addr}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (r.ok) return cfg;
  } catch {
    /* public REST down or different history */
  }
  cfg.rest = labRest;
  if (labRpc) cfg.rpc = labRpc;
  return cfg;
}

/** Build Keplr experimentalSuggestChain payload from page CONFIG. */
export function buildChainSuggest(config) {
  const prefix = config.bech32Prefix || 'terp';
  const feeDenom = config.denom || 'uthiol';
  const feeDisplay = config.denomDisplay || 'THIOL';
  const stake = config.stakeDenom || 'uterp';
  const stakeDisplay = config.stakeDisplay || 'TERP';
  const decimals = config.denomDecimals ?? 6;
  const gas = config.gasPriceStep || { low: 0.01, average: 0.025, high: 0.04 };

  return {
    chainId: config.chainId,
    chainName: config.chainName || config.chainId,
    rpc: config.rpc,
    rest: config.rest,
    bip44: { coinType: 118 },
    bech32Config: {
      bech32PrefixAccAddr: prefix,
      bech32PrefixAccPub: `${prefix}pub`,
      bech32PrefixValAddr: `${prefix}valoper`,
      bech32PrefixValPub: `${prefix}valoperpub`,
      bech32PrefixConsAddr: `${prefix}valcons`,
      bech32PrefixConsPub: `${prefix}valconspub`,
    },
    currencies: [
      { coinDenom: stakeDisplay, coinMinimalDenom: stake, coinDecimals: decimals },
      { coinDenom: feeDisplay, coinMinimalDenom: feeDenom, coinDecimals: decimals },
    ],
    feeCurrencies: [{
      coinDenom: feeDisplay,
      coinMinimalDenom: feeDenom,
      coinDecimals: decimals,
      gasPriceStep: gas,
    }],
    stakeCurrency: { coinDenom: stakeDisplay, coinMinimalDenom: stake, coinDecimals: decimals },
  };
}

/**
 * Browser-safe RPC/LCD. Public Tendermint RPC rejects CosmJS
 * `Content-Type` on CORS preflight — stay same-origin:
 *   localhost → serve.py /rpc /lcd
 *   terp.network → nginx /rpc[-testnet] /lcd[-testnet]
 */
export function useBrowserSafeChainEndpoints(cfg) {
  if (!cfg || typeof location === "undefined") return cfg;
  const host = location.hostname;
  const origin = location.origin;
  const testnet = cfg.chainId === "120u-1";
  if (host === "localhost" || host === "127.0.0.1") {
    cfg.rpc = `${origin}/rpc`;
    cfg.rest = `${origin}/lcd`;
    return cfg;
  }
  if (host === "terp.network" || host === "www.terp.network") {
    cfg.rpc = testnet ? `${origin}/rpc-testnet` : `${origin}/rpc`;
    cfg.rest = testnet ? `${origin}/lcd-testnet` : `${origin}/lcd`;
    return cfg;
  }
  return cfg;
}

/** @deprecated use useBrowserSafeChainEndpoints */
export function useLocalChainProxies(cfg) {
  return useBrowserSafeChainEndpoints(cfg);
}

/**
 * cosmes ChainInfo[] for WalletController.connect (KeplrController).
 * gasPrice.amount must be a string (cosmes PlainMessage Coin).
 */
export function buildCosmesChainInfo(config) {
  const gasAmount = String(config.gasPriceStep?.average ?? 0.025);
  const rpc = String(config.rpc || '').replace(/\/$/, '');
  return [{
    chainId: config.chainId,
    rpc,
    gasPrice: { amount: gasAmount, denom: config.denom || 'uthiol' },
    // Terp / Cosmos SDK 0.47-family chains
    sdkVersion: config.sdkVersion || 'sdk47',
  }];
}

/** Pinned @goblinhunt/cosmes base (wallet + client subpaths). */
export function cosmesBaseUrl() {
  return COSMES_PIN;
}

/**
 * Fetch site config.json (cached).
 * @returns {Promise<object>}
 */
export async function fetchSiteConfig() {
  if (_site) return _site;
  const res = await fetch(CONFIG_URL, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`config.json HTTP ${res.status}`);
  _site = await res.json();
  if (_site.checksums && typeof window !== 'undefined') {
    window._siteChecksums = _site.checksums;
  }
  return _site;
}

/**
 * Load active chain slice from config.json.
 * @param {string} [chainId]
 */
export async function getChainConfig(chainId = detectChainId()) {
  const site = await fetchSiteConfig();
  const chain = site.chains?.[chainId];
  if (!chain) throw new Error(`chain ${chainId} missing from config.json`);
  _chain = chain;
  return chain;
}

/**
 * Page API: merge static config into defaults (mutates defaults).
 * Same name as the old config-loader export.
 *
 * @param {object} defaults — page CONFIG object
 * @param {{ chainId?: string, pageId?: string }} [opts]
 * @returns {Promise<object>}
 */
export async function loadSiteConfig(defaults = {}, opts = {}) {
  if (opts.pageId) defaults.pageId = opts.pageId;
  const chainId = opts.chainId || defaults.chainId || detectChainId();
  try {
    const chain = await getChainConfig(chainId);
    applyChainToDefaults(defaults, chain);
  } catch (err) {
    console.warn('[terp-config] loadSiteConfig failed:', err.message || err);
  }

  // Overlay live contracts from cw-orch S3 state.json (fills gaps; does not wipe config.json)
  if (chainId === 'morocco-1' || opts.mergeStateJson !== false) {
    try {
      const { loadStateContracts, loadAssetRegistry, STATE_JSON_URL } = await import(
        '/lib/assets-registry.js'
      );
      const stateUrl =
        defaults.stateJsonUrl ||
        defaults.services?.stateJson ||
        STATE_JSON_URL;
      defaults.stateJsonUrl = stateUrl;
      const [{ contracts }, ] = await Promise.all([
        loadStateContracts(stateUrl, chainId),
        loadAssetRegistry(stateUrl, chainId),
      ]);
      if (contracts && Object.keys(contracts).length) {
        const merged = { ...(defaults.contracts || {}) };
        for (const [k, v] of Object.entries(contracts)) {
          if (!v) continue;
          // Only fill empty / missing keys so config.json remains source of truth when set
          if (!merged[k]) merged[k] = v;
        }
        // Convenience aliases when still empty
        const fill = (alias, val) => {
          if (val && !merged[alias]) merged[alias] = val;
        };
        fill('shitstrapFactory', contracts.shitstrapFactory);
        fill('cwSvgMinter', contracts.cwSvgMinter);
        fill('cw721Svg', contracts.cw721Svg);
        fill('accountMinter', contracts.accountMinter);
        fill('terp721Account', contracts.terp721Account);
        fill('cwInfusionMinter', contracts.cwInfusionMinter);
        defaults.contracts = merged;
        // Re-apply convenience fields on defaults for pages that read top-level keys
        applyChainToDefaults(defaults, { contracts: merged });
      }
    } catch (err) {
      console.warn('[terp-config] state.json overlay:', err.message || err);
    }
  }

  // Always expose builders so pages don't hardcode chain suggest
  defaults.chainSuggest = buildChainSuggest(defaults);
  defaults.cosmesChainInfo = buildCosmesChainInfo(defaults);
  return defaults;
}

/**
 * Missing required contract keys (empty string counts as missing).
 * @param {object} config
 * @param {string[]} keys — e.g. ['cwSvgMinter','cw721Svg'] or aliases minterContract
 */
export function missingContracts(config, keys = []) {
  const c = config.contracts || {};
  const missing = [];
  for (const key of keys) {
    const v =
      config[key] ||
      c[key] ||
      (key === 'cwSvgMinter' ? config.minterContract : null) ||
      (key === 'accountMinter' ? config.accountMinterContract || config.minterContract : null) ||
      (key === 'terp721Account' ? config.accountContract : null);
    if (!v) missing.push(key);
  }
  return missing;
}

export function getCachedSite() {
  return _site;
}

export function getCachedChain() {
  return _chain;
}
