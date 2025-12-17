import type { Token, Tokenizer } from 'mini-code'

// State for multiline strings
let inMultilineString: string | null = null // Tracks the quote type we're inside

export const tokenizer: Tokenizer = (line, isBeginOfCode): Token[] => {
  const tokens: Token[] = []
  let i = 0
  let parenDepth = 0
  let functionCallDepth = -1 // The depth at which we entered a function call
  let arrowParamDepth = -1 // The depth at which we entered arrow function params

  if (isBeginOfCode) {
    inMultilineString = null
  }

  // If we're continuing a multiline string from a previous line
  if (inMultilineString) {
    let string = ''
    while (i < line.length) {
      if (line[i] === inMultilineString) {
        // Found closing quote
        string += line[i]
        i++
        tokens.push({ type: 'string', content: string, length: string.length })
        inMultilineString = null
        break
      }
      string += line[i]
      i++
    }

    // If we consumed the entire line without finding the closing quote
    if (inMultilineString && string.length > 0) {
      tokens.push({ type: 'string', content: string, length: string.length })
      return tokens
    }
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
      let string = char
      i++
      let foundClosing = false
      while (i < line.length) {
        if (line[i] === quoteChar) {
          // Found closing quote
          string += line[i]
          i++
          foundClosing = true
          break
        }
        string += line[i]
        i++
      }
      tokens.push({ type: 'string', content: string, length: string.length })

      // If we didn't find the closing quote, we're starting a multiline string
      if (!foundClosing) {
        inMultilineString = quoteChar
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

  return tokens
}
