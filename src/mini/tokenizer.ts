import { euclidHit } from '../../as/assembly/euclid.ts'
import { parseChordSuffix, romanToDegree } from './chord-parser.ts'
import { findScaleIndex, SCALE_KEY_TO_INDEX } from './scales.ts'
import { midiToFrequency, noteNameToMidi } from './util.ts'

type NodeType = 'event' | 'rest' | 'group' | 'octave' | 'transpose' | 'scale' | 'swing' | 'at'

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
  values: number[] // empty for rest/group, [delta] for octave/transpose/swing
  children: Node[]
  modifiers: Modifiers
  angle: boolean
  parallel: boolean
  source: NodeSource
}

export type DefaultScale = {
  rootMidi?: number
  scaleIndex?: number
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
          mods.density = parseFloat(m[1]!) || 1
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
          mods.replicate = parseFloat(m[1]!) || 1
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
          mods.elongate = parseFloat(m[1]!) || 1
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
          mods.density = 1 / (parseFloat(m[1]!) || 1)
          i += m[0]!.length + 1
        }
        else {
          i++
        }
        break
      }
      case '\\': {
        const m = rest.match(/^(-?[\d.]+)/)
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

    // `:` is an operator token (parallel overlay)
    if (ch === ':') {
      tokens.push({ text: ':', start, end: i + 1 })
      i++
      continue
    }

    // Handle single-line comments starting with "//"
    if (ch === '/' && input[i + 1] === '/') {
      let j = i + 2
      // read until end of line or end of input
      while (j < input.length && input[j] !== '\n' && input[j] !== '\r') j++
      tokens.push({ text: input.slice(start, j), start, end: j })
      i = j
      continue
    }

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
        if (c === ':' || /\s/.test(c) || GROUP_OPEN.has(c) || c === ']' || c === '>' || c === ')') break
        i++
      }
      tokens.push({ text: input.slice(start, i), start, end: i })
      continue
    }

    i++
    while (i < input.length) {
      const c = input[i]!
      if (c === ':' || /\s/.test(c) || GROUP_OPEN.has(c) || c === ']' || c === '>' || c === ')') break
      i++
    }
    tokens.push({ text: input.slice(start, i), start, end: i })
  }
  // Merge adjacent tokens where a letter-only token is immediately followed by a digit-only token
  // without any separator. This preserves tokens like "augmented2" when tokenizer previously
  // produced ["augmented", "2"].
  const mergedTokens: Token[] = []
  for (let ti = 0; ti < tokens.length; ti++) {
    const t = tokens[ti]!
    const next = tokens[ti + 1]
    if (
      next
      && t.end === next.start
      && /^[A-Za-z]+$/.test(t.text)
      && /^[0-9]+$/.test(next.text)
    ) {
      mergedTokens.push({ text: t.text + next.text, start: t.start, end: next.end })
      ti++ // skip the numeric token we just merged
    }
    else {
      mergedTokens.push(t)
    }
  }
  return mergedTokens
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
    // Skip separators (commas and whitespace)
    while (cursor < valueText.length && (valueText[cursor] === ',' || /\s/.test(valueText[cursor]!))) cursor++
    if (cursor >= valueText.length) break

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

    // If we encounter an unexpected character, skip it to avoid infinite loop
    cursor++
  }
  return values
}

// scale name/index mapping lives in `src/mini/scales.ts` (shared with DSP desugaring)

function isNoteNameText(text: string): boolean {
  return /^([a-gA-G][#b]?)(-?\d+)$/.test(text)
}

function makeSource(input: string, start: number, end: number): NodeSource {
  return { start, length: end - start, text: input.slice(start, end) }
}

function nodesSpan(nodes: Node[]): { start: number; end: number } | null {
  const first = nodes[0]
  const last = nodes.at(-1)
  if (!first || !last) return null
  const start = first.source.start
  const end = last.source.start + last.source.length
  return { start, end }
}

function parseGroupedTokenText(
  raw: string,
  open: '[' | '<' | '(',
): { inner: string; modText: string } {
  const close = open === '[' ? ']' : open === '<' ? '>' : ')'
  const closingIndex = raw.lastIndexOf(close)
  if (closingIndex === -1) {
    // Unclosed bracket: treat everything after the opening bracket as inner content
    const inner = raw.slice(1)
    return { inner, modText: '' }
  }
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

function parseEuclidToken(raw: string): { pulses: number; steps: number; offset: number } | null {
  if (!raw.startsWith('(')) return null
  if (!raw.endsWith(')')) return null
  const inner = raw.slice(1, -1).trim()
  if (!/^\d+\s*,\s*\d+(?:\s*,\s*-?\d+)?$/.test(inner)) return null
  const parts = inner.split(',').map(s => parseInt(s.trim(), 10))
  const pulses = parts[0]
  const steps = parts[1]
  const offset = parts.length >= 3 ? parts[2] : 0
  if (!Number.isFinite(pulses) || !Number.isFinite(steps) || !Number.isFinite(offset)) return null
  return { pulses, steps, offset }
}

function cloneEventNode(node: Node, nextSource: NodeSource, values: number[]): Node {
  return {
    type: 'event',
    angle: false,
    parallel: false,
    values,
    children: [],
    modifiers: cloneMods(node.modifiers),
    source: nextSource,
  }
}

function parseOctaveDelta(tokens: Token[]): number {
  return parseDeltaToken(tokens[1])
}

function parseScaleDirective(tokens: Token[],
  startIndex: number): { rootMidi: number; scaleIndex: number; nextIndex: number }
{
  let i = startIndex
  let rootMidi = noteNameToMidi('c4')
  let scaleIndex = SCALE_KEY_TO_INDEX.major ?? 0

  const t0 = tokens[i]?.text?.toLowerCase()
  if (t0 && isNoteNameText(t0)) {
    rootMidi = noteNameToMidi(t0)
    i++
  }

  const t1 = tokens[i]?.text?.toLowerCase()
  if (t1) {
    // Accept names that include trailing digits (e.g. "augmented2").
    // Also handle the case where the tokenizer produced two tokens "augmented" and "2"
    // by merging them logically here when they're contiguous.
    if (/^[a-z][a-z0-9]*$/.test(t1)) {
      let scaleName = t1
      const nextToken = tokens[i + 1]
      if (/^[a-z]+$/.test(t1) && nextToken && /^[0-9]+$/.test(nextToken.text) && nextToken.start === tokens[i].end) {
        // Merge letter token + adjacent digit token into a single scale name
        scaleName = t1 + nextToken.text
        i++ // consume the numeric token as well
      }
      scaleIndex = findScaleIndex(scaleName) ?? scaleIndex
      i++
    }
  }

  return { rootMidi, scaleIndex, nextIndex: i }
}

function tokensToNodesInternal(tokens: Token[], input: string): Node[] {
  const nodes: Node[] = []

  for (let ti = 0; ti < tokens.length; ti++) {
    const token = tokens[ti]!
    const raw = token.text
    const first = raw[0]!

    // Skip single-line comment tokens entirely
    if (raw.startsWith('//')) {
      continue
    }

    if (raw === ',') {
      const left = nodes.slice()
      const rightTokens = tokens.slice(ti + 1)
      const right = rightTokens.length > 0 ? tokensToNodesInternal(rightTokens, input) : []
      if (left.length === 0 && right.length === 0) {
        return []
      }
      if (left.length === 0) {
        return right
      }
      if (right.length === 0) {
        return left
      }

      const leftGroup: Node = {
        type: 'group',
        angle: false,
        parallel: false,
        values: [],
        children: left,
        modifiers: getDefaultMods(),
        source: makeSource(input, left[0]!.source.start, left.at(-1)!.source.start + left.at(-1)!.source.length),
      }
      const rightGroup: Node = {
        type: 'group',
        angle: false,
        parallel: false,
        values: [],
        children: right,
        modifiers: getDefaultMods(),
        source: makeSource(input, right[0]!.source.start, right.at(-1)!.source.start + right.at(-1)!.source.length),
      }
      const endToken = rightTokens.at(-1) ?? token
      const parallelGroup: Node = {
        type: 'group',
        angle: false,
        parallel: true,
        values: [],
        children: [leftGroup, rightGroup],
        modifiers: getDefaultMods(),
        source: makeSource(input, leftGroup.source.start, endToken.end),
      }
      return [parallelGroup]
    }

    if (raw === '.') {
      const segments: Node[][] = []
      if (nodes.length > 0) segments.push(nodes.slice())

      let segStart = ti + 1
      for (let j = ti + 1; j <= tokens.length; j++) {
        const isEnd = j === tokens.length
        const isDot = !isEnd && tokens[j]?.text === '.'
        if (!isEnd && !isDot) continue

        const partTokens = tokens.slice(segStart, j)
        const partNodes = partTokens.length > 0 ? tokensToNodesInternal(partTokens, input) : []
        if (partNodes.length > 0) segments.push(partNodes)
        segStart = j + 1
      }

      if (segments.length === 0) return []
      if (segments.length === 1) return segments[0]!

      const loop = segments.length
      const onChildren: Node[] = []
      let groupStart = Infinity
      let groupEnd = -Infinity

      for (let si = 0; si < segments.length; si++) {
        const children = segments[si]!
        const span = nodesSpan(children)
        const start = span?.start ?? 0
        const end = span?.end ?? start
        groupStart = Math.min(groupStart, start)
        groupEnd = Math.max(groupEnd, end)
        onChildren.push({
          type: 'at',
          angle: false,
          parallel: false,
          values: [si + 1, loop],
          children,
          modifiers: getDefaultMods(),
          source: makeSource(input, start, end),
        })
      }

      if (!Number.isFinite(groupStart) || !Number.isFinite(groupEnd) || groupStart > groupEnd) {
        groupStart = 0
        groupEnd = 0
      }

      const joined: Node = {
        type: 'group',
        angle: false,
        parallel: false,
        values: [],
        children: onChildren,
        modifiers: getDefaultMods(),
        source: makeSource(input, groupStart, groupEnd),
      }

      return [joined]
    }

    if (first === '_') {
      const last = nodes.at(-1)
      if (last) last.modifiers.elongate += 1
      continue
    }

    if (raw === 'scale') {
      const { rootMidi, scaleIndex, nextIndex } = parseScaleDirective(tokens, ti + 1)
      const last = nextIndex > ti + 1 ? tokens[nextIndex - 1] : token
      nodes.push({
        type: 'scale',
        angle: false,
        parallel: false,
        values: [rootMidi, scaleIndex],
        children: [],
        modifiers: getDefaultMods(),
        source: makeSource(input, token.start, last?.end ?? token.end),
      })
      ti = nextIndex - 1
      continue
    }

    if (raw === 'at') {
      const next = tokens[ti + 1]
      const rawOn = next?.text ?? ''
      let pos = 0
      let loop = 0
      const slash = rawOn.indexOf('/')
      if (slash >= 0) {
        const a = parseInt(rawOn.slice(0, slash), 10)
        const b = parseInt(rawOn.slice(slash + 1), 10)
        pos = Number.isFinite(a) ? a : 0
        loop = Number.isFinite(b) ? b : 0
      }
      else {
        const a = parseInt(rawOn, 10)
        pos = Number.isFinite(a) ? a : 0
      }
      const bodyStart = ti + 2
      let bodyEnd = tokens.length
      for (let j = bodyStart; j < tokens.length; j++) {
        if (tokens[j]?.text === 'at') {
          bodyEnd = j
          break
        }
      }
      const bodyTokens = tokens.slice(bodyStart, bodyEnd)
      const children = tokensToNodesInternal(bodyTokens, input)
      const last = tokens[bodyEnd - 1] ?? next ?? token
      nodes.push({
        type: 'at',
        angle: false,
        parallel: false,
        values: [pos, loop],
        children,
        modifiers: getDefaultMods(),
        source: makeSource(input, token.start, last?.end ?? token.end),
      })
      ti = bodyEnd - 1
      continue
    }

    if (raw === 'octave' || raw === 'transpose') {
      const next = tokens[ti + 1]
      const delta = parseDeltaToken(next)
      const end = next?.end ?? token.end
      nodes.push({
        type: raw === 'octave' ? 'octave' : 'transpose',
        angle: false,
        parallel: false,
        values: [delta],
        children: [],
        modifiers: getDefaultMods(),
        source: makeSource(input, token.start, end),
      })
      if (next) ti++
      continue
    }

    if (raw === 'swing') {
      const next = tokens[ti + 1]
      const amount = parseDeltaToken(next)
      const end = next?.end ?? token.end
      nodes.push({
        type: 'swing',
        angle: false,
        parallel: false,
        values: [amount],
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
      const children = tokensToNodesInternal(adjustedInnerTokens, input)
      nodes.push({
        type: 'group',
        angle: first === '<',
        parallel: false,
        values: [],
        children,
        modifiers,
        source: makeSource(input, token.start, token.end),
      })
      continue
    }

    if (first === '(') {
      // Euclidean rhythm suffix: `c4(3,8[,offset])`
      // This expands the preceding event into `steps` timed events, where inactive steps are
      // represented as value-less events (they consume time but emit nothing).
      const euclid = parseEuclidToken(raw)
      const last = nodes.at(-1)
      if (euclid && last?.type === 'event') {
        const pulses = Math.floor(euclid.pulses)
        const steps = Math.floor(euclid.steps)
        const offset = Math.floor(euclid.offset)
        const spanSource = makeSource(input, last.source.start, token.end)

        nodes.pop()
        const safeSteps = Number.isFinite(steps) && steps > 0 ? steps : 0
        for (let si = 0; si < safeSteps; si++) {
          const on = euclidHit(pulses, steps, si, offset)
          nodes.push(cloneEventNode(last, spanSource, on ? last.values.slice() : []))
        }
        continue
      }

      const { inner, modText } = parseGroupedTokenText(raw, '(')
      const innerTokens = tokenize(inner)
      const adjustedInnerTokens = innerTokens.map(t => ({
        ...t,
        start: t.start + token.start + 1,
        end: t.end + token.start + 1,
      }))

      const head = adjustedInnerTokens[0]?.text
      if (head === 'scale') {
        const { rootMidi, scaleIndex, nextIndex } = parseScaleDirective(adjustedInnerTokens, 1)
        const items = adjustedInnerTokens.slice(nextIndex)
        const scaleNode: Node = {
          type: 'scale',
          angle: false,
          parallel: false,
          values: [rootMidi, scaleIndex],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, token.end),
        }
        const restChildren = tokensToNodesInternal(items, input)
        const children = [scaleNode, ...restChildren]
        nodes.push({
          type: 'group',
          angle: false,
          parallel: false,
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
          parallel: false,
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
          parallel: false,
          values: [parseDeltaToken(adjustedInnerTokens[1])],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, token.end),
        })
        continue
      }
      if (head === 'swing') {
        nodes.push({
          type: 'swing',
          angle: false,
          parallel: false,
          values: [parseDeltaToken(adjustedInnerTokens[1])],
          children: [],
          modifiers: getDefaultMods(),
          source: makeSource(input, token.start, token.end),
        })
        continue
      }

      const modifiers = parseModifiers(modText)
      const children = tokensToNodesInternal(adjustedInnerTokens, input)
      nodes.push({
        type: 'group',
        angle: false,
        parallel: false,
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
        parallel: false,
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

    if (valueText?.toLowerCase() === 'x') {
      // Treat `x` as shorthand for middle C to match upstream shorthand usage.
      valueText = 'c4'
    }

    // Try parsing as roman numeral chord with suffix
    const chordMatch = valueText.match(/^([ivxlcdm]+)(.*)$/i)
    if (chordMatch) {
      const roman = chordMatch[1]
      const suffix = chordMatch[2] ?? ''
      const base = romanToDegree(roman)
      if (base !== null) {
        const tones = parseChordSuffix(suffix)
        // Convert ChordTone[] to negative degree values (for mini's degree encoding)
        // Each tone has {degree: offset, semitoneAdjust}
        // In mini, negative values mean degrees, and we encode semitone adjustments as fractional parts
        // For now, encode as: -(scaleDegree + semitoneAdjust/100)
        const values = tones.map(tone => {
          const scaleDegree = base + tone.degree
          return -(scaleDegree + tone.semitoneAdjust / 100)
        })
        const modifiers = parseModifiers(mods)
        nodes.push({
          type: 'event',
          angle: false,
          parallel: false,
          values,
          children: [],
          modifiers,
          source: makeSource(input, token.start, token.end),
        })
        continue
      }
    }

    // Support comma-separated numeric degrees like "1,3,5"
    if (/^\d+(?:,\d+)*$/.test(valueText)) {
      const parts = valueText.split(',').filter(Boolean)
      const values = parts.map(p => -parseInt(p, 10))
      const modifiers = parseModifiers(mods)
      nodes.push({
        type: 'event',
        angle: false,
        parallel: false,
        values,
        children: [],
        modifiers,
        source: makeSource(input, token.start, token.end),
      })
      continue
    }

    const values = parseValues(valueText)
    const modifiers = parseModifiers(mods)

    nodes.push({
      type: 'event',
      angle: false,
      parallel: false,
      values,
      children: [],
      modifiers,
      source: makeSource(input, token.start, token.end),
    })
  }

  return nodes
}

export function tokensToNodes(
  tokens: Token[],
  input: string,
  options: { defaultScale?: DefaultScale } = {},
): Node[] {
  const nodes = tokensToNodesInternal(tokens, input)

  // Check if any scale nodes exist
  const hasScaleNode = nodes.some(node => node.type === 'scale')
    || nodes.some(node => node.type === 'group' && node.children.some(child => child.type === 'scale'))

  // If no scale nodes found, prepend a default scale (C4 major unless overridden by caller)
  if (!hasScaleNode) {
    const rootMidi = options.defaultScale?.rootMidi ?? noteNameToMidi('c4')
    const scaleIndex = options.defaultScale?.scaleIndex ?? SCALE_KEY_TO_INDEX.major ?? 0
    const defaultScaleNode: Node = {
      type: 'scale',
      angle: false,
      parallel: false,
      values: [rootMidi, scaleIndex],
      children: [],
      modifiers: getDefaultMods(),
      source: {
        start: 0,
        length: 0,
        text: '',
      },
    }
    nodes.unshift(defaultScaleNode)
  }

  return nodes
}
