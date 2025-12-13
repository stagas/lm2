import { ARRAY_HEADER_SIZE, SEQ_HISTORY_SIZE } from '../../as/assembly/constants.ts'
import type { AnimationManager } from './animation-manager.ts'
import { readEventValue, readEventValues } from './mini-bytecode-reader.ts'

type VmArray = {
  length: number
  historyWritePos: number
  historySize: number
  history: Float32Array
  raw: Float32Array
  data: Float32Array
}

function freqToMidi(freq: number): number {
  if (freq <= 0) return 0
  const A4 = 440
  const A4_MIDI = 69
  const semitones = 12 * Math.log2(freq / A4)
  return Math.round(A4_MIDI + semitones)
}

export function createPianorollVisualization(
  array: VmArray,
  audioContext: AudioContext,
  bpmValue: Float32Array,
  globalSampleCount: Int32Array,
  animationManager: AnimationManager,
  width: number,
  height: number,
): { canvas: HTMLCanvasElement; clear: () => void; destroy: () => void } {
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

  const TIME_WINDOW_SECONDS = 16
  const PAST_SECONDS = 4
  const FUTURE_SECONDS = TIME_WINDOW_SECONDS - PAST_SECONDS
  const PIXELS_PER_SECOND = width / TIME_WINDOW_SECONDS

  const bytecode = array.raw
  // NoteValue cache for events with invalid opIndex (bytecode changed)
  // Key: `${opIndex}-${startSample}-${endSample}`, Value: noteValue
  const noteValueCache = new Map<string, number>()

  let lastFrameTime = performance.now()
  let predictedSampleCount = Atomics.load(globalSampleCount, 0)
  let isFirstFrame = true

  const draw = () => {
    c.clearRect(0, 0, width, height)

    const sampleRate = audioContext.sampleRate
    const now = performance.now()
    const deltaTime = (now - lastFrameTime) / 1000
    lastFrameTime = now

    const latencySeconds = (audioContext.outputLatency || 0) - (audioContext.baseLatency || 0)
    const latencySamples = latencySeconds * sampleRate

    const rawSampleCount = Atomics.load(globalSampleCount, 0)
    const rawPlaybackPosition = rawSampleCount === 0 ? rawSampleCount : rawSampleCount - latencySamples

    if (rawSampleCount === 0) {
      predictedSampleCount = 0
      isFirstFrame = true
    }
    else {
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
    }

    const currentSampleCount = Math.max(0, predictedSampleCount)
    const currentTimeSeconds = currentSampleCount / sampleRate

    // Check if playback is active (rawSampleCount is advancing)
    const isPlaying = rawSampleCount > 0

    const historySize = Math.floor(array.historySize) || SEQ_HISTORY_SIZE
    const history = array.history

    // Read events directly from history buffer (single source of truth)
    const eventMap = new Map<string, {
      opIndex: number
      startSample: number
      endSample: number
      noteValue: number
    }>()

    const currentBytecodeLength = bytecode[ARRAY_HEADER_SIZE] as number
    const historyWritePos = Math.floor(array.raw[1])

    // Read all events from history buffer
    const allEntries: Array<{ opIndex: number; startSample: number; endSample: number }> = []
    for (let n = 0; n < historySize; n++) {
      const readPos = (historyWritePos - 1 - n + historySize) % historySize
      const idx = readPos * 3
      const opIndex = Math.floor(history[idx])
      const startSample = Math.floor(history[idx + 1])
      const endSample = Math.floor(history[idx + 2])

      if (startSample === 0 && endSample === 0) continue
      allEntries.push({ opIndex, startSample, endSample })
    }

    // Group entries by opIndex to handle chords
    const entriesByOpIndex = new Map<number, Array<{ startSample: number; endSample: number }>>()
    for (const entry of allEntries) {
      if (!entriesByOpIndex.has(entry.opIndex)) {
        entriesByOpIndex.set(entry.opIndex, [])
      }
      entriesByOpIndex.get(entry.opIndex)!.push({ startSample: entry.startSample, endSample: entry.endSample })
    }

    // Process each opIndex and read noteValue from bytecode
    for (const [opIndex, entries] of entriesByOpIndex) {
      entries.sort((a, b) => a.startSample - b.startSample)

      // Try to read noteValue from current bytecode
      const values = readEventValues(bytecode, opIndex)
      const isValidOpIndex = opIndex < currentBytecodeLength && values.length > 0

      if (isValidOpIndex) {
        // Valid opIndex - read from bytecode
        if (values.length === 1) {
          // Single note
          for (const entry of entries) {
            const eventKey = `${opIndex}-${entry.startSample}-${entry.endSample}`
            const noteValue = values[0]!

            // Cache noteValue for potential future use if bytecode changes
            noteValueCache.set(eventKey, noteValue)

            const startTimeSeconds = entry.startSample / sampleRate
            const endTimeSeconds = entry.endSample / sampleRate
            const windowStart = currentTimeSeconds - PAST_SECONDS
            // Only show future events if playback is active
            const windowEnd = isPlaying ? currentTimeSeconds + FUTURE_SECONDS : currentTimeSeconds

            if (endTimeSeconds >= windowStart && startTimeSeconds <= windowEnd) {
              eventMap.set(eventKey, {
                opIndex,
                startSample: entry.startSample,
                endSample: entry.endSample,
                noteValue,
              })
            }
          }
        }
        else {
          // Chord
          for (let i = 0; i < Math.min(entries.length, values.length); i++) {
            const entry = entries[i]!
            const noteValue = values[i]!
            if (noteValue <= 0) continue

            const eventKey = `${opIndex}-${entry.startSample}-${entry.endSample}-${i}`
            noteValueCache.set(eventKey, noteValue)

            const startTimeSeconds = entry.startSample / sampleRate
            const endTimeSeconds = entry.endSample / sampleRate
            const windowStart = currentTimeSeconds - PAST_SECONDS
            // Only show future events if playback is active
            const windowEnd = isPlaying ? currentTimeSeconds + FUTURE_SECONDS : currentTimeSeconds

            if (endTimeSeconds >= windowStart && startTimeSeconds <= windowEnd) {
              eventMap.set(eventKey, {
                opIndex,
                startSample: entry.startSample,
                endSample: entry.endSample,
                noteValue,
              })
            }
          }

          // Handle case where one entry maps to multiple values (chord)
          if (entries.length === 1 && values.length > 1) {
            const entry = entries[0]!
            for (let i = 0; i < values.length; i++) {
              const noteValue = values[i]!
              if (noteValue <= 0) continue

              const eventKey = `${opIndex}-${entry.startSample}-${entry.endSample}-${i}`
              noteValueCache.set(eventKey, noteValue)

              const startTimeSeconds = entry.startSample / sampleRate
              const endTimeSeconds = entry.endSample / sampleRate
              const windowStart = currentTimeSeconds - PAST_SECONDS
              // Only show future events if playback is active
              const windowEnd = isPlaying ? currentTimeSeconds + FUTURE_SECONDS : currentTimeSeconds

              if (endTimeSeconds >= windowStart && startTimeSeconds <= windowEnd) {
                eventMap.set(eventKey, {
                  opIndex,
                  startSample: entry.startSample,
                  endSample: entry.endSample,
                  noteValue,
                })
              }
            }
          }
        }
      }
      else {
        // Invalid opIndex (bytecode changed) - try to use cached noteValue
        for (const entry of entries) {
          const eventKey = `${opIndex}-${entry.startSample}-${entry.endSample}`
          const cachedNoteValue = noteValueCache.get(eventKey)

          if (cachedNoteValue && cachedNoteValue > 0) {
            const startTimeSeconds = entry.startSample / sampleRate
            const endTimeSeconds = entry.endSample / sampleRate
            const windowStart = currentTimeSeconds - PAST_SECONDS
            // Only show future events if playback is active
            const windowEnd = isPlaying ? currentTimeSeconds + FUTURE_SECONDS : currentTimeSeconds

            if (endTimeSeconds >= windowStart && startTimeSeconds <= windowEnd) {
              eventMap.set(eventKey, {
                opIndex,
                startSample: entry.startSample,
                endSample: entry.endSample,
                noteValue: cachedNoteValue,
              })
            }
          }
        }
      }
    }

    // Clean up old cache entries (older than 60 seconds)
    const maxHistoryAge = 60
    const cutoffSample = currentSampleCount - maxHistoryAge * sampleRate
    for (const [key, noteValue] of noteValueCache) {
      // Extract endSample from key if possible, or just clear very old entries
      // For now, we'll keep the cache simple and let it grow (it's just noteValues)
    }

    const events = Array.from(eventMap.values())

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
    const windowStartTime = currentTimeSeconds - PAST_SECONDS
    const windowEndTime = currentTimeSeconds + FUTURE_SECONDS

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

      const windowStartTime = currentTimeSeconds - PAST_SECONDS
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
    clear: () => {
      // Clear noteValue cache when needed
      noteValueCache.clear()
      isFirstFrame = true
      predictedSampleCount = Atomics.load(globalSampleCount, 0)
    },
    destroy: () => {
      animationManager.unregister(draw)
      canvas.remove()
    },
  }
}

