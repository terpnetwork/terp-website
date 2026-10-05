// Home navigation for terp.network: the Terp mark as a field of light.
//
// Each section is a soft glow placed on the 13-dot mark. Hovering (or
// focusing) a glow brightens its edge while its inner dots converge into one
// core; opening it expands the glow to fill the view and bursts the core out
// into the next level's dots. Going back plays the same motion in reverse.
//
// Every control on a level is one of these glows (lib/fractal/routes.js
// LEVELS): sections, the installer on the start page, the Resources sections
// and its way back home, and on /eco the project catalog itself (entries,
// previous/next, category filter), kept in step with lib/ecosystem.js.
//
// Session-level module (see PERSISTENT_STACK_RE in lib/shell/shell.js): it is
// evaluated once, its stage is a [data-tn-persist] node that survives soft
// navigation, and it registers the router's transition hook
// (__tnShell.setTransition) so the motion plays while the next page loads.
// Page content stays real HTML; this only decides where it sits (html
// [data-tn-world]) and animates between routes. Without JS, or with
// ?fractal=0 (kept for the session), pages render in their plain layout.
//
// Rendering: one <canvas> at device resolution (up to 2x). Glows are radial
// gradients drawn in their own unit space, so they stay sharp at any zoom; the
// merging dots are a CPU metaball field sampled at up to device resolution.
// rAF runs only while something moves.

import { ROUTES as SRC, SLOTS, LEVELS, TAG_COLORS } from '/lib/fractal/routes.js';

const shell = window.__tnShell || null;
const docEl = document.documentElement;
const mqReduce = matchMedia('(prefers-reduced-motion: reduce)');
let reduced = mqReduce.matches;

// ── title word rotator (home hero) ──────────────────────────────────────────
// Word list and rhythm from the homepage: 2 s hold, then a 0.5 s slide every
// 2.5 s. Reduced motion: slow crossfade. Paused while the tab is hidden.
const rotator = (() => {
  let list = null, words = 0, i = 0, timer = 0, snap = 0;
  const items = () => [...list.children];
  const mark = () => items().forEach((w, j) => w.classList.toggle('is-on', j === i));
  function layout() {
    const box = list.parentElement;
    box.classList.add('is-snap');
    box.classList.toggle('is-fade', reduced);
    list.style.transition = 'none';
    list.style.transform = reduced ? 'none' : `translateY(${-i * 1.3}em)`;
    mark();
    void list.offsetHeight;
    list.style.transition = '';
    box.classList.remove('is-snap');
  }
  function step() {
    if (!list || !list.isConnected) return stop();
    if (reduced) { i = (i + 1) % words; mark(); return; }
    i++;
    list.style.transform = `translateY(${-i * 1.3}em)`;
    mark();
    if (i === words) snap = setTimeout(() => { i = 0; layout(); }, 520);
  }
  function stop() { clearTimeout(timer); clearTimeout(snap); timer = 0; }
  function start(delay) {
    stop();
    if (!list || document.hidden) return;
    const every = reduced ? 4000 : 2500;
    timer = setTimeout(function run() { step(); if (list) timer = setTimeout(run, every); }, delay);
  }
  function sync() {
    const el = document.getElementById('rotator');
    if (el === list) return;
    stop(); list = el; i = 0;
    if (!list) return;
    words = list.children.length;
    if (!list.dataset.ready) { list.appendChild(list.children[0].cloneNode(true)); list.dataset.ready = '1'; }
    layout(); start(2000);
  }
  document.addEventListener('visibilitychange', () => (document.hidden ? stop() : start(2500)));
  mqReduce.addEventListener?.('change', () => { if (!list) return; if (i >= words) i = 0; layout(); start(2500); });
  return { sync };
})();

// ── escape hatch ────────────────────────────────────────────────────────────
const OFF = (() => {
  try {
    const q = new URLSearchParams(location.search).get('fractal');
    if (q === '0') sessionStorage.setItem('tn-fractal', '0');
    else if (q === '1') sessionStorage.removeItem('tn-fractal');
    return sessionStorage.getItem('tn-fractal') === '0';
  } catch { return false; }
})();

const ctx0 = OFF ? null : document.createElement('canvas').getContext('2d');
if (!ctx0) {
  rotator.sync();
  if (shell && shell.setTransition) shell.setTransition({ start: () => null, swapped: () => rotator.sync() });
} else {
  boot();
}

function boot() {
  // ── geometry (same glyph as the Terp mark) ────────────────────────────────
  const R = 8.7, EXT = 48 + R, INNER = 0.12;
  const SLOT_KEYS = Object.keys(SLOTS);
  const ROUTES = {};
  for (const [id, n] of Object.entries(SRC)) ROUTES[id] = { ...n, id, home: n.slot };
  const isPage = (id) => !!id && !!ROUTES[id] && !ROUTES[id].external;
  const routeOf = (p) => (shell ? shell.routeOf(p) : (p.replace(/\/+$/, '').replace(/\.html$/, '') || '/'));

  // ── DOM ───────────────────────────────────────────────────────────────────
  const stage = document.createElement('div');
  stage.id = 'tn-world';
  stage.setAttribute('data-tn-persist', '');
  stage.innerHTML = '<canvas class="tnw-canvas" aria-hidden="true"></canvas>' +
    '<nav class="tnw-crumbs" aria-label="Breadcrumb"><ol></ol></nav>' +
    '<nav class="tnw-portals" aria-label="Sections"></nav>' +
    '<p class="tnw-caption" aria-live="polite" hidden></p>';
  const preview = document.createElement('div');
  preview.id = 'tn-world-preview';
  preview.setAttribute('data-tn-persist', '');
  preview.setAttribute('aria-hidden', 'true');
  document.body.prepend(stage);
  document.body.appendChild(preview);
  const cv = stage.querySelector('canvas'), portalsEl = stage.querySelector('.tnw-portals'), crumbsEl = stage.querySelector('ol');
  const captionEl = stage.querySelector('.tnw-caption');
  const ctx = cv.getContext('2d');

  // ── colour ────────────────────────────────────────────────────────────────
  const rawHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
  const cl = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  // Colour is worked out in OKLCH (perceptual lightness, chroma, hue), so a
  // glow can gain saturation or lightness without drifting in hue or greying
  // out. The section colours in routes.js are pastels (high L, low C); each
  // theme re-renders them at its own lightness and chroma (tokens in
  // global.css), keeping the hue (or folding it onto the theme's palette).
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
  const enc = (v) => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055);
  function toOklch([r8, g8, b8]) {
    const r = lin(r8), g = lin(g8), b = lin(b8);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
    const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
    const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
    return [L, Math.hypot(A, B), ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360];
  }
  function oklchLin(L, C, h) {
    const A = C * Math.cos((h * Math.PI) / 180), B = C * Math.sin((h * Math.PI) / 180);
    const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3, m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3, s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
    return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
  }
  // In-gamut sRGB: keep L and h, lower C until the colour fits (no hue shift from clipping).
  function fromOklch(L, C, h) {
    L = cl(L);
    const fits = (v) => v[0] >= -1e-4 && v[0] <= 1.0001 && v[1] >= -1e-4 && v[1] <= 1.0001 && v[2] >= -1e-4 && v[2] <= 1.0001;
    let c = oklchLin(L, C, h);
    if (!fits(c)) { let lo = 0, hi = C; for (let i = 0; i < 12; i++) { const mid = (lo + hi) / 2; if (fits(oklchLin(L, mid, h))) lo = mid; else hi = mid; } c = oklchLin(L, lo, h); }
    return c.map((v) => Math.round(cl(enc(cl(v)), 0, 255)));
  }
  // Theme (html[data-theme], tokens in global.css): the canvas background,
  // the accent, how lights combine, and how each section colour is drawn.
  //   glow     dark field, additive light (the default look)
  //   fractal  dark field, colours folded onto the permissionless.money
  //            hopalong palette (#b1ebeb points to #bd93f9 strokes)
  //   ink      paper field, section colours as deepened tints. On paper a light
  //            is drawn as a tinted disc (see "orbs" below): colour densest at
  //            the centre, thinning toward a defined edge, never a ring or a negative.
  // --tn-orb-color: oklch (set by the Permissionless theme only) switches to the
  // OKLCH renderer: section colours re-rendered at --tn-orb-lc (body lightness,
  // chroma), each light a soft core (--tn-orb-core: lightness lift, chroma share),
  // its body and a deeper, more saturated halo, after the neonglow filter of the
  // Terp SVG collection; blended with --tn-orb-blend (screen: adds light but rolls
  // off before white, so overlaps keep their hue). Every other theme draws exactly
  // as before.
  const FRACTAL_A = [177, 235, 235], FRACTAL_B = [189, 147, 249];
  let TH = null, BG = [11, 15, 13], QUIET = [52, 92, 70], WHITE = [255, 255, 255], ACCENT = [152, 232, 193], DEEP = [40, 120, 90], HOTC = 255;
  const hexCache = new Map(), lightCache = new Map(), quietCache = new Map();
  function hueOf([r, g, b]) {
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
    if (!d) return 0;
    const h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return ((h * 60) + 360) % 360;
  }
  function themeColor(c) {
    if (TH && TH.ok) {
      const [L0, C0, h0] = toOklch(c);
      const [L, C] = TH.lc, rel = cl(C0 / 0.1, 0.3, 1.15); // pale controls stay quieter than true colours
      let h = h0;
      if (TH.mode === 'fractal') { const t = (1 - Math.cos((h0 / 360) * 2 * Math.PI)) / 2; h = TH.hueA + (TH.hueB - TH.hueA) * t; }
      return fromOklch(L + (L0 - 0.9) * 0.25, C * rel, h);
    }
    if (!TH || TH.mode === 'glow') return c;
    if (TH.mode === 'fractal') return mix(FRACTAL_A, FRACTAL_B, (1 - Math.cos((hueOf(c) / 360) * 2 * Math.PI)) / 2);
    return mix(mix(c, [0, 0, 0], TH.paper ? 0.3 : 0.45), TH.accent, TH.inkA); // ink (--tn-orb-ink-accent: share of the accent; paper deepens less so a light stays clean, not muddy)
  }
  // OKLCH renderer: a light's three colours, a soft core (its brightest part), its
  // body (the theme colour) and a deeper, more saturated outer halo.
  function lightOf(rgb) {
    const key = rgb.join(',');
    let v = lightCache.get(key);
    if (!v) {
      const [L, C, h] = toOklch(rgb), [cL, cC] = TH.core;
      v = {
        core: fromOklch(Math.min(0.985, L + cL), C * cC, h),
        body: rgb,
        halo: fromOklch(L - 0.1, C * 1.18, h),
      };
      lightCache.set(key, v);
    }
    return v;
  }
  const hex = (h) => { let v = hexCache.get(h); if (!v) { v = themeColor(rawHex(h)); hexCache.set(h, v); } return v; };
  const BLENDS = ['lighter', 'multiply', 'screen', 'source-over'];
  function readTheme() {
    const cs = getComputedStyle(docEl);
    const nums = (n, k, d) => { const t = cs.getPropertyValue(n).trim(), v = t ? t.split(/[\s,]+/).map(Number) : []; return v.length === k && v.every(Number.isFinite) ? v : d; };
    const mode = cs.getPropertyValue('--tn-orb-mode').trim(), blend = cs.getPropertyValue('--tn-orb-blend').trim();
    return {
      ok: cs.getPropertyValue('--tn-orb-color').trim() === 'oklch',
      paper: mode === 'ink' && cs.getPropertyValue('--tn-orb-color').trim() !== 'oklch',
      inkA: nums('--tn-orb-ink-accent', 1, [0.35])[0],
      mode: mode === 'ink' || mode === 'fractal' ? mode : 'glow',
      bg: nums('--tn-canvas-rgb', 3, [11, 15, 13]),
      accent: nums('--tn-teal-rgb', 3, [152, 232, 193]),
      blend: BLENDS.includes(blend) ? blend : 'lighter',
      lc: nums('--tn-orb-lc', 2, [0.84, 0.14]),
      core: nums('--tn-orb-core', 2, [0.12, 0.75]),
      hueA: toOklch(FRACTAL_A)[2], hueB: toOklch(FRACTAL_B)[2],
    };
  }
  function applyTheme() {
    TH = readTheme();
    hexCache.clear(); lightCache.clear(); quietCache.clear();
    BG = TH.bg;
    if (TH.ok) {
      ACCENT = TH.mode === 'glow' ? hex('#98e8c1') : fromOklch(TH.lc[0] + 0.04, TH.lc[1] * 0.75, TH.hueA);
      QUIET = TH.mode === 'glow' ? [52, 92, 70] : mix(BG, ACCENT, 0.28);
      WHITE = [255, 255, 255];
      DEEP = TH.mode === 'glow' ? [40, 120, 90] : mix(BG, ACCENT, 0.45);
      HOTC = 255;
      return;
    }
    ACCENT = TH.mode === 'glow' ? rawHex('#98e8c1') : TH.accent;
    const ink = TH.mode === 'ink';
    QUIET = TH.mode === 'glow' ? [52, 92, 70] : mix(BG, ACCENT, ink ? 0.42 : 0.28);
    WHITE = [255, 255, 255]; // paper too: highlights lift toward white, never toward the ink
    DEEP = TH.mode === 'glow' ? [40, 120, 90] : mix(BG, ACCENT, ink ? 0.85 : 0.45);
    HOTC = 255;
  }
  applyTheme();
  // OKLCH renderer, empty slots: the level's own hue, quieter (lower chroma), never a grey mix.
  function quietOf(rgb) {
    const k = rgb.join(',');
    let v = quietCache.get(k);
    if (!v) { const [L, C, h] = toOklch(rgb); v = fromOklch(L - 0.14, C * 0.9, h); quietCache.set(k, v); }
    return v;
  }
  const colorFor = (level, item) => (item ? hex(item.color) : TH.ok ? quietOf(hex(level.color)) : mix(QUIET, hex(level.color), 0.35));

  // ── level items: every control drawn in a slot ────────────────────────────
  // kind: route (a section page or external section), action, up, section,
  // entry (catalog project), prev / next / filter (catalog controls).
  const CAT = LEVELS['/eco'] && LEVELS['/eco'].catalog;
  const PAGE_SIZE = CAT ? CAT.slots.length : 0;
  let eco = null, ecoApi = null, ecoLoading = null, ecoPage = 0, ecoDirty = false;
  let section = null, installOpen = false, menuOpen = false;
  const itemsCache = new Map();
  const HOME_ITEM = { slot: 'N', kind: 'up', id: 'up:home', to: '/', label: 'Home', color: '#cfffcf', desc: 'Back to the Terp Network start page.' };
  // Controls that point somewhere draw an arrow out of their inner lights.
  // Direction controls draw a thin chevron of five small lights (units: the inner-light grid, 25 = one step).
  const CHEV = [[-22, 9], [-11, -2], [0, -13], [11, -2], [22, 9]];
  const ARROWS = { up: CHEV, prev: CHEV.map(([x, y]) => [y, x]), next: CHEV.map(([x, y]) => [-y, x]) };
  const arrowOf = (it) => (it && ARROWS[it.kind]) || null;
  function routeItem(id) {
    const n = ROUTES[id];
    return { slot: n.home, kind: 'route', key: id, id, route: n.external ? null : id, label: n.label, desc: n.desc, color: n.color, external: !!n.external, href: n.href };
  }
  const extSection = (url) => Object.values(ROUTES).find((r) => r.external && url && url.replace(/\/+$/, '') === r.href);
  function entryItem(p, slot) {
    let route = null, href = null;
    for (const l of p.links || []) {
      const u = l.url || '';
      if (!route && /^\/(?!\/)/.test(u)) { const r = routeOf(new URL(u, location.origin).pathname); if (isPage(r)) route = r; }
      if (!href && /^https:\/\//.test(u)) href = u;
    }
    const ext = !route && extSection(href);
    return {
      slot, kind: 'entry', key: 'entry:' + p.id, project: p, route, href: ext ? ext.href : href, ext: !!ext,
      label: p.title, desc: p.summary || p.description || '', color: TAG_COLORS[(p.tags || [])[0]] || '#cfffcf',
      soon: !!p.status && p.status !== 'live', status: p.status || 'live', tags: p.tags || [], component: p.component || null,
    };
  }
  function ecoItems() {
    const out = new Map(), list = eco && eco.list;
    if (!list) { for (const c of ROUTES['/eco'].children || []) { const it = routeItem(c); out.set(it.slot, it); } return out; }
    ecoPage = Math.max(0, Math.min(ecoPage, Math.ceil(list.length / PAGE_SIZE) - 1));
    list.slice(ecoPage * PAGE_SIZE, (ecoPage + 1) * PAGE_SIZE).forEach((p, i) => out.set(CAT.slots[i], entryItem(p, CAT.slots[i])));
    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE)), one = pages < 2;
    out.set(CAT.prev, { slot: CAT.prev, kind: 'prev', key: 'eco:prev', label: 'Previous', name: `Previous page (page ${ecoPage + 1} of ${pages})`, desc: one ? 'Everything fits on this page.' : 'Show the previous page of projects.', color: '#d8efe0', dim: one });
    out.set(CAT.next, { slot: CAT.next, kind: 'next', key: 'eco:next', label: 'Next', name: `Next page (page ${ecoPage + 1} of ${pages})`, desc: one ? 'Everything fits on this page.' : 'Show the next page of projects.', color: '#d8efe0', dim: one });
    const tags = eco.filters.tags, tag = tags.length === 1 ? tags[0] : tags.length ? tags.length + ' tags' : 'All categories';
    out.set(CAT.filter, { slot: CAT.filter, kind: 'filter', key: 'eco:filter', label: tag, name: `Filter projects by category (now: ${tags.length ? tags.join(', ') : 'all'})`, desc: 'Show only the projects with one tag.', color: TAG_COLORS[tag] || '#dfeee4' });
    return out;
  }
  function itemsOf(id) {
    let m = itemsCache.get(id);
    if (m) return m;
    if (id === '/eco' && CAT) m = ecoItems();
    else { m = new Map(); for (const c of (ROUTES[id] && ROUTES[id].children) || []) { const it = routeItem(c); m.set(it.slot, it); } }
    for (const it of (LEVELS[id] && LEVELS[id].items) || []) m.set(it.slot, { ...it, key: it.id, route: it.kind === 'up' ? it.to : null });
    // Every page below the start page: the top slot goes back to the start page.
    if (id !== '/' && isPage(id) && !m.has('N')) m.set('N', { ...HOME_ITEM, key: HOME_ITEM.id, route: '/' });
    itemsCache.set(id, m);
    return m;
  }
  const itemAt = (id, slot) => itemsOf(id).get(slot) || null;
  const itemByKey = (key) => { for (const it of itemsOf(current).values()) if (it.key === key) return it; return null; };
  // Section pages sit where their control is (catalog entries move with paging and filters).
  function relayout() {
    for (const n of Object.values(ROUTES)) n.x = undefined;
    const place = (id) => {
      const n = ROUTES[id];
      if (n.x !== undefined) return n;
      if (!n.parent) { n.x = 0; n.y = 0; n.k = 1; n.slot = null; return n; }
      const p = place(n.parent);
      let slot = n.home;
      for (const it of itemsOf(n.parent).values()) if ((it.kind === 'route' || it.kind === 'entry') && (it.key === id || it.route === id)) { slot = it.slot; break; }
      const [sx, sy] = SLOTS[slot];
      n.slot = slot; n.x = p.x + sx * p.k; n.y = p.y + sy * p.k; n.k = p.k * INNER;
      return n;
    };
    Object.keys(ROUTES).forEach(place);
  }
  function refreshItems() { itemsCache.clear(); relayout(); }
  relayout();
  const slotPos = (P, slot) => [P.x + SLOTS[slot][0] * P.k, P.y + SLOTS[slot][1] * P.k];
  function selectedKeys() {
    const out = [];
    if (current === '/' && installOpen) out.push('act:install');
    if (hasSections(current) && section) out.push('sec:' + section);
    if (current === '/eco' && menuOpen) out.push('eco:filter');
    if (current === '/eco' && eco && eco.selected) out.push('entry:' + eco.selected);
    return out;
  }

  // ── orbs: one disc each, never stacked ────────────────────────────────────
  // Every orb is ONE radial fill. Inside its disc the theme's light is already
  // composited onto the background (opaque colours), so orbs never mix with
  // each other or with anything drawn under them. Outside the disc a short
  // halo ends before it reaches the next orb (slots are at least 23 units
  // apart, halos end at 11.3), so no two orb fills ever overlap. Transitions
  // use the same discs: they scale and occlude, they never cross-fade bodies.
  // The light's shape inside the disc keeps each theme's character:
  // glow / fractal  additive light, bright rim (old ring look), soft core
  // OKLCH           core -> body -> halo ramp after the neonglow filter
  // paper           colour densest at the centre, thinning to the edge
  const ORB_STOPS = [[0, 1], [0.2, 0.78], [0.45, 0.5], [0.7, 0.32], [0.9, 0.24], [0.99, 0.2], [1.06, 0.1], [1.4, 0.05], [2.6, 0]];
  const RIM_STOPS = [[0, 0], [0.72, 0], [0.9, 0.35], [0.985, 1], [1.06, 0.5], [1.25, 0.16], [1.55, 0.05], [1.9, 0]];
  const PAPER_STOPS = [[0, 1], [0.35, 0.9], [0.7, 0.68], [0.92, 0.52], [1, 0.46], [1.1, 0.12], [1.3, 0]];
  const HALO = 11.3 / R; // outer end of a halo, in disc radii (half the closest slot spacing, minus a margin)
  const EDGE = 0.06;      // the disc's soft edge, in disc radii
  const HOV_GROW = 0.02;  // a hovered disc grows this much (keeps halos apart)
  const lerp3 = (a, b, t) => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t));
  // OKLCH renderer, colour along a light: core (centre) -> body -> deeper halo.
  function rampAt(L, d) {
    if (d <= 0.08) return L.core;
    if (d <= 0.5) return lerp3(L.core, L.body, (d - 0.08) / 0.42);
    if (d <= 1.0) return L.body;
    return lerp3(L.body, L.halo, Math.min(1, (d - 1.0) / 0.4));
  }
  function paperOf(rgb) {
    const W1 = [255, 255, 255];
    return { core: mix(rgb, W1, 0.02), body: mix(rgb, W1, 0.2), halo: mix(rgb, W1, 0.45) };
  }
  function stopAt(stops, d) {
    if (d <= stops[0][0]) return stops[0][1];
    for (let i = 1; i < stops.length; i++) {
      const [d1, a1] = stops[i];
      if (d <= d1) { const [d0, a0] = stops[i - 1]; return a0 + (a1 - a0) * ((d - d0) / (d1 - d0)); }
    }
    return 0;
  }
  // One light composited onto a colour with the theme's blend (per channel, 0..255).
  function blendPx(dst, src, a) {
    a = clamp(a);
    const m = TH.blend;
    return [0, 1, 2].map((i) => {
      const d = dst[i], s = src[i];
      const v = m === 'lighter' ? d + s * a : m === 'screen' ? 255 - ((255 - d) * (255 - s * a)) / 255
        : m === 'multiply' ? d * (1 - a + (a * s) / 255) : d + (s - d) * a;
      return Math.round(clamp(v, 0, 255));
    });
  }
  // The light of an orb at distance d (in disc radii), composited onto the background.
  function litAt(rgb, d, hov, k, bg = BG) {
    let c = bg;
    if (TH.paper) {
      const L = paperOf(rgb);
      return blendPx(c, rampAt(L, d), k * (0.5 + 0.28 * hov) * stopAt(PAPER_STOPS, d));
    }
    const L = TH.ok ? lightOf(rgb) : null;
    c = blendPx(c, L ? rampAt(L, d) : rgb, k * (0.72 - 0.5 * hov) * stopAt(ORB_STOPS, d));
    return blendPx(c, L ? (d < 1 ? L.body : L.halo) : rgb, k * rimA(hov) * stopAt(RIM_STOPS, d));
  }
  const looks = new Map();
  // halo: 0..1, the share of the halo drawn (0 while another orb's fill is under this one).
  // bg: the background under the orb (the level's wash at its centre), so the disc and halo sit on it exactly.
  function look(rgb, hov, k, halo, bg) {
    const hq = Math.round(hov * 20), kq = Math.round(k * 40), aq = Math.round(halo * 10);
    const key = `${rgb}|${hq}|${kq}|${aq}|${bg}`;
    let g = looks.get(key);
    if (!g) {
      const h = hq / 20, kk = kq / 40, ha = aq / 10, ext = ha > 0 ? HALO : 1 + EDGE;
      const H0 = (TH.paper ? 0.22 : 0.85) * ha; // halo strength just outside the edge
      g = ctx.createRadialGradient(0, 0, 0, 0, 0, ext);
      const add = (d, a) => { const c = litAt(rgb, d, h, kk, bg); g.addColorStop(Math.min(1, d / ext), `rgba(${c},${a})`); };
      for (let i = 0; i <= 16; i++) add((i / 16) * (1 - EDGE * 0.5), 1);
      if (ha > 0) {
        add(1 + EDGE * 0.5, H0);
        for (let i = 1; i <= 6; i++) { const d = 1 + EDGE * 0.5 + (i / 6) * (HALO - 1 - EDGE * 0.5); add(d, H0 * (1 - sm(i / 6))); }
      } else add(1 + EDGE * 0.5, 0);
      if (looks.size > 800) looks.clear();
      looks.set(key, g);
    }
    return g;
  }
  // The background under a point: the level's wash (same gradient draw() paints), quantized.
  let washG = null;
  function bgAt(x, y) {
    if (!washG) return BG;
    const c = lerp3(washG.c0, BG, clamp(Math.hypot(x - washG.gx, y - washG.gy) / washG.gR));
    return c.map((v) => v - (v % 2));
  }
  // Every orb drawn in the last frame (for automated overlap checks).
  let orbLog = [];
  // k: brightness of the light (dim and empty slots are quieter, still opaque);
  // o.alpha: opacity of the whole orb (fading out over the background only);
  // o.halo: share of the halo (0..1).
  function orb(rgb, x, y, r, k = 1, hov = 0, o = {}) {
    const alpha = o.alpha ?? 1, halo = clamp(o.halo ?? 1);
    if (alpha <= 0.004 || r < 0.3) return;
    const rd = r * (1 + HOV_GROW * hov), ext = (halo > 0.05 ? HALO : 1 + EDGE) * rd;
    if (x + ext < 0 || y + ext < 0 || x - ext > W || y - ext > H) return;
    ctx.globalAlpha = clamp(alpha);
    ctx.setTransform(DPR * rd, 0, 0, DPR * rd, DPR * x, DPR * y);
    ctx.fillStyle = look(rgb, hov, k, halo > 0.05 ? halo : 0, bgAt(x, y));
    ctx.beginPath(); ctx.arc(0, 0, ext / rd, 0, 2 * Math.PI); ctx.fill();
    orbLog.push({ x, y, r: rd, ext, alpha, halo: halo > 0.05 ? halo : 0, key: o.key || null });
  }

  // ── canvas + camera ───────────────────────────────────────────────────────
  let W = 0, H = 0, DPR = 1, DPR_FULL = 1, lowRes = false, slowMotion = false, slow = 0, needFull = true;
  // Device resolution (retina up to 2x). Only very large screens trade a
  // little resolution (never below 1x) to bound fill cost. If a device can't
  // keep up while the view is moving, crossings render at a lower resolution
  // (the picture is in motion) and it snaps back to full resolution at rest.
  const PX_MAX = 8.3e6;
  function applyRes() {
    const d = lowRes ? Math.max(1, DPR_FULL * 0.6) : DPR_FULL;
    if (d === DPR && cv.width === Math.round(W * d) && cv.height === Math.round(H * d)) return;
    DPR = d; needFull = true;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR);
    looks.clear();
  }
  function sizeCanvas() {
    W = innerWidth; H = innerHeight;
    docEl.style.setProperty('--tnw-h', H + 'px');
    DPR_FULL = Math.max(1, Math.min(devicePixelRatio || 1, 2, Math.sqrt(PX_MAX / (W * H))));
    applyRes();
  }
  const wide = () => W >= 900;
  const leftW = () => Math.min(560, Math.max(300, W * 0.38)); // keep in sync with --tnw-left in world.css
  const chromeBottom = () => { const b = document.querySelector('.site-chrome'); const r = b && b.getBoundingClientRect(); return r && r.height ? Math.round(r.bottom) : 0; };
  // Home: the mark sits between the top navigation and the landing copy
  // (measured while home is on screen; estimated before the first visit).
  let homeGeom = null;
  function measureHome() {
    if (mode !== 'home') return;
    const bar = chromeBottom();
    const acct = document.querySelector('#tn-wallet-modal.open');
    const parts = [...(acct ? [acct] : document.querySelectorAll('body > .container > :not(.site-chrome-wrap):not(.footer):not([hidden])'))]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height)
      .map((r) => ({ left: r.left, top: r.top, right: r.right, bottom: r.bottom }));
    homeGeom = { W, H, top: bar ? Math.max(48, bar + 30) : 64, parts };
  }
  // Boxes covered by the mark (glows and their labels) when drawn in rect r.
  function markBoxes(r) {
    const half = (Math.min(r.w, r.h) * r.fill) / 2, cx = r.x + r.w / 2, cy = r.y + r.h / 2, k = half / EXT, out = [];
    for (const slot of SLOT_KEYS) {
      const [sx, sy] = SLOTS[slot], x = cx + sx * k, y = cy + sy * k, rr = R * k * 1.1;
      out.push([x - rr, y - rr, x + rr, y + rr]);
      if (slot === 'W') out.push([x - rr - 96, y - 14, x - rr, y + 14]);
      if (slot === 'E') out.push([x + rr, y - 14, x + rr + 110, y + 14]);
      if (slot === 'N') out.push([x - 50, y - rr - 32, x + 50, y - rr]);
      if (slot === 'S') out.push([x - 50, y + rr, x + 50, y + rr + 32]);
    }
    return out;
  }
  const PAD = 12;
  const markFits = (r, parts) => markBoxes(r).every(([l, t, rt, b]) => l >= 4 && rt <= W - 4 &&
    parts.every((p) => rt <= p.left - PAD || l >= p.right + PAD || b <= p.top - PAD || t >= p.bottom + PAD));
  function homeRect() {
    const fill = W < 600 ? 0.8 : 0.84;
    const g = homeGeom && homeGeom.W === W && homeGeom.H === H ? homeGeom
      : { top: wide() ? 56 : 72, parts: [{ left: 0, top: H - Math.min(wide() ? 330 : 430, H * 0.5), right: Math.min(W, 460), bottom: H }] };
    const copyTop = Math.min(H, ...g.parts.map((p) => p.top));
    const above = { x: 0, y: g.top, w: W, h: Math.max(140, copyTop - 8 - g.top), fill };
    if (!wide()) return above;
    // Centered over the whole view, shrinking a little if the landing copy is in the way…
    for (const f of [fill, 0.76, 0.68, 0.6]) {
      const full = { x: 0, y: g.top, w: W, h: H - 40 - g.top, fill: f };
      if (markFits(full, g.parts)) return full;
    }
    // …otherwise the larger free area: above the copy, or beside it.
    const copyRight = Math.max(0, ...g.parts.map((p) => p.right));
    const beside = { x: copyRight + 16 + 96, y: g.top, w: Math.max(140, W - copyRight - 16 - 96 - 110), h: H - 40 - g.top, fill };
    return Math.min(beside.w, beside.h) > Math.min(above.w, above.h) ? beside : above;
  }
  // Wide pages keep a band under the mark free for cards (they never cover a control).
  const ZONE = 200;
  const isLeaf = (id) => ![...itemsOf(id).values()].some((i) => i.kind !== 'up');
  function stageRect(id) {
    if (id === '/') return homeRect();
    const leaf = isLeaf(id);
    if (wide()) {
      const y = Math.max(56, chromeBottom() + 30), full = H - y;
      return { x: 0, y, w: leftW(), h: leaf ? full : Math.max(full * 0.62, full - ZONE), fill: leaf ? 0.66 : 0.76 };
    }
    const top = Math.max(8, chromeBottom()) + 6;
    return { x: 0, y: top, w: W, h: H * 0.34 + 32, fill: leaf ? 0.72 : 0.8 };
  }
  function fit(id) {
    const n = ROUTES[id], s = stageRect(id);
    const p = (Math.min(s.w, s.h) * s.fill) / (2 * EXT * n.k);
    return { x: n.x - (s.x + s.w / 2 - W / 2) / p, y: n.y - (s.y + s.h / 2 - H / 2) / p, w: W / p };
  }
  let cam = null;
  const scale = () => W / cam.w;
  const project = (x, y, c = cam) => { const s = W / c.w; return [(x - c.x) * s + W / 2, (y - c.y) * s + H / 2]; };
  function interpolateZoom([ux0, uy0, w0], [ux1, uy1, w1], rho = Math.SQRT2) {
    const dx = ux1 - ux0, dy = uy1 - uy0, d2 = dx * dx + dy * dy, rho2 = rho * rho, rho4 = rho2 * rho2;
    if (d2 < 1e-12 * w0 * w0) { const S = Math.log(w1 / w0) / rho; return (t) => [ux0 + t * dx, uy0 + t * dy, w0 * Math.exp(rho * t * S)]; }
    const d1 = Math.sqrt(d2);
    const b0 = (w1 * w1 - w0 * w0 + rho4 * d2) / (2 * w0 * rho2 * d1), b1 = (w1 * w1 - w0 * w0 - rho4 * d2) / (2 * w1 * rho2 * d1);
    const r0 = Math.log(Math.sqrt(b0 * b0 + 1) - b0), r1 = Math.log(Math.sqrt(b1 * b1 + 1) - b1), S = (r1 - r0) / rho;
    return (t) => { const s = t * S, c0 = Math.cosh(r0), u = (w0 / (rho2 * d1)) * (c0 * Math.tanh(rho * s + r0) - Math.sinh(r0)); return [ux0 + u * dx, uy0 + u * dy, (w0 * c0) / Math.cosh(rho * s + r0)]; };
  }

  // ── easing ────────────────────────────────────────────────────────────────
  const clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
  const sm = (t) => { t = clamp(t); return t * t * (3 - 2 * t); };
  const inOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const outBack = (x, s = 1.25) => 1 + (s + 1) * Math.pow(x - 1, 3) + s * Math.pow(x - 1, 2);
  const lerp = (a, b, t) => a + (b - a) * t;

  // ── scene ─────────────────────────────────────────────────────────────────
  let current = null, mode = 'off', busy = false, hot = null, sticky = false, stickyKey = null;
  let trans = null;
  const HOV = {};
  const rimA = (hov) => (TH.ok ? 0.2 + 1.0 * hov : 0.14 + 1.05 * hov);
  const iaOf = (item) => (item ? (item.dim ? 0.45 : item.soon ? 0.78 : 1) : 0.42);
  // An arrow: five small solid dots inside the control's disc (opaque, so they
  // replace the disc's colour under them instead of adding to it).
  const ARROW_SPREAD = 1.25; // ACCENT: the site's highlight, from the theme
  function arrowGlyph(pts, x, y, r, k, hov, alpha = 1) {
    if (alpha <= 0.004 || r < 4) return;
    const u = (r / R) * INNER * ARROW_SPREAD, rr = Math.max(1.1, r * INNER * 0.62 * (1 + 0.08 * hov));
    const under = litAt(ACCENT, 0.3, hov * 0.35, k * 0.7, bgAt(x, y));
    const dot = TH.paper ? mix(under, mix(ACCENT, [0, 0, 0], 0.15), clamp(k * (0.75 + 0.2 * hov)))
      : blendPx(under, mix(ACCENT, DEEP, 0.25 - 0.2 * hov), k * (0.55 + 0.25 * hov));
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = clamp(alpha);
    ctx.fillStyle = `rgb(${dot})`;
    ctx.beginPath();
    for (const [px, py] of pts) { const qx = x + px * u, qy = y + py * u; ctx.moveTo(qx + rr, qy); ctx.arc(qx, qy, rr, 0, 2 * Math.PI); }
    ctx.fill();
  }
  // dirty: keys whose light changed (hover at rest) — only their squares are
  // repainted (everything in them, so the result is identical to a full frame).
  function draw(dirty) {
    if (!cam || mode === 'off') return;
    const P = ROUTES[trans ? trans.P : current], c = trans ? ROUTES[trans.c] : null, t = trans ? trans.t : 0;
    const A = sm(t / 0.55), B = clamp((t - 0.48) / 0.52);
    const s = scale();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
    const clipped = !!(dirty && dirty.length && !trans);
    if (clipped) {
      ctx.save(); ctx.beginPath();
      const e = 2.7 * R * P.k * s, q = (v, up) => (up ? Math.ceil(v * DPR) : Math.floor(v * DPR)) / DPR;
      for (const k of dirty) {
        const it = itemByKey(k); if (!it) continue;
        const [x, y] = project(...slotPos(P, it.slot)), x0 = q(x - e), y0 = q(y - e);
        ctx.rect(x0, y0, q(x + e, 1) - x0, q(y + e, 1) - y0);
      }
      ctx.clip();
    }
    const tint = c ? mix(hex(P.color), hex(c.color), sm(B)) : hex(P.color);
    // One opaque pass: background with a soft wash of the level's colour.
    // (its centre glides with the motion, so the background never jumps)
    const sa = stageRect(trans ? P.id : current), sb = trans ? stageRect(c.id) : sa, u = sm(t);
    const gx = lerp(sa.x + sa.w / 2, sb.x + sb.w / 2, u), gy = lerp(sa.y + sa.h / 2, sb.y + sb.h / 2, u), gR = Math.max(W, H) * 0.7;
    // On paper the wash is light: the centre lifts toward white with a trace of the tint.
    const gr = ctx.createRadialGradient(gx, gy, 0, gx, gy, gR), c0 = TH.paper ? mix(mix(BG, [255, 255, 255], 0.55), tint, 0.04) : mix(BG, tint, 0.1);
    gr.addColorStop(0, `rgb(${c0})`); gr.addColorStop(1, `rgb(${BG})`);
    washG = { gx, gy, gR, c0 };
    if (!clipped) wash(gx, gy, gR, c0);
    ctx.fillStyle = gr; ctx.fillRect(0, 0, W, H);
    // Orbs: opaque discs drawn source-over (their light is composited inside the fill).
    orbLog = [];
    SLOT_KEYS.forEach((slot) => {
      const item = itemAt(P.id, slot);
      const [x, y] = project(...slotPos(P, slot)), r = R * P.k * s;
      if (c && slot === c.slot) {
        // The orb being opened (or returned to) is the one element that moves:
        // it lights, grows with the camera, and the next shield grows out of it.
        const col = hex(c.color);
        const hov = Math.max(trans.h0, sm(t / 0.42));
        // As it grows past the screen it lets go, so passing through it never floods the frame.
        const let_go = 1 - sm((r / Math.min(W, H) - 0.22) / 0.4);
        const fillA = let_go * (1 - sm((B - 0.15) / 0.5));
        orb(col, x, y, r, 1, hov, { alpha: fillA, halo: 1 - sm(t / 0.2), key: 'open' });
        if (B > 0) {
          // The next shield: each light grows in place (centre first), drawn over the
          // opening orb, which it occludes; halos only once that orb has gone.
          const rr = R * c.k * s, haloK = fillA > 0.004 ? 0 : sm((B - 0.62) / 0.33);
          SLOT_KEYS.forEach((cs) => {
            const g = sm((B - 0.3 * (Math.hypot(...SLOTS[cs]) / 48)) / 0.45);
            if (g <= 0.004) return;
            const [tx, ty] = project(...slotPos(c, cs)), gc = itemAt(c.id, cs), arrow = arrowOf(gc), k = iaOf(gc);
            if (arrow) { orb(ACCENT, tx, ty, rr * g, k * 0.7, 0, { halo: haloK, key: 'child' }); arrowGlyph(arrow, tx, ty, rr * g, k, 0); }
            else orb(colorFor(c, gc), tx, ty, rr * g, k, 0, { halo: haloK, key: 'child' });
          });
        }
      } else {
        // Everything else steps aside by shrinking (solid, no fade over other orbs).
        const sc = c ? 1 - sm(t / 0.32) : 1;
        if (sc <= 0.004) return;
        const hov = item && !c ? HOV[item.key] || 0 : 0, arrow = arrowOf(item), k = iaOf(item);
        if (arrow) { orb(ACCENT, x, y, r * sc, k * 0.7, hov * 0.35, { halo: sc }); arrowGlyph(arrow, x, y, r * sc, k, hov); }
        else orb(colorFor(P, item), x, y, r * sc, k, hov, { halo: sc });
      }
    });
    if (clipped) ctx.restore();
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
  }

  // ── frame loop (only while something moves) ───────────────────────────────
  let raf = 0, last = 0, transDone = null;
  const kick = () => { if (!raf && !document.hidden && mode !== 'off') raf = requestAnimationFrame(tick); };
  function tick(now) {
    raf = 0;
    const dt = last ? Math.min(64, now - last) : 16; last = now;
    let moving = false;
    if (trans && !lowRes && DPR_FULL > 1.2) { // sustained slow frames while moving: drop resolution for the crossing
      slow = dt > 24 ? slow + 1 : Math.max(0, slow - 1);
      if (slow >= 4) { slowMotion = true; lowRes = true; applyRes(); }
    }
    if (camTw && !trans) {
      const k = clamp((now - camTw.t0) / camTw.dur), e = inOut(k), f = camTw.from, to = camTw.to;
      cam = { x: lerp(f.x, to.x, e), y: lerp(f.y, to.y, e), w: f.w * Math.pow(to.w / f.w, e) };
      needFull = true; positionPortals();
      if (k >= 1) camTw = null; else moving = true;
    } else if (trans) camTw = null;
    if (trans) {
      trans.t = clamp(trans.from + (trans.to - trans.from) * ((now - trans.t0) / trans.dur));
      const u = (trans.t - trans.from) / (trans.to - trans.from);
      cam = camAt(trans, trans.t);
      if (trans.onLate && u > 0.55) { const f = trans.onLate; trans.onLate = null; f(); }
      if (u >= 1) { const done = transDone; transDone = null; done?.(); } else moving = true;
    }
    const changed = [];
    const full = !!trans || lowRes || needFull;
    if (current && ROUTES[current]) {
      const sel = selectedKeys();
      for (const it of itemsOf(current).values()) {
        const id = it.key, target = !trans && (id === hot || sel.includes(id)) ? 1 : 0, h = HOV[id] || 0;
        if (h === target) continue;
        HOV[id] = reduced ? target : target > h ? Math.min(target, h + dt / 700) : Math.max(target, h - dt / 400);
        moving = true; changed.push(id);
      }
    }
    if (!trans && lowRes) { lowRes = false; slow = 0; applyRes(); }
    needFull = false;
    draw(full || !changed.length ? null : changed);
    if (moving || trans) kick(); else last = 0;
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; last = 0; } else kick();
  });
  const PUSH = 0; // no dive-and-return: the camera moves one way only
  function camAt(tr, t) {
    const [x, y, w] = tr.zoom(inOut(t));
    const bump = Math.exp(-Math.pow((t - 0.6) / 0.17, 2));
    return { x, y, w: w * (1 - PUSH * bump) };
  }
  function cross(P, c, from, to, dur, h0, onLate) {
    return new Promise((resolve) => {
      trans = { P, c, from, to, t: from, t0: performance.now(), dur, h0, onLate, zoom: interpolateZoom(Object.values(fit(P)), Object.values(fit(c))) };
      if (slowMotion && !lowRes && DPR_FULL > 1.2) { lowRes = true; applyRes(); }
      transDone = resolve;
      kick();
    });
  }

  // ── controls over the canvas ──────────────────────────────────────────────
  let lastPointer = 'mouse', lastDown = 0;
  const esc = (t) => String(t).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
  const host = (u) => String(u).replace(/^https?:\/\//, '').replace(/\/+$/, '');
  const portalFor = (key) => portalsEl.querySelector(`[data-key="${CSS.escape(key)}"]`);
  function makePortal(item) {
    const link = item.kind === 'route' || item.kind === 'up' || item.kind === 'section';
    const a = document.createElement(link ? 'a' : 'button');
    a.className = `tnw-portal is-${item.kind}` + (item.external ? ' is-external' : '') + (item.slot === 'C' && item.kind !== 'entry' && item.kind !== 'section' ? ' is-inset' : '') + (arrowOf(item) ? ' is-arrow' : '');
    if (link) a.href = item.kind === 'route' ? (item.external ? item.href : item.id) : item.kind === 'up' ? item.route : current + '#' + item.section;
    else a.type = 'button';
    if (item.external) a.rel = 'external noopener';
    a.dataset.route = item.key; a.dataset.key = item.key; a.dataset.dir = item.slot === 'C' ? (item.kind === 'entry' || item.kind === 'section' ? 'S' : 'C') : item.slot.toUpperCase();
    if (item.route) a.dataset.to = item.route;
    if (item.name) a.setAttribute('aria-label', item.name);
    if (item.kind === 'action') a.setAttribute('aria-controls', 'install'); // opens inline: aria-expanded, no popup
    if (item.kind === 'filter') { a.setAttribute('aria-haspopup', 'true'); a.setAttribute('aria-controls', 'tn-world-preview'); }
    if ((item.kind === 'prev' || item.kind === 'next') && current === '/eco') a.setAttribute('aria-controls', 'eco-catalog-host');
    if (item.kind === 'info') { a.setAttribute('aria-haspopup', 'dialog'); a.setAttribute('aria-controls', 'res-info-modal'); }
    if (item.dim) a.setAttribute('aria-disabled', 'true');
    const descId = 'tnw-d-' + item.key.replace(/\W/g, '');
    a.setAttribute('aria-describedby', descId);
    const meta = item.kind === 'entry' ? `${item.status[0].toUpperCase() + item.status.slice(1)} · ${item.tags.join(', ')}. ` : '';
    a.innerHTML = `<span class="tnw-label"${item.name ? ' aria-hidden="true"' : ''}>${esc(item.label)}</span><span class="tnw-sr" id="${descId}">${esc(meta + (item.desc || ''))}${item.external ? ' Opens an external site.' : ''}</span>`;
    a.addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; lastDown = performance.now(); });
    a.addEventListener('pointerenter', (e) => { if (e.pointerType !== 'touch') setHot(item.key); });
    a.addEventListener('pointerleave', (e) => { if (e.pointerType !== 'touch' && !sticky) setHot(null); });
    a.addEventListener('focus', () => { if (lastPointer === 'touch' && performance.now() - lastDown < 700) return; if (!sticky) setHot(item.key); });
    a.addEventListener('blur', () => { if (!sticky && lastPointer !== 'touch') setHot(null); });
    a.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') lastPointer = 'keyboard'; });
    a.addEventListener('click', (e) => {
      if (link && (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button)) return; // new tab/window: let the browser handle it
      e.preventDefault();
      activate(itemByKey(item.key) || item);
    });
    return a;
  }
  function buildPortals() {
    const focusKey = portalsEl.contains(document.activeElement) ? document.activeElement.dataset.key : null;
    needFull = true;
    portalsEl.replaceChildren(...[...itemsOf(current).values()].map(makePortal));
    positionPortals();
    paintPortals();
    portalsEl.classList.remove('is-hidden');
    if (focusKey) { const el = portalFor(focusKey); if (el) { const lp = lastPointer; el.focus({ preventScroll: true }); lastPointer = lp; } }
  }
  function positionPortals() {
    const P = ROUTES[current];
    for (const a of portalsEl.children) {
      const it = itemByKey(a.dataset.key);
      if (!it) continue;
      const [px, py] = project(...slotPos(P, it.slot));
      const size = Math.max(44, R * P.k * scale() * 2.3);
      a.classList.toggle('is-small', size < 64);
      Object.assign(a.style, { left: px + 'px', top: py + 'px', width: size + 'px', height: size + 'px' });
    }
    caption();
    paintScene();
    if (preview.classList.contains('is-on')) placeCard();
  }
  function paintPortals() {
    const sel = selectedKeys();
    for (const a of portalsEl.children) {
      const key = a.dataset.key, it = itemByKey(key), on = sel.includes(key);
      if (!it) continue;
      a.classList.toggle('is-lit', on || key === hot);
      if (it.kind === 'entry') a.setAttribute('aria-pressed', String(on));
      if (it.kind === 'section') { if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }
      if (it.kind === 'action' || it.kind === 'filter') a.setAttribute('aria-expanded', String(on));
    }
    caption();
  }
  function caption() {
    const list = current === '/eco' && eco && eco.list;
    const secs = hasSections(current) && section ? sectionList() : null;
    captionEl.hidden = !list && !secs;
    if (!list && !secs) return;
    if (secs) {
      const i = secs.findIndex((x) => x.section === section);
      captionEl.textContent = `${secs[i].label} · ${i + 1} of ${secs.length}`;
    } else {
      const n = list.length, tags = eco.filters.tags;
      const sel = eco.selected && list.find((p) => p.id === eco.selected);
      captionEl.textContent = !n ? 'No projects match these filters.'
        : (n > PAGE_SIZE ? `Page ${ecoPage + 1} of ${Math.ceil(n / PAGE_SIZE)}` : `${n} project${n === 1 ? '' : 's'}`) + ` · ${tags.length ? tags.join(', ') : 'all categories'}` + (sel ? ` · ${sel.title}` : '');
    }
    const P = ROUTES[current], [px, py] = project(P.x, P.y + EXT * P.k);
    Object.assign(captionEl.style, { left: px + 'px', top: py + (itemAt(current, 'S') ? 36 : 14) + 'px' }); // under the bottom light's name
  }
  // Narrow pages: where the navigation (lights, bottom name, caption) ends, in page coordinates.
  function sceneBottom(id = current) {
    const sr = stageRect(id);
    if (id === '/' || !ROUTES[id]) return sr.y + sr.h;
    const P = ROUTES[id], py = project(P.x, P.y + EXT * P.k, fit(id))[1];
    const hasS = !!itemAt(id, 'S'), cap = (id === '/eco' || hasSections(id));
    return Math.ceil(Math.max(sr.y + sr.h, py + (hasS ? 36 : 14) + (cap ? 24 : 10) + 6));
  }
  let sceneVar = '';
  function paintScene(id = current) {
    const v = mode === 'panel' && !wide() && id ? sceneBottom(id) + 'px' : '';
    if (v === sceneVar) return;
    sceneVar = v;
    if (v) docEl.style.setProperty('--tnw-scene', v); else docEl.style.removeProperty('--tnw-scene');
  }
  function setHot(key) {
    // An open confirm card or category menu stays until it is answered.
    if (sticky || menuOpen) { if (key) hot = key; paintPortals(); kick(); return; }
    hot = key; kick();
    paintPortals();
    clearTimeout(hideT);
    const it = key && itemByKey(key);
    if (installOpen) return; // the installer holds the landing column
    if (!it || it.kind === 'prev' || it.kind === 'next') {
      const pin = pinned();
      if (pin) return showCard(pin);
      // Start page: moving between lights keeps the card instead of flashing the landing copy.
      if (mode === 'home' && preview.classList.contains('is-on')) { hideT = setTimeout(() => { if (!hot && !sticky) hideCard(); }, 180); return; }
      hideCard();
      return;
    }
    showCard(it);
  }
  let hideT = 0;
  function pinned() {
    if (current !== '/eco' || !eco || !eco.selected || menuOpen) return null;
    return itemByKey('entry:' + eco.selected);
  }
  function hideCard() {
    preview.classList.remove('is-on', 'is-sticky', 'is-pinned');
    preview.setAttribute('aria-hidden', 'true');
    sticky = false; stickyKey = null;
    pushFlow();
  }
  function cardHtml(it, confirmLeave) {
    const dest = it.external || it.ext || (it.kind === 'entry' && !it.route && it.href) ? host(it.href) : 'terp.network' + (it.route && it.route !== '/' ? it.route : '');
    let h = '';
    if (it.kind === 'entry') {
      h = `<h3>${esc(it.label)}</h3><p class="tnw-meta">${esc(it.status[0].toUpperCase() + it.status.slice(1))} · ${esc(it.tags.join(', '))}</p><p>${esc(it.desc)}</p>`;
      if (!confirmLeave && eco && eco.selected === it.project.id) {
        const open = it.route ? `Open ${ROUTES[it.route].label}` : it.ext || !(it.component && document.getElementById('plane-' + it.component)) ? `Visit ${host(it.href || '')} ↗` : 'Open';
        h += `<div class="tnw-actions"><button type="button" id="tnw-open">${esc(open)}</button></div><button type="button" id="tnw-clear" aria-label="Clear selection">×</button>`;
      }
    } else if (it.kind === 'filter') {
      h = `<h3>Category</h3><p>${esc(it.desc)}</p>`;
    } else {
      h = `<h3>${esc(it.label)}</h3><p>${esc(it.desc)}</p>`;
      if (it.kind === 'route' || it.kind === 'up') h += confirmLeave ? '' : `<div class="tnw-dest${it.external ? ' ext' : ''}">${it.external ? '↗ ' : '→ '}${esc(dest)}</div>`;
    }
    if (confirmLeave) h += `<p class="tnw-leave">This link opens ${esc(dest)}, outside terp.network.</p><div class="tnw-actions"><a href="${esc(it.href)}" rel="external noopener" id="tnw-go">Open ↗</a><button type="button" id="tnw-stay">Cancel</button></div>`;
    return h;
  }
  // Cards open in free space, never over a control:
  //  · wide pages: the band under the mark, in the navigation column;
  //  · narrow pages: in the flow, right under the navigation (the page moves down);
  //  · the start page: in the landing column, in place of the landing copy.
  let cardSpot = null;
  function placeCard() {
    const P = ROUTES[current];
    const kind = mode === 'home' ? 'home' : wide() ? 'zone' : 'inline';
    const w = kind === 'home' ? Math.min(420, W - 32) : kind === 'zone' ? Math.min(360, leftW() - 48) : Math.min(520, W - 32);
    preview.style.width = Math.round(w) + 'px';
    preview.classList.toggle('is-inline', kind === 'inline');
    const ph = preview.offsetHeight || 140;
    let left, top;
    if (kind === 'home') {
      const box = homeCopyBox();
      left = box ? box.left : 16; top = Math.max(chromeBottom() + 8, (box ? box.bottom : H - 24) - ph);
    } else if (kind === 'zone') {
      const cap = !captionEl.hidden ? 26 : 0;
      left = Math.max(16, (leftW() - w) / 2); top = Math.min(project(P.x, P.y + EXT * P.k)[1] + (itemAt(current, 'S') ? 40 : 18) + cap, H - ph - 12);
    } else {
      left = (W - w) / 2; top = sceneBottom() + 2;
    }
    cardSpot = { kind, left, top, w };
    Object.assign(preview.style, { left: Math.round(left) + 'px', top: Math.round(top) + 'px' });
    pushFlow();
  }
  // Narrow pages: the page makes room for an inline card instead of being covered.
  function pushFlow() {
    const on = preview.classList.contains('is-on') && cardSpot && cardSpot.kind === 'inline';
    docEl.style.setProperty('--tnw-push', on ? Math.ceil(preview.offsetHeight + 12) + 'px' : '0px');
    if (mode === 'home') { if (preview.classList.contains('is-on')) docEl.setAttribute('data-tn-card', ''); else docEl.removeAttribute('data-tn-card'); }
    else docEl.removeAttribute('data-tn-card');
  }
  function homeCopyBox() {
    const parts = [...document.querySelectorAll('body > .container > :not(.footer):not(.install-section):not([hidden])')]
      .map((e) => e.getBoundingClientRect()).filter((r) => r.width && r.height);
    if (!parts.length) return null;
    return { left: Math.min(...parts.map((r) => r.left)), bottom: Math.max(...parts.map((r) => r.bottom)) };
  }
  const placePinned = placeCard;
  // The card is rebuilt only when its content changes, so a click that starts on a
  // button is never lost to a re-render when the pointer leaves a light.
  let cardIt = null, cardNow = '';
  function showCard(it, confirmLeave = false) {
    const html = cardHtml(it, confirmLeave);
    if (html !== cardNow || !preview.classList.contains('is-on')) { preview.innerHTML = html; cardNow = html; }
    cardIt = it;
    const pin = !confirmLeave && it.kind === 'entry' && eco && eco.selected === it.project.id;
    preview.classList.add('is-on');
    placeCard();
    preview.classList.toggle('is-sticky', confirmLeave);
    preview.classList.toggle('is-pinned', pin);
    preview.setAttribute('aria-hidden', String(!confirmLeave && !pin));
    sticky = !!confirmLeave; stickyKey = confirmLeave ? it.key : null;
    if (confirmLeave) preview.querySelector('#tnw-go').focus();
  }
  preview.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || !cardIt) return;
    const it = cardIt;
    if (b.id === 'tnw-open') openEntry(it);
    else if (b.id === 'tnw-clear') { ecoApi && ecoApi.selectEcoProject(null); announce('Selection cleared.'); portalFor(it.key)?.focus({ preventScroll: true }); }
    else if (b.id === 'tnw-stay') cancelSticky();
  });
  function cancelSticky() {
    const k = stickyKey;
    hideCard(); hot = null; setHot(null);
    if (k) portalFor(k)?.focus();
  }

  // ── what each control does ────────────────────────────────────────────────
  function activate(it) {
    if (!it || it.dim) return;
    switch (it.kind) {
      case 'route':
        // Touch: the first tap previews, a second tap on the same glow opens it.
        if (lastPointer === 'touch' && performance.now() - lastDown < 1200 && hot !== it.key) { setHot(it.key); return; }
        return enter(it.key);
      case 'up': return nav(it.route);
      case 'section': goSection(it.section); return;
      case 'action': return installOpen ? closeInstall(true) : openInstall();
      case 'prev': return hasSections(current) ? stepSection(-1) : stepEco(-1);
      case 'next': return hasSections(current) ? stepSection(1) : stepEco(1);
      case 'info': return (document.getElementById('res-info-section') || document.getElementById('res-info-current'))?.click();
      case 'filter': return menuOpen ? closeMenu(true) : openMenu();
      case 'entry': return eco && eco.selected === it.project.id ? openEntry(it) : selectEntry(it);
    }
  }
  function enter(id) {
    const n = ROUTES[id];
    if (n.external) { hot = id; kick(); return showCard(itemByKey(id) || routeItem(id), true); }
    nav(id);
  }
  function nav(id) {
    if (!isPage(id) || id === current) return;
    if (shell && shell.navigate) shell.navigate(id);
    else location.assign(id);
  }

  // Catalog (/eco): select, step, filter, open.
  function ensureEco() {
    if (ecoLoading || !CAT) return ecoLoading;
    ecoLoading = import('/lib/ecosystem.js').then((m) => {
      ecoApi = m;
      m.onEcoChange(onEco);
      return m.loadEcosystem().then(() => onEco(m.ecoState()));
    }).catch((e) => { console.warn('[tn-world] catalog unavailable', e); ecoLoading = null; });
    return ecoLoading;
  }
  function onEco(s) {
    eco = s;
    if (s.list && s.selected) { const i = s.list.findIndex((p) => p.id === s.selected); if (i >= 0) ecoPage = Math.floor(i / PAGE_SIZE); }
    if (busy) { ecoDirty = true; return; }
    applyEco();
  }
  function applyEco() {
    ecoDirty = false;
    refreshItems();
    if (current && (current === '/eco' || ROUTES[current].parent === '/eco')) cam = fit(current);
    if (current === '/eco') {
      buildPortals();
      if (!sticky && !menuOpen) setHot(hot && itemByKey(hot) ? hot : null);
    }
    if (current && (current === '/eco' || ROUTES[current].parent === '/eco')) kick(); // elsewhere nothing on screen changed
  }
  function selectEntry(it) {
    if (!ecoApi) return;
    ecoApi.selectEcoProject(it.project.id, { scroll: wide() });
    announce(`${it.label} selected.`);
  }
  function stepEco(dir) {
    const list = eco && eco.list;
    if (!ecoApi || !list || !list.length) return;
    const pages = Math.ceil(list.length / PAGE_SIZE);
    if (pages < 2) { announce('All projects are on this page.'); return; }
    ecoPage = (ecoPage + dir + pages) % pages;
    hideCard(); hot = null;
    // A selection pins its own page, so turning the page lets go of it.
    if (eco.selected) ecoApi.selectEcoProject(null); else applyEco();
    announce(`Page ${ecoPage + 1} of ${pages}.`);
  }
  function openEntry(it) {
    if (it.route) return nav(it.route);
    if (!it.ext && it.component && document.getElementById('plane-' + it.component)) return ecoApi && ecoApi.openEcoProject(it.project.id);
    if (it.href) { hot = it.key; kick(); showCard(it, true); }
  }
  function openMenu() {
    if (!eco || !eco.list) return;
    hideCard();
    menuOpen = true; sticky = true;
    const cur = eco.filters.tags.length === 1 ? eco.filters.tags[0] : eco.filters.tags.length ? null : '';
    const count = (t) => (t ? eco.all.filter((p) => (p.tags || []).includes(t)).length : eco.all.length);
    cardNow = ''; cardIt = null;
    preview.innerHTML = '<h3 id="tnw-cat-h">Category</h3><div class="tnw-chips" role="group" aria-labelledby="tnw-cat-h">' +
      ['', ...eco.tags].map((t) => `<button type="button" data-tag="${esc(t)}" aria-pressed="${t === cur}">${esc(t || 'All')} <span>${count(t)}</span></button>`).join('') + '</div>';
    preview.classList.add('is-on', 'is-sticky'); preview.classList.remove('is-pinned');
    placeCard();
    preview.setAttribute('aria-hidden', 'false');
    preview.querySelectorAll('[data-tag]').forEach((b) => b.addEventListener('click', () => {
      ecoPage = 0;
      ecoApi.setEcoFilter({ tags: b.dataset.tag ? [b.dataset.tag] : [] });
      closeMenu(true);
      announce(`${eco.list.length} project${eco.list.length === 1 ? '' : 's'} in ${b.dataset.tag || 'all categories'}.`);
    }));
    (preview.querySelector('[aria-pressed="true"]') || preview.querySelector('[data-tag]')).focus();
    paintPortals(); kick();
  }
  function closeMenu(refocus) {
    if (!menuOpen) return;
    menuOpen = false; hideCard(); hot = null; paintPortals(); kick();
    if (refocus) portalFor('eco:filter')?.focus({ preventScroll: true });
    else setHot(null);
  }
  function announce(text) {
    const el = document.getElementById('tn-route-announcer');
    if (!el) return;
    el.textContent = '';
    setTimeout(() => { el.textContent = text; }, 30);
  }

  // Installer (home): the centre control opens the page's install panel in the
  // landing column, in place of the landing copy; the mark makes room for it.
  const installEl = () => (mode === 'home' ? document.getElementById('install') : null);
  function openInstall() {
    const el = installEl();
    if (!el) return;
    installOpen = true;
    clearTimeout(hideT); hideCard();
    el.classList.add('is-open');
    docEl.setAttribute('data-tn-install', '');
    el.setAttribute('role', 'region');
    if (document.getElementById('install-title')) el.setAttribute('aria-labelledby', 'install-title');
    document.getElementById('install-content')?.classList.add('expanded');
    measureHome(); retarget();
    paintPortals(); kick();
    const first = el.querySelector('#install-command, .install-content button, .install-content a[href]');
    first?.focus({ preventScroll: true });
  }
  function closeInstall(refocus) {
    if (!installOpen) return;
    installOpen = false;
    docEl.removeAttribute('data-tn-install');
    const el = document.getElementById('install');
    if (el) {
      el.classList.remove('is-open');
      ['role', 'aria-labelledby'].forEach((a) => el.removeAttribute(a));
      document.getElementById('install-content')?.classList.remove('expanded');
    }
    if (mode === 'home') { measureHome(); retarget(); }
    paintPortals(); kick();
    if (refocus) portalFor('act:install')?.focus({ preventScroll: true });
  }
  // Glide the view to the current layout (used when the landing column changes).
  let camTw = null;
  // Home's landing copy can settle after the swap (its page styles apply a frame or
  // more later, fonts load): measure again once it has, and move the mark if needed.
  let homeRO = null, homeObserved = null;
  function remeasureHome() {
    if (mode !== 'home') return;
    const before = homeGeom && JSON.stringify(homeGeom);
    measureHome();
    if (JSON.stringify(homeGeom) !== before) retarget();
  }
  function watchHome() {
    if (mode !== 'home') { if (homeRO) homeRO.disconnect(); homeObserved = null; return; }
    requestAnimationFrame(() => requestAnimationFrame(remeasureHome));
    setTimeout(remeasureHome, 350);
    const c = document.querySelector('body > .container');
    if (typeof ResizeObserver !== 'function' || !c || c === homeObserved) return;
    if (!homeRO) homeRO = new ResizeObserver(() => remeasureHome());
    homeRO.disconnect(); homeRO.observe(c); homeObserved = c;
  }
  function retarget() {
    if (busy || !current || !cam) return;
    const to = fit(current);
    if (reduced) { cam = to; positionPortals(); needFull = true; kick(); return; }
    camTw = { from: { ...cam }, to, t0: performance.now(), dur: 420 };
    kick();
  }
  const focusables = (el) => [...el.querySelectorAll('a[href], button, input, textarea, select, [tabindex]:not([tabindex="-1"])')].filter((x) => x.getClientRects().length && getComputedStyle(x).visibility !== 'hidden');

  // Pages with sections (Resources, About): the active one follows the address bar
  // (#install, #genesis, …) and is mirrored on <html data-tn-section> for page CSS.
  function hasSections(id) { return !!(LEVELS[id] && LEVELS[id].defaultSection); }
  const sectionList = (id = current) => LEVELS[id].items.filter((i) => i.kind === 'section');
  function markSection() {
    if (section) docEl.setAttribute('data-tn-section', section);
    else docEl.removeAttribute('data-tn-section');
  }
  function stepSection(dir) {
    const L = sectionList(), i = Math.max(0, L.findIndex((x) => x.section === section)), n = L[(i + dir + L.length) % L.length];
    goSection(n.section);
    announce(`${n.label}, section ${L.indexOf(n) + 1} of ${L.length}.`);
  }
  function readSection(id = current) {
    if (!hasSections(id)) return null;
    let k = location.hash.replace(/^#/, '').split('/')[0].split('=')[0];
    if (k === 'snapshot' || k === 'snapshot-history' || k === 'snapshots-history') k = 'snapshots';
    if (k === 'contracts') k = 'app-state';
    return sectionList(id).some((i) => i.section === k) ? k : LEVELS[id].defaultSection;
  }
  // A section keeps its own sub-address (#network/governance): going back to
  // it from the navigation reopens the part that was open, not its first one.
  const subHash = {};
  function rememberSub() {
    const h = location.hash.replace(/^#/, ''), k = h.split('/')[0];
    if (k && h.length > k.length + 1) subHash[current + '#' + k] = h;
  }
  function goSection(k) {
    if (location.hash.replace(/^#/, '').split('/')[0] === k) return; // already open: keep its sub-address
    location.hash = subHash[current + '#' + k] || k;
  }
  addEventListener('hashchange', () => {
    rememberSub();
    if (!hasSections(current)) return;
    section = readSection();
    markSection();
    paintPortals(); kick();
  });

  const chain = (id) => { const out = []; for (let n = ROUTES[id]; n; n = ROUTES[n.parent]) out.unshift(n); return out; };
  function paintCrumbs(id) {
    const c = chain(id);
    crumbsEl.innerHTML = id === '/' ? '' : c.map((n, i) => i === c.length - 1
      ? `<li><span aria-current="page">${esc(n.label)}</span></li>`
      : `<li><a href="${n.id}">${esc(n.label)}</a></li>`).join('');
  }
  function paintTint(id) {
    // Section colour as text: on paper it is deepened further so headings keep contrast.
    const c = hex(ROUTES[id].color);
    docEl.style.setProperty('--tnw-tint', (TH.mode === 'ink' ? mix(c, [0, 0, 0], 0.35) : c).join(','));
  }
  function setMode(id) {
    const on = isPage(id);
    mode = !on ? 'off' : id === '/' ? 'home' : 'panel';
    docEl.setAttribute('data-tn-world', mode);
    stage.hidden = !on; preview.hidden = !on;
    if (!on) { cancelAnimationFrame(raf); raf = 0; setHot(null); }
  }

  // ── one background ────────────────────────────────────────────────────────
  // Under the banner and a pinned page title, scrolled text fades out into an
  // exact copy of the canvas background (world.css reads these variables), so
  // nothing draws an edge or a surface of its own.
  let washNow = null, washKey = '';
  // Narrow pages: the navigation scrolls away with the page (it is never under the text).
  const stageScrolls = () => mode === 'panel' && !wide() && !docEl.hasAttribute('data-tn-moving');
  function wash(gx, gy, gR, c0) { washNow = { gx, gy, gR, c0 }; applyScrim(); }
  function applyScrim() {
    if (!washNow || mode !== 'panel') return;
    const dy = stageScrolls() ? scrollY : 0;
    const key = `${Math.round(washNow.gx)}|${Math.round(washNow.gy - dy)}|${Math.round(washNow.gR)}|${washNow.c0}`;
    if (key === washKey) return;
    washKey = key;
    const st = docEl.style;
    st.setProperty('--tnw-gx', Math.round(washNow.gx) + 'px');
    st.setProperty('--tnw-gy', Math.round(washNow.gy - dy) + 'px');
    st.setProperty('--tnw-gr', Math.round(washNow.gR) + 'px');
    st.setProperty('--tnw-g0', `rgb(${washNow.c0})`);
  }
  const chromeH = () => { const b = document.querySelector('.site-chrome-wrap[data-tn-chrome]'); return b ? b.offsetHeight : 0; };
  let scrollQ = 0;
  function onScroll() {
    scrollQ = 0;
    applyScrim();
    if (mode !== 'panel') { docEl.removeAttribute('data-tn-scrolled'); docEl.removeAttribute('data-tn-stuck'); return; }
    const head = document.querySelector('main [data-tn-head]'), ch = chromeH();
    const stuck = !!head && scrollY > 1 && head.getBoundingClientRect().top <= ch + 1;
    if (head) docEl.style.setProperty('--tnw-head-h', head.offsetHeight + 'px');
    docEl.toggleAttribute('data-tn-scrolled', scrollY > 1);
    docEl.toggleAttribute('data-tn-stuck', stuck);
  }
  addEventListener('scroll', () => { if (!scrollQ) scrollQ = requestAnimationFrame(onScroll); }, { passive: true });

  // ── page dialogs open in the page's own column, never over the navigation ─
  const SHEET_SEL = '.res-info-overlay.open, #modal-docs, .modal, dialog.info-modal[open], #tn-wallet-modal.open';
  let sheetEl = null, sheetQ = 0;
  const visible = (el) => el.matches('dialog[open]') || (el.getClientRects().length > 0 && (el.hasAttribute('data-tn-behind') || getComputedStyle(el).visibility !== 'hidden'));
  // The account panel: on home it takes the landing column and the mark makes room; on
  // sub-pages it is one more page dialog (below).
  let acctOpen = false;
  const acctEl = () => document.querySelector('#tn-wallet-modal.open');
  function checkAccount() {
    const on = !!acctEl();
    if (on === acctOpen) return;
    acctOpen = on;
    docEl.toggleAttribute('data-tn-account', on);
    if (on && installOpen) closeInstall(false);
    if (mode === 'home') { clearTimeout(hideT); hideCard(); measureHome(); retarget(); }
  }
  function checkSheet() {
    sheetQ = 0;
    checkAccount();
    // One dialog at a time: the newest open one shows, any older one waits behind it unseen.
    const open = mode === 'panel' ? [...document.querySelectorAll(SHEET_SEL)].filter(visible) : [];
    const el = open.length ? open[open.length - 1] : null;
    for (const o of document.querySelectorAll('[data-tn-behind]')) if (o === el || !open.includes(o)) o.removeAttribute('data-tn-behind');
    for (const o of open) if (o !== el && !o.hasAttribute('data-tn-behind')) o.setAttribute('data-tn-behind', '');
    if (el !== sheetEl) {
      if (sheetEl && !el) docEl.removeAttribute('data-tn-sheet');
      sheetEl = el;
      if (el) { docEl.setAttribute('data-tn-sheet', ''); placeSheet(true); }
    } else if (el) placeSheet(false);
  }
  function placeSheet(first) {
    const el = sheetEl;
    if (!el) return;
    if (wide()) { if (el.style.getPropertyValue('top')) el.style.removeProperty('top'); return; }
    const docTop = sceneBottom() + 6;
    const cb = el.matches('dialog') ? null : el.offsetParent;
    const cbTop = cb && cb !== document.body ? cb.getBoundingClientRect().top + scrollY : 0;
    const v = Math.round(docTop - cbTop) + 'px';
    if (el.style.getPropertyValue('top') !== v) el.style.setProperty('top', v, 'important');
    if (first && scrollY > docTop - chromeH() - 8) scrollTo({ top: Math.max(0, docTop - chromeH() - 8), behavior: reduced ? 'auto' : 'smooth' });
  }
  const ownNode = (n) => stage.contains(n) || preview.contains(n);
  new MutationObserver((recs) => {
    if (sheetQ || recs.every((r) => ownNode(r.target))) return;
    sheetQ = requestAnimationFrame(checkSheet);
  }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style', 'open'] });

  // Info and guide pop-ups: a click anywhere that isn't a control closes them, and so does Esc.
  const INFO_SEL = '.res-info-overlay.open, #modal-docs, dialog.info-modal[open]';
  const CONTROL = 'a[href], button, input, select, textarea, label, summary, [role="button"], [role="tab"], [role="link"], [contenteditable=""], [contenteditable="true"]';
  const openInfo = () => [...document.querySelectorAll(INFO_SEL)].filter((el) => el.matches('dialog[open]') || (el.getClientRects().length > 0 && getComputedStyle(el).display !== 'none')).pop() || null;
  function closeInfo(el) {
    if (el.matches('dialog')) { el.close(); return; }
    if (el.classList.contains('res-info-overlay')) { el.classList.remove('open'); return; }
    const x = el.querySelector('.modal-close');
    if (x) x.click(); else el.style.display = 'none';
  }
  document.addEventListener('click', (e) => {
    const el = openInfo();
    if (!el) return;
    const t = e.target instanceof Element ? e.target : null;
    if (t && t.closest(CONTROL)) return;
    const sel = getSelection();
    if (sel && !sel.isCollapsed && String(sel).trim()) return; // selecting text to copy is not a dismissal
    closeInfo(el);
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    const el = openInfo();
    if (!el) return;
    e.preventDefault(); e.stopImmediatePropagation();
    const back = el.id === 'res-info-modal' ? (el.__opener && el.__opener.isConnected ? el.__opener : document.getElementById('res-info-current')) : el.id === 'info-modal' ? document.getElementById('info-btn') : document.querySelector('main .btn-docs');
    closeInfo(el);
    if (back && el.contains(document.activeElement || null)) back.focus({ preventScroll: true });
  }, true);

  // ── routing: the shell's transition hook ──────────────────────────────────
  let gen = 0, pendingRelease = null, dest = null;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  function settle(id) {
    trans = null; transDone = null; busy = false;
    current = id;
    if (ecoDirty) { ecoDirty = false; refreshItems(); }
    section = readSection(id);
    markSection();
    if (id === '/eco' || ROUTES[id].parent === '/eco') ensureEco();
    if (mode === 'home') measureHome();
    cam = fit(id);
    paintCrumbs(id); paintTint(id); buildPortals(); draw();
    watchHome();
    stage.classList.remove('is-fading');
    endMoving();
    onScroll();
    paintScene();
  }
  // While the view moves, a narrow page's navigation is held in view (it
  // otherwise scrolls with the page); it arrives with a fade if it was
  // scrolled away, and leaves the same way.
  function startMoving() {
    const away = mode === 'panel' && !wide() && scrollY > 4;
    docEl.setAttribute('data-tn-moving', '');
    if (away && !reduced) stage.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 200, easing: 'linear' });
    applyScrim();
  }
  function endMoving() {
    if (!docEl.hasAttribute('data-tn-moving')) return;
    if (mode === 'panel' && !wide() && scrollY > 4 && !reduced) {
      const an = stage.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 160, easing: 'linear', fill: 'forwards' });
      an.finished.then(() => { docEl.removeAttribute('data-tn-moving'); an.cancel(); applyScrim(); }, () => {});
      return;
    }
    docEl.removeAttribute('data-tn-moving');
    applyScrim();
  }
  function travel(to) {
    const g = ++gen;
    if (pendingRelease) { pendingRelease(); pendingRelease = null; }
    if (busy && dest) settle(dest); // a newer navigation wins: jump the running one to its end
    const from = current;
    dest = to;
    busy = true;
    closeMenu(false); closeInstall(false);
    if (to === '/eco' || ROUTES[to].parent === '/eco') ensureEco();
    const a = chain(from).map((n) => n.id), b = chain(to).map((n) => n.id);
    let k = 0; while (k < a.length && k < b.length && a[k] === b[k]) k++;
    const steps = [];
    for (let i = a.length - 1; i >= k; i--) steps.push({ P: a[i - 1], c: a[i], dir: -1 });
    for (let i = k; i < b.length; i++) steps.push({ P: b[i - 1], c: b[i], dir: 1 });
    const firstIn = steps[0] && steps[0].dir > 0 ? itemAt(steps[0].P, ROUTES[steps[0].c].slot) : null;
    const h0 = firstIn ? HOV[firstIn.key] || 0 : 0;
    hot = null; clearTimeout(hideT); hideCard();
    portalsEl.classList.add('is-hidden');
    startMoving();
    docEl.setAttribute('data-tn-xfade', 'out');
    let release;
    const swapPoint = new Promise((r) => { release = r; });
    pendingRelease = release;
    const up = chain(from).find((n) => n.parent === to);
    (async () => {
      // The catalog decides what the Ecosystem level holds: have it before drawing that level,
      // so the lights seen while arriving are the lights that stay (no swap on landing).
      if ((a.includes('/eco') || b.includes('/eco')) && !eco && ecoLoading) {
        await Promise.race([ecoLoading, wait(400)]);
        if (g !== gen) return;
      }
      if (ecoDirty) { ecoDirty = false; refreshItems(); cam = fit(from); }
      if (reduced) {
        stage.classList.add('is-fading');
        await wait(150);
        if (g !== gen) return;
        current = to; cam = fit(to); draw();
        release();
        return;
      }
      const multi = steps.length > 1;
      for (let i = 0; i < steps.length; i++) {
        const st = steps[i], lastStep = i === steps.length - 1;
        current = st.P;
        if (st.dir > 0) await cross(st.P, st.c, 0, 1, multi ? 900 : 1550, i === 0 ? h0 : 0, lastStep ? release : null);
        else { await cross(st.P, st.c, 1, 0, multi ? 800 : 1250, 1, lastStep ? release : null); const it = itemAt(st.P, ROUTES[st.c].slot); if (it) HOV[it.key] = 1; }
        if (g !== gen) return;
      }
      release();
      settle(to);
      kick();
      if (up && lastPointer === 'keyboard') portalsEl.querySelector(`[data-to="${up.id}"]`)?.focus({ preventScroll: true });
    })();
    return swapPoint;
  }

  function onSwapped(ctx, animated) {
    pendingRelease = null;
    // The router inserts new content before persistent nodes; keep the
    // navigation first in document (and tab) order, as on a full page load.
    if (document.body.firstElementChild !== stage) document.body.prepend(stage);
    const bar = window.__tnChrome && window.__tnChrome.node; // the banner follows the navigation, before the page
    if (bar && bar.parentNode === document.body && stage.nextElementSibling !== bar) stage.after(bar);
    installOpen = false;
    setMode(ctx.to); paintScene(ctx.to);
    // The page's own section (About, Resources) shows as soon as its content is in.
    section = readSection(ctx.to); markSection();
    rotator.sync();
    if (mode === 'home') {
      measureHome();
      // Arriving home: aim the running motion at the measured layout.
      if (trans && trans.P === '/') trans.zoom = interpolateZoom(Object.values(fit('/')), Object.values(fit(trans.c)));
    }
    if (mode === 'off') { gen++; trans = null; transDone = null; busy = false; docEl.removeAttribute('data-tn-xfade'); docEl.removeAttribute('data-tn-moving'); return; }
    // The new page starts at the top: the navigation can scroll with it again.
    if (scrollY <= 4) { docEl.removeAttribute('data-tn-moving'); applyScrim(); }
    docEl.removeAttribute('data-tn-sheet'); sheetEl = null;
    onScroll();
    if (!animated) { gen++; settle(ctx.to); }
    else { paintCrumbs(ctx.to); paintTint(ctx.to); }
    // New content is in the DOM (still transparent): fade it in on the next frame.
    requestAnimationFrame(() => {
      docEl.setAttribute('data-tn-xfade', 'in');
      setTimeout(() => { if (docEl.getAttribute('data-tn-xfade') === 'in') docEl.removeAttribute('data-tn-xfade'); }, 400);
    });
    if (reduced && animated) setTimeout(() => { if (!trans) { busy = false; settle(ctx.to); } }, 0);
  }

  if (shell && shell.setTransition) {
    shell.setTransition({
      start(ctx) {
        if (mode === 'off' || !isPage(ctx.from) || !isPage(ctx.to) || ctx.to === current && !busy) return null;
        if (document.visibilityState !== 'visible') return null;
        return travel(ctx.to);
      },
      swapped: onSwapped,
    });
  }

  // ── input ─────────────────────────────────────────────────────────────────
  const shown = (el) => el.matches('dialog[open]') || (el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden');
  const modalOpen = () => [...document.querySelectorAll('dialog[open], .modal, #modal-docs, #tn-wallet-modal.open, [aria-modal="true"]')].some(shown);
  const keyScope = (el) => !el || el === document.body || stage.contains(el) || el.hasAttribute('data-tn-focus-target') || (mode === 'home' && el.closest('.container') && !el.closest('input, textarea, select, button, [contenteditable]'));
  document.addEventListener('click', (e) => {
    if (installOpen && e.target.closest('#install-close')) { closeInstall(true); return; }
    if (installOpen && !e.target.closest('#install, [data-key="act:install"]')) closeInstall(false);
    if (menuOpen && !e.target.closest('#tn-world-preview, [data-key="eco:filter"]')) closeMenu(false);
    if (hot && !sticky && !e.target.closest('.tnw-portal, #tn-world-preview')) setHot(null);
  });
  document.addEventListener('keydown', (e) => {
    if (mode === 'off' || e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey) return;
    if (e.key === 'Escape') {
      if (installOpen) { closeInstall(true); return; }
      if (menuOpen) { closeMenu(true); return; }
      if (sticky) { cancelSticky(); return; }
      if (current !== '/' && keyScope(document.activeElement) && !modalOpen()) { lastPointer = 'keyboard'; nav(ROUTES[current].parent); }
      return;
    }
    const dirs = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] };
    if (dirs[e.key] && keyScope(document.activeElement) && !modalOpen() && portalsEl.children.length && (mode === 'home' || stage.contains(document.activeElement))) {
      // Move to the nearest control in that direction (from the focused one, or the centre).
      const [dx, dy] = dirs[e.key], from = portalsEl.contains(document.activeElement) ? document.activeElement : null;
      const P = ROUTES[current], o = from ? SLOTS[itemByKey(from.dataset.key).slot] : [0, 0];
      let best = null, score = Infinity;
      for (const a of portalsEl.children) {
        if (a === from) continue;
        const [sx, sy] = SLOTS[itemByKey(a.dataset.key).slot], vx = sx - o[0], vy = sy - o[1], d = Math.hypot(vx, vy);
        const along = (vx * dx + vy * dy) / (d || 1);
        if (along < 0.5) continue;
        const sc = d * (2 - along);
        if (sc < score) { score = sc; best = a; }
      }
      if (best) { e.preventDefault(); lastPointer = 'keyboard'; best.focus(); }
    }
  });
  // Wheel over the navigation area: down opens the glow under (or nearest) the pointer, up goes back.
  let acc = 0, accT = 0;
  addEventListener('wheel', (e) => {
    if (mode === 'off' || e.ctrlKey || modalOpen() || installOpen) return;
    const overNav = mode === 'home' ? !e.target.closest('.container, #tn-world-preview') : wide() && e.clientX < leftW() - 24;
    if (!overNav) return;
    e.preventDefault();
    if (busy) return;
    clearTimeout(accT); accT = setTimeout(() => (acc = 0), 220);
    acc += e.deltaY;
    if (acc > 60) {
      acc = 0;
      let it = hot && itemByKey(hot);
      if (!it) {
        let bestD = Infinity;
        const P = ROUTES[current];
        for (const x of itemsOf(current).values()) {
          const [px, py] = project(...slotPos(P, x.slot));
          const d = Math.hypot(px - e.clientX, py - e.clientY) / Math.max(22, R * P.k * scale());
          if (d < bestD) { bestD = d; it = x; }
        }
        if (bestD > 3) it = null;
      }
      if (it && it.kind === 'route') enter(it.key);
      else if (it && it.route && it.kind === 'entry') nav(it.route);
    } else if (acc < -60) { acc = 0; if (current !== '/') nav(ROUTES[current].parent); }
  }, { passive: false });
  const refit = () => { camTw = null; if (!busy && current) { cam = fit(current); positionPortals(); } draw(); };
  addEventListener('resize', () => { sizeCanvas(); measureHome(); refit(); paintScene(); });
  document.fonts?.ready.then(() => { measureHome(); refit(); });
  mqReduce.addEventListener?.('change', (e) => { reduced = e.matches; kick(); });
  // Theme change: new palette, same scene (no animation, so nothing to reduce).
  addEventListener('tn:theme', () => {
    applyTheme(); looks.clear(); washKey = ''; needFull = true;
    if (current) paintTint(current);
    kick();
  });
  // Prefetch the catalog when someone reaches for Eco on the start page.
  portalsEl.addEventListener('pointerover', (e) => { if (e.target.closest('[data-key="/eco"]')) ensureEco(); });

  // The catalog is small: fetch it once the page is idle, so the first trip to the
  // Ecosystem level already knows its lights.
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 1200));
  if (CAT) idle(() => { if (mode !== 'off') ensureEco(); }, { timeout: 2500 });
  // ── boot ──────────────────────────────────────────────────────────────────
  sizeCanvas();
  const first = routeOf(location.pathname);
  setMode(first); paintScene(first);
  measureHome();
  current = isPage(first) ? first : '/';
  section = readSection(current);
  markSection();
  if (current === '/eco' || ROUTES[current].parent === '/eco') ensureEco();
  cam = fit(current);
  paintCrumbs(current);
  paintTint(current);
  buildPortals();
  draw();
  rotator.sync();

  // Read-only state for automated checks.
  window.__tnWorld = {
    get state() {
      return {
        current, mode, busy, t: trans ? trans.t : null, trans: trans && { P: trans.P, c: trans.c }, hov: { ...HOV }, hot,
        dpr: DPR, dprFull: DPR_FULL, slowMotion, canvas: [cv.width, cv.height], orbs: orbLog.map((o) => ({ ...o })), section, installOpen, menuOpen, page: ecoPage,
        items: current ? [...itemsOf(current).values()].map((i) => ({ key: i.key, kind: i.kind, slot: i.slot, route: i.route || null })) : [],
        eco: eco && eco.list ? { n: eco.list.length, selected: eco.selected, tags: eco.filters.tags } : null,
      };
    },
    hover(id, h) { HOV[id] = h; hot = null; draw(); },
  };
}
