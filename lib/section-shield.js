// Section picker for content pages: a small grid of solid discs inside the
// page text; selecting one shows its panel and hides the others.
//
// Markup (auto-mounted on load and after every soft navigation):
//   <div data-shield data-shield-hash="network" data-shield-label="Network topics">
//     <section data-shield-panel="consensus" data-shield-title="Consensus">…</section>
//     <section data-shield-panel="tokens" data-shield-title="Two tokens">…</section>
//   </div>
// Optional attributes on the root:
//   data-shield-hash    hash prefix; the open panel is kept in the address bar as
//                       #<prefix>/<panel> (back/forward work). Omit for no deep links.
//   data-shield-default panel shown when the address names none (default: first)
//   data-shield-cols    discs per row on wide screens (default: number of panels, max 6)
//   data-shield-cols-narrow  discs per row below 600px (default: 3)
//   data-shield-label   accessible name of the disc grid
// A child [data-shield-orbs] marks where the grid goes (default: before the first panel).
// Without JavaScript nothing is hidden: every panel shows, one after the other.
//
// JS: import { mountShield, mountAll } from '/lib/section-shield.js';
//   const s = mountShield(el, { hash: 'network', onChange: (id) => {} });
//   s.select('tokens'); s.current; s.destroy();
// Each root also gets el.shield (the same controller) and fires a bubbling
// 'shield:change' event with detail { id, panel }.

const live = new Set();
const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
let seq = 0;

function hashParts() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  const i = h.indexOf('/');
  return i < 0 ? [h, ''] : [h.slice(0, i), h.slice(i + 1)];
}

export function mountShield(root, opts = {}) {
  if (!root) return null;
  if (root.shield) return root.shield;
  const ds = root.dataset;
  const prefix = opts.hash ?? ds.shieldHash ?? '';
  const panels = [...root.querySelectorAll('[data-shield-panel]')].filter((p) => p.closest('[data-shield]') === root);
  if (!panels.length) return null;
  const n = ++seq;
  const ids = panels.map((p) => p.dataset.shieldPanel);
  const cols = Math.max(1, Math.min(+(opts.cols ?? ds.shieldCols) || Math.min(6, panels.length), panels.length));
  const colsN = Math.max(1, Math.min(+(opts.colsNarrow ?? ds.shieldColsNarrow) || 3, panels.length));
  const def = ids.includes(opts.default ?? ds.shieldDefault) ? (opts.default ?? ds.shieldDefault) : ids[0];

  const grid = document.createElement('div');
  grid.className = 'shield-orbs';
  grid.setAttribute('role', 'tablist');
  grid.setAttribute('aria-label', opts.label ?? ds.shieldLabel ?? 'Sections');
  grid.style.setProperty('--shield-cols', cols);
  grid.style.setProperty('--shield-cols-n', colsN);
  const tabs = panels.map((p, i) => {
    const id = ids[i];
    if (!p.id) p.id = `shield${n}-p-${id}`;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'shield-orb';
    b.id = `shield${n}-t-${id}`;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-controls', p.id);
    b.dataset.shieldFor = id;
    const title = p.dataset.shieldTitle || p.querySelector('h2,h3,h4')?.textContent || id;
    b.innerHTML = '<span class="shield-disc" aria-hidden="true"></span><span class="shield-label"></span>';
    b.lastChild.textContent = title;
    p.setAttribute('role', 'tabpanel');
    p.setAttribute('aria-labelledby', b.id);
    p.classList.add('shield-panel');
    grid.appendChild(b);
    return b;
  });
  const slot = root.querySelector('[data-shield-orbs]');
  if (slot && slot.closest('[data-shield]') === root) slot.replaceWith(grid);
  else panels[0].before(grid);

  let current = null;
  function show(id, animate) {
    if (!ids.includes(id)) id = def;
    if (id === current) return;
    const first = current === null;
    current = id;
    tabs.forEach((t, i) => {
      const on = ids[i] === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      panels[i].hidden = !on;
      panels[i].classList.remove('is-entering');
    });
    const p = panels[ids.indexOf(id)];
    if (animate && !first && !reduced()) { void p.offsetWidth; p.classList.add('is-entering'); }
    if (!first) {
      opts.onChange?.(id, p);
      root.dispatchEvent(new CustomEvent('shield:change', { bubbles: true, detail: { id, panel: p } }));
    }
  }
  function fromHash(animate) {
    if (!prefix) return false;
    const [k, sub] = hashParts();
    if (k !== prefix) return false;
    // No panel named (#network): keep the open one; on first mount, the default.
    show(ids.includes(sub) ? sub : current ?? def, animate);
    return true;
  }
  function select(id, { push = true } = {}) {
    if (!ids.includes(id)) return;
    if (prefix && push) {
      const h = `${prefix}/${id}`;
      if (location.hash.slice(1) !== h) { location.hash = h; return; } // hashchange shows it
    }
    show(id, true);
  }

  grid.addEventListener('click', (e) => {
    const b = e.target.closest('.shield-orb');
    if (b) { select(b.dataset.shieldFor); b.focus(); }
  });
  grid.addEventListener('keydown', (e) => {
    const i = tabs.indexOf(document.activeElement);
    if (i < 0) return;
    const per = getComputedStyle(grid).gridTemplateColumns.split(' ').filter(Boolean).length || cols;
    let j = null;
    switch (e.key) {
      case 'ArrowRight': j = Math.min(tabs.length - 1, i + 1); break;
      case 'ArrowLeft': j = Math.max(0, i - 1); break;
      case 'ArrowDown': j = i + per < tabs.length ? i + per : i; break;
      case 'ArrowUp': j = i - per >= 0 ? i - per : i; break;
      case 'Home': j = e.ctrlKey ? 0 : i - (i % per); break;
      case 'End': j = e.ctrlKey ? tabs.length - 1 : Math.min(tabs.length - 1, i - (i % per) + per - 1); break;
      default: return; // Enter and Space press the button (click)
    }
    e.preventDefault();
    tabs.forEach((t, k) => { t.tabIndex = k === j ? 0 : -1; });
    tabs[j].focus();
  });
  // Roving focus resets to the open disc when focus leaves the grid.
  grid.addEventListener('focusout', (e) => {
    if (grid.contains(e.relatedTarget)) return;
    tabs.forEach((t, k) => { t.tabIndex = ids[k] === current ? 0 : -1; });
  });

  if (!fromHash(false)) show(def, false);
  root.setAttribute('data-shield-on', '');

  const ctl = {
    root, ids,
    get current() { return current; },
    select,
    sync: () => fromHash(true),
    destroy() {
      live.delete(ctl);
      grid.remove();
      panels.forEach((p) => { p.hidden = false; p.classList.remove('is-entering'); p.removeAttribute('role'); p.removeAttribute('aria-labelledby'); });
      root.removeAttribute('data-shield-on');
      delete root.shield;
    },
  };
  root.shield = ctl;
  live.add(ctl);
  return ctl;
}

export function mountAll(scope = document) {
  return [...scope.querySelectorAll('[data-shield]')].map((el) => mountShield(el)).filter(Boolean);
}

// Session-level wiring (this module runs once; lib/shell keeps these listeners).
function prune() { live.forEach((c) => { if (!c.root.isConnected) live.delete(c); }); }
addEventListener('hashchange', () => { prune(); live.forEach((c) => c.sync()); });
addEventListener('tn:navigated', () => { prune(); mountAll(); });
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => mountAll(), { once: true });
else mountAll();
