import {
  FUTURE_SECONDS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_SIZE,
  PAST_SECONDS,
  TIME_WINDOW_SECONDS,
} from '../../as/assembly/constants.ts'
import type { VmHistory } from '../index.ts'
import type { AnimationManager } from './animation-manager.ts'

function freqToMidi(freq: number): number {
  if (freq <= 0) return 0
  const A4 = 440
  const A4_MIDI = 69
  const semitones = 12 * Math.log2(freq / A4)
  return Math.round(A4_MIDI + semitones)
}

export function createPianorollVisualization(
  history: VmHistory,
  audioContext: AudioContext,
  bpmValue: Float32Array,
  globalSampleCount: Int32Array,
  animationManager: AnimationManager,
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

  const MIN_MIDI = 0
  const MAX_MIDI = 127

  const PIXELS_PER_SECOND = width / TIME_WINDOW_SECONDS

  let currentHistory = history

  const draw = () => {
    c.clearRect(0, 0, width, height)

    // Read bytecode from array each frame (it's a view into shared memory, so it updates automatically)
    const sampleRate = audioContext.sampleRate

    // Use the raw sample count directly - it's already synchronized with the audio thread
    // The history buffer events are written using the same globalSampleCount value
    const rawSampleCount = Atomics.load(globalSampleCount, 0)
    const currentSampleCount = Math.max(0, rawSampleCount)
    const currentTimeSeconds = currentSampleCount / sampleRate

    const historyRaw = currentHistory.raw

    // Read events directly from history buffer
    const events: Array<{
      startSample: number
      endSample: number
      noteValue: number
      velocity: number
    }> = []

    // Calculate visible time window first
    const windowStartTime = currentTimeSeconds - PAST_SECONDS
    const windowEndTime = currentTimeSeconds + FUTURE_SECONDS

    // Read events from history buffer
    // After defragmentation, preserved events are at slots 0 to writePos-1
    // New events are written from writePos onwards
    // Read all slots to catch both preserved and newly written events
    const historySize = HISTORY_SIZE
    const writePos = currentHistory.writePos || 0
    // Read all slots up to historySize (preserved events + new events)
    for (let slot = 0; slot < historySize; slot++) {
      const idx = HISTORY_DATA_OFFSET + slot * HISTORY_ENTRY_SIZE
      if (idx + 4 >= historyRaw.length) break

      const noteValue = historyRaw[idx + 1]
      const velocity = historyRaw[idx + 2]
      const startSample = Math.floor(historyRaw[idx + 3])
      const endSample = Math.floor(historyRaw[idx + 4])

      // Skip invalid entries
      if (startSample === 0 && endSample === 0) continue

      if (noteValue <= 0) continue

      const startTimeSeconds = startSample / sampleRate
      const endTimeSeconds = endSample / sampleRate

      // Only include events within the visible time window
      if (endTimeSeconds < windowStartTime || startTimeSeconds > windowEndTime) continue

      events.push({
        startSample,
        endSample,
        noteValue,
        velocity,
      })
    }

    const preActiveNotes = new Set<number>()
    events.forEach(event => {
      if (event.noteValue && event.noteValue > 0) {
        const midiNote = Math.round(freqToMidi(event.noteValue))
        preActiveNotes.add(midiNote)
      }
    })

    let displayMinMidi: number
    let displayMaxMidi: number

    if (preActiveNotes.size > 0) {
      const activeMidis = Array.from(preActiveNotes)
      const minActive = Math.min(...activeMidis)
      const maxActive = Math.max(...activeMidis)

      displayMinMidi = Math.max(MIN_MIDI, minActive - 2)
      displayMaxMidi = Math.min(MAX_MIDI, maxActive + 2)

      if (displayMaxMidi - displayMinMidi < 11) {
        const center = (displayMinMidi + displayMaxMidi) / 2
        displayMinMidi = Math.max(MIN_MIDI, center - 6)
        displayMaxMidi = Math.min(MAX_MIDI, center + 6)
      }
    }
    else {
      displayMinMidi = MIN_MIDI
      displayMaxMidi = MAX_MIDI
    }

    const displayRange = displayMaxMidi - displayMinMidi + 1
    const keyHeight = height / displayRange

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = midi - displayMinMidi
      const y = keyIndex * keyHeight
      const noteInOctave = midi % 12
      const isBlackKey = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10

      if (isBlackKey) {
        c.fillStyle = 'rgba(30, 30, 30, 0.5)'
      }
      else {
        c.fillStyle = 'rgba(75, 75, 75, 0.3)'
      }
      c.fillRect(0, y, width, keyHeight)

      c.strokeStyle = 'rgba(100, 100, 100, 0.4)'
      c.lineWidth = noteInOctave === 0 ? 1.5 : 0.5
      c.strokeRect(0, y, width, keyHeight)
    }

    const barLengthSeconds = (4 * 60) / bpmValue[0]
    const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds

    for (let barStart = firstBarStart; barStart < windowEndTime; barStart += barLengthSeconds) {
      const barIndex = Math.floor(barStart / barLengthSeconds)
      const isEvenBar = barIndex % 2 === 0

      const barRelativeStart = barStart - windowStartTime
      const barRelativeEnd = (barStart + barLengthSeconds) - windowStartTime
      const barX = barRelativeStart * PIXELS_PER_SECOND
      const barWidth = (barRelativeEnd - barRelativeStart) * PIXELS_PER_SECOND

      c.fillStyle = isEvenBar ? 'rgba(0, 0, 0, 0.15)' : 'rgba(255, 255, 255, 0.08)'
      c.fillRect(barX, 0, barWidth, height)
    }

    for (const event of events) {
      const startTimeSeconds = event.startSample / sampleRate
      const endTimeSeconds = event.endSample / sampleRate

      const durationSeconds = endTimeSeconds - startTimeSeconds
      const relativeStartTime = startTimeSeconds - windowStartTime
      const relativeEndTime = endTimeSeconds - windowStartTime

      const x = relativeStartTime * PIXELS_PER_SECOND
      const eventWidth = durationSeconds * PIXELS_PER_SECOND

      const midi = freqToMidi(event.noteValue)
      if (midi < displayMinMidi || midi > displayMaxMidi) continue

      const keyIndex = midi - displayMinMidi
      const y = keyIndex * keyHeight

      const duration = event.endSample - event.startSample
      const isActive = currentSampleCount >= event.startSample
        && (currentSampleCount <= Math.max(event.startSample + 5000, event.endSample))

      if (isActive) {
        c.fillStyle = 'rgba(255, 200, 0, 0.9)'
        c.strokeStyle = 'rgba(255, 255, 100, 1)'
      }
      else {
        c.fillStyle = 'rgba(0, 200, 255, 0.5)'
        c.strokeStyle = 'rgba(0, 255, 255, 0.7)'
      }
      c.fillRect(x, y, Math.max(2, eventWidth), keyHeight - 1)

      c.lineWidth = 1
      c.strokeRect(x, y, Math.max(1, eventWidth), keyHeight - 1)
    }

    const currentTimeX = PAST_SECONDS * PIXELS_PER_SECOND
    c.strokeStyle = 'rgba(255, 255, 0, 0.8)'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(currentTimeX, 0)
    c.lineTo(currentTimeX, height)
    c.stroke()

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = midi - displayMinMidi
      const y = keyIndex * keyHeight
      const noteInOctave = midi % 12
      const isBlackKey = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10
      const isOctaveKey = noteInOctave === 0
      if (isOctaveKey) {
        c.fillStyle = 'rgba(255, 255, 255, 1.0)'
      }
      else if (isBlackKey) {
        c.fillStyle = 'rgba(0, 0, 0, 1.0)'
      }
      else {
        c.fillStyle = 'rgba(150, 150, 150, 1.0)'
      }
      c.fillRect(width - 20, y, 20, keyHeight)
      c.fillStyle = 'rgba(0, 0, 0, 0.2)'
      c.fillRect(width - 20, y + keyHeight - 1, 20, 1)
    }

    c.font = '7px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi += 1) {
      const keyIndex = midi - displayMinMidi
      const y = keyIndex * keyHeight + keyHeight / 2
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      const octave = Math.floor(midi / 12) - 1
      const noteName = noteNames[midi % 12]
      const noteInOctave = midi % 12
      const isBlackKey = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10
      if (!isBlackKey) {
        c.fillStyle = 'rgba(0, 0, 0, 1.0)'
      }
      else {
        c.fillStyle = 'rgba(255, 255, 255, 1.0)'
      }
      c.fillText(`${noteName}${octave}`, width - 10, y + 0.5)
    }
  }

  animationManager.register(draw)

  document.body.appendChild(canvas)
  return {
    canvas,
    update: (newHistory: VmHistory) => {
      currentHistory = newHistory
    },
    clear: () => {
    },
    destroy: () => {
      animationManager.unregister(draw)
      canvas.remove()
    },
  }
}
