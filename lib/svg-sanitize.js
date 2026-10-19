/*!
 * svg-sanitize.js: one SVG filter for on-chain art, shared by terp.network
 * (pages/svg.html) and permissionless.money (pages/mint.html).
 * Keep both copies of this file byte-identical.
 *
 * Every on-chain SVG is treated as untrusted. Default path:
 *   1. size cap and DOCTYPE/ENTITY guard (also applied when trusted)
 *   2. strict parse as image/svg+xml; must be valid XML with an <svg> root;
 *      processing instructions and comments are dropped, CDATA becomes text
 *   3. DOMPurify allowlist (svg + svgFilters profiles) plus SMIL animation
 *   4. our rules: no on* attributes; href/xlink:href only "#id" or
 *      data:image/(png|jpeg|gif|webp), and on <a> only also ipfs://<cid>[/path] or
 *      https://<allowlisted IPFS gateway>/ipfs/<cid>[/path] (opened in a new tab,
 *      rel=noopener noreferrer nofollow); url(...) only url(#id); no @import or
 *      external url() in <style>; animate/set that target href or on* removed
 *
 * Trusted path (per collection, per device, off by default): step 1 only,
 * then the SVG is kept whole (scripts and handlers included) but is never
 * placed in the page. It is wrapped in a sandboxed iframe instead:
 *   sandbox="allow-scripts" (no allow-same-origin): the frame gets an opaque
 *   origin, so its scripts cannot read the site's DOM, localStorage, cookies
 *   or wallet, and cannot navigate the page or open popups;
 *   a CSP inside the frame blocks all network loads (default-src 'none');
 *   referrerpolicy="no-referrer", pointer-events off (cards stay clickable).
 * The returned `svg` is therefore always safe for innerHTML in every mode.
 */
import '/lib/vendor/dompurify-3.4.16/purify.min.js';

export const DOMPURIFY_VERSION = '3.4.16';
export const SVG_MAX_BYTES = 512 * 1024;
export const TRUST_KEY_PREFIX = 'svg.trusted.';

const SVG_NS = 'http://www.w3.org/2000/svg';

// SMIL elements we keep (DOMPurify lowercases tag names for HTML parsing).
const SMIL_TAGS = ['animate', 'set', 'animatetransform', 'animatemotion', 'mpath'];
const SMIL_ANIMATION = new Set(['animate', 'set', 'animatetransform', 'animatemotion']);
const SMIL_ATTRS = [
  'attributename', 'attributetype', 'values', 'dur', 'repeatcount', 'repeatdur',
  'begin', 'end', 'keytimes', 'keysplines', 'keypoints', 'calcmode', 'from', 'to',
  'by', 'fill', 'additive', 'accumulate', 'restart', 'min', 'max', 'type',
  'rotate', 'path', 'origin',
];
const FORBID_TAGS = ['script', 'foreignobject', 'foreignObject', 'iframe', 'embed', 'object'];

const HREF_SAME_DOC = /^#[\w.:-]+$/;
const HREF_DATA_IMAGE = /^data:image\/(?:png|jpe?g|gif|webp)(?:;[\w.+-]+=[\w.+-]+)*(?:;base64)?,[A-Za-z0-9+/=%._~\s-]*$/i;
// Same allowlist as cw-svg `links::GATEWAY_ALLOWLIST` (on-chain instantiate check).
export const IPFS_GATEWAYS = ['ipfs.io', 'dweb.link', 'w3s.link'];
const CID_PATH = '(b[a-z2-7]{19,119})((?:/[A-Za-z0-9._-]+){0,8})';
const HREF_IPFS = new RegExp('^ipfs://' + CID_PATH + '$');
const HREF_GATEWAY = new RegExp('^https://([a-z0-9.-]+)/ipfs/' + CID_PATH + '$');
// DOMPurify's own URI check runs first; ours (below) is the strict one.
const PURIFY_URI = /^(?:#|ipfs:\/\/|https:\/\/|data:image\/)/i;

/** External link rule for <a href>: ipfs:// or an allowlisted https gateway, no dot segments. */
export function externalLinkAllowed(value) {
  const t = String(value == null ? '' : value);
  if (t !== t.trim() || /[\s\\]/.test(t)) return false;
  let m = HREF_IPFS.exec(t);
  if (!m) {
    const g = HREF_GATEWAY.exec(t);
    if (!g || !IPFS_GATEWAYS.includes(g[1])) return false;
    m = [g[0], g[2], g[3]];
  }
  return !m[2].split('/').some((seg) => seg === '.' || seg === '..');
}
const CSS_FETCHING_FN = /(?:image-set|image|cross-fade|src|element)\s*\(/i;
const DOCTYPE_OR_ENTITY = /<!\s*(?:DOCTYPE|ENTITY)/i;

const REASONS = {
  empty: 'There is no SVG to show.',
  tooLarge: 'This SVG is larger than 512 KB, so it is not shown.',
  doctype: 'This SVG declares a DOCTYPE or entities, so it is not shown.',
  invalid: 'This SVG is not valid SVG markup, so it is not shown.',
  noFilter: 'The SVG filter did not load, so this SVG is not shown.',
  nothingLeft: 'Nothing safe was left in this SVG after filtering.',
};

function escapeText(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

/** A plain, honest stand-in shown when an SVG is refused. */
export function svgPlaceholder(reason) {
  const words = String(reason || REASONS.invalid).split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if ((line + ' ' + w).trim().length > 30) { lines.push(line.trim()); line = w; } else line += ' ' + w;
  }
  if (line.trim()) lines.push(line.trim());
  const tspans = lines.slice(0, 5).map((l, i) =>
    `<tspan x="150" dy="${i === 0 ? 0 : 18}">${escapeText(l)}</tspan>`).join('');
  return `<svg xmlns="${SVG_NS}" viewBox="0 0 300 300" class="svg-refused" role="img" aria-label="SVG not shown">` +
    `<rect x="1" y="1" width="298" height="298" rx="10" fill="#0d1117" stroke="#3a4552" stroke-dasharray="6 6"/>` +
    `<text x="150" y="118" text-anchor="middle" font-family="system-ui, sans-serif" font-size="16" fill="#c9d4df">SVG not shown</text>` +
    `<text x="150" y="150" text-anchor="middle" font-family="system-ui, sans-serif" font-size="12" fill="#8b98a5">${tspans}</text>` +
    `</svg>`;
}

function byteLength(s) {
  try { return new TextEncoder().encode(s).length; } catch { return s.length * 3; }
}

/** Guards that apply in every mode, trusted or not. Returns a reason or ''. */
function guard(svgString) {
  if (typeof svgString !== 'string' || !svgString.trim()) return REASONS.empty;
  if (svgString.length > SVG_MAX_BYTES || byteLength(svgString) > SVG_MAX_BYTES) return REASONS.tooLarge;
  if (DOCTYPE_OR_ENTITY.test(svgString)) return REASONS.doctype;
  return '';
}

/** Every url(...) in a CSS-ish value must be a same-document url(#id). */
function cssRefsOk(value) {
  const v = String(value);
  if (v.includes('\\')) return false; // CSS escapes can spell url( / @import
  if (/@import/i.test(v) || CSS_FETCHING_FN.test(v)) return false;
  const re = /url\s*\(\s*(['"]?)\s*([^'")\s]*)/gi;
  let m;
  while ((m = re.exec(v))) {
    if (!m[2].startsWith('#')) return false;
  }
  return true;
}

function cleanStyleText(css) {
  let out = String(css);
  if (out.includes('\\') || out.includes('<')) return ''; // CSS needs neither
  out = out.replace(/@import[^;]*;?/gi, '');
  out = out.replace(/url\s*\(\s*(['"]?)([^'")]*)\1\s*\)/gi, (m, q, u) => (u.trim().startsWith('#') ? m : 'none'));
  return cssRefsOk(out) ? out : '';
}

/** animate/set/animateTransform must name a harmless target attribute. */
function smilTargetIsUnsafe(el, tag) {
  let target = null;
  for (const a of Array.from(el.attributes || [])) {
    if (a.name.toLowerCase() === 'attributename') target = String(a.value).trim().toLowerCase();
  }
  if (target === null) return tag !== 'animatemotion'; // nothing to animate: drop it
  const local = target.split(':').pop();
  return target.includes('href') || local.startsWith('on') || local === 'style' || !local;
}

/** Attribute rule shared by the DOMPurify hook and the final check. */
export function attrAllowed(name, value, tag = '') {
  const n = String(name).toLowerCase();
  const v = String(value == null ? '' : value);
  if (n.startsWith('on')) return false;
  if (n === 'href' || n.endsWith(':href')) {
    const t = v.trim();
    if (HREF_SAME_DOC.test(t) || HREF_DATA_IMAGE.test(t)) return true;
    return String(tag).toLowerCase() === 'a' && externalLinkAllowed(v);
  }
  if (/url\s*\(|@import|\\/i.test(v) || CSS_FETCHING_FN.test(v)) return cssRefsOk(v);
  return true;
}

let purifier = null;
let dropAfter = new WeakSet();
function getPurifier() {
  if (purifier) return purifier;
  const DP = globalThis.DOMPurify;
  if (typeof DP !== 'function' || typeof window === 'undefined') return null;
  const inst = DP(window); // private instance: hooks never leak to other users
  if (!inst.isSupported) return null;
  // Judge SMIL targets before DOMPurify edits attributes, drop them after.
  inst.addHook('uponSanitizeElement', (node, data) => {
    const tag = String(data.tagName || '').toLowerCase();
    if (node.nodeType === 1 && SMIL_ANIMATION.has(tag) && smilTargetIsUnsafe(node, tag)) dropAfter.add(node);
  });
  inst.addHook('uponSanitizeAttribute', (node, data) => {
    if (!attrAllowed(data.attrName, data.attrValue, node && node.localName)) data.keepAttr = false;
  });
  purifier = inst;
  return inst;
}

const PURIFY_CONFIG = {
  USE_PROFILES: { svg: true, svgFilters: true },
  ADD_TAGS: SMIL_TAGS,
  ADD_ATTR: SMIL_ATTRS,
  FORBID_TAGS,
  ALLOWED_URI_REGEXP: PURIFY_URI,
  RETURN_DOM: true,
};

/** Strict XML parse; returns the re-serialized <svg> or '' if unusable. */
function parseAsSvgXml(svgString) {
  let doc;
  try {
    doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  } catch { return ''; }
  if (!doc || doc.getElementsByTagName('parsererror').length
    || doc.getElementsByTagNameNS('*', 'parsererror').length) return '';
  const root = doc.documentElement;
  if (!root || String(root.localName).toLowerCase() !== 'svg') return '';
  if (doc.doctype) return '';
  const walker = doc.createTreeWalker(doc, 0xFFFFFFFF);
  const drop = [];
  const cdata = [];
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    if (n.nodeType === 7 || n.nodeType === 8) drop.push(n); // PI, comment
    else if (n.nodeType === 4) cdata.push(n);
  }
  drop.forEach((n) => n.parentNode && n.parentNode.removeChild(n));
  cdata.forEach((n) => n.parentNode && n.parentNode.replaceChild(doc.createTextNode(n.data), n));
  return new XMLSerializer().serializeToString(root);
}

/** Final pass on DOMPurify's output DOM: SMIL targets, <style>, re-check attrs. */
function postFilter(body) {
  for (const el of Array.from(body.querySelectorAll('*'))) {
    const tag = String(el.localName).toLowerCase();
    if (dropAfter.has(el) || (SMIL_ANIMATION.has(tag) && smilTargetIsUnsafe(el, tag))) { el.remove(); continue; }
    if (tag === 'style') {
      const css = cleanStyleText(el.textContent || '');
      if (!css.trim()) { el.remove(); continue; }
      if (css !== el.textContent) el.textContent = css;
    }
    for (const a of Array.from(el.attributes)) {
      if (!attrAllowed(a.name, a.value, tag)) el.removeAttribute(a.name);
    }
    if (tag === 'a') {
      const href = el.getAttribute('href') || el.getAttribute('xlink:href') || '';
      if (externalLinkAllowed(href)) {
        el.setAttribute('target', '_blank');
        el.setAttribute('rel', 'noopener noreferrer nofollow');
      } else {
        el.removeAttribute('target');
      }
    }
  }
}

const FRAME_CSP = "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:";

function escapeAttr(s) {
  return String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** The document a trusted SVG runs in (inside the sandboxed frame). */
export function trustedFrameDocument(svgString) {
  return '<!DOCTYPE html><html><head><meta charset="utf-8">' +
    `<meta http-equiv="Content-Security-Policy" content="${FRAME_CSP}">` +
    '<style>html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:transparent}' +
    'body>svg{display:block;width:100%;height:100%}</style></head><body>' + svgString + '</body></html>';
}

/**
 * Markup for a sandboxed frame that shows a trusted SVG unfiltered. Opaque
 * origin (no allow-same-origin): its scripts run, but cut off from this site.
 */
export function trustedFrameHtml(svgString, { title = 'Unfiltered SVG (scripts isolated)', interactive = false } = {}) {
  return `<iframe class="svg-trusted-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" loading="lazy" title="${escapeAttr(title)}"` +
    ` style="border:0;display:block;width:100%;height:100%;background:transparent;color-scheme:normal;${interactive ? '' : 'pointer-events:none;'}"` +
    ` srcdoc="${escapeAttr(trustedFrameDocument(svgString))}"></iframe>`;
}

/**
 * Detailed result: { svg, ok, mode: 'filtered' | 'trusted' | 'refused', reason }.
 * `svg` is always safe to place with innerHTML: filtered markup, the refusal
 * card, or (trusted) a sandboxed iframe that holds the unfiltered SVG.
 * `raw` (trusted only) is the unfiltered SVG for inspection; never render it.
 */
export function sanitizeSvgResult(svgString, { trusted = false } = {}) {
  const refused = guard(svgString);
  if (refused) return { svg: svgPlaceholder(refused), ok: false, mode: 'refused', reason: refused };
  if (trusted) return { svg: trustedFrameHtml(svgString), ok: true, mode: 'trusted', reason: '', raw: svgString };

  const dp = getPurifier();
  if (!dp) return { svg: svgPlaceholder(REASONS.noFilter), ok: false, mode: 'refused', reason: REASONS.noFilter };

  const xml = parseAsSvgXml(svgString);
  if (!xml) return { svg: svgPlaceholder(REASONS.invalid), ok: false, mode: 'refused', reason: REASONS.invalid };

  let body;
  dropAfter = new WeakSet();
  try { body = dp.sanitize(xml, PURIFY_CONFIG); } catch { body = null; }
  if (!body) return { svg: svgPlaceholder(REASONS.nothingLeft), ok: false, mode: 'refused', reason: REASONS.nothingLeft };
  postFilter(body);
  const svgEl = Array.from(body.children).find((c) => String(c.localName).toLowerCase() === 'svg');
  if (!svgEl) return { svg: svgPlaceholder(REASONS.nothingLeft), ok: false, mode: 'refused', reason: REASONS.nothingLeft };
  return { svg: svgEl.outerHTML, ok: true, mode: 'filtered', reason: '' };
}

/** sanitizeSvg(svgString, { trusted }) -> markup string for innerHTML. */
export function sanitizeSvg(svgString, opts = {}) {
  return sanitizeSvgResult(svgString, opts).svg;
}

// ── Per-collection "unfiltered on this device" switch ────────────────

function cleanAddr(addr) {
  const a = String(addr || '').trim();
  return /^[A-Za-z0-9._:-]{1,128}$/.test(a) ? a : '';
}

export function trustKey(addr) {
  const a = cleanAddr(addr);
  return a ? TRUST_KEY_PREFIX + a : '';
}

export function isSvgTrusted(addr) {
  const k = trustKey(addr);
  if (!k) return false;
  try { return globalThis.localStorage?.getItem(k) === '1'; } catch { return false; }
}

export function setSvgTrusted(addr, on) {
  const k = trustKey(addr);
  if (!k) return false;
  try {
    if (on) globalThis.localStorage.setItem(k, '1');
    else globalThis.localStorage.removeItem(k);
  } catch { return false; }
  return isSvgTrusted(addr) === !!on;
}

/**
 * Trust switch shown next to a collection preview. Built with DOM APIs
 * (no innerHTML). onChange(trusted) runs after the choice is saved.
 * Options: label (checkbox text), key (trust key id; defaults to addr).
 */
export function createTrustToggle(addr, { onChange, doc = globalThis.document, label: labelText = 'Trust this collection on this device' } = {}) {
  const wrap = doc.createElement('div');
  wrap.className = 'svg-trust';
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:0.3rem;font-size:0.75rem;line-height:1.4;margin-top:0.5rem;';
  const label = doc.createElement('label');
  label.style.cssText = 'display:inline-flex;align-items:center;gap:0.45rem;cursor:pointer;';
  const box = doc.createElement('input');
  box.type = 'checkbox';
  box.className = 'svg-trust-input';
  box.disabled = !trustKey(addr);
  const text = doc.createElement('span');
  text.textContent = labelText;
  label.append(box, text);
  const note = doc.createElement('span');
  note.className = 'svg-trust-note';
  note.setAttribute('role', 'status');
  const revoke = doc.createElement('button');
  revoke.type = 'button';
  revoke.className = 'svg-trust-revoke';
  revoke.textContent = 'Revoke trust';
  revoke.style.cssText = 'align-self:flex-start;font:inherit;font-size:0.75rem;padding:0.15rem 0.55rem;border-radius:2px;border:1px solid currentColor;background:transparent;color:inherit;cursor:pointer;';
  const paint = () => {
    const on = isSvgTrusted(addr);
    box.checked = on;
    revoke.hidden = !on;
    note.style.cssText = on ? 'color:var(--tn-amber, #ffb86c);' : 'opacity:0.7;';
    note.textContent = on
      ? 'Trusted: the creator\'s scripts run here, unfiltered, in an isolated frame with no access to your wallet, storage or this site.'
      : 'Filtered: scripts and event handlers are removed. Trust only creators you know.';
  };
  const set = (on) => { setSvgTrusted(addr, on); paint(); if (typeof onChange === 'function') onChange(isSvgTrusted(addr)); };
  box.addEventListener('change', () => set(box.checked));
  revoke.addEventListener('click', () => set(false));
  paint();
  wrap.append(label, note, revoke);
  return wrap;
}
