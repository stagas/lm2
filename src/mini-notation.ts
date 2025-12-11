import {
  allocateBytecode,
  MINI_BYTECODE_HEADER_SIZE,
  MINI_EVENT_SIZE,
  writeEvent,
} from './mini-notation-bytecode.ts'
import type { MiniBytecodeResult, MiniSourceMapEntry, TimelineEvent } from './mini-notation-bytecode.ts'
import { midiToFrequency, noteNameToMidi } from './note-utils.ts'

type NodeType = 'event' | 'rest' | 'group'

interface Modifiers {
  velocity: number
  hold: number
  repeat: number
  replicate: number
  elongate: number
  stretch: number
  offset: number
  jitter: number
  probability: number
  glidePower: number
  strum: number
}

interface Token {
  text: string
  start: number
  end: number
}

interface Node {
  type: NodeType
  values: number[] // empty for rest/group
  children: Node[]
  modifiers: Modifiers
  angle: boolean
  sourceStart: number
  sourceLength: number
  sourceText: string
}

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

const DEFAULT_MODS: Modifiers = {
  velocity: 1,
  hold: 0,
  repeat: 1,
  replicate: 1,
  elongate: 1,
  stretch: 1,
  offset: 0,
  jitter: 0,
  probability: 0,
  glidePower: 0,
  strum: 0,
}

const MODIFIER_START = new Set(['*', '!', '@', '/', '\\', '.', ';', '?', '+', '-', '$'])

function cloneMods(mods: Modifiers): Modifiers {
  return { ...mods }
}

function parseModifiers(text: string): Modifiers {
  const mods = cloneMods(DEFAULT_MODS)
  let i = 0

  while (i < text.length) {
    const ch = text[i]!
    const rest = text.slice(i + 1)
    switch (ch) {
      case '*': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.repeat = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '!': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.replicate = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '@': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.elongate = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '/': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.stretch = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '\\': {
        const m = rest.match(/^([\d.]+)/)
        if (m && m[1]) {
          mods.glidePower = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          mods.glidePower = 1
          i++
        }
        break
      }
      case '.': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.velocity *= parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case ';': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.hold = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '?': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.probability = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '+': {
        if (rest.startsWith('?')) {
          const m = rest.slice(1).match(/^([\d.]*)/)
          const amt = m && m[1] ? parseFloat(m[1]) : 0.5
          mods.jitter = amt
          i += (m?.[0]?.length ?? 0) + 2
        }
        else {
          const m = rest.match(/^([\d.]+)/)
          if (m) {
            mods.offset += parseFloat(m[1]!)
            i += m[0]!.length + 1
          }
          else {
            i++
          }
        }
        break
      }
      case '-': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.offset -= parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '$': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.strum = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      default:
        i++
    }
  }

  return mods
}

function tokenize(input: string): Token[] {
  const tokens: Token[] = []
  let i = 0
  while (i < input.length) {
    if (/\s/.test(input[i]!)) {
      i++
      continue
    }

    const start = i
    const ch = input[i]!

    if (ch === '[' || ch === '<') {
      const close = ch === '[' ? ']' : '>'
      i++
      let depth = 1
      while (i < input.length && depth > 0) {
        if (input[i] === ch) depth++
        else if (input[i] === close) depth--
        i++
      }
      while (i < input.length && MODIFIER_START.has(input[i]!)) {
        i++
      }
      tokens.push({ text: input.slice(start, i), start, end: i })
      continue
    }

    i++
    while (i < input.length) {
      const c = input[i]!
      if (/\s/.test(c) || c === '[' || c === '<' || c === ']' || c === '>') break
      i++
    }
    tokens.push({ text: input.slice(start, i), start, end: i })
  }
  return tokens
}

function splitValueAndModifiers(text: string): { value: string; mods: string } {
  let i = 0
  while (i < text.length) {
    const ch = text[i]!
    if (MODIFIER_START.has(ch) && !(i === 0 && (ch === '-' || ch === '+') && /\d/.test(text[i + 1] ?? ''))) {
      break
    }
    i++
  }
  return { value: text.slice(0, i), mods: text.slice(i) }
}

function parseValues(valueText: string): number[] {
  const values: number[] = []
  let cursor = 0
  while (cursor < valueText.length) {
    const rest = valueText.slice(cursor)
    const noteMatch = rest.match(/^([a-gA-G][#b]?)(-?\d+)/)
    if (noteMatch) {
      const midi = noteNameToMidi(noteMatch[1]! + noteMatch[2]!)
      values.push(midiToFrequency(midi))
      cursor += noteMatch[0]!.length
      continue
    }

    const numMatch = rest.match(/^-?[\d.]+/)
    if (numMatch) {
      values.push(parseFloat(numMatch[0]!))
      cursor += numMatch[0]!.length
      continue
    }
    break
  }
  return values
}

function tokensToNodes(tokens: Token[], input: string): Node[] {
  const nodes: Node[] = []
  for (const token of tokens) {
    const raw = token.text
    const first = raw[0]!

    if (first === '_') {
      const last = nodes.at(-1)
      if (last) last.modifiers.elongate += 1
      continue
    }

    if (first === '[' || first === '<') {
      const close = first === '[' ? ']' : '>'
      const closingIndex = raw.lastIndexOf(close)
      const inner = raw.slice(1, closingIndex)
      const { mods: modText } = splitValueAndModifiers(raw.slice(closingIndex + 1))
      const modifiers = parseModifiers(modText)
      const children = tokensToNodes(tokenize(inner), input)
      nodes.push({
        type: 'group',
        angle: first === '<',
        values: [],
        children,
        modifiers,
        sourceStart: token.start,
        sourceLength: token.end - token.start,
        sourceText: input.slice(token.start, token.end),
      })
      continue
    }

    const { value, mods } = splitValueAndModifiers(raw)

    if (value === '~') {
      const modifiers = parseModifiers(mods)
      nodes.push({
        type: 'rest',
        angle: false,
        values: [],
        children: [],
        modifiers,
        sourceStart: token.start,
        sourceLength: token.end - token.start,
        sourceText: input.slice(token.start, token.end),
      })
      continue
    }

    const values = parseValues(value)
    const modifiers = parseModifiers(mods)

    nodes.push({
      type: 'event',
      angle: false,
      values,
      children: [],
      modifiers,
      sourceStart: token.start,
      sourceLength: token.end - token.start,
      sourceText: input.slice(token.start, token.end),
    })
  }
  return nodes
}

function slotSpan(node: Node): number {
  const base = node.type === 'group'
    ? (node.angle
      ? node.children.reduce((sum, child) => sum + slotSpan(child), 0) || 1
      : 1)
    : 1
  return base * node.modifiers.elongate * node.modifiers.stretch * node.modifiers.replicate
}

function clamp01(v: number): number {
  if (v < 0) return 0
  if (v > 1) return 1
  return v
}

function emitNode(
  node: Node,
  start: number,
  duration: number,
  events: TimelineEvent[],
  source: MiniSourceMapEntry[],
  rng: Lcg,
): void {
  const mods = node.modifiers
  const replicate = Math.max(1, Math.round(mods.replicate))
  const repDuration = duration / replicate

  for (let rep = 0; rep < replicate; rep++) {
    const repStart = start + rep * repDuration

    if (node.type === 'group') {
      if (node.angle) {
        const childCount = node.children.length || 1
        const angleDuration = repDuration * childCount * mods.elongate * mods.stretch
        const childDuration = angleDuration / childCount
        let cursor = repStart
        for (const child of node.children) {
          emitNode(child, cursor, childDuration, events, source, rng)
          cursor += childDuration
        }
        continue
      }

      const total = node.children.reduce((sum, child) => sum + slotSpan(child), 0)
      const slotDuration = total > 0 ? repDuration / total : repDuration
      let cursor = repStart
      for (const child of node.children) {
        const span = slotSpan(child)
        const childDuration = slotDuration * span
        emitNode(child, cursor, childDuration, events, source, rng)
        cursor += childDuration
      }
      continue
    }

    if (node.type === 'rest') {
      continue
    }

    const repeat = Math.max(1, Math.round(mods.repeat))
    const repeatDuration = repDuration / repeat
    const prob = clamp01(mods.probability)

    for (let r = 0; r < repeat; r++) {
      if (prob > 0 && rng.next() < prob) continue

      const jitter = mods.jitter !== 0 ? (rng.next() * 2 - 1) * mods.jitter * repeatDuration : 0
      const offset = mods.offset * repeatDuration
      const baseStart = repStart + r * repeatDuration
      const eventStart = baseStart + offset + jitter
      // Voice duration follows the slot; hold only affects trigger behavior (handled in DSP)
      const eventDuration = repeatDuration
      const glide = mods.glidePower > 0 ? 1 : 0
      const glidePower = mods.glidePower

      if (node.values.length === 0) continue

      if (node.values.length === 1 || mods.strum === 0) {
        events.push({
          start: eventStart,
          end: eventStart + eventDuration,
          trigger: mods.hold,
          velocity: mods.velocity,
          value: node.values[0]!,
          glide,
          glidePower,
          probability: prob,
        })
        source.push({
          eventIndex: events.length - 1,
          start: node.sourceStart,
          length: node.sourceLength,
          text: node.sourceText,
        })
      }
      else {
        const strumStep = mods.strum * repeatDuration / Math.max(1, node.values.length - 1)
        for (let i = 0; i < node.values.length; i++) {
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
    emitNode(node, cursor, duration, events, source, rng)
    cursor += duration
  }

  events.sort((a, b) => a.start - b.start)
  const bytecode = allocateBytecode(events.length)
  bytecode[0] = events.length
  for (let i = 0; i < events.length; i++) {
    const e = events[i]!
    writeEvent(bytecode, i, e.start, e.end, e.trigger, e.velocity, e.value, e.glide, e.glidePower, e.probability)
  }

  return { bytecode, sourceMap: source }
}
