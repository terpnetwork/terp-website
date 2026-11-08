// Catalog side panel: list + Now/Next/Later kanban, filters, bounty details.
import { CATEGORIES, CAT_BY_KEY, catOf, HORIZONS, byRank, fmt, LABEL } from '/lib/bounties/data.js?v=eeb0c09c37';
import { catalogSections, loadRaw } from '/lib/bounties/detail.js?v=612ee50064';   // v3.1
import { viaText, CHAIN } from '/lib/bounties/store.js?v=8b3d4fdc22';
import { formatMicro } from '/lib/amount.js?v=2cb261fcfb-r2';   // amount1: exact half-up

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids || []) if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
// chain1: one status per task, from the bounty board (spec §5). The DAO votes first (Pending vote), then the
// task's own escrow is created and funded (Pending escrow), then Open, and the escrow's later states follow. A task
// is never "Open" unless its escrow says so; a draft-preview catalog task has not been voted on yet (Pending vote).
// "Has a submission" is a separate filter.
export const STATUS_LABEL = {
  draft: 'Draft', escrow: 'Pending escrow', vote: 'Pending vote', open: 'Open', assigned: 'Assigned',
  review: 'In review', accepted: 'Accepted', paid: 'Paid', closed: 'Closed',
};
export const STATUS_WHY = {
  draft: 'Saved on this device. Not sent anywhere yet.',
  escrow: 'The DAO approved it; its escrow isn’t funded yet, so it can’t be claimed.',
  vote: 'Waiting for the DAO vote that lists it. Nothing can be claimed yet.',
  open: 'Funded and listed: you can apply to work on it.',
  assigned: 'Someone is working on it.',
  review: 'Work was handed in and is being reviewed.',
  accepted: 'Accepted; the payout comes next.',
  paid: 'The reward was paid out.',
  closed: 'Cancelled, refunded or expired.',
};
export const STATUSES = [
  ['vote', STATUS_LABEL.vote], ['escrow', STATUS_LABEL.escrow], ['open', STATUS_LABEL.open], ['assigned', STATUS_LABEL.assigned],
  ['review', STATUS_LABEL.review], ['paid', STATUS_LABEL.paid], ['submitted', 'Has a submission'],
];
/** The single status key of a task (on chain, draft-preview catalog, or created on this device). */
export function taskStatus(n) {
  if (n.onChain) return n.onChain.badge || 'vote';
  if (n.created) return 'draft';   // drafts live on this device; older simulated escrow records read as drafts too
  return 'vote';
}
const PRICED_DENOM = { uterp: 'TERP', uthiol: 'THIOL' };
export function rewardBadges(n) {
  const mk = (amount, sym, denom) => el('span', { class: 'bx3-badge bx3-badge--reward', 'data-denom': denom, title: `${sym}: ${LABEL}` }, [el('span', { class: 'bx3-badge__amt', text: typeof amount === 'string' ? amount : `≈ ${fmt(amount, 2)}` }), ' ' + sym]);
  if (n.created) { const q = n.quote || {}; return [mk(q.amount || 0, q.label || q.asset || '', q.denom || '')]; }
  if (n.reward) { const sym = PRICED_DENOM[n.reward.denom]; return [sym ? mk(formatMicro(n.reward.amount, 6, 2), sym, n.reward.denom) : el('span', { class: 'bx3-badge bx3-badge--reward', 'data-denom': n.reward.denom, title: n.reward.denom }, [el('span', { class: 'bx3-badge__amt', text: n.reward.amount }), ' ' + n.reward.denom.split('/').pop()])]; }
  if (!n.amounts) return [el('span', { class: 'bx3-badge bx3-badge--reward is-none', text: 'Not priced' })];
  return [mk(n.amounts.TERP, 'TERP', 'uterp'), el('span', { class: 'bx-dim bx3-or', text: 'or' }), mk(n.amounts.THIOL, 'THIOL', 'uthiol')];
}
export function rewardText(n) {
  if (n.reward) return `${PRICED_DENOM[n.reward.denom] ? formatMicro(n.reward.amount, 6, 2) + ' ' + PRICED_DENOM[n.reward.denom] : n.reward.amount + ' ' + n.reward.denom}${n.onChain && n.onChain.status === 'proposed' ? '' : ' (approved)'}`;
  if (!n.amounts) return 'Reward: not priced';
  return `≈ ${fmt(n.amounts.TERP, 2)} TERP or ${fmt(n.amounts.THIOL, 2)} THIOL`;
}

export function mountPanel(root, M, store, ctx) {
  const P = {
    tabs: root.querySelector('#bx-tabs'), form: root.querySelector('#bx-filters'), count: root.querySelector('#bx-count'),
    list: root.querySelector('#bx-list'), kanban: root.querySelector('#bx-kanban'),
    detail: root.querySelector('#bx-detail'),   // v3.1: the selected task, at the top of the panel
  };
  const f = { cat: '', pri: '', tier: '', hor: '', status: '', q: '' };
  let open = null;
  let RAW = {};   // v3.1: raw catalog entries for the full card
  // preview: the bundled catalog's full entries. chain: never (each task's document comes by CID, verified)
  if (M.mode !== 'chain' && M.all.length) loadRaw(root.dataset.catalog || '/public/data/bounties.json').then((m) => { RAW = m; if (open) render(); });

  // filter controls
  const sel = (name, label, opts) => {
    const s = el('select', { name, id: 'bx-f-' + name }, [el('option', { value: '', text: 'All' }), ...opts.map(([v, t]) => el('option', { value: v, text: t }))]);
    s.addEventListener('change', () => { if (name === 'cat') ctx.setCat(s.value || null, { from: 'panel' }); else { f[name] = s.value; render(); ctx.onFilter(); } });
    return el('label', { class: 'bx3-f' }, [el('span', { text: label }), s]);
  };
  const tiers = M.meta.tiers.map((t) => [t.key, `${t.key} ${t.name}`]);
  const q = el('input', { type: 'search', name: 'q', id: 'bx-f-q', placeholder: 'id, title, skill…', autocomplete: 'off' });
  q.addEventListener('input', () => { f.q = q.value.trim().toLowerCase(); render(); ctx.onFilter(); });
  const clear = el('button', { type: 'button', class: 'plane-link secondary bx3-clear', text: 'Clear filters' });
  clear.addEventListener('click', () => { for (const k of ['pri', 'tier', 'hor', 'status']) { f[k] = ''; P.form.querySelector('#bx-f-' + k).value = ''; } f.q = ''; q.value = ''; ctx.setCat(null, { from: 'panel' }); render(); ctx.onFilter(); });
  P.form.replaceChildren(
    sel('cat', 'Category', CATEGORIES.map((c) => [c.key, c.name])),
    sel('pri', 'Priority', M.meta.priorities.map((p) => [p.key, `${p.key} ${p.name}`])),
    sel('tier', 'Tier', tiers),
    sel('hor', 'Horizon', HORIZONS.map((h) => [h, h])),
    sel('status', 'Status', STATUSES),
    el('label', { class: 'bx3-f bx3-f--q' }, [el('span', { text: 'Search' }), q]),
    clear,
  );
  P.form.addEventListener('submit', (e) => e.preventDefault());

  const created = () => store.created().map((b) => ({ ...b, created: true }));
  const statusOf = (n) => taskStatus(n);
  const match = (n, ignoreCat) => {
    if (!ignoreCat && f.cat && (n.created ? n.cat : catOf(n).key) !== f.cat) return false;
    if (f.pri && n.priority !== f.pri) return false;
    if (f.tier && n.tier !== f.tier) return false;
    if (f.hor && n.horizon !== f.hor) return false;
    if (f.status && (f.status === 'submitted' ? !(!n.created && store.pending(n.id).length) : statusOf(n) !== f.status)) return false;
    if (f.q && !`${n.id} ${n.title} ${n.summary || ''} ${(n.skills || []).join(' ')}`.toLowerCase().includes(f.q)) return false;
    return true;
  };
  // Beta: only on-chain tasks are listed (proposals saved on this device are not shown as bounties).
  const items = () => M.all.slice().sort(byRank);

  function badges(n) {
    const st = statusOf(n);
    const out = [el('span', { class: 'bx3-badge bx3-badge--st bx3-badge--st-' + st, 'data-status': st, title: STATUS_WHY[st], text: STATUS_LABEL[st] })];
    if (!n.created && n.onChain) out.push(el('span', { class: 'bx3-badge bx3-badge--board', title: `Task #${n.onChain.id} on the bounty board${n.onChain.escrow ? ', escrow ' + n.onChain.escrow : ''}`, text: `On chain #${n.onChain.id}` }));
    if (!n.created) for (const s of store.pending(n.id)) out.push(el('span', { class: 'bx3-badge bx3-badge--sub', 'data-via': s.via, text: `Submission pending · ${viaText(s.via)}` }));
    return out;
  }
  function card(n, compact) {
    const c = n.created ? CAT_BY_KEY[n.cat] : catOf(n);
    const head = el('button', { type: 'button', class: 'bx3-card-head', 'aria-expanded': String(open === n.id), 'aria-controls': 'bx-c-' + n.id }, [
      el('span', { class: 'bx3-card-meta' }, [el('span', { class: 'bx-sw', style: `--c:${c.color}` }), `${n.id} · ${n.priority} · ${n.tier} · ${n.horizon}`]),
      el('span', { class: 'bx3-card-title', text: n.title }),
      el('span', { class: 'bx3-card-reward', 'aria-label': 'Reward (proposed, pending vote)' }, rewardBadges(n)),
      el('span', { class: 'bx3-badges' }, badges(n)),
    ]);
    head.addEventListener('click', () => { ctx.onSelect(open === n.id ? null : n.id, { from: 'panel' }); if (open && P.detail) scrollDetail(); });
    const box = el('article', { class: 'bx3-card' + (open === n.id ? ' is-open' : '') + (compact ? ' is-compact' : ''), 'data-id': n.id, style: `--c:${c.color}` }, [head]);
    if (open === n.id && !compact) box.append(details(n));   // v3.1: kanban cards open in the detail at the top
    return box;
  }
  function details(n) {
    const d = el('div', { class: 'bx3-card-body', id: 'bx-c-' + n.id });
    if (n.created) {
      d.append(el('p', { class: 'bx-meta', text: `${CAT_BY_KEY[n.cat].name} · capabilities: ${n.capabilities.join(', ') || 'none'} · deadline ${n.deadline}` }),
        el('p', { class: 'bx-meta', text: `${STATUS_WHY[taskStatus(n)]}${n.escrow && !n.escrow.simulated ? ` Escrow bounty #${n.escrow.id} on ${n.chainId}.` : ''}${n.txhash && !/^SIM/.test(n.txhash) ? ' Tx ' + n.txhash.slice(0, 16) + '…' : ''}` }),
        el('ul', { class: 'bx3-ac' }, n.acceptance.map((a) => el('li', { text: a }))));
      return d;
    }
    const cat = catOf(n), neededBy = M.all.filter((x) => (x.deps || []).includes(n.id));
    const jump = (ids) => ids.map((id) => { const b = el('button', { type: 'button', class: 'bx-jump', text: id }); b.addEventListener('click', () => ctx.onSelect(id, { from: 'panel', zoom: true })); return b; });
    d.append(
      el('p', { class: 'bx-reward' }, [el('strong', { text: rewardText(n) }), ` · ${fmt(n.wu, 2)} work units · `, el('span', { class: 'bx-pending', text: n.rewardLabel || LABEL })]),
      el('p', { class: 'bx-meta', text: `${M.cats[n.category]} (${cat.name}) · ${n.tierName || ''} · effort ${n.effort || 'n/a'}` }),
      n.summary ? el('p', { class: 'bx-summary', text: n.summary }) : null,
      n.acceptance.length ? el('details', {}, [el('summary', { text: `Acceptance criteria (${n.acceptance.length})` }), el('ul', { class: 'bx3-ac' }, n.acceptance.map((a) => el('li', { text: a })))]) : null,
      n.deps.length ? el('p', { class: 'bx-rel' }, ['Depends on ', ...jump(n.deps)]) : null,
      neededBy.length ? el('p', { class: 'bx-rel' }, ['Needed by ', ...jump(neededBy.map((x) => x.id))]) : null,
    );
    const subs = store.submissions(n.id);
    if (subs.length) d.append(el('ul', { class: 'bx3-subs' }, subs.map((s) => el('li', {}, [el('strong', { text: s.status }), ` · ${viaText(s.via)}` + (s.at ? ` · ${new Date(s.at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '') + (s.evidenceUrl ? ` · ${s.evidenceUrl}` : '')]))));
    d.append(actions(n));
    return d;
  }

  // Apply (board apply) + Submit work (escrow submit); both save on this device and show the exact message.
  function actions(n) {
    const mine = store.pending(n.id).some((x) => x.via === CHAIN && x.kind === 'submission');
    const submit = el('button', { type: 'button', class: 'plane-link bx3-submit', text: mine ? 'Submitted (pending review)' : 'Submit work', disabled: mine });
    submit.addEventListener('click', () => ctx.openSubmit(n, submit));
    const apply = el('button', { type: 'button', class: 'plane-link secondary bx3-apply', text: 'Apply' });
    apply.addEventListener('click', () => ctx.openApply(n, apply));
    return el('div', { class: 'bx-actions' }, [submit, apply,
      el('span', { class: 'bx-dim bx3-via', text: store.canChain(n) ? 'Saved on this device; the message for the board is shown before anything is sent.' : 'Saved on this device; share the link on Discord.' })]);
  }

  function render() {
    const tab = ctx.tab();
    if (P.tabs) P.tabs.querySelectorAll('[data-tab]').forEach((a) => { const on = a.dataset.tab === tab; a.classList.toggle('active', on); a.setAttribute('aria-selected', String(on)); });
    const all = items(), shown = all.filter((n) => match(n));
    const catName = f.cat ? CAT_BY_KEY[f.cat].name : null;
    P.count.textContent = `${shown.length} of ${all.length} bounties` + (catName ? ` · ${catName}` : '') + (shown.length !== all.length && !catName ? ' (filtered)' : '');
    // v3.1: the kanban is the only view (W and E both show it); the selected task opens above it
    if (!all.length) {
      P.count.textContent = '';
      if (P.detail) { P.detail.replaceChildren(); P.detail.style.display = 'none'; }
      if (P.list) P.list.hidden = true;
      P.kanban.hidden = false;
      P.kanban.replaceChildren(el('p', { class: 'bx-hint bx3-empty', text: 'No bounties yet. The first ones appear here once they are live on Terp.' }));
      if (P.form) P.form.style.display = 'none';
      return;
    }
    if (P.form) P.form.style.display = '';
    if (P.detail) { P.detail.style.display = ''; renderDetail(); }
    if (P.list) P.list.hidden = !!P.detail || tab !== 'list'; P.kanban.hidden = !P.detail && tab !== 'kanban';
    if (!P.detail && tab === 'list') {
      P.list.replaceChildren(...(shown.length ? shown.map((n) => card(n)) : [el('p', { class: 'bx-hint', text: 'No bounty matches these filters.' })]));
    } else {
      P.kanban.replaceChildren(...HORIZONS.map((h) => {
        const col = shown.filter((n) => n.horizon === h), subs = col.filter((n) => !n.created && store.pending(n.id).length).length;
        return el('section', { class: 'bx3-col', 'data-horizon': h }, [
          el('h3', {}, [h, el('span', { class: 'bx-dim', text: ` · ${col.length}` + (subs ? ` · ${subs} with a pending submission` : '') })]),
          ...col.map((n) => card(n, true)),
        ]);
      }));
    }
  }
  // ── v3.1: selected task (full catalog card + status, submissions, actions) ──
  function scrollDetail() { requestAnimationFrame(() => P.detail.scrollIntoView({ block: 'start', behavior: 'instant' })); }
  function renderDetail() {
    const n = open && (M.byId[open] || created().find((x) => x.id === open));
    P.detail.classList.toggle('is-on', !!n);
    P.detail.dataset.id = n ? n.id : '';   // v3.1 (for the checks)
    if (!n) { P.detail.replaceChildren(el('p', { class: 'bx-hint bx31-empty', text: 'Select a task in the shield or in the columns below: its full card opens here.' })); return; }
    const c = n.created ? CAT_BY_KEY[n.cat] : catOf(n);
    const x = el('button', { type: 'button', class: 'bx3-x bx31-close', 'aria-label': 'Close task details', text: '×' });
    x.addEventListener('click', () => ctx.onSelect(null, { from: 'panel' }));
    const head = el('header', { class: 'bx31-head' }, [
      el('div', { class: 'bx31-headrow' }, [el('span', { class: 'bx3-card-meta' }, [el('span', { class: 'bx-sw', style: `--c:${c.color}` }), `${n.id} · ${n.priority} · ${n.tier} · ${n.horizon} · ${c.name}`]), x]),
      el('h3', { class: 'bx31-title', id: 'bx-detail-title', text: n.title }),
      el('div', { class: 'bx3-badges' }, badges(n)),
    ]);
    if (n.created) { P.detail.replaceChildren(head, details(n)); return; }
    const jump = (ids) => ids.map((id) => { const b = el('button', { type: 'button', class: 'bx-jump', 'data-jump': id, text: id + (M.byId[id] ? ' · ' + (M.byId[id].title.length > 44 ? M.byId[id].title.slice(0, 43) + '…' : M.byId[id].title) : '') }); b.addEventListener('click', () => { ctx.onSelect(id, { from: 'panel', zoom: true }); scrollDetail(); }); return b; });
    const subs = store.submissions(n.id);
    const status = el('section', { class: 'bx31-sec', 'data-sec': 'status' }, [el('h4', { text: 'Status and submissions' }),
      el('p', { class: 'bx-meta', 'data-status': taskStatus(n) }, [el('strong', { text: STATUS_LABEL[taskStatus(n)] + '. ' }), STATUS_WHY[taskStatus(n)] + (n.onChain ? ` Task #${n.onChain.id} on the bounty board: ${n.onChain.status}.` : n.preview ? ' Draft preview: not on chain yet.' : '')]),
      subs.length ? el('ul', { class: 'bx3-subs' }, subs.map((s) => el('li', {}, [el('strong', { text: s.status }), ` · ${viaText(s.via)}` + (s.at ? ` · ${new Date(s.at).toISOString().slice(0, 16).replace('T', ' ')} UTC` : '') + (s.evidenceUrl ? ` · ${s.evidenceUrl}` : '')]))) : el('p', { class: 'bx-dim', text: 'No submissions yet.' }),
      actions(n)]);
    if (n.onChain && !RAW[n.id] && M.hydrate && !n._hydrating) {   // chain mode: the details document, by CID, verified
      n._hydrating = M.hydrate(n).then((raw) => { if (raw) { RAW[n.id] = raw; if (open === n.id) render(); } }).catch((e) => { n.docError = e.message; if (open === n.id) render(); });
    }
    const secs = catalogSections({ n, b: RAW[n.id], M, jump });
    if (n.docError) secs.unshift(el('p', { class: 'bx-dim bx31-why', 'data-doc': 'error', text: `Details: ${n.docError}` }));
    const at = secs.findIndex((e) => e.dataset && e.dataset.sec === 'reward');
    secs.splice(at >= 0 ? at + 1 : 0, 0, status);
    P.detail.replaceChildren(head, el('div', { class: 'bx31-body' }, secs));
  }
  store.on(render);
  return {
    render, match: (n) => match(n), matchIgnoringCat: (n) => match(n, true),
    setCat(key) { f.cat = key || ''; P.form.querySelector('#bx-f-cat').value = f.cat; render(); },
    open(id, scroll) {
      open = id; render();
      if (id && scroll && P.detail) { scrollDetail(); return; }
      if (id && scroll) { const c = P.list.hidden ? P.kanban.querySelector(`[data-id="${CSS.escape(id)}"]`) : P.list.querySelector(`[data-id="${CSS.escape(id)}"]`); c?.scrollIntoView({ block: 'nearest' }); }
    },
    get filters() { return { ...f }; },
    statusOf,
  };
}
