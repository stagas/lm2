import type * as WasmExports from '../as/build/index.d.ts'
import hex from '../as/build/index.wasm?raw-hex'
import config from '../asconfig.json'
import { wasmSetup, type WasmSetup } from './lib/wasm-setup.ts'

class Dsp extends AudioWorkletProcessor {
  state: 'running' | 'stopped' = 'stopped'
  core: WasmSetup<typeof WasmExports> | undefined
  buffers: Float32Array[] = []
  dsp$ = 0

  constructor(options: AudioWorkletNodeOptions) {
    super()

    const { sourcemapUrl } = options.processorOptions

    ;(async () => {
      this.core = await wasmSetup<typeof WasmExports>({
        hex,
        config,
        sourcemapUrl,
      })
      this.buffers = [
        new Float32Array(this.core.memory.buffer, this.core.wasm.createFloat32Buffer(128), 128),
        new Float32Array(this.core.memory.buffer, this.core.wasm.createFloat32Buffer(128), 128),
      ]
      this.dsp$ = this.core.wasm.createDsp()
    })()

    this.port.onmessage = event => {
      if (event.data.type === 'start') {
        this.state = 'running'
      } else if (event.data.type === 'stop') {
        this.state = 'stopped'
      }
    }
  }

  process(
    inputs: Float32Array[][],
    outputs: Float32Array[][],
    parameters: Record<string, Float32Array>,
  ) {
    if (!this.core || this.state === 'stopped') return true

    this.core.wasm.processAudio(
      this.dsp$,
      this.buffers[0].byteOffset,
      this.buffers[1].byteOffset,
      0,
      128,
    )

    outputs[0][0].set(this.buffers[0])
    outputs[0][1].set(this.buffers[1])

    return true
  }
}

registerProcessor('dsp', Dsp)
