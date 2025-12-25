import { euclidHit } from '../euclid'
import { Gen } from './gen'

export class Euclid extends Gen {
  pulses$: usize = 0
  steps$: usize = 0
  offset$: usize = 0
  bar$: usize = 0

  private static floorDivF64(a: f64, b: f64): i32 {
    return i32(Math.floor(a / b))
  }

  process(out$: usize, length: i32): void {
    let pulses$ = this.pulses$
    let steps$ = this.steps$
    let offset$ = this.offset$
    let bar$ = this.bar$

    const rate: f64 = sampleRate as f64
    const safeBpm: f64 = Math.max(1.0, bpm as f64)
    const samplesPerWholeNote: f64 = (60.0 / safeBpm) * rate * 4.0
    const minBar: f64 = 1.0 / samplesPerWholeNote

    let o$ = out$

    for (let i: i32 = 0; i < length; i++) {
      const pulsesIn: f64 = load<f32>(pulses$) as f64
      const stepsIn: f64 = load<f32>(steps$) as f64
      const offsetIn: f64 = load<f32>(offset$) as f64
      const barInRaw: f64 = load<f32>(bar$) as f64

      const pulses: i32 = i32(Math.floor(pulsesIn))
      const steps: i32 = i32(Math.floor(stepsIn))
      const offset: i32 = i32(Math.floor(offsetIn))

      const barBars: f64 = Math.max(minBar, barInRaw)
      let interval: f64 = barBars * samplesPerWholeNote
      if (interval < 1.0) interval = 1.0

      let stepDur: f64 = steps > 0 ? interval / (steps as f64) : interval
      if (stepDur < 1.0) stepDur = 1.0

      const globalSample: f64 = (globalSampleCount + i) as f64
      const prevSample: f64 = globalSample - 1.0

      const curStepAbs: i32 = Euclid.floorDivF64(globalSample, stepDur)
      const prevStepAbs: i32 = Euclid.floorDivF64(prevSample, stepDur)

      if (steps > 0 && curStepAbs > prevStepAbs) {
        let stepInBar: i32 = curStepAbs % steps
        if (stepInBar < 0) stepInBar += steps
        const on: bool = euclidHit(pulses, steps, stepInBar, offset)
        store<f32>(o$, on ? 1.0 : 0.0)
      }
      else {
        store<f32>(o$, 0.0)
      }

      o$ += 4
      pulses$ += 4
      steps$ += 4
      offset$ += 4
      bar$ += 4
    }
  }
}
