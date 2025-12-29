import {
  ARRAY_HEADER_SIZE,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  TIMELINE_HEADER_SIZE,
  TIMELINE_KIND_GLIDE,
  TIMELINE_KIND_HOLD,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../../../as/assembly/constants.ts'

export type TimelineSeg = {
  startSample: number
  endSample: number
  a: number
  b: number
  kind: number
  exp: number
}

export function curveValue(t: number, curve: number): number {
  if (curve > 0.0) return Math.pow(t, curve)
  if (curve < 0.0) {
    const base = -curve
    // mirrored complement: make e-<n> be the exact opposite of e< n >
    // so e-10(t) == 1 - (1 - t)^10
    if (base > 0.0) {
      return 1.0 - Math.pow(1.0 - t, base)
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
  const windowEndSample = windowEndTimeSeconds * sampleRate
  for (let idx = HISTORY_DATA_OFFSET; idx + 5 < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
    const kind = historyRaw[idx]!
    const exp = historyRaw[idx + 1]!
    const a = historyRaw[idx + 2]!
    const b = historyRaw[idx + 3]!
    const startSample = historyRaw[idx + 4]!
    let endSample = historyRaw[idx + 5]!

    if (startSample === 0 && endSample === 0) continue

    // Live history may contain a segment that's still "open" (endSample == 0 or not yet updated).
    // Treat it as extending to the current window end so the renderer doesn't fall back to 0.
    if (!(endSample > startSample)) {
      endSample = Math.max(startSample + 1, windowEndSample)
    }

    const startTimeSeconds = startSample / sampleRate
    const endTimeSeconds = endSample / sampleRate
    if (endTimeSeconds < windowStartTimeSeconds || startTimeSeconds > windowEndTimeSeconds) continue

    segs.push({ startSample, endSample, a, b, kind, exp })
  }

  segs.sort((x, y) => x.startSample - y.startSample)

  // History is stored as f32 samples (see `as/assembly/gen/timeline.ts`), so at higher sample counts
  // you can get tiny "gaps" between segments due to float32 quantization. Those gaps can make the
  // renderer momentarily fall back to 0. Stitch gaps with a hold at the previous value.
  if (segs.length > 0) {
    const stitched: TimelineSeg[] = []
    let prev = segs[0]!
    stitched.push(prev)

    for (let i = 1; i < segs.length; i++) {
      const cur = segs[i]!
      const gap = cur.startSample - prev.endSample
      if (gap > 0) {
        const v = prev.kind === TIMELINE_KIND_GLIDE ? prev.b : prev.a
        if (Number.isFinite(v) && Number.isFinite(prev.endSample) && Number.isFinite(cur.startSample)) {
          stitched.push({
            startSample: prev.endSample,
            endSample: cur.startSample,
            a: v,
            b: v,
            kind: TIMELINE_KIND_HOLD,
            exp: 1,
          })
        }
      }
      stitched.push(cur)
      prev = cur
    }

    // Ensure the visible window is always covered to the right with a hold.
    const last = stitched[stitched.length - 1]!
    if (Number.isFinite(windowEndSample) && last.endSample < windowEndSample) {
      const v = last.kind === TIMELINE_KIND_GLIDE ? last.b : last.a
      if (Number.isFinite(v)) {
        stitched.push({
          startSample: last.endSample,
          endSample: windowEndSample,
          a: v,
          b: v,
          kind: TIMELINE_KIND_HOLD,
          exp: 1,
        })
      }
    }

    return stitched
  }

  return segs
}

export function readTimelineSegsFromCompiledTimeline(
  arrayRaw: Float32Array,
  sampleRate: number,
  bpm: number,
  windowStartTimeSeconds: number,
  windowEndTimeSeconds: number,
): TimelineSeg[] {
  const beatsPerSecond = bpm / 60
  if (!(beatsPerSecond > 0) || !Number.isFinite(beatsPerSecond)) return []
  if (!Number.isFinite(windowStartTimeSeconds) || !Number.isFinite(windowEndTimeSeconds)) return []

  const tl = parseCompiledTimeline(arrayRaw.subarray(ARRAY_HEADER_SIZE))
  if (!tl) return []

  const startBeat = windowStartTimeSeconds * beatsPerSecond
  const endBeat = windowEndTimeSeconds * beatsPerSecond
  if (!Number.isFinite(startBeat) || !Number.isFinite(endBeat)) return []

  const segs: TimelineSeg[] = []

  if (tl.noWrap) {
    let accBeats = 0
    for (let i = 0; i < tl.segs.length; i++) {
      const s = tl.segs[i]!
      const durBeats = s.durBars * tl.beatDiv
      if (!(durBeats > 0) || !Number.isFinite(durBeats)) continue

      const segStartBeat = accBeats
      const segEndBeat = segStartBeat + durBeats
      accBeats += durBeats

      const startTimeSeconds = segStartBeat / beatsPerSecond
      const endTimeSeconds = segEndBeat / beatsPerSecond
      if (endTimeSeconds < windowStartTimeSeconds || startTimeSeconds > windowEndTimeSeconds) continue

      const startSample = startTimeSeconds * sampleRate
      const endSample = endTimeSeconds * sampleRate
      if (!Number.isFinite(startSample) || !Number.isFinite(endSample)) continue

      segs.push({
        startSample,
        endSample,
        a: s.startValue,
        b: s.endValue,
        kind: s.kind,
        exp: s.exp,
      })
    }

    const last = tl.segs[tl.segs.length - 1]
    const holdValue = last ? last.endValue : 0
    const holdStartBeat = Math.max(0, Math.max(startBeat, tl.cycleBeats))
    if (endBeat > holdStartBeat && Number.isFinite(holdValue)) {
      const startTimeSeconds = holdStartBeat / beatsPerSecond
      const endTimeSeconds = endBeat / beatsPerSecond
      const startSample = startTimeSeconds * sampleRate
      const endSample = endTimeSeconds * sampleRate
      if (Number.isFinite(startSample) && Number.isFinite(endSample)) {
        segs.push({
          startSample,
          endSample,
          a: holdValue,
          b: holdValue,
          kind: TIMELINE_KIND_HOLD,
          exp: 1,
        })
      }
    }
  }
  else {
    const cycleBeats = tl.cycleBeats
    if (!(cycleBeats > 0) || !Number.isFinite(cycleBeats)) return []

    const firstCycle = Math.floor(startBeat / cycleBeats) - 1
    const lastCycle = Math.floor(endBeat / cycleBeats) + 1

    for (let cycle = firstCycle; cycle <= lastCycle; cycle++) {
      const cycleStartBeat = cycle * cycleBeats
      let accBeats = 0
      for (let i = 0; i < tl.segs.length; i++) {
        const s = tl.segs[i]!
        const durBeats = s.durBars * tl.beatDiv
        if (!(durBeats > 0) || !Number.isFinite(durBeats)) continue

        const segStartBeat = cycleStartBeat + accBeats
        const segEndBeat = segStartBeat + durBeats
        accBeats += durBeats

        const startTimeSeconds = segStartBeat / beatsPerSecond
        const endTimeSeconds = segEndBeat / beatsPerSecond
        if (endTimeSeconds < windowStartTimeSeconds || startTimeSeconds > windowEndTimeSeconds) continue

        const startSample = startTimeSeconds * sampleRate
        const endSample = endTimeSeconds * sampleRate
        if (!Number.isFinite(startSample) || !Number.isFinite(endSample)) continue

        segs.push({
          startSample,
          endSample,
          a: s.startValue,
          b: s.endValue,
          kind: s.kind,
          exp: s.exp,
        })
      }
    }
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
  if (!s) {
    const last = segs[segs.length - 1]
    if (!last) return { v: 0, si }
    return { v: last.kind === TIMELINE_KIND_GLIDE ? last.b : last.a, si }
  }
  if (sample < s.startSample) {
    const prev = segs[si - 1]
    if (prev) return { v: prev.kind === TIMELINE_KIND_GLIDE ? prev.b : prev.a, si }
    return { v: s.a, si }
  }
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
  const first = segs[0]
  if (!first) return 0
  if (sample < first.startSample) return first.a

  let prev: TimelineSeg | null = null
  for (let k = 0; k < segs.length; k++) {
    const ss = segs[k]!
    if (sample < ss.startSample) break
    prev = ss
  }
  if (prev) return prev.kind === TIMELINE_KIND_GLIDE ? prev.b : prev.a

  const last = segs[segs.length - 1]!
  return last.kind === TIMELINE_KIND_GLIDE ? last.b : last.a
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
  noWrap: boolean
  segs: CompiledTimelineSeg[]
}

export function parseCompiledTimeline(bytecode: Float32Array): CompiledTimeline | null {
  const opLength = bytecode[0] as number
  if (!opLength || opLength <= 0) return null

  const magic = bytecode[1] as number
  if (magic !== TIMELINE_MAGIC) return null

  const segCount = Math.floor(bytecode[2] as number)
  if (!Number.isFinite(segCount) || segCount <= 0) return null

  const totalBarsRaw = bytecode[3] as number
  const noWrap = totalBarsRaw < 0
  const totalBars = Math.abs(totalBarsRaw)
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

  return { beatDiv, totalBars, cycleBeats, noWrap, segs }
}

export function evalCompiledTimelineAtBeat(tl: CompiledTimeline, beatAbs: number): number {
  const cycleBeats = tl.cycleBeats
  if (!(cycleBeats > 0) || !Number.isFinite(beatAbs)) return 0

  let localBeat = tl.noWrap ? beatAbs : (beatAbs % cycleBeats)
  if (localBeat < 0) localBeat = tl.noWrap ? 0 : (localBeat + cycleBeats)
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
