import { rpc } from 'utils/rpc'
import { create } from 'zustand'
import {
  MAX_DSP_INSTANCES,
} from '../../as/assembly/constants.ts'
import { type Dsp, DspStruct } from '../assembly.ts'
import { AnimationManager } from '../lib/animation-manager.ts'
import { ControlOp } from '../worklet-shared.ts'
import workletUrl from '../worklet.js?worker&url'
import type { DspProcessor, DspProcessorOptions } from '../worklet.ts'
import { DEFAULT_DSP_SOURCE, DEFAULT_SEQUENCES } from './constants.ts'
import { createProgramInstance, type Program } from './program.ts'

type PlaybackState = 'stopped' | 'running' | 'paused'

type EngineState = {
  wasmMemory?: WebAssembly.Memory
  wasmDsp?: Dsp
  wasmDspPtr: number
  program1?: { program: Program; cleanup: () => void }
  program2?: { program: Program; cleanup: () => void }
  animationManager?: AnimationManager
  worklet?: ReturnType<typeof rpc<DspProcessor>>
  audioContext?: AudioContext
  ringPos?: Uint8Array
  control?: Uint32Array
  bpmValue?: Float32Array
  globalSampleCount?: Int32Array
  programSwap?: Uint32Array
  prepareDsp?: Uint32Array
  sequences: string[]
  dspSource: string
  isInitialized: boolean
  isProgramReady: boolean
  playbackState: PlaybackState

  initialize: () => Promise<void>
  dispose: () => void
  updateDspSource: (source: string) => Promise<void>
  updateWasmBinary: () => Promise<void>
  start: () => void
  pause: () => void
  stop: () => void
}

export const useEngineStore = create<EngineState>((set, get) => ({
  wasmDspPtr: 0,
  sequences: [...DEFAULT_SEQUENCES],
  dspSource: localStorage.getItem('engine2:dsp-source') ?? DEFAULT_DSP_SOURCE,
  isInitialized: false,
  isProgramReady: false,
  playbackState: 'stopped',

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
      prepareDsp: undefined,
      isInitialized: false,
      isProgramReady: false,
      playbackState: 'stopped',
    })
  },

  updateDspSource: async (source: string) => {
    const state = get()
    if (!state.program1) return

    try {
      const sequences = await state.program1.program.buildFromSource(source)

      set({ dspSource: source, sequences })
      localStorage.setItem('engine2:dsp-source', source)
    }
    catch (error) {
      console.error('Failed to build program:', error)
      throw error
    }
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

    const program1 = await createProgramInstance(state.worklet, wasmMemory, wasmDspPtr, state.prepareDsp!,
      state.control!)

    wasmDsp.program = program1.program.ptr$

    set({
      wasmMemory,
      wasmDsp,
      wasmDspPtr,
      program1,
      isProgramReady: true,
    })
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
}))

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
  const prepareDsp = new Uint32Array(new SharedArrayBuffer(1 * Uint32Array.BYTES_PER_ELEMENT))
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
    worklet,
    audioContext,
  }
}
