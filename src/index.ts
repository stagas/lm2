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
} from '../as/assembly/constants.ts'
import WaveFFT from '../vendor/WaveFFT/WaveFFT.js'
import { type Dsp, DspStruct, OutsPoolStruct, ProgramDataStruct, ProgramStruct } from './assembly.ts'
import { Bytecode } from './bytecode.ts'
import { WaveformBuffer } from './lib/waveform-buffer.ts'
import { ControlOp } from './worklet-shared.ts'
import workletUrl from './worklet.js?worker&url'
import { type DspProcessor, type DspProcessorOptions } from './worklet.ts'

type VmArray = {
  length: number
  index: number
  data: Float32Array
}

let wasmMemory: WebAssembly.Memory | undefined
let wasmRings: Ring[] | undefined
let wasmDsp: Dsp | undefined
let program: Program | undefined

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
}

async function creaateWorklet() {
  const audioContext = new AudioContext({ latencyHint: 1.0 })
  await audioContext.audioWorklet.addModule(workletUrl)
  const sourcemapUrl = new URL('/as/build/index.wasm.map', location.origin).toString()
  const ringPos = new Uint8Array(new SharedArrayBuffer(4))
  const control = new Uint32Array(new SharedArrayBuffer(4))
  const dsp = new AudioWorkletNode(audioContext, 'dsp', {
    outputChannelCount: [2],
    processorOptions: {
      sourcemapUrl,
      ringPos,
      control,
    },
  } satisfies DspProcessorOptions)
  dsp.connect(audioContext.destination)
  const worklet = rpc<DspProcessor>(dsp.port)
  return { ringPos, control, worklet }
}

const { ringPos, control, worklet } = await creaateWorklet()

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
  const arrayData = new Array<{ length: number; index: number; data: Float32Array }>(ARRAYS_COUNT)
  for (let i = 0; i < ARRAYS_COUNT; i++) {
    arrays[i] = arrays$[i]
    const length = new Float32Array(wasmMemory.buffer, arrays$[i], 1)
    const index = new Float32Array(wasmMemory.buffer, arrays$[i] + 1 * Float32Array.BYTES_PER_ELEMENT, 1)
    arrayData[i] = {
      get length() {
        return length[0]
      },
      set length(value: number) {
        length[0] = value
      },
      get index() {
        return index[0]
      },
      set index(value: number) {
        index[0] = value
      },
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

  const bytecode = new Bytecode()

  bytecode.LiteralSmoothed(0)
  bytecode.Literal(1)
  bytecode.Sin()
  createAnalysers(outs[bytecode.Peek()], 100, 30)

  bytecode.LiteralSmoothed(2)
  bytecode.Mul()

  bytecode.LiteralSmoothed(3)
  bytecode.Add()

  bytecode.Literal(4)
  bytecode.Sin()
  createAnalysers(outs[bytecode.Peek()], 100, 30)
  bytecode.Dup()
  bytecode.Out()

  bytecode.LiteralSmoothed(5)
  bytecode.ArrayAt(0)
  bytecode.Literal(1)
  bytecode.Sin()
  createAnalysers(outs[bytecode.Peek()], 100, 30)

  bytecode.Literal(6)
  bytecode.Literal(7)

  bytecode.LiteralSmoothed(8)
  bytecode.Literal(1)
  bytecode.Sin()
  createAnalysers(outs[bytecode.Peek()], 100, 30)

  bytecode.Ad()
  createAnalysers(outs[bytecode.Peek()], 100, 30)
  data.writeLiteral(6, 0.001)
  data.writeLiteral(7, 0.15)
  bytecode.Mul()

  bytecode.Dup()
  bytecode.Out()
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

document.body.appendChild(createFrequencySlider(0, 0, 1000, 0.1))
document.body.appendChild(createFrequencySlider(2, 0, 1000, 0.1))
document.body.appendChild(createFrequencySlider(3, 0, 1000, 0.1))
document.body.appendChild(createFrequencySlider(5, 0, 15, 1))
document.body.appendChild(createFrequencySlider(8, 0, 8, 1))

let analysers: { canvas: HTMLCanvasElement; fftCanvas: HTMLCanvasElement }[] = []
let arrayVisualizationCanvas: HTMLCanvasElement | undefined

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
    c.moveTo(0, floats[0]! * h + h)
    for (let i = 1; i < width; i++) {
      const idx = (i * scale) | 0
      c.lineTo(i, -floats[idx]! * h + h)
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
    const currentIndex = array.index
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

updateWasmBinary()
if (import.meta.hot) {
  import.meta.hot.on('vite:beforeUpdate', updateWasmBinary)
}
