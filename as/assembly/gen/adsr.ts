import { Gen } from './gen'

enum Phase {
  Idle,
  Attack,
  Decay,
  Sustain,
  Release,
}

export class Adsr extends Gen {
  attack$: usize = 0
  decay$: usize = 0
  sustain$: usize = 0
  release$: usize = 0
  trig$: usize = 0

  private phase: Phase = Phase.Idle
  private position: f32 = 0
  private lastTrig: f32 = 0
  private sustainLevel: f32 = 0

  @inline
  generate(attack: f32, decay: f32, sustain: f32, release: f32, trig: f32): f32 {
    const isTrigger = trig > 0 && this.lastTrig <= 0
    const isRelease = trig <= 0 && this.lastTrig > 0
    this.lastTrig = trig

    // Retrigger from any phase - always restart from Attack on trigger
    if (isTrigger) {
      this.phase = Phase.Attack
      this.position = 0
    }

    // Release only if we're in an active phase (not already releasing or idle)
    if (isRelease && (this.phase === Phase.Attack || this.phase === Phase.Decay || this.phase === Phase.Sustain)) {
      this.phase = Phase.Release
      this.sustainLevel = this.position
    }

    if (this.phase === Phase.Idle) {
      return 0
    }

    if (this.phase === Phase.Attack) {
      const attackSamples = attack * sampleRate
      if (attackSamples <= 0) {
        this.position = 1
        this.phase = Phase.Decay
      }
      else {
        this.position += 1.0 / attackSamples
        if (this.position >= 1.0) {
          this.position = 1.0
          this.phase = Phase.Decay
        }
      }
      return this.position
    }

    if (this.phase === Phase.Decay) {
      const decaySamples = decay * sampleRate
      if (decaySamples <= 0) {
        this.position = sustain
        this.sustainLevel = sustain
        this.phase = Phase.Sustain
      }
      else {
        const target = sustain
        const delta: f32 = (1.0 - target) / decaySamples
        this.position -= delta
        if (this.position <= target) {
          this.position = target
          this.sustainLevel = target
          this.phase = Phase.Sustain
        }
      }
      return this.position
    }

    if (this.phase === Phase.Sustain) {
      if (trig > 0) {
        return this.position
      }
      else {
        this.phase = Phase.Release
        this.sustainLevel = this.position
      }
    }

    if (this.phase === Phase.Release) {
      const releaseSamples = release * sampleRate
      if (releaseSamples <= 0) {
        this.position = 0
        this.phase = Phase.Idle
        return 0
      }
      else {
        const delta = this.sustainLevel / releaseSamples
        this.position -= delta
        if (this.position <= 0) {
          this.position = 0
          this.phase = Phase.Idle
          return 0
        }
      }
      return this.position
    }

    return 0
  }

  process(out$: usize, length: i32): void {
    let attack$ = this.attack$
    let decay$ = this.decay$
    let sustain$ = this.sustain$
    let release$ = this.release$
    let trig$ = this.trig$

    for (let i = 0; i < length; i++) {
      const sample = this.generate(
        load<f32>(attack$),
        load<f32>(decay$),
        load<f32>(sustain$),
        load<f32>(release$),
        load<f32>(trig$),
      )

      store<f32>(out$, sample)

      out$ += 4
      attack$ += 4
      decay$ += 4
      sustain$ += 4
      release$ += 4
      trig$ += 4
    }
  }
}
