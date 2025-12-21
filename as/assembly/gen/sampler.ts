import { Gen } from './gen'
import { SampleReader } from './sample-reader'

export class Sampler extends Gen {
  sampleIndex: i32 = -1
  speed$: usize = 0
  offset$: usize = 0
  trig$: usize = 0

  private lastTrig: f32 = 0.0
  private playing: bool = false
  private pos: f64 = 0.0

  private lastSampleIndex: i32 = -1
  private lastSampleVersion: i32 = 0
  private reader: SampleReader = new SampleReader()

  reset(): void {
    this.lastTrig = 0.0
    this.playing = false
    this.pos = 0.0
    this.lastSampleIndex = -1
    this.lastSampleVersion = 0
  }

  copyFrom(other: Gen): void {
    const src = other as Sampler
    this.lastTrig = src.lastTrig
    this.playing = src.playing
    this.pos = src.pos
    this.lastSampleIndex = src.lastSampleIndex
    this.lastSampleVersion = src.lastSampleVersion
    // reader is stateless across copies besides cached sample, which we can rebuild
  }

  process(out$: usize, length: i32): void {
    this.reader.setSample(this.sampleIndex)
    const sampleLen: i32 = this.reader.getLen()
    const sampleVer: i32 = this.reader.getVersion()

    if (this.sampleIndex !== this.lastSampleIndex || sampleVer !== this.lastSampleVersion) {
      this.lastSampleIndex = this.sampleIndex
      this.lastSampleVersion = sampleVer
      this.lastTrig = 0.0
      this.playing = false
      this.pos = 0.0
    }

    let speed$ = this.speed$
    let offset$ = this.offset$
    let trig$ = this.trig$

    let lastTrig: f32 = this.lastTrig
    let playing: bool = this.playing
    let pos: f64 = this.pos

    const maxPos: f64 = sampleLen > 0 ? (sampleLen as f64) : 0.0

    for (let i = 0; i < length; i++) {
      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        let off = load<f32>(offset$)
        if (off < 0.0) off = 1.0 + off
        if (off < 0.0) off = 0.0
        if (off > 1.0) off = 1.0
        // Map 0..1 to 0..(len-1) so offset=1 is the last sample, not out-of-range.
        const maxStart: f64 = sampleLen > 1 ? ((sampleLen - 1) as f64) : 0.0
        pos = (off as f64) * maxStart
        playing = true
      }
      lastTrig = trig

      if (!playing || sampleLen <= 0) {
        store<f32>(out$, 0.0)
      }
      else if (pos < 0.0 || pos >= maxPos) {
        store<f32>(out$, 0.0)
        playing = false
      }
      else {
        const y = this.reader.sampleAt(pos)
        store<f32>(out$, y)
        const sp = load<f32>(speed$)
        pos += sp as f64
      }

      out$ += 4
      speed$ += 4
      offset$ += 4
      trig$ += 4
    }

    this.lastTrig = lastTrig
    this.playing = playing
    this.pos = pos
  }
}
