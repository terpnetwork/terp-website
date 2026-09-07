/**
 * svg-render.js — on-chain SVG template render (seed + variables)
 *
 * Live cw721-svg stores art as svg_template + variables on collection extension.
 * Preview uses extension.msg.svg_placeholder or local sample of the same rules.
 * Generative PALETTE orbs are last-resort fallback only.
 */

/** Unicode-safe base64 for LCD smart queries */
export function toSmartQueryB64(obj) {
  const json = JSON.stringify(obj);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin);
}

/**
 * CosmWasm smart query via LCD.
 * Note: browser needs CORS on the LCD host (enabled-unsafe-cors / nginx).
 * @param {string} rest
 * @param {string} contract
 * @param {object} query
 */
export async function querySmartLcd(rest, contract, query) {
  const base = String(rest || '').replace(/\/$/, '');
  if (!base || !contract) throw new Error('querySmartLcd: rest + contract required');
  const b64 = toSmartQueryB64(query);
  const url = `${base}/cosmwasm/wasm/v1/contract/${contract}/smart/${b64}`;
  // No custom headers — avoid CORS preflight failures on some LCD stacks
  const res = await fetch(url, { method: 'GET', mode: 'cors', credentials: 'omit' });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`LCD ${res.status}: ${t.slice(0, 200)}`);
  }
  const body = await res.json();
  if (body.code != null && body.message) {
    throw new Error(body.message);
  }
  return body.data !== undefined ? body.data : body;
}

/**
 * CosmWasm smart query via cosmes RPC helper (has CORS on public RPC).
 * @param {(addr:string, query:object)=>Promise<any>} queryContractSmart
 * @param {string} contract
 * @param {object} query
 */
export async function querySmartRpc(queryContractSmart, contract, query) {
  if (typeof queryContractSmart !== 'function') {
    throw new Error('querySmartRpc: adapter missing');
  }
  return queryContractSmart(contract, wrapSvgExtensionQuery(query));
}

/**
 * Try LCD then RPC adapter (browser-safe).
 * @param {{ rest?: string, queryContractSmart?: Function }} opts
 */
export async function querySmart(opts, contract, query) {
  const q = wrapSvgExtensionQuery(query);
  const errors = [];
  if (opts.rest) {
    try {
      return await querySmartLcd(opts.rest, contract, q);
    } catch (e) {
      errors.push(`lcd: ${e.message || e}`);
    }
  }
  if (opts.queryContractSmart) {
    try {
      return await querySmartRpc(opts.queryContractSmart, contract, q);
    } catch (e) {
      errors.push(`rpc: ${e.message || e}`);
    }
  }
  throw new Error(errors.join(' | ') || 'querySmart failed');
}

/** Wrap SVG-specific queries for contracts that nest under extension.msg */
export function wrapSvgExtensionQuery(query) {
  if (!query || typeof query !== 'object') return query;
  if (query.extension) return query;
  const key = Object.keys(query)[0];
  const nested = [
    'svg_placeholder',
    'svg_template',
    'svg_token_uri',
    'whitelist',
    'mint_count',
    'wl_mint_count',
    'current_price_tier',
  ];
  if (nested.includes(key)) {
    return { extension: { msg: query } };
  }
  // Newer contracts use get_config instead of config
  if (key === 'config') {
    return { get_config: {} };
  }
  return query;
}

/**
 * Deterministic RNG from string/bytes (mulberry32).
 * @param {string|Uint8Array} seed
 */
export function rngFromSeed(seed) {
  let h = 2166136261;
  const s = typeof seed === 'string' ? seed : Array.from(seed || []).join(',');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let state = h >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decodeSeedStr(seed) {
  if (!seed) return 'default';
  // base64 seed from chain — use raw string as entropy source
  return String(seed);
}

/**
 * Sample variable values from on-chain variable specs.
 * @param {Array<{name:string, kind: object}>} variables
 * @param {string} seed
 * @returns {Record<string, string>}
 */
export function sampleVariables(variables, seed) {
  const rng = rngFromSeed(decodeSeedStr(seed));
  const out = {};
  for (const v of variables || []) {
    const name = v.name;
    if (!name) continue;
    const kind = v.kind || {};
    if (kind.range) {
      const min = parseFloat(kind.range.min);
      const max = parseFloat(kind.range.max);
      const precision = Number(kind.range.precision ?? 2);
      const x = min + rng() * (max - min);
      out[name] = Number.isFinite(precision)
        ? x.toFixed(Math.max(0, precision))
        : String(x);
    } else if (Array.isArray(kind.options) && kind.options.length) {
      const idx = Math.floor(rng() * kind.options.length) % kind.options.length;
      out[name] = String(kind.options[idx]);
    } else if (kind.fixed != null) {
      out[name] = String(kind.fixed);
    } else {
      out[name] = '0';
    }
  }
  return out;
}

/**
 * Substitute ${name} in template (no recursive eval).
 * @param {string} template
 * @param {Record<string, string>} vars
 */
export function substituteTemplate(template, vars) {
  if (!template) return '';
  return String(template).replace(/\$\{([a-zA-Z0-9_]+)\}/g, (_, name) => {
    if (Object.prototype.hasOwnProperty.call(vars, name)) return vars[name];
    return '0';
  });
}

/**
 * Build preview SVG from collection extension (template + variables + seed).
 * @param {{ svg_template?: string, template?: string, seed?: string, variables?: array }} ext
 * @param {string} [seedOverride]
 */
export function renderFromExtension(ext, seedOverride) {
  if (!ext) return null;
  const template = ext.svg_template || ext.template;
  if (!template) return null;
  const seed = seedOverride || ext.seed || 'preview';
  const vars = sampleVariables(ext.variables || [], seed);
  return substituteTemplate(template, vars);
}

/**
 * Fetch collection art metadata + on-chain placeholder/template.
 * @param {string} rest
 * @param {string} contractAddr
 * @param {{ seed?: string, queryContractSmart?: Function }} [opts]
 */
export async function fetchCollectionArt(rest, contractAddr, opts = {}) {
  const seedKey = opts.seed || contractAddr || 'preview';
  const qopts = { rest, queryContractSmart: opts.queryContractSmart };

  // 1) On-chain rendered placeholder (authoritative preview)
  try {
    const ph = await querySmart(qopts, contractAddr, {
      extension: { msg: { svg_placeholder: { seed: seedKey } } },
    });
    if (ph?.svg) {
      // Also pull template/extension for token renders
      let extension = null;
      let template = null;
      try {
        const info = await querySmart(qopts, contractAddr, { contract_info: {} });
        extension = info?.extension || null;
        template = extension?.svg_template || null;
      } catch { /* optional */ }
      return {
        placeholder: ph.svg,
        template,
        extension,
        contractInfo: null,
        source: 'svg_placeholder',
      };
    }
  } catch (e) {
    console.warn('[svg-render] placeholder', contractAddr, e.message || e);
  }

  // 2) contract_info.extension → local sample of template
  try {
    const info = await querySmart(qopts, contractAddr, { contract_info: {} });
    const ext = info?.extension || {};
    const rendered = renderFromExtension(ext, seedKey);
    if (rendered) {
      return {
        placeholder: rendered,
        template: ext.svg_template || null,
        extension: ext,
        contractInfo: { name: info.name, symbol: info.symbol },
        source: 'contract_info',
      };
    }
  } catch (e) {
    console.warn('[svg-render] contract_info', contractAddr, e.message || e);
  }

  // 3) get_collection_info_and_extension
  try {
    const info = await querySmart(qopts, contractAddr, {
      get_collection_info_and_extension: {},
    });
    const ext = info?.extension || {};
    const rendered = renderFromExtension(ext, seedKey);
    if (rendered) {
      return {
        placeholder: rendered,
        template: ext.svg_template || null,
        extension: ext,
        contractInfo: { name: info.name, symbol: info.symbol },
        source: 'get_collection_info_and_extension',
      };
    }
  } catch (e) {
    console.warn('[svg-render] collection_info', contractAddr, e.message || e);
  }

  return { placeholder: null, template: null, extension: null, source: 'none' };
}

/**
 * Mint price from extension.msg.current_price_tier
 * @param {string} rest
 * @param {string} contractAddr
 * @param {{ queryContractSmart?: Function }} [opts]
 */
export async function fetchCurrentPriceTier(rest, contractAddr, opts = {}) {
  try {
    const data = await querySmart(
      { rest, queryContractSmart: opts.queryContractSmart },
      contractAddr,
      { extension: { msg: { current_price_tier: {} } } },
    );
    if (data?.denom && data?.amount != null) {
      return { denom: data.denom, amount: String(data.amount) };
    }
  } catch {
    /* ignore */
  }
  return null;
}
