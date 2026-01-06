import { Gen } from './gen'

export class Sah extends Gen {
  in$: usize = 0
  trig$: usize = 0
  private lastTrig: f32 = 0.0
  private heldValue: f32 = 0.0

  reset(): void {
    this.lastTrig = 0.0
    this.heldValue = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Sah
    this.lastTrig = src.lastTrig
    this.heldValue = src.heldValue
  }

  process(out$: usize, length: i32): void {
    let in$ = this.in$
    let trig$ = this.trig$

    for (let i = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      const input = load<f32>(in$)

      // Detect rising edge of trigger
      if (trig > 0.0 && this.lastTrig <= 0.0) {
        this.heldValue = input
      }

      store<f32>(out$, this.heldValue)
      this.lastTrig = trig

      out$ += 4
      in$ += 4
      trig$ += 4
    }
  }
}
