// lib/passkey-account.js — passkeys that sign Terp transactions themselves.
// Matches the terp-passkey authenticator contract (terp-rs
// contracts/smart-accounts/terp-passkey, ES256 verify, morocco-1 code 96):
//   instantiate { owner, registration: { origin, rp_id, credential_id, public_key } }
//   AuthenticationRequest.signature = JSON PasskeyAuthPayload
//     { origin, credential_id, assertion (r||s), authenticator_data, client_data_json }
//   clientDataJSON.challenge = base64url(SignDoc bytes)  (sign_mode_direct)
// One contract instance holds one passkey. It is created with instantiate2 so its
// address is known before the transaction and the same transaction can add it.
// Loaded only by the account panel.

const STORE = 'tn-chain-passkeys-v1';
const enc = new TextEncoder();
const subtle = () => globalThis.crypto.subtle;

export const b64 = (u8) => { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); };
export const unb64 = (t) => Uint8Array.from(atob(String(t || '')), (c) => c.charCodeAt(0));
export const b64url = (u8) => b64(u8).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const sha256 = async (u8) => new Uint8Array(await subtle().digest('SHA-256', u8));
const cat = (...parts) => {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
};
const hex = (h) => Uint8Array.from(String(h).match(/../g) || [], (x) => parseInt(x, 16));

// ── local list (public data only: nothing here can sign) ─────────────────

function read() {
  try { const j = JSON.parse(localStorage.getItem(STORE) || '[]'); return Array.isArray(j) ? j : []; } catch { return []; }
}
function write(list) {
  try { localStorage.setItem(STORE, JSON.stringify(list.slice(0, 24))); } catch { /* ignore */ }
}
export function listChainPasskeys(account) {
  return read().filter((r) => !account || r.account === account);
}
export function savePasskey(rec) {
  write([rec, ...read().filter((r) => !(r.credentialId === rec.credentialId && r.account === rec.account))]);
}
export function forgetChainPasskey(credentialId) {
  write(read().filter((r) => r.credentialId !== credentialId));
}

// Passkeys belong to terp.network: on terp.network (or a subdomain) the relying party is always terp.network.
export const TERP_RP_ID = 'terp.network';
export function passkeyRpId() {
  const h = location.hostname;
  return (h === TERP_RP_ID || h.endsWith('.' + TERP_RP_ID)) ? TERP_RP_ID : h;
}

export function passkeyBlocker() {
  if (typeof window === 'undefined' || !window.PublicKeyCredential || !navigator.credentials?.create) return 'This browser has no passkeys.';
  const h = location.hostname;
  if (!h || /^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(':')) return 'Passkeys need a named site. Open this page on terp.network.';
  return '';
}

// ── create ────────────────────────────────────────────────────────────────

/** 65-byte SEC1 point from the SPKI the browser returns for an ES256 credential. */
export async function spkiToRaw(spki) {
  const key = await subtle().importKey('spki', spki, { name: 'ECDSA', namedCurve: 'P-256' }, true, ['verify']);
  return new Uint8Array(await subtle().exportKey('raw', key));
}

/**
 * New ES256 passkey for this site. Returns the registration the contract stores
 * ({ origin, rpId, credentialId, publicKey } as base64), or null if cancelled.
 */
export async function createPasskey({ label = 'Terp passkey', userName } = {}) {
  const blocker = passkeyBlocker();
  if (blocker) throw new Error(blocker);
  let cred;
  try {
    cred = await navigator.credentials.create({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        rp: { name: 'Terp Network', id: passkeyRpId() },
        user: { id: crypto.getRandomValues(new Uint8Array(16)), name: userName || `terp-${Date.now().toString(36)}`, displayName: label },
        // The contract verifies P-256 only, so ask for ES256 and nothing else.
        pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
        authenticatorSelection: { residentKey: 'preferred', requireResidentKey: false, userVerification: 'required' },
        attestation: 'none',
        timeout: 180000,
      },
    });
  } catch (e) {
    if (e?.name === 'NotAllowedError') return null;
    throw e;
  }
  if (!cred) return null;
  const r = cred.response;
  if (typeof r.getPublicKeyAlgorithm === 'function' && r.getPublicKeyAlgorithm() !== -7) throw new Error('This passkey does not use P-256 (ES256).');
  const spki = typeof r.getPublicKey === 'function' ? r.getPublicKey() : null;
  if (!spki) throw new Error('This browser does not expose the passkey’s public key. Try a current Chrome, Safari or Firefox.');
  return {
    label,
    origin: location.origin,
    rpId: passkeyRpId(),
    credentialId: b64(new Uint8Array(cred.rawId)),
    publicKey: b64(await spkiToRaw(spki)),
    createdAt: new Date().toISOString(),
  };
}

// ── contract messages ────────────────────────────────────────────────────

/** terp-passkey InstantiateMsg. Binary fields are standard base64 (cosmwasm Binary). */
export function passkeyInstantiate(owner, pk) {
  return { owner, registration: { origin: pk.origin, rp_id: pk.rpId, credential_id: pk.credentialId, public_key: pk.publicKey } };
}

/** CosmwasmAuthenticatorV1 params. The contract only needs them non-empty; they label the entry. */
export function passkeyAuthParams(pk) {
  return { credential_id: pk.credentialId, rp_id: pk.rpId };
}

/** Salt for instantiate2: one passkey contract per (account, credential). */
export async function passkeySalt(account, credentialId) {
  return (await sha256(enc.encode(`terp-passkey/v1|${account}|${credentialId}`))).slice(0, 16);
}

// ── instantiate2 address (wasmd BuildContractAddressPredictable, fix_msg=false) ──

const CHARSET = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >> i) & 1) chk ^= G[i];
  }
  return chk;
}
const hrpExpand = (hrp) => [...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31)];
function convert(data, from, to, pad) {
  let acc = 0, bits = 0; const out = []; const max = (1 << to) - 1;
  for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & max); } }
  if (pad && bits) out.push((acc << (to - bits)) & max);
  else if (!pad && (bits >= from || ((acc << (to - bits)) & max))) throw new Error('bad bech32 padding');
  return out;
}
export function bech32Encode(hrp, bytes) {
  const data = convert(bytes, 8, 5, true);
  const pm = polymod([...hrpExpand(hrp), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  const chk = [0, 1, 2, 3, 4, 5].map((i) => (pm >> (5 * (5 - i))) & 31);
  return `${hrp}1${[...data, ...chk].map((d) => CHARSET[d]).join('')}`;
}
export function bech32Decode(addr) {
  const s = String(addr).toLowerCase();
  const p = s.lastIndexOf('1');
  const hrp = s.slice(0, p);
  const data = [...s.slice(p + 1)].map((c) => CHARSET.indexOf(c));
  if (data.some((d) => d < 0) || polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error('Invalid address');
  return { hrp, bytes: Uint8Array.from(convert(data.slice(0, -6), 5, 8, false)) };
}
const u64be = (n) => { const b = new Uint8Array(8); new DataView(b.buffer).setBigUint64(0, BigInt(n)); return b; };

export async function instantiate2Address(checksumHex, creator, salt, prefix = 'terp') {
  const checksum = hex(checksumHex);
  const { bytes: c } = bech32Decode(creator);
  const key = cat(enc.encode('wasm'), Uint8Array.of(0), u64be(checksum.length), checksum, u64be(c.length), c, u64be(salt.length), salt, u64be(0));
  const addr = await sha256(cat(await sha256(enc.encode('module')), key));
  return bech32Encode(prefix, addr);
}

// ── signing ───────────────────────────────────────────────────────────────

const N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const big = (u8) => BigInt(`0x${[...u8].map((x) => x.toString(16).padStart(2, '0')).join('') || '0'}`);
const be32 = (n) => hex(n.toString(16).padStart(64, '0'));

/** WebAuthn ES256 signatures are ASN.1 DER. Return 64-byte r||s with low S. */
export function derToLowS(der) {
  let rs;
  if (der.length === 64) rs = der;
  else {
    if (der[0] !== 0x30 || der[1] & 0x80) throw new Error('Unexpected passkey signature format.');
    let i = 2;
    const int = () => {
      if (der[i++] !== 0x02) throw new Error('Unexpected passkey signature format.');
      const len = der[i++];
      let v = der.slice(i, i + len); i += len;
      while (v.length > 32 && v[0] === 0) v = v.slice(1);
      if (v.length > 32) throw new Error('Unexpected passkey signature format.');
      return cat(new Uint8Array(32 - v.length), v);
    };
    rs = cat(int(), int());
  }
  let s = big(rs.slice(32));
  if (s > N / 2n) s = N - s;
  return cat(rs.slice(0, 32), be32(s));
}

/** PasskeyAuthPayload bytes (the transaction signature) from a WebAuthn assertion. */
export function assertionPayload(pk, assertion) {
  const r = assertion.response;
  return enc.encode(JSON.stringify({
    origin: pk.origin,
    credential_id: pk.credentialId,
    assertion: b64(derToLowS(new Uint8Array(r.signature))),
    authenticator_data: b64(new Uint8Array(r.authenticatorData)),
    client_data_json: b64(new Uint8Array(r.clientDataJSON)),
  }));
}

/** Ask the passkey to sign SignDoc bytes. The challenge is the SignDoc itself. */
export async function signWithPasskey(pk, signDocBytes) {
  if (pk.rpId !== passkeyRpId()) throw new Error(`This passkey belongs to ${pk.rpId}. Open that site to use it.`);
  const assertion = await navigator.credentials.get({
    publicKey: {
      challenge: signDocBytes,
      rpId: pk.rpId,
      allowCredentials: [{ type: 'public-key', id: unb64(pk.credentialId) }],
      userVerification: 'required',
      timeout: 180000,
    },
  });
  if (!assertion) throw new Error('Cancelled.');
  return assertionPayload(pk, assertion);
}
