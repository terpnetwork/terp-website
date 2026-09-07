// pmoney-egg.js — permissionless.money advanced generative mint easter egg
// Unlocked inside the SVG minter page (not a separate public nav item).
//
// Unlock:  ?egg=pmoney  |  Konami code  |  5× click page title
// Uses the same wallet session + svg minter contracts when available.

import { getSnapshot, onWalletChange, MsgExecuteContract, broadcast, getState } from '/lib/wallet.js';

const STYLE_ID = 'pmoney-egg-styles';
const ROOT_ID = 'pmoney-egg-root';

function injectStyles() {
  if (document.getElementById(STYLE_ID)) return;
  const s = document.createElement('style');
  s.id = STYLE_ID;
  s.textContent = `
    #${ROOT_ID} {
      position: fixed; inset: 0; z-index: 10050;
      display: none; align-items: center; justify-content: center;
      background: rgba(8, 9, 13, 0.88);
      backdrop-filter: blur(10px);
      -webkit-backdrop-filter: blur(10px);
      padding: 1rem;
    }
    #${ROOT_ID}.open { display: flex; }
    #${ROOT_ID} .pm-panel {
      width: min(520px, 100%);
      max-height: min(90vh, 720px);
      overflow: auto;
      background: linear-gradient(160deg, rgba(33,34,44,0.98), rgba(18,12,28,0.98));
      border: 1px solid rgba(189, 147, 249, 0.35);
      border-radius: 14px;
      box-shadow: 0 0 60px rgba(189, 147, 249, 0.12);
      padding: 1.25rem 1.35rem 1.5rem;
      color: #f8f8f2;
      font-family: var(--tn-font);
    }
    #${ROOT_ID} .pm-head {
      display: flex; align-items: flex-start; justify-content: space-between;
      gap: 0.75rem; margin-bottom: 0.85rem;
    }
    #${ROOT_ID} .pm-kicker {
      font-size: 0.68rem; letter-spacing: 0.14em; text-transform: uppercase;
      color: #bd93f9; margin-bottom: 0.25rem;
    }
    #${ROOT_ID} .pm-title {
      font-size: 1.15rem; font-weight: 600; color: #f8f8f2; margin: 0;
    }
    #${ROOT_ID} .pm-title span { color: #bd93f9; }
    #${ROOT_ID} .pm-close {
      border: 1px solid rgba(255,255,255,0.12);
      background: transparent; color: #6272a4; border-radius: 6px;
      width: 32px; height: 32px; cursor: pointer; font-size: 1.1rem;
    }
    #${ROOT_ID} .pm-close:hover { color: #f8f8f2; border-color: #bd93f9; }
    #${ROOT_ID} .pm-blurb {
      font-size: 0.82rem; color: #6272a4; line-height: 1.45; margin-bottom: 1rem;
    }
    #${ROOT_ID} .pm-canvas-wrap {
      background: #08090d; border-radius: 10px; border: 1px solid rgba(255,255,255,0.06);
      margin-bottom: 0.9rem; overflow: hidden; aspect-ratio: 1;
    }
    #${ROOT_ID} canvas { display: block; width: 100%; height: 100%; }
    #${ROOT_ID} .pm-row {
      display: grid; grid-template-columns: 1fr 1fr; gap: 0.6rem; margin-bottom: 0.65rem;
    }
    #${ROOT_ID} label {
      display: block; font-size: 0.68rem; color: #6272a4; margin-bottom: 0.2rem;
      text-transform: uppercase; letter-spacing: 0.06em;
    }
    #${ROOT_ID} input[type="range"] { width: 100%; accent-color: #bd93f9; }
    #${ROOT_ID} .pm-meta {
      font-size: 0.72rem; color: #6272a4; font-family: var(--tn-font-mono);
      margin-bottom: 0.75rem;
    }
    #${ROOT_ID} .pm-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; }
    #${ROOT_ID} .pm-btn {
      flex: 1; min-width: 120px; padding: 0.55rem 0.8rem; border-radius: 6px;
      border: 1px solid rgba(189,147,249,0.4); background: rgba(189,147,249,0.12);
      color: #bd93f9; font-family: inherit; font-size: 0.82rem; font-weight: 500;
      cursor: pointer; transition: background 0.15s;
    }
    #${ROOT_ID} .pm-btn:hover { background: rgba(189,147,249,0.22); }
    #${ROOT_ID} .pm-btn.primary {
      background: #bd93f9; color: #08090d; border-color: #bd93f9;
    }
    #${ROOT_ID} .pm-btn.primary:hover { filter: brightness(1.05); }
    #${ROOT_ID} .pm-btn:disabled { opacity: 0.45; cursor: not-allowed; }
    #${ROOT_ID} .pm-status {
      margin-top: 0.75rem; font-size: 0.78rem; color: #98e8c1; min-height: 1.2em;
    }
    #${ROOT_ID} .pm-status.err { color: #ff5555; }
    #${ROOT_ID} .pm-hint {
      margin-top: 0.85rem; font-size: 0.7rem; color: #44475a; line-height: 1.4;
    }
  `;
  document.head.appendChild(s);
}

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic fractal-ish attractor preview (client-only easter egg). */
function drawFractal(canvas, seed, zoom, hueShift) {
  const ctx = canvas.getContext('2d');
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const size = 480;
  canvas.width = size * dpr;
  canvas.height = size * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = '#08090d';
  ctx.fillRect(0, 0, size, size);

  const rand = mulberry32(seed >>> 0);
  let a = 1.4 + rand() * 1.2;
  let b = -2.1 + rand() * 0.6;
  let c = 1.8 + rand() * 0.8;
  let d = -1.3 + rand() * 0.9;
  const z = 0.35 + zoom * 0.55;
  let x = rand() - 0.5;
  let y = rand() - 0.5;

  const img = ctx.createImageData(size, size);
  const data = img.data;
  const steps = 180000;
  for (let i = 0; i < steps; i++) {
    const nx = Math.sin(a * y) - Math.cos(b * x);
    const ny = Math.sin(c * x) - Math.cos(d * y);
    x = nx;
    y = ny;
    const px = Math.floor(size * 0.5 + x * size * 0.22 * z);
    const py = Math.floor(size * 0.5 + y * size * 0.22 * z);
    if (px < 0 || py < 0 || px >= size || py >= size) continue;
    const idx = (py * size + px) * 4;
    const t = i / steps;
    const h = (hueShift + t * 120) % 360;
    // cheap HSV-ish → purple/teal palette
    const r = 80 + Math.sin((h * Math.PI) / 180) * 100;
    const g = 60 + Math.cos((h * Math.PI) / 180) * 90;
    const bl = 140 + Math.sin((h * Math.PI) / 90) * 80;
    data[idx] = Math.min(255, data[idx] + r * 0.08);
    data[idx + 1] = Math.min(255, data[idx + 1] + g * 0.06);
    data[idx + 2] = Math.min(255, data[idx + 2] + bl * 0.1);
    data[idx + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

function ensureDom() {
  injectStyles();
  let root = document.getElementById(ROOT_ID);
  if (root) return root;

  root = document.createElement('div');
  root.id = ROOT_ID;
  root.innerHTML = `
    <div class="pm-panel" role="dialog" aria-label="permissionless.money mint">
      <div class="pm-head">
        <div>
          <div class="pm-kicker">permissionless.money · advanced</div>
          <h2 class="pm-title">Generative <span>SVG</span> egg</h2>
        </div>
        <button type="button" class="pm-close" aria-label="Close">×</button>
      </div>
      <p class="pm-blurb">
        Hidden mint lab. Preview is fully client-side. When you mint, it uses the same
        Terp SVG minter session as this page — no second wallet.
      </p>
      <div class="pm-canvas-wrap"><canvas id="pmoney-canvas"></canvas></div>
      <div class="pm-row">
        <div>
          <label for="pm-seed">Seed</label>
          <input type="range" id="pm-seed" min="1" max="999999" value="42069">
        </div>
        <div>
          <label for="pm-zoom">Zoom</label>
          <input type="range" id="pm-zoom" min="0" max="100" value="42">
        </div>
      </div>
      <div class="pm-row">
        <div>
          <label for="pm-hue">Hue drift</label>
          <input type="range" id="pm-hue" min="0" max="360" value="280">
        </div>
        <div>
          <label>Session</label>
          <div class="pm-meta" id="pm-wallet-meta">wallet: —</div>
        </div>
      </div>
      <div class="pm-actions">
        <button type="button" class="pm-btn" id="pm-reroll">Reroll seed</button>
        <button type="button" class="pm-btn" id="pm-export">Export SVG</button>
        <button type="button" class="pm-btn primary" id="pm-mint">Mint on Terp</button>
      </div>
      <div class="pm-status" id="pm-status"></div>
      <p class="pm-hint">
        Easter egg: Konami code, five clicks on the page title, or <code>?egg=pmoney</code>.
        Not listed in main nav — by design.
      </p>
    </div>
  `;
  document.body.appendChild(root);

  root.querySelector('.pm-close').addEventListener('click', () => closeEgg());
  root.addEventListener('click', (e) => {
    if (e.target === root) closeEgg();
  });

  return root;
}

function paramsFromUi(root) {
  return {
    seed: parseInt(root.querySelector('#pm-seed').value, 10) || 1,
    zoom: (parseInt(root.querySelector('#pm-zoom').value, 10) || 0) / 100,
    hue: parseInt(root.querySelector('#pm-hue').value, 10) || 0,
  };
}

function refreshPreview(root) {
  const canvas = root.querySelector('#pmoney-canvas');
  const p = paramsFromUi(root);
  drawFractal(canvas, p.seed, p.zoom, p.hue);
}

function canvasToSvgMarkup(canvas, meta) {
  const dataUrl = canvas.toDataURL('image/png');
  const { seed, zoom, hue } = meta;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
  width="480" height="480" viewBox="0 0 480 480">
  <title>permissionless.money generative #${seed}</title>
  <desc>seed=${seed};zoom=${zoom};hue=${hue}</desc>
  <image width="480" height="480" href="${dataUrl}"/>
</svg>`;
}

function setStatus(root, msg, err = false) {
  const el = root.querySelector('#pm-status');
  el.textContent = msg || '';
  el.classList.toggle('err', !!err);
}

function updateWalletMeta(root) {
  const snap = getSnapshot();
  const el = root.querySelector('#pm-wallet-meta');
  el.textContent = snap.address
    ? `wallet: ${snap.address.slice(0, 10)}…${snap.address.slice(-4)}`
    : 'wallet: not connected';
}

/**
 * @param {{
 *   config: object,
 *   getMinterAddress?: () => string,
 *   onToast?: (msg:string, type?:string) => void,
 * }} opts
 */
export function installPmoneyEgg(opts) {
  const { config, getMinterAddress, onToast = () => {} } = opts;
  const root = ensureDom();
  let open = false;

  const openEgg = () => {
    open = true;
    root.classList.add('open');
    refreshPreview(root);
    updateWalletMeta(root);
    setStatus(root, '');
  };

  const closeEgg = () => {
    open = false;
    root.classList.remove('open');
  };

  // hoist for outer handlers
  window.__pmoneyEggOpen = openEgg;
  window.__pmoneyEggClose = closeEgg;

  onWalletChange(() => {
    if (open) updateWalletMeta(root);
  });

  root.querySelector('#pm-seed').addEventListener('input', () => refreshPreview(root));
  root.querySelector('#pm-zoom').addEventListener('input', () => refreshPreview(root));
  root.querySelector('#pm-hue').addEventListener('input', () => refreshPreview(root));

  root.querySelector('#pm-reroll').addEventListener('click', () => {
    root.querySelector('#pm-seed').value = String(1 + Math.floor(Math.random() * 999998));
    refreshPreview(root);
  });

  root.querySelector('#pm-export').addEventListener('click', () => {
    const canvas = root.querySelector('#pmoney-canvas');
    const p = paramsFromUi(root);
    const svg = canvasToSvgMarkup(canvas, p);
    const blob = new Blob([svg], { type: 'image/svg+xml' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `pmoney-${p.seed}.svg`;
    a.click();
    URL.revokeObjectURL(a.href);
    setStatus(root, 'Exported SVG locally.');
  });

  root.querySelector('#pm-mint').addEventListener('click', async () => {
    const snap = getSnapshot();
    if (!snap.address) {
      setStatus(root, 'Connect wallet on this page first.', true);
      onToast('Connect wallet first', 'error');
      return;
    }
    const minter =
      (typeof getMinterAddress === 'function' && getMinterAddress()) ||
      config.minterContract ||
      config.contracts?.cwSvgMinter ||
      '';
    if (!minter) {
      setStatus(root, 'SVG minter not configured for this chain.', true);
      onToast('Minter not configured', 'error');
      return;
    }

    const p = paramsFromUi(root);
    const canvas = root.querySelector('#pmoney-canvas');
    // Prefer on-chain mint with extension payload if contract supports free-form;
    // fall back to a standard mint that embeds seed in memo for the egg.
    const btn = root.querySelector('#pm-mint');
    btn.disabled = true;
    setStatus(root, 'Signing…');
    try {
      const wstate = getState();
      if (!wstate.MsgExecuteContract || !wstate.wallet) throw new Error('Wallet not ready');

      // Attempt extension mint with generative params (contracts may ignore unknown fields)
      const msg = {
        mint: {
          extension: {
            pmoney: true,
            seed: String(p.seed),
            zoom: String(Math.round(p.zoom * 100)),
            hue: String(p.hue),
            source: 'permissionless.money-egg',
          },
        },
      };

      const exec = MsgExecuteContract({
        sender: snap.address,
        contract: minter,
        msg,
        funds: [],
      });

      const result = await broadcast(
        [exec],
        `pmoney-egg seed=${p.seed}`,
        1.4,
      );
      const hash = result?.hash || result?.transactionHash || '';
      setStatus(root, hash ? `Mint submitted: ${String(hash).slice(0, 14)}…` : 'Mint submitted.');
      onToast('p.money egg mint submitted', 'success');
      // keep canvas data available for the user
      void canvas;
    } catch (err) {
      console.error('[pmoney-egg] mint', err);
      const m = (err.message || String(err)).toLowerCase();
      if (m.includes('reject')) {
        setStatus(root, 'Rejected in wallet.', true);
      } else {
        // Contract may not accept extension shape — still fun as export-only egg
        setStatus(
          root,
          `On-chain mint failed (${err.message || err}). Export SVG still works — advanced egg is experimental.`,
          true,
        );
      }
    } finally {
      btn.disabled = false;
    }
  });

  // Unlock gestures
  const seq = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a'];
  let idx = 0;
  window.addEventListener('keydown', (e) => {
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key === seq[idx] || key === seq[idx]?.toLowerCase?.()) {
      idx += 1;
      if (idx >= seq.length) {
        idx = 0;
        openEgg();
        onToast('permissionless.money egg unlocked', 'success');
      }
    } else {
      idx = key === seq[0] ? 1 : 0;
    }
  });

  let clicks = 0;
  let clickTimer = null;
  const title = document.querySelector('.page-title');
  if (title) {
    title.style.cursor = 'default';
    title.title = title.title || '';
    title.addEventListener('click', () => {
      clicks += 1;
      clearTimeout(clickTimer);
      clickTimer = setTimeout(() => { clicks = 0; }, 1200);
      if (clicks >= 5) {
        clicks = 0;
        openEgg();
        onToast('You found the p.money lab', 'success');
      }
    });
  }

  try {
    const q = new URLSearchParams(location.search);
    if (q.get('egg') === 'pmoney' || q.get('pmoney') === '1') {
      setTimeout(openEgg, 400);
    }
  } catch { /* ignore */ }

  return { open: openEgg, close: closeEgg };
}

function closeEgg() {
  window.__pmoneyEggClose?.();
}
