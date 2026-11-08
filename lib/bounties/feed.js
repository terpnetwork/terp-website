// r3: Submissions tab. Public: no wallet. Reads the escrow's live {"submissions":{id}} query for every bounty
// (submit.js readSubmissions, paginated) and shows each with the same CID + sha256 check as the bounty dialog.
import * as SB from '/lib/bounties/submit.js?v=8069322c68';
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export async function mountFeed(host, { live, bounties, smart }) {
  host.innerHTML = `<div class="bxf"><p class="bxl-dim" id="bxf-sum" role="status"><span class="bxl-spin" aria-hidden="true"></span>Reading submissions from the escrow…</p><ol class="bxf-list" id="bxf-list"></ol></div>`;
  const $ = (s) => host.querySelector(s);
  let gen = 0;
  async function refresh() {
    const my = ++gen, all = bounties();
    const out = []; let i = 0, failed = 0;
    await Promise.all(Array.from({ length: 5 }, async () => { while (i < all.length) { const b = all[i++]; try { out.push({ b, rows: await SB.readSubmissions(smart, live, b.id) }); } catch { failed++; } } }));
    if (my !== gen) return;
    const withSubs = out.filter((x) => x.rows.length).sort((a, b) => Math.max(...b.rows.map((s) => Number(s.height))) - Math.max(...a.rows.map((s) => Number(s.height))));
    const n = withSubs.reduce((a, x) => a + x.rows.length, 0);
    $('#bxf-sum').innerHTML = n
      ? `<b>${n}</b> ${n === 1 ? 'submission' : 'submissions'} on ${withSubs.length} of ${all.length} bounties, newest first. Each file is fetched by its CID and checked against the fingerprint on chain.`
      : `No work has been handed in yet. All ${out.length} bounties were checked on chain just now and each has 0 submissions.${failed ? ` (${failed} could not be read.)` : ''}`;
    $('#bxf-sum').dataset.count = String(n);
    $('#bxf-list').innerHTML = withSubs.map(({ b }) => `<li class="bxf-item" data-id="${b.id}"><h3 class="bxf-h"><b>${esc(b.bounty_ref)}</b> ${esc(b.title)}</h3><div data-subs></div></li>`).join('');
    await Promise.all(withSubs.map(({ b }) => SB.paintSubmissions($(`.bxf-item[data-id="${b.id}"] [data-subs]`), b, live, smart, () => my === gen)));
  }
  await refresh();
  return { refresh };
}
