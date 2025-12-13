import { ARRAY_HEADER_SIZE, ARRAY_SIZE, FUTURE_SECONDS, HISTORY_DATA_OFFSET, HISTORY_ENTRY_SIZE, HISTORY_HEADER_SIZE,
  HISTORY_SIZE, HISTORY_SIZE_OFFSET, HISTORY_WRITE_POS_OFFSET, MINI_HEADER_SIZE, OP_EVENT, PAST_SECONDS,
  SEQ_VOICES } from '../constants'
import { MiniEventBuffer, MiniEvents } from '../mini/events'
import { MiniEvent } from '../mini/util'
import { Gen } from './gen'

class MiniVoice {
  active: bool = false
  triggerSample: i32 = 0
  holdEndSample: i32 = 0
  value: f32 = 0
  velocity: f32 = 0

  copyFrom(other: MiniVoice): void {
    this.active = other.active
    this.triggerSample = other.triggerSample
    this.holdEndSample = other.holdEndSample
    this.value = other.value
    this.velocity = other.velocity
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
  private eventVoices: StaticArray<i32> = new StaticArray<i32>(ARRAY_SIZE)
  private voiceEventIndex: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  private voiceCursor: i32 = 0
  private rng: MiniRng = new MiniRng()
  private lastBytecode$: usize = 0
  private lastVersion: i32 = -1
  private eventEmitter: MiniEvents = new MiniEvents()
  private eventBuffer: MiniEventBuffer = new MiniEventBuffer()
  private scratchHistory: StaticArray<f32> = new StaticArray<f32>(
    HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE,
  )

  constructor() {
    super()
    for (let i = 0; i < SEQ_VOICES; i++) {
      this.voices[i] = new MiniVoice()
    }
    this.resetVoiceMaps()
  }

  reset(): void {
    this.voiceCursor = 0
    this.lastBytecode$ = 0
    this.lastVersion = -1
    this.resetVoiceMaps()
    for (let i = 0; i < SEQ_VOICES; i++) {
      const voice = this.voices[i]
      voice.active = false
      voice.triggerSample = 0
      voice.holdEndSample = 0
      voice.value = 0
      voice.velocity = 0
    }
  }

  copyFrom(other: Gen): void {
    const src = other as Mini
    this.bytecode$ = src.bytecode$
    this.history$ = src.history$
    this.outVoiceCount$ = src.outVoiceCount$
    this.voiceCursor = src.voiceCursor
    this.lastBytecode$ = src.lastBytecode$

    for (let i = 0; i < SEQ_VOICES; i++) {
      this.outTrig$[i] = src.outTrig$[i]
      this.outVelocity$[i] = src.outVelocity$[i]
      this.outValue$[i] = src.outValue$[i]
      this.voices[i].copyFrom(src.voices[i])
      this.voiceEventIndex[i] = src.voiceEventIndex[i]
    }

    for (let i = 0; i < ARRAY_SIZE; i++) {
      this.eventVoices[i] = src.eventVoices[i]
    }

    this.rng.copyFrom(src.rng)
  }

  private resetVoiceMaps(): void {
    for (let i = 0; i < ARRAY_SIZE; i++) {
      this.eventVoices[i] = -1
    }
    for (let v = 0; v < SEQ_VOICES; v++) {
      this.voiceEventIndex[v] = -1
    }
  }

  private defragmentHistory(historyArray: StaticArray<f32>, windowStart: i32, windowEnd: i32): void {
    let historySize = i32(historyArray[HISTORY_SIZE_OFFSET])
    if (historySize <= 0) historySize = HISTORY_SIZE

    // Calculate past window boundary (only keep events within PAST_SECONDS)
    const pastWindowStart = windowStart - i32(<f32> PAST_SECONDS * sampleRate)

    // First, clear ALL slots in the buffer to ensure no future events remain
    for (let n = 0; n < historySize; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const startSample = i32(historyArray[historyIdx + 3])
      const endSample = i32(historyArray[historyIdx + 4])

      // Clear all future events (startSample >= windowStart)
      if (startSample >= windowStart) {
        historyArray[historyIdx] = 0
        historyArray[historyIdx + 1] = 0
        historyArray[historyIdx + 2] = 0
        historyArray[historyIdx + 3] = 0
        historyArray[historyIdx + 4] = 0
        continue
      }
    }

    // Collect all valid past events within the time window (use separate arrays for sorting)
    const startSamples: StaticArray<i32> = new StaticArray<i32>(historySize)
    const eventData: StaticArray<f32> = new StaticArray<f32>(historySize * 4) // [opIndex, value, velocity, endSample] per event
    let eventCount = 0

    for (let n = 0; n < historySize; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const endSample = i32(historyArray[historyIdx + 4])

      // Skip invalid entries
      if (endSample === 0) continue

      const startSample = i32(historyArray[historyIdx + 3])

      // We already cleared future events above, so all remaining events have startSample < windowStart
      // Keep active events (started before windowStart, may still be playing)
      // For past events (ended before windowStart), only keep those within PAST_SECONDS
      const isPastEvent = endSample < windowStart
      if (isPastEvent && startSample < pastWindowStart) {
        // Past event outside the time window - skip it
        continue
      }
      // Keep: active events (startSample < windowStart && endSample >= windowStart)
      // Keep: past events within PAST_SECONDS (startSample >= pastWindowStart && endSample < windowStart)

      startSamples[eventCount] = startSample
      const base = eventCount * 4
      eventData[base] = historyArray[historyIdx] // opIndex
      eventData[base + 1] = historyArray[historyIdx + 1] // value
      eventData[base + 2] = historyArray[historyIdx + 2] // velocity
      eventData[base + 3] = historyArray[historyIdx + 4] // endSample
      eventCount++
    }

    // Sort events by startSample (simple insertion sort)
    for (let i = 1; i < eventCount; i++) {
      const startSample = startSamples[i]
      const base = i * 4
      let j = i - 1
      while (j >= 0 && startSamples[j] > startSample) {
        // Swap startSamples
        const tempStart = startSamples[j]
        startSamples[j] = startSamples[j + 1]
        startSamples[j + 1] = tempStart
        // Swap eventData
        for (let k = 0; k < 4; k++) {
          const temp = eventData[j * 4 + k]
          eventData[j * 4 + k] = eventData[(j + 1) * 4 + k]
          eventData[(j + 1) * 4 + k] = temp
        }
        j--
      }
    }

    // Clear scratch buffer
    for (let i = 0; i < HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE; i++) {
      this.scratchHistory[i] = 0
    }

    // Copy sorted events to scratch buffer sequentially
    let newWritePos = 0
    for (let i = 0; i < eventCount; i++) {
      const scratchIdx = HISTORY_DATA_OFFSET + newWritePos * HISTORY_ENTRY_SIZE
      const base = i * 4

      this.scratchHistory[scratchIdx] = eventData[base] // opIndex
      this.scratchHistory[scratchIdx + 1] = eventData[base + 1] // value
      this.scratchHistory[scratchIdx + 2] = eventData[base + 2] // velocity
      this.scratchHistory[scratchIdx + 3] = startSamples[i] as f32 // startSample
      this.scratchHistory[scratchIdx + 4] = eventData[base + 3] // endSample

      newWritePos++
      if (newWritePos >= historySize) break
    }

    // Clear all slots beyond newWritePos to ensure no future events remain
    for (let n = newWritePos; n < historySize; n++) {
      const scratchIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      this.scratchHistory[scratchIdx] = 0
      this.scratchHistory[scratchIdx + 1] = 0
      this.scratchHistory[scratchIdx + 2] = 0
      this.scratchHistory[scratchIdx + 3] = 0
      this.scratchHistory[scratchIdx + 4] = 0
    }

    // Copy scratch buffer back to history buffer
    for (let i = 0; i < HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE; i++) {
      historyArray[i] = this.scratchHistory[i]
    }

    // Update write position to point after the last valid event (clean position for writing ahead)
    // This ensures writePos is reset to only point to preserved events
    historyArray[HISTORY_WRITE_POS_OFFSET] = newWritePos as f32
    historyArray[HISTORY_SIZE_OFFSET] = historySize as f32
  }

  private allocateVoice(): i32 {
    const start = this.voiceCursor
    for (let i = 0; i < SEQ_VOICES; i++) {
      const v = (start + i) % SEQ_VOICES
      if (!this.voices[v].active) {
        this.voiceCursor = (v + 1) % SEQ_VOICES
        return v
      }
    }
    const v = this.voiceCursor
    this.voiceCursor = (this.voiceCursor + 1) % SEQ_VOICES
    return v
  }

  private claimVoice(eventIndex: i32): i32 {
    if (eventIndex >= 0 && eventIndex < ARRAY_SIZE) {
      const existing = this.eventVoices[eventIndex]
      if (existing >= 0) {
        return existing
      }
    }

    const voiceIndex = this.allocateVoice()
    const prevEvent = this.voiceEventIndex[voiceIndex]
    if (prevEvent >= 0 && prevEvent < ARRAY_SIZE) {
      this.eventVoices[prevEvent] = -1
    }
    this.voiceEventIndex[voiceIndex] = eventIndex
    if (eventIndex >= 0 && eventIndex < ARRAY_SIZE) {
      this.eventVoices[eventIndex] = voiceIndex
    }
    return voiceIndex
  }

  private findSlotForEvent(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
  ): i32 {
    // After defragmentation, simply write sequentially from writePos
    // If we reach the end, wrap around to 0
    const slotIndex = historyWritePos % historySize
    return HISTORY_DATA_OFFSET + slotIndex * HISTORY_ENTRY_SIZE
  }

  process(_: usize, length: i32): void {
    if (this.bytecode$ === 0 || this.history$ === 0) return

    const bytecodeArray = changetype<StaticArray<f32>>(this.bytecode$)
    const historyArray = changetype<StaticArray<f32>>(this.history$)
    const bytecodeBase = ARRAY_HEADER_SIZE
    const opLength = i32(bytecodeArray[bytecodeBase])
    if (opLength <= 0) return

    const windowStart = globalSampleCount
    const windowEnd = windowStart + length

    // Get history buffer info
    let historyWritePos = i32(historyArray[HISTORY_WRITE_POS_OFFSET])
    let historySize = i32(historyArray[HISTORY_SIZE_OFFSET])
    if (historySize <= 0) historySize = HISTORY_SIZE

    // Check for bytecode changes by comparing version
    const currentVersion = i32(bytecodeArray[3])
    if (currentVersion !== this.lastVersion) {
      this.lastVersion = currentVersion
      this.resetVoiceMaps()

      // Defragment history buffer: place old events first, then set writePos for clean writing ahead
      this.defragmentHistory(historyArray, windowStart, windowEnd)
    }

    // Zero outputs
    for (let v = 0; v < SEQ_VOICES; v++) {
      const trig$ = this.outTrig$[v]
      const vel$ = this.outVelocity$[v]
      const val$ = this.outValue$[v]
      for (let i = 0; i < length; i++) {
        store<f32>(trig$ + (i << 2), 0)
        store<f32>(vel$ + (i << 2), 0)
        store<f32>(val$ + (i << 2), 0)
      }
    }
    const opStart = bytecodeBase + MINI_HEADER_SIZE

    // Generate events for current window and future windows (lookahead)
    const cycleLength = 1.0 as f32
    const secondsPerBeat = 60.0 / bpm
    const cycleSeconds = cycleLength * secondsPerBeat
    const cycleSamples = (cycleSeconds * sampleRate) as f32
    const lookAheadSamples = i32(<f32> FUTURE_SECONDS * sampleRate)

    // Limit generation to visible window: from windowStart to windowStart + FUTURE_SECONDS
    // Don't generate beyond what the visualizer needs
    const targetEndSample = windowStart + lookAheadSamples

    // Find latest event end sample to continue generating from there
    // After defragmentation, events are sequential, so read all slots
    let latestEndSample = windowStart
    for (let n = 0; n < historySize; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const startSample = i32(historyArray[historyIdx + 3])
      const endSample = i32(historyArray[historyIdx + 4])
      // Only consider valid events that start after windowStart
      if (startSample > windowStart && endSample > 0 && endSample > latestEndSample) {
        latestEndSample = endSample
      }
    }

    // Start generating from the latest event end, but not before windowStart
    const generationStartSample = latestEndSample > windowStart ? latestEndSample : windowStart

    // Generate events for the visible window only (windowStart to windowStart + FUTURE_SECONDS)
    const currentCycle = i32(Mathf.floor(f32((windowStart as f32) / cycleSamples)))
    const startCycle = currentCycle
    const endCycle = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamples)))

    // Generate and write events to history buffer
    // Stop if we've written too many events (leave some space)
    const maxEventsToWrite = historySize - 32 // Leave some buffer space
    let eventsWritten = 0

    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
      // Stop if we've written too many events
      if (eventsWritten >= maxEventsToWrite) break

      const cycleStartSample = i32(cycleSamples * (cycle as f32))
      const cycleWindowStart = cycle === currentCycle ? generationStartSample : cycleStartSample
      const cycleWindowEnd = cycleStartSample + i32(cycleSamples)

      this.eventBuffer.clear()
      this.eventEmitter.emitEvents(
        this.bytecode$,
        this.eventBuffer,
        cycleStartSample,
        cycleLength,
        cycleSamples,
        cycleWindowStart,
        cycleWindowEnd,
      )

      // Write events to history buffer
      for (let i = 0; i < this.eventBuffer.writePos; i++) {
        const event = this.eventBuffer.events[i]
        if (!event) continue
        if (event.opIndex < 0) continue
        if (event.value <= 0) continue

        // Only write events that start at or after the current playback position
        if (event.startSample < windowStart) continue

        // Check if this event already exists (same opIndex and startSample)
        // Search backwards from writePos, but limit search to recent events to avoid duplicates
        let alreadyExists = false
        const searchLimit = 64 // Only check recent 64 events to avoid performance issues
        for (let n = 0; n < searchLimit && n < historySize; n++) {
          const checkPos = (historyWritePos - 1 - n + historySize) % historySize
          const checkIdx = HISTORY_DATA_OFFSET + checkPos * HISTORY_ENTRY_SIZE
          const existingOpIndex = i32(historyArray[checkIdx])
          const existingStartSample = i32(historyArray[checkIdx + 3])
          const existingEndSample = i32(historyArray[checkIdx + 4])

          // Skip invalid entries
          if (existingEndSample === 0) continue

          // If we find the same event (same opIndex and startSample), skip writing
          if (existingOpIndex === event.opIndex && existingStartSample === event.startSample) {
            alreadyExists = true
            break
          }
        }

        if (alreadyExists) continue

        // Get next slot (sequentially, wraps around)
        const slotToUse = this.findSlotForEvent(historyArray, historyWritePos, historySize)
        const slotIndex = (slotToUse - HISTORY_DATA_OFFSET) / HISTORY_ENTRY_SIZE

        // Write the event
        const historyIdx = HISTORY_DATA_OFFSET + slotIndex * HISTORY_ENTRY_SIZE
        historyArray[historyIdx] = event.opIndex as f32
        historyArray[historyIdx + 1] = event.value
        historyArray[historyIdx + 2] = event.velocity
        historyArray[historyIdx + 3] = event.startSample as f32
        historyArray[historyIdx + 4] = event.endSample as f32

        // Advance write position (wraps around)
        historyWritePos = (slotIndex + 1) % historySize
        eventsWritten++

        // Stop if we've written too many events
        if (eventsWritten >= maxEventsToWrite) break
      }

      // Stop outer loop if we've written too many events
      if (eventsWritten >= maxEventsToWrite) break
    }

    // Update history write position
    historyArray[HISTORY_WRITE_POS_OFFSET] = historyWritePos as f32

    // Read events from history buffer that intersect with current window and schedule voices
    // After defragmentation, events are sequential from 0 to writePos-1, so read all slots
    for (let n = 0; n < historySize; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const opIndex = i32(historyArray[historyIdx])
      const startSample = i32(historyArray[historyIdx + 3])
      const endSample = i32(historyArray[historyIdx + 4])

      // Skip invalid entries
      if (startSample === 0 && endSample === 0) continue

      // Check if event intersects with current window
      if (endSample <= windowStart || startSample >= windowEnd) continue

      // Read event value from bytecode
      const eventOffset = opStart + opIndex
      const opcode = i32(bytecodeArray[eventOffset])
      if (opcode !== OP_EVENT) continue

      const valueCount = i32(bytecodeArray[eventOffset + 1])
      if (valueCount <= 0) continue

      const value = bytecodeArray[eventOffset + 7]
      if (value <= 0) continue

      const velocity = bytecodeArray[eventOffset + 2]

      // Schedule voice
      const eventIndex = ((opIndex + MINI_HEADER_SIZE) << 8) | (n & 0xFF)
      const voiceIndex = this.claimVoice(eventIndex)
      const voice = this.voices[voiceIndex]
      voice.active = true
      voice.triggerSample = startSample
      voice.holdEndSample = endSample <= startSample ? startSample + 1 : endSample
      voice.velocity = velocity
      voice.value = value
    }

    let maxActive = 0
    let activeVoiceCount = 0
    for (let v = 0; v < SEQ_VOICES; v++) {
      if (this.voices[v].active) activeVoiceCount++
    }
    for (let i = 0; i < length; i++) {
      const absSample = windowStart + i
      let activeNow = 0

      for (let v = 0; v < SEQ_VOICES; v++) {
        const voice = this.voices[v]
        const trig$ = this.outTrig$[v]
        const vel$ = this.outVelocity$[v]
        const val$ = this.outValue$[v]

        if (voice.active) {
          activeNow++
          const inHold = absSample >= voice.triggerSample && absSample < voice.holdEndSample
          store<f32>(trig$ + (i << 2), inHold ? 1 : 0)
          store<f32>(vel$ + (i << 2), voice.velocity)
          store<f32>(val$ + (i << 2), voice.value)
        }
      }

      if (activeNow > maxActive) maxActive = activeNow
    }

    // Write voice count
    if (this.outVoiceCount$ !== 0) {
      for (let i = 0; i < length; i++) {
        store<f32>(this.outVoiceCount$ + (i << 2), maxActive as f32)
      }
    }
  }
}
