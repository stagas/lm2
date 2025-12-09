import { expect } from 'bun:test'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  ARRAY_HEADER_SIZE,
  ARRAY_SIZE,
  ARRAYS_COUNT,
  CHUNK_SIZE,
  SEQ_HISTORY_SIZE,
  SEQ_VOICES,
} from '../../as/assembly/constants.ts'
import type * as WasmExports from '../../as/build/index.d.ts'
import config from '../../asconfig.json'
import { DspStruct, OutsPoolStruct, ProgramDataStruct, ProgramStruct } from '../assembly.ts'
import { wasmSetup } from '../lib/wasm-setup.ts'
import { compileSequence } from '../sequence-compiler.ts'

export interface SequenceEvent {
  cycle: number
  sample: number
  voice: number
  value: number
  velocity: number
  trig: number
}

export interface SequenceTestResult {
  events: SequenceEvent[]
  totalCycles: number
  totalSamples: number
}

let wasmCore: Awaited<ReturnType<typeof wasmSetup<typeof WasmExports>>> | null = null
let sharedProgram$: number | null = null
let sharedArrays$: number[] | null = null

async function getWasmCore() {
  if (wasmCore) return wasmCore

  const wasmPath = join(process.cwd(), 'as/build/index.wasm')
  const wasmBinary = readFileSync(wasmPath)
  const sourcemapUrl = join(process.cwd(), 'as/build/index.wasm.map')

  wasmCore = await wasmSetup<typeof WasmExports>({
    binary: wasmBinary.buffer,
    sourcemapUrl,
    config,
  })

  return wasmCore
}

async function getSharedProgram() {
  const core = await getWasmCore()
  if (sharedProgram$ === null) {
    sharedProgram$ = core.wasm.createProgram()
    const program = ProgramStruct(core.memory.buffer, sharedProgram$)
    const programData = ProgramDataStruct(core.memory.buffer, program.data)
    const arrays = new Uint32Array(core.memory.buffer, programData.arrays, ARRAYS_COUNT)
    sharedArrays$ = Array.from({ length: ARRAYS_COUNT }, () => core.wasm.createArray())
    for (let i = 0; i < ARRAYS_COUNT; i++) {
      arrays[i] = sharedArrays$[i]
    }
  }
  return { core, program$: sharedProgram$, arrays$: sharedArrays$! }
}

export async function executeSequence(
  sequenceString: string,
  options: {
    bpm?: number
    sampleRate?: number
    totalCycles?: number
  } = {},
): Promise<SequenceTestResult> {
  const { bpm = 60, sampleRate = 44100, totalCycles = 1 } = options
  const { core, program$, arrays$ } = await getSharedProgram()

  core.wasm.bpm.value = bpm
  core.wasm.sampleRate.value = sampleRate
  core.wasm.globalSampleCount.value = 0

  const program = ProgramStruct(core.memory.buffer, program$)
  const outsPool = OutsPoolStruct(core.memory.buffer, program.outsPool)
  const programData = ProgramDataStruct(core.memory.buffer, program.data)
  const arrays = new Uint32Array(core.memory.buffer, programData.arrays, ARRAYS_COUNT)

  const sequenceArray$ = arrays$[1]
  const sequenceArray = new Float32Array(
    core.memory.buffer,
    sequenceArray$,
    ARRAY_SIZE + ARRAY_HEADER_SIZE,
  )

  const compiled = compileSequence(sequenceString)
  sequenceArray.set(compiled.bytecode.buffer)

  const seq$ = core.wasm.createSeq()
  core.wasm.debugSeqReset(seq$)

  const CHUNK_LENGTH = CHUNK_SIZE
  const outTrig$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH * SEQ_VOICES)
  const outVelocity$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH * SEQ_VOICES)
  const outValue$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH * SEQ_VOICES)
  const outVoiceCount$ = core.wasm.createFloat32Buffer(CHUNK_LENGTH)

  const outTrig = new Float32Array(core.memory.buffer, outTrig$, CHUNK_LENGTH * SEQ_VOICES)
  const outVelocity = new Float32Array(
    core.memory.buffer,
    outVelocity$,
    CHUNK_LENGTH * SEQ_VOICES,
  )
  const outValue = new Float32Array(core.memory.buffer, outValue$, CHUNK_LENGTH * SEQ_VOICES)
  const outVoiceCount = new Float32Array(core.memory.buffer, outVoiceCount$, CHUNK_LENGTH)

  const secondsPerBeat = 60.0 / bpm
  const cycleDurationSeconds = secondsPerBeat
  const totalSamples = Math.ceil(totalCycles * cycleDurationSeconds * sampleRate)
  const totalChunks = Math.ceil(totalSamples / CHUNK_LENGTH)

  const events: SequenceEvent[] = []

  for (let chunk = 0; chunk < totalChunks; chunk++) {
    const currentSample = chunk * CHUNK_LENGTH
    core.wasm.globalSampleCount.value = currentSample

    core.wasm.debugSeqProcess(
      seq$,
      sequenceArray$,
      outTrig$,
      outVelocity$,
      outValue$,
      outVoiceCount$,
      CHUNK_LENGTH,
    )

    for (let i = 0; i < CHUNK_LENGTH; i++) {
      const sample = currentSample + i
      const cycle = sample / (cycleDurationSeconds * sampleRate)

      for (let v = 0; v < SEQ_VOICES; v++) {
        // Output is in planar format: all samples for voice 0, then voice 1, etc.
        const trig = outTrig[v * CHUNK_LENGTH + i]
        const value = outValue[v * CHUNK_LENGTH + i]
        const velocity = outVelocity[v * CHUNK_LENGTH + i]

        const prevTrig = i > 0 ? outTrig[v * CHUNK_LENGTH + i - 1] : 0
        const isTriggerOnset = trig > 0.5 && prevTrig <= 0.5

        if (isTriggerOnset && value > 0) {
          events.push({
            cycle,
            sample,
            voice: v,
            value,
            velocity,
            trig,
          })
        }
      }
    }
  }

  return {
    events,
    totalCycles,
    totalSamples,
  }
}

export function freqToNote(freq: number): string {
  if (freq === 0) return '~'
  const A4 = 440
  const A4_MIDI = 69
  const semitones = 12 * Math.log2(freq / A4)
  const midi = Math.round(A4_MIDI + semitones)
  const octave = Math.floor(midi / 12) - 1
  const noteIndex = midi % 12
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return `${notes[noteIndex]}${octave}`
}

export function noteToFreq(note: string): number {
  const A4 = 440
  const match = note.match(/^([a-g])([#b]?)(-?\d+)$/i)
  if (!match) throw new Error(`Invalid note: ${note}`)

  const [, noteName, accidental, octave] = match
  const NOTE_OFFSETS: Record<string, number> = {
    c: 0,
    d: 2,
    e: 4,
    f: 5,
    g: 7,
    a: 9,
    b: 11,
  }

  let midi = NOTE_OFFSETS[noteName.toLowerCase()] + (parseInt(octave) + 1) * 12

  if (accidental === '#') midi += 1
  else if (accidental === 'b') midi -= 1

  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function getEventNotes(events: SequenceEvent[]): string[] {
  const values = events.map((e) => e.value).filter((v) => v > 0)
  return values.map(freqToNote)
}

export function getUniqueNotes(events: SequenceEvent[]): string[] {
  const notes = getEventNotes(events)
  return [...new Set(notes)]
}

export function getEventsByNote(events: SequenceEvent[], note: string): SequenceEvent[] {
  return events.filter((e) => freqToNote(e.value) === note)
}

export function expectEventAtTime(
  events: SequenceEvent[],
  note: string,
  expectedTime: number,
  tolerance: number = 0.01,
) {
  const noteEvents = getEventsByNote(events, note)
  expect(noteEvents.length).toBeGreaterThan(0)
  const event = noteEvents[0]!
  const time = event.sample / 44100
  expect(time).toBeCloseTo(expectedTime, 2)
  expect(event.cycle).toBeCloseTo(expectedTime, 2)
}

export function expectEventInCycle(
  events: SequenceEvent[],
  note: string,
  expectedCycle: number,
  tolerance: number = 0.01,
) {
  const noteEvents = getEventsByNote(events, note)
  expect(noteEvents.length).toBeGreaterThan(0)
  const event = noteEvents[0]!
  expect(event.cycle).toBeCloseTo(expectedCycle, 2)
}
