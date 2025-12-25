import { clamp11, clampNyquist } from '../util'
import { Gen } from './gen'

export class Osc extends Gen {
  hz$: usize = 0
  width$: usize = 0
  offset$: usize = 0
  trig$: usize = 0

  phase: f32 = 0.0
  lastTrig: f32 = 0.0
  lastOutput: f32 = 0.0
  phasorDone: f32 = 0.0

  reset(): void {
    this.phase = 0.0
    this.lastTrig = 0.0
    this.lastOutput = 0.0
    this.phasorDone = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Osc
    this.phase = src.phase
    this.lastTrig = src.lastTrig
    this.lastOutput = src.lastOutput
    this.phasorDone = src.phasorDone
  }

  process(out$: usize, length: i32): void {}

  private polyBlep(phase: f32, phaseInc: f32): f32 {
    if (phaseInc <= 0.0) return 0.0

    if (phase < phaseInc) {
      const t: f32 = phase / phaseInc
      return t + t - t * t - 1.0
    }

    if (phase > 1.0 - phaseInc) {
      const t: f32 = (phase - 1.0) / phaseInc
      return t * t + t + t + 1.0
    }

    return 0.0
  }

  sin(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let phase: f32 = this.phase
    let lastTrig: f32 = this.lastTrig
    let lastOutput: f32 = this.lastOutput

    for (let i = 0; i < length; i++) {
      const hz: f32 = clampNyquist(load<f32>(hz$))
      const trig: f32 = load<f32>(trig$)

      if (trig > 0.0 && lastTrig <= 0.0) {
        const offsetSeconds: f32 = load<f32>(offset$)
        let phaseOffset: f32 = (offsetSeconds * hz) % 1.0
        if (phaseOffset < 0.0) phaseOffset += 1.0
        phase = phaseOffset
        lastOutput = 0.0
      }
      lastTrig = trig

      store<f32>(out$, Mathf.sin(phase * TWO_PI))

      phase += hz / sampleRate
      if (phase >= 1.0) phase -= 1.0

      out$ += 4
      hz$ += 4
      trig$ += 4
      offset$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
    this.lastOutput = lastOutput
  }

  tri(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let phase: f32 = this.phase
    let lastTrig: f32 = this.lastTrig
    let lastOutput: f32 = this.lastOutput

    for (let i = 0; i < length; i++) {
      const hz: f32 = clampNyquist(load<f32>(hz$))
      const trig: f32 = load<f32>(trig$)

      if (trig > 0.0 && lastTrig <= 0.0) {
        const offsetSeconds: f32 = load<f32>(offset$)
        let phaseOffset: f32 = (offsetSeconds * hz) % 1.0
        if (phaseOffset < 0.0) phaseOffset += 1.0
        phase = phaseOffset
        lastOutput = 0.0
      }
      lastTrig = trig

      const phaseInc: f32 = hz / sampleRate

      let saw: f32 = 2.0 * phase - 1.0
      saw -= this.polyBlep(phase, phaseInc)

      const integrated: f32 = phaseInc * saw + (1.0 - phaseInc) * lastOutput
      const out: f32 = integrated * 6.0
      lastOutput = integrated

      store<f32>(out$, out)

      phase += phaseInc
      if (phase >= 1.0) phase -= 1.0

      out$ += 4
      hz$ += 4
      trig$ += 4
      offset$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
    this.lastOutput = lastOutput
  }

  saw(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let phase: f32 = this.phase
    let lastTrig: f32 = this.lastTrig
    let lastOutput: f32 = this.lastOutput

    for (let i = 0; i < length; i++) {
      const hz: f32 = clampNyquist(load<f32>(hz$))
      const trig: f32 = load<f32>(trig$)

      if (trig > 0.0 && lastTrig <= 0.0) {
        const offsetSeconds: f32 = load<f32>(offset$)
        let phaseOffset: f32 = (offsetSeconds * hz) % 1.0
        if (phaseOffset < 0.0) phaseOffset += 1.0
        phase = phaseOffset
        lastOutput = 0.0
      }
      lastTrig = trig

      const phaseInc: f32 = hz / sampleRate

      let value: f32 = 2.0 * phase - 1.0
      value -= this.polyBlep(phase, phaseInc)
      store<f32>(out$, value)

      phase += phaseInc
      if (phase >= 1.0) phase -= 1.0

      out$ += 4
      hz$ += 4
      trig$ += 4
      offset$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
    this.lastOutput = lastOutput
  }

  ramp(out$: usize, length: i32): void {
    this.saw(out$, length)

    let p$ = out$
    for (let i = 0; i < length; i++) {
      store<f32>(p$, -load<f32>(p$))
      p$ += 4
    }
  }

  sqr(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let phase: f32 = this.phase
    let lastTrig: f32 = this.lastTrig
    let lastOutput: f32 = this.lastOutput

    for (let i = 0; i < length; i++) {
      const hz: f32 = clampNyquist(load<f32>(hz$))
      const trig: f32 = load<f32>(trig$)

      if (trig > 0.0 && lastTrig <= 0.0) {
        const offsetSeconds: f32 = load<f32>(offset$)
        let phaseOffset: f32 = (offsetSeconds * hz) % 1.0
        if (phaseOffset < 0.0) phaseOffset += 1.0
        phase = phaseOffset
        lastOutput = 0.0
      }
      lastTrig = trig

      const phaseInc: f32 = hz / sampleRate

      let value: f32 = phase < 0.5 ? 1.0 : -1.0
      value += this.polyBlep(phase, phaseInc)
      value -= this.polyBlep((phase + 0.5) % 1.0, phaseInc)
      store<f32>(out$, value)

      phase += phaseInc
      if (phase >= 1.0) phase -= 1.0

      out$ += 4
      hz$ += 4
      trig$ += 4
      offset$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
    this.lastOutput = lastOutput
  }

  pwm(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let width$ = this.width$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let phase: f32 = this.phase
    let lastTrig: f32 = this.lastTrig
    let lastOutput: f32 = this.lastOutput

    for (let i = 0; i < length; i++) {
      const hz: f32 = clampNyquist(load<f32>(hz$))
      const trig: f32 = load<f32>(trig$)

      if (trig > 0.0 && lastTrig <= 0.0) {
        const offsetSeconds: f32 = load<f32>(offset$)
        let phaseOffset: f32 = (offsetSeconds * hz) % 1.0
        if (phaseOffset < 0.0) phaseOffset += 1.0
        phase = phaseOffset
        lastOutput = 0.0
      }
      lastTrig = trig

      const phaseInc: f32 = hz / sampleRate
      const pulseWidth: f32 = clamp11(load<f32>(width$))

      const sawPhase: f32 = phase
      let sawValue: f32 = 2.0 * sawPhase - 1.0
      sawValue -= this.polyBlep(sawPhase, phaseInc)

      const offset: f32 = pulseWidth * 0.5
      let rampPhase: f32 = (phase + offset) % 1.0
      if (rampPhase < 0.0) rampPhase += 1.0
      let rampValue: f32 = 1.0 - 2.0 * rampPhase
      rampValue += this.polyBlep(rampPhase, phaseInc)

      let value: f32 = sawValue > rampValue ? 1.0 : -1.0

      let crossingPhase: f32 = (0.5 - offset * 0.5 + 1.0) % 1.0
      if (crossingPhase < 0.0) crossingPhase += 1.0

      let crossingRelative: f32 = phase - crossingPhase
      if (crossingRelative < 0.0) crossingRelative += 1.0
      if (crossingRelative > 1.0) crossingRelative -= 1.0

      value += this.polyBlep(crossingRelative, phaseInc)

      const oppositeRelative: f32 = (crossingRelative + 0.5) % 1.0
      value -= this.polyBlep(oppositeRelative, phaseInc)

      store<f32>(out$, value)

      phase += phaseInc
      if (phase >= 1.0) phase -= 1.0

      out$ += 4
      hz$ += 4
      width$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
    this.lastOutput = lastOutput
  }

  phasor(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let phase: f32 = this.phase
    let lastTrig: f32 = this.lastTrig
    let phasorDone: f32 = this.phasorDone

    for (let i = 0; i < length; i++) {
      const hz: f32 = clampNyquist(load<f32>(hz$))
      const trig: f32 = load<f32>(trig$)

      if (trig > 0.0 && lastTrig <= 0.0) {
        const offsetSeconds: f32 = load<f32>(offset$)
        let phaseOffset: f32 = (offsetSeconds * hz) % 1.0
        if (phaseOffset < 0.0) phaseOffset += 1.0
        phase = phaseOffset
        phasorDone = 0.0
      }
      lastTrig = trig

      if (phasorDone > 0.0) {
        store<f32>(out$, 1.0)
      }
      else {
        store<f32>(out$, phase)
        phase += hz / sampleRate
        if (phase >= 1.0) {
          phase = 1.0
          phasorDone = 1.0
        }
      }

      out$ += 4
      hz$ += 4
      trig$ += 4
      offset$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
    this.phasorDone = phasorDone
  }
}

export class Tri extends Osc {
  process(out$: usize, length: i32): void {
    this.tri(out$, length)
  }
}

export class Saw extends Osc {
  process(out$: usize, length: i32): void {
    this.saw(out$, length)
  }
}

export class Ramp extends Osc {
  process(out$: usize, length: i32): void {
    this.ramp(out$, length)
  }
}

export class Sqr extends Osc {
  process(out$: usize, length: i32): void {
    this.sqr(out$, length)
  }
}

export class Pwm extends Osc {
  process(out$: usize, length: i32): void {
    this.pwm(out$, length)
  }
}

export class Phasor extends Osc {
  process(out$: usize, length: i32): void {
    this.phasor(out$, length)
  }
}
