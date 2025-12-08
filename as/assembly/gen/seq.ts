import { ARRAY_HEADER_SIZE, SEQ_VOICES } from '../constants'
import { SeqOp } from '../shared'
import { Gen } from './gen'

class SeqEvent {
  time: f64 = 0
  value: f32 = 0
  velocity: f32 = 1
  hold: f32 = 0
  glide: f32 = 1
  slot: i32 = 0
}

class Voice {
  active: bool = false
  releaseTime: f64 = 0
  currentValue: f32 = 0
  targetValue: f32 = 0
  glideRate: f32 = 0
  glidePower: f32 = 1
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

export class Seq extends Gen {
  bytecode$: usize = 0
  outVoiceCount$: usize = 0
  outTrig$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outVelocity$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)
  outValue$: StaticArray<usize> = new StaticArray<usize>(SEQ_VOICES)

  private time: f64 = 0
  private events: SeqEvent[] = []
  private eventIndex: i32 = 0
  private rng: RNG = new RNG()
  private voices: StaticArray<Voice> = new StaticArray<Voice>(SEQ_VOICES)
  private cycleGenerated: bool = false
  private lastLatchVoice: i32 = -1
  private currentEventSlot: i32 = -1

  constructor() {
    super()
    for (let i = 0; i < SEQ_VOICES; i++) {
      this.voices[i] = new Voice()
    }
  }

  reset(): void {
    this.time = 0
    this.eventIndex = 0
    this.events = []
    this.cycleGenerated = false
    this.lastLatchVoice = -1
    this.currentEventSlot = -1

    for (let v = 0; v < SEQ_VOICES; v++) {
      this.voices[v].active = false
    }

    // Reset the array index
    if (this.bytecode$ !== 0) {
      const array = changetype<StaticArray<f32>>(this.bytecode$)
      array[1] = 0
    }
  }

  process(out$: usize, length: i32): void {
    let maxActiveVoices = 0
    let localSampleCount = globalSampleCount

    // Read speed from bytecode
    let cycleSpeed: f32 = 1.0
    if (this.bytecode$ !== 0) {
      const array = changetype<StaticArray<f32>>(this.bytecode$)
      const arrayLength = array[0] as i32
      if (arrayLength >= ARRAY_HEADER_SIZE + 2) {
        const op = array[ARRAY_HEADER_SIZE] as i32
        if (op === SeqOp.Cycle) {
          cycleSpeed = array[ARRAY_HEADER_SIZE + 2]
        }
      }
    }

    for (let i = 0; i < length; i++) {
      // Calculate cycle length in samples based on number of events and type
      // Angle brackets <>: N events = N beats (each event = 1 beat)
      // Square brackets []: N events = 4 beats (always 1 bar)
      // Adjusted by speed from the cycle: speed=1 -> base beats, speed=2 -> half beats, speed=0.5 -> double beats
      const beatsPerSecond = bpm / 60.0
      const samplesPerBeat = sampleRate / beatsPerSecond

      // Read cycle length and type from bytecode
      let cycleBeats = 4.0
      if (this.bytecode$ !== 0) {
        const array = changetype<StaticArray<f32>>(this.bytecode$)
        const arrayLength = array[0] as i32
        if (arrayLength >= ARRAY_HEADER_SIZE + 9) {
          const op = array[ARRAY_HEADER_SIZE] as i32
          if (op === SeqOp.Cycle) {
            const cycleLength = array[ARRAY_HEADER_SIZE + 1] as i32
            const isSquare = array[ARRAY_HEADER_SIZE + 8] as i32

            if (isSquare === 1) {
              // Square brackets: always 1 bar (4 beats)
              cycleBeats = 4.0
            } else {
              // Angle brackets: N events = N beats
              cycleBeats = cycleLength as f64
            }
          }
        }
      }

      const samplesPerCycle = samplesPerBeat * cycleBeats
      const currentBarLengthSamples = (samplesPerCycle / cycleSpeed) as i32

      // Detect cycle wrap using modulo
      const prevSample = localSampleCount - 1
      const prevCycle = prevSample >= 0 ? (prevSample / currentBarLengthSamples) : -1
      const currentCycle = localSampleCount / currentBarLengthSamples

      const isCycleStart = currentCycle > prevCycle

      if (isCycleStart || !this.cycleGenerated) {
        this.time = 0
        this.eventIndex = 0
        this.events = []
        this.lastLatchVoice = -1
        this.currentEventSlot = -1

        // Reset RNG for deterministic playback
        this.rng.setSeed(1234567890)

        for (let v = 0; v < SEQ_VOICES; v++) {
          this.voices[v].active = false
        }

        // Read cycle length and type from bytecode to determine beat duration
        // Angle brackets <>: N events = N beats (each event = 1 beat)
        // Square brackets []: N events = 4 beats (always 1 bar)
        let beatDuration = 4.0
        if (this.bytecode$ !== 0) {
          const array = changetype<StaticArray<f32>>(this.bytecode$)
          const arrayLength = array[0] as i32
          if (arrayLength >= ARRAY_HEADER_SIZE + 9) {
            const op = array[ARRAY_HEADER_SIZE] as i32
            if (op === SeqOp.Cycle) {
              const cycleLength = array[ARRAY_HEADER_SIZE + 1] as i32
              const isSquare = array[ARRAY_HEADER_SIZE + 8] as i32

              if (isSquare === 1) {
                // Square brackets: always 1 bar (4 beats)
                beatDuration = 4.0
              } else {
                // Angle brackets: N events = N beats
                beatDuration = cycleLength as f64
              }
            }
          }
        }

        this.generateCycle(this.bytecode$, 0, beatDuration, 1.0, 0, 0, 1.0)

        this.events.sort((a, b) => {
          if (a.time < b.time) return -1
          if (a.time > b.time) return 1
          return 0
        })

        this.cycleGenerated = true
      }

      const secondsPerBeat = 60.0 / (bpm as f64)
      const deltaTime = 1.0 / (sampleRate as f64)

      while (this.eventIndex < this.events.length) {
        const event = this.events[this.eventIndex]
        const eventTime = event.time * secondsPerBeat

        if (eventTime <= this.time + deltaTime * 0.5) {
          // Update the array index to track current slot
          this.currentEventSlot = event.slot
          if (this.bytecode$ !== 0) {
            const array = changetype<StaticArray<f32>>(this.bytecode$)
            array[1] = this.currentEventSlot as f32
          }

          // If this is a latch note (hold=0), release the previous latch voice
          if (event.hold === 0 && this.lastLatchVoice >= 0) {
            this.voices[this.lastLatchVoice].active = false
          }

          const voiceIndex = this.allocateVoice()
          if (voiceIndex >= 0) {
            const voice = this.voices[voiceIndex]

            store<f32>(this.outTrig$[voiceIndex] + i * 4, 1.0)

            voice.velocity = event.velocity
            voice.targetValue = event.value
            voice.glidePower = event.glide

            if (event.glide > 0 && voice.currentValue > 0) {
              const glideSamples = Mathf.max(1, event.hold * (sampleRate as f32))
              voice.glideRate = 1.0 / glideSamples
            }
            else {
              voice.currentValue = event.value
              voice.glideRate = 1.0
            }

            voice.active = true
            // hold=0 means latch (infinite hold), otherwise use the hold time
            voice.releaseTime = event.hold === 0 ? f64.MAX_VALUE : this.time + (event.hold as f64)

            // Track this voice if it's a latch note
            if (event.hold === 0) {
              this.lastLatchVoice = voiceIndex
            }
          }
          this.eventIndex++
        }
        else {
          break
        }
      }

      for (let v = 0; v < SEQ_VOICES; v++) {
        const voice = this.voices[v]
        const voiceTrig$ = this.outTrig$[v] + i * 4

        if (voice.active) {
          if (this.time < voice.releaseTime) {
            store<f32>(voiceTrig$, 1.0)
          }
          else {
            store<f32>(voiceTrig$, 0)
            voice.active = false
          }

          if (voice.currentValue !== voice.targetValue) {
            const distance = voice.targetValue - voice.currentValue
            const step = distance * voice.glideRate

            if (voice.glidePower !== 1.0) {
              const t = Mathf.min(1.0, voice.glideRate * (sampleRate as f32) * (deltaTime as f32))
              const curvedT = Mathf.pow(t, voice.glidePower)
              voice.currentValue += distance * curvedT
            }
            else {
              voice.currentValue += step
            }

            if (Mathf.abs(voice.currentValue - voice.targetValue) < 0.01) {
              voice.currentValue = voice.targetValue
            }
          }

          store<f32>(this.outValue$[v] + i * 4, voice.currentValue)
          store<f32>(this.outVelocity$[v] + i * 4, voice.velocity)
        }
        else {
          store<f32>(voiceTrig$, 0)
          store<f32>(this.outValue$[v] + i * 4, voice.currentValue)
          store<f32>(this.outVelocity$[v] + i * 4, 0)
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

    // Write voice count once for entire buffer (constant across all samples)
    for (let i = 0; i < length; i++) {
      store<f32>(this.outVoiceCount$ + i * 4, maxActiveVoices as f32)
    }
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

  private skipSlot(array: StaticArray<f32>, pc: i32): i32 {
    const arrayLength = array[0] as i32
    if (pc >= arrayLength + ARRAY_HEADER_SIZE) return pc

    const op = array[pc] as i32
    pc++

    if (op === SeqOp.Cycle) {
      const cycleLength = array[pc++] as i32
      pc += 7 // Skip speed, repeat, density, offset, jitter, prob, isSquare

      for (let i = 0; i < cycleLength; i++) {
        if (pc >= arrayLength + ARRAY_HEADER_SIZE) break
        pc = this.skipSlot(array, pc)
      }
      return pc
    }

    if (op === SeqOp.Rest) {
      pc++ // Skip repeat
      return pc
    }

    if (op === SeqOp.Value) {
      pc += 9 // Skip n, velocity, hold, repeat, density, offset, prob, jitter, glide
      return pc
    }

    if (op === SeqOp.Chord) {
      const chordLength = array[pc++] as i32
      pc += chordLength // Skip all note values
      pc += 9 // Skip strum, velocity, hold, repeat, density, offset, prob, jitter, glide
      return pc
    }

    return pc
  }

  private generateCycle(
    array$: usize,
    startTime: f64,
    duration: f64,
    parentVelocity: f32,
    parentOffset: f32,
    parentJitter: f32,
    parentProb: f32,
  ): void {
    if (array$ === 0) return

    const array = changetype<StaticArray<f32>>(array$)
    const arrayLength = array[0] as i32
    if (arrayLength < 1) return

    let pc = ARRAY_HEADER_SIZE
    if (pc >= arrayLength + ARRAY_HEADER_SIZE) return

    const op = array[pc] as i32
    pc++

    if (op !== SeqOp.Cycle) {
      return
    }

    const cycleLength = array[pc++] as i32
    const speed = array[pc++]
    const repeat = array[pc++]
    const density = array[pc++]
    const offset = array[pc++]
    const jitter = array[pc++]
    const prob = array[pc++]
    const isSquare = array[pc++] as i32

    const effectiveProb = parentProb * prob
    const effectiveJitter = Mathf.min(1.0, parentJitter + jitter)

    const repeatCount = Mathf.max(1, Mathf.round(repeat)) as i32
    const densityCount = Mathf.max(0, density)

    if (densityCount <= 0) return

    const repeatDuration = duration / (repeat as f64)
    const densityPeriod = duration / (densityCount as f64)

    const slotsStartPc = pc // Save the position where slots begin

    for (let r = 0; r < repeatCount; r++) {
      const repeatStartTime = startTime + (r as f64) * repeatDuration

      let densityOccurrences = Mathf.ceil(densityCount) as i32
      if (densityCount < 1.0) {
        densityOccurrences = this.rng.next() < densityCount ? 1 : 0
      }

      for (let d = 0; d < densityOccurrences; d++) {
        const densityStartTime = repeatStartTime + (d as f64) * densityPeriod

        if (this.rng.next() >= effectiveProb) continue

        const jitterAmount = (this.rng.next() * 2.0 - 1.0) * effectiveJitter
        const cycleStartTime = densityStartTime + (offset as f64) + (parentOffset as f64) + jitterAmount

        // For square brackets, duration is divided among slots within each repeat
        // For angle brackets, duration is divided by speed
        const slotDuration = isSquare === 1
          ? (repeatDuration / (cycleLength as f64))
          : (repeatDuration / (cycleLength as f64)) / (speed as f64)

        // Reset pc to beginning of slots for each repeat
        let slotPc = slotsStartPc
        for (let slot = 0; slot < cycleLength; slot++) {
          if (slotPc >= arrayLength + ARRAY_HEADER_SIZE) break

          const slotStartTime = cycleStartTime + (slot as f64) * slotDuration
          slotPc = this.processSlot(array, slotPc, slotStartTime, slotDuration, parentVelocity, effectiveJitter, effectiveProb, slot)
        }
      }
    }
  }

  private processSlot(
    array: StaticArray<f32>,
    pc: i32,
    startTime: f64,
    duration: f64,
    parentVelocity: f32,
    parentJitter: f32,
    parentProb: f32,
    slot: i32,
  ): i32 {
    const arrayLength = array[0] as i32
    if (pc >= arrayLength + ARRAY_HEADER_SIZE) return pc

    const op = array[pc] as i32
    pc++

    if (op === SeqOp.Cycle) {
      const cycleLength = array[pc++] as i32
      const speed = array[pc++]
      const repeat = array[pc++]
      const density = array[pc++]
      const offset = array[pc++]
      const jitter = array[pc++]
      const prob = array[pc++]
      const isSquare = array[pc++] as i32

      const effectiveProb = parentProb * prob
      const effectiveJitter = Mathf.min(1.0, parentJitter + jitter)

      const repeatCount = Mathf.max(1, Mathf.round(repeat)) as i32
      const densityCount = Mathf.max(0, density)

      if (densityCount > 0) {
        const repeatDuration = duration / (repeat as f64)
        const densityPeriod = duration / (densityCount as f64)

        const nestedSlotsStartPc = pc // Save the position where nested slots begin

        for (let r = 0; r < repeatCount; r++) {
          const repeatStartTime = startTime + (r as f64) * repeatDuration

          let densityOccurrences = Mathf.ceil(densityCount) as i32
          if (densityCount < 1.0) {
            densityOccurrences = this.rng.next() < densityCount ? 1 : 0
          }

          for (let d = 0; d < densityOccurrences; d++) {
            const densityStartTime = repeatStartTime + (d as f64) * densityPeriod

            if (this.rng.next() >= effectiveProb) continue

            const jitterAmount = (this.rng.next() * 2.0 - 1.0) * effectiveJitter
            const cycleStartTime = densityStartTime + (offset as f64) + jitterAmount

            const slotDuration = isSquare === 1
              ? (repeatDuration / (cycleLength as f64))
              : (repeatDuration / (cycleLength as f64)) / (speed as f64)

            // Reset to beginning of slots for each repeat
            let nestedPc = nestedSlotsStartPc
            for (let nestedSlot = 0; nestedSlot < cycleLength; nestedSlot++) {
              if (nestedPc >= arrayLength + ARRAY_HEADER_SIZE) break

              const slotStartTime = cycleStartTime + (nestedSlot as f64) * slotDuration
              nestedPc = this.processSlot(array, nestedPc, slotStartTime, slotDuration, parentVelocity, effectiveJitter, effectiveProb, slot)
            }
          }
        }
      }

      // Skip all nested slot data
      let skipPc = pc
      for (let nestedSlot = 0; nestedSlot < cycleLength; nestedSlot++) {
        if (skipPc >= arrayLength + ARRAY_HEADER_SIZE) break
        skipPc = this.skipSlot(array, skipPc)
      }
      return skipPc
    }

    if (op === SeqOp.Rest) {
      const repeat = array[pc++]
      return pc
    }

    if (op === SeqOp.Value) {
      const value = array[pc++]
      const velocity = array[pc++]
      const hold = array[pc++]
      const repeat = array[pc++]
      const density = array[pc++]
      const offset = array[pc++]
      const prob = array[pc++]
      const jitter = array[pc++]
      const glide = array[pc++]

      const effectiveVelocity = parentVelocity * velocity
      const effectiveProb = parentProb * prob
      const effectiveJitter = Mathf.min(1.0, parentJitter + jitter)

      const repeatCount = Mathf.max(1, Mathf.round(repeat)) as i32
      const densityCount = Mathf.max(0, density)

      if (densityCount > 0) {
        const eventDuration = duration / (repeat as f64)
        const microDuration = eventDuration / (densityCount as f64)

        for (let r = 0; r < repeatCount; r++) {
          const repeatStartTime = startTime + (r as f64) * eventDuration

          let densityOccurrences = Mathf.ceil(densityCount) as i32
          if (densityCount < 1.0) {
            densityOccurrences = this.rng.next() < densityCount ? 1 : 0
          }

          for (let d = 0; d < densityOccurrences; d++) {
            if (this.rng.next() >= effectiveProb) continue

            const microStartTime = repeatStartTime + (d as f64) * microDuration
            const jitterAmount = (this.rng.next() * 2.0 - 1.0) * effectiveJitter
            const eventTime = microStartTime + (offset as f64) + jitterAmount

            const event = new SeqEvent()
            event.time = eventTime
            event.value = value
            event.velocity = effectiveVelocity
            event.hold = hold
            event.glide = glide
            event.slot = slot
            this.events.push(event)
          }
        }
      }

      return pc
    }

    if (op === SeqOp.Chord) {
      const chordLength = array[pc++] as i32
      const notes: f32[] = []
      for (let n = 0; n < chordLength; n++) {
        notes.push(array[pc++])
      }
      const strum = array[pc++]
      const velocity = array[pc++]
      const hold = array[pc++]
      const repeat = array[pc++]
      const density = array[pc++]
      const offset = array[pc++]
      const prob = array[pc++]
      const jitter = array[pc++]
      const glide = array[pc++]

      const effectiveVelocity = parentVelocity * velocity
      const effectiveProb = parentProb * prob
      const effectiveJitter = Mathf.min(1.0, parentJitter + jitter)

      const repeatCount = Mathf.max(1, Mathf.round(repeat)) as i32
      const densityCount = Mathf.max(0, density)

      if (densityCount > 0) {
        const eventDuration = duration / (repeat as f64)
        const microDuration = eventDuration / (densityCount as f64)

        for (let r = 0; r < repeatCount; r++) {
          const repeatStartTime = startTime + (r as f64) * eventDuration

          let densityOccurrences = Mathf.ceil(densityCount) as i32
          if (densityCount < 1.0) {
            densityOccurrences = this.rng.next() < densityCount ? 1 : 0
          }

          for (let d = 0; d < densityOccurrences; d++) {
            if (this.rng.next() >= effectiveProb) continue

            const microStartTime = repeatStartTime + (d as f64) * microDuration
            const jitterAmount = (this.rng.next() * 2.0 - 1.0) * effectiveJitter
            const baseEventTime = microStartTime + (offset as f64) + jitterAmount

            for (let n = 0; n < chordLength; n++) {
              const noteTime = baseEventTime + (n as f64) * (strum as f64)
              const event = new SeqEvent()
              event.time = noteTime
              event.value = notes[n]
              event.velocity = effectiveVelocity
              event.hold = hold
              event.glide = glide
              event.slot = slot
              this.events.push(event)
            }
          }
        }
      }

      return pc
    }

    return pc
  }
}
