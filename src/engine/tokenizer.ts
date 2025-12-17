import type { Token, Tokenizer } from 'mini-code'
import { splitValueAndModifiers, tokenize as miniTokenize } from '../mini/tokenizer.ts'

// State for multiline strings and context
let inMultilineString: string | null = null // Tracks the quote type we're inside
let inMiniString: { quote: string; depth: number } | null = null // Tracks if we're inside mini('...')
let inMiniCall: number = -1 // Tracks the paren depth when we entered a mini() call
let persistedParenDepth: number = 0 // Tracks paren depth across lines

// Check if text looks like mini notation (contains notes, octaves, scales, etc)
function isMiniNotation(text: string): boolean {
  return /[a-z0-9<>\[\]]/.test(text)
}

function getMiniValueTokenType(value: string): string {
  if (!value) return 'default'
  const first = value[0]
  if (first === '[' || first === '<' || first === '(') return 'punctuation'
  if (/^[a-gA-G][#b]?-?\d+/.test(value)) return 'number'
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return 'number'
  if (/^[0-9]+(?:,[0-9]+)+$/.test(value)) return 'number'
  if (/^[ivxlcdm]+$/i.test(value)) return 'number'
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(value)) return 'parameter'
  return 'parameter'
}

function findUnescapedChar(line: string, ch: string, startIndex: number): number {
  for (let i = startIndex; i < line.length; i++) {
    if (line[i] !== ch) continue
    let backslashes = 0
    for (let j = i - 1; j >= 0 && line[j] === '\\'; j--) backslashes++
    if ((backslashes & 1) === 0) return i
  }
  return -1
}

function findGroupClose(text: string, open: '[' | '<' | '('): number {
  const close = open === '[' ? ']' : open === '<' ? '>' : ')'
  let depth = 0
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (ch === open) depth++
    else if (ch === close) {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function tokenizeMiniMods(mods: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < mods.length) {
    const ch = mods[i]!

    if (ch === '+') {
      if (mods[i + 1] === '?') {
        tokens.push({ type: 'comment', content: '+?', length: 2 })
        i += 2
      }
      else {
        tokens.push({ type: 'comment', content: '+', length: 1 })
        i++
      }
    }
    else if (ch === '$') {
      let j = i
      while (j < mods.length && mods[j] === '$') j++
      const dollars = mods.slice(i, j)
      tokens.push({ type: 'comment', content: dollars, length: dollars.length })
      i = j
    }
    else if (/[*!@/\\.;?\-]/.test(ch)) {
      tokens.push({ type: 'comment', content: ch, length: 1 })
      i++
    }
    else {
      tokens.push({ type: 'default', content: ch, length: 1 })
      i++
    }

    let j = i
    while (j < mods.length && /[0-9.]/.test(mods[j]!)) j++
    if (j > i) {
      const num = mods.slice(i, j)
      tokens.push({ type: 'number', content: num, length: num.length })
      i = j
    }
  }

  return tokens
}

function tokenizeMiniText(text: string): Token[] {
  const tokens: Token[] = []
  const miniTokens = miniTokenize(text)
  let cursor = 0

  for (const t of miniTokens) {
    if (t.start > cursor) {
      const between = text.slice(cursor, t.start)
      tokens.push({ type: 'default', content: between, length: between.length })
    }

    const raw = t.text
    const first = raw[0]
    if (first === '[' || first === '<' || first === '(') {
      const closeIndex = findGroupClose(raw, first)
      if (closeIndex !== -1) {
        const open = first as '[' | '<' | '('
        const close = open === '[' ? ']' : open === '<' ? '>' : ')'
        const inner = raw.slice(1, closeIndex)
        const after = raw.slice(closeIndex + 1)

        tokens.push({ type: 'punctuation', content: open, length: 1 })
        if (inner) tokens.push(...tokenizeMiniText(inner))
        tokens.push({ type: 'punctuation', content: close, length: 1 })
        if (after) tokens.push(...tokenizeMiniMods(after))
      }
      else {
        tokens.push({ type: 'punctuation', content: raw, length: raw.length })
      }
    }
    else {
      const { value, mods } = splitValueAndModifiers(raw)
      if (value) tokens.push({ type: getMiniValueTokenType(value), content: value, length: value.length })
      if (mods) tokens.push(...tokenizeMiniMods(mods))
    }

    cursor = t.end
  }

  if (cursor < text.length) {
    const rest = text.slice(cursor)
    tokens.push({ type: 'default', content: rest, length: rest.length })
  }

  return tokens
}

// Tokenize mini notation content
function tokenizeMiniContent(content: string): Token[] {
  return tokenizeMiniText(content)
}

export const tokenizer: Tokenizer = (line, isBeginOfCode): Token[] => {
  const tokens: Token[] = []
  let i = 0
  let parenDepth = persistedParenDepth // Start with the persisted depth from previous line
  let functionCallDepth = -1 // The depth at which we entered a function call
  let arrowParamDepth = -1 // The depth at which we entered arrow function params

  if (isBeginOfCode) {
    inMultilineString = null
    inMiniString = null
    inMiniCall = -1
    persistedParenDepth = 0
    parenDepth = 0
  }

  // If we're continuing a mini string from a previous line
  if (inMiniString) {
    const quote = inMiniString.quote
    const end = findUnescapedChar(line, quote, i)
    if (end === -1) {
      tokens.push(...tokenizeMiniContent(line))
      return tokens
    }

    const chunk = line.slice(0, end)
    tokens.push(...tokenizeMiniContent(chunk))
    tokens.push({ type: 'string', content: quote, length: 1 })
    i = end + 1
    inMiniString = null
  }

  // If we're continuing a regular multiline string from a previous line
  if (inMultilineString) {
    const end = findUnescapedChar(line, inMultilineString, i)
    if (end === -1) {
      tokens.push({ type: 'string', content: line.slice(i), length: line.length - i })
      return tokens
    }

    const chunk = line.slice(i, end + 1)
    tokens.push({ type: 'string', content: chunk, length: chunk.length })
    i = end + 1
    inMultilineString = null
  }

  while (i < line.length) {
    const char = line[i]

    // Skip whitespace
    if (/\s/.test(char)) {
      let whitespace = ''
      while (i < line.length && /\s/.test(line[i])) {
        whitespace += line[i]
        i++
      }
      tokens.push({ type: 'default', content: whitespace, length: whitespace.length })
      continue
    }

    // String literals (supports multiline)
    if (char === '"' || char === '\'' || char === '`') {
      const quoteChar = char
      const start = i
      const end = findUnescapedChar(line, quoteChar, i + 1)
      const foundClosing = end !== -1
      const string = foundClosing ? line.slice(start, end + 1) : line.slice(start)
      i = foundClosing ? end + 1 : line.length

      // Check if this string is inside a mini() call.
      // Walk backwards skipping pure-whitespace `default` tokens so we handle
      // cases like `mini(  '<...')` where whitespace was tokenized between '(' and the quote.
      let _prevIdx = tokens.length - 1
      while (
        _prevIdx >= 0
        && tokens[_prevIdx].type === 'default'
        && /^\s*$/.test(tokens[_prevIdx].content)
      ) {
        _prevIdx--
      }
      const isMiniCallSameLine = _prevIdx >= 1
        && tokens[_prevIdx]?.type === 'punctuation'
        && tokens[_prevIdx]?.content === '('
        && tokens[_prevIdx - 1]?.type === 'function'
        && tokens[_prevIdx - 1]?.content === 'mini'

      // Also check if we're inside a mini() call from a previous line
      const isMiniCallMultiline = inMiniCall !== -1 && parenDepth > inMiniCall
      const isMiniCallAny = isMiniCallSameLine || isMiniCallMultiline

      const stringContent = foundClosing ? string.slice(1, -1) : string.slice(1)
      // For mini calls, check if it looks like mini notation OR if string is not closed yet (multiline)
      const looksLikeMini = isMiniNotation(stringContent) || (!foundClosing && isMiniCallAny)

      if (isMiniCallAny && looksLikeMini) {
        tokens.push({ type: 'string', content: quoteChar, length: 1 })
        tokens.push(...tokenizeMiniContent(stringContent))
        if (foundClosing) tokens.push({ type: 'string', content: quoteChar, length: 1 })

        // If we didn't find the closing quote, we're starting a multiline mini string
        if (!foundClosing) {
          inMiniString = { quote: quoteChar, depth: parenDepth }
        }
      }
      else {
        tokens.push({ type: 'string', content: string, length: string.length })

        // If we didn't find the closing quote, we're starting a multiline string
        if (!foundClosing) {
          inMultilineString = quoteChar
        }
      }

      continue
    }

    // Numbers (including decimals starting with .)
    if (/\d/.test(char) || (char === '.' && i + 1 < line.length && /\d/.test(line[i + 1]))) {
      let number = ''
      while (i < line.length && (/\d/.test(line[i]) || line[i] === '.')) {
        number += line[i]
        i++
      }
      tokens.push({ type: 'number', content: number, length: number.length })
      continue
    }

    // Pipe operator (|>)
    if (char === '|' && i + 1 < line.length && line[i + 1] === '>') {
      tokens.push({ type: 'keyword', content: '|>', length: 2 })
      i += 2
      continue
    }

    // Arrow operator (->)
    if (char === '-' && i + 1 < line.length && line[i + 1] === '>') {
      tokens.push({ type: 'keyword', content: '->', length: 2 })
      i += 2
      continue
    }

    // Unipolar operator (^^)
    if (char === '^' && i + 1 < line.length && line[i + 1] === '^') {
      tokens.push({ type: 'operator', content: '^^', length: 2 })
      i += 2
      continue
    }

    // Power operator (^)
    if (char === '^') {
      tokens.push({ type: 'operator', content: '^', length: 1 })
      i++
      continue
    }

    // Comments
    if (char === '/' && i + 1 < line.length && line[i + 1] === '/') {
      const comment = line.substring(i)
      tokens.push({ type: 'comment', content: comment, length: comment.length })
      break
    }

    // Operators
    const operators = ['+', '-', '*', '/', '=', '!', '<', '>', '&', '|']
    if (operators.includes(char)) {
      tokens.push({ type: 'operator', content: char, length: 1 })
      i++
      continue
    }

    // Handle opening parenthesis - start tracking function call
    if (char === '(') {
      tokens.push({ type: 'punctuation', content: char, length: 1 })

      // Look ahead to see if this is an arrow function parameter list: (...)->
      let lookAhead = i + 1
      let tempDepth = 1
      let isArrowParams = false
      while (lookAhead < line.length && tempDepth > 0) {
        if (line[lookAhead] === '(') tempDepth++
        else if (line[lookAhead] === ')') {
          tempDepth--
          if (tempDepth === 0) {
            // Found matching ), check for ->
            let afterParen = lookAhead + 1
            while (afterParen < line.length && /\s/.test(line[afterParen])) afterParen++
            if (
              afterParen + 1 < line.length
              && line[afterParen] === '-'
              && line[afterParen + 1] === '>'
            ) {
              isArrowParams = true
            }
            break
          }
        }
        lookAhead++
      }

      if (isArrowParams && arrowParamDepth === -1) {
        arrowParamDepth = parenDepth
      }
      else {
        // Check if the previous non-whitespace token was a function
        let prevTokenIdx = tokens.length - 2 // -2 because we just added the '(' token
        while (
          prevTokenIdx >= 0
          && tokens[prevTokenIdx].type === 'default'
          && /\s/.test(tokens[prevTokenIdx].content)
        ) {
          prevTokenIdx--
        }
        const prevToken = prevTokenIdx >= 0 ? tokens[prevTokenIdx] : null
        if (prevToken && prevToken.type === 'function' && functionCallDepth === -1) {
          functionCallDepth = parenDepth
        }
      }

      parenDepth++
      i++
      continue
    }

    // Handle closing parenthesis - stop tracking function call
    if (char === ')') {
      tokens.push({ type: 'punctuation', content: char, length: 1 })
      if (parenDepth > 0) {
        parenDepth--
        if (parenDepth === functionCallDepth) {
          functionCallDepth = -1
        }
        if (parenDepth === arrowParamDepth) {
          arrowParamDepth = -1
        }
        if (parenDepth === inMiniCall) {
          inMiniCall = -1
        }
      }
      i++
      continue
    }

    // Other punctuation
    const punctuation = ['[', ']', '{', '}', ';', ',', '.', ':', '?']
    if (punctuation.includes(char)) {
      tokens.push({ type: 'punctuation', content: char, length: 1 })
      i++
      continue
    }

    // Variable syntax (%)
    if (char === '%') {
      tokens.push({ type: 'keyword', content: char, length: 1 })
      i++
      continue
    }

    // Identifiers and function names
    if (/[a-zA-Z_]/.test(char)) {
      let word = ''
      while (i < line.length && /[a-zA-Z0-9_]/.test(line[i])) {
        word += line[i]
        i++
      }

      // Look ahead to see if next non-whitespace char is '(' or ':'
      let lookAhead = i
      while (lookAhead < line.length && /\s/.test(line[lookAhead])) {
        lookAhead++
      }
      const nextChar = lookAhead < line.length ? line[lookAhead] : ''
      const isFollowedByParen = nextChar === '('
      const isFollowedByColon = nextChar === ':'

      const inFunctionCall = functionCallDepth !== -1 && parenDepth > functionCallDepth
      const inArrowParams = arrowParamDepth !== -1 && parenDepth > arrowParamDepth

      // Any identifier followed by '(' is a function call (built-in or user-defined)
      if (isFollowedByParen) {
        tokens.push({ type: 'function', content: word, length: word.length })
        // Track if this is a mini() call
        if (word === 'mini' && inMiniCall === -1) {
          inMiniCall = parenDepth
        }
      }
      else if (inArrowParams) {
        // Arrow function parameter
        tokens.push({ type: 'argument', content: word, length: word.length })
      }
      else if (isFollowedByColon) {
        // Parameter name followed by colon (named parameter syntax)
        // Treat as parameter even if the function call spans multiple lines
        tokens.push({ type: 'parameter', content: word, length: word.length })
      }
      else if (inFunctionCall) {
        // Known parameter name used inside a function call (positional or value)
        tokens.push({ type: 'parameter', content: word, length: word.length })
      }
      else {
        // Bare identifier
        tokens.push({ type: 'identifier', content: word, length: word.length })
      }
      continue
    }

    // Default case
    tokens.push({ type: 'default', content: char, length: 1 })
    i++
  }

  // Save paren depth for next line
  persistedParenDepth = parenDepth

  return tokens
}
