// select.js — one accessible custom select for the whole site (fin1).
//
// Progressive enhancement of every single-choice <select>: the native element stays in the DOM as the
// source of truth (value, `change`, forms, validation), visually hidden; a select-only combobox
// (WAI-ARIA APG pattern: role=combobox + role=listbox/option, aria-activedescendant) is drawn in the
// site's own control style next to it. Works with mouse, touch (44 px rows on coarse pointers) and
// keyboard. Selects added later (modals, re-rendered forms) are picked up by a document observer.
//
// Opt out per element with data-native (or a [data-native-selects] ancestor). multiple / size > 1 stay native.
// Styles: public/global.css (.tn-select*).

const SKIP = (s) => s.multiple || s.size > 1 || s.hasAttribute('data-native') || !!s.closest('[data-native-selects]');
const proto = HTMLSelectElement.prototype;
const D_VALUE = Object.getOwnPropertyDescriptor(proto, 'value');
const D_INDEX = Object.getOwnPropertyDescriptor(proto, 'selectedIndex');
let uid = 0;
let openOne = null;
// Esc with a list open inside a modal <dialog> closes the list, not the dialog. Chromium hands that Esc straight
// to the dialog as a `cancel` (the keydown never reaches the page), so the cancel is refused here and the list
// closes instead; the keydown path (outside dialogs) is handled in onKey.
let escAt = -1e9;
document.addEventListener('cancel', (e) => {
  const t = e.target;
  if (openOne && t && t.contains && t.contains(openOne.wrap)) { e.preventDefault(); const o = openOne; o.close(); o.box.focus(); return; }
  if (performance.now() - escAt < 250) { e.preventDefault(); escAt = -1e9; }
}, true);

function nameOf(sel) {
  const al = sel.getAttribute('aria-label');
  if (al) return al.trim();
  const lb = sel.getAttribute('aria-labelledby');
  if (lb) return lb.split(/\s+/).map((id) => document.getElementById(id)?.textContent || '').join(' ').replace(/\s+/g, ' ').trim();
  const parts = [];
  for (const l of sel.labels || []) {
    const c = l.cloneNode(true);
    c.querySelectorAll('.tn-select, select, .tn-select__msg').forEach((x) => x.remove());
    parts.push(c.textContent);
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim() || sel.getAttribute('title') || sel.name || '';
}

class TnSelect {
  constructor(sel) {
    this.sel = sel;
    this.id = 'tns' + (++uid);
    const cs = getComputedStyle(sel);
    const wrap = this.wrap = document.createElement('span');
    wrap.className = 'tn-select';
    const blocky = cs.display === 'block' || /100%/.test(sel.style.width || '');
    if (blocky) wrap.classList.add('is-block');
    if (sel.style.width && !/100%/.test(sel.style.width)) wrap.style.width = sel.style.width;
    if (sel.style.margin) wrap.style.margin = sel.style.margin;
    if (sel.style.flex) wrap.style.flex = sel.style.flex;
    const box = this.box = document.createElement('div');
    box.className = 'tn-select__box';
    box.setAttribute('role', 'combobox');
    box.setAttribute('aria-haspopup', 'listbox');
    box.setAttribute('aria-expanded', 'false');
    box.setAttribute('aria-controls', this.id + '-list');
    box.id = this.id + '-box';
    const val = this.val = document.createElement('span');
    val.className = 'tn-select__val';
    box.append(val);
    const name = this.name = document.createElement('span');
    name.id = this.id + '-name'; name.hidden = true;
    box.setAttribute('aria-labelledby', name.id + ' ' + box.id);
    const list = this.list = document.createElement('ul');
    list.className = 'tn-select__list';
    list.id = this.id + '-list';
    list.setAttribute('role', 'listbox');
    list.tabIndex = -1;
    list.hidden = true;
    const msg = this.msg = document.createElement('span');
    msg.className = 'tn-select__msg'; msg.hidden = true; msg.id = this.id + '-msg';
    sel.before(wrap);
    wrap.append(box, sel, name, list, msg);
    sel.classList.add('tn-select__native');
    sel.tabIndex = -1;
    sel.setAttribute('aria-hidden', 'true');
    this.active = -1; this.buf = ''; this.bufT = 0;
    this.opts = [];
    this.bind();
    this.patch();
    this.refresh();
    sel.__tnSelect = this;
  }

  patch() {
    const self = this, sel = this.sel;
    Object.defineProperty(sel, 'value', { configurable: true, get() { return D_VALUE.get.call(this); }, set(v) { D_VALUE.set.call(this, v); self.refresh(); } });
    Object.defineProperty(sel, 'selectedIndex', { configurable: true, get() { return D_INDEX.get.call(this); }, set(v) { D_INDEX.set.call(this, v); self.refresh(); } });
    this.mo = new MutationObserver(() => this.refresh());
    this.mo.observe(sel, { childList: true, subtree: true, attributes: true, characterData: true });
  }

  /** Rebuild the options from the native select and mirror its state. */
  refresh() {
    const sel = this.sel;
    this.name.textContent = nameOf(sel);
    const hide = sel.hidden || sel.style.display === 'none';
    this.wrap.hidden = hide;
    const dis = sel.disabled || !!sel.closest('fieldset[disabled]');
    this.box.setAttribute('aria-disabled', String(dis));
    this.box.tabIndex = dis ? -1 : 0;
    if (sel.required) this.box.setAttribute('aria-required', 'true'); else this.box.removeAttribute('aria-required');
    const cur = sel.selectedIndex;
    const o = sel.selectedOptions && sel.selectedOptions[0];
    this.val.textContent = o ? (o.label || o.text) : '';
    this.wrap.classList.toggle('is-empty', !o || o.value === '');
    // page code that marks the native select invalid (aria-invalid / aria-describedby) is mirrored on the combobox
    const inv = sel.getAttribute('aria-invalid') === 'true';
    if (inv) this.box.setAttribute('aria-invalid', 'true');
    else if (this.msg.hidden) this.box.removeAttribute('aria-invalid');
    const db = sel.getAttribute('aria-describedby');
    if (db && this.msg.hidden) this.box.setAttribute('aria-describedby', db);
    this.wrap.classList.toggle('is-invalid', inv || !this.msg.hidden);
    if (!inv && sel.validity && sel.validity.valid && !this.msg.hidden) this.clearInvalid();
    if (!this.list.hidden) this.build(cur);
  }

  build(cur = this.sel.selectedIndex) {
    const L = this.list, sel = this.sel;
    L.replaceChildren();
    this.opts = [];
    let i = 0;
    const add = (opt, inGroup) => {
      const li = document.createElement('li');
      li.id = `${this.id}-o${i}`;
      li.setAttribute('role', 'option');
      li.className = 'tn-select__opt' + (inGroup ? ' in-group' : '');
      li.textContent = opt.label || opt.text;
      li.dataset.i = String(opt.index);
      const on = opt.index === cur;
      li.setAttribute('aria-selected', String(on));
      const dis = opt.disabled || (opt.parentElement && opt.parentElement.tagName === 'OPTGROUP' && opt.parentElement.disabled);
      if (dis) li.setAttribute('aria-disabled', 'true');
      if (opt.title) li.title = opt.title;
      this.opts.push({ li, idx: opt.index, dis, text: (opt.label || opt.text).trim().toLowerCase() });
      L.append(li); i++;
    };
    for (const c of sel.children) {
      if (c.tagName === 'OPTGROUP') {
        const g = document.createElement('li');
        g.setAttribute('role', 'presentation');
        g.className = 'tn-select__group';
        g.textContent = c.label;
        L.append(g);
        for (const o of c.children) if (o.tagName === 'OPTION' && !o.hidden) add(o, true);
      } else if (c.tagName === 'OPTION' && !c.hidden) add(c, false);
    }
  }

  bind() {
    const b = this.box, sel = this.sel, L = this.list;
    b.addEventListener('click', (e) => { e.preventDefault(); if (b.getAttribute('aria-disabled') === 'true') return; this.isOpen() ? this.close() : this.open(); });
    b.addEventListener('keydown', (e) => this.onKey(e));
    b.addEventListener('blur', () => { setTimeout(() => { if (this.isOpen() && !this.wrap.contains(document.activeElement)) this.close(); }, 0); });
    L.addEventListener('pointerdown', (e) => e.preventDefault());   // keep focus on the combobox
    L.addEventListener('click', (e) => {
      const li = e.target.closest('.tn-select__opt');
      if (!li || li.getAttribute('aria-disabled') === 'true') return;
      this.choose(Number(li.dataset.i)); this.close(); b.focus();
    });
    L.addEventListener('pointermove', (e) => {
      const li = e.target.closest('.tn-select__opt');
      if (li && li.getAttribute('aria-disabled') !== 'true') this.setActive(this.opts.findIndex((o) => o.li === li), false);
    });
    sel.addEventListener('focus', () => { if (b.tabIndex >= 0) b.focus(); });
    sel.addEventListener('change', () => this.refresh());
    sel.addEventListener('invalid', (e) => {
      e.preventDefault();
      this.box.setAttribute('aria-invalid', 'true');
      this.box.setAttribute('aria-describedby', this.msg.id);
      this.msg.textContent = sel.validationMessage || 'Choose one.';
      this.msg.hidden = false;
      this.wrap.classList.add('is-invalid');
      const f = sel.form;
      if (!f || !f.__tnFocused) { b.focus(); if (f) { f.__tnFocused = true; setTimeout(() => { f.__tnFocused = false; }, 0); } }
    });
    if (sel.form) sel.form.addEventListener('reset', () => setTimeout(() => this.refresh(), 0));
  }

  clearInvalid() {
    this.box.removeAttribute('aria-invalid'); this.box.removeAttribute('aria-describedby');
    this.msg.hidden = true; this.wrap.classList.remove('is-invalid');
  }

  isOpen() { return !this.list.hidden; }

  open() {
    if (this.isOpen()) return;
    if (openOne && openOne !== this) openOne.close();
    openOne = this;
    this.build();
    this.list.hidden = false;
    this.wrap.classList.add('is-open');
    this.box.setAttribute('aria-expanded', 'true');
    const cur = this.opts.findIndex((o) => o.idx === this.sel.selectedIndex);
    this.setActive(cur >= 0 ? cur : this.next(-1, 1));
    this.place();
    this._re = () => this.place();
    this._out = (e) => { if (!this.wrap.contains(e.target)) this.close(); };
    addEventListener('scroll', this._re, true);
    addEventListener('resize', this._re);
    document.addEventListener('pointerdown', this._out, true);
  }

  close() {
    if (!this.isOpen()) return;
    this.list.hidden = true;
    this.wrap.classList.remove('is-open', 'is-up');
    this.box.setAttribute('aria-expanded', 'false');
    this.box.removeAttribute('aria-activedescendant');
    removeEventListener('scroll', this._re, true);
    removeEventListener('resize', this._re);
    document.removeEventListener('pointerdown', this._out, true);
    if (openOne === this) openOne = null;
  }

  /** Fixed position under (or above) the box, clamped to the viewport; corrected if an ancestor moves the containing block. */
  place() {
    const L = this.list, r = this.box.getBoundingClientRect();
    if (!r.width && !r.height) return this.close();
    const vw = document.documentElement.clientWidth, vh = innerHeight, gap = 4, pad = 8;
    const w = Math.min(Math.max(r.width, 200), vw - 2 * pad);
    L.style.width = w + 'px';
    L.style.maxHeight = '';
    const natural = Math.min(L.scrollHeight, 320);
    const below = vh - r.bottom - gap - pad, above = r.top - gap - pad;
    const up = natural > below && above > below;
    const h = Math.max(120, Math.min(natural, up ? above : below));
    L.style.maxHeight = h + 'px';
    const left = Math.min(Math.max(pad, r.left), vw - pad - w);
    const top = up ? r.top - gap - Math.min(natural, h) : r.bottom + gap;
    L.style.left = left + 'px'; L.style.top = top + 'px';
    this.wrap.classList.toggle('is-up', up);
    const got = L.getBoundingClientRect();
    const dx = got.left - left, dy = got.top - top;
    if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) { L.style.left = (left - dx) + 'px'; L.style.top = (top - dy) + 'px'; }
  }

  next(from, dir) {
    const n = this.opts.length;
    for (let i = from + dir; i >= 0 && i < n; i += dir) if (!this.opts[i].dis) return i;
    return from;
  }

  setActive(i, scroll = true) {
    if (i < 0 || i >= this.opts.length) return;
    if (this.opts[this.active]) this.opts[this.active].li.classList.remove('is-active');
    this.active = i;
    const o = this.opts[i];
    o.li.classList.add('is-active');
    this.box.setAttribute('aria-activedescendant', o.li.id);
    if (scroll) o.li.scrollIntoView({ block: 'nearest' });
  }

  choose(idx) {
    const sel = this.sel;
    if (sel.selectedIndex !== idx) {
      D_INDEX.set.call(sel, idx);
      this.refresh();
      sel.dispatchEvent(new Event('input', { bubbles: true }));
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    }
    if (sel.validity.valid) this.clearInvalid();
  }

  typeahead(ch) {
    const now = Date.now();
    this.buf = now - this.bufT > 700 ? ch : this.buf + ch;
    this.bufT = now;
    const n = this.opts.length;
    if (!n) return -1;
    const same = this.buf.split('').every((c) => c === this.buf[0]);
    const q = same ? this.buf[0] : this.buf;
    const start = same || this.buf.length === 1 ? this.active + 1 : this.active;
    for (let k = 0; k < n; k++) {
      const i = (Math.max(0, start) + k) % n;
      if (!this.opts[i].dis && this.opts[i].text.startsWith(q)) return i;
    }
    return -1;
  }

  onKey(e) {
    if (this.box.getAttribute('aria-disabled') === 'true') return;
    const k = e.key, open = this.isOpen();
    const print = k.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey;
    if (!open) {
      if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'Enter' || k === ' ' || k === 'Home' || k === 'End') {
        e.preventDefault(); this.open();
        if (k === 'Home') this.setActive(this.next(-1, 1));
        if (k === 'End') this.setActive(this.next(this.opts.length, -1));
        return;
      }
      if (print) { e.preventDefault(); this.open(); const i = this.typeahead(k.toLowerCase()); if (i >= 0) this.setActive(i); }
      return;
    }
    switch (k) {
      case 'ArrowDown': e.preventDefault(); this.setActive(this.next(this.active, 1)); return;
      case 'ArrowUp':
        e.preventDefault();
        if (e.altKey) { this.chooseActive(); this.close(); return; }
        this.setActive(this.next(this.active, -1)); return;
      case 'Home': e.preventDefault(); this.setActive(this.next(-1, 1)); return;
      case 'End': e.preventDefault(); this.setActive(this.next(this.opts.length, -1)); return;
      case 'PageDown': e.preventDefault(); { let i = this.active; for (let s = 0; s < 10; s++) i = this.next(i, 1); this.setActive(i); } return;
      case 'PageUp': e.preventDefault(); { let i = this.active; for (let s = 0; s < 10; s++) i = this.next(i, -1); this.setActive(i); } return;
      case 'Enter': e.preventDefault(); this.chooseActive(); this.close(); return;
      case ' ':
        e.preventDefault();
        if (Date.now() - this.bufT < 700 && this.buf) { const i = this.typeahead(' '); if (i >= 0) this.setActive(i); return; }
        this.chooseActive(); this.close(); return;
      case 'Escape': e.preventDefault(); e.stopPropagation(); escAt = performance.now(); this.close(); return;
      case 'Tab': this.chooseActive(); this.close(); return;
      default:
        if (print) { e.preventDefault(); const i = this.typeahead(k.toLowerCase()); if (i >= 0) this.setActive(i); }
    }
  }

  chooseActive() { const o = this.opts[this.active]; if (o && !o.dis) this.choose(o.idx); }
}

/** Enhance one <select>; returns its controller (or null when it stays native). */
export function enhance(sel) {
  if (!(sel instanceof HTMLSelectElement)) return null;
  if (sel.__tnSelect) return sel.__tnSelect;
  if (SKIP(sel)) return null;
  return new TnSelect(sel);
}

/** Enhance every select under `root`. */
export function enhanceAll(root = document) {
  const list = root.tagName === 'SELECT' ? [root] : root.getElementsByTagName ? [...root.getElementsByTagName('select')] : [];
  for (const s of list) enhance(s);
}

if (typeof window !== 'undefined' && !window.__tnSelect) {
  window.__tnSelect = { enhance, enhanceAll, version: 'fin1' };
  const start = () => {
    enhanceAll(document);
    new MutationObserver((recs) => {
      for (const r of recs) for (const n of r.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.tagName === 'SELECT') enhance(n);
        else if (n.firstElementChild) { const l = n.getElementsByTagName('select'); if (l.length) for (const s of [...l]) enhance(s); }
      }
    }).observe(document.documentElement, { childList: true, subtree: true });
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true }); else start();
}
