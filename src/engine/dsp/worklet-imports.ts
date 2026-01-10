import { detectSlices } from './detect-slices.ts'

export type Sample = {
  ver: number
  sampleRate: number
  len: number
  ch0: Float32Array
  slices?: { k: number; count: number; points: Int32Array }
}

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

export function workletImports(memory: WebAssembly.Memory, samples: Map<number, Sample>) {
  // Cache of record() results keyed by the final content hash (u32 from Wasm).
  // Stored on the shared `samples` map so it survives across wasm re-instantiations / import re-creation.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recordCache: Map<number, Sample> = ((samples as any).__recordCache as Map<number, Sample>) ?? new Map()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(samples as any).__recordCache = recordCache

  return {
    host: {
      sampleVersion: (sampleIndex: number) => {
        const s = samples.get(sampleIndex | 0)
        return s ? (s.ver | 0) : 0
      },
      sampleLen: (sampleIndex: number) => {
        const s = samples.get(sampleIndex | 0)
        return s ? (s.len | 0) : 0
      },
      sampleRead: (sampleIndex: number, start: number, length: number, outPtr: number) => {
        const s = samples.get(sampleIndex | 0)
        const n = length | 0
        if (!memory?.buffer || outPtr === 0 || n <= 0) return 0

        const out = new Float32Array(memory.buffer, outPtr >>> 0, n)
        if (!s || !s.ch0 || s.len <= 0) {
          out.fill(0)
          return 0
        }

        const src = s.ch0
        const len = s.len | 0
        const a = start | 0

        const from = clamp(a, 0, len)
        const to = clamp(a + n, 0, len)
        const take = Math.max(0, to - from)

        if (take > 0) out.set(src.subarray(from, from + take), 0)
        if (take < n) out.fill(0, take)
        return take | 0
      },
      sampleSet: (sampleIndex: number, sampleRate: number, length: number, inPtr: number) => {
        const idx = sampleIndex | 0
        const n = length | 0
        if (!memory?.buffer || inPtr === 0 || n <= 0) return

        const src = new Float32Array(memory.buffer, inPtr >>> 0, n)
        const copy = src.slice()

        const prev = samples.get(idx)
        const ver = ((prev?.ver ?? 0) + 1) | 0
        samples.set(idx, { ver, sampleRate, len: copy.length | 0, ch0: copy })
      },
      recordCacheLoad: (hash: number, sampleIndex: number) => {
        const h = hash >>> 0
        const idx = sampleIndex | 0
        const s = recordCache.get(h)
        if (!s) return 0

        // Rebind cached sample to the requested index.
        const prev = samples.get(idx)
        const ver = ((prev?.ver ?? 0) + 1) | 0
        samples.set(idx, { ver, sampleRate: s.sampleRate | 0, len: s.len | 0, ch0: s.ch0 })
        return s.len | 0
      },
      recordCacheStore: (hash: number, sampleIndex: number) => {
        const h = hash >>> 0
        const idx = sampleIndex | 0
        const s = samples.get(idx)
        if (!s || !s.ch0 || (s.len | 0) <= 0) return
        // Store by hash; keep the Float32Array as-is to avoid extra copies.
        recordCache.set(h, s)
      },
      sampleSlices: (sampleIndex: number, threshold: number, outPtr: number, max: number) => {
        const s = samples.get(sampleIndex | 0)
        const m = max | 0
        if (!memory?.buffer || outPtr === 0 || m <= 0) return 0
        const out = new Int32Array(memory.buffer, outPtr >>> 0, m)
        if (!s || !s.ch0 || s.len <= 0) {
          out.fill(0)
          return 0
        }

        const key = ((threshold || 0) * 1000) | 0
        if (!s.slices || s.slices.k !== key) {
          const res = detectSlices(s.ch0, threshold || 0, m)
          const n = Math.min(m, res.count | 0)
          s.slices = { k: key, count: n, points: res.points }
          out.set(res.points.subarray(0, n))
          if (n < m) out.fill(0, n)
          return n | 0
        }

        const points = s.slices.points
        const n = Math.min(m, s.slices.count | 0)
        out.set(points.subarray(0, n))
        if (n < m) out.fill(0, n)
        return n | 0
      },
    },
  }
}
