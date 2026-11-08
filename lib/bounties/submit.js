// Hand-in tools for the live escrow (submit1): who may sign what, the submission builder, and the
// per-bounty submissions view. Used by live.js inside the bounty dialog.
//
// Roles (crates/terp-rs/contracts/revenue/bounty-escrow/src/msg.rs ExecuteMsg):
//   submit                         the assignee only, and only while CanSubmit { address } says eligible
//   assign / unassign / req. chg.  proposer or approver (the contract accepts either)
//   accept / payout / approve / reject   the approver (the DAO's approving authority) only
//   cancel                         proposer, or approver for an Assigned bounty
//   expire                         anyone, after the deadline
// The page shows a signing button only to an address the contract would accept. Everyone keeps the
// copy-message fallback (live.js) for signing elsewhere.
//
// Submissions (QueryMsg::Submissions { id, start_after, limit } -> { submissions: [Submission] }). Each
// Submission is { bounty_id, seq, submitter, hash, cid, submitted_at, height }: the field is `hash`
// (the sha256 the worker sent as submission_hash). The document is fetched by CID (cid.js, which already
// checks the bytes against the CID digest), then sha256(bytes) is compared with `hash`.
// The escrow keeps no status history; the timeline below is derived from created_at, each submission's
// submitted_at, and the bounty's current status at updated_at.
//
// Settled 2026-11-05: OPEN-4 stake-path store; OPEN-6 caps stay off public site.
// Still honest: OPEN-7 if ICS-23 proofs cannot be built; OPEN-5 prefer Keplr (Zafu experimental).
// Buildable: form → canonical → submission_hash+CIDv1, can_submit, ADR-36, authorize+PUT, submit msg, stepper.
// DEV NOTE (source only, never rendered): UPLOAD BACKEND IS MISSING
//  - The builder hands over the canonical bytes as a download and asks for the CID after the user pins the
//    file themselves. There is no upload endpoint behind this page (see the DEV NOTES block at the end of
//    howto.js for the full gap list).
//  - The intended backend: an upload service that (1) authenticates the uploader with a wallet signature,
//    (2) queries the escrow's CanUpload { address } and refuses below min_upload_stake (bonded stake in the
//    bond denom; 10 TERP today), (3) runs the fail-closed decision-model screening (deterministic checks,
//    cheap triage, stronger model on escalation; quarantine on timeout/error/low confidence), and only then
//    (4) writes the bytes under the public content-addressed prefix and pins them. When it exists, the
//    "Download" step here becomes "Upload", and the CID field fills itself.
//  - Until then the CID the user pastes is checked locally (raw CIDv1 sha2-256 whose digest equals the
//    file's sha256); a different CID is refused, because readers verify by CID digest.
import { formatMicro } from '/lib/amount.js?v=2cb261fcfb-r2';
import { stepsOf, renderStepper, OPEN, uploadBountyRef, blake3HexIfCheap } from '/lib/bounties/curate.js?v=34c8be7982';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const terp = (m) => (/^\d+$/.test(String(m ?? '')) ? formatMicro(m, 6, 2) : '—');
const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-6)}` : '—');
const nsToDate = (ns) => { try { return ns ? new Date(Number(BigInt(ns) / 1000000n)) : null; } catch { return null; } };
const utc = (d) => (d ? d.toISOString().replace('T', ' ').replace(/\.\d+Z$/, ' UTC') : '—');
export const EVIDENCE_KINDS = ['pr', 'commit', 'tx', 'url', 'ipfs', 'file', 'report', 'video'];
const KIND_TEXT = { pr: 'Pull request', commit: 'Commit', tx: 'Transaction', url: 'Web page', ipfs: 'IPFS file', file: 'File', report: 'Report', video: 'Video' };
const DEFAULT_GATEWAYS = ['https://s3.terp.network/static/bounties/cid/'];
export const gatewaysOf = (live) => { const g = live && live.chainCfg && live.chainCfg.bounties && live.chainCfg.bounties.cidGateway; return (Array.isArray(g) && g.length ? g : DEFAULT_GATEWAYS).filter(Boolean); };

// ── roles ────────────────────────────────────────────────────────────────────────────────────────────
/** What `me` may sign on bounty `b` under escrow config `cfg`. */
export function rolesOf(me, b, cfg) {
  const approver = cfg && cfg.approver, proposer = b && b.proposer;
  return { me, assignee: !!me && me === b.assignee, approver: !!me && me === approver, proposer: !!me && me === proposer };
}
// [key, label, statuses, allowed(roles, b)]
const SIGNABLE = [
  ['submit', 'Hand in work', ['assigned'], (r) => r.assignee],
  ['assign', 'Assign a worker', ['open'], (r) => r.approver || r.proposer],
  ['unassign', 'Put back on the board', ['assigned'], (r) => r.approver || r.proposer],
  ['request_changes', 'Ask for changes', ['submitted'], (r) => r.approver || r.proposer],
  ['accept', 'Accept the work', ['submitted'], (r) => r.approver],
  ['payout', 'Pay the worker', ['accepted'], (r) => r.approver],
  ['approve', 'List it', ['pending'], (r) => r.approver],
  ['reject', 'Turn it down', ['pending'], (r) => r.approver],
];
export function signableFor(b, roles) {
  return SIGNABLE.filter(([, , st, ok]) => st.includes(b.status) && ok(roles, b)).map(([key, label]) => ({ key, label }));
}

/** Plain reason why `me` can't hand in work on `b` (null = nothing in the way except the stake check). */
export function submitBlock(b, me) {
  if (!me) return { code: 'nowallet', text: 'Connect the wallet this bounty was assigned to, to hand in work.' };
  if (b.status === 'open') return { code: 'unassigned', text: 'Nobody is assigned yet. Ask the approver to assign this bounty to your address first.' };
  if (b.status !== 'assigned') return { code: 'status', text: b.status === 'submitted' ? 'Work is already in review. If changes are asked for, you can hand in again.' : 'This bounty no longer takes work.' };
  if (b.assignee !== me) return { code: 'notassignee', text: `This bounty is assigned to ${short(b.assignee)}. Only that address can hand in work.` };
  return null;
}
/** CanSubmit answer -> null when eligible, else a plain sentence. */
export function stakeBlock(cs) {
  if (!cs) return 'Couldn’t check your stake right now. Try again in a moment.';
  if (cs.eligible) return null;
  const den = cs.bond_denom === 'uterp' ? 'TERP' : cs.bond_denom;
  return `Handing in work needs ${terp(cs.min_submit_stake)} ${den} staked. This address has ${terp(cs.staked)} ${den} staked. Stake more, then try again.`;
}

// ── wallet ───────────────────────────────────────────────────────────────────────────────────────────
export async function walletApi() { try { return await import('/lib/wallet.js?v=3ba243b800'); } catch { return null; } }
export function myAddress(W) { try { const s = W && W.getSnapshot(); return s && s.connected ? s.address : null; } catch { return null; } }
/** Connect in place; returns the address or throws with a plain message. */
export async function connectHere(W, chainCfg) {
  if (!W) throw new Error('The wallet tools didn’t load. Reload the page and try again.');
  if (W.detectExtension && !W.detectExtension()) throw new Error('No wallet extension found in this browser. Install Keplr, or use “Sign somewhere else” below.');
  const s = await W.ensureWallet(chainCfg);
  const a = (s && s.address) || myAddress(W);
  if (!a) throw new Error('The wallet didn’t connect.');
  return a;
}

// Schema errors ("/evidence/0/uri must match format …") -> one plain line per field.
const FIELD = [[/^\/summary/, () => 'Summary'], [/^\/evidence\/(\d+)\/uri/, (m) => `Link ${m[1]}`], [/^\/evidence\/(\d+)/, (m) => `Link ${m[1]}`], [/^\/evidence/, () => 'Links to the work'],
  [/^\/acceptance\/(\d+)\/criterion/, (m) => `Requirement ${Number(m[1]) + 1}`], [/^\/acceptance\/(\d+)/, (m) => `Requirement ${Number(m[1]) + 1}`], [/^\/acceptance/, () => 'Requirements'],
  [/^\/submitter/, () => 'Your address'], [/^\/payout_wallet/, () => 'Pay-to address'], [/^\/notes/, () => 'Notes']];
function plainErrors(list) {
  const seen = new Map();
  for (const e of list) {
    const m = String(e).match(/^(\/\S*)\s(.*)$/), path = m ? m[1] : '', raw = m ? m[2] : String(e);
    const hit = FIELD.find(([re]) => re.test(path)), field = hit ? hit[1](path.match(hit[0])) : (path.replace(/^\//, '') || 'Document');
    const text = /Connect your wallet/.test(raw) ? 'Connect your wallet so your address goes in the document.'
      : /fewer than 1 items/.test(raw) ? 'needs at least one.'
      : /fewer than 1 char|blank|empty/.test(raw) ? 'is empty.'
      : /more than \d+ (char|byte)|too long|bytes/.test(raw) ? 'is too long.'
      : /format "uri"|must be a link|https|ipfs/.test(raw) ? 'isn’t a link (use https://… or ipfs://…).'
      : /pattern/.test(raw) && field === 'Your address' ? 'isn’t a terp1 address.'
      : /pattern/.test(raw) ? 'isn’t in the right format.'
      : /must be equal to|must match the bounty|expected/.test(raw) ? 'doesn’t match this bounty.'
      : raw.replace(/^must /, 'must ') + (/[.]$/.test(raw) ? '' : '.');
    if (!seen.has(field)) seen.set(field, { field, text });
  }
  return [...seen.values()];
}

// ── builder ──────────────────────────────────────────────────────────────────────────────────────────
/**
 * Mount the submission builder into `host`. `ctx`: { b, live, doc (details doc or null), me, onSealed(s|null) }.
 * onSealed gets { hash, cid, bytes, json } once the document validates and the pinned CID matches.
 */
export async function mountBuilder(host, ctx) {
  const { Schemas } = await import('/lib/bounties/chain.js?v=30c45273bf');
  const { cidProblem } = await import('/lib/bounties/cid.js?v=94332d16b3-r2');
  const { b, live } = ctx;
  const crit = (ctx.doc && Array.isArray(ctx.doc.acceptance_criteria) ? ctx.doc.acceptance_criteria : []).slice(0, 50);
  const f = { summary: '', notes: '', payout: '', evidence: [{ kind: 'pr', uri: '', note: '' }], acceptance: crit.map((c) => ({ criterion: c, met: true, evidence: '0' })) };
  if (!f.acceptance.length) f.acceptance.push({ criterion: '', met: true, evidence: '0' });
  let sealed = null, imported = null;
  let curateState = { wallet: !!ctx.me, canSubmit: null, canSubmitWhy: null, docValid: false, hash: null, cid: null, intentSigned: false, cidConfirmed: false, submitReady: false, proofsOk: null, proofsWhy: null, uploaded: false, uploadWhy: null };
  function paintCurate() {
    curateState.wallet = !!ctx.me;
    curateState.submitReady = !!(curateState.docValid && curateState.cidConfirmed && curateState.hash && curateState.cid);
    const el = host.querySelector('#bxs-curate-wrap');
    if (el) el.innerHTML = renderStepper(stepsOf(curateState));
  }
  (async () => {
    if (!ctx.me || !live || !live.rest || !live.escrow) return;
    try {
      const q = btoa(unescape(encodeURIComponent(JSON.stringify({ can_submit: { address: ctx.me } }))));
      const r = await fetch(`${live.rest}/cosmwasm/wasm/v1/contract/${live.escrow}/smart/${q}`, { credentials: 'omit', cache: 'no-store' });
      const j = await r.json();
      const d = (j && (j.data || j)) || {};
      curateState.canSubmit = !!d.eligible;
      const den = d.bond_denom === 'uterp' ? 'TERP' : (d.bond_denom || '');
      curateState.canSubmitWhy = d.eligible
        ? `${terp(d.staked)} ${den} staked (min ${terp(d.min_submit_stake)}).`
        : `Needs ${terp(d.min_submit_stake)} ${den} staked; this address has ${terp(d.staked)}.`;
    } catch (e) { curateState.canSubmit = null; curateState.canSubmitWhy = 'Could not query can_submit right now.'; }
    paintCurate();
  })();

  host.innerHTML = `
    <div class="bxs-build" id="bxs-build">
      <div class="bxs-curate-wrap" id="bxs-curate-wrap" aria-live="polite"></div>
      <div class="bxs-tabs" role="group" aria-label="How to make the document">
        <button type="button" class="plane-link secondary" data-mode="form" aria-pressed="true">Fill in a form</button>
        <label class="plane-link secondary bxs-file">Import a JSON file<input type="file" id="bxs-import" accept="application/json,.json" hidden></label>
      </div>
      <div id="bxs-form"></div>
      <div class="bxs-out" id="bxs-out" aria-live="polite"></div>
    </div>`;
  const $ = (s) => host.querySelector(s);
  paintCurate();

  function evRow(e, i) {
    return `<div class="bxs-ev" data-i="${i}">
      <span class="bxs-idx" aria-hidden="true">${i}</span>
      <label class="bx3-field"><span class="bx3-lbl">Kind</span><select data-k="kind">${EVIDENCE_KINDS.map((k) => `<option value="${k}"${e.kind === k ? ' selected' : ''}>${KIND_TEXT[k]}</option>`).join('')}</select></label>
      <label class="bx3-field bxs-grow"><span class="bx3-lbl">Link</span><input data-k="uri" value="${esc(e.uri)}" placeholder="https://… or ipfs://…" spellcheck="false" inputmode="url"></label>
      <label class="bx3-field bxs-grow"><span class="bx3-lbl">Note</span><input data-k="note" value="${esc(e.note)}"></label>
      ${f.evidence.length > 1 ? `<button type="button" class="plane-link secondary bxs-rm" data-rm-ev="${i}" aria-label="Remove link ${i}">Remove</button>` : ''}
    </div>`;
  }
  function acRow(a, i) {
    return `<div class="bxs-ac" data-i="${i}">
      <label class="bxs-met"><input type="checkbox" data-k="met"${a.met ? ' checked' : ''}><span class="bxl-sr">Done</span></label>
      <label class="bx3-field bxs-grow"><span class="bx3-lbl">Requirement</span><input data-k="criterion" value="${esc(a.criterion)}"></label>
      <label class="bx3-field bxs-small"><span class="bx3-lbl">Shown by link #</span><input data-k="evidence" value="${esc(a.evidence)}" placeholder="0, 1" inputmode="numeric"></label>
    </div>`;
  }
  function paintForm() {
    if (imported) {
      $('#bxs-form').innerHTML = `<p class="bxl-dim">Using the imported file. <button type="button" class="plane-link secondary" data-mode="form">Back to the form</button></p>`;
      return;
    }
    const n = new TextEncoder().encode(f.summary).length;
    $('#bxs-form').innerHTML = `
      <label class="bx3-field"><span class="bx3-lbl">What you did</span><textarea id="bxs-summary" rows="3" maxlength="600">${esc(f.summary)}</textarea>
        <span class="bx3-hint ${n > Schemas.SUMMARY_MAX_BYTES ? 'is-bad' : ''}" id="bxs-sumn">${n} of ${Schemas.SUMMARY_MAX_BYTES} bytes</span></label>
      <fieldset class="bxs-set"><legend>Links to the work</legend>${f.evidence.map(evRow).join('')}
        ${f.evidence.length < 20 ? '<button type="button" class="plane-link secondary" id="bxs-add-ev">Add a link</button>' : ''}</fieldset>
      <fieldset class="bxs-set"><legend>Requirements met</legend>${f.acceptance.map(acRow).join('')}</fieldset>
      <details class="bxs-more"><summary>More (optional)</summary>
        <label class="bx3-field"><span class="bx3-lbl">Pay to a different address</span><input id="bxs-payout" value="${esc(f.payout)}" placeholder="terp1…" spellcheck="false"></label>
        <label class="bx3-field"><span class="bx3-lbl">Notes for the reviewer</span><textarea id="bxs-notes" rows="2">${esc(f.notes)}</textarea></label>
      </details>
      <div class="bxs-row"><button type="button" class="plane-link snap-btn" id="bxs-check">Check the document</button></div>`;
  }
  function read() {
    if (imported) return;
    const v = (s) => (host.querySelector(s) || {}).value;
    f.summary = v('#bxs-summary') ?? f.summary; f.notes = v('#bxs-notes') ?? f.notes; f.payout = (v('#bxs-payout') ?? f.payout).trim();
    host.querySelectorAll('.bxs-ev').forEach((r) => { const e = f.evidence[r.dataset.i]; r.querySelectorAll('[data-k]').forEach((i) => { e[i.dataset.k] = i.value.trim(); }); });
    host.querySelectorAll('.bxs-ac').forEach((r) => { const a = f.acceptance[r.dataset.i]; r.querySelectorAll('[data-k]').forEach((i) => { a[i.dataset.k] = i.type === 'checkbox' ? i.checked : i.value; }); });
    const n = new TextEncoder().encode(f.summary).length, el = $('#bxs-sumn');
    if (el) { el.textContent = `${n} of ${Schemas.SUMMARY_MAX_BYTES} bytes`; el.classList.toggle('is-bad', n > Schemas.SUMMARY_MAX_BYTES); }
  }
  function docFromForm() {
    const ev = f.evidence.filter((e) => e.uri).map((e) => ({ kind: e.kind, uri: e.uri, ...(e.note ? { note: e.note } : {}) }));
    const ac = f.acceptance.filter((a) => a.criterion.trim()).map((a) => ({ criterion: a.criterion.trim(), met: !!a.met,
      evidence: [...new Set(String(a.evidence).split(/[\s,]+/).filter((x) => /^\d+$/.test(x)).map(Number))] }));
    const d = Schemas.submissionTemplate({ bounty_ref: b.bounty_ref, chain_id: live.chainId, contract: live.escrow, bounty_id: Number(b.id),
      submitter: ctx.me || '', summary: f.summary.trim(), notes: f.notes.trim() || undefined, evidence: ev, acceptance: ac, details_hash: b.details_hash });
    if (f.payout) d.payout_wallet = f.payout;
    return d;
  }
  function check() {
    read();
    const doc = imported || docFromForm();
    const expect = { bounty_ref: b.bounty_ref, contract: live.escrow, bounty_id: Number(b.id), chain_id: live.chainId, ...(ctx.me ? { submitter: ctx.me } : {}) };
    const v = Schemas.validateSubmission(doc, expect);
    const extra = [];
    if (!ctx.me && doc.submitter && !/^terp1[0-9a-z]{38,}$/.test(doc.submitter)) extra.push('/submitter must be your terp1 address. Connect your wallet to fill it in.');
    if (!ctx.me && !doc.submitter) extra.push('/submitter is empty. Connect your wallet to fill it in.');
    const errors = plainErrors([...v.errors, ...extra]);
    if (errors.length) {
      sealed = null; curateState.docValid = false; curateState.hash = null; curateState.cid = null; curateState.cidConfirmed = false; curateState.submitReady = false; paintCurate(); ctx.onSealed && ctx.onSealed(null);
      $('#bxs-out').innerHTML = `<div class="bxs-badge is-bad" role="alert">Fix ${errors.length === 1 ? 'this' : `these ${errors.length}`} first</div>
        <ul class="bxs-errs">${errors.map((e) => `<li><b>${esc(e.field)}</b> ${esc(e.text)}</li>`).join('')}</ul>`;
      host.dataset.state = 'invalid';
      return;
    }
    const s = Schemas.seal(doc);
    sealed = { ...s, doc };
    curateState.docValid = true; curateState.hash = s.hash; curateState.cid = s.cid; curateState.cidConfirmed = false; curateState.intentSigned = false; paintCurate();
    const name = `${b.bounty_ref}-submission-${s.hash.slice(0, 8)}.json`;
    const url = URL.createObjectURL(new Blob([s.bytes], { type: 'application/json' }));
    $('#bxs-out').innerHTML = `
      <div class="bxs-badge is-ok">Document is valid</div>
      <pre class="bxl-msg bxs-pretty" tabindex="0" aria-label="Your submission document">${esc(JSON.stringify(doc, null, 2))}</pre>
      <dl class="bxl-dl bxs-facts">
        <dt>Size</dt><dd>${s.bytes.length.toLocaleString('en-US')} bytes, canonical JSON (keys sorted, no spaces)</dd>
        <dt>Fingerprint (sha256)</dt><dd><code class="bxl-wrap" id="bxs-hash">${s.hash}</code></dd>
        <dt>Expected CID</dt><dd><code class="bxl-wrap" id="bxs-want">${s.cid}</code></dd>
        <dt>blake3</dt><dd class="bxl-dim" id="bxs-blake3">Computing only if cheap…</dd>
        <dt>Upload bounty_ref</dt><dd><code class="bxl-wrap">${esc(uploadBountyRef(live.escrow, b.id))}</code> <span class="bxl-dim">(catalog <code>${esc(b.bounty_ref)}</code> → silo <code>&lt;escrow&gt;/&lt;id&gt;</code>)</span></dd>
      </dl>
      <div class="bxs-row"><a class="plane-link snap-btn" id="bxs-dl" href="${url}" download="${esc(name)}">Download ${esc(name)}</a></div>
      <div class="bxs-silo" id="bxs-silo" data-state="idle">
        <p class="bxs-open-note" role="note"><b>Store on s3.terp.network (stake path).</b> Authorize + PUT with <code>X-Silo-Ticket</code>. Object key is server-chosen under <code>quarantine/&lt;escrow&gt;_&lt;id&gt;/&lt;sha256&gt;</code>. Catalog <code>bounty_ref</code> maps to intent <code>&lt;escrow&gt;/&lt;id&gt;</code>.</p>
        <p class="bxs-open-note" role="note"><b>Merkle-caps — not available on this site (${OPEN.caps.id}).</b> ${esc(OPEN.caps.why)}</p>
        <p class="bx3-hint">Prefer <b>Keplr</b> for signArbitrary. ${esc(OPEN.zafu.id)}: Zafu is experimental/unverified.</p>
        <div class="bxs-row">
          <button type="button" class="plane-link snap-btn" id="bxs-silo-go"${ctx.me ? '' : ' disabled'}>Upload with my stake</button>
          <button type="button" class="bx-q" data-how="upload" aria-label="How uploading with your stake works" title="How it works">?</button>
          <span class="bx3-hint" id="bxs-silo-why">${ctx.me ? 'Your wallet signs a one-time ADR-36 intent. Nothing is broadcast to the chain.' : 'Connect your wallet (Keplr) to upload with your stake.'}</span>
        </div>
        <ol class="bxs-steps" id="bxs-silo-steps" hidden></ol>
        <p class="bx3-hint" id="bxs-silo-msg" aria-live="polite"></p>
      </div>
      <p class="bxl-dim">Fallback: download the file and pin it yourself as a raw CIDv1 block, then paste the CID.</p>
      <label class="bx3-field"><span class="bx3-lbl">CID of the pinned file</span><input id="bxs-cid" placeholder="bafkrei…" spellcheck="false" autocomplete="off"></label>
      <p class="bx3-hint" id="bxs-cidmsg" aria-live="polite"></p>`;
    host.dataset.state = 'valid';
    blake3HexIfCheap(s.bytes).then((h) => { const el = $('#bxs-blake3'); if (!el) return; el.textContent = h ? h : 'Not computed (no cheap blake3 in this browser; schema has no blake3 field — OPEN-3).'; });
    $('#bxs-cid').addEventListener('input', (e) => cidCheck(e.target.value.trim()));
    $('#bxs-silo-go').addEventListener('click', () => siloUpload());
    ctx.onSealed && ctx.onSealed(null);
  }
  // Stake-path upload (OPEN-4). Prefer Keplr. OPEN-7 if proofs cannot be built.
  async function siloUpload() {
    const S = await import('/lib/bounties/silo.js?v=b4508c07ee');
    const box = $('#bxs-silo'), steps = $('#bxs-silo-steps'), msg = $('#bxs-silo-msg'), go = $('#bxs-silo-go');
    const terpAmt = (u) => (Number(u) / 1e6).toLocaleString('en-US', { maximumFractionDigits: 6 }) + ' TERP';
    const LABEL = { health: 'Checking the upload service', height: 'Getting the newest block it trusts', prove: 'Proving your stake from the chain (ICS-23)',
      sign: 'Waiting for Keplr to sign (ADR-36)', authorize: 'Asking for an upload ticket', put: 'Sending the file', done: 'Done', wallet_note: 'Wallet note' };
    const add = (k, extra = '') => { steps.hidden = false; steps.insertAdjacentHTML('beforeend', `<li data-step="${k}">${esc(LABEL[k] || k)}${extra}</li>`); };
    const fail = (text, code) => {
      box.dataset.state = 'fallback'; msg.className = 'bx3-hint is-bad'; msg.textContent = text;
      if (code === 'open7') { curateState.proofsOk = false; curateState.proofsWhy = text; paintCurate(); }
      go.disabled = false;
    };
    // Prefer Keplr explicitly (OPEN-5)
    const sign = S.walletSigner('keplr') || S.walletSigner(ctx.wallet);
    if (!sign) return fail('No Keplr (or compatible) wallet with signArbitrary. ' + OPEN.zafu.why);
    if (sign.wallet && sign.wallet !== 'keplr') {
      msg.className = 'bx3-hint is-warn';
      msg.textContent = `${OPEN.zafu.id}: using ${sign.wallet} (experimental). Prefer Keplr.`;
    }
    go.disabled = true; steps.innerHTML = ''; if (!msg.className.includes('is-warn')) msg.textContent = ''; box.dataset.state = 'busy';
    curateState.proofsOk = null; paintCurate();
    try {
      const r = await S.upload({ live, bountyId: b.id, delegator: ctx.me, bytes: sealed.bytes, sha256: sealed.hash, sign,
        onStep: (k, d) => {
          if (k === 'proven') {
            const li = steps.querySelector('[data-step="prove"]');
            if (li) li.insertAdjacentHTML('beforeend', ` <b class="${d.ok ? 'is-ok' : 'is-bad'}" id="bxs-stake">staked ${terpAmt(d.staked)} · needed ${d.min == null ? '?' : terpAmt(d.min)} (block ${d.height})</b>`);
            curateState.proofsOk = !!d.ok; curateState.intentSigned = false; paintCurate();
            return;
          }
          if (k === 'sign') { curateState.intentSigned = false; }
          if (k === 'wallet_note') { add(k, ` · ${OPEN.zafu.id}: ${d.wallet}`); return; }
          add(k);
        } });
      curateState.intentSigned = true;
      curateState.proofsOk = true;
      if (r.dryRun) {
        box.dataset.state = 'dry'; msg.className = 'bx3-hint is-warn';
        msg.textContent = `Checked, not stored yet (dry-run): stake, signature and file verified (${r.sha256Ok ? 'fingerprint matches' : 'fingerprint NOT matched'}) but S3 write is disabled. CID is filled from the sealed bytes so you can still hand in.`;
        curateState.uploaded = false; curateState.uploadWhy = 'Dry-run only — nothing stored on S3.';
      } else {
        box.dataset.state = 'stored'; msg.className = 'bx3-hint is-ok';
        msg.textContent = `Stored for review${r.needsReview ? ' (human review first)' : ''} at ${r.objectKey || 'quarantine/…'}. CID filled below.`;
        curateState.uploaded = true; curateState.uploadWhy = r.objectKey || 'Stored via stake path.';
      }
      $('#bxs-cid').value = sealed.cid; cidCheck(sealed.cid);
      paintCurate();
    } catch (e) {
      if (e.code === 'open7') fail(e.message, 'open7');
      else if (e.code === 'low') fail(`Not enough stake: you have ${terpAmt(e.proof.staked)} staked, this needs ${terpAmt(e.proof.min)}.`);
      else if (e.code === 'nostake') fail('This address has no stake.');
      else if (e.code === 'unreachable' || e.code === 'down') fail('The upload service could not be reached from this page right now.');
      else fail(/reject|denied|cancel/i.test(String(e.message || e)) ? 'You declined the signature.' : ('Upload failed: ' + (e.message || e) + '.'));
    }
  }
  function cidCheck(cid) {
    const m = $('#bxs-cidmsg');
    if (!cid) { m.textContent = ''; m.className = 'bx3-hint'; curateState.cidConfirmed = false; paintCurate(); ctx.onSealed && ctx.onSealed(null); return; }
    const p = cidProblem(cid);
    const bad = p || (cid !== sealed.cid ? 'This CID is for different bytes than the file above. Pin the downloaded file unchanged, as a raw CIDv1 block.' : null);
    m.textContent = bad || 'CID matches the file.';
    m.className = 'bx3-hint ' + (bad ? 'is-bad' : 'is-ok');
    host.dataset.cid = bad ? 'bad' : 'ok';
    curateState.cidConfirmed = !bad && !!cid; paintCurate();
    ctx.onSealed && ctx.onSealed(bad ? null : { hash: sealed.hash, cid, bytes: sealed.bytes, json: sealed.json });
  }
  host.addEventListener('input', () => { if (!imported) read(); });
  host.addEventListener('click', (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.id === 'bxs-add-ev') { read(); f.evidence.push({ kind: 'url', uri: '', note: '' }); paintForm(); }
    else if (t.dataset.rmEv != null) { read(); f.evidence.splice(Number(t.dataset.rmEv), 1); paintForm(); }
    else if (t.id === 'bxs-check') check();
    else if (t.dataset.mode === 'form') { imported = null; paintForm(); $('#bxs-out').innerHTML = ''; }
  });
  $('#bxs-import').addEventListener('change', async (e) => {
    const file = e.target.files && e.target.files[0]; if (!file) return;
    if (file.size > 262144) { $('#bxs-out').innerHTML = '<div class="bxs-badge is-bad" role="alert">That file is over 256 KiB.</div>'; return; }
    const text = await file.text();
    try { imported = JSON.parse(text); }
    catch (err) { imported = null; $('#bxs-out').innerHTML = `<div class="bxs-badge is-bad" role="alert">That file isn’t valid JSON: ${esc(err.message)}</div>`; return; }
    paintForm(); check();
  });
  paintForm();
  return { check, get sealed() { return sealed; }, importDoc(doc) { imported = doc; paintForm(); check(); }, fill(v) { Object.assign(f, v); paintForm(); }, cid: cidCheck };
}

// ── submissions view ─────────────────────────────────────────────────────────────────────────────────
export async function readSubmissions(smart, live, id) {
  const out = []; let after = null;
  for (let i = 0; i < 20; i++) {
    const r = await smart(live.rest, live.escrow, { submissions: { id: Number(id), ...(after != null ? { start_after: after } : {}), limit: 30 } });
    const rows = (r && r.submissions) || [];
    out.push(...rows);
    if (rows.length < 30) break;
    after = rows[rows.length - 1].seq;
  }
  return out;
}
const linkFor = (uri, gws) => {
  if (/^https:\/\//.test(uri)) return uri;
  const m = /^ipfs:\/\/([A-Za-z0-9]+)(\/.*)?$/.exec(uri || '');
  return m ? `${(gws.find((g) => /\/(ipfs|cid)\/?$/.test(g)) || 'https://s3.terp.network/static/bounties/cid/').replace(/\/?$/, '/')}${m[1]}${m[2] || ''}` : null;
};
function docHtml(doc, gws) {
  const ev = (doc.evidence || []).map((e, i) => { const href = linkFor(e.uri, gws);
    return `<li><span class="bxs-idx">${i}</span> <span class="bxl-k bxs-kind">${esc(KIND_TEXT[e.kind] || e.kind)}</span> ${href ? `<a href="${esc(href)}" target="_blank" rel="noopener nofollow ugc">${esc(e.uri)}</a>` : `<code>${esc(e.uri)}</code>`}${e.note ? ` <span class="bxl-dim">${esc(e.note)}</span>` : ''}</li>`; }).join('');
  const ac = (doc.acceptance || []).map((a) => `<li class="${a.met ? 'is-met' : 'is-unmet'}"><span class="bxl-sr">${a.met ? 'Met' : 'Not met'}</span>${esc(a.criterion)}${a.evidence && a.evidence.length ? ` <span class="bxl-dim">link ${a.evidence.join(', ')}</span>` : ''}</li>`).join('');
  return `<p class="bxl-summary-full">${esc(doc.summary)}</p>
    ${ev ? `<h3>Links</h3><ul class="bxs-links">${ev}</ul>` : ''}
    ${ac ? `<h3>Requirements</h3><ul class="bxl-check bxs-acc">${ac}</ul>` : ''}
    ${doc.notes ? `<h3>Notes</h3><p class="bxs-notes">${esc(doc.notes)}</p>` : ''}
    <dl class="bxl-dl">${doc.payout_wallet ? `<dt>Pay to</dt><dd><code>${esc(doc.payout_wallet)}</code></dd>` : ''}<dt>Written</dt><dd>${esc(doc.submitted_at || '—')}</dd></dl>`;
}
/** Paint the submissions of `b` into `host` (a <section>). */
export async function paintSubmissions(host, b, live, smart, isCurrent = () => true) {
  const { fetchDoc } = await import('/lib/bounties/cid.js?v=94332d16b3-r2');
  const { Schemas } = await import('/lib/bounties/chain.js?v=30c45273bf');
  const gws = gatewaysOf(live);
  host.innerHTML = `<h3 id="bxs-sub-h">Submissions</h3><p class="bxl-dim"><span class="bxl-spin" aria-hidden="true"></span>Reading submissions…</p>`;
  let rows;
  try { rows = await readSubmissions(smart, live, b.id); }
  catch (e) { if (!isCurrent()) return; host.dataset.state = 'error'; host.innerHTML = `<h3 id="bxs-sub-h">Submissions</h3><p class="bxl-note">Couldn’t read submissions right now (${esc(e.message)}).</p>`; return; }
  if (!isCurrent()) return;
  const hist = [{ at: nsToDate(b.created_at), text: 'Posted' }];
  rows.forEach((s) => hist.push({ at: nsToDate(s.submitted_at), text: `Work handed in (#${s.seq}) by ${short(s.submitter)}` }));
  const STATUS_TEXT = { pending: 'Pending', open: 'Open', assigned: 'Assigned', submitted: 'In review', accepted: 'Accepted', paid: 'Paid', cancelled: 'Cancelled', refunded: 'Refunded', expired: 'Expired' };
  if (b.updated_at && b.updated_at !== b.created_at) hist.push({ at: nsToDate(b.updated_at), text: `Now ${STATUS_TEXT[b.status] || b.status}` });
  hist.sort((x, y) => (x.at || 0) - (y.at || 0));
  host.innerHTML = `<h3 id="bxs-sub-h">Submissions <span class="bxl-n">${rows.length}</span></h3>
    ${rows.length ? '' : '<p class="bxl-dim">No work handed in yet.</p>'}
    <ol class="bxs-subs">${rows.slice().reverse().map((s) => `<li class="bxs-sub" data-seq="${s.seq}">
      <div class="bxs-sub-head"><b>#${s.seq}</b> <code title="${esc(s.submitter)}">${short(s.submitter)}</code> <time datetime="${(nsToDate(s.submitted_at) || new Date(0)).toISOString()}">${utc(nsToDate(s.submitted_at))}</time>
        <span class="bxl-dim">block ${Number(s.height).toLocaleString('en-US')}</span> <span class="bxs-badge is-wait" data-badge>Checking…</span></div>
      <div class="bxs-sub-body" data-body></div>
      <details class="bxs-sub-raw"><summary>Fingerprints</summary><dl class="bxl-dl"><dt>On-chain hash</dt><dd><code class="bxl-wrap">${esc(s.hash)}</code></dd><dt>CID</dt><dd><code class="bxl-wrap">${esc(s.cid)}</code></dd></dl></details>
    </li>`).join('')}</ol>
    <h3>History</h3>
    <ol class="bxs-hist">${hist.map((h) => `<li><time datetime="${h.at ? h.at.toISOString() : ''}">${utc(h.at)}</time> ${esc(h.text)}</li>`).join('')}</ol>
    <p class="bxl-dim">The escrow keeps no history log. This list comes from the post time, each submission, and the last change.</p>`;
  host.dataset.state = 'listed';
  await Promise.all(rows.map(async (s) => {
    const li = host.querySelector(`.bxs-sub[data-seq="${s.seq}"]`), badge = li.querySelector('[data-badge]'), body = li.querySelector('[data-body]');
    const set = (cls, text) => { badge.className = 'bxs-badge ' + cls; badge.textContent = text; li.dataset.verify = cls.replace('is-', ''); };
    try {
      const r = await fetchDoc(s.cid, { gateways: gws });
      if (!isCurrent()) return;
      const sha = Schemas.sha256Hex(r.bytes);
      if (sha !== String(s.hash).toLowerCase()) { set('is-bad', 'Mismatch'); body.innerHTML = `<p class="bxl-note">This file’s fingerprint (${sha.slice(0, 12)}…) doesn’t match the one on chain, so its content isn’t shown.</p>`; return; }
      set('is-ok', 'Verified');
      body.innerHTML = docHtml(r.doc, gws);
      const v = Schemas.validateSubmission(r.doc, { bounty_ref: b.bounty_ref, bounty_id: Number(b.id), contract: live.escrow, submitter: s.submitter });
      if (!v.ok) body.insertAdjacentHTML('beforeend', `<p class="bxl-note">The file matches the chain but doesn’t follow the submission format: ${esc(v.errors.slice(0, 3).join('; '))}.</p>`);
    } catch (e) {
      if (!isCurrent()) return;
      if (e.code === 'mismatch') { set('is-bad', 'Mismatch'); body.innerHTML = `<p class="bxl-note">${esc(e.message)}</p>`; }
      else { set('is-wait', 'Not reachable'); body.innerHTML = `<p class="bxl-note">${esc(e.code === 'invalid' ? e.message : 'The file couldn’t be fetched right now, so it can’t be checked yet.')}</p>`; }
    }
  }));
}
