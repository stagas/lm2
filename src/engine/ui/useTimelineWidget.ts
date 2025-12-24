import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  ARRAY_HEADER_SIZE,
  FUTURE_BARS,
  PAST_BARS,
  TIME_WINDOW_BARS,
} from '../../../as/assembly/constants.ts'
import { compileTimelineNotation } from '../../timeline/compiler.ts'
import type { TimelineLabel, TimelineSequenceRef } from '../bytecode/bytecode.ts'
import { PIANOROLL_KEY_WIDTH } from '../constants.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import {
  getTimelineValue,
  getTimelineValueAtSample,
  readTimelineSegsFromCompiledTimeline,
  readTimelineSegsFromHistory,
  type TimelineSeg,
} from '../dsp/timeline-history.ts'
import { applySmoothing } from '../util.ts'
import { useTheme } from './theme.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'

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
  resetKey,
}: UseTimelineParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const stateRef = useRef<Map<number, TimelineState>>(new Map())
  const compiledCacheRef = useRef<Map<number, { sequence: string; arrayRaw: Float32Array }>>(new Map())

  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const theme = useTheme()

  useEffect(() => {
    stateRef.current.clear()
    compiledCacheRef.current.clear()
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
  }, [resetKey])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (isLive && !program1?.program?.histories) return

    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    }, { isPlaying })
    if (!pred) return
    const { sampleRate, sampleCount, timeSeconds } = pred

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

      st.sampleCount = sampleCount
      if (st.timeSeconds == null) st.timeSeconds = timeSeconds
      else st.timeSeconds = applySmoothing(st.timeSeconds, timeSeconds)

      const bpm = bpmValue?.[0] || 60
      const barLengthSeconds = (4 * 60) / bpm
      const windowStartTime = st.timeSeconds - PAST_BARS * barLengthSeconds
      const windowEndTime = st.timeSeconds + FUTURE_BARS * barLengthSeconds

      let segs: TimelineSeg[] = []
      if (isLive && program1) {
        const history = program1.program.histories[seqIndex]
        if (history) {
          segs = readTimelineSegsFromHistory(history.raw, sampleRate, windowStartTime, windowEndTime)
        }
        if (segs.length === 0) {
          const array = program1.program.data?.arrays?.[seqIndex]
          if (array) {
            segs = readTimelineSegsFromCompiledTimeline(array.raw, sampleRate, bpm, windowStartTime, windowEndTime)
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
  }, [showWidgets, program1, audioContext, bpmValue, globalSampleCount, isLive, isPlaying, timelineRefs])

  const drawTimeline = useCallback((
    c: CanvasRenderingContext2D,
    seqIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
    seqColor?: string,
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

    // Grid (alternating bar fills like pianoroll)
    const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
    const windowEndTime = windowStartTime + TIME_WINDOW_BARS * barLengthSeconds
    for (let barStart = firstBarStart; barStart < windowEndTime; barStart += barLengthSeconds) {
      const barIndex = Math.floor(barStart / barLengthSeconds)
      const isEvenBar = barIndex % 2 === 0
      const barX = (barStart - windowStartTime) * pixelsPerSecond
      const barWidth = barLengthSeconds * pixelsPerSecond
      c.fillStyle = isEvenBar ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)'
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
    for (let px = 0; px <= w; px += 2) {
      const t = px / w
      const sample = windowStartSample + t * timeWindowSeconds * sampleRate
      if (sample < 0) continue

      const r = getTimelineValue(segs, si, sample)
      si = r.si
      const v = r.v
      const y = (1 - v) * (h - 2) + 1

      if (px === 0) {
        c.moveTo(px, y)
        prevSample = sample
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
        const beforeVal = getTimelineValueAtSample(segs, Math.max(0, boundaryFound - 1))
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
    for (let j = 0; j < segs.length; j++) {
      const s = segs[j]!
      const sample = s.startSample
      const px = sampleToPx(sample)
      if (px < 0 || px > w) continue

      const drawCircle = (value: number) => {
        const y = (1 - value) * (h - 2) + 1
        c.beginPath()
        c.arc(px, y, circleRadius, 0, Math.PI * 2)
        c.fill()
        c.stroke()
      }

      const beforeSample = sample > windowStartSample ? Math.max(windowStartSample, sample - 1) : null
      if (j > 0 && beforeSample != null && beforeSample < sample) {
        const valueBefore = getTimelineValueAtSample(segs, beforeSample)
        drawCircle(valueBefore)
      }

      const valueAtBoundary = getTimelineValueAtSample(segs, sample)
      drawCircle(valueAtBoundary)
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
  }, [audioContext, bpmValue, timelineLabels, theme.colors.argument])

  const widgets = useMemo(() => {
    if (!showWidgets) return []
    if (timelineRefs.length === 0) return []

    const out: EditorWidget[] = []
    for (const ref of timelineRefs) {
      out.push({
        type: 'above',
        line: ref.loc.line,
        column: 1,
        length: 1,
        height: 40,
        pointerDown: (x, y, offsetX, offsetY) => {
        },
        render: (ctx, _x, y, _w, h, vx, vw) => {
          drawTimeline(ctx, ref.seqIndex, y, h, vx, vw, ref.color)
        },
      })
    }
    return out
  }, [showWidgets, timelineRefs, dspSource, drawTimeline])

  return { widgets, onBeforeDraw }
}
