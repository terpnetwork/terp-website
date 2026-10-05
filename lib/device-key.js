// lib/device-key.js — a secp256k1 key kept in this browser, sealed by a passkey.
// The passkey never signs transactions: its PRF output unlocks (AES-GCM) a key that
// is registered on the account as a SignatureVerification authenticator. Same model
// as permissionless.money (lib/auth.js PRF salt + lib/browser-wallet.js seal), with a
// terp.network salt. Loaded only by the account panel.

const STORE = 'tn-device-keys-v1';
const SALT_LABEL = 'terp.network/device-key/v1';
const CJS = 'https://cdn.jsdelivr.net/npm/';

const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
const unb64 = (t) => Uint8Array.from(atob(String(t || '')), (c) => c.charCodeAt(0));

function read() {
  try {
    const j = JSON.parse(localStorage.getItem(STORE) || '[]');
    return Array.isArray(j) ? j : [];
  } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 12))); } catch { /* ignore */ }
}

/** Public rows only (no sealed material in the DOM). */
export function listDeviceKeys(account) {
  return read()
    .filter((r) => !account || r.account === account)
    .map(({ credentialId, label, rpId, account: acct, pubkey, address, createdAt }) => ({ credentialId, label, rpId, account: acct, pubkey, address, createdAt }));
}

export function forgetDeviceKey(credentialId) {
  write(read().filter((r) => r.credentialId !== credentialId));
}

/** Why device keys can't be made here, or '' when they can. */
export function deviceKeyBlocker() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials?.create) return 'This browser has no passkeys.';
  const h = location.hostname;
  if (!h || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return 'Passkeys need a named site. Open this page on terp.network.';
  return '';
}

async function salt() {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(SALT_LABEL)));
}
function prfOut(cred) {
  const first = cred?.getClientExtensionResults?.()?.prf?.results?.first;
  return first ? new Uint8Array(first) : null;
}
async function aesKey(prf) {
  if (!prf || prf.length < 32) throw new Error('The passkey did not return a usable secret.');
  return crypto.subtle.importKey('raw', prf.slice(0, 32), 'AES-GCM', false, ['encrypt', 'decrypt']);
}
const aad = (credentialId, pubkey) => new TextEncoder().encode(`${credentialId}|${pubkey}`);

async function assertPrf(credentialId) {
  const cred = await navigator.credentials.get({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rpId: location.hostname,
      allowCredentials: [{ type: 'public-key', id: unb64(credentialId) }],
      userVerification: 'required',
      timeout: 180000,
      extensions: { prf: { eval: { first: await salt() } } },
    },
  });
  return prfOut(cred);
}

async function hdWalletClass() {
  const mod = await import(`${CJS}@cosmjs/proto-signing@0.32.4/+esm`);
  const W = mod.DirectSecp256k1HdWallet || mod.default?.DirectSecp256k1HdWallet;
  if (!W) throw new Error('Could not load the signing library.');
  return W;
}

/**
 * Create a passkey, derive its PRF secret, generate a key and seal it.
 * Returns the public record, or null when the passkey prompt is cancelled.
 */
export async function createDeviceKey({ label = 'This device', account }) {
  const blocker = deviceKeyBlocker();
  if (blocker) throw new Error(blocker);
  let cred;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Terp Network', id: location.hostname },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: `terp-key-${Date.now().toString(36)}`, displayName: label },
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }, { type: 'public-key', alg: -257 }],
        authenticatorSelection: { residentKey: 'preferred', requireResidentKey: false, userVerification: 'required' },
        attestation: 'none',
        timeout: 180000,
        extensions: { prf: { eval: { first: await salt() } } },
      },
    });
  } catch (e) {
    if (e?.name === 'NotAllowedError') return null;
    throw e;
  }
  if (!cred) return null;
  const ext = cred.getClientExtensionResults?.() || {};
  if (ext.prf && ext.prf.enabled === false) throw new Error('This passkey cannot protect a key on this device. Try another browser or security key.');
  const credentialId = b64(new Uint8Array(cred.rawId));
  let prf = prfOut(cred);
  if (!prf) prf = await assertPrf(credentialId);
  if (!prf) throw new Error('This passkey cannot protect a key on this device. Try another browser or security key.');

  const W = await hdWalletClass();
  const wallet = await W.generate(24, { prefix: 'terp' });
  const [acc] = await wallet.getAccounts();
  const pubkey = b64(acc.pubkey);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: aad(credentialId, pubkey) }, await aesKey(prf), new TextEncoder().encode(wallet.mnemonic)));
  const rec = { credentialId, label, rpId: location.hostname, account, pubkey, address: acc.address, createdAt: new Date().toISOString(), sealed: { iv: b64(iv), ct: b64(ct) } };
  write([rec, ...read().filter((r) => r.credentialId !== credentialId)]);
  const { sealed, ...pub } = rec;
  return pub;
}

/** Ask for the passkey, unseal the key and return a direct signer for it. */
export async function unlockDeviceKey(credentialId) {
  const rec = read().find((r) => r.credentialId === credentialId);
  if (!rec?.sealed) throw new Error('That key is not stored in this browser.');
  const prf = await assertPrf(credentialId);
  if (!prf) throw new Error('The passkey did not unlock the key.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(rec.sealed.iv), additionalData: aad(credentialId, rec.pubkey) }, await aesKey(prf), unb64(rec.sealed.ct));
  const W = await hdWalletClass();
  return W.fromMnemonic(new TextDecoder().decode(plain), { prefix: 'terp' });
}
