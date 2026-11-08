// Data for the v3 bounties page (chain1: no backend). The nine shield categories, pricing from
// catalog/pricing.params.json, and the task list from ONE of two places:
//   chain:   the bounty board contract named in public/config.json chains[<site chain>].bounties.contract —
//            LCD smart queries (board.js), each task's details document fetched by CID and verified (cid.js);
//   preview: no board contract on this network yet (mainnet today) — the bundled catalog
//            (/public/data/bounties.json), clearly labelled as a draft preview: nothing in it is on chain.
// There is no dev API and no database: the chain is the source of truth, the S3 bucket holds CID documents.
import { SLOTS } from '/lib/fractal/routes.js?v=c884c9e3de';
import { loadEscrowParams, siteChainId, NET_NAME, Schemas } from '/lib/bounties/chain.js?v=30c45273bf';
import { boardConfig, lcd, readTasks, BADGE_OF } from '/lib/bounties/board.js?v=29627017de';
import { fetchDoc } from '/lib/bounties/cid.js?v=94332d16b3-r2';

export const LABEL = 'proposed, pending vote';

// Exactly nine categories, one per inner orb of the shield (the 3x3 inside the four points).
// The catalog's 17 categories fold into them as listed in `cats` (documented in README.md).
export const CATEGORIES = [
  { key: 'apps',      slot: 'NW', name: 'Platform & apps',             short: 'Platform',  cats: ['platform', 'frontend'],               color: '#b9e6ee' },
  { key: 'ibc',       slot: 'n',  name: 'IBC & relaying',              short: 'IBC',       cats: ['ibc'],                                color: '#7fe3cf' },
  { key: 'protocol',  slot: 'NE', name: 'Protocol & QA',               short: 'Protocol',  cats: ['protocol', 'qa'],                     color: '#cfffcf' },
  { key: 'docs',      slot: 'w',  name: 'Docs, content & translation', short: 'Docs',      cats: ['docs', 'content', 'translation'],     color: '#78dcc4' },
  { key: 'ops',       slot: 'C',  name: 'Chain ops & security',        short: 'Chain ops', cats: ['chain-ops', 'security'],              color: '#86e3a4' },
  { key: 'contracts', slot: 'e',  name: 'Contracts & data',            short: 'Contracts', cats: ['contracts', 'data'],                  color: '#e2f7a0' },
  { key: 'community', slot: 'SW', name: 'Cannabis & community',        short: 'Community', cats: ['cannabis', 'community'],              color: '#c6ec8a' },
  { key: 'partners',  slot: 's',  name: 'Partnerships',                short: 'Partners',  cats: ['partnerships'],                       color: '#e8b86a' },
  { key: 'liquidity', slot: 'SE', name: 'Liquidity & governance',      short: 'Liquidity', cats: ['liquidity', 'governance'],            color: '#f0d48a' },
].map((c) => ({ ...c, at: SLOTS[c.slot] }));
export const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));
const CAT_OF = {};
CATEGORIES.forEach((c) => c.cats.forEach((k) => { CAT_OF[k] = c; }));
export const catOf = (n) => CAT_OF[n.category] || CAT_BY_KEY[n.category] || CAT_BY_KEY.ops;

export const HORIZONS = ['Now', 'Next', 'Later'];
export const HORIZON_OF = { P0: 'Now', P1: 'Now', P2: 'Next', P3: 'Later' };
export const PRI = { P0: 0, P1: 1, P2: 2, P3: 3 };
export const byRank = (a, b) => (PRI[a.priority] ?? 9) - (PRI[b.priority] ?? 9) || (a.rank ?? 1e9) - (b.rank ?? 1e9) || String(a.id).localeCompare(String(b.id));
export const fmt = (n, d = 0) => Number(n).toLocaleString('en-US', { maximumFractionDigits: d, minimumFractionDigits: d ? Math.min(d, 2) : 0 });

async function getJSON(url, ms = 3000) {
  const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { credentials: 'omit', cache: 'no-store', signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return await r.json();
  } catch (e) { throw new Error(e.name === 'AbortError' ? 'timeout' : e.message); } finally { clearTimeout(t); }
}
const isCatalog = (j) => j && j.meta && Array.isArray(j.bounties);

function fromCatalog(b) {
  const r = b.reward || {}, a = r.amounts || {};
  return {
    id: b.id, title: b.title, category: b.category, subcategory: b.subcategory, priority: b.priority, tier: b.reward_tier, tierName: r.tier_name,
    horizon: b.horizon || HORIZON_OF[b.priority], skills: b.skills || [], deps: b.dependencies || [], summary: b.summary,
    acceptance: b.acceptance_criteria || [], evidence: b.evidence_required || [], effort: (b.effort_estimate || {}).label || b.effort_estimate,
    rank: b.rank, top10: b.top10_rank,
    amounts: a.TERP && a.THIOL ? { TERP: a.TERP.amount, THIOL: a.THIOL.amount } : null,
    wu: r.work_units ? r.work_units.total : null, budgetScale: r.work_units ? r.work_units.budget_scale : null,
    rewardLabel: r.label || null, onChain: null, preview: true,
  };
}

// A board task (spec §3.3 TaskResponse) as a page node. Long text arrives later from its details CID (hydrate).
export function fromTask(t, tierNames = {}) {
  return {
    id: t.ref, title: t.title, category: t.category, subcategory: null, priority: t.priority, tier: t.tier, tierName: tierNames[t.tier] || '',
    horizon: HORIZON_OF[t.priority] || 'Later', skills: [], deps: [], summary: t.summary, acceptance: [], evidence: [], effort: null, rank: t.id, top10: null,
    amounts: null, reward: t.reward, wu: null, budgetScale: null, rewardLabel: t.status === 'proposed' ? LABEL : null, preview: false,
    detailsCid: t.details_cid,
    onChain: { id: t.id, status: t.status, badge: BADGE_OF[t.status] || 'vote', escrow: t.escrow || null, creator: t.creator, assignee: t.assignee || null,
      proposalId: t.proposal_id ?? null, applications: t.applications || 0, submissions: t.submissions || 0, funded: t.funded || null, expiresAt: t.expires_at || null },
  };
}

/** Fill a chain node from its verified details document (terp-bounty-details/v1|v2). Returns a catalog-shaped raw
 *  entry for detail.js, or throws a CidError (the card then says the document isn't reachable / doesn't match). */
export async function hydrate(M, n) {
  if (!n.detailsCid) return null;
  const r = await fetchDoc(n.detailsCid, { gateways: M.board.cidGateway });
  const d = r.doc, x = d.catalog || {};
  const check = Schemas.validateDetails(d);
  if (d.bounty_ref !== n.id) throw new Error(`The document is for ${d.bounty_ref}, not ${n.id}.`);
  n.docCheck = check.ok ? 'valid' : 'problems: ' + check.errors.slice(0, 3).join('; ');
  Object.assign(n, { acceptance: d.acceptance_criteria || [], evidence: d.evidence_required || [], skills: d.capabilities || [], deps: x.dependencies || [],
    subcategory: x.subcategory || null, effort: (x.effort_estimate && x.effort_estimate.label) || x.effort_estimate || null, docVia: r.via, docVerified: true });
  // catalog-shaped for detail.js: the v2 document carries the catalog's own fields under `catalog`
  const rq = d.reward_quote || {};
  return { ...x, id: n.id, title: d.title, summary: d.description || d.summary, category: x.category || d.category, subcategory: x.subcategory, priority: d.priority, reward_tier: d.tier,
    horizon: x.horizon || n.horizon, rank: x.rank ?? n.onChain.id, skills: d.capabilities || [], dependencies: x.dependencies || [], acceptance_criteria: d.acceptance_criteria || [], evidence_required: d.evidence_required || [],
    scores: x.scores || { effort: 'n/a', skill: 'n/a', risk: 'n/a', impact: 'n/a' }, score_total: x.score_total ?? 'n/a',
    reward: { label: rq.label, work_units: rq.work_units ? { total: Number(rq.work_units) } : undefined, params_version: rq.params_version }, _cid: n.detailsCid, _via: r.via, _check: n.docCheck };
}

export const EMPTY_LINE = 'First bounties coming soon.';
export function emptyWhy(chainId) {
  return `Bounties appear here once they are live on ${NET_NAME(chainId)} (${chainId}): each task is voted on by the DAO and gets its own escrow contract holding the reward. You can already write a proposal with “Propose a bounty”.`;
}
export const PREVIEW_LINE = 'Draft preview: these tasks are not on chain yet.';
export function previewWhy(chainId) {
  return `The bounty board contract is not deployed on ${NET_NAME(chainId)} (${chainId}) yet. This list is the draft catalog the DAO will vote on in batches; each reward is proposed, pending vote. Once a batch passes, every task gets its own escrow contract, and this page reads the tasks from the chain instead.`;
}

export async function load(cfg) {
  const cat = await getJSON(cfg.catalog);
  if (!isCatalog(cat)) throw new Error('catalog: not a catalog');
  const cats = {};
  cat.meta.categories.forEach((c) => { cats[c.key] = c.name; });
  const chainId = cfg.chainId || siteChainId();
  let chain = cfg.chain || null;
  if (!chain) { try { const { getChainConfig } = await import('/lib/config.js?v=a177cb9062'); chain = await getChainConfig(chainId); } catch { chain = { chainId }; } }
  const board = boardConfig({ chainId, ...chain });
  const M = { meta: cat.meta, cats, byId: {}, all: [], mode: 'preview', label: '', errors: [], board, chainId, hydrate: (n) => hydrate(M, n) };
  if (board.live) {
    try {
      const client = cfg.lcd || lcd(board.rest, cfg.fetchImpl ? { fetchImpl: cfg.fetchImpl } : {});
      const tiers = Object.fromEntries((cat.meta.tiers || []).map((t) => [t.key, t.name]));
      const tasks = await readTasks(client, board.contract);
      M.client = client;
      M.all = tasks.map((t) => fromTask(t, tiers));
      M.all.forEach((n) => { M.byId[n.id] = n; });
      Object.assign(M, { mode: 'chain', label: `on chain: ${board.contract} (${chainId})` });
      if (!M.all.length) M.empty = { line: EMPTY_LINE, why: emptyWhy(chainId) };
      return withEscrow(M, cfg);
    } catch (e) { M.errors.push('board: ' + e.message); M.chainError = e.message; }
  }
  // Beta: no draft-preview fallback. Until the board has tasks on chain the page shows an empty state;
  // the bundled file carries only the catalog meta (categories, tiers), never tasks.
  M.all = [];
  M.empty = { line: EMPTY_LINE, why: M.chainError ? `Couldn’t read the bounty board: ${M.chainError}` : emptyWhy(chainId) };
  Object.assign(M, { mode: 'empty', label: 'no bounties on chain yet' });
  return withEscrow(M, cfg);
}

// Escrow governance params (caps, min stake, deadline window; PLACEHOLDERS pending a vote) for both modes. In
// chain mode the board's own config (query config) is the authority once it is live; this file is the draft.
async function withEscrow(M, cfg) {
  M.escrow = { params: null, paramsError: null };
  try { M.escrow.params = await loadEscrowParams(cfg.escrowParams || '/public/data/bounties.escrow-params.json'); } catch (e) { M.escrow.paramsError = e.message; M.errors.push('escrow params: ' + e.message); }
  return M;
}

// ── pricing: catalog/pricing.params.json (same formula and rounding as the catalog) ──
// reward[asset] = base_rate[asset](h) x base_work_units x tier_multiplier[tier] x priority_multiplier[priority]
// (x the catalog's placeholder budget scale), base_rate = 1 / round5(V(h) / supply[asset](h)),
// V(h) = (h - missed) x $1 + missed x $0.67, floor to whole micro-denom. All PLACEHOLDER, pending vote.
// Exact decimal arithmetic (BigInt), matching catalog/src/pricing.py (Decimal): price rounded half-up
// to price_rounding_decimals, work units = raw x budget scale unrounded, micro = floor.
const frac = (x) => { const t = String(x); if (!/^\d+(\.\d+)?$/.test(t)) throw new Error('bad decimal ' + t); const [w, f = ''] = t.split('.'); return [BigInt(w + f), 10n ** BigInt(f.length)]; };
export function pricer(P, budgetScale) {
  const v = P.baseline.values, h = P.snapshot.height, missed = v.missed_blocks.value;
  const [vb, vbd] = frac(v.verified_block_value_usd.value), [mb, mbd] = frac(v.missed_block_value_usd.value);
  // V as a fraction Vn / Vd
  const Vd = vbd * mbd, Vn = (BigInt(h) - BigInt(missed)) * vb * mbd + BigInt(missed) * mb * vbd;
  const dec = BigInt(v.price_rounding_decimals.value), PD = 10n ** dec;
  const micro = { TERP: BigInt(P.snapshot.supply_micro.uterp), THIOL: BigInt(P.snapshot.supply_micro.uthiol) };
  // price x 10^dec = round_half_up(V / (supply_micro / 1e6) x 10^dec)
  const priceInt = (a) => { const num = Vn * 1000000n * PD, den = Vd * micro[a]; return (2n * num + den) / (2n * den); };
  const price = (a) => Number(priceInt(a)) / Number(PD);
  const ph = P.placeholders;
  return {
    paramsVersion: P.params_version, height: h, chainId: P.snapshot.chain_id, budgetScale,
    price,
    quote(tier, priority, asset) {
      const base = ph.base_work_units.value, tm = ph.tier_multiplier.value[tier], pm = ph.priority_multiplier.value[priority];
      if (tm == null || pm == null || !micro[asset]) return null;
      const parts = [base, tm, pm, budgetScale].map(frac);
      const wn = parts.reduce((m, [n]) => m * n, 1n), wd = parts.reduce((m, [, d]) => m * d, 1n);
      // micro = floor(wu / price x 1e6) = floor(wn/wd x 1e6 x PD / priceInt)
      const m = (wn * 1000000n * PD) / (wd * priceInt(asset));
      const wu = Number(wn) / Number(wd);
      return { asset, denom: P.assets[asset].denom, base, tierMultiplier: tm, priorityMultiplier: pm, raw: base * tm * pm, budgetScale, wu, price: price(asset), rate: 1 / price(asset), micro: m.toString(), amount: Number(m) / 1e6, label: LABEL };
    },
  };
}
export const loadPricing = (url) => getJSON(url);
