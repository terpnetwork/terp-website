// cw-svg-minter: the factory that creates cw721-svg collections
// (contract "cw-svg-minter" 0.7.3, mainnet code 72).
//
// Query API: list_svg_collections{limit,start_after},
//   list_svg_collections_reverse{limit,start_before},
//   list_svg_collections_by_creator{creator,limit,start_after},
//   list_svg_collections_by_creator_reverse{creator,limit,start_before},
//   ownership, code_id
// Execute API: create_svg_collection{instantiate_msg,label} (owner only),
//   update_code_id{code_id} (owner only), update_ownership
// Minting is not here: it is an execute on each collection (see cw721-svg).
//
// The list queries walk storage, so they fail inside the VM on terpd 6.2.0;
// the same list is read from the minter's raw storage instead.

import { smart, allState, mapEntries, jsonOf, fromUtf8, isPrefixScanError, ChainQueryError } from './_lcd.js';

export const CONTRACT = 'cw-svg-minter';
export const CODE_ID = 72;
export { isPrefixScanError, ChainQueryError };

const norm = (c) => ({ contract: c.contract, creator: c.creator || '', name: c.name || '', symbol: c.symbol || '' });

/** Collections from raw storage: Map "svg_collections" keyed by contract address. */
export async function collectionsFromState(rest, minter, opts = {}) {
  const state = await allState(rest, minter, opts);
  return mapEntries(state, 'svg_collections').map(({ key, value }) => {
    try { return norm({ contract: fromUtf8(key), ...jsonOf(value) }); } catch { return null; }
  }).filter(Boolean);
}

/**
 * Every collection the minter created: { contract, creator, name, symbol }[].
 * Tries the contract's list query first and reads storage when it cannot answer.
 */
export async function listCollections(rest, minter, { creator = '', limit = 30, max = 500, signal } = {}) {
  try {
    const out = [];
    let after;
    while (out.length < max) {
      const q = creator
        ? { list_svg_collections_by_creator: { creator, limit, ...(after ? { start_after: after } : {}) } }
        : { list_svg_collections: { limit, ...(after ? { start_after: after } : {}) } };
      const page = await smart(rest, minter, q, { signal });
      const rows = Array.isArray(page) ? page : (page && (page.collections || page.data)) || [];
      out.push(...rows.map(norm));
      if (rows.length < limit) break;
      after = rows[rows.length - 1].contract;
    }
    return { collections: out, source: 'query' };
  } catch (e) {
    if (!isPrefixScanError(e)) throw e;
  }
  let rows = await collectionsFromState(rest, minter, { signal });
  if (creator) rows = rows.filter((r) => r.creator === creator);
  return { collections: rows.slice(0, max), source: 'storage' };
}

/** Code id the minter instantiates new collections with. */
export async function svgCodeId(rest, minter, opts) {
  return Number(await smart(rest, minter, { code_id: {} }, opts));
}

export async function ownership(rest, minter, opts) {
  return smart(rest, minter, { ownership: {} }, opts);
}

// ── execute (owner only) ───────────────────────────────────────────────────
export const createCollectionMsg = ({ instantiateMsg, label }) => ({ create_svg_collection: { instantiate_msg: instantiateMsg, label } });
export const updateCodeIdMsg = (codeId) => ({ update_code_id: { code_id: Number(codeId) } });
