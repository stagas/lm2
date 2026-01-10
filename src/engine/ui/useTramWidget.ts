import type { EditorWidget } from 'mini-code'
import { useMemo, useRef } from 'preact/hooks'
import { compileTramSequence } from '../../tram/compiler.ts'
import type { TramSequenceRef } from '../bytecode/bytecode.ts'
import { TRIG_FADEOUT_SECONDS } from '../constants.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { buildLineStarts, spanToWidgetSpans } from './editor-spans.ts'

type TramHitState = {
  hitIndex: number
  startSample: number
  endSample: number
  a: number
}

type UseTramParams = {
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  tramRefs: TramSequenceRef[]
  dspSource: string
  showWidgets: boolean
  isPlaying: boolean
  resetKey?: string | number | null
}

function getHitsByBeat(sequence: string): number[][] {
  const out: number[][] = []
  let i = 0
  while (i < sequence.length) {
    const ch = sequence[i]!
    if (ch === '[') {
      let depth = 1
      let j = i + 1
      while (j < sequence.length && depth > 0) {
        const cc = sequence[j]!
        if (cc === '[') depth++
        else if (cc === ']') depth--
        j++
      }
      if (depth > 0) {
        out.push([])
        i++
        continue
      }
      const end = j

      const hits: number[] = []
      for (let k = i + 1; k < end - 1; k++) {
        const hc = sequence[k]!
        if (hc === 'x' || hc === 'X') hits.push(k)
      }
      out.push(hits)
      i = end
      continue
    }
    if (/\s/.test(ch)) {
      i++
      continue
    }
    if (ch === 'x' || ch === 'X') out.push([i])
    else out.push([])
    i++
  }
  return out
}

export function useTramWidget({
  audioContext,
  bpmValue,
  globalSampleCount,
  tramRefs,
  dspSource,
  showWidgets,
  isPlaying,
  resetKey,
}: UseTramParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const hitsByBeatCacheRef = useRef<Map<string, number[][]>>(new Map())
  const statesByRefKeyRef = useRef<Map<number, TramHitState[]>>(new Map())
  const lastSampleByRefKeyRef = useRef<Map<number, number>>(new Map())
  const lastResetKeyRef = useRef<string | number | null | undefined>(undefined)
  if (lastResetKeyRef.current !== resetKey) {
    lastResetKeyRef.current = resetKey
    statesByRefKeyRef.current.clear()
    lastSampleByRefKeyRef.current.clear()
  }

  const onBeforeDraw = () => {
    if (!showWidgets) return
    if (tramRefs.length === 0) return
    const playbackState = useEngineRuntimeStore.getState().playbackState
    if (playbackState === 'paused') return

    const runtime = useEngineRuntimeStore.getState()
    const pred = runtime.predictedSampleCountResult
    const sampleRate = audioContext?.sampleRate || pred?.sampleRate || 0
    if (!sampleRate) return

    const rawSampleCount = globalSampleCount
      ? ((Atomics.load(globalSampleCount, 0) >>> 0) as number)
      : undefined
    const sampleCount = (isPlaying && pred)
      ? pred.sampleCount
      : (rawSampleCount ?? pred?.sampleCount)
    if (sampleCount == null) return

    const bpm = bpmValue?.[0] || 60
    const safeBpm = Math.max(1, bpm)
    const samplesPerWhole = (60 / safeBpm) * sampleRate * 4

    for (const ref of tramRefs) {
      // Exclude prelude tram refs (have kernel flag or are outside source bounds)
      if (ref.loc.kernel || ref.start >= dspSource.length || ref.start <= 1) continue

      const key = ref.start
      const prevSample = lastSampleByRefKeyRef.current.get(key)
      if (prevSample != null && sampleCount < prevSample) {
        lastSampleByRefKeyRef.current.delete(key)
        statesByRefKeyRef.current.delete(key)
      }
      lastSampleByRefKeyRef.current.set(key, sampleCount)

      const seq = ref.sequence ?? ''
      if (!seq) continue

      let hitsByBeat = hitsByBeatCacheRef.current.get(seq)
      if (!hitsByBeat) {
        hitsByBeat = getHitsByBeat(seq)
        hitsByBeatCacheRef.current.set(seq, hitsByBeat)
      }

      let compiled: ReturnType<typeof compileTramSequence> | null = null
      try {
        compiled = compileTramSequence(seq)
      }
      catch {
        continue
      }
      const totalBeats = compiled.totalBeats | 0
      if (totalBeats <= 0) continue

      const bar = Math.max(0.000001, ref.bar ?? 1)
      const intervalSamples = bar * samplesPerWhole
      const samplesPerBeat = intervalSamples / totalBeats
      if (!Number.isFinite(samplesPerBeat) || samplesPerBeat <= 0) continue

      const beatPosition = sampleCount / samplesPerBeat
      const beatFloor = Math.floor(beatPosition)
      let beatIndex = beatFloor % totalBeats
      if (beatIndex < 0) beatIndex += totalBeats
      const beatStartSample = beatFloor * samplesPerBeat

      const beat = compiled.beats[beatIndex]
      const subdivCount = beat?.subdivisions.length ?? 0
      if (subdivCount <= 0) continue

      const sampleInBeat = sampleCount - beatStartSample
      const samplesPerSubdiv = samplesPerBeat / subdivCount
      if (!Number.isFinite(samplesPerSubdiv) || samplesPerSubdiv <= 0) continue

      const subdivIndex = Math.floor(sampleInBeat / samplesPerSubdiv) % subdivCount
      const subdivStartSample = beatStartSample + subdivIndex * samplesPerSubdiv
      const subdivEndSample = subdivStartSample + samplesPerSubdiv

      const hit = beat.subdivisions[subdivIndex] ?? false
      const hitIndex = hitsByBeat[beatIndex]?.[subdivIndex]

      let states = statesByRefKeyRef.current.get(key) ?? []

      // Check if we need to add a new active hit
      if (hit && hitIndex != null) {
        const existingState = states.find(s => s.hitIndex === hitIndex && s.startSample === subdivStartSample)
        if (!existingState) {
          states.push({
            hitIndex,
            startSample: subdivStartSample,
            endSample: subdivEndSample,
            a: 1,
          })
        }
      }

      // Update all states (active and fading)
      const updatedStates: TramHitState[] = []
      for (const state of states) {
        if (sampleCount <= state.endSample) {
          // Still within the subdivision, full opacity
          state.a = 1
          updatedStates.push(state)
        }
        else {
          // Past the end, apply fade
          const ageSec = (sampleCount - state.endSample) / sampleRate
          if (ageSec <= TRIG_FADEOUT_SECONDS) {
            const a = Math.max(0, Math.min(1, 1 - ageSec / TRIG_FADEOUT_SECONDS))
            if (a > 0) {
              state.a = a
              updatedStates.push(state)
            }
          }
          // If ageSec > fadeSec or a <= 0, remove the state
        }
      }

      if (updatedStates.length > 0) {
        statesByRefKeyRef.current.set(key, updatedStates)
      }
      else {
        statesByRefKeyRef.current.delete(key)
      }
    }
  }

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    if (tramRefs.length === 0) return []

    const lineStarts = buildLineStarts(dspSource)
    const out: EditorWidget[] = []

    for (const ref of tramRefs) {
      // Exclude prelude tram refs (have kernel flag or are outside source bounds)
      if (ref.loc.kernel || ref.start >= dspSource.length || ref.start <= 1) continue

      const key = ref.start
      const seq = ref.sequence ?? ''
      if (!seq) continue

      for (let i = 0; i < seq.length; i++) {
        const ch = seq[i]!
        if (ch !== 'x' && ch !== 'X') continue
        const absStart = ref.start + i
        const absEnd = absStart + 1
        // Skip if position is outside source bounds
        if (absStart >= dspSource.length) continue
        for (const span of spanToWidgetSpans(lineStarts, absStart, absEnd)) {
          out.push({
            type: 'overlay',
            line: span.line,
            column: span.column,
            length: span.length,
            render: (ctx, x, y, w, h) => {
              const states = statesByRefKeyRef.current.get(key)
              if (!states) return
              const state = states.find(s => s.hitIndex === i)
              if (!state) return
              const a = state.a ?? 0
              if (a <= 0) return
              ctx.fillStyle = `rgba(255, 255, 255, ${0.25 * (a ** 0.25)})`
              ctx.fillRect(x - 2, y - 2, w + 4, h - 1)
            },
          })
        }
      }
    }

    return out
  }, [showWidgets, dspSource, tramRefs])

  return { widgets, onBeforeDraw }
}
