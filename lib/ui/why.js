// why.js — ELI5 notices (fin1): one short line a newcomer understands, with an optional "why?"
// disclosure that holds the technical reason. Styles: public/global.css (.tn-why).
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

/** HTML string: <div class="tn-why"> line <details>why?</details></div>. tone: 'blocked' | 'err' | ''. */
export function whyHtml(line, more = '', { tone = 'blocked', id = '', attrs = '' } = {}) {
  const m = String(more || '').trim();
  return `<div class="tn-why${tone ? ' is-' + tone : ''}"${id ? ` id="${esc(id)}"` : ''} ${attrs}><span class="tn-why__line">${esc(line)}</span>${m && m !== String(line).trim() ? `<details><summary>why?</summary><span class="tn-why__more">${esc(m)}</span></details>` : ''}</div>`;
}

/** Element version of whyHtml. */
export function why(line, more = '', opts = {}) {
  const t = document.createElement('template');
  t.innerHTML = whyHtml(line, more, opts);
  return t.content.firstElementChild;
}

/** Short, plain first line for a technical error message (falls back to `fallback`). */
export function shortLine(msg, fallback = 'That didn’t work.') {
  const s = String(msg || '').trim();
  if (!s) return fallback;
  if (/reject|denied|cancel/i.test(s)) return 'You cancelled it in your wallet.';
  if (/not reachable|timed out|network|cors|failed to fetch/i.test(s)) return 'Can’t reach the network right now.';
  if (/insufficient|not enough/i.test(s)) return 'Not enough funds for this.';
  const first = s.split(/(?<=[.!?])\s/)[0];
  return first.length <= 90 ? first : fallback;
}
