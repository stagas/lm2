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
}

const numRe = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
const pointTokenRe = new RegExp(`^(${numRe}),(${numRe})(?:([el])(${numRe})?)?$`)

type TimelinePoint = {
  bar: number
  value: number
  exp: number | null
}

function parseTimelineNotation(input: string): TimelinePoint[] {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  const points: TimelinePoint[] = []

  for (const t of tokens) {
    const m = pointTokenRe.exec(t)
    if (!m) continue

    const bar = Number(m[1] ?? 0)
    const value = Number(m[2] ?? 0)
    const curveKind = m[3] ?? null
    const curveValue = Number(m[4] ?? 0)
    const exp = curveKind === 'l'
      ? -Math.abs(curveValue)
      : curveKind === 'e'
      ? curveValue
      : null

    if (!Number.isFinite(bar) || !Number.isFinite(value)) continue
    points.push({ bar, value, exp })
  }

  return points
}

function compilePoints(points: TimelinePoint[]): { segments: TimelineSegment[]; totalBars: number } {
  if (points.length === 0) return { segments: [], totalBars: 0 }

  const minBar = points.reduce((m, p) => Math.min(m, p.bar), Infinity)
  const hasBar0 = points.some(p => p.bar === 0)
  const barOffset = minBar >= 1 && !hasBar0 ? 1 : 0

  const pts = points
    .map(p => ({ ...p, bar: p.bar - barOffset }))
    .filter(p => p.bar >= 0)

  if (pts.length === 0) return { segments: [], totalBars: 0 }

  const segments: TimelineSegment[] = []

  let i = 0
  let t = pts[0]!.bar
  let v = pts[0]!.value

  // Establish initial value at t=0 (same-bar jumps at the start are allowed).
  if (t > 0) {
    segments.push({
      kind: TIMELINE_KIND_HOLD,
      durBars: t,
      startValue: 0,
      endValue: 0,
      exp: 1,
    })
  }
  else {
    t = 0
  }

  // Consume all points at the initial time to set the starting value.
  while (i < pts.length && pts[i]!.bar === t) {
    v = pts[i]!.value
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
    })

    t = nextT
    v = nextV
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

  return { bytecode }
}
