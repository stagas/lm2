import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import {
  ARRAY_HEADER_SIZE,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_SIZE,
  HISTORY_SIZE_MINUS_ONE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_OCTAVE,
  OP_SCALE,
  OP_TRANSPOSE,
} from '../../as/assembly/constants.ts'
import type { SourceLocation } from '../lib/mini-source-map.ts'
import { splitValueAndModifiers } from '../mini/tokenizer.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'
import type { ProgramInstance } from './program.ts'
import { useEngineStore } from './store.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'

export type SeqFrame = {
  events: Map<number, number>
  controls: Map<number, number>
}

type ControlHistory = {
  opIndex: number
  startSample: number
  slot: number
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
  fadingOctave?: FadingState
  fadingTranspose?: FadingState
  fadingScale?: FadingState
  lastSampleCount: number | null
  version: number | null
}

type UseSequenceParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  miniRefs: Array<{ seqIndex: number; loc: { line: number }; start: number }>
  dspSource: string
  showWidgets: boolean
  frameRef: React.RefObject<Array<SeqFrame | undefined>>
  controlStateRef: React.RefObject<Map<number, SeqControlState>>
}

const CONTROL_REGEX = /\b(octave|transpose|scale)\b/
const WHITESPACE_REGEX = /\s/
const SIGN_REGEX = /[+-]/
const DIGIT_REGEX = /[0-9]/
const NOTE_REGEX = /^[a-gA-G](?:#|b)?[0-9]+/
const NAME_REGEX = /^[a-zA-Z]+/

function getControlKind(text: string): 'octave' | 'transpose' | 'scale' | null {
  const match = text.match(CONTROL_REGEX)
  const kind = match?.[1] as 'octave' | 'transpose' | 'scale' | null | undefined
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
  if (kind === 'octave' || kind === 'transpose') {
    if (SIGN_REGEX.test(text[j]!)) {
      j++
      while (j < text.length && WHITESPACE_REGEX.test(text[j]!)) j++
    }
    const digitsStart = j
    while (j < text.length && DIGIT_REGEX.test(text[j]!)) j++
    if (j === digitsStart) return null
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
  newestSlot: number,
  history: ControlHistory | null,
  opIndex: number,
  startSample: number,
  slot: number,
  isSlotNewer: (newestSlot: number, slotA: number, slotB: number) => boolean,
): ControlHistory {
  if (!history) return { opIndex, startSample, slot }
  const dt = startSample - history.startSample
  if (dt > 0.5 || (Math.abs(dt) <= 0.5 && opIndex !== history.opIndex && isSlotNewer(newestSlot, slot, history.slot))) {
    return { opIndex, startSample, slot }
  }
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
  program1,
  audioContext,
  globalSampleCount,
  miniSourceMaps,
  miniRefs,
  dspSource,
  showWidgets,
  frameRef,
  controlStateRef,
}: UseSequenceParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const isSlotNewer = (newestSlot: number, slotA: number, slotB: number): boolean => {
    const distA = (newestSlot - slotA + HISTORY_SIZE) & HISTORY_SIZE_MINUS_ONE
    const distB = (newestSlot - slotB + HISTORY_SIZE) & HISTORY_SIZE_MINUS_ONE
    return distA < distB
  }

  const controls = new Map<number, number>()

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.data) return
    const FADEOUT_SECONDS = 0.3
    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    })
    if (!pred) return
    const { sampleRate, sampleCount: currentSampleCount } = pred

    const nextFrame: Array<SeqFrame | undefined> = new Array(miniSourceMaps.length)

    // Iterate only over referenced mini sequences so frames align with actual refs
    const seenSeqs = new Set<number>()
    for (const ref of miniRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)
      const map = miniSourceMaps[seqIndex]
      if (!map) continue

      const array = program1.program.data.arrays[seqIndex]
      const history = program1.program.histories[seqIndex]
      if (!array || !history) continue

      const st = controlStateRef.current.get(seqIndex) ?? {
        octaveHistory: null,
        transposeHistory: null,
        scaleHistory: null,
        lastSampleCount: null,
        version: null,
      }

      // Capture previous active op indices so we can create fading entries when they change.
      const prevOctaveOp = st.octaveHistory?.opIndex ?? null
      const prevTransposeOp = st.transposeHistory?.opIndex ?? null
      const prevScaleOp = st.scaleHistory?.opIndex ?? null

      const currentVersion = (array.raw[3] ?? 0) as number
      const prevSampleCount = st.lastSampleCount
      const didSeek = prevSampleCount != null && currentSampleCount < prevSampleCount
      const didPause = prevSampleCount != null && currentSampleCount === prevSampleCount
      st.lastSampleCount = currentSampleCount
      const didEdit = st.version != null && currentVersion !== st.version
      st.version = currentVersion
      if (didSeek || didEdit) {
        st.octaveHistory = null
        st.transposeHistory = null
        st.scaleHistory = null
        st.fadingOctave = undefined
        st.fadingTranspose = undefined
        st.fadingScale = undefined
      }
      else if (didPause) {
        const playbackState = useEngineStore.getState().playbackState
        if (playbackState === 'stopped') {
          // Only clear fades immediately when user pressed stop.
          st.fadingOctave = undefined
          st.fadingTranspose = undefined
          st.fadingScale = undefined
        }
      }

      const historyRaw = history.raw
      const eventData = new Map<number, { startSample: number; endSample: number; velocity: number }>()
      const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number
      const historyWritePos = Math.floor(history.writePos) & HISTORY_SIZE_MINUS_ONE
      const newestSlot = (historyWritePos - 1 + HISTORY_SIZE) & HISTORY_SIZE_MINUS_ONE

      for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
        const opIndex = Math.floor(historyRaw[idx])
        const voiceIndex = Math.floor(historyRaw[idx + 1])
        const velocity = historyRaw[idx + 3]
        const startSample = historyRaw[idx + 4] as number
        const endSample = historyRaw[idx + 5] as number

        if (startSample === 0 && endSample === 0) continue

        const toleranceSamples = sampleRate * 0.001
        if (startSample > currentSampleCount + toleranceSamples) continue
        const slot = ((idx - HISTORY_DATA_OFFSET) / HISTORY_ENTRY_SIZE) | 0

        if (voiceIndex < 0) {
          const op = -voiceIndex

          if (op === OP_OCTAVE) {
            st.octaveHistory = updateControlHistory(newestSlot, st.octaveHistory, opIndex, startSample, slot,
              isSlotNewer)
          }
          else if (op === OP_TRANSPOSE) {
            st.transposeHistory = updateControlHistory(newestSlot, st.transposeHistory, opIndex, startSample, slot,
              isSlotNewer)
          }
          else if (op === OP_SCALE) {
            st.scaleHistory = updateControlHistory(newestSlot, st.scaleHistory, opIndex, startSample, slot, isSlotNewer)
          }
        }
        else if (opIndex >= 0 && opIndex < currentBytecodeLength) {
          const pc = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + opIndex
          const op = array.raw[pc] as number

          if (op === OP_EVENT) {
            const existing = eventData.get(opIndex)
            if (!existing || startSample > existing.startSample) {
              eventData.set(opIndex, { startSample, endSample, velocity })
            }
          }
        }
      }

      const currentOctave = st.octaveHistory?.opIndex ?? null
      const currentTranspose = st.transposeHistory?.opIndex ?? null
      const currentScale = st.scaleHistory?.opIndex ?? null

      st.fadingOctave = updateFadingControl(st.fadingOctave, currentOctave, prevOctaveOp, st.octaveHistory,
        currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingTranspose = updateFadingControl(st.fadingTranspose, currentTranspose, prevTransposeOp,
        st.transposeHistory, currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingScale = updateFadingControl(st.fadingScale, currentScale, prevScaleOp, st.scaleHistory,
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

      st.fadingOctave = applyFadeToControls(st.fadingOctave, controls, currentSampleCount, sampleRate, FADEOUT_SECONDS)
      st.fadingTranspose = applyFadeToControls(st.fadingTranspose, controls, currentSampleCount, sampleRate,
        FADEOUT_SECONDS)
      st.fadingScale = applyFadeToControls(st.fadingScale, controls, currentSampleCount, sampleRate, FADEOUT_SECONDS)

      controlStateRef.current.set(seqIndex, st)
      nextFrame[seqIndex] = { events, controls }
    }

    frameRef.current = nextFrame
  }, [showWidgets, program1, audioContext, globalSampleCount, miniSourceMaps, miniRefs, dspSource, controlStateRef,
    frameRef])

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
