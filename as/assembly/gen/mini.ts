import { ARRAY_HEADER_SIZE, ARRAY_SIZE, FUTURE_SECONDS, HISTORY_DATA_OFFSET, HISTORY_SIZE, HISTORY_SIZE_OFFSET,
  HISTORY_WRITE_POS_OFFSET, MINI_HEADER_SIZE, OP_EVENT, PAST_SECONDS, SEQ_VOICES } from '../constants'
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

  private clearFutureEvents(historyArray: StaticArray<f32>, windowStart: i32): void {
    let historySize = i32(historyArray[HISTORY_SIZE_OFFSET])
    if (historySize <= 0) historySize = HISTORY_SIZE

    for (let n = 0; n < historySize; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * 5
      const startSample = i32(historyArray[historyIdx + 3])

      // Only clear events that start well beyond the visualizer's visible window
      // This preserves events that the visualizer needs to display
      if (startSample > windowStart) {
        historyArray[historyIdx] = 0
        historyArray[historyIdx + 1] = 0
        historyArray[historyIdx + 2] = 0
        historyArray[historyIdx + 3] = 0
        historyArray[historyIdx + 4] = 0
      }
    }
  }

  private addEventToHistory(
    historyArray: StaticArray<f32>,
    slotIdx: i32,
    opIndex: i32,
    value: f32,
    velocity: f32,
    startSample: i32,
    endSample: i32,
    windowStart: i32,
    windowEnd: i32,
  ): bool {
    if (slotIdx < 0) return false

    const historyIdx = HISTORY_DATA_OFFSET + slotIdx * 5

    // Safety check: never overwrite events that are currently active
    // The slot finding methods handle finding appropriate slots to overwrite
    const existingStartSample = i32(historyArray[historyIdx + 3])
    const existingEndSample = i32(historyArray[historyIdx + 4])

    // Protect events that are currently active (have started but not ended)
    // This prevents interrupting notes that are currently playing
    if (existingEndSample > 0 && existingStartSample <= windowStart && existingEndSample > windowStart) {
      return false
    }

    // Write the event
    historyArray[historyIdx] = opIndex as f32
    historyArray[historyIdx + 1] = value as f32
    historyArray[historyIdx + 2] = velocity as f32
    historyArray[historyIdx + 3] = startSample as f32
    historyArray[historyIdx + 4] = endSample as f32

    return true
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
    windowStart: i32,
    windowEnd: i32,
    currentCycle: i32,
    cycleSamples: f32,
    event: MiniEvent,
    cycleStartSample: i32,
    cycleEndSample: i32,
    opLength: i32,
  ): i32 {
    // First, try to find existing future event with same opIndex in same cycle
    // Only if opIndex is valid in current bytecode
    let existingSlot: i32 = -1
    if (event.opIndex >= 0 && event.opIndex < opLength) {
      existingSlot = this.findExistingEventInCycle(
        historyArray,
        historyWritePos,
        historySize,
        windowStart,
        event,
        cycleStartSample,
        cycleEndSample,
      )
      if (existingSlot >= 0) return existingSlot
    }

    // Second, find empty slot - preferred since no protection issues
    existingSlot = this.findEmptySlot(historyArray, historyWritePos, historySize)
    if (existingSlot >= 0) return existingSlot

    // Third, find the oldest past event (ended longest ago) - safest to overwrite
    existingSlot = this.findDistantPastEvent(historyArray, historyWritePos, historySize, windowStart)
    if (existingSlot >= 0) return existingSlot

    // Fourth, find the farthest future event (regardless of opIndex validity)
    existingSlot = this.findDistantFutureEvent(historyArray, historyWritePos, historySize, windowStart, opLength)
    if (existingSlot >= 0) return existingSlot

    // Fifth, find any event that's not currently active (last resort)
    existingSlot = this.findAnyNonActiveEvent(historyArray, historyWritePos, historySize, windowStart)
    if (existingSlot >= 0) return existingSlot

    // Ultimate fallback: return the next write position (will overwrite whatever is there)
    return HISTORY_DATA_OFFSET + historyWritePos * 5
  }

  private findExistingEventInCycle(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
    windowStart: i32,
    event: MiniEvent,
    cycleStartSample: i32,
    cycleEndSample: i32,
  ): i32 {
    // Search backwards from write position (most recent first)
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const historyIdx = HISTORY_DATA_OFFSET + readPos * 5
      const existingOpIndex = i32(historyArray[historyIdx])
      const existingStartSample = i32(historyArray[historyIdx + 3])
      const existingEndSample = i32(historyArray[historyIdx + 4])

      // Skip invalid entries
      if (existingEndSample === 0) continue

      // Never return events that are currently active (have started but not ended)
      // But allow future events (haven't started yet) to be updated
      if (existingStartSample < windowStart && existingEndSample >= windowStart) {
        // This event has started but not ended - skip it
        continue
      }

      // Same opIndex in same cycle AND future event
      if (existingOpIndex === event.opIndex
        && existingStartSample > windowStart
        && existingStartSample >= cycleStartSample
        && existingStartSample < cycleEndSample)
      {
        return historyIdx
      }
    }
    return -1
  }

  private findAvailableSlot(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
    windowStart: i32,
    windowEnd: i32,
    currentCycle: i32,
    cycleSamples: f32,
    opLength: i32,
  ): i32 {
    let bestSlot: i32 = -1
    let bestSlotAge: i32 = -1
    let hasPastEvent: bool = false
    let attempts = 0
    let currentWritePos = historyWritePos

    while (attempts < historySize) {
      const historyIdx = HISTORY_DATA_OFFSET + currentWritePos * 5
      const existingStartSample = i32(historyArray[historyIdx + 3])
      const existingEndSample = i32(historyArray[historyIdx + 4])

      // Empty slot - use immediately
      if (existingEndSample === 0) {
        return historyIdx
      }

      // Skip current cycle events (don't overwrite events happening now)
      const existingCycle = i32(Mathf.floor(f32((existingStartSample as f32) / cycleSamples)))
      if (existingCycle === currentCycle) {
        currentWritePos = (currentWritePos + 1) % historySize
        attempts++
        continue
      }

      // Consider events that have fully ended (can be safely overwritten)
      if (existingEndSample > 0 && existingEndSample < windowStart) {
        if (!hasPastEvent) {
          if (bestSlot < 0 || existingStartSample < bestSlotAge) {
            bestSlot = historyIdx
            bestSlotAge = existingStartSample
          }
        }
      }

      // Also consider future events that haven't started yet (can be overwritten to reflect current sequence)
      if (existingEndSample > 0 && existingStartSample > windowEnd) {
        if (bestSlot < 0 || existingStartSample < bestSlotAge) {
          bestSlot = historyIdx
          bestSlotAge = existingStartSample
        }
      }

      currentWritePos = (currentWritePos + 1) % historySize
      attempts++
    }

    return bestSlot
  }

  private findEmptySlot(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
  ): i32 {
    for (let n = 0; n < historySize; n++) {
      const checkIdx = HISTORY_DATA_OFFSET + (historyWritePos + n) % historySize * 5
      const checkEndSample = i32(historyArray[checkIdx + 4])
      if (checkEndSample === 0) {
        return checkIdx
      }
    }
    return -1
  }

  private findDistantFutureEvent(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
    windowStart: i32,
    opLength: i32,
  ): i32 {
    let maxStartSample = -1
    let slotToUse = -1

    for (let n = 0; n < historySize; n++) {
      const checkIdx = HISTORY_DATA_OFFSET + (historyWritePos + n) % historySize * 5
      const checkOpIndex = i32(historyArray[checkIdx])
      const checkStartSample = i32(historyArray[checkIdx + 3])
      const checkEndSample = i32(historyArray[checkIdx + 4])

      // Future events can be overwritten (future should reflect current sequence)
      if (checkEndSample > 0 && checkStartSample > windowStart) {
        // Prefer events with invalid opIndex, but accept any future event
        const isValidCandidate = checkOpIndex < 0 || checkOpIndex >= opLength || checkStartSample > maxStartSample
        if (isValidCandidate && checkStartSample > maxStartSample) {
          maxStartSample = checkStartSample
          slotToUse = checkIdx
        }
      }
    }

    return slotToUse
  }

  private findDistantPastEvent(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
    windowStart: i32,
  ): i32 {
    // This finds the event whose end is the farthest in the past (before windowStart)
    // Useful for overwriting events that are no longer visible or relevant
    let minEndSample = i32.MAX_VALUE
    let slotToUse = -1

    for (let n = 0; n < historySize; n++) {
      const checkIdx = HISTORY_DATA_OFFSET + ((historyWritePos + n) % historySize) * 5
      const checkStartSample = i32(historyArray[checkIdx + 3])
      const checkEndSample = i32(historyArray[checkIdx + 4])

      // Only consider events that ended before the visible window
      if (checkEndSample > 0 && checkEndSample < windowStart) {
        if (checkEndSample < minEndSample) {
          minEndSample = checkEndSample
          slotToUse = checkIdx
        }
      }
    }
    return slotToUse
  }

  private findAnyNonActiveEvent(
    historyArray: StaticArray<f32>,
    historyWritePos: i32,
    historySize: i32,
    windowStart: i32,
  ): i32 {
    // Find any event that's not currently active (not overlapping with windowStart)
    // This is a last resort before overwriting at the write position
    for (let n = 0; n < historySize; n++) {
      const checkIdx = HISTORY_DATA_OFFSET + ((historyWritePos + n) % historySize) * 5
      const checkStartSample = i32(historyArray[checkIdx + 3])
      const checkEndSample = i32(historyArray[checkIdx + 4])

      // Skip invalid entries
      if (checkEndSample === 0) continue

      // Find events that are not currently active
      // An event is active if it started and hasn't ended yet
      if (!(checkStartSample <= windowStart && checkEndSample > windowStart)) {
        return checkIdx
      }
    }
    return -1
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

      // Clear all future events from the present forward so they can be regenerated
      this.clearFutureEvents(historyArray, windowStart)
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
    const targetEndSample = windowEnd + lookAheadSamples

    // Find latest event end sample to continue generating from there
    let latestEndSample = windowStart
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const historyIdx = HISTORY_DATA_OFFSET + readPos * 5
      const startSample = i32(historyArray[historyIdx + 3])
      const endSample = i32(historyArray[historyIdx + 4])
      // Only consider valid events that start after windowStart
      if (startSample > windowStart && endSample > 0 && endSample > latestEndSample) {
        latestEndSample = endSample
      }
    }

    // Start generating from the latest event end, but not before windowStart
    const generationStartSample = latestEndSample > windowStart ? latestEndSample : windowStart

    // Generate events for the current window plus lookahead
    const currentCycle = i32(Mathf.floor(f32((windowStart as f32) / cycleSamples)))
    const startCycle = currentCycle
    const endCycle = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamples)))

    // Generate and write events to history buffer
    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
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

        const cycleEndSample = cycleStartSample + i32(cycleSamples)
        const slotToUse = this.findSlotForEvent(
          historyArray,
          historyWritePos,
          historySize,
          windowStart,
          windowEnd,
          currentCycle,
          cycleSamples,
          event,
          cycleStartSample,
          cycleEndSample,
          opLength,
        )

        if (slotToUse < 0) continue // No slot available

        // Calculate slot index
        const slotIndex = (slotToUse - HISTORY_DATA_OFFSET) / 5

        // Write the event using the safe method
        if (this.addEventToHistory(
          historyArray,
          slotIndex,
          event.opIndex,
          event.value,
          event.velocity,
          event.startSample,
          event.endSample,
          windowStart,
          windowEnd,
        )) {
          // Advance write position only if write succeeded
          historyWritePos = (slotIndex + 1) % historySize
        }
      }
    }

    // Update history write position
    historyArray[HISTORY_WRITE_POS_OFFSET] = historyWritePos as f32

    // Read events from history buffer that intersect with current window and schedule voices
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const historyIdx = HISTORY_DATA_OFFSET + readPos * 5
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
