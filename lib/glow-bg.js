// Shared ambient glow canvas — matches index / tabs / svg desks.
// Usage: <script src="/lib/glow-bg.js"></script>  (auto-starts)
// Or: import { startGlowBg } from '/lib/glow-bg.js'; startGlowBg();

const CANVAS_ID = 'glow-canvas';

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

  const glowColor = { r: 200, g: 255, b: 210 };

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

  function draw(timestamp) {
    if (!running) return;
    time = timestamp;
    ctx.fillStyle = '#000000';
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
    raf = requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  raf = requestAnimationFrame(draw);

  return {
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
    canvas,
  };
}

// Classic script tag / module side-effect boot
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => startGlowBg());
  } else {
    startGlowBg();
  }
}
