import { f32BufArena } from '../f32-buf-arena'
import { sampleRate } from '../globals'
import { cubic } from '../util'
import { Gen } from './gen'

const MAX_SECONDS: f32 = 10.0

export class Delay extends Gen {
  in$: usize = 0
  seconds$: usize = 0
  feedback$: usize = 0

  private lastSampleRate: i32 = 0
  private cap: i32 = 0
  private len: i32 = 1
  private writePos: i32 = 0
  private bufHandle: i32 = -1
  private buf: StaticArray<f32>

  constructor() {
    super()
    const h: i32 = f32BufArena.acquireAtLeast(1)
    this.bufHandle = h
    this.buf = f32BufArena.get(h)
    this.cap = f32BufArena.len(h)
  }

  @inline
  private ensureBuffer(): void {
    const sr: i32 = i32(sampleRate)
    if (sr === this.lastSampleRate) return
    this.lastSampleRate = sr

    let nextLen: i32 = sr > 0 ? sr : 1
    if (nextLen < 1) nextLen = 1

    if (nextLen > this.cap) {
      const nextHandle: i32 = f32BufArena.acquireAtLeast(nextLen)
      if (this.bufHandle >= 0) f32BufArena.release(this.bufHandle)
      this.bufHandle = nextHandle
      this.buf = f32BufArena.get(nextHandle)
      this.cap = f32BufArena.len(nextHandle)
    }

    this.len = nextLen
    this.writePos = 0

    memory.fill(changetype<usize>(this.buf), 0, this.len << 2)
  }

  @inline
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

  @inline
  private getDelaySamplesFrac(sec: f32): f32 {
    let s: f32 = sec
    if (s < 0.0) s = 0.0
    if (s > MAX_SECONDS) s = MAX_SECONDS

    const sr: f32 = f32(sampleRate)
    let d: f32 = s * sr

    const max: f32 = f32(this.len - 1)
    if (d < 0.0) d = 0.0
    if (d > max) d = max
    return d
  }

  @inline
  private cubicRead(readPos: f32): f32 {
    const len: i32 = this.len
    const buf = this.buf
    const intPos: i32 = i32(readPos)
    const frac: f32 = readPos - f32(intPos)

    const p0: i32 = (intPos - 1 + len) % len
    const p1: i32 = intPos % len
    const p2: i32 = (intPos + 1) % len
    const p3: i32 = (intPos + 2) % len

    return cubic(buf[p0], buf[p1], buf[p2], buf[p3], frac)
  }

  @inline
  readEcho(out$: usize, length: i32): void {
    this.ensureBuffer()

    const n: i32 = length
    const len: i32 = this.len
    const w0: i32 = this.writePos

    let o$: usize = out$
    let s$: usize = this.seconds$

    for (let i: i32 = 0, y: i32 = 0, w: i32, d: f32; i < n; i += 16) {
      unroll(16, () => {
        w = (w0 + y) % len
        d = this.getDelaySamplesFrac(load<f32>(s$))

        if (d == 0.0) {
          // Zero delay: no echo
          store<f32>(o$, 0.0)
        }
        else {
          // Normal delay: read from buffer with cubic interpolation
          let readPos: f32 = f32(w) - d
          if (readPos < 0.0) readPos += f32(len)
          store<f32>(o$, this.cubicRead(readPos))
        }

        o$ += 4
        s$ += 4
        y++
      })
    }
  }

  @inline
  writeWithEcho(echo$: usize, length: i32): void {
    this.ensureBuffer()

    const buf = this.buf
    const n: i32 = length
    const len: i32 = this.len
    const w0: i32 = this.writePos

    let i$: usize = this.in$
    let e$: usize = echo$
    let f$: usize = this.feedback$

    for (let s: i32 = 0, y: i32 = 0, w: i32, x: f32, e: f32, fb: f32; s < n; s += 16) {
      unroll(16, () => {
        w = (w0 + y) % len
        x = load<f32>(i$)
        e = load<f32>(e$)
        fb = load<f32>(f$)
        buf[w] = (x + e * fb) as f32
        i$ += 4
        e$ += 4
        f$ += 4
        y++
      })
    }

    this.writePos = (w0 + n) % len
  }
  @inline
  processWithCallback(out$: usize, processedEcho$: usize, length: i32): void {
    this.ensureBuffer()

    const buf = this.buf
    const n: i32 = length
    const len: i32 = this.len
    const w0: i32 = this.writePos

    let o$: usize = out$
    let e$: usize = processedEcho$
    let f$: usize = this.feedback$

    for (let i: i32 = 0, y: i32 = 0, w: i32, readPos: f32, pe: f32, fb: f32, output: f32; i < n; i += 16) {
      unroll(16, () => {
        w = (w0 + y) % len
        pe = load<f32>(e$)
        fb = load<f32>(f$)

        output = pe * fb
        store<f32>(o$, output)
        buf[w] = output

        o$ += 4
        e$ += 4
        f$ += 4
        y++
      })
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

    for (let idx: i32 = 0, y: i32 = 0, w: i32, d: f32, x: f32, fb: f32, echo: f32; idx < n; idx += 16) {
      unroll(16, () => {
        w = (w0 + y) % len
        d = this.getDelaySamplesFrac(load<f32>(s$))
        x = load<f32>(i$)
        fb = load<f32>(f$)

        if (d == 0.0) {
          // Zero delay: output input directly
          store<f32>(o$, x)
          buf[w] = (x + x * fb) as f32
        }
        else {
          // Normal delay: read from buffer with cubic interpolation
          let readPos: f32 = f32(w) - d
          if (readPos < 0.0) readPos += f32(len)
          echo = this.cubicRead(readPos)
          store<f32>(o$, echo)
          buf[w] = (x + echo * fb) as f32
        }

        o$ += 4
        i$ += 4
        s$ += 4
        f$ += 4
        y++
      })
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
      const nextHandle: i32 = f32BufArena.acquireAtLeast(n)
      if (this.bufHandle >= 0) f32BufArena.release(this.bufHandle)
      this.bufHandle = nextHandle
      this.buf = f32BufArena.get(nextHandle)
      this.cap = f32BufArena.len(nextHandle)
    }
    this.len = n
    this.writePos = src.writePos

    for (let i: i32 = 0; i < n; i++) {
      this.buf[i] = src.buf[i]
    }

    // Clear any extra buffer space to prevent garbage audio
    for (let i: i32 = n; i < this.cap; i++) {
      this.buf[i] = 0.0 as f32
    }

    // Update lastSampleRate to current to prevent ensureBuffer from resetting state
    this.lastSampleRate = i32(sampleRate)
  }
}
