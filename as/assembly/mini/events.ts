import {
  ARRAY_HEADER_SIZE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_GROUP_START,
} from '../constants'
import { GroupStartOp } from './ops'
import { BytecodeReader, ChildOpsBuffer, EventEmitter, findGroupEnd, MiniEventBuffer, parseGroupChildren } from './util'

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

    const currentCycle = cycleSamples > 0.0 ? i32(Mathf.floor((cycleStartSample as f32) / cycleSamples)) : 0
    this.evaluateGroup(this.reader, opStart, 0.0, 1.0, currentCycle, cycleStartSample, cycleSamples, this.emitter)
  }

  private evaluateGroup(
    reader: BytecodeReader,
    opOffset: i32,
    groupStartTime: f32,
    parentSlotDuration: f32,
    currentCycle: i32,
    cycleStartSample: i32,
    cycleSamples: f32,
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

    if (this.childOpsBuffer.length === 0) {
      return findGroupEnd(reader.array$, opOffset, reader.opEnd)
    }

    const slotDuration = parentSlotDuration / (this.childOpsBuffer.length as f32)
    for (let i = 0; i < this.childOpsBuffer.length; i++) {
      const childOpOffset = this.childOpsBuffer.get(i)
      this.processChild(
        reader,
        childOpOffset,
        group,
        groupStartTime,
        f32(i) * slotDuration,
        slotDuration,
        currentCycle,
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
    groupStartTime: f32,
    relativeTime: f32,
    slotDuration: f32,
    currentCycle: i32,
    cycleStartSample: i32,
    cycleSamples: f32,
    emitter: EventEmitter,
  ): void {
    const opcode = reader.getOpcode(opOffset)

    switch (opcode) {
      case OP_EVENT: {
        const event = reader.getEvent(opOffset)

        // Density controls event occurrence frequency:
        // density = 1: plays every cycle
        // density = 2: plays twice per cycle
        // density = 1/3: plays once every 3 cycles

        if (event.density >= 1.0) {
          // Fast: multiple events per slot
          const eventsPerSlot = event.density
          const singleEventDuration = slotDuration / eventsPerSlot
          const numEvents = i32(Mathf.ceil(eventsPerSlot))

          for (let rep = 0; rep < numEvents; rep++) {
            const eventStart = groupStartTime + relativeTime + (f32(rep) * singleEventDuration)
            const slotEnd = groupStartTime + relativeTime + slotDuration

            if (eventStart < slotEnd) {
              const remainingSpace = slotEnd - eventStart
              const eventDuration = Mathf.min(singleEventDuration, remainingSpace)

              emitter.emit(
                opOffset,
                group,
                eventStart,
                eventDuration,
              )
            }
          }
        }
        else {
          // Slow: event plays once every (1/density) cycles
          // For density = 1/1.5, event fires every 1.5 cycles at: 0.5, 2.0, 3.5, 5.0...
          // For density = 1/3, event fires every 3 cycles at: 0.5, 3.5, 6.5, 9.5...

          const interval: f32 = 1.0 / event.density

          // Use the slot's position in the first cycle as reference (relativeTime is the slot position)
          const firstOccurrence = relativeTime

          // Find which occurrences fall in the current cycle [currentCycle, currentCycle+1)
          const cycleStart = f32(currentCycle)
          const cycleEnd = cycleStart + 1.0

          // Calculate the occurrence index range
          // firstOccurrence + n * interval should be in [cycleStart, cycleEnd)
          const minN = Mathf.ceil((cycleStart - firstOccurrence) / interval)
          const maxN = Mathf.floor((cycleEnd - firstOccurrence - 0.0001) / interval)

          // Emit all occurrences in this cycle
          for (let n = minN; n <= maxN; n++) {
            const eventTime = firstOccurrence + f32(n) * interval

            if (eventTime >= cycleStart && eventTime < cycleEnd) {
              emitter.emit(
                opOffset,
                group,
                groupStartTime + (eventTime - cycleStart),
                slotDuration,
              )
            }
          }
        }
        break
      }

      case OP_GROUP_START: {
        this.evaluateGroup(
          reader,
          opOffset,
          groupStartTime + relativeTime,
          slotDuration,
          currentCycle,
          cycleStartSample,
          cycleSamples,
          emitter,
        )
        break
      }
    }
  }
}
