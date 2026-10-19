/*!
 * svg-launchpad/chain.js: read-only chain access for the collection builder,
 * plus the opt-in dry run and wallet send. Nothing here sends a transaction
 * unless createCollection() is called (the page only does that on a click,
 * with a wallet connected, and on mainnet only after the mainnet switch).
 */
import { fetchSiteConfig, loadSiteConfig } from '/lib/config.js';

const trim = (u) => String(u || '').replace(/\/+$/, '');
const utf8 = (s) => new TextEncoder().encode(s);
function b64(bytes) { let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]); return btoa(s); }
function fromB64(s) { const bin = atob(s); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
const fromUtf8 = (b) => new TextDecoder().decode(b);

export class ChainError extends Error {
  constructor(message, status = 0) { super(message); this.name = 'ChainError'; this.status = status; }
}

async function getJson(url, { signal, timeout = 15000 } = {}) {
  let res;
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeout);
  if (signal) signal.addEventListener('abort', () => ctl.abort(), { once: true });
  try {
    res = await fetch(url, { signal: ctl.signal, headers: { accept: 'application/json' } });
  } catch (e) {
    throw new ChainError(e && e.name === 'AbortError' ? 'The network API did not answer in time' : 'The network API could not be reached', 0);
  } finally { clearTimeout(t); }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChainError(body.message || `HTTP ${res.status}`, res.status);
  return body;
}

export async function smart(rest, contract, msg, opts) {
  const q = encodeURIComponent(b64(utf8(JSON.stringify(msg))));
  return (await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/smart/${q}`, opts)).data;
}

export async function rawItem(rest, contract, key, opts) {
  const k = encodeURIComponent(b64(typeof key === 'string' ? utf8(key) : key));
  const body = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/raw/${k}`, opts);
  return body.data ? JSON.parse(fromUtf8(fromB64(body.data))) : null;
}

function mapKey(ns, key) {
  const n = utf8(ns), k = utf8(key);
  const out = new Uint8Array(2 + n.length + k.length);
  out[0] = n.length >> 8; out[1] = n.length & 255; out.set(n, 2); out.set(k, 2 + n.length);
  return out;
}

// ── networks ──────────────────────────────────────────────────────────────

const REST_OVERRIDE_KEY = 'terp-svg-launchpad.rest.';

/** { testnet, mainnet } from /public/config.json. */
export async function loadNetworks() {
  const site = await fetchSiteConfig();
  const pick = (id, kind) => {
    const c = (site.chains || {})[id] || {};
    const k = c.contracts || {};
    let rest = c.rest || '';
    try { rest = localStorage.getItem(REST_OVERRIDE_KEY + id) || rest; } catch { /* no storage */ }
    return {
      kind, chainId: id, rest, defaultRest: c.rest || '', restLab: c.restLab || '', rpc: c.rpc || '',
      minter: k.cwSvgMinter || '', factory: k.shitstrapFactory || '', explorer: c.explorer || '',
      gasPriceStep: c.gasPriceStep || { low: 0.01, average: 0.025, high: 0.04 },
      feeDenom: (c.denom && c.denom.fee) || 'uthiol', feeDisplay: (c.denom && c.denom.feeDisplay) || 'THIOL',
      bech32Prefix: c.bech32Prefix || 'terp',
    };
  };
  return { testnet: pick('120u-1', 'testnet'), mainnet: pick('morocco-1', 'mainnet') };
}

export function setRestOverride(net, url) {
  try {
    if (url && url !== net.defaultRest) localStorage.setItem(REST_OVERRIDE_KEY + net.chainId, url);
    else localStorage.removeItem(REST_OVERRIDE_KEY + net.chainId);
  } catch { /* no storage */ }
  net.rest = url || net.defaultRest;
}

export async function nodeStatus(net) {
  const j = await getJson(`${trim(net.rest)}/cosmos/base/tendermint/v1beta1/blocks/latest`, { timeout: 8000 });
  return { height: Number(j.block?.header?.height || j.sdk_block?.header?.height || 0), chainId: j.block?.header?.chain_id || j.sdk_block?.header?.chain_id || '' };
}

export async function minterInfo(net) {
  if (!net.minter) return { minter: '', owner: null, codeId: null };
  const [own, codeId] = await Promise.all([
    smart(net.rest, net.minter, { ownership: {} }).catch(() => null),
    smart(net.rest, net.minter, { code_id: {} }).catch(() => null),
  ]);
  return { minter: net.minter, owner: own ? own.owner : null, codeId: codeId != null ? Number(codeId) : null };
}

// ── accepted payment tokens (the shitstrap accepted set) ──────────────────

// Decimals for tokens whose chain metadata has no display unit.
const KNOWN = {
  'ibc/AF34593540E81B06145CD80BDBB2149BE068A9B495086284DFD0FB3017AB5254': { symbol: 'ATONE', decimals: 6 },
  'ibc/ED3433FEFECE0B9EC584F0EBAB31E8AB6A7A187537F3E5B1D8A80998986E7ACF': { symbol: 'AKT', decimals: 6 },
  'ibc/0F92AF0DAD1FA5CBC4D8FDF9F5BF9F7F5BE36DF268B1E115DB82E1A71BE9CB31': { symbol: 'allETH', decimals: 18 },
  'ibc/9FC418778218616ADEC741B8E402C856EBF2AADAD93A8D7EA322F798480F641C': { symbol: 'allBTC', decimals: 8 },
  'ibc/BC072FE6C12FD02688EA5DE89857BB269584E6DD378170080C3E1463825B9F81': { symbol: 'allZEC', decimals: 8 },
  'ibc/6B32258CACFCBB5486A47CB1EAF4B6F5AD76C9E372E5F3CB08B3D1C606F9F39E': { symbol: 'UM', decimals: 6 },
};

/** Mainnet shitstrap accepted set as read on 2026-10-08 (used when the factory cannot be read). */
const FALLBACK = {
  'morocco-1': [
    'ibc/AF34593540E81B06145CD80BDBB2149BE068A9B495086284DFD0FB3017AB5254',
    'ibc/0F92AF0DAD1FA5CBC4D8FDF9F5BF9F7F5BE36DF268B1E115DB82E1A71BE9CB31',
    'ibc/2A7856F9BE06364B5D91024674960DD2DBB5F3AA812C8D8B37E6C54A6A83DEFA',
    'ibc/ED3433FEFECE0B9EC584F0EBAB31E8AB6A7A187537F3E5B1D8A80998986E7ACF',
    'ibc/9FC418778218616ADEC741B8E402C856EBF2AADAD93A8D7EA322F798480F641C',
  ],
};

async function denomLabel(net, denom) {
  if (KNOWN[denom]) return { ...KNOWN[denom], origin: '' };
  if (!denom.startsWith('ibc/')) return { symbol: denom.replace(/^u/, '').toUpperCase(), decimals: 6, origin: '' };
  try {
    const j = await getJson(`${trim(net.rest)}/ibc/apps/transfer/v1/denoms/${denom.slice(4)}`, { timeout: 8000 });
    const base = j.denom?.base || '';
    const last = base.split('/').pop();
    return { symbol: last.startsWith('u') && !base.includes('/') ? last.slice(1).toUpperCase() : last, decimals: 6, origin: base, guessedDecimals: true };
  } catch {
    return { symbol: `ibc/${denom.slice(4, 8)}…`, decimals: 6, origin: '', unknown: true, guessedDecimals: true };
  }
}

/**
 * Accepted payment tokens: every `accepted` native denom of every shitstrap the
 * factory lists. Returns { denoms: [{ denom, symbol, decimals, straps }], source }.
 */
export async function acceptedDenoms(net) {
  const seen = new Map();
  let source = 'factory';
  try {
    if (!net.factory) throw new ChainError('no shitstrap factory configured');
    let after = null;
    for (let page = 0; page < 20; page++) {
      const r = await smart(net.rest, net.factory, { list_shitstrap_contracts: { limit: 30, ...(after ? { start_after: after } : {}) } });
      const rows = Array.isArray(r) ? r : (r && (r.contracts || r.data)) || [];
      for (const ss of rows) {
        for (const a of ss.accepted || ss.slop || []) {
          const d = typeof a.token === 'string' ? a.token : a.token && a.token.native;
          if (!d) continue;
          if (!seen.has(d)) seen.set(d, []);
          seen.get(d).push(ss.contract);
        }
      }
      if (rows.length < 30) break;
      after = rows[rows.length - 1].contract;
    }
    if (!seen.size) throw new ChainError('the factory lists no accepted tokens');
  } catch (e) {
    source = `built-in list (${e.message})`;
    for (const d of FALLBACK[net.chainId] || []) seen.set(d, []);
  }
  const denoms = [];
  for (const [denom, straps] of seen) denoms.push({ denom, straps, ...(await denomLabel(net, denom)) });
  denoms.sort((a, b) => a.symbol.localeCompare(b.symbol));
  return { denoms, source };
}

// ── existing collections ──────────────────────────────────────────────────

export async function loadCollection(net, addr) {
  const rest = net.rest;
  const info = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${addr}`);
  const ci = info.contract_info || {};
  const [template, variables, slots, metaAttr, count, name] = await Promise.all([
    rawItem(rest, addr, 'svg_template'),
    rawItem(rest, addr, 'variables'),
    rawItem(rest, addr, 'template_slots'),
    rawItem(rest, addr, mapKey('cw721_collection_info_extension', 'metadata')).catch(() => null),
    smart(rest, addr, { num_tokens: {} }).catch(() => null),
    rawItem(rest, addr, 'cw721_collection_info').catch(() => null),
  ]);
  if (template == null) throw new ChainError('This contract has no svg_template; it is not a cw721-svg collection.');
  let meta = null;
  try { meta = metaAttr ? JSON.parse(fromUtf8(fromB64(metaAttr.value))) : null; } catch { meta = null; }
  return {
    addr, codeId: Number(ci.code_id || 0), label: ci.label || '', admin: ci.admin || '', creator: ci.creator || '',
    name: name ? name.name : '', symbol: name ? name.symbol : '',
    template, variables: variables || [], slots: slots || [],
    seed: meta ? meta.seed : '', priceTiers: meta ? meta.price_tiers || [] : [], total: meta ? meta.total : null,
    minted: count ? Number(count.count || 0) : null,
  };
}

export async function chainPlaceholder(net, addr, seed) {
  const v = await smart(net.rest, addr, { extension: { msg: { svg_placeholder: { seed: seed == null ? null : String(seed) } } } });
  return (v && v.svg) || '';
}

// ── dry run and send ──────────────────────────────────────────────────────

/** Dry run of create_svg_collection through the minter (not signed, not broadcast). */
export async function simulateCreate(net, { sender, pubkey = '', instantiateMsg, label }) {
  const mod = await import('/lib/contracts/cw-svg-minter.js');
  if (typeof mod.simulateCreateCollection !== 'function') throw new ChainError('This build of /lib/contracts/cw-svg-minter.js has no dry run.');
  return mod.simulateCreateCollection(net.rest, net.minter, { sender, pubkey, instantiateMsg, label, feeDenom: net.feeDenom });
}

let walletMod = null;
let walletCfg = null;

/** Connect Keplr for this network with the site's shared wallet session. */
export async function connectWallet(net) {
  walletMod = walletMod || (await import('/lib/wallet.js'));
  const cfg = { chainId: net.chainId, pageId: 'svg' };
  await loadSiteConfig(cfg, { chainId: net.chainId, pageId: 'svg', mergeStateJson: false });
  cfg.rest = net.rest;
  await walletMod.ensureLibs(cfg);
  const snap = await walletMod.connect(cfg);
  walletCfg = cfg;
  let pubkey = '';
  try {
    const key = await window.keplr.getKey(net.chainId);
    pubkey = b64(key.pubKey);
  } catch { /* dry run falls back to the chain's copy of the key */ }
  return { address: snap.address, pubkey };
}

export function walletAddress() {
  const s = walletMod && walletMod.getSnapshot ? walletMod.getSnapshot() : null;
  return s && s.address ? s.address : '';
}

/** Sign and send create_svg_collection with the connected wallet. */
export async function createCollection(net, msg) {
  if (!walletMod || !walletCfg || walletCfg.chainId !== net.chainId) throw new ChainError('Connect a wallet on this network first.');
  return walletMod.executeContract(net.minter, msg, { memo: 'create svg collection' });
}
