import {
  TIMELINE_HEADER_SIZE,
  TIMELINE_KIND_GLIDE,
  TIMELINE_KIND_HOLD,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../../as/assembly/constants.ts'

type TimelineSegment = {
  kind: number
  durBars: number
  startValue: number
  endValue: number
  exp: number
  fromTokenIndex: number
  fromTokenStart: number
  fromTokenLength: number
  toTokenIndex: number
  toTokenStart: number
  toTokenLength: number
}

const numRe = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
const pointTokenRe = new RegExp(`^(${numRe}),(${numRe})(?:([e])(${numRe})?)?$`)

type TimelineToken = {
  index: number
  start: number
  length: number
  text: string
}

type TimelinePoint = {
  bar: number
  value: number
  exp: number | null
  tokenIndex: number
  tokenStart: number
  tokenLength: number
}

function tokenizeTimelineNotation(input: string): TimelineToken[] {
  const tokens: TimelineToken[] = []
  let index = 0
  let i = 0
  while (i < input.length) {
    while (i < input.length && /\s/.test(input[i]!)) i++
    if (i >= input.length) break
    const start = i
    while (i < input.length && !/\s/.test(input[i]!)) i++
    const end = i
    tokens.push({ index, start, length: end - start, text: input.slice(start, end) })
    index++
  }
  return tokens
}

function parseTimelineNotation(input: string): TimelinePoint[] {
  const tokens = tokenizeTimelineNotation(input)
  const points: TimelinePoint[] = []

  for (const t of tokens) {
    const m = pointTokenRe.exec(t.text)
    if (!m) continue

    const bar = Number(m[1] ?? 0)
    const value = Number(m[2] ?? 0)
    const curveKind = m[3] ?? null
    const curveValue = Number(m[4] ?? 0)
    const exp = curveKind === 'e' ? curveValue : null

    if (!Number.isFinite(bar) || !Number.isFinite(value)) continue
    points.push({
      bar,
      value,
      exp,
      tokenIndex: t.index,
      tokenStart: t.start,
      tokenLength: t.length,
    })
  }

  return points
}

function compilePoints(points: TimelinePoint[]): { segments: TimelineSegment[]; totalBars: number } {
  if (points.length === 0) return { segments: [], totalBars: 0 }

  const pts = points
    .map(p => ({ ...p, bar: p.bar }))
    .filter(p => p.bar >= 0)

  if (pts.length === 0) return { segments: [], totalBars: 0 }

  // Ensure there's always an implicit 0,0 point unless one is explicitly provided
  const hasZeroPoint = pts.some(p => p.bar === 0)
  if (!hasZeroPoint) {
    pts.unshift({
      bar: 0,
      value: 0,
      exp: null,
      tokenIndex: -1,
      tokenStart: -1,
      tokenLength: -1,
    })
  }

  const segments: TimelineSegment[] = []

  let i = 0
  let t = 0 // Always start at 0 since we guarantee a point at 0
  let v = pts[0]!.value
  let activeTokenIndex = pts[0]!.tokenIndex
  let activeTokenStart = pts[0]!.tokenStart
  let activeTokenLength = pts[0]!.tokenLength

  // Consume all points at the initial time (bar 0) to set the starting value.
  while (i < pts.length && pts[i]!.bar === 0) {
    v = pts[i]!.value
    activeTokenIndex = pts[i]!.tokenIndex
    activeTokenStart = pts[i]!.tokenStart
    activeTokenLength = pts[i]!.tokenLength
    i++
  }

  for (; i < pts.length; i++) {
    const p = pts[i]!
    const nextT = p.bar
    const nextV = p.value
    const dt = nextT - t
    if (dt < 0) continue

    if (dt === 0) {
      // Same-bar point: abrupt jump.
      t = nextT
      v = nextV
      activeTokenIndex = p.tokenIndex
      activeTokenStart = p.tokenStart
      activeTokenLength = p.tokenLength
      continue
    }

    const exp = p.exp ?? 1
    const kind = v === nextV ? TIMELINE_KIND_HOLD : TIMELINE_KIND_GLIDE
    segments.push({
      kind,
      durBars: dt,
      startValue: v,
      endValue: nextV,
      exp,
      fromTokenIndex: activeTokenIndex,
      fromTokenStart: activeTokenStart,
      fromTokenLength: activeTokenLength,
      toTokenIndex: p.tokenIndex,
      toTokenStart: p.tokenStart,
      toTokenLength: p.tokenLength,
    })

    t = nextT
    v = nextV
    activeTokenIndex = p.tokenIndex
    activeTokenStart = p.tokenStart
    activeTokenLength = p.tokenLength
  }

  let totalBars = t
  if (totalBars <= 0) {
    totalBars = 1
    segments.push({
      kind: TIMELINE_KIND_HOLD,
      durBars: 1,
      startValue: v,
      endValue: v,
      exp: 1,
      fromTokenIndex: activeTokenIndex,
      fromTokenStart: activeTokenStart,
      fromTokenLength: activeTokenLength,
      toTokenIndex: activeTokenIndex,
      toTokenStart: activeTokenStart,
      toTokenLength: activeTokenLength,
    })
  }

  return { segments, totalBars }
}

export function compileTimelineNotation(input: string, initialBeatDiv: number = 4) {
  const points = parseTimelineNotation(input)
  const { segments, totalBars } = compilePoints(points)
  const beatsPerBar = initialBeatDiv > 0 ? initialBeatDiv : 4

  const segCount = segments.length
  const opLength = TIMELINE_HEADER_SIZE + segCount * TIMELINE_SEGMENT_SIZE
  const bytecode = new Float32Array(1 + opLength)

  bytecode[0] = opLength
  bytecode[1] = TIMELINE_MAGIC
  bytecode[2] = segCount
  bytecode[3] = totalBars
  // Durations are compiled to bars; runtime converts to beats via beatDiv (= beatsPerBar).
  bytecode[4] = beatsPerBar

  let o = 1 + TIMELINE_HEADER_SIZE
  for (const s of segments) {
    bytecode[o++] = s.kind
    bytecode[o++] = s.durBars
    bytecode[o++] = s.startValue
    bytecode[o++] = s.endValue
    bytecode[o++] = s.exp
  }

  const tokens = segments.map(s => ({
    fromTokenIndex: s.fromTokenIndex,
    fromTokenStart: s.fromTokenStart,
    fromTokenLength: s.fromTokenLength,
    toTokenIndex: s.toTokenIndex,
    toTokenStart: s.toTokenStart,
    toTokenLength: s.toTokenLength,
  }))

  return { bytecode, tokens }
}
