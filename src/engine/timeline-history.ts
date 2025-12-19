import {
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  TIMELINE_HEADER_SIZE,
  TIMELINE_KIND_GLIDE,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../../as/assembly/constants.ts'

export type TimelineSeg = {
  startSample: number
  endSample: number
  a: number
  b: number
  kind: number
  exp: number
}

export function curveValue(t: number, curve: number): number {
  if (curve > 0) return Math.pow(t, curve)
  if (curve < 0) {
    const base = -curve
    if (base > 0) {
      const den = Math.log(base)
      if (den !== 0) return Math.log(1 + (base - 1) * t) / den
    }
  }
  return t
}

export function readTimelineSegsFromHistory(
  historyRaw: Float32Array,
  sampleRate: number,
  windowStartTimeSeconds: number,
  windowEndTimeSeconds: number,
): TimelineSeg[] {
  const segs: TimelineSeg[] = []
  for (let idx = HISTORY_DATA_OFFSET; idx + 5 < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
    const kind = historyRaw[idx]!
    const exp = historyRaw[idx + 1]!
    const a = historyRaw[idx + 2]!
    const b = historyRaw[idx + 3]!
    const startSample = historyRaw[idx + 4]!
    const endSample = historyRaw[idx + 5]!

    if (startSample === 0 && endSample === 0) continue

    const startTimeSeconds = startSample / sampleRate
    const endTimeSeconds = endSample / sampleRate
    if (endTimeSeconds < windowStartTimeSeconds || startTimeSeconds > windowEndTimeSeconds) continue

    segs.push({ startSample, endSample, a, b, kind, exp })
  }

  segs.sort((x, y) => x.startSample - y.startSample)
  return segs
}

export function getTimelineValue(
  segs: TimelineSeg[],
  si: number,
  sample: number,
): { v: number; si: number } {
  while (si < segs.length && sample >= segs[si]!.endSample) si++
  const s = segs[si]
  if (!s || sample < s.startSample) return { v: 0, si }
  if (s.kind !== TIMELINE_KIND_GLIDE || s.endSample <= s.startSample) return { v: s.a, si }
  const tt = (sample - s.startSample) / (s.endSample - s.startSample)
  const p = curveValue(tt, s.exp)
  return { v: s.a + (s.b - s.a) * p, si }
}

export function getTimelineValueAtSample(segs: TimelineSeg[], sample: number): number {
  // Prefer the segment that contains the sample.
  for (let k = 0; k < segs.length; k++) {
    const ss = segs[k]!
    if (sample >= ss.startSample && sample < ss.endSample) {
      if (ss.kind !== TIMELINE_KIND_GLIDE || ss.endSample <= ss.startSample) return ss.a
      const tt = (sample - ss.startSample) / (ss.endSample - ss.startSample)
      const p = curveValue(tt, ss.exp)
      return ss.a + (ss.b - ss.a) * p
    }
  }
  // If not inside a segment, check for an exact start sample (use that segment's start value).
  for (let k = 0; k < segs.length; k++) {
    const ss = segs[k]!
    if (ss.startSample === sample) {
      if (ss.kind !== TIMELINE_KIND_GLIDE || ss.endSample <= ss.startSample) return ss.a
      const p = curveValue(0, ss.exp)
      return ss.a + (ss.b - ss.a) * p
    }
  }
  // If still not found, check if any segment ends exactly at the sample (use its end value).
  for (let k = 0; k < segs.length; k++) {
    const ss = segs[k]!
    if (ss.endSample === sample) {
      if (ss.kind !== TIMELINE_KIND_GLIDE || ss.endSample <= ss.startSample) return ss.a
      return ss.b
    }
  }
  return 0
}

export type CompiledTimelineSeg = {
  kind: number
  durBars: number
  startValue: number
  endValue: number
  exp: number
}

export type CompiledTimeline = {
  beatDiv: number
  totalBars: number
  cycleBeats: number
  segs: CompiledTimelineSeg[]
}

export function parseCompiledTimeline(bytecode: Float32Array): CompiledTimeline | null {
  const opLength = bytecode[0] as number
  if (!opLength || opLength <= 0) return null

  const magic = bytecode[1] as number
  if (magic !== TIMELINE_MAGIC) return null

  const segCount = Math.floor(bytecode[2] as number)
  if (!Number.isFinite(segCount) || segCount <= 0) return null

  const totalBars = bytecode[3] as number
  const beatDiv = bytecode[4] as number
  if (!Number.isFinite(totalBars) || !Number.isFinite(beatDiv) || totalBars <= 0 || beatDiv <= 0) return null

  const segs: CompiledTimelineSeg[] = []
  const segBase = 1 + TIMELINE_HEADER_SIZE
  for (let si = 0; si < segCount; si++) {
    const o = segBase + si * TIMELINE_SEGMENT_SIZE
    const kind = bytecode[o] as number
    const durBars = bytecode[o + 1] as number
    const startValue = bytecode[o + 2] as number
    const endValue = bytecode[o + 3] as number
    const exp = bytecode[o + 4] as number
    if (!durBars || durBars <= 0) continue
    segs.push({ kind, durBars, startValue, endValue, exp })
  }

  if (segs.length === 0) return null

  const cycleBeats = totalBars * beatDiv
  if (!Number.isFinite(cycleBeats) || cycleBeats <= 0) return null

  return { beatDiv, totalBars, cycleBeats, segs }
}

export function evalCompiledTimelineAtBeat(tl: CompiledTimeline, beatAbs: number): number {
  const cycleBeats = tl.cycleBeats
  if (!(cycleBeats > 0) || !Number.isFinite(beatAbs)) return 0

  let localBeat = beatAbs % cycleBeats
  if (localBeat < 0) localBeat += cycleBeats
  const localBar = localBeat / tl.beatDiv

  let accBars = 0
  const segs = tl.segs
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!
    const endBars = accBars + s.durBars
    if (localBar < endBars) {
      const tt = s.durBars > 0 ? (localBar - accBars) / s.durBars : 0
      if (s.kind !== TIMELINE_KIND_GLIDE || s.endValue === s.startValue) return s.startValue
      const p = curveValue(Math.max(0, Math.min(1, tt)), s.exp)
      return s.startValue + (s.endValue - s.startValue) * p
    }
    accBars = endBars
  }

  const last = segs[segs.length - 1]
  return last ? last.endValue : 0
}


