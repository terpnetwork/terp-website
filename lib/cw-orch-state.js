/**
 * Single cw-orch state.json for morocco-1.
 * Canonical: https://s3.terp.network/snapshots/mainnet/morocco-1/state.json
 * Same object: https://minio.terp.network/snapshots/mainnet/morocco-1/state.json
 * No local Daemon. Do not import /public/state.json.
 */

export const TERP_MAINNET = 'morocco-1';
export const STATE_JSON_URL =
  'https://s3.terp.network/snapshots/mainnet/morocco-1/state.json';
export const STATE_JSON_URL_MINIO =
  'https://minio.terp.network/snapshots/mainnet/morocco-1/state.json';

export const AUTH_CODE_KEYS = Object.freeze([
  'terp-passkey',
  'terp-recovery',
  'terp-ed25519',
  'terp-eth',
]);

/** Lab ids — never copy onto morocco-1. */
export const LAB_PASSKEY_CODE_ID = 4;

let cache = null;
let inflight = null;

export function authCodeIds(codeIds) {
  const out = {};
  for (const k of AUTH_CODE_KEYS) {
    const n = Number(codeIds?.[k]);
    if (Number.isFinite(n) && n > 0) out[k] = n;
  }
  return out;
}

export function parseMainnetSlice(json, chainId = TERP_MAINNET) {
  if (!json || typeof json !== 'object') throw new Error('state.json missing');
  const slice = json[chainId];
  if (!slice || typeof slice !== 'object') {
    throw new Error(`state.json has no ${chainId}`);
  }
  const codeIds = slice.code_ids || {};
  const def = slice.default || {};
  const auth = authCodeIds(codeIds);
  if (chainId === TERP_MAINNET) {
    if (auth['terp-passkey'] !== 84) {
      throw new Error(
        `morocco-1.code_ids[terp-passkey] must be 84, got ${auth['terp-passkey']}`,
      );
    }
    if (auth['terp-passkey'] === LAB_PASSKEY_CODE_ID) {
      throw new Error('refusing 120u-1 terp-passkey code 4 on morocco-1');
    }
  }
  return {
    chainId,
    codeIds,
    default: def,
    authCodeIds: auth,
    passkeyCodeId: auth['terp-passkey'] || null,
    ibcData: slice.ibc_data || {},
    /** Smoke instantiate addrs only — not the user’s authenticator. */
    noncircuitAuth: slice['noncircuit-auth'] || {},
  };
}

async function fetchJson(url) {
  const res = await fetch(url, { cache: 'no-store', mode: 'cors', credentials: 'omit' });
  if (!res.ok) throw new Error(`state.json HTTP ${res.status}`);
  return res.json();
}

export async function loadCwOrchState(opts = {}) {
  const chainId = opts.chainId || TERP_MAINNET;
  if (cache && cache.chainId === chainId && !opts.force) return cache;
  if (inflight && !opts.force) return inflight;
  inflight = (async () => {
    const urls = [opts.url, STATE_JSON_URL, STATE_JSON_URL_MINIO].filter(Boolean);
    const seen = new Set();
    let lastErr;
    for (const url of urls) {
      if (seen.has(url)) continue;
      seen.add(url);
      try {
        const json = await fetchJson(url);
        const parsed = parseMainnetSlice(json, chainId);
        parsed.stateUrl = url;
        cache = parsed;
        return parsed;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('state.json unreachable');
  })();
  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

export function resetCwOrchStateCache() {
  cache = null;
  inflight = null;
}
