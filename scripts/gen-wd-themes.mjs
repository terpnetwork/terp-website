#!/usr/bin/env node
// Builds the WD sun-palette theme overrides in public/global.css from the
// colour study (Mark Hollands, University of Warwick), checking contrast.
//   node scripts/gen-wd-themes.mjs [--study ../color-study] [--write]
// Without --write it prints the CSS and the contrast table. With --write it
// replaces the block between the WD-THEMES markers in public/global.css.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const site = path.resolve(here, '..');
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : d; };
const study = path.resolve(site, arg('--study', '../color-study'));
const C = await import(pathToFileURL(path.join(study, 'tools/color.mjs')).href);

// Theme id → mode. The first three replace default / light / sandman.
export const WD = [
  ['pale-lithium-green', 'dark'], ['coral-ember', 'light'], ['apricot-glow', 'light'],
  ['azure-calcium', 'dark'], ['sirius-blue', 'dark'], ['carbon-pink', 'dark'],
  ['lime-chiffon', 'light'], ['pearl-white', 'light'],
];
const KEYS = ['bg', 'surface', 'surfaceAlt', 'text', 'textMuted', 'border', 'borderStrong', 'accent', 'onAccent', 'focus'];
const get = (css, k) => { const m = css.match(new RegExp(k + ':\\s*(#[0-9A-Fa-f]{6})')); return m && m[1].toLowerCase(); };
function family(f) {
  const css = fs.readFileSync(path.join(study, 'css', f + '.css'), 'utf8');
  const [lightPart, darkPart] = css.split('semantic — dark');
  const lp = lightPart.split('semantic — light')[1] || lightPart;
  const o = { base: get(css, `--wd-${f}-base`), light: {}, dark: {}, scale: {} };
  for (const k of KEYS) { o.light[k] = get(lp, `--wd-${f}-${k}`); o.dark[k] = get(darkPart, `--wd-${f}-${k}`); }
  for (const s of [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950]) o.scale[s] = get(css, `--wd-${f}-${s}`);
  o.harm = {};
  for (const k of ['complement', 'analogous-minus30', 'analogous-plus30', 'triadic-minus120', 'triadic-plus120', 'split-minus150', 'split-plus150']) o.harm[k] = get(css, `--wd-${f}-${k}`);
  return o;
}
const rgb = (h) => C.hexToRgb(h);
const hex = (r) => C.rgbToHex(r).toLowerCase();
const trip = (h) => rgb(h).join(' ');
const shiftL = (h, dL) => { const o = C.rgbToOklch(rgb(h)); return C.gamutMapOklch({ L: C.clamp(o.L + dL, 0, 1), C: o.C, H: o.H }).toLowerCase(); };
const mix = (a, b, t) => { const A = rgb(a), B = rgb(b); return hex(A.map((v, i) => Math.round(v + (B[i] - v) * t))); };
// Nudge fg lightness away from bg until WCAG ≥ w and |APCA Lc| ≥ lc.
function ensure(fg, bg, w, lc) {
  const dark = C.rgbToOklch(rgb(bg)).L < 0.5;
  let h = fg;
  for (let i = 0; i < 40; i++) {
    if (C.wcagContrast(rgb(h), rgb(bg)) >= w && Math.abs(C.apcaLc(rgb(h), rgb(bg))) >= lc) return h;
    h = shiftL(h, dark ? 0.01 : -0.01);
  }
  return h;
}

// A colour at hue H (degrees) with lightness L and chroma C, gamut-mapped.
const atHue = (H, L, Cc) => C.gamutMapOklch({ L, C: Cc, H }).toLowerCase();
const hueOfHex = (h) => C.rgbToOklch(rgb(h)).H;
const lchOf = (h) => C.rgbToOklch(rgb(h));
const report = [];
function check(theme, name, fg, bg, w, lc) {
  const W = C.wcagContrast(rgb(fg), rgb(bg)), L = Math.abs(C.apcaLc(rgb(fg), rgb(bg)));
  report.push({ theme, pair: name, fg, bg, wcag: +W.toFixed(2), apca: +L.toFixed(1), ok: W >= w && L >= lc, need: `${w}:1 / Lc ${lc}` });
}

function block(id, mode) {
  const F = family(id), s = F[mode], S = F.scale, dark = mode === 'dark';
  const bg = s.bg, panel = s.surface, alt = s.surfaceAlt;
  const deep = dark ? shiftL(bg, -0.025) : alt;
  const text = ensure(s.text, bg, 7, 75);
  const bright = dark ? ensure(mix(s.text, '#ffffff', 0.55), bg, 12, 90) : ensure(S[950], bg, 12, 90);
  const muted = ensure(s.textMuted, panel, 4.5, 60);
  const dim = ensure(s.textMuted, panel, 4.5, 60);
  const accent = ensure(ensure(s.accent, panel, 4.5, 60), bg, 4.5, 60); // links and accent text, on both surfaces
  const onAccent = ensure(s.onAccent, accent, 4.5, 60);
  const hover = dark ? shiftL(accent, 0.06) : shiftL(accent, -0.06);
  const mint = dark ? ensure(S[100] || shiftL(accent, 0.1), bg, 7, 75) : ensure(S[800], bg, 7, 75);
  const kicker = dark ? ensure(S[300], bg, 4.5, 60) : ensure(S[900], bg, 7, 75);
  const focus = ensure(s.focus, bg, 3, 45);
  const rot = dark ? [accent, S[300], S[200]] : [accent, S[800], S[600]];
  const halo = dark ? accent : S[100];
  // ── WD2 semantic tokens: links, headings, close, code syntax, status, orbs ──
  const H = F.harm, aL = lchOf(accent);
  const voice = (hx, w = 4.5, lc = 60, on = bg) => ensure(atHue(hueOfHex(hx), aL.L, Math.max(0.09, Math.min(0.16, lchOf(hx).C))), on, w, lc);
  const link = accent, linkHover = ensure(hover, bg, 4.5, 60);
  const heading = bright, subheading = ensure(dark ? S[200] : S[800], bg, 7, 75);
  const purple = voice(H['analogous-plus30']), amber = voice(H.complement);
  const statusL = dark ? 0.8 : 0.48;
  const danger = ensure(atHue(25, statusL, 0.15), bg, 4.5, 60), success = ensure(atHue(155, statusL, 0.13), bg, 4.5, 60), warn = ensure(atHue(85, statusL + (dark ? 0.04 : 0), 0.13), bg, 4.5, 60);
  const codeBg = dark ? deep : alt;
  const code = {
    text: ensure(bright, codeBg, 7, 75),
    cmd: voice(H['analogous-plus30'], 4.5, 60, codeBg),
    val: ensure(dark ? S[200] : S[800], codeBg, 4.5, 60),
    str: voice(H['analogous-minus30'], 4.5, 60, codeBg),
    num: voice(H.complement, 4.5, 60, codeBg),
    kw: ensure(accent, codeBg, 4.5, 60),
    muted: ensure(s.textMuted, codeBg, 4.5, 60),
  };
  const close = muted, closeHover = bright;
  // Data series (resources chain-history chart): live / upgrade / gap / stall, all text-safe on the page.
  const series = { live: voice(H['analogous-minus30']), upg: purple, gap: danger, stall: ensure(atHue(45, statusL, 0.15), bg, 4.5, 60) };
  const titleShade = dark ? deep : S[100];
  // Orbs (lib/fractal/world.js maps each section colour to one of six slots).
  // Dark fields: luminous pale ramp + harmonies; paper: mid-tones that read as tinted discs.
  const oL = dark ? lchOf(S[300]).L : Math.min(0.66, lchOf(S[500]).L), oC = Math.max(0.08, Math.min(0.15, lchOf(S[dark ? 300 : 600]).C));
  const orbs = [
    dark ? S[200] : S[500],
    dark ? S[300] : S[600],
    atHue(hueOfHex(H['analogous-minus30']), oL, oC),
    atHue(hueOfHex(H['analogous-plus30']), oL, oC),
    dark ? S[100] : S[400],
    atHue(hueOfHex(H.complement), oL, oC),
  ];
  check(id, 'link / bg', link, bg, 4.5, 60);
  check(id, 'link / panel', link, panel, 4.5, 60);
  check(id, 'link-hover / bg', linkHover, bg, 4.5, 60);
  check(id, 'heading / bg', heading, bg, 7, 90);
  check(id, 'subheading / bg', subheading, bg, 7, 75);
  check(id, 'close / panel', close, panel, 4.5, 60);
  check(id, 'close-hover / bg', closeHover, bg, 7, 75);
  check(id, 'purple voice / bg', purple, bg, 4.5, 60);
  check(id, 'amber voice / bg', amber, bg, 4.5, 60);
  check(id, 'danger / bg', danger, bg, 4.5, 60);
  check(id, 'success / bg', success, bg, 4.5, 60);
  check(id, 'warn / bg', warn, bg, 4.5, 60);
  for (const [k, v] of Object.entries(code)) check(id, `code-${k} / code-bg`, v, codeBg, k === 'text' ? 7 : 4.5, k === 'text' ? 75 : 60);
  orbs.forEach((o, i) => check(id, `orb-${i + 1} / bg (non-text)`, o, bg, dark ? 3 : 1.5, dark ? 45 : 15));
  const orbInk = orbs.map((o) => ensure(ensure(o, bg, 4.5, 60), panel, 4.5, 60)); // section colour as text (headings, rules)
  orbInk.forEach((o, i) => { check(id, `orb-${i + 1}-ink / bg`, o, bg, 4.5, 60); check(id, `orb-${i + 1}-ink / panel`, o, panel, 4.5, 60); });
  for (const [k, v] of Object.entries(series)) check(id, `series-${k} / bg`, v, bg, 4.5, 60);
  check(id, 'text / bg', text, bg, 7, 75);
  check(id, 'text-bright / bg', bright, bg, 7, 90);
  check(id, 'text-muted / panel', muted, panel, 4.5, 60);
  check(id, 'accent / panel', accent, panel, 4.5, 60);
  check(id, 'accent / bg', accent, bg, 4.5, 60);
  check(id, 'on-accent / accent', onAccent, accent, 4.5, 60);
  check(id, 'focus ring / bg (non-text)', focus, bg, 3, 45);
  const L = [];
  const p = (k, v) => L.push(`    --${k}: ${v};`);
  p('tn-bg', bg); p('tn-canvas', bg); p('tn-canvas-rgb', trip(bg));
  p('tn-bg-deep', deep); p('tn-bg-deep-rgb', trip(deep));
  p('tn-panel-solid', panel); p('tn-surface-deep', dark ? deep : panel); p('tn-on-accent', onAccent);
  if (!dark) { p('tn-tint-rgb', trip(bright)); p('tn-shadow-rgb', trip(S[900])); }
  p('tn-teal', accent); p('tn-teal-rgb', trip(accent)); p('tn-teal-hover', hover);
  p('tn-mint', mint); p('tn-mint-rgb', trip(mint));
  p('tn-text', text); p('tn-text-rgb', trip(text));
  p('tn-text-bright', bright); p('tn-text-bright-rgb', trip(bright));
  p('tn-text-dim', dim); p('tn-text-dim-rgb', trip(dim)); p('tn-text-muted', muted);
  p('tn-kicker', kicker); p('tn-kicker-rgb', trip(kicker));
  p('tn-rot-a', rot[0]); p('tn-rot-b', rot[1]); p('tn-rot-c', rot[2]);
  p('tn-halo-rgb', trip(halo));
  p('tn-code-frame', panel); p('tn-code-bg', dark ? deep : alt);
  p('tn-code-border', `rgb(${trip(s.border)} / 0.9)`);
  p('tnw-bg-2', alt); p('tnw-focus', focus); p('tnw-ink', bright); p('tnw-ink-rgb', trip(bright));
  p('tn-wd-swatch-a', bg); p('tn-wd-swatch-b', accent);
  p('tnw-link', link); p('tnw-link-hover', linkHover);
  p('tnw-heading', heading); p('tnw-subheading', subheading);
  p('tnw-close', close); p('tnw-close-hover', closeHover); p('tnw-close-ring', `rgb(${trip(s.borderStrong)} / 0.7)`);
  p('tnw-eco-hover-wash', `rgb(${trip(accent)} / ${dark ? 0.08 : 0.07})`); p('tnw-eco-hover-ring', `rgb(${trip(accent)} / 0.5)`);
  p('tn-purple', purple); p('tn-purple-rgb', trip(purple));
  p('tn-amber', amber); p('tn-amber-rgb', trip(amber)); p('tnw-amber', amber);
  p('tn-coral', danger); p('tn-coral-rgb', trip(danger)); p('tn-danger', danger); p('tn-danger-rgb', trip(danger));
  p('tn-error', danger); p('tn-error-rgb', trip(danger));
  p('tn-success', success); p('tn-success-rgb', trip(success)); p('tn-warn', warn);
  p('tnw-strong', dark ? ensure('#ffffff', bg, 12, 90) : ensure(S[950], bg, 12, 90));
  p('tnw-tint', rgb(accent).join(', '));
  p('tn-code-text', code.text); p('tn-code-cmd', code.cmd); p('tn-code-val', code.val); p('tn-code-muted', code.muted);
  p('tn-code-scroll', `rgb(${trip(s.borderStrong)} / 0.6)`);
  p('tnw-code-bg', codeBg); p('tnw-code-text', code.text); p('tnw-code-keyword', code.kw); p('tnw-code-string', code.str);
  p('tnw-code-number', code.num); p('tnw-code-fn', code.cmd); p('tnw-code-comment', code.muted); p('tnw-code-value', code.val);
  p('tnw-title-shade-rgb', trip(titleShade));
  for (const [k, v] of Object.entries(series)) { p(`tnw-series-${k}`, v); p(`tnw-series-${k}-rgb`, trip(v)); }
  p('tnw-series-gap-text', series.gap);
  orbs.forEach((o, i) => p(`tnw-orb-${i + 1}`, o));
  orbInk.forEach((o, i) => p(`tnw-orb-${i + 1}-ink`, o));
  return { id, mode, base: F.base, bg, accent, css: `html[data-theme="${id}"] {\n${L.join('\n')}\n}` };
}

const out = WD.map(([id, mode]) => block(id, mode));
const chips = out.map((b) => `.tn-theme-chip[data-chip="${b.id}"] { --chip-a: ${b.bg}; --chip-b: ${b.accent}; }`).join('\n');
const css = `/* WD-THEMES:BEGIN — generated by scripts/gen-wd-themes.mjs from the WD colour
   study (sun palette by Mark Hollands, University of Warwick). Do not hand-edit;
   change the study or the script and run it with --write. */
${out.map((b) => b.css).join('\n')}
${chips}
/* WD-THEMES:END */`;
fs.writeFileSync(path.join(site, 'public/graphs/wd-themes.contrast.json'), JSON.stringify({ generated_at: new Date().toISOString(), themes: out.map(({ id, mode, base, bg, accent }) => ({ id, mode, base, bg, accent })), checks: report }, null, 1));
if (process.argv.includes('--write')) {
  const f = path.join(site, 'public/global.css');
  let g = fs.readFileSync(f, 'utf8');
  const re = /\/\* WD-THEMES:BEGIN[\s\S]*?WD-THEMES:END \*\//;
  if (!re.test(g)) throw new Error('WD-THEMES markers not found in public/global.css');
  fs.writeFileSync(f, g.replace(re, css));
  console.log('wrote WD theme block into public/global.css');
} else console.log(css);
const bad = report.filter((r) => !r.ok);
console.table(report.map((r) => ({ theme: r.theme, pair: r.pair, wcag: r.wcag, apca: r.apca, ok: r.ok ? 'yes' : 'NO' })));
if (bad.length) { console.error(`${bad.length} contrast checks below target`); process.exitCode = 1; }
