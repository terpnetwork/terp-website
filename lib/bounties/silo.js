// r3: staked upload through the silo-auth adapter (no IPFS pinning needed).
// OPEN-4 settled: submission docs store via stake path (authorize + PUT with X-Silo-Ticket) on s3.terp.network.
// OPEN-7: if prove() cannot build ABCI KvProofs from the public RPC, surface it — never invent proofs.
// OPEN-5: prefer Keplr for signArbitrary; Zafu is experimental/unverified.
// intent.bounty_ref is always "<escrow bech32>/<id>" (catalog bounty_ref is separate).
//
// What happens, in order (spec: silo-auth crate src/gate.rs, rules.rs EscrowUpload, intent.rs):
//   1. GET  <silo>/v1/client           newest root height the adapter trusts (proof_height)
//   2. abci_query prove=true at that height, read-only, public RPC:
//        wasm  0x03|escrow|"config"                         -> min_upload_stake (proven, not typed in)
//        wasm  0x03|escrow|cw_map_key("bounties", u64be id) -> status open|assigned, expires_at
//        staking 0x31|del|val  and  0x21|val  per validator (at most 16) -> stake
//      The page decodes the same values and shows "staked X ≥ min Y" before anything is signed.
//   3. UploadIntent (keys sorted, no spaces) signed with the browser wallet's signArbitrary (ADR-36).
//      The key never leaves the wallet. Nothing is broadcast: this is an off-chain signature.
//   4. POST <silo>/v1/authorize {intent, pubkey, signature, proofs}  -> {ticket, ticket_b64}
//   5. PUT  <silo>/v1/upload  X-Silo-Ticket: ticket_b64, body = the exact bytes -> 201 stored | 202 dry run
// The adapter stores the file under quarantine/<escrow>_<id>/<sha256>; moving it to the public cid/ prefix is a
// separate reviewed step, so the CID is filled in from the bytes the page hashed (same as the manual path).
//
// Base URL: config.json chains[<id>].bounties.silo (or, when that key is absent, the detailsBase origin + "/silo").
// Bucket: bounties.siloBucket (default "bounties", the adapter's allowed_buckets placeholder).
// Store names: bounties.siloLayout "b3" (terpd 6.4.x stores b3-wasm / b3-staking, default) or "plain".

// bech32 (BIP-173) decode, data part only; self-contained so this module loads without the board code
const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v) { let c = 1; for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i]; } return c; }
export function bech32Bytes(s) {
  const str = String(s).toLowerCase(), p = str.lastIndexOf('1');
  if (p < 1 || str.length > 120) throw new Error('bad address');
  const hrp = str.slice(0, p), data = [...str.slice(p + 1)].map((c) => { const i = CS.indexOf(c); if (i < 0) throw new Error('bad address'); return i; });
  if (polymod([...[...hrp].map((c) => c.charCodeAt(0) >> 5), 0, ...[...hrp].map((c) => c.charCodeAt(0) & 31), ...data]) !== 1) throw new Error('bad address checksum');
  let acc = 0, bits = 0; const out = [];
  for (const v of data.slice(0, -6)) { acc = (acc << 5) | v; bits += 5; if (bits >= 8) { bits -= 8; out.push((acc >> bits) & 255); } }
  return Uint8Array.from(out);
}

export const DOMAIN = 'silo-auth/v1/upload';
export const MAX_VALIDATORS = 16;
const TTL_SECS = 600;

const hex = (u8) => [...u8].map((x) => x.toString(16).padStart(2, '0')).join('');
const unhex = (h) => Uint8Array.from((String(h).match(/../g) || []).map((x) => parseInt(x, 16)));
const b64ToU8 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const u8ToB64 = (u8) => { let s = ''; for (const x of u8) s += String.fromCharCode(x); return btoa(s); };
const cat = (...a) => { const o = new Uint8Array(a.reduce((n, x) => n + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
const utf8 = (s) => new TextEncoder().encode(s);
const addr = (b) => bech32Bytes(b);

export function siloConfig(live) {
  const b = (live && live.chainCfg && live.chainCfg.bounties) || {};
  let base = typeof b.silo === 'string' ? b.silo : '';
  if (!base && live && live.detailsBase) { try { base = new URL(live.detailsBase).origin + '/silo'; } catch { base = ''; } }
  return {
    base: base.replace(/\/+$/, ''),
    bucket: b.siloBucket || 'bounties',
    layout: b.siloLayout === 'plain' ? 'plain' : 'b3',
    rpc: String((live && live.chainCfg && live.chainCfg.rpc) || '').replace(/\/+$/, ''),
    rest: String((live && live.rest) || '').replace(/\/+$/, ''),
    fromConfig: typeof b.silo === 'string' && !!b.silo,
  };
}

// ── keys (rules.rs, staking.rs) ─────────────────────────────────────────────────────────────────────
export const wasmKey = (contract, key) => cat(Uint8Array.of(0x03), addr(contract), key);
export function cwMapKey(ns, k) { const n = utf8(ns); return cat(Uint8Array.of(n.length >> 8, n.length & 255), n, k); }
export function u64be(id) { const o = new Uint8Array(8); let v = BigInt(id); for (let i = 7; i >= 0; i--) { o[i] = Number(v & 255n); v >>= 8n; } return o; }
export function delegationKey(del, val) { const d = addr(del), v = addr(val); return cat(Uint8Array.of(0x31, d.length), d, Uint8Array.of(v.length), v); }
export function validatorKey(val) { const v = addr(val); return cat(Uint8Array.of(0x21, v.length), v); }
const storeName = (mod, layout) => (layout === 'plain' ? mod : 'b3-' + mod);

// ── protobuf (only the string/varint fields the rule reads) ─────────────────────────────────────────
function pbFields(u8) {
  const out = {}; let i = 0;
  const varint = () => { let r = 0n, s = 0n; for (;;) { const b = u8[i++]; if (b === undefined) throw new Error('protobuf: truncated'); r |= BigInt(b & 127) << s; if (!(b & 128)) return r; s += 7n; } };
  while (i < u8.length) {
    const tag = Number(varint()), f = tag >> 3, w = tag & 7;
    if (w === 0) out[f] = varint();
    else if (w === 2) { const n = Number(varint()); out[f] = u8.subarray(i, i + n); i += n; }
    else if (w === 1) i += 8; else if (w === 5) i += 4; else throw new Error('protobuf: wire type ' + w);
  }
  return out;
}
const pbStr = (v) => (v instanceof Uint8Array ? new TextDecoder().decode(v) : '');
export function decodeDelegation(u8) { const f = pbFields(u8); return { delegator_address: pbStr(f[1]), validator_address: pbStr(f[2]), shares: pbStr(f[3]) }; }
export function decodeValidator(u8) { const f = pbFields(u8); return { operator_address: pbStr(f[1]), tokens: pbStr(f[5]), delegator_shares: pbStr(f[6]) }; }
/** LegacyDec -> 1e18-scaled BigInt ("123" raw form or "1.5" human form), as staking.rs parse_dec */
export function parseDec(s) {
  const [i, f = null] = String(s).split('.');
  if (f === null) { if (!/^\d+$/.test(i)) throw new Error('bad dec'); return BigInt(i); }
  if (f.length > 18 || !/^\d*$/.test(f) || !/^\d+$/.test(i)) throw new Error('bad dec');
  return BigInt(i + f.padEnd(18, '0'));
}
/** floor(shares * tokens / delegator_shares) */
export function delegatedTokens(d, v) { const tot = parseDec(v.delegator_shares); return tot === 0n ? 0n : (parseDec(d.shares) * BigInt(v.tokens || '0')) / tot; }

// ── reads ───────────────────────────────────────────────────────────────────────────────────────────
async function getJson(url, ms = 12000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Object.assign(new Error((j && j.error) || 'HTTP ' + r.status), { status: r.status });
    return j;
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'took too long to answer' : e.message); }
  finally { clearTimeout(t); }
}
export async function healthz(base) { try { const j = await getJson(base + '/healthz', 6000); return !!(j && j.ok); } catch { return false; } }
export async function trustedHeight(base) { const j = await getJson(base + '/v1/client'); const h = Number(j && j.latest_root_height); if (!(h > 0)) throw new Error('the upload service has no trusted block yet'); return h; }
export async function abciProof(rpc, store, key, height) {
  const j = await getJson(`${rpc}/abci_query?path=%22/store/${store}/key%22&data=0x${hex(key)}&prove=true&height=${height}`);
  const r = j && j.result && j.result.response;
  if (!r || (r.code || 0) !== 0 || !r.value) throw Object.assign(new Error(`nothing stored at that key at block ${height}`), { code: 'absent' });
  const ops = ((r.proofOps || r.proof_ops) || {}).ops || [];
  if (ops.length !== 2 || ops[0].type !== 'ics23:iavl' || ops[1].type !== 'ics23:simple') throw new Error('unexpected proof shape');
  return { key: hex(key), value: hex(b64ToU8(r.value)), store_proof: hex(b64ToU8(ops[0].data)), multistore_proof: hex(b64ToU8(ops[1].data)) };
}
export async function validatorsOf(rest, delegator) {
  const j = await getJson(`${rest}/cosmos/staking/v1beta1/delegations/${delegator}?pagination.limit=200`);
  return (j.delegation_responses || []).slice().sort((a, b) => (BigInt(b.balance.amount) > BigInt(a.balance.amount) ? 1 : -1))
    .map((r) => r.delegation.validator_address).slice(0, MAX_VALIDATORS);
}

/** Read and prove everything the adapter will check; decode it here too so the page can say yes/no first. */
export async function prove({ cfg, escrow, bountyId, delegator, height, validators }) {
  const vals = validators || await validatorsOf(cfg.rest, delegator);
  if (!vals.length) return { ok: false, code: 'nostake', staked: 0n, min: null, vals, height, proofs: [] };
  const W = storeName('wasm', cfg.layout), S = storeName('staking', cfg.layout);
  const jobs = [abciProof(cfg.rpc, W, wasmKey(escrow, utf8('config')), height), abciProof(cfg.rpc, W, wasmKey(escrow, cwMapKey('bounties', u64be(bountyId))), height)];
  for (const v of vals) jobs.push(abciProof(cfg.rpc, S, delegationKey(delegator, v), height), abciProof(cfg.rpc, S, validatorKey(v), height));
  const proofs = await Promise.all(jobs);
  const config = JSON.parse(new TextDecoder().decode(unhex(proofs[0].value)));
  const bounty = JSON.parse(new TextDecoder().decode(unhex(proofs[1].value)));
  const min = BigInt(config.min_upload_stake || '0');
  let staked = 0n;
  for (let n = 0; n < vals.length; n++) {
    const d = decodeDelegation(unhex(proofs[2 + 2 * n].value)), v = decodeValidator(unhex(proofs[3 + 2 * n].value));
    if (d.delegator_address !== delegator || d.validator_address !== vals[n] || v.operator_address !== vals[n]) throw new Error('a proven delegation does not belong to this address');
    staked += delegatedTokens(d, v);
  }
  const statusOk = bounty.status === 'open' || bounty.status === 'assigned';
  return { ok: staked >= min && statusOk && Number(bounty.id) === Number(bountyId), code: !statusOk ? 'status' : staked < min ? 'low' : 'ok', staked, min, bounty, config, vals, height, proofs };
}

// ── intent + signature ──────────────────────────────────────────────────────────────────────────────
/** serde_json of the struct: fields in alphabetical order, no whitespace */
export function canonical(intent) { const o = {}; for (const k of Object.keys(intent).sort()) o[k] = intent[k]; return JSON.stringify(o); }
export function buildIntent({ escrow, bountyId, bucket, chainId, delegator, path, height, sha256, size, validators, now = Math.floor(Date.now() / 1000), nonce }) {
  if (!/^[0-9a-f]{64}$/.test(sha256)) throw new Error('sha256 must be lowercase hex');
  const n = nonce || hex(crypto.getRandomValues(new Uint8Array(16)));
  return { bounty_ref: `${escrow}/${Number(bountyId)}`, bucket, chain_id: chainId, delegator, domain: DOMAIN, expires_at: now + TTL_SECS, issued_at: now,
    nonce: n, path, proof_height: height, sha256, size, validators };
}
/** The browser wallet's signArbitrary (Keplr, Leap): ADR-36 over the canonical intent string. */
/** Prefer Keplr (OPEN-5: Zafu signArbitrary unverified). kind may force 'keplr'|'leap'. */
export function walletSigner(kind) {
  const keplr = globalThis.keplr;
  const leap = globalThis.leap;
  let w = null, used = null;
  if (kind === 'leap' && leap?.signArbitrary) { w = leap; used = 'leap'; }
  else if (keplr?.signArbitrary) { w = keplr; used = 'keplr'; }
  else if (leap?.signArbitrary) { w = leap; used = 'leap'; } // experimental fallback
  if (!w) return null;
  const fn = async (chainId, signer, data) => {
    const r = await w.signArbitrary(chainId, signer, data);
    return { pubkey: hex(b64ToU8(r.pub_key.value)), signature: hex(b64ToU8(r.signature)), wallet: used };
  };
  fn.wallet = used;
  return fn;
}

// ── adapter calls ───────────────────────────────────────────────────────────────────────────────────
// A browser that cannot reach the service (CORS preflight refused, offline) throws a TypeError before any
// HTTP status exists; tag it so the page can fall back to the manual pin-and-paste path instead of erroring.
async function call(url, init) {
  try { return await fetch(url, init); }
  catch (e) { throw Object.assign(new Error('the browser could not reach the upload service (it may not allow this site yet)'), { code: 'unreachable', cause: e }); }
}
export async function authorize(base, req) {
  const r = await call(base + '/v1/authorize', { method: 'POST', credentials: 'omit', headers: { 'content-type': 'application/json' }, body: JSON.stringify(req) });
  const j = await r.json().catch(() => null);
  if (!r.ok || !j || !j.ticket_b64) throw Object.assign(new Error((j && j.error) || 'HTTP ' + r.status), { status: r.status });
  return j;
}
export async function put(base, ticketB64, bytes) {
  const r = await call(base + '/v1/upload', { method: 'PUT', credentials: 'omit', headers: { 'x-silo-ticket': ticketB64, 'content-type': 'application/octet-stream' }, body: bytes });
  const j = await r.json().catch(() => ({}));
  if (r.status !== 201 && r.status !== 202) throw Object.assign(new Error((j && j.error) || 'HTTP ' + r.status), { status: r.status });
  return { status: r.status, dryRun: r.status === 202 || !!j.dry_run, sha256Ok: j.sha256_ok !== false, body: j };
}

/** Stake-path upload (OPEN-4): prove → ADR-36 sign → POST /v1/authorize → PUT /v1/upload with X-Silo-Ticket.
 *  On proof-build failure throws code 'open7' (never fakes proofs). */
export async function upload({ live, bountyId, delegator, bytes, sha256, sign, onStep = () => {} }) {
  const cfg = siloConfig(live);
  if (!cfg.base) throw new Error('no upload service is configured');
  onStep('health');
  if (!(await healthz(cfg.base))) throw Object.assign(new Error('the upload service is not answering'), { code: 'down' });
  onStep('height');
  const height = await trustedHeight(cfg.base);
  onStep('prove', { height });
  let p;
  try {
    p = await prove({ cfg, escrow: live.escrow, bountyId, delegator, height });
  } catch (e) {
    throw Object.assign(new Error(`ICS-23 proofs could not be built in this browser (${e.message || e}). OPEN-7: authorize needs real ABCI prove=true proofs — nothing was faked.`), { code: 'open7', cause: e });
  }
  onStep('proven', p);
  if (!p.ok) throw Object.assign(new Error(p.code === 'status' ? 'this bounty is not taking uploads' : 'not enough stake'), { code: p.code, proof: p });
  const intent = buildIntent({ escrow: live.escrow, bountyId, bucket: cfg.bucket, chainId: live.chainId, delegator, path: `submissions/${Number(bountyId)}/${sha256}.json`, height, sha256, size: bytes.length, validators: p.vals });
  onStep('sign', { intent });
  const sig = await sign(live.chainId, delegator, canonical(intent));
  if (sig.wallet && sig.wallet !== 'keplr') onStep('wallet_note', { wallet: sig.wallet, open: 'OPEN-5' });
  onStep('authorize');
  const t = await authorize(cfg.base, { intent, pubkey: sig.pubkey, signature: sig.signature, proofs: p.proofs, excerpt: null });
  onStep('put', { ticket: t.ticket });
  const res = await put(cfg.base, t.ticket_b64, bytes);
  onStep('done', res);
  return { stored: res.status === 201 && !res.dryRun, dryRun: res.dryRun, sha256Ok: res.sha256Ok, objectKey: t.ticket.object_key, needsReview: !!t.ticket.needs_human_review, staked: p.staked, min: p.min, height, wallet: sig.wallet };
}
export const uploadBountyRef = (escrow, bountyId) => `${escrow}/${Number(bountyId)}`;
export { hex, unhex, u8ToB64 };
