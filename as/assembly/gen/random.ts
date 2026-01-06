// dprint-ignore-file

import { Gen } from './gen'
import { randomU32 } from '../util'

export class Random extends Gen {
  seed$: usize = 0

  private lastSeed: f64 = -1.0
  private counter: f64 = 0.0

  reset(): void {
    this.lastSeed = -1.0
    this.counter = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as Random
    this.lastSeed = src.lastSeed
    this.counter = src.counter
  }

  process(out$: usize, length: i32): void {
    const seed: f64 = load<f32>(this.seed$)

    // Reset counter when seed changes
    if (seed !== this.lastSeed) {
      this.lastSeed = seed
      this.counter = 0.0
    }

    let counter = this.counter
    for (let i = 0; i < length; i++) {
      // Use seed + counter for continuous advancing state
      const rngSeed = seed + counter
      const randomValue = randomU32(rngSeed)
      // Convert to [0, 1] range
      const normalized = (randomValue as f32) / 4294967295.0
      store<f32>(out$, normalized)
      out$ += 4
      counter += 1.0
    }

    this.counter = counter
  }
}
