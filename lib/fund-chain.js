// fund-chain.js — pick the chain a relayer-gas MsgSend must run on.
//
// Bug this fixes: funding osmo1… from the Relayer gas modal built and broadcast
// the MsgSend on morocco-1 (the live Terp session), so the node rejected it with
// "hrp does not match bech32 prefix: expected 'terp' got 'osmo'".
//
// Order of truth for the destination chain:
//   1. the recipient's bech32 prefix, matched against the site's chain data
//      (DEFAULT_CHAINS merged with config.json → ibc.chains);
//   2. else the seat's own client chain (chainKey / chainId);
//   3. missing rpc / rest / gas price are filled from the cosmos chain-registry.
// Nothing is signed if the prefix and the chosen chain disagree.

const REGISTRY = 'https://raw.githubusercontent.com/cosmos/chain-registry/master';
// chainKey → chain-registry directory name where they differ.
const REGISTRY_DIR = { cosmoshub: 'cosmoshub', terp: 'terpnetwork', osmosis: 'osmosis' };

/** Human-readable part of a bech32 address ('' if it isn't one). */
export function bech32Prefix(addr) {
  const s = String(addr || '').trim().toLowerCase();
  const i = s.lastIndexOf('1');
  if (i < 1 || s.length - i < 7) return '';
  if (!/^[a-z0-9]+$/.test(s.slice(0, i))) return '';
  if (!/^[qpzry9x8gf2tvdw0s3jn54khce6mua7l]+$/.test(s.slice(i + 1))) return '';
  return s.slice(0, i);
}

/** "0.025uosmo" → { amount: 0.025, denom: 'uosmo' } */
export function parseGasPrice(gp) {
  const m = String(gp || '').trim().match(/^([0-9]*\.?[0-9]+)\s*([a-zA-Z][a-zA-Z0-9/:._-]*)$/);
  return m ? { amount: parseFloat(m[1]), denom: m[2] } : null;
}

function chainList(chains) {
  return Object.entries(chains || {}).map(([key, c]) => ({ key, ...c, key: c.key || key }));
}

/**
 * @param {string} address recipient
 * @param {{chainKey?:string, chainId?:string}} seat client hint
 * @param {object[]} sources chain maps, highest priority first
 * @returns {{ chain: object|null, addrPrefix: string, via: 'prefix'|'client'|null, error: string }}
 */
export function resolveFundChain(address, seat, ...sources) {
  const addrPrefix = bech32Prefix(address);
  const all = sources.flatMap(chainList);
  const byPrefix = addrPrefix ? all.find((c) => c.prefix === addrPrefix) : null;
  const byClient =
    all.find((c) => seat?.chainKey && c.key === seat.chainKey) ||
    all.find((c) => seat?.chainId && c.chain_id === seat.chainId) ||
    null;
  const chain = byPrefix || byClient;
  const via = byPrefix ? 'prefix' : byClient ? 'client' : null;
  let error = '';
  if (!addrPrefix) error = `“${String(address).slice(0, 14)}…” is not a bech32 address.`;
  else if (!chain) error = `No chain in the site data uses the “${addrPrefix}” prefix.`;
  else if (chain.prefix && chain.prefix !== addrPrefix)
    error = `Address prefix “${addrPrefix}” does not match ${chain.name || chain.chain_id} (expects “${chain.prefix}”).`;
  else if (byClient && byPrefix && byClient.chain_id !== byPrefix.chain_id)
    error = `This seat is listed for ${byClient.name || byClient.chain_id}, but the address is a ${byPrefix.name || byPrefix.chain_id} (“${addrPrefix}”) address.`;
  return { chain: chain ? { ...chain } : null, addrPrefix, via, error };
}

/** Fill gaps (rpc, rest, gasPrice, decimals) from the chain-registry. Never throws. */
export async function fillFromRegistry(chain) {
  if (!chain || (chain.rpc && (chain.rest || chain.restDirect) && chain.gasPrice && chain.prefix)) return chain;
  const dir = REGISTRY_DIR[chain.key] || chain.key;
  try {
    const r = await fetch(`${REGISTRY}/${encodeURIComponent(dir)}/chain.json`, { cache: 'force-cache' });
    if (!r.ok) return chain;
    const j = await r.json();
    if (j.chain_id && chain.chain_id && j.chain_id !== chain.chain_id) return chain;
    chain.chain_id ||= j.chain_id;
    chain.prefix ||= j.bech32_prefix;
    chain.rpc ||= j.apis?.rpc?.[0]?.address;
    chain.rest ||= j.apis?.rest?.[0]?.address;
    const fee = j.fees?.fee_tokens?.find((f) => !chain.denom || f.denom === chain.denom) || j.fees?.fee_tokens?.[0];
    if (fee) {
      chain.denom ||= fee.denom;
      if (!chain.gasPrice) chain.gasPrice = `${fee.average_gas_price ?? fee.fixed_min_gas_price ?? 0.025}${fee.denom}`;
    }
  } catch { /* offline / CORS: keep site data */ }
  return chain;
}

/** Fee denom + gas step for the chosen chain (gas price wins over seat denom). */
export function feeFor(chain) {
  const gp = parseGasPrice(chain?.gasPrice);
  const avg = gp?.amount || 0.025;
  return {
    denom: gp?.denom || chain?.denom,
    step: { low: avg, average: avg * 1.25, high: avg * 2 },
  };
}
