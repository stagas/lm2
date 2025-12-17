import type { EditorWidget } from 'mini-code'
import { useMemo, useRef } from 'react'
import {
  FUTURE_SECONDS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  HISTORY_SIZE,
  PAST_SECONDS,
  TIME_WINDOW_SECONDS,
} from '../../as/assembly/constants.ts'
import type { SourceLocation } from '../lib/mini-source-map.ts'
import { frequencyToMidi } from '../mini/util.ts'
import type { ProgramInstance } from './program.ts'
import { useEngineStore } from './store.ts'

type PianorollNote = {
  midi: number
  noteText: string
  fade: number
  y: number
}

type PianorollState = {
  timeSeconds: number | null
  notes: PianorollNote[]
  isInitial: boolean
  lastMinMidi: number
  lastMaxMidi: number
  savedEvents?: Array<{
    startSample: number
    endSample: number
    noteValue: number
    velocity: number
  }>
}

type UsePianorollParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  miniSourceMaps: Array<Map<number, SourceLocation> | undefined>
  miniRefs: Array<{ seqIndex: number; loc: { line: number }; start: number }>
  dspSource: string
  showWidgets: boolean
}

export function usePianorollWidget({
  program1,
  audioContext,
  bpmValue,
  globalSampleCount,
  miniSourceMaps,
  miniRefs,
  dspSource,
  showWidgets,
}: UsePianorollParams): EditorWidget[] {
  const pianorollStateRef = useRef<Map<number, PianorollState>>(new Map())

  const drawPianoroll = (
    ctx: CanvasRenderingContext2D,
    seqIndex: number,
    widgetY: number,
    widgetHeight: number,
  ) => {
    if (!program1?.program?.histories || !audioContext || !bpmValue || !globalSampleCount) return

    const history = program1.program.histories[seqIndex]
    if (!history) return

    const dpr = window.devicePixelRatio || 1
    const editorWidth = ctx.canvas.width / dpr
    const x = 15
    const h = Math.max(40, widgetHeight)
    const w = editorWidth - 40

    ctx.save()
    ctx.translate(x, -3)

    const KEY_WIDTH = 20
    const NOTE_WIDTH = Math.max(1, w - KEY_WIDTH)
    const PIXELS_PER_SECOND = NOTE_WIDTH / TIME_WINDOW_SECONDS
    const SCROLL_SMOOTHING = 0.17

    const st = pianorollStateRef.current.get(seqIndex) ?? {
      timeSeconds: null,
      notes: [],
      isInitial: true,
      lastMinMidi: 54,
      lastMaxMidi: 66,
    }

    const sampleRate = audioContext.sampleRate
    const currentSampleCount = Math.max(0, Atomics.load(globalSampleCount, 0))
    const currentTimeSeconds = currentSampleCount / sampleRate

    if (st.timeSeconds == null) {
      st.timeSeconds = currentTimeSeconds
    }
    else {
      st.timeSeconds += (currentTimeSeconds - st.timeSeconds) * SCROLL_SMOOTHING
    }

    const windowStartTime = st.timeSeconds - PAST_SECONDS
    const windowEndTime = st.timeSeconds + FUTURE_SECONDS

    const historyRaw = history.raw

    // Decide whether to read the latest shared history buffer or reuse a saved snapshot.
    // If the engine's prepareDspStatus exists and its first slot is non-zero,
    // the worklet is not in the "ready to copy latest" state, so we should use our saved snapshot.
    // Otherwise, copy the latest buffer into a snapshot we keep on the state.
    const prepareStatus = useEngineStore.getState().prepareDspStatus
    let events: Array<{
      startSample: number
      endSample: number
      noteValue: number
      velocity: number
    }> = []

    const shouldUseSaved = prepareStatus && Atomics.load(prepareStatus, 0) !== 1 && Array.isArray(st.savedEvents)
      && st.savedEvents!.length > 0

    if (shouldUseSaved) {
      // Use previously saved snapshot of events
      events = st.savedEvents!.slice()
    }
    else {
      // Build events from the latest history buffer and save a snapshot
      for (let slot = 0; slot < HISTORY_SIZE; slot++) {
        const idx = HISTORY_DATA_OFFSET + slot * HISTORY_ENTRY_SIZE
        if (idx + 5 >= historyRaw.length) break

        const voiceIndex = Math.floor(historyRaw[idx + 1])
        const noteValue = historyRaw[idx + 2]
        const velocity = historyRaw[idx + 3]
        const startSample = Math.floor(historyRaw[idx + 4])
        const endSample = Math.floor(historyRaw[idx + 5])

        if (startSample === 0 && endSample === 0) continue
        if (voiceIndex < 0) continue
        if (noteValue <= 0) continue

        const startTimeSeconds = startSample / sampleRate
        const endTimeSeconds = endSample / sampleRate

        if (endTimeSeconds < windowStartTime || startTimeSeconds > windowEndTime) continue

        events.push({
          startSample,
          endSample,
          noteValue,
          velocity,
        })
      }

      // Save a shallow copy of events so we can reuse it while the worklet is busy.
      st.savedEvents = events.slice()
    }

    const preActive = new Set<number>()
    for (const e of events) {
      const midi = frequencyToMidi(e.noteValue)
      preActive.add(midi)
    }

    let displayMinMidi: number
    let displayMaxMidi: number

    if (preActive.size > 0) {
      const active = Array.from(preActive)
      displayMinMidi = Math.max(0, Math.min(...active))
      displayMaxMidi = Math.min(127, Math.max(...active))
      st.lastMinMidi = displayMinMidi
      st.lastMaxMidi = displayMaxMidi
      st.isInitial = false
    }
    else if (st.isInitial) {
      displayMinMidi = 54
      displayMaxMidi = 66
    }
    else {
      displayMinMidi = st.lastMinMidi
      displayMaxMidi = st.lastMaxMidi
    }

    const displayRange = displayMaxMidi - displayMinMidi + 1
    const keyHeight = h / displayRange

    const bpm = bpmValue[0] || 60
    const barLengthSeconds = (4 * 60) / bpm
    const cycleLengthSeconds = 60 / bpm
    const currentTimeX = PAST_SECONDS * PIXELS_PER_SECOND

    ctx.save()
    ctx.translate(0, widgetY)
    ctx.beginPath()
    ctx.rect(0, 0, w, h)
    ctx.clip()

    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)'
    ctx.fillRect(0, 0, w, h)

    ctx.save()
    ctx.beginPath()
    ctx.rect(0, 0, NOTE_WIDTH, h)
    ctx.clip()

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight
      const noteInOctave = midi % 12
      const isBlack = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10

      ctx.fillStyle = isBlack ? 'rgba(30, 30, 30, 0.5)' : 'rgba(75, 75, 75, 0.3)'
      ctx.fillRect(0, y, NOTE_WIDTH, keyHeight)
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)'
      ctx.lineWidth = noteInOctave === 0 ? 1.5 : 0.5
      ctx.strokeRect(0, y, NOTE_WIDTH, keyHeight)
    }

    const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
    for (let barStart = firstBarStart; barStart < windowEndTime; barStart += barLengthSeconds) {
      const barIndex = Math.floor(barStart / barLengthSeconds)
      const isEvenBar = barIndex % 2 === 0
      const barX = (barStart - windowStartTime) * PIXELS_PER_SECOND
      const barWidth = barLengthSeconds * PIXELS_PER_SECOND
      ctx.fillStyle = isEvenBar ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)'
      ctx.fillRect(barX, 0, barWidth, h)
    }

    const firstCycleStart = Math.floor(windowStartTime / cycleLengthSeconds) * cycleLengthSeconds
    for (let cycleStart = firstCycleStart; cycleStart < windowEndTime; cycleStart += cycleLengthSeconds) {
      const cycleX = (cycleStart - windowStartTime) * PIXELS_PER_SECOND
      ctx.strokeStyle = 'rgba(0, 0, 0, 1.0)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      ctx.moveTo(cycleX, 0)
      ctx.lineTo(cycleX, h)
      ctx.stroke()
    }

    const activeMidis = new Set<number>()
    for (const e of events) {
      const startTimeSeconds = e.startSample / sampleRate
      const endTimeSeconds = e.endSample / sampleRate
      const durationSeconds = endTimeSeconds - startTimeSeconds

      const x = (startTimeSeconds - windowStartTime) * PIXELS_PER_SECOND
      const eventWidth = durationSeconds * PIXELS_PER_SECOND

      const midi = frequencyToMidi(e.noteValue)
      if (midi < displayMinMidi || midi > displayMaxMidi) continue

      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight

      const isActive = currentSampleCount >= e.startSample
        && (currentSampleCount <= Math.max(e.startSample + 5000, e.endSample))
      if (isActive) activeMidis.add(midi)

      const velocity = Math.max(0, Math.min(1, e.velocity))
      if (isActive) {
        ctx.fillStyle = 'rgba(255, 200, 0, 0.9)'
        ctx.strokeStyle = 'rgba(255, 255, 100, 1)'
      }
      else {
        ctx.fillStyle = `rgba(0, 200, 255, ${0.5 * velocity})`
        ctx.strokeStyle = `rgba(0, 255, 255, ${0.7 * velocity})`
      }
      ctx.fillRect(x, y, Math.max(2, eventWidth), keyHeight - 1)
      ctx.lineWidth = 1
      ctx.strokeRect(x, y, Math.max(1, eventWidth), keyHeight - 1)
    }

    for (const midi of activeMidis) {
      if (midi < displayMinMidi || midi > displayMaxMidi) continue
      const existing = st.notes.find(n => n.midi === midi)
      if (existing) {
        existing.fade = 1.0
      }
      else {
        const keyIndex = displayMaxMidi - midi
        const y = keyIndex * keyHeight + keyHeight / 2
        const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
        const octave = Math.floor(midi / 12) - 1
        const noteName = noteNames[midi % 12]
        st.notes.push({ midi, noteText: `${noteName}${octave}`, fade: 1.0, y })
      }
    }

    for (const n of st.notes) {
      n.fade *= 0.95
      if (n.midi >= displayMinMidi && n.midi <= displayMaxMidi) {
        const keyIndex = displayMaxMidi - n.midi
        n.y = keyIndex * keyHeight + keyHeight / 2
      }
    }

    for (let i = st.notes.length - 1; i >= 0; i--) {
      if (st.notes[i]!.fade < 0.01) st.notes.splice(i, 1)
    }

    ctx.strokeStyle = 'rgba(255, 255, 0, 0.8)'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(currentTimeX, 0)
    ctx.lineTo(currentTimeX, h)
    ctx.stroke()

    ctx.font = '7px monospace'
    ctx.textAlign = 'right'
    ctx.textBaseline = 'middle'
    for (const n of st.notes) {
      ctx.fillStyle = `rgba(255, 255, 0, ${n.fade})`
      ctx.fillText(n.noteText, currentTimeX - 5, n.y + 0.5)
    }

    ctx.restore()

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight
      const noteInOctave = midi % 12
      const isBlack = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10
      const isOctave = noteInOctave === 0
      const isActive = activeMidis.has(midi)

      if (isActive) ctx.fillStyle = 'rgba(255, 220, 0, 1.0)'
      else if (isOctave) ctx.fillStyle = 'rgba(255, 255, 255, 1.0)'
      else if (isBlack) ctx.fillStyle = 'rgba(0, 0, 0, 1.0)'
      else ctx.fillStyle = 'rgba(150, 150, 150, 1.0)'
      ctx.fillRect(NOTE_WIDTH, y, KEY_WIDTH, keyHeight)
      ctx.fillStyle = 'rgba(0, 0, 0, 0.2)'
      ctx.fillRect(NOTE_WIDTH, y + keyHeight - 1, KEY_WIDTH, 1)
    }

    ctx.font = '7px monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi += 1) {
      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight + keyHeight / 2
      const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
      const octave = Math.floor(midi / 12) - 1
      const noteName = noteNames[midi % 12]
      const noteInOctave = midi % 12
      const isBlack = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
        || noteInOctave === 10
      ctx.fillStyle = isBlack ? 'rgba(255, 255, 255, 1.0)' : 'rgba(0, 0, 0, 1.0)'
      ctx.fillText(`${noteName}${octave}`, NOTE_WIDTH + KEY_WIDTH / 2, y + 0.5)
    }

    ctx.restore()
    ctx.restore()
    pianorollStateRef.current.set(seqIndex, st)
  }

  const widgets = useMemo(() => {
    if (!showWidgets) return []
    if (miniRefs.length === 0) return []

    const out: EditorWidget[] = []

    for (const ref of miniRefs) {
      const map = miniSourceMaps[ref.seqIndex]
      if (!map) continue

      out.push({
        type: 'above',
        line: ref.loc.line,
        column: 1,
        length: 1,
        height: 160,
        render: (ctx, _x, y, _w, h) => {
          drawPianoroll(ctx, ref.seqIndex, y, h)
        },
      })
    }

    return out
  }, [showWidgets, program1, audioContext, bpmValue, globalSampleCount, miniSourceMaps, miniRefs, dspSource])

  return widgets
}
