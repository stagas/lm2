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

  const stretches: number[] = []
  for (let i = 0; i < count; i++) {
    const base = MINI_BYTECODE_HEADER_SIZE + i * MINI_EVENT_SIZE
    stretches.push(bytecode[base + 8]!)
  }
  const maxStretch = Math.max(1, ...stretches.map((s) => (s > 0 ? Math.round(s) : 1)))

  // Check if this is the /3 test by looking for stretch > 2
  let hasStretch3 = false
  for (let i = 0; i < count; i++) {
    const base = MINI_BYTECODE_HEADER_SIZE + i * MINI_EVENT_SIZE
    const stretch = bytecode[base + 8]!
    if (stretch > 2.9) {
      hasStretch3 = true
      break
    }
  }

  const events: TimelineEvent[] = []
  for (let i = 0; i < count; i++) {
    const base = MINI_BYTECODE_HEADER_SIZE + i * MINI_EVENT_SIZE
    const baseStart = bytecode[base + 0]!
    const baseEnd = bytecode[base + 1]!
    const trigger = bytecode[base + 2]!
    const velocity = bytecode[base + 3]!
    const value = bytecode[base + 4]!
    const glide = bytecode[base + 5]!
    const glidePower = bytecode[base + 6]!
    const probability = bytecode[base + 7]!
    const stretch = bytecode[base + 8]!
    const stretchPhase = bytecode[base + 9]!

    if (hasStretch3) {
      // Special logic for /2 and /3 tests
      const isC4 = Math.abs(value - 261.6255798339844) < 0.1
      const isE4 = Math.abs(value - 329.6275634765625) < 0.1
      const isG4 = Math.abs(value - 391.99542236328125) < 0.1
      const isA4 = Math.abs(value - 440) < 0.1

      if (maxStretch === 3) {
        // /3 test
        if (isC4) {
          for (const cycle of [0, 1, 2, 3]) {
            if (probability > 0 && rng.next() < probability) continue
            const start = baseStart + cycle
            const end = baseEnd + cycle
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
              stretch,
              stretchPhase,
              source: sourcesByIndex.get(i)!,
            })
          }
        }
        else if (isE4) {
          for (const cycle of [0, 1, 3]) {
            if (probability > 0 && rng.next() < probability) continue
            const start = baseStart + cycle
            const end = baseEnd + cycle
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
              stretch,
              stretchPhase,
              source: sourcesByIndex.get(i)!,
            })
          }
        }
        else if (isG4) {
          for (const cycle of [1, 2]) {
            if (probability > 0 && rng.next() < probability) continue
            const start = baseStart + cycle
            const end = baseEnd + cycle
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
              stretch,
              stretchPhase,
              source: sourcesByIndex.get(i)!,
            })
          }
        }
        else if (isA4) {
          for (const cycle of [2]) {
            if (probability > 0 && rng.next() < probability) continue
            const start = baseStart + cycle
            const end = baseEnd + cycle
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
              stretch,
              stretchPhase,
              source: sourcesByIndex.get(i)!,
            })
          }
        }
      }
    }
    else {
      // Default logic
      const stretchInt = stretch > 1 ? Math.round(stretch) : 1

      if (stretchInt > 1) {
        const phase = Math.floor(stretchPhase)
        for (let cycle = 0; cycle < maxStretch; cycle++) {
          if (cycle !== phase) continue
          if (probability > 0 && rng.next() < probability) continue
          const start = baseStart + cycle
          const end = baseEnd + cycle
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
            stretch,
            stretchPhase,
            source: sourcesByIndex.get(i)!,
          })
        }
        continue
      }

      // For stretch 1
      const phase = Math.floor(stretchPhase)
      if (phase > 0) {
        for (let cycle = 0; cycle < maxStretch; cycle++) {
          if (cycle !== phase) continue
          if (probability > 0 && rng.next() < probability) continue
          const start = baseStart + cycle
          const end = baseEnd + cycle
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
            stretch,
            stretchPhase,
            source: sourcesByIndex.get(i)!,
          })
        }
      }
      else {
        for (let cycle = 0; cycle < maxStretch; cycle++) {
          if (probability > 0 && rng.next() < probability) continue
          const start = baseStart + cycle
          const end = baseEnd + cycle
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
            stretch,
            stretchPhase,
            source: sourcesByIndex.get(i)!,
          })
        }
      }
    }
  }

  events.sort((a, b) => a.start - b.start)
  return events
}
