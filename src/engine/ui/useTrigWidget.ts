import type { EditorWidget } from 'mini-code'
import type React from 'react'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import {
  TRIG_DATA_OFFSET,
  TRIG_ENTRY_SIZE,
  TRIG_HISTORY_SIZE,
} from '../../../as/assembly/constants.ts'
import type { AtRef, EuclidRef, EveryRef } from '../bytecode/bytecode.ts'
import type { ProgramInstance, VmTrigHistory } from '../dsp/program.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'

type UseTrigWidgetParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  everyRefs: EveryRef[] | undefined
  atRefs: AtRef[] | undefined
  euclidRefs: EuclidRef[] | undefined
  dspSource: string
  showWidgets: boolean
  isLive: boolean
  playbackState: 'stopped' | 'running' | 'paused'
}

type Pt = { tsMod: number; value: number }
type St = { pts: Pt[]; a: number }

function clamp01(n: number): number {
  if (n <= 0) return 0
  if (n >= 1) return 1
  return n
}

function readTrigHistory(
  history: VmTrigHistory,
  lastWritePosRef: React.MutableRefObject<number>,
  stRef: React.MutableRefObject<Array<St | undefined>>,
  dataOffset: number,
  entrySize: number,
  historySize: number,
): void {
  const MOD = 1 << 20
  const writePos = Math.floor(history.writePos) >>> 0
  const prevWritePos = lastWritePosRef.current >>> 0
  lastWritePosRef.current = writePos
  if (writePos === prevWritePos) return

  const raw = history.raw
  const deltaRaw = (writePos - prevWritePos + MOD) % MOD
  const delta = Math.min(deltaRaw, historySize)

  for (let k = delta; k > 0; k--) {
    const p = (writePos - k) >>> 0
    const slot = p % historySize
    const base = dataOffset + slot * entrySize
    const idx = Math.floor(raw[base] ?? 0)
    const value = raw[base + 1] ?? 0
    const tsMod = (Math.floor(raw[base + 2] ?? 0) >>> 0) & (MOD - 1)
    if (idx < 0 || idx > 255) continue

    let st = stRef.current[idx]
    if (!st) {
      st = { pts: [], a: 0 }
      stRef.current[idx] = st
    }
    st.pts.push({ tsMod, value })
    const keep = 128
    if (st.pts.length > keep) st.pts.splice(0, st.pts.length - keep)
  }
}

function updateTrigStates(
  stRef: React.MutableRefObject<Array<St | undefined>>,
  nowMod: number,
  sampleRate: number,
  fadeSeconds: number,
): void {
  const MOD = 1 << 20
  const fadeSamples = Math.max(1, Math.floor(sampleRate * fadeSeconds))

  const stArr = stRef.current
  for (let idx = 0; idx < stArr.length; idx++) {
    const st = stArr[idx]
    if (!st) continue
    const pts = st.pts
    if (!pts.length) {
      st.a = 0
      continue
    }

    let best: Pt | null = null
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i]!
      const ahead = (p.tsMod - nowMod + MOD) % MOD
      if (ahead !== 0 && ahead < MOD / 2) continue
      best = p
      break
    }
    best ??= pts[0]!

    const ageSamples = (nowMod - best.tsMod + MOD) % MOD
    if (ageSamples > MOD / 2) {
      st.a = 0
      continue
    }

    const a = 1 - ageSamples / fadeSamples
    st.a = clamp01(a) * clamp01(best.value)
  }
}

export function useTrigWidget({
  program1,
  audioContext,
  globalSampleCount,
  everyRefs,
  atRefs,
  euclidRefs,
  dspSource,
  showWidgets,
  isLive,
  playbackState,
}: UseTrigWidgetParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const everies = everyRefs ?? []
  const ats = atRefs ?? []
  const euclids = euclidRefs ?? []

  const lastWritePosEveryRef = useRef(0)
  const lastWritePosAtRef = useRef(0)
  const lastWritePosEuclidRef = useRef(0)
  const everyStRef = useRef<Array<St | undefined>>([])
  const atStRef = useRef<Array<St | undefined>>([])
  const euclidStRef = useRef<Array<St | undefined>>([])
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  useEffect(() => {
    lastWritePosEveryRef.current = 0
    lastWritePosAtRef.current = 0
    lastWritePosEuclidRef.current = 0
    everyStRef.current.length = 0
    atStRef.current.length = 0
    euclidStRef.current.length = 0
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
  }, [dspSource])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!isLive) return
    if (everies.length === 0 && ats.length === 0 && euclids.length === 0) return

    const trigHistory = program1?.program.trigHistory
    if (!trigHistory) return

    const trigWritePos = Math.floor(trigHistory.writePos) >>> 0

    if (playbackState !== 'running') {
      lastWritePosEveryRef.current = trigWritePos
      lastWritePosAtRef.current = trigWritePos
      lastWritePosEuclidRef.current = trigWritePos
      predictedSampleCountRef.current = null
      lastWallTimeRef.current = null
      isFirstFrameRef.current = true
      return
    }

    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    }, { isPlaying: true })
    if (!pred) return

    const MOD = 1 << 20
    const nowMod = (Math.floor(pred.sampleCount) >>> 0) & (MOD - 1)
    const fadeSeconds = 0.25

    readTrigHistory(
      trigHistory,
      lastWritePosEveryRef,
      everyStRef,
      TRIG_DATA_OFFSET,
      TRIG_ENTRY_SIZE,
      TRIG_HISTORY_SIZE,
    )
    updateTrigStates(everyStRef, nowMod, pred.sampleRate, fadeSeconds)

    readTrigHistory(
      trigHistory,
      lastWritePosAtRef,
      atStRef,
      TRIG_DATA_OFFSET,
      TRIG_ENTRY_SIZE,
      TRIG_HISTORY_SIZE,
    )
    updateTrigStates(atStRef, nowMod, pred.sampleRate, fadeSeconds)

    readTrigHistory(
      trigHistory,
      lastWritePosEuclidRef,
      euclidStRef,
      TRIG_DATA_OFFSET,
      TRIG_ENTRY_SIZE,
      TRIG_HISTORY_SIZE,
    )
    updateTrigStates(euclidStRef, nowMod, pred.sampleRate, fadeSeconds)
  }, [showWidgets, isLive, playbackState, everies.length, ats.length, euclids.length, program1?.program.trigHistory, audioContext, globalSampleCount])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (everies.length === 0 && ats.length === 0 && euclids.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    for (const ref of everies) {
      const loc = ref.loc
      const absStart = (lineStarts[loc.line - 1] ?? 0) + (loc.column - 1)
      const absEnd = absStart + Math.max(1, loc.length)
      for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
        out.push({
          type: 'overlay',
          line: span.line,
          column: span.column,
          length: span.length,
          render: (ctx, x, y, w, h) => {
            const a = everyStRef.current[ref.everyIndex | 0]?.a ?? 0
            if (a <= 0) return
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`
            ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
          },
        })
      }
    }

    for (const ref of ats) {
      const loc = ref.loc
      const absStart = (lineStarts[loc.line - 1] ?? 0) + (loc.column - 1)
      const absEnd = absStart + Math.max(1, loc.length)
      for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
        out.push({
          type: 'overlay',
          line: span.line,
          column: span.column,
          length: span.length,
          render: (ctx, x, y, w, h) => {
            const a = atStRef.current[ref.atIndex | 0]?.a ?? 0
            if (a <= 0) return
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`
            ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
          },
        })
      }
    }

    for (const ref of euclids) {
      const loc = ref.loc
      const absStart = (lineStarts[loc.line - 1] ?? 0) + (loc.column - 1)
      const absEnd = absStart + Math.max(1, loc.length)
      for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
        out.push({
          type: 'overlay',
          line: span.line,
          column: span.column,
          length: span.length,
          render: (ctx, x, y, w, h) => {
            const a = euclidStRef.current[ref.euclidIndex | 0]?.a ?? 0
            if (a <= 0) return
            ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`
            ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
          },
        })
      }
    }

    return out
  }, [showWidgets, dspSource, everies, ats, euclids])

  return { widgets, onBeforeDraw }
}


