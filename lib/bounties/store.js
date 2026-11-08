// Submissions, applications and created bounties (chain1: no backend).
// * On this device (localStorage, labelled "on this device"): drafts, and work saved before it can be sent.
// * On chain (board mode): the connected account's applications and submissions, read from the bounty board
//   (applications_by / submissions_by) — nothing is POSTed anywhere. (The storage key keeps its old name so
//   drafts saved before stay readable.)
import { Q } from '/lib/bounties/board.js?v=29627017de';
const KEY = 'terp-bounties:local-demo:v1';
const read = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const write = (s) => localStorage.setItem(KEY, JSON.stringify(s));
export const LOCAL = 'on this device';
export const CHAIN = 'on chain';
export const DEV = CHAIN;   // older imports
/** Display text for a stored `via` (older records said "local demo" / "dev backend"). */
export const viaText = (v) => ({ 'local demo': LOCAL, 'dev backend': LOCAL, 'bounty board': LOCAL }[v] || (/simulated|local demo/.test(String(v || '')) ? LOCAL : v || ''));

export const WALLET_RE = /^terp1[02-9ac-hj-np-z]{38,58}$/;   // bech32 charset, terp prefix
export function validSubmission(f) {
  const err = {};
  try { const u = new URL(f.evidenceUrl); if (!/^https?:$/.test(u.protocol)) throw 0; } catch { err.evidenceUrl = 'An http(s) link to the evidence.'; }
  if (!f.notes || f.notes.trim().length < 10) err.notes = 'A few words on what was done (10+ characters).';
  if (!WALLET_RE.test((f.wallet || '').trim())) err.wallet = 'A Terp address (terp1…).';
  return err;
}

export function makeStore(M) {
  let chainSubs = [];
  const listeners = new Set();
  const emit = () => listeners.forEach((f) => f());
  const onChain = () => !!(M.mode === 'chain' && M.client && M.board && M.board.contract);
  const api = {
    on(f) { listeners.add(f); return () => listeners.delete(f); },
    /** Is this task on the board (so its applications/submissions are on chain)? */
    canChain: (n) => !!(onChain() && n && n.onChain),
    canDev: (n) => api.canChain(n),   // older callers
    /** Board mode: the connected account's own applications and submissions, straight from the board. */
    async refresh(address) {
      if (!onChain() || !address) { chainSubs = []; emit(); return; }
      const ref = (id) => (M.all.find((n) => n.onChain && n.onChain.id === id) || {}).id;
      try {
        const [a, s] = await Promise.all([M.client.smart(M.board.contract, Q.applicationsBy(address)), M.client.smart(M.board.contract, Q.submissionsBy(address))]);
        chainSubs = [
          ...((a && a.applications) || []).map((x) => ({ id: `app-${x.task_id}`, kind: 'application', bountyId: ref(x.task_id), status: x.status || 'pending', via: CHAIN, at: x.applied_at ? new Date(Number(x.applied_at) * 1000).toISOString() : null, cid: x.cid, wallet: address })),
          ...((s && s.submissions) || []).map((x) => ({ id: `sub-${x.task_id}-${x.seq}`, kind: 'submission', bountyId: ref(x.task_id), status: x.status || 'pending', via: CHAIN, at: x.submitted_at ? new Date(Number(x.submitted_at) * 1000).toISOString() : null, cid: x.cid, wallet: address })),
        ].filter((x) => x.bountyId);
      } catch { chainSubs = []; }
      emit();
    },
    submissions(id) {
      const local = (read().submissions || []).filter((s) => !id || s.bountyId === id);
      return [...chainSubs.filter((s) => !id || s.bountyId === id), ...local];
    },
    pending(id) { return api.submissions(id).filter((s) => s.status === 'pending'); },
    /** Save work (or an application) on this device; the on-chain message is built and shown by the dialog. */
    async submit(n, f, extra = {}) {
      const body = { evidenceUrl: (f.evidenceUrl || '').trim(), notes: (f.notes || '').trim(), wallet: (f.wallet || '').trim() };
      const s = read(); s.submissions = s.submissions || [];
      const sub = { id: 'local-' + Date.now().toString(36), bountyId: n.id, status: 'pending', via: LOCAL, at: new Date().toISOString(), ...body, ...extra };
      s.submissions.push(sub); write(s); emit();
      return { via: LOCAL, id: sub.id };
    },
    created() { return read().created || []; },
    saveCreated(b) { const s = read(); s.created = (s.created || []).filter((x) => x.id !== b.id); s.created.push(b); write(s); emit(); return b; },
  };
  return api;
}
