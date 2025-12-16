import { describe, expect, it } from 'bun:test'
import {
  expectTimeline,
  runMiniNotation,
  toValue,
} from '../test-utils/mini-notation-test.ts'

describe('Mini-Notation compiler/evaluator', () => {
  it('handles grouping and subdivision', () => {
    const events = runMiniNotation('c4 e4 [g4 a4]')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 3 },
      { value: 'e4', start: 1 / 3, end: 2 / 3 },
      { value: 'g4', start: 2 / 3, end: 5 / 6 },
      { value: 'a4', start: 5 / 6, end: 1 },
    ])
  })

  it('handles nested groups', () => {
    const events = runMiniNotation('c4 [e4 [g4 a4]]')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'e4', start: 1 / 2, end: 3 / 4 },
      { value: 'g4', start: 3 / 4, end: 7 / 8 },
      { value: 'a4', start: 7 / 8, end: 1 },
    ])
  })

  it('spreads angle brackets across children', () => {
    const events = runMiniNotation('<c4 e4 g4>')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 },
      { value: 'e4', start: 1, end: 2 },
      { value: 'g4', start: 2, end: 3 },
    ])
  })

  it('elongates with underscores', () => {
    const events = runMiniNotation('c4 _ _')
    expectTimeline(events, [{ value: 'c4', start: 0, end: 1 }])
  })

  it('elongates within a sequence with underscores', () => {
    const events = runMiniNotation('c4 _ _ e4')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 3 / 4 },
      { value: 'e4', start: 3 / 4, end: 1 },
    ])
  })

  it('distinguishes repeat and replicate', () => {
    const repeat = runMiniNotation('c4*2')
    expectTimeline(repeat, [
      { value: 'c4', start: 0, end: 0.5 },
      { value: 'c4', start: 0.5, end: 1 },
    ])

    const replicate = runMiniNotation('c4!2')
    expectTimeline(replicate, [
      { value: 'c4', start: 0, end: 0.5 },
      { value: 'c4', start: 0.5, end: 1 },
    ])
  })

  it('contrasts repeat vs replicate on multiple events', () => {
    const repeat = runMiniNotation('c4 e4 g4*2')
    expectTimeline(repeat, [
      { value: 'c4', start: 0, end: 1 / 3 },
      { value: 'e4', start: 1 / 3, end: 2 / 3 },
      { value: 'g4', start: 2 / 3, end: 5 / 6 },
      { value: 'g4', start: 5 / 6, end: 1 },
    ])

    const replicate = runMiniNotation('c4 e4 g4!2')
    expectTimeline(replicate, [
      { value: 'c4', start: 0, end: 1 / 4 },
      { value: 'e4', start: 1 / 4, end: 2 / 4 },
      { value: 'g4', start: 2 / 4, end: 3 / 4 },
      { value: 'g4', start: 3 / 4, end: 1 },
    ])
  })

  it('repeats square-bracket groups within their slot', () => {
    const events = runMiniNotation('c4 e4 [g4 a4]*2')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 3 },
      { value: 'e4', start: 1 / 3, end: 2 / 3 },
      { value: 'g4', start: 2 / 3, end: 3 / 4 },
      { value: 'a4', start: 3 / 4, end: 5 / 6 },
      { value: 'g4', start: 5 / 6, end: 11 / 12 },
      { value: 'a4', start: 11 / 12, end: 1 },
    ])
  })

  it('replicates square-bracket groups across slots', () => {
    const events = runMiniNotation('c4 e4 [g4 a4]!2')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 4 },
      { value: 'e4', start: 1 / 4, end: 1 / 2 },
      { value: 'g4', start: 1 / 2, end: 5 / 8 },
      { value: 'a4', start: 5 / 8, end: 3 / 4 },
      { value: 'g4', start: 3 / 4, end: 7 / 8 },
      { value: 'a4', start: 7 / 8, end: 1 },
    ])
  })

  it('strums chords with $', () => {
    const events = runMiniNotation('c4e4g4$0.5')
    expectTimeline(events, [
      { value: toValue('c4'), start: 0, end: 1 },
      { value: toValue('e4'), start: 1 / 4, end: 5 / 4 },
      { value: toValue('g4'), start: 1 / 2, end: 3 / 2 },
    ])
  })

  it('stretches events across cycles with /N', () => {
    const events = runMiniNotation('c4 e4/2')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'c4', start: 1, end: 3 / 2 },
      { value: 'e4', start: 3 / 2, end: 2 },
    ])
  })

  it('stretches groups across cycles', () => {
    const events = runMiniNotation('c4 [g4 a4]/2')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'g4', start: 1 / 2, end: 3 / 4 },
      { value: 'c4', start: 1, end: 3 / 2 },
      { value: 'a4', start: 3 / 2, end: 7 / 4 },
    ])
  })

  it('stretches groups across cycles', () => {
    const events = runMiniNotation('c4 [g4 a4]/2')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'g4', start: 1 / 2, end: 1 },
      { value: 'c4', start: 1, end: 3 / 2 },
      { value: 'a4', start: 3 / 2, end: 2 },
    ])
  })

  it('spreads stretched groups across cycles', () => {
    const events = runMiniNotation('c4 [e4 [g4 a4]]/2')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'e4', start: 1 / 2, end: 1 },
      { value: 'c4', start: 1, end: 1 + 1 / 2 },
      { value: 'g4', start: 1 + 1 / 2, end: 1 + 3 / 4 },
      { value: 'a4', start: 1 + 3 / 4, end: 2 },
    ])
  })

  it('spreads stretched groups across 3 cycles', () => {
    const events = runMiniNotation('c4 [e4 [g4 a4]]/3')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'e4', start: 1 / 2, end: 1 },
      { value: 'c4', start: 1, end: 1 + 1 / 2 },
      { value: 'g4', start: 1.6667, end: 1.8333 },
      { value: 'c4', start: 2, end: 5 / 2 },
      { value: 'a4', start: 2 + 2 / 3, end: 2.8333 },
    ])
  })

  it('spreads stretched groups across 4 cycles', () => {
    const events = runMiniNotation('c4 [e4 [g4 a4]]/4')
    expectTimeline(events, [
      { value: 'c4', start: 0, end: 1 / 2 },
      { value: 'c4', start: 1, end: 3 / 2 },
      { value: 'c4', start: 2, end: 5 / 2 },
      { value: 'c4', start: 3, end: 7 / 2 },
      { value: 'e4', start: 1 / 2, end: 1 },
      { value: 'g4', start: 5 / 2, end: 3 },
      { value: 'a4', start: 7 / 2, end: 4 },
    ])
  })

  it('attaches source map entries', () => {
    const events = runMiniNotation('c4 e4')
    expect(events[0]!.source?.text).toBe('c4')
    expect(events[1]!.source?.text).toBe('e4')
  })

  it('resolves roman numerals with default major scale', () => {
    const events = runMiniNotation('i ii iii')
    // In C major: i = C, ii = D, iii = E
    expectTimeline(events, [
      { value: toValue('c4'), start: 0, end: 1 / 3 },
      { value: toValue('d4'), start: 1 / 3, end: 2 / 3 },
      { value: toValue('e4'), start: 2 / 3, end: 1 },
    ])
  })

  it('resolves numeric degrees with default major scale', () => {
    const events = runMiniNotation('1 2 3')
    // In C major: 1 = C, 2 = D, 3 = E
    expectTimeline(events, [
      { value: toValue('c4'), start: 0, end: 1 / 3 },
      { value: toValue('d4'), start: 1 / 3, end: 2 / 3 },
      { value: toValue('e4'), start: 2 / 3, end: 1 },
    ])
  })
})
