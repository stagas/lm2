import { Gen } from './gen'
import { Osc } from './osc'

export class Phasor extends Gen {
  hz$: usize = 0
  trig$: usize = 0
  offset$: usize = 0

  private osc: Osc = new Osc()

  reset(): void {
    this.osc.reset()
  }

  copyFrom(other: Gen): void {
    const src = other as Phasor
    this.osc.copyFrom(src.osc)
  }

  process(out$: usize, length: i32): void {
    this.osc.phasor(out$, this.hz$, this.trig$, this.offset$, length)
  }
}
