import type { EditorWidget } from 'mini-code'
import { useCallback, useEffect, useMemo, useRef } from 'react'
import { luminate } from 'utils/rgb'
import {
  FUTURE_BARS,
  HISTORY_DATA_OFFSET,
  HISTORY_ENTRY_SIZE,
  PAST_BARS,
  TIME_WINDOW_BARS,
} from '../../../as/assembly/constants.ts'
import type { SourceLocation } from '../../lib/mini-source-map.ts'
import { frequencyToMidi, midiToNoteName } from '../../mini/util.ts'
import type { MiniSequenceRef, TimelineLabel } from '../bytecode/bytecode.ts'
import { PIANOROLL_KEY_WIDTH } from '../constants.ts'
import type { ProgramInstance } from '../dsp/program.ts'
import { useEngineRuntimeStore } from '../store.ts'
import { applySmoothing } from '../util.ts'
import { useTheme } from './theme.ts'
import { updatePredictedSampleCount } from './update-predicted-sample-count.ts'

const MIDI_IS_BLACK = new Uint8Array(128)
const MIDI_IS_OCTAVE = new Uint8Array(128)
const MIDI_IS_EF = new Uint8Array(128)
const MIDI_LABELS = new Array<string>(128)
for (let midi = 0; midi < 128; midi++) {
  const noteInOctave = midi % 12
  MIDI_IS_BLACK[midi] = noteInOctave === 1 || noteInOctave === 3 || noteInOctave === 6 || noteInOctave === 8
      || noteInOctave === 10
    ? 1
    : 0
  MIDI_IS_OCTAVE[midi] = noteInOctave === 0 ? 1 : 0
  MIDI_IS_EF[midi] = noteInOctave === 5 ? 1 : 0
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
  frameEv: number[]
  activeMask: Uint8Array
  activeList: number[]
}

type UsePianorollParams = {
  program1: ProgramInstance | undefined
  audioContext: AudioContext | undefined
  bpmValue: Float32Array<SharedArrayBuffer> | undefined
  globalSampleCount: Int32Array<SharedArrayBuffer> | undefined
  sequences: string[]
  miniSourceMaps: (Map<number, SourceLocation> | undefined)[]
  miniRefs: MiniSequenceRef[]
  timelineLabels: TimelineLabel[]
  dspSource: string
  showWidgets: boolean
  isPlaying: boolean
  resetKey?: string | number | null
}

export function usePianorollWidget({
  audioContext,
  bpmValue,
  globalSampleCount,
  sequences,
  miniSourceMaps,
  miniRefs,
  timelineLabels,
  dspSource,
  showWidgets,
  isPlaying,
  resetKey,
}: UsePianorollParams): { widgets: EditorWidget[]; onBeforeDraw: () => void } {
  const pianorollStateRef = useRef<Map<number, PianorollState>>(new Map())
  const predictedSampleCountRef = useRef<number | null>(null)
  const lastWallTimeRef = useRef<number | null>(null)
  const isFirstFrameRef = useRef(true)

  const theme = useTheme()

  useEffect(() => {
    pianorollStateRef.current.clear()
    predictedSampleCountRef.current = null
    lastWallTimeRef.current = null
    isFirstFrameRef.current = true
  }, [resetKey])

  const onBeforeDraw = useCallback(() => {
    if (!showWidgets) return
    const visualWasm = useEngineRuntimeStore.getState().visualWasm
    if (!visualWasm) return

    const pred = updatePredictedSampleCount(audioContext, globalSampleCount, {
      predictedSampleCountRef,
      lastWallTimeRef,
      isFirstFrameRef,
    }, { isPlaying })
    if (!pred) return
    const { sampleRate, sampleCount, timeSeconds } = pred

    const seenSeqs = new Set<number>()
    for (const ref of miniRefs) {
      const seqIndex = ref.seqIndex
      if (seenSeqs.has(seqIndex)) continue
      seenSeqs.add(seqIndex)
      const map = miniSourceMaps[seqIndex]
      if (!map) continue

      const seq = sequences[seqIndex]
      if (!seq) continue

      const st = pianorollStateRef.current.get(seqIndex) ?? {
        timeSeconds: null,
        sampleCount: 0,
        notes: [],
        isInitial: true,
        lastMinMidi: 54,
        lastMaxMidi: 66,
        ev: [],
        frameEv: [],
        activeMask: new Uint8Array(128),
        activeList: [],
      }

      if (st.timeSeconds == null) {
        st.timeSeconds = timeSeconds
        st.sampleCount = sampleCount
      }
      else {
        st.timeSeconds = applySmoothing(st.timeSeconds, timeSeconds)
        st.sampleCount = Math.round(applySmoothing(st.sampleCount, sampleCount, 100 * sampleRate))
      }

      const bpm = bpmValue?.[0] || 60
      const barLengthSeconds = (4 * 60) / bpm
      const windowStartTime = st.timeSeconds - PAST_BARS * barLengthSeconds
      const windowEndTime = st.timeSeconds + FUTURE_BARS * barLengthSeconds
      const windowStartSample = Math.max(0, Math.floor(windowStartTime * sampleRate))
      const windowEndSample = Math.max(windowStartSample + 1, Math.floor(windowEndTime * sampleRate))

      const historyRaw = visualWasm.generateMiniHistoryWindow({
        seqIndex,
        seq,
        windowStartSample,
        windowEndSample,
        bpm,
        sampleRate,
      })

      const activeMask = st.activeMask
      activeMask.fill(0)
      const activeList = st.activeList
      activeList.length = 0

      let minMidi = 128
      let maxMidi = -1

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

      st.frameEv = ev

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
  }, [showWidgets, audioContext, bpmValue, globalSampleCount, isPlaying, sequences, miniRefs, miniSourceMaps])

  const drawPianoroll = useCallback((
    c: CanvasRenderingContext2D,
    seqIndex: number,
    widgetY: number,
    widgetHeight: number,
    viewX: number,
    viewWidth: number,
    seqColor?: string,
  ) => {
    if (!audioContext || !bpmValue) return
    const st = pianorollStateRef.current.get(seqIndex)
    if (!st || st.timeSeconds == null) return
    const baseColor = seqColor ?? theme.colors.argument

    const x = viewX
    const h = Math.max(40, widgetHeight)
    const w = viewWidth

    c.save()
    c.translate(x, 0)

    const NOTE_WIDTH = Math.max(1, w - PIANOROLL_KEY_WIDTH)
    const bpm = bpmValue[0] || 60
    const barLengthSeconds = (4 * 60) / bpm
    const windowLengthSeconds = TIME_WINDOW_BARS * barLengthSeconds
    const PIXELS_PER_SECOND = NOTE_WIDTH / windowLengthSeconds

    const sampleRate = audioContext.sampleRate

    const windowStartTime = st.timeSeconds - PAST_BARS * barLengthSeconds
    const windowEndTime = st.timeSeconds + FUTURE_BARS * barLengthSeconds
    const displayMinMidi = st.isInitial ? 54 : st.lastMinMidi
    const displayMaxMidi = st.isInitial ? 66 : st.lastMaxMidi

    const displayRange = displayMaxMidi - displayMinMidi + 1
    const keyHeight = h / displayRange

    const cycleLengthSeconds = 60 / bpm
    const currentTimeX = PAST_BARS * barLengthSeconds * PIXELS_PER_SECOND

    c.save()
    c.translate(0, widgetY)
    c.beginPath()
    c.rect(0, -10, w, h + 20)
    c.clip()

    // c.fillStyle = 'rgba(0, 0, 0, 0.35)'
    // c.fillRect(0, 0, w, h)

    // Draw keys on the left
    c.save()
    c.beginPath()
    c.rect(0, -10, PIANOROLL_KEY_WIDTH, h + 20)
    c.clip()

    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight
      const isBlack = MIDI_IS_BLACK[midi] === 1

      c.fillStyle = isBlack ? 'rgba(30, 30, 30, 0.5)' : 'rgba(75, 75, 75, 0.3)'
      c.fillRect(0, y, PIANOROLL_KEY_WIDTH, keyHeight)

      // Only draw the thin horizontal separator when keys are tall enough,
      // but always draw it for octave keys to keep octave visual anchors.
      const isOctave = MIDI_IS_OCTAVE[midi] === 1
      const isEF = MIDI_IS_EF[midi] === 1
      const isNarrow = keyHeight < 4
      const shouldDrawSeparator = isOctave || (isEF && !isNarrow)
      if (shouldDrawSeparator) {
        c.strokeStyle = isOctave ? 'rgba(100, 100, 100, 0.4)' : 'rgba(0,0,0, 0.2)'
        c.lineWidth = 1
        c.beginPath()
        c.moveTo(0, y + keyHeight)
        c.lineTo(PIANOROLL_KEY_WIDTH, y + keyHeight)
        c.stroke()
      }
    }

    // Draw active key fill inside left-hand keys area
    for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
      const keyIndex = displayMaxMidi - midi
      const y = keyIndex * keyHeight
      const isBlack = MIDI_IS_BLACK[midi] === 1
      const isOctave = MIDI_IS_OCTAVE[midi] === 1
      const isActive = st.activeMask[midi] === 1

      if (isActive) c.fillStyle = 'rgba(255, 220, 0, 1.0)'
      else if (isOctave) c.fillStyle = 'rgba(255, 255, 255, 1.0)'
      else if (isBlack) c.fillStyle = 'rgba(0, 0, 0, 1.0)'
      else c.fillStyle = 'rgba(150, 150, 150, 1.0)'
      c.fillRect(0, y, PIANOROLL_KEY_WIDTH, keyHeight)
    }

    // Key labels on left
    if (keyHeight > 6) {
      c.font = '6pt Outfit'
      c.textAlign = 'center'
      c.textBaseline = 'middle'
      for (let midi = displayMinMidi; midi <= displayMaxMidi; midi += 1) {
        const keyIndex = displayMaxMidi - midi
        const y = keyIndex * keyHeight + keyHeight / 2
        const isBlack = MIDI_IS_BLACK[midi] === 1
        const isActive = st.activeMask[midi] === 1
        c.fillStyle = (isBlack && !isActive) ? 'rgba(255, 255, 255, 1.0)' : 'rgba(0, 0, 0, 1.0)'
        c.fillText(MIDI_LABELS[midi]!, PIANOROLL_KEY_WIDTH / 2, y + 0.5)
      }
    }

    c.restore()

    // Translate into the note area (to the right of the keys) and clip it
    c.save()
    c.translate(PIANOROLL_KEY_WIDTH, 0)
    c.beginPath()
    c.rect(0, -10, NOTE_WIDTH, h + 20)
    c.clip()

    // for (let midi = displayMinMidi; midi <= displayMaxMidi; midi++) {
    //   const keyIndex = displayMaxMidi - midi
    //   const y = keyIndex * keyHeight
    //   const isBlack = MIDI_IS_BLACK[midi] === 1

    //   c.fillStyle = isBlack ? 'rgba(30, 30, 30, 0.5)' : 'rgba(75, 75, 75, 0.3)'
    //   c.fillRect(0, y, NOTE_WIDTH, keyHeight)

    //   // Draw thin horizontal separators similar to the left keys area
    //   const isOctave = MIDI_IS_OCTAVE[midi] === 1
    //   const isEF = MIDI_IS_EF[midi] === 1
    //   const isNarrow = keyHeight < 4
    //   const shouldDrawSeparator = isOctave || (isEF && !isNarrow)
    //   if (shouldDrawSeparator) {
    //     c.strokeStyle = isOctave ? 'rgba(100, 100, 100, 0.4)' : 'rgba(0,0,0, 0.2)'
    //     c.lineWidth = 1
    //     c.beginPath()
    //     c.moveTo(0, y + keyHeight)
    //     c.lineTo(NOTE_WIDTH, y + keyHeight)
    //     c.stroke()
    //   }
    // }

    const firstBarStart = Math.floor(windowStartTime / barLengthSeconds) * barLengthSeconds
    for (let barStart = firstBarStart; barStart < windowEndTime; barStart += barLengthSeconds) {
      const barIndex = Math.floor(barStart / barLengthSeconds)
      const isEvenBar = barIndex % 2 === 0
      const barX = (barStart - windowStartTime) * PIXELS_PER_SECOND
      const barWidth = barLengthSeconds * PIXELS_PER_SECOND
      c.fillStyle = isEvenBar ? 'rgba(255, 255, 255, 0.09)' : 'rgba(255, 255, 255, 0.12)'
      c.fillRect(barX, 0, barWidth, h)
    }

    const firstCycleStart = Math.floor(windowStartTime / cycleLengthSeconds) * cycleLengthSeconds
    for (let cycleStart = firstCycleStart; cycleStart < windowEndTime; cycleStart += cycleLengthSeconds) {
      const cycleX = (cycleStart - windowStartTime) * PIXELS_PER_SECOND
      c.strokeStyle = 'rgba(0, 0, 0, 1.0)'
      c.lineWidth = 0.25
      c.beginPath()
      c.moveTo(cycleX, 0)
      c.lineTo(cycleX, h)
      c.stroke()
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

      let fillStyle = ''
      let strokeBright = ''
      let strokeDark = ''
      if (isActive) {
        fillStyle = '#ff0f'
        strokeBright = '#ffff'
        strokeDark = '#cc0f'
      }
      else {
        fillStyle = baseColor
        // strokeBright = luminate(baseColor, .1)
        // strokeDark = luminate(baseColor, -.1)
      }
      const ex = x + 0.5
      const ew = Math.max(2, eventWidth) - 1
      const ey = y + 0.5
      const eh = keyHeight - 1

      c.globalAlpha = velocity * 0.9 + 0.1

      c.fillStyle = fillStyle
      c.fillRect(ex, ey, ew, eh)
      // c.lineCap = 'square'

      // c.lineWidth = 0.5

      // c.beginPath()
      // c.moveTo(ex + ew, ey)
      // c.lineTo(ex + ew, ey + eh)
      // c.strokeStyle = strokeDark
      // c.stroke()

      // c.beginPath()
      // c.moveTo(ex, ey + eh)
      // c.lineTo(ex, ey)
      // c.lineTo(ex + ew, ey)
      // c.strokeStyle = strokeBright
      // c.stroke()

      // c.beginPath()
      // c.moveTo(ex, ey + eh)
      // c.lineTo(ex + ew, ey + eh)
      // c.strokeStyle = strokeDark
      // c.stroke()

      c.globalAlpha = 1.0
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

    c.strokeStyle = 'rgba(255, 255, 0, 0.8)'
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(currentTimeX, 0)
    c.lineTo(currentTimeX, h)
    c.stroke()

    // Find last label before current time
    let playheadColor = 'rgba(255, 255, 0, 0.8)'
    if (timelineLabels.length > 0) {
      for (let i = 0; i < timelineLabels.length; i++) {
        const label = timelineLabels[i]
        const labelSeconds = (label.bar - 1) * barLengthSeconds
        if (labelSeconds <= st.timeSeconds) {
          playheadColor = label.color || 'rgba(255, 255, 0, 0.8)'
        }
      }
    }
    c.strokeStyle = playheadColor
    c.lineWidth = 2
    c.beginPath()
    c.moveTo(currentTimeX, 0)
    c.lineTo(currentTimeX, h)
    c.stroke()

    // c.font = '6pt Outfit'
    // c.textAlign = 'right'
    // c.textBaseline = 'middle'
    // for (const n of st.notes) {
    //   const x = currentTimeX - 15
    //   const y = n.y - 0.35
    //   c.fillStyle = `rgba(0,0,0, ${n.fade * 0.5})`
    //   c.fillText(n.noteText, x + 1, y + 1)
    //   c.fillStyle = `rgba(255, 255, 0, ${n.fade})`
    //   c.fillText(n.noteText, x, y)
    // }

    c.restore()
    c.restore()
    // restore the initial context saved before translating by x
    c.restore()
  }, [audioContext, bpmValue, timelineLabels, theme.colors.argument])

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
        height: 40,
        render: (ctx, _x, y, _w, h, vx, vw) => {
          drawPianoroll(ctx, ref.seqIndex, y, h, vx, vw, ref.color)
        },
      })
    }

    return out
  }, [showWidgets, miniSourceMaps, miniRefs, dspSource, drawPianoroll])

  return { widgets, onBeforeDraw }
}
