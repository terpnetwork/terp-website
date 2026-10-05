// shell.js: persistent app shell + client-side router for terp.network.
//
// Load once, reuse everywhere: every route is still a full static HTML page
// (no-JS, SEO, deep links, and hard refresh all keep working). When this
// script is present, same-origin links between the site routes are
// intercepted. The target page is fetched, only its content is swapped in,
// and its page scripts run inside a "page scope". Timers, rAF loops and
// window/document listeners that page code registers are attributed to that
// scope and torn down on the next navigation, so nothing leaks or
// double-binds. Shared modules (config, wallet, wallet modal, glow, fab
// chrome) are evaluated once per session and keep their state, including the
// wallet connection.
//
// Must be the first script in <head> (classic, not async/defer): it wraps the
// timer and listener APIs before any page code runs.
// ── Theme (runs first, before any stylesheet paints) ─────────────────────
// html[data-theme] picks a token set in global.css; the choice persists in
// localStorage "tn-theme". This lives in the shell (an external script, first
// in <head>) so the page paints in the right colours with no inline script.
(function () {
  'use strict';
  if (window.__tnTheme) return;
  var THEMES = ['default', 'light', 'permissionless', 'sandman'];
  var LIGHT = { light: 1, sandman: 1 };
  var META = { default: '#0b0f0d', light: '#f6f7f5', permissionless: '#08090d', sandman: '#f7f4ee' };
  var KEY = 'tn-theme';
  var root = document.documentElement;
  function valid(t) { return THEMES.indexOf(t) !== -1 ? t : 'default'; }
  function read() { try { return valid(localStorage.getItem(KEY)); } catch (e) { return 'default'; } }
  function paintMeta(t) {
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', META[t]);
  }
  function apply(t) {
    t = valid(t);
    root.setAttribute('data-theme', t);
    root.style.colorScheme = LIGHT[t] ? 'light' : 'dark';
    paintMeta(t);
    return t;
  }
  var current = apply(read());
  window.__tnTheme = {
    list: THEMES.slice(),
    labels: { default: 'Default', light: 'Light', permissionless: 'Permissionless', sandman: 'Sandman' },
    get: function () { return current; },
    isLight: function () { return !!LIGHT[current]; },
    set: function (t) {
      current = apply(t);
      try { localStorage.setItem(KEY, current); } catch (e) { /* private mode: this visit only */ }
      try { window.dispatchEvent(new CustomEvent('tn:theme', { detail: { theme: current } })); } catch (e) { /* ignore */ }
      return current;
    },
  };
  // Another tab changed it.
  window.addEventListener('storage', function (e) {
    if (e.key === KEY && valid(e.newValue) !== current) window.__tnTheme.set(e.newValue);
  });
  // Page swaps copy the next page's theme-color meta; keep ours.
  window.addEventListener('tn:navigated', function () { paintMeta(current); });
})();

// ── Code blocks (structure after zakura.com: a framed slab, a bar above the
// code with the language and a Copy button, the code scrolling sideways) ──
// Every <pre> on the site, including ones pages and modals add later, is
// wrapped once in <div class="tn-code">. The bar is added by script, so a
// visitor without JavaScript sees the plain framed block, never a dead
// control; Copy only appears when the clipboard API is there. Plain-text
// code gets light token tints (command, operator, comment, value) from the
// theme's --tn-code-* colours. <pre data-tn-code="off"> opts out;
// data-lang="…" names the language; data-copy="row" leaves copying to a
// button next to the block.
(function () {
  'use strict';
  if (window.__tnCode) return;
  window.__tnCode = 1;
  var D = document;
  var SH = /^(?:\$\s+)?(?:sudo\s+)?(curl|wget|terpd|sha256sum|shasum|cd|git|tar|lz4|zstd|export|cosmovisor|systemctl|journalctl|echo|mkdir|cp|mv|rm|docker|make|go|cargo|npm|bash|sh|gh|minisign|jq|ls|cat)\b/m;
  function guess(t) {
    if (/^\s*[\[{]/.test(t)) { try { JSON.parse(t); return 'json'; } catch (e) { /* not JSON */ } }
    return SH.test(t) ? 'bash' : 'text';
  }
  function span(cls, text) { var s = D.createElement('span'); s.className = 'tn-tk-' + cls; s.textContent = text; return s; }
  function pushText(out, t) { if (t) out.push(D.createTextNode(t)); }
  // Shell: the command at the start of each line and after | && || ; is a
  // command; operators and comments are quiet; quoted strings and long hex are values.
  function tintShell(t) {
    var out = [], re = /(#[^\n]*)|('[^'\n]*'|"(?:[^"\\\n]|\\.)*")|(\|\||&&|[|;]|>>?|<|\\(?=\n))|(\b[0-9a-f]{40,}\b)|(\n)|([^\s|;&<>'"#\\]+)|(\s+)|([\s\S])/g, m, cmd = true;
    while ((m = re.exec(t))) {
      if (m[1] !== undefined && (m.index === 0 || /\s/.test(t[m.index - 1]))) out.push(span('cmt', m[1]));
      else if (m[1] !== undefined) { pushText(out, m[1][0]); re.lastIndex = m.index + 1; }
      else if (m[2] !== undefined) { out.push(span('val', m[2])); cmd = false; }
      else if (m[3] !== undefined) { out.push(span('op', m[3])); if (m[3] !== '>' && m[3] !== '>>' && m[3] !== '<' && m[3][0] !== '\\') cmd = true; }
      else if (m[4] !== undefined) { out.push(span('val', m[4])); cmd = false; }
      else if (m[5] !== undefined) { pushText(out, m[5]); if (!/\\\s*$/.test(t.slice(0, m.index))) cmd = true; }
      else if (m[6] !== undefined) {
        if (cmd && m[6] === '$') pushText(out, m[6]);
        else if (cmd && m[6] !== 'sudo' && !/=/.test(m[6])) { out.push(span('bin', m[6])); cmd = false; }
        else pushText(out, m[6]);
      } else pushText(out, m[7] !== undefined ? m[7] : m[8]);
    }
    return out;
  }
  // JSON: keys like commands, strings and literals as values, punctuation quiet.
  function tintJson(t) {
    var out = [], re = /("(?:[^"\\]|\\.)*")(\s*:)?|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null)|([{}\[\],:])|([\s\S])/g, m;
    while ((m = re.exec(t))) {
      if (m[1] !== undefined) { out.push(span(m[2] ? 'bin' : 'val', m[1])); if (m[2]) out.push(span('op', m[2])); }
      else if (m[3] !== undefined) out.push(span('val', m[3]));
      else if (m[4] !== undefined) out.push(span('op', m[4]));
      else pushText(out, m[5]);
    }
    return out;
  }
  function tint(pre, lang) {
    var host = pre.children.length === 1 && pre.firstElementChild.tagName === 'CODE' ? pre.firstElementChild : pre;
    if (host.children.length) return; // already marked up
    var t = host.textContent;
    if (!t || t.length > 20000) return;
    var nodes = lang === 'bash' ? tintShell(t) : lang === 'json' ? tintJson(t) : null;
    if (!nodes) return;
    var f = D.createDocumentFragment();
    nodes.forEach(function (n) { f.appendChild(n); });
    host.textContent = '';
    host.appendChild(f);
  }
  function langOf(pre) {
    var c = pre.querySelector('code[class*="language-"]');
    var m = c && c.className.match(/language-([\w-]+)/);
    return pre.getAttribute('data-lang') || (m && m[1]) || guess(pre.textContent || '');
  }
  function bar(box, pre) {
    var b = D.createElement('div'); b.className = 'tn-code-bar';
    var l = D.createElement('span'); l.className = 'tn-code-lang'; b.appendChild(l);
    if (pre.getAttribute('data-copy') !== 'row' && navigator.clipboard && navigator.clipboard.writeText) {
      var btn = D.createElement('button'), live = D.createElement('span'), timer = 0;
      btn.type = 'button'; btn.className = 'tn-code-copy'; btn.textContent = 'Copy'; btn.setAttribute('aria-label', 'Copy code');
      live.className = 'tn-code-live'; live.setAttribute('role', 'status');
      btn.addEventListener('click', function () {
        navigator.clipboard.writeText(pre.textContent).then(function () {
          clearTimeout(timer); btn.textContent = 'Copied'; btn.classList.add('is-copied'); live.textContent = 'Copied to the clipboard';
          timer = setTimeout(function () { btn.textContent = 'Copy'; btn.classList.remove('is-copied'); live.textContent = ''; }, 1500);
        }).catch(function () {});
      });
      b.appendChild(btn); b.appendChild(live);
    }
    box.insertBefore(b, pre);
  }
  function refresh(pre) {
    var box = pre.parentNode;
    if (!box || !box.classList || !box.classList.contains('tn-code')) return;
    var lang = langOf(pre);
    box.setAttribute('data-lang', lang);
    var l = box.querySelector('.tn-code-lang'); if (l) l.textContent = lang === 'text' ? 'Text' : lang;
    tint(pre, lang);
  }
  function enhance(pre) {
    if (pre.getAttribute('data-tn-code') === 'off' || pre.closest('svg, .tnw-stage')) return;
    var box = pre.parentNode;
    if (!box) return;
    if (!(box.classList && box.classList.contains('tn-code'))) {
      box = D.createElement('div'); box.className = 'tn-code';
      pre.parentNode.insertBefore(box, pre); box.appendChild(pre);
    }
    if (!box.querySelector('.tn-code-bar')) bar(box, pre);
    pre.setAttribute('tabindex', pre.getAttribute('tabindex') || '0'); // scrollable region reachable by keyboard
    refresh(pre);
  }
  function scan(root) {
    if (root.tagName === 'PRE') enhance(root);
    else if (root.querySelectorAll) Array.prototype.forEach.call(root.querySelectorAll('pre'), enhance);
  }
  function start() {
    scan(D.body);
    new MutationObserver(function (recs) {
      recs.forEach(function (r) {
        var t = r.target, pre = t.nodeType === 1 ? t.closest('pre') : t.parentNode && t.parentNode.closest && t.parentNode.closest('pre');
        if (pre) { if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains('tn-code')) refresh(pre); else enhance(pre); return; }
        Array.prototype.forEach.call(r.addedNodes, function (n) { if (n.nodeType === 1) scan(n); });
      });
    }).observe(D.body, { childList: true, subtree: true, characterData: true });
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', start); else start();
})();

(function () {
  'use strict';
  if (window.__tnShell) return;

  var W = window;
  var D = document;

  // ── Route table ────────────────────────────────────────────────────────
  var ROUTES = {
    '/': '/', '/index': '/', '/index.html': '/',
    '/about': '/about', '/about.html': '/about',
    '/resources': '/resources', '/resources.html': '/resources',
    '/snapshots': '/resources', '/snapshots.html': '/resources',
    '/eco': '/eco', '/tabs': '/eco', '/tabs.html': '/eco',
    '/ibc': '/ibc', '/ibc.html': '/ibc',
    '/svg': '/svg', '/svg.html': '/svg',
    '/no-rick': '/no-rick', '/no-rick.html': '/no-rick',
    '/wip': '/wip', '/wip.html': '/wip',
  };
  function routeOf(pathname) {
    var p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
    return Object.prototype.hasOwnProperty.call(ROUTES, p) ? ROUTES[p] : null;
  }

  // Scripts the shell owns (never re-run by the router).
  var SKIP_SCRIPT_RE = /\/lib\/shell\/|\/lib\/fab\.js|\/lib\/wip-gate\.js|\/lib\/glow-bg\.js/;
  // Call stacks containing these are session-level code: their timers and
  // listeners are not page-scoped.
  var PERSISTENT_STACK_RE =
    /\/lib\/(?:fab\.js|wallet\.js|wallet-modal\.js|faucet\.js|glow-bg\.js|section-shield\.js|fractal\/)|\/\/esm\.sh\/|\/\/cdn\.jsdelivr\.net\/|\/\/unpkg\.com\//;
  // Body nodes that survive navigation.
  var PERSIST_SELECTOR =
    '[data-tn-persist], #terp-chrome-toasts, #tn-wallet-modal, #faucet-modal, #tn-route-announcer';

  var ORIGIN = location.origin + '/';
  var inlineSeq = 0;
  var deadScopes = {}; // scope id -> true
  function sourceUrlComment(scope) {
    return '\n//# sourceURL=' + location.origin + location.pathname + '#tn-s' + scope.id + '-' + (++inlineSeq);
  }

  /**
   * Which page scope does this stack belong to? Uses the top-most frame that
   * is page code: soft-run inline scripts carry "#tn-s<id>-" source URLs; the
   * first document's inline scripts show its own URL.
   */
  function scopeOfStack(st) {
    if (!st) return 0;
    var lines = String(st).split('\n');
    for (var i = 0; i < lines.length; i++) {
      var ln = lines[i];
      var m = /#tn-s(\d+)-\d+/.exec(ln);
      if (m) return +m[1];
      if (initialDocKey && ln.indexOf(initialDocKey + ':') !== -1) return 1;
    }
    return 0;
  }
  var initialDocKey = location.origin + location.pathname + location.search;

  var reducedMotionMq = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : null;
  function reducedMotion() { return !!(reducedMotionMq && reducedMotionMq.matches); }

  // ── Native API capture ─────────────────────────────────────────────────
  var N = {
    setTimeout: W.setTimeout,
    clearTimeout: W.clearTimeout,
    setInterval: W.setInterval,
    clearInterval: W.clearInterval,
    raf: W.requestAnimationFrame,
    caf: W.cancelAnimationFrame,
    add: EventTarget.prototype.addEventListener,
    remove: EventTarget.prototype.removeEventListener,
    pushState: History.prototype.pushState,
    replaceState: History.prototype.replaceState,
  };

  // ── Page scopes ────────────────────────────────────────────────────────
  var scopeSeq = 0;
  var current = null;
  var untrackedDepth = 0;
  var stats = { scopes: 0, torndown: 0, listenersRemoved: 0, timersCleared: 0, rafsCancelled: 0, staleDropped: 0, staleErrorsSuppressed: 0 };

  function createScope(soft) {
    stats.scopes++;
    return {
      id: ++scopeSeq,
      soft: !!soft,
      readyFired: !soft,
      dead: false,
      timeouts: new Set(),
      intervals: new Set(),
      rafs: new Set(),
      listeners: [],
      teardowns: [],
      ready: [],
      scripts: [],
    };
  }

  function trackedScope() {
    var s = current;
    if (!s || s.dead || untrackedDepth > 0) return null;
    var prev = Error.stackTraceLimit;
    Error.stackTraceLimit = 60;
    var st = new Error().stack || '';
    Error.stackTraceLimit = prev;
    if (PERSISTENT_STACK_RE.test(st)) return null;
    // Positive attribution: only code served by this site (inline page
    // scripts, /lib modules). Browser-extension, devtools and automation
    // code running in the page is left alone.
    var lines = st.split('\n');
    for (var i = 1; i < lines.length; i++) {
      var ln = lines[i];
      if (ln.indexOf(ORIGIN) !== -1 && ln.indexOf('/lib/shell/') === -1) {
        // A late continuation of a page we already left: drop it.
        var owner = scopeOfStack(st);
        if (owner && deadScopes[owner]) return DEAD;
        return s;
      }
    }
    return null;
  }
  // Sentinel scope for registrations made by pages that were navigated away.
  var DEAD = { dead: true, timeouts: new Set(), intervals: new Set(), rafs: new Set(), listeners: [] };

  function isGlobalTarget(t) {
    return t === W || t === D || t === D.documentElement || (D.body && t === D.body);
  }

  W.setTimeout = function (fn, ms) {
    var s = typeof fn === 'function' ? trackedScope() : null;
    var args = Array.prototype.slice.call(arguments, 2);
    if (!s) return N.setTimeout.apply(W, arguments);
    if (s === DEAD) { stats.staleDropped++; return 0; }
    var id = N.setTimeout.call(W, function () {
      s.timeouts.delete(id);
      if (!s.dead) fn.apply(W, args);
    }, ms);
    s.timeouts.add(id);
    return id;
  };
  W.clearTimeout = function (id) {
    if (current) current.timeouts.delete(id);
    return N.clearTimeout.call(W, id);
  };
  W.setInterval = function (fn, ms) {
    var s = typeof fn === 'function' ? trackedScope() : null;
    var args = Array.prototype.slice.call(arguments, 2);
    if (!s) return N.setInterval.apply(W, arguments);
    if (s === DEAD) { stats.staleDropped++; return 0; }
    var id = N.setInterval.call(W, function () {
      if (s.dead) { N.clearInterval.call(W, id); return; }
      fn.apply(W, args);
    }, ms);
    s.intervals.add(id);
    return id;
  };
  W.clearInterval = function (id) {
    if (current) current.intervals.delete(id);
    return N.clearInterval.call(W, id);
  };
  if (N.raf) {
    W.requestAnimationFrame = function (fn) {
      var s = trackedScope();
      if (!s) return N.raf.call(W, fn);
      if (s === DEAD) { stats.staleDropped++; return 0; }
      var id = N.raf.call(W, function (ts) {
        s.rafs.delete(id);
        if (!s.dead) fn(ts);
      });
      s.rafs.add(id);
      return id;
    };
    W.cancelAnimationFrame = function (id) {
      if (current) current.rafs.delete(id);
      return N.caf.call(W, id);
    };
  }

  function callListener(target, l, ev) {
    try {
      if (typeof l === 'function') l.call(target, ev);
      else if (l && typeof l.handleEvent === 'function') l.handleEvent(ev);
    } catch (e) {
      console.error(e);
    }
  }

  EventTarget.prototype.addEventListener = function (type, listener, opts) {
    if (listener && isGlobalTarget(this)) {
      var s = trackedScope();
      if (s === DEAD) { stats.staleDropped++; return; }
      if (s) {
        var isReady = (this === D && type === 'DOMContentLoaded') || (this === W && type === 'load');
        if (isReady && s.soft) {
          // Soft navigation: the document is already loaded. Replay these
          // once the page's scripts have run, like the native events.
          if (s.readyFired) {
            var t = this;
            N.setTimeout.call(W, function () { if (!s.dead) callListener(t, listener, new Event(type)); }, 0);
          } else {
            s.ready.push([this, type, listener]);
          }
          return;
        }
        s.listeners.push([this, type, listener, opts]);
      }
    }
    return N.add.call(this, type, listener, opts);
  };
  EventTarget.prototype.removeEventListener = function (type, listener, opts) {
    if (current && listener && isGlobalTarget(this)) {
      var ls = current.listeners;
      for (var i = ls.length - 1; i >= 0; i--) {
        if (ls[i][0] === this && ls[i][1] === type && ls[i][2] === listener) { ls.splice(i, 1); break; }
      }
    }
    return N.remove.call(this, type, listener, opts);
  };

  // History writes by page code: ignore late ones from pages already left
  // (they would rewrite the new page's URL), and keep our marker/scroll.
  function wrapHistory(name) {
    var nat = N[name];
    History.prototype[name] = function (state, title, url) {
      var s = trackedScope();
      if (s === DEAD) { stats.staleDropped++; return; }
      var doc = renderedDoc;
      if (state === null || state === undefined) state = { tn: 1, tnDoc: doc };
      else if (Object.prototype.toString.call(state) === '[object Object]') state = Object.assign({}, state, { tn: 1, tnDoc: doc });
      return nat.call(this, state, title, url);
    };
  }
  wrapHistory('pushState');
  wrapHistory('replaceState');

  function captureFlag(opts) {
    return typeof opts === 'boolean' ? opts : !!(opts && opts.capture);
  }

  function teardown(s) {
    if (!s || s.dead) return;
    s.dead = true;
    deadScopes[s.id] = true;
    stats.torndown++;
    try { W.dispatchEvent(new CustomEvent('tn:page-unmount', { detail: { scope: s.id } })); } catch (e) { /* ignore */ }
    for (var i = s.teardowns.length - 1; i >= 0; i--) {
      try { s.teardowns[i](); } catch (e) { console.error('[tn-shell] teardown', e); }
    }
    s.timeouts.forEach(function (id) { N.clearTimeout.call(W, id); stats.timersCleared++; });
    s.intervals.forEach(function (id) { N.clearInterval.call(W, id); stats.timersCleared++; });
    s.rafs.forEach(function (id) { N.caf.call(W, id); stats.rafsCancelled++; });
    s.listeners.forEach(function (l) {
      N.remove.call(l[0], l[1], l[2], captureFlag(l[3]));
      stats.listenersRemoved++;
    });
    s.scripts.forEach(function (el) { if (el.parentNode) el.parentNode.removeChild(el); });
    s.timeouts.clear(); s.intervals.clear(); s.rafs.clear();
    s.listeners = []; s.teardowns = []; s.ready = []; s.scripts = [];
  }

  function fireReady(s) {
    if (s.readyFired) return;
    s.readyFired = true;
    var q = s.ready; s.ready = [];
    q.filter(function (r) { return r[1] === 'DOMContentLoaded'; })
      .concat(q.filter(function (r) { return r[1] === 'load'; }))
      .forEach(function (r) { if (!s.dead) callListener(r[0], r[2], new Event(r[1])); });
  }

  current = createScope(false);

  // ── Public API ─────────────────────────────────────────────────────────
  var api = {
    version: 1,
    routeOf: routeOf,
    stats: stats,
    /** Register cleanup for the current page (runs on navigation away). */
    onTeardown: function (fn) {
      if (current && !current.dead && untrackedDepth === 0 && typeof fn === 'function') current.teardowns.push(fn);
    },
    /** Run fn without page-scope attribution (session-level registrations). */
    untracked: function (fn) {
      untrackedDepth++;
      try { return fn(); } finally { untrackedDepth--; }
    },
    /** True when called from page code (not shell/fab/wallet). */
    isPageContext: function () { return !!trackedScope(); },
    currentScope: function () {
      var s = current;
      return s ? { id: s.id, timeouts: s.timeouts.size, intervals: s.intervals.size, rafs: s.rafs.size, listeners: s.listeners.length, teardowns: s.teardowns.length } : null;
    },
    navigate: function (url) { return navigate(String(url), { push: true }); },
    /**
     * Register the route transition (one per session; lib/fractal/world.js).
     * t.start({from, to, pop, url}) runs when a soft navigation begins and may
     * return a promise: the content swap waits for it (and for the page fetch,
     * which runs in parallel), and no View Transition is used. Returning
     * null/undefined keeps the default crossfade. t.swapped(ctx, animated) runs
     * right after every swap, animated or not.
     */
    setTransition: function (t) { transition = t && typeof t.start === 'function' ? t : null; },
    prefetch: function (url) { return fetchPage(new URL(url, location.href)); },
    /**
     * Gate at the top of every soft-run inline module. Imports are resolved
     * by then; if the user already navigated away, the body never runs
     * (the promise stays pending), so a late module cannot act on the wrong page.
     */
    _moduleGate: function (token, scopeId) {
      var cb = pendingModules[token];
      if (cb) { delete pendingModules[token]; N.setTimeout.call(W, cb, 0); }
      if (deadScopes[scopeId]) return new Promise(function () {});
      return undefined;
    },
  };
  W.__tnShell = api;

  // ── Shell styles (view transitions, reduced motion, announcer) ────────
  function injectShellStyles() {
    if (D.getElementById('tn-shell-styles')) return;
    var s = D.createElement('style');
    s.id = 'tn-shell-styles';
    s.textContent =
      '::view-transition-old(root),::view-transition-new(root){animation-duration:180ms;animation-timing-function:ease-out}' +
      '.site-chrome-wrap{view-transition-name:tn-chrome}' +
      '#tn-route-announcer{position:absolute!important;width:1px;height:1px;margin:-1px;padding:0;overflow:hidden;clip:rect(0 0 0 0);clip-path:inset(50%);white-space:nowrap;border:0}' +
      '[data-tn-focus-target]:focus{outline:none}' +
      '@media (prefers-reduced-motion: reduce){::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}}';
    (D.head || D.documentElement).appendChild(s);
  }
  injectShellStyles();

  function ensureAnnouncer() {
    var el = D.getElementById('tn-route-announcer');
    if (!el && D.body) {
      el = D.createElement('div');
      el.id = 'tn-route-announcer';
      el.setAttribute('aria-live', 'polite');
      el.setAttribute('aria-atomic', 'true');
      el.setAttribute('data-tn-persist', '');
      D.body.appendChild(el);
    }
    return el;
  }

  function markPageAssets(head) {
    var nodes = head.querySelectorAll('style:not([id]), link[rel~="stylesheet"]');
    for (var i = 0; i < nodes.length; i++) nodes[i].setAttribute('data-tn-page', '');
  }

  // ── Page fetching (cache + prefetch) ───────────────────────────────────
  var pageCache = new Map(); // key: pathname+search → Promise<{url, html}>
  var PAGE_TTL = 5 * 60 * 1000;

  function cacheKey(u) { return (routeOf(u.pathname) || u.pathname) + u.search; }

  function fetchPage(u) {
    var key = cacheKey(u);
    var hit = pageCache.get(key);
    if (hit && Date.now() - hit.t < PAGE_TTL) return hit.p;
    var p = fetch(u.pathname + u.search, { credentials: 'same-origin', headers: { Accept: 'text/html' } })
      .then(function (res) {
        var ct = res.headers.get('content-type') || '';
        if (!res.ok || ct.indexOf('text/html') === -1) throw new Error('not an HTML page (' + res.status + ')');
        return res.text().then(function (html) { return { url: res.url, html: html }; });
      });
    pageCache.set(key, { t: Date.now(), p: p });
    p.catch(function () { pageCache.delete(key); });
    return p;
  }

  function eligibleLink(a, ev) {
    if (!a || !a.getAttribute) return null;
    var href = a.getAttribute('href');
    if (!href || href.charAt(0) === '#') return null;
    if (a.hasAttribute('download') || a.hasAttribute('data-no-router')) return null;
    var target = a.getAttribute('target');
    if (target && target !== '_self') return null;
    if ((a.getAttribute('rel') || '').indexOf('external') !== -1) return null;
    if (ev && (ev.button !== 0 || ev.metaKey || ev.ctrlKey || ev.shiftKey || ev.altKey)) return null;
    var u;
    try { u = new URL(a.href, location.href); } catch (e) { return null; }
    if (u.origin !== location.origin) return null;
    if (!routeOf(u.pathname)) return null;
    return u;
  }

  function closestAnchor(node) {
    while (node && node !== D) {
      if (node.nodeName === 'A' || node.nodeName === 'AREA') return node;
      node = node.parentNode;
    }
    return null;
  }

  // ── Navigation ─────────────────────────────────────────────────────────
  var navToken = 0;
  var renderedKey = null; // cacheKey of the page currently rendered
  var renderedDoc = 1; // id of the page scope that rendered the current document
  var renderedRoute = routeOf(location.pathname); // route currently on screen (location may already differ on popstate)
  var transition = null; // see api.setTransition
  var pendingModules = {};
  var moduleSeq = 0;
  var enabled = !!(W.history && W.history.pushState && W.fetch && W.DOMParser && routeOf(location.pathname));

  function saveScroll() {
    try {
      var st = Object.assign({}, history.state || {}, { tn: 1, x: W.scrollX, y: W.scrollY });
      N.replaceState.call(history, st, '', location.href);
    } catch (e) { /* ignore */ }
  }

  function buildId(doc) {
    var m = doc.querySelector('meta[name="tn-build"]');
    return m ? m.getAttribute('content') : '';
  }

  function importmapText(doc) {
    var m = doc.querySelector('script[type="importmap"]');
    return m ? m.textContent.replace(/\s+/g, '') : '';
  }

  function hardNavigate(u, replace) {
    if (replace) location.replace(u.href); else location.assign(u.href);
  }

  function loadStylesheets(doc) {
    var have = {};
    var cur = D.head.querySelectorAll('link[rel~="stylesheet"]');
    for (var i = 0; i < cur.length; i++) have[cur[i].href] = true;
    var waits = [];
    var links = doc.head.querySelectorAll('link[rel~="stylesheet"]');
    for (var j = 0; j < links.length; j++) {
      var href = new URL(links[j].getAttribute('href'), location.href).href;
      if (have[href]) continue;
      waits.push(new Promise(function (resolve) {
        var l = D.createElement('link');
        l.rel = 'preload'; l.as = 'style'; l.href = href;
        l.onload = l.onerror = function () { l.remove(); resolve(); };
        D.head.appendChild(l);
        N.setTimeout.call(W, resolve, 3000);
      }));
    }
    return Promise.all(waits);
  }

  function applyHead(doc) {
    D.title = doc.title;
    ['description', 'robots', 'theme-color'].forEach(function (name) {
      var nm = doc.head.querySelector('meta[name="' + name + '"]');
      var om = D.head.querySelector('meta[name="' + name + '"]');
      if (nm && om) om.setAttribute('content', nm.getAttribute('content') || '');
      else if (nm) D.head.appendChild(D.importNode(nm, true));
      else if (om) om.remove();
    });
    var metas = doc.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]');
    var old = D.head.querySelectorAll('meta[property^="og:"], meta[name^="twitter:"], link[rel="canonical"]');
    for (var i = 0; i < old.length; i++) old[i].remove();
    for (var k = 0; k < metas.length; k++) D.head.appendChild(D.importNode(metas[k], true));

    // Page styles/stylesheets: replace in place, reusing identical <link>s.
    var oldAssets = D.head.querySelectorAll('[data-tn-page]');
    var anchor = D.createComment('tn-page-assets');
    if (oldAssets.length) D.head.insertBefore(anchor, oldAssets[0]);
    else D.head.appendChild(anchor);
    var reusable = {};
    for (var a = 0; a < oldAssets.length; a++) {
      var el = oldAssets[a];
      if (el.tagName === 'LINK') reusable[el.href] = el;
      el.remove();
    }
    var fresh = doc.head.querySelectorAll('style:not([id]), link[rel~="stylesheet"]');
    for (var f = 0; f < fresh.length; f++) {
      var node = fresh[f];
      var out;
      if (node.tagName === 'LINK') {
        var href = new URL(node.getAttribute('href'), location.href).href;
        out = reusable[href] || D.importNode(node, true);
        delete reusable[href];
      } else {
        out = D.importNode(node, true);
      }
      out.setAttribute('data-tn-page', '');
      D.head.insertBefore(out, anchor);
    }
    anchor.remove();
  }

  function copyAttributes(from, to, keepRe) {
    var i;
    for (i = to.attributes.length - 1; i >= 0; i--) {
      var n = to.attributes[i].name;
      if (keepRe && keepRe.test(n)) continue;
      if (!from.hasAttribute(n)) to.removeAttribute(n);
    }
    for (i = 0; i < from.attributes.length; i++) to.setAttribute(from.attributes[i].name, from.attributes[i].value);
  }

  function applyBody(doc) {
    var body = D.body;
    var chrome = W.__tnChrome;
    if (chrome) chrome.detach();

    var oldGlow = D.getElementById('glow-canvas');
    var newGlow = doc.getElementById('glow-canvas');
    var keepGlow = !!(oldGlow && newGlow && docWantsGlow(doc) && W.__tnGlow && W.__tnGlow.running());
    if (oldGlow && !keepGlow && W.__tnGlow) W.__tnGlow.stop();

    // Remove everything except persistent nodes.
    var kids = Array.prototype.slice.call(body.childNodes);
    kids.forEach(function (n) {
      if (n.nodeType === 1 && (n.matches(PERSIST_SELECTOR) || (keepGlow && n === oldGlow))) return;
      body.removeChild(n);
    });

    var firstPersistent = null;
    for (var c = body.firstChild; c; c = c.nextSibling) {
      if (c !== oldGlow) { firstPersistent = c; break; }
    }
    var incoming = Array.prototype.slice.call(doc.body.childNodes);
    var frag = D.createDocumentFragment();
    incoming.forEach(function (n) {
      if (n.nodeType === 1 && n.tagName === 'SCRIPT') return;
      if (keepGlow && n === newGlow) { frag.appendChild(oldGlow); return; }
      var imported = D.importNode(n, true);
      // Drop nested scripts; the router runs them explicitly.
      if (imported.querySelectorAll) {
        var nested = imported.querySelectorAll('script');
        for (var i = 0; i < nested.length; i++) nested[i].remove();
      }
      frag.appendChild(imported);
    });
    body.insertBefore(frag, firstPersistent);
    copyAttributes(doc.body, body, /^data-tn-/);
    copyAttributes(doc.documentElement, D.documentElement, /^(data-tn-|data-theme$|style$)/);

    var wantsChrome = !!doc.querySelector('script[src*="/lib/fab.js"]');
    if (chrome && wantsChrome) chrome.attach();
  }

  /** Pages that start the shared glow (script src or import of glow-bg.js). */
  function docWantsGlow(doc) {
    if (doc.__tnWantsGlow !== undefined) return doc.__tnWantsGlow;
    var all = doc.querySelectorAll('script');
    var want = false;
    for (var i = 0; i < all.length && !want; i++) {
      want = /\/lib\/glow-bg\.js/.test(all[i].getAttribute('src') || all[i].textContent);
    }
    doc.__tnWantsGlow = want;
    return want;
  }

  function collectScripts(doc) {
    var out = [];
    var all = doc.querySelectorAll('script');
    for (var i = 0; i < all.length; i++) {
      var s = all[i];
      var type = (s.getAttribute('type') || '').trim().toLowerCase();
      var src = s.getAttribute('src');
      if (type === 'importmap' || type === 'speculationrules') continue;
      var isModule = type === 'module';
      if (!isModule && type && type !== 'text/javascript' && type !== 'application/javascript') continue;
      if (src && SKIP_SCRIPT_RE.test(src)) continue;
      if (!src && /^\s*window\.__TN_ASSET_V\s*=/.test(s.textContent)) continue;
      if (s.hasAttribute('nomodule')) continue;
      out.push({ module: isModule, src: src ? new URL(src, location.href).href : null, code: src ? '' : s.textContent });
    }
    // Native order: classic scripts run during parsing, modules after.
    return out.filter(function (x) { return !x.module; }).concat(out.filter(function (x) { return x.module; }));
  }

  function runClassic(s, scope) {
    return new Promise(function (resolve) {
      var el = D.createElement('script');
      if (s.src) {
        el.src = s.src;
        el.async = false;
        el.onload = el.onerror = function () { resolve(); };
      } else {
        // Block-wrap so top-level let/const can be re-declared on revisits;
        // function declarations still become globals (inline onclick use).
        el.textContent = '{\n' + s.code + '\n}' + sourceUrlComment(scope);
      }
      D.head.appendChild(el);
      scope.scripts.push(el);
      if (!s.src) resolve();
    });
  }

  function runModule(s, scope) {
    if (s.src) {
      return import(s.src).catch(function (e) { console.error('[tn-shell] module', s.src, e); });
    }
    return new Promise(function (resolve) {
      var token = 'm' + (++moduleSeq);
      var settled = false;
      var done = function () { if (!settled) { settled = true; resolve(); } };
      pendingModules[token] = done;
      var el = D.createElement('script');
      el.type = 'module';
      // The marker runs once the module's imports are evaluated, right before
      // its body; the 0 ms timeout fires after the body's synchronous part,
      // which is when a native module script counts as "executed" (top-level
      // await continues in the background, as it does natively).
      el.textContent =
        'await window.__tnShell._moduleGate(' + JSON.stringify(token) + ',' + scope.id + ');\n' + s.code + sourceUrlComment(scope);
      D.head.appendChild(el);
      scope.scripts.push(el);
      // Modules that throw or await forever still release the ready signal.
      N.setTimeout.call(W, function () { delete pendingModules[token]; done(); }, 8000);
    });
  }

  function runScripts(doc, scope) {
    var list = collectScripts(doc);
    var chain = Promise.resolve();
    var modules = [];
    list.forEach(function (s) {
      if (!s.module) chain = chain.then(function () { if (!scope.dead) return runClassic(s, scope); });
    });
    return chain.then(function () {
      list.forEach(function (s) { if (s.module && !scope.dead) modules.push(runModule(s, scope)); });
      return Promise.all(modules);
    });
  }

  function ensureGlow(doc) {
    if (!D.getElementById('glow-canvas') || !docWantsGlow(doc)) return;
    import('/lib/glow-bg.js').then(function (m) { m.startGlowBg(); }).catch(function () { /* ignore */ });
  }

  function focusAndAnnounce() {
    var target =
      D.querySelector('main h1, .container h1, h1') ||
      D.querySelector('main, [role="main"], .container, .tn-shell');
    if (target) {
      if (!target.hasAttribute('tabindex')) {
        target.setAttribute('tabindex', '-1');
        target.setAttribute('data-tn-focus-target', '');
      }
      try { target.focus({ preventScroll: true }); } catch (e) { target.focus(); }
    }
    var ann = ensureAnnouncer();
    if (ann) {
      ann.textContent = '';
      N.setTimeout.call(W, function () { ann.textContent = (D.title || 'Page') + ' loaded'; }, 50);
    }
  }

  function scrollAfter(u, opts) {
    if (opts.pop && opts.state && typeof opts.state.y === 'number') {
      W.scrollTo(opts.state.x || 0, opts.state.y);
      return;
    }
    if (u.hash) {
      var el = D.getElementById(decodeURIComponent(u.hash.slice(1)));
      if (el) { el.scrollIntoView(); return; }
    }
    W.scrollTo(0, 0);
  }

  function navigate(href, opts) {
    var u = new URL(href, location.href);
    if (!enabled || !routeOf(u.pathname)) { hardNavigate(u); return Promise.resolve(false); }
    var token = ++navToken;
    D.documentElement.setAttribute('data-tn-navigating', '');
    if (opts.push) saveScroll();
    var tctx = { from: renderedRoute, to: routeOf(u.pathname), pop: !!opts.pop, url: u.href };
    var tp = null;
    if (transition) {
      try { tp = transition.start(tctx) || null; } catch (e) { console.error('[tn-shell] transition', e); tp = null; }
    }
    var ready = tp
      ? Promise.all([fetchPage(u), Promise.resolve(tp).catch(function () { /* ignore */ })]).then(function (r) { return r[0]; })
      : fetchPage(u);

    return ready.then(function (page) {
      if (token !== navToken) return false;
      var finalUrl = new URL(page.url || u.href);
      if (!routeOf(finalUrl.pathname)) throw new Error('redirected off-site');
      finalUrl.hash = u.hash;
      var doc = new DOMParser().parseFromString(page.html, 'text/html');
      if (!doc.querySelector('script[src*="/lib/shell/shell.js"]')) throw new Error('target page has no shell');
      if (importmapText(doc) !== importmapText(D)) throw new Error('importmap differs');
      if (buildId(doc) !== buildId(D)) throw new Error('new deploy (tn-build changed)');
      return loadStylesheets(doc).then(function () {
        if (token !== navToken) return false;
        var prev = current;
        var swap = function () {
          teardown(prev);
          current = createScope(true);
          renderedDoc = current.id;
          var entry = { tn: 1, tnDoc: renderedDoc, x: 0, y: 0 };
          if (opts.push) N.pushState.call(history, entry, '', finalUrl.href);
          else N.replaceState.call(history, Object.assign({}, opts.state || {}, entry, opts.pop && opts.state ? { x: opts.state.x || 0, y: opts.state.y || 0 } : {}), '', finalUrl.href);
          renderedKey = cacheKey(finalUrl);
          renderedRoute = routeOf(finalUrl.pathname);
          applyHead(doc);
          applyBody(doc);
          scrollAfter(finalUrl, opts);
          if (transition && transition.swapped) {
            try { transition.swapped({ from: tctx.from, to: renderedRoute, pop: tctx.pop, url: finalUrl.href }, !!tp); } catch (e) { console.error('[tn-shell] transition', e); }
          }
        };
        var vt = null;
        if (!tp && D.startViewTransition && !reducedMotion() && D.visibilityState === 'visible') {
          vt = D.startViewTransition(swap);
          vt.ready.catch(function () { /* skipped transition */ });
        }
        var afterSwap = vt ? vt.updateCallbackDone : Promise.resolve(swap());
        return afterSwap.then(function () {
          var scope = current;
          ensureGlow(doc);
          if (W.__tnChrome) W.__tnChrome.paintActive();
          focusAndAnnounce();
          return runScripts(doc, scope).then(function () {
            fireReady(scope);
            if (token === navToken) D.documentElement.removeAttribute('data-tn-navigating');
            try { W.dispatchEvent(new CustomEvent('tn:navigated', { detail: { url: location.href, scope: scope.id } })); } catch (e) { /* ignore */ }
            return true;
          });
        });
      });
    }).catch(function (err) {
      console.warn('[tn-shell] soft navigation failed, loading page normally:', err && err.message);
      D.documentElement.removeAttribute('data-tn-navigating');
      hardNavigate(u, !opts.push);
      return false;
    });
  }

  // ── Wiring ─────────────────────────────────────────────────────────────
  function init() {
    markPageAssets(D.head);
    ensureAnnouncer();
    if (!enabled) return;
    try { history.scrollRestoration = 'manual'; } catch (e) { /* ignore */ }
    renderedKey = cacheKey(new URL(location.href));
    try { N.replaceState.call(history, Object.assign({}, history.state || {}, { tn: 1, tnDoc: renderedDoc }), '', location.href); } catch (e) { /* ignore */ }

    api.untracked(function () {
      D.addEventListener('click', function (ev) {
        if (ev.defaultPrevented) return;
        var a = closestAnchor(ev.target);
        var u = eligibleLink(a, ev);
        if (!u) return;
        // In-page hash links: let the browser handle them.
        if (u.pathname === location.pathname && u.search === location.search && u.hash) return;
        ev.preventDefault();
        if (u.href === location.href) return;
        navigate(u.href, { push: true });
      });

      var prefetchOn = function (ev) {
        var u = eligibleLink(closestAnchor(ev.target), null);
        if (u && cacheKey(u) !== cacheKey(new URL(location.href))) fetchPage(u).catch(function () { /* ignore */ });
      };
      D.addEventListener('pointerover', prefetchOn, { passive: true });
      D.addEventListener('focusin', prefetchOn);
      D.addEventListener('touchstart', prefetchOn, { passive: true });

      W.addEventListener('popstate', function (ev) {
        // Entries created by the page currently shown (hash links, page
        // pushState/replaceState) need no swap.
        var st = ev.state;
        if (st && st.tnDoc) { if (st.tnDoc === renderedDoc) return; }
        else if (cacheKey(new URL(location.href)) === renderedKey) return;
        navigate(location.href, { push: false, pop: true, state: ev.state });
      });

      // Uncaught errors from late continuations of pages we already left
      // (e.g. a fetch that resolved after navigation touching removed DOM)
      // are expected in a soft-navigation world; keep them out of the console.
      var staleError = function (err) {
        var owner = scopeOfStack(err && err.stack);
        return !!(owner && deadScopes[owner]);
      };
      W.addEventListener('error', function (ev) {
        if (staleError(ev.error)) {
          ev.preventDefault();
          stats.staleErrorsSuppressed++;
          console.debug('[tn-shell] ignored error from a previous page:', ev.message);
        }
      }, true);
      W.addEventListener('unhandledrejection', function (ev) {
        if (staleError(ev.reason)) {
          ev.preventDefault();
          stats.staleErrorsSuppressed++;
          console.debug('[tn-shell] ignored rejection from a previous page:', ev.reason && ev.reason.message);
        }
      });
      var scrollTimer = 0;
      W.addEventListener('scroll', function () {
        N.clearTimeout.call(W, scrollTimer);
        scrollTimer = N.setTimeout.call(W, saveScroll, 150);
      }, { passive: true });
    });
  }

  if (D.readyState === 'loading') {
    api.untracked(function () { D.addEventListener('DOMContentLoaded', init); });
  } else {
    init();
  }
})();
