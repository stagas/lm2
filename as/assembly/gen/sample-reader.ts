import { CHUNK_SIZE } from '../constants'
import { hostSampleLen, hostSampleRead, hostSampleVersion } from '../sample-host'

export class SampleReader {
  private sampleIndex: i32 = -1
  private sampleLen: i32 = 0
  private sampleVer: i32 = 0

  private cache!: Float32Array
  private cacheLen: i32 = 0
  private cacheStart: i32 = 0
  private cacheValid: i32 = 0

  constructor() {
    // Enough for cubic interpolation even when speed is modulated.
    this.cacheLen = CHUNK_SIZE + 8
    this.cache = new Float32Array(this.cacheLen)
  }

  setSample(index: i32): void {
    const ver = hostSampleVersion(index)
    if (index === this.sampleIndex && ver === this.sampleVer) return
    this.sampleIndex = index
    this.sampleVer = ver
    this.sampleLen = hostSampleLen(index)
    this.cacheValid = 0
  }

  getLen(): i32 {
    return this.sampleLen
  }

  getVersion(): i32 {
    return this.sampleVer
  }

  private refill(start: i32): void {
    const len = this.sampleLen
    if (len <= 0) {
      this.cacheValid = 0
      return
    }

    let s = start
    if (s < 0) s = 0
    if (s > len) s = len

    this.cacheStart = s
    const wrote = hostSampleRead(this.sampleIndex, s, this.cacheLen, this.cache.dataStart)
    this.cacheValid = wrote
    for (let i = wrote; i < this.cacheLen; i++) {
      this.cache[i] = 0.0
    }
  }

  private at(pos: i32): f32 {
    const len = this.sampleLen
    if (len <= 0) return 0.0

    let p = pos
    if (p < 0) p = 0
    if (p >= len) p = len - 1

    const start = this.cacheStart
    const end = start + this.cacheValid
    if (this.cacheValid <= 0 || p < start || p >= end) {
      this.refill(p - 2)
    }

    const i = p - this.cacheStart
    if (i < 0 || i >= this.cacheValid) return 0.0
    return unchecked(this.cache[i])
  }

  sampleAt(pos: f64): f32 {
    const len = this.sampleLen
    if (len <= 0) return 0.0

    if (pos <= 0.0) return this.at(0)
    const maxPos: f64 = (len - 1) as f64
    if (pos >= maxPos) return this.at(len - 1)

    const idx: i32 = i32(Math.floor(pos))
    const frac: f32 = (pos - (idx as f64)) as f32

    const s0: f32 = this.at(idx - 1)
    const s1: f32 = this.at(idx)
    const s2: f32 = this.at(idx + 1)
    const s3: f32 = this.at(idx + 2)

    const t: f32 = frac
    const t2: f32 = t * t
    const t3: f32 = t2 * t

    const w0: f32 = (-t3 + 3.0 * t2 - 3.0 * t + 1.0) / 6.0
    const w1: f32 = (3.0 * t3 - 6.0 * t2 + 4.0) / 6.0
    const w2: f32 = (-3.0 * t3 + 3.0 * t2 + 3.0 * t + 1.0) / 6.0
    const w3: f32 = t3 / 6.0

    return s0 * w0 + s1 * w1 + s2 * w2 + s3 * w3
  }
}
