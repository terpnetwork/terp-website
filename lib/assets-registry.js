/**
 * assets-registry.js — human denom labels from cw-orch state.json (S3).
 * Used by shitstrap UI + mint payment chips (IBC prep: show AKT/ATONE/… not raw ibc/…).
 */

const STATE_URL_DEFAULT =
  'https://s3.terp.network/snapshots/mainnet/morocco-1/state.json';

/** @type {Map<string, { symbol: string, display: string, name: string, decimals: number, base: string }>|null} */
let _byBase = null;
/** @type {Promise<Map>|null} */
let _loading = null;

/**
 * @param {string} [url]
 * @param {string} [chainId]
 */
export async function loadAssetRegistry(url = STATE_URL_DEFAULT, chainId = 'morocco-1') {
  if (_byBase) return _byBase;
  if (_loading) return _loading;

  _loading = (async () => {
    const map = new Map();
    // Native fee/stake always present
    map.set('uthiol', {
      symbol: 'THIOL',
      display: 'THIOL',
      name: 'Thiol',
      decimals: 6,
      base: 'uthiol',
    });
    map.set('uterp', {
      symbol: 'TERP',
      display: 'TERP',
      name: 'Terp',
      decimals: 6,
      base: 'uterp',
    });

    try {
      const res = await fetch(url, { cache: 'no-cache', mode: 'cors' });
      if (!res.ok) throw new Error(`state.json HTTP ${res.status}`);
      const state = await res.json();
      const slice = state[chainId] || state['morocco-1'] || {};
      const assetsBag = slice.assets || {};
      // cw-orch packs multi-source assets under assets[""]
      const lists = [];
      if (Array.isArray(assetsBag)) lists.push(assetsBag);
      else {
        for (const v of Object.values(assetsBag)) {
          if (Array.isArray(v)) lists.push(v);
        }
      }
      for (const list of lists) {
        for (const a of list) {
          if (!a?.base) continue;
          const units = a.denom_units || [];
          let decimals = 6;
          for (const u of units) {
            if (u.exponent != null && Number(u.exponent) > decimals) {
              decimals = Number(u.exponent);
            }
          }
          // Prefer highest exponent unit as display
          const displayUnit =
            units.slice().sort((x, y) => (y.exponent || 0) - (x.exponent || 0))[0] || {};
          const entry = {
            symbol: a.symbol || displayUnit.denom || a.display || a.base,
            display: a.display || a.symbol || displayUnit.denom || a.base,
            name: a.name || a.symbol || a.base,
            decimals,
            base: a.base,
            logo: a.logo_URIs?.svg || a.logo_URIs?.png || a.images?.[0]?.svg || a.images?.[0]?.png || '',
          };
          map.set(a.base, entry);
          // aliases
          for (const u of units) {
            if (u.denom && u.denom !== a.base) map.set(u.denom, { ...entry, base: a.base });
            for (const al of u.aliases || []) {
              if (al) map.set(al, { ...entry, base: a.base });
            }
          }
        }
      }
    } catch (e) {
      console.warn('[assets-registry] load failed (CORS or network):', e.message || e);
    }

    _byBase = map;
    _loading = null;
    return map;
  })();

  return _loading;
}

export function getAsset(denom) {
  if (!denom || !_byBase) return null;
  return _byBase.get(denom) || null;
}

/**
 * Human symbol for a base denom (ibc/…, factory/…, uthiol).
 */
export function denomLabel(denom, fallback) {
  if (!denom) return fallback || '—';
  const a = getAsset(denom);
  if (a?.symbol) return a.symbol;
  if (a?.display) return String(a.display).toUpperCase();
  // Lightweight heuristics when registry missing
  if (denom === 'uthiol') return 'THIOL';
  if (denom === 'uterp') return 'TERP';
  if (denom.startsWith('ibc/')) return `IBC…${denom.slice(-6)}`;
  if (denom.startsWith('factory/')) {
    const parts = denom.split('/');
    return (parts[parts.length - 1] || denom).toUpperCase();
  }
  if (denom.startsWith('u') && denom.length <= 8) return denom.slice(1).toUpperCase();
  return fallback || denom;
}

/**
 * Format base amount with human denom.
 * @param {string|bigint|number} amountBase
 * @param {string} denom
 */
export function formatCoin(amountBase, denom) {
  const a = getAsset(denom);
  const decimals = a?.decimals ?? 6;
  let n = 0;
  try {
    n = Number(amountBase) / 10 ** decimals;
  } catch {
    n = 0;
  }
  if (!Number.isFinite(n)) n = 0;
  const label = denomLabel(denom);
  const body =
    n >= 1000
      ? n.toLocaleString(undefined, { maximumFractionDigits: 2 })
      : n.toLocaleString(undefined, { maximumFractionDigits: Math.min(decimals, 6) });
  return `${body} ${label}`;
}

/** Short contract address for UI */
export function shortAddr(addr, head = 8, tail = 6) {
  if (!addr) return '—';
  if (addr.length <= head + tail + 1) return addr;
  return `${addr.slice(0, head)}…${addr.slice(-tail)}`;
}

/**
 * Pull morocco-1 (or chain) default contract map from state.json into flat aliases.
 * @returns {Promise<{ contracts: object, codeIds: object, raw: object }>}
 */
export async function loadStateContracts(url = STATE_URL_DEFAULT, chainId = 'morocco-1') {
  try {
    const res = await fetch(url, { cache: 'no-cache', mode: 'cors' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const state = await res.json();
    const slice = state[chainId] || state['morocco-1'] || {};
    const def = slice.default || {};
    const codeIds = slice.code_ids || {};

    /** Map cw-orch package names → site config keys */
    const KEY_MAP = {
      'cw-shitstrap-factory': 'shitstrapFactory',
      'cw-svg-minter': 'cwSvgMinter',
      cw721_svg: 'cw721Svg',
      'crates.io:terp721-account-manifold': 'accountMinter',
      'crates.io:terp721-account': 'terp721Account',
      'cw-infuser': 'cwInfusionMinter',
      'abstract:registry': 'abstractRegistry',
      'abstract:ans-host': 'abstractAnsHost',
      'abstract:ibc-client': 'abstractIbcClient',
      'abstract:ibc-host': 'abstractIbcHost',
      'abstract:module-factory': 'abstractModuleFactory',
    };

    const contracts = {};
    for (const [k, v] of Object.entries(def)) {
      if (!v || typeof v !== 'string') continue;
      const alias = KEY_MAP[k];
      if (alias) contracts[alias] = v;
      // keep raw key too
      contracts[k] = v;
    }

    const AUTH_KEYS = ['terp-passkey', 'terp-recovery', 'terp-ed25519', 'terp-eth'];
    const authCodeIds = {};
    for (const k of AUTH_KEYS) {
      const n = Number(codeIds[k]);
      if (Number.isFinite(n) && n > 0) authCodeIds[k] = n;
    }
    if (chainId === 'morocco-1' && authCodeIds['terp-passkey'] !== 84) {
      console.warn('[assets-registry] morocco-1.code_ids[terp-passkey] expected 84, got', authCodeIds['terp-passkey']);
    }
    // noncircuit-auth smoke addrs are not user authenticators — do not merge into contracts.
    return { contracts, codeIds, authCodeIds, raw: def, stateUrl: url, chainId };
  } catch (e) {
    console.warn('[assets-registry] state contracts:', e.message || e);
    return { contracts: {}, codeIds: {}, raw: {}, stateUrl: url, chainId };
  }
}

export const STATE_JSON_URL = STATE_URL_DEFAULT;
