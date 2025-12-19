import { CodeEditor, type EditorHeader, type EditorWidget } from 'mini-code'
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { LangError } from '../lang/errors.ts'
import { analyze } from '../lang/pipeline.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { useEngine } from './program.ts'
import { useEngineStore } from './store.ts'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { useSeekToSample } from './useSeekToSample.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'
import { useTimelineHeader } from './useTimelineHeader.ts'
import { useTimelineSequenceWidget } from './useTimelineSequenceWidget.ts'
import { useTimelineWidget } from './useTimelineWidget.ts'

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

export type TimelineWindow = {
  windowStartTime: number
  windowEndTime: number
  timeSeconds: number
}

export function DspSourceEditor({ timelineHeader }: { timelineHeader: EditorHeader }) {
  const {
    dspSource,
    updateDspSource,
    isProgramReady,
    program1,
    audioContext,
    bpmValue,
    globalSampleCount,
    ringPos,
    miniRefs,
    timelineRefs,
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

  const { widgets: timelineWidgets, onBeforeDraw: onBeforeDrawTimeline } = useTimelineWidget({
    program1,
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs,
    dspSource,
    showWidgets,
  })

  const { widgets: timelineSequenceWidgets, onBeforeDraw: onBeforeDrawTimelineSequence } = useTimelineSequenceWidget({
    program1,
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs,
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
    onBeforeDrawTimeline()
    onBeforeDrawTimelineSequence()
    onBeforeDrawAnalyser()
    onBeforeDrawArrayAccess()
  }, [
    onBeforeDraw,
    onBeforeDrawPianoroll,
    onBeforeDrawTimeline,
    onBeforeDrawTimelineSequence,
    onBeforeDrawAnalyser,
    onBeforeDrawArrayAccess,
  ])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    return [
      ...analyserWidgets,
      ...timelineWidgets,
      ...timelineSequenceWidgets,
      ...pianorollWidgets,
      ...sequenceWidgets,
      ...arrayAccessWidgets,
    ]
  }, [showWidgets, analyserWidgets, timelineWidgets, timelineSequenceWidgets, pianorollWidgets, sequenceWidgets, arrayAccessWidgets])

  return (
    <div className="flex flex-row gap-2 w-full">
      <div className="bg-gray-900 text-white font-mono text-sm w-full h-[90dvh]">
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
    <div className="flex flex-col gap-2 min-w-[30dvw] max-w-[30dvw]" onClick={e => {
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
      <div className="bg-gray-900 text-white p-3 rounded-md border border-gray-600 font-mono text-xs w-full h-[87dvh] overflow-auto">
        <pre className="whitespace-pre-wrap">{analysis.bytecodeText || 'No bytecode available yet.'}</pre>
      </div>
    </div>
  )
}

export function PlaybackControls({ timelineWindowRef }: { timelineWindowRef: React.RefObject<TimelineWindow> }) {
  const {
    audioContext,
    bpmValue,
    globalSampleCount,
    program1,
    timelineRefs,
    pause,
    playbackState,
    start,
    stop,
  } = useEngineStore()

  const seekToSample = useSeekToSample()

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
      <MinimapScrollbar
        audioContext={audioContext}
        bpmValue={bpmValue}
        globalSampleCount={globalSampleCount}
        timelineRefs={timelineRefs}
        seekToSample={seekToSample}
        timelineWindowRef={timelineWindowRef}
      />
    </div>
  )
}

export function EngineUI() {
  const { isInitialized } = useEngine()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader()

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-white">Initializing engine...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <PlaybackControls timelineWindowRef={timelineWindowRef} />
      <DspSourceEditor timelineHeader={timelineHeader} />
    </div>
  )
}
