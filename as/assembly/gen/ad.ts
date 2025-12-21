import { Gen } from './gen'

enum Phase {
  Idle,
  Attack,
  Decay,
}

export class Ad extends Gen {
  attack$: usize = 0
  decay$: usize = 0
  trig$: usize = 0

  private phase: Phase = Phase.Idle
  private position: f32 = 0
  private lastTrig: f32 = 0

  reset(): void {
    this.phase = Phase.Idle
    this.position = 0
    this.lastTrig = 0
  }

  copyFrom(other: Gen): void {
    const src = other as Ad
    this.phase = src.phase
    this.position = src.position
    this.lastTrig = src.lastTrig
  }

  @inline
  generate(attack: f32, decay: f32, trig: f32): f32 {
    const isTrigger = trig > 0 && this.lastTrig <= 0
    this.lastTrig = trig

    if (isTrigger) {
      this.phase = Phase.Attack
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
        this.position = 0
        this.phase = Phase.Idle
        return 0
      }
      else {
        this.position -= 1.0 / decaySamples
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
    let trig$ = this.trig$

    for (let i = 0; i < length; i++) {
      const sample = this.generate(
        load<f32>(attack$),
        load<f32>(decay$),
        load<f32>(trig$),
      )

      store<f32>(out$, sample)

      out$ += 4
      attack$ += 4
      decay$ += 4
      trig$ += 4
    }
  }
}
