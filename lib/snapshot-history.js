// snapshot-history.js — the morocco-1 block history record as a native view:
// which block heights can still be served from an archive, as recorded on
// 2026-09-15. Figures match scripts/snapshots/historical-record.html; private
// storage paths are summarised, not published.

const DATA = {
  recordedAt: '2026-09-15 19:00 UTC',
  chainId: 'morocco-1',
  chainTip: 23224649,
  stall: 19127861,
  upgrades: [
    { name: 'v2', height: 2847602 },
    { name: 'v3', height: 3039061 },
    { name: 'v4', height: 3341663 },
    { name: 'v4.1.0', height: 3698609 },
    { name: 'v5', height: 14170662 },
    { name: 'v6', height: 22810000 },
    { name: 'v6.1', height: 23191300 },
    { name: 'v6.2', height: 23191302 },
  ],
  packs: [
    {
      id: 'genesis-era',
      name: 'Genesis-era block archive',
      kind: 'full-blocks',
      from: 1,
      to: 11411801,
      size: 182536110080,
      when: 'Unpacked 2026-08-04 · lz4 backup 2025-04-09',
      where: 'Private storage (not published)',
      notes: 'One coverage window, kept as an unpacked node, a packed lz4 copy and an external-drive copy. The copies are counted once, not added together.',
      evidence: 'RPC on the unpacked node: earliest 1, latest 11,411,801. Blocks 1 and 11,411,801 return; 11,411,802 does not. 75 GiB blockstore. The lz4 backup is the same era (tip 11,411,800), not extra heights.',
    },
    {
      id: 'public-archive',
      name: 'Public archive pack',
      file: 'morocco-1_23222709_2026-09-15T00-27-12Z.tar.lz4',
      kind: 'block-window',
      from: 18053334,
      to: 23222709,
      size: 64147767608,
      when: '2026-09-15',
      where: 'Published archive pack (since replaced by newer packs)',
      notes: 'Queryable blocks 18,053,334 → 23,222,709. An older unpacked freeze of 18,053,334–22,168,311 sits inside this window and adds no extra coverage.',
      evidence: 'Live RPC earliest_block_height = 18,053,334. Blocks 1 and 11,411,800 fail; 18,053,334 and 23,222,709 return. Copied from that node at halt.',
    },
    {
      id: 'public-pruned',
      name: 'Public pruned pack',
      file: 'morocco-1_23222707_2026-09-15T00-02-29Z.tar.lz4',
      kind: 'live-catalog',
      from: 23222707,
      to: 23222707,
      size: 222902780,
      when: '2026-09-15',
      where: 'Published pruned pack (replaced daily)',
      notes: 'The daily app-state pack. It starts a node but holds no block history, so it does not count towards block coverage.',
      evidence: 'State-sync tip; wasm cache excluded.',
    },
  ],
};

const LANES = [
  { id: 'full', label: 'Queryable blocks', short: 'Blocks' },
  { id: 'live', label: 'Pruned pack', short: 'Pruned' },
  { id: 'meta', label: 'Upgrades', short: 'Upgrades' },
];

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const fmt = (n) => (n == null ? '—' : Number(n).toLocaleString('en-US'));
function bytes(n) {
  if (!n) return '—';
  const u = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let i = 0; let x = n;
  while (x >= 1024 && i < u.length - 1) { x /= 1024; i++; }
  return `${x >= 10 || i === 0 ? x.toFixed(0) : x.toFixed(1)} ${u[i]}`;
}
const hasBlocks = (p) => (p.kind === 'full-blocks' || p.kind === 'block-window') && p.from != null && p.to != null;
const laneOf = (p) => (hasBlocks(p) ? 'full' : 'live');
const kindLabel = (p) => (p.kind === 'full-blocks' ? 'Full blocks from genesis' : p.kind === 'block-window' ? 'Block window' : 'App state only');

function mergeRanges(segs) {
  const s = segs.map(([a, b]) => [Math.min(a, b), Math.max(a, b)]).sort((x, y) => x[0] - y[0]);
  const out = [];
  for (const [a, b] of s) {
    if (!out.length || a > out[out.length - 1][1] + 1) out.push([a, b]);
    else out[out.length - 1][1] = Math.max(out[out.length - 1][1], b);
  }
  return out;
}
export function blockRanges(data = DATA) { return mergeRanges(data.packs.filter(hasBlocks).map((p) => [p.from, p.to])); }
export function gaps(data = DATA) {
  const g = []; let c = 1;
  for (const [a, b] of blockRanges(data)) {
    if (a > c) g.push({ from: c, to: a - 1, why: 'No archive holds these blocks.' });
    c = Math.max(c, b + 1);
  }
  if (c <= data.chainTip) g.push({ from: c, to: data.chainTip, why: 'Blocks after the last archive pack, up to the recorded tip.' });
  return g;
}
export function summary(data = DATA) {
  const covered = blockRanges(data).reduce((s, [a, b]) => s + (b - a + 1), 0);
  const missing = gaps(data).reduce((s, x) => s + (x.to - x.from + 1), 0);
  return { covered, missing, pct: Math.min(100, (covered / data.chainTip) * 100) };
}

const NS = 'http://www.w3.org/2000/svg';
function svgEl(name, attrs, text) {
  const n = document.createElementNS(NS, name);
  for (const [k, v] of Object.entries(attrs || {})) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}

export function mountSnapshotHistory(host) {
  if (!host || host.dataset.ready) return;
  host.dataset.ready = '1';
  const s = summary();
  const hole = gaps()[0];
  host.innerHTML = `
    <article class="snap-card sh-card" aria-labelledby="sh-title">
      <p class="res-kicker">Block history</p>
      <h3 id="sh-title">${esc(DATA.chainId)} historical record</h3>
      <p class="res-note">Which block heights of <code>${esc(DATA.chainId)}</code> can still be queried from an archive. Overlapping copies are merged, never added together. Recorded ${esc(DATA.recordedAt)}.</p>
      <div class="sh-stats">
        <div><b>${fmt(DATA.chainTip)}</b><span>chain tip when recorded</span></div>
        <div><b>1 – ${fmt(11411801)}</b><span>genesis-era archive</span></div>
        <div><b>${fmt(18053334)} – ${fmt(23222709)}</b><span>public archive window</span></div>
        <div><b>${fmt(s.missing)}</b><span>heights with no archive</span></div>
        <div><b>${s.pct.toFixed(1)}%</b><span>of the chain covered by full blocks</span></div>
      </div>
      <div class="sh-tools">
        <label>Scale <select class="sh-scale"><option value="linear">Linear height</option><option value="log">Log height</option></select></label>
        <label><input type="checkbox" class="sh-gaps" checked> Show gaps</label>
        <span class="sh-zoom">
          <button type="button" class="snap-btn sh-in" aria-label="Zoom in">+</button>
          <button type="button" class="snap-btn sh-out" aria-label="Zoom out">−</button>
          <button type="button" class="snap-btn sh-fit">Fit all</button>
        </span>
      </div>
      <ul class="sh-legend">
        <li><i class="sw full"></i>Full block archive</li>
        <li><i class="sw live"></i>Pruned pack (app state only)</li>
        <li><i class="sw upg"></i>Upgrade halt</li>
        <li><i class="sw gap"></i>No archive</li>
        <li><i class="sw stall"></i>Chain stall</li>
      </ul>
      <div class="sh-stage"><svg class="sh-svg" role="group" aria-label="Block coverage of ${esc(DATA.chainId)} by height. Select a bar, gap or upgrade line for details."></svg></div>
      <p class="sh-hint">Drag to pan. Zoom with the buttons or Ctrl + scroll. Select a bar, gap or upgrade for details.</p>
      <div class="sh-detail" aria-live="polite"><p class="muted">Select a pack, a gap or an upgrade.</p></div>
      <h4 class="sh-h">Catalog</h4>
      <div class="sh-scroll"><table class="sh-table">
        <thead><tr><th>Pack</th><th>Kind</th><th>Heights</th><th>Size</th><th>Where</th></tr></thead>
        <tbody>${DATA.packs.map((p) => `<tr class="sh-row" data-id="${p.id}" tabindex="0">
          <td>${esc(p.name)}${p.file ? `<br><code class="sh-file">${esc(p.file)}</code>` : ''}</td>
          <td><span class="sh-tag ${laneOf(p)}">${esc(kindLabel(p))}</span></td>
          <td class="n">${p.from === p.to ? fmt(p.from) : `${fmt(p.from)} – ${fmt(p.to)}`}</td>
          <td class="n">${bytes(p.size)}</td>
          <td>${esc(p.where)}</td></tr>`).join('')}
          ${gaps().map((g) => `<tr><td>No archive</td><td><span class="sh-tag gap">Gap</span></td><td class="n">${fmt(g.from)} – ${fmt(g.to)}</td><td class="n">${fmt(g.to - g.from + 1)} heights</td><td>${esc(g.why)}</td></tr>`).join('')}
        </tbody></table></div>
      <p class="res-note sh-foot">Coverage is the union of the archive windows above. The hole from <strong class="n">${fmt(hole.from)}</strong> to <strong class="n">${fmt(hole.to)}</strong> remains: no known pack can serve those blocks. The packs listed here have since been replaced; the newest downloads are under <a href="#snapshots">Current packs</a>.</p>
    </article>`;

  const svg = host.querySelector('.sh-svg');
  const detail = host.querySelector('.sh-detail');
  const scaleSel = host.querySelector('.sh-scale');
  const gapsBox = host.querySelector('.sh-gaps');
  const H = 330;
  const full = () => ({ x0: 0, x1: DATA.chainTip * 1.02 });
  let view = full();

  const padL = () => ((svg.clientWidth || 900) < 520 ? 84 : 124);
  function xScale(h) {
    const w = svg.clientWidth || 900; const inner = w - padL() - 14;
    const a = view.x0; const b = view.x1;
    let t;
    if (scaleSel.value === 'log') {
      const la = Math.log10(Math.max(1, a)); const lb = Math.log10(Math.max(2, b));
      t = (Math.log10(Math.max(1, h)) - la) / (lb - la);
    } else t = (h - a) / (b - a);
    return padL() + t * inner;
  }
  function hAt(px) {
    const w = svg.clientWidth || 900; const t = (px - padL()) / (w - padL() - 14);
    const a = view.x0; const b = view.x1;
    if (scaleSel.value === 'log') {
      const la = Math.log10(Math.max(1, a)); const lb = Math.log10(Math.max(2, b));
      return Math.round(10 ** (la + t * (lb - la)));
    }
    return Math.round(a + t * (b - a));
  }
  function focusable(node, label) {
    node.setAttribute('tabindex', '0'); node.setAttribute('role', 'button'); node.setAttribute('aria-label', label);
    node.appendChild(svgEl('title', {}, label));
    return node;
  }
  function draw() {
    const w = svg.clientWidth || 900; const pl = padL();
    svg.setAttribute('viewBox', `0 0 ${w} ${H}`);
    svg.textContent = '';
    const laneH = 64; const top = 44;
    LANES.forEach((lane, i) => {
      const y = top + i * laneH;
      svg.appendChild(svgEl('text', { x: 8, y: y + 24, class: 'sh-lane' }, w < 520 ? lane.short : lane.label));
      svg.appendChild(svgEl('line', { x1: pl - 6, x2: w - 8, y1: y + 46, y2: y + 46, class: 'sh-rule' }));
    });
    if (gapsBox.checked) {
      for (const g of gaps()) {
        const x1 = xScale(g.from); const x2 = xScale(g.to);
        if (x2 < pl || x1 > w) continue;
        const r = svgEl('rect', { x: Math.max(pl, Math.min(x1, x2)), y: top + 4, width: Math.max(3, Math.min(w, x2) - Math.max(pl, x1)), height: 40, rx: 3, class: 'sh-gap', 'data-kind': 'gap', 'data-from': g.from, 'data-to': g.to });
        svg.appendChild(focusable(r, `No archive: heights ${fmt(g.from)} to ${fmt(g.to)}`));
      }
    }
    const laneN = {};
    for (const p of DATA.packs) {
      const lane = LANES.findIndex((l) => l.id === laneOf(p));
      const slot = laneN[lane] || 0; laneN[lane] = slot + 1;
      const y = top + lane * laneH + 10 + (slot % 3) * 8;
      const x1 = xScale(p.from); const x2 = xScale(p.to);
      if (Math.max(x1, x2) < pl - 6 || Math.min(x1, x2) > w) continue;
      const left = Math.max(pl - 6, Math.min(x1, x2));
      const r = svgEl('rect', { x: left, y, width: Math.max(hasBlocks(p) ? 6 : 5, Math.min(w, Math.max(x1, x2)) - left), height: 20, rx: 4, class: `sh-pack ${laneOf(p)}`, 'data-kind': 'pack', 'data-id': p.id });
      svg.appendChild(focusable(r, `${p.name}: ${p.from === p.to ? `height ${fmt(p.from)}` : `heights ${fmt(p.from)} to ${fmt(p.to)}`}`));
    }
    DATA.upgrades.forEach((u, i) => {
      const x = xScale(u.height);
      if (x < pl - 2 || x > w) return;
      svg.appendChild(svgEl('line', { x1: x, x2: x, y1: 8, y2: H - 26, class: 'sh-upg' }));
      const hit = svgEl('rect', { x: x - 6, y: 4, width: 12, height: H - 30, class: 'sh-hit', 'data-kind': 'upgrade', 'data-i': i });
      svg.appendChild(focusable(hit, `Upgrade ${u.name} at height ${fmt(u.height)}`));
      svg.appendChild(svgEl('text', { x: x + 4, y: 12 + (i % 4) * 10, class: 'sh-upg-label' }, u.name));
    });
    const xs = xScale(DATA.stall);
    if (xs >= pl && xs <= w) {
      const sy = top + 2 * laneH;
      svg.appendChild(svgEl('line', { x1: xs, x2: xs, y1: sy, y2: sy + 38, class: 'sh-stall' }));
      const nearEnd = xs > w - 110;
      svg.appendChild(svgEl('text', { x: nearEnd ? xs - 4 : xs + 4, y: sy + 30, class: 'sh-stall-label', 'text-anchor': nearEnd ? 'end' : 'start' }, `stall ${fmt(DATA.stall)}`));
    }
    const ticks = w < 520 ? 3 : 7;
    for (let i = 0; i <= ticks; i++) {
      const x = pl + (i / ticks) * (w - pl - 14);
      const hv = hAt(x);
      svg.appendChild(svgEl('text', { x, y: H - 8, class: 'sh-axis', 'text-anchor': i === 0 ? 'start' : i === ticks ? 'end' : 'middle' }, fmt(Math.max(0, hv))));
    }
  }

  function showPack(p) {
    if (!p) return;
    detail.innerHTML = `<p><span class="sh-tag ${laneOf(p)}">${esc(kindLabel(p))}</span></p>
      <h4>${esc(p.name)}</h4>
      ${p.file ? `<p><code class="sh-file">${esc(p.file)}</code></p>` : ''}
      <dl class="sh-dl">
        <dt>Heights</dt><dd class="n">${p.from === p.to ? fmt(p.from) : `${fmt(p.from)} → ${fmt(p.to)}`}</dd>
        <dt>Size</dt><dd class="n">${bytes(p.size)}</dd>
        <dt>Date</dt><dd>${esc(p.when)}</dd>
        <dt>Where</dt><dd>${esc(p.where)}</dd>
      </dl>
      <p>${esc(p.notes)}</p>
      <p class="muted"><strong>Evidence:</strong> ${esc(p.evidence)}</p>`;
  }
  function showGap(from, to) {
    const g = gaps().find((x) => x.from === from) || { why: '' };
    detail.innerHTML = `<p><span class="sh-tag gap">Gap</span></p>
      <h4 class="n">${fmt(from)} → ${fmt(to)}</h4>
      <p>${fmt(to - from + 1)} heights with no pack that can serve their blocks. ${esc(g.why)}</p>
      <p class="muted">App-state packs inside this range, if any, cannot rebuild the block log.</p>`;
  }
  function showUpgrade(u) {
    detail.innerHTML = `<p><span class="sh-tag upg">Upgrade</span></p>
      <h4>${esc(u.name)}</h4>
      <p>Halt height <strong class="n">${fmt(u.height)}</strong>, applied on-chain. Packs whose tip is below this height never ran this version.</p>`;
  }
  function hit(target) {
    const n = target?.closest?.('[data-kind]');
    if (!n) return;
    const k = n.getAttribute('data-kind');
    if (k === 'pack') showPack(DATA.packs.find((p) => p.id === n.getAttribute('data-id')));
    else if (k === 'gap') showGap(+n.getAttribute('data-from'), +n.getAttribute('data-to'));
    else if (k === 'upgrade') showUpgrade(DATA.upgrades[+n.getAttribute('data-i')]);
  }
  function zoom(z, centerPx) {
    const w = svg.clientWidth || 900;
    const h = hAt(centerPx ?? (padL() + (w - padL() - 14) / 2));
    const a = h - (h - view.x0) * z; const b = h + (view.x1 - h) * z;
    view.x0 = Math.max(0, a);
    view.x1 = Math.min(DATA.chainTip * 1.05, Math.max(view.x0 + 1000, b));
    draw();
  }

  svg.addEventListener('wheel', (e) => {
    if (!e.ctrlKey && !e.metaKey) return; // plain scrolling keeps scrolling the page
    e.preventDefault();
    zoom(e.deltaY > 0 ? 1.18 : 1 / 1.18, e.offsetX);
  }, { passive: false });
  let press = null;
  svg.addEventListener('pointerdown', (e) => { press = { x: e.clientX, y: e.clientY, a: view.x0, b: view.x1, target: e.target, dragged: false }; });
  svg.addEventListener('pointermove', (e) => {
    if (!press) return;
    const dx = e.clientX - press.x;
    if (!press.dragged) {
      if (Math.abs(dx) < 8 || Math.abs(dx) < Math.abs(e.clientY - press.y)) return;
      press.dragged = true;
      try { svg.setPointerCapture(e.pointerId); } catch { /* ignore */ }
    }
    const span = press.b - press.a;
    view.x0 = Math.max(0, press.a - (dx / ((svg.clientWidth || 900) - padL() - 14)) * span);
    view.x1 = view.x0 + span;
    draw();
  });
  svg.addEventListener('pointerup', () => { if (press && !press.dragged) hit(press.target); press = null; });
  svg.addEventListener('pointercancel', () => { press = null; });
  svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); hit(e.target); } });
  host.querySelector('.sh-in').addEventListener('click', () => zoom(1 / 1.5));
  host.querySelector('.sh-out').addEventListener('click', () => zoom(1.5));
  host.querySelector('.sh-fit').addEventListener('click', () => { view = full(); draw(); });
  scaleSel.addEventListener('change', draw);
  gapsBox.addEventListener('change', draw);
  const table = host.querySelector('.sh-table');
  const pick = (e) => { const row = e.target.closest('tr.sh-row'); if (row) showPack(DATA.packs.find((p) => p.id === row.dataset.id)); };
  table.addEventListener('click', pick);
  table.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); pick(e); } });
  if (typeof ResizeObserver === 'function') {
    let last = 0;
    new ResizeObserver(() => { const w = svg.clientWidth; if (w && w !== last) { last = w; draw(); } }).observe(svg);
  }
  draw();
}
