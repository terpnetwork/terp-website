// config-loader.js — compatibility re-export (was fully commented out / dead).
// Prefer importing from '/lib/config.js' in new code.

export {
  loadSiteConfig,
  detectChainId,
  getChainConfig,
  fetchSiteConfig,
  applyChainToDefaults,
  buildChainSuggest,
  buildCosmesChainInfo,
  missingContracts,
  setChainIdOverride,
  getCachedSite,
  getCachedChain,
  cosmesBaseUrl,
} from '/lib/config.js';

/** Apps list for nav — from config or defaults */
export function getAppsRegistry(config) {
  if (config?.apps?.length) return config.apps;
  return [
    { id: 'svg', title: 'SVG', url: '/svg.html' },
    { id: 'no-rick', title: 'No Rick', url: '/no-rick.html' },
    { id: 'tabs', title: 'Names', url: '/tabs.html' },
    { id: 'ibc', title: 'IBC', url: '/ibc.html', disabled: true },
  ];
}
