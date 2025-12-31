import { functionDefinitions } from '../engine/ui/function-definitions.ts'
import type {
  Arg,
  AssignExpr,
  BinaryExpr,
  BlockStmt,
  CallExpr,
  Expr,
  ForStmt,
  FuncExpr,
  IfExpr,
  Loc,
  MemberExpr,
  Program,
  Stmt,
  SwitchStmt,
  TryStmt,
} from './ast.ts'
import { type LangError, lineText } from './errors.ts'

export type ConstVal = number | string | boolean | null | undefined

const builtinSigNames: Record<string, string[]> = Object.fromEntries(
  Object
    .entries(functionDefinitions)
    .map(([name, sig]) => [name, sig.parameters.map(p => p.name)]),
)

const builtinSigIndex: Record<string, Map<string, number>> = Object.fromEntries(
  Object
    .entries(builtinSigNames)
    .map(([name, names]) => {
      const idx = new Map<string, number>()
      for (let i = 0; i < names.length; i++) idx.set(names[i]!, i)
      return [name, idx]
    }),
)

export type Instr =
  | { op: 'PUSH_CONST'; k: number; loc?: Loc }
  | { op: 'BRANCH' }
  | { op: 'ENTER_SCOPE' }
  | { op: 'EXIT_SCOPE' }
  | { op: 'POP' }
  | { op: 'DUP' }
  | { op: 'DUP2' }
  | { op: 'LOAD'; name: number }
  | { op: 'STORE'; name: number }
  | { op: 'ARRAY'; n: number }
  | { op: 'OBJECT'; n: number }
  | { op: 'LEN' }
  | { op: 'GET_PROP'; key: number }
  | { op: 'SET_PROP'; key: number }
  | { op: 'GET_INDEX' }
  | { op: 'GET_INDEX2' }
  | { op: 'SET_INDEX' }
  | { op: 'UNARY'; opName: string }
  | { op: 'BINARY'; opName: string }
  | { op: 'CALL'; pos: number; named: number }
  | { op: 'JUMP'; to: number }
  | { op: 'JUMP_IF_FALSE'; to: number }
  | { op: 'LABEL'; id: number }
  | { op: 'FUNC'; id: number }
  | { op: 'TRY_BEGIN' }
  | { op: 'CATCH_BEGIN'; name?: number }
  | { op: 'FINALLY_BEGIN' }
  | { op: 'TRY_END' }
  | { op: 'THROW' }
  | { op: 'RETURN' }
  | { op: 'BREAK'; label?: number }
  | { op: 'CONTINUE'; label?: number }

export type Chunk = {
  consts: ConstVal[]
  funcs: FuncChunk[]
  code: Instr[]
  arrayLiterals: Array<{ ins: number; loc: Loc; items: Loc[] }>
  branchMarks: Array<{ ins: number; loc: Loc }>
}

export type FuncChunk = {
  params: { name: string; isRest: boolean }[]
  chunk: Chunk
}

export type BytecodeProgram = {
  chunk: Chunk
  errors: LangError[]
}

export function compile(src: string, program: Program): BytecodeProgram {
  const c = new Compiler(src)
  c.compileProgram(program)
  return { chunk: c.chunk, errors: c.errors }
}

export function disassemble(chunk: Chunk): string {
  const lines: string[] = []
  const pad = (n: number) => String(n).padStart(4, '0')

  for (let i = 0; i < chunk.code.length; i++) {
    const ins = chunk.code[i]!
    const head = `${pad(i)}  ${ins.op}`
    if (ins.op === 'PUSH_CONST') lines.push(`${head} ${ins.k} (${String(chunk.consts[ins.k])})`)
    else if (ins.op === 'BRANCH') lines.push(head)
    else if (ins.op === 'LOAD') lines.push(`${head} ${ins.name} (${String(chunk.consts[ins.name])})`)
    else if (ins.op === 'STORE') lines.push(`${head} ${ins.name} (${String(chunk.consts[ins.name])})`)
    else if (ins.op === 'LEN') lines.push(head)
    else if (ins.op === 'GET_PROP') lines.push(`${head} ${ins.key} (${String(chunk.consts[ins.key])})`)
    else if (ins.op === 'SET_PROP') lines.push(`${head} ${ins.key} (${String(chunk.consts[ins.key])})`)
    else if (ins.op === 'UNARY') lines.push(`${head} ${ins.opName}`)
    else if (ins.op === 'BINARY') lines.push(`${head} ${ins.opName}`)
    else if (ins.op === 'CALL') lines.push(`${head} pos=${ins.pos} named=${ins.named}`)
    else if (ins.op === 'ARRAY') lines.push(`${head} n=${ins.n}`)
    else if (ins.op === 'OBJECT') lines.push(`${head} n=${ins.n}`)
    else if (ins.op === 'JUMP') lines.push(`${head} -> ${ins.to}`)
    else if (ins.op === 'JUMP_IF_FALSE') lines.push(`${head} -> ${ins.to}`)
    else if (ins.op === 'LABEL') lines.push(`${head} #${ins.id}`)
    else if (ins.op === 'FUNC') lines.push(`${head} #${ins.id}`)
    else if (ins.op === 'BREAK') {
      lines.push(`${head} ${ins.label !== undefined ? String(chunk.consts[ins.label]) : ''}`.trimEnd())
    }
    else if (ins.op === 'CONTINUE') {
      lines.push(`${head} ${ins.label !== undefined ? String(chunk.consts[ins.label]) : ''}`.trimEnd())
    }
    else if (ins.op === 'CATCH_BEGIN') {
      lines.push(`${head} ${ins.name !== undefined ? String(chunk.consts[ins.name]) : ''}`.trimEnd())
    }
    else lines.push(head)
  }

  if (chunk.funcs.length) {
    lines.push('')
    for (let i = 0; i < chunk.funcs.length; i++) {
      const f = chunk.funcs[i]!
      lines.push(`FUNC #${i} (${f.params.map(p => (p.isRest ? `...${p.name}` : p.name)).join(', ')})`)
      lines.push(disassemble(f.chunk).split('\n').map(l => `  ${l}`).join('\n'))
      lines.push('')
    }
  }

  return lines.join('\n')
}

class Compiler {
  readonly chunk: Chunk = { consts: [], funcs: [], code: [], arrayLiterals: [], branchMarks: [] }
  readonly errors: LangError[] = []
  private constIndex = new Map<ConstVal, number>()
  private pipe: string[] = []
  private labelId = 0
  private callTempId = 0
  private forTempId = 0

  constructor(private readonly src: string) {}

  private k(v: ConstVal): number {
    const hit = this.constIndex.get(v)
    if (hit !== undefined) return hit
    const i = this.chunk.consts.length
    this.chunk.consts.push(v)
    this.constIndex.set(v, i)
    return i
  }

  private nameConst(name: string): number {
    return this.k(name)
  }

  private emit(ins: Instr): number {
    this.chunk.code.push(ins)
    return this.chunk.code.length - 1
  }

  private patch(at: number, to: number): void {
    const ins = this.chunk.code[at]
    if (!ins) return
    if (ins.op === 'JUMP' || ins.op === 'JUMP_IF_FALSE') ins.to = to
  }

  private locFrom(a: Loc, b: Loc): Loc {
    const len = Math.max(1, (b.column + b.length) - a.column)
    return { line: a.line, column: a.column, length: len }
  }

  private emitBranchMark(loc: Loc): void {
    const ins = this.emit({ op: 'BRANCH' })
    this.chunk.branchMarks.push({ ins, loc: { line: loc.line, column: loc.column, length: Math.max(1, loc.length) } })
  }

  private err(loc: { line: number; column: number; length: number }, message: string): void {
    this.errors.push({
      message,
      line: loc.line,
      column: loc.column,
      length: Math.max(1, loc.length),
      code: lineText(this.src, loc.line),
    })
  }

  compileProgram(program: Program): void {
    for (let i = 0; i < program.body.length; i++) {
      this.compileStmt(program.body[i]!, i === program.body.length - 1)
    }
  }

  private compileStmt(stmt: Stmt, isLast: boolean): void {
    if (stmt.kind === 'block') {
      this.compileBlockStmt(stmt, isLast)
      return
    }

    if (stmt.kind === 'expr_stmt') {
      this.compileExpr(stmt.expr)
      if (!isLast) this.emit({ op: 'POP' })
      return
    }

    if (stmt.kind === 'destructure') {
      this.compileExpr(stmt.value)
      this.emit({ op: 'POP' })
      return
    }

    if (stmt.kind === 'label') {
      this.compileStmt(stmt.stmt, isLast)
      return
    }

    if (stmt.kind === 'return') {
      if (stmt.value) this.compileExpr(stmt.value)
      else this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
      this.emit({ op: 'RETURN' })
      return
    }

    if (stmt.kind === 'throw') {
      this.compileExpr(stmt.value)
      this.emit({ op: 'THROW' })
      return
    }

    if (stmt.kind === 'break') {
      const label = stmt.label ? this.nameConst(stmt.label) : undefined
      this.emit({ op: 'BREAK', label })
      return
    }

    if (stmt.kind === 'continue') {
      const label = stmt.label ? this.nameConst(stmt.label) : undefined
      this.emit({ op: 'CONTINUE', label })
      return
    }

    if (stmt.kind === 'while') {
      const start = this.emit({ op: 'LABEL', id: this.labelId++ })
      void start
      this.compileExpr(stmt.test)
      const j = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
      this.compileStmt(stmt.body, false)
      this.emit({ op: 'JUMP', to: start })
      this.patch(j, this.chunk.code.length)
      return
    }

    if (stmt.kind === 'do_while') {
      const start = this.emit({ op: 'LABEL', id: this.labelId++ })
      this.compileStmt(stmt.body, false)
      this.compileExpr(stmt.test)
      const j = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
      this.emit({ op: 'JUMP', to: start })
      this.patch(j, this.chunk.code.length)
      return
    }

    if (stmt.kind === 'for') {
      this.compileForStmt(stmt)
      return
    }

    if (stmt.kind === 'switch') {
      this.compileSwitchStmt(stmt)
      return
    }

    if (stmt.kind === 'try') {
      this.compileTryStmt(stmt)
      return
    }
  }

  private compileBlockStmt(block: BlockStmt, isLast: boolean): void {
    this.emit({ op: 'ENTER_SCOPE' })
    for (let i = 0; i < block.body.length; i++) {
      this.compileStmt(block.body[i]!, isLast && i === block.body.length - 1)
    }
    this.emit({ op: 'EXIT_SCOPE' })
  }

  private compileForStmt(stmt: ForStmt): void {
    // Loops introduce a scope (loop head bindings shouldn't leak).
    this.emit({ op: 'ENTER_SCOPE' })

    if (stmt.head.kind === 'c_style') {
      if (stmt.head.init) {
        this.compileExpr(stmt.head.init)
        this.emit({ op: 'POP' })
      }
      const start = this.emit({ op: 'LABEL', id: this.labelId++ })
      if (stmt.head.test) {
        this.compileExpr(stmt.head.test)
        const j = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
        this.compileStmt(stmt.body, false)
        if (stmt.head.update) {
          this.compileExpr(stmt.head.update)
          this.emit({ op: 'POP' })
        }
        this.emit({ op: 'JUMP', to: start })
        this.patch(j, this.chunk.code.length)
      }
      else {
        this.compileStmt(stmt.body, false)
        if (stmt.head.update) {
          this.compileExpr(stmt.head.update)
          this.emit({ op: 'POP' })
        }
        this.emit({ op: 'JUMP', to: start })
      }
      this.emit({ op: 'EXIT_SCOPE' })
      return
    }

    const id = this.forTempId++
    const iterTemp = `$for#${id}#iter`
    const indexTemp = `$for#${id}#i`
    const lenTemp = `$for#${id}#len`
    const iterName = this.nameConst(iterTemp)
    const indexName = this.nameConst(indexTemp)
    const lenName = this.nameConst(lenTemp)

    // iterable
    this.compileExpr(stmt.head.iterable)
    this.emit({ op: 'STORE', name: iterName })
    this.emit({ op: 'POP' })

    // length (cache it once)
    this.emit({ op: 'LOAD', name: iterName })
    this.emit({ op: 'LEN' })
    this.emit({ op: 'STORE', name: lenName })
    this.emit({ op: 'POP' })

    if (stmt.head.length) {
      this.emit({ op: 'LOAD', name: lenName })
      this.emit({ op: 'STORE', name: this.nameConst(stmt.head.length) })
      this.emit({ op: 'POP' })
    }

    // index = 0
    this.emit({ op: 'PUSH_CONST', k: this.k(0) })
    this.emit({ op: 'STORE', name: indexName })
    this.emit({ op: 'POP' })

    const start = this.emit({ op: 'LABEL', id: this.labelId++ })

    // while (index < len)
    this.emit({ op: 'LOAD', name: indexName })
    this.emit({ op: 'LOAD', name: lenName })
    this.emit({ op: 'BINARY', opName: '<' })
    const jEnd = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })

    if (stmt.head.index) {
      this.emit({ op: 'LOAD', name: indexName })
      this.emit({ op: 'STORE', name: this.nameConst(stmt.head.index) })
      this.emit({ op: 'POP' })
    }

    // value = iterable[index]
    this.emit({ op: 'LOAD', name: iterName })
    this.emit({ op: 'LOAD', name: indexName })
    this.emit({ op: 'GET_INDEX' })
    this.emit({ op: 'STORE', name: this.nameConst(stmt.head.value) })
    this.emit({ op: 'POP' })

    this.compileStmt(stmt.body, false)

    // index++
    this.emit({ op: 'LOAD', name: indexName })
    this.emit({ op: 'PUSH_CONST', k: this.k(1) })
    this.emit({ op: 'BINARY', opName: '+' })
    this.emit({ op: 'STORE', name: indexName })
    this.emit({ op: 'POP' })

    this.emit({ op: 'JUMP', to: start })
    this.patch(jEnd, this.chunk.code.length)
    this.emit({ op: 'EXIT_SCOPE' })
  }

  private compileSwitchStmt(stmt: SwitchStmt): void {
    this.compileExpr(stmt.test)
    this.emit({ op: 'POP' })
    for (const c of stmt.cases) {
      if (c.test) {
        this.compileExpr(c.test)
        this.emit({ op: 'POP' })
      }
      for (let i = 0; i < c.body.length; i++) {
        this.compileStmt(c.body[i]!, false)
      }
    }
  }

  private compileTryStmt(stmt: TryStmt): void {
    this.emit({ op: 'TRY_BEGIN' })
    this.compileBlockStmt(stmt.body, false)
    if (stmt.catchBody) {
      const name = stmt.catchName ? this.nameConst(stmt.catchName) : undefined
      this.emit({ op: 'CATCH_BEGIN', name })
      this.compileBlockStmt(stmt.catchBody, false)
    }
    if (stmt.finallyBody) {
      this.emit({ op: 'FINALLY_BEGIN' })
      this.compileBlockStmt(stmt.finallyBody, false)
    }
    this.emit({ op: 'TRY_END' })
  }

  private compileExpr(expr: Expr): void {
    switch (expr.kind) {
      case 'number':
        this.emit({ op: 'PUSH_CONST', k: this.k(expr.value), loc: expr.loc })
        return
      case 'string':
        this.emit({ op: 'PUSH_CONST', k: this.k(expr.value), loc: expr.loc })
        return
      case 'bool':
        this.emit({ op: 'PUSH_CONST', k: this.k(expr.value), loc: expr.loc })
        return
      case 'null':
        this.emit({ op: 'PUSH_CONST', k: this.k(null), loc: expr.loc })
        return
      case 'undefined':
        this.emit({ op: 'PUSH_CONST', k: this.k(undefined), loc: expr.loc })
        return
      case 'ident':
        this.emit({ op: 'LOAD', name: this.nameConst(expr.name) })
        return
      case 'pipe_value': {
        const name = this.pipe[this.pipe.length - 1]
        if (!name) {
          this.err(expr.loc, 'Pipe value \'$\' is only valid on the right side of a pipe')
          this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
          return
        }
        this.emit({ op: 'LOAD', name: this.nameConst(name) })
        return
      }
      case 'array':
        for (const it of expr.items) this.compileExpr(it)
        {
          const ins = this.emit({ op: 'ARRAY', n: expr.items.length })
          this.chunk.arrayLiterals.push({ ins, loc: expr.loc, items: expr.items.map(it => it.loc) })
        }
        return
      case 'object':
        for (const p of expr.props) {
          this.emit({ op: 'PUSH_CONST', k: this.k(p.key) })
          this.compileExpr(p.value)
        }
        this.emit({ op: 'OBJECT', n: expr.props.length })
        return
      case 'member':
        this.compileMember(expr)
        return
      case 'call':
        this.compileCall(expr)
        return
      case 'unary':
        // Handle prefix increment/decrement specially (convert to load/add/store)
        if (expr.op === '++' || expr.op === '--') {
          const delta = expr.op === '++' ? 1 : -1
          // ident: LOAD name; PUSH_CONST delta; BINARY '+'; STORE name
          if (expr.expr.kind === 'ident') {
            const name = this.nameConst(expr.expr.name)
            this.emit({ op: 'LOAD', name })
            this.emit({ op: 'PUSH_CONST', k: this.k(delta) })
            this.emit({ op: 'BINARY', opName: '+' })
            this.emit({ op: 'STORE', name })
            return
          }

          // member: handle computed and non-computed props
          if (expr.expr.kind === 'member') {
            this.compileExpr(expr.expr.object)
            if (expr.expr.computed === true) {
              this.compileExpr(expr.expr.index)
              this.emit({ op: 'DUP2' })
              this.emit({ op: 'GET_INDEX' })
              this.emit({ op: 'PUSH_CONST', k: this.k(delta) })
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit({ op: 'SET_INDEX' })
            }
            else {
              this.emit({ op: 'DUP' })
              this.emit({ op: 'GET_PROP', key: this.k(expr.expr.prop) })
              this.emit({ op: 'PUSH_CONST', k: this.k(delta) })
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit({ op: 'SET_PROP', key: this.k(expr.expr.prop) })
            }
            return
          }

          this.err(expr.loc, 'Invalid increment/decrement target')
          this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
          return
        }

        // default unary handling
        this.compileExpr(expr.expr)
        this.emit({ op: 'UNARY', opName: expr.op })
        return
      case 'postfix':
        // Handle postfix ++/-- (return old value, update variable/property)
        if (expr.op === '++' || expr.op === '--') {
          const delta = expr.op === '++' ? 1 : -1
          if (expr.expr.kind === 'ident') {
            const name = this.nameConst(expr.expr.name)
            // LOAD old; DUP; PUSH_CONST delta; BINARY '+'; STORE; POP -> leaves old
            this.emit({ op: 'LOAD', name })
            this.emit({ op: 'DUP' })
            this.emit({ op: 'PUSH_CONST', k: this.k(delta) })
            this.emit({ op: 'BINARY', opName: '+' })
            this.emit({ op: 'STORE', name })
            this.emit({ op: 'POP' })
            return
          }

          if (expr.expr.kind === 'member') {
            this.compileExpr(expr.expr.object)
            if (expr.expr.computed === true) {
              this.compileExpr(expr.expr.index)
              this.emit({ op: 'DUP2' })
              this.emit({ op: 'GET_INDEX' })
              this.emit({ op: 'DUP' })
              this.emit({ op: 'PUSH_CONST', k: this.k(delta) })
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit({ op: 'SET_INDEX' })
              this.emit({ op: 'POP' })
            }
            else {
              this.emit({ op: 'DUP' })
              this.emit({ op: 'GET_PROP', key: this.k(expr.expr.prop) })
              this.emit({ op: 'DUP' })
              this.emit({ op: 'PUSH_CONST', k: this.k(delta) })
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit({ op: 'SET_PROP', key: this.k(expr.expr.prop) })
              this.emit({ op: 'POP' })
            }
            return
          }

          this.err(expr.loc, 'Invalid increment/decrement target')
          this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
          return
        }

        // default postfix handling (shouldn't reach here often)
        this.compileExpr(expr.expr)
        this.emit({ op: 'UNARY', opName: `${expr.op}_post` })
        return
      case 'binary':
        this.compileBinary(expr)
        return
      case 'assign':
        this.compileAssign(expr)
        return
      case 'if':
        this.compileIf(expr)
        return
      case 'func':
        this.compileFunc(expr)
        return
    }
  }

  private compileMember(expr: MemberExpr): void {
    if (expr.computed === true) {
      // Fused nested indexing: `A[i][j]` -> `GET_INDEX2` (enables audio-rate outer index without audio handles).
      if (expr.object.kind === 'member' && expr.object.computed === true) {
        this.compileExpr(expr.object.object)
        this.compileExpr(expr.object.index)
        this.compileExpr(expr.index)
        this.emit({ op: 'GET_INDEX2' })
        return
      }

      this.compileExpr(expr.object)
      this.compileExpr(expr.index)
      this.emit({ op: 'GET_INDEX' })
      return
    }
    if (expr.prop === 'length') {
      this.compileExpr(expr.object)
      this.emit({ op: 'LEN' })
      return
    }
    this.compileExpr(expr.object)
    this.emit({ op: 'GET_PROP', key: this.k(expr.prop) })
  }

  private compileCall(expr: CallExpr): void {
    const calleeName = expr.callee.kind === 'ident' ? expr.callee.name : null
    if (calleeName === 'play' && expr.args.length >= 2) {
      const a0 = expr.args[0]!
      const a1 = expr.args[1]!
      if (a0.kind === 'pos' && a1.kind === 'pos' && a0.value.kind === 'member' && a0.value.computed === true) {
        const m = a0.value
        // Only rewrite the single-index form: play(seqs[idx], cb) -> playPick(seqs, idx, cb).
        // Nested indexing like `progr[x][y]` is handled by the fused GET_INDEX2 path instead.
        if (m.object.kind === 'member' && m.object.computed === true) {
          // fall through to normal call compilation
        }
        else {
          this.emit({ op: 'LOAD', name: this.nameConst('playPick') })
          this.compileExpr(m.object)
          this.compileExpr(m.index)
          this.compileExpr(a1.value)
          this.emit({ op: 'CALL', pos: 3, named: 0 })
          return
        }
      }
    }

    // `array.map(fn)` is compiled as `map(array, fn)` to avoid GET_PROP in the VM encoder.
    // The receiver is evaluated once and passed as the first positional argument.
    if (expr.callee.kind === 'member' && expr.callee.computed === false && expr.callee.prop === 'map') {
      const recvTemp = `%recv${this.callTempId++}`
      this.compileExpr(expr.callee.object)
      this.emit({ op: 'STORE', name: this.nameConst(recvTemp) })
      this.emit({ op: 'POP' })

      this.emit({ op: 'LOAD', name: this.nameConst('map') })

      type TempArg =
        | { kind: 'pos'; temp: string }
        | { kind: 'named'; temp: string; name: string }

      const temps: TempArg[] = []
      const tmp = () => `%arg${this.callTempId++}`

      // Evaluate args left-to-right, storing each into a temp so we can reorder stack layout later.
      for (const a of expr.args) {
        const t = tmp()
        if (a.kind === 'pos') {
          this.compileExpr(a.value)
          this.emit({ op: 'STORE', name: this.nameConst(t) })
          this.emit({ op: 'POP' })
          temps.push({ kind: 'pos', temp: t })
          continue
        }
        if (a.kind === 'named') {
          this.compileExpr(a.value)
          this.emit({ op: 'STORE', name: this.nameConst(t) })
          this.emit({ op: 'POP' })
          temps.push({ kind: 'named', temp: t, name: a.name })
          continue
        }
        // shorthand: store the loaded value into a temp (keeps evaluation behavior consistent)
        this.emit({ op: 'LOAD', name: this.nameConst(a.name) })
        this.emit({ op: 'STORE', name: this.nameConst(t) })
        this.emit({ op: 'POP' })
        temps.push({ kind: 'named', temp: t, name: a.name })
      }

      const emitLoadTemp = (t: string) => this.emit({ op: 'LOAD', name: this.nameConst(t) })

      // Generic call layout: positional values first, then named pairs (reverse order so last wins).
      const namedTemps: { name: string; temp: string }[] = []
      let pos = 1
      for (const a of temps) {
        if (a.kind === 'pos') pos++
        else namedTemps.push({ name: a.name, temp: a.temp })
      }

      emitLoadTemp(recvTemp)
      for (const a of temps) if (a.kind === 'pos') emitLoadTemp(a.temp)
      for (let i = namedTemps.length - 1; i >= 0; i--) {
        const a = namedTemps[i]!
        this.emit({ op: 'PUSH_CONST', k: this.k(a.name) })
        emitLoadTemp(a.temp)
      }

      this.emit({ op: 'CALL', pos, named: namedTemps.length })
      return
    }

    // `array.sum()` is compiled as `sum(array)` to avoid GET_PROP in the VM encoder.
    const compileMemberCallAsBuiltin = (name: string): boolean => {
      if (expr.callee.kind !== 'member' || expr.callee.computed !== false) return false
      if (expr.callee.prop !== name) return false

      const recvTemp = `%recv${this.callTempId++}`
      this.compileExpr(expr.callee.object)
      this.emit({ op: 'STORE', name: this.nameConst(recvTemp) })
      this.emit({ op: 'POP' })

      this.emit({ op: 'LOAD', name: this.nameConst(name) })

      type CallTempArg =
        | { kind: 'pos'; temp: string }
        | { kind: 'named'; temp: string; name: string }

      const temps: CallTempArg[] = []
      const tmp = () => `%arg${this.callTempId++}`

      for (const a of expr.args) {
        const t = tmp()
        if (a.kind === 'pos') {
          this.compileExpr(a.value)
          this.emit({ op: 'STORE', name: this.nameConst(t) })
          this.emit({ op: 'POP' })
          temps.push({ kind: 'pos', temp: t })
          continue
        }
        if (a.kind === 'named') {
          this.compileExpr(a.value)
          this.emit({ op: 'STORE', name: this.nameConst(t) })
          this.emit({ op: 'POP' })
          temps.push({ kind: 'named', temp: t, name: a.name })
          continue
        }
        this.emit({ op: 'LOAD', name: this.nameConst(a.name) })
        this.emit({ op: 'STORE', name: this.nameConst(t) })
        this.emit({ op: 'POP' })
        temps.push({ kind: 'named', temp: t, name: a.name })
      }

      const emitLoadTemp = (t: string) => this.emit({ op: 'LOAD', name: this.nameConst(t) })

      const namedTemps: { name: string; temp: string }[] = []
      let pos = 1
      for (const a of temps) {
        if (a.kind === 'pos') pos++
        else namedTemps.push({ name: a.name, temp: a.temp })
      }

      emitLoadTemp(recvTemp)
      for (const a of temps) if (a.kind === 'pos') emitLoadTemp(a.temp)
      for (let i = namedTemps.length - 1; i >= 0; i--) {
        const a = namedTemps[i]!
        this.emit({ op: 'PUSH_CONST', k: this.k(a.name) })
        emitLoadTemp(a.temp)
      }

      this.emit({ op: 'CALL', pos, named: namedTemps.length })
      return true
    }

    // `array.sum()` is compiled as `sum(array)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('sum')) return
    // `array.glide(bar, exp?)` is compiled as `glide(array, bar, exp?)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('glide')) return
    // `signal.delay(seconds, feedback?, cb?)` is compiled as `delay(signal, seconds, feedback?, cb?)`.
    if (compileMemberCallAsBuiltin('delay')) return

    this.compileExpr(expr.callee)
    type TempArg =
      | { kind: 'pos'; temp: string; valueKind?: string; identName?: string; isImplicitNamedCandidate: boolean }
      | { kind: 'named'; temp: string; name: string }

    const temps: TempArg[] = []

    const tmp = () => `%arg${this.callTempId++}`

    // Evaluate args left-to-right, storing each into a temp so we can reorder stack layout later.
    for (const a of expr.args) {
      const t = tmp()
      if (a.kind === 'pos') {
        this.compileExpr(a.value)
        this.emit({ op: 'STORE', name: this.nameConst(t) })
        this.emit({ op: 'POP' })
        let identName: string | undefined
        if (a.value.kind === 'ident') identName = a.value.name
        temps.push({
          kind: 'pos',
          temp: t,
          identName,
          isImplicitNamedCandidate: identName !== undefined,
        })
        continue
      }
      if (a.kind === 'named') {
        this.compileExpr(a.value)
        this.emit({ op: 'STORE', name: this.nameConst(t) })
        this.emit({ op: 'POP' })
        temps.push({ kind: 'named', temp: t, name: a.name })
        continue
      }
      // shorthand: store the loaded value into a temp (keeps evaluation behavior consistent)
      this.emit({ op: 'LOAD', name: this.nameConst(a.name) })
      this.emit({ op: 'STORE', name: this.nameConst(t) })
      this.emit({ op: 'POP' })
      temps.push({ kind: 'named', temp: t, name: a.name })
    }

    const sig = calleeName ? builtinSigNames[calleeName] : undefined
    const idxOf = calleeName ? builtinSigIndex[calleeName] : undefined

    const emitUndef = () => this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
    const emitLoadTemp = (t: string) => this.emit({ op: 'LOAD', name: this.nameConst(t) })

    if (sig && idxOf) {
      const reserved: boolean[] = []
      const slots: Array<string | undefined> = []
      const extraNamed: { name: string; temp: string }[] = []

      for (const a of temps) {
        if (a.kind === 'named') {
          const idx = idxOf.get(a.name)
          if (idx !== undefined) reserved[idx] = true
          else extraNamed.push({ name: a.name, temp: a.temp })
          continue
        }
        if (a.isImplicitNamedCandidate && a.identName) {
          const idx = idxOf.get(a.identName)
          if (idx !== undefined) reserved[idx] = true
        }
      }

      // Assign named + implicit shorthand-by-name (last write wins).
      for (const a of temps) {
        if (a.kind === 'named') {
          const idx = idxOf.get(a.name)
          if (idx !== undefined) slots[idx] = a.temp
          continue
        }
        if (a.isImplicitNamedCandidate && a.identName) {
          const idx = idxOf.get(a.identName)
          if (idx !== undefined) slots[idx] = a.temp
        }
      }

      // Fill remaining slots with positional args, skipping reserved/filled indices.
      let next = 0
      for (const a of temps) {
        if (a.kind !== 'pos') continue
        if (a.isImplicitNamedCandidate && a.identName && idxOf.has(a.identName)) continue
        while (reserved[next] === true || slots[next] !== undefined) next++
        slots[next] = a.temp
        next++
      }

      let maxIdx = -1
      for (let i = 0; i < slots.length; i++) if (slots[i] !== undefined) maxIdx = i
      const pos = maxIdx + 1

      for (let i = 0; i < pos; i++) {
        const t = slots[i]
        if (t !== undefined) emitLoadTemp(t)
        else emitUndef()
      }

      // Push extra named pairs (unknown keys) last; last one in source should win -> push in reverse.
      for (let i = extraNamed.length - 1; i >= 0; i--) {
        const a = extraNamed[i]!
        this.emit({ op: 'PUSH_CONST', k: this.k(a.name) })
        emitLoadTemp(a.temp)
      }

      this.emit({ op: 'CALL', pos, named: extraNamed.length })
      return
    }

    // Generic call layout: positional values first, then named pairs (reverse order so last wins).
    const namedTemps: { name: string; temp: string }[] = []
    let pos = 0
    for (const a of temps) {
      if (a.kind === 'pos') pos++
      else namedTemps.push({ name: a.name, temp: a.temp })
    }

    for (const a of temps) if (a.kind === 'pos') emitLoadTemp(a.temp)
    for (let i = namedTemps.length - 1; i >= 0; i--) {
      const a = namedTemps[i]!
      this.emit({ op: 'PUSH_CONST', k: this.k(a.name) })
      emitLoadTemp(a.temp)
    }

    this.emit({ op: 'CALL', pos, named: namedTemps.length })
  }

  private compileArg(arg: Arg): void {
    if (arg.kind === 'pos') {
      this.compileExpr(arg.value)
      return
    }
    if (arg.kind === 'named') {
      this.emit({ op: 'PUSH_CONST', k: this.k(arg.name) })
      this.compileExpr(arg.value)
      return
    }
    this.emit({ op: 'PUSH_CONST', k: this.k(arg.name) })
    this.emit({ op: 'LOAD', name: this.nameConst(arg.name) })
  }

  private compileBinary(expr: BinaryExpr): void {
    if (expr.op === '|>') {
      const temp = `%pipe${this.pipe.length}`
      this.compileExpr(expr.left)
      this.emit({ op: 'STORE', name: this.nameConst(temp) })
      this.emit({ op: 'POP' })
      this.pipe.push(temp)
      this.compileExpr(expr.right)
      this.pipe.pop()
      return
    }

    if (expr.op === '||') {
      this.compileExpr(expr.left)
      this.emit({ op: 'DUP' })
      const jFalse = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
      const jEnd = this.emit({ op: 'JUMP', to: -1 })
      this.patch(jFalse, this.chunk.code.length)
      this.emit({ op: 'POP' })
      this.compileExpr(expr.right)
      this.patch(jEnd, this.chunk.code.length)
      return
    }

    if (expr.op === '&&') {
      this.compileExpr(expr.left)
      this.emit({ op: 'DUP' })
      const jFalse = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
      this.emit({ op: 'POP' })
      this.compileExpr(expr.right)
      this.patch(jFalse, this.chunk.code.length)
      return
    }

    this.compileExpr(expr.left)
    this.compileExpr(expr.right)
    this.emit({ op: 'BINARY', opName: expr.op })
  }

  private compileAssign(expr: AssignExpr): void {
    if (expr.op !== '=') {
      const opName = expr.op.slice(0, -1)

      if (expr.target.kind === 'ident') {
        this.emit({ op: 'LOAD', name: this.nameConst(expr.target.name) })
        this.compileExpr(expr.value)
        this.emit({ op: 'BINARY', opName })
        this.emit({ op: 'STORE', name: this.nameConst(expr.target.name) })
        return
      }

      if (expr.target.kind === 'member') {
        this.compileExpr(expr.target.object)
        if (expr.target.computed === true) {
          this.compileExpr(expr.target.index)
          this.emit({ op: 'DUP2' })
          this.emit({ op: 'GET_INDEX' })
          this.compileExpr(expr.value)
          this.emit({ op: 'BINARY', opName })
          this.emit({ op: 'SET_INDEX' })
        }
        else {
          this.emit({ op: 'DUP' })
          this.emit({ op: 'GET_PROP', key: this.k(expr.target.prop) })
          this.compileExpr(expr.value)
          this.emit({ op: 'BINARY', opName })
          this.emit({ op: 'SET_PROP', key: this.k(expr.target.prop) })
        }
        return
      }

      this.err(expr.loc, 'Invalid assignment target')
      this.compileExpr(expr.value)
      return
    }

    if (expr.target.kind === 'ident') {
      this.compileExpr(expr.value)
      this.emit({ op: 'STORE', name: this.nameConst(expr.target.name) })
      return
    }

    if (expr.target.kind === 'member') {
      this.compileExpr(expr.target.object)
      if (expr.target.computed === true) this.compileExpr(expr.target.index)
      this.compileExpr(expr.value)
      if (expr.target.computed === true) this.emit({ op: 'SET_INDEX' })
      else this.emit({ op: 'SET_PROP', key: this.k(expr.target.prop) })
      return
    }

    this.err(expr.loc, 'Invalid assignment target')
    this.compileExpr(expr.value)
  }

  private compileIf(expr: IfExpr): void {
    this.compileExpr(expr.test)
    const jFalse = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })

    const thenLoc = expr.ifLoc ?? expr.questionLoc ?? expr.then.loc ?? expr.loc
    this.emitBranchMark(thenLoc)
    this.compileIfBranch(expr.then)
    const jEnd = this.emit({ op: 'JUMP', to: -1 })
    this.patch(jFalse, this.chunk.code.length)

    let elseLoc = expr.elseLoc ?? expr.colonLoc ?? expr.else.loc ?? expr.loc
    if (expr.elseLoc && expr.else.kind === 'if') {
      const elseIfLoc = expr.else.ifLoc
      if (elseIfLoc) elseLoc = this.locFrom(expr.elseLoc, elseIfLoc)
    }
    this.emitBranchMark(elseLoc)
    this.compileIfBranch(expr.else)
    this.patch(jEnd, this.chunk.code.length)
  }

  private compileIfBranch(branch: Expr | BlockStmt): void {
    if ('kind' in branch && branch.kind === 'block') {
      this.compileBlockAsExpr(branch)
      return
    }
    this.compileExpr(branch as Expr)
  }

  private compileBlockAsExpr(block: BlockStmt): void {
    this.emit({ op: 'ENTER_SCOPE' })
    if (!block.body.length) {
      this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
      this.emit({ op: 'EXIT_SCOPE' })
      return
    }
    for (let i = 0; i < block.body.length; i++) {
      const s = block.body[i]!
      const isLast = i === block.body.length - 1
      if (isLast && s.kind === 'expr_stmt') {
        this.compileExpr(s.expr)
        continue
      }
      this.compileStmt(s, false)
    }
    const last = block.body[block.body.length - 1]!
    if (last.kind !== 'expr_stmt') this.emit({ op: 'PUSH_CONST', k: this.k(undefined) })
    this.emit({ op: 'EXIT_SCOPE' })
  }

  private compileFunc(expr: FuncExpr): void {
    const id = this.chunk.funcs.length
    const fn = new Compiler(this.src)
    fn.pipe = [...this.pipe]
    const body = expr.body
    if ('kind' in body && body.kind === 'block') fn.compileBlockAsExpr(body)
    else fn.compileExpr(body as Expr)
    fn.emit({ op: 'RETURN' })
    this.chunk.funcs.push({
      params: expr.params.map(p => ({ name: p.name, isRest: p.isRest })),
      chunk: fn.chunk,
    })
    this.emit({ op: 'FUNC', id })
  }
}
