import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  FUTURE_BARS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_SIZE_MINUS_ONE,
  HISTORY_WRITE_POS_OFFSET,
  MAX_EVENT_VALUES,
  MINI_HEADER_SIZE,
  OP_EVENT,
  PAST_BARS,
  SEQ_VOICES,
} from '../constants'
import { MiniEventBuffer, MiniEvents } from '../mini/events'
import { EventOp } from '../mini/ops'
import { applyCurve } from '../util'
import { Gen } from './gen'

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

class MiniVoice {
  active: bool = false
  triggerSample: i32 = 0
  holdEndSample: i32 = 0
  value: f32 = 0
  velocity: f32 = 0
  // Stable chord voice slot (MiniEvent.voiceIndex) for matching across live bytecode changes.
  slot: i32 = -1
  glidePower: f32 = 0.0
  glideTarget: f32 = 0.0
  glideEndSample: i32 = 0
  baseValue: f32 = 0.0

  copyFrom(other: MiniVoice): void {
    this.active = other.active
    this.triggerSample = other.triggerSample
    this.holdEndSample = other.holdEndSample
    this.value = other.value
    this.velocity = other.velocity
    this.slot = other.slot
    this.glidePower = other.glidePower
    this.glideTarget = other.glideTarget
    this.glideEndSample = other.glideEndSample
    this.baseValue = other.baseValue
  }
}

class MiniRng {
  private state: u32 = 1234567890
  next(): f32 {
    this.state = (this.state * 1664525 + 1013904223) as u32
    return (this.state as f32) / (u32.MAX_VALUE as f32)
  }

  copyFrom(other: MiniRng): void {
    this.state = other.state
  }
}

export class Mini extends Gen {
  bytecode$: usize = 0
  history$: usize = 0
  outVoiceCount$: usize = 0
  outTrig$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outVelocity$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outValue$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)

  private voices: StaticArray<MiniVoice> = new StaticArray<MiniVoice>(SEQ_VOICES)
  // Map (opIndex, chordVoiceIndex) -> voiceIndex. This must cover all op offsets in the mini bytecode
  // plus chord voice slots (MAX_EVENT_VALUES).
  private eventVoices: StaticArray<i32> = new StaticArray<i32>(ARRAY_SIZE * MAX_EVENT_VALUES)
  private voiceEventIndex: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  private voiceCursor: i32 = 0
  private rng: MiniRng = new MiniRng()
  private lastBytecode$: usize = 0
  private lastHistory$: usize = 0
  private lastVersion: i32 = -1
  // Cycle number up to which the history has been generated (inclusive).
  private historyGeneratedUntilCycle: i32 = -1
  private eventEmitter: MiniEvents = new MiniEvents()
  private eventBuffer: MiniEventBuffer = new MiniEventBuffer()
  private scratchHistory: StaticArray<f32> = new StaticArray<f32>(
    HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE,
  )
  // Scratch space for glide successor lookup (avoids O(HISTORY_SIZE^2) scans in processAudio).
  private glideSlots: StaticArray<i32> = new StaticArray<i32>(HISTORY_SIZE)
  private glideKeys: StaticArray<i64> = new StaticArray<i64>(HISTORY_SIZE)
  private glideNextStartBySlot: StaticArray<i32> = new StaticArray<i32>(HISTORY_SIZE)
  private glideNextValueBySlot: StaticArray<f32> = new StaticArray<f32>(HISTORY_SIZE)

  constructor() {
    super()
    for (let i = 0; i < SEQ_VOICES; i++) {
      this.voices[i] = new MiniVoice()
    }
    this.resetVoiceMaps()
  }

  reset(): void {
    this.lastBytecode$ = 0
    this.lastHistory$ = 0
    this.lastVersion = -1
    this.historyGeneratedUntilCycle = -1
    this.voiceCursor = 0
    this.resetVoiceMaps()
    for (let i = 0; i < SEQ_VOICES; i++) {
      const voice = this.voices[i]
      voice.active = false
      voice.triggerSample = 0
      voice.holdEndSample = 0
      voice.value = 0
      voice.velocity = 0
      voice.slot = -1
      voice.glidePower = 0.0
      voice.glideTarget = 0.0
      voice.glideEndSample = 0
      voice.baseValue = 0.0
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Mini
    this.bytecode$ = src.bytecode$
    this.history$ = src.history$
    this.outVoiceCount$ = src.outVoiceCount$
    this.voiceCursor = src.voiceCursor
    this.lastBytecode$ = src.lastBytecode$
    this.lastHistory$ = src.lastHistory$
    this.lastVersion = src.lastVersion
    this.historyGeneratedUntilCycle = src.historyGeneratedUntilCycle

    for (let i = 0; i < SEQ_VOICES; i++) {
      this.outTrig$[i] = src.outTrig$[i]
      this.outVelocity$[i] = src.outVelocity$[i]
      this.outValue$[i] = src.outValue$[i]
      this.voices[i].copyFrom(src.voices[i])
      this.voiceEventIndex[i] = src.voiceEventIndex[i]
    }

    for (let i = 0; i < ARRAY_SIZE * MAX_EVENT_VALUES; i++) {
      this.eventVoices[i] = src.eventVoices[i]
    }

    this.rng.copyFrom(src.rng)
  }

  private resetVoiceMaps(): void {
    const size = ARRAY_SIZE * MAX_EVENT_VALUES
    for (let i = 0; i < size; i++) {
      this.eventVoices[i] = -1
    }
    for (let v = 0; v < SEQ_VOICES; v++) {
      this.voiceEventIndex[v] = -1
    }
  }

  private allocateVoice(windowStart: i32): i32 {
    const start = this.voiceCursor
    let endedCandidate: i32 = -1
    for (let i = 0; i < SEQ_VOICES; i++) {
      const v = (start + i) % SEQ_VOICES
      const voice = this.voices[v]
      if (!voice.active) {
        this.voiceCursor = (v + 1) % SEQ_VOICES
        return v
      }

      // Prefer reusing voices whose hold already ended, so held notes don't get stolen mid-hold.
      if (endedCandidate < 0 && windowStart >= voice.holdEndSample) {
        endedCandidate = v
      }
    }

    if (endedCandidate >= 0) {
      this.voiceCursor = (endedCandidate + 1) % SEQ_VOICES
      return endedCandidate
    }

    const v = this.voiceCursor
    this.voiceCursor = (this.voiceCursor + 1) % SEQ_VOICES
    return v
  }

  private claimVoice(eventIndex: i32, windowStart: i32): i32 {
    const size = ARRAY_SIZE * MAX_EVENT_VALUES
    if (eventIndex >= 0 && eventIndex < size) {
      const existing = this.eventVoices[eventIndex]
      if (existing >= 0) {
        return existing
      }
    }

    const voiceIndex = this.allocateVoice(windowStart)
    const prevEvent = this.voiceEventIndex[voiceIndex]
    if (prevEvent >= 0 && prevEvent < size) {
      this.eventVoices[prevEvent] = -1
    }
    this.voiceEventIndex[voiceIndex] = eventIndex
    if (eventIndex >= 0 && eventIndex < size) {
      this.eventVoices[eventIndex] = voiceIndex
    }
    return voiceIndex
  }

  private bindVoiceToEvent(voiceIndex: i32, eventIndex: i32): void {
    const size = ARRAY_SIZE * MAX_EVENT_VALUES
    const prevEvent = this.voiceEventIndex[voiceIndex]
    if (prevEvent >= 0 && prevEvent < size) {
      this.eventVoices[prevEvent] = -1
    }
    this.voiceEventIndex[voiceIndex] = eventIndex
    if (eventIndex >= 0 && eventIndex < size) {
      this.eventVoices[eventIndex] = voiceIndex
    }
  }

  private pairLess(aKey: i64, aSlot: i32, bKey: i64, bSlot: i32): bool {
    if (aKey < bKey) return true
    if (aKey > bKey) return false
    return aSlot < bSlot
  }

  private sortGlidePairs(lo: i32, hi: i32): void {
    let i: i32 = lo
    let j: i32 = hi
    const pivotIndex: i32 = (lo + hi) >> 1
    const pivotKey: i64 = this.glideKeys[pivotIndex]
    const pivotSlot: i32 = this.glideSlots[pivotIndex]

    while (i <= j) {
      while (this.pairLess(this.glideKeys[i], this.glideSlots[i], pivotKey, pivotSlot)) i++
      while (this.pairLess(pivotKey, pivotSlot, this.glideKeys[j], this.glideSlots[j])) j--
      if (i <= j) {
        const k: i64 = this.glideKeys[i]
        this.glideKeys[i] = this.glideKeys[j]
        this.glideKeys[j] = k
        const s: i32 = this.glideSlots[i]
        this.glideSlots[i] = this.glideSlots[j]
        this.glideSlots[j] = s
        i++
        j--
      }
    }

    if (lo < j) this.sortGlidePairs(lo, j)
    if (i < hi) this.sortGlidePairs(i, hi)
  }

  private prepareGlideSuccessors(historyArray: StaticArray<f32>): void {
    // Reset successor tables.
    for (let n: i32 = 0; n < HISTORY_SIZE; n++) {
      this.glideNextStartBySlot[n] = i32.MAX_VALUE
      this.glideNextValueBySlot[n] = 0.0
    }

    // Build sortable (voiceIndexHist, startSample, slotIndex) tuples for valid entries.
    let count: i32 = 0
    for (let n: i32 = 0; n < HISTORY_SIZE; n++) {
      const historyIdx: i32 = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const startSample: i32 = i32(historyArray[historyIdx + 4])
      const endSample: i32 = i32(historyArray[historyIdx + 5])
      if (startSample === 0 && endSample === 0) continue
      const voiceIndexHist: i32 = i32(historyArray[historyIdx + 1])
      if (voiceIndexHist < 0 || voiceIndexHist >= MAX_EVENT_VALUES) continue
      const key: i64 = (i64(voiceIndexHist) << 32) | i64(u32(startSample))
      this.glideKeys[count] = key
      this.glideSlots[count] = n
      count++
    }

    if (count <= 1) return

    this.sortGlidePairs(0, count - 1)

    // For each (voiceIndexHist) group, link each startSample run to the next distinct startSample run.
    let p: i32 = 0
    while (p < count) {
      const voiceKey: i32 = i32(this.glideKeys[p] >> 32)
      let groupEnd: i32 = p + 1
      while (groupEnd < count && i32(this.glideKeys[groupEnd] >> 32) === voiceKey) groupEnd++

      let i: i32 = p
      while (i < groupEnd) {
        const startKey: u32 = u32(this.glideKeys[i])
        let runEnd: i32 = i + 1
        while (runEnd < groupEnd && u32(this.glideKeys[runEnd]) === startKey) runEnd++

        if (runEnd < groupEnd) {
          const nextStart: i32 = i32(u32(this.glideKeys[runEnd]))
          const nextSlot: i32 = this.glideSlots[runEnd]
          const nextIdx: i32 = HISTORY_DATA_OFFSET + nextSlot * HISTORY_ENTRY_SIZE
          const nextValue: f32 = historyArray[nextIdx + 2]

          for (let j: i32 = i; j < runEnd; j++) {
            const slot: i32 = this.glideSlots[j]
            this.glideNextStartBySlot[slot] = nextStart
            this.glideNextValueBySlot[slot] = nextValue
          }
        }

        i = runEnd
      }

      p = groupEnd
    }
  }

  private defragmentHistory(
    historyArray: StaticArray<f32>,
    windowStart: i32,
    windowEnd: i32,
  ): void {
    const scratchHistory = this.scratchHistory
    memory.fill(changetype<usize>(scratchHistory), 0, (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4)

    // Clear the buffer and move preserved events to the beginning
    let newWritePos = 0

    // Give some space for the edge case.
    // windowStart -= 1000000

    for (let n = 0; n < HISTORY_SIZE; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const historyEntry = HistoryEntry.at(changetype<usize>(historyArray), historyIdx)
      const endSample = i32(historyEntry.endSample)

      // Skip invalid entries
      if (endSample === 0) continue

      // We keep fully past events for the visualizer, even if their opIndex no longer matches the
      // current bytecode. But we must clear anything that could still affect playback.
      if (endSample > windowEnd || endSample < windowStart) continue

      // Move this event to the new position at newWritePos
      const newIdx = HISTORY_DATA_OFFSET + newWritePos * HISTORY_ENTRY_SIZE
      const scratchHistoryEntry = HistoryEntry.at(changetype<usize>(scratchHistory), newIdx)
      scratchHistoryEntry.opIndex = historyEntry.opIndex
      scratchHistoryEntry.voiceIndex = historyEntry.voiceIndex
      scratchHistoryEntry.value = historyEntry.value
      scratchHistoryEntry.velocity = historyEntry.velocity
      scratchHistoryEntry.startSample = historyEntry.startSample
      scratchHistoryEntry.endSample = historyEntry.endSample
      newWritePos = (newWritePos + 1) & HISTORY_SIZE_MINUS_ONE
    }

    // Update write position to point after the last valid event (clean position for writing ahead)
    scratchHistory[HISTORY_WRITE_POS_OFFSET] = newWritePos as f32

    memory.copy(
      changetype<usize>(historyArray),
      changetype<usize>(scratchHistory),
      (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4,
    )
  }

  generateHistory(): void {
    if (this.bytecode$ === 0 || this.history$ === 0) return

    const bytecodeArray = changetype<StaticArray<f32>>(this.bytecode$)
    const historyArray = changetype<StaticArray<f32>>(this.history$)
    const bytecodeBase = ARRAY_HEADER_SIZE
    const opLength = i32(bytecodeArray[bytecodeBase])
    if (opLength <= 0) return

    const windowStart = globalSampleCount

    const cycleLength = 1.0 as f32
    const secondsPerBeat = 60.0 / bpm
    const cycleSeconds = 4.0 * secondsPerBeat
    const cycleSamples = (cycleSeconds * sampleRate) as f32
    if (cycleSamples <= 0.0) return
    const barLengthSeconds = 60.0 * 4.0 / bpm
    const lookAheadSamples = i32(<f32> FUTURE_BARS * barLengthSeconds * sampleRate)

    const currentVersion = i32(bytecodeArray[3])
    // If the history buffer pointer changes, reset our generation cursor.
    if (this.history$ !== this.lastHistory$) {
      this.lastHistory$ = this.history$
      this.lastVersion = -1
      this.historyGeneratedUntilCycle = -1
      // memory.fill(changetype<usize>(historyArray), 0, (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4)
    }

    // Version changes: rewrite forward from "now" (keep fully past entries for the visualizer, clear overlap).
    if (currentVersion !== this.lastVersion) {
      this.lastVersion = currentVersion
      this.resetVoiceMaps()
      this.defragmentHistory(
        historyArray,
        windowStart - i32(<f32> PAST_BARS * barLengthSeconds * sampleRate),
        windowStart,
      )
      // Start generating from a couple cycles before "now" to catch strum/jitter events that start
      // in earlier cycles but land in the visible window.
      const nowCycle = i32(Mathf.floor(f32((windowStart as f32) / cycleSamples)))
      this.historyGeneratedUntilCycle = i32(Math.min(this.historyGeneratedUntilCycle as f32, (nowCycle - 1) as f32))
    }

    // First fill: generate from the visible past (for visualizer).
    if (this.historyGeneratedUntilCycle < 0) {
      const visualizerStart = windowStart - i32(<f32> PAST_BARS * barLengthSeconds * sampleRate)
      const startSample = visualizerStart > 0 ? visualizerStart : 0
      const startCycle0 = i32(Mathf.floor(f32((startSample as f32) / cycleSamples))) - 2
      this.historyGeneratedUntilCycle = startCycle0 > 0 ? startCycle0 - 1 : -1
    }

    // Determine how far ahead we need to generate (visible window + lookahead + one extra chunk).
    const desiredEndSample = windowStart + lookAheadSamples
    const chunkSamples = i32(cycleSamples)
    const targetEndSample = desiredEndSample + (chunkSamples > 0 ? chunkSamples : 0)
    const targetEndCycle = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamples)))

    if (this.historyGeneratedUntilCycle >= targetEndCycle) return

    // Generate cycles from (historyGeneratedUntilCycle + 1) to targetEndCycle (inclusive).
    const startCycle = this.historyGeneratedUntilCycle + 1
    const endCycle = targetEndCycle

    this.defragmentHistory(
      historyArray,
      windowStart - i32(<f32> PAST_BARS * barLengthSeconds * sampleRate),
      i32(cycleSamples * ((endCycle + 1) as f32)),
    )

    let historyWritePos = i32(historyArray[HISTORY_WRITE_POS_OFFSET])

    const maxEventsToWrite = HISTORY_SIZE
    let eventsWritten = 0

    // Generate events for each cycle. emitEvents will filter by the window, but we emit all events
    // from each cycle (including those shifted by strum/jitter) exactly once.
    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
      if (eventsWritten >= maxEventsToWrite) break

      const cycleStartSample = i32(cycleSamples * (cycle as f32))
      this.eventBuffer.clear()
      // Pass a very wide window to emitEvents so it doesn't filter anything - we want all events
      // from this cycle regardless of where strum/jitter shifts them.
      this.eventEmitter.emitEvents(
        this.bytecode$,
        this.eventBuffer,
        cycleStartSample,
        cycleLength,
        cycleSamples,
        i32.MIN_VALUE,
        i32.MAX_VALUE,
      )

      for (let i = 0; i < this.eventBuffer.writePos; i++) {
        if (eventsWritten >= maxEventsToWrite) break
        const event = this.eventBuffer.events[i]
        if (!event) continue
        if (event.opIndex < 0) continue
        if (event.value <= 0) continue

        const slotIndex = historyWritePos & HISTORY_SIZE_MINUS_ONE
        const historyIdx = HISTORY_DATA_OFFSET + slotIndex * HISTORY_ENTRY_SIZE
        const historyEntry = HistoryEntry.at(changetype<usize>(historyArray), historyIdx)
        historyEntry.opIndex = event.opIndex as f32
        historyEntry.voiceIndex = event.voiceIndex as f32
        historyEntry.value = event.value
        historyEntry.velocity = event.velocity
        historyEntry.startSample = event.startSample as f32
        historyEntry.endSample = event.endSample as f32

        historyWritePos = (historyWritePos + 1) & HISTORY_SIZE_MINUS_ONE
        eventsWritten++
      }

      this.historyGeneratedUntilCycle = cycle
    }

    historyArray[HISTORY_WRITE_POS_OFFSET] = historyWritePos as f32
  }

  private processAudio(length: i32): void {
    if (this.bytecode$ === 0 || this.history$ === 0) return

    const bytecodeArray = changetype<StaticArray<f32>>(this.bytecode$)
    const historyArray = changetype<StaticArray<f32>>(this.history$)
    const bytecodeBase = ARRAY_HEADER_SIZE
    const opLength = i32(bytecodeArray[bytecodeBase])
    if (opLength <= 0) return

    const windowStart = globalSampleCount
    const windowEnd = windowStart + length

    // Zero trig outputs (vel/val are written for active voices below; inactive voices get zeroed there).
    const bytes: usize = (length << 2) as usize
    for (let v: i32 = 0; v < SEQ_VOICES; v++) {
      memory.fill(this.outTrig$[v], 0, bytes)
    }
    const opStart = bytecodeBase + MINI_HEADER_SIZE

    // Read events from history buffer that intersect with current window and schedule voices
    // After defragmentation, events are sequential from 0 to writePos-1, so read all slots
    let glidePrepared: bool = false
    let historyCount: i32 = i32(historyArray[HISTORY_WRITE_POS_OFFSET]) & HISTORY_SIZE_MINUS_ONE
    if (historyCount === 0) {
      // Disambiguate empty vs full buffer: a full buffer can legitimately have writePos === 0.
      const end0: i32 = i32(historyArray[HISTORY_DATA_OFFSET + 5])
      if (end0 !== 0) historyCount = HISTORY_SIZE
    }
    for (let n: i32 = 0; n < historyCount; n++) {
      const historyIdx: i32 = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const opIndex: i32 = i32(historyArray[historyIdx + 0])
      const voiceIndexHist: i32 = i32(historyArray[historyIdx + 1])
      const value: f32 = historyArray[historyIdx + 2]
      const velocity: f32 = historyArray[historyIdx + 3]
      const startSample: i32 = i32(historyArray[historyIdx + 4])
      let endSample: i32 = i32(historyArray[historyIdx + 5])

      // Skip invalid entries
      if (startSample === 0 && endSample === 0) continue

      // History stores sample positions as f32. After ~2^24 samples, f32 can no longer represent
      // single-sample deltas, so 1-sample triggers can collapse to endSample === startSample.
      // Treat those as a minimal-length trigger so they still get scheduled.
      if (endSample <= startSample) {
        endSample = startSample + 1
      }

      // Check if event intersects with current window
      if (endSample <= windowStart || startSample >= windowEnd) continue

      // Read event from bytecode
      const eventOffset = opStart + opIndex
      const opcode = i32(bytecodeArray[eventOffset])
      if (opcode !== OP_EVENT) continue

      if (value <= 0) continue

      // Schedule voice. Use (opIndex, voiceIndexHist) as the stable identifier so that
      // chord voices can be tracked consistently across events.
      if (voiceIndexHist < 0 || voiceIndexHist >= MAX_EVENT_VALUES) continue
      const eventIndex = opIndex * MAX_EVENT_VALUES + voiceIndexHist
      let voiceIndex: i32 = -1
      let reuseMode: i32 = 0 // 0 = allocate, 1 = same note already holding

      // If the regenerated event started before "now" but is still holding, try to reuse an already
      // holding voice in the same chord slot to avoid double-triggering.
      const overlapsNow = startSample < windowStart && endSample > windowStart
      if (overlapsNow) {
        const size: i32 = ARRAY_SIZE * MAX_EVENT_VALUES
        if (eventIndex >= 0 && eventIndex < size) {
          const existing: i32 = this.eventVoices[eventIndex]
          if (existing >= 0) {
            const vv = this.voices[existing]
            if (
              vv.active
              && vv.slot === voiceIndexHist
              && windowStart >= vv.triggerSample
              && windowStart < vv.holdEndSample
              && vv.baseValue === value
            ) {
              voiceIndex = existing
              reuseMode = 1
            }
          }
        }
      }

      if (voiceIndex < 0) {
        voiceIndex = this.claimVoice(eventIndex, windowStart)
      }
      const voice = this.voices[voiceIndex]
      voice.active = true
      voice.slot = voiceIndexHist

      if (reuseMode === 1) {
        // Same note already holding: avoid re-triggering. Only extend the hold if needed.
        if (endSample > voice.holdEndSample) {
          voice.holdEndSample = endSample
        }
      }
      else {
        voice.triggerSample = startSample
        voice.holdEndSample = endSample <= voice.triggerSample ? voice.triggerSample + 1 : endSample
        voice.velocity = velocity
        voice.value = value
        voice.baseValue = value
      }

      // Read glide power from the event opcode
      const eventOp = EventOp.at(changetype<usize>(bytecodeArray), eventOffset)
      const glidePower = eventOp.glide

      voice.glidePower = glidePower
      voice.glideTarget = value
      voice.glideEndSample = voice.holdEndSample

      if (glidePower !== 0.0) {
        if (!glidePrepared) {
          this.prepareGlideSuccessors(historyArray)
          glidePrepared = true
        }

        const nextStart = this.glideNextStartBySlot[n]
        if (nextStart < i32.MAX_VALUE) {
          const nextValue = this.glideNextValueBySlot[n]
          if (nextValue > 0.0) {
            voice.glideTarget = nextValue
            voice.glideEndSample = nextStart < voice.holdEndSample ? nextStart : voice.holdEndSample
          }
        }
      }
    }

    let activeCount: i32 = 0
    for (let v: i32 = 0; v < SEQ_VOICES; v++) {
      if (this.voices[v].active) activeCount++
    }

    for (let v: i32 = 0; v < SEQ_VOICES; v++) {
      const voice = this.voices[v]
      const trig$ = this.outTrig$[v]
      const vel$ = this.outVelocity$[v]
      const val$ = this.outValue$[v]
      if (!voice.active) {
        memory.fill(vel$, 0, bytes)
        memory.fill(val$, 0, bytes)
        continue
      }

      // Fill vel/val for the whole block (release tails can continue after hold ends).
      const vel: f32 = voice.velocity
      const baseValue: f32 = voice.baseValue
      let pVel$: usize = vel$
      let pVal$: usize = val$
      for (let i: i32 = 0; i < length; i++) {
        store<f32>(pVel$, vel)
        store<f32>(pVal$, baseValue)
        pVel$ += 4
        pVal$ += 4
      }

      // Trig is 1 only during the hold segment; outside is already 0.
      let holdStart: i32 = voice.triggerSample
      if (holdStart < windowStart) holdStart = windowStart
      let holdEnd: i32 = voice.holdEndSample
      if (holdEnd > windowEnd) holdEnd = windowEnd
      if (holdEnd > holdStart) {
        let pTrig$: usize = trig$ + ((holdStart - windowStart) << 2) as usize
        const n: i32 = holdEnd - holdStart
        for (let i: i32 = 0; i < n; i++) {
          store<f32>(pTrig$, 1.0)
          pTrig$ += 4
        }
      }

      // Override val during glide segment.
      const glidePower: f32 = voice.glidePower
      if (glidePower !== 0.0) {
        const triggerSample: i32 = voice.triggerSample
        const glideEndSample: i32 = voice.glideEndSample
        const span: i32 = glideEndSample - triggerSample
        if (span > 0) {
          let glideStart: i32 = triggerSample
          if (glideStart < windowStart) glideStart = windowStart
          let glideEnd: i32 = glideEndSample
          if (glideEnd > windowEnd) glideEnd = windowEnd
          if (glideEnd > glideStart) {
            const invSpan: f64 = 1.0 / f64(span)
            const a: f64 = baseValue as f64
            const b: f64 = voice.glideTarget as f64
            let absSample: i32 = glideStart
            let p$: usize = val$ + ((glideStart - windowStart) << 2) as usize
            const n: i32 = glideEnd - glideStart
            for (let i: i32 = 0; i < n; i++) {
              const t: f64 = f64(absSample - triggerSample) * invSpan
              const pCurve: f64 = applyCurve(t, glidePower as f64)
              store<f32>(p$, (a + (b - a) * pCurve) as f32)
              p$ += 4
              absSample++
            }
          }
        }
      }
    }

    // Write voice count
    if (this.outVoiceCount$ !== 0) {
      for (let i = 0; i < length; i++) {
        store<f32>(this.outVoiceCount$ + (i << 2), activeCount as f32)
      }
    }
  }

  process(_: usize, length: i32): void {
    this.generateHistory()
    this.processAudio(length)
  }
}
