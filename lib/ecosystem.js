// lib/ecosystem.js — filterable project catalog with in-grid expand panels.
// Opening a project expands its card across the grid and hosts plane content there.
//
// The filters and the selected project are shared view state: the home
// navigation (lib/fractal/world.js) pages, filters and selects the same list
// through setEcoFilter / selectEcoProject / openEcoProject and follows it with
// onEcoChange. The state outlives one visit to /eco, so filters stay put.

const ECOSYSTEM_URL = '/public/ecosystem.json';

/** @type {object|null} */
let _catalog = null;

/**
 * @returns {Promise<{ version: number, projects: object[], filters: object }>}
 */
export async function loadEcosystem(url = ECOSYSTEM_URL) {
  if (_catalog) return _catalog;
  const res = await fetch(url, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`ecosystem.json HTTP ${res.status}`);
  _catalog = await res.json();
  return _catalog;
}

/**
 * @param {object[]} projects
 * @param {{ q?: string, tags?: string[], status?: string|null }} filters
 */
export function filterProjects(projects, filters = {}) {
  const q = (filters.q || '').trim().toLowerCase();
  const tags = filters.tags || [];
  const status = filters.status || null;

  return projects
    .filter((p) => {
      if (status && p.status !== status) return false;
      if (tags.length && !tags.every((t) => (p.tags || []).includes(t))) return false;
      if (!q) return true;
      const hay = [p.title, p.summary, p.description, ...(p.tags || [])]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    })
    .sort((a, b) => (b.relevance || 0) - (a.relevance || 0));
}

// ── Shared view state ───────────────────────────────────────────────────────
const view = { filters: { q: '', tags: [], status: null }, selected: null, mounted: null };
const subs = new Set();
const live = () => (view.mounted && view.mounted.host.isConnected ? view.mounted : null);

/** Current filtered list (null until the catalog is loaded), filters and selection. */
export function ecoState() {
  const all = _catalog?.projects || [];
  return {
    list: _catalog ? filterProjects(all, view.filters) : null,
    all,
    tags: _catalog?.filters?.tags || [...new Set(all.flatMap((p) => p.tags || []))],
    filters: { ...view.filters, tags: [...view.filters.tags] },
    selected: view.selected,
  };
}

/** Subscribe to list, filter and selection changes. Returns an unsubscribe function. */
export function onEcoChange(fn) {
  subs.add(fn);
  return () => subs.delete(fn);
}

function emit() {
  const s = ecoState();
  for (const fn of subs) {
    try { fn(s); } catch (e) { console.error('[ecosystem]', e); }
  }
}

/** Change filters ({ q, tags, status }); the catalog on screen repaints. */
export function setEcoFilter(f = {}) {
  if (f.q !== undefined) view.filters.q = String(f.q);
  if (f.tags !== undefined) view.filters.tags = [...f.tags];
  if (f.status !== undefined) view.filters.status = f.status || null;
  const s = ecoState();
  if (view.selected && s.list && !s.list.some((p) => p.id === view.selected)) view.selected = null;
  const m = live();
  if (m) m.sync();
  else emit();
}

/** Select a project (null clears). On screen its card is marked and, if asked, scrolled into view. */
export function selectEcoProject(id, opts = {}) {
  view.selected = id || null;
  const m = live();
  if (m) m.select(view.selected, opts);
  else emit();
}

/** Open a project the way its catalog card does (expand in place, or its first link). */
export function openEcoProject(id) {
  const m = live();
  if (m) return m.open(id);
  const p = (_catalog?.projects || []).find((x) => x.id === id);
  const href = p?.links?.[0]?.url;
  if (href) openHref(href);
}

/** Site pages open through the router (no reload, one continuous transition); other sites in a new tab. */
function openHref(href) {
  if (/^https?:/i.test(href)) { window.open(href, '_blank', 'noopener'); return; }
  const shell = typeof window !== 'undefined' ? window.__tnShell : null;
  if (shell && typeof shell.navigate === 'function') shell.navigate(href);
  else window.location.assign(href);
}

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * @param {HTMLElement} host
 * @param {object} catalog
 * @param {{
 *   onOpenComponent?: (componentId: string, project: object, detailEl: HTMLElement) => void,
 *   onCloseComponent?: (componentId: string) => void,
 * }} [opts]
 */
export function mountEcosystemCatalog(host, catalog, opts = {}) {
  if (!host) return () => {};

  // Filters are the shared view state (see setEcoFilter).
  const state = {
    openId: /** @type {string|null} */ (null),
    openComponent: /** @type {string|null} */ (null),
  };
  const F = view.filters;

  const allTags = catalog.filters?.tags || [
    ...new Set(catalog.projects.flatMap((p) => p.tags || [])),
  ];
  const statuses = catalog.filters?.status || ['live', 'beta', 'soon'];

  host.innerHTML = `
    <div class="eco-catalog">
      <div class="eco-toolbar">
        <input type="search" class="eco-search" id="eco-search"
          placeholder="Filter projects…" aria-label="Filter projects" />
        <div class="eco-status-row" id="eco-status" role="group" aria-label="Status"></div>
      </div>
      <div class="eco-tags" id="eco-tags" role="group" aria-label="Tags"></div>
      <div class="eco-count" id="eco-count"></div>
      <div class="eco-grid" id="eco-grid"></div>
    </div>
  `;

  const searchEl = host.querySelector('#eco-search');
  const tagsEl = host.querySelector('#eco-tags');
  const statusEl = host.querySelector('#eco-status');
  const gridEl = host.querySelector('#eco-grid');
  const countEl = host.querySelector('#eco-count');

  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'eco-chip active';
  allBtn.dataset.status = '';
  allBtn.textContent = 'All';
  statusEl.appendChild(allBtn);
  for (const s of statuses) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eco-chip';
    b.dataset.status = s;
    b.textContent = s;
    statusEl.appendChild(b);
  }
  statusEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-status]');
    if (!btn) return;
    F.status = btn.dataset.status || null;
    syncChips();
    paint();
  });

  for (const t of allTags) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'eco-chip eco-tag';
    b.dataset.tag = t;
    b.textContent = t;
    tagsEl.appendChild(b);
  }
  tagsEl.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tag]');
    if (!btn) return;
    const tag = btn.dataset.tag;
    F.tags = F.tags.includes(tag) ? F.tags.filter((x) => x !== tag) : [...F.tags, tag];
    syncChips();
    paint();
  });

  searchEl.addEventListener('input', () => {
    F.q = searchEl.value;
    paint();
  });

  function syncChips() {
    statusEl.querySelectorAll('.eco-chip').forEach((c) => {
      const on = (c.dataset.status || null) === (F.status || null);
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    tagsEl.querySelectorAll('.eco-tag').forEach((c) => {
      const on = F.tags.includes(c.dataset.tag);
      c.classList.toggle('active', on);
      c.setAttribute('aria-pressed', String(on));
    });
    if (searchEl.value !== F.q) searchEl.value = F.q;
  }
  syncChips();

  function closeOpen() {
    if (state.openComponent && opts.onCloseComponent) {
      opts.onCloseComponent(state.openComponent);
    }
    state.openId = null;
    state.openComponent = null;
  }

  function openCard(project) {
    const component = project.component || null;
    // External-only: first link
    if (!component) {
      const href = project.links?.[0]?.url;
      if (href) openHref(href);
      return;
    }

    if (state.openId === project.id) {
      closeOpen();
      paint();
      return;
    }

    // Return previous plane before re-render
    if (state.openComponent && opts.onCloseComponent) {
      opts.onCloseComponent(state.openComponent);
    }

    state.openId = project.id;
    state.openComponent = component;
    paint();

    const detail = gridEl.querySelector(`.eco-card[data-id="${project.id}"] .eco-card-detail`);
    if (detail && opts.onOpenComponent) {
      opts.onOpenComponent(component, project, detail);
    }
    gridEl.querySelector(`.eco-card[data-id="${project.id}"]`)?.scrollIntoView({
      behavior: 'smooth',
      block: 'nearest',
    });
  }

  function paint() {
    const reopenId = state.openId;
    const reopenComp = state.openComponent;

    // Park plane DOM before wiping grid (planes are live elements)
    if (reopenComp && opts.onCloseComponent) {
      opts.onCloseComponent(reopenComp);
    }

    const list = filterProjects(catalog.projects || [], F);
    if (view.selected && !list.some((p) => p.id === view.selected)) view.selected = null;
    // Drop open state if filtered out
    if (reopenId && !list.some((p) => p.id === reopenId)) {
      state.openId = null;
      state.openComponent = null;
    } else {
      state.openId = reopenId;
      state.openComponent = reopenComp;
    }

    countEl.textContent = `${list.length} project${list.length === 1 ? '' : 's'}`;
    gridEl.innerHTML = list
      .map((p) => {
        const tags = (p.tags || [])
          .map((t) => `<span class="eco-pill">${esc(t)}</span>`)
          .join('');
        const statusClass = p.status || 'live';
        const isOpen = state.openId === p.id;
        const isSel = view.selected === p.id;
        const canExpand = !!p.component;
        const actionLabel = isOpen ? 'Close' : canExpand ? 'Open' : (p.links?.[0]?.label || 'Visit');
        const links = (p.links || [])
          .slice(0, isOpen ? 4 : 2)
          .map(
            (l) =>
              `<a class="eco-link" href="${esc(l.url)}" ${l.url.startsWith('http') ? 'target="_blank" rel="noopener"' : ''}>${esc(l.label)}</a>`
          )
          .join('');

        return `
          <article class="eco-card${isOpen ? ' is-open' : ''}${isSel ? ' is-selected' : ''}" data-id="${esc(p.id)}" data-component="${esc(p.component || '')}"${isSel ? ' aria-current="true"' : ''}>
            <div class="eco-card-face">
              <div class="eco-card-top">
                <h3>${esc(p.title)}</h3>
                <span class="eco-status eco-status--${esc(statusClass)}">${esc(statusClass)}</span>
              </div>
              <p class="eco-summary">${esc(p.summary || p.description || '')}</p>
              <div class="eco-pills">${tags}</div>
              <div class="eco-actions">
                <button type="button" class="eco-open" data-id="${esc(p.id)}">${esc(actionLabel)}</button>
                ${!isOpen ? links : ''}
              </div>
            </div>
            <div class="eco-card-detail" ${isOpen ? '' : 'hidden'}></div>
            ${isOpen ? `<div class="eco-card-footer">${links}</div>` : ''}
          </article>`;
      })
      .join('');

    gridEl.querySelectorAll('.eco-open').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const project = (catalog.projects || []).find((x) => x.id === id);
        if (project) openCard(project);
      });
    });

    // Re-host plane into expanded card
    if (state.openId && state.openComponent) {
      const detail = gridEl.querySelector(`.eco-card[data-id="${state.openId}"] .eco-card-detail`);
      const project = (catalog.projects || []).find((x) => x.id === state.openId);
      if (detail && project && opts.onOpenComponent) {
        opts.onOpenComponent(state.openComponent, project, detail);
      }
    }
    emit();
  }

  function markSelected(opts = {}) {
    gridEl.querySelectorAll('.eco-card').forEach((c) => {
      const on = c.dataset.id === view.selected;
      c.classList.toggle('is-selected', on);
      if (on) c.setAttribute('aria-current', 'true');
      else c.removeAttribute('aria-current');
    });
    const card = view.selected && gridEl.querySelector(`.eco-card[data-id="${CSS.escape(view.selected)}"]`);
    if (card && opts.scroll) {
      const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
      card.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    }
  }

  view.mounted = {
    host,
    sync() { syncChips(); paint(); },
    select(id, o) { markSelected(o); emit(); },
    open(id) {
      const project = (catalog.projects || []).find((x) => x.id === id);
      if (project) openCard(project);
    },
  };

  paint();

  return {
    close: () => {
      closeOpen();
      paint();
    },
    destroy: () => {
      closeOpen();
      host.innerHTML = '';
    },
  };
}
