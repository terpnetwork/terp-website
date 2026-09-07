/**
 * wip-gate.js — optional interstitial in front of a terp.network subpage.
 *
 * Default OFF (WIP_GATE_ENABLED = false). Live svg/tabs will not hide until you flip this.
 *
 * Enable:
 *   1. Set WIP_GATE_ENABLED = true below and include this script on the page, or
 *   2. Keep the constant false and open the page with ?wip=1
 *
 * Include (head, before other chrome):
 *   <script src="/lib/wip-gate.js"></script>
 *
 * Bypass: ?wip=0  or  localStorage "terp:wip-skip" (Continue on /wip.html sets this).
 * Redirects to /wip.html?next=<path+search+hash>. Do not include this file on wip.html.
 * This is a page gate — not nav-guard.js (that overlay is not the product).
 */
(function () {
  var WIP_GATE_ENABLED = false;
  var SKIP_KEY = 'terp:wip-skip';
  var WIP_HREF = '/wip.html';

  try {
    var params = new URLSearchParams(location.search);
    if (params.get('wip') === '0') return;
    try {
      if (localStorage.getItem(SKIP_KEY)) return;
    } catch (e) { /* private mode */ }

    var path = location.pathname.replace(/\/+$/, '') || '/';
    if (/(^|\/)wip(\.html)?$/.test(path)) return;

    var on = params.get('wip') === '1' || WIP_GATE_ENABLED === true;
    if (!on) return;

    var u = new URL(location.href);
    u.searchParams.delete('wip');
    var search = u.searchParams.toString();
    var next = u.pathname + (search ? '?' + search : '') + u.hash;
    location.replace(WIP_HREF + '?next=' + encodeURIComponent(next));
  } catch (err) { /* stay on the page */ }
})();
