import { rpc } from 'utils/rpc'
import { create } from 'zustand'
import {
  LITERALS_COUNT,
  MAX_DSP_INSTANCES,
  OPS_COUNT,
} from '../../../as/assembly/constants.ts'
import { AnimationManager } from '../../lib/animation-manager.ts'
import { waitForNonZero } from '../../lib/atomics.ts'
import type { SourceLocation } from '../../lib/mini-source-map.ts'
import {
  type AdRef,
  type AdsrRef,
  type AnalyserRef,
  type ArrayLiteralRef,
  type AtRef,
  type BranchMarkRef,
  type CompressorRef,
  encodeLangToVmOps,
  type EnvfollowRef,
  type EuclidRef,
  type EveryRef,
  type ExpanderRef,
  extractEarlyDataFromSource,
  type FilterRef,
  type GateRef,
  type LfoRef,
  type LimiterRef,
  type LpRef,
  type MiniSequenceRef,
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
  type ReverbRef,
  type SampleDef,
  type SlewRef,
  type SlicerRef,
  type TimelineLabel,
  type TimelineSequenceRef,
} from '../bytecode/bytecode.ts'
import { DEFAULT_DSP_SOURCE, DEFAULT_SEQUENCES } from '../constants.ts'
import { DspStruct } from '../dsp/assembly.ts'
import { createProgramInstance, type ProgramDataView, type VmCompileSnapshot } from '../dsp/program.ts'
import { type LoadedSample, SampleLoader } from '../dsp/sample-loader.ts'
import { buildTimelineLabels } from '../dsp/timeline-labels.ts'
import { createVisualWasm } from '../dsp/visual-wasm.ts'
import { ControlOp } from '../dsp/worklet-shared.ts'
import type { DspProcessor, DspProcessorOptions } from '../dsp/worklet.ts'
import workletUrl from '../dsp/worklet.ts?worker&url'
import { useEngineRuntimeStore } from './runtime.ts'
import { useEngineUiStore } from './ui.ts'

const f32BitsBuf = new ArrayBuffer(4)
const f32BitsView = new DataView(f32BitsBuf)
function f32ToU32(v: number): number {
  f32BitsView.setFloat32(0, v, true)
  return f32BitsView.getUint32(0, true)
}

type PendingDspUpdate = {
  source: string
  vm?: VmCompileSnapshot
  resolve: (value: string[] | undefined) => void
  reject: (reason: unknown) => void
}

export type EngineDspState = {
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  miniPlayBars: Array<number | undefined>
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  adRefs: AdRef[]
  adsrRefs: AdsrRef[]
  envfollowRefs: EnvfollowRef[]
  slewRefs: SlewRef[]
  analyserRefs: AnalyserRef[]
  compressorRefs: CompressorRef[]
  expanderRefs: ExpanderRef[]
  gateRefs: GateRef[]
  limiterRefs: LimiterRef[]
  filterRefs: FilterRef[]
  reverbRefs: ReverbRef[]
  slicerRefs: SlicerRef[]
  lfoRefs: LfoRef[]
  everyRefs: EveryRef[]
  atRefs: AtRef[]
  euclidRefs: EuclidRef[]
  arrayLiterals: ArrayLiteralRef[]
  branchMarks: BranchMarkRef[]
  numberParams: NumberWithParamsInfo[]
  numberLiterals: NumberLiteralInfo[]
  sampleDefs: SampleDef[]
  loadedSamples: Array<LoadedSample | undefined>
  dspSource: string

  uiSequences: string[]
  uiMiniRefs: MiniSequenceRef[]
  uiMiniPlayBars: Array<number | undefined>
  uiTimelineRefs: TimelineSequenceRef[]
  uiTimelineLabels: TimelineLabel[]
  uiMiniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  uiAdRefs: AdRef[]
  uiAdsrRefs: AdsrRef[]
  uiEnvfollowRefs: EnvfollowRef[]
  uiSlewRefs: SlewRef[]
  uiAnalyserRefs: AnalyserRef[]
  uiCompressorRefs: CompressorRef[]
  uiExpanderRefs: ExpanderRef[]
  uiGateRefs: GateRef[]
  uiLimiterRefs: LimiterRef[]
  uiLpRefs: LpRef[]
  uiReverbRefs: ReverbRef[]
  uiSlicerRefs: SlicerRef[]
  uiLfoRefs: LfoRef[]
  uiEveryRefs: EveryRef[]
  uiAtRefs: AtRef[]
  uiEuclidRefs: EuclidRef[]
  uiArrayLiterals: ArrayLiteralRef[]
  uiBranchMarks: BranchMarkRef[]
  uiNumberParams: NumberWithParamsInfo[]
  uiNumberLiterals: NumberLiteralInfo[]
  uiSampleDefs: SampleDef[]
  uiDspSource: string

  bars?: number
  uiBars?: number
  isProgramSwapPending: boolean
  isUpdatingDsp: boolean
  isPreloadingSamples: boolean
  lastSuccessfulProgramData?: ProgramDataView

  initialize: () => Promise<void>
  dispose: () => void
  updateWasmBinary: () => Promise<void>
  updateDspSource: (source: string, vm?: VmCompileSnapshot) => Promise<string[] | undefined>
  applyDocsSource: (loopId: string, source: string, vm?: VmCompileSnapshot) => Promise<void>
  preloadSamples: (source: string) => Promise<void>
  playLoop: (loopId: string, source: string, startSample?: number) => Promise<void>
  setUiCompilePreview: (next: {
    source: string
    sequences: string[]
    miniRefs: MiniSequenceRef[]
    miniPlayBars: Array<number | undefined>
    timelineRefs: TimelineSequenceRef[]
    timelineLabels: TimelineLabel[]
    bars: number | undefined
    miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
    analyserRefs: AnalyserRef[]
    compressorRefs: CompressorRef[]
    expanderRefs: ExpanderRef[]
    gateRefs: GateRef[]
    filterRefs: FilterRef[]
    reverbRefs: ReverbRef[]
    slicerRefs: SlicerRef[]
    lfoRefs: LfoRef[]
    everyRefs: EveryRef[]
    atRefs: AtRef[]
    euclidRefs: EuclidRef[]
    arrayLiterals: ArrayLiteralRef[]
    branchMarks: BranchMarkRef[]
    numberParams: NumberWithParamsInfo[]
    sampleDefs: SampleDef[]
  }) => void
}

export const useEngineDspStore = create<EngineDspState>((set, get) => {
  const dspUpdateQueue = {
    isProcessing: false,
    pendingSource: undefined as string | undefined,
    pendingVm: undefined as VmCompileSnapshot | undefined,
    requests: [] as PendingDspUpdate[],
  }

  let sampleLoader: SampleLoader | undefined
  let sampleDecodeToken = 0
  let sampleUploadToken = 0
  let samplePreloadId = 0
  let playLoopToken = 0
  let docsUpdateToken = 0
  const samplePreviewTarget = {
    ops: new Int32Array(OPS_COUNT),
    literals: new Float32Array(LITERALS_COUNT),
  }
  const compilePreviewTarget = {
    ops: new Int32Array(OPS_COUNT),
    literals: new Float32Array(LITERALS_COUNT),
  }
  const sampleUrlByIndex = new Map<number, string>()

  function scheduleSampleLoad(
    defs: SampleDef[] | undefined,
    opts: { uploadToWorklet: boolean; updateStore?: boolean },
  ): Promise<void> {
    const runtime = useEngineRuntimeStore.getState()
    const audioContext = runtime.audioContext
    if (!audioContext) return Promise.resolve()
    if (!defs?.length) return Promise.resolve()

    const updateStore = opts.updateStore ?? true
    if (!sampleLoader) sampleLoader = new SampleLoader(audioContext)
    const token = opts.uploadToWorklet ? ++sampleUploadToken : ++sampleDecodeToken
    const isStale = () => token !== (opts.uploadToWorklet ? sampleUploadToken : sampleDecodeToken)

    if (updateStore) {
      // Clear stale waveforms immediately when the same index points at a different URL.
      const prev = get().loadedSamples
      let next: Array<LoadedSample | undefined> | null = null
      for (const d of defs) {
        const prevLoaded = prev[d.sampleIndex]
        if (prevLoaded && prevLoaded.url !== d.url) {
          if (!next) next = prev.slice()
          next[d.sampleIndex] = undefined
        }
      }
      if (next) set({ loadedSamples: next })
    }

    return (async () => {
      for (const d of defs) {
        if (isStale()) return
        if (d.provider === 'record') continue

        const alreadyUploaded = sampleUrlByIndex.get(d.sampleIndex) === d.url
        const alreadyDecoded = updateStore ? get().loadedSamples[d.sampleIndex]?.url === d.url : false
        if (alreadyDecoded && (!opts.uploadToWorklet || alreadyUploaded)) continue

        const loaded = alreadyDecoded
          ? get().loadedSamples[d.sampleIndex]!
          : await sampleLoader!.load(d.url)
        if (isStale()) return

        if (updateStore && !alreadyDecoded) {
          set(prev => {
            const next = prev.loadedSamples.slice()
            next[d.sampleIndex] = loaded
            return { loadedSamples: next }
          })
        }

        if (!opts.uploadToWorklet) continue

        const worklet = useEngineRuntimeStore.getState().worklet
        if (!worklet) continue

        await worklet.setSample(d.sampleIndex, loaded.sampleRate, loaded.length, loaded.ch0Buffer)
        sampleUrlByIndex.set(d.sampleIndex, d.url)
      }
    })()
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
    info: Pick<NumberWithParamsInfo, 'line' | 'column' | 'length'>,
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

  async function tryApplyLiteralOnlyUpdate(source: string): Promise<string[] | undefined> {
    const runtime = useEngineRuntimeStore.getState()
    const primaryProgram = runtime.program1
    if (!primaryProgram) return undefined
    if (!get().lastSuccessfulProgramData) return undefined
    if (get().numberLiterals.length === 0) return undefined

    const oldSource = get().dspSource
    const oldStarts = lineStarts(oldSource)
    const newStarts = lineStarts(source)
    const ranges: Array<{ start: number; end: number }> = []

    const updates: Array<{ index: number; value: number }> = []
    const nextNumberLiterals: NumberLiteralInfo[] = []
    const nextNumberParams: NumberWithParamsInfo[] = []

    for (const info of get().numberLiterals) {
      const index = info.literalIndex
      if (index === undefined) return undefined

      const oldRead = readNumberAt(oldSource, oldStarts, info)
      const newRead = readNumberAt(source, newStarts, info)
      if (!oldRead || !newRead) return undefined

      ranges.push(oldRead.range)
      ranges.push(newRead.range)

      if (newRead.value !== info.value) {
        updates.push({ index, value: newRead.value })
      }

      nextNumberLiterals.push({ ...info, value: newRead.value })
    }

    // Keep slider UI params in sync (subset of number literals).
    for (const info of get().numberParams) {
      const newRead = readNumberAt(source, newStarts, info)
      if (!newRead) return undefined
      nextNumberParams.push({ ...info, value: newRead.value })
    }

    const oldNorm = normalizeSourceWithRanges(oldSource, ranges.filter((_, i) => i % 2 === 0))
    const newNorm = normalizeSourceWithRanges(source, ranges.filter((_, i) => i % 2 === 1))
    if (oldNorm !== newNorm) return undefined

    const earlyData = extractEarlyDataFromSource(source)
    if (earlyData.errors.length) return undefined

    if (earlyData.bpm !== undefined && runtime.bpmValue) {
      runtime.bpmValue[0] = earlyData.bpm
    }

    const bars = earlyData.bars
    const nextTimelineLabels = buildTimelineLabels(earlyData.timelineLabels, bars)
    runtime.syncBarsHardLoop(bars)

    if (updates.length === 0) {
      set({
        dspSource: source,
        numberLiterals: nextNumberLiterals,
        numberParams: nextNumberParams,
        timelineLabels: nextTimelineLabels,
        bars,
        uiDspSource: source,
        uiNumberLiterals: nextNumberLiterals,
        uiNumberParams: nextNumberParams,
        uiTimelineLabels: nextTimelineLabels,
        uiBars: bars,
      })
      localStorage.setItem('lm2:dsp-source', source)
      return get().sequences
    }

    for (const u of updates) {
      await primaryProgram.program.writeLiteral(u.index, u.value)
    }

    set({
      dspSource: source,
      numberLiterals: nextNumberLiterals,
      numberParams: nextNumberParams,
      timelineLabels: nextTimelineLabels,
      bars,
      uiDspSource: source,
      uiNumberLiterals: nextNumberLiterals,
      uiNumberParams: nextNumberParams,
      uiTimelineLabels: nextTimelineLabels,
      uiBars: bars,
    })
    localStorage.setItem('lm2:dsp-source', source)
    return get().sequences
  }

  async function runQueuedDspUpdate(source: string, vm?: VmCompileSnapshot): Promise<string[] | undefined> {
    const runtime = useEngineRuntimeStore.getState()
    if (!runtime.program1 || !runtime.program2) return undefined

    if (get().lastSuccessfulProgramData && get().dspSource === source) {
      return get().sequences
    }

    try {
      const literalOnly = await tryApplyLiteralOnlyUpdate(source)
      if (literalOnly) return literalOnly

      const primaryProgram = runtime.program1
      const stagingProgram = runtime.program2

      const comparisonReference = get().lastSuccessfulProgramData ?? primaryProgram.program.data
        ?? stagingProgram.program.data

      const primaryResult = await primaryProgram.program.compileSource(source, {
        apply: false,
        setData: false,
        compareAgainst: comparisonReference,
        vm,
      })

      if (runtime.worklet && runtime.audioContext) {
        scheduleSampleLoad(primaryResult.sampleDefs, { uploadToWorklet: true })
      }

      if (primaryResult.bpm !== undefined && runtime.bpmValue) {
        runtime.bpmValue[0] = primaryResult.bpm
      }

      const sequences = primaryResult.sequences
      const miniRefs = primaryResult.miniRefs
      const timelineRefs = primaryResult.timelineRefs
      const bars = primaryResult.bars
      const timelineLabels = buildTimelineLabels(primaryResult.timelineLabels, bars)
      const miniSourceMaps = primaryResult.miniSourceMaps
      const adRefs = primaryResult.adRefs
      const adsrRefs = primaryResult.adsrRefs
      const envfollowRefs = primaryResult.envfollowRefs
      const slewRefs = primaryResult.slewRefs
      const analyserRefs = primaryResult.analyserRefs
      const compressorRefs = primaryResult.compressorRefs
      const expanderRefs = primaryResult.expanderRefs
      const gateRefs = primaryResult.gateRefs
      const limiterRefs = primaryResult.limiterRefs
      const filterRefs = primaryResult.filterRefs
      const reverbRefs = primaryResult.reverbRefs
      const slicerRefs = primaryResult.slicerRefs
      const lfoRefs = primaryResult.lfoRefs
      const everyRefs = primaryResult.everyRefs
      const atRefs = primaryResult.atRefs
      const euclidRefs = primaryResult.euclidRefs
      const arrayLiterals = primaryResult.arrayLiterals
      const branchMarks = primaryResult.branchMarks
      const numberParams = primaryResult.numberParams
      const numberLiterals = primaryResult.numberLiterals
      const sampleDefs: SampleDef[] = primaryResult.sampleDefs ?? []

      if (!primaryResult.diff.significantChange) {
        if (primaryResult.bpm !== undefined && runtime.bpmValue) {
          const oldBpm = runtime.bpmValue[0]
          runtime.bpmValue[0] = primaryResult.bpm
          runtime.worklet?.syncBpm(oldBpm, primaryResult.bpm)
        }
        await primaryProgram.program.applyPreparedData(primaryResult.data)
        set({
          dspSource: source,
          sequences,
          miniRefs,
          timelineRefs,
          timelineLabels,
          bars,
          miniSourceMaps,
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
          numberLiterals,
          sampleDefs,
          lastSuccessfulProgramData: primaryResult.data,
          uiDspSource: source,
          uiSequences: sequences,
          uiMiniRefs: miniRefs,
          uiTimelineRefs: timelineRefs,
          uiTimelineLabels: timelineLabels,
          uiBars: bars,
          uiMiniSourceMaps: miniSourceMaps,
          uiAdRefs: adRefs,
          uiAdsrRefs: adsrRefs,
          uiEnvfollowRefs: envfollowRefs,
          uiSlewRefs: slewRefs,
          uiAnalyserRefs: analyserRefs,
          uiCompressorRefs: compressorRefs,
          uiExpanderRefs: expanderRefs,
          uiGateRefs: gateRefs,
          uiLimiterRefs: limiterRefs,
          uiLpRefs: filterRefs,
          uiReverbRefs: reverbRefs,
          uiSlicerRefs: slicerRefs,
          uiLfoRefs: lfoRefs,
          uiEveryRefs: everyRefs,
          uiAtRefs: atRefs,
          uiEuclidRefs: euclidRefs,
          uiArrayLiterals: arrayLiterals,
          uiBranchMarks: branchMarks,
          uiNumberParams: numberParams,
          uiNumberLiterals: numberLiterals,
          uiSampleDefs: sampleDefs,
          isProgramSwapPending: false,
        })
        runtime.syncBarsHardLoop(bars)
        localStorage.setItem('lm2:dsp-source', source)
        return sequences
      }

      const stagingResult = await stagingProgram.program.compileSource(source, {
        apply: false,
        setData: true,
        compareAgainst: primaryResult.previousData,
        copyVersionFrom: primaryResult.previousData,
        vm,
      })

      const swap = runtime.programSwap
      const control = runtime.control
      const dspPtr = runtime.wasmDspPtr
      const swapStatus = runtime.programSwapStatus
      if (!swap || !control || !dspPtr || !swapStatus) {
        throw new Error('Program swap buffers not initialized')
      }

      // Early UI update: we already have the compiled refs/source maps, but the worklet
      // crossfade swap can take a few chunks to finish.
      const stagingBars = stagingResult.bars
      set({
        uiDspSource: source,
        uiSequences: sequences,
        uiMiniRefs: stagingResult.miniRefs,
        uiTimelineRefs: stagingResult.timelineRefs,
        uiTimelineLabels: buildTimelineLabels(stagingResult.timelineLabels, stagingBars),
        uiBars: stagingBars,
        uiMiniSourceMaps: stagingResult.miniSourceMaps,
        uiAdRefs: stagingResult.adRefs,
        uiAdsrRefs: stagingResult.adsrRefs,
        uiEnvfollowRefs: stagingResult.envfollowRefs,
        uiSlewRefs: stagingResult.slewRefs,
        uiAnalyserRefs: stagingResult.analyserRefs,
        uiCompressorRefs: stagingResult.compressorRefs,
        uiExpanderRefs: stagingResult.expanderRefs,
        uiGateRefs: stagingResult.gateRefs,
        uiLimiterRefs: stagingResult.limiterRefs,
        uiLpRefs: stagingResult.filterRefs,
        uiReverbRefs: stagingResult.reverbRefs,
        uiSlicerRefs: stagingResult.slicerRefs,
        uiLfoRefs: stagingResult.lfoRefs,
        uiEveryRefs: stagingResult.everyRefs,
        uiAtRefs: stagingResult.atRefs,
        uiEuclidRefs: stagingResult.euclidRefs,
        uiArrayLiterals: stagingResult.arrayLiterals,
        uiBranchMarks: stagingResult.branchMarks,
        uiNumberParams: stagingResult.numberParams,
        uiNumberLiterals: stagingResult.numberLiterals,
        uiSampleDefs: stagingResult.sampleDefs ?? [],
        isProgramSwapPending: true,
      })

      swapStatus.fill(0)
      swap.fill(0)

      if (stagingResult.bpm !== undefined && runtime.bpmValue) {
        const oldBpm = runtime.bpmValue[0]
        runtime.bpmValue[0] = stagingResult.bpm
        runtime.worklet?.syncBpm(oldBpm, stagingResult.bpm)
      }

      Atomics.store(swap, 0, primaryProgram.program.ptr$)
      Atomics.store(swap, 1, stagingProgram.program.ptr$)
      Atomics.store(swap, 2, dspPtr)
      Atomics.store(control, 0, ControlOp.Swap)

      const swapResult = await waitForSwapResult(swapStatus, 0, 1)
      Atomics.store(swapStatus, 0, 0)

      const swappedPrograms = {
        program1: stagingProgram,
        program2: primaryProgram,
      }

      if (swapResult === 0) {
        const nextControl = useEngineRuntimeStore.getState().playbackState === 'running'
          ? ControlOp.Start
          : ControlOp.Pause
        Atomics.store(control, 0, nextControl)
      }

      if (swapResult !== 1) {
        console.warn('Program swap failed; will retry against the last-known program on the next update.')
        const current = get()
        set({
          uiDspSource: current.dspSource,
          uiSequences: current.sequences,
          uiMiniRefs: current.miniRefs,
          uiMiniPlayBars: current.miniPlayBars,
          uiTimelineRefs: current.timelineRefs,
          uiTimelineLabels: current.timelineLabels,
          uiBars: current.bars,
          uiMiniSourceMaps: current.miniSourceMaps,
          uiAdRefs: current.adRefs,
          uiAdsrRefs: current.adsrRefs,
          uiEnvfollowRefs: current.envfollowRefs,
          uiSlewRefs: current.slewRefs,
          uiAnalyserRefs: current.analyserRefs,
          uiCompressorRefs: current.compressorRefs,
          uiExpanderRefs: current.expanderRefs,
          uiGateRefs: current.gateRefs,
          uiLimiterRefs: current.limiterRefs,
          uiLpRefs: current.filterRefs,
          uiReverbRefs: current.reverbRefs,
          uiSlicerRefs: current.slicerRefs,
          uiLfoRefs: current.lfoRefs,
          uiEveryRefs: current.everyRefs,
          uiAtRefs: current.atRefs,
          uiEuclidRefs: current.euclidRefs,
          uiArrayLiterals: current.arrayLiterals,
          uiBranchMarks: current.branchMarks,
          uiNumberParams: current.numberParams,
          uiNumberLiterals: current.numberLiterals,
          uiSampleDefs: current.sampleDefs,
          isProgramSwapPending: false,
        })
        return undefined
      }

      useEngineRuntimeStore.setState(swappedPrograms)

      const nextControl = useEngineRuntimeStore.getState().playbackState === 'running'
        ? ControlOp.Start
        : ControlOp.Pause
      Atomics.store(control, 0, nextControl)

      const committedBars = stagingResult.bars
      const committedLabels = buildTimelineLabels(stagingResult.timelineLabels, committedBars)
      set({
        dspSource: source,
        sequences,
        miniRefs: stagingResult.miniRefs,
        miniPlayBars: stagingResult.miniPlayBars,
        timelineRefs: stagingResult.timelineRefs,
        timelineLabels: committedLabels,
        bars: committedBars,
        miniSourceMaps: stagingResult.miniSourceMaps,
        adRefs: stagingResult.adRefs,
        adsrRefs: stagingResult.adsrRefs,
        envfollowRefs: stagingResult.envfollowRefs,
        slewRefs: stagingResult.slewRefs,
        analyserRefs: stagingResult.analyserRefs,
        compressorRefs: stagingResult.compressorRefs,
        expanderRefs: stagingResult.expanderRefs,
        gateRefs: stagingResult.gateRefs,
        limiterRefs: stagingResult.limiterRefs,
        filterRefs: stagingResult.filterRefs,
        reverbRefs: stagingResult.reverbRefs,
        slicerRefs: stagingResult.slicerRefs,
        lfoRefs: stagingResult.lfoRefs,
        everyRefs: stagingResult.everyRefs,
        atRefs: stagingResult.atRefs,
        euclidRefs: stagingResult.euclidRefs,
        arrayLiterals: stagingResult.arrayLiterals,
        branchMarks: stagingResult.branchMarks,
        numberParams: stagingResult.numberParams,
        numberLiterals: stagingResult.numberLiterals,
        sampleDefs: stagingResult.sampleDefs ?? [],
        uiDspSource: source,
        uiSequences: sequences,
        uiMiniRefs: stagingResult.miniRefs,
        uiMiniPlayBars: stagingResult.miniPlayBars,
        uiTimelineRefs: stagingResult.timelineRefs,
        uiTimelineLabels: committedLabels,
        uiBars: committedBars,
        uiMiniSourceMaps: stagingResult.miniSourceMaps,
        uiAdRefs: stagingResult.adRefs,
        uiAdsrRefs: stagingResult.adsrRefs,
        uiEnvfollowRefs: stagingResult.envfollowRefs,
        uiSlewRefs: stagingResult.slewRefs,
        uiAnalyserRefs: stagingResult.analyserRefs,
        uiCompressorRefs: stagingResult.compressorRefs,
        uiExpanderRefs: stagingResult.expanderRefs,
        uiGateRefs: stagingResult.gateRefs,
        uiLimiterRefs: stagingResult.limiterRefs,
        uiLpRefs: stagingResult.filterRefs,
        uiReverbRefs: stagingResult.reverbRefs,
        uiSlicerRefs: stagingResult.slicerRefs,
        uiLfoRefs: stagingResult.lfoRefs,
        uiEveryRefs: stagingResult.everyRefs,
        uiAtRefs: stagingResult.atRefs,
        uiEuclidRefs: stagingResult.euclidRefs,
        uiArrayLiterals: stagingResult.arrayLiterals,
        uiBranchMarks: stagingResult.branchMarks,
        uiNumberParams: stagingResult.numberParams,
        uiNumberLiterals: stagingResult.numberLiterals,
        uiSampleDefs: stagingResult.sampleDefs ?? [],
        isProgramSwapPending: false,
        lastSuccessfulProgramData: stagingProgram.program.data,
      })

      runtime.syncBarsHardLoop(committedBars)
      localStorage.setItem('lm2:dsp-source', source)
      return sequences
    }
    catch (error) {
      set({ isProgramSwapPending: false })
      console.error('Failed to build program:', error)
      throw error
    }
  }

  async function applyDocsSourceInner(
    loopId: string,
    source: string,
    vm: VmCompileSnapshot | undefined,
    token: number,
  ): Promise<void> {
    const runtime = useEngineRuntimeStore.getState()
    if (runtime.playingLoopId !== loopId) return
    if (runtime.playbackState !== 'running') return
    if (token !== docsUpdateToken) return
    const program1 = runtime.program1
    const program2 = runtime.program2
    if (!program1 || !program2) return

    const activePtr = runtime.wasmDsp?.program
    const primaryProgram = (activePtr && program2.program.ptr$ === activePtr) ? program2 : program1
    const stagingProgram = primaryProgram === program1 ? program2 : program1

    const comparisonReference = primaryProgram.program.data ?? stagingProgram.program.data
    const primaryResult = await primaryProgram.program.compileSource(source, {
      apply: false,
      setData: false,
      compareAgainst: comparisonReference,
      vm,
    })
    if (token !== docsUpdateToken) return

    if (runtime.worklet && runtime.audioContext) {
      if (token !== docsUpdateToken) return
      void scheduleSampleLoad(primaryResult.sampleDefs, { uploadToWorklet: true, updateStore: false })
    }

    if (runtime.bpmValue) {
      const oldBpm = runtime.bpmValue[0]
      const newBpm = primaryResult.bpm ?? 60 // Default to prelude BPM
      runtime.bpmValue[0] = newBpm
      runtime.worklet?.syncBpm(oldBpm, newBpm)
    }

    if (!primaryResult.diff.significantChange) {
      if (useEngineRuntimeStore.getState().playingLoopId !== loopId) return
      if (token !== docsUpdateToken) return
      await primaryProgram.program.applyPreparedData(primaryResult.data)
      // Update DSP store so subsequent updateDspSource calls use correct state.
      set({
        dspSource: source,
        lastSuccessfulProgramData: primaryResult.data,
        numberLiterals: primaryResult.numberLiterals ?? [],
        numberParams: primaryResult.numberParams ?? [],
      })
      return
    }

    const prevData = primaryResult.previousData ?? comparisonReference
    const stagingResult = await stagingProgram.program.compileSource(source, {
      apply: false,
      setData: true,
      compareAgainst: prevData,
      copyVersionFrom: prevData,
      vm,
    })
    if (token !== docsUpdateToken) return

    if (runtime.worklet && runtime.audioContext) {
      if (token !== docsUpdateToken) return
      void scheduleSampleLoad(stagingResult.sampleDefs, { uploadToWorklet: true, updateStore: false })
    }

    if (runtime.bpmValue) {
      const oldBpm = runtime.bpmValue[0]
      const newBpm = stagingResult.bpm ?? 60 // Default to prelude BPM
      runtime.bpmValue[0] = newBpm
      runtime.worklet?.syncBpm(oldBpm, newBpm)
    }

    const control = runtime.control
    const swap = runtime.programSwap
    const swapStatus = runtime.programSwapStatus
    const seekSampleCount = runtime.seekSampleCount
    const dspPtr = runtime.wasmDspPtr
    if (!control || !swap || !swapStatus || !seekSampleCount || !dspPtr) return

    if (useEngineRuntimeStore.getState().playingLoopId !== loopId) return
    if (token !== docsUpdateToken) return

    const startSample = runtime.globalSampleCount ? Math.max(0, Atomics.load(runtime.globalSampleCount, 0)) : 0
    const bpmBits = f32ToU32(runtime.bpmValue?.[0] ?? 60)

    swapStatus.fill(0)
    swap.fill(0)
    Atomics.store(swap, 0, bpmBits)
    Atomics.store(swap, 1, stagingProgram.program.ptr$)
    Atomics.store(swap, 2, dspPtr)
    Atomics.store(seekSampleCount, 0, startSample)
    Atomics.store(control, 0, ControlOp.RestartWithProgram)

    // Wait for the worklet to acknowledge the swap, then update program refs
    // so widgets read from the correct (now-active) program's ring buffers.
    const restartResult = await waitForSwapResult(swapStatus, 0, 1)
    Atomics.store(swapStatus, 0, 0)
    if (restartResult !== 1) return
    if (token !== docsUpdateToken) return

    useEngineRuntimeStore.setState({
      program1: stagingProgram,
      program2: primaryProgram,
    })

    // Update DSP store so subsequent updateDspSource calls don't use stale
    // literal indices or early-return due to source mismatch.
    set({
      dspSource: source,
      lastSuccessfulProgramData: stagingProgram.program.data,
      numberLiterals: stagingResult.numberLiterals ?? [],
      numberParams: stagingResult.numberParams ?? [],
    })
  }

  async function processDspQueue() {
    if (dspUpdateQueue.isProcessing) return
    dspUpdateQueue.isProcessing = true
    try {
      while (dspUpdateQueue.requests.length) {
        const batch = dspUpdateQueue.requests.splice(0)
        const sourceToBuild = dspUpdateQueue.pendingSource ?? batch[batch.length - 1].source
        const last = batch[batch.length - 1]
        const pendingVm = dspUpdateQueue.pendingVm
        const vmToBuild = (pendingVm && pendingVm.source === sourceToBuild)
          ? pendingVm
          : (last?.vm && last.vm.source === sourceToBuild ? last.vm : undefined)
        dspUpdateQueue.pendingSource = undefined
        dspUpdateQueue.pendingVm = undefined

        try {
          // Bounded so the queue cannot hang forever if a wait primitive gets stuck.
          const result = await Promise.race([
            runQueuedDspUpdate(sourceToBuild, vmToBuild),
            new Promise<string[] | undefined>((_resolve, reject) => {
              setTimeout(() => reject(new Error('DSP update timed out')), 6000)
            }),
          ])
          batch.forEach(({ resolve }) => resolve(result))
        }
        catch (error) {
          batch.forEach(({ reject }) => reject(error))
        }
      }
    }
    finally {
      dspUpdateQueue.isProcessing = false
      if (dspUpdateQueue.requests.length) {
        void processDspQueue()
      }
      else {
        // No more pending requests — clear the public updating flag.
        set({ isUpdatingDsp: false })
      }
    }
  }

  function enqueueDspUpdate(source: string, vm?: VmCompileSnapshot) {
    // Mark that the store is processing updates so UI can show applying state.
    set({ isUpdatingDsp: true })
    return new Promise<string[] | undefined>((resolve, reject) => {
      dspUpdateQueue.requests.push({ source, vm, resolve, reject })
      dspUpdateQueue.pendingSource = source
      dspUpdateQueue.pendingVm = vm
      void processDspQueue()
    })
  }

  async function updateWasmBinaryInner() {
    const runtime = useEngineRuntimeStore.getState()
    if (!runtime.worklet) throw new Error('Worklet not initialized')

    // Prevent stale in-flight uploads from bumping versions after a reload.
    sampleDecodeToken++
    sampleUploadToken++
    sampleUrlByIndex.clear()

    const binary = await fetchWasmBinary()
    const visualBinary = binary.slice(0)
    const sourcemapUrl = new URL('/as/build/index.wasm.map', location.origin).toString()
    async function setWasmBinaryWithReloadIfFailure() {
      if (!runtime.worklet) throw new Error('Worklet not initialized')
      try {
        return await runtime.worklet.setWasmBinary(binary)
      }
      catch (error) {
        console.error('Failed to set WASM binary:', error)
        location.reload()
        throw error
      }
    }
    const { memory, dsp$ } = await setWasmBinaryWithReloadIfFailure()
    const wasmMemory = memory
    const wasmDsp = DspStruct(wasmMemory.buffer, dsp$)
    const wasmDspPtr = dsp$

    const visualWasm = await createVisualWasm(visualBinary, sourcemapUrl)

    runtime.program1?.cleanup()
    runtime.program2?.cleanup()

    runtime.animationManager?.start()

    const program1 = await createProgramInstance(
      runtime.worklet,
      wasmMemory,
      runtime.control!,
    )

    const program2 = await createProgramInstance(
      runtime.worklet,
      wasmMemory,
      runtime.control!,
    )

    wasmDsp.program = program1.program.ptr$

    useEngineRuntimeStore.setState({
      wasmMemory,
      wasmDsp,
      wasmDspPtr,
      visualWasm,
      program1,
      program2,
      isProgramReady: true,
    })

    set({ lastSuccessfulProgramData: undefined })

    const currentSource = get().dspSource
    if (currentSource) {
      // Reapply the current DSP source once the new programs are ready.
      await enqueueDspUpdate(currentSource)
    }
  }

  return {
    sequences: [...DEFAULT_SEQUENCES],
    miniRefs: [],
    miniPlayBars: [],
    timelineRefs: [],
    timelineLabels: [],
    miniSourceMaps: [],
    adRefs: [],
    adsrRefs: [],
    envfollowRefs: [],
    slewRefs: [],
    analyserRefs: [],
    compressorRefs: [],
    expanderRefs: [],
    gateRefs: [],
    limiterRefs: [],
    filterRefs: [],
    reverbRefs: [],
    slicerRefs: [],
    lfoRefs: [],
    everyRefs: [],
    atRefs: [],
    euclidRefs: [],
    arrayLiterals: [],
    branchMarks: [],
    numberParams: [],
    numberLiterals: [],
    sampleDefs: [],
    loadedSamples: [],
    dspSource: localStorage.getItem('lm2:dsp-source') ?? DEFAULT_DSP_SOURCE,

    uiSequences: [...DEFAULT_SEQUENCES],
    uiMiniRefs: [],
    uiMiniPlayBars: [],
    uiTimelineRefs: [],
    uiTimelineLabels: [],
    uiMiniSourceMaps: [],
    uiAdRefs: [],
    uiAdsrRefs: [],
    uiEnvfollowRefs: [],
    uiSlewRefs: [],
    uiAnalyserRefs: [],
    uiCompressorRefs: [],
    uiExpanderRefs: [],
    uiGateRefs: [],
    uiLimiterRefs: [],
    uiLpRefs: [],
    uiReverbRefs: [],
    uiSlicerRefs: [],
    uiLfoRefs: [],
    uiEveryRefs: [],
    uiAtRefs: [],
    uiEuclidRefs: [],
    uiArrayLiterals: [],
    uiBranchMarks: [],
    uiNumberParams: [],
    uiNumberLiterals: [],
    uiSampleDefs: [],
    uiDspSource: localStorage.getItem('lm2:dsp-source') ?? DEFAULT_DSP_SOURCE,

    bars: undefined,
    uiBars: undefined,
    isProgramSwapPending: false,
    isUpdatingDsp: false,
    isPreloadingSamples: false,
    lastSuccessfulProgramData: undefined,

    initialize: async () => {
      const runtime = useEngineRuntimeStore.getState()
      if (runtime.isInitialized) return

      const workletData = await createWorklet()
      const animationManager = new AnimationManager()

      useEngineRuntimeStore.setState({
        ...workletData,
        animationManager,
        isInitialized: true,
      })

      await get().updateWasmBinary()
    },

    dispose: () => {
      const runtime = useEngineRuntimeStore.getState()
      runtime.program1?.cleanup()
      runtime.program2?.cleanup()
      runtime.animationManager?.stop()
      runtime.audioContext?.close()

      useEngineRuntimeStore.setState({
        wasmMemory: undefined,
        wasmDsp: undefined,
        wasmDspPtr: 0,
        visualWasm: undefined,
        program1: undefined,
        program2: undefined,
        animationManager: undefined,
        worklet: undefined,
        audioContext: undefined,
        ringPos: undefined,
        control: undefined,
        bpmValue: undefined,
        globalSampleCount: undefined,
        seekSampleCount: undefined,
        loop: undefined,
        hardLoop: undefined,
        programSwap: undefined,
        programSwapStatus: undefined,
        barsLoopEndSample: undefined,
        isInitialized: false,
        isProgramReady: false,
        playbackState: 'stopped',
        playingLoopId: null,
      })

      set({
        lastSuccessfulProgramData: undefined,
        miniRefs: [],
        miniPlayBars: [],
        timelineRefs: [],
        timelineLabels: [],
        bars: undefined,
        uiBars: undefined,
        miniSourceMaps: [],
        adRefs: [],
        adsrRefs: [],
        envfollowRefs: [],
        slewRefs: [],
        analyserRefs: [],
        compressorRefs: [],
        expanderRefs: [],
        gateRefs: [],
        limiterRefs: [],
        filterRefs: [],
        reverbRefs: [],
        slicerRefs: [],
        lfoRefs: [],
        everyRefs: [],
        atRefs: [],
        arrayLiterals: [],
        branchMarks: [],
        numberParams: [],
        numberLiterals: [],
        uiMiniRefs: [],
        uiMiniPlayBars: [],
        uiTimelineRefs: [],
        uiTimelineLabels: [],
        uiMiniSourceMaps: [],
        uiAdRefs: [],
        uiAdsrRefs: [],
        uiAnalyserRefs: [],
        uiCompressorRefs: [],
        uiLimiterRefs: [],
        uiLpRefs: [],
        uiReverbRefs: [],
        uiSlicerRefs: [],
        uiLfoRefs: [],
        uiEveryRefs: [],
        uiAtRefs: [],
        uiArrayLiterals: [],
        uiBranchMarks: [],
        uiNumberParams: [],
        uiNumberLiterals: [],
        uiSampleDefs: [],
        uiSequences: [],
        uiDspSource: '',
        isProgramSwapPending: false,
        isUpdatingDsp: false,
        sampleDefs: [],
        loadedSamples: [],
      })
    },

    updateDspSource: (source: string, vm?: VmCompileSnapshot) => {
      const runtime = useEngineRuntimeStore.getState()
      if (!runtime.program1 || !runtime.program2) {
        return Promise.resolve(undefined)
      }
      return enqueueDspUpdate(source, vm)
    },

    applyDocsSource: async (loopId: string, source: string, vm?: VmCompileSnapshot) => {
      const runtime = useEngineRuntimeStore.getState()
      if (runtime.playingLoopId !== loopId) return
      if (runtime.playbackState !== 'running') return
      const token = ++docsUpdateToken
      await applyDocsSourceInner(loopId, source, vm, token)
    },

    updateWasmBinary: async () => {
      await updateWasmBinaryInner()
    },

    preloadSamples: async (source: string) => {
      const runtime = useEngineRuntimeStore.getState()
      if (!runtime.audioContext) return
      if (!source) return
      const preloadId = ++samplePreloadId
      set({ isPreloadingSamples: true })
      try {
        samplePreviewTarget.ops.fill(0)
        samplePreviewTarget.literals.fill(0)
        const result = encodeLangToVmOps(source, samplePreviewTarget)
        if (result.errors.length) return
        await scheduleSampleLoad(result.sampleDefs ?? [], { uploadToWorklet: false })
      }
      catch (err) {
        console.warn('Failed to preload samples:', err)
      }
      finally {
        if (preloadId === samplePreloadId) set({ isPreloadingSamples: false })
      }
    },

    playLoop: async (loopId: string, source: string, startSample?: number) => {
      const runtime = useEngineRuntimeStore.getState()
      const ui = useEngineUiStore.getState()
      const prevId = runtime.playingLoopId
      startSample = Math.max(0, Math.floor(startSample ?? ui.viewSampleCountByLoopId[loopId] ?? 0))
      const setSampleCount = async (sample: number) => {
        const nextSample = Math.max(0, Math.floor(sample))
        // Seek while paused/stopped so the new loop doesn't inherit the previous playhead.
        {
          const control = useEngineRuntimeStore.getState().control
          const seekSampleCount = useEngineRuntimeStore.getState().seekSampleCount
          if (control && seekSampleCount) {
            Atomics.store(seekSampleCount, 0, nextSample)
            Atomics.store(control, 0, ControlOp.SeekImmediate)
          }
        }

        // Wait for the worklet to publish the new playhead before "claiming" the loop as playing.
        // This avoids a brief UI smooth from the previous loop's playhead under the new loop id.
        {
          const globalSampleCount = useEngineRuntimeStore.getState().globalSampleCount
          if (globalSampleCount) {
            for (let i = 0; i < 10; i++) {
              const curr = Atomics.load(globalSampleCount, 0)
              if (curr === nextSample) break
              await new Promise<void>(resolve => setTimeout(resolve, 2.5))
            }
          }
        }
      }
      // If the source has compile errors, don't start playback and don't surface it as a runtime error.
      compilePreviewTarget.ops.fill(0)
      compilePreviewTarget.literals.fill(0)
      const preview = encodeLangToVmOps(source, compilePreviewTarget)
      if (preview.errors.length) return
      const vm: VmCompileSnapshot = {
        source,
        ops: new Int32Array(compilePreviewTarget.ops),
        literals: new Float32Array(compilePreviewTarget.literals),
        result: preview,
      }

      // If the requested loop is already playing, avoid reloading or resetting.
      if (prevId === loopId && runtime.playbackState === 'running') return

      const playToken = ++playLoopToken

      // If the requested loop is selected but paused/stopped, apply edits and resume.
      if (prevId === loopId) {
        // Ensure edits made while stopped/paused are applied before audio resumes,
        // so the first chunk doesn't use stale literals/program data.
        await get().updateDspSource(source, vm)

        // Adjust the start sample
        if (startSample != null) await setSampleCount(startSample)

        // Start playback
        runtime.start()
        return
      }

      if (prevId && runtime.globalSampleCount) {
        const prevSample = Math.max(0, Atomics.load(runtime.globalSampleCount, 0))
        ui.setViewSampleCount(prevId, prevSample)
      }

      const wasRunning = runtime.playbackState === 'running'
      if (wasRunning) {
        const control = runtime.control
        const swap = runtime.programSwap
        const swapStatus = runtime.programSwapStatus
        const seekSampleCount = runtime.seekSampleCount
        const dspPtr = runtime.wasmDspPtr
        const primaryProgram = runtime.program1
        const stagingProgram = runtime.program2

        if (!control || !swap || !swapStatus || !seekSampleCount || !dspPtr || !primaryProgram || !stagingProgram) {
          return
        }

        const prevPlayingLoopId = useEngineRuntimeStore.getState().playingLoopId
        useEngineRuntimeStore.getState().setPlayingLoopId(null)
        const restorePlayingLoopIdIfUnset = () => {
          const st = useEngineRuntimeStore.getState()
          if (st.playingLoopId != null) return
          st.setPlayingLoopId(prevPlayingLoopId)
        }

        try {
          const comparisonReference = get().lastSuccessfulProgramData
            ?? primaryProgram.program.data
            ?? stagingProgram.program.data

          const stagingResult = await stagingProgram.program.compileSource(source, {
            apply: false,
            setData: true,
            compareAgainst: comparisonReference,
            copyVersionFrom: comparisonReference,
            vm,
          })

          if (playToken !== playLoopToken) {
            restorePlayingLoopIdIfUnset()
            return
          }

          if (runtime.worklet && runtime.audioContext) {
            void scheduleSampleLoad(stagingResult.sampleDefs, { uploadToWorklet: true })
          }

          if (runtime.bpmValue) {
            runtime.bpmValue[0] = stagingResult.bpm ?? 60 // Default to prelude BPM
          }

          const sequences = stagingResult.sequences
          const miniRefs = stagingResult.miniRefs
          const timelineRefs = stagingResult.timelineRefs
          const bars = stagingResult.bars
          const timelineLabels = buildTimelineLabels(stagingResult.timelineLabels, bars)
          const miniSourceMaps = stagingResult.miniSourceMaps
          const adRefs = stagingResult.adRefs
          const adsrRefs = stagingResult.adsrRefs
          const envfollowRefs = stagingResult.envfollowRefs
          const slewRefs = stagingResult.slewRefs
          const analyserRefs = stagingResult.analyserRefs
          const compressorRefs = stagingResult.compressorRefs
          const expanderRefs = stagingResult.expanderRefs
          const gateRefs = stagingResult.gateRefs
          const limiterRefs = stagingResult.limiterRefs
          const filterRefs = stagingResult.filterRefs
          const reverbRefs = stagingResult.reverbRefs
          const slicerRefs = stagingResult.slicerRefs
          const lfoRefs = stagingResult.lfoRefs
          const everyRefs = stagingResult.everyRefs
          const atRefs = stagingResult.atRefs
          const euclidRefs = stagingResult.euclidRefs
          const arrayLiterals = stagingResult.arrayLiterals
          const branchMarks = stagingResult.branchMarks
          const numberParams = stagingResult.numberParams
          const numberLiterals = stagingResult.numberLiterals
          const sampleDefs: SampleDef[] = stagingResult.sampleDefs ?? []

          const newProgram$ = stagingProgram.program.ptr$
          const bpmBits = f32ToU32(runtime.bpmValue?.[0] ?? 60)

          const globalSampleCount = runtime.globalSampleCount
          if (globalSampleCount) {
            Atomics.store(globalSampleCount, 0, startSample)
          }

          useEngineRuntimeStore.setState({
            program1: stagingProgram,
            program2: primaryProgram,
          })

          set({
            dspSource: source,
            sequences,
            miniRefs,
            timelineRefs,
            timelineLabels,
            bars,
            miniSourceMaps,
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
            numberLiterals,
            sampleDefs,
            lastSuccessfulProgramData: stagingResult.data,
            uiDspSource: source,
            uiSequences: sequences,
            uiMiniRefs: miniRefs,
            uiTimelineRefs: timelineRefs,
            uiTimelineLabels: timelineLabels,
            uiBars: bars,
            uiMiniSourceMaps: miniSourceMaps,
            uiAdRefs: adRefs,
            uiAdsrRefs: adsrRefs,
            uiEnvfollowRefs: envfollowRefs,
            uiSlewRefs: slewRefs,
            uiAnalyserRefs: analyserRefs,
            uiCompressorRefs: compressorRefs,
            uiExpanderRefs: expanderRefs,
            uiGateRefs: gateRefs,
            uiLimiterRefs: limiterRefs,
            uiLpRefs: filterRefs,
            uiReverbRefs: reverbRefs,
            uiSlicerRefs: slicerRefs,
            uiLfoRefs: lfoRefs,
            uiEveryRefs: everyRefs,
            uiAtRefs: atRefs,
            uiEuclidRefs: euclidRefs,
            uiArrayLiterals: arrayLiterals,
            uiBranchMarks: branchMarks,
            uiNumberParams: numberParams,
            uiNumberLiterals: numberLiterals,
            uiSampleDefs: sampleDefs,
            isProgramSwapPending: false,
          })

          runtime.syncBarsHardLoop(bars)
          localStorage.setItem('lm2:dsp-source', source)

          swapStatus.fill(0)
          swap.fill(0)
          Atomics.store(swap, 0, bpmBits)
          Atomics.store(swap, 1, newProgram$)
          Atomics.store(swap, 2, dspPtr)
          Atomics.store(seekSampleCount, 0, startSample)
          Atomics.store(control, 0, ControlOp.RestartWithProgram)

          const restartResult = await waitForSwapResult(swapStatus, 0, 1)
          Atomics.store(swapStatus, 0, 0)
          if (restartResult !== 1) {
            console.warn('Program restart failed; keeping previous playing loop id.')
            if (playToken === playLoopToken) {
              useEngineRuntimeStore.getState().setPlayingLoopId(prevPlayingLoopId)
            }
            else {
              restorePlayingLoopIdIfUnset()
            }
            return
          }

          if (playToken !== playLoopToken) {
            restorePlayingLoopIdIfUnset()
            return
          }
          useEngineRuntimeStore.getState().setPlayingLoopId(loopId)
          return
        }
        catch (err) {
          if (playToken === playLoopToken) {
            useEngineRuntimeStore.getState().setPlayingLoopId(prevPlayingLoopId)
            throw err
          }
          restorePlayingLoopIdIfUnset()
          return
        }
      }

      await get().updateDspSource(source, vm)

      await setSampleCount(startSample)

      if (runtime.globalSampleCount) {
        Atomics.store(runtime.globalSampleCount, 0, startSample)
      }
      // If another play request superseded this one (e.g. intro boot vs user click),
      // don't "claim" the loop or start the transport from this stale invocation.
      if (playToken !== playLoopToken) return

      // Set view sample count to ensure it's synchronized
      ui.setViewSampleCount(loopId, startSample)
      useEngineRuntimeStore.getState().setPlayingLoopId(loopId)

      // setSampleCount already waited for the seek to complete (checks globalSampleCount).
      // Start playback directly - don't call start() which would do another seek when stopped.
      const current = useEngineRuntimeStore.getState()
      if (current.control) {
        await current.audioContext?.resume()
        await new Promise<void>(resolve => setTimeout(resolve))
        Atomics.store(current.control, 0, ControlOp.Start)
        useEngineRuntimeStore.setState({ playbackState: 'running' })
      }
    },

    setUiCompilePreview: next => {
      set({
        uiDspSource: next.source,
        uiSequences: next.sequences,
        uiMiniRefs: next.miniRefs,
        uiMiniPlayBars: next.miniPlayBars,
        uiTimelineRefs: next.timelineRefs,
        uiTimelineLabels: next.timelineLabels,
        uiBars: next.bars,
        uiMiniSourceMaps: next.miniSourceMaps,
        uiAnalyserRefs: next.analyserRefs,
        uiCompressorRefs: next.compressorRefs,
        uiExpanderRefs: next.expanderRefs,
        uiGateRefs: next.gateRefs,
        uiLpRefs: next.filterRefs,
        uiSlicerRefs: next.slicerRefs,
        uiLfoRefs: next.lfoRefs,
        uiEveryRefs: next.everyRefs,
        uiAtRefs: next.atRefs,
        uiEuclidRefs: next.euclidRefs,
        uiArrayLiterals: next.arrayLiterals,
        uiBranchMarks: next.branchMarks,
        uiNumberParams: next.numberParams,
        uiSampleDefs: next.sampleDefs,
      })
    },
  }
})

async function fetchWasmBinary() {
  const wasmUrl = new URL('/as/build/index.wasm', location.origin).toString()
  const response = await fetch(wasmUrl + '?t=' + Date.now())
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`)
  }
  const binary = await response.arrayBuffer()
  return binary
}

async function createWorklet() {
  const audioContext = new AudioContext({ latencyHint: 1 })
  window.addEventListener('pointerdown', () => {
    audioContext.resume()
  }, { once: true })
  const moduleUrl = new URL(workletUrl, window.location.origin).toString()
  await audioContext.audioWorklet.addModule(moduleUrl)
  const sourcemapUrl = new URL('/as/build/index.wasm.map', location.origin).toString()
  const ringPos = new Uint8Array(new SharedArrayBuffer(1 * Uint8Array.BYTES_PER_ELEMENT))
  const control = new Uint32Array(new SharedArrayBuffer(1 * Uint32Array.BYTES_PER_ELEMENT))
  const bpmValue = new Float32Array(new SharedArrayBuffer(1 * Float32Array.BYTES_PER_ELEMENT))
  bpmValue[0] = 60
  const globalSampleCount = new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT))
  globalSampleCount[0] = 0
  const seekSampleCount = new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT))
  seekSampleCount[0] = 0
  const loop = new Int32Array(new SharedArrayBuffer(3 * Int32Array.BYTES_PER_ELEMENT))
  loop[0] = 0
  loop[1] = 0
  loop[2] = 0
  const hardLoop = new Int32Array(new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT))
  hardLoop[0] = 0
  hardLoop[1] = 0
  const programSwap = new Uint32Array(
    new SharedArrayBuffer(3 * MAX_DSP_INSTANCES * Uint32Array.BYTES_PER_ELEMENT),
  )
  const programSwapStatus = new Int32Array(
    new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT),
  )
  const dsp = new AudioWorkletNode(audioContext, 'dsp', {
    outputChannelCount: [2],
    processorOptions: {
      sourcemapUrl,
      ringPos,
      control,
      bpmValue,
      globalSampleCount,
      seekSample: seekSampleCount,
      loop,
      hardLoop,
      programSwap,
      swapStatus: programSwapStatus,
    },
  } satisfies DspProcessorOptions)
  dsp.connect(audioContext.destination)
  const worklet = rpc<DspProcessor>(dsp.port)
  return {
    ringPos,
    control,
    bpmValue,
    globalSampleCount,
    seekSampleCount,
    loop,
    hardLoop,
    programSwap,
    worklet,
    audioContext,
    programSwapStatus,
  }
}

async function waitForSwapResult(
  status: Int32Array,
  resultIndex: number,
  eventIndex: number,
  timeoutMs: number = 500,
) {
  return await waitForNonZero(status, resultIndex, eventIndex, timeoutMs, { pollMs: 8 })
}

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', async () => {
    const { isInitialized } = useEngineRuntimeStore.getState()
    if (isInitialized) {
      await useEngineDspStore.getState().updateWasmBinary()
    }
  })
}
