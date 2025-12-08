import { ARRAY_HEADER_SIZE, SEQ_HISTORY_SIZE, SEQ_VOICES } from '../constants'
import { SeqOp } from '../shared'
import { Gen } from './gen'

class Voice {
  active: bool = false
  releaseTime: f64 = 0
  currentValue: f32 = 0
  targetValue: f32 = 0
  glideRate: f32 = 1
  glidePower: f32 = 0
  velocity: f32 = 0
}

class RNG {
  private state: u32 = 1234567890

  setSeed(seed: u32): void {
    this.state = seed
  }

  next(): f32 {
    this.state = (this.state * 1664525 + 1013904223) as u32
    return (this.state as f32) / (u32.MAX_VALUE as f32)
  }
}

class Frame {
  pc: i32 = 0
  pcStart: i32 = 0 // Start of slots for rewinding
  slotIndex: f32 = 0 // Float to support fractional slots (e.g., *2 = 0.5 slots)
  slotCount: f32 = 0
  repeatIndex: i32 = 0
  repeatCount: i32 = 0
  speed: f32 = 1 // Speed factor for parent slot advancement
  startTime: f64 = 0
  slotDuration: f64 = 0
  velocity: f32 = 1
  offset: f32 = 0
  jitter: f32 = 0
  prob: f32 = 1
}

export class Seq extends Gen {
  bytecode$: usize = 0
  outVoiceCount$: usize = 0
  outTrig$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outVelocity$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outValue$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)

  private time: f64 = 0
  private rng: RNG = new RNG()
  private voices: StaticArray<Voice> = new StaticArray<Voice>(SEQ_VOICES)
  private stack: Frame[] = []
  private lastLatchVoice: i32 = -1
  private nextEventTime: f64 = 0
  private currentSampleCount: i32 = 0
  private lastLatchHistoryPos: i32 = -1
  private cycleCount: i32 = 0

  constructor() {
    super()
    for (let i = 0; i < SEQ_VOICES; i++) {
      this.voices[i] = new Voice()
    }
  }

  reset(): void {
    this.time = 0
    this.stack = []
    this.lastLatchVoice = -1
    this.nextEventTime = 0
    this.lastLatchHistoryPos = -1
    this.cycleCount = 0

    for (let v = 0; v < SEQ_VOICES; v++) {
      this.voices[v].active = false
    }

    // Reset the history ring buffer
    if (this.bytecode$ !== 0) {
      const array = changetype<StaticArray<f32>>(this.bytecode$)
      array[1] = 0 // history write position
      array[2] = SEQ_HISTORY_SIZE as f32
      // Clear history entries
      for (let i = 0; i < SEQ_HISTORY_SIZE; i++) {
        const offset = 3 + i * 3
        array[offset] = 0 // bytecodePos
        array[offset + 1] = 0 // startSample
        array[offset + 2] = 0 // endSample
      }
    }

    this.rng.setSeed(1234567890)
  }

  private writeEventHistory(array: StaticArray<f32>, bytecodePos: i32, startSample: i32, endSample: i32): i32 {
    const writePos = array[1] as i32
    const historyOffset = 3 + writePos * 3
    array[historyOffset] = bytecodePos as f32
    array[historyOffset + 1] = startSample as f32
    array[historyOffset + 2] = endSample as f32
    array[1] = ((writePos + 1) % SEQ_HISTORY_SIZE) as f32
    return writePos
  }

  private updateHistoryEndSample(array: StaticArray<f32>, historyPos: i32, endSample: i32): void {
    if (historyPos >= 0 && historyPos < SEQ_HISTORY_SIZE) {
      const historyOffset = 3 + historyPos * 3
      array[historyOffset + 2] = endSample as f32
    }
  }

  process(out$: usize, length: i32): void {
    if (this.bytecode$ === 0) return

    let maxActiveVoices = 0
    const array = changetype<StaticArray<f32>>(this.bytecode$)
    const arrayLength = array[0] as i32
    const secondsPerBeat = 60.0 / (bpm as f64)
    const deltaTime = 1.0 / (sampleRate as f64)

    let localSampleCount = globalSampleCount

    // Calculate cycle duration
    let cycleDuration = 4.0 // Default 1 bar = 4 beats
    let cycleSpeed: f32 = 1.0
    if (arrayLength >= 9) {
      const op = array[ARRAY_HEADER_SIZE] as i32
      if (op === SeqOp.Cycle) {
        const cycleLength = array[ARRAY_HEADER_SIZE + 1] as i32
        cycleSpeed = array[ARRAY_HEADER_SIZE + 2]
        const isSquare = array[ARRAY_HEADER_SIZE + 8] as i32
        cycleDuration = isSquare === 1 ? 4.0 : (cycleLength as f64)
      }
    }

    const cycleSeconds = cycleDuration * secondsPerBeat / (cycleSpeed as f64)
    const cycleSamples = (cycleSeconds * (sampleRate as f64)) as i32

    for (let i = 0; i < length; i++) {
      this.currentSampleCount = localSampleCount

      // Detect cycle wrap
      const prevSample = localSampleCount - 1
      const prevCycle = prevSample >= 0 ? (prevSample / cycleSamples) : -1
      const currentCycle = localSampleCount / cycleSamples

      if (currentCycle > prevCycle) {
        // Update last latch's end sample before resetting
        if (this.lastLatchHistoryPos >= 0) {
          this.updateHistoryEndSample(array, this.lastLatchHistoryPos, this.currentSampleCount)
        }

        // Increment cycle count for density calculations
        this.cycleCount++

        // Reset for new cycle (but keep RNG advancing for varied probability)
        this.time = 0
        this.stack = []
        this.lastLatchVoice = -1
        this.lastLatchHistoryPos = -1
        this.nextEventTime = 0

        for (let v = 0; v < SEQ_VOICES; v++) {
          this.voices[v].active = false
        }

        // Initialize root frame
        if (arrayLength >= 1) {
          const op = array[ARRAY_HEADER_SIZE] as i32
          if (op === SeqOp.Cycle) {
            const frame = new Frame()
            frame.pcStart = ARRAY_HEADER_SIZE + 9 // Start of slots
            frame.pc = frame.pcStart
            frame.slotIndex = 0
            frame.slotCount = array[ARRAY_HEADER_SIZE + 1]
            frame.repeatIndex = 0
            frame.repeatCount = Mathf.max(1, Mathf.round(array[ARRAY_HEADER_SIZE + 3])) as i32
            frame.startTime = 0
            // slotDuration accounts for speed - faster cycles have shorter slot durations
            frame.slotDuration = cycleDuration / (frame.slotCount as f64) / (frame.repeatCount as f64)
              / (cycleSpeed as f64)
            frame.velocity = 1.0
            frame.offset = 0
            frame.jitter = 0
            frame.prob = 1.0
            this.stack.push(frame)
          }
        }
      }

      // Process events at current time
      while (this.stack.length > 0 && this.nextEventTime <= this.time + deltaTime * 0.5) {
        this.advanceVM(array, arrayLength, secondsPerBeat)
      }

      // Update voices
      for (let v = 0; v < SEQ_VOICES; v++) {
        const voice = this.voices[v]
        const voiceTrig$ = this.outTrig$[v] + i * 4

        if (voice.active) {
          if (this.time < voice.releaseTime) {
            store<f32>(voiceTrig$, 1.0)
          }
          else {
            store<f32>(voiceTrig$, 0.0)
            voice.active = false
          }

          if (voice.currentValue !== voice.targetValue) {
            // If glide is disabled, jump immediately
            if (voice.glidePower === 0) {
              voice.currentValue = voice.targetValue
            }
            else {
              const distance = voice.targetValue - voice.currentValue
              if (voice.glidePower !== 1.0) {
                const t = Mathf.min(1.0, voice.glideRate * (sampleRate as f32) * (deltaTime as f32))
                const curvedT = Mathf.pow(t, voice.glidePower)
                voice.currentValue += distance * curvedT
              }
              else {
                voice.currentValue += distance * voice.glideRate
              }

              if (Mathf.abs(voice.currentValue - voice.targetValue) < 0.01) {
                voice.currentValue = voice.targetValue
              }
            }
          }

          store<f32>(this.outValue$[v] + i * 4, voice.currentValue)
          store<f32>(this.outVelocity$[v] + i * 4, voice.velocity)
        }
        else {
          store<f32>(voiceTrig$, 0.0)
          store<f32>(this.outValue$[v] + i * 4, voice.currentValue)
          store<f32>(this.outVelocity$[v] + i * 4, 0.0)
        }
      }

      this.time += deltaTime

      // Track maximum active voices
      let activeCount = 0
      for (let v = 0; v < SEQ_VOICES; v++) {
        if (this.voices[v].active) activeCount++
      }
      if (activeCount > maxActiveVoices) {
        maxActiveVoices = activeCount
      }

      localSampleCount++
    }

    // Write voice count
    for (let i = 0; i < length; i++) {
      store<f32>(this.outVoiceCount$ + i * 4, maxActiveVoices as f32)
    }
  }

  private advanceVM(array: StaticArray<f32>, arrayLength: i32, secondsPerBeat: f64): void {
    while (this.stack.length > 0) {
      let frame = this.stack[this.stack.length - 1]

      // Check if frame is complete
      if (frame.slotIndex >= frame.slotCount) {
        frame.repeatIndex++
        if (frame.repeatIndex >= frame.repeatCount) {
          // Pop frame and advance parent by repeatCount/speed slots
          // Speed < 1 means slower, takes more parent slots
          const slotsUsed = (frame.repeatCount as f32) / frame.speed
          this.stack.pop()
          if (this.stack.length > 0) {
            const parentFrame = this.stack[this.stack.length - 1]
            parentFrame.slotIndex += slotsUsed
          }
          else {
            this.nextEventTime = f64.MAX_VALUE
            return
          }
          continue
        }
        // Reset for next repeat - rewind to start of slots
        frame.slotIndex = 0
        frame.pc = frame.pcStart
      }

      // Check if PC is past valid data (can happen after nested cycle)
      // In this case, frame is complete, will be handled on next iteration
      if (frame.pc >= arrayLength + ARRAY_HEADER_SIZE) {
        frame.slotIndex = frame.slotCount // Mark slots as complete
        continue
      }

      const startPc = frame.pc
      const op = array[frame.pc] as i32
      frame.pc++

      if (op === SeqOp.Cycle) {
        // Read nested cycle parameters
        const cycleLength = array[frame.pc++] as i32
        const speed = array[frame.pc++]
        const repeat = array[frame.pc++]
        const density = array[frame.pc++]
        const offset = array[frame.pc++]
        const jitter = array[frame.pc++]
        const prob = array[frame.pc++]
        const isSquare = array[frame.pc++] as i32

        const nestedStartPc = frame.pc

        // Skip nested slots in parent's PC
        frame.pc += this.countSlotBytes(array, arrayLength, frame.pc, cycleLength)

        // Apply prob to decide if this cycle triggers at all
        const cycleTriggered = this.rng.next() < prob
        const repeatCountI = Mathf.max(1, Mathf.round(repeat)) as i32
        const repeatCountF = repeatCountI as f32

        if (!cycleTriggered) {
          // Skip this cycle - advance by repeatCount slots (same as if it played)
          frame.slotIndex += repeatCountF
          this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
          return
        }

        // Push new frame for nested cycle
        const newFrame = new Frame()
        newFrame.pcStart = nestedStartPc
        newFrame.pc = nestedStartPc
        newFrame.slotIndex = 0
        newFrame.slotCount = cycleLength as f32
        newFrame.repeatIndex = 0
        newFrame.repeatCount = repeatCountI
        newFrame.speed = speed // Store speed for parent slot advancement when popping
        // Calculate start time for this nested cycle (current slot's time)
        const slotTime = frame.startTime + (frame.slotIndex as f64) * frame.slotDuration
        const repeatOffset = (frame.repeatIndex as f64) * (frame.slotCount as f64) * frame.slotDuration
        newFrame.startTime = slotTime + repeatOffset
        // slotDuration accounts for nested cycle's speed - faster cycles have shorter slot durations
        newFrame.slotDuration = frame.slotDuration / (cycleLength as f64) / (speed as f64)
        newFrame.velocity = frame.velocity
        newFrame.offset = frame.offset + offset
        newFrame.jitter = Mathf.min(1.0, frame.jitter + jitter)
        newFrame.prob = 1.0 // Prob is not inherited - only applies to this cycle's trigger

        this.stack.push(newFrame)

        // Don't increment parent slotIndex - that happens when nested pops
        // Calculate next event time (will be from nested frame)
        this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
        return
      }

      if (op === SeqOp.Value) {
        const value = array[frame.pc++]
        const velocity = array[frame.pc++]
        const hold = array[frame.pc++]
        const repeat = array[frame.pc++]
        const density = array[frame.pc++]
        const offset = array[frame.pc++]
        const prob = array[frame.pc++]
        const jitter = array[frame.pc++]
        const glide = array[frame.pc++]

        // Apply density (deterministic: play every Nth cycle where N = 1/density)
        // /2 means play on 2nd, 4th, 6th cycle (not 1st, 3rd, 5th)
        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Mathf.round(1.0 / density) as i32
          densityTriggered = (this.cycleCount % interval) == 0
        }

        // Apply prob (only if event has its own probability modifier)
        const triggered = densityTriggered && (prob >= 1.0 || this.rng.next() < prob)

        if (triggered) {
          // Slot count from repeat field (can be fractional with *2 = 0.5)
          const slotCount = repeat as f64
          // slotDuration is in beats, convert to seconds
          const autoHoldDuration = slotCount * frame.slotDuration * secondsPerBeat
          const autoHoldSamples = (autoHoldDuration * (sampleRate as f64)) as i32

          // Calculate end sample for history (start + hold duration)
          const endSample = hold === 0
            ? this.currentSampleCount + autoHoldSamples
            : this.currentSampleCount + ((hold * (sampleRate as f32)) as i32)

          // Write event to history ring buffer
          this.writeEventHistory(array, startPc - ARRAY_HEADER_SIZE, this.currentSampleCount, endSample)

          // Release previous latch voice when new event with hold=0 triggers
          if (hold === 0 && this.lastLatchVoice >= 0) {
            this.voices[this.lastLatchVoice].active = false
          }

          // Trigger voice
          const voiceIndex = this.allocateVoice()
          if (voiceIndex >= 0) {
            const voice = this.voices[voiceIndex]
            voice.velocity = frame.velocity * velocity
            voice.targetValue = value
            voice.glidePower = glide

            if (glide > 0 && voice.currentValue > 0) {
              const glideSamples = Mathf.max(1, hold * (sampleRate as f32))
              voice.glideRate = 1.0 / glideSamples
            }
            else {
              voice.currentValue = value
              voice.glideRate = 1.0
            }

            voice.active = true
            voice.releaseTime = hold === 0 ? (this.time + autoHoldDuration) : this.time + (hold as f64)

            if (hold === 0 && slotCount >= 1.0) {
              // Only use latch mode for full-slot events without explicit hold
              this.lastLatchVoice = voiceIndex
            }
          }
        }

        // Advance slot by slot count (repeat field stores slot count = repeat/speed)
        // Can be fractional (e.g., *2 = 0.5 slots)
        frame.slotIndex += repeat

        // Calculate NEXT event time
        this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
        return
      }

      if (op === SeqOp.Rest) {
        const restSlotCount = array[frame.pc++]
        this.writeEventHistory(array, startPc - ARRAY_HEADER_SIZE, this.currentSampleCount, this.currentSampleCount)
        frame.slotIndex += restSlotCount
        this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
        return
      }

      if (op === SeqOp.Chord) {
        const chordLength = array[frame.pc++] as i32
        frame.pc += chordLength // Skip notes
        // Read modifiers: strum, velocity, hold, repeat/slotCount, density, offset, prob, jitter, glide
        frame.pc++ // strum
        frame.pc++ // velocity
        frame.pc++ // hold
        const chordSlotCount = array[frame.pc++] // repeat/slotCount (can be fractional)
        frame.pc += 5 // density, offset, prob, jitter, glide
        this.writeEventHistory(array, startPc - ARRAY_HEADER_SIZE, this.currentSampleCount, this.currentSampleCount)
        frame.slotIndex += chordSlotCount
        this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
        return
      }

      frame.slotIndex++
      this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
      return
    }

    this.nextEventTime = f64.MAX_VALUE
  }

  private calculateNextEventTime(array: StaticArray<f32>, arrayLength: i32, secondsPerBeat: f64): void {
    if (this.stack.length === 0) {
      this.nextEventTime = f64.MAX_VALUE
      return
    }

    const frame = this.stack[this.stack.length - 1]

    // Calculate time for next event
    const slotTime = frame.startTime + (frame.slotIndex as f64) * frame.slotDuration
    const repeatOffset = (frame.repeatIndex as f64) * (frame.slotCount as f64) * frame.slotDuration
    const eventTime = slotTime + repeatOffset
    this.nextEventTime = eventTime * secondsPerBeat
  }

  private countSlotBytes(array: StaticArray<f32>, arrayLength: i32, startPc: i32, slotCount: i32): i32 {
    let pc = startPc
    for (let i = 0; i < slotCount; i++) {
      if (pc >= arrayLength + ARRAY_HEADER_SIZE) break

      const op = array[pc] as i32
      pc++

      if (op === SeqOp.Cycle) {
        const cycleLength = array[pc++] as i32
        pc += 7 // Skip cycle params
        pc += this.countSlotBytes(array, arrayLength, pc, cycleLength)
      }
      else if (op === SeqOp.Value) {
        pc += 9
      }
      else if (op === SeqOp.Rest) {
        pc += 1
      }
      else if (op === SeqOp.Chord) {
        const chordLength = array[pc++] as i32
        pc += chordLength + 9
      }
    }
    return pc - startPc
  }

  private allocateVoice(): i32 {
    for (let v = 0; v < SEQ_VOICES; v++) {
      if (!this.voices[v].active) {
        return v
      }
    }

    let oldestVoice = 0
    let oldestTime = this.voices[0].releaseTime
    for (let v = 1; v < SEQ_VOICES; v++) {
      if (this.voices[v].releaseTime < oldestTime) {
        oldestTime = this.voices[v].releaseTime
        oldestVoice = v
      }
    }
    return oldestVoice
  }
}
