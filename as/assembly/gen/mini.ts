import { ARRAY_HEADER_SIZE, ARRAY_SIZE, MINI_HEADER_SIZE, OP_EVENT, SEQ_HISTORY_SIZE, SEQ_VOICES } from '../constants'
import { MiniEventBuffer, MiniEvents } from '../mini/events'
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

  process(_: usize, length: i32): void {
    if (this.bytecode$ === 0) return

    if (this.bytecode$ !== this.lastBytecode$) {
      this.lastBytecode$ = this.bytecode$
      this.resetVoiceMaps()
    }

    const bytecodeArray = changetype<StaticArray<f32>>(this.bytecode$)
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

    // Get history buffer info
    let historyWritePos = i32(bytecodeArray[1])
    let historySize = i32(bytecodeArray[2])
    if (historySize <= 0) historySize = SEQ_HISTORY_SIZE
    const historyBase = 3
    const opStart = bytecodeBase + MINI_HEADER_SIZE

    // Generate events for current window and future windows (lookahead)
    // This makes the history buffer the single source of truth
    // Note: Mini.process() is only called during active playback (worklet returns early when stopped)
    const cycleLength = 1.0 as f32
    const secondsPerBeat = 60.0 / bpm
    const cycleSeconds = cycleLength * secondsPerBeat
    const cycleSamples = (cycleSeconds * sampleRate) as f32
    const lookAheadSeconds = 16.0 as f32
    const lookAheadSamples = i32(lookAheadSeconds * sampleRate)
    const targetEndSample = windowEnd + lookAheadSamples

    // Find latest event in history to determine where to continue generating
    let latestSample = windowStart
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const historyIdx = readPos * 3
      const endSample = i32(bytecodeArray[historyBase + historyIdx + 2])
      if (endSample > latestSample) {
        latestSample = endSample
      }
    }

    // Generate events from after latestSample to targetEndSample
    const startCycle = i32(Mathf.ceil(f32((latestSample as f32) / cycleSamples)))
    const endCycle = i32(Mathf.ceil(f32((targetEndSample as f32) / cycleSamples)))

    // Generate and write events to history buffer
    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
      const cycleStartSample = i32(cycleSamples * (cycle as f32))
      const cycleWindowStart = cycleStartSample
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

      // Write events to history buffer (ring buffer)
      // Only write to empty slots or slots with future events (don't overwrite past events)
      for (let i = 0; i < this.eventBuffer.writePos; i++) {
        const event = this.eventBuffer.events[i]
        if (!event) continue
        if (event.opIndex < MINI_HEADER_SIZE) continue
        if (event.value <= 0) continue

        // Find next available slot (empty or with future event that we can overwrite)
        let attempts = 0
        while (attempts < historySize) {
          const historyIdx = historyWritePos * 3
          const existingStartSample = i32(bytecodeArray[historyBase + historyIdx + 1])
          const existingEndSample = i32(bytecodeArray[historyBase + historyIdx + 2])

          // Slot is empty or contains an event that has already ended (can overwrite)
          // Don't overwrite events that haven't ended yet (they might still be playing)
          if (existingEndSample === 0 || existingEndSample < windowStart) {
            bytecodeArray[historyBase + historyIdx] = (event.opIndex - MINI_HEADER_SIZE) as f32
            bytecodeArray[historyBase + historyIdx + 1] = event.startSample as f32
            bytecodeArray[historyBase + historyIdx + 2] = event.endSample as f32
            historyWritePos = (historyWritePos + 1) % historySize
            break
          }

          // Slot has an event that hasn't ended yet, try next slot
          historyWritePos = (historyWritePos + 1) % historySize
          attempts++
        }
      }
    }

    // Update history write position
    bytecodeArray[1] = historyWritePos as f32

    // Read events from history buffer that intersect with current window and schedule voices
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const historyIdx = readPos * 3
      const opIndex = i32(bytecodeArray[historyBase + historyIdx])
      const startSample = i32(bytecodeArray[historyBase + historyIdx + 1])
      const endSample = i32(bytecodeArray[historyBase + historyIdx + 2])

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
