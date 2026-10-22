// about-unified.js — About › Overview and the stack's eight parts.
//
// The parts live on the About shield itself (lib/fractal/routes.js LEVELS['/about']):
// the overview in the centre orb (section "network") and the eight parts
// (consensus, tokens, governance, cosmwasm, accounts, ibc, apis, apps) on the inner
// orbs around it, each a section of the page like Resources' sections. The navigation
// mirrors the open one on <html data-tn-section>; this module shows that part in
// #about-network: its title once, its overview line, then its figure and details.
// Without the navigation (plain layout) everything shows, one part after the other.
// Old anchors: #about-overview, #about-network, #overview → #network (the centre orb);
// #nw-<id> and #network/<id> → #<id>.
//
// Per-category figures (public/figures/stack/<id>.svg) are fetched when their part opens
// and inlined, so their data-tf parts keep the hover/focus linking of the page's figures.
// They are fetched with cache: 'no-cache' (revalidate every time): with 'force-cache' a
// browser that once got a 404 for a figure (before the file existed) kept answering from
// that cached 404. A failed load is retried the next time the part opens.

const CATS = ['consensus', 'tokens', 'governance', 'cosmwasm', 'accounts', 'ibc', 'apis', 'apps'];
const ALIAS = /^(about-overview|about-network|overview)$/;
const docEl = document.documentElement;
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

function legacyHash() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  let to = null;
  if (ALIAS.test(h)) to = 'network';
  else if (/^nw-[a-z]+$/.test(h) && CATS.includes(h.slice(3))) to = h.slice(3);
  else if (/^network\/[a-z]+$/.test(h) && CATS.includes(h.slice(8))) to = h.slice(8);
  if (to) history.replaceState(history.state, '', location.pathname + location.search + '#' + to);
  return !!to;
}

const figCache = new Map();
function fetchSvg(url) {
  let p = figCache.get(url);
  if (!p) {
    p = fetch(url, { cache: 'no-cache' })
      .then((r) => (r.ok && /svg/.test(r.headers.get('content-type') || '') ? r.text() : null))
      .catch(() => null)
      .then((t) => { if (!t) figCache.delete(url); return t; });
    figCache.set(url, p);
  }
  return p;
}
function loadFig(slot) {
  const url = slot.dataset.catFig;
  const st = slot.dataset.catFigState;
  if (!url || st === 'ok' || st === 'loading') return;
  slot.dataset.catFigState = 'loading';
  fetchSvg(url).then((txt) => {
    const fail = () => { slot.dataset.catFigState = 'none'; };
    if (!txt || !/<svg[\s>]/.test(txt) || !slot.isConnected) return fail();
    const doc = new DOMParser().parseFromString(txt, 'image/svg+xml');
    const svg = doc.documentElement;
    if (!svg || svg.nodeName.toLowerCase() !== 'svg' || doc.querySelector('parsererror')) return fail();
    svg.querySelectorAll('script, foreignObject').forEach((n) => n.remove());
    for (const el of [svg, ...svg.querySelectorAll('*')]) for (const a of [...el.attributes]) {
      if (/^on/i.test(a.name) || (/href$/i.test(a.name) && /^\s*javascript:/i.test(a.value))) el.removeAttribute(a.name);
    }
    // the figures are being relabelled: no visible "FIG. N" plate numbers
    svg.querySelectorAll('text').forEach((t) => { if (/^\s*FIG\.\s*\d+\s*$/i.test(t.textContent)) t.remove(); });
    slot.replaceChildren(document.importNode(svg, true));
    slot.querySelectorAll('[data-tf]').forEach((el) => {
      const key = el.getAttribute('data-tf');
      const set = (on) => slot.querySelectorAll(`[data-tf="${CSS.escape(key)}"]`).forEach((n) => n.classList.toggle('tf-on', on));
      ['mouseenter', 'focusin'].forEach((t) => el.addEventListener(t, () => set(true)));
      ['mouseleave', 'focusout'].forEach((t) => el.addEventListener(t, () => set(false)));
    });
    slot.hidden = false;
    slot.dataset.catFigState = 'ok';
  });
}

let shown = null;
function apply() {
  const sec = document.getElementById('about-network');
  const root = sec?.querySelector('.cat-shield');
  if (!root) { shown = null; return; }
  const s = docEl.getAttribute('data-tn-section') || '';
  const world = docEl.getAttribute('data-tn-world') === 'panel';
  const id = !world ? null : CATS.includes(s) ? s : s === 'network' ? 'network' : null;
  if (id === shown && root.dataset.cat === (id ?? undefined)) return;
  const prev = shown;
  shown = id;
  if (!id) {
    delete sec.dataset.cat; delete root.dataset.cat;
    root.querySelectorAll('.is-cat').forEach((n) => n.classList.remove('is-cat'));
    root.querySelector('.cat-title').hidden = true;
    root.querySelectorAll('.cat-fig').forEach(loadFig);   // plain layout: every part shows
    return;
  }
  sec.dataset.cat = id; root.dataset.cat = id;
  root.querySelectorAll('.is-cat').forEach((n) => n.classList.remove('is-cat'));
  const title = root.querySelector('.cat-title');
  if (id === 'network') { title.hidden = true; root.querySelectorAll('.cat-fig-overview').forEach(loadFig); return; }
  root.querySelectorAll(`.cat-overview dd[data-tf="${id}"], [data-cat-panel="${id}"]`).forEach((n) => n.classList.add('is-cat'));
  const panel = root.querySelector(`[data-cat-panel="${id}"]`);
  title.textContent = panel.querySelector('h3')?.textContent || id;
  title.hidden = false;
  panel.querySelectorAll('.cat-fig').forEach(loadFig);
  if (prev && prev !== id && !reduced()) { panel.classList.remove('is-entering'); void panel.offsetWidth; panel.classList.add('is-entering'); }
}

new MutationObserver(apply).observe(docEl, { attributes: true, attributeFilter: ['data-tn-section', 'data-tn-world'] });
addEventListener('hashchange', () => { legacyHash(); apply(); });
// Overview figure: its orbs (data-cat-go) open their part through the shield's own hash
// navigation (#consensus, #tokens, …), the same as the shield orbs and the overview links.
function catGo(e) {
  const el = e.target.closest?.('.cat-fig [data-cat-go]');
  if (!el || (e.type === 'keydown' && e.key !== 'Enter' && e.key !== ' ')) return;
  const id = el.getAttribute('data-cat-go');
  if (!CATS.includes(id)) return;
  e.preventDefault();
  location.hash = '#' + id;
}
document.addEventListener('click', catGo);
document.addEventListener('keydown', catGo);
addEventListener('tn:navigated', () => { shown = null; setTimeout(() => { legacyHash(); apply(); }, 0); });
legacyHash();
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', apply, { once: true });
else apply();
