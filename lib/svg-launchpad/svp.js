/*! svg-launchpad/svp.js: SVP1 packing helpers for the create page.
 * Packing runs in the browser with pack.js (byte-identical to the Rust crate cw-svg-pack).
 * Gas numbers are linear fits to local-chain measurements (2026-10-15, 9 templates),
 * not a quote. Real gas depends on the chain, code version and the message.
 */
import { packTemplate, unpackTemplate } from './pack.js';
import { DICT } from './pack-dict.js';

const te = new TextEncoder();
const b64 = (u8) => { let s = ''; for (let i = 0; i < u8.length; i += 0x8000) s += String.fromCharCode(...u8.subarray(i, i + 0x8000)); return btoa(s); };

/** gas ≈ a + b · (instantiate message bytes). Fitted per contract path. */
export const GAS_FIT = {
  measured: '2026-10-15, local chain, terpd v6.4.0',
  json71: { inst: [166677, 110.45], mint: [129114, 12.13], spread: 0.01 },
  svp1: { inst: [207639, 63.39], mint: [140757, 4.01], spread: 0.03 }, // packed-only build, 9 templates
};
const est = ([a, b], x) => Math.round(a + b * x);

/** Count dictionary entries the template contains (non-overlapping, longest first). */
export function dictionaryHits(template) {
  const order = DICT.map((w, i) => [w, i]).sort((x, y) => y[0].length - x[0].length);
  const hits = new Map();
  let rest = String(template || '');
  for (const [w] of order) {
    const n = rest.split(w).length - 1;
    if (n) { hits.set(w, n); rest = rest.split(w).join('\u0000'); }
  }
  return [...hits.entries()].map(([word, count]) => ({ word, count, saved: count * (te.encode(word).length - 2) }))
    .sort((a, b) => b.saved - a.saved);
}

/**
 * Pack template + variables and check the round trip.
 * Returns { ok, error, bytes, b64, templateBytes, packedBytes, roundTrip, hits }.
 */
export function packInfo(template, variables) {
  const tpl = String(template || '');
  const vars = (Array.isArray(variables) ? variables : []).map((v) => ({ name: v.name, kind: v.kind }));
  const templateBytes = te.encode(tpl).length + te.encode(JSON.stringify(vars)).length;
  const hits = dictionaryHits(tpl);
  try {
    const bytes = packTemplate(tpl, vars);
    const back = unpackTemplate(bytes);
    const roundTrip = back.svg_template === tpl && JSON.stringify(back.variables) === JSON.stringify(vars);
    return { ok: roundTrip, error: roundTrip ? null : 'Round trip did not match. Use JSON for this template.', bytes, b64: b64(bytes), templateBytes, packedBytes: bytes.length, roundTrip, hits };
  } catch (e) {
    return { ok: false, error: e.message, bytes: null, b64: '', templateBytes, packedBytes: 0, roundTrip: false, hits };
  }
}

/** Size and gas estimates for both paths, from the two instantiate messages. */
export function compare(jsonInstantiate, packedInstantiate) {
  const jb = te.encode(JSON.stringify(jsonInstantiate)).length;
  const pb = packedInstantiate ? te.encode(JSON.stringify(packedInstantiate)).length : null;
  const out = { jsonMsgBytes: jb, packedMsgBytes: pb,
    json: { inst: est(GAS_FIT.json71.inst, jb), mint: est(GAS_FIT.json71.mint, jb) } };
  if (pb != null) out.packed = { inst: est(GAS_FIT.svp1.inst, pb), mint: est(GAS_FIT.svp1.mint, jb) };
  return out;
}
