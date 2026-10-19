/*!
 * svg-launchpad/engine.js: the cw721-svg rules, ported to JavaScript.
 *
 * Source of truth (groot, ~/abstract/terp-core/crates/terp-rs):
 *   crates/cw-svg/src/lib.rs
 *     compute_template_slots   L61   slot scan over UTF-8 bytes
 *     parse_decimal_scaled     L100  / format_decimal L149
 *     validate_variables       L177  validate_template_slots L248
 *     validate_animated_paint  L312  (working tree only, not deployed yet)
 *     resolve_variable         L559  value_from_range L609  channel_in_range L705
 *   contracts/infuser/cw721-svg/src/contract.rs
 *     MAX_SVG_SIZE L16, MAX_TOTAL_SUPPLY L17
 *     mint token seed  L148-153  sha256(u64le(token_id) || seed || u64le(block_height))
 *     derive_entropy   L485      u64le(sha256(token_seed || u64le(var_idx))[0..8])
 *     query_svg_token_uri L493, query_svg_placeholder L519 (seed = sha256(utf8(seed or "placeholder")))
 *   contracts/infuser/cw721-svg/src/lib.rs instantiate L43-129
 *
 * Deployed wasm (mainnet code 71 and 83, checksum 990E3A93...) runs on wasm32,
 * where `usize` is 32 bits: an Options index is (entropy mod 2^32) mod len.
 * Pure module: no DOM, runs in browsers and in Node 20+.
 */

export const MAX_SVG_SIZE = 42 * 1024;
export const MAX_TOTAL_SUPPLY = 10000;
export const SANITIZER_MAX_BYTES = 512 * 1024;

const enc = new TextEncoder();
const dec = new TextDecoder();
export const utf8 = (s) => enc.encode(String(s));
export const byteLength = (s) => enc.encode(String(s)).length;

// ── placeholders and slots ────────────────────────────────────────────────

/** Line number (1-based) of a byte offset. */
function lineOfByte(bytes, off) {
  let n = 1;
  for (let i = 0; i < off && i < bytes.length; i++) if (bytes[i] === 10) n++;
  return n;
}

/**
 * Every `${name}` occurrence, scanned the way compute_template_slots does.
 * Returns { occurrences: [{ name, start, end, line }], unclosed: { start, line } | null }.
 * An unclosed `${` stops the scan (the Rust helper panics there).
 */
export function scanPlaceholders(template) {
  const bytes = utf8(template);
  const len = bytes.length;
  const occurrences = [];
  let unclosed = null;
  let i = 0;
  while (i < Math.max(0, len - 1)) {
    if (bytes[i] === 36 && bytes[i + 1] === 123) {
      const start = i;
      let j = i + 2;
      while (j < len && bytes[j] !== 125) j++;
      if (j >= len) { unclosed = { start, line: lineOfByte(bytes, start) }; break; }
      const name = dec.decode(bytes.subarray(i + 2, j));
      occurrences.push({ name, start, end: j + 1, line: lineOfByte(bytes, start) });
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return { occurrences, unclosed };
}

/**
 * Slots for the template, plus the gaps between template and variables.
 * missing: names used in the template with no variable; unused: variables no slot uses.
 */
export function computeSlots(template, variables) {
  const { occurrences, unclosed } = scanPlaceholders(template);
  const names = (variables || []).map((v) => (v && typeof v.name === 'string' ? v.name : null));
  const slots = [];
  const missing = new Map();
  const counts = new Map();
  for (const o of occurrences) {
    counts.set(o.name, (counts.get(o.name) || 0) + 1);
    const idx = names.indexOf(o.name);
    if (idx < 0) {
      if (!missing.has(o.name)) missing.set(o.name, []);
      missing.get(o.name).push(o.line);
      continue;
    }
    slots.push({ start: o.start, end: o.end, var_idx: idx });
  }
  const used = new Set(occurrences.map((o) => o.name));
  const unused = names.filter((n) => n != null && !used.has(n));
  const dupes = names.filter((n, i) => n != null && names.indexOf(n) !== i);
  return {
    slots,
    occurrences,
    unclosed,
    counts: [...counts].map(([name, count]) => ({ name, count, defined: names.includes(name) })),
    missing: [...missing].map(([name, lines]) => ({ name, lines })),
    unused: [...new Set(unused)],
    duplicateNames: [...new Set(dupes)],
  };
}

/** Drop XML comments (on-chain templates usually ship without them). */
export function stripComments(template) {
  return String(template).replace(/<!--[\s\S]*?-->/g, '');
}

// ── decimals (parse_decimal_scaled / format_decimal) ──────────────────────

const INT_RE = /^[+-]?\d+$/;

export function parseDecimalScaled(s, precision) {
  const t = String(s == null ? '' : s).trim();
  if (!t) throw new Error('empty string');
  const negative = t.startsWith('-');
  const abs = negative ? t.slice(1) : t;
  const parts = abs.split('.');
  if (parts.length > 2 || parts.length === 0 || parts[0] === '') throw new Error(`invalid decimal: ${t}`);
  if (!INT_RE.test(parts[0])) throw new Error(`invalid integer part: ${t}`);
  const factor = 10n ** BigInt(precision);
  let scaled = BigInt(parts[0]) * factor;
  const frac = parts.length === 2 ? parts[1] : '';
  if (frac !== '') {
    if (!INT_RE.test(frac)) throw new Error(`invalid fractional part: ${t}`);
    const fracLen = frac.length;
    const fracVal = BigInt(frac);
    if (fracLen <= precision) scaled += fracVal * 10n ** BigInt(precision - fracLen);
    else scaled += fracVal / 10n ** BigInt(fracLen - precision);
  }
  return negative ? -scaled : scaled;
}

export function formatDecimal(scaled, precision) {
  const v = BigInt(scaled);
  if (!precision) return v.toString();
  const factor = 10n ** BigInt(precision);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const ip = abs / factor;
  const fp = (abs % factor).toString().padStart(precision, '0');
  return `${neg ? '-' : ''}${ip}.${fp}`;
}

// ── variable kinds ────────────────────────────────────────────────────────

/** 'options' | 'range' | 'rgb' | 'rgb_styled' | null */
export function kindOf(def) {
  const k = def && def.kind;
  if (k === 'rgb') return 'rgb';
  if (k && typeof k === 'object' && !Array.isArray(k)) {
    const keys = Object.keys(k);
    if (keys.length === 1 && ['options', 'range', 'rgb_styled'].includes(keys[0])) return keys[0];
  }
  return null;
}

const U8 = (n) => Number.isInteger(n) && n >= 0 && n <= 255;

/**
 * Same checks as cw_svg::validate_variables, plus shape checks that serde
 * would reject. Returns a list of { name, message } (empty when valid).
 */
export function validateVariables(variables) {
  const out = [];
  if (!Array.isArray(variables)) return [{ name: '', message: 'variables must be a JSON array of { name, kind }' }];
  variables.forEach((v, i) => {
    const name = v && typeof v.name === 'string' ? v.name : `#${i}`;
    if (!v || typeof v !== 'object') return out.push({ name, message: 'not an object' });
    if (typeof v.name !== 'string' || !v.name) out.push({ name, message: 'name must be a non-empty string' });
    const kind = kindOf(v);
    if (!kind) return out.push({ name, message: 'kind must be "rgb", {"options":[...]}, {"range":{min,max,precision}} or {"rgb_styled":[...]}' });
    if (kind === 'options') {
      const o = v.kind.options;
      if (!Array.isArray(o) || o.some((x) => typeof x !== 'string')) out.push({ name, message: 'options must be an array of strings' });
      else if (!o.length) out.push({ name, message: `variable '${name}': options list must not be empty` });
    } else if (kind === 'range') {
      const r = v.kind.range || {};
      const p = r.precision;
      if (typeof r.min !== 'string' || typeof r.max !== 'string') { out.push({ name, message: 'range min and max must be decimal strings, e.g. "0.5"' }); return; }
      if (!Number.isInteger(p) || p < 0 || p > 4294967295) { out.push({ name, message: 'range precision must be a whole number' }); return; }
      if (p > 18) { out.push({ name, message: `variable '${name}': precision ${p} exceeds maximum of 18` }); return; }
      let lo, hi;
      try { lo = parseDecimalScaled(r.min, p); } catch (e) { out.push({ name, message: `variable '${name}' min: ${e.message}` }); return; }
      try { hi = parseDecimalScaled(r.max, p); } catch (e) { out.push({ name, message: `variable '${name}' max: ${e.message}` }); return; }
      if (lo > hi) out.push({ name, message: `variable '${name}': min (${r.min}) must be <= max (${r.max})` });
    } else if (kind === 'rgb_styled') {
      const rs = v.kind.rgb_styled;
      if (!Array.isArray(rs)) { out.push({ name, message: 'rgb_styled must be an array of ranges' }); return; }
      if (!rs.length) { out.push({ name, message: `variable '${name}': rgb_styled ranges list must not be empty` }); return; }
      rs.forEach((r, j) => {
        const keys = ['r_min', 'r_max', 'g_min', 'g_max', 'b_min', 'b_max'];
        if (!r || keys.some((k) => !U8(r[k]))) out.push({ name, message: `range ${j}: r_min..b_max must be whole numbers 0-255` });
        else if (r.r_min > r.r_max || r.g_min > r.g_max || r.b_min > r.b_max) out.push({ name, message: `variable '${name}': range ${j} has min > max for a channel` });
      });
    }
  });
  return out;
}

/** cw_svg::validate_template_slots, returning every problem. */
export function validateTemplateSlots(template, variables, slots) {
  const bytes = utf8(template);
  const out = [];
  let prevEnd = 0;
  slots.forEach((s, i) => {
    if (s.start >= s.end || s.end > bytes.length) { out.push(`slot ${i} out of bounds: start=${s.start}, end=${s.end}, template_len=${bytes.length}`); return; }
    if (s.start < prevEnd) { out.push(`slot ${i} overlaps or is out of order: start=${s.start} < prev_end=${prevEnd}`); return; }
    prevEnd = s.end;
    if (s.var_idx >= variables.length) { out.push(`slot ${i} var_idx ${s.var_idx} out of range (only ${variables.length} variables)`); return; }
    const expected = '${' + variables[s.var_idx].name + '}';
    const actual = dec.decode(bytes.subarray(s.start, s.end));
    if (actual !== expected) out.push(`slot ${i} mismatch at [${s.start}, ${s.end}): expected '${expected}', found '${actual}'`);
  });
  return out;
}

// ── entropy and substitution ──────────────────────────────────────────────

async function sha256(bytes) {
  const subtle = globalThis.crypto && globalThis.crypto.subtle;
  if (!subtle) throw new Error('WebCrypto (crypto.subtle) is not available here');
  return new Uint8Array(await subtle.digest('SHA-256', bytes));
}

function u64le(n) {
  const out = new Uint8Array(8);
  let v = BigInt.asUintN(64, BigInt(n));
  for (let i = 0; i < 8; i++) { out[i] = Number(v & 0xffn); v >>= 8n; }
  return out;
}

function concat(...parts) {
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return out;
}

function readU64le(bytes) {
  let v = 0n;
  for (let i = 7; i >= 0; i--) v = (v << 8n) | BigInt(bytes[i]);
  return v;
}

export async function deriveEntropy(tokenSeed, varIdx) {
  return readU64le(await sha256(concat(tokenSeed, u64le(varIdx))));
}

function channelInRange(byte, min, max) {
  if (min === max) return min;
  const span = (max - min) + 1;
  return min + (byte % span);
}

/** resolve_variable for one entropy value. */
export function resolveValue(def, entropy) {
  const kind = kindOf(def);
  const e = BigInt.asUintN(64, entropy);
  const byte = (k) => Number((e >> BigInt(8 * k)) & 0xffn);
  if (kind === 'options') {
    const o = def.kind.options;
    const idx = Number((e & 0xffffffffn) % BigInt(o.length)); // usize is u32 on wasm32
    return o[idx];
  }
  if (kind === 'range') {
    const { min, max, precision } = def.kind.range;
    const lo = parseDecimalScaled(min, precision);
    const hi = parseDecimalScaled(max, precision);
    const range = hi - lo;
    const scaled = range === 0n ? lo : lo + (e % (range + 1n));
    return formatDecimal(scaled, precision);
  }
  if (kind === 'rgb') return `rgb(${byte(0)},${byte(1)},${byte(2)})`;
  if (kind === 'rgb_styled') {
    const rs = def.kind.rgb_styled;
    const r = rs[byte(3) % rs.length];
    return `rgb(${channelInRange(byte(0), r.r_min, r.r_max)},${channelInRange(byte(1), r.g_min, r.g_max)},${channelInRange(byte(2), r.b_min, r.b_max)})`;
  }
  throw new Error(`variable '${def && def.name}' has an unknown kind`);
}

export async function resolveParams(variables, tokenSeed) {
  const out = [];
  for (let i = 0; i < variables.length; i++) {
    out.push({ name: variables[i].name, value: resolveValue(variables[i], await deriveEntropy(tokenSeed, i)) });
  }
  return out;
}

/** Params for SvgPlaceholder { seed } (seed defaults to "placeholder"). */
export async function placeholderParams(variables, seed) {
  return resolveParams(variables, await sha256(utf8(seed == null ? 'placeholder' : seed)));
}

export function b64ToBytes(s) {
  const bin = atob(String(s || ''));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function bytesToB64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
  return btoa(s);
}

/** Params a real mint stores: token id, collection seed (base64), block height. */
export async function mintParams(variables, seedB64, tokenId, blockHeight) {
  const seed = concat(u64le(tokenId), b64ToBytes(seedB64), u64le(blockHeight));
  return resolveParams(variables, await sha256(seed));
}

/** query_svg_token_uri / query_svg_placeholder: one pass over the slots. */
export function renderSlots(template, slots, params) {
  const bytes = utf8(template);
  const parts = [];
  let cursor = 0;
  for (const s of slots) {
    parts.push(bytes.subarray(cursor, s.start));
    parts.push(utf8(params[s.var_idx].value));
    cursor = s.end;
  }
  parts.push(bytes.subarray(cursor));
  return dec.decode(concat(...parts));
}

// ── markup tokenizer (port of the Rust take_tag / parse_tag_body) ─────────

const NAME_CH = /[A-Za-z0-9:_-]/;
const WS_CH = /[ \t\n\f\r]/;

function skipUntil(s, marker, extra) {
  const end = s.indexOf(marker);
  return end < 0 ? '' : s.slice(end + extra);
}

function parseTagBody(body) {
  let i = 0;
  while (i < body.length && NAME_CH.test(body[i])) i++;
  const name = body.slice(0, i);
  const attrs = [];
  while (i < body.length) {
    while (i < body.length && WS_CH.test(body[i])) i++;
    if (i >= body.length) break;
    const start = i;
    while (i < body.length && NAME_CH.test(body[i])) i++;
    if (start === i) break;
    const key = body.slice(start, i).toLowerCase();
    while (i < body.length && WS_CH.test(body[i])) i++;
    if (i >= body.length || body[i] !== '=') { attrs.push([key, '']); continue; }
    i++;
    while (i < body.length && WS_CH.test(body[i])) i++;
    if (i >= body.length) break;
    let value;
    if (body[i] === '"' || body[i] === "'") {
      const q = body[i];
      i++;
      const vs = i;
      while (i < body.length && body[i] !== q) i++;
      value = body.slice(vs, i);
      if (i < body.length) i++;
    } else {
      const vs = i;
      while (i < body.length && !WS_CH.test(body[i]) && body[i] !== '/') i++;
      value = body.slice(vs, i);
    }
    attrs.push([key, value]);
  }
  return { name, attrs };
}

function takeTag(s) {
  if (!s.startsWith('<')) return null;
  let i = 1;
  let quote = null;
  while (i < s.length) {
    const c = s[i];
    if (quote) { if (c === quote) quote = null; } else if (c === '"' || c === "'") quote = c; else if (c === '>') break;
    i++;
  }
  if (i >= s.length) return null;
  const inner = s.slice(1, i).trim();
  const selfClosing = inner.endsWith('/');
  const closing = inner.startsWith('/');
  let body = closing ? inner.slice(1).trimStart() : inner;
  body = body.replace(/\/+$/, '').trimEnd();
  const { name, attrs } = parseTagBody(body);
  return { name, attrs, selfClosing, closing, rawLen: i + 1, text: s.slice(0, i + 1) };
}

/**
 * Walk start/end tags. cb(tag, info) for every tag; info.offset is the char
 * offset of '<' in the input. Comments, CDATA, PIs and declarations are skipped.
 */
function walkTags(src, cb) {
  let rest = String(src);
  const total = rest.length;
  for (;;) {
    const idx = rest.indexOf('<');
    if (idx < 0) break;
    rest = rest.slice(idx);
    if (rest.startsWith('<!--')) { rest = skipUntil(rest, '-->', 3); continue; }
    if (rest.startsWith('<![CDATA[')) { rest = skipUntil(rest, ']]>', 3); continue; }
    if (rest.startsWith('<?')) { rest = skipUntil(rest, '?>', 2); continue; }
    if (rest.startsWith('<!')) { rest = skipUntil(rest, '>', 1); continue; }
    const offset = total - rest.length;
    const tag = takeTag(rest);
    if (!tag) break;
    rest = rest.slice(tag.rawLen);
    if (cb(tag, { offset, rest }) === false) break;
  }
}

const localName = (n) => String(n).split(':').pop();
const attrVal = (attrs, key) => { const a = attrs.find(([k]) => k === key); return a ? a[1] : undefined; };

function styleValue(style, name) {
  for (const decl of String(style).split(';')) {
    const at = decl.indexOf(':');
    const key = (at < 0 ? decl : decl.slice(0, at)).trim();
    if (key.toLowerCase() === name.toLowerCase()) {
      if (at < 0) return null; // Rust returns None here and stops looking
      return decl.slice(at + 1).trim();
    }
  }
  return null;
}

function paintFromTag(attrs, name) {
  const style = attrVal(attrs, 'style');
  if (style !== undefined) {
    const v = styleValue(style, name);
    if (v != null) return v;
  }
  const v = attrVal(attrs, name);
  return v === undefined ? null : v;
}

function isVisiblePaint(v) {
  const t = String(v).trim().toLowerCase();
  return t !== '' && t !== 'none' && t !== 'transparent';
}

function lineAt(src, offset) {
  let n = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src.charCodeAt(i) === 10) n++;
  return n;
}

/**
 * Port of cw_svg::validate_animated_paint. The Rust check stops at the first
 * problem; this returns all of them: [{ element, attribute, line }].
 * An element whose fill/stroke is set only by <animate>/<set> renders blank
 * wherever animation is not played (stills, image proxies, filters that drop SMIL).
 */
export function animatedPaintFindings(src) {
  const findings = [];
  const stack = [];
  walkTags(src, (tag, { offset }) => {
    if (tag.closing) { stack.pop(); return; }
    const parent = stack[stack.length - 1];
    const name = localName(tag.name);
    if (name === 'animate' || name === 'set') {
      const an = attrVal(tag.attrs, 'attributename');
      const attribute = an === undefined ? null : ({ fill: 'fill', stroke: 'stroke' })[an.trim().toLowerCase()] || null;
      if (attribute) {
        const effective = parent ? parent[attribute] : null;
        const visible = attribute === 'fill'
          ? (effective == null ? true : isVisiblePaint(effective))
          : (effective == null ? false : isVisiblePaint(effective));
        if (!visible) findings.push({ element: parent ? parent.name : name, attribute, line: lineAt(src, offset) });
      }
      if (!tag.selfClosing) stack.push({ name, fill: parent ? parent.fill : null, stroke: parent ? parent.stroke : null });
      return;
    }
    const fill = paintFromTag(tag.attrs, 'fill') ?? (parent ? parent.fill : null);
    const stroke = paintFromTag(tag.attrs, 'stroke') ?? (parent ? parent.stroke : null);
    if (!tag.selfClosing) stack.push({ name, fill, stroke });
  });
  return findings;
}

// ── id references ─────────────────────────────────────────────────────────

const URL_REF = /url\(\s*['"]?#([^'")\s]+)['"]?\s*\)/g;
const SYNC_REF = /^\s*([A-Za-z_][\w-]*)\.(begin|end|repeat\(\d+\)|click|mouseover|mouseout)/;

/** ids defined, duplicate ids and dangling references (#id, url(#id), SMIL syncbase). */
export function idReferences(src) {
  const ids = new Map();
  const refs = [];
  let inStyle = false;
  let styleStart = 0;
  walkTags(src, (tag, { offset }) => {
    const name = localName(tag.name).toLowerCase();
    if (name === 'style') {
      if (tag.closing) {
        if (inStyle) {
          const css = src.slice(styleStart, offset);
          for (const m of css.matchAll(URL_REF)) refs.push({ id: m[1], via: '<style> url(#…)', line: lineAt(src, styleStart) });
        }
        inStyle = false;
      } else if (!tag.selfClosing) { inStyle = true; styleStart = offset + tag.rawLen; }
      return;
    }
    if (tag.closing) return;
    const line = lineAt(src, offset);
    for (const [k, v] of tag.attrs) {
      if (k === 'id') { ids.set(v, (ids.get(v) || 0) + 1); continue; }
      if ((k === 'href' || k === 'xlink:href') && v.trim().startsWith('#')) refs.push({ id: v.trim().slice(1), via: `${k}="#…"`, line, el: name });
      for (const m of String(v).matchAll(URL_REF)) refs.push({ id: m[1], via: `${k}="url(#…)"`, line, el: name });
      if ((k === 'begin' || k === 'end') && SMIL_TAGS_LC.has(name)) {
        for (const part of String(v).split(';')) {
          const m = part.match(SYNC_REF);
          if (m) refs.push({ id: m[1], via: `${k}="${m[1]}.${m[2]}"`, line, el: name });
        }
      }
    }
  });
  const dangling = refs.filter((r) => !ids.has(r.id));
  const duplicates = [...ids].filter(([, n]) => n > 1).map(([id, n]) => ({ id, count: n }));
  return { ids: [...ids.keys()], refs, dangling, duplicates };
}
const SMIL_TAGS_LC = new Set(['animate', 'set', 'animatetransform', 'animatemotion']);

// ── per-token soundness ───────────────────────────────────────────────────

/**
 * Checks on one resolved SVG (no DOM needed). Returns { errors, warnings }:
 * each item { code, text }. `params` are the token's resolved values.
 */
/**
 * transform / gradientTransform / patternTransform attributes written with CSS
 * units (rotate(180deg), translate(4px)). The SVG attribute grammar takes plain
 * numbers; Chrome drops the whole attribute, Firefox accepts it.
 */
export function transformUnitFindings(src) {
  const out = [];
  const re = /\b(transform|gradientTransform|patternTransform)\s*=\s*("([^"]*)"|'([^']*)')/g;
  for (const m of String(src).matchAll(re)) {
    const v = m[3] ?? m[4] ?? '';
    if (/\d\s*(deg|rad|grad|turn|px|em|%)/i.test(v) && !v.includes('${')) out.push({ attribute: m[1], value: v, line: lineAt(src, m.index) });
  }
  return out;
}

export function checkRendered(svg, { params = [], slotsByVar = null, animationOnlyIsError = false } = {}) {
  const errors = [];
  const warnings = [];
  const left = String(svg).match(/\$\{[^}]*\}?/g) || [];
  if (left.length) errors.push({ code: 'unresolved', text: `Unresolved placeholder${left.length > 1 ? 's' : ''}: ${[...new Set(left)].slice(0, 6).join(', ')}` });
  params.forEach((p, i) => {
    if (!String(p.value).trim() && (!slotsByVar || slotsByVar[i] > 0)) warnings.push({ code: 'empty', text: `\${${p.name}} resolved to an empty value` });
    if (/[<>&]/.test(p.value) || (/["']/.test(p.value))) warnings.push({ code: 'markup-in-value', text: `\${${p.name}} value contains markup characters (${JSON.stringify(p.value).slice(0, 40)}), which can break the SVG` });
  });
  const refs = idReferences(svg);
  for (const d of refs.dangling) errors.push({ code: 'dangling-ref', text: `Broken reference ${d.via.replace('…', d.id)} on line ${d.line}: no element has id="${d.id}"` });
  for (const d of refs.duplicates) warnings.push({ code: 'duplicate-id', text: `id="${d.id}" is used ${d.count} times` });
  for (const f of animatedPaintFindings(svg)) {
    const item = { code: 'animation-only-paint', text: `<${f.element}> on line ${f.line} gets its ${f.attribute} only from <animate>/<set>; it is blank wherever animation does not play` };
    (animationOnlyIsError ? errors : warnings).push(item);
  }
  for (const t of transformUnitFindings(svg)) warnings.push({ code: 'transform-units', text: `${t.attribute}="${t.value}" on line ${t.line} uses CSS units; Chrome ignores it (write ${t.value.replace(/(\d)\s*deg/gi, '$1')} instead)` });
  if (byteLength(svg) > SANITIZER_MAX_BYTES) errors.push({ code: 'too-large', text: 'Resolved SVG is over 512 KB; the site filter will not show it' });
  return { errors, warnings };
}

// ── name grammar (dictionary.md "Quick Reference: Name -> Kind Inference") ─

export const NAME_GRAMMAR = [
  { classes: ['color', 'glow', 'hue'], kind: 'rgb_styled', note: 'palette ranges, shared by a palette group' },
  { classes: ['opacity', 'alpha'], kind: 'range', min: '0.0', max: '1.0', precision: 2, note: 'unitless' },
  { classes: ['pulse', 'breath'], kind: 'range', min: '1.2', max: '4.5', precision: 2, note: 'seconds; template appends s' },
  { classes: ['flicker', 'strobe'], kind: 'range', min: '0.08', max: '0.50', precision: 2, note: 'seconds; template appends s' },
  { classes: ['drift', 'float'], kind: 'range', min: '3.0', max: '15.0', precision: 1, note: 'seconds; template appends s' },
  { classes: ['rotate', 'spin'], kind: 'range', min: '0', max: '360', precision: 0, note: 'degrees' },
  { classes: ['scale', 'size'], kind: 'range', min: '0.5', max: '2.0', precision: 2, note: 'multiplier' },
  { classes: ['blur'], kind: 'range', min: '0.5', max: '8.0', precision: 1, note: 'px, unitless' },
  { classes: ['offset', 'shift'], kind: 'range', note: 'context-defined displacement' },
  { classes: ['toggle'], kind: 'options', options: ['0', '1'], note: 'binary switch' },
  { classes: ['mode'], kind: 'options', note: 'collection-defined list' },
  { classes: ['val'], kind: 'range', note: 'context-defined scalar' },
];

const DEFAULT_PALETTE = [
  { r_min: 50, r_max: 120, g_min: 220, g_max: 255, b_min: 50, b_max: 120 },
  { r_min: 0, r_max: 60, g_min: 200, g_max: 255, b_min: 200, b_max: 255 },
];

/** A starting VariableDef for a name, from its class prefix. */
export function inferVariable(name) {
  const cls = String(name).split('-')[0].toLowerCase();
  const rule = NAME_GRAMMAR.find((r) => r.classes.includes(cls));
  if (!rule) return { name, kind: { options: ['CHANGE-ME'] }, inferred: false };
  if (rule.kind === 'rgb_styled') return { name, kind: { rgb_styled: DEFAULT_PALETTE.map((r) => ({ ...r })) }, inferred: true };
  if (rule.kind === 'options') return { name, kind: { options: rule.options ? [...rule.options] : ['a', 'b'] }, inferred: true };
  return { name, kind: { range: { min: rule.min || '0', max: rule.max || '1', precision: rule.precision ?? 2 } }, inferred: true };
}

/** Accept a VariableDef array or a Collection Layer dictionary ({ vars: [...] }). */
export function variablesFromDictionary(json) {
  if (Array.isArray(json)) return { variables: json, dictionary: null };
  if (json && typeof json === 'object' && Array.isArray(json.vars)) return { variables: json.vars, dictionary: json };
  if (json && typeof json === 'object' && Array.isArray(json.variables)) return { variables: json.variables, dictionary: json };
  throw new Error('Expected a JSON array of variables, or a dictionary object with a "vars" array');
}

// ── bech32 (address checks) ───────────────────────────────────────────────

const B32 = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
function polymod(values) {
  const G = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  let chk = 1;
  for (const v of values) {
    const b = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((b >>> i) & 1) chk ^= G[i];
  }
  return chk >>> 0;
}
export function isBech32(addr, prefix = 'terp') {
  const s = String(addr || '');
  if (s !== s.toLowerCase() || s.length > 90) return false;
  const pos = s.lastIndexOf('1');
  if (pos < 1 || pos + 7 > s.length) return false;
  const hrp = s.slice(0, pos);
  if (prefix && hrp !== prefix) return false;
  const data = [];
  for (const c of s.slice(pos + 1)) { const d = B32.indexOf(c); if (d < 0) return false; data.push(d); }
  const exp = [...hrp].map((c) => c.charCodeAt(0) >> 5).concat([0], [...hrp].map((c) => c.charCodeAt(0) & 31));
  return polymod(exp.concat(data)) === 1;
}

// ── JSON Schema (draft-07 subset used by cosmwasm-schema) ─────────────────

const UINT_MAX = { uint8: 255, uint16: 65535, uint32: 4294967295 };

/** Validate `value` against `schema` (with #/definitions refs). Returns [{ path, message }]. */
export function validateSchema(value, schema, root = schema, path = '$') {
  const errs = [];
  if (schema.$ref) {
    const name = schema.$ref.replace('#/definitions/', '');
    const def = root.definitions && root.definitions[name];
    if (!def) return [{ path, message: `unknown $ref ${schema.$ref}` }];
    return validateSchema(value, def, root, path);
  }
  if (schema.allOf) for (const s of schema.allOf) errs.push(...validateSchema(value, s, root, path));
  if (schema.anyOf) {
    const ok = schema.anyOf.some((s) => validateSchema(value, s, root, path).length === 0);
    if (!ok) errs.push({ path, message: 'does not match any allowed form' });
  }
  if (schema.oneOf) {
    const results = schema.oneOf.map((s) => validateSchema(value, s, root, path));
    const n = results.filter((r) => r.length === 0).length;
    if (n !== 1) {
      const best = results.slice().sort((a, b) => a.length - b.length)[0] || [];
      errs.push(n === 0 ? (best.length && best.length <= 3 ? best[0] : { path, message: 'does not match any allowed form' }) : { path, message: 'matches more than one form' });
    }
  }
  if (schema.enum && !schema.enum.some((e) => e === value)) errs.push({ path, message: `must be one of ${schema.enum.map((e) => JSON.stringify(e)).join(', ')}` });
  if (schema.type) {
    const types = Array.isArray(schema.type) ? schema.type : [schema.type];
    const t = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value;
    const okType = types.some((x) => x === t || (x === 'number' && t === 'integer'));
    if (!okType) { errs.push({ path, message: `must be ${types.join(' or ')}, got ${t}` }); return errs; }
    if (t === 'integer') {
      if (schema.minimum != null && value < schema.minimum) errs.push({ path, message: `must be >= ${schema.minimum}` });
      if (UINT_MAX[schema.format] != null && value > UINT_MAX[schema.format]) errs.push({ path, message: `must fit in ${schema.format}` });
      if (schema.format === 'uint64' && !Number.isSafeInteger(value)) errs.push({ path, message: 'too large for a JSON number; use a smaller value' });
    }
    if (t === 'object') {
      for (const r of schema.required || []) if (!(r in value)) errs.push({ path: `${path}.${r}`, message: 'is required' });
      const props = schema.properties || {};
      for (const [k, v] of Object.entries(value)) {
        if (props[k]) errs.push(...validateSchema(v, props[k], root, `${path}.${k}`));
        else if (schema.additionalProperties === false) errs.push({ path: `${path}.${k}`, message: 'is not a field the contract accepts' });
      }
    }
    if (t === 'array' && schema.items) value.forEach((v, i) => errs.push(...validateSchema(v, schema.items, root, `${path}[${i}]`)));
  }
  return errs;
}

// ── message builder ───────────────────────────────────────────────────────

const DIGITS = /^\d+$/;
const B64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Decimal display amount -> base units string (no float math). */
export function toBaseUnits(display, decimals) {
  const t = String(display || '').trim();
  if (!/^\d*(?:\.\d*)?$/.test(t) || t === '' || t === '.') throw new Error(`"${display}" is not an amount`);
  const [ip, fp = ''] = t.split('.');
  if (fp.length > decimals) throw new Error(`"${display}" has more than ${decimals} decimals`);
  const s = (ip || '0') + fp.padEnd(decimals, '0');
  return BigInt(s).toString();
}

/**
 * Build CreateSvgCollection and run the instantiate checks.
 * form: { label, name, symbol, total, seed, tiers: [{ untilCount, amount (base units), denom }],
 *         mintStartDelay, mintDuration (seconds), whitelist, creator, withdrawAddress, minter, requireAuth }
 * acceptedDenoms: Set of allowed denoms.
 * Returns { msg, instantiateMsg, slots, errors: [], warnings: [] }.
 */
export function buildCreateMsg({ template, variables, form, acceptedDenoms = null, bech32Prefix = 'terp' }) {
  const errors = [];
  const warnings = [];
  const tpl = String(template || '');
  const vars = Array.isArray(variables) ? variables : [];
  if (!tpl.trim()) errors.push('The template is empty.');
  const size = byteLength(tpl);
  if (size > MAX_SVG_SIZE) errors.push(`The template is ${size.toLocaleString('en-US')} bytes; the contract limit is ${MAX_SVG_SIZE.toLocaleString('en-US')}.`);
  for (const v of validateVariables(vars)) errors.push(v.message);
  const sl = computeSlots(tpl, vars);
  if (sl.unclosed) errors.push(`Unclosed "\${" on line ${sl.unclosed.line}.`);
  for (const m of sl.missing) errors.push(`\${${m.name}} has no variable (line ${m.lines.join(', ')}).`);
  for (const u of sl.unused) warnings.push(`Variable "${u}" is not used in the template.`);
  for (const d of sl.duplicateNames) warnings.push(`Variable name "${d}" is defined more than once; only the first one is used.`);
  for (const e of validateTemplateSlots(tpl, vars, sl.slots)) errors.push(e);

  const total = Number(form.total);
  if (!Number.isInteger(total) || total < 1) errors.push('Supply must be a whole number of at least 1.');
  else if (total > MAX_TOTAL_SUPPLY) errors.push(`Supply ${total} is over the contract maximum of ${MAX_TOTAL_SUPPLY}.`);

  const label = String(form.label || '').trim();
  if (!label) errors.push('Label is required (it names the contract on chain).');
  else if (label.length > 128) errors.push('Label must be 128 characters or fewer.');
  if (!String(form.name || '').trim()) errors.push('Name is required.');
  if (!String(form.symbol || '').trim()) errors.push('Symbol is required.');

  const seed = String(form.seed || '').trim();
  if (!seed) errors.push('Seed is required (base64).');
  else if (!B64.test(seed)) errors.push('Seed must be base64 (it is stored as Binary).');

  const tiers = [];
  const denoms = new Set();
  (form.tiers || []).forEach((t, i) => {
    const until = Number(t.untilCount);
    if (!Number.isInteger(until) || until < 1) errors.push(`Price tier ${i + 1}: "until" must be a whole number of at least 1.`);
    if (t.denom && !DIGITS.test(String(t.amount))) errors.push(`Price tier ${i + 1}: amount must be base units (digits only).`);
    if (!t.denom) errors.push(`Price tier ${i + 1}: choose a payment token.`);
    else if (acceptedDenoms && !acceptedDenoms.has(t.denom)) errors.push(`Price tier ${i + 1}: ${t.denom} is not in the accepted payment set.`);
    denoms.add(t.denom);
    tiers.push({ until_count: until, price: { denom: String(t.denom || ''), amount: String(t.amount) } });
  });
  for (let i = 1; i < tiers.length; i++) {
    if (!(tiers[i].until_count > tiers[i - 1].until_count)) errors.push(`Price tier ${i + 1}: "until" must be higher than tier ${i}'s (${tiers[i - 1].until_count}).`);
  }
  if (denoms.size > 1) warnings.push('Tiers use more than one token. A batch mint that crosses tiers fails, because the contract needs one token per batch.');
  if (tiers.length && Number.isInteger(total) && tiers[tiers.length - 1].until_count < total) {
    warnings.push(`The last tier ends at ${tiers[tiers.length - 1].until_count} but supply is ${total}: mints after token ${tiers[tiers.length - 1].until_count} will fail.`);
  }
  if (!tiers.length) warnings.push('No price tiers: minting is free.');

  const addr = (v, what) => {
    const s = String(v || '').trim();
    if (!s) return null;
    if (!isBech32(s, bech32Prefix)) errors.push(`${what} is not a valid ${bech32Prefix}1… address.`);
    return s;
  };
  const whitelist = addr(form.whitelist, 'Whitelist contract');
  const creator = addr(form.creator, 'Creator');
  const withdraw = addr(form.withdrawAddress, 'Payout address');
  const minter = addr(form.minter, 'Minter');

  const secs = (v, what) => {
    const s = String(v ?? '').trim();
    if (!s) return null;
    if (!DIGITS.test(s)) { errors.push(`${what} must be whole seconds.`); return null; }
    return (BigInt(s) * 1000000000n).toString(); // Timestamp = nanoseconds string
  };
  const start = secs(form.mintStartDelay, 'Mint start delay');
  let end = null;
  const durRaw = String(form.mintDuration ?? '').trim();
  if (durRaw) {
    const delayRaw = String(form.mintStartDelay ?? '').trim() || '0';
    if (!DIGITS.test(durRaw)) errors.push('Mint length must be whole seconds.');
    else if (DIGITS.test(delayRaw)) {
      if (durRaw === '0' || /^0+$/.test(durRaw)) errors.push('Mint length must be at least 1 second, or blank for no end.');
      end = ((BigInt(delayRaw) + BigInt(durRaw)) * 1000000000n).toString();
    }
  }
  if (form.requireAuth) warnings.push('require_auth is not in the deployed cw721-svg code (71/83); the deployed contract rejects this field. Leave it off unless the collection code is upgraded.');

  const ext = {
    seed,
    svg_template: tpl,
    variables: vars.map((v) => ({ name: v.name, kind: v.kind })),
    template_slots: sl.slots,
    price_tiers: tiers,
    total: Number.isInteger(total) ? total : 0,
    mint_start_time: start,
    mint_end_time: end,
    whitelist,
  };
  if (form.requireAuth) ext.require_auth = true;
  const instantiateMsg = {
    name: String(form.name || '').trim(),
    symbol: String(form.symbol || '').trim(),
    collection_info_extension: ext,
    minter,
    creator,
    withdraw_address: withdraw,
  };
  const msg = { create_svg_collection: { instantiate_msg: instantiateMsg, label } };
  return { msg, instantiateMsg, slots: sl.slots, slotInfo: sl, errors, warnings };
}
