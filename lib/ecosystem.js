// lib/ecosystem.js — filterable project catalog with in-grid expand panels.
// Opening a project expands its card across the grid and hosts plane content there.

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

  const state = {
    q: '',
    tags: /** @type {string[]} */ ([]),
    status: /** @type {string|null} */ (null),
    openId: /** @type {string|null} */ (null),
    openComponent: /** @type {string|null} */ (null),
  };

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
    state.status = btn.dataset.status || null;
    statusEl.querySelectorAll('.eco-chip').forEach((c) => c.classList.remove('active'));
    btn.classList.add('active');
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
    if (state.tags.includes(tag)) {
      state.tags = state.tags.filter((x) => x !== tag);
      btn.classList.remove('active');
    } else {
      state.tags.push(tag);
      btn.classList.add('active');
    }
    paint();
  });

  searchEl.addEventListener('input', () => {
    state.q = searchEl.value;
    paint();
  });

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
      if (href) window.open(href, href.startsWith('http') ? '_blank' : '_self');
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

    const list = filterProjects(catalog.projects || [], state);
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
          <article class="eco-card${isOpen ? ' is-open' : ''}" data-id="${esc(p.id)}" data-component="${esc(p.component || '')}">
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
  }

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
