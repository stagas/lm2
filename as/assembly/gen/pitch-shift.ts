import { f32BufArena } from '../f32-buf-arena'
import { TWO_PI } from '../globals'
import { Gen } from './gen'

const BLOCK_SIZE: i32 = 128

export class PitchShift extends Gen {
  in$: usize = 0
  ratio$: usize = 0

  private bufferSize: i32 = 16384
  private grainSize: i32 = 8192
  private hopSize: i32 = 4096
  private writePos: i32 = 0
  private readPos: i32 = 0
  private outPhase: i32 = 0

  private bufferHandle: i32 = -1
  private grainBufferHandle: i32 = -1
  private prevGrainBufferHandle: i32 = -1
  private windowHandle: i32 = -1

  private buffer!: StaticArray<f32>
  private grainBuffer!: StaticArray<f32>
  private prevGrainBuffer!: StaticArray<f32>
  private window!: StaticArray<f32>

  constructor() {
    super()

    const h1 = f32BufArena.acquireAtLeast(this.bufferSize)
    const h2 = f32BufArena.acquireAtLeast(this.grainSize)
    const h3 = f32BufArena.acquireAtLeast(this.grainSize)
    const h4 = f32BufArena.acquireAtLeast(this.grainSize)

    if (h1 >= 0 && h2 >= 0 && h3 >= 0 && h4 >= 0) {
      this.buffer = f32BufArena.get(h1)
      this.grainBuffer = f32BufArena.get(h2)
      this.prevGrainBuffer = f32BufArena.get(h3)
      this.window = f32BufArena.get(h4)
    }
    else {
      throw new Error('PitchShift: failed to allocate buffers')
    }

    // Generate Hann window for COLA (Constant Overlap-Add)
    for (let i: i32 = 0; i < this.grainSize; i++) {
      unchecked(this.window[i] = 0.5 - 0.5 * Mathf.cos(TWO_PI * f32(i) / f32(this.grainSize)))
    }
  }

  @inline
  process(out$: usize, length: i32): void {
    const n: i32 = length
    let o$: usize = out$
    let i$: usize = this.in$
    let r$: usize = this.ratio$

    for (let sample: i32 = 0; sample < n; sample++) {
      const pitchRatio: f32 = Mathf.max(0.25, Mathf.min(unchecked(load<f32>(r$)), 4.0))

      // Calculate position within current hop cycle
      const hopPhase: i32 = this.outPhase % this.hopSize

      // Capture new grain every hopSize samples
      if (hopPhase == 0) {
        // Copy current to previous
        for (let j: i32 = 0; j < this.grainSize; j++) {
          unchecked(this.prevGrainBuffer[j] = unchecked(this.grainBuffer[j]))
        }

        // Capture new grain from buffer
        for (let j: i32 = 0; j < this.grainSize; j++) {
          const idx: i32 = (this.readPos + j) % this.bufferSize
          unchecked(this.grainBuffer[j] = unchecked(this.buffer[idx]))
        }

        // Advance read position by hopSize to maintain constant speed
        this.readPos = (this.readPos + this.hopSize) % this.bufferSize
      }

      let sampleValue: f32 = 0.0

      // Read from current grain at pitch-shifted rate (first half of window)
      const grainPos: f32 = f32(hopPhase) * pitchRatio
      const grainIdx: i32 = i32(Mathf.floor(grainPos))
      const grainFrac: f32 = grainPos - f32(grainIdx)

      // Clamp to grain boundaries for safety
      if (grainIdx >= 0 && grainIdx < this.grainSize - 1 && grainPos < f32(this.grainSize - 1)) {
        const s0: f32 = unchecked(this.grainBuffer[grainIdx])
        const s1: f32 = unchecked(this.grainBuffer[grainIdx + 1])
        const interp: f32 = s0 + grainFrac * (s1 - s0)
        // hopPhase 0...hopSize-1 maps to window 0...hopSize-1
        const windowVal: f32 = unchecked(this.window[hopPhase])
        sampleValue += interp * windowVal
      }
      else if (grainIdx >= 0 && grainIdx < this.grainSize) {
        // At boundary, just use last sample
        const windowVal: f32 = unchecked(this.window[hopPhase])
        const clampedIdx: i32 = grainIdx < this.grainSize ? grainIdx : this.grainSize - 1
        sampleValue += unchecked(this.grainBuffer[clampedIdx]) * windowVal
      }

      // Add overlapping previous grain (second half of window)
      const prevGrainPos: f32 = f32(hopPhase + this.hopSize) * pitchRatio
      const prevGrainIdx: i32 = i32(Mathf.floor(prevGrainPos))
      const prevGrainFrac: f32 = prevGrainPos - f32(prevGrainIdx)

      // Clamp to grain boundaries for safety
      if (
        prevGrainIdx >= 0
        && prevGrainIdx < this.grainSize - 1
        && prevGrainPos < f32(this.grainSize - 1)
      ) {
        const s0: f32 = unchecked(this.prevGrainBuffer[prevGrainIdx])
        const s1: f32 = unchecked(this.prevGrainBuffer[prevGrainIdx + 1])
        const interp: f32 = s0 + prevGrainFrac * (s1 - s0)
        // hopPhase 0...hopSize-1 maps to window hopSize...grainSize-1
        const windowVal: f32 = unchecked(this.window[hopPhase + this.hopSize])
        sampleValue += interp * windowVal
      }
      else if (prevGrainIdx >= 0 && prevGrainIdx < this.grainSize) {
        // At boundary, just use last sample
        const windowVal: f32 = unchecked(this.window[hopPhase + this.hopSize])
        const clampedIdx: i32 = prevGrainIdx < this.grainSize ? prevGrainIdx : this.grainSize - 1
        sampleValue += unchecked(this.prevGrainBuffer[clampedIdx]) * windowVal
      }

      // Write input to circular buffer
      unchecked(this.buffer[this.writePos] = unchecked(load<f32>(i$)))
      this.writePos = (this.writePos + 1) % this.bufferSize

      unchecked(store<f32>(o$, sampleValue))
      this.outPhase = (this.outPhase + 1) % (this.hopSize * 2)

      o$ += 4
      i$ += 4
      r$ += 4
    }
  }

  reset(): void {
    this.writePos = 0
    this.readPos = 0
    this.outPhase = 0

    // Clear buffers
    memory.fill(changetype<usize>(this.buffer), 0, this.bufferSize << 2)
    memory.fill(changetype<usize>(this.grainBuffer), 0, this.grainSize << 2)
    memory.fill(changetype<usize>(this.prevGrainBuffer), 0, this.grainSize << 2)
  }

  copyFrom(other: Gen): void {
    const src = other as PitchShift

    this.writePos = src.writePos
    this.readPos = src.readPos
    this.outPhase = src.outPhase

    // Copy buffer contents
    for (let i: i32 = 0; i < this.bufferSize; i++) {
      this.buffer[i] = src.buffer[i]
    }
    for (let i: i32 = 0; i < this.grainSize; i++) {
      this.grainBuffer[i] = src.grainBuffer[i]
      this.prevGrainBuffer[i] = src.prevGrainBuffer[i]
    }
  }
}
