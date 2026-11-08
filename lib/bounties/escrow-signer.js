// lib/bounties/escrow-signer.js — escrow transactions signed through the site's own signer adapter.
//
// The bounties UI never talks to a wallet directly: like the Staking panel it asks
// lib/staking-signer.js how the account the Connect panel connected can sign (Keplr direct,
// Keplr in Ledger mode = amino-JSON, a passkey device key or an Ethereum authenticator, each with
// ok / reason) and drives the chosen adapter. Messages are cosmwasm MsgExecuteContract built here
// (a few protobuf fields), the escrow JSON comes from the real escrow client's builders
// (/lib/bounties/vendor/escrow-msgs.js, escrow/client msgs.ts), simulate / sign / broadcast go over
// the LCD with lib/staking-tx.js. No cosmjs.
//
// Dev / test chains only: every entry point calls assertDevChain (escrow client), which refuses
// morocco-1 and anything that is not terp-local-1, and the node is asked which network it is
// before anything is signed. No real funds can move.
//
//   const c = await SignerEscrowClient.connect({ contract, address, provider })
//   await c.config(); await c.canSubmit(addr); const r = await c.run(build.approve(7)) // { txHash, height, events }
import * as T from '/lib/staking-tx.js?v=01e06bab65';
import * as SG from '/lib/staking-signer.js?v=5d173677b1';
import { build, assertDevChain, parseBountyEvents, keplrChainInfo, TERP_LOCAL } from '/lib/bounties/vendor/escrow-msgs.js?v=e0ec055621';

export const WASM_EXECUTE = '/cosmwasm.wasm.v1.MsgExecuteContract';
const AMINO_EXECUTE = 'wasm/MsgExecuteContract';

// ── protobuf (cosmwasm.wasm.v1.MsgExecuteContract { sender=1, contract=2, msg=3, funds=5 }, Coin { denom=1, amount=2 }) ──
const utf8 = (s) => new TextEncoder().encode(String(s));
function varint(out, n) { let v = BigInt(n); while (v > 0x7fn) { out.push(Number(v & 0x7fn) | 0x80); v >>= 7n; } out.push(Number(v)); }
function cat(parts) { const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0)); let o = 0; for (const p of parts) { out.set(p, o); o += p.length; } return out; }
function ld(no, bytes, keep = false) {
  const b = typeof bytes === 'string' ? utf8(bytes) : bytes;
  if (!keep && (!b || !b.length)) return new Uint8Array(0);
  const head = []; varint(head, (no << 3) | 2); varint(head, b.length);
  return cat([Uint8Array.from(head), b]);
}
const coin = (c) => cat([ld(1, c.denom), ld(2, String(c.amount))]);

/** One MsgExecuteContract: JSON view (review / amino) + proto bytes. `msg` is sent as UTF-8 JSON bytes. */
export function msgExecute({ sender, contract, msg, funds = [] }) {
  if (!/^terp1[02-9ac-hj-np-z]{38,58}$/.test(sender || '')) throw new Error('Missing sender (connect a wallet).');
  if (!/^terp1[02-9ac-hj-np-z]{38,58}$/.test(contract || '')) throw new Error('Missing escrow contract address.');
  const f = (funds || []).map((c) => ({ denom: String(c.denom), amount: String(c.amount) }));
  const value = { sender, contract, msg, funds: f };
  return { typeUrl: WASM_EXECUTE, value, bytes: cat([ld(1, sender), ld(2, contract), ld(3, utf8(JSON.stringify(msg))), ...f.map((c) => ld(5, coin(c), true))]) };
}
/** Amino-JSON view (what a Ledger shows). */
export const toAmino = (msgs) => msgs.map((m) => ({ type: AMINO_EXECUTE, value: { sender: m.value.sender, contract: m.value.contract, msg: m.value.msg, funds: m.value.funds } }));

// ── LCD ─────────────────────────────────────────────────────────────────────
const trim = (s) => String(s || '').replace(/\/+$/, '');
async function getJson(url, { ms = 8000, ...init } = {}) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { cache: 'no-store', credentials: 'omit', ...init, signal: ctl.signal });
    const text = await r.text(); let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = { message: text.slice(0, 200) }; }
    return { ok: r.ok, status: r.status, body };
  } catch (e) { return { ok: false, status: 0, body: { message: e.name === 'AbortError' ? 'timed out' : 'not reachable (network or CORS)' } }; }
  finally { clearTimeout(t); }
}
/** The network the node at `rest` reports; throws unless it is a dev chain. */
export async function nodeNetwork(rest = TERP_LOCAL.rest, ms = 1500) {
  const r = await getJson(`${trim(rest)}/cosmos/base/tendermint/v1beta1/node_info`, { ms });
  const net = r.body?.default_node_info?.network;
  if (!r.ok || !net) throw new Error(`No ${TERP_LOCAL.chainId} node at ${rest} (${r.body?.message || 'HTTP ' + r.status}).`);
  assertDevChain(net);
  return net;
}
const b64json = (q) => { const s = utf8(JSON.stringify(q)); let x = ''; for (const b of s) x += String.fromCharCode(b); return btoa(x); };
export async function smartQuery(rest, contract, q) {
  const r = await getJson(`${trim(rest)}/cosmwasm/wasm/v1/contract/${contract}/smart/${encodeURIComponent(b64json(q))}`);
  if (!r.ok) throw new Error(`query ${Object.keys(q)[0]}: ${T.cleanErr(r.body?.message || 'HTTP ' + r.status)}`);
  return r.body?.data;
}
function parseGasPrice(s) { const m = String(s || '').match(/^([\d.]+)([a-z][a-z0-9/]*)$/i); return m ? { amount: Number(m[1]), denom: m[2] } : null; }
const sortKeys = (x) => Array.isArray(x) ? x.map(sortKeys) : x && typeof x === 'object' ? Object.keys(x).sort().reduce((o, k) => { o[k] = sortKeys(x[k]); return o; }, {}) : x;
const sameJson = (a, b) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

/** Signer options for `address` on the dev chain (Keplr / Ledger / passkey / eth / abstract), as the Staking panel lists them. */
export async function devSigners({ address, provider, chain = TERP_LOCAL, deps } = {}) {
  assertDevChain(chain.chainId);
  // Keplr only knows a key for a chain it has been told about: suggest the LOCAL dev chain (never morocco-1).
  const k = typeof window !== 'undefined' ? window.keplr : null;
  if (k && typeof k.experimentalSuggestChain === 'function' && (!provider || /keplr|ledger/i.test(String(provider)))) {
    try { await k.experimentalSuggestChain(keplrChainInfo(chain)); await k.enable(chain.chainId); } catch { /* declined: Keplr is listed with its reason */ }
  }
  const ctx = { chainId: chain.chainId, rest: chain.rest, address, provider, contracts: {} };
  const list = await SG.listSigners(ctx, deps);
  return { ctx, list, pick: SG.pickDefault(list) };
}

export class SignerEscrowClient {
  constructor({ contract, chain, address, adapter, option, options }) { Object.assign(this, { contract, chain, sender: address, adapter, option, options }); }

  static async connect({ contract, address, provider, chain = TERP_LOCAL, signerId = null, deps } = {}) {
    assertDevChain(chain.chainId);
    if (!address) throw new Error('Connect a wallet first (Connect, at the top of the page).');
    const net = await nodeNetwork(chain.rest);
    if (net !== chain.chainId) throw new Error(`The node at ${chain.rest} is ${net}, not ${chain.chainId}.`);
    const { ctx, list, pick } = await devSigners({ address, provider, chain, deps });
    const opt = list.find((o) => o.id === (signerId || pick));
    if (!opt || !opt.ok) throw new Error(`This account cannot sign on ${chain.chainId}: ${list.filter((o) => !o.ok).map((o) => `${o.label}: ${o.reason}`).join(' · ') || 'no signer'}`);
    return new SignerEscrowClient({ contract, chain, address, adapter: SG.resolveAdapter(opt, ctx, deps), option: opt, options: list });
  }

  get label() { return this.option ? this.option.label : 'wallet'; }
  smart(q) { return smartQuery(this.chain.rest, this.contract, q); }
  config() { return this.smart({ config: {} }); }
  bounty(id) { return this.smart({ bounty: { id } }); }
  isEligible(address) { return this.smart({ is_eligible: { address } }); }
  canSubmit(address) { return this.smart({ can_submit: { address } }); }
  canUpload(address) { return this.smart({ can_upload: { address } }); }

  async gasPrice() {
    const p = await T.minGasPrice(this.chain.rest).catch(() => null);
    return p && p.amount > 0 ? p : parseGasPrice(this.chain.gasPrice) || { amount: 0.05, denom: 'uthiol' };
  }

  /** Simulate, sign through the adapter, broadcast over LCD, wait for the block. Returns { txHash, height, events }. */
  async run(b, memo = '', onStep = () => {}) {
    assertDevChain(this.chain.chainId);
    const { rest, chainId } = this.chain, ad = this.adapter;
    const msgs = [msgExecute({ sender: this.sender, contract: this.contract, msg: b.msg, funds: b.funds })];
    await ad.prepare?.(msgs.length);
    const mode = ad.mode === 'amino' ? T.SIGN_MODE.amino : T.SIGN_MODE.direct;
    onStep('Estimating the fee…');
    const estimate = await T.simulate({ rest, address: this.sender, msgs, pubkey: await ad.pubkey(), memo, gasPrice: await this.gasPrice(), mode, extensions: ad.extensions?.(msgs.length) || [] });
    const raw = ad.mode === 'amino' ? await this.signAmino(msgs, estimate, memo, onStep) : await T.buildSigned({ chainId, msgs, memo, estimate, adapter: ad, onStep });
    const hash = await T.txHash(raw);
    onStep('Broadcasting…', { hash });
    const r = await getJson(`${trim(rest)}/cosmos/tx/v1beta1/txs`, { ms: 30000, method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tx_bytes: T.toB64(raw), mode: 'BROADCAST_MODE_SYNC' }) });
    const tr = r.body?.tx_response;
    if (!r.ok || !tr) throw Object.assign(new Error(T.cleanErr(r.body?.message || `Broadcast failed (${r.status})`)), { hash });
    if (tr.code) throw Object.assign(new Error(T.cleanErr(tr.raw_log) || `Rejected (code ${tr.code})`), { hash: tr.txhash || hash });
    onStep('In the mempool. Waiting for a block…', { hash: tr.txhash });
    const end = Date.now() + 45000;
    while (Date.now() < end) {
      await new Promise((res) => setTimeout(res, 1500));
      const c = await getJson(`${trim(rest)}/cosmos/tx/v1beta1/txs/${tr.txhash}`, { ms: 6000 });
      const t = c.body?.tx_response;
      if (c.ok && t) {
        if (t.code) throw Object.assign(new Error(T.cleanErr(t.raw_log) || `Failed in block (code ${t.code})`), { hash: t.txhash });
        return { txHash: t.txhash, height: Number(t.height), gasUsed: t.gas_used, events: parseBountyEvents(t.events || []) };
      }
    }
    throw Object.assign(new Error('Sent, but not in a block after 45 s.'), { hash: tr.txhash });
  }

  // Ledger (Keplr in hardware mode): SIGN_MODE_LEGACY_AMINO_JSON with the wasm amino type.
  async signAmino(msgs, est, memo, onStep) {
    const ad = this.adapter, pubkey = await ad.pubkey();
    if ((ad.extensions?.(msgs.length) || []).length) throw new Error('Amino signing cannot carry a smart-account extension.');
    const doc = { chain_id: this.chain.chainId, account_number: BigInt(est.accountNumber).toString(), sequence: BigInt(est.sequence).toString(),
      fee: { amount: est.fee.map((c) => ({ denom: c.denom, amount: String(c.amount) })), gas: BigInt(est.gas).toString() }, msgs: toAmino(msgs), memo };
    onStep(ad.waitText || 'Waiting for your wallet…');
    const out = await ad.signAmino(doc), s = out.signed;
    if (!sameJson(s.msgs, doc.msgs) || s.chain_id !== doc.chain_id || s.account_number !== doc.account_number || s.sequence !== doc.sequence) throw new Error('The wallet changed the messages. Nothing was sent.');
    const bodyBytes = T.encodeTxBody({ msgs, memo: s.memo || '' });
    const authInfoBytes = T.encodeAuthInfo({ pubkey, sequence: BigInt(s.sequence), fee: s.fee.amount, gas: BigInt(s.fee.gas), granter: s.fee.granter || '', mode: T.SIGN_MODE.amino });
    return T.encodeTxRaw({ bodyBytes, authInfoBytes, signatures: [out.signature] });
  }

  createBounty(p) { return this.run(build.createBounty(p)); }
  approve(id) { return this.run(build.approve(id)); }
  reject(id, reason) { return this.run(build.reject(id, reason)); }
  cancel(id) { return this.run(build.cancel(id)); }
  assign(id, assignee) { return this.run(build.assign(id, assignee)); }
  unassign(id) { return this.run(build.unassign(id)); }
  submit(id, hash, cid) { return this.run(build.submit(id, hash, cid)); }
  requestChanges(id, reason) { return this.run(build.requestChanges(id, reason)); }
  accept(id) { return this.run(build.accept(id)); }
  payout(id, amount) { return this.run(build.payout(id, amount)); }
  settleRemainder(id) { return this.run(build.settleRemainder(id)); }
  expire(id) { return this.run(build.expire(id)); }
}
