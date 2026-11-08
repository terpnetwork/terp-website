// Submit-work, apply and create-bounty dialogs (chain1: on-chain board + per-task escrow, no backend; any native
// denom as the reward). Every action builds its exact message (./board.js via ./chain.js) and shows it; nothing is
// signed from this page until the board's go-live (escrowState says why, in one line).
import { CATEGORIES, CAT_BY_KEY, catOf, HORIZON_OF, fmt, LABEL } from '/lib/bounties/data.js?v=eeb0c09c37';
import { validSubmission, LOCAL, CHAIN } from '/lib/bounties/store.js?v=8b3d4fdc22';
import { PARAMS, escrowState, siteChainId, currentWallet, buildCreate, buildSubmit, buildApply, buildFund, buildApprove, escrowOf, fromMicro, capProblem, denomRule, paramsTag, submitGate, gateNote, Schemas, SUMMARY_MAX_BYTES, utf8Length, summaryProblem } from '/lib/bounties/chain.js?v=30c45273bf';
import { Q, BADGE_OF } from '/lib/bounties/board.js?v=29627017de';
import { fetchDoc } from '/lib/bounties/cid.js?v=94332d16b3-r2';
import { loadDenoms, labelOf, kindOf, toBase, fromBase } from '/lib/bounties/denoms.js?v=2364efe300-r2';
import { timeline } from '/lib/bounties/timeline.js?v=61009f14d2-r2';
import { why, shortLine } from '/lib/ui/why.js?v=58ee4c4362';
import { helpBtn } from '/lib/bounties/howto.js?v=06ac07bbde';

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids || []) if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
const field = (id, label, input, hint) => el('div', { class: 'bx3-field' }, [el('label', { for: id, text: label }), input, hint ? el('p', { class: 'bx-dim bx3-hint', id: id + '-hint', text: hint }) : null, el('p', { class: 'bx3-err', id: id + '-err', 'aria-live': 'polite' })]);
function showErrs(form, errs) {
  form.querySelectorAll('.bx3-err').forEach((p) => { p.textContent = ''; });
  form.querySelectorAll('[aria-invalid]').forEach((i) => i.removeAttribute('aria-invalid'));
  for (const [k, msg] of Object.entries(errs)) { const i = form.querySelector(`[name="${k}"]`); const p = form.querySelector(`#${i ? i.id : 'x'}-err`); if (p) p.textContent = msg; i?.setAttribute('aria-invalid', 'true'); }
  const first = Object.keys(errs)[0]; if (first) form.querySelector(`[name="${first}"]`)?.focus();
}
const HELP_OF = { 'bx-submit-dlg': 'escrow', 'bx-create-dlg': 'settings', 'bx-escrow-dlg': 'escrow', 'bx-apply-dlg': 'basics' };   // bounty2
function dialog(id, title) {
  const d = el('dialog', { class: 'bx3-dlg', id, 'aria-labelledby': id + '-t' });
  const x = el('button', { type: 'button', class: 'bx3-x', 'aria-label': 'Close', text: '×' });
  x.addEventListener('click', () => d.close());
  const h = HELP_OF[id] ? helpBtn(HELP_OF[id], 'How this works') : null;
  d.append(el('div', { class: 'bx3-dlg-head' }, [el('h2', { id: id + '-t', text: title }), el('span', { class: 'bx3-dlg-acts' }, [h, x])]));
  return d;
}

// Live "N / 280 bytes (UTF-8)" counter for an on-chain summary (the contract's SUMMARY_MAX_BYTES).
function byteCounter(input, id) {
  const out = el('output', { class: 'bx-dim bx3-hint bx3-bytes', id, 'aria-live': 'polite' });
  const paint = () => { const n = utf8Length(input.value); out.textContent = `${n} / ${SUMMARY_MAX_BYTES} bytes (UTF-8, on chain)${n > input.value.length ? ` · ${input.value.length} characters` : ''}`; out.classList.toggle('is-over', n > SUMMARY_MAX_BYTES); out.dataset.bytes = String(n); };
  input.addEventListener('input', paint); paint();
  return out;
}
const short = (h) => (h ? `${h.slice(0, 10)}…${h.slice(-6)}` : '');
// The submission document + its CID, as shown in both submit flows.
function docPanel(prefix, t) {
  const ok = t.check.ok;
  return [
    el('p', { class: 'bx3-cid ' + (ok ? 'is-ok' : 'is-err'), id: `${prefix}-cid`, 'data-cid': t.cid, 'data-hash': t.subHash, 'data-valid': String(ok) }, [
      el('strong', { text: 'IPFS CID ' }), el('code', { text: t.cid }), ` · submission_hash `, el('code', { text: short(t.subHash) }),
      ` · ${t.doc.schema}: ${ok ? 'schema valid' : 'schema errors: ' + t.check.errors.slice(0, 3).join('; ')}`]),
    el('pre', { class: 'bx3-preview bx3-template', id: `${prefix}-template`, tabindex: '0', 'aria-label': 'Submission document (terp-bounty-submission/v1)', text: JSON.stringify(t.doc, null, 2) }),
  ];
}

// ── submit work ─────────────────────────────────────────────────────────────
export function makeSubmit(root, M, store, ctx) {
  const d = dialog('bx-submit-dlg', 'Submit work');
  root.append(d);
  let opener = null;
  d.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  return function open(n, from) {
    opener = from;
    const onChain = store.canChain(n);
    const esc = escrowState(M);
    const url = el('input', { type: 'url', name: 'evidenceUrl', id: 'bx-s-url', required: true, placeholder: 'https://…', autocomplete: 'off' });
    const notes = el('textarea', { name: 'notes', id: 'bx-s-notes', rows: '4', required: true });
    const wallet = el('input', { type: 'text', name: 'wallet', id: 'bx-s-wallet', required: true, placeholder: 'terp1…', autocomplete: 'off', spellcheck: 'false', value: ctx.wallet() ? ctx.wallet().address : '' });
    const summary = el('textarea', { name: 'summary', id: 'bx-s-summary', rows: '2', placeholder: 'One paragraph: what you delivered' });
    const sCount = byteCounter(summary, 'bx-s-summary-count');
    const gate = el('div', { class: 'bx3-gate', id: 'bx-s-gate', 'aria-live': 'polite' });
    const docBox = el('div', { id: 'bx-s-doc' });
    const out = el('div', { class: 'bx3-result', id: 'bx-s-out', 'aria-live': 'polite' });
    const go = el('button', { type: 'submit', class: 'plane-link', id: 'bx-s-go', text: 'Save submission' });
    const sprev = el('pre', { class: 'bx3-preview', id: 'bx-s-preview', tabindex: '0', 'aria-label': 'On-chain submit message preview' });
    const shint = el('p', { class: 'bx-dim bx3-hint', id: 'bx-s-preview-hint' });
    let g = null;
    const fields = () => ({ evidence: url.value.trim() ? [url.value.trim()] : [], notes: notes.value.trim(), submitter: wallet.value.trim(),
      summary: summary.value.trim() || notes.value.trim().slice(0, 140), acceptance: (n.acceptance || []).map((c) => ({ criterion: c, met: true })) });
    const paintS = () => {
      try {
        const t = buildSubmit(ctx.wallet(), n, fields(), M, esc.chainId);
        sprev.textContent = JSON.stringify(t.preview, null, 2); sprev.dataset.hash = t.subHash; sprev.dataset.cid = t.cid;
        docBox.replaceChildren(...docPanel('bx-s', t));
        shint.textContent = (t.escrowBacked ? `Task #${n.onChain.id}’s escrow takes this from its assignee on ${t.chainId}.` : 'Nothing is signed now. Once this task has its own escrow and you are assigned, you send this submit.') +
          ` The CID is the content address of the ${t.doc.schema} document; its digest is the submission_hash, and the document travels inside the message.`;
      } catch (e) { sprev.textContent = 'Preview unavailable: ' + e.message; delete sprev.dataset.hash; shint.textContent = ''; }
    };
    const paintGate = async () => {
      try {
        g = await submitGate(ctx.wallet(), M);
        const nt = gateNote(g);
        gate.replaceChildren(why(nt.line, nt.why, { tone: nt.tone === 'ok' ? '' : nt.tone }));
        gate.dataset.gate = !g.known ? 'unknown' : g.eligible ? 'pass' : 'blocked';
        gate.className = 'bx3-gate ' + (!g.known ? '' : g.eligible ? 'is-ok' : 'is-warn');
      } catch (e) { gate.replaceChildren(why('Couldn’t check the staking rule.', e.message, { tone: 'err' })); gate.dataset.gate = 'unknown'; }
    };
    [url, notes, wallet, summary].forEach((i) => i.addEventListener('input', paintS));
    const form = el('form', { class: 'bx3-form', novalidate: true }, [
      el('p', { class: 'bx-meta', text: `${n.id} · ${n.title}` }),
      el('p', { class: 'bx-dim bx3-hint', id: 'bx-s-where', text: onChain ? 'Saved on this device. The submit message below is what this task’s escrow takes once you are assigned.' : 'Saved on this device. Post the evidence link in the bounties channel on Discord so reviewers see it.' }),
      field('bx-s-url', 'Evidence link', url, (n.evidence && n.evidence.length ? 'This bounty asks for: ' + n.evidence.slice(0, 2).join('; ') : 'A PR, a transaction, a doc…')),
      field('bx-s-notes', 'Notes', notes, 'What you did, and how it meets the acceptance criteria.'),
      field('bx-s-summary', 'Summary (optional; goes on chain for funded bounties)', summary), sCount,
      field('bx-s-wallet', 'Payout address', wallet, `A Terp address. Paid only after review; the amount is ${LABEL}.`),
      gate,
      el('div', { class: 'bx-actions' }, [go]), out,
      el('details', { class: 'bx3-field bx3-onchain', id: 'bx-s-onchain' }, [el('summary', { text: 'What gets signed later (preview)' }), docBox, sprev, shint]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = { evidenceUrl: url.value, notes: notes.value, wallet: wallet.value };
      const errs = validSubmission(v);
      const sp = summary.value.trim() ? summaryProblem(summary.value.trim()) : null; if (sp) errs.summary = sp;
      showErrs(form, errs);
      if (Object.keys(errs).length) return;
      if (g && g.known && !g.eligible) { const nt = gateNote(g); out.className = 'bx3-result'; out.replaceChildren(why(nt.line, nt.why, { tone: 'blocked' })); return; }
      go.disabled = true; out.className = 'bx3-result'; out.textContent = 'Sending…';
      try {
        let cid = null; try { cid = buildSubmit(ctx.wallet(), n, fields(), M, esc.chainId).cid; } catch { /* preview only */ }
        await store.submit(n, v, cid ? { cid } : {});
        out.className = 'bx3-result is-ok';
        out.textContent = `Saved on this device. It shows as “submission pending” on the card.`;
        ctx.afterSubmit(n.id);
      } catch (err) { out.className = 'bx3-result'; out.replaceChildren(why(shortLine(err.message, 'It didn’t go through.'), err.message, { tone: 'err' })); }
      go.disabled = false;
    });
    d.querySelector('form')?.remove();
    d.append(form);
    paintS(); paintGate();
    d.showModal();
    url.focus();
  };
}

// ── reward assets: any native denom ──────────────────────────────────────────
// TERP and THIOL are priced from the tier x priority model (data.js pricer); any other denom has no price
// feed, so the proposer sets the amount. The list: site config + LCD metadata/supply + the wallet's balances.
const PRICED = { uterp: 'TERP', uthiol: 'THIOL' };
let denomCache = null;
async function rewardAssets(address) {
  const key = address || '';
  if (denomCache && denomCache.key === key) return denomCache.val;
  let rest = '', known = [{ denom: 'uterp', symbol: 'TERP', exponent: 6 }, { denom: 'uthiol', symbol: 'THIOL', exponent: 6 }];
  try {
    const { getChainConfig } = await import('/lib/config.js?v=a177cb9062');
    const ch = await getChainConfig(siteChainId());
    rest = ch.rest || '';
    const dn = ch.denom || {};
    if (dn.stake) known = [{ denom: dn.stake, symbol: dn.stakeDisplay || 'TERP', exponent: dn.decimals ?? 6 }, { denom: dn.fee || 'uthiol', symbol: dn.feeDisplay || 'THIOL', exponent: dn.decimals ?? 6 }];
  } catch { /* config.json missing: the two known denoms only */ }
  const val = await loadDenoms({ rest, address, known }).catch(() => ({ list: known.map((k) => ({ ...k, kind: 'native', sources: new Set(['config']), assumed: false, name: k.symbol })), byDenom: new Map(), loaded: {} }));
  if (!val.byDenom.size) val.list.forEach((a) => val.byDenom.set(a.denom, a));
  denomCache = { key, val };
  return val;
}

// ── create bounty ───────────────────────────────────────────────────────────
export function makeCreate(root, M, store, pricing, ctx) {
  const d = dialog('bx-create-dlg', 'Propose a bounty');
  root.append(d);
  const escrowDlg = makeEscrow(root, M, store, ctx);
  wireEscrowCards(root, M, store, escrowDlg);
  let opener = null, rec = null;
  d.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  const skillsByCat = {};
  for (const c of CATEGORIES) {
    const cnt = {};
    M.all.filter((n) => catOf(n) === c).forEach((n) => n.skills.forEach((s) => { cnt[s] = (cnt[s] || 0) + 1; }));
    skillsByCat[c.key] = Object.entries(cnt).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map((x) => x[0]);
  }
  return function open(from) {
    opener = from; rec = null;
    const esc = escrowState(M);
    const contract = esc.board;
    const tl = timeline({ id: 'bx-c-tl' });
    const title = el('input', { type: 'text', name: 'title', id: 'bx-c-title', required: true, maxlength: '140' });
    const summary = el('textarea', { name: 'summary', id: 'bx-c-summary', rows: '3', required: true, placeholder: 'One paragraph, at most 280 bytes: stored on chain' });
    const sumCount = byteCounter(summary, 'bx-c-summary-count');
    const desc = el('textarea', { name: 'description', id: 'bx-c-desc', rows: '3', placeholder: 'Optional long form, kept in the details document' });
    const detInfo = el('p', { class: 'bx-dim bx3-hint bx3-cid', id: 'bx-c-details' });
    const cat = el('select', { name: 'category', id: 'bx-c-cat', required: true }, [el('option', { value: '', text: 'Choose…' }), ...CATEGORIES.map((c) => el('option', { value: c.key, text: c.name }))]);
    const caps = el('div', { class: 'bx3-caps', id: 'bx-c-caps', role: 'group', 'aria-label': 'Capability tags' });
    const capsMore = el('input', { type: 'text', name: 'capsMore', id: 'bx-c-capsmore', placeholder: 'more, comma separated', autocomplete: 'off' });
    const tier = el('select', { name: 'tier', id: 'bx-c-tier', required: true }, M.meta.tiers.map((t) => el('option', { value: t.key, text: `${t.key} ${t.name}: ${t.typical}` })));
    const pri = el('select', { name: 'priority', id: 'bx-c-pri', required: true }, M.meta.priorities.map((p) => el('option', { value: p.key, text: `${p.key} ${p.name}` })));
    const ac = el('textarea', { name: 'acceptance', id: 'bx-c-ac', rows: '3', required: true, placeholder: 'One criterion per line' });
    const ev = el('textarea', { name: 'evidence', id: 'bx-c-ev', rows: '2', required: true, placeholder: 'One item per line (PR link, tx hash, report…)' });
    const asset = el('select', { name: 'asset', id: 'bx-c-asset', required: true }, [el('option', { value: 'uterp', text: 'TERP' }), el('option', { value: 'uthiol', text: 'THIOL' })]);
    const amt = el('input', { type: 'text', name: 'amount', id: 'bx-c-amt', inputmode: 'decimal', autocomplete: 'off', placeholder: '0' });
    const amtWrap = field('bx-c-amt', 'Reward amount', amt, '');
    amtWrap.hidden = true;
    const tomorrow = new Date(Date.now() + 864e5).toISOString().slice(0, 10);
    const lastDay = new Date(Date.now() + ((PARAMS.max_duration_secs || 7776000) - 86400) * 1000).toISOString().slice(0, 10);
    const deadline = el('input', { type: 'date', name: 'deadline', id: 'bx-c-deadline', required: true, min: tomorrow, max: lastDay });
    const capWarn = el('div', { class: 'bx3-capwarn', id: 'bx-c-capwarn', 'aria-live': 'polite' });
    const amount = el('output', { class: 'bx3-amount', id: 'bx-c-amount', 'aria-live': 'polite' });
    const formula = el('p', { class: 'bx-dim bx3-hint', id: 'bx-c-formula' });
    const wInfo = el('div', { class: 'bx3-winfo', id: 'bx-c-winfo', 'aria-live': 'polite' });
    const connect = el('button', { type: 'button', class: 'plane-link secondary', id: 'bx-c-connect', text: 'Connect a wallet' });
    const preview = el('pre', { class: 'bx3-preview', id: 'bx-c-preview', tabindex: '0', 'aria-label': 'Message preview' });
    const status = el('div', { class: 'bx3-result', id: 'bx-c-status', 'aria-live': 'polite' });
    const save = el('button', { type: 'submit', class: 'plane-link', id: 'bx-c-save', text: 'Save draft' });
    const sign = el('button', { type: 'button', class: 'plane-link', id: 'bx-c-sign', disabled: true, text: 'Propose to the DAO' });
    const dl = el('button', { type: 'button', class: 'plane-link secondary', id: 'bx-c-dl', hidden: true, text: 'Download details (.json)' });
    const signWhy = el('div', { id: 'bx-c-signwhy', 'aria-live': 'polite' });
    const imported = el('div', { class: 'bx3-imported', id: 'bx-c-imported', hidden: true, 'aria-live': 'polite' });
    const impText = el('textarea', { name: 'importJson', id: 'bx-c-import', rows: '14', spellcheck: 'false', autocomplete: 'off', class: 'bx3-code', placeholder: '{\n  "schema": "terp-bounty-details/v1",\n  "title": "…",\n  …\n}' });
    const impFile = el('input', { type: 'file', name: 'importFile', id: 'bx-c-import-file', accept: '.json,application/json' });
    const impGo = el('button', { type: 'button', class: 'plane-link', id: 'bx-c-import-go', text: 'Validate and fill the form' });
    const impTpl = el('button', { type: 'button', class: 'plane-link secondary', id: 'bx-c-import-tpl', text: 'Insert a template' });
    const impErrs = el('ul', { class: 'bx3-import-errs', id: 'bx-c-import-errs', 'aria-live': 'polite' });
    const impMsg = el('p', { class: 'bx3-result', id: 'bx-c-import-status', 'aria-live': 'polite' });
    const tab = (m, label) => el('button', { type: 'button', role: 'tab', class: 'bx3-tab', id: `bx-c-mode-${m}`, 'data-mode': m, 'aria-controls': `bx-c-pane-${m}`, text: label });
    const tabs = el('div', { class: 'bx3-tabs', role: 'tablist', 'aria-label': 'How to propose' }, [tab('form', 'Form'), tab('import', 'Import JSON')]);
    const impPane = el('div', { class: 'bx3-field bx3-import', id: 'bx-c-pane-import', role: 'tabpanel', 'aria-labelledby': 'bx-c-mode-import' }, [
      el('p', { class: 'bx-dim bx3-hint', text: `Paste a ${Schemas.SCHEMA_IDS.details} document or pick a .json file (max ${Schemas.DOC_MAX_BYTES / 1024} KiB). A valid one fills the form for review.` }),
      el('label', { for: 'bx-c-import', class: 'bx3-lbl', text: 'Details JSON' }), impText,
      el('div', { class: 'bx3-row' }, [el('label', { for: 'bx-c-import-file', class: 'bx3-lbl', text: 'or a file' }), impFile]),
      el('div', { class: 'bx-actions' }, [impGo, impTpl]), impMsg, impErrs]);
    const FIELD_OF = { title: ['title', 'Title'], summary: ['summary', 'Summary'], description: ['description', 'Full description'], category: ['category', 'Category'], capabilities: ['capsMore', 'Capability tags'],
      tier: ['tier', 'Tier'], priority: ['priority', 'Priority'], acceptance_criteria: ['acceptance', 'Acceptance criteria'], evidence_required: ['evidence', 'Evidence required'], deadline: ['deadline', 'Deadline'],
      reward_quote: ['asset', 'Reward quote'], schema: [null, 'Schema version'], bounty_ref: [null, 'bounty_ref'], proposer: [null, 'proposer'], created_at: [null, 'created_at'] };
    const fieldOf = (path) => FIELD_OF[(path || '/').split('/')[1]] || [null, 'Document'];


    const paintCaps = () => {
      const keep = new Set([...caps.querySelectorAll('input:checked')].map((i) => i.value));
      caps.replaceChildren(...(skillsByCat[cat.value] || []).map((s) => el('label', { class: 'bx3-cap' }, [el('input', { type: 'checkbox', name: 'cap', value: s, checked: keep.has(s) }), ' ' + s])));
      if (!cat.value) caps.append(el('span', { class: 'bx-dim', text: 'Choose a category to see its capability tags.' }));
    };
    // reward token list: TERP and THIOL at once, then every denom the chain and the wallet know
    let A = { list: [], byDenom: new Map() };
    const info = (denom) => A.byDenom.get(denom) || (PRICED[denom] ? { denom, symbol: PRICED[denom], exponent: 6, kind: 'native', assumed: false, sources: new Set(['config']) } : { denom, symbol: denom, exponent: 0, kind: kindOf(denom), assumed: true, sources: new Set() });
    async function fillAssets() {
      const w = ctx.wallet();
      A = await rewardAssets(w && w.address);
      const keepV = asset.value;
      const opt = (a) => el('option', { value: a.denom, text: labelOf(a) + (a.balance ? ` · ${fmtUnits(a.balance, a.exponent)} in wallet` : ''), title: a.denom });
      const groups = [
        ['In your wallet', A.list.filter((a) => a.balance)],
        ['Terp', A.list.filter((a) => !a.balance && a.kind === 'native')],
        ['IBC tokens', A.list.filter((a) => !a.balance && a.kind === 'ibc')],
        ['Tokenfactory tokens', A.list.filter((a) => !a.balance && a.kind === 'factory')],
      ].filter(([, l]) => l.length);
      asset.replaceChildren(...groups.map(([label, l]) => el('optgroup', { label }, l.map(opt))));
      asset.value = A.byDenom.has(keepV) ? keepV : 'uterp';
      d.dataset.assets = String(A.list.length);
      paintAmount();
    }
    const fmtUnits = (base, exp) => fmt(Number(fromBase(base, exp)), Math.min(exp, 4));
    const quote = () => {
      const a = info(asset.value);
      const sym = PRICED[a.denom] || labelOf(a);
      if (PRICED[a.denom]) {
        const q = pricing.quote(tier.value, pri.value, PRICED[a.denom]);
        return q && { ...q, asset: PRICED[a.denom], exponent: 6, priced: true };
      }
      const ref = pricing.quote(tier.value, pri.value, 'TERP');
      let micro = null, err = '';
      try { micro = amt.value.trim() ? toBase(amt.value, a.exponent) : null; } catch (e) { err = e.message; }
      return { asset: a.symbol, label: sym, denom: a.denom, exponent: a.exponent, priced: false, wu: ref ? ref.wu : null, micro, amount: micro ? Number(fromBase(micro, a.exponent)) : 0, err, label2: LABEL };
    };
    const paintAmount = () => {
      const q = quote();
      const a = info(asset.value);
      const sym = PRICED[a.denom] || labelOf(a);
      amtWrap.hidden = !!(q && q.priced);
      amount.hidden = !(q && (q.priced || q.micro));
      if (q && q.priced) {
        amount.replaceChildren(el('span', { class: 'bx3-badge bx3-badge--reward', 'data-denom': q.denom }, [el('span', { class: 'bx3-badge__amt', text: `≈ ${fmt(Math.floor(Number(q.micro) / 1e4) / 100, 2)}` }), ' ' + q.asset]), ' ', el('span', { class: 'bx-pending', text: LABEL }));
        formula.textContent = `${q.base} base work units × ${q.tierMultiplier} (${tier.value}) × ${q.priorityMultiplier} (${pri.value}) × ${q.budgetScale} budget scale = ${fmt(q.wu, 4)} work units; 1 ${q.asset} = $${q.price} (Prop 61 baseline), so ${fmt(q.rate, 4)} ${q.asset} per work unit. Params ${pricing.paramsVersion}; placeholders, ${LABEL}.`;
      } else {
        const hint = amtWrap.querySelector('.bx3-hint') || amtWrap.insertBefore(el('p', { class: 'bx-dim bx3-hint', id: 'bx-c-amt-hint' }), amtWrap.querySelector('.bx3-err'));
        hint.textContent = `No price feed for ${sym}, so you set the amount${a.exponent ? ` (up to ${a.exponent} decimals${a.assumed ? ', assumed from its name' : ''})` : ' in its base units'}.${a.balance ? ` You hold ${fmtUnits(a.balance, a.exponent)}.` : ''}`;
        formula.textContent = q && q.wu != null ? `For scale: ${tier.value} × ${pri.value} is ${fmt(q.wu, 2)} work units in the TERP/THIOL pricing model. Amounts are ${LABEL}.` : '';
        amt.setAttribute('aria-describedby', 'bx-c-amt-hint');
        if (q && q.micro) amount.replaceChildren(el('span', { class: 'bx3-badge bx3-badge--reward', 'data-denom': a.denom }, [el('span', { class: 'bx3-badge__amt', text: fmtUnits(q.micro, a.exponent) }), ' ' + sym]),
          ' ', el('span', { class: 'bx-dim', text: `= ${q.micro} base units` }), ' ', el('span', { class: 'bx-pending', text: LABEL }));
        else amount.replaceChildren();
      }
      paintCap(q, a, sym);
      if (rec) paintPreview();
    };
    function paintCap(q, a, sym) {
      capWarn.replaceChildren();
      if (!PARAMS.loaded) { capWarn.append(why('The escrow rules didn’t load, so the reward can’t be checked.', 'public/data/bounties.escrow-params.json was not readable.', { tone: 'err' })); return; }
      const rule = denomRule(a.denom);
      if (q && q.micro) {
        const p = capProblem({ denom: a.denom, amount: q.micro }, a.exponent, sym);
        if (p) { capWarn.append(why(p, `Per-bounty range from the escrow’s governance parameters (${paramsTag()}).`, { tone: 'blocked' })); capWarn.dataset.cap = 'out'; return; }
      }
      capWarn.dataset.cap = rule.listed ? 'listed' : 'unlisted';
      if (rule.listed) capWarn.append(el('p', { class: 'bx-dim bx3-hint', id: 'bx-c-capinfo', text: `The escrow takes up to ${fmt(Number(fromBase(rule.max, a.exponent)), 0)} ${sym} per bounty (placeholder, pending a vote).` }));
      else capWarn.append(why(`${sym} needs a governance vote before the escrow can hold it.`, `The escrow only accepts tokens on its list, each with a per-bounty min and max. Adding ${a.denom} takes an update_config with a new params_version (${paramsTag()}). You can still draft the proposal.`, { tone: 'blocked', id: 'bx-c-capinfo' }));
    }
    const data = () => ({
      title: title.value.trim(), summary: summary.value.trim(), description: desc.value.trim(), category: cat.value, capabilities: [...new Set([...[...caps.querySelectorAll('input:checked')].map((i) => i.value), ...capsMore.value.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean)])],
      tier: tier.value, priority: pri.value, acceptance: ac.value.split('\n').map((s) => s.trim()).filter(Boolean), evidence: ev.value.split('\n').map((s) => s.trim()).filter(Boolean),
      deadline: deadline.value, quote: quote(), paramsVersion: pricing.paramsVersion, pricedAt: pricing.height,
    });
    const validate = (v) => {
      const e = {};
      if (v.title.length < 8) e.title = 'A plain title, 8+ characters.';
      const sp = summaryProblem(v.summary); if (sp) e.summary = sp.replace('control characters', 'line breaks or control characters') + '.';
      if (!v.category) e.category = 'Pick one of the nine categories.';
      if (!v.acceptance.length) e.acceptance = 'At least one acceptance criterion.';
      if (!v.evidence.length) e.evidence = 'What a submission must include.';
      if (!v.deadline || v.deadline < tomorrow || v.deadline > lastDay) e.deadline = `Between tomorrow and ${lastDay}.`;
      const q = v.quote;
      if (!q) e.tier = 'No amount for this tier and priority.';
      else if (!q.priced && !q.micro) e.amount = q.err || 'Enter the reward amount.';
      else if (q.micro && PARAMS.loaded) { const a = info(q.denom); const p = denomRule(q.denom).listed ? capProblem({ denom: q.denom, amount: q.micro }, a.exponent, PRICED[q.denom] || labelOf(a)) : null; if (p) e[q.priced ? 'asset' : 'amount'] = p; }
      return e;
    };
    function paintPreview() {
      const w = ctx.wallet();
      if (!rec.data.quote || !rec.data.quote.micro) return;
      const tx = buildCreate(w ? { ...w, chainId: esc.chainId } : { address: '(your wallet address)', chainId: esc.chainId }, { ...rec.data, ref: rec.id }, contract, { route: 'propose' });
      preview.textContent = JSON.stringify(tx.preview, null, 2);
      rec.tx = tx; rec.detailsHash = tx.detailsHash; rec.detailsCid = tx.detailsCid;
      detInfo.dataset.hash = tx.detailsHash; detInfo.dataset.cid = tx.detailsCid; detInfo.dataset.valid = String(tx.check.ok);
      detInfo.textContent = `Details document (${tx.details.schema}, ${tx.check.ok ? 'valid' : 'problems: ' + tx.check.errors.join('; ')}, ${tx.bytes.length} bytes): fingerprint ${tx.detailsHash.slice(0, 16)}…, CID ${tx.detailsCid}. It rides inside the proposal, so the chain itself keeps it; the bucket keeps a copy under its CID.`;
      dl.hidden = false;
    }
    function paintState() {
      tl.set(rec ? rec.state : '');
      d.dataset.state = rec ? rec.state : '';
      const w = ctx.wallet();
      const listed = rec && rec.data.quote && PARAMS.loaded && denomRule(rec.data.quote.denom).listed;
      sign.disabled = !esc.signing || !rec || rec.state !== 'draft' || !w || !listed;
      signWhy.replaceChildren();
      if (!esc.signing) signWhy.append(why(esc.line, esc.why, { tone: 'blocked', id: 'bx-c-escrow-why' }));
      else if (!w) signWhy.append(why('Connect a wallet to send the proposal.', 'Drafting needs no wallet. Proposing is a transaction you sign in your wallet.', { tone: '' }));
      else if (rec && !listed) signWhy.append(why('This token isn’t on the board’s list yet.', 'A governance vote adds tokens to the board (update_config denoms).', { tone: 'blocked' }));
      else if (!rec) signWhy.append(why('Save the draft first.', '', { tone: '' }));
    }
    async function paintWallet() {
      const w = ctx.wallet() || await currentWallet(esc.chainId);
      if (w && !ctx.wallet()) ctx.setWallet(w);
      wInfo.replaceChildren(w
        ? el('p', { class: 'bx3-hint', text: `Connected: ${w.address.slice(0, 12)}…${w.address.slice(-4)}${w.name && w.name !== 'Connected account' ? ` (${w.name})` : ''}.` })
        : why('Connect a wallet to fund it. Drafting needs none.', 'The reward is locked by a transaction you sign. Writing, saving and sharing a proposal need no wallet.', { tone: '' }));
      connect.hidden = !!w;
      wInfo.className = 'bx3-winfo' + (w ? ' is-ok' : '');
      if (rec) { paintPreview(); }
      paintState();
    }
    // Connect: the site's Connect panel. The dialog steps aside (it is modal) and comes back with the form intact.
    connect.addEventListener('click', () => {
      const btn = document.getElementById('tn-wallet-btn');
      d.close();
      const back = () => { if (!d.isConnected) return; if (!d.open) d.showModal(); denomCache = null; fillAssets(); paintWallet(); };
      const wm = () => document.getElementById('tn-wallet-modal');
      const watch = () => {
        const r = wm(); if (!r) return setTimeout(watch, 100);
        const mo = new MutationObserver(() => { if (!r.classList.contains('open')) { mo.disconnect(); back(); } });
        mo.observe(r, { attributes: true, attributeFilter: ['class'] });
      };
      if (btn) btn.click(); else import('/lib/wallet-modal.js?v=9775160f4f').then((m) => m.openWalletModal({ config: window.__TERP_CONFIG || {} })).catch(back);
      setTimeout(watch, 50);
    });
    dl.addEventListener('click', () => {
      if (!rec || !rec.tx) return;
      const blob = new Blob([JSON.stringify(rec.tx.details, null, 2)], { type: 'application/json' });
      // bounty3: there is no upload path; the draft only leaves as a local download. Upload gaps (S3, stake gate,
      // decision-model middleware, quarantine): see the DEV NOTES block at the end of lib/bounties/howto.js.
      const a = el('a', { href: URL.createObjectURL(blob), download: `${rec.id}.terp-bounty-details.json` });
      document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    });
    [tier, pri].forEach((s) => s.addEventListener('change', paintAmount));
    asset.addEventListener('change', () => { amt.value = ''; paintAmount(); });
    amt.addEventListener('input', paintAmount);
    cat.addEventListener('change', paintCaps);
    const form = el('form', { class: 'bx3-form bx3-create', novalidate: true }, [
      tl.node,
      tabs, impPane, imported,
      el('div', { class: 'bx3-grid', id: 'bx-c-pane-form', role: 'tabpanel', 'aria-labelledby': 'bx-c-mode-form' }, [
        el('div', {}, [
          field('bx-c-title', 'Title', title, 'Plain verb first: "Write…", "Ship…", "Audit…".'),
          field('bx-c-summary', 'Summary (on chain)', summary), sumCount,
          field('bx-c-desc', 'Full description (optional)', desc),
          field('bx-c-cat', 'Category', cat),
          el('div', { class: 'bx3-field' }, [el('span', { class: 'bx3-lbl', text: 'Capability tags' }), caps, capsMore]),
          el('div', { class: 'bx3-row' }, [field('bx-c-tier', 'Tier', tier), field('bx-c-pri', 'Priority', pri)]),
          field('bx-c-ac', 'Acceptance criteria', ac),
          field('bx-c-ev', 'Evidence required', ev),
        ]),
        el('div', {}, [
          el('div', { class: 'bx3-row' }, [field('bx-c-asset', 'Reward token', asset, 'Any token on Terp: TERP, THIOL, IBC or tokenfactory.'), field('bx-c-deadline', 'Deadline', deadline)]),
          amtWrap,
          el('div', { class: 'bx3-field' }, [el('span', { class: 'bx3-lbl', text: 'Reward' }), amount, formula, capWarn]),
          el('div', { class: 'bx3-field' }, [el('span', { class: 'bx3-lbl', text: 'Your wallet' }), wInfo, el('div', { class: 'bx-actions' }, [connect])]),
          el('details', { class: 'bx3-field bx3-onchain', id: 'bx-c-onchain' }, [el('summary', { text: 'What you would sign (preview)' }), preview, detInfo]),
        ]),
      ]),
      el('div', { class: 'bx-actions', id: 'bx-c-actions' }, [save, sign, dl]), signWhy, status,
    ]);
    function setMode(m) {
      d.dataset.mode = m;
      tabs.querySelectorAll('[role="tab"]').forEach((t) => { const on = t.dataset.mode === m; t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1; t.classList.toggle('is-on', on); });
      impPane.hidden = m !== 'import'; form.querySelector('#bx-c-pane-form').hidden = m !== 'form'; form.querySelector('#bx-c-actions').hidden = m !== 'form'; signWhy.hidden = m !== 'form';
      if (m === 'import') impText.focus();
    }
    tabs.addEventListener('click', (e) => { const t = e.target.closest('[role="tab"]'); if (t) setMode(t.dataset.mode); });
    tabs.addEventListener('keydown', (e) => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { const m = d.dataset.mode === 'form' ? 'import' : 'form'; setMode(m); tabs.querySelector(`[data-mode="${m}"]`).focus(); } });
    const setVal = (i, v) => { i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
    function prefill(doc) {
      const notes = [];
      setVal(title, doc.title); setVal(summary, doc.summary); setVal(desc, doc.description || '');
      cat.value = doc.category; paintCaps();
      const extra = [];
      for (const c of doc.capabilities || []) { const i = caps.querySelector(`input[value="${CSS.escape(c)}"]`); if (i) i.checked = true; else extra.push(c); }
      capsMore.value = extra.join(', ');
      for (const [s, v, what] of [[tier, doc.tier, 'tier'], [pri, doc.priority, 'priority']]) { s.value = v; if (s.value !== v) notes.push(`${what} ${v} is not offered here; using ${s.value}`); }
      setVal(ac, doc.acceptance_criteria.join('\n')); setVal(ev, doc.evidence_required.join('\n'));
      const rq = doc.reward_quote;
      if (![...asset.options].some((o) => o.value === rq.denom)) asset.append(el('option', { value: rq.denom, text: rq.asset || rq.denom }));
      asset.value = rq.denom;
      deadline.value = doc.deadline;
      if (doc.deadline < tomorrow || doc.deadline > lastDay) notes.push(`deadline ${doc.deadline} is outside the escrow window (tomorrow to ${lastDay}); change it before saving`);
      if (!PRICED[rq.denom]) { const a = info(rq.denom); amt.value = fromBase(rq.amount, a.exponent); }
      paintAmount();
      const q = quote();
      if (q && q.priced && rq.amount !== q.micro) notes.push(`the reward in the file (${fromMicro(rq.amount)} ${rq.asset}) is replaced by the computed quote ${fromMicro(q.micro)} ${q.asset}; rewards stay ${LABEL}`);
      return notes;
    }
    function runImport() {
      const r = Schemas.importDetails(impText.value);
      impErrs.replaceChildren(); d.dataset.import = r.ok ? 'valid' : 'invalid';
      if (!r.ok) {
        impMsg.className = 'bx3-result is-err';
        impMsg.textContent = r.version && r.version.status !== 'current' ? `Not imported: ${r.version.message}` : `Not imported: ${r.fields.length} problem${r.fields.length === 1 ? '' : 's'}. Fix the JSON and try again; the form was not changed.`;
        impErrs.replaceChildren(...r.fields.map((f) => el('li', { 'data-path': f.path, 'data-field': fieldOf(f.path)[0] || '' }, [el('strong', { text: fieldOf(f.path)[1] }), ' ', el('code', { text: f.path }), ': ' + f.message])));
        impText.setAttribute('aria-invalid', 'true'); impText.setAttribute('aria-describedby', 'bx-c-import-errs');
        return r;
      }
      impText.removeAttribute('aria-invalid');
      const notes = [...r.notes, ...prefill(r.doc)];
      rec = null; paintState(); preview.textContent = 'Save the draft to see the message.';
      imported.hidden = false;
      imported.replaceChildren(el('p', { class: 'bx3-result is-ok', text: `Imported a valid ${Schemas.SCHEMA_IDS.details} document (${r.size} bytes). Review it, then Save draft.` }), el('ul', { class: 'bx-dim bx3-hint' }, notes.map((n) => el('li', { text: n }))));
      impMsg.className = 'bx3-result is-ok'; impMsg.textContent = 'Valid: the form is filled in.';
      setMode('form'); title.focus();
      return r;
    }
    impGo.addEventListener('click', runImport);
    impTpl.addEventListener('click', () => { impText.value = JSON.stringify(Schemas.detailsTemplate({ title: '', summary: '' }), null, 2); impText.focus(); });
    impFile.addEventListener('change', async () => {
      const f = impFile.files && impFile.files[0]; if (!f) return;
      if (!(f.type === 'application/json' || /\.json$/i.test(f.name))) { impErrs.replaceChildren(el('li', { 'data-path': '/' }, [el('strong', { text: 'File' }), `: ${f.name} is ${f.type || 'not JSON'}; only .json files are accepted`])); impMsg.className = 'bx3-result is-err'; impMsg.textContent = 'Not imported.'; d.dataset.import = 'invalid'; return; }
      if (f.size > Schemas.DOC_MAX_BYTES) { impErrs.replaceChildren(el('li', { 'data-path': '/' }, [el('strong', { text: 'File' }), `: ${f.size} bytes, max ${Schemas.DOC_MAX_BYTES}`])); impMsg.className = 'bx3-result is-err'; impMsg.textContent = 'Not imported.'; d.dataset.import = 'invalid'; return; }
      impText.value = await f.text(); runImport();
    });
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = data(), errs = validate(v);
      showErrs(form, errs);
      if (Object.keys(errs).length) return;
      const id = rec ? rec.id : 'NEW-' + Date.now().toString(36).toUpperCase();
      rec = { id, state: 'draft', data: v };
      paintPreview();
      store.saveCreated(toBounty(rec));
      status.className = 'bx3-result is-ok';
      status.textContent = esc.live ? `Draft ${id} saved on this device. Next: the DAO vote (the message is below).` : `Draft ${id} saved on this device. Download the details to share it.`;
      paintState();
    });
    sign.addEventListener('click', () => {
      // chain1: nothing is signed from this page yet (escrowState: board not live, or signing not switched on)
      status.className = 'bx3-result'; status.replaceChildren(why(esc.line, esc.why, { tone: 'blocked' }));
    });
    function toBounty(r) {
      const v = r.data;
      return { id: r.id, title: v.title, cat: v.category, capabilities: v.capabilities, tier: v.tier, priority: v.priority, horizon: HORIZON_OF[v.priority], acceptance: v.acceptance, evidence: v.evidence, deadline: v.deadline,
        quote: v.quote, state: r.state, txhash: null, chainId: esc.chainId, escrow: null, detailsHash: r.detailsHash || null, detailsCid: r.detailsCid || null,
        via: LOCAL, skills: v.capabilities, summary: v.summary || '' };
    }
    d.querySelector('form')?.remove();
    d.append(form);
    paintCaps(); paintAmount(); paintWallet(); setMode('form'); delete d.dataset.import;
    fillAssets();
    preview.textContent = 'Save the draft to see the message.';
    d.showModal();
    title.focus();
  };
}

// ── task on chain: board task + its escrow, read from the LCD; every next step as a built message ─────────
// Board mode only. Status, amounts, applicants and submissions come straight from the contracts (no indexer):
// board `task`, `applications`, `submissions`; escrow `state`. Documents are fetched by CID and verified.
const NEXT = {
  proposed: [['vote', 'Vote (DAO members, in the DAO app)']],
  approved: [['fund', 'Fund this task']],
  funding: [['fund', 'Add funds']],
  open: [['apply', 'Apply'], ['fund', 'Add funds']],
  assigned: [['submit', 'Submit work (assignee)']],
  submitted: [['approve', 'Approve and pay (reviewer)'], ['approve_dao', 'Approve and pay through a DAO vote']],
  accepted: [['approve', 'Pay out (reviewer)']],
};
export function makeEscrow(root, M, store, ctx) {
  const d = dialog('bx-escrow-dlg', 'On chain');
  root.append(d);
  let opener = null;
  d.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  return async function open(n, from) {
    opener = from;
    d.querySelector('.bx3-form')?.remove();
    const esc = escrowState(M), oc = n.onChain || {};
    const out = el('div', { class: 'bx3-result', id: 'bx-e-status', 'aria-live': 'polite' });
    const info = el('dl', { class: 'bx3-escrow', id: 'bx-e-info' });
    const acts = el('div', { class: 'bx-actions', id: 'bx-e-actions' });
    const pre = el('pre', { class: 'bx3-preview', id: 'bx-e-preview', tabindex: '0', 'aria-label': 'Message preview', hidden: true });
    const form = el('form', { class: 'bx3-form', novalidate: true }, [
      el('p', { class: 'bx-meta', text: `${n.id} · ${n.title}` }),
      el('p', { class: 'bx-dim bx3-hint', id: 'bx-e-where', text: `Task #${oc.id} on the bounty board (${esc.board ? esc.board.slice(0, 14) + '…' : 'not live'}). Its reward sits in its own escrow contract; payout is never automatic.` }),
      info, acts, pre, out,
    ]);
    form.addEventListener('submit', (e) => e.preventDefault());
    d.append(form);
    d.showModal();
    out.textContent = 'Reading the board and this task’s escrow…';
    try {
      const t = await M.client.smart(M.board.contract, Q.task(oc.id), { fresh: true });
      const e = escrowOf({ ...n, onChain: { ...oc, escrow: t.escrow } }, M);
      const st = e.exists ? await M.client.smart(e.address, Q.escrowState(), { fresh: true }) : null;
      const [apps, subs] = await Promise.all([M.client.smart(M.board.contract, Q.applications(oc.id)), M.client.smart(M.board.contract, Q.submissions(oc.id))]);
      let doc = 'not checked';
      try { const r = await fetchDoc(t.details_cid, { gateways: M.board.cidGateway }); doc = `✓ ${t.details_cid.slice(0, 14)}… fetched and matches its CID (${r.via === 'cache' ? 'cached' : new URL(r.via).host})`; }
      catch (x) { doc = `✗ ${x.message}`; }
      d.dataset.status = t.status;
      info.replaceChildren(...[['Status', `${t.status} (${BADGE_OF[t.status] || '?'})`], ['Reward', `${t.reward.amount} ${t.reward.denom}`], ['Escrow', e.exists ? e.address : e.predicted ? `${e.address} (not created yet; instantiate2 address)` : '—'],
        ['Held by the escrow', st ? (st.balance || []).map((c) => `${c.amount} ${c.denom}`).join(', ') || '0' : '—'], ['Creator', t.creator], ['Assignee', t.assignee || '—'],
        ['Applications', String((apps.applications || []).length)], ['Submissions', (subs.submissions || []).map((x) => `#${x.seq} ${x.cid.slice(0, 14)}…`).join(' | ') || '—'], ['Details document', doc]]
        .flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { 'data-k': k, text: String(v) })]));
      const w = ctx.wallet();
      const show = (b) => { pre.hidden = false; pre.textContent = JSON.stringify(b.preview, null, 2); out.replaceChildren(why(esc.line, esc.why, { tone: 'blocked' })); };
      acts.replaceChildren(...(NEXT[t.status] || []).map(([a, label]) => {
        const x = el('button', { type: 'button', class: 'plane-link' + (a === 'approve_dao' ? ' secondary' : ''), 'data-act': a, text: label });
        x.addEventListener('click', () => {
          const lastSeq = (subs.submissions || []).slice(-1)[0];
          if (a === 'fund') show(buildFund(w, { ...n, onChain: { ...oc, escrow: t.escrow } }, [t.reward], M));
          else if (a === 'apply') ctx.openApply(n, x);
          else if (a === 'approve' || a === 'approve_dao') show(buildApprove(w, { ...n, onChain: { ...oc, escrow: t.escrow } }, lastSeq ? lastSeq.seq : 1, M, { viaDao: a === 'approve_dao' }));
          else if (a === 'submit') { d.close(); ctx.openSubmit(n, from); }
          else out.replaceChildren(why('Voting happens in the DAO app.', `Proposal #${t.proposal_id} on the DAO’s bounty proposal module. When it passes, the DAO runs launch for this task.`, { tone: '' }));
        });
        return x;
      }));
      out.textContent = '';
    } catch (x) { out.replaceChildren(why('Couldn’t read this task right now.', x.message, { tone: 'err' })); }
  };
}

// ── apply: a terp-bounty-application/v1 document + board apply{task_id, cid} ──────────────────────────────────
export function makeApply(root, M, store, ctx) {
  const d = dialog('bx-apply-dlg', 'Apply for this task');
  root.append(d);
  let opener = null;
  d.addEventListener('close', () => opener?.focus({ preventScroll: true }));
  return function open(n, from) {
    opener = from;
    const esc = escrowState(M);
    const pitch = el('textarea', { name: 'pitch', id: 'bx-a-pitch', rows: '3', required: true, placeholder: 'Why you, and how you would do it' });
    const links = el('textarea', { name: 'links', id: 'bx-a-links', rows: '2', placeholder: 'https://github.com/you (one link per line)' });
    const wallet = el('input', { type: 'text', name: 'wallet', id: 'bx-a-wallet', required: true, placeholder: 'terp1…', autocomplete: 'off', spellcheck: 'false', value: ctx.wallet() ? ctx.wallet().address : '' });
    const prev = el('pre', { class: 'bx3-preview', id: 'bx-a-preview', tabindex: '0', 'aria-label': 'Apply message preview' });
    const cidP = el('p', { class: 'bx3-cid', id: 'bx-a-cid' });
    const out = el('div', { class: 'bx3-result', id: 'bx-a-out', 'aria-live': 'polite' });
    const go = el('button', { type: 'submit', class: 'plane-link', id: 'bx-a-go', text: 'Save application' });
    const fields = () => ({ applicant: wallet.value.trim(), pitch: pitch.value.trim(), links: links.value.split('\n').map((x) => x.trim()).filter(Boolean) });
    const paint = () => {
      try {
        const t = buildApply(ctx.wallet(), n, fields(), M);
        prev.textContent = JSON.stringify(t.preview, null, 2); prev.dataset.cid = t.cid;
        cidP.className = 'bx3-cid ' + (t.check.ok ? 'is-ok' : 'is-err'); cidP.dataset.valid = String(t.check.ok);
        cidP.replaceChildren(el('strong', { text: 'CID ' }), el('code', { text: t.cid }), ` · ${t.doc.schema}: ${t.check.ok ? 'valid' : t.check.errors.slice(0, 2).join('; ')}`);
      } catch (e) { prev.textContent = 'Preview unavailable: ' + e.message; }
    };
    [pitch, links, wallet].forEach((i) => i.addEventListener('input', paint));
    const form = el('form', { class: 'bx3-form', novalidate: true }, [
      el('p', { class: 'bx-meta', text: `${n.id} · ${n.title}` }),
      el('p', { class: 'bx-dim bx3-hint', text: 'Saved on this device now. On the live board, apply records your application’s CID on chain; the task’s reviewer assigns one applicant.' }),
      field('bx-a-pitch', 'Your pitch', pitch), field('bx-a-links', 'Links (optional)', links), field('bx-a-wallet', 'Your Terp address', wallet),
      el('div', { class: 'bx-actions' }, [go]), out,
      el('details', { class: 'bx3-field bx3-onchain', id: 'bx-a-onchain' }, [el('summary', { text: 'What you would sign (preview)' }), cidP, prev]),
    ]);
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const f = fields(), errs = {};
      if (f.pitch.length < 10) errs.pitch = 'A few words (10+ characters).';
      if (!/^terp1[02-9ac-hj-np-z]{38,58}$/.test(f.applicant)) errs.wallet = 'A Terp address (terp1…).';
      if (f.links.some((u) => !/^(https|ipfs):\/\//.test(u))) errs.links = 'https:// or ipfs:// links only.';
      showErrs(form, errs); if (Object.keys(errs).length) return;
      const t = buildApply(ctx.wallet(), n, f, M);
      await store.submit(n, { evidenceUrl: f.links[0] || '', notes: f.pitch, wallet: f.applicant }, { kind: 'application', cid: t.cid });
      out.className = 'bx3-result is-ok'; out.replaceChildren(el('p', { text: 'Application saved on this device.' }), why(esc.line, esc.why, { tone: 'blocked' }));
      ctx.afterSubmit(n.id);
    });
    d.querySelector('form')?.remove();
    d.append(form);
    paint();
    d.showModal();
    pitch.focus();
  };
}

// On-chain task cards get an "On chain" button (board mode). Done here (data wiring) rather than in panel.js.
function wireEscrowCards(root, M, store, open) {
  if (M.mode !== 'chain') return;
  const inject = () => {
    for (const body of root.querySelectorAll('.bx31-sec[data-sec="status"], .bx3-card-body[id^="bx-c-"]')) {
      const id = body.closest('[data-id]') ? body.closest('[data-id]').dataset.id : null;
      const n = id && M.byId[id];
      if (!n || !n.onChain || body.querySelector('.bx3-escrow-open')) continue;
      const btn = el('button', { type: 'button', class: 'plane-link secondary bx3-escrow-open', text: 'On chain' });
      btn.addEventListener('click', () => open(n, btn));
      body.append(el('div', { class: 'bx-actions' }, [btn]));
    }
  };
  new MutationObserver(inject).observe(root, { childList: true, subtree: true });
}
