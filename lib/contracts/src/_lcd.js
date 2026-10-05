// Read access to CosmWasm contracts over the chain's REST (LCD) API.
//
// Smart queries run the contract. Raw reads fetch one stored value by key and
// never run contract code, so they keep working when a smart query fails
// inside the VM: terpd 6.2.0 returns "invalid prefixIterator" for contract
// calls that walk a storage prefix (fixed in 6.2.1).

export const utf8 = (s) => new TextEncoder().encode(s);
export const fromUtf8 = (b) => new TextDecoder().decode(b);

export function b64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
export function fromB64(s) {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
export const fromHex = (h) => Uint8Array.from(h.match(/../g) || [], (x) => parseInt(x, 16));
export const jsonOf = (bytes) => JSON.parse(fromUtf8(bytes));

const trim = (u) => String(u || '').replace(/\/+$/, '');

export class ChainQueryError extends Error {
  constructor(message, { status = 0, code = 0 } = {}) {
    super(message);
    this.name = 'ChainQueryError';
    this.status = status;
    this.code = code;
    /** The node could not finish a storage prefix scan (terpd 6.2.0). */
    this.prefixScan = /invalid prefixIterator/i.test(message);
    /** The contract answered that the key or token does not exist. */
    this.notFound = /not found/i.test(message);
  }
}

export const isPrefixScanError = (e) => !!(e && (e.prefixScan || /invalid prefixIterator/i.test(e.message || '')));

async function getJson(url, signal) {
  let res;
  try {
    res = await fetch(url, { signal, headers: { accept: 'application/json' } });
  } catch (e) {
    if (e && e.name === 'AbortError') throw e;
    throw new ChainQueryError('The network API could not be reached', { status: 0 });
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ChainQueryError(body.message || `HTTP ${res.status}`, { status: res.status, code: body.code || 0 });
  return body;
}

/** Smart query: runs the contract's query entry point. */
export async function smart(rest, contract, msg, { signal } = {}) {
  const q = encodeURIComponent(b64(utf8(JSON.stringify(msg))));
  const body = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/smart/${q}`, signal);
  return body.data;
}

/** Raw read of one storage key. Returns the value bytes, or null when the key is empty. */
export async function raw(rest, contract, key, { signal } = {}) {
  const k = encodeURIComponent(b64(typeof key === 'string' ? utf8(key) : key));
  const body = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/raw/${k}`, signal);
  return body.data ? fromB64(body.data) : null;
}

/** Raw JSON value (cw-storage-plus stores JSON), or null. */
export async function rawJson(rest, contract, key, opts) {
  const v = await raw(rest, contract, key, opts);
  return v && v.length ? jsonOf(v) : null;
}

/** Every stored key/value of a contract, paginated (raw, no contract code runs). */
export async function allState(rest, contract, { limit = 100, max = 5000, signal } = {}) {
  const out = [];
  let next = '';
  do {
    const qs = `pagination.limit=${limit}` + (next ? `&pagination.key=${encodeURIComponent(next)}` : '');
    const body = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/state?${qs}`, signal);
    for (const m of body.models || []) out.push({ key: fromHex(m.key), value: fromB64(m.value) });
    next = body.pagination && body.pagination.next_key;
  } while (next && out.length < max);
  return out;
}

/** cw-storage-plus key for Map `ns` (one key part): u16 length prefix + namespace + key. */
export function mapKey(ns, key) {
  const n = utf8(ns), k = typeof key === 'string' ? utf8(key) : key;
  const out = new Uint8Array(2 + n.length + k.length);
  out[0] = n.length >> 8; out[1] = n.length & 255;
  out.set(n, 2); out.set(k, 2 + n.length);
  return out;
}

/** Entries of Map `ns` from a full state dump: [{ key: Uint8Array (map key), value }]. */
export function mapEntries(state, ns) {
  const p = mapKey(ns, new Uint8Array(0));
  return state.filter(({ key }) => key.length > p.length && p.every((b, i) => key[i] === b))
    .map(({ key, value }) => ({ key: key.subarray(p.length), value }));
}

/** Contract metadata from the chain (code id, label, admin). */
export async function contractInfo(rest, contract, opts = {}) {
  const body = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}`, opts.signal);
  const i = body.contract_info || {};
  return { address: contract, codeId: Number(i.code_id || 0), label: i.label || '', admin: i.admin || '', creator: i.creator || '' };
}
