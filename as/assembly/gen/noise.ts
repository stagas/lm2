// dprint-ignore-file

import { clamp01, clamp11 } from '../util'
import { Gen } from './gen'

const NOISE_TABLE_BITS: i32 = 13
const NOISE_TABLE_SIZE: i32 = 1 << NOISE_TABLE_BITS
const NOISE_TABLE_MASK: i32 = NOISE_TABLE_SIZE - 1

// @ts-ignore
@inline
function hashU32(v: u32): u32 {
  v ^= v >> 16
  v *= 0x7feb352d
  v ^= v >> 15
  v *= 0x846ca68b
  v ^= v >> 16
  return v
}

// @ts-ignore
@inline
function seedToBits(seed: f32): u32 {
  return hashU32(reinterpret<u32>(seed))
}

// @ts-ignore
@inline
function xorshift32(state: u32): u32 {
  // Note: 0 stays 0, so always keep state non-zero.
  state ^= state << 13
  state ^= state >> 17
  state ^= state << 5
  return state
}

// @ts-ignore
@inline
function u32To01(v: u32): f32 {
  // Use top 24 bits for stable-ish float mapping.
  return (f32(v >>> 8) * (1.0 / 16777216.0)) as f32
}

// @ts-ignore
@inline
function u32To11(v: u32): f32 {
  return (u32To01(v) * 2.0 - 1.0) as f32
}

// @ts-ignore
@inline
function fade5(t: f32): f32 {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

// @ts-ignore
@inline
function fadeWithCurve(t: f32, curve: f32): f32 {
  const c = clamp01(curve)
  const f = fade5(t)
  return (t + (f - t) * c) as f32
}

// @ts-ignore
@inline
function storeLerp(out$: usize, length: i32, a: f32, b: f32): void {
  if (length <= 1) {
    store<f32>(out$, a)
    return
  }
  const inv: f32 = 1.0 / (f32(length - 1))
  const step: f32 = (b - a) * inv
  let y: f32 = a
  for (let i: i32 = 0; i < length; i++) {
    store<f32>(out$, y)
    y += step
    out$ += 4
  }
}

// @ts-ignore
@inline
function copyF32Static(dst: StaticArray<f32>, src: StaticArray<f32>): void {
  for (let i: i32 = 0; i < dst.length; i++) {
    unchecked(dst[i] = unchecked(src[i]))
  }
}

export class WhiteNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private lastTrig: f32 = 0
  private idx: i32 = 0
  private table: StaticArray<f32> = new StaticArray<f32>(NOISE_TABLE_SIZE)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.lastTrig = 0
    this.idx = 0
  }

  copyFrom(other: Gen): void {
    const src = other as WhiteNoise
    this.lastSeedBits = src.lastSeedBits
    this.lastTrig = src.lastTrig
    this.idx = src.idx
    copyF32Static(this.table, src.table)
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.idx = 0
      let s: u32 = (seedBits | 1) as u32
      for (let i: i32 = 0; i < NOISE_TABLE_SIZE; i++) {
        s = xorshift32(s)
        unchecked(this.table[i] = u32To11(s))
      }
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig
    let idx: i32 = this.idx

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        idx = 0
      }
      lastTrig = trig

      store<f32>(out$, unchecked(this.table[idx]))
      idx = (idx + 1) & NOISE_TABLE_MASK

      out$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.idx = idx
  }
}

export class GaussNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private lastTrig: f32 = 0
  private idx: i32 = 0
  private table: StaticArray<f32> = new StaticArray<f32>(NOISE_TABLE_SIZE)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.lastTrig = 0
    this.idx = 0
  }

  copyFrom(other: Gen): void {
    const src = other as GaussNoise
    this.lastSeedBits = src.lastSeedBits
    this.lastTrig = src.lastTrig
    this.idx = src.idx
    copyF32Static(this.table, src.table)
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.idx = 0
      let s: u32 = (seedBits | 1) as u32
      for (let i: i32 = 0; i < NOISE_TABLE_SIZE; i++) {
        // CLT-ish: average of 6 uniforms => normal-ish; map to [-1,1] by (sum-3)/3.
        let sum: f32 = 0.0
        s = xorshift32(s)
        sum += u32To01(s)
        s = xorshift32(s)
        sum += u32To01(s)
        s = xorshift32(s)
        sum += u32To01(s)
        s = xorshift32(s)
        sum += u32To01(s)
        s = xorshift32(s)
        sum += u32To01(s)
        s = xorshift32(s)
        sum += u32To01(s)
        unchecked(this.table[i] = ((sum - 3.0) * (1.0 / 3.0)) as f32)
      }
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig
    let idx: i32 = this.idx

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        idx = 0
      }
      lastTrig = trig

      store<f32>(out$, unchecked(this.table[idx]))
      idx = (idx + 1) & NOISE_TABLE_MASK

      out$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.idx = idx
  }
}

function trailingZeros(v: u32): i32 {
  if (v === 0) return 32
  let n: i32 = 0
  let x: u32 = v
  while ((x & 1) === 0) {
    n++
    x >>= 1
  }
  return n
}

export class PinkNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private lastTrig: f32 = 0
  private idx: i32 = 0
  private table: StaticArray<f32> = new StaticArray<f32>(NOISE_TABLE_SIZE)
  private rows: StaticArray<f32> = new StaticArray<f32>(8)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.lastTrig = 0
    this.idx = 0
  }

  copyFrom(other: Gen): void {
    const src = other as PinkNoise
    this.lastSeedBits = src.lastSeedBits
    this.lastTrig = src.lastTrig
    this.idx = src.idx
    copyF32Static(this.table, src.table)
    copyF32Static(this.rows, src.rows)
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.idx = 0

      let s: u32 = (hashU32(seedBits ^ 0x70696e6b) | 1) as u32
      let c: u32 = 0
      let sum: f32 = 0.0

      const n: i32 = this.rows.length
      for (let j: i32 = 0; j < n; j++) {
        s = xorshift32(s)
        const v = u32To11(s)
        unchecked(this.rows[j] = v)
        sum += v
      }

      const norm: f32 = 1.0 / (f32(n) + 1.0)

      for (let i: i32 = 0; i < NOISE_TABLE_SIZE; i++) {
        c++
        const tz = trailingZeros(c)
        const rowIndex: i32 = tz < n ? tz : (n - 1)

        const old = unchecked(this.rows[rowIndex])
        s = xorshift32(s)
        const v = u32To11(s)
        unchecked(this.rows[rowIndex] = v)
        sum += v - old

        s = xorshift32(s)
        const white = u32To11(s)
        unchecked(this.table[i] = clamp11((sum + white) * norm))
      }
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig
    let idx: i32 = this.idx

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        idx = 0
      }
      lastTrig = trig

      store<f32>(out$, unchecked(this.table[idx]))
      idx = (idx + 1) & NOISE_TABLE_MASK

      out$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.idx = idx
  }
}

export class BrownNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private lastTrig: f32 = 0
  private idx: i32 = 0
  private table: StaticArray<f32> = new StaticArray<f32>(NOISE_TABLE_SIZE)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.lastTrig = 0
    this.idx = 0
  }

  copyFrom(other: Gen): void {
    const src = other as BrownNoise
    this.lastSeedBits = src.lastSeedBits
    this.lastTrig = src.lastTrig
    this.idx = src.idx
    copyF32Static(this.table, src.table)
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.idx = 0

      let s: u32 = (hashU32(seedBits ^ 0x62726f77) | 1) as u32
      let y: f32 = 0.0

      const step: f32 = 0.02
      const leak: f32 = 0.999

      for (let i: i32 = 0; i < NOISE_TABLE_SIZE; i++) {
        s = xorshift32(s)
        const w = u32To11(s)
        y = clamp11(y * leak + w * step)
        unchecked(this.table[i] = y)
      }
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig
    let idx: i32 = this.idx

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        idx = 0
      }
      lastTrig = trig

      store<f32>(out$, unchecked(this.table[idx]))
      idx = (idx + 1) & NOISE_TABLE_MASK

      out$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.idx = idx
  }
}

export class SmoothNoise extends Gen {
  seed$: usize = 0
  rate$: usize = 0
  curve$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private state: u32 = 1
  private phase: f32 = 0.0
  private a: f32 = 0.0
  private b: f32 = 0.0
  private lastTrig: f32 = 0

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.state = 1
    this.phase = 0.0
    this.a = 0.0
    this.b = 0.0
    this.lastTrig = 0
  }

  copyFrom(other: Gen): void {
    const src = other as SmoothNoise
    this.lastSeedBits = src.lastSeedBits
    this.state = src.state
    this.phase = src.phase
    this.a = src.a
    this.b = src.b
    this.lastTrig = src.lastTrig
  }

  process(out$: usize, length: i32): void {
    // Latch seed on first run; after that, only a trig resets the stream.
    if (this.lastSeedBits === 0xffffffff) {
      const seedBits = seedToBits(load<f32>(this.seed$))
      this.lastSeedBits = seedBits
      this.state = (hashU32(seedBits ^ 0x736d6f6f) | 1) as u32
      this.phase = 0.0
      this.state = xorshift32(this.state)
      this.a = u32To01(this.state)
      this.state = xorshift32(this.state)
      this.b = u32To01(this.state)
    }

    const trigBase$ = this.trig$
    const seedBase$ = this.seed$
    const rateBase$ = this.rate$
    const curveBase$ = this.curve$

    let lastTrig: f32 = this.lastTrig
    let edge: i32 = -1
    let t$ = trigBase$
    for (let i: i32 = 0; i < length; i++) {
      const t = load<f32>(t$)
      if (edge < 0 && t > 0.0 && lastTrig <= 0.0) edge = i
      lastTrig = t
      t$ += 4
    }

    let s = this.state
    let phase = this.phase
    let a = this.a
    let b = this.b

    const len0: i32 = edge >= 0 ? edge : length
    const len1: i32 = edge >= 0 ? (length - edge) : 0

    if (len0 > 0) {
      const rate0: f32 = load<f32>(rateBase$)
      const curve0: f32 = load<f32>(curveBase$)
      const w0: f32 = fadeWithCurve(phase, curve0)
      const y0: f32 = (a + (b - a) * w0) as f32

      const lenOverSr: f32 = (f32(len0) / sampleRate) as f32
      const incBlock: f32 = rate0 > 0.0 ? (rate0 * lenOverSr) : 0.0
      let p1: f32 = phase + incBlock
      while (p1 >= 1.0) {
        p1 -= 1.0
        a = b
        s = xorshift32(s)
        b = u32To01(s)
      }

      const w1: f32 = fadeWithCurve(p1, curve0)
      const y1: f32 = (a + (b - a) * w1) as f32
      storeLerp(out$, len0, y0, y1)

      out$ += usize(len0 << 2)
      phase = p1
    }

    if (len1 > 0) {
      const off: usize = usize(edge << 2)
      const seed1$: usize = seedBase$ + off
      const rate1$: usize = rateBase$ + off
      const curve1$: usize = curveBase$ + off

      const newSeedBits = seedToBits(load<f32>(seed1$))
      this.lastSeedBits = newSeedBits
      s = (hashU32(newSeedBits ^ 0x736d6f6f) | 1) as u32
      phase = 0.0
      s = xorshift32(s)
      a = u32To01(s)
      s = xorshift32(s)
      b = u32To01(s)

      const rate1: f32 = load<f32>(rate1$)
      const curve1: f32 = load<f32>(curve1$)
      const w0: f32 = fadeWithCurve(phase, curve1)
      const y0: f32 = (a + (b - a) * w0) as f32

      const lenOverSr: f32 = (f32(len1) / sampleRate) as f32
      const incBlock: f32 = rate1 > 0.0 ? (rate1 * lenOverSr) : 0.0
      let p1: f32 = phase + incBlock
      while (p1 >= 1.0) {
        p1 -= 1.0
        a = b
        s = xorshift32(s)
        b = u32To01(s)
      }

      const w1: f32 = fadeWithCurve(p1, curve1)
      const y1: f32 = (a + (b - a) * w1) as f32
      storeLerp(out$, len1, y0, y1)

      phase = p1
    }

    this.state = s
    this.phase = phase
    this.a = a
    this.b = b
    this.lastTrig = lastTrig
  }
}

export class FractalNoise extends Gen {
  seed$: usize = 0
  rate$: usize = 0
  octaves$: usize = 0
  gain$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private baseSeed: u32 = 1
  private lastTrig: f32 = 0

  private phases: StaticArray<f32> = new StaticArray<f32>(16)
  private a: StaticArray<f32> = new StaticArray<f32>(16)
  private b: StaticArray<f32> = new StaticArray<f32>(16)
  private states: StaticArray<u32> = new StaticArray<u32>(16)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.baseSeed = 1
    this.lastTrig = 0
    for (let i = 0; i < this.phases.length; i++) {
      this.phases[i] = 0.0
      this.a[i] = 0.0
      this.b[i] = 0.0
      this.states[i] = 1
    }
  }

  copyFrom(other: Gen): void {
    const src = other as FractalNoise
    this.lastSeedBits = src.lastSeedBits
    this.baseSeed = src.baseSeed
    this.lastTrig = src.lastTrig
    for (let i = 0; i < this.phases.length; i++) {
      this.phases[i] = src.phases[i]
      this.a[i] = src.a[i]
      this.b[i] = src.b[i]
      this.states[i] = src.states[i]
    }
  }

  process(out$: usize, length: i32): void {
    // Latch seed on first run; after that, only a trig resets the stream.
    if (this.lastSeedBits === 0xffffffff) {
      const seedBits = seedToBits(load<f32>(this.seed$))
      this.lastSeedBits = seedBits
      this.baseSeed = hashU32(seedBits ^ 0x66726163) | 1
      for (let i = 0; i < this.phases.length; i++) {
        this.phases[i] = 0.0
        const s0 = hashU32(this.baseSeed ^ (u32(i) * 0x9e3779b9)) | 1
        this.states[i] = s0
        let s = s0
        s = xorshift32(s)
        this.a[i] = u32To01(s)
        s = xorshift32(s)
        this.b[i] = u32To01(s)
        this.states[i] = s
      }
    }

    const trigBase$ = this.trig$
    const seedBase$ = this.seed$
    const rateBase$ = this.rate$
    const octBase$ = this.octaves$
    const gainBase$ = this.gain$

    let lastTrig: f32 = this.lastTrig
    let edge: i32 = -1
    let t$ = trigBase$
    for (let i: i32 = 0; i < length; i++) {
      const t = load<f32>(t$)
      if (edge < 0 && t > 0.0 && lastTrig <= 0.0) edge = i
      lastTrig = t
      t$ += 4
    }

    const len0: i32 = edge >= 0 ? edge : length
    const len1: i32 = edge >= 0 ? (length - edge) : 0

    if (len0 > 0) {
      const baseRate: f32 = load<f32>(rateBase$)
      const oRaw: f32 = load<f32>(octBase$)
      const gRaw: f32 = load<f32>(gainBase$)
      let oct: i32 = i32(Math.floor(oRaw as f64))
      if (oct < 1) oct = 1
      if (oct > 16) oct = 16
      const gain: f32 = clamp01(gRaw)

      const lenOverSr: f32 = (f32(len0) / sampleRate) as f32

      let sum0: f32 = 0.0
      let sum1: f32 = 0.0
      let norm: f32 = 0.0
      let amp: f32 = 1.0
      let freq: f32 = baseRate

      for (let o: i32 = 0; o < oct; o++) {
        let p0: f32 = this.phases[o]
        let a: f32 = this.a[o]
        let b: f32 = this.b[o]
        let s: u32 = this.states[o]

        const w0: f32 = fade5(p0)
        const v0: f32 = (a + (b - a) * w0) as f32
        sum0 += v0 * amp

        let p1: f32 = p0 + (freq > 0.0 ? (freq * lenOverSr) : 0.0)
        while (p1 >= 1.0) {
          p1 -= 1.0
          a = b
          s = xorshift32(s)
          b = u32To01(s)
        }

        const w1: f32 = fade5(p1)
        const v1: f32 = (a + (b - a) * w1) as f32
        sum1 += v1 * amp

        this.phases[o] = p1
        this.a[o] = a
        this.b[o] = b
        this.states[o] = s

        norm += amp
        amp *= gain
        freq *= 2.0
      }

      const y0: f32 = norm > 0.0 ? (sum0 / norm) : 0.0
      const y1: f32 = norm > 0.0 ? (sum1 / norm) : 0.0
      storeLerp(out$, len0, clamp01(y0), clamp01(y1))
      out$ += usize(len0 << 2)
    }

    if (len1 > 0) {
      const off: usize = usize(edge << 2)
      const seed1$: usize = seedBase$ + off
      const rate1$: usize = rateBase$ + off
      const oct1$: usize = octBase$ + off
      const gain1$: usize = gainBase$ + off

      const newSeedBits = seedToBits(load<f32>(seed1$))
      this.lastSeedBits = newSeedBits
      this.baseSeed = hashU32(newSeedBits ^ 0x66726163) | 1
      for (let j: i32 = 0; j < this.phases.length; j++) {
        this.phases[j] = 0.0
        const s0 = hashU32(this.baseSeed ^ (u32(j) * 0x9e3779b9)) | 1
        this.states[j] = s0
        let s = s0
        s = xorshift32(s)
        this.a[j] = u32To01(s)
        s = xorshift32(s)
        this.b[j] = u32To01(s)
        this.states[j] = s
      }

      const baseRate: f32 = load<f32>(rate1$)
      const oRaw: f32 = load<f32>(oct1$)
      const gRaw: f32 = load<f32>(gain1$)
      let oct: i32 = i32(Math.floor(oRaw as f64))
      if (oct < 1) oct = 1
      if (oct > 16) oct = 16
      const gain: f32 = clamp01(gRaw)

      const lenOverSr: f32 = (f32(len1) / sampleRate) as f32

      let sum0: f32 = 0.0
      let sum1: f32 = 0.0
      let norm: f32 = 0.0
      let amp: f32 = 1.0
      let freq: f32 = baseRate

      for (let o: i32 = 0; o < oct; o++) {
        let p0: f32 = this.phases[o]
        let a: f32 = this.a[o]
        let b: f32 = this.b[o]
        let s: u32 = this.states[o]

        const w0: f32 = fade5(p0)
        const v0: f32 = (a + (b - a) * w0) as f32
        sum0 += v0 * amp

        let p1: f32 = p0 + (freq > 0.0 ? (freq * lenOverSr) : 0.0)
        while (p1 >= 1.0) {
          p1 -= 1.0
          a = b
          s = xorshift32(s)
          b = u32To01(s)
        }

        const w1: f32 = fade5(p1)
        const v1: f32 = (a + (b - a) * w1) as f32
        sum1 += v1 * amp

        this.phases[o] = p1
        this.a[o] = a
        this.b[o] = b
        this.states[o] = s

        norm += amp
        amp *= gain
        freq *= 2.0
      }

      const y0: f32 = norm > 0.0 ? (sum0 / norm) : 0.0
      const y1: f32 = norm > 0.0 ? (sum1 / norm) : 0.0
      storeLerp(out$, len1, clamp01(y0), clamp01(y1))
    }

    this.lastTrig = lastTrig
  }
}
