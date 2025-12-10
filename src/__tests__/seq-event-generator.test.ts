import { describe, expect, it } from 'bun:test'
import {
  expectEventAtTime,
  expectEventCount,
  expectEventHoldTime,
  expectEventInCycle,
  freqToNote,
  getUniqueNotes,
  noteToFreq,
} from '../test-utils/sequence-test.ts'
import { generateSequenceEvents } from '../seq-event-generator.ts'
import { compileSequence } from '../sequence-compiler.ts'

interface SequenceEvent {
  cycle: number
  sample: number
  voice: number
  value: number
  velocity: number
  trig: number
  hold: number
}

async function executeSequenceGenerator(
  sequenceString: string,
  options: {
    bpm?: number
    sampleRate?: number
    totalCycles?: number
    seed?: number
  } = {},
): Promise<{ events: SequenceEvent[]; totalCycles: number; totalSamples: number }> {
  const { bpm = 60, sampleRate = 44100, totalCycles = 1, seed = 1234567890 } = options

  const compiled = compileSequence(sequenceString)
  const bytecode = new Float32Array(compiled.bytecode.buffer)

  const secondsPerBeat = 60.0 / bpm
  const cycleDurationSeconds = secondsPerBeat
  const totalSamples = Math.ceil(totalCycles * cycleDurationSeconds * sampleRate)

  // Generate events from sample 0 to totalSamples
  const scheduledEvents = generateSequenceEvents(
    bytecode,
    0,
    totalSamples,
    sampleRate,
    bpm,
    seed,
  )

  // Convert ScheduledEvent to SequenceEvent format
  const events: SequenceEvent[] = scheduledEvents.map((e, index) => {
    const cycle = e.startSample / (cycleDurationSeconds * sampleRate)
    const holdTime = (e.endSample - e.startSample) / sampleRate
    return {
      cycle,
      sample: e.startSample,
      voice: index % 16, // Simple voice assignment (not accurate but for testing)
      value: e.value,
      velocity: e.velocity,
      trig: 1, // Events are trigger onsets
      hold: holdTime,
    }
  })

  // Filter events to only include those within the specified number of cycles
  const cycleDurationSamples = cycleDurationSeconds * sampleRate
  const filteredEvents = events.filter((event) => {
    const eventCycle = event.sample / cycleDurationSamples
    return eventCycle < totalCycles
  })

  return {
    events: filteredEvents,
    totalCycles,
    totalSamples,
  }
}

describe('Sequence Event Generator', () => {
  it('c4', async () => {
    const result = await executeSequenceGenerator('c4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expectEventAtTime(result.events, 'C4', 0)
    expectEventHoldTime(result.events, 'C4', 0)
  })

  it('c4 e4', async () => {
    const result = await executeSequenceGenerator('c4 e4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.5)
    expectEventInCycle(result.events, 'E4', 0.5)
  })

  it('c4 e4 g4', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)
    expectEventAtTime(result.events, 'G4', 0.667)
  })

  it('c4 e4 g4 a4', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4 a4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.25)
    expectEventAtTime(result.events, 'G4', 0.5)
    expectEventAtTime(result.events, 'A4', 0.75)
  })

  it('c4 e4 [g4 a4]', async () => {
    const result = await executeSequenceGenerator('c4 e4 [g4 a4]')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)
    expectEventAtTime(result.events, 'G4', 0.667)
    expectEventAtTime(result.events, 'A4', 0.833)
  })

  it('c4 e4 g4*2', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4*2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    expectEventCount(result.events, 'G4', 2)

    expectEventAtTime(result.events, 'G4', 0.667, 0)
    expectEventAtTime(result.events, 'G4', 0.833, 1)
  })

  it('c4 e4 [g4 a4]*2', async () => {
    const result = await executeSequenceGenerator('c4 e4 [g4 a4]*2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    expectEventCount(result.events, 'G4', 2)
    expectEventCount(result.events, 'A4', 2)

    expectEventAtTime(result.events, 'G4', 0.667, 0)
    expectEventAtTime(result.events, 'A4', 0.75, 0)
    expectEventAtTime(result.events, 'G4', 0.833, 1)
    expectEventAtTime(result.events, 'A4', 0.917, 1)
  })

  it('c4 e4 [g4 a4]!2', async () => {
    const result = await executeSequenceGenerator('c4 e4 [g4 a4]!2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.25)

    expectEventCount(result.events, 'G4', 2)
    expectEventCount(result.events, 'A4', 2)

    expectEventAtTime(result.events, 'G4', 0.5, 0)
    expectEventAtTime(result.events, 'A4', 0.625, 0)
    expectEventAtTime(result.events, 'G4', 0.75, 1)
    expectEventAtTime(result.events, 'A4', 0.875, 1)
  })

  it('c4 e4 g4/2', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4/2', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.333, 0)

    expectEventAtTime(result.events, 'C4', 1.0, 1)
    expectEventAtTime(result.events, 'E4', 1.333, 1)
    expectEventAtTime(result.events, 'G4', 1.667, 0)

    expectEventCount(result.events, 'G4', 1)
  })

  it('c4 e4 [g4 a4]/2', async () => {
    const result = await executeSequenceGenerator('c4 e4 [g4 a4]/2', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.333, 0)
    expectEventAtTime(result.events, 'G4', 0.667, 0)

    expectEventAtTime(result.events, 'C4', 1.0, 1)
    expectEventAtTime(result.events, 'E4', 1.333, 1)
    expectEventAtTime(result.events, 'A4', 1.667, 0)

    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 [e4 [g4 a4]]/2', async () => {
    const result = await executeSequenceGenerator('c4 [e4 [g4 a4]]/2', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.5, 0)

    expectEventAtTime(result.events, 'C4', 1.0, 1)
    expectEventAtTime(result.events, 'G4', 1.5, 0)
    expectEventAtTime(result.events, 'A4', 1.75, 0)

    expectEventCount(result.events, 'C4', 2)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 [e4 [g4 a4]]/3', async () => {
    const result = await executeSequenceGenerator('c4 [e4 [g4 a4]]/3', { totalCycles: 3 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.5, 0)

    expectEventAtTime(result.events, 'C4', 1.0, 1)
    expectEventAtTime(result.events, 'G4', 1.75, 0)

    expectEventAtTime(result.events, 'C4', 2.0, 2)
    expectEventAtTime(result.events, 'A4', 2.5, 0)

    expectEventCount(result.events, 'C4', 3)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 [e4 [g4 a4]]/4', async () => {
    const result = await executeSequenceGenerator('c4 [e4 [g4 a4]]/4', { totalCycles: 4 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.5, 0)

    expectEventAtTime(result.events, 'C4', 1.0, 1)

    expectEventAtTime(result.events, 'C4', 2.0, 2)
    expectEventAtTime(result.events, 'G4', 2.5, 0)

    expectEventAtTime(result.events, 'C4', 3.0, 3)
    expectEventAtTime(result.events, 'A4', 3.5, 0)

    expectEventCount(result.events, 'C4', 4)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 e4 g4@2', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4@2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.25, 0)
    expectEventAtTime(result.events, 'G4', 0.5, 0)

    expectEventCount(result.events, 'G4', 1)
  })

  it('c4 e4 [g4 a4]@2', async () => {
    const result = await executeSequenceGenerator('c4 e4 [g4 a4]@2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.25, 0)
    expectEventAtTime(result.events, 'G4', 0.5, 0)
    expectEventAtTime(result.events, 'A4', 0.75, 0)

    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 e4 g4!2', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4!2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.250)

    expectEventCount(result.events, 'G4', 2)

    expectEventAtTime(result.events, 'G4', 0.500, 0)
    expectEventAtTime(result.events, 'G4', 0.750, 1)
  })

  it('c4 e4 g4@2*2', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4@2*2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.25, 0)

    expectEventCount(result.events, 'G4', 2)

    expectEventAtTime(result.events, 'G4', 0.5, 0)
    expectEventAtTime(result.events, 'G4', 0.75, 1)
  })

  it('c4 e4 ~', async () => {
    const result = await executeSequenceGenerator('c4 e4 ~')
    const notes = getUniqueNotes(result.events)

    expect(notes.length).toBe(2)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    expect(result.events.length).toBe(2)
  })

  it('c4 e4 [~ g4]', async () => {
    const result = await executeSequenceGenerator('c4 e4 [~ g4]')
    const notes = getUniqueNotes(result.events)

    expect(notes.length).toBe(3)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)
    expectEventAtTime(result.events, 'G4', 0.833)

    expect(result.events.length).toBe(3)
  })

  it('c4 e4 <g4 a4>', async () => {
    const result = await executeSequenceGenerator('c4 e4 <g4 a4>', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)

    expect(notes.length).toBe(4)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    expectEventCount(result.events, 'C4', 2)
    expectEventCount(result.events, 'E4', 2)
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)

    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.333, 0)
    expectEventAtTime(result.events, 'G4', 0.667, 0)

    expectEventAtTime(result.events, 'C4', 1.0, 1)
    expectEventAtTime(result.events, 'E4', 1.333, 1)
    expectEventAtTime(result.events, 'A4', 1.667, 0)
  })

  it('c4.5', async () => {
    const result = await executeSequenceGenerator('c4.5')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    expectEventCount(result.events, 'C4', 1)
    expectEventAtTime(result.events, 'C4', 0)

    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    expect(c4Events[0]!.velocity).toBe(0.5)
  })

  it('c4;.1', async () => {
    const result = await executeSequenceGenerator('c4;.1')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    expectEventCount(result.events, 'C4', 1)
    expectEventAtTime(result.events, 'C4', 0)

    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    expect(c4Events[0]!.hold).toBeCloseTo(0.1, 2)
  })

  it('c4;.03 e4 g4', async () => {
    const result = await executeSequenceGenerator('c4;.03 e4 g4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)

    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    const c4Event = c4Events[0]!
    expect(c4Event.hold).toBeCloseTo(0.01, 2)
  })

  it('c4 e4 g4;.6', async () => {
    const result = await executeSequenceGenerator('c4 e4 g4;.6', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    const g4Events = result.events.filter(e => freqToNote(e.value) === 'G4')
    expect(g4Events.length).toBe(2)

    expectEventAtTime(result.events, 'G4', 0.667, 0)
    expectEventAtTime(result.events, 'G4', 1.667, 1)

    const g4Event = g4Events[0]!
    expect(g4Event.hold).toBeCloseTo(0.2, 1)
  })

  it('c4e4g4', async () => {
    const result = await executeSequenceGenerator('c4e4g4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0)
    expectEventAtTime(result.events, 'G4', 0)

    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)
  })

  it('c4e4g4$.1', async () => {
    const result = await executeSequenceGenerator('c4e4g4$.1')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.1)
    expectEventAtTime(result.events, 'G4', 0.2)

    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)
  })

  it('c4e4g4;.1', async () => {
    const result = await executeSequenceGenerator('c4e4g4;.1')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    const e4Events = result.events.filter(e => freqToNote(e.value) === 'E4')
    const g4Events = result.events.filter(e => freqToNote(e.value) === 'G4')

    expect(c4Events.length).toBe(1)
    expect(e4Events.length).toBe(1)
    expect(g4Events.length).toBe(1)

    expect(c4Events[0]!.hold).toBeCloseTo(0.1, 2)
    expect(e4Events[0]!.hold).toBeCloseTo(0.1, 2)
    expect(g4Events[0]!.hold).toBeCloseTo(0.1, 2)
  })

  it('c4e4g4$.1;.1', async () => {
    const result = await executeSequenceGenerator('c4e4g4$.1;.1')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.1)
    expectEventAtTime(result.events, 'G4', 0.2)

    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    const e4Events = result.events.filter(e => freqToNote(e.value) === 'E4')
    const g4Events = result.events.filter(e => freqToNote(e.value) === 'G4')

    expect(c4Events[0]!.hold).toBeCloseTo(0.1, 2)
    expect(e4Events[0]!.hold).toBeCloseTo(0.1, 2)
    expect(g4Events[0]!.hold).toBeCloseTo(0.1, 2)
  })
})

