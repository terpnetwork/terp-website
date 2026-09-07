// Main-thread RPC to a dedicated wasm-bindgen Worker.
// Never instantiate two bindgen crates on the same global.

export function createWasmWorkerHost(workerUrl) {
  let worker = null;
  let seq = 0;
  const pending = new Map();

  function ensure() {
    if (worker) return worker;
    worker = new Worker(workerUrl, { type: 'module', name: workerUrl });
    worker.onmessage = (ev) => {
      const { id, ok, ret, error } = ev.data || {};
      const slot = pending.get(id);
      if (!slot) return;
      pending.delete(id);
      if (ok) slot.resolve(ret);
      else slot.reject(new Error(error || 'worker error'));
    };
    worker.onerror = (ev) => {
      const msg = ev.message || 'wasm worker failed';
      for (const slot of pending.values()) slot.reject(new Error(msg));
      pending.clear();
    };
    return worker;
  }

  return {
    url: workerUrl,
    async call(fn, args = []) {
      ensure();
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        worker.postMessage({ id, fn, args });
      });
    },
    terminate() {
      if (worker) worker.terminate();
      worker = null;
      pending.clear();
    },
  };
}
