import {
  SAMPLE_NEEDLE_DATA_OFFSET,
  SAMPLE_NEEDLE_ENTRY_SIZE,
  SAMPLE_NEEDLE_HISTORY_SIZE,
  SAMPLE_NEEDLE_WRITE_POS_OFFSET,
} from '../constants'
import { hostSampleSlices } from '../sample-host'
import { Gen } from './gen'
import { SampleReader } from './sample-reader'

const MAX_SLICES: i32 = 512

export class Slicer extends Gen {
  sampleIndex: i32 = -1
  speed$: usize = 0
  offset$: usize = 0
  slice$: usize = 0
  threshold$: usize = 0
  trig$: usize = 0
  repeat$: usize = 0
  needleHistory$: usize = 0

  private lastTrig: f32 = 0.0
  private playing: bool = false
  private pos: f64 = 0.0
  private sliceStart: i32 = 0
  private sliceEnd: i32 = 0

  private lastSampleIndex: i32 = -1
  private lastSampleVersion: i32 = 0
  private lastThreshold: f32 = -1.0
  private slicesCount: i32 = 0
  private slices: Int32Array = new Int32Array(MAX_SLICES)

  private reader: SampleReader = new SampleReader()

  reset(): void {
    this.lastTrig = 0.0
    this.playing = false
    this.pos = 0.0
    this.sliceStart = 0
    this.sliceEnd = 0
  }

  copyFrom(other: Gen): void {
    const src = other as Slicer
    this.lastTrig = src.lastTrig
    this.playing = src.playing
    this.pos = src.pos
    this.sliceStart = src.sliceStart
    this.sliceEnd = src.sliceEnd
    this.lastSampleIndex = src.lastSampleIndex
    this.lastSampleVersion = src.lastSampleVersion
    this.lastThreshold = src.lastThreshold
    this.slicesCount = src.slicesCount
    this.needleHistory$ = src.needleHistory$
    // slices content is cheap to refresh; keep empty if needed
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

  @inline
  private refreshSlices(threshold: f32): void {
    const count = hostSampleSlices(this.sampleIndex, threshold, this.slices.dataStart, MAX_SLICES)
    this.slicesCount = count > 0 ? count : 0
    this.lastThreshold = threshold
  }

  process(out$: usize, length: i32): void {
    this.reader.setSample(this.sampleIndex)
    const sampleLen: i32 = this.reader.getLen()
    const sampleVer: i32 = this.reader.getVersion()

    if (this.sampleIndex !== this.lastSampleIndex || sampleVer !== this.lastSampleVersion) {
      this.lastSampleIndex = this.sampleIndex
      this.lastSampleVersion = sampleVer
      this.lastThreshold = -1.0
      this.slicesCount = 0
      this.lastTrig = 0.0
      this.playing = false
      this.pos = 0.0
      this.sliceStart = 0
      this.sliceEnd = 0
    }

    let speed$ = this.speed$
    let offset$ = this.offset$
    let slice$ = this.slice$
    let threshold$ = this.threshold$
    let trig$ = this.trig$
    let repeat$ = this.repeat$

    let lastTrig: f32 = this.lastTrig
    let playing: bool = this.playing
    let pos: f64 = this.pos
    const wasPlaying: bool = playing
    let sliceStart: i32 = this.sliceStart
    let sliceEnd: i32 = this.sliceEnd

    let lastThreshold: f32 = this.lastThreshold
    let slicesCount: i32 = this.slicesCount

    for (let i = 0; i < length; i++) {
      const thr = load<f32>(threshold$)
      if (sampleLen > 0) {
        const needs = lastThreshold < 0.0
          || Mathf.abs(thr - lastThreshold) > 0.1 * Mathf.max(0.00001, Mathf.abs(lastThreshold))
        if (needs) {
          this.refreshSlices(thr)
          lastThreshold = this.lastThreshold
          slicesCount = this.slicesCount
        }
      }

      const trig = load<f32>(trig$)
      if (trig > 0.0 && lastTrig <= 0.0) {
        if (sampleLen > 0 && slicesCount > 0) {
          let s = load<f32>(slice$)
          if (s < -1.0) s = -1.0
          if (s > 1.0) s = 1.0
          const t: f32 = (s + 1.0) * 0.5
          const idx = i32(Mathf.floor(t * f32(slicesCount - 1) + 0.5))
          let si = idx
          if (si < 0) si = 0
          if (si >= slicesCount) si = slicesCount - 1

          sliceStart = unchecked(this.slices[si])
          sliceEnd = (si + 1 < slicesCount) ? unchecked(this.slices[si + 1]) : sampleLen
          if (sliceEnd < sliceStart) sliceEnd = sliceStart

          let off = load<f32>(offset$)
          if (off < -1.0) off = -1.0
          if (off > 1.0) off = 1.0
          const off01: f32 = (off + 1.0) * 0.5
          const segLen: i32 = sliceEnd - sliceStart
          // Map 0..1 to 0..(segLen-1) so offset=1 stays inside the slice.
          const relMax: i32 = segLen > 1 ? (segLen - 1) : 0
          const relRaw: i32 = i32(Mathf.floor(off01 * f32(relMax)))
          let rel: i32 = relRaw
          if (rel < 0) rel = 0
          if (rel > relMax) rel = relMax

          const sp = load<f32>(speed$)
          if (sp < 0.0) {
            const startFrame = sliceEnd - 1 - rel
            pos = startFrame as f64
          }
          else {
            pos = (sliceStart + rel) as f64
          }
          playing = true
        }
        else {
          playing = false
        }
      }
      lastTrig = trig

      if (!playing || sampleLen <= 0) {
        store<f32>(out$, 0.0)
      }
      else {
        const sp = load<f32>(speed$)
        const rep: bool = load<f32>(repeat$) > 0.0
        const startF: f64 = sliceStart as f64
        const endF: f64 = sliceEnd as f64
        if (pos < startF || pos >= endF) {
          if (rep && sliceEnd > sliceStart) {
            pos = sp >= 0.0 ? startF : ((sliceEnd - 1) as f64)
          }
          else {
            store<f32>(out$, 0.0)
            playing = false
            out$ += 4
            speed$ += 4
            offset$ += 4
            slice$ += 4
            threshold$ += 4
            trig$ += 4
            repeat$ += 4
            continue
          }
        }

        store<f32>(out$, this.reader.sampleAt(pos))
        pos += sp as f64
      }

      out$ += 4
      speed$ += 4
      offset$ += 4
      slice$ += 4
      threshold$ += 4
      trig$ += 4
      repeat$ += 4
    }

    this.lastTrig = lastTrig
    this.playing = playing
    this.pos = pos
    this.sliceStart = sliceStart
    this.sliceEnd = sliceEnd
    this.lastThreshold = lastThreshold
    this.slicesCount = slicesCount

    if (sampleLen > 0) {
      if (playing) this.recordNeedle(pos, true)
      else if (wasPlaying) this.recordNeedle(pos, false)
    }
  }
}
