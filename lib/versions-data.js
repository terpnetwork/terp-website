// versions-data.js — one source of truth for versions and heights on the Resources page.
// Reads terp-core networks/chain-registry/terpnetwork/versions.json (copied to
// /public/data/versions.json). No hard-coded versions or heights here; a version
// without a height is shown as "pending".

const URLS = [
  '/public/data/versions.json',
  'https://raw.githubusercontent.com/terpnetwork/terp-core/main/networks/chain-registry/terpnetwork/versions.json',
];

// Plan at which non-IBC stores switch to blake3 IAVL (app/upgrades/v6_4: keepers
// move to the b3-* dest trees; IBC stores keep SHA-256). Height comes from versions.json.
export const BLAKE3_PLAN = 'v6.4';
export const BLAKE3_NOTE =
  'Non-IBC stores use blake3 IAVL from this height; IBC stores keep the original hashing.';

// Plans armed by the previous handler instead of their own proposal.
const ARMED_BY = { 'v6.2': 'v6.1', 'v6.4': 'v6.3' };

let cache = null;
const META_URL = '/public/data/upgrade-meta.json';

async function loadMeta() {
  try {
    const r = await fetch(META_URL, { cache: 'no-cache' });
    return r.ok ? await r.json() : {};
  } catch {
    return {};
  }
}

export function anchorFor(tag) {
  return `upgrade-${String(tag || '').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase()}`;
}

function normalize(doc, meta = {}) {
  const dates = meta.dates || {};
  const list = (doc?.versions || []).filter((v) => v && v.name);
  const rows = list.map((v, i) => {
    const tag = v.recommended_version || v.tag || v.name;
    const height = Number(v.height) > 0 ? Number(v.height) : 0;
    return {
      name: v.name,
      tag,
      height,
      proposal: v.proposal || null,
      date: v.date || (dates[String(v.height)] ? `${dates[String(v.height)].date}${dates[String(v.height)].basis === 'vote-end' ? ' (vote end)' : ''}` : ''),
      armedBy: ARMED_BY[v.name] || '',
      compatible: v.compatible_versions || [],
      order: i,
      raw: v,
    };
  });
  const latest = [...rows].reverse().find((r) => r.raw.recommended_version) || rows[rows.length - 1] || null;
  const blake3 = rows.find((r) => r.name === BLAKE3_PLAN) || null;
  return { rows, latest, blake3, live: meta.live || null, binaries: meta.binaries || {}, dates };
}

export function loadVersions() {
  if (!cache) {
    cache = (async () => {
      for (const url of URLS) {
        try {
          const r = await fetch(url, { cache: 'no-cache', headers: { Accept: 'application/json' } });
          if (!r.ok) continue;
          const t = await r.text();
          if (!t || /^\s*</.test(t)) continue;
          return { ...normalize(JSON.parse(t), await loadMeta()), source: url };
        } catch {
          /* next */
        }
      }
      return { rows: [], latest: null, blake3: null, source: '' };
    })();
  }
  return cache;
}
