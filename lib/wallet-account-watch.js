// wallet-account-watch.js — notice when the user switches account in a wallet extension.
// One listener set per page, shared by every caller. No chain libraries.
//
// Sources: Keplr `keplr_keystorechange`, Leap `leap_keystorechange`,
// Cosmostation `cosmostation_keystorechange` (+ its cosmos.on('accountChanged') API),
// EIP-1193 `accountsChanged` / `chainChanged` (window.ethereum), and Prax/Penumbra
// (`penumbra_keystorechange` window event, if the extension sends one).
// Bursts (extensions often fire twice) are debounced into one call.

const subs = new Set();
let installed = false;
let timer = null;
let pending = new Set();
let epoch = 0;

function fire() {
  timer = null;
  const sources = [...pending];
  pending = new Set();
  epoch += 1;
  const detail = { sources, epoch, at: Date.now() };
  for (const s of subs) {
    try { s.cb(detail); } catch (e) { console.error('[wallet-watch]', e); }
  }
  try { window.dispatchEvent(new CustomEvent('wallet:account-switch', { detail })); } catch { /* ignore */ }
}

function poke(source, ms = 350) {
  pending.add(source);
  if (timer) clearTimeout(timer);
  timer = setTimeout(fire, ms);
}

function install() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  for (const ev of ['keplr_keystorechange', 'leap_keystorechange', 'cosmostation_keystorechange', 'penumbra_keystorechange']) {
    window.addEventListener(ev, () => poke(ev.split('_')[0]));
  }
  // Cosmostation's own event API (only present when the extension is installed).
  try { window.cosmostation?.cosmos?.on?.('accountChanged', () => poke('cosmostation')); } catch { /* ignore */ }
  // EVM wallets: passive listeners only, never request accounts here.
  const eth = window.ethereum;
  if (eth?.on) {
    try { eth.on('accountsChanged', () => poke('evm')); } catch { /* ignore */ }
    try { eth.on('chainChanged', () => poke('evm-chain')); } catch { /* ignore */ }
  }
}

/**
 * Call cb({ sources, epoch }) after a wallet account (or EVM chain) switch.
 * @returns {() => void} unsubscribe
 */
export function onAccountSwitch(cb) {
  install();
  const s = { cb };
  subs.add(s);
  return () => subs.delete(s);
}

/** Incremented on every switch; capture it before a sign and compare after. */
export function accountEpoch() { return epoch; }

/** Test hook: pretend the wallet switched (also reachable as window.__walletSwitch). */
export function simulateAccountSwitch(source = 'keplr') { install(); poke(source, 0); }
if (typeof window !== 'undefined') window.__walletSwitch = simulateAccountSwitch;

/** Throw unless the extension's active Cosmos account for chainId is `expected`. */
export async function assertActiveAccount(chainId, expected, ext = typeof window !== 'undefined' ? (window.keplr || window.leap) : null) {
  if (!ext?.getKey || !expected) return;
  const k = await ext.getKey(chainId);
  if (k?.bech32Address && k.bech32Address !== expected) {
    const e = new Error('Your wallet switched to another account. Nothing was signed. Check the account and try again.');
    e.code = 'ACCOUNT_SWITCHED';
    throw e;
  }
}
