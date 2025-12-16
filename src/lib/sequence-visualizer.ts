import {
  ARRAY_HEADER_SIZE,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  MINI_HEADER_SIZE,
  OP_EVENT,
  OP_EVENT_BASE_SIZE,
  OP_GROUP_END,
  OP_GROUP_END_SIZE,
  OP_GROUP_START,
  OP_GROUP_START_SIZE,
  OP_OCTAVE,
  OP_OCTAVE_SIZE,
  OP_REST,
  OP_REST_SIZE,
  OP_SCALE,
  OP_SCALE_SIZE,
  OP_TRANSPOSE,
  OP_TRANSPOSE_SIZE,
} from '../../as/assembly/constants.ts'
import type { VmArray, VmHistory } from '../index.ts'
import { splitValueAndModifiers } from '../mini/tokenizer.ts'
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
  const minWidth = width
  let currentWidth = width
  let currentHeight = height
  canvas.width = currentWidth * dpr
  canvas.height = currentHeight * dpr
  canvas.style.width = `${currentWidth}px`
  canvas.style.height = `${currentHeight}px`

  const c = canvas.getContext('2d')!
  c.setTransform(dpr, 0, 0, dpr, 0, 0)

  const FADEOUT_SECONDS = 0.3

  let currentSequenceString = sequenceString
  let currentSourceMap = sourceMap
  let lastVersion = -1
  let currentHistory = history
  let cachedOpsVersion = -1
  let cachedOpsLength = -1
  let cachedOps: Array<{ opIndex: number; op: number; size: number }> = []
  let cachedOpPos = new Map<number, number>()
  let activeOctaveOpIndex: number | null = null
  let activeTransposeOpIndex: number | null = null
  let activeScaleOpIndex: number | null = null
  let fadingOctaveOpIndex: number | null = null
  let fadingOctaveFromSample: number | null = null
  let fadingTransposeOpIndex: number | null = null
  let fadingTransposeFromSample: number | null = null
  let fadingScaleOpIndex: number | null = null
  let fadingScaleFromSample: number | null = null
  let lastSampleCount: number | null = null
  let lastSampleChangeAtMs = 0
  const STOP_TIMEOUT_MS = 120

  function clearActiveControls(): void {
    activeOctaveOpIndex = null
    activeTransposeOpIndex = null
    activeScaleOpIndex = null
    fadingOctaveOpIndex = null
    fadingOctaveFromSample = null
    fadingTransposeOpIndex = null
    fadingTransposeFromSample = null
    fadingScaleOpIndex = null
    fadingScaleFromSample = null
  }

  function getOpSize(op: number): number {
    if (op === OP_EVENT) return OP_EVENT_BASE_SIZE
    if (op === OP_GROUP_START) return OP_GROUP_START_SIZE
    if (op === OP_GROUP_END) return OP_GROUP_END_SIZE
    if (op === OP_REST) return OP_REST_SIZE
    if (op === OP_OCTAVE) return OP_OCTAVE_SIZE
    if (op === OP_TRANSPOSE) return OP_TRANSPOSE_SIZE
    if (op === OP_SCALE) return OP_SCALE_SIZE
    return 0
  }

  function getControlKind(text: string): 'octave' | 'transpose' | 'scale' | null {
    if (/\boctave\b/.test(text)) return 'octave'
    if (/\btranspose\b/.test(text)) return 'transpose'
    if (/\bscale\b/.test(text)) return 'scale'
    return null
  }

  function getControlDeltaSpan(location: SourceLocation): { start: number; end: number } | null {
    const text = location.text
    const match = text.match(/\b(octave|transpose|scale)\b/)
    const index = match?.index
    if (index == null || match == null) return null

    let i = index + match[0].length
    while (i < text.length && /\s/.test(text[i]!)) i++
    if (i >= text.length) return null

    const start = i
    let j = i
    const kind = match[1]
    if (kind === 'octave' || kind === 'transpose') {
      if (text[j] === '+' || text[j] === '-') {
        j++
        while (j < text.length && /\s/.test(text[j]!)) j++
      }
      const digitsStart = j
      while (j < text.length && /[0-9]/.test(text[j]!)) j++
      if (j === digitsStart) return null
    }
    else if (kind === 'scale') {
      const noteMatch = text.slice(j).match(/^[a-gA-G](?:#|b)?[0-9]+/)
      if (noteMatch) {
        j += noteMatch[0].length
        while (j < text.length && /\s/.test(text[j]!)) j++
      }
      const nameMatch = text.slice(j).match(/^[a-zA-Z]+/)
      if (nameMatch) {
        j += nameMatch[0].length
      }
      if (j === start) return null
    }
    else {
      return null
    }

    return { start: location.start + start, end: location.start + j }
  }

  function getControlColor(kind: 'octave' | 'transpose' | 'scale'): [number, number, number] {
    if (kind === 'octave') return [0, 200, 255]
    if (kind === 'transpose') return [255, 200, 0]
    return [200, 120, 255]
  }

  function ensureCanvasWidth(): void {
    const pad = 24
    const measured = Math.ceil(pad + c.measureText(currentSequenceString).width)
    const next = Math.max(minWidth, measured)
    if (next === currentWidth) return

    currentWidth = next
    canvas.width = currentWidth * dpr
    canvas.style.width = `${currentWidth}px`
    c.setTransform(dpr, 0, 0, dpr, 0, 0)
  }

  const draw = () => {
    c.font = '18px monospace'
    c.textBaseline = 'middle'
    ensureCanvasWidth()
    c.clearRect(0, 0, currentWidth, currentHeight)

    const sampleRate = audioContext.sampleRate
    const rawSampleCount = Atomics.load(globalSampleCount, 0)

    // Use the raw sample count directly - it's already synchronized with the audio thread
    // The history buffer events are written using the same globalSampleCount value
    const currentSampleCount = Math.max(0, rawSampleCount)
    const nowMs = performance.now()

    let didSeek = false
    if (lastSampleCount == null) {
      lastSampleCount = currentSampleCount
      lastSampleChangeAtMs = nowMs
    }
    else {
      if (currentSampleCount !== lastSampleCount) {
        lastSampleChangeAtMs = nowMs
      }
      if (currentSampleCount < lastSampleCount) {
        didSeek = true
      }
      lastSampleCount = currentSampleCount
    }

    // Treat backwards jumps (stop/reset/seek) as a reposition: clear previous active/fading
    // so we only highlight what is active at the new "present" sample position.
    if (didSeek) {
      clearActiveControls()
    }

    const historyRaw = currentHistory.raw

    const eventData = new Map<number, { startSample: number; endSample: number; velocity: number }>()
    let nextOctaveOpIndex: number | null = null
    let nextOctaveStartSample = -1
    let nextTransposeOpIndex: number | null = null
    let nextTransposeStartSample = -1
    let nextScaleOpIndex: number | null = null
    let nextScaleStartSample = -1
    const currentBytecodeLength = array.raw[ARRAY_HEADER_SIZE] as number
    const currentVersion = array.raw[3] as number

    // Clear eventData if bytecode changed to avoid showing stale highlighting
    if (lastVersion !== -1 && lastVersion !== currentVersion) {
      eventData.clear()
    }
    lastVersion = currentVersion

    for (let idx = HISTORY_DATA_OFFSET; idx < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
      const opIndex = Math.floor(historyRaw[idx])
      const velocity = historyRaw[idx + 3]
      const startSample = Math.floor(historyRaw[idx + 4])
      const endSample = Math.floor(historyRaw[idx + 5])

      if (startSample === 0 && endSample === 0) continue

      const toleranceSamples = sampleRate * 0.001
      if (startSample > currentSampleCount + toleranceSamples) continue

      // Only use events with valid opIndex (within current bytecode length)
      // Past events with invalid opIndex (from old bytecode) are ignored
      if (opIndex >= 0 && opIndex < currentBytecodeLength) {
        const pc = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + opIndex
        const op = array.raw[pc] as number

        if (op === OP_EVENT) {
          const existing = eventData.get(opIndex)
          if (!existing || startSample > existing.startSample) {
            eventData.set(opIndex, { startSample, endSample, velocity })
          }
        }
        else if (op === OP_OCTAVE) {
          if (startSample <= currentSampleCount && startSample > nextOctaveStartSample) {
            nextOctaveOpIndex = opIndex
            nextOctaveStartSample = startSample
          }
        }
        else if (op === OP_TRANSPOSE) {
          if (startSample <= currentSampleCount && startSample > nextTransposeStartSample) {
            nextTransposeOpIndex = opIndex
            nextTransposeStartSample = startSample
          }
        }
        else if (op === OP_SCALE) {
          if (startSample <= currentSampleCount && startSample > nextScaleStartSample) {
            nextScaleOpIndex = opIndex
            nextScaleStartSample = startSample
          }
        }
      }
    }

    const prevOctaveOpIndex = activeOctaveOpIndex
    const prevTransposeOpIndex = activeTransposeOpIndex
    const prevScaleOpIndex = activeScaleOpIndex
    activeOctaveOpIndex = nextOctaveOpIndex
    activeTransposeOpIndex = nextTransposeOpIndex
    activeScaleOpIndex = nextScaleOpIndex

    if (prevOctaveOpIndex !== activeOctaveOpIndex && prevOctaveOpIndex != null) {
      fadingOctaveOpIndex = prevOctaveOpIndex
      fadingOctaveFromSample = nextOctaveStartSample >= 0 ? nextOctaveStartSample : currentSampleCount
    }
    if (prevTransposeOpIndex !== activeTransposeOpIndex && prevTransposeOpIndex != null) {
      fadingTransposeOpIndex = prevTransposeOpIndex
      fadingTransposeFromSample = nextTransposeStartSample >= 0 ? nextTransposeStartSample : currentSampleCount
    }
    if (prevScaleOpIndex !== activeScaleOpIndex && prevScaleOpIndex != null) {
      fadingScaleOpIndex = prevScaleOpIndex
      fadingScaleFromSample = nextScaleStartSample >= 0 ? nextScaleStartSample : currentSampleCount
    }

    if (cachedOpsVersion !== currentVersion || cachedOpsLength !== currentBytecodeLength) {
      cachedOpsVersion = currentVersion
      cachedOpsLength = currentBytecodeLength
      cachedOps = []
      cachedOpPos = new Map<number, number>()

      let opIndex = 0
      while (opIndex < currentBytecodeLength) {
        const pc = ARRAY_HEADER_SIZE + MINI_HEADER_SIZE + opIndex
        const op = array.raw[pc] as number
        const size = getOpSize(op)
        if (size <= 0) break
        cachedOpPos.set(opIndex, cachedOps.length)
        cachedOps.push({ opIndex, op, size })
        opIndex += size
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

    const y = currentHeight / 2

    const locationByStart = new Map<number, SourceLocation>()
    const locations = Array.from(currentSourceMap.values())
    for (const loc of locations) {
      const existing = locationByStart.get(loc.start)
      const locSpan = loc.end - loc.start
      const existingSpan = existing ? existing.end - existing.start : -1
      // Prefer the longest span for a given start so the default empty scale doesn't block actual notes.
      if (!existing || locSpan > existingSpan) {
        locationByStart.set(loc.start, loc)
      }
    }

    const activeLocations = new Map<number, { age: number; velocity: number }>()
    for (const [opIndex, info] of eventAges.entries()) {
      if (opIndex < 0) continue
      const location = currentSourceMap.get(opIndex)
      if (location) {
        const existing = activeLocations.get(location.start)
        if (!existing || info.age < existing.age) {
          activeLocations.set(location.start, info)
        }
      }
    }

    const activeControls = new Map<number, { kind: 'octave' | 'transpose' | 'scale' }>()
    if (activeOctaveOpIndex != null) {
      const loc = currentSourceMap.get(activeOctaveOpIndex)
      if (loc) activeControls.set(loc.start, { kind: 'octave' })
    }
    if (activeTransposeOpIndex != null) {
      const loc = currentSourceMap.get(activeTransposeOpIndex)
      if (loc) activeControls.set(loc.start, { kind: 'transpose' })
    }
    if (activeScaleOpIndex != null) {
      const loc = currentSourceMap.get(activeScaleOpIndex)
      if (loc) activeControls.set(loc.start, { kind: 'scale' })
    }

    const controlDeltaSpans = new Map<number, { start: number; end: number }>()
    for (const loc of locations) {
      const kind = getControlKind(loc.text)
      if (!kind) continue
      const delta = getControlDeltaSpan(loc)
      if (delta) controlDeltaSpans.set(loc.start, { start: delta.start, end: delta.end })
    }

    let fadingOctaveAlpha = 0
    if (fadingOctaveOpIndex != null && fadingOctaveFromSample != null) {
      const age = (currentSampleCount - fadingOctaveFromSample) / sampleRate
      if (age >= 0 && age <= FADEOUT_SECONDS) {
        fadingOctaveAlpha = 1 - age / FADEOUT_SECONDS
      }
      else {
        fadingOctaveOpIndex = null
        fadingOctaveFromSample = null
      }
    }
    let fadingTransposeAlpha = 0
    if (fadingTransposeOpIndex != null && fadingTransposeFromSample != null) {
      const age = (currentSampleCount - fadingTransposeFromSample) / sampleRate
      if (age >= 0 && age <= FADEOUT_SECONDS) {
        fadingTransposeAlpha = 1 - age / FADEOUT_SECONDS
      }
      else {
        fadingTransposeOpIndex = null
        fadingTransposeFromSample = null
      }
    }
    let fadingScaleAlpha = 0
    if (fadingScaleOpIndex != null && fadingScaleFromSample != null) {
      const age = (currentSampleCount - fadingScaleFromSample) / sampleRate
      if (age >= 0 && age <= FADEOUT_SECONDS) {
        fadingScaleAlpha = 1 - age / FADEOUT_SECONDS
      }
      else {
        fadingScaleOpIndex = null
        fadingScaleFromSample = null
      }
    }

    const controlRenderSpans = new Map<number,
      { kind: 'octave' | 'transpose' | 'scale'; start: number; end: number; alpha: number }>()
    for (const [start, { kind }] of activeControls.entries()) {
      const loc = locationByStart.get(start)
      if (!loc) continue
      const delta = controlDeltaSpans.get(start)
      if (delta) controlRenderSpans.set(start, { kind, start: delta.start, end: delta.end, alpha: 1 })
    }

    for (const [start, info] of activeLocations.entries()) {
      const { age, velocity } = info
      if (age > FADEOUT_SECONDS) continue

      const location = locationByStart.get(start)
      if (!location) continue

      const { value, mods } = splitValueAndModifiers(location.text)
      const tokenText = value || mods
      if (!tokenText) continue

      const velocityClamped = Math.max(0, Math.min(1, velocity || 0))
      const alpha = (1 - age / FADEOUT_SECONDS) * velocityClamped
      const x = 10 + c.measureText(currentSequenceString.slice(0, location.start)).width
      const metrics = c.measureText(tokenText)

      c.fillStyle = `rgba(0, 255, 0, ${0.3 * alpha})`
      c.fillRect(x - 2, y - 14, metrics.width + 4, 28)
      c.strokeStyle = `rgba(0, 255, 0, ${alpha})`
      c.lineWidth = 2
      c.strokeRect(x - 2, y - 14, metrics.width + 4, 28)
    }

    if (fadingOctaveOpIndex != null && fadingOctaveAlpha > 0) {
      const loc = currentSourceMap.get(fadingOctaveOpIndex)
      if (loc && !controlRenderSpans.has(loc.start)) {
        const delta = controlDeltaSpans.get(loc.start)
        if (delta) {
          controlRenderSpans.set(loc.start, { kind: 'octave', start: delta.start, end: delta.end,
            alpha: fadingOctaveAlpha })
        }
      }
    }
    if (fadingTransposeOpIndex != null && fadingTransposeAlpha > 0) {
      const loc = currentSourceMap.get(fadingTransposeOpIndex)
      if (loc && !controlRenderSpans.has(loc.start)) {
        const delta = controlDeltaSpans.get(loc.start)
        if (delta) {
          controlRenderSpans.set(loc.start, { kind: 'transpose', start: delta.start, end: delta.end,
            alpha: fadingTransposeAlpha })
        }
      }
    }
    if (fadingScaleOpIndex != null && fadingScaleAlpha > 0) {
      const loc = currentSourceMap.get(fadingScaleOpIndex)
      if (loc && !controlRenderSpans.has(loc.start)) {
        const delta = controlDeltaSpans.get(loc.start)
        if (delta) {
          controlRenderSpans.set(loc.start, { kind: 'scale', start: delta.start, end: delta.end,
            alpha: fadingScaleAlpha })
        }
      }
    }

    for (const span of controlRenderSpans.values()) {
      const before = currentSequenceString.slice(0, span.start)
      const deltaText = currentSequenceString.slice(span.start, span.end)
      if (!deltaText) continue

      const x0 = 10 + c.measureText(before).width
      const w = c.measureText(deltaText).width
      const [r, g, b] = getControlColor(span.kind)
      c.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.28 * span.alpha})`
      c.fillRect(x0 - 2, y - 14, w + 4, 28)
      c.strokeStyle = `rgba(${r}, ${g}, ${b}, ${0.9 * span.alpha})`
      c.lineWidth = 2
      c.strokeRect(x0 - 2, y - 14, w + 4, 28)
    }

    let x = 10
    for (let charIdx = 0; charIdx < currentSequenceString.length; charIdx++) {
      const char = currentSequenceString[charIdx]
      const location = locations.find(loc => charIdx >= loc.start && charIdx < loc.end)

      let textColor = 'white'
      let isModifier = false

      if (location) {
        const controlKind = getControlKind(location.text)
        const renderSpan = controlRenderSpans.get(location.start)
        const deltaSpan = controlDeltaSpans.get(location.start)
        const { value } = splitValueAndModifiers(location.text)
        const hasNote = !!value
        const modsStart = location.start + value.length

        if (hasNote && charIdx >= modsStart) {
          isModifier = true
        }

        const info = activeLocations.get(location.start)
        const treatAsHighlighted = !hasNote || (hasNote && !isModifier)

        if (info && info.age < FADEOUT_SECONDS && treatAsHighlighted) {
          const velocityClamped = Math.max(0, Math.min(1, info.velocity || 0))
          const brightnessBase = 1 - info.age / FADEOUT_SECONDS
          const brightness = brightnessBase * velocityClamped
          textColor = `rgb(${Math.floor(255 * (1 - brightness))}, 255, ${
            Math.floor(
              255 * (1 - brightness),
            )
          })`
        }

        if (controlKind) {
          if (deltaSpan && charIdx >= deltaSpan.start && charIdx < deltaSpan.end) {
            if (renderSpan) {
              const [highlightR, highlightG, highlightB] = getControlColor(renderSpan.kind)
              const [brightR, brightG, brightB] = [255, 255, 255]
              const alpha = renderSpan.alpha
              const r = Math.floor(highlightR * alpha + brightR * (1 - alpha))
              const g = Math.floor(highlightG * alpha + brightG * (1 - alpha))
              const b = Math.floor(highlightB * alpha + brightB * (1 - alpha))
              c.fillStyle = `rgba(${r}, ${g}, ${b}, 0.95)`
            }
            else {
              c.fillStyle = 'rgba(255, 255, 255, 0.95)'
            }
          }
          else {
            c.fillStyle = 'rgba(255, 255, 255, 0.35)'
          }
        }
        else if (hasNote && isModifier) {
          c.fillStyle = 'rgba(160, 160, 160, 0.8)'
        }
        else {
          c.fillStyle = textColor
        }
      }
      else {
        c.fillStyle = 'rgba(255, 255, 255, 0.5)'
      }

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
