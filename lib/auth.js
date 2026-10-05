// auth.js — Passkey (WebAuthn) + shared Keplr bridge for terp.network
//
// Uses pkg/passkey_wasm (wasm-bindgen) for:
//   generate_challenge, build_create_options, build_get_options,
//   encode_attestation, encode_assertion
//
// Privacy design (production):
// - RP ID = effective domain only (location.hostname); never a third-party origin.
// - userName / displayName default to opaque random IDs — no email/phone/real name.
// - user.id = random 32 bytes; not linkable to legal identity.
// - Private keys never leave the platform authenticator (WebAuthn); WASM only
//   builds PublicKeyCredential options and base64-encodes responses.
// - We only persist credential_id (+ optional public meta) in session/local
//   storage under a site-scoped key — no seed phrases, no raw private keys.
// - Prefer resident keys only when the user opts in (discoverable credential).

import {
  buildAuthExtension,
  prepareAuthAction,
  prepareRegisterAuthenticatorMsg,
  attachNonCriticalAuthExtension,
} from '/lib/auth-extension.js';
import { createWasmWorkerHost } from '/lib/wasm-worker-host.js';
import { ensureBrowserWallet, peekBrowserWalletAddress } from '/lib/browser-wallet.js';

const PASSKEY_STORE = 'terp-passkeys-v1';
const PASSKEY_WORKER = '/lib/workers/passkey-wasm-worker.js';

let _host = null;
let _wasmReady = false;

function b64urlToBuffer(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const b64s = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64s);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out.buffer;
}

function bufferToB64(buf) {
  const bytes = buf instanceof ArrayBuffer ? new Uint8Array(buf) : new Uint8Array(buf.buffer || buf);
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

function randomOpaqueId(bytes = 16) {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => b.toString(16).padStart(2, '0')).join('');
}

/** Effective RP ID for this deployment (hostname only — no ports). */
export function resolveRpId(override) {
  if (override) return String(override).replace(/^https?:\/\//, '').split('/')[0];
  if (typeof location === 'undefined') return 'terp.network';
  const h = location.hostname;
  // Local dev: browsers require localhost for WebAuthn without HTTPS tricks
  if (h === 'localhost' || h === '127.0.0.1') return h;
  // Production / staging
  if (h.endsWith('terp.network')) return h === 'www.terp.network' ? 'terp.network' : h;
  return h;
}

/** Load passkey WASM in its own Worker (never on window). */
export async function loadWasm() {
  if (_wasmReady && _host) return true;
  try {
    _host = createWasmWorkerHost(PASSKEY_WORKER);
    await _host.call('init');
    _wasmReady = true;
    return true;
  } catch (e) {
    console.warn('[auth] passkey wasm worker failed', e?.message || e);
    _host = null;
    _wasmReady = false;
    return false;
  }
}

export function isWasmReady() {
  return _wasmReady;
}

export function getWasm() {
  if (!_host) return null;
  return {
    generate_challenge: () => _host.call('generate_challenge'),
    build_create_options: (...a) => _host.call('build_create_options', a),
    build_get_options: (...a) => _host.call('build_get_options', a),
    encode_attestation: (...a) => _host.call('encode_attestation', a),
    encode_assertion: (...a) => _host.call('encode_assertion', a),
  };
}

function readPasskeyStore() {
  try {
    return JSON.parse(localStorage.getItem(PASSKEY_STORE) || '{"credentials":[]}');
  } catch {
    return { credentials: [] };
  }
}

function writePasskeyStore(data) {
  try {
    localStorage.setItem(PASSKEY_STORE, JSON.stringify(data));
  } catch (e) {
    console.warn('[auth] passkey store write failed', e);
  }
}

/** List locally registered passkey metadata (no secrets). */
export function listLocalPasskeys() {
  return readPasskeyStore().credentials || [];
}

/** Forget one passkey in this browser's list (the credential itself stays on the device). */
export function removeLocalPasskey(credentialId) {
  const store = readPasskeyStore();
  const before = (store.credentials || []).length;
  store.credentials = (store.credentials || []).filter((c) => c.credentialId !== credentialId);
  writePasskeyStore(store);
  return store.credentials.length < before;
}

export function clearLocalPasskeys() {
  try {
    localStorage.removeItem(PASSKEY_STORE);
  } catch {
    /* ignore */
  }
}

/**
 * Register a platform passkey for this origin.
 * @param {{
 *   label?: string,
 *   displayName?: string,
 *   rpName?: string,
 *   rpId?: string,
 *   discoverable?: boolean,
 * }} [opts]
 * @returns {Promise<{ credentialId: string, label: string, rpId: string, attestation?: object }|null>}
 */
export async function registerPasskey(opts = {}) {
  const ok = await loadWasm();
  if (!ok || !_host) throw new Error('Passkey WASM unavailable');

  const rpId = resolveRpId(opts.rpId);
  const rpName = opts.rpName || 'Terp Network';
  // Opaque identifiers — do not use email or legal names by default
  const opaqueUser = opts.userName || `terp-${randomOpaqueId(8)}`;
  const displayName = opts.displayName || opts.label || 'Terp passkey';
  const userIdBytes = new Uint8Array(32);
  crypto.getRandomValues(userIdBytes);
  const userIdB64 = bufferToB64(userIdBytes);

  const challengeB64 = await _host.call('generate_challenge');
  const publicKey = await _host.call('build_create_options', [
    rpId,
    rpName,
    userIdB64,
    opaqueUser,
    displayName,
    challengeB64,
  ]);

  // Normalize ArrayBuffers if wasm returned base64 fields (defensive)
  if (publicKey.challenge && typeof publicKey.challenge === 'string') {
    publicKey.challenge = b64urlToBuffer(publicKey.challenge);
  }
  if (publicKey.user?.id && typeof publicKey.user.id === 'string') {
    publicKey.user.id = b64urlToBuffer(publicKey.user.id);
  }

  // Privacy: discourage unnecessary attestation conveyance of device model
  publicKey.attestation = publicKey.attestation || 'none';
  if (opts.discoverable === false && publicKey.authenticatorSelection) {
    publicKey.authenticatorSelection.residentKey = 'discouraged';
    publicKey.authenticatorSelection.requireResidentKey = false;
  }

  let credential;
  try {
    credential = await navigator.credentials.create({ publicKey });
  } catch (err) {
    if (err?.name === 'NotAllowedError') return null;
    throw err;
  }
  if (!credential) return null;

  const attObj = new Uint8Array(credential.response.attestationObject);
  const clientData = new Uint8Array(credential.response.clientDataJSON);
  let encoded = null;
  try {
    encoded = await _host.call('encode_attestation', [attObj, clientData]);
  } catch (e) {
    console.warn('[auth] encode_attestation', e);
  }

  const credentialId = bufferToB64(credential.rawId);
  const label = opts.label || displayName;
  const record = {
    credentialId,
    label,
    rpId,
    createdAt: new Date().toISOString(),
    // Never store private key material
  };

  const store = readPasskeyStore();
  store.credentials = [
    record,
    ...(store.credentials || []).filter((c) => c.credentialId !== credentialId),
  ].slice(0, 16);
  writePasskeyStore(store);

  return {
    credentialId,
    label,
    rpId,
    opaqueUser,
    attestation: encoded,
    registerMsg: prepareRegisterAuthenticatorMsg({
      label,
      credentialId,
      rpId,
    }),
  };
}

/**
 * Authenticate with an existing passkey (assertion).
 * @param {{ challengeB64?: string, allowCredentialIds?: string[], rpId?: string }} [opts]
 */
export async function authenticatePasskey(opts = {}) {
  const ok = await loadWasm();
  if (!ok || !_host) throw new Error('Passkey WASM unavailable');

  const rpId = resolveRpId(opts.rpId);
  const challengeB64 = opts.challengeB64 || (await _host.call('generate_challenge'));
  const allowed =
    opts.allowCredentialIds ||
    listLocalPasskeys().map((c) => c.credentialId).filter(Boolean);

  const publicKey = await _host.call('build_get_options', [
    rpId,
    challengeB64,
    JSON.stringify(allowed || []),
  ]);
  if (publicKey.challenge && typeof publicKey.challenge === 'string') {
    publicKey.challenge = b64urlToBuffer(publicKey.challenge);
  }
  if (Array.isArray(publicKey.allowCredentials)) {
    publicKey.allowCredentials = publicKey.allowCredentials.map((c) => ({
      ...c,
      id: typeof c.id === 'string' ? b64urlToBuffer(c.id) : c.id,
    }));
  }

  let assertion;
  try {
    assertion = await navigator.credentials.get({ publicKey });
  } catch (err) {
    if (err?.name === 'NotAllowedError') return null;
    throw err;
  }
  if (!assertion) return null;

  const authData = new Uint8Array(assertion.response.authenticatorData);
  const clientData = new Uint8Array(assertion.response.clientDataJSON);
  const signature = new Uint8Array(assertion.response.signature);
  let encoded = null;
  try {
    encoded = await _host.call('encode_assertion', [authData, clientData, signature]);
  } catch (e) {
    console.warn('[auth] encode_assertion', e);
  }

  const credentialId = bufferToB64(assertion.rawId);
  return {
    credential_id: credentialId,
    signature_b64: encoded?.signature || bufferToB64(signature),
    authenticator_data: encoded?.authenticator_data || bufferToB64(authData),
    client_data_json: encoded?.client_data_json || bufferToB64(clientData),
    claim: {
      label: 'passkey',
      type: 'webauthn',
      credentialId,
      signature: encoded?.signature || bufferToB64(signature),
      authenticatorData: encoded?.authenticator_data || bufferToB64(authData),
      clientDataJSON: encoded?.client_data_json || bufferToB64(clientData),
    },
  };
}

/**
 * Connect Keplr — thin wrapper over shared wallet.js (cosmes).
 */
export async function connectKeplr(chainConfig, cosmesChainInfo) {
  const TerpWallet = await import('/lib/wallet.js');
  const cfg = {
    ...chainConfig,
    cosmesChainInfo: cosmesChainInfo || chainConfig.cosmesChainInfo,
  };
  await TerpWallet.ensureLibs(cfg);
  const snap = await TerpWallet.connect(cfg, { provider: 'keplr' });
  const st = TerpWallet.getState();
  return {
    wallet: st.wallet,
    address: snap.address,
    controller: st.controller,
  };
}

/**
 * Prepare signing material: for passkey, attach non-critical auth extension.
 * For keplr, return body unchanged (cosmes signs).
 */
export async function signTx(txBody, signerType = 'keplr', opts = {}) {
  if (signerType === 'passkey' || signerType === 'webauthn') {
    const assertion = await authenticatePasskey(opts);
    if (!assertion) throw new Error('Passkey authentication failed');
    const extension = buildAuthExtension([assertion.claim], {
      account: opts.account || null,
    });
    return attachNonCriticalAuthExtension(txBody || {}, extension);
  }
  return txBody;
}

/**
 * Register passkey and optionally prepare smart-account register msg.
 */
function bytesToHex(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  return Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function registerPasskeyForAccount(config, opts = {}) {
  const reg = await registerPasskey(opts);
  if (!reg) return null;
  const prefix = config?.bech32Prefix || 'terp';
  const bw = await ensureBrowserWallet({ prefix });
  const accounts = await bw.wallet.getAccounts();
  const pubkeyBytes = accounts?.[0]?.pubkey;
  const publicKeyHex = pubkeyBytes ? bytesToHex(pubkeyBytes) : '';
  const action = prepareAuthAction({
    mode: 'register',
    config: config || {},
    claim: {
      label: reg.label,
      type: 'passkey_secp256k1',
      credentialId: reg.credentialId,
      publicKey: publicKeyHex,
      params: {
        rp_id: reg.rpId,
        secp256k1_public_key: publicKeyHex,
        browser_address: bw.address,
      },
    },
  });
  return {
    ...reg,
    secp256k1: { publicKeyHex, address: bw.address, reused: !bw.created },
    onChain: action,
  };
}

export { peekBrowserWalletAddress };

export {
  buildAuthExtension,
  prepareAuthAction,
  prepareRegisterAuthenticatorMsg,
  attachNonCriticalAuthExtension,
};
