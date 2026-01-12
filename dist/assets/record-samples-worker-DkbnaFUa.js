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
  const rpc = (port, api2 = {}, transferables = defaultTransferables) => {
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
          if (!(data.method in api2)) {
            throw new TypeError(
              `Method "${data.method}" does not exist in RPC API.`
            );
          }
          if (typeof api2[data.method] !== "function") {
            throw new TypeError(
              `Property "${data.method}" exists in RPC but is not type function, instead it is type: "${typeof api2[data.method]}"`
            );
          }
          result = await api2[data.method](...data.args);
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
  const ANALYSER_OUTS_COUNT = 64;
  const FINAL_OUT_ANALYSER_L_INDEX = 62;
  const FINAL_OUT_ANALYSER_R_INDEX = 63;
  const ARRAY_SIZE = 4096;
  const HISTORY_SIZE = 2048;
  const HISTORY_HEADER_SIZE = 1;
  const HISTORY_ENTRY_SIZE = 6;
  const HISTORY_WRITE_POS_OFFSET = 0;
  const HISTORIES_COUNT = 128;
  const ARRAY_HISTORY_SIZE = 128;
  const ARRAY_HISTORY_ENTRY_SIZE = 6;
  const ARRAY_HEADER_SIZE = 4 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE;
  const BRANCH_HISTORY_SIZE = 256;
  const BRANCH_HISTORY_ENTRY_SIZE = 2;
  const SAMPLE_NEEDLE_HISTORY_SIZE = 512;
  const SAMPLE_NEEDLE_ENTRY_SIZE = 4;
  const SAMPLE_NEEDLE_DATA_OFFSET = 1;
  const FILTER_HISTORY_SIZE = 2048;
  const FILTER_ENTRY_SIZE = 6;
  const FILTER_DATA_OFFSET = 1;
  const LFO_HISTORY_SIZE = 2048;
  const LFO_ENTRY_SIZE = 7;
  const LFO_DATA_OFFSET = 1;
  const REVERB_HISTORY_SIZE = 2048;
  const REVERB_ENTRY_SIZE = 2;
  const REVERB_DATA_OFFSET = 1;
  const TRIG_HISTORY_SIZE = 2048;
  const TRIG_ENTRY_SIZE = 3;
  const TRIG_DATA_OFFSET = 1;
  const ENVELOPE_HISTORY_SIZE = 2048;
  const ENVELOPE_ENTRY_SIZE = 11;
  const ENVELOPE_DATA_OFFSET = 1;
  const ARRAYS_COUNT = 1024;
  const LITERALS_COUNT = 4096;
  const OPS_COUNT = 16384;
  const MINI_HEADER_SIZE = 1;
  const TIMELINE_MAGIC = 1e3;
  const TIMELINE_HEADER_SIZE = 4;
  const TIMELINE_SEGMENT_SIZE = 5;
  const TIMELINE_KIND_HOLD = 0;
  const TIMELINE_KIND_GLIDE = 1;
  const OP_EVENT = 0;
  const OP_GROUP_START = 1;
  const OP_GROUP_END = 2;
  const OP_OCTAVE = 4;
  const OP_TRANSPOSE = 5;
  const OP_SCALE = 6;
  const OP_CYCLE_START = 7;
  const OP_CYCLE_END = 8;
  const OP_SWING = 9;
  const OP_GROUP_START_SIZE = 13;
  const OP_GROUP_END_SIZE = 1;
  const OP_OCTAVE_SIZE = 2;
  const OP_TRANSPOSE_SIZE = 2;
  const MAX_EVENT_VALUES = 16;
  const OP_SCALE_SIZE = 3;
  const OP_CYCLE_START_SIZE = 4;
  const OP_CYCLE_END_SIZE = 1;
  const OP_EVENT_BASE_SIZE = 12 + MAX_EVENT_VALUES;
  const OP_SWING_SIZE = 2;
  const targets = { "debug": { "outFile": "as/build/index.wasm", "textFile": "as/build/index.wat", "optimizeLevel": 0, "converge": false, "sourceMap": true, "debug": true, "noAssert": true, "uncheckedBehavior": "always" }, "release": { "outFile": "as/build/index.wasm", "textFile": "as/build/index.wat", "optimizeLevel": 3, "shrinkLevel": 2, "converge": true, "sourceMap": true, "debug": true, "noAssert": true, "uncheckedBehavior": "always" } };
  const options = { "enable": ["simd", "relaxed-simd", "threads"], "importMemory": true, "initialMemory": 8192, "maximumMemory": 8192, "sharedMemory": true, "bindings": "esm", "runtime": "stub", "exportRuntime": true };
  var config = {
    targets,
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
  function allocateBytecode(operationCount) {
    const size = MINI_HEADER_SIZE + operationCount * Math.max(OP_EVENT_BASE_SIZE, OP_GROUP_START_SIZE, OP_SCALE_SIZE);
    return new Float32Array(size);
  }
  function writeEventOp(buffer, offset, values, modifiers) {
    const base = MINI_HEADER_SIZE + offset;
    let pc = 0;
    function emit(op) {
      buffer[base + pc] = op;
      pc++;
    }
    emit(OP_EVENT);
    const valueCount = Math.min(values.length, MAX_EVENT_VALUES);
    emit(valueCount);
    emit(modifiers.velocity);
    emit(modifiers.hold);
    emit(modifiers.replicate);
    emit(modifiers.elongate);
    emit(modifiers.density);
    emit(modifiers.offset);
    emit(modifiers.jitter);
    emit(modifiers.prob);
    emit(modifiers.glide);
    emit(modifiers.strum);
    for (let i = 0; i < MAX_EVENT_VALUES; i++) {
      emit(values[i] ?? 0);
    }
    return OP_EVENT_BASE_SIZE;
  }
  function writeGroupStartOp(buffer, offset, childCount, mode, modifiers) {
    const base = MINI_HEADER_SIZE + offset;
    let pc = 0;
    function emit(op) {
      buffer[base + pc] = op;
      pc++;
    }
    emit(OP_GROUP_START);
    emit(childCount);
    emit(mode === 2 ? 2 : mode === 1 ? 1 : 0);
    emit(modifiers.velocity);
    emit(modifiers.hold);
    emit(modifiers.replicate);
    emit(modifiers.elongate);
    emit(modifiers.density);
    emit(modifiers.offset);
    emit(modifiers.jitter);
    emit(modifiers.prob);
    emit(modifiers.glide);
    emit(modifiers.strum);
    return OP_GROUP_START_SIZE;
  }
  function writeGroupEndOp(buffer, offset) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_GROUP_END;
    return OP_GROUP_END_SIZE;
  }
  function writeCycleStartOp(buffer, offset, pos, loop, childCount) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_CYCLE_START;
    buffer[base + 1] = pos;
    buffer[base + 2] = loop;
    buffer[base + 3] = childCount;
    return OP_CYCLE_START_SIZE;
  }
  function writeCycleEndOp(buffer, offset) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_CYCLE_END;
    return OP_CYCLE_END_SIZE;
  }
  function writeOctaveOp(buffer, offset, delta) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_OCTAVE;
    buffer[base + 1] = delta;
    return OP_OCTAVE_SIZE;
  }
  function writeTransposeOp(buffer, offset, delta) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_TRANSPOSE;
    buffer[base + 1] = delta;
    return OP_TRANSPOSE_SIZE;
  }
  function writeScaleOp(buffer, offset, rootMidi, scaleIndex) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_SCALE;
    buffer[base + 1] = rootMidi;
    buffer[base + 2] = scaleIndex;
    return OP_SCALE_SIZE;
  }
  function writeSwingOp(buffer, offset, amount) {
    const base = MINI_HEADER_SIZE + offset;
    buffer[base + 0] = OP_SWING;
    buffer[base + 1] = amount;
    return OP_SWING_SIZE;
  }
  function euclidHit(pulses, steps, step, offset = 0) {
    if (steps <= 0) return false;
    if (pulses <= 0) return false;
    if (pulses >= steps) return true;
    let s = step + offset;
    s %= steps;
    if (s < 0) s += steps;
    const v = s * pulses % steps;
    return v < pulses;
  }
  function parseChordSuffix(suffix) {
    const tones = [];
    const omit = /* @__PURE__ */ new Set();
    let hasSus2 = false;
    let hasSus4 = false;
    let i = 0;
    while (i < suffix.length) {
      const extMatch = suffix.slice(i).match(/^([b#]?)(\d+)/);
      if (extMatch) {
        const acc = extMatch[1];
        const num = parseInt(extMatch[2], 10);
        i += extMatch[0].length;
        let degree;
        let adjust = 0;
        if (num === 7) {
          degree = 6;
          adjust = acc === "b" ? -1 : acc === "#" ? 1 : 0;
        } else if (num === 9) {
          degree = 8;
          adjust = acc === "b" ? -1 : acc === "#" ? 1 : 0;
        } else if (num === 11) {
          degree = 10;
          adjust = acc === "b" ? -1 : acc === "#" ? 1 : 0;
        } else if (num === 13) {
          degree = 12;
          adjust = acc === "b" ? -1 : acc === "#" ? 1 : 0;
        } else if (num === 5) {
          degree = 4;
          adjust = acc === "b" ? -1 : acc === "#" ? 1 : 0;
        } else {
          continue;
        }
        tones.push({ degree, semitoneAdjust: adjust });
        continue;
      }
      if (suffix.slice(i).startsWith("sus4")) {
        hasSus4 = true;
        i += 4;
        continue;
      }
      if (suffix.slice(i).startsWith("sus2")) {
        hasSus2 = true;
        i += 4;
        continue;
      }
      if (suffix.slice(i).startsWith("sus")) {
        hasSus4 = true;
        i += 3;
        continue;
      }
      const noMatch = suffix.slice(i).match(/^no(\d+)/);
      if (noMatch) {
        const num = parseInt(noMatch[1], 10);
        i += noMatch[0].length;
        if (num === 3) omit.add(2);
        else if (num === 5) omit.add(4);
        continue;
      }
      const addMatch = suffix.slice(i).match(/^add(\d+)/);
      if (addMatch) {
        const num = parseInt(addMatch[1], 10);
        i += addMatch[0].length;
        if (num === 2) tones.push({ degree: 1, semitoneAdjust: 0 });
        else if (num === 4) tones.push({ degree: 3, semitoneAdjust: 0 });
        else if (num === 6) tones.push({ degree: 5, semitoneAdjust: 0 });
        continue;
      }
      if (suffix.slice(i).startsWith("o7")) {
        tones.push({ degree: 0, semitoneAdjust: 0 });
        tones.push({ degree: 2, semitoneAdjust: -1 });
        tones.push({ degree: 4, semitoneAdjust: -1 });
        tones.push({ degree: 6, semitoneAdjust: -2 });
        return tones;
      }
      i++;
    }
    const result = [];
    result.push({ degree: 0, semitoneAdjust: 0 });
    if (hasSus2) {
      result.push({ degree: 1, semitoneAdjust: 0 });
    } else if (hasSus4) {
      result.push({ degree: 3, semitoneAdjust: 0 });
    } else if (!omit.has(2)) {
      result.push({ degree: 2, semitoneAdjust: 0 });
    }
    if (!omit.has(4)) {
      const alteredFifth = tones.find((t) => t.degree === 4);
      if (alteredFifth) {
        result.push(alteredFifth);
      } else {
        result.push({ degree: 4, semitoneAdjust: 0 });
      }
    }
    for (const tone of tones) {
      if (tone.degree >= 5 && !result.some((r) => r.degree === tone.degree)) {
        result.push(tone);
      }
    }
    for (const tone of tones) {
      if (tone.degree < 5 && tone.degree !== 0 && tone.degree !== 2 && tone.degree !== 4) {
        if (!result.some((r) => r.degree === tone.degree)) {
          result.push(tone);
        }
      }
    }
    return result;
  }
  function romanToDegree(text) {
    const t = text.toLowerCase();
    if (t === "i") return 1;
    if (t === "ii") return 2;
    if (t === "iii") return 3;
    if (t === "iv") return 4;
    if (t === "v") return 5;
    if (t === "vi") return 6;
    if (t === "vii") return 7;
    return null;
  }
  const SCALE_INTERVALS = {
    major: [0, 2, 4, 5, 7, 9, 11],
    minor: [0, 2, 3, 5, 7, 8, 10],
    pentatonic: [0, 3, 5, 7, 10],
    pent: [0, 3, 5, 7, 10],
    minorpentatonic: [0, 3, 5, 7, 10],
    minorpent: [0, 3, 5, 7, 10],
    majorpentatonic: [0, 2, 4, 7, 9],
    majorpent: [0, 2, 4, 7, 9],
    ritusen: [0, 2, 4, 6, 9],
    kumai: [0, 2, 3, 7, 9],
    hirajoshi: [0, 2, 3, 7, 8],
    iwato: [0, 1, 5, 6, 10],
    chinese: [0, 4, 6, 7, 11],
    indian: [0, 4, 5, 7, 9, 11],
    pelog: [0, 1, 3, 7, 8],
    prometheus: [0, 2, 4, 6, 9, 10],
    scriabin: [0, 1, 4, 7, 9],
    gong: [0, 2, 4, 7, 9],
    shang: [0, 2, 5, 7, 10],
    jiao: [0, 3, 5, 8, 10],
    zhi: [0, 2, 4, 6, 9],
    yu: [0, 3, 5, 7, 9],
    whole: [0, 2, 4, 6, 8, 10],
    wholetone: [0, 2, 4, 6, 8, 10],
    augmented: [0, 3, 4, 7, 8, 11],
    augmented2: [0, 1, 4, 5, 8, 9],
    hexmajor7: [0, 2, 4, 7, 9, 11],
    hexdorian: [0, 2, 3, 5, 7, 9],
    hexphrygian: [0, 1, 4, 5, 7, 10],
    hexsus: [0, 2, 5, 7, 9, 10],
    hexmajor6: [0, 2, 4, 5, 7, 9],
    hexaeolian: [0, 2, 3, 5, 7, 8],
    ionian: [0, 2, 4, 5, 7, 9, 11],
    dorian: [0, 2, 3, 5, 7, 9, 10],
    phrygian: [0, 1, 3, 5, 7, 8, 10],
    lydian: [0, 2, 4, 6, 7, 9, 11],
    mixolydian: [0, 2, 4, 5, 7, 9, 10],
    aeolian: [0, 2, 3, 5, 7, 8, 10],
    locrian: [0, 1, 3, 5, 6, 8, 10],
    harmonicminor: [0, 2, 3, 5, 7, 8, 11],
    harmonicmajor: [0, 2, 4, 5, 7, 8, 11],
    melodicminor: [0, 2, 3, 5, 7, 9, 11],
    melodicminordesc: [0, 2, 3, 5, 7, 8, 10],
    melodicmajor: [0, 2, 4, 6, 7, 9, 11],
    bartok: [0, 2, 4, 5, 7, 8, 10],
    hindu: [0, 2, 5, 7, 8, 10],
    todi: [0, 1, 3, 6, 7, 8, 11],
    purvi: [0, 1, 4, 6, 7, 8, 11],
    marva: [0, 1, 4, 6, 7, 9, 11],
    bhairav: [0, 1, 4, 5, 7, 8, 11],
    ahirbhairav: [0, 1, 4, 5, 7, 9, 10],
    superlocrian: [0, 1, 3, 4, 6, 8, 10],
    romanianminor: [0, 2, 3, 6, 7, 9, 10],
    hungarianminor: [0, 2, 3, 6, 7, 8, 11],
    neapolitanminor: [0, 1, 3, 5, 7, 8, 11],
    enigmatic: [0, 1, 4, 6, 8, 10, 11],
    spanish: [0, 1, 3, 4, 5, 7, 8, 10],
    leadingwhole: [0, 2, 4, 6, 8, 9, 11],
    lydianminor: [0, 2, 4, 6, 7, 8, 10],
    neapolitanmajor: [0, 1, 3, 5, 7, 9, 11],
    locrianmajor: [0, 2, 4, 5, 6, 8, 10],
    diminished: [0, 2, 3, 5, 6, 8, 9, 11],
    octatonic: [0, 1, 3, 4, 6, 7, 9, 10],
    diminished2: [0, 1, 3, 4, 6, 7, 9, 10],
    octatonic2: [0, 2, 3, 5, 6, 8, 9, 11],
    messiaen1: [0, 2, 4, 6, 8, 10],
    messiaen2: [0, 1, 2, 5, 6, 7, 10, 11],
    messiaen3: [0, 2, 3, 4, 6, 7, 8, 11],
    messiaen4: [0, 1, 2, 5, 6, 7, 9, 10],
    messiaen5: [0, 1, 5, 6, 7, 11],
    messiaen6: [0, 2, 4, 5, 6, 8, 10, 11],
    messiaen7: [0, 1, 2, 3, 5, 6, 7, 8, 9, 11],
    chromatic: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    bayati: [0, 1, 4, 5, 7, 8, 10],
    hijaz: [0, 1, 4, 5, 7, 8, 10],
    sikah: [0, 1, 4, 5, 7, 8, 10],
    rast: [0, 2, 4, 5, 7, 9, 10],
    saba: [0, 1, 3, 4, 6, 7, 9, 10],
    iraq: [0, 1, 4, 5, 7, 8, 10]
  };
  const SCALE_KEY_TO_INDEX = {};
  {
    const sigToIndex = /* @__PURE__ */ new Map();
    let next = 0;
    for (const [name, intervals] of Object.entries(SCALE_INTERVALS)) {
      const sig = intervals.join(",");
      let idx = sigToIndex.get(sig);
      if (idx === void 0) {
        idx = next++;
        sigToIndex.set(sig, idx);
      }
      SCALE_KEY_TO_INDEX[name] = idx;
    }
  }
  function findScaleIndex(scaleName) {
    if (!scaleName) return void 0;
    const q = scaleName.toLowerCase();
    for (const name of Object.keys(SCALE_INTERVALS)) {
      if (name.startsWith(q)) return SCALE_KEY_TO_INDEX[name];
    }
    return void 0;
  }
  const NOTE_OFFSETS$1 = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11
  };
  function noteNameToMidi(noteName) {
    const match = noteName.match(/^([a-gA-G])([#b]?)(-?\d+)$/);
    if (!match) {
      throw new Error(`Invalid note name: ${noteName}`);
    }
    const [, note, accidental, octave] = match;
    let midi = NOTE_OFFSETS$1[note.toLowerCase()] + (parseInt(octave, 10) + 1) * 12;
    if (accidental === "#") {
      midi += 1;
    } else if (accidental === "b") {
      midi -= 1;
    }
    return midi;
  }
  function midiToFrequency(midi) {
    return 440 * Math.pow(2, (midi - 69) / 12);
  }
  const DEFAULT_MODS = {
    velocity: 1,
    hold: 0,
    replicate: 1,
    elongate: 1,
    density: 1,
    offset: 0,
    jitter: 0,
    prob: 0,
    glide: 0,
    strum: 0
  };
  const MODIFIER_START = /* @__PURE__ */ new Set(["*", "!", "@", "/", "\\", ".", ";", "?", "+", "-", "$"]);
  const GROUP_OPEN = /* @__PURE__ */ new Set(["[", "<", "("]);
  function cloneMods(mods) {
    return { ...mods };
  }
  function getDefaultMods() {
    return cloneMods(DEFAULT_MODS);
  }
  function parseModifiers(text) {
    const mods = getDefaultMods();
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      const rest = text.slice(i + 1);
      switch (ch) {
        case "*": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.density = parseFloat(m[1]) || 1;
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case "!": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.replicate = parseFloat(m[1]) || 1;
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case "@": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.elongate = parseFloat(m[1]) || 1;
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case "/": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.density = 1 / (parseFloat(m[1]) || 1);
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case "\\": {
          const m = rest.match(/^(-?[\d.]+)/);
          if (m && m[1]) {
            mods.glide = parseFloat(m[1]);
            i += m[0].length + 1;
          } else {
            mods.glide = 1;
            i++;
          }
          break;
        }
        case ".": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            const raw = m[1];
            let factor = parseFloat(raw);
            if (raw.indexOf(".") === -1) {
              factor = parseFloat("0." + raw);
            }
            mods.velocity *= factor;
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case ";": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.hold = parseFloat(m[1]);
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case "?": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.prob = parseFloat(m[1]);
            i += m[0].length + 1;
          } else {
            mods.prob = 0.5;
            i++;
          }
          break;
        }
        case "+": {
          if (rest.startsWith("?")) {
            const m = rest.slice(1).match(/^([\d.]*)/);
            const amt = m && m[1] ? parseFloat(m[1]) : 0.5;
            mods.jitter = amt;
            i += (m?.[0]?.length ?? 0) + 2;
          } else {
            const m = rest.match(/^([\d.]+)/);
            if (m) {
              mods.offset += parseFloat(m[1]);
              i += m[0].length + 1;
            } else {
              i++;
            }
          }
          break;
        }
        case "-": {
          const m = rest.match(/^([\d.]+)/);
          if (m) {
            mods.offset -= parseFloat(m[1]);
            i += m[0].length + 1;
          } else {
            i++;
          }
          break;
        }
        case "$": {
          let j = i;
          while (j < text.length && text[j] === "$") j++;
          const dollarCount = j - i;
          const after = text.slice(j);
          const m = after.match(/^([\d.]+)/);
          if (m) {
            const raw = parseFloat(m[1]);
            const amount = Math.min(Math.max(raw, 0), 0.999999);
            const kind = dollarCount >= 4 ? 3 : dollarCount === 3 ? 2 : dollarCount === 2 ? 1 : 0;
            mods.strum = kind + amount;
            i = j + m[0].length;
          } else {
            i = j;
          }
          break;
        }
        default:
          i++;
      }
    }
    return mods;
  }
  function tokenize(input) {
    const tokens = [];
    let i = 0;
    while (i < input.length) {
      if (/\s/.test(input[i])) {
        i++;
        continue;
      }
      const start = i;
      const ch = input[i];
      if (ch === ":") {
        tokens.push({ text: ":", start, end: i + 1 });
        i++;
        continue;
      }
      if (ch === "/" && input[i + 1] === "/") {
        let j = i + 2;
        while (j < input.length && input[j] !== "\n" && input[j] !== "\r") j++;
        tokens.push({ text: input.slice(start, j), start, end: j });
        i = j;
        continue;
      }
      if (GROUP_OPEN.has(ch)) {
        const close = ch === "[" ? "]" : ch === "<" ? ">" : ")";
        i++;
        let depth = 1;
        while (i < input.length && depth > 0) {
          if (input[i] === ch) depth++;
          else if (input[i] === close) depth--;
          i++;
        }
        while (i < input.length) {
          const c = input[i];
          if (c === ":" || /\s/.test(c) || GROUP_OPEN.has(c) || c === "]" || c === ">" || c === ")") break;
          i++;
        }
        tokens.push({ text: input.slice(start, i), start, end: i });
        continue;
      }
      i++;
      while (i < input.length) {
        const c = input[i];
        if (c === ":" || /\s/.test(c) || GROUP_OPEN.has(c) || c === "]" || c === ">" || c === ")") break;
        i++;
      }
      tokens.push({ text: input.slice(start, i), start, end: i });
    }
    const mergedTokens = [];
    for (let ti = 0; ti < tokens.length; ti++) {
      const t = tokens[ti];
      const next = tokens[ti + 1];
      if (next && t.end === next.start && /^[A-Za-z]+$/.test(t.text) && /^[0-9]+$/.test(next.text)) {
        mergedTokens.push({ text: t.text + next.text, start: t.start, end: next.end });
        ti++;
      } else {
        mergedTokens.push(t);
      }
    }
    return mergedTokens;
  }
  function splitValueAndModifiers(text) {
    let i = 0;
    while (i < text.length) {
      const ch = text[i];
      if (MODIFIER_START.has(ch) && !(i === 0 && (ch === "-" || ch === "+") && /\d/.test(text[i + 1] ?? ""))) {
        break;
      }
      i++;
    }
    return { value: text.slice(0, i), mods: text.slice(i) };
  }
  function parseValues(valueText) {
    const values = [];
    let cursor = 0;
    while (cursor < valueText.length) {
      while (cursor < valueText.length && (valueText[cursor] === "," || /\s/.test(valueText[cursor]))) cursor++;
      if (cursor >= valueText.length) break;
      const rest = valueText.slice(cursor);
      const noteMatch = rest.match(/^([a-gA-G][#b]?)(-?\d+)/);
      if (noteMatch) {
        const midi = noteNameToMidi(noteMatch[1] + noteMatch[2]);
        values.push(midiToFrequency(midi));
        cursor += noteMatch[0].length;
        continue;
      }
      const numMatch = rest.match(/^-?[\d.]+/);
      if (numMatch) {
        values.push(parseFloat(numMatch[0]));
        cursor += numMatch[0].length;
        continue;
      }
      cursor++;
    }
    return values;
  }
  function isNoteNameText(text) {
    return /^([a-gA-G][#b]?)(-?\d+)$/.test(text);
  }
  function makeSource(input, start, end) {
    return { start, length: end - start, text: input.slice(start, end) };
  }
  function nodesSpan(nodes) {
    const first = nodes[0];
    const last = nodes.at(-1);
    if (!first || !last) return null;
    const start = first.source.start;
    const end = last.source.start + last.source.length;
    return { start, end };
  }
  function parseGroupedTokenText(raw, open) {
    const close = open === "[" ? "]" : open === "<" ? ">" : ")";
    const closingIndex = raw.lastIndexOf(close);
    if (closingIndex === -1) {
      const inner2 = raw.slice(1);
      return { inner: inner2, modText: "" };
    }
    const inner = raw.slice(1, closingIndex);
    const { mods: modText } = splitValueAndModifiers(raw.slice(closingIndex + 1));
    return { inner, modText };
  }
  function parseDeltaToken(token) {
    const raw = token?.text;
    if (!raw) return 0;
    const v = parseFloat(raw);
    return Number.isFinite(v) ? v : 0;
  }
  function parseEuclidToken(raw) {
    if (!raw.startsWith("(")) return null;
    if (!raw.endsWith(")")) return null;
    const inner = raw.slice(1, -1).trim();
    if (!/^\d+\s*,\s*\d+(?:\s*,\s*-?\d+)?$/.test(inner)) return null;
    const parts = inner.split(",").map((s) => parseInt(s.trim(), 10));
    const pulses = parts[0];
    const steps = parts[1];
    const offset = parts.length >= 3 ? parts[2] : 0;
    if (!Number.isFinite(pulses) || !Number.isFinite(steps) || !Number.isFinite(offset)) return null;
    return { pulses, steps, offset };
  }
  function cloneEventNode(node, nextSource, values) {
    return {
      type: "event",
      angle: false,
      parallel: false,
      values,
      children: [],
      modifiers: cloneMods(node.modifiers),
      source: nextSource
    };
  }
  function parseOctaveDelta(tokens) {
    return parseDeltaToken(tokens[1]);
  }
  function parseScaleDirective(tokens, startIndex) {
    let i = startIndex;
    let rootMidi = noteNameToMidi("c4");
    let scaleIndex = SCALE_KEY_TO_INDEX.major ?? 0;
    const t0 = tokens[i]?.text?.toLowerCase();
    if (t0 && isNoteNameText(t0)) {
      rootMidi = noteNameToMidi(t0);
      i++;
    }
    const t1 = tokens[i]?.text?.toLowerCase();
    if (t1) {
      if (/^[a-z][a-z0-9]*$/.test(t1)) {
        let scaleName = t1;
        const nextToken = tokens[i + 1];
        if (/^[a-z]+$/.test(t1) && nextToken && /^[0-9]+$/.test(nextToken.text) && nextToken.start === tokens[i].end) {
          scaleName = t1 + nextToken.text;
          i++;
        }
        scaleIndex = findScaleIndex(scaleName) ?? scaleIndex;
        i++;
      }
    }
    return { rootMidi, scaleIndex, nextIndex: i };
  }
  function tokensToNodesInternal(tokens, input) {
    const nodes = [];
    for (let ti = 0; ti < tokens.length; ti++) {
      const token = tokens[ti];
      const raw = token.text;
      const first = raw[0];
      if (raw.startsWith("//")) {
        continue;
      }
      if (raw === ",") {
        const left = nodes.slice();
        const rightTokens = tokens.slice(ti + 1);
        const right = rightTokens.length > 0 ? tokensToNodesInternal(rightTokens, input) : [];
        if (left.length === 0 && right.length === 0) {
          return [];
        }
        if (left.length === 0) {
          return right;
        }
        if (right.length === 0) {
          return left;
        }
        const leftGroup = {
          type: "group",
          angle: false,
          parallel: false,
          values: [],
          children: left,
          modifiers: getDefaultMods(),
          source: makeSource(input, left[0].source.start, left.at(-1).source.start + left.at(-1).source.length)
        };
        const rightGroup = {
          type: "group",
          angle: false,
          parallel: false,
          values: [],
          children: right,
          modifiers: getDefaultMods(),
          source: makeSource(input, right[0].source.start, right.at(-1).source.start + right.at(-1).source.length)
        };
        const endToken = rightTokens.at(-1) ?? token;
        const parallelGroup = {
          type: "group",
          angle: false,
          parallel: true,
          values: [],
          children: [leftGroup, rightGroup],
          modifiers: getDefaultMods(),
          source: makeSource(input, leftGroup.source.start, endToken.end)
        };
        return [parallelGroup];
      }
      if (raw === ".") {
        const segments = [];
        if (nodes.length > 0) segments.push(nodes.slice());
        let segStart = ti + 1;
        for (let j = ti + 1; j <= tokens.length; j++) {
          const isEnd = j === tokens.length;
          const isDot = !isEnd && tokens[j]?.text === ".";
          if (!isEnd && !isDot) continue;
          const partTokens = tokens.slice(segStart, j);
          const partNodes = partTokens.length > 0 ? tokensToNodesInternal(partTokens, input) : [];
          if (partNodes.length > 0) segments.push(partNodes);
          segStart = j + 1;
        }
        if (segments.length === 0) return [];
        if (segments.length === 1) return segments[0];
        const loop = segments.length;
        const onChildren = [];
        let groupStart = Infinity;
        let groupEnd = -Infinity;
        for (let si = 0; si < segments.length; si++) {
          const children = segments[si];
          const span = nodesSpan(children);
          const start = span?.start ?? 0;
          const end = span?.end ?? start;
          groupStart = Math.min(groupStart, start);
          groupEnd = Math.max(groupEnd, end);
          onChildren.push({
            type: "at",
            angle: false,
            parallel: false,
            values: [si + 1, loop],
            children,
            modifiers: getDefaultMods(),
            source: makeSource(input, start, end)
          });
        }
        if (!Number.isFinite(groupStart) || !Number.isFinite(groupEnd) || groupStart > groupEnd) {
          groupStart = 0;
          groupEnd = 0;
        }
        const joined = {
          type: "group",
          angle: false,
          parallel: false,
          values: [],
          children: onChildren,
          modifiers: getDefaultMods(),
          source: makeSource(input, groupStart, groupEnd)
        };
        return [joined];
      }
      if (first === "_") {
        const last = nodes.at(-1);
        if (last) last.modifiers.elongate += 1;
        continue;
      }
      if (raw === "scale") {
        const { rootMidi, scaleIndex, nextIndex } = parseScaleDirective(tokens, ti + 1);
        const last = nextIndex > ti + 1 ? tokens[nextIndex - 1] : token;
        nodes.push({
          type: "scale",
          angle: false,
          parallel: false,
          values: [rootMidi, scaleIndex],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, last?.end ?? token.end)
        });
        ti = nextIndex - 1;
        continue;
      }
      if (raw === "at") {
        const next = tokens[ti + 1];
        const rawOn = next?.text ?? "";
        let pos = 0;
        let loop = 0;
        const slash = rawOn.indexOf("/");
        if (slash >= 0) {
          const a = parseInt(rawOn.slice(0, slash), 10);
          const b = parseInt(rawOn.slice(slash + 1), 10);
          pos = Number.isFinite(a) ? a : 0;
          loop = Number.isFinite(b) ? b : 0;
        } else {
          const a = parseInt(rawOn, 10);
          pos = Number.isFinite(a) ? a : 0;
        }
        const bodyStart = ti + 2;
        let bodyEnd = tokens.length;
        for (let j = bodyStart; j < tokens.length; j++) {
          if (tokens[j]?.text === "at") {
            bodyEnd = j;
            break;
          }
        }
        const bodyTokens = tokens.slice(bodyStart, bodyEnd);
        const children = tokensToNodesInternal(bodyTokens, input);
        const last = tokens[bodyEnd - 1] ?? next ?? token;
        nodes.push({
          type: "at",
          angle: false,
          parallel: false,
          values: [pos, loop],
          children,
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, last?.end ?? token.end)
        });
        ti = bodyEnd - 1;
        continue;
      }
      if (raw === "octave" || raw === "transpose") {
        const next = tokens[ti + 1];
        const delta = parseDeltaToken(next);
        const end = next?.end ?? token.end;
        nodes.push({
          type: raw === "octave" ? "octave" : "transpose",
          angle: false,
          parallel: false,
          values: [delta],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, end)
        });
        if (next) ti++;
        continue;
      }
      if (raw === "swing") {
        const next = tokens[ti + 1];
        const amount = parseDeltaToken(next);
        const end = next?.end ?? token.end;
        nodes.push({
          type: "swing",
          angle: false,
          parallel: false,
          values: [amount],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, end)
        });
        if (next) ti++;
        continue;
      }
      if (first === "[" || first === "<") {
        const { inner, modText } = parseGroupedTokenText(raw, first);
        const modifiers2 = parseModifiers(modText);
        const innerTokens = tokenize(inner);
        const adjustedInnerTokens = innerTokens.map((t) => ({
          ...t,
          start: t.start + token.start + 1,
          // +1 to account for opening bracket
          end: t.end + token.start + 1
        }));
        const children = tokensToNodesInternal(adjustedInnerTokens, input);
        nodes.push({
          type: "group",
          angle: first === "<",
          parallel: false,
          values: [],
          children,
          modifiers: modifiers2,
          source: makeSource(input, token.start, token.end)
        });
        continue;
      }
      if (first === "(") {
        const euclid = parseEuclidToken(raw);
        const last = nodes.at(-1);
        if (euclid && last?.type === "event") {
          const pulses = Math.floor(euclid.pulses);
          const steps = Math.floor(euclid.steps);
          const offset = Math.floor(euclid.offset);
          const spanSource = makeSource(input, last.source.start, token.end);
          nodes.pop();
          const safeSteps = Number.isFinite(steps) && steps > 0 ? steps : 0;
          for (let si = 0; si < safeSteps; si++) {
            const on = euclidHit(pulses, steps, si, offset);
            nodes.push(cloneEventNode(last, spanSource, on ? last.values.slice() : []));
          }
          continue;
        }
        const { inner, modText } = parseGroupedTokenText(raw, "(");
        const innerTokens = tokenize(inner);
        const adjustedInnerTokens = innerTokens.map((t) => ({
          ...t,
          start: t.start + token.start + 1,
          end: t.end + token.start + 1
        }));
        const head = adjustedInnerTokens[0]?.text;
        if (head === "scale") {
          const { rootMidi, scaleIndex, nextIndex } = parseScaleDirective(adjustedInnerTokens, 1);
          const items = adjustedInnerTokens.slice(nextIndex);
          const scaleNode = {
            type: "scale",
            angle: false,
            parallel: false,
            values: [rootMidi, scaleIndex],
            children: [],
            modifiers: getDefaultMods(),
            source: makeSource(input, token.start, token.end)
          };
          const restChildren = tokensToNodesInternal(items, input);
          const children2 = [scaleNode, ...restChildren];
          nodes.push({
            type: "group",
            angle: false,
            parallel: false,
            values: [],
            children: children2,
            modifiers: parseModifiers(modText),
            source: makeSource(input, token.start, token.end)
          });
          continue;
        }
        if (head === "octave") {
          nodes.push({
            type: "octave",
            angle: false,
            parallel: false,
            values: [parseOctaveDelta(adjustedInnerTokens)],
            children: [],
            modifiers: getDefaultMods(),
            source: makeSource(input, token.start, token.end)
          });
          continue;
        }
        if (head === "transpose") {
          nodes.push({
            type: "transpose",
            angle: false,
            parallel: false,
            values: [parseDeltaToken(adjustedInnerTokens[1])],
            children: [],
            modifiers: getDefaultMods(),
            source: makeSource(input, token.start, token.end)
          });
          continue;
        }
        if (head === "swing") {
          nodes.push({
            type: "swing",
            angle: false,
            parallel: false,
            values: [parseDeltaToken(adjustedInnerTokens[1])],
            children: [],
            modifiers: getDefaultMods(),
            source: makeSource(input, token.start, token.end)
          });
          continue;
        }
        const modifiers2 = parseModifiers(modText);
        const children = tokensToNodesInternal(adjustedInnerTokens, input);
        nodes.push({
          type: "group",
          angle: false,
          parallel: false,
          values: [],
          children,
          modifiers: modifiers2,
          source: makeSource(input, token.start, token.end)
        });
        continue;
      }
      const { value, mods } = splitValueAndModifiers(raw);
      if (value === "~") {
        const modifiers2 = parseModifiers(mods);
        nodes.push({
          type: "rest",
          angle: false,
          parallel: false,
          values: [],
          children: [],
          modifiers: modifiers2,
          source: makeSource(input, token.start, token.end)
        });
        continue;
      }
      let valueText = value;
      if (!valueText && mods) {
        valueText = "c4";
      }
      if (valueText?.toLowerCase() === "x") {
        valueText = "c4";
      }
      const chordMatch = valueText.match(/^([ivxlcdm]+)(.*)$/i);
      if (chordMatch) {
        const roman = chordMatch[1];
        const suffix = chordMatch[2] ?? "";
        const base = romanToDegree(roman);
        if (base !== null) {
          const tones = parseChordSuffix(suffix);
          const values2 = tones.map((tone) => {
            const scaleDegree = base + tone.degree;
            return -(scaleDegree + tone.semitoneAdjust / 100);
          });
          const modifiers2 = parseModifiers(mods);
          nodes.push({
            type: "event",
            angle: false,
            parallel: false,
            values: values2,
            children: [],
            modifiers: modifiers2,
            source: makeSource(input, token.start, token.end)
          });
          continue;
        }
      }
      if (/^\d+(?:,\d+)*$/.test(valueText)) {
        const parts = valueText.split(",").filter(Boolean);
        const values2 = parts.map((p) => -parseInt(p, 10));
        const modifiers2 = parseModifiers(mods);
        nodes.push({
          type: "event",
          angle: false,
          parallel: false,
          values: values2,
          children: [],
          modifiers: modifiers2,
          source: makeSource(input, token.start, token.end)
        });
        continue;
      }
      const values = parseValues(valueText);
      const modifiers = parseModifiers(mods);
      nodes.push({
        type: "event",
        angle: false,
        parallel: false,
        values,
        children: [],
        modifiers,
        source: makeSource(input, token.start, token.end)
      });
    }
    return nodes;
  }
  function tokensToNodes(tokens, input, options2 = {}) {
    const nodes = tokensToNodesInternal(tokens, input);
    const hasScaleNode = nodes.some((node) => node.type === "scale") || nodes.some((node) => node.type === "group" && node.children.some((child) => child.type === "scale"));
    if (!hasScaleNode) {
      const rootMidi = options2.defaultScale?.rootMidi ?? noteNameToMidi("c4");
      const scaleIndex = options2.defaultScale?.scaleIndex ?? SCALE_KEY_TO_INDEX.major ?? 0;
      const defaultScaleNode = {
        type: "scale",
        angle: false,
        parallel: false,
        values: [rootMidi, scaleIndex],
        children: [],
        modifiers: getDefaultMods(),
        source: {
          start: 0,
          length: 0,
          text: ""
        }
      };
      nodes.unshift(defaultScaleNode);
    }
    return nodes;
  }
  function compileNode(node, bytecode, offset) {
    if (node.type === "event") {
      return writeEventOp(bytecode, offset, node.values, node.modifiers);
    } else if (node.type === "group") {
      const mode = node.parallel ? 2 : node.angle ? 1 : 0;
      let currentOffset = writeGroupStartOp(bytecode, offset, node.children.length, mode, node.modifiers);
      for (const child of node.children) {
        currentOffset += compileNode(child, bytecode, offset + currentOffset);
      }
      currentOffset += writeGroupEndOp(bytecode, offset + currentOffset);
      return currentOffset;
    } else if (node.type === "rest") {
      return writeEventOp(bytecode, offset, [], node.modifiers);
    } else if (node.type === "octave") {
      return writeOctaveOp(bytecode, offset, node.values[0] ?? 0);
    } else if (node.type === "transpose") {
      return writeTransposeOp(bytecode, offset, node.values[0] ?? 0);
    } else if (node.type === "scale") {
      return writeScaleOp(bytecode, offset, node.values[0] ?? 0, node.values[1] ?? 0);
    } else if (node.type === "swing") {
      return writeSwingOp(bytecode, offset, node.values[0] ?? 0);
    } else if (node.type === "at") {
      let currentOffset = writeCycleStartOp(
        bytecode,
        offset,
        node.values[0] ?? 0,
        node.values[1] ?? 0,
        node.children.length
      );
      for (const child of node.children) {
        currentOffset += compileNode(child, bytecode, offset + currentOffset);
      }
      currentOffset += writeCycleEndOp(bytecode, offset + currentOffset);
      return currentOffset;
    }
    return 0;
  }
  const cacheByMiniNotation = /* @__PURE__ */ new Map();
  function compileMiniNotation(input, options2 = {}) {
    const cacheKey = options2.defaultScale ? `${input}|scale:${options2.defaultScale.rootMidi ?? 60},${options2.defaultScale.scaleIndex ?? 0}` : input;
    const cached = cacheByMiniNotation.get(cacheKey);
    if (cached) return cached;
    if (cacheByMiniNotation.size > 1e3) {
      cacheByMiniNotation.clear();
    }
    const tokens = tokenize(input);
    const nodes = tokensToNodes(tokens, input, { defaultScale: options2.defaultScale });
    const root = {
      type: "group",
      values: [],
      children: nodes,
      modifiers: getDefaultMods(),
      angle: false,
      parallel: false,
      source: {
        length: input.length
      }
    };
    const bytecode = allocateBytecode(1024);
    let offset = compileNode(root, bytecode, 0);
    bytecode[0] = offset;
    const usedSize = MINI_HEADER_SIZE + offset;
    const trimmedBytecode = bytecode.slice(0, usedSize);
    const sourceMap = [];
    const result = { bytecode: trimmedBytecode, sourceMap, nodes };
    cacheByMiniNotation.set(cacheKey, result);
    return result;
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
  const AnalyserOutsPoolStruct = Struct({
    outs: "usize"
  });
  const CompressorOutsPoolStruct = Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  const ExpanderOutsPoolStruct = Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  const GateOutsPoolStruct = Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  const LimiterOutsPoolStruct = Struct({
    levelDbOuts: "usize",
    grDbOuts: "usize"
  });
  const ProgramDataStruct = Struct({
    ops: "usize",
    arrays: "usize",
    literals: "usize"
  });
  const ProgramStruct = Struct({
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
  function toRing(buffer, chunkSize = 128) {
    const length = buffer.length / chunkSize;
    if ((length | 0) !== length) {
      throw new Error('Ring "buffer" must be divisible exactly by the "chunkSize".');
    }
    return Object.assign(
      Array.from({ length }, (_, x) => buffer.subarray(
        x * chunkSize,
        (x + 1) * chunkSize
      )),
      { buffer }
    );
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function canUseWaitAsync() {
    return typeof Atomics.waitAsync === "function";
  }
  async function acquireSpinLock(lock, timeoutMs, {
    pollMs = 4
  } = {}) {
    const deadline = performance.now() + timeoutMs;
    while (true) {
      const prev = Atomics.compareExchange(lock, 0, 0, 1);
      if (prev === 0) return true;
      const remaining = deadline - performance.now();
      if (remaining <= 0) return false;
      const step = Math.min(remaining, pollMs);
      if (canUseWaitAsync()) {
        try {
          const raced = await Promise.race([
            Atomics.waitAsync(lock, 0, 1, step).value,
            sleep(step).then(() => "timed-out")
          ]);
          if (raced === "ok") continue;
          if (raced === "not-equal") continue;
          continue;
        } catch {
          await sleep(step);
        }
      } else {
        await sleep(step);
      }
    }
  }
  function buildSourceMapFromNodes(nodes, _bytecode, offset, map) {
    let currentOffset = offset;
    for (const node of nodes) {
      if (node.type === "event") {
        const opIndex = currentOffset;
        map.set(opIndex, {
          text: node.source.text,
          start: node.source.start,
          end: node.source.start + node.source.length
        });
        currentOffset += OP_EVENT_BASE_SIZE;
      } else if (node.type === "rest") {
        const opIndex = currentOffset;
        map.set(opIndex, {
          text: node.source.text,
          start: node.source.start,
          end: node.source.start + node.source.length
        });
        currentOffset += OP_EVENT_BASE_SIZE;
      } else if (node.type === "octave") {
        const opIndex = currentOffset;
        map.set(opIndex, {
          text: node.source.text,
          start: node.source.start,
          end: node.source.start + node.source.length
        });
        currentOffset += OP_OCTAVE_SIZE;
      } else if (node.type === "transpose") {
        const opIndex = currentOffset;
        map.set(opIndex, {
          text: node.source.text,
          start: node.source.start,
          end: node.source.start + node.source.length
        });
        currentOffset += OP_TRANSPOSE_SIZE;
      } else if (node.type === "scale") {
        const opIndex = currentOffset;
        map.set(opIndex, {
          text: node.source.text,
          start: node.source.start,
          end: node.source.start + node.source.length
        });
        currentOffset += OP_SCALE_SIZE;
      } else if (node.type === "swing") {
        const opIndex = currentOffset;
        map.set(opIndex, {
          text: node.source.text,
          start: node.source.start,
          end: node.source.start + node.source.length
        });
        currentOffset += OP_SWING_SIZE;
      } else if (node.type === "group") {
        currentOffset += OP_GROUP_START_SIZE;
        currentOffset = buildSourceMapFromNodes(node.children, _bytecode, currentOffset, map);
        currentOffset += OP_GROUP_END_SIZE;
      } else if (node.type === "at") {
        currentOffset += OP_CYCLE_START_SIZE;
        currentOffset = buildSourceMapFromNodes(node.children, _bytecode, currentOffset, map);
        currentOffset += OP_CYCLE_END_SIZE;
      }
    }
    return currentOffset;
  }
  const cacheByMiniSourceMap = /* @__PURE__ */ new Map();
  function buildMiniSourceMap(src, nodes, bytecode) {
    const cached = cacheByMiniSourceMap.get(src);
    if (cached) return cached;
    if (cacheByMiniSourceMap.size > 1e3) {
      cacheByMiniSourceMap.clear();
    }
    const map = /* @__PURE__ */ new Map();
    buildSourceMapFromNodes(nodes, bytecode, OP_GROUP_START_SIZE, map);
    const result = map;
    cacheByMiniSourceMap.set(src, result);
    return result;
  }
  const numRe = "[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)";
  const pointTokenRe = new RegExp(`^(${numRe}),(${numRe})(?:([e])(${numRe})?)?$`);
  function tokenizeTimelineNotation(input) {
    const tokens = [];
    let index = 0;
    let i = 0;
    while (i < input.length) {
      while (i < input.length && /\s/.test(input[i])) i++;
      if (i >= input.length) break;
      const start = i;
      while (i < input.length && !/\s/.test(input[i])) i++;
      const end = i;
      tokens.push({ index, start, length: end - start, text: input.slice(start, end) });
      index++;
    }
    return tokens;
  }
  function parseTimelineNotation(tokens) {
    const points = [];
    for (const t of tokens) {
      const m = pointTokenRe.exec(t.text);
      if (!m) continue;
      const bar = Number(m[1] ?? 0);
      const value = Number(m[2] ?? 0);
      const curveKind = m[3] ?? null;
      const curveValue = Number(m[4] ?? 0);
      const exp = curveKind === "e" ? curveValue : null;
      if (!Number.isFinite(bar) || !Number.isFinite(value)) continue;
      points.push({
        bar,
        value,
        exp,
        tokenIndex: t.index,
        tokenStart: t.start,
        tokenLength: t.length
      });
    }
    return points;
  }
  function compilePoints(points) {
    if (points.length === 0) {
      return { segments: [], totalBars: 0, endValue: 0, endTokenIndex: -1, endTokenStart: -1, endTokenLength: -1 };
    }
    const pts = points.map((p) => ({ ...p, bar: p.bar })).filter((p) => p.bar >= 0);
    if (pts.length === 0) {
      return { segments: [], totalBars: 0, endValue: 0, endTokenIndex: -1, endTokenStart: -1, endTokenLength: -1 };
    }
    const hasZeroPoint = pts.some((p) => p.bar === 0);
    if (!hasZeroPoint) {
      pts.unshift({
        bar: 0,
        value: 0,
        exp: null,
        tokenIndex: -1,
        tokenStart: -1,
        tokenLength: -1
      });
    }
    const segments = [];
    let i = 0;
    let t = 0;
    let v = pts[0].value;
    let activeTokenIndex = pts[0].tokenIndex;
    let activeTokenStart = pts[0].tokenStart;
    let activeTokenLength = pts[0].tokenLength;
    while (i < pts.length && pts[i].bar === 0) {
      v = pts[i].value;
      activeTokenIndex = pts[i].tokenIndex;
      activeTokenStart = pts[i].tokenStart;
      activeTokenLength = pts[i].tokenLength;
      i++;
    }
    let endTokenIndex = activeTokenIndex;
    let endTokenStart = activeTokenStart;
    let endTokenLength = activeTokenLength;
    for (; i < pts.length; i++) {
      const p = pts[i];
      const nextT = p.bar;
      const nextV = p.value;
      const dt = nextT - t;
      if (dt < 0) continue;
      if (dt === 0) {
        t = nextT;
        v = nextV;
        activeTokenIndex = p.tokenIndex;
        activeTokenStart = p.tokenStart;
        activeTokenLength = p.tokenLength;
        endTokenIndex = activeTokenIndex;
        endTokenStart = activeTokenStart;
        endTokenLength = activeTokenLength;
        continue;
      }
      const exp = p.exp ?? 1;
      const kind = v === nextV ? TIMELINE_KIND_HOLD : TIMELINE_KIND_GLIDE;
      segments.push({
        kind,
        durBars: dt,
        startValue: v,
        endValue: nextV,
        exp,
        fromTokenIndex: activeTokenIndex,
        fromTokenStart: activeTokenStart,
        fromTokenLength: activeTokenLength,
        toTokenIndex: p.tokenIndex,
        toTokenStart: p.tokenStart,
        toTokenLength: p.tokenLength
      });
      t = nextT;
      v = nextV;
      activeTokenIndex = p.tokenIndex;
      activeTokenStart = p.tokenStart;
      activeTokenLength = p.tokenLength;
      endTokenIndex = activeTokenIndex;
      endTokenStart = activeTokenStart;
      endTokenLength = activeTokenLength;
    }
    let totalBars = t;
    if (totalBars <= 0) {
      totalBars = 1;
      segments.push({
        kind: TIMELINE_KIND_HOLD,
        durBars: 1,
        startValue: v,
        endValue: v,
        exp: 1,
        fromTokenIndex: activeTokenIndex,
        fromTokenStart: activeTokenStart,
        fromTokenLength: activeTokenLength,
        toTokenIndex: activeTokenIndex,
        toTokenStart: activeTokenStart,
        toTokenLength: activeTokenLength
      });
    }
    return { segments, totalBars, endValue: v, endTokenIndex, endTokenStart, endTokenLength };
  }
  const cacheBySequence = /* @__PURE__ */ new Map();
  function compileTimelineNotation(input, initialBeatDiv = 4) {
    const cached = cacheBySequence.get(input);
    if (cached) return cached;
    if (cacheBySequence.size > 1e3) {
      cacheBySequence.clear();
    }
    const tokens = tokenizeTimelineNotation(input);
    const noWrap = tokens.some((t) => t.text === "-");
    const points = parseTimelineNotation(tokens);
    const compiled = compilePoints(points);
    const segments = compiled.segments;
    let totalBars = compiled.totalBars;
    if (noWrap && segments.length > 0) {
      const last = segments[segments.length - 1];
      const lastValue = last.kind === TIMELINE_KIND_GLIDE ? last.endValue : last.startValue;
      if (lastValue !== compiled.endValue) {
        segments.push({
          kind: TIMELINE_KIND_HOLD,
          durBars: 1,
          startValue: compiled.endValue,
          endValue: compiled.endValue,
          exp: 1,
          fromTokenIndex: compiled.endTokenIndex,
          fromTokenStart: compiled.endTokenStart,
          fromTokenLength: compiled.endTokenLength,
          toTokenIndex: compiled.endTokenIndex,
          toTokenStart: compiled.endTokenStart,
          toTokenLength: compiled.endTokenLength
        });
      }
    }
    const beatsPerBar = initialBeatDiv > 0 ? initialBeatDiv : 4;
    const segCount = segments.length;
    const opLength = TIMELINE_HEADER_SIZE + segCount * TIMELINE_SEGMENT_SIZE;
    const bytecode = new Float32Array(1 + opLength);
    bytecode[0] = opLength;
    bytecode[1] = TIMELINE_MAGIC;
    bytecode[2] = segCount;
    bytecode[3] = noWrap ? -totalBars : totalBars;
    bytecode[4] = beatsPerBar;
    let o = 1 + TIMELINE_HEADER_SIZE;
    for (const s of segments) {
      bytecode[o++] = s.kind;
      bytecode[o++] = s.durBars;
      bytecode[o++] = s.startValue;
      bytecode[o++] = s.endValue;
      bytecode[o++] = s.exp;
    }
    const segmentTokens = segments.map((s) => ({
      fromTokenIndex: s.fromTokenIndex,
      fromTokenStart: s.fromTokenStart,
      fromTokenLength: s.fromTokenLength,
      toTokenIndex: s.toTokenIndex,
      toTokenStart: s.toTokenStart,
      toTokenLength: s.toTokenLength
    }));
    const result = { bytecode, tokens: segmentTokens, segments };
    cacheBySequence.set(input, result);
    return result;
  }
  const cacheByTramSequence = /* @__PURE__ */ new Map();
  function compileTramSequence(input) {
    const cached = cacheByTramSequence.get(input);
    if (cached) return cached;
    if (cacheByTramSequence.size > 1e3) {
      cacheByTramSequence.clear();
    }
    const beats = parseHierarchicalBeats(input);
    const sequence = {
      beats,
      totalBeats: beats.length
    };
    cacheByTramSequence.set(input, sequence);
    return sequence;
  }
  function parseHierarchicalBeats(input) {
    const beats = [];
    let i = 0;
    while (i < input.length) {
      if (input[i] === "[") {
        const bracketContent = parseBracketContent(input, i);
        const subdivisions = [];
        for (let j = 0; j < bracketContent.content.length; j++) {
          const char = bracketContent.content[j];
          if (char === "x" || char === "X") {
            subdivisions.push(true);
          } else if (char === "-") {
            subdivisions.push(false);
          }
        }
        beats.push({ subdivisions });
        i = bracketContent.endIndex;
      } else if (!/\s/.test(input[i])) {
        const subdivisions = input[i] === "x" || input[i] === "X" ? [true] : [false];
        beats.push({ subdivisions });
        i++;
      } else {
        i++;
      }
    }
    return beats;
  }
  function parseBracketContent(input, startIndex) {
    let bracketCount = 1;
    let j = startIndex + 1;
    while (j < input.length && bracketCount > 0) {
      if (input[j] === "[") {
        bracketCount++;
      } else if (input[j] === "]") {
        bracketCount--;
      }
      j++;
    }
    if (bracketCount > 0) {
      throw new Error("Unmatched opening bracket in tram sequence");
    }
    const content = input.slice(startIndex + 1, j - 1).trim();
    if (content.length === 0) {
      throw new Error("Empty brackets in tram sequence");
    }
    return { content, endIndex: j };
  }
  function tramSequenceToBytecode(sequence) {
    if (sequence.totalBeats === 0) {
      return new Float32Array([0]);
    }
    let totalSize = 1;
    for (const beat of sequence.beats) {
      totalSize += 1;
      totalSize += Math.ceil(beat.subdivisions.length / 32);
    }
    const bytecode = new Float32Array(totalSize);
    let writeIndex = 0;
    bytecode[writeIndex++] = sequence.totalBeats;
    for (const beat of sequence.beats) {
      const subdivCount = beat.subdivisions.length;
      bytecode[writeIndex++] = subdivCount;
      const packedLength = Math.ceil(subdivCount / 32);
      for (let i = 0; i < packedLength; i++) {
        let packed = 0;
        for (let bit = 0; bit < 32; bit++) {
          const index = i * 32 + bit;
          if (index < subdivCount && beat.subdivisions[index]) {
            packed |= 1 << bit;
          }
        }
        bytecode[writeIndex++] = packed;
      }
    }
    return bytecode;
  }
  const functionDefinitions = {
    "t": {
      name: "t",
      parameters: [],
      returnType: "number",
      description: "BPM adjusted time elapsed: 1 t = ¼ note.",
      examples: [
        "saw([c4,a4,f4,e4][t]) |> out($)"
      ],
      type: "variable",
      category: "variables"
    },
    "scale": {
      name: "scale",
      type: "variable",
      parameters: [],
      returnType: "string",
      description: "The scale to use.\n\nAvailable scales:\n\n" + Object.keys(SCALE_INTERVALS).join(", "),
      examples: [
        `scale='minor' trig=every(1/8) drawbar(#scale.step(trig)*o4)*ad(.01,.5,4,trig) |> out($)`
      ],
      category: "variables"
    },
    "#scale": {
      name: "#scale",
      parameters: [],
      returnType: "array",
      description: "The current scale in an array of frequencies.\n\nAvailable scales:\n\n" + Object.keys(SCALE_INTERVALS).join(", "),
      examples: [
        `scale='minor' trig=every(1/8) drawbar(#scale.step(trig)*o4)*ad(.01,.5,4,trig) |> out($)`
      ],
      type: "variable",
      category: "variables"
    },
    ".map": {
      name: "[].map",
      parameters: [
        {
          name: "cb",
          type: "(x: any, i: number, arr: array) -> any",
          description: "Callback function that transforms each element."
        }
      ],
      returnType: "array",
      description: "Maps over an array and returns a new array with the results.",
      examples: [
        "[60,62,65].map((x,i)->rhodes70(note(x*(1.03**i)))).avg() |> out($)"
      ],
      category: "array"
    },
    ".glide": {
      name: "[].glide",
      parameters: [
        { name: "bar", type: "number", description: "Step duration in bars (1 = 4 beats).", min: 1e-4, step: 1e-4 },
        {
          name: "exponent",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Curve shape: 1=linear, >0 uses pow(t,exp), <0 uses logarithmic curve base=-exp.",
          min: -10,
          max: 10,
          step: 0.1
        }
      ],
      returnType: "number",
      description: "Iterates numeric array values on a beat-locked bar division and glides between them.",
      examples: [
        `scale='aeolian' trig=euclid(3,8,bar:1/2)
;[#1,#3,#5].glide(1/4,exponent:.2) |> cs80($*o3,trig) |> $+velvet($,.8) |> limiter($) |> out($)`
      ],
      category: "array"
    },
    ".sum": {
      name: "[].sum",
      parameters: [],
      returnType: "number",
      description: "Sums an array and returns the result.",
      examples: [
        "[1,2,3].sum() |> print($)"
      ],
      category: "array"
    },
    ".avg": {
      name: "[].avg",
      parameters: [],
      returnType: "number",
      description: "Averages an array and returns the result.",
      examples: [
        "[60,62,65].map(x->rhodes70(note(x))).avg() |> out($)"
      ],
      category: "array"
    },
    ".step": {
      name: "[].step",
      parameters: [
        { name: "trig", type: "number", description: "Trigger impulse that advances to next array element." }
      ],
      returnType: "number",
      description: "Steps through array elements on trigger impulses, wrapping around when reaching the end.",
      examples: [
        `scale='pentatonic' trig=euclid(5,8,bar:1/2) env=ad(.01,.5,5,trig)
#scale.step(trig) |> rhodes70($*o4)*env |> out($)`
      ],
      category: "array"
    },
    ".random": {
      name: "[].random",
      parameters: [
        { name: "trig", type: "number", description: "Trigger impulse that selects a random array element." },
        { name: "seed", type: "number", description: "Random seed (optional, default: 0).", optional: true }
      ],
      returnType: "number",
      description: "Selects random array elements on trigger impulses.",
      examples: [
        `scale='yu' trig=euclid(5,8,bar:1/2) env=ad(.01,.5,5,trig)
#scale.random(trig) |> drawbar($*[o3,o4,o5].random(trig))*env |> out($)`
      ],
      category: "array"
    },
    ".reverse": {
      name: "[].reverse",
      parameters: [],
      returnType: "array",
      description: "Reverses the array in place and returns the reversed array.",
      examples: [
        `scale='aeolian' trig=euclid(3,8,bar:1/2) env=ad(.01,.75 ,5,trig)
;((t/2+2)%4>2?#scale:#scale.reverse()).step(trig) |> rhodes($*o3)*env |> limiter($) |> out($)`
      ],
      category: "array"
    },
    ".shuffle": {
      name: "[].shuffle",
      parameters: [
        { name: "seed", type: "number", description: "Random seed (optional, default: random).", optional: true }
      ],
      returnType: "array",
      description: "Shuffles the array elements randomly and returns the shuffled array.",
      examples: [
        `scale='yu' trig=euclid(3,8,bar:1/2) env=ad(.01,.5,5,trig)
#scale.shuffle(42).step(trig) |> drawbar($*o4)*env |> out($)`
      ],
      category: "array"
    },
    ".walk": {
      name: "[].walk",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Interval in bars for stepping through array elements (1/16 = sixteenth note).",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "swing",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Swing amount (0..1) shifts odd beats earlier",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Seconds to delay the entire walk sequence",
          min: 0,
          step: 1e-3
        }
      ],
      returnType: "number",
      description: "Steps through array elements at beat-locked intervals, deterministically based on global time.",
      examples: [
        `scale='pentatonic' #scale.walk(1/8) |> rhodes70($*o4) |> out($)`
      ],
      category: "array"
    },
    oversample: {
      name: "oversample",
      parameters: [
        { name: "times", type: "number", description: "Oversampling factor (1..16).", min: 1, max: 16, step: 1 },
        { name: "callback", type: "() -> number | [L:number, R:number]", description: "Signal generator callback." }
      ],
      returnType: "number | [L:number, R:number]",
      description: "Evaluates a signal at a higher internal sample rate and downsamples back to reduce aliasing (CPU heavy).",
      examples: [
        "oversample(8, () -> saw(440)) |> out($)",
        "oversample(8, cb: () -> [saw(220), saw(221)]) |> out($)"
      ],
      category: "utilities"
    },
    out: {
      name: "out",
      parameters: [
        {
          name: "signal",
          type: "number | [L:number, R:number]",
          description: "Audio-rate signal to be mixed into the output channels. If a single signal is provided, it will be sent to both left and right channels. If an array [L, R] is provided, L goes to left channel and R to right channel."
        },
        {
          name: "R",
          type: "number",
          optional: true,
          description: "Audio-rate signal to be mixed into the right output channel (for backward compatibility with out(L, R) syntax)"
        }
      ],
      returnType: "number",
      description: "Routes signals to the stereo output bus so that `... |> out($)` becomes the final mix-down stage.",
      examples: [
        "sine(440) |> out($)",
        "out([sine(440), sine(441)])",
        "out(sine(440), sine(441))",
        // backward compatibility
        "play(seq, (trig, _, hz) -> sine(hz, trig)) |> analyser($) |> out($)"
      ],
      category: "mixing"
    },
    solo: {
      name: "solo",
      parameters: [
        {
          name: "L",
          type: "number",
          description: "Audio-rate signal to be mixed into the left output channel (and right as well if R is omitted); mutes non-solo outs when any solo exists"
        },
        {
          name: "R",
          type: "number",
          optional: true,
          description: "Audio-rate signal to be mixed into the right output channel (defaults to L)."
        }
      ],
      returnType: "number",
      description: "Like `out`, but when there is at least one `solo` call, all regular `out` calls are muted and all `solo` signals are summed to the output.",
      examples: [
        "sine(440) |> solo($)",
        "solo(sine(440), sine(441))"
      ],
      category: "mixing"
    },
    post: {
      name: "post",
      parameters: [
        {
          name: "callback",
          type: "([L:number, R:number]) -> [L,R]",
          description: "Post-processing callback."
        }
      ],
      returnType: "number",
      description: "Registers a post-processing stage that runs after all `out`/`solo` mixing; multiple `post` calls chain in order.",
      examples: [
        "post(([L, R]) -> [L, R])",
        "post(([L, R]) -> [L * .5, R * .5])"
      ],
      category: "mixing"
    },
    sine: {
      name: "sine",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Phase-continuous sine oscillator; the optional trigger lets you restart the wave from zero.",
      examples: [
        `sine(a2)*.3 |> out($)`
      ],
      category: "generators"
    },
    tri: {
      name: "tri",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Triangle wave oscillator.",
      examples: [
        `tri(a2)*.3 |> out($)`
      ],
      category: "generators"
    },
    saw: {
      name: "saw",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Sawtooth wave oscillator.",
      examples: [
        `saw(a2)*.3 |> out($)`
      ],
      category: "generators"
    },
    ramp: {
      name: "ramp",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Ramp wave oscillator (inverted sawtooth).",
      examples: [
        `ramp(a2)*.3 |> out($)`
      ],
      category: "generators"
    },
    sqr: {
      name: "sqr",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Square wave oscillator.",
      examples: [
        `sqr(a2)*.3 |> out($)`
      ],
      category: "generators"
    },
    pwm: {
      name: "pwm",
      parameters: [
        { name: "hz", type: "number", description: "Frequency in hertz.", min: 0, max: 2e4, step: 1, slope: "log2" },
        {
          name: "width",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Pulse width control (0..1).",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger that resets the phase back to 0 when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Pulse width modulation oscillator.",
      examples: [
        `pwm(a1,lfosine(2)) |> out($)`
      ],
      category: "generators"
    },
    phasor: {
      name: "phasor",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Start offset in seconds applied when the trigger fires (0 = start at 0).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger that resets the ramp and starts it again when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Ramp oscillator that goes from 0 to 1 and can be retriggered.",
      examples: [
        "phasor(1, 0, trig) |> out($)",
        "phasor(1, .25, trig) |> out($)"
      ],
      category: "generators"
    },
    impulse: {
      name: "impulse",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Impulse oscillator that produces steady impulses (1 sample of value 1, rest 0) at the given frequency.",
      examples: [
        `rimshot(trig:impulse(1)) |> out($)`
      ],
      category: "generators"
    },
    inc: {
      name: "inc",
      parameters: [
        {
          name: "hz",
          type: "number",
          description: "Frequency in hertz (negative values clamp to zero).",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "width",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Maximum value (ceiling) that the oscillator will reach before stopping.",
          min: 0,
          step: 0.01
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset in seconds applied when the trigger fires (0 = no offset).",
          min: 0,
          step: 1e-3
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that resets the oscillator phase when it crosses from ≤0 to >0."
        }
      ],
      returnType: "number",
      description: "Incremental oscillator that increases linearly from 0 to the width value at the given frequency.",
      examples: [
        `pink()*inc(.1)|>out($)`
      ],
      category: "generators"
    },
    zerox: {
      name: "zerox",
      parameters: [
        { name: "in", type: "number", description: "Input signal to detect zero crossings." }
      ],
      returnType: "number",
      description: "Zero crossing detector that outputs a trigger impulse when the signal crosses from ≤0 to >0.",
      examples: [
        "sine(1) |> zerox($) |> out($)",
        "saw(0.1) |> zerox($) |> ad(0.01, 0.1, trig:$) |> sine(440) |> out($)"
      ],
      category: "utilities"
    },
    pitchshift: {
      name: "pitchshift",
      parameters: [
        { name: "in", type: "number", description: "Input signal to pitch shift." },
        {
          name: "ratio",
          type: "number",
          description: "Pitch shift ratio (0.5 = octave down, 2 = octave up, 1 = same).",
          min: 0.1,
          max: 4,
          step: 0.01,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "Pitch shifts the input signal using granular synthesis.",
      examples: [
        "sine(440) |> pitchshift($, 2) |> out($)",
        "sine(440) |> pitchshift($, 0.5) |> out($)"
      ],
      category: "effects"
    },
    ad: {
      name: "ad",
      parameters: [
        {
          name: "attack",
          type: "number",
          description: "Time in seconds to ramp from 0 up to 1.",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "decay",
          type: "number",
          description: "Time in seconds to fall back from 1 to 0.",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "exponent",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Curve shape: 0/1/-1=linear, >1=exponential, 0>..<1=subexponential <-1=logarithmic -0>..<-1=sublogarithmic.",
          min: -10,
          max: 10,
          step: 0.1
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger input (defaults to 0) that restarts the attack phase when it fires."
        }
      ],
      returnType: "number",
      description: "Attack/decay envelope that emits a single bump per trigger pulse.",
      examples: [
        "drawbar(a3) * ad(attack:.01,decay:.3,exponent:2,trig:every(1/8)) |> out($)"
      ],
      category: "generators"
    },
    adsr: {
      name: "adsr",
      parameters: [
        {
          name: "attack",
          type: "number",
          description: "Time to ramp from 0 to 1.",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "decay",
          type: "number",
          description: "Time to fall from 1 to the sustain level.",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "sustain",
          type: "number",
          description: "Level (0–1) held while the trigger is high.",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "release",
          type: "number",
          description: "Time to fall from sustain back to 0 once the trigger drops.",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "exponent",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Curve shape: 0/1/-1=linear, >1=exponential, 0>..<1=subexponential <-1=logarithmic -0>..<-1=sublogarithmic.",
          min: -10,
          max: 10,
          step: 0.1
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger signal that keeps the envelope in sustain until it goes back to 0."
        }
      ],
      returnType: "number",
      description: "Full attack/decay/sustain/release envelope. Always reaches 1, settles at sustain while trig is high, then decays to 0.",
      examples: [
        `trig=step(lfosaw(1),.5) supersaw(a4) * adsr(.1,.2,.3,.75,trig) |> out($)`
      ],
      category: "generators"
    },
    envfollow: {
      name: "envfollow",
      parameters: [
        { name: "in", type: "number", description: "Signal to envelope-follow." },
        {
          name: "attack",
          type: "number",
          optional: true,
          defaultValue: 0.01,
          description: "Attack time in seconds (how quickly it responds to signal increases).",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "release",
          type: "number",
          optional: true,
          defaultValue: 0.1,
          description: "Release time in seconds (how quickly it responds to signal decreases).",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "Envelope follower that tracks the amplitude of an input signal with separate attack and release times.",
      examples: [
        "sine(440) |> envfollow($) |> out($)",
        "envfollow(saw(hz), attack: 0.005, release: 0.2) |> out($)",
        "sine(220) * envfollow($, attack: 0.01, release: 0.05) |> out($)"
      ],
      category: "utilities"
    },
    analyser: {
      name: "analyser",
      parameters: [
        { name: "signal", type: "number", description: "Signal to create an analyser." }
      ],
      returnType: "number",
      description: "Creates an analyser for the signal. Returns the original signal.",
      examples: [
        `saw(330)*ad(.01,.2,trig:every(1/8)) |> analyser($)
|> out($)`
      ],
      category: "analysis"
    },
    amplitude: {
      name: "amplitude",
      parameters: [
        { name: "signal", type: "number", description: "Signal to create an amplitude analyser." }
      ],
      returnType: "number",
      description: "Creates an amplitude analyser widget for the signal. Returns the original signal.",
      examples: [
        `saw(330)*ad(.01,.2,trig:every(1/8)) |> amplitude($)
|> out($)`
      ],
      category: "analysis"
    },
    waveform: {
      name: "waveform",
      parameters: [
        { name: "signal", type: "number", description: "Signal to create a waveform analyser." }
      ],
      returnType: "number",
      description: "Creates a waveform analyser widget for the signal. Returns the original signal.",
      examples: [
        `saw(330)*ad(.01,.2,trig:every(1/8)) |> waveform($)
|> out($)`
      ],
      category: "analysis"
    },
    spectrum: {
      name: "spectrum",
      parameters: [
        { name: "signal", type: "number", description: "Signal to create a spectrum analyser." }
      ],
      returnType: "number",
      description: "Creates a spectrum analyser widget for the signal. Returns the original signal.",
      examples: [
        `saw(330)*ad(.01,.2,trig:every(1/8)) |> spectrum($)
|> out($)`
      ],
      category: "analysis"
    },
    level: {
      name: "level",
      parameters: [
        { name: "signal", type: "number", description: "Signal to create a level meter analyser." }
      ],
      returnType: "number",
      description: "Creates a level meter (VU) analyser widget for the signal. Returns the original signal.",
      examples: [
        `saw(330)*ad(.01,.2,trig:every(1/8)) |> level($)
|> out($)`
      ],
      category: "analysis"
    },
    print: {
      name: "print",
      parameters: [
        { name: "signal", type: "number", description: "Signal to print/inspect." }
      ],
      returnType: "number",
      description: "Creates a print analyser widget that shows the values it receives. Returns the original signal.",
      examples: [
        "[1,2,3,4,5].random(every(1/8)) |> print($)"
      ],
      category: "analysis"
    },
    compressor: {
      name: "compressor",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "attack",
          type: "number",
          description: "Attack time in seconds (0.0001 .. 1)",
          min: 1e-4,
          max: 1,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "release",
          type: "number",
          description: "Release time in seconds (0.0001 .. 5)",
          min: 1e-4,
          max: 5,
          step: 1e-4,
          slope: "log2"
        },
        { name: "threshold", type: "number", description: "Threshold in dB (-60 .. 0)", min: -60, max: 0, step: 0.1 },
        { name: "ratio", type: "number", description: "Compression ratio (1 .. 20)", min: 1, max: 20, step: 0.1 },
        { name: "knee", type: "number", description: "Knee width in dB (0 .. 40)", min: 0, max: 40, step: 0.1 },
        { name: "key", type: "number", optional: true, description: "Optional sidechain key signal" }
      ],
      returnType: "number",
      description: "Compresses the input signal. When `key` is provided, gain reduction is driven by the key signal (sidechain) but applied to `in`.",
      examples: [
        "compressor(saw(hz), .01, .1, -24, 4, 6) |> out($)",
        "compressor(in:$, attack:.005, release:.2, threshold:-18, ratio:6, knee:8) |> out($)"
      ],
      category: "mixing"
    },
    expander: {
      name: "expander",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "attack",
          type: "number",
          description: "Attack time in seconds (0.0001 .. 1)",
          min: 1e-4,
          max: 1,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "release",
          type: "number",
          description: "Release time in seconds (0.0001 .. 5)",
          min: 1e-4,
          max: 5,
          step: 1e-4,
          slope: "log2"
        },
        { name: "threshold", type: "number", description: "Threshold in dB (-60 .. 0)", min: -60, max: 0, step: 0.1 },
        { name: "ratio", type: "number", description: "Expansion ratio (1 .. 100)", min: 1, max: 100, step: 0.1 },
        { name: "knee", type: "number", description: "Knee width in dB (0 .. 40)", min: 0, max: 40, step: 0.1 },
        { name: "key", type: "number", optional: true, description: "Optional sidechain key signal" }
      ],
      returnType: "number",
      description: "Expands the input signal. When `key` is provided, gain reduction is driven by the key signal (sidechain) but applied to `in`.",
      examples: [
        "expander(saw(hz), .01, .1, -24, 2, 6) |> out($)",
        "expander(in:$, attack:.005, release:.2, threshold:-18, ratio:4, knee:8) |> out($)"
      ],
      category: "mixing"
    },
    gate: {
      name: "gate",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "attack",
          type: "number",
          description: "Attack time in seconds (0.0001 .. 1)",
          min: 1e-4,
          max: 1,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "release",
          type: "number",
          description: "Release time in seconds (0.0001 .. 5)",
          min: 1e-4,
          max: 5,
          step: 1e-4,
          slope: "log2"
        },
        { name: "threshold", type: "number", description: "Threshold in dB (-60 .. 0)", min: -60, max: 0, step: 0.1 },
        { name: "knee", type: "number", description: "Knee width in dB (0 .. 40)", min: 0, max: 40, step: 0.1 },
        {
          name: "hold",
          type: "number",
          description: "Hold time in seconds (0 .. 1)",
          min: 0,
          max: 1,
          step: 1e-3,
          slope: "log2"
        },
        { name: "key", type: "number", optional: true, description: "Optional sidechain key signal" }
      ],
      returnType: "number",
      description: "Noise gate that heavily attenuates signals below threshold. When `key` is provided, gating is driven by the key signal (sidechain) but applied to `in`.",
      examples: [
        "gate(saw(hz), .001, .08, -24, 0, .02) |> out($)",
        "gate(in:$, attack:.0005, release:.12, threshold:-20, knee:0, hold:.03) |> out($)"
      ],
      category: "mixing"
    },
    limiter: {
      name: "limiter",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "release",
          type: "number",
          description: "Release time in seconds (0.0001 .. 5)",
          min: 1e-4,
          max: 5,
          step: 1e-4,
          slope: "log2"
        },
        { name: "threshold", type: "number", description: "Threshold in dB (-80 .. 0)", min: -80, max: 0, step: 0.1 }
      ],
      returnType: "number",
      description: "Limits the input signal to never exceed the threshold. Uses infinite ratio (hard limiting) with per-sample attack.",
      examples: [
        "limiter(saw(hz), .1, -12) |> out($)",
        "limiter(in:$, release:.05, threshold:-6) |> out($)"
      ],
      category: "mixing"
    },
    mini: {
      name: "mini",
      parameters: [
        { name: "pattern", type: "string", description: "Mini notation sequence" },
        {
          name: "color",
          type: "string",
          optional: true,
          description: "UI color hint for the sequence (e.g. '#4af')"
        }
      ],
      returnType: "number",
      description: "Defines a Mini notation sequence. It compiles and returns a sequence reference.",
      examples: [
        `scale='aeolian'
play(mini('[i iv v ii]/2$.75','#4af'), (trig,velocity,hz)->sqr(hz,trig)*(env=ad(.01,.8,4,trig))|>slp($,300+5k*env**10,.7))*.2
+bd()+hh()+sd() |> out($*.8)`
      ],
      category: "sequencing"
    },
    play: {
      name: "play",
      parameters: [
        { name: "seq", type: "sequence", description: "Reference returned by `mini(pattern)`" },
        {
          name: "cb",
          type: "(trig: number, velocity: number, hz: number) -> number",
          description: "Callback that runs for each voice"
        },
        {
          name: "voices",
          type: "number",
          optional: true,
          description: "Override automatic voice allocation with a fixed number of voices (1..16)",
          min: 1,
          max: 16,
          step: 1
        },
        {
          name: "bar",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Duration in bars for a full cycle of the pattern",
          min: 1e-4,
          step: 1e-4
        }
      ],
      returnType: "number",
      description: "Plays a sequence reference with the provided callback.",
      examples: [
        `scale='aeolian'
play(mini('[i iv v ii]/2$.75','#4af'), (trig,velocity,hz)->sqr(hz,trig)*(env=ad(.01,.8,4,trig))|>slp($,300+5k*env**10,.7))*.2
+bd()+hh()+sd() |> out($*.8)`
      ],
      category: "sequencing"
    },
    timeline: {
      name: "timeline",
      parameters: [
        {
          name: "pattern",
          type: "string",
          description: "Timeline notation string (`bar,value` pairs with optional curve specifiers)"
        },
        {
          name: "color",
          type: "string",
          optional: true,
          description: "Optional color hint for the timeline widget (compile-time only)"
        }
      ],
      returnType: "number",
      description: "Plays back a sequence of interpolated values defined in timeline notation; useful for automations or gating.",
      examples: [
        `auto=timeline('1,1e3 2,0e-3 3,1e-2 -', '#f09')`
      ],
      category: "sequencing"
    },
    sampler: {
      name: "sampler",
      parameters: [
        {
          name: "sample",
          type: "number",
          description: "Sample reference (usually returned by `freesound(id:…)`)"
        },
        {
          name: "speed",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Playback speed (negative values play backwards)",
          min: -10,
          max: 10,
          step: 0.01,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Normalized start offset (0=beginning, 1=end); defaults to 1 when speed is a constant negative number",
          min: 0,
          max: 1,
          step: 1e-3
        },
        {
          name: "repeat",
          type: "boolean",
          optional: true,
          defaultValue: false,
          description: "When true the sample loops; otherwise it stops at the end"
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that starts playback when positive"
        }
      ],
      returnType: "number",
      description: "Plays a sample that was uploaded from the main thread. Triggering, looping, and negative playback are supported.",
      examples: [
        `sample=freesound(807998)
sampler(sample,trig:every(2)) |> out($)`
      ],
      category: "generators"
    },
    slicer: {
      name: "slicer",
      parameters: [
        {
          name: "sample",
          type: "number",
          description: "Sample reference returned by `freesound(id:…)`"
        },
        {
          name: "speed",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Playback speed (-1 for reverse)",
          min: -10,
          max: 10,
          step: 0.01,
          slope: "log2"
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Normalized offset inside the slice",
          min: 0,
          max: 1,
          step: 1e-3
        },
        {
          name: "slice",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Normalized slice index (0..1) that selects which detected slice to play",
          min: 0,
          max: 1,
          step: 1e-3
        },
        {
          name: "threshold",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Slice detection threshold (0..1); higher values produce fewer slices",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "repeat",
          type: "boolean",
          optional: true,
          defaultValue: false,
          description: "Loop the slice if true, otherwise stop when it ends"
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that launches the chosen slice"
        }
      ],
      returnType: "number",
      description: "Chooses one of the detected slices from a sample and plays it back with the requested speed/offset.",
      examples: [
        `slicer(sample:freesound(45730),threshold:0.05,slice:random(),trig:every(1/16,prob:.5))
|> out($)`
      ],
      category: "generators"
    },
    every: {
      name: "every",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Interval in bars at which the gate can fire (1 = one bar, 0.25 = quarter note)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "prob",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Probability (0..1) that each eligible bar actually fires",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Seed for the built-in pseudorandom generator",
          min: 0,
          step: 1
        },
        {
          name: "swing",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Swing amount (0..1) shifts odd beats earlier",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Seconds to delay the entire gate sequence",
          min: 0,
          step: 1e-3
        }
      ],
      returnType: "number",
      description: "Emits 1.0 whenever the playhead crosses the requested bars/probability, otherwise 0.",
      examples: [
        `scale='zhi'
trig=every(1/6)+every(3/4) env=ad(.02,.2,5,trig)
saw(#scale.random(trig)*o4)*ad(.02,.2,5,trig) |> slp($,500+10k*env**10,.5)*.5 |> out($)
bd()+sd() |> out($*.8)`
      ],
      category: "sequencing"
    },
    at: {
      name: "at",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Absolute bar position where the gate should fire",
          min: 0,
          step: 1e-4
        },
        {
          name: "every",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Repeat interval in bars (leave zero to fire only once)",
          min: 0,
          step: 1e-4
        },
        {
          name: "prob",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Probability that a hit actually happens",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Seed used when sampling probability",
          min: 0,
          step: 1
        }
      ],
      returnType: "number",
      description: "Fires a gate at an absolute bar and optionally every N bars after that, with probability control.",
      examples: [
        `bpm=144
perc=(seed,trig)->pink(seed,trig)*ad(.01,.08,15,trig)
every=1/2 q=.5
 perc(23,at(0,   every,prob:.9,seed:123))
+perc(45,at(1/12,every,prob:.9,seed:456))
+perc(67,at(3/12,every,prob:.9,seed:789))
|> bp($,70,q)+bp($,720,q)+bp($,1300,q) |> $+freeverb($,.796)
|> out($)
`
      ],
      category: "sequencing"
    },
    euclid: {
      name: "euclid",
      parameters: [
        {
          name: "pulses",
          type: "number",
          description: "Number of hits (beats) to distribute across the step grid",
          min: 0,
          max: 128,
          step: 1
        },
        {
          name: "steps",
          type: "number",
          description: "Number of steps in the grid",
          min: 1,
          max: 128,
          step: 1
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Rotation offset in steps (positive values shift the pattern left)",
          min: -128,
          max: 128,
          step: 1
        },
        {
          name: "bar",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Duration in bars for a full cycle of the pattern",
          min: 1e-4,
          step: 1e-4
        }
      ],
      returnType: "number",
      description: "Generates trigger impulses using a Euclidean rhythm (Tidal-style).",
      examples: [
        `scale='aeolian'
trig=euclid(3,8,bar:1/2) env=ad(.001,.2,2,trig)
saw([#1,#6,#5,#3].step(trig)*o2)*env |> slp($,500+ 10k*env**15,.5)*.7 |> out($)
bd()+hh()+sd() |> out($*.8)`
      ],
      category: "sequencing"
    },
    slew: {
      name: "slew",
      parameters: [
        { name: "in", type: "number", description: "Signal to be slewed (limited)" },
        {
          name: "up",
          type: "number",
          description: "Rise rate factor when signal increases",
          min: 0,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "down",
          type: "number",
          optional: true,
          description: "Fall rate when signal decreases (defaults to up rate if ≤ 0)",
          min: 0,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "exponent",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Curve shape: 1=linear, >1=exponential, <1=logarithmic.",
          min: 0.1,
          max: 10,
          step: 0.1
        }
      ],
      category: "utilities",
      returnType: "number",
      description: "Rate-limits a signal to prevent sudden jumps. Useful for smoothing control signals, portamento effects, or creating more natural parameter changes.",
      examples: [
        "sine(freq |> slew($,up:.01,down:.03)) |> out($)"
      ]
    },
    freesound: {
      name: "freesound",
      parameters: [
        { name: "id", type: "number", description: "Integer ID of a FreeSound sample", min: 0, step: 1 }
      ],
      returnType: "number",
      description: "Compile-time helper that downloads and registers a FreeSound sample, returning a handle for `sampler`/`slicer`.",
      examples: [
        "kick = freesound(id: 123456)",
        "sampler(sample: kick, trig)"
      ],
      category: "utilities"
    },
    record: {
      name: "record",
      parameters: [
        {
          name: "seconds",
          type: "number",
          description: "Duration to record in seconds (clamped to 0..1)",
          min: 0,
          max: 1,
          step: 1e-3
        },
        {
          name: "cb",
          type: "() -> number",
          description: "Callback to generate the sample signal (called at audio rate)"
        }
      ],
      returnType: "number",
      description: "Records `seconds` of the callback output into an in-memory sample (once on playback start, then cached until the callback changes). Returns a sample reference for `sampler`.",
      examples: [
        "tone = record(.5, () -> sine(220))",
        "sampler(sample: tone, trig)"
      ],
      category: "utilities"
    },
    delay: {
      name: "delay",
      parameters: [
        { name: "in", type: "number", description: "Signal to be delayed" },
        {
          name: "seconds",
          type: "number",
          description: "Delay time in seconds (clamped to 0..10)",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "feedback",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Feedback amount; 0 produces a single echo only",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "cb",
          type: "(in: number) -> number",
          optional: true,
          defaultValue: "x -> x",
          description: "Applied to the feedback signal"
        }
      ],
      category: "effects",
      returnType: "number",
      description: "Delay effect as a signal method; returns the delayed signal (wet only).",
      examples: [
        "sine(440) |> delay($, seconds:.25) |> out($)",
        "sine(220) |> delay($, seconds:.35, feedback:.4, cb:x -> lp(x, cutoff:1000, q:.8)) |> out($)"
      ]
    },
    freeverb: {
      name: "freeverb",
      parameters: [
        { name: "in", type: "number | [L:number, R:number]", description: "Signal to reverberate (mono or stereo)" },
        {
          name: "roomSize",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Room size (0..1); higher values increase decay/feedback",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "damping",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "High-frequency damping (0..1); higher values damp more",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      category: "reverbs",
      returnType: "[L:number, R:number]",
      description: "Freeverb-style reverb effect; returns wet stereo signal.",
      examples: [
        "saw(hz) |> freeverb($, roomSize:.6, damping:.3) |> out($)",
        "[saw(220), saw(221)] |> freeverb($, roomSize:.6, damping:.3) |> out($)",
        "sine(220) |> freeverb($, roomSize:.85, damping:.1) |> out($)"
      ]
    },
    dattorro: {
      name: "dattorro",
      parameters: [
        { name: "in", type: "number | [L:number, R:number]", description: "Signal to reverberate (mono or stereo)" },
        {
          name: "roomSize",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Room size/decay (0..1); higher values increase decay/feedback",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "damping",
          type: "number",
          optional: true,
          defaultValue: 5e-3,
          description: "High-frequency damping (0..1); higher values damp more",
          min: 0,
          max: 1,
          step: 1e-3
        },
        {
          name: "bandwidth",
          type: "number",
          optional: true,
          defaultValue: 0.9999,
          description: "Input low-pass filter cutoff (0..1)",
          min: 0,
          max: 1,
          step: 1e-4
        },
        {
          name: "inputDiffusion1",
          type: "number",
          optional: true,
          defaultValue: 0.75,
          description: "First input diffuser amount (0..1)",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "inputDiffusion2",
          type: "number",
          optional: true,
          defaultValue: 0.625,
          description: "Second input diffuser amount (0..1)",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "decayDiffusion1",
          type: "number",
          optional: true,
          defaultValue: 0.7,
          description: "First decay diffuser amount (0..<1)",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "decayDiffusion2",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Second decay diffuser amount (0..<1)",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "excursionRate",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Modulation rate (0..2)",
          min: 0,
          max: 2,
          step: 0.01
        },
        {
          name: "excursionDepth",
          type: "number",
          optional: true,
          defaultValue: 0.7,
          description: "Modulation depth (0..2)",
          min: 0,
          max: 2,
          step: 0.01
        },
        {
          name: "preDelay",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Pre-delay time in samples (0..sampleRate-1)",
          min: 0,
          step: 1
        }
      ],
      category: "reverbs",
      returnType: "[L:number, R:number]",
      description: "Dattorro-style plate reverb effect; returns wet stereo signal.",
      examples: [
        "saw(hz) |> dattorro($, 0.6) |> out($)",
        "saw(hz) |> dattorro($, roomSize:.6) |> out($)",
        "[saw(220), saw(221)] |> dattorro($, 0.75, 0, 0.9999, 0.75, 0.625, 0.7, 0.5, 0.01) |> out($)",
        "[saw(220), saw(221)] |> dattorro($, roomSize:.75, damping:.01) |> out($)"
      ]
    },
    fdn: {
      name: "fdn",
      parameters: [
        { name: "in", type: "number | [L:number, R:number]", description: "Signal to reverberate (mono or stereo)" },
        {
          name: "roomSize",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Room size scaling (0..1); affects delay line lengths",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "damping",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "High-frequency damping (0..1); 0=bright, 1=dark",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "decay",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Global feedback gain (0..1); higher values increase decay time",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "modulationDepth",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Modulation depth scalar (0..1); affects chorus-like modulation",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      category: "reverbs",
      returnType: "[L:number, R:number]",
      description: "Feedback Delay Network (FDN) reverb with 8 delay lines, Hadamard feedback matrix, and modulated fractional delays; returns wet stereo signal.",
      examples: [
        "saw(hz) |> fdn($, roomSize:0.8, decay:0.6) |> out($)",
        "saw(hz) |> fdn($, roomSize:1.0, decay:0.5, damping:0.3, modulationDepth:0.8) |> out($)",
        "[saw(220), saw(221)] |> fdn($, roomSize:0.9, decay:0.7, damping:0.2) |> out($)"
      ]
    },
    velvet: {
      name: "velvet",
      parameters: [
        { name: "in", type: "number | [L:number, R:number]", description: "Signal to reverberate (mono or stereo)" },
        {
          name: "roomSize",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Room size scaling (0.1..2.0); affects delay line lengths",
          min: 0.1,
          max: 2,
          step: 0.01
        },
        {
          name: "damping",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "High-frequency damping (0..1); higher values damp more",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "decay",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Decay time control (0..1); higher values produce longer reverb tails",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      category: "reverbs",
      returnType: "[L:number, R:number]",
      description: "Velvet noise reverb using 8 delay lines with rich texture and stereo decorrelation; returns wet stereo signal.",
      examples: [
        "saw(hz) |> velvet($, roomSize:0.8, damping:0.3) |> out($)",
        "[saw(220), saw(221)] |> velvet($, roomSize:1.2, damping:0.2) |> out($)",
        "sine(220) |> velvet($, roomSize:0.6, damping:0.8) |> out($)"
      ]
    },
    dc: {
      name: "dc",
      parameters: [
        { name: "in", type: "number", description: "Signal to be DC-blocked" }
      ],
      returnType: "number",
      description: "DC blocker filter that removes very low frequency content (DC offset) from the signal.",
      examples: [
        "saw(110) |> dc($) |> out($)",
        "sine(440) + 0.1 |> dc($) |> out($)"
      ],
      category: "filters"
    },
    note: {
      name: "note",
      parameters: [
        { name: "midi", type: "number", description: "MIDI note number", min: 0, max: 127, step: 1 }
      ],
      returnType: "number",
      description: "Converts a MIDI note number to a frequency.",
      examples: [
        "note(60) |> out($)"
      ],
      category: "utilities"
    },
    degree: {
      name: "degree",
      parameters: [
        { name: "degree", type: "number", description: "Degree of the scale", min: 0, step: 1 }
      ],
      returnType: "number",
      description: "Converts a degree of the scale to a frequency.",
      examples: [
        "degree(1) |> out($)"
      ],
      category: "utilities"
    },
    getScale: {
      name: "getScale",
      parameters: [],
      returnType: "array",
      description: "Returns the current scale as an array of semitone intervals from the root. Use with scale directive (e.g., scale='dorian').",
      examples: [
        "scale='pentatonic'\n#scale // [0, 3, 5, 7, 10]",
        "scale='dorian'\n#scale // [0, 2, 3, 5, 7, 9, 10]"
      ],
      category: "utilities"
    },
    label: {
      name: "label",
      parameters: [
        { name: "bar", type: "number", description: "Bar position of the label", min: 0, step: 0.25 },
        { name: "text", type: "string", description: "Label text" },
        { name: "color", type: "string", optional: true, defaultValue: "#ff0", description: "Color of the label" }
      ],
      returnType: "number",
      description: "Creates a label in the timeline (0-based).",
      examples: [
        "label(0, 'intro')",
        "label(64, 'groove', '#f00')"
      ],
      category: "sequencing"
    },
    lp: {
      name: "lp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be low-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      category: "filters",
      returnType: "number",
      description: "Low-pass filter that attenuates high frequencies.",
      examples: [
        "saw(hz) |> lp($, cutoff:500, q:0.75) |> out($)"
      ]
    },
    hp: {
      name: "hp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be high-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      category: "filters",
      returnType: "number",
      description: "High-pass filter that attenuates low frequencies.",
      examples: [
        "saw(hz) |> hp($, cutoff:200, q:0.75) |> out($)"
      ]
    },
    bp: {
      name: "bp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be band-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      category: "filters",
      returnType: "number",
      description: "Band-pass filter that attenuates frequencies outside a specific range.",
      examples: [
        "saw(a3) |> bp($, cutoff:1000, q:2) |> out($)"
      ]
    },
    bs: {
      name: "bs",
      parameters: [
        { name: "in", type: "number", description: "Signal to be band-stopped" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      category: "filters",
      returnType: "number",
      description: "Band-stop filter that attenuates frequencies within a specific range.",
      examples: [
        "saw(a3) |> $-bs($, cutoff:1000, q:1) |> out($)"
      ]
    },
    ls: {
      name: "ls",
      parameters: [
        { name: "in", type: "number", description: "Signal to be low-shelved" },
        {
          name: "cutoff",
          type: "number",
          description: "Corner frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "gain", type: "number", description: "Gain in decibels", min: -60, max: 60, step: 0.1 }
      ],
      category: "filters",
      returnType: "number",
      description: "Low-shelf filter that boosts or cuts low frequencies.",
      examples: [
        "saw(hz) |> ls($, cutoff:200, gain:6) |> out($)"
      ]
    },
    hs: {
      name: "hs",
      parameters: [
        { name: "in", type: "number", description: "Signal to be high-shelved" },
        {
          name: "cutoff",
          type: "number",
          description: "Corner frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "gain", type: "number", description: "Gain in decibels", min: -60, max: 60, step: 0.1 }
      ],
      category: "filters",
      returnType: "number",
      description: "High-shelf filter that boosts or cuts high frequencies.",
      examples: [
        "saw(hz) |> hs($, cutoff:3000, gain:-3) |> out($)"
      ]
    },
    peak: {
      name: "peak",
      parameters: [
        { name: "in", type: "number", description: "Signal to be peaked" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" },
        { name: "gain", type: "number", description: "Gain in decibels", min: -60, max: 60, step: 0.1 }
      ],
      category: "filters",
      returnType: "number",
      description: "Peaking filter that boosts or cuts frequencies around a center point.",
      examples: [
        "saw(hz) |> peak($, cutoff:1000, q:5, gain:6) |> out($)"
      ]
    },
    ap: {
      name: "ap",
      parameters: [
        { name: "in", type: "number", description: "Signal to be all-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      category: "filters",
      returnType: "number",
      description: "All-pass filter that changes phase without affecting frequency response.",
      examples: [
        "saw(220)*ad(.01,.2,trig:every(1/8)) |> ap($, cutoff:1000, q:1) |> limiter($) |> out($)"
      ]
    },
    slp: {
      name: "slp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be low-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "Low-pass filter with resonance.",
      examples: [
        "saw(hz) |> slp($, cutoff:500) |> out($)"
      ],
      category: "filters"
    },
    shp: {
      name: "shp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be high-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "High-pass filter with resonance.",
      examples: [
        "saw(hz) |> shp($, cutoff:200) |> out($)"
      ],
      category: "filters"
    },
    sbp: {
      name: "sbp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be band-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "Band-pass filter with resonance.",
      examples: [
        "saw(hz) |> sbp($, cutoff:1000, q:2) |> out($)"
      ],
      category: "filters"
    },
    sbs: {
      name: "sbs",
      parameters: [
        { name: "in", type: "number", description: "Signal to be band-stopped" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "Band-stop filter with resonance.",
      examples: [
        "saw(hz) |> sbs($, cutoff:1000, q:5) |> out($)"
      ],
      category: "filters"
    },
    speak: {
      name: "speak",
      parameters: [
        { name: "in", type: "number", description: "Signal to be peaked" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "Peaking filter with resonance.",
      examples: [
        "saw(hz) |> speak($, cutoff:1000, q:5) |> out($)"
      ],
      category: "filters"
    },
    sap: {
      name: "sap",
      parameters: [
        { name: "in", type: "number", description: "Signal to be all-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Center frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Q factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "All-pass filter with resonance for phase shifting.",
      examples: [
        "saw(hz) |> sap($, cutoff:1000, q:1) |> out($)"
      ],
      category: "filters"
    },
    sah: {
      name: "sah",
      parameters: [
        { name: "in", type: "number", description: "Input signal to sample" },
        { name: "trig", type: "number", description: "Trigger signal - samples when > 0 and rising" }
      ],
      returnType: "number",
      description: "Sample and hold - latches the input signal value when the trigger signal rises above 0.",
      examples: [
        "sine(440) |> sah($, every(1/4)) |> out($)",
        "noise() |> sah($, at(1/16)) |> out($)"
      ],
      category: "utilities"
    },
    diodeladder: {
      name: "diodeladder",
      parameters: [
        { name: "in", type: "number", description: "Signal to be filtered" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Resonance amount (0-1)", min: 0, max: 1, step: 0.01 },
        { name: "k", type: "number", description: "Special coefficient (0-1)", min: 0, max: 1, step: 0.01 },
        { name: "saturation", type: "number", description: "Input saturation amount", min: 0, step: 0.1 }
      ],
      returnType: "number",
      description: "Low-pass filter with diode-style saturation and resonance.",
      examples: [
        `scale='aeolian'
tb303=(hz,cutoff,q,k,sat,trig)->{
  s=ramp(hz)
  s=diodeladder(s,cutoff,q,k,sat)
  s |> tanh($*6)*.5 |> dc($)
}
trig=every(1/16) tb303([#1*o2,#1*o2,#7*o2,#5*o3].glide(1/8,10),cutoff:100+(300+2k*fractal(6)**3)*ad(.01,3,30,trig),q:.91,k:.002,sat:1.15,trig) |> out($*.5)
bd()+hh()+sd() |> out($)`
      ],
      category: "filters"
    },
    olp: {
      name: "olp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be low-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "Simple low-pass filter.",
      examples: [
        "saw(hz) |> olp($, cutoff:1000) |> out($)"
      ],
      category: "filters"
    },
    ohp: {
      name: "ohp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be high-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "Simple high-pass filter.",
      examples: [
        "saw(hz) |> ohp($, cutoff:1000) |> out($)"
      ],
      category: "filters"
    },
    mlp: {
      name: "mlp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be low-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Resonance factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "Low-pass filter with Moog-style resonance.",
      examples: [
        "saw(hz) |> mlp($, cutoff:1000) |> out($)"
      ],
      category: "filters"
    },
    mhp: {
      name: "mhp",
      parameters: [
        { name: "in", type: "number", description: "Signal to be high-passed" },
        {
          name: "cutoff",
          type: "number",
          description: "Cutoff frequency in hertz",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        { name: "q", type: "number", description: "Resonance factor", min: 0.1, max: 20, step: 0.1, slope: "log2" }
      ],
      returnType: "number",
      description: "High-pass filter with Moog-style resonance.",
      examples: [
        "saw(hz) |> mhp($, cutoff:200) |> out($)"
      ],
      category: "filters"
    },
    lfosine: {
      name: "lfosine",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Beat-locked period in whole-note units (e.g. 1/16)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Beat offset in whole-note units",
          step: 1e-4
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Beat-locked sine LFO in 0..1 synced to the global sample clock.",
      examples: [
        `supersaw(#1*o2) |> slp($,100+15k*lfosine(1/2)**4) |> out($)`
      ],
      category: "generators"
    },
    lfotri: {
      name: "lfotri",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Beat-locked period in whole-note units (e.g. 1/16)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Beat offset in whole-note units",
          step: 1e-4
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Beat-locked triangle LFO in 0..1 synced to the global sample clock.",
      examples: [
        `supersaw(#1*o2) |> slp($,100+15k*lfotri(1/2)**4) |> out($)`
      ],
      category: "generators"
    },
    lfosaw: {
      name: "lfosaw",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Beat-locked period in whole-note units (e.g. 1/16)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Beat offset in whole-note units",
          step: 1e-4
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Beat-locked saw LFO in 0..1 synced to the global sample clock.",
      examples: [
        `supersaw(#1*o2) |> slp($,100+15k*lfosaw(1/2)**4) |> out($)`
      ],
      category: "generators"
    },
    lforamp: {
      name: "lforamp",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Beat-locked period in whole-note units (e.g. 1/16)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Beat offset in whole-note units",
          step: 1e-4
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Beat-locked ramp LFO in 0..1 synced to the global sample clock.",
      examples: [
        `supersaw(#1*o2) |> slp($,100+15k*lforamp(1/2)**4) |> out($)`
      ],
      category: "generators"
    },
    lfosqr: {
      name: "lfosqr",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Beat-locked period in whole-note units (e.g. 1/16)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Beat offset in whole-note units",
          step: 1e-4
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the LFO phase to the offset position when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Beat-locked square LFO in 0..1 synced to the global sample clock.",
      examples: [
        `supersaw(#1*o2) |> slp($,100+15k*lfosqr(1/2)**4) |> out($)`
      ],
      category: "generators"
    },
    lfosah: {
      name: "lfosah",
      parameters: [
        {
          name: "bar",
          type: "number",
          description: "Hold interval in whole-note units (e.g. 1/16)",
          min: 1e-4,
          step: 1e-4
        },
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Deterministic seed used for the held random values",
          min: 0,
          step: 1
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Beat offset in whole-note units",
          step: 1e-4
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the cycle alignment to the offset position when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Beat-locked sample-and-hold LFO in 0..1, deterministic per (seed, cycle).",
      examples: [
        `supersaw(#1*o2) |> slp($,100+15k*lfosah(1/2)**4) |> out($)`
      ],
      category: "generators"
    },
    white: {
      name: "white",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (deterministically initializes the noise stream when it changes, default: 1234)",
          min: 0,
          step: 1
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Deterministic uncorrelated noise stream in -1..1 (stateful, advances every sample).",
      examples: [
        "white() |> out($)",
        "white(1234, trig) |> out($)"
      ],
      category: "generators"
    },
    gauss: {
      name: "gauss",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (deterministically initializes the noise stream when it changes, default: 1234)",
          min: 0,
          step: 1
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Deterministic normal-like noise stream in -1..1 (stateful, advances every sample).",
      examples: [
        "gauss() |> out($)",
        "gauss(1234, trig) |> out($)"
      ],
      category: "generators"
    },
    pink: {
      name: "pink",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (deterministically initializes the noise stream when it changes, default: 1234)",
          min: 0,
          step: 1
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Deterministic pink-ish noise stream in -1..1 (stateful, advances every sample).",
      examples: [
        "pink() |> out($)",
        "pink(1234, trig) |> out($)"
      ],
      category: "generators"
    },
    brown: {
      name: "brown",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (deterministically initializes the noise stream when it changes, default: 1234)",
          min: 0,
          step: 1
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Deterministic brown-ish noise stream in -1..1 (stateful random walk with soft leak).",
      examples: [
        "brown() |> out($)"
      ],
      category: "generators"
    },
    random: {
      name: "random",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (resets the random sequence when it changes, default: 1234)",
          min: 0,
          step: 1
        }
      ],
      returnType: "number",
      description: "True random noise stream in 0..1 (stateful, advances every sample, no wavetable).",
      examples: [
        "random() |> out($)",
        "random(5678) * 2 - 1 |> out($)"
      ],
      category: "generators"
    },
    smooth: {
      name: "smooth",
      parameters: [
        {
          name: "rate",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Change rate in Hz (higher values produce faster variation)",
          min: 0,
          max: 100,
          step: 0.1,
          slope: "log2"
        },
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (deterministically initializes the noise stream when it changes, default: 1234)",
          min: 0,
          step: 1
        },
        {
          name: "curve",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Interpolation curve (0..1): 0=linear, 1=quintic smoothstep",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Continuous smooth noise stream in 0..1 (stateful, band-limited-ish).",
      examples: [
        `saw(#i.walk(1/16)*o2) |> slp($,100+15k*smooth()**4)*.75
|> out($)`
      ],
      category: "generators"
    },
    fractal: {
      name: "fractal",
      parameters: [
        {
          name: "rate",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Base change rate in Hz for the first octave",
          min: 0,
          max: 100,
          step: 0.1,
          slope: "log2"
        },
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 1234,
          description: "Initial seed (deterministically initializes the noise stream when it changes, default: 1234)",
          min: 0,
          step: 1
        },
        {
          name: "octaves",
          type: "number",
          optional: true,
          defaultValue: 4,
          description: "Number of octaves to sum (higher = more detail)",
          min: 1,
          max: 16,
          step: 1
        },
        {
          name: "gain",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Amplitude multiplier per octave (0..1)",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Trigger that resets the seed to the current seed value when it crosses from ≤0 to >0"
        }
      ],
      returnType: "number",
      description: "Multi-octave smooth variation (fBm-style) stream in 0..1 (stateful).",
      examples: [
        `saw(#i.walk(1/16)*o2) |> slp($,100+15k*fractal()**4)*.75
|> out($)`
      ],
      category: "generators"
    },
    sin: {
      name: "sin",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Sine function.",
      examples: ["sin(t * 440 * 2 * 3.14159) |> out($)"],
      category: "math"
    },
    cos: {
      name: "cos",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Cosine function.",
      examples: ["cos(t * 440 * 2 * 3.14159) |> out($)"],
      category: "math"
    },
    tan: {
      name: "tan",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Tangent function.",
      examples: ["tan(x) |> out($)"],
      category: "math"
    },
    tram: {
      name: "tram",
      parameters: [
        {
          name: "sequence",
          type: "string",
          description: 'Rhythm sequence string using "x" for hits and "-" for pauses. Square brackets [x x] subdivide a single beat. Whitespace is ignored for readability.'
        },
        {
          name: "bar",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Bar duration to fit the sequence into",
          min: 1e-4,
          step: 1e-4
        }
      ],
      returnType: "number",
      description: "Rhythm impulse generator with microtiming support. Brackets subdivide beats for complex polyrhythms.",
      examples: [
        `bd(trig:tram('x-x- x-[x-x]-'))+rimshot(trig:tram('--x- --xx',1/2)) |> out($)`
      ],
      category: "sequencing"
    },
    asin: {
      name: "asin",
      parameters: [{ name: "x", type: "number", description: "Input value (-1..1)", min: -1, max: 1, step: 0.01 }],
      returnType: "number",
      description: "Arcsine function.",
      examples: ["asin(sine(440)) |> out($)"],
      category: "math"
    },
    acos: {
      name: "acos",
      parameters: [{ name: "x", type: "number", description: "Input value (-1..1)", min: -1, max: 1, step: 0.01 }],
      returnType: "number",
      description: "Arccosine function.",
      examples: ["sine(110) |> acos($) |> out($)"],
      category: "math"
    },
    tanh: {
      name: "tanh",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Hyperbolic tangent function; useful for soft clipping.",
      examples: ["sine(220) * 5 |> tanh($) |> out($)"],
      category: "math"
    },
    atan: {
      name: "atan",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Arctangent function.",
      examples: ["karplus([c4,a4,f4,e4].step(every(1/4)),trig:every(1/8)) |> atan($) |> out($)"],
      category: "math"
    },
    abs: {
      name: "abs",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Absolute value.",
      examples: ["sine(110) |> abs($) |> out($)"],
      category: "math"
    },
    sqrt: {
      name: "sqrt",
      parameters: [{ name: "x", type: "number", description: "Input value", min: 0, step: 0.01 }],
      returnType: "number",
      description: "Square root.",
      examples: ["sqrt(x) |> out($)"],
      category: "math"
    },
    square: {
      name: "square",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Square function (x²).",
      examples: ["square(sine(220)) |> out($)"],
      category: "math"
    },
    cube: {
      name: "cube",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Cube function (x³).",
      examples: ["cube(sine(220)) |> out($)"],
      category: "math"
    },
    hypot: {
      name: "hypot",
      parameters: [
        { name: "x", type: "number", description: "First value" },
        { name: "y", type: "number", description: "Second value" }
      ],
      returnType: "number",
      description: "Euclidean distance sqrt(x² + y²).",
      examples: ["hypot(3, 4) |> out($)"],
      category: "math"
    },
    log: {
      name: "log",
      parameters: [{ name: "x", type: "number", description: "Input value", min: 1e-4, step: 0.01 }],
      returnType: "number",
      description: "Natural logarithm.",
      examples: ["log(x) |> out($)"],
      category: "math"
    },
    exp: {
      name: "exp",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Exponential function (e^x).",
      examples: ["exp(x) |> out($)"],
      category: "math"
    },
    log10: {
      name: "log10",
      parameters: [{ name: "x", type: "number", description: "Input value", min: 1e-4, step: 0.01 }],
      returnType: "number",
      description: "Base-10 logarithm.",
      examples: ["log10(x) |> out($)"],
      category: "math"
    },
    log2: {
      name: "log2",
      parameters: [{ name: "x", type: "number", description: "Input value", min: 1e-4, step: 0.01 }],
      returnType: "number",
      description: "Base-2 logarithm.",
      examples: ["log2(x) |> out($)"],
      category: "math"
    },
    exp2: {
      name: "exp2",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Base-2 exponential function (2^x).",
      examples: ["exp2(x) |> out($)"],
      category: "math"
    },
    min: {
      name: "min",
      parameters: [
        { name: "x", type: "number", description: "First value" },
        { name: "y", type: "number", description: "Second value" }
      ],
      returnType: "number",
      description: "Minimum of two values.",
      examples: ["min(sine(220), 0.5) |> out($)"],
      category: "math"
    },
    max: {
      name: "max",
      parameters: [
        { name: "x", type: "number", description: "First value" },
        { name: "y", type: "number", description: "Second value" }
      ],
      returnType: "number",
      description: "Maximum of two values.",
      examples: ["max(sine(220), 0.5) |> out($)"],
      category: "math"
    },
    clamp: {
      name: "clamp",
      parameters: [
        { name: "x", type: "number", description: "Value to clamp" },
        { name: "lo", type: "number", description: "Lower bound" },
        { name: "hi", type: "number", description: "Upper bound" }
      ],
      returnType: "number",
      description: "Clamps value between lo and hi.",
      examples: ["sine(220) * 2 |> clamp($, -0.5, 0.5) |> out($)"],
      category: "math"
    },
    wrap: {
      name: "wrap",
      parameters: [
        { name: "x", type: "number", description: "Value to wrap" },
        { name: "lo", type: "number", description: "Lower bound" },
        { name: "hi", type: "number", description: "Upper bound" }
      ],
      returnType: "number",
      description: "Wraps value into range [lo, hi) with sawtooth pattern.",
      examples: ["t * 10 |> wrap($, 0, 1) |> out($)"],
      category: "math"
    },
    mod: {
      name: "mod",
      parameters: [
        { name: "x", type: "number", description: "Dividend" },
        { name: "y", type: "number", description: "Divisor", min: 1e-4, step: 0.01 }
      ],
      returnType: "number",
      description: "Modulo operation: x - y * floor(x / y).",
      examples: ["mod(t * 10, 1) |> out($)"],
      category: "math"
    },
    pingpong: {
      name: "pingpong",
      parameters: [
        { name: "x", type: "number", description: "Value to wrap" },
        { name: "lo", type: "number", description: "Lower bound" },
        { name: "hi", type: "number", description: "Upper bound" }
      ],
      returnType: "number",
      description: "Wraps value back and forth between lo and hi, producing a triangle-wave pattern.",
      examples: ["t * 10 |> pingpong($, 0, 1) |> out($)"],
      category: "math"
    },
    fold: {
      name: "fold",
      parameters: [
        { name: "x", type: "number", description: "Value to fold" },
        { name: "lo", type: "number", description: "Lower bound" },
        { name: "hi", type: "number", description: "Upper bound" }
      ],
      returnType: "number",
      description: "Folds value at boundaries.",
      examples: ["sine(220) * 3 |> fold($, -0.5, 0.5) |> out($)"],
      category: "math"
    },
    floor: {
      name: "floor",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Rounds down to nearest integer.",
      examples: ["floor(sine([c4,a4,f4,e4].step(every(1/8))) * 2)*ad(.01,.2,trig:every(1/8)) |> tanh($) |> out($)"],
      category: "math"
    },
    ceil: {
      name: "ceil",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Rounds up to nearest integer.",
      examples: ["ceil(sine([c4,a4,f4,e4].step(every(1/8))) * 2)*ad(.01,.2,trig:every(1/8)) |> tanh($) |> out($)"],
      category: "math"
    },
    round: {
      name: "round",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Rounds to nearest integer.",
      examples: ["floor(sine([c4,a4,f4,e4].step(every(1/8))) * 2)*ad(.01,.2,trig:every(1/8)) |> tanh($) |> out($)"],
      category: "math"
    },
    trunc: {
      name: "trunc",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Truncates to integer (rounds toward zero).",
      examples: ["trunc(sine([c4,a4,f4,e4].step(every(1/8))) * 2)*ad(.01,.2,trig:every(1/8)) |> tanh($) |> out($)"],
      category: "math"
    },
    snap: {
      name: "snap",
      parameters: [
        { name: "x", type: "number", description: "Value to snap" },
        { name: "step", type: "number", description: "Step size", min: 1e-4, step: 0.01 }
      ],
      returnType: "number",
      description: "Snaps value to nearest multiple of step: round(x / step) * step.",
      examples: ["sine(220) |> snap($, 0.25) |> out($)"],
      category: "math"
    },
    fract: {
      name: "fract",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Fractional part (x - floor(x)).",
      examples: ["fract(t * 10) |> out($)"],
      category: "math"
    },
    sign: {
      name: "sign",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Sign function: -1 for negative, 0 for zero, 1 for positive.",
      examples: ["sign(sine(220)) |> out($)"],
      category: "math"
    },
    lerp: {
      name: "lerp",
      parameters: [
        { name: "a", type: "number", description: "Start value" },
        { name: "b", type: "number", description: "End value" },
        { name: "t", type: "number", description: "Interpolation factor (0..1)", min: 0, max: 1, step: 0.01 }
      ],
      returnType: "number",
      description: "Linear interpolation: a + (b - a) * t.",
      examples: ["lerp(0, 1, sine(1)) |> out($)"],
      category: "math"
    },
    smoothstep: {
      name: "smoothstep",
      parameters: [
        { name: "x", type: "number", description: "Input value" },
        { name: "edge0", type: "number", description: "Lower edge" },
        { name: "edge1", type: "number", description: "Upper edge" }
      ],
      returnType: "number",
      description: "Smooth Hermite interpolation between 0 and 1 when x is between edge0 and edge1.",
      examples: ["smoothstep(sine(1), -0.5, 0.5) |> out($)"],
      category: "math"
    },
    smootherstep: {
      name: "smootherstep",
      parameters: [
        { name: "x", type: "number", description: "Input value" },
        { name: "edge0", type: "number", description: "Lower edge" },
        { name: "edge1", type: "number", description: "Upper edge" }
      ],
      returnType: "number",
      description: "Even smoother interpolation (6t⁵ - 15t⁴ + 10t³) between 0 and 1.",
      examples: ["smootherstep(sine(1), -0.5, 0.5) |> out($)"],
      category: "math"
    },
    step: {
      name: "step",
      parameters: [
        { name: "x", type: "number", description: "Input value" },
        { name: "edge", type: "number", description: "Edge threshold" }
      ],
      returnType: "number",
      description: "Step function: 0 if x < edge, 1 otherwise.",
      examples: ["step(sine(220), 0) |> out($)"],
      category: "math"
    },
    heaviside: {
      name: "heaviside",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Heaviside step function: 0 for x < 0, 0.5 for x = 0, 1 for x > 0.",
      examples: ["heaviside(sine(220)) |> out($)"],
      category: "math"
    },
    select: {
      name: "select",
      parameters: [
        { name: "a", type: "number", description: "Value when condition is false" },
        { name: "b", type: "number", description: "Value when condition is true" },
        { name: "cond", type: "number", description: "Condition (0 = false, non-zero = true)" }
      ],
      returnType: "number",
      description: "Selects between two values based on condition.",
      examples: ["select(0, 1, sine(220) > 0) |> out($)"],
      category: "math"
    },
    isnan: {
      name: "isnan",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Returns 1 if x is NaN, 0 otherwise.",
      examples: ["isnan(x) |> out($)"],
      category: "math"
    },
    isinf: {
      name: "isinf",
      parameters: [{ name: "x", type: "number", description: "Input value" }],
      returnType: "number",
      description: "Returns 1 if x is infinite, 0 otherwise.",
      examples: ["isinf(x) |> out($)"],
      category: "math"
    },
    safediv: {
      name: "safediv",
      parameters: [
        { name: "x", type: "number", description: "Numerator" },
        { name: "y", type: "number", description: "Denominator" }
      ],
      returnType: "number",
      description: "Safe division: returns 0 when y is 0, otherwise x / y.",
      examples: ["safediv(sine(220), sine(110)) |> out($)"],
      category: "math"
    },
    db: {
      name: "db",
      parameters: [{ name: "x", type: "number", description: "Gain in decibels", min: -120, max: 120, step: 0.1 }],
      returnType: "number",
      description: "Converts gain in decibels to linear gain.",
      examples: [
        "signal * db(6) |> out($)",
        "signal * db(-3) |> out($)"
      ],
      category: "utilities"
    },
    semis: {
      name: "semis",
      parameters: [{ name: "x", type: "number", description: "Number of semitones", min: -48, max: 48, step: 0.1 }],
      returnType: "number",
      description: "Converts semitones to frequency multiplier.",
      examples: [
        "note(60) * semis(7) |> sine(hz:$) |> out($)"
      ],
      category: "utilities"
    },
    swing: {
      name: "swing",
      parameters: [
        { name: "t", type: "number", description: "Time value to swing" },
        {
          name: "amount",
          type: "number",
          description: "Swing amount (-1..1), where 0 = no swing, positive compresses first half and expands second half, negative does the opposite",
          min: -1,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Applies rhythmic swing to time values by warping the phase within each beat cycle.",
      examples: [
        "sine(440, swing(t, 0.1)) |> out($)",
        "phasor(swing(t, 0.1) * 440) |> out($)"
      ],
      category: "utilities"
    },
    stereo: {
      name: "stereo",
      parameters: [
        { name: "in", type: "number", description: "Mono input signal" },
        {
          name: "width",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Stereo width in seconds",
          min: 0,
          max: 0.1,
          step: 1e-4,
          slope: "log2"
        }
      ],
      returnType: "[L:number, R:number]",
      description: "Converts mono signal to stereo, optionally with delay-based widening.",
      examples: [
        "sine(440) |> stereo($) |> out($)",
        "saw(220) |> stereo($, width:0.01) |> out($)"
      ],
      category: "mixing"
    },
    mono: {
      name: "mono",
      parameters: [{ name: "in", type: "[L:number, R:number]", description: "Stereo input signal" }],
      returnType: "number",
      description: "Converts stereo signal to mono by averaging channels.",
      examples: [
        "[saw(220), saw(221)] |> mono($) |> out($)"
      ],
      category: "mixing"
    },
    stereowidth: {
      name: "stereowidth",
      parameters: [
        { name: "in", type: "[L:number, R:number]", description: "Stereo input signal" },
        {
          name: "width",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Width multiplier",
          min: 0,
          max: 2,
          step: 0.01
        }
      ],
      returnType: "[L:number, R:number]",
      description: "Adjusts stereo width using mid-side processing.",
      examples: [
        "[saw(220), saw(221)] |> stereowidth($, width:2) |> out($)",
        "stereo(saw(220)) |> stereowidth($, width:0.5) |> out($)"
      ],
      category: "mixing"
    },
    widen: {
      name: "widen",
      parameters: [
        { name: "in", type: "[L:number, R:number]", description: "Stereo input signal" },
        {
          name: "seconds",
          type: "number",
          optional: true,
          defaultValue: 1e-4,
          description: "Delay time in seconds",
          min: 0,
          max: 0.1,
          step: 1e-4,
          slope: "log2"
        }
      ],
      returnType: "[L:number, R:number]",
      description: "Widens stereo signal by delaying high frequencies in right channel.",
      examples: [
        "[saw(220), saw(221)] |> widen($, seconds:0.005) |> out($)"
      ],
      category: "mixing"
    },
    pan: {
      name: "pan",
      parameters: [
        { name: "in", type: "[L:number, R:number]", description: "Stereo input signal" },
        {
          name: "balance",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Pan position (0=left, 1=right)",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "[L:number, R:number]",
      description: "Pans stereo signal left or right.",
      examples: [
        "[saw(220), saw(221)] |> pan($, balance:0.2) |> out($)"
      ],
      category: "mixing"
    },
    modDelay: {
      name: "modDelay",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "baseDelay",
          type: "number",
          description: "Base delay time in seconds",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        { name: "depth", type: "number", description: "Modulation depth", min: 0, max: 0.1, step: 1e-4, slope: "log2" },
        { name: "rate", type: "number", description: "LFO rate in Hz", min: 0, max: 20, step: 0.1, slope: "log2" },
        { name: "feedback", type: "number", description: "Feedback amount", min: 0, max: 1, step: 0.01 },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Modulated delay effect with LFO-controlled delay time.",
      examples: [
        "sine(440) |> modDelay($, 0.1, 0.05, 1, 0.3) |> out($)"
      ],
      category: "effects"
    },
    flanger: {
      name: "flanger",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "rate",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "LFO rate in Hz",
          min: 0,
          max: 20,
          step: 0.1,
          slope: "log2"
        },
        {
          name: "depth",
          type: "number",
          optional: true,
          defaultValue: 125e-5,
          description: "Modulation depth",
          min: 0,
          max: 0.01,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "base",
          type: "number",
          optional: true,
          defaultValue: 125e-5,
          description: "Base delay time",
          min: 0,
          max: 0.01,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "feedback",
          type: "number",
          optional: true,
          defaultValue: 0.7,
          description: "Feedback amount",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Classic flanger effect using modulated comb filtering.",
      examples: [
        "saw(220) |> flanger($, rate:0.5, depth:0.005) |> out($)"
      ],
      category: "effects"
    },
    chorus: {
      name: "chorus",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "voices",
          type: "number",
          optional: true,
          defaultValue: 3,
          description: "Number of chorus voices",
          min: 1,
          max: 16,
          step: 1
        },
        {
          name: "base",
          type: "number",
          optional: true,
          defaultValue: 0.02,
          description: "Base delay time",
          min: 0,
          max: 0.1,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "depth",
          type: "number",
          optional: true,
          defaultValue: 6e-3,
          description: "Modulation depth",
          min: 0,
          max: 0.02,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "rate",
          type: "number",
          optional: true,
          defaultValue: 0.25,
          description: "LFO rate",
          min: 0,
          max: 20,
          step: 0.1,
          slope: "log2"
        },
        {
          name: "spread",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Voice spread",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Multi-voice chorus effect with spread and modulation.",
      examples: [
        "sine(440) |> chorus($, voices:5, rate:0.3) |> out($)"
      ],
      category: "effects"
    },
    tap: {
      name: "tap",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "seconds",
          type: "number",
          description: "Delay time in seconds",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        { name: "cb", type: "function", description: "Callback function for feedback processing" }
      ],
      returnType: "number",
      description: "Simple delay tap with callback processing.",
      examples: [
        "sine(440) |> tap($, 0.25, x -> x * 0.5) |> out($)"
      ],
      category: "effects"
    },
    comb: {
      name: "comb",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "seconds",
          type: "number",
          description: "Delay time in seconds",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        { name: "feedback", type: "number", description: "Feedback amount", min: 0, max: 1, step: 0.01 },
        { name: "cb", type: "function", description: "Callback function for feedback processing" }
      ],
      returnType: "number",
      description: "Comb filter combining feedforward and feedback delay.",
      examples: [
        "saw(110) |> comb($, 0.1, 0.8, x -> lp(x, 1000)) |> out($)"
      ],
      category: "effects"
    },
    eq3: {
      name: "eq3",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "low",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Low frequency gain in dB",
          min: -60,
          max: 60,
          step: 0.1
        },
        {
          name: "mid",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Mid frequency gain in dB",
          min: -60,
          max: 60,
          step: 0.1
        },
        {
          name: "high",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "High frequency gain in dB",
          min: -60,
          max: 60,
          step: 0.1
        },
        {
          name: "lf",
          type: "number",
          optional: true,
          defaultValue: 500,
          description: "Low frequency cutoff",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "mf",
          type: "number",
          optional: true,
          defaultValue: 2e3,
          description: "Mid frequency cutoff",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "hf",
          type: "number",
          optional: true,
          defaultValue: 8e3,
          description: "High frequency cutoff",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "3-band equalizer with adjustable low, mid, and high frequency gains.",
      examples: [
        "saw(220) |> eq3($, low:6, mid:-3, high:2) |> out($)"
      ],
      category: "filters"
    },
    grain: {
      name: "grain",
      parameters: [
        {
          name: "speed",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Playback speed",
          min: 0.1,
          max: 10,
          step: 0.1,
          slope: "log2"
        },
        { name: "seed", type: "number", description: "Random seed", min: 0, step: 1 }
      ],
      returnType: "number",
      description: "Granular synthesis-inspired trigger generator based on speed.",
      examples: [
        "rimshot(trig:grain(speed:.2)) |> out($)"
      ],
      category: "generators"
    },
    vocoder: {
      name: "vocoder",
      parameters: [
        { name: "carrier", type: "number", description: "Carrier signal" },
        { name: "modulator", type: "number", description: "Modulator signal" },
        {
          name: "numBands",
          type: "number",
          optional: true,
          defaultValue: 16,
          description: "Number of frequency bands",
          min: 4,
          max: 64,
          step: 1
        },
        {
          name: "attack",
          type: "number",
          optional: true,
          defaultValue: 0.01,
          description: "Envelope attack time",
          min: 0,
          max: 1,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "release",
          type: "number",
          optional: true,
          defaultValue: 0.04,
          description: "Envelope release time",
          min: 0,
          max: 1,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "freqMin",
          type: "number",
          optional: true,
          defaultValue: 100,
          description: "Minimum frequency",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        },
        {
          name: "freqMax",
          type: "number",
          optional: true,
          defaultValue: 8e3,
          description: "Maximum frequency",
          min: 0,
          max: 2e4,
          step: 1,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "Vocoder effect using bandpass filters and envelope following.",
      examples: [
        "vocoder(carrier:saw(220), modulator:sine(110)) |> out($)"
      ],
      category: "effects"
    },
    karplus: {
      name: "karplus",
      parameters: [
        { name: "hz", type: "number", description: "Fundamental frequency", min: 0, max: 2e4, step: 1, slope: "log2" },
        { name: "pluck", type: "function", optional: true, defaultValue: "pink", description: "Pluck function" },
        { name: "seed", type: "number", optional: true, defaultValue: 334, description: "Random seed", min: 0, step: 1 },
        {
          name: "attack",
          type: "number",
          optional: true,
          defaultValue: 1e-4,
          description: "Attack time",
          min: 0,
          max: 1,
          step: 1e-4,
          slope: "log2"
        },
        {
          name: "decay",
          type: "number",
          optional: true,
          defaultValue: 0.1,
          description: "Decay time",
          min: 0,
          max: 10,
          step: 1e-3,
          slope: "log2"
        },
        {
          name: "exponent",
          type: "number",
          optional: true,
          defaultValue: 40,
          description: "Envelope exponent",
          min: 1,
          max: 100,
          step: 1
        },
        {
          name: "damping",
          type: "number",
          optional: true,
          defaultValue: 0.5,
          description: "Damping amount",
          min: 0,
          max: 1,
          step: 0.01
        },
        { name: "trig", type: "number", description: "Trigger signal" }
      ],
      returnType: "number",
      description: "Karplus-Strong plucked string synthesis algorithm.",
      examples: [
        `trig=grain(.2) karplus(#scale.random(trig)*[o3,o4].random(trig),pink,trig) |> out($)`
      ],
      category: "generators"
    },
    metronome: {
      name: "metronome",
      parameters: [],
      returnType: "number",
      description: "Generates a metronome sound with major/minor chord progression.",
      examples: [
        "metronome() |> out($)"
      ],
      category: "utilities"
    },
    harmonics: {
      name: "harmonics",
      parameters: [
        { name: "hz", type: "number", description: "Fundamental frequency", min: 0, max: 2e4, step: 1, slope: "log2" },
        {
          name: "numHarmonics",
          type: "number",
          optional: true,
          defaultValue: 3,
          description: "Number of harmonics",
          min: 1,
          max: 32,
          step: 1
        },
        {
          name: "tilt",
          type: "number",
          optional: true,
          defaultValue: 3,
          description: "Spectral tilt",
          min: 0.1,
          max: 10,
          step: 0.1
        },
        {
          name: "offset",
          type: "number",
          optional: true,
          defaultValue: 0,
          description: "Phase offset",
          min: 0,
          step: 1e-3
        },
        { name: "trig", type: "number", description: "Trigger signal" }
      ],
      returnType: "number",
      description: "Additive synthesis with harmonic series and tilt control.",
      examples: [
        `harmonics(#scale.random(grain(.2))*o2,numHarmonics:16,tilt:.5)*.8 |> out($)`
      ],
      category: "generators"
    },
    folded: {
      name: "folded",
      parameters: [
        { name: "hz", type: "number", description: "Fundamental frequency", min: 0, max: 2e4, step: 1, slope: "log2" },
        {
          name: "numHarmonics",
          type: "number",
          optional: true,
          defaultValue: 2,
          description: "Number of harmonics",
          min: 1,
          max: 32,
          step: 1
        },
        {
          name: "amount",
          type: "number",
          optional: true,
          defaultValue: 2,
          description: "Folding amount",
          min: 0.1,
          max: 10,
          step: 0.1
        }
      ],
      returnType: "number",
      description: "Wave folding synthesis with harmonic enhancement.",
      examples: [
        `scale='zhi' trig=euclid(5,8) folded(#scale.random(trig)*o2, numHarmonics:5, amount:3)*ad(.01,.2,3,trig) |> out($)`
      ],
      category: "generators"
    },
    pulsar: {
      name: "pulsar",
      parameters: [
        { name: "hz", type: "number", description: "Frequency", min: 0, max: 2e4, step: 1, slope: "log2" },
        {
          name: "density",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Pulse density",
          min: 0.1,
          max: 10,
          step: 0.1
        }
      ],
      returnType: "number",
      description: "Pulsar synthesis with phasor-controlled envelope.",
      examples: [
        "pulsar(110, density:2) |> out($)"
      ],
      category: "generators"
    },
    supersaw: {
      name: "supersaw",
      parameters: [
        { name: "hz", type: "number", description: "Fundamental frequency", min: 0, max: 2e4, step: 1, slope: "log2" },
        {
          name: "voices",
          type: "number",
          optional: true,
          defaultValue: 5,
          description: "Number of detuned voices",
          min: 1,
          max: 32,
          step: 1
        },
        {
          name: "spread",
          type: "number",
          optional: true,
          defaultValue: 0.05,
          description: "Detuning spread",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Supersaw oscillator with multiple detuned sawtooth voices.",
      examples: [
        "supersaw(110, voices:7, spread:0.1) |> out($)"
      ],
      category: "generators"
    },
    drawbar: {
      name: "drawbar",
      parameters: [
        { name: "hz", type: "number", description: "Fundamental frequency", min: 0, max: 2e4, step: 1, slope: "log2" },
        { name: "bars", type: "array", description: "Drawbar settings array" }
      ],
      returnType: "number",
      description: "Hammond organ-style drawbar oscillator.",
      examples: [
        `scale='zhi' trig=euclid(3,8,0,1/2) drawbar(#scale.random(trig)*o4,bars:[.8,.3,.8,.7,.4])*ad(.01,.2,3,trig) |> out($)`
      ],
      category: "generators"
    },
    drum: {
      name: "drum",
      parameters: [
        { name: "noise", type: "function", optional: true, defaultValue: "white", description: "Noise function" },
        { name: "seed", type: "number", optional: true, defaultValue: 42, description: "Random seed" },
        { name: "freqs", type: "array", description: "Filter frequencies" },
        { name: "trig", type: "number", description: "Trigger signal" }
      ],
      returnType: "number",
      description: "Drum synthesis using filtered noise excitation.",
      examples: [
        `trig=euclid(3,8) drum(trig)*ad(.001,.4,4,trig) |> out($)`
      ],
      category: "generators"
    },
    bd: {
      name: "bd",
      parameters: [
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger pattern for kick hits (default: tram('x-x-x-x-'))"
        },
        { name: "base", type: "number", optional: true, description: "Base frequency (default: #1*o2)" },
        { name: "punch", type: "number", optional: true, description: "Punch frequency for FM (default: 25000k)" },
        { name: "offset", type: "number", optional: true, defaultValue: 6e-4, description: "Phase offset" },
        { name: "cutoff", type: "number", optional: true, description: "Filter cutoff frequency (default: 5k)" },
        { name: "q", type: "number", optional: true, defaultValue: 0.25, description: "Filter Q factor" },
        {
          name: "amp",
          type: "function",
          optional: true,
          description: "Amplitude envelope function (default: trig->ad(.0001,.5,40,trig))"
        },
        {
          name: "fm",
          type: "function",
          optional: true,
          description: "FM envelope function (default: trig->ad(.00008,.013,900,trig))"
        },
        {
          name: "filter",
          type: "function",
          optional: true,
          description: "Filter envelope function (default: trig->ad(.000147,.25,50.000,trig))"
        }
      ],
      returnType: "number",
      description: "Kick drum synthesizer with FM synthesis and dynamic filtering.",
      examples: [
        "bd() |> out($)",
        "bd(trig:euclid(3,8)) |> out($)"
      ],
      category: "generators"
    },
    hh: {
      name: "hh",
      parameters: [
        {
          name: "width",
          type: "number",
          optional: true,
          defaultValue: 0.4,
          description: "Pulse width for PWM oscillators",
          min: 0,
          max: 1,
          step: 0.01
        },
        {
          name: "seq",
          type: "sequence",
          optional: true,
          description: "Sequence pattern for hi-hat hits (default: mini('[.15 .2 1 .2]*4'))"
        }
      ],
      returnType: "number",
      description: "Hi-hat synthesizer using multiple PWM oscillators with filtering and saturation.",
      examples: [
        "hh() |> out($)",
        `hh(width:0.01,seq:mini('[.3 .4 .8 .9]*4')) |> out($)`
      ],
      category: "generators"
    },
    sd: {
      name: "sd",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 7,
          description: "Random seed for noise generation"
        },
        { name: "base", type: "number", optional: true, description: "Base frequency (default: #5*o2)" },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger pattern for snare hits (default: tram('-x',1/2))"
        }
      ],
      returnType: "number",
      description: "Snare drum synthesizer combining pitched sine waves with filtered noise.",
      examples: [
        "sd() |> out($)",
        "sd(seed:42, trig:euclid(2,8)) |> out($)"
      ],
      category: "generators"
    },
    cowbell: {
      name: "cowbell",
      parameters: [
        { name: "osc", type: "function", optional: true, description: "Oscillator function (default: hz->pwm(hz,.04))" },
        { name: "tone", type: "number", optional: true, description: "Tone frequency (default: #2*o5*1.002)" },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger pattern for cowbell hits (default: euclid(3,8,1,bar:1/2))"
        }
      ],
      returnType: "number",
      description: "Cowbell synthesizer using two inharmonic PWM oscillators.",
      examples: [
        "cowbell() |> out($)",
        "cowbell(trig:euclid(5,8)) |> out($)"
      ],
      category: "generators"
    },
    tom: {
      name: "tom",
      parameters: [
        {
          name: "seq",
          type: "sequence",
          optional: true,
          description: "Sequence pattern for tom hits (default: mini('[~ ~ 1 ~  ~ ~ ~ 3]*2'))"
        }
      ],
      returnType: "number",
      description: "Tom drum synthesizer with pitch envelope and dual oscillators.",
      examples: [
        "tom() |> out($)",
        `tom(seq:mini('[1 3] [2 4]*1.5')) |> out($)`
      ],
      category: "generators"
    },
    claves: {
      name: "claves",
      parameters: [
        { name: "base", type: "number", optional: true, description: "Base frequency (default: #2*o7)" },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger pattern for claves hits (default: tram('--x---xx',1/2))"
        }
      ],
      returnType: "number",
      description: "Claves synthesizer combining sine waves with filtered noise.",
      examples: [
        "claves() |> out($)",
        "claves(trig:euclid(3,8)) |> out($)"
      ],
      category: "generators"
    },
    clap: {
      name: "clap",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 552,
          description: "Random seed for noise generation"
        },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger pattern for clap hits (default: tram('-----x-x',1))"
        }
      ],
      returnType: "number",
      description: "Clap synthesizer using multiple overlapping noise envelopes.",
      examples: [
        "clap() |> out($)",
        "clap(seed:123, trig:euclid(3,8)) |> out($)"
      ],
      category: "generators"
    },
    rimshot: {
      name: "rimshot",
      parameters: [
        {
          name: "seed",
          type: "number",
          optional: true,
          defaultValue: 12349,
          description: "Random seed for noise generation"
        },
        { name: "base", type: "number", optional: true, description: "Base frequency (default: #6*o5)" },
        {
          name: "trig",
          type: "number",
          optional: true,
          description: "Trigger pattern for rimshot hits (default: tram('--x-xx',1/2))"
        }
      ],
      returnType: "number",
      description: "Rimshot synthesizer combining stick click, wooden body, and low thunk components.",
      examples: [
        "rimshot() |> out($)",
        "rimshot(seed:42, trig:euclid(3,8)) |> out($)"
      ],
      category: "generators"
    },
    vowel: {
      name: "vowel",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "vowelName",
          type: "number",
          description: "Vowel index (0=a, 1=e, 2=i, 3=o, 4=u)",
          min: 0,
          max: 4,
          step: 1
        }
      ],
      returnType: "number",
      description: "Formant filter for vowel sounds.",
      examples: [
        "sine(110) |> vowel($, va) |> out($)"
      ],
      category: "filters"
    },
    ring: {
      name: "ring",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        { name: "hz", type: "number", description: "Modulation frequency", min: 0, max: 2e4, step: 1, slope: "log2" }
      ],
      returnType: "number",
      description: "Ring modulation effect.",
      examples: [
        "saw(220) |> ring($, 330) |> out($)"
      ],
      category: "effects"
    },
    tube: {
      name: "tube",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "drive",
          type: "number",
          optional: true,
          defaultValue: 3,
          description: "Drive amount",
          min: 0,
          max: 20,
          step: 0.1
        },
        {
          name: "bias",
          type: "number",
          optional: true,
          defaultValue: 0.2,
          description: "Bias offset",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Tube saturation/distortion using hyperbolic tangent.",
      examples: [
        "saw(220) |> tube($, drive:5, bias:0.1) |> out($)"
      ],
      category: "effects"
    },
    clip: {
      name: "clip",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "x",
          type: "number",
          optional: true,
          defaultValue: 1,
          description: "Clipping threshold",
          min: 1e-4,
          max: 10,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Hard clipping distortion.",
      examples: [
        "saw(220) * 2 |> clip($, 0.5) |> out($)"
      ],
      category: "effects"
    },
    bitcrush: {
      name: "bitcrush",
      parameters: [
        { name: "in", type: "number", description: "Input signal" },
        {
          name: "rate",
          type: "number",
          optional: true,
          defaultValue: 8e3,
          description: "Sample rate",
          min: 100,
          max: 48e3,
          step: 100,
          slope: "log2"
        }
      ],
      returnType: "number",
      description: "Bit crushing effect using sample and hold.",
      examples: [
        "saw(a3) |> bitcrush($, rate:404  (50 5k 3)) |> out($)"
      ],
      category: "effects"
    },
    mix: {
      name: "mix",
      parameters: [{ name: "signal", type: "number", description: "Input signal" }],
      returnType: "number",
      description: "Mix operator that passes through signal unchanged.",
      examples: [
        "signal |> mix($)"
      ],
      category: "mixing"
    },
    uni: {
      name: "uni",
      parameters: [{ name: "x", type: "number", description: "Input signal" }],
      returnType: "number",
      description: "Convert bipolar signal to unipolar ([-1,1] to [0,1]).",
      examples: [
        "sine(440) |> uni($) |> out($)"
      ],
      category: "utilities"
    },
    bi: {
      name: "bi",
      parameters: [{ name: "x", type: "number", description: "Input signal" }],
      returnType: "number",
      description: "Convert unipolar signal to bipolar ([0,1] to [-1,1]).",
      examples: [
        "phasor(220) |> bi($)*ad(.01,.2,trig:every(1/8)) |> out($)"
      ],
      category: "utilities"
    },
    crossfade: {
      name: "crossfade",
      parameters: [
        { name: "a", type: "number", description: "First signal" },
        { name: "b", type: "number", description: "Second signal" },
        {
          name: "t",
          type: "number",
          description: "Crossfade position (0 = all A, 1 = all B)",
          min: 0,
          max: 1,
          step: 0.01
        }
      ],
      returnType: "number",
      description: "Crossfade between two signals.",
      examples: [
        "crossfade(sine(220), saw(220), lfosine(1)) |> out($)"
      ],
      category: "mixing"
    },
    "va,ve,vi,vo,vu": {
      name: "va,ve,vi,vo,vu",
      parameters: [],
      returnType: "number",
      description: 'Vowel constants for "a", "e", "i", "o", "u" sounds (used with vowel function).',
      examples: [
        "sine(110) |> vowel($, va) |> out($)"
      ],
      type: "variable",
      category: "variables"
    },
    "#i,#ii,#iii,#iv,#v,#vi,#vii": {
      name: "#i,#ii,#iii,#iv,#v,#vi,#vii",
      parameters: [],
      returnType: "number",
      description: 'Scale constants for "i", "ii", "iii", "iv", "v", "vi", "vii" chords.',
      examples: [
        "#iv.map(x->saw(x*o4)).avg() |> out($)"
      ],
      type: "variable",
      category: "variables"
    },
    "#1,#2,#3,#4,#5,#6,#7": {
      name: "#1,#2,#3,#4,#5,#6,#7",
      parameters: [],
      returnType: "number",
      description: 'Scale constants for "1", "2", "3", "4", "5", "6", "7" degrees.',
      examples: [
        "[#1,#3,#5].map(x->saw(x*o4)).avg() |> out($)"
      ],
      type: "variable",
      category: "variables"
    },
    "c,d,e,f,g,a,b": {
      name: "c,d,e,f,g,a,b",
      parameters: [],
      returnType: "number",
      description: "",
      examples: [
        "drawbar([c4,a#4,f4,e4].walk(1/4))*ad(.0005,.5,trig:every(1/4)) |> out($)"
      ],
      type: "variable",
      category: "variables"
    }
  };
  const builtinSigNames = Object.fromEntries(
    Object.entries(functionDefinitions).map(([name, sig]) => [name, sig.parameters.map((p) => p.name)])
  );
  const builtinSigIndex = Object.fromEntries(
    Object.entries(builtinSigNames).map(([name, names]) => {
      const idx = /* @__PURE__ */ new Map();
      for (let i = 0; i < names.length; i++) idx.set(names[i], i);
      return [name, idx];
    })
  );
  function extractCallbackArity(typeStr) {
    const match = typeStr.match(/^\s*\(([^)]*)\)\s*->/);
    if (!match) return null;
    const params = match[1].trim();
    if (!params) return 0;
    return params.split(",").filter((p) => p.trim()).length;
  }
  function isCallbackParameter(typeStr) {
    return typeStr.includes("->") || typeStr.includes("function");
  }
  const builtinCallbackParams = (() => {
    const result = {};
    for (const [name, sig] of Object.entries(functionDefinitions)) {
      const callbacks = [];
      for (let i = 0; i < sig.parameters.length; i++) {
        const param = sig.parameters[i];
        if (isCallbackParameter(param.type ?? "")) {
          const arity = extractCallbackArity(param.type ?? "") ?? 1;
          callbacks.push({ index: i, arity });
        }
      }
      if (callbacks.length > 0) {
        result[name] = callbacks;
      }
    }
    return result;
  })();
  function resolveParamName$1(raw, paramNames) {
    const exact = paramNames.find((p) => p === raw);
    if (exact) return { ok: true, name: exact };
    const lower = raw.toLowerCase();
    const ci = paramNames.find((p) => p.toLowerCase() === lower);
    if (ci) return { ok: true, name: ci };
    const prefix = paramNames.filter((p) => p.startsWith(raw));
    if (prefix.length === 1) return { ok: true, name: prefix[0] };
    if (prefix.length === 0) {
      return {
        ok: false,
        message: `Unknown parameter '${raw}'. Valid parameters are: ${paramNames.join(", ")}`
      };
    }
    return {
      ok: false,
      message: `Ambiguous parameter '${raw}'. It matches: ${prefix.join(", ")}`
    };
  }
  const K_UNDEF = 0;
  const K_NULL = 1;
  const K_TRUE = 2;
  const K_FALSE = 3;
  const K_ZERO = 4;
  const K_ONE = 5;
  const K_NEG_ONE = 6;
  const BASE_CONSTS = [void 0, null, true, false, 0, 1, -1];
  const INS_BRANCH = { op: "BRANCH" };
  const INS_ENTER_SCOPE = { op: "ENTER_SCOPE" };
  const INS_EXIT_SCOPE = { op: "EXIT_SCOPE" };
  const INS_POP = { op: "POP" };
  const INS_DUP = { op: "DUP" };
  const INS_DUP2 = { op: "DUP2" };
  const INS_LEN = { op: "LEN" };
  const INS_GET_INDEX = { op: "GET_INDEX" };
  const INS_GET_INDEX2 = { op: "GET_INDEX2" };
  const INS_SET_INDEX = { op: "SET_INDEX" };
  const INS_TRY_BEGIN = { op: "TRY_BEGIN" };
  const INS_FINALLY_BEGIN = { op: "FINALLY_BEGIN" };
  const INS_TRY_END = { op: "TRY_END" };
  const INS_THROW = { op: "THROW" };
  const INS_RETURN = { op: "RETURN" };
  const INS_PUSH_UNDEF = { op: "PUSH_CONST", k: K_UNDEF };
  const INS_PUSH_NULL = { op: "PUSH_CONST", k: K_NULL };
  const INS_PUSH_TRUE = { op: "PUSH_CONST", k: K_TRUE };
  const INS_PUSH_FALSE = { op: "PUSH_CONST", k: K_FALSE };
  const INS_PUSH_ZERO = { op: "PUSH_CONST", k: K_ZERO };
  const INS_PUSH_ONE = { op: "PUSH_CONST", k: K_ONE };
  const INS_PUSH_NEG_ONE = { op: "PUSH_CONST", k: K_NEG_ONE };
  function compile(src, program) {
    const c = new Compiler(src);
    c.compileProgram(program);
    return { chunk: c.chunk, errors: c.errors };
  }
  class Compiler {
    constructor(src) {
      this.src = src;
    }
    chunk = { consts: [...BASE_CONSTS], funcs: [], code: [], arrayLiterals: [], branchMarks: [] };
    errors = [];
    strConstIndex = /* @__PURE__ */ Object.create(null);
    numConstIndex = /* @__PURE__ */ new Map();
    pushConstCache = [];
    loadCache = [];
    storeCache = [];
    pipe = [];
    labelId = 0;
    callTempId = 0;
    forTempId = 0;
    destructureTempId = 0;
    sigScopes = [/* @__PURE__ */ new Map()];
    sigScopePool = [];
    k(v) {
      if (v === void 0) return K_UNDEF;
      if (v === null) return K_NULL;
      if (v === true) return K_TRUE;
      if (v === false) return K_FALSE;
      if (typeof v === "number") {
        if (v === 0) return K_ZERO;
        if (v === 1) return K_ONE;
        if (v === -1) return K_NEG_ONE;
        const hit2 = this.numConstIndex.get(v);
        if (hit2 !== void 0) return hit2;
        const i2 = this.chunk.consts.length;
        this.chunk.consts.push(v);
        this.numConstIndex.set(v, i2);
        return i2;
      }
      const hit = this.strConstIndex[v];
      if (hit !== void 0) return hit;
      const i = this.chunk.consts.length;
      this.chunk.consts.push(v);
      this.strConstIndex[v] = i;
      return i;
    }
    nameConst(name) {
      return this.k(name);
    }
    emit(ins) {
      this.chunk.code.push(ins);
      return this.chunk.code.length - 1;
    }
    emitPushConst(k) {
      if (k === K_UNDEF) return void this.emit(INS_PUSH_UNDEF);
      if (k === K_NULL) return void this.emit(INS_PUSH_NULL);
      if (k === K_TRUE) return void this.emit(INS_PUSH_TRUE);
      if (k === K_FALSE) return void this.emit(INS_PUSH_FALSE);
      if (k === K_ZERO) return void this.emit(INS_PUSH_ZERO);
      if (k === K_ONE) return void this.emit(INS_PUSH_ONE);
      if (k === K_NEG_ONE) return void this.emit(INS_PUSH_NEG_ONE);
      const hit = this.pushConstCache[k];
      if (hit) return void this.emit(hit);
      const ins = { op: "PUSH_CONST", k };
      this.pushConstCache[k] = ins;
      this.emit(ins);
    }
    emitUndef() {
      this.emit(INS_PUSH_UNDEF);
    }
    emitLoad(name) {
      const hit = this.loadCache[name];
      if (hit) return void this.emit(hit);
      const ins = { op: "LOAD", name };
      this.loadCache[name] = ins;
      this.emit(ins);
    }
    emitStore(name) {
      const hit = this.storeCache[name];
      if (hit) return void this.emit(hit);
      const ins = { op: "STORE", name };
      this.storeCache[name] = ins;
      this.emit(ins);
    }
    emitLoadName(name) {
      this.emitLoad(this.nameConst(name));
    }
    enterSigScope() {
      this.sigScopes.push(this.sigScopePool.pop() ?? /* @__PURE__ */ new Map());
    }
    exitSigScope() {
      if (this.sigScopes.length <= 1) return;
      const scope = this.sigScopes.pop();
      scope.clear();
      this.sigScopePool.push(scope);
    }
    findSigInfo(name) {
      for (let i = this.sigScopes.length - 1; i >= 0; i--) {
        const hit = this.sigScopes[i].get(name);
        if (hit) return hit;
      }
      const builtin = builtinSigNames[name];
      const idxOf = builtinSigIndex[name];
      if (builtin && idxOf) return { names: builtin, idxOf };
      return null;
    }
    setSigInfo(name, info) {
      for (let i = this.sigScopes.length - 1; i >= 0; i--) {
        const scope = this.sigScopes[i];
        if (scope.has(name)) {
          if (info) scope.set(name, info);
          else scope.delete(name);
          return;
        }
      }
      if (info) this.sigScopes[this.sigScopes.length - 1].set(name, info);
    }
    patch(at, to) {
      const ins = this.chunk.code[at];
      if (!ins) return;
      if (ins.op === "JUMP" || ins.op === "JUMP_IF_FALSE") ins.to = to;
    }
    locFrom(a, b) {
      const len = Math.max(1, b.column + b.length - a.column);
      return { line: a.line, column: a.column, length: len };
    }
    emitBranchMark(loc) {
      const ins = this.emit(INS_BRANCH);
      this.chunk.branchMarks.push({ ins, loc: { line: loc.line, column: loc.column, length: Math.max(1, loc.length) } });
    }
    err(loc, message) {
      this.errors.push({
        message,
        line: loc.line,
        column: loc.column,
        length: Math.max(1, loc.length),
        code: ""
        // Will be filled in by mapError in encodeLangToVmOps
      });
    }
    // Auto-wrap an identifier into a lambda that passes arguments through
    // e.g., for map callback with arity 3, `note` becomes `(x, i, arr) -> note(x)`
    // The lambda accepts `arity` parameters but only passes the first one (or however many the target function needs)
    wrapIdentifierAsCallback(identName, arity, loc) {
      const params = [];
      const paramNames = ["x", "i", "arr", "a", "b", "c", "d", "e", "f", "g"];
      for (let i = 0; i < arity; i++) {
        const paramName = paramNames[i] ?? `p${i}`;
        params.push({ name: paramName, isRest: false });
      }
      const args = arity > 0 ? [{
        kind: "pos",
        value: { kind: "ident", name: paramNames[0], loc },
        loc
      }] : [];
      return {
        kind: "func",
        params: params.map((p) => ({ name: p.name, loc, isRest: p.isRest })),
        body: {
          kind: "call",
          callee: { kind: "ident", name: identName, loc },
          args,
          loc
        },
        loc
      };
    }
    compileProgram(program) {
      for (let i = 0; i < program.body.length; i++) {
        this.compileStmt(program.body[i], i === program.body.length - 1);
      }
    }
    compileStmt(stmt, isLast) {
      if (stmt.kind === "block") {
        this.compileBlockStmt(stmt, isLast);
        return;
      }
      if (stmt.kind === "expr_stmt") {
        this.compileExpr(stmt.expr);
        if (!isLast) this.emit(INS_POP);
        return;
      }
      if (stmt.kind === "destructure") {
        const id = this.destructureTempId++;
        const temp = `%destr${id}`;
        const tempName = this.nameConst(temp);
        this.compileExpr(stmt.value);
        this.emitStore(tempName);
        this.emit(INS_POP);
        if (stmt.pattern.kind === "arr") {
          for (let i = 0; i < stmt.pattern.items.length; i++) {
            const name = stmt.pattern.items[i];
            this.emitLoad(tempName);
            this.emitPushConst(this.k(i));
            this.emit(INS_GET_INDEX);
            this.emitStore(this.nameConst(name));
            this.emit(INS_POP);
          }
        } else {
          for (const key of stmt.pattern.keys) {
            this.emitLoad(tempName);
            this.emit({ op: "GET_PROP", key: this.k(key) });
            this.emitStore(this.nameConst(key));
            this.emit(INS_POP);
          }
        }
        return;
      }
      if (stmt.kind === "label") {
        this.compileStmt(stmt.stmt, isLast);
        return;
      }
      if (stmt.kind === "return") {
        if (stmt.value) this.compileExpr(stmt.value);
        else this.emit(INS_PUSH_UNDEF);
        this.emit(INS_RETURN);
        return;
      }
      if (stmt.kind === "throw") {
        this.compileExpr(stmt.value);
        this.emit(INS_THROW);
        return;
      }
      if (stmt.kind === "break") {
        const label = stmt.label ? this.nameConst(stmt.label) : void 0;
        this.emit({ op: "BREAK", label });
        return;
      }
      if (stmt.kind === "continue") {
        const label = stmt.label ? this.nameConst(stmt.label) : void 0;
        this.emit({ op: "CONTINUE", label });
        return;
      }
      if (stmt.kind === "while") {
        const start = this.emit({ op: "LABEL", id: this.labelId++ });
        this.compileExpr(stmt.test);
        const j = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
        this.compileStmt(stmt.body, false);
        this.emit({ op: "JUMP", to: start });
        this.patch(j, this.chunk.code.length);
        return;
      }
      if (stmt.kind === "do_while") {
        const start = this.emit({ op: "LABEL", id: this.labelId++ });
        this.compileStmt(stmt.body, false);
        this.compileExpr(stmt.test);
        const j = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
        this.emit({ op: "JUMP", to: start });
        this.patch(j, this.chunk.code.length);
        return;
      }
      if (stmt.kind === "for") {
        this.compileForStmt(stmt);
        return;
      }
      if (stmt.kind === "switch") {
        this.compileSwitchStmt(stmt);
        return;
      }
      if (stmt.kind === "try") {
        this.compileTryStmt(stmt);
        return;
      }
    }
    compileBlockStmt(block, isLast) {
      this.emit(INS_ENTER_SCOPE);
      this.enterSigScope();
      for (let i = 0; i < block.body.length; i++) {
        this.compileStmt(block.body[i], isLast && i === block.body.length - 1);
      }
      this.exitSigScope();
      this.emit(INS_EXIT_SCOPE);
    }
    compileForStmt(stmt) {
      this.emit(INS_ENTER_SCOPE);
      this.enterSigScope();
      if (stmt.head.kind === "c_style") {
        if (stmt.head.init) {
          this.compileExpr(stmt.head.init);
          this.emit(INS_POP);
        }
        const start2 = this.emit({ op: "LABEL", id: this.labelId++ });
        if (stmt.head.test) {
          this.compileExpr(stmt.head.test);
          const j = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
          this.compileStmt(stmt.body, false);
          if (stmt.head.update) {
            this.compileExpr(stmt.head.update);
            this.emit(INS_POP);
          }
          this.emit({ op: "JUMP", to: start2 });
          this.patch(j, this.chunk.code.length);
        } else {
          this.compileStmt(stmt.body, false);
          if (stmt.head.update) {
            this.compileExpr(stmt.head.update);
            this.emit(INS_POP);
          }
          this.emit({ op: "JUMP", to: start2 });
        }
        this.exitSigScope();
        this.emit(INS_EXIT_SCOPE);
        return;
      }
      const id = this.forTempId++;
      const iterTemp = `$for#${id}#iter`;
      const indexTemp = `$for#${id}#i`;
      const lenTemp = `$for#${id}#len`;
      const iterName = this.nameConst(iterTemp);
      const indexName = this.nameConst(indexTemp);
      const lenName = this.nameConst(lenTemp);
      this.compileExpr(stmt.head.iterable);
      this.emitStore(iterName);
      this.emit(INS_POP);
      this.emitLoad(iterName);
      this.emit(INS_LEN);
      this.emitStore(lenName);
      this.emit(INS_POP);
      if (stmt.head.length) {
        this.emitLoad(lenName);
        this.emitStore(this.nameConst(stmt.head.length));
        this.emit(INS_POP);
      }
      this.emit(INS_PUSH_ZERO);
      this.emitStore(indexName);
      this.emit(INS_POP);
      const start = this.emit({ op: "LABEL", id: this.labelId++ });
      this.emitLoad(indexName);
      this.emitLoad(lenName);
      this.emit({ op: "BINARY", opName: "<" });
      const jEnd = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
      if (stmt.head.index) {
        this.emitLoad(indexName);
        this.emitStore(this.nameConst(stmt.head.index));
        this.emit(INS_POP);
      }
      this.emitLoad(iterName);
      this.emitLoad(indexName);
      this.emit(INS_GET_INDEX);
      this.emitStore(this.nameConst(stmt.head.value));
      this.emit(INS_POP);
      this.compileStmt(stmt.body, false);
      this.emitLoad(indexName);
      this.emit(INS_PUSH_ONE);
      this.emit({ op: "BINARY", opName: "+" });
      this.emitStore(indexName);
      this.emit(INS_POP);
      this.emit({ op: "JUMP", to: start });
      this.patch(jEnd, this.chunk.code.length);
      this.emit(INS_EXIT_SCOPE);
      this.exitSigScope();
    }
    compileSwitchStmt(stmt) {
      this.compileExpr(stmt.test);
      this.emit(INS_POP);
      for (const c of stmt.cases) {
        if (c.test) {
          this.compileExpr(c.test);
          this.emit(INS_POP);
        }
        for (let i = 0; i < c.body.length; i++) {
          this.compileStmt(c.body[i], false);
        }
      }
    }
    compileTryStmt(stmt) {
      this.emit(INS_TRY_BEGIN);
      this.compileBlockStmt(stmt.body, false);
      if (stmt.catchBody) {
        const name = stmt.catchName ? this.nameConst(stmt.catchName) : void 0;
        this.emit({ op: "CATCH_BEGIN", name });
        this.compileBlockStmt(stmt.catchBody, false);
      }
      if (stmt.finallyBody) {
        this.emit(INS_FINALLY_BEGIN);
        this.compileBlockStmt(stmt.finallyBody, false);
      }
      this.emit(INS_TRY_END);
    }
    compileExpr(expr) {
      switch (expr.kind) {
        case "number":
          this.emit({ op: "PUSH_CONST", k: this.k(expr.value), loc: expr.loc });
          return;
        case "string":
          this.emitPushConst(this.k(expr.value));
          return;
        case "bool":
          this.emit(expr.value ? INS_PUSH_TRUE : INS_PUSH_FALSE);
          return;
        case "null":
          this.emit(INS_PUSH_NULL);
          return;
        case "undefined":
          this.emit(INS_PUSH_UNDEF);
          return;
        case "ident":
          this.emitLoad(this.nameConst(expr.name));
          return;
        case "pipe_value": {
          const name = this.pipe[this.pipe.length - 1];
          if (!name) {
            this.err(expr.loc, "Pipe value '$' is only valid on the right side of a pipe");
            this.emit(INS_PUSH_UNDEF);
            return;
          }
          this.emitLoad(this.nameConst(name));
          return;
        }
        case "array":
          for (const it of expr.items) this.compileExpr(it);
          {
            const ins = this.emit({ op: "ARRAY", n: expr.items.length });
            const items = new Array(expr.items.length);
            for (let i = 0; i < expr.items.length; i++) items[i] = expr.items[i].loc;
            this.chunk.arrayLiterals.push({ ins, loc: expr.loc, items });
          }
          return;
        case "object":
          for (const p of expr.props) {
            this.emitPushConst(this.k(p.key));
            this.compileExpr(p.value);
          }
          this.emit({ op: "OBJECT", n: expr.props.length });
          return;
        case "member":
          this.compileMember(expr);
          return;
        case "call":
          this.compileCall(expr);
          return;
        case "unary":
          if (expr.op === "++" || expr.op === "--") {
            const delta = expr.op === "++" ? 1 : -1;
            if (expr.expr.kind === "ident") {
              const name = this.nameConst(expr.expr.name);
              this.emitLoad(name);
              this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE);
              this.emit({ op: "BINARY", opName: "+" });
              this.emitStore(name);
              return;
            }
            if (expr.expr.kind === "member") {
              this.compileExpr(expr.expr.object);
              if (expr.expr.computed === true) {
                this.compileExpr(expr.expr.index);
                this.emit(INS_DUP2);
                this.emit(INS_GET_INDEX);
                this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE);
                this.emit({ op: "BINARY", opName: "+" });
                this.emit(INS_SET_INDEX);
              } else {
                this.emit(INS_DUP);
                this.emit({ op: "GET_PROP", key: this.k(expr.expr.prop) });
                this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE);
                this.emit({ op: "BINARY", opName: "+" });
                this.emit({ op: "SET_PROP", key: this.k(expr.expr.prop) });
              }
              return;
            }
            this.err(expr.loc, "Invalid increment/decrement target");
            this.emit(INS_PUSH_UNDEF);
            return;
          }
          this.compileExpr(expr.expr);
          this.emit({ op: "UNARY", opName: expr.op });
          return;
        case "postfix":
          if (expr.op === "++" || expr.op === "--") {
            const delta = expr.op === "++" ? 1 : -1;
            if (expr.expr.kind === "ident") {
              const name = this.nameConst(expr.expr.name);
              this.emitLoad(name);
              this.emit(INS_DUP);
              this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE);
              this.emit({ op: "BINARY", opName: "+" });
              this.emitStore(name);
              this.emit(INS_POP);
              return;
            }
            if (expr.expr.kind === "member") {
              this.compileExpr(expr.expr.object);
              if (expr.expr.computed === true) {
                this.compileExpr(expr.expr.index);
                this.emit(INS_DUP2);
                this.emit(INS_GET_INDEX);
                this.emit(INS_DUP);
                this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE);
                this.emit({ op: "BINARY", opName: "+" });
                this.emit(INS_SET_INDEX);
                this.emit(INS_POP);
              } else {
                this.emit(INS_DUP);
                this.emit({ op: "GET_PROP", key: this.k(expr.expr.prop) });
                this.emit(INS_DUP);
                this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE);
                this.emit({ op: "BINARY", opName: "+" });
                this.emit({ op: "SET_PROP", key: this.k(expr.expr.prop) });
                this.emit(INS_POP);
              }
              return;
            }
            this.err(expr.loc, "Invalid increment/decrement target");
            this.emit(INS_PUSH_UNDEF);
            return;
          }
          this.compileExpr(expr.expr);
          this.emit({ op: "UNARY", opName: `${expr.op}_post` });
          return;
        case "binary":
          this.compileBinary(expr);
          return;
        case "assign":
          this.compileAssign(expr);
          return;
        case "if":
          this.compileIf(expr);
          return;
        case "func":
          this.compileFunc(expr);
          return;
      }
    }
    compileMember(expr) {
      if (expr.computed === true) {
        if (expr.object.kind === "member" && expr.object.computed === true) {
          this.compileExpr(expr.object.object);
          this.compileExpr(expr.object.index);
          this.compileExpr(expr.index);
          this.emit(INS_GET_INDEX2);
          return;
        }
        this.compileExpr(expr.object);
        this.compileExpr(expr.index);
        this.emit(INS_GET_INDEX);
        return;
      }
      if (expr.prop === "length") {
        this.compileExpr(expr.object);
        this.emit(INS_LEN);
        return;
      }
      this.compileExpr(expr.object);
      this.emit({ op: "GET_PROP", key: this.k(expr.prop) });
    }
    compileCall(expr) {
      const calleeName = expr.callee.kind === "ident" ? expr.callee.name : null;
      if (calleeName === "play" && expr.args.length >= 2) {
        const a0 = expr.args[0];
        const a1 = expr.args[1];
        if (a0.kind === "pos" && a1.kind === "pos" && a0.value.kind === "member" && a0.value.computed === true) {
          const m = a0.value;
          if (m.object.kind === "member" && m.object.computed === true) ;
          else {
            this.emitLoadName("playPick");
            this.compileExpr(m.object);
            this.compileExpr(m.index);
            this.compileExpr(a1.value);
            this.emit({ op: "CALL", pos: 3, named: 0 });
            return;
          }
        }
      }
      if (expr.callee.kind === "member" && expr.callee.computed === false && expr.callee.prop === "map") {
        const recvTemp = `%recv${this.callTempId++}`;
        this.compileExpr(expr.callee.object);
        this.emitStore(this.nameConst(recvTemp));
        this.emit(INS_POP);
        this.emitLoadName("map");
        const temps2 = [];
        const tmp2 = () => `%arg${this.callTempId++}`;
        const callbackInfo2 = builtinCallbackParams[".map"];
        for (let argIdx = 0; argIdx < expr.args.length; argIdx++) {
          const a = expr.args[argIdx];
          const t = tmp2();
          const isCallbackArg = callbackInfo2?.some((cb) => cb.index === argIdx);
          if (a.kind === "pos") {
            let valueToCompile = a.value;
            if (isCallbackArg && a.value.kind === "ident") {
              const cbInfo = callbackInfo2.find((cb) => cb.index === argIdx);
              valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc);
            }
            this.compileExpr(valueToCompile);
            this.emitStore(this.nameConst(t));
            this.emit(INS_POP);
            temps2.push({ kind: "pos", temp: t });
            continue;
          }
          if (a.kind === "named") {
            let valueToCompile = a.value;
            if (isCallbackArg && a.value.kind === "ident") {
              const cbInfo = callbackInfo2.find((cb) => cb.index === argIdx);
              valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc);
            }
            this.compileExpr(valueToCompile);
            this.emitStore(this.nameConst(t));
            this.emit(INS_POP);
            temps2.push({ kind: "named", temp: t, name: a.name });
            continue;
          }
          this.emitLoadName(a.name);
          this.emitStore(this.nameConst(t));
          this.emit(INS_POP);
          temps2.push({ kind: "named", temp: t, name: a.name });
        }
        const namedTemps2 = [];
        let pos2 = 1;
        for (const a of temps2) {
          if (a.kind === "pos") pos2++;
          else namedTemps2.push({ name: a.name, temp: a.temp });
        }
        this.emitLoadName(recvTemp);
        for (const a of temps2) if (a.kind === "pos") this.emitLoadName(a.temp);
        for (let i = namedTemps2.length - 1; i >= 0; i--) {
          const a = namedTemps2[i];
          this.emitPushConst(this.k(a.name));
          this.emitLoadName(a.temp);
        }
        this.emit({ op: "CALL", pos: pos2, named: namedTemps2.length });
        return;
      }
      const compileMemberCallAsBuiltin = (propName, loadName) => {
        if (expr.callee.kind !== "member" || expr.callee.computed !== false) return false;
        if (expr.callee.prop !== propName) return false;
        const recvTemp = `%recv${this.callTempId++}`;
        this.compileExpr(expr.callee.object);
        this.emitStore(this.nameConst(recvTemp));
        this.emit(INS_POP);
        this.emitLoadName(loadName || propName);
        const temps2 = [];
        const tmp2 = () => `%arg${this.callTempId++}`;
        const builtinName = loadName || propName;
        const sigInfo2 = this.findSigInfo(builtinName);
        const sigNames2 = sigInfo2?.names ?? null;
        const idxOf2 = sigInfo2?.idxOf;
        if (sigNames2) {
          for (const a of expr.args) {
            if (a.kind !== "named" && a.kind !== "shorthand") continue;
            if (a.name.startsWith("%")) continue;
            const r = resolveParamName$1(a.name, sigNames2);
            if (r.ok) {
              a.name = r.name;
            } else {
              this.err(a.loc, `${r.message} for function '${builtinName}'`);
            }
          }
        }
        for (const a of expr.args) {
          const t = tmp2();
          if (a.kind === "pos") {
            this.compileExpr(a.value);
            this.emitStore(this.nameConst(t));
            this.emit(INS_POP);
            let identName;
            if (a.value.kind === "ident") identName = a.value.name;
            temps2.push({
              kind: "pos",
              temp: t,
              identName,
              isImplicitNamedCandidate: identName !== void 0
            });
            continue;
          }
          if (a.kind === "named") {
            this.compileExpr(a.value);
            this.emitStore(this.nameConst(t));
            this.emit(INS_POP);
            temps2.push({ kind: "named", temp: t, name: a.name });
            continue;
          }
          this.emitLoadName(a.name);
          this.emitStore(this.nameConst(t));
          this.emit(INS_POP);
          temps2.push({ kind: "named", temp: t, name: a.name });
        }
        if (sigNames2 && idxOf2) {
          const reserved = [];
          const slots = [];
          const extraNamed = [];
          for (const a of temps2) {
            if (a.kind !== "named") continue;
            const idx = idxOf2.get(a.name);
            if (idx !== void 0) reserved[idx] = true;
            else extraNamed.push({ name: a.name, temp: a.temp });
          }
          for (const a of temps2) {
            if (a.kind !== "pos") continue;
            if (!a.isImplicitNamedCandidate || !a.identName) continue;
            const idx = idxOf2.get(a.identName);
            if (idx !== void 0) reserved[idx] = true;
          }
          for (const a of temps2) {
            if (a.kind === "named") {
              const idx = idxOf2.get(a.name);
              if (idx !== void 0) slots[idx] = a.temp;
              continue;
            }
            if (a.isImplicitNamedCandidate && a.identName) {
              const idx = idxOf2.get(a.identName);
              if (idx !== void 0) slots[idx] = a.temp;
            }
          }
          let next = 0;
          while (reserved[next] === true || slots[next] !== void 0) next++;
          if (next < sigNames2.length) {
            slots[next] = recvTemp;
            next++;
          }
          for (const a of temps2) {
            if (a.kind !== "pos") continue;
            if (a.isImplicitNamedCandidate && a.identName && idxOf2.has(a.identName)) continue;
            while (reserved[next] === true || slots[next] !== void 0) next++;
            if (next >= sigNames2.length) break;
            slots[next] = a.temp;
            next++;
          }
          let maxIdx = -1;
          for (let i = 0; i < slots.length; i++) if (slots[i] !== void 0) maxIdx = i;
          const pos3 = maxIdx + 1;
          for (let i = 0; i < pos3; i++) {
            const t = slots[i];
            if (t !== void 0) this.emitLoadName(t);
            else this.emitUndef();
          }
          for (let i = extraNamed.length - 1; i >= 0; i--) {
            const a = extraNamed[i];
            this.emitPushConst(this.k(a.name));
            this.emitLoadName(a.temp);
          }
          this.emit({ op: "CALL", pos: pos3, named: extraNamed.length });
          return true;
        }
        const namedTemps2 = [];
        let pos2 = 1;
        for (const a of temps2) {
          if (a.kind === "pos") pos2++;
          else namedTemps2.push({ name: a.name, temp: a.temp });
        }
        this.emitLoadName(recvTemp);
        for (const a of temps2) if (a.kind === "pos") this.emitLoadName(a.temp);
        for (let i = namedTemps2.length - 1; i >= 0; i--) {
          const a = namedTemps2[i];
          this.emitPushConst(this.k(a.name));
          this.emitLoadName(a.temp);
        }
        this.emit({ op: "CALL", pos: pos2, named: namedTemps2.length });
        return true;
      };
      if (compileMemberCallAsBuiltin("sum")) return;
      if (compileMemberCallAsBuiltin("avg")) return;
      if (compileMemberCallAsBuiltin("glide")) return;
      if (compileMemberCallAsBuiltin("step", "arrayStep")) return;
      if (compileMemberCallAsBuiltin("random", "arrayRandom")) return;
      if (compileMemberCallAsBuiltin("reverse")) return;
      if (compileMemberCallAsBuiltin("shuffle")) return;
      if (compileMemberCallAsBuiltin("delay")) return;
      if (compileMemberCallAsBuiltin("walk", "arrayWalk")) return;
      const temps = [];
      const tmp = () => `%arg${this.callTempId++}`;
      const tapAnalyserIndex = typeof expr.__tapAnalyserIndex === "number" ? expr.__tapAnalyserIndex : null;
      let firstPosTemp = null;
      let posSeen = 0;
      const sigInfo = calleeName ? this.findSigInfo(calleeName) : null;
      const sigNames = sigInfo?.names ?? null;
      const callbackInfo = calleeName ? builtinCallbackParams[calleeName] : null;
      if (sigNames) {
        for (const a of expr.args) {
          if (a.kind !== "named" && a.kind !== "shorthand") continue;
          if (a.name.startsWith("%")) continue;
          const r = resolveParamName$1(a.name, sigNames);
          if (r.ok) {
            a.name = r.name;
          } else {
            this.err(a.loc, `${r.message} for function '${calleeName}'`);
          }
        }
        let userCount = 0;
        for (const a of expr.args) {
          if (a.kind === "named" && a.name.startsWith("%")) continue;
          userCount++;
        }
        if (userCount > sigNames.length) {
          this.err(
            expr.loc,
            `Too many arguments for function '${calleeName}'. Expected at most ${sigNames.length} arguments, got ${userCount}`
          );
        }
      }
      for (let argIdx = 0; argIdx < expr.args.length; argIdx++) {
        const a = expr.args[argIdx];
        const t = tmp();
        const isCallbackArg = callbackInfo?.some((cb) => cb.index === argIdx);
        if (a.kind === "pos") {
          let valueToCompile = a.value;
          if (isCallbackArg && a.value.kind === "ident") {
            const cbInfo = callbackInfo.find((cb) => cb.index === argIdx);
            valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc);
          }
          this.compileExpr(valueToCompile);
          this.emitStore(this.nameConst(t));
          this.emit(INS_POP);
          if (posSeen === 0) firstPosTemp = t;
          posSeen++;
          let identName;
          if (a.value.kind === "ident") identName = a.value.name;
          temps.push({
            kind: "pos",
            temp: t,
            identName,
            isImplicitNamedCandidate: identName !== void 0
          });
          continue;
        }
        if (a.kind === "named") {
          let valueToCompile = a.value;
          if (isCallbackArg && a.value.kind === "ident") {
            const cbInfo = callbackInfo.find((cb) => cb.index === argIdx);
            valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc);
          }
          this.compileExpr(valueToCompile);
          this.emitStore(this.nameConst(t));
          this.emit(INS_POP);
          temps.push({ kind: "named", temp: t, name: a.name });
          continue;
        }
        this.emitLoadName(a.name);
        this.emitStore(this.nameConst(t));
        this.emit(INS_POP);
        temps.push({ kind: "named", temp: t, name: a.name });
      }
      const idxOf = sigInfo?.idxOf;
      if ((calleeName === "out" || calleeName === "solo") && tapAnalyserIndex !== null && firstPosTemp) {
        this.emitLoadName("analyser");
        this.emitLoadName(firstPosTemp);
        this.emitPushConst(this.k(tapAnalyserIndex));
        this.emit({ op: "CALL", pos: 2, named: 0 });
        this.emit(INS_POP);
      }
      this.compileExpr(expr.callee);
      if (sigNames && idxOf) {
        const reserved = [];
        const slots = [];
        const extraNamed = [];
        for (const a of temps) {
          if (a.kind === "named") {
            const idx = idxOf.get(a.name);
            if (idx !== void 0) reserved[idx] = true;
            else extraNamed.push({ name: a.name, temp: a.temp });
            continue;
          }
          if (a.isImplicitNamedCandidate && a.identName) {
            const idx = idxOf.get(a.identName);
            if (idx !== void 0) reserved[idx] = true;
          }
        }
        for (const a of temps) {
          if (a.kind === "named") {
            const idx = idxOf.get(a.name);
            if (idx !== void 0) slots[idx] = a.temp;
            continue;
          }
          if (a.isImplicitNamedCandidate && a.identName) {
            const idx = idxOf.get(a.identName);
            if (idx !== void 0) slots[idx] = a.temp;
          }
        }
        let next = 0;
        for (const a of temps) {
          if (a.kind !== "pos") continue;
          if (a.isImplicitNamedCandidate && a.identName && idxOf.has(a.identName)) continue;
          while (reserved[next] === true || slots[next] !== void 0) next++;
          if (sigNames && next >= sigNames.length) break;
          slots[next] = a.temp;
          next++;
        }
        let lastNonUndef = -1;
        for (let i = 0; i < sigNames.length; i++) {
          if (slots[i] !== void 0) lastNonUndef = i;
        }
        const pos2 = lastNonUndef + 1;
        for (let i = 0; i < pos2; i++) {
          const t = slots[i];
          if (t !== void 0) this.emitLoadName(t);
          else this.emitUndef();
        }
        for (let i = extraNamed.length - 1; i >= 0; i--) {
          const a = extraNamed[i];
          this.emitPushConst(this.k(a.name));
          this.emitLoadName(a.temp);
        }
        this.emit({ op: "CALL", pos: pos2, named: extraNamed.length });
        return;
      }
      const namedTemps = [];
      let pos = 0;
      for (const a of temps) {
        if (a.kind === "pos") pos++;
        else namedTemps.push({ name: a.name, temp: a.temp });
      }
      for (const a of temps) if (a.kind === "pos") this.emitLoadName(a.temp);
      for (let i = namedTemps.length - 1; i >= 0; i--) {
        const a = namedTemps[i];
        this.emitPushConst(this.k(a.name));
        this.emitLoadName(a.temp);
      }
      this.emit({ op: "CALL", pos, named: namedTemps.length });
    }
    compileArg(arg) {
      if (arg.kind === "pos") {
        this.compileExpr(arg.value);
        return;
      }
      if (arg.kind === "named") {
        this.emitPushConst(this.k(arg.name));
        this.compileExpr(arg.value);
        return;
      }
      this.emitPushConst(this.k(arg.name));
      this.emitLoadName(arg.name);
    }
    compileBinary(expr) {
      if (expr.op === "|>") {
        if (expr.right.kind === "ident") {
          this.err(
            expr.right.loc,
            `Bare identifier '${expr.right.name}' in pipe. Did you mean to call it with '${expr.right.name}($)'?`
          );
        }
        const temp = `%pipe${this.pipe.length}`;
        this.compileExpr(expr.left);
        this.emitStore(this.nameConst(temp));
        this.emit(INS_POP);
        this.pipe.push(temp);
        this.compileExpr(expr.right);
        this.pipe.pop();
        return;
      }
      if (expr.op === "||") {
        this.compileExpr(expr.left);
        this.emit(INS_DUP);
        const jFalse = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
        const jEnd = this.emit({ op: "JUMP", to: -1 });
        this.patch(jFalse, this.chunk.code.length);
        this.emit(INS_POP);
        this.compileExpr(expr.right);
        this.patch(jEnd, this.chunk.code.length);
        return;
      }
      if (expr.op === "&&") {
        this.compileExpr(expr.left);
        this.emit(INS_DUP);
        const jFalse = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
        this.emit(INS_POP);
        this.compileExpr(expr.right);
        this.patch(jFalse, this.chunk.code.length);
        return;
      }
      this.compileExpr(expr.left);
      this.compileExpr(expr.right);
      this.emit({ op: "BINARY", opName: expr.op });
    }
    compileAssign(expr) {
      if (expr.op !== "=") {
        const opName = expr.op.slice(0, -1);
        if (expr.target.kind === "ident") {
          this.emitLoad(this.nameConst(expr.target.name));
          this.compileExpr(expr.value);
          this.emit({ op: "BINARY", opName });
          this.emitStore(this.nameConst(expr.target.name));
          return;
        }
        if (expr.target.kind === "member") {
          this.compileExpr(expr.target.object);
          if (expr.target.computed === true) {
            this.compileExpr(expr.target.index);
            this.emit(INS_DUP2);
            this.emit(INS_GET_INDEX);
            this.compileExpr(expr.value);
            this.emit({ op: "BINARY", opName });
            this.emit(INS_SET_INDEX);
          } else {
            this.emit(INS_DUP);
            this.emit({ op: "GET_PROP", key: this.k(expr.target.prop) });
            this.compileExpr(expr.value);
            this.emit({ op: "BINARY", opName });
            this.emit({ op: "SET_PROP", key: this.k(expr.target.prop) });
          }
          return;
        }
        this.err(expr.loc, "Invalid assignment target");
        this.compileExpr(expr.value);
        return;
      }
      if (expr.target.kind === "ident") {
        if (expr.value?.kind === "func") {
          const names = expr.value.params.map((p) => p.name);
          const idxOf = /* @__PURE__ */ new Map();
          for (let i = 0; i < names.length; i++) idxOf.set(names[i], i);
          this.setSigInfo(expr.target.name, { names, idxOf });
        } else {
          this.setSigInfo(expr.target.name, null);
        }
        this.compileExpr(expr.value);
        this.emitStore(this.nameConst(expr.target.name));
        return;
      }
      if (expr.target.kind === "member") {
        this.compileExpr(expr.target.object);
        if (expr.target.computed === true) this.compileExpr(expr.target.index);
        this.compileExpr(expr.value);
        if (expr.target.computed === true) this.emit(INS_SET_INDEX);
        else this.emit({ op: "SET_PROP", key: this.k(expr.target.prop) });
        return;
      }
      this.err(expr.loc, "Invalid assignment target");
      this.compileExpr(expr.value);
    }
    compileIf(expr) {
      const noBranchMark = expr.__noBranchMark === true;
      this.compileExpr(expr.test);
      const jFalse = this.emit({ op: "JUMP_IF_FALSE", to: -1 });
      const thenLoc = expr.ifLoc ?? expr.questionLoc ?? expr.then.loc ?? expr.loc;
      if (!noBranchMark) this.emitBranchMark(thenLoc);
      this.compileIfBranch(expr.then);
      if (!expr.else) {
        this.patch(jFalse, this.chunk.code.length);
        this.emit(INS_PUSH_UNDEF);
        return;
      }
      const jEnd = this.emit({ op: "JUMP", to: -1 });
      this.patch(jFalse, this.chunk.code.length);
      let elseLoc = expr.elseLoc ?? expr.colonLoc ?? expr.else.loc ?? expr.loc;
      if (expr.elseLoc && expr.else.kind === "if") {
        const elseIfLoc = expr.else.ifLoc;
        if (elseIfLoc) elseLoc = this.locFrom(expr.elseLoc, elseIfLoc);
      }
      if (!noBranchMark) this.emitBranchMark(elseLoc);
      this.compileIfBranch(expr.else);
      this.patch(jEnd, this.chunk.code.length);
    }
    compileIfBranch(branch) {
      if ("kind" in branch && branch.kind === "block") {
        this.compileBlockAsExpr(branch);
        return;
      }
      this.compileExpr(branch);
    }
    compileBlockAsExpr(block) {
      this.emit(INS_ENTER_SCOPE);
      this.enterSigScope();
      if (!block.body.length) {
        this.emit(INS_PUSH_UNDEF);
        this.exitSigScope();
        this.emit(INS_EXIT_SCOPE);
        return;
      }
      for (let i = 0; i < block.body.length; i++) {
        const s = block.body[i];
        const isLast = i === block.body.length - 1;
        if (isLast && s.kind === "expr_stmt") {
          this.compileExpr(s.expr);
          continue;
        }
        this.compileStmt(s, false);
      }
      const last = block.body[block.body.length - 1];
      if (last.kind !== "expr_stmt") this.emit(INS_PUSH_UNDEF);
      this.exitSigScope();
      this.emit(INS_EXIT_SCOPE);
    }
    compileFunc(expr) {
      const id = this.chunk.funcs.length;
      const fn = new Compiler(this.src);
      const pipeLen = this.pipe.length;
      fn.pipe = this.pipe;
      const body = expr.body;
      if ("kind" in body && body.kind === "block") fn.compileBlockAsExpr(body);
      else fn.compileExpr(body);
      fn.emit(INS_RETURN);
      this.pipe.length = pipeLen;
      this.chunk.funcs.push({
        params: expr.params.map((p) => ({ name: p.name, isRest: p.isRest })),
        chunk: fn.chunk
      });
      this.emit({ op: "FUNC", id });
    }
  }
  function lineText(src, line) {
    let cur = 1;
    let i = 0;
    let start = 0;
    while (i < src.length && cur < line) {
      if (src[i] === "\n") {
        cur++;
        start = i + 1;
      }
      i++;
    }
    let end = src.indexOf("\n", start);
    if (end === -1) end = src.length;
    return src.slice(start, end);
  }
  const keywords = {
    true: "kw_true",
    false: "kw_false",
    null: "kw_null",
    undefined: "kw_undefined",
    if: "kw_if",
    else: "kw_else",
    for: "kw_for",
    of: "kw_of",
    while: "kw_while",
    do: "kw_do",
    switch: "kw_switch",
    case: "kw_case",
    default: "kw_default",
    break: "kw_break",
    continue: "kw_continue",
    return: "kw_return",
    try: "kw_try",
    catch: "kw_catch",
    finally: "kw_finally",
    throw: "kw_throw"
  };
  const isDigit = (c) => c >= "0" && c <= "9";
  const isAlpha = (c) => c >= "a" && c <= "z" || c >= "A" && c <= "Z" || c === "_" || c === "$";
  const isAlphaNum = (c) => isAlpha(c) || isDigit(c);
  const isIdentContinue = (c) => isAlphaNum(c) || c === "#";
  const lexCache = /* @__PURE__ */ new Map();
  function preprocessSource(src) {
    const offsets = [];
    let result = "";
    let lastIndex = 0;
    let line = 1;
    let column = 1;
    const regex = /([a-zA-Z_$][a-zA-Z0-9_$#]*)\s*=\s*\|>/g;
    let match;
    while ((match = regex.exec(src)) !== null) {
      const beforeMatch = src.slice(lastIndex, match.index);
      result += beforeMatch;
      for (let i = 0; i < beforeMatch.length; i++) {
        if (beforeMatch[i] === "\n") {
          line++;
          column = 1;
        } else {
          column++;
        }
      }
      const matchStartColumn = column;
      const ident = match[1];
      const original = match[0];
      const replacement = `${ident}=_p->_p|>`;
      result += replacement;
      const lengthDiff = replacement.length - original.length;
      offsets.push({ line, column: matchStartColumn + ident.length + 1, offset: lengthDiff });
      column += replacement.length;
      lastIndex = regex.lastIndex;
    }
    result += src.slice(lastIndex);
    return { src: result, offsets };
  }
  function lex(src, options2) {
    const cached = lexCache.get(src);
    if (cached) return cached;
    const preprocessed = preprocessSource(src);
    src = preprocessed.src;
    const columnOffsets = preprocessed.offsets;
    const t = [];
    const e = [];
    const preludeLines = options2?.preludeLines ?? 0;
    const postludeStart = options2?.postludeStart ?? Infinity;
    let i = 0;
    let line = 1;
    let col = 1;
    let lineStart = 0;
    const peek = (k = 0) => i + k < src.length ? src[i + k] : "\0";
    const atEnd = () => i >= src.length;
    const advance = () => {
      const c = src[i++] ?? "\0";
      if (c === "\n") {
        line++;
        col = 1;
        lineStart = i;
      } else {
        col++;
      }
      return c;
    };
    const add = (kind, start, startLine, startCol, value) => {
      const lexeme = src.slice(start, i);
      const isKernel = startLine <= preludeLines || startLine >= postludeStart;
      let adjustedCol = startCol;
      for (const offset of columnOffsets) {
        if (offset.line === startLine && startCol >= offset.column) {
          adjustedCol -= offset.offset;
        }
      }
      t.push({
        kind,
        lexeme,
        value,
        line: startLine,
        column: adjustedCol,
        length: i - start,
        kernel: isKernel || void 0
      });
    };
    const addError = (message, start, startLine, startCol) => {
      Math.min(src.length, start + 80);
      const code = src.slice(lineStart, src.indexOf("\n", lineStart) === -1 ? src.length : src.indexOf("\n", lineStart));
      let adjustedCol = startCol;
      for (const offset of columnOffsets) {
        if (offset.line === startLine && startCol >= offset.column) {
          adjustedCol -= offset.offset;
        }
      }
      e.push({ message, line: startLine, column: adjustedCol, length: Math.max(1, i - start), code });
      i = Math.max(i, start + 1);
    };
    const skipLineComment = () => {
      while (!atEnd() && peek() !== "\n") advance();
    };
    const skipBlockComment = () => {
      advance();
      advance();
      while (!atEnd()) {
        if (peek() === "*" && peek(1) === "/") {
          advance();
          advance();
          return;
        }
        advance();
      }
      e.push({
        message: "Unterminated block comment",
        line,
        column: col,
        length: 1,
        code: src.slice(lineStart, src.indexOf("\n", lineStart) === -1 ? src.length : src.indexOf("\n", lineStart))
      });
    };
    const readNumber = (start, startLine, startCol, leadingDot = false) => {
      while (isDigit(peek())) advance();
      if (!leadingDot && peek() === "." && peek(1) !== ".") {
        advance();
        while (isDigit(peek())) advance();
      }
      let isKilo = false;
      if (peek() === "k") {
        advance();
        isKilo = true;
      }
      const s = src.slice(start, i);
      const n = Number(s.replace("k", ""));
      if (Number.isNaN(n)) {
        addError("Invalid number", start, startLine, startCol);
        return;
      }
      const value = isKilo ? n * 1e3 : n;
      add("number", start, startLine, startCol, value);
    };
    const readIdentifier = (start, startLine, startCol) => {
      while (isIdentContinue(peek())) advance();
      const s = src.slice(start, i);
      const kw = keywords[s];
      if (kw) add(kw, start, startLine, startCol);
      else add("identifier", start, startLine, startCol);
    };
    const readString = (quote, start, startLine, startCol) => {
      while (!atEnd()) {
        const c = advance();
        if (c === quote) {
          const raw = src.slice(start + 1, i - 1);
          add("string", start, startLine, startCol, raw);
          return;
        }
      }
      addError("Unterminated string", start, startLine, startCol);
    };
    while (!atEnd()) {
      const start = i;
      const startLine = line;
      const startCol = col;
      const c = advance();
      if (c === " " || c === "	" || c === "\r" || c === "\n") continue;
      if (c === "/" && peek() === "/") {
        skipLineComment();
        continue;
      }
      if (c === "/" && peek() === "*") {
        i = start;
        col = startCol;
        skipBlockComment();
        continue;
      }
      if (c === "'" || c === '"') {
        readString(c, start, startLine, startCol);
        continue;
      }
      if (c === "$" && !isAlphaNum(peek())) {
        add("pipe_value", start, startLine, startCol);
        continue;
      }
      if (isDigit(c)) {
        readNumber(start, startLine, startCol);
        continue;
      }
      if (isAlpha(c)) {
        readIdentifier(start, startLine, startCol);
        continue;
      }
      if (c === "#" && (isDigit(peek()) || isAlpha(peek()))) {
        readIdentifier(start, startLine, startCol);
        continue;
      }
      const two = c + peek();
      const three = c + peek() + peek(1);
      if (three === ">>>") {
        advance();
        advance();
        add("shift_ur", start, startLine, startCol);
        continue;
      }
      if (three === "===") {
        advance();
        advance();
        add("eq_eq_eq", start, startLine, startCol);
        continue;
      }
      if (two === "&&") {
        advance();
        add("and_and", start, startLine, startCol);
        continue;
      }
      if (two === "||") {
        advance();
        add("or_or", start, startLine, startCol);
        continue;
      }
      if (two === "==") {
        advance();
        add("eq_eq", start, startLine, startCol);
        continue;
      }
      if (two === "<=") {
        advance();
        add("lte", start, startLine, startCol);
        continue;
      }
      if (two === ">=") {
        advance();
        add("gte", start, startLine, startCol);
        continue;
      }
      if (two === "<<") {
        advance();
        add("shift_l", start, startLine, startCol);
        continue;
      }
      if (two === ">>") {
        advance();
        add("shift_r", start, startLine, startCol);
        continue;
      }
      if (two === "**") {
        advance();
        if (peek() === "=") {
          advance();
          add("assign_power", start, startLine, startCol);
        } else {
          add("power", start, startLine, startCol);
        }
        continue;
      }
      if (two === "->") {
        advance();
        add("arrow", start, startLine, startCol);
        continue;
      }
      if (two === "|>") {
        advance();
        add("pipe", start, startLine, startCol);
        continue;
      }
      if (two === "++") {
        advance();
        add("plus_plus", start, startLine, startCol);
        continue;
      }
      if (two === "--") {
        advance();
        add("minus_minus", start, startLine, startCol);
        continue;
      }
      if (c === "." && peek() === "." && peek(1) === ".") {
        advance();
        advance();
        add("ellipsis", start, startLine, startCol);
        continue;
      }
      if (c === "." && isDigit(peek())) {
        readNumber(start, startLine, startCol, true);
        continue;
      }
      if (c === "+" && peek() === "=") {
        advance();
        add("assign_plus", start, startLine, startCol);
        continue;
      }
      if (c === "-" && peek() === "=") {
        advance();
        add("assign_minus", start, startLine, startCol);
        continue;
      }
      if (c === "*" && peek() === "=") {
        advance();
        add("assign_star", start, startLine, startCol);
        continue;
      }
      if (c === "/" && peek() === "=") {
        advance();
        add("assign_slash", start, startLine, startCol);
        continue;
      }
      if (c === "%" && peek() === "=") {
        advance();
        add("assign_percent", start, startLine, startCol);
        continue;
      }
      if (c === "(") add("l_paren", start, startLine, startCol);
      else if (c === ")") add("r_paren", start, startLine, startCol);
      else if (c === "{") add("l_brace", start, startLine, startCol);
      else if (c === "}") add("r_brace", start, startLine, startCol);
      else if (c === "[") add("l_bracket", start, startLine, startCol);
      else if (c === "]") add("r_bracket", start, startLine, startCol);
      else if (c === ",") add("comma", start, startLine, startCol);
      else if (c === "?") add("question", start, startLine, startCol);
      else if (c === ":") add("colon", start, startLine, startCol);
      else if (c === ";") add("semicolon", start, startLine, startCol);
      else if (c === ".") add("dot", start, startLine, startCol);
      else if (c === "+") add("plus", start, startLine, startCol);
      else if (c === "-") add("minus", start, startLine, startCol);
      else if (c === "*") add("star", start, startLine, startCol);
      else if (c === "/") add("slash", start, startLine, startCol);
      else if (c === "%") add("percent", start, startLine, startCol);
      else if (c === "!") add("bang", start, startLine, startCol);
      else if (c === "~") add("tilde", start, startLine, startCol);
      else if (c === "&") add("amp", start, startLine, startCol);
      else if (c === "|") add("bar", start, startLine, startCol);
      else if (c === "^") add("caret", start, startLine, startCol);
      else if (c === "<") add("lt", start, startLine, startCol);
      else if (c === ">") add("gt", start, startLine, startCol);
      else if (c === "=") add("assign", start, startLine, startCol);
      else add("invalid", start, startLine, startCol);
    }
    t.push({ kind: "eof", lexeme: "", line, column: col, length: 0, kernel: void 0 });
    const result = { tokens: t, errors: e };
    lexCache.set(src, result);
    return result;
  }
  function decimalsOf(literal) {
    const decimalIndex = literal.indexOf(".");
    if (decimalIndex === -1) return 0;
    return Math.max(0, Math.min(6, literal.length - decimalIndex - 1));
  }
  const locOf = (n) => "loc" in n ? n.loc : n;
  const parseCache = /* @__PURE__ */ new Map();
  function parse(src, tokens, options2) {
    const cacheKey = src;
    const cached = parseCache.get(cacheKey);
    if (cached) return cached;
    const p = new Parser(src, tokens, 0);
    const program = p.parseProgram();
    const result = { program, errors: p.errors };
    parseCache.set(cacheKey, result);
    return result;
  }
  class Parser {
    constructor(src, tokens, preludeLines = 0) {
      this.src = src;
      this.tokens = tokens;
      this.preludeLines = preludeLines;
    }
    errors = [];
    i = 0;
    normalizeLine(line, isKernel) {
      return isKernel ? 0 : Math.max(0, line - this.preludeLines);
    }
    locFrom(a, b) {
      const aLine = "kind" in a ? this.normalizeLine(a.line, a.kernel) : a.line;
      if (!b) {
        return {
          line: aLine,
          column: a.column,
          length: a.length,
          kernel: a.kernel
        };
      }
      const len = Math.max(1, b.column + b.length - a.column);
      return {
        line: aLine,
        column: a.column,
        length: len,
        kernel: a.kernel || b.kernel
      };
    }
    cur() {
      return this.tokens[this.i] ?? this.tokens[this.tokens.length - 1];
    }
    prev() {
      return this.tokens[Math.max(0, this.i - 1)];
    }
    at(kind) {
      return this.cur().kind === kind;
    }
    next() {
      const t = this.cur();
      if (t.kind !== "eof") this.i++;
      return t;
    }
    match(kind) {
      if (!this.at(kind)) return null;
      return this.next();
    }
    error(t, message) {
      this.errors.push({
        message,
        line: t.line,
        column: t.column,
        length: Math.max(1, t.length),
        code: t.line <= 0 ? "" : lineText(this.src, t.line)
      });
    }
    expect(kind, message) {
      const t = this.cur();
      if (t.kind === kind) return this.next();
      this.error(t, message);
      return t;
    }
    skipStatementSep() {
      while (this.match("semicolon")) {
      }
    }
    syncStmt() {
      while (!this.at("eof") && !this.at("semicolon") && !this.at("r_brace")) this.next();
      this.skipStatementSep();
    }
    parseProgram() {
      const start = this.cur();
      const body = [];
      this.skipStatementSep();
      while (!this.at("eof")) {
        const s = this.parseStmt();
        body.push(s);
        this.skipStatementSep();
      }
      return { kind: "program", body, loc: this.locFrom(start, this.prev()) };
    }
    parseStmt() {
      const t = this.cur();
      if (this.at("l_brace")) return this.parseBlockStmt();
      if (this.at("kw_for")) return this.parseForStmt();
      if (this.at("kw_while")) return this.parseWhileStmt();
      if (this.at("kw_do")) return this.parseDoWhileStmt();
      if (this.at("kw_switch")) return this.parseSwitchStmt();
      if (this.at("kw_try")) return this.parseTryStmt();
      if (this.at("kw_throw")) return this.parseThrowStmt();
      if (this.at("kw_return")) return this.parseReturnStmt();
      if (this.at("kw_break")) return this.parseBreakStmt();
      if (this.at("kw_continue")) return this.parseContinueStmt();
      const label = this.tryParseLabelStmt();
      if (label) return label;
      const destructure = this.tryParseDestructureStmt();
      if (destructure) return destructure;
      const expr = this.parseExpr();
      return { kind: "expr_stmt", expr, loc: this.locFrom(t, this.prev()) };
    }
    tryParseLabelStmt() {
      if (!this.at("identifier")) return null;
      const nameTok = this.cur();
      const nextTok = this.tokens[this.i + 1];
      if (!nextTok || nextTok.kind !== "colon") return null;
      this.next();
      this.next();
      const stmt = this.parseStmt();
      return { kind: "label", name: nameTok.lexeme, stmt, loc: this.locFrom(nameTok, this.prev()) };
    }
    tryParseDestructureStmt() {
      const start = this.cur();
      if (!this.at("l_brace") && !this.at("l_bracket")) return null;
      const save = this.i;
      const pat = this.tryParseDestructurePattern();
      if (!pat) {
        this.i = save;
        return null;
      }
      if (!this.at("assign")) {
        this.i = save;
        return null;
      }
      this.next();
      const value = this.parseExpr();
      return { kind: "destructure", pattern: pat, value, loc: this.locFrom(start, this.prev()) };
    }
    tryParseDestructurePattern() {
      const start = this.cur();
      const save = this.i;
      if (this.match("l_brace")) {
        const keys = [];
        while (!this.at("eof") && !this.at("r_brace")) {
          if (!this.at("identifier")) {
            this.i = save;
            return null;
          }
          keys.push(this.next().lexeme);
          if (!this.match("comma")) break;
        }
        if (!this.match("r_brace")) {
          this.i = save;
          return null;
        }
        return { kind: "obj", keys, loc: this.locFrom(start, this.prev()) };
      }
      if (this.match("l_bracket")) {
        const items = [];
        while (!this.at("eof") && !this.at("r_bracket")) {
          if (!this.at("identifier")) {
            this.i = save;
            return null;
          }
          items.push(this.next().lexeme);
          if (!this.match("comma")) break;
        }
        if (!this.match("r_bracket")) {
          this.i = save;
          return null;
        }
        return { kind: "arr", items, loc: this.locFrom(start, this.prev()) };
      }
      return null;
    }
    parseBlockStmt() {
      const start = this.expect("l_brace", "Expected '{'");
      const body = [];
      this.skipStatementSep();
      while (!this.at("eof") && !this.at("r_brace")) {
        const s = this.parseStmt();
        body.push(s);
        this.skipStatementSep();
      }
      this.expect("r_brace", "Expected '}'");
      return { kind: "block", body, loc: this.locFrom(start, this.prev()) };
    }
    parseForStmt() {
      const start = this.expect("kw_for", "Expected 'for'");
      this.expect("l_paren", "Expected '(' after 'for'");
      const head = this.parseForHead();
      this.expect("r_paren", "Expected ')' after for-head");
      const body = this.parseStmt();
      return { kind: "for", head, body, loc: this.locFrom(start, this.prev()) };
    }
    parseForHead() {
      const start = this.cur();
      const save = this.i;
      const maybeOf = this.tryParseForOfHead();
      if (maybeOf) return maybeOf;
      this.i = save;
      let init;
      let test;
      let update;
      if (!this.at("semicolon")) init = this.parseExpr();
      this.expect("semicolon", "Expected ';' in for-head");
      if (!this.at("semicolon")) test = this.parseExpr();
      this.expect("semicolon", "Expected ';' in for-head");
      if (!this.at("r_paren")) update = this.parseExpr();
      return { kind: "c_style", init, test, update, loc: this.locFrom(start, this.prev()) };
    }
    tryParseForOfHead() {
      const start = this.cur();
      const names = [];
      const first = this.match("identifier");
      if (!first) return null;
      names.push(first.lexeme);
      if (this.match("comma")) {
        const second = this.expect("identifier", "Expected identifier");
        if (second.kind === "identifier") names.push(second.lexeme);
        if (this.match("comma")) {
          const third = this.expect("identifier", "Expected identifier");
          if (third.kind === "identifier") names.push(third.lexeme);
        }
      }
      if (!this.match("kw_of")) return null;
      const iterable = this.parseExpr();
      return {
        kind: "of",
        value: names[0],
        index: names[1],
        length: names[2],
        iterable,
        loc: this.locFrom(start, this.prev())
      };
    }
    parseWhileStmt() {
      const start = this.expect("kw_while", "Expected 'while'");
      this.expect("l_paren", "Expected '(' after 'while'");
      const test = this.parseExpr();
      this.expect("r_paren", "Expected ')' after while condition");
      const body = this.parseStmt();
      return { kind: "while", test, body, loc: this.locFrom(start, this.prev()) };
    }
    parseDoWhileStmt() {
      const start = this.expect("kw_do", "Expected 'do'");
      const body = this.parseStmt();
      this.expect("kw_while", "Expected 'while' after 'do' body");
      this.expect("l_paren", "Expected '(' after 'while'");
      const test = this.parseExpr();
      this.expect("r_paren", "Expected ')' after while condition");
      this.match("semicolon");
      return { kind: "do_while", body, test, loc: this.locFrom(start, this.prev()) };
    }
    parseSwitchStmt() {
      const start = this.expect("kw_switch", "Expected 'switch'");
      this.expect("l_paren", "Expected '(' after 'switch'");
      const test = this.parseExpr();
      this.expect("r_paren", "Expected ')' after switch test");
      this.expect("l_brace", "Expected '{' after switch");
      const cases = [];
      while (!this.at("eof") && !this.at("r_brace")) {
        const c = this.parseSwitchCase();
        cases.push(c);
      }
      this.expect("r_brace", "Expected '}' after switch");
      return { kind: "switch", test, cases, loc: this.locFrom(start, this.prev()) };
    }
    parseSwitchCase() {
      const start = this.cur();
      let test;
      if (this.match("kw_case")) {
        test = this.parseExpr();
      } else if (this.match("kw_default")) {
        test = void 0;
      } else {
        this.error(this.cur(), "Expected 'case' or 'default'");
        this.next();
      }
      this.expect("colon", "Expected ':' after case");
      const body = [];
      this.skipStatementSep();
      while (!this.at("eof") && !this.at("r_brace") && !this.at("kw_case") && !this.at("kw_default")) {
        if (this.at("l_brace")) {
          body.push(this.parseBlockStmt());
          this.skipStatementSep();
          continue;
        }
        const s = this.parseStmt();
        body.push(s);
        this.skipStatementSep();
      }
      return { kind: "case", test, body, loc: this.locFrom(start, this.prev()) };
    }
    parseTryStmt() {
      const start = this.expect("kw_try", "Expected 'try'");
      const body = this.parseBlockStmt();
      let catchName;
      let catchBody;
      let finallyBody;
      if (this.match("kw_catch")) {
        this.expect("l_paren", "Expected '(' after 'catch'");
        const nameTok = this.expect("identifier", "Expected catch binding name");
        catchName = nameTok.kind === "identifier" ? nameTok.lexeme : "error";
        this.expect("r_paren", "Expected ')' after catch binding");
        catchBody = this.parseBlockStmt();
      }
      if (this.match("kw_finally")) {
        finallyBody = this.parseBlockStmt();
      }
      if (!catchBody && !finallyBody) {
        this.error(this.cur(), "Expected 'catch' or 'finally' after 'try' block");
      }
      return { kind: "try", body, catchName, catchBody, finallyBody, loc: this.locFrom(start, this.prev()) };
    }
    parseThrowStmt() {
      const start = this.expect("kw_throw", "Expected 'throw'");
      const value = this.parseExpr();
      return { kind: "throw", value, loc: this.locFrom(start, this.prev()) };
    }
    parseReturnStmt() {
      const start = this.expect("kw_return", "Expected 'return'");
      if (this.at("semicolon") || this.at("r_brace") || this.at("eof")) {
        return { kind: "return", loc: this.locFrom(start, start) };
      }
      const value = this.parseExpr();
      return { kind: "return", value, loc: this.locFrom(start, this.prev()) };
    }
    parseBreakStmt() {
      const start = this.expect("kw_break", "Expected 'break'");
      let label;
      if (this.at("identifier")) label = this.next().lexeme;
      return { kind: "break", label, loc: this.locFrom(start, this.prev()) };
    }
    parseContinueStmt() {
      const start = this.expect("kw_continue", "Expected 'continue'");
      let label;
      if (this.at("identifier")) label = this.next().lexeme;
      return { kind: "continue", label, loc: this.locFrom(start, this.prev()) };
    }
    parseExpr() {
      return this.parseAssign();
    }
    parseAssign() {
      const left = this.parsePipe();
      const t = this.cur();
      const op = this.assignOp(t.kind);
      if (!op) return left;
      if (left.kind === "ident" && this.isSpecialCaseVariable(left.name)) {
        this.error(t, `Cannot assign to special case variable '${left.name}'`);
      }
      this.next();
      const value = this.parseAssign();
      return { kind: "assign", op, target: left, value, loc: this.locFrom(left.loc, value.loc) };
    }
    assignOp(kind) {
      if (kind === "assign") return "=";
      if (kind === "assign_plus") return "+=";
      if (kind === "assign_minus") return "-=";
      if (kind === "assign_star") return "*=";
      if (kind === "assign_slash") return "/=";
      if (kind === "assign_percent") return "%=";
      if (kind === "assign_power") return "**=";
      return null;
    }
    isSpecialCaseVariable(name) {
      if (/^[cdefgab][#b]?\d$/.test(name)) {
        return true;
      }
      if (name === "#scale") {
        return true;
      }
      if (/^#\d+$/.test(name)) {
        return true;
      }
      if (/^#(i{1,3}|iv|v|vi|vii)$/i.test(name)) {
        return true;
      }
      return false;
    }
    parsePipe() {
      let expr = this.parseOr();
      while (this.match("pipe")) {
        const right = this.parseOr();
        expr = { kind: "binary", op: "|>", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseOr() {
      const start = this.cur();
      let expr = this.parseAnd();
      while (this.match("or_or")) {
        const right = this.parseAnd();
        expr = { kind: "binary", op: "||", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      if (this.match("question")) {
        const questionTok = this.prev();
        const thenExpr = this.parseExpr();
        const colonTok = this.expect("colon", "Expected ':' after ternary consequent");
        const elseExpr = this.parseExpr();
        return {
          kind: "if",
          test: expr,
          then: thenExpr,
          else: elseExpr,
          loc: this.locFrom(start, locOf(elseExpr)),
          questionLoc: this.locFrom(questionTok),
          colonLoc: this.locFrom(colonTok)
        };
      }
      return expr;
    }
    parseAnd() {
      let expr = this.parseEq();
      while (this.match("and_and")) {
        const right = this.parseEq();
        expr = { kind: "binary", op: "&&", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseEq() {
      let expr = this.parseCmp();
      while (this.match("eq_eq_eq") || this.match("eq_eq")) {
        const op = this.prev().kind === "eq_eq_eq" ? "===" : "==";
        const right = this.parseCmp();
        expr = { kind: "binary", op, left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseCmp() {
      let expr = this.parseBitOr();
      for (; ; ) {
        const k = this.cur().kind;
        if (k !== "lt" && k !== "lte" && k !== "gt" && k !== "gte") break;
        this.next();
        const right = this.parseBitOr();
        const op = k === "lt" ? "<" : k === "lte" ? "<=" : k === "gt" ? ">" : ">=";
        expr = { kind: "binary", op, left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseBitOr() {
      let expr = this.parseBitXor();
      while (this.match("bar")) {
        const right = this.parseBitXor();
        expr = { kind: "binary", op: "|", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseBitXor() {
      let expr = this.parseBitAnd();
      while (this.match("caret")) {
        const right = this.parseBitAnd();
        expr = { kind: "binary", op: "^", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseBitAnd() {
      let expr = this.parseShift();
      while (this.match("amp")) {
        const right = this.parseShift();
        expr = { kind: "binary", op: "&", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseShift() {
      let expr = this.parseAdd();
      for (; ; ) {
        const k = this.cur().kind;
        if (k !== "shift_l" && k !== "shift_r" && k !== "shift_ur") break;
        this.next();
        const right = this.parseAdd();
        const op = k === "shift_l" ? "<<" : k === "shift_r" ? ">>" : ">>>";
        expr = { kind: "binary", op, left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseAdd() {
      let expr = this.parseMul();
      for (; ; ) {
        const k = this.cur().kind;
        if (k !== "plus" && k !== "minus") break;
        this.next();
        const right = this.parseMul();
        expr = { kind: "binary", op: k === "plus" ? "+" : "-", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseMul() {
      let expr = this.parsePow();
      for (; ; ) {
        const k = this.cur().kind;
        if (k !== "star" && k !== "slash" && k !== "percent") break;
        this.next();
        const right = this.parsePow();
        const op = k === "star" ? "*" : k === "slash" ? "/" : "%";
        expr = { kind: "binary", op, left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parsePow() {
      let expr = this.parseUnary();
      if (this.match("power")) {
        const right = this.parsePow();
        expr = { kind: "binary", op: "**", left: expr, right, loc: this.locFrom(expr.loc, right.loc) };
      }
      return expr;
    }
    parseUnary() {
      const t = this.cur();
      if (this.match("minus")) {
        const expr = this.parseUnary();
        const tNormalizedLine = this.normalizeLine(t.line, t.kernel);
        if (expr.kind === "number" && expr.loc.line === tNormalizedLine && expr.loc.column === t.column + t.length) {
          const delta = expr.loc.column - t.column;
          const slider = expr.slider ? { ...expr.slider, widgetLength: (expr.slider.widgetLength ?? expr.loc.length) + delta } : void 0;
          return {
            ...expr,
            value: -expr.value,
            raw: `-${expr.raw}`,
            loc: this.locFrom(t, expr.loc),
            slider
          };
        }
        return { kind: "unary", op: "-", expr, loc: this.locFrom(t, expr.loc) };
      }
      if (this.match("bang")) {
        const expr = this.parseUnary();
        return { kind: "unary", op: "!", expr, loc: this.locFrom(t, expr.loc) };
      }
      if (this.match("tilde")) {
        const expr = this.parseUnary();
        return { kind: "unary", op: "~", expr, loc: this.locFrom(t, expr.loc) };
      }
      if (this.match("plus_plus")) {
        const expr = this.parseUnary();
        return { kind: "unary", op: "++", expr, loc: this.locFrom(t, expr.loc) };
      }
      if (this.match("minus_minus")) {
        const expr = this.parseUnary();
        return { kind: "unary", op: "--", expr, loc: this.locFrom(t, expr.loc) };
      }
      return this.parsePostfix();
    }
    parsePostfix() {
      let expr = this.parsePrimary();
      for (; ; ) {
        if (this.match("l_paren")) {
          if (expr.kind === "number") {
            const minTok = this.cur();
            const maxTok = this.tokens[this.i + 1];
            const expTok = this.tokens[this.i + 2];
            const endTok = this.tokens[this.i + (expTok?.kind === "number" ? 3 : 2)];
            if (minTok.kind === "number" && maxTok?.kind === "number" && endTok?.kind === "r_paren") {
              const minPrecision = decimalsOf(minTok.lexeme);
              const maxPrecision = decimalsOf(maxTok.lexeme);
              const valuePrecision = decimalsOf(expr.raw ?? "");
              const precision = Math.max(minPrecision, maxPrecision, valuePrecision);
              this.next();
              this.next();
              let exp;
              if (expTok?.kind === "number") {
                exp = Number(expTok.value);
                this.next();
              }
              this.next();
              const endTokNormalizedLine = this.normalizeLine(endTok.line, endTok.kernel);
              expr = {
                ...expr,
                slider: {
                  min: Number(minTok.value),
                  max: Number(maxTok.value),
                  widgetLength: endTokNormalizedLine === expr.loc.line ? endTok.column + endTok.length - expr.loc.column : expr.loc.length,
                  precision,
                  exp
                }
              };
              continue;
            }
          }
          const args = this.parseArgs();
          const end = this.expect("r_paren", "Expected ')'");
          expr = { kind: "call", callee: expr, args, loc: this.locFrom(expr.loc, end) };
          continue;
        }
        if (this.match("dot")) {
          const id = this.expect("identifier", "Expected property name after '.'");
          const prop = id.kind === "identifier" ? id.lexeme : "prop";
          expr = { kind: "member", object: expr, prop, computed: false, loc: this.locFrom(expr.loc, id) };
          continue;
        }
        if (expr.kind === "string" && this.at("l_bracket")) break;
        if (this.match("l_bracket")) {
          const index = this.parseExpr();
          const end = this.expect("r_bracket", "Expected ']'");
          expr = { kind: "member", object: expr, index, computed: true, loc: this.locFrom(expr.loc, end) };
          continue;
        }
        if (this.match("plus_plus")) {
          expr = { kind: "postfix", op: "++", expr, loc: this.locFrom(expr.loc, this.prev()) };
          continue;
        }
        if (this.match("minus_minus")) {
          expr = { kind: "postfix", op: "--", expr, loc: this.locFrom(expr.loc, this.prev()) };
          continue;
        }
        break;
      }
      return expr;
    }
    parseArgs() {
      const args = [];
      this.skipStatementSep();
      if (this.at("r_paren")) return args;
      while (!this.at("eof") && !this.at("r_paren")) {
        const start = this.cur();
        if (this.at("identifier") && this.tokens[this.i + 1]?.kind === "colon") {
          const nameTok = this.next();
          this.next();
          this.skipStatementSep();
          if (this.at("comma") || this.at("r_paren")) {
            args.push({ kind: "shorthand", name: nameTok.lexeme, loc: this.locFrom(nameTok) });
          } else {
            const value = this.parseExpr();
            args.push({ kind: "named", name: nameTok.lexeme, value, loc: this.locFrom(nameTok, value.loc) });
          }
        } else {
          const value = this.parseExpr();
          args.push({ kind: "pos", value, loc: this.locFrom(start, value.loc) });
        }
        if (!this.match("comma")) break;
        this.skipStatementSep();
      }
      return args;
    }
    parsePrimary() {
      const t = this.cur();
      if (this.match("number")) {
        return { kind: "number", value: Number(t.value), raw: t.lexeme, loc: this.locFrom(t) };
      }
      if (this.match("string")) {
        return { kind: "string", value: String(t.value ?? ""), raw: t.lexeme, loc: this.locFrom(t) };
      }
      if (this.match("kw_true")) return { kind: "bool", value: true, loc: this.locFrom(t) };
      if (this.match("kw_false")) return { kind: "bool", value: false, loc: this.locFrom(t) };
      if (this.match("kw_null")) return { kind: "null", loc: this.locFrom(t) };
      if (this.match("kw_undefined")) return { kind: "undefined", loc: this.locFrom(t) };
      if (this.match("pipe_value")) return { kind: "pipe_value", loc: this.locFrom(t) };
      const fnFromId = this.tryParseArrowFuncFromIdent();
      if (fnFromId) return fnFromId;
      if (this.at("l_paren")) {
        const fnFromParen = this.tryParseArrowFuncFromParen();
        if (fnFromParen) return fnFromParen;
        this.expect("l_paren", "Expected '('");
        const expr = this.parseExpr();
        this.expect("r_paren", "Expected ')'");
        return expr;
      }
      if (this.at("kw_if")) return this.parseIfExpr();
      if (this.match("identifier")) {
        return { kind: "ident", name: t.lexeme, loc: this.locFrom(t) };
      }
      if (this.at("l_bracket")) return this.parseArrayExpr();
      if (this.at("l_brace")) return this.parseObjectExpr();
      this.error(t, "Expected expression");
      this.next();
      return { kind: "ident", name: "error", loc: this.locFrom(t) };
    }
    parseIfExpr() {
      const start = this.expect("kw_if", "Expected 'if'");
      this.expect("l_paren", "Expected '(' after 'if'");
      const test = this.parseExpr();
      this.expect("r_paren", "Expected ')'");
      const then = this.at("l_brace") ? this.parseBlockStmt() : this.parseExpr();
      const elseTok = this.match("kw_else");
      if (!elseTok) {
        return {
          kind: "if",
          test,
          then,
          loc: this.locFrom(start, locOf(then)),
          ifLoc: this.locFrom(start)
        };
      }
      const elsePart = this.at("kw_if") ? this.parseIfExpr() : this.at("l_brace") ? this.parseBlockStmt() : this.parseExpr();
      return {
        kind: "if",
        test,
        then,
        else: elsePart,
        loc: this.locFrom(start, locOf(elsePart)),
        ifLoc: this.locFrom(start),
        elseLoc: this.locFrom(elseTok)
      };
    }
    parseArrayExpr() {
      const start = this.expect("l_bracket", "Expected '['");
      const items = [];
      this.skipStatementSep();
      while (!this.at("eof") && !this.at("r_bracket")) {
        const item = this.parseExpr();
        items.push(item);
        if (!this.match("comma")) break;
        this.skipStatementSep();
      }
      const end = this.expect("r_bracket", "Expected ']'");
      return { kind: "array", items, loc: this.locFrom(start, end) };
    }
    parseObjectExpr() {
      const start = this.expect("l_brace", "Expected '{'");
      const props = [];
      this.skipStatementSep();
      while (!this.at("eof") && !this.at("r_brace")) {
        const keyTok = this.cur();
        let key = null;
        if (this.match("identifier")) key = keyTok.lexeme;
        else if (this.match("string")) key = String(keyTok.value ?? "");
        else {
          this.error(this.cur(), "Expected property key");
          this.next();
        }
        this.expect("colon", "Expected ':' after property key");
        const value = this.parseExpr();
        if (key !== null) props.push({ key, value, loc: this.locFrom(keyTok, value.loc) });
        if (!this.match("comma")) break;
        this.skipStatementSep();
      }
      const end = this.expect("r_brace", "Expected '}'");
      return { kind: "object", props, loc: this.locFrom(start, end) };
    }
    tryParseArrowFuncFromIdent() {
      if (!this.at("identifier")) return null;
      const nameTok = this.cur();
      if (this.tokens[this.i + 1]?.kind !== "arrow") return null;
      this.next();
      this.next();
      const params = [{ name: nameTok.lexeme, isRest: false, loc: this.locFrom(nameTok) }];
      const body = this.at("l_brace") ? this.parseBlockStmt() : this.parseExpr();
      return { kind: "func", params, body, loc: this.locFrom(nameTok, locOf(body)) };
    }
    tryParseArrowFuncFromParen() {
      if (!this.at("l_paren") || !this.hasArrowAfterParen(this.i)) return null;
      const start = this.next();
      const params = [];
      let autoParamId = 0;
      this.skipStatementSep();
      if (!this.at("r_paren")) {
        while (!this.at("eof") && !this.at("r_paren")) {
          const pStart = this.cur();
          let isRest = false;
          if (this.match("ellipsis")) isRest = true;
          let pattern;
          let nameTok = this.cur();
          let name = "param";
          if (this.at("l_brace") || this.at("l_bracket")) {
            if (isRest) {
              this.error(pStart, "Rest parameter cannot be a destructuring pattern");
              isRest = false;
            }
            const pat = this.tryParseDestructurePattern();
            if (!pat) {
              this.error(this.cur(), "Invalid destructuring parameter pattern");
              while (!this.at("eof") && !this.at("comma") && !this.at("r_paren")) this.next();
            } else {
              pattern = pat;
              nameTok = locOf(pat);
            }
            name = `__param${autoParamId++}`;
          } else {
            const tok = this.expect("identifier", "Expected parameter name");
            nameTok = tok;
            name = tok.kind === "identifier" ? tok.lexeme : "param";
          }
          let def;
          if (this.match("assign")) def = this.parseExpr();
          params.push({ name, isRest, default: def, pattern, loc: this.locFrom(pStart, def?.loc ?? nameTok) });
          if (!this.match("comma")) break;
          this.skipStatementSep();
        }
      }
      this.expect("r_paren", "Expected ')'");
      this.expect("arrow", "Expected '->' for arrow function");
      const body = this.at("l_brace") ? this.parseBlockStmt() : this.parseExpr();
      return { kind: "func", params, body, loc: this.locFrom(start, locOf(body)) };
    }
    hasArrowAfterParen(startIdx) {
      let depth = 0;
      for (let i = startIdx; i < this.tokens.length; i++) {
        const kind = this.tokens[i].kind;
        if (kind === "l_paren") {
          depth++;
        } else if (kind === "r_paren") {
          depth--;
          if (depth === 0) {
            return this.tokens[i + 1]?.kind === "arrow";
          }
        }
      }
      return false;
    }
  }
  var VmSym = /* @__PURE__ */ ((VmSym2) => {
    VmSym2[VmSym2["A"] = 1] = "A";
    VmSym2[VmSym2["Abs"] = 2] = "Abs";
    VmSym2[VmSym2["Acos"] = 3] = "Acos";
    VmSym2[VmSym2["Ad"] = 4] = "Ad";
    VmSym2[VmSym2["Adsr"] = 5] = "Adsr";
    VmSym2[VmSym2["Analyser"] = 6] = "Analyser";
    VmSym2[VmSym2["Ap"] = 7] = "Ap";
    VmSym2[VmSym2["Asin"] = 8] = "Asin";
    VmSym2[VmSym2["At"] = 9] = "At";
    VmSym2[VmSym2["Atan"] = 10] = "Atan";
    VmSym2[VmSym2["Attack"] = 11] = "Attack";
    VmSym2[VmSym2["Avg"] = 12] = "Avg";
    VmSym2[VmSym2["B"] = 13] = "B";
    VmSym2[VmSym2["Bandwidth"] = 14] = "Bandwidth";
    VmSym2[VmSym2["Bar"] = 15] = "Bar";
    VmSym2[VmSym2["Bp"] = 16] = "Bp";
    VmSym2[VmSym2["Brown"] = 17] = "Brown";
    VmSym2[VmSym2["Bs"] = 18] = "Bs";
    VmSym2[VmSym2["Cb"] = 19] = "Cb";
    VmSym2[VmSym2["Ceil"] = 20] = "Ceil";
    VmSym2[VmSym2["Clamp"] = 21] = "Clamp";
    VmSym2[VmSym2["Co"] = 22] = "Co";
    VmSym2[VmSym2["Color"] = 23] = "Color";
    VmSym2[VmSym2["Compressor"] = 24] = "Compressor";
    VmSym2[VmSym2["Cond"] = 25] = "Cond";
    VmSym2[VmSym2["Cos"] = 26] = "Cos";
    VmSym2[VmSym2["Cube"] = 27] = "Cube";
    VmSym2[VmSym2["Curve"] = 28] = "Curve";
    VmSym2[VmSym2["Cut"] = 29] = "Cut";
    VmSym2[VmSym2["Damping"] = 30] = "Damping";
    VmSym2[VmSym2["Dattorro"] = 31] = "Dattorro";
    VmSym2[VmSym2["Dc"] = 32] = "Dc";
    VmSym2[VmSym2["Decay"] = 33] = "Decay";
    VmSym2[VmSym2["DecayDiffusion1"] = 34] = "DecayDiffusion1";
    VmSym2[VmSym2["DecayDiffusion2"] = 35] = "DecayDiffusion2";
    VmSym2[VmSym2["Degree"] = 36] = "Degree";
    VmSym2[VmSym2["Delay"] = 37] = "Delay";
    VmSym2[VmSym2["GetScale"] = 38] = "GetScale";
    VmSym2[VmSym2["DiodeLadder"] = 39] = "DiodeLadder";
    VmSym2[VmSym2["Down"] = 40] = "Down";
    VmSym2[VmSym2["Dry"] = 41] = "Dry";
    VmSym2[VmSym2["Edge"] = 42] = "Edge";
    VmSym2[VmSym2["Edge0"] = 43] = "Edge0";
    VmSym2[VmSym2["Edge1"] = 44] = "Edge1";
    VmSym2[VmSym2["Envfollow"] = 45] = "Envfollow";
    VmSym2[VmSym2["Euclid"] = 46] = "Euclid";
    VmSym2[VmSym2["Every"] = 47] = "Every";
    VmSym2[VmSym2["ExcursionDepth"] = 48] = "ExcursionDepth";
    VmSym2[VmSym2["ExcursionRate"] = 49] = "ExcursionRate";
    VmSym2[VmSym2["Exp"] = 50] = "Exp";
    VmSym2[VmSym2["Exp2"] = 51] = "Exp2";
    VmSym2[VmSym2["Expander"] = 52] = "Expander";
    VmSym2[VmSym2["Exponent"] = 53] = "Exponent";
    VmSym2[VmSym2["Fdn"] = 54] = "Fdn";
    VmSym2[VmSym2["Feedback"] = 55] = "Feedback";
    VmSym2[VmSym2["Floor"] = 56] = "Floor";
    VmSym2[VmSym2["Fold"] = 57] = "Fold";
    VmSym2[VmSym2["Fract"] = 58] = "Fract";
    VmSym2[VmSym2["Fractal"] = 59] = "Fractal";
    VmSym2[VmSym2["Freeverb"] = 60] = "Freeverb";
    VmSym2[VmSym2["Gain"] = 61] = "Gain";
    VmSym2[VmSym2["Gate"] = 62] = "Gate";
    VmSym2[VmSym2["Gauss"] = 63] = "Gauss";
    VmSym2[VmSym2["Glide"] = 64] = "Glide";
    VmSym2[VmSym2["Heaviside"] = 65] = "Heaviside";
    VmSym2[VmSym2["HfDecay"] = 66] = "HfDecay";
    VmSym2[VmSym2["Hi"] = 67] = "Hi";
    VmSym2[VmSym2["Hold"] = 68] = "Hold";
    VmSym2[VmSym2["Hp"] = 69] = "Hp";
    VmSym2[VmSym2["Hs"] = 70] = "Hs";
    VmSym2[VmSym2["Hypot"] = 71] = "Hypot";
    VmSym2[VmSym2["Hz"] = 72] = "Hz";
    VmSym2[VmSym2["In"] = 73] = "In";
    VmSym2[VmSym2["Index"] = 74] = "Index";
    VmSym2[VmSym2["InputDiffusion1"] = 75] = "InputDiffusion1";
    VmSym2[VmSym2["InputDiffusion2"] = 76] = "InputDiffusion2";
    VmSym2[VmSym2["Isinf"] = 77] = "Isinf";
    VmSym2[VmSym2["Isnan"] = 78] = "Isnan";
    VmSym2[VmSym2["K"] = 79] = "K";
    VmSym2[VmSym2["Key"] = 80] = "Key";
    VmSym2[VmSym2["Knee"] = 81] = "Knee";
    VmSym2[VmSym2["L"] = 82] = "L";
    VmSym2[VmSym2["Lerp"] = 83] = "Lerp";
    VmSym2[VmSym2["LfoRamp"] = 84] = "LfoRamp";
    VmSym2[VmSym2["LfoSah"] = 85] = "LfoSah";
    VmSym2[VmSym2["LfoSaw"] = 86] = "LfoSaw";
    VmSym2[VmSym2["LfoSine"] = 87] = "LfoSine";
    VmSym2[VmSym2["LfoSqr"] = 88] = "LfoSqr";
    VmSym2[VmSym2["LfoTri"] = 89] = "LfoTri";
    VmSym2[VmSym2["Limiter"] = 90] = "Limiter";
    VmSym2[VmSym2["Lo"] = 91] = "Lo";
    VmSym2[VmSym2["Log"] = 92] = "Log";
    VmSym2[VmSym2["Log10"] = 93] = "Log10";
    VmSym2[VmSym2["Log2"] = 94] = "Log2";
    VmSym2[VmSym2["Lp"] = 95] = "Lp";
    VmSym2[VmSym2["Ls"] = 96] = "Ls";
    VmSym2[VmSym2["Map"] = 97] = "Map";
    VmSym2[VmSym2["Max"] = 98] = "Max";
    VmSym2[VmSym2["Mhp"] = 99] = "Mhp";
    VmSym2[VmSym2["Midi"] = 100] = "Midi";
    VmSym2[VmSym2["Min"] = 101] = "Min";
    VmSym2[VmSym2["Mini"] = 102] = "Mini";
    VmSym2[VmSym2["Mlp"] = 103] = "Mlp";
    VmSym2[VmSym2["Mod"] = 104] = "Mod";
    VmSym2[VmSym2["ModDepth"] = 105] = "ModDepth";
    VmSym2[VmSym2["Notch"] = 106] = "Notch";
    VmSym2[VmSym2["Note"] = 107] = "Note";
    VmSym2[VmSym2["Octave"] = 108] = "Octave";
    VmSym2[VmSym2["Octaves"] = 109] = "Octaves";
    VmSym2[VmSym2["Offset"] = 110] = "Offset";
    VmSym2[VmSym2["Ohp"] = 111] = "Ohp";
    VmSym2[VmSym2["Olp"] = 112] = "Olp";
    VmSym2[VmSym2["Out"] = 113] = "Out";
    VmSym2[VmSym2["Oversample"] = 114] = "Oversample";
    VmSym2[VmSym2["Pattern"] = 115] = "Pattern";
    VmSym2[VmSym2["Peak"] = 116] = "Peak";
    VmSym2[VmSym2["Phasor"] = 117] = "Phasor";
    VmSym2[VmSym2["Impulse"] = 118] = "Impulse";
    VmSym2[VmSym2["Inc"] = 119] = "Inc";
    VmSym2[VmSym2["Pingpong"] = 120] = "Pingpong";
    VmSym2[VmSym2["Pink"] = 121] = "Pink";
    VmSym2[VmSym2["Play"] = 122] = "Play";
    VmSym2[VmSym2["PlayPick"] = 123] = "PlayPick";
    VmSym2[VmSym2["Post"] = 124] = "Post";
    VmSym2[VmSym2["PreDelay"] = 125] = "PreDelay";
    VmSym2[VmSym2["Prob"] = 126] = "Prob";
    VmSym2[VmSym2["Pwm"] = 127] = "Pwm";
    VmSym2[VmSym2["Q"] = 128] = "Q";
    VmSym2[VmSym2["R"] = 129] = "R";
    VmSym2[VmSym2["Ramp"] = 130] = "Ramp";
    VmSym2[VmSym2["Random"] = 131] = "Random";
    VmSym2[VmSym2["Rate"] = 132] = "Rate";
    VmSym2[VmSym2["Ratio"] = 133] = "Ratio";
    VmSym2[VmSym2["Release"] = 134] = "Release";
    VmSym2[VmSym2["Repeat"] = 135] = "Repeat";
    VmSym2[VmSym2["Roomsize"] = 136] = "Roomsize";
    VmSym2[VmSym2["Round"] = 137] = "Round";
    VmSym2[VmSym2["Safediv"] = 138] = "Safediv";
    VmSym2[VmSym2["Sample"] = 139] = "Sample";
    VmSym2[VmSym2["Sampler"] = 140] = "Sampler";
    VmSym2[VmSym2["Sap"] = 141] = "Sap";
    VmSym2[VmSym2["Sah"] = 142] = "Sah";
    VmSym2[VmSym2["Saturation"] = 143] = "Saturation";
    VmSym2[VmSym2["Saw"] = 144] = "Saw";
    VmSym2[VmSym2["Sbp"] = 145] = "Sbp";
    VmSym2[VmSym2["Sbs"] = 146] = "Sbs";
    VmSym2[VmSym2["Scale"] = 147] = "Scale";
    VmSym2[VmSym2["Seconds"] = 148] = "Seconds";
    VmSym2[VmSym2["Seed"] = 149] = "Seed";
    VmSym2[VmSym2["Select"] = 150] = "Select";
    VmSym2[VmSym2["Seq"] = 151] = "Seq";
    VmSym2[VmSym2["Shp"] = 152] = "Shp";
    VmSym2[VmSym2["Sign"] = 153] = "Sign";
    VmSym2[VmSym2["Signal"] = 154] = "Signal";
    VmSym2[VmSym2["Sin"] = 155] = "Sin";
    VmSym2[VmSym2["Sine"] = 156] = "Sine";
    VmSym2[VmSym2["Size"] = 157] = "Size";
    VmSym2[VmSym2["Slew"] = 158] = "Slew";
    VmSym2[VmSym2["Slice"] = 159] = "Slice";
    VmSym2[VmSym2["Slicer"] = 160] = "Slicer";
    VmSym2[VmSym2["Slp"] = 161] = "Slp";
    VmSym2[VmSym2["Smooth"] = 162] = "Smooth";
    VmSym2[VmSym2["Smootherstep"] = 163] = "Smootherstep";
    VmSym2[VmSym2["Smoothstep"] = 164] = "Smoothstep";
    VmSym2[VmSym2["Snap"] = 165] = "Snap";
    VmSym2[VmSym2["Solo"] = 166] = "Solo";
    VmSym2[VmSym2["Speak"] = 167] = "Speak";
    VmSym2[VmSym2["Speed"] = 168] = "Speed";
    VmSym2[VmSym2["Sqr"] = 169] = "Sqr";
    VmSym2[VmSym2["Sqrt"] = 170] = "Sqrt";
    VmSym2[VmSym2["Square"] = 171] = "Square";
    VmSym2[VmSym2["Step"] = 172] = "Step";
    VmSym2[VmSym2["ArrayStep"] = 173] = "ArrayStep";
    VmSym2[VmSym2["ArrayWalk"] = 174] = "ArrayWalk";
    VmSym2[VmSym2["ArrayRandom"] = 175] = "ArrayRandom";
    VmSym2[VmSym2["Reverse"] = 176] = "Reverse";
    VmSym2[VmSym2["Shuffle"] = 177] = "Shuffle";
    VmSym2[VmSym2["Sum"] = 178] = "Sum";
    VmSym2[VmSym2["Sustain"] = 179] = "Sustain";
    VmSym2[VmSym2["Swing"] = 180] = "Swing";
    VmSym2[VmSym2["T"] = 181] = "T";
    VmSym2[VmSym2["Tan"] = 182] = "Tan";
    VmSym2[VmSym2["Tanh"] = 183] = "Tanh";
    VmSym2[VmSym2["Threshold"] = 184] = "Threshold";
    VmSym2[VmSym2["Timeline"] = 185] = "Timeline";
    VmSym2[VmSym2["Transpose"] = 186] = "Transpose";
    VmSym2[VmSym2["Tram"] = 187] = "Tram";
    VmSym2[VmSym2["Tri"] = 188] = "Tri";
    VmSym2[VmSym2["Trig"] = 189] = "Trig";
    VmSym2[VmSym2["Trunc"] = 190] = "Trunc";
    VmSym2[VmSym2["Tune"] = 191] = "Tune";
    VmSym2[VmSym2["Up"] = 192] = "Up";
    VmSym2[VmSym2["Velvet"] = 193] = "Velvet";
    VmSym2[VmSym2["Voices"] = 194] = "Voices";
    VmSym2[VmSym2["Wet"] = 195] = "Wet";
    VmSym2[VmSym2["White"] = 196] = "White";
    VmSym2[VmSym2["Width"] = 197] = "Width";
    VmSym2[VmSym2["Wrap"] = 198] = "Wrap";
    VmSym2[VmSym2["X"] = 199] = "X";
    VmSym2[VmSym2["Y"] = 200] = "Y";
    VmSym2[VmSym2["Zerox"] = 201] = "Zerox";
    VmSym2[VmSym2["PitchShift"] = 202] = "PitchShift";
    VmSym2[VmSym2["Record"] = 203] = "Record";
    return VmSym2;
  })(VmSym || {});
  const builtinSyms = {
    out: VmSym.Out,
    solo: VmSym.Solo,
    post: VmSym.Post,
    sine: VmSym.Sine,
    tri: VmSym.Tri,
    saw: VmSym.Saw,
    ramp: VmSym.Ramp,
    sqr: VmSym.Sqr,
    pwm: VmSym.Pwm,
    phasor: VmSym.Phasor,
    impulse: VmSym.Impulse,
    inc: VmSym.Inc,
    zerox: VmSym.Zerox,
    pitchshift: VmSym.PitchShift,
    record: VmSym.Record,
    ad: VmSym.Ad,
    adsr: VmSym.Adsr,
    envfollow: VmSym.Envfollow,
    mini: VmSym.Mini,
    analyser: VmSym.Analyser,
    amplitude: VmSym.Analyser,
    waveform: VmSym.Analyser,
    spectrum: VmSym.Analyser,
    level: VmSym.Analyser,
    print: VmSym.Analyser,
    compressor: VmSym.Compressor,
    expander: VmSym.Expander,
    gate: VmSym.Gate,
    limiter: VmSym.Limiter,
    t: VmSym.T,
    co: VmSym.Co,
    play: VmSym.Play,
    playPick: VmSym.PlayPick,
    timeline: VmSym.Timeline,
    sampler: VmSym.Sampler,
    slicer: VmSym.Slicer,
    every: VmSym.Every,
    at: VmSym.At,
    note: VmSym.Note,
    degree: VmSym.Degree,
    getScale: VmSym.GetScale,
    map: VmSym.Map,
    sum: VmSym.Sum,
    avg: VmSym.Avg,
    arrayStep: VmSym.ArrayStep,
    arrayWalk: VmSym.ArrayWalk,
    arrayRandom: VmSym.ArrayRandom,
    reverse: VmSym.Reverse,
    shuffle: VmSym.Shuffle,
    oversample: VmSym.Oversample,
    glide: VmSym.Glide,
    slew: VmSym.Slew,
    lp: VmSym.Lp,
    hp: VmSym.Hp,
    bp: VmSym.Bp,
    bs: VmSym.Bs,
    ls: VmSym.Ls,
    hs: VmSym.Hs,
    peak: VmSym.Peak,
    ap: VmSym.Ap,
    slp: VmSym.Slp,
    shp: VmSym.Shp,
    sbp: VmSym.Sbp,
    sbs: VmSym.Sbs,
    speak: VmSym.Speak,
    sap: VmSym.Sap,
    sah: VmSym.Sah,
    mlp: VmSym.Mlp,
    mhp: VmSym.Mhp,
    diodeladder: VmSym.DiodeLadder,
    olp: VmSym.Olp,
    ohp: VmSym.Ohp,
    k: VmSym.K,
    euclid: VmSym.Euclid,
    lfosine: VmSym.LfoSine,
    lfotri: VmSym.LfoTri,
    lfosaw: VmSym.LfoSaw,
    lforamp: VmSym.LfoRamp,
    lfosqr: VmSym.LfoSqr,
    lfosah: VmSym.LfoSah,
    white: VmSym.White,
    gauss: VmSym.Gauss,
    pink: VmSym.Pink,
    brown: VmSym.Brown,
    smooth: VmSym.Smooth,
    fractal: VmSym.Fractal,
    random: VmSym.Random,
    delay: VmSym.Delay,
    freeverb: VmSym.Freeverb,
    velvet: VmSym.Velvet,
    dattorro: VmSym.Dattorro,
    fdn: VmSym.Fdn,
    dc: VmSym.Dc,
    // Runtime directive globals (stable ids so VM can provide defaults)
    tune: VmSym.Tune,
    octave: VmSym.Octave,
    transpose: VmSym.Transpose,
    tram: VmSym.Tram,
    scale: VmSym.Scale,
    // Named args for out() and solo()
    L: VmSym.L,
    R: VmSym.R,
    // Named args for post()
    cb: VmSym.Cb,
    callback: VmSym.Cb,
    // Named args for adsr()
    attack: VmSym.Attack,
    decay: VmSym.Decay,
    sustain: VmSym.Sustain,
    release: VmSym.Release,
    trig: VmSym.Trig,
    // Named args for every()
    // NOTE: `bar` symbol id is shared with `at()`'s `bar` named arg.
    prob: VmSym.Prob,
    swing: VmSym.Swing,
    offset: VmSym.Offset,
    // Named args for pwm()
    width: VmSym.Width,
    seed: VmSym.Seed,
    // Named args for at()
    bar: VmSym.Bar,
    // NOTE: `every` key for at() reuses the builtin `every` symbol id (12).
    // Named args for lp()
    cutoff: VmSym.Cut,
    q: VmSym.Q,
    in: VmSym.In,
    // Named args for slew()
    up: VmSym.Up,
    down: VmSym.Down,
    exponent: VmSym.Exponent,
    // Named args for sampler() and slicer()
    speed: VmSym.Speed,
    repeat: VmSym.Repeat,
    slice: VmSym.Slice,
    threshold: VmSym.Threshold,
    ratio: VmSym.Ratio,
    knee: VmSym.Knee,
    hold: VmSym.Hold,
    gain: VmSym.Gain,
    // Named args for analyser()
    "%index": VmSym.Index,
    // Named args for timeline()
    pattern: VmSym.Pattern,
    color: VmSym.Color,
    // Named args for sampler()
    sample: VmSym.Sample,
    // Named args for note()
    midi: VmSym.Midi,
    // Named args for analyser (alternative)
    signal: VmSym.Signal,
    key: VmSym.Key,
    "%key": VmSym.Key,
    // Named args for mini/play
    hz: VmSym.Hz,
    seq: VmSym.Seq,
    voices: VmSym.Voices,
    // Named args for smooth()/fractal()
    rate: VmSym.Rate,
    curve: VmSym.Curve,
    octaves: VmSym.Octaves,
    seconds: VmSym.Seconds,
    feedback: VmSym.Feedback,
    size: VmSym.Size,
    roomSize: VmSym.Roomsize,
    roomsize: VmSym.Roomsize,
    damping: VmSym.Damping,
    wet: VmSym.Wet,
    dry: VmSym.Dry,
    preDelay: VmSym.PreDelay,
    bandwidth: VmSym.Bandwidth,
    inputDiffusion1: VmSym.InputDiffusion1,
    inputDiffusion2: VmSym.InputDiffusion2,
    decayDiffusion1: VmSym.DecayDiffusion1,
    decayDiffusion2: VmSym.DecayDiffusion2,
    excursionRate: VmSym.ExcursionRate,
    excursionDepth: VmSym.ExcursionDepth,
    hfDecay: VmSym.HfDecay,
    modDepth: VmSym.ModDepth,
    // Math functions
    sin: VmSym.Sin,
    cos: VmSym.Cos,
    tan: VmSym.Tan,
    asin: VmSym.Asin,
    acos: VmSym.Acos,
    tanh: VmSym.Tanh,
    atan: VmSym.Atan,
    abs: VmSym.Abs,
    sqrt: VmSym.Sqrt,
    square: VmSym.Square,
    cube: VmSym.Cube,
    hypot: VmSym.Hypot,
    log: VmSym.Log,
    exp: VmSym.Exp,
    log10: VmSym.Log10,
    log2: VmSym.Log2,
    exp2: VmSym.Exp2,
    min: VmSym.Min,
    max: VmSym.Max,
    clamp: VmSym.Clamp,
    wrap: VmSym.Wrap,
    mod: VmSym.Mod,
    pingpong: VmSym.Pingpong,
    fold: VmSym.Fold,
    floor: VmSym.Floor,
    ceil: VmSym.Ceil,
    round: VmSym.Round,
    trunc: VmSym.Trunc,
    snap: VmSym.Snap,
    fract: VmSym.Fract,
    sign: VmSym.Sign,
    lerp: VmSym.Lerp,
    smoothstep: VmSym.Smoothstep,
    smootherstep: VmSym.Smootherstep,
    step: VmSym.Step,
    heaviside: VmSym.Heaviside,
    select: VmSym.Select,
    isnan: VmSym.Isnan,
    isinf: VmSym.Isinf,
    safediv: VmSym.Safediv,
    // Named args for math functions
    lo: VmSym.Lo,
    hi: VmSym.Hi,
    a: VmSym.A,
    b: VmSym.B,
    x: VmSym.X,
    y: VmSym.Y,
    edge: VmSym.Edge,
    edge0: VmSym.Edge0,
    edge1: VmSym.Edge1,
    cond: VmSym.Cond
  };
  const BUILTIN_NAMES = /* @__PURE__ */ new Set([
    ...Object.keys(builtinSyms),
    ...Object.keys(functionDefinitions).map((name) => name.startsWith(".") ? name.slice(1) : name)
  ]);
  const makeError = (ctx, loc) => ({
    message: "Undefined variable",
    line: loc.line,
    column: loc.column,
    length: Math.max(1, loc.length),
    code: lineText(ctx.src, loc.line)
  });
  const isDefined = (ctx, name) => {
    for (let i = ctx.scopeStack.length - 1; i >= 0; i--) {
      if (ctx.scopeStack[i].has(name)) return true;
    }
    return false;
  };
  const defineName = (ctx, name) => {
    if (isDefined(ctx, name)) return;
    ctx.scopeStack[ctx.scopeStack.length - 1].add(name);
  };
  const withScope = (ctx, fn) => {
    ctx.scopeStack.push(/* @__PURE__ */ new Set());
    try {
      fn();
    } finally {
      ctx.scopeStack.pop();
    }
  };
  const definePattern = (ctx, pattern) => {
    if (pattern.kind === "obj") {
      for (const key of pattern.keys) defineName(ctx, key);
      return;
    }
    for (const item of pattern.items) defineName(ctx, item);
  };
  const visitBranch = (ctx, branch) => {
    if ("kind" in branch && branch.kind === "block") {
      visitStmt$1(ctx, branch);
      return;
    }
    visitExpr$1(ctx, branch);
  };
  const visitAssignableDefineOnly = (ctx, target) => {
    if (target.kind === "ident") {
      defineName(ctx, target.name);
      return;
    }
    if (target.kind === "member") {
      visitExpr$1(ctx, target.object);
      if (target.computed) visitExpr$1(ctx, target.index);
    }
  };
  const visitArg = (ctx, arg) => {
    if (arg.kind === "pos") {
      visitExpr$1(ctx, arg.value);
      return;
    }
    if (arg.kind === "named") {
      visitExpr$1(ctx, arg.value);
      return;
    }
    if (!isDefined(ctx, arg.name)) ctx.errors.push(makeError(ctx, arg.loc));
  };
  const visitExpr$1 = (ctx, expr) => {
    switch (expr.kind) {
      case "number":
      case "string":
      case "bool":
      case "null":
      case "undefined":
      case "pipe_value":
        return;
      case "ident":
        if (!isDefined(ctx, expr.name)) ctx.errors.push(makeError(ctx, expr.loc));
        return;
      case "array":
        for (const item of expr.items) visitExpr$1(ctx, item);
        return;
      case "object":
        for (const prop of expr.props) visitExpr$1(ctx, prop.value);
        return;
      case "member":
        visitExpr$1(ctx, expr.object);
        if (expr.computed) visitExpr$1(ctx, expr.index);
        return;
      case "call":
        visitExpr$1(ctx, expr.callee);
        expr.args.forEach((arg) => visitArg(ctx, arg));
        return;
      case "unary":
        visitExpr$1(ctx, expr.expr);
        return;
      case "postfix":
        visitExpr$1(ctx, expr.expr);
        return;
      case "binary":
        visitExpr$1(ctx, expr.left);
        visitExpr$1(ctx, expr.right);
        return;
      case "assign":
        if (expr.op === "=" && expr.target.kind === "ident") {
          visitExpr$1(ctx, expr.value);
          defineName(ctx, expr.target.name);
          return;
        }
        if (expr.op === "=") {
          visitAssignableDefineOnly(ctx, expr.target);
          visitExpr$1(ctx, expr.value);
          return;
        }
        visitExpr$1(ctx, expr.target);
        visitExpr$1(ctx, expr.value);
        return;
      case "if":
        visitExpr$1(ctx, expr.test);
        visitBranch(ctx, expr.then);
        if (expr.else) visitBranch(ctx, expr.else);
        return;
      case "func":
        withScope(ctx, () => {
          for (const param of expr.params) defineName(ctx, param.name);
          for (const param of expr.params) if (param.default) visitExpr$1(ctx, param.default);
          if ("kind" in expr.body && expr.body.kind === "block") visitStmt$1(ctx, expr.body);
          else visitExpr$1(ctx, expr.body);
        });
        return;
    }
  };
  const visitStmt$1 = (ctx, stmt) => {
    switch (stmt.kind) {
      case "block":
        withScope(ctx, () => {
          for (const child of stmt.body) visitStmt$1(ctx, child);
        });
        return;
      case "expr_stmt":
        visitExpr$1(ctx, stmt.expr);
        return;
      case "destructure":
        visitExpr$1(ctx, stmt.value);
        definePattern(ctx, stmt.pattern);
        return;
      case "label":
        visitStmt$1(ctx, stmt.stmt);
        return;
      case "for":
        withScope(ctx, () => {
          const head = stmt.head;
          if (head.kind === "c_style") {
            if (head.init) visitExpr$1(ctx, head.init);
            if (head.test) visitExpr$1(ctx, head.test);
            if (head.update) visitExpr$1(ctx, head.update);
            visitStmt$1(ctx, stmt.body);
            return;
          }
          visitExpr$1(ctx, head.iterable);
          defineName(ctx, head.value);
          if (head.index) defineName(ctx, head.index);
          if (head.length) defineName(ctx, head.length);
          visitStmt$1(ctx, stmt.body);
        });
        return;
      case "while":
        visitExpr$1(ctx, stmt.test);
        visitStmt$1(ctx, stmt.body);
        return;
      case "do_while":
        visitStmt$1(ctx, stmt.body);
        visitExpr$1(ctx, stmt.test);
        return;
      case "switch":
        visitExpr$1(ctx, stmt.test);
        for (const c of stmt.cases) {
          if (c.test) visitExpr$1(ctx, c.test);
          for (const s of c.body) visitStmt$1(ctx, s);
        }
        return;
      case "try":
        visitStmt$1(ctx, stmt.body);
        if (stmt.catchBody) {
          const catchBody = stmt.catchBody;
          withScope(ctx, () => {
            if (stmt.catchName) defineName(ctx, stmt.catchName);
            for (const s of catchBody.body) visitStmt$1(ctx, s);
          });
        }
        if (stmt.finallyBody) visitStmt$1(ctx, stmt.finallyBody);
        return;
      case "throw":
        visitExpr$1(ctx, stmt.value);
        return;
      case "return":
        if (stmt.value) visitExpr$1(ctx, stmt.value);
        return;
      case "break":
      case "continue":
        return;
    }
  };
  function checkUndefinedVariableErrors(src, program) {
    const errors = [];
    const scopeStack = [new Set(BUILTIN_NAMES)];
    const ctx = {
      src,
      errors,
      scopeStack
    };
    for (const stmt of program.body) visitStmt$1(ctx, stmt);
    return errors;
  }
  function visitExpr(expr, visitors, ctx) {
    if (!expr) return;
    for (const visitor of visitors) {
      visitor.visitExpr?.(expr, ctx);
    }
    if (expr.kind === "call") {
      for (const visitor of visitors) {
        visitor.visitCall?.(expr, ctx);
      }
      visitExpr(expr.callee, visitors, ctx);
      for (const arg of expr.args ?? []) {
        if (arg.kind === "pos" || arg.kind === "named") visitExpr(arg.value, visitors, ctx);
      }
      return;
    }
    if (expr.kind === "binary") {
      visitExpr(expr.left, visitors, ctx);
      visitExpr(expr.right, visitors, ctx);
      return;
    }
    if (expr.kind === "assign") {
      visitExpr(expr.target, visitors, ctx);
      visitExpr(expr.value, visitors, ctx);
      return;
    }
    if (expr.kind === "unary" || expr.kind === "postfix") {
      visitExpr(expr.expr, visitors, ctx);
      return;
    }
    if (expr.kind === "member") {
      visitExpr(expr.object, visitors, ctx);
      if (expr.computed) visitExpr(expr.index, visitors, ctx);
      return;
    }
    if (expr.kind === "array") {
      for (const item of expr.items ?? []) visitExpr(item, visitors, ctx);
      return;
    }
    if (expr.kind === "object") {
      for (const prop of expr.props ?? []) visitExpr(prop.value, visitors, ctx);
      return;
    }
    if (expr.kind === "if") {
      visitExpr(expr.test, visitors, ctx);
      if (expr.then?.kind === "block") visitStmt(expr.then, visitors, ctx);
      else visitExpr(expr.then, visitors, ctx);
      if (expr.else) {
        if (expr.else.kind === "block") visitStmt(expr.else, visitors, ctx);
        else visitExpr(expr.else, visitors, ctx);
      }
      return;
    }
    if (expr.kind === "func") {
      const bodyIsTransformed = expr.body?.kind === "block" && expr.body.body?.[0]?.kind === "expr_stmt" && expr.body.body[0].expr?.kind === "assign" && expr.body.body[0].expr.value?.kind === "if" && expr.body.body[0].expr.value.__noBranchMark === true;
      if (!bodyIsTransformed) {
        for (const param of expr.params ?? []) {
          if (param.default) visitExpr(param.default, visitors, ctx);
        }
      }
      if (expr.body?.kind === "block") visitStmt(expr.body, visitors, ctx);
      else visitExpr(expr.body, visitors, ctx);
      return;
    }
  }
  function visitStmt(stmt, visitors, ctx) {
    if (!stmt) return;
    for (const visitor of visitors) {
      visitor.visitStmt?.(stmt, ctx);
    }
    if (stmt.kind === "expr_stmt") {
      visitExpr(stmt.expr, visitors, ctx);
      return;
    }
    if (stmt.kind === "block") {
      for (const s of stmt.body ?? []) visitStmt(s, visitors, ctx);
      return;
    }
    if (stmt.kind === "for") {
      if (stmt.head?.kind === "c_style") {
        if (stmt.head.init) visitExpr(stmt.head.init, visitors, ctx);
        if (stmt.head.test) visitExpr(stmt.head.test, visitors, ctx);
        if (stmt.head.update) visitExpr(stmt.head.update, visitors, ctx);
      } else {
        visitExpr(stmt.head?.iterable, visitors, ctx);
      }
      visitStmt(stmt.body, visitors, ctx);
      return;
    }
    if (stmt.kind === "while" || stmt.kind === "do_while") {
      visitExpr(stmt.test, visitors, ctx);
      visitStmt(stmt.body, visitors, ctx);
      return;
    }
    if (stmt.kind === "switch") {
      visitExpr(stmt.test, visitors, ctx);
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test, visitors, ctx);
        for (const s of c.body ?? []) visitStmt(s, visitors, ctx);
      }
      return;
    }
    if (stmt.kind === "try") {
      visitStmt(stmt.body, visitors, ctx);
      if (stmt.catchBody) visitStmt(stmt.catchBody, visitors, ctx);
      if (stmt.finallyBody) visitStmt(stmt.finallyBody, visitors, ctx);
      return;
    }
    if (stmt.kind === "throw") {
      visitExpr(stmt.value, visitors, ctx);
      return;
    }
    if (stmt.kind === "return") {
      if (stmt.value) visitExpr(stmt.value, visitors, ctx);
      return;
    }
    if (stmt.kind === "label") {
      visitStmt(stmt.stmt, visitors, ctx);
      return;
    }
    if (stmt.kind === "destructure") {
      visitExpr(stmt.value, visitors, ctx);
      return;
    }
  }
  function walkAst(program, visitors, ctx = {}) {
    for (const visitor of visitors) {
      visitor.visitProgram?.(program, ctx);
    }
    for (const stmt of program.body) visitStmt(stmt, visitors, ctx);
  }
  const VM_MAGIC = -1;
  var VmOp = /* @__PURE__ */ ((VmOp2) => {
    VmOp2[VmOp2["End"] = 0] = "End";
    VmOp2[VmOp2["Nop"] = 1] = "Nop";
    VmOp2[VmOp2["PushNum"] = 2] = "PushNum";
    VmOp2[VmOp2["PushNumSmoothed"] = 24] = "PushNumSmoothed";
    VmOp2[VmOp2["PushBool"] = 3] = "PushBool";
    VmOp2[VmOp2["PushNull"] = 4] = "PushNull";
    VmOp2[VmOp2["PushUndef"] = 5] = "PushUndef";
    VmOp2[VmOp2["PushSym"] = 6] = "PushSym";
    VmOp2[VmOp2["Pop"] = 7] = "Pop";
    VmOp2[VmOp2["Dup"] = 8] = "Dup";
    VmOp2[VmOp2["Load"] = 9] = "Load";
    VmOp2[VmOp2["Store"] = 10] = "Store";
    VmOp2[VmOp2["Unary"] = 11] = "Unary";
    VmOp2[VmOp2["Binary"] = 12] = "Binary";
    VmOp2[VmOp2["Call"] = 13] = "Call";
    VmOp2[VmOp2["Jump"] = 14] = "Jump";
    VmOp2[VmOp2["JumpIfFalse"] = 15] = "JumpIfFalse";
    VmOp2[VmOp2["Return"] = 16] = "Return";
    VmOp2[VmOp2["Throw"] = 17] = "Throw";
    VmOp2[VmOp2["EnterScope"] = 18] = "EnterScope";
    VmOp2[VmOp2["ExitScope"] = 19] = "ExitScope";
    VmOp2[VmOp2["Func"] = 20] = "Func";
    VmOp2[VmOp2["Array"] = 21] = "Array";
    VmOp2[VmOp2["GetIndex"] = 22] = "GetIndex";
    VmOp2[VmOp2["SetIndex"] = 23] = "SetIndex";
    VmOp2[VmOp2["GetIndex2"] = 25] = "GetIndex2";
    VmOp2[VmOp2["Branch"] = 26] = "Branch";
    VmOp2[VmOp2["Len"] = 27] = "Len";
    return VmOp2;
  })(VmOp || {});
  var VmUnary = /* @__PURE__ */ ((VmUnary2) => {
    VmUnary2[VmUnary2["Neg"] = 0] = "Neg";
    VmUnary2[VmUnary2["Not"] = 1] = "Not";
    VmUnary2[VmUnary2["BitNot"] = 2] = "BitNot";
    return VmUnary2;
  })(VmUnary || {});
  var VmBinary = /* @__PURE__ */ ((VmBinary2) => {
    VmBinary2[VmBinary2["Add"] = 0] = "Add";
    VmBinary2[VmBinary2["Sub"] = 1] = "Sub";
    VmBinary2[VmBinary2["Mul"] = 2] = "Mul";
    VmBinary2[VmBinary2["Div"] = 3] = "Div";
    VmBinary2[VmBinary2["Mod"] = 4] = "Mod";
    VmBinary2[VmBinary2["Pow"] = 5] = "Pow";
    VmBinary2[VmBinary2["Eq"] = 6] = "Eq";
    VmBinary2[VmBinary2["StrictEq"] = 7] = "StrictEq";
    VmBinary2[VmBinary2["Lt"] = 8] = "Lt";
    VmBinary2[VmBinary2["Lte"] = 9] = "Lte";
    VmBinary2[VmBinary2["Gt"] = 10] = "Gt";
    VmBinary2[VmBinary2["Gte"] = 11] = "Gte";
    VmBinary2[VmBinary2["BitOr"] = 12] = "BitOr";
    VmBinary2[VmBinary2["BitXor"] = 13] = "BitXor";
    VmBinary2[VmBinary2["BitAnd"] = 14] = "BitAnd";
    VmBinary2[VmBinary2["Shl"] = 15] = "Shl";
    VmBinary2[VmBinary2["Shr"] = 16] = "Shr";
    VmBinary2[VmBinary2["Ushr"] = 17] = "Ushr";
    return VmBinary2;
  })(VmBinary || {});
  function encoderError(src, message) {
    return { message, line: 1, column: 1, length: 1, code: lineText(src, 1) };
  }
  function unaryCode(opName) {
    if (opName === "-") return VmUnary.Neg;
    if (opName === "!") return VmUnary.Not;
    if (opName === "~") return VmUnary.BitNot;
    return null;
  }
  function binaryCode(opName) {
    if (opName === "+") return VmBinary.Add;
    if (opName === "-") return VmBinary.Sub;
    if (opName === "*") return VmBinary.Mul;
    if (opName === "/") return VmBinary.Div;
    if (opName === "%") return VmBinary.Mod;
    if (opName === "**") return VmBinary.Pow;
    if (opName === "==") return VmBinary.Eq;
    if (opName === "===") return VmBinary.StrictEq;
    if (opName === "<") return VmBinary.Lt;
    if (opName === "<=") return VmBinary.Lte;
    if (opName === ">") return VmBinary.Gt;
    if (opName === ">=") return VmBinary.Gte;
    if (opName === "|") return VmBinary.BitOr;
    if (opName === "^") return VmBinary.BitXor;
    if (opName === "&") return VmBinary.BitAnd;
    if (opName === "<<") return VmBinary.Shl;
    if (opName === ">>") return VmBinary.Shr;
    if (opName === ">>>") return VmBinary.Ushr;
    return null;
  }
  function buildLineStarts$1(src) {
    const starts = [0];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === "\n") starts.push(i + 1);
    }
    return starts;
  }
  function locToIndex(lineStarts, loc) {
    const lineStart = lineStarts[loc.line - 1] ?? 0;
    return lineStart + (loc.column - 1);
  }
  function locError(src, loc, message) {
    return {
      message,
      line: loc.line,
      column: loc.column,
      length: Math.max(1, loc.length),
      code: lineText(src, loc.line)
    };
  }
  function tryEvalConstNumber(expr) {
    if (!expr) return null;
    if (expr.kind === "number") return Number(expr.value ?? expr.raw ?? 0);
    if (expr.kind === "unary") {
      const v = tryEvalConstNumber(expr.expr);
      if (v == null) return null;
      if (expr.op === "-") return -v;
      if (expr.op === "+") return v;
      return null;
    }
    if (expr.kind === "binary") {
      const a = tryEvalConstNumber(expr.left);
      const b = tryEvalConstNumber(expr.right);
      if (a == null || b == null) return null;
      if (expr.op === "+") return a + b;
      if (expr.op === "-") return a - b;
      if (expr.op === "*") return a * b;
      if (expr.op === "/") return a / b;
      if (expr.op === "%") return a % b;
      if (expr.op === "**") return a ** b;
      return null;
    }
    return null;
  }
  function getPosArgs(call) {
    return (call.args ?? []).filter((a) => a?.kind === "pos");
  }
  function findNamedArg(call, name) {
    for (const a of call.args ?? []) {
      if (a?.kind === "named" && a.name === name) return a;
    }
    return null;
  }
  function getPosArg$1(call, posIndex) {
    const posArgs = getPosArgs(call);
    return posArgs[posIndex] ?? null;
  }
  function getPosArgValue$1(call, posIndex) {
    return getPosArg$1(call, posIndex)?.value ?? null;
  }
  function indexFromLoc(src, lineStarts, loc) {
    const line = Math.max(1, loc.line | 0);
    const col = Math.max(1, loc.column | 0);
    const idx = locToIndex(lineStarts, { line, column: col });
    return Math.max(0, Math.min(src.length, idx));
  }
  function findMatchingParen(src, openIdx) {
    let depth = 0;
    for (let i = openIdx; i < src.length; i++) {
      const c = src[i];
      const n = src[i + 1];
      if (c === "/" && n === "/") {
        i += 2;
        while (i < src.length && src[i] !== "\n") i++;
        i--;
        continue;
      }
      if (c === "/" && n === "*") {
        i += 2;
        while (i + 1 < src.length && !(src[i] === "*" && src[i + 1] === "/")) i++;
        i++;
        continue;
      }
      if (c === "'" || c === '"') {
        const q = c;
        i++;
        while (i < src.length) {
          const ch = src[i];
          if (ch === "\\") {
            i += 2;
            continue;
          }
          if (ch === q) break;
          i++;
        }
        continue;
      }
      if (c === "(") depth++;
      else if (c === ")") {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
  function computeAboveLoc(src, lineStarts, calleeLoc) {
    const startIdx = indexFromLoc(src, lineStarts, calleeLoc);
    const openIdx = src.indexOf("(", startIdx);
    if (openIdx < 0) return { ...calleeLoc };
    const closeIdx = findMatchingParen(src, openIdx);
    if (closeIdx < 0) return { ...calleeLoc };
    let col = calleeLoc.column | 0;
    let maxRight = Math.max(1, col);
    for (let i = startIdx; i <= closeIdx && i < src.length; i++) {
      const ch = src[i];
      if (ch === "\n") {
        col = 1;
        continue;
      }
      maxRight = Math.max(maxRight, col);
      col++;
    }
    const length = Math.max(1, maxRight - (calleeLoc.column | 0) + 1);
    return { line: calleeLoc.line, column: calleeLoc.column, length };
  }
  function buildLineStartsForLocs(src) {
    return buildLineStarts$1(src);
  }
  function getIndexFromCall(call) {
    const namedIdx = findNamedArg(call, "%index");
    if (namedIdx?.value) return tryEvalConstNumber(namedIdx.value) ?? 0;
    const posArgs = getPosArgs(call);
    if (posArgs.length >= 2) {
      const idx = tryEvalConstNumber(posArgs[1]?.value);
      if (idx != null) return idx;
    }
    return 0;
  }
  function resolveParamName(raw, validNames) {
    const exact = validNames.find((p) => p === raw);
    if (exact) return exact;
    const lower = raw.toLowerCase();
    const ci = validNames.find((p) => p.toLowerCase() === lower);
    if (ci) return ci;
    const prefix = validNames.filter((p) => p.startsWith(raw));
    if (prefix.length === 1) return prefix[0];
    return null;
  }
  function createAnalyserVisitor(src, refs) {
    const lineStarts = buildLineStartsForLocs(src);
    const handledLocations = /* @__PURE__ */ new Set();
    const isAnalyserName = (name) => {
      return name === "analyser" || name === "amplitude" || name === "waveform" || name === "spectrum" || name === "level" || name === "print";
    };
    return {
      visitCall(expr) {
        if (expr.callee?.kind === "ident" && (expr.callee?.name === "out" || expr.callee?.name === "solo")) {
          const audioArg = getPosArgValue$1(expr, 0);
          if (audioArg?.kind === "call" && audioArg.callee?.kind === "ident" && isAnalyserName(audioArg.callee?.name)) {
            const analyserIndex = getIndexFromCall(audioArg);
            const calleeLoc = audioArg.callee.loc ?? audioArg.loc;
            const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc);
            const locKey = `${calleeLoc?.line}_${calleeLoc?.column}`;
            if (!handledLocations.has(locKey)) {
              handledLocations.add(locKey);
              refs.push({
                kind: audioArg.callee.name,
                analyserIndex,
                loc: calleeLoc,
                aboveLoc,
                callLoc: audioArg.loc
              });
            }
          }
        }
        if (expr.callee?.kind === "ident" && isAnalyserName(expr.callee?.name)) {
          const analyserIndex = getIndexFromCall(expr);
          const calleeLoc = expr.callee.loc ?? expr.loc;
          const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc);
          const locKey = `${calleeLoc?.line}_${calleeLoc?.column}`;
          if (!handledLocations.has(locKey)) {
            handledLocations.add(locKey);
            refs.push({
              kind: expr.callee.name,
              analyserIndex,
              loc: calleeLoc,
              aboveLoc,
              callLoc: expr.loc
            });
          }
        }
      }
    };
  }
  function createBpmVisitor(src, errors, result) {
    return {
      visitStmt(stmt) {
        if (stmt?.kind !== "expr_stmt") return;
        const expr = stmt.expr;
        if (!expr || expr.kind !== "assign") return;
        if (expr.target?.kind !== "ident" || expr.target?.name !== "bpm") return;
        if (expr.op !== "=") {
          errors.push(locError(src, expr.loc ?? stmt.loc, "Only `bpm=<number>` is supported"));
          return;
        }
        const v = expr.value;
        if (!v || v.kind !== "number") {
          errors.push(locError(src, expr.loc ?? stmt.loc, "`bpm` must be assigned a number literal"));
          return;
        }
        const n = Number(v.value ?? 0);
        if (!Number.isFinite(n) || n <= 0) {
          errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, "`bpm` must be a positive finite number"));
          return;
        }
        result.bpm = n;
      }
    };
  }
  function createBarsVisitor(src, errors, result) {
    return {
      visitStmt(stmt) {
        if (stmt?.kind !== "expr_stmt") return;
        const expr = stmt.expr;
        if (!expr || expr.kind !== "assign") return;
        if (expr.target?.kind !== "ident" || expr.target?.name !== "bars") return;
        if (expr.op !== "=") {
          errors.push(locError(src, expr.loc ?? stmt.loc, "Only `bars=<number>` is supported"));
          return;
        }
        const v = expr.value;
        if (!v || v.kind !== "number") {
          errors.push(locError(src, expr.loc ?? stmt.loc, "`bars` must be assigned a number literal"));
          return;
        }
        const n = Number(v.value ?? 0);
        if (!Number.isFinite(n) || n <= 0) {
          errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, "`bars` must be a positive finite number"));
          return;
        }
        if (!Number.isInteger(n)) {
          errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, "`bars` must be an integer"));
          return;
        }
        result.bars = n;
      }
    };
  }
  function getFilterType(calleeName) {
    switch (calleeName) {
      case "lp":
        return "lp";
      case "hp":
        return "hp";
      case "bp":
        return "bp";
      case "bs":
        return "bs";
      case "ls":
        return "ls";
      case "hs":
        return "hs";
      case "peak":
        return "peak";
      case "ap":
        return "ap";
      case "slp":
        return "slp";
      case "shp":
        return "shp";
      case "sbp":
        return "sbp";
      case "sbs":
        return "sbs";
      case "speak":
        return "speak";
      case "sap":
        return "sap";
      case "mlp":
        return "mlp";
      case "mhp":
        return "mhp";
      case "diodeladder":
        return "diodeladder";
      case "olp":
        return "olp";
      case "ohp":
        return "ohp";
      default:
        return null;
    }
  }
  function createFilterNumberLiteralsVisitor(refs) {
    function collectNumbersFromExpr(expr) {
      if (!expr) return;
      if (expr.kind === "number") {
        refs.push({
          line: expr.loc.line,
          column: expr.loc.column,
          length: expr.loc.length,
          widgetLength: expr.loc.length,
          value: Number(expr.value ?? 0),
          min: 20,
          max: 2e4,
          precision: 0
        });
        return;
      }
      if (expr.kind === "binary") {
        collectNumbersFromExpr(expr.left);
        if (expr.op !== "**") {
          collectNumbersFromExpr(expr.right);
        }
        return;
      }
      if (expr.kind === "unary" || expr.kind === "postfix") {
        collectNumbersFromExpr(expr.expr);
        return;
      }
      if (expr.kind === "member") {
        collectNumbersFromExpr(expr.object);
        if (expr.computed) collectNumbersFromExpr(expr.index);
        return;
      }
      if (expr.kind === "array") {
        for (const it of expr.items ?? []) collectNumbersFromExpr(it);
        return;
      }
      if (expr.kind === "object") {
        for (const p of expr.props ?? []) collectNumbersFromExpr(p.value);
        return;
      }
    }
    return {
      visitCall(expr) {
        const calleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
        const filterType = getFilterType(calleeName ?? "");
        if (filterType) {
          const secondArg = expr.args?.[1];
          if (secondArg && (secondArg.kind === "pos" || secondArg.kind === "named")) {
            collectNumbersFromExpr(secondArg.value);
          }
        }
      }
    };
  }
  const KNOB_CONFIGS = [
    // Compressor
    {
      functionNames: ["compressor"],
      hasInputParam: true,
      hasKeyParam: true,
      knobParams: [
        { name: "attack", defaultValue: 0.01, min: 1e-4, max: 1, mode: "exp2", precision: 4 },
        { name: "release", defaultValue: 0.1, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "threshold", defaultValue: -24, min: -60, max: 0, mode: "linear", precision: 0, stepPerPx: 0.15 },
        { name: "ratio", defaultValue: 4, min: 1, max: 20, mode: "linear", precision: 2, stepPerPx: 0.05 },
        { name: "knee", defaultValue: 6, min: 0, max: 40, mode: "linear", precision: 1, stepPerPx: 0.2 }
      ]
    },
    // Expander
    {
      functionNames: ["expander"],
      hasInputParam: true,
      hasKeyParam: true,
      knobParams: [
        { name: "attack", defaultValue: 0.01, min: 1e-4, max: 1, mode: "exp2", precision: 4 },
        { name: "release", defaultValue: 0.1, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "threshold", defaultValue: -24, min: -60, max: 0, mode: "linear", precision: 0, stepPerPx: 0.15 },
        { name: "ratio", defaultValue: 2, min: 1, max: 100, mode: "linear", precision: 2, stepPerPx: 0.05 },
        { name: "knee", defaultValue: 6, min: 0, max: 40, mode: "linear", precision: 1, stepPerPx: 0.2 }
      ]
    },
    // Gate
    {
      functionNames: ["gate"],
      hasInputParam: true,
      hasKeyParam: true,
      knobParams: [
        { name: "attack", defaultValue: 1e-3, min: 1e-4, max: 1, mode: "exp2", precision: 4 },
        { name: "release", defaultValue: 0.5, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "threshold", defaultValue: -24, min: -60, max: 0, mode: "linear", precision: 0, stepPerPx: 0.15 },
        { name: "ratio", defaultValue: 100, min: 1, max: 100, mode: "linear", precision: 2, stepPerPx: 0.05 },
        { name: "knee", defaultValue: 0, min: 0, max: 40, mode: "linear", precision: 1, stepPerPx: 0.2 },
        { name: "hold", defaultValue: 0.02, min: 0, max: 1, mode: "linear", precision: 2 }
      ]
    },
    // Limiter
    {
      functionNames: ["limiter"],
      hasInputParam: true,
      knobParams: [
        { name: "release", defaultValue: 0.1, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "threshold", defaultValue: 0, min: -80, max: 0, mode: "linear", precision: 0, stepPerPx: 0.15 }
      ]
    },
    // Filters - keep config for params extraction, but don't create knob widgets (have specialized widgets)
    {
      functionNames: [
        "lp",
        "hp",
        "bp",
        "bs",
        "ls",
        "hs",
        "peak",
        "ap",
        "slp",
        "shp",
        "sbp",
        "sbs",
        "speak",
        "sap",
        "mlp",
        "mhp",
        "diodeladder",
        "olp",
        "ohp"
      ],
      hasInputParam: true,
      knobParams: [
        { name: "cutoff", defaultValue: 1e3, min: 20, max: 2e4, mode: "exp2", precision: 2 },
        { name: "q", defaultValue: 1, min: 0.05, max: 24, mode: "exp2", precision: 3 },
        { name: "gain", defaultValue: 0, min: -24, max: 24, mode: "linear", precision: 2 }
      ]
    },
    // Reverbs - keep config for params extraction, but don't create knob widgets (have specialized widgets)
    {
      functionNames: ["freeverb", "dattorro", "fdn", "velvet"],
      hasInputParam: true,
      knobParams: [
        { name: "roomSize", defaultValue: 0.5, min: 0, max: 1, mode: "linear", precision: 3 }
      ]
    },
    // LFOs - keep config for params extraction, but don't create knob widgets (have specialized widgets)
    {
      functionNames: ["lfosine", "lfotri", "lfosaw", "lforamp", "lfosqr", "lfosah", "smooth", "fractal"],
      knobParams: [
        { name: "bar", defaultValue: 1, min: 0.25, max: 64, mode: "exp2", precision: 2 },
        { name: "offset", defaultValue: 0, min: -1, max: 1, mode: "linear", precision: 3 }
      ],
      namedKnobParams: [
        { name: "seed", defaultValue: 0, min: 0, max: 1e6, mode: "linear", precision: 0 }
        // fractal only
      ]
    },
    // Envelopes - keep config for params extraction, but don't create knob widgets (have specialized widgets)
    {
      functionNames: ["ad"],
      knobParams: [
        { name: "attack", defaultValue: 0.01, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "decay", defaultValue: 0.1, min: 1e-4, max: 10, mode: "exp2", precision: 4 },
        { name: "exponent", defaultValue: 1, min: 0.1, max: 8, mode: "exp2", precision: 3 }
      ]
    },
    {
      functionNames: ["adsr"],
      knobParams: [
        { name: "attack", defaultValue: 0.01, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "decay", defaultValue: 0.1, min: 1e-4, max: 10, mode: "exp2", precision: 4 },
        { name: "sustain", defaultValue: 0.7, min: 0, max: 1, mode: "linear", precision: 3 },
        { name: "release", defaultValue: 0.1, min: 1e-4, max: 10, mode: "exp2", precision: 4 },
        { name: "exponent", defaultValue: 1, min: 0.1, max: 8, mode: "exp2", precision: 3 }
      ]
    },
    {
      functionNames: ["envfollow"],
      hasInputParam: true,
      knobParams: [
        { name: "attack", defaultValue: 0.01, min: 1e-4, max: 5, mode: "exp2", precision: 4 },
        { name: "release", defaultValue: 0.1, min: 1e-4, max: 10, mode: "exp2", precision: 4 }
      ]
    },
    // Slew - keep config for params extraction, but don't create knob widgets (has specialized widget)
    {
      functionNames: ["slew"],
      hasInputParam: true,
      knobParams: [
        { name: "up", defaultValue: 0, min: 0, max: 10, mode: "exp2", precision: 4 },
        { name: "down", defaultValue: 0, min: 0, max: 10, mode: "exp2", precision: 4 },
        { name: "exponent", defaultValue: 1, min: 0.1, max: 8, mode: "exp2", precision: 3 }
      ]
    },
    // Slicer - keep config for params extraction, but don't create knob widgets (has specialized widget)
    {
      functionNames: ["slicer"],
      knobParams: [
        { name: "threshold", defaultValue: 0.5, min: 0, max: 1, mode: "linear", precision: 3 }
      ]
    }
  ];
  function getKnobConfig(functionName) {
    return KNOB_CONFIGS.find((config2) => config2.functionNames.includes(functionName)) ?? null;
  }
  function getParamNameForPosition(config2, knobIndex) {
    return config2.knobParams[knobIndex]?.name ?? null;
  }
  function getValidParamNames(config2) {
    return [
      ...config2.knobParams.map((p) => p.name),
      ...config2.namedKnobParams?.map((p) => p.name) ?? []
    ];
  }
  function collectNumberLiterals(expr, out) {
    if (!expr) return;
    if (expr.kind === "number") {
      const v = Number(expr.value ?? expr.raw ?? 0);
      if (Number.isFinite(v) && expr.loc) out.push({ value: v, loc: expr.loc });
      return;
    }
    if (expr.kind === "unary") {
      const op = String(expr.op ?? "");
      const inner = expr.expr;
      if ((op === "-" || op === "+") && inner?.kind === "number") {
        const v0 = Number(inner.value ?? inner.raw ?? 0);
        const v = op === "-" ? -v0 : v0;
        if (Number.isFinite(v) && expr.loc) out.push({ value: v, loc: expr.loc });
        return;
      }
      collectNumberLiterals(inner, out);
      return;
    }
    if (expr.kind === "postfix") {
      collectNumberLiterals(expr.expr, out);
      return;
    }
    if (expr.kind === "binary") {
      collectNumberLiterals(expr.left, out);
      if (expr.op !== "**") collectNumberLiterals(expr.right, out);
      return;
    }
    if (expr.kind === "member") {
      collectNumberLiterals(expr.object, out);
      if (expr.computed) collectNumberLiterals(expr.index, out);
      return;
    }
    if (expr.kind === "array") {
      for (const it of expr.items ?? []) collectNumberLiterals(it, out);
      return;
    }
    if (expr.kind === "object") {
      for (const p of expr.props ?? []) collectNumberLiterals(p?.value, out);
      return;
    }
  }
  function createGenericKnobVisitor(src, refs) {
    const lineStarts = buildLineStartsForLocs(src);
    return {
      visitCall(expr) {
        const calleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
        if (!calleeName) return;
        const config2 = getKnobConfig(calleeName);
        if (!config2) return;
        const validParamNames = getValidParamNames(config2);
        let inArgLoc = null;
        let hasNamedInput = false;
        if (config2.hasInputParam) {
          const pos0 = getPosArg$1(expr, 0);
          const namedIn = findNamedArg(expr, "in") ?? findNamedArg(expr, "input");
          hasNamedInput = !!namedIn;
          inArgLoc = namedIn?.loc ?? pos0?.loc ?? null;
        }
        let keyArgLoc = null;
        if (config2.hasKeyParam) {
          const namedKey = findNamedArg(expr, "key");
          const posArgs = (expr.args ?? []).filter((a) => a.kind === "pos");
          const lastPos = posArgs[posArgs.length - 1];
          keyArgLoc = namedKey?.loc ?? lastPos?.loc ?? null;
        }
        const knobParams = [];
        const params = {};
        const seen = /* @__PURE__ */ new Set();
        for (const paramConfig of config2.knobParams) {
          params[paramConfig.name] = paramConfig.defaultValue;
        }
        for (const paramConfig of config2.namedKnobParams ?? []) {
          params[paramConfig.name] = paramConfig.defaultValue;
        }
        let posIndex = 0;
        for (const a of expr.args ?? []) {
          if (!a) continue;
          if (a.kind === "pos") {
            const positionalOffset = config2.hasInputParam && !hasNamedInput ? 1 : 0;
            const isInputPos = positionalOffset === 1 && posIndex === 0;
            const knobIndex = posIndex - positionalOffset;
            posIndex++;
            if (isInputPos) continue;
            const paramName = getParamNameForPosition(config2, knobIndex);
            if (!paramName) continue;
            if (seen.has(paramName)) continue;
            const v = tryEvalConstNumber(a.value);
            if (v != null && Number.isFinite(v)) {
              params[paramName] = v;
            }
            const lits = [];
            collectNumberLiterals(a.value, lits);
            let did = false;
            for (const lit of lits) {
              const loc = lit.loc;
              if (!loc || loc.kernel || loc.line <= 0) continue;
              did = true;
              knobParams.push({ name: paramName, value: lit.value, valueLoc: loc });
            }
            if (did) seen.add(paramName);
            continue;
          }
          if (a.kind === "named") {
            if (a.name === "%index" || a.name === "index" || a.name === "in" || a.name === "input" || a.name === "key") {
              continue;
            }
            const resolvedName = resolveParamName(a.name, validParamNames);
            if (!resolvedName) continue;
            if (seen.has(resolvedName)) continue;
            const v = tryEvalConstNumber(a.value);
            if (v != null && Number.isFinite(v)) {
              params[resolvedName] = v;
            }
            const lits = [];
            collectNumberLiterals(a.value, lits);
            let did = false;
            for (const lit of lits) {
              const loc = lit.loc;
              if (!loc || loc.kernel || loc.line <= 0) continue;
              did = true;
              knobParams.push({ name: resolvedName, value: lit.value, valueLoc: loc });
            }
            if (did) seen.add(resolvedName);
          }
        }
        const calleeLoc = expr.callee?.loc ?? expr.loc;
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc);
        const index = getIndexFromCall(expr);
        const ref = {
          functionName: calleeName,
          index,
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inArgLoc,
          keyArgLoc,
          knobParams,
          params
        };
        if (calleeName.startsWith("lfo") || calleeName === "smooth" || calleeName === "fractal") {
          ref.barArgLoc = findNamedArg(expr, "bar")?.loc ?? getPosArg$1(expr, 0)?.loc ?? null;
          ref.offsetArgLoc = findNamedArg(expr, "offset")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
          ref.trigArgLoc = findNamedArg(expr, "trig")?.loc ?? null;
          ref.seedArgLoc = findNamedArg(expr, "seed")?.loc ?? null;
        } else if (calleeName === "ad") {
          ref.attackArgLoc = findNamedArg(expr, "attack")?.loc ?? getPosArg$1(expr, 0)?.loc ?? null;
          ref.decayArgLoc = findNamedArg(expr, "decay")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
          ref.exponentArgLoc = findNamedArg(expr, "exponent")?.loc ?? getPosArg$1(expr, 2)?.loc ?? null;
          ref.trigArgLoc = findNamedArg(expr, "trig")?.loc ?? null;
        } else if (calleeName === "adsr") {
          ref.attackArgLoc = findNamedArg(expr, "attack")?.loc ?? getPosArg$1(expr, 0)?.loc ?? null;
          ref.decayArgLoc = findNamedArg(expr, "decay")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
          ref.sustainArgLoc = findNamedArg(expr, "sustain")?.loc ?? getPosArg$1(expr, 2)?.loc ?? null;
          ref.releaseArgLoc = findNamedArg(expr, "release")?.loc ?? getPosArg$1(expr, 3)?.loc ?? null;
          ref.exponentArgLoc = findNamedArg(expr, "exponent")?.loc ?? getPosArg$1(expr, 4)?.loc ?? null;
          ref.trigArgLoc = findNamedArg(expr, "trig")?.loc ?? null;
        } else if (calleeName === "envfollow") {
          ref.inputArgLoc = inArgLoc;
          ref.attackArgLoc = findNamedArg(expr, "attack")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
          ref.releaseArgLoc = findNamedArg(expr, "release")?.loc ?? getPosArg$1(expr, 2)?.loc ?? null;
        } else if (calleeName === "slew") {
          ref.upArgLoc = findNamedArg(expr, "up")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
          ref.downArgLoc = findNamedArg(expr, "down")?.loc ?? getPosArg$1(expr, 2)?.loc ?? null;
          ref.exponentArgLoc = findNamedArg(expr, "exponent")?.loc ?? findNamedArg(expr, "exp")?.loc ?? getPosArg$1(expr, 3)?.loc ?? null;
        } else if (["lp", "hp", "bp", "bs", "ls", "hs", "peak", "ap", "slp", "shp", "sbp", "sbs", "speak", "sap", "mlp", "mhp", "diodeladder", "olp", "ohp"].includes(calleeName)) {
          ref.cutArgLoc = findNamedArg(expr, "cutoff")?.loc ?? findNamedArg(expr, "cut")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
          ref.qArgLoc = findNamedArg(expr, "q")?.loc ?? getPosArg$1(expr, 2)?.loc ?? null;
          ref.gainArgLoc = findNamedArg(expr, "gain")?.loc ?? getPosArg$1(expr, 3)?.loc ?? null;
        } else if (["freeverb", "dattorro", "fdn", "velvet"].includes(calleeName)) {
          ref.roomSizeArgLoc = findNamedArg(expr, "roomSize")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
        } else if (calleeName === "slicer") {
          ref.sampleArgLoc = findNamedArg(expr, "sample")?.loc ?? getPosArg$1(expr, 0)?.loc ?? null;
          ref.thresholdArgLoc = findNamedArg(expr, "threshold")?.loc ?? getPosArg$1(expr, 1)?.loc ?? null;
        }
        if (calleeName === "compressor") {
          ref.compressorIndex = index;
        } else if (calleeName === "expander") {
          ref.expanderIndex = index;
        } else if (calleeName === "gate") {
          ref.gateIndex = index;
        } else if (calleeName === "limiter") {
          ref.limiterIndex = index;
        } else if (calleeName === "lfosine") {
          ref.lfoIndex = index;
          ref.lfoType = "sine";
        } else if (calleeName === "lfotri") {
          ref.lfoIndex = index;
          ref.lfoType = "tri";
        } else if (calleeName === "lfosaw") {
          ref.lfoIndex = index;
          ref.lfoType = "saw";
        } else if (calleeName === "lforamp") {
          ref.lfoIndex = index;
          ref.lfoType = "ramp";
        } else if (calleeName === "lfosqr") {
          ref.lfoIndex = index;
          ref.lfoType = "sqr";
        } else if (calleeName === "lfosah") {
          ref.lfoIndex = index;
          ref.lfoType = "sah";
        } else if (calleeName === "smooth") {
          ref.lfoIndex = index;
          ref.lfoType = "smooth";
        } else if (calleeName === "fractal") {
          ref.lfoIndex = index;
          ref.lfoType = "fractal";
        } else if (calleeName === "freeverb") {
          ref.reverbIndex = index;
          ref.reverbKind = "freeverb";
        } else if (calleeName === "dattorro") {
          ref.reverbIndex = index;
          ref.reverbKind = "dattorro";
        } else if (calleeName === "fdn") {
          ref.reverbIndex = index;
          ref.reverbKind = "fdn";
        } else if (calleeName === "velvet") {
          ref.reverbIndex = index;
          ref.reverbKind = "velvet";
        } else if (calleeName === "ad") {
          ref.adIndex = index;
        } else if (calleeName === "adsr") {
          ref.adsrIndex = index;
        } else if (calleeName === "envfollow") {
          ref.envfollowIndex = index;
        } else if (calleeName === "slew") {
          ref.slewIndex = index;
        } else if (calleeName === "slicer") {
          ref.slicerIndex = index;
        } else if (["lp", "hp", "bp", "bs", "ls", "hs", "peak", "ap", "slp", "shp", "sbp", "sbs", "speak", "sap", "mlp", "mhp", "diodeladder", "olp", "ohp"].includes(calleeName)) {
          ref.filterIndex = index;
          ref.filterType = calleeName;
        }
        refs.push(ref);
      }
    };
  }
  function createMiniSequencesVisitor(src, sequences, refs, playBars) {
    const sequenceToIndex = /* @__PURE__ */ new Map();
    const lineStarts = buildLineStarts$1(src);
    const identToSeqIndex = /* @__PURE__ */ new Map();
    function ensureIndex(sequence) {
      const prev = sequenceToIndex.get(sequence);
      if (prev !== void 0) return prev;
      const idx = sequences.length;
      sequences.push(sequence);
      playBars.push(void 0);
      sequenceToIndex.set(sequence, idx);
      return idx;
    }
    function addRef(sequence, loc, color) {
      const seqIndex = ensureIndex(sequence);
      const quoteStart = locToIndex(lineStarts, loc);
      refs.push({
        seqIndex,
        sequence,
        color: color || void 0,
        start: quoteStart + 1,
        end: quoteStart + Math.max(0, loc.length - 1),
        loc
      });
    }
    function findSeqIndex(args) {
      const seqArg = args.find((a) => a.kind === "named" && a.name === "seq") ?? args.find((a) => a.kind === "pos");
      const seqExpr = seqArg?.kind === "pos" || seqArg?.kind === "named" ? seqArg.value : null;
      if (seqExpr?.kind === "string") {
        const sequence = String(seqExpr.value ?? "");
        return ensureIndex(sequence);
      }
      if (seqExpr?.kind === "ident") {
        return identToSeqIndex.get(String(seqExpr.name ?? "")) ?? null;
      }
      return null;
    }
    function findStaticBar(args) {
      const namedBar = args.find((a) => a.kind === "named" && a.name === "bar");
      if (namedBar?.kind === "named") {
        return tryEvalConstNumber(namedBar.value);
      }
      const posArgs = args.filter((a) => a.kind === "pos");
      const posBar = posArgs[3];
      return tryEvalConstNumber(posBar?.value);
    }
    return {
      visitExpr(expr) {
        if (expr?.kind !== "assign") return;
        if (expr.target?.kind !== "ident") return;
        const target = String(expr.target.name ?? "");
        if (!target) return;
        const value = expr.value;
        if (value?.kind !== "call") return;
        if (value.callee?.kind !== "ident") return;
        if (value.callee.name !== "mini") return;
        const args = value.args ?? [];
        const seqIndex = findSeqIndex(args);
        if (seqIndex == null) return;
        if (args.some((a) => (a?.kind === "pos" || a?.kind === "named") && a.value?.kind === "func")) return;
        if (args.some((a) => a?.kind === "named" && a.name === "cb")) return;
        identToSeqIndex.set(target, seqIndex);
      },
      visitCall(expr) {
        if (expr.callee?.kind === "ident" && (expr.callee?.name === "mini" || expr.callee?.name === "play")) {
          const args = expr.args ?? [];
          const seqArg = args.find((a) => a.kind === "named" && a.name === "seq") ?? args.find((a) => a.kind === "pos");
          const seqExpr = seqArg?.kind === "pos" || seqArg?.kind === "named" ? seqArg.value : null;
          if (seqExpr?.kind === "string") {
            const sequence = String(seqExpr.value ?? "");
            const namedColor = args.find((a) => a.kind === "named" && a.name === "color");
            let color = void 0;
            if (namedColor?.value?.kind === "string") {
              color = String(namedColor.value.value ?? "") || void 0;
            } else {
              for (const a of args) {
                if (a === seqArg) continue;
                if (a?.kind !== "pos") continue;
                const v = a.value;
                if (v?.kind === "string") {
                  color = String(v.value ?? "") || void 0;
                  break;
                }
              }
            }
            addRef(sequence, seqExpr.loc, color);
          }
          if (expr.callee?.name === "play") {
            const seqIndex = findSeqIndex(args);
            if (seqIndex == null) return;
            const bar = findStaticBar(args);
            if (bar == null || !Number.isFinite(bar)) return;
            if (bar <= 0) return;
            playBars[seqIndex] = bar;
          }
        }
      }
    };
  }
  function createNumberParamsVisitor(out) {
    return {
      visitExpr(expr) {
        if (expr.kind === "number" && expr.slider) {
          const min = Number(expr.slider.min ?? 0);
          const max = Number(expr.slider.max ?? 0);
          out.push({
            line: expr.loc.line,
            column: expr.loc.column,
            length: expr.loc.length,
            widgetLength: Number(expr.slider.widgetLength ?? expr.loc.length),
            value: Number(expr.value ?? 0),
            min,
            max,
            precision: expr.slider.precision,
            exp: expr.slider.exp
          });
        }
      }
    };
  }
  function createNumberLiteralsVisitor(out) {
    return {
      visitExpr(expr) {
        if (expr.kind === "number") {
          out.push({
            line: expr.loc.line,
            column: expr.loc.column,
            length: expr.loc.length,
            value: Number(expr.value ?? 0)
          });
        }
      }
    };
  }
  function fnv1a32$1(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function stableAstString$1(v) {
    return JSON.stringify(v, (k, val) => {
      if (k === "loc" || k === "ifLoc" || k === "elseLoc" || k === "questionLoc" || k === "colonLoc" || k === "slider" || k === "kernel") return void 0;
      return val;
    }) ?? "";
  }
  function recordKeyFromAssign$1(targetName, loc) {
    if (loc) {
      return `record:${targetName}:${loc.line}:${loc.column}`;
    }
    return `record:${targetName}`;
  }
  function recordKeyFallback$1(call) {
    const cbKey = getRecordCbKey(call);
    return `record#${(cbKey >>> 0).toString(16)}`;
  }
  function createSamplesVisitor(src, samples2, errors, sampleKeyToIndex) {
    const keyToIndex = sampleKeyToIndex ?? /* @__PURE__ */ new Map();
    const seenThisPass = /* @__PURE__ */ new Set();
    const handledRecordCalls = /* @__PURE__ */ new Set();
    let nextIndex = 0;
    for (const v of keyToIndex.values()) nextIndex = Math.max(nextIndex, (v | 0) + 1);
    function allocIndex(key) {
      const prev = keyToIndex.get(key);
      if (prev !== void 0) return prev;
      const idx = nextIndex++;
      keyToIndex.set(key, idx);
      return idx;
    }
    function locKey(loc) {
      return `${loc.line}:${loc.column}:${loc.length}`;
    }
    function getPosArg2(call, posIndex) {
      let pos = 0;
      for (const arg of call.args ?? []) {
        if (arg?.kind !== "pos") continue;
        if (pos === posIndex) return arg.value ?? null;
        pos++;
      }
      return null;
    }
    function getNamedArg2(call, name) {
      for (const arg of call.args ?? []) {
        if (arg?.kind !== "named") continue;
        if (arg.name === name) return arg.value ?? null;
      }
      return null;
    }
    function getArg2(call, posIndex, name) {
      return getNamedArg2(call, name) ?? getPosArg2(call, posIndex);
    }
    function getRecordCbKey2(call) {
      const secondsExpr = getNamedArg2(call, "seconds") ?? getPosArg2(call, 0);
      const cbExpr = getNamedArg2(call, "cb") ?? getNamedArg2(call, "callback") ?? getPosArg2(call, 1);
      return fnv1a32$1(stableAstString$1({ seconds: secondsExpr, cb: cbExpr }));
    }
    function ensureSample(id, loc) {
      const key = `freesound:${id}`;
      const sampleIndex = allocIndex(key);
      if (!seenThisPass.has(key)) {
        samples2.push({
          sampleIndex,
          provider: "freesound",
          id,
          url: `https://freesound.cowbell.workers.dev/get?id=${id}`,
          loc
        });
        seenThisPass.add(key);
      }
      return sampleIndex;
    }
    function ensureRecordSample(key, callLoc, cbKey) {
      const sampleIndex = allocIndex(key);
      if (!seenThisPass.has(key)) {
        const url = `record:${sampleIndex}:${(cbKey >>> 0).toString(16)}`;
        samples2.push({
          sampleIndex,
          provider: "record",
          key,
          url,
          loc: callLoc
        });
        seenThisPass.add(key);
      }
      return sampleIndex;
    }
    return {
      visitExpr(expr) {
        if (expr?.kind === "assign" && expr.op === "=" && expr.target?.kind === "ident" && expr.value?.kind === "call" && expr.value.callee?.kind === "ident" && expr.value.callee.name === "record") {
          const call = expr.value;
          const key = recordKeyFromAssign$1(expr.target.name, expr.loc);
          const cbKey = getRecordCbKey2(call);
          ensureRecordSample(key, call.loc ?? expr.loc, cbKey);
          handledRecordCalls.add(locKey(call.loc ?? expr.loc));
        }
      },
      visitCall(expr) {
        if (expr.callee?.kind === "ident" && expr.callee?.name === "freesound") {
          const idExpr = getArg2(expr, 0, "id");
          const id = tryEvalConstNumber(idExpr);
          if (id == null || !Number.isFinite(id) || !Number.isInteger(id) || id < 0) {
            errors.push(locError(src, idExpr?.loc ?? expr.loc, "`freesound(id:...)` requires an integer id literal"));
          } else {
            ensureSample(id, expr.loc);
          }
        } else if (expr.callee?.kind === "ident" && expr.callee?.name === "record") {
          const lk = locKey(expr.loc);
          if (handledRecordCalls.has(lk)) return;
          const key = recordKeyFallback$1(expr);
          const cbKey = getRecordCbKey2(expr);
          ensureRecordSample(key, expr.loc, cbKey);
        }
      }
    };
  }
  function createScaleVisitor(src, errors, result) {
    return {
      visitStmt(stmt) {
        if (stmt?.kind !== "expr_stmt") return;
        const expr = stmt.expr;
        if (!expr || expr.kind !== "assign") return;
        if (expr.target?.kind !== "ident" || expr.target?.name !== "scale") return;
        if (expr.op !== "=") {
          errors.push(locError(src, expr.loc ?? stmt.loc, "Only `scale=<name>` is supported"));
          return;
        }
        const v = expr.value;
        if (!v) {
          errors.push(locError(src, expr.loc ?? stmt.loc, "`scale` must be assigned a scale name"));
          return;
        }
        if (v.kind === "number") {
          const n = Number(v.value ?? 0);
          if (!Number.isFinite(n)) {
            errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, "`scale` must be a finite number"));
            return;
          }
          result.scale = Math.max(0, Math.floor(n));
          return;
        }
        const name = v.kind === "string" ? String(v.value ?? "") : v.kind === "ident" ? String(v.name ?? "") : "";
        if (!name) {
          errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, "`scale` must be assigned a scale name"));
          return;
        }
        result.scale = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0;
      }
    };
  }
  function createSlicersVisitor(src, refs) {
    const lineStarts = buildLineStartsForLocs(src);
    const scopes = [/* @__PURE__ */ new Map()];
    const recordIndexOf = (expr) => {
      if (expr?.kind !== "call") return void 0;
      if (expr.callee?.kind !== "ident" || expr.callee.name !== "record") return void 0;
      const idxArg = findNamedArg(expr, "%index") ?? findNamedArg(expr, "index");
      const idx = tryEvalConstNumber(idxArg?.value);
      if (idx == null || !Number.isFinite(idx)) return void 0;
      return Math.floor(idx);
    };
    const getConst = (name) => {
      for (let i = scopes.length - 1; i >= 0; i--) {
        const v = scopes[i]?.get(name);
        if (v !== void 0) return v;
      }
      return void 0;
    };
    return {
      visitCall(expr) {
        const calleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
        if (calleeName === "slicer") {
          const sampleArg = findNamedArg(expr, "sample") ?? getPosArg$1(expr, 0);
          const thresholdArg = findNamedArg(expr, "threshold") ?? getPosArg$1(expr, 4);
          const sampleIndexConst = tryEvalConstNumber(sampleArg?.value);
          const sampleIndexFromVar = sampleArg?.value?.kind === "ident" ? getConst(sampleArg.value.name) : void 0;
          const sampleIndexFromRecord = recordIndexOf(sampleArg?.value);
          const sampleIndex = sampleIndexConst ?? sampleIndexFromVar ?? sampleIndexFromRecord;
          if (sampleIndex != null && Number.isFinite(sampleIndex)) {
            const calleeLoc = expr.callee?.loc ?? expr.loc;
            const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc);
            const thresholdRaw = tryEvalConstNumber(thresholdArg?.value);
            const threshold = thresholdRaw != null && Number.isFinite(thresholdRaw) ? thresholdRaw : 0.5;
            refs.push({
              loc: calleeLoc,
              aboveLoc,
              callLoc: expr.loc,
              sampleIndex: Math.floor(sampleIndex),
              threshold,
              sampleArgLoc: sampleArg?.loc ?? null,
              thresholdArgLoc: thresholdArg?.loc ?? null
            });
          }
        }
      },
      visitStmt(stmt) {
        if (stmt?.kind === "expr_stmt" && stmt.expr?.kind === "assign" && stmt.expr.op === "=" && stmt.expr.target?.kind === "ident") {
          const name = stmt.expr.target.name;
          const value = tryEvalConstNumber(stmt.expr.value);
          if (value != null && Number.isFinite(value)) {
            scopes[scopes.length - 1].set(name, value);
          } else {
            const recordIndex = recordIndexOf(stmt.expr.value);
            if (recordIndex != null && Number.isFinite(recordIndex)) {
              scopes[scopes.length - 1].set(name, recordIndex);
            }
          }
        }
      }
    };
  }
  function getPosArg(call, posIndex) {
    let pos = 0;
    for (const arg of call.args ?? []) {
      if (arg?.kind !== "pos") continue;
      if (pos === posIndex) return arg.value ?? null;
      pos++;
    }
    return null;
  }
  function getNamedArg(call, name) {
    for (const arg of call.args ?? []) {
      if (arg?.kind !== "named") continue;
      if (arg.name === name) return arg.value ?? null;
    }
    return null;
  }
  function getArg(call, posIndex, name) {
    return getNamedArg(call, name) ?? getPosArg(call, posIndex);
  }
  function createTimelineLabelsVisitor(out) {
    return {
      visitStmt(stmt) {
        if (stmt?.kind !== "expr_stmt") return;
        const expr = stmt.expr;
        if (!expr || expr.kind !== "call") return;
        if (expr.callee?.kind === "ident" && expr.callee?.name === "label") {
          const barExpr = getArg(expr, 0, "bar");
          const textExpr = getArg(expr, 1, "text");
          const colorExpr = getArg(expr, 2, "color");
          const bar = tryEvalConstNumber(barExpr);
          const text = textExpr?.kind === "string" ? String(textExpr.value ?? "") : null;
          const color = colorExpr?.kind === "string" ? String(colorExpr.value ?? "") : void 0;
          if (bar != null && Number.isFinite(bar) && text != null) {
            out.push({
              bar,
              text,
              color: color || void 0,
              loc: expr.callee.loc ?? expr.loc
            });
          }
        }
      }
    };
  }
  function buildLineStarts(src) {
    const starts = [0];
    for (let i = 0; i < src.length; i++) {
      if (src[i] === "\n") starts.push(i + 1);
    }
    return starts;
  }
  function createTimelineSequencesVisitor(src, sequences, refs) {
    const keyToIndex = /* @__PURE__ */ new Map();
    const lineStarts = buildLineStarts(src);
    function ensureIndex(sequence) {
      const prev = keyToIndex.get(sequence);
      if (prev !== void 0) return prev;
      const idx = sequences.length;
      sequences.push({ sequence });
      keyToIndex.set(sequence, idx);
      return idx;
    }
    function addRef(sequence, loc, color) {
      const seqIndex = ensureIndex(sequence);
      const quoteStart = locToIndex(lineStarts, loc);
      refs.push({
        seqIndex,
        sequence,
        color: color || void 0,
        start: quoteStart + 1,
        end: quoteStart + Math.max(0, loc.length - 1),
        loc
      });
    }
    return {
      visitCall(expr) {
        if (expr.callee?.kind === "ident" && expr.callee?.name === "timeline") {
          const args = expr.args ?? [];
          const posArgs = args.filter((a) => a.kind === "pos");
          const namedSeqArg = args.find((a) => a.kind === "named" && a.name === "seq");
          const namedColorArg = args.find((a) => a.kind === "named" && a.name === "color");
          let seqArg = namedSeqArg ?? null;
          let seqPosIndex = -1;
          if (!seqArg) {
            for (let i = 0; i < posArgs.length; i++) {
              const v = posArgs[i]?.value;
              if (v?.kind === "string") {
                seqPosIndex = i;
                break;
              }
            }
            if (seqPosIndex === -1) seqPosIndex = posArgs.length >= 2 ? 1 : 0;
            seqArg = posArgs[seqPosIndex] ?? null;
          }
          const seqExpr = seqArg?.kind === "pos" || seqArg?.kind === "named" ? seqArg.value : null;
          if (seqExpr?.kind === "string") {
            const sequence = String(seqExpr.value ?? "");
            let colorExpr = namedColorArg?.value ?? null;
            if (!colorExpr) {
              if (seqPosIndex >= 0) {
                colorExpr = posArgs[seqPosIndex + 1]?.value ?? null;
              } else {
                for (let i = 0; i < posArgs.length; i++) {
                  const v = posArgs[i]?.value;
                  if (v?.kind === "string") {
                    colorExpr = v;
                    break;
                  }
                }
              }
            }
            const color = colorExpr?.kind === "string" ? String(colorExpr.value ?? "") || void 0 : void 0;
            addRef(sequence, seqExpr.loc, color);
          }
        }
      }
    };
  }
  function createTramSequencesVisitor(src, sequences, refs) {
    const sequenceToIndex = /* @__PURE__ */ new Map();
    const lineStarts = buildLineStarts$1(src);
    let lastBar = null;
    function ensureIndex(sequence) {
      const prev = sequenceToIndex.get(sequence);
      if (prev !== void 0) return prev;
      const idx = sequences.length;
      sequences.push(sequence);
      sequenceToIndex.set(sequence, idx);
      return idx;
    }
    function addRef(sequence, loc) {
      const seqIndex = ensureIndex(sequence);
      const quoteStart = locToIndex(lineStarts, loc);
      refs.push({
        seqIndex,
        sequence,
        bar: lastBar == null || !Number.isFinite(lastBar) || lastBar <= 0 ? void 0 : lastBar,
        start: quoteStart + 1,
        end: quoteStart + Math.max(0, loc.length - 1),
        loc
      });
    }
    function findSeqIndex(args) {
      const seqArg = args.find((a) => a.kind === "pos");
      const seqExpr = seqArg?.value;
      if (seqExpr?.kind === "string") {
        const sequence = String(seqExpr.value ?? "");
        return ensureIndex(sequence);
      }
      return null;
    }
    function findStaticBar(args) {
      const namedBar = args.find((a) => a.kind === "named" && a.name === "bar");
      if (namedBar?.kind === "named") {
        return tryEvalConstNumber(namedBar.value);
      }
      const posArgs = args.filter((a) => a.kind === "pos");
      const posBar = posArgs[1];
      return tryEvalConstNumber(posBar?.value);
    }
    return {
      visitCall(call) {
        if (call.callee?.name === "tram" || call.callee?.kind === "ident" && call.callee.name === "tram") {
          const args = call.args ?? [];
          lastBar = findStaticBar(args);
          const seqIndex = findSeqIndex(args);
          if (seqIndex !== null) {
            const seqArg = args.find((a) => a.kind === "pos");
            if (seqArg?.value?.kind === "string") {
              addRef(String(seqArg.value.value ?? ""), seqArg.value.loc);
            }
          }
        }
      }
    };
  }
  function createEveryVisitor(refs) {
    return {
      visitCall(expr) {
        const calleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
        if (calleeName === "every") {
          const calleeLoc = expr.callee?.loc ?? expr.loc;
          refs.push({
            everyIndex: getIndexFromCall(expr),
            loc: calleeLoc,
            callLoc: expr.loc
          });
        }
      }
    };
  }
  function createAtVisitor(refs) {
    return {
      visitCall(expr) {
        const calleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
        if (calleeName === "at") {
          const calleeLoc = expr.callee?.loc ?? expr.loc;
          refs.push({
            atIndex: getIndexFromCall(expr),
            loc: calleeLoc,
            callLoc: expr.loc
          });
        }
      }
    };
  }
  function createEuclidVisitor(refs) {
    return {
      visitCall(expr) {
        const calleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
        if (calleeName === "euclid") {
          const calleeLoc = expr.callee?.loc ?? expr.loc;
          refs.push({
            euclidIndex: getIndexFromCall(expr),
            loc: calleeLoc,
            callLoc: expr.loc
          });
        }
      }
    };
  }
  const PRELUDE = `
// Set the global BPM (beats per minute) for timing calculations
bpm=120

// Decay envelope
decay=(seconds=1,exponent=3,trig)->ad(.0001,seconds,exponent,trig)

// Convert decibels to linear gain multiplier (10^(dB/20))
db=x->10**(x/20)

// Convert bipolar signal to unipolar ([-1,1] to [0,1])
uni=x->x*.5+.5

// Convert unipolar signal to bipolar ([-1,1] to [0,1])
bi=x->x*2-1

// Crossfade between two signals
crossfade=(a,b,t)->lerp(a,b,clamp(t,0,1))

// Convert semitones to frequency multiplier (2^(semitones/12))
semis=x->2**(x/12)

// Convert mono signal to stereo, optionally with delay-based widening
stereo=(in,width=0)->[in,delay(in,seconds:width)]

// Convert stereo signal to mono by averaging channels
mono=([L,R])->(L+R)*.5

// Adjust stereo width using mid-side processing (1 = normal, 0 = mono, >1 = wider)
stereowidth=([L,R],width=1)->{
  mid=(L+R)*0.5
  side=(L-R)*0.5
  side*=width
  return [mid+side,mid-side]
}

// Widen stereo signal by delaying high frequencies in right channel
widen=([L,R],seconds=0.0001)->{
  cutoff=200
  loL=lp(L,cutoff)
  loR=lp(R,cutoff)
  hiL=hp(L,cutoff)
  hiR=hp(R,cutoff)
  return [loL+hiL,loR+delay(hiR,seconds)]
}

// Pan stereo signal (0=left, 0.5=center, 1=right)
pan=([L,R],balance=0.5)->{
  p=clamp(balance,0,1)
  return [L*(1-p),R*p]
}

// Modulated delay effect with LFO-controlled delay time
modDelay=(in,baseDelay,depth,rate,feedback,offset=0)->{
  lfo = lfosine(rate, offset)
  delayTime = baseDelay + depth * lfo
  delay(in, delayTime, feedback)
}

// Classic flanger effect (modulated comb filter)
flanger=(in,rate=1,depth=0.00125,base=0.00125,feedback=0.7)->{
  modDelay(in, base, depth, rate, feedback)
}

// Multi-voice chorus effect with spread and modulation
chorus=(in,voices=3,base=0.02,depth=0.006,rate=0.25,spread=.5)->{
  sum = 0
  voices = max(voices,1)

  for (i=0;i<voices;i++) {
    phase = (i / voices) * spread
    sum += modDelay(
      in,
      base,
      depth,
      rate,
      feedback:0,
      phase
    )
  }

  sum / voices
}

// Simple delay tap (alias for delay with callback)
tap=(in,seconds,cb)->delay(in,seconds,cb)

// Comb filter (feedforward + feedback delay)
comb=(in,seconds,feedback,cb)->in+delay(in,seconds,feedback,cb)

// 3-band equalizer with low/mid/high controls
eq3=(in,low=0,mid=0,high=0,lf=500,mf=2000,hf=8000)->{
  lo=ls(in,cutoff:lf,gain:low)
  mi=peak(in,cutoff:mf,q:1,gain:mid)
  hi=hs(in,cutoff:hf,gain:high)
  return lo+mi+hi
}

hp4=(in,cutoff,q)->hp(in,cutoff,q)|>hp($,cutoff,q)
lp4=(in,cutoff,q)->lp(in,cutoff,q)|>lp($,cutoff,q)
bp4=(in,cutoff,q)->bp(in,cutoff,q)|>bp($,cutoff,q)
bs4=(in,cutoff,q)->bs(in,cutoff,q)|>bs($,cutoff,q)
ls4=(in,cutoff,gain)->ls(in,cutoff,gain)|>ls($,cutoff,gain)
hs4=(in,cutoff,gain)->hs(in,cutoff,gain)|>hs($,cutoff,gain)
ap4=(in,cutoff,q)->ap(in,cutoff,q)|>ap($,cutoff,q)
peak4=(in,cutoff,q,gain)->peak(in,cutoff,q,gain)|>peak($,cutoff,q,gain)

slp4=(in,cutoff,q)->slp(in,cutoff,q)|>slp($,cutoff,q)
shp4=(in,cutoff,q)->shp(in,cutoff,q)|>shp($,cutoff,q)
sbp4=(in,cutoff,q)->sbp(in,cutoff,q)|>sbp($,cutoff,q)
sbs4=(in,cutoff,q)->sbs(in,cutoff,q)|>sbs($,cutoff,q)
sap4=(in,cutoff,q)->sap(in,cutoff,q)|>sap($,cutoff,q)
speak4=(in,cutoff,q)->speak(in,cutoff,q)|>speak($,cutoff,q)

mlp4=(in,cutoff,q)->mlp(in,cutoff,q)|>mlp($,cutoff,q)
mhp4=(in,cutoff,q)->mhp(in,cutoff,q)|>mhp($,cutoff,q)
ohp4=(in,cutoff)->ohp(in,cutoff)|>ohp($,cutoff)


// Granular synthesis-inspired trigger generator based on speed
grain=(speed=1,seed)->step(random(seed),.999+.001*((1-clamp(speed,0,1))**.293))

// Vocoder effect using bandpass filters and envelope following
vocoder=(carrier,modulator,numBands=16,attack=.01,release=.04,freqMin=100,freqMax=8000)->{
  logRange = log(freqMax / freqMin)
  step     = logRange / (numBands - 1)
  r = exp(step)
  Q = clamp(1 / (r - 1), 1.5, 20)
  s = 0
  for (i=0; i<numBands-1; i++) {
    freq = freqMin * exp(i * step)
    modBand = bp(modulator, freq, Q)
    env     = envfollow(abs(modBand), attack, release)
    carBand = bp(carrier, freq, Q)
    s += carBand * env
  }
  s
}

// Karplus-Strong plucked string synthesis
karplus=(hz,pluck=pink,seed=334,attack=.0001,decay=.1,exponent=40,damping=.5,trig)->{
  exc = pluck(seed, trig) * ad(attack,decay,exponent,trig)
  delayTime = safediv(1, hz)
  dampingCutoff=hz*((1-damping)*63+1)
  oversample(16, () -> delay(exc,delayTime,1,x -> tanh(olp(x, dampingCutoff))))
}

// k5000
k5000=(
  hz,
  brightness=.99,
  motion=.5,
  density=12
)->{
  b = 1-clamp(brightness,0,1)
  m = clamp(motion,0,1)

  // Tilt curve (controls spectral centroid)
  tilt = 1 + 6*b

  // =====================
  // Additive engine
  // =====================
  s = 0
  maxH = min(density, floor(18000 / hz))

  for (i=1; i<=maxH; i++) {
    // Harmonic weight curve
    amp =
      exp(-log(i) * tilt)

      * (1 + m*fractal(.1 + i*.1, 1000+i))

    s += sine(hz*i) * amp
  }

  // Normalize
  s *= 1 / sqrt(maxH)

  // =====================
  // Gentle spectral polish (not subtractive!)
  // =====================
  s = ap(s, 800 + 2400*b, .6)
  s = ap(s, 1800 + 4200*b, .6)

  s
}

rhodes=(hz,vel=1,trig)->{
  v = clamp(vel,0,1)

  // Tine FM (velocity controls metallic bite)
  fmIndex = hz * (.2 + 2.8*v)
  fm = sine(hz*2.01) * fmIndex
  tine = sine(hz + fm, 0, trig)

  // Dual tone-bar resonances (slightly inharmonic)
  resonances = [
    bp(tine, hz*3.8, 7),
    bp(tine, hz*7.1, 9)
  ].avg()

  // Pickup / hammer click
  click = hp(tine, 2500, 0.7)
        * ad(.0004,.025,14,trig)
        * (.3 + .7*v)

  // Raw mix
  s = tine*.55 + resonances*.9 + click*.35

  // Envelope + velocity scaling
  s *= (.15 + .85*v)

  // Gentle saturation + DC cleanup
  s = tube(s, drive:2.0 + v, bias:.04)

  // Pickup EQ tilt (brighter with velocity)
  s = ls(s, 250, -2*(1-v))
    + hs(s, 3200, 3*v)

  // Classic Rhodes chorus
  s = chorus(s, voices:3, rate:.22, depth:.005, spread:.6)

  s*.5
}

/*
Softer, late-70s Rhodes character
Changes vs previous:
- Removed audio-rate FM entirely
- Uses filtered noise + short sine burst for hammer/tine attack
- Emphasizes tone-bar resonances over carrier brightness
- Lower pickup EQ tilt, less saturation
- Overall darker, woodier response
*/

rhodes70=(hz,vel=1,trig)->{
  v = clamp(vel,0,1)

  // Fundamental (very pure)
  core = sine(hz, trig)

  // Hammer / tine attack (noise, not FM)
  hammer =
    bp(pink(1234,trig), hz*2.5, 6)
    * ad(.0006,.04,10,trig)
    * (.25 + .6*v)

  // Tone-bar resonances (dominant character)
  resonances = [
    bp(core, hz*3.2, 8),
    bp(core, hz*6.4, 10)
  ].sum()

  // Slight beating via slow detune (control-rate, not audio-rate)
  det = 1 + (.002 + .004*v) * lfosine(.6)
  body = sine(hz*det) * .3

  // Mix (bars > fundamental)
  s =
    core*.35 +
    resonances*1.0 +
    body +
    hammer

  // Apply envelope + velocity
  s *= (.2 + .8*v)

  // Very gentle saturation (mostly for compression feel)
  s = tanh(s * (1.2 + .8*v))

  // Pickup EQ: dark, rounded top
  s = ls(s, 220, -1.5)
    |> hs($, 2800, 1.2*v)

  // Subtle chorus (slow + shallow)
  s = chorus(s, voices:2, rate:.15, depth:.003, spread:.4)

  s
}

cs80=(
  hz,
  vel=1,
  trig,
  cutoff=900,
  res=.6,
  brilliance=.4,
  aftertouch=.0
)->{
  v = clamp(vel,0,1)
  at = clamp(aftertouch,0,1)

  // =====================
  // Shared modulation
  // =====================
  vib = (.002 + .004*at) * lfosine(5.4)
  f   = hz * (1 + vib)

  // =====================
  // Voice I (saw-dominant, brassy)
  // =====================
  v1osc =
    saw(f,0,trig)*.7 +
    sine(f)*.3

  v1env = adsr(
    attack:.01,
    decay:.25,
    sustain:.6,
    release:1.6,
    exponent:3,
    trig
  )

  v1hp = hp(v1osc, 120 + 400*brilliance, .6)
  v1lp = mlp(
    v1hp,
    cutoff * (1 + v1env*1.5 + at*2),
    res + .15
  )

  v1 = v1lp * v1env

  // =====================
  // Voice II (pulse / sine, smoother)
  // =====================
  pw = .45 + .1*lfosine(.3)
  v2osc =
    oversample(12,()->pwm(f*1.002, pw, 0, trig))*.6 +
    sine(f*.5)*.4

  v2env = adsr(
    attack:.03,
    decay:.4,
    sustain:.5,
    release:2.4,
    exponent:3,
    trig
  )

  v2hp = hp(v2osc, 80, .7)
  v2lp = mlp(
    v2hp,
    cutoff*.7 * (1 + v2env + at*1.8),
    res*.8
  )

  v2 = v2lp * v2env

  // =====================
  // Layer mix + expressivity
  // =====================
  s = (v1 + v2) * (.25 + .75*v)

  // Signature CS-80 saturation (very gentle)
  s = tanh(s * 1.6)

  // Animate stereo (CS-80 is wide and alive)
  s = chorus(s, voices:3, rate:.18, depth:.006, spread:.7)

  s
}

bdsynth=(
  base=#1*o2,
  punch=25000k,
  offset=0.0006,
  cutoff=5k,
  q=.25,
  amp=trig->ad(.0001,.5,40,trig),
  fm=trig->ad(.00008,.013,900,trig),
  filter=trig->ad(.000147,.25,50.000,trig),
  trig=tram('x-x-x-x-'),
)->sine(base+punch*fm(trig),offset,trig)*amp(trig) |> slp($,base+cutoff*filter(trig),q) |> limiter($)

// bd=(
//   base=#1*o2,
//   punch=25000k,
//   offset=0.0006,
//   cutoff=5k,
//   q=.25,
//   amp=trig->ad(.0001,.5,40,trig),
//   fm=trig->ad(.00008,.013,900,trig),
//   filter=trig->ad(.000147,.25,50.000,trig),
//   trig=tram('x-x-x-x-'),
// )->{
//   kicksample=record(.3,()->{
//     bdsynth(base,punch,offset,cutoff,q,amp,fm,filter,trig:1)
//   })
//   sampler(trig,sample:kicksample)
// }

hhsynth=(width=.4,trig)->{
  env=adsr(.06,.05 ,.950 ,.1 ,32,trig)
  oversample(4,()->[205.3,369.6,304.4,522.7,800,540].map(x->pwm(x,width)).avg()*env
  |> bp($,8000,.85)|>bp($,10k,.85)|>hp($,11k,.85)) |> tanh($*6)
}

// hh=(width=.4,seq=mini('[.15 .2 1 .2]*4'))->{
//   hhsample=record(.3,()->{
//     trig=step(1-inc(2.5),.5)
//     hhsynth(width,trig)
//   })

//   play(seq,(trig,v)->{
//     slicer(trig,sample:hhsample)*(v>.65?v:v*2)*(v>.65?ad(0.0001,.0173+.5*v,trig):ad(0.0001,.01+.15*v,4,trig))
//   })
// }

snaresynth=(seed=7,base=#5*o2,trig=step(1-phasor(1),.9))->{
  amp=ad(.0001,1.7366,20,trig)
  noise=adsr(.0001,.0231 ,.870 ,.3159 ,8.000,trig)
  click = ad(.0001, .02, 4, trig)
  pitch = ad(.0001, .3095 , 20, trig)
  pitchAmt=base*2
  ;(sine(base+pitch*pitchAmt,trig)*.3 |> sbp($, base * 2, .8))*amp

  +(white(seed,trig) |> shp($, 1800,.4) |> sbp($, 7100, .4))*noise
  +(white(8,trig) |> shp($, 4000,.6))*click
  |> tube($,2,.01)*.3
}

// sd=(seed=7,base=#5*o2,trig=tram('-x',1/2))->{
//   snaresample=record(1,()->snaresynth(seed,base))
//   sampler(snaresample,trig)
// }

bd=(
  base=#1*o2,
  punch=25000k,
  offset=0.0006,
  cutoff=5k,
  q=.25,
  amp=trig->ad(.0001,.5,40,trig),
  fm=trig->ad(.00008,.013,900,trig),
  filter=trig->ad(.000147,.25,50.000,trig),
  trig=tram('x-x-x-x-'),
)->{
  bdsynth(base,punch,offset,cutoff,q,amp,fm,filter,trig)
}

ch=(width=.02,trig=tram('xxxx',1/4))->{
  hhsynth(width,trig)*ad(0.0001,.5,3,trig)*.7
}

oh=(width=.4,trig=tram('-x',1/4))->{
  hhsynth(width,trig)*ad(0.0001,.9,trig)
}

hh=()->ch()+oh()

sd=(seed=7,base=#5*o2,seq=mini('[~ 1]*2;.2'))->{
  play(seq,(trig)->snaresynth(seed,base,trig))
}

drums=()->bd()+hh()+sd()

cowbell=(
  osc=hz->pwm(hz,.04),
  tone=#2*o5*1.002,
  trig=euclid(3,8,1,bar:1/2),
)->{
  cowbellsample=record(.4,()->{
    kt=step(1-phasor(1),.96)
    env=adsr(.001,.06,.9,.25,2,trig:kt)
    // Two square waves (inharmonic)
    freq1=tone
    freq2=freq1*1.44

    oversample(16,()->{
      osc1=osc(freq1)
      osc2=osc(freq2)
      ;(osc1+osc2)*env/2.5
    })
  })
  sampler(cowbellsample,trig)*.055
}

tom=(seq=mini('[~ ~ 1 ~  ~ ~ ~ 3]*2'))->{
  play(seq,(trig,velocity,hz)->{

    pitch=ad(.0001,1.0,-.25,trig)
    env=ad(.0001,.2262,10,trig)
    freq=(hz/16)*(1+pitch*11)+5000k*ad(.0001,.02,40,trig)
    osc1=tri(freq,trig)*.5
    osc2=sqr(freq*0.97,trig)*.5

    ;(osc1+osc2)*env/2

    |> slp($,freq*4.8,.8)*.7
  })
}

claves=(
  base=#2*o7,
  trig=tram('--x---xx',1/2),
)->{
  clavessample=record(.25,()->{
    env=ad(.0001,.2539 ,40,trig:1)
    click=ad(.0001,.0871 ,100,trig:1)
    ;(sine(base,trig:1)*.6
    + sine(base*2.1,trig:1)*.4
    + white(333,trig:1)*click*.5)*env
    |> shp($,1200,.8)
    |> sbp($,base*1.5,3)
    |> tanh($*3)
  })
  sampler(clavessample,trig)*.2
}

clapsynth=(
  seed=552,
  trig=tram('-----x-x',1),
)->{

  env1=ad(.0001,1.2053,90,trig)

  env2=ad(.0185,.8105 ,90,trig)

  env3=ad(.0320,1.3933,90,trig)

  env4=ad(.0217,.9363 ,18.000,trig)

  noise=oversample(16,()->white(seed,trig))

  noise*(env1*.3+env2*.3+env3*.3+env4*.3) |> shp($,800.01 ,.8)

  |> tanh($*10)*.3
}

clap=(seed=552,trig=tram('-----x-x',1))->{

  sample=record(.5,()->clapsynth(seed,trig:1))
  sampler(sample,trig)
}

rimshot=(
  seed=12349,
  base=#6*o5,
  trig=tram('--x-xx',1/2),
)->{

  sample=record(.05,()->{
    kt=1

    // envelopes
    clickEnv = ad(.00004,.0465,160,trig:kt)
    bodyEnv  = ad(.0001 ,.1013,55 ,trig:kt)
    thunkEnv = ad(.0001 ,.0448,90 ,trig:kt)

    // stick click (very short, lowpassed noise)
    click =
      oversample(8,()->white(seed,trig:kt))
      |> lp($,3200,.8)
      |> hp($,900,.7)
      * clickEnv * 5.7

    // wooden body (two close modes, no inharmonic metal)
    body =
      oversample(8,()->{
        sqr(base*0.97,trig:kt)
        + sine(base*1.04,trig:kt)
      }) * bodyEnv * .75

    // low woody thunk
    thunk =
      tri(base*0.48,trig:kt)
      * thunkEnv * .4

    ;(click + body + thunk)
      |> sbp($,base*2.4,.85)
      |> tanh($*2.2)
  })

  sampler(sample,trig)*.3
}

// Generate metronome sound with major/minor chord progression
metronome=()->{
  trig=every(1/4)
  major=pink(184,trig)
  minor=pink(12122362,trig)
  ;[major,minor,minor,minor][t]*ad(.0001,.0310,20,trig) |> olp($,138.17+4839.33*ad(.0001,.0420,20.000,trig)) |> hp($,289.47 ) |> tanh($*8)
}

// Additive synthesis with harmonic series and tilt control
harmonics=(hz,numHarmonics=3,tilt=3,offset=0,trig)->{
  s = 0
  maxH = min(numHarmonics, floor(20000 / hz))
  for (i=1;i<maxH;i++) {
    f = hz * i
    amp = exp(-tilt * log(i))
    s += sine(f,offset,trig) * amp
  }
  norm = 1 / sqrt(maxH)
  s * norm
}

// Wave folding synthesis with harmonic enhancement
folded=(hz,numHarmonics=2,amount=2)->{
  s = 0
  amount=max(.0001,amount)
  numHarmonics=max(2,numHarmonics)
  for (i = 1; i<numHarmonics; i++) {
    s += sine(hz * i) * safediv(1, i)
  }
  fold(s, -1 / amount, 1 / amount)
}

// Pulsar synthesis with phasor-controlled envelope
pulsar=(hz,density=1)->{
  x = phasor(hz*(2**density))
  env = smoothstep(x,0,0.2)
  sine(hz) * env
}

// Supersaw oscillator with detuned voices
supersaw=(hz,voices=5,spread=.05)->{
  s = 0
  for (i=0;i<voices;i++) {
    d = (i/(voices-1)-.5)*spread
    s += saw(hz*(1+d))
  }
  s / voices
}

// Hammond organ-style drawbar oscillator
drawbar=(hz,bars=[1])->{
  s = 0
  for (i=0;i<bars.length;i++) {
    x=bars[i]
    if (x>0) {
      s += sine(hz*(i+1)) * x
    }
  }
  s / bars.sum()
}

// Drum synthesis using filtered noise excitation
drum=(noise=white,seed=42,freqs=[120,200,330,470],trig)->{
  exc = noise(seed,trig)
  s = 0
  for (i=0;i<freqs.length;i++) {
    s += bp(exc,freqs[i],20)
  }
  s
}

// Vowel formant constants (a,e,i,o,u)
va=0
ve=1
vi=2
vo=3
vu=4

// Formant filter for vowel sounds
vowel=(in,vowelName)->{
  F = [
    [730,1090,2440],  // a
    [530,1840,2480],  // e
    [270,2290,3010],  // i
    [570,840,2410],   // o
    [300,870,2240]    // u
  ]
  freqs = F[vowelName]
  s = in
  s = bp(s,freqs[0],6)
    + bp(s,freqs[1],6)
    + bp(s,freqs[2],6)
  s
}

// Ring modulation effect
ring=(in,hz)->in*sine(hz)

// Tube saturation/distortion
tube=(in,drive=3,bias=.2)->{
  tanh((in+bias)*drive)-tanh(bias*drive)
}

// Hard clipping distortion
clip=(in,x=1)->clamp(in,lo:-x,hi:x)

// Bit crushing effect using sample and hold
bitcrush=(in,rate=8000)->{
  trig = impulse(rate)
  sah(in,trig)
}

// Mix operator (passes through signal unchanged)
mix=|>$
`;
  const POSTLUDE = `
post((sig)->dc(sig))
post((sig)->mix(sig))
`;
  const NOTE_OFFSETS = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11
  };
  const NOTE_REGEXP = /^([a-gA-G])([#b]?)(\d+)$/;
  function noteIdentToMidi(name) {
    const m = name.match(NOTE_REGEXP);
    if (!m) return null;
    const note = m[1].toLowerCase();
    const acc = m[2] ?? "";
    const oct = parseInt(m[3], 10);
    const base = NOTE_OFFSETS[note];
    if (base === void 0 || !Number.isFinite(oct)) return null;
    let midi = base + (oct + 1) * 12;
    if (acc === "#") midi += 1;
    else if (acc === "b") midi -= 1;
    return midi;
  }
  const persistentSampleKeyToIndex = /* @__PURE__ */ new Map();
  const normalizePrelude = (s) => {
    const t = s.trimEnd();
    if (!t) return "";
    const last = t[t.length - 1];
    const withSep = last === ";" || last === "}" ? t : `${t};`;
    return withSep.endsWith("\n") ? withSep : `${withSep}
`;
  };
  const KERNEL_LEX_LINES = 1e9;
  const kernelCache = /* @__PURE__ */ new Map();
  const transformedBodyScratch = [];
  const transformedUserBodyScratch = [];
  function fnv1a32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }
  function stableAstString(v) {
    return JSON.stringify(v, (k, val) => {
      if (k === "loc" || k === "ifLoc" || k === "elseLoc" || k === "questionLoc" || k === "colonLoc" || k === "slider" || k === "kernel") return void 0;
      return val;
    }) ?? "";
  }
  function getPosArgValue(call, posIndex) {
    let pos = 0;
    for (const arg of call.args ?? []) {
      if (arg?.kind !== "pos") continue;
      if (pos === posIndex) return arg.value ?? null;
      pos++;
    }
    return null;
  }
  function getNamedArgValue(call, name) {
    for (const arg of call.args ?? []) {
      if (arg?.kind !== "named") continue;
      if (arg.name === name) return arg.value ?? null;
    }
    return null;
  }
  function getRecordCbKey$1(call) {
    const secondsExpr = getNamedArgValue(call, "seconds") ?? getPosArgValue(call, 0);
    const cbExpr = getNamedArgValue(call, "cb") ?? getNamedArgValue(call, "callback") ?? getPosArgValue(call, 1);
    return fnv1a32(stableAstString({ seconds: secondsExpr, cb: cbExpr }));
  }
  function recordKeyFromAssign(targetName, loc) {
    if (loc) {
      return `record:${targetName}:${loc.line}:${loc.column}`;
    }
    return `record:${targetName}`;
  }
  function recordKeyFallback(call) {
    const cbKey = getRecordCbKey$1(call);
    return `record#${(cbKey >>> 0).toString(16)}`;
  }
  function toSeqIndexExpr(loc, idx) {
    return { kind: "number", value: idx, raw: String(idx), loc };
  }
  function injectRecordArgs(sampleKeyToIndex, call, callee, args, recordKey) {
    const idx = sampleKeyToIndex.get(recordKey);
    if (idx === void 0) return { ...call, callee, args };
    const cbKey = getRecordCbKey$1(call);
    const filtered = [];
    for (const a of args) {
      const drop = a?.kind === "named" && (a.name === "%index" || a.name === "index" || a.name === "%key");
      if (!drop) filtered.push(a);
    }
    return {
      ...call,
      callee,
      args: [
        ...filtered,
        { kind: "named", name: "%index", value: toSeqIndexExpr(call.loc, idx), loc: call.loc },
        { kind: "named", name: "%key", value: toSeqIndexExpr(call.loc, cbKey >>> 0), loc: call.loc }
      ]
    };
  }
  function createIndexAllocator(opts) {
    const used = new Set(opts.reserved ?? []);
    let next = opts.start | 0;
    const max = opts.max | 0;
    return (span = 1) => {
      span = Math.max(1, span | 0);
      const maxStart = Math.max(0, max - (span - 1));
      while (next <= maxStart) {
        let ok = true;
        for (let i = 0; i < span; i++) {
          if (used.has(next + i)) {
            ok = false;
            break;
          }
        }
        if (ok) {
          const idx2 = next;
          for (let i = 0; i < span; i++) used.add(idx2 + i);
          next = idx2 + span;
          return idx2;
        }
        next++;
      }
      const idx = maxStart;
      for (let i = 0; i < span; i++) used.add(idx + i);
      return idx;
    };
  }
  function isReverbCall(name) {
    return name === "freeverb" || name === "dattorro" || name === "fdn" || name === "velvet";
  }
  function stripMiniColorArg(args) {
    let namedColor = null;
    let secondPos = null;
    let thirdPos = null;
    let pos = 0;
    for (const a of args) {
      if (a?.kind === "named" && a.name === "color") namedColor = a;
      if (a?.kind === "pos") {
        if (pos === 1) secondPos = a;
        else if (pos === 2) thirdPos = a;
        pos++;
      }
    }
    const toDrop = namedColor ?? (secondPos?.value?.kind === "string" ? secondPos : null) ?? (thirdPos?.value?.kind === "string" ? thirdPos : null);
    if (!toDrop) return args;
    const out = [];
    for (const a of args) if (a !== toDrop) out.push(a);
    return out;
  }
  function transformExpr(context, expr) {
    if (!expr) return expr;
    if (expr.kind === "ident") {
      const om = expr.name.match(/^o(\d+)$/);
      if (om) {
        const o = parseInt(om[1], 10);
        const mul = Number.isFinite(o) ? 2 ** (o + 1) : 0;
        return { kind: "number", value: mul, raw: String(mul), loc: expr.loc };
      }
      if (expr.name.startsWith("#")) {
        const raw = expr.name.slice(1);
        const dm = raw.match(/^(\d+)$/);
        if (dm) {
          const d = parseInt(dm[1], 10);
          return {
            kind: "call",
            callee: { kind: "ident", name: "degree", loc: expr.loc },
            args: [{
              kind: "pos",
              value: { kind: "number", value: d, raw: String(d), loc: expr.loc },
              loc: expr.loc
            }],
            loc: expr.loc
          };
        }
        if (raw === "scale") {
          return {
            kind: "call",
            callee: { kind: "ident", name: "getScale", loc: expr.loc },
            args: [],
            loc: expr.loc
          };
        }
        const chordMatch = raw.match(/^([ivxlcdm]+)(.*)$/i);
        if (chordMatch) {
          const roman = chordMatch[1];
          const suffix = chordMatch[2] ?? "";
          const base = romanToDegree(roman);
          if (base !== null) {
            const tones = parseChordSuffix(suffix);
            const items = new Array(tones.length);
            for (let idx = 0; idx < tones.length; idx++) {
              const tone = tones[idx];
              const scaleDegree = base + tone.degree;
              const loc = idx === 0 ? expr.loc : { ...expr.loc, line: 0, column: expr.loc.column + idx };
              const args = [{
                kind: "pos",
                value: { kind: "number", value: scaleDegree, raw: String(scaleDegree), loc },
                loc: expr.loc
              }];
              if (tone.semitoneAdjust !== 0) {
                args.push({
                  kind: "pos",
                  value: {
                    kind: "number",
                    value: tone.semitoneAdjust,
                    raw: String(tone.semitoneAdjust),
                    loc
                  },
                  loc: expr.loc
                });
              }
              items[idx] = {
                kind: "call",
                callee: { kind: "ident", name: "degree", loc: expr.loc },
                args,
                loc: expr.loc
              };
            }
            return { kind: "array", items, loc: expr.loc };
          }
        }
      }
      const midi = noteIdentToMidi(expr.name);
      if (midi !== null) {
        return {
          kind: "call",
          callee: { kind: "ident", name: "note", loc: expr.loc },
          args: [{
            kind: "pos",
            value: { kind: "number", value: midi, raw: String(midi), loc: expr.loc },
            loc: expr.loc
          }],
          loc: expr.loc
        };
      }
    }
    if (expr.kind === "call") {
      const preCalleeName = expr.callee?.kind === "ident" ? expr.callee.name : null;
      const reverbIndex = isReverbCall(preCalleeName) ? context.allocReverbIndex() : null;
      const callee = transformExpr(context, expr.callee);
      const inArgs = expr.args ?? [];
      let args = inArgs;
      if (inArgs.length) {
        const out = new Array(inArgs.length);
        for (let i = 0; i < inArgs.length; i++) {
          const a = inArgs[i];
          if (a?.kind === "pos" || a?.kind === "named") out[i] = { ...a, value: transformExpr(context, a.value) };
          else out[i] = a;
        }
        args = out;
      }
      if (reverbIndex !== null) {
        const filtered = [];
        for (const a of args) {
          const drop = a?.kind === "named" && (a.name === "%index" || a.name === "index");
          if (!drop) filtered.push(a);
        }
        args = [
          ...filtered,
          { kind: "named", name: "%index", value: toSeqIndexExpr(expr.loc, reverbIndex), loc: expr.loc }
        ];
      }
      const calleeName = callee?.kind === "ident" ? callee.name : null;
      const isMini = calleeName === "mini";
      const isPlay = calleeName === "play";
      const isTram = calleeName === "tram";
      const isTimeline = calleeName === "timeline";
      const isAd = calleeName === "ad";
      const isAdsr = calleeName === "adsr";
      const isEnvfollow = calleeName === "envfollow";
      const analyserKind = calleeName === "analyser" || calleeName === "amplitude" || calleeName === "waveform" || calleeName === "spectrum" || calleeName === "level" || calleeName === "print" ? calleeName : null;
      const isAnalyser = analyserKind !== null;
      const isCompressor = calleeName === "compressor";
      const isExpander = calleeName === "expander";
      const isGate = calleeName === "gate";
      const isLimiter = calleeName === "limiter";
      const isFilter = calleeName === "lp" || calleeName === "hp" || calleeName === "bp" || calleeName === "bs" || calleeName === "ls" || calleeName === "hs" || calleeName === "peak" || calleeName === "ap" || calleeName === "slp" || calleeName === "shp" || calleeName === "sbp" || calleeName === "sbs" || calleeName === "speak" || calleeName === "sap" || calleeName === "mlp" || calleeName === "mhp" || calleeName === "diodeladder" || calleeName === "olp" || calleeName === "ohp";
      const isLfo = calleeName === "lfosine" || calleeName === "lfotri" || calleeName === "lfosaw" || calleeName === "lforamp" || calleeName === "lfosqr" || calleeName === "lfosah" || calleeName === "smooth" || calleeName === "fractal";
      const isOut = calleeName === "out" || calleeName === "solo";
      const isLabel = calleeName === "label";
      const isFreesound = calleeName === "freesound";
      const isRecord = calleeName === "record";
      if (isLabel) {
        return { kind: "undefined", loc: expr.loc };
      }
      if (isFreesound) {
        let idArg;
        for (const a of args) {
          if (a?.kind === "named" && a.name === "id") {
            idArg = a;
            break;
          }
        }
        if (!idArg) {
          for (const a of args) {
            if (a?.kind === "pos") {
              idArg = a;
              break;
            }
          }
        }
        const idExpr = idArg?.kind === "pos" || idArg?.kind === "named" ? idArg.value : null;
        const id = tryEvalConstNumber(idExpr);
        if (id != null && Number.isFinite(id) && Number.isInteger(id) && id >= 0) {
          const idx = context.sampleKeyToIndex.get(`freesound:${id}`);
          if (idx !== void 0) return toSeqIndexExpr(expr.loc, idx);
        }
        return { kind: "undefined", loc: expr.loc };
      }
      if (isRecord) {
        return injectRecordArgs(context.sampleKeyToIndex, expr, callee, args, recordKeyFallback(expr));
      }
      const withIndex = (idx) => ({
        kind: "named",
        name: "%index",
        value: toSeqIndexExpr(expr.loc, idx),
        loc: expr.loc
      });
      if (isAd) {
        const idx = context.allocAdIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isAdsr) {
        const idx = context.allocAdsrIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isEnvfollow) {
        const idx = context.allocEnvfollowIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isAnalyser) {
        const idx = context.allocAnalyserIndex();
        const filtered = [];
        let posSeen = 0;
        for (const a of args) {
          if (a?.kind === "named" && (a.name === "%index" || a.name === "index")) continue;
          if (a?.kind !== "pos") {
            filtered.push(a);
            continue;
          }
          if (posSeen === 0) filtered.push(a);
          posSeen++;
        }
        return { ...expr, callee, args: [...filtered, withIndex(idx)] };
      }
      if (isCompressor) {
        const idx = context.allocCompressorIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isExpander) {
        const idx = context.allocExpanderIndex();
        const filtered = [];
        for (const a of args) {
          const drop = a?.kind === "named" && (a.name === "%index" || a.name === "index");
          if (!drop) filtered.push(a);
        }
        return { ...expr, callee, args: [...filtered, withIndex(idx)] };
      }
      if (isGate) {
        const idx = context.allocGateIndex();
        const filtered = [];
        for (const a of args) {
          const drop = a?.kind === "named" && (a.name === "%index" || a.name === "index");
          if (!drop) filtered.push(a);
        }
        return { ...expr, callee, args: [...filtered, withIndex(idx)] };
      }
      if (isLimiter) {
        const idx = context.allocLimiterIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isFilter) {
        const idx = context.allocFilterIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isLfo) {
        const idx = context.allocLfoIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (calleeName === "every") {
        const idx = context.allocTrigIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (calleeName === "at") {
        const idx = context.allocTrigIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (calleeName === "euclid") {
        const idx = context.allocTrigIndex();
        return { ...expr, callee, args: [...args, withIndex(idx)] };
      }
      if (isOut) {
        let audioArg = null;
        for (const a of args) {
          if (a?.kind === "pos") {
            audioArg = a;
            break;
          }
        }
        const audioExpr = audioArg?.value;
        const audioCalleeName = audioExpr?.kind === "call" && audioExpr.callee?.kind === "ident" ? audioExpr.callee.name : null;
        const isAlreadyAnalysed = audioCalleeName === "analyser" || audioCalleeName === "amplitude" || audioCalleeName === "waveform" || audioCalleeName === "spectrum" || audioCalleeName === "level" || audioCalleeName === "print";
        if (audioArg?.kind === "pos" && audioExpr && !isAlreadyAnalysed) {
          const idx = context.allocAnalyserIndex();
          const calleeLoc = expr.callee?.loc ?? expr.loc;
          context.implicitAnalyserRefs.push({
            kind: "analyser",
            analyserIndex: idx,
            loc: calleeLoc,
            aboveLoc: calleeLoc,
            callLoc: expr.loc
          });
          return { ...expr, callee, args, __tapAnalyserIndex: idx };
        }
      }
      if (isMini || isPlay) {
        let seqArg;
        for (const a of args) {
          if (a?.kind === "named" && a.name === "seq") {
            seqArg = a;
            break;
          }
        }
        if (!seqArg) {
          for (const a of args) {
            if (a?.kind === "pos") {
              seqArg = a;
              break;
            }
          }
        }
        if (seqArg?.kind === "pos" || seqArg?.kind === "named") {
          const v = seqArg.value;
          if (v?.kind === "string") {
            const idx = context.sequenceToIndex.get(String(v.value ?? ""));
            if (idx !== void 0) {
              seqArg.value = toSeqIndexExpr(v.loc, idx);
            }
          }
        }
        const argsNoColor = stripMiniColorArg(args);
        let seqArg2;
        for (const a of argsNoColor) {
          if (a?.kind === "named" && a.name === "seq") {
            seqArg2 = a;
            break;
          }
        }
        if (!seqArg2) {
          for (const a of argsNoColor) {
            if (a?.kind === "pos") {
              seqArg2 = a;
              break;
            }
          }
        }
        if (isMini && argsNoColor.length === 1 && seqArg2 && (seqArg2.kind === "pos" || seqArg2.kind === "named")) {
          return seqArg2.value;
        }
        if (isPlay) {
          return { ...expr, callee: { kind: "ident", name: "mini", loc: callee.loc }, args: argsNoColor };
        }
        return { ...expr, callee, args: argsNoColor };
      }
      if (isTram) {
        let seqArg;
        for (const a of args) {
          if (a?.kind === "pos") {
            seqArg = a;
            break;
          }
        }
        if (seqArg?.kind === "pos") {
          const v = seqArg.value;
          if (v?.kind === "string") {
            const idx = context.sequenceToIndex.get(String(v.value ?? ""));
            if (idx !== void 0) {
              seqArg.value = toSeqIndexExpr(v.loc, idx);
            }
          }
        }
        return { ...expr, callee, args };
      }
      if (isTimeline) {
        let seqArg = null;
        for (const a of args) {
          if (a?.kind === "named" && a.name === "seq") {
            seqArg = a;
            break;
          }
        }
        let firstPos = null;
        let secondPos = null;
        let firstStringPos = null;
        for (const a of args) {
          if (a?.kind !== "pos") continue;
          if (!firstPos) firstPos = a;
          else if (!secondPos) secondPos = a;
          if (!firstStringPos && a.value?.kind === "string") firstStringPos = a;
        }
        if (!seqArg) seqArg = firstStringPos ?? secondPos ?? firstPos;
        if (seqArg?.kind === "pos" || seqArg?.kind === "named") {
          const v = seqArg.value;
          if (v?.kind === "string") {
            const key = String(v.value ?? "");
            const idx = context.timelineKeyToIndex.get(key);
            if (idx !== void 0) {
              seqArg.value = toSeqIndexExpr(v.loc, context.miniCount + idx);
              return {
                ...expr,
                callee,
                args: [{ kind: "pos", value: seqArg.value }]
              };
            }
          }
        }
      }
      return { ...expr, callee, args };
    }
    if (expr.kind === "binary") {
      return { ...expr, left: transformExpr(context, expr.left), right: transformExpr(context, expr.right) };
    }
    if (expr.kind === "assign") {
      if (expr.op === "=" && expr.target?.kind === "ident" && expr.target.name === "scale") {
        const v = expr.value;
        const name = v?.kind === "string" ? String(v.value ?? "") : v?.kind === "ident" ? String(v.name ?? "") : "";
        if (name) {
          const idx = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0;
          return {
            ...expr,
            target: transformExpr(context, expr.target),
            value: { kind: "number", value: idx, raw: String(idx), loc: v?.loc ?? expr.loc }
          };
        }
      }
      if (expr.op === "=" && expr.target?.kind === "ident" && expr.value?.kind === "call" && expr.value.callee?.kind === "ident" && expr.value.callee.name === "record") {
        const target = transformExpr(context, expr.target);
        const call = expr.value;
        const callee = transformExpr(context, call.callee);
        const inArgs = call.args ?? [];
        const args = inArgs.length ? inArgs.map((a) => a.kind === "pos" || a.kind === "named" ? { ...a, value: transformExpr(context, a.value) } : a) : inArgs;
        const key = recordKeyFromAssign(expr.target.name, expr.loc);
        return { ...expr, target, value: injectRecordArgs(context.sampleKeyToIndex, call, callee, args, key) };
      }
      return { ...expr, target: transformExpr(context, expr.target), value: transformExpr(context, expr.value) };
    }
    if (expr.kind === "unary" || expr.kind === "postfix") {
      return { ...expr, expr: transformExpr(context, expr.expr) };
    }
    if (expr.kind === "member") {
      const out = { ...expr, object: transformExpr(context, expr.object) };
      if (expr.computed) out.index = transformExpr(context, expr.index);
      return out;
    }
    if (expr.kind === "array") {
      const inItems = expr.items ?? [];
      if (!inItems.length) return { ...expr, items: [] };
      const items = new Array(inItems.length);
      for (let i = 0; i < inItems.length; i++) items[i] = transformExpr(context, inItems[i]);
      return { ...expr, items };
    }
    if (expr.kind === "object") {
      const inProps = expr.props ?? [];
      if (!inProps.length) return { ...expr, props: [] };
      const props = new Array(inProps.length);
      for (let i = 0; i < inProps.length; i++) {
        const p = inProps[i];
        props[i] = { ...p, value: transformExpr(context, p.value) };
      }
      return { ...expr, props };
    }
    if (expr.kind === "if") {
      const thenPart = expr.then?.kind === "block" ? transformStmt(context, expr.then) : transformExpr(context, expr.then);
      const elsePart = expr.else?.kind === "block" ? transformStmt(context, expr.else) : transformExpr(context, expr.else);
      return { ...expr, test: transformExpr(context, expr.test), then: thenPart, else: elsePart };
    }
    if (expr.kind === "func") {
      const inParams = expr.params ?? [];
      const params = new Array(inParams.length);
      for (let i = 0; i < inParams.length; i++) {
        const p = inParams[i];
        if (p?.default) {
          const clonedDefault = JSON.parse(JSON.stringify(p.default));
          params[i] = { ...p, default: transformExpr(context, clonedDefault) };
        } else {
          params[i] = p;
        }
      }
      const body = expr.body?.kind === "block" ? transformStmt(context, expr.body) : transformExpr(context, expr.body);
      const initStmts = [];
      for (const p of params) {
        if (p?.default && !p.isRest) {
          const pLoc = p.loc ?? expr.loc;
          const ident = { kind: "ident", name: p.name, loc: pLoc };
          const test = {
            kind: "binary",
            op: "===",
            left: ident,
            right: { kind: "undefined", loc: pLoc },
            loc: pLoc
          };
          const value = {
            kind: "if",
            test,
            then: p.default,
            else: ident,
            loc: pLoc,
            __noBranchMark: true
          };
          const assign = {
            kind: "assign",
            op: "=",
            target: ident,
            value,
            loc: pLoc
          };
          initStmts.push({ kind: "expr_stmt", expr: assign, loc: pLoc });
        }
        if (p?.pattern) {
          const pLoc = p.loc ?? expr.loc;
          initStmts.push({
            kind: "destructure",
            pattern: p.pattern,
            value: { kind: "ident", name: p.name, loc: pLoc },
            loc: pLoc
          });
        }
      }
      if (initStmts.length === 0) return { ...expr, params, body };
      if (body?.kind === "block") {
        return { ...expr, params, body: { ...body, body: [...initStmts, ...body.body ?? []] } };
      }
      return {
        ...expr,
        params,
        body: {
          kind: "block",
          body: [...initStmts, { kind: "expr_stmt", expr: body, loc: body.loc }],
          loc: expr.loc
        }
      };
    }
    return expr;
  }
  function transformStmt(context, stmt) {
    if (!stmt) return stmt;
    if (stmt.kind === "expr_stmt") {
      if (context.isVisualizerAssign(stmt)) return null;
      const isBpmStmt = !!(stmt.expr?.kind === "assign" && stmt.expr.target?.kind === "ident" && stmt.expr.target?.name === "bpm");
      if (isBpmStmt) return null;
      const isBarsStmt = !!(stmt.expr?.kind === "assign" && stmt.expr.target?.kind === "ident" && stmt.expr.target?.name === "bars");
      if (isBarsStmt) return null;
      const isLabelStmt = !!(stmt.expr?.kind === "call" && stmt.expr.callee?.kind === "ident" && stmt.expr.callee?.name === "label");
      if (isLabelStmt) return null;
      return { ...stmt, expr: transformExpr(context, stmt.expr) };
    }
    if (stmt.kind === "block") {
      const out = [];
      for (const s of stmt.body ?? []) {
        const t = transformStmt(context, s);
        if (t) out.push(t);
      }
      return { ...stmt, body: out };
    }
    if (stmt.kind === "for") {
      if (stmt.head?.kind === "c_style") {
        return {
          ...stmt,
          head: {
            ...stmt.head,
            init: stmt.head.init ? transformExpr(context, stmt.head.init) : void 0,
            test: stmt.head.test ? transformExpr(context, stmt.head.test) : void 0,
            update: stmt.head.update ? transformExpr(context, stmt.head.update) : void 0
          },
          body: transformStmt(context, stmt.body)
        };
      }
      return {
        ...stmt,
        head: { ...stmt.head, iterable: transformExpr(context, stmt.head.iterable) },
        body: transformStmt(context, stmt.body)
      };
    }
    if (stmt.kind === "while" || stmt.kind === "do_while") {
      return { ...stmt, test: transformExpr(context, stmt.test), body: transformStmt(context, stmt.body) };
    }
    if (stmt.kind === "switch") {
      return {
        ...stmt,
        test: transformExpr(context, stmt.test),
        cases: (stmt.cases ?? []).map((c) => ({
          ...c,
          test: c.test ? transformExpr(context, c.test) : void 0,
          body: (c.body ?? []).map((s) => transformStmt(context, s)).filter(Boolean)
        }))
      };
    }
    if (stmt.kind === "try") {
      return {
        ...stmt,
        body: transformStmt(context, stmt.body),
        catchBody: stmt.catchBody ? transformStmt(context, stmt.catchBody) : void 0,
        finallyBody: stmt.finallyBody ? transformStmt(context, stmt.finallyBody) : void 0
      };
    }
    if (stmt.kind === "throw") return { ...stmt, value: transformExpr(context, stmt.value) };
    if (stmt.kind === "return") return { ...stmt, value: stmt.value ? transformExpr(context, stmt.value) : void 0 };
    if (stmt.kind === "label") return { ...stmt, stmt: transformStmt(context, stmt.stmt) };
    if (stmt.kind === "destructure") return { ...stmt, value: transformExpr(context, stmt.value) };
    return stmt;
  }
  function getKernelCached(src) {
    const cached = kernelCache.get(src);
    if (cached) return cached;
    const lexed = lex(src, { preludeLines: KERNEL_LEX_LINES, postludeStart: Infinity });
    const parsed = parse(src, lexed.tokens);
    const entry = {
      src,
      lexErrors: lexed.errors,
      program: parsed.program,
      parseErrors: parsed.errors
    };
    kernelCache.set(src, entry);
    return entry;
  }
  const DEFAULT_KERNEL = (() => {
    const preludeSrc = normalizePrelude(PRELUDE);
    const postludeSrc = normalizePrelude(POSTLUDE);
    return {
      preludeSrc,
      postludeSrc,
      prelude: getKernelCached(preludeSrc),
      postlude: getKernelCached(postludeSrc)
    };
  })();
  function extractEarlyDataFromProgram(src, program, errors, sampleKeyToIndex = persistentSampleKeyToIndex) {
    const sequences = [];
    const miniRefs = [];
    const miniPlayBars = [];
    const tramRefs = [];
    const tramSequences = [];
    const timelineSequences = [];
    const timelineRefs = [];
    const timelineLabels = [];
    const samples2 = [];
    const numberParams = [];
    const filterNumberLiterals = [];
    const numberLiterals = [];
    const result = {
      bpm: void 0,
      bars: void 0,
      scale: void 0
    };
    const visitors = [
      createBpmVisitor(src, errors, result),
      createBarsVisitor(src, errors, result),
      createScaleVisitor(src, errors, result),
      createMiniSequencesVisitor(src, sequences, miniRefs, miniPlayBars),
      createTramSequencesVisitor(src, tramSequences, tramRefs),
      createTimelineSequencesVisitor(src, timelineSequences, timelineRefs),
      createTimelineLabelsVisitor(timelineLabels),
      createSamplesVisitor(src, samples2, errors, sampleKeyToIndex),
      createNumberParamsVisitor(numberParams),
      createFilterNumberLiteralsVisitor(filterNumberLiterals),
      createNumberLiteralsVisitor(numberLiterals)
    ];
    walkAst(program, visitors, { src });
    return {
      bpm: result.bpm,
      bars: result.bars,
      scale: result.scale,
      sequences,
      miniRefs,
      miniPlayBars,
      tramSequences,
      tramRefs,
      timelineSequences,
      timelineRefs,
      timelineLabels,
      samples: samples2,
      numberParams: numberParams.filter((p) => p.line > 0),
      filterNumberLiterals: filterNumberLiterals.filter((p) => p.line > 0),
      numberLiterals: numberLiterals.filter((p) => p.line > 0)
    };
  }
  function extractAllRefsFromProgram(src, program) {
    const analyserRefs = [];
    const knobRefs = [];
    const slicerRefs = [];
    const everyRefs = [];
    const atRefs = [];
    const euclidRefs = [];
    const visitors = [
      createAnalyserVisitor(src, analyserRefs),
      createGenericKnobVisitor(src, knobRefs),
      createSlicersVisitor(src, slicerRefs),
      createEveryVisitor(everyRefs),
      createAtVisitor(atRefs),
      createEuclidVisitor(euclidRefs)
    ];
    walkAst(program, visitors, { src });
    const compressorRefs = [];
    const expanderRefs = [];
    const gateRefs = [];
    const limiterRefs = [];
    const filterRefs = [];
    const adRefs = [];
    const adsrRefs = [];
    const envfollowRefs = [];
    const slewRefs = [];
    const reverbRefs = [];
    const lfoRefs = [];
    for (const ref of knobRefs) {
      if (ref.functionName === "compressor") compressorRefs.push(ref);
      else if (ref.functionName === "expander") expanderRefs.push(ref);
      else if (ref.functionName === "gate") gateRefs.push(ref);
      else if (ref.functionName === "limiter") limiterRefs.push(ref);
      else if ([
        "lp",
        "hp",
        "bp",
        "bs",
        "ls",
        "hs",
        "peak",
        "ap",
        "slp",
        "shp",
        "sbp",
        "sbs",
        "speak",
        "sap",
        "mlp",
        "mhp",
        "diodeladder",
        "olp",
        "ohp"
      ].includes(ref.functionName)) filterRefs.push(ref);
      else if (ref.functionName === "ad") adRefs.push(ref);
      else if (ref.functionName === "adsr") adsrRefs.push(ref);
      else if (ref.functionName === "envfollow") envfollowRefs.push(ref);
      else if (ref.functionName === "slew") slewRefs.push(ref);
      else if (["freeverb", "dattorro", "fdn", "velvet"].includes(ref.functionName)) reverbRefs.push(ref);
      else if (["lfosine", "lfotri", "lfosaw", "lforamp", "lfosqr", "lfosah", "smooth", "fractal"].includes(
        ref.functionName
      )) lfoRefs.push(ref);
    }
    return {
      adRefs,
      adsrRefs,
      envfollowRefs,
      slewRefs,
      analyserRefs,
      compressorRefs,
      expanderRefs,
      gateRefs,
      limiterRefs,
      filterRefs,
      reverbRefs,
      slicerRefs,
      lfoRefs,
      everyRefs,
      atRefs,
      euclidRefs
    };
  }
  let pcMapScratch = new Int32Array(0);
  const getPcMap = (minLen) => {
    minLen = Math.max(0, minLen | 0);
    if (pcMapScratch.length >= minLen) return pcMapScratch;
    let cap = pcMapScratch.length > 0 ? pcMapScratch.length : 1024;
    while (cap < minLen) cap <<= 1;
    pcMapScratch = new Int32Array(cap);
    return pcMapScratch;
  };
  function encodeChunkVm(ctx, chunk, base) {
    const {
      src,
      errors,
      ops,
      literals,
      symOf,
      sliderKeyOf,
      sliderKeys,
      litOfValue,
      litOfLocKey,
      locKeyToLiteralIndex,
      arrayLiterals,
      branchMarks,
      funcPatches,
      funcQueue
    } = ctx;
    const code = chunk.code;
    const codeLen = code.length | 0;
    const consts = chunk.consts;
    const funcs = chunk.funcs;
    const pcMap = getPcMap(codeLen);
    let pc = base | 0;
    for (let i = 0; i < codeLen; i++) {
      pcMap[i] = pc;
      const ins = code[i];
      const op = ins.op;
      switch (op) {
        case "PUSH_CONST": {
          const v = consts[ins.k];
          if (typeof v === "number" || typeof v === "string" || typeof v === "boolean") pc = pc + 2 | 0;
          else pc = pc + 1 | 0;
          break;
        }
        case "ENTER_SCOPE":
        case "EXIT_SCOPE":
        case "POP":
        case "DUP":
        case "BRANCH":
        case "LABEL":
        case "RETURN":
        case "THROW":
        case "TRY_BEGIN":
        case "CATCH_BEGIN":
        case "FINALLY_BEGIN":
        case "TRY_END":
        case "LEN":
          pc = pc + 1 | 0;
          break;
        case "DUP2":
          errors.push(encoderError(src, "DUP2 not supported in VM encoder yet"));
          pc = pc + 1 | 0;
          break;
        case "LOAD":
        case "STORE":
        case "UNARY":
        case "BINARY":
        case "FUNC":
        case "ARRAY":
          pc = pc + 2 | 0;
          break;
        case "CALL":
          pc = pc + 3 | 0;
          break;
        case "JUMP":
        case "JUMP_IF_FALSE":
          pc = pc + 2 | 0;
          break;
        case "BREAK":
        case "CONTINUE":
          errors.push(encoderError(src, `${op} not supported in VM encoder yet`));
          pc = pc + 1 | 0;
          break;
        case "GET_INDEX":
        case "GET_INDEX2":
        case "SET_INDEX":
          pc = pc + 1 | 0;
          break;
        case "OBJECT":
        case "GET_PROP":
        case "SET_PROP":
          errors.push(encoderError(src, `${op} not supported in VM encoder yet`));
          pc = pc + 1 | 0;
          break;
        default:
          errors.push(encoderError(src, `Unsupported opcode ${op}`));
          pc = pc + 1 | 0;
      }
    }
    const endPc = pc;
    const arrayMeta = chunk.arrayLiterals;
    if (arrayMeta?.length) {
      for (let i = 0; i < arrayMeta.length; i++) {
        const lit = arrayMeta[i];
        const pcAt = pcMap[lit.ins];
        if (pcAt !== void 0) arrayLiterals.push({ pc: pcAt, loc: lit.loc, items: lit.items });
      }
    }
    const branchMeta = chunk.branchMarks;
    if (branchMeta?.length) {
      for (let i = 0; i < branchMeta.length; i++) {
        const m = branchMeta[i];
        const pcAt = pcMap[m.ins];
        if (pcAt !== void 0) branchMarks.push({ pc: pcAt, loc: m.loc });
      }
    }
    let w = base | 0;
    for (let i = 0; i < codeLen; i++) {
      const ins = code[i];
      const op = ins.op;
      switch (op) {
        case "PUSH_CONST": {
          const v = consts[ins.k];
          if (typeof v === "number") {
            const loc = ins.loc;
            const key = loc ? sliderKeyOf(loc) : void 0;
            const isSlider = key !== void 0 && sliderKeys.has(key);
            const k = (key !== void 0 ? litOfLocKey(key, v) : litOfValue(v)) | 0;
            literals[k] = v;
            ops[w++] = isSlider ? VmOp.PushNumSmoothed : VmOp.PushNum;
            ops[w++] = k;
            if (key !== void 0) locKeyToLiteralIndex.set(key, k);
          } else if (typeof v === "string") {
            ops[w++] = VmOp.PushSym;
            ops[w++] = symOf(v) | 0;
          } else if (typeof v === "boolean") {
            ops[w++] = VmOp.PushBool;
            ops[w++] = v ? 1 : 0;
          } else if (v === null) {
            ops[w++] = VmOp.PushNull;
          } else {
            ops[w++] = VmOp.PushUndef;
          }
          break;
        }
        case "ENTER_SCOPE":
          ops[w++] = VmOp.EnterScope;
          break;
        case "EXIT_SCOPE":
          ops[w++] = VmOp.ExitScope;
          break;
        case "BRANCH":
          ops[w++] = VmOp.Branch;
          break;
        case "POP":
          ops[w++] = VmOp.Pop;
          break;
        case "DUP":
          ops[w++] = VmOp.Dup;
          break;
        case "LABEL":
          ops[w++] = VmOp.Nop;
          break;
        case "LOAD": {
          const name = String(consts[ins.name]);
          ops[w++] = VmOp.Load;
          ops[w++] = symOf(name) | 0;
          break;
        }
        case "STORE": {
          const name = String(consts[ins.name]);
          ops[w++] = VmOp.Store;
          ops[w++] = symOf(name) | 0;
          break;
        }
        case "UNARY": {
          const code2 = unaryCode(ins.opName);
          if (code2 === null) {
            errors.push(encoderError(src, `Unsupported unary op ${ins.opName}`));
            ops[w++] = VmOp.Nop;
            break;
          }
          ops[w++] = VmOp.Unary;
          ops[w++] = code2 | 0;
          break;
        }
        case "BINARY": {
          const code2 = binaryCode(ins.opName);
          if (code2 === null) {
            errors.push(encoderError(src, `Unsupported binary op ${ins.opName}`));
            ops[w++] = VmOp.Nop;
            break;
          }
          ops[w++] = VmOp.Binary;
          ops[w++] = code2 | 0;
          break;
        }
        case "ARRAY": {
          ops[w++] = VmOp.Array;
          ops[w++] = ins.n | 0;
          break;
        }
        case "LEN": {
          ops[w++] = VmOp.Len;
          break;
        }
        case "GET_INDEX": {
          ops[w++] = VmOp.GetIndex;
          break;
        }
        case "GET_INDEX2": {
          ops[w++] = VmOp.GetIndex2;
          break;
        }
        case "SET_INDEX": {
          ops[w++] = VmOp.SetIndex;
          break;
        }
        case "CALL":
          ops[w++] = VmOp.Call;
          ops[w++] = ins.pos | 0;
          ops[w++] = ins.named | 0;
          break;
        case "JUMP": {
          ops[w++] = VmOp.Jump;
          const to = ins.to;
          ops[w++] = to === codeLen ? endPc : pcMap[to] ?? endPc;
          break;
        }
        case "JUMP_IF_FALSE": {
          ops[w++] = VmOp.JumpIfFalse;
          const to = ins.to;
          ops[w++] = to === codeLen ? endPc : pcMap[to] ?? endPc;
          break;
        }
        case "RETURN":
          ops[w++] = VmOp.Return;
          break;
        case "THROW":
          ops[w++] = VmOp.Throw;
          break;
        case "TRY_BEGIN":
        case "CATCH_BEGIN":
        case "FINALLY_BEGIN":
        case "TRY_END":
          ops[w++] = VmOp.Nop;
          break;
        case "FUNC": {
          const fn = funcs[ins.id];
          if (!fn) {
            errors.push(encoderError(src, `Missing FUNC #${ins.id}`));
            ops[w++] = VmOp.PushUndef;
            break;
          }
          ops[w++] = VmOp.Func;
          const at = w++;
          funcPatches.push({ at, fn });
          funcQueue.push(fn);
          ops[at] = 0;
          break;
        }
        default:
          errors.push(encoderError(src, `Unsupported opcode ${op}`));
          ops[w++] = VmOp.Nop;
      }
    }
    return { endPc, writtenEnd: w };
  }
  function encodeLangToVmOps(src, target, prelude = PRELUDE, postlude = POSTLUDE) {
    const mapError = (e) => {
      if (e.line <= 0) return { ...e, line: 0, column: 0, code: "" };
      return { ...e, code: lineText(src, e.line) };
    };
    try {
      const useDefaultKernel = prelude === PRELUDE && postlude === POSTLUDE;
      const preludeKernel = useDefaultKernel ? DEFAULT_KERNEL.prelude : getKernelCached(normalizePrelude(prelude));
      const postludeKernel = useDefaultKernel ? DEFAULT_KERNEL.postlude : getKernelCached(normalizePrelude(postlude));
      const userLexed = lex(src, { preludeLines: 0, postludeStart: Infinity });
      const userTokens = userLexed.tokens;
      const lexErrors = userLexed.errors.map(mapError);
      const userParsed = parse(src, userTokens);
      const errors = [...lexErrors, ...userParsed.errors.map(mapError)];
      let visualizerVertex;
      let visualizerFragment;
      const isVisualizerAssign = (stmt) => {
        if (stmt?.kind !== "expr_stmt") return false;
        const e = stmt.expr;
        if (e?.kind !== "assign" || e.op !== "=") return false;
        const t = e.target;
        const v = e.value;
        if (t?.kind !== "ident") return false;
        if (v?.kind !== "string") return false;
        if (t.name === "vertex") {
          visualizerVertex = String(v.value ?? "");
          return true;
        }
        if (t.name === "fragment") {
          visualizerFragment = String(v.value ?? "");
          return true;
        }
        return false;
      };
      const scanVisualizer = (stmt) => {
        if (!stmt) return;
        isVisualizerAssign(stmt);
        if (stmt.kind === "block") {
          for (const s of stmt.body ?? []) scanVisualizer(s);
        } else if (stmt.kind === "for") {
          scanVisualizer(stmt.body);
        } else if (stmt.kind === "while" || stmt.kind === "do_while") {
          scanVisualizer(stmt.body);
        } else if (stmt.kind === "switch") {
          for (const c of stmt.cases ?? []) {
            for (const s of c.body ?? []) scanVisualizer(s);
          }
        } else if (stmt.kind === "try") {
          scanVisualizer(stmt.body);
          if (stmt.catchBody) scanVisualizer(stmt.catchBody);
          if (stmt.finallyBody) scanVisualizer(stmt.finallyBody);
        } else if (stmt.kind === "label") {
          scanVisualizer(stmt.stmt);
        }
      };
      for (const s of userParsed.program?.body ?? []) scanVisualizer(s);
      if (errors.length) return { errors: errors.map(mapError), visualizerVertex, visualizerFragment };
      const sharedSampleKeyToIndex = new Map(persistentSampleKeyToIndex);
      const earlyData = extractEarlyDataFromProgram(src, userParsed.program, errors, sharedSampleKeyToIndex);
      if (errors.length) return { errors: errors.map(mapError) };
      const preludeSequences = [];
      const preludeMiniRefs = [];
      const preludeMiniPlayBars = [];
      const preludeTramSequences = [];
      const preludeTramRefs = [];
      const preludeSamples = [];
      const preludeBpmResult = { bpm: void 0 };
      const preludeVisitors = [
        createMiniSequencesVisitor("", preludeSequences, preludeMiniRefs, preludeMiniPlayBars),
        createTramSequencesVisitor("", preludeTramSequences, preludeTramRefs),
        createSamplesVisitor("", preludeSamples, errors, sharedSampleKeyToIndex),
        createBpmVisitor("", errors, preludeBpmResult)
      ];
      walkAst(preludeKernel.program, preludeVisitors);
      const {
        bpm,
        bars,
        scale,
        sequences: userSequences,
        miniRefs: allMiniRefs,
        miniPlayBars: allMiniPlayBars,
        tramSequences: userTramSequences,
        tramRefs: userTramRefs,
        timelineSequences: allTimelineSequences,
        timelineRefs: allTimelineRefs,
        timelineLabels: allTimelineLabels,
        samples: allSamples,
        numberParams: allExplicitNumberParams,
        filterNumberLiterals: allLpNumberLiterals,
        numberLiterals: allNumberLiterals
      } = earlyData;
      const finalBpm = bpm ?? preludeBpmResult.bpm;
      const sequences = [...preludeSequences, ...userSequences];
      const samples2 = [...preludeSamples, ...allSamples];
      const tramSequences = [...preludeTramSequences, ...userTramSequences];
      const preludeTramSeqCount = preludeTramSequences.length;
      const tramRefs = [
        ...preludeTramRefs,
        ...userTramRefs.map((ref) => ({ ...ref, seqIndex: ref.seqIndex + preludeTramSeqCount }))
      ];
      const preludeSeqCount = preludeSequences.length;
      const miniRefs = allMiniRefs.map((ref) => ({ ...ref, seqIndex: ref.seqIndex + preludeSeqCount }));
      const miniPlayBars = [...new Array(preludeSeqCount).fill(void 0), ...allMiniPlayBars];
      const timelineSequences = allTimelineSequences;
      const timelineRefs = allTimelineRefs;
      const timelineLabels = allTimelineLabels;
      const explicitNumberParams = allExplicitNumberParams;
      const numberLiterals = allNumberLiterals;
      const numberParams = explicitNumberParams;
      let adRefs = [];
      let adsrRefs = [];
      let envfollowRefs = [];
      let slewRefs = [];
      let analyserRefs = [];
      let compressorRefs = [];
      let expanderRefs = [];
      let gateRefs = [];
      let limiterRefs = [];
      let filterRefs = [];
      let reverbRefs = [];
      let slicerRefs = [];
      let lfoRefs = [];
      let everyRefs = [];
      let atRefs = [];
      let euclidRefs = [];
      const sliderKeyOf = (loc) => `${loc.line}:${loc.column}:${loc.length}`;
      const sliderKeys = new Set(numberParams.map((p) => sliderKeyOf(p)));
      const sequenceToIndex = /* @__PURE__ */ new Map();
      sequences.forEach((seq, idx) => sequenceToIndex.set(seq, idx));
      tramSequences.forEach((seq, idx) => sequenceToIndex.set(seq, sequences.length + idx));
      const timelineKeyToIndex = /* @__PURE__ */ new Map();
      timelineSequences.forEach((s, idx) => timelineKeyToIndex.set(s.sequence, idx));
      const miniCount = sequences.length + tramSequences.length;
      const sampleKeyToIndex = sharedSampleKeyToIndex;
      const allocAnalyserIndex = createIndexAllocator({
        start: 0,
        max: FINAL_OUT_ANALYSER_L_INDEX - 1,
        reserved: [FINAL_OUT_ANALYSER_L_INDEX, FINAL_OUT_ANALYSER_R_INDEX]
      });
      const implicitAnalyserRefs = [];
      const allocCompressorIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocExpanderIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocGateIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocLimiterIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocFilterIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocLfoIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocReverbIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocAdIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocAdsrIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocEnvfollowIndex = createIndexAllocator({ start: 0, max: 63 });
      const allocTrigIndex = createIndexAllocator({ start: 0, max: 63 });
      const transformContext = {
        sequenceToIndex,
        timelineKeyToIndex,
        miniCount,
        sampleKeyToIndex,
        allocAnalyserIndex,
        allocCompressorIndex,
        allocExpanderIndex,
        allocGateIndex,
        allocLimiterIndex,
        allocFilterIndex,
        allocLfoIndex,
        allocReverbIndex,
        allocAdIndex,
        allocAdsrIndex,
        allocEnvfollowIndex,
        allocTrigIndex,
        implicitAnalyserRefs,
        isVisualizerAssign
      };
      transformedUserBodyScratch.length = 0;
      for (const s of userParsed.program?.body ?? []) {
        const t = transformStmt(transformContext, s);
        if (t) transformedUserBodyScratch.push(t);
      }
      transformedBodyScratch.length = 0;
      for (const s of preludeKernel.program?.body ?? []) {
        const t = transformStmt(transformContext, s);
        if (t) transformedBodyScratch.push(t);
      }
      for (const s of transformedUserBodyScratch) transformedBodyScratch.push(s);
      for (const s of postludeKernel.program?.body ?? []) {
        const t = transformStmt(transformContext, s);
        if (t) transformedBodyScratch.push(t);
      }
      const transformedProgram = {
        kind: "program",
        loc: { line: 0, column: 0, length: 0, kernel: true },
        body: transformedBodyScratch
      };
      const undefinedVarErrors = checkUndefinedVariableErrors(src, transformedProgram).filter((e) => e.line > 0);
      errors.push(...undefinedVarErrors);
      if (errors.length) return { errors: errors.map(mapError) };
      const nonKernelProgram = { ...transformedProgram, body: transformedUserBodyScratch };
      const extractionResults = extractAllRefsFromProgram(src, nonKernelProgram);
      adRefs = extractionResults.adRefs;
      adsrRefs = extractionResults.adsrRefs;
      envfollowRefs = extractionResults.envfollowRefs;
      slewRefs = extractionResults.slewRefs;
      const seenAnalyserIndices = /* @__PURE__ */ new Set();
      const allAnalyserRefs = [...extractionResults.analyserRefs, ...implicitAnalyserRefs.filter((r) => !r.loc?.kernel)];
      analyserRefs = allAnalyserRefs.filter((ref) => {
        if (seenAnalyserIndices.has(ref.analyserIndex)) return false;
        seenAnalyserIndices.add(ref.analyserIndex);
        return true;
      });
      compressorRefs = extractionResults.compressorRefs;
      expanderRefs = extractionResults.expanderRefs;
      gateRefs = extractionResults.gateRefs;
      limiterRefs = extractionResults.limiterRefs;
      filterRefs = extractionResults.filterRefs;
      reverbRefs = extractionResults.reverbRefs;
      slicerRefs = extractionResults.slicerRefs;
      lfoRefs = extractionResults.lfoRefs;
      everyRefs = extractionResults.everyRefs;
      atRefs = extractionResults.atRefs;
      euclidRefs = extractionResults.euclidRefs;
      const compiled = compile(src, transformedProgram);
      errors.push(...compiled.errors);
      if (errors.length) return { errors: errors.map(mapError) };
      const chunk = compiled.chunk;
      const arrayLiterals = [];
      const branchMarks = [];
      const syms = /* @__PURE__ */ new Map();
      let nextSym = 1e3;
      const symOf = (s) => {
        const b = builtinSyms[s];
        if (b !== void 0) return b;
        const prev = syms.get(s);
        if (prev !== void 0) return prev;
        const id = nextSym++;
        syms.set(s, id);
        return id;
      };
      let litCount = 0;
      const litIndexByValue = /* @__PURE__ */ new Map();
      const litIndexByLocKey = /* @__PURE__ */ new Map();
      const locKeyToLiteralIndex = /* @__PURE__ */ new Map();
      const allocLit = () => litCount++;
      const litOfValue = (v) => {
        const prev = litIndexByValue.get(v);
        if (prev !== void 0) return prev;
        if (litCount >= target.literals.length) {
          errors.push(encoderError(src, `Too many number literals (max ${target.literals.length})`));
          return 0;
        }
        const idx = allocLit();
        litIndexByValue.set(v, idx);
        return idx;
      };
      const litOfLocKey = (key, value) => {
        const prev = litIndexByLocKey.get(key);
        if (prev !== void 0 && target.literals[prev] === value) return prev;
        if (litCount >= target.literals.length) {
          errors.push(encoderError(src, `Too many number literals (max ${target.literals.length})`));
          return 0;
        }
        const idx = allocLit();
        litIndexByLocKey.set(key, idx);
        return idx;
      };
      target.ops.fill(0);
      target.literals.fill(0);
      target.ops[0] = VM_MAGIC;
      const funcOffsets = /* @__PURE__ */ new Map();
      const funcPatches = [];
      const funcQueue = [];
      const vmFuncHeader = -2;
      const encodeChunkCtx = {
        src,
        errors,
        ops: target.ops,
        literals: target.literals,
        symOf,
        sliderKeyOf,
        sliderKeys,
        litOfValue,
        litOfLocKey,
        locKeyToLiteralIndex,
        arrayLiterals,
        branchMarks,
        funcPatches,
        funcQueue
      };
      let writePc = 1;
      const main = encodeChunkVm(encodeChunkCtx, chunk, writePc);
      writePc = main.writtenEnd;
      target.ops[writePc++] = VmOp.End;
      for (let qi = 0; qi < funcQueue.length; qi++) {
        const fn = funcQueue[qi];
        if (funcOffsets.has(fn)) continue;
        const funcPc = writePc;
        funcOffsets.set(fn, funcPc);
        const params = fn.params;
        target.ops[writePc++] = vmFuncHeader;
        target.ops[writePc++] = params.length;
        for (const p of params) {
          target.ops[writePc++] = symOf(p.name);
        }
        const body = encodeChunkVm(encodeChunkCtx, fn.chunk, writePc);
        writePc = body.writtenEnd;
        target.ops[writePc++] = VmOp.PushUndef;
        target.ops[writePc++] = VmOp.Return;
      }
      for (const p of funcPatches) {
        const off = funcOffsets.get(p.fn);
        if (off === void 0) {
          errors.push(encoderError(src, "Unpatched function offset"));
          target.ops[p.at] = 0;
        } else {
          target.ops[p.at] = off;
        }
      }
      const timelineRefsMapped = timelineRefs.map((r) => ({ ...r, seqIndex: miniCount + r.seqIndex }));
      const numberParamsWithLiteralIndex = numberParams.map((p) => ({
        ...p,
        literalIndex: locKeyToLiteralIndex.get(sliderKeyOf(p))
      }));
      const numberLiteralsWithLiteralIndex = numberLiterals.map((p) => ({
        ...p,
        literalIndex: locKeyToLiteralIndex.get(sliderKeyOf(p))
      }));
      const filteredArrayLiterals = arrayLiterals.filter((a) => !a.loc.kernel && a.loc.line > 0);
      const filteredBranchMarks = branchMarks.filter((m) => !m.loc.kernel && m.loc.line > 0);
      return errors.length ? {
        errors: errors.map(mapError),
        visualizerVertex,
        visualizerFragment,
        bpm,
        bars,
        scale,
        miniSequences: sequences,
        miniRefs,
        miniPlayBars,
        tramSequences,
        tramRefs,
        timelineSequences,
        timelineRefs: timelineRefsMapped,
        timelineLabels,
        adRefs,
        adsrRefs,
        envfollowRefs,
        slewRefs,
        analyserRefs,
        compressorRefs,
        expanderRefs,
        gateRefs,
        limiterRefs,
        filterRefs,
        reverbRefs,
        slicerRefs,
        lfoRefs,
        everyRefs,
        atRefs,
        euclidRefs,
        arrayLiterals: filteredArrayLiterals,
        branchMarks: filteredBranchMarks,
        numberParams: numberParamsWithLiteralIndex,
        numberLiterals: numberLiteralsWithLiteralIndex,
        sampleDefs: samples2
      } : {
        errors: [],
        visualizerVertex,
        visualizerFragment,
        bpm: finalBpm,
        bars,
        scale,
        miniSequences: sequences,
        miniRefs,
        miniPlayBars,
        tramSequences,
        tramRefs,
        timelineSequences,
        timelineRefs: timelineRefsMapped,
        timelineLabels,
        adRefs,
        adsrRefs,
        envfollowRefs,
        slewRefs,
        analyserRefs,
        compressorRefs,
        expanderRefs,
        gateRefs,
        limiterRefs,
        filterRefs,
        reverbRefs,
        slicerRefs,
        lfoRefs,
        everyRefs,
        atRefs,
        euclidRefs,
        arrayLiterals: filteredArrayLiterals,
        branchMarks: filteredBranchMarks,
        numberParams: numberParamsWithLiteralIndex,
        numberLiterals: numberLiteralsWithLiteralIndex,
        sampleDefs: samples2
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { errors: [mapError(encoderError(src, message))] };
    }
  }
  function updateSequence(sequence, arrayIndex, data, scaleIndex) {
    const compiled = compileMiniNotation(sequence, scaleIndex === void 0 ? {} : { defaultScale: { scaleIndex } });
    const target = data.arrays[arrayIndex];
    const maxSize = Math.min(compiled.bytecode.length, ARRAY_SIZE);
    target.raw.set(compiled.bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE);
    target.length = maxSize;
    const currentVersion = target.raw[3] || 0;
    target.raw[3] = currentVersion + 1;
    return buildMiniSourceMap(sequence, compiled.nodes, compiled.bytecode);
  }
  function updateTramSequence(sequence, arrayIndex, data) {
    const parsed = compileTramSequence(sequence);
    const bytecode = tramSequenceToBytecode(parsed);
    const target = data.arrays[arrayIndex];
    const maxSize = Math.min(bytecode.length, ARRAY_SIZE);
    target.raw.set(bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE);
    target.length = maxSize;
    const currentVersion = target.raw[3] || 0;
    target.raw[3] = currentVersion + 1;
    return void 0;
  }
  function updateTimelineSequence(sequence, arrayIndex, data) {
    const compiled = compileTimelineNotation(sequence);
    const target = data.arrays[arrayIndex];
    const maxSize = Math.min(compiled.bytecode.length, ARRAY_SIZE);
    target.raw.set(compiled.bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE);
    target.length = maxSize;
    const currentVersion = target.raw[3] || 0;
    target.raw[3] = currentVersion + 1;
  }
  function buildProgram(data, dspSource, vm) {
    const compiled = vm && vm.source === dspSource ? (data.ops.set(vm.ops), data.literals.set(vm.literals), vm.result) : encodeLangToVmOps(dspSource, { ops: data.ops, literals: data.literals });
    const {
      errors,
      miniSequences,
      tramSequences,
      timelineSequences,
      miniRefs,
      miniPlayBars,
      tramRefs,
      timelineRefs,
      timelineLabels,
      adRefs,
      adsrRefs,
      envfollowRefs,
      slewRefs,
      analyserRefs,
      compressorRefs,
      expanderRefs,
      gateRefs,
      limiterRefs,
      filterRefs,
      reverbRefs,
      lfoRefs,
      slicerRefs,
      everyRefs,
      atRefs,
      euclidRefs,
      arrayLiterals,
      branchMarks,
      numberParams,
      numberLiterals,
      bpm,
      bars,
      scale,
      sampleDefs
    } = compiled;
    if (errors.length) {
      console.error("VM compile errors:", errors);
      throw new Error(`VM compile errors: ${errors.map((e) => e.message).join(", ")}`);
    }
    return {
      sequences: miniSequences ?? [],
      tramSequences: tramSequences ?? [],
      timelineSequences: timelineSequences ?? [],
      miniRefs: miniRefs ?? [],
      miniPlayBars: miniPlayBars ?? [],
      tramRefs: tramRefs ?? [],
      timelineRefs: timelineRefs ?? [],
      timelineLabels: timelineLabels ?? [],
      adRefs: adRefs ?? [],
      adsrRefs: adsrRefs ?? [],
      envfollowRefs: envfollowRefs ?? [],
      slewRefs: slewRefs ?? [],
      analyserRefs: analyserRefs ?? [],
      compressorRefs: compressorRefs ?? [],
      expanderRefs: expanderRefs ?? [],
      gateRefs: gateRefs ?? [],
      limiterRefs: limiterRefs ?? [],
      filterRefs: filterRefs ?? [],
      reverbRefs: reverbRefs ?? [],
      slicerRefs: slicerRefs ?? [],
      lfoRefs: lfoRefs ?? [],
      everyRefs: everyRefs ?? [],
      atRefs: atRefs ?? [],
      euclidRefs: euclidRefs ?? [],
      arrayLiterals: arrayLiterals ?? [],
      branchMarks: branchMarks ?? [],
      numberParams: numberParams ?? [],
      numberLiterals: numberLiterals ?? [],
      sampleDefs: sampleDefs ?? [],
      bpm,
      bars,
      scale
    };
  }
  function captureOpsSnapshot(data) {
    if (!data) return void 0;
    const opsCopy = new Int32Array(data.ops);
    let length = opsCopy.length;
    while (length > 0 && opsCopy[length - 1] === 0) {
      length--;
    }
    return { ops: opsCopy, length };
  }
  function detectOpsChange(oldSnapshot, newSnapshot) {
    if (!oldSnapshot) return false;
    const maxLength = Math.max(oldSnapshot.length, newSnapshot.length);
    for (let i = 0; i < maxLength; i++) {
      const oldOp = i < oldSnapshot.length ? oldSnapshot.ops[i] : 0;
      const newOp = i < newSnapshot.length ? newSnapshot.ops[i] : 0;
      if (oldOp !== newOp) {
        return true;
      }
    }
    return false;
  }
  function computeProgramDiff(reference, target) {
    const oldSnapshot = captureOpsSnapshot(reference);
    const newSnapshot = captureOpsSnapshot(target);
    const opsChanged = detectOpsChange(oldSnapshot, newSnapshot);
    const significantChange = !!(reference && opsChanged);
    return {
      significantChange,
      opsChanged,
      oldOpCount: oldSnapshot?.length ?? 0,
      newOpCount: newSnapshot.length
    };
  }
  function createProgramDataView(data$, arrays$, wasmMemory) {
    const programData = ProgramDataStruct(wasmMemory.buffer, data$);
    const ops$ = programData.ops;
    const ops = new Int32Array(wasmMemory.buffer, ops$, OPS_COUNT);
    const arrayBuffers = new Uint32Array(wasmMemory.buffer, programData.arrays, ARRAYS_COUNT);
    const arrays = new Array(ARRAYS_COUNT);
    for (let i = 0; i < ARRAYS_COUNT; i++) {
      const byteOffset = arrayBuffers[i] = arrays$[i];
      const length = new Float32Array(wasmMemory.buffer, byteOffset, 1);
      arrays[i] = {
        get length() {
          return length[0];
        },
        set length(value) {
          length[0] = value;
        },
        raw: new Float32Array(wasmMemory.buffer, byteOffset, ARRAY_SIZE + ARRAY_HEADER_SIZE),
        data: new Float32Array(
          wasmMemory.buffer,
          byteOffset + ARRAY_HEADER_SIZE * Float32Array.BYTES_PER_ELEMENT,
          ARRAY_SIZE
        )
      };
    }
    const literals = new Float32Array(wasmMemory.buffer, programData.literals, LITERALS_COUNT);
    return {
      ptr$: data$,
      ops,
      arrays,
      literals
    };
  }
  async function createProgramData(worklet, wasmMemory) {
    const data$ = await worklet.createProgramData();
    const arrays$ = await worklet.createArrays();
    const data = createProgramDataView(data$, arrays$, wasmMemory);
    return data;
  }
  async function createProgram(worklet, wasmMemory, control) {
    const program$ = await worklet.createProgram();
    const program = ProgramStruct(wasmMemory.buffer, program$);
    const lock = new Int32Array(wasmMemory.buffer, program.ptr, 1);
    let programDataPoolIndex = 0;
    const programDataPool = [
      await createProgramData(worklet, wasmMemory),
      await createProgramData(worklet, wasmMemory)
    ];
    const histories$ = await worklet.createHistories();
    const historyBuffers = new Uint32Array(wasmMemory.buffer, program.histories, HISTORIES_COUNT);
    const histories = new Array(HISTORIES_COUNT);
    for (let i = 0; i < HISTORIES_COUNT; i++) {
      const byteOffset = historyBuffers[i] = histories$[i];
      const writePos = new Float32Array(
        wasmMemory.buffer,
        byteOffset + HISTORY_WRITE_POS_OFFSET * Float32Array.BYTES_PER_ELEMENT,
        1
      );
      histories[i] = {
        get writePos() {
          return writePos[0] || 0;
        },
        raw: new Float32Array(wasmMemory.buffer, byteOffset, HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE)
      };
    }
    const arrayAccessHistory$ = program.arrayAccessHistory;
    const arrayAccessWritePos = new Float32Array(wasmMemory.buffer, arrayAccessHistory$, 1);
    const arrayAccessHistory = {
      get writePos() {
        return arrayAccessWritePos[0] || 0;
      },
      raw: new Float32Array(wasmMemory.buffer, arrayAccessHistory$, 1 + ARRAY_HISTORY_SIZE * ARRAY_HISTORY_ENTRY_SIZE)
    };
    const branchHistory$ = program.branchHistory;
    const branchWritePos = new Float32Array(wasmMemory.buffer, branchHistory$, 1);
    const branchHistory = {
      get writePos() {
        return branchWritePos[0] || 0;
      },
      raw: new Float32Array(wasmMemory.buffer, branchHistory$, 1 + BRANCH_HISTORY_SIZE * BRANCH_HISTORY_ENTRY_SIZE)
    };
    const sampleNeedleHistory$ = program.sampleNeedleHistory;
    const sampleNeedleWritePos = new Float32Array(
      wasmMemory.buffer,
      sampleNeedleHistory$,
      SAMPLE_NEEDLE_DATA_OFFSET
    );
    const sampleNeedleHistory = {
      get writePos() {
        return sampleNeedleWritePos[0] || 0;
      },
      raw: new Float32Array(
        wasmMemory.buffer,
        sampleNeedleHistory$,
        SAMPLE_NEEDLE_DATA_OFFSET + SAMPLE_NEEDLE_HISTORY_SIZE * SAMPLE_NEEDLE_ENTRY_SIZE
      )
    };
    const filterHistory$ = program.filterHistory;
    const filterWritePos = new Float32Array(wasmMemory.buffer, filterHistory$, FILTER_DATA_OFFSET);
    const filterHistory = {
      get writePos() {
        return filterWritePos[0] || 0;
      },
      raw: new Float32Array(
        wasmMemory.buffer,
        filterHistory$,
        FILTER_DATA_OFFSET + FILTER_HISTORY_SIZE * FILTER_ENTRY_SIZE
      )
    };
    const lfoHistory$ = program.lfoHistory;
    const lfoWritePos = new Float32Array(wasmMemory.buffer, lfoHistory$, LFO_DATA_OFFSET);
    const lfoHistory = {
      get writePos() {
        return lfoWritePos[0] || 0;
      },
      raw: new Float32Array(
        wasmMemory.buffer,
        lfoHistory$,
        LFO_DATA_OFFSET + LFO_HISTORY_SIZE * LFO_ENTRY_SIZE
      )
    };
    const reverbHistory$ = program.reverbHistory;
    const reverbWritePos = new Float32Array(wasmMemory.buffer, reverbHistory$, REVERB_DATA_OFFSET);
    const reverbHistory = {
      get writePos() {
        return reverbWritePos[0] || 0;
      },
      raw: new Float32Array(
        wasmMemory.buffer,
        reverbHistory$,
        REVERB_DATA_OFFSET + REVERB_HISTORY_SIZE * REVERB_ENTRY_SIZE
      )
    };
    const trigHistory$ = program.trigHistory;
    const trigWritePos = new Float32Array(wasmMemory.buffer, trigHistory$, TRIG_DATA_OFFSET);
    const trigHistory = {
      get writePos() {
        return trigWritePos[0] || 0;
      },
      raw: new Float32Array(
        wasmMemory.buffer,
        trigHistory$,
        TRIG_DATA_OFFSET + TRIG_HISTORY_SIZE * TRIG_ENTRY_SIZE
      )
    };
    const envelopeHistory$ = program.envelopeHistory;
    const envelopeWritePos = new Float32Array(wasmMemory.buffer, envelopeHistory$, ENVELOPE_DATA_OFFSET);
    const envelopeHistory = {
      get writePos() {
        return envelopeWritePos[0] || 0;
      },
      raw: new Float32Array(
        wasmMemory.buffer,
        envelopeHistory$,
        ENVELOPE_DATA_OFFSET + ENVELOPE_HISTORY_SIZE * ENVELOPE_ENTRY_SIZE
      )
    };
    function nextProgramData() {
      const data = programDataPool[programDataPoolIndex];
      programDataPoolIndex = (programDataPoolIndex + 1) % programDataPool.length;
      return data;
    }
    const analyserOutsPool = AnalyserOutsPoolStruct(wasmMemory.buffer, program.analyserOutsPool);
    const analyserOuts$ = new Uint32Array(wasmMemory.buffer, analyserOutsPool.outs, ANALYSER_OUTS_COUNT);
    const analyserOuts = [...analyserOuts$].map(
      (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
    );
    const compressorOutsPool = CompressorOutsPoolStruct(wasmMemory.buffer, program.compressorOutsPool);
    const levelDbOuts$ = new Uint32Array(wasmMemory.buffer, compressorOutsPool.levelDbOuts, 64);
    const grDbOuts$ = new Uint32Array(wasmMemory.buffer, compressorOutsPool.grDbOuts, 64);
    const compressorOuts = {
      levelDb: [...levelDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      ),
      grDb: [...grDbOuts$].map((out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE))
    };
    const expanderOutsPool = ExpanderOutsPoolStruct(wasmMemory.buffer, program.expanderOutsPool);
    const expanderLevelDbOuts$ = new Uint32Array(wasmMemory.buffer, expanderOutsPool.levelDbOuts, 64);
    const expanderGrDbOuts$ = new Uint32Array(wasmMemory.buffer, expanderOutsPool.grDbOuts, 64);
    const expanderOuts = {
      levelDb: [...expanderLevelDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      ),
      grDb: [...expanderGrDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      )
    };
    const gateOutsPool = GateOutsPoolStruct(wasmMemory.buffer, program.gateOutsPool);
    const gateLevelDbOuts$ = new Uint32Array(wasmMemory.buffer, gateOutsPool.levelDbOuts, 64);
    const gateGrDbOuts$ = new Uint32Array(wasmMemory.buffer, gateOutsPool.grDbOuts, 64);
    const gateOuts = {
      levelDb: [...gateLevelDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      ),
      grDb: [...gateGrDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      )
    };
    const limiterOutsPool = LimiterOutsPoolStruct(wasmMemory.buffer, program.limiterOutsPool);
    const limiterLevelDbOuts$ = new Uint32Array(wasmMemory.buffer, limiterOutsPool.levelDbOuts, 64);
    const limiterGrDbOuts$ = new Uint32Array(wasmMemory.buffer, limiterOutsPool.grDbOuts, 64);
    const limiterOuts = {
      levelDb: [...limiterLevelDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      ),
      grDb: [...limiterGrDbOuts$].map(
        (out$) => toRing(new Float32Array(wasmMemory.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
      )
    };
    let programData;
    const out = {
      ptr$: program$,
      lock,
      analyserOuts,
      compressorOuts,
      expanderOuts,
      gateOuts,
      limiterOuts,
      histories,
      arrayAccessHistory,
      branchHistory,
      sampleNeedleHistory,
      filterHistory,
      lfoHistory,
      reverbHistory,
      trigHistory,
      envelopeHistory,
      get data() {
        return programData;
      },
      async compileSource(source, options2 = {}) {
        const { apply = true, setData = apply, compareAgainst, copyVersionFrom } = options2;
        const referenceData = compareAgainst ?? programData;
        const versionSource = copyVersionFrom ?? referenceData;
        const previousProgramDataIndex = programDataPoolIndex;
        const newData = nextProgramData();
        try {
          const {
            sequences,
            tramSequences,
            timelineSequences,
            miniRefs,
            miniPlayBars,
            tramRefs,
            timelineRefs,
            timelineLabels,
            adRefs,
            adsrRefs,
            envfollowRefs,
            slewRefs,
            analyserRefs,
            compressorRefs,
            expanderRefs,
            gateRefs,
            limiterRefs,
            filterRefs,
            reverbRefs,
            slicerRefs,
            lfoRefs,
            everyRefs,
            atRefs,
            euclidRefs,
            arrayLiterals,
            branchMarks,
            numberParams,
            numberLiterals,
            sampleDefs,
            bpm,
            bars,
            scale
          } = buildProgram(
            newData,
            source,
            options2.vm
          );
          const miniSourceMaps = new Array(sequences.length);
          const tramSourceMaps = new Array(tramSequences.length);
          const totalSeqCount = sequences.length + tramSequences.length + timelineSequences.length;
          if (totalSeqCount > HISTORIES_COUNT) {
            throw new Error(`Too many sequences for history pool: ${totalSeqCount} > ${HISTORIES_COUNT}`);
          }
          try {
            for (let arrayIndex = 0; arrayIndex < sequences.length; arrayIndex++) {
              const sequence = sequences[arrayIndex];
              if (!sequence) continue;
              const oldArray = versionSource?.arrays[arrayIndex];
              if (oldArray) {
                newData.arrays[arrayIndex].raw[3] = oldArray.raw[3];
              }
              miniSourceMaps[arrayIndex] = updateSequence(sequence, arrayIndex, newData, scale);
            }
            for (let i = 0; i < tramSequences.length; i++) {
              const sequence = tramSequences[i];
              if (!sequence) continue;
              const arrayIndex = sequences.length + i;
              const oldArray = versionSource?.arrays[arrayIndex];
              if (oldArray) {
                newData.arrays[arrayIndex].raw[3] = oldArray.raw[3];
              }
              tramSourceMaps[i] = updateTramSequence(sequence, arrayIndex, newData);
            }
            for (let i = 0; i < timelineSequences.length; i++) {
              const s = timelineSequences[i];
              if (!s) continue;
              const arrayIndex = sequences.length + tramSequences.length + i;
              const oldArray = versionSource?.arrays[arrayIndex];
              if (oldArray) {
                newData.arrays[arrayIndex].raw[3] = oldArray.raw[3];
              }
              updateTimelineSequence(s.sequence, arrayIndex, newData);
            }
            if (setData) {
              this._setData(newData);
            }
          } finally {
          }
          const diff = computeProgramDiff(referenceData, newData);
          return {
            sequences,
            tramSequences,
            miniRefs,
            miniPlayBars,
            tramRefs,
            timelineRefs,
            timelineLabels,
            adRefs,
            adsrRefs,
            envfollowRefs,
            slewRefs,
            analyserRefs,
            compressorRefs,
            expanderRefs,
            gateRefs,
            limiterRefs,
            filterRefs,
            reverbRefs,
            slicerRefs,
            lfoRefs,
            everyRefs,
            atRefs,
            euclidRefs,
            miniSourceMaps,
            timelineSequences,
            arrayLiterals,
            branchMarks,
            numberParams,
            numberLiterals,
            sampleDefs,
            bpm,
            bars,
            data: newData,
            diff,
            previousData: referenceData
          };
        } catch (error) {
          programDataPoolIndex = previousProgramDataIndex;
          throw error;
        }
      },
      async buildFromSource(source) {
        const result = await this.compileSource(source);
        return result.sequences;
      },
      async applyPreparedData(value) {
        await this.withLock(() => {
          this._setData(value);
        });
      },
      async acquireLock() {
        const ok = await acquireSpinLock(this.lock, 2e3);
        if (!ok) {
          throw new Error("Timed out acquiring program lock");
        }
      },
      releaseLock() {
        Atomics.store(this.lock, 0, 0);
        Atomics.notify(this.lock, 0);
      },
      async withLock(fn) {
        fn();
      },
      _setData(value) {
        programData = value;
        program.data = programData.ptr$;
      },
      async setData(value) {
        await this.withLock(() => {
          this._setData(value);
        });
      },
      async writeLiteral(index, value) {
        await this.withLock(() => {
          if (programData) programData.literals[index] = value;
        });
      }
    };
    return out;
  }
  async function createProgramInstance(worklet, wasmMemory, control) {
    const program = await createProgram(worklet, wasmMemory);
    function cleanup() {
    }
    return { program, cleanup };
  }
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
  function detectSlices(samples2, threshold, max) {
    const m = Math.max(1, max | 0);
    const points = new Int32Array(m);
    const len = samples2.length | 0;
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
    const peaks = computePeaks(samples2, bucketCount);
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
  function workletImports(memory, samples2) {
    const recordCache = samples2.__recordCache ?? /* @__PURE__ */ new Map();
    samples2.__recordCache = recordCache;
    return {
      host: {
        sampleVersion: (sampleIndex) => {
          const s = samples2.get(sampleIndex | 0);
          return s ? s.ver | 0 : 0;
        },
        sampleLen: (sampleIndex) => {
          const s = samples2.get(sampleIndex | 0);
          return s ? s.len | 0 : 0;
        },
        sampleRead: (sampleIndex, start, length, outPtr) => {
          const s = samples2.get(sampleIndex | 0);
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
        sampleSet: (sampleIndex, sampleRate, length, inPtr) => {
          const idx = sampleIndex | 0;
          const n = length | 0;
          if (!memory?.buffer || inPtr === 0 || n <= 0) return;
          const src = new Float32Array(memory.buffer, inPtr >>> 0, n);
          const copy = src.slice();
          const prev = samples2.get(idx);
          const ver = (prev?.ver ?? 0) + 1 | 0;
          samples2.set(idx, { ver, sampleRate, len: copy.length | 0, ch0: copy });
        },
        recordCacheLoad: (hash, sampleIndex) => {
          const h = hash >>> 0;
          const idx = sampleIndex | 0;
          const s = recordCache.get(h);
          if (!s) return 0;
          const prev = samples2.get(idx);
          const ver = (prev?.ver ?? 0) + 1 | 0;
          samples2.set(idx, { ver, sampleRate: s.sampleRate | 0, len: s.len | 0, ch0: s.ch0 });
          return s.len | 0;
        },
        recordCacheStore: (hash, sampleIndex) => {
          const h = hash >>> 0;
          const idx = sampleIndex | 0;
          const s = samples2.get(idx);
          if (!s || !s.ch0 || (s.len | 0) <= 0) return;
          recordCache.set(h, s);
        },
        sampleSlices: (sampleIndex, threshold, outPtr, max) => {
          const s = samples2.get(sampleIndex | 0);
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
  const samples = /* @__PURE__ */ new Map();
  let visualWasm = null;
  async function createVisualWasm(binary, sourcemapUrl) {
    let core;
    try {
      core = await wasmSetup({
        binary,
        sourcemapUrl,
        config,
        imports: ({ memory: memory2 }) => workletImports(memory2, samples)
      });
    } catch (error) {
      console.error(error);
      throw error;
    }
    const wasm = core.wasm;
    const memory = core.memory;
    let offlineProgram = null;
    let offlineSource = null;
    let offlineDsp$ = 0;
    let offlineDspView = null;
    let offlineLeft$ = 0;
    let offlineRight$ = 0;
    const localWorklet = {
      createProgram: async () => wasm.createProgram(),
      createArrays: async () => Array.from({ length: ARRAYS_COUNT }, () => wasm.createArray()),
      createHistories: async () => Array.from({ length: HISTORIES_COUNT }, () => wasm.createHistoryArray()),
      createProgramData: async () => wasm.createProgramData()
    };
    async function ensureOfflineProgram(source) {
      if (offlineProgram && offlineSource === source) return;
      offlineProgram = await createProgramInstance(localWorklet, memory);
      offlineSource = source;
      if (!offlineDsp$) offlineDsp$ = wasm.createDsp() | 0;
      offlineDspView = DspStruct(memory.buffer, offlineDsp$);
      offlineDspView.program = offlineProgram.program.ptr$;
      if (!offlineLeft$) offlineLeft$ = wasm.createFloat32Buffer(CHUNK_SIZE) | 0;
      if (!offlineRight$) offlineRight$ = wasm.createFloat32Buffer(CHUNK_SIZE) | 0;
      await offlineProgram.program.compileSource(source, { apply: true, setData: true });
    }
    let prepareInFlight = null;
    const preparedUrlByIndex = /* @__PURE__ */ new Map();
    const prepareRecordSamples = async (args) => {
      const recordDefs = args.sampleDefs.filter((s) => s.provider === "record");
      if (recordDefs.length === 0) return /* @__PURE__ */ new Map();
      const needs = recordDefs.some((d) => preparedUrlByIndex.get(d.sampleIndex) !== d.url);
      if (!needs) return /* @__PURE__ */ new Map();
      if (prepareInFlight) return await prepareInFlight;
      prepareInFlight = (async () => {
        if (offlineSource !== args.source) {
          preparedUrlByIndex.clear();
        }
        const currentSampleRate = args.sampleRate > 0 ? args.sampleRate : 48e3;
        wasm.sampleRate.value = currentSampleRate;
        wasm.nyquist.value = currentSampleRate * 0.5 - currentSampleRate * 0.1;
        wasm.bpm.value = args.bpm > 0 ? args.bpm : 60;
        wasm.globalSampleCount.value = 0;
        for (let i = 0; i < args.loadedSamples.length; i++) {
          const s = args.loadedSamples[i];
          if (!s?.ch0 || s.length <= 0) continue;
          const idx = i | 0;
          const prev = samples.get(idx);
          const ver = prev?.ver ?? 1;
          samples.set(idx, { ver, sampleRate: s.sampleRate | 0, len: s.length | 0, ch0: s.ch0 });
        }
        await ensureOfflineProgram(args.source);
        if (!offlineProgram || !offlineDsp$ || !offlineDspView || !offlineLeft$ || !offlineRight$) return /* @__PURE__ */ new Map();
        wasm.resetDsp?.(offlineDsp$);
        wasm.globalSampleCount.value = 0;
        let stable = 0;
        const maxBlocks = 4096;
        for (let i = 0; i < maxBlocks; i++) {
          wasm.processAudio?.(offlineDsp$, offlineLeft$, offlineRight$, 0, CHUNK_SIZE);
          const active = (wasm.getProgramRecordActive?.(offlineProgram.program.ptr$) | 0) !== 0;
          if (active) stable = 0;
          else stable++;
          wasm.globalSampleCount.value = 0;
          if (stable >= 2) break;
          if ((i & 63) === 63) {
            await new Promise((r) => setTimeout(r, 0));
          }
        }
        const out = /* @__PURE__ */ new Map();
        for (const def of recordDefs) {
          const s = samples.get(def.sampleIndex);
          if (!s || s.len <= 0) continue;
          const ch0Buffer = s.ch0.slice().buffer;
          out.set(def.sampleIndex, {
            sampleIndex: def.sampleIndex,
            url: def.url,
            ver: s.ver | 0,
            sampleRate: s.sampleRate | 0,
            length: s.len | 0,
            ch0Buffer
          });
          preparedUrlByIndex.set(def.sampleIndex, def.url);
        }
        return out;
      })();
      try {
        return await prepareInFlight;
      } finally {
        prepareInFlight = null;
      }
    };
    return {
      wasm,
      memory,
      prepareRecordSamples
    };
  }
  const api = {
    async init(binary, sourcemapUrl) {
      visualWasm = await createVisualWasm(binary, sourcemapUrl);
    },
    async prepareRecordSamples(args) {
      if (!visualWasm) {
        throw new Error("VisualWasm not initialized");
      }
      return await visualWasm.prepareRecordSamples(args);
    }
  };
  rpc(self, api, [ArrayBuffer]);
})();
//# sourceMappingURL=record-samples-worker-DkbnaFUa.js.map
