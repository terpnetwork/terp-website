// lib/smart-account-tx.js — generic x/smart-account sign+broadcast.
// Message types are terp.smartaccount.v1beta1 (terp-rs proto/terp/smartaccount/v1beta1/tx.proto).
// Authenticators are whatever GetAuthenticators returns (id + type + config).
// We do not switch on Passkey / zk-jwt / … . New types work if they only
// need selected_authenticators on TxExtension. Types that need extra Any
// blobs register a hook.

export const TX_EXTENSION_TYPE_URL = '/terp.smartaccount.v1beta1.TxExtension';
export const ADD_AUTHENTICATOR_TYPE_URL = '/terp.smartaccount.v1beta1.MsgAddAuthenticator';
export const REMOVE_AUTHENTICATOR_TYPE_URL = '/terp.smartaccount.v1beta1.MsgRemoveAuthenticator';
export const COSMWASM_AUTHENTICATOR_TYPE = 'CosmwasmAuthenticatorV1';

const SMART_ACCOUNT_CHAINS = new Set(['morocco-1', '120u-1']);

/** Terp's query route (terp.smartaccount.v1beta1 Query/GetAuthenticators). */
const AUTHENTICATOR_PATHS = [
  (rest, acc) => `${rest}/terp/smartaccount/authenticators/${acc}`,
];

/** @type {Map<string, (ctx: object) => Promise<object[]|void>|object[]|void>} */
const hooks = new Map();

export function registerSmartAccountChain(chainId) {
  if (chainId) SMART_ACCOUNT_CHAINS.add(chainId);
}

export function isSmartAccountChain(chainId) {
  return SMART_ACCOUNT_CHAINS.has(chainId);
}

/**
 * Hook keyed by authenticator **type string from chain** (not a hardcoded enum).
 * Return extra protobuf Any `{ typeUrl, value: Uint8Array }` to append as
 * non-critical extensions. Omitted / empty = TxExtension id list is enough.
 */
export function registerAuthenticatorHook(type, fn) {
  hooks.set(type, fn);
}

function lastUsedKey(chainId, address) {
  return `pm-sa-last-auth:${chainId}:${address}`;
}

export function setLastUsedAuthenticatorId(chainId, address, id) {
  try {
    localStorage.setItem(lastUsedKey(chainId, address), String(id));
  } catch {
    /* ignore */
  }
}

export function getLastUsedAuthenticatorId(chainId, address) {
  try {
    const raw = localStorage.getItem(lastUsedKey(chainId, address));
    if (raw == null || raw === '') return undefined;
    return BigInt(raw);
  } catch {
    return undefined;
  }
}

export function selectAuthenticatorId({
  authenticators,
  preferredId,
  chainId,
  address,
}) {
  const ids = (authenticators || []).map((a) => BigInt(a.id));
  if (!ids.length) return undefined;
  if (preferredId !== undefined && preferredId !== null && preferredId !== '') {
    const pref = BigInt(preferredId);
    if (ids.some((id) => id === pref)) return pref;
  }
  const last = getLastUsedAuthenticatorId(chainId, address);
  if (last !== undefined && ids.some((id) => id === last)) return last;
  return ids[0];
}

function writeVarint(out, n) {
  let v = typeof n === 'bigint' ? n : BigInt(n);
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80);
    v >>= 7n;
  }
  out.push(Number(v));
}

/** packed repeated uint64 field 1 — TxExtension.selected_authenticators */
export function encodeTxExtension(selectedAuthenticators) {
  const inner = [];
  for (const id of selectedAuthenticators) {
    writeVarint(inner, BigInt(id).toString());
  }
  const out = [];
  writeVarint(out, (1 << 3) | 2);
  writeVarint(out, inner.length);
  return Uint8Array.from([...out, ...inner]);
}

export async function fetchAuthenticators(rest, address) {
  const base = String(rest || '').replace(/\/$/, '');
  let lastErr = null;
  for (const build of AUTHENTICATOR_PATHS) {
    const url = build(base, encodeURIComponent(address));
    try {
      const res = await fetch(url);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = new Error(json.message || json.error || `authenticators ${res.status}`);
        continue;
      }
      const raw =
        json.account_authenticators ||
        json.accountAuthenticators ||
        json.authenticators ||
        [];
      return raw.map((a) => ({
        id: BigInt(a.id ?? a.ID ?? 0),
        type: String(a.type || a.authenticator_type || a.authenticatorType || ''),
        config: a.config || a.data || null,
      }));
    } catch (e) {
      lastErr = e;
    }
  }
  if (lastErr) throw lastErr;
  return [];
}

/**
 * Resolve TxExtension + optional type hooks. Empty authenticators → secp path.
 */
function b64(u8) {
  let o = '';
  for (const x of u8) o += String.fromCharCode(x);
  return btoa(o);
}

/** SignatureVerification (or AnyOf containing one) for this public key. */
function authenticatorForKey(authenticators, pubkeyB64) {
  if (!pubkeyB64) return undefined;
  for (const a of authenticators) {
    const cfg = typeof a.config === 'string' ? a.config : '';
    if (a.type === 'SignatureVerification' && cfg === pubkeyB64) return a.id;
    if (a.type === 'AnyOf') {
      try {
        const subs = JSON.parse(atob(cfg));
        if (Array.isArray(subs) && subs.some((x) => x.type === 'SignatureVerification' && x.config === pubkeyB64)) return a.id;
      } catch { /* not JSON */ }
    }
  }
  return undefined;
}

/**
 * The account's own key needs no TxExtension (plain signature path). A different
 * signer (contract authenticator, zk payload) selects its authenticator id.
 */
export async function resolveSmartAccountExtensions({
  chainId,
  rest,
  address,
  messageCount,
  preferredId,
  pubkeyB64,
  customSignature = false,
}) {
  if (!isSmartAccountChain(chainId) || !address) {
    return { extensions: [], selectedId: undefined, authenticators: [] };
  }
  const authenticators = await fetchAuthenticators(rest, address);
  const selectedId = customSignature || (preferredId !== undefined && preferredId !== null && preferredId !== '')
    ? selectAuthenticatorId({ authenticators, preferredId, chainId, address })
    : authenticatorForKey(authenticators, pubkeyB64);
  if (selectedId === undefined) {
    return { extensions: [], selectedId: undefined, authenticators };
  }
  const ids = Array.from({ length: Math.max(1, messageCount) }, () => selectedId);
  const extensions = [
    { typeUrl: TX_EXTENSION_TYPE_URL, value: encodeTxExtension(ids) },
  ];
  const chosen = authenticators.find((a) => a.id === selectedId);
  if (chosen?.type && hooks.has(chosen.type)) {
    const extra = await hooks.get(chosen.type)({
      authenticator: chosen,
      address,
      chainId,
    });
    if (Array.isArray(extra)) extensions.push(...extra);
  }
  return { extensions, selectedId, authenticators, chosen };
}

function utf8(s) {
  return new TextEncoder().encode(String(s));
}

function encodeLenDelim(fieldNo, bytes) {
  const out = [];
  writeVarint(out, (fieldNo << 3) | 2);
  writeVarint(out, bytes.length);
  return Uint8Array.from([...out, ...bytes]);
}

/** proto3 MsgAddAuthenticator { sender, authenticator_type, data } */
export function encodeMsgAddAuthenticator({ sender, authenticatorType, data }) {
  const dataBytes =
    data instanceof Uint8Array ? data : utf8(typeof data === 'string' ? data : JSON.stringify(data));
  const parts = [
    encodeLenDelim(1, utf8(sender)),
    encodeLenDelim(2, utf8(authenticatorType)),
    encodeLenDelim(3, dataBytes),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function toHex(u8) {
  return Array.from(u8)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function sha256(bytes) {
  const buf = await crypto.subtle.digest('SHA-256', bytes);
  return new Uint8Array(buf);
}

/**
 * Sync-broadcast via CosmJS, then confirm on LCD (CORS-safe). Never poll RPC /tx.
 */
async function broadcastSyncAndConfirmLcd(client, chain, txBytes) {
  const hashU8 = await sha256(txBytes);
  const hashHex = toHex(hashU8).toUpperCase();
  let sync;
  if (typeof client.broadcastTxSync === 'function') {
    sync = await client.broadcastTxSync(txBytes);
  } else {
    const tmMod = await import('https://cdn.jsdelivr.net/npm/@cosmjs/tendermint-rpc@0.32.4/+esm');
    const Tm = tmMod.Tendermint37Client || tmMod.Tendermint34Client || tmMod.Comet38Client;
    const tm = await Tm.connect(chain.rpc);
    sync = await tm.broadcastTxSync({ tx: txBytes });
  }
  const code = sync?.code ?? sync?.checkTx?.code;
  if (code && code !== 0) {
    throw new Error(sync.log || sync.rawLog || `check_tx ${code}`);
  }
  const rest = String(chain.rest || '').replace(/\/$/, '');
  if (!rest) {
    return { transactionHash: hashHex, txhash: hashHex, hash: hashHex, code: 0, pending: true };
  }
  const deadline = Date.now() + 20000;
  while (Date.now() < deadline) {
    try {
      const r = await fetch(`${rest}/cosmos/tx/v1beta1/txs/${hashHex}`, { cache: 'no-store' });
      if (r.ok) {
        const body = await r.json();
        const txRes = body?.tx_response || body;
        return {
          transactionHash: txRes?.txhash || hashHex,
          txhash: txRes?.txhash || hashHex,
          hash: txRes?.txhash || hashHex,
          code: txRes?.code ?? 0,
          rawLog: txRes?.raw_log,
          height: txRes?.height,
        };
      }
    } catch {
      /* LCD blip — keep waiting; do not surface Failed to fetch */
    }
    await new Promise((res) => setTimeout(res, 1500));
  }
  return {
    transactionHash: hashHex,
    txhash: hashHex,
    hash: hashHex,
    code: 0,
    pending: true,
    rawLog: 'broadcast accepted; LCD confirm timed out',
  };
}

export function zkJwtSignatureBytes(payload) {
  if (payload instanceof Uint8Array) return payload;
  return utf8(typeof payload === 'string' ? payload : JSON.stringify(payload));
}

/**
 * One waist: sign+broadcast any messages. `signatureBytes` (ZkJwtAuthPayload JSON)
 * replaces the secp signature when a Cosmwasm authenticator is selected.
 */
export async function signAndBroadcastAccountTx({
  chain,
  wallet,
  address,
  messages,
  feeGranter = '',
  memo = '',
  authenticatorId,
  signatureBytes,
  gas,
}) {
  const [enc, protoSigning, stargate, txTypes] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@cosmjs/encoding@0.32.4/+esm'),
    import('https://cdn.jsdelivr.net/npm/@cosmjs/proto-signing@0.32.4/+esm'),
    import('https://cdn.jsdelivr.net/npm/@cosmjs/stargate@0.32.4/+esm'),
    import('https://cdn.jsdelivr.net/npm/cosmjs-types@0.9.0/cosmos/tx/v1beta1/tx.js/+esm'),
  ]);

  const { fromBase64, toBase64 } = enc;
  const { makeAuthInfoBytes, makeSignDoc, encodePubkey } = protoSigning;
  const { SigningStargateClient, GasPrice } = stargate;
  const TxBody = txTypes.TxBody || txTypes.default?.TxBody;
  const TxRaw = txTypes.TxRaw || txTypes.default?.TxRaw;
  if (!TxBody || !TxRaw) throw new Error('cosmjs-types tx load failed');

  const [signerAcc] = await wallet.getAccounts();
  const resolved = await resolveSmartAccountExtensions({
    chainId: chain.chainId,
    rest: chain.rest,
    address,
    messageCount: messages.length,
    preferredId: authenticatorId,
    pubkeyB64: signerAcc?.pubkey ? b64(signerAcc.pubkey) : undefined,
    customSignature: !!signatureBytes,
  });

  const client = await SigningStargateClient.connectWithSigner(chain.rpc, wallet, {
    gasPrice: GasPrice.fromString(chain.gasPrice || '0.025uthiol'),
  });

  const bodyBytes = TxBody.encode(
    TxBody.fromPartial({
      messages,
      memo,
      nonCriticalExtensionOptions: resolved.extensions,
    })
  ).finish();

  const account = await client.getAccount(address);
  if (!account) throw new Error(`Account ${address} not on chain`);
  const [acc] = await wallet.getAccounts();
  const pubkey = encodePubkey({
    type: 'tendermint/PubKeySecp256k1',
    value: toBase64(acc.pubkey),
  });

  // Callers may pass a simulated gas limit; the fee follows the chain gas price.
  const gasLimit = Number.isFinite(Number(gas)) && Number(gas) > 0 ? Math.ceil(Number(gas)) : 400000;
  const gasPrice = parseFloat(String(chain.gasPrice || '0.025').replace(/[^0-9.]/g, '')) || 0.025;
  const fee = {
    amount: [{ denom: chain.denom || 'uthiol', amount: String(Math.max(8000, Math.ceil(gasLimit * gasPrice))) }],
    gas: String(gasLimit),
    granter: feeGranter || undefined,
  };

  const authInfoBytes = makeAuthInfoBytes(
    [{ pubkey, sequence: account.sequence }],
    fee.amount,
    Number(fee.gas),
    fee.granter,
    undefined
  );
  const signDoc = makeSignDoc(bodyBytes, authInfoBytes, chain.chainId, account.accountNumber);

  let sig;
  let signedBody = bodyBytes;
  let signedAuth = authInfoBytes;
  if (signatureBytes) {
    sig = signatureBytes instanceof Uint8Array ? signatureBytes : zkJwtSignatureBytes(signatureBytes);
  } else {
    if (typeof wallet.signDirect !== 'function') {
      throw new Error('Signer must support signDirect (amino cannot cover TxExtension)');
    }
    const signed = await wallet.signDirect(address, signDoc);
    signedBody = signed.signed.bodyBytes;
    signedAuth = signed.signed.authInfoBytes;
    sig = fromBase64(signed.signature.signature);
  }

  const txRaw = TxRaw.fromPartial({
    bodyBytes: signedBody,
    authInfoBytes: signedAuth,
    signatures: [sig],
  });
  // Do not use client.broadcastTx — it polls Tendermint GET /tx which
  // often omits CORS on 404/500, so the browser reports "Failed to fetch"
  // after a successful sync broadcast (the Confirm step).
  const txBytes = TxRaw.encode(txRaw).finish();
  const result = await broadcastSyncAndConfirmLcd(client, chain, txBytes);
  if (resolved.selectedId !== undefined) {
    setLastUsedAuthenticatorId(chain.chainId, address, resolved.selectedId);
  }
  return { ...result, smartAccount: resolved };
}

/**
 * Sign + broadcast MsgExecuteContract with optional SA extensions + fee granter.
 * Pass `signatureBytes` = ZkJwtAuthPayload JSON for ante AuthSudoMsg::Authenticate.
 * Never send ExecuteMsg::authenticate.
 */
export async function executeWithSmartAccount({
  chain,
  wallet,
  address,
  contract,
  msg,
  funds = [],
  instructions,
  feeGranter = '',
  memo = '',
  authenticatorId,
  signatureBytes,
  gas,
}) {
  const ops =
    instructions && instructions.length
      ? instructions
      : [{ contract, msg, funds }];
  const [enc, wasmTypes] = await Promise.all([
    import('https://cdn.jsdelivr.net/npm/@cosmjs/encoding@0.32.4/+esm'),
    import('https://cdn.jsdelivr.net/npm/cosmjs-types@0.9.0/cosmwasm/wasm/v1/tx.js/+esm'),
  ]);
  const { toUtf8 } = enc;
  const MsgExecuteContract = wasmTypes.MsgExecuteContract || wasmTypes.default?.MsgExecuteContract;
  if (!MsgExecuteContract) throw new Error('cosmjs-types wasm/tx load failed');

  const messages = ops.map((op) => ({
    typeUrl: '/cosmwasm.wasm.v1.MsgExecuteContract',
    value: MsgExecuteContract.encode(
      MsgExecuteContract.fromPartial({
        sender: address,
        contract: op.contract,
        msg: toUtf8(JSON.stringify(op.msg)),
        funds: op.funds || [],
      })
    ).finish(),
  }));

  return signAndBroadcastAccountTx({
    chain,
    wallet,
    address,
    messages,
    feeGranter,
    memo,
    authenticatorId,
    signatureBytes,
    gas,
  });
}

export function hasCosmwasmAuthenticator(authenticators, contract) {
  return (authenticators || []).some((a) => {
    if (!/cosmwasm/i.test(a.type || '')) return false;
    if (!contract) return true;
    const cfg = a.config;
    const s = typeof cfg === 'string' ? cfg : JSON.stringify(cfg || '');
    return s.includes(contract);
  });
}

/** secp-signed MsgAddAuthenticator if this account has no CosmwasmAuthenticatorV1 yet. */
export async function ensureCosmwasmAuthenticator({
  chain,
  wallet,
  address,
  contract,
  feeGranter = '',
}) {
  if (!contract) throw new Error('zkjwt contract required for CosmwasmAuthenticatorV1');
  const authenticators = await fetchAuthenticators(chain.rest, address);
  if (hasCosmwasmAuthenticator(authenticators, contract)) {
    return { added: false, authenticators };
  }
  const data = utf8(JSON.stringify({ contract }));
  const value = encodeMsgAddAuthenticator({
    sender: address,
    authenticatorType: COSMWASM_AUTHENTICATOR_TYPE,
    data,
  });
  const result = await signAndBroadcastAccountTx({
    chain,
    wallet,
    address,
    messages: [{ typeUrl: ADD_AUTHENTICATOR_TYPE_URL, value }],
    memo: 'add CosmwasmAuthenticatorV1 (zkjwt)',
    feeGranter,
  });
  const next = await fetchAuthenticators(chain.rest, address);
  return { added: true, result, authenticators: next };
}
