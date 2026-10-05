// cw721-svg: one SVG art collection (contract "cw721_svg"; mainnet collections
// run code 71, new collections from the minter use code 83).
//
// Query API (live schema, from the contract's own error listing):
//   top level   owner_of, approval(s), operator, all_operators, num_tokens,
//               contract_info, get_config, get_collection_info_and_extension,
//               get_all_info, get_collection_extension_attributes, ownership,
//               minter, get_minter_ownership, get_creator_ownership,
//               get_additional_minters, nft_info, get_nft_by_extension,
//               all_nft_info, tokens, all_tokens, extension{msg},
//               get_collection_extension{msg}, get_withdraw_address
//   extension.msg  svg_token_uri{token_id}, svg_placeholder{seed}, svg_template,
//               whitelist, mint_count{address}, wl_mint_count{address},
//               current_price_tier, ownership
// Execute API:
//   top level   update_ownership, update_minter_ownership, update_creator_ownership,
//               update_collection_info, transfer_nft, send_nft, approve, revoke,
//               approve_all, revoke_all, mint (minter only), burn, add_minter,
//               remove_minter, update_extension{msg}, update_nft_info,
//               set_withdraw_address, remove_withdraw_address, withdraw_funds
//   update_extension.msg  mint{amnt, proof_hashes, alloc, ext}, pause{pause},
//               update_whitelist{address}
// A public mint is update_extension → mint on the collection, paid in funds.
//
// Queries that walk storage fail inside the VM on terpd 6.2.0
// (get_config, current_price_tier, whitelist): this module reads the same
// values from raw storage instead and computes the price tier itself.

import { smart, raw, rawJson, mapKey, jsonOf, fromB64, fromUtf8, isPrefixScanError, contractInfo, ChainQueryError } from './_lcd.js';
import { executeAny, simulate } from './_tx.js';

export const CONTRACT = 'cw721_svg';
export const CODE_IDS = { live: 71, minterDefault: 83 };
export { isPrefixScanError, ChainQueryError };

const ext = (msg) => ({ extension: { msg } });

/** Collection name and symbol. */
export async function collectionInfo(rest, addr, opts) {
  try {
    const v = await rawJson(rest, addr, 'cw721_collection_info', opts);
    if (v) return { name: v.name || '', symbol: v.symbol || '' };
  } catch { /* fall through */ }
  const v = await smart(rest, addr, { contract_info: {} }, opts);
  return { name: v.name || '', symbol: v.symbol || '' };
}

/**
 * Mint settings stored in the collection extension: price tiers, supply,
 * mint window, whitelist contract, seed, template and variables.
 */
export async function mintConfig(rest, addr, opts) {
  const v = await raw(rest, addr, mapKey('cw721_collection_info_extension', 'metadata'), opts);
  if (!v) return null;
  const attr = jsonOf(v); // { key: "metadata", value: base64(JSON) }
  const meta = JSON.parse(fromUtf8(fromB64(attr.value)));
  return {
    priceTiers: (meta.price_tiers || []).map((t) => ({ untilCount: Number(t.until_count), price: { denom: t.price.denom, amount: String(t.price.amount) } })),
    total: meta.total != null ? Number(meta.total) : null,
    mintStart: meta.mint_start_time ? new Date(Number(BigInt(meta.mint_start_time) / 1000000n)) : null,
    mintEnd: meta.mint_end_time ? new Date(Number(BigInt(meta.mint_end_time) / 1000000n)) : null,
    whitelist: meta.whitelist || null,
    seed: meta.seed || '',
    template: meta.svg_template || '',
    variables: meta.variables || [],
  };
}

export async function numTokens(rest, addr, opts) {
  const v = await smart(rest, addr, { num_tokens: {} }, opts);
  return Number(v.count || 0);
}

/** Price for the next mint at `minted` tokens: the first tier not yet filled. */
export function priceAt(cfg, minted) {
  if (!cfg || !cfg.priceTiers.length) return null;
  if (cfg.total != null && minted >= cfg.total) return null;
  const t = cfg.priceTiers.find((x) => minted < x.untilCount) || null;
  return t ? { ...t.price } : null;
}

/** Tokens left in the current price tier (a batch must not cross a tier). */
export function leftInTier(cfg, minted) {
  if (!cfg) return 0;
  const t = cfg.priceTiers.find((x) => minted < x.untilCount);
  const cap = cfg.total != null ? cfg.total : Infinity;
  return Math.max(0, Math.min(t ? t.untilCount : cap, cap) - minted);
}

/** Current mint price; the contract's own answer when it can give one. */
export async function currentPrice(rest, addr, { cfg, minted, signal } = {}) {
  try {
    const v = await smart(rest, addr, ext({ current_price_tier: {} }), { signal });
    const c = v && (v.price || v);
    if (c && c.denom && c.amount != null) return { denom: c.denom, amount: String(c.amount) };
  } catch (e) {
    if (!isPrefixScanError(e)) throw e;
  }
  const conf = cfg || (await mintConfig(rest, addr, { signal }));
  const n = minted != null ? minted : await numTokens(rest, addr, { signal });
  return priceAt(conf, n);
}

/** Everything a collection card needs, in one call. */
export async function summary(rest, addr, opts = {}) {
  const [info, cfg, minted, chain, probe] = await Promise.all([
    collectionInfo(rest, addr, opts),
    mintConfig(rest, addr, opts),
    numTokens(rest, addr, opts),
    contractInfo(rest, addr, opts).catch(() => null),
    // The contract's own price query walks the same storage a mint does: if the
    // node cannot finish that scan (terpd 6.2.0), a mint fails the same way.
    smart(rest, addr, ext({ current_price_tier: {} }), opts).then(() => true, (e) => (isPrefixScanError(e) ? false : null)),
  ]);
  const now = Date.now();
  const price = priceAt(cfg, minted);
  let status = 'open';
  if (cfg && cfg.total != null && minted >= cfg.total) status = 'sold-out';
  else if (cfg && cfg.mintStart && cfg.mintStart.getTime() > now) status = 'upcoming';
  else if (cfg && cfg.mintEnd && cfg.mintEnd.getTime() <= now) status = 'closed';
  else if (!price) status = 'closed';
  return { addr, name: info.name, symbol: info.symbol, minted, total: cfg ? cfg.total : null, price, priceTiers: cfg ? cfg.priceTiers : [], mintStart: cfg ? cfg.mintStart : null, mintEnd: cfg ? cfg.mintEnd : null, whitelist: cfg ? cfg.whitelist : null, codeId: chain ? chain.codeId : null, status, chainCanMint: probe, config: cfg };
}

/** Preview SVG for a seed, rendered by the contract from its own template. */
export async function placeholder(rest, addr, seed, opts) {
  const v = await smart(rest, addr, ext({ svg_placeholder: { seed: String(seed) } }), opts);
  return (v && (v.svg || v.token_uri || v)) || '';
}

/** A minted token's SVG. */
export async function tokenSvg(rest, addr, tokenId, opts) {
  const v = await smart(rest, addr, ext({ svg_token_uri: { token_id: String(tokenId) } }), opts);
  return (v && (v.svg || v.token_uri || v.uri || v)) || '';
}

export async function nftInfo(rest, addr, tokenId, opts) {
  return smart(rest, addr, { nft_info: { token_id: String(tokenId) } }, opts);
}

/** Token ids, all or one owner's, following pagination up to `max`. */
export async function tokens(rest, addr, { owner = '', limit = 30, max = 500, signal } = {}) {
  const out = [];
  let after;
  while (out.length < max) {
    const q = owner ? { tokens: { owner, limit, ...(after ? { start_after: after } : {}) } } : { all_tokens: { limit, ...(after ? { start_after: after } : {}) } };
    const v = await smart(rest, addr, q, { signal });
    const ids = (v && v.tokens) || [];
    out.push(...ids.map(String));
    if (ids.length < limit) break;
    after = ids[ids.length - 1];
  }
  return out;
}

/** How many tokens `address` has minted here. */
export async function mintCount(rest, addr, address, opts) {
  const v = await smart(rest, addr, ext({ mint_count: { address } }), opts);
  return Number((v && v.count) || 0);
}

// ── execute ────────────────────────────────────────────────────────────────

/** Public mint message: update_extension → mint. */
export function mintMsg({ amount = 1, proofHashes = [], alloc = 0 } = {}) {
  const n = Math.floor(Number(amount));
  if (!(n >= 1)) throw new Error('amount must be at least 1');
  return { update_extension: { msg: { mint: { amnt: n, proof_hashes: Array.isArray(proofHashes) ? proofHashes : [], alloc: Number(alloc) || 0, ext: null } } } };
}

/** Funds for `amount` tokens at `price` per token. */
export function mintFunds(price, amount = 1) {
  if (!price || BigInt(price.amount) === 0n) return [];
  return [{ denom: price.denom, amount: (BigInt(price.amount) * BigInt(amount)).toString() }];
}

export const transferMsg = ({ recipient, tokenId }) => ({ transfer_nft: { recipient, token_id: String(tokenId) } });
export const burnMsg = ({ tokenId }) => ({ burn: { token_id: String(tokenId) } });
/** Owner only. */
export const pauseMsg = (pause) => ({ update_extension: { msg: { pause: { pause: !!pause } } } });
/** Owner only. */
export const updateWhitelistMsg = (address) => ({ update_extension: { msg: { update_whitelist: { address } } } });

/** The execute instruction for a mint: { contract, msg, funds }. */
export function mintInstruction(addr, { amount = 1, price, proofHashes = [], alloc = 0 } = {}) {
  return { contract: addr, msg: mintMsg({ amount, proofHashes, alloc }), funds: mintFunds(price, amount) };
}

/**
 * Dry run of a mint for `sender` (nothing is signed or broadcast).
 * Resolves { gasUsed }; rejects with the node's reason (e.g. a prefix-scan
 * error on terpd 6.2.0, insufficient funds, mint not open).
 */
export async function simulateMint(rest, addr, { sender, pubkey = '', amount = 1, price, proofHashes = [], alloc = 0, feeDenom } = {}) {
  const ins = mintInstruction(addr, { amount, price, proofHashes, alloc });
  return simulate(rest, { sender, pubkey, feeDenom: feeDenom || (price && price.denom) || 'uthiol', messages: [executeAny({ sender, ...ins })] });
}
