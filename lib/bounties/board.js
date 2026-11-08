// board.js — the on-chain bounty board (chain1). No backend: the board contract (a DAO pre-propose module) and
// one escrow contract per task are the source of truth; task/application/submission documents are CIDs whose
// bytes live in the S3 bucket (and IPFS) and are verified in the browser (./cid.js).
//
// Interface: design/specs/bounties-onchain-2026-10-19.md §3 (PROPOSED contracts terp-bounty-board and
// terp-bounty-task-escrow; neither is deployed). Everything here is pure: query/message builders, the LCD read
// client and the instantiate2 address of a task escrow. Nothing in this file signs or broadcasts.
import { sha256, toUtf8, toHex } from '/lib/bounties/vendor/escrow-msgs.js?v=e0ec055621-r2';

export const WASM_EXECUTE = '/cosmwasm.wasm.v1.MsgExecuteContract';
export const STATUSES = ['proposed', 'approved', 'rejected', 'funding', 'open', 'assigned', 'submitted', 'accepted', 'paid', 'cancelled', 'expired', 'refunded'];
export const PAGE = 30;   // the board's max page size (spec §3.3)

// ── config ─────────────────────────────────────────────────────────────────────────────────────────────────
// public/config.json chains[<id>].bounties: { contract, dao, proposalModule, cidGateway[], codeIds{board,escrow},
// escrowChecksum }. Empty contract = not live on that network: the page shows the bundled catalog as a preview.
export const DEFAULT_GATEWAYS = ['https://s3.terp.network/static/bounties/cid/'];
export function boardConfig(chain = {}) {
  const b = chain.bounties || {};
  const gw = Array.isArray(b.cidGateway) ? b.cidGateway : b.cidGateway ? [b.cidGateway] : DEFAULT_GATEWAYS;
  const ids = b.codeIds || {};
  return {
    chainId: chain.chainId || '', rest: chain.rest || '', contract: b.contract || '', dao: b.dao || '', proposalModule: b.proposalModule || '', prePropose: b.prePropose || '',
    cidGateway: gw.filter(Boolean), codeIds: { board: ids.board ?? null, escrow: ids.escrow ?? null }, escrowChecksum: b.escrowChecksum || '',
    live: !!(b.contract && chain.rest),
  };
}

// ── queries (snake_case JSON, cw-serde) ────────────────────────────────────────────────────────────────────
const page = (o = {}) => ({ ...(o.startAfter != null ? { start_after: o.startAfter } : {}), limit: Math.min(o.limit || PAGE, PAGE) });
export const Q = {
  config: () => ({ config: {} }),
  counts: () => ({ counts: {} }),
  task: (taskId) => ({ task: { task_id: Number(taskId) } }),
  taskByRef: (ref) => ({ task_by_ref: { ref: String(ref) } }),
  taskByEscrow: (escrow) => ({ task_by_escrow: { escrow } }),
  tasks: (f = {}) => ({ tasks: { ...(f.status ? { status: f.status } : {}), ...(f.category ? { category: f.category } : {}), ...(f.creator ? { creator: f.creator } : {}), ...(f.assignee ? { assignee: f.assignee } : {}), ...page(f) } }),
  applications: (taskId, o) => ({ applications: { task_id: Number(taskId), ...page(o) } }),
  applicationsBy: (applicant, o) => ({ applications_by: { applicant, ...page(o) } }),
  submissions: (taskId, o) => ({ submissions: { task_id: Number(taskId), ...page(o) } }),
  submissionsBy: (submitter, o) => ({ submissions_by: { submitter, ...page(o) } }),
  predictEscrow: (taskId) => ({ predict_escrow: { task_id: Number(taskId) } }),
  canCreate: (address) => ({ can_create: { address } }),
  canPropose: (address) => ({ can_propose: { address } }),
  canSubmit: (address) => ({ can_submit: { address } }),
  // per-task escrow
  escrowState: () => ({ state: {} }),
  deposits: (o) => ({ deposits: page(o) }),
};

const b64 = (s) => (typeof btoa === 'function' ? btoa(unescape(encodeURIComponent(s))) : Buffer.from(s, 'utf8').toString('base64'));
export const smartPath = (contract, msg) => `/cosmwasm/wasm/v1/contract/${contract}/smart/${encodeURIComponent(b64(JSON.stringify(msg)))}`;

/** LCD smart-query client. fetchImpl and a short in-memory TTL cache are injectable (tests mock the LCD). */
export function lcd(rest, { fetchImpl = (...a) => fetch(...a), ttlMs = 15000, timeoutMs = 8000, now = () => Date.now() } = {}) {
  const cache = new Map();
  const base = String(rest || '').replace(/\/+$/, '');
  async function smart(contract, msg, { fresh = false } = {}) {
    if (!base) throw new Error('No Terp node (LCD) is configured for this network.');
    const path = smartPath(contract, msg), hit = cache.get(path);
    if (!fresh && hit && now() - hit.at < ttlMs) return hit.data;
    const ctl = typeof AbortController === 'function' ? new AbortController() : null;
    const t = ctl && setTimeout(() => ctl.abort(), timeoutMs);
    let r;
    try { r = await fetchImpl(base + path, { credentials: 'omit', cache: 'no-store', signal: ctl && ctl.signal }); }
    catch (e) { throw new Error(e && e.name === 'AbortError' ? 'The Terp node took too long to answer.' : `Couldn’t reach the Terp node (${e.message}).`); }
    finally { if (t) clearTimeout(t); }
    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(`The contract refused the query: ${(j && (j.message || j.error)) || 'HTTP ' + r.status}`);
    if (!j || !('data' in j)) throw new Error('The Terp node sent an unexpected answer.');
    cache.set(path, { at: now(), data: j.data });
    return j.data;
  }
  return { smart, cache, base };
}

/** Every task on the board, page by page (start_after = last id). Stops at `max`. */
export async function readTasks(client, contract, f = {}, max = 2000) {
  const out = [];
  let after = f.startAfter ?? null;
  for (let guard = 0; guard < Math.ceil(max / PAGE) + 1; guard++) {
    const r = await client.smart(contract, Q.tasks({ ...f, startAfter: after }));
    const rows = (r && r.tasks) || [];
    out.push(...rows);
    if (rows.length < Math.min(f.limit || PAGE, PAGE) || out.length >= max) break;
    after = r.next != null ? r.next : rows[rows.length - 1].id;
  }
  return out.slice(0, max);
}

// ── board status -> site badge (panel.js STATUS_LABEL keys) ───────────────────────────────────────────────
export const BADGE_OF = { proposed: 'vote', approved: 'escrow', funding: 'escrow', open: 'open', assigned: 'assigned', submitted: 'review', accepted: 'accepted', paid: 'paid', rejected: 'closed', cancelled: 'closed', expired: 'closed', refunded: 'closed' };
// board status -> timeline state (timeline.js STATE_AT)
export const TIMELINE_OF = { proposed: 'proposed', approved: 'approved', funding: 'approved', open: 'open', assigned: 'assigned', submitted: 'submitted', accepted: 'accepted', paid: 'paid' };

// ── messages (MsgExecuteContract; JSON msg as UTF-8 bytes) ────────────────────────────────────────────────
export const coin = (denom, amount) => ({ denom: String(denom), amount: String(amount) });
export function execute(sender, contract, msg, funds = []) {
  return { typeUrl: WASM_EXECUTE, value: { sender, contract, msg, funds: funds.map((c) => coin(c.denom, c.amount)) } };
}
/** cosmjs EncodeObject (msg bytes) for a signer adapter; the JSON form stays the preview. */
export const encode = (m) => ({ typeUrl: m.typeUrl, value: { ...m.value, msg: toUtf8(JSON.stringify(m.value.msg)) } });
/** A wasm execute as a DAO DAO CosmosMsg (what a DAO proposal carries). */
export const daoWasm = (contract, msg, funds = []) => ({ wasm: { execute: { contract_addr: contract, msg: b64(JSON.stringify(msg)), funds: funds.map((c) => coin(c.denom, c.amount)) } } });

// CID write path (spec §6, recommended option A): the document's canonical bytes ride inside the message as
// `doc` (base64) when they are at most INLINE_MAX bytes. The contract checks sha256(doc) == the CID digest and
// does NOT store the bytes; the transaction keeps them in chain history, and a stateless mirror copies them to the
// bucket under their CID. Bigger documents go by CID only (pinned by their author; spec §6 option D).
export const INLINE_MAX = 16384;
const b64bytes = (u8) => { let x = ''; for (let i = 0; i < u8.length; i += 0x8000) x += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return typeof btoa === 'function' ? btoa(x) : Buffer.from(u8).toString('base64'); };
export const inlineDoc = (bytes) => (bytes && bytes.length && bytes.length <= INLINE_MAX ? b64bytes(bytes) : null);
const withDoc = (o, key, bytes) => { const d = inlineDoc(bytes); return d ? { ...o, [key]: d } : o; };
const SECS = (d) => String(Math.floor((d instanceof Date ? d.getTime() : Number(d)) / 1000));
/** TaskInput: what the board stores on chain. Long text lives in the details document (details_cid). */
export function taskInput(t) {
  for (const k of ['ref', 'title', 'summary', 'category', 'detailsCid']) if (!t[k]) throw new Error(`task: ${k} is required`);
  if (!t.reward || !t.reward.denom || !/^[1-9]\d*$/.test(String(t.reward.amount))) throw new Error('task: reward {denom, amount} is required');
  return {
    ref: String(t.ref), title: t.title, summary: t.summary, category: t.category, priority: t.priority || 'P2', tier: t.tier || 'T2',
    details_cid: t.detailsCid, reward: coin(t.reward.denom, t.reward.amount),
    expires_at: t.expiresAt != null ? SECS(t.expiresAt) : null, ...(t.reviewer ? { reviewer: t.reviewer } : {}),
  };
}

export const Msg = {
  /** Authorised creator (board config creator policy): create + fund in one step; the board instantiate2s the escrow. */
  createTask: (sender, board, t, docBytes) => execute(sender, board, { create_task: withDoc({ task: taskInput(t) }, 'details_doc', docBytes) }, [t.reward]),
  /** Anyone allowed by the submission policy: a DAO proposal through the board (pre-propose `propose`). With
   *  sponsor=true the proposer's reward is locked in the task escrow now and refunded if the vote fails; otherwise the
   *  passed proposal pays the reward from the DAO treasury when it executes `launch`. Deposit = board deposit_info. */
  proposeTask: (sender, board, t, { sponsor = false, deposit = null, docBytes = null } = {}) =>
    execute(sender, board, { propose: { msg: { propose_task: withDoc({ task: taskInput(t), sponsor }, 'details_doc', docBytes) } } }, [...(sponsor ? [t.reward] : []), ...(deposit ? [deposit] : [])]),
  /** DAO-only: list many tasks at once (catalog migration). Status `approved` (pending escrow), no funds. */
  registerTasks: (sender, board, tasks) => execute(sender, board, { register_tasks: { tasks: tasks.map(taskInput) } }),   // docs by CID (mirrored first)
  /** Fund a task: before its escrow exists the board instantiate2s it with these funds (launch); afterwards funds go
   *  straight to the escrow (fund), recorded per depositor for refunds. */
  fund: (sender, { board, taskId, escrow }, funds) => (escrow ? execute(sender, escrow, { fund: {} }, funds) : execute(sender, board, { launch: { task_id: Number(taskId) } }, funds)),
  apply: (sender, board, taskId, cid, docBytes) => execute(sender, board, { apply: withDoc({ task_id: Number(taskId), cid }, 'doc', docBytes) }),
  withdrawApplication: (sender, board, taskId) => execute(sender, board, { withdraw_application: { task_id: Number(taskId) } }),
  claim: (sender, escrow) => execute(sender, escrow, { claim: {} }),
  assign: (sender, escrow, assignee) => execute(sender, escrow, { assign: { assignee } }),
  submit: (sender, escrow, cid, docBytes) => execute(sender, escrow, { submit: withDoc({ cid }, 'doc', docBytes) }),
  requestChanges: (sender, escrow, reason) => execute(sender, escrow, { request_changes: { reason: reason || null } }),
  /** Reviewer: accept submission `seq` and pay `amount` (default: everything held) in the same message. */
  approve: (sender, escrow, seq, amount) => execute(sender, escrow, { approve: { seq: Number(seq), amount: amount != null ? String(amount) : null } }),
  cancel: (sender, escrow) => execute(sender, escrow, { cancel: {} }),
  claimRefund: (sender, escrow) => execute(sender, escrow, { claim_refund: {} }),
};

/** Wrap execute messages into a DAO proposal (dao-pre-propose-single `propose`), for when the reviewer or
 *  approver is the DAO itself. `prePropose` = the DAO's pre-propose module; the DAO executes `msgs` if it passes. */
export function asDaoProposal(sender, prePropose, { title, description }, msgs, deposit = null) {
  return execute(sender, prePropose, { propose: { msg: { propose: { title, description, msgs: msgs.map((m) => daoWasm(m.value.contract, m.value.msg, m.value.funds)) } } } }, deposit ? [deposit] : []);
}

/** Readable preview (what the wallet shows), one object per tx. */
// The inline document is shown as its size, not 10 KB of base64 (the message itself carries the bytes).
const DOC_KEYS = new Set(['doc', 'details_doc']);
const short = (v) => (Array.isArray(v) ? v.map(short) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v).map(([k, x]) => [k, DOC_KEYS.has(k) && typeof x === 'string' ? `<${Math.floor(x.length * 3 / 4) - (x.endsWith('==') ? 2 : x.endsWith('=') ? 1 : 0)} bytes of the document, base64>` : short(x)])) : v);
export const preview = (chainId, msgs, note = '') => ({ chain_id: chainId, messages: msgs.map((m) => ({ typeUrl: m.typeUrl, value: short(m.value) })), ...(note ? { note } : {}) });

// ── instantiate2: the address of task N's escrow, before it exists ────────────────────────────────────────
// wasmd BuildContractAddressPredictable / cosmwasm-std instantiate2_address with fix_msg = false:
// sha256(sha256("module") || "wasm\0" || len64(checksum)||checksum || len64(creator)||creator || len64(salt)||salt || len64(msg=""))
const CS = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(v) { let c = 1; for (const x of v) { const b = c >> 25; c = ((c & 0x1ffffff) << 5) ^ x; for (let i = 0; i < 5; i++) if ((b >> i) & 1) c ^= [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3][i]; } return c; }
const hrpExpand = (h) => [...[...h].map((c) => c.charCodeAt(0) >> 5), 0, ...[...h].map((c) => c.charCodeAt(0) & 31)];
function convert(data, from, to, pad) { let acc = 0, bits = 0; const out = [], max = (1 << to) - 1; for (const v of data) { acc = (acc << from) | v; bits += from; while (bits >= to) { bits -= to; out.push((acc >> bits) & max); } } if (pad && bits) out.push((acc << (to - bits)) & max); else if (!pad && (bits >= from || ((acc << (to - bits)) & max))) throw new Error('bech32: bad padding'); return out; }
export function bech32Decode(s) {
  const str = String(s).toLowerCase(), p = str.lastIndexOf('1');
  if (p < 1 || str.length > 120) throw new Error('bech32: bad address');
  const hrp = str.slice(0, p), data = [...str.slice(p + 1)].map((c) => { const i = CS.indexOf(c); if (i < 0) throw new Error('bech32: bad character'); return i; });
  if (polymod([...hrpExpand(hrp), ...data]) !== 1) throw new Error('bech32: bad checksum');
  return { prefix: hrp, bytes: Uint8Array.from(convert(data.slice(0, -6), 5, 8, false)) };
}
export function bech32Encode(prefix, bytes) {
  const data = convert([...bytes], 8, 5, true);
  const mod = polymod([...hrpExpand(prefix), ...data, 0, 0, 0, 0, 0, 0]) ^ 1;
  return prefix + '1' + [...data, ...[0, 1, 2, 3, 4, 5].map((i) => (mod >> (5 * (5 - i))) & 31)].map((i) => CS[i]).join('');
}
const fromHex = (h) => Uint8Array.from(String(h).match(/../g).map((x) => parseInt(x, 16)));
const len64 = (u8) => { const o = new Uint8Array(8); let n = u8.length; for (let i = 7; i >= 0; i--) { o[i] = n & 0xff; n = Math.floor(n / 256); } return o; };
const cat = (...a) => { const o = new Uint8Array(a.reduce((s, x) => s + x.length, 0)); let i = 0; for (const x of a) { o.set(x, i); i += x.length; } return o; };
export function instantiate2Canonical(checksum, creatorBytes, salt, msg = new Uint8Array()) {
  const cs = typeof checksum === 'string' ? fromHex(checksum) : checksum;
  if (cs.length !== 32) throw new Error('instantiate2: checksum must be 32 bytes');
  if (!salt.length || salt.length > 64) throw new Error('instantiate2: salt must be 1 to 64 bytes');
  const key = cat(toUtf8('wasm'), Uint8Array.of(0), len64(cs), cs, len64(creatorBytes), creatorBytes, len64(salt), salt, len64(msg), msg);
  return sha256(cat(sha256(toUtf8('module')), key));
}
/** The salt the board uses for task N (spec §3.4): "task:" + big-endian u64 id. */
export const escrowSalt = (taskId) => { const s = new Uint8Array(8); let n = BigInt(taskId); for (let i = 7; i >= 0; i--) { s[i] = Number(n & 0xffn); n >>= 8n; } return cat(toUtf8('task:'), s); };
export function predictEscrow({ board, checksum, taskId }) {
  const { prefix, bytes } = bech32Decode(board);
  return bech32Encode(prefix, instantiate2Canonical(checksum, bytes, escrowSalt(taskId)));
}
export { toHex };
