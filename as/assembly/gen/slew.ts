import { Gen } from './gen'

export class Slew extends Gen {
  in$: usize = 0
  up$: usize = 0
  down$: usize = 0
  exp$: usize = 0

  private current: f32 = 0.0

  reset(): void {
    this.current = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Slew
    this.current = src.current
  }

  process(out$: usize, length: i32): void {
    let in$ = this.in$
    let up$ = this.up$
    let down$ = this.down$
    let exp$ = this.exp$

    for (let i = 0; i < length; i++) {
      const target: f32 = load<f32>(in$)
      const upVal: f32 = load<f32>(up$)
      const downVal: f32 = load<f32>(down$) <= 0.0 ? upVal : load<f32>(down$)
      const exp: f32 = load<f32>(exp$)

      const diff: f32 = target - this.current

      if (Mathf.abs(diff) < 0.000001) {
        this.current = target
      }
      else {
        const actualRate: f32 = diff > 0.0 ? upVal : downVal

        if (Mathf.abs(exp - 1.0) < 0.000001) {
          // Linear slew (exponent = 1.0)
          const sign: f32 = diff > 0.0 ? 1.0 : -1.0
          const step: f32 = sign * actualRate

          if (Mathf.abs(step) >= Mathf.abs(diff)) {
            this.current = target
          }
          else {
            this.current += step
          }
        }
        else {
          // Exponential/logarithmic slew
          const absDiff: f32 = Mathf.abs(diff)

          // Use exponential interpolation: current = current + (target - current) * coeff
          // The coefficient is calculated based on the exponent to create different curve shapes
          let coeff: f32 = 0.0

          if (exp > 1.0) {
            // Exponential curve: faster approach at start, slower near target
            // Scale the rate to make it more exponential (higher exponent = more exponential)
            const scaledRate: f32 = actualRate * Mathf.pow(2.0, (exp - 1.0) * 0.5)
            coeff = 1.0 - Mathf.exp(-scaledRate)
          }
          else {
            // Logarithmic curve: slower approach at start, faster near target
            // Scale the rate inversely for logarithmic behavior
            const scaledRate: f32 = actualRate * Mathf.pow(2.0, (1.0 - exp) * 0.5)
            coeff = 1.0 - Mathf.exp(-scaledRate)
            // Apply additional scaling for logarithmic to make the start even slower
            coeff = coeff * Mathf.pow(exp, 0.3)
          }

          // Clamp coefficient to prevent overshoot and ensure stability
          coeff = Mathf.min(1.0, Mathf.max(0.0, coeff))

          const step: f32 = diff * coeff

          if (Mathf.abs(step) >= absDiff) {
            this.current = target
          }
          else {
            this.current += step
          }
        }
      }

      store<f32>(out$, this.current)

      out$ += 4
      in$ += 4
      up$ += 4
      down$ += 4
      exp$ += 4
    }
  }
}
