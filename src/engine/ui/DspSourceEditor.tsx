import { CopyIcon } from '@phosphor-icons/react'
import { CodeEditor, CodeFile, type EditorError, type EditorHeader, type EditorWidget } from 'mini-code'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
} from 'react'
import { LITERALS_COUNT, OPS_COUNT } from '../../../as/assembly/constants.ts'
import { useAppStore } from '../../app/store.ts'
import { RadialGradient } from '../../components/RadialGradient.tsx'
import { SpinnerLarge } from '../../components/Spinner.tsx'
import type { LangError } from '../../lang/errors.ts'
import { buildMiniSourceMap, type SourceLocation } from '../../lib/mini-source-map.ts'
import { compileMiniNotation } from '../../mini/compiler.ts'
import {
  encodeLangToVmOps,
  extractBarsFromSource,
  extractTimelineLabelsFromSource,
} from '../bytecode/bytecode.ts'
import { buildTimelineLabels } from '../dsp/timeline-labels.ts'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../store.ts'
import type { WidgetCompileResult } from '../types.ts'
import { functionDefinitions } from './function-definitions.ts'
import type { Loop } from './loop.ts'
import { useTheme } from './theme.ts'
import { tokenizer } from './tokenizer.ts'
import { useAnalyserWidget } from './useAnalyserWidget.ts'
import { useCompressorWidget } from './useCompressorWidget.ts'
import { useArrayAccessWidget } from './useArrayAccessWidget.ts'
import { useBranchWidget } from './useBranchWidget.ts'
import { useCodeFileValue } from './useCodeFileValue.ts'
import { useLoopView } from './useLoopView.ts'
import { useKnobWidget, type KnobInfo } from './useKnobWidget.ts'
import { usePianorollWidget } from './usePianorollWidget.ts'
import { useSampleWidget } from './useSampleWidget.ts'
import { type SeqControlState, type SeqFrame, useSequenceWidget } from './useSequenceWidget.ts'
import { useSliderWidget } from './useSliderWidget.ts'
import { useTimelineSequenceWidget } from './useTimelineSequenceWidget.ts'
import { useTimelineWidget } from './useTimelineWidget.ts'

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
  const hasHydrated = useAppStore(state => state.hasHydrated)
  const isLoopLoading = useAppStore(state => state.isLoopLoading)
  const isProgramReady = useEngineRuntimeStore(state => state.isProgramReady)
  const code = currentLoop?.codeFile.value ?? ''
  const isAwaitingCode = currentLoop != null && currentLoop.data.code == null && code.length === 0

  if (!hasHydrated || !isProgramReady || isLoopLoading || isAwaitingCode || !currentLoop) {
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
  const codeFileKeyByFileRef = useRef<WeakMap<CodeFile, string>>(new WeakMap())
  const nextCodeFileKeyRef = useRef(0)

  const previewTargetRef = useRef<{ ops: Int32Array; literals: Float32Array } | null>(null)
  if (!previewTargetRef.current) {
    previewTargetRef.current = {
      ops: new Int32Array(OPS_COUNT),
      literals: new Float32Array(LITERALS_COUNT),
    }
  }

  const {
    dspSource,
    updateDspSource,
    uiDspSource,
    uiSequences,
    uiMiniRefs,
    uiTimelineRefs,
    uiTimelineLabels,
    uiMiniSourceMaps,
    uiAnalyserRefs,
    uiCompressorRefs,
    uiArrayLiterals,
    uiBranchMarks,
    uiNumberParams,
    uiSampleDefs,
    isProgramSwapPending,
    isUpdatingDsp,
  } = useEngineDspStore()

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
  const loopId = currentLoop?.data.id ?? null
  const { globalSampleCount, isPlayingLoop, isPlaybackRunningForView, viewSampleCount } = useLoopView(loopId)

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
    if (code === uiDspSource) {
      return {
        dspSource: uiDspSource,
        sequences: uiSequences,
        miniRefs: uiMiniRefs,
        timelineRefs: uiTimelineRefs,
        miniSourceMaps: uiMiniSourceMaps,
        analyserRefs: uiAnalyserRefs,
        compressorRefs: uiCompressorRefs,
        arrayLiterals: uiArrayLiterals,
        branchMarks: uiBranchMarks,
        numberParams: uiNumberParams,
        sampleDefs: uiSampleDefs,
        errors: [],
      }
    }

    if (previewCompile.errors.length) {
      return {
        dspSource: uiDspSource,
        sequences: uiSequences,
        miniRefs: uiMiniRefs,
        timelineRefs: uiTimelineRefs,
        miniSourceMaps: uiMiniSourceMaps,
        analyserRefs: uiAnalyserRefs,
        compressorRefs: uiCompressorRefs,
        arrayLiterals: uiArrayLiterals,
        branchMarks: uiBranchMarks,
        numberParams: uiNumberParams,
        sampleDefs: uiSampleDefs,
        errors: previewCompile.errors,
      }
    }

    const sequences = previewCompile.miniSequences ?? []
    const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = sequences.map(s => {
      const compiled = compileMiniNotation(s)
      return buildMiniSourceMap(compiled.nodes, compiled.bytecode)
    })

    return {
      dspSource: code,
      sequences,
      miniRefs: previewCompile.miniRefs ?? [],
      timelineRefs: previewCompile.timelineRefs ?? [],
      miniSourceMaps,
      analyserRefs: previewCompile.analyserRefs ?? [],
      compressorRefs: previewCompile.compressorRefs ?? [],
      arrayLiterals: previewCompile.arrayLiterals ?? [],
      branchMarks: previewCompile.branchMarks ?? [],
      numberParams: previewCompile.numberParams ?? [],
      sampleDefs: previewCompile.sampleDefs ?? [],
      errors: [],
    }
  }, [
    code,
    previewCompile,
    uiDspSource,
    uiSequences,
    uiMiniRefs,
    uiTimelineRefs,
    uiMiniSourceMaps,
    uiAnalyserRefs,
    uiCompressorRefs,
    uiArrayLiterals,
    uiBranchMarks,
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

    useEngineDspStore.getState().setUiCompilePreview({
      source: code,
      sequences,
      miniRefs: result.miniRefs ?? [],
      timelineRefs: result.timelineRefs ?? [],
      timelineLabels,
      bars,
      miniSourceMaps,
      analyserRefs: result.analyserRefs ?? [],
      arrayLiterals: result.arrayLiterals ?? [],
      branchMarks: result.branchMarks ?? [],
      numberParams: result.numberParams ?? [],
      sampleDefs: result.sampleDefs ?? [],
    })
  }, [code, currentLoop, isPlayingLoop, uiDspSource])

  const handleApply = async () => {
    if (!isProgramReady) return
    if (hasCompileErrors) return
    const requested = code
    try {
      onDspError(undefined)
      await updateDspSource(requested)
    }
    catch (err) {
      onDspError(err instanceof Error ? err.message : String(err))
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
    if (hasCompileErrors) return
    if (code === dspSource) return

    void handleApply()
  }, [code, currentLoop?.data.id, dspSource, hasCompileErrors, isProgramReady, isPlayingLoop])

  const frameRef = useRef<Array<SeqFrame | undefined>>([])
  const controlStateRef = useRef<Map<number, SeqControlState>>(new Map())
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
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

  const { widgets: compressorWidgets, onBeforeDraw: onBeforeDrawCompressor } = useCompressorWidget({
    program1: runtimeProgram,
    ringPos,
    compressorRefs: widgetCompileState.compressorRefs,
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

  const compressorKnobs = useMemo(() => {
    const out: KnobInfo[] = []
    for (const ref of widgetCompileState.compressorRefs ?? []) {
      for (const p of ref.knobParams ?? []) {
        if (p.name === 'attack') out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length,
          value: p.value, min: 0.0001, max: 1, precision: 4, mode: 'exp2' })
        else if (p.name === 'release') out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length,
          value: p.value, min: 0.0001, max: 5, precision: 3, mode: 'exp2' })
        else if (p.name === 'threshold') out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length,
          value: p.value, min: -80, max: 0, precision: 0, mode: 'linear', stepPerPx: 0.15 })
        else if (p.name === 'ratio') out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length,
          value: p.value, min: 1, max: 20, precision: 2, mode: 'linear', stepPerPx: 0.05 })
        else if (p.name === 'knee') out.push({ line: p.valueLoc.line, column: p.valueLoc.column, length: p.valueLoc.length,
          value: p.value, min: 0, max: 40, precision: 1, mode: 'linear', stepPerPx: 0.2 })
      }
    }
    return out
  }, [widgetCompileState.compressorRefs])

  const { widgets: knobWidgets } = useKnobWidget({
    showWidgets,
    knobs: compressorKnobs,
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
    arrayAccessWidgets, branchWidgets, sliderWidgets, sampleWidgets, compressorWidgets, knobWidgets, viewSampleCount])

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
