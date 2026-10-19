var __getOwnPropNames = Object.getOwnPropertyNames;
var __commonJS = (cb, mod) => function __require() {
  return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
};

// node_modules/ajv/dist/runtime/ucs2length.js
var require_ucs2length = __commonJS({
  "node_modules/ajv/dist/runtime/ucs2length.js"(exports) {
    "use strict";
    Object.defineProperty(exports, "__esModule", { value: true });
    function ucs2length(str) {
      const len = str.length;
      let length = 0;
      let pos = 0;
      let value;
      while (pos < len) {
        length++;
        value = str.charCodeAt(pos++);
        if (value >= 55296 && value <= 56319 && pos < len) {
          value = str.charCodeAt(pos);
          if ((value & 64512) === 56320)
            pos++;
        }
      }
      return length;
    }
    exports.default = ucs2length;
    ucs2length.code = 'require("ajv/dist/runtime/ucs2length").default';
  }
});

// node_modules/@noble/hashes/esm/utils.js
function isBytes(a) {
  return a instanceof Uint8Array || ArrayBuffer.isView(a) && a.constructor.name === "Uint8Array";
}
function abytes(b, ...lengths) {
  if (!isBytes(b))
    throw new Error("Uint8Array expected");
  if (lengths.length > 0 && !lengths.includes(b.length))
    throw new Error("Uint8Array expected of length " + lengths + ", got length=" + b.length);
}
function aexists(instance, checkFinished = true) {
  if (instance.destroyed)
    throw new Error("Hash instance has been destroyed");
  if (checkFinished && instance.finished)
    throw new Error("Hash#digest() has already been called");
}
function aoutput(out, instance) {
  abytes(out);
  const min = instance.outputLen;
  if (out.length < min) {
    throw new Error("digestInto() expects output buffer of length at least " + min);
  }
}
function clean(...arrays) {
  for (let i = 0; i < arrays.length; i++) {
    arrays[i].fill(0);
  }
}
function createView(arr) {
  return new DataView(arr.buffer, arr.byteOffset, arr.byteLength);
}
function rotr(word, shift) {
  return word << 32 - shift | word >>> shift;
}
function utf8ToBytes(str) {
  if (typeof str !== "string")
    throw new Error("string expected");
  return new Uint8Array(new TextEncoder().encode(str));
}
function toBytes(data) {
  if (typeof data === "string")
    data = utf8ToBytes(data);
  abytes(data);
  return data;
}
var Hash = class {
};
function createHasher(hashCons) {
  const hashC = (msg) => hashCons().update(toBytes(msg)).digest();
  const tmp = hashCons();
  hashC.outputLen = tmp.outputLen;
  hashC.blockLen = tmp.blockLen;
  hashC.create = () => hashCons();
  return hashC;
}

// node_modules/@noble/hashes/esm/_md.js
function setBigUint64(view, byteOffset, value, isLE) {
  if (typeof view.setBigUint64 === "function")
    return view.setBigUint64(byteOffset, value, isLE);
  const _32n = BigInt(32);
  const _u32_max = BigInt(4294967295);
  const wh = Number(value >> _32n & _u32_max);
  const wl = Number(value & _u32_max);
  const h = isLE ? 4 : 0;
  const l = isLE ? 0 : 4;
  view.setUint32(byteOffset + h, wh, isLE);
  view.setUint32(byteOffset + l, wl, isLE);
}
function Chi(a, b, c) {
  return a & b ^ ~a & c;
}
function Maj(a, b, c) {
  return a & b ^ a & c ^ b & c;
}
var HashMD = class extends Hash {
  constructor(blockLen, outputLen, padOffset, isLE) {
    super();
    this.finished = false;
    this.length = 0;
    this.pos = 0;
    this.destroyed = false;
    this.blockLen = blockLen;
    this.outputLen = outputLen;
    this.padOffset = padOffset;
    this.isLE = isLE;
    this.buffer = new Uint8Array(blockLen);
    this.view = createView(this.buffer);
  }
  update(data) {
    aexists(this);
    data = toBytes(data);
    abytes(data);
    const { view, buffer, blockLen } = this;
    const len = data.length;
    for (let pos = 0; pos < len; ) {
      const take = Math.min(blockLen - this.pos, len - pos);
      if (take === blockLen) {
        const dataView = createView(data);
        for (; blockLen <= len - pos; pos += blockLen)
          this.process(dataView, pos);
        continue;
      }
      buffer.set(data.subarray(pos, pos + take), this.pos);
      this.pos += take;
      pos += take;
      if (this.pos === blockLen) {
        this.process(view, 0);
        this.pos = 0;
      }
    }
    this.length += data.length;
    this.roundClean();
    return this;
  }
  digestInto(out) {
    aexists(this);
    aoutput(out, this);
    this.finished = true;
    const { buffer, view, blockLen, isLE } = this;
    let { pos } = this;
    buffer[pos++] = 128;
    clean(this.buffer.subarray(pos));
    if (this.padOffset > blockLen - pos) {
      this.process(view, 0);
      pos = 0;
    }
    for (let i = pos; i < blockLen; i++)
      buffer[i] = 0;
    setBigUint64(view, blockLen - 8, BigInt(this.length * 8), isLE);
    this.process(view, 0);
    const oview = createView(out);
    const len = this.outputLen;
    if (len % 4)
      throw new Error("_sha2: outputLen should be aligned to 32bit");
    const outLen = len / 4;
    const state = this.get();
    if (outLen > state.length)
      throw new Error("_sha2: outputLen bigger than state");
    for (let i = 0; i < outLen; i++)
      oview.setUint32(4 * i, state[i], isLE);
  }
  digest() {
    const { buffer, outputLen } = this;
    this.digestInto(buffer);
    const res = buffer.slice(0, outputLen);
    this.destroy();
    return res;
  }
  _cloneInto(to) {
    to || (to = new this.constructor());
    to.set(...this.get());
    const { blockLen, buffer, length, finished, destroyed, pos } = this;
    to.destroyed = destroyed;
    to.finished = finished;
    to.length = length;
    to.pos = pos;
    if (length % blockLen)
      to.buffer.set(buffer);
    return to;
  }
  clone() {
    return this._cloneInto();
  }
};
var SHA256_IV = /* @__PURE__ */ Uint32Array.from([
  1779033703,
  3144134277,
  1013904242,
  2773480762,
  1359893119,
  2600822924,
  528734635,
  1541459225
]);

// node_modules/@noble/hashes/esm/sha2.js
var SHA256_K = /* @__PURE__ */ Uint32Array.from([
  1116352408,
  1899447441,
  3049323471,
  3921009573,
  961987163,
  1508970993,
  2453635748,
  2870763221,
  3624381080,
  310598401,
  607225278,
  1426881987,
  1925078388,
  2162078206,
  2614888103,
  3248222580,
  3835390401,
  4022224774,
  264347078,
  604807628,
  770255983,
  1249150122,
  1555081692,
  1996064986,
  2554220882,
  2821834349,
  2952996808,
  3210313671,
  3336571891,
  3584528711,
  113926993,
  338241895,
  666307205,
  773529912,
  1294757372,
  1396182291,
  1695183700,
  1986661051,
  2177026350,
  2456956037,
  2730485921,
  2820302411,
  3259730800,
  3345764771,
  3516065817,
  3600352804,
  4094571909,
  275423344,
  430227734,
  506948616,
  659060556,
  883997877,
  958139571,
  1322822218,
  1537002063,
  1747873779,
  1955562222,
  2024104815,
  2227730452,
  2361852424,
  2428436474,
  2756734187,
  3204031479,
  3329325298
]);
var SHA256_W = /* @__PURE__ */ new Uint32Array(64);
var SHA256 = class extends HashMD {
  constructor(outputLen = 32) {
    super(64, outputLen, 8, false);
    this.A = SHA256_IV[0] | 0;
    this.B = SHA256_IV[1] | 0;
    this.C = SHA256_IV[2] | 0;
    this.D = SHA256_IV[3] | 0;
    this.E = SHA256_IV[4] | 0;
    this.F = SHA256_IV[5] | 0;
    this.G = SHA256_IV[6] | 0;
    this.H = SHA256_IV[7] | 0;
  }
  get() {
    const { A, B, C, D, E, F, G, H } = this;
    return [A, B, C, D, E, F, G, H];
  }
  // prettier-ignore
  set(A, B, C, D, E, F, G, H) {
    this.A = A | 0;
    this.B = B | 0;
    this.C = C | 0;
    this.D = D | 0;
    this.E = E | 0;
    this.F = F | 0;
    this.G = G | 0;
    this.H = H | 0;
  }
  process(view, offset) {
    for (let i = 0; i < 16; i++, offset += 4)
      SHA256_W[i] = view.getUint32(offset, false);
    for (let i = 16; i < 64; i++) {
      const W15 = SHA256_W[i - 15];
      const W2 = SHA256_W[i - 2];
      const s0 = rotr(W15, 7) ^ rotr(W15, 18) ^ W15 >>> 3;
      const s1 = rotr(W2, 17) ^ rotr(W2, 19) ^ W2 >>> 10;
      SHA256_W[i] = s1 + SHA256_W[i - 7] + s0 + SHA256_W[i - 16] | 0;
    }
    let { A, B, C, D, E, F, G, H } = this;
    for (let i = 0; i < 64; i++) {
      const sigma1 = rotr(E, 6) ^ rotr(E, 11) ^ rotr(E, 25);
      const T1 = H + sigma1 + Chi(E, F, G) + SHA256_K[i] + SHA256_W[i] | 0;
      const sigma0 = rotr(A, 2) ^ rotr(A, 13) ^ rotr(A, 22);
      const T2 = sigma0 + Maj(A, B, C) | 0;
      H = G;
      G = F;
      F = E;
      E = D + T1 | 0;
      D = C;
      C = B;
      B = A;
      A = T1 + T2 | 0;
    }
    A = A + this.A | 0;
    B = B + this.B | 0;
    C = C + this.C | 0;
    D = D + this.D | 0;
    E = E + this.E | 0;
    F = F + this.F | 0;
    G = G + this.G | 0;
    H = H + this.H | 0;
    this.set(A, B, C, D, E, F, G, H);
  }
  roundClean() {
    clean(SHA256_W);
  }
  destroy() {
    this.set(0, 0, 0, 0, 0, 0, 0, 0);
    clean(this.buffer);
  }
};
var sha256 = /* @__PURE__ */ createHasher(() => new SHA256());

// node_modules/@noble/hashes/esm/sha256.js
var sha2562 = sha256;

// ../validators.gen.mjs
var validateDetailsSchema = validate20;
var schema31 = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://terp.network/schemas/terp-bounty-details/v1.json", "title": "terp-bounty-details/v1", "description": "Full off-chain details of a Terp bounty. The escrow stores only title, summary and details_hash = sha256 of this document's canonical bytes (lib.mjs canonicalBytes); details_cid (optional) points at the same bytes on IPFS. Rewards are 'proposed, pending vote'.", "type": "object", "additionalProperties": false, "required": ["schema", "bounty_ref", "title", "summary", "category", "tier", "priority", "acceptance_criteria", "evidence_required", "deadline", "reward_quote"], "properties": { "schema": { "const": "terp-bounty-details/v1" }, "bounty_ref": { "type": "string", "minLength": 1, "maxLength": 64, "pattern": "^[A-Za-z0-9._:-]+$", "description": "Backend Bounty.id; equals the escrow bounty_ref." }, "title": { "type": "string", "minLength": 1, "maxLength": 140, "pattern": "^[^\\u0000-\\u001f\\u007f]*$" }, "summary": { "type": "string", "minLength": 1, "maxLength": 280, "pattern": "^[^\\u0000-\\u001f\\u007f]*$", "description": "At most 280 BYTES of UTF-8 (the escrow's SUMMARY_MAX_BYTES), no control characters. JSON Schema counts characters, so validators add a byte check (lib.mjs utf8Bytes)." }, "description": { "type": "string", "maxLength": 2e4 }, "category": { "enum": ["apps", "ibc", "protocol", "docs", "ops", "contracts", "community", "partners", "liquidity"], "description": "The nine v3 categories." }, "capabilities": { "type": "array", "maxItems": 24, "uniqueItems": true, "items": { "type": "string", "pattern": "^[a-z0-9][a-z0-9 ._+#/-]{0,47}$" }, "description": "Derived from catalog skills (+ free tags)." }, "tier": { "enum": ["T1", "T2", "T3", "T4", "T5"] }, "priority": { "enum": ["P0", "P1", "P2", "P3"] }, "acceptance_criteria": { "type": "array", "minItems": 1, "maxItems": 50, "items": { "type": "string", "minLength": 1, "maxLength": 500 } }, "evidence_required": { "type": "array", "minItems": 1, "maxItems": 20, "items": { "type": "string", "minLength": 1, "maxLength": 300 } }, "deadline": { "type": "string", "pattern": "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$" }, "reward_quote": { "type": "object", "additionalProperties": false, "required": ["asset", "denom", "amount", "label"], "properties": { "asset": { "enum": ["TERP", "THIOL"] }, "denom": { "enum": ["uterp", "uthiol"] }, "amount": { "type": "string", "pattern": "^[1-9][0-9]{0,30}$", "description": "micro-denom integer" }, "work_units": { "type": "string", "pattern": "^[0-9]+(\\.[0-9]+)?$" }, "params_version": { "type": "string", "maxLength": 128 }, "label": { "const": "proposed, pending vote" } } }, "proposer": { "type": "string", "pattern": "^terp1[02-9ac-hj-np-z]{38,58}$" }, "links": { "type": "array", "maxItems": 20, "items": { "type": "object", "additionalProperties": false, "required": ["uri"], "properties": { "label": { "type": "string", "maxLength": 80 }, "uri": { "type": "string", "pattern": "^(https://|ipfs://)[^\\s]{1,2040}$" } } } }, "created_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$" } } };
var func1 = Object.prototype.hasOwnProperty;
var func2 = require_ucs2length().default;
var pattern4 = new RegExp("^[A-Za-z0-9._:-]+$", "u");
var pattern5 = new RegExp("^[^\\u0000-\\u001f\\u007f]*$", "u");
var pattern7 = new RegExp("^[a-z0-9][a-z0-9 ._+#/-]{0,47}$", "u");
var pattern8 = new RegExp("^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$", "u");
var pattern9 = new RegExp("^[1-9][0-9]{0,30}$", "u");
var pattern10 = new RegExp("^[0-9]+(\\.[0-9]+)?$", "u");
var pattern11 = new RegExp("^terp1[02-9ac-hj-np-z]{38,58}$", "u");
var pattern12 = new RegExp("^(https://|ipfs://)[^\\s]{1,2040}$", "u");
var pattern13 = new RegExp("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$", "u");
function validate20(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate20.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.schema === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schema" }, message: "must have required property 'schema'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.bounty_ref === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "bounty_ref" }, message: "must have required property 'bounty_ref'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.title === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "title" }, message: "must have required property 'title'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.summary === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.category === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "category" }, message: "must have required property 'category'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.tier === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "tier" }, message: "must have required property 'tier'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.priority === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "priority" }, message: "must have required property 'priority'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.acceptance_criteria === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "acceptance_criteria" }, message: "must have required property 'acceptance_criteria'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    if (data.evidence_required === void 0) {
      const err8 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidence_required" }, message: "must have required property 'evidence_required'" };
      if (vErrors === null) {
        vErrors = [err8];
      } else {
        vErrors.push(err8);
      }
      errors++;
    }
    if (data.deadline === void 0) {
      const err9 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "deadline" }, message: "must have required property 'deadline'" };
      if (vErrors === null) {
        vErrors = [err9];
      } else {
        vErrors.push(err9);
      }
      errors++;
    }
    if (data.reward_quote === void 0) {
      const err10 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "reward_quote" }, message: "must have required property 'reward_quote'" };
      if (vErrors === null) {
        vErrors = [err10];
      } else {
        vErrors.push(err10);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema31.properties, key0)) {
        const err11 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err11];
        } else {
          vErrors.push(err11);
        }
        errors++;
      }
    }
    if (data.schema !== void 0) {
      if ("terp-bounty-details/v1" !== data.schema) {
        const err12 = { instancePath: instancePath + "/schema", schemaPath: "#/properties/schema/const", keyword: "const", params: { allowedValue: "terp-bounty-details/v1" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err12];
        } else {
          vErrors.push(err12);
        }
        errors++;
      }
    }
    if (data.bounty_ref !== void 0) {
      let data1 = data.bounty_ref;
      if (typeof data1 === "string") {
        if (func2(data1) > 64) {
          const err13 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
          if (vErrors === null) {
            vErrors = [err13];
          } else {
            vErrors.push(err13);
          }
          errors++;
        }
        if (func2(data1) < 1) {
          const err14 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (!pattern4.test(data1)) {
          const err15 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9._:-]+$" }, message: 'must match pattern "^[A-Za-z0-9._:-]+$"' };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
      } else {
        const err16 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err16];
        } else {
          vErrors.push(err16);
        }
        errors++;
      }
    }
    if (data.title !== void 0) {
      let data2 = data.title;
      if (typeof data2 === "string") {
        if (func2(data2) > 140) {
          const err17 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/maxLength", keyword: "maxLength", params: { limit: 140 }, message: "must NOT have more than 140 characters" };
          if (vErrors === null) {
            vErrors = [err17];
          } else {
            vErrors.push(err17);
          }
          errors++;
        }
        if (func2(data2) < 1) {
          const err18 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err18];
          } else {
            vErrors.push(err18);
          }
          errors++;
        }
        if (!pattern5.test(data2)) {
          const err19 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/pattern", keyword: "pattern", params: { pattern: "^[^\\u0000-\\u001f\\u007f]*$" }, message: 'must match pattern "^[^\\u0000-\\u001f\\u007f]*$"' };
          if (vErrors === null) {
            vErrors = [err19];
          } else {
            vErrors.push(err19);
          }
          errors++;
        }
      } else {
        const err20 = { instancePath: instancePath + "/title", schemaPath: "#/properties/title/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err20];
        } else {
          vErrors.push(err20);
        }
        errors++;
      }
    }
    if (data.summary !== void 0) {
      let data3 = data.summary;
      if (typeof data3 === "string") {
        if (func2(data3) > 280) {
          const err21 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/maxLength", keyword: "maxLength", params: { limit: 280 }, message: "must NOT have more than 280 characters" };
          if (vErrors === null) {
            vErrors = [err21];
          } else {
            vErrors.push(err21);
          }
          errors++;
        }
        if (func2(data3) < 1) {
          const err22 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err22];
          } else {
            vErrors.push(err22);
          }
          errors++;
        }
        if (!pattern5.test(data3)) {
          const err23 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/pattern", keyword: "pattern", params: { pattern: "^[^\\u0000-\\u001f\\u007f]*$" }, message: 'must match pattern "^[^\\u0000-\\u001f\\u007f]*$"' };
          if (vErrors === null) {
            vErrors = [err23];
          } else {
            vErrors.push(err23);
          }
          errors++;
        }
      } else {
        const err24 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.description !== void 0) {
      let data4 = data.description;
      if (typeof data4 === "string") {
        if (func2(data4) > 2e4) {
          const err25 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/maxLength", keyword: "maxLength", params: { limit: 2e4 }, message: "must NOT have more than 20000 characters" };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      } else {
        const err26 = { instancePath: instancePath + "/description", schemaPath: "#/properties/description/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.category !== void 0) {
      let data5 = data.category;
      if (!(data5 === "apps" || data5 === "ibc" || data5 === "protocol" || data5 === "docs" || data5 === "ops" || data5 === "contracts" || data5 === "community" || data5 === "partners" || data5 === "liquidity")) {
        const err27 = { instancePath: instancePath + "/category", schemaPath: "#/properties/category/enum", keyword: "enum", params: { allowedValues: schema31.properties.category.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err27];
        } else {
          vErrors.push(err27);
        }
        errors++;
      }
    }
    if (data.capabilities !== void 0) {
      let data6 = data.capabilities;
      if (Array.isArray(data6)) {
        if (data6.length > 24) {
          const err28 = { instancePath: instancePath + "/capabilities", schemaPath: "#/properties/capabilities/maxItems", keyword: "maxItems", params: { limit: 24 }, message: "must NOT have more than 24 items" };
          if (vErrors === null) {
            vErrors = [err28];
          } else {
            vErrors.push(err28);
          }
          errors++;
        }
        const len0 = data6.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data7 = data6[i0];
          if (typeof data7 === "string") {
            if (!pattern7.test(data7)) {
              const err29 = { instancePath: instancePath + "/capabilities/" + i0, schemaPath: "#/properties/capabilities/items/pattern", keyword: "pattern", params: { pattern: "^[a-z0-9][a-z0-9 ._+#/-]{0,47}$" }, message: 'must match pattern "^[a-z0-9][a-z0-9 ._+#/-]{0,47}$"' };
              if (vErrors === null) {
                vErrors = [err29];
              } else {
                vErrors.push(err29);
              }
              errors++;
            }
          } else {
            const err30 = { instancePath: instancePath + "/capabilities/" + i0, schemaPath: "#/properties/capabilities/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err30];
            } else {
              vErrors.push(err30);
            }
            errors++;
          }
        }
        let i1 = data6.length;
        let j0;
        if (i1 > 1) {
          const indices0 = {};
          for (; i1--; ) {
            let item0 = data6[i1];
            if (typeof item0 !== "string") {
              continue;
            }
            if (typeof indices0[item0] == "number") {
              j0 = indices0[item0];
              const err31 = { instancePath: instancePath + "/capabilities", schemaPath: "#/properties/capabilities/uniqueItems", keyword: "uniqueItems", params: { i: i1, j: j0 }, message: "must NOT have duplicate items (items ## " + j0 + " and " + i1 + " are identical)" };
              if (vErrors === null) {
                vErrors = [err31];
              } else {
                vErrors.push(err31);
              }
              errors++;
              break;
            }
            indices0[item0] = i1;
          }
        }
      } else {
        const err32 = { instancePath: instancePath + "/capabilities", schemaPath: "#/properties/capabilities/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.tier !== void 0) {
      let data8 = data.tier;
      if (!(data8 === "T1" || data8 === "T2" || data8 === "T3" || data8 === "T4" || data8 === "T5")) {
        const err33 = { instancePath: instancePath + "/tier", schemaPath: "#/properties/tier/enum", keyword: "enum", params: { allowedValues: schema31.properties.tier.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err33];
        } else {
          vErrors.push(err33);
        }
        errors++;
      }
    }
    if (data.priority !== void 0) {
      let data9 = data.priority;
      if (!(data9 === "P0" || data9 === "P1" || data9 === "P2" || data9 === "P3")) {
        const err34 = { instancePath: instancePath + "/priority", schemaPath: "#/properties/priority/enum", keyword: "enum", params: { allowedValues: schema31.properties.priority.enum }, message: "must be equal to one of the allowed values" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.acceptance_criteria !== void 0) {
      let data10 = data.acceptance_criteria;
      if (Array.isArray(data10)) {
        if (data10.length > 50) {
          const err35 = { instancePath: instancePath + "/acceptance_criteria", schemaPath: "#/properties/acceptance_criteria/maxItems", keyword: "maxItems", params: { limit: 50 }, message: "must NOT have more than 50 items" };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        if (data10.length < 1) {
          const err36 = { instancePath: instancePath + "/acceptance_criteria", schemaPath: "#/properties/acceptance_criteria/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err36];
          } else {
            vErrors.push(err36);
          }
          errors++;
        }
        const len1 = data10.length;
        for (let i2 = 0; i2 < len1; i2++) {
          let data11 = data10[i2];
          if (typeof data11 === "string") {
            if (func2(data11) > 500) {
              const err37 = { instancePath: instancePath + "/acceptance_criteria/" + i2, schemaPath: "#/properties/acceptance_criteria/items/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (func2(data11) < 1) {
              const err38 = { instancePath: instancePath + "/acceptance_criteria/" + i2, schemaPath: "#/properties/acceptance_criteria/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
          } else {
            const err39 = { instancePath: instancePath + "/acceptance_criteria/" + i2, schemaPath: "#/properties/acceptance_criteria/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err39];
            } else {
              vErrors.push(err39);
            }
            errors++;
          }
        }
      } else {
        const err40 = { instancePath: instancePath + "/acceptance_criteria", schemaPath: "#/properties/acceptance_criteria/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err40];
        } else {
          vErrors.push(err40);
        }
        errors++;
      }
    }
    if (data.evidence_required !== void 0) {
      let data12 = data.evidence_required;
      if (Array.isArray(data12)) {
        if (data12.length > 20) {
          const err41 = { instancePath: instancePath + "/evidence_required", schemaPath: "#/properties/evidence_required/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" };
          if (vErrors === null) {
            vErrors = [err41];
          } else {
            vErrors.push(err41);
          }
          errors++;
        }
        if (data12.length < 1) {
          const err42 = { instancePath: instancePath + "/evidence_required", schemaPath: "#/properties/evidence_required/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err42];
          } else {
            vErrors.push(err42);
          }
          errors++;
        }
        const len2 = data12.length;
        for (let i3 = 0; i3 < len2; i3++) {
          let data13 = data12[i3];
          if (typeof data13 === "string") {
            if (func2(data13) > 300) {
              const err43 = { instancePath: instancePath + "/evidence_required/" + i3, schemaPath: "#/properties/evidence_required/items/maxLength", keyword: "maxLength", params: { limit: 300 }, message: "must NOT have more than 300 characters" };
              if (vErrors === null) {
                vErrors = [err43];
              } else {
                vErrors.push(err43);
              }
              errors++;
            }
            if (func2(data13) < 1) {
              const err44 = { instancePath: instancePath + "/evidence_required/" + i3, schemaPath: "#/properties/evidence_required/items/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
              if (vErrors === null) {
                vErrors = [err44];
              } else {
                vErrors.push(err44);
              }
              errors++;
            }
          } else {
            const err45 = { instancePath: instancePath + "/evidence_required/" + i3, schemaPath: "#/properties/evidence_required/items/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err45];
            } else {
              vErrors.push(err45);
            }
            errors++;
          }
        }
      } else {
        const err46 = { instancePath: instancePath + "/evidence_required", schemaPath: "#/properties/evidence_required/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err46];
        } else {
          vErrors.push(err46);
        }
        errors++;
      }
    }
    if (data.deadline !== void 0) {
      let data14 = data.deadline;
      if (typeof data14 === "string") {
        if (!pattern8.test(data14)) {
          const err47 = { instancePath: instancePath + "/deadline", schemaPath: "#/properties/deadline/pattern", keyword: "pattern", params: { pattern: "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$" }, message: 'must match pattern "^\\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\\d|3[01])$"' };
          if (vErrors === null) {
            vErrors = [err47];
          } else {
            vErrors.push(err47);
          }
          errors++;
        }
      } else {
        const err48 = { instancePath: instancePath + "/deadline", schemaPath: "#/properties/deadline/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err48];
        } else {
          vErrors.push(err48);
        }
        errors++;
      }
    }
    if (data.reward_quote !== void 0) {
      let data15 = data.reward_quote;
      if (data15 && typeof data15 == "object" && !Array.isArray(data15)) {
        if (data15.asset === void 0) {
          const err49 = { instancePath: instancePath + "/reward_quote", schemaPath: "#/properties/reward_quote/required", keyword: "required", params: { missingProperty: "asset" }, message: "must have required property 'asset'" };
          if (vErrors === null) {
            vErrors = [err49];
          } else {
            vErrors.push(err49);
          }
          errors++;
        }
        if (data15.denom === void 0) {
          const err50 = { instancePath: instancePath + "/reward_quote", schemaPath: "#/properties/reward_quote/required", keyword: "required", params: { missingProperty: "denom" }, message: "must have required property 'denom'" };
          if (vErrors === null) {
            vErrors = [err50];
          } else {
            vErrors.push(err50);
          }
          errors++;
        }
        if (data15.amount === void 0) {
          const err51 = { instancePath: instancePath + "/reward_quote", schemaPath: "#/properties/reward_quote/required", keyword: "required", params: { missingProperty: "amount" }, message: "must have required property 'amount'" };
          if (vErrors === null) {
            vErrors = [err51];
          } else {
            vErrors.push(err51);
          }
          errors++;
        }
        if (data15.label === void 0) {
          const err52 = { instancePath: instancePath + "/reward_quote", schemaPath: "#/properties/reward_quote/required", keyword: "required", params: { missingProperty: "label" }, message: "must have required property 'label'" };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
        for (const key1 in data15) {
          if (!(key1 === "asset" || key1 === "denom" || key1 === "amount" || key1 === "work_units" || key1 === "params_version" || key1 === "label")) {
            const err53 = { instancePath: instancePath + "/reward_quote", schemaPath: "#/properties/reward_quote/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err53];
            } else {
              vErrors.push(err53);
            }
            errors++;
          }
        }
        if (data15.asset !== void 0) {
          let data16 = data15.asset;
          if (!(data16 === "TERP" || data16 === "THIOL")) {
            const err54 = { instancePath: instancePath + "/reward_quote/asset", schemaPath: "#/properties/reward_quote/properties/asset/enum", keyword: "enum", params: { allowedValues: schema31.properties.reward_quote.properties.asset.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err54];
            } else {
              vErrors.push(err54);
            }
            errors++;
          }
        }
        if (data15.denom !== void 0) {
          let data17 = data15.denom;
          if (!(data17 === "uterp" || data17 === "uthiol")) {
            const err55 = { instancePath: instancePath + "/reward_quote/denom", schemaPath: "#/properties/reward_quote/properties/denom/enum", keyword: "enum", params: { allowedValues: schema31.properties.reward_quote.properties.denom.enum }, message: "must be equal to one of the allowed values" };
            if (vErrors === null) {
              vErrors = [err55];
            } else {
              vErrors.push(err55);
            }
            errors++;
          }
        }
        if (data15.amount !== void 0) {
          let data18 = data15.amount;
          if (typeof data18 === "string") {
            if (!pattern9.test(data18)) {
              const err56 = { instancePath: instancePath + "/reward_quote/amount", schemaPath: "#/properties/reward_quote/properties/amount/pattern", keyword: "pattern", params: { pattern: "^[1-9][0-9]{0,30}$" }, message: 'must match pattern "^[1-9][0-9]{0,30}$"' };
              if (vErrors === null) {
                vErrors = [err56];
              } else {
                vErrors.push(err56);
              }
              errors++;
            }
          } else {
            const err57 = { instancePath: instancePath + "/reward_quote/amount", schemaPath: "#/properties/reward_quote/properties/amount/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err57];
            } else {
              vErrors.push(err57);
            }
            errors++;
          }
        }
        if (data15.work_units !== void 0) {
          let data19 = data15.work_units;
          if (typeof data19 === "string") {
            if (!pattern10.test(data19)) {
              const err58 = { instancePath: instancePath + "/reward_quote/work_units", schemaPath: "#/properties/reward_quote/properties/work_units/pattern", keyword: "pattern", params: { pattern: "^[0-9]+(\\.[0-9]+)?$" }, message: 'must match pattern "^[0-9]+(\\.[0-9]+)?$"' };
              if (vErrors === null) {
                vErrors = [err58];
              } else {
                vErrors.push(err58);
              }
              errors++;
            }
          } else {
            const err59 = { instancePath: instancePath + "/reward_quote/work_units", schemaPath: "#/properties/reward_quote/properties/work_units/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err59];
            } else {
              vErrors.push(err59);
            }
            errors++;
          }
        }
        if (data15.params_version !== void 0) {
          let data20 = data15.params_version;
          if (typeof data20 === "string") {
            if (func2(data20) > 128) {
              const err60 = { instancePath: instancePath + "/reward_quote/params_version", schemaPath: "#/properties/reward_quote/properties/params_version/maxLength", keyword: "maxLength", params: { limit: 128 }, message: "must NOT have more than 128 characters" };
              if (vErrors === null) {
                vErrors = [err60];
              } else {
                vErrors.push(err60);
              }
              errors++;
            }
          } else {
            const err61 = { instancePath: instancePath + "/reward_quote/params_version", schemaPath: "#/properties/reward_quote/properties/params_version/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err61];
            } else {
              vErrors.push(err61);
            }
            errors++;
          }
        }
        if (data15.label !== void 0) {
          if ("proposed, pending vote" !== data15.label) {
            const err62 = { instancePath: instancePath + "/reward_quote/label", schemaPath: "#/properties/reward_quote/properties/label/const", keyword: "const", params: { allowedValue: "proposed, pending vote" }, message: "must be equal to constant" };
            if (vErrors === null) {
              vErrors = [err62];
            } else {
              vErrors.push(err62);
            }
            errors++;
          }
        }
      } else {
        const err63 = { instancePath: instancePath + "/reward_quote", schemaPath: "#/properties/reward_quote/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err63];
        } else {
          vErrors.push(err63);
        }
        errors++;
      }
    }
    if (data.proposer !== void 0) {
      let data22 = data.proposer;
      if (typeof data22 === "string") {
        if (!pattern11.test(data22)) {
          const err64 = { instancePath: instancePath + "/proposer", schemaPath: "#/properties/proposer/pattern", keyword: "pattern", params: { pattern: "^terp1[02-9ac-hj-np-z]{38,58}$" }, message: 'must match pattern "^terp1[02-9ac-hj-np-z]{38,58}$"' };
          if (vErrors === null) {
            vErrors = [err64];
          } else {
            vErrors.push(err64);
          }
          errors++;
        }
      } else {
        const err65 = { instancePath: instancePath + "/proposer", schemaPath: "#/properties/proposer/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
    }
    if (data.links !== void 0) {
      let data23 = data.links;
      if (Array.isArray(data23)) {
        if (data23.length > 20) {
          const err66 = { instancePath: instancePath + "/links", schemaPath: "#/properties/links/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" };
          if (vErrors === null) {
            vErrors = [err66];
          } else {
            vErrors.push(err66);
          }
          errors++;
        }
        const len3 = data23.length;
        for (let i4 = 0; i4 < len3; i4++) {
          let data24 = data23[i4];
          if (data24 && typeof data24 == "object" && !Array.isArray(data24)) {
            if (data24.uri === void 0) {
              const err67 = { instancePath: instancePath + "/links/" + i4, schemaPath: "#/properties/links/items/required", keyword: "required", params: { missingProperty: "uri" }, message: "must have required property 'uri'" };
              if (vErrors === null) {
                vErrors = [err67];
              } else {
                vErrors.push(err67);
              }
              errors++;
            }
            for (const key2 in data24) {
              if (!(key2 === "label" || key2 === "uri")) {
                const err68 = { instancePath: instancePath + "/links/" + i4, schemaPath: "#/properties/links/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err68];
                } else {
                  vErrors.push(err68);
                }
                errors++;
              }
            }
            if (data24.label !== void 0) {
              let data25 = data24.label;
              if (typeof data25 === "string") {
                if (func2(data25) > 80) {
                  const err69 = { instancePath: instancePath + "/links/" + i4 + "/label", schemaPath: "#/properties/links/items/properties/label/maxLength", keyword: "maxLength", params: { limit: 80 }, message: "must NOT have more than 80 characters" };
                  if (vErrors === null) {
                    vErrors = [err69];
                  } else {
                    vErrors.push(err69);
                  }
                  errors++;
                }
              } else {
                const err70 = { instancePath: instancePath + "/links/" + i4 + "/label", schemaPath: "#/properties/links/items/properties/label/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err70];
                } else {
                  vErrors.push(err70);
                }
                errors++;
              }
            }
            if (data24.uri !== void 0) {
              let data26 = data24.uri;
              if (typeof data26 === "string") {
                if (!pattern12.test(data26)) {
                  const err71 = { instancePath: instancePath + "/links/" + i4 + "/uri", schemaPath: "#/properties/links/items/properties/uri/pattern", keyword: "pattern", params: { pattern: "^(https://|ipfs://)[^\\s]{1,2040}$" }, message: 'must match pattern "^(https://|ipfs://)[^\\s]{1,2040}$"' };
                  if (vErrors === null) {
                    vErrors = [err71];
                  } else {
                    vErrors.push(err71);
                  }
                  errors++;
                }
              } else {
                const err72 = { instancePath: instancePath + "/links/" + i4 + "/uri", schemaPath: "#/properties/links/items/properties/uri/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err72];
                } else {
                  vErrors.push(err72);
                }
                errors++;
              }
            }
          } else {
            const err73 = { instancePath: instancePath + "/links/" + i4, schemaPath: "#/properties/links/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err73];
            } else {
              vErrors.push(err73);
            }
            errors++;
          }
        }
      } else {
        const err74 = { instancePath: instancePath + "/links", schemaPath: "#/properties/links/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err74];
        } else {
          vErrors.push(err74);
        }
        errors++;
      }
    }
    if (data.created_at !== void 0) {
      let data27 = data.created_at;
      if (typeof data27 === "string") {
        if (!pattern13.test(data27)) {
          const err75 = { instancePath: instancePath + "/created_at", schemaPath: "#/properties/created_at/pattern", keyword: "pattern", params: { pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$" }, message: 'must match pattern "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"' };
          if (vErrors === null) {
            vErrors = [err75];
          } else {
            vErrors.push(err75);
          }
          errors++;
        }
      } else {
        const err76 = { instancePath: instancePath + "/created_at", schemaPath: "#/properties/created_at/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err76];
        } else {
          vErrors.push(err76);
        }
        errors++;
      }
    }
  } else {
    const err77 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err77];
    } else {
      vErrors.push(err77);
    }
    errors++;
  }
  validate20.errors = vErrors;
  return errors === 0;
}
validate20.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };
var validateSubmissionSchema = validate21;
var schema32 = { "$schema": "https://json-schema.org/draft/2020-12/schema", "$id": "https://terp.network/schemas/terp-bounty-submission/v1.json", "title": "terp-bounty-submission/v1", "description": "A work submission for an escrowed Terp bounty. Pinned to IPFS; the assignee signs submit{submission_hash = sha256(exact bytes), cid}. The backend fetches the bytes by CID, re-hashes, validates this schema and cross-checks bounty_ref / escrow / submitter against the chain event.", "type": "object", "additionalProperties": false, "required": ["schema", "bounty_ref", "escrow", "submitter", "summary", "evidence", "acceptance", "submitted_at"], "properties": { "schema": { "const": "terp-bounty-submission/v1" }, "bounty_ref": { "type": "string", "minLength": 1, "maxLength": 64, "pattern": "^[A-Za-z0-9._:-]+$" }, "escrow": { "type": "object", "additionalProperties": false, "required": ["chain_id", "contract", "bounty_id"], "properties": { "chain_id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9-]{1,48}$" }, "contract": { "type": "string", "pattern": "^terp1[02-9ac-hj-np-z]{38,58}$" }, "bounty_id": { "type": "integer", "minimum": 1 } } }, "submitter": { "type": "string", "pattern": "^terp1[02-9ac-hj-np-z]{38,58}$", "description": "Must equal the signer of the submit tx (the assignee)." }, "payout_wallet": { "type": "string", "pattern": "^terp1[02-9ac-hj-np-z]{38,58}$", "description": "Informational; the escrow always pays the assignee." }, "summary": { "type": "string", "minLength": 1, "maxLength": 280, "pattern": "^[^\\u0000-\\u001f\\u007f]*$", "description": "At most 280 BYTES of UTF-8 (the escrow's SUMMARY_MAX_BYTES), no control characters. JSON Schema counts characters, so validators add a byte check (lib.mjs utf8Bytes)." }, "notes": { "type": "string", "maxLength": 1e4 }, "evidence": { "type": "array", "minItems": 1, "maxItems": 20, "items": { "type": "object", "additionalProperties": false, "required": ["kind", "uri"], "properties": { "kind": { "enum": ["pr", "commit", "tx", "url", "ipfs", "file", "report", "video"] }, "uri": { "type": "string", "pattern": "^(https://|ipfs://)[^\\s]{1,2040}$" }, "sha256": { "type": "string", "pattern": "^[0-9a-f]{64}$" }, "cid": { "type": "string", "pattern": "^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{7,127})$" }, "note": { "type": "string", "maxLength": 500 } } } }, "acceptance": { "type": "array", "minItems": 1, "maxItems": 50, "items": { "type": "object", "additionalProperties": false, "required": ["criterion", "met"], "properties": { "criterion": { "type": "string", "minLength": 1, "maxLength": 500 }, "met": { "type": "boolean" }, "evidence": { "type": "array", "maxItems": 20, "items": { "type": "integer", "minimum": 0 } } } } }, "details_hash": { "type": "string", "pattern": "^[0-9a-f]{64}$", "description": "The bounty's details_hash this submission answers." }, "submitted_at": { "type": "string", "pattern": "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$" } } };
var pattern15 = new RegExp("^[a-z0-9][a-z0-9-]{1,48}$", "u");
var pattern21 = new RegExp("^[0-9a-f]{64}$", "u");
var pattern22 = new RegExp("^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{7,127})$", "u");
function validate21(data, { instancePath = "", parentData, parentDataProperty, rootData = data, dynamicAnchors = {} } = {}) {
  ;
  let vErrors = null;
  let errors = 0;
  const evaluated0 = validate21.evaluated;
  if (evaluated0.dynamicProps) {
    evaluated0.props = void 0;
  }
  if (evaluated0.dynamicItems) {
    evaluated0.items = void 0;
  }
  if (data && typeof data == "object" && !Array.isArray(data)) {
    if (data.schema === void 0) {
      const err0 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "schema" }, message: "must have required property 'schema'" };
      if (vErrors === null) {
        vErrors = [err0];
      } else {
        vErrors.push(err0);
      }
      errors++;
    }
    if (data.bounty_ref === void 0) {
      const err1 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "bounty_ref" }, message: "must have required property 'bounty_ref'" };
      if (vErrors === null) {
        vErrors = [err1];
      } else {
        vErrors.push(err1);
      }
      errors++;
    }
    if (data.escrow === void 0) {
      const err2 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "escrow" }, message: "must have required property 'escrow'" };
      if (vErrors === null) {
        vErrors = [err2];
      } else {
        vErrors.push(err2);
      }
      errors++;
    }
    if (data.submitter === void 0) {
      const err3 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "submitter" }, message: "must have required property 'submitter'" };
      if (vErrors === null) {
        vErrors = [err3];
      } else {
        vErrors.push(err3);
      }
      errors++;
    }
    if (data.summary === void 0) {
      const err4 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "summary" }, message: "must have required property 'summary'" };
      if (vErrors === null) {
        vErrors = [err4];
      } else {
        vErrors.push(err4);
      }
      errors++;
    }
    if (data.evidence === void 0) {
      const err5 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "evidence" }, message: "must have required property 'evidence'" };
      if (vErrors === null) {
        vErrors = [err5];
      } else {
        vErrors.push(err5);
      }
      errors++;
    }
    if (data.acceptance === void 0) {
      const err6 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "acceptance" }, message: "must have required property 'acceptance'" };
      if (vErrors === null) {
        vErrors = [err6];
      } else {
        vErrors.push(err6);
      }
      errors++;
    }
    if (data.submitted_at === void 0) {
      const err7 = { instancePath, schemaPath: "#/required", keyword: "required", params: { missingProperty: "submitted_at" }, message: "must have required property 'submitted_at'" };
      if (vErrors === null) {
        vErrors = [err7];
      } else {
        vErrors.push(err7);
      }
      errors++;
    }
    for (const key0 in data) {
      if (!func1.call(schema32.properties, key0)) {
        const err8 = { instancePath, schemaPath: "#/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key0 }, message: "must NOT have additional properties" };
        if (vErrors === null) {
          vErrors = [err8];
        } else {
          vErrors.push(err8);
        }
        errors++;
      }
    }
    if (data.schema !== void 0) {
      if ("terp-bounty-submission/v1" !== data.schema) {
        const err9 = { instancePath: instancePath + "/schema", schemaPath: "#/properties/schema/const", keyword: "const", params: { allowedValue: "terp-bounty-submission/v1" }, message: "must be equal to constant" };
        if (vErrors === null) {
          vErrors = [err9];
        } else {
          vErrors.push(err9);
        }
        errors++;
      }
    }
    if (data.bounty_ref !== void 0) {
      let data1 = data.bounty_ref;
      if (typeof data1 === "string") {
        if (func2(data1) > 64) {
          const err10 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/maxLength", keyword: "maxLength", params: { limit: 64 }, message: "must NOT have more than 64 characters" };
          if (vErrors === null) {
            vErrors = [err10];
          } else {
            vErrors.push(err10);
          }
          errors++;
        }
        if (func2(data1) < 1) {
          const err11 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err11];
          } else {
            vErrors.push(err11);
          }
          errors++;
        }
        if (!pattern4.test(data1)) {
          const err12 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/pattern", keyword: "pattern", params: { pattern: "^[A-Za-z0-9._:-]+$" }, message: 'must match pattern "^[A-Za-z0-9._:-]+$"' };
          if (vErrors === null) {
            vErrors = [err12];
          } else {
            vErrors.push(err12);
          }
          errors++;
        }
      } else {
        const err13 = { instancePath: instancePath + "/bounty_ref", schemaPath: "#/properties/bounty_ref/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err13];
        } else {
          vErrors.push(err13);
        }
        errors++;
      }
    }
    if (data.escrow !== void 0) {
      let data2 = data.escrow;
      if (data2 && typeof data2 == "object" && !Array.isArray(data2)) {
        if (data2.chain_id === void 0) {
          const err14 = { instancePath: instancePath + "/escrow", schemaPath: "#/properties/escrow/required", keyword: "required", params: { missingProperty: "chain_id" }, message: "must have required property 'chain_id'" };
          if (vErrors === null) {
            vErrors = [err14];
          } else {
            vErrors.push(err14);
          }
          errors++;
        }
        if (data2.contract === void 0) {
          const err15 = { instancePath: instancePath + "/escrow", schemaPath: "#/properties/escrow/required", keyword: "required", params: { missingProperty: "contract" }, message: "must have required property 'contract'" };
          if (vErrors === null) {
            vErrors = [err15];
          } else {
            vErrors.push(err15);
          }
          errors++;
        }
        if (data2.bounty_id === void 0) {
          const err16 = { instancePath: instancePath + "/escrow", schemaPath: "#/properties/escrow/required", keyword: "required", params: { missingProperty: "bounty_id" }, message: "must have required property 'bounty_id'" };
          if (vErrors === null) {
            vErrors = [err16];
          } else {
            vErrors.push(err16);
          }
          errors++;
        }
        for (const key1 in data2) {
          if (!(key1 === "chain_id" || key1 === "contract" || key1 === "bounty_id")) {
            const err17 = { instancePath: instancePath + "/escrow", schemaPath: "#/properties/escrow/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key1 }, message: "must NOT have additional properties" };
            if (vErrors === null) {
              vErrors = [err17];
            } else {
              vErrors.push(err17);
            }
            errors++;
          }
        }
        if (data2.chain_id !== void 0) {
          let data3 = data2.chain_id;
          if (typeof data3 === "string") {
            if (!pattern15.test(data3)) {
              const err18 = { instancePath: instancePath + "/escrow/chain_id", schemaPath: "#/properties/escrow/properties/chain_id/pattern", keyword: "pattern", params: { pattern: "^[a-z0-9][a-z0-9-]{1,48}$" }, message: 'must match pattern "^[a-z0-9][a-z0-9-]{1,48}$"' };
              if (vErrors === null) {
                vErrors = [err18];
              } else {
                vErrors.push(err18);
              }
              errors++;
            }
          } else {
            const err19 = { instancePath: instancePath + "/escrow/chain_id", schemaPath: "#/properties/escrow/properties/chain_id/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err19];
            } else {
              vErrors.push(err19);
            }
            errors++;
          }
        }
        if (data2.contract !== void 0) {
          let data4 = data2.contract;
          if (typeof data4 === "string") {
            if (!pattern11.test(data4)) {
              const err20 = { instancePath: instancePath + "/escrow/contract", schemaPath: "#/properties/escrow/properties/contract/pattern", keyword: "pattern", params: { pattern: "^terp1[02-9ac-hj-np-z]{38,58}$" }, message: 'must match pattern "^terp1[02-9ac-hj-np-z]{38,58}$"' };
              if (vErrors === null) {
                vErrors = [err20];
              } else {
                vErrors.push(err20);
              }
              errors++;
            }
          } else {
            const err21 = { instancePath: instancePath + "/escrow/contract", schemaPath: "#/properties/escrow/properties/contract/type", keyword: "type", params: { type: "string" }, message: "must be string" };
            if (vErrors === null) {
              vErrors = [err21];
            } else {
              vErrors.push(err21);
            }
            errors++;
          }
        }
        if (data2.bounty_id !== void 0) {
          let data5 = data2.bounty_id;
          if (!(typeof data5 == "number" && (!(data5 % 1) && !isNaN(data5)) && isFinite(data5))) {
            const err22 = { instancePath: instancePath + "/escrow/bounty_id", schemaPath: "#/properties/escrow/properties/bounty_id/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
            if (vErrors === null) {
              vErrors = [err22];
            } else {
              vErrors.push(err22);
            }
            errors++;
          }
          if (typeof data5 == "number" && isFinite(data5)) {
            if (data5 < 1 || isNaN(data5)) {
              const err23 = { instancePath: instancePath + "/escrow/bounty_id", schemaPath: "#/properties/escrow/properties/bounty_id/minimum", keyword: "minimum", params: { comparison: ">=", limit: 1 }, message: "must be >= 1" };
              if (vErrors === null) {
                vErrors = [err23];
              } else {
                vErrors.push(err23);
              }
              errors++;
            }
          }
        }
      } else {
        const err24 = { instancePath: instancePath + "/escrow", schemaPath: "#/properties/escrow/type", keyword: "type", params: { type: "object" }, message: "must be object" };
        if (vErrors === null) {
          vErrors = [err24];
        } else {
          vErrors.push(err24);
        }
        errors++;
      }
    }
    if (data.submitter !== void 0) {
      let data6 = data.submitter;
      if (typeof data6 === "string") {
        if (!pattern11.test(data6)) {
          const err25 = { instancePath: instancePath + "/submitter", schemaPath: "#/properties/submitter/pattern", keyword: "pattern", params: { pattern: "^terp1[02-9ac-hj-np-z]{38,58}$" }, message: 'must match pattern "^terp1[02-9ac-hj-np-z]{38,58}$"' };
          if (vErrors === null) {
            vErrors = [err25];
          } else {
            vErrors.push(err25);
          }
          errors++;
        }
      } else {
        const err26 = { instancePath: instancePath + "/submitter", schemaPath: "#/properties/submitter/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err26];
        } else {
          vErrors.push(err26);
        }
        errors++;
      }
    }
    if (data.payout_wallet !== void 0) {
      let data7 = data.payout_wallet;
      if (typeof data7 === "string") {
        if (!pattern11.test(data7)) {
          const err27 = { instancePath: instancePath + "/payout_wallet", schemaPath: "#/properties/payout_wallet/pattern", keyword: "pattern", params: { pattern: "^terp1[02-9ac-hj-np-z]{38,58}$" }, message: 'must match pattern "^terp1[02-9ac-hj-np-z]{38,58}$"' };
          if (vErrors === null) {
            vErrors = [err27];
          } else {
            vErrors.push(err27);
          }
          errors++;
        }
      } else {
        const err28 = { instancePath: instancePath + "/payout_wallet", schemaPath: "#/properties/payout_wallet/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err28];
        } else {
          vErrors.push(err28);
        }
        errors++;
      }
    }
    if (data.summary !== void 0) {
      let data8 = data.summary;
      if (typeof data8 === "string") {
        if (func2(data8) > 280) {
          const err29 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/maxLength", keyword: "maxLength", params: { limit: 280 }, message: "must NOT have more than 280 characters" };
          if (vErrors === null) {
            vErrors = [err29];
          } else {
            vErrors.push(err29);
          }
          errors++;
        }
        if (func2(data8) < 1) {
          const err30 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
          if (vErrors === null) {
            vErrors = [err30];
          } else {
            vErrors.push(err30);
          }
          errors++;
        }
        if (!pattern5.test(data8)) {
          const err31 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/pattern", keyword: "pattern", params: { pattern: "^[^\\u0000-\\u001f\\u007f]*$" }, message: 'must match pattern "^[^\\u0000-\\u001f\\u007f]*$"' };
          if (vErrors === null) {
            vErrors = [err31];
          } else {
            vErrors.push(err31);
          }
          errors++;
        }
      } else {
        const err32 = { instancePath: instancePath + "/summary", schemaPath: "#/properties/summary/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err32];
        } else {
          vErrors.push(err32);
        }
        errors++;
      }
    }
    if (data.notes !== void 0) {
      let data9 = data.notes;
      if (typeof data9 === "string") {
        if (func2(data9) > 1e4) {
          const err33 = { instancePath: instancePath + "/notes", schemaPath: "#/properties/notes/maxLength", keyword: "maxLength", params: { limit: 1e4 }, message: "must NOT have more than 10000 characters" };
          if (vErrors === null) {
            vErrors = [err33];
          } else {
            vErrors.push(err33);
          }
          errors++;
        }
      } else {
        const err34 = { instancePath: instancePath + "/notes", schemaPath: "#/properties/notes/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err34];
        } else {
          vErrors.push(err34);
        }
        errors++;
      }
    }
    if (data.evidence !== void 0) {
      let data10 = data.evidence;
      if (Array.isArray(data10)) {
        if (data10.length > 20) {
          const err35 = { instancePath: instancePath + "/evidence", schemaPath: "#/properties/evidence/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" };
          if (vErrors === null) {
            vErrors = [err35];
          } else {
            vErrors.push(err35);
          }
          errors++;
        }
        if (data10.length < 1) {
          const err36 = { instancePath: instancePath + "/evidence", schemaPath: "#/properties/evidence/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err36];
          } else {
            vErrors.push(err36);
          }
          errors++;
        }
        const len0 = data10.length;
        for (let i0 = 0; i0 < len0; i0++) {
          let data11 = data10[i0];
          if (data11 && typeof data11 == "object" && !Array.isArray(data11)) {
            if (data11.kind === void 0) {
              const err37 = { instancePath: instancePath + "/evidence/" + i0, schemaPath: "#/properties/evidence/items/required", keyword: "required", params: { missingProperty: "kind" }, message: "must have required property 'kind'" };
              if (vErrors === null) {
                vErrors = [err37];
              } else {
                vErrors.push(err37);
              }
              errors++;
            }
            if (data11.uri === void 0) {
              const err38 = { instancePath: instancePath + "/evidence/" + i0, schemaPath: "#/properties/evidence/items/required", keyword: "required", params: { missingProperty: "uri" }, message: "must have required property 'uri'" };
              if (vErrors === null) {
                vErrors = [err38];
              } else {
                vErrors.push(err38);
              }
              errors++;
            }
            for (const key2 in data11) {
              if (!(key2 === "kind" || key2 === "uri" || key2 === "sha256" || key2 === "cid" || key2 === "note")) {
                const err39 = { instancePath: instancePath + "/evidence/" + i0, schemaPath: "#/properties/evidence/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key2 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err39];
                } else {
                  vErrors.push(err39);
                }
                errors++;
              }
            }
            if (data11.kind !== void 0) {
              let data12 = data11.kind;
              if (!(data12 === "pr" || data12 === "commit" || data12 === "tx" || data12 === "url" || data12 === "ipfs" || data12 === "file" || data12 === "report" || data12 === "video")) {
                const err40 = { instancePath: instancePath + "/evidence/" + i0 + "/kind", schemaPath: "#/properties/evidence/items/properties/kind/enum", keyword: "enum", params: { allowedValues: schema32.properties.evidence.items.properties.kind.enum }, message: "must be equal to one of the allowed values" };
                if (vErrors === null) {
                  vErrors = [err40];
                } else {
                  vErrors.push(err40);
                }
                errors++;
              }
            }
            if (data11.uri !== void 0) {
              let data13 = data11.uri;
              if (typeof data13 === "string") {
                if (!pattern12.test(data13)) {
                  const err41 = { instancePath: instancePath + "/evidence/" + i0 + "/uri", schemaPath: "#/properties/evidence/items/properties/uri/pattern", keyword: "pattern", params: { pattern: "^(https://|ipfs://)[^\\s]{1,2040}$" }, message: 'must match pattern "^(https://|ipfs://)[^\\s]{1,2040}$"' };
                  if (vErrors === null) {
                    vErrors = [err41];
                  } else {
                    vErrors.push(err41);
                  }
                  errors++;
                }
              } else {
                const err42 = { instancePath: instancePath + "/evidence/" + i0 + "/uri", schemaPath: "#/properties/evidence/items/properties/uri/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err42];
                } else {
                  vErrors.push(err42);
                }
                errors++;
              }
            }
            if (data11.sha256 !== void 0) {
              let data14 = data11.sha256;
              if (typeof data14 === "string") {
                if (!pattern21.test(data14)) {
                  const err43 = { instancePath: instancePath + "/evidence/" + i0 + "/sha256", schemaPath: "#/properties/evidence/items/properties/sha256/pattern", keyword: "pattern", params: { pattern: "^[0-9a-f]{64}$" }, message: 'must match pattern "^[0-9a-f]{64}$"' };
                  if (vErrors === null) {
                    vErrors = [err43];
                  } else {
                    vErrors.push(err43);
                  }
                  errors++;
                }
              } else {
                const err44 = { instancePath: instancePath + "/evidence/" + i0 + "/sha256", schemaPath: "#/properties/evidence/items/properties/sha256/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err44];
                } else {
                  vErrors.push(err44);
                }
                errors++;
              }
            }
            if (data11.cid !== void 0) {
              let data15 = data11.cid;
              if (typeof data15 === "string") {
                if (!pattern22.test(data15)) {
                  const err45 = { instancePath: instancePath + "/evidence/" + i0 + "/cid", schemaPath: "#/properties/evidence/items/properties/cid/pattern", keyword: "pattern", params: { pattern: "^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{7,127})$" }, message: 'must match pattern "^(Qm[1-9A-HJ-NP-Za-km-z]{44}|b[a-z2-7]{7,127})$"' };
                  if (vErrors === null) {
                    vErrors = [err45];
                  } else {
                    vErrors.push(err45);
                  }
                  errors++;
                }
              } else {
                const err46 = { instancePath: instancePath + "/evidence/" + i0 + "/cid", schemaPath: "#/properties/evidence/items/properties/cid/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err46];
                } else {
                  vErrors.push(err46);
                }
                errors++;
              }
            }
            if (data11.note !== void 0) {
              let data16 = data11.note;
              if (typeof data16 === "string") {
                if (func2(data16) > 500) {
                  const err47 = { instancePath: instancePath + "/evidence/" + i0 + "/note", schemaPath: "#/properties/evidence/items/properties/note/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
                  if (vErrors === null) {
                    vErrors = [err47];
                  } else {
                    vErrors.push(err47);
                  }
                  errors++;
                }
              } else {
                const err48 = { instancePath: instancePath + "/evidence/" + i0 + "/note", schemaPath: "#/properties/evidence/items/properties/note/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err48];
                } else {
                  vErrors.push(err48);
                }
                errors++;
              }
            }
          } else {
            const err49 = { instancePath: instancePath + "/evidence/" + i0, schemaPath: "#/properties/evidence/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err49];
            } else {
              vErrors.push(err49);
            }
            errors++;
          }
        }
      } else {
        const err50 = { instancePath: instancePath + "/evidence", schemaPath: "#/properties/evidence/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err50];
        } else {
          vErrors.push(err50);
        }
        errors++;
      }
    }
    if (data.acceptance !== void 0) {
      let data17 = data.acceptance;
      if (Array.isArray(data17)) {
        if (data17.length > 50) {
          const err51 = { instancePath: instancePath + "/acceptance", schemaPath: "#/properties/acceptance/maxItems", keyword: "maxItems", params: { limit: 50 }, message: "must NOT have more than 50 items" };
          if (vErrors === null) {
            vErrors = [err51];
          } else {
            vErrors.push(err51);
          }
          errors++;
        }
        if (data17.length < 1) {
          const err52 = { instancePath: instancePath + "/acceptance", schemaPath: "#/properties/acceptance/minItems", keyword: "minItems", params: { limit: 1 }, message: "must NOT have fewer than 1 items" };
          if (vErrors === null) {
            vErrors = [err52];
          } else {
            vErrors.push(err52);
          }
          errors++;
        }
        const len1 = data17.length;
        for (let i1 = 0; i1 < len1; i1++) {
          let data18 = data17[i1];
          if (data18 && typeof data18 == "object" && !Array.isArray(data18)) {
            if (data18.criterion === void 0) {
              const err53 = { instancePath: instancePath + "/acceptance/" + i1, schemaPath: "#/properties/acceptance/items/required", keyword: "required", params: { missingProperty: "criterion" }, message: "must have required property 'criterion'" };
              if (vErrors === null) {
                vErrors = [err53];
              } else {
                vErrors.push(err53);
              }
              errors++;
            }
            if (data18.met === void 0) {
              const err54 = { instancePath: instancePath + "/acceptance/" + i1, schemaPath: "#/properties/acceptance/items/required", keyword: "required", params: { missingProperty: "met" }, message: "must have required property 'met'" };
              if (vErrors === null) {
                vErrors = [err54];
              } else {
                vErrors.push(err54);
              }
              errors++;
            }
            for (const key3 in data18) {
              if (!(key3 === "criterion" || key3 === "met" || key3 === "evidence")) {
                const err55 = { instancePath: instancePath + "/acceptance/" + i1, schemaPath: "#/properties/acceptance/items/additionalProperties", keyword: "additionalProperties", params: { additionalProperty: key3 }, message: "must NOT have additional properties" };
                if (vErrors === null) {
                  vErrors = [err55];
                } else {
                  vErrors.push(err55);
                }
                errors++;
              }
            }
            if (data18.criterion !== void 0) {
              let data19 = data18.criterion;
              if (typeof data19 === "string") {
                if (func2(data19) > 500) {
                  const err56 = { instancePath: instancePath + "/acceptance/" + i1 + "/criterion", schemaPath: "#/properties/acceptance/items/properties/criterion/maxLength", keyword: "maxLength", params: { limit: 500 }, message: "must NOT have more than 500 characters" };
                  if (vErrors === null) {
                    vErrors = [err56];
                  } else {
                    vErrors.push(err56);
                  }
                  errors++;
                }
                if (func2(data19) < 1) {
                  const err57 = { instancePath: instancePath + "/acceptance/" + i1 + "/criterion", schemaPath: "#/properties/acceptance/items/properties/criterion/minLength", keyword: "minLength", params: { limit: 1 }, message: "must NOT have fewer than 1 characters" };
                  if (vErrors === null) {
                    vErrors = [err57];
                  } else {
                    vErrors.push(err57);
                  }
                  errors++;
                }
              } else {
                const err58 = { instancePath: instancePath + "/acceptance/" + i1 + "/criterion", schemaPath: "#/properties/acceptance/items/properties/criterion/type", keyword: "type", params: { type: "string" }, message: "must be string" };
                if (vErrors === null) {
                  vErrors = [err58];
                } else {
                  vErrors.push(err58);
                }
                errors++;
              }
            }
            if (data18.met !== void 0) {
              if (typeof data18.met !== "boolean") {
                const err59 = { instancePath: instancePath + "/acceptance/" + i1 + "/met", schemaPath: "#/properties/acceptance/items/properties/met/type", keyword: "type", params: { type: "boolean" }, message: "must be boolean" };
                if (vErrors === null) {
                  vErrors = [err59];
                } else {
                  vErrors.push(err59);
                }
                errors++;
              }
            }
            if (data18.evidence !== void 0) {
              let data21 = data18.evidence;
              if (Array.isArray(data21)) {
                if (data21.length > 20) {
                  const err60 = { instancePath: instancePath + "/acceptance/" + i1 + "/evidence", schemaPath: "#/properties/acceptance/items/properties/evidence/maxItems", keyword: "maxItems", params: { limit: 20 }, message: "must NOT have more than 20 items" };
                  if (vErrors === null) {
                    vErrors = [err60];
                  } else {
                    vErrors.push(err60);
                  }
                  errors++;
                }
                const len2 = data21.length;
                for (let i2 = 0; i2 < len2; i2++) {
                  let data22 = data21[i2];
                  if (!(typeof data22 == "number" && (!(data22 % 1) && !isNaN(data22)) && isFinite(data22))) {
                    const err61 = { instancePath: instancePath + "/acceptance/" + i1 + "/evidence/" + i2, schemaPath: "#/properties/acceptance/items/properties/evidence/items/type", keyword: "type", params: { type: "integer" }, message: "must be integer" };
                    if (vErrors === null) {
                      vErrors = [err61];
                    } else {
                      vErrors.push(err61);
                    }
                    errors++;
                  }
                  if (typeof data22 == "number" && isFinite(data22)) {
                    if (data22 < 0 || isNaN(data22)) {
                      const err62 = { instancePath: instancePath + "/acceptance/" + i1 + "/evidence/" + i2, schemaPath: "#/properties/acceptance/items/properties/evidence/items/minimum", keyword: "minimum", params: { comparison: ">=", limit: 0 }, message: "must be >= 0" };
                      if (vErrors === null) {
                        vErrors = [err62];
                      } else {
                        vErrors.push(err62);
                      }
                      errors++;
                    }
                  }
                }
              } else {
                const err63 = { instancePath: instancePath + "/acceptance/" + i1 + "/evidence", schemaPath: "#/properties/acceptance/items/properties/evidence/type", keyword: "type", params: { type: "array" }, message: "must be array" };
                if (vErrors === null) {
                  vErrors = [err63];
                } else {
                  vErrors.push(err63);
                }
                errors++;
              }
            }
          } else {
            const err64 = { instancePath: instancePath + "/acceptance/" + i1, schemaPath: "#/properties/acceptance/items/type", keyword: "type", params: { type: "object" }, message: "must be object" };
            if (vErrors === null) {
              vErrors = [err64];
            } else {
              vErrors.push(err64);
            }
            errors++;
          }
        }
      } else {
        const err65 = { instancePath: instancePath + "/acceptance", schemaPath: "#/properties/acceptance/type", keyword: "type", params: { type: "array" }, message: "must be array" };
        if (vErrors === null) {
          vErrors = [err65];
        } else {
          vErrors.push(err65);
        }
        errors++;
      }
    }
    if (data.details_hash !== void 0) {
      let data23 = data.details_hash;
      if (typeof data23 === "string") {
        if (!pattern21.test(data23)) {
          const err66 = { instancePath: instancePath + "/details_hash", schemaPath: "#/properties/details_hash/pattern", keyword: "pattern", params: { pattern: "^[0-9a-f]{64}$" }, message: 'must match pattern "^[0-9a-f]{64}$"' };
          if (vErrors === null) {
            vErrors = [err66];
          } else {
            vErrors.push(err66);
          }
          errors++;
        }
      } else {
        const err67 = { instancePath: instancePath + "/details_hash", schemaPath: "#/properties/details_hash/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err67];
        } else {
          vErrors.push(err67);
        }
        errors++;
      }
    }
    if (data.submitted_at !== void 0) {
      let data24 = data.submitted_at;
      if (typeof data24 === "string") {
        if (!pattern13.test(data24)) {
          const err68 = { instancePath: instancePath + "/submitted_at", schemaPath: "#/properties/submitted_at/pattern", keyword: "pattern", params: { pattern: "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$" }, message: 'must match pattern "^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}(\\.\\d{1,9})?(Z|[+-]\\d{2}:\\d{2})$"' };
          if (vErrors === null) {
            vErrors = [err68];
          } else {
            vErrors.push(err68);
          }
          errors++;
        }
      } else {
        const err69 = { instancePath: instancePath + "/submitted_at", schemaPath: "#/properties/submitted_at/type", keyword: "type", params: { type: "string" }, message: "must be string" };
        if (vErrors === null) {
          vErrors = [err69];
        } else {
          vErrors.push(err69);
        }
        errors++;
      }
    }
  } else {
    const err70 = { instancePath, schemaPath: "#/type", keyword: "type", params: { type: "object" }, message: "must be object" };
    if (vErrors === null) {
      vErrors = [err70];
    } else {
      vErrors.push(err70);
    }
    errors++;
  }
  validate21.errors = vErrors;
  return errors === 0;
}
validate21.evaluated = { "props": true, "dynamicProps": false, "dynamicItems": false };

// ../lib.mjs
var SCHEMA_IDS = { details: "terp-bounty-details/v1", submission: "terp-bounty-submission/v1" };
var SUMMARY_MAX_BYTES = 280;
var TITLE_MAX_CHARS = 140;
var CID_MAX_LEN = 128;
var DOC_MAX_BYTES = 256 * 1024;
var enc = new TextEncoder();
var utf8Bytes = (s) => enc.encode(String(s ?? "")).length;
var hex = (u8) => Array.from(u8, (b) => b.toString(16).padStart(2, "0")).join("");
function canonicalJson(v) {
  if (v === null || typeof v !== "object") {
    if (typeof v === "number" && !Number.isFinite(v)) throw new Error("non-finite number");
    return JSON.stringify(v);
  }
  if (Array.isArray(v)) return "[" + v.map(canonicalJson).join(",") + "]";
  return "{" + Object.keys(v).filter((k) => v[k] !== void 0).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(v[k])).join(",") + "}";
}
var canonicalBytes = (doc) => enc.encode(canonicalJson(doc));
var sha256Hex = (bytes) => hex(sha2562(typeof bytes === "string" ? enc.encode(bytes) : bytes));
var B32 = "abcdefghijklmnopqrstuvwxyz234567";
var B58 = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function b32enc(u8) {
  let out = "", bits = 0, acc = 0;
  for (const b of u8) {
    acc = acc << 8 | b;
    bits += 8;
    while (bits >= 5) {
      out += B32[acc >>> bits - 5 & 31];
      bits -= 5;
    }
  }
  if (bits) out += B32[acc << 5 - bits & 31];
  return out;
}
function b32dec(s) {
  const out = [];
  let bits = 0, acc = 0;
  for (const ch of s) {
    const v = B32.indexOf(ch);
    if (v < 0) throw new Error(`invalid base32 char '${ch}'`);
    acc = (acc << 5 | v) & 65535;
    bits += 5;
    if (bits >= 8) {
      out.push(acc >>> bits - 8 & 255);
      bits -= 8;
    }
  }
  if (bits >= 5 || (acc & (1 << bits) - 1) !== 0) throw new Error("non-canonical base32 padding");
  return Uint8Array.from(out);
}
function b58dec(s) {
  let n = 0n;
  for (const ch of s) {
    const v = B58.indexOf(ch);
    if (v < 0) throw new Error(`invalid base58 char '${ch}'`);
    n = n * 58n + BigInt(v);
  }
  const out = [];
  while (n > 0n) {
    out.unshift(Number(n & 255n));
    n >>= 8n;
  }
  for (const ch of s) {
    if (ch === "1") out.unshift(0);
    else break;
  }
  return Uint8Array.from(out);
}
function varint(u8, i) {
  let x = 0, s = 0;
  for (let k = 0; k < 9; k++) {
    const b = u8[i + k];
    if (b === void 0) throw new Error("truncated varint");
    x += (b & 127) * 2 ** s;
    if (!(b & 128)) return [x, i + k + 1];
    s += 7;
  }
  throw new Error("varint too long");
}
var CODECS = { 85: "raw", 112: "dag-pb", 113: "dag-cbor", 297: "dag-json", 512: "json" };
var HASHES = { 18: "sha2-256", 30: "blake3" };
function parseCid(cid) {
  if (typeof cid !== "string" || !cid) throw new Error("empty cid");
  if (cid.length > CID_MAX_LEN) throw new Error(`cid longer than ${CID_MAX_LEN} chars`);
  if (cid.startsWith("Qm")) {
    if (cid.length !== 46) throw new Error("CIDv0 must be 46 chars");
    const b2 = b58dec(cid);
    if (b2.length !== 34 || b2[0] !== 18 || b2[1] !== 32) throw new Error("CIDv0 must be a sha2-256 multihash");
    return { version: 0, codec: "dag-pb", hash: "sha2-256", digestHex: hex(b2.slice(2)) };
  }
  if (cid[0] !== "b") throw new Error("cid must be CIDv0 ('Qm...') or base32 CIDv1 ('b...')");
  const b = b32dec(cid.slice(1));
  let [ver, i] = varint(b, 0);
  if (ver !== 1) throw new Error("CIDv1 version must be 1");
  let codec;
  [codec, i] = varint(b, i);
  if (!CODECS[codec]) throw new Error(`unsupported codec 0x${codec.toString(16)}`);
  let mh;
  [mh, i] = varint(b, i);
  if (!HASHES[mh]) throw new Error(`unsupported multihash 0x${mh.toString(16)}`);
  let len;
  [len, i] = varint(b, i);
  if (len !== 32) throw new Error("digest must be 32 bytes");
  if (b.length !== i + 32) throw new Error("cid length mismatch");
  return { version: 1, codec: CODECS[codec], hash: HASHES[mh], digestHex: hex(b.slice(i)) };
}
function isValidCid(cid) {
  try {
    parseCid(cid);
    return true;
  } catch {
    return false;
  }
}
function rawCidV1(bytes) {
  const u8 = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  return "b" + b32enc(Uint8Array.from([1, 85, 18, 32, ...sha2562(u8)]));
}
function cidMismatch(cid, bytes) {
  const p = parseCid(cid);
  if (p.codec === "raw" && p.hash === "sha2-256") return p.digestHex === sha256Hex(bytes) ? null : "CID digest != sha256(bytes)";
  return null;
}
function detailed(errors) {
  return (errors || []).map((e) => {
    const path = e.keyword === "required" ? `${e.instancePath}/${e.params.missingProperty}` : e.keyword === "additionalProperties" ? `${e.instancePath}/${e.params.additionalProperty}` : e.instancePath || "/";
    const message = e.keyword === "required" ? "is required" : e.keyword === "additionalProperties" ? "is not a field of this schema (additionalProperties: false)" : `${e.message}${e.params?.allowedValues ? " " + JSON.stringify(e.params.allowedValues) : ""}`;
    return { path, message };
  });
}
function extra(doc) {
  const errs = [];
  if (doc && typeof doc.summary === "string") {
    const n = utf8Bytes(doc.summary);
    if (n > SUMMARY_MAX_BYTES) errs.push({ path: "/summary", message: `is ${n} bytes of UTF-8, max ${SUMMARY_MAX_BYTES}` });
    if (!doc.summary.trim()) errs.push({ path: "/summary", message: "must not be blank" });
  }
  return errs;
}
var result = (fields, schema, version) => {
  const ok = fields.length === 0;
  return { ok, errors: fields.map((f) => `${f.path} ${f.message}`), fields, schema, version };
};
var SCHEMA_SUPPORTED = { details: 1, submission: 1 };
function schemaVersionOf(doc, kind) {
  const want = SCHEMA_IDS[kind];
  if (!want) throw new Error(`unknown document kind ${kind}`);
  const base = { expected: want, supported: SCHEMA_SUPPORTED[kind] };
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) return { ...base, status: "not-object", message: `expected a JSON object (${want})` };
  const s = doc.schema;
  if (s === void 0) return { ...base, status: "missing", message: `no "schema" field: expected "${want}"` };
  const m = typeof s === "string" && /^terp-bounty-(details|submission)\/v(\d{1,4})$/.exec(s);
  if (!m) return { ...base, status: "unknown", found: s, message: `unknown schema ${JSON.stringify(s)}: expected "${want}"` };
  if (m[1] !== kind) return { ...base, status: "wrong-kind", found: s, message: `this is a ${s} document, expected "${want}"` };
  const v = Number(m[2]), sup = SCHEMA_SUPPORTED[kind];
  if (v < sup) return { ...base, status: "older", found: s, version: v, message: `${s} is an older version: this app reads v${sup} only and does not migrate. Re-create the document as "${want}".` };
  if (v > sup) return { ...base, status: "newer", found: s, version: v, message: `${s} is newer than this app supports (v${sup}). Not guessing at its fields; use "${want}".` };
  return { ...base, status: "current", found: s, version: v, message: null };
}
var versionGate = (doc, kind) => {
  const v = schemaVersionOf(doc, kind);
  return v.status === "current" ? null : result([{ path: "/schema", message: v.message }], SCHEMA_IDS[kind], v);
};
function validateDetails(doc) {
  const g = versionGate(doc, "details");
  if (g) return g;
  validateDetailsSchema(doc);
  return result([...detailed(validateDetailsSchema.errors), ...extra(doc)], SCHEMA_IDS.details, schemaVersionOf(doc, "details"));
}
function validateSubmission(doc, expect = {}) {
  const g = versionGate(doc, "submission");
  if (g) return g;
  const ok = validateSubmissionSchema(doc);
  const f = [...detailed(validateSubmissionSchema.errors), ...extra(doc)];
  if (ok) {
    if (expect.bounty_ref != null && doc.bounty_ref !== String(expect.bounty_ref)) f.push({ path: "/bounty_ref", message: `${doc.bounty_ref} != on-chain ${expect.bounty_ref}` });
    if (expect.submitter && doc.submitter !== expect.submitter) f.push({ path: "/submitter", message: `${doc.submitter} != tx signer ${expect.submitter}` });
    if (expect.contract && doc.escrow.contract !== expect.contract) f.push({ path: "/escrow/contract", message: "does not match the escrow" });
    if (expect.bounty_id != null && doc.escrow.bounty_id !== Number(expect.bounty_id)) f.push({ path: "/escrow/bounty_id", message: `${doc.escrow.bounty_id} != ${expect.bounty_id}` });
    if (expect.chain_id && doc.escrow.chain_id !== expect.chain_id) f.push({ path: "/escrow/chain_id", message: `${doc.escrow.chain_id} != ${expect.chain_id}` });
    if (doc.acceptance) doc.acceptance.forEach((a, i) => (a.evidence || []).forEach((k) => {
      if (k >= doc.evidence.length) f.push({ path: `/acceptance/${i}/evidence`, message: `index ${k} out of range` });
    }));
  }
  return result(f, SCHEMA_IDS.submission, schemaVersionOf(doc, "submission"));
}
function validateAny(doc, expect = {}) {
  const kind = typeof doc?.schema === "string" && doc.schema.startsWith("terp-bounty-submission/") ? "submission" : "details";
  return { kind, ...kind === "submission" ? validateSubmission(doc, expect) : validateDetails(doc) };
}
function jsonErrorAt(t) {
  let i = 0;
  const ws = () => {
    while (" 	\n\r".includes(t[i]) && i < t.length) i++;
  };
  const fail = (msg) => {
    throw { pos: i, msg };
  };
  const lit = (w) => {
    if (t.startsWith(w, i)) i += w.length;
    else fail(`unexpected ${t[i] === void 0 ? "end of input" : JSON.stringify(t[i])}`);
  };
  const str = () => {
    i++;
    while (i < t.length) {
      const c = t[i];
      if (c === '"') {
        i++;
        return;
      }
      if (c === "\\") {
        i++;
        if (t[i] === "u") {
          if (!/^[0-9a-fA-F]{4}$/.test(t.slice(i + 1, i + 5))) fail("bad \\u escape");
          i += 5;
        } else if ('"\\/bfnrt'.includes(t[i])) i++;
        else fail("bad escape");
      } else if (c < " ") fail("control character in string (use \\n)");
      else i++;
    }
    fail("unterminated string");
  };
  const num = () => {
    const m = /^-?(0|[1-9]\d*)(\.\d+)?([eE][+-]?\d+)?/.exec(t.slice(i));
    if (!m) fail("bad number");
    i += m[0].length;
  };
  const val = () => {
    ws();
    const c = t[i];
    if (c === "{") {
      i++;
      ws();
      if (t[i] === "}") {
        i++;
        return;
      }
      for (; ; ) {
        ws();
        if (t[i] !== '"') fail('expected a "key"');
        str();
        ws();
        if (t[i] !== ":") fail("expected ':' after the key");
        i++;
        val();
        ws();
        if (t[i] === ",") {
          i++;
          continue;
        }
        if (t[i] === "}") {
          i++;
          return;
        }
        fail("expected ',' or '}' (trailing commas are not JSON)");
      }
    }
    if (c === "[") {
      i++;
      ws();
      if (t[i] === "]") {
        i++;
        return;
      }
      for (; ; ) {
        val();
        ws();
        if (t[i] === ",") {
          i++;
          continue;
        }
        if (t[i] === "]") {
          i++;
          return;
        }
        fail("expected ',' or ']'");
      }
    }
    if (c === '"') return str();
    if (c === "t") return lit("true");
    if (c === "f") return lit("false");
    if (c === "n") return lit("null");
    if (c === "-" || c >= "0" && c <= "9") return num();
    fail(c === void 0 ? "unexpected end of input" : `unexpected ${JSON.stringify(c)} (expected a value)`);
  };
  try {
    val();
    ws();
    if (i < t.length) fail("extra text after the JSON value");
    return null;
  } catch (e) {
    if (e && typeof e.pos === "number") return e;
    throw e;
  }
}
var IMPORT_ASSIGNED = ["bounty_ref", "proposer", "created_at"];
function importDetails(text, { maxBytes = DOC_MAX_BYTES } = {}) {
  const raw = String(text ?? "");
  const size = enc.encode(raw).length;
  if (size > maxBytes) return { ok: false, fields: [{ path: "/", message: `the file is ${size} bytes, max ${maxBytes} (one IPFS block)` }], notes: [] };
  if (!raw.trim()) return { ok: false, fields: [{ path: "/", message: "nothing to import: paste a terp-bounty-details/v1 JSON document or choose a .json file" }], notes: [] };
  let doc;
  try {
    doc = JSON.parse(raw);
  } catch (e) {
    const at = jsonErrorAt(raw);
    let where = "";
    if (at) {
      const before = raw.slice(0, at.pos), line = before.split("\n").length, col = at.pos - before.lastIndexOf("\n");
      where = ` at line ${line}, column ${col}: ${at.msg}`;
    }
    return { ok: false, fields: [{ path: "/", message: `not valid JSON${where || ": " + e.message}` }], notes: [] };
  }
  const version = schemaVersionOf(doc, "details");
  if (version.status !== "current") return { ok: false, doc, version, fields: [{ path: "/schema", message: version.message }], notes: [] };
  const notes = [];
  const probe = { ...doc };
  if (probe.bounty_ref === void 0 || !/^[A-Za-z0-9._:-]{1,64}$/.test(String(probe.bounty_ref))) {
    notes.push(`bounty_ref ${probe.bounty_ref === void 0 ? "(missing)" : JSON.stringify(probe.bounty_ref)} will be replaced by the backend draft id`);
    probe.bounty_ref = "pending";
  } else notes.push(`bounty_ref ${JSON.stringify(probe.bounty_ref)} will be replaced by the backend draft id`);
  if (probe.proposer !== void 0) notes.push("proposer will be the signing wallet");
  if (probe.created_at !== void 0) notes.push("created_at will be set by the backend");
  const v = validateDetails(probe);
  return { ok: v.ok, doc, version, fields: v.fields, errors: v.errors, notes, size };
}
var UPLOAD_AUTH_TYPE = "terp-cid-storage/v1/upload";
var UPLOAD_FIELDS = ["chain_id", "contract", "addr", "kind", "sha256", "cid", "size", "nonce", "exp"];
function uploadAuthMessage(f) {
  for (const k of UPLOAD_FIELDS) if (f[k] === void 0 || f[k] === null || /[\n=]/.test(String(f[k]))) throw new Error(`upload auth: bad ${k}`);
  return [UPLOAD_AUTH_TYPE, ...UPLOAD_FIELDS.map((k) => `${k}=${f[k]}`)].join("\n");
}
function parseUploadAuthMessage(text) {
  const lines = String(text).split("\n");
  if (lines[0] !== UPLOAD_AUTH_TYPE || lines.length !== UPLOAD_FIELDS.length + 1) throw new Error(`not a ${UPLOAD_AUTH_TYPE} message`);
  const out = {};
  UPLOAD_FIELDS.forEach((k, i) => {
    const l = lines[i + 1];
    if (!l.startsWith(k + "=")) throw new Error(`upload auth: line ${i + 2} must be ${k}=`);
    out[k] = l.slice(k.length + 1);
  });
  out.size = Number(out.size);
  out.exp = Number(out.exp);
  return out;
}
function verifySubmissionBytes(bytes, { cid, submission_hash, ...expect } = {}) {
  const u8 = typeof bytes === "string" ? enc.encode(bytes) : bytes;
  const errors = [];
  if (u8.length > DOC_MAX_BYTES) return { ok: false, errors: [`document is ${u8.length} bytes, max ${DOC_MAX_BYTES}`] };
  const h = sha256Hex(u8);
  if (submission_hash && h !== submission_hash) errors.push(`sha256(bytes)=${h.slice(0, 12)}\u2026 != submission_hash ${String(submission_hash).slice(0, 12)}\u2026`);
  if (cid) {
    try {
      const m = cidMismatch(cid, u8);
      if (m) errors.push(m);
    } catch (e) {
      errors.push("cid: " + e.message);
    }
  }
  let doc;
  try {
    doc = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(u8));
  } catch (e) {
    return { ok: false, errors: [...errors, "not UTF-8 JSON: " + e.message], sha256: h };
  }
  const v = validateSubmission(doc, expect);
  return { ok: v.ok && errors.length === 0, errors: [...errors, ...v.errors], sha256: h, schema: v.schema, doc };
}
function detailsTemplate(f = {}) {
  return {
    schema: SCHEMA_IDS.details,
    bounty_ref: f.bounty_ref ?? "<backend bounty id>",
    title: f.title ?? "",
    summary: f.summary ?? "",
    ...f.description ? { description: f.description } : {},
    category: f.category ?? "docs",
    capabilities: f.capabilities ?? [],
    tier: f.tier ?? "T2",
    priority: f.priority ?? "P2",
    acceptance_criteria: f.acceptance_criteria ?? ["<what must be true to approve>"],
    evidence_required: f.evidence_required ?? ["<links reviewers need>"],
    deadline: f.deadline ?? "2026-12-31",
    reward_quote: f.reward_quote ?? { asset: "TERP", denom: "uterp", amount: "1", label: "proposed, pending vote" },
    ...f.proposer ? { proposer: f.proposer } : {},
    ...f.created_at ? { created_at: f.created_at } : {}
  };
}
function submissionTemplate(c = {}) {
  return {
    schema: SCHEMA_IDS.submission,
    bounty_ref: String(c.bounty_ref ?? "<bounty_ref>"),
    escrow: { chain_id: c.chain_id ?? "terp-local-1", contract: c.contract ?? "<escrow address>", bounty_id: Number(c.bounty_id ?? 1) },
    submitter: c.submitter ?? "<your terp1 address>",
    summary: c.summary ?? "",
    ...c.notes ? { notes: c.notes } : {},
    evidence: c.evidence ?? [{ kind: "pr", uri: "https://github.com/terpnetwork/<repo>/pull/<n>" }],
    acceptance: c.acceptance ?? [{ criterion: "<criterion from the bounty>", met: true, evidence: [0] }],
    ...c.details_hash ? { details_hash: c.details_hash } : {},
    submitted_at: c.submitted_at ?? (/* @__PURE__ */ new Date()).toISOString().replace(/\.\d+Z$/, "Z")
  };
}
function seal(doc) {
  const bytes = canonicalBytes(doc);
  return { bytes, json: new TextDecoder().decode(bytes), hash: sha256Hex(bytes), cid: rawCidV1(bytes) };
}
export {
  CID_MAX_LEN,
  DOC_MAX_BYTES,
  IMPORT_ASSIGNED,
  SCHEMA_IDS,
  SCHEMA_SUPPORTED,
  SUMMARY_MAX_BYTES,
  TITLE_MAX_CHARS,
  UPLOAD_AUTH_TYPE,
  canonicalBytes,
  canonicalJson,
  cidMismatch,
  detailsTemplate,
  hex,
  importDetails,
  isValidCid,
  jsonErrorAt,
  parseCid,
  parseUploadAuthMessage,
  rawCidV1,
  schemaVersionOf,
  seal,
  sha256Hex,
  submissionTemplate,
  uploadAuthMessage,
  utf8Bytes,
  validateAny,
  validateDetails,
  validateSubmission,
  verifySubmissionBytes
};
/*! Bundled license information:

@noble/hashes/esm/utils.js:
  (*! noble-hashes - MIT License (c) 2022 Paul Miller (paulmillr.com) *)
*/
