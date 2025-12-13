import {
  ARRAY_HEADER_SIZE,
  OP_GROUP_END,
  OP_GROUP_START,
} from '../constants'
import { EventOp, getOpcode, GroupEndOp, GroupStartOp, skipOp } from './ops'

export class MiniEvent {
  opIndex: i32 = 0
  startSample: i32 = 0
  endSample: i32 = 0
  value: f32 = 0
  velocity: f32 = 0
}

export class MiniEventBuffer {
  events: StaticArray<MiniEvent | null> = new StaticArray<MiniEvent | null>(1024)
  writePos: i32 = 0
  size: i32 = 1024

  constructor() {
    for (let i = 0; i < this.size; i++) {
      this.events[i] = new MiniEvent()
    }
  }

  clear(): void {
    this.writePos = 0
    for (let i = 0; i < this.size; i++) {
      const event = this.events[i]
      if (event) {
        event.opIndex = 0
        event.startSample = 0
        event.endSample = 0
        event.value = 0
        event.velocity = 0
      }
    }
  }

  write(opIndex: i32, startSample: i32, endSample: i32, value: f32, velocity: f32): void {
    if (this.writePos >= this.size) return
    const event = this.events[this.writePos]
    if (event) {
      event.opIndex = opIndex
      event.startSample = startSample
      event.endSample = endSample
      event.value = value
      event.velocity = velocity
    }
    this.writePos++
  }
}

export class ChildOpsBuffer {
  private buffer: StaticArray<i32> = new StaticArray<i32>(256)
  length: i32 = 0

  clear(): void {
    this.length = 0
  }

  push(value: i32): void {
    if (this.length < 256) {
      this.buffer[this.length] = value
      this.length++
    }
  }

  get(index: i32): i32 {
    if (index >= 0 && index < this.length) {
      return this.buffer[index]
    }
    return 0
  }
}

export function skipNestedGroup(array$: usize, offset: i32, opEnd: i32): i32 {
  let depth = 1
  let current = offset + GroupStartOp.size()
  while (current < opEnd && depth > 0) {
    const opcode = getOpcode(array$, current)
    if (opcode === OP_GROUP_START) depth++
    else if (opcode === OP_GROUP_END) depth--
    current = skipOp(array$, current)
  }
  return current
}

export function parseGroupChildren(
  array$: usize,
  startOffset: i32,
  opEnd: i32,
  childCount: i32,
  buffer: ChildOpsBuffer,
): void {
  buffer.clear()
  let current = startOffset

  while (current < opEnd && buffer.length < childCount) {
    const opcode = getOpcode(array$, current)
    if (opcode === OP_GROUP_END) {
      current += GroupEndOp.size()
      break
    }

    buffer.push(current)

    if (opcode === OP_GROUP_START) {
      current = skipNestedGroup(array$, current, opEnd)
    }
    else {
      current = skipOp(array$, current)
    }
  }
}

export function timeToSample(time: f32, cycleStartSample: i32, cycleLength: f32, cycleSamples: f32): i32 {
  return cycleStartSample + i32(Mathf.floor(((time * cycleSamples) / cycleLength) as f32))
}

export function findGroupEnd(array$: usize, startOffset: i32, opEnd: i32): i32 {
  let offset = startOffset + GroupStartOp.size()
  let depth = 1
  while (offset < opEnd && depth > 0) {
    const opcode = getOpcode(array$, offset)
    if (opcode === OP_GROUP_START) depth++
    else if (opcode === OP_GROUP_END) depth--
    offset = skipOp(array$, offset)
  }
  return offset
}

export class BytecodeReader {
  array$: usize
  opEnd: i32

  constructor() {
    this.array$ = 0
    this.opEnd = 0
  }

  update(array$: usize, opEnd: i32): void {
    this.array$ = array$
    this.opEnd = opEnd
  }

  getOpcode(offset: i32): i32 {
    return getOpcode(this.array$, offset)
  }

  getGroup(offset: i32): GroupStartOp {
    return GroupStartOp.at(this.array$, offset)
  }

  getEvent(offset: i32): EventOp {
    return EventOp.at(this.array$, offset)
  }

  getOpIndex(offset: i32): i32 {
    return offset - ARRAY_HEADER_SIZE
  }
}

export class EvaluationContext {
  cycleStartSample: i32
  cycleLength: f32
  cycleSamples: f32
  windowStart: i32
  windowEnd: i32

  constructor() {
    this.cycleStartSample = 0
    this.cycleLength = 0.0
    this.cycleSamples = 0.0
    this.windowStart = 0
    this.windowEnd = 0
  }

  update(
    cycleStartSample: i32,
    cycleLength: f32,
    cycleSamples: f32,
    windowStart: i32,
    windowEnd: i32,
  ): void {
    this.cycleStartSample = cycleStartSample
    this.cycleLength = cycleLength
    this.cycleSamples = cycleSamples
    this.windowStart = windowStart
    this.windowEnd = windowEnd
  }

  timeToSample(time: f32): i32 {
    return timeToSample(time, this.cycleStartSample, this.cycleLength, this.cycleSamples)
  }

  isInWindow(startSample: i32, endSample: i32): bool {
    return endSample > this.windowStart && startSample < this.windowEnd
  }
}

export class EventEmitter {
  ctx: EvaluationContext
  buffer: MiniEventBuffer | null
  reader: BytecodeReader

  constructor(ctx: EvaluationContext, reader: BytecodeReader) {
    this.ctx = ctx
    this.buffer = null
    this.reader = reader
  }

  update(buffer: MiniEventBuffer): void {
    this.buffer = buffer
  }

  emit(
    opOffset: i32,
    group: GroupStartOp,
    currentTime: f32,
    slotDuration: f32,
  ): void {
    if (!this.buffer) return

    const event = this.reader.getEvent(opOffset)
    const startSample = this.ctx.timeToSample(currentTime)
    const endSample = this.ctx.timeToSample(currentTime + slotDuration)

    if (this.ctx.isInWindow(startSample, endSample)) {
      this.buffer!.write(
        this.reader.getOpIndex(opOffset),
        startSample,
        endSample,
        event.getValue(0),
        event.velocity * group.velocity,
      )
    }
  }
}
