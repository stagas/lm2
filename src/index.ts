import { type Ring, toRing } from 'utils/ring'
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
import WaveFFT from '../vendor/WaveFFT/WaveFFT.js'
import { AnalyserOutsPoolStruct, type Dsp, DspStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import { encodeLangToVmOps } from './bytecode.ts'
import { AnimationManager } from './lib/animation-manager.ts'
import { buildMiniSourceMap } from './lib/mini-source-map.ts'
import { createPianorollVisualization } from './lib/pianoroll-visualizer.ts'
import { createSequenceVisualization } from './lib/sequence-visualizer.ts'
import { WaveformBuffer } from './lib/waveform-buffer.ts'
import { compileMiniNotation } from './mini/compiler.ts'
import { frequencyToNoteName } from './mini/util.ts'
import { ControlOp } from './worklet-shared.ts'
import workletUrl from './worklet.js?worker&url'
import type { DspProcessor, DspProcessorOptions } from './worklet.ts'

type State = 'stopped' | 'running' | 'paused'
let state: State = 'stopped'

export type VmArray = {
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
let analysers: { canvas: HTMLCanvasElement; fftCanvas: HTMLCanvasElement; draw: () => void }[] = []

const MINI_ARRAY_INDEX = 0

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
  for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
    const opIndex = Math.floor(historyRaw[idx])
    const voiceIndex = Math.floor(historyRaw[idx + 1])
    const value = historyRaw[idx + 2]
    const startSample = Math.floor(historyRaw[idx + 4])
    const endSample = Math.floor(historyRaw[idx + 5])

    if (startSample === 0 && endSample === 0) continue
    if (voiceIndex < 0) continue

    const startTimeSeconds = startSample / sampleRate
    const endTimeSeconds = endSample / sampleRate

    // Only include future events
    if (startTimeSeconds < currentTimeSeconds || startTimeSeconds > windowEnd) continue

    // Only use events with valid opIndex
    if (opIndex < 0 || opIndex >= currentBytecodeLength) continue

    const noteValue = value
    if (noteValue == null || noteValue <= 0) continue

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
      500,
      200,
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
          return `${note} ${e.startTime.toFixed(2)} ${e.endTime.toFixed(2)}`
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

function clearAnalysers() {
  analysers.forEach(analyser => {
    animationManager.unregister(analyser.draw)
    analyser.canvas.remove()
    analyser.fftCanvas.remove()
  })
  analysers = []
}

async function createAnalysers(ring: Ring, width: number, height: number) {
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const c = canvas.getContext('2d')!
  c.scale(dpr, dpr)

  const waveformBuffer = new WaveformBuffer()
  let floats: Float32Array | null

  const drawWaveform = () => {
    c.clearRect(0, 0, width, height)

    const currentChunkPos = Atomics.load(ringPos, 0)
    floats = waveformBuffer.update(ring, currentChunkPos)

    if (!floats || floats.length === 0) return

    const scale = floats.length / width
    const h = height / 2

    c.beginPath()
    c.moveTo(0, floats[0]! / 2 * h + h)
    for (let i = 1; i < width; i++) {
      const idx = (i * scale) | 0
      c.lineTo(i, -floats[idx]! / 2 * h + h)
    }
    c.strokeStyle = 'white'
    c.lineWidth = 1.35
    c.lineCap = 'round'
    c.lineJoin = 'round'
    c.stroke()
  }

  const fftSize = 8192
  const fft = new WaveFFT(fftSize)
  await fft.init()
  const hannWindow = WaveFFT.blackman(fftSize)
  const windowedData = new Float32Array(fftSize)
  const minDecibels = -40
  const maxDecibels = 65
  const fftCanvas = document.createElement('canvas')
  const fftHeight = height
  fftCanvas.width = width * dpr
  fftCanvas.height = fftHeight * dpr
  fftCanvas.style.width = `${width}px`
  fftCanvas.style.height = `${fftHeight}px`
  document.body.appendChild(canvas)
  document.body.appendChild(fftCanvas)

  const fftC = fftCanvas.getContext('2d')!
  fftC.scale(dpr, dpr)

  const drawFft = () => {
    if (!floats || floats.length < fftSize) {
      fftC.clearRect(0, 0, width, fftHeight)
      return
    }

    for (let i = 0; i < fftSize; i++) {
      windowedData[i] = floats[i] * hannWindow[i]
    }

    const result = fft.fft(windowedData)
    const magnitudes = fft.getMagnitudeSpectrum(result)
    const frequencyBinCount = magnitudes.length

    fftC.clearRect(0, 0, width, fftHeight)

    const barCount = width
    const barWidth = width / barCount

    for (let i = 0; i < barCount; i++) {
      const t = i / (barCount - 1 || 1)
      const idx = Math.floor(
        (frequencyBinCount - 1) * Math.pow(frequencyBinCount - 1 || 1, t) / (frequencyBinCount - 1 || 1),
      )
      const magnitude = magnitudes[idx]
      const value = 20 * Math.log10(magnitude + 1e-10)
      const norm = (value - minDecibels) / (maxDecibels - minDecibels)
      const clamped = norm < 0 ? 0 : norm > 1 ? 1 : norm
      const barHeight = clamped * fftHeight
      const x = i * barWidth
      fftC.fillStyle = 'lime'
      fftC.fillRect(x, fftHeight - barHeight, barWidth, barHeight)
    }
  }

  const draw = () => {
    drawWaveform()
    drawFft()
  }

  animationManager.register(draw)
  analysers.push({ canvas, fftCanvas, draw })
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
  clearAnalysers()

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
  // Create analyser for main output (index 0)
  try {
    void createAnalysers(analyserOuts[0], 100, 30)
  }
  catch (e) {
    console.warn('Failed to create analyser:', e)
  }
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
  import.meta.hot.on('vite:beforeUpdate', () => {
    location.reload()
  })
}
