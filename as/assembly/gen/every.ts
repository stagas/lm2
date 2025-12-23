import { clamp01, seededRandom01 } from '../util'
import { Gen } from './gen'

export class Every extends Gen {
  bar$: usize = 0
  prob$: usize = 0
  seed$: usize = 0
  swing$: usize = 0
  offset$: usize = 0

  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff

  reset(): void {
    // no internal state
  }

  copyFrom(other: Gen): void {
    const src = other as Every
    this.bar$ = src.bar$
    this.prob$ = src.prob$
    this.seed$ = src.seed$
    this.swing$ = src.swing$
    this.offset$ = src.offset$
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
  }

  @inline
  private static floorDiv(a: i32, b: i32): i32 {
    if (a >= 0) return a / b
    return (a - (b - 1)) / b
  }

  process(out$: usize, length: i32): void {
    let bar$ = this.bar$
    let prob$ = this.prob$
    const seed$ = this.seed$
    let swing$ = this.swing$
    let offset$ = this.offset$

    const seedInput: i32 = i32(load<f32>(seed$))
    if (seedInput !== this.lastSeedInput) {
      this.lastSeedInput = seedInput
      this.baseSeed = seedInput as u32
    }

    const baseSeed: u32 = this.baseSeed
    const randKey: i32 = 1
    const rate: f32 = sampleRate
    const safeBpm: f32 = Mathf.max(1.0, bpm)
    const samplesPerWholeNote: f32 = (60.0 / safeBpm) * rate * 4.0
    const minBar: f32 = 1.0 / samplesPerWholeNote

    let o$ = out$

    for (let i: i32 = 0; i < length; i++) {
      const rawBar: f32 = load<f32>(bar$)
      const probValue: f32 = clamp01(load<f32>(prob$))
      const swingValue: f32 = clamp01(load<f32>(swing$))
      const offsetSeconds: f32 = load<f32>(offset$)

      const barValue: f32 = Mathf.max(minBar, rawBar)

      let intervalSamples: i32 = i32(Mathf.ceil(barValue * samplesPerWholeNote))
      if (intervalSamples < 1) intervalSamples = 1

      const offsetSamples: i32 = i32(Mathf.ceil(offsetSeconds * rate))

      const globalSample: i32 = globalSampleCount + i
      let sample: i32 = globalSample - offsetSamples
      let prevSample: i32 = sample - 1

      if (swingValue > 0.0) {
        const swingOffset: i32 = i32(Mathf.round((intervalSamples as f32) * swingValue * 0.5))
        const beatIndex: i32 = Every.floorDiv(sample, intervalSamples)
        if ((beatIndex & 1) === 1) sample -= swingOffset
        const prevBeatIndex: i32 = Every.floorDiv(prevSample, intervalSamples)
        if ((prevBeatIndex & 1) === 1) prevSample -= swingOffset
      }

      const currentBeatCycle: i32 = Every.floorDiv(sample, intervalSamples)
      const previousBeatCycle: i32 = Every.floorDiv(prevSample, intervalSamples)

      let shouldTrigger: bool = false

      if (currentBeatCycle > previousBeatCycle) {
        shouldTrigger = true
      }

      if (shouldTrigger) {
        const random: f32 = seededRandom01(baseSeed, currentBeatCycle as f64, randKey) as f32
        store<f32>(o$, random < probValue ? 1.0 : 0.0)
      }
      else {
        store<f32>(o$, 0.0)
      }

      o$ += 4
      bar$ += 4
      prob$ += 4
      swing$ += 4
      offset$ += 4
    }
  }
}
