import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'
import {
  FUTURE_BARS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  OP_OCTAVE,
  OP_SCALE,
  OP_SWING,
  OP_TRANSPOSE,
  PAST_BARS,
} from '../../../as/assembly/constants.ts'
import type { SourceLocation } from '../../lib/mini-source-map.ts'
import { splitValueAndModifiers } from '../../mini/tokenizer.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'

export type SeqFrame = {
  events: Map<number, number>
  controls: Map<number, number>
}

type ControlHistory = {
  opIndex: number
  startSample: number
}

type FadingState = {
  opIndex: number
  fromSample: number
  fromWallTime: number
}

export type SeqControlState = {
  octaveHistory: ControlHistory | null
  transposeHistory: ControlHistory | null
  scaleHistory: ControlHistory | null
  swingHistory: ControlHistory | null
  fadingOctave?: FadingState
  fadingTranspose?: FadingState
  fadingScale?: FadingState
  fadingSwing?: FadingState
  lastSampleCount: number | null
  seq: string | null
}

type UseSequenceParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  sequences: string[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  miniRefs: Array<{ seqIndex: number; loc: { line: number }; start: number }>
  dspSource: string
  showWidgets: boolean
  isPlaying: boolean
  frameRef: preact.RefObject<Array<SeqFrame | undefined>>
  controlStateRef: preact.RefObject<Map<number, SeqControlState>>
  resetKey?: string | number | null
}

const CONTROL_REGEX = /\b(octave|transpose|scale|swing)\b/
const WHITESPACE_REGEX = /\s/
const SIGN_REGEX = /[+-]/
const DIGIT_REGEX = /[0-9]/
const NOTE_REGEX = /^[a-gA-G](?:#|b)?[0-9]+/
const NAME_REGEX = /^[a-zA-Z]+/
const EUCLID_SUFFIX_REGEX = /\(\s*\d+\s*,\s*\d+(?:\s*,\s*-?\d+)?\s*\)/

function getControlKind(text: string): 'octave' | 'transpose' | 'scale' | 'swing' | null {
  const match = text.match(CONTROL_REGEX)
  const kind = match?.[1] as 'octave' | 'transpose' | 'scale' | 'swing' | null | undefined
  return kind ?? null
}

function getControlDeltaSpan(location: SourceLocation): { start: number; end: number } | null {
  const text = location.text
  const match = text.match(CONTROL_REGEX)
  const index = match?.index
  if (index == null || match == null) return null

  let i = index + match[0].length
  while (i < text.length && WHITESPACE_REGEX.test(text[i]!)) i++
  if (i >= text.length) return null

  const start = i
  let j = i
  const kind = match[1]
  if (kind === 'octave' || kind === 'transpose' || kind === 'swing') {
    if (SIGN_REGEX.test(text[j]!)) {
      j++
      while (j < text.length && WHITESPACE_REGEX.test(text[j]!)) j++
    }
    const digitsStart = j
    if (text[j] === '.') {
      j++
      const fracStart = j
      while (j < text.length && DIGIT_REGEX.test(text[j]!)) j++
      if (j === fracStart) return null
    }
    else {
      while (j < text.length && DIGIT_REGEX.test(text[j]!)) j++
      if (j < text.length && text[j] === '.') {
        j++
        while (j < text.length && DIGIT_REGEX.test(text[j]!)) j++
      }
      if (j === digitsStart) return null
    }
  }
  else if (kind === 'scale') {
    const noteMatch = text.slice(j).match(NOTE_REGEX)
    if (noteMatch) {
      j += noteMatch[0].length
      while (j < text.length && WHITESPACE_REGEX.test(text[j]!)) j++
    }
    const nameMatch = text.slice(j).match(NAME_REGEX)
    if (nameMatch) {
      j += nameMatch[0].length
    }
    if (j === start) return null
  }
  else {
    return null
  }

  return { start: location.start + start, end: location.start + j }
}

function updateControlHistory(
  history: ControlHistory | null,
  opIndex: number,
  startSample: number,
): ControlHistory {
  if (!history) return { opIndex, startSample }
  if (startSample > history.startSample) return { opIndex, startSample }
  return history
}

function updateFadingControl(
  fading: FadingState | undefined,
  current: number | null,
  prev: number | null,
  history: ControlHistory | null,
  currentSampleCount: number,
  sampleRate: number,
  FADEOUT_SECONDS: number,
): FadingState | undefined {
  if (current !== null && prev !== current && prev !== null) {
    return {
      opIndex: prev,
      fromSample: history ? history.startSample : currentSampleCount,
      fromWallTime: performance.now() / 1000,
    }
  }
  return fading
}

function applyFadeToControls(
  fading: FadingState | undefined,
  controls: Map<number, number>,
  currentSampleCount: number,
  sampleRate: number,
  FADEOUT_SECONDS: number,
): FadingState | undefined {
  if (!fading) return undefined
  const nowSec = performance.now() / 1000
  let age = (currentSampleCount - fading.fromSample) / sampleRate
  if (age < 0) age = 0
  if (age === 0) {
    const wallAge = nowSec - (fading.fromWallTime ?? nowSec)
    if (wallAge > 0) age = wallAge
  }
  if (age >= 0 && age <= FADEOUT_SECONDS) {
    controls.set(
      fading.opIndex,
      Math.max(controls.get(fading.opIndex) ?? 0, 1 - age / FADEOUT_SECONDS),
    )
    return fading
  }
  return undefined
}

export function useSequenceWidget({
  audioContext,
  bpmValue,
  globalSampleCount,
  sequences,
  miniSourceMaps,
  miniRefs,
  dspSource,
  showWidgets,
  isPlaying,
  frameRef,
  controlStateRef,
  resetKey,
}: UseSequenceParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const controls = new Map<number, number>()

  useEffect(() => {
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
    frameRef.current = []
    controlStateRef.current.clear()
  }, [resetKey])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    const visualWasm = useEngineRuntimeStore.getState().visualWasm
    if (!visualWasm) return
    const FADEOUT_SECONDS = 0.3
    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    }, { isPlaying })
    if (!pred) return
    const { sampleRate, sampleCount: currentSampleCount } = pred

    const bpm = bpmValue?.[0] || 60
    const barLengthSeconds = (4 * 60) / bpm
    const windowStartSample = Math.max(
      0,
      Math.floor(currentSampleCount - PAST_BARS * barLengthSeconds * sampleRate),
    )
    const windowEndSample = Math.max(
      windowStartSample + 1,
      Math.floor(currentSampleCount + FUTURE_BARS * barLengthSeconds * sampleRate),
    )

    const nextFrame: Array<SeqFrame | undefined> = new Array(miniSourceMaps.length)

    // Iterate only over referenced mini sequences so frames align with actual refs
    const seenSeqs = new Set<number>()
    for (const ref of miniRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)
      const map = miniSourceMaps[seqIndex]
      if (!map) continue

      const seq = sequences[seqIndex]
      if (!seq) continue

      const st = controlStateRef.current.get(seqIndex) ?? {
        octaveHistory: null,
        transposeHistory: null,
        scaleHistory: null,
        swingHistory: null,
        lastSampleCount: null,
        seq: null,
      }

      // Capture previous active op indices so we can create fading entries when they change.
      const prevOctaveOp = st.octaveHistory?.opIndex ?? null
      const prevTransposeOp = st.transposeHistory?.opIndex ?? null
      const prevScaleOp = st.scaleHistory?.opIndex ?? null
      const prevSwingOp = st.swingHistory?.opIndex ?? null

      const prevSampleCount = st.lastSampleCount
      const didSeek = prevSampleCount != null && currentSampleCount < prevSampleCount
      const didPause = prevSampleCount != null && currentSampleCount === prevSampleCount
      st.lastSampleCount = currentSampleCount
      const didEdit = st.seq != null && st.seq !== seq
      st.seq = seq
      if (didSeek || didEdit) {
        st.octaveHistory = null
        st.transposeHistory = null
        st.scaleHistory = null
        st.swingHistory = null
        st.fadingOctave = undefined
        st.fadingTranspose = undefined
        st.fadingScale = undefined
        st.fadingSwing = undefined
      }
      else if (didPause) {
        const playbackState = useEngineRuntimeStore.getState().playbackState
        if (playbackState === 'stopped') {
          // Only clear fades immediately when user pressed stop.
          st.fadingOctave = undefined
          st.fadingTranspose = undefined
          st.fadingScale = undefined
          st.fadingSwing = undefined
        }
      }

      const eventData = new Map<number, { startSample: number; endSample: number; velocity: number }>()
      const historyRaw = visualWasm.generateMiniHistoryWindow({
        seqIndex,
        seq,
        windowStartSample,
        windowEndSample,
        bpm,
        sampleRate,
      })

      for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
        const opIndex = Math.floor(historyRaw[idx])
        const voiceIndex = Math.floor(historyRaw[idx + 1])
        const value = historyRaw[idx + 2] as number
        const velocity = historyRaw[idx + 3]
        const startSample = historyRaw[idx + 4] as number
        const endSample = historyRaw[idx + 5] as number

        if (startSample === 0 && endSample === 0) continue

        const toleranceSamples = sampleRate * 0.001
        if (startSample > currentSampleCount + toleranceSamples) continue
        if (voiceIndex >= 0 && value <= 0) {
          const txt = map.get(opIndex)?.text ?? ''
          if (EUCLID_SUFFIX_REGEX.test(txt)) continue
        }

        if (voiceIndex < 0) {
          const op = -voiceIndex

          if (op === OP_OCTAVE) {
            st.octaveHistory = updateControlHistory(st.octaveHistory, opIndex, startSample)
          }
          else if (op === OP_TRANSPOSE) {
            st.transposeHistory = updateControlHistory(st.transposeHistory, opIndex, startSample)
          }
          else if (op === OP_SCALE) {
            st.scaleHistory = updateControlHistory(st.scaleHistory, opIndex, startSample)
          }
          else if (op === OP_SWING) {
            st.swingHistory = updateControlHistory(st.swingHistory, opIndex, startSample)
          }
        }
        else {
          const existing = eventData.get(opIndex)
          if (!existing || startSample > existing.startSample) {
            eventData.set(opIndex, { startSample, endSample, velocity })
          }
        }
      }

      const currentOctave = st.octaveHistory?.opIndex ?? null
      const currentTranspose = st.transposeHistory?.opIndex ?? null
      const currentScale = st.scaleHistory?.opIndex ?? null
      const currentSwing = st.swingHistory?.opIndex ?? null

      st.fadingOctave = updateFadingControl(st.fadingOctave, currentOctave, prevOctaveOp, st.octaveHistory,
        currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingTranspose = updateFadingControl(st.fadingTranspose, currentTranspose, prevTransposeOp,
        st.transposeHistory, currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingScale = updateFadingControl(st.fadingScale, currentScale, prevScaleOp, st.scaleHistory,
        currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingSwing = updateFadingControl(st.fadingSwing, currentSwing, prevSwingOp, st.swingHistory,
        currentSampleCount, sampleRate, FADEOUT_SECONDS)

      const events = new Map<number, number>()
      for (const [opIndex, { endSample, velocity }] of eventData.entries()) {
        const velocityClamped = Math.max(0, Math.min(1, velocity || 0))
        if (currentSampleCount <= endSample) {
          events.set(opIndex, velocityClamped)
          continue
        }
        const fadeAge = (currentSampleCount - endSample) / sampleRate
        if (fadeAge <= FADEOUT_SECONDS) {
          events.set(opIndex, (1 - fadeAge / FADEOUT_SECONDS) * velocityClamped)
        }
      }

      controls.clear()
      if (st.octaveHistory) controls.set(st.octaveHistory.opIndex, 1)
      if (st.transposeHistory) controls.set(st.transposeHistory.opIndex, 1)
      if (st.scaleHistory) controls.set(st.scaleHistory.opIndex, 1)
      if (st.swingHistory) controls.set(st.swingHistory.opIndex, 1)

      st.fadingOctave = applyFadeToControls(st.fadingOctave, controls, currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingTranspose = applyFadeToControls(st.fadingTranspose, controls, currentSampleCount, sampleRate,
        FADEOUT_SECONDS)
      st.fadingScale = applyFadeToControls(st.fadingScale, controls, currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingSwing = applyFadeToControls(st.fadingSwing, controls, currentSampleCount, sampleRate, FADEOUT_SECONDS)

      controlStateRef.current.set(seqIndex, st)
      nextFrame[seqIndex] = { events, controls }
    }

    frameRef.current = nextFrame
  }, [
    showWidgets,
    audioContext,
    bpmValue,
    globalSampleCount,
    isPlaying,
    sequences,
    miniSourceMaps,
    miniRefs,
    controlStateRef,
    frameRef,
  ])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (miniRefs.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    for (const ref of miniRefs) {
      const map = miniSourceMaps[ref.seqIndex]
      if (!map) continue
      const seqIndex = ref.seqIndex

      for (const [opIndex, loc] of map.entries()) {
        const kind = getControlKind(loc.text)

        if (kind) {
          const delta = getControlDeltaSpan(loc)
          if (!delta) continue
          const absStart = ref.start + delta.start
          const absEnd = ref.start + delta.end
          for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
            out.push({
              type: 'overlay',
              line: span.line,
              column: span.column,
              length: span.length,
              render: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
                const f = frameRef.current[seqIndex]
                const a = f?.controls.get(opIndex) ?? 0
                if (a <= 0) return
                const [r, g, b] = [255, 255, 255]
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.25 * a})`
                ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
              },
            })
          }
          continue
        }

        const { value } = splitValueAndModifiers(loc.text)
        const tokenLen = Math.max(1, value.length || (loc.end - loc.start))
        const absStart = ref.start + loc.start
        const absEnd = absStart + tokenLen
        for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
          out.push({
            type: 'overlay',
            line: span.line,
            column: span.column,
            length: span.length,
            render: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => {
              const f = frameRef.current[seqIndex]
              const a = f?.events.get(opIndex) ?? 0
              if (a <= 0) return
              ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * a})`
              ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
            },
          })
        }
      }
    }

    return out
  }, [showWidgets, dspSource, miniRefs, miniSourceMaps, frameRef])

  return { widgets, onBeforeDraw }
}
