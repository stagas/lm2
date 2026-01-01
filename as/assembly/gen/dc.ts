import { sampleRate } from '../globals'
import { Gen } from './gen'

export class DC extends Gen {
  in$: usize = 0

  x1: f32 = 0
  y1: f32 = 0
  lastSampleRate: f32 = -1
  cachedCoeff: f32 = 0.994

  reset(): void {
    this.x1 = 0
    this.y1 = 0
    this.lastSampleRate = -1
    this.cachedCoeff = 0.995
  }

  copyFrom(other: Gen): void {
    const src = other as DC
    this.x1 = src.x1
    this.y1 = src.y1
    this.lastSampleRate = src.lastSampleRate
    this.cachedCoeff = src.cachedCoeff
  }

  process(out$: usize, length: i32): void {
    let in$ = this.in$

    // Update coefficient if sample rate changed
    if (sampleRate !== this.lastSampleRate) {
      this.lastSampleRate = sampleRate
      // Target cutoff ~8 Hz regardless of sample rate
      // coeff = 1 - (2 * PI * fc / sampleRate)
      const targetCutoff: f32 = 8.0
      this.cachedCoeff = 1.0 - (2.0 * Mathf.PI * targetCutoff / sampleRate)
    }

    const coeff = this.cachedCoeff
    for (let i = 0; i < length; i++) {
      const x = load<f32>(in$)
      const y = x - this.x1 + coeff * this.y1
      this.x1 = x
      this.y1 = y
      store<f32>(out$, y * .9996)

      out$ += 4
      in$ += 4
    }
  }
}
