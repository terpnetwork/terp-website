// lib/onboard-client.js — delegated feegrant (DAO → runtime → AllowedMsgAllowance).
// Same path on 120u-1 and morocco-1. Faucet is not the product funding plane.
//
// Override: ?onboard=https://…  or  localStorage.pm-onboard-url

/** Public HashMerchant / onboard-authz host (testnet and mainnet). */
export const ONBOARD_PUBLIC_URL = 'https://hash.terp.network';

function trimSlash(s) {
  return String(s || '').replace(/\/$/, '');
}

export function onboardBase() {
  try {
    const q = new URLSearchParams(location.search).get('onboard');
    if (q) return trimSlash(q);
    const stored = localStorage.getItem('pm-onboard-url');
    if (stored) return trimSlash(stored);
    // Same-origin /onboard/* is proxied by terp.network nginx — avoids CORS.
    if (typeof location !== 'undefined' && /(?:^|\.)terp\.network$/.test(location.hostname)) {
      return '';
    }
  } catch {
    /* ignore */
  }
  const host = typeof location !== 'undefined' ? location.hostname : '';
  if (host === 'localhost' || host === '127.0.0.1') {
    return 'http://127.0.0.1:5001';
  }
  if (host === 'hash.terp.network' || host.startsWith('hm.') || host.startsWith('hash-')) {
    return '';
  }
  try {
    const s = typeof window !== 'undefined' ? window.__TERP_CONFIG?.services : null;
    const fromCfg = s?.onboard || s?.merkleServer || s?.headstashServer;
    if (fromCfg && !String(fromCfg).includes('127.0.0.1')) return trimSlash(fromCfg);
  } catch {
    /* ignore */
  }
  return ONBOARD_PUBLIC_URL;
}

function statusUrls(base) {
  const b = trimSlash(base);
  if (!b) {
    return ['/status', '/onboard/status', '/v1/status'];
  }
  return [`${b}/onboard/status`, `${b}/status`, `${b}/v1/status`];
}

function grantUrl(base, purpose) {
  const path = purpose === 'mint' ? '/onboard/v1/mint-grant' : '/onboard/v1/register-grant';
  const b = trimSlash(base);
  if (!b) return path;
  return `${b}${path}`;
}

async function parseJsonRes(res) {
  const text = await res.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text };
  }
  return body;
}

export async function onboardStatus(base = onboardBase()) {
  let lastErr = null;
  for (const url of statusUrls(base)) {
    try {
      const res = await fetch(url, { cache: 'no-store' });
      const body = await parseJsonRes(res);
      if (!res.ok) {
        lastErr = new Error(body?.error || `onboard ${res.status}`);
        continue;
      }
      return { ...body, ok: true, skipped: false, endpoint: url };
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('onboard runtime unreachable');
}

async function postGrant(purpose, address, base = onboardBase()) {
  if (!address || !String(address).startsWith('terp1')) {
    throw new Error('expected terp1 grantee');
  }
  const url = grantUrl(base, purpose);
  const short = purpose === 'mint' ? '/v1/mint-grant' : '/v1/register-grant';
  const alt = trimSlash(base) ? `${trimSlash(base)}${short}` : short;
  const urls = url === alt ? [url] : [url, alt];
  let lastErr = null;
  for (const u of urls) {
    try {
      const res = await fetch(u, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ address, purpose }),
      });
      const body = await parseJsonRes(res);
      if (!res.ok) {
        lastErr = new Error(body?.error || `${purpose}-grant ${res.status}`);
        continue;
      }
      if (body?.skipped) {
        lastErr = new Error('onboard runtime skipped grant — not configured');
        continue;
      }
      return body;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error(`${purpose}-grant failed`);
}

/** Mint / CosmWasm execute gas only (No Rick, SVG mint). */
export async function requestMintGrant(address, base = onboardBase()) {
  return postGrant('mint', address, base);
}

/** Authenticator registration gas only (passkey / zk-jwt turnstile). */
export async function requestRegisterGrant(address, base = onboardBase()) {
  return postGrant('register', address, base);
}

/**
 * Probe runtime then allocate. Throws if the grant plane is down.
 * @param {'register'|'mint'} purpose
 */
export async function ensureScopedGrant(purpose, address, base = onboardBase()) {
  const st = await onboardStatus(base);
  const grant =
    purpose === 'mint'
      ? await requestMintGrant(address, base)
      : await requestRegisterGrant(address, base);
  return { status: st, grant };
}
