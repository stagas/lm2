import { Gen } from './gen'

export class Compressor extends Gen {
  in$: usize = 0
  key$: usize = 0
  attack$: usize = 0
  release$: usize = 0
  threshold$: usize = 0
  ratio$: usize = 0
  knee$: usize = 0

  telemetryLevelDb$: usize = 0
  telemetryGrDb$: usize = 0
  telemetryRingBase: i32 = 0
  telemetryEnabled: i32 = 0

  private targetGain: f32 = 1.0
  private currentGain: f32 = 1.0

  reset(): void {
    this.targetGain = 1.0
    this.currentGain = 1.0
  }

  copyFrom(other: Gen): void {
    const src = other as Compressor
    this.targetGain = src.targetGain
    this.currentGain = src.currentGain
  }

  process(out$: usize, length: i32): void {
    let in$: usize = this.in$
    let key$: usize = this.key$
    let attack$: usize = this.attack$
    let release$: usize = this.release$
    let threshold$: usize = this.threshold$
    let ratio$: usize = this.ratio$
    let knee$: usize = this.knee$

    const th0: f32 = load<f32>(threshold$)
    const r0: f32 = load<f32>(ratio$)
    const att0: f32 = load<f32>(attack$)
    const rel0: f32 = load<f32>(release$)
    const k0: f32 = load<f32>(knee$)

    const th: f32 = Mathf.max(-80.0, Mathf.min(th0, 0.0))
    const r: f32 = Mathf.max(1.0, Mathf.min(r0, 20.0))
    const att: f32 = Mathf.max(0.0001, Mathf.min(att0, 1.0))
    const rel: f32 = Mathf.max(0.0001, Mathf.min(rel0, 5.0))
    const k: f32 = Mathf.max(0.0, Mathf.min(k0, 40.0))

    const sr: f32 = sampleRate
    // Use 3x multiplier so time = time to ~95% completion
    const attackCoeff: f32 = Mathf.exp(-3.0 / (att * sr))
    const releaseCoeff: f32 = Mathf.exp(-3.0 / (rel * sr))

    const kneeStart: f32 = th - k * 0.5
    const kneeEnd: f32 = th + k * 0.5
    const ratioFactor: f32 = 1.0 - 1.0 / r

    const telemetryEnabled: bool = this.telemetryEnabled !== 0
    const levelDbBase$: usize = this.telemetryLevelDb$
    const grDbBase$: usize = this.telemetryGrDb$
    const ringBase: i32 = this.telemetryRingBase

    for (let i: i32 = 0; i < length; i++) {
      const inSample: f32 = load<f32>(in$)
      const keySample: f32 = load<f32>(key$)

      const keyLevel: f32 = Mathf.abs(keySample)
      const safeLevel: f32 = Mathf.max(keyLevel, 0.0001)
      const inputDb: f32 = 20.0 * Mathf.log10(safeLevel)

      let reductionDb: f32 = 0.0

      // Standard soft-knee transfer (reduction in dB)
      if (k > 0.0) {
        if (inputDb <= kneeStart) {
          reductionDb = 0.0
        }
        else if (inputDb >= kneeEnd) {
          reductionDb = (inputDb - th) * ratioFactor
        }
        else {
          const d: f32 = inputDb - kneeStart
          reductionDb = ratioFactor * (d * d) / (2.0 * k)
        }
      }
      else {
        if (inputDb > th) reductionDb = (inputDb - th) * ratioFactor
      }

      const targetGain: f32 = reductionDb > 0.0 ? Mathf.max(0.0, Mathf.pow(10.0, -reductionDb / 20.0)) : 1.0
      this.targetGain = targetGain

      if (this.currentGain > targetGain) {
        this.currentGain = targetGain + (this.currentGain - targetGain) * attackCoeff
      }
      else {
        this.currentGain = targetGain - (targetGain - this.currentGain) * releaseCoeff
      }

      this.currentGain = Mathf.max(0.0, Mathf.min(1.0, this.currentGain))

      store<f32>(out$, inSample * this.currentGain)

      if (telemetryEnabled) {
        const w: i32 = ringBase + i
        store<f32>(levelDbBase$ + (w * 4) as usize, inputDb)
        store<f32>(grDbBase$ + (w * 4) as usize, reductionDb)
      }

      out$ += 4
      in$ += 4
      key$ += 4
      attack$ += 4
      release$ += 4
      threshold$ += 4
      ratio$ += 4
      knee$ += 4
    }
  }
}
