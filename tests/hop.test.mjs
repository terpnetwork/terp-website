// node tests/hop.test.mjs — runs the move planner over every ordered pair of page routes.
import assert from 'node:assert/strict';
import { ROUTES as SRC } from '../lib/fractal/routes.js';
import { planHop, lca, chainIds } from '../lib/fractal/hop.js';

const routes = {};
for (const [id, n] of Object.entries(SRC)) routes[id] = { ...n, id };
const pages = Object.keys(routes).filter((id) => !routes[id].external);
const count = { none: 0, zoom: 0, dissolve: 0 };
for (const a of pages) for (const b of pages) {
  const p = planHop(routes, a, b);
  count[p.kind]++;
  const direct = routes[b].parent === a || routes[a].parent === b;
  if (a === b) { assert.equal(p.kind, 'none'); assert.equal(p.hops, 0); continue; }
  assert.equal(p.hops, 1, `${a}->${b}: one move`);
  if (direct) {
    assert.equal(p.kind, 'zoom', `${a}->${b}: parent-child must zoom`);
    assert.equal(p.dir, routes[b].parent === a ? 1 : -1);
    assert.equal(routes[p.c].parent, p.P, `${a}->${b}: zoom is between a parent and its own child`);
  } else {
    assert.equal(p.kind, 'dissolve', `${a}->${b}: non-adjacent must dissolve (no camera travel)`);
    assert.equal(p.P, undefined); assert.equal(p.c, undefined);
  }
  const ca = chainIds(routes, a), cb = chainIds(routes, b);
  assert.ok(ca.includes(p.lca) && cb.includes(p.lca), `${a}->${b}: lca`);
}
assert.equal(planHop(routes, '/eco', '/staking').kind, 'zoom');
assert.equal(planHop(routes, '/staking', '/eco').dir, -1);
assert.equal(planHop(routes, '/staking', '/resources').kind, 'dissolve');
assert.equal(planHop(routes, '/ibc', '/bounties').kind, 'dissolve');
assert.equal(planHop(routes, '/', '/staking').kind, 'dissolve');
assert.equal(lca(routes, '/staking', '/ibc'), '/eco');
const n = pages.length * pages.length;
assert.equal(count.none + count.zoom + count.dissolve, n);
console.log(`ok: ${n} ordered pairs over ${pages.length} pages: ${count.zoom} zoom, ${count.dissolve} dissolve, ${count.none} none`);
