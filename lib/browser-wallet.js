// lib/browser-wallet.js — ephemeral in-browser HD wallet for demos.
// Session-scoped only (sessionStorage). Not for long-term custody.
//
// Loads CosmJS from jsDelivr +esm (more reliable than bare esm.sh for named exports).
// StacksProvider / installHook errors from browser extensions are unrelated noise.

const STORAGE_KEY = 'pm-demo-wallet-v1';

/** Prefer jsDelivr ESM; fall back to esm.sh if needed. */
const PROTO_SIGNING_URLS = [
  'https://cdn.jsdelivr.net/npm/@cosmjs/proto-signing@0.32.4/+esm',
  'https://esm.sh/@cosmjs/proto-signing@0.32.4?bundle',
];

/**
 * @returns {Promise<typeof import('@cosmjs/proto-signing').DirectSecp256k1HdWallet>}
 */
async function loadHdWalletClass() {
  let lastErr;
  for (const url of PROTO_SIGNING_URLS) {
    try {
      const mod = await import(/* @vite-ignore */ url);
      const W =
        mod.DirectSecp256k1HdWallet ||
        mod.default?.DirectSecp256k1HdWallet ||
        (typeof mod.default === 'function' ? mod.default : null);
      if (W && typeof W.generate === 'function' && typeof W.fromMnemonic === 'function') {
        return W;
      }
      lastErr = new Error(`Module loaded from ${url} but DirectSecp256k1HdWallet.generate missing`);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Could not load CosmJS wallet library: ${lastErr?.message || lastErr || 'unknown'}`
  );
}

/**
 * Create or restore an ephemeral Secp256k1 HD wallet (bech32 prefix default terp).
 * @param {{ prefix?: string, forceNew?: boolean }} [opts]
 * @returns {Promise<{ address: string, mnemonic: string, wallet: object, created: boolean }>}
 */
export async function ensureBrowserWallet(opts = {}) {
  const prefix = opts.prefix || 'terp';
  const DirectSecp256k1HdWallet = await loadHdWalletClass();

  if (!opts.forceNew) {
    const existing = readStored();
    if (existing?.mnemonic && existing?.prefix === prefix) {
      const wallet = await Promise.resolve(
        DirectSecp256k1HdWallet.fromMnemonic(existing.mnemonic, { prefix })
      );
      if (!wallet || typeof wallet.getAccounts !== 'function') {
        throw new Error('Restored wallet is invalid');
      }
      const accounts = await Promise.resolve(wallet.getAccounts());
      const account = accounts?.[0];
      if (!account?.address) throw new Error('No account on restored wallet');
      return {
        address: account.address,
        mnemonic: existing.mnemonic,
        wallet,
        created: false,
      };
    }
  }

  // generate may return a Promise or (rarely) a thenable — always wrap
  const wallet = await Promise.resolve(DirectSecp256k1HdWallet.generate(24, { prefix }));
  if (!wallet || typeof wallet.getAccounts !== 'function') {
    throw new Error('Wallet generate returned an invalid object');
  }

  const accounts = await Promise.resolve(wallet.getAccounts());
  const account = accounts?.[0];
  if (!account?.address) throw new Error('Generated wallet has no address');

  // Prefer public mnemonic getter; fall back if implementation differs
  const mnemonic =
    typeof wallet.mnemonic === 'string'
      ? wallet.mnemonic
      : wallet.secret?.toString?.() || null;

  if (!mnemonic) {
    throw new Error('Could not read mnemonic from generated wallet');
  }

  writeStored({ mnemonic, prefix, address: account.address });
  return {
    address: account.address,
    mnemonic,
    wallet,
    created: true,
  };
}

export function clearBrowserWallet() {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

export function peekBrowserWalletAddress() {
  return readStored()?.address || null;
}

function readStored() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeStored(payload) {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    /* ignore */
  }
}

/**
 * Request test funds (when faucet is available).
 * @param {string} address
 * @param {string} [faucetBase]
 */
export async function requestFaucet(address, faucetBase = 'https://faucet.terp.network') {
  const res = await fetch(
    `${faucetBase.replace(/\/$/, '')}/faucet?address=${encodeURIComponent(address)}`
  );
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Faucet error ${res.status}: ${text || res.statusText}`);
  }
  return res.json();
}
