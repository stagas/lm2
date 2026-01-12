import { PauseIcon, PlayIcon, StopIcon } from '@phosphor-icons/react'
import { CodeEditor, CodeFile, type EditorError, type EditorHeader, type EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'preact/hooks'

// Global registry of InlineEditors for keyboard shortcut access
export const inlineEditorRegistry = new Map<string, { play: () => void; stop: () => void }>()
import { LITERALS_COUNT, OPS_COUNT } from '../../../../as/assembly/constants.ts'
import { buildMiniSourceMap, type SourceLocation } from '../../../lib/mini-source-map.ts'
import { compileMiniNotation } from '../../../mini/compiler.ts'
import { encodeLangToVmOps, extractEarlyDataFromSource, getKnobConfig,
  getKnobParamConfig } from '../../bytecode/bytecode.ts'
import { KEYWORDS } from '../../constants.ts'
import type { VmCompileSnapshot } from '../../dsp/program.ts'
import { buildTimelineLabels } from '../../dsp/timeline-labels.ts'
import { useEngineDspStore, useEngineRuntimeStore, useEngineUiStore } from '../../store.ts'
import { functionDefinitions } from '../function-definitions.ts'
import type { GridOwner, GridOwnerByLine } from '../grid-owner.ts'
import { useTheme } from '../theme.ts'
import { tokenizer } from '../tokenizer.ts'
import { updatePredictedSampleCount } from '../update-predicted-sample-count.ts'
import { useAnalyserWidget } from '../useAnalyserWidget.ts'
import { useArrayAccessWidget } from '../useArrayAccessWidget.ts'
import { useBranchWidget } from '../useBranchWidget.ts'
import { useCodeFileValue } from '../useCodeFileValue.ts'
import { useCompressorWidget } from '../useCompressorWidget.ts'
import { useEnvelopeWidget } from '../useEnvelopeWidget.ts'
import { useFilterWidget } from '../useFilterWidget.ts'
import { type KnobInfo, useKnobWidget } from '../useKnobWidget.ts'
import { useLfoWidget } from '../useLfoWidget.ts'
import { usePianorollWidget } from '../usePianorollWidget.ts'
import { usePlayingState } from '../usePlayingState.ts'
import { useReverbWidget } from '../useReverbWidget.ts'
import { useSampleWidget } from '../useSampleWidget.ts'
import { useSequenceWidget } from '../useSequenceWidget.ts'
import { useSlicerWidget } from '../useSlicerWidget.ts'
import { useSliderWidget } from '../useSliderWidget.ts'
import { useTimelineSequenceWidget } from '../useTimelineSequenceWidget.ts'
import { useTimelineWidget } from '../useTimelineWidget.ts'
import { useTramWidget } from '../useTramWidget.ts'
import { useTrigWidget } from '../useTrigWidget.ts'

type InlineEditorProps = {
  id: string
  initialCode: string
  onPlayRequest?: () => void
  autoHeight?: boolean
  hidePlayButton?: boolean
  header?: EditorHeader
  noMargin?: boolean
}

const inlineHeader: EditorHeader = {
  height: 0,
  pointerDown: () => {},
  pointerMove: () => {},
  pointerUp: () => {},
  render: () => {},
}

type LastSuccessfulCompile = {
  code: string
  preview: ReturnType<typeof encodeLangToVmOps>
  ops: Int32Array
  literals: Float32Array
}

function lineStarts(src: string): number[] {
  const out = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') out.push(i + 1)
  }
  return out
}

function normalizeSourceWithRanges(src: string, ranges: Array<{ start: number; end: number }>): string {
  if (ranges.length === 0) return src
  const sorted = [...ranges].sort((a, b) => a.start - b.start)
  let out = ''
  let pos = 0
  for (const r of sorted) {
    out += src.slice(pos, r.start)
    out += '#'.repeat(Math.max(0, r.end - r.start))
    pos = r.end
  }
  out += src.slice(pos)
  return out
}

function readNumberAt(
  src: string,
  starts: number[],
  info: { line: number; column: number; length: number },
): { value: number; range: { start: number; end: number } } | null {
  const lineStart = starts[info.line - 1]
  if (lineStart === undefined) return null
  const start = lineStart + (info.column - 1)
  const end = start + Math.max(1, info.length)
  if (start < 0 || end > src.length) return null

  const token = src.slice(start, end)
  const match = token.match(/^-?\d*\.?\d*k?/)
  const raw = match?.[0] ?? ''
  if (!raw) return null
  const value = Number.parseFloat(raw.replace('k', '')) * (raw.includes('k') ? 1000 : 1)
  if (!Number.isFinite(value)) return null
  return { value, range: { start, end } }
}

function buildWidgetCompileState(code: string, preview: ReturnType<typeof encodeLangToVmOps>) {
  if (preview.errors.length) {
    return {
      dspSource: code,
      sequences: preview.miniSequences ?? [],
      miniRefs: preview.miniRefs ?? [],
      miniPlayBars: preview.miniPlayBars ?? [],
      tramRefs: preview.tramRefs ?? [],
      timelineRefs: preview.timelineRefs ?? [],
      miniSourceMaps: [] as Array<Map<number, SourceLocation> | undefined>,
      analyserRefs: preview.analyserRefs ?? [],
      compressorRefs: preview.compressorRefs ?? [],
      expanderRefs: preview.expanderRefs ?? [],
      gateRefs: preview.gateRefs ?? [],
      limiterRefs: preview.limiterRefs ?? [],
      filterRefs: preview.filterRefs ?? [],
      reverbRefs: preview.reverbRefs ?? [],
      slicerRefs: preview.slicerRefs ?? [],
      lfoRefs: preview.lfoRefs ?? [],
      everyRefs: preview.everyRefs ?? [],
      atRefs: preview.atRefs ?? [],
      euclidRefs: preview.euclidRefs ?? [],
      arrayLiterals: preview.arrayLiterals ?? [],
      branchMarks: preview.branchMarks ?? [],
      numberParams: preview.numberParams ?? [],
      sampleDefs: preview.sampleDefs ?? [],
      timelineLabels: [] as ReturnType<typeof buildTimelineLabels>,
      bars: undefined as number | undefined,
    }
  }

  const sequences = preview.miniSequences ?? []
  const scaleIndex = preview.scale
  const miniSourceMaps: Array<Map<number, SourceLocation> | undefined> = sequences.map(s => {
    const compiled = compileMiniNotation(s, scaleIndex === undefined ? {} : { defaultScale: { scaleIndex } })
    return buildMiniSourceMap(s, compiled.nodes, compiled.bytecode)
  })

  const early = extractEarlyDataFromSource(code)
  const bars = early.errors.length ? undefined : early.bars
  const timelineLabels = early.errors.length ? [] : buildTimelineLabels(early.timelineLabels, early.bars)

  return {
    dspSource: code,
    sequences,
    miniRefs: preview.miniRefs ?? [],
    miniPlayBars: preview.miniPlayBars ?? [],
    tramRefs: preview.tramRefs ?? [],
    timelineRefs: preview.timelineRefs ?? [],
    miniSourceMaps,
    analyserRefs: preview.analyserRefs ?? [],
    compressorRefs: preview.compressorRefs ?? [],
    expanderRefs: preview.expanderRefs ?? [],
    gateRefs: preview.gateRefs ?? [],
    limiterRefs: preview.limiterRefs ?? [],
    filterRefs: preview.filterRefs ?? [],
    reverbRefs: preview.reverbRefs ?? [],
    slicerRefs: preview.slicerRefs ?? [],
    lfoRefs: preview.lfoRefs ?? [],
    everyRefs: preview.everyRefs ?? [],
    atRefs: preview.atRefs ?? [],
    euclidRefs: preview.euclidRefs ?? [],
    arrayLiterals: preview.arrayLiterals ?? [],
    branchMarks: preview.branchMarks ?? [],
    numberParams: preview.numberParams ?? [],
    sampleDefs: preview.sampleDefs ?? [],
    timelineLabels,
    bars,
  }
}

export function InlineEditor(
  { id, initialCode, autoHeight = true, hidePlayButton = false, header, noMargin = false }: InlineEditorProps,
) {
  const loopId = id
  const codeFileRef = useRef<{ id: string; file: CodeFile } | null>(null)
  if (!codeFileRef.current || codeFileRef.current.id !== loopId) {
    codeFileRef.current = { id: loopId, file: new CodeFile(initialCode) }
  }
  const codeFile = codeFileRef.current.file
  useCodeFileValue(codeFile)
  const code = codeFile.value

  const targetRef = useRef<{ ops: Int32Array; literals: Float32Array } | null>(null)
  if (!targetRef.current) {
    targetRef.current = {
      ops: new Int32Array(OPS_COUNT),
      literals: new Float32Array(LITERALS_COUNT),
    }
  }

  const lastSuccessfulRef = useRef<LastSuccessfulCompile | null>(null)

  const playbackState = useEngineRuntimeStore(state => state.playbackState)
  const playingLoopId = useEngineRuntimeStore(state => state.playingLoopId)
  const isPlaying = playingLoopId === loopId && playbackState === 'running'
  const uiShowWidgets = useEngineUiStore(state => state.showWidgets)

  const { globalSampleCount, isPlaybackRunningForView } = usePlayingState(loopId)
  const audioContext = useEngineRuntimeStore(state => state.audioContext)
  const bpmValue = useEngineRuntimeStore(state => state.bpmValue)
  const ringPos = useEngineRuntimeStore(state => state.ringPos)
  const program1 = useEngineRuntimeStore(state => state.program1)
  const program2 = useEngineRuntimeStore(state => state.program2)
  const wasmDsp = useEngineRuntimeStore(state => state.wasmDsp)
  const activeProgram$ = wasmDsp?.program
  const runtimeProgram = (activeProgram$ && program2?.program.ptr$ === activeProgram$) ? program2 : program1

  const showWidgets = true

  const theme = useTheme()

  const wasLiteralOnlyRef = useRef(false)
  const literalUpdatesRef = useRef<Array<{ index: number; value: number }>>([])

  const preview = useMemo(() => {
    const target = targetRef.current!
    const lastSuccessful = lastSuccessfulRef.current

    wasLiteralOnlyRef.current = false
    literalUpdatesRef.current = []

    if (lastSuccessful && isPlaying && runtimeProgram) {
      const numberLiterals = lastSuccessful.preview.numberLiterals ?? []
      if (numberLiterals.length > 0) {
        const oldSource = lastSuccessful.code
        const oldStarts = lineStarts(oldSource)
        const newStarts = lineStarts(code)
        const ranges: Array<{ start: number; end: number }> = []

        const updates: Array<{ index: number; value: number }> = []
        let canApplyLiteralOnly = true

        for (const info of numberLiterals) {
          const index = info.literalIndex
          if (index === undefined) {
            canApplyLiteralOnly = false
            break
          }

          const oldRead = readNumberAt(oldSource, oldStarts, info)
          const newRead = readNumberAt(code, newStarts, info)
          if (!oldRead || !newRead) {
            canApplyLiteralOnly = false
            break
          }

          ranges.push(oldRead.range)
          ranges.push(newRead.range)

          if (newRead.value !== info.value) {
            updates.push({ index, value: newRead.value })
          }
        }

        if (canApplyLiteralOnly) {
          const oldNorm = normalizeSourceWithRanges(oldSource, ranges.filter((_, i) => i % 2 === 0))
          const newNorm = normalizeSourceWithRanges(code, ranges.filter((_, i) => i % 2 === 1))

          if (oldNorm === newNorm) {
            wasLiteralOnlyRef.current = true
            literalUpdatesRef.current = updates
            return lastSuccessful.preview
          }
        }
      }
    }

    target.ops.fill(0)
    target.literals.fill(0)
    const result = encodeLangToVmOps(code, target)

    // Docs should default to prelude BPM (60) unless explicitly set
    result.bpm = result.bpm ?? 60

    if (result.errors.length === 0) {
      lastSuccessfulRef.current = {
        code,
        preview: result,
        ops: new Int32Array(target.ops),
        literals: new Float32Array(target.literals),
      }
    }

    return result
  }, [code, isPlaying, runtimeProgram])

  const canPlay = preview.errors.length === 0

  const playFunction = useCallback(() => {
    const runtime = useEngineRuntimeStore.getState()
    if (isPlaying) {
      runtime.stop()
    }
    else {
      void useEngineDspStore.getState().playLoop(loopId, code, 0)
    }
  }, [loopId, code, isPlaying])

  const stopFunction = useCallback(() => {
    const runtime = useEngineRuntimeStore.getState()
    runtime.stop()
  }, [])

  // Register this editor in the global registry
  useEffect(() => {
    inlineEditorRegistry.set(id, { play: playFunction, stop: stopFunction })
    return () => {
      inlineEditorRegistry.delete(id)
    }
  }, [id, playFunction, stopFunction])

  useEffect(() => {
    if (!isPlaying) return
    if (!canPlay) return

    const lastSuccessful = lastSuccessfulRef.current
    if (!lastSuccessful) return

    const isLiteralOnlyChange = wasLiteralOnlyRef.current
    const updates = literalUpdatesRef.current

    if (isLiteralOnlyChange && runtimeProgram && updates.length > 0) {
      for (const u of updates) {
        lastSuccessful.literals[u.index] = u.value
      }
      for (const u of updates) {
        void runtimeProgram.program.writeLiteral(u.index, u.value)
      }
    }
    else if (!isLiteralOnlyChange) {
      const vm: VmCompileSnapshot = {
        source: code,
        ops: new Int32Array(lastSuccessful.ops),
        literals: new Float32Array(lastSuccessful.literals),
        result: preview,
      }

      const t = window.setTimeout(() => {
        void useEngineDspStore.getState().updateDspSource(code, vm)
      }, 175)
      return () => window.clearTimeout(t)
    }
  }, [canPlay, code, isPlaying, loopId, preview, runtimeProgram])

  const editorErrors = useMemo((): EditorError[] => {
    const out: EditorError[] = []
    for (const err of preview.errors ?? []) {
      const line = Math.max(0, err.line - 1)
      const startColumn = Math.max(0, err.column - 1)
      const endColumn = startColumn + Math.max(1, err.length)
      out.push({
        line,
        startColumn,
        endColumn,
        message: err.message,
      })
    }
    return out
  }, [preview.errors])

  const lastGoodWidgetCompileStateRef = useRef<ReturnType<typeof buildWidgetCompileState> | null>(null)

  const widgetCompileState = useMemo(() => {
    const lastGood = lastGoodWidgetCompileStateRef.current

    // Keep the last successful widget graph while the editor has compile errors.
    // Why: the running program is still the last successful one, so rebuilding widgets from
    // an errored preview can mismatch refs/ring buffers and corrupt widget state.
    if (preview.errors.length > 0 && lastGood) {
      return lastGood
    }

    // For literal-only changes, reuse the last successful widget graph to avoid downstream churn.
    if (wasLiteralOnlyRef.current && lastGood) {
      return lastGood
    }

    const result = buildWidgetCompileState(code, preview)
    if (preview.errors.length === 0) {
      lastGoodWidgetCompileStateRef.current = result
    }
    return result
  }, [code, preview])

  const frameRef = useRef<any[]>([])
  const controlStateRef = useRef<Map<number, any>>(new Map())
  const resetKey = `${loopId}:${playingLoopId ?? ''}:${playbackState}`

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

  const { widgets: sequenceWidgets, onBeforeDraw: onBeforeDrawSequence } = useSequenceWidget({
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
    timelineLabels: widgetCompileState.timelineLabels,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    gridOwnerByLine,
    resetKey,
  })

  const { widgets: timelineWidgets, onBeforeDraw: onBeforeDrawTimeline } = useTimelineWidget({
    program1: runtimeProgram,
    audioContext,
    bpmValue,
    globalSampleCount,
    timelineRefs: widgetCompileState.timelineRefs,
    timelineLabels: widgetCompileState.timelineLabels,
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isPlaying: isPlaybackRunningForView,
    isLive: isPlaying,
    gridOwnerByLine,
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
    isLive: isPlaying,
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
    isLive: isPlaying,
    playbackState,
    sampleRate: audioContext?.sampleRate,
    loopId,
    playingLoopId,
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
    isLive: isPlaying,
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
    isLive: isPlaying,
    playbackState,
  })

  const { widgets: reverbWidgets, onBeforeDraw: onBeforeDrawReverb } = useReverbWidget({
    program1: runtimeProgram,
    reverbRefs: widgetCompileState.reverbRefs,
    showWidgets,
    isLive: isPlaying,
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
    isLive: isPlaying,
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
    isLive: isPlaying,
    playbackState,
  })

  const { widgets: arrayAccessWidgets, onBeforeDraw: onBeforeDrawArrayAccess } = useArrayAccessWidget({
    program1: runtimeProgram,
    dspSource: widgetCompileState.dspSource,
    showWidgets: showWidgets && isPlaying,
    arrayLiterals: widgetCompileState.arrayLiterals,
  })

  const { widgets: branchWidgets, onBeforeDraw: onBeforeDrawBranch } = useBranchWidget({
    program1: runtimeProgram,
    dspSource: widgetCompileState.dspSource,
    showWidgets: showWidgets && isPlaying,
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
    isLive: isPlaying,
  })

  const { widgets: envelopeWidgets, onBeforeDraw: onBeforeDrawEnvelope } = useEnvelopeWidget({
    program1: runtimeProgram,
    adRefs: preview.adRefs ?? [],
    adsrRefs: preview.adsrRefs ?? [],
    envfollowRefs: preview.envfollowRefs ?? [],
    slewRefs: preview.slewRefs ?? [],
    dspSource: widgetCompileState.dspSource,
    showWidgets,
    isLive: isPlaying,
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

    const refs: any[] = [
      ...(widgetCompileState.compressorRefs ?? []),
      ...(widgetCompileState.expanderRefs ?? []),
      ...(widgetCompileState.gateRefs ?? []),
      ...(widgetCompileState.limiterRefs ?? []),
      ...(widgetCompileState.filterRefs ?? []),
      ...(widgetCompileState.reverbRefs ?? []),
      ...(widgetCompileState.lfoRefs ?? []),
      ...(preview.adRefs ?? []),
      ...(preview.adsrRefs ?? []),
      ...(preview.envfollowRefs ?? []),
      ...(preview.slewRefs ?? []),
    ]
    for (const ref of refs) addKnobsFromRef(ref)

    return { knobs: out, knobLocKeys }
  }, [
    preview.adRefs,
    preview.adsrRefs,
    preview.envfollowRefs,
    preview.slewRefs,
    widgetCompileState.compressorRefs,
    widgetCompileState.expanderRefs,
    widgetCompileState.filterRefs,
    widgetCompileState.gateRefs,
    widgetCompileState.lfoRefs,
    widgetCompileState.limiterRefs,
    widgetCompileState.reverbRefs,
  ])

  const { widgets: knobWidgets } = useKnobWidget({
    showWidgets,
    knobs,
    theme,
    codeFile,
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
    codeFile,
  })

  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const onBeforeDrawCombined = useCallback(() => {
    if (!showWidgets) return
    const result = updatePredictedSampleCount(
      audioContext,
      globalSampleCount,
      { predictedSampleCountRef, lastWallTimeRef, isFirstFrameRef },
      { isPlaying: isPlaybackRunningForView },
    )
    useEngineRuntimeStore.getState().setPredictedSampleCountResult(result)
    onBeforeDrawSample()
    onBeforeDrawAnalyser()
    onBeforeDrawCompressor()
    onBeforeDrawEnvelope()
    onBeforeDrawFilter()
    onBeforeDrawReverb()
    onBeforeDrawSlicer()
    onBeforeDrawLfo()
    onBeforeDrawTrig()
    onBeforeDrawTimeline()
    onBeforeDrawTimelineSequence()
    onBeforeDrawTram()
    onBeforeDrawPianoroll()
    onBeforeDrawSequence()
    onBeforeDrawArrayAccess()
    onBeforeDrawBranch()
  }, [
    audioContext,
    globalSampleCount,
    isPlaybackRunningForView,
    onBeforeDrawAnalyser,
    onBeforeDrawArrayAccess,
    onBeforeDrawBranch,
    onBeforeDrawCompressor,
    onBeforeDrawEnvelope,
    onBeforeDrawFilter,
    onBeforeDrawLfo,
    onBeforeDrawPianoroll,
    onBeforeDrawReverb,
    onBeforeDrawSample,
    onBeforeDrawSequence,
    onBeforeDrawSlicer,
    onBeforeDrawTimeline,
    onBeforeDrawTimelineSequence,
    onBeforeDrawTram,
    onBeforeDrawTrig,
    showWidgets,
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
  }, [
    showWidgets,
    sampleWidgets,
    analyserWidgets,
    compressorWidgets,
    envelopeWidgets,
    filterWidgets,
    reverbWidgets,
    slicerWidgets,
    lfoWidgets,
    trigWidgets,
    timelineWidgets,
    timelineSequenceWidgets,
    tramWidgets,
    pianorollWidgets,
    sequenceWidgets,
    arrayAccessWidgets,
    branchWidgets,
    sliderWidgets,
    knobWidgets,
  ])

  return (
    <div className={`${noMargin ? '' : 'my-3'} w-full h-full border border-[#333] bg-black rounded-md overflow-hidden`}
      data-inline-editor={id}
    >
      <div className="w-full h-full relative">
        {!hidePlayButton && (
          <div className="absolute bottom-0 right-0 flex items-center justify-end z-50 gap-2 px-2 py-1.5 border-b border-[#333]">
            {!canPlay && (
              <div className="text-xs text-red-300 truncate">
                {preview.errors[0]?.message ?? 'Compile error'}
              </div>
            )}
            <button
              className={`h-8 w-8 flex items-center justify-center rounded text-white ${
                (canPlay || isPlaying) ? 'bg-gradient-to-br from-orange-400 to-red-600' : 'bg-neutral-800'
              }`}
              disabled={!canPlay && !isPlaying}
              onPointerDown={() => {
                const runtime = useEngineRuntimeStore.getState()
                if (isPlaying) {
                  runtime.stop()
                  return
                }
                void useEngineDspStore.getState().playLoop(loopId, code, 0)
              }}
              aria-label={isPlaying ? 'Stop' : 'Play'}
              title={isPlaying ? 'Stop' : (canPlay ? 'Play' : 'Fix errors to play')}
            >
              {isPlaying ? <StopIcon weight="fill" size={18} /> : <PlayIcon weight="fill" size={18} />}
            </button>
          </div>
        )}
        <CodeEditor
          codeFile={codeFile}
          widgets={widgets}
          errors={editorErrors}
          header={header ?? inlineHeader}
          theme={theme}
          tokenizer={tokenizer}
          keywords={KEYWORDS}
          functionDefinitions={functionDefinitions}
          hideFunctionSignatures={false}
          hideHoverFunctionSignatures={false}
          isAnimating={isPlaying}
          gutter={true}
          autoHeight={autoHeight}
          wordWrap={true}
          keyOverride={e => {
            const metaKey = e.ctrlKey || e.metaKey
            if (e.key === ' ' && metaKey) {
              // Allow Cmd/Ctrl+Space to propagate for docs keyboard shortcuts
              return true
            }
            e.stopPropagation()
            return true
          }}
          onBeforeDraw={onBeforeDrawCombined}
        />
      </div>
    </div>
  )
}
