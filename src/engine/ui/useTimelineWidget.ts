import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'preact/hooks'
import {
  ARRAY_HEADER_SIZE,
  FUTURE_BARS,
  PAST_BARS,
  TIME_WINDOW_BARS,
} from '../../../as/assembly/constants.ts'
import { compileTimelineNotation } from '../../timeline/compiler.ts'
import type { TimelineLabel, TimelineSequenceRef } from '../bytecode/bytecode.ts'
import { PIANOROLL_BAR_COLOR_EVEN, PIANOROLL_BAR_COLOR_ODD, PIANOROLL_KEY_WIDTH } from '../constants.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import {
  getTimelineValue,
  getTimelineValueAtSample,
  readTimelineSegsFromCompiledTimeline,
  readTimelineSegsFromHistory,
  type TimelineSeg,
} from '../dsp/timeline-history.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { applySmoothing } from '../util.ts'
import type { GridOwnerByLine } from './grid-owner.ts'
import { useTheme } from './theme.ts'

type TimelineState = {
  timeSeconds: number | null
  sampleCount: number
  segs: TimelineSeg[]
  frameSegs: TimelineSeg[]
}

type UseTimelineParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  dspSource: string
  showWidgets: boolean
  isPlaying: boolean
  isLive: boolean
  gridOwnerByLine: GridOwnerByLine
  resetKey?: string | number | null
}

export function useTimelineWidget({
  program1,
  audioContext,
  bpmValue,
  globalSampleCount,
  timelineRefs,
  timelineLabels,
  dspSource,
  showWidgets,
  isPlaying,
  isLive,
  gridOwnerByLine,
  resetKey,
}: UseTimelineParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const stateRef = useRef<Map<number, TimelineState>>(new Map())
  const compiledCacheRef = useRef<Map<number, { sequence: string; arrayRaw: Float32Array }>>(new Map())
  const lastResetKeyRef = useRef<string | number | null | undefined>(undefined)
  const lastIsPlayingRef = useRef(isPlaying)

  // Use a version counter to track state clears. Snap if version differs from last consumed.
  const switchVersionRef = useRef(0)
  const lastConsumedVersionRef = useRef(-1)

  // Clear state on loop switch OR when isPlaying changes (view <-> live mode switch)
  if (lastResetKeyRef.current !== resetKey || lastIsPlayingRef.current !== isPlaying) {
    lastResetKeyRef.current = resetKey
    lastIsPlayingRef.current = isPlaying
    stateRef.current.clear()
    compiledCacheRef.current.clear()
    switchVersionRef.current++
  }

  const theme = useTheme()

  // onBeforeDraw is called every frame, so no need for useCallback memoization.
  // Using a regular function ensures we always see the latest stateRef.current after clearing.
  const onBeforeDraw = () => {
    if (!showWidgets) return
    if (isLive && !program1?.program?.histories) return

    const runtime = useEngineRuntimeStore.getState()
    const pred = runtime.predictedSampleCountResult
    const sampleRate = audioContext?.sampleRate || pred?.sampleRate || 0
    if (!sampleRate) return

    const rawSampleCount = globalSampleCount
      ? ((Atomics.load(globalSampleCount, 0) >>> 0) as number)
      : undefined
    const targetSampleCount = (isPlaying && pred)
      ? pred.sampleCount
      : (rawSampleCount ?? pred?.sampleCount)
    if (targetSampleCount == null) return

    const targetTimeSeconds = (isPlaying && pred)
      ? pred.timeSeconds
      : (targetSampleCount / sampleRate)

    const seenSeqs = new Set<number>()
    for (const ref of timelineRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)

      const st = stateRef.current.get(seqIndex) ?? {
        timeSeconds: null,
        sampleCount: 0,
        segs: [],
        frameSegs: [],
      }

      const needsSnap = switchVersionRef.current !== lastConsumedVersionRef.current
      if (st.timeSeconds == null || needsSnap) {
        // First frame after clear: snap instantly (dead zone)
        st.sampleCount = targetSampleCount
        st.timeSeconds = targetTimeSeconds
      }
      else {
        // Subsequent frames: apply smoothing
        st.sampleCount = Math.round(applySmoothing(st.sampleCount, targetSampleCount, 100 * sampleRate))
        st.timeSeconds = st.sampleCount / sampleRate
      }

      const bpm = bpmValue?.[0] || 60
      const barLengthSeconds = (4 * 60) / bpm
      const windowStartTime = st.timeSeconds - PAST_BARS * barLengthSeconds
      const windowEndTime = st.timeSeconds + FUTURE_BARS * barLengthSeconds

      let segs: TimelineSeg[] = []
      if (isLive && program1) {
        // Prefer compiled timeline data in live mode. History is written concurrently by the audio
        // thread and can be torn mid-write, which shows up as one-frame 0/1 flickers in the UI.
        const array = program1.program.data?.arrays?.[seqIndex]
        if (array) {
          segs = readTimelineSegsFromCompiledTimeline(array.raw, sampleRate, bpm, windowStartTime, windowEndTime)
        }
        if (segs.length === 0) {
          const history = program1.program.histories[seqIndex]
          if (history) {
            segs = readTimelineSegsFromHistory(history.raw, sampleRate, windowStartTime, windowEndTime)
          }
        }
      }
      else {
        const cached = compiledCacheRef.current.get(seqIndex)
        let arrayRaw = cached?.arrayRaw
        if (!cached || cached.sequence !== ref.sequence || !arrayRaw) {
          const compiled = compileTimelineNotation(ref.sequence)
          const bytecode = compiled.bytecode
          arrayRaw = new Float32Array(ARRAY_HEADER_SIZE + bytecode.length)
          arrayRaw.set(bytecode, ARRAY_HEADER_SIZE)
          compiledCacheRef.current.set(seqIndex, { sequence: ref.sequence, arrayRaw })
        }
        segs = readTimelineSegsFromCompiledTimeline(arrayRaw, sampleRate, bpm, windowStartTime, windowEndTime)
      }

      st.segs = segs
      st.frameSegs = segs
      stateRef.current.set(seqIndex, st)
    }

    // Mark version as consumed after processing all sequences
    lastConsumedVersionRef.current = switchVersionRef.current
  }

  const drawTimeline = useCallback((
    c: CanvasRenderingContext2D,
    seqIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
    seqColor?: string,
    drawGrid = true,
  ) => {
    if (!audioContext || !bpmValue) return
    const st = stateRef.current.get(seqIndex)
    if (!st || st.timeSeconds == null) return
    const baseColor = seqColor ?? theme.colors.argument

    const x = viewX + PIANOROLL_KEY_WIDTH
    const h = Math.max(40, widgetHeight)
    const w = Math.max(1, viewWidth - PIANOROLL_KEY_WIDTH)
    const sampleRate = audioContext.sampleRate

    const bpm = bpmValue[0] || 60
    const barLengthSeconds = (4 * 60) / bpm
    const beatLengthSeconds = 60 / bpm
    const windowStartTime = st.timeSeconds - PAST_BARS * barLengthSeconds
    const windowStartSample = windowStartTime * sampleRate

    const pixelsPerSecond = w / (TIME_WINDOW_BARS * barLengthSeconds)
    const currentTimeX = (PAST_BARS * barLengthSeconds / (TIME_WINDOW_BARS * barLengthSeconds)) * w

    c.save()
    c.lineCap = 'square'
    c.lineJoin = 'miter'
    c.translate(x, 0)

    c.save()
    c.translate(0, widgetY)
    c.beginPath()
    c.rect(0, -10, w, h + 20)
    c.clip()

    // c.fillStyle = 'rgba(0, 0, 0, 0.35)'
    // c.fillRect(0, 0, w, h)

    // c.fillStyle = 'rgba(75, 75, 75, 0.3)'
    // c.fillRect(0, 0, w, h)

    const windowEndTime = windowStartTime + TIME_WINDOW_BARS * barLengthSeconds
    if (drawGrid) {
      // Grid (alternating bar fills like pianoroll)
      const firstBarStart = Math.max(0, Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds)
      for (let barStart = firstBarStart; barStart < windowEndTime; barStart += barLengthSeconds) {
        const barIndex = Math.round(barStart / barLengthSeconds)
        const isEvenBar = barIndex % 2 === 0
        const barX = (barStart - windowStartTime) * pixelsPerSecond
        const barWidth = barLengthSeconds * pixelsPerSecond
        c.fillStyle = isEvenBar ? PIANOROLL_BAR_COLOR_EVEN : PIANOROLL_BAR_COLOR_ODD
        c.fillRect(barX, 0, barWidth, h)
      }

      // Beat boundaries (like pianoroll)
      c.strokeStyle = 'rgba(0, 0, 0, 1.0)'
      c.lineWidth = 0.25
      const firstBeatStart = Math.floor(windowStartTime / beatLengthSeconds) * beatLengthSeconds
      for (let beatStart = firstBeatStart; beatStart < windowEndTime; beatStart += beatLengthSeconds) {
        const px = (beatStart - windowStartTime) * pixelsPerSecond
        c.beginPath()
        c.moveTo(px, 0)
        c.lineTo(px, h)
        c.stroke()
      }
    }

    // Value line: sample per-pixel but detect exact segment boundaries and draw
    // vertical jumps at those exact x positions instead of letting the line tilt.
    const segs = st.frameSegs
    let si = 0

    c.strokeStyle = baseColor
    c.lineWidth = 1.35

    // helper to compute pixel X for a sample
    const timeWindowSeconds = TIME_WINDOW_BARS * barLengthSeconds
    const sampleToPx = (samp: number) => ((samp - windowStartSample) / (timeWindowSeconds * sampleRate)) * w

    c.beginPath()
    let prevSample = windowStartSample
    let started = false
    for (let px = 0; px <= w; px += 2) {
      const t = px / w
      let sample = windowStartSample + t * timeWindowSeconds * sampleRate
      if (px >= w) sample -= 0.001
      if (sample < 0) continue

      const r = getTimelineValue(segs, si, sample)
      si = r.si
      const v = r.v
      const y = (1 - v) * (h - 2) + 1

      if (!started) {
        c.moveTo(px, y)
        prevSample = sample
        started = true
        continue
      }

      // Detect if any segment boundary (startSample) lies between prevSample and sample.
      // If so, draw a vertical line at the exact boundary instead of a diagonal.
      let boundaryFound: number | null = null
      for (let k = 0; k < segs.length; k++) {
        const ss = segs[k]!
        const b = ss.startSample
        if (b > prevSample && b <= sample) {
          boundaryFound = b
          break
        }
      }

      if (boundaryFound == null) {
        // no boundary in this pixel interval; draw normal horizontal step
        c.lineTo(px, y)
        prevSample = sample
      }
      else {
        // compute exact x for boundary and y values on each side
        const boundaryPx = sampleToPx(boundaryFound)
        // value just before boundary (use sample-1) and at boundary (start value)
        const beforeSample = Math.max(windowStartSample, boundaryFound - 1)
        const beforeVal = getTimelineValueAtSample(segs, beforeSample)
        const afterVal = getTimelineValueAtSample(segs, boundaryFound)
        const yBefore = (1 - beforeVal) * (h - 2) + 1
        const yAfter = (1 - afterVal) * (h - 2) + 1

        // finish current path up to the boundary (using yBefore), stroke that segment
        c.lineTo(boundaryPx, yBefore)
        // c.stroke()

        // draw vertical jump at the exact boundary
        // c.beginPath()
        c.lineTo(boundaryPx, yBefore)
        c.lineTo(boundaryPx, yAfter)
        // c.stroke()

        // start a new main path at the boundary continuation point and draw to current px
        // c.beginPath()
        // c.lineTo(boundaryPx, yAfter)
        c.lineTo(px, y)

        // update trackers
        prevSample = sample
      }
    }
    // stroke any remaining path (in case last segment wasn't stroked inside loop)
    c.stroke()

    // Draw small circles at every segment boundary, including the previous value when it changes
    c.fillStyle = baseColor
    c.strokeStyle = 'rgba(0, 0, 0, 0.6)'
    c.lineWidth = 0.25
    const circleRadius = 3
    const drawnPositions = new Set<number>()
    const drawCircleAt = (px: number, value: number) => {
      if (!(px > circleRadius && px < w - circleRadius)) return
      const y = (1 - value) * (h - 2) + 1
      const key = Math.round(px) * 1_000_000 + Math.round(y)
      if (drawnPositions.has(key)) return
      drawnPositions.add(key)
      c.beginPath()
      c.arc(px, y, circleRadius, 0, Math.PI * 2)
      c.fill()
      c.stroke()
    }

    for (let j = 0; j < segs.length; j++) {
      const s = segs[j]!
      const sample = s.startSample
      if (sample < 0) continue
      const px = sampleToPx(sample)
      if (px < 0 || px > w) continue

      const beforeSample = sample - 1
      const isCycleStart = Math.round(sample) === 0
      if (!isCycleStart && j > 0 && beforeSample >= 0 && beforeSample >= windowStartSample && beforeSample < sample) {
        const valueBefore = getTimelineValueAtSample(segs, beforeSample)
        const beforePx = sampleToPx(beforeSample)
        drawCircleAt(beforePx, valueBefore)
      }

      const valueAtBoundary = getTimelineValueAtSample(segs, sample)
      drawCircleAt(px, valueAtBoundary)
    }

    // Current time marker
    let playheadColor = 'rgba(255, 255, 0, 0.8)'
    if (timelineLabels.length > 0) {
      for (let i = 0; i < timelineLabels.length; i++) {
        const label = timelineLabels[i]
        const labelSeconds = (label.bar - 1) * barLengthSeconds
        if (labelSeconds <= st.timeSeconds) {
          playheadColor = label.color || 'rgba(255, 255, 0, 0.8)'
        }
      }
    }
    c.strokeStyle = playheadColor
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(currentTimeX, 0)
    c.lineTo(currentTimeX, h)
    c.stroke()

    c.restore()
    c.restore()
  }, [audioContext, bpmValue, timelineLabels, theme.colors.argument, resetKey, isPlaying])

  const widgets = useMemo(() => {
    if (!showWidgets) return []
    if (timelineRefs.length === 0) return []

    const out: EditorWidget[] = []
    for (const ref of timelineRefs) {
      const owner = gridOwnerByLine?.get(ref.loc.line)
      const drawGrid = !gridOwnerByLine || (
        owner?.kind === 'timeline'
        && owner.seqIndex === ref.seqIndex
        && owner.line === ref.loc.line
        && owner.column === ref.loc.column
        && owner.length === ref.loc.length
      )

      out.push({
        type: 'above',
        line: ref.loc.line,
        column: 1,
        length: 1,
        height: 40,
        culling: false,
        render: (ctx, _x, y, _w, h, vx, vw) => {
          drawTimeline(ctx, ref.seqIndex, y, h, vx, vw, ref.color, drawGrid)
        },
      })
    }
    return out
  }, [showWidgets, timelineRefs, dspSource, drawTimeline, gridOwnerByLine])

  return { widgets, onBeforeDraw }
}
