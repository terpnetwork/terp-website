// lib/bounties.js — Bounties loader.
//
//   mountBounties(el, CONFIG, opts)   CONFIG is the page config (window.__TERP_CONFIG)
//
// The /bounties page (pages/bounties.html) calls it with its <main id="bx">: the shield of the site
// navigation (lib/fractal/world.js, level /bounties, entered from Eco's "Community bounties" light)
// holds the nine categories, and the panel beside it holds the selected task and the Now / Next /
// Later kanban (graph v3.1 design). opts.stage = true draws the shield on its own stage instead.
//
// Loads its stylesheet (/public/bounties.css, at the build's content version) and the UI in
// /lib/bounties/. Data (chain1, no backend): the bounty board contract named in public/config.json
// chains[<id>].bounties.contract (LCD queries + CID documents verified in the browser), or, while that is
// empty, the bundled catalog (/public/data/bounties.json) shown as a draft preview. Nothing is signed from the
// page until the board's go-live; every action shows its exact message.
// Deep links: /bounties?bounty=<TB-…> selects the task; /eco#bounties and /eco?bounty=<TB-…> enter
// /bounties through the Eco orb.

const STYLE_ID = 'bx-styles';

async function styleHref() {
  // dist/public/asset-versions.json is written by build.js (same content hash it stamps into pages)
  try {
    const v = await fetch('/public/asset-versions.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : {}));
    const h = v['public/bounties.css'] || v._build;
    return h ? `/public/bounties.css?v=${h}` : '/public/bounties.css';
  } catch { return '/public/bounties.css'; }
}
function injectStyles() {
  if (document.getElementById(STYLE_ID)) return Promise.resolve();
  return styleHref().then((href) => new Promise((res) => {
    const l = document.createElement('link');
    l.id = STYLE_ID; l.rel = 'stylesheet'; l.href = href;
    l.onload = l.onerror = () => res();
    document.head.appendChild(l);
  }));
}

/** @param {HTMLElement} el @param {object} CONFIG */
export async function mountBounties(el, CONFIG = window.__TERP_CONFIG || {}, opts = {}) {
  if (!el) return null;
  if (el.__bx) { el.__bx.refresh(); return el.__bx; }
  if (el.__bxMounting) return el.__bxMounting;   // a second call before the first mount resolves
  el.__bxMounting = (async () => {
    await injectStyles();
    const m = await import('/lib/bounties/main.js');
    return m.mountBounties(el, CONFIG, opts);
  })().finally(() => { el.__bxMounting = null; });
  return el.__bxMounting;
}
