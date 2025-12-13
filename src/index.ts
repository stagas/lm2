import { type Ring, toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import { ARRAY_HEADER_SIZE, ARRAY_SIZE, ARRAYS_COUNT, CHUNK_SIZE, LITERALS_COUNT, MAX_DSP_INSTANCES, MINI_HEADER_SIZE,
  OPS_COUNT, RING_BUFFER_SIZE, SEQ_HISTORY_SIZE } from '../as/assembly/constants.ts'
import { AnalyserOutsPoolStruct, type Dsp, DspStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import { Bytecode } from './bytecode.ts'
import { AnimationManager } from './lib/animation-manager.ts'
import { buildMiniSourceMap, type SourceLocation } from './lib/mini-source-map.ts'
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
  historyWritePos: number
  historySize: number
  history: Float32Array
  raw: Float32Array
  data: Float32Array
}

let wasmMemory: WebAssembly.Memory | undefined
let wasmDsp: Dsp | undefined
let wasmDspPtr = 0
let extraDsp: Dsp | undefined
let extraDspPtr = 0
let program1: { program: Program; clear: () => void } | undefined
let program2: { program: Program; clear: () => void } | undefined
const animationManager = new AnimationManager()
let sequenceVisualization: { canvas: HTMLCanvasElement;
  update: (sequence: string, sourceMap: Map<number, SourceLocation>) => void; destroy: () => void } | undefined
let pianorollVisualization: { canvas: HTMLCanvasElement; clear: () => void; destroy: () => void } | undefined

const MINI_ARRAY_INDEX = 0
const LIT_ATTACK = 0
const LIT_DECAY = 1
const LIT_SUSTAIN = 2
const LIT_RELEASE = 3
const LIT_MASTER = 4

type Program = Awaited<ReturnType<typeof createProgram>>
type ProgramDataView = ReturnType<typeof createProgramDataView>

async function readMiniEvents(
  bytecode$: number,
  sampleRate: number,
  bpm: number,
  lookAheadCycles: number = 4,
): Promise<Array<{
  note: string
  start: number
  end: number
  startTime: number
  endTime: number
}>> {
  if (!bytecode$ || !wasmMemory) return []

  const eventBuffer$ = await worklet.createMiniEventBuffer()
  const cycleLength = 1.0
  const secondsPerBeat = 60.0 / bpm
  const cycleSeconds = cycleLength * secondsPerBeat
  const cycleSamples = cycleSeconds * sampleRate
  const currentSample = globalSampleCount[0]

  // Clear buffer once at start, then accumulate events across all cycles
  await worklet.clearMiniEventBuffer(eventBuffer$)

  for (let cycle = 0; cycle < lookAheadCycles; cycle++) {
    const cycleStartSample = currentSample + Math.floor(cycleSamples * cycle)
    const windowStart = cycleStartSample
    const windowEnd = cycleStartSample + Math.floor(cycleSamples)

    await worklet.emitMiniEvents(
      bytecode$,
      eventBuffer$,
      cycleStartSample,
      cycleLength,
      cycleSamples,
      windowStart,
      windowEnd,
    )
  }

  // Read all accumulated events once at the end
  const events: Array<{ note: string; start: number; end: number; startTime: number; endTime: number }> = []
  const eventCount = await worklet.getMiniEventBufferSize(eventBuffer$)
  for (let i = 0; i < eventCount; i++) {
    const event = await worklet.getMiniEvent(eventBuffer$, i)
    if (event.value > 0 && isFinite(event.value) && !isNaN(event.value)) {
      const note = frequencyToNoteName(event.value)
      if (note != null && typeof note === 'string' && note.length > 0 && note !== 'undefined' && note !== 'null') {
        const startTime = event.startSample / sampleRate
        const endTime = event.endSample / sampleRate

        events.push({
          note: String(note),
          start: event.startSample,
          end: event.endSample,
          startTime,
          endTime,
        })
      }
    }
  }

  events.sort((a, b) => a.start - b.start)
  return events
}

async function updateSequence(data: ProgramDataView, sequence: string) {
  const compiled = compileMiniNotation(sequence)
  const target = data.arrays[MINI_ARRAY_INDEX]

  // Check if bytecode changed by comparing length and content
  const oldBytecodeLength = target.raw[ARRAY_HEADER_SIZE] || 0
  const newBytecodeLength = compiled.bytecode.length - ARRAY_HEADER_SIZE - MINI_HEADER_SIZE
  const lengthChanged = oldBytecodeLength !== newBytecodeLength

  // If length is the same, compare content byte-by-byte
  let contentChanged = false
  if (!lengthChanged && oldBytecodeLength > 0) {
    const compareLength = Math.min(oldBytecodeLength, newBytecodeLength)
    for (let i = 0; i < compareLength; i++) {
      const oldVal = target.raw[ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + i] || 0
      const newVal = compiled.bytecode[ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + i] || 0
      if (oldVal !== newVal) {
        contentChanged = true
        break
      }
    }
  }

  const bytecodeChanged = lengthChanged || contentChanged

  // Always preserve history buffer - never clear it completely
  // When bytecode changes, we'll only clear future events (not yet played)
  const oldHistoryWritePos = target.raw[1] || 0
  const oldHistorySize = target.raw[2] || SEQ_HISTORY_SIZE
  const historyData = new Float32Array(SEQ_HISTORY_SIZE * 3)
  for (let i = 0; i < SEQ_HISTORY_SIZE * 3; i++) {
    historyData[i] = target.raw[3 + i] || 0
  }

  target.raw.fill(0)
  const maxSize = Math.min(compiled.bytecode.length, ARRAY_SIZE)
  target.raw.set(compiled.bytecode.subarray(0, maxSize), ARRAY_HEADER_SIZE)
  target.length = maxSize

  // Restore history buffer
  target.raw[1] = oldHistoryWritePos
  target.raw[2] = oldHistorySize || SEQ_HISTORY_SIZE
  for (let i = 0; i < SEQ_HISTORY_SIZE * 3; i++) {
    target.raw[3 + i] = historyData[i] || 0
  }

  // If bytecode changed, clear only future events (preserve past events)
  if (bytecodeChanged) {
    const currentSample = Atomics.load(globalSampleCount, 0)
    const historySize = Math.floor(target.raw[2]) || SEQ_HISTORY_SIZE
    const historyWritePos = Math.floor(target.raw[1]) || 0

    // Clear only future events (events that haven't started playing yet)
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const idx = readPos * 3
      const startSample = Math.floor(target.raw[3 + idx + 1])

      // If event hasn't started yet, clear it (future event)
      if (startSample >= currentSample) {
        target.raw[3 + idx] = 0
        target.raw[3 + idx + 1] = 0
        target.raw[3 + idx + 2] = 0
      }
    }
  }

  const sourceMap = buildMiniSourceMap(compiled.nodes, target.raw)

  if (sequenceVisualization) {
    sequenceVisualization.update(sequence, sourceMap)
  }
  else {
    sequenceVisualization = createSequenceVisualization(
      target,
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

  // Don't clear pianoroll visualization - preserve playback history
  // Events with invalid opIndex will be handled by the visualizer
  if (!pianorollVisualization) {
    pianorollVisualization = createPianorollVisualization(
      target,
      audioContext,
      bpmValue,
      globalSampleCount,
      animationManager,
      800,
      400,
    )
  }

  const checkEvents = async () => {
    const programData = ProgramDataStruct(wasmMemory!.buffer, data.ptr$)
    const arrayBuffers = new Uint32Array(wasmMemory!.buffer, programData.arrays, ARRAYS_COUNT)
    const bytecodePtr = arrayBuffers[MINI_ARRAY_INDEX]

    if (!bytecodePtr) {
      eventsDiv.textContent = 'No bytecode available'
      return
    }

    try {
      const events = await readMiniEvents(bytecodePtr, audioContext.sampleRate, bpmValue[0], 4)
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
    async updateSequence(sequence: string, data: ProgramDataView | undefined = programData, prepare: boolean = true) {
      if (!data) throw new Error('Data not set')
      await this.withLock(() => {
        updateSequence(data, sequence)
      })
      if (prepare) {
        await worklet.prepareProgram(this.ptr$)
      }
    },
    async buildFromSequence(sequence: string) {
      let data = nextProgramData()
      buildProgram(data)
      await this.updateSequence(sequence, data, false)
      await this.setData(data)
      await worklet.prepareProgram(this.ptr$)
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
    async setData(value: ProgramDataView) {
      await this.withLock(() => {
        programData = value
        program.data = programData.ptr$
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
