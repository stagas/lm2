import { type Ring, toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import { ARRAY_HEADER_SIZE, ARRAY_SIZE, ARRAYS_COUNT, CHUNK_SIZE, LITERALS_COUNT, OPS_COUNT, RING_BUFFER_SIZE,
  SEQ_HISTORY_SIZE } from '../as/assembly/constants.ts'
import { AnalyserOutsPoolStruct, type Dsp, DspStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import { Bytecode } from './bytecode.ts'
import { compileMiniNotation } from './mini-notation.ts'
import { ControlOp } from './worklet-shared.ts'
import workletUrl from './worklet.js?worker&url'
import type { DspProcessor, DspProcessorOptions } from './worklet.ts'

type State = 'stopped' | 'running' | 'paused'
let state: State = 'stopped'

type VmArray = {
  length: number
  historyWritePos: number
  historySize: number
  history: Float32Array
  raw: Float32Array
  data: Float32Array
}

let wasmMemory: WebAssembly.Memory | undefined
let wasmRings: Ring[] | undefined
let wasmDsp: Dsp | undefined
let program: Program | undefined

const MINI_ARRAY_INDEX = 0
const LIT_ATTACK = 0
const LIT_DECAY = 1
const LIT_SUSTAIN = 2
const LIT_RELEASE = 3
const LIT_MASTER = 4

type Program = Awaited<ReturnType<typeof createProgram>>
type ProgramDataView = ReturnType<typeof createProgramDataView>

function buildProgramFromSequence(data: ProgramDataView, sequence: string) {
  const compiled = compileMiniNotation(sequence)

  const target = data.arrays[MINI_ARRAY_INDEX]
  target.raw.fill(0)
  target.raw[2] = SEQ_HISTORY_SIZE
  target.raw.set(compiled.bytecode, ARRAY_HEADER_SIZE)
  target.length = compiled.bytecode.length

  const bytecode = new Bytecode()

  data.writeLiteral(LIT_ATTACK, 0.05)
  data.writeLiteral(LIT_DECAY, 0.05)
  data.writeLiteral(LIT_SUSTAIN, 0.7)
  data.writeLiteral(LIT_RELEASE, 0.2)
  data.writeLiteral(LIT_MASTER, 0.25)

  bytecode.Mini(MINI_ARRAY_INDEX)

  bytecode.SeqForEach(() => {
    bytecode.SeqVoiceValue()
    bytecode.SeqVoiceTrig()
    bytecode.Sin()

    bytecode.Literal(LIT_ATTACK)
    bytecode.Literal(LIT_DECAY)
    bytecode.Literal(LIT_SUSTAIN)
    bytecode.Literal(LIT_RELEASE)
    bytecode.SeqVoiceTrig()
    bytecode.Adsr()

    bytecode.Mul()
    bytecode.SeqVoiceVelocity()
    bytecode.Mul()
  })

  bytecode.Analyser()
  bytecode.Literal(LIT_MASTER)
  bytecode.Mul()
  bytecode.Dup()
  bytecode.Out()

  bytecode.End()
  data.ops.fill(0)
  data.ops.set(bytecode.ops.subarray(0, bytecode.pc))
}

const programDataPool: ProgramDataView[] = []
let programDataPoolIndex = 0

function createProgramDataView(data$: number, arrays$: number[]) {
  if (!wasmMemory) throw new Error('Wasm memory not initialized')
  const programData = ProgramDataStruct(wasmMemory.buffer, data$)
  const lock = new Int32Array(wasmMemory.buffer, programData.lock, 1)
  const ops$ = programData.ops
  const ops = new Int32Array(wasmMemory.buffer, ops$, OPS_COUNT)
  const arrayBuffers = new Uint32Array(wasmMemory.buffer, programData.arrays, ARRAYS_COUNT)
  const arrays = new Array<VmArray>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    arrayBuffers[i] = arrays$[i]
    const arrayBase = arrays$[i]
    const length = new Float32Array(wasmMemory.buffer, arrayBase, 1)
    const historyWritePos = new Float32Array(wasmMemory.buffer, arrayBase + 1 * Float32Array.BYTES_PER_ELEMENT, 1)
    const historySize = new Float32Array(wasmMemory.buffer, arrayBase + 2 * Float32Array.BYTES_PER_ELEMENT, 1)
    const history = new Float32Array(
      wasmMemory.buffer,
      arrayBase + 3 * Float32Array.BYTES_PER_ELEMENT,
      SEQ_HISTORY_SIZE * 3,
    )
    arrays[i] = {
      get length() {
        return length[0]
      },
      set length(value: number) {
        length[0] = value
      },
      get historyWritePos() {
        return historyWritePos[0]
      },
      get historySize() {
        return historySize[0]
      },
      history,
      raw: new Float32Array(wasmMemory.buffer, arrayBase, ARRAY_SIZE + ARRAY_HEADER_SIZE),
      data: new Float32Array(
        wasmMemory.buffer,
        arrayBase + ARRAY_HEADER_SIZE * Float32Array.BYTES_PER_ELEMENT,
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
    acquireLock() {
      while (Atomics.load(this.lock, 0) !== 0) {
        Atomics.wait(this.lock, 0, 0)
      }
      Atomics.store(this.lock, 0, 1)
    },
    releaseLock() {
      Atomics.store(this.lock, 0, 0)
      Atomics.notify(this.lock, 0)
    },
    withLock(fn: () => void) {
      this.acquireLock()
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

async function ensureProgramData(count = 2) {
  while (programDataPool.length < count) {
    programDataPool.push(await createProgramData())
  }
}

async function nextProgramData(): Promise<ProgramDataView> {
  await ensureProgramData()
  const data = programDataPool[programDataPoolIndex]
  programDataPoolIndex = (programDataPoolIndex + 1) % programDataPool.length
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
  const { memory, rings, dsp$ } = await worklet.setWasmBinary(binary)
  wasmMemory = memory
  wasmRings = rings
  wasmDsp = DspStruct(wasmMemory.buffer, dsp$)
  program = await createProgram()
  wasmDsp.program = program.ptr$
}

async function createWorklet() {
  const audioContext = new AudioContext({ latencyHint: 0.05 })
  await audioContext.audioWorklet.addModule(workletUrl)
  const sourcemapUrl = new URL('/as/build/index.wasm.map', location.origin).toString()
  const ringPos = new Uint8Array(new SharedArrayBuffer(4))
  const control = new Uint32Array(new SharedArrayBuffer(4))
  const bpmValue = new Float32Array(new SharedArrayBuffer(4))
  bpmValue[0] = 60 // Initialize BPM to 60
  const globalSampleCount = new Int32Array(new SharedArrayBuffer(4))
  globalSampleCount[0] = 0
  const dsp = new AudioWorkletNode(audioContext, 'dsp', {
    outputChannelCount: [2],
    processorOptions: {
      sourcemapUrl,
      ringPos,
      control,
      bpmValue,
      globalSampleCount,
    },
  } satisfies DspProcessorOptions)
  dsp.connect(audioContext.destination)
  const worklet = rpc<DspProcessor>(dsp.port)
  return { ringPos, control, bpmValue, globalSampleCount, worklet, audioContext }
}

const { ringPos, control, bpmValue, globalSampleCount, worklet, audioContext } = await createWorklet()

async function createProgram() {
  if (!wasmMemory) throw new Error('Wasm memory not initialized')
  await ensureProgramData()
  const program$ = await worklet.createProgram()
  const program = ProgramStruct(wasmMemory.buffer, program$)
  const lock = new Int32Array(wasmMemory.buffer, program.lock, 1)
  const analyserOutsPool = AnalyserOutsPoolStruct(wasmMemory.buffer, program.analyserOutsPool)
  const analyserOuts$ = new Uint32Array(wasmMemory.buffer, analyserOutsPool.outs, 64)
  const _analyserOuts = [...analyserOuts$].map(out$ =>
    toRing(new Float32Array(wasmMemory!.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE)
  )
  let data = await nextProgramData()
  buildProgramFromSequence(data, currentSequenceString)
  const out = {
    ptr$: program$,
    lock,
    get data() {
      return data
    },
    set data(value: ProgramDataView) {
      while (Atomics.load(this.lock, 0) !== 0) {
        Atomics.wait(this.lock, 0, 0)
      }
      Atomics.store(this.lock, 0, 1)
      try {
        data = value
        program.data = data.ptr$
      }
      finally {
        Atomics.store(this.lock, 0, 0)
        Atomics.notify(this.lock, 0)
      }
    },
  }
  out.data = data
  return out
}

const startButton = Object.assign(
  document.createElement('button'),
  {
    textContent: 'Start',
    className: 'bg-blue-500 text-white p-2 rounded-md',
    onmousedown: () => {
      Atomics.store(control, 0, ControlOp.Start)
      state = 'running'
    },
  },
)
document.body.appendChild(startButton)

const pauseButton = Object.assign(
  document.createElement('button'),
  {
    textContent: 'Pause',
    className: 'bg-yellow-500 text-white p-2 rounded-md',
    onmousedown: () => {
      Atomics.store(control, 0, ControlOp.Pause)
      state = 'paused'
    },
  },
)
document.body.appendChild(pauseButton)

const stopButton = Object.assign(
  document.createElement('button'),
  {
    textContent: 'Stop',
    className: 'bg-red-500 text-white p-2 rounded-md',
    onmousedown: () => {
      // Send stop command and reset sample count
      Atomics.store(control, 0, ControlOp.Stop)
      state = 'stopped'
    },
  },
)
document.body.appendChild(stopButton)

const SEQUENCE_STORAGE_KEY = 'engine2:sequence'
const DEFAULT_SEQUENCE = 'c4 e4 [g4 a4]*2'
let currentSequenceString = localStorage.getItem(SEQUENCE_STORAGE_KEY) ?? DEFAULT_SEQUENCE

const sequenceInput = Object.assign(
  document.createElement('input'),
  {
    type: 'text',
    value: currentSequenceString,
    className: 'bg-gray-800 text-white p-2 rounded-md border border-gray-600 w-full max-w-md',
    oninput: (e: InputEvent & { target: HTMLInputElement }) => {
      void updateSequence(e.target.value)
    },
  },
)
document.body.appendChild(sequenceInput)

async function updateSequence(newSequence: string) {
  currentSequenceString = newSequence
  localStorage.setItem(SEQUENCE_STORAGE_KEY, newSequence)
  if (program) {
    const data = await nextProgramData()
    buildProgramFromSequence(data, currentSequenceString)
    program.data = data
    Atomics.store(globalSampleCount, 0, 0)
  }
}

updateWasmBinary()
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', updateWasmBinary)
}
