// v3.1: the full catalog card for one bounty, rendered on this page (no link to the separate
// catalog page). Reads the raw catalog entry (data-catalog, i.e. /data/bounties.json, the same file
// data.js loads) so every field of the catalog card is shown: summary, why now, acceptance
// criteria, verification stages, evidence, reward breakdown, scores, flags, assumptions, sources.
import { fmt, LABEL } from '/lib/bounties/data.js?v=eeb0c09c37';

function el(tag, attrs, kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids || []) if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
const list = (items, ordered) => el(ordered ? 'ol' : 'ul', { class: 'bx31-list' }, (items || []).map((t) => el('li', { text: t })));
const amt = (a) => (a && a.TERP && a.THIOL ? `${fmt(a.TERP.amount, 2)} TERP or ${fmt(a.THIOL.amount, 2)} THIOL` : 'not priced');

let RAW = null;
export function loadRaw(url) {
  if (!RAW) RAW = fetch(url, { cache: 'force-cache' }).then((r) => r.json()).then((j) => Object.fromEntries((j.bounties || []).map((b) => [b.id, b]))).catch(() => ({}));
  return RAW;
}

const STAGE = {
  precheck: (v) => [el('strong', { text: 'Deterministic prechecks (before any model): ' }), list(v.precheck)],
  triage: (v) => [el('strong', { text: 'Triage (cheap model): ' }), v.triage],
  strong_model: (v) => [el('strong', { text: 'Strong validator: ' }), v.strong_model],
  deterministic: (v) => [el('strong', { text: 'Deterministic acceptance checks: ' }), list(v.deterministic)],
  human: (v) => [el('strong', { text: 'Human approval: ' }), v.human],
};

// sections: {n (normalised node), b (raw catalog entry), M, jump(ids) -> buttons}
export function catalogSections({ n, b, M, jump }) {
  const out = [];
  const sec = (title, ...kids) => out.push(el('section', { class: 'bx31-sec', 'data-sec': title.toLowerCase().replace(/[^a-z]+/g, '-') }, [el('h4', { text: title }), ...kids]));
  if (!b) { out.push(el('p', { class: 'bx-dim', text: 'Catalog entry not loaded.' })); return out; }
  const r = b.reward || {}, w = r.work_units || {};
  const surf = Object.fromEntries((M.meta.surfaces || []).map((s) => [s.key, s.name]));
  if (b.summary) out.push(el('p', { class: 'bx-summary', 'data-sec': 'summary', text: b.summary }));
  if (b.why_now) out.push(el('p', { class: 'bx31-why' }, [el('strong', { text: 'Why now: ' }), b.why_now]));
  sec('Reward',
    el('p', { class: 'bx-reward bx3-card-reward' }, [...Object.entries(r.amounts || {}).filter(([, v]) => v && (v.amount != null || typeof v === 'number')).flatMap(([k, v], i) => [i ? el('span', { class: 'bx-dim bx3-or', text: 'or' }) : null, el('span', { class: 'bx3-badge bx3-badge--reward', 'data-denom': k === 'TERP' ? 'uterp' : k === 'THIOL' ? 'uthiol' : k, title: `${k}: ${r.label || LABEL}` }, [el('span', { class: 'bx3-badge__amt', text: `≈ ${fmt(v.amount ?? v, 2)}` }), ' ' + k])]), ' ', el('span', { class: 'bx-pending', text: r.label || LABEL })]),
    el('p', { class: 'bx-meta', text: `${b.reward_tier} ${r.tier_name || ''}: ${w.base} base work units × ${w.tier_multiplier} (tier) × ${w.priority_multiplier} (priority) × ${w.budget_scale} budget scale = ${fmt(w.total, 4)} work units, priced at ${r.priced_at ? r.priced_at.chain_id + ' height ' + r.priced_at.height : 'n/a'} (Prop 61 baseline), params ${r.params_version}.` }),
    r.stipend ? el('p', { class: 'bx-meta', text: `Stipend ${r.stipend.band}: ${fmt(r.stipend.work_units_per_month, 2)} work units/month ≈ ${amt(r.stipend.amounts_per_month)} per month, ${r.stipend.paid}, ${r.stipend.holdback_pct}% holdback.` }) : null,
    el('p', { class: 'bx-meta', text: `Multipliers: ${(r.multipliers_applicable || []).join(', ') || 'none'} · payout in ${(r.payout_assets || []).join(' or ')}.` }),
    r.status ? el('p', { class: 'bx-meta bx31-note', text: r.status }) : null);
  const rel = [];
  const neededBy = M.all.filter((x) => (x.deps || []).includes(n.id)).map((x) => x.id);
  rel.push(el('p', { class: 'bx-rel', 'data-rel': 'deps' }, ['Depends on ', ...(n.deps.length ? jump(n.deps) : [el('span', { class: 'bx-dim', text: 'none' })])]));
  rel.push(el('p', { class: 'bx-rel', 'data-rel': 'needed' }, ['Needed by ', ...(neededBy.length ? jump(neededBy) : [el('span', { class: 'bx-dim', text: 'none' })])]));
  sec('Dependencies', ...rel);
  sec('Acceptance criteria', list(b.acceptance_criteria, true));
  sec('Evidence to submit', list(b.evidence_required));
  const v = b.verification || {};
  sec('Verification (in order)', el('ol', { class: 'bx31-list' }, (v.order || []).filter((k) => STAGE[k]).map((k) => el('li', {}, STAGE[k](v)))),
    v.short_circuit ? el('p', { class: 'bx-meta bx31-note', text: v.short_circuit }) : null);
  const dl = el('dl', { class: 'bx31-kv' });
  const row = (k, t) => dl.append(el('dt', { text: k }), el('dd', { text: t }));
  row('Category', `${M.cats[b.category] || b.category} · ${b.subcategory}`);
  row('Priority', `${b.priority} · ${b.horizon}${b.top10_rank ? ` · top ${b.top10_rank}` : ''} · rank ${b.rank}`);
  row('Scores', `effort ${b.scores.effort} · skill ${b.scores.skill} · risk ${b.scores.risk} · impact ${b.scores.impact} = ${b.score_total}`);
  row('Effort', (b.effort_estimate || {}).label || 'n/a');
  row('Skills', (b.skills || []).join(', '));
  row('Surfaces', (b.surface || []).map((s) => surf[s] || s).join(', ') || 'none');
  row('Retroactive', b.retroactive_eligible ? 'eligible' : 'no');
  row('Claims', (b.parallel_claims_allowed ? 'parallel claims allowed' : 'one active claim') + (b.staged_release ? '; staged release' : ''));
  row('Interoperable', b.interoperable ? 'yes' : 'no');
  if (b.partner) row('Partner', b.partner);
  row('Access', b.access === 'open' ? 'open' : 'core-team host access needed');
  sec('Details', dl);
  if ((b.assumptions || []).length) sec('Assumptions (marked)', list(b.assumptions));
  sec('Sources', el('ul', { class: 'bx31-list bx31-src' }, (b.source_refs || []).map((s) => el('li', {}, [el('code', { text: s })]))));
  return out;
}
