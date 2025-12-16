import { midiToFrequency, noteNameToMidi } from './note-utils.ts'

type NodeType = 'event' | 'rest' | 'group' | 'octave' | 'transpose'

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
  values: number[] // empty for rest/group, [delta] for octave/transpose
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
const GROUP_OPEN = new Set(['[', '<', '('])

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
        // `$x` => up strum, `$$x` => down strum, `$$$x` => up+down strum, `$$$$x` => down+up strum.
        // Encoded as: up in [0,1), down in [1,2), up+down in [2,3), down+up in [3,4).
        let j = i
        while (j < text.length && text[j] === '$') j++
        const dollarCount = j - i
        const after = text.slice(j)
        const m = after.match(/^([\d.]+)/)
        if (m) {
          const raw = parseFloat(m[1]!)
          const amount = Math.min(Math.max(raw, 0), 0.999999)
          const kind = dollarCount >= 4 ? 3 : dollarCount === 3 ? 2 : dollarCount === 2 ? 1 : 0
          mods.strum = kind + amount
          i = j + m[0]!.length
        }
        else {
          i = j
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

    if (GROUP_OPEN.has(ch)) {
      const close = ch === '[' ? ']' : ch === '<' ? '>' : ')'
      i++
      let depth = 1
      while (i < input.length && depth > 0) {
        if (input[i] === ch) depth++
        else if (input[i] === close) depth--
        i++
      }
      while (i < input.length) {
        const c = input[i]!
        if (/\s/.test(c) || GROUP_OPEN.has(c) || c === ']' || c === '>' || c === ')') break
        i++
      }
      tokens.push({ text: input.slice(start, i), start, end: i })
      continue
    }

    i++
    while (i < input.length) {
      const c = input[i]!
      if (/\s/.test(c) || GROUP_OPEN.has(c) || c === ']' || c === '>' || c === ')') break
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

const SCALE_INTERVALS: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 3, 5, 7, 10],
}

function isNoteNameText(text: string): boolean {
  return /^([a-gA-G][#b]?)(-?\d+)$/.test(text)
}

function romanToDegree(text: string): number | null {
  const t = text.toLowerCase()
  if (t === 'i') return 1
  if (t === 'ii') return 2
  if (t === 'iii') return 3
  if (t === 'iv') return 4
  if (t === 'v') return 5
  if (t === 'vi') return 6
  if (t === 'vii') return 7
  return null
}

function degreeToFrequency(rootMidi: number, intervals: number[], degree: number): number {
  const len = intervals.length
  const step = degree - 1
  const octave = Math.floor(step / len)
  const index = ((step % len) + len) % len
  const semitone = intervals[index]! + octave * 12
  return midiToFrequency(rootMidi + semitone)
}

function makeSource(input: string, start: number, end: number): NodeSource {
  return { start, length: end - start, text: input.slice(start, end) }
}

function parseGroupedTokenText(
  raw: string,
  open: '[' | '<' | '(',
): { inner: string; modText: string } {
  const close = open === '[' ? ']' : open === '<' ? '>' : ')'
  const closingIndex = raw.lastIndexOf(close)
  const inner = raw.slice(1, closingIndex)
  const { mods: modText } = splitValueAndModifiers(raw.slice(closingIndex + 1))
  return { inner, modText }
}

function parseDeltaToken(token: Token | undefined): number {
  const raw = token?.text
  if (!raw) return 0
  const v = parseFloat(raw)
  return Number.isFinite(v) ? v : 0
}

function parseOctaveDelta(tokens: Token[]): number {
  return parseDeltaToken(tokens[1])
}

function scaleTokensToNodes(
  tokens: Token[],
  input: string,
  scale: { rootMidi: number; intervals: number[] },
): Node[] {
  const nodes: Node[] = []

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti]!
    const raw = token.text
    const first = raw[0]!

    if (first === '_') {
      const last = nodes.at(-1)
      if (last) last.modifiers.elongate += 1
      continue
    }

    if (raw === 'octave' || raw === 'transpose') {
      const next = tokens[ti + 1]
      const delta = parseDeltaToken(next)
      const end = next?.end ?? token.end
      nodes.push({
        type: raw === 'octave' ? 'octave' : 'transpose',
        angle: false,
        values: [delta],
        children: [],
        modifiers: getDefaultMods(),
        source: makeSource(input, token.start, end),
      })
      if (next) ti++
      continue
    }

    if (first === '[' || first === '<' || first === '(') {
      const { inner, modText } = parseGroupedTokenText(raw, first)
      const innerTokens = tokenize(inner)
      const adjustedInnerTokens = innerTokens.map(t => ({
        ...t,
        start: t.start + token.start + 1,
        end: t.end + token.start + 1,
      }))

      if (first === '(') {
        const innerHead = adjustedInnerTokens[0]?.text
        if (innerHead === 'scale') {
          const children = parseScaleCall(adjustedInnerTokens, input)
          nodes.push({
            type: 'group',
            angle: false,
            values: [],
            children,
            modifiers: parseModifiers(modText),
            source: makeSource(input, token.start, token.end),
          })
          continue
        }
        if (innerHead === 'octave') {
          nodes.push({
            type: 'octave',
            angle: false,
            values: [parseOctaveDelta(adjustedInnerTokens)],
            children: [],
            modifiers: getDefaultMods(),
            source: makeSource(input, token.start, token.end),
          })
          continue
        }
        if (innerHead === 'transpose') {
          nodes.push({
            type: 'transpose',
            angle: false,
            values: [parseDeltaToken(adjustedInnerTokens[1])],
            children: [],
            modifiers: getDefaultMods(),
            source: makeSource(input, token.start, token.end),
          })
          continue
        }
      }

      const modifiers = parseModifiers(modText)
      const children = scaleTokensToNodes(adjustedInnerTokens, input, scale)
      nodes.push({
        type: 'group',
        angle: first === '<',
        values: [],
        children,
        modifiers,
        source: makeSource(input, token.start, token.end),
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
        source: makeSource(input, token.start, token.end),
      })
      continue
    }

    const romanDegree = romanToDegree(value)
    if (romanDegree !== null) {
      const base = romanDegree
      const values = [
        degreeToFrequency(scale.rootMidi, scale.intervals, base),
        degreeToFrequency(scale.rootMidi, scale.intervals, base + 2),
        degreeToFrequency(scale.rootMidi, scale.intervals, base + 4),
      ]
      const modifiers = parseModifiers(mods)
      nodes.push({
        type: 'event',
        angle: false,
        values,
        children: [],
        modifiers,
        source: makeSource(input, token.start, token.end),
      })
      continue
    }

    const degreeMatch = value.match(/^\d+$/)
    if (degreeMatch) {
      const degree = parseInt(value, 10)
      const values = [degreeToFrequency(scale.rootMidi, scale.intervals, degree)]
      const modifiers = parseModifiers(mods)
      nodes.push({
        type: 'event',
        angle: false,
        values,
        children: [],
        modifiers,
        source: makeSource(input, token.start, token.end),
      })
      continue
    }

    const values = parseValues(value || (mods ? 'c4' : ''))
    const modifiers = parseModifiers(mods)
    nodes.push({
      type: 'event',
      angle: false,
      values,
      children: [],
      modifiers,
      source: makeSource(input, token.start, token.end),
    })
  }

  return nodes
}

function parseScaleCall(tokens: Token[], input: string): Node[] {
  const t0 = tokens[0]?.text
  if (t0 !== 'scale') {
    return scaleTokensToNodes(tokens, input, { rootMidi: noteNameToMidi('c4'), intervals: SCALE_INTERVALS.major! })
  }

  let i = 1
  let rootMidi = noteNameToMidi('c4')
  let scaleName = tokens[i]?.text?.toLowerCase()

  if (scaleName && isNoteNameText(scaleName)) {
    rootMidi = noteNameToMidi(scaleName)
    i++
    scaleName = tokens[i]?.text?.toLowerCase()
  }

  const intervals = (scaleName && SCALE_INTERVALS[scaleName]) ? SCALE_INTERVALS[scaleName]! : SCALE_INTERVALS.major!
  const items = tokens.slice(i + 1)
  return scaleTokensToNodes(items, input, { rootMidi, intervals })
}

export function tokensToNodes(tokens: Token[], input: string): Node[] {
  const nodes: Node[] = []
  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti]!
    const raw = token.text
    const first = raw[0]!

    if (first === '_') {
      const last = nodes.at(-1)
      if (last) last.modifiers.elongate += 1
      continue
    }

    if (raw === 'octave' || raw === 'transpose') {
      const next = tokens[ti + 1]
      const delta = parseDeltaToken(next)
      const end = next?.end ?? token.end
      nodes.push({
        type: raw === 'octave' ? 'octave' : 'transpose',
        angle: false,
        values: [delta],
        children: [],
        modifiers: getDefaultMods(),
        source: makeSource(input, token.start, end),
      })
      if (next) ti++
      continue
    }

    if (first === '[' || first === '<') {
      const { inner, modText } = parseGroupedTokenText(raw, first)
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
        source: makeSource(input, token.start, token.end),
      })
      continue
    }

    if (first === '(') {
      const { inner, modText } = parseGroupedTokenText(raw, '(')
      const innerTokens = tokenize(inner)
      const adjustedInnerTokens = innerTokens.map(t => ({
        ...t,
        start: t.start + token.start + 1,
        end: t.end + token.start + 1,
      }))

      const head = adjustedInnerTokens[0]?.text
      if (head === 'scale') {
        const children = parseScaleCall(adjustedInnerTokens, input)
        nodes.push({
          type: 'group',
          angle: false,
          values: [],
          children,
          modifiers: parseModifiers(modText),
          source: makeSource(input, token.start, token.end),
        })
        continue
      }
      if (head === 'octave') {
        nodes.push({
          type: 'octave',
          angle: false,
          values: [parseOctaveDelta(adjustedInnerTokens)],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, token.end),
        })
        continue
      }
      if (head === 'transpose') {
        nodes.push({
          type: 'transpose',
          angle: false,
          values: [parseDeltaToken(adjustedInnerTokens[1])],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, token.end),
        })
        continue
      }

      const modifiers = parseModifiers(modText)
      const children = tokensToNodes(adjustedInnerTokens, input)
      nodes.push({
        type: 'group',
        angle: false,
        values: [],
        children,
        modifiers,
        source: makeSource(input, token.start, token.end),
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
        source: makeSource(input, token.start, token.end),
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
      source: makeSource(input, token.start, token.end),
    })
  }
  return nodes
}
