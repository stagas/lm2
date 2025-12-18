import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo } from 'react'
import {
  ARRAY_HEADER_SIZE,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_OCTAVE,
  OP_SCALE,
  OP_TRANSPOSE,
} from '../../as/assembly/constants.ts'
import type { SourceLocation } from '../lib/mini-source-map.ts'
import { splitValueAndModifiers } from '../mini/tokenizer.ts'
import type { ProgramInstance } from './program.ts'

export type SeqFrame = {
  events: Map<number, number>
  controls: Map<number, number>
}

type ControlHistory = {
  opIndex: number
  startSample: number
}

export type SeqControlState = {
  octaveHistory: ControlHistory | null
  transposeHistory: ControlHistory | null
  scaleHistory: ControlHistory | null
  fadingOctave?: { opIndex: number; fromSample: number }
  fadingTranspose?: { opIndex: number; fromSample: number }
  fadingScale?: { opIndex: number; fromSample: number }
  lastSampleCount: number | null
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

function getControlKind(text: string): 'octave' | 'transpose' | 'scale' | null {
  if (/\boctave\b/.test(text)) return 'octave'
  if (/\btranspose\b/.test(text)) return 'transpose'
  if (/\bscale\b/.test(text)) return 'scale'
  return null
}

function getControlDeltaSpan(location: SourceLocation): { start: number; end: number } | null {
  const text = location.text
  const match = text.match(/\b(octave|transpose|scale)\b/)
  const index = match?.index
  if (index == null || match == null) return null

  let i = index + match[0].length
  while (i < text.length && /\s/.test(text[i]!)) i++
  if (i >= text.length) return null

  const start = i
  let j = i
  const kind = match[1]
  if (kind === 'octave' || kind === 'transpose') {
    if (text[j] === '+' || text[j] === '-') {
      j++
      while (j < text.length && /\s/.test(text[j]!)) j++
    }
    const digitsStart = j
    while (j < text.length && /[0-9]/.test(text[j]!)) j++
    if (j === digitsStart) return null
  }
  else if (kind === 'scale') {
    const noteMatch = text.slice(j).match(/^[a-gA-G](?:#|b)?[0-9]+/)
    if (noteMatch) {
      j += noteMatch[0].length
      while (j < text.length && /\s/.test(text[j]!)) j++
    }
    const nameMatch = text.slice(j).match(/^[a-zA-Z]+/)
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

function buildLineStarts(src: string): number[] {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function indexToLineColumn(lineStarts: number[], index: number): { line: number; column: number } {
  let lo = 0
  let hi = lineStarts.length - 1
  while (lo <= hi) {
    const mid = (lo + hi) >> 1
    const start = lineStarts[mid]!
    const next = mid + 1 < lineStarts.length ? lineStarts[mid + 1]! : Number.POSITIVE_INFINITY
    if (index < start) hi = mid - 1
    else if (index >= next) lo = mid + 1
    else return { line: mid + 1, column: index - start + 1 }
  }
  return { line: 1, column: 1 }
}

type WidgetSpan = {
  line: number
  column: number
  length: number
}

function spanToWidgetSpans(
  lineStarts: number[],
  start: number,
  end: number,
): WidgetSpan[] {
  if (end <= start) return []
  const a = indexToLineColumn(lineStarts, start)
  const b = indexToLineColumn(lineStarts, end)
  if (a.line === b.line) {
    return [{ line: a.line, column: a.column, length: Math.max(1, b.column - a.column) }]
  }
  const spans: WidgetSpan[] = []
  let s = start
  for (let line = a.line;; line++) {
    const lineStart = lineStarts[line - 1] ?? 0
    const lineEnd = line < lineStarts.length ? (lineStarts[line] ?? end) - 1 : end
    const segStart = Math.max(s, lineStart)
    const segEnd = Math.min(end, lineEnd)
    if (segEnd > segStart) {
      const p = indexToLineColumn(lineStarts, segStart)
      spans.push({ line: p.line, column: p.column, length: Math.max(1, segEnd - segStart) })
    }
    if (segEnd >= end) break
    s = lineEnd + 1
  }
  return spans
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
  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.data || !audioContext || !globalSampleCount) return

    const sampleRate = audioContext.sampleRate
    const currentSampleCount = Math.max(0, Atomics.load(globalSampleCount, 0))
    const FADEOUT_SECONDS = 0.3

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
      }

      const didSeek = st.lastSampleCount != null && currentSampleCount < st.lastSampleCount
      st.lastSampleCount = currentSampleCount
      if (didSeek) {
        st.octaveHistory = null
        st.transposeHistory = null
        st.scaleHistory = null
        st.fadingOctave = undefined
        st.fadingTranspose = undefined
        st.fadingScale = undefined
      }

      const historyRaw = history.raw
      const eventData = new Map<number, { startSample: number; endSample: number; velocity: number }>()
      const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number

      for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
        const opIndex = Math.floor(historyRaw[idx])
        const voiceIndex = Math.floor(historyRaw[idx + 1])
        const velocity = historyRaw[idx + 3]
        const startSample = Math.floor(historyRaw[idx + 4])
        const endSample = Math.floor(historyRaw[idx + 5])

        if (startSample === 0 && endSample === 0) continue

        const toleranceSamples = sampleRate * 0.001
        if (startSample > currentSampleCount + toleranceSamples) continue

        if (voiceIndex < 0) {
          const op = -voiceIndex
          if (op === OP_OCTAVE) {
            if (startSample <= currentSampleCount) {
              if (!st.octaveHistory || startSample > st.octaveHistory.startSample) {
                st.octaveHistory = { opIndex, startSample }
              }
            }
          }
          else if (op === OP_TRANSPOSE) {
            if (startSample <= currentSampleCount) {
              if (!st.transposeHistory || startSample > st.transposeHistory.startSample) {
                st.transposeHistory = { opIndex, startSample }
              }
            }
          }
          else if (op === OP_SCALE) {
            if (startSample <= currentSampleCount) {
              if (!st.scaleHistory || startSample > st.scaleHistory.startSample) {
                st.scaleHistory = { opIndex, startSample }
              }
            }
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

      const prevOctave = st.fadingOctave?.opIndex ?? null
      const prevTranspose = st.fadingTranspose?.opIndex ?? null
      const prevScale = st.fadingScale?.opIndex ?? null
      const currentOctave = st.octaveHistory?.opIndex ?? null
      const currentTranspose = st.transposeHistory?.opIndex ?? null
      const currentScale = st.scaleHistory?.opIndex ?? null

      if (currentOctave !== null && prevOctave !== currentOctave && prevOctave !== null) {
        st.fadingOctave = { opIndex: prevOctave, fromSample: st.octaveHistory!.startSample }
      }
      if (currentTranspose !== null && prevTranspose !== currentTranspose && prevTranspose !== null) {
        st.fadingTranspose = { opIndex: prevTranspose, fromSample: st.transposeHistory!.startSample }
      }
      if (currentScale !== null && prevScale !== currentScale && prevScale !== null) {
        st.fadingScale = { opIndex: prevScale, fromSample: st.scaleHistory!.startSample }
      }

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

      const controls = new Map<number, number>()
      if (st.octaveHistory) controls.set(st.octaveHistory.opIndex, 1)
      if (st.transposeHistory) controls.set(st.transposeHistory.opIndex, 1)
      if (st.scaleHistory) controls.set(st.scaleHistory.opIndex, 1)

      if (st.fadingOctave) {
        const age = (currentSampleCount - st.fadingOctave.fromSample) / sampleRate
        if (age >= 0 && age <= FADEOUT_SECONDS) {
          controls.set(
            st.fadingOctave.opIndex,
            Math.max(controls.get(st.fadingOctave.opIndex) ?? 0, 1 - age / FADEOUT_SECONDS),
          )
        }
        else {
          st.fadingOctave = undefined
        }
      }
      if (st.fadingTranspose) {
        const age = (currentSampleCount - st.fadingTranspose.fromSample) / sampleRate
        if (age >= 0 && age <= FADEOUT_SECONDS) {
          controls.set(
            st.fadingTranspose.opIndex,
            Math.max(controls.get(st.fadingTranspose.opIndex) ?? 0, 1 - age / FADEOUT_SECONDS),
          )
        }
        else {
          st.fadingTranspose = undefined
        }
      }
      if (st.fadingScale) {
        const age = (currentSampleCount - st.fadingScale.fromSample) / sampleRate
        if (age >= 0 && age <= FADEOUT_SECONDS) {
          controls.set(
            st.fadingScale.opIndex,
            Math.max(controls.get(st.fadingScale.opIndex) ?? 0, 1 - age / FADEOUT_SECONDS),
          )
        }
        else {
          st.fadingScale = undefined
        }
      }

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
              render: (ctx, x, y, w, h) => {
                const f = frameRef.current[ref.seqIndex]
                const a = f?.controls.get(opIndex) ?? 0
                if (a <= 0) return
                const [r, g, b] = kind === 'octave'
                  ? [0, 200, 255]
                  : kind === 'transpose'
                  ? [255, 200, 0]
                  : [200, 120, 255]
                ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.28 * a})`
                ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
                ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.9 * a})`
                ctx.lineWidth = 1
                ctx.strokeRect(x - 2, y - 2, w + 4, h - 1)
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
            render: (ctx, x, y, w, h) => {
              const f = frameRef.current[ref.seqIndex]
              const a = f?.events.get(opIndex) ?? 0
              if (a <= 0) return
              ctx.fillStyle = `rgba(0, 255, 0, ${0.3 * a})`
              ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
              ctx.strokeStyle = `rgba(0, 255, 0, ${a})`
              ctx.lineWidth = 1
              ctx.strokeRect(x - 2, y - 2, w + 4, h - 1)
            },
          })
        }
      }
    }

    return out
  }, [showWidgets, dspSource, miniRefs, miniSourceMaps, frameRef])

  return { widgets, onBeforeDraw }
}
