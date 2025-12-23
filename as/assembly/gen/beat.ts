import { clamp01, seededRandom01 } from '../util'
import { Gen } from './gen'

export class Beat extends Gen {
  on$: usize = 0
  prob$: usize = 0
  swing$: usize = 0
  offset$: usize = 0
  skipFirst$: usize = 0
  seed$: usize = 0

  private id: i32 = 0
  private baseSeed: u32 = 1234
  private lastSeedInput: i32 = 0x7fffffff

  private lastGlobalSample: i32 = -1
  private skipFirstTriggered: bool = false

  private static nextId: i32 = 0

  constructor() {
    super()
    this.id = Beat.nextId++
  }

  reset(): void {
    this.lastGlobalSample = -1
    this.skipFirstTriggered = false
  }

  copyFrom(other: Gen): void {
    const src = other as Beat
    this.on$ = src.on$
    this.prob$ = src.prob$
    this.swing$ = src.swing$
    this.offset$ = src.offset$
    this.skipFirst$ = src.skipFirst$
    this.seed$ = src.seed$
    this.id = src.id
    this.baseSeed = src.baseSeed
    this.lastSeedInput = src.lastSeedInput
    this.lastGlobalSample = src.lastGlobalSample
    this.skipFirstTriggered = src.skipFirstTriggered
  }

  @inline
  private static floorDiv(a: i32, b: i32): i32 {
    if (a >= 0) return a / b
    return (a - (b - 1)) / b
  }

  @inline
  private static posMod(a: i32, b: i32): i32 {
    let m: i32 = a % b
    if (m < 0) m += b
    return m
  }

  process(out$: usize, length: i32): void {
    let on$ = this.on$
    let prob$ = this.prob$
    let swing$ = this.swing$
    let offset$ = this.offset$
    let skipFirst$ = this.skipFirst$
    const seed$ = this.seed$

    let lastGlobalSample: i32 = this.lastGlobalSample
    let skipFirstTriggered: bool = this.skipFirstTriggered

    const seedInput: i32 = i32(load<f32>(seed$))
    if (seedInput !== this.lastSeedInput) {
      this.lastSeedInput = seedInput
      this.baseSeed = seedInput as u32
    }

    const baseSeed: u32 = this.baseSeed
    const id: i32 = this.id

    let o$ = out$

    for (let i: i32 = 0; i < length; i++) {
      const rawOn: f32 = load<f32>(on$)
      const probValue: f32 = clamp01(load<f32>(prob$))
      const swingValue: f32 = clamp01(load<f32>(swing$))
      const offsetSeconds: f32 = load<f32>(offset$)
      const skipFirstValue: f32 = load<f32>(skipFirst$)

      const safeBpm: f32 = Mathf.max(1.0, bpm)
      const samplesPerWholeNote: f32 = (60.0 / safeBpm) * sampleRate * 4.0
      const minOn: f32 = 1.0 / samplesPerWholeNote
      const onValue: f32 = Mathf.max(minOn, rawOn)

      let intervalSamples: i32 = i32(Mathf.ceil(onValue * samplesPerWholeNote))
      if (intervalSamples < 1) intervalSamples = 1

      const offsetSamples: i32 = i32(Mathf.ceil(offsetSeconds * sampleRate))

      const globalSample: i32 = globalSampleCount + i
      let offsetGlobalSample: i32 = globalSample - offsetSamples

      if (swingValue > 0.0) {
        const beatIndex: i32 = Beat.floorDiv(offsetGlobalSample, intervalSamples)
        if ((beatIndex & 1) === 1) {
          const swingOffset: i32 = i32(Mathf.round((intervalSamples as f32) * swingValue * 0.5))
          offsetGlobalSample -= swingOffset
        }
      }

      const currentBeatCycle: i32 = Beat.floorDiv(offsetGlobalSample, intervalSamples)

      let previousBeatCycle: i32 = -1
      if (lastGlobalSample >= 0) {
        let prevOffsetGlobalSample: i32 = lastGlobalSample - offsetSamples
        if (swingValue > 0.0) {
          const beatIndexPrev: i32 = Beat.floorDiv(prevOffsetGlobalSample, intervalSamples)
          if ((beatIndexPrev & 1) === 1) {
            const swingOffset: i32 = i32(Mathf.round((intervalSamples as f32) * swingValue * 0.5))
            prevOffsetGlobalSample -= swingOffset
          }
        }
        previousBeatCycle = Beat.floorDiv(prevOffsetGlobalSample, intervalSamples)
      }

      let shouldTrigger: bool = false

      if (lastGlobalSample < 0) {
        if (Beat.posMod(offsetGlobalSample, intervalSamples) === 0) {
          shouldTrigger = true
          if (skipFirstValue > 0.0 && !skipFirstTriggered) {
            shouldTrigger = false
            skipFirstTriggered = true
          }
        }
      }
      else if (currentBeatCycle > previousBeatCycle) {
        shouldTrigger = true
      }

      lastGlobalSample = globalSample

      if (shouldTrigger) {
        const random: f32 = seededRandom01(baseSeed, currentBeatCycle as f64, id) as f32
        store<f32>(o$, random < probValue ? 1.0 : 0.0)
      }
      else {
        store<f32>(o$, 0.0)
      }

      o$ += 4
      on$ += 4
      prob$ += 4
      swing$ += 4
      offset$ += 4
      skipFirst$ += 4
    }

    this.lastGlobalSample = lastGlobalSample
    this.skipFirstTriggered = skipFirstTriggered
  }
}
