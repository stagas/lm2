import { MAX_EVENT_VALUES, MINI_HEADER_SIZE, OP_EVENT, OP_EVENT_BASE_SIZE, OP_GROUP_END, OP_GROUP_END_SIZE,
  OP_GROUP_START, OP_GROUP_START_SIZE, OP_REST, OP_REST_SIZE } from '../../as/assembly/constants.ts'
import type { Modifiers, NodeSource } from './tokenizer.ts'

export interface MiniSourceMapEntry {
  eventIndex: number
  source: NodeSource
}

export interface TimelineEvent {
  start: number
  end: number
  value: number
  velocity: number
  hold: number
  glide: number
  prob: number
  source?: MiniSourceMapEntry
}

export function allocateBytecode(operationCount: number): Float32Array {
  const size = MINI_HEADER_SIZE + operationCount * Math.max(OP_EVENT_BASE_SIZE, OP_GROUP_START_SIZE)
  return new Float32Array(size)
}

export function writeEventOp(
  buffer: Float32Array,
  offset: number,
  values: number[],
  modifiers: Modifiers,
): number {
  const base = MINI_HEADER_SIZE + offset
  let pc = 0
  function emit(op: number) {
    buffer[base + pc] = op
    pc++
  }
  emit(OP_EVENT)
  emit(values.length)
  emit(modifiers.velocity)
  emit(modifiers.hold)
  emit(modifiers.replicate)
  emit(modifiers.elongate)
  emit(modifiers.density)
  emit(modifiers.offset)
  emit(modifiers.jitter)
  emit(modifiers.prob)
  emit(modifiers.glide)
  emit(modifiers.strum)
  for (let i = 0; i < MAX_EVENT_VALUES; i++) {
    emit(values[i] ?? 0)
  }
  return OP_EVENT_BASE_SIZE
}

export function writeGroupStartOp(
  buffer: Float32Array,
  offset: number,
  childCount: number,
  angle: boolean,
  modifiers: Modifiers,
): number {
  const base = MINI_HEADER_SIZE + offset
  let pc = 0
  function emit(op: number) {
    buffer[base + pc] = op
    pc++
  }
  emit(OP_GROUP_START)
  emit(childCount)
  emit(angle ? 1 : 0)
  emit(modifiers.velocity)
  emit(modifiers.hold)
  emit(modifiers.replicate)
  emit(modifiers.elongate)
  emit(modifiers.density)
  emit(modifiers.offset)
  emit(modifiers.jitter)
  emit(modifiers.prob)
  emit(modifiers.glide)
  emit(modifiers.strum)
  return OP_GROUP_START_SIZE
}

export function writeGroupEndOp(
  buffer: Float32Array,
  offset: number,
): number {
  const base = MINI_HEADER_SIZE + offset
  buffer[base + 0] = OP_GROUP_END
  return OP_GROUP_END_SIZE
}

export function writeRestOp(
  buffer: Float32Array,
  offset: number,
): number {
  const base = MINI_HEADER_SIZE + offset
  buffer[base + 0] = OP_REST
  return OP_REST_SIZE
}
