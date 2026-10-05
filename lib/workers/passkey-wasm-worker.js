// Dedicated Worker: passkey_wasm only. Do not import other bindgen crates here.
const WASM_PATHS = [
  '/pkg/passkey_wasm.js',
  '/public/wasm/passkey/passkey_wasm.js',
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
      if (typeof mod.generate_challenge !== 'function') throw new Error('passkey_wasm missing exports');
      wasm = mod;
      return wasm;
    } catch (e) {
      last = e;
    }
  }
  throw last || new Error('passkey-wasm not available');
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
    if (typeof f !== 'function') throw new Error(`passkey worker: unknown ${fn}`);
    const ret = f(...(args || []));
    self.postMessage({ id, ok: true, ret });
  } catch (e) {
    self.postMessage({ id, ok: false, error: e?.message || String(e) });
  }
};
