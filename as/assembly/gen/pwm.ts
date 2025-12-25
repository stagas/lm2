import { Gen } from './gen'
import { Osc } from './osc'

export class Pwm extends Gen {
  hz$: usize = 0
  width$: usize = 0
  trig$: usize = 0

  private osc: Osc = new Osc()

  reset(): void {
    this.osc.reset()
  }

  copyFrom(other: Gen): void {
    const src = other as Pwm
    this.osc.copyFrom(src.osc)
  }

  process(out$: usize, length: i32): void {
    this.osc.pwm(out$, this.hz$, this.width$, this.trig$, length)
  }
}
