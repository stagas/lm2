import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  FUTURE_SECONDS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_WRITE_POS_OFFSET,
  MAX_EVENT_VALUES,
  MINI_HEADER_SIZE,
  OP_EVENT,
  PAST_SECONDS,
  SEQ_VOICES,
} from '../constants'
import { MiniEventBuffer, MiniEvents } from '../mini/events'
import { EventOp } from '../mini/ops'
import { Gen } from './gen'

class MiniVoice {
  active: bool = false
  triggerSample: i32 = 0
  holdEndSample: i32 = 0
  value: f32 = 0
  velocity: f32 = 0
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
    const size = ARRAY_SIZE * MAX_EVENT_VALUES
    for (let i = 0; i < size; i++) {
      this.eventVoices[i] = -1
    }
    for (let v = 0; v < SEQ_VOICES; v++) {
      this.voiceEventIndex[v] = -1
    }
  }

  private defragmentHistory(historyArray: StaticArray<f32>, windowStart: i32): void {
    const scratchHistory = this.scratchHistory
    memory.fill(changetype<usize>(scratchHistory), 0, (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4)

    // Calculate visualizer window (what the visualizer actually shows)
    const visualizerStart = windowStart - i32(<f32> PAST_SECONDS * sampleRate)

    // Clear the buffer and move preserved events to the beginning
    let newWritePos = 0

    for (let n = 0; n < HISTORY_SIZE; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const endSample = i32(historyArray[historyIdx + 5])

      // Skip invalid entries
      if (endSample === 0) continue

      const startSample = i32(historyArray[historyIdx + 4])

      // Clear present and future events (they will be regenerated)
      if (startSample >= windowStart) {
        continue
      }

      // Keep all past events (they won't be regenerated and might still be visible)
      // Only clear events that are completely in the ancient past
      const tooOld = endSample < visualizerStart
      if (tooOld) {
        continue
      }

      // Move this event to the new position at newWritePos
      const newIdx = HISTORY_DATA_OFFSET + newWritePos * HISTORY_ENTRY_SIZE
      scratchHistory[newIdx] = historyArray[historyIdx] // opIndex
      scratchHistory[newIdx + 1] = historyArray[historyIdx + 1] // voiceIndex
      scratchHistory[newIdx + 2] = historyArray[historyIdx + 2] // value
      scratchHistory[newIdx + 3] = historyArray[historyIdx + 3] // velocity
      scratchHistory[newIdx + 4] = historyArray[historyIdx + 4] // startSample
      scratchHistory[newIdx + 5] = historyArray[historyIdx + 5] // endSample
      newWritePos = (newWritePos + 1) % HISTORY_SIZE
    }

    // Update write position to point after the last valid event (clean position for writing ahead)
    scratchHistory[HISTORY_WRITE_POS_OFFSET] = newWritePos as f32

    memory.copy(
      changetype<usize>(historyArray),
      changetype<usize>(scratchHistory),
      (HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE) * 4,
    )
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

  private findSlotForEvent(
    historyWritePos: i32,
  ): i32 {
    // After defragmentation, simply write sequentially from writePos
    // If we reach the end, wrap around to 0
    const slotIndex = historyWritePos % HISTORY_SIZE
    return HISTORY_DATA_OFFSET + slotIndex * HISTORY_ENTRY_SIZE
  }

  generateHistory(): void {
    if (this.bytecode$ === 0 || this.history$ === 0) return

    const bytecodeArray = changetype<StaticArray<f32>>(this.bytecode$)
    const historyArray = changetype<StaticArray<f32>>(this.history$)
    const bytecodeBase = ARRAY_HEADER_SIZE
    const opLength = i32(bytecodeArray[bytecodeBase])
    if (opLength <= 0) return

    const windowStart = globalSampleCount

    // Check for bytecode changes by comparing version
    const currentVersion = i32(bytecodeArray[3])
    if (currentVersion !== this.lastVersion) {
      this.lastVersion = currentVersion
      this.resetVoiceMaps()

      // Defragment history buffer: place old events first, then set writePos for clean writing ahead
      this.defragmentHistory(historyArray, windowStart)
    }

    // Get history buffer info
    let historyWritePos = i32(historyArray[HISTORY_WRITE_POS_OFFSET])

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
    for (let n = 0; n < HISTORY_SIZE; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const startSample = i32(historyArray[historyIdx + 4])
      const endSample = i32(historyArray[historyIdx + 5])
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
    const maxEventsToWrite = HISTORY_SIZE
    let eventsWritten = 0

    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
      // Stop if we've written too many events
      if (eventsWritten >= maxEventsToWrite) break

      const cycleStartSample = i32(cycleSamples * (cycle as f32))

      this.eventBuffer.clear()
      this.eventEmitter.emitEvents(
        this.bytecode$,
        this.eventBuffer,
        cycleStartSample,
        cycleLength,
        cycleSamples,
        windowStart,
        targetEndSample,
      )

      // Write events to history buffer
      for (let i = 0; i < this.eventBuffer.writePos; i++) {
        const event = this.eventBuffer.events[i]
        if (!event) continue
        if (event.opIndex < 0) continue
        if (event.value <= 0) continue

        // Only write events that start at or after the current playback position
        if (event.startSample < windowStart) continue

        // Check if this event already exists (same opIndex, voiceIndex, startSample and value)
        // Search backwards from writePos, but limit search to recent events to avoid duplicates
        let alreadyExists = false
        for (let n = 0; n < HISTORY_SIZE; n++) {
          const checkPos = (historyWritePos - 1 - n + HISTORY_SIZE) % HISTORY_SIZE
          const checkIdx = HISTORY_DATA_OFFSET + checkPos * HISTORY_ENTRY_SIZE
          const existingOpIndex = i32(historyArray[checkIdx])
          const existingVoiceIndex = i32(historyArray[checkIdx + 1])
          const existingValue = historyArray[checkIdx + 2]
          const existingStartSample = i32(historyArray[checkIdx + 4])
          const existingEndSample = i32(historyArray[checkIdx + 5])

          // Skip invalid entries
          if (existingEndSample === 0) continue

          // If we find the same event (same opIndex, voiceIndex, startSample and value), skip writing
          if (
            existingOpIndex === event.opIndex
            && existingVoiceIndex === event.voiceIndex
            && existingStartSample === event.startSample
            && existingValue === event.value
          ) {
            alreadyExists = true
            break
          }
        }

        if (alreadyExists) continue

        // Get next slot (sequentially, wraps around)
        const slotToUse = this.findSlotForEvent(historyWritePos)
        const slotIndex = (slotToUse - HISTORY_DATA_OFFSET) / HISTORY_ENTRY_SIZE

        // Write the event
        const historyIdx = HISTORY_DATA_OFFSET + slotIndex * HISTORY_ENTRY_SIZE
        historyArray[historyIdx] = event.opIndex as f32
        historyArray[historyIdx + 1] = event.voiceIndex as f32
        historyArray[historyIdx + 2] = event.value
        historyArray[historyIdx + 3] = event.velocity
        historyArray[historyIdx + 4] = event.startSample as f32
        historyArray[historyIdx + 5] = event.endSample as f32

        // Advance write position (wraps around)
        historyWritePos = (slotIndex + 1) % HISTORY_SIZE
        eventsWritten++

        // Stop if we've written too many events
        if (eventsWritten >= maxEventsToWrite) break
      }

      // Stop outer loop if we've written too many events
      if (eventsWritten >= maxEventsToWrite) break
    }

    // Update history write position
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

    // Read events from history buffer that intersect with current window and schedule voices
    // After defragmentation, events are sequential from 0 to writePos-1, so read all slots
    for (let n = 0; n < HISTORY_SIZE; n++) {
      const historyIdx = HISTORY_DATA_OFFSET + n * HISTORY_ENTRY_SIZE
      const opIndex = i32(historyArray[historyIdx])
      const voiceIndexHist = i32(historyArray[historyIdx + 1])
      const startSample = i32(historyArray[historyIdx + 4])
      const endSample = i32(historyArray[historyIdx + 5])

      // Skip invalid entries
      if (startSample === 0 && endSample === 0) continue

      // Check if event intersects with current window
      if (endSample <= windowStart || startSample >= windowEnd) continue

      // Read event from bytecode
      const eventOffset = opStart + opIndex
      const opcode = i32(bytecodeArray[eventOffset])
      if (opcode !== OP_EVENT) continue

      // Use value captured in history, which already reflects chord splitting
      const value = historyArray[historyIdx + 2]
      if (value <= 0) continue

      // Use velocity captured in history, which already includes group scaling
      const velocity = historyArray[historyIdx + 3]

      // Schedule voice. Use (opIndex, voiceIndexHist) as the stable identifier so that
      // chord voices can be tracked consistently across events.
      if (voiceIndexHist < 0 || voiceIndexHist >= MAX_EVENT_VALUES) continue
      const eventIndex = opIndex * MAX_EVENT_VALUES + voiceIndexHist
      const voiceIndex = this.claimVoice(eventIndex, windowStart)
      const voice = this.voices[voiceIndex]
      voice.active = true
      voice.triggerSample = startSample
      voice.holdEndSample = endSample <= startSample ? startSample + 1 : endSample
      voice.velocity = velocity
      voice.value = value
      voice.baseValue = value

      // Read glide power from the event opcode
      const eventOp = EventOp.at(changetype<usize>(bytecodeArray), eventOffset)
      const glidePower = eventOp.glide

      voice.glidePower = glidePower
      voice.glideTarget = value
      voice.glideEndSample = voice.holdEndSample

      if (glidePower > 0.0) {
        // Find the next scheduled event for the same voiceIndex (any opIndex) with a later startSample.
        // This makes each chord voice glide to its equivalent in the next chord regardless of which
        // mini op generated it.
        let nextStart: i32 = i32.MAX_VALUE

        // First pass: find the earliest later startSample for this voiceIndex
        for (let m = 0; m < HISTORY_SIZE; m++) {
          if (m === n) continue
          const otherIdx = HISTORY_DATA_OFFSET + m * HISTORY_ENTRY_SIZE
          const otherVoiceIndex = i32(historyArray[otherIdx + 1])
          const otherStart = i32(historyArray[otherIdx + 4])
          const otherEnd = i32(historyArray[otherIdx + 5])

          if (otherStart === 0 && otherEnd === 0) continue
          if (otherVoiceIndex !== voiceIndexHist) continue
          if (otherStart <= startSample) continue

          if (otherStart < nextStart) {
            nextStart = otherStart
          }
        }

        // Second pass: among events at nextStart for this voiceIndex, pick its value
        if (nextStart < i32.MAX_VALUE) {
          // Second pass: fetch the value at (any opIndex, voiceIndexHist, nextStart)
          for (let m = 0; m < HISTORY_SIZE; m++) {
            const otherIdx = HISTORY_DATA_OFFSET + m * HISTORY_ENTRY_SIZE
            const otherVoiceIndex = i32(historyArray[otherIdx + 1])
            const otherStart = i32(historyArray[otherIdx + 4])
            const otherEnd = i32(historyArray[otherIdx + 5])

            if (otherStart === 0 && otherEnd === 0) continue
            if (otherVoiceIndex !== voiceIndexHist) continue
            if (otherStart !== nextStart) continue

            const otherValue = historyArray[otherIdx + 2]
            if (otherValue <= 0.0) continue

            voice.glideTarget = otherValue
            // Glide until the next event starts (or current hold end, whichever is earlier)
            voice.glideEndSample = nextStart < voice.holdEndSample ? nextStart : voice.holdEndSample
            break
          }
        }
      }
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

          let currentValue = voice.baseValue
          if (voice.glidePower > 0.0 && absSample >= voice.triggerSample && absSample < voice.glideEndSample) {
            const span = voice.glideEndSample - voice.triggerSample
            if (span > 0) {
              const t = f32(absSample - voice.triggerSample) / f32(span)
              const powered = Mathf.pow(t, voice.glidePower)
              currentValue = voice.baseValue + (voice.glideTarget - voice.baseValue) * powered
            }
          }

          store<f32>(val$ + (i << 2), currentValue)
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

  process(_: usize, length: i32): void {
    this.generateHistory()
    this.processAudio(length)
  }
}
