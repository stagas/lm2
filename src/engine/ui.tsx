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
import { useAppStore } from '../app/store.ts'
import { Logo } from '../components/Logo.tsx'
import { Spinner } from '../components/Spinner.tsx'
import type { LangError } from '../lang/errors.ts'
import { analyze } from '../lang/pipeline.ts'
import { buildMiniSourceMap, type SourceLocation } from '../lib/mini-source-map.ts'
import { compileMiniNotation } from '../mini/compiler.ts'
import type {
  AnalyserRef,
  ArrayLiteralRef,
  MiniSequenceRef,
  NumberWithParamsInfo,
  SampleDef,
  TimelineSequenceRef,
} from './bytecode.ts'
import { encodeLangToVmOps, extractBarsFromSource, extractTimelineLabelsFromSource } from './bytecode.ts'
import type { Loop } from './loop.ts'
import { MinimapScrollbar } from './MinimapScrollbar.tsx'
import { useEngine } from './program.ts'
import { Sidebar } from './Sidebar.tsx'
import { useEngineStore } from './store.ts'
import { useTheme } from './theme.ts'
import { buildTimelineLabels } from './timeline-labels.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useLoopView } from './useLoopView.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { useSampleWidget } from './useSampleWidget.ts'
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
  sampleDefs: SampleDef[]
}

export function DspSourceEditor(
  { timelineHeader, currentLoop }: { timelineHeader: EditorHeader; currentLoop: Loop | null },
) {
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isLoopLoading = useAppStore(state => state.isLoopLoading)
  const isProgramReady = useEngineStore(state => state.isProgramReady)
  const code = currentLoop?.codeFile.value ?? ''
  const isAwaitingCode = currentLoop != null && currentLoop.data.code == null && code.length === 0

  if (!hasHydrated || !isProgramReady || isLoopLoading || isAwaitingCode || !currentLoop) {
    return (
      <div className="flex flex-row gap-2 w-full h-full relative"
        style={{ background: 'radial-gradient(circle, rgba(255,255,255,0.1) 0%, rgba(0,0,0,0.1) 100%)' }}
      >
        <div className="absolute inset-0 z-10 flex items-center justify-center">
          <div className="w-8 h-8">
            <Spinner lineWidth={1.75} />
          </div>
        </div>
      </div>
    )
  }

  return <DspSourceEditorReady timelineHeader={timelineHeader} currentLoop={currentLoop} />
}

function DspSourceEditorReady(
  { timelineHeader, currentLoop }: { timelineHeader: EditorHeader; currentLoop: Loop },
) {
  const codeFileKeyByFileRef = useRef<WeakMap<CodeFile, string>>(new WeakMap())
  const nextCodeFileKeyRef = useRef(0)

  const {
    dspSource,
    updateDspSource,
    isProgramReady,
    program1,
    program2,
    audioContext,
    bpmValue,
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
    uiSampleDefs,
    isProgramSwapPending,
  } = useEngineStore()

  const { playbackState } = useEngineStore()
  const [error, setError] = useState<string>()
  const { isUpdatingDsp } = useEngineStore()
  const theme = useTheme()
  // Subscribe for rerenders while editing, but use `codeFile.value` for synchronous reads
  // to avoid a one-render lag during loop switches.
  useCodeFileValue(currentLoop?.codeFile)
  const code = currentLoop?.codeFile.value ?? ''
  const loopId = currentLoop?.data.id ?? null
  const { globalSampleCount, isPlayingLoop, isPlaybackRunningForView, viewSampleCount } = useLoopView(loopId)

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
    const source = code
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
  }, [code])

  const hasLocalErrors = (localAnalysis?.errors?.length ?? 0) > 0

  const showWidgets = currentLoop != null && (code.length > 0 || dspSource.length > 0)
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
    if (code === uiDspSource) {
      return {
        dspSource: uiDspSource,
        sequences: uiSequences,
        miniRefs: uiMiniRefs,
        timelineRefs: uiTimelineRefs,
        miniSourceMaps: uiMiniSourceMaps,
        analyserRefs: uiAnalyserRefs,
        arrayLiterals: uiArrayLiterals,
        numberParams: uiNumberParams,
        sampleDefs: uiSampleDefs,
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
        sampleDefs: uiSampleDefs,
      }
    }

    target.ops.fill(0)
    target.literals.fill(0)

    const result = encodeLangToVmOps(code, target)
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
        sampleDefs: uiSampleDefs,
      }
    }

    const sequences = result.miniSequences ?? []
    const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = sequences.map(s => {
      const compiled = compileMiniNotation(s)
      return buildMiniSourceMap(compiled.nodes, compiled.bytecode)
    })

    return {
      dspSource: code,
      sequences,
      miniRefs: result.miniRefs ?? [],
      timelineRefs: result.timelineRefs ?? [],
      miniSourceMaps,
      analyserRefs: result.analyserRefs ?? [],
      arrayLiterals: result.arrayLiterals ?? [],
      numberParams: result.numberParams ?? [],
      sampleDefs: result.sampleDefs ?? [],
    }
  }, [
    code,
    uiDspSource,
    uiSequences,
    uiMiniRefs,
    uiTimelineRefs,
    uiMiniSourceMaps,
    uiAnalyserRefs,
    uiArrayLiterals,
    uiNumberParams,
    uiSampleDefs,
  ])

  const runtimeProgram = isProgramSwapPending ? program2 : program1

  useLayoutEffect(() => {
    if (!currentLoop) return
    if (isPlayingLoop) return
    if (code === uiDspSource) return

    const target = previewTargetRef.current
    if (!target) return

    target.ops.fill(0)
    target.literals.fill(0)

    const result = encodeLangToVmOps(code, target)
    if (result.errors.length) return

    const sequences = result.miniSequences ?? []
    const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = sequences.map(s => {
      const compiled = compileMiniNotation(s)
      return buildMiniSourceMap(compiled.nodes, compiled.bytecode)
    })

    const labelsExtracted = extractTimelineLabelsFromSource(code)
    if (labelsExtracted.errors.length) return

    const barsExtracted = extractBarsFromSource(code)
    if (barsExtracted.errors.length) return

    const bars = barsExtracted.bars
    const timelineLabels = buildTimelineLabels(labelsExtracted.labels, bars)

    useEngineStore.setState({
      uiDspSource: code,
      uiSequences: sequences,
      uiMiniRefs: result.miniRefs ?? [],
      uiTimelineRefs: result.timelineRefs ?? [],
      uiTimelineLabels: timelineLabels,
      uiBars: bars,
      uiMiniSourceMaps: miniSourceMaps,
      uiAnalyserRefs: result.analyserRefs ?? [],
      uiArrayLiterals: result.arrayLiterals ?? [],
      uiNumberParams: result.numberParams ?? [],
      uiSampleDefs: result.sampleDefs ?? [],
    })
  }, [code, currentLoop, isPlayingLoop, uiDspSource])

  const handleApply = async () => {
    if (!isProgramReady) return
    const requested = code
    try {
      setError(undefined)
      await updateDspSource(requested)
    }
    catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  useLayoutEffect(() => {
    if (currentLoop && currentLoop.data.code == null && code.length === 0) return
    if (!isPlayingLoop) return
    void handleApply()
  }, [currentLoop, isProgramReady, isPlayingLoop])

  useEffect(() => {
    if (!isProgramReady) return
    if (!currentLoop) return
    if (!isPlayingLoop) return
    if (hasLocalErrors) return
    if (code === dspSource) return

    void handleApply()
  }, [code, currentLoop?.data.id, dspSource, hasLocalErrors, isProgramReady, isPlayingLoop])

  const frameRef = useRef<Array<SeqFrame | undefined>>([])
  const controlStateRef = useRef<Map<number, SeqControlState>>(new Map())
  const playingLoopId = useEngineStore(state => state.playingLoopId)
  const resetKey = `${currentLoop?.data.id ?? ''}:${playingLoopId ?? ''}`

  const { widgets: sequenceWidgets, onBeforeDraw } = useSequenceWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    sequences: widgetCompileState.sequences,
    miniSourceMaps: widgetCompileState.miniSourceMaps,
    miniRefs: widgetCompileState.miniRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    resetKey,
    frameRef,
    controlStateRef,
    bpmValue,
  })

  const { widgets: pianorollWidgets, onBeforeDraw: onBeforeDrawPianoroll } = usePianorollWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    sequences: widgetCompileState.sequences,
    miniSourceMaps: widgetCompileState.miniSourceMaps,
    miniRefs: widgetCompileState.miniRefs,
    timelineLabels: uiTimelineLabels,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    resetKey,
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
    isPlaying: isPlaybackRunningForView,
    isLive: isPlayingLoop,
    resetKey,
  })

  const { widgets: timelineSequenceWidgets, onBeforeDraw: onBeforeDrawTimelineSequence } = useTimelineSequenceWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs: widgetCompileState.timelineRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    isLive: isPlayingLoop,
    resetKey,
  })

  const { widgets: analyserWidgets, onBeforeDraw: onBeforeDrawAnalyser } = useAnalyserWidget({
    program1: runtimeProgram,
    ringPos,
    analyserRefs: widgetCompileState.analyserRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive: isPlayingLoop,
    playbackState,
    sampleRate: audioContext?.sampleRate,
  })

  const { widgets: arrayAccessWidgets, onBeforeDraw: onBeforeDrawArrayAccess } = useArrayAccessWidget({
    program1: runtimeProgram,
    dspSource: widgetCompileState.dspSource,
    showWidgets: showWidgets && isPlayingLoop,
    arrayLiterals: widgetCompileState.arrayLiterals,
  })

  const { widgets: sampleWidgets, onBeforeDraw: onBeforeDrawSample } = useSampleWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    sampleDefs: widgetCompileState.sampleDefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    playbackState,
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
    onBeforeDrawSample()
  }, [
    onBeforeDraw,
    onBeforeDrawPianoroll,
    onBeforeDrawTimeline,
    onBeforeDrawTimelineSequence,
    onBeforeDrawAnalyser,
    onBeforeDrawArrayAccess,
    onBeforeDrawSample,
  ])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    return [
      ...sampleWidgets,
      ...analyserWidgets,
      ...timelineWidgets,
      ...timelineSequenceWidgets,
      ...pianorollWidgets,
      ...sequenceWidgets,
      ...arrayAccessWidgets,
      ...sliderWidgets,
    ]
  }, [showWidgets, analyserWidgets, timelineWidgets, timelineSequenceWidgets, pianorollWidgets, sequenceWidgets,
    arrayAccessWidgets, sliderWidgets, sampleWidgets, viewSampleCount])

  const codeEditorKey = useMemo(() => {
    const codeFile = currentLoop?.codeFile
    if (!codeFile) return '<none>'
    const existing = codeFileKeyByFileRef.current.get(codeFile)
    if (existing) return existing
    const next = String(++nextCodeFileKeyRef.current)
    codeFileKeyByFileRef.current.set(codeFile, next)
    return next
  }, [currentLoop?.codeFile])

  return (
    <div className="flex flex-row gap-2 w-full h-full relative">
      <div className="bg-gray-900 text-white font-mono text-sm w-full h-full">
        <CodeEditor
          key={codeEditorKey}
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

export function PlaybackControls({
  timelineWindowRef,
  currentLoop,
}: {
  timelineWindowRef: React.RefObject<TimelineWindow>
  currentLoop: Loop | null
}) {
  const {
    audioContext,
    bpmValue,
    globalSampleCount,
    uiTimelineLabels,
    uiTimelineRefs,
    uiBars,
    pause,
    stop,
    playLoop,
  } = useEngineStore()

  // Subscribe for rerenders while editing, but read from `codeFile.value` on demand.
  useCodeFileValue(currentLoop?.codeFile)
  const { globalSampleCount: viewGlobalSampleCount, seekToSample, canControlPlayback } = useLoopView(
    currentLoop?.data.id ?? null,
  )

  return (
    <div className="h-[60px] flex items-center justify-center gap-2 pl-3 border-b-2 border-orange-600">
      <Logo />
      <div className="flex items-center justify-center">
        <PlaybackButton icon={<PlayIcon />} onClick={() => {
          if (!currentLoop) return
          void playLoop(currentLoop.data.id, currentLoop.codeFile.value)
        }} />
        <PlaybackButton icon={<PauseIcon />} onClick={pause} />
        <PlaybackButton icon={<StopIcon />} onClick={stop} />
      </div>
      <MinimapScrollbar
        audioContext={audioContext}
        bpmValue={bpmValue}
        globalSampleCount={viewGlobalSampleCount ?? globalSampleCount}
        timelineRefs={uiTimelineRefs}
        timelineLabels={uiTimelineLabels}
        bars={uiBars}
        seekToSample={seekToSample}
        timelineWindowRef={timelineWindowRef}
        canControlPlayback={canControlPlayback}
      />
    </div>
  )
}

export function EngineUI() {
  const { isInitialized } = useEngine()

  const [currentLoop, setCurrentLoop] = useState<Loop | null>(null)
  const { timelineHeader, timelineWindowRef } = useTimelineHeader(currentLoop?.data.id ?? null)

  const handleLoopChange = useCallback((loop: Loop) => {
    setCurrentLoop(loop)
  }, [])

  if (!isInitialized) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-white">Initializing engine...</div>
      </div>
    )
  }

  return (
    <div className="flex flex-col">
      <PlaybackControls timelineWindowRef={timelineWindowRef} currentLoop={currentLoop} />
      <div className="flex flex-row h-[calc(100dvh-61px)]">
        <Sidebar onLoopChange={handleLoopChange} />
        <DspSourceEditor timelineHeader={timelineHeader} currentLoop={currentLoop} />
      </div>
    </div>
  )
}
