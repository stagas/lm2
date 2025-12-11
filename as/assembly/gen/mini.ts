import { ARRAY_HEADER_SIZE, MINI_EVENT_SIZE, MINI_HEADER_SIZE, SEQ_HISTORY_SIZE, SEQ_VOICES } from '../constants'
import { Gen } from './gen'

class MiniVoice {
  active: bool = false
  triggerSample: i32 = 0
  holdEndSample: i32 = 0
  value: f32 = 0
  velocity: f32 = 0
}

class MiniRng {
  private state: u32 = 1234567890
  next(): f32 {
    this.state = (this.state * 1664525 + 1013904223) as u32
    return (this.state as f32) / (u32.MAX_VALUE as f32)
  }
}

export class Mini extends Gen {
  bytecode$: usize = 0
  outVoiceCount$: usize = 0
  outTrig$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outVelocity$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outValue$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)

  private voices: StaticArray<MiniVoice> = new StaticArray<MiniVoice>(SEQ_VOICES)
  private rng: MiniRng = new MiniRng()

  constructor() {
    super()
    for (let i = 0; i < SEQ_VOICES; i++) {
      this.voices[i] = new MiniVoice()
    }
  }

  reset(): void {
    for (let i = 0; i < SEQ_VOICES; i++) {
      const voice = this.voices[i]
      voice.active = false
      voice.triggerSample = 0
      voice.holdEndSample = 0
      voice.value = 0
      voice.velocity = 0
    }
  }

  private allocateVoice(): i32 {
    for (let v = 0; v < SEQ_VOICES; v++) {
      if (!this.voices[v].active) return v
    }
    return 0 // fall back to voice 0 if all busy
  }

  process(_: usize, length: i32): void {
    if (this.bytecode$ === 0) return

    const array = changetype<StaticArray<f32>>(this.bytecode$)
    let historySize = i32(array[2])
    if (historySize <= 0) historySize = SEQ_HISTORY_SIZE

    const bytecodeBase = ARRAY_HEADER_SIZE
    const totalLength = array[bytecodeBase] as i32
    if (totalLength <= 0) return

    const windowStart = globalSampleCount
    const windowEnd = windowStart + length
    const secondsPerBeat = 60.0 / (bpm as f32)
    const cycleSeconds = secondsPerBeat // 1 cycle = 1 bar = 1 second at 60 BPM
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
        const hold = array[base + 2]
        const velocity = array[base + 3]
        const value = array[base + 4]
        const prob = array[base + 7]

        if (prob > 0 && this.rng.next() < prob) continue

        const eventStartSample = i32(Mathf.floor(f32(start * cycleSamples))) + cycleStartSample
        const eventEndSample = i32(Mathf.floor(f32(end * cycleSamples))) + cycleStartSample
        const holdSamples = hold <= 0 ? 1 : i32(Mathf.round(f32(hold * cycleSamples)))
        const holdEndSample = eventStartSample + holdSamples

        if (eventEndSample <= windowStart || eventStartSample >= windowEnd) continue

        const voiceIndex = this.allocateVoice()
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
