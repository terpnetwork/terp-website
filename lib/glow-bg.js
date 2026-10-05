// Shared ambient glow canvas — matches index / tabs / svg desks.
// Usage: <script src="/lib/glow-bg.js"></script>  (auto-starts)
// Or (ESM): import { startGlowBg } from this module, then call startGlowBg();
//
// Singleton: one animation loop per document. Repeated startGlowBg() calls
// (module auto-start + page scripts + the app shell after a soft navigation)
// reuse the running loop instead of stacking extra rAF loops. The loop pauses
// while the tab is hidden and draws a single static frame when the user
// prefers reduced motion.

const CANVAS_ID = 'glow-canvas';

/** @type {null | { stop(): void, running(): boolean, canvas: HTMLCanvasElement }} */
let instance = null;

/**
 * @param {{ canvasId?: string, preferExisting?: boolean }} [opts]
 */
export function startGlowBg(opts = {}) {
  if (typeof document === 'undefined') return null;
  if (document.documentElement.classList.contains('embedded')) return null;

  const id = opts.canvasId || CANVAS_ID;
  let canvas =
    document.getElementById(id) ||
    document.getElementById('main-canvas') ||
    null;

  if (!canvas) {
    canvas = document.createElement('canvas');
    canvas.id = id;
    document.body.prepend(canvas);
  }

  if (instance) {
    if (instance.canvas === canvas && canvas.isConnected && instance.running()) return instance;
    instance.stop();
  }

  // global.css already styles #glow-canvas; ensure fixed full-bleed
  canvas.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'z-index:0',
    'pointer-events:none',
  ].join(';');

  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  let width = 0;
  let height = 0;
  let centerX = 0;
  let centerY = 0;
  let time = 0;
  let raf = 0;
  let running = true;

  const orbPositions = [
    { x: 0, y: 0, size: 0.9, brightness: 1.0 },
    { x: -1, y: 0, size: 0.85, brightness: 0.9 },
    { x: 1, y: 0, size: 0.85, brightness: 0.9 },
    { x: 0, y: -1, size: 0.85, brightness: 0.9 },
    { x: 0, y: 1, size: 0.85, brightness: 0.9 },
    { x: -1, y: -1, size: 0.8, brightness: 0.85 },
    { x: 1, y: -1, size: 0.8, brightness: 0.85 },
    { x: -1, y: 1, size: 0.8, brightness: 0.85 },
    { x: 1, y: 1, size: 0.8, brightness: 0.85 },
    { x: -2, y: 0, size: 0.75, brightness: 0.75 },
    { x: 2, y: 0, size: 0.75, brightness: 0.75 },
    { x: 0, y: -2, size: 0.75, brightness: 0.75 },
    { x: 0, y: 2, size: 0.75, brightness: 0.75 },
  ];

  // Colours follow the site theme (tokens in global.css; tn:theme on change).
  const glowColor = { r: 200, g: 255, b: 210 };
  let bgFill = '#000000';
  const readTheme = () => {
    const cs = getComputedStyle(document.documentElement);
    const v = cs.getPropertyValue('--tn-mint-rgb').trim().split(/[\s,]+/).map(Number);
    if (v.length === 3 && v.every(Number.isFinite)) [glowColor.r, glowColor.g, glowColor.b] = v;
    bgFill = cs.getPropertyValue('--tn-canvas').trim() || '#000000';
  };
  readTheme();
  window.addEventListener('tn:theme', () => { readTheme(); if (!raf && running) raf = requestAnimationFrame(draw); });

  function resize() {
    width = window.innerWidth;
    height = window.innerHeight;
    canvas.width = width;
    canvas.height = height;
    centerX = width / 2;
    centerY = height / 2;
  }

  function drawOrb(x, y, baseRadius, brightness, pulseOffset) {
    const pulse = 1 + 0.03 * Math.sin(time * 0.0008 + pulseOffset);
    const radius = baseRadius * pulse;
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
    const alpha = brightness * 0.7;
    gradient.addColorStop(0, `rgba(${glowColor.r},${glowColor.g},${glowColor.b},${alpha})`);
    gradient.addColorStop(0.15, `rgba(${glowColor.r},${glowColor.g},${glowColor.b},${alpha * 0.85})`);
    gradient.addColorStop(0.35, `rgba(${glowColor.r},${glowColor.g},${glowColor.b},${alpha * 0.55})`);
    gradient.addColorStop(0.55, `rgba(${glowColor.r},${glowColor.g},${glowColor.b},${alpha * 0.3})`);
    gradient.addColorStop(0.75, `rgba(${glowColor.r},${glowColor.g},${glowColor.b},${alpha * 0.12})`);
    gradient.addColorStop(1, `rgba(${glowColor.r},${glowColor.g},${glowColor.b},0)`);
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  const motionMq = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const reduced = () => !!(motionMq && motionMq.matches);

  function draw(timestamp) {
    raf = 0;
    if (!running) return;
    time = timestamp;
    ctx.fillStyle = bgFill;
    ctx.fillRect(0, 0, width, height);
    const gridUnit = Math.min(width, height) * 0.14;
    const orbRadius = gridUnit * 1.1;
    orbPositions.forEach((orb, i) => {
      drawOrb(
        centerX + orb.x * gridUnit,
        centerY + orb.y * gridUnit,
        orbRadius * orb.size,
        orb.brightness,
        i * 0.4,
      );
    });
    schedule();
  }

  function schedule() {
    if (!running || raf || reduced() || document.visibilityState === 'hidden') return;
    raf = requestAnimationFrame(draw);
  }

  function onResize() {
    resize();
    if (reduced()) draw(time);
  }

  function onVisibility() {
    if (document.visibilityState === 'hidden') {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
    } else {
      schedule();
    }
  }

  function onMotionChange() {
    if (reduced()) {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      draw(time);
    } else {
      schedule();
    }
  }

  resize();
  window.addEventListener('resize', onResize);
  document.addEventListener('visibilitychange', onVisibility);
  motionMq?.addEventListener?.('change', onMotionChange);
  if (reduced()) draw(0);
  else schedule();

  const ctrl = {
    stop() {
      running = false;
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      window.removeEventListener('resize', onResize);
      document.removeEventListener('visibilitychange', onVisibility);
      motionMq?.removeEventListener?.('change', onMotionChange);
      if (instance === ctrl) instance = null;
    },
    running: () => running,
    canvas,
  };
  instance = ctrl;
  if (typeof window !== 'undefined') window.__tnGlow = ctrl;
  return ctrl;
}

/** Stop the shared glow loop (used by the app shell on routes without it). */
export function stopGlowBg() {
  instance?.stop();
}

// Classic script tag / module side-effect boot
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => startGlowBg());
  } else {
    startGlowBg();
  }
}
