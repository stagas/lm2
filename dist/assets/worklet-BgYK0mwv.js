(function() {
  "use strict";
  function Deferred() {
    const _onwhen = () => {
      deferred.hasSettled = true;
      deferred.resolve = deferred.reject = noop;
    };
    const noop = () => {
    };
    let onwhen = _onwhen;
    const deferred = {
      hasSettled: false,
      when: (fn) => {
        onwhen = () => {
          _onwhen();
          fn();
        };
      }
    };
    deferred.promise = new Promise((resolve, reject) => {
      deferred.resolve = (arg) => {
        onwhen();
        deferred.value = arg;
        resolve(arg);
      };
      deferred.reject = (error) => {
        onwhen();
        deferred.error = error;
        reject(error);
      };
    });
    return deferred;
  }
  const Getter = (cb, target = {}) => new Proxy(target, { get: (_, key) => cb(key) });
  const defaultTransferables = [
    typeof OffscreenCanvas !== "undefined" ? OffscreenCanvas : void 0,
    typeof MessagePort !== "undefined" ? MessagePort : void 0
  ].filter(Boolean);
  const rpc = (port, api = {}, transferables = defaultTransferables) => {
    const xfer = (args, transferables2) => args.reduce((p, n) => {
      if (typeof n === "object") {
        if (transferables2.some((ctor) => n instanceof ctor)) {
          p.push(n);
        } else
          for (const key in n) {
            if (n[key] && transferables2.some((ctor) => n[key] instanceof ctor)) {
              p.push(n[key]);
            }
          }
      }
      return p;
    }, []);
    let callbackId = 0;
    const calls = /* @__PURE__ */ new Map();
    port.onmessage = async ({ data }) => {
      const { cid } = data;
      if (data.method) {
        let result;
        try {
          if (!(data.method in api)) {
            throw new TypeError(
              `Method "${data.method}" does not exist in RPC API.`
            );
          }
          if (typeof api[data.method] !== "function") {
            throw new TypeError(
              `Property "${data.method}" exists in RPC but is not type function, instead it is type: "${typeof api[data.method]}"`
            );
          }
          result = await api[data.method](...data.args);
          port.postMessage(
            { cid, result },
            xfer([result], transferables)
          );
        } catch (error) {
          port.postMessage({ cid, error });
        }
      } else {
        if (!calls.has(cid)) {
          console.log(cid, calls.size, Object.keys(data.result));
          throw new ReferenceError("Callback id not found: " + cid);
        }
        const { resolve, reject } = calls.get(cid);
        calls.delete(data.cid);
        if (data.error) reject(data.error);
        else resolve(data.result);
      }
    };
    const call = (method, ...args) => {
      const cid = ++callbackId;
      const deferred = Deferred();
      calls.set(cid, deferred);
      try {
        port.postMessage(
          { method, args, cid },
          xfer(args, transferables)
        );
      } catch (error) {
        console.error(`Rpc call failed: "${method}"`, args, error);
      }
      return deferred.promise;
    };
    const getter = Getter(
      (key) => call.bind(null, key),
      call
    );
    return getter;
  };
  const RING_BUFFER_SIZE = 16384;
  const CHUNK_SIZE = 128;
  const HISTORIES_COUNT = 128;
  const ARRAYS_COUNT = 1024;
  const MAX_DSP_INSTANCES = 128;
  const options = { "enable": ["simd", "relaxed-simd", "threads"], "importMemory": true, "initialMemory": 8192, "maximumMemory": 8192, "sharedMemory": true, "bindings": "esm", "runtime": "stub", "exportRuntime": true };
  var config = {
    options
  };
  const section = "sourceMappingURL";
  function read_uint(buf, pos = 0) {
    let n = 0;
    let shift = 0;
    let b = buf[pos];
    let outpos = pos + 1;
    while (b >= 128) {
      n = n | b - 128 << shift;
      b = buf[outpos];
      outpos++;
      shift += 7;
    }
    return [n + (b << shift), outpos];
  }
  function encode_uint(n) {
    let result = [];
    while (n > 127) {
      result.push(128 | n & 127);
      n = n >> 7;
    }
    result.push(n);
    return new Uint8Array(result);
  }
  function ab2str(buf) {
    let str = "";
    let bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  }
  function str2ab(str) {
    let bytes = new Uint8Array(str.length);
    for (let i = 0; i < str.length; i++) {
      bytes[i] = str[i].charCodeAt(0);
    }
    return bytes;
  }
  function writeSection(name, value) {
    const nameBuf = str2ab(name);
    const valBuf = str2ab(value);
    const nameLen = encode_uint(nameBuf.length);
    const valLen = encode_uint(valBuf.length);
    const sectionLen = nameLen.length + nameBuf.length + valLen.length + valBuf.length;
    const headerLen = encode_uint(sectionLen);
    let bytes = new Uint8Array(sectionLen + headerLen.length + 1);
    let pos = 1;
    bytes.set(headerLen, pos);
    pos += headerLen.length;
    bytes.set(nameLen, pos);
    pos += nameLen.length;
    bytes.set(nameBuf, pos);
    pos += nameBuf.length;
    bytes.set(valLen, pos);
    pos += valLen.length;
    bytes.set(valBuf, pos);
    return bytes;
  }
  function findSection(buf, id) {
    let pos = 8;
    while (pos < buf.byteLength) {
      const sec_start = pos;
      const [sec_id, pos2] = read_uint(buf, pos);
      const [sec_size, body_pos] = read_uint(buf, pos2);
      pos = body_pos + sec_size;
      if (sec_id == 0) {
        const [name_len, name_pos] = read_uint(buf, body_pos);
        const name = buf.slice(name_pos, name_pos + name_len);
        const nameString = ab2str(name);
        if (nameString == id) {
          return [sec_start, sec_size + 1 + (body_pos - pos2), name_pos + name_len];
        }
      }
    }
    return [-1, null, null];
  }
  const wasmSourceMap = {
    /**
     * GetSourceMapURL extracts the source map from a WASM buffer.
     * @param {Buffer} buf The WASM buffer
     * @returns {String|null} The linked sourcemap URL if present.
     */
    getSourceMapURL: function(buf) {
      buf = new Uint8Array(buf);
      const [sec_start, _, uri_start] = findSection(buf, section);
      if (sec_start == -1) {
        return null;
      }
      const [uri_len, uri_pos] = read_uint(buf, uri_start);
      return ab2str(buf.slice(uri_pos, uri_pos + uri_len));
    },
    removeSourceMapURL: function(buf) {
      buf = new Uint8Array(buf);
      const [sec_start, sec_size, _] = findSection(buf, section);
      if (sec_start == -1) {
        return buf;
      }
      let strippedBuf = new Uint8Array(buf.length - sec_size);
      strippedBuf.set(buf.slice(0, sec_start));
      strippedBuf.set(buf.slice(sec_start + sec_size), sec_start);
      return strippedBuf;
    },
    setSourceMapURL: function(buf, url) {
      const stripped = this.removeSourceMapURL(buf);
      const newSection = writeSection(section, url);
      const outBuf = new Uint8Array(stripped.length + newSection.length);
      outBuf.set(stripped);
      outBuf.set(newSection, stripped.length);
      return outBuf;
    }
  };
  function liftString(memory, pointer) {
    if (!pointer) return "";
    const end = pointer + new Uint32Array(memory.buffer)[pointer - 4 >>> 2] >>> 1, memoryU16 = new Uint16Array(memory.buffer);
    let start = pointer >>> 1, string = "";
    while (end - start > 1024) {
      string += String.fromCharCode(...memoryU16.subarray(start, start += 1024));
    }
    return string + String.fromCharCode(...memoryU16.subarray(start, end));
  }
  async function wasmSetup({ binary, sourcemapUrl, config: config2, imports }) {
    const buffer = wasmSourceMap.setSourceMapURL(binary, sourcemapUrl);
    const uint8 = new Uint8Array(buffer);
    const memory = new WebAssembly.Memory({
      initial: config2.options.initialMemory,
      maximum: config2.options.maximumMemory,
      shared: config2.options.sharedMemory
    });
    const mod = await WebAssembly.compile(uint8.buffer);
    const extraImports = typeof imports === "function" ? imports({ memory }) : imports;
    const importObject = {
      env: {
        memory,
        abort(message$, fileName$, lineNumber$, columnNumber$) {
          const message = liftString(memory, message$ >>> 0);
          const fileName = liftString(memory, fileName$ >>> 0);
          const lineNumber = lineNumber$ >>> 0;
          const columnNumber = columnNumber$ >>> 0;
          throw new Error(`${message} in ${fileName}:${lineNumber}:${columnNumber}`);
        },
        seed: () => Date.now() * Math.random(),
        log: console.log,
        "console.log": (textPtr) => {
          console.log(liftString(memory, textPtr));
        },
        "console.warn": (textPtr) => {
          console.warn(liftString(memory, textPtr));
        }
      },
      host: {
        // Default stubs so tooling instantiations (e.g. visual wasm) don't fail.
        sampleVersion: (_sampleIndex) => 0,
        sampleLen: (_sampleIndex) => 0,
        sampleRead: (_sampleIndex, _start, _length, _outPtr) => 0,
        sampleSet: (_sampleIndex, _length, _inPtr) => {
        },
        sampleSlices: (_sampleIndex, _threshold, _outPtr, _max) => 0
      }
    };
    if (extraImports) {
      for (const k of Object.keys(extraImports)) {
        const mod2 = extraImports[k];
        if (!mod2) continue;
        importObject[k] = { ...importObject[k], ...mod2 };
      }
    }
    const instance = await WebAssembly.instantiate(mod, importObject);
    const wasm = instance.exports;
    return {
      wasm,
      memory
    };
  }
  class StructLinearView {
    constructor(view, type, fieldOffset, length) {
      this.view = view;
      this.type = type;
      this.fieldOffset = fieldOffset;
      this.length = length;
      this.byteLength = this.length * sizes[type];
      this.methods = methods[type];
      this.elementSize = sizes[type];
    }
    byteLength;
    elementSize;
    methods;
    get byteOffset() {
      return this.view.byteOffset + this.fieldOffset;
    }
    get(index, littleEndian = this.view.littleEndian) {
      return this.methods[0].call(
        this.view.dataView,
        this.byteOffset + index * this.elementSize,
        littleEndian
      );
    }
    set(index, value, littleEndian = this.view.littleEndian) {
      this.methods[1].call(
        this.view.dataView,
        this.byteOffset + index * this.elementSize,
        value,
        littleEndian
      );
    }
  }
  class StructCollection {
    constructor(view, factory, fieldOffset, length) {
      this.view = view;
      this.factory = factory;
      this.fieldOffset = fieldOffset;
      this.length = length;
      this.byteLength = length * factory.byteLength;
      this.instance = this.factory(this.view.buffer, this.view.byteOffset + this.fieldOffset);
    }
    byteLength;
    instance;
    get byteOffset() {
      return this.view.byteOffset + this.fieldOffset;
    }
    at(index) {
      this.instance.byteOffset = this.byteOffset + index * this.factory.byteLength;
      return this.instance;
    }
    get(index) {
      return this.factory(this.view.buffer, this.byteOffset + index * this.factory.byteLength);
    }
  }
  const sizes = {
    bool: 1,
    u8: 1,
    u16: 2,
    u32: 4,
    u64: 8,
    i8: 1,
    i16: 2,
    i32: 4,
    i64: 8,
    f32: 4,
    f64: 8,
    usize: 4
  };
  const methods = {
    bool: [DataView.prototype.getUint8, DataView.prototype.setUint8],
    u8: [DataView.prototype.getUint8, DataView.prototype.setUint8],
    u16: [DataView.prototype.getUint16, DataView.prototype.setUint16],
    u32: [DataView.prototype.getUint32, DataView.prototype.setUint32],
    u64: [DataView.prototype.getBigUint64, DataView.prototype.setBigUint64],
    i8: [DataView.prototype.getInt8, DataView.prototype.setInt8],
    i16: [DataView.prototype.getInt16, DataView.prototype.setInt16],
    i32: [DataView.prototype.getInt32, DataView.prototype.setInt32],
    i64: [DataView.prototype.getBigInt64, DataView.prototype.setBigInt64],
    f32: [DataView.prototype.getFloat32, DataView.prototype.setFloat32],
    f64: [DataView.prototype.getFloat64, DataView.prototype.setFloat64],
    usize: [DataView.prototype.getUint32, DataView.prototype.setUint32]
  };
  function getSizeOf(schema) {
    let byteLength = 0;
    for (const type of Object.values(schema)) {
      if (typeof type === "string") {
        byteLength += sizes[type];
      } else if (Array.isArray(type)) {
        const [subType, count] = type;
        if (typeof subType === "string") {
          byteLength += count * sizes[subType];
        } else {
          byteLength += count * subType.byteLength;
        }
      } else {
        byteLength += type.byteLength;
      }
    }
    return byteLength;
  }
  function Struct(schema, littleEndian = true) {
    let byteLength = getSizeOf(schema);
    const factory = (buffer, byteOffset) => {
      let arrayBuffer;
      let dataView;
      if (buffer instanceof ArrayBuffer || typeof SharedArrayBuffer !== "undefined" && buffer instanceof SharedArrayBuffer) {
        arrayBuffer = buffer;
      } else {
        arrayBuffer = buffer.buffer;
        if (buffer instanceof DataView) {
          byteOffset = buffer.byteOffset;
          dataView = new DataView(arrayBuffer);
        } else {
          byteOffset = buffer.byteOffset;
        }
      }
      byteOffset ??= 0;
      if (!dataView) dataView = new DataView(arrayBuffer);
      const structViewData = {
        buffer: arrayBuffer,
        dataView,
        byteOffset,
        byteLength,
        littleEndian,
        get ptr() {
          return this.byteOffset;
        }
      };
      const structView = structViewData;
      byteOffset = 0;
      const entries = [];
      for (const [key, type] of Object.entries(schema)) {
        let desc;
        if (typeof type === "string") {
          const m = methods[type];
          const fieldOffset = byteOffset;
          desc = {
            get() {
              return m[0].call(dataView, structView.byteOffset + fieldOffset, structView.littleEndian);
            },
            set(value) {
              m[1].call(dataView, structView.byteOffset + fieldOffset, value, structView.littleEndian);
            }
          };
          byteOffset += sizes[type];
        } else if (Array.isArray(type)) {
          if (typeof type[0] === "string") {
            const fieldOffset = byteOffset;
            desc = {
              value: new StructLinearView(
                structView,
                type[0],
                fieldOffset,
                type[1]
              )
            };
            byteOffset += desc.value.byteLength;
          } else {
            const fieldOffset = byteOffset;
            const value = new StructCollection(
              structView,
              type[0],
              fieldOffset,
              type[1]
            );
            desc = { value };
            byteOffset += value.byteLength;
          }
        } else {
          const fieldOffset = byteOffset;
          const value = type(arrayBuffer, fieldOffset);
          desc = { value };
          byteOffset += value.byteLength;
        }
        entries.push([key, desc]);
      }
      Object.defineProperties(structView, Object.fromEntries(entries));
      return structView;
    };
    return Object.assign(factory, { byteLength, type: {} });
  }
  const DspStruct = Struct({
    program: "usize"
  });
  Struct({
    outs: "usize"
  });
  Struct({
    outs: "usize"
  });
  Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  Struct({
    ops: "usize",
    arrays: "usize",
    literals: "usize"
  });
  Struct({
    lock: "i32",
    data: "usize",
    histories: "usize",
    analyserOutsPool: "usize",
    compressorOutsPool: "usize",
    expanderOutsPool: "usize",
    gateOutsPool: "usize",
    limiterOutsPool: "usize",
    arrayAccessHistory: "usize",
    branchHistory: "usize",
    sampleNeedleHistory: "usize",
    filterHistory: "usize",
    lfoHistory: "usize",
    reverbHistory: "usize",
    trigHistory: "usize",
    envelopeHistory: "usize"
  });
  function computePeaks(ch0, w) {
    const len = ch0.length | 0;
    const outW = Math.max(1, w | 0);
    const out = new Float32Array(outW * 2);
    if (len <= 0) {
      out.fill(0);
      return out;
    }
    for (let i = 0; i < outW; i++) {
      const from = Math.floor(i * len / outW);
      const to = Math.floor((i + 1) * len / outW);
      const a = Math.max(0, Math.min(len - 1, from));
      const b = Math.max(a + 1, Math.min(len, to));
      let mn = ch0[a] ?? 0;
      let mx = mn;
      for (let j = a + 1; j < b; j++) {
        const v = ch0[j] ?? 0;
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
      const base = i * 2;
      out[base] = mn;
      out[base + 1] = mx;
    }
    return out;
  }
  const clamp$1 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  function detectSlices(samples, threshold, max) {
    const m = Math.max(1, max | 0);
    const points = new Int32Array(m);
    const len = samples.length | 0;
    if (len <= 0) return { points, count: 0 };
    let count = 0;
    const thr = clamp$1(threshold, 0, 1);
    const desiredBuckets = Math.max(256, Math.min(16384, m * 16 | 0));
    const minBucketSamples = 32;
    const maxBucketsByMinSize = Math.max(1, Math.floor(len / minBucketSamples));
    const bucketCount = Math.max(1, Math.min(len, desiredBuckets, maxBucketsByMinSize));
    if (bucketCount <= 1) {
      points[0] = 0;
      return { points, count: 1 };
    }
    const peaks = computePeaks(samples, bucketCount);
    const rise = new Float32Array(bucketCount);
    let riseMax = 0;
    let prevAmp = 0;
    for (let i = 0; i < bucketCount; i++) {
      const base = i * 2;
      const mn = peaks[base] ?? 0;
      const mx = peaks[base + 1] ?? 0;
      const amp = Math.max(Math.abs(mn), Math.abs(mx));
      const d = i === 0 ? 0 : Math.max(0, amp - prevAmp);
      rise[i] = d;
      if (d > riseMax) riseMax = d;
      prevAmp = amp;
    }
    if (riseMax <= 0) {
      points[0] = 0;
      return { points, count: 1 };
    }
    const minRise = riseMax * (0.02 + thr * 0.28);
    const noveltyMin = riseMax * (0.01 + thr * 0.18);
    const ratioMin = thr * 0.9;
    const minDistanceBuckets = 1 + (thr * 24 | 0);
    const rearmLevel = riseMax * (6e-3 + thr * 0.06);
    const cooldownFrames = 1 + (thr * 10 | 0);
    const fastCoeff = 0.25;
    const slowCoeff = 0.02;
    let fast = rise[0] ?? 0;
    let slow = fast;
    let prev2 = 0;
    let prev1 = 0;
    let prevFast1 = fast;
    let prevSlow1 = slow;
    let lastPeakBucket = -1073741823;
    let armed = true;
    let cooldown = 0;
    let mg = 0;
    const bucketStart = (b) => Math.floor(b * len / bucketCount);
    for (let frame = 1; frame < bucketCount && count < m; frame++) {
      const e = rise[frame] ?? 0;
      fast += (e - fast) * fastCoeff;
      slow += (e - slow) * slowCoeff;
      const novelty = Math.max(0, fast - slow);
      const release = 0.995 + thr * 0.01;
      mg *= release;
      const mgMul = 1 + mg * (10 + thr * 12);
      const effMinRise = minRise * mgMul;
      const effNoveltyMin = noveltyMin * mgMul;
      const baseMinDistanceBuckets = Math.max(2, Math.floor(minDistanceBuckets * (1 + mg * 2)));
      const effMinDistanceBuckets = count <= 2 ? Math.max(baseMinDistanceBuckets, 4 + (thr * 8 | 0)) : baseMinDistanceBuckets;
      if (!armed && novelty <= rearmLevel) armed = true;
      if (cooldown > 0) cooldown--;
      if (frame >= 2) {
        const isPeak = prev1 > prev2 && prev1 >= novelty;
        if (isPeak) {
          const posBucket = frame - 1 | 0;
          const bucketDelta = posBucket - lastPeakBucket;
          const base = Math.max(prevSlow1, riseMax * 1e-5);
          const ratio = prevFast1 / base;
          if (armed && cooldown <= 0 && bucketDelta >= effMinDistanceBuckets && prevFast1 >= effMinRise && ratio >= 1 + ratioMin && prev1 >= effNoveltyMin) {
            const s = bucketStart(posBucket);
            const last = count > 0 ? points[count - 1] ?? 0 : -1;
            if (s > last) {
              points[count++] = s;
              lastPeakBucket = posBucket;
              armed = false;
              cooldown = cooldownFrames;
              mg = Math.min(1, mg + 0.75);
            }
          }
        }
      }
      prev2 = prev1;
      prev1 = novelty;
      prevFast1 = fast;
      prevSlow1 = slow;
    }
    if (count <= 0) {
      points[0] = 0;
      return { points, count: 1 };
    }
    return { points, count };
  }
  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }
  function workletImports(memory, samples) {
    const recordCache = samples.__recordCache ?? /* @__PURE__ */ new Map();
    samples.__recordCache = recordCache;
    return {
      host: {
        sampleVersion: (sampleIndex) => {
          const s = samples.get(sampleIndex | 0);
          return s ? s.ver | 0 : 0;
        },
        sampleLen: (sampleIndex) => {
          const s = samples.get(sampleIndex | 0);
          return s ? s.len | 0 : 0;
        },
        sampleRead: (sampleIndex, start, length, outPtr) => {
          const s = samples.get(sampleIndex | 0);
          const n = length | 0;
          if (!memory?.buffer || outPtr === 0 || n <= 0) return 0;
          const out = new Float32Array(memory.buffer, outPtr >>> 0, n);
          if (!s || !s.ch0 || s.len <= 0) {
            out.fill(0);
            return 0;
          }
          const src = s.ch0;
          const len = s.len | 0;
          const a = start | 0;
          const from = clamp(a, 0, len);
          const to = clamp(a + n, 0, len);
          const take = Math.max(0, to - from);
          if (take > 0) out.set(src.subarray(from, from + take), 0);
          if (take < n) out.fill(0, take);
          return take | 0;
        },
        sampleSet: (sampleIndex, sampleRate2, length, inPtr) => {
          const idx = sampleIndex | 0;
          const n = length | 0;
          if (!memory?.buffer || inPtr === 0 || n <= 0) return;
          const src = new Float32Array(memory.buffer, inPtr >>> 0, n);
          const copy = src.slice();
          const prev = samples.get(idx);
          const ver = (prev?.ver ?? 0) + 1 | 0;
          samples.set(idx, { ver, sampleRate: sampleRate2, len: copy.length | 0, ch0: copy });
        },
        recordCacheLoad: (hash, sampleIndex) => {
          const h = hash >>> 0;
          const idx = sampleIndex | 0;
          const s = recordCache.get(h);
          if (!s) return 0;
          const prev = samples.get(idx);
          const ver = (prev?.ver ?? 0) + 1 | 0;
          samples.set(idx, { ver, sampleRate: s.sampleRate | 0, len: s.len | 0, ch0: s.ch0 });
          return s.len | 0;
        },
        recordCacheStore: (hash, sampleIndex) => {
          const h = hash >>> 0;
          const idx = sampleIndex | 0;
          const s = samples.get(idx);
          if (!s || !s.ch0 || (s.len | 0) <= 0) return;
          recordCache.set(h, s);
        },
        sampleSlices: (sampleIndex, threshold, outPtr, max) => {
          const s = samples.get(sampleIndex | 0);
          const m = max | 0;
          if (!memory?.buffer || outPtr === 0 || m <= 0) return 0;
          const out = new Int32Array(memory.buffer, outPtr >>> 0, m);
          if (!s || !s.ch0 || s.len <= 0) {
            out.fill(0);
            return 0;
          }
          const key = (threshold || 0) * 1e3 | 0;
          if (!s.slices || s.slices.k !== key) {
            const res = detectSlices(s.ch0, threshold || 0, m);
            const n2 = Math.min(m, res.count | 0);
            s.slices = { k: key, count: n2, points: res.points };
            out.set(res.points.subarray(0, n2));
            if (n2 < m) out.fill(0, n2);
            return n2 | 0;
          }
          const points = s.slices.points;
          const n = Math.min(m, s.slices.count | 0);
          out.set(points.subarray(0, n));
          if (n < m) out.fill(0, n);
          return n | 0;
        }
      }
    };
  }
  var ControlOp = /* @__PURE__ */ ((ControlOp2) => {
    ControlOp2[ControlOp2["Pause"] = 0] = "Pause";
    ControlOp2[ControlOp2["Start"] = 1] = "Start";
    ControlOp2[ControlOp2["Stop"] = 2] = "Stop";
    ControlOp2[ControlOp2["Seek"] = 3] = "Seek";
    ControlOp2[ControlOp2["Swap"] = 4] = "Swap";
    ControlOp2[ControlOp2["SeekImmediate"] = 5] = "SeekImmediate";
    ControlOp2[ControlOp2["RestartWithProgram"] = 6] = "RestartWithProgram";
    return ControlOp2;
  })(ControlOp || {});
  const CROSSFADE_CHUNKS = 64;
  const f32BitsBuf = new ArrayBuffer(4);
  const f32BitsView = new DataView(f32BitsBuf);
  function u32ToF32(v) {
    f32BitsView.setUint32(0, v >>> 0, true);
    return f32BitsView.getFloat32(0, true);
  }
  class Limiter {
    constructor(ceiling = 0.9, attack = 0.2, release = 1e-3) {
      this.ceiling = ceiling;
      this.attack = attack;
      this.release = release;
    }
    gain = 1;
    process(left, right) {
      let peak = 0;
      for (let i = 0; i < left.length; i++) {
        const l = Math.abs(left[i]);
        const r = Math.abs(right[i]);
        if (l > peak) peak = l;
        if (r > peak) peak = r;
      }
      const target = peak > this.ceiling ? this.ceiling / peak : 1;
      const coeff = target < this.gain ? this.attack : this.release;
      for (let i = 0; i < left.length; i++) {
        this.gain += (target - this.gain) * coeff;
        left[i] = Math.tanh(left[i] * this.gain);
        right[i] = Math.tanh(right[i] * this.gain);
      }
    }
  }
  class DspProcessor extends AudioWorkletProcessor {
    constructor(options2) {
      super();
      this.options = options2;
      rpc(this.port, this);
      this.swapStatus = this.options.processorOptions.swapStatus;
      this.seekSample = this.options.processorOptions.seekSample;
      this.loop = this.options.processorOptions.loop;
      this.hardLoop = this.options.processorOptions.hardLoop;
    }
    state = "stopped";
    core;
    dsps = [];
    samples = /* @__PURE__ */ new Map();
    outLeft = new Float32Array(CHUNK_SIZE);
    outRight = new Float32Array(CHUNK_SIZE);
    seekLeft = new Float32Array(CHUNK_SIZE);
    seekRight = new Float32Array(CHUNK_SIZE);
    scratchLeft$ = 0;
    scratchRight$ = 0;
    scratchLeft;
    scratchRight;
    lastBpm = 60;
    shouldReset = false;
    lastControl = ControlOp.Pause;
    prepareStableBlocks = 0;
    fadeLeft$ = 0;
    fadeRight$ = 0;
    fadeLeft;
    fadeRight;
    limiter = new Limiter();
    swapStatus;
    crossfadeState = /* @__PURE__ */ new Map();
    seekSample;
    loop;
    hardLoop;
    signalSwapResult(value) {
      if (!this.swapStatus) return;
      Atomics.store(this.swapStatus, 0, value);
      Atomics.store(this.swapStatus, 1, 1);
      Atomics.notify(this.swapStatus, 1, 1);
    }
    hasActiveRecord() {
      const core = this.core;
      if (!core) return false;
      const wasm = core.wasm;
      const seen = /* @__PURE__ */ new Set();
      for (const dsp of this.dsps) {
        if (!dsp.view.program) continue;
        const program$ = dsp.view.program;
        if (!seen.has(program$)) {
          seen.add(program$);
          if ((wasm.getProgramRecordActive(program$) | 0) !== 0) return true;
        }
        const swap = this.crossfadeState.get(dsp.dsp$);
        if (swap) {
          const a = swap.oldProgram$ | 0;
          const b = swap.newProgram$ | 0;
          if (a && !seen.has(a)) {
            seen.add(a);
            if ((wasm.getProgramRecordActive(a) | 0) !== 0) return true;
          }
          if (b && !seen.has(b)) {
            seen.add(b);
            if ((wasm.getProgramRecordActive(b) | 0) !== 0) return true;
          }
        }
      }
      return false;
    }
    async setWasmBinary(binary) {
      this.core = await wasmSetup({
        binary,
        config,
        sourcemapUrl: this.options.processorOptions.sourcemapUrl,
        imports: ({ memory }) => workletImports(memory, this.samples)
      });
      this.core.wasm.sampleRate.value = sampleRate;
      this.core.wasm.nyquist.value = sampleRate * 0.5 - sampleRate * 0.1;
      this.dsps = [];
      this.addDsp();
      this.scratchLeft$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE);
      this.scratchRight$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE);
      this.scratchLeft = new Float32Array(this.core.memory.buffer, this.scratchLeft$, CHUNK_SIZE);
      this.scratchRight = new Float32Array(this.core.memory.buffer, this.scratchRight$, CHUNK_SIZE);
      this.fadeLeft$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE);
      this.fadeRight$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE);
      this.fadeLeft = new Float32Array(this.core.memory.buffer, this.fadeLeft$, CHUNK_SIZE);
      this.fadeRight = new Float32Array(this.core.memory.buffer, this.fadeRight$, CHUNK_SIZE);
      const initialBpm = this.options.processorOptions.bpmValue[0];
      this.core.wasm.bpm.value = initialBpm;
      this.lastBpm = initialBpm;
      return {
        memory: this.core.memory,
        dsp$: this.dsps[0]?.dsp$ ?? 0
      };
    }
    async setSample(sampleIndex, sampleRate2, length, ch0Buffer) {
      const index = sampleIndex | 0;
      const len = length | 0;
      const sr = Number(sampleRate2) || 0;
      const ch0 = new Float32Array(ch0Buffer);
      const prev = this.samples.get(index);
      const ver = (prev?.ver ?? 0) + 1 | 0;
      this.samples.set(index, { ver, sampleRate: sr, len: Math.min(len, ch0.length | 0), ch0 });
    }
    async getSample(sampleIndex) {
      const s = this.samples.get(sampleIndex | 0);
      if (!s) return null;
      if (s.len <= 0 || !s.ch0) return null;
      const copy = s.ch0.slice();
      return {
        ver: s.ver | 0,
        sampleRate: s.sampleRate | 0,
        length: s.len | 0,
        ch0Buffer: copy.buffer
      };
    }
    async getSampleVersion(sampleIndex) {
      const s = this.samples.get(sampleIndex | 0);
      return s ? s.ver | 0 : 0;
    }
    async clearSamples() {
      this.samples.clear();
    }
    async createProgram() {
      return this.core.wasm.createProgram();
    }
    async createArrays() {
      return Array.from({ length: ARRAYS_COUNT }, () => this.core.wasm.createArray());
    }
    async createHistories() {
      return Array.from({ length: HISTORIES_COUNT }, () => this.core.wasm.createHistoryArray());
    }
    async createProgramData() {
      return this.core.wasm.createProgramData();
    }
    async createOps() {
      return this.core.wasm.createOps();
    }
    async syncBpm(oldBpm, newBpm) {
      if (!this.core) return;
      this.core.wasm.updateBpm(oldBpm, newBpm);
    }
    async invalidateRecordings(program$) {
      if (!this.core) return;
      this.core.wasm.invalidateRecordings(program$);
    }
    async createDsp(program$) {
      return this.addDsp(program$);
    }
    addDsp(program$) {
      if (!this.core) throw new Error("Wasm not ready");
      const dsp$ = this.core.wasm.createDsp();
      const view = DspStruct(this.core.memory.buffer, dsp$);
      if (program$) view.program = program$;
      this.dsps.push({ dsp$, view });
      return dsp$;
    }
    renderProgram(instance, program$, left$, right$, begin, length) {
      if (!this.core) return;
      instance.view.program = program$;
      this.core.wasm.processAudio(instance.dsp$, left$, right$, begin, length);
    }
    renderSwapSegment(instance, state, begin, length, sampleBefore, chunkOffset, chunkLength) {
      if (!this.core || !this.fadeLeft || !this.fadeRight || !this.scratchLeft || !this.scratchRight) return;
      const wasm = this.core.wasm;
      wasm.globalSampleCount.value = sampleBefore;
      wasm.clearVmError();
      this.renderProgram(instance, state.oldProgram$, this.scratchLeft$, this.scratchRight$, begin, length);
      if (state.chunkIndex === 0 && chunkOffset === 0) {
        wasm.globalSampleCount.value = sampleBefore;
        wasm.clearVmError();
        wasm.copyProgram(state.newProgram$, state.oldProgram$);
      }
      wasm.globalSampleCount.value = sampleBefore;
      wasm.clearVmError();
      this.renderProgram(instance, state.newProgram$, this.fadeLeft$, this.fadeRight$, begin, length);
      const totalSamples = state.totalChunks * chunkLength;
      const baseOffset = state.chunkIndex * chunkLength + chunkOffset;
      for (let i = 0; i < length; i++) {
        const sampleNumber = baseOffset + i;
        const t = totalSamples > 1 ? sampleNumber / (totalSamples - 1) : 1;
        const inv = 1 - t;
        this.scratchLeft[i] = this.scratchLeft[i] * inv + this.fadeLeft[i] * t;
        this.scratchRight[i] = this.scratchRight[i] * inv + this.fadeRight[i] * t;
      }
    }
    advanceSwapState(instance, state) {
      state.chunkIndex += 1;
      if (state.chunkIndex >= state.totalChunks) {
        this.finishCrossfade(instance, state);
      }
    }
    finishCrossfade(instance, state) {
      if (!this.core) return;
      this.crossfadeState.delete(instance.dsp$);
      instance.view.program = state.newProgram$;
      const wasm = this.core.wasm;
      const vmErrorCode = wasm.getVmErrorCode?.() ?? 0;
      const statusValue = vmErrorCode === 0 ? 1 : -1;
      if (this.swapStatus) {
        Atomics.store(this.swapStatus, 0, statusValue);
        Atomics.store(this.swapStatus, 1, 1);
        Atomics.notify(this.swapStatus, 1, 1);
      }
      if (!this.crossfadeState.size) {
        Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start);
      }
    }
    applySeekSample(targetSample) {
      if (!this.core) return;
      const clamped = Math.max(0, targetSample);
      this.core.wasm.globalSampleCount.value = clamped;
      Atomics.store(this.options.processorOptions.globalSampleCount, 0, clamped);
      for (const dsp of this.dsps) {
        this.core.wasm.resetDsp(dsp.dsp$);
      }
    }
    renderChunk(sampleBefore, begin, length, rangeEnabled, rangeStart, rangeEnd, rangeLength, outLeft, outRight, advanceSwap) {
      if (!this.core || !this.scratchLeft || !this.scratchRight) return { didRangeSeek: false, swapToAdvance: [] };
      outLeft.fill(0);
      outRight.fill(0);
      let didRangeSeek = false;
      const segs = [];
      if (rangeEnabled && rangeLength > 0 && sampleBefore + length > rangeEnd) {
        const len1 = Math.max(0, rangeEnd - sampleBefore);
        const len2 = Math.max(0, length - len1);
        if (len1 > 0) {
          segs.push({ sampleStart: sampleBefore, begin, length: len1, outOffset: 0 });
        }
        if (len2 > 0) {
          segs.push({ sampleStart: rangeStart, begin: begin + len1, length: len2, outOffset: len1 });
        }
      } else {
        segs.push({ sampleStart: sampleBefore, begin, length, outOffset: 0 });
      }
      const swapToAdvance = [];
      const swapSeen = /* @__PURE__ */ new Set();
      for (let segIndex = 0; segIndex < segs.length; segIndex++) {
        const seg = segs[segIndex];
        if (rangeEnabled && rangeLength > 0 && segIndex === 1 && seg.outOffset > 0) {
          this.applySeekSample(rangeStart);
          didRangeSeek = true;
        }
        for (const dsp of this.dsps) {
          if (!dsp.view.program) continue;
          const swapState = this.crossfadeState.get(dsp.dsp$);
          if (swapState && !swapSeen.has(dsp.dsp$)) {
            swapSeen.add(dsp.dsp$);
            swapToAdvance.push({ dsp, state: swapState });
          }
          this.core.wasm.globalSampleCount.value = seg.sampleStart;
          if (swapState) {
            this.renderSwapSegment(dsp, swapState, seg.begin, seg.length, seg.sampleStart, seg.outOffset, length);
          } else {
            this.renderProgram(dsp, dsp.view.program, this.scratchLeft$, this.scratchRight$, seg.begin, seg.length);
          }
          for (let i = 0; i < seg.length; i++) {
            const j = seg.outOffset + i;
            outLeft[j] += this.scratchLeft[i];
            outRight[j] += this.scratchRight[i];
          }
        }
      }
      if (advanceSwap) {
        for (const s of swapToAdvance) {
          this.advanceSwapState(s.dsp, s.state);
        }
      }
      return { didRangeSeek, swapToAdvance };
    }
    reset() {
      if (!this.core) return;
      this.core.wasm.resetGlobalSampleCount();
      Atomics.store(this.options.processorOptions.globalSampleCount, 0, 0);
      for (const dsp of this.dsps) {
        this.core.wasm.resetDsp(dsp.dsp$);
      }
      this.state = "stopped";
    }
    process(inputs, outputs, parameters) {
      try {
        if (!this.core || !this.scratchLeft || !this.scratchRight) return true;
        let control = Atomics.load(this.options.processorOptions.control, 0);
        let seekTargetSample;
        const isRestartWithProgram = control === ControlOp.RestartWithProgram;
        if (control === ControlOp.Seek) {
          const seekSample = this.seekSample;
          if (seekSample) {
            const targetSample = Math.max(0, Atomics.load(seekSample, 0));
            seekTargetSample = targetSample;
          }
          control = this.lastControl;
          Atomics.store(this.options.processorOptions.control, 0, control);
        } else if (control === ControlOp.SeekImmediate) {
          const seekSample = this.seekSample;
          if (seekSample) {
            const targetSample = Math.max(0, Atomics.load(seekSample, 0));
            this.applySeekSample(targetSample);
          }
          control = this.lastControl;
          Atomics.store(this.options.processorOptions.control, 0, control);
        }
        if (!isRestartWithProgram && control !== this.lastControl) {
          if (control === ControlOp.Start) {
            if (this.state === "stopped") {
              this.state = "preparing";
              this.shouldReset = false;
              this.prepareStableBlocks = 0;
            } else if (this.state === "fade-out") {
              this.state = "running";
              this.shouldReset = false;
            }
          } else if (control === ControlOp.Pause && (this.state === "running" || this.state === "fade-in" || this.state === "preparing")) {
            this.state = "fade-out";
            this.shouldReset = false;
          } else if (control === ControlOp.Stop && (this.state === "running" || this.state === "stopped")) {
            if (this.state === "running") {
              this.state = "fade-out";
              this.shouldReset = true;
            } else {
              this.reset();
              Atomics.store(this.options.processorOptions.control, 0, this.lastControl);
              return true;
            }
          } else if (control === ControlOp.Swap && this.state === "stopped") {
            const swap = this.options.processorOptions.programSwap;
            for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
              const base = i * 3;
              const old$ = Atomics.load(swap, base);
              const new$ = Atomics.load(swap, base + 1);
              const targetDsp$ = Atomics.load(swap, base + 2);
              if (old$ && new$ && targetDsp$) {
                const dsp = this.dsps.find((d) => d.dsp$ === targetDsp$);
                if (dsp) {
                  dsp.view.program = new$;
                }
              }
            }
            Atomics.store(this.options.processorOptions.control, 0, this.lastControl);
            this.signalSwapResult(1);
          }
          this.lastControl = control;
        }
        let sampleBefore = this.core.wasm.globalSampleCount.value;
        let didRangeSeek = false;
        const hardLoop = this.hardLoop;
        const hardEnabled = hardLoop ? Atomics.load(hardLoop, 0) === 1 : false;
        const hardStart = 0;
        const hardEnd = hardEnabled ? Atomics.load(hardLoop, 1) : 0;
        const hardLength = hardEnabled ? Math.max(0, hardEnd - hardStart) : 0;
        const loop = this.loop;
        const loopEnabled = loop ? Atomics.load(loop, 0) === 1 : false;
        const loopStartRaw = loopEnabled ? Atomics.load(loop, 1) : 0;
        const loopEndRaw = loopEnabled ? Atomics.load(loop, 2) : 0;
        const loopLengthRaw = loopEnabled ? Math.max(0, loopEndRaw - loopStartRaw) : 0;
        let rangeEnabled = loopEnabled && loopLengthRaw > 0;
        let rangeStart = loopStartRaw;
        let rangeEnd = loopEndRaw;
        if (hardEnabled && hardLength > 0) {
          if (!rangeEnabled) {
            rangeEnabled = true;
            rangeStart = hardStart;
            rangeEnd = hardEnd;
          } else {
            rangeStart = Math.max(rangeStart, hardStart);
            rangeEnd = Math.min(rangeEnd, hardEnd);
            if (rangeEnd <= rangeStart) rangeEnabled = false;
          }
        }
        const rangeLength = rangeEnabled ? Math.max(0, rangeEnd - rangeStart) : 0;
        if (isRestartWithProgram) {
          const ringPos2 = Atomics.load(this.options.processorOptions.ringPos, 0);
          const begin2 = ringPos2 * CHUNK_SIZE;
          const length2 = CHUNK_SIZE;
          const seekSample = this.seekSample ? Math.max(0, Atomics.load(this.seekSample, 0)) : 0;
          const restartSample = rangeEnabled && rangeLength > 0 && (seekSample < rangeStart || seekSample >= rangeEnd) ? rangeStart : seekSample;
          const swap = this.options.processorOptions.programSwap;
          let newProgram$ = 0;
          let targetDsp$ = 0;
          let bpmBits = 0;
          for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
            const base = i * 3;
            const bits = Atomics.load(swap, base);
            const new$ = Atomics.load(swap, base + 1);
            const dsp$ = Atomics.load(swap, base + 2);
            if (new$ && dsp$) {
              bpmBits = bits;
              newProgram$ = new$;
              targetDsp$ = dsp$;
              break;
            }
          }
          const target = targetDsp$ ? this.dsps.find((d) => d.dsp$ === targetDsp$) : void 0;
          if (!newProgram$ || !target) {
            this.signalSwapResult(-1);
            Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start);
            control = ControlOp.Start;
          } else {
            this.applySeekSample(restartSample);
            if (bpmBits) {
              const bpm = u32ToF32(bpmBits);
              this.core.wasm.bpm.value = bpm;
              this.options.processorOptions.bpmValue[0] = bpm;
              this.lastBpm = bpm;
            }
            target.view.program = newProgram$;
            this.state = "preparing";
            this.prepareStableBlocks = 0;
            this.lastControl = ControlOp.Start;
            Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start);
            control = ControlOp.Start;
            Atomics.store(
              this.options.processorOptions.ringPos,
              0,
              (ringPos2 + 1) % (RING_BUFFER_SIZE / CHUNK_SIZE)
            );
            outputs[0][0].fill(0);
            outputs[0][1].fill(0);
            if (this.loop) Atomics.store(this.loop, 0, 0);
            this.signalSwapResult(1);
            return true;
          }
        }
        if (rangeEnabled && rangeLength > 0) {
          if (this.state === "stopped" && sampleBefore < rangeStart || sampleBefore >= rangeEnd) {
            this.applySeekSample(rangeStart);
            sampleBefore = rangeStart;
            didRangeSeek = true;
          }
        }
        Atomics.store(this.options.processorOptions.globalSampleCount, 0, sampleBefore);
        const bpmValue = this.options.processorOptions.bpmValue[0];
        if (bpmValue !== this.lastBpm) {
          this.core.wasm.updateBpm(this.lastBpm, bpmValue);
          this.lastBpm = bpmValue;
        }
        if (this.state === "stopped") {
          if (seekTargetSample !== void 0) {
            const seekSample = rangeEnabled && rangeLength > 0 && (seekTargetSample < rangeStart || seekTargetSample >= rangeEnd) ? rangeStart : seekTargetSample;
            this.applySeekSample(seekSample);
          }
          if (control === ControlOp.Start) {
            this.state = "preparing";
            this.shouldReset = false;
            this.prepareStableBlocks = 0;
          } else {
            return true;
          }
        }
        const ringPos = Atomics.load(this.options.processorOptions.ringPos, 0);
        const begin = ringPos * CHUNK_SIZE;
        const length = CHUNK_SIZE;
        const L = this.outLeft;
        const R = this.outRight;
        if (control === ControlOp.Swap && !this.crossfadeState.size) {
          const swap = this.options.processorOptions.programSwap;
          const states = /* @__PURE__ */ new Map();
          for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
            const base = i * 3;
            const old$ = Atomics.load(swap, base);
            const new$ = Atomics.load(swap, base + 1);
            const targetDsp$ = Atomics.load(swap, base + 2);
            if (!old$ || !new$ || !targetDsp$) continue;
            const dsp = this.dsps.find((d) => d.dsp$ === targetDsp$);
            if (!dsp?.view.program) continue;
            states.set(targetDsp$, {
              oldProgram$: old$,
              newProgram$: new$,
              chunkIndex: 0,
              totalChunks: CROSSFADE_CHUNKS
            });
          }
          if (!states.size) {
            this.signalSwapResult(-1);
            Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start);
          } else if (this.swapStatus) {
            Atomics.store(this.swapStatus, 0, 0);
            Atomics.store(this.swapStatus, 1, 0);
          }
          if (states.size) {
            this.crossfadeState = states;
          }
        }
        let playingCount = 0;
        let swapPlayingCount = 0;
        for (const dsp of this.dsps) {
          if (!dsp.view.program) continue;
          playingCount++;
          if (this.crossfadeState.has(dsp.dsp$)) swapPlayingCount++;
        }
        if (control === ControlOp.Swap && this.crossfadeState.size && swapPlayingCount === 0) {
          this.crossfadeState.clear();
          this.signalSwapResult(-1);
          Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start);
        }
        const seekEnabled = seekTargetSample !== void 0;
        if (seekEnabled) {
          this.renderChunk(
            sampleBefore,
            begin,
            length,
            rangeEnabled,
            rangeStart,
            rangeEnd,
            rangeLength,
            this.seekLeft,
            this.seekRight,
            false
          );
          const seekSample = rangeEnabled && rangeLength > 0 && (seekTargetSample < rangeStart || seekTargetSample >= rangeEnd) ? rangeStart : seekTargetSample;
          this.applySeekSample(seekSample);
          sampleBefore = seekSample;
        }
        const main = this.renderChunk(
          sampleBefore,
          begin,
          length,
          rangeEnabled,
          rangeStart,
          rangeEnd,
          rangeLength,
          L,
          R,
          !seekEnabled
        );
        didRangeSeek = didRangeSeek || main.didRangeSeek;
        if (seekEnabled) {
          for (let i = 0; i < CHUNK_SIZE; i++) {
            const t = i / (CHUNK_SIZE - 1);
            const inv = 1 - t;
            L[i] = this.seekLeft[i] * inv + L[i] * t;
            R[i] = this.seekRight[i] * inv + R[i] * t;
          }
          for (const s of main.swapToAdvance ?? []) {
            this.advanceSwapState(s.dsp, s.state);
          }
        }
        let sampleAfter = sampleBefore + length;
        if (rangeEnabled && rangeLength > 0 && sampleAfter >= rangeEnd) {
          const over = sampleAfter - rangeEnd;
          sampleAfter = rangeStart + over % rangeLength;
        }
        if (rangeEnabled && rangeLength > 0 && sampleBefore + length >= rangeEnd && !didRangeSeek) {
          this.applySeekSample(sampleAfter);
        } else {
          this.core.wasm.globalSampleCount.value = sampleAfter;
        }
        if (playingCount > 1) {
          this.limiter.process(L, R);
        }
        Atomics.store(this.options.processorOptions.ringPos, 0, (ringPos + 1) % (RING_BUFFER_SIZE / CHUNK_SIZE));
        if (this.state === "preparing") {
          const active = this.hasActiveRecord();
          if (active) {
            this.prepareStableBlocks = 0;
          } else {
            this.prepareStableBlocks++;
          }
          this.core.wasm.globalSampleCount.value = sampleBefore;
          Atomics.store(this.options.processorOptions.globalSampleCount, 0, sampleBefore | 0);
          outputs[0][0].fill(0);
          outputs[0][1].fill(0);
          if (this.prepareStableBlocks >= 2) {
            this.applySeekSample(sampleBefore);
            this.state = "fade-in";
            this.prepareStableBlocks = 0;
          }
        } else {
          outputs[0][0].set(L);
          outputs[0][1].set(R);
        }
        if (this.state === "fade-in") {
          if (sampleBefore > 0) {
            const fadeInLength = CHUNK_SIZE;
            for (let i = 0; i < fadeInLength; i++) {
              const gain = i / fadeInLength;
              outputs[0][0][i] *= gain;
              outputs[0][1][i] *= gain;
            }
          }
          this.state = "running";
        } else if (this.state === "fade-out") {
          for (let i = 0; i < CHUNK_SIZE; i++) {
            const gain = 1 - i / CHUNK_SIZE;
            outputs[0][0][i] *= gain;
            outputs[0][1][i] *= gain;
          }
          this.state = "stopped";
          if (this.shouldReset) {
            this.reset();
            this.shouldReset = false;
          }
        }
        return true;
      } catch (error) {
        this.crossfadeState.clear();
        this.signalSwapResult(-1);
        Atomics.store(this.options.processorOptions.control, 0, ControlOp.Pause);
        this.lastControl = ControlOp.Pause;
        this.state = "stopped";
        console.error("AudioWorklet process error:", error);
        return true;
      }
    }
  }
  registerProcessor("dsp", DspProcessor);
})();
//# sourceMappingURL=worklet-BgYK0mwv.js.map
