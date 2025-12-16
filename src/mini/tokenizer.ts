import { midiToFrequency, noteNameToMidi } from './note-utils.ts'

type NodeType = 'event' | 'rest' | 'group'

export interface Modifiers {
  velocity: number
  hold: number
  replicate: number
  elongate: number
  density: number
  offset: number
  jitter: number
  prob: number
  glide: number
  strum: number
}

interface Token {
  text: string
  start: number
  end: number
}

export interface NodeSource {
  start: number
  length: number
  text: string
}

export interface Node {
  type: NodeType
  values: number[] // empty for rest/group
  children: Node[]
  modifiers: Modifiers
  angle: boolean
  source: NodeSource
}

const DEFAULT_MODS: Modifiers = {
  velocity: 1,
  hold: 0,
  replicate: 1,
  elongate: 1,
  density: 1,
  offset: 0,
  jitter: 0,
  prob: 0,
  glide: 0,
  strum: 0,
}

const MODIFIER_START = new Set(['*', '!', '@', '/', '\\', '.', ';', '?', '+', '-', '$'])

function cloneMods(mods: Modifiers): Modifiers {
  return { ...mods }
}

export function getDefaultMods(): Modifiers {
  return cloneMods(DEFAULT_MODS)
}

function parseModifiers(text: string): Modifiers {
  const mods = getDefaultMods()
  let i = 0

  while (i < text.length) {
    const ch = text[i]!
    const rest = text.slice(i + 1)
    switch (ch) {
      case '*': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          mods.density = parseFloat(m[1]!)
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
          mods.density = 1 / parseFloat(m[1]!)
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
          mods.glide = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          mods.glide = 1
          i++
        }
        break
      }
      case '.': {
        const m = rest.match(/^([\d.]+)/)
        if (m) {
          const raw = m[1]!
          // Interpret ".x" as a fractional velocity (0.x) to make "g4.1" mean 0.1, "g4.25" mean 0.25, etc.
          // If the user includes an explicit decimal (e.g. ".0.5"), respect it as-is.
          let factor = parseFloat(raw)
          if (raw.indexOf('.') === -1) {
            factor = parseFloat('0.' + raw)
          }
          mods.velocity *= factor
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
          mods.prob = parseFloat(m[1]!)
          i += m[0]!.length + 1
        }
        else {
          mods.prob = 0.5
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

export function tokenize(input: string): Token[] {
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
      while (i < input.length) {
        const c = input[i]!
        if (/\s/.test(c) || c === '[' || c === '<' || c === ']' || c === '>') break
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

export function splitValueAndModifiers(text: string): { value: string; mods: string } {
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

export function tokensToNodes(tokens: Token[], input: string): Node[] {
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
      const innerTokens = tokenize(inner)
      // Adjust inner token positions to be relative to original input
      const adjustedInnerTokens = innerTokens.map(t => ({
        ...t,
        start: t.start + token.start + 1, // +1 to account for opening bracket
        end: t.end + token.start + 1,
      }))
      const children = tokensToNodes(adjustedInnerTokens, input)
      nodes.push({
        type: 'group',
        angle: first === '<',
        values: [],
        children,
        modifiers,
        source: {
          start: token.start,
          length: token.end - token.start,
          text: input.slice(token.start, token.end),
        },
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
        source: {
          start: token.start,
          length: token.end - token.start,
          text: input.slice(token.start, token.end),
        },
      })
      continue
    }

    let valueText = value
    if (!valueText && mods) {
      valueText = 'c4'
    }

    const values = parseValues(valueText)
    const modifiers = parseModifiers(mods)

    nodes.push({
      type: 'event',
      angle: false,
      values,
      children: [],
      modifiers,
      source: {
        start: token.start,
        length: token.end - token.start,
        text: input.slice(token.start, token.end),
      },
    })
  }
  return nodes
}
