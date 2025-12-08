import { type Ring, toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import { ARRAYS_COUNT, CHUNK_SIZE, RING_BUFFER_SIZE } from '../as/assembly/constants.ts'
import type * as WasmExports from '../as/build/index.d.ts'
import config from '../asconfig.json'
import { type WasmSetup, wasmSetup } from './lib/wasm-setup.ts'
import { ControlOp } from './worklet-shared.ts'

export interface DspProcessorOptions extends AudioWorkletNodeOptions {
  processorOptions: {
    sourcemapUrl: string
    ringPos: Uint8Array<SharedArrayBuffer>
    control: Uint32Array<SharedArrayBuffer>
    bpmValue: Float32Array<SharedArrayBuffer>
    globalSampleCount: Int32Array<SharedArrayBuffer>
  }
}

export class DspProcessor extends AudioWorkletProcessor {
  private state: 'stopped' | 'fade-in' | 'running' | 'fade-out' = 'stopped'
  private core: WasmSetup<typeof WasmExports> | undefined
  private buffers: Float32Array[] = []
  private rings: Ring[] = []
  private dsp$ = 0
  private lastBpm = 120
  private shouldReset = false
  private lastControl = ControlOp.Pause

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
    this.buffers = [
      new Float32Array(this.core.memory.buffer, this.core.wasm.createFloat32Buffer(RING_BUFFER_SIZE), RING_BUFFER_SIZE),
      new Float32Array(this.core.memory.buffer, this.core.wasm.createFloat32Buffer(RING_BUFFER_SIZE), RING_BUFFER_SIZE),
    ]
    this.rings = [
      toRing(this.buffers[0], CHUNK_SIZE),
      toRing(this.buffers[1], CHUNK_SIZE),
    ]
    this.dsp$ = this.core.wasm.createDsp()

    // Initialize BPM
    const initialBpm = this.options.processorOptions.bpmValue[0]
    this.core.wasm.bpm.value = initialBpm
    this.lastBpm = initialBpm

    return {
      memory: this.core.memory,
      rings: this.rings,
      dsp$: this.dsp$,
    }
  }

  async createProgram() {
    return this.core!.wasm.createProgram()
  }

  async createArrays() {
    return Array.from({ length: ARRAYS_COUNT }, () => this.core!.wasm.createArray())
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    if (!this.core) return true

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

      this.lastControl = control
    }

    if (this.state === 'stopped') return true

    // Update global BPM and adjust globalSampleCount on change
    const bpmValue = this.options.processorOptions.bpmValue[0]
    if (bpmValue !== this.lastBpm) {
      this.core.wasm.updateBpm(this.lastBpm, bpmValue)
      this.lastBpm = bpmValue
    }

    const ringPos = Atomics.load(this.options.processorOptions.ringPos, 0)
    const L = this.rings[0][ringPos]
    const R = this.rings[1][ringPos]

    this.core.wasm.processAudio(
      this.dsp$,
      this.rings[0].buffer.byteOffset,
      this.rings[1].buffer.byteOffset,
      ringPos * CHUNK_SIZE,
      CHUNK_SIZE,
    )

    // Update globalSampleCount in shared buffer
    Atomics.store(this.options.processorOptions.globalSampleCount, 0, this.core.wasm.globalSampleCount.value)

    Atomics.store(this.options.processorOptions.ringPos, 0, (ringPos + 1) % this.rings[0].length)

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
        this.core.wasm.resetDsp(this.dsp$)
        this.shouldReset = false
      }
    }

    return true
  }
}

registerProcessor('dsp', DspProcessor)
