import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import {
  ARRAY_HEADER_SIZE,
  TIMELINE_HEADER_SIZE,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../../as/assembly/constants.ts'
import type { TimelineSequenceRef } from '../bytecode.ts'
import { compileTimelineNotation } from '../timeline/compiler.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'
import type { ProgramInstance } from './program.ts'
import { updatePredictedSampleCount } from './updatePredictedSampleCount.ts'

type UseTimelineSequenceParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  timelineRefs: TimelineSequenceRef[]
  dspSource: string
  showWidgets: boolean
}

function getActiveTimelineSegIndex(
  arrayRaw: Float32Array,
  sampleCount: number,
  sampleRate: number,
  bpm: number,
): { si: number; tt: number } | null {
  const base = ARRAY_HEADER_SIZE
  const opLength = arrayRaw[base] as number
  if (!opLength || opLength <= 0) return null

  const magic = arrayRaw[base + 1] as number
  if (magic !== TIMELINE_MAGIC) return null

  const segCount = Math.floor(arrayRaw[base + 2] as number)
  if (!Number.isFinite(segCount) || segCount <= 0) return null

  const totalBars = arrayRaw[base + 3] as number
  const beatDiv = arrayRaw[base + 4] as number
  if (!Number.isFinite(totalBars) || !Number.isFinite(beatDiv) || totalBars <= 0 || beatDiv <= 0) return null

  const cycleBeats = totalBars * beatDiv
  const beatsPerSample = (bpm / 60) / sampleRate
  const beatAbs = sampleCount * beatsPerSample
  const cycle = Math.floor(beatAbs / cycleBeats)
  const localBeat = beatAbs - cycle * cycleBeats

  const segBase = base + 1 + TIMELINE_HEADER_SIZE
  let accBeats = 0
  for (let si = 0; si < segCount; si++) {
    const segOffset = segBase + si * TIMELINE_SEGMENT_SIZE
    const durBars = arrayRaw[segOffset + 1] as number
    if (!durBars || durBars <= 0) continue
    const durBeats = durBars * beatDiv
    if (localBeat < accBeats + durBeats) {
      const tt = durBeats > 0 ? (localBeat - accBeats) / durBeats : 0
      return { si, tt: Math.max(0, Math.min(1, tt)) }
    }
    accBeats += durBeats
  }

  return null
}

export function useTimelineSequenceWidget({
  program1,
  audioContext,
  bpmValue,
  globalSampleCount,
  timelineRefs,
  dspSource,
  showWidgets,
}: UseTimelineSequenceParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const activeSegRef = useRef<Map<number, { si: number; tt: number } | null>>(new Map())
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.data) return
    if (!audioContext || !bpmValue) return

    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    })
    if (!pred) return
    const { sampleCount, sampleRate } = pred

    const bpm = bpmValue[0] || 60
    const seenSeqs = new Set<number>()
    for (const ref of timelineRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)

      const array = program1.program.data.arrays[seqIndex]
      if (!array) continue
      const st = getActiveTimelineSegIndex(array.raw, sampleCount, sampleRate, bpm)
      activeSegRef.current.set(seqIndex, st)
    }
  }, [showWidgets, program1, audioContext, bpmValue, globalSampleCount, timelineRefs])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (timelineRefs.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    const tokensBySeqIndex = new Map<number, ReturnType<typeof compileTimelineNotation>['tokens']>()
    const getTokens = (seqIndex: number, sequence: string) => {
      const existing = tokensBySeqIndex.get(seqIndex)
      if (existing) return existing
      const compiled = compileTimelineNotation(sequence)
      const tokens = compiled.tokens ?? []
      tokensBySeqIndex.set(seqIndex, tokens)
      return tokens
    }

    for (const ref of timelineRefs) {
      const tokens = getTokens(ref.seqIndex, ref.sequence)
      if (tokens.length === 0) continue

      for (let si = 0; si < tokens.length; si++) {
        const t = tokens[si]!
        const renderToken = (
          role: 'from' | 'to',
          tokenStart: number,
          tokenLength: number,
        ) => {
          const length = Math.max(1, tokenLength)
          const absStart = ref.start + tokenStart
          const absEnd = absStart + length
          for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
            out.push({
              type: 'overlay',
              line: span.line,
              column: span.column,
              length: span.length,
              render: (ctx, x, y, w, h) => {
                const active = activeSegRef.current.get(ref.seqIndex)
                if (!active || active.si !== si) return

                const tt = active.tt
                const a = role === 'from'
                  ? 0.25 + 0.75 * (1 - tt)
                  : 0.25 + 0.75 * tt

                const color = [255, 255, 255]

                ctx.fillStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.25 * a})`
                ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
                // ctx.strokeStyle = `rgba(${color[0]}, ${color[1]}, ${color[2]}, ${0.9 * a})`
                // ctx.lineWidth = 1
                // ctx.strokeRect(x - 2, y - 2, w + 4, h - 1)
              },
            })
          }
        }

        renderToken('from', t.fromTokenStart, t.fromTokenLength)
        renderToken('to', t.toTokenStart, t.toTokenLength)
      }
    }

    return out
  }, [showWidgets, dspSource, timelineRefs])

  return { widgets, onBeforeDraw }
}
