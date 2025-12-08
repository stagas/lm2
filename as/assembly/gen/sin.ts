import { clampNyquist } from '../util'
import { Gen } from './gen'

export class Sin extends Gen {
  hz$: usize = 0
  trig$: usize = 0

  private lastTrig: f64 = 0
  private phase: f64 = 0

  @inline
  generate(hz: f32, trig: f32): f32 {
    hz = clampNyquist(hz)

    const isZeroCrossing = trig > 0 && this.lastTrig <= 0
    if (isZeroCrossing) {
      this.phase = 0
    }
    this.lastTrig = trig

    const sample = Math.sin(this.phase * TWO_PI) as f32

    this.phase += hz / sampleRate
    if (this.phase >= 1.0) {
      this.phase -= 1.0
    }

    return sample
  }

  process(out$: usize, length: i32): void {
    let hz$ = this.hz$
    let trig$ = this.trig$

    for (let i = 0; i < length; i++) {
      const sample = this.generate(
        load<f32>(hz$),
        load<f32>(trig$),
      )

      store<f32>(out$, sample)

      out$ += 4
      hz$ += 4
      trig$ += 4
    }
  }
}
