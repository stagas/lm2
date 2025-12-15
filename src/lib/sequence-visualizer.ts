import { ARRAY_HEADER_SIZE, HISTORY_DATA_OFFSET } from '../../as/assembly/constants.ts'
import type { VmArray, VmHistory } from '../index.ts'
import type { AnimationManager } from './animation-manager.ts'
import type { SourceLocation } from './mini-source-map.ts'

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

    const eventData = new Map<number, { startSample: number; endSample: number; velocity: number }>()
    const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number
    const currentVersion = array.raw[3] as number

    // Clear eventData if bytecode changed to avoid showing stale highlighting
    if (lastVersion !== -1 && lastVersion !== currentVersion) {
      eventData.clear()
    }
    lastVersion = currentVersion

    for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += 5) {
      const opIndex = Math.floor(historyRaw[idx])
      const velocity = historyRaw[idx + 2]
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
          eventData.set(opIndex, { startSample, endSample, velocity })
        }
      }
    }

    const eventAges = new Map<number, { age: number; velocity: number }>()
    for (const [opIndex, { startSample, endSample, velocity }] of eventData.entries()) {
      if (currentSampleCount <= endSample) {
        eventAges.set(opIndex, { age: 0, velocity })
      }
      else {
        const fadeAge = (currentSampleCount - endSample) / sampleRate
        if (fadeAge <= FADEOUT_SECONDS) {
          eventAges.set(opIndex, { age: fadeAge, velocity })
        }
      }
    }

    const y = height / 2

    c.font = '18px monospace'
    c.textBaseline = 'middle'

    const activeLocations = new Map<number, { age: number; velocity: number }>()
    for (const [opIndex, info] of eventAges.entries()) {
      const location = currentSourceMap.get(opIndex)
      if (location) {
        const existing = activeLocations.get(location.start)
        if (!existing || info.age < existing.age) {
          activeLocations.set(location.start, info)
        }
      }
    }

    for (const [start, info] of activeLocations.entries()) {
      const { age, velocity } = info
      if (age > FADEOUT_SECONDS) continue

      const location = Array.from(currentSourceMap.values()).find(loc => loc.start === start)
      if (!location) continue

      const velocityClamped = Math.max(0, Math.min(1, velocity || 0))
      const alpha = (1 - age / FADEOUT_SECONDS) * velocityClamped
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
        const info = activeLocations.get(location.start)
        if (info && info.age < FADEOUT_SECONDS) {
          const velocityClamped = Math.max(0, Math.min(1, info.velocity || 0))
          const brightnessBase = 1 - info.age / FADEOUT_SECONDS
          const brightness = brightnessBase * velocityClamped
          textColor = `rgb(${Math.floor(255 * (1 - brightness))}, 255, ${Math.floor(255 * (1 - brightness))})`
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
