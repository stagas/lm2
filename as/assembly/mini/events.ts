import {
  ARRAY_HEADER_SIZE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_GROUP_START,
} from '../constants'
import { GroupStartOp } from './ops'
import { BytecodeReader, ChildOpsBuffer, EvaluationContext, EventEmitter, findGroupEnd, MiniEventBuffer,
  parseGroupChildren } from './util'

export { MiniEventBuffer }

export class MiniEvents {
  private childOpsBuffer: ChildOpsBuffer = new ChildOpsBuffer()
  private reader: BytecodeReader = new BytecodeReader()
  private context: EvaluationContext = new EvaluationContext()
  private emitter: EventEmitter = new EventEmitter(this.context, this.reader)

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
    this.context.update(cycleStartSample, cycleLength, cycleSamples, windowStart, windowEnd)
    this.emitter.update(eventBuffer)

    this.evaluateGroup(this.reader, opStart, 0.0, 1.0, this.context, this.emitter)
  }

  private evaluateGroup(
    reader: BytecodeReader,
    opOffset: i32,
    timeOffset: f32,
    parentSlotDuration: f32,
    context: EvaluationContext,
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
    let currentTime = timeOffset

    for (let i = 0; i < this.childOpsBuffer.length; i++) {
      const childOpOffset = this.childOpsBuffer.get(i)
      currentTime = this.processChild(reader, childOpOffset, group, currentTime, slotDuration, context, emitter)
    }

    return findGroupEnd(reader.array$, opOffset, reader.opEnd)
  }

  private processChild(
    reader: BytecodeReader,
    opOffset: i32,
    group: GroupStartOp,
    currentTime: f32,
    slotDuration: f32,
    context: EvaluationContext,
    emitter: EventEmitter,
  ): f32 {
    const opcode = reader.getOpcode(opOffset)

    switch (opcode) {
      case OP_EVENT:
        emitter.emit(opOffset, group, currentTime, slotDuration)
        break

      case OP_GROUP_START:
        this.evaluateGroup(reader, opOffset, currentTime, slotDuration, context, emitter)
        break
    }

    return currentTime + slotDuration
  }
}
