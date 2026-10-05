// fab.js — site chrome: one .site-chrome banner, pinned to the top of the
// viewport on every page (a direct child of <body>, never inside page content).
// Wallet + network live in the chrome; auth menu is structured for future authenticators.
//
// Session-level: with the app shell (/lib/shell/shell.js) this chrome is
// created once and kept across soft navigation (window.__tnChrome). Its height
// is published as --tn-chrome-h on <html> so pages and the navigation can
// leave room for it.
// Nothing wallet-related is imported at startup: wallet.js + wallet-modal.js
// load on Connect intent (hover/focus prefetch, click), and a previous session
// is quietly restored at idle only when one was saved and an extension exists.

(function () {
  'use strict';

  const PRIMARY_LINKS = [
    { path: '/', label: 'Home' },
    { path: '/about', label: 'About', also: ['/about.html'] },
    { path: '/resources', label: 'Resources', also: ['/snapshots', '/snapshots.html'] },
    { path: '/eco', label: 'Eco', also: ['/tabs', '/tabs.html'] },
  ];

  const state = {
    address: null,
    name: null,
    isTestnet: false,
    chainId: 'morocco-1',
  };

  let walletApi = null;
  let modalApi = null;

  function shorten(addr) {
    if (!addr) return '';
    return addr.slice(0, 8) + '…' + addr.slice(-4);
  }

  function currentPath() {
    let p = window.location.pathname.replace(/\/$/, '') || '/';
    if (p.endsWith('.html')) p = p.replace(/\.html$/, '') || '/';
    return p === '' ? '/' : p;
  }

  function pathMatches(item, path) {
    const aliases = [item.path, ...(item.also || [])].map((x) =>
      x.replace(/\.html$/, '').replace(/\/$/, '') || '/'
    );
    const norm = path.replace(/\.html$/, '') || '/';
    return aliases.includes(norm) || aliases.includes(norm + '.html');
  }

  function showToast(msg, type = 'info') {
    let container = document.getElementById('terp-chrome-toasts');
    if (!container) {
      container = document.createElement('div');
      container.id = 'terp-chrome-toasts';
      container.setAttribute('aria-live', 'polite');
      document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    toast.className = `tn-toast tn-toast--${type}`;
    toast.textContent = msg;
    container.appendChild(toast);
    setTimeout(() => {
      toast.classList.add('out');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  let walletApiPromise = null;
  function loadWalletModule() {
    if (walletApiPromise) return walletApiPromise;
    walletApiPromise = import('/lib/wallet.js')
      .then((api) => {
        walletApi = api;
        api.onWalletChange(
          (s) => {
            state.address = s.connected ? s.address : null;
            state.name = s.connected ? s.name || null : null;
            paintWallet();
          },
          { persistent: true }
        );
        return api;
      })
      .catch((e) => {
        console.warn('[chrome] wallet module unavailable', e);
        walletApiPromise = null;
        return null;
      });
    return walletApiPromise;
  }

  let modalPromise = null;
  function loadModalModule() {
    if (!modalPromise) {
      modalPromise = import('/lib/wallet-modal.js').catch((e) => {
        modalPromise = null;
        throw e;
      });
    }
    return modalPromise;
  }

  /** Connect intent: warm the small modules; chain libs only if a wallet can use them. */
  function prefetchWallet(withLibs) {
    loadModalModule().catch(() => {});
    loadWalletModule().then((api) => {
      if (api && withLibs && window.keplr) api.loadLibs();
    });
  }

  function hasSavedSession() {
    try {
      return !!JSON.parse(localStorage.getItem('terp-wallet-v1') || 'null')?.address;
    } catch {
      return false;
    }
  }

  async function ensureConfig() {
    let config = window.__TERP_CONFIG;
    if (config?.chainId) return config;
    const { fetchSiteConfig, getChainConfig, buildChainSuggest, buildCosmesChainInfo } =
      await import('/lib/config.js');
    await fetchSiteConfig();
    const chain = await getChainConfig();
    config = {
      pageId: 'chrome',
      chainId: chain.chainId || 'morocco-1',
      chainName: chain.chainName || 'Terp Network',
      rpc: chain.rpc || 'https://rpc.terp.network',
      rest: chain.rest || 'https://api.terp.network',
      denom: chain.denom?.fee || 'uthiol',
      denomDisplay: chain.denom?.feeDisplay || 'THIOL',
      denomDecimals: chain.denom?.decimals ?? 6,
      bech32Prefix: chain.bech32Prefix || 'terp',
    };
    config.chainSuggest = buildChainSuggest(config);
    config.cosmesChainInfo = buildCosmesChainInfo(config);
    window.__TERP_CONFIG = config;
    return config;
  }

  function paintWallet() {
    const btn = document.getElementById('tn-wallet-btn');
    if (!btn) return;
    if (state.address) {
      // A Billboards name leads; the address stays in the tooltip and label.
      btn.textContent = state.name || shorten(state.address);
      btn.classList.add('connected');
      btn.classList.toggle('named', !!state.name);
      btn.setAttribute('aria-label', state.name ? `Account ${state.name}, ${state.address}` : `Account ${state.address}`);
      btn.title = state.name ? `${state.name} · ${state.address}` : state.address;
    } else {
      btn.textContent = 'Connect';
      btn.classList.remove('connected', 'named');
      btn.setAttribute('aria-label', 'Open account');
      btn.removeAttribute('title');
    }
  }

  async function openAccountModal(extraOpts = {}) {
    try {
      if (!modalApi) {
        modalApi = await loadModalModule();
        await loadWalletModule();
      }
      const config = await ensureConfig();
      await modalApi.openWalletModal({
        config,
        isTestnet: state.isTestnet,
        defaultAddress: state.address || '',
        onNetworkToggle: () => {
          toggleNetwork();
          modalApi.openWalletModal({
            config,
            isTestnet: state.isTestnet,
            defaultAddress: state.address || '',
            onNetworkToggle: () => toggleNetwork(),
            ...extraOpts,
          });
        },
        ...extraOpts,
      });
    } catch (e) {
      console.error('[chrome] wallet modal', e);
      showToast(e.message || 'Account modal failed', 'error');
    }
  }

  function paintNetwork() {
    /* network UI lives in wallet modal now */
  }

  async function toggleNetwork() {
    state.isTestnet = !state.isTestnet;
    state.chainId = state.isTestnet ? '120u-1' : 'morocco-1';
    try {
      const { setChainIdOverride } = await import('/lib/config.js');
      setChainIdOverride(state.chainId);
    } catch { /* ignore */ }
    paintNetwork();
    showToast(`Network override → ${state.chainId} (reload to apply)`, 'info');
  }

  function openFaucet() {
    state.isTestnet = true;
    state.chainId = '120u-1';
    openAccountModal({ focusFaucet: true });
  }

  /** The banner lives at the top of <body>, right after the navigation stage (#tn-world). */
  function placeChrome(chrome) {
    const body = document.body;
    const stage = document.getElementById('tn-world');
    if (stage && stage.parentNode === body) stage.after(chrome);
    else body.insertBefore(chrome, body.firstChild);
  }

  let chromeRO = null;
  function publishHeight(chrome) {
    const set = () => {
      const nav = chrome.querySelector('.site-chrome');
      const h = nav ? Math.ceil(nav.getBoundingClientRect().bottom) : 0;
      if (h) document.documentElement.style.setProperty('--tn-chrome-h', h + 'px');
    };
    set();
    if (!chromeRO && window.ResizeObserver) {
      chromeRO = new ResizeObserver(set);
      chromeRO.observe(chrome);
    }
  }

  function buildLinkEl(item, path) {
    const a = document.createElement('a');
    a.href = item.path;
    a.textContent = item.label;
    if (item.primary) a.classList.add('primary');
    if (pathMatches(item, path)) {
      a.classList.add('active');
      a.setAttribute('aria-current', 'page');
    }
    if (item.external) {
      a.target = '_blank';
      a.rel = 'noopener';
    }
    return a;
  }

  function buildDot() {
    const s = document.createElement('span');
    s.className = 'dot';
    s.setAttribute('aria-hidden', 'true');
    return s;
  }

  /** Wallet pill — opens full account modal (session, passkey, network). */
  function buildWalletCluster() {
    const wrap = document.createElement('div');
    wrap.className = 'site-chrome-wallet';
    wrap.innerHTML = `
      <button type="button" class="site-chrome-pill" id="tn-wallet-btn"
        aria-haspopup="dialog" aria-controls="tn-wallet-modal" aria-expanded="false" aria-label="Open account">
        Connect
      </button>
    `;
    return wrap;
  }

  function wireWalletCluster(root) {
    const btn = root.querySelector('#tn-wallet-btn');
    if (!btn) return;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (modalApi?.isWalletModalOpen?.()) { modalApi.closeWalletModal(); return; }
      prefetchWallet(true);
      openAccountModal();
    });
    const warm = () => prefetchWallet(false);
    btn.addEventListener('pointerenter', warm, { once: true });
    btn.addEventListener('focus', warm, { once: true });
  }

  /** Theme picker: a square swatch button with a four-item menu (radio). */
  function buildThemePicker() {
    const T = window.__tnTheme;
    if (!T) return null;
    const wrap = document.createElement('div');
    wrap.className = 'tn-theme';
    const opts = T.list.map((t) => `
        <button type="button" class="site-chrome-menu-item tn-theme-opt" role="menuitemradio" tabindex="-1"
          aria-checked="${t === T.get()}" data-theme-opt="${t}">
          <span class="tn-theme-chip" data-chip="${t}" aria-hidden="true"></span><span class="tn-theme-name">${T.labels[t]}</span>
        </button>`).join('');
    wrap.innerHTML = `
      <button type="button" class="tn-theme-btn" id="tn-theme-btn" aria-haspopup="menu" aria-expanded="false"
        aria-controls="tn-theme-menu" aria-label="Theme: ${T.labels[T.get()]}" title="Theme">
        <span class="tn-theme-swatch" aria-hidden="true"></span>
      </button>
      <div class="site-chrome-menu tn-theme-menu" id="tn-theme-menu" role="menu" aria-label="Theme" hidden>
        <div class="site-chrome-menu-label" aria-hidden="true">Theme</div>${opts}
      </div>`;
    const btn = wrap.querySelector('#tn-theme-btn');
    const menu = wrap.querySelector('#tn-theme-menu');
    const items = () => [...menu.querySelectorAll('.tn-theme-opt')];
    const paint = () => {
      const cur = T.get();
      items().forEach((b) => b.setAttribute('aria-checked', String(b.dataset.themeOpt === cur)));
      btn.setAttribute('aria-label', `Theme: ${T.labels[cur]}`);
    };
    const close = (focusBtn) => {
      if (menu.hidden) return;
      menu.hidden = true;
      btn.setAttribute('aria-expanded', 'false');
      document.removeEventListener('pointerdown', outside, true);
      if (focusBtn) btn.focus();
    };
    const outside = (e) => { if (!wrap.contains(e.target)) close(false); };
    const open = () => {
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      document.addEventListener('pointerdown', outside, true);
      (items().find((b) => b.getAttribute('aria-checked') === 'true') || items()[0]).focus();
    };
    btn.addEventListener('click', (e) => { e.stopPropagation(); if (menu.hidden) open(); else close(true); });
    menu.addEventListener('click', (e) => {
      const b = e.target.closest('.tn-theme-opt');
      if (!b) return;
      T.set(b.dataset.themeOpt);
      close(true);
    });
    wrap.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { close(true); return; }
      if (menu.hidden) return;
      const list = items(), i = list.indexOf(document.activeElement);
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = (i + (e.key === 'ArrowDown' ? 1 : -1) + list.length) % list.length;
        list[n].focus();
      } else if (e.key === 'Home' || e.key === 'End') {
        e.preventDefault();
        list[e.key === 'Home' ? 0 : list.length - 1].focus();
      } else if (e.key === 'Tab') {
        close(false);
      }
    });
    window.addEventListener('tn:theme', paint);
    return wrap;
  }

  function createFullChrome() {
    const wrap = document.createElement('header');
    wrap.className = 'site-chrome-wrap';
    wrap.setAttribute('data-tn-chrome', 'injected');

    const nav = document.createElement('nav');
    nav.className = 'site-chrome';
    nav.setAttribute('aria-label', 'Primary');

    const path = currentPath();
    PRIMARY_LINKS.forEach((item, i) => {
      if (i > 0) nav.appendChild(buildDot());
      nav.appendChild(buildLinkEl(item, path));
    });
    nav.appendChild(buildDot());
    nav.appendChild(buildWalletCluster());
    wireWalletCluster(nav);
    const picker = buildThemePicker();
    if (picker) nav.appendChild(picker);

    wrap.appendChild(nav);
    return wrap;
  }

  function inject() {
    if (document.getElementById('tn-chrome-ready')) return;

    const host = location.hostname;
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host.includes('testnet') ||
      localStorage.getItem('terp-chain-id') === '120u-1'
    ) {
      state.isTestnet = true;
      state.chainId = '120u-1';
    }

    // Mark so we only run once
    const flag = document.createElement('meta');
    flag.id = 'tn-chrome-ready';
    document.head.appendChild(flag);

    document.querySelectorAll('nav.site-chrome, .site-chrome-wrap').forEach((n) => n.remove());
    const chrome = createFullChrome();
    placeChrome(chrome);
    publishHeight(chrome);
    // After switching networks from the account panel, it opens again where it was.
    try {
      const reopen = sessionStorage.getItem('tn-account-reopen');
      if (reopen) {
        sessionStorage.removeItem('tn-account-reopen');
        setTimeout(() => openAccountModal({ view: reopen }), 300);
      }
    } catch { /* ignore */ }

    document.body.classList.add('has-site-chrome');
    document.body.classList.remove('has-tn-header');

    paintNetwork();
    paintWallet();

    window.addEventListener('terp:wallet', (e) => {
      state.address = e.detail?.connected ? e.detail.address : null;
      state.name = e.detail?.connected ? e.detail.name || null : null;
      paintWallet();
    });

    // Quiet rehydrate, only when a session was saved and an extension is
    // present, after first paint and at idle. Otherwise nothing wallet-related
    // is fetched until the user shows Connect intent.
    const rehydrate = () => {
      if (!hasSavedSession() || !window.keplr) return;
      loadWalletModule().then(async (api) => {
        if (!api) return;
        try {
          const config = await ensureConfig();
          await api.ensureLibs(config);
          const snap = await api.tryReconnect(config);
          state.address = snap.connected ? snap.address : null;
          state.name = snap.connected ? snap.name || null : null;
        } catch {
          const snap = api.getSnapshot();
          state.address = snap.connected ? snap.address : null;
          state.name = snap.connected ? snap.name || null : null;
        }
        paintWallet();
      });
    };
    const whenIdle = () =>
      (window.requestIdleCallback || ((f) => setTimeout(f, 200)))(rehydrate, { timeout: 3000 });
    if (document.readyState === 'complete') whenIdle();
    else window.addEventListener('load', whenIdle, { once: true });

    // Back-compat for pages that still call FAB hooks
    window._terpFab = {
      walletAction: () => openAccountModal(),
      toggleNetwork,
      openFaucet,
      openAccountModal,
    };
    window.showFaucetModal =
      window.showFaucetModal ||
      function (addr) {
        import('/lib/faucet.js')
          .then((m) => m.showFaucetModal(addr || ''))
          .catch(() => showToast('Faucet unavailable', 'error'));
      };

    // Persistent-shell hooks: the router detaches the chrome before swapping
    // page content and re-attaches the same node (same place, same frame).
    window.__tnChrome = {
      node: chrome,
      detach() {
        if (chrome.parentNode) chrome.parentNode.removeChild(chrome);
      },
      attach() {
        document.querySelectorAll('nav.site-chrome, .site-chrome-wrap').forEach((n) => {
          if (n !== chrome) n.remove();
        });
        placeChrome(chrome);
        publishHeight(chrome);
        document.body.classList.add('has-site-chrome');
        document.body.classList.remove('has-tn-header');
        this.paintActive();
        paintWallet();
      },
      paintActive() {
        const path = currentPath();
        chrome.querySelectorAll('nav.site-chrome > a').forEach((a, i) => {
          const item = PRIMARY_LINKS[i];
          if (!item) return;
          const on = pathMatches(item, path);
          a.classList.toggle('active', on);
          if (on) a.setAttribute('aria-current', 'page');
          else a.removeAttribute('aria-current');
        });
      },
    };

    try {
      window.dispatchEvent(new CustomEvent('tn:chrome-ready', { detail: { chrome } }));
    } catch { /* ignore */ }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inject);
  } else {
    inject();
  }
})();
