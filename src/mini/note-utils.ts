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

export function frequencyToNoteName(frequency: number): string | null {
  if (!isFinite(frequency) || frequency <= 0) return null
  try {
    const midi = 12 * Math.log2(frequency / 440) + 69
    if (!isFinite(midi)) return null
    const roundedMidi = Math.round(midi)
    return midiToNoteName(roundedMidi)
  }
  catch {
    return null
  }
}

export function midiToNoteName(midi: number): string {
  if (!isFinite(midi) || isNaN(midi)) {
    console.error('midiToNoteName called with invalid midi:', midi)
    return '?'
  }
  const roundedMidi = Math.round(midi)
  const note = ((roundedMidi % 12) + 12) % 12
  const octave = Math.floor(roundedMidi / 12) - 1
  const notes = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
  if (note < 0 || note >= notes.length) {
    console.error('Invalid note index:', note, 'for midi:', midi)
    return '?'
  }
  const result = `${notes[note]}${octave}`
  if (!result || result.includes('undefined')) {
    console.error('Invalid result from midiToNoteName:', result, 'midi:', midi, 'note:', note, 'octave:', octave)
    return '?'
  }
  return result
}
