// Dedicated Worker: norick_wasm only.
const WASM_PATHS = [
  '/pkg/norick_wasm.js',
  '/public/wasm/norick/norick_wasm.js',
];

let wasm = null;

async function load() {
  if (wasm) return wasm;
  let last = null;
  for (const path of WASM_PATHS) {
    try {
      const mod = await import(/* @vite-ignore */ path);
      const init = mod.default;
      if (typeof init === 'function') {
        const wasmUrl = path.replace(/\.js$/, '_bg.wasm');
        try {
          await init({ module_or_path: wasmUrl });
        } catch {
          await init(wasmUrl);
        }
      }
      if (typeof mod.generate_proof !== 'function') throw new Error('norick_wasm missing generate_proof');
      wasm = mod;
      return wasm;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('norick-wasm not available');
}

self.onmessage = async (ev) => {
  const { id, fn, args } = ev.data || {};
  try {
    const mod = await load();
    if (fn === 'init') {
      self.postMessage({ id, ok: true, ret: true });
      return;
    }
    const f = mod[fn];
    if (typeof f !== 'function') throw new Error(`norick worker: unknown ${fn}`);
    let callArgs = args || [];
    if (fn === 'encode_proof_msg' && callArgs.length && typeof callArgs[0] !== 'bigint') {
      callArgs = [BigInt(callArgs[0]), ...callArgs.slice(1)];
    }
    const ret = f(...callArgs);
    self.postMessage({ id, ok: true, ret });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e?.message || String(e) });
  }
};
