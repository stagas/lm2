// dprint-ignore-file
import { clamp01f64, seededRandom01 } from '../util'
import { Gen } from './gen'

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
      const y01: f32 = 0.5 + 0.5 * Mathf.sin(phase01 * TWO_PI)
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
      const phase01: f64 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote)
      // Phase-shifted triangle, centered at 0.5:
      // p=0 -> 0.5, p=0.25 -> 1, p=0.75 -> 0, p=1 -> 0.5
      const q: f64 = phase01 + 0.25
      const y11: f64 = triStd11(q)
      const y01: f32 = ((y11 + 1.0) * 0.5) as f32
      store<f32>(o$, y01)
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
      // Saw in 0..1 with p=0 -> 0.5 and discontinuity at p=0.5
      const y01: f32 = fractf64((phase01 as f64) + 0.5) as f32
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
      // Ramp in 0..1 with p=0 -> 0.5 and discontinuity at p=0.5
      const y01: f32 = (1.0 - fractf64((phase01 as f64) + 0.5)) as f32
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
      const phase01: f64 = lfoPhase01(adjustedSample, bar, samplesPerWholeNote)
      store<f32>(o$, phase01 < 0.5 ? 1.0 : 0.0)
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

export class LfoSah extends Gen {
  bar$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  seed$: usize = 0
  phase01: f32 = 0.0

  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff
  private lastTrig: f32 = 0.0
  private triggerSampleOffset: f64 = 0.0

  copyFrom(other: Gen): void {
    const src = other as LfoSah
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
    this.lastTrig = src.lastTrig
    this.triggerSampleOffset = src.triggerSampleOffset
    this.phase01 = src.phase01
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

    const seedInput: i32 = i32(load<f32>(seed$))
    if (seedInput !== this.lastSeedInput) {
      this.lastSeedInput = seedInput
      this.baseSeed = seedInput as u32
    }
    const baseSeed: u32 = this.baseSeed
    const opIndex: i32 = 1

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
      const random01: f64 = clamp01f64(seededRandom01(baseSeed, cycle as f64, opIndex))
      store<f32>(o$, random01 as f32)
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
