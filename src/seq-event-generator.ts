import { ARRAY_HEADER_SIZE, SEQ_HISTORY_SIZE } from '../as/assembly/constants.ts'
import { SeqOp } from './bytecode.ts'

export interface ScheduledEvent {
  bytecodePos: number
  startSample: number
  endSample: number
  value: number
  velocity: number
}

interface Frame {
  pc: number
  pcStart: number
  slotIndex: number
  slotCount: number
  actualSlotCount: number
  repeatIndex: number
  repeatCount: number
  isRepeatMode: boolean
  speed: number
  startTime: number
  slotDuration: number
  velocity: number
  offset: number
  jitter: number
  prob: number
  eventRepeatIndex: number
  eventRepeatCount: number
  eventStartPc: number
  eventSlotCount: number
  isStretchedSpread: boolean
  slotTimeAccum: number
  totalSlotTime: number
  spreadSlotDuration: number
  spreadGapDuration: number
  spreadRealStart: number
  spreadRepeatIndex: number
}

class RNG {
  private state: number = 1234567890

  setSeed(seed: number): void {
    this.state = seed >>> 0
  }

  next(): number {
    this.state = (this.state * 1664525 + 1013904223) >>> 0
    return this.state / 0xFFFFFFFF
  }
}

/**
 * Unified event generator - single source of truth for sequence events
 * Ported from AssemblyScript Seq class
 */
class SeqEventGeneratorImpl {
  private bytecode: Float32Array
  private sampleRate: number
  private bpm: number
  private rng: RNG = new RNG()

  // State matching AS Seq class
  private time: number = 0
  private currentSampleCount: number = 0
  private cycleCount: number = 0
  private cycleStartTime: number = 0
  private cycleDurationSeconds: number = 0
  private nextEventTime: number = 0
  private stack: Frame[] = []

  constructor(bytecode: Float32Array, sampleRate: number, bpm: number) {
    this.bytecode = bytecode
    this.sampleRate = sampleRate
    this.bpm = bpm
    this.rng.setSeed(1234567890)
  }

  reset(): void {
    this.time = 0
    this.stack = []
    this.cycleCount = 0
    this.cycleStartTime = 0
    this.cycleDurationSeconds = 0
    this.nextEventTime = 0
    this.currentSampleCount = 0
    this.rng.setSeed(1234567890)
  }

  syncToSample(sampleCount: number): void {
    // For event generation, we always start from time 0
    // Events are generated with absolute sample times, so we can filter later
    // This ensures deterministic generation regardless of sync point
    if (this.time === 0 && this.stack.length === 0) {
      // Already at start, no sync needed
      return
    }

    // Reset to start and generate from beginning
    // The caller will filter events to the desired time range
    this.reset()
    this.time = 0
    this.currentSampleCount = 0
  }

  private getCycleDuration(): number {
    const secondsPerBeat = 60.0 / this.bpm
    const arrayLength = this.bytecode[0] as number

    let cycleDuration = 0.25
    let cycleSpeed = 1.0
    let isSquare = 0

    if (arrayLength >= 9) {
      const op = this.bytecode[ARRAY_HEADER_SIZE] as number
      if (op === SeqOp.Cycle) {
        const cycleLength = this.bytecode[ARRAY_HEADER_SIZE + 1] as number
        cycleSpeed = this.bytecode[ARRAY_HEADER_SIZE + 2]
        isSquare = this.bytecode[ARRAY_HEADER_SIZE + 8] as number
        if (isSquare === 1) {
          cycleDuration = 0.25
        }
        else {
          let firstChildSlotCount = 1.0
          const slotsStartPc = ARRAY_HEADER_SIZE + 9
          if (slotsStartPc < arrayLength + ARRAY_HEADER_SIZE) {
            const firstOp = this.bytecode[slotsStartPc] as number
            if (firstOp === SeqOp.Value) {
              firstChildSlotCount = this.bytecode[slotsStartPc + 4] as number
            }
            else if (firstOp === SeqOp.Rest) {
              firstChildSlotCount = this.bytecode[slotsStartPc + 1] as number
            }
            else if (firstOp === SeqOp.Chord) {
              const chordLength = this.bytecode[slotsStartPc + 1] as number
              firstChildSlotCount = this.bytecode[slotsStartPc + 2 + chordLength + 3] as number
            }
            else if (firstOp === SeqOp.Cycle) {
              const nestedCycleLength = this.bytecode[slotsStartPc + 1] as number
              firstChildSlotCount = nestedCycleLength as number
            }
          }
          cycleDuration = firstChildSlotCount
        }
      }
    }

    const cycleDurationBeats = isSquare === 1 ? cycleDuration * 4.0 : cycleDuration
    return cycleDurationBeats * secondsPerBeat / cycleSpeed
  }

  generateEvents(targetSample: number, filterFromSample?: number): ScheduledEvent[] {
    const events: ScheduledEvent[] = []
    const secondsPerBeat = 60.0 / this.bpm
    const deltaTime = 1.0 / this.sampleRate
    const arrayLength = this.bytecode[0] as number

    if (arrayLength <= 0) return events

    // If we're already past target, return empty
    if (this.currentSampleCount >= targetSample) {
      return events
    }

    // Calculate cycle duration (same logic as AS Seq.process)
    let cycleDuration = 0.25
    let cycleSpeed = 1.0
    let isSquare = 0
    if (arrayLength >= 9) {
      const op = this.bytecode[ARRAY_HEADER_SIZE] as number
      if (op === SeqOp.Cycle) {
        const cycleLength = this.bytecode[ARRAY_HEADER_SIZE + 1] as number
        cycleSpeed = this.bytecode[ARRAY_HEADER_SIZE + 2]
        isSquare = this.bytecode[ARRAY_HEADER_SIZE + 8] as number
        if (isSquare === 1) {
          cycleDuration = 0.25
        }
        else {
          let firstChildSlotCount = 1.0
          const slotsStartPc = ARRAY_HEADER_SIZE + 9
          if (slotsStartPc < arrayLength + ARRAY_HEADER_SIZE) {
            const firstOp = this.bytecode[slotsStartPc] as number
            if (firstOp === SeqOp.Value) {
              firstChildSlotCount = this.bytecode[slotsStartPc + 4] as number
            }
            else if (firstOp === SeqOp.Rest) {
              firstChildSlotCount = this.bytecode[slotsStartPc + 1] as number
            }
            else if (firstOp === SeqOp.Chord) {
              const chordLength = this.bytecode[slotsStartPc + 1] as number
              firstChildSlotCount = this.bytecode[slotsStartPc + 2 + chordLength + 3] as number
            }
            else if (firstOp === SeqOp.Cycle) {
              const nestedCycleLength = this.bytecode[slotsStartPc + 1] as number
              firstChildSlotCount = nestedCycleLength as number
            }
          }
          cycleDuration = firstChildSlotCount
        }
      }
    }

    const cycleDurationBeats = isSquare === 1 ? cycleDuration * 4.0 : cycleDuration
    const cycleSeconds = cycleDurationBeats * secondsPerBeat / cycleSpeed

    // Process events by jumping to event times (event-driven, not sample-by-sample)
    let iterations = 0
    const maxIterations = 200000 // Increased for longer time windows

    while (this.currentSampleCount < targetSample && iterations < maxIterations) {
      iterations++
      const currentCycleDuration = this.cycleDurationSeconds > 0 ? this.cycleDurationSeconds : cycleSeconds

      // Check if we need to start a new cycle
      const isFirstCycle = this.cycleCount === 0 && this.stack.length === 0 && this.time === 0
      const timeSinceCycleStart = this.time - this.cycleStartTime
      const cycleComplete = this.cycleDurationSeconds > 0 && timeSinceCycleStart >= currentCycleDuration - 0.0001

      if (isFirstCycle) {
        this.cycleCount++
        this.cycleStartTime = this.time
        this.cycleDurationSeconds = cycleSeconds
        this.stack = []
        this.nextEventTime = 0

        // Initialize root frame
        if (arrayLength >= 1) {
          const op = this.bytecode[ARRAY_HEADER_SIZE] as number
          if (op === SeqOp.Cycle) {
            const density = this.bytecode[ARRAY_HEADER_SIZE + 4]
            let densityTriggered = true
            if (density < 1.0 && density > 0) {
              const interval = Math.round(1.0 / density)
              densityTriggered = (this.cycleCount > 0) && ((this.cycleCount % interval) === 0)
            }

            const prob = this.bytecode[ARRAY_HEADER_SIZE + 7]
            const probTriggered = this.rng.next() < prob

            if (densityTriggered && probTriggered) {
              const frame: Frame = {
                pcStart: ARRAY_HEADER_SIZE + 9,
                pc: ARRAY_HEADER_SIZE + 9,
                slotIndex: 0,
                slotCount: this.bytecode[ARRAY_HEADER_SIZE + 1],
                actualSlotCount: 0,
                repeatIndex: 0,
                repeatCount: Math.max(1, Math.round(this.bytecode[ARRAY_HEADER_SIZE + 3])),
                isRepeatMode: false,
                speed: this.bytecode[ARRAY_HEADER_SIZE + 2],
                startTime: 0,
                slotDuration: cycleSeconds / (this.bytecode[ARRAY_HEADER_SIZE + 1] as number)
                  / (Math.max(1, Math.round(this.bytecode[ARRAY_HEADER_SIZE + 3])) as number),
                velocity: 1.0,
                offset: 0,
                jitter: 0,
                prob: 1.0,
                eventRepeatIndex: 0,
                eventRepeatCount: 0,
                eventStartPc: 0,
                eventSlotCount: 0,
                isStretchedSpread: false,
                slotTimeAccum: 0,
                totalSlotTime: 0,
                spreadSlotDuration: 0,
                spreadGapDuration: 0,
                spreadRealStart: 0,
                spreadRepeatIndex: 0,
              }
              this.stack.push(frame)
              this.calculateNextEventTime(secondsPerBeat)
            }
          }
        }
      }
      else if (cycleComplete) {
        this.cycleCount++
        this.cycleStartTime = this.time
        this.cycleDurationSeconds = cycleSeconds
        this.stack = []
        this.nextEventTime = 0

        // Re-initialize root frame for new cycle
        if (arrayLength >= 1) {
          const op = this.bytecode[ARRAY_HEADER_SIZE] as number
          if (op === SeqOp.Cycle) {
            const density = this.bytecode[ARRAY_HEADER_SIZE + 4]
            let densityTriggered = true
            if (density < 1.0 && density > 0) {
              const interval = Math.round(1.0 / density)
              densityTriggered = (this.cycleCount > 0) && ((this.cycleCount % interval) === 0)
            }

            const prob = this.bytecode[ARRAY_HEADER_SIZE + 7]
            const probTriggered = this.rng.next() < prob

            if (densityTriggered && probTriggered) {
              const frame: Frame = {
                pcStart: ARRAY_HEADER_SIZE + 9,
                pc: ARRAY_HEADER_SIZE + 9,
                slotIndex: 0,
                slotCount: this.bytecode[ARRAY_HEADER_SIZE + 1],
                actualSlotCount: 0,
                repeatIndex: 0,
                repeatCount: Math.max(1, Math.round(this.bytecode[ARRAY_HEADER_SIZE + 3])),
                isRepeatMode: false,
                speed: this.bytecode[ARRAY_HEADER_SIZE + 2],
                startTime: 0,
                slotDuration: cycleSeconds / (this.bytecode[ARRAY_HEADER_SIZE + 1] as number)
                  / (Math.max(1, Math.round(this.bytecode[ARRAY_HEADER_SIZE + 3])) as number),
                velocity: 1.0,
                offset: 0,
                jitter: 0,
                prob: 1.0,
                eventRepeatIndex: 0,
                eventRepeatCount: 0,
                eventStartPc: 0,
                eventSlotCount: 0,
                isStretchedSpread: false,
                slotTimeAccum: 0,
                totalSlotTime: 0,
                spreadSlotDuration: 0,
                spreadGapDuration: 0,
                spreadRealStart: 0,
                spreadRepeatIndex: 0,
              }
              this.stack.push(frame)
              this.calculateNextEventTime(secondsPerBeat)
            }
          }
        }
      }

      // Process events at current time
      while (this.stack.length > 0 && this.nextEventTime <= this.time + deltaTime * 0.5) {
        this.advanceVM(events, secondsPerBeat, cycleSeconds, isSquare, targetSample, filterFromSample)
      }

      // Fast-forward to next event or cycle boundary
      if (this.stack.length === 0 && this.nextEventTime === Number.MAX_VALUE) {
        // No more events, jump to next cycle
        this.time = this.cycleStartTime + currentCycleDuration
        this.currentSampleCount = Math.floor(this.time * this.sampleRate)
        continue
      }

      // Jump to next event time or cycle boundary, whichever comes first
      const nextCycleTime = this.cycleStartTime + currentCycleDuration
      const nextTime = Math.min(this.nextEventTime, nextCycleTime)

      if (nextTime > this.time + 0.0001) {
        // Jump ahead to next event/cycle
        this.time = nextTime
        this.currentSampleCount = Math.floor(this.time * this.sampleRate)
      }
      else {
        // Small advance to prevent infinite loop
        this.time += deltaTime * 10
        this.currentSampleCount = Math.floor(this.time * this.sampleRate)
      }

      if (this.currentSampleCount >= targetSample) {
        break
      }
    }

    return events
  }

  private mapSlotTimeToRealTime(
    slotTime: number,
    spreadSlotDuration: number,
    spreadGapDuration: number,
    spreadRealStart: number,
    repeatIndex: number,
  ): number {
    const slotIndex = Math.floor(slotTime / spreadSlotDuration)
    const offsetInSlot = slotTime - slotIndex * spreadSlotDuration
    const cycleOffset = slotIndex - repeatIndex
    return spreadRealStart + cycleOffset * (spreadSlotDuration + spreadGapDuration) + offsetInSlot
  }

  private countSlotBytes(startPc: number, slotCount: number): number {
    const arrayLength = this.bytecode[0] as number
    let pc = startPc
    for (let i = 0; i < slotCount; i++) {
      if (pc >= arrayLength + ARRAY_HEADER_SIZE) break

      const op = this.bytecode[pc] as number
      pc++

      if (op === SeqOp.Cycle) {
        const cycleLength = this.bytecode[pc++] as number
        pc += 7 // Skip cycle params
        pc += this.countSlotBytes(pc, cycleLength)
      }
      else if (op === SeqOp.Value) {
        pc += 10 // value, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
      }
      else if (op === SeqOp.Rest) {
        pc += 1
      }
      else if (op === SeqOp.Chord) {
        const chordLength = this.bytecode[pc++] as number
        pc += chordLength + 10 // notes + strum, velocity, hold, slotCount, repeatCount, density, offset, prob, jitter, glide
      }
    }
    return pc - startPc
  }

  private calculateNextEventTime(secondsPerBeat: number): void {
    if (this.stack.length === 0) {
      this.nextEventTime = Number.MAX_VALUE
      return
    }

    const frame = this.stack[this.stack.length - 1]
    const arrayLength = this.bytecode[0] as number
    const isSpreadMode = !frame.isRepeatMode && frame.repeatCount > 1 && frame.slotCount > 0

    let slotTime: number
    if (frame.isStretchedSpread) {
      const currentSlotTime = frame.slotTimeAccum + frame.slotIndex * frame.slotDuration
      slotTime = this.mapSlotTimeToRealTime(
        currentSlotTime,
        frame.spreadSlotDuration,
        frame.spreadGapDuration,
        frame.spreadRealStart,
        frame.spreadRepeatIndex,
      )
    }
    else if (isSpreadMode) {
      const childrenPerCycle = frame.slotCount / frame.repeatCount
      if (childrenPerCycle > 1) {
        const startSlot = frame.repeatIndex * childrenPerCycle
        const relativeSlotIndex = frame.slotIndex - startSlot
        slotTime = frame.startTime + relativeSlotIndex * frame.slotDuration
      }
      else {
        slotTime = frame.startTime
      }
    }
    else {
      slotTime = frame.startTime + frame.slotIndex * frame.slotDuration
    }

    // Peek ahead for offset/jitter
    let eventOffset = 0
    let eventJitter = 0
    if (frame.pc < arrayLength + ARRAY_HEADER_SIZE) {
      const op = this.bytecode[frame.pc] as number
      if (op === SeqOp.Value && frame.pc + 9 < arrayLength + ARRAY_HEADER_SIZE) {
        eventOffset = this.bytecode[frame.pc + 7] as number
        eventJitter = this.bytecode[frame.pc + 9] as number
      }
      else if (op === SeqOp.Chord && frame.pc + 2 < arrayLength + ARRAY_HEADER_SIZE) {
        const chordLength = this.bytecode[frame.pc + 1] as number
        const offsetPos = frame.pc + 2 + chordLength + 6
        const jitterPos = frame.pc + 2 + chordLength + 8
        if (offsetPos < arrayLength + ARRAY_HEADER_SIZE) {
          eventOffset = this.bytecode[offsetPos] as number
        }
        if (jitterPos < arrayLength + ARRAY_HEADER_SIZE) {
          eventJitter = this.bytecode[jitterPos] as number
        }
      }
    }

    const totalOffset = frame.offset + eventOffset
    const offsetTime = totalOffset * frame.slotDuration
    const totalJitter = Math.min(1.0, frame.jitter + eventJitter)
    const maxJitterTime = totalJitter * frame.slotDuration

    this.nextEventTime = this.cycleStartTime + slotTime + offsetTime - maxJitterTime
  }

  private advanceVM(
    events: ScheduledEvent[],
    secondsPerBeat: number,
    cycleSeconds: number,
    isSquare: number,
    targetSample: number,
    filterFromSample?: number,
  ): void {
    const arrayLength = this.bytecode[0] as number

    while (this.stack.length > 0) {
      const frame = this.stack[this.stack.length - 1]

      // Check if frame is complete
      const isSpreadMode = !frame.isRepeatMode && frame.repeatCount > 1 && frame.slotCount > 0
        && !frame.isStretchedSpread

      if (isSpreadMode) {
        const childrenPerCycle = frame.slotCount / frame.repeatCount
        const startSlot = frame.repeatIndex * childrenPerCycle
        const endSlot = startSlot + childrenPerCycle

        const firstIntSlot = Math.ceil(startSlot)
        const actualSlots = frame.actualSlotCount > 0 ? frame.actualSlotCount : Math.floor(frame.slotCount)
        const effectiveSlots = Math.floor(frame.slotCount)

        if (firstIntSlot >= endSlot - 0.0001 || firstIntSlot >= effectiveSlots) {
          const slotsUsed = 1.0
          this.stack.pop()
          if (this.stack.length > 0) {
            const parentFrame = this.stack[this.stack.length - 1]
            parentFrame.slotIndex += slotsUsed
          }
          else {
            this.nextEventTime = Number.MAX_VALUE
            return
          }
          continue
        }

        if (frame.slotIndex >= endSlot - 0.0001) {
          const slotsUsed = 1.0
          this.stack.pop()
          if (this.stack.length > 0) {
            const parentFrame = this.stack[this.stack.length - 1]
            parentFrame.slotIndex += slotsUsed
          }
          else {
            this.nextEventTime = Number.MAX_VALUE
            return
          }
          continue
        }

        if (frame.slotIndex < firstIntSlot) {
          frame.slotIndex = firstIntSlot
        }

        const actualSlotIndex = Math.floor(frame.slotIndex) % actualSlots
        let expectedPc = frame.pcStart
        for (let i = 0; i < actualSlotIndex; i++) {
          expectedPc += this.countSlotBytes(expectedPc, 1)
        }
        if (frame.pc !== expectedPc) {
          frame.pc = expectedPc
        }
      }
      else if (frame.isStretchedSpread) {
        // Align PC to current slot index for stretched spread
        const actualSlots = frame.actualSlotCount > 0 ? frame.actualSlotCount : Math.floor(frame.slotCount)
        const actualSlotIndex = Math.floor(frame.slotIndex) % actualSlots
        let expectedPc = frame.pcStart
        for (let i = 0; i < actualSlotIndex; i++) {
          expectedPc += this.countSlotBytes(expectedPc, 1)
        }
        if (frame.pc !== expectedPc) {
          frame.pc = expectedPc
        }
      }
      else {
        if (frame.slotIndex >= frame.slotCount) {
          frame.repeatIndex++
          if (frame.repeatIndex >= frame.repeatCount) {
            const slotsUsed = 1.0
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += slotsUsed
            }
            else {
              this.nextEventTime = Number.MAX_VALUE
              return
            }
            continue
          }
          frame.slotIndex = 0
          frame.pc = frame.pcStart
          frame.startTime += frame.slotDuration * frame.slotCount
        }
      }

      if (frame.pc >= arrayLength + ARRAY_HEADER_SIZE) {
        frame.slotIndex = frame.slotCount
        continue
      }

      const startPc = frame.pc
      const op = this.bytecode[frame.pc] as number
      frame.pc++

      if (op === SeqOp.Cycle) {
        // Read nested cycle parameters
        const cycleLength = this.bytecode[frame.pc++] as number
        const speed = this.bytecode[frame.pc++]
        const repeat = this.bytecode[frame.pc++]
        const density = this.bytecode[frame.pc++]
        const offset = this.bytecode[frame.pc++]
        const jitter = this.bytecode[frame.pc++]
        const prob = this.bytecode[frame.pc++]
        const isSquare = this.bytecode[frame.pc++] as number

        const nestedStartPc = frame.pc
        const nestedBytes = this.countSlotBytes(frame.pc, cycleLength)
        const repeatCountI = Math.max(1, Math.round(repeat))

        // Always advance parent PC past nested slots
        frame.pc += nestedBytes

        // Apply density
        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Math.round(1.0 / density)
          if (this.stack.length === 1) {
            densityTriggered = (this.cycleCount > 0) && ((this.cycleCount % interval) === 0)
          }
          else {
            densityTriggered = (frame.repeatIndex % interval) === (interval - 1)
          }
        }

        // Apply prob
        const cycleTriggered = densityTriggered && this.rng.next() < prob

        if (!cycleTriggered) {
          frame.slotIndex += repeatCountI
          this.calculateNextEventTime(secondsPerBeat)
          return
        }

        // Push new frame for nested cycle
        const newFrame: Frame = {
          pcStart: nestedStartPc,
          pc: nestedStartPc,
          slotIndex: 0,
          slotCount: cycleLength,
          actualSlotCount: cycleLength,
          repeatIndex: 0,
          repeatCount: repeatCountI,
          isRepeatMode: false,
          speed: speed,
          startTime: 0,
          slotDuration: 0,
          velocity: frame.velocity,
          offset: frame.offset + offset,
          jitter: Math.min(1.0, frame.jitter + jitter),
          prob: 1.0,
          eventRepeatIndex: 0,
          eventRepeatCount: 0,
          eventStartPc: 0,
          eventSlotCount: 0,
          isStretchedSpread: false,
          slotTimeAccum: 0,
          totalSlotTime: 0,
          spreadSlotDuration: 0,
          spreadGapDuration: 0,
          spreadRealStart: 0,
          spreadRepeatIndex: 0,
        }

        // Determine spread mode and repeat mode
        const isSpreadMode = isSquare === 1 && repeatCountI > 1 && density > 0
        const isRepeatMode = density < 0

        newFrame.isRepeatMode = isRepeatMode

        if (isSpreadMode) {
          newFrame.repeatIndex = (this.cycleCount - 1) % repeatCountI
          const repeatMultiplier = density > 0 ? density : 1.0
          const effectiveSlots = cycleLength * repeatMultiplier
          newFrame.slotCount = effectiveSlots

          if (repeatMultiplier <= 1.0) {
            // Stretched spread mode
            newFrame.isStretchedSpread = true
            newFrame.slotIndex = 0
            newFrame.pc = nestedStartPc
            const parentSlotDuration = frame.slotDuration
            newFrame.spreadSlotDuration = parentSlotDuration
            newFrame.totalSlotTime = parentSlotDuration * repeatCountI
            const parentCycleDuration = frame.slotDuration * frame.slotCount
            newFrame.spreadGapDuration = parentCycleDuration - parentSlotDuration
            // Relative to cycle start (AS behavior)
            newFrame.spreadRealStart = frame.startTime + frame.slotIndex * frame.slotDuration
            newFrame.slotTimeAccum = 0
            newFrame.spreadRepeatIndex = newFrame.repeatIndex
          }
          else {
            // Non-stretched spread
            const childrenPerCycle = effectiveSlots / repeatCountI
            const startSlot = newFrame.repeatIndex * childrenPerCycle
            newFrame.slotIndex = startSlot
            const actualStartSlot = Math.floor(startSlot) % cycleLength
            for (let i = 0; i < actualStartSlot; i++) {
              newFrame.pc += this.countSlotBytes(newFrame.pc, 1)
            }
          }
        }
        else {
          newFrame.slotIndex = 0
          newFrame.repeatIndex = 0
          newFrame.pc = nestedStartPc
        }

        // Calculate start time
        const parentIsSpreadMode = !frame.isRepeatMode && frame.repeatCount > 1 && frame.slotCount > 0
        let slotTime: number
        if (parentIsSpreadMode) {
          const parentChildrenPerCycle = frame.slotCount / frame.repeatCount
          if (parentChildrenPerCycle > 1) {
            const parentStartSlot = frame.repeatIndex * parentChildrenPerCycle
            const relativeSlotIndex = frame.slotIndex - parentStartSlot
            slotTime = frame.startTime + relativeSlotIndex * frame.slotDuration
          }
          else {
            slotTime = frame.startTime
          }
        }
        else {
          slotTime = frame.startTime + frame.slotIndex * frame.slotDuration
        }

        if (isSpreadMode) {
          if (parentIsSpreadMode) {
            const parentChildrenPerCycle = frame.slotCount / frame.repeatCount
            const parentStartSlot = frame.repeatIndex * parentChildrenPerCycle
            const relativeSlotIndex = frame.slotIndex - parentStartSlot
            newFrame.startTime = frame.startTime + relativeSlotIndex * frame.slotDuration
          }
          else {
            newFrame.startTime = frame.slotIndex * frame.slotDuration
          }
        }
        else {
          newFrame.startTime = slotTime
        }

        // Calculate slot duration
        if (isSquare === 0) {
          // Angle bracket
          let firstChildSlotCount = 1.0
          if (nestedStartPc < arrayLength + ARRAY_HEADER_SIZE) {
            const firstOp = this.bytecode[nestedStartPc] as number
            if (firstOp === SeqOp.Value) {
              firstChildSlotCount = this.bytecode[nestedStartPc + 4] as number
            }
            else if (firstOp === SeqOp.Rest) {
              firstChildSlotCount = this.bytecode[nestedStartPc + 1] as number
            }
            else if (firstOp === SeqOp.Chord) {
              const chordLength = this.bytecode[nestedStartPc + 1] as number
              firstChildSlotCount = this.bytecode[nestedStartPc + 2 + chordLength + 3] as number
            }
            else if (firstOp === SeqOp.Cycle) {
              const nestedCycleLength = this.bytecode[nestedStartPc + 1] as number
              firstChildSlotCount = nestedCycleLength as number
            }
          }
          newFrame.slotDuration = firstChildSlotCount * secondsPerBeat / speed
        }
        else {
          // Square bracket
          if (isSpreadMode) {
            const repeatMultiplier = density > 0 ? density : 1.0
            if (repeatMultiplier > 1) {
              newFrame.slotDuration = frame.slotDuration / repeatMultiplier / speed
            }
            else {
              newFrame.slotDuration = newFrame.totalSlotTime / cycleLength / speed
            }
          }
          else if (repeatCountI > 1) {
            newFrame.slotDuration = frame.slotDuration / (cycleLength * repeatCountI) / speed
          }
          else {
            newFrame.slotDuration = frame.slotDuration / cycleLength / speed
          }
        }

        // Inherit stretched spread from parent
        if (!newFrame.isStretchedSpread && frame.isStretchedSpread) {
          newFrame.isStretchedSpread = true
          newFrame.spreadSlotDuration = frame.spreadSlotDuration
          newFrame.spreadGapDuration = frame.spreadGapDuration
          newFrame.spreadRealStart = frame.spreadRealStart
          newFrame.totalSlotTime = frame.totalSlotTime
          newFrame.spreadRepeatIndex = frame.spreadRepeatIndex
          newFrame.slotTimeAccum = frame.slotTimeAccum + frame.slotIndex * frame.slotDuration
          newFrame.slotDuration = frame.slotDuration / cycleLength / speed
        }

        this.stack.push(newFrame)
        this.calculateNextEventTime(secondsPerBeat)
        return
      }

      if (op === SeqOp.Value) {
        const value = this.bytecode[frame.pc++]
        const velocity = this.bytecode[frame.pc++]
        const hold = this.bytecode[frame.pc++]
        const slotCount = this.bytecode[frame.pc++]
        const repeatCount = Math.round(this.bytecode[frame.pc++])
        const density = this.bytecode[frame.pc++]
        const offset = this.bytecode[frame.pc++]
        const prob = this.bytecode[frame.pc++]
        const eventJitter = this.bytecode[frame.pc++]
        const glide = this.bytecode[frame.pc++]

        const totalJitter = Math.min(1.0, frame.jitter + eventJitter)

        // Stretched spread mode check
        if (frame.isStretchedSpread) {
          const currentSlotTime = frame.slotTimeAccum + frame.slotIndex * frame.slotDuration
          const eventRealTime = this.mapSlotTimeToRealTime(
            currentSlotTime,
            frame.spreadSlotDuration,
            frame.spreadGapDuration,
            frame.spreadRealStart,
            frame.spreadRepeatIndex,
          )
          if (eventRealTime < frame.spreadRealStart - 0.0001) {
            frame.slotIndex += slotCount
            continue
          }
          if (eventRealTime >= frame.spreadRealStart + frame.spreadSlotDuration - 0.0001) {
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += 1.0
            }
            this.calculateNextEventTime(secondsPerBeat)
            return
          }
        }

        const isSpreadModeCheck = !frame.isRepeatMode && frame.repeatCount > 1 && frame.slotCount > 0
          && !frame.isStretchedSpread
        if (isSpreadModeCheck) {
          const childrenPerCycle = frame.slotCount / frame.repeatCount
          const startSlot = frame.repeatIndex * childrenPerCycle
          const currentSlotInt = Math.floor(frame.slotIndex)
          const startSlotInt = Math.floor(startSlot)
          if (frame.slotIndex > startSlot && currentSlotInt < startSlotInt) {
            frame.slotIndex = startSlotInt + 1
            frame.pc += this.countSlotBytes(frame.pc, 1)
            continue
          }
          if (frame.slotIndex === startSlot && startSlot !== startSlotInt) {
            frame.slotIndex = startSlotInt + 1
            frame.pc += this.countSlotBytes(frame.pc, 1)
            continue
          }
        }

        if (frame.eventRepeatIndex === 0) {
          frame.eventStartPc = startPc
          frame.eventRepeatCount = repeatCount
          frame.eventSlotCount = slotCount
        }

        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Math.round(1.0 / density)
          densityTriggered = (this.cycleCount % interval) === 0
        }

        const triggered = densityTriggered && (frame.eventRepeatIndex > 0 || prob >= 1.0 || this.rng.next() < prob)

        if (triggered) {
          const totalDuration = slotCount * frame.slotDuration
          const repeatInterval = totalDuration / repeatCount

          const r = frame.eventRepeatIndex

          // Dynamic scheduling: time has already advanced to the event
          let repeatSample = this.currentSampleCount

          // Apply jitter to the absolute time
          if (totalJitter > 0) {
            const maxJitterSeconds = totalJitter * frame.slotDuration
            const maxJitterSamples = maxJitterSeconds * this.sampleRate
            const randomValue = this.rng.next() * 2.0 - 1.0
            const jitterOffset = Math.floor(randomValue * maxJitterSamples)
            repeatSample += jitterOffset

            // Clamp to reasonable range (can move backward by up to 2 slot durations)
            const maxBackwardMovement = frame.slotDuration * 2.0 * this.sampleRate
            const minAllowedSample = this.currentSampleCount - maxBackwardMovement
            if (repeatSample < minAllowedSample) {
              repeatSample = minAllowedSample
            }
          }

          // Calculate endSample based on final repeatSample
          const endSample = hold === 0
            ? repeatSample + Math.floor(0.001 * this.sampleRate) // Very brief visual duration for hold=0 notes
            : repeatSample + Math.floor(hold * frame.slotDuration * this.sampleRate)

          // Only add events that are in the target range
          if (repeatSample < targetSample && (!filterFromSample || repeatSample >= filterFromSample)) {
            events.push({
              bytecodePos: startPc - ARRAY_HEADER_SIZE,
              startSample: repeatSample,
              endSample: endSample,
              value: value,
              velocity: frame.velocity * velocity,
            })
          }

          frame.eventRepeatIndex++
          if (frame.eventRepeatIndex < repeatCount) {
            frame.pc = frame.eventStartPc
            const nextRepeatTime = repeatInterval * frame.eventRepeatIndex
            if (frame.isStretchedSpread) {
              const nextSlotTime = frame.slotTimeAccum + frame.slotIndex * frame.slotDuration + nextRepeatTime
              this.nextEventTime = this.mapSlotTimeToRealTime(
                nextSlotTime,
                frame.spreadSlotDuration,
                frame.spreadGapDuration,
                frame.spreadRealStart,
                frame.spreadRepeatIndex,
              )
            }
            else {
              this.nextEventTime = this.cycleStartTime + frame.startTime + frame.slotIndex * frame.slotDuration
                + nextRepeatTime
            }
            return
          }

          frame.eventRepeatIndex = 0
        }
        else {
          frame.eventRepeatIndex = 0
        }

        frame.slotIndex += slotCount

        if (frame.isStretchedSpread) {
          const actualSlotCount = frame.actualSlotCount > 0 ? frame.actualSlotCount : Math.floor(frame.slotCount)
          if (frame.slotIndex >= actualSlotCount) {
            const slotsUsed = 1.0
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += slotsUsed
            }
            this.calculateNextEventTime(secondsPerBeat)
            return
          }
        }
        else if (!frame.isRepeatMode && frame.repeatCount > 1 && frame.slotCount > 0) {
          const childrenPerCycle = frame.slotCount / frame.repeatCount
          const startSlot = frame.repeatIndex * childrenPerCycle
          const endSlot = startSlot + childrenPerCycle
          if (frame.slotIndex >= endSlot - 0.0001) {
            const slotsUsed = 1.0
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += slotsUsed
            }
            this.calculateNextEventTime(secondsPerBeat)
            return
          }
        }
        else if (frame.slotIndex >= frame.slotCount) {
          frame.repeatIndex++
          if (frame.repeatIndex >= frame.repeatCount) {
            const slotsUsed = 1.0
            this.stack.pop()
            if (this.stack.length > 0) {
              const parentFrame = this.stack[this.stack.length - 1]
              parentFrame.slotIndex += slotsUsed
            }
            this.calculateNextEventTime(secondsPerBeat)
            return
          }
          frame.slotIndex = 0
          frame.pc = frame.pcStart
          frame.startTime += frame.slotDuration * frame.slotCount
        }

        this.calculateNextEventTime(secondsPerBeat)
        return
      }

      if (op === SeqOp.Rest) {
        const restSlotCount = this.bytecode[frame.pc++]
        frame.slotIndex += restSlotCount
        this.calculateNextEventTime(secondsPerBeat)
        return
      }

      if (op === SeqOp.Chord) {
        // Similar to Value but handles multiple notes
        const chordLength = this.bytecode[frame.pc++] as number
        const notesStart = frame.pc
        frame.pc += chordLength
        const strum = this.bytecode[frame.pc++]
        const velocity = this.bytecode[frame.pc++]
        const hold = this.bytecode[frame.pc++]
        const slotCount = this.bytecode[frame.pc++]
        const repeatCount = Math.round(this.bytecode[frame.pc++])
        const density = this.bytecode[frame.pc++]
        const offset = this.bytecode[frame.pc++]
        const prob = this.bytecode[frame.pc++]
        const eventJitter = this.bytecode[frame.pc++]
        const glide = this.bytecode[frame.pc++]

        const totalJitter = Math.min(1.0, frame.jitter + eventJitter)

        if (frame.isStretchedSpread) {
          const currentSlotTime = frame.slotTimeAccum + frame.slotIndex * frame.slotDuration
          const eventRealTime = this.mapSlotTimeToRealTime(
            currentSlotTime,
            frame.spreadSlotDuration,
            frame.spreadGapDuration,
            frame.spreadRealStart,
            frame.spreadRepeatIndex,
          )
          const currentSpreadStart = this.mapSlotTimeToRealTime(
            frame.slotTimeAccum,
            frame.spreadSlotDuration,
            frame.spreadGapDuration,
            frame.spreadRealStart,
            frame.spreadRepeatIndex,
          )
          const currentSpreadEnd = currentSpreadStart + frame.spreadSlotDuration
          if (eventRealTime < currentSpreadStart - 0.0001) {
            frame.slotIndex += slotCount
            continue
          }
          if (eventRealTime >= currentSpreadEnd - 0.0001) {
            this.nextEventTime = currentSpreadEnd
            return
          }
        }

        if (frame.eventRepeatIndex === 0) {
          frame.eventStartPc = startPc
          frame.eventRepeatCount = repeatCount
          frame.eventSlotCount = slotCount
        }

        let densityTriggered = true
        if (density < 1.0 && density > 0) {
          const interval = Math.round(1.0 / density)
          densityTriggered = (this.cycleCount % interval) === 0
        }

        const triggered = densityTriggered && (frame.eventRepeatIndex > 0 || prob >= 1.0 || this.rng.next() < prob)

        if (triggered) {
          const totalDuration = slotCount * frame.slotDuration
          const repeatInterval = totalDuration / repeatCount

          const r = frame.eventRepeatIndex

          // Calculate absolute time for event first
          let eventTimeSeconds: number
          // Dynamic scheduling: currentSampleCount is already at event time
          let repeatSample = this.currentSampleCount

          // Apply jitter to the absolute time
          if (totalJitter > 0) {
            const maxJitterSeconds = totalJitter * frame.slotDuration
            const maxJitterSamples = maxJitterSeconds * this.sampleRate
            const randomValue = this.rng.next() * 2.0 - 1.0
            const jitterOffset = Math.floor(randomValue * maxJitterSamples)
            repeatSample += jitterOffset

            // Clamp to reasonable range
            const maxBackwardMovement = frame.slotDuration * 2.0 * this.sampleRate
            const minAllowedSample = Math.floor(eventTimeSeconds * this.sampleRate) - maxBackwardMovement
            if (repeatSample < minAllowedSample) {
              repeatSample = minAllowedSample
            }
          }

          const strumDelaySamples = Math.floor(strum * frame.slotDuration * this.sampleRate)

          for (let n = 0; n < chordLength; n++) {
            const noteValue = this.bytecode[notesStart + n]
            const noteSample = repeatSample + n * strumDelaySamples

            // Calculate endSample based on final noteSample
            const endSample = hold === 0
              ? noteSample + Math.floor(0.001 * this.sampleRate) // Very brief visual duration for hold=0 notes
              : noteSample + Math.floor(hold * frame.slotDuration * this.sampleRate)

            // Only add events that are in the target range
            if (noteSample < targetSample && (!filterFromSample || noteSample >= filterFromSample)) {
              events.push({
                bytecodePos: startPc - ARRAY_HEADER_SIZE,
                startSample: noteSample,
                endSample: endSample,
                value: noteValue,
                velocity: frame.velocity * velocity,
              })
            }
          }

          frame.eventRepeatIndex++
          if (frame.eventRepeatIndex < repeatCount) {
            frame.pc = frame.eventStartPc
            const nextRepeatTime = repeatInterval * frame.eventRepeatIndex
            if (frame.isStretchedSpread) {
              const nextSlotTime = frame.slotTimeAccum + frame.slotIndex * frame.slotDuration + nextRepeatTime
              this.nextEventTime = this.mapSlotTimeToRealTime(
                nextSlotTime,
                frame.spreadSlotDuration,
                frame.spreadGapDuration,
                frame.spreadRealStart,
                frame.spreadRepeatIndex,
              )
            }
            else {
              this.nextEventTime = this.cycleStartTime + frame.startTime + frame.slotIndex * frame.slotDuration
                + nextRepeatTime
            }
            return
          }

          frame.eventRepeatIndex = 0
        }
        else {
          frame.eventRepeatIndex = 0
        }

        frame.slotIndex += slotCount
        this.calculateNextEventTime(secondsPerBeat)
        return
      }

      frame.slotIndex++
      this.calculateNextEventTime(secondsPerBeat)
      return
    }

    this.nextEventTime = Number.MAX_VALUE
  }
}

// Global generator instance cache - keyed by bytecode content hash
let generatorCache: Map<string, SeqEventGeneratorImpl> = new Map()

/**
 * Simple hash of bytecode for cache key
 */
function hashBytecode(bytecode: Float32Array): string {
  const len = Math.min(100, bytecode.length) // Hash first 100 elements
  let hash = 0
  for (let i = 0; i < len; i++) {
    hash = ((hash << 5) - hash + bytecode[i]) | 0
  }
  return `${hash}-${bytecode.length}`
}

/**
 * Generate sequence events from bytecode
 * This is the single source of truth for event generation
 * Called from both WASM (via host bindings) and frontend
 */
export function generateSequenceEvents(
  bytecode: Float32Array,
  fromSample: number,
  toSample: number,
  sampleRate: number,
  bpm: number,
  seed: number = 1234567890,
): ScheduledEvent[] {
  // Create or reuse generator instance based on bytecode content
  const cacheKey = `${hashBytecode(bytecode)}-${sampleRate}-${bpm}-${seed}`
  let generator = generatorCache.get(cacheKey)

  if (!generator) {
    generator = new SeqEventGeneratorImpl(bytecode, sampleRate, bpm)
    generatorCache.set(cacheKey, generator)
  }
  else {
    // Update bytecode reference if it changed
    if (generator['bytecode'] !== bytecode) {
      generator['bytecode'] = bytecode
      // Reset if bytecode changed
      generator.reset()
    }
  }

  // Sync to start (generator always generates from time 0)
  generator.syncToSample(0)

  // Generate events from beginning, filter to desired range
  return generator.generateEvents(toSample, fromSample)
}

/**
 * Host function signature for AssemblyScript
 * Called from WASM to generate events and write to history buffer
 */
export function generateSequenceEventsHost(
  memory: WebAssembly.Memory,
  bytecodePtr: number,
  bytecodeLength: number,
  historyPtr: number,
  historyWritePosPtr: number,
  fromSample: number,
  toSample: number,
  sampleRate: number,
  bpm: number,
  seed: number,
): number {
  // Read bytecode from WASM memory
  const bytecode = new Float32Array(memory.buffer, bytecodePtr, bytecodeLength)

  // Generate events
  const events = generateSequenceEvents(bytecode, fromSample, toSample, sampleRate, bpm, seed)

  // Write events to history buffer
  const history = new Float32Array(memory.buffer, historyPtr, SEQ_HISTORY_SIZE * 3)
  const historyWritePos = new Float32Array(memory.buffer, historyWritePosPtr, 1)
  let writePos = Math.floor(historyWritePos[0])

  for (const event of events) {
    const offset = writePos * 3
    history[offset] = event.bytecodePos
    history[offset + 1] = event.startSample
    history[offset + 2] = event.endSample
    writePos = (writePos + 1) % SEQ_HISTORY_SIZE
  }

  historyWritePos[0] = writePos

  return events.length
}
