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
  hold: number // Hold time in seconds
}

export interface SequenceTestResult {
  events: SequenceEvent[]
  totalCycles: number
  totalSamples: number
}

export interface VelocitySample {
  sample: number
  time: number
  velocity: number
  trig: number
  value: number
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
    seed?: number
  } = {},
): Promise<SequenceTestResult> {
  const { bpm = 60, sampleRate = 44100, totalCycles = 1, seed = 1234567890 } = options
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
  // Set seed after reset (reset sets seed to default, so we override it)
  if (core.wasm.debugSeqSetSeed) {
    core.wasm.debugSeqSetSeed(seq$, seed)
  }

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
  const prevTrig = new Float32Array(SEQ_VOICES) // Track previous trigger for each voice

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

        // Detect trigger onset (trig goes from 0 to 1)
        // For sample 0, treat any high trigger as an onset (no previous sample to compare)
        const isTriggerOnset = sample === 0
          ? trig > 0.5
          : trig > 0.5 && prevTrig[v] <= 0.5
        prevTrig[v] = trig

        if (isTriggerOnset && value > 0) {
          events.push({
            cycle,
            sample,
            voice: v,
            value,
            velocity,
            trig,
            hold: 0, // Will be filled from history
          })
        }
      }
    }
  }

  // Read event history to get hold times
  // Read from the most recent entries (history is a ring buffer)
  const historyWritePos = Math.floor(sequenceArray[1]) || 0
  const historySize = Math.floor(sequenceArray[2]) || SEQ_HISTORY_SIZE
  const historyEntries: Array<{ startSample: number; endSample: number; bytecodePos: number }> = []

  // Read history entries using the same formula as debug-seq.ts
  for (let i = 0; i < historySize; i++) {
    const idx = ((historyWritePos - historySize + i + historySize) % historySize) * 3 + 3
    const bytecodePos = Math.floor(sequenceArray[idx])
    const startSample = Math.floor(sequenceArray[idx + 1])
    const endSample = Math.floor(sequenceArray[idx + 2])

    // Skip invalid entries
    if (startSample === 0 && endSample === 0) continue

    historyEntries.push({ startSample, endSample, bytecodePos })
  }

  // Match events to history entries and calculate hold time
  // Use tolerance to match events (within 500 samples to account for processing delays and chunk boundaries)
  const toleranceSamples = 500
  const usedEntries = new Set<number>() // Track which history entries we've used

  // Filter events to only include those within the specified number of cycles
  const cycleDurationSamples = cycleDurationSeconds * sampleRate
  const filteredEvents = events.filter((event) => {
    const eventCycle = event.sample / cycleDurationSamples
    return eventCycle < totalCycles
  })

  // Sort events by sample time to match in order
  const sortedEvents = [...filteredEvents].sort((a, b) => a.sample - b.sample)

  for (const event of sortedEvents) {
    // Find the closest unused history entry by startSample
    let bestMatch: { startSample: number; endSample: number; index: number } | null = null
    let bestDistance = Infinity

    for (let i = 0; i < historyEntries.length; i++) {
      if (usedEntries.has(i)) continue

      const entry = historyEntries[i]
      const distance = Math.abs(entry.startSample - event.sample)
      if (distance < toleranceSamples && distance < bestDistance) {
        bestDistance = distance
        bestMatch = { ...entry, index: i }
      }
    }

    if (bestMatch) {
      // Calculate hold time from history entry: (endSample - startSample) / sampleRate
      const holdTime = (bestMatch.endSample - bestMatch.startSample) / sampleRate
      event.hold = holdTime
      usedEntries.add(bestMatch.index)
    }
  }

  return {
    events: filteredEvents,
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
  eventIndex?: number,
  tolerance: number = 0.01,
) {
  const noteEvents = getEventsByNote(events, note)
  expect(noteEvents.length).toBeGreaterThan(eventIndex ?? 0)
  const event = noteEvents[eventIndex ?? 0]!
  const time = event.sample / 44100
  if (Math.abs(time - expectedTime) >= tolerance) {
    throw new Error(
      `Expected time ${expectedTime} for note ${note} at index ${eventIndex ?? 0}, but got: ${time}`,
    )
  }
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

export function expectEventHoldTime(
  events: SequenceEvent[],
  note: string,
  expectedHold: number,
  eventIndex?: number,
  tolerance: number = 0.01,
) {
  const noteEvents = getEventsByNote(events, note)
  expect(noteEvents.length).toBeGreaterThan(0)

  if (eventIndex !== undefined) {
    // Check specific event by index
    expect(noteEvents.length).toBeGreaterThan(eventIndex)
    const event = noteEvents[eventIndex]!
    if (Math.abs(event.hold - expectedHold) >= tolerance) {
      throw new Error(
        `Expected hold time ${expectedHold} for note ${note} at index ${eventIndex}, but got: ${event.hold}`,
      )
    }
    expect(event.hold).toBeCloseTo(expectedHold, 2)
  }
  else {
    // Check if any event for this note has the expected hold time
    const hasMatch = noteEvents.some((event) => {
      return Math.abs(event.hold - expectedHold) < tolerance
    })
    if (!hasMatch) {
      // Debug: show actual hold times
      const actualHolds = noteEvents.map(e => e.hold).filter((v, i, arr) => arr.indexOf(v) === i)
      throw new Error(
        `Expected hold time ${expectedHold} for note ${note}, but got: ${actualHolds.join(', ')}`,
      )
    }
    expect(hasMatch).toBe(true)
  }
}

export function expectEventCount(
  events: SequenceEvent[],
  note: string,
  expectedCount: number,
) {
  const noteEvents = getEventsByNote(events, note)
  expect(noteEvents.length).toBe(expectedCount)
}

export async function getVelocitySamples(
  sequenceString: string,
  voice: number,
  startTime: number,
  endTime: number,
  options: {
    bpm?: number
    sampleRate?: number
    totalCycles?: number
  } = {},
): Promise<VelocitySample[]> {
  const { bpm = 60, sampleRate = 44100 } = options
  const { core, program$, arrays$ } = await getSharedProgram()

  core.wasm.bpm.value = bpm
  core.wasm.sampleRate.value = sampleRate
  core.wasm.globalSampleCount.value = 0

  const program = ProgramStruct(core.memory.buffer, program$)
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

  const secondsPerBeat = 60.0 / bpm
  const cycleDurationSeconds = secondsPerBeat
  const { totalCycles = 1 } = options
  const startSample = Math.floor(startTime * sampleRate)
  const endSample = Math.ceil(endTime * sampleRate)
  const totalSamples = Math.ceil(totalCycles * cycleDurationSeconds * sampleRate)
  const totalChunks = Math.ceil(totalSamples / CHUNK_LENGTH)

  const samples: VelocitySample[] = []

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
      if (sample < startSample || sample >= endSample) continue

      const time = sample / sampleRate
      const velocity = outVelocity[voice * CHUNK_LENGTH + i]
      const trig = outTrig[voice * CHUNK_LENGTH + i]
      const value = outValue[voice * CHUNK_LENGTH + i]

      samples.push({
        sample,
        time,
        velocity,
        trig,
        value,
      })
    }
  }

  return samples
}
