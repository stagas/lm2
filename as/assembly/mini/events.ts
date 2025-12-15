import {
  ARRAY_HEADER_SIZE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_GROUP_START,
} from '../constants'
import { GroupStartOp } from './ops'
import {
  BytecodeReader,
  ChildOpsBuffer,
  EventEmitter,
  findGroupEnd,
  floorToFactor,
  fract,
  MiniEventBuffer,
  parseGroupChildren,
  seededRandom01,
} from './util'

export { MiniEventBuffer }

export class MiniEvents {
  private childOpsBuffer: ChildOpsBuffer = new ChildOpsBuffer()
  private reader: BytecodeReader = new BytecodeReader()
  private emitter: EventEmitter = new EventEmitter(this.reader)
  private randomSeed: u32 = 0

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
      this.emitter,
    )
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
    parentJitter: f64,
    emitter: EventEmitter,
  ): i32 {
    if (opOffset >= reader.opEnd || reader.getOpcode(opOffset) !== OP_GROUP_START) {
      return opOffset
    }

    const group = reader.getGroup(opOffset)
    const groupOffset: f64 = group.offset as f64
    const groupJitter: f64 = parentJitter + (group.jitter as f64)
    let groupStart: f64 = groupStartTime
    if (groupOffset !== 0.0) {
      groupStart += groupOffset * parentSlotDuration
    }
    const groupVelocity: f64 = parentVelocity * (group.velocity as f64)

    const groupProb: f64 = group.prob as f64
    if (groupProb > 0.0) {
      const groupIndex: i32 = reader.getOpIndex(opOffset)
      const randGroup: f64 = seededRandom01(this.randomSeed, cycle, groupIndex)
      if (randGroup < groupProb) {
        return findGroupEnd(reader.array$, opOffset, reader.opEnd)
      }
    }

    parseGroupChildren(
      reader.array$,
      opOffset + GroupStartOp.size(),
      reader.opEnd,
      i32(group.childCount),
      this.childOpsBuffer,
    )

    const childrenLength = f64(this.childOpsBuffer.length)

    if (childrenLength === 0) {
      return findGroupEnd(reader.array$, opOffset, reader.opEnd)
    }

    const slotDuration = parentSlotDuration / childrenLength

    if (group.density === 0 || group.density > 16) {
      return findGroupEnd(reader.array$, opOffset, reader.opEnd)
    }

    // interpret density like a slot selector over children across cycles:
    // density < 1 spreads children across multiple cycles, density >= 1
    // allows multiple children per cycle.
    const invDensity: f64 = 1.0 / group.density
    let slots: f64 = invDensity
    if (slots < 1.0) slots = 1.0
    const slotsRounded: f64 = Math.max(1.0, Math.round(slots))

    let didAllPlay: bool = true
    const repeatStep: f64 = group.density > 1.0 ? parentSlotDuration * invDensity : 0.0

    let pass: i32 = 0
    while (true) {
      const offset: f64 = pass === 0 ? 0.0 : f64(pass) * repeatStep

      if (pass > 0) {
        if (!didAllPlay || repeatStep <= 0.0 || offset >= parentSlotDuration) break
      }

      for (let i: f64 = 0; i < childrenLength; i++) {
        const childOpOffset = this.childOpsBuffer.get(i32(i))
        const opcode = reader.getOpcode(childOpOffset)

        // Evenly distribute children in density space using discrete slots
        const normalizedPosition = i / childrenLength // position in [0, 1)
        const slotIndex = normalizedPosition * slotsRounded

        // advance active slot over cycles
        const activeSlot = cycle % slotsRounded

        if (pass === 0 && opcode === OP_EVENT) {
          const shouldPlay: bool = Math.floor(slotIndex) === Math.floor(activeSlot)
          if (!shouldPlay) {
            didAllPlay = false
            continue
          }
        }

        // phase child start within parent slot over cycles to distribute across time
        let startTime: f64 = normalizedPosition / group.density
        startTime = fract(startTime)
        startTime *= parentSlotDuration
        if (startTime > parentSlotDuration * 0.95) startTime = 0

        this.processChild(
          reader,
          childOpOffset,
          groupStart,
          opcode === OP_EVENT ? startTime + offset : i * slotDuration + offset,
          slotDuration / group.density,
          cycle,
          cycleStartSample,
          cycleSamples,
          groupVelocity,
          groupJitter,
          emitter,
        )
      }

      if (repeatStep <= 0.0) break
      pass++
    }

    return findGroupEnd(reader.array$, opOffset, reader.opEnd)
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
    groupJitter: f64,
    emitter: EventEmitter,
  ): void {
    const opcode = reader.getOpcode(opOffset)

    switch (opcode) {
      case OP_EVENT: {
        const event = reader.getEvent(opOffset)

        if (event.density === 0.0 || event.density > 16) break

        const valueCount: i32 = i32(event.valueCount)
        if (valueCount <= 0) break

        const strum: f64 = event.strum as f64
        const eventOffset: f64 = event.offset as f64
        const eventJitter: f64 = groupJitter + (event.jitter as f64)

        const eventProb: f64 = event.prob as f64
        if (eventProb > 0.0) {
          const eventIndex: i32 = reader.getOpIndex(opOffset)
          const randEvent: f64 = seededRandom01(this.randomSeed, cycle, eventIndex)
          if (randEvent < eventProb) break
        }

        const shouldPlay: bool = (cycle + event.density) % (1.0 / event.density) < 1
        if (!shouldPlay) break

        const durationDividedByDensity: f64 = slotDuration / event.density
        const validSlotDuration = slotDuration - (slotDuration / 8.0)
        let startTime: f64 = floorToFactor(fract(cycle + (cycle % 2 === 0 ? 0.000001 : 0)) % durationDividedByDensity,
          8)
        startTime = fract(startTime)

        while (startTime < validSlotDuration) {
          // emit one voice per value to support chords
          for (let vi: i32 = 0; vi < valueCount; vi++) {
            const rawValue = event.getValue(vi)
            if (rawValue <= 0.0) continue

            // apply group.strum as time spread across chord voices within the slot
            let strumOffset: f64 = 0.0
            if (strum > 0.0 && valueCount > 1) {
              const position: f64 = f64(vi) / f64(valueCount - 1) // 0..1 across chord
              const strumSpan: f64 = slotDuration * (strum > 1.0 ? 1.0 : strum)
              strumOffset = position * strumSpan
            }

            // Apply jitter as a symmetric random offset within the slot duration.
            // Jitter amount is interpreted as a fraction of the slot duration; group jitter
            // accumulates with event jitter.
            let jitterOffset: f64 = 0.0
            if (eventJitter !== 0.0) {
              const eventIndex: i32 = reader.getOpIndex(opOffset)
              const r: f64 = seededRandom01(this.randomSeed, cycle, eventIndex, vi) // 0..1
              jitterOffset = (r - 0.5) * 2.0 * eventJitter * slotDuration
            }

            emitter.emit(
              opOffset,
              groupVelocity,
              groupStartTime + relativeTime + startTime + strumOffset + eventOffset * slotDuration + jitterOffset,
              durationDividedByDensity,
              vi,
            )
          }
          startTime += durationDividedByDensity
        }

        break
      }

      case OP_GROUP_START: {
        this.evaluateGroup(
          reader,
          opOffset,
          groupStartTime + relativeTime,
          slotDuration,
          cycle,
          cycleStartSample,
          cycleSamples,
          groupVelocity,
          groupJitter,
          emitter,
        )
        break
      }
    }
  }
}
