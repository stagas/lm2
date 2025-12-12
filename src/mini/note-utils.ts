const NOTE_OFFSETS: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
}

export function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([a-gA-G])([#b]?)(-?\d+)$/)
  if (!match) {
    throw new Error(`Invalid note name: ${noteName}`)
  }

  const [, note, accidental, octave] = match
  let midi = NOTE_OFFSETS[note.toLowerCase()] + (parseInt(octave, 10) + 1) * 12

  if (accidental === '#') {
    midi += 1
  }
  else if (accidental === 'b') {
    midi -= 1
  }

  return midi
}

export function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

export function frequencyToNoteName(frequency: number): string {
  const midi = 12 * Math.log2(frequency / 440) + 69
  return midiToNoteName(midi)
}

export function midiToNoteName(midi: number): string {
  const note = midi % 12
  const octave = Math.floor(midi / 12) - 1
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  return `${notes[note]}${octave}`
}
