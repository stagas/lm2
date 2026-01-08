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

    // Read total beats count from bytecode
    const totalBeats = i32(load<f32>(bytecodePtr))
    if (totalBeats <= 0) {
      // Empty sequence, no output
      for (let i = 0; i < length; i++) {
        store<f32>(out$, 0.0)
        out$ += 4
      }
      return
    }

    // Calculate samples per beat
    const samplesPerBeat: f64 = interval / (totalBeats as f64)

    for (let i = 0; i < length; i++) {
      const currentSample: f64 = (globalSampleCount + i) as f64

      // Determine which beat we're in
      const beatPosition: f64 = currentSample / samplesPerBeat
      const beatIndex: i32 = i32(Math.floor(beatPosition)) % totalBeats
      const beatStartSample: f64 = Math.floor(beatPosition) * samplesPerBeat

      // Find the beat data in bytecode
      let readPtr: usize = bytecodePtr + 4 // Skip totalBeats
      for (let b: i32 = 0; b < beatIndex; b++) {
        const subdivCount = i32(load<f32>(readPtr))
        readPtr += 4 // Skip subdivCount
        const packedLength = (subdivCount + 31) / 32
        readPtr += packedLength * 4 // Skip packed data
      }

      // Read current beat's subdivision count
      const subdivCount = i32(load<f32>(readPtr))
      readPtr += 4

      if (subdivCount <= 0) {
        store<f32>(out$, 0.0)
        out$ += 4
        continue
      }

      // Calculate which subdivision we're in
      const sampleInBeat: f64 = currentSample - beatStartSample
      const samplesPerSubdiv: f64 = samplesPerBeat / (subdivCount as f64)
      const subdivIndex: i32 = i32(Math.floor(sampleInBeat / samplesPerSubdiv)) % subdivCount
      const subdivStartSample: f64 = beatStartSample + (subdivIndex as f64) * samplesPerSubdiv

      // Generate impulse only at the exact start sample of subdivision
      const isImpulseSample: bool = Math.abs(currentSample - subdivStartSample) < 0.5

      // Read the subdivision bit from packed data
      const packedIndex = subdivIndex / 32
      const bitIndex = subdivIndex % 32
      const packedValue = load<f32>(readPtr + packedIndex * 4)
      const bit = (i32(packedValue) & (1 << bitIndex)) !== 0

      const value: f32 = (bit && isImpulseSample) ? 1.0 : 0.0
      store<f32>(out$, value)
      out$ += 4
    }
  }
}
