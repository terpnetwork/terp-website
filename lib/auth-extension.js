// auth-extension.js — Smart-account / non-critical tx extension harness.
//
// Custom authenticators (passkey, session keys, etc.) attach to CosmWasm-style
// smart accounts via non-critical extension options on the tx body. This module
// builds JSON-serializable payloads pages can feed into MsgExecuteContract or
// into a cosmes unsigned tx before broadcast.
//
// Privacy: never put raw private keys, seed phrases, or WebAuthn private material
// into extensions — only public handles, credential IDs, and signatures.

/**
 * @typedef {'webauthn'|'passkey'|'session_key'|'keplr'|'custom'} AuthType
 *
 * @typedef {{
 *   label: string,
 *   type: AuthType,
 *   credentialId?: string,
 *   signature?: string,
 *   authenticatorData?: string,
 *   clientDataJSON?: string,
 *   publicKey?: string,
 *   params?: Record<string, unknown>,
 * }} AuthenticatorClaim
 */

/**
 * Build a single authenticator claim for registration or assertion.
 * @param {AuthenticatorClaim} claim
 */
export function buildAuthenticatorClaim(claim) {
  if (!claim?.label) throw new Error('authenticator label required');
  const type = claim.type || 'custom';
  return {
    label: String(claim.label).slice(0, 64),
    params: {
      type_value: type,
      ...(claim.credentialId ? { credential_id: claim.credentialId } : {}),
      ...(claim.signature ? { signature: claim.signature } : {}),
      ...(claim.authenticatorData ? { authenticator_data: claim.authenticatorData } : {}),
      ...(claim.clientDataJSON ? { client_data_json: claim.clientDataJSON } : {}),
      ...(claim.publicKey ? { public_key: claim.publicKey } : {}),
      ...(claim.params || {}),
    },
  };
}

/**
 * Non-critical extension block for smart-account ante handlers.
 * Compatible with patterns that read body.non_critical_extension_options
 * or app-specific `extension.authenticators`.
 *
 * @param {AuthenticatorClaim[]} claims
 * @param {{ version?: number, account?: string }} [meta]
 */
export function buildAuthExtension(claims, meta = {}) {
  const authenticators = (claims || []).map((c) => buildAuthenticatorClaim(c));
  return {
    '@type': '/terp.smartaccount.v1.AuthExtension',
    version: meta.version ?? 1,
    account: meta.account || null,
    authenticators,
    // Dual shape for consumers that only read `extension`
    extension: { authenticators },
  };
}

/**
 * Attach auth extension onto a plain tx body object (pre-amino / pre-proto).
 * Does not mutate the original.
 *
 * @param {object} txBody
 * @param {object} authExtension — from buildAuthExtension
 */
export function attachNonCriticalAuthExtension(txBody, authExtension) {
  const body = { ...(txBody || {}) };
  const existing = Array.isArray(body.non_critical_extension_options)
    ? body.non_critical_extension_options
    : [];
  body.non_critical_extension_options = [...existing, authExtension];
  // Mirror for apps that read nested extension (passkey path in auth.signTx)
  body.extension = {
    ...(body.extension || {}),
    ...(authExtension.extension || {}),
    authenticators: [
      ...((body.extension && body.extension.authenticators) || []),
      ...(authExtension.authenticators || []),
    ],
  };
  return body;
}

/**
 * MsgExecuteContract payload for registering a passkey authenticator
 * on a smart-account / abstract account controller when supported.
 *
 * Shape is intentionally generic — map to chain-specific Msg types in page code.
 *
 * @param {{
 *   label: string,
 *   credentialId: string,
 *   publicKey?: string,
 *   secp256k1PublicKey?: string,
 *   rpId?: string,
 * }} reg
 */
export function prepareRegisterAuthenticatorMsg(reg) {
  if (!reg?.credentialId) throw new Error('credentialId required for registration');
  return {
    register_authenticator: {
      label: reg.label || 'passkey',
      authenticator: {
        type_value: 'passkey_secp256k1',
        credential_id: reg.credentialId,
        ...(reg.publicKey ? { public_key: reg.publicKey } : {}),
        ...(reg.secp256k1PublicKey ? { secp256k1_public_key: reg.secp256k1PublicKey } : {}),
        ...(reg.rpId ? { rp_id: reg.rpId } : {}),
      },
    },
  };
}

/**
 * MsgExecuteContract payload for removing an authenticator by label/id.
 */
export function prepareRemoveAuthenticatorMsg({ label, credentialId }) {
  return {
    remove_authenticator: {
      label: label || undefined,
      credential_id: credentialId || undefined,
    },
  };
}

/**
 * If network config advertises a smart-account contract, return it.
 * @param {object} config — page / chain config
 */
export function resolveSmartAccountContract(config) {
  const c = config?.contracts || {};
  return (
    c.smartAccount ||
    c.abstractAccount ||
    c.terp721Account ||
    c.accountController ||
    null
  );
}

/**
 * High-level: given a live wallet session + authenticator claim, produce
 * either an execute msg (register) or a tx body extension (sign).
 *
 * @param {{
 *   mode: 'register'|'assert',
 *   config: object,
 *   claim: AuthenticatorClaim,
 *   account?: string,
 * }} opts
 */
export function prepareAuthAction(opts) {
  const { mode, config, claim, account } = opts;
  const contract = resolveSmartAccountContract(config);
  if (mode === 'register') {
    return {
      kind: 'execute',
      contract,
      msg: prepareRegisterAuthenticatorMsg({
        label: claim.label,
        credentialId: claim.credentialId,
        publicKey: claim.publicKey,
        secp256k1PublicKey: claim.params?.secp256k1_public_key,
        rpId: claim.params?.rp_id,
      }),
      supported: !!contract,
      note: contract
        ? 'Broadcast register_authenticator via smart-account module'
        : 'No smart-account contract in config — local passkey stored only; on-chain register when module is deployed',
    };
  }
  // assert / sign
  const extension = buildAuthExtension([claim], { account: account || null });
  return {
    kind: 'extension',
    contract,
    extension,
    attach: (txBody) => attachNonCriticalAuthExtension(txBody, extension),
    supported: true,
    note: 'Attach non_critical_extension_options before broadcast for ante verification',
  };
}
