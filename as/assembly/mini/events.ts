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
  floorToDecimals,
  floorToFactor,
  fract,
  MiniEventBuffer,
  parseGroupChildren,
  roundToDecimals,
  roundToFactor,
} from './util'

export { MiniEventBuffer }

export class MiniEvents {
  private childOpsBuffer: ChildOpsBuffer = new ChildOpsBuffer()
  private reader: BytecodeReader = new BytecodeReader()
  private emitter: EventEmitter = new EventEmitter(this.reader)

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

    this.reader.update(bytecode$, opEnd)
    this.emitter.update(eventBuffer, cycleStartSample, cycleLength, cycleSamples, windowStart, windowEnd)

    const cycle = cycleSamples > 0.0 ? i32(Mathf.floor((cycleStartSample as f32) / cycleSamples)) : 0
    this.evaluateGroup(this.reader, opStart, 0.0, 1.0, cycle, cycleStartSample, cycleSamples, this.emitter)
  }

  private evaluateGroup(
    reader: BytecodeReader,
    opOffset: i32,
    groupStartTime: f64,
    parentSlotDuration: f64,
    cycle: f64,
    cycleStartSample: i32,
    cycleSamples: f64,
    emitter: EventEmitter,
  ): i32 {
    if (opOffset >= reader.opEnd || reader.getOpcode(opOffset) !== OP_GROUP_START) {
      return opOffset
    }

    const group = reader.getGroup(opOffset)

    parseGroupChildren(
      reader.array$,
      opOffset + GroupStartOp.size(),
      reader.opEnd,
      i32(group.childCount),
      this.childOpsBuffer,
    )

    const childrenLength = f64(this.childOpsBuffer.length)

    if (childrenLength === 0.0) {
      return findGroupEnd(reader.array$, opOffset, reader.opEnd)
    }

    const slotDuration = parentSlotDuration / childrenLength

    if (group.density === 0.0 || group.density > 128.0) {
      return findGroupEnd(reader.array$, opOffset, reader.opEnd)
    }

    // interpret density like a slot selector over children across cycles:
    // density < 1 spreads children across multiple cycles, density >= 1
    // allows multiple children per cycle.
    const invDensity: f64 = 1.0 / group.density
    let slots: f64 = invDensity
    if (slots < 1.0) slots = 1.0
    const slotsRounded: f64 = Math.max(1.0, Math.round(slots))

    for (let i: f64 = 0; i < childrenLength; i++) {
      const childOpOffset = this.childOpsBuffer.get(i32(i))
      const opcode = reader.getOpcode(childOpOffset)

      // Evenly distribute children in density space using discrete slots
      const normalizedPosition = i / childrenLength // position in [0, 1)
      const slotIndex = normalizedPosition * slotsRounded

      // advance active slot over cycles
      const activeSlot = cycle % slotsRounded

      const shouldPlay: bool = opcode === OP_EVENT
        ? Math.floor(slotIndex) === Math.floor(activeSlot)
        : true

      if (!shouldPlay) continue

      // phase child start within parent slot over cycles to distribute across time
      let startTime: f64 = normalizedPosition / group.density
      startTime = fract(startTime)
      startTime *= parentSlotDuration
      if (startTime > parentSlotDuration * 0.95) startTime = 0

      this.processChild(
        reader,
        childOpOffset,
        group,
        groupStartTime,
        opcode === OP_EVENT ? startTime : i * slotDuration,
        slotDuration / group.density,
        cycle,
        cycleStartSample,
        cycleSamples,
        emitter,
      )
    }

    return findGroupEnd(reader.array$, opOffset, reader.opEnd)
  }

  private processChild(
    reader: BytecodeReader,
    opOffset: i32,
    group: GroupStartOp,
    groupStartTime: f64,
    relativeTime: f64,
    slotDuration: f64,
    cycle: f64,
    cycleStartSample: i32,
    cycleSamples: f64,
    emitter: EventEmitter,
  ): void {
    const opcode = reader.getOpcode(opOffset)

    switch (opcode) {
      case OP_EVENT: {
        const event = reader.getEvent(opOffset)

        if (event.density === 0.0 || event.density > 128) break

        const shouldPlay: bool = (cycle + event.density) % (1.0 / event.density) < 1
        if (!shouldPlay) break

        const durationDividedByDensity: f64 = slotDuration / event.density
        const validSlotDuration = slotDuration - (slotDuration / 8.0)
        let startTime: f64 = floorToFactor(fract(cycle + (cycle % 2 === 0 ? 0.000001 : 0)) % durationDividedByDensity,
          8)
        startTime = fract(startTime)
        // console.log(`startTime: ${startTime}`)
        // startTime = floorToFactor(startTime % validSlotDuration, 8)

        while (startTime < validSlotDuration) {
          emitter.emit(
            opOffset,
            group,
            groupStartTime + relativeTime + startTime,
            durationDividedByDensity,
          )
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
          emitter,
        )
        break
      }
    }
  }
}
