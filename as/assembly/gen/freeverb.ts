// dprint-ignore-file
import { sampleRate } from '../globals'
import { Gen } from './gen'

const NUM_COMBS: i32 = 8
const NUM_ALLPASSES: i32 = 4

const BASE_SR: f64 = 44100.0

const FIXED_GAIN: f32 = 0.015
const SCALE_DAMP: f32 = 1.0
const SCALE_ROOM: f32 = 1.0
const ALLPASS_FEEDBACK: f32 = 0.5

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
  inL$: usize = 0
  inR$: usize = 0
  roomSize$: usize = 0
  damping$: usize = 0

  private lastSampleRate: i32 = 0

  // Stereo Freeverb tunings (L + R) at 44.1kHz.
  // Using two slightly different delay sets avoids perfectly correlated tails.
  private combTuning: StaticArray<i32> = new StaticArray<i32>(NUM_COMBS * 2)
  private allpassTuning: StaticArray<i32> = new StaticArray<i32>(NUM_ALLPASSES * 2)

  private combBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_COMBS * 2)
  private combLen: StaticArray<i32> = new StaticArray<i32>(NUM_COMBS * 2)
  private combIdx: StaticArray<i32> = new StaticArray<i32>(NUM_COMBS * 2)
  private combFilter: StaticArray<f32> = new StaticArray<f32>(NUM_COMBS * 2)

  private allpassBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_ALLPASSES * 2)
  private allpassLen: StaticArray<i32> = new StaticArray<i32>(NUM_ALLPASSES * 2)
  private allpassIdx: StaticArray<i32> = new StaticArray<i32>(NUM_ALLPASSES * 2)

  constructor() {
    super()

    // L combs
    this.combTuning[0] = 1116
    this.combTuning[1] = 1188
    this.combTuning[2] = 1277
    this.combTuning[3] = 1356
    this.combTuning[4] = 1422
    this.combTuning[5] = 1491
    this.combTuning[6] = 1557
    this.combTuning[7] = 1617
    // R combs
    this.combTuning[8] = 1139
    this.combTuning[9] = 1211
    this.combTuning[10] = 1300
    this.combTuning[11] = 1379
    this.combTuning[12] = 1445
    this.combTuning[13] = 1514
    this.combTuning[14] = 1580
    this.combTuning[15] = 1640

    // L allpasses
    this.allpassTuning[0] = 556
    this.allpassTuning[1] = 441
    this.allpassTuning[2] = 341
    this.allpassTuning[3] = 225
    // R allpasses
    this.allpassTuning[4] = 579
    this.allpassTuning[5] = 464
    this.allpassTuning[6] = 364
    this.allpassTuning[7] = 248

    for (let i: i32 = 0; i < NUM_COMBS * 2; i++) {
      this.combBufs[i] = new StaticArray<f32>(1)
      this.combLen[i] = 1
      this.combIdx[i] = 0
      this.combFilter[i] = 0.0 as f32
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES * 2; i++) {
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

    for (let i: i32 = 0; i < NUM_COMBS * 2; i++) {
      const n: i32 = scaledDelaySamples(this.combTuning[i], sr)
      this.combBufs[i] = new StaticArray<f32>(n)
      this.combLen[i] = n
      this.combIdx[i] = 0
      this.combFilter[i] = 0.0 as f32
      for (let j: i32 = 0; j < n; j++) {
        unchecked(this.combBufs[i][j] = 0.0 as f32)
      }
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES * 2; i++) {
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

    for (let i: i32 = 0; i < NUM_COMBS * 2; i++) {
      const n: i32 = this.combLen[i]
      this.combIdx[i] = 0
      this.combFilter[i] = 0.0 as f32
      const b = this.combBufs[i]
      for (let j: i32 = 0; j < n; j++) unchecked(b[j] = 0.0 as f32)
    }

    for (let i: i32 = 0; i < NUM_ALLPASSES * 2; i++) {
      const n: i32 = this.allpassLen[i]
      this.allpassIdx[i] = 0
      const b = this.allpassBufs[i]
      for (let j: i32 = 0; j < n; j++) unchecked(b[j] = 0.0 as f32)
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Freeverb
    this.lastSampleRate = src.lastSampleRate

    for (let i: i32 = 0; i < NUM_COMBS * 2; i++) {
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

    for (let i: i32 = 0; i < NUM_ALLPASSES * 2; i++) {
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

    let i$: usize = this.inL$
    let roomSize$: usize = this.roomSize$
    let damping$: usize = this.damping$

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

      const roomSize: f32 = clamp01(load<f32>(roomSize$))
      const damping: f32 = clamp01(load<f32>(damping$))

      const room1: f32 = roomSize * SCALE_ROOM
      const damping1: f32 = damping * SCALE_DAMP
      const damping2: f32 = 1.0 - damping1

      const x: f32 = input * FIXED_GAIN

      let sum: f32 = 0.0 as f32

      // Parallel combs with lowpass damping in the feedback loop
      for (let ci: i32 = 0; ci < NUM_COMBS; ci++) {
        const b = combBufs[ci]
        const n: i32 = combLen[ci]
        let p: i32 = combIdx[ci]

        const y: f32 = unchecked(b[p])
        let fs: f32 = combFilter[ci]
        fs = (y * damping2 + fs * damping1) as f32
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

      store<f32>(o$, y)

      o$ += 4
      i$ += 4
      roomSize$ += 4
      damping$ += 4
    }
  }

  processStereo(outL$: usize, outR$: usize, length: i32): void {
    this.ensureBuffers()

    let iL$: usize = this.inL$
    let iR$: usize = this.inR$ !== 0 ? this.inR$ : this.inL$
    let roomSize$: usize = this.roomSize$
    let damping$: usize = this.damping$

    const combBufs = this.combBufs
    const combLen = this.combLen
    const combIdx = this.combIdx
    const combFilter = this.combFilter

    const allpassBufs = this.allpassBufs
    const allpassLen = this.allpassLen
    const allpassIdx = this.allpassIdx

    const combBaseL: i32 = 0
    const combBaseR: i32 = NUM_COMBS
    const allpassBaseL: i32 = 0
    const allpassBaseR: i32 = NUM_ALLPASSES

    let oL$: usize = outL$
    let oR$: usize = outR$

    for (let s: i32 = 0; s < length; s++) {
      const inL: f32 = load<f32>(iL$)
      const inR: f32 = load<f32>(iR$)

      const roomSize: f32 = clamp01(load<f32>(roomSize$))
      const damping: f32 = clamp01(load<f32>(damping$))

      const room1: f32 = roomSize * SCALE_ROOM
      const damping1: f32 = damping * SCALE_DAMP
      const damping2: f32 = 1.0 - damping1

      const xL: f32 = inL * FIXED_GAIN
      const xR: f32 = inR * FIXED_GAIN

      let sumL: f32 = 0.0 as f32
      let sumR: f32 = 0.0 as f32

      for (let ci: i32 = 0; ci < NUM_COMBS; ci++) {
        // L
        {
          const i: i32 = combBaseL + ci
          const b = combBufs[i]
          const n: i32 = combLen[i]
          let p: i32 = combIdx[i]

          const y: f32 = unchecked(b[p])
          let fs: f32 = combFilter[i]
          fs = (y * damping2 + fs * damping1) as f32
          combFilter[i] = fs
          unchecked(b[p] = (xL + fs * room1) as f32)

          p++
          if (p >= n) p = 0
          combIdx[i] = p
          sumL += y
        }

        // R
        {
          const i: i32 = combBaseR + ci
          const b = combBufs[i]
          const n: i32 = combLen[i]
          let p: i32 = combIdx[i]

          const y: f32 = unchecked(b[p])
          let fs: f32 = combFilter[i]
          fs = (y * damping2 + fs * damping1) as f32
          combFilter[i] = fs
          unchecked(b[p] = (xR + fs * room1) as f32)

          p++
          if (p >= n) p = 0
          combIdx[i] = p
          sumR += y
        }
      }

      let yL: f32 = sumL
      let yR: f32 = sumR

      for (let ai: i32 = 0; ai < NUM_ALLPASSES; ai++) {
        // L
        {
          const i: i32 = allpassBaseL + ai
          const b = allpassBufs[i]
          const n: i32 = allpassLen[i]
          let p: i32 = allpassIdx[i]

          const bufOut: f32 = unchecked(b[p])
          const v: f32 = (yL + bufOut * ALLPASS_FEEDBACK) as f32
          unchecked(b[p] = v)
          yL = (bufOut - yL) as f32

          p++
          if (p >= n) p = 0
          allpassIdx[i] = p
        }

        // R
        {
          const i: i32 = allpassBaseR + ai
          const b = allpassBufs[i]
          const n: i32 = allpassLen[i]
          let p: i32 = allpassIdx[i]

          const bufOut: f32 = unchecked(b[p])
          const v: f32 = (yR + bufOut * ALLPASS_FEEDBACK) as f32
          unchecked(b[p] = v)
          yR = (bufOut - yR) as f32

          p++
          if (p >= n) p = 0
          allpassIdx[i] = p
        }
      }

      store<f32>(oL$, yL)
      store<f32>(oR$, yR)

      oL$ += 4
      oR$ += 4
      iL$ += 4
      iR$ += 4
      roomSize$ += 4
      damping$ += 4
    }
  }
}
