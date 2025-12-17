import {
  ARRAY_HEADER_SIZE,
  MINI_HEADER_SIZE,
  OP_CYCLE_START,
  OP_EVENT,
  OP_GROUP_START,
  OP_OCTAVE,
  OP_SCALE,
  OP_TRANSPOSE,
} from '../constants'
import {
  fract,
  roundToDecimals,
} from '../util'
import { CycleStartOp, GroupStartOp } from './ops'
import { degreeToFrequency } from './scales'
import {
  BytecodeReader,
  ChildOpsBuffer,
  EventEmitter,
  MiniEventBuffer,
  parseGroupChildren,
  seededRandom01,
} from './util'

export { MiniEventBuffer }

const MAX_GROUP_DEPTH: i32 = 16

export class MiniEvents {
  private childOpsBuffers: StaticArray<ChildOpsBuffer | null> = new StaticArray<ChildOpsBuffer | null>(MAX_GROUP_DEPTH)
  private reader: BytecodeReader = new BytecodeReader()
  private emitter: EventEmitter = new EventEmitter(this.reader)
  private randomSeed: u32 = 0
  private scaleActive: bool = false
  private scaleRootMidi: i32 = 0
  private scaleIndex: i32 = 0

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
    this.scaleActive = false
    this.scaleRootMidi = 0
    this.scaleIndex = 0

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
      0.0,
      this.emitter,
      0,
      1.0,
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

  private getReplicateWeight(replicate: f64): f64 {
    if (replicate <= 0.0) return 0.0
    return replicate
  }

  private getElongateWeight(elongate: f64): f64 {
    if (elongate <= 0.0) return 0.0
    return elongate
  }

  private getTimedWeight(replicate: f64, elongate: f64): f64 {
    const rep = this.getReplicateWeight(replicate)
    if (rep <= 0.0) return 0.0
    const el = this.getElongateWeight(elongate)
    if (el <= 0.0) return 0.0
    return rep * el
  }

  private groupHasValueEvents(reader: BytecodeReader, groupOpOffset: i32, scratchDepth: i32): bool {
    if (scratchDepth < 0 || scratchDepth >= MAX_GROUP_DEPTH) {
      return false
    }
    if (groupOpOffset >= reader.opEnd || reader.getOpcode(groupOpOffset) !== OP_GROUP_START) {
      return false
    }

    const childOpsBuffer = this.childOpsBuffers[scratchDepth]
    if (childOpsBuffer === null) {
      return false
    }

    const group = reader.getGroup(groupOpOffset)
    const childCount: i32 = i32(group.childCount)
    if (childCount <= 0) {
      return false
    }

    parseGroupChildren(
      reader.array$,
      groupOpOffset + GroupStartOp.size(),
      reader.opEnd,
      childCount,
      childOpsBuffer,
    )

    for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
      const off = childOpsBuffer.get(i)
      const opcode = reader.getOpcode(off)
      if (opcode === OP_EVENT) {
        const event = reader.getEvent(off)
        if (i32(event.valueCount) > 0) return true
      }
      else if (opcode === OP_GROUP_START) {
        if (this.groupHasValueEvents(reader, off, scratchDepth + 1)) return true
      }
      else if (opcode === OP_CYCLE_START) {
        if (this.cycleHasValueEvents(reader, off, scratchDepth + 1)) return true
      }
    }

    return false
  }

  private cycleHasValueEvents(reader: BytecodeReader, cycleOpOffset: i32, scratchDepth: i32): bool {
    if (scratchDepth < 0 || scratchDepth >= MAX_GROUP_DEPTH) {
      return false
    }
    if (cycleOpOffset >= reader.opEnd || reader.getOpcode(cycleOpOffset) !== OP_CYCLE_START) {
      return false
    }

    const childOpsBuffer = this.childOpsBuffers[scratchDepth]
    if (childOpsBuffer === null) {
      return false
    }

    const cycleOp = reader.getCycle(cycleOpOffset)
    const childCount: i32 = i32(cycleOp.childCount)
    if (childCount <= 0) {
      return false
    }

    parseGroupChildren(
      reader.array$,
      cycleOpOffset + CycleStartOp.size(),
      reader.opEnd,
      childCount,
      childOpsBuffer,
    )

    for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
      const off = childOpsBuffer.get(i)
      const opcode = reader.getOpcode(off)
      if (opcode === OP_EVENT) {
        const event = reader.getEvent(off)
        if (i32(event.valueCount) > 0) return true
      }
      else if (opcode === OP_GROUP_START) {
        if (this.groupHasValueEvents(reader, off, scratchDepth + 1)) return true
      }
      else if (opcode === OP_CYCLE_START) {
        if (this.cycleHasValueEvents(reader, off, scratchDepth + 1)) return true
      }
    }

    return false
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
    parentGlide: f64,
    emitter: EventEmitter,
    depth: i32,
    densityMul: f64,
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
    const groupOffsetTime: f64 = groupOffset * parentSlotDuration
    const groupJitter: f64 = parentJitter + (group.jitter as f64)
    const groupVelocity: f64 = parentVelocity * (group.velocity as f64)
    const groupHoldMul: f64 = this.combineOptionalMul(parentHoldMul, group.hold as f64)
    const groupStrumMul: f64 = this.combineStrum(parentStrumMul, group.strum as f64)
    // glide inheritance: group's glide overrides parentGlide when non-zero
    const groupGlide: f64 = group.glide as f64
    const effectiveGlide: f64 = groupGlide !== 0.0 ? groupGlide : parentGlide
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

    // Cycle replacement: if the group has `cycle N ...` blocks, then on cycles where
    // (cycleIndex+1) % N === 0 we replace the entire phrase with that block's children.
    // If multiple blocks match the same cycle, the later one wins.
    let baseEnd: i32 = childOpsBuffer.length
    for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
      const off = childOpsBuffer.get(i)
      if (reader.getOpcode(off) === OP_CYCLE_START) {
        baseEnd = i
        break
      }
    }
    if (baseEnd < childOpsBuffer.length) {
      const cycleIndex1: i32 = i32(cycle) + 1
      let selected: i32 = -1
      for (let i: i32 = baseEnd; i < childOpsBuffer.length; i++) {
        const off = childOpsBuffer.get(i)
        if (reader.getOpcode(off) !== OP_CYCLE_START) continue
        const op = reader.getCycle(off)
        const period: i32 = i32(op.period)
        if (period > 0 && (cycleIndex1 % period) === 0) {
          selected = off
        }
      }

      if (selected >= 0) {
        const op = reader.getCycle(selected)
        parseGroupChildren(
          reader.array$,
          selected + CycleStartOp.size(),
          reader.opEnd,
          i32(op.childCount),
          childOpsBuffer,
        )
      }
      else {
        childOpsBuffer.length = baseEnd
      }
    }

    const childrenLength = f64(childOpsBuffer.length)

    if (childrenLength === 0) {
      return pitch
    }

    const density0: f64 = group.density as f64
    let density: f64 = density0 * densityMul
    if (density <= 0.0 || density > 8.0) {
      return pitch
    }

    const isAngleGroup: bool = group.angle !== 0.0
    let timedLength: f64 = 0.0
    if (!isAngleGroup) {
      for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
        const off = childOpsBuffer.get(i)
        const opcode = reader.getOpcode(off)
        if (opcode === OP_OCTAVE || opcode === OP_TRANSPOSE || opcode === OP_SCALE) continue
        if (opcode === OP_EVENT) {
          const op = reader.getEvent(off)
          timedLength += this.getTimedWeight(op.replicate as f64, op.elongate as f64)
        }
        else if (opcode === OP_GROUP_START) {
          if (this.groupHasValueEvents(reader, off, depth + 1)) {
            const op = reader.getGroup(off)
            timedLength += this.getTimedWeight(op.replicate as f64, op.elongate as f64)
          }
        }
      }
      if (timedLength <= 0.0) {
        if (roundToDecimals(groupOffsetTime, 3) >= parentSlotDuration) return pitch
        for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
          const childOpOffset = childOpsBuffer.get(i)
          pitch = this.processChild(
            reader,
            childOpOffset,
            groupStartTime,
            groupOffsetTime,
            parentSlotDuration,
            cycle,
            cycleStartSample,
            cycleSamples,
            groupVelocity,
            groupHoldMul,
            groupStrumMul,
            groupJitter,
            effectiveGlide,
            pitch,
            emitter,
            depth,
          )
        }
        return pitch
      }
    }
    const slotDuration: f64 = isAngleGroup ? parentSlotDuration : parentSlotDuration / timedLength

    // density controls the playback speed of the phrase across cycles.
    // For density < 1, the phrase spans multiple cycles; for density > 1, the phrase repeats
    // within a cycle. In both cases, a fractional density must advance the start phase each
    // cycle so the pattern drifts instead of restarting.
    const invDensity: f64 = 1.0 / density
    const cycleDensity: f64 = roundToDecimals(cycle * density, 6)
    const phaseStart: f64 = fract(cycleDensity)
    const slotDurationScaled: f64 = slotDuration * invDensity

    if (isAngleGroup) {
      // Angle groups (<...>) pick exactly one child per virtual cycle and play it in the group's slot.
      // The chosen child advances with the same virtual cycle we propagate for density, so alternation
      // stays consistent for density > 1 and density < 1.
      //
      // When density < 1, an angle-group choice can span multiple real cycles. Control ops like
      // octave/transpose must therefore "hold" across those cycles even when the control's own
      // instant falls outside the current cycle window. We apply the active control for the
      // current virtual cycle at the start of this evaluation, and still allow scheduled controls
      // (when phaseStart === 0) to run normally.
      if (phaseStart !== 0.0) {
        const stepIndex0: i32 = i32(Math.floor(cycleDensity))
        let childIndex0: i32 = stepIndex0 % childOpsBuffer.length
        if (childIndex0 < 0) childIndex0 += childOpsBuffer.length
        const childOpOffset0 = childOpsBuffer.get(childIndex0)
        const opcode0 = reader.getOpcode(childOpOffset0)
        if (opcode0 === OP_OCTAVE) {
          const op0 = reader.getOctave(childOpOffset0)
          pitch *= this.pow2(op0.delta as f64)
        }
        else if (opcode0 === OP_TRANSPOSE) {
          const op0 = reader.getTranspose(childOpOffset0)
          pitch *= this.pow2((op0.delta as f64) / 12.0)
        }
        else if (opcode0 === OP_SCALE) {
          const op0 = reader.getScale(childOpOffset0)
          this.scaleRootMidi = i32(op0.rootMidi)
          this.scaleIndex = i32(op0.scaleIndex)
          this.scaleActive = true
        }
      }

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
            effectiveGlide,
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
      let timeIndex: f64 = 0.0

      for (let i: i32 = 0; i < childOpsBuffer.length; i++) {
        const childOpOffset = childOpsBuffer.get(i)
        const opcode = reader.getOpcode(childOpOffset)

        let weight: f64 = 0.0
        let posIndex: f64 = timeIndex
        let isTimed: bool = false
        if (opcode === OP_EVENT) {
          const op = reader.getEvent(childOpOffset)
          weight = this.getTimedWeight(op.replicate as f64, op.elongate as f64)
          isTimed = true
        }
        else if (opcode === OP_GROUP_START) {
          if (this.groupHasValueEvents(reader, childOpOffset, depth + 1)) {
            const op = reader.getGroup(childOpOffset)
            weight = this.getTimedWeight(op.replicate as f64, op.elongate as f64)
            isTimed = true
          }
        }
        else if (opcode === OP_OCTAVE || opcode === OP_TRANSPOSE || opcode === OP_SCALE) {
          if (posIndex >= timedLength) posIndex = timedLength - 0.000001
        }
        else {
          continue
        }

        if (!isTimed && opcode === OP_GROUP_START) {
          if (posIndex >= timedLength) posIndex = timedLength - 0.000001
        }

        if (isTimed && weight <= 0.0) {
          continue
        }

        const normalizedPosition: f64 = posIndex / timedLength // position in [0, 1)

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
            const childSlotDurationScaled: f64 = isTimed
              ? roundToDecimals(slotDurationScaled * weight, 4)
              : slotDurationScaled
            pitch = this.processChild(
              reader,
              childOpOffset,
              groupStartTime,
              childRelativeTime,
              childSlotDurationScaled,
              childCycle,
              cycleStartSample,
              cycleSamples,
              groupVelocity,
              groupHoldMul,
              groupStrumMul,
              groupJitter,
              effectiveGlide,
              pitch,
              emitter,
              depth,
            )
          }
        }

        if (isTimed) {
          timeIndex += weight
        }
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
    parentGlide: f64,
    pitch: f64,
    emitter: EventEmitter,
    depth: i32,
  ): f64 {
    const opcode = reader.getOpcode(opOffset)

    switch (opcode) {
      case OP_EVENT: {
        const event = reader.getEvent(opOffset)

        const replicate: f64 = event.replicate as f64
        let density: f64 = (event.density as f64) * replicate
        if (density <= 0.0 || density > 8.0) break

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
        // Inherit glide from parent/group when event has no explicit glide
        const eventGlide: f64 = event.glide as f64
        if (eventGlide === 0.0 && parentGlide !== 0.0) {
          const arr = changetype<StaticArray<f32>>(reader.array$)
          // glide is stored at struct index 10 for EventOp
          arr[opOffset + 10] = parentGlide as f32
        }

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
              if (rawValue === 0.0) continue

              let valueHz: f64 = rawValue as f64
              if (rawValue < 0.0) {
                if (!this.scaleActive) continue
                const degree: i32 = i32(-rawValue)
                if (degree <= 0) continue
                valueHz = degreeToFrequency(this.scaleRootMidi, this.scaleIndex, degree)
                if (valueHz <= 0.0) continue
              }

              valueHz *= pitch
              if (valueHz <= 0.0) continue

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
                  valueHz,
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
        emitter.emitControl(opOffset, groupVelocity, groupStartTime + relativeTime)
        pitch *= this.pow2(op.delta as f64)
        break
      }

      case OP_TRANSPOSE: {
        const op = reader.getTranspose(opOffset)
        emitter.emitControl(opOffset, groupVelocity, groupStartTime + relativeTime)
        pitch *= this.pow2((op.delta as f64) / 12.0)
        break
      }

      case OP_SCALE: {
        const op = reader.getScale(opOffset)
        emitter.emitControl(opOffset, groupVelocity, groupStartTime + relativeTime)
        this.scaleRootMidi = i32(op.rootMidi)
        this.scaleIndex = i32(op.scaleIndex)
        this.scaleActive = true
        break
      }

      case OP_GROUP_START: {
        const group = reader.getGroup(opOffset)
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
          parentGlide,
          emitter,
          depth + 1,
          group.replicate as f64,
        )
        break
      }
    }

    return pitch
  }
}
