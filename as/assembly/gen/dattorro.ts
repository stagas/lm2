// dprint-ignore-file
import { sampleRate } from '../globals'
import { Gen } from './gen'

const NUM_DELAYS: i32 = 12
const NUM_TAPS: i32 = 14
const CHUNK_SIZE: i32 = 128

const WET_GAIN: f32 = 0.18

const EXC_2PI_1: f64 = 6.28
const EXC_2PI_2: f64 = 6.2847

// @ts-ignore
@inline
function clamp01(x: f32): f32 {
  return x < 0.0 ? 0.0 : x > 1.0 ? 1.0 : x
}

// @ts-ignore
@inline
function nextPow2(n: i32): i32 {
  let x: i32 = n <= 1 ? 1 : n - 1
  x |= x >> 1
  x |= x >> 2
  x |= x >> 4
  x |= x >> 8
  x |= x >> 16
  return x + 1
}

export class Dattorro extends Gen {
  inL$: usize = 0
  inR$: usize = 0
  roomSize$: usize = 0
  damping$: usize = 0
  bandwidth$: usize = 0
  inputDiffusion1$: usize = 0
  inputDiffusion2$: usize = 0
  decayDiffusion1$: usize = 0
  decayDiffusion2$: usize = 0
  excursionRate$: usize = 0
  excursionDepth$: usize = 0
  preDelay$: usize = 0

  private lastSampleRate: i32 = 0

  private delaySecs: StaticArray<f64> = new StaticArray<f64>(NUM_DELAYS)
  private tapSecs: StaticArray<f64> = new StaticArray<f64>(NUM_TAPS)

  private taps: StaticArray<i32> = new StaticArray<i32>(NUM_TAPS)

  private preDelay: StaticArray<f32> = new StaticArray<f32>(CHUNK_SIZE)
  private preDelayLength: i32 = CHUNK_SIZE
  private preDelayWrite: i32 = 0

  private lp1: f32 = 0.0 as f32
  private lp2: f32 = 0.0 as f32
  private lp3: f32 = 0.0 as f32

  private excPhase: f64 = 0.0
  private excStep: f64 = 0.0
  private excDepthSamples: f64 = 0.0

  private dBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_DELAYS)
  private dMask: StaticArray<i32> = new StaticArray<i32>(NUM_DELAYS)
  private dLen: StaticArray<i32> = new StaticArray<i32>(NUM_DELAYS)
  private dWrite: StaticArray<i32> = new StaticArray<i32>(NUM_DELAYS)
  private dRead: StaticArray<i32> = new StaticArray<i32>(NUM_DELAYS)

  constructor() {
    super()

    // Delay lengths in seconds (Dattorro tank + pre-diffusers).
    this.delaySecs[0] = 0.004771345
    this.delaySecs[1] = 0.003595309
    this.delaySecs[2] = 0.012734787
    this.delaySecs[3] = 0.009307483
    this.delaySecs[4] = 0.022579886
    this.delaySecs[5] = 0.149625349
    this.delaySecs[6] = 0.060481839
    this.delaySecs[7] = 0.1249958
    this.delaySecs[8] = 0.030509727
    this.delaySecs[9] = 0.141695508
    this.delaySecs[10] = 0.089244313
    this.delaySecs[11] = 0.106280031

    // Output taps in seconds.
    this.tapSecs[0] = 0.008937872
    this.tapSecs[1] = 0.099929438
    this.tapSecs[2] = 0.064278754
    this.tapSecs[3] = 0.067067639
    this.tapSecs[4] = 0.066866033
    this.tapSecs[5] = 0.006283391
    this.tapSecs[6] = 0.035818689
    this.tapSecs[7] = 0.011861161
    this.tapSecs[8] = 0.121870905
    this.tapSecs[9] = 0.041262054
    this.tapSecs[10] = 0.08981553
    this.tapSecs[11] = 0.070931756
    this.tapSecs[12] = 0.011256342
    this.tapSecs[13] = 0.004065724

    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      this.dBufs[i] = new StaticArray<f32>(1)
      this.dMask[i] = 0
      this.dLen[i] = 1
      this.dWrite[i] = 0
      this.dRead[i] = 0
    }
  }

  @inline
  private ensureBuffers(): void {
    const sr: i32 = i32(sampleRate)
    if (sr === this.lastSampleRate) return
    this.lastSampleRate = sr

    // Pre-delay: one second, rounded up to the nearest CHUNK_SIZE.
    const rem: i32 = sr % CHUNK_SIZE
    const pad: i32 = rem === 0 ? 0 : (CHUNK_SIZE - rem)
    const pLen: i32 = sr + pad
    this.preDelayLength = pLen
    this.preDelayWrite = 0
    this.preDelay = new StaticArray<f32>(pLen)
    for (let i: i32 = 0; i < pLen; i++) unchecked(this.preDelay[i] = 0.0 as f32)

    // Excursion parameters in samples (will be updated per-sample in processStereo).
    this.excStep = 0.5 / (sr as f64) // Default excursionRate
    this.excDepthSamples = 0.7 * (sr as f64) / 1000.0 // Default excursionDepth

    // Delay lines (power-of-two backing buffers with mask).
    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      const baseSec: f64 = this.delaySecs[i]
      let len: i32 = i32(Math.round(baseSec * (sr as f64)))
      if (len < 1) len = 1
      const cap: i32 = nextPow2(len)
      const mask: i32 = cap - 1

      this.dBufs[i] = new StaticArray<f32>(cap)
      this.dMask[i] = mask
      this.dLen[i] = len
      this.dWrite[i] = (len - 1) & mask
      this.dRead[i] = 0
      const b = this.dBufs[i]
      for (let j: i32 = 0; j < cap; j++) unchecked(b[j] = 0.0 as f32)
    }

    // Output taps in samples.
    for (let i: i32 = 0; i < NUM_TAPS; i++) {
      const t: i32 = i32(Math.round(this.tapSecs[i] * (sr as f64)))
      this.taps[i] = t
    }
  }

  @inline
  private writeDelay(i: i32, v: f32): f32 {
    const w: i32 = this.dWrite[i]
    unchecked(this.dBufs[i][w] = v)
    return v
  }

  @inline
  private readDelay(i: i32): f32 {
    const r: i32 = this.dRead[i]
    return unchecked(this.dBufs[i][r])
  }

  @inline
  private readDelayAt(i: i32, off: i32): f32 {
    const r: i32 = this.dRead[i]
    const m: i32 = this.dMask[i]
    return unchecked(this.dBufs[i][(r + off) & m])
  }

  // Cubic interpolation (O. Niemitalo).
  @inline
  private readDelayCAt(i: i32, off: f32): f32 {
    const ip: i32 = i32(off)
    const frac: f32 = (off - f32(ip)) as f32
    let idx: i32 = (ip + this.dRead[i] - 1) as i32
    const m: i32 = this.dMask[i]
    const b = this.dBufs[i]

    const x0: f32 = unchecked(b[idx & m])
    idx++
    const x1: f32 = unchecked(b[idx & m])
    idx++
    const x2: f32 = unchecked(b[idx & m])
    idx++
    const x3: f32 = unchecked(b[idx & m])

    const a: f32 = ((3.0 as f32) * (x1 - x2) - x0 + x3) * (0.5 as f32)
    const b2: f32 = ((2.0 as f32) * x2 + x0 - ((5.0 as f32) * x1 + x3) * (0.5 as f32)) as f32
    const c: f32 = ((x2 - x0) * (0.5 as f32)) as f32

    return (((a * frac + b2) * frac + c) * frac + x1) as f32
  }

  @inline
  private advanceDelays(): void {
    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      const m: i32 = this.dMask[i]
      this.dWrite[i] = (this.dWrite[i] + 1) & m
      this.dRead[i] = (this.dRead[i] + 1) & m
    }
  }

  reset(): void {
    this.ensureBuffers()
    this.preDelayWrite = 0
    this.lp1 = 0.0 as f32
    this.lp2 = 0.0 as f32
    this.lp3 = 0.0 as f32
    this.excPhase = 0.0

    const pLen: i32 = this.preDelayLength
    for (let i: i32 = 0; i < pLen; i++) unchecked(this.preDelay[i] = 0.0 as f32)

    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      const m: i32 = this.dMask[i]
      const len: i32 = this.dLen[i]
      this.dWrite[i] = (len - 1) & m
      this.dRead[i] = 0
      const b = this.dBufs[i]
      for (let j: i32 = 0; j < b.length; j++) unchecked(b[j] = 0.0 as f32)
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Dattorro
    this.lastSampleRate = src.lastSampleRate

    this.preDelayLength = src.preDelayLength
    this.preDelayWrite = src.preDelayWrite
    this.lp1 = src.lp1
    this.lp2 = src.lp2
    this.lp3 = src.lp3
    this.excPhase = src.excPhase
    this.excStep = src.excStep
    this.excDepthSamples = src.excDepthSamples

    for (let i: i32 = 0; i < NUM_TAPS; i++) {
      this.tapSecs[i] = src.tapSecs[i]
      this.taps[i] = src.taps[i]
    }

    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      this.delaySecs[i] = src.delaySecs[i]
      this.dMask[i] = src.dMask[i]
      this.dLen[i] = src.dLen[i]
      this.dWrite[i] = src.dWrite[i]
      this.dRead[i] = src.dRead[i]

      const srcBuf = src.dBufs[i]
      if (this.dBufs[i].length !== srcBuf.length) {
        this.dBufs[i] = new StaticArray<f32>(srcBuf.length)
      }
      const dstBuf = this.dBufs[i]
      for (let j: i32 = 0; j < srcBuf.length; j++) unchecked(dstBuf[j] = srcBuf[j])
    }

    if (this.preDelay.length !== src.preDelay.length) {
      this.preDelay = new StaticArray<f32>(src.preDelay.length)
    }
    for (let i: i32 = 0; i < src.preDelay.length; i++) unchecked(this.preDelay[i] = src.preDelay[i])
  }

  processStereo(outL$: usize, outR$: usize, length: i32): void {
    this.ensureBuffers()

    let iL$: usize = this.inL$
    let iR$: usize = this.inR$ !== 0 ? this.inR$ : this.inL$
    let roomSize$: usize = this.roomSize$
    let damping$: usize = this.damping$
    let bandwidth$: usize = this.bandwidth$
    let inputDiffusion1$: usize = this.inputDiffusion1$
    let inputDiffusion2$: usize = this.inputDiffusion2$
    let decayDiffusion1$: usize = this.decayDiffusion1$
    let decayDiffusion2$: usize = this.decayDiffusion2$
    let excursionRate$: usize = this.excursionRate$
    let excursionDepth$: usize = this.excursionDepth$
    let preDelay$: usize = this.preDelay$

    let oL$: usize = outL$
    let oR$: usize = outR$

    let phase: f64 = this.excPhase

    for (let s: i32 = 0; s < length; s++) {
      const inL: f32 = load<f32>(iL$)
      const inR: f32 = load<f32>(iR$)
      const input: f32 = ((inL + inR) * (0.5 as f32)) as f32

      const w: i32 = this.preDelayWrite + s
      unchecked(this.preDelay[w] = input)

      const pd: i32 = i32(Math.round(clamp01(load<f32>(preDelay$)) * f32(this.preDelayLength - 1)))
      const preIdx: i32 = (this.preDelayLength + this.preDelayWrite - pd + s) % this.preDelayLength
      const preIn: f32 = unchecked(this.preDelay[preIdx])

      const bw: f32 = clamp01(load<f32>(bandwidth$))
      this.lp1 = (this.lp1 + bw * (preIn - this.lp1)) as f32

      const fi: f32 = clamp01(load<f32>(inputDiffusion1$))
      const si: f32 = clamp01(load<f32>(inputDiffusion2$))

      let pre: f32 = 0.0 as f32
      pre = this.writeDelay(0, (this.lp1 - fi * this.readDelay(0)) as f32)
      pre = this.writeDelay(1, (fi * (pre - this.readDelay(1)) + this.readDelay(0)) as f32)
      pre = this.writeDelay(2, (fi * pre + this.readDelay(1) - si * this.readDelay(2)) as f32)
      pre = this.writeDelay(3, (si * (pre - this.readDelay(3)) + this.readDelay(2)) as f32)

      const split: f32 = (si * pre + this.readDelay(3)) as f32

      const roomSize: f32 = clamp01(load<f32>(roomSize$))

      // Update excursion parameters for this sample
      const excursionRate: f64 = clamp01(load<f32>(excursionRate$)) as f64 * 2.0
      const excursionDepth: f64 = clamp01(load<f32>(excursionDepth$)) as f64 * 2.0
      const sr: i32 = i32(sampleRate)
      const phaseStep: f64 = excursionRate / (sr as f64)
      const depth: f64 = excursionDepth * (sr as f64) / 1000.0

      const exc: f32 = f32(depth * (1.0 + Math.cos(phase * EXC_2PI_1)))
      const exc2: f32 = f32(depth * (1.0 + Math.sin(phase * EXC_2PI_2)))

      const ft: f32 = clamp01(load<f32>(decayDiffusion1$))
      const st: f32 = clamp01(load<f32>(decayDiffusion2$))
      const damping: f32 = clamp01(load<f32>(damping$))
      const dp: f32 = (1.0 - damping) as f32

      // Left loop
      let temp: f32 = 0.0 as f32
      temp = this.writeDelay(4, (split + roomSize * this.readDelay(11) + ft * this.readDelayCAt(4, exc)) as f32)
      this.writeDelay(5, (this.readDelayCAt(4, exc) - ft * temp) as f32)
      this.lp2 = (this.lp2 + dp * (this.readDelay(5) - this.lp2)) as f32
      temp = this.writeDelay(6, (roomSize * this.lp2 - st * this.readDelay(6)) as f32)
      this.writeDelay(7, (this.readDelay(6) + st * temp) as f32)

      // Right loop
      temp = this.writeDelay(8, (split + roomSize * this.readDelay(7) + ft * this.readDelayCAt(8, exc2)) as f32)
      this.writeDelay(9, (this.readDelayCAt(8, exc2) - ft * temp) as f32)
      this.lp3 = (this.lp3 + dp * (this.readDelay(9) - this.lp3)) as f32
      temp = this.writeDelay(10, (roomSize * this.lp3 - st * this.readDelay(10)) as f32)
      this.writeDelay(11, (this.readDelay(10) + st * temp) as f32)

      let lo: f32 = 0.0 as f32
      let ro: f32 = 0.0 as f32

      lo = (this.readDelayAt(9, this.taps[0])
        + this.readDelayAt(9, this.taps[1])
        - this.readDelayAt(10, this.taps[2])
        + this.readDelayAt(11, this.taps[3])
        - this.readDelayAt(5, this.taps[4])
        - this.readDelayAt(6, this.taps[5])
        - this.readDelayAt(7, this.taps[6])) as f32

      ro = (this.readDelayAt(5, this.taps[7])
        + this.readDelayAt(5, this.taps[8])
        - this.readDelayAt(6, this.taps[9])
        + this.readDelayAt(7, this.taps[10])
        - this.readDelayAt(9, this.taps[11])
        - this.readDelayAt(10, this.taps[12])
        - this.readDelayAt(11, this.taps[13])) as f32

      store<f32>(oL$, (lo * WET_GAIN) as f32)
      store<f32>(oR$, (ro * WET_GAIN) as f32)

      phase += phaseStep
      this.advanceDelays()

      oL$ += 4
      oR$ += 4
      iL$ += 4
      iR$ += 4
      roomSize$ += 4
      damping$ += 4
      bandwidth$ += 4
      inputDiffusion1$ += 4
      inputDiffusion2$ += 4
      decayDiffusion1$ += 4
      decayDiffusion2$ += 4
      excursionRate$ += 4
      excursionDepth$ += 4
      preDelay$ += 4
    }

    this.excPhase = phase
    this.preDelayWrite = (this.preDelayWrite + length) % this.preDelayLength
  }
}


