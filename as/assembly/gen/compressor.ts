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

    const ratioFactor: f32 = 1.0 - 1.0 / r
    const safeK: f32 = Mathf.max(k, 1e-12)

    const levelDbBase$: usize = this.telemetryLevelDb$
    const grDbBase$: usize = this.telemetryGrDb$
    const ringBase: i32 = this.telemetryRingBase

    for (let i: i32 = 0, y: i32 = 0, inSample: f32, keySample: f32, keyLevel: f32, safeLevel: f32, inputDb: f32,
      reductionDb: f32, targetGain: f32, d: f32, w: i32, halfK: f32, delta: f32, aboveKnee: f32, belowKnee: f32,
      inKnee: f32, linearReduction: f32, kneeReduction: f32, hasKnee: f32, noKnee: f32, kneeResult: f32,
      noKneeResult: f32, hasReduction: f32, isAttack: f32, attackGain: f32, releaseGain: f32, levelOffset: usize,
      grOffset: usize, kneeInput: f32, kneeOvershoot: f32, overThreshold: f32; i < length; i += 16)
    {
      unroll(16, () => {
        inSample = load<f32>(in$)
        keySample = load<f32>(key$)

        keyLevel = Mathf.abs(keySample)
        safeLevel = Mathf.max(keyLevel, 0.0001)
        inputDb = 20.0 * Mathf.log10(safeLevel)

        // Branchless soft-knee transfer (reduction in dB)
        // For compressor: compress when inputDb > threshold
        // kneeStart = th - k/2, kneeEnd = th + k/2
        halfK = k * 0.5
        delta = inputDb - th

        // Three regions (branchless selection):
        // below knee: inputDb < th - k/2 (delta < -halfK) -> reduction = 0
        // in knee: th - k/2 <= inputDb <= th + k/2 (-halfK <= delta <= halfK) -> soft reduction
        // above knee: inputDb > th + k/2 (delta > halfK) -> full linear reduction

        belowKnee = f32(delta < -halfK)
        aboveKnee = f32(delta > halfK)
        inKnee = (1.0 - aboveKnee) * (1.0 - belowKnee)

        // Linear reduction for above threshold: (inputDb - th) * ratioFactor
        linearReduction = delta * ratioFactor

        // Knee reduction: quadratic interpolation in knee region
        // Based on reference: reduction = overThreshold * ratioFactor * kneeOvershoot
        // where kneeOvershoot = (inputDb - kneeStart) / k
        // and overThreshold = (inputDb - kneeStart) - k/2 = delta + halfK
        kneeInput = delta + halfK
        kneeOvershoot = kneeInput / safeK
        overThreshold = kneeInput - halfK
        kneeReduction = overThreshold * ratioFactor * kneeOvershoot

        // Select based on knee width
        hasKnee = f32(k > 0.0)
        noKnee = 1.0 - hasKnee

        // With knee: use region-based selection
        // belowKnee contributes 0, inKnee contributes kneeReduction, aboveKnee contributes linearReduction
        kneeResult = inKnee * kneeReduction + aboveKnee * linearReduction

        // Without knee: simple threshold - compress when inputDb > th
        noKneeResult = f32(inputDb > th) * linearReduction

        reductionDb = hasKnee * kneeResult + noKnee * noKneeResult

        // Clamp reduction to non-negative (compressor only reduces, never increases)
        reductionDb = Mathf.max(0.0, reductionDb)

        hasReduction = f32(reductionDb > 0.0)
        targetGain = hasReduction * Mathf.max(0.0, Mathf.pow(10.0, -reductionDb / 20.0)) + (1.0 - hasReduction) * 1.0
        this.targetGain = targetGain

        isAttack = f32(this.currentGain > targetGain)
        attackGain = targetGain + (this.currentGain - targetGain) * attackCoeff
        releaseGain = targetGain - (targetGain - this.currentGain) * releaseCoeff
        this.currentGain = isAttack * attackGain + (1.0 - isAttack) * releaseGain

        this.currentGain = Mathf.max(0.0, Mathf.min(1.0, this.currentGain))

        store<f32>(out$, inSample * this.currentGain)

        w = ringBase + y++
        levelOffset = levelDbBase$ + (w << 2) as usize
        grOffset = grDbBase$ + (w << 2) as usize
        store<f32>(levelOffset, inputDb)
        store<f32>(grOffset, reductionDb)

        out$ += 4
        in$ += 4
        key$ += 4
        attack$ += 4
        release$ += 4
        threshold$ += 4
        ratio$ += 4
        knee$ += 4
      })
    }
  }
}
