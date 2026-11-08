// Create/apply/submit/fund/approve plumbing for the bounties page (chain1: no backend).
// * The contracts are the PROPOSED terp-bounty-board (a DAO pre-propose module that holds the config: who may
//   create, deposit rules, allowed denoms) and one terp-bounty-task-escrow per task, created by the board with
//   instantiate2 (design/specs/bounties-onchain-2026-10-19.md). Message shapes live in ./board.js.
// * Documents (details, application, submission) are canonical JSON addressed by a raw CIDv1 (sha2-256); the
//   chain stores the CID, the S3 bucket / IPFS serve the bytes, ./cid.js verifies them in the browser.
// * Nothing here signs. Until the board is live AND signing is switched on (an open decision, spec §9), every
//   action builds its exact message, shows it, and says in one line why it can't be sent yet. The old
//   terp-bounty-escrow dev client (./escrow-signer.js, dev-chain guard) is no longer used by the page.
// * Rewards may be any native bank denom; per-denom caps are public/data/bounties.escrow-params.json
//   (PLACEHOLDERS pending a vote) until the board's own config (query config) replaces them.
import {
  MAINNET_CHAIN_ID, DEV_CHAIN_IDS, fromMicro, sha256, toHex, toUtf8, rewardProblem, summaryProblem, SUMMARY_MAX_BYTES, utf8Length,
} from '/lib/bounties/vendor/escrow-msgs.js?v=e0ec055621-r2';
import { Msg, Q, asDaoProposal, preview as msgPreview, predictEscrow } from '/lib/bounties/board.js?v=29627017de';
import { applicationDoc, validateApplication } from '/lib/bounties/cid.js?v=94332d16b3-r2';
import * as V from '/lib/bounties/vendor/terp-schemas.js?v=4c30a341e9-r2';
import { DENOM_RE, fromBase } from '/lib/bounties/denoms.js?v=2364efe300-r2';
import { detectChainId } from '/lib/config.js?v=a177cb9062';
export { SUMMARY_MAX_BYTES, utf8Length, summaryProblem, DEV_CHAIN_IDS, fromMicro };
export const MAINNET = MAINNET_CHAIN_ID;

// ── schema: terp-bounty-details/v1 with any native denom as the reward ────────────────────────────────────
// The bundled v1 schema still enumerates TERP/THIOL and uterp/uthiol in reward_quote. The site accepts any bank
// denom there (sdk.ValidateDenom) and any short asset label; everything else is the bundled validator, unchanged.
// The matching change in escrow/schemas/terp-bounty-details.v1.schema.json + a bundle rebuild is listed in CHECKPOINT.md.
const RELAXED = new Set(['/reward_quote/asset', '/reward_quote/denom']);
function relax(r, doc) {
  if (!r || !r.fields) return r;
  if (r.version && r.version.status && r.version.status !== 'current') return r;
  const fields = r.fields.filter((f) => !(RELAXED.has(f.path) && /allowed values/.test(f.message)));
  const q = doc && doc.reward_quote;
  if (q && typeof q === 'object') {
    if (typeof q.denom === 'string' && !DENOM_RE.test(q.denom)) fields.push({ path: '/reward_quote/denom', message: 'must be a bank denom (letters first, 3 to 128 of a-z A-Z 0-9 / : . _ -)' });
    if (typeof q.asset === 'string' && !(q.asset.trim() && q.asset.length <= 64)) fields.push({ path: '/reward_quote/asset', message: 'must be a short label, 1 to 64 characters' });
  }
  return { ...r, ok: fields.length === 0, fields, errors: fields.map((f) => `${f.path} ${f.message}`) };
}
// terp-bounty-details/v2 (PROPOSED, spec §4): v1 + an optional `catalog` object (the catalog's own fields) and an
// optional deadline (the escrow's expires_at is the authority). Checked as v1 on the core fields.
export const DETAILS_V2 = 'terp-bounty-details/v2';
function validateV2(doc) {
  const { catalog, ...core } = doc;
  const v1 = { ...core, schema: V.SCHEMA_IDS.details, deadline: core.deadline || '2099-12-31' };
  const r = relax(V.validateDetails(v1), v1);
  const fields = [...(r.fields || [])];
  if (catalog !== undefined && (!catalog || typeof catalog !== 'object' || Array.isArray(catalog))) fields.push({ path: '/catalog', message: 'must be an object' });
  return { ...r, schema: DETAILS_V2, ok: fields.length === 0, fields, errors: fields.map((f) => `${f.path} ${f.message}`) };
}
export const Schemas = {
  ...V,
  validateDetails: (doc) => (doc && doc.schema === DETAILS_V2 ? validateV2(doc) : relax(V.validateDetails(doc), doc)),
  importDetails: (text, o) => { const r = V.importDetails(text, o); return r.doc ? relax(r, r.doc) : r; },
};

// ── governance parameters (caps, gates, deadline window): PLACEHOLDERS until a vote ───────────────────────
export const PARAMS = { loaded: false, denoms: {}, other: null, min_duration_secs: 0, max_duration_secs: 0, min_stake: null, min_submit_stake: null, min_upload_stake: null, params_version: null, params_placeholder: true, label: '', file: null };
export async function loadEscrowParams(url = '/public/data/bounties.escrow-params.json') {
  const r = await fetch(url, { cache: 'no-cache' });
  if (!r.ok) throw new Error(`escrow params: HTTP ${r.status}`);
  const p = await r.json();
  const i = p.instantiate;
  Object.assign(PARAMS, {
    loaded: true, file: p, params_version: p.params_version, params_placeholder: !!p.params_placeholder, label: p.label,
    denoms: Object.fromEntries(i.denoms.map((d) => [d.denom, [d.min_amount, d.max_amount]])),
    other: p.reward_denoms || null,
    min_duration_secs: i.min_duration_secs, max_duration_secs: i.max_duration_secs, min_stake: i.gate && i.gate.min_stake,
    min_submit_stake: i.min_submit_stake, min_submit_stake_label: i._label_min_submit_stake || '',
    min_upload_stake: i.min_upload_stake, min_upload_stake_label: i._label_min_upload_stake || '',
  });
  return PARAMS;
}
const needParams = () => { if (!PARAMS.loaded) throw new Error('The escrow rules (public/data/bounties.escrow-params.json) did not load, so nothing can be checked. There is no built-in fallback cap.'); };
export const paramsTag = () => `params ${PARAMS.params_version}${PARAMS.params_placeholder ? ', placeholder pending a vote' : ''}`;
/** The escrow's rule for a denom: listed (contract min/max) or the open policy for any other native denom. */
export function denomRule(denom) {
  needParams();
  const r = PARAMS.denoms[denom];
  if (r) return { listed: true, min: r[0], max: r[1] };
  const o = PARAMS.other;
  const u = o && o.policy === 'any_native' ? (o.unlisted || {}) : null;
  return { listed: false, allowed: !!u, min: (u && u.min_amount) || '1', max: (u && u.max_amount) || null, needsVote: !!(u && u.needs_update_config) };
}
/** null when the reward is acceptable; else one plain sentence. Listed denoms: the contract's per-bounty range. */
export function capProblem(reward, exponent = 6, symbol = '') {
  needParams();
  if (!reward || !DENOM_RE.test(String(reward.denom || ''))) return 'Pick a token for the reward.';
  if (!/^[1-9]\d*$/.test(String(reward.amount || ''))) return 'Enter a reward above zero.';
  const rule = denomRule(reward.denom);
  const sym = symbol || reward.denom;
  if (rule.listed) {
    if (rewardProblem(PARAMS.file, reward)) return `The escrow takes ${fromBase(rule.min, exponent)} to ${fromBase(rule.max, exponent)} ${sym} per bounty.`;
    return null;
  }
  if (!rule.allowed) return `The escrow doesn’t take ${sym} yet.`;
  if (BigInt(reward.amount) < BigInt(rule.min)) return `Enter at least ${fromBase(rule.min, exponent)} ${sym}.`;
  if (rule.max && BigInt(reward.amount) > BigInt(rule.max)) return `At most ${fromBase(rule.max, exponent)} ${sym} per bounty.`;
  return null;
}

// ── network and escrow ───────────────────────────────────────────────────────────────────────────────────
export const siteChainId = () => { try { return detectChainId(); } catch { return MAINNET; } };
export const NET_NAME = (id) => id === MAINNET ? 'Terp mainnet' : id === '120u-1' ? 'Terp testnet' : id;

/**
 * Where an action would go, and whether it can be sent now. Single place that decides.
 * { live, signing, chainId, board, contract, line, why }: line/why are the ELI5 notice when it can't be sent.
 */
export function escrowState(M, site = siteChainId()) {
  const bc = (M && M.board) || {};
  const chainId = (M && M.chainId) || site;
  if (M && M.mode === 'chain' && bc.contract) {
    return { live: true, signing: false, chainId, board: bc.contract, contract: bc.contract, dao: bc.dao, prePropose: bc.prePropose || '',
      line: 'Signing opens after the board’s go-live vote.',
      why: `The bounty board is on ${NET_NAME(chainId)} at ${bc.contract.slice(0, 14)}…, and this page reads it directly. Sending transactions from this page is switched off until the board’s audit and go-live vote; you can copy the exact message below and sign it with any Terp wallet tool.` };
  }
  return {
    live: false, signing: false, chainId, board: null, contract: null, dao: bc.dao || '',
    line: 'Funding opens once the bounty board is live on Terp.',
    why: `The bounty board contract, which gives every task its own escrow, is not deployed on ${NET_NAME(chainId)} (${chainId}) yet. Its DAO, caps and audit are still open governance decisions. You can draft and save a proposal now and share its details document; nothing is signed and no funds move.`,
  };
}

export const hashHex = (s) => toHex(sha256(toUtf8(s)));
export function canonical(v) {
  if (Array.isArray(v)) return '[' + v.map(canonical).join(',') + ']';
  if (v && typeof v === 'object') return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + canonical(v[k])).join(',') + '}';
  return JSON.stringify(v ?? null);
}

// The account the site's Connect panel connected (lib/wallet.js).
export async function sessionAccount() {
  try { const W = await import('/lib/wallet.js?v=3ba243b800'); const s = W.getSnapshot(); return s && s.connected && s.address ? { address: s.address, provider: s.provider, name: s.name, chainId: s.chainId } : null; }
  catch { return null; }
}
/** The connected account as a signer for `chainId` (the escrow's chain), or null. */
export async function currentWallet(chainId) {
  const s = await sessionAccount();
  return s ? { kind: 'signer', name: s.name || 'Connected account', address: s.address, provider: s.provider, chainId } : null;
}
/** is_eligible is answered on chain by the contract at signing time. */
export function eligibility(wallet) {
  return wallet ? { eligible: null, via: null, staked: null, note: 'checked on chain (is_eligible) when you sign' } : { eligible: false, via: null, staked: null };
}

export const deadlineDate = (d) => new Date(d + 'T23:59:59Z');

// The full off-chain details (terp-bounty-details/v1). The chain keeps title + summary (<= 280 bytes) +
// details_hash (sha256 of the canonical bytes) + details_cid.
export function detailsOf(d, ref, createdAt) {
  const q = d.quote;
  return JSON.parse(JSON.stringify({
    schema: Schemas.SCHEMA_IDS.details, bounty_ref: String(ref), title: d.title, summary: d.summary, description: d.description || undefined,
    category: d.category, capabilities: d.capabilities, tier: d.tier, priority: d.priority,
    acceptance_criteria: d.acceptance, evidence_required: d.evidence, deadline: d.deadline,
    reward_quote: { asset: q.asset, denom: q.denom, amount: q.micro, work_units: q.wu != null ? String(q.wu) : undefined, params_version: d.paramsVersion, label: 'proposed, pending vote' },
    created_at: createdAt || undefined,
  }));
}

export const NO_CONTRACT = '(bounty board, once live)';
export const NO_ESCROW = '(this task’s escrow, once created)';
const isAddr = (a) => /^terp1[02-9ac-hj-np-z]{38,58}$/.test(a || '');
const senderOf = (w) => (w && w.address) || '(your wallet address)';
/** The escrow of a node: on chain, predicted from the board + code checksum (instantiate2), or a placeholder. */
export function escrowOf(n, M) {
  const oc = n && n.onChain;
  if (oc && oc.escrow) return { address: oc.escrow, exists: true };
  const bc = (M && M.board) || {};
  if (oc && bc.contract && /^[0-9a-f]{64}$/.test(bc.escrowChecksum || '')) { try { return { address: predictEscrow({ board: bc.contract, checksum: bc.escrowChecksum, taskId: oc.id }), exists: false, predicted: true }; } catch { /* fall through */ } }
  return { address: NO_ESCROW, exists: false };
}

/**
 * Create a bounty. route 'propose' (default; anyone the board's submission policy allows): a DAO proposal made
 * through the board, the reward paid by the treasury when it passes, or locked now with sponsor=true.
 * route 'create': an authorised creator (board can_create) creates and funds the escrow in one step.
 */
export function buildCreate(wallet, d, contract, { route = 'propose', sponsor = false } = {}) {
  const chainId = wallet.chainId;
  const details = d.details || detailsOf(d, d.ref);
  const sealed = Schemas.seal(details);
  const check = Schemas.validateDetails(details);
  const t = { ref: d.ref, title: d.title, summary: d.summary, category: d.category, priority: d.priority, tier: d.tier, detailsCid: sealed.cid,
    reward: { denom: d.quote.denom, amount: d.quote.micro }, expiresAt: deadlineDate(d.deadline) };
  const board = contract || NO_CONTRACT, from = senderOf(wallet);
  const m = route === 'create' ? Msg.createTask(from, board, t, sealed.bytes) : Msg.proposeTask(from, board, t, { sponsor, docBytes: sealed.bytes });
  const note = route === 'create'
    ? 'create_task: you are on the board’s creator list; funds are exactly [reward] and go into this task’s own escrow (instantiate2).'
    : `propose_task: opens a DAO vote. If it passes, the DAO runs launch{task_id} with [${t.reward.amount} ${t.reward.denom}] from its treasury, which creates this task’s escrow.${sponsor ? ' sponsor=true: your reward is locked in the escrow now and comes back if the vote fails.' : ''} The details document is stored under its CID first.`;
  return { chainId, route, details, detailsHash: sealed.hash, detailsCid: sealed.cid, bytes: sealed.bytes, check, msgs: [m], preview: msgPreview(chainId, [m], note),
    launch: { contract: board, msg: { launch: { task_id: '<id the board assigns>' } }, funds: [t.reward] } };
}

// terp-bounty-submission/v1 document for a task (escrow = the task's own escrow contract).
export function submissionDoc(n, f, wallet, contract, chainId) {
  const oc = n.onChain || {};
  return Schemas.submissionTemplate({
    bounty_ref: n.id, chain_id: chainId, contract: contract || NO_ESCROW, bounty_id: oc.id || 1,
    submitter: f.submitter || (wallet && wallet.address) || '', summary: f.summary || '', notes: f.notes || undefined,
    evidence: (f.evidence || []).map((uri) => ({ kind: /github\.com\/.+\/pull\//.test(uri) ? 'pr' : /^ipfs:\/\//.test(uri) ? 'ipfs' : 'url', uri })),
    acceptance: (f.acceptance || []).map((a) => ({ criterion: a.criterion, met: !!a.met, evidence: a.met && (f.evidence || []).length ? [0] : [] })),
    details_hash: f.details_hash || undefined, submitted_at: f.submitted_at,
  });
}
/** submit{cid} to the task's escrow (assignee). The CID is the content address of the submission document. */
export function buildSubmit(wallet, n, f, M, chainId) {
  const chain = (wallet && wallet.chainId) || chainId || (M && M.chainId) || siteChainId();
  const esc = escrowOf(n, M);
  const doc = submissionDoc(n, f, wallet, esc.address, chain);
  const sealed = Schemas.seal(doc);
  const check = Schemas.validateSubmission(doc);
  const m = Msg.submit(doc.submitter || senderOf(wallet), esc.address, sealed.cid, sealed.bytes);
  const p = msgPreview(chain, [m], esc.exists ? 'submit: only the assignee may send this; the escrow records it and tells the board.' : 'submit: sent to this task’s escrow once it exists and you are assigned.');
  return { chainId: chain, doc, sealed, check, subHash: sealed.hash, cid: sealed.cid, escrowBacked: esc.exists, escrow: esc, msgs: [m], preview: p };
}
/** apply{task_id, cid} on the board, with a terp-bounty-application/v1 document. */
export function buildApply(wallet, n, f, M) {
  const chainId = (M && M.chainId) || siteChainId(), board = (M && M.board && M.board.contract) || NO_CONTRACT;
  const doc = applicationDoc({ taskRef: n.id, chainId, board, taskId: n.onChain ? n.onChain.id : undefined, applicant: f.applicant || senderOf(wallet), pitch: f.pitch, links: f.links || [], eta: f.eta, at: f.at });
  const sealed = Schemas.seal(doc);
  const m = Msg.apply(doc.applicant, board, n.onChain ? n.onChain.id : '<task id>', sealed.cid, sealed.bytes);
  return { chainId, doc, sealed, cid: sealed.cid, check: validateApplication(doc), msgs: [m], preview: msgPreview(chainId, [m], 'apply: records your application (its CID) on the board; the task’s reviewer assigns one applicant.') };
}
/** Fund a task (anyone; deposits are tracked per depositor and refunded if the task is cancelled or expires). */
export function buildFund(wallet, n, funds, M) {
  const chainId = (M && M.chainId) || siteChainId(), board = (M && M.board && M.board.contract) || NO_CONTRACT;
  const esc = escrowOf(n, M);
  const m = Msg.fund(senderOf(wallet), { board, taskId: n.onChain ? n.onChain.id : '<task id>', escrow: esc.exists ? esc.address : null }, funds);
  return { chainId, msgs: [m], escrow: esc, preview: msgPreview(chainId, [m], esc.exists ? 'fund: adds to this task’s escrow.' : 'launch: the board creates this task’s escrow (instantiate2) with these funds.') };
}
/** Approve submission `seq` and pay out. Directly if you are the task's reviewer, else as a DAO proposal. */
export function buildApprove(wallet, n, seq, M, { viaDao = false, amount = null, prePropose = '' } = {}) {
  const chainId = (M && M.chainId) || siteChainId();
  const esc = escrowOf(n, M), from = senderOf(wallet);
  const inner = Msg.approve(viaDao ? ((M && M.board && M.board.dao) || '(the DAO)') : from, esc.address, seq, amount);
  const m = viaDao ? asDaoProposal(from, prePropose || (M && M.board && M.board.prePropose) || '(the DAO’s pre-propose module)', { title: `Approve and pay ${n.id} #${seq}`, description: `Accept submission #${seq} of ${n.id} (${n.title}) and release the escrow.` }, [inner]) : inner;
  return { chainId, msgs: [m], preview: msgPreview(chainId, [m], viaDao ? 'A DAO proposal: if it passes, the DAO sends approve to the escrow, which pays the assignee.' : 'approve: the reviewer accepts the submission and the escrow pays the assignee in the same message.') };
}

// Submission stake gate (governance param min_submit_stake): the board's can_submit query when the board is live.
export async function submitGate(wallet, M) {
  needParams();
  const min = PARAMS.min_submit_stake;
  if (!wallet) return { known: false, min, staked: null, eligible: null, source: 'no wallet' };
  if (M && M.mode === 'chain' && M.client && M.board && M.board.contract) {
    const r = await M.client.smart(M.board.contract, Q.canSubmit(wallet.address));
    return { known: true, min: r.min_submit_stake, staked: r.staked, eligible: r.eligible, denom: r.bond_denom, source: 'on chain (can_submit)' };
  }
  return { known: false, min, staked: null, eligible: null, source: 'board not live' };
}
/** ELI5 line + "why?" text for the submission stake gate. */
export function gateNote(g) {
  const need = `${fromMicro(g.min || '0')} TERP`;
  const why = `Anti-spam rule: whoever submits work needs ${need} staked (bonded), checked on chain by the bounty board’s can_submit once it is live. Nothing is locked or slashed. ${paramsTag()}.`;
  if (!g.known) return { tone: '', line: `To submit, you’ll need ${need} staked.`, why };
  if (g.eligible) return { tone: 'ok', line: `You have enough TERP staked to submit.`, why: `${fromMicro(g.staked)} TERP bonded; ${need} needed. ${why}` };
  return { tone: 'blocked', line: `Stake at least ${need} to submit. You have ${fromMicro(g.staked)}.`, why: `The contract refuses submit (BelowSubmitStake) until this account bonds more. ${why}` };
}

export { isAddr };
