import { functionDefinitions } from '../engine/ui/function-definitions.ts'
import { decimalsOf } from '../utils/number.ts'
import type {
  Arg,
  AssignOp,
  BlockStmt,
  DestructurePattern,
  Expr,
  ForHead,
  Loc,
  ObjectProp,
  Param,
  Program,
  Stmt,
  SwitchCase,
} from './ast.ts'
import { type LangError, lineText } from './errors.ts'
import type { Token, TokenKind } from './token.ts'

const locFrom = (a: { line: number; column: number; length: number },
  b?: { line: number; column: number; length: number }): Loc =>
{
  if (!b) return { line: a.line, column: a.column, length: a.length }
  const len = Math.max(1, (b.column + b.length) - a.column)
  return { line: a.line, column: a.column, length: len }
}

const locOf = (n: { loc: Loc } | Loc) => ('loc' in n ? n.loc : n)

const parseCache = new Map<string, { program: Program; errors: LangError[] }>()

export function parse(src: string, tokens: Token[]): { program: Program; errors: LangError[] } {
  const cached = parseCache.get(src)
  if (cached) return cached
  const p = new Parser(src, tokens)
  const program = p.parseProgram()
  const result = { program, errors: p.errors }
  parseCache.set(src, result)
  return result
}

class Parser {
  readonly errors: LangError[] = []
  private i = 0

  constructor(
    private readonly src: string,
    private readonly tokens: Token[],
  ) {}

  private cur(): Token {
    return this.tokens[this.i] ?? this.tokens[this.tokens.length - 1]!
  }

  private prev(): Token {
    return this.tokens[Math.max(0, this.i - 1)]!
  }

  private at(kind: TokenKind): boolean {
    return this.cur().kind === kind
  }

  private next(): Token {
    const t = this.cur()
    if (t.kind !== 'eof') this.i++
    return t
  }

  private match(kind: TokenKind): Token | null {
    if (!this.at(kind)) return null
    return this.next()
  }

  private error(t: Token, message: string): void {
    this.errors.push({
      message,
      line: t.line,
      column: t.column,
      length: Math.max(1, t.length),
      code: lineText(this.src, t.line),
    })
  }

  private expect(kind: TokenKind, message: string): Token {
    const t = this.cur()
    if (t.kind === kind) return this.next()
    this.error(t, message)
    return t
  }

  private skipStatementSep(): void {
    while (this.match('semicolon')) {}
  }

  private syncStmt(): void {
    while (!this.at('eof') && !this.at('semicolon') && !this.at('r_brace')) this.next()
    this.skipStatementSep()
  }

  parseProgram(): Program {
    const start = this.cur()
    const body: Stmt[] = []
    this.skipStatementSep()
    while (!this.at('eof')) {
      const s = this.parseStmt()
      body.push(s)
      this.skipStatementSep()
    }
    return { kind: 'program', body, loc: locFrom(start, this.prev()) }
  }

  private parseStmt(): Stmt {
    const t = this.cur()

    if (this.at('l_brace')) return this.parseBlockStmt()
    if (this.at('kw_for')) return this.parseForStmt()
    if (this.at('kw_while')) return this.parseWhileStmt()
    if (this.at('kw_do')) return this.parseDoWhileStmt()
    if (this.at('kw_switch')) return this.parseSwitchStmt()
    if (this.at('kw_try')) return this.parseTryStmt()
    if (this.at('kw_throw')) return this.parseThrowStmt()
    if (this.at('kw_return')) return this.parseReturnStmt()
    if (this.at('kw_break')) return this.parseBreakStmt()
    if (this.at('kw_continue')) return this.parseContinueStmt()

    const label = this.tryParseLabelStmt()
    if (label) return label

    const destructure = this.tryParseDestructureStmt()
    if (destructure) return destructure

    const expr = this.parseExpr()
    return { kind: 'expr_stmt', expr, loc: locFrom(t, this.prev()) }
  }

  private tryParseLabelStmt(): Stmt | null {
    if (!this.at('identifier')) return null
    const nameTok = this.cur()
    const nextTok = this.tokens[this.i + 1]
    if (!nextTok || nextTok.kind !== 'colon') return null
    this.next()
    this.next()
    const stmt = this.parseStmt()
    return { kind: 'label', name: nameTok.lexeme, stmt, loc: locFrom(nameTok, this.prev()) }
  }

  private tryParseDestructureStmt(): Stmt | null {
    const start = this.cur()
    if (!this.at('l_brace') && !this.at('l_bracket')) return null

    const save = this.i
    const pat = this.tryParseDestructurePattern()
    if (!pat) {
      this.i = save
      return null
    }
    if (!this.at('assign')) {
      this.i = save
      return null
    }
    this.next()
    const value = this.parseExpr()
    return { kind: 'destructure', pattern: pat, value, loc: locFrom(start, this.prev()) }
  }

  private tryParseDestructurePattern(): DestructurePattern | null {
    const start = this.cur()
    const save = this.i

    if (this.match('l_brace')) {
      const keys: string[] = []
      while (!this.at('eof') && !this.at('r_brace')) {
        if (!this.at('identifier')) {
          this.i = save
          return null
        }
        keys.push(this.next().lexeme)
        if (!this.match('comma')) break
      }
      if (!this.match('r_brace')) {
        this.i = save
        return null
      }
      return { kind: 'obj', keys, loc: locFrom(start, this.prev()) }
    }

    if (this.match('l_bracket')) {
      const items: string[] = []
      while (!this.at('eof') && !this.at('r_bracket')) {
        if (!this.at('identifier')) {
          this.i = save
          return null
        }
        items.push(this.next().lexeme)
        if (!this.match('comma')) break
      }
      if (!this.match('r_bracket')) {
        this.i = save
        return null
      }
      return { kind: 'arr', items, loc: locFrom(start, this.prev()) }
    }

    return null
  }

  private parseBlockStmt(): BlockStmt {
    const start = this.expect('l_brace', 'Expected \'{\'')
    const body: Stmt[] = []
    this.skipStatementSep()
    while (!this.at('eof') && !this.at('r_brace')) {
      const s = this.parseStmt()
      body.push(s)
      this.skipStatementSep()
    }
    this.expect('r_brace', 'Expected \'}\'')
    return { kind: 'block', body, loc: locFrom(start, this.prev()) }
  }

  private parseForStmt(): Stmt {
    const start = this.expect('kw_for', 'Expected \'for\'')
    this.expect('l_paren', 'Expected \'(\' after \'for\'')
    const head = this.parseForHead()
    this.expect('r_paren', 'Expected \')\' after for-head')
    const body = this.parseStmt()
    return { kind: 'for', head, body, loc: locFrom(start, this.prev()) }
  }

  private parseForHead(): ForHead {
    const start = this.cur()

    const save = this.i
    const maybeOf = this.tryParseForOfHead()
    if (maybeOf) return maybeOf
    this.i = save

    let init: Expr | undefined
    let test: Expr | undefined
    let update: Expr | undefined

    if (!this.at('semicolon')) init = this.parseExpr()
    this.expect('semicolon', 'Expected \';\' in for-head')
    if (!this.at('semicolon')) test = this.parseExpr()
    this.expect('semicolon', 'Expected \';\' in for-head')
    if (!this.at('r_paren')) update = this.parseExpr()

    return { kind: 'c_style', init, test, update, loc: locFrom(start, this.prev()) }
  }

  private tryParseForOfHead(): ForHead | null {
    const start = this.cur()
    const names: string[] = []

    const first = this.match('identifier')
    if (!first) return null
    names.push(first.lexeme)

    if (this.match('comma')) {
      const second = this.expect('identifier', 'Expected identifier')
      if (second.kind === 'identifier') names.push(second.lexeme)
      if (this.match('comma')) {
        const third = this.expect('identifier', 'Expected identifier')
        if (third.kind === 'identifier') names.push(third.lexeme)
      }
    }

    if (!this.match('kw_of')) return null
    const iterable = this.parseExpr()

    return {
      kind: 'of',
      value: names[0]!,
      index: names[1],
      length: names[2],
      iterable,
      loc: locFrom(start, this.prev()),
    }
  }

  private parseWhileStmt(): Stmt {
    const start = this.expect('kw_while', 'Expected \'while\'')
    this.expect('l_paren', 'Expected \'(\' after \'while\'')
    const test = this.parseExpr()
    this.expect('r_paren', 'Expected \')\' after while condition')
    const body = this.parseStmt()
    return { kind: 'while', test, body, loc: locFrom(start, this.prev()) }
  }

  private parseDoWhileStmt(): Stmt {
    const start = this.expect('kw_do', 'Expected \'do\'')
    const body = this.parseStmt()
    this.expect('kw_while', 'Expected \'while\' after \'do\' body')
    this.expect('l_paren', 'Expected \'(\' after \'while\'')
    const test = this.parseExpr()
    this.expect('r_paren', 'Expected \')\' after while condition')
    this.match('semicolon')
    return { kind: 'do_while', body, test, loc: locFrom(start, this.prev()) }
  }

  private parseSwitchStmt(): Stmt {
    const start = this.expect('kw_switch', 'Expected \'switch\'')
    this.expect('l_paren', 'Expected \'(\' after \'switch\'')
    const test = this.parseExpr()
    this.expect('r_paren', 'Expected \')\' after switch test')
    this.expect('l_brace', 'Expected \'{\' after switch')

    const cases: SwitchCase[] = []
    while (!this.at('eof') && !this.at('r_brace')) {
      const c = this.parseSwitchCase()
      cases.push(c)
    }

    this.expect('r_brace', 'Expected \'}\' after switch')
    return { kind: 'switch', test, cases, loc: locFrom(start, this.prev()) }
  }

  private parseSwitchCase(): SwitchCase {
    const start = this.cur()
    let test: Expr | undefined

    if (this.match('kw_case')) {
      test = this.parseExpr()
    }
    else if (this.match('kw_default')) {
      test = undefined
    }
    else {
      this.error(this.cur(), 'Expected \'case\' or \'default\'')
      this.next()
    }

    this.expect('colon', 'Expected \':\' after case')

    const body: Stmt[] = []
    this.skipStatementSep()
    while (!this.at('eof') && !this.at('r_brace') && !this.at('kw_case') && !this.at('kw_default')) {
      if (this.at('l_brace')) {
        body.push(this.parseBlockStmt())
        this.skipStatementSep()
        continue
      }
      const s = this.parseStmt()
      body.push(s)
      this.skipStatementSep()
    }

    return { kind: 'case', test, body, loc: locFrom(start, this.prev()) }
  }

  private parseTryStmt(): Stmt {
    const start = this.expect('kw_try', 'Expected \'try\'')
    const body = this.parseBlockStmt()

    let catchName: string | undefined
    let catchBody: BlockStmt | undefined
    let finallyBody: BlockStmt | undefined

    if (this.match('kw_catch')) {
      this.expect('l_paren', 'Expected \'(\' after \'catch\'')
      const nameTok = this.expect('identifier', 'Expected catch binding name')
      catchName = nameTok.kind === 'identifier' ? nameTok.lexeme : 'error'
      this.expect('r_paren', 'Expected \')\' after catch binding')
      catchBody = this.parseBlockStmt()
    }

    if (this.match('kw_finally')) {
      finallyBody = this.parseBlockStmt()
    }

    if (!catchBody && !finallyBody) {
      this.error(this.cur(), 'Expected \'catch\' or \'finally\' after \'try\' block')
    }

    return { kind: 'try', body, catchName, catchBody, finallyBody, loc: locFrom(start, this.prev()) }
  }

  private parseThrowStmt(): Stmt {
    const start = this.expect('kw_throw', 'Expected \'throw\'')
    const value = this.parseExpr()
    return { kind: 'throw', value, loc: locFrom(start, this.prev()) }
  }

  private parseReturnStmt(): Stmt {
    const start = this.expect('kw_return', 'Expected \'return\'')
    if (this.at('semicolon') || this.at('r_brace') || this.at('eof')) {
      return { kind: 'return', loc: locFrom(start, start) }
    }
    const value = this.parseExpr()
    return { kind: 'return', value, loc: locFrom(start, this.prev()) }
  }

  private parseBreakStmt(): Stmt {
    const start = this.expect('kw_break', 'Expected \'break\'')
    let label: string | undefined
    if (this.at('identifier')) label = this.next().lexeme
    return { kind: 'break', label, loc: locFrom(start, this.prev()) }
  }

  private parseContinueStmt(): Stmt {
    const start = this.expect('kw_continue', 'Expected \'continue\'')
    let label: string | undefined
    if (this.at('identifier')) label = this.next().lexeme
    return { kind: 'continue', label, loc: locFrom(start, this.prev()) }
  }

  private parseExpr(): Expr {
    return this.parseAssign()
  }

  private parseAssign(): Expr {
    const left = this.parsePipe()
    const t = this.cur()
    const op = this.assignOp(t.kind)
    if (!op) return left
    this.next()
    const value = this.parseAssign()
    return { kind: 'assign', op, target: left, value, loc: locFrom(left.loc, value.loc) } as const
  }

  private assignOp(kind: TokenKind): AssignOp | null {
    if (kind === 'assign') return '='
    if (kind === 'assign_plus') return '+='
    if (kind === 'assign_minus') return '-='
    if (kind === 'assign_star') return '*='
    if (kind === 'assign_slash') return '/='
    if (kind === 'assign_percent') return '%='
    if (kind === 'assign_power') return '**='
    return null
  }

  private parsePipe(): Expr {
    let expr = this.parseOr()
    while (this.match('pipe')) {
      const right = this.parseOr()
      expr = { kind: 'binary', op: '|>', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseOr(): Expr {
    const start = this.cur()
    let expr = this.parseAnd()
    while (this.match('or_or')) {
      const right = this.parseAnd()
      expr = { kind: 'binary', op: '||', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }

    // Ternary operator (condition ? thenExpr : elseExpr) desugared to `if` expression.
    if (this.match('question' as TokenKind)) {
      const questionTok = this.prev()
      const thenExpr = this.parseExpr()
      const colonTok = this.expect('colon', 'Expected \':\' after ternary consequent')
      const elseExpr = this.parseExpr()
      return {
        kind: 'if',
        test: expr,
        then: thenExpr,
        else: elseExpr,
        loc: locFrom(start, locOf(elseExpr)),
        questionLoc: locFrom(questionTok),
        colonLoc: locFrom(colonTok),
      }
    }

    return expr
  }

  private parseAnd(): Expr {
    let expr = this.parseEq()
    while (this.match('and_and')) {
      const right = this.parseEq()
      expr = { kind: 'binary', op: '&&', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseEq(): Expr {
    let expr = this.parseCmp()
    while (this.match('eq_eq')) {
      const right = this.parseCmp()
      expr = { kind: 'binary', op: '==', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseCmp(): Expr {
    let expr = this.parseBitOr()
    for (;;) {
      const k = this.cur().kind
      if (k !== 'lt' && k !== 'lte' && k !== 'gt' && k !== 'gte') break
      this.next()
      const right = this.parseBitOr()
      const op = k === 'lt' ? '<' : k === 'lte' ? '<=' : k === 'gt' ? '>' : '>='
      expr = { kind: 'binary', op, left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseBitOr(): Expr {
    let expr = this.parseBitXor()
    while (this.match('bar')) {
      const right = this.parseBitXor()
      expr = { kind: 'binary', op: '|', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseBitXor(): Expr {
    let expr = this.parseBitAnd()
    while (this.match('caret')) {
      const right = this.parseBitAnd()
      expr = { kind: 'binary', op: '^', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseBitAnd(): Expr {
    let expr = this.parseShift()
    while (this.match('amp')) {
      const right = this.parseShift()
      expr = { kind: 'binary', op: '&', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseShift(): Expr {
    let expr = this.parseAdd()
    for (;;) {
      const k = this.cur().kind
      if (k !== 'shift_l' && k !== 'shift_r' && k !== 'shift_ur') break
      this.next()
      const right = this.parseAdd()
      const op = k === 'shift_l' ? '<<' : k === 'shift_r' ? '>>' : '>>>'
      expr = { kind: 'binary', op, left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseAdd(): Expr {
    let expr = this.parseMul()
    for (;;) {
      const k = this.cur().kind
      if (k !== 'plus' && k !== 'minus') break
      this.next()
      const right = this.parseMul()
      expr = { kind: 'binary', op: k === 'plus' ? '+' : '-', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseMul(): Expr {
    let expr = this.parsePow()
    for (;;) {
      const k = this.cur().kind
      if (k !== 'star' && k !== 'slash' && k !== 'percent') break
      this.next()
      const right = this.parsePow()
      const op = k === 'star' ? '*' : k === 'slash' ? '/' : '%'
      expr = { kind: 'binary', op, left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parsePow(): Expr {
    let expr = this.parseUnary()
    if (this.match('power')) {
      const right = this.parsePow()
      expr = { kind: 'binary', op: '**', left: expr, right, loc: locFrom(expr.loc, right.loc) }
    }
    return expr
  }

  private parseUnary(): Expr {
    const t = this.cur()
    if (this.match('minus')) {
      const expr = this.parseUnary()
      // Fold `-<number>` into a single numeric literal when `-` is directly adjacent to the number token.
      // This keeps literal-only updates and literal extraction working (they rely on a contiguous `-?\d...` span).
      if (expr.kind === 'number' && expr.loc.line === t.line && expr.loc.column === t.column + t.length) {
        const delta = expr.loc.column - t.column
        const slider = expr.slider
          ? { ...expr.slider, widgetLength: (expr.slider.widgetLength ?? expr.loc.length) + delta }
          : undefined
        return {
          ...expr,
          value: -expr.value,
          raw: `-${expr.raw}`,
          loc: locFrom(t, expr.loc),
          slider,
        }
      }
      return { kind: 'unary', op: '-', expr, loc: locFrom(t, expr.loc) }
    }
    if (this.match('bang')) {
      const expr = this.parseUnary()
      return { kind: 'unary', op: '!', expr, loc: locFrom(t, expr.loc) }
    }
    if (this.match('tilde')) {
      const expr = this.parseUnary()
      return { kind: 'unary', op: '~', expr, loc: locFrom(t, expr.loc) }
    }
    if (this.match('plus_plus')) {
      const expr = this.parseUnary()
      return { kind: 'unary', op: '++', expr, loc: locFrom(t, expr.loc) }
    }
    if (this.match('minus_minus')) {
      const expr = this.parseUnary()
      return { kind: 'unary', op: '--', expr, loc: locFrom(t, expr.loc) }
    }
    return this.parsePostfix()
  }

  private parsePostfix(): Expr {
    let expr = this.parsePrimary()
    for (;;) {
      if (this.match('l_paren')) {
        if (expr.kind === 'number') {
          const minTok = this.cur()
          const maxTok = this.tokens[this.i + 1]
          const expTok = this.tokens[this.i + 2]
          const endTok = this.tokens[this.i + (expTok?.kind === 'number' ? 3 : 2)]
          if (minTok.kind === 'number' && maxTok?.kind === 'number' && endTok?.kind === 'r_paren') {
            const minPrecision = decimalsOf(minTok.lexeme)
            const maxPrecision = decimalsOf(maxTok.lexeme)
            const valuePrecision = decimalsOf(expr.raw ?? '')
            const precision = Math.max(minPrecision, maxPrecision, valuePrecision)
            this.next()
            this.next()
            let exp: number | undefined
            if (expTok?.kind === 'number') {
              exp = Number(expTok.value)
              this.next()
            }
            this.next() // consume r_paren
            expr = {
              ...expr,
              slider: {
                min: Number(minTok.value),
                max: Number(maxTok.value),
                widgetLength: endTok.line === expr.loc.line
                  ? (endTok.column + endTok.length - expr.loc.column)
                  : expr.loc.length,
                precision,
                exp,
              },
            }
            continue
          }
        }
        const args = this.parseArgs()
        const end = this.expect('r_paren', 'Expected \')\'')
        expr = { kind: 'call', callee: expr, args, loc: locFrom(expr.loc, end) }

        continue
      }
      if (this.match('dot')) {
        const id = this.expect('identifier', 'Expected property name after \'.\'')
        const prop = id.kind === 'identifier' ? id.lexeme : 'prop'
        expr = { kind: 'member', object: expr, prop, computed: false, loc: locFrom(expr.loc, id) }
        continue
      }
      if (expr.kind === 'string' && this.at('l_bracket')) break
      if (this.match('l_bracket')) {
        const index = this.parseExpr()
        const end = this.expect('r_bracket', 'Expected \']\'')
        expr = { kind: 'member', object: expr, index, computed: true, loc: locFrom(expr.loc, end) }
        continue
      }
      if (this.match('plus_plus')) {
        expr = { kind: 'postfix', op: '++', expr, loc: locFrom(expr.loc, this.prev()) }
        continue
      }
      if (this.match('minus_minus')) {
        expr = { kind: 'postfix', op: '--', expr, loc: locFrom(expr.loc, this.prev()) }
        continue
      }
      break
    }
    return expr
  }

  private parseArgs(): Arg[] {
    const args: Arg[] = []
    this.skipStatementSep()
    if (this.at('r_paren')) return args
    while (!this.at('eof') && !this.at('r_paren')) {
      const start = this.cur()
      if (this.at('identifier') && this.tokens[this.i + 1]?.kind === 'colon') {
        const nameTok = this.next()
        this.next()
        this.skipStatementSep()
        if (this.at('comma') || this.at('r_paren')) {
          // `name:` shorthand
          args.push({ kind: 'shorthand', name: nameTok.lexeme, loc: locFrom(nameTok) })
        }
        else {
          const value = this.parseExpr()
          args.push({ kind: 'named', name: nameTok.lexeme, value, loc: locFrom(nameTok, value.loc) })
        }
      }
      else {
        const value = this.parseExpr()
        args.push({ kind: 'pos', value, loc: locFrom(start, value.loc) })
      }

      if (!this.match('comma')) break
      this.skipStatementSep()
    }
    return args
  }

  private parsePrimary(): Expr {
    const t = this.cur()

    if (this.match('number')) {
      return { kind: 'number', value: Number(t.value), raw: t.lexeme, loc: locFrom(t) }
    }
    if (this.match('string')) {
      return { kind: 'string', value: String(t.value ?? ''), raw: t.lexeme, loc: locFrom(t) }
    }
    if (this.match('kw_true')) return { kind: 'bool', value: true, loc: locFrom(t) }
    if (this.match('kw_false')) return { kind: 'bool', value: false, loc: locFrom(t) }
    if (this.match('kw_null')) return { kind: 'null', loc: locFrom(t) }
    if (this.match('kw_undefined')) return { kind: 'undefined', loc: locFrom(t) }
    if (this.match('pipe_value')) return { kind: 'pipe_value', loc: locFrom(t) }

    const fnFromId = this.tryParseArrowFuncFromIdent()
    if (fnFromId) return fnFromId

    if (this.at('l_paren')) {
      const fnFromParen = this.tryParseArrowFuncFromParen()
      if (fnFromParen) return fnFromParen
      this.expect('l_paren', 'Expected \'(\'')
      const expr = this.parseExpr()
      this.expect('r_paren', 'Expected \')\'')
      return expr
    }

    if (this.at('kw_if')) return this.parseIfExpr()

    if (this.match('identifier')) {
      return { kind: 'ident', name: t.lexeme, loc: locFrom(t) }
    }

    if (this.at('l_bracket')) return this.parseArrayExpr()
    if (this.at('l_brace')) return this.parseObjectExpr()

    this.error(t, 'Expected expression')
    this.next()
    return { kind: 'ident', name: 'error', loc: locFrom(t) }
  }

  private parseIfExpr(): Expr {
    const start = this.expect('kw_if', 'Expected \'if\'')
    this.expect('l_paren', 'Expected \'(\' after \'if\'')
    const test = this.parseExpr()
    this.expect('r_paren', 'Expected \')\'')
    const then = this.at('l_brace') ? this.parseBlockStmt() : this.parseExpr()
    const elseTok = this.expect('kw_else', 'Expected \'else\'')
    const elsePart = this.at('kw_if')
      ? this.parseIfExpr()
      : this.at('l_brace')
      ? this.parseBlockStmt()
      : this.parseExpr()
    return {
      kind: 'if',
      test,
      then,
      else: elsePart,
      loc: locFrom(start, locOf(elsePart)),
      ifLoc: locFrom(start),
      elseLoc: locFrom(elseTok),
    }
  }

  private parseArrayExpr(): Expr {
    const start = this.expect('l_bracket', 'Expected \'[\'')
    const items: Expr[] = []
    this.skipStatementSep()
    while (!this.at('eof') && !this.at('r_bracket')) {
      const item = this.parseExpr()
      items.push(item)
      if (!this.match('comma')) break
      this.skipStatementSep()
    }
    const end = this.expect('r_bracket', 'Expected \']\'')
    return { kind: 'array', items, loc: locFrom(start, end) }
  }

  private parseObjectExpr(): Expr {
    const start = this.expect('l_brace', 'Expected \'{\'')
    const props: ObjectProp[] = []
    this.skipStatementSep()
    while (!this.at('eof') && !this.at('r_brace')) {
      const keyTok = this.cur()
      let key: string | null = null
      if (this.match('identifier')) key = keyTok.lexeme
      else if (this.match('string')) key = String(keyTok.value ?? '')
      else {
        this.error(this.cur(), 'Expected property key')
        this.next()
      }
      this.expect('colon', 'Expected \':\' after property key')
      const value = this.parseExpr()
      if (key !== null) props.push({ key, value, loc: locFrom(keyTok, value.loc) })
      if (!this.match('comma')) break
      this.skipStatementSep()
    }
    const end = this.expect('r_brace', 'Expected \'}\'')
    return { kind: 'object', props, loc: locFrom(start, end) }
  }

  private tryParseArrowFuncFromIdent(): Expr | null {
    if (!this.at('identifier')) return null
    const nameTok = this.cur()
    if (this.tokens[this.i + 1]?.kind !== 'arrow') return null
    this.next()
    this.next()
    const params: Param[] = [{ name: nameTok.lexeme, isRest: false, loc: locFrom(nameTok) }]
    const body = this.at('l_brace') ? this.parseBlockStmt() : this.parseExpr()
    return { kind: 'func', params, body, loc: locFrom(nameTok, locOf(body)) }
  }

  private tryParseArrowFuncFromParen(): Expr | null {
    if (!this.at('l_paren') || !this.hasArrowAfterParen(this.i)) return null
    const start = this.next()
    const params: Param[] = []
    let autoParamId = 0

    this.skipStatementSep()
    if (!this.at('r_paren')) {
      while (!this.at('eof') && !this.at('r_paren')) {
        const pStart = this.cur()
        let isRest = false
        if (this.match('ellipsis')) isRest = true
        let pattern: DestructurePattern | undefined
        let nameTok: Token | Loc = this.cur()
        let name = 'param'

        if (this.at('l_brace') || this.at('l_bracket')) {
          if (isRest) {
            this.error(pStart, 'Rest parameter cannot be a destructuring pattern')
            isRest = false
          }
          const pat = this.tryParseDestructurePattern()
          if (!pat) {
            this.error(this.cur(), 'Invalid destructuring parameter pattern')
            while (!this.at('eof') && !this.at('comma') && !this.at('r_paren')) this.next()
          }
          else {
            pattern = pat
            nameTok = locOf(pat)
          }
          name = `__param${autoParamId++}`
        }
        else {
          const tok = this.expect('identifier', 'Expected parameter name')
          nameTok = tok
          name = tok.kind === 'identifier' ? tok.lexeme : 'param'
        }
        let def: Expr | undefined
        if (this.match('assign')) def = this.parseExpr()
        params.push({ name, isRest, default: def, pattern, loc: locFrom(pStart, def?.loc ?? nameTok) })
        if (!this.match('comma')) break
        this.skipStatementSep()
      }
    }
    this.expect('r_paren', 'Expected \')\'')
    this.expect('arrow', 'Expected \'->\' for arrow function')
    const body = this.at('l_brace') ? this.parseBlockStmt() : this.parseExpr()
    return { kind: 'func', params, body, loc: locFrom(start, locOf(body)) }
  }

  private hasArrowAfterParen(startIdx: number): boolean {
    let depth = 0
    for (let i = startIdx; i < this.tokens.length; i++) {
      const kind = this.tokens[i].kind
      if (kind === 'l_paren') {
        depth++
      }
      else if (kind === 'r_paren') {
        depth--
        if (depth === 0) {
          return this.tokens[i + 1]?.kind === 'arrow'
        }
      }
    }
    return false
  }
}
