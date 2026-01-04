// dprint-ignore-file
// Gate/Expander based on Giannoulis-Massberg-Reiss dynamic range compression paper
import { Gen } from './gen'

export class Gate extends Gen {
  in$: usize = 0
  key$: usize = 0
  attack$: usize = 0
  release$: usize = 0
  threshold$: usize = 0
  ratio$: usize = 0
  knee$: usize = 0
  hold$: usize = 0

  telemetryLevelDb$: usize = 0
  telemetryGrDb$: usize = 0
  telemetryRingBase: i32 = 0
  telemetryEnabled: i32 = 0

  // State variables
  private levelDb: f32 = -120.0  // Smoothed level in dB
  private gainDb: f32 = 0.0      // Smoothed gain in dB
  private holdCount: f32 = 0.0   // Hold counter in samples

  reset(): void {
    this.levelDb = -120.0
    this.gainDb = 0.0
    this.holdCount = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Gate
    this.levelDb = src.levelDb
    this.gainDb = src.gainDb
    this.holdCount = src.holdCount
  }

  process(out$: usize, length: i32): void {
    let in$ = this.in$
    let key$ = this.key$
    let attack$ = this.attack$
    let release$ = this.release$
    let threshold$ = this.threshold$
    let ratio$ = this.ratio$
    let knee$ = this.knee$
    let hold$ = this.hold$

    const sr: f32 = sampleRate
    const eps: f32 = 1e-12
    const telemetry = this.telemetryEnabled !== 0
    const lvlBase$ = this.telemetryLevelDb$
    const grBase$ = this.telemetryGrDb$
    const ringBase = this.telemetryRingBase

    let levelDb: f32 = this.levelDb
    let gainDb: f32 = this.gainDb
    let holdCount: f32 = this.holdCount

    for (let i: i32 = 0; i < length; i++) {
      const x: f32 = load<f32>(in$)
      const key: f32 = Mathf.abs(load<f32>(key$))

      const att: f32 = Mathf.max(0.0001, load<f32>(attack$))
      const rel: f32 = Mathf.max(0.0001, load<f32>(release$))
      const T: f32 = load<f32>(threshold$)
      const W: f32 = Mathf.max(0.0, load<f32>(knee$))
      const R: f32 = Mathf.max(1.0, load<f32>(ratio$))
      const holdTime: f32 = Mathf.max(0.0, load<f32>(hold$))

      // ===== 1. Level Detection (peak in dB domain, branchless) =====
      // Convert input to dB
      const inputDb: f32 = 20.0 * Mathf.log10(Mathf.max(key, eps))

      // Decoupled peak detector (paper recommends)
      // Fast attack (~0.1ms), slow release (~50ms) for stable level estimate
      const alphaA: f32 = Mathf.exp(-1.0 / (0.001 * sr))
      const alphaR: f32 = Mathf.exp(-1.0 / (0.05 * sr))

      // Branchless: select alpha based on whether input > current level
      const isRising: f32 = f32(inputDb > levelDb)
      const detAlpha: f32 = isRising * alphaA + (1.0 - isRising) * alphaR
      levelDb = inputDb + detAlpha * (levelDb - inputDb)

      // ===== 2. Gain Computer (downward expander) =====
      // For expander/gate: attenuate below threshold
      // Output = T + R × (input - T) for input < T
      // Gain = (R - 1) × (input - T)
      // Since input < T, delta < 0, and R > 1, gain < 0 (attenuation)

      const slope: f32 = R - 1.0  // For R=100: slope = 99

      // Soft knee computation - branchless
      const halfW: f32 = W * 0.5
      const safeW: f32 = Mathf.max(W, 1e-12)
      const delta: f32 = levelDb - T

      // Three regions (branchless selection):
      // above: delta >= halfW -> gain = 0
      // knee: -halfW < delta < halfW -> quadratic
      // below: delta <= -halfW -> linear

      const above: f32 = f32(delta >= halfW)
      const below: f32 = f32(delta <= -halfW)
      const inKnee: f32 = (1.0 - above) * (1.0 - below)

      // Below threshold: gainDb = slope × delta (delta < 0, slope > 0, so gainDb < 0)
      const belowGain: f32 = slope * delta

      // Knee: quadratic interpolation (delta + halfW is always positive in knee region)
      const kneeVal: f32 = delta + halfW
      const kneeGain: f32 = -slope * (kneeVal * kneeVal) / (2.0 * safeW)

      // Combine (above contributes 0)
      const targetGainDb: f32 = Mathf.max(-120.0, inKnee * kneeGain + below * belowGain)

      // ===== 3. Hold (branchless) =====
      // Reset hold counter when signal is above threshold
      const holdSamples: f32 = holdTime * sr
      const aboveThresh: f32 = f32(delta >= 0.0)
      holdCount = aboveThresh * holdSamples + (1.0 - aboveThresh) * Mathf.max(0.0, holdCount - 1.0)

      // During hold, keep gain at 0 dB (branchless blend)
      const inHold: f32 = f32(holdCount > 0.0)
      const finalTargetGainDb: f32 = (1.0 - inHold) * targetGainDb

      // ===== 4. Gain Smoothing (branchless) =====
      // Apply attack/release to the gain signal (not the level)
      // Attack = gate opening (gain increasing toward 0 dB)
      // Release = gate closing (gain decreasing toward -inf dB)
      const alphaAtt: f32 = Mathf.exp(-1.0 / (att * sr))
      const alphaRel: f32 = Mathf.exp(-1.0 / (rel * sr))

      const gainRising: f32 = f32(finalTargetGainDb > gainDb)
      const gainAlpha: f32 = gainRising * alphaAtt + (1.0 - gainRising) * alphaRel
      gainDb = finalTargetGainDb + gainAlpha * (gainDb - finalTargetGainDb)

      // ===== 5. Apply Gain =====
      const gainLin: f32 = Mathf.pow(10.0, gainDb / 20.0)
      store<f32>(out$, x * gainLin)

      // Telemetry
      if (telemetry) {
        const w: i32 = ringBase + i
        store<f32>(lvlBase$ + (w << 2) as usize, levelDb)
        store<f32>(grBase$ + (w << 2) as usize, -gainDb)
      }

      in$ += 4
      out$ += 4
      key$ += 4
      attack$ += 4
      release$ += 4
      threshold$ += 4
      ratio$ += 4
      knee$ += 4
      hold$ += 4
    }

    this.levelDb = levelDb
    this.gainDb = gainDb
    this.holdCount = holdCount
  }
}
