import { clamp01f64, seededRandom01 } from '../util'
import { Gen } from './gen'

export class Every extends Gen {
  bar$: usize = 0
  prob$: usize = 0
  seed$: usize = 0
  swing$: usize = 0
  offset$: usize = 0

  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff

  copyFrom(other: Gen): void {
    const src = other as Every
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
  }

  @inline
  private static floorDivF64(a: f64, b: f64): i32 {
    return i32(Math.floor(a / b))
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
    const rate: f64 = sampleRate as f64
    const safeBpm: f64 = Math.max(1.0, bpm as f64)
    const samplesPerWholeNote: f64 = (60.0 / safeBpm) * rate * 4.0
    const minBar: f64 = 1.0 / samplesPerWholeNote

    let o$ = out$

    for (let i: i32 = 0,
      rawBar: f64,
      probValue: f64,
      swingValue: f64,
      offsetSeconds: f64,
      barValue: f64,
      interval: f64,
      offsetSamples: f64,
      globalSample: f64,
      sample: f64,
      prevSample: f64,
      swingOffset: i32,
      beatIndex: i32,
      prevBeatIndex: i32,
      currentBeatCycle: i32,
      previousBeatCycle: i32,
      shouldTrigger: bool,
      random: f64; i < length; i += 16)
    {
      unroll(16, () => {
        rawBar = load<f32>(bar$) as f64
        probValue = clamp01f64(load<f32>(prob$) as f64)
        swingValue = clamp01f64(load<f32>(swing$) as f64)
        offsetSeconds = load<f32>(offset$) as f64

        barValue = Math.max(minBar, rawBar)

        interval = barValue * samplesPerWholeNote
        offsetSamples = offsetSeconds * rate

        globalSample = (globalSampleCount + i) as f64
        sample = globalSample - offsetSamples
        prevSample = sample - 1.0

        if (swingValue > 0.0) {
          swingOffset = i32(Math.round(interval * swingValue * 0.5))
          beatIndex = Every.floorDivF64(sample, interval)
          if ((beatIndex & 1) === 1) sample -= swingOffset as f64
          prevBeatIndex = Every.floorDivF64(prevSample, interval)
          if ((prevBeatIndex & 1) === 1) prevSample -= swingOffset as f64
        }

        currentBeatCycle = Every.floorDivF64(sample, interval)
        previousBeatCycle = Every.floorDivF64(prevSample, interval)

        shouldTrigger = false

        if (currentBeatCycle > previousBeatCycle) {
          shouldTrigger = true
        }

        if (shouldTrigger) {
          random = seededRandom01(baseSeed, currentBeatCycle as f64, randKey)
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
      })
    }
  }
}
