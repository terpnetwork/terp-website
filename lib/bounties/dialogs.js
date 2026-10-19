// v3.1: keyboard behaviour shared by every .bx3-dlg (submit, propose, escrow):
// - Tab / Shift+Tab wrap inside the open dialog (focus trap; showModal() already makes the page inert,
//   this keeps focus from leaving to the browser chrome and back to the page body);
// - Esc closes it (native `cancel`), focus returns to the opener (each dialog's close handler),
//   and the Esc never reaches the shield (no zoom-out, no navigation).
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), summary, [tabindex]:not([tabindex="-1"])';
const visible = (e) => !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length) && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[hidden], details:not([open]) > :not(summary)');

export function focusables(d) { return [...d.querySelectorAll(FOCUSABLE)].filter(visible); }

export function installDialogKeys(root) {
  addEventListener('keydown', (e) => {
    if (!root.isConnected) return;
    const d = document.querySelector('dialog.bx3-dlg[open]');
    if (!d) return;
    if (e.key === 'Escape') { e.stopPropagation(); return; }   // the dialog's own cancel closes it
    if (e.key !== 'Tab') return;
    const f = focusables(d);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0], last = f[f.length - 1], a = document.activeElement;
    if (!d.contains(a)) { e.preventDefault(); (e.shiftKey ? last : first).focus(); return; }
    if (e.shiftKey && a === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && a === last) { e.preventDefault(); first.focus(); }
  }, true);
}
