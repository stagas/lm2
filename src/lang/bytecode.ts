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

type SigInfo = {
  names: string[]
  idxOf: Map<string, number>
}

// Extract callback parameter arity from type signature like "(x: any, i: number) -> any"
function extractCallbackArity(typeStr: string): number | null {
  const match = typeStr.match(/^\s*\(([^)]*)\)\s*->/)
  if (!match) return null
  const params = match[1]!.trim()
  if (!params) return 0
  // Count commas + 1, but handle empty case
  return params.split(',').filter(p => p.trim()).length
}

// Check if a parameter type indicates it's a callback/function
function isCallbackParameter(typeStr: string): boolean {
  return typeStr.includes('->') || typeStr.includes('function')
}

// Get callback parameter info for a function
const builtinCallbackParams: Record<string, Array<{ index: number; arity: number }>> = (() => {
  const result: Record<string, Array<{ index: number; arity: number }>> = {}
  for (const [name, sig] of Object.entries(functionDefinitions)) {
    const callbacks: Array<{ index: number; arity: number }> = []
    for (let i = 0; i < sig.parameters.length; i++) {
      const param = sig.parameters[i]!
      if (isCallbackParameter(param.type ?? '')) {
        const arity = extractCallbackArity(param.type ?? '') ?? 1
        callbacks.push({ index: i, arity })
      }
    }
    if (callbacks.length > 0) {
      result[name] = callbacks
    }
  }
  return result
})()

function resolveParamName(raw: string, paramNames: string[]): { ok: true; name: string } | {
  ok: false
  message: string
} {
  const exact = paramNames.find(p => p === raw)
  if (exact) return { ok: true, name: exact }

  const lower = raw.toLowerCase()
  const ci = paramNames.find(p => p.toLowerCase() === lower)
  if (ci) return { ok: true, name: ci }

  const prefix = paramNames.filter(p => p.startsWith(raw))
  if (prefix.length === 1) return { ok: true, name: prefix[0]! }
  if (prefix.length === 0) {
    return {
      ok: false,
      message: `Unknown parameter '${raw}'. Valid parameters are: ${paramNames.join(', ')}`,
    }
  }
  return {
    ok: false,
    message: `Ambiguous parameter '${raw}'. It matches: ${prefix.join(', ')}`,
  }
}

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

const K_UNDEF = 0
const K_NULL = 1
const K_TRUE = 2
const K_FALSE = 3
const K_ZERO = 4
const K_ONE = 5
const K_NEG_ONE = 6

const BASE_CONSTS: ConstVal[] = [undefined, null, true, false, 0, 1, -1]

const INS_BRANCH: Instr = { op: 'BRANCH' }
const INS_ENTER_SCOPE: Instr = { op: 'ENTER_SCOPE' }
const INS_EXIT_SCOPE: Instr = { op: 'EXIT_SCOPE' }
const INS_POP: Instr = { op: 'POP' }
const INS_DUP: Instr = { op: 'DUP' }
const INS_DUP2: Instr = { op: 'DUP2' }
const INS_LEN: Instr = { op: 'LEN' }
const INS_GET_INDEX: Instr = { op: 'GET_INDEX' }
const INS_GET_INDEX2: Instr = { op: 'GET_INDEX2' }
const INS_SET_INDEX: Instr = { op: 'SET_INDEX' }
const INS_TRY_BEGIN: Instr = { op: 'TRY_BEGIN' }
const INS_FINALLY_BEGIN: Instr = { op: 'FINALLY_BEGIN' }
const INS_TRY_END: Instr = { op: 'TRY_END' }
const INS_THROW: Instr = { op: 'THROW' }
const INS_RETURN: Instr = { op: 'RETURN' }

const INS_PUSH_UNDEF: Instr = { op: 'PUSH_CONST', k: K_UNDEF }
const INS_PUSH_NULL: Instr = { op: 'PUSH_CONST', k: K_NULL }
const INS_PUSH_TRUE: Instr = { op: 'PUSH_CONST', k: K_TRUE }
const INS_PUSH_FALSE: Instr = { op: 'PUSH_CONST', k: K_FALSE }
const INS_PUSH_ZERO: Instr = { op: 'PUSH_CONST', k: K_ZERO }
const INS_PUSH_ONE: Instr = { op: 'PUSH_CONST', k: K_ONE }
const INS_PUSH_NEG_ONE: Instr = { op: 'PUSH_CONST', k: K_NEG_ONE }

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
  readonly chunk: Chunk = { consts: [...BASE_CONSTS], funcs: [], code: [], arrayLiterals: [], branchMarks: [] }
  readonly errors: LangError[] = []
  private strConstIndex: Record<string, number> = Object.create(null)
  private numConstIndex = new Map<number, number>()
  private pushConstCache: Array<Instr | undefined> = []
  private loadCache: Array<Instr | undefined> = []
  private storeCache: Array<Instr | undefined> = []
  private pipe: string[] = []
  private labelId = 0
  private callTempId = 0
  private forTempId = 0
  private destructureTempId = 0
  private sigScopes: Array<Map<string, SigInfo>> = [new Map()]
  private sigScopePool: Array<Map<string, SigInfo>> = []

  constructor(private readonly src: string) {}

  private k(v: ConstVal): number {
    if (v === undefined) return K_UNDEF
    if (v === null) return K_NULL
    if (v === true) return K_TRUE
    if (v === false) return K_FALSE

    if (typeof v === 'number') {
      if (v === 0) return K_ZERO
      if (v === 1) return K_ONE
      if (v === -1) return K_NEG_ONE
      const hit = this.numConstIndex.get(v)
      if (hit !== undefined) return hit
      const i = this.chunk.consts.length
      this.chunk.consts.push(v)
      this.numConstIndex.set(v, i)
      return i
    }

    const hit = this.strConstIndex[v]
    if (hit !== undefined) return hit
    const i = this.chunk.consts.length
    this.chunk.consts.push(v)
    this.strConstIndex[v] = i
    return i
  }

  private nameConst(name: string): number {
    return this.k(name)
  }

  private emit(ins: Instr): number {
    this.chunk.code.push(ins)
    return this.chunk.code.length - 1
  }

  private emitPushConst(k: number): void {
    if (k === K_UNDEF) return void this.emit(INS_PUSH_UNDEF)
    if (k === K_NULL) return void this.emit(INS_PUSH_NULL)
    if (k === K_TRUE) return void this.emit(INS_PUSH_TRUE)
    if (k === K_FALSE) return void this.emit(INS_PUSH_FALSE)
    if (k === K_ZERO) return void this.emit(INS_PUSH_ZERO)
    if (k === K_ONE) return void this.emit(INS_PUSH_ONE)
    if (k === K_NEG_ONE) return void this.emit(INS_PUSH_NEG_ONE)

    const hit = this.pushConstCache[k]
    if (hit) return void this.emit(hit)
    const ins: Instr = { op: 'PUSH_CONST', k }
    this.pushConstCache[k] = ins
    this.emit(ins)
  }

  private emitUndef(): void {
    this.emit(INS_PUSH_UNDEF)
  }

  private emitLoad(name: number): void {
    const hit = this.loadCache[name]
    if (hit) return void this.emit(hit)
    const ins: Instr = { op: 'LOAD', name }
    this.loadCache[name] = ins
    this.emit(ins)
  }

  private emitStore(name: number): void {
    const hit = this.storeCache[name]
    if (hit) return void this.emit(hit)
    const ins: Instr = { op: 'STORE', name }
    this.storeCache[name] = ins
    this.emit(ins)
  }

  private emitLoadName(name: string): void {
    this.emitLoad(this.nameConst(name))
  }

  private enterSigScope(): void {
    this.sigScopes.push(this.sigScopePool.pop() ?? new Map())
  }

  private exitSigScope(): void {
    if (this.sigScopes.length <= 1) return
    const scope = this.sigScopes.pop()!
    scope.clear()
    this.sigScopePool.push(scope)
  }

  private findSigInfo(name: string): SigInfo | null {
    for (let i = this.sigScopes.length - 1; i >= 0; i--) {
      const hit = this.sigScopes[i]!.get(name)
      if (hit) return hit
    }
    const builtin = builtinSigNames[name]
    const idxOf = builtinSigIndex[name]
    if (builtin && idxOf) return { names: builtin, idxOf }
    return null
  }

  private setSigInfo(name: string, info: SigInfo | null): void {
    for (let i = this.sigScopes.length - 1; i >= 0; i--) {
      const scope = this.sigScopes[i]!
      if (scope.has(name)) {
        if (info) scope.set(name, info)
        else scope.delete(name)
        return
      }
    }
    if (info) this.sigScopes[this.sigScopes.length - 1]!.set(name, info)
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
    const ins = this.emit(INS_BRANCH)
    this.chunk.branchMarks.push({ ins, loc: { line: loc.line, column: loc.column, length: Math.max(1, loc.length) } })
  }

  private err(loc: { line: number; column: number; length: number }, message: string): void {
    this.errors.push({
      message,
      line: loc.line,
      column: loc.column,
      length: Math.max(1, loc.length),
      code: '', // Will be filled in by mapError in encodeLangToVmOps
    })
  }

  // Auto-wrap an identifier into a lambda that passes arguments through
  // e.g., for map callback with arity 3, `note` becomes `(x, i, arr) -> note(x)`
  // The lambda accepts `arity` parameters but only passes the first one (or however many the target function needs)
  private wrapIdentifierAsCallback(identName: string, arity: number, loc: Loc): Expr {
    const params: Array<{ name: string; isRest: boolean }> = []
    const paramNames = ['x', 'i', 'arr', 'a', 'b', 'c', 'd', 'e', 'f', 'g'] // Generic param names

    // Create parameters for all callback arguments
    for (let i = 0; i < arity; i++) {
      const paramName = paramNames[i] ?? `p${i}`
      params.push({ name: paramName, isRest: false })
    }

    // Only pass the first parameter to the wrapped function
    // This matches the behavior of `x -> note(x)` where only x is passed
    const args: Arg[] = arity > 0
      ? [{
        kind: 'pos',
        value: { kind: 'ident', name: paramNames[0]!, loc },
        loc,
      }]
      : []

    return {
      kind: 'func',
      params: params.map(p => ({ name: p.name, loc, isRest: p.isRest })),
      body: {
        kind: 'call',
        callee: { kind: 'ident', name: identName, loc },
        args,
        loc,
      },
      loc,
    }
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
      if (!isLast) this.emit(INS_POP)
      return
    }

    if (stmt.kind === 'destructure') {
      const id = this.destructureTempId++
      const temp = `%destr${id}`
      const tempName = this.nameConst(temp)

      this.compileExpr(stmt.value)
      this.emitStore(tempName)
      this.emit(INS_POP)

      if (stmt.pattern.kind === 'arr') {
        for (let i = 0; i < stmt.pattern.items.length; i++) {
          const name = stmt.pattern.items[i]!
          this.emitLoad(tempName)
          this.emitPushConst(this.k(i))
          this.emit(INS_GET_INDEX)
          this.emitStore(this.nameConst(name))
          this.emit(INS_POP)
        }
      }
      else {
        for (const key of stmt.pattern.keys) {
          this.emitLoad(tempName)
          this.emit({ op: 'GET_PROP', key: this.k(key) })
          this.emitStore(this.nameConst(key))
          this.emit(INS_POP)
        }
      }
      return
    }

    if (stmt.kind === 'label') {
      this.compileStmt(stmt.stmt, isLast)
      return
    }

    if (stmt.kind === 'return') {
      if (stmt.value) this.compileExpr(stmt.value)
      else this.emit(INS_PUSH_UNDEF)
      this.emit(INS_RETURN)
      return
    }

    if (stmt.kind === 'throw') {
      this.compileExpr(stmt.value)
      this.emit(INS_THROW)
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
    this.emit(INS_ENTER_SCOPE)
    this.enterSigScope()
    for (let i = 0; i < block.body.length; i++) {
      this.compileStmt(block.body[i]!, isLast && i === block.body.length - 1)
    }
    this.exitSigScope()
    this.emit(INS_EXIT_SCOPE)
  }

  private compileForStmt(stmt: ForStmt): void {
    // Loops introduce a scope (loop head bindings shouldn't leak).
    this.emit(INS_ENTER_SCOPE)
    this.enterSigScope()

    if (stmt.head.kind === 'c_style') {
      if (stmt.head.init) {
        this.compileExpr(stmt.head.init)
        this.emit(INS_POP)
      }
      const start = this.emit({ op: 'LABEL', id: this.labelId++ })
      if (stmt.head.test) {
        this.compileExpr(stmt.head.test)
        const j = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
        this.compileStmt(stmt.body, false)
        if (stmt.head.update) {
          this.compileExpr(stmt.head.update)
          this.emit(INS_POP)
        }
        this.emit({ op: 'JUMP', to: start })
        this.patch(j, this.chunk.code.length)
      }
      else {
        this.compileStmt(stmt.body, false)
        if (stmt.head.update) {
          this.compileExpr(stmt.head.update)
          this.emit(INS_POP)
        }
        this.emit({ op: 'JUMP', to: start })
      }
      this.exitSigScope()
      this.emit(INS_EXIT_SCOPE)
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
    this.emitStore(iterName)
    this.emit(INS_POP)

    // length (cache it once)
    this.emitLoad(iterName)
    this.emit(INS_LEN)
    this.emitStore(lenName)
    this.emit(INS_POP)

    if (stmt.head.length) {
      this.emitLoad(lenName)
      this.emitStore(this.nameConst(stmt.head.length))
      this.emit(INS_POP)
    }

    // index = 0
    this.emit(INS_PUSH_ZERO)
    this.emitStore(indexName)
    this.emit(INS_POP)

    const start = this.emit({ op: 'LABEL', id: this.labelId++ })

    // while (index < len)
    this.emitLoad(indexName)
    this.emitLoad(lenName)
    this.emit({ op: 'BINARY', opName: '<' })
    const jEnd = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })

    if (stmt.head.index) {
      this.emitLoad(indexName)
      this.emitStore(this.nameConst(stmt.head.index))
      this.emit(INS_POP)
    }

    // value = iterable[index]
    this.emitLoad(iterName)
    this.emitLoad(indexName)
    this.emit(INS_GET_INDEX)
    this.emitStore(this.nameConst(stmt.head.value))
    this.emit(INS_POP)

    this.compileStmt(stmt.body, false)

    // index++
    this.emitLoad(indexName)
    this.emit(INS_PUSH_ONE)
    this.emit({ op: 'BINARY', opName: '+' })
    this.emitStore(indexName)
    this.emit(INS_POP)

    this.emit({ op: 'JUMP', to: start })
    this.patch(jEnd, this.chunk.code.length)
    this.emit(INS_EXIT_SCOPE)
    this.exitSigScope()
  }

  private compileSwitchStmt(stmt: SwitchStmt): void {
    this.compileExpr(stmt.test)
    this.emit(INS_POP)
    for (const c of stmt.cases) {
      if (c.test) {
        this.compileExpr(c.test)
        this.emit(INS_POP)
      }
      for (let i = 0; i < c.body.length; i++) {
        this.compileStmt(c.body[i]!, false)
      }
    }
  }

  private compileTryStmt(stmt: TryStmt): void {
    this.emit(INS_TRY_BEGIN)
    this.compileBlockStmt(stmt.body, false)
    if (stmt.catchBody) {
      const name = stmt.catchName ? this.nameConst(stmt.catchName) : undefined
      this.emit({ op: 'CATCH_BEGIN', name })
      this.compileBlockStmt(stmt.catchBody, false)
    }
    if (stmt.finallyBody) {
      this.emit(INS_FINALLY_BEGIN)
      this.compileBlockStmt(stmt.finallyBody, false)
    }
    this.emit(INS_TRY_END)
  }

  private compileExpr(expr: Expr): void {
    switch (expr.kind) {
      case 'number':
        this.emit({ op: 'PUSH_CONST', k: this.k(expr.value), loc: expr.loc })
        return
      case 'string':
        this.emitPushConst(this.k(expr.value))
        return
      case 'bool':
        this.emit(expr.value ? INS_PUSH_TRUE : INS_PUSH_FALSE)
        return
      case 'null':
        this.emit(INS_PUSH_NULL)
        return
      case 'undefined':
        this.emit(INS_PUSH_UNDEF)
        return
      case 'ident':
        this.emitLoad(this.nameConst(expr.name))
        return
      case 'pipe_value': {
        const name = this.pipe[this.pipe.length - 1]
        if (!name) {
          this.err(expr.loc, 'Pipe value \'$\' is only valid on the right side of a pipe')
          this.emit(INS_PUSH_UNDEF)
          return
        }
        this.emitLoad(this.nameConst(name))
        return
      }
      case 'array':
        for (const it of expr.items) this.compileExpr(it)
        {
          const ins = this.emit({ op: 'ARRAY', n: expr.items.length })
          const items: Loc[] = new Array(expr.items.length)
          for (let i = 0; i < expr.items.length; i++) items[i] = expr.items[i]!.loc
          this.chunk.arrayLiterals.push({ ins, loc: expr.loc, items })
        }
        return
      case 'object':
        for (const p of expr.props) {
          this.emitPushConst(this.k(p.key))
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
            this.emitLoad(name)
            this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE)
            this.emit({ op: 'BINARY', opName: '+' })
            this.emitStore(name)
            return
          }

          // member: handle computed and non-computed props
          if (expr.expr.kind === 'member') {
            this.compileExpr(expr.expr.object)
            if (expr.expr.computed === true) {
              this.compileExpr(expr.expr.index)
              this.emit(INS_DUP2)
              this.emit(INS_GET_INDEX)
              this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE)
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit(INS_SET_INDEX)
            }
            else {
              this.emit(INS_DUP)
              this.emit({ op: 'GET_PROP', key: this.k(expr.expr.prop) })
              this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE)
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit({ op: 'SET_PROP', key: this.k(expr.expr.prop) })
            }
            return
          }

          this.err(expr.loc, 'Invalid increment/decrement target')
          this.emit(INS_PUSH_UNDEF)
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
            this.emitLoad(name)
            this.emit(INS_DUP)
            this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE)
            this.emit({ op: 'BINARY', opName: '+' })
            this.emitStore(name)
            this.emit(INS_POP)
            return
          }

          if (expr.expr.kind === 'member') {
            this.compileExpr(expr.expr.object)
            if (expr.expr.computed === true) {
              this.compileExpr(expr.expr.index)
              this.emit(INS_DUP2)
              this.emit(INS_GET_INDEX)
              this.emit(INS_DUP)
              this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE)
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit(INS_SET_INDEX)
              this.emit(INS_POP)
            }
            else {
              this.emit(INS_DUP)
              this.emit({ op: 'GET_PROP', key: this.k(expr.expr.prop) })
              this.emit(INS_DUP)
              this.emit(delta === 1 ? INS_PUSH_ONE : INS_PUSH_NEG_ONE)
              this.emit({ op: 'BINARY', opName: '+' })
              this.emit({ op: 'SET_PROP', key: this.k(expr.expr.prop) })
              this.emit(INS_POP)
            }
            return
          }

          this.err(expr.loc, 'Invalid increment/decrement target')
          this.emit(INS_PUSH_UNDEF)
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
        this.emit(INS_GET_INDEX2)
        return
      }

      this.compileExpr(expr.object)
      this.compileExpr(expr.index)
      this.emit(INS_GET_INDEX)
      return
    }
    if (expr.prop === 'length') {
      this.compileExpr(expr.object)
      this.emit(INS_LEN)
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
          this.emitLoadName('playPick')
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
      this.emitStore(this.nameConst(recvTemp))
      this.emit(INS_POP)

      this.emitLoadName('map')

      type TempArg =
        | { kind: 'pos'; temp: string }
        | { kind: 'named'; temp: string; name: string }

      const temps: TempArg[] = []
      const tmp = () => `%arg${this.callTempId++}`

      // Auto-wrap identifiers passed as callbacks (.map method has callback at index 0)
      const callbackInfo = builtinCallbackParams['.map']

      // Evaluate args left-to-right, storing each into a temp so we can reorder stack layout later.
      for (let argIdx = 0; argIdx < expr.args.length; argIdx++) {
        const a = expr.args[argIdx]!
        const t = tmp()

        // Check if this argument position is a callback parameter
        const isCallbackArg = callbackInfo?.some(cb => cb.index === argIdx)

        if (a.kind === 'pos') {
          // Auto-wrap bare identifiers into lambdas for callback parameters
          let valueToCompile = a.value
          if (isCallbackArg && a.value.kind === 'ident') {
            const cbInfo = callbackInfo!.find(cb => cb.index === argIdx)!
            valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc)
          }

          this.compileExpr(valueToCompile)
          this.emitStore(this.nameConst(t))
          this.emit(INS_POP)
          temps.push({ kind: 'pos', temp: t })
          continue
        }
        if (a.kind === 'named') {
          // Auto-wrap bare identifiers into lambdas for callback parameters
          let valueToCompile = a.value
          if (isCallbackArg && a.value.kind === 'ident') {
            const cbInfo = callbackInfo!.find(cb => cb.index === argIdx)!
            valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc)
          }

          this.compileExpr(valueToCompile)
          this.emitStore(this.nameConst(t))
          this.emit(INS_POP)
          temps.push({ kind: 'named', temp: t, name: a.name })
          continue
        }
        // shorthand: store the loaded value into a temp (keeps evaluation behavior consistent)
        this.emitLoadName(a.name)
        this.emitStore(this.nameConst(t))
        this.emit(INS_POP)
        temps.push({ kind: 'named', temp: t, name: a.name })
      }

      // Generic call layout: positional values first, then named pairs (reverse order so last wins).
      const namedTemps: { name: string; temp: string }[] = []
      let pos = 1
      for (const a of temps) {
        if (a.kind === 'pos') pos++
        else namedTemps.push({ name: a.name, temp: a.temp })
      }

      this.emitLoadName(recvTemp)
      for (const a of temps) if (a.kind === 'pos') this.emitLoadName(a.temp)
      for (let i = namedTemps.length - 1; i >= 0; i--) {
        const a = namedTemps[i]!
        this.emitPushConst(this.k(a.name))
        this.emitLoadName(a.temp)
      }

      this.emit({ op: 'CALL', pos, named: namedTemps.length })
      return
    }

    // `array.sum()` is compiled as `sum(array)` to avoid GET_PROP in the VM encoder.
    const compileMemberCallAsBuiltin = (propName: string, loadName?: string): boolean => {
      if (expr.callee.kind !== 'member' || expr.callee.computed !== false) return false
      if (expr.callee.prop !== propName) return false

      const recvTemp = `%recv${this.callTempId++}`
      this.compileExpr(expr.callee.object)
      this.emitStore(this.nameConst(recvTemp))
      this.emit(INS_POP)

      this.emitLoadName(loadName || propName)

      type CallTempArg =
        | { kind: 'pos'; temp: string; identName?: string; isImplicitNamedCandidate: boolean }
        | { kind: 'named'; temp: string; name: string }

      const temps: CallTempArg[] = []
      const tmp = () => `%arg${this.callTempId++}`

      const builtinName = loadName || propName
      const sigInfo = this.findSigInfo(builtinName)
      const sigNames = sigInfo?.names ?? null
      const idxOf = sigInfo?.idxOf
      const callbackInfo = builtinCallbackParams[builtinName]

      if (sigNames) {
        for (const a of expr.args) {
          if (a.kind !== 'named' && a.kind !== 'shorthand') continue
          if (a.name.startsWith('%')) continue
          const r = resolveParamName(a.name, sigNames)
          if (r.ok) {
            ;(a as any).name = r.name
          }
          else {
            this.err(a.loc, `${r.message} for function '${builtinName}'`)
          }
        }
      }

      for (const a of expr.args) {
        const t = tmp()
        if (a.kind === 'pos') {
          this.compileExpr(a.value)
          this.emitStore(this.nameConst(t))
          this.emit(INS_POP)
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
          this.emitStore(this.nameConst(t))
          this.emit(INS_POP)
          temps.push({ kind: 'named', temp: t, name: a.name })
          continue
        }
        this.emitLoadName(a.name)
        this.emitStore(this.nameConst(t))
        this.emit(INS_POP)
        temps.push({ kind: 'named', temp: t, name: a.name })
      }

      if (sigNames && idxOf) {
        const reserved: boolean[] = []
        const slots: Array<string | undefined> = []
        const extraNamed: { name: string; temp: string }[] = []

        for (const a of temps) {
          if (a.kind !== 'named') continue
          const idx = idxOf.get(a.name)
          if (idx !== undefined) reserved[idx] = true
          else extraNamed.push({ name: a.name, temp: a.temp })
        }
        for (const a of temps) {
          if (a.kind !== 'pos') continue
          if (!a.isImplicitNamedCandidate || !a.identName) continue
          const idx = idxOf.get(a.identName)
          if (idx !== undefined) reserved[idx] = true
        }

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

        let next = 0
        // receiver always occupies the first positional slot unless reserved/filled.
        while (reserved[next] === true || slots[next] !== undefined) next++
        if (next < sigNames.length) {
          slots[next] = recvTemp
          next++
        }

        for (const a of temps) {
          if (a.kind !== 'pos') continue
          if (a.isImplicitNamedCandidate && a.identName && idxOf.has(a.identName)) continue
          while (reserved[next] === true || slots[next] !== undefined) next++
          if (next >= sigNames.length) break
          slots[next] = a.temp
          next++
        }

        let maxIdx = -1
        for (let i = 0; i < slots.length; i++) if (slots[i] !== undefined) maxIdx = i
        const pos = maxIdx + 1

        for (let i = 0; i < pos; i++) {
          const t = slots[i]
          if (t !== undefined) this.emitLoadName(t)
          else this.emitUndef()
        }

        for (let i = extraNamed.length - 1; i >= 0; i--) {
          const a = extraNamed[i]!
          this.emitPushConst(this.k(a.name))
          this.emitLoadName(a.temp)
        }

        this.emit({ op: 'CALL', pos, named: extraNamed.length })
        return true
      }

      const namedTemps: { name: string; temp: string }[] = []
      let pos = 1
      for (const a of temps) {
        if (a.kind === 'pos') pos++
        else namedTemps.push({ name: a.name, temp: a.temp })
      }

      this.emitLoadName(recvTemp)
      for (const a of temps) if (a.kind === 'pos') this.emitLoadName(a.temp)
      for (let i = namedTemps.length - 1; i >= 0; i--) {
        const a = namedTemps[i]!
        this.emitPushConst(this.k(a.name))
        this.emitLoadName(a.temp)
      }

      this.emit({ op: 'CALL', pos, named: namedTemps.length })
      return true
    }

    // `array.sum()` is compiled as `sum(array)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('sum')) return
    // `array.avg()` is compiled as `avg(array)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('avg')) return
    // `array.glide(bar, exp?)` is compiled as `glide(array, bar, exp?)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('glide')) return
    // `array.step(trig)` is compiled as `arrayStep(array, trig)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('step', 'arrayStep')) return
    // `array.random(trig)` is compiled as `arrayRandom(array, trig)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('random', 'arrayRandom')) return
    // `array.reverse()` is compiled as `reverse(array)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('reverse')) return
    // `array.shuffle(seed?)` is compiled as `shuffle(array, seed?)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('shuffle')) return
    // `signal.delay(seconds, feedback?, cb?)` is compiled as `delay(signal, seconds, feedback?, cb?)`.
    if (compileMemberCallAsBuiltin('delay')) return
    // `array.walk(bar, swing?, offset?)` is compiled as `arrayWalk(array, bar, swing?, offset?)` to avoid GET_PROP in the VM encoder.
    if (compileMemberCallAsBuiltin('walk', 'arrayWalk')) return

    type TempArg =
      | { kind: 'pos'; temp: string; valueKind?: string; identName?: string; isImplicitNamedCandidate: boolean }
      | { kind: 'named'; temp: string; name: string }

    const temps: TempArg[] = []

    const tmp = () => `%arg${this.callTempId++}`
    const tapAnalyserIndex: number | null = typeof (expr as any).__tapAnalyserIndex === 'number'
      ? (expr as any).__tapAnalyserIndex as number
      : null
    let firstPosTemp: string | null = null
    let posSeen = 0

    const sigInfo = calleeName ? this.findSigInfo(calleeName) : null
    const sigNames = sigInfo?.names ?? null
    const callbackInfo = calleeName ? builtinCallbackParams[calleeName] : null

    if (sigNames) {
      // Validate and normalize named keys against the signature (exact, case-insensitive, then unique prefix).
      for (const a of expr.args) {
        if (a.kind !== 'named' && a.kind !== 'shorthand') continue
        if (a.name.startsWith('%')) continue
        const r = resolveParamName(a.name, sigNames)
        if (r.ok) {
          ;(a as any).name = r.name
        }
        else {
          this.err(a.loc, `${r.message} for function '${calleeName}'`)
        }
      }

      let userCount = 0
      for (const a of expr.args) {
        if (a.kind === 'named' && a.name.startsWith('%')) continue
        userCount++
      }
      if (userCount > sigNames.length) {
        this.err(expr.loc,
          `Too many arguments for function '${calleeName}'. Expected at most ${sigNames.length} arguments, got ${userCount}`)
      }
    }

    // Evaluate args left-to-right, storing each into a temp so we can reorder stack layout later.
    for (let argIdx = 0; argIdx < expr.args.length; argIdx++) {
      const a = expr.args[argIdx]!
      const t = tmp()

      // Check if this argument position is a callback parameter
      const isCallbackArg = callbackInfo?.some(cb => cb.index === argIdx)

      if (a.kind === 'pos') {
        // Auto-wrap bare identifiers into lambdas for callback parameters
        let valueToCompile = a.value
        if (isCallbackArg && a.value.kind === 'ident') {
          const cbInfo = callbackInfo!.find(cb => cb.index === argIdx)!
          valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc)
        }

        this.compileExpr(valueToCompile)
        this.emitStore(this.nameConst(t))
        this.emit(INS_POP)
        if (posSeen === 0) firstPosTemp = t
        posSeen++
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
        // Auto-wrap bare identifiers into lambdas for callback parameters
        let valueToCompile = a.value
        if (isCallbackArg && a.value.kind === 'ident') {
          const cbInfo = callbackInfo!.find(cb => cb.index === argIdx)!
          valueToCompile = this.wrapIdentifierAsCallback(a.value.name, cbInfo.arity, a.value.loc)
        }

        this.compileExpr(valueToCompile)
        this.emitStore(this.nameConst(t))
        this.emit(INS_POP)
        temps.push({ kind: 'named', temp: t, name: a.name })
        continue
      }
      // shorthand: store the loaded value into a temp (keeps evaluation behavior consistent)
      this.emitLoadName(a.name)
      this.emitStore(this.nameConst(t))
      this.emit(INS_POP)
      temps.push({ kind: 'named', temp: t, name: a.name })
    }

    const idxOf = sigInfo?.idxOf

    // Side-effect analyser tap for out()/solo(): emit `analyser(arg0, idx)` without rewriting the expression to
    // `out(analyser(arg0))` (which would change semantics for arrays).
    if ((calleeName === 'out' || calleeName === 'solo') && tapAnalyserIndex !== null && firstPosTemp) {
      this.emitLoadName('analyser')
      this.emitLoadName(firstPosTemp)
      this.emitPushConst(this.k(tapAnalyserIndex))
      this.emit({ op: 'CALL', pos: 2, named: 0 })
      this.emit(INS_POP)
    }

    // Compile the callee AFTER evaluating arguments to prevent stack corruption
    this.compileExpr(expr.callee)

    if (sigNames && idxOf) {
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
        if (sigNames && next >= sigNames.length) break
        slots[next] = a.temp
        next++
      }

      // Emit all parameters up to the last non-undefined one (don't fill trailing undefined)
      let lastNonUndef = -1
      for (let i = 0; i < sigNames.length; i++) {
        if (slots[i] !== undefined) lastNonUndef = i
      }
      const pos = lastNonUndef + 1

      for (let i = 0; i < pos; i++) {
        const t = slots[i]
        if (t !== undefined) this.emitLoadName(t)
        else this.emitUndef()
      }

      // Push extra named pairs (unknown keys) last; last one in source should win -> push in reverse.
      for (let i = extraNamed.length - 1; i >= 0; i--) {
        const a = extraNamed[i]!
        this.emitPushConst(this.k(a.name))
        this.emitLoadName(a.temp)
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

    for (const a of temps) if (a.kind === 'pos') this.emitLoadName(a.temp)
    for (let i = namedTemps.length - 1; i >= 0; i--) {
      const a = namedTemps[i]!
      this.emitPushConst(this.k(a.name))
      this.emitLoadName(a.temp)
    }

    this.emit({ op: 'CALL', pos, named: namedTemps.length })
  }

  private compileArg(arg: Arg): void {
    if (arg.kind === 'pos') {
      this.compileExpr(arg.value)
      return
    }
    if (arg.kind === 'named') {
      this.emitPushConst(this.k(arg.name))
      this.compileExpr(arg.value)
      return
    }
    this.emitPushConst(this.k(arg.name))
    this.emitLoadName(arg.name)
  }

  private compileBinary(expr: BinaryExpr): void {
    if (expr.op === '|>') {
      // Validate that the right side is not a bare identifier (uncalled function)
      if (expr.right.kind === 'ident') {
        this.err(
          expr.right.loc,
          `Bare identifier '${expr.right.name}' in pipe. Did you mean to call it with '${expr.right.name}($)'?`,
        )
        // Still compile to avoid cascading errors
      }

      const temp = `%pipe${this.pipe.length}`
      this.compileExpr(expr.left)
      this.emitStore(this.nameConst(temp))
      this.emit(INS_POP)
      this.pipe.push(temp)
      this.compileExpr(expr.right)
      this.pipe.pop()
      return
    }

    if (expr.op === '||') {
      this.compileExpr(expr.left)
      this.emit(INS_DUP)
      const jFalse = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
      const jEnd = this.emit({ op: 'JUMP', to: -1 })
      this.patch(jFalse, this.chunk.code.length)
      this.emit(INS_POP)
      this.compileExpr(expr.right)
      this.patch(jEnd, this.chunk.code.length)
      return
    }

    if (expr.op === '&&') {
      this.compileExpr(expr.left)
      this.emit(INS_DUP)
      const jFalse = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })
      this.emit(INS_POP)
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
        this.emitLoad(this.nameConst(expr.target.name))
        this.compileExpr(expr.value)
        this.emit({ op: 'BINARY', opName })
        this.emitStore(this.nameConst(expr.target.name))
        return
      }

      if (expr.target.kind === 'member') {
        this.compileExpr(expr.target.object)
        if (expr.target.computed === true) {
          this.compileExpr(expr.target.index)
          this.emit(INS_DUP2)
          this.emit(INS_GET_INDEX)
          this.compileExpr(expr.value)
          this.emit({ op: 'BINARY', opName })
          this.emit(INS_SET_INDEX)
        }
        else {
          this.emit(INS_DUP)
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
      if (expr.value?.kind === 'func') {
        const names = expr.value.params.map(p => p.name)
        const idxOf = new Map<string, number>()
        for (let i = 0; i < names.length; i++) idxOf.set(names[i]!, i)
        this.setSigInfo(expr.target.name, { names, idxOf })
      }
      else {
        this.setSigInfo(expr.target.name, null)
      }
      this.compileExpr(expr.value)
      this.emitStore(this.nameConst(expr.target.name))
      return
    }

    if (expr.target.kind === 'member') {
      this.compileExpr(expr.target.object)
      if (expr.target.computed === true) this.compileExpr(expr.target.index)
      this.compileExpr(expr.value)
      if (expr.target.computed === true) this.emit(INS_SET_INDEX)
      else this.emit({ op: 'SET_PROP', key: this.k(expr.target.prop) })
      return
    }

    this.err(expr.loc, 'Invalid assignment target')
    this.compileExpr(expr.value)
  }

  private compileIf(expr: IfExpr): void {
    const noBranchMark = (expr as any).__noBranchMark === true
    this.compileExpr(expr.test)
    const jFalse = this.emit({ op: 'JUMP_IF_FALSE', to: -1 })

    const thenLoc = expr.ifLoc ?? expr.questionLoc ?? expr.then.loc ?? expr.loc
    if (!noBranchMark) this.emitBranchMark(thenLoc)
    this.compileIfBranch(expr.then)

    if (!expr.else) {
      this.patch(jFalse, this.chunk.code.length)
      this.emit(INS_PUSH_UNDEF)
      return
    }

    const jEnd = this.emit({ op: 'JUMP', to: -1 })
    this.patch(jFalse, this.chunk.code.length)

    let elseLoc = expr.elseLoc ?? expr.colonLoc ?? expr.else.loc ?? expr.loc
    if (expr.elseLoc && expr.else.kind === 'if') {
      const elseIfLoc = expr.else.ifLoc
      if (elseIfLoc) elseLoc = this.locFrom(expr.elseLoc, elseIfLoc)
    }
    if (!noBranchMark) this.emitBranchMark(elseLoc)
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
    this.emit(INS_ENTER_SCOPE)
    this.enterSigScope()
    if (!block.body.length) {
      this.emit(INS_PUSH_UNDEF)
      this.exitSigScope()
      this.emit(INS_EXIT_SCOPE)
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
    if (last.kind !== 'expr_stmt') this.emit(INS_PUSH_UNDEF)
    this.exitSigScope()
    this.emit(INS_EXIT_SCOPE)
  }

  private compileFunc(expr: FuncExpr): void {
    const id = this.chunk.funcs.length
    const fn = new Compiler(this.src)
    const pipeLen = this.pipe.length
    fn.pipe = this.pipe
    const body = expr.body
    if ('kind' in body && body.kind === 'block') fn.compileBlockAsExpr(body)
    else fn.compileExpr(body as Expr)
    fn.emit(INS_RETURN)
    this.pipe.length = pipeLen
    this.chunk.funcs.push({
      params: expr.params.map(p => ({ name: p.name, isRest: p.isRest })),
      chunk: fn.chunk,
    })
    this.emit({ op: 'FUNC', id })
  }
}
