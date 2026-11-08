// Review desk (tab inside /bounties).
// Roles:
//   - escrow approver (FIAB core): signs MsgExecuteContract directly
//   - FIAB member (authz grantee of core): MsgExec(member){MsgExecuteContract(core, escrow, msg)}
//     Full nest at zigner execute time: MsgExec(session){MsgExec(member){MsgExecuteContract(core,…)}}
//   - everyone else: read-only
// OPEN-9 settled (option A): accept/payout via extended core→member grant. Live grant today lacks
// those keys — show MsgGrant from 02c and still build ready msgs. Never holds admin keys.
// OPEN-10: hosted ZID admin page linked below (caps-not-live until OPEN-12).
import * as SB from '/lib/bounties/submit.js?v=4a2d047454';
import { OPEN, FIAB, msgGrantExtendAcceptPayout, nestedAcceptPayoutExec } from '/lib/bounties/curate.js?v=34c8be7982';
import { formatMicro } from '/lib/amount.js?v=2cb261fcfb-r2';
const terp = (m) => (/^\d+$/.test(String(m ?? '')) ? formatMicro(m, 6, 2) : '—');

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a ? `${a.slice(0, 10)}…${a.slice(-6)}` : '—');
const EXEC = '/cosmwasm.wasm.v1.MsgExecuteContract', AUTHZ_EXEC = '/cosmos.authz.v1beta1.MsgExec';
const NEED_EXTEND = new Set(['accept', 'payout']);

export const DESK = [
  ['approve', 'List it', ['pending'], [], (b) => ({ approve: { id: b.id } })],
  ['reject', 'Turn it down', ['pending'], ['reason'], (b, f) => ({ reject: { id: b.id, reason: f.reason || null } })],
  ['assign', 'Assign a worker', ['open'], ['assignee'], (b, f) => ({ assign: { id: b.id, assignee: f.assignee } })],
  ['unassign', 'Put back on the board', ['assigned'], [], (b) => ({ unassign: { id: b.id } })],
  ['request_changes', 'Ask for changes', ['submitted'], ['reason'], (b, f) => ({ request_changes: { id: b.id, reason: f.reason || null } })],
  ['accept', 'Accept the work', ['submitted'], [], (b) => ({ accept: { id: b.id } })],
  ['payout', 'Pay the worker', ['accepted'], [], (b) => ({ payout: { id: b.id, amount: null } })],
];

export function execJson(sender, contract, msg) { return { '@type': EXEC, sender, contract, msg, funds: [] }; }
export function authzJson(grantee, sender, contract, msg) { return { '@type': AUTHZ_EXEC, grantee, msgs: [execJson(sender, contract, msg)] }; }

/** Keys a ContractExecutionAuthorization grant lets grantee send to contract for granter; null = no grant. */
export async function grantKeys(rest, granter, grantee, contract) {
  const r = await fetch(`${rest}/cosmos/authz/v1beta1/grants?granter=${granter}&grantee=${grantee}`, { credentials: 'omit', cache: 'no-store' });
  if (!r.ok) return null;
  const j = await r.json(); const keys = new Set(); let exp = null, any = false, limit = null;
  for (const g of j.grants || []) {
    const a = g.authorization || {};
    if (!/ContractExecutionAuthorization$/.test(a['@type'] || '')) continue;
    for (const cg of a.grants || []) {
      if (cg.contract !== contract) continue;
      any = true; exp = g.expiration || exp; limit = cg.limit || limit;
      const f = cg.filter || {};
      if (/AllowAllMessagesFilter$/.test(f['@type'] || '')) DESK.forEach((d) => keys.add(d[0]));
      (f.keys || []).forEach((k) => keys.add(k));
    }
  }
  return any ? { keys, expiration: exp, limit } : null;
}

export async function mountDesk(host, { live, bounties, reload }) {
  const W = await SB.walletApi();
  const approver = (live.cfg && live.cfg.approver) || FIAB.core;
  const member = FIAB.member;
  let me = SB.myAddress(W), role = 'none', grant = null;
  const daoHref = (live.chainCfg && live.chainCfg.bounties && live.chainCfg.bounties.daoApp) || 'https://daodao.terp.network';

  host.innerHTML = `<div class="bxd">
    <p class="bxl-dim">Who decides, and how <button type="button" class="bx-q" data-how="review" aria-label="How the review desk works">?</button></p>
    <div id="bxd-who" aria-live="polite"></div>
    <div class="bxd-admin-tools" id="bxd-admin-tools">
      <h3>Admin tools (no keys on this page)</h3>
      <p class="bxs-open-note" role="note"><b>Accept / payout</b> use nested authz <code>MsgExec(session){MsgExec(member){MsgExecuteContract(core, escrow, msg)}}</code> via granter/zigner (option A: extend FIAB core→member grant). This page never holds admin keys.</p>
      <p class="bxs-open-note" role="note"><b>Merkle-caps admin ZID</b> — <a class="plane-link snap-btn" href="/bounties/admin-approve">Open admin approval page</a>. Until caps root is live (${OPEN.capsRoot.id}): shows “caps not live yet”. Stake-path evidence is unaffected.</p>
      <p class="bxl-dim">FIAB core (approver) <code title="${esc(FIAB.core)}">${esc(short(FIAB.core))}</code> · member <code title="${esc(member)}">${esc(short(member))}</code> · escrow <code title="${esc(FIAB.escrow)}">${esc(short(FIAB.escrow))}</code> code ${FIAB.escrowCodeId}</p>
      <div id="bxd-grant-status" class="bxd-grant" aria-live="polite"></div>
    </div>
    <div id="bxd-q"></div>
  </div>`;

  const $ = (s) => host.querySelector(s);

  function paintGrantBanner() {
    const el = $('#bxd-grant-status');
    if (!el) return;
    const hasAccept = !!(grant && grant.keys.has('accept') && grant.keys.has('payout'));
    if (hasAccept) {
      el.innerHTML = `<div class="bxd-note is-ok" role="status">Live grant includes <code>accept</code> and <code>payout</code>. Member can sign the nested authz exec.</div>`;
      return;
    }
    const mg = msgGrantExtendAcceptPayout(grant && grant.limit ? {
      callsRemaining: (grant.limit.calls_remaining || grant.limit.remaining || '107'),
      uterp: ((grant.limit.amounts || []).find((a) => a.denom === 'uterp') || {}).amount || '39168983330',
      uthiol: ((grant.limit.amounts || []).find((a) => a.denom === 'uthiol') || {}).amount || '97970779226',
      expiration: grant.expiration || '2027-10-30T00:00:00Z',
    } : {});
    el.innerHTML = `<div class="bxd-note" role="status"><b>Authz grant not set up for accept/payout.</b> Live keys today: ${grant ? [...grant.keys].map((k) => `<code>${esc(k)}</code>`).join(' ') : '(no grant read)'}. Foundation/FIAB must pass the MsgGrant below (from <code>02c-proposal-grant-extend</code>). Accept/payout messages are still built and ready.</div>
      <details class="bxd-grant-details"><summary>MsgGrant to extend core→member (copy)</summary>
        <pre class="bxl-msg" id="bxd-msggrant" tabindex="0">${esc(JSON.stringify(mg, null, 2))}</pre>
        <button type="button" class="plane-link secondary snap-btn" id="bxd-copy-grant">Copy MsgGrant</button>
      </details>`;
    const btn = $('#bxd-copy-grant');
    if (btn) btn.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(JSON.stringify(mg, null, 2)); btn.textContent = 'Copied'; }
      catch { btn.textContent = 'Select the text to copy'; }
    });
  }

  async function who() {
    me = SB.myAddress(W); role = 'none'; grant = null;
    if (me && me === approver) role = 'approver';
    else if (me) {
      try { grant = await grantKeys(live.rest, approver, me, live.escrow || FIAB.escrow); } catch { grant = null; }
      if (grant) role = 'grantee';
      // Also read canonical core→member grant for the banner even if connected wallet differs
      if (me !== member) {
        try {
          const g2 = await grantKeys(live.rest, FIAB.core, FIAB.member, FIAB.escrow);
          if (g2) grant = grant || g2;
          // Prefer showing the canonical grant keys for accept/payout readiness
          if (g2) host._fiabGrant = g2;
        } catch { /* ignore */ }
      } else {
        host._fiabGrant = grant;
      }
    } else {
      try { host._fiabGrant = await grantKeys(live.rest, FIAB.core, FIAB.member, FIAB.escrow); grant = host._fiabGrant; } catch { host._fiabGrant = null; }
    }
    const gShow = host._fiabGrant || grant;
    const notice = !me
      ? `<div class="bxd-note" role="note"><b>Read-only.</b> Connect the FIAB member wallet to sign authz execs. <button type="button" class="plane-link secondary snap-btn" id="bxd-connect">Sign in with Keplr</button></div>`
      : role === 'none'
        ? `<div class="bxd-note" role="note"><b>Read-only.</b> <code>${esc(short(me))}</code> is not the approver and has no permission from it for this escrow.</div>`
        : role === 'approver'
          ? `<div class="bxd-note is-ok" role="note">Signed in as the <b>approver</b> (FIAB core). Actions go straight to the escrow.</div>`
          : `<div class="bxd-note is-ok" role="note">Signed in as the <b>FIAB member</b> (authz grantee). Allowed: ${[...grant.keys].map((k) => `<code>${esc(k)}</code>`).join(' ')}${grant.expiration ? ` (until ${esc(String(grant.expiration).slice(0, 10))})` : ''}. Broadcast is <code>MsgExec(member){MsgExecuteContract(core,…)}</code>; zigner wraps an outer session MsgExec at CLI execute time.</div>`;
    $('#bxd-who').innerHTML = notice;
    // Use canonical grant for extend banner
    const saved = grant; grant = gShow || grant; paintGrantBanner(); grant = saved || gShow;
    const c = $('#bxd-connect'); if (c) c.addEventListener('click', async () => { try { await SB.connectHere(W, live.chainCfg); } catch (e) { c.insertAdjacentHTML('afterend', ` <span class="bx3-hint is-bad">${esc(e.message)}</span>`); return; } await who(); paint(); });
  }

  const can = (k) => {
    if (role === 'approver') return true;
    if (role === 'grantee' && grant && grant.keys.has(k)) return true;
    return false;
  };
  const grantHas = (k) => !!(host._fiabGrant && host._fiabGrant.keys.has(k));

  function paint() {
    const rows = bounties().filter((b) => DESK.some((d) => d[2].includes(b.status)));
    const order = ['submitted', 'accepted', 'pending', 'assigned', 'open'];
    rows.sort((a, b) => order.indexOf(a.status) - order.indexOf(b.status) || a.id - b.id);
    $('#bxd-q').innerHTML = `<h3>Queue <span class="bxl-n">${rows.length}</span></h3>
      <p class="bxl-dim">Waiting for a decision first (in review, accepted, pending), then open and assigned bounties.</p>
      <ol class="bxd-list">${rows.map((b) => `<li class="bxd-row" data-id="${b.id}">
        <div class="bxd-head"><b>${esc(b.bounty_ref)}</b> ${esc(b.title)} <span class="bxl-status is-${esc(b.status)}">${esc(b.status)}</span> <span class="bxl-dim">${terp(b.reward.amount)} TERP · ${b.submission_count} submitted</span></div>
        <div class="bxd-acts">${DESK.filter((d) => d[2].includes(b.status)).map((d) => {
          const ready = can(d[0]);
          const needsGrant = NEED_EXTEND.has(d[0]) && !grantHas(d[0]);
          const label = needsGrant ? `${d[1]} (grant pending)` : ready ? d[1] : `${d[1]} (preview)`;
          return `<button type="button" class="plane-link ${ready && !needsGrant ? '' : 'secondary'} snap-btn" data-act="${d[0]}" data-id="${b.id}">${esc(label)}</button>`;
        }).join('')}</div>
        <div class="bxd-form" data-form hidden></div></li>`).join('')}</ol>`;
  }

  host.addEventListener('click', async (e) => {
    const t = e.target.closest('button[data-act],button[data-send],button[data-copy],button[data-copy-nest]'); if (!t) return;
    const li = t.closest('.bxd-row'); if (!li) return;
    const b = bounties().find((x) => String(x.id) === li.dataset.id), form = li.querySelector('[data-form]');
    if (t.dataset.act) {
      const d = DESK.find((x) => x[0] === t.dataset.act);
      form.hidden = false; form.dataset.act = d[0];
      const needsGrant = NEED_EXTEND.has(d[0]) && !grantHas(d[0]);
      const canSign = can(d[0]) && !needsGrant;
      form.innerHTML = `${d[3].includes('assignee') ? `<label class="bx3-field"><span class="bx3-lbl">Worker address</span><input data-f="assignee" placeholder="terp1…" spellcheck="false" value="${esc(b.assignee || '')}"></label>` : ''}
        ${d[3].includes('reason') ? `<label class="bx3-field"><span class="bx3-lbl">Reason (shown to the worker)</span><input data-f="reason" maxlength="280"></label>` : ''}
        ${needsGrant ? `<div class="bxd-note" role="status"><b>Authz grant not set up</b> for <code>${esc(d[0])}</code>. Pass the MsgGrant above first. The nested exec below is ready for when the grant lands.</div>` : ''}
        <p class="bxl-dim">Wallet broadcast (member): <code>MsgExec(member){MsgExecuteContract(core, escrow, msg)}</code></p>
        <pre class="bxl-msg" data-json tabindex="0"></pre>
        <p class="bxl-dim">Full nest for granter/zigner CLI:</p>
        <pre class="bxl-msg" data-nest tabindex="0"></pre>
        <div class="bxs-row">${canSign ? `<button type="button" class="plane-link snap-btn" data-send>Sign in my wallet (Keplr)</button>` : ''}<button type="button" class="plane-link secondary snap-btn" data-copy>Copy wallet msg</button><button type="button" class="plane-link secondary snap-btn" data-copy-nest>Copy nested exec</button></div>
        <p class="bx3-hint" data-res aria-live="polite">${canSign ? 'Keplr will show the authz MsgExec. Outer session wrap is added by zigner at execute time.' : needsGrant ? 'Grant missing accept/payout — copy the MsgGrant for FIAB, and keep these msgs ready.' : role === 'none' ? 'Read-only: copy only.' : 'Your permission does not cover this action.'}</p>`;
      const sync = () => {
        form.querySelector('[data-json]').textContent = JSON.stringify(msgFor(d, b, form), null, 2);
        const raw = d[4](b, fields(form));
        form.querySelector('[data-nest]').textContent = JSON.stringify(nestedAcceptPayoutExec({ msg: raw }), null, 2);
      };
      form.oninput = sync; sync();
    } else if (t.hasAttribute('data-copy')) {
      try { await navigator.clipboard.writeText(form.querySelector('[data-json]').textContent); t.textContent = 'Copied'; } catch { t.textContent = 'Select the text to copy'; }
    } else if (t.hasAttribute('data-copy-nest')) {
      try { await navigator.clipboard.writeText(form.querySelector('[data-nest]').textContent); t.textContent = 'Copied nest'; } catch { t.textContent = 'Select the text to copy'; }
    } else if (t.hasAttribute('data-send')) {
      const d = DESK.find((x) => x[0] === form.dataset.act), res = form.querySelector('[data-res]');
      if (NEED_EXTEND.has(d[0]) && !grantHas(d[0])) {
        res.className = 'bx3-hint is-warn'; res.textContent = 'Authz grant not set up for accept/payout. Pass the MsgGrant (02c) first.'; return;
      }
      if (SB.myAddress(W) !== me) { res.className = 'bx3-hint is-bad'; res.textContent = 'The connected wallet changed. Reopen the desk.'; return; }
      const msg = d[4](b, fields(form));
      if (d[3].includes('assignee') && !/^terp1[0-9a-z]{38,}$/.test(msg.assign.assignee || '')) { res.className = 'bx3-hint is-bad'; res.textContent = 'Enter the worker’s terp1 address.'; return; }
      t.disabled = true; res.className = 'bx3-hint'; res.textContent = 'Waiting for Keplr…';
      try {
        let r;
        if (role === 'approver') r = await W.executeContract(live.escrow, msg, { memo: `${b.bounty_ref} ${d[0]}` });
        else {
          const C = await import(/* @vite-ignore */ `${(await import('/lib/config.js?v=a177cb9062')).cosmesBaseUrl()}/client`);
          const inner = new C.MsgExecuteContract({ sender: approver, contract: live.escrow, msg, funds: [] });
          r = await W.broadcast([new C.MsgExec({ grantee: me, msgs: [inner] })], `${b.bounty_ref} ${d[0]} (authz)`);
        }
        const hash = (r && (r.txhash || r.transactionHash || r.hash)) || (typeof r === 'string' ? r : '');
        res.className = 'bx3-hint is-ok'; res.textContent = hash ? `Sent. Transaction ${hash}. The list updates once the block is final.` : 'Sent.';
        setTimeout(() => reload && reload(), 7000);
      } catch (err) { res.className = 'bx3-hint is-bad'; res.textContent = `Not sent: ${err && err.message ? err.message : err}`; t.disabled = false; }
    }
  });

  const fields = (form) => { const f = {}; form.querySelectorAll('[data-f]').forEach((i) => { f[i.dataset.f] = i.value.trim(); }); return f; };
  function msgFor(d, b, form) {
    const msg = d[4](b, fields(form));
    // Member path: MsgExec(member){MsgExecuteContract(core,…)} — session wrap is zigner-side
    if (role === 'grantee' || NEED_EXTEND.has(d[0])) return authzJson(member, approver, live.escrow || FIAB.escrow, msg);
    if (role === 'approver') return execJson(me || approver, live.escrow || FIAB.escrow, msg);
    return authzJson(member, approver, live.escrow || FIAB.escrow, msg);
  }

  await who(); paint();
  if (W && W.onWalletChange) W.onWalletChange(async () => { if (SB.myAddress(W) !== me) { await who(); paint(); } });
  return { paint };
}
