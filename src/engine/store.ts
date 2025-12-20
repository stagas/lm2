import { rpc } from 'utils/rpc'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  MAX_DSP_INSTANCES,
} from '../../as/assembly/constants.ts'
import { type Dsp, DspStruct } from '../assembly.ts'
import type {
  AnalyserRef,
  ArrayLiteralRef,
  MiniSequenceRef,
  NumberWithParamsInfo,
  TimelineLabel,
  TimelineSequenceRef,
} from '../bytecode.ts'
import { extractBarsFromSource, extractBpmFromSource, extractTimelineLabelsFromSource } from '../bytecode.ts'
import { AnimationManager } from '../lib/animation-manager.ts'
import type { SourceLocation } from '../lib/mini-source-map.ts'
import { ControlOp } from '../worklet-shared.ts'
import workletUrl from '../worklet.js?worker&url'
import type { DspProcessor, DspProcessorOptions } from '../worklet.ts'
import { DEFAULT_DSP_SOURCE, DEFAULT_SEQUENCES } from './constants.ts'
import { createProgramInstance, type ProgramDataView, type ProgramInstance } from './program.ts'

type PlaybackState = 'stopped' | 'running' | 'paused'

type EngineState = {
  wasmMemory?: WebAssembly.Memory
  wasmDsp?: Dsp
  wasmDspPtr: number
  program1?: ProgramInstance
  program2?: ProgramInstance
  animationManager?: AnimationManager
  worklet?: ReturnType<typeof rpc<DspProcessor>>
  audioContext?: AudioContext
  ringPos?: Uint8Array<SharedArrayBuffer>
  control?: Uint32Array<SharedArrayBuffer>
  bpmValue?: Float32Array<SharedArrayBuffer>
  globalSampleCount?: Int32Array<SharedArrayBuffer>
  seekSampleCount?: Int32Array<SharedArrayBuffer>
  loop?: Int32Array<SharedArrayBuffer>
  hardLoop?: Int32Array<SharedArrayBuffer>
  bars?: number
  uiBars?: number
  barsLoopEndSample?: number
  programSwap?: Uint32Array<SharedArrayBuffer>
  programSwapStatus?: Int32Array<SharedArrayBuffer>
  prepareDsp?: Uint32Array<SharedArrayBuffer>
  prepareDspStatus?: Int32Array<SharedArrayBuffer>
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  analyserRefs: AnalyserRef[]
  arrayLiterals: ArrayLiteralRef[]
  numberParams: NumberWithParamsInfo[]
  dspSource: string
  // UI-facing compilation results. These are updated as soon as we have a
  // successful compile, even if the worklet is still crossfading programs.
  uiSequences: string[]
  uiMiniRefs: MiniSequenceRef[]
  uiTimelineRefs: TimelineSequenceRef[]
  uiTimelineLabels: TimelineLabel[]
  uiMiniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  uiAnalyserRefs: AnalyserRef[]
  uiArrayLiterals: ArrayLiteralRef[]
  uiNumberParams: NumberWithParamsInfo[]
  uiDspSource: string
  isProgramSwapPending: boolean
  isUpdatingDsp: boolean
  isInitialized: boolean
  isProgramReady: boolean
  playbackState: PlaybackState
  lastSuccessfulProgramData?: ProgramDataView

  initialize: () => Promise<void>
  dispose: () => void
  updateDspSource: (source: string) => Promise<string[] | undefined>
  updateWasmBinary: () => Promise<void>
  start: () => void
  pause: () => void
  stop: () => void

  setLoop: (startSample: number, endSample: number) => void
  clearLoop: () => void
}

type PendingDspUpdate = {
  source: string
  resolve: (value: string[] | undefined) => void
  reject: (reason: unknown) => void
}

export const useEngineStore = create<EngineState>((set, get) => {
  const dspUpdateQueue = {
    isProcessing: false,
    pendingSource: undefined as string | undefined,
    requests: [] as PendingDspUpdate[],
  }

  function buildTimelineLabels(labels: TimelineLabel[], bars: number | undefined): TimelineLabel[] {
    const sorted = [...labels].sort((a, b) => a.bar - b.bar)
    if (bars === undefined) return sorted

    const endBar = bars + 1
    const hasEnd = sorted.some(l => l.bar === endBar && l.text === 'End')
    if (hasEnd) return sorted

    return [
      ...sorted,
      {
        bar: endBar,
        text: 'End',
        color: 'rgba(255, 220, 0, 0.85)',
        loc: { line: 1, column: 1, length: 1 },
      },
    ]
  }

  function syncBarsHardLoop(bars: number | undefined): void {
    const state = get()
    const hardLoop = state.hardLoop
    const audioContext = state.audioContext
    if (!hardLoop || !audioContext) return

    const prevEnd = state.barsLoopEndSample

    if (bars === undefined) {
      Atomics.store(hardLoop, 0, 0)
      Atomics.store(hardLoop, 1, 0)
      if (prevEnd !== undefined) set({ barsLoopEndSample: undefined })
      return
    }

    const bpm = state.bpmValue?.[0] || 60
    const barLengthSeconds = (4 * 60) / bpm
    const totalSeconds = bars * barLengthSeconds
    const endSample = Math.max(1, Math.floor(totalSeconds * audioContext.sampleRate))

    Atomics.store(hardLoop, 1, endSample)
    Atomics.store(hardLoop, 0, 1)

    if (prevEnd !== endSample) {
      set({ barsLoopEndSample: endSample })
    }
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
    const match = token.match(/^-?\d*\.?\d*/)
    const raw = match?.[0] ?? ''
    if (!raw) return null
    const value = Number.parseFloat(raw)
    if (!Number.isFinite(value)) return null
    return { value, range: { start, end } }
  }

  async function tryApplyLiteralOnlyUpdate(source: string): Promise<string[] | undefined> {
    const state = get()
    const primaryProgram = state.program1
    if (!primaryProgram) return undefined
    if (!state.lastSuccessfulProgramData) return undefined
    if (state.numberParams.length === 0) return undefined

    const oldSource = state.dspSource
    const oldStarts = lineStarts(oldSource)
    const newStarts = lineStarts(source)
    const ranges: Array<{ start: number; end: number }> = []

    const updates: Array<{ index: number; value: number }> = []
    const nextNumberParams: NumberWithParamsInfo[] = []

    for (const info of state.numberParams) {
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

      nextNumberParams.push({ ...info, value: newRead.value })
    }

    const oldNorm = normalizeSourceWithRanges(oldSource, ranges.filter((_, i) => i % 2 === 0))
    const newNorm = normalizeSourceWithRanges(source, ranges.filter((_, i) => i % 2 === 1))
    if (oldNorm !== newNorm) return undefined

    const extracted = extractTimelineLabelsFromSource(source)
    if (extracted.errors.length) return undefined

    const bpmExtracted = extractBpmFromSource(source)
    if (bpmExtracted.errors.length) return undefined
    if (bpmExtracted.bpm !== undefined && state.bpmValue) {
      state.bpmValue[0] = bpmExtracted.bpm
    }

    const barsExtracted = extractBarsFromSource(source)
    if (barsExtracted.errors.length) return undefined

    const bars = barsExtracted.bars
    const nextTimelineLabels = buildTimelineLabels(extracted.labels, bars)
    syncBarsHardLoop(bars)

    if (updates.length === 0) {
      set({
        dspSource: source,
        numberParams: nextNumberParams,
        timelineLabels: nextTimelineLabels,
        bars,
        uiDspSource: source,
        uiNumberParams: nextNumberParams,
        uiTimelineLabels: nextTimelineLabels,
        uiBars: bars,
      })
      localStorage.setItem('engine2:dsp-source', source)
      return state.sequences
    }

    for (const u of updates) {
      await primaryProgram.program.writeLiteral(u.index, u.value)
    }

    set({
      dspSource: source,
      numberParams: nextNumberParams,
      timelineLabels: nextTimelineLabels,
      bars,
      uiDspSource: source,
      uiNumberParams: nextNumberParams,
      uiTimelineLabels: nextTimelineLabels,
      uiBars: bars,
    })
    localStorage.setItem('engine2:dsp-source', source)
    return state.sequences
  }

  async function runQueuedDspUpdate(source: string): Promise<string[] | undefined> {
    const state = get()
    if (!state.program1 || !state.program2) return undefined

    if (state.lastSuccessfulProgramData && state.dspSource === source) {
      return state.sequences
    }

    try {
      const literalOnly = await tryApplyLiteralOnlyUpdate(source)
      if (literalOnly) return literalOnly

      const primaryProgram = state.program1
      const stagingProgram = state.program2

      const comparisonReference = state.lastSuccessfulProgramData ?? primaryProgram.program.data
        ?? state.program2?.program.data

      const primaryResult = await primaryProgram.program.compileSource(source, {
        apply: false,
        setData: false,
        compareAgainst: comparisonReference,
      })

      if (primaryResult.bpm !== undefined && state.bpmValue) {
        state.bpmValue[0] = primaryResult.bpm
      }

      const sequences = primaryResult.sequences
      const miniRefs = primaryResult.miniRefs
      const timelineRefs = primaryResult.timelineRefs
      const bars = primaryResult.bars
      const timelineLabels = buildTimelineLabels(primaryResult.timelineLabels, bars)
      const miniSourceMaps = primaryResult.miniSourceMaps
      const analyserRefs = primaryResult.analyserRefs
      const arrayLiterals = primaryResult.arrayLiterals
      const numberParams = primaryResult.numberParams

      if (!primaryResult.diff.significantChange) {
        if (primaryResult.bpm !== undefined && state.bpmValue) {
          const oldBpm = state.bpmValue[0]
          state.bpmValue[0] = primaryResult.bpm
          state.worklet?.syncBpm(oldBpm, primaryResult.bpm)
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
          arrayLiterals,
          numberParams,
          lastSuccessfulProgramData: primaryResult.data,
          uiDspSource: source,
          uiSequences: sequences,
          uiMiniRefs: miniRefs,
          uiTimelineRefs: timelineRefs,
          uiTimelineLabels: timelineLabels,
          uiBars: bars,
          uiMiniSourceMaps: miniSourceMaps,
          uiAnalyserRefs: analyserRefs,
          uiArrayLiterals: arrayLiterals,
          uiNumberParams: numberParams,
          isProgramSwapPending: false,
        })
        syncBarsHardLoop(bars)
        localStorage.setItem('engine2:dsp-source', source)
        return sequences
      }

      const stagingResult = await stagingProgram.program.compileSource(source, {
        apply: false,
        setData: true,
        compareAgainst: primaryResult.previousData,
        copyVersionFrom: primaryResult.previousData,
      })

      const swap = state.programSwap
      const control = state.control
      const dspPtr = state.wasmDspPtr
      const swapStatus = state.programSwapStatus
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
        uiAnalyserRefs: stagingResult.analyserRefs,
        uiArrayLiterals: stagingResult.arrayLiterals,
        uiNumberParams: stagingResult.numberParams,
        isProgramSwapPending: true,
      })

      swapStatus.fill(0)
      swap.fill(0)

      if (stagingResult.bpm !== undefined && state.bpmValue) {
        const oldBpm = state.bpmValue[0]
        state.bpmValue[0] = stagingResult.bpm
        state.worklet?.syncBpm(oldBpm, stagingResult.bpm)
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
        const nextControl = get().playbackState === 'running' ? ControlOp.Start : ControlOp.Pause
        Atomics.store(control, 0, nextControl)
      }

      if (swapResult !== 1) {
        console.warn('Program swap failed; will retry against the last-known program on the next update.')
        const current = get()
        set({
          uiDspSource: current.dspSource,
          uiSequences: current.sequences,
          uiMiniRefs: current.miniRefs,
          uiTimelineRefs: current.timelineRefs,
          uiTimelineLabels: current.timelineLabels,
          uiBars: current.bars,
          uiMiniSourceMaps: current.miniSourceMaps,
          uiAnalyserRefs: current.analyserRefs,
          uiArrayLiterals: current.arrayLiterals,
          uiNumberParams: current.numberParams,
          isProgramSwapPending: false,
        })
        return undefined
      }

      const committedBars = stagingResult.bars
      const committedLabels = buildTimelineLabels(stagingResult.timelineLabels, committedBars)
      set({
        dspSource: source,
        sequences,
        miniRefs: stagingResult.miniRefs,
        timelineRefs: stagingResult.timelineRefs,
        timelineLabels: committedLabels,
        bars: committedBars,
        miniSourceMaps: stagingResult.miniSourceMaps,
        analyserRefs: stagingResult.analyserRefs,
        arrayLiterals: stagingResult.arrayLiterals,
        numberParams: stagingResult.numberParams,
        uiDspSource: source,
        uiSequences: sequences,
        uiMiniRefs: stagingResult.miniRefs,
        uiTimelineRefs: stagingResult.timelineRefs,
        uiTimelineLabels: committedLabels,
        uiBars: committedBars,
        uiMiniSourceMaps: stagingResult.miniSourceMaps,
        uiAnalyserRefs: stagingResult.analyserRefs,
        uiArrayLiterals: stagingResult.arrayLiterals,
        uiNumberParams: stagingResult.numberParams,
        isProgramSwapPending: false,
        ...swappedPrograms,
        lastSuccessfulProgramData: stagingProgram.program.data,
      })

      syncBarsHardLoop(committedBars)
      localStorage.setItem('engine2:dsp-source', source)
      return sequences
    }
    catch (error) {
      set({ isProgramSwapPending: false })
      console.error('Failed to build program:', error)
      throw error
    }
  }

  async function processDspQueue() {
    if (dspUpdateQueue.isProcessing) return
    dspUpdateQueue.isProcessing = true
    try {
      while (dspUpdateQueue.requests.length) {
        const batch = dspUpdateQueue.requests.splice(0)
        const sourceToBuild = dspUpdateQueue.pendingSource ?? batch[batch.length - 1].source
        dspUpdateQueue.pendingSource = undefined

        try {
          const result = await runQueuedDspUpdate(sourceToBuild)
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

  function enqueueDspUpdate(source: string) {
    // Mark that the store is processing updates so UI can show applying state.
    set({ isUpdatingDsp: true })
    return new Promise<string[] | undefined>((resolve, reject) => {
      dspUpdateQueue.requests.push({ source, resolve, reject })
      dspUpdateQueue.pendingSource = source
      void processDspQueue()
    })
  }

  return {
    wasmDspPtr: 0,
    sequences: [...DEFAULT_SEQUENCES],
    miniRefs: [],
    timelineRefs: [],
    timelineLabels: [],
    bars: undefined,
    uiBars: undefined,
    barsLoopEndSample: undefined,
    miniSourceMaps: [],
    analyserRefs: [],
    arrayLiterals: [],
    numberParams: [],
    dspSource: localStorage.getItem('engine2:dsp-source') ?? DEFAULT_DSP_SOURCE,
    uiSequences: [...DEFAULT_SEQUENCES],
    uiMiniRefs: [],
    uiTimelineRefs: [],
    uiTimelineLabels: [],
    uiMiniSourceMaps: [],
    uiAnalyserRefs: [],
    uiArrayLiterals: [],
    uiNumberParams: [],
    uiDspSource: localStorage.getItem('engine2:dsp-source') ?? DEFAULT_DSP_SOURCE,
    isProgramSwapPending: false,
    isUpdatingDsp: false,
    isInitialized: false,
    isProgramReady: false,
    playbackState: 'stopped',
    lastSuccessfulProgramData: undefined,

    initialize: async () => {
      const state = get()
      if (state.isInitialized) return

      const workletData = await createWorklet()
      const animationManager = new AnimationManager()

      set({
        ...workletData,
        animationManager,
        isInitialized: true,
      })

      await get().updateWasmBinary()
    },

    dispose: () => {
      const state = get()
      state.program1?.cleanup()
      state.program2?.cleanup()
      state.animationManager?.stop()
      state.audioContext?.close()

      set({
        wasmMemory: undefined,
        wasmDsp: undefined,
        wasmDspPtr: 0,
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
        prepareDsp: undefined,
        prepareDspStatus: undefined,
        lastSuccessfulProgramData: undefined,
        miniRefs: [],
        timelineRefs: [],
        timelineLabels: [],
        bars: undefined,
        uiBars: undefined,
        barsLoopEndSample: undefined,
        miniSourceMaps: [],
        analyserRefs: [],
        arrayLiterals: [],
        numberParams: [],
        uiMiniRefs: [],
        uiTimelineRefs: [],
        uiTimelineLabels: [],
        uiMiniSourceMaps: [],
        uiAnalyserRefs: [],
        uiArrayLiterals: [],
        uiNumberParams: [],
        uiSequences: [],
        uiDspSource: '',
        isProgramSwapPending: false,
        isInitialized: false,
        isProgramReady: false,
        playbackState: 'stopped',
      })
    },

    updateDspSource: (source: string) => {
      const state = get()
      if (!state.program1 || !state.program2) {
        return Promise.resolve(undefined)
      }
      return enqueueDspUpdate(source)
    },

    updateWasmBinary: async () => {
      const state = get()
      if (!state.worklet) throw new Error('Worklet not initialized')

      const binary = await fetchWasmBinary()
      const { memory, dsp$ } = await state.worklet.setWasmBinary(binary)
      const wasmMemory = memory
      const wasmDsp = DspStruct(wasmMemory.buffer, dsp$)
      const wasmDspPtr = dsp$

      state.program1?.cleanup()
      state.program2?.cleanup()

      state.animationManager?.start()

      const program1 = await createProgramInstance(
        state.worklet,
        wasmMemory,
        wasmDspPtr,
        state.prepareDsp!,
        state.prepareDspStatus!,
        state.control!,
      )

      const program2 = await createProgramInstance(
        state.worklet,
        wasmMemory,
        wasmDspPtr,
        state.prepareDsp!,
        state.prepareDspStatus!,
        state.control!,
      )

      wasmDsp.program = program1.program.ptr$

      set({
        wasmMemory,
        wasmDsp,
        wasmDspPtr,
        program1,
        program2,
        isProgramReady: true,
        lastSuccessfulProgramData: undefined,
      })

      const currentSource = get().dspSource
      if (currentSource) {
        // Reapply the current DSP source once the new programs are ready.
        await enqueueDspUpdate(currentSource)
      }
    },

    start: () => {
      const state = get()
      if (!state.control) return
      Atomics.store(state.control, 0, ControlOp.Start)
      set({ playbackState: 'running' })
    },

    pause: () => {
      const state = get()
      if (!state.control) return
      Atomics.store(state.control, 0, ControlOp.Pause)
      set({ playbackState: 'paused' })
    },

    stop: () => {
      const state = get()
      if (!state.control) return
      Atomics.store(state.control, 0, ControlOp.Stop)
      set({ playbackState: 'stopped' })
    },

    setLoop: (startSample: number, endSample: number) => {
      const state = get()
      const loop = state.loop
      if (!loop) return
      const start = Math.max(0, Math.floor(startSample))
      const end = Math.max(0, Math.floor(endSample))
      if (end <= start) return
      Atomics.store(loop, 1, start)
      Atomics.store(loop, 2, end)
      Atomics.store(loop, 0, 1)
    },

    clearLoop: () => {
      const state = get()
      const loop = state.loop
      if (!loop) return
      Atomics.store(loop, 0, 0)
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
  const audioContext = new AudioContext({ latencyHint: 0.05 })
  window.addEventListener('pointerdown', () => {
    audioContext.resume()
  }, { once: true })
  await audioContext.audioWorklet.addModule(workletUrl)
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
  const prepareDsp = new Uint32Array(new SharedArrayBuffer(1 * Uint32Array.BYTES_PER_ELEMENT))
  const prepareDspStatus = new Int32Array(new SharedArrayBuffer(2 * Int32Array.BYTES_PER_ELEMENT))
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
      prepareDsp,
      swapStatus: programSwapStatus,
      prepareDspStatus,
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
    prepareDsp,
    prepareDspStatus,
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
  const deadline = performance.now() + timeoutMs
  Atomics.store(status, eventIndex, 0)
  while (true) {
    const currentResult = Atomics.load(status, resultIndex)
    if (currentResult !== 0) {
      return currentResult
    }
    const remaining = deadline - performance.now()
    if (remaining <= 0) {
      return 0
    }
    const waitResult = await Atomics.waitAsync(status, eventIndex, 0, remaining).value
    if (waitResult === 'timed-out') {
      return 0
    }
  }
}

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', async () => {
    const { isInitialized, updateWasmBinary } = useEngineStore.getState()
    if (isInitialized) {
      await updateWasmBinary()
    }
  })
}

interface FontState {
  currentFont: string
  previewFont: string | null
  setFont: (font: string) => void
  setPreviewFont: (font: string | null) => void
}

export const useFontStore = create<FontState>()(
  // persist(
  set => ({
    currentFont: 'Space Mono',
    previewFont: null,
    setFont: (font: string) => set({ currentFont: font }),
    setPreviewFont: (previewFont: string | null) => set({ previewFont }),
  }),
  // {
  //   name: 'dspscript-font',
  // },
  // ),
)
