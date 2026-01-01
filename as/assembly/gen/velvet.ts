// dprint-ignore-file
import { sampleRate } from '../globals'
import { clamp, clamp01, nextPowerOfTwo } from '../util'
import { Gen } from './gen'

const NUM_VELVET_SEQUENCES: i32 = 8
const FEEDBACK: f32 = 0.999 as f32
const DC_A: f32 = 0.995 as f32

// Base lengths for velvet sequences (prime-based for decorrelation)
const BASE_VELVET_LENGTHS: StaticArray<i32> = new StaticArray<i32>(NUM_VELVET_SEQUENCES)
BASE_VELVET_LENGTHS[0] = 2377
BASE_VELVET_LENGTHS[1] = 2851
BASE_VELVET_LENGTHS[2] = 3323
BASE_VELVET_LENGTHS[3] = 3803
BASE_VELVET_LENGTHS[4] = 2411
BASE_VELVET_LENGTHS[5] = 2887
BASE_VELVET_LENGTHS[6] = 3361
BASE_VELVET_LENGTHS[7] = 3847

export class Velvet extends Gen {
  inL$: usize = 0
  inR$: usize = 0
  roomSize$: usize = 0
  damping$: usize = 0
  decay$: usize = 0

  // Velvet delay lines - 4 per channel (L+R) for stereo decorrelation
  private velvetBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_VELVET_SEQUENCES)
  private velvetLens: StaticArray<i32> = new StaticArray<i32>(NUM_VELVET_SEQUENCES)
  private velvetMasks: StaticArray<i32> = new StaticArray<i32>(NUM_VELVET_SEQUENCES)
  private velvetWrites: StaticArray<i32> = new StaticArray<i32>(NUM_VELVET_SEQUENCES)

  // One-pole lowpass states for damping
  private lpStates: StaticArray<f32> = new StaticArray<f32>(NUM_VELVET_SEQUENCES)

  // DC blocker states (per delay line)
  private dcX1: StaticArray<f32> = new StaticArray<f32>(NUM_VELVET_SEQUENCES)
  private dcY1: StaticArray<f32> = new StaticArray<f32>(NUM_VELVET_SEQUENCES)

  // Base lengths scaled by sample rate
  private baseLens: StaticArray<i32> = new StaticArray<i32>(NUM_VELVET_SEQUENCES)

  constructor() {
    super()

    // Scale base lengths by sample rate
    const scale: f32 = f32(sampleRate) / 44100.0
    for (let i: i32 = 0; i < NUM_VELVET_SEQUENCES; i++) {
      const base: i32 = BASE_VELVET_LENGTHS[i]
      const scaled: i32 = i32(Mathf.floor(f32(base) * scale))
      this.baseLens[i] = scaled
      this.velvetLens[i] = scaled
      this.velvetWrites[i] = 0
      this.lpStates[i] = 0.0
      this.dcX1[i] = 0.0 as f32
      this.dcY1[i] = 0.0 as f32

      // Allocate maximum size buffers (2.0x room size factor) rounded up to pow2 for masking.
      const maxLen: i32 = (scaled * 2) + 4
      const cap: i32 = nextPowerOfTwo(maxLen)
      this.velvetBufs[i] = new StaticArray<f32>(cap)
      this.velvetMasks[i] = cap - 1

      // Initialize buffer to zero
      for (let j: i32 = 0; j < cap; j++) {
        unchecked(this.velvetBufs[i][j] = 0.0)
      }
    }
  }

  @inline
  private updateLens(roomSize: f32): void {
    for (let i: i32 = 0; i < NUM_VELVET_SEQUENCES; i++) {
      let n: i32 = i32(Mathf.floor(f32(this.baseLens[i]) * roomSize))
      if (n < 1) n = 1
      const maxN: i32 = this.velvetMasks[i]
      if (n > maxN) n = maxN
      this.velvetLens[i] = n
    }
  }

  @inline
  private tick(i: i32, input: f32, damping: f32, decay: f32): f32 {
    const b = this.velvetBufs[i]
    const mask: i32 = this.velvetMasks[i]
    const n: i32 = this.velvetLens[i]

    const w: i32 = this.velvetWrites[i]
    const r: i32 = (w - n) & mask

    const v: f32 = unchecked(b[r])

    // DC blocker: y[n] = x[n] − x[n−1] + 0.995·y[n−1]
    const x1: f32 = this.dcX1[i]
    const y1: f32 = this.dcY1[i]
    const dcOut: f32 = (v - x1 + (DC_A * y1)) as f32
    this.dcX1[i] = v
    this.dcY1[i] = dcOut

    let lp: f32 = this.lpStates[i]
    lp = (dcOut * (1.0 - damping) + lp * damping) as f32
    this.lpStates[i] = lp

    unchecked(b[w] = (input + lp * decay) as f32)
    this.velvetWrites[i] = (w + 1) & mask

    return dcOut
  }

  reset(): void {
    for (let i: i32 = 0; i < NUM_VELVET_SEQUENCES; i++) {
      const b = this.velvetBufs[i]
      const cap: i32 = b.length
      this.velvetWrites[i] = 0
      this.lpStates[i] = 0.0
      this.dcX1[i] = 0.0 as f32
      this.dcY1[i] = 0.0 as f32
      for (let j: i32 = 0; j < cap; j++) {
        unchecked(b[j] = 0.0)
      }
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Velvet

    for (let i: i32 = 0; i < NUM_VELVET_SEQUENCES; i++) {
      this.velvetMasks[i] = src.velvetMasks[i]
      const n: i32 = src.velvetLens[i]
      this.velvetLens[i] = n
      this.velvetWrites[i] = src.velvetWrites[i]
      this.lpStates[i] = src.lpStates[i]
      this.dcX1[i] = src.dcX1[i]
      this.dcY1[i] = src.dcY1[i]
      this.baseLens[i] = src.baseLens[i]

      const srcBuf = src.velvetBufs[i]
      const dstBuf = this.velvetBufs[i]
      const copyLen: i32 = srcBuf.length < dstBuf.length ? srcBuf.length : dstBuf.length
      for (let j: i32 = 0; j < copyLen; j++) {
        unchecked(dstBuf[j] = srcBuf[j])
      }
    }
  }

  processStereo(outL$: usize, outR$: usize, length: i32): void {
    let iL$: usize = this.inL$
    let iR$: usize = this.inR$ !== 0 ? this.inR$ : this.inL$
    let roomSize$: usize = this.roomSize$
    let damping$: usize = this.damping$
    let decay$: usize = this.decay$

    let oL$: usize = outL$
    let oR$: usize = outR$

    for (let s: i32 = 0; s < length; s++) {
      const inL: f32 = load<f32>(iL$)
      const inR: f32 = load<f32>(iR$)

      const roomSize: f32 = clamp(load<f32>(roomSize$), 0.1, 2.0)
      const damping: f32 = clamp01(load<f32>(damping$))
      const decay: f32 = clamp01(load<f32>(decay$))

      this.updateLens(roomSize)

      // Process left channel (sequences 0-3)
      let sumL: f32 = 0.0
      for (let i: i32 = 0; i < 4; i++) {
        sumL += this.tick(i, inL, damping, decay)
      }

      // Process right channel (sequences 4-7)
      let sumR: f32 = 0.0
      for (let i: i32 = 4; i < 8; i++) {
        sumR += this.tick(i, inR, damping, decay)
      }

      // Mix outputs
      const outL: f32 = sumL * 0.25
      const outR: f32 = sumR * 0.25

      store<f32>(oL$, outL)
      store<f32>(oR$, outR)

      oL$ += 4
      oR$ += 4
      iL$ += 4
      iR$ += 4
      roomSize$ += 4
      damping$ += 4
      decay$ += 4
    }
  }
}
