// lib/staking-tx.js — staking + distribution messages, tx envelope, LCD reads,
// simulate and broadcast for the Eco staking panel. No chain libraries: the
// handful of protobuf fields these messages need are encoded here, and every
// call goes to the LCD (REST), which answers browser CORS correctly. The
// public Tendermint RPC does not (duplicate Access-Control-Allow-Origin), so
// nothing here touches RPC.
//
// Field numbers (cosmos-sdk proto, unchanged since v0.46):
//   cosmos.staking.v1beta1.MsgDelegate          { delegator_address=1, validator_address=2, amount=3 }
//   cosmos.staking.v1beta1.MsgBeginRedelegate   { delegator_address=1, validator_src_address=2, validator_dst_address=3, amount=4 }
//   cosmos.staking.v1beta1.MsgUndelegate        { delegator_address=1, validator_address=2, amount=3 }
//   cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward { delegator_address=1, validator_address=2 }
//   cosmos.base.v1beta1.Coin { denom=1, amount=2 }
//   cosmos.tx.v1beta1.TxBody { messages=1, memo=2, non_critical_extension_options=2047 }
//   cosmos.tx.v1beta1.AuthInfo { signer_infos=1, fee=2 }; SignerInfo { public_key=1, mode_info=2, sequence=3 }
//   ModeInfo { single=1 { mode=1 } }, SIGN_MODE_DIRECT = 1, SIGN_MODE_LEGACY_AMINO_JSON = 127;
//   Fee { amount=1, gas_limit=2, payer=3, granter=4 }
//   cosmos.tx.v1beta1.SignDoc { body_bytes=1, auth_info_bytes=2, chain_id=3, account_number=4 }
//   cosmos.tx.v1beta1.TxRaw { body_bytes=1, auth_info_bytes=2, signatures=3 }
//   cosmos.crypto.secp256k1.PubKey { key=1 }

export const TYPE = {
  delegate: '/cosmos.staking.v1beta1.MsgDelegate',
  redelegate: '/cosmos.staking.v1beta1.MsgBeginRedelegate',
  undelegate: '/cosmos.staking.v1beta1.MsgUndelegate',
  withdraw: '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
};
const SECP_PUBKEY = '/cosmos.crypto.secp256k1.PubKey';
const TX_EXTENSION = '/terp.smartaccount.v1beta1.TxExtension';

// ── protobuf writer (only what these messages use) ─────────────────────────
const utf8 = (s) => new TextEncoder().encode(String(s));
function varint(out, n) {
  let v = BigInt(n);
  if (v < 0n) throw new Error('negative varint');
  while (v > 0x7fn) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
  out.push(Number(v));
}
function cat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}
/** Length-delimited field; proto3 omits empty strings/bytes unless `keep`. */
function ld(no, bytes, keep = false) {
  const b = typeof bytes === 'string' ? utf8(bytes) : bytes;
  if (!keep && (!b || !b.length)) return new Uint8Array(0);
  const head = [];
  varint(head, (no << 3) | 2);
  varint(head, b.length);
  return cat([Uint8Array.from(head), b]);
}
/** uint64 / enum field; proto3 omits zero. */
function u64(no, n) {
  if (!n || BigInt(n) === 0n) return new Uint8Array(0);
  const out = [];
  varint(out, no << 3);
  varint(out, n);
  return Uint8Array.from(out);
}
const coin = ({ denom, amount }) => cat([ld(1, denom), ld(2, String(amount))]);
const any = (typeUrl, value) => cat([ld(1, typeUrl), ld(2, value, true)]);

// ── base64 / hex ────────────────────────────────────────────────────────────
export function toB64(u8) { let s = ''; for (const b of u8) s += String.fromCharCode(b); return btoa(s); }
export function fromB64(s) { const r = atob(s); const u = new Uint8Array(r.length); for (let i = 0; i < r.length; i++) u[i] = r.charCodeAt(i); return u; }
const hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, '0')).join('');

// ── amounts (exact, BigInt micro units) ────────────────────────────────────
/** "12.5" → 12500000n for 6 decimals. Throws on bad input or too many decimals. */
export function toMicro(text, decimals = 6) {
  const s = String(text ?? '').trim().replace(/,/g, '');
  if (!/^\d*(\.\d*)?$/.test(s) || s === '' || s === '.') throw new Error('Enter an amount, like 10 or 2.5');
  const [i, f = ''] = s.split('.');
  if (f.length > decimals) throw new Error(`At most ${decimals} decimal places`);
  return BigInt(i || '0') * 10n ** BigInt(decimals) + BigInt((f + '0'.repeat(decimals)).slice(0, decimals) || '0');
}
/** 12500000n → "12.5"; decimal strings from LCD (DecCoin) are floored to micro. */
export function fromMicro(u, decimals = 6, maxFrac = decimals) {
  let v = typeof u === 'bigint' ? u : BigInt(String(u ?? '0').split('.')[0] || '0');
  const neg = v < 0n; if (neg) v = -v;
  const base = 10n ** BigInt(decimals);
  const i = v / base;
  let f = (v % base).toString().padStart(decimals, '0').slice(0, maxFrac).replace(/0+$/, '');
  return `${neg ? '-' : ''}${i.toLocaleString('en-US')}${f ? '.' + f : ''}`;
}
export const microOf = (decStr) => BigInt(String(decStr ?? '0').split('.')[0] || '0');

// ── message builders: JSON form (for review / Keplr display) + proto bytes ──
function need(v, what) { if (!v || typeof v !== 'string') throw new Error(`Missing ${what}`); return v; }
function amt(a) {
  const n = BigInt(a.amount);
  if (n <= 0n) throw new Error('Amount must be more than zero');
  return { denom: need(a.denom, 'denom'), amount: n.toString() };
}

export function msgDelegate({ delegator, validator, amount }) {
  const value = { delegator_address: need(delegator, 'delegator'), validator_address: need(validator, 'validator'), amount: amt(amount) };
  return { typeUrl: TYPE.delegate, value, bytes: cat([ld(1, value.delegator_address), ld(2, value.validator_address), ld(3, coin(value.amount))]) };
}
export function msgRedelegate({ delegator, src, dst, amount }) {
  if (src === dst) throw new Error('Pick a different validator to move to');
  const value = { delegator_address: need(delegator, 'delegator'), validator_src_address: need(src, 'source validator'), validator_dst_address: need(dst, 'destination validator'), amount: amt(amount) };
  return { typeUrl: TYPE.redelegate, value, bytes: cat([ld(1, value.delegator_address), ld(2, value.validator_src_address), ld(3, value.validator_dst_address), ld(4, coin(value.amount))]) };
}
export function msgUndelegate({ delegator, validator, amount }) {
  const value = { delegator_address: need(delegator, 'delegator'), validator_address: need(validator, 'validator'), amount: amt(amount) };
  return { typeUrl: TYPE.undelegate, value, bytes: cat([ld(1, value.delegator_address), ld(2, value.validator_address), ld(3, coin(value.amount))]) };
}
export function msgWithdraw({ delegator, validator }) {
  const value = { delegator_address: need(delegator, 'delegator'), validator_address: need(validator, 'validator') };
  return { typeUrl: TYPE.withdraw, value, bytes: cat([ld(1, value.delegator_address), ld(2, value.validator_address)]) };
}
/** Claim-all: one MsgWithdrawDelegatorReward per validator, batched in one tx. */
export function msgWithdrawAll({ delegator, validators }) {
  const list = [...new Set(validators || [])];
  if (!list.length) throw new Error('No rewards to claim');
  return list.map((validator) => msgWithdraw({ delegator, validator }));
}
/** Amino-JSON view of messages (what a reviewer or Ledger would see). */
export function toAminoJson(msgs) {
  const t = { [TYPE.delegate]: 'cosmos-sdk/MsgDelegate', [TYPE.redelegate]: 'cosmos-sdk/MsgBeginRedelegate', [TYPE.undelegate]: 'cosmos-sdk/MsgUndelegate', [TYPE.withdraw]: 'cosmos-sdk/MsgWithdrawDelegationReward' };
  return msgs.map((m) => ({ type: t[m.typeUrl], value: m.value }));
}
/** Proto-JSON view (`@type` + fields), the shape the LCD prints. */
export function toProtoJson(msgs) {
  return msgs.map((m) => ({ '@type': m.typeUrl, ...m.value }));
}

// ── tx envelope ─────────────────────────────────────────────────────────────
export function encodeTxBody({ msgs, memo = '', extensions = [] }) {
  return cat([
    ...msgs.map((m) => ld(1, any(m.typeUrl, m.bytes), true)),
    ld(2, memo),
    ...extensions.map((e) => ld(2047, any(e.typeUrl, e.value), true)),
  ]);
}
export const SIGN_MODE = { direct: 1, amino: 127 };
export function encodeAuthInfo({ pubkey, sequence, fee, gas, granter = '', mode = SIGN_MODE.direct }) {
  const pk = any(SECP_PUBKEY, ld(1, pubkey));
  const modeInfo = ld(1, u64(1, mode), true); // single { mode }
  const signerInfo = cat([ld(1, pk), ld(2, modeInfo, true), u64(3, sequence)]);
  const feeMsg = cat([...(fee || []).map((c) => ld(1, coin(c), true)), u64(2, gas), ld(4, granter)]);
  return cat([ld(1, signerInfo, true), ld(2, feeMsg, true)]);
}
/** SignDoc bytes: what a direct signer hashes (SHA-256) and an eth authenticator signs (EIP-191). */
export function encodeSignDoc({ bodyBytes, authInfoBytes, chainId, accountNumber }) {
  return cat([ld(1, bodyBytes), ld(2, authInfoBytes), ld(3, chainId), u64(4, BigInt(accountNumber))]);
}

// ── amino-JSON (SIGN_MODE_LEGACY_AMINO_JSON, for Ledger) ───────────────────
/** StdSignDoc. Numbers stay strings, so account numbers above 2^53 are exact. */
export function makeAminoSignDoc({ msgs, fee, gas, chainId, memo = '', accountNumber, sequence }) {
  return {
    chain_id: chainId,
    account_number: BigInt(accountNumber).toString(),
    sequence: BigInt(sequence).toString(),
    fee: { amount: (fee || []).map((c) => ({ denom: c.denom, amount: String(c.amount) })), gas: BigInt(gas).toString() },
    msgs: toAminoJson(msgs),
    memo,
  };
}
function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') return Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {});
  return x;
}
/** Canonical amino sign bytes: sorted keys, no spaces, & < > escaped (same as cosmjs serializeSignDoc). */
export function aminoSignBytes(doc) {
  return utf8(JSON.stringify(sortKeys(doc)).replace(/&/g, '\\u0026').replace(/</g, '\\u003c').replace(/>/g, '\\u003e'));
}
const sameJson = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

export function encodeTxRaw({ bodyBytes, authInfoBytes, signatures }) {
  return cat([ld(1, bodyBytes), ld(2, authInfoBytes), ...signatures.map((s) => ld(3, s, true))]);
}
export async function txHash(txBytes) {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', txBytes))).toUpperCase();
}

// ── LCD ─────────────────────────────────────────────────────────────────────
const trim = (s) => String(s || '').replace(/\/+$/, '');
async function getJson(url, { ms = 8000, ...init } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', ...init, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 200) }; }
    return { ok: res.ok, status: res.status, body };
  } catch (e) {
    return { ok: false, status: 0, body: { message: e.name === 'AbortError' ? 'timed out' : 'not reachable (network or CORS)' } };
  } finally { clearTimeout(t); }
}
function must(r, what) {
  if (!r.ok) { const e = new Error(`${what}: ${r.body?.message || `HTTP ${r.status}`}`); e.status = r.status; throw e; }
  return r.body;
}

/**
 * First LCD that answers staking params for this chain id. Candidates are
 * tried in order; each result records why it was skipped, for the panel's
 * "endpoint" line and for NOTES.
 */
export async function pickLcd(candidates, chainId) {
  const tried = [];
  for (const raw of [...new Set(candidates.filter(Boolean).map(trim))]) {
    const r = await getJson(`${raw}/cosmos/base/tendermint/v1beta1/node_info`, { ms: 5000 });
    const net = r.body?.default_node_info?.network;
    if (r.ok && (!chainId || net === chainId)) { tried.push({ url: raw, ok: true }); return { rest: raw, tried }; }
    tried.push({ url: raw, ok: false, why: r.ok ? `answers as ${net || '?'}` : (r.body?.message || `HTTP ${r.status}`) });
  }
  return { rest: null, tried };
}

/** All validators (any status), paginated by next_key. */
export async function fetchValidators(rest) {
  const out = [];
  let key = '';
  for (let i = 0; i < 10; i++) {
    const q = `pagination.limit=300${key ? `&pagination.key=${encodeURIComponent(key)}` : ''}`;
    const b = must(await getJson(`${trim(rest)}/cosmos/staking/v1beta1/validators?${q}`), 'validators');
    out.push(...(b.validators || []));
    key = b.pagination?.next_key;
    if (!key) break;
  }
  return out;
}

/** Bonded, not jailed, sorted by voting power; adds share and cumulative share. */
export function activeValidators(all) {
  const act = all.filter((v) => v.status === 'BOND_STATUS_BONDED' && !v.jailed);
  const total = act.reduce((n, v) => n + BigInt(v.tokens || '0'), 0n) || 1n;
  act.sort((a, b) => (BigInt(b.tokens) > BigInt(a.tokens) ? 1 : BigInt(b.tokens) < BigInt(a.tokens) ? -1 : 0));
  let cum = 0;
  return act.map((v, i) => {
    const share = Number((BigInt(v.tokens) * 1000000n) / total) / 1e6;
    const before = cum;
    cum += share;
    return { ...v, rank: i + 1, share, cumBefore: before };
  });
}

/** Seeded PRNG (mulberry32), so a page load keeps one stable order. */
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const tok = (v) => BigInt(v.tokens || '0');
const byTokensAsc = (a, b) => (tok(a) < tok(b) ? -1 : tok(a) > tok(b) ? 1 : 0);
/** Peers = neighbours (ascending) within 25% of the group's smallest stake. Shuffled inside each group only. */
export function peerGroups(sortedAsc) {
  const groups = [];
  for (const v of sortedAsc) {
    const g = groups[groups.length - 1];
    if (g && tok(v) * 4n <= tok(g[0]) * 5n) g.push(v); else groups.push([v]);
  }
  return groups;
}
export const inTopThird = (v) => v.cumBefore !== undefined && v.cumBefore < 1 / 3;
/**
 * Validator order for the table and pickers.
 *   spread (default): outside the top third first, smaller stake first, light
 *     shuffle among peers with similar stake; the top third last.
 *   power: voting power, largest first.  commission: lowest first, ties by power.
 */
export function orderValidators(list, mode = 'spread', seed = 1) {
  const all = [...(list || [])];
  if (mode === 'power') return all.sort((a, b) => byTokensAsc(b, a));
  if (mode === 'commission') return all.sort((a, b) => (+a.commission.commission_rates.rate - +b.commission.commission_rates.rate) || byTokensAsc(b, a));
  const r = rng(seed);
  const shuffle = (vs) => peerGroups(vs.sort(byTokensAsc)).flatMap((g) => {
    for (let i = g.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [g[i], g[j]] = [g[j], g[i]]; }
    return g;
  });
  return [...shuffle(all.filter((v) => !inTopThird(v))), ...shuffle(all.filter(inTopThird))];
}

export const stakingParams = async (rest) => must(await getJson(`${trim(rest)}/cosmos/staking/v1beta1/params`), 'staking params').params;
export async function minGasPrice(rest) {
  const r = await getJson(`${trim(rest)}/cosmos/base/node/v1beta1/config`, { ms: 5000 });
  const m = String(r.body?.minimum_gas_price || '').match(/^([\d.]+)([a-z][a-z0-9/]*)$/i);
  return m ? { amount: Number(m[1]), denom: m[2] } : null;
}

/** Everything the panel shows for one address, read in parallel. */
export async function fetchAccount(rest, address) {
  const b = trim(rest);
  const [bal, del, rew, unb, red] = await Promise.all([
    getJson(`${b}/cosmos/bank/v1beta1/balances/${address}?pagination.limit=200`),
    getJson(`${b}/cosmos/staking/v1beta1/delegations/${address}?pagination.limit=200`),
    getJson(`${b}/cosmos/distribution/v1beta1/delegators/${address}/rewards`),
    getJson(`${b}/cosmos/staking/v1beta1/delegators/${address}/unbonding_delegations?pagination.limit=200`),
    getJson(`${b}/cosmos/staking/v1beta1/delegators/${address}/redelegations?pagination.limit=200`),
  ]);
  return {
    balances: must(bal, 'balances').balances || [],
    delegations: must(del, 'delegations').delegation_responses || [],
    rewards: must(rew, 'rewards'),
    unbonding: must(unb, 'unbonding').unbonding_responses || [],
    redelegations: red.ok ? red.body?.redelegation_responses || [] : [],
  };
}

/** account_number / sequence / on-chain pubkey. account_number can exceed 2^53, so it stays a BigInt. */
export async function fetchAuthAccount(rest, address) {
  const r = await getJson(`${trim(rest)}/cosmos/auth/v1beta1/accounts/${address}`);
  if (r.status === 404) return null;
  const a = must(r, 'account').account;
  const base = a?.base_account || a?.base_vesting_account?.base_account || a;
  return {
    accountNumber: BigInt(base?.account_number || '0'),
    sequence: BigInt(base?.sequence || '0'),
    pubkey: base?.pub_key?.key ? fromB64(base.pub_key.key) : null,
  };
}

/**
 * Gas + fee for these messages via LCD /simulate (unsigned tx, empty signature).
 * `pubkey`, `mode` and `extensions` come from the signer adapter
 * (lib/staking-signer.js), so the estimate is for the tx that will be signed.
 * Falls back to the on-chain pubkey when the adapter has none yet.
 */
export async function simulate({ rest, address, msgs, pubkey, memo = '', gasPrice, gasAdjust = 1.4, mode = SIGN_MODE.direct, extensions = [] }) {
  const acct = await fetchAuthAccount(rest, address);
  if (!acct) throw new Error('This address is not on chain yet. It needs a first transfer.');
  const pk = pubkey || acct.pubkey;
  if (!pk) throw new Error('Connect the wallet for an estimate (this account has not signed a transaction yet).');
  const bodyBytes = encodeTxBody({ msgs, memo, extensions });
  const authInfoBytes = encodeAuthInfo({ pubkey: pk, sequence: acct.sequence, fee: [], gas: 0, mode });
  const tx = encodeTxRaw({ bodyBytes, authInfoBytes, signatures: [new Uint8Array(0)] });
  const r = await getJson(`${trim(rest)}/cosmos/tx/v1beta1/simulate`, { ms: 15000, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_bytes: toB64(tx) }) });
  if (!r.ok) throw new Error(cleanErr(r.body?.message || `simulate HTTP ${r.status}`));
  const used = BigInt(r.body?.gas_info?.gas_used || '0');
  const gas = (used * BigInt(Math.round(gasAdjust * 100))) / 100n + 1n;
  return { gasUsed: used, gas, fee: [{ denom: gasPrice.denom, amount: feeFor(gas, gasPrice.amount).toString() }], sequence: acct.sequence, accountNumber: acct.accountNumber, mode, extensions };
}
/** ceil(gas × price) in integer math (price to 6 decimals). */
export function feeFor(gas, price) {
  const p6 = BigInt(Math.round(Number(price) * 1e6));
  return (BigInt(gas) * p6 + 999999n) / 1000000n;
}

/** SDK errors arrive wrapped ("rpc error: code = Unknown desc = …"); keep the human part. */
export function cleanErr(msg) {
  const s = String(msg || '');
  const m = s.match(/desc = (.*?)(?: \[.*)?$/s);
  return (m ? m[1] : s).replace(/: unknown request$/, '').slice(0, 300);
}

/**
 * Build, sign through the adapter (lib/staking-signer.js), broadcast over LCD,
 * then confirm on LCD. `adapter.mode` picks the path:
 *   direct — SignDoc → adapter.signDirect(signDoc) → { bodyBytes, authInfoBytes, signature }
 *   amino  — StdSignDoc → adapter.signAmino(doc) → { signed, signature } (Ledger; no TxExtension)
 * `onStep(label, extra)` reports progress for the in-panel status line.
 */
export async function buildSigned({ chainId, msgs, memo = '', estimate, adapter, onStep = () => {} }) {
  if (!adapter) throw new Error('Connect a wallet to sign.');
  await adapter.prepare?.(msgs.length);
  const pubkey = await adapter.pubkey();
  if (!pubkey) throw new Error('No public key for this account yet.');
  onStep(adapter.waitText || 'Waiting for your wallet…');
  if (adapter.mode === 'amino') {
    if ((adapter.extensions?.(msgs.length) || []).length) throw new Error('Amino signing cannot carry a smart-account extension.');
    const doc = makeAminoSignDoc({ msgs, fee: estimate.fee, gas: estimate.gas, chainId, memo, accountNumber: estimate.accountNumber, sequence: estimate.sequence });
    const out = await adapter.signAmino(doc);
    const s = out.signed;
    if (!sameJson(s.msgs, doc.msgs) || s.chain_id !== doc.chain_id || s.account_number !== doc.account_number || s.sequence !== doc.sequence) throw new Error('The wallet changed the messages. Nothing was sent.');
    const bodyBytes = encodeTxBody({ msgs, memo: s.memo || '' });
    const authInfoBytes = encodeAuthInfo({ pubkey, sequence: BigInt(s.sequence), fee: s.fee.amount, gas: BigInt(s.fee.gas), granter: s.fee.granter || '', mode: SIGN_MODE.amino });
    return encodeTxRaw({ bodyBytes, authInfoBytes, signatures: [out.signature] });
  }
  const bodyBytes = encodeTxBody({ msgs, memo, extensions: adapter.extensions?.(msgs.length) || [] });
  const authInfoBytes = encodeAuthInfo({ pubkey, sequence: estimate.sequence, fee: estimate.fee, gas: estimate.gas, mode: SIGN_MODE.direct });
  const signDoc = { bodyBytes, authInfoBytes, chainId, accountNumber: BigInt(estimate.accountNumber) };
  const out = await adapter.signDirect(signDoc);
  return encodeTxRaw({ bodyBytes: out.bodyBytes, authInfoBytes: out.authInfoBytes, signatures: [out.signature] });
}

export async function signAndBroadcast({ rest, chainId, msgs, memo = '', estimate, adapter, onStep = () => {} }) {
  const raw = await buildSigned({ chainId, msgs, memo, estimate, adapter, onStep });
  const hash = await txHash(raw);
  onStep('Broadcasting…', { hash });
  const r = await getJson(`${trim(rest)}/cosmos/tx/v1beta1/txs`, { ms: 30000, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_bytes: toB64(raw), mode: 'BROADCAST_MODE_SYNC' }) });
  const tr = r.body?.tx_response;
  if (!r.ok || !tr) throw Object.assign(new Error(cleanErr(r.body?.message || `Broadcast failed (${r.status})`)), { hash });
  if (tr.code) throw Object.assign(new Error(cleanErr(tr.raw_log) || `Rejected (code ${tr.code})`), { hash: tr.txhash || hash });
  onStep('In the mempool. Waiting for a block…', { hash: tr.txhash });
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    await new Promise((res) => setTimeout(res, 2000));
    const c = await getJson(`${trim(rest)}/cosmos/tx/v1beta1/txs/${tr.txhash}`, { ms: 6000 });
    const t = c.body?.tx_response;
    if (c.ok && t) {
      if (t.code) throw Object.assign(new Error(cleanErr(t.raw_log) || `Failed in block (code ${t.code})`), { hash: t.txhash });
      return { hash: t.txhash, height: t.height, gasUsed: t.gas_used };
    }
  }
  return { hash: tr.txhash, pending: true };
}
