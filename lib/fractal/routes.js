// Route model for the home navigation (lib/fractal/world.js).
// One place for labels, descriptions, colours and where each section sits in
// the Terp mark. Internal ids are the site's clean URLs; build.js checks that
// every internal id here is also a route in lib/shell/shell.js.
//
// slot: position in the 13-dot mark of the parent level (N/E/S/W outer arms,
// n/e/s/w inner arms, NW/NE/SE/SW diagonals, C centre).

export const SLOTS = {
  C: [0, 0],
  N: [0, -48], E: [48, 0], S: [0, 48], W: [-48, 0],
  n: [0, -25], e: [25, 0], s: [0, 25], w: [-25, 0],
  NW: [-25, -25], NE: [25, -25], SE: [25, 25], SW: [-25, 25],
};

export const ROUTES = {
  '/':          { label: 'Terp Network', color: '#cfffcf', children: ['/about', '/resources', '/eco', 'ext:docs'] },
  '/about':     { parent: '/', slot: 'N', label: 'About', color: '#cfffcf', desc: 'What Terp Network stands for, and how its tokens started.' },
  '/resources': { parent: '/', slot: 'E', label: 'Resources', color: '#86e3a4', desc: 'Snapshots, installer, upgrades, and terpd releases.' },
  '/eco':       { parent: '/', slot: 'S', label: 'Eco', color: '#c6ec8a', desc: 'The apps on Terp: names, accounts, art, DAOs.', children: ['/ibc', '/svg', '/no-rick', 'ext:daodao'] },
  'ext:docs':   { parent: '/', slot: 'W', label: 'Docs', color: '#78dcc4', desc: 'Overview, guides, API reference, and community pages.', href: 'https://docs.terp.network', external: true },
  '/ibc':       { parent: '/eco', slot: 'NW', label: 'IBC', color: '#7fe3cf', desc: 'Open channels · clients · relayer gas.' },
  '/svg':       { parent: '/eco', slot: 'NE', label: 'SVG', color: '#e2f7a0', desc: 'Browse and mint generative on-chain SVG art.' },
  '/no-rick':   { parent: '/eco', slot: 'SE', label: 'No Rick', color: '#a7eeb0', desc: 'Keep the word. Prove it isn’t rick.' },
  'ext:daodao': { parent: '/eco', slot: 'SW', label: 'DAO-DAO', color: '#e8b86a', desc: 'Governance apps on Terp: proposals, voting modules, treasuries.', href: 'https://daodao.terp.network', external: true },
};

/** Internal (same-site) route ids, i.e. pages that show the navigation. */
export const PAGES = Object.keys(ROUTES).filter((id) => !ROUTES[id].external);

// Things on a level that are not pages of their own. Every one of them is a
// button or link in the navigation, drawn in its slot like a section:
//   action  opens something on the current page (home: the installer)
//   up      goes to another page (every page below the start page: Home, top slot)
//   section switches the page's own section (Resources: #install, …)
//   prev / next  step through the sections or projects (left and right slots)
//   info    opens the details of what is shown (Resources: bottom slot)
// /eco lists the project catalog (public/ecosystem.json) in `slots`; the
// outer left and right slots step through it, the bottom one filters it.
export const LEVELS = {
  '/': {
    items: [
      { slot: 'C', kind: 'action', id: 'act:install', label: 'Install', color: '#e9f7d2', desc: 'Install terpd, the program that runs a Terp node, with one command.' },
    ],
  },
  '/resources': {
    // The six sections sit in the inner 3×3; the outer ring is Home, previous, next and details.
    items: [
      { slot: 'N', kind: 'up', id: 'up:home', to: '/', label: 'Home', color: '#cfffcf', desc: 'Back to the Terp Network start page.' },
      { slot: 'W', kind: 'prev', id: 'sec:prev', label: 'Previous', name: 'Previous section', color: '#d8efe0', desc: 'Show the previous section.' },
      { slot: 'E', kind: 'next', id: 'sec:next', label: 'Next', name: 'Next section', color: '#d8efe0', desc: 'Show the next section.' },
      { slot: 'S', kind: 'info', id: 'sec:details', label: 'Details', name: 'Details about this section', color: '#dfeee4', desc: 'What this section shows and how to use it.' },
      { slot: 'NW', kind: 'section', id: 'sec:install', section: 'install', label: 'Install', color: '#cfffcf', desc: 'One command installs terpd on Linux or macOS.' },
      { slot: 'NE', kind: 'section', id: 'sec:app-state', section: 'app-state', label: 'App state', color: '#86e3a4', desc: 'Live contract addresses and app state, by network.' },
      { slot: 'w', kind: 'section', id: 'sec:graphs', section: 'graphs', label: 'Graphs', color: '#78dcc4', desc: 'How Terp software crates depend on each other.' },
      { slot: 'e', kind: 'section', id: 'sec:releases', section: 'releases', label: 'Releases', color: '#c6ec8a', desc: 'Published terpd builds and their checksums.' },
      { slot: 'SW', kind: 'section', id: 'sec:upgrades', section: 'upgrades', label: 'Upgrades', color: '#e8d08a', desc: 'Upgrade plans by halt height, read from the chain.' },
      { slot: 'SE', kind: 'section', id: 'sec:snapshots', section: 'snapshots', label: 'Snapshot', color: '#a7eeb0', desc: 'A recent chain pack, so a new node skips syncing from genesis.' },
    ],
    defaultSection: 'install',
  },
  '/about': {
    // Four tabs in the inner 3×3: overview, network, genesis distribution and people.
    // The outer left and right slots step through them, as on Resources.
    items: [
      { slot: 'W', kind: 'prev', id: 'sec:prev', label: 'Previous', name: 'Previous section', color: '#d8efe0', desc: 'Show the previous section.' },
      { slot: 'E', kind: 'next', id: 'sec:next', label: 'Next', name: 'Next section', color: '#d8efe0', desc: 'Show the next section.' },
      { slot: 'w', kind: 'section', id: 'sec:overview', section: 'overview', label: 'Overview', color: '#cfffcf', desc: 'What Terp Network stands for and how to take part.' },
      { slot: 'C', kind: 'section', id: 'sec:network', section: 'network', label: 'Network', color: '#a7eeb0', desc: 'How the chain works, from staking and IBC to smart accounts, with live mainnet figures.' },
      { slot: 'e', kind: 'section', id: 'sec:genesis', section: 'genesis', label: 'Genesis', color: '#86e3a4', desc: 'How TERP and THIOL started: supply, accounts and vesting, from the genesis file.' },
      { slot: 's', kind: 'section', id: 'sec:people', section: 'people', label: 'People', color: '#78dcc4', desc: 'The TerpNET Foundation: its members, rules and holdings, read live from mainnet.' },
    ],
    defaultSection: 'overview',
  },
  // Catalog: projects fill the inner 3×3 in reading order; the outer ring is
  // Home (N), previous (W), next (E) and the category filter (S).
  '/eco': {
    catalog: { prev: 'W', next: 'E', filter: 'S', slots: ['NW', 'n', 'NE', 'w', 'C', 'e', 'SW', 's', 'SE'] },
  },
};

// Catalog colours by a project's first tag (public/ecosystem.json filters.tags).
export const TAG_COLORS = {
  accounts: '#cfffcf', nft: '#e2f7a0', governance: '#e8b86a', zk: '#a7eeb0',
  ibc: '#7fe3cf', infra: '#86e3a4', agentic: '#b9e6ee', defi: '#f0d48a',
};
