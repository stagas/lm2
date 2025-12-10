import type { TokenMetadata } from './sequence-compiler.ts'

export interface SourceLocation {
  text: string
  start: number
  end: number
  tokenIndex: number
}

/**
 * Build a lookup map from bytecode position to source location
 */
export function buildSourceMap(tokens: TokenMetadata[]): Map<number, SourceLocation> {
  const map = new Map<number, SourceLocation>()

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    const location: SourceLocation = {
      text: token.text,
      start: token.start,
      end: token.start + token.length,
      tokenIndex: i,
    }

    // Map primary bytecode position
    map.set(token.bytecodePos, location)

    // Map all additional positions (for repeated events like euclidean rhythms)
    if (token.bytecodePositions) {
      for (const pos of token.bytecodePositions) {
        map.set(pos, location)
      }
    }
  }

  return map
}

/**
 * Get the source location for a bytecode position
 */
export function getSourceLocation(
  sourceMap: Map<number, SourceLocation>,
  bytecodePos: number,
): SourceLocation | undefined {
  return sourceMap.get(bytecodePos)
}

/**
 * Get all currently active tokens based on events in the history buffer
 */
export function getActiveTokens(
  sourceMap: Map<number, SourceLocation>,
  historyBuffer: Float32Array,
  historySize: number,
  currentSample: number,
): Set<number> {
  const activeTokenIndices = new Set<number>()

  for (let i = 0; i < historySize; i++) {
    const idx = i * 3
    const bytecodePos = Math.floor(historyBuffer[idx])
    const startSample = Math.floor(historyBuffer[idx + 1])
    const endSample = Math.floor(historyBuffer[idx + 2])

    // Skip empty entries
    if (startSample === 0 && endSample === 0) continue

    // Check if event is currently active
    const isActive = currentSample >= startSample && (endSample <= startSample || currentSample <= endSample)

    if (isActive) {
      const location = sourceMap.get(bytecodePos)
      if (location) {
        activeTokenIndices.add(location.tokenIndex)
      }
    }
  }

  return activeTokenIndices
}

