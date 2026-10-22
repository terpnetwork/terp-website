// ibc-liveness.js — hide dead / abandoned counterparties from the default IBC lists.
//
// Two signals, both shown to the user (never silent):
//   1. DEAD_CHAINS — a small hand-kept denylist. Add an entry only with a reason
//      a reader can verify; remove it when the chain (or our path to it) revives.
//   2. Heuristic from data we already have: a client whose status is Expired /
//      Frozen / Unknown, or a connection that is not STATE_OPEN, is treated as dead.
//      (LCD client_states rows carry no status; those rely on the denylist only.)
// "Show hidden" restores everything; the choice is kept in localStorage.

/** chain_id (exact) or chain key → reason. Keep short, keep sourced. */
export const DEAD_CHAINS = {
  'stargaze-1': 'Terp ↔ Stargaze path abandoned (relayers retired, client lapsed)',
  'omniflixhub-1': 'Terp ↔ OmniFlix path abandoned (no relayer, client lapsed)',
  'evmos_9001-2': 'Evmos path abandoned (no relayer, client lapsed)',
};
const DEAD_KEYS = { stargaze: 'stargaze-1', omniflix: 'omniflixhub-1', omniflixhub: 'omniflixhub-1', evmos: 'evmos_9001-2' };

const LS_KEY = 'tn-ibc-show-hidden';

export function showHidden() {
  try { return localStorage.getItem(LS_KEY) === '1'; } catch { return false; }
}
export function setShowHidden(on) {
  try { localStorage.setItem(LS_KEY, on ? '1' : '0'); } catch { /* private mode */ }
}

function deadReason(chainIdOrKey) {
  const k = String(chainIdOrKey || '').toLowerCase();
  if (!k) return '';
  if (DEAD_CHAINS[k]) return DEAD_CHAINS[k];
  if (DEAD_KEYS[k]) return DEAD_CHAINS[DEAD_KEYS[k]];
  return '';
}

const DEAD_STATUS = /^(expired|frozen|unknown|unauthorized)$/i;

/**
 * Classify a snapshot. Returns visible lists plus a reason map for hidden ids.
 * @param {{channels?:object[], connections?:object[], clients?:object[]}} snap
 */
export function classifySnapshot(snap) {
  const clients = snap?.clients || [];
  const connections = snap?.connections || [];
  const channels = snap?.channels || [];
  const clientReason = new Map();
  const clientChain = new Map();

  for (const c of clients) {
    const id = c.clientId || c.client_id;
    clientChain.set(id, c.chainId);
    const r = deadReason(c.chainId) || (c.status && DEAD_STATUS.test(String(c.status)) ? `client ${String(c.status).toLowerCase()}` : '');
    if (r) clientReason.set(id, r);
  }
  // Channels tell us the counterparty key even when clients came without a chain id.
  for (const ch of channels) {
    const r = deadReason(ch.counterparty?.chainId) || deadReason(ch.counterparty?.chain);
    if (r && ch.client && !clientReason.has(ch.client)) clientReason.set(ch.client, r);
  }
  const connReason = new Map();
  for (const c of connections) {
    const id = c.id || c.connection_id;
    const client = c.client_id || c.clientId;
    const st = String(c.state || c.connection?.state || '');
    const r = clientReason.get(client) || (st && !/OPEN/.test(st) ? `connection ${st.replace(/^STATE_/, '').toLowerCase()}` : '');
    if (r) connReason.set(id, r);
  }
  const chanReason = new Map();
  for (const ch of channels) {
    const r = deadReason(ch.counterparty?.chainId) || deadReason(ch.counterparty?.chain) ||
      clientReason.get(ch.client) || connReason.get(ch.connection) || '';
    if (r) chanReason.set(`${ch.port}/${ch.id}`, r);
  }
  return {
    clientReason, connReason, chanReason,
    hiddenCount: clientReason.size + connReason.size + chanReason.size,
    visible: {
      clients: clients.filter((c) => !clientReason.has(c.clientId || c.client_id)),
      connections: connections.filter((c) => !connReason.has(c.id || c.connection_id)),
      channels: channels.filter((ch) => !chanReason.has(`${ch.port}/${ch.id}`)),
    },
  };
}
