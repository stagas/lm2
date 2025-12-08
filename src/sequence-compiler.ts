import { SequenceBytecode } from './sequence.ts'

interface Modifiers {
  velocity: number
  hold: number
  repeat: number
  density: number
  offset: number
  prob: number
  jitter: number
  glide: number
  strum: number
}

const DEFAULT_MODIFIERS: Modifiers = {
  velocity: 1,
  hold: 0,
  repeat: 1,
  density: 1,
  offset: 0,
  prob: 1,
  jitter: 0,
  glide: 0,
  strum: 0,
}

const NOTE_NAMES = ['c', 'd', 'e', 'f', 'g', 'a', 'b']
const NOTE_OFFSETS: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
}

function noteNameToMidi(noteName: string): number {
  const match = noteName.match(/^([a-g])([#b]?)(-?\d+)$/i)
  if (!match) {
    throw new Error(`Invalid note name: ${noteName}`)
  }

  const [, note, accidental, octave] = match
  let midi = NOTE_OFFSETS[note.toLowerCase()] + (parseInt(octave) + 1) * 12

  if (accidental === '#') {
    midi += 1
  }
  else if (accidental === 'b') {
    midi -= 1
  }

  return midi
}

function midiToFrequency(midi: number): number {
  return 440 * Math.pow(2, (midi - 69) / 12)
}

function parseModifiers(str: string, parentMods: Modifiers, isSquareBracket = false): Modifiers {
  const mods = { ...parentMods }
  let i = 0

  while (i < str.length) {
    const char = str[i]
    const rest = str.slice(i + 1)

    switch (char) {
      case '.': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.velocity *= parseFloat('0.' + match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case ';': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.hold = parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '!': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.repeat = parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '%': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.density *= parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '/': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          const val = parseFloat(match[1])
          mods.density *= val === 0 ? 0 : 1 / val
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '?': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.prob *= parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '#': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.jitter = parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '\\': {
        const match = rest.match(/^([\d.]+)?/)
        if (match && match[1]) {
          mods.glide = parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          mods.glide = 1
          i++
        }
        break
      }
      case '>': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.offset += parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '<': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.offset -= parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '$': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          mods.strum = parseFloat(match[1])
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '*': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          const val = parseFloat(match[1])
          if (isSquareBracket) {
            mods.repeat = val
          }
          else {
            mods.density *= val
          }
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '@': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          const val = parseFloat(match[1])
          mods.density *= val === 0 ? 0 : 1 / val
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      default:
        i++
    }
  }

  return mods
}

function tokenize(input: string): string[] {
  const tokens: string[] = []
  let i = 0

  while (i < input.length) {
    const char = input[i]

    if (/\s/.test(char)) {
      i++
      continue
    }

    if (char === '<' || char === '[') {
      let depth = 1
      let j = i + 1
      const closingChar = char === '<' ? '>' : ']'

      while (j < input.length && depth > 0) {
        if (input[j] === char) {
          depth++
        }
        else if (input[j] === closingChar) {
          depth--
        }
        j++
      }

      // Capture modifiers after closing bracket
      const afterClose = j
      while (j < input.length && /[*.;!?#\\<>@%/$\d]/.test(input[j])) {
        j++
      }

      tokens.push(input.slice(i, j))
      i = j
    }
    else if (char === '_') {
      // Rest
      let j = i + 1
      while (j < input.length && /[*.;!?#\\<>@%/$\d]/.test(input[j])) {
        j++
      }
      tokens.push(input.slice(i, j))
      i = j
    }
    else {
      // Event or chord
      let j = i
      while (j < input.length && !/[\s\[\]]/.test(input[j])) {
        // Check for angle brackets only if they would start a new cycle (preceded by whitespace or at start)
        if ((input[j] === '<' || input[j] === '>') && j > i) {
          // Check if this might be the start of a new cycle (needs whitespace before)
          // or if it's part of modifiers (attached to current token)
          // Since modifiers are attached, we continue unless it's clearly a new cycle
          const prevChar = j > 0 ? input[j - 1] : ''
          if (input[j] === '<' && /\s/.test(prevChar)) {
            break
          }
        }
        j++
      }
      if (j === i) {
        // No progress, skip this character
        j++
      }
      tokens.push(input.slice(i, j))
      i = j
    }
  }

  return tokens
}

function compileToken(
  token: string,
  bc: SequenceBytecode,
  parentMods: Modifiers,
): void {
  if (token.startsWith('<')) {
    // Angle bracket cycle
    const closingIndex = token.lastIndexOf('>')
    const content = token.slice(1, closingIndex)
    const modifiersStr = token.slice(closingIndex + 1)
    const mods = parseModifiers(modifiersStr, parentMods, false)

    const innerTokens = tokenize(content)
    bc.cycle(
      innerTokens.length,
      mods.density,
      mods.repeat,
      1,
      mods.offset,
      mods.jitter,
      mods.prob,
    )

    // Children inherit only multiplicative modifiers (velocity, prob)
    const childMods: Modifiers = {
      velocity: mods.velocity,
      prob: mods.prob,
      hold: 0,
      repeat: 1,
      density: 1,
      offset: 0,
      jitter: 0,
      glide: 0,
      strum: 0,
    }

    for (const innerToken of innerTokens) {
      compileToken(innerToken, bc, childMods)
    }
  }
  else if (token.startsWith('[')) {
    // Square bracket cycle
    const closingIndex = token.lastIndexOf(']')
    const content = token.slice(1, closingIndex)
    const modifiersStr = token.slice(closingIndex + 1)
    const mods = parseModifiers(modifiersStr, parentMods, true)

    const innerTokens = tokenize(content)
    bc.cycle(
      innerTokens.length,
      1,
      mods.repeat,
      1,
      mods.offset,
      mods.jitter,
      mods.prob,
    )

    // Children inherit only multiplicative modifiers (velocity, prob)
    const childMods: Modifiers = {
      velocity: mods.velocity,
      prob: mods.prob,
      hold: 0,
      repeat: 1,
      density: 1,
      offset: 0,
      jitter: 0,
      glide: 0,
      strum: 0,
    }

    for (const innerToken of innerTokens) {
      compileToken(innerToken, bc, childMods)
    }
  }
  else if (token.startsWith('_')) {
    // Rest
    const modifiersStr = token.slice(1)
    const mods = parseModifiers(modifiersStr, parentMods)
    bc.rest(mods.repeat)
  }
  else {
    // Event or chord
    const eventMatch = token.match(/^([^\.*;!?#\\<>@%/$]+)(.*)$/)
    if (!eventMatch) return

    const [, eventPart, modifiersStr] = eventMatch
    const mods = parseModifiers(modifiersStr, parentMods)

    // Check if it's a chord (multiple note names without separators)
    const notes: number[] = []
    let remaining = eventPart

    while (remaining.length > 0) {
      // Try to match a note name
      const noteMatch = remaining.match(/^([a-g][#b]?-?\d+)/i)
      if (noteMatch) {
        const midi = noteNameToMidi(noteMatch[1])
        notes.push(midiToFrequency(midi))
        remaining = remaining.slice(noteMatch[1].length)
      }
      else {
        // Try to parse as a number
        const numMatch = remaining.match(/^(-?[\d.]+)/)
        if (numMatch) {
          notes.push(parseFloat(numMatch[1]))
          remaining = remaining.slice(numMatch[0].length)
        }
        else {
          break
        }
      }
    }

    if (notes.length === 0) return

    if (notes.length === 1) {
      bc.value(
        notes[0],
        mods.velocity,
        mods.hold,
        mods.repeat,
        mods.density,
        mods.offset,
        mods.prob,
        mods.jitter,
        mods.glide,
      )
    }
    else {
      bc.chord(
        notes,
        mods.strum,
        mods.velocity,
        mods.hold,
        mods.repeat,
        mods.density,
        mods.offset,
        mods.prob,
        mods.jitter,
        mods.glide,
      )
    }
  }
}

export interface TokenMetadata {
  text: string
  start: number
  length: number
  flatIndices: number[]
}

export interface CompiledSequence {
  bytecode: SequenceBytecode
  tokens: TokenMetadata[]
}

export function compileSequence(input: string): CompiledSequence {
  const bc = new SequenceBytecode()
  const tokens = tokenize(input)
  const tokenMetadata: TokenMetadata[] = []
  let flatEventIndex = 0

  const compileTokenWithMetadata = (
    token: string,
    parentMods: Modifiers,
    startPos: number,
    isRealToken: boolean,
  ): number => {
    const startFlatIndex = flatEventIndex

    if (token.startsWith('<') || token.startsWith('[')) {
      const isSquare = token.startsWith('[')
      const closingChar = isSquare ? ']' : '>'
      const closingIndex = token.lastIndexOf(closingChar)
      const content = token.slice(1, closingIndex)
      const modifiersStr = token.slice(closingIndex + 1)
      const mods = parseModifiers(modifiersStr, parentMods, isSquare)

      const innerTokens = tokenize(content)

      bc.cycle(
        innerTokens.length,
        isSquare ? 1 : mods.density,
        mods.repeat,
        1,
        mods.offset,
        mods.jitter,
        mods.prob,
        isSquare ? 1 : 0,
      )

      const childMods: Modifiers = {
        velocity: mods.velocity,
        prob: mods.prob,
        hold: 0,
        repeat: 1,
        density: 1,
        offset: 0,
        jitter: 0,
        glide: 0,
        strum: 0,
      }

      // Compile inner tokens once (VM will handle repetition)
      let innerContentPos = startPos + 1
      for (const innerToken of innerTokens) {
        const innerTokenStartInInput = input.indexOf(innerToken, innerContentPos)
        compileTokenWithMetadata(innerToken, childMods, innerTokenStartInInput, isRealToken)
        innerContentPos = innerTokenStartInInput + innerToken.length
      }

      // Calculate flat indices including repetition for visualization
      const innerEventCount = flatEventIndex - startFlatIndex
      flatEventIndex = startFlatIndex + (innerEventCount * mods.repeat)
    }
    else {
      compileToken(token, bc, parentMods)
      flatEventIndex++
    }

    const endFlatIndex = flatEventIndex
    const flatIndices: number[] = []
    for (let i = startFlatIndex; i < endFlatIndex; i++) {
      flatIndices.push(i)
    }

    if (isRealToken && startPos >= 0) {
      tokenMetadata.push({
        text: token,
        start: startPos,
        length: token.length,
        flatIndices,
      })
    }

    return flatEventIndex
  }

  let currentPos = 0
  for (const token of tokens) {
    const tokenStart = input.indexOf(token, currentPos)
    compileTokenWithMetadata(token, DEFAULT_MODIFIERS, tokenStart, true)
    currentPos = tokenStart + token.length
  }

  return {
    bytecode: bc,
    tokens: tokenMetadata,
  }
}
