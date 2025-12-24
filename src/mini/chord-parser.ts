export interface ChordTone {
  degree: number // scale degree offset from root (0=root, 2=third, 4=fifth, etc.)
  semitoneAdjust: number // chromatic adjustment (-1=flat, +1=sharp)
}

export function parseChordSuffix(suffix: string): ChordTone[] {
  // Parse chord suffix like "7b9#11sus4no3add2" into semitone offsets
  // Returns array of {degree, semitoneAdjust} where degree is scale-degree offset (0=root, 2=third, etc.)

  const tones: ChordTone[] = []
  const omit = new Set<number>()
  let hasSus2 = false
  let hasSus4 = false

  // Parse modifiers
  let i = 0
  while (i < suffix.length) {
    // Extensions: 7, 9, 11, 13 with optional accidentals
    const extMatch = suffix.slice(i).match(/^([b#]?)(\d+)/)
    if (extMatch) {
      const acc = extMatch[1]
      const num = parseInt(extMatch[2]!, 10)
      i += extMatch[0].length

      let degree: number
      let adjust = 0

      if (num === 7) {
        degree = 6 // 7th = scale degree 7 (offset 6 from root)
        adjust = acc === 'b' ? -1 : acc === '#' ? 1 : 0
      }
      else if (num === 9) {
        degree = 8 // 9th = scale degree 9 (offset 8, wraps to 2nd + octave)
        adjust = acc === 'b' ? -1 : acc === '#' ? 1 : 0
      }
      else if (num === 11) {
        degree = 10 // 11th = scale degree 11 (offset 10, wraps to 4th + octave)
        adjust = acc === 'b' ? -1 : acc === '#' ? 1 : 0
      }
      else if (num === 13) {
        degree = 12 // 13th = scale degree 13 (offset 12, wraps to 6th + octave)
        adjust = acc === 'b' ? -1 : acc === '#' ? 1 : 0
      }
      else if (num === 5) {
        degree = 4 // altered 5th
        adjust = acc === 'b' ? -1 : acc === '#' ? 1 : 0
      }
      else {
        continue
      }

      tones.push({ degree, semitoneAdjust: adjust })
      continue
    }

    // Suspensions
    if (suffix.slice(i).startsWith('sus4')) {
      hasSus4 = true
      i += 4
      continue
    }
    if (suffix.slice(i).startsWith('sus2')) {
      hasSus2 = true
      i += 4
      continue
    }
    if (suffix.slice(i).startsWith('sus')) {
      hasSus4 = true // default sus = sus4
      i += 3
      continue
    }

    // Omissions
    const noMatch = suffix.slice(i).match(/^no(\d+)/)
    if (noMatch) {
      const num = parseInt(noMatch[1]!, 10)
      i += noMatch[0].length
      if (num === 3) omit.add(2) // 3rd = offset 2
      else if (num === 5) omit.add(4) // 5th = offset 4
      continue
    }

    // Added tones
    const addMatch = suffix.slice(i).match(/^add(\d+)/)
    if (addMatch) {
      const num = parseInt(addMatch[1]!, 10)
      i += addMatch[0].length
      if (num === 2) tones.push({ degree: 1, semitoneAdjust: 0 }) // 2nd = offset 1
      else if (num === 4) tones.push({ degree: 3, semitoneAdjust: 0 }) // 4th = offset 3
      else if (num === 6) tones.push({ degree: 5, semitoneAdjust: 0 }) // 6th = offset 5
      continue
    }

    // Diminished
    if (suffix.slice(i).startsWith('o7')) {
      // dim7: root, b3, b5, bb7 (dim7)
      tones.push({ degree: 0, semitoneAdjust: 0 })
      tones.push({ degree: 2, semitoneAdjust: -1 })
      tones.push({ degree: 4, semitoneAdjust: -1 })
      tones.push({ degree: 6, semitoneAdjust: -2 })
      return tones
    }

    i++
  }

  // Build default triad + extensions
  const result: ChordTone[] = []

  // Root
  result.push({ degree: 0, semitoneAdjust: 0 })

  // Third (or suspension)
  if (hasSus2) {
    result.push({ degree: 1, semitoneAdjust: 0 }) // 2nd
  }
  else if (hasSus4) {
    result.push({ degree: 3, semitoneAdjust: 0 }) // 4th
  }
  else if (!omit.has(2)) {
    result.push({ degree: 2, semitoneAdjust: 0 }) // 3rd
  }

  // Fifth
  if (!omit.has(4)) {
    const alteredFifth = tones.find(t => t.degree === 4)
    if (alteredFifth) {
      result.push(alteredFifth)
    }
    else {
      result.push({ degree: 4, semitoneAdjust: 0 })
    }
  }

  // Extensions (7, 9, 11, 13)
  for (const tone of tones) {
    if (tone.degree >= 5 && !result.some(r => r.degree === tone.degree)) {
      result.push(tone)
    }
  }

  // Added tones
  for (const tone of tones) {
    if (tone.degree < 5 && tone.degree !== 0 && tone.degree !== 2 && tone.degree !== 4) {
      if (!result.some(r => r.degree === tone.degree)) {
        result.push(tone)
      }
    }
  }

  return result
}

export function romanToDegree(text: string): number | null {
  const t = text.toLowerCase()
  if (t === 'i') return 1
  if (t === 'ii') return 2
  if (t === 'iii') return 3
  if (t === 'iv') return 4
  if (t === 'v') return 5
  if (t === 'vi') return 6
  if (t === 'vii') return 7
  return null
}

