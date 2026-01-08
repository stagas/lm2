import { clamp01f64 } from '../util'
import { Gen } from './gen'

export class Walk extends Gen {
  arrId: i32 = -1
  bar$: usize = 0
  swing$: usize = 0
  offset$: usize = 0

  reset(): void {
    // No state to reset - we're deterministic
  }

  copyFrom(other: Gen): void {
    const src = other as Walk
    this.arrId = src.arrId
  }

  @inline
  private static floorDivF64(a: f64, b: f64): i32 {
    return i32(Math.floor(a / b))
  }

  process(out$: usize, length: i32): void {
    // Calculate deterministic index based on current global sample count
    // The builtin handles the array access and output
    // Parameters are audio buffers, so we take the first sample
    const barPtr = this.bar$
    const swingPtr = this.swing$
    const offsetPtr = this.offset$

    const barValue = Math.max(0.000001, load<f32>(barPtr) as f64)
    const swingValue = clamp01f64(load<f32>(swingPtr) as f64)
    const offsetSeconds = load<f32>(offsetPtr) as f64

    const rate: f64 = sampleRate as f64
    const safeBpm: f64 = Math.max(1.0, bpm as f64)
    const samplesPerWholeNote: f64 = (60.0 / safeBpm) * rate * 4.0
    const interval: f64 = barValue * samplesPerWholeNote
    const offsetSamples: f64 = offsetSeconds * rate

    // Calculate current beat position deterministically
    const globalSample: f64 = globalSampleCount as f64
    let sample: f64 = globalSample - offsetSamples

    // Apply swing if enabled
    if (swingValue > 0.0) {
      const swingOffset: f64 = interval * swingValue * 0.5
      const beatIndex = Walk.floorDivF64(sample, interval)
      if ((beatIndex & 1) === 1) {
        sample -= swingOffset
      }
    }

    // Current beat cycle becomes our array index
    const currentBeatCycle = Math.max(0, Walk.floorDivF64(sample, interval))
    this.currentIndex = currentBeatCycle
  }
}
