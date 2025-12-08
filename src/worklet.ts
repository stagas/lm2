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
  }
}

export class DspProcessor extends AudioWorkletProcessor {
  private state: 'stopped' | 'fade-in' | 'running' | 'fade-out' = 'stopped'
  private core: WasmSetup<typeof WasmExports> | undefined
  private buffers: Float32Array[] = []
  private rings: Ring[] = []
  private dsp$ = 0

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
    if (control === ControlOp.Start && this.state === 'stopped') {
      this.state = 'fade-in'
    }
    else if (control === ControlOp.Stop && this.state === 'running') {
      this.state = 'fade-out'
    }

    if (this.state === 'stopped') return true

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
    }

    return true
  }
}

registerProcessor('dsp', DspProcessor)
