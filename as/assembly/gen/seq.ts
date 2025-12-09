import { ARRAY_HEADER_SIZE, SEQ_HISTORY_SIZE, SEQ_VOICES } from '../constants'
import { SeqOp } from '../shared'
import { Gen } from './gen'

class Voice {
  active: bool = false
  triggerSample: i32 = -1
  endSample: i32 = -1
  currentValue: f32 = 0
  targetValue: f32 = 0
  glideRate: f32 = 1
  glidePower: f32 = 0
  velocity: f32 = 0
  triggerFired: bool = false
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
  slotCount: f32 = 0 // Effective slot count (includes repeat multiplier for angle brackets)
  actualSlotCount: i32 = 0 // Actual number of bytecode slots (for wrapping)
  repeatIndex: i32 = 0
  repeatCount: i32 = 0
  isRepeatMode: bool = false // True if *N (repeat within slot), false if /N (spread across cycles)
  speed: f32 = 1 // Speed factor for parent slot advancement
  startTime: f64 = 0
  slotDuration: f64 = 0
  velocity: f32 = 1
  offset: f32 = 0
  jitter: f32 = 0
  prob: f32 = 1
  // Event-level repeat tracking (for dynamic voice allocation)
  eventRepeatIndex: i32 = 0 // Current repeat of the event (0-indexed)
  eventRepeatCount: i32 = 0 // Total repeats for current event
  eventStartPc: i32 = 0 // PC position where current event started
  eventSlotCount: f32 = 0 // Slot count for current event
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
  private cycleStartTime: f64 = 0
  private cycleDurationSeconds: f64 = 0

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
    this.cycleStartTime = 0
    this.cycleDurationSeconds = 0

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

  setSeed(seed: u32): void {
    this.rng.setSeed(seed)
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
    // For square brackets: cycleDuration is in bars (0.25 = 1 beat = 1 cycle = 1 second at 60 BPM)
    // For angle brackets: cycleDuration is in beats (based on first child's length)
    let cycleDuration = 0.25 // Default 1 beat (1 cycle = 1 second at 60 BPM)
    let cycleSpeed: f32 = 1.0
    let isSquare = 0
    if (arrayLength >= 9) {
      const op = array[ARRAY_HEADER_SIZE] as i32
      if (op === SeqOp.Cycle) {
        const cycleLength = array[ARRAY_HEADER_SIZE + 1] as i32
        cycleSpeed = array[ARRAY_HEADER_SIZE + 2]
        isSquare = array[ARRAY_HEADER_SIZE + 8] as i32
        if (isSquare === 1) {
          cycleDuration = 0.25 // Square bracket: 1 beat = 0.25 bars (1 cycle = 1 second at 60 BPM)
        }
        else {
          // Angle bracket: cycle duration is based on first child's length (in beats)
          // Peek at first child to get its slot count
          let firstChildSlotCount: f64 = 1.0
          const slotsStartPc = ARRAY_HEADER_SIZE + 9
          if (slotsStartPc < arrayLength + ARRAY_HEADER_SIZE) {
            const firstOp = array[slotsStartPc] as i32
            if (firstOp === SeqOp.Value) {
              // Value layout: op, value, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
              firstChildSlotCount = array[slotsStartPc + 4] as f64
            }
            else if (firstOp === SeqOp.Rest) {
              firstChildSlotCount = array[slotsStartPc + 1] as f64
            }
            else if (firstOp === SeqOp.Chord) {
              // Chord layout: op, chordLength, notes..., strum, velocity, hold, slotCount, repeatCount, ...
              const chordLength = array[slotsStartPc + 1] as i32
              firstChildSlotCount = array[slotsStartPc + 2 + chordLength + 3] as f64
            }
            else if (firstOp === SeqOp.Cycle) {
              const nestedCycleLength = array[slotsStartPc + 1] as i32
              firstChildSlotCount = nestedCycleLength as f64
            }
          }
          cycleDuration = firstChildSlotCount // In beats
        }
      }
    }

    // Convert cycle duration to beats: square brackets are in bars (multiply by 4), angle brackets are already in beats
    const cycleDurationBeats = isSquare === 1 ? cycleDuration * 4.0 : cycleDuration
    const cycleSeconds = cycleDurationBeats * secondsPerBeat / (cycleSpeed as f64)
    const cycleSamples = (cycleSeconds * (sampleRate as f64)) as i32

    for (let i = 0; i < length; i++) {
      this.currentSampleCount = localSampleCount

      // Detect cycle wrap using time-based tracking (handles BPM changes correctly)
      // When BPM changes, cycleSeconds changes, but we use the duration from when the cycle started
      const timeSinceCycleStart = this.time - this.cycleStartTime

      // Use the cycle duration from when this cycle started (cycleDurationSeconds)
      // If this is the first cycle, use current cycleSeconds
      const currentCycleDuration = this.cycleDurationSeconds > 0 ? this.cycleDurationSeconds : cycleSeconds

      // Process events at current time
      while (this.stack.length > 0 && this.nextEventTime <= this.time + deltaTime * 0.5) {
        this.advanceVM(array, arrayLength, secondsPerBeat)
      }

      // Check if we've completed a cycle OR if this is the first sample (stack empty, time is 0)
      const isFirstSample = this.stack.length === 0 && this.time === 0 && this.cycleDurationSeconds === 0
      if (isFirstSample || timeSinceCycleStart >= currentCycleDuration) {
        // Update last latch's end sample before resetting
        if (this.lastLatchHistoryPos >= 0) {
          this.updateHistoryEndSample(array, this.lastLatchHistoryPos, this.currentSampleCount)
        }

        // Increment cycle count for density calculations
        this.cycleCount++

        // Reset for new cycle (but keep RNG advancing for varied probability)
        // Reset both time and cycleStartTime to 0 to keep them in sync
        this.time = 0
        this.cycleStartTime = 0
        this.cycleDurationSeconds = cycleSeconds
        this.stack = []
        this.lastLatchVoice = -1
        this.lastLatchHistoryPos = -1
        this.nextEventTime = 0

        // Don't deactivate voices on cycle wrap - they stay active until replaced
        // This ensures velocity persists between cycles (hold only affects trigger, not voice lifetime)

        // Initialize root frame
        if (arrayLength >= 1) {
          const op = array[ARRAY_HEADER_SIZE] as i32
          if (op === SeqOp.Cycle) {
            // Check root cycle density (skip first cycle, play on 2nd, 4th, 6th...)
            const density = array[ARRAY_HEADER_SIZE + 4]
            let densityTriggered = true
            if (density < 1.0 && density > 0) {
              const interval = Mathf.round(1.0 / density) as i32
              // cycleCount is 1-indexed (1, 2, 3...), skip 1, play on 2, 4, 6...
              densityTriggered = (this.cycleCount > 0) && ((this.cycleCount % interval) == 0)
            }

            // Check root cycle probability
            const prob = array[ARRAY_HEADER_SIZE + 7]
            const probTriggered = this.rng.next() < prob

            if (densityTriggered && probTriggered) {
              // Initialize cycle duration and start time on first cycle
              if (this.cycleDurationSeconds === 0) {
                this.cycleDurationSeconds = cycleSeconds
                this.cycleStartTime = 0
              }

              const frame = new Frame()
              frame.pcStart = ARRAY_HEADER_SIZE + 9 // Start of slots
              frame.pc = frame.pcStart
              frame.slotIndex = 0
              frame.slotCount = array[ARRAY_HEADER_SIZE + 1]
              frame.repeatIndex = 0
              frame.repeatCount = Mathf.max(1, Mathf.round(array[ARRAY_HEADER_SIZE + 3])) as i32
              frame.speed = array[ARRAY_HEADER_SIZE + 2] // Store speed for parent slot advancement
              frame.startTime = 0
              // slotDuration accounts for speed - faster cycles have shorter slot durations
              // Use cycleSeconds (already converted to seconds) divided by slot count and repeat count
              frame.slotDuration = cycleSeconds / (frame.slotCount as f64) / (frame.repeatCount as f64)
              frame.velocity = 1.0
              frame.offset = 0
              frame.jitter = 0
              frame.prob = 1.0
              this.stack.push(frame)
              // Calculate next event time immediately after pushing frame
              this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
            }
          }
        }
      }

      // Update voices
      for (let v = 0; v < SEQ_VOICES; v++) {
        const voice = this.voices[v]
        const voiceTrig$ = this.outTrig$[v] + i * 4

        if (voice.active) {
          // Trigger is 1 only on triggerSample, then goes to 0
          // For hold > 0, trigger stays high until endSample
          // Special handling: if triggerSample is in the past, fire once immediately
          if (voice.endSample < 0) {
            // No hold: single-sample trigger pulse
            if (this.currentSampleCount === voice.triggerSample) {
              store<f32>(voiceTrig$, 1.0)
              voice.triggerFired = true
            }
            else if (this.currentSampleCount > voice.triggerSample && !voice.triggerFired) {
              // Trigger was scheduled in the past but hasn't fired yet - fire now
              store<f32>(voiceTrig$, 1.0)
              voice.triggerFired = true
            }
            else {
              store<f32>(voiceTrig$, 0.0)
            }
          }
          else {
            // With hold: trigger stays high from triggerSample to endSample
            if (this.currentSampleCount >= voice.triggerSample && this.currentSampleCount < voice.endSample) {
              store<f32>(voiceTrig$, 1.0)
              voice.triggerFired = true
            }
            else {
              store<f32>(voiceTrig$, 0.0)
            }
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
      // For spread mode (square bracket with repeatCount <= slotCount and repeatCount > 1), we spread children across cycles
      // Normal mode: repeatCount == 1 (no spread modifier)
      // Repeat mode (*N): repeatCount > 1 but isRepeatMode is true - play all slots repeatCount times within one parent slot
      const isSpreadMode = !frame.isRepeatMode && f32(frame.repeatCount) <= frame.slotCount && frame.slotCount > 0
        && frame.repeatCount > 1

      if (isSpreadMode) {
        // Spread mode: play multiple slots per repeat cycle
        // childrenPerCycle = slotCount / repeatCount (e.g., 4 children / 2 cycles = 2 per cycle)
        // On repeatIndex K, play slots from K * childrenPerCycle to (K+1) * childrenPerCycle - 1
        const childrenPerCycle = frame.slotCount / (frame.repeatCount as f32)
        const startSlot = (frame.repeatIndex as f32) * childrenPerCycle
        // endSlot is exclusive: play slots from startSlot (inclusive) to endSlot (exclusive)
        const endSlot = startSlot + childrenPerCycle

        // Use a small epsilon for floating point comparison
        if (frame.slotIndex >= endSlot - 0.0001) {
          // We've played all slots for this repeat - pop frame
          // In spread mode, the cycle takes exactly 1 slot in the parent
          const slotsUsed: f32 = 1.0
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

        // For spread mode with repeat multiplier, use modulo to wrap around
        const actualSlots = frame.actualSlotCount > 0 ? frame.actualSlotCount : i32(frame.slotCount)
        const actualSlotIndex = i32(frame.slotIndex) % actualSlots

        // Position PC at the actual slot (with wrapping)
        let expectedPc = frame.pcStart
        for (let i = 0; i < actualSlotIndex; i++) {
          expectedPc += this.countSlotBytes(array, arrayLength, expectedPc, 1)
        }
        if (frame.pc !== expectedPc) {
          frame.pc = expectedPc
        }

        // If slotIndex is before startSlot, advance to startSlot
        if (frame.slotIndex < startSlot) {
          frame.slotIndex = startSlot
          const actualStart = i32(startSlot) % actualSlots
          frame.pc = frame.pcStart
          for (let i = 0; i < actualStart; i++) {
            frame.pc += this.countSlotBytes(array, arrayLength, frame.pc, 1)
          }
        }
      }
      else {
        // Normal mode: play all slots in sequence
        if (frame.slotIndex >= frame.slotCount) {
          frame.repeatIndex++
          if (frame.repeatIndex >= frame.repeatCount) {
            // Pop frame and advance parent by 1 slot (cycle takes 1 slot regardless of repeat count)
            // For *N on cycles, we repeat within the slot, not across slots
            const slotsUsed: f32 = 1.0
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
          // Reset for next repeat - rewind to start of slots and update startTime
          frame.slotIndex = 0
          frame.pc = frame.pcStart
          // Adjust startTime for the next repeat iteration
          frame.startTime += frame.slotDuration * (frame.slotCount as f64)
        }
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
        const nestedBytes = this.countSlotBytes(array, arrayLength, frame.pc, cycleLength)
        const repeatCountI = Mathf.max(1, Mathf.round(repeat)) as i32

        // Always advance parent PC past nested slots to avoid re-encountering the Cycle opcode
        // Skip nested slots in parent's PC
        frame.pc += nestedBytes

        // Apply density (deterministic: play every Nth parent cycle where N = 1/density)
        // /2 means play on 2nd, 4th, 6th parent cycle (not 1st, 3rd, 5th)
        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Mathf.round(1.0 / density) as i32
          // For root cycle children, use global cycleCount (root repeatIndex is always 0)
          // For nested cycles, use parent's repeatIndex
          if (this.stack.length === 1) {
            // cycleCount is 1-indexed (1, 2, 3...), skip 1, play on 2, 4, 6...
            densityTriggered = (this.cycleCount > 0) && ((this.cycleCount % interval) == 0)
          }
          else {
            // repeatIndex is 0-indexed, skip 0, play on 1, 3, 5...
            densityTriggered = (frame.repeatIndex % interval) == (interval - 1)
          }
        }

        // Apply prob to decide if this cycle triggers at all
        const cycleTriggered = densityTriggered && this.rng.next() < prob
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

        // For square brackets with spread cycles (/N): detect if repeatCount <= slotCount and repeatCount > 1
        // AND density is positive (spread mode uses positive density, repeat mode uses negative density)
        // This indicates spread mode where we spread children across cycles
        const isSpreadMode = isSquare === 1 && repeatCountI <= cycleLength && repeatCountI > 1 && density > 0
        // Repeat mode (*N): density is negative, meaning repeat the cycle within one parent slot
        const isRepeatMode = density < 0

        newFrame.slotCount = cycleLength as f32
        newFrame.actualSlotCount = cycleLength
        newFrame.repeatCount = repeatCountI
        newFrame.isRepeatMode = isRepeatMode

        if (isSpreadMode) {
          // Spread mode: repeatIndex tracks root cycle count (modulo repeatCount)
          // cycleCount is 1-indexed (1, 2, 3...), so use (cycleCount - 1) % repeatCount
          // This allows the spread cycle to advance across root cycles
          newFrame.repeatIndex = (this.cycleCount - 1) % repeatCountI
          // Calculate which slots to play in this cycle
          // For angle brackets with *N: density encodes the repeat multiplier
          // effectiveSlots = cycleLength * density (e.g., 3 * 2 = 6 for <c4 e4 g4>*2)
          // childrenPerCycle = effectiveSlots / repeatCount (e.g., 6 / 3 = 2)
          const repeatMultiplier = density > 0 ? density : 1.0
          const effectiveSlots = (cycleLength as f32) * repeatMultiplier
          const childrenPerCycle = effectiveSlots / (repeatCountI as f32)
          const startSlot = (newFrame.repeatIndex as f32) * childrenPerCycle
          // Store effective slots in slotCount so the frame knows how many to play
          newFrame.slotCount = effectiveSlots
          newFrame.slotIndex = startSlot
          // Skip to the PC position of the starting slot (modulo cycleLength for wrapping)
          const actualStartSlot = i32(startSlot) % cycleLength
          newFrame.pc = nestedStartPc
          for (let i = 0; i < actualStartSlot; i++) {
            newFrame.pc += this.countSlotBytes(array, arrayLength, newFrame.pc, 1)
          }
        }
        else {
          // Normal mode or Repeat mode: start at slot 0, play all slots
          newFrame.slotIndex = 0
          newFrame.repeatIndex = 0
          newFrame.pc = nestedStartPc
        }

        newFrame.speed = speed // Store speed for parent slot advancement when popping
        // Calculate start time for this nested cycle (current slot's time)
        const slotTime = frame.startTime + (frame.slotIndex as f64) * frame.slotDuration
        if (isSpreadMode) {
          // Spread mode: startTime should be the parent slot's time within the current root cycle
          // The nested cycle plays different slots in different root cycles based on repeatIndex
          // But it should start at the parent slot's time, not at time 0
          // Since root cycles reset time to 0, we calculate relative to cycle start
          newFrame.startTime = (frame.slotIndex as f64) * frame.slotDuration
        }
        else {
          // Normal mode: for cycles with repeat > 1 (repeat mode), the cycle repeats within the parent slot
          // All repeats together must fit within 1 parent slot
          // repeatIndex starts at 0 and is used to track which repeat we're on
          if (repeatCountI > 1) {
            // Start time is the parent slot's start time
            // Each iteration of the cycle (all slots) takes slotDuration * slotCount time
            // For repeatIndex 0, start at slotTime
            // For repeatIndex 1, start at slotTime + (slotCount * slotDuration)
            // etc.
            newFrame.startTime = slotTime
          }
          else {
            newFrame.startTime = slotTime
          }
        }

        // For angle brackets (isSquare = 0), calculate slot duration based on first child's length
        // For square brackets (isSquare = 1), use standard calculation
        if (isSquare === 0) {
          // Angle bracket: peek at first child to get its slot count (length in beats)
          let firstChildSlotCount: f64 = 1.0
          if (nestedStartPc < arrayLength + ARRAY_HEADER_SIZE) {
            const firstOp = array[nestedStartPc] as i32
            if (firstOp === SeqOp.Value) {
              // Value layout: op, value, velocity, hold, slotCount, ...
              firstChildSlotCount = array[nestedStartPc + 4] as f64
            }
            else if (firstOp === SeqOp.Rest) {
              firstChildSlotCount = array[nestedStartPc + 1] as f64
            }
            else if (firstOp === SeqOp.Chord) {
              // Chord layout: op, chordLength, notes..., strum, velocity, hold, slotCount, ...
              const chordLength = array[nestedStartPc + 1] as i32
              firstChildSlotCount = array[nestedStartPc + 2 + chordLength + 3] as f64
            }
            else if (firstOp === SeqOp.Cycle) {
              const nestedCycleLength = array[nestedStartPc + 1] as i32
              firstChildSlotCount = nestedCycleLength as f64
            }
          }
          // For angle brackets, each slot should be the length of one child (in beats)
          // Convert from beats to seconds: slotDuration = firstChildSlotCount * secondsPerBeat / speed
          newFrame.slotDuration = firstChildSlotCount * secondsPerBeat / (speed as f64)
        }
        else {
          // Square bracket: standard calculation
          // For spread mode (repeatCount >= slotCount), calculate based on children per cycle
          // For normal mode, each slot takes cycleDuration / slotCount
          if (isSpreadMode) {
            // Spread mode: calculate slot duration based on effective slots
            // For angle brackets with *N: effectiveSlots = cycleLength * density
            // Each slot takes parentSlotDuration / effectiveSlots_perCycle
            // effectiveSlots_perCycle = effectiveSlots / repeatCount
            // = (cycleLength * density) / repeatCount
            // For <c4 e4 g4>*2: (3 * 2) / 3 = 2 slots per cycle
            // Each slot = parentSlotDuration / 2 = 1 / 2 = 0.5 beats
            const repeatMultiplier = density > 0 ? density : 1.0
            const effectiveSlots = (cycleLength as f64) * (repeatMultiplier as f64)
            const effectiveSlotsPerCycle = effectiveSlots / (repeatCountI as f64)
            newFrame.slotDuration = frame.slotDuration / effectiveSlotsPerCycle / (speed as f64)
          }
          else if (repeatCountI > 1) {
            // Repeat mode: cycle repeats within 1 parent slot
            // Total slots = cycleLength * repeatCount, all fit within 1 parent slot
            newFrame.slotDuration = frame.slotDuration / ((cycleLength as f64) * (repeatCountI as f64)) / (speed as f64)
          }
          else {
            // Normal mode: divide parent slot duration by number of slots
            newFrame.slotDuration = frame.slotDuration / (cycleLength as f64) / (speed as f64)
          }
        }
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
        const slotCount = array[frame.pc++]
        const repeatCount = Mathf.round(array[frame.pc++]) as i32
        const density = array[frame.pc++]
        const offset = array[frame.pc++]
        const prob = array[frame.pc++]
        const eventJitter = array[frame.pc++]
        const glide = array[frame.pc++]

        // Combine frame jitter (from parent) with event jitter
        const totalJitter = Mathf.min(1.0, frame.jitter + eventJitter) as f32

        const isSpreadMode = !frame.isRepeatMode && f32(frame.repeatCount) <= frame.slotCount && frame.slotCount > 0
          && frame.repeatCount > 1

        // In spread mode, check if we're at a slot that was already played in a previous cycle
        // This happens when startSlot is fractional (e.g., 1.5) and we're processing slot 1
        if (isSpreadMode) {
          const childrenPerCycle = frame.slotCount / (frame.repeatCount as f32)
          const startSlot = (frame.repeatIndex as f32) * childrenPerCycle
          const currentSlotInt = i32(frame.slotIndex)
          const startSlotInt = i32(startSlot)
          // If we're at a fractional slot index and the integer part is less than startSlot's integer part,
          // or if we're exactly at startSlot but it's fractional, skip this slot
          if (frame.slotIndex > startSlot && currentSlotInt < startSlotInt) {
            // Skip to the next integer slot
            frame.slotIndex = (startSlotInt + 1) as f32
            frame.pc += this.countSlotBytes(array, arrayLength, frame.pc, 1)
            continue
          }
          // If we're at startSlot and it's fractional, we need to skip the integer slot that was already played
          if (frame.slotIndex === startSlot && startSlot !== (startSlotInt as f32)) {
            // startSlot is fractional, skip to the next integer slot
            frame.slotIndex = (startSlotInt + 1) as f32
            frame.pc += this.countSlotBytes(array, arrayLength, frame.pc, 1)
            continue
          }
        }

        // Initialize event-level repeat tracking on first repeat
        if (frame.eventRepeatIndex === 0) {
          frame.eventStartPc = startPc
          frame.eventRepeatCount = repeatCount
          frame.eventSlotCount = slotCount
        }

        // Apply density (deterministic: play every Nth cycle where N = 1/density)
        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Mathf.round(1.0 / density) as i32
          densityTriggered = (this.cycleCount % interval) == 0
        }

        // Apply prob (only if event has its own probability modifier, and only on first repeat)
        const triggered = densityTriggered && (frame.eventRepeatIndex > 0 || prob >= 1.0 || this.rng.next() < prob)

        if (triggered) {
          // Calculate repeat interval: total duration / number of repeats
          const totalDuration = (slotCount as f64) * frame.slotDuration
          const repeatInterval = totalDuration / (repeatCount as f64)

          // Process just the current repeat
          const r = frame.eventRepeatIndex
          // With dynamic scheduling, each repeat is processed at its exact time
          // so the base offset is 0 (we're already at the right time)
          let repeatSampleOffset: i32 = 0

          // Apply jitter
          if (totalJitter > 0) {
            const maxJitterSeconds = (totalJitter as f64) * frame.slotDuration
            const maxJitterSamples = (maxJitterSeconds * (sampleRate as f64)) as i32
            const randomValue = (this.rng.next() as f64) * 2.0 - 1.0
            const jitterOffset = (randomValue * (maxJitterSamples as f64)) as i32
            repeatSampleOffset += maxJitterSamples + jitterOffset
          }

          let repeatSample = this.currentSampleCount + repeatSampleOffset
          const maxBackwardMovement = (frame.slotDuration * 2.0 * (sampleRate as f64)) as i32
          const minAllowedSample = this.currentSampleCount - maxBackwardMovement
          if (repeatSample < minAllowedSample) {
            repeatSample = minAllowedSample
          }

          const endSample = hold === 0
            ? repeatSample
            : repeatSample + (((hold * (frame.slotDuration as f32)) * (sampleRate as f32)) as i32)

          this.writeEventHistory(array, startPc - ARRAY_HEADER_SIZE, repeatSample, endSample)

          // Release previous latch voice on first repeat
          if (r === 0 && hold === 0 && this.lastLatchVoice >= 0) {
            const lastVoice = this.voices[this.lastLatchVoice]
            if (lastVoice.triggerSample < this.currentSampleCount) {
              lastVoice.active = false
            }
          }

          // Allocate voice for this repeat
          let voiceIndex = -1
          let isReusingVoice = false
          if (repeatCount === 1) {
            if (glide > 0) {
              if (this.lastLatchVoice >= 0 && this.voices[this.lastLatchVoice].active) {
                voiceIndex = this.lastLatchVoice
                isReusingVoice = true
              }
              else {
                for (let v = 0; v < SEQ_VOICES; v++) {
                  if (this.voices[v].active) {
                    voiceIndex = v
                    isReusingVoice = true
                    break
                  }
                }
              }
            }
            else {
              for (let v = 0; v < SEQ_VOICES; v++) {
                if (this.voices[v].active && this.voices[v].targetValue === value) {
                  voiceIndex = v
                  isReusingVoice = true
                  break
                }
              }
            }
          }
          if (voiceIndex < 0) {
            voiceIndex = this.allocateVoice()
          }

          if (voiceIndex >= 0) {
            const voice = this.voices[voiceIndex]
            voice.triggerFired = false

            if (r > 0 || isReusingVoice) {
              voice.endSample = this.currentSampleCount
            }

            voice.velocity = frame.velocity * velocity
            voice.targetValue = value
            voice.glidePower = glide

            if (glide > 0 && voice.currentValue > 0) {
              const glideDuration = hold > 0 ? (hold * (frame.slotDuration as f32)) : (frame.slotDuration as f32)
              const glideSamples = Mathf.max(1, glideDuration * (sampleRate as f32))
              voice.glideRate = 1.0 / glideSamples
            }
            else {
              voice.currentValue = value
              voice.glideRate = 1.0
            }

            voice.active = true

            if (r > 0 || isReusingVoice) {
              const minTriggerSample = this.currentSampleCount + 1
              voice.triggerSample = repeatSample > minTriggerSample ? repeatSample : minTriggerSample
              voice.endSample = hold === 0
                ? -1
                : (voice.triggerSample + (((hold * (frame.slotDuration as f32)) * (sampleRate as f32)) as i32))
            }
            else {
              voice.triggerSample = repeatSample
              voice.endSample = hold === 0 ? -1 : endSample
            }

            if ((hold === 0 || glide > 0) && repeatCount === 1) {
              this.lastLatchVoice = voiceIndex
            }
          }

          // Check if more repeats remain
          frame.eventRepeatIndex++
          if (frame.eventRepeatIndex < repeatCount) {
            // More repeats to come - reset PC to re-read event, set next time, return
            frame.pc = frame.eventStartPc
            const nextRepeatTime = repeatInterval * (frame.eventRepeatIndex as f64)
            const nextRepeatSeconds = frame.startTime + (frame.slotIndex as f64) * frame.slotDuration + nextRepeatTime
            this.nextEventTime = nextRepeatSeconds
            return
          }

          // All repeats done - reset event repeat tracking
          frame.eventRepeatIndex = 0
        }
        else {
          // Not triggered - reset event repeat tracking
          frame.eventRepeatIndex = 0
        }

        // Advance slot by slotCount
        frame.slotIndex += slotCount

        // For spread mode, check if we've reached the end slot immediately after incrementing
        // (isSpreadMode is already declared above in this block)
        if (isSpreadMode) {
          const childrenPerCycle = frame.slotCount / (frame.repeatCount as f32)
          const startSlot = (frame.repeatIndex as f32) * childrenPerCycle
          const endSlot = startSlot + childrenPerCycle
          // Use a small epsilon for floating point comparison
          if (frame.slotIndex >= endSlot - 0.0001) {
            // We've played all slots for this repeat - pop frame
            const slotsUsed: f32 = 1.0
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += slotsUsed
            }
            else {
              this.nextEventTime = f64.MAX_VALUE
              return
            }
            // Continue to process parent frame
            this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
            return
          }
        }
        else if (frame.slotIndex >= frame.slotCount) {
          // Check if we need to reset for next repeat (normal/repeat mode)
          frame.repeatIndex++
          if (frame.repeatIndex >= frame.repeatCount) {
            // Pop frame and advance parent by 1 slot
            const slotsUsed: f32 = 1.0
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += slotsUsed
            }
            else {
              this.nextEventTime = f64.MAX_VALUE
              return
            }
            this.calculateNextEventTime(array, arrayLength, secondsPerBeat)
            return
          }
          // Reset for next repeat
          frame.slotIndex = 0
          frame.pc = frame.pcStart
          frame.startTime += frame.slotDuration * (frame.slotCount as f64)
        }

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
        const notesStart = frame.pc
        frame.pc += chordLength // Skip past notes to read modifiers

        const strum = array[frame.pc++]
        const velocity = array[frame.pc++]
        const hold = array[frame.pc++]
        const slotCount = array[frame.pc++]
        const repeatCount = Mathf.round(array[frame.pc++]) as i32
        const density = array[frame.pc++]
        const offset = array[frame.pc++]
        const prob = array[frame.pc++]
        const eventJitter = array[frame.pc++]
        const glide = array[frame.pc++]

        const totalJitter = Mathf.min(1.0, frame.jitter + eventJitter) as f32

        // Initialize event-level repeat tracking on first repeat
        if (frame.eventRepeatIndex === 0) {
          frame.eventStartPc = startPc
          frame.eventRepeatCount = repeatCount
          frame.eventSlotCount = slotCount
        }

        // Apply density
        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Mathf.round(1.0 / density) as i32
          densityTriggered = (this.cycleCount % interval) == 0
        }

        // Apply prob (only on first repeat)
        const triggered = densityTriggered && (frame.eventRepeatIndex > 0 || prob >= 1.0 || this.rng.next() < prob)

        if (triggered) {
          const totalDuration = (slotCount as f64) * frame.slotDuration
          const repeatInterval = totalDuration / (repeatCount as f64)

          // Process just the current repeat
          const r = frame.eventRepeatIndex
          // With dynamic scheduling, each repeat is processed at its exact time
          // so the base offset is 0 (we're already at the right time)
          let repeatSampleOffset: i32 = 0

          // Apply jitter
          if (totalJitter > 0) {
            const maxJitterSeconds = (totalJitter as f64) * frame.slotDuration
            const maxJitterSamples = (maxJitterSeconds * (sampleRate as f64)) as i32
            const randomValue = (this.rng.next() as f64) * 2.0 - 1.0
            const jitterOffset = (randomValue * (maxJitterSamples as f64)) as i32
            repeatSampleOffset += maxJitterSamples + jitterOffset
          }

          let repeatSample = this.currentSampleCount + repeatSampleOffset
          const maxBackwardMovement = (frame.slotDuration * 2.0 * (sampleRate as f64)) as i32
          const minAllowedSample = this.currentSampleCount - maxBackwardMovement
          if (repeatSample < minAllowedSample) {
            repeatSample = minAllowedSample
          }

          const strumDelaySamples = ((strum as f64) * frame.slotDuration * (sampleRate as f64)) as i32

          // Trigger each note in the chord for this repeat only
          for (let n: i32 = 0; n < chordLength; n++) {
            const noteValue = array[notesStart + n]
            const noteSample = repeatSample + n * strumDelaySamples

            const endSample = hold === 0
              ? noteSample
              : noteSample + (((hold * (frame.slotDuration as f32)) * (sampleRate as f32)) as i32)

            this.writeEventHistory(array, startPc - ARRAY_HEADER_SIZE, noteSample, endSample)

            const voiceIndex = this.allocateVoice()

            if (voiceIndex >= 0) {
              const voice = this.voices[voiceIndex]
              voice.triggerFired = false

              if (r > 0) {
                voice.endSample = this.currentSampleCount
              }

              voice.velocity = frame.velocity * velocity
              voice.targetValue = noteValue
              voice.glidePower = glide

              if (glide > 0 && voice.currentValue > 0) {
                const glideDuration = hold > 0 ? (hold * (frame.slotDuration as f32)) : (frame.slotDuration as f32)
                const glideSamples = Mathf.max(1, glideDuration * (sampleRate as f32))
                voice.glideRate = 1.0 / glideSamples
              }
              else {
                voice.currentValue = noteValue
                voice.glideRate = 1.0
              }

              voice.active = true

              if (r > 0) {
                const minTriggerSample = this.currentSampleCount + 1
                voice.triggerSample = noteSample > minTriggerSample ? noteSample : minTriggerSample
                voice.endSample = hold === 0
                  ? -1
                  : (voice.triggerSample + (((hold * (frame.slotDuration as f32)) * (sampleRate as f32)) as i32))
              }
              else {
                voice.triggerSample = noteSample
                voice.endSample = hold === 0 ? -1 : endSample
              }
            }
          }

          // Check if more repeats remain
          frame.eventRepeatIndex++
          if (frame.eventRepeatIndex < repeatCount) {
            // More repeats to come - reset PC to re-read event, set next time, return
            frame.pc = frame.eventStartPc
            const nextRepeatTime = repeatInterval * (frame.eventRepeatIndex as f64)
            const nextRepeatSeconds = frame.startTime + (frame.slotIndex as f64) * frame.slotDuration + nextRepeatTime
            this.nextEventTime = nextRepeatSeconds
            return
          }

          // All repeats done - reset event repeat tracking
          frame.eventRepeatIndex = 0
        }
        else {
          // Not triggered - reset event repeat tracking
          frame.eventRepeatIndex = 0
        }

        frame.slotIndex += slotCount
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

    // Check if this is spread mode
    const isSpreadMode = !frame.isRepeatMode && f32(frame.repeatCount) <= frame.slotCount && frame.slotCount > 0
      && frame.repeatCount > 1

    // Calculate base time for next event
    // slotDuration is in seconds, startTime is in seconds, so eventTime is in seconds
    // this.time is also in seconds, so nextEventTime should be in seconds (no conversion needed)
    let slotTime: f64
    if (isSpreadMode) {
      // Spread mode: calculate time based on relative slot position within current cycle's slots
      // slotIndex is absolute (e.g., 2 for cycle 2), but timing should be relative to startSlot
      const childrenPerCycle = frame.slotCount / (frame.repeatCount as f32)
      const startSlot = (frame.repeatIndex as f32) * childrenPerCycle
      const relativeSlotIndex = frame.slotIndex - startSlot
      slotTime = frame.startTime + (relativeSlotIndex as f64) * frame.slotDuration
    }
    else {
      // Normal mode: standard calculation
      // For root cycle, startTime is 0 and time is relative to cycle start
      slotTime = frame.startTime + (frame.slotIndex as f64) * frame.slotDuration
    }

    // Peek ahead to check if the next event has an offset or jitter
    // This allows backward offsets/jitter to schedule events earlier than their slot time
    let eventOffset: f32 = 0
    let eventJitter: f32 = 0
    if (frame.pc < arrayLength + ARRAY_HEADER_SIZE) {
      const op = array[frame.pc] as i32
      if (op === SeqOp.Value && frame.pc + 9 < arrayLength + ARRAY_HEADER_SIZE) {
        // Value layout: op, value, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
        eventOffset = array[frame.pc + 7] as f32
        eventJitter = array[frame.pc + 9] as f32
      }
      else if (op === SeqOp.Chord && frame.pc + 2 < arrayLength + ARRAY_HEADER_SIZE) {
        // Chord layout: op, chordLength, notes..., strum, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
        const chordLength = array[frame.pc + 1] as i32
        const offsetPos = frame.pc + 2 + chordLength + 6 // skip notes + strum + velocity + hold + slotCount + repeatCount + density
        const jitterPos = frame.pc + 2 + chordLength + 8 // skip notes + strum + velocity + hold + slotCount + repeatCount + density + offset + prob
        if (offsetPos < arrayLength + ARRAY_HEADER_SIZE) {
          eventOffset = array[offsetPos] as f32
        }
        if (jitterPos < arrayLength + ARRAY_HEADER_SIZE) {
          eventJitter = array[jitterPos] as f32
        }
      }
    }

    // Apply combined offset (frame offset + event offset)
    const totalOffset = frame.offset + eventOffset
    const offsetTime = (totalOffset as f64) * frame.slotDuration

    // Also account for potential backward jitter by processing earlier
    // This ensures we have time to schedule events that jitter backwards
    const totalJitter = Mathf.min(1.0, frame.jitter + eventJitter) as f32
    const maxJitterTime = (totalJitter as f64) * frame.slotDuration

    // Make nextEventTime relative to cycle start and include offset
    // Subtract max jitter to process early enough for backward jitter
    this.nextEventTime = this.cycleStartTime + slotTime + offsetTime - maxJitterTime
  }

  // Debug methods
  getCycleCount(): i32 {
    return this.cycleCount
  }

  getStackLength(): i32 {
    return this.stack.length
  }

  getNextEventTime(): f64 {
    return this.nextEventTime
  }

  getTime(): f64 {
    return this.time
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
        pc += 10 // value, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
      }
      else if (op === SeqOp.Rest) {
        pc += 1
      }
      else if (op === SeqOp.Chord) {
        const chordLength = array[pc++] as i32
        pc += chordLength + 10 // notes + strum, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
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

    // Steal the oldest triggered voice that has already fired
    // Don't steal voices scheduled for current or future samples
    let oldestVoice = -1
    let oldestSample = i32.MAX_VALUE
    for (let v = 0; v < SEQ_VOICES; v++) {
      // Only consider voices that have already triggered (past samples)
      if (this.voices[v].triggerSample < this.currentSampleCount
        && this.voices[v].triggerSample < oldestSample)
      {
        oldestSample = this.voices[v].triggerSample
        oldestVoice = v
      }
    }

    // If found a past voice, steal it
    if (oldestVoice >= 0) {
      return oldestVoice
    }

    // No past voice found - all voices are scheduled for future samples
    // Steal the LATEST scheduled voice (farthest in future) so earlier notes play first
    let latestVoice = 0
    let latestSample = this.voices[0].triggerSample
    for (let v = 1; v < SEQ_VOICES; v++) {
      if (this.voices[v].triggerSample > latestSample) {
        latestSample = this.voices[v].triggerSample
        latestVoice = v
      }
    }

    return latestVoice
  }
}
