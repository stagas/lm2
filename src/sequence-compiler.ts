import { SequenceBytecode } from './sequence.ts'

interface Modifiers {
  velocity: number
  hold: number
  repeat: number
  density: number
  speed: number // @N: 1/N speed (1 = normal, 0.5 = takes 2 slots)
  offset: number
  prob: number
  jitter: number
  glide: number
  strum: number
  spreadCycles: number // /N: spread children across N cycles (for square brackets)
  replicate: number // !N: replicate event N times (N slots, each plays once)
}

const DEFAULT_MODIFIERS: Modifiers = {
  velocity: 1,
  hold: 0,
  repeat: 1,
  density: 1,
  speed: 1,
  offset: 0,
  prob: 1,
  jitter: 0,
  glide: 0,
  strum: 0,
  spreadCycles: 0,
  replicate: 1,
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

function generateEuclideanPattern(beats: number, steps: number, offset: number = 0): boolean[] {
  if (beats <= 0 || steps <= 0 || beats > steps) {
    return new Array(steps).fill(false)
  }

  if (beats === 0) {
    return new Array(steps).fill(false)
  }

  // Euclidean rhythm: distribute beats evenly across steps
  // Use formula: step i is a hit if floor(i * beats / steps) != floor((i-1) * beats / steps)
  const pattern: boolean[] = new Array(steps).fill(false)
  pattern[0] = true // First step is always a hit

  for (let i = 1; i < steps; i++) {
    const prev = Math.floor(((i - 1) * beats) / steps)
    const curr = Math.floor((i * beats) / steps)
    pattern[i] = curr !== prev
  }

  // Apply user-specified offset
  if (offset !== 0) {
    const rotated = new Array(steps)
    for (let i = 0; i < steps; i++) {
      rotated[(i + offset) % steps] = pattern[i]
    }
    return rotated
  }

  return pattern
}

function parseModifiers(str: string, parentMods: Modifiers, isSquareBracket?: boolean): Modifiers {
  const mods = { ...parentMods, spreadCycles: parentMods.spreadCycles || 0, replicate: parentMods.replicate || 1 }
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
      case '*': {
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          const val = parseFloat(match[1])
          // *N means repeat N times
          mods.repeat = val
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
          if (isSquareBracket) {
            // For square brackets: /N means spread children across N cycles
            mods.spreadCycles = val
          }
          else {
            // For other contexts: /N means density *= 1/N (skip cycles)
            mods.density *= val === 0 ? 0 : 1 / val
          }
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
          // ? without number defaults to 0.5
          mods.prob *= 0.5
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
      case '@': {
        // @N means 1/N speed (slower), so @2 = 0.5x speed = takes 2 slots
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          const val = parseFloat(match[1])
          mods.speed *= val === 0 ? 1 : 1 / val
          i += match[0].length + 1
        }
        else {
          i++
        }
        break
      }
      case '!': {
        // !N means replicate the event N times (N slots, each plays once)
        // g4!2 should be equivalent to g4 g4 - two separate events in two slots
        const match = rest.match(/^([\d.]+)/)
        if (match) {
          const val = parseFloat(match[1])
          mods.replicate = val
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

function getTokenSlotCount(token: string, parentMods: Modifiers): number {
  // Slot count = how many parent slots this token consumes
  if (token.startsWith('<') || token.startsWith('[')) {
    const isSquare = token.startsWith('[')
    const closingChar = isSquare ? ']' : '>'
    const closingIndex = token.lastIndexOf(closingChar)
    const modifiersStr = token.slice(closingIndex + 1)
    const mods = parseModifiers(modifiersStr, parentMods, isSquare)
    // For cycles with *N (repeat > 1), the cycle still takes 1 slot
    // The repetition happens within that slot
    // For cycles with !N (replicate > 1), the cycle takes N slots
    // Only speed affects slot count: speed < 1 means slower, takes more parent slots
    const baseSlots = mods.replicate > 1 ? mods.replicate : 1
    return baseSlots / mods.speed
  }
  else if (token.startsWith('_') || token.startsWith('~')) {
    const modifiersStr = token.slice(1)
    const mods = parseModifiers(modifiersStr, parentMods)
    return mods.repeat / mods.speed
  }
  else {
    // Check for euclidean rhythm syntax: event(beats,steps[,offset])
    const euclideanMatch = token.match(/^([^\(]+)\((\d+),(\d+)(?:,(\d+))?\)(.*)$/)
    if (euclideanMatch) {
      const [, , , stepsStr, , modifiersStr] = euclideanMatch
      const steps = parseInt(stepsStr, 10)
      const mods = parseModifiers(modifiersStr, parentMods)
      return steps / mods.speed
    }

    // Events: slot count depends on speed and replicate modifiers
    // @N means 1/N speed, so @2 = 0.5x speed = takes 2 slots
    // !N means replicate N times, so !2 = takes 2 slots (each plays once)
    const eventMatch = token.match(/^([^\.*;!?#\\<>@%/$]+)(.*)$/)
    if (eventMatch) {
      const modifiersStr = eventMatch[2]
      const mods = parseModifiers(modifiersStr, parentMods)
      // Replicate takes precedence: if !N is used, it takes N slots
      if (mods.replicate > 1) {
        return mods.replicate
      }
      // If *N is used with @N, @N determines slot count
      // Otherwise, use speed modifier
      return 1 / mods.speed
    }
    return 1
  }
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
      while (j < input.length && /[*.;?#\\<>@%/$!\d]/.test(input[j])) {
        j++
      }

      tokens.push(input.slice(i, j))
      i = j
    }
    else if (char === '_' || char === '~') {
      // Rest (both _ and ~ are rest tokens)
      let j = i + 1
      while (j < input.length && /[*.;?#\\<>@%/$!\d]/.test(input[j])) {
        j++
      }
      tokens.push(input.slice(i, j))
      i = j
    }
    else {
      // Event or chord
      // Check for euclidean rhythm syntax: event(beats,steps[,offset])
      const euclideanMatch = input.slice(i).match(/^([^\(]+)\((\d+),(\d+)(?:,(\d+))?\)/)
      if (euclideanMatch) {
        let j = i + euclideanMatch[0].length
        // Continue to capture modifiers after the closing parenthesis
        while (j < input.length && /[*.;?#\\<>@%/$!\d]/.test(input[j])) {
          j++
        }
        tokens.push(input.slice(i, j))
        i = j
      }
      else {
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
  }

  return tokens
}

function compileToken(
  token: string,
  bc: SequenceBytecode,
  parentMods: Modifiers,
): void {
  if (token.startsWith('<')) {
    // Angle bracket cycle: identical to square bracket with /N (spread mode)
    // where N is the number of children
    const closingIndex = token.lastIndexOf('>')
    const content = token.slice(1, closingIndex)
    const modifiersStr = token.slice(closingIndex + 1)
    const mods = parseModifiers(modifiersStr, parentMods, true) // Use square bracket parsing

    const innerTokens = tokenize(content)

    if (innerTokens.length === 0) {
      // Empty angle bracket - create a rest cycle
      bc.cycle(1, 1, mods.repeat, 1, mods.offset, mods.jitter, mods.prob, 1)
      bc.rest(1)
      return
    }

    // Children inherit velocity, but not prob (prob only applies to cycle trigger)
    const childMods: Modifiers = {
      velocity: mods.velocity,
      prob: 1,
      hold: 0,
      repeat: 1,
      density: 1,
      speed: 1,
      offset: 0,
      jitter: 0,
      glide: 0,
      strum: 0,
      spreadCycles: 0,
      replicate: 1,
    }

    // Angle bracket: compile as square bracket with spread mode
    // With *N, spread slotCount * N effective events across slotCount cycles
    // For <c4 e4 g4>: 3 events in 3 cycles (1 per cycle)
    // For <c4 e4 g4>*2: 3*2 = 6 effective events in 3 cycles (2 per cycle, each 0.5 beats)
    // slotCount = actual children, repeatCount = cycles to spread across
    // The VM uses (slotCount * density) as effective slots, where density encodes the repeat
    const slotCount = innerTokens.length
    const repeatCount = slotCount // Number of cycles to spread across
    // Use density to encode the repeat multiplier: density = mods.repeat
    const density = mods.repeat

    bc.cycle(
      slotCount,
      mods.speed,
      repeatCount, // repeat = number of cycles to spread across
      density, // density = repeat multiplier (1 for normal, 2 for *2)
      mods.offset,
      mods.jitter,
      mods.prob,
      1, // isSquare = 1 (treat as square bracket)
    )

    // Compile each child once (VM handles repetition)
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

    // Children inherit velocity, but not prob (prob only applies to cycle trigger)
    const childMods: Modifiers = {
      velocity: mods.velocity,
      prob: 1,
      hold: 0,
      repeat: 1,
      density: 1,
      speed: 1,
      offset: 0,
      jitter: 0,
      glide: 0,
      strum: 0,
      spreadCycles: 0,
      replicate: 1,
    }

    // If /N is used (spreadCycles > 0), spread children across N cycles (one per cycle)
    // Otherwise, play all children in sequence within one cycle
    if (mods.spreadCycles > 0) {
      // Spread mode: one slot per child, repeat = spreadCycles
      const slotCount = innerTokens.length
      const repeat = mods.spreadCycles

      bc.cycle(
        slotCount,
        mods.speed,
        repeat,
        mods.density,
        mods.offset,
        mods.jitter,
        mods.prob,
        1, // isSquare = 1 for square brackets
      )

      for (const innerToken of innerTokens) {
        compileToken(innerToken, bc, childMods)
      }
    }
    else if (mods.replicate > 1) {
      // Replicate mode (!N): take N slots, play content N times (once per slot)
      // [g4 a4]!2 is equivalent to [g4 a4 g4 a4] - emit inner content N times
      let effectiveSlotCount = 0
      for (const innerToken of innerTokens) {
        effectiveSlotCount += getTokenSlotCount(innerToken, childMods)
      }
      effectiveSlotCount *= mods.replicate

      // Adjust speed so the VM knows this cycle takes N parent slots
      // speed = 1/N makes the cycle N times slower, taking N parent slots
      const effectiveSpeed = mods.speed / mods.replicate

      bc.cycle(
        effectiveSlotCount,
        effectiveSpeed,
        1, // No VM-level repeat needed
        mods.density,
        mods.offset,
        mods.jitter,
        mods.prob,
        1, // isSquare = 1 for square brackets
      )

      // Emit the inner tokens N times
      for (let r = 0; r < mods.replicate; r++) {
        for (const innerToken of innerTokens) {
          compileToken(innerToken, bc, childMods)
        }
      }
    }
    else {
      // Normal mode: sum of inner token slot counts, play all in one cycle
      let effectiveSlotCount = 0
      for (const innerToken of innerTokens) {
        effectiveSlotCount += getTokenSlotCount(innerToken, childMods)
      }

      // If density > 1, play N times in 1 slot (multiply repeat and speed by density)
      // If density < 1, it's used for skipping cycles (handled by VM)
      // Note: *N sets repeat directly, so we use repeat as-is (don't multiply by density)
      const effectiveSpeed = mods.density > 1 ? mods.speed * mods.density : mods.speed
      const effectiveRepeat = mods.repeat

      // For *N on cycles, we need to signal that this is NOT spread mode
      // We can use density = -1 as a flag, or check if repeat > 1 but spreadCycles === 0
      // Actually, we can use a very high density value to ensure it's not spread mode
      // Or better: only use spread mode detection in VM when density matches a specific pattern
      // For now, let's set density to a special value when repeat > 1 and spreadCycles === 0
      const effectiveDensity = mods.repeat > 1 && mods.spreadCycles === 0
        ? -mods.repeat // Negative density signals repeat mode (not spread)
        : mods.density

      bc.cycle(
        effectiveSlotCount,
        effectiveSpeed,
        effectiveRepeat,
        effectiveDensity,
        mods.offset,
        mods.jitter,
        mods.prob,
        1, // isSquare = 1 for square brackets
      )

      for (const innerToken of innerTokens) {
        compileToken(innerToken, bc, childMods)
      }
    }
  }
  else if (token.startsWith('_') || token.startsWith('~')) {
    // Rest (both _ and ~ are rest tokens)
    const modifiersStr = token.slice(1)
    const mods = parseModifiers(modifiersStr, parentMods)
    bc.rest(mods.repeat)
  }
  else {
    // Event or chord
    // Check for euclidean rhythm syntax: event(beats,steps[,offset])
    const euclideanMatch = token.match(/^([^\(]+)\((\d+),(\d+)(?:,(\d+))?\)(.*)$/)
    if (euclideanMatch) {
      const [, eventPart, beatsStr, stepsStr, offsetStr, modifiersStr] = euclideanMatch
      const beats = parseInt(beatsStr, 10)
      const steps = parseInt(stepsStr, 10)
      const offset = offsetStr ? parseInt(offsetStr, 10) : 0
      const mods = parseModifiers(modifiersStr, parentMods)

      // Generate euclidean pattern
      const pattern = generateEuclideanPattern(beats, steps, offset)

      // Parse the event part to get notes
      const notes: number[] = []
      let remaining = eventPart

      while (remaining.length > 0) {
        const noteMatch = remaining.match(/^([a-g][#b]?-?\d+)/i)
        if (noteMatch) {
          const midi = noteNameToMidi(noteMatch[1])
          notes.push(midiToFrequency(midi))
          remaining = remaining.slice(noteMatch[1].length)
        }
        else {
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

      // Compile pattern directly as events/rests in root cycle (no nested cycle)
      // Each step takes 1 slot in the parent cycle
      for (let i = 0; i < pattern.length; i++) {
        if (pattern[i]) {
          if (notes.length === 1) {
            bc.value(
              notes[0],
              mods.velocity,
              mods.hold,
              1, // slotCount
              1, // repeatCount
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
              1, // slotCount
              1, // repeatCount
              mods.density,
              mods.offset,
              mods.prob,
              mods.jitter,
              mods.glide,
            )
          }
        }
        else {
          bc.rest(1)
        }
      }
      return
    }

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

    // Calculate slotCount and repeatCount explicitly:
    // - *N: slotCount=1, repeatCount=N (repeat N times within 1 slot)
    // - @N: slotCount=N, repeatCount=1 (take N slots, trigger once)
    // - !N: slotCount=N, repeatCount=N (take N slots, trigger once per slot)
    // - @N*M: slotCount=N, repeatCount=M (take N slots, trigger M times)
    let slotCount: number
    let repeatCount: number

    if (mods.replicate > 1) {
      // !N: take N slots, trigger once per slot
      slotCount = mods.replicate
      repeatCount = mods.replicate
    } else if (mods.repeat > 1 && mods.speed < 1) {
      // @N*M: take N slots (from @N), trigger M times (from *M)
      slotCount = 1 / mods.speed
      repeatCount = mods.repeat
    } else if (mods.repeat > 1) {
      // *N: take 1 slot, trigger N times
      slotCount = 1
      repeatCount = mods.repeat
    } else {
      // @N or normal: take N slots (or 1), trigger once
      slotCount = 1 / mods.speed
      repeatCount = 1
    }

    if (notes.length === 1) {
      bc.value(
        notes[0],
        mods.velocity,
        mods.hold,
        slotCount,
        repeatCount,
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
        slotCount,
        repeatCount,
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
  bytecodePos: number
  bytecodePositions: number[] // All bytecode positions for this token (for repeated events)
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
    const bytecodePos = bc.position
    const bytecodePositions: number[] = [bytecodePos]

    if (token.startsWith('<') || token.startsWith('[')) {
      const isSquare = token.startsWith('[')
      const closingChar = isSquare ? ']' : '>'
      const closingIndex = token.lastIndexOf(closingChar)
      const content = token.slice(1, closingIndex)
      const modifiersStr = token.slice(closingIndex + 1)
      const mods = parseModifiers(modifiersStr, parentMods, isSquare)

      const innerTokens = tokenize(content)

      const childMods: Modifiers = {
        velocity: mods.velocity,
        prob: 1, // Prob not inherited - only applies to cycle trigger
        hold: 0,
        repeat: 1,
        density: 1,
        speed: 1,
        offset: 0,
        jitter: 0,
        glide: 0,
        strum: 0,
        spreadCycles: 0,
        replicate: 1,
      }

      if (isSquare) {
        // If /N is used (spreadCycles > 0), spread children across N cycles (one per cycle)
        // Otherwise, play all children in sequence within one cycle
        if (mods.spreadCycles > 0) {
          // Spread mode: one slot per child, repeat = spreadCycles
          const slotCount = innerTokens.length
          const repeat = mods.spreadCycles

          bc.cycle(
            slotCount,
            mods.speed,
            repeat,
            mods.density,
            mods.offset,
            mods.jitter,
            mods.prob,
            1, // isSquare = 1
          )
        }
        else if (mods.replicate > 1) {
          // Replicate mode (!N): take N slots, play content N times (once per slot)
          // [g4 a4]!2 is equivalent to [g4 a4 g4 a4] - emit inner content N times
          let effectiveSlotCount = 0
          for (const innerToken of innerTokens) {
            effectiveSlotCount += getTokenSlotCount(innerToken, childMods)
          }
          effectiveSlotCount *= mods.replicate

          // Adjust speed so the VM knows this cycle takes N parent slots
          // speed = 1/N makes the cycle N times slower, taking N parent slots
          const effectiveSpeed = mods.speed / mods.replicate

          bc.cycle(
            effectiveSlotCount,
            effectiveSpeed,
            1, // No VM-level repeat needed
            mods.density,
            mods.offset,
            mods.jitter,
            mods.prob,
            1, // isSquare = 1
          )
        }
        else {
          // Normal mode: sum of inner token slot counts, play all in one cycle
          let effectiveSlotCount = 0
          for (const innerToken of innerTokens) {
            effectiveSlotCount += getTokenSlotCount(innerToken, childMods)
          }

          // If density > 1, play N times in 1 slot (multiply repeat and speed by density)
          // If density < 1, it's used for skipping cycles (handled by VM)
          // Note: *N sets repeat directly, so we don't multiply repeat by density when repeat was set by *
          const effectiveSpeed = mods.density > 1 ? mods.speed * mods.density : mods.speed
          const effectiveRepeat = mods.repeat

          // For *N on cycles, use negative density to signal repeat mode (not spread)
          const effectiveDensity = mods.repeat > 1 && (mods.spreadCycles === 0 || mods.spreadCycles === undefined)
            ? -mods.repeat
            : mods.density

          bc.cycle(
            effectiveSlotCount,
            effectiveSpeed,
            effectiveRepeat,
            effectiveDensity,
            mods.offset,
            mods.jitter,
            mods.prob,
            1, // isSquare = 1
          )
        }
      }
      else {
        // Angle bracket cycle: identical to square bracket with /N (spread mode)
        // where N is the number of children
        if (innerTokens.length === 0) {
          bc.cycle(1, 1, mods.repeat, 1, mods.offset, mods.jitter, mods.prob, 1)
          bc.rest(1)
          return startFlatIndex
        }

        // Angle bracket: compile as square bracket with spread mode
        // With *N, spread slotCount * N effective events across slotCount cycles
        // For <c4 e4 g4>: 3 events in 3 cycles (1 per cycle)
        // For <c4 e4 g4>*2: 6 effective events in 3 cycles (2 per cycle, each 0.5 beats)
        // Use density to encode the repeat multiplier
        const slotCount = innerTokens.length
        const repeatCount = slotCount // Number of cycles to spread across
        const density = mods.repeat // Repeat multiplier (1 for normal, 2 for *2)

        bc.cycle(
          slotCount,
          mods.speed,
          repeatCount, // repeat = number of cycles to spread across
          density, // density = repeat multiplier
          mods.offset,
          mods.jitter,
          mods.prob,
          1, // isSquare = 1 (treat as square bracket)
        )
      }

      // Compile inner tokens
      // For replicate mode (!N), emit inner tokens N times
      // For other modes, VM handles repetition
      const repeatTimes = isSquare && mods.replicate > 1 ? mods.replicate : 1
      for (let r = 0; r < repeatTimes; r++) {
        let innerContentPos = startPos + 1
        for (const innerToken of innerTokens) {
          const innerTokenStartInInput = input.indexOf(innerToken, innerContentPos)
          compileTokenWithMetadata(innerToken, childMods, innerTokenStartInInput, isRealToken)
          innerContentPos = innerTokenStartInInput + innerToken.length
        }
      }

      // Calculate flat indices including repetition for visualization
      const innerEventCount = flatEventIndex - startFlatIndex
      const effectiveRepeat = mods.replicate > 1 ? 1 : mods.repeat // replicate already expanded above
      flatEventIndex = startFlatIndex + (innerEventCount * effectiveRepeat)
    }
    else {
      // Check for euclidean rhythm syntax: event(beats,steps[,offset])
      const euclideanMatch = token.match(/^([^\(]+)\((\d+),(\d+)(?:,(\d+))?\)(.*)$/)
      if (euclideanMatch) {
        const [, eventPart, beatsStr, stepsStr, offsetStr, modifiersStr] = euclideanMatch
        const beats = parseInt(beatsStr, 10)
        const steps = parseInt(stepsStr, 10)
        const offset = offsetStr ? parseInt(offsetStr, 10) : 0
        const mods = parseModifiers(modifiersStr, parentMods)

        // Generate euclidean pattern
        const pattern = generateEuclideanPattern(beats, steps, offset)

        // Parse the event part to get notes
        const notes: number[] = []
        let remaining = eventPart

        while (remaining.length > 0) {
          const noteMatch = remaining.match(/^([a-g][#b]?-?\d+)/i)
          if (noteMatch) {
            const midi = noteNameToMidi(noteMatch[1])
            notes.push(midiToFrequency(midi))
            remaining = remaining.slice(noteMatch[1].length)
          }
          else {
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

        if (notes.length > 0) {
          // Track bytecode positions for all events (not rests)
          const eventPositions: number[] = []

          // Compile pattern directly as events/rests in root cycle
          for (let i = 0; i < pattern.length; i++) {
            if (pattern[i]) {
              const eventPos = bc.position
              eventPositions.push(eventPos)
              if (notes.length === 1) {
                bc.value(
                  notes[0],
                  mods.velocity,
                  mods.hold,
                  1,
                  1,
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
                  1,
                  1,
                  mods.density,
                  mods.offset,
                  mods.prob,
                  mods.jitter,
                  mods.glide,
                )
              }
              flatEventIndex++
            }
            else {
              bc.rest(1)
            }
          }

          // Update bytecodePositions with all event positions
          bytecodePositions.length = 0
          bytecodePositions.push(...eventPositions)
        }
        else {
          compileToken(token, bc, parentMods)
          flatEventIndex++
        }
      }
      else {
        compileToken(token, bc, parentMods)
        flatEventIndex++
      }
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
        bytecodePos,
        bytecodePositions: bytecodePositions.length > 1 ? bytecodePositions : undefined,
      })
    }

    return flatEventIndex
  }

  // Always wrap in an implicit square bracket root cycle (1 bar = 1 cycle)
  // Calculate total slot count and duration for root cycle
  let totalSlotCount = 0
  let totalDurationBars = 0

  for (const token of tokens) {
    totalSlotCount += getTokenSlotCount(token, DEFAULT_MODIFIERS)

    // Calculate actual duration for this token in bars
    if (token.startsWith('[')) {
      // Square bracket: base is 1 bar, actual = repeat / speed
      const closingIndex = token.lastIndexOf(']')
      const modifiersStr = token.slice(closingIndex + 1)
      const mods = parseModifiers(modifiersStr, DEFAULT_MODIFIERS, true)
      totalDurationBars += mods.repeat / mods.speed
    }
    else if (token.startsWith('<')) {
      // Angle bracket: duration is based on first child's length
      const closingIndex = token.lastIndexOf('>')
      const content = token.slice(1, closingIndex)
      const modifiersStr = token.slice(closingIndex + 1)
      const mods = parseModifiers(modifiersStr, DEFAULT_MODIFIERS, false)
      const innerTokens = tokenize(content)
      if (innerTokens.length > 0) {
        const childMods: Modifiers = {
          velocity: 1,
          prob: 1,
          hold: 0,
          repeat: 1,
          density: 1,
          speed: 1,
          offset: 0,
          jitter: 0,
          glide: 0,
          strum: 0,
          spreadCycles: 0,
          replicate: 1,
        }
        const firstChildSlotCount = getTokenSlotCount(innerTokens[0]!, childMods)
        // Duration in bars = (first child length in beats) / 4 / speed
        totalDurationBars += (firstChildSlotCount / 4.0) / mods.speed
      }
    }
    else {
      // Check for euclidean rhythm syntax: event(beats,steps[,offset])
      const euclideanMatch = token.match(/^([^\(]+)\((\d+),(\d+)(?:,(\d+))?\)(.*)$/)
      if (euclideanMatch) {
        const [, , , stepsStr, , modifiersStr] = euclideanMatch
        const steps = parseInt(stepsStr, 10)
        const mods = parseModifiers(modifiersStr, DEFAULT_MODIFIERS)
        totalDurationBars += (steps / 4.0) / mods.speed
      }
      else {
        // Single event: base is slotCount beats, actual = (slotCount / 4) / speed bars
        const eventMatch = token.match(/^([^\.*;!?#\\<>@%/$]+)(.*)$/)
        if (eventMatch) {
          const modifiersStr = eventMatch[2]
          const mods = parseModifiers(modifiersStr, DEFAULT_MODIFIERS)
          const slotCount = getTokenSlotCount(token, DEFAULT_MODIFIERS)
          totalDurationBars += (slotCount / 4.0) / mods.speed
        }
      }
    }
  }

  // Create implicit square bracket root cycle (1 beat = 1 cycle = 1 second at 60 BPM)
  // Root is always 1 beat = 1 cycle, events are distributed equally
  // Each event gets equal width: 1 / number of events
  // Speed stays at 1.0 - the VM calculates cycle duration as 1 beat for square brackets
  const rootSpeed = 1.0

  bc.cycle(
    totalSlotCount,
    rootSpeed,
    1, // repeat
    1, // density
    0, // offset
    0, // jitter
    1, // prob
    1, // isSquare = 1 (implicit square bracket root - base 1 bar)
  )

  // Compile all tokens as children of implicit root cycle
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
