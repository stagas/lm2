import {
  MINI_BYTECODE_HEADER_SIZE,
  MINI_EVENT_SIZE,
} from './mini-notation-bytecode.ts'
import type { MiniSourceMapEntry, TimelineEvent } from './mini-notation-bytecode.ts'

class Lcg {
  #state: number

  constructor(seed: number) {
    this.#state = seed >>> 0
  }

  next(): number {
    this.#state = (this.#state * 1664525 + 1013904223) >>> 0
    return this.#state / 0xFFFFFFFF
  }
}

export interface EvaluateOptions {
  from?: number
  to?: number
  seed?: number
  sourceMap?: MiniSourceMapEntry[]
}

export function evaluateMiniBytecode(
  bytecode: Float32Array,
  options: EvaluateOptions = {},
): TimelineEvent[] {
  const from = options.from ?? 0
  const to = options.to ?? Number.POSITIVE_INFINITY
  const count = Math.floor(bytecode[0] ?? 0)
  const rng = new Lcg(options.seed ?? 1)
  const sourcesByIndex = new Map<number, MiniSourceMapEntry>()

  if (options.sourceMap) {
    for (const entry of options.sourceMap) {
      sourcesByIndex.set(entry.eventIndex, entry)
    }
  }

  const events: TimelineEvent[] = []
  for (let i = 0; i < count; i++) {
    const base = MINI_BYTECODE_HEADER_SIZE + i * MINI_EVENT_SIZE
    const start = bytecode[base + 0]!
    const end = bytecode[base + 1]!
    const trigger = bytecode[base + 2]!
    const velocity = bytecode[base + 3]!
    const value = bytecode[base + 4]!
    const glide = bytecode[base + 5]!
    const glidePower = bytecode[base + 6]!
    const probability = bytecode[base + 7]!

    if (probability > 0 && rng.next() < probability) continue
    if (end <= from || start >= to) continue

    events.push({
      start,
      end,
      trigger,
      velocity,
      value,
      glide,
      glidePower,
      probability,
      source: sourcesByIndex.get(i)!,
    })
  }

  events.sort((a, b) => a.start - b.start)
  return events
}
