import { ARRAY_HEADER_SIZE, HISTORY_DATA_OFFSET } from '../../as/assembly/constants.ts'
import type { AnimationManager } from './animation-manager.ts'
import type { SourceLocation } from './mini-source-map.ts'

type VmArray = {
  length: number
  raw: Float32Array
  data: Float32Array
}

type VmHistory = {
  writePos: number
  size: number
  raw: Float32Array
}

export function createSequenceVisualization(
  array: VmArray,
  history: VmHistory,
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

  let currentSequenceString = sequenceString
  let currentSourceMap = sourceMap
  let lastVersion = -1
  let currentHistory = history

  const draw = () => {
    c.clearRect(0, 0, width, height)

    const sampleRate = audioContext.sampleRate
    const rawSampleCount = Atomics.load(globalSampleCount, 0)

    // Use the raw sample count directly - it's already synchronized with the audio thread
    // The history buffer events are written using the same globalSampleCount value
    const currentSampleCount = Math.max(0, rawSampleCount)

    const historyRaw = currentHistory.raw

    const eventData = new Map<number, { startSample: number; endSample: number }>()
    const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number
    const currentVersion = array.raw[3] as number

    // Clear eventData if bytecode changed to avoid showing stale highlighting
    if (lastVersion !== -1 && lastVersion !== currentVersion) {
      eventData.clear()
    }
    lastVersion = currentVersion

    for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += 5) {
      const opIndex = Math.floor(historyRaw[idx])
      const startSample = Math.floor(historyRaw[idx + 3])
      const endSample = Math.floor(historyRaw[idx + 4])

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
