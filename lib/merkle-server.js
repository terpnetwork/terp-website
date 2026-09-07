/**
 * merkle-server.js — hash-market (BUD + Merkle) client for mint frontends.
 *
 * Host mode: vote extensions disabled; server serves:
 *   GET /health
 *   GET /trees
 *   GET /trees/{id}
 *   GET /trees/{id}/members/{addr}  → { eligible, proof_hashes, merkle_root, tier, allocation }
 *
 * Wire with config.services.merkleServer (or HASHMERCHANT_URL).
 * Use proof_hashes with whitelist-merkletree.js hasMember / mint msgs for fee bypass.
 */

/**
 * @param {import('./config.js').AppConfig | object} [config]
 * @returns {string} base URL without trailing slash
 */
export function merkleServerUrl(config) {
  const fromCfg =
    (config && (config.merkleServer || config.services?.merkleServer)) ||
    (typeof window !== 'undefined' && window.__TERP_CONFIG__?.services?.merkleServer) ||
    '';
  const env =
    (typeof import.meta !== 'undefined' && import.meta.env?.VITE_MERKLE_SERVER) ||
    '';
  const raw = (fromCfg || env || '').trim().replace(/\/$/, '');
  return raw;
}

/**
 * @param {string} base
 * @param {string} path
 */
async function getJson(base, path) {
  if (!base) throw new Error('merkle server URL not configured (services.merkleServer)');
  const url = `${base}${path.startsWith('/') ? path : `/${path}`}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`merkle server ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json();
}

/**
 * Health / mode check. Expect mode "merkle-bud-host" for mint hosting.
 * @param {string} [base]
 */
export async function fetchMerkleHealth(base) {
  return getJson(base || merkleServerUrl(), '/health');
}

/**
 * List tree IDs on the host.
 * @param {string} [base]
 * @returns {Promise<string[]>}
 */
export async function listTrees(base) {
  return getJson(base || merkleServerUrl(), '/trees');
}

/**
 * Fetch full tree (large — prefer fetchMemberProof for wallets).
 * @param {string} treeId
 * @param {string} [base]
 */
export async function fetchTree(treeId, base) {
  return getJson(base || merkleServerUrl(), `/trees/${encodeURIComponent(treeId)}`);
}

/**
 * Lookup whitelist membership + merkle proof for an address.
 * @param {string} treeId — e.g. collection whitelist id
 * @param {string} address — bech32 wallet
 * @param {string} [base]
 * @returns {Promise<{
 *   eligible: boolean,
 *   tree_id: string,
 *   merkle_root: string,
 *   address: string,
 *   allocation?: number,
 *   tier?: number,
 *   proof_hashes: string[]
 * }>}
 */
export async function fetchMemberProof(treeId, address, base) {
  if (!treeId) throw new Error('treeId required');
  if (!address) throw new Error('address required');
  return getJson(
    base || merkleServerUrl(),
    `/trees/${encodeURIComponent(treeId)}/members/${encodeURIComponent(address)}`
  );
}

/**
 * Resolve config whitelist tree id for the active chain.
 * Prefers config.whitelistTreeId / services.whitelistTreeId / contracts.whitelistTree.
 * @param {object} config
 * @returns {string}
 */
export function whitelistTreeId(config) {
  return (
    config?.whitelistTreeId ||
    config?.services?.whitelistTreeId ||
    config?.contracts?.whitelistTree ||
    config?.whitelist?.treeId ||
    ''
  ).trim();
}

/**
 * High-level: is this wallet eligible for fee-bypass mint on the configured tree?
 * @param {object} config — loaded app config
 * @param {string} address
 * @returns {Promise<{ eligible: boolean, proof_hashes: string[], merkle_root: string, raw: object }>}
 */
export async function checkMintWhitelist(config, address) {
  const base = merkleServerUrl(config);
  const treeId = whitelistTreeId(config);
  if (!base || !treeId) {
    return {
      eligible: false,
      proof_hashes: [],
      merkle_root: '',
      raw: { error: 'merkleServer or whitelistTreeId not configured' },
    };
  }
  const raw = await fetchMemberProof(treeId, address, base);
  return {
    eligible: !!raw.eligible,
    proof_hashes: raw.proof_hashes || [],
    merkle_root: raw.merkle_root || '',
    allocation: raw.allocation,
    tier: raw.tier,
    raw,
  };
}
