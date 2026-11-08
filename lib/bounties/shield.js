// terp.network port (lib/bounties/): opts.stage = a square element inside the Eco card. The nine inner
// orbs are then drawn here with the site's own orb model (world.css .shield-disc, the same class the
// navigation and lib/section-shield.js use), and hidden while a category is zoomed, so no canvas sampling
// or corner masks are needed. Without opts.stage the overlay reads the navigation as before.
//
// The shield overlay (v3). The shield itself is terp.network's navigation (lib/fractal/world.js,
// byte-identical to live build 75b05170f8); this module draws on top of it, reading where the
// lights are from the navigation's own controls, and never moves or redraws the orbs.
//
// Overview: nine categories, one per inner orb (n, e, s, w, C and the four corners), each
//   category's bounties drawn fully inside its orb, labelled with a count underneath. The orb
//   (a 24+ px target) zooms in.
// Zoomed (v3.1): one large orb, drawn with the shield's own orb model (world.css .shield-disc tokens:
//   --c / --body / --core, soft core, short soft edge, small halo), grows out of that orb and covers
//   the five inner orbs on the axes; the four corner orbs, which reach past it, are masked with the
//   level's own background colour (sampled from the navigation canvas). The category's subgraph
//   (dependency links solid, shared-topic links dashed) sits inside the orb,
//   one 24+ px target per bounty. The BOTTOM outer orb (S) becomes the back button; the top
//   orb (N, world.js) still goes back to Eco.
import { CATEGORIES, CAT_BY_KEY, catOf, byRank } from '/lib/bounties/data.js?v=eeb0c09c37';

const R = 8.7;                 // orb radius in the mark's units (world.js)
const ORB_IN = R - 0.9;        // discs stay inside this radius
const CAT_HIT = 11;            // category target radius (inner orbs are 25 apart)
const ZR = 36;                 // v3.1 zoom orb: body radius (covers n/e/s/w/C incl. halos: 25 + 11.3 = 36.3 at the rim)
const ZH = 38.6;               // its halo ends here: ZR + the shield orbs' halo width (11.3 - 8.7); N/E/S/W bodies start at 39.3
const ZIN = ZR - 1.6;          // subgraph cells stay inside this radius
const ZTOP = -ZR + 7;          // title band at the top of the orb
const ERASE = 13;              // corner masks: radius (> the orbs' halo, 11.3)
const CORNERS = [[-25, -25], [25, -25], [25, 25], [-25, 25]];
const CELL_MIN = 26, CELL_MAX = 58, LABEL_AT = 40;         // px
const TIER = { T1: 0.8, T2: 0.9, T3: 1, T4: 1.1, T5: 1.2 };

function el(tag, attrs, kids) {
  const e = tag.startsWith('svg:') ? document.createElementNS('http://www.w3.org/2000/svg', tag.slice(4)) : document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) { if (v == null || v === false) continue; if (k === 'text') e.textContent = v; else e.setAttribute(k, v === true ? '' : v); }
  for (const c of kids || []) if (c != null) e.append(typeof c === 'string' ? document.createTextNode(c) : c);
  return e;
}
const short = (t, k = 52) => (t.length > k ? t.slice(0, k - 1).trimEnd() + '…' : t);

export function linksOf(nodes) {
  const ids = new Set(nodes.map((n) => n.id)), out = [], seen = new Set();
  for (const n of nodes) for (const d of n.deps || []) if (ids.has(d)) { out.push({ a: d, b: n.id, kind: 'dep' }); seen.add([d, n.id].sort().join('|')); }
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    const a = nodes[i], b = nodes[j], k = [a.id, b.id].sort().join('|');
    if (seen.has(k)) continue;
    const shared = a.skills.filter((s) => b.skills.includes(s));
    if ((a.subcategory && a.subcategory === b.subcategory) || shared.length >= 2) out.push({ a: a.id, b: b.id, kind: 'topic', why: a.subcategory === b.subcategory ? a.subcategory : shared.join(', ') });
  }
  return out;
}

// v3.1: hex cells inside the zoom orb (a circle), below its title band
function cellsFor(n, u) {
  const cy = 2.5;   // the grid's centre sits a little low, under the title
  const mk = (s) => {
    const out = [], h = s * 0.866, K = Math.ceil(ZR / h) + 1;
    for (let j = -K; j <= K; j++) {
      const y = cy + j * h, off = (j & 1) ? s / 2 : 0;
      for (let i = -K - 1; i <= K + 1; i++) {
        const x = i * s + off;
        if (Math.hypot(x, y) + s / 2 <= ZIN && y - s / 2 >= ZTOP) out.push([x, y]);
      }
    }
    return out;
  };
  let s = CELL_MAX / u, pts = mk(s);
  while (pts.length < n && s > CELL_MIN / u) { s = Math.max(CELL_MIN / u, s * 0.97); pts = mk(s); }
  pts.sort((p, q) => Math.hypot(p[0], (p[1] - cy) * 1.1) - Math.hypot(q[0], (q[1] - cy) * 1.1));
  return { s, pts, cap: pts.length };
}

// the level's background colour around each corner orb, read from the navigation's canvas (3 points
// just outside its halo, away from every other orb); null if the canvas can't be read
function sampleBg(geo) {
  try {
    const cv = document.querySelector('#tn-world canvas');
    const g = cv && cv.getContext('2d', { willReadFrequently: true });
    if (!g) return null;
    const r = cv.getBoundingClientRect(), kx = cv.width / r.width, ky = cv.height / r.height;
    const ox = geo.fixed ? geo.cx : geo.cx + geo.rootLeft, oy = geo.fixed ? geo.cy : geo.cy + geo.rootTop;
    return CORNERS.map(([X, Y]) => {
      const sx = Math.sign(X), sy = Math.sign(Y), acc = [0, 0, 0];
      const pts = [[X + sx * 12.5, Y], [X, Y + sy * 12.5], [X + sx * 8.84, Y + sy * 8.84]];
      for (const [px, py] of pts) {
        const d = g.getImageData(Math.round((ox + px * geo.u - r.left) * kx), Math.round((oy + py * geo.u - r.top) * ky), 1, 1).data;
        acc[0] += d[0]; acc[1] += d[1]; acc[2] += d[2];
      }
      return `rgb(${acc.map((v) => Math.round(v / pts.length)).join(' ')})`;
    });
  } catch { return null; }
}

export function mountShield(root, shield, M, ctx, opts = {}) {
  const stage = opts.stage || null;
  const origin = el('div', { class: 'bx-origin' });
  // v3.1: the zoom orb (shield-disc model) + four corner masks; .bx3-cover is the grow/fade wrapper
  const erasers = stage ? [] : CORNERS.map(([x, y], i) => el('span', { class: 'bx3-erase', 'data-corner': String(i), style: `--ex:${x};--ey:${y}` }));
  const zorb = el('span', { class: 'shield-disc bx3-zorb' });
  const cover = el('div', { class: 'bx3-cover', 'aria-hidden': 'true' }, [...erasers, zorb, el('span', { class: 'bx3-cover-title' })]);
  let bgKey = '';
  const svg = el('svg:svg', { class: 'bx-edges bx3-edges', viewBox: '-57 -57 114 114', 'aria-hidden': 'true' });
  const tip = el('div', { class: 'bx-tip', 'aria-hidden': 'true' });
  const back = el('button', { type: 'button', class: 'shield-orb bx3-back', 'aria-label': 'Back to all nine categories' }, [el('span', { class: 'shield-disc' }), el('span', { class: 'bx3-back-icon', 'aria-hidden': 'true' })]);
  const backLabel = el('span', { class: 'bx3-back-label', 'aria-hidden': 'true', text: 'All categories' });
  // stage mode: the nine inner orbs themselves (site orb model), under everything else
  const bases = stage ? CATEGORIES.map((c) => el('span', { class: 'shield-disc bxs-base', 'data-key': c.key, 'aria-hidden': 'true', style: `--x:${c.at[0]};--y:${c.at[1]};--c:${c.color}` })) : [];
  origin.append(...bases, cover, svg);
  shield.append(origin);
  const nodes = M.all.slice().sort(byRank);
  const nodeEls = new Map(), catEls = new Map(), labelEls = new Map();
  let zoom = null, Z = null, geo = null, shown = false, hov = null, lastKey = '', settleT = 0;

  // overview positions: each category's discs fully inside its orb (same scale for all nine)
  const byCat = new Map(CATEGORIES.map((c) => [c.key, nodes.filter((n) => catOf(n) === c)]));
  const nmax = Math.max(...[...byCat.values()].map((a) => a.length));
  const step = ORB_IN / (Math.sqrt(nmax - 0.5) + 0.75), dOver = step * 0.82;   // disc box (units) = 1.4 x shield-d
  const P0 = {};
  for (const [k, arr] of byCat) {
    const [sx, sy] = CAT_BY_KEY[k].at;
    arr.forEach((n, i) => { const r = step * Math.sqrt(i + 0.5), th = i * 2.399963 - Math.PI / 2; P0[n.id] = [sx + r * Math.cos(th), sy + r * Math.sin(th)]; });
  }

  for (const c of CATEGORIES) {
    const b = el('button', { type: 'button', class: 'bx3-cat', 'data-key': c.key, style: `--c:${c.color}` });
    b.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') { const id = nearest(c, e.clientX, e.clientY); if (id !== hov) hover(id); } });
    b.addEventListener('pointerleave', () => hover(null));
    b.addEventListener('focus', () => { showTip({ cat: c }); });
    b.addEventListener('blur', () => showTip(null));
    b.addEventListener('click', (e) => ctx.setCat(c.key, { focus: e.detail === 0 }));
    catEls.set(c.key, b);
    const l = el('span', { class: 'bx3-catlabel', 'data-key': c.key, 'aria-hidden': 'true' });
    labelEls.set(c.key, l);
    origin.append(b, l);
  }
  for (const n of nodes) {
    const c = catOf(n);
    const b = el('button', { type: 'button', class: 'shield-orb bx3-node', 'data-id': n.id, 'data-cat': c.key, tabindex: '-1', 'aria-label': `${n.id}: ${n.title}. ${n.priority}, ${n.tier}, ${n.horizon}.` },
      [el('span', { class: 'shield-disc', style: `--c:${c.color}` }), el('span', { class: 'bx3-node-id', text: n.id.replace(/^TB-/, '') })]);
    b.style.setProperty('--sz', TIER[n.tier] || 1);
    b.addEventListener('pointerenter', () => hover(n.id));
    b.addEventListener('pointerleave', () => hover(null));
    b.addEventListener('focus', () => hover(n.id));
    b.addEventListener('blur', () => hover(null));
    b.addEventListener('click', () => ctx.onSelect(n.id, { from: 'shield' }));
    nodeEls.set(n.id, b);
    origin.append(b);
  }
  back.addEventListener('click', () => { const was = zoom; ctx.setCat(null, { back: was }); });
  origin.append(back, backLabel, tip);

  function nearest(c, x, y) {
    let best = null, bd = Infinity;
    for (const n of byCat.get(c.key)) { const r = nodeEls.get(n.id).getBoundingClientRect(); const d = Math.hypot(r.left + r.width / 2 - x, r.top + r.height / 2 - y); if (d < bd) { bd = d; best = n.id; } }
    return best;
  }
  function geometry() {
    if (stage) {
      if (!stage.isConnected || stage.closest('[hidden]')) return null;
      const r = stage.getBoundingClientRect(), mr = root.getBoundingClientRect();
      const u = r.width / 120;   // the stage spans -60u..60u: inner orbs at ±25, back orb at 48
      if (!(u > 0.5)) return null;
      return { cx: r.left + r.width / 2 - mr.left, cy: r.top + r.height / 2 - mr.top, u, fixed: false, rootLeft: mr.left, rootTop: mr.top };
    }
    const P = document.querySelector('#tn-world .tnw-portals');
    if (!P || P.classList.contains('is-hidden')) return null;
    const get = (k) => { const a = P.querySelector(`[data-key="${k}"]`); if (!a) return null; const r = a.getBoundingClientRect(); return r.width ? [r.left + r.width / 2, r.top + r.height / 2] : null; };
    const n = get('up:eco'), w = get('sec:graph'), e = get('sec:priorities');
    if (!n || !w || !e) return null;
    const u = (e[0] - w[0]) / 96;
    if (!(u > 0.5)) return null;
    const worldEl = document.getElementById('tn-world');
    const fixed = worldEl && getComputedStyle(worldEl).position === 'fixed';
    let cx = (w[0] + e[0]) / 2, cy = (w[1] + e[1]) / 2;
    if (!fixed) { const mr = root.getBoundingClientRect(); cx -= mr.left; cy -= mr.top; }
    const mr = root.getBoundingClientRect();
    return { cx, cy, u, fixed, rootLeft: mr.left, rootTop: mr.top };
  }

  function layoutZoom(key, u) {
    const c = CAT_BY_KEY[key], arr = byCat.get(key), links = linksOf(arr);
    const { s, pts, cap } = cellsFor(arr.length, u);
    // breadth-first from the top-ranked bounty so linked bounties sit next to each other
    const adj = new Map(arr.map((n) => [n.id, []]));
    for (const l of links) { adj.get(l.a).push([l.b, l.kind]); adj.get(l.b).push([l.a, l.kind]); }
    const order = [], seen = new Set();
    for (const start of arr) {
      if (seen.has(start.id)) continue;
      const q = [start.id]; seen.add(start.id);
      while (q.length) {
        const id = q.shift(); order.push(id);
        const nb = adj.get(id).sort((a, b) => (a[1] === 'dep' ? 0 : 1) - (b[1] === 'dep' ? 0 : 1) || byRank(M.byId[a[0]], M.byId[b[0]]));
        for (const [x] of nb) if (!seen.has(x)) { seen.add(x); q.push(x); }
      }
    }
    const P = {};
    order.forEach((id, i) => { P[id] = pts[i] || pts[pts.length - 1]; });
    return { key, cat: c, P, s, cap, links, ids: new Set(arr.map((n) => n.id)), n: arr.length };
  }

  function paintEdges() {
    svg.replaceChildren();
    if (!Z) return;
    for (const l of Z.links) {
      const p = Z.P[l.a], q = Z.P[l.b];
      const line = el('svg:line', { class: 'bx3-edge bx3-edge--' + l.kind, 'data-a': l.a, 'data-b': l.b, x1: p[0], y1: p[1], x2: q[0], y2: q[1] });
      svg.append(line);
    }
    paintSel();
  }

  function place() {
    geo = geometry();
    if (!geo) return;
    const { u } = geo;
    shield.style.position = geo.fixed ? 'fixed' : 'absolute';
    origin.style.left = geo.cx + 'px'; origin.style.top = geo.cy + 'px';
    shield.style.setProperty('--u', u + 'px');
    if (zoom && (!Z || Z.key !== zoom || Math.abs(Z.u - u) > 0.01)) { Z = layoutZoom(zoom, u); Z.u = u; paintEdges(); }
    if (!zoom && Z) { Z = null; paintEdges(); }
    shield.classList.toggle('is-zoomed', !!Z);
    shield.classList.toggle('is-narrow', u < 3);
    shield.dataset.zoom = Z ? Z.key : '';
    shield.style.setProperty('--d-over', dOver * u / 1.4 + 'px');
    if (Z) {
      shield.style.setProperty('--cell', Z.s * u + 'px');
      shield.style.setProperty('--cc', Z.cat.color);
      shield.classList.toggle('has-ids', Z.s * u >= LABEL_AT);
      cover.style.setProperty('--ox', Z.cat.at[0] * u + 'px'); cover.style.setProperty('--oy', Z.cat.at[1] * u + 'px');
      cover.querySelector('.bx3-cover-title').textContent = `${Z.cat.name} · ${Z.n}`;
      const k = [Math.round(geo.u * 10), document.documentElement.dataset.theme || '', Math.round(geo.cx), Math.round(geo.cy)].join('|');
      if (!stage && k !== bgKey) { const bg = sampleBg(geo); if (bg) { bgKey = k; erasers.forEach((e, i) => e.style.setProperty('--bg', bg[i])); } }
    }
    for (const n of nodes) {
      const b = nodeEls.get(n.id), zin = !!(Z && Z.ids.has(n.id));
      const p = zin ? Z.P[n.id] : P0[n.id];
      b.classList.toggle('is-zin', zin);
      b.classList.toggle('is-out', !!Z && !zin);
      b.classList.toggle('is-filtered', !ctx.isMatch(n));
      b.tabIndex = zin ? 0 : -1;
      b.style.left = p[0] * u + 'px'; b.style.top = p[1] * u + 'px';
    }
    for (const c of CATEGORIES) {
      const b = catEls.get(c.key), l = labelEls.get(c.key), arr = byCat.get(c.key), m = arr.filter(ctx.isMatch).length;
      b.style.left = c.at[0] * u + 'px'; b.style.top = c.at[1] * u + 'px';
      b.style.width = b.style.height = Math.max(24, 2 * CAT_HIT * u) + 'px';
      b.tabIndex = Z ? -1 : 0;
      b.setAttribute('aria-label', `${c.name}: ${m === arr.length ? arr.length : `${m} of ${arr.length}`} bounties. Press Enter to open.`);
      l.replaceChildren(el('span', { class: 'bx3-cl-n', text: c.short }), ' ', el('span', { class: 'bx3-cl-c', text: m === arr.length ? String(arr.length) : `${m}/${arr.length}` }));
      l.style.left = c.at[0] * u + 'px'; l.style.top = (c.at[1] + R + (u < 3 ? -0.6 : 0.4)) * u + 'px';
    }
    back.style.left = '0px'; back.style.top = 48 * u + 'px';
    back.style.width = back.style.height = Math.max(24, 2 * R * u) + 'px';
    back.tabIndex = Z ? 0 : -1;
    backLabel.style.left = (R + 1.6) * u + 'px'; backLabel.style.top = 48 * u + 'px';
    paintSel();
  }

  function paintSel() {
    const sel = ctx.selected(), focus = hov || sel;
    for (const [id, b] of nodeEls) { b.setAttribute('aria-selected', String(id === sel)); b.classList.toggle('is-hot', id === hov); }
    for (const line of svg.children) line.classList.toggle('is-on', !!focus && (line.dataset.a === focus || line.dataset.b === focus));
  }
  function showTip(t) {
    if (!t || !geo) { tip.classList.remove('is-on'); return; }
    const u = geo.u;
    if (t.cat) {
      const arr = byCat.get(t.cat.key);
      tip.textContent = `${t.cat.name} · ${arr.length} bounties · Enter to open`;
      tip.style.left = t.cat.at[0] * u + 'px'; tip.style.top = (t.cat.at[1] - CAT_HIT) * u - 4 + 'px';
    } else {
      const b = nodeEls.get(t.id), r = b.getBoundingClientRect();
      tip.textContent = `${t.id} · ${short(t.title)}`;
      tip.style.left = b.style.left; tip.style.top = parseFloat(b.style.top) - r.height / 2 - 4 + 'px';
    }
    tip.classList.add('is-on');
  }
  function hover(id) { hov = id; paintSel(); showTip(id ? M.byId[id] : null); ctx.onHover && ctx.onHover(id); }

  // shown only while the navigation is at rest on this level
  function sync() {
    if (!root.isConnected) { if (!stage) { mo.disconnect(); clearInterval(iv); } return; }   // stage mode: the plane is moved in and out of the card
    const moving = !stage && (document.documentElement.hasAttribute('data-tn-moving') || document.documentElement.getAttribute('data-tn-xfade') === 'out');
    const g = !moving && geometry();
    if (!g) { if (shown) { shown = false; shield.classList.remove('is-in'); } return; }
    const key = [g.cx, g.cy, g.u].map((v) => Math.round(v * 2)).join(',');
    if (key !== lastKey) { lastKey = key; clearTimeout(settleT); settleT = setTimeout(schedule, 120); }
    place();
    if (!shown) { shown = true; requestAnimationFrame(() => requestAnimationFrame(() => shield.classList.add('is-in'))); }
  }
  let q = 0;
  const schedule = () => { if (!q) q = requestAnimationFrame(() => { q = 0; sync(); }); };
  const mo = new MutationObserver(schedule);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-tn-moving', 'data-tn-xfade', 'data-tn-world', 'data-theme'] });
  const portals = document.querySelector('#tn-world .tnw-portals');
  if (portals && !stage) mo.observe(portals, { attributes: true, subtree: true, childList: true, attributeFilter: ['style', 'class'] });
  addEventListener('resize', schedule);
  if (stage && typeof ResizeObserver === 'function') new ResizeObserver(schedule).observe(stage);
  document.body.addEventListener('transitionend', (e) => { if (e.target === document.body) schedule(); });
  document.fonts?.ready.then(schedule);
  const iv = setInterval(() => { if (shown && geo && !geo.fixed && !document.hidden) schedule(); }, 250);
  addEventListener('scroll', () => { if (geo && !geo.fixed) schedule(); }, { passive: true });

  return {
    setZoom(key, opt = {}) {
      zoom = key && CAT_BY_KEY[key] ? key : null;
      hov = null; showTip(null);
      shield.classList.add('is-morph'); clearTimeout(this._mt); this._mt = setTimeout(() => shield.classList.remove('is-morph'), 650);
      place();
      if (opt.focus && Z) { const first = [...Z.ids].map((id) => nodeEls.get(id)).sort((a, b) => parseFloat(a.style.top) - parseFloat(b.style.top) || parseFloat(a.style.left) - parseFloat(b.style.left))[0]; first?.focus({ preventScroll: true }); }
      if (opt.back && !zoom) catEls.get(opt.back)?.focus({ preventScroll: true });
    },
    refresh() { place(); },
    paintSel,
    focusNode(id) { nodeEls.get(id)?.focus({ preventScroll: true }); },
    schedule,
    get state() { return { zoom, shown, geo, cell: Z ? Z.s * (geo ? geo.u : 0) : null, links: Z ? Z.links.length : 0, n: Z ? Z.n : null, cap: Z ? Z.cap : null }; },
  };
}
