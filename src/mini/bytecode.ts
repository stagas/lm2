import { MINI_EVENT_SIZE, MINI_HEADER_SIZE } from '../../as/assembly/constants.ts'
import type { NodeSource } from './tokenizer.ts'

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

export function allocateBytecode(eventCount: number): Float32Array {
  const size = MINI_HEADER_SIZE + eventCount * MINI_EVENT_SIZE
  return new Float32Array(size)
}

export function writeEvent(
  buffer: Float32Array,
  eventIndex: number,
  start: number,
  end: number,
  value: number,
  velocity: number,
  hold: number,
  glide: number,
  prob: number,
): void {
  const base = MINI_HEADER_SIZE + eventIndex * MINI_EVENT_SIZE
  buffer[base + 0] = start
  buffer[base + 1] = end
  buffer[base + 2] = value
  buffer[base + 3] = velocity
  buffer[base + 4] = hold
  buffer[base + 5] = glide
  buffer[base + 6] = prob
}
