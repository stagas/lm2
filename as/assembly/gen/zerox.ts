import { Gen } from './gen'

export class Zerox extends Gen {
  in$: usize = 0
  lastInput: f32 = 0.0

  reset(): void {
    this.lastInput = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Zerox
    this.lastInput = src.lastInput
  }

  process(out$: usize, length: i32): void {
    let in$ = this.in$
    let lastInput: f32 = this.lastInput

    for (let i = 0; i < length; i++) {
      const currentInput: f32 = load<f32>(in$)

      // Detect zero crossing: from <=0 to >0
      if (lastInput <= 0.0 && currentInput > 0.0) {
        store<f32>(out$, 1.0)
      } else {
        store<f32>(out$, 0.0)
      }

      lastInput = currentInput

      out$ += 4
      in$ += 4
    }

    this.lastInput = lastInput
  }
}
