import { describe, expect, it } from 'bun:test'
import {
  executeSequence,
  expectEventAtTime,
  expectEventInCycle,
  getUniqueNotes,
} from '../test-utils/sequence-test.ts'

describe('Sequence Execution', () => {
  it('should play single note', async () => {
    const result = await executeSequence('c4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expectEventAtTime(result.events, 'C4', 0)
  })

  it('should play multiple notes', async () => {
    const result = await executeSequence('c4 e4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.5)
    expectEventInCycle(result.events, 'E4', 0.5)
  })

  it('should play three notes', async () => {
    const result = await executeSequence('c4 e4 g4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)
    expectEventAtTime(result.events, 'G4', 0.667)
  })

  it('should play four notes', async () => {
    const result = await executeSequence('c4 e4 g4 a4')
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
})
