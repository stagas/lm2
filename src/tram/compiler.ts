export interface TramSequence {
  pattern: boolean[]
  length: number
}

const cacheByTramSequence = new Map<string, TramSequence>()

export function compileTramSequence(input: string): TramSequence {
  const cached = cacheByTramSequence.get(input)
  if (cached) return cached

  if (cacheByTramSequence.size > 1000) {
    cacheByTramSequence.clear()
  }

  // Parse the sequence string
  const pattern: boolean[] = []
  for (let i = 0; i < input.length; i++) {
    const char = input[i]
    if (char === 'x' || char === 'X') {
      pattern.push(true) // hit
    } else if (char === '-') {
      pattern.push(false) // rest
    } else {
      // Invalid character, treat as rest
      pattern.push(false)
    }
  }

  const sequence: TramSequence = {
    pattern,
    length: pattern.length
  }

  cacheByTramSequence.set(input, sequence)
  return sequence
}

export function getTramHit(sequence: TramSequence, step: number): boolean {
  if (sequence.length === 0) return false
  const index = step % sequence.length
  return sequence.pattern[index] ?? false
}

// Convert boolean pattern to bytecode (packed as 32-bit integers)
export function tramSequenceToBytecode(sequence: TramSequence): Float32Array {
  const length = sequence.pattern.length
  if (length === 0) {
    return new Float32Array([0]) // length 0
  }

  // Pack 32 booleans per float32 (using bits)
  const packedLength = Math.ceil(length / 32)
  const bytecode = new Float32Array(1 + packedLength) // length + packed data

  bytecode[0] = length // Store the actual length

  for (let i = 0; i < packedLength; i++) {
    let packed = 0
    for (let bit = 0; bit < 32; bit++) {
      const index = i * 32 + bit
      if (index < length && sequence.pattern[index]) {
        packed |= (1 << bit)
      }
    }
    bytecode[1 + i] = packed
  }

  return bytecode
}
