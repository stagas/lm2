export const MINI_EVENT_SIZE = 8
export const MINI_BYTECODE_HEADER_SIZE = 1

export interface MiniBytecodeResult {
  bytecode: Float32Array
  sourceMap: MiniSourceMapEntry[]
}

export interface MiniSourceMapEntry {
  eventIndex: number
  start: number
  length: number
  text: string
}

export interface TimelineEvent {
  start: number
  end: number
  trigger: number
  velocity: number
  value: number
  glide: number
  glidePower: number
  probability: number
  source?: MiniSourceMapEntry
}

export function allocateBytecode(eventCount: number): Float32Array {
  const size = MINI_BYTECODE_HEADER_SIZE + eventCount * MINI_EVENT_SIZE
  return new Float32Array(size)
}

export function writeEvent(
  buffer: Float32Array,
  eventIndex: number,
  start: number,
  end: number,
  trigger: number,
  velocity: number,
  value: number,
  glide: number,
  glidePower: number,
  probability: number,
): void {
  const base = MINI_BYTECODE_HEADER_SIZE + eventIndex * MINI_EVENT_SIZE
  buffer[base + 0] = start
  buffer[base + 1] = end
  buffer[base + 2] = trigger
  buffer[base + 3] = velocity
  buffer[base + 4] = value
  buffer[base + 5] = glide
  buffer[base + 6] = glidePower
  buffer[base + 7] = probability
}

