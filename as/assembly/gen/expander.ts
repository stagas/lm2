import { Gen } from './gen'

export class Expander extends Gen {
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

  private envelope: f32 = 0.0
  private gain: f32 = 1.0

  reset(): void {
    this.envelope = 0.0
    this.gain = 1.0
  }

  copyFrom(other: Gen): void {
    const src = other as Expander
    this.envelope = src.envelope
    this.gain = src.gain
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
    const r: f32 = Mathf.max(1.0, Mathf.min(r0, 100.0))
    const att: f32 = Mathf.max(0.0001, Mathf.min(att0, 1.0))
    const rel: f32 = Mathf.max(0.001, Mathf.min(rel0, 5.0))
    const k: f32 = Mathf.max(0.0, Mathf.min(k0, 40.0))

    const sr: f32 = sampleRate

    // Threshold in linear amplitude
    const thLin: f32 = Mathf.pow(10.0, th / 20.0)

    // Expansion factor
    const expansionRatio: f32 = r - 1.0

    // Linear ramp rates (per sample)
    const attackRate: f32 = 1.0 / (att * sr)
    const releaseRate: f32 = 1.0 / (rel * sr)

    // Envelope detector: very fast attack, fast release
    const envAttack: f32 = 0.0001
    const envRelease: f32 = 0.005
    const envAttackAlpha: f32 = 1.0 - Mathf.exp(-1.0 / (envAttack * sr))
    const envReleaseAlpha: f32 = 1.0 - Mathf.exp(-1.0 / (envRelease * sr))

    const telemetryEnabled: bool = this.telemetryEnabled !== 0
    const levelDbBase$: usize = this.telemetryLevelDb$
    const grDbBase$: usize = this.telemetryGrDb$
    const ringBase: i32 = this.telemetryRingBase

    for (let i: i32 = 0; i < length; i++) {
      const inSample: f32 = load<f32>(in$)
      const keySample: f32 = load<f32>(key$)

      // Peak envelope follower
      const keyAbs: f32 = Mathf.abs(keySample)
      if (keyAbs > this.envelope) {
        this.envelope += (keyAbs - this.envelope) * envAttackAlpha
      } else {
        this.envelope += (keyAbs - this.envelope) * envReleaseAlpha
      }

      // Calculate target gain based on envelope vs threshold
      let targetGain: f32 = 1.0

      if (this.envelope < thLin && this.envelope > 0.0) {
        // Below threshold: apply expansion
        const envDb: f32 = 20.0 * Mathf.log10(this.envelope)
        const thDb: f32 = th
        const belowThDb: f32 = thDb - envDb

        // Soft knee
        let slope: f32 = 1.0
        if (k > 0.0 && belowThDb < k) {
          const t: f32 = belowThDb / k
          slope = t * t * (3.0 - 2.0 * t)
        }

        const reductionDb: f32 = Mathf.min(120.0, belowThDb * expansionRatio * slope)
        targetGain = Mathf.pow(10.0, -reductionDb / 20.0)
      }

      // Apply gain with linear ramps
      if (targetGain > this.gain) {
        // Opening: ramp up
        this.gain += attackRate
        if (this.gain > targetGain) this.gain = targetGain
      } else {
        // Closing: ramp down
        this.gain -= releaseRate
        if (this.gain < targetGain) this.gain = targetGain
      }

      // Clamp
      this.gain = Mathf.max(0.0, Mathf.min(1.0, this.gain))

      store<f32>(out$, inSample * this.gain)

      if (telemetryEnabled) {
        const w: i32 = ringBase + i
        const envDb: f32 = 20.0 * Mathf.log10(Mathf.max(this.envelope, 0.000001))
        const grDb: f32 = -20.0 * Mathf.log10(Mathf.max(this.gain, 0.000001))
        store<f32>(levelDbBase$ + (w * 4) as usize, envDb)
        store<f32>(grDbBase$ + (w * 4) as usize, grDb)
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
