import { CopyIcon } from '@phosphor-icons/react'
import { CodeEditor, CodeFile, type EditorError, type EditorHeader, type EditorWidget } from 'mini-code'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'preact/hooks'
import { LITERALS_COUNT, OPS_COUNT } from '../../../as/assembly/constants.ts'
import { useAppStore } from '../../app/store.ts'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerLarge } from '../../components/Spinner.tsx'
import type { LangError } from '../../lang/errors.ts'
import { buildMiniSourceMap, type SourceLocation } from '../../lib/mini-source-map.ts'
import { compileMiniNotation } from '../../mini/compiler.ts'
import { isLocalId, makeLocalId } from '../../utils/id.ts'
import {
  encodeLangToVmOps,
  extractBarsFromSource,
  extractTimelineLabelsFromSource,
} from '../bytecode/bytecode.ts'
import type { VmCompileSnapshot } from '../dsp/program.ts'
import { buildTimelineLabels } from '../dsp/timeline-labels.ts'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import type { WidgetCompileResult } from '../types.ts'
import { functionDefinitions } from './function-definitions.ts'
import type { Loop } from './loop.ts'
import { useRouter } from './router.tsx'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { useBranchWidget } from './useBranchWidget.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useCompressorWidget } from './useCompressorWidget.ts'
import { useFilterWidget } from './useFilterWidget.ts'
import { useIsEditorBusy } from './useIsEditorBusy.ts'
import { type KnobInfo, useKnobWidget } from './useKnobWidget.ts'
import { useLfoWidget } from './useLfoWidget.ts'
import { useLoopView } from './useLoopView.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { useSampleWidget } from './useSampleWidget.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'
import { useSlicerWidget } from './useSlicerWidget.ts'
import { useSliderWidget } from './useSliderWidget.ts'
import { useTimelineSequenceWidget } from './useTimelineSequenceWidget.ts'
import { useTimelineWidget } from './useTimelineWidget.ts'
import { useTrigWidget } from './useTrigWidget.ts'

export function DspSourceEditor(
  {
    timelineHeader,
    currentLoop,
    dspError,
    onDspError,
  }: {
    timelineHeader: EditorHeader
    currentLoop: Loop | null
    dspError: string | undefined
    onDspError: (error: string | undefined) => void
  },
) {
  const isEditorBusy = useIsEditorBusy()

  if (!currentLoop || isEditorBusy) {
    return (
      <RadialGradient>
        <SpinnerLarge />
      </RadialGradient>
    )
  }

  return (
    <DspSourceEditorReady
      timelineHeader={timelineHeader}
      currentLoop={currentLoop}
      dspError={dspError}
      onDspError={onDspError}
    />
  )
}

function DspSourceEditorReady(
  {
    timelineHeader,
    currentLoop,
    dspError,
    onDspError,
  }: {
    timelineHeader: EditorHeader
    currentLoop: Loop
    dspError: string | undefined
    onDspError: (error: string | undefined) => void
  },
) {
  const { navigate } = useRouter()
  const codeFileKeyByFileRef = useRef<WeakMap<CodeFile, string>>(new WeakMap())
  const nextCodeFileKeyRef = useRef(0)

  const previewTargetRef = useRef<{ ops: Int32Array; literals: Float32Array } | null>(null)
  if (!previewTargetRef.current) {
    previewTargetRef.current = {
      ops: new Int32Array(OPS_COUNT),
      literals: new Float32Array(LITERALS_COUNT),
    }
  }

  const dspSource = useEngineDspStore(state => state.dspSource)
  const preloadSamples = useEngineDspStore(state => state.preloadSamples)
  const updateDspSource = useEngineDspStore(state => state.updateDspSource)
  const sequences = useEngineDspStore(state => state.sequences)
  const miniRefs = useEngineDspStore(state => state.miniRefs)
  const timelineRefs = useEngineDspStore(state => state.timelineRefs)
  const timelineLabels = useEngineDspStore(state => state.timelineLabels)
  const bars = useEngineDspStore(state => state.bars)
  const miniSourceMaps = useEngineDspStore(state => state.miniSourceMaps)
  const analyserRefs = useEngineDspStore(state => state.analyserRefs)
  const compressorRefs = useEngineDspStore(state => state.compressorRefs)
  const lpRefs = useEngineDspStore(state => state.lpRefs)
  const slicerRefs = useEngineDspStore(state => state.slicerRefs)
  const lfoRefs = useEngineDspStore(state => state.lfoRefs)
  const everyRefs = useEngineDspStore(state => state.everyRefs)
  const atRefs = useEngineDspStore(state => state.atRefs)
  const euclidRefs = useEngineDspStore(state => state.euclidRefs)
  const arrayLiterals = useEngineDspStore(state => state.arrayLiterals)
  const branchMarks = useEngineDspStore(state => state.branchMarks)
  const numberParams = useEngineDspStore(state => state.numberParams)
  const sampleDefs = useEngineDspStore(state => state.sampleDefs)
  const loadedSamples = useEngineDspStore(state => state.loadedSamples)
  const isPreloadingSamples = useEngineDspStore(state => state.isPreloadingSamples)
  const isProgramSwapPending = useEngineDspStore(state => state.isProgramSwapPending)
  const isUpdatingDsp = useEngineDspStore(state => state.isUpdatingDsp)
  const setUiCompilePreview = useEngineDspStore(state => state.setUiCompilePreview)

  const {
    isProgramReady,
    program1,
    program2,
    audioContext,
    bpmValue,
    ringPos,
    playbackState,
  } = useEngineRuntimeStore()

  const { showFunctionDefinitions } = useEngineUiStore()
  const theme = useTheme()
  // Subscribe for rerenders while editing, but use `codeFile.value` for synchronous reads
  // to avoid a one-render lag during loop switches.
  useCodeFileValue(currentLoop?.codeFile)
  const code = currentLoop?.codeFile.value ?? ''
  const isAwaitingCode = currentLoop.data.code == null && code.length === 0
  const loopId = currentLoop?.data.id ?? null
  const loopBase = useAppStore(state => (loopId ? state.bases[loopId]?.code : undefined))
  const sessionData = useAppStore(state => state.sessionData)
  const serverLoopsUserId = useAppStore(state => state.serverLoopsUserId)
  const serverLoopsCache = useAppStore(state => state.serverLoopsCache)
  const localLoops = useAppStore(state => state.localLoops)
  const addLocalLoop = useAppStore(state => state.addLocalLoop)
  const moveBuffer = useAppStore(state => state.moveBuffer)
  const setSelectedLoopId = useAppStore(state => state.setSelectedLoopId)
  const { globalSampleCount, isPlayingLoop, isPlaybackRunningForView, viewSampleCount } = useLoopView(loopId)

  const remixBaselineRef = useRef<{ loopId: string; base: string } | null>(null)
  const remixPrevCodeRef = useRef<{ loopId: string; code: string } | null>(null)

  useEffect(() => {
    if (!loopId) return
    remixBaselineRef.current = null
    remixPrevCodeRef.current = null
  }, [loopId])

  useEffect(() => {
    if (!loopId) return
    if (remixBaselineRef.current?.loopId === loopId) return
    if (loopBase == null) return
    remixBaselineRef.current = { loopId, base: loopBase }
    remixPrevCodeRef.current = { loopId, code }
  }, [code, loopBase, loopId])

  useEffect(() => {
    if (!loopId) return
    if (isLocalId(loopId)) return
    const baseline = remixBaselineRef.current
    if (!baseline || baseline.loopId !== loopId) {
      remixPrevCodeRef.current = { loopId, code }
      return
    }

    const prev = remixPrevCodeRef.current
    remixPrevCodeRef.current = { loopId, code }
    if (!prev || prev.loopId !== loopId) return
    if (prev.code === code) return
    if (code === baseline.base) return

    if (serverLoopsCache.some(l => l.id === loopId)) return
    if (sessionData?.loops.some(l => l.id === loopId)) return
    const ownId = sessionData?.user.id ?? serverLoopsUserId
    if (ownId && currentLoop?.data.artistId === ownId) return

    const existing = localLoops.find(l => l.remixOfId === loopId || l.remixOf?.id === loopId)
    const localId = existing?.id ?? makeLocalId()
    if (!existing) {
      addLocalLoop({
        id: localId,
        title: currentLoop?.data.title ?? 'Untitled',
        artist: sessionData?.user.name ?? 'local',
        artistId: ownId ?? 'local',
        code: '',
        likesCount: 0,
        commentsCount: 0,
        remixesCount: 0,
        remixOfId: loopId,
        remixOf: currentLoop?.data,
        isPublic: false,
        timestamp: 0,
      })
    }
    // Important ordering: `moveBuffer()` also moves `selectedLoopId` when it matches `loopId`.
    // Ensure the local remix loop exists first so the editor doesn't briefly unmount mid-edit.
    moveBuffer(loopId, localId)
    const runtime = useEngineRuntimeStore.getState()
    if (runtime.playingLoopId === loopId) {
      useEngineUiStore.getState().renameLoopId(loopId, localId)
      runtime.setPlayingLoopId(localId)
    }
    setSelectedLoopId(localId)
    navigate('/my')
  }, [
    addLocalLoop,
    code,
    currentLoop?.data,
    localLoops,
    loopId,
    moveBuffer,
    serverLoopsCache,
    serverLoopsUserId,
    sessionData?.loops,
    sessionData?.user.id,
    sessionData?.user.name,
    navigate,
    setSelectedLoopId,
  ])

  const previewCompile = useMemo(() => {
    const target = previewTargetRef.current
    if (!target) return { errors: [] as LangError[] }
    target.ops.fill(0)
    target.literals.fill(0)
    return encodeLangToVmOps(code, target)
  }, [code])

  const compileErrors = previewCompile.errors ?? []
  const hasCompileErrors = compileErrors.length > 0

  const showWidgets = currentLoop != null && (code.length > 0 || dspSource.length > 0)
    || isUpdatingDsp
    || hasCompileErrors

  const headerErrorText = useMemo(() => {
    const parts: string[] = []

    if (dspError) parts.push(`runtime: ${dspError}`)

    for (const err of compileErrors) {
      const loc = err.line > 0 || err.column > 0 ? ` (${err.line}:${err.column})` : ''
      parts.push(`${err.message}${loc}`)
    }

    return parts.join('  •  ')
  }, [compileErrors, dspError])

  const editorErrors = useMemo((): EditorError[] => {
    const errors: EditorError[] = []

    if (dspError) {
      errors.push({
        line: 0,
        startColumn: 0,
        endColumn: 1,
        message: dspError,
      })
    }

    for (const err of compileErrors) {
      const line = Math.max(0, err.line - 1)
      const startColumn = Math.max(0, err.column - 1)
      const endColumn = startColumn + Math.max(1, err.length)
      errors.push({
        line,
        startColumn,
        endColumn,
        message: err.message,
      })
    }

    return errors
  }, [compileErrors, dspError])

  const widgetCompileState = useMemo((): WidgetCompileResult => {
    if (code === dspSource) {
      return {
        dspSource,
        sequences,
        miniRefs,
        timelineRefs,
        miniSourceMaps,
        analyserRefs,
        compressorRefs,
        lpRefs,
        slicerRefs,
        lfoRefs,
        everyRefs,
        euclidRefs,
        atRefs,
        arrayLiterals,
        branchMarks,
        numberParams,
        sampleDefs,
        errors: [],
      }
    }

    if (previewCompile.errors.length) {
      return {
        dspSource,
        sequences,
        miniRefs,
        timelineRefs,
        miniSourceMaps,
        analyserRefs,
        compressorRefs,
        lpRefs,
        slicerRefs,
        lfoRefs,
        everyRefs,
        atRefs,
        euclidRefs,
        arrayLiterals,
        branchMarks,
        numberParams,
        sampleDefs,
        errors: previewCompile.errors,
      }
    }

    const previewSequences = previewCompile.miniSequences ?? []
    const previewMiniSourceMaps: Array<Map<number, SourceLocation> | undefined> = previewSequences.map(s => {
      const compiled = compileMiniNotation(s)
      return buildMiniSourceMap(compiled.nodes, compiled.bytecode)
    })

    return {
      dspSource: code,
      sequences: previewSequences,
      miniRefs: previewCompile.miniRefs ?? [],
      timelineRefs: previewCompile.timelineRefs ?? [],
      miniSourceMaps: previewMiniSourceMaps,
      analyserRefs: previewCompile.analyserRefs ?? [],
      compressorRefs: previewCompile.compressorRefs ?? [],
      lpRefs: previewCompile.lpRefs ?? [],
      slicerRefs: previewCompile.slicerRefs ?? [],
      lfoRefs: previewCompile.lfoRefs ?? [],
      everyRefs: previewCompile.everyRefs ?? [],
      atRefs: previewCompile.atRefs ?? [],
      euclidRefs: previewCompile.euclidRefs ?? [],
      arrayLiterals: previewCompile.arrayLiterals ?? [],
      branchMarks: previewCompile.branchMarks ?? [],
      numberParams: previewCompile.numberParams ?? [],
      sampleDefs: previewCompile.sampleDefs ?? [],
      errors: [],
    }
  }, [
    code,
    dspSource,
    sequences,
    miniRefs,
    timelineRefs,
    miniSourceMaps,
    analyserRefs,
    compressorRefs,
    lpRefs,
    slicerRefs,
    lfoRefs,
    everyRefs,
    atRefs,
    euclidRefs,
    arrayLiterals,
    branchMarks,
    numberParams,
    sampleDefs,
    previewCompile,
  ])

  const timelineLabelsForView = useMemo(() => {
    if (code === dspSource) return timelineLabels
    if (hasCompileErrors) return timelineLabels

    const labelsExtracted = extractTimelineLabelsFromSource(code)
    if (labelsExtracted.errors.length) return timelineLabels

    const barsExtracted = extractBarsFromSource(code)
    if (barsExtracted.errors.length) return timelineLabels

    return buildTimelineLabels(labelsExtracted.labels, barsExtracted.bars)
  }, [code, dspSource, hasCompileErrors, timelineLabels])

  const barsForView = useMemo(() => {
    if (code === dspSource) return bars
    if (hasCompileErrors) return bars

    const extracted = extractBarsFromSource(code)
    if (extracted.errors.length) return bars
    return extracted.bars
  }, [bars, code, dspSource, hasCompileErrors])

  useEffect(() => {
    if (isUpdatingDsp || isProgramSwapPending) return
    setUiCompilePreview({
      source: widgetCompileState.dspSource,
      sequences: widgetCompileState.sequences,
      miniRefs: widgetCompileState.miniRefs,
      timelineRefs: widgetCompileState.timelineRefs,
      timelineLabels: timelineLabelsForView,
      bars: barsForView,
      miniSourceMaps: widgetCompileState.miniSourceMaps,
      analyserRefs: widgetCompileState.analyserRefs ?? [],
      compressorRefs: widgetCompileState.compressorRefs ?? [],
      lpRefs: widgetCompileState.lpRefs ?? [],
      slicerRefs: widgetCompileState.slicerRefs ?? [],
      lfoRefs: widgetCompileState.lfoRefs ?? [],
      everyRefs: widgetCompileState.everyRefs ?? [],
      atRefs: widgetCompileState.atRefs ?? [],
      euclidRefs: widgetCompileState.euclidRefs ?? [],
      arrayLiterals: widgetCompileState.arrayLiterals ?? [],
      branchMarks: widgetCompileState.branchMarks ?? [],
      numberParams: widgetCompileState.numberParams ?? [],
      sampleDefs: widgetCompileState.sampleDefs ?? [],
    })
  }, [
    barsForView,
    isProgramSwapPending,
    isUpdatingDsp,
    setUiCompilePreview,
    timelineLabelsForView,
    widgetCompileState,
  ])

  const isAwaitingSamples = useMemo(() => {
    if (hasCompileErrors) return false
    const defs = widgetCompileState.sampleDefs ?? []
    if (defs.length === 0) return false
    for (const d of defs) {
      if (loadedSamples[d.sampleIndex]?.url !== d.url) return true
    }
    return false
  }, [hasCompileErrors, loadedSamples, widgetCompileState.sampleDefs])

  const didRequestPreviewSamplesRef = useRef<{ loopId: string; source: string } | null>(null)
  useLayoutEffect(() => {
    if (!audioContext) return
    if (!isAwaitingSamples) return
    if (!code) return

    const loopId = currentLoop.data.id
    const prev = didRequestPreviewSamplesRef.current
    if (prev?.loopId === loopId && prev.source === code) return
    didRequestPreviewSamplesRef.current = { loopId, source: code }

    void preloadSamples(code)
  }, [audioContext, code, currentLoop.data.id, isAwaitingSamples, preloadSamples])

  const runtimeProgram = isProgramSwapPending ? program2 : program1

  const handleApply = async () => {
    if (!isProgramReady) return
    if (hasCompileErrors) return
    const requested = code
    try {
      onDspError(undefined)
      const target = previewTargetRef.current
      const vm: VmCompileSnapshot | undefined = target && previewCompile.errors.length === 0
        ? {
          source: requested,
          ops: new Int32Array(target.ops),
          literals: new Float32Array(target.literals),
          result: previewCompile,
        }
        : undefined
      await updateDspSource(requested, vm)
    }
    catch (err) {
      onDspError(err instanceof Error ? err.message : String(err))
    }
  }

  const isLive = isPlayingLoop && playbackState === 'running'

  useLayoutEffect(() => {
    if (currentLoop && currentLoop.data.code == null && code.length === 0) return
    if (!isLive) return
    void handleApply()
  }, [currentLoop, isProgramReady, isLive])

  useEffect(() => {
    if (!isProgramReady) return
    if (!currentLoop) return
    if (!isLive) return
    if (hasCompileErrors) return
    if (code === dspSource) return

    void handleApply()
  }, [code, currentLoop?.data.id, dspSource, hasCompileErrors, isProgramReady, isLive])

  const frameRef = useRef<Array<SeqFrame | undefined>>([])
  const controlStateRef = useRef<Map<number, SeqControlState>>(new Map())
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const lastPlayingLoopIdRef = useRef<string | null>(null)
  useEffect(() => {
    if (playingLoopId != null) lastPlayingLoopIdRef.current = playingLoopId
  }, [playingLoopId])

  const isLiveView = loopId != null && loopId === (playingLoopId ?? lastPlayingLoopIdRef.current)
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
    timelineLabels: timelineLabelsForView,
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
    timelineLabels: timelineLabelsForView,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    isLive,
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
    isLive,
    resetKey,
  })

  const { widgets: analyserWidgets, onBeforeDraw: onBeforeDrawAnalyser } = useAnalyserWidget({
    program1: runtimeProgram,
    ringPos,
    analyserRefs: widgetCompileState.analyserRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive: isLiveView,
    playbackState,
    sampleRate: audioContext?.sampleRate,
  })

  const { widgets: compressorWidgets, onBeforeDraw: onBeforeDrawCompressor } = useCompressorWidget({
    program1: runtimeProgram,
    ringPos,
    compressorRefs: widgetCompileState.compressorRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive,
    playbackState,
    sampleRate: audioContext?.sampleRate,
  })

  const { widgets: filterWidgets, onBeforeDraw: onBeforeDrawFilter } = useFilterWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    filterRefs: widgetCompileState.lpRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive,
    playbackState,
  })

  const { widgets: slicerWidgets, onBeforeDraw: onBeforeDrawSlicer } = useSlicerWidget({
    slicerRefs: widgetCompileState.slicerRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
  })

  const { widgets: lfoWidgets, onBeforeDraw: onBeforeDrawLfo } = useLfoWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    lfoRefs: widgetCompileState.lfoRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive,
    playbackState,
  })

  const { widgets: trigWidgets, onBeforeDraw: onBeforeDrawTrig } = useTrigWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    everyRefs: widgetCompileState.everyRefs,
    atRefs: widgetCompileState.atRefs,
    euclidRefs: widgetCompileState.euclidRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive,
    playbackState,
  })

  const { widgets: arrayAccessWidgets, onBeforeDraw: onBeforeDrawArrayAccess } = useArrayAccessWidget({
    program1: runtimeProgram,
    dspSource: widgetCompileState.dspSource,
    showWidgets: showWidgets && isPlayingLoop,
    arrayLiterals: widgetCompileState.arrayLiterals,
  })

  const { widgets: branchWidgets, onBeforeDraw: onBeforeDrawBranch } = useBranchWidget({
    program1: runtimeProgram,
    dspSource: widgetCompileState.dspSource,
    showWidgets: showWidgets && isPlayingLoop,
    branchMarks: widgetCompileState.branchMarks,
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

  const knobs = useMemo(() => {
    const out: KnobInfo[] = []

    for (const ref of widgetCompileState.compressorRefs ?? []) {
      for (const p of ref.knobParams ?? []) {
        if (p.name === 'attack') {
          out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length, value: p.value,
            min: 0.0001, max: 1, precision: 4, mode: 'exp2' })
        }
        else if (p.name === 'release') {
          out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length, value: p.value,
            min: 0.0001, max: 5, precision: 3, mode: 'exp2' })
        }
        else if (p.name === 'threshold') {
          out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length, value: p.value,
            min: -80, max: 0, precision: 0, mode: 'linear', stepPerPx: 0.15 })
        }
        else if (p.name === 'ratio') {
          out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length, value: p.value,
            min: 1, max: 20, precision: 2, mode: 'linear', stepPerPx: 0.05 })
        }
        else if (p.name === 'knee') {
          out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length, value: p.value,
            min: 0, max: 40, precision: 1, mode: 'linear', stepPerPx: 0.2 })
        }
      }
    }

    for (const ref of widgetCompileState.lpRefs ?? []) {
      for (const p of ref.knobParams ?? []) {
        if (p.name !== 'cutoff') continue
        out.push({
          line: p.valueLoc.line,
          column: p.valueLoc.column,
          length: p.valueLoc.length,
          value: p.value,
          min: 20,
          max: 20000,
          precision: 0,
          mode: 'exp2',
        })
      }
    }

    return out
  }, [widgetCompileState.compressorRefs, widgetCompileState.lpRefs])

  const { widgets: knobWidgets } = useKnobWidget({
    showWidgets,
    knobs,
    theme,
    codeFile: currentLoop?.codeFile,
  })

  const onBeforeDrawCombined = useCallback(() => {
    onBeforeDraw()
    onBeforeDrawPianoroll()
    onBeforeDrawTimeline()
    onBeforeDrawTimelineSequence()
    onBeforeDrawAnalyser()
    onBeforeDrawCompressor()
    onBeforeDrawFilter()
    onBeforeDrawSlicer()
    onBeforeDrawLfo()
    onBeforeDrawTrig()
    onBeforeDrawArrayAccess()
    onBeforeDrawBranch()
    onBeforeDrawSample()
  }, [
    onBeforeDraw,
    onBeforeDrawPianoroll,
    onBeforeDrawTimeline,
    onBeforeDrawTimelineSequence,
    onBeforeDrawAnalyser,
    onBeforeDrawCompressor,
    onBeforeDrawFilter,
    onBeforeDrawSlicer,
    onBeforeDrawLfo,
    onBeforeDrawTrig,
    onBeforeDrawArrayAccess,
    onBeforeDrawBranch,
    onBeforeDrawSample,
  ])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    return [
      ...sampleWidgets,
      ...analyserWidgets,
      ...compressorWidgets,
      ...filterWidgets,
      ...slicerWidgets,
      ...lfoWidgets,
      ...trigWidgets,
      ...timelineWidgets,
      ...timelineSequenceWidgets,
      ...pianorollWidgets,
      ...sequenceWidgets,
      ...arrayAccessWidgets,
      ...branchWidgets,
      ...sliderWidgets,
      ...knobWidgets,
    ]
  }, [showWidgets, analyserWidgets, timelineWidgets, timelineSequenceWidgets, pianorollWidgets, sequenceWidgets,
    arrayAccessWidgets, branchWidgets, sliderWidgets, sampleWidgets, compressorWidgets, filterWidgets, slicerWidgets,
    lfoWidgets, trigWidgets, knobWidgets, viewSampleCount])

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
      <div className="bg-gray-900 text-white text-sm w-full h-full">
        {headerErrorText.length > 0 && (
          <div className="absolute top-0 left-[37px] right-0 h-[40px] z-50">
            <div className="h-full w-full flex items-center gap-2 px-2 bg-[#f00a] border-b border-red-700 text-red-100">
              <button title="Copy error message" className="py-2 px-1" onClick={() => {
                navigator.clipboard.writeText(headerErrorText)
              }}>
                <CopyIcon weight="regular" size="16" />
              </button>
              <div className="shrink-0 text-md font-semibold">Error:</div>
              <div className="flex-1 overflow-x-auto overflow-y-hidden whitespace-nowrap text-md">
                {headerErrorText}
              </div>
            </div>
          </div>
        )}
        <CodeEditor
          key={codeEditorKey}
          codeFile={currentLoop?.codeFile}
          widgets={widgets}
          errors={editorErrors}
          header={timelineHeader}
          theme={theme}
          tokenizer={tokenizer}
          hideFunctionSignatures={!showFunctionDefinitions}
          functionDefinitions={functionDefinitions}
          isAnimating={true}
          gutter={true}
          onBeforeDraw={onBeforeDrawCombined}
        />
      </div>
      {(isAwaitingCode || isPreloadingSamples || isAwaitingSamples) && (
        <div className="absolute inset-0 z-40 pointer-events-none">
          <RadialGradient>
            <SpinnerLarge />
          </RadialGradient>
        </div>
      )}
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
