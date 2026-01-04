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

  private envelope: f32 = 0.0
  private gain: f32 = 0.0
  private holdCounter: i32 = 0
  private releaseCounter: i32 = 0
  private releaseStartGain: f32 = 0.0
  private gateState: i32 = 0 // 0=closed, 1=opening, 2=open, 3=holding, 4=releasing

  reset(): void {
    this.envelope = 0.0
    this.gain = 0.0
    this.holdCounter = 0
    this.releaseCounter = 0
    this.releaseStartGain = 0.0
    this.gateState = 0
  }

  copyFrom(other: Gen): void {
    const src = other as Gate
    this.envelope = src.envelope
    this.gain = src.gain
    this.holdCounter = src.holdCounter
    this.releaseCounter = src.releaseCounter
    this.releaseStartGain = src.releaseStartGain
    this.gateState = src.gateState
  }

  process(out$: usize, length: i32): void {
    let in$: usize = this.in$
    let key$: usize = this.key$
    let attack$: usize = this.attack$
    let release$: usize = this.release$
    let threshold$: usize = this.threshold$
    let ratio$: usize = this.ratio$
    let knee$: usize = this.knee$
    let hold$: usize = this.hold$

    const th0: f32 = load<f32>(threshold$)
    const r0: f32 = load<f32>(ratio$)
    const att0: f32 = load<f32>(attack$)
    const rel0: f32 = load<f32>(release$)
    const hold0: f32 = load<f32>(hold$)

    const th: f32 = Mathf.max(-80.0, Mathf.min(th0, 0.0))
    const r: f32 = Mathf.max(1.0, Mathf.min(r0, 100.0))
    const att: f32 = Mathf.max(0.0001, Mathf.min(att0, 1.0))
    const rel: f32 = Mathf.max(0.001, Mathf.min(rel0, 5.0))
    const holdTime: f32 = Mathf.max(0.0, Mathf.min(hold0, 1.0))

    const sr: f32 = sampleRate
    const holdSamples: i32 = i32(holdTime * sr + 0.5)
    const releaseSamples: i32 = i32(rel * sr + 0.5)
    const attackSamples: i32 = i32(att * sr + 0.5)

    // Threshold in linear amplitude
    const thLin: f32 = Mathf.pow(10.0, th / 20.0)

    // Gain floor from ratio
    const maxAttenDb: f32 = Mathf.min(120.0, (r - 1.0) * 20.0)
    const gainFloor: f32 = Mathf.pow(10.0, -maxAttenDb / 20.0)

    // Envelope detector: very fast attack, fast release
    const envAttackAlpha: f32 = 1.0 - Mathf.exp(-1.0 / (0.0001 * sr))
    const envReleaseAlpha: f32 = 1.0 - Mathf.exp(-1.0 / (0.005 * sr))

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
      }
      else {
        this.envelope += (keyAbs - this.envelope) * envReleaseAlpha
      }

      // State machine
      const aboveThreshold: bool = this.envelope >= thLin

      if (aboveThreshold) {
        // Signal above threshold: open or stay open
        if (this.gateState !== 2) {
          this.gateState = 1 // opening
        }
        this.holdCounter = holdSamples
      }
      else {
        // Signal below threshold
        if (this.gateState === 2) {
          // Was open, start hold
          this.gateState = 3 // holding
        }

        if (this.gateState === 3) {
          if (this.holdCounter > 0) {
            this.holdCounter--
          }
          else {
            // Hold expired, start release
            this.gateState = 4 // releasing
            this.releaseCounter = releaseSamples
            this.releaseStartGain = this.gain
          }
        }
      }

      // Apply gain based on state
      if (this.gateState === 1) {
        // Opening: ramp up
        if (attackSamples > 0) {
          this.gain += (1.0 - gainFloor) / f32(attackSamples)
        }
        else {
          this.gain = 1.0
        }
        if (this.gain >= 1.0) {
          this.gain = 1.0
          this.gateState = 2 // fully open
        }
      }
      else if (this.gateState === 2 || this.gateState === 3) {
        // Open or holding: stay at 1.0
        this.gain = 1.0
      }
      else if (this.gateState === 4) {
        // Releasing: linear ramp down from releaseStartGain to gainFloor
        if (this.releaseCounter > 0) {
          const progress: f32 = 1.0 - f32(this.releaseCounter) / f32(releaseSamples)
          this.gain = this.releaseStartGain + (gainFloor - this.releaseStartGain) * progress
          this.releaseCounter--
        }
        else {
          this.gain = gainFloor
          this.gateState = 0 // closed
        }
      }
      else {
        // Closed: stay at gainFloor
        this.gain = gainFloor
      }

      // Clamp
      this.gain = Mathf.max(gainFloor, Mathf.min(1.0, this.gain))

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
      hold$ += 4
    }
  }
}
