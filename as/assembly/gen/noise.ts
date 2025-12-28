import { clamp01, clamp11 } from '../util'
import { Gen } from './gen'

function hashU32(v: u32): u32 {
  v ^= v >> 16
  v *= 0x7feb352d
  v ^= v >> 15
  v *= 0x846ca68b
  v ^= v >> 16
  return v
}

function seedToBits(seed: f32): u32 {
  return hashU32(reinterpret<u32>(seed))
}

function xorshift32(state: u32): u32 {
  // Note: 0 stays 0, so always keep state non-zero.
  state ^= state << 13
  state ^= state >> 17
  state ^= state << 5
  return state
}

function u32To01(v: u32): f32 {
  // Use top 24 bits for stable-ish float mapping.
  return (f32(v >>> 8) * (1.0 / 16777216.0)) as f32
}

function u32To11(v: u32): f32 {
  return (u32To01(v) * 2.0 - 1.0) as f32
}

function fade5(t: f32): f32 {
  return t * t * t * (t * (t * 6.0 - 15.0) + 10.0)
}

function fadeWithCurve(t: f32, curve: f32): f32 {
  const c = clamp01(curve)
  const f = fade5(t)
  return (t + (f - t) * c) as f32
}

export class WhiteNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private state: u32 = 1
  private lastTrig: f32 = 0

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.state = 1
    this.lastTrig = 0
  }

  copyFrom(other: Gen): void {
    const src = other as WhiteNoise
    this.lastSeedBits = src.lastSeedBits
    this.state = src.state
    this.lastTrig = src.lastTrig
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.state = (seedBits | 1) as u32
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        // Reset seed when triggered
        const newSeedBits = seedToBits(load<f32>(this.seed$))
        this.lastSeedBits = newSeedBits
        this.state = (newSeedBits | 1) as u32
      }
      lastTrig = trig

      let s = this.state
      s = xorshift32(s)
      store<f32>(out$, u32To11(s))
      this.state = s

      out$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
  }
}

export class GaussNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private state: u32 = 1
  private lastTrig: f32 = 0

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.state = 1
    this.lastTrig = 0
  }

  copyFrom(other: Gen): void {
    const src = other as GaussNoise
    this.lastSeedBits = src.lastSeedBits
    this.state = src.state
    this.lastTrig = src.lastTrig
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.state = (seedBits | 1) as u32
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        // Reset seed when triggered
        const newSeedBits = seedToBits(load<f32>(this.seed$))
        this.lastSeedBits = newSeedBits
        this.state = (newSeedBits | 1) as u32
      }
      lastTrig = trig

      let s = this.state
      // CLT-ish: average of 6 uniforms => normal-ish; map to [-1,1] by (sum-3)/3.
      let sum: f32 = 0.0
      s = xorshift32(s)
      sum += u32To01(s)
      s = xorshift32(s)
      sum += u32To01(s)
      s = xorshift32(s)
      sum += u32To01(s)
      s = xorshift32(s)
      sum += u32To01(s)
      s = xorshift32(s)
      sum += u32To01(s)
      s = xorshift32(s)
      sum += u32To01(s)
      store<f32>(out$, ((sum - 3.0) * (1.0 / 3.0)) as f32)
      this.state = s

      out$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
  }
}

function trailingZeros(v: u32): i32 {
  if (v === 0) return 32
  let n: i32 = 0
  let x: u32 = v
  while ((x & 1) === 0) {
    n++
    x >>= 1
  }
  return n
}

export class PinkNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private state: u32 = 1
  private counter: u32 = 0
  private rows: StaticArray<f32> = new StaticArray<f32>(8)
  private rowsSum: f32 = 0.0
  private lastTrig: f32 = 0

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.state = 1
    this.counter = 0
    this.rowsSum = 0.0
    this.lastTrig = 0
    for (let i = 0; i < this.rows.length; i++) this.rows[i] = 0.0
  }

  copyFrom(other: Gen): void {
    const src = other as PinkNoise
    this.lastSeedBits = src.lastSeedBits
    this.state = src.state
    this.counter = src.counter
    this.rowsSum = src.rowsSum
    this.lastTrig = src.lastTrig
    for (let i = 0; i < this.rows.length; i++) this.rows[i] = src.rows[i]
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.state = (hashU32(seedBits ^ 0x70696e6b) | 1) as u32
      this.counter = 0
      this.rowsSum = 0.0
      for (let i = 0; i < this.rows.length; i++) {
        this.state = xorshift32(this.state)
        const v = u32To11(this.state)
        this.rows[i] = v
        this.rowsSum += v
      }
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig

    let s = this.state
    let c = this.counter
    let sum = this.rowsSum

    const n = this.rows.length
    const norm: f32 = 1.0 / (f32(n) + 1.0)

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        // Reset seed when triggered
        const newSeedBits = seedToBits(load<f32>(this.seed$))
        this.lastSeedBits = newSeedBits
        s = (hashU32(newSeedBits ^ 0x70696e6b) | 1) as u32
        c = 0
        sum = 0.0
        for (let j = 0; j < this.rows.length; j++) {
          s = xorshift32(s)
          const v = u32To11(s)
          this.rows[j] = v
          sum += v
        }
      }
      lastTrig = trig

      c++
      const tz = trailingZeros(c)
      const idx: i32 = tz < n ? tz : (n - 1)

      const old = this.rows[idx]
      s = xorshift32(s)
      const v = u32To11(s)
      this.rows[idx] = v
      sum += v - old

      s = xorshift32(s)
      const white = u32To11(s)
      store<f32>(out$, clamp11((sum + white) * norm))

      out$ += 4
      trig$ += 4
    }

    this.state = s
    this.counter = c
    this.rowsSum = sum
    this.lastTrig = lastTrig
  }
}

export class BrownNoise extends Gen {
  seed$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private state: u32 = 1
  private y: f32 = 0.0
  private lastTrig: f32 = 0

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.state = 1
    this.y = 0.0
    this.lastTrig = 0
  }

  copyFrom(other: Gen): void {
    const src = other as BrownNoise
    this.lastSeedBits = src.lastSeedBits
    this.state = src.state
    this.y = src.y
    this.lastTrig = src.lastTrig
  }

  process(out$: usize, length: i32): void {
    // Check for seed changes (initializes on first call or when seed changes)
    const seedBits = seedToBits(load<f32>(this.seed$))
    if (seedBits !== this.lastSeedBits) {
      this.lastSeedBits = seedBits
      this.state = (hashU32(seedBits ^ 0x62726f77) | 1) as u32
      this.y = 0.0
    }

    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig

    let s = this.state
    let y = this.y

    const step: f32 = 0.02
    const leak: f32 = 0.999

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        // Reset seed when triggered
        const newSeedBits = seedToBits(load<f32>(this.seed$))
        this.lastSeedBits = newSeedBits
        s = (hashU32(newSeedBits ^ 0x62726f77) | 1) as u32
        y = 0.0
      }
      lastTrig = trig

      s = xorshift32(s)
      const w = u32To11(s)
      y = clamp11(y * leak + w * step)
      store<f32>(out$, y)

      out$ += 4
      trig$ += 4
    }

    this.state = s
    this.y = y
    this.lastTrig = lastTrig
  }
}

export class SmoothNoise extends Gen {
  seed$: usize = 0
  rate$: usize = 0
  curve$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private state: u32 = 1
  private phase: f32 = 0.0
  private a: f32 = 0.0
  private b: f32 = 0.0
  private lastTrig: f32 = 0

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.state = 1
    this.phase = 0.0
    this.a = 0.0
    this.b = 0.0
    this.lastTrig = 0
  }

  copyFrom(other: Gen): void {
    const src = other as SmoothNoise
    this.lastSeedBits = src.lastSeedBits
    this.state = src.state
    this.phase = src.phase
    this.a = src.a
    this.b = src.b
    this.lastTrig = src.lastTrig
  }

  process(out$: usize, length: i32): void {
    // Latch seed on first run; after that, only a trig resets the stream.
    if (this.lastSeedBits === 0xffffffff) {
      const seedBits = seedToBits(load<f32>(this.seed$))
      this.lastSeedBits = seedBits
      this.state = (hashU32(seedBits ^ 0x736d6f6f) | 1) as u32
      this.phase = 0.0
      this.state = xorshift32(this.state)
      this.a = u32To11(this.state)
      this.state = xorshift32(this.state)
      this.b = u32To11(this.state)
    }

    let rate$ = this.rate$
    let curve$ = this.curve$
    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig

    let s = this.state
    let phase = this.phase
    let a = this.a
    let b = this.b

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        // Reset seed when triggered
        const newSeedBits = seedToBits(load<f32>(this.seed$))
        this.lastSeedBits = newSeedBits
        s = (hashU32(newSeedBits ^ 0x736d6f6f) | 1) as u32
        phase = 0.0
        s = xorshift32(s)
        a = u32To11(s)
        s = xorshift32(s)
        b = u32To11(s)
      }
      lastTrig = trig

      const rate = load<f32>(rate$)
      const curve = load<f32>(curve$)
      const inc: f32 = rate > 0.0 ? (rate / sampleRate) : 0.0

      phase += inc
      if (phase >= 1.0) {
        phase -= 1.0
        a = b
        s = xorshift32(s)
        b = u32To11(s)
      }

      const w = fadeWithCurve(phase, curve)
      store<f32>(out$, a + (b - a) * w)

      out$ += 4
      trig$ += 4
      rate$ += 4
      curve$ += 4
    }

    this.state = s
    this.phase = phase
    this.a = a
    this.b = b
    this.lastTrig = lastTrig
  }
}

export class FractalNoise extends Gen {
  seed$: usize = 0
  rate$: usize = 0
  octaves$: usize = 0
  gain$: usize = 0
  trig$: usize = 0

  private lastSeedBits: u32 = 0xffffffff
  private baseSeed: u32 = 1
  private lastTrig: f32 = 0

  private phases: StaticArray<f32> = new StaticArray<f32>(16)
  private a: StaticArray<f32> = new StaticArray<f32>(16)
  private b: StaticArray<f32> = new StaticArray<f32>(16)
  private states: StaticArray<u32> = new StaticArray<u32>(16)

  reset(): void {
    this.lastSeedBits = 0xffffffff
    this.baseSeed = 1
    this.lastTrig = 0
    for (let i = 0; i < this.phases.length; i++) {
      this.phases[i] = 0.0
      this.a[i] = 0.0
      this.b[i] = 0.0
      this.states[i] = 1
    }
  }

  copyFrom(other: Gen): void {
    const src = other as FractalNoise
    this.lastSeedBits = src.lastSeedBits
    this.baseSeed = src.baseSeed
    this.lastTrig = src.lastTrig
    for (let i = 0; i < this.phases.length; i++) {
      this.phases[i] = src.phases[i]
      this.a[i] = src.a[i]
      this.b[i] = src.b[i]
      this.states[i] = src.states[i]
    }
  }

  process(out$: usize, length: i32): void {
    // Latch seed on first run; after that, only a trig resets the stream.
    if (this.lastSeedBits === 0xffffffff) {
      const seedBits = seedToBits(load<f32>(this.seed$))
      this.lastSeedBits = seedBits
      this.baseSeed = hashU32(seedBits ^ 0x66726163) | 1
      for (let i = 0; i < this.phases.length; i++) {
        this.phases[i] = 0.0
        const s0 = hashU32(this.baseSeed ^ (u32(i) * 0x9e3779b9)) | 1
        this.states[i] = s0
        let s = s0
        s = xorshift32(s)
        this.a[i] = u32To11(s)
        s = xorshift32(s)
        this.b[i] = u32To11(s)
        this.states[i] = s
      }
    }

    let rate$ = this.rate$
    let octaves$ = this.octaves$
    let gain$ = this.gain$
    let trig$ = this.trig$
    let lastTrig: f32 = this.lastTrig

    for (let i: i32 = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0 && lastTrig <= 0) {
        // Reset seed when triggered
        const newSeedBits = seedToBits(load<f32>(this.seed$))
        this.lastSeedBits = newSeedBits
        this.baseSeed = hashU32(newSeedBits ^ 0x66726163) | 1
        for (let j = 0; j < this.phases.length; j++) {
          this.phases[j] = 0.0
          const s0 = hashU32(this.baseSeed ^ (u32(j) * 0x9e3779b9)) | 1
          this.states[j] = s0
          let s = s0
          s = xorshift32(s)
          this.a[j] = u32To11(s)
          s = xorshift32(s)
          this.b[j] = u32To11(s)
          this.states[j] = s
        }
      }
      lastTrig = trig

      const baseRate = load<f32>(rate$)
      const oRaw = load<f32>(octaves$)
      const gRaw = load<f32>(gain$)
      let oct: i32 = i32(Math.floor(oRaw as f64))
      if (oct < 1) oct = 1
      if (oct > 16) oct = 16
      const gain = clamp01(gRaw)

      let sum: f32 = 0.0
      let norm: f32 = 0.0
      let amp: f32 = 1.0
      let freq: f32 = baseRate

      for (let o: i32 = 0; o < oct; o++) {
        const inc: f32 = freq > 0.0 ? (freq / sampleRate) : 0.0
        let phase = this.phases[o] + inc
        let a = this.a[o]
        let b = this.b[o]
        let s = this.states[o]

        if (phase >= 1.0) {
          phase -= 1.0
          a = b
          s = xorshift32(s)
          b = u32To11(s)
        }

        const w = fade5(phase)
        const v = (a + (b - a) * w) as f32

        this.phases[o] = phase
        this.a[o] = a
        this.b[o] = b
        this.states[o] = s

        sum += v * amp
        norm += amp
        amp *= gain
        freq *= 2.0
      }

      const y = norm > 0.0 ? (sum / norm) : 0.0
      store<f32>(out$, clamp11(y))

      out$ += 4
      trig$ += 4
      rate$ += 4
      octaves$ += 4
      gain$ += 4
    }

    this.lastTrig = lastTrig
  }
}
