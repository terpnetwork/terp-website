// fab.js — site chrome: in-flow .site-chrome (matches index design), not a fixed overlay.
// Wallet + network live in the chrome; auth menu is structured for future authenticators.

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

  async function loadWalletModule() {
    if (walletApi) return walletApi;
    try {
      walletApi = await import('/lib/wallet.js?v=eb8eb9bef7');
      return walletApi;
    } catch (e) {
      console.warn('[chrome] wallet module unavailable', e);
      return null;
    }
  }

  async function ensureConfig() {
    let config = window.__TERP_CONFIG;
    if (config?.chainId) return config;
    const { fetchSiteConfig, getChainConfig, buildChainSuggest, buildCosmesChainInfo } =
      await import('/lib/config.js?v=ded91fbc10');
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
      btn.textContent = shorten(state.address);
      btn.classList.add('connected');
      btn.setAttribute('aria-label', `Account ${state.address}`);
      btn.title = state.address;
    } else {
      btn.textContent = 'Connect';
      btn.classList.remove('connected');
      btn.setAttribute('aria-label', 'Open account modal');
      btn.removeAttribute('title');
    }
  }

  async function openAccountModal(extraOpts = {}) {
    try {
      if (!modalApi) {
        modalApi = await import('/lib/wallet-modal.js?v=f79b592890');
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
      const { setChainIdOverride } = await import('/lib/config.js?v=ded91fbc10');
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

  function findContentHost() {
    return (
      document.querySelector('main.main') ||
      document.querySelector('.container') ||
      document.querySelector('.tn-shell') ||
      document.body
    );
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
        aria-haspopup="dialog" aria-label="Open account modal">
        Connect
      </button>
    `;
    return wrap;
  }

  function wireWalletCluster(root) {
    root.querySelector('#tn-wallet-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      openAccountModal();
    });
  }

  function createFullChrome() {
    const wrap = document.createElement('div');
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
    const hostEl = findContentHost();
    if (hostEl.firstChild) {
      hostEl.insertBefore(chrome, hostEl.firstChild);
    } else {
      hostEl.appendChild(chrome);
    }

    document.body.classList.add('has-site-chrome');
    document.body.classList.remove('has-tn-header');

    paintNetwork();
    paintWallet();

    window.addEventListener('terp:wallet', (e) => {
      state.address = e.detail?.connected ? e.detail.address : null;
      paintWallet();
    });

    loadWalletModule().then(async (api) => {
      if (!api) return;
      api.onWalletChange((s) => {
        state.address = s.connected ? s.address : null;
        paintWallet();
      });
      // Quiet rehydrate if extension session still available
      try {
        const config = await ensureConfig();
        await api.ensureLibs(config);
        const snap = await api.tryReconnect(config);
        state.address = snap.connected ? snap.address : null;
      } catch {
        const snap = api.getSnapshot();
        state.address = snap.connected ? snap.address : null;
      }
      paintWallet();
    });

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
        import('/lib/faucet.js?v=dad9a1f908')
          .then((m) => m.showFaucetModal(addr || ''))
          .catch(() => showToast('Faucet unavailable', 'error'));
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
