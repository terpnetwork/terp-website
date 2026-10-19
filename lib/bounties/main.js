// Bounties (terp.network port of graph v3.3). Two hosts:
//
//   nav mode (default for the /bounties page, pages/bounties.html): the page's <main id="bx"> sits next
//     to the site navigation (lib/fractal/world.js, level /bounties). Eco's "Community bounties" light
//     opens into this shield with the fractal entrance, and lib/bounties/shield.js draws the nine
//     categories inside the shield's inner lights (it reads their place from the navigation). This is
//     the graph v3.1 design (/workspace/terp/bounties/graph, app/v3/main.js) on the site.
//     State in the URL: #graph or #priorities (the W / E section lights), plus /<category> while a
//     category is open (e.g. #graph/ops), and ?bounty=<TB-…> for the selected task.
//   stage mode (opts.stage = true): the shield drawn inside a card on its own stage (the earlier inline
//     Eco card). Kept for reuse; the Eco page no longer mounts it.
//
// Terp only; every reward is "proposed, pending vote". Shareable: /bounties?bounty=<TB-…> selects the
// task and zooms to its category; /eco?bounty=<TB-…> and /eco#bounties enter through the Eco orb.
import { load, loadPricing, pricer, CAT_BY_KEY, catOf, LABEL } from '/lib/bounties/data.js';
import { mountShield } from '/lib/bounties/shield.js';
import { mountPanel } from '/lib/bounties/panel.js';
import { makeStore } from '/lib/bounties/store.js';
import { installDialogKeys } from '/lib/bounties/dialogs.js';
import { makeSubmit, makeCreate, makeApply } from '/lib/bounties/flows.js';
import { why } from '/lib/ui/why.js';
import { sessionAccount } from '/lib/bounties/chain.js';

const STAGE_TEMPLATE = `
  <p class="bx-source" id="bx-source" role="status">Loading bounties…</p>
  <div class="bxs-top">
    <div class="bxs-stage" id="bx-stage" role="group" aria-label="Bounty categories: nine orbs, one per category"></div>
    <div class="bxs-side">
      <div class="bx3-bar">
        <span class="bx-dim" id="bx-wallet"></span>
        <button type="button" class="plane-link" id="bx-create">Propose a bounty</button>
      </div>
      <article class="bx31-detail" id="bx-detail" aria-live="polite" aria-labelledby="bx-detail-title"></article>
    </div>
  </div>
  <section class="bx3-panel" id="bx-panel" aria-label="Bounty catalog">
    <h4 class="bx31-kh" id="bx-kanban-h">Now · Next · Later</h4>
    <form class="bx3-filters" id="bx-filters" role="search" aria-label="Filter bounties"></form>
    <p class="bx3-count" id="bx-count" aria-live="polite"></p>
    <div class="bx3-kanban" id="bx-kanban" aria-labelledby="bx-kanban-h"></div>
  </section>
  <div class="bx-shield" id="bx-shield" aria-label="Bounty categories"></div>`;

// nav mode: same parts as graph src/bounties.v3.body.html (used when the page has not rendered them)
const NAV_TEMPLATE = `
  <p class="bx-source" id="bx-source" role="status">Loading bounties…</p>
  <div class="bx3-bar">
    <span class="bx-dim" id="bx-wallet"></span>
    <button type="button" class="plane-link" id="bx-create">Propose a bounty</button>
  </div>
  <section class="bx3-panel" id="bx-panel" aria-label="Bounty catalog">
    <article class="bx31-detail" id="bx-detail" aria-live="polite" aria-labelledby="bx-detail-title"></article>
    <h2 class="bx31-kh" id="bx-kanban-h">Now · Next · Later</h2>
    <form class="bx3-filters" id="bx-filters" role="search" aria-label="Filter bounties"></form>
    <p class="bx3-count" id="bx-count" aria-live="polite"></p>
    <div class="bx3-kanban" id="bx-kanban" aria-labelledby="bx-kanban-h"></div>
  </section>
  <div class="bx-shield" id="bx-shield" aria-label="Bounty categories"></div>`;

const DEFAULTS = { catalog: '/public/data/bounties.json', pricing: '/public/data/bounties.pricing.json', escrowParams: '/public/data/bounties.escrow-params.json' };

/**
 * @param {HTMLElement} el  nav mode: the page's <main id="bx">; stage mode: an empty mount element
 * @param {object} CONFIG   the page config (window.__TERP_CONFIG)
 * @param {{ stage?: boolean }} [opts]
 */
export async function mountBounties(el, CONFIG = window.__TERP_CONFIG || {}, opts = {}) {
  if (!el) return null;
  if (el.__bx) { el.__bx.refresh(); return el.__bx; }
  const nav = !opts.stage;
  // chain1: the task list comes from the bounty board named in public/config.json chains[<site chain>].bounties
  // (data.js load), or, while that is empty, from the bundled catalog shown as a draft preview. No dev API.
  let root;
  if (nav) {
    root = el;
    root.classList.add('bx3');
    if (!root.querySelector('#bx-shield')) root.insertAdjacentHTML('beforeend', NAV_TEMPLATE);
  } else {
    root = document.createElement('div');
    root.className = 'bx3 bxs'; root.id = 'bx';
    root.innerHTML = STAGE_TEMPLATE;
    el.replaceChildren(root);
  }
  root.dataset.catalog = DEFAULTS.catalog;
  root.dataset.bxMode = nav ? 'nav' : 'stage';
  const api = { refresh: () => {}, root };
  el.__bx = api;

  const cfg = { catalog: DEFAULTS.catalog, pricing: DEFAULTS.pricing, escrowParams: DEFAULTS.escrowParams };
  const source = root.querySelector('#bx-source');
  let M, P;
  try { [M, P] = await Promise.all([load(cfg), loadPricing(cfg.pricing)]); }
  catch (e) { source.textContent = 'Could not load bounties: ' + e.message; return api; }
  if (!root.isConnected) return api;   // left the page while loading
  root.dataset.loaded = M.mode;
  if (M.board && M.board.contract) root.dataset.board = M.board.contract;
  const tag = Object.assign(document.createElement('span'), { className: 'bx-src bx-src--' + M.mode, textContent: M.mode === 'chain' ? 'On chain' : 'Draft preview' });
  source.replaceChildren(tag, M.mode === 'chain' ? ` ${M.all.length} bounties, read from the bounty board on ${M.chainId}.` : ` ${M.all.length} bounties. Rewards are proposed, pending vote.`);
  if (M.preview) source.append(why(M.preview.line, M.preview.why, { tone: M.chainError ? 'err' : 'blocked', id: 'bx-preview-why' }));
  const scale = M.all.find((n) => n.budgetScale)?.budgetScale ?? 1;
  const pricing = pricer(P, scale);
  const store = makeStore(M);
  let sel = null, wallet = null, stageCat = null, pendingOpt = {}, keepCat = null;

  // nav mode: the open category lives in the hash (#graph/<cat>), the single source of truth for the
  // shield zoom and the panel filter, as in graph v3; stage mode keeps it here.
  const parse = () => { const [s, c] = location.hash.replace(/^#/, '').split('/'); return { sec: s === 'priorities' ? 'priorities' : 'graph', cat: c && CAT_BY_KEY[c] ? c : null }; };
  const hashFor = (sec, c) => '#' + sec + (c ? '/' + c : '');
  const curCat = () => (nav ? parse().cat : stageCat);
  const ctx = {
    tab: () => 'kanban',   // v3.1: the kanban is the panel's only view (W and E both show it)
    setCat(key, opt = {}) {
      pendingOpt = opt;
      const next = key && CAT_BY_KEY[key] ? key : null;
      if (!nav) { stageCat = next; apply(); return; }
      const { sec, cat } = parse();
      if (next === cat) { apply(); return; }
      // a deep link (?bounty=) opens its category in place: Back then leaves the page, not the zoom
      if (opt.replace) { history.replaceState(history.state, '', hashFor(sec, next)); apply(); panel.render(); return; }
      location.hash = hashFor(sec, next);          // hashchange -> apply()
    },
    onSelect(id, opt = {}) {
      sel = id;
      const n = id && M.byId[id];
      const cat = curCat();
      const how = opt.deep ? { replace: true } : {};
      if (n && (opt.zoom || opt.deep) && cat && catOf(n).key !== cat) ctx.setCat(catOf(n).key, how);
      if (n && opt.deep && !cat) ctx.setCat(catOf(n).key, how);
      panel.open(id, opt.from === 'shield' || opt.zoom || opt.deep);
      shield.paintSel();
      syncUrl();
    },
    selected: () => sel,
    isMatch: (n) => panel.matchIgnoringCat(n),
    onFilter: () => shield.refresh(),
    openSubmit: (n, from) => submit(n, from),
    openApply: (n, from) => applyDlg(n, from),
    afterSubmit: () => panel.render(),
    wallet: () => wallet,
    setWallet: (w) => { wallet = w; paintWallet(); },
  };
  const panel = mountPanel(root, M, store, ctx);
  const shield = mountShield(root, root.querySelector('#bx-shield'), M, ctx, nav ? {} : { stage: root.querySelector('#bx-stage') });
  const submit = makeSubmit(root, M, store, ctx);
  const applyDlg = makeApply(root, M, store, ctx);
  const create = makeCreate(root, M, store, pricing, ctx);

  const walletEl = root.querySelector('#bx-wallet');
  async function paintWallet() {
    if (wallet) { walletEl.textContent = `Connected: ${wallet.address.slice(0, 12)}…${wallet.address.slice(-4)}`; store.refresh(wallet.address); return; }
    const s = await sessionAccount();
    if (s) store.refresh(s.address);
    walletEl.textContent = s ? `Connected: ${s.address.slice(0, 12)}…${s.address.slice(-4)}` : 'Browsing needs no wallet.';
  }
  paintWallet();
  import('/lib/wallet.js').then((W) => W.onWalletChange && W.onWalletChange(() => { if (!wallet || wallet.kind === 'signer') { wallet = null; paintWallet(); } })).catch(() => {});
  installDialogKeys(root);
  const createBtn = root.querySelector('#bx-create');
  createBtn.addEventListener('click', () => create(createBtn));

  function apply() {
    const opt = pendingOpt; pendingOpt = {};
    const cat = curCat();
    panel.setCat(cat);
    shield.setZoom(cat, opt);
  }
  if (nav) {
    // the navigation's own section lights (W List, E Now · Next · Later) keep the open category
    document.addEventListener('click', (e) => {
      if (!root.isConnected) return;
      if (e.target.closest && e.target.closest('#tn-world [data-key="sec:graph"], #tn-world [data-key="sec:priorities"]')) keepCat = { cat: parse().cat };
    }, true);
    addEventListener('hashchange', () => {
      if (!root.isConnected) return;
      if (keepCat) { const k = keepCat; keepCat = null; const { sec, cat } = parse(); if (cat !== k.cat) history.replaceState(history.state, '', hashFor(sec, k.cat)); }
      apply(); panel.render();
    });
  }
  // ?bounty=<id> in the address bar follows the selected task (shareable); other parameters are kept
  function syncUrl() {
    try {
      const u = new URL(location.href);
      if (sel && M.byId[sel]) u.searchParams.set('bounty', sel); else u.searchParams.delete('bounty');
      if (u.href !== location.href) history.replaceState(history.state, '', u.href);
    } catch { /* ignore */ }
  }
  // Esc: close a dialog (native), else zoom out of a category. From the overview the navigation's
  // own Esc goes back to Eco (nav mode). Stage mode: only while the card is on screen.
  addEventListener('keydown', (e) => {
    const cat = curCat();
    if (!root.isConnected || e.key !== 'Escape' || e.defaultPrevented || !cat) return;
    if (document.querySelector('dialog[open]')) return;
    if (!nav) { const r = root.getBoundingClientRect(); if (!r.width || r.bottom < 0 || r.top > innerHeight) return; }
    e.preventDefault(); e.stopImmediatePropagation(); ctx.setCat(null, { back: cat });
  }, true);
  store.on(() => shield.refresh());
  await store.refresh();
  apply(); panel.render();
  const want = new URLSearchParams(location.search).get('bounty');
  if (want && M.byId[want]) ctx.onSelect(want, { deep: true });
  api.refresh = () => { shield.schedule(); panel.render(); };
  window.__bx3 = { get state() { return { host: nav ? 'nav' : 'stage', mode: M.mode, label: M.label, loaded: true, sec: nav ? parse().sec : 'priorities', cat: curCat(), sel, wallet, shield: shield.state, filters: panel.filters, label2: LABEL }; }, pricing, M };
  return api;
}
