import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import {
  FUTURE_SECONDS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  PAST_SECONDS,
  TIME_WINDOW_SECONDS,
} from '../../as/assembly/constants.ts'
import type { TimelineSequenceRef } from '../bytecode.ts'
import { PIANOROLL_KEY_WIDTH } from './constants.ts'
import type { ProgramInstance } from './program.ts'
import { useEngineStore } from './store.ts'
import { updatePredictedSampleCount } from './updatePredictedSampleCount.ts'

type TimelineSeg = {
  startSample: number
  endSample: number
  a: number
  b: number
  kind: number
  exp: number
}

function curveValue(t: number, curve: number): number {
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
      else st.timeSeconds += (timeSeconds - st.timeSeconds) * 0.2

      const windowStartTime = st.timeSeconds - PAST_SECONDS
      const windowEndTime = st.timeSeconds + FUTURE_SECONDS

      const canUseSaved = isWorkletBusy && st.savedSegs.length > 0
      if (canUseSaved) {
        st.frameSegs = st.savedSegs
        stateRef.current.set(seqIndex, st)
        continue
      }

      const segs: TimelineSeg[] = []
      const historyRaw = history.raw

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
        if (endTimeSeconds < windowStartTime || startTimeSeconds > windowEndTime) continue

        segs.push({
          startSample,
          endSample,
          a,
          b,
          kind,
          exp,
        })
      }

      segs.sort((x, y) => x.startSample - y.startSample)

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
    const barLengthSeconds = (60) / bpm
    const cycleLengthSeconds = 60 / bpm
    const currentTimeX = (PAST_SECONDS / TIME_WINDOW_SECONDS) * w

    c.save()
    c.translate(x, 0)

    c.save()
    c.translate(0, widgetY)
    c.beginPath()
    c.rect(0, 0, w, h)
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
      // Group bars in sets of 4 and alternate the group's color to match pianoroll
      const barGroupIndex = Math.floor(barIndex / 4)
      const isEvenGroup = barGroupIndex % 2 === 0
      const barX = (barStart - windowStartTime) * pixelsPerSecond
      const barWidth = barLengthSeconds * pixelsPerSecond
      c.fillStyle = isEvenGroup ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)'
      c.fillRect(barX, 0, barWidth, h)
    }

    // Vertical separators for bar boundaries
    c.strokeStyle = '#000'
    c.lineWidth = 0.25
    const firstBar = Math.floor(windowStartTime / barLengthSeconds) - 1
    const lastBar = Math.floor((windowStartTime + TIME_WINDOW_SECONDS) / barLengthSeconds) + 1
    for (let bar = firstBar; bar <= lastBar; bar++) {
      const t = bar * barLengthSeconds
      const px = (t - windowStartTime) * pixelsPerSecond
      c.beginPath()
      c.moveTo(px, 0)
      c.lineTo(px, h)
      c.stroke()
    }

    c.strokeStyle = 'rgba(255, 255, 255, 0.04)'
    const firstBeat = Math.floor(windowStartTime / cycleLengthSeconds) - 1
    const lastBeat = Math.floor((windowStartTime + TIME_WINDOW_SECONDS) / cycleLengthSeconds) + 1
    for (let beat = firstBeat; beat <= lastBeat; beat++) {
      const t = beat * cycleLengthSeconds
      const px = (t - windowStartTime) * pixelsPerSecond
      c.beginPath()
      c.moveTo(px, 0)
      c.lineTo(px, h)
      c.stroke()
    }

    // Value line
    const segs = st.frameSegs
    let si = 0

    const getValue = (sample: number): number => {
      while (si < segs.length && sample >= segs[si]!.endSample) si++
      const s = segs[si]
      if (!s || sample < s.startSample) return 0
      if (s.kind !== 1 || s.endSample <= s.startSample) return s.a
      const tt = (sample - s.startSample) / (s.endSample - s.startSample)
      const p = curveValue(tt, s.exp)
      return s.a + (s.b - s.a) * p
    }

    c.strokeStyle = 'rgba(0, 255, 255, 0.85)'
    c.lineWidth = 2
    c.beginPath()
    for (let px = 0; px <= w; px++) {
      const t = px / w
      const sample = windowStartSample + t * TIME_WINDOW_SECONDS * sampleRate
      const v = getValue(sample)
      const y = (1 - v) * (h - 2) + 1
      if (px === 0) c.moveTo(px, y)
      else c.lineTo(px, y)
    }
    c.stroke()

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
        render: (ctx, _x, y, _w, h, vx, vw) => {
          drawTimeline(ctx, ref.seqIndex, y, h, vx, vw)
        },
      })
    }
    return out
  }, [showWidgets, timelineRefs, dspSource, drawTimeline])

  return { widgets, onBeforeDraw }
}
