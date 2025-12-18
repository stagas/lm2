import { CodeEditor, type EditorHeader, type EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FUTURE_SECONDS, PAST_SECONDS, TIME_WINDOW_SECONDS } from '../../as/assembly/constants.ts'
import type { LangError } from '../lang/errors.ts'
import { analyze } from '../lang/pipeline.ts'
import { ControlOp } from '../worklet-shared.ts'
import { PIANOROLL_KEY_WIDTH, SCROLL_SMOOTHING } from './constants.ts'
import { useEngine } from './program.ts'
import { useEngineStore } from './store.ts'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'

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
    program1,
    audioContext,
    bpmValue,
    globalSampleCount,
    control,
    seekSampleCount,
    ringPos,
    miniRefs,
    miniSourceMaps,
    analyserRefs,
    arrayLiterals,
  } = useEngineStore()
  const { playbackState } = useEngineStore()
  const [localSource, setLocalSource] = useState(dspSource)
  const [error, setError] = useState<string>()
  const { isUpdatingDsp } = useEngineStore()
  const theme = useTheme()

  // Keep widgets visible while the store is still processing updates or when
  // the editor has compilation errors so the user can see widgets while fixing.
  const localAnalysis = useMemo(() => {
    try {
      return analyze(localSource)
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
      } as any
    }
  }, [localSource])

  const hasLocalErrors = (localAnalysis?.errors?.length ?? 0) > 0

  const showWidgets = localSource === dspSource
    || isUpdatingDsp
    || hasLocalErrors

  const handleApply = async () => {
    if (!isProgramReady) return
    const requested = localSource
    try {
      setError(undefined)
      await updateDspSource(requested)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useEffect(() => {
    handleApply()
  }, [localSource, isProgramReady])

  const frameRef = useRef<Array<SeqFrame | undefined>>([])
  const controlStateRef = useRef<Map<number, SeqControlState>>(new Map())

  const { widgets: sequenceWidgets, onBeforeDraw } = useSequenceWidget({
    program1,
    audioContext,
    globalSampleCount,
    miniSourceMaps,
    miniRefs,
    dspSource,
    showWidgets,
    frameRef,
    controlStateRef,
    bpmValue,
  })

  const { widgets: pianorollWidgets, onBeforeDraw: onBeforeDrawPianoroll } = usePianorollWidget({
    program1,
    audioContext,
    bpmValue,
    globalSampleCount,
    miniSourceMaps,
    miniRefs,
    dspSource,
    showWidgets,
  })

  const { widgets: analyserWidgets, onBeforeDraw: onBeforeDrawAnalyser } = useAnalyserWidget({
    program1,
    ringPos,
    analyserRefs,
    dspSource,
    showWidgets,
    playbackState,
    sampleRate: audioContext?.sampleRate,
  })

  const { widgets: arrayAccessWidgets, onBeforeDraw: onBeforeDrawArrayAccess } = useArrayAccessWidget({
    program1,
    dspSource,
    showWidgets,
    arrayLiterals,
  })

  const onBeforeDrawCombined = useCallback(() => {
    onBeforeDraw()
    onBeforeDrawPianoroll()
    onBeforeDrawAnalyser()
    onBeforeDrawArrayAccess()
  }, [onBeforeDraw, onBeforeDrawPianoroll, onBeforeDrawAnalyser, onBeforeDrawArrayAccess])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    return [...analyserWidgets, ...pianorollWidgets, ...sequenceWidgets, ...arrayAccessWidgets]
  }, [showWidgets, analyserWidgets, pianorollWidgets, sequenceWidgets, arrayAccessWidgets])

  const timelineTimeRef = useRef<number | null>(null)
  const timelineLayoutRef = useRef({ viewX: 0, viewWidth: 0 })
  const timelineWindowRef = useRef({
    windowStartTime: 0,
    windowEndTime: 0,
    timeSeconds: 0,
  })
  const isTimelineDraggingRef = useRef(false)

  const timelineHeader = useMemo((): EditorHeader => {
    const handleSeek = (pointerX: number) => {
      if (
        !audioContext
        || !control
        || !seekSampleCount
        || !globalSampleCount
      ) {
        return
      }

      const layout = timelineLayoutRef.current
      const timelineWidth = Math.max(1, layout.viewWidth - PIANOROLL_KEY_WIDTH)
      const timelineStartX = layout.viewX + PIANOROLL_KEY_WIDTH
      const relativeX = pointerX - timelineStartX
      const clampedX = Math.max(0, Math.min(timelineWidth, relativeX))

      const windowStartTime = timelineWindowRef.current.windowStartTime
      const secondsPerPixel = TIME_WINDOW_SECONDS / timelineWidth
      const targetTimeSeconds = windowStartTime + clampedX * secondsPerPixel
      const targetSampleCount = Math.max(0, Math.floor(targetTimeSeconds * audioContext.sampleRate))
      const currentSample = Atomics.load(globalSampleCount, 0)
      if (currentSample === targetSampleCount) return

      Atomics.store(seekSampleCount, 0, targetSampleCount)
      Atomics.store(control, 0, ControlOp.Seek)
    }

    return {
      height: 30,
      pointerDown: (x) => {
        isTimelineDraggingRef.current = true
        handleSeek(x)
      },
      pointerMove: (x) => {
        if (!isTimelineDraggingRef.current) return
        handleSeek(x)
      },
      pointerUp: () => {
        isTimelineDraggingRef.current = false
      },
      render: (c, x, y, w, h, vx, vw) => {
        c.fillStyle = '#000'
        c.fillRect(x, y, w, h)
        timelineLayoutRef.current = { viewX: vx, viewWidth: vw }

        if (!audioContext || !bpmValue || !globalSampleCount) return

        const viewX = vx + PIANOROLL_KEY_WIDTH
        const viewW = vw
        const timelineW = Math.max(1, viewW - PIANOROLL_KEY_WIDTH)

        const sampleRate = audioContext.sampleRate
        const sampleCount = Math.max(0, Atomics.load(globalSampleCount, 0))
        const nowSeconds = sampleCount / sampleRate
        let smoothed = timelineTimeRef.current
        if (smoothed == null) smoothed = nowSeconds
        else smoothed += (nowSeconds - smoothed) * SCROLL_SMOOTHING
        timelineTimeRef.current = smoothed
        const timeSeconds = smoothed

        const bpm = bpmValue[0] || 60
        const barLengthSeconds = (4 * 60) / bpm
        const windowStartTime = timeSeconds - PAST_SECONDS
        const windowEndTime = timeSeconds + FUTURE_SECONDS
        timelineWindowRef.current = { windowStartTime, windowEndTime, timeSeconds }

        const pixelsPerSecond = timelineW / TIME_WINDOW_SECONDS
        const playheadX = viewX + PAST_SECONDS * pixelsPerSecond

        c.save()
        c.beginPath()

        c.fillStyle = 'rgba(0, 0, 0, 0.25)'
        c.fillRect(viewX, y, viewW, h)

        const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
        for (let barStart = firstBarStart; barStart < windowEndTime + barLengthSeconds; barStart += barLengthSeconds) {
          if (barStart < 0) continue
          const barIndex = Math.floor(barStart / barLengthSeconds)
          const barNumber = barIndex + 1
          const isPhraseStart = ((barNumber - 1) & 3) === 0

          const barX = viewX + (barStart - windowStartTime) * pixelsPerSecond

          c.strokeStyle = isPhraseStart ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.25)'
          c.lineWidth = isPhraseStart ? 1.5 : 1
          c.beginPath()
          c.moveTo(barX, y)
          c.lineTo(barX, y + h)
          c.stroke()

          c.fillStyle = isPhraseStart ? 'rgba(255, 255, 255, 0.95)' : 'rgba(255, 255, 255, 0.75)'
          c.font = '9pt Inter'
          c.textAlign = 'left'
          c.textBaseline = 'top'
          c.fillText(String(barNumber), barX + 4, y + 4)

          // Show time below the phrase number (formatted MM:SS) calculated from bar start seconds
          const t = Math.max(0, barStart)
          const mins = Math.floor(t / 60)
          const secs = Math.floor(t % 60)
          const timeLabel = mins + ':' + String(secs).padStart(2, '0')
          c.font = '7pt Inter'
          c.textBaseline = 'top'
          c.fillStyle = 'rgba(200,200,200,0.6)'
          c.fillText(timeLabel, barX + 4, y + 17)
        }

        c.strokeStyle = 'rgba(255, 220, 0, 0.9)'
        c.lineWidth = 2
        c.beginPath()
        c.moveTo(playheadX, y)
        c.lineTo(playheadX, y + h)
        c.stroke()

        c.restore()
      },
    }
  }, [audioContext, bpmValue, globalSampleCount, control, seekSampleCount])

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
      <div className="bg-gray-900 text-white p-4 rounded-md border border-gray-600 font-mono text-sm w-full h-[550px]">
        <CodeEditor
          value={localSource}
          setValue={(value) => {
            setLocalSource(value)
          }}
          widgets={widgets}
          header={timelineHeader}
          theme={theme}
          tokenizer={tokenizer}
          isAnimating={true}
          gutter={true}
          onBeforeDraw={onBeforeDrawCombined}
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
