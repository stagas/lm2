import { expect } from 'bun:test'
import type { TimelineEvent } from '../mini/bytecode.ts'
import { compileMiniNotation } from '../mini/compiler.ts'
import { evaluateMiniBytecode } from '../mini/evaluator.ts'
import { midiToFrequency, noteNameToMidi } from '../mini/util.ts'

export interface MiniRunOptions {
  from?: number
  to?: number
  seed?: number
}

export function runMiniNotation(input: string, options: MiniRunOptions = {}): TimelineEvent[] {
  const compiled = compileMiniNotation(input, { seed: options.seed ?? 1 })
  return evaluateMiniBytecode(compiled.bytecode, {
    from: options.from ?? 0,
    to: options.to ?? Number.POSITIVE_INFINITY,
    seed: options.seed ?? 1,
    sourceMap: compiled.sourceMap,
  })
}

export function toValue(value: string | number): number {
  if (typeof value === 'number') return value
  return midiToFrequency(noteNameToMidi(value))
}

export function getEventsByValue(events: TimelineEvent[], value: string | number): TimelineEvent[] {
  return events.filter((e) => e.value === value)
}

export function expectEventAtTime(
  events: TimelineEvent[],
  value: string | number,
  expectedStart: number,
  eventIndex: number = 0,
  tolerance: number = 0.0001,
) {
  const valueEvents = getEventsByValue(events, value)
  expect(valueEvents.length).toBeGreaterThan(eventIndex)
  const event = valueEvents[eventIndex]!
  if (Math.abs(event.start - expectedStart) >= tolerance) {
    throw new Error(
      `Expected start time ${expectedStart} for value ${value} at index ${eventIndex}, but got: ${event.start}`,
    )
  }
  expect(event.start).toBeCloseTo(expectedStart, 4)
}

export function expectEventEndTime(
  events: TimelineEvent[],
  value: string | number,
  expectedEnd: number,
  eventIndex: number = 0,
  tolerance: number = 0.0001,
) {
  const valueEvents = getEventsByValue(events, value)
  expect(valueEvents.length).toBeGreaterThan(eventIndex)
  const event = valueEvents[eventIndex]!
  if (Math.abs(event.end - expectedEnd) >= tolerance) {
    throw new Error(
      `Expected end time ${expectedEnd} for value ${value} at index ${eventIndex}, but got: ${event.end}`,
    )
  }
  expect(event.end).toBeCloseTo(expectedEnd, 4)
}

export function expectEventTiming(
  events: TimelineEvent[],
  value: string | number,
  expectedStart: number,
  expectedEnd: number,
  eventIndex: number = 0,
  tolerance: number = 0.0001,
) {
  expectEventAtTime(events, value, expectedStart, eventIndex, tolerance)
  expectEventEndTime(events, value, expectedEnd, eventIndex, tolerance)
}

export function expectEventDuration(
  events: TimelineEvent[],
  value: string | number,
  expectedDuration: number,
  eventIndex: number = 0,
  tolerance: number = 0.0001,
) {
  const valueEvents = getEventsByValue(events, value)
  expect(valueEvents.length).toBeGreaterThan(eventIndex)
  const event = valueEvents[eventIndex]!
  const duration = event.end - event.start
  if (Math.abs(duration - expectedDuration) >= tolerance) {
    throw new Error(
      `Expected duration ${expectedDuration} for value ${value} at index ${eventIndex}, but got: ${duration}`,
    )
  }
  expect(duration).toBeCloseTo(expectedDuration, 4)
}

export function expectEventCount(
  events: TimelineEvent[],
  value: string | number,
  expectedCount: number,
) {
  const valueEvents = getEventsByValue(events, value)
  expect(valueEvents.length).toBe(expectedCount)
}

export function expectEventsInOrder(events: TimelineEvent[]) {
  for (let i = 1; i < events.length; i++) {
    const prev = events[i - 1]!
    const curr = events[i]!
    if (curr.start < prev.start) {
      throw new Error(
        `Events are not in order: event at index ${
          i - 1
        } starts at ${prev.start}, but event at index ${i} starts at ${curr.start}`,
      )
    }
    expect(curr.start).toBeGreaterThanOrEqual(prev.start)
  }
}

export function expectNoGaps(
  events: TimelineEvent[],
  startTime: number,
  endTime: number,
  tolerance: number = 0.0001,
) {
  const sortedEvents = [...events].sort((a, b) => a.start - b.start)
  const relevantEvents = sortedEvents.filter(
    (e) => e.start >= startTime && e.end <= endTime,
  )

  if (relevantEvents.length === 0) return

  let currentTime = startTime
  for (const event of relevantEvents) {
    if (event.start > currentTime + tolerance) {
      throw new Error(
        `Gap detected: expected event at ${currentTime}, but next event starts at ${event.start}`,
      )
    }
    currentTime = Math.max(currentTime, event.end)
  }

  if (currentTime < endTime - tolerance) {
    throw new Error(
      `Gap at end: last event ends at ${currentTime}, but range ends at ${endTime}`,
    )
  }
}

export function expectEventsContiguous(
  events: TimelineEvent[],
  startTime: number,
  endTime: number,
  tolerance: number = 0.0001,
) {
  const sortedEvents = [...events]
    .filter((e) => e.start >= startTime && e.end <= endTime)
    .sort((a, b) => a.start - b.start)

  if (sortedEvents.length === 0) {
    throw new Error('No events found in the specified time range')
  }

  expect(sortedEvents[0]!.start).toBeCloseTo(startTime, 4)
  expect(sortedEvents[sortedEvents.length - 1]!.end).toBeCloseTo(endTime, 4)

  for (let i = 1; i < sortedEvents.length; i++) {
    const prev = sortedEvents[i - 1]!
    const curr = sortedEvents[i]!
    if (Math.abs(curr.start - prev.end) >= tolerance) {
      throw new Error(
        `Events are not contiguous: event at index ${
          i - 1
        } ends at ${prev.end}, but event at index ${i} starts at ${curr.start}`,
      )
    }
    expect(curr.start).toBeCloseTo(prev.end, 4)
  }
}

export function expectEventInRange(
  events: TimelineEvent[],
  value: string | number,
  minStart: number,
  maxStart: number,
  eventIndex: number = 0,
) {
  const valueEvents = getEventsByValue(events, value)
  expect(valueEvents.length).toBeGreaterThan(eventIndex)
  const event = valueEvents[eventIndex]!
  expect(event.start).toBeGreaterThanOrEqual(minStart)
  expect(event.start).toBeLessThanOrEqual(maxStart)
}

export function expectAllEventsInRange(
  events: TimelineEvent[],
  minTime: number,
  maxTime: number,
) {
  for (const event of events) {
    expect(event.start).toBeGreaterThanOrEqual(minTime)
    expect(event.end).toBeLessThanOrEqual(maxTime)
  }
}

export function expectEventSequence(
  events: TimelineEvent[],
  expectedSequence: Array<{ value: string | number; start: number; end: number }>,
  tolerance: number = 0.0001,
) {
  expect(events.length).toBeGreaterThanOrEqual(expectedSequence.length)

  for (let i = 0; i < expectedSequence.length; i++) {
    const expected = expectedSequence[i]!
    const actual = events[i]

    if (!actual) {
      throw new Error(`Expected event at index ${i}, but got none`)
    }

    expect(actual.value).toBeCloseTo(toValue(expected.value), 4)
    expect(actual.start).toBeCloseTo(expected.start, 4)
    expect(actual.end).toBeCloseTo(expected.end, 4)
  }
}

export function expectTimeline(
  events: TimelineEvent[],
  expected: Array<{ value: string | number; start: number; end: number }>,
) {
  expectEventSequence(events.sort((a, b) => a.start - b.start), expected.sort((a, b) => a.start - b.start))
  expect(events.length).toBe(expected.length)
}
