// lib/staking-signer.js — one signer adapter for the staking panel.
//
// The panel never talks to a wallet directly. listSigners() looks at the account
// the Connect panel connected and returns every way it could sign here, each with
// ok / reason; resolveAdapter() turns the chosen one into an adapter that
// lib/staking-tx.js buildSigned() drives:
//
//   keplr    Keplr extension key, SIGN_MODE_DIRECT.
//   ledger   Keplr in Ledger (or Keystone) mode: SIGN_MODE_LEGACY_AMINO_JSON via
//            getOfflineSignerOnlyAmino. Keplr talks to the device (WebHID/USB).
//            Amino cannot carry a TxExtension, so this is the account's own key
//            on the plain signature path only.
//   passkey  A device key from the Connect panel (lib/device-key.js), unsealed by a
//            passkey and registered on the account as a SignatureVerification
//            authenticator. Direct mode + TxExtension selecting that authenticator.
//   eth      A terp-eth CosmWasm authenticator: EIP-191 personal_sign over the
//            SignDoc bytes + TxExtension. Same as account-chain signAccountMsgs.
//   abstract Abstract Accounts: listed, never enabled (no execute path here).
//
// Dependencies are injectable (deps) so tests can run every path with mocks.

import * as T from '/lib/staking-tx.js?v=01e06bab65';

const short = (a) => (!a ? '' : a.length > 20 ? `${a.slice(0, 10)}…${a.slice(-6)}` : a);
const b64 = (u8) => T.toB64(u8);

export const ABSTRACT_REASON = 'Not offered: the Connect panel lists Abstract Accounts but has no way to execute through one, and staking from one needs an account execute that wraps these messages.';

function defaultDeps() {
  const w = typeof window !== 'undefined' ? window : {};
  return {
    keplr: w.keplr || null,
    host: w.location?.hostname || '',
    ac: () => import('/lib/account-chain.js?v=300010c6d8'),
    dk: () => import('/lib/device-key.js?v=8e3e05217c'),
    fetchAuthAccount: T.fetchAuthAccount,
  };
}

/**
 * Every way `address` could sign on this page.
 * ctx: { chainId, rest, address, provider, contracts:{ ethAuthenticatorCode } }
 * Returns [{ id, kind, mode, label, ok, reason, … }] in preference order.
 */
export async function listSigners(ctx, deps = {}) {
  const d = { ...defaultDeps(), ...deps };
  const { chainId, rest, address } = ctx;
  const out = [];
  if (!address) return out;

  // 1. Keplr: direct, or amino when the key lives on a Ledger / Keystone.
  const k = d.keplr;
  if (!k) {
    out.push({ id: 'keplr', kind: 'keplr', mode: 'direct', label: 'Keplr', ok: false, reason: 'Keplr is not installed in this browser.' });
  } else {
    let key = null;
    let err = '';
    try { key = await k.getKey(chainId); } catch (e) { err = e?.message || String(e); }
    const hw = key && (key.isNanoLedger || key.isKeystone);
    const base = hw
      ? { id: 'ledger', kind: 'ledger', mode: 'amino', label: `${key.isKeystone ? 'Keystone' : 'Ledger'} via Keplr (amino-JSON)` }
      : { id: 'keplr', kind: 'keplr', mode: 'direct', label: 'Keplr' };
    let reason = '';
    if (!key) reason = `Keplr has no key for ${chainId}${err ? ` (${err})` : ''}. Connect in the Connect panel.`;
    else if (key.bech32Address !== address) reason = `Keplr’s active account is ${short(key.bech32Address)}, not this address. Switch accounts in Keplr.`;
    else if (hw && typeof k.getOfflineSignerOnlyAmino !== 'function') reason = 'This Keplr build has no amino signer, which a Ledger needs.';
    else if (!hw && typeof k.getOfflineSigner !== 'function') reason = 'This Keplr build has no direct signer.';
    out.push({ ...base, ok: !reason, reason, pubkey: key?.pubKey ? Uint8Array.from(key.pubKey) : null, keyName: key?.name || '' });
  }

  // 2. Authenticators on the account (passkey device keys, eth keys).
  let ac = null;
  let auths = [];
  let active = true;
  let authErr = '';
  try {
    ac = await d.ac();
    const [list, params] = await Promise.all([ac.listAuthenticators(rest, address), ac.smartAccountParams(rest).catch(() => ({}))]);
    auths = list || [];
    active = params?.is_smart_account_active !== false;
  } catch (e) { authErr = e?.message || String(e); }

  try {
    const dk = await d.dk();
    for (const key of dk.listDeviceKeys(address) || []) {
      const hit = ac ? ac.findAuthForKey(auths, key.pubkey) : null;
      const blocker = dk.deviceKeyBlocker();
      let reason = '';
      if (!hit) reason = authErr ? `Could not read the account’s authenticators (${authErr}).` : 'Saved in this browser but not registered on the account.';
      else if (!active) reason = 'Smart accounts are switched off on this network.';
      else if (blocker) reason = blocker;
      else if (key.rpId && d.host && key.rpId !== d.host) reason = `Made on ${key.rpId}; a passkey only works on the site that made it.`;
      out.push({ id: `passkey:${key.credentialId}`, kind: 'passkey', mode: 'direct', label: `Passkey device key · ${key.label || short(key.address)}`, ok: !reason, reason, credentialId: key.credentialId, authId: hit?.id ?? null, devicePubkey: key.pubkey });
    }
  } catch { /* device keys unavailable: none listed */ }

  if (ac && ctx.contracts?.ethAuthenticatorCode) {
    let list = [];
    try { list = await ac.ethAuthenticators(rest, auths, ctx.contracts.ethAuthenticatorCode); } catch { list = []; }
    for (const e of list) {
      let reason = '';
      if (!active) reason = 'Smart accounts are switched off on this network.';
      else if (!ac.ethProvider()) reason = 'No Ethereum wallet (such as MetaMask) in this browser.';
      out.push({ id: `eth:${e.id}`, kind: 'eth', mode: 'direct', label: `Ethereum key ${short(e.signer)}`, ok: !reason, reason, authId: e.id, signer: e.signer });
    }
  }

  // 3. Abstract Accounts: always shown, always disabled, with the reason.
  out.push({ id: 'abstract', kind: 'abstract', mode: null, label: 'Abstract Account', ok: false, reason: ABSTRACT_REASON });
  return out;
}

/** The connected wallet first (Keplr / Ledger), then passkey, then eth. */
export function pickDefault(options) {
  const order = ['keplr', 'ledger', 'passkey', 'eth'];
  return [...(options || [])].filter((o) => o.ok).sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind))[0]?.id || null;
}

/** Adapter for one listed option: { kind, mode, pubkey(), extensions(n), signDirect | signAmino, waitText }. */
export function resolveAdapter(opt, ctx, deps = {}) {
  if (!opt || !opt.ok) throw new Error(opt?.reason || 'No signer for this account.');
  const d = { ...defaultDeps(), ...deps };
  const { chainId, rest, address } = ctx;
  // SignerInfo carries the account's key; for passkey / eth it comes from chain (or Keplr).
  let pk = opt.pubkey || null;
  const pubkey = async () => {
    if (pk) return pk;
    const a = await d.fetchAuthAccount(rest, address).catch(() => null);
    pk = a?.pubkey || ctx.accountPubkey || null;
    return pk;
  };
  const sameBytes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

  if (opt.kind === 'keplr') {
    return {
      kind: 'keplr', mode: 'direct', label: opt.label, pubkey, extensions: () => [], waitText: 'Waiting for Keplr…',
      async signDirect(doc) {
        const s = d.keplr.getOfflineSigner(chainId);
        const [acc] = await s.getAccounts();
        if (!acc || acc.address !== address) throw new Error('Keplr’s active account is not this address. Switch accounts in Keplr and try again.');
        const out = await s.signDirect(address, doc);
        if (!sameBytes(out.signed.bodyBytes, doc.bodyBytes)) throw new Error('The wallet changed the messages. Nothing was sent.');
        return { bodyBytes: out.signed.bodyBytes, authInfoBytes: out.signed.authInfoBytes, signature: T.fromB64(out.signature.signature) };
      },
    };
  }
  if (opt.kind === 'ledger') {
    return {
      kind: 'ledger', mode: 'amino', label: opt.label, pubkey, extensions: () => [], waitText: 'Confirm on your Ledger (Keplr shows the prompt)…',
      async signAmino(doc) {
        const s = d.keplr.getOfflineSignerOnlyAmino(chainId);
        const out = await s.signAmino(address, doc);
        return { signed: out.signed, signature: T.fromB64(out.signature.signature) };
      },
    };
  }
  const ext = async (n) => {
    const ac = await d.ac();
    return [{ typeUrl: ac.TX_EXTENSION, value: ac.encodeTxExtension(Array.from({ length: n }, () => opt.authId)) }];
  };
  if (opt.kind === 'passkey') {
    let cached = null;
    return {
      kind: 'passkey', mode: 'direct', label: opt.label, pubkey, waitText: 'Unlock the device key with your passkey…',
      async prepare(n) { cached = await ext(n); },
      extensions: () => cached || [],
      async signDirect(doc) {
        const dk = await d.dk();
        const wallet = await dk.unlockDeviceKey(opt.credentialId);
        const [dev] = await wallet.getAccounts();
        if (opt.devicePubkey && b64(dev.pubkey) !== opt.devicePubkey) throw new Error('The unlocked key is not the one registered on the account.');
        const out = await wallet.signDirect(dev.address, doc);
        return { bodyBytes: doc.bodyBytes, authInfoBytes: doc.authInfoBytes, signature: T.fromB64(out.signature.signature) };
      },
    };
  }
  if (opt.kind === 'eth') {
    let cached = null;
    return {
      kind: 'eth', mode: 'direct', label: opt.label, pubkey, waitText: 'Sign in your Ethereum wallet…',
      async prepare(n) { cached = await ext(n); },
      extensions: () => cached || [],
      async signDirect(doc) {
        const ac = await d.ac();
        const acct = await ac.ethAccount();
        if (opt.signer && acct !== opt.signer) throw new Error(`The Ethereum wallet’s account is ${short(acct)}; this authenticator expects ${short(opt.signer)}.`);
        const sig = await ac.ethPersonalSign(T.encodeSignDoc(doc), acct);
        return { bodyBytes: doc.bodyBytes, authInfoBytes: doc.authInfoBytes, signature: sig.bytes };
      },
    };
  }
  throw new Error(opt.reason || `No signing path for ${opt.kind}.`);
}
