/**
 * vis-mesh.js — shared GLSL network visualization mesh (modular hook)
 *
 * Security: canvas-only; no DOM injection of remote strings.
 * Topology "doctor" visualizer removed from IBC page; modules register here later
 * (ibc-wasm, crosslink, tactic, ibcv2, tailscale/passkey light clients, etc.).
 *
 * Usage:
 *   import { createMeshHost, registerMeshModule } from '/lib/vis-mesh.js';
 *   const host = createMeshHost(canvas);
 *   registerMeshModule('channels', { draw(ctx, frame) { ... } });
 *   host.start();
 */

const modules = new Map();

/**
 * @param {string} id
 * @param {{ draw?: Function, resize?: Function, dispose?: Function }} mod
 */
export function registerMeshModule(id, mod) {
  if (!id || typeof mod !== 'object') return;
  modules.set(id, mod);
}

export function unregisterMeshModule(id) {
  const m = modules.get(id);
  if (m?.dispose) try { m.dispose(); } catch { /* ignore */ }
  modules.delete(id);
}

/**
 * WebGL2 host with a minimal full-screen pass. Modules draw in 2d overlay or
 * custom GL programs later without rewriting the page shell.
 * @param {HTMLCanvasElement} canvas
 */
export function createMeshHost(canvas) {
  if (!canvas) throw new Error('vis-mesh: canvas required');

  let gl = null;
  let overlay = null;
  let raf = 0;
  let running = false;
  let program = null;
  // Field colour follows the site accent (global.css --tn-teal-rgb).
  let themeCol = [0.6, 0.91, 0.76];
  const readTheme = () => {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--tn-teal-rgb').trim().split(/[\s,]+/).map(Number);
    if (v.length === 3 && v.every(Number.isFinite)) themeCol = v.map((x) => x / 255);
  };
  readTheme();
  window.addEventListener('tn:theme', readTheme);

  function initGL() {
    gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'low-power',
    });
    if (!gl) return false;

    const vs = `#version 300 es
in vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }`;
    // Soft field — placeholder for network density / path heat maps
    const fs = `#version 300 es
precision mediump float;
uniform float u_t;
uniform vec2 u_res;
uniform vec3 u_col;
out vec4 o;
void main(){
  vec2 uv = gl_FragCoord.xy / u_res;
  float d = length(uv - 0.5);
  float pulse = 0.5 + 0.5 * sin(u_t * 0.6 + d * 8.0);
  float a = smoothstep(0.55, 0.0, d) * 0.12 * pulse;
  o = vec4(u_col, a);
}`;

    function compile(type, src) {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.warn('[vis-mesh] shader', gl.getShaderInfoLog(s));
        gl.deleteShader(s);
        return null;
      }
      return s;
    }

    const vsh = compile(gl.VERTEX_SHADER, vs);
    const fsh = compile(gl.FRAGMENT_SHADER, fs);
    if (!vsh || !fsh) return false;

    program = gl.createProgram();
    gl.attachShader(program, vsh);
    gl.attachShader(program, fsh);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('[vis-mesh] link', gl.getProgramInfoLog(program));
      return false;
    }

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(program, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    return true;
  }

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = canvas.clientWidth | 0;
    const h = canvas.clientHeight | 0;
    if (!w || !h) return;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
    for (const m of modules.values()) {
      if (m.resize) try { m.resize(w, h, dpr); } catch { /* ignore */ }
    }
  }

  function frame(t) {
    if (!running) return;
    if (gl && program) {
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniform1f(gl.getUniformLocation(program, 'u_t'), t * 0.001);
      gl.uniform2f(gl.getUniformLocation(program, 'u_res'), canvas.width, canvas.height);
      gl.uniform3f(gl.getUniformLocation(program, 'u_col'), themeCol[0], themeCol[1], themeCol[2]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    const ctx = {
      t,
      gl,
      canvas,
      modules: modules.keys(),
    };
    for (const m of modules.values()) {
      if (m.draw) try { m.draw(ctx); } catch (e) { console.warn('[vis-mesh] draw', e); }
    }
    raf = requestAnimationFrame(frame);
  }

  return {
    start() {
      if (running) return;
      resize();
      if (!gl) initGL();
      running = true;
      window.addEventListener('resize', resize);
      raf = requestAnimationFrame(frame);
    },
    stop() {
      running = false;
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
    },
    resize,
    get modules() {
      return modules;
    },
  };
}
