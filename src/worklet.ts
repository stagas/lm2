import { type Ring, toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import { ARRAYS_COUNT, CHUNK_SIZE, HISTORIES_COUNT, MAX_DSP_INSTANCES,
  RING_BUFFER_SIZE } from '../as/assembly/constants.ts'
import type * as WasmExports from '../as/build/index.d.ts'
import config from '../asconfig.json'
import { DspStruct } from './assembly.ts'
import { type WasmSetup, wasmSetup } from './lib/wasm-setup.ts'
import { ControlOp } from './worklet-shared.ts'

type DspInstance = {
  dsp$: number
  view: ReturnType<typeof DspStruct>
}

type SwapState = {
  oldProgram$: number
  newProgram$: number
  chunkIndex: number
  totalChunks: number
}

const CROSSFADE_CHUNKS = 8

class Limiter {
  private gain = 1
  constructor(
    private ceiling = 0.9,
    private attack = 0.2,
    private release = 0.001,
  ) {}

  process(left: Float32Array, right: Float32Array) {
    let peak = 0
    for (let i = 0; i < left.length; i++) {
      const l = Math.abs(left[i])
      const r = Math.abs(right[i])
      if (l > peak) peak = l
      if (r > peak) peak = r
    }

    const target = peak > this.ceiling ? this.ceiling / peak : 1
    const coeff = target < this.gain ? this.attack : this.release

    for (let i = 0; i < left.length; i++) {
      this.gain += (target - this.gain) * coeff
      left[i] = Math.tanh(left[i] * this.gain)
      right[i] = Math.tanh(right[i] * this.gain)
    }
  }
}

export interface DspProcessorOptions extends AudioWorkletNodeOptions {
  processorOptions: {
    sourcemapUrl: string
    ringPos: Uint8Array<SharedArrayBuffer>
    control: Uint32Array<SharedArrayBuffer>
    bpmValue: Float32Array<SharedArrayBuffer>
    globalSampleCount: Int32Array<SharedArrayBuffer>
    seekSample: Int32Array<SharedArrayBuffer>
    loop: Int32Array<SharedArrayBuffer>
    programSwap: Uint32Array<SharedArrayBuffer>
    prepareDsp: Uint32Array<SharedArrayBuffer>
    swapStatus: Int32Array<SharedArrayBuffer>
    prepareDspStatus: Int32Array<SharedArrayBuffer>
  }
}

export class DspProcessor extends AudioWorkletProcessor {
  private state: 'stopped' | 'fade-in' | 'running' | 'fade-out' = 'stopped'
  private core: WasmSetup<typeof WasmExports> | undefined
  private dsps: DspInstance[] = []
  private outLeft = new Float32Array(CHUNK_SIZE)
  private outRight = new Float32Array(CHUNK_SIZE)
  private scratchLeft$ = 0
  private scratchRight$ = 0
  private scratchLeft: Float32Array | undefined
  private scratchRight: Float32Array | undefined
  private lastBpm = 60
  private shouldReset = false
  private lastControl = ControlOp.Pause
  private fadeLeft$ = 0
  private fadeRight$ = 0
  private fadeLeft: Float32Array | undefined
  private fadeRight: Float32Array | undefined
  private limiter = new Limiter()
  private swapStatus?: Int32Array
  private crossfadeState: Map<number, SwapState> = new Map()
  private resetRunningDspOnNextChunk = false
  private seekSample?: Int32Array
  private loop?: Int32Array

  private signalSwapResult(value: number) {
    if (!this.swapStatus) return
    Atomics.store(this.swapStatus, 0, value)
    Atomics.store(this.swapStatus, 1, 1)
    Atomics.notify(this.swapStatus, 1, 1)
  }

  constructor(private options: DspProcessorOptions) {
    super()
    rpc(this.port, this)
    this.swapStatus = this.options.processorOptions.swapStatus
    this.seekSample = this.options.processorOptions.seekSample
    this.loop = this.options.processorOptions.loop
  }

  async setWasmBinary(binary: ArrayBuffer) {
    this.core = await wasmSetup<typeof WasmExports>({
      binary,
      config,
      sourcemapUrl: this.options.processorOptions.sourcemapUrl,
    })
    this.dsps = []
    this.addDsp()

    this.scratchLeft$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE)
    this.scratchRight$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE)
    this.scratchLeft = new Float32Array(this.core.memory.buffer, this.scratchLeft$, CHUNK_SIZE)
    this.scratchRight = new Float32Array(this.core.memory.buffer, this.scratchRight$, CHUNK_SIZE)

    this.fadeLeft$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE)
    this.fadeRight$ = this.core.wasm.createFloat32Buffer(CHUNK_SIZE)
    this.fadeLeft = new Float32Array(this.core.memory.buffer, this.fadeLeft$, CHUNK_SIZE)
    this.fadeRight = new Float32Array(this.core.memory.buffer, this.fadeRight$, CHUNK_SIZE)

    // Initialize BPM
    const initialBpm = this.options.processorOptions.bpmValue[0]
    this.core.wasm.bpm.value = initialBpm
    this.lastBpm = initialBpm

    return {
      memory: this.core.memory,
      dsp$: this.dsps[0]?.dsp$ ?? 0,
    }
  }

  async createProgram() {
    return this.core!.wasm.createProgram()
  }

  async createArrays() {
    return Array.from({ length: ARRAYS_COUNT }, () => this.core!.wasm.createArray())
  }

  async createHistories() {
    return Array.from({ length: HISTORIES_COUNT }, () => this.core!.wasm.createHistoryArray())
  }

  async createProgramData() {
    return this.core!.wasm.createProgramData()
  }

  async createOps() {
    return this.core!.wasm.createOps()
  }

  async createDsp(program$?: number) {
    return this.addDsp(program$)
  }

  private addDsp(program$?: number) {
    if (!this.core) throw new Error('Wasm not ready')
    const dsp$ = this.core.wasm.createDsp()
    const view = DspStruct(this.core.memory.buffer, dsp$)
    if (program$) view.program = program$
    this.dsps.push({ dsp$, view })
    return dsp$
  }

  private renderProgram(instance: DspInstance, program$: number, left$: number, right$: number, begin: number,
    length: number)
  {
    if (!this.core) return
    instance.view.program = program$
    this.core.wasm.processAudio(instance.dsp$, left$, right$, begin, length)
  }

  private renderSwapChunk(
    instance: DspInstance,
    state: SwapState,
    begin: number,
    length: number,
    sampleBefore: number,
  ) {
    if (!this.core || !this.fadeLeft || !this.fadeRight || !this.scratchLeft || !this.scratchRight) return

    const wasm = this.core.wasm
    wasm.globalSampleCount.value = sampleBefore
    wasm.clearVmError()
    this.renderProgram(instance, state.oldProgram$, this.scratchLeft$, this.scratchRight$, begin, length)

    if (state.chunkIndex === 0) {
      wasm.globalSampleCount.value = sampleBefore
      wasm.clearVmError()
      wasm.copyProgram(state.newProgram$, state.oldProgram$)
    }

    wasm.globalSampleCount.value = sampleBefore
    wasm.clearVmError()
    this.renderProgram(instance, state.newProgram$, this.fadeLeft$, this.fadeRight$, begin, length)

    const totalSamples = state.totalChunks * length
    const chunkOffset = state.chunkIndex * length

    for (let i = 0; i < length; i++) {
      const sampleNumber = chunkOffset + i
      const t = totalSamples > 1 ? sampleNumber / (totalSamples - 1) : 1
      const inv = 1 - t
      this.scratchLeft[i] = this.scratchLeft[i] * inv + this.fadeLeft[i] * t
      this.scratchRight[i] = this.scratchRight[i] * inv + this.fadeRight[i] * t
    }

    state.chunkIndex += 1

    if (state.chunkIndex >= state.totalChunks) {
      this.finishCrossfade(instance, state)
    }
  }

  private renderSwapSegment(
    instance: DspInstance,
    state: SwapState,
    begin: number,
    length: number,
    sampleBefore: number,
    chunkOffset: number,
    chunkLength: number,
  ) {
    if (!this.core || !this.fadeLeft || !this.fadeRight || !this.scratchLeft || !this.scratchRight) return
    const wasm = this.core.wasm
    wasm.globalSampleCount.value = sampleBefore
    wasm.clearVmError()
    this.renderProgram(instance, state.oldProgram$, this.scratchLeft$, this.scratchRight$, begin, length)

    if (state.chunkIndex === 0 && chunkOffset === 0) {
      wasm.globalSampleCount.value = sampleBefore
      wasm.clearVmError()
      wasm.copyProgram(state.newProgram$, state.oldProgram$)
    }

    wasm.globalSampleCount.value = sampleBefore
    wasm.clearVmError()
    this.renderProgram(instance, state.newProgram$, this.fadeLeft$, this.fadeRight$, begin, length)

    const totalSamples = state.totalChunks * chunkLength
    const baseOffset = state.chunkIndex * chunkLength + chunkOffset

    for (let i = 0; i < length; i++) {
      const sampleNumber = baseOffset + i
      const t = totalSamples > 1 ? sampleNumber / (totalSamples - 1) : 1
      const inv = 1 - t
      this.scratchLeft[i] = this.scratchLeft[i] * inv + this.fadeLeft[i] * t
      this.scratchRight[i] = this.scratchRight[i] * inv + this.fadeRight[i] * t
    }
  }

  private advanceSwapState(instance: DspInstance, state: SwapState) {
    state.chunkIndex += 1
    if (state.chunkIndex >= state.totalChunks) {
      this.finishCrossfade(instance, state)
    }
  }

  private finishCrossfade(instance: DspInstance, state: SwapState) {
    if (!this.core) return
    this.crossfadeState.delete(instance.dsp$)
    instance.view.program = state.newProgram$

    const wasm = this.core.wasm
    const vmErrorCode = (wasm as any).getVmErrorCode?.() ?? 0
    const statusValue = vmErrorCode === 0 ? 1 : -1
    if (this.swapStatus) {
      Atomics.store(this.swapStatus, 0, statusValue)
      Atomics.store(this.swapStatus, 1, 1)
      Atomics.notify(this.swapStatus, 1, 1)
    }

    if (!this.crossfadeState.size) {
      Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
    }
  }

  private applySeekSample(targetSample: number) {
    if (!this.core) return
    const clamped = Math.max(0, targetSample)
    this.core.wasm.globalSampleCount.value = clamped
    Atomics.store(this.options.processorOptions.globalSampleCount, 0, clamped)
    for (const dsp of this.dsps) {
      this.core.wasm.resetDsp(dsp.dsp$, true)
      this.core.wasm.prepareDsp(dsp.dsp$)
    }
  }

  reset() {
    if (!this.core) return
    // Reset globalSampleCount and sequence state if Stop was pressed (not just Pause)
    this.core.wasm.resetGlobalSampleCount()
    Atomics.store(this.options.processorOptions.globalSampleCount, 0, 0)
    for (const dsp of this.dsps) {
      this.core.wasm.resetDsp(dsp.dsp$, true)
      this.core.wasm.prepareDsp(dsp.dsp$)
    }
    this.state = 'stopped'
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    try {
      if (!this.core || !this.scratchLeft || !this.scratchRight) return true

      let control = Atomics.load(this.options.processorOptions.control, 0)

      if (control === ControlOp.Seek) {
        const seekSample = this.seekSample
        if (seekSample) {
          const targetSample = Math.max(0, Atomics.load(seekSample, 0))
          this.applySeekSample(targetSample)
        }
        control = this.lastControl
        Atomics.store(this.options.processorOptions.control, 0, control)
      }

      // Only respond to control changes
      if (control !== this.lastControl) {
        if (control === ControlOp.Start && this.state === 'stopped') {
          const status = this.options.processorOptions.prepareDspStatus
          Atomics.store(status, 0, 0)

          this.state = 'fade-in'
          this.shouldReset = false
        }
        else if (control === ControlOp.Pause && this.state === 'running') {
          this.state = 'fade-out'
          this.shouldReset = false
        }
        else if (control === ControlOp.Stop && (this.state === 'running' || this.state === 'stopped')) {
          if (this.state === 'running') {
            this.state = 'fade-out'
            this.shouldReset = true
          }
          else {
            this.reset()
            Atomics.store(this.options.processorOptions.control, 0, this.lastControl)
            return true
          }
        }
        else if (control === ControlOp.Prepare && this.state === 'stopped') {
          const dsp$ = Atomics.load(this.options.processorOptions.prepareDsp, 0)
          if (dsp$) {
            this.core.wasm.prepareDsp(dsp$)
            const status = this.options.processorOptions.prepareDspStatus
            Atomics.store(status, 0, 1)
            Atomics.store(status, 1, 1)
            Atomics.notify(status, 1)
          }
          // Set the control back to its previous value.
          Atomics.store(this.options.processorOptions.control, 0, this.lastControl)
        }
        else if (control === ControlOp.Swap && this.state === 'stopped') {
          // Handle swap when stopped
          const swap = this.options.processorOptions.programSwap
          for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
            const base = i * 3
            const old$ = Atomics.load(swap, base)
            const new$ = Atomics.load(swap, base + 1)
            const targetDsp$ = Atomics.load(swap, base + 2)
            if (old$ && new$ && targetDsp$) {
              const dsp = this.dsps.find(d => d.dsp$ === targetDsp$)
              if (dsp) {
                dsp.view.program = new$
                this.core.wasm.prepareDsp(dsp.dsp$)
              }
            }
          }

          this.signalSwapResult(1)

          Atomics.store(this.options.processorOptions.control, 0, this.lastControl)
        }
        this.lastControl = control
      }

      let sampleBefore = this.core.wasm.globalSampleCount.value
      let didLoopSeek = false

      const loop = this.loop
      const loopEnabled = loop ? Atomics.load(loop, 0) === 1 : false
      const loopStart = loopEnabled ? Atomics.load(loop!, 1) : 0
      const loopEnd = loopEnabled ? Atomics.load(loop!, 2) : 0
      const loopLength = loopEnabled ? Math.max(0, loopEnd - loopStart) : 0

      if (loopEnabled && loopLength > 0) {
        if ((this.state === 'stopped' && sampleBefore < loopStart) || sampleBefore >= loopEnd) {
          this.applySeekSample(loopStart)
          sampleBefore = loopStart
          didLoopSeek = true
        }
      }

      // Update globalSampleCount in shared buffer
      Atomics.store(this.options.processorOptions.globalSampleCount, 0, sampleBefore)

      // Update global BPM and adjust globalSampleCount on change
      const bpmValue = this.options.processorOptions.bpmValue[0]
      if (bpmValue !== this.lastBpm) {
        this.core.wasm.updateBpm(this.lastBpm, bpmValue)
        this.lastBpm = bpmValue
      }

      if (this.state === 'stopped') return true

      const ringPos = Atomics.load(this.options.processorOptions.ringPos, 0)
      const begin = ringPos * CHUNK_SIZE
      const length = CHUNK_SIZE

      const L = this.outLeft
      const R = this.outRight
      L.fill(0)
      R.fill(0)

      if (control === ControlOp.Swap && !this.crossfadeState.size) {
        const swap = this.options.processorOptions.programSwap
        const states = new Map<number, SwapState>()
        for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
          const base = i * 3
          const old$ = Atomics.load(swap, base)
          const new$ = Atomics.load(swap, base + 1)
          const targetDsp$ = Atomics.load(swap, base + 2)
          if (!old$ || !new$ || !targetDsp$) continue

          const dsp = this.dsps.find(d => d.dsp$ === targetDsp$)
          if (!dsp?.view.program) continue

          states.set(targetDsp$, {
            oldProgram$: old$,
            newProgram$: new$,
            chunkIndex: 0,
            totalChunks: CROSSFADE_CHUNKS,
          })
        }

        if (!states.size) {
          this.signalSwapResult(-1)
          Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
        }
        else if (this.swapStatus) {
          Atomics.store(this.swapStatus, 0, 0)
          Atomics.store(this.swapStatus, 1, 0)
        }

        if (states.size) {
          this.crossfadeState = states
        }
      }

      let playingCount = 0

      const segs: Array<{ sampleStart: number; begin: number; length: number; outOffset: number }> = []
      if (loopEnabled && loopLength > 0 && sampleBefore + length > loopEnd) {
        const len1 = Math.max(0, loopEnd - sampleBefore)
        const len2 = Math.max(0, length - len1)
        if (len1 > 0) {
          segs.push({ sampleStart: sampleBefore, begin, length: len1, outOffset: 0 })
        }
        if (len2 > 0) {
          segs.push({ sampleStart: loopStart, begin: begin + len1, length: len2, outOffset: len1 })
        }
      }
      else {
        segs.push({ sampleStart: sampleBefore, begin, length, outOffset: 0 })
      }

      const swapToAdvance: Array<{ dsp: DspInstance; state: SwapState }> = []

      for (const dsp of this.dsps) {
        if (!dsp.view.program) continue
        playingCount++
        const swapState = this.crossfadeState.get(dsp.dsp$)
        if (swapState) swapToAdvance.push({ dsp, state: swapState })
      }

      if (control === ControlOp.Swap && this.crossfadeState.size && swapToAdvance.length === 0) {
        this.crossfadeState.clear()
        this.signalSwapResult(-1)
        Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
      }

      for (let segIndex = 0; segIndex < segs.length; segIndex++) {
        const seg = segs[segIndex]!
        if (loopEnabled && loopLength > 0 && segIndex === 1 && seg.outOffset > 0) {
          this.applySeekSample(loopStart)
          didLoopSeek = true
        }

        for (const dsp of this.dsps) {
          if (!dsp.view.program) continue

          const swapState = this.crossfadeState.get(dsp.dsp$)
          if (swapState && segs.length === 1) {
            this.core.wasm.globalSampleCount.value = sampleBefore
            this.renderSwapChunk(dsp, swapState, begin, length, sampleBefore)
            for (let i = 0; i < CHUNK_SIZE; i++) {
              L[i] += this.scratchLeft[i]
              R[i] += this.scratchRight[i]
            }
            continue
          }

          this.core.wasm.globalSampleCount.value = seg.sampleStart

          if (swapState) {
            this.renderSwapSegment(dsp, swapState, seg.begin, seg.length, seg.sampleStart, seg.outOffset, length)
          }
          else {
            this.renderProgram(dsp, dsp.view.program, this.scratchLeft$, this.scratchRight$, seg.begin, seg.length)
          }

          for (let i = 0; i < seg.length; i++) {
            const j = seg.outOffset + i
            L[j] += this.scratchLeft[i]
            R[j] += this.scratchRight[i]
          }
        }
      }

      if (segs.length > 1) {
        for (const s of swapToAdvance) {
          this.advanceSwapState(s.dsp, s.state)
        }
      }

      let sampleAfter = sampleBefore + length
      if (loopEnabled && loopLength > 0 && sampleAfter >= loopEnd) {
        const over = sampleAfter - loopEnd
        sampleAfter = loopStart + (over % loopLength)
      }
      if (loopEnabled && loopLength > 0 && sampleBefore + length >= loopEnd && !didLoopSeek) {
        this.applySeekSample(sampleAfter)
      }
      else {
        this.core.wasm.globalSampleCount.value = sampleAfter
      }

      if (playingCount > 1) {
        this.limiter.process(L, R)
      }

      Atomics.store(this.options.processorOptions.ringPos, 0, (ringPos + 1) % (RING_BUFFER_SIZE / CHUNK_SIZE))

      outputs[0][0].set(L)
      outputs[0][1].set(R)

      if (this.resetRunningDspOnNextChunk) {
        this.resetRunningDspOnNextChunk = false
        const status = this.options.processorOptions.prepareDspStatus
        Atomics.store(status, 0, 1)
        Atomics.store(status, 1, 1)
        Atomics.notify(status, 1)
      }

      if (this.state === 'fade-in') {
        if (sampleBefore > 0) {
          const fadeInLength = CHUNK_SIZE
          for (let i = 0; i < fadeInLength; i++) {
            const gain = i / fadeInLength
            outputs[0][0][i] *= gain
            outputs[0][1][i] *= gain
          }
        }
        this.state = 'running'
        const status = this.options.processorOptions.prepareDspStatus
        Atomics.store(status, 0, 1)
      }
      else if (this.state === 'fade-out') {
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const gain = 1 - i / CHUNK_SIZE
          outputs[0][0][i] *= gain
          outputs[0][1][i] *= gain
        }
        this.state = 'stopped'
        if (this.shouldReset) {
          this.reset()
          this.shouldReset = false
        }
      }
      else if (this.state === 'running' && control === ControlOp.Prepare) {
        this.resetRunningDspOnNextChunk = true
        Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
      }

      return true
    }
    catch (error) {
      this.crossfadeState.clear()
      this.signalSwapResult(-1)

      const status = this.options.processorOptions.prepareDspStatus
      if (Atomics.load(status, 0) === 0) {
        Atomics.store(status, 0, -1)
        Atomics.store(status, 1, 1)
        Atomics.notify(status, 1)
      }

      Atomics.store(this.options.processorOptions.control, 0, ControlOp.Pause)
      this.lastControl = ControlOp.Pause
      this.state = 'stopped'
      console.error('AudioWorklet process error:', error)
      return true
    }
  }
}

registerProcessor('dsp', DspProcessor)
