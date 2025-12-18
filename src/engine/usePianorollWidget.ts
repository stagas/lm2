import type { EditorWidget } from 'mini-code'
import { useCallback, useMemo, useRef } from 'react'
import {
  FUTURE_SECONDS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  PAST_SECONDS,
  TIME_WINDOW_SECONDS,
} from '../../as/assembly/constants.ts'
import type { SourceLocation } from '../lib/mini-source-map.ts'
import { frequencyToMidi, midiToNoteName } from '../mini/util.ts'
import type { ProgramInstance } from './program.ts'
import { useEngineStore } from './store.ts'

const KEY_WIDTH = 20
const SCROLL_SMOOTHING = 0.17
const MIDI_IS_BLACK = new Uint8Array(128)
const MIDI_IS_OCTAVE = new Uint8Array(128)
const MIDI_LABELS = new Array<string>(128)
for (let midi = 0; midi < 128; midi++) {
  const noteInOctave = midi % 12
  MIDI_IS_BLACK[midi] = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
      || noteInOctave === 10
    ? 1
    : 0
  MIDI_IS_OCTAVE[midi] = noteInOctave === 0 ? 1 : 0
  MIDI_LABELS[midi] = midiToNoteName(midi)
}

type PianorollNote = {
  midi: number
  noteText: string
  fade: number
  y: number
}

type PianorollState = {
  timeSeconds: number | null
  sampleCount: number
  notes: PianorollNote[]
  isInitial: boolean
  lastMinMidi: number
  lastMaxMidi: number
  ev: number[]
  savedEv: number[]
  frameEv: number[]
  activeMask: Uint8Array
  activeList: number[]
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
}: UsePianorollParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const pianorollStateRef = useRef<Map<number, PianorollState>>(new Map())

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    if (!program1?.program?.histories || !audioContext || !globalSampleCount) return

    const sampleRate = audioContext.sampleRate
    const sampleCount = Math.max(0, Atomics.load(globalSampleCount, 0))
    const timeSeconds = sampleCount / sampleRate

    const prepareStatus = useEngineStore.getState().prepareDspStatus
    const isWorkletBusy = !!(prepareStatus && Atomics.load(prepareStatus, 0) !== 1)

    const seenSeqs = new Set<number>()
    for (const ref of miniRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)
      const map = miniSourceMaps[seqIndex]
      if (!map) continue

      const history = program1.program.histories[seqIndex]
      if (!history) continue

      const st = pianorollStateRef.current.get(seqIndex) ?? {
        timeSeconds: null,
        sampleCount: 0,
        notes: [],
        isInitial: true,
        lastMinMidi: 54,
        lastMaxMidi: 66,
        ev: [],
        savedEv: [],
        frameEv: [],
        activeMask: new Uint8Array(128),
        activeList: [],
      }

      st.sampleCount = sampleCount
      if (st.timeSeconds == null) {
        st.timeSeconds = timeSeconds
      }
      else {
        st.timeSeconds += (timeSeconds - st.timeSeconds) * SCROLL_SMOOTHING
      }

      const windowStartTime = st.timeSeconds - PAST_SECONDS
      const windowEndTime = st.timeSeconds + FUTURE_SECONDS

      const activeMask = st.activeMask
      activeMask.fill(0)
      const activeList = st.activeList
      activeList.length = 0

      let minMidi = 128
      let maxMidi = -1

      const canUseSaved = isWorkletBusy && st.savedEv.length > 0
      if (canUseSaved) {
        const ev = st.savedEv
        for (let i = 0; i < ev.length; i += 4) {
          const midi = ev[i + 2]!
          if (midi < minMidi) minMidi = midi
          if (midi > maxMidi) maxMidi = midi

          const startSample = ev[i]!
          const endSample = ev[i + 1]!
          const isActive = sampleCount >= startSample && (sampleCount <= Math.max(startSample + 5000, endSample))
          if (isActive && activeMask[midi] === 0) {
            activeMask[midi] = 1
            activeList.push(midi)
          }
        }
        st.frameEv = ev
      }
      else {
        const historyRaw = history.raw
        const ev = st.ev
        ev.length = 0

        for (let idx = HISTORY_DATA_OFFSET; idx + 5 < historyRaw.length; idx += HISTORY_ENTRY_SIZE) {
          const voiceIndex = historyRaw[idx + 1]!
          const noteValue = historyRaw[idx + 2]!
          const velocity = historyRaw[idx + 3]!
          const startSample = historyRaw[idx + 4]!
          const endSample = historyRaw[idx + 5]!

          if (startSample === 0 && endSample === 0) continue
          if (voiceIndex < 0) continue
          if (noteValue <= 0) continue

          const startTimeSeconds = startSample / sampleRate
          const endTimeSeconds = endSample / sampleRate
          if (endTimeSeconds < windowStartTime || startTimeSeconds > windowEndTime) continue

          const midi = frequencyToMidi(noteValue)
          if (midi < 0 || midi > 127) continue

          ev.push(startSample, endSample, midi, velocity)

          if (midi < minMidi) minMidi = midi
          if (midi > maxMidi) maxMidi = midi

          const isActive = sampleCount >= startSample && (sampleCount <= Math.max(startSample + 5000, endSample))
          if (isActive && activeMask[midi] === 0) {
            activeMask[midi] = 1
            activeList.push(midi)
          }
        }

        const savedEv = st.savedEv
        savedEv.length = ev.length
        for (let i = 0; i < ev.length; i++) savedEv[i] = ev[i]!

        st.frameEv = ev
      }

      if (maxMidi >= 0) {
        const displayMinMidi = Math.max(0, minMidi)
        const displayMaxMidi = Math.min(127, maxMidi)
        st.lastMinMidi = displayMinMidi
        st.lastMaxMidi = displayMaxMidi
        st.isInitial = false
      }
      else if (st.isInitial) {
        st.lastMinMidi = 54
        st.lastMaxMidi = 66
      }

      pianorollStateRef.current.set(seqIndex, st)
    }
  }, [showWidgets, program1, audioContext, globalSampleCount, miniRefs, miniSourceMaps])

  const drawPianoroll = useCallback((
    ctx: CanvasRenderingContext2D,
    seqIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
  ) => {
    if (!audioContext || !bpmValue) return
    const st = pianorollStateRef.current.get(seqIndex)
    if (!st || st.timeSeconds == null) return

    const dpr = window.devicePixelRatio || 1
    const x = viewX
    const h = Math.max(40, widgetHeight)
    const w = viewWidth

    ctx.save()
    ctx.translate(x, -3)

    const NOTE_WIDTH = Math.max(1, w - KEY_WIDTH)
    const PIXELS_PER_SECOND = NOTE_WIDTH / TIME_WINDOW_SECONDS

    const sampleRate = audioContext.sampleRate

    const windowStartTime = st.timeSeconds - PAST_SECONDS
    const windowEndTime = st.timeSeconds + FUTURE_SECONDS
    const displayMinMidi = st.isInitial ? 54 : st.lastMinMidi
    const displayMaxMidi = st.isInitial ? 66 : st.lastMaxMidi

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
      const isBlack = MIDI_IS_BLACK[midi] === 1

      ctx.fillStyle = isBlack ? 'rgba(30, 30, 30, 0.5)' : 'rgba(75, 75, 75, 0.3)'
      ctx.fillRect(0, y, NOTE_WIDTH, keyHeight)
      ctx.strokeStyle = 'rgba(100, 100, 100, 0.4)'
      ctx.lineWidth = MIDI_IS_OCTAVE[midi] === 1 ? 1.5 : 0.5
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

    const ev = st.frameEv
    for (let i = 0; i < ev.length; i += 4) {
      const startSample = ev[i]!
      const endSample = ev[i + 1]!
      const midi = ev[i + 2]!
      const velocityRaw = ev[i + 3]!

      const startTimeSeconds = startSample / sampleRate
      const endTimeSeconds = endSample / sampleRate
      const durationSeconds = endTimeSeconds - startTimeSeconds

      const x = (startTimeSeconds - windowStartTime) * PIXELS_PER_SECOND
      const eventWidth = durationSeconds * PIXELS_PER_SECOND

      if (midi < displayMinMidi || midi > displayMaxMidi) continue

      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight

      const isActive = st.sampleCount >= startSample && (st.sampleCount <= Math.max(startSample + 5000, endSample))
      const velocity = Math.max(0, Math.min(1, velocityRaw))
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

    for (const midi of st.activeList) {
      if (midi < displayMinMidi || midi > displayMaxMidi) continue
      const existing = st.notes.find(n => n.midi === midi)
      if (existing) {
        existing.fade = 1.0
      }
      else {
        const keyIndex = displayMaxMidi - midi
        const y = keyIndex * keyHeight + keyHeight / 2
        st.notes.push({ midi, noteText: MIDI_LABELS[midi]!, fade: 1.0, y })
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
      const isBlack = MIDI_IS_BLACK[midi] === 1
      const isOctave = MIDI_IS_OCTAVE[midi] === 1
      const isActive = st.activeMask[midi] === 1

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
      const isBlack = MIDI_IS_BLACK[midi] === 1
      ctx.fillStyle = isBlack ? 'rgba(255, 255, 255, 1.0)' : 'rgba(0, 0, 0, 1.0)'
      ctx.fillText(MIDI_LABELS[midi]!, NOTE_WIDTH + KEY_WIDTH / 2, y + 0.5)
    }

    ctx.restore()
    ctx.restore()
  }, [audioContext, bpmValue])

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
        height: 70,
        render: (ctx, _x, y, _w, h, vx, vw) => {
          drawPianoroll(ctx, ref.seqIndex, y, h, vx, vw)
        },
      })
    }

    return out
  }, [showWidgets, miniSourceMaps, miniRefs, dspSource, drawPianoroll])

  return { widgets, onBeforeDraw }
}
