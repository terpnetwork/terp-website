// lib/mint-svg.js — one waist: execute cw721_svg mint. Preview is not mint.

import { onboardStatus, requestMintGrant } from '/lib/onboard-client.js';
import { executeWithSmartAccount } from '/lib/smart-account-tx.js';

/** morocco-1 SSOT (terp-state.json / SvgNfts). Do not invent 120u-1. */
export const CHAINS = {
  '120u-1': {
    chainId: '120u-1',
    chainName: 'Terp Lab 120u-1',
    rpc: 'https://testnet-rpc.terp.network',
    rest: 'https://testnet-api.terp.network',
    denom: 'uthiol',
    gasPrice: '0.025uthiol',
    collection: '',
    minter: '',
  },
  'morocco-1': {
    chainId: 'morocco-1',
    chainName: 'Terp Network',
    rpc: 'https://rpc.terp.network',
    rest: 'https://api.terp.network',
    denom: 'uthiol',
    gasPrice: '0.025uthiol',
    collection: 'terp1vp7smemrv846hpsyqrzlnqapmu3sv7hyygf4rrnw3ls26ezk864qupr5zt',
    minter: 'terp188jpppxtfpf0vvt5gypdj52hk2xuswwcn38auczzxv20fcxz3kss9fhlru',
  },
};

export function detectMintChainId() {
  try {
    const q = new URLSearchParams(location.search).get('chain');
    if (q === '120u-1' || q === 'morocco-1') return q;
  } catch {
    /* ignore */
  }
  const h = typeof location !== 'undefined' ? location.hostname : '';
  if (
    h === 'localhost' ||
    h === '127.0.0.1' ||
    h.startsWith('192.168.') ||
    h.includes('testnet')
  ) {
    return '120u-1';
  }
  return 'morocco-1';
}

export function resolveCollection(chain) {
  const q = new URLSearchParams(location.search).get('minter')
    || new URLSearchParams(location.search).get('collection');
  if (q && q.startsWith('terp1')) return q;
  try {
    const stored = localStorage.getItem('pm-minter');
    if (stored && stored.startsWith('terp1')) return stored;
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined' && window.__CW721_CONTRACT__) {
    return window.__CW721_CONTRACT__;
  }
  return chain.collection || '';
}

export function grantBroadcastLive(grant) {
  const b = grant?.broadcast;
  if (!b || typeof b !== 'object') return false;
  if (b.error) return false;
  if (b.status === 0 || b.status === '0') return true;
  if (b.txhash || b.transactionHash) return true;
  return false;
}

export function feeGranterFrom(status, grant) {
  return (
    status?.runtime_key ||
    grant?.msg?.granter ||
    grant?.authz_exec?.grantee ||
    ''
  );
}

function b64query(obj) {
  return btoa(JSON.stringify(obj));
}

export async function querySmart(rest, contract, msg) {
  const url = `${rest.replace(/\/$/, '')}/cosmwasm/wasm/v1/contract/${contract}/smart/${b64query(msg)}`;
  const res = await fetch(url);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.message || json.error || `query ${res.status}`);
  return json.data ?? json;
}

export async function queryOwnerTokens(rest, collection, owner) {
  const data = await querySmart(rest, collection, {
    tokens: { owner, limit: 30 },
  });
  return data.tokens || data.ids || [];
}

/**
 * @param {{
 *   chain: object,
 *   collection: string,
 *   address: string,
 *   wallet: object,
 *   qty: number,
 *   funds: {denom:string,amount:string}[],
 *   feeGranter?: string,
 * }} opts
 */
export async function mintSvgNft(opts) {
  const { chain, collection, address, wallet, qty, funds, feeGranter, authenticatorId } =
    opts;
  if (!collection || !collection.startsWith('terp1')) {
    throw new Error(`No cw721_svg collection on ${chain.chainId} — mint disabled`);
  }
  if (!address || !address.startsWith('terp1')) {
    throw new Error('Need a terp1 signer');
  }
  if (!wallet) throw new Error('No offline signer');

  return executeWithSmartAccount({
    chain,
    wallet,
    address,
    contract: collection,
    msg: {
      mint: {
        amount: String(qty),
        allocation: null,
        proof_hashes: [],
      },
    },
    funds: funds || [],
    feeGranter: feeGranter || '',
    memo: 'permissionless svg mint',
    authenticatorId,
  });
}

/** Allocate mint feegrant; throw unless the allowance is on-chain. */
export async function requireLiveMintGrant(address) {
  const status = await onboardStatus();
  const grant = await requestMintGrant(address);
  if (!grantBroadcastLive(grant)) {
    throw new Error(
      'Mint feegrant is not on-chain (HashMerchant dry-run). Grant plane must broadcast AllowedMsgAllowance first.'
    );
  }
  const granter = feeGranterFrom(status, grant);
  if (!granter || granter === 'RUNTIME_KEY_ADDR' || granter === 'DAO_ADDR') {
    throw new Error('Grant plane has no runtime key — cannot set fee.granter');
  }
  return { status, grant, granter };
}
