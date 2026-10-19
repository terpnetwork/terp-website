// timeline.js — "How a bounty works": the ELI5 timeline at the top of the propose form (fin1, chain1).
// chain1: the steps are the on-chain lifecycle of the PROPOSED bounty board + per-task escrow
// (design/specs/bounties-onchain-2026-10-19.md §5):
//   propose_task -> DAO vote (proposed) -> passed: launch{task_id} creates the task's own escrow with the reward
//   (approved/funding -> open) -> assign/claim (assigned) -> submit (submitted) -> approve (accepted -> paid);
//   vote fails / cancel / expire -> every deposit back to whoever made it.
// The first step (the draft) happens here, off chain. `at` marks where a proposal made in this form is now.
export const STEPS = [
  { key: 'draft', who: 'You', title: 'Write it', text: 'Describe the task and the reward. It is saved on this device.', chain: '' },
  { key: 'vote', who: 'DAO', title: 'Vote', text: 'You propose it on chain; DAO members vote to list it.', chain: 'proposed' },
  { key: 'deposit', who: 'DAO', title: 'Lock the reward', text: 'The task gets its own escrow contract holding the reward. Nobody can spend it.', chain: 'open' },
  { key: 'claim', who: 'Builder', title: 'Claim', text: 'A builder applies and is assigned the task.', chain: 'assigned' },
  { key: 'submit', who: 'Builder', title: 'Submit', text: 'They hand in the work: a link plus its fingerprint, on chain.', chain: 'submitted' },
  { key: 'review', who: 'DAO', title: 'Review', text: 'The reviewer accepts it or asks for changes.', chain: 'accepted' },
  { key: 'payout', who: 'DAO', title: 'Payout', text: 'The escrow releases the reward to the builder.', chain: 'paid' },
];
const STATE_AT = { '': 0, draft: 1, awaiting: 1, proposed: 2, approved: 2, funding: 2, pending: 2, open: 3, assigned: 4, submitted: 5, accepted: 6, paid: 7 };

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids || []) if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}

/** The explainer; returns { node, set(state) } where state is a draft/escrow state ('' | draft | awaiting | pending | open …). */
export function timeline({ id = 'bx-tl', open = true } = {}) {
  const items = STEPS.map((s, i) => el('li', { class: 'bx-tl__step', 'data-step': s.key }, [
    el('span', { class: 'bx-tl__n', 'aria-hidden': 'true', text: String(i + 1) }),
    el('span', { class: 'bx-tl__body' }, [
      el('span', { class: 'bx-tl__head' }, [el('strong', { class: 'bx-tl__title', text: s.title }), el('span', { class: 'bx-tl__who', 'data-who': s.who.toLowerCase(), text: s.who })]),
      el('span', { class: 'bx-tl__text', text: s.text }),
      s.chain ? el('span', { class: 'bx-tl__chain' }, ['status ', el('code', { text: s.chain })]) : null,
    ]),
  ]));
  const list = el('ol', { class: 'bx-tl__list', id: id + '-list' }, items);
  const node = el('details', { class: 'bx-tl', id, open: open ? true : null }, [
    el('summary', { class: 'bx-tl__sum' }, [el('span', { text: 'How a bounty works' }), el('span', { class: 'bx-tl__count', text: ' · 7 steps, about 1 minute to read' })]),
    list,
    el('p', { class: 'bx-tl__side' }, ['Vote fails, task cancelled, or nobody finished by the deadline? The escrow sends every deposit back to whoever made it.']),
  ]);
  function set(state = '') {
    const at = STATE_AT[state] ?? 0;
    items.forEach((li, i) => {
      li.classList.toggle('is-done', i < at);
      li.classList.toggle('is-now', i === at);
      if (i === at) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
    });
    node.dataset.at = STEPS[Math.min(at, STEPS.length - 1)].key;
  }
  set('');
  return { node, set };
}
