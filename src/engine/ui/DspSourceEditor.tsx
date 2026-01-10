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
  getKnobConfig,
  getKnobParamConfig,
} from '../bytecode/bytecode.ts'
import type { TimelineLabel } from '../bytecode/bytecode.ts'
import { KEYWORDS } from '../constants.ts'
import type { VmCompileSnapshot } from '../dsp/program.ts'
import { buildTimelineLabels } from '../dsp/timeline-labels.ts'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import type { WidgetCompileResult } from '../types.ts'
import { functionDefinitions } from './function-definitions.ts'
import type { GridOwner, GridOwnerByLine } from './grid-owner.ts'
import type { Loop } from './loop.ts'
import { useRouter } from './router.tsx'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { useBranchWidget } from './useBranchWidget.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useCompressorWidget } from './useCompressorWidget.ts'
import { useEnvelopeWidget } from './useEnvelopeWidget.ts'
import { useFilterWidget } from './useFilterWidget.ts'
import { useIsEditorBusy } from './useIsEditorBusy.ts'
import { type KnobInfo, useKnobWidget } from './useKnobWidget.ts'
import { useLfoWidget } from './useLfoWidget.ts'
import { useLoopView } from './useLoopView.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { usePlayingState } from './usePlayingState.ts'
import { useRestartLoop } from './useRestartLoop.tsx'
import { useReverbWidget } from './useReverbWidget.ts'
import { useSampleWidget } from './useSampleWidget.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'
import { useSlicerWidget } from './useSlicerWidget.ts'
import { useSliderWidget } from './useSliderWidget.ts'
import { useTimelineSequenceWidget } from './useTimelineSequenceWidget.ts'
import { useTimelineWidget } from './useTimelineWidget.ts'
import { useTramWidget } from './useTramWidget.ts'
import { useTrigWidget } from './useTrigWidget.ts'
import { useVisualizerBackground } from './useVisualizerBackground.ts'

export function DspSourceEditor(
  {
    timelineHeader,
    currentLoop,
    dspError,
    onDspError,
    docsIsOpen,
  }: {
    timelineHeader: EditorHeader
    currentLoop: Loop | null
    dspError: string | undefined
    onDspError: (error: string | undefined) => void
    docsIsOpen: boolean
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
      docsIsOpen={docsIsOpen}
    />
  )
}

function DspSourceEditorReady(
  {
    timelineHeader,
    currentLoop,
    dspError,
    onDspError,
    docsIsOpen,
  }: {
    timelineHeader: EditorHeader
    currentLoop: Loop
    dspError: string | undefined
    onDspError: (error: string | undefined) => void
    docsIsOpen: boolean
  },
) {
  const { navigate } = useRouter()
  const codeFileKeyByFileRef = useRef<WeakMap<CodeFile, string>>(new WeakMap())
  const nextCodeFileKeyRef = useRef(0)

  const previewTargetRef = useRef<{ ops: Int32Array; literals: Float32Array } | null>(null)

  // Local refs for predicted sample count calculation
  const predictedSampleCountResultRef = useRef<ReturnType<typeof updatePredictedSampleCount>>(null)
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)
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
  const miniPlayBars = useEngineDspStore(state => state.miniPlayBars)
  const timelineRefs = useEngineDspStore(state => state.timelineRefs)
  const timelineLabels = useEngineDspStore(state => state.timelineLabels)
  const bars = useEngineDspStore(state => state.bars)
  const miniSourceMaps = useEngineDspStore(state => state.miniSourceMaps)
  const adRefs = useEngineDspStore(state => state.uiAdRefs)
  const adsrRefs = useEngineDspStore(state => state.uiAdsrRefs)
  const envfollowRefs = useEngineDspStore(state => state.uiEnvfollowRefs)
  const slewRefs = useEngineDspStore(state => state.uiSlewRefs)
  const analyserRefs = useEngineDspStore(state => state.analyserRefs)
  const compressorRefs = useEngineDspStore(state => state.compressorRefs)
  const expanderRefs = useEngineDspStore(state => state.expanderRefs)
  const gateRefs = useEngineDspStore(state => state.gateRefs)
  const limiterRefs = useEngineDspStore(state => state.limiterRefs)
  const filterRefs = useEngineDspStore(state => state.filterRefs)
  const reverbRefs = useEngineDspStore(state => state.reverbRefs)
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
  const restartLoop = useRestartLoop()
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const program1 = useEngineRuntimeStore(state => state.program1)
  const program2 = useEngineRuntimeStore(state => state.program2)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const bpmValue = useEngineRuntimeStore(state => state.bpmValue)
  const ringPos = useEngineRuntimeStore(state => state.ringPos)
  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const setPredictedSampleCountResult = useEngineRuntimeStore(state => state.setPredictedSampleCountResult)
  const showFunctionDefinitions = useEngineUiStore(state => state.showFunctionDefinitions)
  const showFunctionDefinitionsHover = useEngineUiStore(state => state.showFunctionDefinitionsHover)
  const uiShowWidgets = useEngineUiStore(state => state.showWidgets)
  const showVisualizer = useEngineUiStore(state => state.showVisualizer)
  const wordWrap = useEngineUiStore(state => state.wordWrap)

  const theme = useTheme()
  const themeForEditor = useMemo(() => {
    const withAlpha = (c: string, a: number): string => {
      if (!c.startsWith('#')) return c
      const h = c.slice(1)
      const toByte = (x: string) => parseInt(x, 16)
      let r = 0
      let g = 0
      let b = 0
      if (h.length === 3) {
        r = toByte(h[0]! + h[0]!)
        g = toByte(h[1]! + h[1]!)
        b = toByte(h[2]! + h[2]!)
      }
      else if (h.length === 6) {
        r = toByte(h.slice(0, 2))
        g = toByte(h.slice(2, 4))
        b = toByte(h.slice(4, 6))
      }
      else {
        return c
      }
      return `rgba(${r}, ${g}, ${b}, ${a})`
    }
    return {
      ...theme,
      background: withAlpha(theme.background, 0.55),
      gutterBackground: withAlpha(theme.gutterBackground, 0.35),
    }
  }, [theme])
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
  const { globalSampleCount, isPlayingLoop, isPlaybackRunningForView } = usePlayingState(loopId)

  // Prevent loop switching while another loop is playing from temporarily "driving" the entire UI
  // using the previous loop's predicted sample count.
  const predictedResetRef = useRef<{ key: string }>({ key: '' })
  const predictedResetKey = `${loopId ?? ''}:${isPlaybackRunningForView ? 'live' : 'view'}`
  if (predictedResetRef.current.key !== predictedResetKey) {
    predictedResetRef.current.key = predictedResetKey
    predictedSampleCountResultRef.current = null
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
  }

  useLayoutEffect(() => {
    predictedSampleCountResultRef.current = null
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true

    if (!audioContext || !globalSampleCount) {
      setPredictedSampleCountResult(null)
      return
    }

    const sampleRate = audioContext.sampleRate
    const sampleCount = (Atomics.load(globalSampleCount, 0) >>> 0) as number
    setPredictedSampleCountResult({
      latencySamples: 0,
      latencySeconds: 0,
      deltaTime: 0,
      sampleRate,
      sampleCount,
      timeSeconds: sampleRate > 0 ? (sampleCount / sampleRate) : 0,
    })
  }, [audioContext, globalSampleCount, loopId, setPredictedSampleCountResult])

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

  const lastGoodPreviewRef = useRef<{
    widgetCompileState: WidgetCompileResult
    timelineLabelsForView: TimelineLabel[]
    barsForView: number | undefined
  } | null>(null)

  useEffect(() => {
    if (!loopId) return
    lastGoodPreviewRef.current = null
  }, [loopId])

  const showWidgets = uiShowWidgets && (
    currentLoop != null && (code.length > 0 || dspSource.length > 0)
    || isUpdatingDsp
    || hasCompileErrors
  )

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
        miniPlayBars,
        tramRefs: previewCompile.tramRefs ?? [],
        timelineRefs,
        miniSourceMaps,
        adRefs,
        adsrRefs,
        envfollowRefs,
        slewRefs,
        analyserRefs: previewCompile.analyserRefs ?? analyserRefs,
        compressorRefs: previewCompile.compressorRefs ?? compressorRefs,
        expanderRefs: previewCompile.expanderRefs ?? expanderRefs,
        gateRefs: previewCompile.gateRefs ?? gateRefs,
        limiterRefs: previewCompile.limiterRefs ?? limiterRefs,
        filterRefs: previewCompile.filterRefs ?? filterRefs,
        reverbRefs: previewCompile.reverbRefs ?? reverbRefs,
        slicerRefs: previewCompile.slicerRefs ?? slicerRefs,
        lfoRefs: previewCompile.lfoRefs ?? lfoRefs,
        everyRefs: previewCompile.everyRefs ?? everyRefs,
        euclidRefs: previewCompile.euclidRefs ?? euclidRefs,
        atRefs: previewCompile.atRefs ?? atRefs,
        arrayLiterals: previewCompile.arrayLiterals ?? arrayLiterals,
        branchMarks: previewCompile.branchMarks ?? branchMarks,
        numberParams: previewCompile.numberParams ?? numberParams,
        sampleDefs: previewCompile.sampleDefs ?? sampleDefs,
        errors: [],
      }
    }

    if (previewCompile.errors.length) {
      const prev = lastGoodPreviewRef.current?.widgetCompileState
      if (prev) return { ...prev, errors: previewCompile.errors }
      return {
        dspSource,
        sequences,
        miniRefs,
        miniPlayBars,
        tramRefs: previewCompile.tramRefs ?? [],
        timelineRefs,
        miniSourceMaps,
        adRefs,
        adsrRefs,
        envfollowRefs,
        slewRefs,
        analyserRefs,
        compressorRefs,
        expanderRefs,
        gateRefs,
        limiterRefs,
        filterRefs,
        reverbRefs,
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
      const scaleIndex = previewCompile.scale
      const compiled = compileMiniNotation(s, scaleIndex === undefined ? {} : { defaultScale: { scaleIndex } })
      return buildMiniSourceMap(s, compiled.nodes, compiled.bytecode)
    })

    return {
      dspSource: code,
      sequences: previewSequences,
      miniRefs: previewCompile.miniRefs ?? [],
      miniPlayBars: previewCompile.miniPlayBars ?? [],
      tramRefs: previewCompile.tramRefs ?? [],
      timelineRefs: previewCompile.timelineRefs ?? [],
      miniSourceMaps: previewMiniSourceMaps,
      adRefs: previewCompile.adRefs ?? adRefs,
      adsrRefs: previewCompile.adsrRefs ?? adsrRefs,
      envfollowRefs: previewCompile.envfollowRefs ?? envfollowRefs,
      slewRefs: previewCompile.slewRefs ?? slewRefs,
      analyserRefs: previewCompile.analyserRefs ?? [],
      compressorRefs: previewCompile.compressorRefs ?? [],
      expanderRefs: previewCompile.expanderRefs ?? [],
      gateRefs: previewCompile.gateRefs ?? [],
      limiterRefs: previewCompile.limiterRefs ?? [],
      filterRefs: previewCompile.filterRefs ?? [],
      reverbRefs: previewCompile.reverbRefs ?? reverbRefs,
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
    expanderRefs,
    gateRefs,
    filterRefs,
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

  const earlyDataForView = useMemo(() => {
    // Reuse early-data computed in `previewCompile` (via `encodeLangToVmOps`).
    if (code === dspSource || hasCompileErrors) return { timelineLabels, bars }

    const previewBars = previewCompile.bars
    const previewLabels = previewCompile.timelineLabels ?? []
    return {
      timelineLabels: buildTimelineLabels(previewLabels, previewBars),
      bars: previewBars,
    }
  }, [
    bars,
    code,
    dspSource,
    hasCompileErrors,
    previewCompile.bars,
    previewCompile.timelineLabels,
    timelineLabels,
  ])

  const timelineLabelsForView = useMemo(() => {
    if (code === dspSource) return timelineLabels
    if (hasCompileErrors) return lastGoodPreviewRef.current?.timelineLabelsForView ?? timelineLabels
    return earlyDataForView.timelineLabels
  }, [code, dspSource, earlyDataForView.timelineLabels, hasCompileErrors, timelineLabels])

  const barsForView = useMemo(() => {
    if (code === dspSource) return bars
    if (hasCompileErrors) return lastGoodPreviewRef.current?.barsForView ?? bars
    return earlyDataForView.bars
  }, [bars, code, dspSource, earlyDataForView.bars, hasCompileErrors])

  useEffect(() => {
    if (code === dspSource) return
    if (hasCompileErrors) return
    lastGoodPreviewRef.current = {
      widgetCompileState,
      timelineLabelsForView,
      barsForView,
    }
  }, [barsForView, code, dspSource, hasCompileErrors, timelineLabelsForView, widgetCompileState])

  useEffect(() => {
    if (isUpdatingDsp || isProgramSwapPending) return
    setUiCompilePreview({
      source: widgetCompileState.dspSource,
      sequences: widgetCompileState.sequences,
      miniRefs: widgetCompileState.miniRefs,
      miniPlayBars: widgetCompileState.miniPlayBars,
      timelineRefs: widgetCompileState.timelineRefs,
      timelineLabels: timelineLabelsForView,
      bars: barsForView,
      miniSourceMaps: widgetCompileState.miniSourceMaps,
      analyserRefs: widgetCompileState.analyserRefs ?? [],
      compressorRefs: widgetCompileState.compressorRefs ?? [],
      expanderRefs: widgetCompileState.expanderRefs ?? [],
      gateRefs: widgetCompileState.gateRefs ?? [],
      filterRefs: widgetCompileState.filterRefs ?? [],
      reverbRefs: widgetCompileState.reverbRefs ?? [],
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
      if (d.provider !== 'freesound') continue
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

  const gridOwnerByLine = useMemo((): GridOwnerByLine => {
    const byLine = new Map<number, GridOwner>()
    const consider = (owner: GridOwner) => {
      const existing = byLine.get(owner.line)
      if (!existing || owner.column < existing.column) byLine.set(owner.line, owner)
    }

    for (const ref of widgetCompileState.timelineRefs ?? []) {
      consider({
        kind: 'timeline',
        seqIndex: ref.seqIndex,
        line: ref.loc.line,
        column: ref.loc.column,
        length: ref.loc.length,
      })
    }

    for (const ref of widgetCompileState.miniRefs ?? []) {
      consider({
        kind: 'pianoroll',
        seqIndex: ref.seqIndex,
        line: ref.loc.line,
        column: ref.loc.column,
        length: ref.loc.length,
      })
    }

    return byLine
  }, [widgetCompileState.miniRefs, widgetCompileState.timelineRefs])

  const { widgets: sequenceWidgets, onBeforeDraw } = useSequenceWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    sequences: widgetCompileState.sequences,
    miniSourceMaps: widgetCompileState.miniSourceMaps,
    miniRefs: widgetCompileState.miniRefs,
    miniPlayBars: widgetCompileState.miniPlayBars,
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
    miniPlayBars: widgetCompileState.miniPlayBars,
    timelineLabels: timelineLabelsForView,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    resetKey,
    gridOwnerByLine,
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
    gridOwnerByLine,
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

  const { widgets: tramWidgets, onBeforeDraw: onBeforeDrawTram } = useTramWidget({
    audioContext,
    bpmValue,
    globalSampleCount,
    tramRefs: widgetCompileState.tramRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
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
    expanderRefs: widgetCompileState.expanderRefs,
    gateRefs: widgetCompileState.gateRefs,
    limiterRefs: widgetCompileState.limiterRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive: isLiveView,
    playbackState,
    sampleRate: audioContext?.sampleRate,
  })

  const { widgets: filterWidgets, onBeforeDraw: onBeforeDrawFilter } = useFilterWidget({
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    filterRefs: widgetCompileState.filterRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive,
    playbackState,
  })

  const { widgets: reverbWidgets, onBeforeDraw: onBeforeDrawReverb } = useReverbWidget({
    program1: runtimeProgram,
    reverbRefs: widgetCompileState.reverbRefs,
    showWidgets,
    isLive,
    playbackState,
  })

  const { widgets: slicerWidgets, onBeforeDraw: onBeforeDrawSlicer } = useSlicerWidget({
    slicerRefs: widgetCompileState.slicerRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    program1: runtimeProgram,
    audioContext,
    globalSampleCount,
    sampleDefs: widgetCompileState.sampleDefs,
    playbackState,
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

  const { widgets: envelopeWidgets, onBeforeDraw: onBeforeDrawEnvelope } = useEnvelopeWidget({
    program1: runtimeProgram,
    adRefs: widgetCompileState.adRefs,
    adsrRefs: widgetCompileState.adsrRefs,
    envfollowRefs: widgetCompileState.envfollowRefs,
    slewRefs: widgetCompileState.slewRefs,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive,
    playbackState,
  })

  const { knobs, knobLocKeys } = useMemo(() => {
    const out: KnobInfo[] = []
    const knobLocKeys = new Set<string>()

    const addKnobsFromRef = (ref: any) => {
      const functionName = String(ref?.functionName ?? '')
      if (!functionName) return
      const config = getKnobConfig(functionName)
      if (!config) return
      for (const p of ref?.knobParams ?? []) {
        const param = getKnobParamConfig(config, String(p?.name ?? ''))
        if (!param) continue
        const loc = p?.valueLoc
        if (!loc) continue
        // Don't key on `length`: the slider extractor and knob extractor can disagree on span
        // (e.g. unary '-' or formatting), which would cause duplicates (slider + knob).
        knobLocKeys.add(`${loc.line}:${loc.column}`)
        out.push({
          line: loc.line,
          column: loc.column,
          length: loc.length,
          value: Number(p?.value ?? 0),
          min: param.min,
          max: param.max,
          precision: param.precision,
          mode: param.mode,
          stepPerPx: param.stepPerPx,
        })
      }
    }

    // Knobs only appear for params that are explicitly present in the code (ref.knobParams),
    // but their UI ranges/precision come from `knob-config.ts`.
    const refs: any[] = [
      ...(widgetCompileState.compressorRefs ?? []),
      ...(widgetCompileState.expanderRefs ?? []),
      ...(widgetCompileState.gateRefs ?? []),
      ...(widgetCompileState.limiterRefs ?? []),
      ...(widgetCompileState.filterRefs ?? []),
      ...(widgetCompileState.reverbRefs ?? []),
      ...(widgetCompileState.lfoRefs ?? []),
      ...(widgetCompileState.adRefs ?? []),
      ...(widgetCompileState.adsrRefs ?? []),
      ...(widgetCompileState.envfollowRefs ?? []),
      ...(widgetCompileState.slewRefs ?? []),
    ]
    for (const ref of refs) addKnobsFromRef(ref)

    return { knobs: out, knobLocKeys }
  }, [
    widgetCompileState.compressorRefs,
    widgetCompileState.expanderRefs,
    widgetCompileState.gateRefs,
    widgetCompileState.limiterRefs,
    widgetCompileState.filterRefs,
    widgetCompileState.reverbRefs,
    widgetCompileState.lfoRefs,
    widgetCompileState.adRefs,
    widgetCompileState.adsrRefs,
    widgetCompileState.envfollowRefs,
    widgetCompileState.slewRefs,
  ])

  const { widgets: knobWidgets } = useKnobWidget({
    showWidgets,
    knobs,
    theme,
    codeFile: currentLoop?.codeFile,
  })

  const sliderNumberParams = useMemo(() => {
    const params = widgetCompileState.numberParams ?? []
    if (params.length === 0) return params
    if (knobLocKeys.size === 0) return params
    return params.filter(p => !knobLocKeys.has(`${p.line}:${p.column}`))
  }, [knobLocKeys, widgetCompileState.numberParams])

  const { widgets: sliderWidgets } = useSliderWidget({
    showWidgets,
    numberParams: sliderNumberParams,
    theme,
    codeFile: currentLoop?.codeFile,
  })

  const { canvasRef: lissajousCanvasRef, onBeforeDraw: onBeforeDrawLissajous } = useVisualizerBackground({
    program1: runtimeProgram,
    ringPos,
    isLive: isLiveView && playbackState === 'running' && showVisualizer,
    sampleRate: audioContext?.sampleRate,
    pointStride: 1,
    vertex: previewCompile.visualizerVertex,
    fragment: previewCompile.visualizerFragment,
  })

  const onBeforeDrawCombined = useCallback(() => {
    const runtimeLoopId = useEngineRuntimeStore.getState().currentLoopId
    if (runtimeLoopId !== loopId) return

    // Update predicted sample count once for all widgets to use
    const result = updatePredictedSampleCount(
      audioContext,
      globalSampleCount,
      {
        predictedSampleCountRef,
        lastWallTimeRef,
        isFirstFrameRef,
      },
      { isPlaying: isPlaybackRunningForView },
    )
    const runtimeLoopIdAfter = useEngineRuntimeStore.getState().currentLoopId
    if (runtimeLoopIdAfter !== loopId) return
    predictedSampleCountResultRef.current = result
    setPredictedSampleCountResult(result)

    if (showVisualizer) onBeforeDrawLissajous()
    onBeforeDraw()
    onBeforeDrawPianoroll()
    onBeforeDrawTimeline()
    onBeforeDrawTimelineSequence()
    onBeforeDrawTram()
    onBeforeDrawAnalyser()
    onBeforeDrawCompressor()
    onBeforeDrawEnvelope()
    onBeforeDrawFilter()
    onBeforeDrawReverb()
    onBeforeDrawSlicer()
    onBeforeDrawLfo()
    onBeforeDrawTrig()
    onBeforeDrawArrayAccess()
    onBeforeDrawBranch()
    onBeforeDrawSample()
  }, [
    showVisualizer,
    onBeforeDrawLissajous,
    onBeforeDraw,
    onBeforeDrawPianoroll,
    onBeforeDrawTimeline,
    onBeforeDrawTimelineSequence,
    onBeforeDrawTram,
    onBeforeDrawAnalyser,
    onBeforeDrawCompressor,
    onBeforeDrawEnvelope,
    onBeforeDrawFilter,
    onBeforeDrawReverb,
    onBeforeDrawSlicer,
    onBeforeDrawLfo,
    onBeforeDrawTrig,
    onBeforeDrawArrayAccess,
    onBeforeDrawBranch,
    onBeforeDrawSample,
    audioContext,
    globalSampleCount,
    isPlaybackRunningForView,
    loopId,
  ])

  const widgets = useMemo((): EditorWidget[] => {
    if (!showWidgets) return []
    return [
      ...sampleWidgets,
      ...analyserWidgets,
      ...compressorWidgets,
      ...envelopeWidgets,
      ...filterWidgets,
      ...reverbWidgets,
      ...slicerWidgets,
      ...lfoWidgets,
      ...trigWidgets,
      ...timelineWidgets,
      ...timelineSequenceWidgets,
      ...tramWidgets,
      ...pianorollWidgets,
      ...sequenceWidgets,
      ...arrayAccessWidgets,
      ...branchWidgets,
      ...sliderWidgets,
      ...knobWidgets,
    ]
  }, [showWidgets, envelopeWidgets, analyserWidgets, timelineWidgets, timelineSequenceWidgets, pianorollWidgets,
    tramWidgets, sequenceWidgets, arrayAccessWidgets, branchWidgets, sliderWidgets, sampleWidgets, compressorWidgets,
    filterWidgets, reverbWidgets, slicerWidgets, lfoWidgets, trigWidgets, knobWidgets])

  const codeEditorKey = useMemo(() => {
    const codeFile = currentLoop?.codeFile
    if (!codeFile) return '<none>'
    const existing = codeFileKeyByFileRef.current.get(codeFile)
    if (existing) return existing
    const next = String(++nextCodeFileKeyRef.current)
    codeFileKeyByFileRef.current.set(codeFile, next)
    return next
  }, [currentLoop?.codeFile])

  const didSeeCodeRef = useRef<{ key: string; did: boolean }>({ key: '', did: false })
  if (didSeeCodeRef.current.key !== codeEditorKey) {
    didSeeCodeRef.current = { key: codeEditorKey, did: false }
  }
  if (!didSeeCodeRef.current.did && code.length > 0) {
    didSeeCodeRef.current.did = true
  }

  const editorGateRef = useRef<{ key: string; allow: boolean }>({ key: '', allow: false })
  if (editorGateRef.current.key !== codeEditorKey) {
    editorGateRef.current = { key: codeEditorKey, allow: false }
  }

  const isBootingCode = isAwaitingCode && !didSeeCodeRef.current.did
  const hasSavedScroll = currentLoop.codeFile.scrollX !== 0 || currentLoop.codeFile.scrollY !== 0
  const expectsWidgets = showWidgets && (
    (widgetCompileState.adRefs?.length ?? 0) > 0
    || (widgetCompileState.adsrRefs?.length ?? 0) > 0
    || (widgetCompileState.envfollowRefs?.length ?? 0) > 0
    || (widgetCompileState.slewRefs?.length ?? 0) > 0
    || (widgetCompileState.sampleDefs?.length ?? 0) > 0
    || (widgetCompileState.analyserRefs?.length ?? 0) > 0
    || (widgetCompileState.compressorRefs?.length ?? 0) > 0
    || (widgetCompileState.expanderRefs?.length ?? 0) > 0
    || (widgetCompileState.gateRefs?.length ?? 0) > 0
    || (widgetCompileState.limiterRefs?.length ?? 0) > 0
    || (widgetCompileState.filterRefs?.length ?? 0) > 0
    || (widgetCompileState.slicerRefs?.length ?? 0) > 0
    || (widgetCompileState.lfoRefs?.length ?? 0) > 0
    || (widgetCompileState.everyRefs?.length ?? 0) > 0
    || (widgetCompileState.atRefs?.length ?? 0) > 0
    || (widgetCompileState.euclidRefs?.length ?? 0) > 0
    || (widgetCompileState.arrayLiterals?.length ?? 0) > 0
    || (widgetCompileState.branchMarks?.length ?? 0) > 0
    || (widgetCompileState.timelineRefs?.length ?? 0) > 0
    || (widgetCompileState.sequences?.length ?? 0) > 0
    || (widgetCompileState.tramRefs?.length ?? 0) > 0
    || (widgetCompileState.numberParams?.length ?? 0) > 0
    || knobs.length > 0
  )

  const shouldDelayEditorMount = !editorGateRef.current.allow
    && hasSavedScroll
    && !hasCompileErrors
    && !dspError
    && (isBootingCode || (expectsWidgets && widgets.length === 0))

  if (!editorGateRef.current.allow && !shouldDelayEditorMount) {
    editorGateRef.current.allow = true
  }

  const showEditor = editorGateRef.current.allow

  const handleKeyDown = useCallback((e: KeyboardEvent | preact.TargetedKeyboardEvent<HTMLTextAreaElement>) => {
    e.stopPropagation()
    const metaKey = e.ctrlKey || e.metaKey
    if (e.key === 'r' && metaKey) {
      return false
    }
    if (e.key === ' ' && metaKey) {
      // Don't handle keyboard shortcuts when docs are open
      if (docsIsOpen) {
        return true
      }

      const runtime = useEngineRuntimeStore.getState()
      const isSameLoop = runtime.playingLoopId === currentLoop?.data.id
      if (runtime.playbackState === 'running' && isSameLoop) {
        if (!e.altKey) runtime.pause()
        else void restartLoop()
      }
      else {
        ;(async () => {
          if (e.altKey && isSameLoop) {
            await restartLoop()
          }
          if (!runtime.playingLoopId || !isSameLoop) {
            void useEngineDspStore.getState().playLoop(currentLoop.data.id, currentLoop.codeFile.value,
              e.altKey || !runtime.playingLoopId ? 0 : undefined)
          }
          else {
            void useEngineDspStore.getState().playLoop(currentLoop.data.id, currentLoop.codeFile.value, undefined)
          }
        })()
      }
      return false
    }
    return true
  }, [currentLoop, docsIsOpen, restartLoop])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [handleKeyDown])

  return (
    <div className="flex flex-row gap-2 w-full h-full relative">
      {showVisualizer && (
        <canvas
          ref={lissajousCanvasRef}
          className="absolute inset-0 w-full h-full pointer-events-none z-0"
          aria-hidden="true"
        />
      )}
      <div className="text-white text-sm w-full h-full">
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
        {showEditor && (
          <CodeEditor
            key={codeEditorKey}
            codeFile={currentLoop?.codeFile}
            widgets={widgets}
            errors={editorErrors}
            header={timelineHeader}
            theme={themeForEditor}
            tokenizer={tokenizer}
            keywords={KEYWORDS}
            hideFunctionSignatures={!showFunctionDefinitions}
            hideHoverFunctionSignatures={!showFunctionDefinitionsHover}
            functionDefinitions={functionDefinitions}
            isAnimating={true}
            gutter={true}
            wordWrap={wordWrap}
            keyOverride={handleKeyDown}
            onBeforeDraw={onBeforeDrawCombined}
          />
        )}
      </div>
      {(isBootingCode || isPreloadingSamples || isAwaitingSamples || !showEditor) && !hasCompileErrors && !dspError && (
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
