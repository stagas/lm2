import { type Ring, toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import { ARRAYS_COUNT, CHUNK_SIZE, HISTORIES_COUNT, MAX_DSP_INSTANCES,
  RING_BUFFER_SIZE } from '../../as/assembly/constants.ts'
import type * as WasmExports from '../../as/build/index'
import config from '../../asconfig.json'
import { type WasmSetup, wasmSetup } from '../lib/wasm-setup.ts'
import { DspStruct } from './assembly.ts'
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

const f32BitsBuf = new ArrayBuffer(4)
const f32BitsView = new DataView(f32BitsBuf)
function u32ToF32(v: number): number {
  f32BitsView.setUint32(0, v >>> 0, true)
  return f32BitsView.getFloat32(0, true)
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
    seekSample: Int32Array<SharedArrayBuffer>
    loop: Int32Array<SharedArrayBuffer>
    hardLoop: Int32Array<SharedArrayBuffer>
    programSwap: Uint32Array<SharedArrayBuffer>
    swapStatus: Int32Array<SharedArrayBuffer>
  }
}

export class DspProcessor extends AudioWorkletProcessor {
  private state: 'stopped' | 'fade-in' | 'running' | 'fade-out' = 'stopped'
  private core: WasmSetup<typeof WasmExports> | undefined
  private dsps: DspInstance[] = []
  private samples: Map<number, {
    ver: number
    sampleRate: number
    len: number
    ch0: Float32Array
    slices?: { k: number; count: number; points: Int32Array }
  }> = new Map()
  private outLeft = new Float32Array(CHUNK_SIZE)
  private outRight = new Float32Array(CHUNK_SIZE)
  private seekLeft = new Float32Array(CHUNK_SIZE)
  private seekRight = new Float32Array(CHUNK_SIZE)
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
  private seekSample?: Int32Array
  private loop?: Int32Array
  private hardLoop?: Int32Array

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
    this.hardLoop = this.options.processorOptions.hardLoop
  }

  async setWasmBinary(binary: ArrayBuffer) {
    this.core = await wasmSetup<typeof WasmExports>({
      binary,
      config,
      sourcemapUrl: this.options.processorOptions.sourcemapUrl,
      imports: ({ memory }) => {
        const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))
        const detectSlices = (samples: Float32Array, threshold: number, max: number) => {
          const points = new Int32Array(Math.max(1, max))
          let count = 0
          points[count++] = 0

          const hop = 512
          const minDistance = 1024
          const len = samples.length | 0
          if (len <= 0) return { points, count: 0 }

          const mult = 0.5 + clamp(threshold, 0, 1) * 1.5
          let prevEnergy = 0
          let lastPeak = 0

          for (let i = hop; i + hop < len && count < max; i += hop) {
            let energy = 0
            const end = Math.min(len, i + hop)
            for (let j = i; j < end; j++) {
              const v = samples[j] || 0
              energy += v * v
            }
            energy = Math.sqrt(energy / Math.max(1, end - i))

            const diff = energy - prevEnergy
            const onsetThreshold = prevEnergy * mult * 0.3
            if (diff > onsetThreshold && diff > 0.01 && i - lastPeak >= minDistance) {
              points[count++] = i
              lastPeak = i
            }
            prevEnergy = energy
          }

          if (count <= 0) {
            points[0] = 0
            count = 1
          }
          return { points, count }
        }

        return {
          host: {
            sampleVersion: (sampleIndex: number) => {
              const s = this.samples.get(sampleIndex | 0)
              return s ? (s.ver | 0) : 0
            },
            sampleLen: (sampleIndex: number) => {
              const s = this.samples.get(sampleIndex | 0)
              return s ? (s.len | 0) : 0
            },
            sampleRead: (sampleIndex: number, start: number, length: number, outPtr: number) => {
              const s = this.samples.get(sampleIndex | 0)
              const n = length | 0
              if (!memory?.buffer || outPtr === 0 || n <= 0) return 0

              const out = new Float32Array(memory.buffer, outPtr >>> 0, n)
              if (!s || !s.ch0 || s.len <= 0) {
                out.fill(0)
                return 0
              }

              const src = s.ch0
              const len = s.len | 0
              const a = start | 0

              const from = clamp(a, 0, len)
              const to = clamp(a + n, 0, len)
              const take = Math.max(0, to - from)

              if (take > 0) out.set(src.subarray(from, from + take), 0)
              if (take < n) out.fill(0, take)
              return take | 0
            },
            sampleSlices: (sampleIndex: number, threshold: number, outPtr: number, max: number) => {
              const s = this.samples.get(sampleIndex | 0)
              const m = max | 0
              if (!memory?.buffer || outPtr === 0 || m <= 0) return 0
              const out = new Int32Array(memory.buffer, outPtr >>> 0, m)
              if (!s || !s.ch0 || s.len <= 0) {
                out.fill(0)
                return 0
              }

              const key = ((threshold || 0) * 1000) | 0
              if (!s.slices || s.slices.k !== key) {
                const res = detectSlices(s.ch0, threshold || 0, m)
                s.slices = { k: key, count: res.count | 0, points: res.points }
                out.set(res.points.subarray(0, Math.min(m, res.count)))
                if (res.count < m) out.fill(0, res.count)
                return res.count | 0
              }

              const points = s.slices.points
              const n = Math.min(m, s.slices.count | 0)
              out.set(points.subarray(0, n))
              if (n < m) out.fill(0, n)
              return n | 0
            },
          },
        }
      },
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

  async setSample(sampleIndex: number, sampleRate: number, length: number, ch0Buffer: ArrayBuffer) {
    const index = sampleIndex | 0
    const len = length | 0
    const sr = Number(sampleRate) || 0
    const ch0 = new Float32Array(ch0Buffer)
    const prev = this.samples.get(index)
    const ver = ((prev?.ver ?? 0) + 1) | 0
    this.samples.set(index, { ver, sampleRate: sr, len: Math.min(len, ch0.length | 0), ch0 })
  }

  async clearSamples() {
    this.samples.clear()
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

  async syncBpm(oldBpm: number, newBpm: number) {
    if (!this.core) return
    this.core.wasm.updateBpm(oldBpm, newBpm)
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
      this.core.wasm.resetDsp(dsp.dsp$)
    }
  }

  private renderChunk(
    sampleBefore: number,
    begin: number,
    length: number,
    rangeEnabled: boolean,
    rangeStart: number,
    rangeEnd: number,
    rangeLength: number,
    outLeft: Float32Array,
    outRight: Float32Array,
    advanceSwap: boolean,
  ) {
    if (!this.core || !this.scratchLeft || !this.scratchRight) return { didRangeSeek: false, swapToAdvance: [] }

    outLeft.fill(0)
    outRight.fill(0)

    let didRangeSeek = false

    const segs: Array<{ sampleStart: number; begin: number; length: number; outOffset: number }> = []
    if (rangeEnabled && rangeLength > 0 && sampleBefore + length > rangeEnd) {
      const len1 = Math.max(0, rangeEnd - sampleBefore)
      const len2 = Math.max(0, length - len1)
      if (len1 > 0) {
        segs.push({ sampleStart: sampleBefore, begin, length: len1, outOffset: 0 })
      }
      if (len2 > 0) {
        segs.push({ sampleStart: rangeStart, begin: begin + len1, length: len2, outOffset: len1 })
      }
    }
    else {
      segs.push({ sampleStart: sampleBefore, begin, length, outOffset: 0 })
    }

    const swapToAdvance: Array<{ dsp: DspInstance; state: SwapState }> = []
    const swapSeen = new Set<number>()

    for (let segIndex = 0; segIndex < segs.length; segIndex++) {
      const seg = segs[segIndex]!
      if (rangeEnabled && rangeLength > 0 && segIndex === 1 && seg.outOffset > 0) {
        this.applySeekSample(rangeStart)
        didRangeSeek = true
      }

      for (const dsp of this.dsps) {
        if (!dsp.view.program) continue

        const swapState = this.crossfadeState.get(dsp.dsp$)
        if (swapState && !swapSeen.has(dsp.dsp$)) {
          swapSeen.add(dsp.dsp$)
          swapToAdvance.push({ dsp, state: swapState })
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
          outLeft[j] += this.scratchLeft[i]
          outRight[j] += this.scratchRight[i]
        }
      }
    }

    if (advanceSwap) {
      for (const s of swapToAdvance) {
        this.advanceSwapState(s.dsp, s.state)
      }
    }

    return { didRangeSeek, swapToAdvance }
  }

  reset() {
    if (!this.core) return
    // Reset globalSampleCount and sequence state if Stop was pressed (not just Pause)
    this.core.wasm.resetGlobalSampleCount()
    Atomics.store(this.options.processorOptions.globalSampleCount, 0, 0)
    for (const dsp of this.dsps) {
      this.core.wasm.resetDsp(dsp.dsp$)
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
      let seekTargetSample: number | undefined
      const isRestartWithProgram = control === ControlOp.RestartWithProgram

      if (control === ControlOp.Seek) {
        const seekSample = this.seekSample
        if (seekSample) {
          const targetSample = Math.max(0, Atomics.load(seekSample, 0))
          seekTargetSample = targetSample
        }
        control = this.lastControl
        Atomics.store(this.options.processorOptions.control, 0, control)
      }
      else if (control === ControlOp.SeekImmediate) {
        const seekSample = this.seekSample
        if (seekSample) {
          const targetSample = Math.max(0, Atomics.load(seekSample, 0))
          this.applySeekSample(targetSample)
        }
        control = this.lastControl
        Atomics.store(this.options.processorOptions.control, 0, control)
      }

      // Only respond to control changes
      if (!isRestartWithProgram && control !== this.lastControl) {
        if (control === ControlOp.Start) {
          if (this.state === 'stopped') {
            this.state = 'fade-in'
            this.shouldReset = false
          }
          else if (this.state === 'fade-out') {
            // If play is pressed while we're fading out, resume immediately so
            // we don't end up stopped with ControlOp.Start latched.
            this.state = 'running'
            this.shouldReset = false
          }
        }
        else if (control === ControlOp.Pause && (this.state === 'running' || this.state === 'fade-in')) {
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
              }
            }
          }

          this.signalSwapResult(1)

          Atomics.store(this.options.processorOptions.control, 0, this.lastControl)
        }
        this.lastControl = control
      }

      let sampleBefore = this.core.wasm.globalSampleCount.value
      let didRangeSeek = false

      const hardLoop = this.hardLoop
      const hardEnabled = hardLoop ? Atomics.load(hardLoop, 0) === 1 : false
      const hardStart = 0
      const hardEnd = hardEnabled ? Atomics.load(hardLoop!, 1) : 0
      const hardLength = hardEnabled ? Math.max(0, hardEnd - hardStart) : 0

      const loop = this.loop
      const loopEnabled = loop ? Atomics.load(loop, 0) === 1 : false
      const loopStartRaw = loopEnabled ? Atomics.load(loop!, 1) : 0
      const loopEndRaw = loopEnabled ? Atomics.load(loop!, 2) : 0
      const loopLengthRaw = loopEnabled ? Math.max(0, loopEndRaw - loopStartRaw) : 0

      let rangeEnabled = loopEnabled && loopLengthRaw > 0
      let rangeStart = loopStartRaw
      let rangeEnd = loopEndRaw

      if (hardEnabled && hardLength > 0) {
        if (!rangeEnabled) {
          rangeEnabled = true
          rangeStart = hardStart
          rangeEnd = hardEnd
        }
        else {
          rangeStart = Math.max(rangeStart, hardStart)
          rangeEnd = Math.min(rangeEnd, hardEnd)
          if (rangeEnd <= rangeStart) rangeEnabled = false
        }
      }

      const rangeLength = rangeEnabled ? Math.max(0, rangeEnd - rangeStart) : 0

      if (isRestartWithProgram) {
        const ringPos = Atomics.load(this.options.processorOptions.ringPos, 0)
        const begin = ringPos * CHUNK_SIZE
        const length = CHUNK_SIZE
        const seekSample = this.seekSample ? Math.max(0, Atomics.load(this.seekSample, 0)) : 0
        const restartSample = (rangeEnabled && rangeLength > 0 && (seekSample < rangeStart || seekSample >= rangeEnd))
          ? rangeStart
          : seekSample

        const swap = this.options.processorOptions.programSwap
        let newProgram$ = 0
        let targetDsp$ = 0
        let bpmBits = 0
        for (let i = 0; i < MAX_DSP_INSTANCES; i++) {
          const base = i * 3
          const bits = Atomics.load(swap, base)
          const new$ = Atomics.load(swap, base + 1)
          const dsp$ = Atomics.load(swap, base + 2)
          if (new$ && dsp$) {
            bpmBits = bits
            newProgram$ = new$
            targetDsp$ = dsp$
            break
          }
        }

        const target = targetDsp$ ? this.dsps.find(d => d.dsp$ === targetDsp$) : undefined
        if (!newProgram$ || !target) {
          this.signalSwapResult(-1)
          Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
          control = ControlOp.Start
        }
        else {
          // Render the current program, then fade it out across this chunk.
          this.renderChunk(
            sampleBefore,
            begin,
            length,
            rangeEnabled,
            rangeStart,
            rangeEnd,
            rangeLength,
            this.seekLeft,
            this.seekRight,
            false,
          )

          this.crossfadeState.clear()

          for (let i = 0; i < length; i++) {
            const gain = 1 - i / (length - 1)
            this.seekLeft[i] *= gain
            this.seekRight[i] *= gain
          }

          // Restart the timeline and reset DSP state before rendering the new program.
          this.applySeekSample(restartSample)
          if (bpmBits) {
            const bpm = u32ToF32(bpmBits)
            this.core.wasm.bpm.value = bpm
            this.options.processorOptions.bpmValue[0] = bpm
            this.lastBpm = bpm
          }
          target.view.program = newProgram$

          // Ensure we keep running and clear the one-shot op.
          this.state = 'running'
          this.lastControl = ControlOp.Start
          Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
          control = ControlOp.Start

          const L = this.outLeft
          const R = this.outRight

          this.renderChunk(
            restartSample,
            begin,
            length,
            rangeEnabled,
            rangeStart,
            rangeEnd,
            rangeLength,
            L,
            R,
            false,
          )

          for (let i = 0; i < length; i++) {
            L[i] += this.seekLeft[i]
            R[i] += this.seekRight[i]
          }

          let sampleAfter = restartSample + length
          if (rangeEnabled && rangeLength > 0 && sampleAfter >= rangeEnd) {
            const over = sampleAfter - rangeEnd
            sampleAfter = rangeStart + (over % rangeLength)
          }
          this.core.wasm.globalSampleCount.value = sampleAfter

          let playingCount = 0
          for (const dsp of this.dsps) {
            if (!dsp.view.program) continue
            playingCount++
          }
          if (playingCount > 1) {
            this.limiter.process(L, R)
          }

          Atomics.store(
            this.options.processorOptions.ringPos,
            0,
            (ringPos + 1) % (RING_BUFFER_SIZE / CHUNK_SIZE),
          )

          outputs[0][0].set(L)
          outputs[0][1].set(R)

          // Publish the new playhead immediately.
          Atomics.store(this.options.processorOptions.globalSampleCount, 0, restartSample)

          // Clear the loops if any
          if (this.loop) Atomics.store(this.loop, 0, 0)

          this.signalSwapResult(1)
          return true
        }
      }

      if (rangeEnabled && rangeLength > 0) {
        if ((this.state === 'stopped' && sampleBefore < rangeStart) || sampleBefore >= rangeEnd) {
          this.applySeekSample(rangeStart)
          sampleBefore = rangeStart
          didRangeSeek = true
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

      if (this.state === 'stopped') {
        if (seekTargetSample !== undefined) {
          const seekSample = (rangeEnabled && rangeLength > 0
              && (seekTargetSample < rangeStart || seekTargetSample >= rangeEnd))
            ? rangeStart
            : seekTargetSample
          this.applySeekSample(seekSample)
        }
        return true
      }

      const ringPos = Atomics.load(this.options.processorOptions.ringPos, 0)
      const begin = ringPos * CHUNK_SIZE
      const length = CHUNK_SIZE

      const L = this.outLeft
      const R = this.outRight

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
      let swapPlayingCount = 0

      for (const dsp of this.dsps) {
        if (!dsp.view.program) continue
        playingCount++
        if (this.crossfadeState.has(dsp.dsp$)) swapPlayingCount++
      }

      if (control === ControlOp.Swap && this.crossfadeState.size && swapPlayingCount === 0) {
        this.crossfadeState.clear()
        this.signalSwapResult(-1)
        Atomics.store(this.options.processorOptions.control, 0, ControlOp.Start)
      }

      const seekEnabled = seekTargetSample !== undefined
      if (seekEnabled) {
        this.renderChunk(sampleBefore, begin, length, rangeEnabled, rangeStart, rangeEnd, rangeLength, this.seekLeft,
          this.seekRight, false)

        const seekSample = (rangeEnabled && rangeLength > 0
            && (seekTargetSample! < rangeStart || seekTargetSample! >= rangeEnd))
          ? rangeStart
          : seekTargetSample!
        this.applySeekSample(seekSample)
        sampleBefore = seekSample
      }

      const main = this.renderChunk(sampleBefore, begin, length, rangeEnabled, rangeStart, rangeEnd, rangeLength, L, R,
        !seekEnabled)
      didRangeSeek = didRangeSeek || main.didRangeSeek

      if (seekEnabled) {
        for (let i = 0; i < CHUNK_SIZE; i++) {
          const t = i / (CHUNK_SIZE - 1)
          const inv = 1 - t
          L[i] = this.seekLeft[i] * inv + L[i] * t
          R[i] = this.seekRight[i] * inv + R[i] * t
        }

        for (const s of main.swapToAdvance ?? []) {
          this.advanceSwapState(s.dsp, s.state)
        }
      }

      let sampleAfter = sampleBefore + length
      if (rangeEnabled && rangeLength > 0 && sampleAfter >= rangeEnd) {
        const over = sampleAfter - rangeEnd
        sampleAfter = rangeStart + (over % rangeLength)
      }
      if (rangeEnabled && rangeLength > 0 && sampleBefore + length >= rangeEnd && !didRangeSeek) {
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

      return true
    }
    catch (error) {
      this.crossfadeState.clear()
      this.signalSwapResult(-1)

      Atomics.store(this.options.processorOptions.control, 0, ControlOp.Pause)
      this.lastControl = ControlOp.Pause
      this.state = 'stopped'
      console.error('AudioWorklet process error:', error)
      return true
    }
  }
}

registerProcessor('dsp', DspProcessor)
