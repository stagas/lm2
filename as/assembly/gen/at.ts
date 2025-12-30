import { clamp01f64, seededRandom01 } from '../util'
import { Gen } from './gen'

export class At extends Gen {
  bar$: usize = 0
  every$: usize = 0
  prob$: usize = 0
  seed$: usize = 0

  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff

  copyFrom(other: Gen): void {
    const src = other as At
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
  }

  @inline
  private static floorDivF64(a: f64, b: f64): i32 {
    return i32(Math.floor(a / b))
  }

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    let every$ = this.every$
    let prob$ = this.prob$
    const seed$ = this.seed$

    const randKey: i32 = 2

    const seedInput: i32 = i32(load<f32>(seed$))
    if (seedInput !== this.lastSeedInput) {
      this.lastSeedInput = seedInput
      this.baseSeed = seedInput as u32
    }

    const baseSeed: u32 = this.baseSeed

    let o$ = out$

    for (let i: i32 = 0; i < length; i++) {
      const barBars: f64 = load<f32>(bar$) as f64
      const everyBarsRaw: f64 = load<f32>(every$) as f64
      const probValue: f64 = clamp01f64(load<f32>(prob$) as f64)

      const safeBpm: f64 = Math.max(1.0, bpm as f64)
      const samplesPerBar: f64 = (60.0 / safeBpm) * (sampleRate as f64) * 4.0

      const startSample: f64 = barBars * samplesPerBar
      const globalSample: f64 = (globalSampleCount + i) as f64
      const prevSample: f64 = globalSample - 1.0

      let shouldTrigger: bool = false
      let cycle: i32 = 0

      if (everyBarsRaw > 0.0) {
        let interval: f64 = everyBarsRaw * samplesPerBar
        if (interval < 1.0) interval = 1.0

        const delta: f64 = globalSample - startSample
        const prevDelta: f64 = prevSample - startSample

        const currentCycle: i32 = At.floorDivF64(delta, interval)
        const prevCycle: i32 = At.floorDivF64(prevDelta, interval)

        if (currentCycle >= 0 && currentCycle > prevCycle) {
          shouldTrigger = true
          cycle = currentCycle
        }
      }
      else if (globalSample >= startSample && prevSample < startSample) {
        shouldTrigger = true
        cycle = 0
      }

      if (shouldTrigger) {
        const random: f64 = seededRandom01(baseSeed, cycle as f64, randKey)
        store<f32>(o$, random < probValue ? 1.0 : 0.0)
      }
      else {
        store<f32>(o$, 0.0)
      }

      o$ += 4
      bar$ += 4
      every$ += 4
      prob$ += 4
    }
  }
}
