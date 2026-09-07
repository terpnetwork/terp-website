// lib/norick.js — No-Rick Halo2 client. WASM lives in norick-wasm-worker only.

import { createWasmWorkerHost } from '/lib/wasm-worker-host.js';

const NORICK_WORKER = '/lib/workers/norick-wasm-worker.js';

let host = null;
let wasmReady = false;

export async function loadWasm() {
  if (wasmReady && host) return host;
  try {
    host = createWasmWorkerHost(NORICK_WORKER);
    await host.call('init');
    wasmReady = true;
    return host;
  } catch (e) {
    console.warn('norick-wasm not available', e);
    host = null;
    wasmReady = false;
    return null;
  }
}

export function isWasmReady() {
  return wasmReady;
}

export async function generateProof(secretWord, forbidden) {
  if (!wasmReady) throw new Error('WASM not loaded');
  return host.call('generate_proof', [secretWord, forbidden]);
}

export async function encodeInstances(forbidden) {
  if (!wasmReady) throw new Error('WASM not loaded');
  return host.call('encode_instances', [forbidden]);
}

export async function encodeProofMsg(cid, forbidden, proofB64) {
  if (wasmReady) {
    try {
      const raw = await host.call('encode_proof_msg', [cid, forbidden, proofB64]);
      const o = JSON.parse(raw);
      if (o.proove_and_mint) return raw;
      if (o.proove) return JSON.stringify({ proove_and_mint: o.proove });
    } catch {
      /* fall through */
    }
  }
  return JSON.stringify({
    proove_and_mint: { cid: Number(cid), forbidden, proof: proofB64 },
  });
}

export async function strToFieldHex(s) {
  if (!wasmReady) throw new Error('WASM not loaded');
  return host.call('str_to_field_hex', [s]);
}
