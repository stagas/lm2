import {
  ARRAY_HEADER_SIZE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_GROUP_START,
  OP_OCTAVE,
} from '../constants'
import { GroupStartOp } from './ops'
import {
  BytecodeReader,
  ChildOpsBuffer,
  EventEmitter,
  findGroupEnd,
  fract,
  MiniEventBuffer,
  parseGroupChildren,
  roundToDecimals,
  seededRandom01,
} from './util'

export { MiniEventBuffer }

const MAX_GROUP_DEPTH: i32 = 16

export class MiniEvents {
  private childOpsBuffers: StaticArray<ChildOpsBuffer | null> = new StaticArray<ChildOpsBuffer | null>(MAX_GROUP_DEPTH)
  private reader: BytecodeReader = new BytecodeReader()
  private emitter: EventEmitter = new EventEmitter(this.reader)
  private randomSeed: u32 = 0

  constructor() {
    // We keep per-depth buffers so nested groups don't overwrite the parent's
    // child list while iterating.
    for (let i: i32 = 0; i < MAX_GROUP_DEPTH; i++) {
      this.childOpsBuffers[i] = new ChildOpsBuffer()
    }
  }

  emitEvents(
    bytecode$: usize,
    eventBuffer: MiniEventBuffer,
    cycleStartSample: i32,
    cycleLength: f32,
    cycleSamples: f32,
    windowStart: i32,
    windowEnd: i32,
  ): void {
    if (bytecode$ === 0) return

    const array = changetype<StaticArray<f32>>(bytecode$)
    const opLength = i32(array[ARRAY_HEADER_SIZE])
    if (opLength <= 0) return

    const opStart = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE
    const opEnd = opStart + opLength

    // Derive a stable base seed from the bytecode contents so that probability
    // decisions depend only on the actual sequence data. If identical bytecode
    // is passed again (even at a different pointer), the hash – and therefore
    // all probability decisions – stay the same.
    let hash: u32 = 2166136261 // FNV-1a offset basis
    for (let i = 0; i < opLength; i++) {
      const v = array[opStart + i]
      const bits = reinterpret<u32>(v)
      hash ^= bits
      hash *= 16777619 // FNV-1a prime
    }
    this.randomSeed = hash

    this.reader.update(bytecode$, opEnd)
    this.emitter.update(eventBuffer, cycleStartSample, cycleLength, cycleSamples, windowStart, windowEnd)

    const cycle = cycleSamples > 0.0 ? i32(Mathf.floor((cycleStartSample as f32) / cycleSamples)) : 0
    this.evaluateGroup(
      this.reader,
      opStart,
      0.0,
      1.0,
      cycle,
      cycleStartSample,
      cycleSamples,
      1.0,
      0.0,
      0.0,
      0.0,
      1.0,
      this.emitter,
      0,
    )
  }

  private pow2(delta: f64): f64 {
    return Math.pow(2.0, delta)
  }

  private combineOptionalMul(a: f64, b: f64): f64 {
    if (a === 0.0) return b
    if (b === 0.0) return a
    return a * b
  }

  private getStrumKind(strum: f64): i32 {
    let kind: i32 = i32(Math.floor(strum))
    if (kind < 0) kind = 0
    if (kind > 3) kind = 3
    return kind
  }

  private getStrumAmount(strum: f64): f64 {
    const kind: i32 = this.getStrumKind(strum)
    const amount: f64 = strum - (kind as f64)
    if (amount <= 0.0) return 0.0
    if (amount >= 1.0) return 0.999999
    return amount
  }

  private combineStrum(a: f64, b: f64): f64 {
    if (a === 0.0) return b
    if (b === 0.0) return a

    const kindA: i32 = this.getStrumKind(a)
    const kindB: i32 = this.getStrumKind(b)
    const amountA: f64 = this.getStrumAmount(a)
    const amountB: f64 = this.getStrumAmount(b)

    const kind: i32 = kindB !== 0 ? kindB : kindA
    let amount: f64 = amountA * amountB
    if (amount >= 1.0) amount = 0.999999
    if (amount <= 0.0) return 0.0
    return (kind as f64) + amount
  }

  private countTimedChildren(reader: BytecodeReader, buffer: ChildOpsBuffer): i32 {
    let count: i32 = 0
    for (let i: i32 = 0; i < buffer.length; i++) {
      const off = buffer.get(i)
      if (reader.getOpcode(off) !== OP_OCTAVE) count++
    }
    return count
  }

  private evaluateGroup(
    reader: BytecodeReader,
    opOffset: i32,
    groupStartTime: f64,
    parentSlotDuration: f64,
    cycle: f64,
    cycleStartSample: i32,
    cycleSamples: f64,
    parentVelocity: f64,
    parentHoldMul: f64,
    parentStrumMul: f64,
    parentJitter: f64,
    parentPitch: f64,
    emitter: EventEmitter,
    depth: i32,
  ): f64 {
    if (opOffset >= reader.opEnd || reader.getOpcode(opOffset) !== OP_GROUP_START) {
      return parentPitch
    }

    if (depth < 0 || depth >= MAX_GROUP_DEPTH) {
      return parentPitch
    }

    const childOpsBuffer = this.childOpsBuffers[depth]
    if (childOpsBuffer === null) {
      return parentPitch
    }

    const group = reader.getGroup(opOffset)
    const groupOffset: f64 = group.offset as f64
    const groupJitter: f64 = parentJitter + (group.jitter as f64)
    const groupVelocity: f64 = parentVelocity * (group.velocity as f64)
    const groupHoldMul: f64 = this.combineOptionalMul(parentHoldMul, group.hold as f64)
    const groupStrumMul: f64 = this.combineStrum(parentStrumMul, group.strum as f64)
    let pitch: f64 = parentPitch

    const groupProb: f64 = group.prob as f64
    if (groupProb > 0.0) {
      const groupIndex: i32 = reader.getOpIndex(opOffset)
      const randGroup: f64 = seededRandom01(this.randomSeed, cycle, groupIndex)
      if (randGroup < groupProb) {
        return pitch
      }
    }

    parseGroupChildren(
      reader.array$,
      opOffset + GroupStartOp.size(),
      reader.opEnd,
      i32(group.childCount),
      childOpsBuffer,
    )

    const childrenLength = f64(childOpsBuffer.length)

    if (childrenLength === 0) {
      return pitch
    }

    if (group.density === 0 || group.density > 8) {
      return pitch
    }

    const isAngleGroup: bool = group.angle !== 0.0
    const timedCount: i32 = isAngleGroup ? childOpsBuffer.length : this.countTimedChildren(reader, childOpsBuffer)
    const timedLength: f64 = f64(timedCount > 0 ? timedCount : 1)
    const slotDuration: f64 = isAngleGroup ? parentSlotDuration : parentSlotDuration / timedLength

    // density controls the playback speed of the phrase across cycles.
    // For density < 1, the phrase spans multiple cycles; for density > 1, the phrase repeats
    // within a cycle. In both cases, a fractional density must advance the start phase each
    // cycle so the pattern drifts instead of restarting.
    const density: f64 = group.density as f64
    const invDensity: f64 = 1.0 / density
    const cycleDensity: f64 = roundToDecimals(cycle * density, 6)
    const phaseStart: f64 = fract(cycleDensity)
    const slotDurationScaled: f64 = slotDuration * invDensity
    const groupOffsetTime: f64 = groupOffset * parentSlotDuration

    if (isAngleGroup) {
      // Angle groups (<...>) pick exactly one child per virtual cycle and play it in the group's slot.
      // The chosen child advances with the same virtual cycle we propagate for density, so alternation
      // stays consistent for density > 1 and density < 1.
      const normalizedPosition: f64 = 0.0
      let delta: f64 = normalizedPosition - phaseStart
      if (delta < 0.0) delta += 1.0

      let pass: i32 = 0
      while (true) {
        const passF: f64 = pass as f64
        if (delta + passF >= density) break

        const startTime: f64 = (delta + passF) * invDensity * parentSlotDuration
        const childRelativeTime: f64 = roundToDecimals(startTime + groupOffsetTime, 6)

        if (roundToDecimals(childRelativeTime, 3) < parentSlotDuration) {
          const childCycle: f64 = roundToDecimals(cycleDensity + delta + passF, 6)
          const stepIndex: i32 = i32(Math.floor(childCycle))
          let childIndex: i32 = stepIndex % childOpsBuffer.length
          if (childIndex < 0) childIndex += childOpsBuffer.length
          const childOpOffset = childOpsBuffer.get(childIndex)

          pitch = this.processChild(
            reader,
            childOpOffset,
            groupStartTime,
            childRelativeTime,
            slotDurationScaled,
            f64(stepIndex),
            cycleStartSample,
            cycleSamples,
            groupVelocity,
            groupHoldMul,
            groupStrumMul,
            groupJitter,
            pitch,
            emitter,
            depth,
          )
        }

        pass++
      }

      return pitch
    }

    let pass: i32 = 0
    while (true) {
      const passF: f64 = pass as f64
      let scheduled: bool = false
      let timedIndex: i32 = 0

      for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
        const childOpOffset = childOpsBuffer.get(i)
        const opcode = reader.getOpcode(childOpOffset)

        let slotIndex: i32 = timedIndex
        if (slotIndex >= (timedCount > 0 ? timedCount : 1)) slotIndex = timedCount > 1 ? timedCount - 1 : 0
        const normalizedPosition: f64 = f64(slotIndex) / timedLength // position in [0, 1)

        let delta: f64 = normalizedPosition - phaseStart
        if (delta < 0.0) delta += 1.0

        if (delta + passF < density) {
          scheduled = true
          const startTime: f64 = (delta + passF) * invDensity * parentSlotDuration
          const childRelativeTime: f64 = roundToDecimals(startTime + groupOffsetTime, 6)

          if (roundToDecimals(childRelativeTime, 3) < parentSlotDuration) {
            // Propagate a "virtual cycle" that advances with the group's density and per-pass
            // repetition, so nested groups with density < 1 can advance inside parent groups
            // with density > 1 (e.g. `[a b]/2` inside `[*2]`).
            const childCycle: f64 = Math.floor(cycle * density + passF)
            pitch = this.processChild(
              reader,
              childOpOffset,
              groupStartTime,
              childRelativeTime,
              slotDurationScaled,
              childCycle,
              cycleStartSample,
              cycleSamples,
              groupVelocity,
              groupHoldMul,
              groupStrumMul,
              groupJitter,
              pitch,
              emitter,
              depth,
            )
          }
        }

        if (opcode !== OP_OCTAVE) timedIndex++
      }

      if (!scheduled) break
      pass++
    }

    return pitch
  }

  private processChild(
    reader: BytecodeReader,
    opOffset: i32,
    groupStartTime: f64,
    relativeTime: f64,
    slotDuration: f64,
    cycle: f64,
    cycleStartSample: i32,
    cycleSamples: f64,
    groupVelocity: f64,
    holdMul: f64,
    strumMul: f64,
    groupJitter: f64,
    pitch: f64,
    emitter: EventEmitter,
    depth: i32,
  ): f64 {
    const opcode = reader.getOpcode(opOffset)

    switch (opcode) {
      case OP_EVENT: {
        const event = reader.getEvent(opOffset)

        if (event.density === 0.0 || event.density > 8) break

        const valueCount: i32 = i32(event.valueCount)
        if (valueCount <= 0) break

        const eventIndex: i32 = reader.getOpIndex(opOffset)
        const strum: f64 = this.combineStrum(strumMul, event.strum as f64)
        const eventHold: f64 = event.hold as f64
        let hold: f64 = eventHold
        if (hold === 0.0) {
          hold = holdMul
        }
        else if (holdMul !== 0.0) {
          hold *= holdMul
        }
        const eventOffset: f64 = event.offset as f64
        const eventJitter: f64 = groupJitter + (event.jitter as f64)
        const eventProb: f64 = event.prob as f64

        // Same phase-drifting density scheduling used in evaluateGroup().
        const density: f64 = event.density as f64
        const invDensity: f64 = 1.0 / density
        const phaseStart: f64 = fract(roundToDecimals(cycle * density, 3))
        const slotDurationScaled: f64 = slotDuration * invDensity
        const eventOffsetTime: f64 = eventOffset * slotDuration

        const normalizedPosition: f64 = 0.0
        let delta: f64 = normalizedPosition - phaseStart
        if (delta < 0.0) delta += 1.0

        let pass: i32 = 0
        while (true) {
          const passF: f64 = pass as f64
          if (delta + passF >= density) break

          const startTime: f64 = (delta + passF) * invDensity * slotDuration
          const eventRelativeTime: f64 = roundToDecimals(startTime + eventOffsetTime, 6)

          if (roundToDecimals(eventRelativeTime, 3) < slotDuration) {
            const eventCycle: f64 = cycle * density + passF
            if (eventProb > 0.0) {
              const randEvent: f64 = seededRandom01(this.randomSeed, eventCycle, eventIndex)
              if (randEvent < eventProb) {
                pass++
                continue
              }
            }

            // emit one voice per value to support chords
            const strumKind: i32 = this.getStrumKind(strum)
            const strumAmount: f64 = this.getStrumAmount(strum)
            for (let vi: i32 = 0; vi < valueCount; vi++) {
              const rawValue = event.getValue(vi)
              if (rawValue <= 0.0) continue

              // apply strum as time spread across chord voices within the slot
              let strumOffset0: f64 = 0.0
              let strumOffset1: f64 = 0.0
              let strumEmitCount: i32 = 1
              if (strumAmount > 0.0 && valueCount > 1) {
                const position: f64 = f64(vi) / f64(valueCount - 1) // 0..1 across chord
                const strumSpan: f64 = slotDuration * strumAmount
                if (strumKind === 1) {
                  strumOffset0 = (1.0 - position) * strumSpan
                }
                else if (strumKind === 2) {
                  const half: f64 = strumSpan * 0.5
                  strumOffset0 = position * half
                  strumOffset1 = half + (1.0 - position) * half
                  strumEmitCount = 2
                }
                else if (strumKind === 3) {
                  const half: f64 = strumSpan * 0.5
                  strumOffset0 = (1.0 - position) * half
                  strumOffset1 = half + position * half
                  strumEmitCount = 2
                }
                else {
                  strumOffset0 = position * strumSpan
                }
              }

              // Apply jitter as a symmetric random offset within the slot duration.
              // Jitter amount is interpreted as a fraction of the slot duration; group jitter
              // accumulates with event jitter.
              for (let si: i32 = 0; si < strumEmitCount; si++) {
                let jitterOffset: f64 = 0.0
                if (eventJitter !== 0.0) {
                  const r: f64 = seededRandom01(
                    this.randomSeed,
                    eventCycle,
                    eventIndex,
                    vi + si * valueCount,
                  ) // 0..1
                  jitterOffset = (r - 0.5) * 2.0 * eventJitter * slotDuration
                }

                const strumOffset: f64 = si === 0 ? strumOffset0 : strumOffset1
                emitter.emit(
                  opOffset,
                  groupVelocity,
                  groupStartTime + relativeTime + eventRelativeTime + strumOffset + jitterOffset,
                  slotDurationScaled,
                  hold,
                  vi,
                  pitch,
                )
              }
            }
          }
          pass++
        }

        break
      }

      case OP_OCTAVE: {
        const op = reader.getOctave(opOffset)
        pitch *= this.pow2(op.delta as f64)
        break
      }

      case OP_GROUP_START: {
        pitch = this.evaluateGroup(
          reader,
          opOffset,
          groupStartTime + relativeTime,
          slotDuration,
          cycle,
          cycleStartSample,
          cycleSamples,
          groupVelocity,
          holdMul,
          strumMul,
          groupJitter,
          pitch,
          emitter,
          depth + 1,
        )
        break
      }
    }

    return pitch
  }
}
