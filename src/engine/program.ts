import { toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_WRITE_POS_OFFSET,
  LITERALS_COUNT,
  MAX_DSP_INSTANCES,
  OPS_COUNT,
  RING_BUFFER_SIZE,
} from '../../as/assembly/constants.ts'
import { AnalyserOutsPoolStruct, type Dsp, DspStruct, ProgramDataStruct, ProgramStruct } from '../assembly.ts'
import { encodeLangToVmOps } from '../bytecode.ts'
import { AnimationManager } from '../lib/animation-manager.ts'
import { buildMiniSourceMap } from '../lib/mini-source-map.ts'
import { compileMiniNotation } from '../mini/compiler.ts'
import { ControlOp } from '../worklet-shared.ts'
import workletUrl from '../worklet.js?worker&url'
import type { DspProcessor, DspProcessorOptions } from '../worklet.ts'

export type VmArray = {
  length: number
  raw: Float32Array
  data: Float32Array
}

export type VmHistory = {
  writePos: number
  raw: Float32Array
}

type Program = Awaited<ReturnType<typeof createProgram>>
type ProgramDataView = ReturnType<typeof createProgramDataView>

let wasmMemory: WebAssembly.Memory | undefined
let wasmDsp: Dsp | undefined
let wasmDspPtr = 0
let program1: { program: Program; clear: () => void } | undefined
let program2: { program: Program; clear: () => void } | undefined
const animationManager = new AnimationManager()

const MINI_ARRAY_INDEX = 0
const DEFAULT_SEQUENCES = ['c4 e4 [g4 a4]*2', 'a3 c4 [d4 f4 a4]*2']

async function updateSequence(program: Program, sequence: string, data: ProgramDataView) {
  const compiled = compileMiniNotation(sequence)
  const target = data.arrays[MINI_ARRAY_INDEX]

  // Write new bytecode without clearing first to avoid race condition
  // Only clear the tail if new bytecode is shorter
  const maxSize = Math.min(compiled.bytecode.length, ARRAY_SIZE)
  const oldMaxSize = Math.min(target.raw.length - ARRAY_HEADER_SIZE, ARRAY_SIZE)

  // Write new bytecode
  target.raw.set(compiled.bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
  target.length = maxSize

  // Increment version to signal bytecode change
  const currentVersion = target.raw[3] || 0
  target.raw[3] = currentVersion + 1

  const sourceMap = buildMiniSourceMap(compiled.nodes, target.raw)
}

function buildProgram(data: ProgramDataView) {
  const src = `
mini(${MINI_ARRAY_INDEX}, (trig, velocity, hz) -> {
  env = adsr(attack:0.01, decay:0.3, sustain:0.2, release:0.4, trig)
  sin(hz, trig) * env * velocity * 0.25
}) |> analyser(%) |> out(%)
`

  const { errors } = encodeLangToVmOps(src, { ops: data.ops, literals: data.literals })
  if (errors.length) {
    console.error('VM compile errors:', errors)
  }
}

function createProgramDataView(data$: number, arrays$: number[]) {
  if (!wasmMemory) throw new Error('Wasm memory not initialized')
  const programData = ProgramDataStruct(wasmMemory.buffer, data$)
  const lock = new Int32Array(wasmMemory.buffer, programData.lock, 1)
  const ops$ = programData.ops
  const ops = new Int32Array(wasmMemory.buffer, ops$, OPS_COUNT)

  const arrayBuffers = new Uint32Array(wasmMemory.buffer, programData.arrays, ARRAYS_COUNT)
  const arrays = new Array<VmArray>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    const byteOffset = arrayBuffers[i] = arrays$[i]
    const length = new Float32Array(wasmMemory.buffer, byteOffset, 1)
    arrays[i] = {
      get length() {
        return length[0]
      },
      set length(value: number) {
        length[0] = value
      },
      raw: new Float32Array(wasmMemory.buffer, byteOffset, ARRAY_SIZE + ARRAY_HEADER_SIZE),
      data: new Float32Array(
        wasmMemory.buffer,
        byteOffset + ARRAY_HEADER_SIZE * Float32Array.BYTES_PER_ELEMENT,
        ARRAY_SIZE,
      ),
    }
  }

  const literals = new Float32Array(wasmMemory.buffer, programData.literals, LITERALS_COUNT)

  return {
    ptr$: data$,
    lock,
    ops,
    arrays,
    literals,
    async acquireLock() {
      while (true) {
        const prev = Atomics.compareExchange(this.lock, 0, 0, 1)
        if (prev === 0) return
        await Atomics.waitAsync(this.lock, 0, prev).value
      }
    },
    releaseLock() {
      Atomics.store(this.lock, 0, 0)
      Atomics.notify(this.lock, 0)
    },
    async withLock(fn: () => void) {
      await this.acquireLock()
      fn()
      this.releaseLock()
    },
    writeLiteral(index: number, value: number) {
      this.withLock(() => {
        literals[index] = value
      })
    },
  }
}

async function createProgramData() {
  if (!wasmMemory) throw new Error('Wasm memory not initialized')
  const data$ = await worklet.createProgramData()
  const arrays$ = await worklet.createArrays()
  const data = createProgramDataView(data$, arrays$)
  return data
}

async function fetchWasmBinary() {
  const wasmUrl = new URL('/as/build/index.wasm', location.origin).toString()
  const response = await fetch(wasmUrl + '?t=' + Date.now())
  if (!response.ok) {
    throw new Error(`Failed to fetch WASM: ${response.status} ${response.statusText}`)
  }
  const binary = await response.arrayBuffer()
  return binary
}

async function updateWasmBinary() {
  const binary = await fetchWasmBinary()
  const { memory, dsp$ } = await worklet.setWasmBinary(binary)
  wasmMemory = memory
  wasmDsp = DspStruct(wasmMemory.buffer, dsp$)
  wasmDspPtr = dsp$

  program1?.clear()
  program2?.clear()

  animationManager.start()

  program1 = await createProgramAndUI(0)
  // program2 = await createProgramAndUI(1)
  wasmDsp!.program = program1.program.ptr$
}

async function createWorklet() {
  const audioContext = new AudioContext({ latencyHint: 0.05 })
  await audioContext.audioWorklet.addModule(workletUrl)
  const sourcemapUrl = new URL('/as/build/index.wasm.map', location.origin).toString()
  const ringPos = new Uint8Array(new SharedArrayBuffer(1 * Uint8Array.BYTES_PER_ELEMENT))
  const control = new Uint32Array(new SharedArrayBuffer(1 * Uint32Array.BYTES_PER_ELEMENT))
  const bpmValue = new Float32Array(new SharedArrayBuffer(1 * Float32Array.BYTES_PER_ELEMENT))
  bpmValue[0] = 60 // Initialize BPM to 60
  const globalSampleCount = new Int32Array(new SharedArrayBuffer(1 * Int32Array.BYTES_PER_ELEMENT))
  globalSampleCount[0] = 0
  const programSwap = new Uint32Array(
    new SharedArrayBuffer(3 * MAX_DSP_INSTANCES * Uint32Array.BYTES_PER_ELEMENT),
  ) // old, new, dsp$ per instance
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

const {
  ringPos,
  control,
  bpmValue,
  globalSampleCount,
  programSwap,
  prepareDsp,
  worklet,
  audioContext,
} = await createWorklet()

async function createProgram(sequence: string) {
  if (!wasmMemory) throw new Error('Wasm memory not initialized')
  const program$ = await worklet.createProgram()
  const program = ProgramStruct(wasmMemory.buffer, program$)
  const lock = new Int32Array(wasmMemory.buffer, program.lock, 1)

  let programDataPoolIndex = 0
  const programDataPool: ProgramDataView[] = [
    await createProgramData(),
    await createProgramData(),
  ]

  const histories$ = await worklet.createHistories()
  const historyBuffers = new Uint32Array(wasmMemory.buffer, program.histories, HISTORIES_COUNT)
  const histories = new Array<VmHistory>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    const byteOffset = historyBuffers[i] = histories$[i]
    const writePos = new Float32Array(wasmMemory.buffer,
      byteOffset + HISTORY_WRITE_POS_OFFSET * Float32Array.BYTES_PER_ELEMENT, 1)
    histories[i] = {
      get writePos() {
        return writePos[0] || 0
      },
      raw: new Float32Array(wasmMemory.buffer, byteOffset, HISTORY_HEADER_SIZE + HISTORY_SIZE * HISTORY_ENTRY_SIZE),
    }
  }

  function nextProgramData() {
    const data = programDataPool[programDataPoolIndex]
    programDataPoolIndex = (programDataPoolIndex + 1) % programDataPool.length
    return data
  }

  const analyserOutsPool = AnalyserOutsPoolStruct(wasmMemory.buffer, program.analyserOutsPool)
  const analyserOuts$ = new Uint32Array(wasmMemory.buffer, analyserOutsPool.outs, 64)
  const analyserOuts = [...analyserOuts$].map(out$ =>
    toRing(new Float32Array(wasmMemory!.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
  )

  let programData: ProgramDataView | undefined
  const out = {
    ptr$: program$,
    lock,
    analyserOuts,
    histories,
    get data() {
      return programData
    },
    _updateSequence(sequence: string, data: ProgramDataView | undefined = programData) {
      if (!data) throw new Error('Data not set')
      updateSequence(out, sequence, data)
    },
    async updateSequence(sequence: string, data: ProgramDataView | undefined = programData) {
      await this.withLock(() => {
        this._updateSequence(sequence, data)
      })
    },
    async buildFromSequence(sequence: string) {
      const newData = nextProgramData()
      buildProgram(newData)

      await this.acquireLock()

      const oldArray = programData?.arrays[MINI_ARRAY_INDEX]
      if (oldArray) {
        const newArray = newData.arrays[MINI_ARRAY_INDEX]
        newArray.raw[3] = oldArray.raw[3] // copy version so that mini change sequence triggers
      }

      this._updateSequence(sequence, newData)
      this._setData(newData)

      Atomics.store(prepareDsp, 0, wasmDspPtr)
      Atomics.store(control, 0, ControlOp.Prepare)

      this.releaseLock()
    },
    async acquireLock() {
      while (true) {
        const prev = Atomics.compareExchange(this.lock, 0, 0, 1)
        if (prev === 0) break
        await Atomics.waitAsync(this.lock, 0, prev).value
      }
    },
    releaseLock() {
      Atomics.store(this.lock, 0, 0)
      Atomics.notify(this.lock, 0)
    },
    async withLock(fn: () => void) {
      await this.acquireLock()
      fn()
      this.releaseLock()
    },
    _setData(value: ProgramDataView) {
      programData = value
      program.data = programData.ptr$
    },
    async setData(value: ProgramDataView) {
      await this.withLock(() => {
        this._setData(value)
      })
    },
  }

  return out
}

async function createProgramAndUI(index: number) {
  const sequence = localStorage.getItem(`engine2:sequence-${index}`) ?? DEFAULT_SEQUENCES[index]
  const program = await createProgram(sequence)
  await program.buildFromSequence(sequence)

  const sequenceInput = Object.assign(
    document.createElement('input'),
    {
      type: 'text',
      value: sequence,
      className: 'bg-gray-800 text-white p-2 rounded-md border border-gray-600 w-full max-w-md',
      oninput: (e: InputEvent & { target: HTMLInputElement }) => {
        program.buildFromSequence(e.target.value)
        localStorage.setItem(`engine2:sequence-${index}`, e.target.value)
      },
    },
  )
  document.body.appendChild(sequenceInput)

  function clear() {
    sequenceInput.remove()
  }

  return { program, clear }
}
