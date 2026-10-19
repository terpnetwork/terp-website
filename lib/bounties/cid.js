// cid.js — read a task/application/submission document by its CID and prove it is the right one (chain1).
// The chain stores only the CID. The bytes come from the first gateway that answers (the S3 bucket's
// content-addressed prefix, then the IPFS gateway with ?format=raw), and are accepted only if
// sha256(bytes) equals the CID's digest: a raw CIDv1 with sha2-256 (bafkrei…), at most 256 KiB, one block.
// A gateway can be slow or wrong; it cannot make the page show a document the chain did not point to.
import * as S from '/lib/bounties/vendor/terp-schemas.js';

export const MAX_BYTES = S.DOC_MAX_BYTES;          // 262144 (single raw block)
export class CidError extends Error { constructor(code, msg, detail) { super(msg); this.code = code; this.detail = detail || ''; } }

/** null when `cid` can be checked in the browser; else one plain sentence. */
export function cidProblem(cid) {
  if (!cid || typeof cid !== 'string') return 'No document address (CID).';
  if (!S.isValidCid(cid)) return 'That is not a valid CID.';
  let p; try { p = S.parseCid(cid); } catch { return 'That is not a valid CID.'; }
  if (p.version !== 1 || p.codec !== 'raw' || p.hash !== 'sha2-256') return `This page only accepts raw sha2-256 CIDs (bafkrei…), so it can check the bytes itself; got ${p.version === 0 ? 'CIDv0' : `${p.codec}/${p.hash}`}.`;
  return null;
}
/** sha256(bytes) === CID digest? */
export function verifyBytes(cid, bytes) {
  const p = cidProblem(cid); if (p) return { ok: false, reason: p };
  if (bytes.length > MAX_BYTES) return { ok: false, reason: `The document is ${bytes.length} bytes; the limit is ${MAX_BYTES}.` };
  const want = S.parseCid(cid).digestHex, got = S.sha256Hex(bytes);
  return got === want ? { ok: true, sha256: got } : { ok: false, reason: 'The gateway sent different bytes than this CID names.', sha256: got };
}
/** The CID of a document as this site writes it (canonical JSON, raw CIDv1 sha2-256). */
export const sealDoc = (doc) => S.seal(doc);

const urlFor = (gw, cid) => (/\/ipfs\/?$/.test(gw) ? `${gw.replace(/\/?$/, '/')}${cid}?format=raw` : `${gw.replace(/\/?$/, '/')}${cid}`);

// Immutable by construction: a verified CID never needs a refetch. Memory first, then Cache Storage (if any).
const mem = new Map();
const CACHE = 'terp-bounties-cid-v1';
async function fromCacheStorage(cid) {
  try { if (typeof caches === 'undefined') return null; const c = await caches.open(CACHE); const r = await c.match('/cid/' + cid); return r ? new Uint8Array(await r.arrayBuffer()) : null; } catch { return null; }
}
async function toCacheStorage(cid, bytes) {
  try { if (typeof caches === 'undefined') return; const c = await caches.open(CACHE); await c.put('/cid/' + cid, new Response(bytes, { headers: { 'content-type': 'application/json' } })); } catch { /* private mode etc. */ }
}

/**
 * Fetch + verify + parse. Returns { cid, doc, bytes, via, verified: true, cached }.
 * Throws CidError('invalid' | 'mismatch' | 'too_large' | 'unreachable' | 'not_json').
 */
export async function fetchDoc(cid, { gateways = [], fetchImpl = (...a) => fetch(...a), timeoutMs = 6000, useCache = true } = {}) {
  const p = cidProblem(cid); if (p) throw new CidError('invalid', p);
  if (useCache && mem.has(cid)) return { ...mem.get(cid), cached: 'memory' };
  let bytes = useCache ? await fromCacheStorage(cid) : null, via = 'cache', tried = [];
  if (bytes && !verifyBytes(cid, bytes).ok) bytes = null;           // never trust a cache blindly either
  if (!bytes) {
    for (const gw of gateways) {
      const url = urlFor(gw, cid);
      const ctl = typeof AbortController === 'function' ? new AbortController() : null;
      const t = ctl && setTimeout(() => ctl.abort(), timeoutMs);
      try {
        const r = await fetchImpl(url, { credentials: 'omit', cache: 'force-cache', signal: ctl && ctl.signal });
        if (!r.ok) { tried.push(`${gw}: HTTP ${r.status}`); continue; }
        const len = Number(r.headers && r.headers.get && r.headers.get('content-length'));
        if (len > MAX_BYTES) { tried.push(`${gw}: ${len} bytes`); continue; }
        const b = new Uint8Array(await r.arrayBuffer());
        const v = verifyBytes(cid, b);
        if (!v.ok) { tried.push(`${gw}: ${v.reason}`); continue; }   // a wrong gateway: try the next one
        bytes = b; via = gw; break;
      } catch (e) { tried.push(`${gw}: ${e && e.name === 'AbortError' ? 'timeout' : e.message}`); }
      finally { if (t) clearTimeout(t); }
    }
    if (!bytes) {
      const mismatch = tried.some((x) => /different bytes/.test(x));
      throw new CidError(mismatch ? 'mismatch' : 'unreachable', mismatch ? 'A gateway sent a document that doesn’t match its fingerprint, so it isn’t shown.' : 'The document isn’t reachable right now.', tried.join(' · '));
    }
    if (useCache) toCacheStorage(cid, bytes);
  }
  let doc; try { doc = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new CidError('not_json', 'The document is not JSON.', e.message); }
  const out = { cid, doc, bytes, via, verified: true };
  if (useCache) mem.set(cid, out);
  return { ...out, cached: via === 'cache' ? 'storage' : '' };
}
export const _clearCache = () => mem.clear();

// ── documents this page writes (spec §4) ────────────────────────────────────────────────────────────────
export const APPLICATION_SCHEMA = 'terp-bounty-application/v1';
/** An application: who, which task, why them, links. Small; its CID goes into board `apply`. */
export function applicationDoc({ taskRef, chainId, board, taskId, applicant, pitch, links = [], eta, at }) {
  return JSON.parse(JSON.stringify({ schema: APPLICATION_SCHEMA, task_ref: String(taskRef), board: { chain_id: chainId, contract: board, task_id: taskId != null ? Number(taskId) : undefined },
    applicant, pitch: String(pitch || '').slice(0, 2000), links: links.slice(0, 10), eta: eta || undefined, applied_at: at || new Date().toISOString().replace(/\.\d+Z$/, 'Z') }));
}
export function validateApplication(d) {
  const e = [];
  if (!d || d.schema !== APPLICATION_SCHEMA) e.push('/schema must be ' + APPLICATION_SCHEMA);
  if (!d || !/^terp1[02-9ac-hj-np-z]{38,58}$/.test(d.applicant || '')) e.push('/applicant must be a terp1 address');
  if (!d || !d.task_ref) e.push('/task_ref is required');
  if (d && (!d.pitch || d.pitch.length < 10)) e.push('/pitch: a few words (10+ characters)');
  if (d && d.links && (!Array.isArray(d.links) || d.links.some((u) => !/^(https|ipfs):\/\//.test(u)))) e.push('/links: https:// or ipfs:// only');
  return { ok: !e.length, errors: e };
}
