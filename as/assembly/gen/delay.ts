import { sampleRate } from '../globals'
import { Gen } from './gen'

const MAX_SECONDS: f32 = 10.0

export class Delay extends Gen {
  in$: usize = 0
  seconds$: usize = 0
  feedback$: usize = 0

  private lastSampleRate: i32 = 0
  private cap: i32 = 1
  private len: i32 = 1
  private writePos: i32 = 0
  private buf: StaticArray<f32> = new StaticArray<f32>(1)

  private ensureBuffer(): void {
    const sr: i32 = i32(sampleRate)
    if (sr === this.lastSampleRate) return
    this.lastSampleRate = sr

    let nextLen: i32 = sr > 0 ? (sr * 10) : 1
    if (nextLen < 1) nextLen = 1

    if (nextLen > this.cap) {
      this.buf = new StaticArray<f32>(nextLen)
      this.cap = nextLen
    }

    this.len = nextLen
    this.writePos = 0

    for (let i: i32 = 0; i < nextLen; i++) {
      this.buf[i] = 0.0 as f32
    }
  }

  private clampDelaySamples(sec: f32): i32 {
    let s: f32 = sec
    if (s < 0.0) s = 0.0
    if (s > MAX_SECONDS) s = MAX_SECONDS

    const sr: f32 = f32(sampleRate)
    let d: i32 = i32(s * sr)

    const max: i32 = this.len - 1
    if (d < 0) d = 0
    if (d > max) d = max
    return d
  }

  readEcho(out$: usize, length: i32): void {
    this.ensureBuffer()

    const buf = this.buf
    const n: i32 = length
    const len: i32 = this.len
    const w0: i32 = this.writePos

    let o$: usize = out$
    let s$: usize = this.seconds$

    for (let i: i32 = 0; i < n; i++) {
      const w: i32 = (w0 + i) % len
      const d: i32 = this.clampDelaySamples(load<f32>(s$))
      let r: i32 = w - d
      if (r < 0) r += len
      store<f32>(o$, buf[r])
      o$ += 4
      s$ += 4
    }
  }

  writeWithEcho(echo$: usize, length: i32): void {
    this.ensureBuffer()

    const buf = this.buf
    const n: i32 = length
    const len: i32 = this.len
    const w0: i32 = this.writePos

    let i$: usize = this.in$
    let e$: usize = echo$
    let f$: usize = this.feedback$

    for (let s: i32 = 0; s < n; s++) {
      const w: i32 = (w0 + s) % len
      const x: f32 = load<f32>(i$)
      const e: f32 = load<f32>(e$)
      const fb: f32 = load<f32>(f$)
      buf[w] = (x + e * fb) as f32
      i$ += 4
      e$ += 4
      f$ += 4
    }

    this.writePos = (w0 + n) % len
  }

  process(out$: usize, length: i32): void {
    this.ensureBuffer()

    const buf = this.buf
    const n: i32 = length
    const len: i32 = this.len
    const w0: i32 = this.writePos

    let o$: usize = out$
    let i$: usize = this.in$
    let s$: usize = this.seconds$
    let f$: usize = this.feedback$

    for (let i: i32 = 0; i < n; i++) {
      const w: i32 = (w0 + i) % len
      const d: i32 = this.clampDelaySamples(load<f32>(s$))
      let r: i32 = w - d
      if (r < 0) r += len

      const echo: f32 = buf[r]
      store<f32>(o$, echo)

      const x: f32 = load<f32>(i$)
      const fb: f32 = load<f32>(f$)
      buf[w] = (x + echo * fb) as f32

      o$ += 4
      i$ += 4
      s$ += 4
      f$ += 4
    }

    this.writePos = (w0 + n) % len
  }

  reset(): void {
    this.ensureBuffer()
    this.writePos = 0
    const n: i32 = this.len
    for (let i: i32 = 0; i < n; i++) {
      this.buf[i] = 0.0 as f32
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Delay

    this.lastSampleRate = src.lastSampleRate
    const n: i32 = src.len
    if (n > this.cap) {
      this.buf = new StaticArray<f32>(n)
      this.cap = n
    }
    this.len = n
    this.writePos = src.writePos % n

    for (let i: i32 = 0; i < n; i++) {
      this.buf[i] = src.buf[i]
    }
  }
}
