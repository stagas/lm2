import type { MiniBytecodeResult, MiniSourceMapEntry, TimelineEvent } from './bytecode.ts'
import { MINI_BYTECODE_HEADER_SIZE, MINI_EVENT_SIZE } from './bytecode.ts'

function seededRandom(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
}

function readEvent(bytecode: Float32Array, eventIndex: number): {
  start: number
  end: number
  hold: number
  velocity: number
  value: number
  glide: number
  glidePower: number
  probability: number
} {
  const base = MINI_BYTECODE_HEADER_SIZE + eventIndex * MINI_EVENT_SIZE
  return {
    start: bytecode[base + 0]!,
    end: bytecode[base + 1]!,
    hold: bytecode[base + 2]!,
    velocity: bytecode[base + 3]!,
    value: bytecode[base + 4]!,
    glide: bytecode[base + 5]!,
    glidePower: bytecode[base + 6]!,
    probability: bytecode[base + 7]!,
  }
}

export function evaluateMiniBytecode(
  bytecode: Float32Array,
  options: {
    from?: number
    to?: number
    seed?: number
    sourceMap?: MiniSourceMapEntry[]
  } = {},
): TimelineEvent[] {
  const from = options.from ?? 0
  const to = options.to ?? Number.POSITIVE_INFINITY
  const seed = options.seed ?? 1
  const sourceMap = options.sourceMap ?? []

  const random = seededRandom(seed)
  const eventCount = bytecode[0]!
  const events: TimelineEvent[] = []

  // Calculate cycle length from maximum end value
  let maxEnd = 0
  for (let i = 0; i < eventCount; i++) {
    const event = readEvent(bytecode, i)
    if (event.end > maxEnd) {
      maxEnd = event.end
    }
  }
  const cycleLength = Math.ceil(maxEnd)
  if (cycleLength <= 0) return events

  // Determine how many cycles we need to cover the requested range
  const cyclesNeeded = Math.ceil((to - from) / cycleLength) + 1
  const startCycle = Math.floor(from / cycleLength)

  for (let cycle = startCycle; cycle < startCycle + cyclesNeeded; cycle++) {
    for (let i = 0; i < eventCount; i++) {
      const event = readEvent(bytecode, i)

      if (event.probability > 0 && random() < event.probability) {
        continue
      }

      // Events repeat every cycle
      let eventStart = event.start + cycle * cycleLength
      let eventEnd = event.end + cycle * cycleLength

      if (event.hold > 0) {
        eventEnd = eventStart + event.hold
      }

      const jitter = event.probability === 0 ? 0 : (random() - 0.5) * 2 * (event.probability || 0)
      eventStart += jitter
      eventEnd += jitter

      if (eventStart < to && eventEnd > from) {
        const source = sourceMap[i]
        events.push({
          start: eventStart,
          end: eventEnd,
          hold: event.value > 0 ? 1 : 0,
          velocity: event.velocity,
          value: event.value,
          glide: event.glide,
          glidePower: event.glidePower,
          prob: event.probability,
          source: source
            ? {
              eventIndex: source.eventIndex,
              start: source.start,
              length: source.length,
              text: source.text,
            }
            : undefined,
        })
      }
    }
  }

  return events.sort((a, b) => a.start - b.start)
}
