// "How it works": the Bounties user manual, in one dialog with five sections (tabs).
// Every claim is grounded in crates/terp-rs/contracts/revenue/bounty-escrow (src/msg.rs, src/state.rs,
// src/contract.rs, DESIGN.md §4, §5d, §5e, §9, §9a, §9b, §9c). Every amount is proposed, pending vote.
// Deep link: /bounties#how-it-works or /bounties#how-it-works/<section>. (/eco#bounties only forwards plain #bounties; pages/tabs.html.)
// Opening and closing only rewrite the hash with replaceState, so the navigation never sees a hashchange.

export const HOW_SECTIONS = [
  ['basics', 'What a bounty is'],
  ['work', 'Do the work'],
  ['upload', 'Upload with your stake'],
  ['review', 'Submissions and review'],
  ['escrow', 'The escrow'],
  ['dao', 'Add it to your DAO'],
  ['settings', 'Settings'],
  ['faq', 'FAQ'],
];
const HASH = 'how-it-works';
const code = (s) => `<code>${s}</code>`;

const BODY = {
  // r3: staked upload (silo.js). Plain words; the exact checks are in the source notes of silo.js.
  upload: `
    <p class="bx-how-lead">Instead of pinning your file yourself, you can hand it to Terp’s upload service. You prove you are a real staker, and the service takes the file. It costs nothing and sends nothing to the chain.</p>
    <ol class="bx-how-flow" aria-label="Uploading with your stake, step by step">
      <li><b>Check</b><span>Fill in the form and press “Check the document”. The page works out the file’s fingerprint and its CID.</span><i>Ready</i></li>
      <li><b>Prove</b><span>Press “Upload with my stake”. The page proves your stake from the public RPC (ICS-23), asks Keplr for an ADR-36 signature, then authorize + PUT on s3.terp.network. If proofs cannot be built, OPEN-7 is shown honestly. The page reads your stake straight from the chain, with a proof anyone can check. It shows how much you have staked next to the minimum the escrow asks for (${code('10 TERP')} today).</span><i>Proven</i></li>
      <li><b>Sign</b><span>Your wallet asks you to sign a short permission slip: “this file, for this bounty, for the next 10 minutes”. It is not a transaction. Your key never leaves the wallet.</span><i>Signed</i></li>
      <li><b>Send</b><span>The service checks the proof and the slip, then takes the file. The CID is filled in for you, and you hand in the work as usual.</span><i>Uploaded</i></li>
    </ol>
    <h3>Good to know</h3>
    <ul class="bx-how-list">
      <li><b>“Checked, not stored yet”</b> means the service said yes to everything but is still in test mode and kept nothing. Pin the file yourself for now.</li>
      <li>If the service can’t be reached, or you don’t have enough stake, nothing is lost: download the file, pin it anywhere, and paste the CID.</li>
      <li>New files wait in a review area before they are public.</li>
    </ul>`,
  review: `
    <p class="bx-how-lead">Two tabs at the top of the list: one for everyone, one for the people who decide.</p>
    <ul class="bx-how-list">
      <li><b>Submissions</b> shows every piece of work handed in, for every bounty, straight from the escrow. No wallet needed. Each file is fetched by its CID and its fingerprint is checked against the chain before it is shown.</li>
      <li><b>Review desk</b> is where bounties get listed, assigned, sent back for changes, accepted and paid. Anyone can look. Only two wallets get buttons: the approver (the Terp DAO) and the operator the DAO has given permission to.</li>
      <li>The operator’s permission is limited. Today it covers listing, turning down, assigning, un-assigning, asking for changes and cancelling. Accepting and paying still need a DAO vote, so for those the desk shows the message to put in a proposal.</li>
      <li>Every button opens your own wallet. Nothing is signed by a server.</li>
    </ul>`,
  // submit1: the ELI5 path for a worker, matching the buttons in a bounty's "Take part" section.
  work: `
    <p class="bx-how-lead">Five steps, from “I want this job” to “I got paid”. You need a wallet for steps 4 and 5.</p>
    <ol class="bx-how-flow" aria-label="Doing a bounty, step by step">
      <li><b>Apply</b><span>Open a bounty and read what “done” means. Send the approver a short plan and your wallet address. If it fits, they assign the bounty to you.</span><i>Assigned</i></li>
      <li><b>Build</b><span>Do the work. Keep links to it: a pull request, a commit, a transaction, a report.</span><i>Work</i></li>
      <li><b>Pin</b><span>Press “Build a submission”, fill in the form (or import a file), and press “Check the document”. Download the file and pin it to IPFS with any pinning service or your own node. Don’t change the file: one changed byte changes its fingerprint.</span><i>File</i></li>
      <li><b>Submit</b><span>Paste the CID your pinning service gives you. When it matches, connect the assigned wallet and press “Hand in work”. Your wallet asks you to approve before anything is sent. You need ${code('100 TERP')} staked first.</span><i>Submitted</i></li>
      <li><b>Get paid</b><span>The approver reads your file. They accept it, or ask for changes and you hand in again. Once accepted, the reward is released to your address.</span><i>Paid</i></li>
    </ol>
    <h3>Good to know</h3>
    <ul class="bx-how-list">
      <li><b>Only the assigned wallet</b> can hand in work. Other addresses see why the button is off.</li>
      <li><b>The fingerprint</b> (sha256) of your file goes on chain. Anyone can fetch the file by its CID and check it matches; each submission shows “Verified” or “Mismatch”.</li>
      <li><b>No wallet extension?</b> Every action also shows the exact message, so you can copy it and sign it with the terpd CLI.</li>
    </ul>`,
  basics: `
    <p class="bx-how-lead">A bounty is a job with the pay already in a locked box. Someone does the job, the DAO checks it, and the box opens to pay them.</p>
    <ol class="bx-how-flow" aria-label="Bounty life, step by step">
      <li><b>Create</b><span>The proposer writes the job and puts the reward in. The contract locks it.</span><i>Pending</i></li>
      <li><b>Approve</b><span>The approver lists it, so people can see it and apply.</span><i>Open</i></li>
      <li><b>Assign</b><span>One worker gets the job.</span><i>Assigned</i></li>
      <li><b>Submit</b><span>The worker hands in a link to the finished work before the deadline.</span><i>Submitted</i></li>
      <li><b>Accept</b><span>The approver says “yes, this is done”.</span><i>Accepted</i></li>
      <li><b>Payout</b><span>The approver releases the reward to the worker.</span><i>Paid</i></li>
    </ol>
    <h3>When things don’t go to plan</h3>
    <ul class="bx-how-list">
      <li><b>Reject</b>: the approver says no before listing. The reward goes back to the proposer.</li>
      <li><b>Cancel</b>: the proposer can cancel while it is Pending or Open; the approver can also cancel an Assigned one. Full refund to the proposer.</li>
      <li><b>Expire</b>: once the deadline passes, <em>anyone</em> can close a Pending, Open or Assigned bounty. Full refund to the proposer.</li>
      <li><b>Request changes</b>: the work goes back to the worker (Submitted → Assigned) to fix it.</li>
      <li><b>Unassign</b>: the job goes back on the board (Assigned → Open).</li>
    </ul>
    <p class="bx-how-note">Work that was handed in on time (Submitted or Accepted) can’t be expired, so a worker can’t lose a job just by the clock running out. “Done” is not “paid”: accept and payout are two separate steps, and neither is ever automatic.</p>`,

  escrow: `
    <p class="bx-how-lead">Think of the contract as a see-through safe. Money goes in when the bounty is made and only comes out by the rules below.</p>
    <dl class="bx-how-dl">
      <dt>Money goes in once</dt>
      <dd>Creating a bounty must send exactly the reward: one coin, same token, same amount. Anything else and the whole transaction fails.</dd>
      <dt>Pay comes only from the safe</dt>
      <dd>Payouts use only the reward locked in that bounty. The contract never reaches into a DAO treasury.</dd>
      <dt>Who gets paid</dt>
      <dd>Always the assigned worker. If the DAO set a fee (${code('fee_bps')}, at most 10%), that slice goes to the ${code('fee_collector')} and the worker gets the rest.</dd>
      <dt>Paying in parts</dt>
      <dd>Only if ${code('allow_partial_payouts')} is on. The approver can then pay some now and either pay the rest later or send what is left back to the proposer (${code('settle_remainder')}).</dd>
      <dt>Where refunds go</dt>
      <dd>To the proposer, every time: reject, cancel and expire all return whatever is still locked. When a pre-propose module creates the bounty, the refund goes to the real person it names.</dd>
      <dt>Stakes for workers and uploads</dt>
      <dd>These are “show you’re invested” checks, not deposits. To submit work, the worker must have at least ${code('min_submit_stake')} TERP staked (bonded). To upload documents to the storage service, at least ${code('min_upload_stake')}. Nothing is locked or slashed, and ${code('0')} turns a check off.</dd>
    </dl>
    <p class="bx-how-note">Stake is checked at the moment you act, and only bonded stake counts. The upload check is enforced by the off-chain storage service, which asks the contract (${code('can_upload')}).</p>`,

  dao: `
    <p class="bx-how-lead">The escrow plugs into a DAO (built with DAO DAO) the same way a voting module does: as a <b>proposal module</b>. Each bounty shows up like a proposal.</p>
    <p>It answers the usual DAO DAO questions: ${code('Info {}')}, ${code('Dao {}')}, ${code('Proposal')}, ${code('ListProposals')} / ${code('ReverseProposals')}, ${code('ProposalCount')}, ${code('NextProposalId')}, ${code('ProposalCreationPolicy')} and ${code('ProposalHooks')}. It also supports pre-propose (${code('pre_propose_info')}).</p>
    <h3>Setting it up, step by step</h3>
    <ol class="bx-how-steps">
      <li><b>Get the code on chain.</b> Store the contract once, or reuse a code ID that is already stored.</li>
      <li><b>Vote it in.</b> A DAO proposal creates the escrow and registers it as a proposal module. Make the DAO itself the ${code('owner')} and ${code('approver')}.</li>
      <li><b>Optional: let a member create bounties for the DAO.</b> A second proposal gives one member an authz grant that can only call ${code('create_bounty')} on this escrow, with a cap on calls, a cap on how much it can spend per token, and an expiry date. Another proposal can revoke it.</li>
      <li><b>Keep the important buttons with the DAO.</b> Approve, accept and payout are approver actions, so each one is a DAO proposal that has to pass.</li>
    </ol>
    <p class="bx-how-note">Bounties are not voted on inside the module: there are no votes or vote hooks. The DAO’s say comes from being the approver. A plain ${code('dao-pre-propose-single')} can’t drive it because it sends no funds; a bounty-aware pre-propose module has to pass the reward along.</p>`,

  settings: `
    <p class="bx-how-lead">These are the knobs a DAO picks when it creates the escrow. The owner can change them later with ${code('update_config')}, and every change needs a new ${code('params_version')}.</p>
    <h3>Who can create bounties</h3>
    <div class="bx-how-tablewrap"><table class="bx-how-table">
      <thead><tr><th scope="col">Setting</th><th scope="col">In plain words</th></tr></thead>
      <tbody>
        <tr><th scope="row">${code('creation_gate: anyone {}')}</th><td>Anyone who puts up the reward can create one. It still needs the approver to be listed.</td></tr>
        <tr><th scope="row">${code('creation_gate: min_stake { amount }')}</th><td>Only people with at least this much TERP staked.</td></tr>
        <tr><th scope="row">${code('creation_gate: proposer_gate {}')}</th><td>The default (legacy) gate: pass any one of the ${code('gate')} checks below.</td></tr>
        <tr><th scope="row">${code('gate.use_allowlist')} + ${code('initial_allowlist')}</th><td>A list the owner keeps (${code('update_allowlist')}). Good for “DAO only” or partner DAOs.</td></tr>
        <tr><th scope="row">${code('gate.cw4_group')}</th><td>DAO members only: anyone in this cw4 group with weight above 0.</td></tr>
        <tr><th scope="row">${code('gate.min_stake')}</th><td>Stakers only, by amount staked.</td></tr>
        <tr><th scope="row">${code('pre_propose_info')}</th><td>${code('anyone_may_propose')} (default), or ${code('module_may_propose')}: a pre-propose module becomes the only door, and the gate above is ignored.</td></tr>
        <tr class="is-soon"><th scope="row">${code('creation_gate: counterparty_escrow_proof { chain }')}</th><td><span class="bx-how-soon">Coming soon</span> Fund a bounty from another chain with a private proof. Not built: the contract refuses it today.</td></tr>
      </tbody>
    </table></div>
    <h3>Money, time and rules</h3>
    <div class="bx-how-tablewrap"><table class="bx-how-table">
      <thead><tr><th scope="col">Setting</th><th scope="col">In plain words</th></tr></thead>
      <tbody>
        <tr><th scope="row">${code('owner')}</th><td>Who can change settings and the allowlist. The DAO, in production.</td></tr>
        <tr><th scope="row">${code('approver')}</th><td>The only one who can approve, reject, accept and pay out. Never automatic.</td></tr>
        <tr><th scope="row">${code('dao')}</th><td>The DAO this module belongs to. Defaults to whoever creates it.</td></tr>
        <tr><th scope="row">${code('denoms [{ denom, min_amount, max_amount }]')}</th><td>Which tokens a reward can be in, and the smallest and largest reward for each.</td></tr>
        <tr><th scope="row">${code('fee_bps')} + ${code('fee_collector')}</th><td>A cut of each payout (100 = 1%, at most 1000 = 10%) and where it goes. Needs a collector if above 0.</td></tr>
        <tr><th scope="row">${code('min_duration_secs')} / ${code('max_duration_secs')}</th><td>The shortest and longest deadline a bounty may have.</td></tr>
        <tr><th scope="row">${code('allow_partial_payouts')}</th><td>Allow paying a reward in parts.</td></tr>
        <tr><th scope="row">${code('min_submit_stake')}</th><td>TERP a worker must have staked to hand in work. 0 = off.</td></tr>
        <tr><th scope="row">${code('min_upload_stake')}</th><td>TERP needed to upload documents to the storage service. 0 = off.</td></tr>
        <tr><th scope="row">${code('params_version')} / ${code('params_placeholder')}</th><td>A label for this set of settings, and a flag that says “these are placeholders, not voted yet”.</td></tr>
        <tr><th scope="row">Mainnet guard (${code('dev-chain-guard')} build feature)</th><td>Test builds refuse to start on Terp mainnet (morocco-1). A mainnet build has to be made on purpose, after governance signs off.</td></tr>
      </tbody>
    </table></div>`,

  faq: `
    <dl class="bx-how-faq">
      <dt>Are the rewards I see final?</dt>
      <dd>No. Every reward and every setting is <span class="bx-pending">proposed, pending vote</span> until the DAO votes on it.</dd>
      <dt>Do I need a wallet to look around?</dt>
      <dd>No. Browsing is free and needs no wallet. You only need one to hand in work or to sign the approver’s steps.</dd>
      <dt>Can someone run off with the reward?</dt>
      <dd>The reward can only go to the assigned worker (through the approver) or back to the proposer. Nobody else can take it out.</dd>
      <dt>What if I hand in work and nobody answers?</dt>
      <dd>Submitted work can’t be expired. Only the approver can settle it: accept and pay, ask for changes, or cancel.</dd>
      <dt>Will I lose my stake?</dt>
      <dd>No. The submit and upload stakes are only checked, never locked or taken.</dd>
      <dt>Can I fund a bounty from another chain?</dt>
      <dd>Not yet. That option (${code('counterparty_escrow_proof')}) is designed but not built.</dd>
      <dt>How do I get a bounty?</dt>
      <dd>Open one, read what “done” means, and send the approver a short plan. If they pick you, they assign it to your address. Then you do the work and hand it in before it closes.</dd>
      <dt>Where does the list come from?</dt>
      <dd>Straight from the escrow contract on Terp mainnet. Each bounty’s full brief is a small file whose fingerprint is stored on chain, so the page can check it wasn’t changed.</dd>
    </dl>`,
};

export function mountHowTo(root) {
  const d = document.createElement('dialog');
  d.className = 'bx3-dlg bx-how';
  d.id = 'bx-how';
  d.setAttribute('aria-labelledby', 'bx-how-t');
  const tabs = HOW_SECTIONS.map(([k, t], i) => `<button type="button" role="tab" id="bx-how-tab-${k}" aria-controls="bx-how-p-${k}" data-sec="${k}" aria-selected="${i ? 'false' : 'true'}" tabindex="${i ? '-1' : '0'}">${t}</button>`).join('');
  const panels = HOW_SECTIONS.map(([k, t], i) => `<section role="tabpanel" class="bx-how-panel" id="bx-how-p-${k}" aria-labelledby="bx-how-tab-${k}" tabindex="0"${i ? ' hidden' : ''}><h3 class="bx-how-h">${t}</h3>${BODY[k]}</section>`).join('');
  d.innerHTML = `<div class="bx3-dlg-head"><h2 id="bx-how-t">How bounties work</h2><button type="button" class="bx3-x" aria-label="Close how bounties work">×</button></div>
    <div class="bx-how-tabs" role="tablist" aria-label="Manual sections">${tabs}</div>${panels}`;
  root.append(d);
  const tabEls = [...d.querySelectorAll('[role="tab"]')];
  let opener = null, prevHash = '';

  function show(sec, focus) {
    const key = HOW_SECTIONS.some(([k]) => k === sec) ? sec : HOW_SECTIONS[0][0];
    for (const b of tabEls) { const on = b.dataset.sec === key; b.setAttribute('aria-selected', on ? 'true' : 'false'); b.tabIndex = on ? 0 : -1; if (on && focus) b.focus(); }
    for (const p of d.querySelectorAll('[role="tabpanel"]')) p.hidden = p.id !== 'bx-how-p-' + key;
    d.querySelector('#bx-how-p-' + key).scrollTop = 0;
    if (d.open) setHash('#' + HASH + '/' + key);
    return key;
  }
  function setHash(h) { try { const u = new URL(location.href); u.hash = h; history.replaceState(history.state, '', u.href); } catch { /* ignore */ } }

  d.querySelector('.bx3-x').addEventListener('click', () => d.close());
  d.addEventListener('click', (e) => { if (e.target === d) d.close(); });   // backdrop click
  d.addEventListener('close', () => {
    if (location.hash.startsWith('#' + HASH)) setHash(prevHash);
    opener?.focus({ preventScroll: true }); opener = null;
  });
  d.querySelector('.bx-how-tabs').addEventListener('click', (e) => { const b = e.target.closest('[role="tab"]'); if (b) show(b.dataset.sec, true); });
  d.querySelector('.bx-how-tabs').addEventListener('keydown', (e) => {
    const i = tabEls.indexOf(document.activeElement);
    if (i < 0) return;
    const n = { ArrowRight: i + 1, ArrowDown: i + 1, ArrowLeft: i - 1, ArrowUp: i - 1, Home: 0, End: tabEls.length - 1 }[e.key];
    if (n == null) return;
    e.preventDefault();
    show(tabEls[(n + tabEls.length) % tabEls.length].dataset.sec, true);
  });

  function open(sec, from) {
    opener = from || document.activeElement;
    if (!location.hash.startsWith('#' + HASH)) prevHash = location.hash;
    if (!d.open) { d.parentNode.append(d); d.showModal(); }   // last in DOM = top-most for the focus trap in dialogs.js
    const key = show(sec, false);
    setHash('#' + HASH + '/' + key);
    d.querySelector(`#bx-how-tab-${key}`).focus();
  }
  // one delegated listener for every "How it works" / "?" button: data-how="<section>"
  root.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('[data-how]'); if (b && !d.contains(b)) { e.preventDefault(); open(b.dataset.how, b); } });
  const fromHash = () => { const m = location.hash.match(/^#how-it-works(?:\/([\w-]+))?$/); return m ? (m[1] || HOW_SECTIONS[0][0]) : null; };
  addEventListener('hashchange', () => { if (!root.isConnected) return; const s = fromHash(); if (s) open(s); });
  const initial = fromHash();
  if (initial) { prevHash = ''; open(initial); }
  return { open, el: d };
}

/** A small round "?" button that opens one section of the manual. */
export function helpBtn(sec, label) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'bx-q'; b.dataset.how = sec; b.textContent = '?';
  b.setAttribute('aria-label', label); b.title = label;
  return b;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════════
 * DEV NOTES (bounty3, source only, never rendered): UPLOAD GAPS
 * Permissionless bounty file uploads to our S3 static resources, planned moderation, and what is missing.
 * Mirrored at /workspace/terp/bounties/upload-gaps.md (agent box). Keep both in sync.
 * ────────────────────────────────────────────────────────────────────────────────────────────────────
 * # Bounties: gaps for permissionless file uploads to our S3 static resources
 *
 * Source-only developer notes (mirrored from the comment block in
 * `websites/terp.network/lib/bounties/howto.js`). Paths are relative to `terp-core/`.
 * Status: **present** = exists and works, **partial** = some of it exists, **missing** = not found in this tree.
 * Line refs checked 2026-10-29 on the dev tree.
 *
 * ## Where things stand today
 * - The site has **no upload path**. Drafts are saved in the browser and downloaded as JSON
 *   (`websites/terp.network/lib/bounties/flows.js:366`). The only HTTP POST in `lib/bounties/` is the tx broadcast
 *   (`lib/bounties/escrow-signer.js:129`).
 * - Documents are **read** by CID from `https://s3.terp.network/static/bounties/cid/`
 *   (`lib/bounties/board.js:17`), and accepted only if sha256(bytes) equals the CID digest (`lib/bounties/cid.js:1-4, 20-24, 45-75`).
 * - Writes to the bucket today are **admin-only**: `scripts/deploy-sites.sh` mirrors `dist/` with `mc` and operator S3 credentials
 *   (`websites/terp.network/scripts/deploy-sites.sh:8-14, 89-106`). That is a site deploy, not a user upload path.
 * - The design for an upload service is in `crates/terp-rs/contracts/revenue/bounty-escrow/DESIGN.md:158-162` (§5e):
 *   `zec-bounties-backend/services/cidStorage.js`, `POST /api/v1/dev/cid-storage/upload`, dev-only, loopback-only, `*-dev` bucket,
 *   never `s3.terp.network`. **That service is not in this tree.** A search of `~/abstract` to depth 6 found no
 *   `cidStorage*` or `zec-bounties-backend`.
 * - Storage backend that exists: `crates/minio-ipfs` (MinIO + Kubo, webhook-collector pins on `ObjectCreated` and acts on
 *   `ObjectRemoved`, `/pins` on :9100; `crates/minio-ipfs/README.md:29-42`).
 *
 * ## Planned moderation 1: minimum staked TERP to upload
 * - Contract: `min_upload_stake` (`src/msg.rs:34-36`, `src/state.rs:76-81`), set at instantiate and changed only by
 *   `update_config` with a new `params_version` (`src/contract.rs:311-326, 386-400`). `0` turns it off.
 * - The contract **never enforces it in an execute path**. It only answers `CanUpload { address }`
 *   (`src/msg.rs:161-163`, `src/contract.rs:1150-1159`): bonded stake in the bond denom >= `min_upload_stake`.
 *   Nothing is locked or slashed (a balance check, not a deposit).
 * - Site: reads the value into `PARAMS.min_upload_stake` (`lib/bounties/chain.js:57, 69`) and has a wrapper
 *   `canUpload()` (`lib/bounties/escrow-signer.js:110`) that **nothing calls**.
 * - Gap: the check must live in the upload service, at upload time, against the signer proven by the wallet
 *   signature. Stake can be undelegated a minute later; no re-check or penalty exists. Status: **partial**.
 *
 * ## Planned moderation 2: decision-model middleware
 * - Goal: judge whether a bounty proposal or document is viable and not malicious before it is accepted or published.
 * - Tiered validation, in order, fail-closed:
 *   1. Deterministic checks first (cheap, no model): content type, size, schema version, canonical JSON, CID == sha256,
 *      ADR-36 signature, nonce, rate limit, `can_upload`, denylist.
 *   2. Cheap model triage: pass, reject, or escalate.
 *   3. Stronger model validates anything escalated or borderline.
 *   4. Human approval stays for money: on chain only the `approver` can approve, accept and pay out, and payout is never
 *      automatic (`DESIGN.md:39`; `approve`/`accept`/`payout` are approver-only in `src/contract.rs`).
 * - Where it sits: inside the upload service, after auth, stake and rate limit and **before** any PUT to a public prefix.
 *   It writes to a quarantine prefix; only a pass (or a human release) copies the bytes to the public `cid/` prefix.
 *   A second, advisory pass can flag a `Pending` bounty for the approver before the DAO votes.
 * - Fail-closed: model timeout, error or low confidence means **hold in quarantine**, never publish. The chain stays the
 *   authority: the model can block publication, never approve or pay.
 * - Status: **missing** (no middleware, no model hook, no quarantine prefix found).
 *
 * ## Gap list
 * | # | Gap | Status | Evidence |
 * |---|-----|--------|----------|
 * | 1 | Permissionless upload endpoint to the S3 static bucket | missing | no POST/PUT in `lib/bounties/` except the tx broadcast (`escrow-signer.js:129`); drafts download only (`flows.js:366`) |
 * | 2 | CID storage service (DESIGN §5e) | missing | specified in `DESIGN.md:160-161` as `zec-bounties-backend/services/cidStorage.js`; not in this tree |
 * | 3 | Signed-URL / presign service | missing | none found; the only bucket writer is `deploy-sites.sh` with operator credentials |
 * | 4 | Wallet-signature auth bound to the staker (ADR-36 `terp-cid-storage/v1/upload`, nonce, expiry) | missing | designed in `DESIGN.md:160`; no client signer for it in `lib/bounties/` |
 * | 5 | Stake verification at upload time | partial | `CanUpload` query exists (`contract.rs:1150-1159`), wrapper unused (`escrow-signer.js:110`); no server calls it; no re-check later |
 * | 6 | File type and size limits | partial | client only: JSON, 256 KiB (`vendor/terp-schemas.js:1984`, `cid.js:8`, `flows.js:450`); inline docs <= 16 KiB (`board.js:110`); nginx `client_max_body_size 10m` is site-wide (`nginx/terp.network.conf:225`); no server-side check |
 * | 7 | Content scanning (malware, abuse, PII) | missing | nothing found |
 * | 8 | CID/hash verification on read | present | `cid.js:20-24` sha256 vs CID digest; cache re-verified (`cid.js:49`) |
 * | 9 | CID/hash binding on chain | partial | escrow checks hash format and CID format separately (`contract.rs:473-477, 685-688`; `cid.rs:87`), does not check hash == CID digest; board inline `doc` check per `board.js:106-109` |
 * | 10 | Chain-history -> bucket mirror ("stateless mirror", `board.js:108`) | missing | not found |
 * | 11 | Rate limits | missing | designed 10/min per address (`DESIGN.md:160`); nothing implemented |
 * | 12 | Quarantine and moderation queue | missing | readers fetch the public `static/bounties/cid/` prefix directly (`board.js:17`); no staging prefix |
 * | 13 | Takedown path | partial | minio-ipfs reacts to `ObjectRemoved` (`minio-ipfs/README.md:37`); no denylist in the reader, IPFS gateway fallback (`board.js:17`) can still serve a removed object; no runbook |
 * | 14 | Logging and audit | partial | on-chain events cover create/submit (`contract.rs:105, 717`); no upload log, no moderation decision log |
 * | 15 | Decision-model middleware, fail-closed | missing | see "Planned moderation 2" |
 * | 16 | Human approval before payout | present | approver-only approve/accept/payout, never automatic (`DESIGN.md:39`) |
 *
 * **Counts:** missing 9, partial 5, present 2.
 *
 * ## Top 3
 * 1. **No upload path at all** (#1-#3): no endpoint, no presign, and the §5e service is not in the tree. A permissionless
 *    upload today can only happen through operator credentials.
 * 2. **Upload stake is not enforced anywhere** (#4, #5): `can_upload` exists on chain but nothing calls it, and nothing
 *    binds an upload to a signed staker.
 * 3. **No quarantine, scanning or model gate before publish** (#7, #12, #15): anything written to `static/bounties/cid/`
 *    is public right away, and takedown does not reach the IPFS fallback.
 * ════════════════════════════════════════════════════════════════════════════════════════════════════ */
