import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import {
  FUTURE_SECONDS,
  PAST_SECONDS,
  TIME_WINDOW_SECONDS,
} from '../../as/assembly/constants.ts'
import type { TimelineSequenceRef } from '../bytecode.ts'
import { PIANOROLL_KEY_WIDTH } from './constants.ts'
import type { ProgramInstance } from './program.ts'
import { useEngineStore } from './store.ts'
import { getCurrentTheme } from './theme.ts'
import {
  getTimelineValue,
  getTimelineValueAtSample,
  readTimelineSegsFromHistory,
  type TimelineSeg,
} from './timeline-history.ts'
import { updatePredictedSampleCount } from './updatePredictedSampleCount.ts'
import { applySmoothing } from './util.ts'

type TimelineState = {
  timeSeconds: number | null
  sampleCount: number
  segs: TimelineSeg[]
  savedSegs: TimelineSeg[]
  frameSegs: TimelineSeg[]
}

type UseTimelineParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  timelineRefs: TimelineSequenceRef[]
  dspSource: string
  showWidgets: boolean
}

export function useTimelineWidget({
  program1,
  audioContext,
  bpmValue,
  globalSampleCount,
  timelineRefs,
  dspSource,
  showWidgets,
}: UseTimelineParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const stateRef = useRef<Map<number, TimelineState>>(new Map())

  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.histories) return

    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    })
    if (!pred) return
    const { sampleRate, sampleCount, timeSeconds } = pred

    const prepareStatus = useEngineStore.getState().prepareDspStatus
    const isWorkletBusy = !!(prepareStatus && Atomics.load(prepareStatus, 0) !== 1)

    const seenSeqs = new Set<number>()
    for (const ref of timelineRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)

      const history = program1.program.histories[seqIndex]
      if (!history) continue

      const st = stateRef.current.get(seqIndex) ?? {
        timeSeconds: null,
        sampleCount: 0,
        segs: [],
        savedSegs: [],
        frameSegs: [],
      }

      st.sampleCount = sampleCount
      if (st.timeSeconds == null) st.timeSeconds = timeSeconds
      else st.timeSeconds = applySmoothing(st.timeSeconds, timeSeconds)

      const windowStartTime = st.timeSeconds - PAST_SECONDS
      const windowEndTime = st.timeSeconds + FUTURE_SECONDS

      const canUseSaved = isWorkletBusy && st.savedSegs.length > 0
      if (canUseSaved) {
        st.frameSegs = st.savedSegs
        stateRef.current.set(seqIndex, st)
        continue
      }

      const segs = readTimelineSegsFromHistory(history.raw, sampleRate, windowStartTime, windowEndTime)

      st.segs = segs
      st.savedSegs = segs
      st.frameSegs = segs
      stateRef.current.set(seqIndex, st)
    }
  }, [showWidgets, program1, audioContext, globalSampleCount, timelineRefs])

  const drawTimeline = useCallback((
    c: CanvasRenderingContext2D,
    seqIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    if (!audioContext || !bpmValue) return
    const st = stateRef.current.get(seqIndex)
    if (!st || st.timeSeconds == null) return

    const x = viewX + PIANOROLL_KEY_WIDTH
    const h = Math.max(40, widgetHeight)
    const w = Math.max(1, viewWidth - PIANOROLL_KEY_WIDTH)
    const sampleRate = audioContext.sampleRate

    const windowStartTime = st.timeSeconds - PAST_SECONDS
    const windowStartSample = windowStartTime * sampleRate

    const bpm = bpmValue[0] || 60
    const barLengthSeconds = (4 * 60) / bpm
    const beatLengthSeconds = 60 / bpm
    const currentTimeX = (PAST_SECONDS / TIME_WINDOW_SECONDS) * w

    c.save()
    c.lineCap = 'square'
    c.lineJoin = 'miter'
    c.translate(x, 0)

    c.save()
    c.translate(0, widgetY)
    c.beginPath()
    c.rect(0, -10, w, h + 20)
    c.clip()

    c.fillStyle = 'rgba(0, 0, 0, 0.35)'
    c.fillRect(0, 0, w, h)

    c.fillStyle = 'rgba(75, 75, 75, 0.3)'
    c.fillRect(0, 0, w, h)

    // Grid (alternating bar fills like pianoroll)
    const pixelsPerSecond = w / TIME_WINDOW_SECONDS
    const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
    for (let barStart = firstBarStart; barStart < windowStartTime + TIME_WINDOW_SECONDS; barStart += barLengthSeconds) {
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
    for (let beatStart = firstBeatStart; beatStart < windowStartTime + TIME_WINDOW_SECONDS;
      beatStart += beatLengthSeconds)
    {
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

    c.strokeStyle = getCurrentTheme().colors.function
    c.lineWidth = 1.35

    // helper to compute pixel X for a sample
    const sampleToPx = (samp: number) => ((samp - windowStartSample) / (TIME_WINDOW_SECONDS * sampleRate)) * w

    c.beginPath()
    let prevSample = windowStartSample
    for (let px = 0; px <= w; px++) {
      const t = px / w
      const sample = windowStartSample + t * TIME_WINDOW_SECONDS * sampleRate
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
    c.fillStyle = 'rgba(0, 255, 255, 0.95)'
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
    c.strokeStyle = 'rgba(255, 255, 0, 0.8)'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(currentTimeX, 0)
    c.lineTo(currentTimeX, h)
    c.stroke()

    c.restore()
    c.restore()
  }, [audioContext, bpmValue])

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
          drawTimeline(ctx, ref.seqIndex, y, h, vx, vw)
        },
      })
    }
    return out
  }, [showWidgets, timelineRefs, dspSource, drawTimeline])

  return { widgets, onBeforeDraw }
}
