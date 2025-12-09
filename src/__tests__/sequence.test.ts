import { describe, expect, it } from 'bun:test'
import {
  executeSequence,
  expectEventAtTime,
  expectEventCount,
  expectEventHoldTime,
  expectEventInCycle,
  freqToNote,
  getUniqueNotes,
  getVelocitySamples,
  noteToFreq,
} from '../test-utils/sequence-test.ts'

describe('Sequences', () => {
  it('c4', async () => {
    const result = await executeSequence('c4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expectEventAtTime(result.events, 'C4', 0)
    // Hold time is 0 since voices stay active until replaced
    expectEventHoldTime(result.events, 'C4', 0)
  })

  it('c4 e4', async () => {
    const result = await executeSequence('c4 e4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.5)
    expectEventInCycle(result.events, 'E4', 0.5)
  })

  it('c4 e4 g4', async () => {
    const result = await executeSequence('c4 e4 g4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)
    expectEventAtTime(result.events, 'G4', 0.667)
  })

  it('c4 e4 g4 a4', async () => {
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

  it('c4 e4 [g4 a4]', async () => {
    const result = await executeSequence('c4 e4 [g4 a4]')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    // For 'c4 e4 [g4 a4]', the root cycle has 3 slots: c4, e4, [g4 a4]
    // The subdivision [g4 a4] plays both notes within its slot
    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)
    expectEventAtTime(result.events, 'G4', 0.667)
    expectEventAtTime(result.events, 'A4', 0.833)
  })

  it('c4 e4 g4*2', async () => {
    const result = await executeSequence('c4 e4 g4*2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // For 'c4 e4 g4*2', it should behave like 'c4 e4 [g4 g4]'
    // The root cycle has 3 slots: c4, e4, g4*2
    // g4*2 repeats twice within its slot, similar to a subdivision
    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    // Check that G4 appears twice at correct times
    expectEventCount(result.events, 'G4', 2)

    // First G4 at 0.667 (start of g4*2 slot)
    expectEventAtTime(result.events, 'G4', 0.667, 0)
    // Second G4 at 0.833 (second half of g4*2 slot)
    expectEventAtTime(result.events, 'G4', 0.833, 1)
  })

  it('c4 e4 [g4 a4]*2', async () => {
    const result = await executeSequence('c4 e4 [g4 a4]*2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    // For 'c4 e4 [g4 a4]*2', the root cycle has 3 slots: c4, e4, [g4 a4]*2
    // The subdivision [g4 a4]*2 repeats twice within its slot
    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    // Check that G4 and A4 appear twice each
    expectEventCount(result.events, 'G4', 2)
    expectEventCount(result.events, 'A4', 2)

    // The subdivision [g4 a4] takes 1 slot (0.333 beats), repeated twice
    // Each subdivision gets 0.333/2 = 0.167 beats
    // Within each subdivision, each note gets 0.167/2 = 0.083 beats
    // First subdivision: starts at 0.667
    expectEventAtTime(result.events, 'G4', 0.667, 0) // First G4
    expectEventAtTime(result.events, 'A4', 0.75, 0) // First A4 (0.667 + 0.083)
    // Second subdivision: starts at 0.833 (0.667 + 0.167)
    expectEventAtTime(result.events, 'G4', 0.833, 1) // Second G4
    expectEventAtTime(result.events, 'A4', 0.917, 1) // Second A4 (0.833 + 0.083)
  })

  it('c4 e4 g4/2', async () => {
    // /2 means density = 0.5, so G4 plays on cycles 2, 4, 6, etc. (not cycle 1)
    const result = await executeSequence('c4 e4 g4/2', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Cycle 1: C4 and E4 play, but G4 does not (density skips it)
    expectEventAtTime(result.events, 'C4', 0, 0) // First C4 (cycle 1)
    expectEventAtTime(result.events, 'E4', 0.333, 0) // First E4 (cycle 1)
    // G4 should not appear in cycle 1

    // Cycle 2: All three notes play
    expectEventAtTime(result.events, 'C4', 1.0, 1) // Second C4 (cycle 2)
    expectEventAtTime(result.events, 'E4', 1.333, 1) // Second E4 (cycle 2)
    expectEventAtTime(result.events, 'G4', 1.667, 0) // G4 plays in cycle 2

    // Verify G4 only appears once (in cycle 2)
    expectEventCount(result.events, 'G4', 1)
  })

  it('c4 e4 [g4 a4]/2', async () => {
    // /2 on square bracket means spread children across 2 cycles
    // Cycle 1: g4 plays, Cycle 2: a4 plays
    const result = await executeSequence('c4 e4 [g4 a4]/2', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    // Cycle 1: C4, E4, and G4 (from subdivision) play
    expectEventAtTime(result.events, 'C4', 0, 0) // First C4 (cycle 1)
    expectEventAtTime(result.events, 'E4', 0.333, 0) // First E4 (cycle 1)
    expectEventAtTime(result.events, 'G4', 0.667, 0) // G4 from subdivision (cycle 1)

    // Cycle 2: C4, E4, and A4 (from subdivision) play
    expectEventAtTime(result.events, 'C4', 1.0, 1) // Second C4 (cycle 2)
    expectEventAtTime(result.events, 'E4', 1.333, 1) // Second E4 (cycle 2)
    expectEventAtTime(result.events, 'A4', 1.667, 0) // A4 from subdivision (cycle 2)

    // Verify G4 and A4 each appear once
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 e4 g4@2', async () => {
    // @2 means 1/2 speed, so g4 takes 2 slots (elongates to length of 2 events)
    const result = await executeSequence('c4 e4 g4@2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Root cycle has 4 slots: c4 (1), e4 (1), g4@2 (2)
    // Each slot = 1/4 = 0.25 beats
    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.25, 0)
    expectEventAtTime(result.events, 'G4', 0.5, 0) // G4 starts at slot 2 (0.25 * 2)

    // Verify G4 only appears once (elongated, not repeated)
    expectEventCount(result.events, 'G4', 1)
  })

  it('c4 e4 [g4 a4]@2', async () => {
    // @2 on square bracket means 1/2 speed, so [g4 a4] takes 2 slots (elongated)
    const result = await executeSequence('c4 e4 [g4 a4]@2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    // Root cycle has 4 slots: c4 (1), e4 (1), [g4 a4]@2 (2)
    // Each slot = 1/4 = 0.25 beats
    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.25, 0)
    // The subdivision [g4 a4]@2 takes 2 slots, so g4 and a4 are spread across those 2 slots
    expectEventAtTime(result.events, 'G4', 0.5, 0) // Start of the 2-slot subdivision
    expectEventAtTime(result.events, 'A4', 0.75, 0) // Middle of the 2-slot subdivision (0.5 + 0.25)

    // Verify G4 and A4 each appear once
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
  })

  it('c4 e4 g4!2', async () => {
    // !2 means repeat the event 2 times at runtime (like *2)
    // g4!2 should be equivalent to g4*2 - one event that triggers twice within its slot
    const result = await executeSequence('c4 e4 g4!2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.250)

    // Check that G4 appears twice at correct times
    expectEventCount(result.events, 'G4', 2)

    // First G4 at 0.5 (first slot of g4!2)
    expectEventAtTime(result.events, 'G4', 0.500, 0)
    // Second G4 at 0.75 (second slot of g4!2)
    expectEventAtTime(result.events, 'G4', 0.750, 1)
  })

  it('c4 e4 g4@2*2', async () => {
    // @2*2 means: @2 elongates to 2 slots, *2 repeats twice within those 2 slots
    // g4@2*2 should play twice in the elongated 2-slot span
    const result = await executeSequence('c4 e4 g4@2*2')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Root cycle has 4 slots: c4 (1), e4 (1), g4@2*2 (2)
    // Each slot = 1/4 = 0.25 beats
    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'E4', 0.25, 0)

    // Check that G4 appears twice at correct times
    expectEventCount(result.events, 'G4', 2)

    // g4@2*2 takes 2 slots (0.5 to 1.0), plays twice within that span
    // First G4 at 0.5 (start of the 2-slot span)
    expectEventAtTime(result.events, 'G4', 0.5, 0)
    // Second G4 at 0.75 (middle of the 2-slot span, or start of second slot)
    expectEventAtTime(result.events, 'G4', 0.75, 1)
  })

  it('c4 e4 ~', async () => {
    // ~ is a rest token (alias for _)
    // Root cycle has 3 slots: c4 (1), e4 (1), ~ (1)
    const result = await executeSequence('c4 e4 ~')
    const notes = getUniqueNotes(result.events)

    // Should only have C4 and E4, no other notes (rest produces no events)
    expect(notes.length).toBe(2)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    // Verify exact event counts
    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)

    // Verify timing
    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    // Verify total events: should be exactly 2 (one for each note, rest produces no events)
    expect(result.events.length).toBe(2)

    // Verify no events occur during the rest slot (0.667 to 1.0)
    const restSlotEvents = result.events.filter(e => {
      const time = e.sample / 44100
      return time >= 0.667 && time < 1.0
    })
    expect(restSlotEvents.length).toBe(0)
  })

  it('c4 e4 [~ g4]', async () => {
    // Subdivision with a rest followed by a note
    // Root cycle has 3 slots: c4 (1), e4 (1), [~ g4] (1)
    // The subdivision [~ g4] has 2 slots internally: ~ (1), g4 (1)
    const result = await executeSequence('c4 e4 [~ g4]')
    const notes = getUniqueNotes(result.events)

    // Should only have C4, E4, and G4, no other notes (rest produces no events)
    expect(notes.length).toBe(3)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Verify exact event counts
    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)

    // Root cycle has 3 slots, each = 1/3 = 0.333 beats
    expectEventAtTime(result.events, 'C4', 0)
    expectEventAtTime(result.events, 'E4', 0.333)

    // The subdivision [~ g4] takes 1 slot (0.333 beats)
    // It has 2 slots internally: ~ (0.167 beats), g4 (0.167 beats)
    // G4 starts at 0.667 + 0.167 = 0.833
    expectEventAtTime(result.events, 'G4', 0.833)

    // Verify total events: should be exactly 3 (one for each note, rest produces no events)
    expect(result.events.length).toBe(3)

    // Verify no events occur during the rest slot within the subdivision (0.667 to 0.833)
    const restSlotEvents = result.events.filter(e => {
      const time = e.sample / 44100
      return time >= 0.667 && time < 0.833
    })
    expect(restSlotEvents.length).toBe(0)
  })

  it('c4 e4 <g4 a4>', async () => {
    // Angle bracket cycle: plays one child per cycle
    // Cycle 1: c4, e4, g4 (first child of angle bracket)
    // Cycle 2: c4, e4, a4 (second child of angle bracket)
    const result = await executeSequence('c4 e4 <g4 a4>', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)

    // Should have C4, E4, G4, and A4
    expect(notes.length).toBe(4)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')

    // Verify event counts: C4 and E4 appear twice (once per cycle), G4 and A4 appear once each
    expectEventCount(result.events, 'C4', 2)
    expectEventCount(result.events, 'E4', 2)
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)

    // Cycle 1: C4, E4, G4
    expectEventAtTime(result.events, 'C4', 0, 0) // First C4 (cycle 1)
    expectEventAtTime(result.events, 'E4', 0.333, 0) // First E4 (cycle 1)
    expectEventAtTime(result.events, 'G4', 0.667, 0) // G4 (cycle 1)

    // Cycle 2: C4, E4, A4
    expectEventAtTime(result.events, 'C4', 1.0, 1) // Second C4 (cycle 2)
    expectEventAtTime(result.events, 'E4', 1.333, 1) // Second E4 (cycle 2)
    expectEventAtTime(result.events, 'A4', 1.667, 0) // A4 (cycle 2)
  })

  it('c4 e4 <g4 a4 a5>', async () => {
    // Angle bracket cycle: plays one child per cycle
    // Cycle 1: c4, e4, g4 (first child of angle bracket)
    // Cycle 2: c4, e4, a4 (second child of angle bracket)
    // Cycle 3: c4, e4, a5 (third child of angle bracket)
    const result = await executeSequence('c4 e4 <g4 a4 a5>', { totalCycles: 3 })
    const notes = getUniqueNotes(result.events)

    // Should have C4, E4, G4, A4, and A5
    expect(notes.length).toBe(5)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')
    expect(notes).toContain('A4')
    expect(notes).toContain('A5')

    // Verify event counts: C4 and E4 appear three times (once per cycle), G4, A4, and A5 appear once each
    expectEventCount(result.events, 'C4', 3)
    expectEventCount(result.events, 'E4', 3)
    expectEventCount(result.events, 'G4', 1)
    expectEventCount(result.events, 'A4', 1)
    expectEventCount(result.events, 'A5', 1)

    // Cycle 1: C4, E4, G4
    expectEventAtTime(result.events, 'C4', 0, 0) // First C4 (cycle 1)
    expectEventAtTime(result.events, 'E4', 0.333, 0) // First E4 (cycle 1)
    expectEventAtTime(result.events, 'G4', 0.667, 0) // G4 (cycle 1)

    // Cycle 2: C4, E4, A4
    expectEventAtTime(result.events, 'C4', 1.0, 1) // Second C4 (cycle 2)
    expectEventAtTime(result.events, 'E4', 1.333, 1) // Second E4 (cycle 2)
    expectEventAtTime(result.events, 'A4', 1.667, 0) // A4 (cycle 2)

    // Cycle 3: C4, E4, A5
    expectEventAtTime(result.events, 'C4', 2.0, 2) // Third C4 (cycle 3)
    expectEventAtTime(result.events, 'E4', 2.333, 2) // Third E4 (cycle 3)
    expectEventAtTime(result.events, 'A5', 2.667, 0) // A5 (cycle 3)
  })

  it('<c4 e4 g4>*2', async () => {
    // Angle bracket cycle with *2: spreads 3 events across 1.5 cycles, repeats twice
    // childrenPerCycle = 3 / 2 = 1.5
    // Each event gets 1.5/3 = 0.5 beats
    // First sequence: C4 at 0, E4 at 0.5, G4 at 1.0
    // Second sequence: C4 at 1.5, E4 at 2.0, G4 at 2.5
    const result = await executeSequence('<c4 e4 g4>*2', { totalCycles: 3 })
    const notes = getUniqueNotes(result.events)

    // Should have C4, E4, and G4
    expect(notes.length).toBe(3)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Verify event counts: each note appears twice (once per repeat)
    expectEventCount(result.events, 'C4', 2)
    expectEventCount(result.events, 'E4', 2)
    expectEventCount(result.events, 'G4', 2)

    // First sequence: C4 at 0, E4 at 0.5, G4 at 1.0
    expectEventAtTime(result.events, 'C4', 0, 0) // First C4 at 0
    expectEventAtTime(result.events, 'E4', 0.5, 0) // First E4 at 0.5
    expectEventAtTime(result.events, 'G4', 1.0, 0) // First G4 at 1.0

    // Second sequence: C4 at 1.5, E4 at 2.0, G4 at 2.5
    expectEventAtTime(result.events, 'C4', 1.5, 1) // Second C4 at 1.5
    expectEventAtTime(result.events, 'E4', 2.0, 1) // Second E4 at 2.0
    expectEventAtTime(result.events, 'G4', 2.5, 1) // Second G4 at 2.5
  })

  it('c4 g4 a4?.5', async () => {
    // Probability modifier ?.5 means 50% chance to play
    // C4 and G4 should always play, A4 has 50% chance
    // Run 10 cycles with a fixed seed to verify probability
    const result = await executeSequence('c4 g4 a4?.5', { totalCycles: 10 })
    const notes = getUniqueNotes(result.events)

    // Should have C4 and G4, A4 may or may not be present
    expect(notes).toContain('C4')
    expect(notes).toContain('G4')

    // Verify C4 and G4 appear in all 10 cycles
    expectEventCount(result.events, 'C4', 10)
    expectEventCount(result.events, 'G4', 10)

    // A4 should appear approximately 50% of the time
    // With a fixed seed (1234567890), this should be deterministic: exactly 6 out of 10 cycles
    const a4Count = result.events.filter(e => freqToNote(e.value) === 'A4').length
    expect(a4Count).toBe(6) // Exactly 6 with seed 1234567890

    // Verify timing for first cycle
    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'G4', 0.333, 0)
    // A4 timing depends on whether it played in first cycle
    const firstCycleA4 = result.events.filter(e => freqToNote(e.value) === 'A4' && Math.floor(e.cycle) === 0)
    if (firstCycleA4.length > 0) {
      expectEventAtTime(result.events, 'A4', 0.667, 0)
    }
  })

  it('c4 g4 a4?', async () => {
    // Probability modifier ? without number defaults to 0.5 (50% chance to play)
    // Same behavior as a4?.5
    const result = await executeSequence('c4 g4 a4?', { totalCycles: 10 })
    const notes = getUniqueNotes(result.events)

    // Should have C4 and G4, A4 may or may not be present
    expect(notes).toContain('C4')
    expect(notes).toContain('G4')

    // Verify C4 and G4 appear in all 10 cycles
    expectEventCount(result.events, 'C4', 10)
    expectEventCount(result.events, 'G4', 10)

    // A4 should appear approximately 50% of the time
    // With a fixed seed (1234567890), this should be deterministic: exactly 6 out of 10 cycles
    const a4Count = result.events.filter(e => freqToNote(e.value) === 'A4').length
    expect(a4Count).toBe(6) // Exactly 6 with seed 1234567890 (same as a4?.5)

    // Verify timing for first cycle
    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'G4', 0.333, 0)
    // A4 timing depends on whether it played in first cycle
    const firstCycleA4 = result.events.filter(e => freqToNote(e.value) === 'A4' && Math.floor(e.cycle) === 0)
    if (firstCycleA4.length > 0) {
      expectEventAtTime(result.events, 'A4', 0.667, 0)
    }
  })

  it('c4(3,8)', async () => {
    // Euclidean rhythm: 3 beats in 8 steps
    // Pattern: [x . . x . . x .]
    const result = await executeSequence('c4(3,8)')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    // Should have 3 events in 8 steps
    expectEventCount(result.events, 'C4', 3)

    // Pattern: [x . . x . . x .]
    // Each step = 1/8 of cycle = 0.125 beats
    expectEventAtTime(result.events, 'C4', 0, 0) // Step 0
    expectEventAtTime(result.events, 'C4', 0.375, 1) // Step 3
    expectEventAtTime(result.events, 'C4', 0.75, 2) // Step 6
  })

  it('c4(3,8,2)', async () => {
    // Euclidean rhythm: 3 beats in 8 steps with offset 2
    // Base pattern: [x . . x . . x .]
    // With offset 2: [x . x . . x . .]
    const result = await executeSequence('c4(3,8,2)')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    // Should have 3 events in 8 steps
    expectEventCount(result.events, 'C4', 3)

    // Pattern with offset 2: [x . x . . x . .]
    // Each step = 1/8 of cycle = 0.125 beats
    expectEventAtTime(result.events, 'C4', 0, 0) // Step 0
    expectEventAtTime(result.events, 'C4', 0.25, 1) // Step 2
    expectEventAtTime(result.events, 'C4', 0.625, 2) // Step 5
  })

  it('c4(5,8)', async () => {
    // Euclidean rhythm: 5 beats in 8 steps
    // Pattern: [x . x . x x . x]
    const result = await executeSequence('c4(5,8)')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    // Should have 5 events in 8 steps
    expectEventCount(result.events, 'C4', 5)

    // Pattern: [x . x . x x . x]
    // Each step = 1/8 of cycle = 0.125 beats
    expectEventAtTime(result.events, 'C4', 0, 0) // Step 0
    expectEventAtTime(result.events, 'C4', 0.25, 1) // Step 2
    expectEventAtTime(result.events, 'C4', 0.5, 2) // Step 4
    expectEventAtTime(result.events, 'C4', 0.625, 3) // Step 5
    expectEventAtTime(result.events, 'C4', 0.875, 4) // Step 7
  })

  it('c4(3,8) e4', async () => {
    // Euclidean rhythm followed by regular event
    // c4(3,8) takes 8 slots, e4 takes 1 slot
    // Total: 9 slots
    const result = await executeSequence('c4(3,8) e4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    // C4 should have 3 events
    expectEventCount(result.events, 'C4', 3)
    // E4 should have 1 event
    expectEventCount(result.events, 'E4', 1)

    // C4 pattern: [x . . x . . x .] in first 8 slots (0-0.889)
    expectEventAtTime(result.events, 'C4', 0, 0)
    expectEventAtTime(result.events, 'C4', 0.333, 1) // Step 3 of 8 = 3/9 = 0.333
    expectEventAtTime(result.events, 'C4', 0.667, 2) // Step 6 of 8 = 6/9 = 0.667

    // E4 at slot 8 (8/9 = 0.889)
    expectEventAtTime(result.events, 'E4', 0.889)
  })

  it('c4.5', async () => {
    // Velocity modifier .5 means 50% velocity (0.5)
    const result = await executeSequence('c4.5')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    // Verify C4 appears
    expectEventCount(result.events, 'C4', 1)
    expectEventAtTime(result.events, 'C4', 0)

    // Verify velocity is 0.5
    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    expect(c4Events[0]!.velocity).toBe(0.5)
  })

  it('c4;.1', async () => {
    // Hold modifier ;.1 means trigger stays at 1 for 0.1 seconds (100ms)
    const result = await executeSequence('c4;.1')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')

    // Verify C4 appears
    expectEventCount(result.events, 'C4', 1)
    expectEventAtTime(result.events, 'C4', 0)

    // Verify hold time is 0.1 seconds
    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    expect(c4Events[0]!.hold).toBeCloseTo(0.1, 2)

    // Verify trigger stays at 1 for 100ms
    const c4Event = c4Events[0]!
    const voice = c4Event.voice
    const startTime = c4Event.sample / 44100
    const endTime = startTime + 0.15 // Check slightly beyond 100ms
    const samples = await getVelocitySamples('c4;.1', voice, startTime, endTime)

    // Count samples where trigger is 1
    const trigOnSamples = samples.filter(s => s.trig > 0.5)
    const trigOnDuration = trigOnSamples.length / 44100

    // Trigger should be on for approximately 0.1s (100ms)
    expect(trigOnDuration).toBeCloseTo(0.1, 1)
  })

  it('c4;.01 e4 g4', async () => {
    // Hold modifier ;.01 means trigger stays at 1 for 0.01 seconds (10ms)
    // Velocity stays active until voice is replaced
    const result = await executeSequence('c4;.01 e4 g4')
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Verify all notes appear
    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)
    expectEventCount(result.events, 'G4', 1)

    // Get c4 event
    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    const c4Event = c4Events[0]!
    const voice = c4Event.voice

    // Check trigger samples - c4's trigger should be 1 for 0.01s then 0
    const startTime = c4Event.sample / 44100
    const endTime = 0.05 // Check up to 50ms
    const samples = await getVelocitySamples('c4;.01 e4 g4', voice, startTime, endTime)

    // Count samples where trigger is 1
    const trigOnSamples = samples.filter(s => s.trig > 0.5)
    const trigOnDuration = trigOnSamples.length / 44100

    // Trigger should be on for approximately 0.01s (10ms)
    expect(trigOnDuration).toBeCloseTo(0.01, 2)

    // Velocity should stay active (voice not released)
    const velocityOnSamples = samples.filter(s => s.velocity > 0)
    expect(velocityOnSamples.length).toBe(samples.length) // All samples should have velocity > 0
  })

  it('c4 e4 g4;.2', async () => {
    // Hold modifier ;.2 means trigger stays at 1 for 0.2 seconds
    // When cycle repeats, g4's velocity should stay active (hold only affects trigger, not voice lifetime)
    const result = await executeSequence('c4 e4 g4;.2', { totalCycles: 2 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')
    expect(notes).toContain('G4')

    // Get g4 events (should appear in both cycles)
    const g4Events = result.events.filter(e => freqToNote(e.value) === 'G4')
    expect(g4Events.length).toBe(2) // Should appear in both cycles

    // Verify g4 triggers in both cycles
    expectEventAtTime(result.events, 'G4', 0.667, 0) // First cycle
    expectEventAtTime(result.events, 'G4', 1.667, 1) // Second cycle

    // Check that g4's trigger goes 1 -> 0 -> 1 between cycles
    // First g4: trigger is 1 from 0.667 to 0.867 (hold 0.2s)
    // Then trigger should be 0 from 0.867 to 1.667
    // Then trigger should be 1 again from 1.667 to 1.867 (second cycle)
    const firstG4 = g4Events[0]!
    const voice = firstG4.voice

    // Check trigger samples around the transition
    const startTime = 0.8 // Before first hold expires
    const endTime = 1.8 // After second trigger
    const samples = await getVelocitySamples('c4 e4 g4;.2', voice, startTime, endTime, { totalCycles: 2 })

    // Check trigger goes to 0 after first hold expires (around 0.867)
    const afterFirstHold = samples.filter(s => s.time > 0.867 && s.time < 1.6)
    const trigOffAfterFirst = afterFirstHold.filter(s => s.trig <= 0.5)
    expect(trigOffAfterFirst.length).toBeGreaterThan(afterFirstHold.length * 0.9) // Most should be 0

    // Check trigger goes to 1 again at second trigger (around 1.667)
    const atSecondTrigger = samples.filter(s => s.time >= 1.667 && s.time < 1.867)
    const trigOnAtSecond = atSecondTrigger.filter(s => s.trig > 0.5)
    expect(trigOnAtSecond.length).toBeGreaterThan(atSecondTrigger.length * 0.9) // Most should be 1

    // Check that g4's velocity stays active between cycles
    const g4Value = noteToFreq('G4')
    const velocityActive = samples.filter(s => Math.abs(s.value - g4Value) < 0.1 && s.velocity > 0)
    expect(velocityActive.length).toBeGreaterThan(samples.length * 0.8) // Most should be active
  })

  it('c4#.5 e4#.5', async () => {
    // Jitter modifier #.5 means 50% jitter (random offset up to 50% of slot duration)
    // With fixed seed, jitter should be deterministic
    const result = await executeSequence('c4#.5 e4#.5', { seed: 1234567890 })
    const notes = getUniqueNotes(result.events)
    expect(notes).toContain('C4')
    expect(notes).toContain('E4')

    // Verify both notes appear
    expectEventCount(result.events, 'C4', 1)
    expectEventCount(result.events, 'E4', 1)

    // C4 should be at time 0 (with possible jitter offset)
    const c4Events = result.events.filter(e => freqToNote(e.value) === 'C4')
    expect(c4Events.length).toBe(1)
    const c4Time = c4Events[0]!.sample / 44100
    // With 50% jitter on a 1-second cycle (2 slots), slot duration is 0.5s
    // Jitter can offset by up to 0.5 * 0.5 = 0.25s
    expect(c4Time).toBeGreaterThanOrEqual(-0.25)
    expect(c4Time).toBeLessThanOrEqual(0.25)

    // E4 should be at time 0.5 (with possible jitter offset)
    const e4Events = result.events.filter(e => freqToNote(e.value) === 'E4')
    expect(e4Events.length).toBe(1)
    const e4Time = e4Events[0]!.sample / 44100
    // E4 is at slot 1 (0.5s), jitter can offset by up to 0.25s
    expect(e4Time).toBeGreaterThanOrEqual(0.25)
    expect(e4Time).toBeLessThanOrEqual(0.75)
  })

  it('trigger goes to 0 between notes', async () => {
    // Test that triggers properly go to 0 between note events
    const samples = await getVelocitySamples('c4 e4 g4', 0, 0, 1.0)

    // Find trigger onset samples (0->1 transitions)
    const triggerOnsets: number[] = []

    // Check sample 0 separately (it's an onset if trigger is high)
    if (samples.length > 0 && samples[0]!.trig > 0.5) {
      triggerOnsets.push(samples[0]!.sample)
    }

    // Check remaining samples for 0->1 transitions
    for (let i = 1; i < samples.length; i++) {
      if (samples[i]!.trig > 0.5 && samples[i - 1]!.trig <= 0.5) {
        triggerOnsets.push(samples[i]!.sample)
      }
    }

    // Should have 3 trigger onsets (c4, e4, g4) within first cycle
    expect(triggerOnsets.length).toBe(3)

    // Verify each trigger is only 1 sample wide (for hold=0)
    for (const onset of triggerOnsets) {
      const onsetSample = samples.find(s => s.sample === onset)
      const nextSample = samples.find(s => s.sample === onset + 1)
      expect(onsetSample?.trig).toBeGreaterThan(0.5)
      expect(nextSample?.trig).toBeLessThanOrEqual(0.5)
    }

    // Verify triggers go back to 0 between onsets
    for (let i = 1; i < triggerOnsets.length; i++) {
      const prevOnset = triggerOnsets[i - 1]!
      const currentOnset = triggerOnsets[i]!
      const samplesBetween = samples.filter(s => s.sample > prevOnset && s.sample < currentOnset)
      const hasZero = samplesBetween.some(s => s.trig <= 0.5)
      expect(hasZero).toBe(true)
    }
  })
})
