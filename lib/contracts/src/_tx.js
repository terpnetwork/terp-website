// Minimal protobuf encoding for one job: a dry run of contract messages
// (POST /cosmos/tx/v1beta1/simulate). The transaction is not signed (the
// signature is empty) and is never broadcast; the node runs it to report gas
// or the error it would fail with.

import { utf8, b64, ChainQueryError } from './_lcd.js';

function varint(n) {
  let v = BigInt(n);
  const out = [];
  do {
    let b = Number(v & 0x7fn);
    v >>= 7n;
    if (v > 0n) b |= 0x80;
    out.push(b);
  } while (v > 0n);
  return out;
}
function cat(parts) {
  const len = parts.reduce((s, p) => s + p.length, 0);
  const out = new Uint8Array(len);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
const bytesField = (no, bytes) => cat([Uint8Array.from(varint((no << 3) | 2)), Uint8Array.from(varint(bytes.length)), bytes]);
const strField = (no, s) => (s ? bytesField(no, utf8(s)) : new Uint8Array(0));
const intField = (no, n) => (BigInt(n) ? Uint8Array.from([...varint(no << 3), ...varint(n)]) : new Uint8Array(0));

const coin = (c) => cat([strField(1, c.denom), strField(2, String(c.amount))]);
const any = (typeUrl, value) => cat([strField(1, typeUrl), bytesField(2, value)]);

/** MsgExecuteContract as a protobuf Any. */
export function executeAny({ sender, contract, msg, funds = [] }) {
  const value = cat([
    strField(1, sender),
    strField(2, contract),
    bytesField(3, utf8(JSON.stringify(msg))),
    ...funds.map((c) => bytesField(5, coin(c))),
  ]);
  return { typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract', value };
}

function unsignedTx({ messages, pubkey, sequence, gas, feeAmount }) {
  const body = cat(messages.map((m) => bytesField(1, any(m.typeUrl, m.value))));
  const pk = any('/cosmos.crypto.secp256k1.PubKey', bytesField(1, pubkey));
  const signer = cat([bytesField(1, pk), bytesField(2, bytesField(1, intField(1, 1))), intField(3, sequence)]);
  const fee = cat([...feeAmount.map((c) => bytesField(1, coin(c))), intField(2, gas)]);
  const auth = cat([bytesField(1, signer), bytesField(2, fee)]);
  return cat([bytesField(1, body), bytesField(2, auth), bytesField(3, new Uint8Array(64))]);
}

/** Account number, sequence and public key as the chain knows them (null if the account does not exist). */
export async function accountOf(rest, address) {
  const res = await fetch(`${String(rest).replace(/\/+$/, '')}/cosmos/auth/v1beta1/accounts/${address}`);
  if (res.status === 404) return null;
  const j = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (/not found/i.test(j.message || '')) return null;
    throw new ChainQueryError(j.message || `HTTP ${res.status}`, { status: res.status });
  }
  let a = j.account || {};
  for (let i = 0; i < 4 && !a.address; i++) a = a.base_account || a.base_vesting_account || a.account || {};
  return { address: a.address, accountNumber: Number(a.account_number || 0), sequence: Number(a.sequence || 0), pubkey: a.pub_key && a.pub_key.key ? a.pub_key.key : '' };
}

/**
 * Dry-run messages for `sender`. pubkey: base64 secp256k1 key, used when the
 * chain has not seen one for this account yet. Returns { gasUsed }.
 * Throws ChainQueryError with the node's reason when the run fails.
 */
export async function simulate(rest, { sender, messages, pubkey = '', gas = 2000000, feeDenom = 'uthiol' }) {
  const acc = await accountOf(rest, sender);
  if (!acc) throw new ChainQueryError(`account ${sender} not found`, { status: 404 });
  const key = acc.pubkey || pubkey;
  if (!key) throw new ChainQueryError('no public key for this account yet', { status: 400 });
  const pkBytes = Uint8Array.from(atob(key), (c) => c.charCodeAt(0));
  const tx = unsignedTx({ messages, pubkey: pkBytes, sequence: acc.sequence, gas, feeAmount: [{ denom: feeDenom, amount: '0' }] });
  const res = await fetch(`${String(rest).replace(/\/+$/, '')}/cosmos/tx/v1beta1/simulate`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_bytes: b64(tx) }),
  });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChainQueryError(j.message || `HTTP ${res.status}`, { status: res.status, code: j.code || 0 });
  return { gasUsed: Number((j.gas_info && j.gas_info.gas_used) || 0) };
}
