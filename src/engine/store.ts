import { rpc } from 'utils/rpc'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import {
  MAX_DSP_INSTANCES,
} from '../../as/assembly/constants.ts'
import { type Dsp, DspStruct } from '../assembly.ts'
import type { MiniSequenceRef } from '../bytecode.ts'
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
  programSwap?: Uint32Array<SharedArrayBuffer>
  programSwapStatus?: Int32Array<SharedArrayBuffer>
  prepareDsp?: Uint32Array<SharedArrayBuffer>
  prepareDspStatus?: Int32Array<SharedArrayBuffer>
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  dspSource: string
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

  async function runQueuedDspUpdate(source: string): Promise<string[] | undefined> {
    const state = get()
    if (!state.program1 || !state.program2) return undefined

    if (state.lastSuccessfulProgramData && state.dspSource === source) {
      return state.sequences
    }

    try {
      const primaryProgram = state.program1
      const stagingProgram = state.program2

      const comparisonReference = state.lastSuccessfulProgramData ?? primaryProgram.program.data
        ?? state.program2?.program.data

      const primaryResult = await primaryProgram.program.compileSource(source, {
        apply: false,
        setData: false,
        compareAgainst: comparisonReference,
      })

      const sequences = primaryResult.sequences
      const miniRefs = primaryResult.miniRefs
      const miniSourceMaps = primaryResult.miniSourceMaps

      if (!primaryResult.diff.significantChange) {
        await primaryProgram.program.applyPreparedData(primaryResult.data)
        set({
          dspSource: source,
          sequences,
          miniRefs,
          miniSourceMaps,
          lastSuccessfulProgramData: primaryResult.data,
        })
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

      swapStatus.fill(0)
      swap.fill(0)
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

      if (swapResult !== 1) {
        console.warn('Program swap failed; will retry against the last-known program on the next update.')
        return undefined
      }

      set({
        dspSource: source,
        sequences,
        miniRefs: stagingResult.miniRefs,
        miniSourceMaps: stagingResult.miniSourceMaps,
        ...swappedPrograms,
        lastSuccessfulProgramData: stagingProgram.program.data,
      })

      localStorage.setItem('engine2:dsp-source', source)
      return sequences
    }
    catch (error) {
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
    miniSourceMaps: [],
    dspSource: localStorage.getItem('engine2:dsp-source') ?? DEFAULT_DSP_SOURCE,
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
        programSwap: undefined,
        programSwapStatus: undefined,
        prepareDsp: undefined,
        prepareDspStatus: undefined,
        lastSuccessfulProgramData: undefined,
        miniRefs: [],
        miniSourceMaps: [],
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
  await audioContext.audioWorklet.addModule(workletUrl)
  const sourcemapUrl = new URL('/as/build/index.wasm.map', location.origin).toString()
  const ringPos = new Uint8Array(new SharedArrayBuffer(1 * Uint8Array.BYTES_PER_ELEMENT))
  const control = new Uint32Array(new SharedArrayBuffer(1 * Uint32Array.BYTES_PER_ELEMENT))
  const bpmValue = new Float32Array(new SharedArrayBuffer(1 * Float32Array.BYTES_PER_ELEMENT))
  bpmValue[0] = 60
  const globalSampleCount = new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT))
  globalSampleCount[0] = 0
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
  timeoutMs: number = 2000,
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
  persist(
    set => ({
      currentFont: 'IBM Plex Mono',
      previewFont: null,
      setFont: (font: string) => set({ currentFont: font }),
      setPreviewFont: (previewFont: string | null) => set({ previewFont }),
    }),
    {
      name: 'dspscript-font',
    },
  ),
)
