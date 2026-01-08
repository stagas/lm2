export interface TramBeat {
  subdivisions: boolean[] // Hits within this beat
}

export interface TramSequence {
  beats: TramBeat[] // Array of beats with their subdivisions
  totalBeats: number // Number of top-level beats
}

const cacheByTramSequence = new Map<string, TramSequence>()

export function compileTramSequence(input: string): TramSequence {
  const cached = cacheByTramSequence.get(input)
  if (cached) return cached

  if (cacheByTramSequence.size > 1000) {
    cacheByTramSequence.clear()
  }

  // Parse the hierarchical structure with brackets
  const beats = parseHierarchicalBeats(input)

  const sequence: TramSequence = {
    beats,
    totalBeats: beats.length,
  }

  cacheByTramSequence.set(input, sequence)
  return sequence
}

export function getTramHit(sequence: TramSequence, beatIndex: number, subdivision: number): boolean {
  if (sequence.totalBeats === 0) return false
  const beat = sequence.beats[beatIndex % sequence.totalBeats]
  if (!beat || beat.subdivisions.length === 0) return false
  return beat.subdivisions[subdivision % beat.subdivisions.length] ?? false
}

// Parse hierarchical beats from input string
function parseHierarchicalBeats(input: string): TramBeat[] {
  const beats: TramBeat[] = []
  let i = 0

  while (i < input.length) {
    if (input[i] === '[') {
      // Parse bracketed content
      const bracketContent = parseBracketContent(input, i)

      // Parse bracket content as a sequence of hits only (ignore rests and separators inside brackets)
      const subdivisions: boolean[] = []
      for (let j = 0; j < bracketContent.content.length; j++) {
        const char = bracketContent.content[j]
        if (char === 'x' || char === 'X') {
          subdivisions.push(true)
        }
        // Ignore '-', whitespace, and other characters inside brackets
      }

      beats.push({ subdivisions })
      i = bracketContent.endIndex
    }
    else if (!/\s/.test(input[i])) {
      // Parse single character as beat
      const subdivisions = (input[i] === 'x' || input[i] === 'X') ? [true] : [false]
      beats.push({ subdivisions })
      i++
    }
    else {
      i++ // Skip whitespace
    }
  }

  return beats
}

// Parse bracket content and return content + end index
function parseBracketContent(input: string, startIndex: number): { content: string; endIndex: number } {
  let bracketCount = 1
  let j = startIndex + 1

  while (j < input.length && bracketCount > 0) {
    if (input[j] === '[') {
      bracketCount++
    }
    else if (input[j] === ']') {
      bracketCount--
    }
    j++
  }

  if (bracketCount > 0) {
    throw new Error('Unmatched opening bracket in tram sequence')
  }

  const content = input.slice(startIndex + 1, j - 1).trim()
  if (content.length === 0) {
    throw new Error('Empty brackets in tram sequence')
  }

  return { content, endIndex: j }
}

// Convert hierarchical beat structure to bytecode
// Format: [totalBeats, beat0_subdivCount, beat0_packed..., beat1_subdivCount, beat1_packed..., ...]
export function tramSequenceToBytecode(sequence: TramSequence): Float32Array {
  if (sequence.totalBeats === 0) {
    return new Float32Array([0])
  }

  // Calculate total size needed
  let totalSize = 1 // totalBeats count
  for (const beat of sequence.beats) {
    totalSize += 1 // subdivision count
    totalSize += Math.ceil(beat.subdivisions.length / 32) // packed subdivisions
  }

  const bytecode = new Float32Array(totalSize)
  let writeIndex = 0

  // Write total beats count
  bytecode[writeIndex++] = sequence.totalBeats

  // Write each beat
  for (const beat of sequence.beats) {
    const subdivCount = beat.subdivisions.length
    bytecode[writeIndex++] = subdivCount

    // Pack subdivisions into 32-bit integers
    const packedLength = Math.ceil(subdivCount / 32)
    for (let i = 0; i < packedLength; i++) {
      let packed = 0
      for (let bit = 0; bit < 32; bit++) {
        const index = i * 32 + bit
        if (index < subdivCount && beat.subdivisions[index]) {
          packed |= 1 << bit
        }
      }
      bytecode[writeIndex++] = packed
    }
  }

  return bytecode
}
