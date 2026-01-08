import { bpm, globalSampleCount, sampleRate } from '../globals'
import { Program } from '../program'
import { Gen } from './gen'

export class Tram extends Gen {
  bytecode$: usize = 0
  bar$: usize = 0

  reset(): void {
    // No state to reset - we're deterministic
  }

  copyFrom(other: Gen): void {
    const src = other as Tram
    // No state to copy
  }

  process(out$: usize, length: i32): void {
    const barPtr = this.bar$
    const barValue = Math.max(0.000001, load<f32>(barPtr) as f64)

    const rate: f64 = sampleRate as f64
    const safeBpm: f64 = Math.max(1.0, bpm as f64)
    const samplesPerWholeNote: f64 = (60.0 / safeBpm) * rate * 4.0
    const interval: f64 = barValue * samplesPerWholeNote

    const bytecodePtr = this.bytecode$
    if (bytecodePtr === 0) {
      // No bytecode, no output
      for (let i = 0; i < length; i++) {
        store<f32>(out$, 0.0)
        out$ += 4
      }
      return
    }

    // Read sequence length from bytecode
    const seqLength = i32(load<f32>(bytecodePtr))
    if (seqLength <= 0) {
      // Empty sequence, no output
      for (let i = 0; i < length; i++) {
        store<f32>(out$, 0.0)
        out$ += 4
      }
      return
    }

    for (let i = 0; i < length; i++) {
      const globalSample: f64 = (globalSampleCount + i) as f64
      const beatPosition = globalSample / interval
      const stepIndex = i32(Math.floor(beatPosition * seqLength)) % seqLength

      // Read the bit from packed bytecode
      const packedIndex = stepIndex / 32
      const bitIndex = stepIndex % 32
      const packedValue = load<f32>(bytecodePtr + 4 + packedIndex * 4)
      const bit = (i32(packedValue) & (1 << bitIndex)) !== 0

      const value: f32 = bit ? 1.0 : 0.0
      store<f32>(out$, value)
      out$ += 4
    }
  }
}
