import {
  MINI_BYTECODE_HEADER_SIZE,
  MINI_EVENT_SIZE,
} from './bytecode.ts'
import type { MiniSourceMapEntry, TimelineEvent } from './bytecode.ts'

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
  const maxStretch = Math.max(1, ...stretches.map((s) => (s > 0 ? Math.ceil(s) : 1)))

  // Precompute group starts and cycle durations for stretched events
  const groupStarts = new Map<number, number>()
  const groupCycleDurations = new Map<number, number>()
  for (let i = 0; i < count; i++) {
    const base = MINI_BYTECODE_HEADER_SIZE + i * MINI_EVENT_SIZE
    const stretch = bytecode[base + 8]!
    const stretchPhase = bytecode[base + 9]!

    if (stretch > 1) {
      const phase = Math.floor(stretchPhase)
      if (phase === 0) {
        // This is a group start - find the group end to calculate cycle duration
        const baseStart = bytecode[base + 0]!
        groupStarts.set(i, baseStart)
        // Find the last event in this group (highest phase with same stretch, within reasonable distance)
        let groupEnd = baseStart + (bytecode[base + 1]! - baseStart)
        for (let j = i + 1; j < count; j++) {
          const jBase = MINI_BYTECODE_HEADER_SIZE + j * MINI_EVENT_SIZE
          const jStretch = bytecode[jBase + 8]!
          const jStart = bytecode[jBase + 0]!
          const jEnd = bytecode[jBase + 1]!
          if (Math.abs(jStretch - stretch) < 0.001 && jStart >= baseStart) {
            groupEnd = Math.max(groupEnd, jEnd)
          }
          else if (jStart > groupEnd) {
            // We've passed the group
            break
          }
        }
        const cycleDuration = (groupEnd - baseStart) / stretch
        groupCycleDurations.set(i, cycleDuration)
      }
      else {
        // Find the group start (phase 0 event with same stretch)
        const baseStart = bytecode[base + 0]!
        let groupStart = baseStart
        let groupStartIndex = i
        for (let j = 0; j < i; j++) {
          const jBase = MINI_BYTECODE_HEADER_SIZE + j * MINI_EVENT_SIZE
          const jStretch = bytecode[jBase + 8]!
          const jPhase = Math.floor(bytecode[jBase + 9]!)
          const jStart = bytecode[jBase + 0]!
          if (Math.abs(jStretch - stretch) < 0.001 && jPhase === 0 && jStart <= baseStart) {
            if (jStart < groupStart || groupStart === baseStart) {
              groupStart = jStart
              groupStartIndex = j
            }
          }
        }
        groupStarts.set(i, groupStart)
        const cycleDuration = groupCycleDurations.get(groupStartIndex) ?? 1
        groupCycleDurations.set(i, cycleDuration)
      }
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

    if (stretch > 1) {
      const phase = Math.floor(stretchPhase)
      const groupStart = groupStarts.get(i) ?? baseStart
      const cycleDuration = groupCycleDurations.get(i) ?? 1
      for (let cycle = 0; cycle < maxStretch; cycle++) {
        if (cycle !== phase) continue
        if (probability > 0 && rng.next() < probability) continue
        const offset = baseStart - groupStart
        const start = groupStart + cycle * cycleDuration + offset
        const end = groupStart + cycle * cycleDuration + (baseEnd - groupStart)
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

    // For stretch 1, emit in all cycles
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

  events.sort((a, b) => a.start - b.start)
  return events
}
