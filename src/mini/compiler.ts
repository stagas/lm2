import { allocateBytecode, type MiniBytecodeResult, type MiniSourceMapEntry, type TimelineEvent,
  writeEvent } from './bytecode.ts'
import { type Node, tokenize, tokensToNodes } from './tokenizer.ts'

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

function slotSpan(node: Node): number {
  const base = node.type === 'group'
    ? (node.angle
      ? node.children.reduce((sum, child) => sum + slotSpan(child), 0) || 1
      : 1)
    : 1
  return base * node.modifiers.elongate * node.modifiers.replicate
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function calculateStretchPhase(
  childIndex: number,
  childCount: number,
  activeStretch: number,
): number {
  if (childCount === 1) {
    return activeStretch - 1
  }
  return childIndex % activeStretch
}

function emitNode(
  node: Node,
  start: number,
  duration: number,
  events: TimelineEvent[],
  source: MiniSourceMapEntry[],
  rng: Lcg,
  stretchFactor: number,
  stretchPhase: number,
  stretchCycleStart: number,
  stretchCycleDuration: number,
): void {
  const mods = node.modifiers
  const replicate = Math.max(1, Math.round(mods.replicate))
  const nodeStretch = mods.stretch > 0 ? mods.stretch : 1
  const repDuration = duration / replicate

  for (let rep = 0; rep < replicate; rep++) {
    const repStart = start + rep * repDuration

    // Determine stretch context - stretch is multiplicative
    const activeStretch = stretchFactor * nodeStretch
    const activePhase = stretchPhase * Math.max(0, 2 - nodeStretch)
    const activeCycleDuration = stretchCycleDuration
      + (repDuration - stretchCycleDuration) * Math.min(1, nodeStretch - 1)
    let activeCycleStart = stretchCycleStart
      + (repStart - stretchCycleStart) * Math.min(1, nodeStretch - 1)

    if (node.type === 'group') {
      const repeat = Math.max(1, Math.round(mods.repeat))
      const repeatDuration = repDuration / repeat
      const prob = clamp01(mods.probability)

      for (let r = 0; r < repeat; r++) {
        if (prob > 0 && rng.next() < prob) continue

        const jitter = mods.jitter !== 0 ? (rng.next() * 2 - 1) * mods.jitter * repeatDuration : 0
        const offset = mods.offset * repeatDuration
        const baseStart = repStart + r * repeatDuration
        const groupStart = baseStart + offset + jitter
        if (mods.stretch > 0) activeCycleStart = groupStart

        if (node.angle) {
          const childCount = node.children.length || 1
          const angleDuration = repeatDuration * childCount * mods.elongate
          const childDuration = angleDuration / childCount
          let angleIndex = 0

          for (const child of node.children) {
            let childStart = groupStart + (angleIndex * childDuration)

            const childPhase = nodeStretch > 1
              ? calculateStretchPhase(angleIndex, childCount, activeStretch)
              : activePhase

            emitNode(
              child,
              childStart,
              childDuration,
              events,
              source,
              rng,
              activeStretch,
              childPhase,
              activeCycleStart,
              activeCycleDuration,
            )
            angleIndex++
          }
          continue
        }

        // Square bracket group
        const total = node.children.reduce((sum, child) => sum + slotSpan(child), 0)
        const slotDuration = total > 0 ? repeatDuration / total : repeatDuration
        let cursor = groupStart
        let childIndex = 0
        const childCount = node.children.length

        for (const child of node.children) {
          const span = slotSpan(child)
          let childDuration = nodeStretch > 1 ? repeatDuration : slotDuration * span
          let childStart = nodeStretch > 1 ? groupStart : cursor

          const childPhase = nodeStretch > 1
            ? calculateStretchPhase(childIndex, childCount, activeStretch)
            : activePhase

          emitNode(
            child,
            childStart,
            childDuration,
            events,
            source,
            rng,
            activeStretch,
            childPhase,
            activeCycleStart,
            activeCycleDuration,
          )
          cursor += nodeStretch > 1 ? 0 : childDuration
          childIndex++
        }
      }
      continue
    }

    if (node.type === 'rest') {
      continue
    }

    // Event node
    const repeat = Math.max(1, Math.round(mods.repeat))
    const repeatDuration = repDuration / repeat
    const prob = clamp01(mods.probability)

    for (let r = 0; r < repeat; r++) {
      if (prob > 0 && rng.next() < prob) continue

      const jitter = mods.jitter !== 0 ? (rng.next() * 2 - 1) * mods.jitter * repeatDuration : 0
      const offset = mods.offset * repeatDuration
      const baseStart = repStart + r * repeatDuration
      const eventStart = baseStart + offset + jitter
      const eventDuration = repeatDuration
      const glide = mods.glidePower > 0 ? 1 : 0
      const glidePower = mods.glidePower

      if (node.values.length === 0) continue

      const voices = node.values.length
      if (voices === 0) continue

      const strumStep = mods.strum === 0
        ? 0
        : mods.strum * repeatDuration / Math.max(1, voices - 1)

      // Calculate phase for this repeat
      let phase = stretchPhase
      if (activeCycleDuration > 0 && mods.stretch > 1) {
        if (repeat === 1) {
          // Single event with stretch - use last phase
          phase = activeStretch - 1
        }
        else {
          // Calculate phase based on position within cycle
          const relPos = (eventStart - activeCycleStart) / activeCycleDuration
          phase = Math.floor(relPos * activeStretch)
          phase = Math.max(0, Math.min(activeStretch - 1, phase))
        }
      }

      for (let i = 0; i < voices; i++) {
        const noteStart = eventStart + i * strumStep
        events.push({
          start: noteStart,
          end: noteStart + eventDuration,
          trigger: mods.hold,
          velocity: mods.velocity,
          value: node.values[i]!,
          glide,
          glidePower,
          probability: prob,
          stretch: activeStretch,
          stretchPhase: phase,
        })
        source.push({
          eventIndex: events.length - 1,
          start: node.sourceStart,
          length: node.sourceLength,
          text: node.sourceText,
        })
      }
    }
  }
}

export interface CompileOptions {
  seed?: number
}

export function compileMiniNotation(input: string, options: CompileOptions = {}): MiniBytecodeResult {
  const tokens = tokenize(input)
  const nodes = tokensToNodes(tokens, input)
  const totalSlots = nodes.reduce((sum, node) => sum + slotSpan(node), 0)
  const totalDuration = 1
  const events: TimelineEvent[] = []
  const source: MiniSourceMapEntry[] = []
  const rng = new Lcg(options.seed ?? 1)

  const slotDuration = totalSlots > 0 ? totalDuration / totalSlots : 1
  let cursor = 0
  for (const node of nodes) {
    const span = slotSpan(node)
    const duration = slotDuration * span
    emitNode(node, cursor, duration, events, source, rng, 1, 0, cursor, duration)
    cursor += duration
  }

  // Sort events and corresponding source map entries by start time
  const sortedIndices = events
    .map((_, index) => index)
    .sort((a, b) => events[a]!.start - events[b]!.start)

  const sortedEvents = sortedIndices.map(i => events[i]!)
  const sortedSource = sortedIndices.map(i => source[i]!)

  // Update source map event indices to match new sorted order
  sortedSource.forEach((entry, newIndex) => {
    entry.eventIndex = newIndex
  })

  const bytecode = allocateBytecode(sortedEvents.length)
  bytecode[0] = sortedEvents.length
  for (let i = 0; i < sortedEvents.length; i++) {
    const e = sortedEvents[i]!
    writeEvent(
      bytecode,
      i,
      e.start,
      e.end,
      e.trigger,
      e.velocity,
      e.value,
      e.glide,
      e.glidePower,
      e.probability,
      e.stretch,
      e.stretchPhase,
    )
  }

  return { bytecode, sourceMap: sortedSource }
}
