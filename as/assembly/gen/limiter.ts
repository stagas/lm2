import { Gen } from './gen'

export class Limiter extends Gen {
  in$: usize = 0
  release$: usize = 0
  threshold$: usize = 0

  telemetryLevelDb$: usize = 0
  telemetryGrDb$: usize = 0
  telemetryRingBase: i32 = 0
  telemetryEnabled: i32 = 0

  private currentGain: f32 = 1.0

  reset(): void {
    this.currentGain = 1.0
  }

  copyFrom(other: Gen): void {
    const src = other as Limiter
    this.currentGain = src.currentGain
  }

  process(out$: usize, length: i32): void {
    let in$: usize = this.in$
    let release$: usize = this.release$
    let threshold$: usize = this.threshold$

    const th0: f32 = load<f32>(threshold$)
    const rel0: f32 = load<f32>(release$)

    const th: f32 = Mathf.max(-80.0, Mathf.min(th0, 0.0))
    const rel: f32 = Mathf.max(0.0001, Mathf.min(rel0, 5.0))

    const sr: f32 = sampleRate
    // Use 3x multiplier so time = time to ~95% completion
    const releaseCoeff: f32 = Mathf.exp(-3.0 / (rel * sr))

    const thresholdLinear: f32 = Mathf.pow(10.0, th / 20.0)

    const telemetryEnabled: bool = this.telemetryEnabled !== 0
    const levelDbBase$: usize = this.telemetryLevelDb$
    const grDbBase$: usize = this.telemetryGrDb$
    const ringBase: i32 = this.telemetryRingBase

    for (let i: i32 = 0; i < length; i++) {
      const inSample: f32 = load<f32>(in$)

      const inputLevel: f32 = Mathf.abs(inSample)
      const safeLevel: f32 = Mathf.max(inputLevel, 0.0001)
      const inputDb: f32 = 20.0 * Mathf.log10(safeLevel)

      // For limiter: if above threshold, clamp to threshold level
      // Target gain is thresholdLinear / inputLevel if inputLevel > thresholdLinear, else 1.0
      let targetGain: f32 = 1.0
      let reductionDb: f32 = 0.0

      if (inputLevel > thresholdLinear) {
        reductionDb = 20.0 * Mathf.log10(inputLevel / thresholdLinear)
      }

      // Release smoothing only (attack is instantaneous/per-sample)
      if (this.currentGain > targetGain) {
        this.currentGain = targetGain + (this.currentGain - targetGain) * releaseCoeff
      } else {
        this.currentGain = targetGain
      }

      this.currentGain = Mathf.max(0.0, Mathf.min(1.0, this.currentGain))

      // Apply gain
      let outSample: f32 = inSample * this.currentGain

      // Hard limit to ensure we never exceed threshold
      const maxOut: f32 = thresholdLinear * Mathf.sign(outSample)
      if (Mathf.abs(outSample) > thresholdLinear) {
        outSample = maxOut
        this.currentGain = targetGain // Reset gain if we had to hard limit
      }

      store<f32>(out$, outSample)

      if (telemetryEnabled) {
        const w: i32 = ringBase + i
        store<f32>(levelDbBase$ + (w * 4) as usize, inputDb)
        store<f32>(grDbBase$ + (w * 4) as usize, reductionDb)
      }

      out$ += 4
      in$ += 4
      release$ += 4
      threshold$ += 4
    }
  }
}
