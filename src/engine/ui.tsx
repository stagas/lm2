import { CodeEditor, CodeFile, type EditorHeader, type EditorWidget } from 'mini-code'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { LITERALS_COUNT, OPS_COUNT } from '../../as/assembly/constants.ts'
import type {
  AnalyserRef,
  ArrayLiteralRef,
  MiniSequenceRef,
  NumberWithParamsInfo,
  TimelineSequenceRef,
} from '../bytecode.ts'
import { encodeLangToVmOps } from '../bytecode.ts'
import { Logo } from '../components/Logo.tsx'
import type { LangError } from '../lang/errors.ts'
import { analyze } from '../lang/pipeline.ts'
import { buildMiniSourceMap, type SourceLocation } from '../lib/mini-source-map.ts'
import { compileMiniNotation } from '../mini/compiler.ts'
import type { Loop } from './loop.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { useEngine } from './program.ts'
import { Sidebar } from './Sidebar.tsx'
import { useEngineStore } from './store.ts'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { useSeekToSample } from './useSeekToSample.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'
import { useSliderWidget } from './useSliderWidget.ts'
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
      onChange={e => onChange(e.target.value)}
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

type WidgetCompileState = {
  dspSource: string
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  timelineRefs: TimelineSequenceRef[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  analyserRefs: AnalyserRef[]
  arrayLiterals: ArrayLiteralRef[]
  numberParams: NumberWithParamsInfo[]
}

export function DspSourceEditor(
  { timelineHeader, currentLoop }: { timelineHeader: EditorHeader; currentLoop: Loop | null },
) {
  const {
    dspSource,
    updateDspSource,
    isProgramReady,
    program1,
    program2,
    audioContext,
    bpmValue,
    globalSampleCount,
    ringPos,
    uiDspSource,
    uiSequences,
    uiMiniRefs,
    uiTimelineRefs,
    uiTimelineLabels,
    uiMiniSourceMaps,
    uiAnalyserRefs,
    uiArrayLiterals,
    uiNumberParams,
    isProgramSwapPending,
  } = useEngineStore()

  const { playbackState } = useEngineStore()
  const [error, setError] = useState<string>()
  const { isUpdatingDsp } = useEngineStore()
  const theme = useTheme()

  // useEffect(() => {
  //   if (currentLoop == null) return
  //   const codeFile = currentLoop.codeFile
  //   const unsub = codeFile.subscribe(() => {
  //     const v = codeFile.value
  //     setLocalSource(prev => (prev === v ? prev : v))
  //   })
  //   return () => {
  //     unsub()
  //   }
  // }, [currentLoop])

  // Keep widgets visible while the store is still processing updates or when
  // the editor has compilation errors so the user can see widgets while fixing.
  const localAnalysis = useMemo(() => {
    const source = currentLoop?.data.code ?? ''
    try {
      return analyze(source)
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
  }, [currentLoop])

  const hasLocalErrors = (localAnalysis?.errors?.length ?? 0) > 0

  const showWidgets = currentLoop?.codeFile.value === dspSource
    || isUpdatingDsp
    || hasLocalErrors

  const previewTargetRef = useRef<{ ops: Int32Array; literals: Float32Array } | null>(null)
  if (!previewTargetRef.current) {
    previewTargetRef.current = {
      ops: new Int32Array(OPS_COUNT),
      literals: new Float32Array(LITERALS_COUNT),
    }
  }

  const widgetCompileState = useMemo((): WidgetCompileState => {
    if (currentLoop?.codeFile.value === uiDspSource) {
      return {
        dspSource: uiDspSource,
        sequences: uiSequences,
        miniRefs: uiMiniRefs,
        timelineRefs: uiTimelineRefs,
        miniSourceMaps: uiMiniSourceMaps,
        analyserRefs: uiAnalyserRefs,
        arrayLiterals: uiArrayLiterals,
        numberParams: uiNumberParams,
      }
    }

    const target = previewTargetRef.current
    if (!target) {
      return {
        dspSource: uiDspSource,
        sequences: uiSequences,
        miniRefs: uiMiniRefs,
        timelineRefs: uiTimelineRefs,
        miniSourceMaps: uiMiniSourceMaps,
        analyserRefs: uiAnalyserRefs,
        arrayLiterals: uiArrayLiterals,
        numberParams: uiNumberParams,
      }
    }

    target.ops.fill(0)
    target.literals.fill(0)

    const result = encodeLangToVmOps(currentLoop?.codeFile.value ?? '', target)
    if (result.errors.length) {
      return {
        dspSource: uiDspSource,
        sequences: uiSequences,
        miniRefs: uiMiniRefs,
        timelineRefs: uiTimelineRefs,
        miniSourceMaps: uiMiniSourceMaps,
        analyserRefs: uiAnalyserRefs,
        arrayLiterals: uiArrayLiterals,
        numberParams: uiNumberParams,
      }
    }

    const sequences = result.miniSequences ?? []
    const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = sequences.map(s => {
      const compiled = compileMiniNotation(s)
      return buildMiniSourceMap(compiled.nodes, compiled.bytecode)
    })

    return {
      dspSource: currentLoop?.codeFile.value ?? '',
      sequences,
      miniRefs: result.miniRefs ?? [],
      timelineRefs: result.timelineRefs ?? [],
      miniSourceMaps,
      analyserRefs: result.analyserRefs ?? [],
      arrayLiterals: result.arrayLiterals ?? [],
      numberParams: result.numberParams ?? [],
    }
  }, [
    currentLoop,
    uiDspSource,
    uiSequences,
    uiMiniRefs,
    uiTimelineRefs,
    uiMiniSourceMaps,
    uiAnalyserRefs,
    uiArrayLiterals,
    uiNumberParams,
  ])

  const runtimeProgram = isProgramSwapPending ? program2 : program1

  const handleApply = async () => {
    if (!isProgramReady) return
    const requested = currentLoop?.codeFile.value ?? ''
    try {
      setError(undefined)
      await updateDspSource(requested)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useLayoutEffect(() => {
    void handleApply()
  }, [currentLoop, isProgramReady])

  const frameRef = useRef<Array<SeqFrame | undefined>>([])
  const controlStateRef = useRef<Map<number, SeqControlState>>(new Map())

  const { widgets: sequenceWidgets, onBeforeDraw } = useSequenceWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    miniSourceMaps: widgetCompileState.miniSourceMaps,
    miniRefs: widgetCompileState.miniRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    frameRef,
    controlStateRef,
    bpmValue,
  })

  const { widgets: pianorollWidgets, onBeforeDraw: onBeforeDrawPianoroll } = usePianorollWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    miniSourceMaps: widgetCompileState.miniSourceMaps,
    miniRefs: widgetCompileState.miniRefs,
    timelineLabels: uiTimelineLabels,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
  })

  const { widgets: timelineWidgets, onBeforeDraw: onBeforeDrawTimeline } = useTimelineWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs: widgetCompileState.timelineRefs,
    timelineLabels: uiTimelineLabels,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
  })

  const { widgets: timelineSequenceWidgets, onBeforeDraw: onBeforeDrawTimelineSequence } = useTimelineSequenceWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs: widgetCompileState.timelineRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
  })

  const { widgets: analyserWidgets, onBeforeDraw: onBeforeDrawAnalyser } = useAnalyserWidget({
    program1: runtimeProgram,
    ringPos,
    analyserRefs: widgetCompileState.analyserRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    playbackState,
    sampleRate: audioContext?.sampleRate,
  })

  const { widgets: arrayAccessWidgets, onBeforeDraw: onBeforeDrawArrayAccess } = useArrayAccessWidget({
    program1: runtimeProgram,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    arrayLiterals: widgetCompileState.arrayLiterals,
  })

  const { widgets: sliderWidgets } = useSliderWidget({
    showWidgets,
    numberParams: widgetCompileState.numberParams,
    theme,
    codeFile: currentLoop?.codeFile,
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
      ...sliderWidgets,
    ]
  }, [showWidgets, analyserWidgets, timelineWidgets, timelineSequenceWidgets, pianorollWidgets, sequenceWidgets,
    arrayAccessWidgets, sliderWidgets])
  console.log('should draw new', currentLoop?.codeFile.value)
  return (
    <div className="flex flex-row gap-2 w-full h-full">
      <div className="bg-gray-900 text-white font-mono text-sm w-full h-full">
        <CodeEditor
          codeFile={currentLoop?.codeFile}
          widgets={widgets}
          header={timelineHeader}
          theme={theme}
          tokenizer={tokenizer}
          isAnimating={true}
          gutter={true}
          onBeforeDraw={onBeforeDrawCombined}
        />
      </div>
      {
        /* {error && (
        <div className="bg-red-900 text-red-200 p-2 rounded-md text-sm">
          {error}
        </div>
      )} */
      }
      {/* <BytecodeInspector source={localSource} /> */}
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
    <div className="flex flex-col gap-2 w-full" onClick={e => {
      navigator.clipboard.writeText((e.target as HTMLElement).textContent || '')
    }}>
      <div className="flex items-center justify-between text-xs text-gray-200">
        <span className="font-semibold">Bytecode (analysis)</span>
        <span className="text-neutral-400">{analysis.tokenCount} tokens</span>
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
      <div className="bg-neutral-900 text-white p-3 border border-gray-600 font-mono text-xs w-full h-full overflow-auto">
        <pre className="whitespace-pre-wrap">{analysis.bytecodeText || 'No bytecode available yet.'}</pre>
      </div>
    </div>
  )
}

function PlaybackButton({ icon, onClick }: { icon: React.ReactNode; onClick: () => void }) {
  return (
    <button onPointerDown={onClick} className="w-10 h-8 flex items-center justify-center text-orange-600">
      {icon}
    </button>
  )
}

const GradientIcon = ({ path }: { path: string }) => (
  <svg width="24" height="24" viewBox="0 0 256 256">
    <defs>
      <linearGradient id="gradient" x1="0" y1="0" x2=".75" y2=".75">
        <stop offset="0%" stopColor="#f97316" /> {/* orange-500 */}
        <stop offset="100%" stopColor="#ef4444" /> {/* red-500 */}
      </linearGradient>
    </defs>
    <path d={path} fill="url(#gradient)" />
  </svg>
)

const PlayIcon = () => (
  <GradientIcon path="M240,128a15.74,15.74,0,0,1-7.6,13.51L88.32,229.65a16,16,0,0,1-16.2.3A15.86,15.86,0,0,1,64,216.13V39.87a15.86,15.86,0,0,1,8.12-13.82,16,16,0,0,1,16.2.3L232.4,114.49A15.74,15.74,0,0,1,240,128Z" />
)
const PauseIcon = () => (
  <GradientIcon path="M216,48V208a16,16,0,0,1-16,16H160a16,16,0,0,1-16-16V48a16,16,0,0,1,16-16h40A16,16,0,0,1,216,48ZM96,32H56A16,16,0,0,0,40,48V208a16,16,0,0,0,16,16H96a16,16,0,0,0,16-16V48A16,16,0,0,0,96,32Z" />
)
const StopIcon = () => (
  <GradientIcon path="M216,56V200a16,16,0,0,1-16,16H56a16,16,0,0,1-16-16V56A16,16,0,0,1,56,40H200A16,16,0,0,1,216,56Z" />
)

export function PlaybackControls({ timelineWindowRef }: { timelineWindowRef: React.RefObject<TimelineWindow> }) {
  const {
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs,
    uiTimelineLabels,
    uiBars,
    pause,
    start,
    stop,
  } = useEngineStore()

  const seekToSample = useSeekToSample()

  return (
    <div className="h-[60px] flex items-center justify-center gap-2 pl-3 border-b-2 border-orange-600">
      <Logo />
      <div className="flex items-center justify-center">
        <PlaybackButton icon={<PlayIcon />} onClick={start} />
        <PlaybackButton icon={<PauseIcon />} onClick={pause} />
        <PlaybackButton icon={<StopIcon />} onClick={stop} />
      </div>
      <MinimapScrollbar
        audioContext={audioContext}
        bpmValue={bpmValue}
        globalSampleCount={globalSampleCount}
        timelineRefs={timelineRefs}
        timelineLabels={uiTimelineLabels}
        bars={uiBars}
        seekToSample={seekToSample}
        timelineWindowRef={timelineWindowRef}
      />
    </div>
  )
}

export function EngineUI() {
  const { isInitialized } = useEngine()
  const { timelineHeader, timelineWindowRef } = useTimelineHeader()

  const [currentLoop, setCurrentLoop] = useState<Loop | null>(null)

  const handleLoopChange = (loop: Loop) => {
    setCurrentLoop(loop)
  }

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
      <div className="flex flex-row h-[calc(100dvh-61px)]">
        <Sidebar onLoopChange={handleLoopChange} />
        <DspSourceEditor timelineHeader={timelineHeader} currentLoop={currentLoop} />
      </div>
    </div>
  )
}
