// lib/zkjwt-auth.js — Halo2 zk-jwt via dedicated Worker.
// On-chain: register_claim / authenticate with 128B public inputs + proof only.
// Never send credential_id, JWT, or assertion bytes.

import { createWasmWorkerHost } from '/lib/wasm-worker-host.js';

export const ISSUER = 'terp.network/passkey-zkjwt';
export const CIRCUIT_ID = 'zkjwt.passkey.flock.v1';

const ZKJWT_WORKER = '/lib/workers/zkjwt-wasm-worker.js';
const FLOCK_WORKER = '/lib/workers/flock-proof-worker.js';

let flockHost = null;

let host = null;
let wasmReady = false;

export async function loadZkJwtWasm() {
  if (wasmReady && host) return host;
  host = createWasmWorkerHost(ZKJWT_WORKER);
  await host.call('init');
  wasmReady = true;
  return host;
}

export async function loadFlockWorker() {
  if (flockHost) return flockHost;
  flockHost = createWasmWorkerHost(FLOCK_WORKER);
  await flockHost.call('init');
  return flockHost;
}

export function isZkJwtWasmReady() {
  return wasmReady;
}

function bytesFrom(instances) {
  if (instances instanceof Uint8Array) return instances;
  if (instances && instances.type === 'Buffer' && Array.isArray(instances.data)) {
    return new Uint8Array(instances.data);
  }
  return new Uint8Array(instances);
}

/** Drop any credential / jwt fields if glue ever emits them. */
export function sanitizeZkJwtMsg(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const drop = new Set([
    'credential_id',
    'credentialId',
    'jwt',
    'assertion',
    'jwt_nullifier_slot',
  ]);
  const walk = (v) => {
    if (!v || typeof v !== 'object') return v;
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    for (const [k, val] of Object.entries(v)) {
      if (drop.has(k)) continue;
      out[k] = walk(val);
    }
    return out;
  };
  return walk(obj);
}

export function authenticateMsg({ publicInputs, proofB64 }) {
  const pi = bytesFrom(publicInputs);
  return {
    authenticate: {
      public_inputs: Array.from(pi),
      proof: proofB64,
    },
  };
}

function b64FromBytes(u) {
  let s = '';
  const b = u instanceof Uint8Array ? u : new Uint8Array(u);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s);
}

/** SHA-256 of utf8 `s` — claim / msg_bind start-hash (not a raw credential prefix). */
export async function sha256Utf8(s) {
  const data = new TextEncoder().encode(String(s || ''));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return new Uint8Array(digest);
}

/**
 * 128-byte Flock PI: [nf 32][claim 32][root 32][msg_bind 32].
 * claim = SHA-256(issuer || 0x00 || credentialId); msg_bind = SHA-256(action).
 * Assertion stays local; Flock host verifies BLAKE3 of these public bytes.
 */
export async function flockInstancesFromPasskey({ credentialId, actionStr, issuer = ISSUER }) {
  const inst = new Uint8Array(128);
  const claim = await sha256Utf8(`${issuer}\0${credentialId || ''}`);
  const bind = await sha256Utf8(actionStr || '');
  inst.set(claim, 32);
  inst.set(bind, 96);
  return inst;
}

/**
 * Start-hash Flock + passkey ceremony. Assertion is local-only.
 * On-chain: 128B PI + FLCK proof + circuit_id zkjwt.passkey.flock.v1.
 */
export async function proveActionWithPasskeyZkJwt({
  authenticatePasskey,
  credentialId,
  rpId,
  account,
  actionJson,
}) {
  const actionStr = typeof actionJson === 'string' ? actionJson : JSON.stringify(actionJson);

  if (authenticatePasskey) {
    const assertion = await authenticatePasskey({
      challengeB64: btoa(actionStr).slice(0, 44),
      allowCredentialIds: credentialId ? [credentialId] : undefined,
      rpId,
    });
    if (!assertion) throw new Error('Passkey assertion cancelled');
  }

  const instBytes = await flockInstancesFromPasskey({ credentialId, actionStr });
  const fh = await loadFlockWorker();
  const flock = await fh.call('prove_flock', [Array.from(instBytes)]);
  const proofB64 = flock.proof_b64;
  const payload = sanitizeZkJwtMsg({
    issuer: ISSUER,
    claim_commitment: b64FromBytes(instBytes.slice(32, 64)),
    public_inputs: b64FromBytes(instBytes),
    proof: proofB64,
    circuit_id: CIRCUIT_ID,
  });

  return {
    payload,
    publicInputs: instBytes,
    proofVia: 'flock-blake3-worker',
    claimCommitment: payload.claim_commitment,
    account,
  };
}

export async function registerClaimMsgFromSecret(secret, issuer = ISSUER) {
  const claim = await sha256Utf8(`${issuer}\0${secret || ''}`);
  return sanitizeZkJwtMsg({
    register_claim: {
      claim_commitment: b64FromBytes(claim),
      issuer,
    },
  });
}

export function registerClaimMsg({ claimCommitmentB64, issuer = ISSUER }) {
  return {
    register_claim: {
      claim_commitment: claimCommitmentB64,
      issuer,
    },
  };
}

export function zkjwtContract(config) {
  return config?.contracts?.terpZkjwt || config?.terpZkjwt || '';
}

export function passkeyContract(config) {
  return config?.contracts?.terpPasskey || config?.terpPasskey || '';
}

export function buildZkJwtRegisterClaim({ claimCommitmentB64, issuer = ISSUER }) {
  return registerClaimMsg({ claimCommitmentB64, issuer });
}
