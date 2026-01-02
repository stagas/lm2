// dprint-ignore-file
import { baseSampleRate } from '../globals'
import { cubic, nextPowerOfTwo } from '../util'
import { Gen } from './gen'

const NUM_DELAYS: i32 = 8

// Base delay lengths @ 48 kHz in samples (all prime)
const BASE_DELAYS: StaticArray<i32> = new StaticArray<i32>(8)
BASE_DELAYS[0] = 1061
BASE_DELAYS[1] = 1153
BASE_DELAYS[2] = 1307
BASE_DELAYS[3] = 1499
BASE_DELAYS[4] = 1747
BASE_DELAYS[5] = 2017
BASE_DELAYS[6] = 2399
BASE_DELAYS[7] = 2791

// Hadamard matrix 8x8 (normalized by 1/√8 ≈ 0.3535533905932738)
const HADAMARD: StaticArray<f32> = new StaticArray<f32>(64)
// Row 0: + + + + + + + +
HADAMARD[0] = 0.3535533905932738; HADAMARD[1] = 0.3535533905932738; HADAMARD[2] = 0.3535533905932738; HADAMARD[3] = 0.3535533905932738
HADAMARD[4] = 0.3535533905932738; HADAMARD[5] = 0.3535533905932738; HADAMARD[6] = 0.3535533905932738; HADAMARD[7] = 0.3535533905932738
// Row 1: + - + - + - + -
HADAMARD[8] = 0.3535533905932738; HADAMARD[9] = -0.3535533905932738; HADAMARD[10] = 0.3535533905932738; HADAMARD[11] = -0.3535533905932738
HADAMARD[12] = 0.3535533905932738; HADAMARD[13] = -0.3535533905932738; HADAMARD[14] = 0.3535533905932738; HADAMARD[15] = -0.3535533905932738
// Row 2: + + - - + + - -
HADAMARD[16] = 0.3535533905932738; HADAMARD[17] = 0.3535533905932738; HADAMARD[18] = -0.3535533905932738; HADAMARD[19] = -0.3535533905932738
HADAMARD[20] = 0.3535533905932738; HADAMARD[21] = 0.3535533905932738; HADAMARD[22] = -0.3535533905932738; HADAMARD[23] = -0.3535533905932738
// Row 3: + - - + + - - +
HADAMARD[24] = 0.3535533905932738; HADAMARD[25] = -0.3535533905932738; HADAMARD[26] = -0.3535533905932738; HADAMARD[27] = 0.3535533905932738
HADAMARD[28] = 0.3535533905932738; HADAMARD[29] = -0.3535533905932738; HADAMARD[30] = -0.3535533905932738; HADAMARD[31] = 0.3535533905932738
// Row 4: + + + + - - - -
HADAMARD[32] = 0.3535533905932738; HADAMARD[33] = 0.3535533905932738; HADAMARD[34] = 0.3535533905932738; HADAMARD[35] = 0.3535533905932738
HADAMARD[36] = -0.3535533905932738; HADAMARD[37] = -0.3535533905932738; HADAMARD[38] = -0.3535533905932738; HADAMARD[39] = -0.3535533905932738
// Row 5: + - + - - + - +
HADAMARD[40] = 0.3535533905932738; HADAMARD[41] = -0.3535533905932738; HADAMARD[42] = 0.3535533905932738; HADAMARD[43] = -0.3535533905932738
HADAMARD[44] = -0.3535533905932738; HADAMARD[45] = 0.3535533905932738; HADAMARD[46] = -0.3535533905932738; HADAMARD[47] = 0.3535533905932738
// Row 6: + + - - - - + +
HADAMARD[48] = 0.3535533905932738; HADAMARD[49] = 0.3535533905932738; HADAMARD[50] = -0.3535533905932738; HADAMARD[51] = -0.3535533905932738
HADAMARD[52] = -0.3535533905932738; HADAMARD[53] = -0.3535533905932738; HADAMARD[54] = 0.3535533905932738; HADAMARD[55] = 0.3535533905932738
// Row 7: + - - + - + + -
HADAMARD[56] = 0.3535533905932738; HADAMARD[57] = -0.3535533905932738; HADAMARD[58] = -0.3535533905932738; HADAMARD[59] = 0.3535533905932738
HADAMARD[60] = -0.3535533905932738; HADAMARD[61] = 0.3535533905932738; HADAMARD[62] = 0.3535533905932738; HADAMARD[63] = -0.3535533905932738

// Modulation phases (radians): [0, π/4, π/2, 3π/4, π, 5π/4, 3π/2, 7π/4]
const MOD_PHASES: StaticArray<f32> = new StaticArray<f32>(8)
MOD_PHASES[0] = 0.0 as f32
MOD_PHASES[1] = 0.7853981633974483 as f32 // π/4
MOD_PHASES[2] = 1.5707963267948966 as f32 // π/2
MOD_PHASES[3] = 2.356194490192345 as f32 // 3π/4
MOD_PHASES[4] = 3.141592653589793 as f32 // π
MOD_PHASES[5] = 3.9269908169872414 as f32 // 5π/4
MOD_PHASES[6] = 4.71238898038469 as f32 // 3π/2
MOD_PHASES[7] = 5.497787143782138 as f32 // 7π/4

const MOD_RATE_HZ: f32 = 0.15 as f32
const MOD_DEPTH_MS: f32 = 0.35 as f32

export class Fdn extends Gen {
  inL$: usize = 0
  inR$: usize = 0
  roomSize$: usize = 0
  damping$: usize = 0
  decay$: usize = 0
  modulationDepth$: usize = 0

  // Delay lines (power-of-two sized buffers with masks) @ 48 kHz fixed.
  private delayBufs: StaticArray<StaticArray<f32>> = new StaticArray<StaticArray<f32>>(NUM_DELAYS)
  private delayMasks: StaticArray<i32> = new StaticArray<i32>(NUM_DELAYS)
  private delayWrites: StaticArray<i32> = new StaticArray<i32>(NUM_DELAYS)

  // Feedback loop state (per delay line, in order)
  private dcX1: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)
  private dcY1: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)
  private lpY1: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)
  private hpX1: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)
  private hpY1: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)

  // Scratch buffers (avoid allocating in audio callback)
  private tmpDelayOuts: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)
  private tmpFeedback: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)

  // Modulation state
  private modPhases: StaticArray<f32> = new StaticArray<f32>(NUM_DELAYS)

  constructor() {
    super()

    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      const baseLen: i32 = BASE_DELAYS[i]
      const maxModDepthSamples: i32 = i32(Mathf.ceil((MOD_DEPTH_MS * (48.0 as f32)) as f32))
      const cap: i32 = nextPowerOfTwo(baseLen + maxModDepthSamples + 4)
      this.delayBufs[i] = new StaticArray<f32>(cap)
      this.delayMasks[i] = cap - 1
      this.delayWrites[i] = 0
      this.dcX1[i] = 0.0 as f32
      this.dcY1[i] = 0.0 as f32
      this.lpY1[i] = 0.0 as f32
      this.hpX1[i] = 0.0 as f32
      this.hpY1[i] = 0.0 as f32
      this.tmpDelayOuts[i] = 0.0
      this.tmpFeedback[i] = 0.0
      this.modPhases[i] = MOD_PHASES[i]

      const b = this.delayBufs[i]
      for (let j: i32 = 0; j < cap; j++) unchecked(b[j] = 0.0 as f32)
    }
  }

  @inline
  private writeDelay(i: i32, value: f32): void {
    const mask: i32 = this.delayMasks[i]
    const write: i32 = this.delayWrites[i]
    unchecked(this.delayBufs[i][write] = value)
    this.delayWrites[i] = (write + 1) & mask
  }

  @inline
  private processFeedback(i: i32, input: f32, decay: f32, damping: f32): f32 {
    // DC blocker: y[n] = x[n] − x[n−1] + 0.995·y[n−1]
    const x1: f32 = this.dcX1[i]
    const y1: f32 = this.dcY1[i]
    const dcOut: f32 = (input - x1 + (0.995 as f32) * y1) as f32
    this.dcX1[i] = input
    this.dcY1[i] = dcOut

    // 1-pole LPF (Damping): cutoff 12 kHz → 1.5 kHz (0=bright, 1=dark).
    const cutoffHz: f32 = ((12000.0 as f32) - damping * ((12000.0 as f32) - (1500.0 as f32))) as f32
    const lpA: f32 = Mathf.exp((-(2.0 as f32) * Mathf.PI * cutoffHz / baseSampleRate) as f32)
    const lpY: f32 = ((((1.0 as f32) - lpA) * dcOut) + (lpA * this.lpY1[i])) as f32
    this.lpY1[i] = lpY

    // 1-pole HPF fixed at 120 Hz.
    const hpA: f32 = Mathf.exp((-(2.0 as f32) * Mathf.PI * (120.0 as f32) / baseSampleRate) as f32)
    const hpY: f32 = (hpA * (this.hpY1[i] + lpY - this.hpX1[i])) as f32
    this.hpX1[i] = lpY
    this.hpY1[i] = hpY

    // Global feedback gain (Decay). Hadamard is normalized, so stability is ensured for decay in [0..1).
    return (hpY * decay) as f32
  }

  reset(): void {
    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      const cap: i32 = this.delayBufs[i].length
      for (let j: i32 = 0; j < cap; j++) unchecked(this.delayBufs[i][j] = 0.0)
      this.delayWrites[i] = 0
      this.dcX1[i] = 0.0 as f32
      this.dcY1[i] = 0.0 as f32
      this.lpY1[i] = 0.0 as f32
      this.hpX1[i] = 0.0 as f32
      this.hpY1[i] = 0.0 as f32
      this.modPhases[i] = MOD_PHASES[i]
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Fdn

    for (let i: i32 = 0; i < NUM_DELAYS; i++) {
      this.delayMasks[i] = src.delayMasks[i]
      this.delayWrites[i] = src.delayWrites[i]
      this.dcX1[i] = src.dcX1[i]
      this.dcY1[i] = src.dcY1[i]
      this.lpY1[i] = src.lpY1[i]
      this.hpX1[i] = src.hpX1[i]
      this.hpY1[i] = src.hpY1[i]
      this.modPhases[i] = src.modPhases[i]

      const srcBuf = src.delayBufs[i]
      const dstBuf = this.delayBufs[i]
      const n: i32 = srcBuf.length < dstBuf.length ? srcBuf.length : dstBuf.length
      for (let j: i32 = 0; j < n; j++) unchecked(dstBuf[j] = srcBuf[j])
      for (let j: i32 = n; j < dstBuf.length; j++) unchecked(dstBuf[j] = 0.0)
    }
  }

  processStereo(outL$: usize, outR$: usize, length: i32): void {
    let iL$: usize = this.inL$
    let iR$: usize = this.inR$ !== 0 ? this.inR$ : this.inL$
    let roomSize$: usize = this.roomSize$
    let damping$: usize = this.damping$
    let decay$: usize = this.decay$
    let modulationDepth$: usize = this.modulationDepth$

    let oL$: usize = outL$
    let oR$: usize = outR$

    const delayOuts: StaticArray<f32> = this.tmpDelayOuts
    const feedback: StaticArray<f32> = this.tmpFeedback

    for (let s: i32 = 0; s < length; s++) {
      const inL: f32 = load<f32>(iL$)
      const inR: f32 = load<f32>(iR$)
      const monoIn: f32 = ((0.5 as f32) * (inL + inR)) as f32

      const roomSize: f32 = load<f32>(roomSize$)
      const decay: f32 = load<f32>(decay$)
      const damping: f32 = load<f32>(damping$)
      const modulationDepth: f32 = load<f32>(modulationDepth$)

      // Read current delay outputs
      for (let i: i32 = 0; i < NUM_DELAYS; i++) {
        // Fractional delay (4-point cubic interpolation), with modulation applied before interpolation.
        const baseDelay: f32 = (BASE_DELAYS[i] as f32) * roomSize
        const phase: f32 = this.modPhases[i]
        const mod: f32 = Mathf.sin(phase)
        const depthSamples: f32 = (MOD_DEPTH_MS * baseSampleRate / (1000.0 as f32)) as f32
        const modOffset: f32 = (depthSamples * modulationDepth * mod) as f32
        const totalDelay: f32 = (baseDelay + modOffset) as f32

        const mask: i32 = this.delayMasks[i]
        const write: i32 = this.delayWrites[i]
        const buf = this.delayBufs[i]
        const ip: i32 = i32(totalDelay)
        const frac: f32 = (totalDelay - f32(ip)) as f32
        const idx: i32 = (write - ip) & mask
        const xm1: f32 = unchecked(buf[(idx - 1) & mask])
        const x0: f32 = unchecked(buf[idx])
        const x1: f32 = unchecked(buf[(idx + 1) & mask])
        const x2: f32 = unchecked(buf[(idx + 2) & mask])
        delayOuts[i] = cubic(xm1, x0, x1, x2, frac)

        // Modulation phase update (rate 0.15 Hz).
        let p: f32 = (phase + ((2.0 as f32) * Mathf.PI * MOD_RATE_HZ / baseSampleRate)) as f32
        const twoPi: f32 = ((2.0 as f32) * Mathf.PI) as f32
        if (p >= twoPi) p = (p - twoPi) as f32
        this.modPhases[i] = p
      }

      // Apply Hadamard matrix to get feedback signals
      for (let row: i32 = 0; row < NUM_DELAYS; row++) {
        let sum: f32 = 0.0
        for (let col: i32 = 0; col < NUM_DELAYS; col++) {
          sum += HADAMARD[row * NUM_DELAYS + col] * delayOuts[col]
        }
        feedback[row] = this.processFeedback(row, sum, decay, damping)
      }

      // Write input + feedback to delay lines
      for (let i: i32 = 0; i < NUM_DELAYS; i++) {
        this.writeDelay(i, monoIn + feedback[i])
      }

      // Output: sum of delay lines [1,3,5,7] for left, [2,4,6,8] for right
      let outL: f32 = (delayOuts[0] + delayOuts[2] + delayOuts[4] + delayOuts[6]) as f32
      let outR: f32 = (delayOuts[1] + delayOuts[3] + delayOuts[5] + delayOuts[7]) as f32

      // Normalize output gain (energy-preserving sum of 4 uncorrelated lines).
      outL = (outL * (0.5 as f32)) as f32
      outR = (outR * (0.5 as f32)) as f32

      store<f32>(oL$, outL)
      store<f32>(oR$, outR)

      oL$ += 4
      oR$ += 4
      iL$ += 4
      iR$ += 4
      roomSize$ += 4
      damping$ += 4
      decay$ += 4
      modulationDepth$ += 4
    }
  }
}
