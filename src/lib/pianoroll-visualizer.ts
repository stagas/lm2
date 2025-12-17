import {
  FUTURE_SECONDS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_SIZE,
  PAST_SECONDS,
  TIME_WINDOW_SECONDS,
} from '../../as/assembly/constants.ts'
import type { VmHistory } from '../index.ts'
import { frequencyToMidi } from '../mini/util.ts'
import type { AnimationManager } from './animation-manager.ts'

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

  const SCROLL_SMOOTHING = 0.17

  const KEY_WIDTH = 20
  const NOTE_WIDTH = width - KEY_WIDTH

  const PIXELS_PER_SECOND = NOTE_WIDTH / TIME_WINDOW_SECONDS

  let currentHistory = history
  let smoothedTimeSeconds: number | null = null

  // Track fading note labels
  const fadingNotes: Array<{
    midi: number
    noteText: string
    fade: number
    y: number
  }> = []

  // Track display range state
  let isInitialState = true
  let lastDisplayMinMidi = 54 // Default span as if C4 note was present (F#3)
  let lastDisplayMaxMidi = 66 // Default span as if C4 note was present (F#4)

  const draw = () => {
    c.clearRect(0, 0, width, height)

    c.save()
    c.beginPath()
    c.rect(0, 0, NOTE_WIDTH, height)
    c.clip()

    // Read bytecode from array each frame (it's a view into shared memory, so it updates automatically)
    const sampleRate = audioContext.sampleRate

    // Use the raw sample count directly - it's already synchronized with the audio thread
    // The history buffer events are written using the same globalSampleCount value
    const rawSampleCount = Atomics.load(globalSampleCount, 0)
    const currentSampleCount = Math.max(0, rawSampleCount)
    const currentTimeSeconds = currentSampleCount / sampleRate

    const targetTimeSeconds = currentTimeSeconds
    if (smoothedTimeSeconds === null) {
      smoothedTimeSeconds = targetTimeSeconds
    }
    else {
      smoothedTimeSeconds += (targetTimeSeconds - smoothedTimeSeconds) * SCROLL_SMOOTHING
    }

    const displayTimeSeconds = smoothedTimeSeconds

    const historyRaw = currentHistory.raw

    // Read events directly from history buffer
    const events: Array<{
      startSample: number
      endSample: number
      noteValue: number
      velocity: number
    }> = []

    // Calculate visible time window first, based on smoothed time
    const windowStartTime = displayTimeSeconds - PAST_SECONDS
    const windowEndTime = displayTimeSeconds + FUTURE_SECONDS

    // Read events from history buffer
    // After defragmentation, preserved events are at slots 0 to writePos-1
    // New events are written from writePos onwards
    // Read all slots to catch both preserved and newly written events
    const historySize = HISTORY_SIZE
    const writePos = currentHistory.writePos || 0
    // Read all slots up to historySize (preserved events + new events)
    for (let slot = 0; slot < historySize; slot++) {
      const idx = HISTORY_DATA_OFFSET + slot * HISTORY_ENTRY_SIZE
      if (idx + 5 >= historyRaw.length) break

      // Layout: opIndex, voiceIndex, value, velocity, startSample, endSample
      const voiceIndex = Math.floor(historyRaw[idx + 1])
      const noteValue = historyRaw[idx + 2]
      const velocity = historyRaw[idx + 3]
      const startSample = Math.floor(historyRaw[idx + 4])
      const endSample = Math.floor(historyRaw[idx + 5])

      // Skip invalid entries
      if (startSample === 0 && endSample === 0) continue

      // Ignore non-note entries (e.g. octave/transpose controls encoded as negative voiceIndex)
      if (voiceIndex < 0) continue

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
        const midiNote = frequencyToMidi(event.noteValue)
        preActiveNotes.add(midiNote)
      }
    })

    let displayMinMidi: number
    let displayMaxMidi: number

    if (preActiveNotes.size > 0) {
      const activeMidis = Array.from(preActiveNotes)
      const minActive = Math.min(...activeMidis)
      const maxActive = Math.max(...activeMidis)

      // Ensure display bounds are always integral MIDI values
      displayMinMidi = Math.max(MIN_MIDI, minActive)
      displayMaxMidi = Math.min(MAX_MIDI, maxActive)

      // if (displayMaxMidi - displayMinMidi < 4) {
      //   displayMinMidi = Math.max(MIN_MIDI, minActive - 2)
      //   displayMaxMidi = Math.min(MAX_MIDI, maxActive + 2)
      // }

      // Update last range and mark as not initial
      lastDisplayMinMidi = displayMinMidi
      lastDisplayMaxMidi = displayMaxMidi
      isInitialState = false
    }
    else {
      // Use last range if we've seen events before, otherwise use default span as if C4 note was present
      if (isInitialState) {
        displayMinMidi = 54 // F#3
        displayMaxMidi = 66 // F#4
      }
      else {
        displayMinMidi = lastDisplayMinMidi
        displayMaxMidi = lastDisplayMaxMidi
      }
    }

    const displayRange = displayMaxMidi - displayMinMidi + 1
    const keyHeight = height / displayRange

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = displayMaxMidi - midi
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
      c.fillRect(0, y, NOTE_WIDTH, keyHeight)

      c.strokeStyle = 'rgba(100, 100, 100, 0.4)'
      c.lineWidth = noteInOctave === 0 ? 1.5 : 0.5
      c.strokeRect(0, y, NOTE_WIDTH, keyHeight)
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

      c.fillStyle = isEvenBar ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)'
      c.fillRect(barX, 0, barWidth, height)
    }

    const cycleLengthSeconds = 60 / bpmValue[0]
    const firstCycleStart = Math.floor(windowStartTime / cycleLengthSeconds) * cycleLengthSeconds

    for (let cycleStart = firstCycleStart; cycleStart < windowEndTime; cycleStart += cycleLengthSeconds) {
      const cycleRelativeStart = cycleStart - windowStartTime
      const cycleX = cycleRelativeStart * PIXELS_PER_SECOND

      c.strokeStyle = 'rgba(0, 0, 0, 1.0)'
      c.lineWidth = 0.5
      c.beginPath()
      c.moveTo(cycleX, 0)
      c.lineTo(cycleX, height)
      c.stroke()
    }

    const activeMidis = new Set<number>()
    const previousActiveMidis = new Set(fadingNotes.filter(n => n.fade > 0.1).map(n => n.midi))

    for (const event of events) {
      const startTimeSeconds = event.startSample / sampleRate
      const endTimeSeconds = event.endSample / sampleRate

      const durationSeconds = endTimeSeconds - startTimeSeconds
      const relativeStartTime = startTimeSeconds - windowStartTime
      const relativeEndTime = endTimeSeconds - windowStartTime

      const x = relativeStartTime * PIXELS_PER_SECOND
      const eventWidth = durationSeconds * PIXELS_PER_SECOND

      const midi = frequencyToMidi(event.noteValue)
      if (midi < displayMinMidi || midi > displayMaxMidi) continue

      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight

      const isActive = currentSampleCount >= event.startSample
        && (currentSampleCount <= Math.max(event.startSample + 5000, event.endSample))

      if (isActive) {
        activeMidis.add(midi)
      }

      const velocity = Math.max(0, Math.min(1, event.velocity))

      if (isActive) {
        c.fillStyle = 'rgba(255, 200, 0, 0.9)'
        c.strokeStyle = 'rgba(255, 255, 100, 1)'
      }
      else {
        c.fillStyle = `rgba(0, 200, 255, ${0.5 * velocity})`
        c.strokeStyle = `rgba(0, 255, 255, ${0.7 * velocity})`
      }
      c.fillRect(x, y, Math.max(2, eventWidth), keyHeight - 1)

      c.lineWidth = 1
      c.strokeRect(x, y, Math.max(1, eventWidth), keyHeight - 1)
    }

    // Update fading notes - add new active notes or refresh existing ones
    for (const midi of activeMidis) {
      if (midi >= displayMinMidi && midi <= displayMaxMidi) {
        const existingNote = fadingNotes.find(n => n.midi === midi)
        if (existingNote) {
          // Refresh existing note's fade
          existingNote.fade = 1.0
        }
        else {
          // Add new note
          const keyIndex = displayMaxMidi - midi
          const y = keyIndex * keyHeight + keyHeight / 2
          const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
          const octave = Math.floor(midi / 12) - 1
          const noteName = noteNames[midi % 12]
          fadingNotes.push({
            midi,
            noteText: `${noteName}${octave}`,
            fade: 1.0,
            y,
          })
        }
      }
    }

    // Update fade levels and positions
    for (const note of fadingNotes) {
      note.fade *= 0.95 // Fade out slowly
      if (note.midi >= displayMinMidi && note.midi <= displayMaxMidi) {
        const keyIndex = displayMaxMidi - note.midi
        note.y = keyIndex * keyHeight + keyHeight / 2
      }
    }

    // Remove completely faded notes
    for (let i = fadingNotes.length - 1; i >= 0; i--) {
      if (fadingNotes[i].fade < 0.01) {
        fadingNotes.splice(i, 1)
      }
    }

    const currentTimeX = PAST_SECONDS * PIXELS_PER_SECOND
    c.strokeStyle = 'rgba(255, 255, 0, 0.8)'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(currentTimeX, 0)
    c.lineTo(currentTimeX, height)
    c.stroke()

    // Draw fading note labels next to the needle
    c.font = '7px monospace'
    c.textAlign = 'right'
    c.textBaseline = 'middle'
    for (const note of fadingNotes) {
      c.fillStyle = `rgba(255, 255, 0, ${note.fade})`
      c.fillText(note.noteText, currentTimeX - 5, note.y + 0.5)
    }

    c.restore()

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight
      const noteInOctave = midi % 12
      const isBlackKey = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10
      const isOctaveKey = noteInOctave === 0
      const isActiveKey = activeMidis.has(midi)

      if (isActiveKey) {
        c.fillStyle = 'rgba(255, 220, 0, 1.0)'
      }
      else if (isOctaveKey) {
        c.fillStyle = 'rgba(255, 255, 255, 1.0)'
      }
      else if (isBlackKey) {
        c.fillStyle = 'rgba(0, 0, 0, 1.0)'
      }
      else {
        c.fillStyle = 'rgba(150, 150, 150, 1.0)'
      }
      c.fillRect(NOTE_WIDTH, y, KEY_WIDTH, keyHeight)
      c.fillStyle = 'rgba(0, 0, 0, 0.2)'
      c.fillRect(NOTE_WIDTH, y + keyHeight - 1, KEY_WIDTH, 1)
    }

    c.font = '7px monospace'
    c.textAlign = 'center'
    c.textBaseline = 'middle'
    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi += 1) {
      const keyIndex = displayMaxMidi - midi
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
      c.fillText(`${noteName}${octave}`, NOTE_WIDTH + KEY_WIDTH / 2, y + 0.5)
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
