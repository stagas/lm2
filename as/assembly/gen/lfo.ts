import { clamp01f64, seededRandom01 } from '../util'
import { Gen } from './gen'

function maxBar(rawBar: f64, samplesPerWholeNote: f64): f64 {
  const minBar: f64 = 1.0 / samplesPerWholeNote
  return Math.max(minBar, rawBar)
}

function samplesPerWholeNoteFromBpm(rate: f64): f64 {
  const safeBpm: f64 = Math.max(1.0, bpm as f64)
  return (60.0 / safeBpm) * rate * 4.0
}

function lfoPhase01(sample: f64, bar: f64, samplesPerWholeNote: f64): f64 {
  const cycleSamples: f64 = maxBar(bar, samplesPerWholeNote) * samplesPerWholeNote
  return sample / cycleSamples - Math.floor(sample / cycleSamples)
}

function lfoCycle(sample: f64, bar: f64, samplesPerWholeNote: f64): i32 {
  const cycleSamples: f64 = maxBar(bar, samplesPerWholeNote) * samplesPerWholeNote
  return i32(Math.floor(sample / cycleSamples))
}

export class LfoSine extends Gen {
  bar$: usize = 0

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const sample = (globalSampleCount + i) as f64
      const phase01 = lfoPhase01(sample, bar, samplesPerWholeNote)
      store<f32>(o$, Mathf.sin((phase01 as f32) * TWO_PI))
      o$ += 4
      bar$ += 4
    }
  }
}

export class LfoTri extends Gen {
  bar$: usize = 0

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const sample = (globalSampleCount + i) as f64
      const phase01 = lfoPhase01(sample, bar, samplesPerWholeNote)
      const p = phase01 as f32
      const y: f32 = p < 0.5 ? (4.0 * p - 1.0) : (3.0 - 4.0 * p)
      store<f32>(o$, y)
      o$ += 4
      bar$ += 4
    }
  }
}

export class LfoSaw extends Gen {
  bar$: usize = 0

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const sample = (globalSampleCount + i) as f64
      const phase01 = lfoPhase01(sample, bar, samplesPerWholeNote) as f32
      store<f32>(o$, 2.0 * phase01 - 1.0)
      o$ += 4
      bar$ += 4
    }
  }
}

export class LfoRamp extends Gen {
  bar$: usize = 0

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const sample = (globalSampleCount + i) as f64
      const phase01 = lfoPhase01(sample, bar, samplesPerWholeNote) as f32
      store<f32>(o$, 1.0 - 2.0 * phase01)
      o$ += 4
      bar$ += 4
    }
  }
}

export class LfoSqr extends Gen {
  bar$: usize = 0

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

    let o$ = out$
    for (let i: i32 = 0; i < length; i++) {
      const bar = load<f32>(bar$) as f64
      const sample = (globalSampleCount + i) as f64
      const phase01 = lfoPhase01(sample, bar, samplesPerWholeNote)
      store<f32>(o$, phase01 < 0.5 ? 1.0 : -1.0)
      o$ += 4
      bar$ += 4
    }
  }
}

export class LfoSah extends Gen {
  bar$: usize = 0
  seed$: usize = 0

  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff

  copyFrom(other: Gen): void {
    const src = other as LfoSah
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
  }

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    const seed$ = this.seed$
    const rate: f64 = sampleRate as f64
    const samplesPerWholeNote: f64 = samplesPerWholeNoteFromBpm(rate)

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
      const sample = (globalSampleCount + i) as f64
      const cycle: i32 = lfoCycle(sample, bar, samplesPerWholeNote)
      const random01: f64 = clamp01f64(seededRandom01(baseSeed, cycle as f64, opIndex))
      store<f32>(o$, (random01 * 2.0 - 1.0) as f32)
      o$ += 4
      bar$ += 4
    }
  }
}


