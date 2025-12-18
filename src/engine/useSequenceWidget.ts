import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo } from 'react'
import {
  ARRAY_HEADER_SIZE,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_SIZE,
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

export type SeqFrame = {
  events: Map<number, number>
  controls: Map<number, number>
}

type ControlHistory = {
  opIndex: number
  startSample: number
  slot: number
}

export type SeqControlState = {
  octaveHistory: ControlHistory | null
  transposeHistory: ControlHistory | null
  scaleHistory: ControlHistory | null
  fadingOctave?: { opIndex: number; fromSample: number; fromWallTime: number }
  fadingTranspose?: { opIndex: number; fromSample: number; fromWallTime: number }
  fadingScale?: { opIndex: number; fromSample: number; fromWallTime: number }
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
    const currentSampleCount = Atomics.load(globalSampleCount, 0) >>> 0
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
      const historyWritePos = Math.floor(history.writePos) % HISTORY_SIZE
      const newestSlot = (historyWritePos - 1 + HISTORY_SIZE) % HISTORY_SIZE

      const isSlotNewer = (slotA: number, slotB: number): boolean => {
        const distA = (newestSlot - slotA + HISTORY_SIZE) % HISTORY_SIZE
        const distB = (newestSlot - slotB + HISTORY_SIZE) % HISTORY_SIZE
        return distA < distB
      }

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
            const h = st.octaveHistory
            if (!h) {
              st.octaveHistory = { opIndex, startSample, slot }
            }
            else {
              const dt = startSample - h.startSample
              if (dt > 0.5 || (Math.abs(dt) <= 0.5 && opIndex !== h.opIndex && isSlotNewer(slot, h.slot))) {
                st.octaveHistory = { opIndex, startSample, slot }
              }
            }
          }
          else if (op === OP_TRANSPOSE) {
            const h = st.transposeHistory
            if (!h) {
              st.transposeHistory = { opIndex, startSample, slot }
            }
            else {
              const dt = startSample - h.startSample
              if (dt > 0.5 || (Math.abs(dt) <= 0.5 && opIndex !== h.opIndex && isSlotNewer(slot, h.slot))) {
                st.transposeHistory = { opIndex, startSample, slot }
              }
            }
          }
          else if (op === OP_SCALE) {
            const h = st.scaleHistory
            if (!h) {
              st.scaleHistory = { opIndex, startSample, slot }
            }
            else {
              const dt = startSample - h.startSample
              if (dt > 0.5 || (Math.abs(dt) <= 0.5 && opIndex !== h.opIndex && isSlotNewer(slot, h.slot))) {
                st.scaleHistory = { opIndex, startSample, slot }
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

      const currentOctave = st.octaveHistory?.opIndex ?? null
      const currentTranspose = st.transposeHistory?.opIndex ?? null
      const currentScale = st.scaleHistory?.opIndex ?? null

      if (currentOctave !== null && prevOctaveOp !== currentOctave && prevOctaveOp !== null) {
        st.fadingOctave = {
          opIndex: prevOctaveOp,
          fromSample: st.octaveHistory ? st.octaveHistory.startSample : currentSampleCount,
          fromWallTime: performance.now() / 1000,
        }
      }
      if (currentTranspose !== null && prevTransposeOp !== currentTranspose && prevTransposeOp !== null) {
        st.fadingTranspose = {
          opIndex: prevTransposeOp,
          fromSample: st.transposeHistory ? st.transposeHistory.startSample : currentSampleCount,
          fromWallTime: performance.now() / 1000,
        }
      }
      if (currentScale !== null && prevScaleOp !== currentScale && prevScaleOp !== null) {
        st.fadingScale = {
          opIndex: prevScaleOp,
          fromSample: st.scaleHistory ? st.scaleHistory.startSample : currentSampleCount,
          fromWallTime: performance.now() / 1000,
        }
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
        const nowSec = performance.now() / 1000
        let age = (currentSampleCount - st.fadingOctave.fromSample) / sampleRate
        if (age < 0) age = 0
        if (age === 0) {
          const wallAge = nowSec - (st.fadingOctave.fromWallTime ?? nowSec)
          if (wallAge > 0) age = wallAge
        }
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
        const nowSec = performance.now() / 1000
        let age = (currentSampleCount - st.fadingTranspose.fromSample) / sampleRate
        if (age < 0) age = 0
        if (age === 0) {
          const wallAge = nowSec - (st.fadingTranspose.fromWallTime ?? nowSec)
          if (wallAge > 0) age = wallAge
        }
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
        const nowSec = performance.now() / 1000
        let age = (currentSampleCount - st.fadingScale.fromSample) / sampleRate
        if (age < 0) age = 0
        if (age === 0) {
          const wallAge = nowSec - (st.fadingScale.fromWallTime ?? nowSec)
          if (wallAge > 0) age = wallAge
        }
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
