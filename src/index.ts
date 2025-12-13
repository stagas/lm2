import { toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  HISTORIES_COUNT,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_HEADER_SIZE,
  HISTORY_SIZE,
  HISTORY_WRITE_POS_OFFSET,
  LITERALS_COUNT,
  MAX_DSP_INSTANCES,
  OPS_COUNT,
  RING_BUFFER_SIZE,
} from '../as/assembly/constants.ts'
import { AnalyserOutsPoolStruct, type Dsp, DspStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import { Bytecode } from './bytecode.ts'
import { AnimationManager } from './lib/animation-manager.ts'
import { readEventValues } from './lib/mini-bytecode-reader.ts'
import { buildMiniSourceMap } from './lib/mini-source-map.ts'
import { createPianorollVisualization } from './lib/pianoroll-visualizer.ts'
import { createSequenceVisualization } from './lib/sequence-visualizer.ts'
import { compileMiniNotation } from './mini/compiler.ts'
import { frequencyToNoteName } from './mini/note-utils.ts'
import { ControlOp } from './worklet-shared.ts'
import workletUrl from './worklet.js?worker&url'
import type { DspProcessor, DspProcessorOptions } from './worklet.ts'

type State = 'stopped' | 'running' | 'paused'
let state: State = 'stopped'

type VmArray = {
  length: number
  raw: Float32Array
  data: Float32Array
}

export type VmHistory = {
  writePos: number
  raw: Float32Array
}

let wasmMemory: WebAssembly.Memory | undefined
let wasmDsp: Dsp | undefined
let wasmDspPtr = 0
let extraDsp: Dsp | undefined
let extraDspPtr = 0
let program1: { program: Program; clear: () => void } | undefined
let program2: { program: Program; clear: () => void } | undefined
const animationManager = new AnimationManager()
let sequenceVisualization: ReturnType<typeof createSequenceVisualization> | undefined
let pianorollVisualization: ReturnType<typeof createPianorollVisualization> | undefined

const MINI_ARRAY_INDEX = 0
const LIT_ATTACK = 0
const LIT_DECAY = 1
const LIT_SUSTAIN = 2
const LIT_RELEASE = 3
const LIT_MASTER = 4

type Program = Awaited<ReturnType<typeof createProgram>>
type ProgramDataView = ReturnType<typeof createProgramDataView>

function readMiniEvents(
  array: VmArray,
  history: VmHistory,
  sampleRate: number,
  lookAheadSeconds: number = 4,
): Array<{
  note: string
  start: number
  end: number
  startTime: number
  endTime: number
}> {
  if (!wasmMemory) return []

  const bytecode = array.raw
  const currentSample = Atomics.load(globalSampleCount, 0)
  const currentTimeSeconds = currentSample / sampleRate
  const windowEnd = currentTimeSeconds + lookAheadSeconds

  const historyRaw = history.raw
  const currentBytecodeLength = bytecode[ARRAY_HEADER_SIZE] as number

  const events: Array<{ note: string; start: number; end: number; startTime: number; endTime: number }> = []

  // Read events directly from history buffer (scan all slots)
  for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += 3) {
    const opIndex = Math.floor(historyRaw[idx])
    const startSample = Math.floor(historyRaw[idx + 1])
    const endSample = Math.floor(historyRaw[idx + 2])

    if (startSample === 0 && endSample === 0) continue

    const startTimeSeconds = startSample / sampleRate
    const endTimeSeconds = endSample / sampleRate

    // Only include future events
    if (startTimeSeconds < currentTimeSeconds || startTimeSeconds > windowEnd) continue

    // Only use events with valid opIndex
    if (opIndex < 0 || opIndex >= currentBytecodeLength) continue

    // Read note value from bytecode
    const values = readEventValues(bytecode, opIndex)
    if (values.length === 0) continue

    // Use first value as the note
    const noteValue = values[0]!
    if (noteValue <= 0) continue

    const note = frequencyToNoteName(noteValue)
    if (note != null && typeof note === 'string' && note.length > 0 && note !== 'undefined' && note !== 'null') {
      events.push({
        note: String(note),
        start: startSample,
        end: endSample,
        startTime: startTimeSeconds,
        endTime: endTimeSeconds,
      })
    }
  }

  events.sort((a, b) => a.start - b.start)
  return events
}

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

  // Clear tail if new bytecode is shorter (to avoid stale data)
  // if (maxSize < oldMaxSize) {
  //   const tailStart = ARRAY_HEADER_SIZE + maxSize
  //   const tailEnd = ARRAY_HEADER_SIZE + oldMaxSize
  //   for (let i = tailStart; i < tailEnd; i++) {
  //     target.raw[i] = 0
  //   }
  // }

  const sourceMap = buildMiniSourceMap(compiled.nodes, target.raw)

  if (sequenceVisualization) {
    sequenceVisualization.update(sequence, sourceMap)
  }
  else {
    sequenceVisualization = createSequenceVisualization(
      target,
      program.histories[MINI_ARRAY_INDEX],
      sequence,
      sourceMap,
      audioContext,
      bpmValue,
      globalSampleCount,
      animationManager,
      600,
      50,
    )
  }

  // Update pianoroll visualization with fresh array reference when bytecode changes
  if (!pianorollVisualization) {
    pianorollVisualization = createPianorollVisualization(
      program.histories[MINI_ARRAY_INDEX],
      audioContext,
      bpmValue,
      globalSampleCount,
      animationManager,
      800,
      400,
    )
  }
  else {
    pianorollVisualization.update(program.histories[MINI_ARRAY_INDEX])
  }

  const checkEvents = () => {
    if (!data) {
      eventsDiv.textContent = 'No data available'
      return
    }

    const target = data.arrays[MINI_ARRAY_INDEX]
    if (!target) {
      eventsDiv.textContent = 'No bytecode available'
      return
    }

    try {
      const events = readMiniEvents(target, program.histories[MINI_ARRAY_INDEX], audioContext.sampleRate, 4)
      const validEvents = events.filter(e => {
        if (!e || typeof e !== 'object') return false
        const note = e.note
        if (note === undefined || note === null) return false
        if (typeof note !== 'string') return false
        if (note.length === 0) return false
        if (note === 'undefined' || note === 'null') return false
        return true
      })
      if (validEvents.length > 0) {
        eventsDiv.textContent = validEvents.map(e => {
          const note = (e.note && typeof e.note === 'string') ? e.note : '?'
          return `${note} ${e.startTime.toFixed(2)}-${e.endTime.toFixed(2)} ${(e.start / 1000).toFixed(1)}-${
            (e.end / 1000).toFixed(1)
          }`
        }).join('\n')
      }
      else if (events.length > 0) {
        console.warn('All events filtered out. Sample events:', events.slice(0, 3))
        eventsDiv.textContent = `Found ${events.length} events but none had valid notes. Check console for details.`
      }
      else {
        eventsDiv.textContent = 'No events found in sequence'
      }
    }
    catch (error) {
      console.error('Error reading events:', error)
      eventsDiv.textContent = `Error reading events: ${error}`
    }
  }

  setTimeout(checkEvents, 50)
}

function buildProgram(data: ProgramDataView) {
  const bytecode = new Bytecode()

  data.writeLiteral(LIT_ATTACK, 0.02)
  data.writeLiteral(LIT_DECAY, 0.02)
  data.writeLiteral(LIT_SUSTAIN, 0.7)
  data.writeLiteral(LIT_RELEASE, 0.3)
  data.writeLiteral(LIT_MASTER, 0.25)

  bytecode.Mini(MINI_ARRAY_INDEX)

  bytecode.SeqForEach(() => {
    bytecode.SeqVoiceValue()
    bytecode.Literal(5)
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

  if (sequenceVisualization) {
    sequenceVisualization.destroy()
    sequenceVisualization = undefined
  }
  if (pianorollVisualization) {
    pianorollVisualization.destroy()
    pianorollVisualization = undefined
  }

  animationManager.start()

  program1 = await createProgramAndUI(0)
  // program2 = await createProgramAndUI(1)
  wasmDsp!.program = program1.program.ptr$

  extraDsp = undefined
  extraDspPtr = 0
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
  const dsp = new AudioWorkletNode(audioContext, 'dsp', {
    outputChannelCount: [2],
    processorOptions: {
      sourcemapUrl,
      ringPos,
      control,
      bpmValue,
      globalSampleCount,
      programSwap,
    },
  } satisfies DspProcessorOptions)
  dsp.connect(audioContext.destination)
  const worklet = rpc<DspProcessor>(dsp.port)
  return { ringPos, control, bpmValue, globalSampleCount, programSwap, worklet, audioContext }
}

const {
  ringPos,
  control,
  bpmValue,
  globalSampleCount,
  programSwap,
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
  setTimeout(() => {
    document.body.appendChild(eventsDiv)
  }, 500)
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

const swapButton = Object.assign(
  document.createElement('button'),
  {
    textContent: 'Swap',
    className: 'bg-purple-500 text-white p-2 rounded-md',
    onmousedown: async () => {
      if (!program1 || !program2 || !programSwap) return
      for (let i = 0; i < programSwap.length; i++) {
        Atomics.store(programSwap, i, 0)
      }
      Atomics.store(programSwap, 0, program1.program.ptr$)
      Atomics.store(programSwap, 1, program2.program.ptr$)
      Atomics.store(programSwap, 2, wasmDspPtr)
      Atomics.store(control, 0, ControlOp.Swap)
      ;[program1, program2] = [program2, program1]
    },
  },
)
document.body.appendChild(swapButton)

const playBothButton = Object.assign(
  document.createElement('button'),
  {
    textContent: 'Play Both',
    className: 'bg-emerald-600 text-white p-2 rounded-md',
    onmousedown: async () => {
      if (!program1 || !program2 || !wasmDsp) return
      wasmDsp.program = program1.program.ptr$
      await ensureExtraDsp()
      if (!extraDsp) return
      extraDsp.program = program2.program.ptr$
      Atomics.store(control, 0, ControlOp.Start)
      state = 'running'
    },
  },
)
document.body.appendChild(playBothButton)

const eventsDiv = Object.assign(
  document.createElement('div'),
  {
    className: 'text-white p-2 rounded-md border border-gray-600 w-full max-w-md whitespace-pre-wrap font-mono',
    onpointerdown: () => {
      // copy contents to clipboard
      navigator.clipboard.writeText(eventsDiv.textContent ?? '')
    },
  },
)

const DEFAULT_SEQUENCES = ['c4 e4 [g4 a4]*2', 'a3 c4 [d4 f4 a4]*2']

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

async function ensureExtraDsp() {
  if (!wasmMemory || !program2) return
  if (!extraDspPtr) {
    const dsp$ = await worklet.createDsp(program2.program.ptr$)
    extraDspPtr = dsp$
    extraDsp = DspStruct(wasmMemory.buffer, dsp$)
  }
  if (extraDsp) {
    extraDsp.program = program2.program.ptr$
  }
}

await updateWasmBinary()

if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', updateWasmBinary)
}
