// denoms.js — reward assets for bounties (fin1): any native bank denom on the chain.
//
// Sources, all read-only LCD GETs:
//   /cosmos/bank/v1beta1/denoms_metadata       names, symbols, denom_units (exponents)
//   /cosmos/bank/v1beta1/supply                every denom that exists (paginated)
//   /cosmos/bank/v1beta1/balances/{address}     what the connected wallet holds (IBC + tokenfactory included)
//   /ibc/apps/transfer/v1/denoms/{hash}         origin of an ibc/… denom with no metadata (v1 denom_traces as fallback)
// Exponent: the largest exponent in the metadata's denom_units (the display unit). With none above 0 (the chain's
// auto-generated IBC/tokenfactory metadata only lists the base unit) a micro-prefixed base ("u…") is read as 6 and
// flagged `assumed`; anything else stays 0 (amounts in base units), also flagged.
const trim = (s) => String(s || '').replace(/\/+$/, '');
async function getJson(url, ms = 8000) {
  const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), ms);
  try { const r = await fetch(url, { cache: 'no-store', credentials: 'omit', signal: ctl.signal }); return r.ok ? await r.json() : null; }
  catch { return null; } finally { clearTimeout(t); }
}
async function pages(rest, path, key, max = 6) {
  const out = []; let next = null;
  for (let i = 0; i < max; i++) {
    const q = `pagination.limit=200${next ? '&pagination.key=' + encodeURIComponent(next) : ''}`;
    const j = await getJson(`${trim(rest)}${path}${path.includes('?') ? '&' : '?'}${q}`);
    if (!j) { if (!i) return null; break; }
    out.push(...(j[key] || []));
    next = j.pagination && j.pagination.next_key; if (!next) break;
  }
  return out;
}

export const kindOf = (denom) => /^ibc\//.test(denom) ? 'ibc' : /^factory\//.test(denom) ? 'factory' : 'native';
/** Valid Cosmos SDK bank denom (sdk.ValidateDenom: [a-zA-Z][a-zA-Z0-9/:._-]{2,127}). */
export const DENOM_RE = /^[a-zA-Z][a-zA-Z0-9/:._-]{2,127}$/;
const lastSeg = (s) => String(s || '').split('/').filter(Boolean).pop() || String(s || '');
function microGuess(base) {
  const b = lastSeg(base);
  return /^u[a-z][a-z0-9]{1,15}$/.test(b) ? { exponent: 6, symbol: b.slice(1).toUpperCase() } : { exponent: 0, symbol: b };
}

/** Normalise one asset: { denom, symbol, name, exponent, assumed, kind, origin, sources:Set } */
function fromMeta(m) {
  const units = (m.denom_units || []).slice().sort((a, b) => b.exponent - a.exponent);
  const top = units[0];
  const origin = /^transfer\//.test(m.display || '') ? m.display : '';
  if (top && top.exponent > 0) {
    const sym = (m.symbol && !/\//.test(m.symbol) ? m.symbol : (top.denom || '').toUpperCase());
    return { denom: m.base, symbol: sym, name: m.name || sym, exponent: top.exponent, assumed: false, kind: kindOf(m.base), origin };
  }
  const g = microGuess(origin || m.display || m.base);
  return { denom: m.base, symbol: g.symbol, name: m.name || g.symbol, exponent: g.exponent, assumed: true, kind: kindOf(m.base), origin };
}
function bare(denom) {
  const g = microGuess(denom);
  return { denom, symbol: kindOf(denom) === 'ibc' ? 'IBC ' + denom.slice(4, 10) : g.symbol, name: denom, exponent: g.exponent, assumed: true, kind: kindOf(denom), origin: '' };
}

/** Short label for menus and badges: "TERP", "BTSG · ibc", "TERPS · factory". */
export function labelOf(a) {
  if (!a) return '';
  return a.kind === 'native' ? a.symbol : `${a.symbol} · ${a.kind}`;
}

/** base-unit integer string -> display string with the asset's exponent (no float rounding). */
export function fromBase(base, exponent = 0) {
  const s = String(base || '0').replace(/^0+(?=\d)/, '');
  if (!exponent) return s;
  const p = s.padStart(exponent + 1, '0');
  const int = p.slice(0, -exponent), frac = p.slice(-exponent).replace(/0+$/, '');
  return frac ? `${int}.${frac}` : int;
}
/** display amount string -> base-unit integer string; throws a plain-language Error when it doesn't fit. */
export function toBase(amount, exponent = 0) {
  const s = String(amount || '').trim().replace(/[,_\s]/g, '');
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error('Enter a number, like 250 or 12.5.');
  const [i, f = ''] = s.split('.');
  if (f.length > exponent) throw new Error(exponent ? `At most ${exponent} decimals for this token.` : 'Whole numbers only for this token.');
  const out = (i + f.padEnd(exponent, '0')).replace(/^0+(?=\d)/, '');
  if (/^0+$/.test(out)) throw new Error('Enter more than zero.');
  return out;
}

/**
 * Every denom on the chain plus the wallet's balances.
 * known: [{denom, symbol, exponent}] from the site config (uterp/uthiol) so the chain's own tokens always read right.
 * Returns { list: [asset…] (wallet holdings first, then natives, then by symbol), byDenom, loaded: {metadata, supply, wallet} }.
 */
export async function loadDenoms({ rest, address = '', known = [] } = {}) {
  const by = new Map();
  const put = (a, src, extra = {}) => {
    const cur = by.get(a.denom);
    if (cur) { cur.sources.add(src); Object.assign(cur, extra); if (cur.assumed && !a.assumed) Object.assign(cur, a, { sources: cur.sources }, extra); return cur; }
    const x = { ...a, sources: new Set([src]), ...extra }; by.set(a.denom, x); return x;
  };
  for (const k of known) put({ denom: k.denom, symbol: k.symbol, name: k.name || k.symbol, exponent: k.exponent, assumed: false, kind: 'native', origin: '' }, 'config');
  const [meta, supply, bals] = await Promise.all([
    rest ? pages(rest, '/cosmos/bank/v1beta1/denoms_metadata', 'metadatas') : null,
    rest ? pages(rest, '/cosmos/bank/v1beta1/supply', 'supply') : null,
    rest && address ? pages(rest, `/cosmos/bank/v1beta1/balances/${encodeURIComponent(address)}`, 'balances', 3) : null,
  ]);
  for (const m of meta || []) { const a = fromMeta(m); const cur = by.get(a.denom); if (cur && !cur.assumed) cur.sources.add('metadata'); else put(a, 'metadata'); }
  for (const c of supply || []) put(by.get(c.denom) || bare(c.denom), 'supply', { supply: c.amount });
  for (const c of bals || []) put(by.get(c.denom) || bare(c.denom), 'wallet', { balance: c.amount });
  // ibc/… with no metadata: ask the transfer module where it came from (label only; never blocks)
  const unknownIbc = [...by.values()].filter((a) => a.kind === 'ibc' && !a.origin).slice(0, 12);
  await Promise.all(unknownIbc.map(async (a) => {
    const h = a.denom.slice(4);
    const j = await getJson(`${trim(rest)}/ibc/apps/transfer/v1/denoms/${h}`, 5000) || await getJson(`${trim(rest)}/ibc/apps/transfer/v1/denom_traces/${h}`, 5000);
    const base = j && (j.denom ? j.denom.base : j.denom_trace ? j.denom_trace.base_denom : '');
    if (base) { const g = microGuess(base); Object.assign(a, { origin: base, symbol: g.symbol, exponent: a.assumed ? g.exponent : a.exponent }); }
  }));
  const list = [...by.values()].sort((x, y) => (y.balance ? 1 : 0) - (x.balance ? 1 : 0) || (x.kind === 'native' ? 0 : 1) - (y.kind === 'native' ? 0 : 1) || (x.sources.has('config') ? -1 : 0) - (y.sources.has('config') ? -1 : 0) || x.symbol.localeCompare(y.symbol));
  return { list, byDenom: by, loaded: { metadata: !!meta, supply: !!supply, wallet: !!bals } };
}
