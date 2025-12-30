// dprint-ignore-file
import { Gen } from './gen'

const LFO_WT_BITS: i32 = 11
const LFO_WT_SIZE: i32 = 1 << LFO_WT_BITS
const LFO_WT_MASK: i32 = LFO_WT_SIZE - 1

let lfoTablesReady: bool = false
const lfoSineTable: StaticArray<f32> = new StaticArray<f32>(LFO_WT_SIZE)
const lfoTriTable: StaticArray<f32> = new StaticArray<f32>(LFO_WT_SIZE)
const lfoSawTable: StaticArray<f32> = new StaticArray<f32>(LFO_WT_SIZE)
const lfoRampTable: StaticArray<f32> = new StaticArray<f32>(LFO_WT_SIZE)
const lfoSqrTable: StaticArray<f32> = new StaticArray<f32>(LFO_WT_SIZE)

// @ts-ignore
// @inline
function initLfoTables(): void {
  if (lfoTablesReady) return
  lfoTablesReady = true

  const inv: f64 = 1.0 / (LFO_WT_SIZE as f64)
  for (let i: i32 = 0; i < LFO_WT_SIZE; i++) {
    const p01: f32 = (f64(i) * inv) as f32

    unchecked(
      lfoSineTable[i] = (0.5 as f32) + (0.5 as f32) * Mathf.sin(p01 * TWO_PI)
    )

    // Phase-shifted triangle, centered at 0.5:
    // p=0 -> 0.5, p=0.25 -> 1, p=0.75 -> 0, p=1 -> 0.5
    const triP: f64 = (f64(i) * inv) + 0.25
    const y11: f64 = triStd11(triP)
    unchecked(lfoTriTable[i] = ((y11 + 1.0) * 0.5) as f32)

    // Saw in 0..1 with p=0 -> 0.5 and discontinuity at p=0.5
    unchecked(lfoSawTable[i] = fractf64((f64(i) * inv) + 0.5) as f32)

    // Ramp in 0..1 with p=0 -> 0.5 and discontinuity at p=0.5
    unchecked(lfoRampTable[i] = (1.0 - fractf64((f64(i) * inv) + 0.5)) as f32)

    unchecked(
      lfoSqrTable[i] = p01 < (0.5 as f32) ? (1.0 as f32) : (0.0 as f32)
    )
  }
}

// @ts-ignore
// @inline
function wtLookup(table: StaticArray<f32>, phase01: f32): f32 {
  const x: f32 = phase01 * (LFO_WT_SIZE as f32)
  const x0: i32 = i32(x)
  const i0: i32 = x0 & LFO_WT_MASK
  const frac: f32 = x - (x0 as f32)
  const a: f32 = unchecked(table[i0])
  const b: f32 = unchecked(table[(i0 + 1) & LFO_WT_MASK])
  return (a + (b - a) * frac) as f32
}

// @ts-ignore
// @inline
function maxBar(rawBar: f64, samplesPerWholeNote: f64): f64 {
  const minBar: f64 = 1.0 / samplesPerWholeNote
  return Math.max(minBar, rawBar)
}

// @ts-ignore
// @inline
function samplesPerWholeNoteFromBpm(rate: f64): f64 {
  const safeBpm: f64 = Math.max(1.0, bpm as f64)
  return (60.0 / safeBpm) * rate * 4.0
}

// @ts-ignore
// @inline
function cycleSamples(bar: f64, samplesPerWholeNote: f64): f64 {
  return maxBar(bar, samplesPerWholeNote) * samplesPerWholeNote
}

// @ts-ignore
// @inline
function lfoPhase01(sample: f64, bar: f64, samplesPerWholeNote: f64): f64 {
  const cs: f64 = cycleSamples(bar, samplesPerWholeNote)
  return sample / cs - Math.floor(sample / cs)
}

// @ts-ignore
// @inline
function lfoCycle(sample: f64, bar: f64, samplesPerWholeNote: f64): i32 {
  const cs: f64 = cycleSamples(bar, samplesPerWholeNote)
  return i32(Math.round(sample / cs))
}

// @ts-ignore
// @inline
function fractf64(v: f64): f64 {
  return v - Math.floor(v)
}

// @ts-ignore
// @inline
function triStd11(phase01: f64): f64 {
  const p: f64 = fractf64(phase01)
  return p < 0.5 ? 4.0 * p - 1.0 : 3.0 - 4.0 * p
}

export class LfoSine extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  phase01: f32 = 0.0

  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0

  reset(): void {
    this.lastTrig = 0.0
    this.triggerSampleOffset = 0.0
    this.phase01 = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as LfoSine
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
  }

  process(out$: usize, length: i32): void {
    initLfoTables()

    let bar$ = this.bar$
    let offset$ = this.offset$
    let trig$ = this.trig$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let lastTrig: f32 = this.lastTrig
    let triggerSampleOffset: f64 = this.triggerSampleOffset

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const offsetBeats = load<f32>(offset$) as f64
      const offsetSamples = offsetBeats * samplesPerWholeNote
      const sample: f64 = (globalSampleCount + i) as f64

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        triggerSampleOffset = sample
      }
      lastTrig = trig

      const adjustedSample: f64 = (sample - triggerSampleOffset) + offsetSamples
      const phase01: f32 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote) as f32
      const y01: f32 = wtLookup(lfoSineTable, phase01)
      store<f32>(o$, y01)
      this.phase01 = phase01
      o$ += 4
      bar$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.triggerSampleOffset = triggerSampleOffset
  }
}

export class LfoTri extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  phase01: f32 = 0.0

  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0

  reset(): void {
    this.lastTrig = 0.0
    this.triggerSampleOffset = 0.0
    this.phase01 = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as LfoTri
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
  }

  process(out$: usize, length: i32): void {
    initLfoTables()

    let bar$ = this.bar$
    let offset$ = this.offset$
    let trig$ = this.trig$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let lastTrig: f32 = this.lastTrig
    let triggerSampleOffset: f64 = this.triggerSampleOffset

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const offsetBeats = load<f32>(offset$) as f64
      const offsetSamples = offsetBeats * samplesPerWholeNote
      const sample: f64 = (globalSampleCount + i) as f64

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        triggerSampleOffset = sample
      }
      lastTrig = trig

      const adjustedSample: f64 = (sample - triggerSampleOffset) + offsetSamples
      const phase01: f32 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote) as f32
      const y01: f32 = wtLookup(lfoTriTable, phase01)
      store<f32>(o$, y01)
      this.phase01 = phase01
      o$ += 4
      bar$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.triggerSampleOffset = triggerSampleOffset
  }
}

export class LfoSaw extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  phase01: f32 = 0.0

  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0

  reset(): void {
    this.lastTrig = 0.0
    this.triggerSampleOffset = 0.0
    this.phase01 = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as LfoSaw
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
  }

  process(out$: usize, length: i32): void {
    initLfoTables()

    let bar$ = this.bar$
    let offset$ = this.offset$
    let trig$ = this.trig$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let lastTrig: f32 = this.lastTrig
    let triggerSampleOffset: f64 = this.triggerSampleOffset

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const offsetBeats = load<f32>(offset$) as f64
      const offsetSamples = offsetBeats * samplesPerWholeNote
      const sample: f64 = (globalSampleCount + i) as f64

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        triggerSampleOffset = sample
      }
      lastTrig = trig

      const adjustedSample: f64 = (sample - triggerSampleOffset) + offsetSamples
      const phase01: f32 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote) as f32
      const y01: f32 = wtLookup(lfoSawTable, phase01)
      store<f32>(o$, y01)
      this.phase01 = phase01
      o$ += 4
      bar$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.triggerSampleOffset = triggerSampleOffset
  }
}

export class LfoRamp extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  phase01: f32 = 0.0

  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0

  reset(): void {
    this.lastTrig = 0.0
    this.triggerSampleOffset = 0.0
    this.phase01 = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as LfoRamp
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
  }

  process(out$: usize, length: i32): void {
    initLfoTables()

    let bar$ = this.bar$
    let offset$ = this.offset$
    let trig$ = this.trig$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let lastTrig: f32 = this.lastTrig
    let triggerSampleOffset: f64 = this.triggerSampleOffset

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const offsetBeats = load<f32>(offset$) as f64
      const offsetSamples = offsetBeats * samplesPerWholeNote
      const sample: f64 = (globalSampleCount + i) as f64

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        triggerSampleOffset = sample
      }
      lastTrig = trig

      const adjustedSample: f64 = (sample - triggerSampleOffset) + offsetSamples
      const phase01: f32 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote) as f32
      const y01: f32 = wtLookup(lfoRampTable, phase01)
      store<f32>(o$, y01)
      this.phase01 = phase01
      o$ += 4
      bar$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.triggerSampleOffset = triggerSampleOffset
  }
}

export class LfoSqr extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  phase01: f32 = 0.0

  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0

  reset(): void {
    this.lastTrig = 0.0
    this.triggerSampleOffset = 0.0
    this.phase01 = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as LfoSqr
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
  }

  process(out$: usize, length: i32): void {
    initLfoTables()

    let bar$ = this.bar$
    let offset$ = this.offset$
    let trig$ = this.trig$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let lastTrig: f32 = this.lastTrig
    let triggerSampleOffset: f64 = this.triggerSampleOffset

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const offsetBeats = load<f32>(offset$) as f64
      const offsetSamples = offsetBeats * samplesPerWholeNote
      const sample: f64 = (globalSampleCount + i) as f64

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        triggerSampleOffset = sample
      }
      lastTrig = trig

      const adjustedSample: f64 = (sample - triggerSampleOffset) + offsetSamples
      const phase01: f32 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote) as f32
      store<f32>(o$, wtLookup(lfoSqrTable, phase01))
      this.phase01 = phase01
      o$ += 4
      bar$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.triggerSampleOffset = triggerSampleOffset
  }
}

export class LfoSah extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  seed$: usize = 0
  phase01: f32 = 0.0

  private lastSeedBits: u32 = 0xffffffff
  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0
  private table: StaticArray<f32> = new StaticArray<f32>(LFO_SAH_TABLE_SIZE)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.lastTrig = 0.0
    this.triggerSampleOffset = 0.0
    this.phase01 = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as LfoSah
    this.lastSeedBits = src.lastSeedBits
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
    copyF32Static(this.table, src.table)
  }

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    let offset$ = this.offset$
    let trig$ = this.trig$
    const seed$ = this.seed$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let lastTrig: f32 = this.lastTrig
    let triggerSampleOffset: f64 = this.triggerSampleOffset

    const seedBits: u32 = seedToBits(load<f32>(seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      let s: u32 = (seedBits | 1) as u32
      for (let i: i32 = 0; i < LFO_SAH_TABLE_SIZE; i++) {
        s = xorshift32(s)
        unchecked(this.table[i] = u32To01(s))
      }
    }

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const offsetBeats = load<f32>(offset$) as f64
      const offsetSamples = offsetBeats * samplesPerWholeNote
      const sample: f64 = (globalSampleCount + i) as f64

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        triggerSampleOffset = sample
      }
      lastTrig = trig

      const adjustedSample: f64 = (sample - triggerSampleOffset) + offsetSamples
      const phase01: f64 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote)
      const cycle: i32 = lfoCycle(adjustedSample, bar, samplesPerWholeNote)
      const idx: i32 = cycle & LFO_SAH_TABLE_MASK
      store<f32>(o$, unchecked(this.table[idx]))
      this.phase01 = phase01 as f32
      o$ += 4
      bar$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.triggerSampleOffset = triggerSampleOffset
  }
}

const LFO_SAH_TABLE_BITS: i32 = 13
const LFO_SAH_TABLE_SIZE: i32 = 1 << LFO_SAH_TABLE_BITS
const LFO_SAH_TABLE_MASK: i32 = LFO_SAH_TABLE_SIZE - 1

// @ts-ignore
// @inline
function hashU32(v: u32): u32 {
  v ^= v >> 16
  v *= 0x7feb352d
  v ^= v >> 15
  v *= 0x846ca68b
  v ^= v >> 16
  return v
}

// @ts-ignore
// @inline
function seedToBits(seed: f32): u32 {
  return hashU32(reinterpret<u32>(seed))
}

// @ts-ignore
// @inline
function xorshift32(state: u32): u32 {
  state ^= state << 13
  state ^= state >> 17
  state ^= state << 5
  return state
}

// @ts-ignore
// @inline
function u32To01(v: u32): f32 {
  return (f32(v >>> 8) * (1.0 / 16777216.0)) as f32
}

// @ts-ignore
// @inline
function copyF32Static(dst: StaticArray<f32>, src: StaticArray<f32>): void {
  for (let i: i32 = 0; i < dst.length; i++) {
    unchecked(dst[i] = unchecked(src[i]))
  }
}
