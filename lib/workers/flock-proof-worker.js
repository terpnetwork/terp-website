// Dedicated Worker: Flock BLAKE3 action-bind (no Halo2 / no bindgen clash).
// Proof layout matches zk-cosmwasm curves/flock.rs (FLCK / prover=3 / curve=7).

const DOMAIN = new TextEncoder().encode('terp-flock/v1');

async function loadBlake3() {
  const { blake3 } = await import('https://esm.sh/@noble/hashes@1.7.1/blake3.js');
  return blake3;
}

function concat(a, b) {
  const o = new Uint8Array(a.length + b.length);
  o.set(a, 0);
  o.set(b, a.length);
  return o;
}

function proveFlock(instances) {
  return loadBlake3().then((blake3) => {
    const inst = instances instanceof Uint8Array ? instances : new Uint8Array(instances);
    const act = blake3(inst);
    const dom = blake3(concat(DOMAIN, inst));
    const o = new Uint8Array(72);
    o.set([0x46, 0x4c, 0x43, 0x4b], 0); // FLCK
    o[4] = 3;
    o[5] = 7;
    o[6] = 1;
    o[7] = 0;
    o.set(act, 8);
    o.set(dom, 40);
    return o;
  });
}

function b64(bytes) {
  let s = '';
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]);
  return btoa(s);
}

self.onmessage = async (ev) => {
  const { id, fn, args } = ev.data || {};
  try {
    if (fn === 'init') {
      await loadBlake3();
      self.postMessage({ id, ok: true, ret: true });
      return;
    }
    if (fn === 'prove_flock') {
      const proof = await proveFlock(args[0]);
      self.postMessage({ id, ok: true, ret: { proof: Array.from(proof), proof_b64: b64(proof) } });
      return;
    }
    throw new Error(`flock worker: unknown ${fn}`);
  } catch (e) {
    self.postMessage({ id, ok: false, error: e?.message || String(e) });
  }
};
