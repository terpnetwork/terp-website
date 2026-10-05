// lib/account-chain.js — reads and transactions behind the account panel.
// Loaded only when the account panel opens (wallet-modal.js imports it lazily).
//
// Sources this mirrors (read-only references):
//   • onboard-authz http.rs: GET /onboard/v1/status (fee desk readiness).
//   • terp.smartaccount.v1beta1 protos (terp-rs sdk gen): MsgAddAuthenticator
//     {sender=1, authenticator_type=2, data=3}, MsgRemoveAuthenticator {sender=1, id=2},
//     TxExtension {selected_authenticators=1}.
//   • x/smart-account composite data (terp-auth composite.rs): AnyOf data is JSON
//     [{"type": <sub type>, "config": base64(bytes)}]; one signature is offered to each.
//   • terp-eth authenticator (contracts/smart-accounts/terp-eth): instantiate with
//     {"signer": 0x…}; it verifies an EIP-191 personal_sign over the SignDoc bytes.
//   • onboard-authz eth_age.rs: POST /onboard/v1/eth-age-grant, message format below.

export const MSG_ADD = '/terp.smartaccount.v1beta1.MsgAddAuthenticator';
export const MSG_REMOVE = '/terp.smartaccount.v1beta1.MsgRemoveAuthenticator';
export const TX_EXTENSION = '/terp.smartaccount.v1beta1.TxExtension';
export const SIG_TYPE = 'SignatureVerification';
export const COSMWASM_TYPE = 'CosmwasmAuthenticatorV1';
export const ANY_OF_TYPE = 'AnyOf';
export const ALL_OF_TYPE = 'AllOf';
export const MSG_INSTANTIATE = '/cosmwasm.wasm.v1.MsgInstantiateContract';

export const NETWORKS = [
  { id: 'morocco-1', name: 'Mainnet' },
  { id: '120u-1', name: 'Testnet' },
];

const trim = (s) => String(s || '').replace(/\/+$/, '');

async function getJson(url, ms = 7000, init = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { cache: 'no-store', credentials: 'omit', ...init, signal: ctrl.signal });
    const text = await res.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { raw: text.slice(0, 200) }; }
    return { ok: res.ok, status: res.status, body };
  } finally {
    clearTimeout(t);
  }
}

// ── networks ────────────────────────────────────────────────────────────────

let siteCache = null;
export async function siteConfig() {
  if (siteCache) return siteCache;
  const { fetchSiteConfig } = await import('/lib/config.js');
  siteCache = await fetchSiteConfig();
  return siteCache;
}

export async function chainSlice(chainId) {
  const site = await siteConfig();
  return site.chains?.[chainId] || null;
}

/** Latest block from the network's RPC (CometBFT /status). */
export async function networkStatus(chainId) {
  const c = await chainSlice(chainId);
  if (!c?.rpc) return { up: false, reason: 'No endpoint set' };
  try {
    const r = await getJson(`${trim(c.rpc)}/status`, 6000);
    const s = r.body?.result;
    if (!r.ok || !s) return { up: false, reason: `Not answering (${r.status})` };
    const net = s.node_info?.network;
    return {
      up: true,
      height: Number(s.sync_info?.latest_block_height || 0),
      time: s.sync_info?.latest_block_time || null,
      catchingUp: !!s.sync_info?.catching_up,
      network: net,
      mismatch: net && net !== chainId,
    };
  } catch (e) {
    return { up: false, reason: e.name === 'AbortError' ? 'Timed out' : 'Not reachable' };
  }
}

// ── contract reads over LCD ────────────────────────────────────────────────

function b64json(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function smartQuery(rest, contract, msg) {
  const r = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodeURIComponent(b64json(msg))}`);
  if (r.ok) return r.body?.data;
  const err = new Error(r.body?.message || `query ${r.status}`);
  err.status = r.status;
  throw err;
}

// ── smart account (x/smartaccount) ────────────────────────────────────────

export async function smartAccountParams(rest) {
  const r = await getJson(`${trim(rest)}/terp/smartaccount/params`);
  if (!r.ok) throw new Error(r.body?.message || `params ${r.status}`);
  return r.body?.params || {};
}

export async function listAuthenticators(rest, address) {
  const r = await getJson(`${trim(rest)}/terp/smartaccount/authenticators/${encodeURIComponent(address)}`);
  if (!r.ok) throw new Error(r.body?.message || `authenticators ${r.status}`);
  const raw = r.body?.account_authenticators || r.body?.accountAuthenticators || [];
  return raw.map((a) => ({ id: String(a.id ?? '0'), type: String(a.type || ''), config: a.config || '' }));
}

/** Short, readable summary of an authenticator's config. */
export function describeAuthenticator(a) {
  const cfg = String(a.config || '');
  if (a.type === COSMWASM_TYPE) {
    try {
      const j = JSON.parse(atob(cfg));
      if (j.contract) return `contract ${short(j.contract)}`;
    } catch { /* not JSON */ }
  }
  if (a.type === SIG_TYPE && cfg) return `key ${cfg.slice(0, 10)}…`;
  if (a.type === ANY_OF_TYPE || a.type === ALL_OF_TYPE) {
    const subs = compositeSubs(a);
    if (subs) return `${a.type === ANY_OF_TYPE ? 'any of' : 'all of'}: ${subs.map((x) => x.type === SIG_TYPE ? 'key' : x.type === COSMWASM_TYPE ? 'contract' : x.type).join(', ')}`;
  }
  return cfg ? `${cfg.slice(0, 14)}…` : '';
}

// ── Abstract Accounts owned by an address (mainnet registry) ──────────────

export async function abstractAccountsOf(rest, registry, owner, { max = 120 } = {}) {
  const cfg = await smartQuery(rest, registry, { config: {} });
  const n = Number(cfg?.local_account_sequence || 0);
  if (!n) return { scanned: 0, total: 0, accounts: [] };
  const from = Math.max(0, n - max);
  const ids = [];
  for (let s = from; s < n; s++) ids.push({ seq: s, trace: 'local' });
  const out = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const res = await smartQuery(rest, registry, { accounts: { account_ids: chunk } });
    const addrs = res?.accounts || [];
    const owners = await Promise.all(addrs.map((addr) =>
      smartQuery(rest, addr, { ownership: {} }).catch(() => null)));
    addrs.forEach((addr, k) => {
      const o = owners[k]?.owner;
      const monarch = o?.monarchy?.monarch || (typeof o === 'string' ? o : null);
      if (monarch === owner) out.push({ address: addr, seq: chunk[k].seq });
    });
  }
  const named = await Promise.all(out.map((a) => smartQuery(rest, a.address, { info: {} }).then((r) => ({ ...a, name: r?.info?.name || '' })).catch(() => a)));
  return { scanned: ids.length, total: n, accounts: named };
}

// ── Terp Account Billboards (names) ───────────────────────────────────────

export async function nameOf(rest, collection, address) {
  try {
    const r = await smartQuery(rest, collection, { reverse_map_account: { address } });
    return typeof r === 'string' ? r : r?.account || r?.name || null;
  } catch (e) {
    if (/no account associated|not found/i.test(e.message)) return null;
    throw e;
  }
}

export async function namesOwned(rest, collection, owner) {
  const r = await smartQuery(rest, collection, { tokens: { owner, limit: 30 } });
  return r?.tokens || [];
}

export async function nameParams(rest, minter) {
  return smartQuery(rest, minter, { params: {} });
}

export async function nameMintStart(rest, minter) {
  const r = await smartQuery(rest, minter, { config: {} });
  const ns = Number(r?.public_mint_start_time || 0);
  return ns ? new Date(ns / 1e6) : null;
}

/** true = taken, false = free. A failed network read throws (never "free"). */
export async function nameTaken(rest, minter, name) {
  try {
    const ask = await smartQuery(rest, minter, { ask: { token_id: name } });
    return !!ask;
  } catch (e) {
    if (e.status && e.status < 500 && /not found|does not exist/i.test(e.message)) return false;
    if (/not found|does not exist/i.test(e.message)) return false;
    throw e;
  }
}

/** Same pricing rule the Billboards page uses: 1–3 chars ×100, 4 chars ×10. */
export function namePrice(len, params) {
  if (!params || !len) return null;
  const base = BigInt(params.base_price || '0');
  const mult = len <= 3 ? 100n : len === 4 ? 10n : 1n;
  return (base * mult).toString();
}

export function validName(name, params) {
  const min = params?.min_account_length ?? 3, max = params?.max_account_length ?? 64;
  if (!name) return 'Type a name.';
  if (name.length < min) return `At least ${min} characters.`;
  if (name.length > max) return `At most ${max} characters.`;
  if (!/^[a-z][a-z0-9-]*$/.test(name)) return 'Lowercase letters, numbers and hyphens, starting with a letter.';
  if (name.endsWith('-')) return 'Cannot end with a hyphen.';
  return '';
}

// ── fee-grant desk (onboard-authz) ────────────────────────────────────────

/** Where the desk answers: same origin on terp.network (proxied), else the configured host. */
export async function onboardBase(chainId = 'morocco-1') {
  try {
    const q = new URLSearchParams(location.search).get('onboard');
    if (q && /^https:\/\//.test(q)) return trim(q);
  } catch { /* ignore */ }
  if (/(^|\.)terp\.network$/.test(location.hostname)) return '';
  const c = await chainSlice(chainId);
  return trim(c?.services?.onboard || '');
}

export async function onboardStatus(chainId) {
  const base = await onboardBase(chainId);
  const onSite = /(^|\.)terp\.network$/.test(location.hostname);
  if (!base && !onSite) return { ok: false, reason: 'Not set up for this network' };
  try {
    const r = await getJson(`${base}/onboard/v1/status`, 6000);
    if (!r.ok || !r.body) return { ok: false, reason: `Not answering (${r.status})` };
    const b = r.body;
    if (b.chain_id && b.chain_id !== chainId) return { ok: false, reason: `Serves ${b.chain_id}` };
    return {
      ok: b.ok !== false && b.ready !== false,
      feeGranter: b.fee_granter || b.hashmerchant || null,
      allowed: b.allowed_messages || [],
      spendLimit: b.register_spend_limit || null,
      runway: b.runway_amount || null,
      denom: b.runway_denom || 'uthiol',
      broadcast: !!b.broadcast,
      chainId: b.chain_id || chainId,
      ethAge: b.eth_age_grant || null,
      ethAgeDays: Number(b.eth_age_min_days) || 30,
    };
  } catch (e) {
    return { ok: false, reason: e.name === 'AbortError' ? 'Timed out' : 'Not reachable' };
  }
}

// ── fee grant by account age (offline Ethereum-style signature) ──────────
// The desk recovers the signer from an EIP-191 signature over this exact text and
// checks the account's earliest transaction. Lines must stay in this order.

export const ETH_AGE_DOMAIN = 'terp.network';
export const ETH_AGE_PURPOSE = 'fee-grant/account-age';

export function isoSeconds(d = new Date()) {
  return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export function newNonce() {
  return [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function ethAgeMessage({ address, ethAddress, chainId, nonce, issuedAt }) {
  const lines = [`${ETH_AGE_DOMAIN} asks you to sign in with your Terp account to request a fee grant.`, `Account: ${address}`];
  if (ethAddress) lines.push(`Ethereum Address: ${String(ethAddress).toLowerCase()}`);
  lines.push(`Chain ID: ${chainId}`, `Purpose: ${ETH_AGE_PURPOSE}`, `Nonce: ${nonce}`, `Issued At: ${issuedAt}`);
  return lines.join('\n');
}

const ETH_AGE_ERRORS = {
  too_recent: (d) => `This address’s first transaction is less than ${d} days old.`,
  no_activity: () => 'No transactions signed by this address were found.',
  indexer_window_short: () => 'The fee desk cannot look far enough back in the chain’s history to check this right now.',
  indexer_unavailable: () => 'The fee desk could not read the chain’s history just now. Try again later.',
  not_linked: () => 'The Ethereum signature is not tied to this Terp address. Approve the Keplr prompt as well.',
  stale_message: () => 'That signature is too old. Sign again.',
  nonce_used: () => 'That signature was already used. Sign again.',
  wrong_chain: () => 'That signature is for another network.',
  bad_signature: () => 'The Ethereum signature could not be read.',
  bad_cosmos_signature: () => 'The Keplr signature does not match this address.',
  cosmos_signer_mismatch: () => 'The Keplr signature does not match this address.',
};

export async function requestEthAgeGrant({ chainId, address, message, signature, cosmosSignature = null, minDays = 30 }) {
  const base = await onboardBase(chainId);
  const body = { address, message, signature };
  if (cosmosSignature) body.cosmos_signature = cosmosSignature;
  const r = await getJson(`${base}/onboard/v1/eth-age-grant`, 45000, {
    method: 'POST',
    mode: 'cors',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const code = r.body?.error;
    const pretty = r.status === 404 ? 'The fee desk does not offer this yet.' : ETH_AGE_ERRORS[code]?.(minDays) || r.body?.detail || code || `Grant request failed (${r.status})`;
    const err = new Error(pretty);
    err.status = r.status;
    err.code = code;
    err.detail = r.body?.detail || '';
    throw err;
  }
  const b = r.body || {};
  return {
    ok: b.ok !== false,
    granter: b.granter || b.msg?.granter || null,
    txhash: b.txhash || null,
    runwayTx: b.runway_txhash || b.runway?.txhash || null,
    eligibility: b.eligibility || null,
    raw: b,
  };
}

// ── Ethereum wallet (EIP-1193 provider, e.g. MetaMask) ────────────────────

export function ethProvider() {
  return typeof window !== 'undefined' && window.ethereum?.request ? window.ethereum : null;
}

export async function ethAccount() {
  const p = ethProvider();
  if (!p) throw new Error('No Ethereum wallet found in this browser.');
  const list = await p.request({ method: 'eth_requestAccounts' });
  const a = String(list?.[0] || '').toLowerCase();
  if (!/^0x[0-9a-f]{40}$/.test(a)) throw new Error('The Ethereum wallet did not share an address.');
  return a;
}

export function toHex(u8) {
  return [...u8].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** EIP-191 personal_sign of text or bytes; returns 65 bytes (r ‖ s ‖ v). */
export async function ethPersonalSign(data, account) {
  const p = ethProvider();
  if (!p) throw new Error('No Ethereum wallet found in this browser.');
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data;
  const sig = await p.request({ method: 'personal_sign', params: [`0x${toHex(bytes)}`, account] });
  const hex = String(sig || '').replace(/^0x/, '');
  if (hex.length !== 130) throw new Error('The Ethereum wallet returned an unexpected signature.');
  return { hex: `0x${hex}`, bytes: Uint8Array.from(hex.match(/../g).map((h) => parseInt(h, 16))) };
}

/** ADR-036 signArbitrary from Keplr or Leap: {pub_key:{type,value}, signature}. */
export async function cosmosSignArbitrary(chainId, provider, address, text) {
  const ext = provider === 'leap' ? window.leap : window.keplr;
  if (!ext?.signArbitrary) throw new Error('This wallet cannot sign a message.');
  return ext.signArbitrary(chainId, address, text);
}

// ── message building ──────────────────────────────────────────────────────

export function short(a) {
  if (!a) return '';
  return a.length > 18 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a;
}

export function bytesToB64(u8) {
  let s = '';
  for (const b of u8) s += String.fromCharCode(b);
  return btoa(s);
}

/** Data for CosmwasmAuthenticatorV1: JSON {contract, params: base64(JSON params)}. */
export function cosmwasmAuthData(contract, params) {
  return new TextEncoder().encode(JSON.stringify({ contract, params: b64json(params || {}) }));
}

export function passkeyParams(pk) {
  return {
    credential_id: pk?.credentialId || null,
    public_key: pk?.publicKey || null,
    rp_id: pk?.rpId || location.hostname,
    alg: pk?.alg ?? null,
  };
}

/** One AnyOf / AllOf member: {type, config: base64(bytes)}. */
export function subAuth(type, bytes) {
  return { type, config: bytesToB64(bytes) };
}

export function compositeData(subs) {
  return new TextEncoder().encode(JSON.stringify(subs));
}

export function b64ToBytes(b64) {
  return Uint8Array.from(atob(String(b64 || '')), (c) => c.charCodeAt(0));
}

/** Members of an AnyOf / AllOf authenticator from its on-chain config, or null. */
export function compositeSubs(a) {
  try {
    const j = JSON.parse(new TextDecoder().decode(b64ToBytes(a.config)));
    return Array.isArray(j) ? j.map((x) => ({ type: String(x.type || ''), config: String(x.config || '') })) : null;
  } catch {
    return null;
  }
}

/** Contract named in a CosmwasmAuthenticatorV1 config (base64 of JSON), or null. */
export function cosmwasmContractOf(configB64) {
  try {
    return JSON.parse(new TextDecoder().decode(b64ToBytes(configB64)))?.contract || null;
  } catch {
    return null;
  }
}

export async function contractCodeId(rest, contract) {
  const r = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${encodeURIComponent(contract)}`);
  if (!r.ok) throw new Error(r.body?.message || `contract ${r.status}`);
  return Number(r.body?.contract_info?.code_id || 0);
}

/** Readable view of messages for the confirm step (the bytes that get signed). */
export function describeMsgs(messages) {
  return messages.map((m) => {
    const d = m.preview || {};
    return { '@type': m.typeUrl, ...d };
  });
}

export function addMsg(sender, type, data, preview) {
  return {
    typeUrl: MSG_ADD,
    value: encodeAdd({ sender, type, data }),
    preview: { sender, authenticator_type: type, data: preview ?? bytesToB64(data) },
  };
}

export function removeMsg(sender, id) {
  return { typeUrl: MSG_REMOVE, value: encodeRemove({ sender, id }), preview: { sender, id: String(id) } };
}

export function instantiateMsg({ sender, admin = '', codeId, label, msg }) {
  return {
    typeUrl: MSG_INSTANTIATE,
    value: encodeInstantiate({ sender, admin, codeId, label, msg }),
    preview: { sender, admin, code_id: String(codeId), label, msg, funds: [] },
  };
}

// ── signing (Keplr / Leap direct signer) ──────────────────────────────────

function varint(out, n) {
  let v = BigInt(n);
  while (v > 0x7fn) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; }
  out.push(Number(v));
}
function field(no, bytes) {
  const out = [];
  varint(out, (no << 3) | 2);
  varint(out, bytes.length);
  return Uint8Array.from([...out, ...bytes]);
}
const utf8 = (s) => new TextEncoder().encode(String(s));
function cat(parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

export function encodeAdd({ sender, type, data }) {
  return cat([field(1, utf8(sender)), field(2, utf8(type)), field(3, data)]);
}
export function encodeRemove({ sender, id }) {
  const idb = [];
  varint(idb, (2 << 3) | 0);
  varint(idb, BigInt(id));
  return cat([field(1, utf8(sender)), Uint8Array.from(idb)]);
}
/** cosmwasm.wasm.v1.MsgInstantiateContract {sender=1, admin=2, code_id=3, label=4, msg=5, funds=6}. */
export function encodeInstantiate({ sender, admin = '', codeId, label, msg }) {
  const parts = [field(1, utf8(sender))];
  if (admin) parts.push(field(2, utf8(admin)));
  const code = [];
  varint(code, (3 << 3) | 0);
  varint(code, BigInt(codeId));
  parts.push(Uint8Array.from(code), field(4, utf8(label)), field(5, utf8(JSON.stringify(msg))));
  return cat(parts);
}
export function encodeTxExtension(ids) {
  const inner = [];
  for (const id of ids) varint(inner, BigInt(id));
  return field(1, Uint8Array.from(inner));
}

export function directSigner(chainId, provider) {
  const ext = provider === 'leap' ? window.leap : window.keplr;
  if (!ext?.getOfflineSigner) return null;
  const s = ext.getOfflineSigner(chainId);
  return typeof s?.signDirect === 'function' ? s : null;
}

export async function signerPubkey(chainId, provider) {
  const s = directSigner(chainId, provider);
  if (!s) return null;
  const [acc] = await s.getAccounts();
  return acc?.pubkey ? bytesToB64(acc.pubkey) : null;
}

const CJS = 'https://cdn.jsdelivr.net/npm/';

/** Authenticator id this key can approve with: a SignatureVerification for it, or an AnyOf that includes it. */
export function findAuthForKey(auths, pubB64) {
  if (!pubB64) return null;
  const direct = auths.find((a) => a.type === SIG_TYPE && a.config === pubB64);
  if (direct) return direct;
  return auths.find((a) => a.type === ANY_OF_TYPE && (compositeSubs(a) || []).some((x) => x.type === SIG_TYPE && x.config === pubB64)) || null;
}

/** Contracts behind CosmwasmAuthenticatorV1 entries (top level or inside AnyOf), with their authenticator id. */
export function cosmwasmEntries(auths) {
  const out = [];
  for (const a of auths) {
    if (a.type === COSMWASM_TYPE) {
      const c = cosmwasmContractOf(a.config);
      if (c) out.push({ id: a.id, contract: c, nested: false });
    } else if (a.type === ANY_OF_TYPE || a.type === ALL_OF_TYPE) {
      for (const x of compositeSubs(a) || []) {
        if (x.type !== COSMWASM_TYPE) continue;
        const c = cosmwasmContractOf(x.config);
        if (c) out.push({ id: a.id, contract: c, nested: true, composite: a.type });
      }
    }
  }
  return out;
}

/** Ethereum signers registered on the account through the terp-eth contract. */
export async function ethAuthenticators(rest, auths, ethCodeId) {
  if (!ethCodeId) return [];
  const list = cosmwasmEntries(auths).filter((e) => !e.composite || e.composite === ANY_OF_TYPE);
  const out = [];
  for (const e of list) {
    try {
      if ((await contractCodeId(rest, e.contract)) !== Number(ethCodeId)) continue;
      const signer = await smartQuery(rest, e.contract, { signer: {} });
      out.push({ ...e, signer: String(signer || '').toLowerCase() });
    } catch { /* unreadable entry: skip */ }
  }
  return out;
}

/** Poll LCD for a broadcast tx (up to ~30 s). */
export async function waitTx(rest, hash, ms = 30000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      const r = await getJson(`${trim(rest)}/cosmos/tx/v1beta1/txs/${hash}`, 6000);
      if (r.ok && r.body?.tx_response) return r.body.tx_response;
    } catch { /* keep waiting */ }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return null;
}

export function instantiatedAddress(txResponse) {
  for (const ev of txResponse?.events || []) {
    if (ev.type !== 'instantiate') continue;
    const a = (ev.attributes || []).find((x) => x.key === '_contract_address');
    if (a?.value) return a.value;
  }
  return null;
}

/**
 * Sign and broadcast smart-account messages.
 * signer: {kind:'wallet'} (Keplr/Leap direct signing, default), {kind:'device', wallet}
 * (a passkey-unlocked key registered on the account) or {kind:'eth', account, authId}
 * (EIP-191 over the SignDoc, for a terp-eth authenticator). The account key signs on
 * the plain path; another key selects its authenticator with a TxExtension.
 */
export async function signAccountMsgs({ chain, provider, address, messages, feeGranter = '', memo = '', gas = 400000, signer = { kind: 'wallet' } }) {
  const keplr = directSigner(chain.chainId, provider);
  if (!keplr) throw new Error('This needs Keplr or Leap (direct signing).');
  const [enc, ps, txTypes] = await Promise.all([
    import(`${CJS}@cosmjs/encoding@0.32.4/+esm`),
    import(`${CJS}@cosmjs/proto-signing@0.32.4/+esm`),
    import(`${CJS}cosmjs-types@0.9.0/cosmos/tx/v1beta1/tx.js/+esm`),
  ]);
  const TxBody = txTypes.TxBody || txTypes.default?.TxBody;
  const TxRaw = txTypes.TxRaw || txTypes.default?.TxRaw;
  const [acc] = await keplr.getAccounts();
  if (acc?.address && acc.address !== address) throw new Error('The wallet’s active account is not this address.');
  const myKey = bytesToB64(acc.pubkey);

  const accR = await getJson(`${trim(chain.rest)}/cosmos/auth/v1beta1/accounts/${address}`);
  const a = accR.body?.account;
  const base = a?.base_account || a;
  if (!accR.ok || !base?.account_number) throw new Error('This address is not on chain yet. It needs a first transfer (the fee grant sends one).');

  const extensions = [];
  let signWith = null;
  if (signer.kind === 'device') {
    const [dev] = await signer.wallet.getAccounts();
    const auths = await listAuthenticators(chain.rest, address);
    const hit = findAuthForKey(auths, bytesToB64(dev.pubkey));
    if (!hit) throw new Error('This device’s key is not registered on the account.');
    extensions.push({ typeUrl: TX_EXTENSION, value: encodeTxExtension(messages.map(() => hit.id)) });
    signWith = 'device';
  } else if (signer.kind === 'eth') {
    if (!signer.authId) throw new Error('No Ethereum authenticator selected.');
    extensions.push({ typeUrl: TX_EXTENSION, value: encodeTxExtension(messages.map(() => signer.authId)) });
    signWith = 'eth';
  }

  const bodyBytes = TxBody.encode(TxBody.fromPartial({ messages: messages.map(({ typeUrl, value }) => ({ typeUrl, value })), memo, nonCriticalExtensionOptions: extensions })).finish();
  const fee = [{ denom: chain.denom || 'uthiol', amount: String(Math.ceil(gas * 0.025)) }];
  const pubkey = ps.encodePubkey({ type: 'tendermint/PubKeySecp256k1', value: myKey });
  const authInfoBytes = ps.makeAuthInfoBytes([{ pubkey, sequence: Number(base.sequence || 0) }], fee, gas, feeGranter || undefined, undefined);
  const signDoc = ps.makeSignDoc(bodyBytes, authInfoBytes, chain.chainId, Number(base.account_number));

  let sig, signedBody = bodyBytes, signedAuth = authInfoBytes;
  if (signWith === 'device') {
    const [dev] = await signer.wallet.getAccounts();
    const out = await signer.wallet.signDirect(dev.address, signDoc);
    sig = enc.fromBase64(out.signature.signature);
  } else if (signWith === 'eth') {
    sig = (await ethPersonalSign(ps.makeSignBytes(signDoc), signer.account)).bytes;
  } else {
    const out = await keplr.signDirect(address, signDoc);
    signedBody = out.signed.bodyBytes;
    signedAuth = out.signed.authInfoBytes;
    sig = enc.fromBase64(out.signature.signature);
  }
  const raw = TxRaw.encode(TxRaw.fromPartial({ bodyBytes: signedBody, authInfoBytes: signedAuth, signatures: [sig] })).finish();

  const res = await getJson(`${trim(chain.rest)}/cosmos/tx/v1beta1/txs`, 30000, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ tx_bytes: enc.toBase64(raw), mode: 'BROADCAST_MODE_SYNC' }),
  });
  const tr = res.body?.tx_response;
  if (!res.ok || !tr) throw new Error(res.body?.message || `Broadcast failed (${res.status})`);
  if (tr.code) throw new Error(tr.raw_log || `Rejected (code ${tr.code})`);
  return { txhash: tr.txhash };
}
