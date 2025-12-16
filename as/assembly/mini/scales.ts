// Hardcoded scale tables for runtime degree resolution.
//
// The TS tokenizer maps scale names to a scaleIndex that references this table.
// Indices must match the "first unique interval pattern" order derived from
// `src/mini/tokenizer.ts`'s SCALE_INTERVALS.

const SCALES: i32[][] = [
  [0, 2, 4, 5, 7, 9, 11], // 0 major
  [0, 2, 3, 5, 7, 8, 10], // 1 minor
  [0, 3, 5, 7, 10], // 2 pentatonic
  [0, 2, 4, 7, 9], // 3 majorpentatonic
  [0, 2, 4, 6, 9], // 4 ritusen
  [0, 2, 3, 7, 9], // 5 kumai
  [0, 2, 3, 7, 8], // 6 hirajoshi
  [0, 1, 5, 6, 10], // 7 iwato
  [0, 4, 6, 7, 11], // 8 chinese
  [0, 4, 5, 7, 9, 11], // 9 indian
  [0, 1, 3, 7, 8], // 10 pelog
  [0, 2, 4, 6, 9, 10], // 11 prometheus
  [0, 1, 4, 7, 9], // 12 scriabin
  [0, 2, 5, 7, 10], // 13 shang
  [0, 3, 5, 8, 10], // 14 jiao
  [0, 3, 5, 7, 9], // 15 yu
  [0, 2, 4, 6, 8, 10], // 16 whole
  [0, 3, 4, 7, 8, 11], // 17 augmented
  [0, 1, 4, 5, 8, 9], // 18 augmented2
  [0, 2, 4, 7, 9, 11], // 19 hexmajor7
  [0, 2, 3, 5, 7, 9], // 20 hexdorian
  [0, 1, 4, 5, 7, 10], // 21 hexphrygian
  [0, 2, 5, 7, 9, 10], // 22 hexsus
  [0, 2, 4, 5, 7, 9], // 23 hexmajor6
  [0, 2, 3, 5, 7, 8], // 24 hexaeolian
  [0, 2, 3, 5, 7, 9, 10], // 25 dorian
  [0, 1, 3, 5, 7, 8, 10], // 26 phrygian
  [0, 2, 4, 6, 7, 9, 11], // 27 lydian
  [0, 2, 4, 5, 7, 9, 10], // 28 mixolydian
  [0, 1, 3, 5, 6, 8, 10], // 29 locrian
  [0, 2, 3, 5, 7, 8, 11], // 30 harmonicminor
  [0, 2, 4, 5, 7, 8, 11], // 31 harmonicmajor
  [0, 2, 3, 5, 7, 9, 11], // 32 melodicminor
  [0, 2, 4, 5, 7, 8, 10], // 33 bartok
  [0, 2, 5, 7, 8, 10], // 34 hindu
  [0, 1, 3, 6, 7, 8, 11], // 35 todi
  [0, 1, 4, 6, 7, 8, 11], // 36 purvi
  [0, 1, 4, 6, 7, 9, 11], // 37 marva
  [0, 1, 4, 5, 7, 8, 11], // 38 bhairav
  [0, 1, 4, 5, 7, 9, 10], // 39 ahirbhairav
  [0, 1, 3, 4, 6, 8, 10], // 40 superlocrian
  [0, 2, 3, 6, 7, 9, 10], // 41 romanianminor
  [0, 2, 3, 6, 7, 8, 11], // 42 hungarianminor
  [0, 1, 3, 5, 7, 8, 11], // 43 neapolitanminor
  [0, 1, 4, 6, 8, 10, 11], // 44 enigmatic
  [0, 1, 3, 4, 5, 7, 8, 10], // 45 spanish
  [0, 2, 4, 6, 8, 9, 11], // 46 leadingwhole
  [0, 2, 4, 6, 7, 8, 10], // 47 lydianminor
  [0, 1, 3, 5, 7, 9, 11], // 48 neapolitanmajor
  [0, 2, 4, 5, 6, 8, 10], // 49 locrianmajor
  [0, 2, 3, 5, 6, 8, 9, 11], // 50 diminished
  [0, 1, 3, 4, 6, 7, 9, 10], // 51 octatonic
  [0, 1, 2, 5, 6, 7, 10, 11], // 52 messiaen2
  [0, 2, 3, 4, 6, 7, 8, 11], // 53 messiaen3
  [0, 1, 2, 5, 6, 7, 9, 10], // 54 messiaen4
  [0, 1, 5, 6, 7, 11], // 55 messiaen5
  [0, 2, 4, 5, 6, 8, 10, 11], // 56 messiaen6
  [0, 1, 2, 3, 5, 6, 7, 8, 9, 11], // 57 messiaen7
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11], // 58 chromatic
  [0, 1, 4, 5, 7, 8, 10], // 59 bayati
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
