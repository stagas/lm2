import {
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
  SAMPLE_NEEDLE_WRITE_POS_OFFSET,
} from '../constants'
import { Gen } from './gen'
import { SampleReader } from './sample-reader'

export class Sampler extends Gen {
  sampleIndex: i32 = -1
  speed$: usize = 0
  offset$: usize = 0
  trig$: usize = 0
  repeat$: usize = 0
  needleHistory$: usize = 0

  private lastTrig: f32 = 0.0
  private playing: bool = false
  private pos: f64 = 0.0
  private startPos: f64 = 0.0

  private lastSampleIndex: i32 = -1
  private lastSampleVersion: i32 = 0
  private reader: SampleReader = new SampleReader()

  reset(): void {
    this.lastTrig = 0.0
    this.playing = false
    this.pos = 0.0
    this.startPos = 0.0
    this.lastSampleIndex = -1
    this.lastSampleVersion = 0
  }

  copyFrom(other: Gen): void {
    const src = other as Sampler
    this.lastTrig = src.lastTrig
    this.playing = src.playing
    this.pos = src.pos
    this.startPos = src.startPos
    this.lastSampleIndex = src.lastSampleIndex
    this.lastSampleVersion = src.lastSampleVersion
    this.needleHistory$ = src.needleHistory$
    // reader is stateless across copies besides cached sample, which we can rebuild
  }

  @inline
  private recordNeedle(posFrames: f64, playing: bool): void {
    if (this.needleHistory$ === 0) return
    const hist = changetype<StaticArray<f32>>(this.needleHistory$)
    const writePos = i32(hist[SAMPLE_NEEDLE_WRITE_POS_OFFSET])
    const slot = writePos % SAMPLE_NEEDLE_HISTORY_SIZE
    const base = SAMPLE_NEEDLE_DATA_OFFSET + slot * SAMPLE_NEEDLE_ENTRY_SIZE
    hist[base + 0] = this.sampleIndex as f32
    hist[base + 1] = posFrames as f32
    hist[base + 2] = playing ? 1.0 : 0.0
    hist[SAMPLE_NEEDLE_WRITE_POS_OFFSET] = f32((writePos + 1) & 0xfffff)
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
      this.startPos = 0.0
    }

    let speed$ = this.speed$
    let offset$ = this.offset$
    let trig$ = this.trig$
    let repeat$ = this.repeat$

    let lastTrig: f32 = this.lastTrig
    let playing: bool = this.playing
    let pos: f64 = this.pos
    let startPos: f64 = this.startPos
    const wasPlaying: bool = playing

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
        startPos = pos
        playing = true
      }
      lastTrig = trig

      if (!playing || sampleLen <= 0) {
        store<f32>(out$, 0.0)
      }
      else {
        const rep: bool = load<f32>(repeat$) > 0.0
        if (pos < 0.0 || pos >= maxPos) {
          if (rep) {
            pos = startPos
          }
          else {
            store<f32>(out$, 0.0)
            playing = false
            out$ += 4
            speed$ += 4
            offset$ += 4
            trig$ += 4
            repeat$ += 4
            continue
          }
        }

        store<f32>(out$, this.reader.sampleAt(pos))
        const sp = load<f32>(speed$)
        pos += sp as f64
      }

      out$ += 4
      speed$ += 4
      offset$ += 4
      trig$ += 4
      repeat$ += 4
    }

    this.lastTrig = lastTrig
    this.playing = playing
    this.pos = pos
    this.startPos = startPos

    if (sampleLen > 0) {
      if (playing) this.recordNeedle(pos, true)
      else if (wasPlaying) this.recordNeedle(pos, false)
    }
  }
}
