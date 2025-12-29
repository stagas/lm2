import { rpc } from 'utils/rpc'
import { create } from 'zustand'
import { useAppStore } from '../../app/store.ts'
import { AnimationManager } from '../../lib/animation-manager.ts'
import type { Dsp } from '../dsp/assembly.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import type { VisualWasm } from '../dsp/visual-wasm.ts'
import { ControlOp } from '../dsp/worklet-shared.ts'
import type { DspProcessor } from '../dsp/worklet.ts'
import type { Loop } from '../ui/loop.ts'
import { useEngineUiStore } from './ui.ts'

export type PlaybackState = 'stopped' | 'running' | 'paused'

export type EngineRuntimeState = {
  playingLoopId: string | null
  currentLoop: Loop | null
  currentLoopId: string | null
  wasmMemory?: WebAssembly.Memory
  wasmDsp?: Dsp
  wasmDspPtr: number
  visualWasm?: VisualWasm
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
  barsLoopEndSample?: number
  programSwap?: Uint32Array<SharedArrayBuffer>
  programSwapStatus?: Int32Array<SharedArrayBuffer>
  isInitialized: boolean
  isProgramReady: boolean
  playbackState: PlaybackState

  setCurrentLoop: (loop: Loop | null) => void

  setPlayingLoopId: (loopId: string | null) => void
  start: () => void
  pause: () => void
  stop: () => void
  setLoop: (startSample: number, endSample: number) => void
  clearLoop: () => void
  syncBarsHardLoop: (bars: number | undefined) => void
}

export const useEngineRuntimeStore = create<EngineRuntimeState>((set, get) => {
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

  return {
    playingLoopId: null,
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
    barsLoopEndSample: undefined,
    programSwap: undefined,
    programSwapStatus: undefined,
    isInitialized: false,
    isProgramReady: false,
    playbackState: 'stopped',
    currentLoop: null,
    currentLoopId: null,

    setPlayingLoopId: (loopId: string | null) => {
      set({ playingLoopId: loopId })
    },

    setCurrentLoop: loop => {
      set({
        currentLoop: loop,
        currentLoopId: loop?.data.id ?? null,
      })
    },

    start: () => {
      const state = get()
      if (!state.control) return
      if (state.playbackState === 'stopped' && state.seekSampleCount && state.playingLoopId) {
        const uiTarget = useEngineUiStore.getState().viewSampleCountByLoopId[state.playingLoopId]
        const prevTarget = Atomics.load(state.seekSampleCount, 0)
        const target = Math.max(0, Math.floor(uiTarget ?? prevTarget))
        Atomics.store(state.seekSampleCount, 0, target)
        if (state.globalSampleCount) Atomics.store(state.globalSampleCount, 0, target)
        Atomics.store(state.control, 0, ControlOp.SeekImmediate)
        setTimeout(() => {
          const next = get()
          if (!next.control) return
          Atomics.store(next.control, 0, ControlOp.Start)
          set({ playbackState: 'running' })
        }, 2.5)
        return
      }

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
      const ui = useEngineUiStore.getState()
      const app = useAppStore.getState()
      if (app.selectedLoopId) {
        ui.setViewSampleCount(app.selectedLoopId, 0)
      }
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

    syncBarsHardLoop,
  }
})
