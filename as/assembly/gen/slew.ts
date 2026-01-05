import { applyCurve, clamp01 } from '../util'
import { Gen } from './gen'

export class Slew extends Gen {
  in$: usize = 0
  up$: usize = 0
  down$: usize = 0
  exp$: usize = 0

  private current: f32 = 0.0

  // Best-effort UI/debug state (read by UI history writers).
  // 0 = down, 1 = up, 2 = steady
  visPhase: i32 = 2
  visPhase01: f32 = 0.5

  reset(): void {
    this.current = 0.0
    this.visPhase = 2
    this.visPhase01 = 0.5
  }

  copyFrom(other: Gen): void {
    const src = other as Slew
    this.current = src.current
    this.visPhase = src.visPhase
    this.visPhase01 = src.visPhase01
  }

  process(out$: usize, length: i32): void {
    let in$ = this.in$
    let up$ = this.up$
    let down$ = this.down$
    let exp$ = this.exp$

    for (let i: i32 = 0, target: f32, upVal: f32, downVal: f32, exp: f32, diff: f32, coeff: f32, step: f32, a: f32;
      i < length; i += 16)
    {
      unroll(16, () => {
        target = load<f32>(in$)
        upVal = load<f32>(up$)
        downVal = load<f32>(down$) <= 0.0 ? upVal : load<f32>(down$)
        exp = load<f32>(exp$)

        diff = target - this.current

        if (Mathf.abs(diff) < 0.000001) {
          this.current = target
          this.visPhase = 2
          this.visPhase01 = 0.5
        }
        else {
          a = clamp01(diff > 0.0 ? upVal : downVal)
          coeff = f32(applyCurve(a as f64, exp as f64))
          step = diff * coeff

          if (Mathf.abs(step) >= Mathf.abs(diff)) this.current = target
          else this.current += step

          this.visPhase = diff > 0.0 ? 1 : 0
          this.visPhase01 = 0.5
        }

        store<f32>(out$, this.current)

        out$ += 4
        in$ += 4
        up$ += 4
        down$ += 4
        exp$ += 4
      })
    }
  }
}
