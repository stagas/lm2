import {
  TIMELINE_HEADER_SIZE,
  TIMELINE_KIND_GLIDE,
  TIMELINE_KIND_HOLD,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../../as/assembly/constants.ts'

type TimelineSegment = {
  kind: number
  durUnits: number
  start: number
  end: number
  exp: number
}

const numRe = '[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)'
const valueTokenRe = new RegExp(`^(${numRe})(?:b(${numRe}))?$`)
const glideTokenRe = new RegExp(`^([/\\\\])b(${numRe})(?:([el])(${numRe}))?$`)

function parseTimelineNotation(input: string): { segments: TimelineSegment[]; totalUnits: number } {
  const tokens = input.trim().split(/\s+/).filter(Boolean)
  const segments: TimelineSegment[] = []

  let v = 0
  let pending: { durUnits: number; exp: number } | null = null

  for (const t of tokens) {
    const g = glideTokenRe.exec(t)
    if (g) {
      const durUnits = Number(g[2] ?? 0)
      const kind = g[3]
      const k = Number(g[4] ?? 0)
      const exp = kind === 'l' ? -Math.abs(k) : kind === 'e' ? k : 1
      pending = { durUnits, exp }
      continue
    }

    const m = valueTokenRe.exec(t)
    if (!m) continue

    const next = Number(m[1] ?? 0)
    const holdUnits = Number(m[2] ?? 0)

    if (pending && pending.durUnits > 0) {
      segments.push({
        kind: TIMELINE_KIND_GLIDE,
        durUnits: pending.durUnits,
        start: v,
        end: next,
        exp: pending.exp || 1,
      })
      pending = null
    }

    v = next

    if (holdUnits > 0) {
      segments.push({
        kind: TIMELINE_KIND_HOLD,
        durUnits: holdUnits,
        start: v,
        end: v,
        exp: 1,
      })
    }
  }

  // Trailing glide without explicit target falls back to 0.
  if (pending && pending.durUnits > 0) {
    segments.push({
      kind: TIMELINE_KIND_GLIDE,
      durUnits: pending.durUnits,
      start: v,
      end: 0,
      exp: pending.exp || 1,
    })
  }

  let totalUnits = 0
  for (const s of segments) totalUnits += s.durUnits

  return { segments, totalUnits }
}

export function compileTimelineNotation(input: string, beatDiv: number) {
  const { segments, totalUnits } = parseTimelineNotation(input)

  const segCount = segments.length
  const opLength = TIMELINE_HEADER_SIZE + segCount * TIMELINE_SEGMENT_SIZE
  const bytecode = new Float32Array(1 + opLength)

  bytecode[0] = opLength
  bytecode[1] = TIMELINE_MAGIC
  bytecode[2] = segCount
  bytecode[3] = totalUnits
  bytecode[4] = beatDiv

  let o = 1 + TIMELINE_HEADER_SIZE
  for (const s of segments) {
    bytecode[o++] = s.kind
    bytecode[o++] = s.durUnits
    bytecode[o++] = s.start
    bytecode[o++] = s.end
    bytecode[o++] = s.exp
  }

  return { bytecode }
}
