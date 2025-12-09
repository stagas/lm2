import { type Ring, toRing } from 'utils/ring'
import { rpc } from 'utils/rpc'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  LITERALS_COUNT,
  OPS_COUNT,
  RING_BUFFER_SIZE,
  SEQ_HISTORY_SIZE,
} from '../as/assembly/constants.ts'
import WaveFFT from '../vendor/WaveFFT/WaveFFT.js'
import { type Dsp, DspStruct, OutsPoolStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import { Bytecode } from './bytecode.ts'
import { WaveformBuffer } from './lib/waveform-buffer.ts'
import { compileSequence } from './sequence-compiler.ts'
import { ControlOp } from './worklet-shared.ts'
import workletUrl from './worklet.js?worker&url'
import { type DspProcessor, type DspProcessorOptions } from './worklet.ts'

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
const SEQUENCE_STORAGE_KEY = 'engine2:sequence'
const DEFAULT_SEQUENCE = 'c4 e4 [g4 a4]*2'
let currentSequenceString = localStorage.getItem(SEQUENCE_STORAGE_KEY) ?? DEFAULT_SEQUENCE
let currentCompiledSequence: Awaited<ReturnType<typeof compileSequence>> | undefined

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
  clearAnalysers()
  createAnalysers(wasmRings[0], 100, 30)
  wasmDsp = DspStruct(wasmMemory.buffer, dsp$)
  program = await createProgram()
  wasmDsp.program = program.ptr$
  arrayVisualizationCanvas = createArrayVisualization(program.data.arrays[0], 400, 130)
  if (currentCompiledSequence) {
    sequenceVisualizationCanvas = createSequenceVisualization(
      program.data.arrays[1],
      currentSequenceString,
      currentCompiledSequence,
      audioContext,
      bpmValue,
      globalSampleCount,
      600,
      50,
    )
  }
}

async function creaateWorklet() {
  const audioContext = new AudioContext({ latencyHint: 0.5 })
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

const { ringPos, control, bpmValue, globalSampleCount, worklet, audioContext } = await creaateWorklet()

console.log('Audio Context initialized')
console.log('  Sample Rate:', audioContext.sampleRate, 'Hz')
console.log('  Output Latency:', audioContext.outputLatency, 'seconds')
console.log('  Base Latency:', audioContext.baseLatency, 'seconds')

type Program = Awaited<ReturnType<typeof createProgram>>

async function createProgram() {
  if (!wasmMemory) throw new Error('Wasm memory not initialized')
  const program$ = await worklet.createProgram()
  const program = ProgramStruct(wasmMemory.buffer, program$)
  const outsPool = OutsPoolStruct(wasmMemory.buffer, program.outsPool)
  const outs$ = new Uint32Array(wasmMemory.buffer, outsPool.outs, 1024)
  const outs = [...outs$].map(out$ => toRing(new Float32Array(wasmMemory!.buffer, out$, RING_BUFFER_SIZE), CHUNK_SIZE))
  const ops = new Int32Array(wasmMemory.buffer, program.ops, OPS_COUNT)
  const programData = ProgramDataStruct(wasmMemory.buffer, program.data)
  const lock = new Int32Array(wasmMemory.buffer, programData.lock, 1)
  const arrays = new Uint32Array(wasmMemory.buffer, programData.arrays, ARRAYS_COUNT)
  const arrays$ = await worklet.createArrays()
  const arrayData = new Array<VmArray>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    arrays[i] = arrays$[i]
    const length = new Float32Array(wasmMemory.buffer, arrays$[i], 1)
    const historyWritePos = new Float32Array(wasmMemory.buffer, arrays$[i] + 1 * Float32Array.BYTES_PER_ELEMENT, 1)
    const historySize = new Float32Array(wasmMemory.buffer, arrays$[i] + 2 * Float32Array.BYTES_PER_ELEMENT, 1)
    const history = new Float32Array(
      wasmMemory.buffer,
      arrays$[i] + 3 * Float32Array.BYTES_PER_ELEMENT,
      SEQ_HISTORY_SIZE * 3,
    )
    arrayData[i] = {
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
      raw: new Float32Array(wasmMemory.buffer, arrays$[i], ARRAY_SIZE + ARRAY_HEADER_SIZE),
      data: new Float32Array(
        wasmMemory.buffer,
        arrays$[i] + ARRAY_HEADER_SIZE * Float32Array.BYTES_PER_ELEMENT,
        ARRAY_SIZE,
      ),
    }
  }
  const literals = new Float32Array(wasmMemory.buffer, programData.literals, LITERALS_COUNT)
  const data = {
    lock,

    arrays: arrayData,
    literals,

    acquireLock() {
      while (Atomics.load(lock, 0) !== 0) {
        Atomics.wait(lock, 0, 0)
      }
      Atomics.store(lock, 0, 1)
    },
    releaseLock() {
      Atomics.store(lock, 0, 0)
      Atomics.notify(lock, 0)
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

  data.arrays[0].length = 16
  // Frequencies for A minor scale (A, B, C, D, E, F, G, A, repeated up an octave)
  data.arrays[0].data[0] = 220.00 // A3
  data.arrays[0].data[1] = 246.94 // B3
  data.arrays[0].data[2] = 261.63 // C4
  data.arrays[0].data[3] = 293.66 // D4
  data.arrays[0].data[4] = 329.63 // E4
  data.arrays[0].data[5] = 349.23 // F4
  data.arrays[0].data[6] = 392.00 // G4
  data.arrays[0].data[7] = 440.00 // A4
  data.arrays[0].data[8] = 440.00 // A4
  data.arrays[0].data[9] = 493.88 // B4
  data.arrays[0].data[10] = 523.25 // C5
  data.arrays[0].data[11] = 587.33 // D5
  data.arrays[0].data[12] = 659.25 // E5
  data.arrays[0].data[13] = 698.46 // F5
  data.arrays[0].data[14] = 783.99 // G5
  data.arrays[0].data[15] = 880.00 // A5

  currentCompiledSequence = compileSequence(currentSequenceString)
  data.arrays[1].raw.set(currentCompiledSequence.bytecode.buffer)
  console.log('✓ Sequence compiled successfully')
  console.log('  Sequence:', currentSequenceString)
  console.log('  8 events (4 notes × 2 repeats) in 1 bar (4 beats)')
  console.log('  Mode: Monophonic latch (each note replaces the previous)')

  const bytecode = new Bytecode()

  // Seq auto-cycles based on globalSampleCount and global BPM
  bytecode.Seq(1) // This should populate program.lastSeq*Outs arrays

  // Now let's try manually using one of those outputs with Sin
  // We can't easily access them from here, so let's use SeqForEach

  // Set initial values
  data.writeLiteral(3, 1 / 4)

  bytecode.SeqForEach(() => {
    bytecode.SeqVoiceValue() // Get note value (frequency) from current voice
    bytecode.SeqVoiceTrig() // Get trigger from current voice
    bytecode.Sin() // Generate audio
  })

  bytecode.SeqMap() // Mix all voices
  createAnalysers(outs[bytecode.Peek()], 100, 30)

  bytecode.Literal(2)
  data.writeLiteral(2, 0.3)
  bytecode.Mul()

  bytecode.Dup()
  bytecode.Out()

  // Debug: Log bytecode
  console.log('Bytecode ops:', Array.from(bytecode.ops.slice(0, bytecode.pc)))
  console.log('Bytecode PC:', bytecode.pc)
  console.log('Outs count:', bytecode.outsCount)
  console.log('\n⚠️  Press the START button to begin audio playback!')

  // Old example code below (commented out)
  // bytecode.LiteralSmoothed(0)
  // bytecode.Literal(1)
  // bytecode.Sin()
  // createAnalysers(outs[bytecode.Peek()], 100, 30)

  // bytecode.LiteralSmoothed(2)
  // bytecode.Mul()

  // bytecode.LiteralSmoothed(3)
  // bytecode.Add()

  // bytecode.Literal(4)
  // bytecode.Sin()
  // createAnalysers(outs[bytecode.Peek()], 100, 30)
  // bytecode.Dup()
  // bytecode.Out()

  // bytecode.LiteralSmoothed(5)
  // bytecode.ArrayAt(0)
  // bytecode.Literal(1)
  // bytecode.Sin()
  // createAnalysers(outs[bytecode.Peek()], 100, 30)

  // bytecode.Literal(6)
  // bytecode.Literal(7)

  // bytecode.LiteralSmoothed(8)
  // bytecode.Literal(1)
  // bytecode.Sin()
  // createAnalysers(outs[bytecode.Peek()], 100, 30)

  // bytecode.Ad()
  // createAnalysers(outs[bytecode.Peek()], 100, 30)
  // data.writeLiteral(6, 0.001)
  // data.writeLiteral(7, 0.15)
  // bytecode.Mul()

  // bytecode.Dup()
  // bytecode.Out()

  bytecode.End()
  ops.set(bytecode.ops)

  return {
    ptr$: program$,
    ops,
    data,
    outs,
  }
}

const startButton = Object.assign(
  document.createElement('button'),
  {
    textContent: 'Start',
    className: 'bg-blue-500 text-white p-2 rounded-md',
    onmousedown: () => {
      Atomics.store(control, 0, ControlOp.Start)
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
      Atomics.store(control, 0, ControlOp.Stop)
    },
  },
)
document.body.appendChild(stopButton)

function createFrequencySlider(index: number, min: number, max: number, step: number) {
  return Object.assign(
    document.createElement('input'),
    {
      type: 'range',
      min,
      max,
      step,
      value: program?.data.literals[index] ?? 0,
      oninput: (e: InputEvent & { target: HTMLInputElement }) => {
        if (!program) return
        program.data.writeLiteral(index, parseFloat(e.target.value))
      },
    },
  )
}

// BPM control
const bpmLabel = document.createElement('div')
bpmLabel.textContent = 'BPM: 60'
bpmLabel.className = 'text-white p-2'
document.body.appendChild(bpmLabel)

const bpmSlider = Object.assign(
  document.createElement('input'),
  {
    type: 'range',
    min: 1,
    max: 666,
    step: 1,
    value: 60,
    oninput: (e: InputEvent & { target: HTMLInputElement }) => {
      const bpm = parseFloat(e.target.value)
      bpmValue[0] = bpm
      bpmLabel.textContent = `BPM: ${bpm.toFixed(0)}`
    },
  },
)
document.body.appendChild(bpmSlider)

function updateSequence(newSequence: string) {
  try {
    currentSequenceString = newSequence
    currentCompiledSequence = compileSequence(currentSequenceString)
    localStorage.setItem(SEQUENCE_STORAGE_KEY, newSequence)

    if (program) {
      program.data.arrays[1].raw.set(currentCompiledSequence.bytecode.buffer)
    }

    if (program && sequenceVisualizationCanvas) {
      sequenceVisualizationCanvas.remove()
      sequenceVisualizationCanvas = createSequenceVisualization(
        program.data.arrays[1],
        currentSequenceString,
        currentCompiledSequence,
        audioContext,
        bpmValue,
        globalSampleCount,
        600,
        50,
      )
    }

    console.log('✓ Sequence updated:', currentSequenceString)
  }
  catch (error) {
    console.error('✗ Sequence compilation failed:', error)
  }
}

const sequenceLabel = document.createElement('div')
sequenceLabel.textContent = 'Sequence:'
sequenceLabel.className = 'text-white p-2'
document.body.appendChild(sequenceLabel)

const sequenceInput = Object.assign(
  document.createElement('input'),
  {
    type: 'text',
    value: currentSequenceString,
    className: 'bg-gray-800 text-white p-2 rounded-md border border-gray-600 w-full max-w-md',
    oninput: (e: InputEvent & { target: HTMLInputElement }) => {
      updateSequence(e.target.value)
    },
  },
)
document.body.appendChild(sequenceInput)

let analysers: { canvas: HTMLCanvasElement; fftCanvas: HTMLCanvasElement }[] = []
let arrayVisualizationCanvas: HTMLCanvasElement | undefined
let sequenceVisualizationCanvas: HTMLCanvasElement | undefined

function clearAnalysers() {
  analysers.forEach(analyser => {
    analyser.canvas.remove()
    analyser.fftCanvas.remove()
  })
  analysers = []
  if (arrayVisualizationCanvas) {
    arrayVisualizationCanvas.remove()
    arrayVisualizationCanvas = undefined
  }
  if (sequenceVisualizationCanvas) {
    sequenceVisualizationCanvas.remove()
    sequenceVisualizationCanvas = undefined
  }
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

  const draw = () => {
    requestAnimationFrame(draw)

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
  draw()

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
    requestAnimationFrame(drawFft)

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
  drawFft()

  analysers.push({ canvas, fftCanvas })
}

function createArrayVisualization(array: VmArray, width: number, height: number) {
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const c = canvas.getContext('2d')!
  c.scale(dpr, dpr)

  const draw = () => {
    requestAnimationFrame(draw)

    c.clearRect(0, 0, width, height)

    const length = array.length || array.data.length
    const currentIndex = -1 // No highlighting for generic arrays
    const data = array.data

    if (length === 0) return

    c.font = '12px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'

    const itemsPerRow = Math.floor(width / 100)
    const itemWidth = width / itemsPerRow
    const itemHeight = 30
    const maxRows = Math.floor(height / itemHeight)

    for (let i = 0; i < length; i++) {
      const value = data[i]!
      const row = Math.floor(i / itemsPerRow)
      const col = i % itemsPerRow

      if (row >= maxRows) break

      const x = col * itemWidth + itemWidth / 2
      const y = row * itemHeight + itemHeight / 2

      const rectX = col * itemWidth
      const rectY = row * itemHeight
      const rectWidth = itemWidth - 2
      const rectHeight = itemHeight - 2

      if (i === currentIndex) {
        c.fillStyle = 'rgba(0, 255, 0, 0.3)'
        c.fillRect(rectX + 1, rectY + 1, rectWidth, rectHeight)
        c.strokeStyle = 'lime'
        c.lineWidth = 2
        c.strokeRect(rectX + 1, rectY + 1, rectWidth, rectHeight)
      }
      else {
        c.strokeStyle = 'rgba(255, 255, 255, 0.2)'
        c.lineWidth = 1
        c.strokeRect(rectX + 1, rectY + 1, rectWidth, rectHeight)
      }

      c.fillStyle = 'white'
      c.fillText(value.toFixed(2), x, y)
    }
  }
  draw()

  document.body.appendChild(canvas)
  return canvas
}

function createSequenceVisualization(
  array: VmArray,
  sequenceString: string,
  compiledSequence: Awaited<ReturnType<typeof compileSequence>>,
  audioContext: AudioContext,
  bpmValue: Float32Array,
  globalSampleCount: Int32Array,
  width: number,
  height: number,
) {
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const c = canvas.getContext('2d')!
  c.scale(dpr, dpr)

  const FADEOUT_SECONDS = 0.3

  // Smooth ages across frames at 60fps
  let lastFrameTime = performance.now()
  let predictedSampleCount = Atomics.load(globalSampleCount, 0)
  let isFirstFrame = true

  const draw = () => {
    requestAnimationFrame(draw)

    c.clearRect(0, 0, width, height)

    const sampleRate = audioContext.sampleRate
    const now = performance.now()
    const deltaTime = (now - lastFrameTime) / 1000
    lastFrameTime = now

    // Account for audio output latency - what we hear is behind what's generated
    const latencySeconds = (audioContext.outputLatency || 0) - (audioContext.baseLatency || 0)
    const latencySamples = latencySeconds * sampleRate

    // Get actual sample count from WASM
    const rawSampleCount = Atomics.load(globalSampleCount, 0)
    const rawPlaybackPosition = rawSampleCount - latencySamples

    // On first frame or large jump (restart), sync immediately
    const drift = rawPlaybackPosition - predictedSampleCount
    if (isFirstFrame || Math.abs(drift) > sampleRate) {
      // Hard sync on start or restart
      predictedSampleCount = rawPlaybackPosition
      isFirstFrame = false
    }
    else {
      // Predict sample count based on deltaTime at constant sample rate
      const samplesAdvanced = deltaTime * sampleRate
      predictedSampleCount += samplesAdvanced

      // Gently sync to avoid drift without blinking
      if (Math.abs(drift) > 100) {
        const correctionSpeed = 0.05 // 5% correction per frame
        predictedSampleCount += drift * correctionSpeed
      }
    }

    // Ensure currentSampleCount is never negative (audio can't go backwards)
    const currentSampleCount = Math.max(0, predictedSampleCount)

    // Read history from the ring buffer
    const historySize = Math.floor(array.historySize) || SEQ_HISTORY_SIZE
    const history = array.history

    // Find the most recent started event for each bytecode position
    const eventData = new Map<number, { startSample: number; endSample: number }>()
    let hasAnyValidEvents = false

    for (let i = 0; i < historySize; i++) {
      const idx = i * 3
      const bytecodePos = Math.floor(history[idx])
      const startSample = Math.floor(history[idx + 1])
      const endSample = Math.floor(history[idx + 2])

      // Skip invalid entries (uninitialized history buffer entries have all zeros)
      if (startSample === 0 && endSample === 0) continue

      hasAnyValidEvents = true

      // Skip events that haven't started yet (in the future)
      // Add small tolerance (1ms) to account for timing differences
      const toleranceSamples = sampleRate * 0.001
      if (startSample > currentSampleCount + toleranceSamples) continue

      // Keep the most recent started event per position
      const existing = eventData.get(bytecodePos)
      if (!existing || startSample > existing.startSample) {
        eventData.set(bytecodePos, { startSample, endSample })
      }
    }

    // Calculate ages for the most recent events
    const eventAges = new Map<number, number>()
    for (const [bytecodePos, { startSample, endSample }] of eventData.entries()) {
      if (currentSampleCount <= endSample) {
        // Event is active (within hold time) - show at full brightness
        eventAges.set(bytecodePos, 0)
      }
      else {
        // Event has ended - fade out based on time since end
        const fadeAge = (currentSampleCount - endSample) / sampleRate
        if (fadeAge <= FADEOUT_SECONDS) {
          eventAges.set(bytecodePos, fadeAge)
        }
      }
    }

    const tokens = compiledSequence.tokens
    const y = height / 2

    // Set font BEFORE measuring text
    c.font = '18px monospace'
    c.textBaseline = 'middle'

    const isLeafToken = (t: typeof tokens[0]) => !t.text.startsWith('[') && !t.text.startsWith('<')

    // Draw highlights with fadeout
    for (const token of tokens) {
      if (!isLeafToken(token)) continue

      // Check all bytecode positions for this token (for repeated events like g4*2)
      const positions = token.bytecodePositions || [token.bytecodePos]
      let bestAge: number | undefined = undefined
      for (const pos of positions) {
        const age = eventAges.get(pos)
        if (age !== undefined && (bestAge === undefined || age < bestAge)) {
          bestAge = age
        }
      }

      if (bestAge === undefined || bestAge > FADEOUT_SECONDS) continue

      const alpha = 1 - bestAge / FADEOUT_SECONDS
      const x = 10 + c.measureText(sequenceString.slice(0, token.start)).width
      const tokenText = sequenceString.slice(token.start, token.start + token.length)
      const metrics = c.measureText(tokenText)

      c.fillStyle = `rgba(0, 255, 0, ${0.3 * alpha})`
      c.fillRect(x - 2, y - 14, metrics.width + 4, 28)
      c.strokeStyle = `rgba(0, 255, 0, ${alpha})`
      c.lineWidth = 2
      c.strokeRect(x - 2, y - 14, metrics.width + 4, 28)
    }

    // Draw the text
    let x = 10
    for (let charIdx = 0; charIdx < sequenceString.length; charIdx++) {
      const char = sequenceString[charIdx]
      const token = tokens.find(t => charIdx >= t.start && charIdx < t.start + t.length)
      const isEvent = token && isLeafToken(token)

      let textAlpha = isEvent ? 1 : 0.5
      let textColor = 'white'

      if (isEvent && token) {
        // Check all bytecode positions for this token (for repeated events like g4*2)
        const positions = token.bytecodePositions || [token.bytecodePos]
        let bestAge: number | undefined = undefined
        for (const pos of positions) {
          const age = eventAges.get(pos)
          if (age !== undefined && (bestAge === undefined || age < bestAge)) {
            bestAge = age
          }
        }
        if (bestAge !== undefined && bestAge < FADEOUT_SECONDS) {
          const brightness = 1 - bestAge / FADEOUT_SECONDS
          textColor = `rgb(${Math.floor(255 * (1 - brightness) + 0 * brightness)}, 255, ${
            Math.floor(255 * (1 - brightness) + 0 * brightness)
          })`
        }
      }

      c.fillStyle = isEvent ? textColor : 'rgba(255, 255, 255, 0.5)'
      c.fillText(char, x, y)
      x += c.measureText(char).width
    }
  }
  draw()

  document.body.appendChild(canvas)
  return canvas
}

updateWasmBinary()
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', updateWasmBinary)
}
