// Move planner for the fractal navigation.
//
// A move between two pages is one of:
//   zoom     a direct parent <-> child move: the single dive into (dir 1) or out of
//            (dir -1) the child's orb, as the navigation has always drawn it;
//   dissolve every other move (siblings, cousins, any path longer than one level):
//            no camera travel; the current shield and page dissolve out in place,
//            the camera snaps to the target's resting frame while nothing is
//            visible, and the target shield and page dissolve in;
//   none     same page.
// Pure (no DOM), so it can be tested over every pair.

/** Root-first chain of route ids, e.g. '/staking' -> ['/', '/eco', '/staking']. */
export function chainIds(routes, id) {
  const out = [];
  for (let k = id, guard = 0; k && routes[k] && guard < 64; k = routes[k].parent, guard++) out.unshift(k);
  return out;
}

/** Lowest common ancestor of two routes (null if they share no root). */
export function lca(routes, a, b) {
  const ca = chainIds(routes, a), cb = chainIds(routes, b);
  let k = 0;
  while (k < ca.length && k < cb.length && ca[k] === cb[k]) k++;
  return k ? ca[k - 1] : null;
}

export function planHop(routes, from, to) {
  if (!routes[from] || !routes[to]) throw new Error(`unknown route ${!routes[from] ? from : to}`);
  const base = { from, to, lca: lca(routes, from, to) };
  if (from === to) return { ...base, kind: 'none', hops: 0 };
  if (routes[to].parent === from) return { ...base, kind: 'zoom', dir: 1, P: from, c: to, hops: 1 };
  if (routes[from].parent === to) return { ...base, kind: 'zoom', dir: -1, P: to, c: from, hops: 1 };
  return { ...base, kind: 'dissolve', hops: 1 };
}
