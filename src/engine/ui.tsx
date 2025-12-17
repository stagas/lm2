import { CodeEditor, type EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import type { LangError } from '../lang/errors.ts'
import { analyze } from '../lang/pipeline.ts'
import type { SourceLocation } from '../lib/mini-source-map.ts'
import { splitValueAndModifiers } from '../mini/tokenizer.ts'
import { useEngine } from './program.ts'
import { useEngineStore } from './store.ts'

type SequenceInputProps = {
  index: number
  value: string
  onChange: (value: string) => void
}

export function SequenceInput({ index, value, onChange }: SequenceInputProps) {
  return (
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="bg-gray-800 text-white p-2 rounded-md border border-gray-600 w-full max-w-md"
      placeholder={`Sequence ${index + 1}`}
    />
  )
}

export function DspSourceEditor() {
  const {
    dspSource,
    updateDspSource,
    isProgramReady,
    playbackState,
    program1,
    audioContext,
    globalSampleCount,
    miniRefs,
    miniSourceMaps,
  } = useEngineStore()
  const [localSource, setLocalSource] = useState(dspSource)
  const [error, setError] = useState<string>()

  const showWidgets = localSource === dspSource

  const handleApply = async () => {
    if (!isProgramReady) return
    try {
      setError(undefined)
      await updateDspSource(localSource)
      console.log('updated dsp source')
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    handleApply()
  }, [localSource, isProgramReady])

  type ControlKind = 'octave' | 'transpose' | 'scale'

  function getControlKind(text: string): ControlKind | null {
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

  type SeqFrame = {
    events: Map<number, number>
    controls: Map<number, number>
  }

  type SeqControlState = {
    activeOctaveOpIndex: number | null
    activeTransposeOpIndex: number | null
    activeScaleOpIndex: number | null
    fadingOctave?: { opIndex: number; fromSample: number }
    fadingTranspose?: { opIndex: number; fromSample: number }
    fadingScale?: { opIndex: number; fromSample: number }
    lastSampleCount: number | null
  }

  const frameRef = useRef<Array<SeqFrame | undefined>>([])
  const controlStateRef = useRef<Map<number, SeqControlState>>(new Map())

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.data || !audioContext || !globalSampleCount) return

    const sampleRate = audioContext.sampleRate
    const currentSampleCount = Math.max(0, Atomics.load(globalSampleCount, 0))
    const FADEOUT_SECONDS = 0.3

    const nextFrame: Array<SeqFrame | undefined> = new Array(miniSourceMaps.length)

    for (let seqIndex = 0; seqIndex < miniSourceMaps.length; seqIndex++) {
      const map = miniSourceMaps[seqIndex]
      if (!map) continue

      const array = program1.program.data.arrays[seqIndex]
      const history = program1.program.histories[seqIndex]
      if (!array || !history) continue

      const st = controlStateRef.current.get(seqIndex) ?? {
        activeOctaveOpIndex: null,
        activeTransposeOpIndex: null,
        activeScaleOpIndex: null,
        lastSampleCount: null,
      }

      const didSeek = st.lastSampleCount != null && currentSampleCount < st.lastSampleCount
      st.lastSampleCount = currentSampleCount
      if (didSeek) {
        st.activeOctaveOpIndex = null
        st.activeTransposeOpIndex = null
        st.activeScaleOpIndex = null
        st.fadingOctave = undefined
        st.fadingTranspose = undefined
        st.fadingScale = undefined
      }

      const historyRaw = history.raw
      const eventData = new Map<number, { startSample: number; endSample: number; velocity: number }>()
      let nextOctaveOpIndex: number | null = null
      let nextOctaveStartSample = -1
      let nextTransposeOpIndex: number | null = null
      let nextTransposeStartSample = -1
      let nextScaleOpIndex: number | null = null
      let nextScaleStartSample = -1

      const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number

      for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
        const opIndex = Math.floor(historyRaw[idx])
        const velocity = historyRaw[idx + 3]
        const startSample = Math.floor(historyRaw[idx + 4])
        const endSample = Math.floor(historyRaw[idx + 5])

        if (startSample === 0 && endSample === 0) continue

        const toleranceSamples = sampleRate * 0.001
        if (startSample > currentSampleCount + toleranceSamples) continue

        if (opIndex >= 0 && opIndex < currentBytecodeLength) {
          const pc = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + opIndex
          const op = array.raw[pc] as number

          if (op === OP_EVENT) {
            const existing = eventData.get(opIndex)
            if (!existing || startSample > existing.startSample) {
              eventData.set(opIndex, { startSample, endSample, velocity })
            }
          }
          else if (op === OP_OCTAVE) {
            if (startSample <= currentSampleCount && startSample > nextOctaveStartSample) {
              nextOctaveOpIndex = opIndex
              nextOctaveStartSample = startSample
            }
          }
          else if (op === OP_TRANSPOSE) {
            if (startSample <= currentSampleCount && startSample > nextTransposeStartSample) {
              nextTransposeOpIndex = opIndex
              nextTransposeStartSample = startSample
            }
          }
          else if (op === OP_SCALE) {
            if (startSample <= currentSampleCount && startSample > nextScaleStartSample) {
              nextScaleOpIndex = opIndex
              nextScaleStartSample = startSample
            }
          }
        }
      }

      const prevOctave = st.activeOctaveOpIndex
      const prevTranspose = st.activeTransposeOpIndex
      const prevScale = st.activeScaleOpIndex
      st.activeOctaveOpIndex = nextOctaveOpIndex
      st.activeTransposeOpIndex = nextTransposeOpIndex
      st.activeScaleOpIndex = nextScaleOpIndex

      if (prevOctave !== st.activeOctaveOpIndex && prevOctave != null) {
        st.fadingOctave = { opIndex: prevOctave,
          fromSample: nextOctaveStartSample >= 0 ? nextOctaveStartSample : currentSampleCount }
      }
      if (prevTranspose !== st.activeTransposeOpIndex && prevTranspose != null) {
        st.fadingTranspose = {
          opIndex: prevTranspose,
          fromSample: nextTransposeStartSample >= 0 ? nextTransposeStartSample : currentSampleCount,
        }
      }
      if (prevScale !== st.activeScaleOpIndex && prevScale != null) {
        st.fadingScale = { opIndex: prevScale,
          fromSample: nextScaleStartSample >= 0 ? nextScaleStartSample : currentSampleCount }
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
      if (st.activeOctaveOpIndex != null) controls.set(st.activeOctaveOpIndex, 1)
      if (st.activeTransposeOpIndex != null) controls.set(st.activeTransposeOpIndex, 1)
      if (st.activeScaleOpIndex != null) controls.set(st.activeScaleOpIndex, 1)

      const fade = (f?: { opIndex: number; fromSample: number }) => {
        if (!f) return
        const age = (currentSampleCount - f.fromSample) / sampleRate
        if (age >= 0 && age <= FADEOUT_SECONDS) {
          controls.set(f.opIndex, Math.max(controls.get(f.opIndex) ?? 0, 1 - age / FADEOUT_SECONDS))
        }
      }
      fade(st.fadingOctave)
      fade(st.fadingTranspose)
      fade(st.fadingScale)

      controlStateRef.current.set(seqIndex, st)
      nextFrame[seqIndex] = { events, controls }
    }

    frameRef.current = nextFrame
  }, [showWidgets, program1, audioContext, globalSampleCount, miniSourceMaps])

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
  }, [showWidgets, dspSource, miniRefs, miniSourceMaps])

  return (
    <div className="flex flex-col gap-2 w-full">
      <div className="flex items-center justify-between">
        <label className="text-white font-bold">DSP Source Code:</label>
        <button
          onClick={handleApply}
          className="bg-green-500 text-white px-4 py-2 rounded-md hover:bg-green-600"
        >
          Apply Changes
        </button>
      </div>
      <div className="bg-gray-900 text-white p-4 rounded-md border border-gray-600 font-mono text-sm w-full h-80">
        <CodeEditor
          value={localSource}
          setValue={(value) => setLocalSource(value)}
          widgets={widgets}
          isAnimating={showWidgets && playbackState === 'running'}
          onBeforeDraw={onBeforeDraw}
        />
      </div>
      {error && (
        <div className="bg-red-900 text-red-200 p-2 rounded-md text-sm">
          {error}
        </div>
      )}
      <BytecodeInspector source={localSource} />
    </div>
  )
}

type BytecodeInspectorProps = {
  source: string
}

function BytecodeInspector({ source }: BytecodeInspectorProps) {
  const analysis = useMemo(() => {
    try {
      const result = analyze(source)
      return {
        bytecodeText: result.bytecodeText,
        errors: result.errors,
        tokenCount: result.tokens.length,
      }
    }
    catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      const fallback: LangError = {
        message,
        line: 0,
        column: 0,
        length: 0,
        code: '',
      }
      return {
        bytecodeText: '',
        errors: [fallback],
        tokenCount: 0,
      }
    }
  }, [source])

  return (
    <div className="flex flex-col gap-2" onClick={e => {
      navigator.clipboard.writeText((e.target as HTMLElement).textContent || '')
    }}>
      <div className="flex items-center justify-between text-xs text-gray-200">
        <span className="font-semibold">Bytecode (analysis)</span>
        <span className="text-gray-400">{analysis.tokenCount} tokens</span>
      </div>
      {analysis.errors.length > 0 && (
        <div className="bg-red-900 text-red-200 p-2 rounded-md text-xs">
          {analysis.errors.map((err, idx) => (
            <div key={idx}>
              {err.message} <span className="opacity-70">({err.line}:{err.column})</span>
            </div>
          ))}
        </div>
      )}
      <div className="bg-gray-900 text-white p-3 rounded-md border border-gray-600 font-mono text-xs w-full h-[35dvh] overflow-auto">
        <pre className="whitespace-pre-wrap">{analysis.bytecodeText || 'No bytecode available yet.'}</pre>
      </div>
    </div>
  )
}

export function PlaybackControls() {
  const { playbackState, start, pause, stop } = useEngineStore()

  return (
    <div className="flex gap-2">
      <button
        onClick={start}
        disabled={playbackState === 'running'}
        className="bg-blue-500 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Start
      </button>
      <button
        onClick={pause}
        disabled={playbackState !== 'running'}
        className="bg-yellow-500 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Pause
      </button>
      <button
        onClick={stop}
        disabled={playbackState === 'stopped'}
        className="bg-red-500 text-white px-4 py-2 rounded-md disabled:opacity-50 disabled:cursor-not-allowed"
      >
        Stop
      </button>
      <div className="flex items-center px-4 text-white">
        State: <span className="ml-2 font-bold">{playbackState}</span>
      </div>
    </div>
  )
}

export function EngineUI() {
  const { isInitialized } = useEngine()

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-white">Initializing engine...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 p-4 max-w-4xl mx-auto">
      <PlaybackControls />
      <DspSourceEditor />
    </div>
  )
}
