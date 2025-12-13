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
    programSwap: Uint32Array<SharedArrayBuffer>
    prepareDsp: Uint32Array<SharedArrayBuffer>
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

  constructor(private options: DspProcessorOptions) {
    super()
    rpc(this.port, this)
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

  private performProgramSwap(instance: DspInstance, sampleBefore: number, oldProgram$: number, newProgram$: number) {
    if (!this.core || !this.fadeLeft || !this.fadeRight || !this.scratchLeft || !this.scratchRight) return

    this.core.wasm.globalSampleCount.value = sampleBefore
    this.renderProgram(instance, oldProgram$, this.scratchLeft$, this.scratchRight$, 0, CHUNK_SIZE)

    this.core.wasm.globalSampleCount.value = sampleBefore
    this.core.wasm.copyProgram(newProgram$, oldProgram$)
    this.renderProgram(instance, newProgram$, this.fadeLeft$, this.fadeRight$, 0, CHUNK_SIZE)

    for (let i = 0; i < CHUNK_SIZE; i++) {
      const t = i / CHUNK_SIZE
      const inv = 1 - t
      this.scratchLeft[i] = this.scratchLeft[i] * inv + this.fadeLeft[i] * t
      this.scratchRight[i] = this.scratchRight[i] * inv + this.fadeRight[i] * t
    }

    this.core.wasm.globalSampleCount.value = sampleBefore + CHUNK_SIZE

    instance.view.program = newProgram$

    Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    if (!this.core || !this.scratchLeft || !this.scratchRight) return true

    const control = Atomics.load(this.options.processorOptions.control, 0)

    // Only respond to control changes
    if (control !== this.lastControl) {
      if (control === ControlOp.Start && this.state === 'stopped') {
        this.state = 'fade-in'
        this.shouldReset = false
      }
      else if (control === ControlOp.Pause && this.state === 'running') {
        this.state = 'fade-out'
        this.shouldReset = false
      }
      else if (control === ControlOp.Stop && this.state === 'running') {
        this.state = 'fade-out'
        this.shouldReset = true
      }
      else if (control === ControlOp.Prepare && this.state === 'stopped') {
        const dsp$ = Atomics.load(this.options.processorOptions.prepareDsp, 0)
        if (dsp$) this.core.wasm.prepareDsp(dsp$)
        // Set the control back to its previous value.
        Atomics.store(this.options.processorOptions.control, 0, this.lastControl)
      }

      this.lastControl = control
    }

    const sampleBefore = this.core.wasm.globalSampleCount.value

    // Update globalSampleCount in shared buffer
    Atomics.store(this.options.processorOptions.globalSampleCount, 0, sampleBefore)

    if (this.state === 'stopped') return true

    // Update global BPM and adjust globalSampleCount on change
    const bpmValue = this.options.processorOptions.bpmValue[0]
    if (bpmValue !== this.lastBpm) {
      this.core.wasm.updateBpm(this.lastBpm, bpmValue)
      this.lastBpm = bpmValue
    }

    const ringPos = Atomics.load(this.options.processorOptions.ringPos, 0)

    const L = this.outLeft
    const R = this.outRight
    L.fill(0)
    R.fill(0)

    const swap = this.options.processorOptions.programSwap
    let swaps: Map<number, { old$: number; new$: number }> | undefined
    if (control === ControlOp.Swap) {
      swaps = new Map<number, { old$: number; new$: number }>()
      for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
        const base = i * 3
        const old$ = Atomics.load(swap, base)
        const new$ = Atomics.load(swap, base + 1)
        const targetDsp$ = Atomics.load(swap, base + 2)
        if (old$ && new$ && targetDsp$) {
          swaps.set(targetDsp$, { old$, new$ })
        }
      }
    }

    let playingCount = 0

    for (const dsp of this.dsps) {
      if (!dsp.view.program) continue

      playingCount++

      this.core.wasm.globalSampleCount.value = sampleBefore

      if (control === ControlOp.Swap && swaps) {
        const swapTarget = swaps.get(dsp.dsp$)
        if (swapTarget) {
          this.performProgramSwap(dsp, sampleBefore, swapTarget.old$, swapTarget.new$)
        }
        else {
          this.renderProgram(dsp, dsp.view.program, this.scratchLeft$, this.scratchRight$, 0, CHUNK_SIZE)
        }
      }
      else {
        this.renderProgram(dsp, dsp.view.program, this.scratchLeft$, this.scratchRight$, 0, CHUNK_SIZE)
      }

      for (let i = 0; i < CHUNK_SIZE; i++) {
        L[i] += this.scratchLeft[i]
        R[i] += this.scratchRight[i]
      }
    }

    this.core.wasm.globalSampleCount.value = sampleBefore + CHUNK_SIZE

    if (playingCount > 1) {
      this.limiter.process(L, R)
    }

    Atomics.store(this.options.processorOptions.ringPos, 0, (ringPos + 1) % (RING_BUFFER_SIZE / CHUNK_SIZE))

    outputs[0][0].set(L)
    outputs[0][1].set(R)

    if (this.state === 'fade-in') {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const gain = i / CHUNK_SIZE
        outputs[0][0][i] *= gain
        outputs[0][1][i] *= gain
      }
      this.state = 'running'
    }
    else if (this.state === 'fade-out') {
      for (let i = 0; i < CHUNK_SIZE; i++) {
        const gain = 1 - i / CHUNK_SIZE
        outputs[0][0][i] *= gain
        outputs[0][1][i] *= gain
      }
      this.state = 'stopped'

      // Reset globalSampleCount and sequence state if Stop was pressed (not just Pause)
      if (this.shouldReset) {
        this.core.wasm.resetGlobalSampleCount()
        for (const dsp of this.dsps) {
          this.core.wasm.resetDsp(dsp.dsp$)
          this.core.wasm.prepareDsp(dsp.dsp$)
        }
        this.shouldReset = false
      }
    }

    return true
  }
}

registerProcessor('dsp', DspProcessor)
