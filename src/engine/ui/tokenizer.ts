import type { Token, Tokenizer } from 'mini-code'
import { splitValueAndModifiers, tokenize as miniTokenize } from '../../mini/tokenizer.ts'

const keywords = ['of']

// State for multiline strings and context
let inMultilineString: string | null = null // Tracks the quote type we're inside
let inMiniString: { quote: string; depth: number; callName?: string | null } | null = null // Tracks if we're inside mini('...')
let inMiniCall: number = -1 // Tracks the paren depth when we entered a mini() call
let inMiniCallName: string | null = null // Tracks the function name ('mini' or 'timeline')
let persistedParenDepth: number = 0 // Tracks paren depth across lines

// Check if text looks like mini notation (contains notes, octaves, scales, etc)
function isMiniNotation(text: string): boolean {
  const t = text.trim()
  if (!t) return false

  // Obvious structural markers used by mini/timeline notations.
  if (/[,\s;\[\]<>]/.test(t)) return true

  // Single-token notes (e.g. "c4", "f#3", "bb-1")
  if (/(?:^|[\s\[,<])[a-gA-G][#b]?-?\d+/.test(t)) return true

  // Single-token roman scale degrees (e.g. "i", "v", "IV")
  if (/^[ivxlcdm]+$/i.test(t)) return true

  // Timeline single-token segments often start with "number,number"
  if (/^\d+(?:\.\d*)?,\d+/.test(t)) return true

  return false
}

function isHexColor(value: string): boolean {
  // Match hex colors: #f41, #ff4411, #fff, #ffffff, etc.
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(value)
}

function isRgbaColor(value: string): boolean {
  // Match rgba/rgb colors like: rgba(255, 100, 50, 0.5), rgb(255, 100, 50)
  return /^rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)$/.test(value)
}

function createToken(type: string, content: string): Token {
  const token: Token = { type, content, length: content.length }
  if (isHexColor(content)) {
    token.color = content
  }
  return token
}

function tokenizeStringForColors(str: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  // Match patterns for hex colors and rgba
  const hexPattern = /#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})/g
  const rgbaPattern = /rgba?\s*\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(?:,\s*[\d.]+\s*)?\)/g

  let lastIndex = 0
  const matches: Array<{ start: number; end: number; value: string; type: 'hex' | 'rgba' }> = []

  // Find all hex colors
  let match
  hexPattern.lastIndex = 0
  while ((match = hexPattern.exec(str)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: 'hex' })
  }

  // Find all rgba colors
  rgbaPattern.lastIndex = 0
  while ((match = rgbaPattern.exec(str)) !== null) {
    matches.push({ start: match.index, end: match.index + match[0].length, value: match[0], type: 'rgba' })
  }

  // Sort matches by start position
  matches.sort((a, b) => a.start - b.start)

  // Merge overlapping matches, keeping the first one
  const mergedMatches: typeof matches = []
  for (const m of matches) {
    if (mergedMatches.length === 0 || mergedMatches[mergedMatches.length - 1]!.end <= m.start) {
      mergedMatches.push(m)
    }
  }

  // Create tokens
  for (const m of mergedMatches) {
    if (m.start > lastIndex) {
      tokens.push({ type: 'string', content: str.slice(lastIndex, m.start), length: m.start - lastIndex })
    }
    const token: Token = { type: 'number', content: m.value, length: m.value.length }
    if (m.type === 'hex') {
      token.color = m.value
    }
    else if (m.type === 'rgba') {
      token.color = m.value
    }
    tokens.push(token)
    lastIndex = m.end
  }

  // Add any remaining string content
  if (lastIndex < str.length) {
    tokens.push({ type: 'string', content: str.slice(lastIndex), length: str.length - lastIndex })
  }

  return tokens.length > 0 ? tokens : [{ type: 'string', content: str, length: str.length }]
}

function getMiniValueTokenType(value: string): string {
  if (!value) return 'default'
  const first = value[0]
  if (first === '[' || first === '<' || first === '(') return 'punctuation'
  if (/^[a-gA-G][#b]?-?\d+/.test(value)) return 'number'
  if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(value)) return 'number'
  if (/^[0-9]+(?:,[0-9]+)+$/.test(value)) return 'number'
  if (/^[ivxlcdm]+$/i.test(value)) return 'number'
  if (isHexColor(value)) return 'number'
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
      // Single-character fallback
      tokens.push({ type: 'default', content: ch, length: 1 })
      i++
    }

    // Generic number parsing for any numbers immediately following other tokens.
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

function tokenizeTimelineEntry(entry: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  // Match pattern: <bar>,<volume>[e<N>?|l<N>?]?
  // Example: "33,1e1.5" or "65,0 " or "89,1e2 "
  const match = entry.match(/^(\d+),([0-9.]+)([el])?([0-9.]*)(.*)$/)
  if (!match) {
    // Fallback for malformed entries
    tokens.push({ type: 'default', content: entry, length: entry.length })
    return tokens
  }

  const bar = match[1]!
  const volume = match[2]!
  const operator = match[3] // 'e' or 'l'
  const operatorValue = match[4] // The number after e/l
  const rest = match[5] // Any trailing modifiers

  // bar is 'number' color
  tokens.push({ type: 'number', content: bar, length: bar.length })
  tokens.push({ type: 'default', content: ',', length: 1 })

  // volume is 'string' color
  tokens.push({ type: 'parameter', content: volume, length: volume.length })

  // e/l are 'operator' color
  if (operator) {
    tokens.push({ type: 'comment', content: operator, length: 1 })

    // N after e/l is 'parameter' color
    if (operatorValue) {
      tokens.push({ type: 'comment', content: operatorValue, length: operatorValue.length })
    }
  }

  // Any remaining trailing content
  if (rest) {
    tokens.push({ type: 'default', content: rest, length: rest.length })
  }

  return tokens
}

function tokenizeMiniText(text: string, isTimeline: boolean = false): Token[] {
  const tokens: Token[] = []
  const miniTokens = miniTokenize(text)
  let cursor = 0
  // Precompute first comment position (single-line comment marker)
  // We'll update this inside the loop if necessary.
  let firstCommentPos = text.indexOf('//')

  let isScaleOperator = false

  for (let ti = 0; ti < miniTokens.length; ti++) {
    const t = miniTokens[ti]!

    if (firstCommentPos !== -1 && firstCommentPos >= cursor && firstCommentPos < t.start) {
      const beforeComment = text.slice(cursor, firstCommentPos)
      if (beforeComment) tokens.push({ type: 'default', content: beforeComment, length: beforeComment.length })
      const commentText = text.slice(firstCommentPos)
      tokens.push({ type: 'comment', content: commentText, length: commentText.length })
      return tokens
    }

    if (t.start > cursor) {
      const between = text.slice(cursor, t.start)
      tokens.push({ type: 'default', content: between, length: between.length })
    }

    if (isScaleOperator) {
      isScaleOperator = false
      tokens.push({ type: 'number', content: t.text, length: t.text.length })
      cursor = t.end
      continue
    }

    if (t.text === 'scale') {
      isScaleOperator = true
      tokens.push({ type: 'parameter', content: t.text, length: t.text.length })
      cursor = t.end
      continue
    }

    const raw = t.text
    const first = raw[0]
    if (raw === '.' || raw === ':') {
      tokens.push({ type: 'punctuation', content: raw, length: raw.length })
      cursor = t.end
      continue
    }
    // If '//' falls inside this mini token, split and emit a comment token.
    if (firstCommentPos !== -1 && firstCommentPos >= t.start && firstCommentPos < t.end) {
      const offsetInRaw = firstCommentPos - t.start
      const before = raw.slice(0, offsetInRaw)
      const commentPart = raw.slice(offsetInRaw)
      if (before) {
        // Process the prefix of this token as if it's the original raw token.
        const pf = before
        const pfirst = pf[0]
        if (pfirst === '[' || pfirst === '<' || pfirst === '(') {
          const closeIndex = findGroupClose(pf, pfirst)
          if (closeIndex !== -1) {
            const open = pfirst as '[' | '<' | '('
            const close = open === '[' ? ']' : open === '<' ? '>' : ')'
            const inner = pf.slice(1, closeIndex)
            const after = pf.slice(closeIndex + 1)

            tokens.push({ type: 'punctuation', content: open, length: 1 })
            if (inner) tokens.push(...tokenizeMiniText(inner, isTimeline))
            tokens.push({ type: 'punctuation', content: close, length: 1 })
            if (after) tokens.push(...tokenizeMiniMods(after))
          }
          else {
            tokens.push({ type: 'punctuation', content: pf, length: pf.length })
          }
        }
        else {
          let { value, mods } = splitValueAndModifiers(pf)
          // Special-case timeline notation: numeric value may have trailing alpha
          // suffixes (e.g. "2,1l6"). If this is a timeline string, split alpha
          // suffix from the numeric value and treat it as mods so the numeric
          // portion is tokenized as a number.
          if (isTimeline && value) {
            const m = value.match(/^([0-9]+(?:,[0-9]+)*)([a-z].*)$/i)
            if (m) {
              value = m[1] ?? ''
              mods = (m[2] ?? '') + mods
            }
          }
          if (value) {
            if (isTimeline && /^\d+,/.test(value)) {
              tokens.push(...tokenizeTimelineEntry(value + mods))
              mods = ''
            }
            else {
              tokens.push(createToken(getMiniValueTokenType(value), value))
            }
          }
          if (mods) tokens.push(...tokenizeMiniMods(mods))
        }
      }

      // Now emit the comment for the rest and finish
      tokens.push({ type: 'comment', content: commentPart, length: commentPart.length })
      return tokens
    }
    if (first === '[' || first === '<' || first === '(') {
      const closeIndex = findGroupClose(raw, first)
      if (closeIndex !== -1) {
        const open = first as '[' | '<' | '('
        const close = open === '[' ? ']' : open === '<' ? '>' : ')'
        const inner = raw.slice(1, closeIndex)
        const after = raw.slice(closeIndex + 1)

        tokens.push({ type: 'punctuation', content: open, length: 1 })
        if (inner) tokens.push(...tokenizeMiniText(inner, isTimeline))
        tokens.push({ type: 'punctuation', content: close, length: 1 })
        if (after) tokens.push(...tokenizeMiniMods(after))
      }
      else {
        tokens.push({ type: 'punctuation', content: raw, length: raw.length })
      }
    }
    else {
      let { value, mods } = splitValueAndModifiers(raw)
      if (isTimeline && value) {
        const m = value.match(/^([0-9]+(?:,[0-9]+)*)([a-z].*)$/i)
        if (m) {
          value = m[1] ?? ''
          mods = (m[2] ?? '') + mods
        }
      }
      if (value) {
        if (isTimeline && /^\d+,/.test(value)) {
          tokens.push(...tokenizeTimelineEntry(value + mods))
          mods = ''
        }
        else {
          tokens.push(createToken(getMiniValueTokenType(value), value))
        }
      }
      if (mods) tokens.push(...tokenizeMiniMods(mods))
    }

    cursor = t.end
    // Update firstCommentPos in case there are later comments not found earlier
    if (firstCommentPos !== -1 && firstCommentPos < cursor) {
      // Already passed the comment; no further comment in this string
      firstCommentPos = -1
    }
  }

  if (cursor < text.length) {
    const rest = text.slice(cursor)
    const idx = rest.indexOf('//')
    if (idx !== -1) {
      const before = rest.slice(0, idx)
      const commentPart = rest.slice(idx)
      if (before) tokens.push({ type: 'default', content: before, length: before.length })
      tokens.push({ type: 'comment', content: commentPart, length: commentPart.length })
    }
    else {
      tokens.push({ type: 'default', content: rest, length: rest.length })
    }
  }

  return tokens
}

// Tokenize mini notation content
function tokenizeMiniContent(content: string, isTimeline: boolean = false): Token[] {
  return tokenizeMiniText(content, isTimeline)
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
      tokens.push(...tokenizeMiniContent(line, Boolean(inMiniString.callName === 'timeline')))
      return tokens
    }

    const chunk = line.slice(0, end)
    tokens.push(...tokenizeMiniContent(chunk, Boolean(inMiniString.callName === 'timeline')))
    tokens.push({ type: 'string', content: quote, length: 1 })
    i = end + 1
    inMiniString = null
  }

  // If we're continuing a regular multiline string from a previous line
  if (inMultilineString) {
    const end = findUnescapedChar(line, inMultilineString, i)
    if (end === -1) {
      tokens.push(...tokenizeStringForColors(line.slice(i)))
      return tokens
    }

    const chunk = line.slice(i, end)
    tokens.push(...tokenizeStringForColors(chunk))
    tokens.push({ type: 'string', content: inMultilineString, length: 1 })
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
        && (
          tokens[_prevIdx - 1]?.content === 'mini'
          || tokens[_prevIdx - 1]?.content === 'timeline'
        )

      // Also check if we're inside a mini() call from a previous line
      const isMiniCallMultiline = inMiniCall !== -1 && parenDepth > inMiniCall
      const isMiniCallAny = isMiniCallSameLine || isMiniCallMultiline

      const stringContent = foundClosing ? string.slice(1, -1) : string.slice(1)
      // For mini calls, check if it looks like mini notation OR if string is not closed yet (multiline)
      const looksLikeMini = isMiniNotation(stringContent) || (!foundClosing && isMiniCallAny)

      if (isMiniCallAny && looksLikeMini) {
        tokens.push({ type: 'string', content: quoteChar, length: 1 })
        const isTimelineAny = (isMiniCallSameLine && tokens[_prevIdx - 1]?.content === 'timeline')
          || (isMiniCallMultiline && inMiniCallName === 'timeline')
        tokens.push(...tokenizeMiniContent(stringContent, Boolean(isTimelineAny)))
        if (foundClosing) tokens.push({ type: 'string', content: quoteChar, length: 1 })

        // If we didn't find the closing quote, we're starting a multiline mini string
        if (!foundClosing) {
          inMiniString = { quote: quoteChar, depth: parenDepth, callName: inMiniCallName }
        }
      }
      else {
        tokens.push({ type: 'string', content: quoteChar, length: 1 })
        const stringContent = foundClosing ? string.slice(1, -1) : string.slice(1)
        tokens.push(...tokenizeStringForColors(stringContent))
        if (foundClosing) tokens.push({ type: 'string', content: quoteChar, length: 1 })

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

    // Dollar operator ($)
    if (char === '$') {
      tokens.push({ type: 'keyword', content: '$', length: 1 })
      i++
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
    const operators = ['+', '-', '*', '/', '=', '!', '<', '>', '&', '|', '%']
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
          inMiniCallName = null
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

    // Hex colors (#fff, #ffffff, etc.)
    if (char === '#' && i + 1 < line.length) {
      let hexColor = '#'
      let j = i + 1
      while (j < line.length && /[0-9a-fA-F]/.test(line[j])) {
        hexColor += line[j]
        j++
      }
      if ((hexColor.length === 4 || hexColor.length === 7) && isHexColor(hexColor)) {
        tokens.push({
          type: 'number',
          content: hexColor,
          length: hexColor.length,
          color: hexColor,
        })
        i = j
        continue
      }
    }

    // Identifiers and function names
    if (/[a-zA-Z#_]/.test(char)) {
      let word = ''
      while (i < line.length && /[a-zA-Z0-9#_]/.test(line[i])) {
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
        // Track if this is a mini() or timeline() call so we can tokenize their
        // string contents with the mini tokenizer.
        if ((word === 'mini' || word === 'timeline') && inMiniCall === -1) {
          inMiniCall = parenDepth
          inMiniCallName = word
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
      else if (keywords.includes(word)) {
        tokens.push({ type: 'function', content: word, length: word.length })
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
