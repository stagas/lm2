import { ARRAY_HEADER_SIZE, SEQ_HISTORY_SIZE } from '../../as/assembly/constants.ts'
import type { AnimationManager } from './animation-manager.ts'
import type { SourceLocation } from './mini-source-map.ts'

type VmArray = {
  length: number
  historyWritePos: number
  historySize: number
  history: Float32Array
  raw: Float32Array
  data: Float32Array
}

export function createSequenceVisualization(
  array: VmArray,
  sequenceString: string,
  sourceMap: Map<number, SourceLocation>,
  audioContext: AudioContext,
  bpmValue: Float32Array,
  globalSampleCount: Int32Array,
  animationManager: AnimationManager,
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; update: (sequence: string, sourceMap: Map<number, SourceLocation>) => void;
  destroy: () => void }
{
  const canvas = document.createElement('canvas')
  const dpr = window.devicePixelRatio
  canvas.width = width * dpr
  canvas.height = height * dpr
  canvas.style.width = `${width}px`
  canvas.style.height = `${height}px`

  const c = canvas.getContext('2d')!
  c.scale(dpr, dpr)

  const FADEOUT_SECONDS = 0.3

  let lastFrameTime = performance.now()
  let predictedSampleCount = Atomics.load(globalSampleCount, 0)
  let isFirstFrame = true
  let currentSequenceString = sequenceString
  let currentSourceMap = sourceMap

  const draw = () => {
    c.clearRect(0, 0, width, height)

    const sampleRate = audioContext.sampleRate
    const now = performance.now()
    const deltaTime = (now - lastFrameTime) / 1000
    lastFrameTime = now

    const latencySeconds = (audioContext.outputLatency || 0) - (audioContext.baseLatency || 0)
    const latencySamples = latencySeconds * sampleRate

    const rawSampleCount = Atomics.load(globalSampleCount, 0)
    const rawPlaybackPosition = rawSampleCount - latencySamples

    const drift = rawPlaybackPosition - predictedSampleCount
    if (isFirstFrame || Math.abs(drift) > sampleRate) {
      predictedSampleCount = rawPlaybackPosition
      isFirstFrame = false
    }
    else {
      const samplesAdvanced = deltaTime * sampleRate
      predictedSampleCount += samplesAdvanced

      if (Math.abs(drift) > 100) {
        const correctionSpeed = 0.05
        predictedSampleCount += drift * correctionSpeed
      }
    }

    const currentSampleCount = Math.max(0, predictedSampleCount)

    const historySize = Math.floor(array.historySize) || SEQ_HISTORY_SIZE
    const history = array.history
    const historyWritePos = Math.floor(array.raw[1])

    const eventData = new Map<number, { startSample: number; endSample: number }>()
    const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number

    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const idx = readPos * 3
      const opIndex = Math.floor(history[idx])
      const startSample = Math.floor(history[idx + 1])
      const endSample = Math.floor(history[idx + 2])

      if (startSample === 0 && endSample === 0) continue

      const toleranceSamples = sampleRate * 0.001
      if (startSample > currentSampleCount + toleranceSamples) continue

      // Only use events with valid opIndex (within current bytecode length)
      // Past events with invalid opIndex (from old bytecode) are ignored
      if (opIndex >= 0 && opIndex < currentBytecodeLength) {
        const existing = eventData.get(opIndex)
        if (!existing || startSample > existing.startSample) {
          eventData.set(opIndex, { startSample, endSample })
        }
      }
    }

    const eventAges = new Map<number, number>()
    for (const [opIndex, { startSample, endSample }] of eventData.entries()) {
      if (currentSampleCount <= endSample) {
        eventAges.set(opIndex, 0)
      }
      else {
        const fadeAge = (currentSampleCount - endSample) / sampleRate
        if (fadeAge <= FADEOUT_SECONDS) {
          eventAges.set(opIndex, fadeAge)
        }
      }
    }

    const y = height / 2

    c.font = '18px monospace'
    c.textBaseline = 'middle'

    const activeLocations = new Map<number, number>()
    for (const [opIndex, age] of eventAges.entries()) {
      const location = currentSourceMap.get(opIndex)
      if (location) {
        const existing = activeLocations.get(location.start)
        if (existing === undefined || age < existing) {
          activeLocations.set(location.start, age)
        }
      }
    }

    for (const [start, age] of activeLocations.entries()) {
      if (age > FADEOUT_SECONDS) continue

      const location = Array.from(currentSourceMap.values()).find(loc => loc.start === start)
      if (!location) continue

      const alpha = 1 - age / FADEOUT_SECONDS
      const x = 10 + c.measureText(currentSequenceString.slice(0, location.start)).width
      const metrics = c.measureText(location.text)

      c.fillStyle = `rgba(0, 255, 0, ${0.3 * alpha})`
      c.fillRect(x - 2, y - 14, metrics.width + 4, 28)
      c.strokeStyle = `rgba(0, 255, 0, ${alpha})`
      c.lineWidth = 2
      c.strokeRect(x - 2, y - 14, metrics.width + 4, 28)
    }

    let x = 10
    for (let charIdx = 0; charIdx < currentSequenceString.length; charIdx++) {
      const char = currentSequenceString[charIdx]
      const location = Array.from(currentSourceMap.values()).find(loc => charIdx >= loc.start && charIdx < loc.end)

      let textColor = 'white'
      if (location) {
        const age = activeLocations.get(location.start)
        if (age !== undefined && age < FADEOUT_SECONDS) {
          const brightness = 1 - age / FADEOUT_SECONDS
          textColor = `rgb(${Math.floor(255 * (1 - brightness) + 0 * brightness)}, 255, ${
            Math.floor(255 * (1 - brightness) + 0 * brightness)
          })`
        }
      }

      c.fillStyle = location ? textColor : 'rgba(255, 255, 255, 0.5)'
      c.fillText(char, x, y)
      x += c.measureText(char).width
    }
  }

  animationManager.register(draw)

  document.body.appendChild(canvas)
  return {
    canvas,
    update: (sequence: string, sourceMap: Map<number, SourceLocation>) => {
      currentSequenceString = sequence
      currentSourceMap = sourceMap
    },
    destroy: () => {
      animationManager.unregister(draw)
      canvas.remove()
    },
  }
}
