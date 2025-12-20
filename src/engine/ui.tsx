import {
  ArrowLineLeftIcon,
  ArrowLineRightIcon,
  ArticleIcon,
  FilePlusIcon,
  FloppyDiskBackIcon,
  GearSixIcon,
  GlobeIcon,
  HeartIcon,
  WaveformIcon,
} from '@phosphor-icons/react'
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

export function DspSourceEditor({ timelineHeader }: { timelineHeader: EditorHeader }) {
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
  const [localSource, setLocalSource] = useState(dspSource)
  const [error, setError] = useState<string>()
  const { isUpdatingDsp } = useEngineStore()
  const theme = useTheme()

  const codeFileRef = useRef<CodeFile>(new CodeFile(dspSource))

  useEffect(() => {
    const codeFile = codeFileRef.current
    const unsub = codeFile.subscribe(() => {
      const v = codeFile.value
      setLocalSource(prev => (prev === v ? prev : v))
    })
    return () => {
      unsub()
    }
  }, [])

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

  const previewTargetRef = useRef<{ ops: Int32Array; literals: Float32Array } | null>(null)
  if (!previewTargetRef.current) {
    previewTargetRef.current = {
      ops: new Int32Array(OPS_COUNT),
      literals: new Float32Array(LITERALS_COUNT),
    }
  }

  const widgetCompileState = useMemo((): WidgetCompileState => {
    if (localSource === uiDspSource) {
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

    const result = encodeLangToVmOps(localSource, target)
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
    const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = sequences.map((s) => {
      const compiled = compileMiniNotation(s)
      return buildMiniSourceMap(compiled.nodes, compiled.bytecode)
    })

    return {
      dspSource: localSource,
      sequences,
      miniRefs: result.miniRefs ?? [],
      timelineRefs: result.timelineRefs ?? [],
      miniSourceMaps,
      analyserRefs: result.analyserRefs ?? [],
      arrayLiterals: result.arrayLiterals ?? [],
      numberParams: result.numberParams ?? [],
    }
  }, [
    localSource,
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
    const requested = localSource
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
  }, [localSource, isProgramReady])

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
    codeFileRef,
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

  return (
    <div className="flex flex-row gap-2 w-full h-full">
      <div className="bg-gray-900 text-white font-mono text-sm w-full h-full">
        <CodeEditor
          codeFile={codeFileRef.current}
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
    <button onPointerDown={onClick} className="w-8 h-8 flex items-center justify-center text-orange-600">
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
    <div className="h-[60px] flex items-center justify-center gap-3 pl-3 border-b-2 border-orange-600">
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

type SidebarTab = 'loops' | 'liked' | 'browse' | 'compiled' | 'settings'

const SidebarTabIcon: Record<SidebarTab, React.ReactNode> = {
  loops: <WaveformIcon weight="regular" size={16} />,
  liked: <HeartIcon weight="regular" size={16} />,
  browse: <GlobeIcon weight="regular" size={16} />,
  compiled: <ArticleIcon weight="regular" size={16} />,
  settings: <GearSixIcon weight="regular" size={16} />,
}

const loops = [
  'Ostkreuz',
  'Acid',
  'Phosphorus',
  'More Acid',
  'LSD',
  'Voices',
  'Zeitgeist',
  'Synesthesia',
  'Blueprint',
  'Mirage',
  'Pulse',
  'Cosmos',
  'Nebula',
  'Galaxy',
  'Universe',
  'Infinity',
  'Eternity',
  'Paradise',
  'Eden',
  'Garden',
]

const edited = [
  'LSD',
  'Voices',
  'Synesthesia',
  'Mirage',
  'Veils of The Unknown Mysteries of The Universe',
  'Nebula',
  'Paradise',
]

const LoopItem = ({
  loop,
  isEdited,
  isCurrent,
  onClick,
}: {
  loop: string
  isEdited: boolean
  isCurrent: boolean
  onClick: () => void
}) => (
  <div
    key={loop}
    className={`
      select-none cursor-pointer
      text-sm flex flex-row items-center justify-between gap-2 px-2 w-full flex-shrink-0
      bg-gradient-to-b
      ${
      isCurrent
        ? 'from-neutral-500 to-neutral-800'
        : 'from-black to-neutral-800 hover:from-neutral-700 hover:to-neutral-900'
    }
    `}
    onPointerDown={onClick}
  >
    <div className="flex flex-row items-center gap-2 leading-tight">
      {isEdited && (
        <div
          title="Has unsaved changes"
          className="w-1.5 h-1.5 rounded-full bg-orange-500 shrink-0"
        />
      )}
      <div className="py-2">{loop}</div>
    </div>
    {isCurrent && isEdited && (
      <div className="flex flex-row items-center gap-2">
        <button title="Save"
          className="p-1 bg-gradient-to-br from-neutral-300 to-neutral-500 rounded-md text-black hover:from-neutral-200 hover:to-neutral-400"
        >
          <FloppyDiskBackIcon weight="regular" size={16} />
        </button>
        <button title="Save as New"
          className="p-1 bg-gradient-to-br from-neutral-300 to-neutral-500 rounded-md text-black hover:from-neutral-200 hover:to-neutral-400"
        >
          <FilePlusIcon weight="regular" size={16} />
        </button>
      </div>
    )}
  </div>
)

export function Sidebar() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('loops')
  const [currentLoop, setCurrentLoop] = useState<string>('edited:Voices')
  const [editedLoops, setEditedLoops] = useState<string[]>(edited)

  const toggleSidebar = () => {
    setSidebarOpen(!sidebarOpen)
  }

  const handleNewLoop = () => {
    let newLoop = 'Untitled'
    let untitledCount = 0
    for (const loop of editedLoops) {
      if (loop.startsWith('Untitled')) {
        untitledCount = Math.max(untitledCount, parseInt(loop.split(' ').pop() || '0') || 1)
      }
    }
    if (untitledCount > 0) {
      newLoop = `Untitled ${untitledCount + 1}`
    }
    setEditedLoops([newLoop, ...editedLoops])
  }

  return (
    <div className={`z-10 relative h-full ${sidebarOpen ? 'w-[30dvw]' : 'w-0'}`}>
      {sidebarOpen && (
        <div className="flex flex-col w-full h-full">
          <div className="h-[40px] bg-black flex shrink-0">
            {Object.entries(SidebarTabIcon).map(([tab, icon]) => (
              <button
                key={tab}
                onPointerDown={() => setSidebarTab(tab as SidebarTab)}
                className={`flex-1 font-semibold text-xs flex items-center justify-center gap-2 ${
                  sidebarTab === tab
                    ? 'bg-black text-white'
                    : 'bg-gradient-to-b from-black to-neutral-800 text-[#888] hover:text-white'
                }`}
              >
                {icon}
              </button>
            ))}
          </div>
          <div className="flex flex-1 flex-col w-full h-full overflow-y-auto">
            {sidebarTab === 'loops' && (
              <>
                <div className="flex flex-col w-full h-full border-b-2 border-orange-600">
                  <LoopItem key="<new>" loop="<new>" isEdited={false} isCurrent={false} onClick={() =>
                    handleNewLoop()} />
                  {editedLoops.map((loop) => (
                    <LoopItem key={loop} loop={loop} isEdited={true} isCurrent={currentLoop === `edited:${loop}`}
                      onClick={() => setCurrentLoop(`edited:${loop}`)} />
                  ))}
                </div>
                <div className="flex flex-col w-full h-full">
                  {loops.map((loop) => (
                    <LoopItem key={loop} loop={loop} isEdited={false} isCurrent={currentLoop === loop} onClick={() =>
                      setCurrentLoop(loop)} />
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
      <button
        onPointerDown={toggleSidebar}
        className="
              absolute right-[-37px] top-0 w-[37px] h-[40px] flex items-center justify-center bg-red-500
              bg-gradient-to-br from-neutral-700 to-black text-[#888] hover:text-white
            "
      >
        {sidebarOpen
          ? <ArrowLineLeftIcon weight="regular" size={16} />
          : <ArrowLineRightIcon weight="regular" size={16} />}
      </button>
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
      <div className="flex flex-row h-[calc(100dvh-61px)]">
        <Sidebar />
        <DspSourceEditor timelineHeader={timelineHeader} />
      </div>
    </div>
  )
}
