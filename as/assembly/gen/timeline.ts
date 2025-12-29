import {
  ARRAY_HEADER_SIZE,
  FUTURE_BARS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_SIZE_MINUS_ONE,
  HISTORY_WRITE_POS_OFFSET,
  PAST_BARS,
  TIMELINE_HEADER_SIZE,
  TIMELINE_KIND_GLIDE,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../constants'
import { Gen } from './gen'
import { applyCurve } from '../util'

@unmanaged
class HistoryEntry {
  opIndex!: f32
  voiceIndex!: f32
  value!: f32
  velocity!: f32
  startSample!: f32
  endSample!: f32

  static at(array$: usize, offset: i32): HistoryEntry {
    return changetype<HistoryEntry>(array$ + (offset << 2))
  }
}

export class Timeline extends Gen {
  bytecode$: usize = 0
  history$: usize = 0
  // beatsPerBar override. 0 means "use stored beatDiv from bytecode".
  beatDiv: f32 = 0.0

  private lastBytecode$: usize = 0
  private lastHistory$: usize = 0
  private lastVersion: i32 = -1
  private historyGeneratedUntilCycle: i32 = -1

  reset(): void {
    this.lastBytecode$ = 0
    this.lastHistory$ = 0
    this.lastVersion = -1
    this.historyGeneratedUntilCycle = -1
  }

  copyFrom(other: Gen): void {
    const src: Timeline = other as Timeline
    this.bytecode$ = src.bytecode$
    this.history$ = src.history$
    this.beatDiv = src.beatDiv
    this.lastBytecode$ = src.lastBytecode$
    this.lastHistory$ = src.lastHistory$
    this.lastVersion = src.lastVersion
    this.historyGeneratedUntilCycle = src.historyGeneratedUntilCycle
  }

  private getStoredBeatDiv(bytecodeArray: StaticArray<f32>): f32 {
    const base: i32 = ARRAY_HEADER_SIZE
    // dataStart = base + 1
    return bytecodeArray[base + 4]
  }

  private getSegmentCount(bytecodeArray: StaticArray<f32>): i32 {
    const base: i32 = ARRAY_HEADER_SIZE
    return i32(bytecodeArray[base + 2])
  }

  private getTotalUnits(bytecodeArray: StaticArray<f32>): f32 {
    const base: i32 = ARRAY_HEADER_SIZE
    return bytecodeArray[base + 3]
  }

  generateHistory(): void {
    if (this.bytecode$ === 0 || this.history$ === 0) return

    const bytecodeArray: StaticArray<f32> = changetype<StaticArray<f32>>(this.bytecode$)
    const historyArray: StaticArray<f32> = changetype<StaticArray<f32>>(this.history$)
    const base: i32 = ARRAY_HEADER_SIZE
    const opLength: i32 = i32(bytecodeArray[base])
    if (opLength <= 0) return

    const dataStart: i32 = base + 1
    if (i32(bytecodeArray[dataStart]) !== TIMELINE_MAGIC) return

    const totalUnits: f32 = this.getTotalUnits(bytecodeArray)
    if (totalUnits <= 0.0) return

    const storedBeatDiv: f32 = this.getStoredBeatDiv(bytecodeArray)
    const beatDiv: f32 = this.beatDiv > 0.0 ? this.beatDiv : storedBeatDiv
    if (beatDiv <= 0.0) return

    const secondsPerBeat: f32 = 60.0 / bpm
    const cycleBeats: f32 = totalUnits * beatDiv
    const cycleSeconds: f32 = cycleBeats * secondsPerBeat
    const cycleSamplesF: f32 = cycleSeconds * sampleRate
    if (cycleSamplesF <= 0.0) return

    const currentVersion: i32 = i32(bytecodeArray[3])

    if (this.bytecode$ !== this.lastBytecode$ || this.history$ !== this.lastHistory$) {
      this.lastBytecode$ = this.bytecode$
      this.lastHistory$ = this.history$
      this.lastVersion = -1
      this.historyGeneratedUntilCycle = -1
      memory.fill(changetype<usize>(historyArray), 0, (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4)
    }

    if (currentVersion !== this.lastVersion) {
      this.lastVersion = currentVersion
      this.historyGeneratedUntilCycle = -1
      memory.fill(changetype<usize>(historyArray), 0, (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4)
    }

    const windowStartSample: i32 = globalSampleCount
    const barLengthSeconds: f32 = 60.0 * 4.0 / bpm
    const pastStart: i32 = windowStartSample - i32((PAST_BARS as f32) * barLengthSeconds * sampleRate)
    const startSample: i32 = pastStart > 0 ? pastStart : 0

    // First fill: begin from slightly before the visible past.
    if (this.historyGeneratedUntilCycle < 0) {
      const startCycle0: i32 = i32(Mathf.floor(f32((startSample as f32) / cycleSamplesF))) - 2
      this.historyGeneratedUntilCycle = startCycle0 > 0 ? startCycle0 - 1 : -1
    }

    const lookAheadSamples: i32 = i32((FUTURE_BARS as f32) * barLengthSeconds * sampleRate)
    const desiredEndSample: i32 = windowStartSample + lookAheadSamples
    const targetEndSample: i32 = desiredEndSample + i32(cycleSamplesF)
    const targetEndCycle: i32 = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamplesF)))

    if (this.historyGeneratedUntilCycle >= targetEndCycle) return

    let historyWritePos: i32 = i32(historyArray[HISTORY_WRITE_POS_OFFSET])

    const segCount: i32 = this.getSegmentCount(bytecodeArray)
    const segBase: i32 = dataStart + TIMELINE_HEADER_SIZE

    for (let cycle: i32 = this.historyGeneratedUntilCycle + 1; cycle <= targetEndCycle; cycle++) {
      const cycleStartSampleF: f32 = cycleSamplesF * (cycle as f32)
      let segStartF: f32 = 0.0

      for (let s: i32 = 0; s < segCount; s++) {
        const segOffset: i32 = segBase + s * TIMELINE_SEGMENT_SIZE
        const kind: i32 = i32(bytecodeArray[segOffset])
        const durUnits: f32 = bytecodeArray[segOffset + 1]
        if (durUnits <= 0.0) continue

        const durBeats: f32 = durUnits * beatDiv
        const segDurSamples: f32 = durBeats * secondsPerBeat * sampleRate
        const startSampleAbs: i32 = i32(cycleStartSampleF + segStartF)
        const endSampleAbs: i32 = i32(cycleStartSampleF + segStartF + segDurSamples)

        segStartF += segDurSamples

        const slot: i32 = historyWritePos & HISTORY_SIZE_MINUS_ONE
        const historyIdx: i32 = HISTORY_DATA_OFFSET + slot * HISTORY_ENTRY_SIZE
        const historyEntry: HistoryEntry = HistoryEntry.at(changetype<usize>(historyArray), historyIdx)
        historyEntry.opIndex = kind as f32
        historyEntry.voiceIndex = kind === TIMELINE_KIND_GLIDE ? bytecodeArray[segOffset + 4] : 0.0
        historyEntry.value = bytecodeArray[segOffset + 2]
        historyEntry.velocity = bytecodeArray[segOffset + 3]
        historyEntry.startSample = startSampleAbs as f32
        historyEntry.endSample = endSampleAbs as f32

        historyWritePos = (historyWritePos + 1) & HISTORY_SIZE_MINUS_ONE
      }

      this.historyGeneratedUntilCycle = cycle
    }

    historyArray[HISTORY_WRITE_POS_OFFSET] = historyWritePos as f32
  }

  private processAudio(out$: usize, length: i32): void {
    if (this.bytecode$ === 0) {
      memory.fill(out$, 0, (length << 2) as usize)
      return
    }

    const bytecodeArray: StaticArray<f32> = changetype<StaticArray<f32>>(this.bytecode$)
    const base: i32 = ARRAY_HEADER_SIZE
    const opLength: i32 = i32(bytecodeArray[base])
    if (opLength <= 0) {
      memory.fill(out$, 0, (length << 2) as usize)
      return
    }

    const dataStart: i32 = base + 1
    if (i32(bytecodeArray[dataStart]) !== TIMELINE_MAGIC) {
      memory.fill(out$, 0, (length << 2) as usize)
      return
    }

    const totalUnits: f32 = this.getTotalUnits(bytecodeArray)
    if (totalUnits <= 0.0) {
      memory.fill(out$, 0, (length << 2) as usize)
      return
    }

    const storedBeatDiv: f32 = this.getStoredBeatDiv(bytecodeArray)
    const beatDiv: f32 = this.beatDiv > 0.0 ? this.beatDiv : storedBeatDiv
    if (beatDiv <= 0.0) {
      memory.fill(out$, 0, (length << 2) as usize)
      return
    }

    const segCount: i32 = this.getSegmentCount(bytecodeArray)
    const segBase: i32 = dataStart + TIMELINE_HEADER_SIZE

    const cycleBeats: f64 = (totalUnits * beatDiv) as f64
    if (cycleBeats <= 0.0) {
      memory.fill(out$, 0, (length << 2) as usize)
      return
    }

    const beatsPerSample: f64 = (bpm as f64) / 60.0 / (sampleRate as f64)
    let beatAbs: f64 = (globalSampleCount as f64) * beatsPerSample

    for (let i: i32 = 0; i < length; i++) {
      const cycle: f64 = Math.floor(beatAbs / cycleBeats)
      const localBeat: f64 = beatAbs - cycle * cycleBeats

      let accBeats: f64 = 0.0
      let v: f32 = 0.0

      for (let s: i32 = 0; s < segCount; s++) {
        const segOffset: i32 = segBase + s * TIMELINE_SEGMENT_SIZE
        const kind: i32 = i32(bytecodeArray[segOffset])
        const durUnits: f32 = bytecodeArray[segOffset + 1]
        if (durUnits <= 0.0) continue

        const durBeats: f64 = (durUnits * beatDiv) as f64
        if (localBeat < accBeats + durBeats) {
          const a: f32 = bytecodeArray[segOffset + 2]
          const b: f32 = bytecodeArray[segOffset + 3]
          if (kind !== TIMELINE_KIND_GLIDE || durBeats <= 0.0) {
            v = a
          }
          else {
            const curve: f32 = bytecodeArray[segOffset + 4]
            const t: f64 = (localBeat - accBeats) / durBeats
            const p: f32 = applyCurve(t, curve as f64) as f32
            v = a + (b - a) * p
          }
          break
        }
        accBeats += durBeats
      }

      store<f32>(out$ + (i << 2), v)
      beatAbs += beatsPerSample
    }
  }

  process(out$: usize, length: i32): void {
    this.generateHistory()
    this.processAudio(out$, length)
  }
}
