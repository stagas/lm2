import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'preact/hooks'
import {
  ARRAY_HEADER_SIZE,
  TIMELINE_HEADER_SIZE,
  TIMELINE_MAGIC,
  TIMELINE_SEGMENT_SIZE,
} from '../../../as/assembly/constants.ts'
import { compileTimelineNotation } from '../../timeline/compiler.ts'
import type { TimelineSequenceRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { applyCurve } from '../util.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'

type UseTimelineSequenceParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  timelineRefs: TimelineSequenceRef[]
  dspSource: string
  showWidgets: boolean
  isPlaying: boolean
  isLive: boolean
  resetKey?: string | number | null
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

  const totalBarsRaw = arrayRaw[base + 3] as number
  const noWrap = totalBarsRaw < 0
  const totalBars = Math.abs(totalBarsRaw)
  const beatDiv = arrayRaw[base + 4] as number
  if (!Number.isFinite(totalBars) || !Number.isFinite(beatDiv) || totalBars <= 0 || beatDiv <= 0) return null

  const cycleBeats = totalBars * beatDiv
  const beatsPerSample = (bpm / 60) / sampleRate
  const beatAbs = sampleCount * beatsPerSample
  let localBeat = 0
  if (noWrap) {
    localBeat = Math.max(0, beatAbs)
  }
  else {
    const cycle = Math.floor(beatAbs / cycleBeats)
    localBeat = beatAbs - cycle * cycleBeats
    if (localBeat < 0) localBeat += cycleBeats
  }

  const segBase = base + 1 + TIMELINE_HEADER_SIZE
  let accBeats = 0
  let lastValidSi = -1
  for (let si = 0; si < segCount; si++) {
    const segOffset = segBase + si * TIMELINE_SEGMENT_SIZE
    const durBars = arrayRaw[segOffset + 1] as number
    if (!durBars || durBars <= 0) continue
    lastValidSi = si
    const durBeats = durBars * beatDiv
    if (localBeat < accBeats + durBeats) {
      const tt = durBeats > 0 ? (localBeat - accBeats) / durBeats : 0
      return { si, tt: Math.max(0, Math.min(1, tt)) }
    }
    accBeats += durBeats
  }

  if (noWrap && lastValidSi >= 0) return { si: lastValidSi, tt: 1 }
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
  isPlaying,
  isLive,
  resetKey,
}: UseTimelineSequenceParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const activeSegRef = useRef<Map<number, { si: number; tt: number } | null>>(new Map())
  const compiledCacheRef = useRef<Map<number, { sequence: string; arrayRaw: Float32Array }>>(new Map())
  const lastResetKeyRef = useRef<string | number | null | undefined>(undefined)
  if (lastResetKeyRef.current !== resetKey) {
    lastResetKeyRef.current = resetKey
    activeSegRef.current.clear()
    compiledCacheRef.current.clear()
  }

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!audioContext || !bpmValue) return

    const pred = useEngineRuntimeStore.getState().predictedSampleCountResult
    if (!pred) return
    const { sampleCount, sampleRate } = pred

    const bpm = bpmValue[0] || 60
    const seenSeqs = new Set<number>()
    for (const ref of timelineRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)

      let st: { si: number; tt: number } | null = null
      if (isLive && program1?.program?.data) {
        const array = program1.program.data.arrays[seqIndex]
        if (!array) continue
        st = getActiveTimelineSegIndex(array.raw, sampleCount, sampleRate, bpm)
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
        st = getActiveTimelineSegIndex(arrayRaw, sampleCount, sampleRate, bpm)
      }
      activeSegRef.current.set(seqIndex, st)
    }
  }, [showWidgets, program1, audioContext, bpmValue, globalSampleCount, isLive, isPlaying, timelineRefs])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (timelineRefs.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    const compiledBySeqIndex = new Map<number, ReturnType<typeof compileTimelineNotation> | undefined>()
    const getCompiled = (seqIndex: number, sequence: string) => {
      const existing = compiledBySeqIndex.get(seqIndex)
      if (existing) return existing
      const compiled = compileTimelineNotation(sequence)
      compiledBySeqIndex.set(seqIndex, compiled)
      return compiled
    }

    for (const ref of timelineRefs) {
      const compiled = getCompiled(ref.seqIndex, ref.sequence)
      const tokens = compiled?.tokens ?? []
      const segments = compiled?.segments ?? []
      if (tokens.length === 0) continue

      for (let si = 0; si < tokens.length; si++) {
        const t = tokens[si]!
        // Skip tokens that are completely invalid (both from and to are implicit)
        if (t.fromTokenStart < 0 && t.toTokenStart < 0) continue

        const renderToken = (
          role: 'from' | 'to',
          tokenStart: number,
          tokenLength: number,
        ) => {
          // Skip rendering for implicit tokens (outside string area)
          if (tokenStart < 0) return

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
                const curve = segments[si]?.exp ?? 1
                const p = Math.max(0, Math.min(1, applyCurve(tt, curve)))
                const a = role === 'from'
                  ? 0.25 + 0.75 * (1 - p)
                  : 0.25 + 0.75 * p

                ctx.fillStyle = `rgba(255,255,255,${0.25 * a})`
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
