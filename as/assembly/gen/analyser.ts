import { Gen } from './gen'

export class Analyser extends Gen {
  in$: usize = 0

  process(out$: usize, length: i32): void {
    let in$ = this.in$

    for (let i = 0; i < length; i++) {
      const sample = load<f32>(in$)
      store<f32>(out$, sample)
      in$ += 4
      out$ += 4
    }
  }
}
