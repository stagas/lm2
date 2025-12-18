import {
  ARRAY_HEADER_SIZE,
  MINI_HEADER_SIZE,
  OP_CYCLE_END,
  OP_CYCLE_START,
  OP_GROUP_END,
  OP_GROUP_START,
} from '../constants'
import { CycleEndOp, CycleStartOp, EventOp, getOpcode, GroupEndOp, GroupStartOp, OctaveOp, ScaleOp, skipOp,
  TransposeOp } from './ops'

export class MiniEvent {
  opIndex: i32 = 0
  voiceIndex: i32 = 0
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
        event.voiceIndex = 0
        event.startSample = 0
        event.endSample = 0
        event.value = 0
        event.velocity = 0
      }
    }
  }

  write(opIndex: i32, voiceIndex: i32, startSample: i32, endSample: i32, value: f32, velocity: f32): void {
    if (this.writePos >= this.size) return
    const event = this.events[this.writePos]
    if (event) {
      event.opIndex = opIndex
      event.voiceIndex = voiceIndex
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
  const startOpcode = getOpcode(array$, offset)
  let current = offset + (startOpcode === OP_CYCLE_START ? CycleStartOp.size() : GroupStartOp.size())
  while (current < opEnd && depth > 0) {
    const opcode = getOpcode(array$, current)
    if (opcode === OP_GROUP_START || opcode === OP_CYCLE_START) depth++
    else if (opcode === OP_GROUP_END || opcode === OP_CYCLE_END) depth--
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
    if (opcode === OP_GROUP_END || opcode === OP_CYCLE_END) {
      current += opcode === OP_CYCLE_END ? CycleEndOp.size() : GroupEndOp.size()
      break
    }

    buffer.push(current)

    if (opcode === OP_GROUP_START || opcode === OP_CYCLE_START) {
      current = skipNestedGroup(array$, current, opEnd)
    }
    else {
      current = skipOp(array$, current)
    }
  }
}

export function timeToSample(time: f64, cycleStartSample: i32, cycleLength: f64, cycleSamples: f64): i32 {
  return cycleStartSample + i32(Math.floor((time * cycleSamples) / cycleLength))
}

export function findGroupEnd(array$: usize, startOffset: i32, opEnd: i32): i32 {
  let offset = startOffset + GroupStartOp.size()
  let depth = 1
  while (offset < opEnd && depth > 0) {
    const opcode = getOpcode(array$, offset)
    if (opcode === OP_GROUP_START || opcode === OP_CYCLE_START) depth++
    else if (opcode === OP_GROUP_END || opcode === OP_CYCLE_END) depth--
    offset = skipOp(array$, offset)
  }
  return offset
}

export function seededRandom01(baseSeed: u32, cycle: f64, opIndex: i32, valueIndex: i32 = 0): f64 {
  let state: i32 = i32(baseSeed)
  state ^= i32(cycle) * 374761393
  state ^= opIndex * 668265263
  state ^= valueIndex * 224682251

  state = (state * 9301 + 49297) % 233280
  if (state < 0) state += 233280

  return f64(state) / 233280.0
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

  getCycle(offset: i32): CycleStartOp {
    return CycleStartOp.at(this.array$, offset)
  }

  getEvent(offset: i32): EventOp {
    return EventOp.at(this.array$, offset)
  }

  getOctave(offset: i32): OctaveOp {
    return OctaveOp.at(this.array$, offset)
  }

  getTranspose(offset: i32): TransposeOp {
    return TransposeOp.at(this.array$, offset)
  }

  getScale(offset: i32): ScaleOp {
    return ScaleOp.at(this.array$, offset)
  }

  getOpIndex(offset: i32): i32 {
    return offset - (ARRAY_HEADER_SIZE + MINI_HEADER_SIZE)
  }
}

export class EventEmitter {
  buffer: MiniEventBuffer | null
  reader: BytecodeReader
  cycleStartSample: i32
  cycleLength: f32
  cycleSamples: f32
  windowStart: i32
  windowEnd: i32

  constructor(reader: BytecodeReader) {
    this.buffer = null
    this.reader = reader
    this.cycleStartSample = 0
    this.cycleLength = 0.0
    this.cycleSamples = 0.0
    this.windowStart = 0
    this.windowEnd = 0
  }

  update(
    buffer: MiniEventBuffer,
    cycleStartSample: i32,
    cycleLength: f32,
    cycleSamples: f32,
    windowStart: i32,
    windowEnd: i32,
  ): void {
    this.buffer = buffer
    this.cycleStartSample = cycleStartSample
    this.cycleLength = cycleLength
    this.cycleSamples = cycleSamples
    this.windowStart = windowStart
    this.windowEnd = windowEnd
  }

  emit(
    opOffset: i32,
    groupVelocity: f64,
    time: f64,
    slotDuration: f64,
    hold: f64,
    voiceIndex: i32,
    value: f64,
  ): void {
    if (!this.buffer) return

    const event = this.reader.getEvent(opOffset)
    const startSample = timeToSample(time, this.cycleStartSample, this.cycleLength, this.cycleSamples)

    // interpret hold as a factor of the slot duration:
    // hold = 1 => full slot, hold = 0.5 => half slot, hold = 0 => single-sample trigger
    // hold > 1 extends beyond the slot.
    let endSample: i32 = startSample + 1
    if (hold > 0.0) {
      endSample = timeToSample(
        time + slotDuration * hold,
        this.cycleStartSample,
        this.cycleLength,
        this.cycleSamples,
      )
      if (endSample <= startSample) endSample = startSample + 1
    }

    if (value <= 0.0) return

    // History generation is incremental; only write events whose startSample falls in the requested window.
    if (startSample >= this.windowStart && startSample < this.windowEnd) {
      this.buffer!.write(
        this.reader.getOpIndex(opOffset),
        voiceIndex,
        startSample,
        endSample,
        value as f32,
        event.velocity * (groupVelocity as f32),
      )
    }
  }

  emitControl(
    opOffset: i32,
    groupVelocity: f64,
    time: f64,
  ): void {
    if (!this.buffer) return

    const startSample: i32 = timeToSample(
      time,
      this.cycleStartSample,
      this.cycleLength as f64,
      this.cycleSamples as f64,
    )

    const endSample: i32 = startSample + 1
    const opcode: i32 = this.reader.getOpcode(opOffset)
    this.buffer!.write(
      this.reader.getOpIndex(opOffset),
      -opcode,
      startSample,
      endSample,
      1.0,
      groupVelocity as f32,
    )
  }
}
