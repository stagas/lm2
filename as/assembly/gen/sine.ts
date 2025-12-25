import { clampNyquist, fract } from '../util'
import { Gen } from './gen'

const SINE_TABLE_BITS: i32 = 11
const SINE_TABLE_SIZE: i32 = 1 << SINE_TABLE_BITS
const SINE_TABLE_SIZE_F32: f32 = SINE_TABLE_SIZE as f32
const SINE_TABLE_SIZE_F64: f64 = SINE_TABLE_SIZE as f64

const sineTable: StaticArray<f32> = new StaticArray<f32>(SINE_TABLE_SIZE + 1)
let sineTableReady: bool = false

function initSineTable(): void {
  if (sineTableReady) return
  sineTableReady = true

  const invSize: f32 = 1.0 / SINE_TABLE_SIZE_F32
  for (let i: i32 = 0; i < SINE_TABLE_SIZE; i++) {
    const phase: f32 = (i as f32) * invSize
    sineTable[i] = Mathf.sin(phase * TWO_PI)
  }
  sineTable[SINE_TABLE_SIZE] = sineTable[0]
}

export class Sine extends Gen {
  hz$: usize = 0
  trig$: usize = 0
  offset$: usize = 0

  private lastTrig: f32 = 0
  private phase: f64 = 0

  constructor() {
    super()
    initSineTable()
  }

  reset(): void {
    this.lastTrig = 0
    this.phase = 0
  }

  copyFrom(other: Gen): void {
    const src = other as Sine
    this.lastTrig = src.lastTrig
    this.phase = src.phase
  }

  private static wavetable(phase: f64): f32 {
    const t: f64 = phase * SINE_TABLE_SIZE_F64
    const i: i32 = t as i32
    const frac: f32 = (t - (i as f64)) as f32
    const a: f32 = unchecked(sineTable[i])
    const b: f32 = unchecked(sineTable[i + 1])
    return a + (b - a) * frac
  }

  process(out$: usize, length: i32): void {
    initSineTable()

    let hz$ = this.hz$
    let trig$ = this.trig$
    let offset$ = this.offset$

    let phase: f64 = this.phase
    let lastTrig: f32 = this.lastTrig

    for (let i = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        const hz = clampNyquist(load<f32>(hz$))
        const offsetSeconds = load<f32>(offset$)
        phase = fract((offsetSeconds as f64) * (hz as f64))
      }
      lastTrig = trig

      const hz = clampNyquist(load<f32>(hz$))
      const sample = Sine.wavetable(phase)

      phase += (hz as f64) / (sampleRate as f64)
      if (phase >= 1.0) {
        phase = fract(phase)
      }

      store<f32>(out$, sample)

      out$ += 4
      hz$ += 4
      trig$ += 4
      offset$ += 4
    }

    this.phase = phase
    this.lastTrig = lastTrig
  }
}
