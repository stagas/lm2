import { Gen } from './gen'

export class On extends Gen {
  bar$: usize = 0
  every$: usize = 0

  reset(): void {}

  copyFrom(other: Gen): void {
    const src = other as On
    this.bar$ = src.bar$
    this.every$ = src.every$
  }

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    let every$ = this.every$
    let o$ = out$

    const safeBpm: f64 = Mathf.max(1.0, bpm) as f64
    const invSamplesPerBar: f64 = safeBpm / ((sampleRate as f64) * 240.0)

    const prevSample: i32 = globalSampleCount - 1
    let prevBarIndex: i32 = prevSample >= 0 ? i32(Math.floor((prevSample as f64) * invSamplesPerBar)) : -1

    for (let i: i32 = 0; i < length; i++) {
      const barValueRaw: f32 = load<f32>(bar$)
      const everyValueRaw: f32 = load<f32>(every$)

      let barNum: i32 = i32(Mathf.floor(barValueRaw))
      if (barNum < 1) barNum = 1

      let everyNum: i32 = i32(Mathf.floor(everyValueRaw))
      if (!(everyNum > 0)) everyNum = 0

      const globalSample: i32 = globalSampleCount + i
      const barIndex: i32 = i32(Math.floor((globalSample as f64) * invSamplesPerBar))

      let out: f32 = 0.0
      if (barIndex !== prevBarIndex) {
        const barNumber: i32 = barIndex + 1
        if (everyNum > 0) {
          if (barNumber >= barNum && ((barNumber - barNum) % everyNum) === 0) out = 1.0
        }
        else {
          if (barNumber === barNum) out = 1.0
        }
      }

      store<f32>(o$, out)
      o$ += 4
      bar$ += 4
      every$ += 4
      prevBarIndex = barIndex
    }
  }
}
