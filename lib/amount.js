// amount1: one exact formatter for base-unit (micro) amounts, e.g. uterp -> TERP.
// Integer math only (BigInt), rounding half up (away from zero on ties) at `maxFrac` decimals.
// 7515467896 uterp -> "7,515.47". Accepts a bigint, an integer string, or an LCD DecCoin string ("123.456").

/** Exact half-up rounding of a base-unit amount to `maxFrac` decimals; returns { neg, int, frac } as bigint/string. */
export function roundMicro(u, decimals = 6, maxFrac = 2) {
  let s = typeof u === 'bigint' ? u.toString() : String(u ?? '0').trim();
  if (s === '') s = '0';
  const m = s.match(/^(-?)(\d*)(?:\.(\d*))?$/);
  if (!m || (m[2] === '' && !m[3])) return null;
  const neg = m[1] === '-';
  // Value in units of 10^-(decimals + subLen): base digits plus any sub-micro fraction.
  const sub = m[3] || '';
  const v = BigInt((m[2] || '0') + sub);
  const scale = decimals + sub.length;
  const keep = Math.min(maxFrac, scale);
  const drop = 10n ** BigInt(scale - keep);
  // Half up: add half of the dropped unit before the integer division (drop is a power of ten, so drop/2 is exact).
  const r = drop === 1n ? v : (v + drop / 2n) / drop;
  const unit = 10n ** BigInt(keep);
  const int = r / unit;
  const frac = keep ? (r % unit).toString().padStart(keep, '0') : '';
  return { neg: neg && r !== 0n, int, frac };
}

/** "1,234.57" style; trailing zeros dropped unless `minFrac` asks for them. */
export function formatMicro(u, decimals = 6, maxFrac = 2, minFrac = 0) {
  const r = roundMicro(u, decimals, maxFrac);
  if (!r) return '—';
  let f = r.frac.replace(/0+$/, '');
  if (f.length < minFrac) f = f.padEnd(minFrac, '0');
  return `${r.neg ? '-' : ''}${r.int.toLocaleString('en-US')}${f ? '.' + f : ''}`;
}
