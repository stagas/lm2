import { keywords, type LexError, type Token, type TokenKind } from './token.ts'

const isDigit = (c: string) => c >= '0' && c <= '9'
const isAlpha = (c: string) => (c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || c === '_' || c === '$'
const isAlphaNum = (c: string) => isAlpha(c) || isDigit(c)
const isIdentContinue = (c: string) => isAlphaNum(c) || c === '#'

export function lex(src: string): { tokens: Token[]; errors: LexError[] } {
  const t: Token[] = []
  const e: LexError[] = []

  let i = 0
  let line = 1
  let col = 1
  let lineStart = 0

  const peek = (k = 0) => (i + k < src.length ? src[i + k] : '\0')
  const atEnd = () => i >= src.length

  const advance = () => {
    const c = src[i++] ?? '\0'
    if (c === '\n') {
      line++
      col = 1
      lineStart = i
    }
    else {
      col++
    }
    return c
  }

  const add = (kind: TokenKind, start: number, startLine: number, startCol: number, value?: Token['value']) => {
    const lexeme = src.slice(start, i)
    t.push({
      kind,
      lexeme,
      value,
      line: startLine,
      column: startCol,
      length: i - start,
    })
  }

  const addError = (message: string, start: number, startLine: number, startCol: number) => {
    const end = Math.min(src.length, start + 80)
    const code = src.slice(lineStart, src.indexOf('\n', lineStart) === -1 ? src.length : src.indexOf('\n', lineStart))
    e.push({ message, line: startLine, column: startCol, length: Math.max(1, i - start), code })
    i = Math.max(i, start + 1)
  }

  const skipLineComment = () => {
    while (!atEnd() && peek() !== '\n') advance()
  }

  const skipBlockComment = () => {
    advance()
    advance()
    while (!atEnd()) {
      if (peek() === '*' && peek(1) === '/') {
        advance()
        advance()
        return
      }
      advance()
    }
    e.push({
      message: 'Unterminated block comment',
      line,
      column: col,
      length: 1,
      code: src.slice(lineStart, src.indexOf('\n', lineStart) === -1 ? src.length : src.indexOf('\n', lineStart)),
    })
  }

  const readNumber = (start: number, startLine: number, startCol: number, leadingDot = false) => {
    while (isDigit(peek())) advance()
    if (!leadingDot && peek() === '.' && peek(1) !== '.') {
      advance()
      while (isDigit(peek())) advance()
    }
    const s = src.slice(start, i)
    const n = Number(s)
    if (Number.isNaN(n)) {
      addError('Invalid number', start, startLine, startCol)
      return
    }
    add('number', start, startLine, startCol, n)
  }

  const readIdentifier = (start: number, startLine: number, startCol: number) => {
    while (isIdentContinue(peek())) advance()
    const s = src.slice(start, i)
    const kw = keywords[s]
    if (kw) add(kw, start, startLine, startCol)
    else add('identifier', start, startLine, startCol)
  }

  const readString = (quote: string, start: number, startLine: number, startCol: number) => {
    while (!atEnd()) {
      const c = advance()
      if (c === quote) {
        const raw = src.slice(start + 1, i - 1)
        add('string', start, startLine, startCol, raw)
        return
      }
    }
    addError('Unterminated string', start, startLine, startCol)
  }

  while (!atEnd()) {
    const start = i
    const startLine = line
    const startCol = col
    const c = advance()

    if (c === ' ' || c === '\t' || c === '\r' || c === '\n') continue

    if (c === '/' && peek() === '/') {
      skipLineComment()
      continue
    }
    if (c === '/' && peek() === '*') {
      i = start
      col = startCol
      skipBlockComment()
      continue
    }

    if (c === '\'' || c === '"') {
      readString(c, start, startLine, startCol)
      continue
    }

    // `$` is a special pipe placeholder token (used on the RHS of `|>`).
    // It should work naturally in expressions like `$+1`, `$*0.5`, `$.x`, `$[0]`.
    // Only treat `$` as identifier start when it's immediately followed by an identifier character.
    if (c === '$' && !isAlphaNum(peek())) {
      add('pipe_value', start, startLine, startCol)
      continue
    }

    if (isDigit(c)) {
      readNumber(start, startLine, startCol)
      continue
    }

    if (isAlpha(c)) {
      readIdentifier(start, startLine, startCol)
      continue
    }

    // Degree identifiers: `#1`, `#ii`, etc.
    if (c === '#' && (isDigit(peek()) || isAlpha(peek()))) {
      readIdentifier(start, startLine, startCol)
      continue
    }

    const two = c + peek()
    const three = c + peek() + peek(1)

    if (three === '>>>') {
      advance()
      advance()
      add('shift_ur', start, startLine, startCol)
      continue
    }
    if (two === '&&') {
      advance()
      add('and_and', start, startLine, startCol)
      continue
    }
    if (two === '||') {
      advance()
      add('or_or', start, startLine, startCol)
      continue
    }
    if (two === '==') {
      advance()
      add('eq_eq', start, startLine, startCol)
      continue
    }
    if (two === '<=') {
      advance()
      add('lte', start, startLine, startCol)
      continue
    }
    if (two === '>=') {
      advance()
      add('gte', start, startLine, startCol)
      continue
    }
    if (two === '<<') {
      advance()
      add('shift_l', start, startLine, startCol)
      continue
    }
    if (two === '>>') {
      advance()
      add('shift_r', start, startLine, startCol)
      continue
    }
    if (two === '**') {
      advance()
      if (peek() === '=') {
        advance()
        add('assign_power', start, startLine, startCol)
      }
      else {
        add('power', start, startLine, startCol)
      }
      continue
    }
    if (two === '->') {
      advance()
      add('arrow', start, startLine, startCol)
      continue
    }
    if (two === '|>') {
      advance()
      add('pipe', start, startLine, startCol)
      continue
    }
    if (two === '++') {
      advance()
      add('plus_plus', start, startLine, startCol)
      continue
    }
    if (two === '--') {
      advance()
      add('minus_minus', start, startLine, startCol)
      continue
    }

    if (c === '.' && peek() === '.' && peek(1) === '.') {
      advance()
      advance()
      add('ellipsis', start, startLine, startCol)
      continue
    }
    if (c === '.' && isDigit(peek())) {
      readNumber(start, startLine, startCol, true)
      continue
    }

    if (c === '+' && peek() === '=') {
      advance()
      add('assign_plus', start, startLine, startCol)
      continue
    }
    if (c === '-' && peek() === '=') {
      advance()
      add('assign_minus', start, startLine, startCol)
      continue
    }
    if (c === '*' && peek() === '=') {
      advance()
      add('assign_star', start, startLine, startCol)
      continue
    }
    if (c === '/' && peek() === '=') {
      advance()
      add('assign_slash', start, startLine, startCol)
      continue
    }
    if (c === '%' && peek() === '=') {
      advance()
      add('assign_percent', start, startLine, startCol)
      continue
    }

    if (c === '(') add('l_paren', start, startLine, startCol)
    else if (c === ')') add('r_paren', start, startLine, startCol)
    else if (c === '{') add('l_brace', start, startLine, startCol)
    else if (c === '}') add('r_brace', start, startLine, startCol)
    else if (c === '[') add('l_bracket', start, startLine, startCol)
    else if (c === ']') add('r_bracket', start, startLine, startCol)
    else if (c === ',') add('comma', start, startLine, startCol)
    else if (c === '?') add('question' as TokenKind, start, startLine, startCol)
    else if (c === ':') add('colon', start, startLine, startCol)
    else if (c === ';') add('semicolon', start, startLine, startCol)
    else if (c === '.') add('dot', start, startLine, startCol)
    else if (c === '+') add('plus', start, startLine, startCol)
    else if (c === '-') add('minus', start, startLine, startCol)
    else if (c === '*') add('star', start, startLine, startCol)
    else if (c === '/') add('slash', start, startLine, startCol)
    else if (c === '%') add('percent', start, startLine, startCol)
    else if (c === '!') add('bang', start, startLine, startCol)
    else if (c === '~') add('tilde', start, startLine, startCol)
    else if (c === '&') add('amp', start, startLine, startCol)
    else if (c === '|') add('bar', start, startLine, startCol)
    else if (c === '^') add('caret', start, startLine, startCol)
    else if (c === '<') add('lt', start, startLine, startCol)
    else if (c === '>') add('gt', start, startLine, startCol)
    else if (c === '=') add('assign', start, startLine, startCol)
    else add('invalid', start, startLine, startCol)
  }

  t.push({ kind: 'eof', lexeme: '', line, column: col, length: 0 })
  return { tokens: t, errors: e }
}
