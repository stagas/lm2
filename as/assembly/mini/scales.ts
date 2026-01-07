// Hardcoded scale tables for runtime degree resolution.
//
// The TS tokenizer maps scale names to a scaleIndex that references this table.
// Indices must match the "first unique interval pattern" order derived from
// `src/mini/tokenizer.ts`'s SCALE_INTERVALS.

const SCALES: i32[][] = [
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 3, 5, 7, 10],
  [0, 3, 5, 7, 10],
  [0, 3, 5, 7, 10],
  [0, 3, 5, 7, 10],
  [0, 2, 4, 7, 9],
  [0, 2, 4, 7, 9],
  [0, 2, 4, 6, 9],
  [0, 2, 3, 7, 9],
  [0, 2, 3, 7, 8],
  [0, 1, 5, 6, 10],
  [0, 4, 6, 7, 11],
  [0, 4, 5, 7, 9, 11],
  [0, 1, 3, 7, 8],
  [0, 2, 4, 6, 9, 10],
  [0, 1, 4, 7, 9],
  [0, 2, 4, 7, 9],
  [0, 2, 5, 7, 10],
  [0, 3, 5, 8, 10],
  [0, 2, 4, 6, 9],
  [0, 3, 5, 7, 9],
  [0, 2, 4, 6, 8, 10],
  [0, 2, 4, 6, 8, 10],
  [0, 3, 4, 7, 8, 11],
  [0, 1, 4, 5, 8, 9],
  [0, 2, 4, 7, 9, 11],
  [0, 2, 3, 5, 7, 9],
  [0, 1, 4, 5, 7, 10],
  [0, 2, 5, 7, 9, 10],
  [0, 2, 4, 5, 7, 9],
  [0, 2, 3, 5, 7, 8],
  [0, 2, 4, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 9, 10],
  [0, 1, 3, 5, 7, 8, 10],
  [0, 2, 4, 6, 7, 9, 11],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 1, 3, 5, 6, 8, 10],
  [0, 2, 3, 5, 7, 8, 11],
  [0, 2, 4, 5, 7, 8, 11],
  [0, 2, 3, 5, 7, 9, 11],
  [0, 2, 3, 5, 7, 8, 10],
  [0, 2, 4, 6, 7, 9, 11],
  [0, 2, 4, 5, 7, 8, 10],
  [0, 2, 5, 7, 8, 10],
  [0, 1, 3, 6, 7, 8, 11],
  [0, 1, 4, 6, 7, 8, 11],
  [0, 1, 4, 6, 7, 9, 11],
  [0, 1, 4, 5, 7, 8, 11],
  [0, 1, 4, 5, 7, 9, 10],
  [0, 1, 3, 4, 6, 8, 10],
  [0, 2, 3, 6, 7, 9, 10],
  [0, 2, 3, 6, 7, 8, 11],
  [0, 1, 3, 5, 7, 8, 11],
  [0, 1, 4, 6, 8, 10, 11],
  [0, 1, 3, 4, 5, 7, 8, 10],
  [0, 2, 4, 6, 8, 9, 11],
  [0, 2, 4, 6, 7, 8, 10],
  [0, 1, 3, 5, 7, 9, 11],
  [0, 2, 4, 5, 6, 8, 10],
  [0, 2, 3, 5, 6, 8, 9, 11],
  [0, 1, 3, 4, 6, 7, 9, 10],
  [0, 1, 3, 4, 6, 7, 9, 10],
  [0, 2, 3, 5, 6, 8, 9, 11],
  [0, 2, 4, 6, 8, 10],
  [0, 1, 2, 5, 6, 7, 10, 11],
  [0, 2, 3, 4, 6, 7, 8, 11],
  [0, 1, 2, 5, 6, 7, 9, 10],
  [0, 1, 5, 6, 7, 11],
  [0, 2, 4, 5, 6, 8, 10, 11],
  [0, 1, 2, 3, 5, 6, 7, 8, 9, 11],
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
  [0, 1, 4, 5, 7, 8, 10],
  [0, 1, 4, 5, 7, 8, 10],
  [0, 1, 4, 5, 7, 8, 10],
  [0, 2, 4, 5, 7, 9, 10],
  [0, 1, 3, 4, 6, 7, 9, 10],
  [0, 1, 4, 5, 7, 8, 10],
]

export const SCALE_COUNT: i32 = SCALES.length

export function scaleLength(scaleIndex: i32): i32 {
  if (scaleIndex < 0 || scaleIndex >= SCALE_COUNT) return 0
  return SCALES[scaleIndex].length
}

export function scaleInterval(scaleIndex: i32, intervalIndex: i32): i32 {
  if (scaleIndex < 0 || scaleIndex >= SCALE_COUNT) return 0
  const scale = SCALES[scaleIndex]
  if (intervalIndex < 0 || intervalIndex >= scale.length) return 0
  return scale[intervalIndex]
}

export function degreeToMidi(rootMidi: i32, scaleIndex: i32, degree: i32): i32 {
  const len = scaleLength(scaleIndex)
  if (len <= 0) return -1
  if (degree <= 0) return -1

  const step = degree - 1
  const octave = step / len
  const index = step % len
  const semitone = scaleInterval(scaleIndex, index) + octave * 12
  return rootMidi + semitone
}

export function midiToFrequency(midi: i32): f64 {
  return 440.0 * Math.pow(2.0, (f64(midi) - 69.0) / 12.0)
}

export function degreeToFrequency(rootMidi: i32, scaleIndex: i32, degree: i32): f64 {
  const midi = degreeToMidi(rootMidi, scaleIndex, degree)
  if (midi < 0) return 0.0
  return midiToFrequency(midi)
}
