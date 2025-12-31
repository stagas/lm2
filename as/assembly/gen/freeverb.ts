// dprint-ignore-file
import { sampleRate } from '../globals'
import { Gen } from './gen'

const NUM_COMBS: i32 = 8
const NUM_ALLPASSES: i32 = 4

const BASE_SR: f64 = 44100.0

const FIXED_GAIN: f32 = 0.015 as f32
const SCALE_DAMP: f32 = 0.4 as f32
const SCALE_ROOM: f32 = 0.28 as f32
const OFFSET_ROOM: f32 = 0.7 as f32
const ALLPASS_FEEDBACK: f32 = 0.5 as f32

// @ts-ignore
@inline
function clamp01(x: f32): f32 {
  return x < 0.0 ? 0.0 : x > 1.0 ? 1.0 : x
}

// @ts-ignore
@inline
function scaledDelaySamples(base: i32, sr: i32): i32 {
  const safeSr: i32 = sr > 0 ? sr : 1
  const ratio: f64 = (safeSr as f64) / BASE_SR
  let n: i32 = i32(Math.round((base as f64) * ratio))
  if (n < 1) n = 1
  return n
}

export class Freeverb extends Gen {
  in$: usize = 0
  size$: usize = 0
  damp$: usize = 0
  width$: usize = 0
  freeze$: usize = 0

  private lastSampleRate: i32 = 0

  private combTuning: StaticArray<i32> = new StaticArray<i32>(NUM_COMBS)
  private allpassTuning: StaticArray<i32> = new StaticArray<i32>(NUM_ALLPASSES)

  private combBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_COMBS)
  private combLen: StaticArray<i32> = new StaticArray<i32>(NUM_COMBS)
  private combIdx: StaticArray<i32> = new StaticArray<i32>(NUM_COMBS)
  private combFilter: StaticArray<f32> = new StaticArray<f32>(NUM_COMBS)

  private allpassBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_ALLPASSES)
  private allpassLen: StaticArray<i32> = new StaticArray<i32>(NUM_ALLPASSES)
  private allpassIdx: StaticArray<i32> = new StaticArray<i32>(NUM_ALLPASSES)

  constructor() {
    super()

    // Classic Freeverb tunings (mono set, 44.1kHz base).
    this.combTuning[0] = 1116
    this.combTuning[1] = 1188
    this.combTuning[2] = 1277
    this.combTuning[3] = 1356
    this.combTuning[4] = 1422
    this.combTuning[5] = 1491
    this.combTuning[6] = 1557
    this.combTuning[7] = 1617

    this.allpassTuning[0] = 556
    this.allpassTuning[1] = 441
    this.allpassTuning[2] = 341
    this.allpassTuning[3] = 225

    for (let i: i32 = 0; i < NUM_COMBS; i++) {
      this.combBufs[i] = new StaticArray<f32>(1)
      this.combLen[i] = 1
      this.combIdx[i] = 0
      this.combFilter[i] = 0.0 as f32
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES; i++) {
      this.allpassBufs[i] = new StaticArray<f32>(1)
      this.allpassLen[i] = 1
      this.allpassIdx[i] = 0
    }
  }

  @inline
  private ensureBuffers(): void {
    const sr: i32 = i32(sampleRate)
    if (sr === this.lastSampleRate) return
    this.lastSampleRate = sr

    for (let i: i32 = 0; i < NUM_COMBS; i++) {
      const n: i32 = scaledDelaySamples(this.combTuning[i], sr)
      this.combBufs[i] = new StaticArray<f32>(n)
      this.combLen[i] = n
      this.combIdx[i] = 0
      this.combFilter[i] = 0.0 as f32
      for (let j: i32 = 0; j < n; j++) {
        unchecked(this.combBufs[i][j] = 0.0 as f32)
      }
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES; i++) {
      const n: i32 = scaledDelaySamples(this.allpassTuning[i], sr)
      this.allpassBufs[i] = new StaticArray<f32>(n)
      this.allpassLen[i] = n
      this.allpassIdx[i] = 0
      for (let j: i32 = 0; j < n; j++) {
        unchecked(this.allpassBufs[i][j] = 0.0 as f32)
      }
    }
  }

  reset(): void {
    this.ensureBuffers()

    for (let i: i32 = 0; i < NUM_COMBS; i++) {
      const n: i32 = this.combLen[i]
      this.combIdx[i] = 0
      this.combFilter[i] = 0.0 as f32
      const b = this.combBufs[i]
      for (let j: i32 = 0; j < n; j++) unchecked(b[j] = 0.0 as f32)
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES; i++) {
      const n: i32 = this.allpassLen[i]
      this.allpassIdx[i] = 0
      const b = this.allpassBufs[i]
      for (let j: i32 = 0; j < n; j++) unchecked(b[j] = 0.0 as f32)
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Freeverb
    this.lastSampleRate = src.lastSampleRate

    for (let i: i32 = 0; i < NUM_COMBS; i++) {
      this.combTuning[i] = src.combTuning[i]
      const n: i32 = src.combLen[i]
      this.combLen[i] = n
      this.combIdx[i] = n > 0 ? (src.combIdx[i] % n) : 0
      this.combFilter[i] = src.combFilter[i]

      const srcBuf = src.combBufs[i]
      if (this.combBufs[i].length !== n) {
        this.combBufs[i] = new StaticArray<f32>(n)
      }
      const dstBuf = this.combBufs[i]
      for (let j: i32 = 0; j < n; j++) unchecked(dstBuf[j] = srcBuf[j])
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES; i++) {
      this.allpassTuning[i] = src.allpassTuning[i]
      const n: i32 = src.allpassLen[i]
      this.allpassLen[i] = n
      this.allpassIdx[i] = n > 0 ? (src.allpassIdx[i] % n) : 0

      const srcBuf = src.allpassBufs[i]
      if (this.allpassBufs[i].length !== n) {
        this.allpassBufs[i] = new StaticArray<f32>(n)
      }
      const dstBuf = this.allpassBufs[i]
      for (let j: i32 = 0; j < n; j++) unchecked(dstBuf[j] = srcBuf[j])
    }
  }

  process(out$: usize, length: i32): void {
    this.ensureBuffers()

    let i$: usize = this.in$
    let size$: usize = this.size$
    let damp$: usize = this.damp$
    let width$: usize = this.width$
    let freeze$: usize = this.freeze$

    const combBufs = this.combBufs
    const combLen = this.combLen
    const combIdx = this.combIdx
    const combFilter = this.combFilter

    const allpassBufs = this.allpassBufs
    const allpassLen = this.allpassLen
    const allpassIdx = this.allpassIdx

    let o$: usize = out$
    for (let s: i32 = 0; s < length; s++) {
      const input: f32 = load<f32>(i$)

      const size: f32 = clamp01(load<f32>(size$))
      const damp: f32 = clamp01(load<f32>(damp$))
      const width: f32 = clamp01(load<f32>(width$))
      const freezeMode: bool = load<f32>(freeze$) > 0.0

      const room1: f32 = freezeMode ? 1.0 : (size * SCALE_ROOM + OFFSET_ROOM)
      const damp1: f32 = freezeMode ? 0.0 : (damp * SCALE_DAMP)
      const damp2: f32 = 1.0 - damp1

      // Width affects the wet signal amplitude
      const widthScale: f32 = freezeMode ? 1.0 : (0.5 + 0.5 * width)

      const x: f32 = input * FIXED_GAIN

      let sum: f32 = 0.0 as f32

      // Parallel combs with lowpass damping in the feedback loop
      for (let ci: i32 = 0; ci < NUM_COMBS; ci++) {
        const b = combBufs[ci]
        const n: i32 = combLen[ci]
        let p: i32 = combIdx[ci]

        const y: f32 = unchecked(b[p])
        let fs: f32 = combFilter[ci]
        fs = (y * damp2 + fs * damp1) as f32
        combFilter[ci] = fs
        unchecked(b[p] = (x + fs * room1) as f32)

        p++
        if (p >= n) p = 0
        combIdx[ci] = p

        sum += y
      }

      // Series allpasses
      let y: f32 = sum
      for (let ai: i32 = 0; ai < NUM_ALLPASSES; ai++) {
        const b = allpassBufs[ai]
        const n: i32 = allpassLen[ai]
        let p: i32 = allpassIdx[ai]

        const bufOut: f32 = unchecked(b[p])
        const v: f32 = (y + bufOut * ALLPASS_FEEDBACK) as f32
        unchecked(b[p] = v)
        y = (bufOut - y) as f32

        p++
        if (p >= n) p = 0
        allpassIdx[ai] = p
      }

      store<f32>(o$, (y * widthScale) as f32)

      o$ += 4
      i$ += 4
      size$ += 4
      damp$ += 4
      width$ += 4
      freeze$ += 4
    }
  }
}
