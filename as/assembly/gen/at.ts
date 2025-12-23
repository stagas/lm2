import { clamp01, seededRandom01 } from '../util'
import { Gen } from './gen'

export class At extends Gen {
  bar$: usize = 0
  every$: usize = 0
  prob$: usize = 0
  seed$: usize = 0

  private id: i32 = 0
  private static nextId: i32 = 0

  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff

  constructor() {
    super()
    this.id = At.nextId++
  }

  reset(): void {}

  copyFrom(other: Gen): void {
    const src = other as At
    this.bar$ = src.bar$
    this.every$ = src.every$
    this.prob$ = src.prob$
    this.seed$ = src.seed$
    this.id = src.id
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
  }

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    let every$ = this.every$
    let prob$ = this.prob$
    const seed$ = this.seed$

    const id: i32 = this.id

    const seedInput: i32 = i32(load<f32>(seed$))
    if (seedInput !== this.lastSeedInput) {
      this.lastSeedInput = seedInput
      this.baseSeed = seedInput as u32
    }

    const baseSeed: u32 = this.baseSeed

    let o$ = out$

    for (let i: i32 = 0; i < length; i++) {
      const barBars: f32 = load<f32>(bar$)
      const everyBarsRaw: f32 = load<f32>(every$)
      const probValue: f32 = clamp01(load<f32>(prob$))

      const safeBpm: f32 = Mathf.max(1.0, bpm)
      const samplesPerBar: f64 = (60.0 / (safeBpm as f64)) * (sampleRate as f64) * 4.0

      const startSample: i32 = i32(Math.round((barBars as f64) * samplesPerBar))
      const globalSample: i32 = globalSampleCount + i

      let shouldTrigger: bool = false
      let cycle: i32 = 0

      if (everyBarsRaw > 0.0) {
        let intervalSamples: i32 = i32(Math.round((everyBarsRaw as f64) * samplesPerBar))
        if (intervalSamples < 1) intervalSamples = 1

        const delta: i32 = globalSample - startSample
        if (delta >= 0 && (delta % intervalSamples) === 0) {
          shouldTrigger = true
          cycle = delta / intervalSamples
        }
      }
      else if (globalSample === startSample) {
        shouldTrigger = true
        cycle = 0
      }

      if (shouldTrigger) {
        const random: f32 = seededRandom01(baseSeed, cycle as f64, id) as f32
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
