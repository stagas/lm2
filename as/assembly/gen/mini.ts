import { ARRAY_HEADER_SIZE, ARRAY_SIZE, MINI_EVENT_SIZE, MINI_HEADER_SIZE, SEQ_HISTORY_SIZE,
  SEQ_VOICES } from '../constants'
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
      if (existing >= 0) return existing
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

    const array = changetype<StaticArray<f32>>(this.bytecode$)
    let historySize = i32(array[2])
    if (historySize <= 0) historySize = SEQ_HISTORY_SIZE

    const bytecodeBase = ARRAY_HEADER_SIZE
    const totalLength = array[bytecodeBase] as i32
    if (totalLength <= 0) return

    // Calculate cycle length from maximum end value of events
    let maxEnd = 0.0 as f32
    for (let i = 0; i < totalLength; i++) {
      const base = bytecodeBase + MINI_HEADER_SIZE + i * MINI_EVENT_SIZE
      const end = array[base + 1]
      if (end > maxEnd) maxEnd = end
    }
    const cycleLength = Mathf.ceil(maxEnd)
    if (cycleLength <= 0) return

    const windowStart = globalSampleCount
    const windowEnd = windowStart + length
    const secondsPerBeat = 60.0 / (bpm as f32)
    const cycleSeconds = cycleLength * secondsPerBeat
    const cycleSamples = cycleSeconds * sampleRate

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

    // Schedule events for cycles intersecting the window
    const startCycle = i32(Mathf.floor(f32((windowStart as f32) / cycleSamples)))
    const endCycle = i32(Mathf.floor(f32(((windowEnd - 1) as f32) / cycleSamples)))

    for (let cycle = startCycle; cycle <= endCycle; cycle++) {
      const cycleStartSample = i32(cycleSamples * (cycle as f32))

      for (let i = 0; i < totalLength; i++) {
        const base = bytecodeBase + MINI_HEADER_SIZE + i * MINI_EVENT_SIZE
        const start = array[base + 0]
        const end = array[base + 1]
        const value = array[base + 2]
        const velocity = array[base + 3]
        const hold = array[base + 4]
        const prob = array[base + 6]

        if (prob > 0 && this.rng.next() < prob) continue

        // Events repeat every cycle, convert event times (0 to cycleLength) to samples within the cycle
        const eventStartSample = cycleStartSample + i32(Mathf.floor((start * cycleSamples) / cycleLength as f32))
        const eventEndSample = cycleStartSample + i32(Mathf.floor((end * cycleSamples) / cycleLength as f32))
        const slotDuration = eventEndSample - eventStartSample
        const holdSamples = hold <= 0 ? 1 : i32(Mathf.round(hold * f32(slotDuration)))
        const clampedHoldSamples = holdSamples < 1 ? 1 : holdSamples
        const holdEndSample = eventStartSample + clampedHoldSamples

        if (eventEndSample <= windowStart || eventStartSample >= windowEnd) continue

        const voiceIndex = this.claimVoice(i)
        const voice = this.voices[voiceIndex]
        voice.active = true
        voice.triggerSample = eventStartSample
        voice.holdEndSample = holdEndSample <= eventStartSample ? eventStartSample + 1 : holdEndSample
        voice.velocity = velocity
        voice.value = value

        // Write to history buffer for visualization
        let writePos = array[1] as i32
        const historyOffset = 3 + writePos * 3
        array[historyOffset + 0] = (base - bytecodeBase) as f32
        array[historyOffset + 1] = eventStartSample as f32
        array[historyOffset + 2] = (voice.holdEndSample) as f32
        writePos = (writePos + 1) % historySize
        array[1] = writePos as f32
      }
    }

    let maxActive = 0
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
