import { OPS_COUNT, SEQ_VOICES } from '../as/assembly/constants.ts'
import { Op, SeqOp } from '../as/assembly/shared.ts'
import type { Loc, Program } from './lang/ast.ts'
import { compile } from './lang/bytecode.ts'
import { type LangError, lineText } from './lang/errors.ts'
import { lex } from './lang/lexer.ts'
import { parse } from './lang/parser.ts'

export { Op, SEQ_VOICES, SeqOp }

export const VM_MAGIC = -1

export enum VmOp {
  End = 0,
  Nop = 1,
  PushNum = 2,
  PushBool = 3,
  PushNull = 4,
  PushUndef = 5,
  PushSym = 6,
  Pop = 7,
  Dup = 8,
  Load = 9,
  Store = 10,
  Unary = 11,
  Binary = 12,
  Call = 13,
  Jump = 14,
  JumpIfFalse = 15,
  Return = 16,
  Throw = 17,
  EnterScope = 18,
  ExitScope = 19,
  Func = 20,
  Array = 21, // immediate: n
  GetIndex = 22,
  SetIndex = 23,
}

export enum VmUnary {
  Neg = 0,
  Not = 1,
  BitNot = 2,
}

export enum VmBinary {
  Add = 0,
  Sub = 1,
  Mul = 2,
  Div = 3,
  Mod = 4,
  Pow = 5,
  Eq = 6,
  Lt = 7,
  Lte = 8,
  Gt = 9,
  Gte = 10,
  BitOr = 11,
  BitXor = 12,
  BitAnd = 13,
  Shl = 14,
  Shr = 15,
  Ushr = 16,
}

const builtinSyms: Record<string, number> = {
  out: 1,
  sine: 2,
  ad: 3,
  adsr: 4,
  mini: 5,
  analyser: 6,
  t: 7,
  play: 8,
  // Named args for adsr()
  attack: 100,
  decay: 101,
  sustain: 102,
  release: 103,
  trig: 104,
}

type VmTarget = {
  ops: Int32Array
  literals: Float32Array
}

export type ArrayLiteralRef = {
  pc: number
  loc: Loc
  items: Loc[]
}

export type AnalyserRef = {
  analyserIndex: number
  loc: Loc
}

function encoderError(src: string, message: string): LangError {
  return { message, line: 1, column: 1, length: 1, code: lineText(src, 1) }
}

function unaryCode(opName: string): VmUnary | null {
  if (opName === '-') return VmUnary.Neg
  if (opName === '!') return VmUnary.Not
  if (opName === '~') return VmUnary.BitNot
  return null
}

function binaryCode(opName: string): VmBinary | null {
  if (opName === '+') return VmBinary.Add
  if (opName === '-') return VmBinary.Sub
  if (opName === '*') return VmBinary.Mul
  if (opName === '/') return VmBinary.Div
  if (opName === '%') return VmBinary.Mod
  if (opName === '**') return VmBinary.Pow
  if (opName === '==') return VmBinary.Eq
  if (opName === '<') return VmBinary.Lt
  if (opName === '<=') return VmBinary.Lte
  if (opName === '>') return VmBinary.Gt
  if (opName === '>=') return VmBinary.Gte
  if (opName === '|') return VmBinary.BitOr
  if (opName === '^') return VmBinary.BitXor
  if (opName === '&') return VmBinary.BitAnd
  if (opName === '<<') return VmBinary.Shl
  if (opName === '>>') return VmBinary.Shr
  if (opName === '>>>') return VmBinary.Ushr
  return null
}

export type MiniSequenceRef = {
  seqIndex: number
  sequence: string
  /** Absolute start index (0-based) of the string content (excluding quotes) in the DSP source. */
  start: number
  /** Absolute end index (0-based, exclusive) of the string content (excluding quotes) in the DSP source. */
  end: number
  /** Location of the full string token (including quotes). */
  loc: Loc
}

function buildLineStarts(src: string): number[] {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return starts
}

function locToIndex(lineStarts: number[], loc: Pick<Loc, 'line' | 'column'>): number {
  const lineStart = lineStarts[loc.line - 1] ?? 0
  return lineStart + (loc.column - 1)
}

function extractMiniSequencesFromProgramWithRefs(
  src: string,
  program: Program,
): { sequences: string[]; refs: MiniSequenceRef[] } {
  const sequences: string[] = []
  const refs: MiniSequenceRef[] = []
  const sequenceToIndex = new Map<string, number>()
  const lineStarts = buildLineStarts(src)

  function ensureIndex(sequence: string): number {
    const prev = sequenceToIndex.get(sequence)
    if (prev !== undefined) return prev
    const idx = sequences.length
    sequences.push(sequence)
    sequenceToIndex.set(sequence, idx)
    return idx
  }

  function addRef(sequence: string, loc: Loc): void {
    const seqIndex = ensureIndex(sequence)
    const quoteStart = locToIndex(lineStarts, loc)
    refs.push({
      seqIndex,
      sequence,
      start: quoteStart + 1,
      end: quoteStart + Math.max(0, loc.length - 1),
      loc,
    })
  }

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      if (
        expr.callee?.kind === 'ident'
        && (expr.callee?.name === 'mini' || expr.callee?.name === 'play')
      ) {
        const firstArg = expr.args?.[0]
        const v = firstArg?.kind === 'pos' ? firstArg.value : null
        if (v?.kind === 'string') {
          const sequence = String(v.value ?? '')
          addRef(sequence, v.loc)
        }
      }

      visitExpr(expr.callee)
      for (const arg of expr.args ?? []) {
        if (arg.kind === 'pos' || arg.kind === 'named') visitExpr(arg.value)
      }
      return
    }

    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      visitExpr(expr.target)
      visitExpr(expr.value)
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      visitExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      visitExpr(expr.object)
      if (expr.computed) visitExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const item of expr.items ?? []) visitExpr(item)
      return
    }

    if (expr.kind === 'object') {
      for (const prop of expr.props ?? []) visitExpr(prop.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then?.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      return
    }
  }

  function visitStmt(stmt: any): void {
    if (!stmt) return

    if (stmt.kind === 'expr_stmt') {
      visitExpr(stmt.expr)
      return
    }

    if (stmt.kind === 'block') {
      for (const s of stmt.body ?? []) visitStmt(s)
      return
    }

    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head?.iterable)
      }
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      visitExpr(stmt.test)
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'switch') {
      visitExpr(stmt.test)
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body ?? []) visitStmt(s)
      }
      return
    }

    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }

    if (stmt.kind === 'throw') {
      visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'return') {
      if (stmt.value) visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'label') {
      visitStmt(stmt.stmt)
      return
    }

    if (stmt.kind === 'destructure') {
      visitExpr(stmt.value)
      return
    }
  }

  for (const stmt of program.body) {
    visitStmt(stmt)
  }

  return { sequences, refs }
}

function extractAnalysersFromProgramWithRefs(program: Program): AnalyserRef[] {
  const refs: AnalyserRef[] = []

  function getPosArgValue(call: any, posIndex: number): any | null {
    let pos = 0
    for (const arg of call.args ?? []) {
      if (arg?.kind !== 'pos') continue
      if (pos === posIndex) return arg.value ?? null
      pos++
    }
    return null
  }

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'analyser') {
        const idxArg = getPosArgValue(expr, 1)
        let analyserIndex = 0
        if (idxArg?.kind === 'number') analyserIndex = Math.max(0, Math.floor(Number(idxArg.value ?? 0)))

        refs.push({
          analyserIndex,
          loc: expr.callee.loc ?? expr.loc,
        })
      }

      visitExpr(expr.callee)
      for (const arg of expr.args ?? []) {
        if (arg.kind === 'pos' || arg.kind === 'named') visitExpr(arg.value)
      }
      return
    }

    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      visitExpr(expr.target)
      visitExpr(expr.value)
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      visitExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      visitExpr(expr.object)
      if (expr.computed) visitExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const item of expr.items ?? []) visitExpr(item)
      return
    }

    if (expr.kind === 'object') {
      for (const prop of expr.props ?? []) visitExpr(prop.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then?.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      return
    }
  }

  function visitStmt(stmt: any): void {
    if (!stmt) return

    if (stmt.kind === 'expr_stmt') {
      visitExpr(stmt.expr)
      return
    }

    if (stmt.kind === 'block') {
      for (const s of stmt.body ?? []) visitStmt(s)
      return
    }

    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head?.iterable)
      }
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      visitExpr(stmt.test)
      visitStmt(stmt.body)
      return
    }

    if (stmt.kind === 'switch') {
      visitExpr(stmt.test)
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body ?? []) visitStmt(s)
      }
      return
    }

    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }

    if (stmt.kind === 'throw') {
      visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'return') {
      if (stmt.value) visitExpr(stmt.value)
      return
    }

    if (stmt.kind === 'label') {
      visitStmt(stmt.stmt)
      return
    }

    if (stmt.kind === 'destructure') {
      visitExpr(stmt.value)
      return
    }
  }

  for (const stmt of program.body) visitStmt(stmt)
  return refs
}

export function encodeLangToVmOps(
  src: string,
  target: VmTarget,
): {
  errors: LangError[]
  miniSequences?: string[]
  miniRefs?: MiniSequenceRef[]
  analyserRefs?: AnalyserRef[]
  arrayLiterals?: ArrayLiteralRef[]
} {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length) return { errors }

  const { sequences, refs } = extractMiniSequencesFromProgramWithRefs(src, parsed.program)
  const analyserRefs = extractAnalysersFromProgramWithRefs(parsed.program)
  const sequenceToIndex = new Map<string, number>()
  sequences.forEach((seq, idx) => sequenceToIndex.set(seq, idx))

  const toSeqIndexExpr = (loc: Loc, idx: number) => ({ kind: 'number', value: idx, raw: String(idx), loc }) as any

  const transformExpr = (expr: any): any => {
    if (!expr) return expr

    if (expr.kind === 'call') {
      const callee = transformExpr(expr.callee)
      const args = (expr.args ?? []).map((a: any) => {
        if (a.kind === 'pos' || a.kind === 'named') return { ...a, value: transformExpr(a.value) }
        return a
      })

      const calleeName = callee?.kind === 'ident' ? callee.name : null

      const isMini = calleeName === 'mini'
      const isPlay = calleeName === 'play'

      if (isMini || isPlay) {
        // Find "seq" argument (positional #0 or named seq:)
        const seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? args.find((a: any) => a.kind === 'pos') // first positional

        if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
          const v = seqArg.value
          if (v?.kind === 'string') {
            const idx = sequenceToIndex.get(String(v.value ?? ''))
            if (idx !== undefined) {
              seqArg.value = toSeqIndexExpr(v.loc, idx)
            }
          }
        }

        // mini(x) is a compile-time identity for sequence refs
        if (isMini && args.length === 1 && seqArg && (seqArg.kind === 'pos' || seqArg.kind === 'named')) {
          return seqArg.value
        }

        // play(seq, cb) is a compile-time alias of mini(seq, cb)
        if (isPlay) {
          return { ...expr, callee: { kind: 'ident', name: 'mini', loc: callee.loc }, args }
        }
      }

      return { ...expr, callee, args }
    }

    if (expr.kind === 'binary') {
      return { ...expr, left: transformExpr(expr.left), right: transformExpr(expr.right) }
    }

    if (expr.kind === 'assign') {
      return { ...expr, target: transformExpr(expr.target), value: transformExpr(expr.value) }
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      return { ...expr, expr: transformExpr(expr.expr) }
    }

    if (expr.kind === 'member') {
      const out: any = { ...expr, object: transformExpr(expr.object) }
      if (expr.computed) out.index = transformExpr(expr.index)
      return out
    }

    if (expr.kind === 'array') {
      return { ...expr, items: (expr.items ?? []).map(transformExpr) }
    }

    if (expr.kind === 'object') {
      return { ...expr, props: (expr.props ?? []).map((p: any) => ({ ...p, value: transformExpr(p.value) })) }
    }

    if (expr.kind === 'if') {
      const thenPart = expr.then?.kind === 'block' ? transformStmt(expr.then) : transformExpr(expr.then)
      const elsePart = expr.else?.kind === 'block' ? transformStmt(expr.else) : transformExpr(expr.else)
      return { ...expr, test: transformExpr(expr.test), then: thenPart, else: elsePart }
    }

    if (expr.kind === 'func') {
      const body = expr.body?.kind === 'block' ? transformStmt(expr.body) : transformExpr(expr.body)
      return { ...expr, body }
    }

    return expr
  }

  const transformStmt = (stmt: any): any => {
    if (!stmt) return stmt
    if (stmt.kind === 'expr_stmt') return { ...stmt, expr: transformExpr(stmt.expr) }
    if (stmt.kind === 'block') return { ...stmt, body: (stmt.body ?? []).map(transformStmt) }
    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        return {
          ...stmt,
          head: {
            ...stmt.head,
            init: stmt.head.init ? transformExpr(stmt.head.init) : undefined,
            test: stmt.head.test ? transformExpr(stmt.head.test) : undefined,
            update: stmt.head.update ? transformExpr(stmt.head.update) : undefined,
          },
          body: transformStmt(stmt.body),
        }
      }
      return { ...stmt, head: { ...stmt.head, iterable: transformExpr(stmt.head.iterable) },
        body: transformStmt(stmt.body) }
    }
    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      return { ...stmt, test: transformExpr(stmt.test), body: transformStmt(stmt.body) }
    }
    if (stmt.kind === 'switch') {
      return {
        ...stmt,
        test: transformExpr(stmt.test),
        cases: (stmt.cases ?? []).map((c: any) => ({
          ...c,
          test: c.test ? transformExpr(c.test) : undefined,
          body: (c.body ?? []).map(transformStmt),
        })),
      }
    }
    if (stmt.kind === 'try') {
      return {
        ...stmt,
        body: transformStmt(stmt.body),
        catchBody: stmt.catchBody ? transformStmt(stmt.catchBody) : undefined,
        finallyBody: stmt.finallyBody ? transformStmt(stmt.finallyBody) : undefined,
      }
    }
    if (stmt.kind === 'throw') return { ...stmt, value: transformExpr(stmt.value) }
    if (stmt.kind === 'return') return { ...stmt, value: stmt.value ? transformExpr(stmt.value) : undefined }
    if (stmt.kind === 'label') return { ...stmt, stmt: transformStmt(stmt.stmt) }
    if (stmt.kind === 'destructure') return { ...stmt, value: transformExpr(stmt.value) }
    return stmt
  }

  const transformedProgram = { ...parsed.program, body: parsed.program.body.map(transformStmt) } as any
  const compiled = compile(src, transformedProgram)
  errors.push(...compiled.errors)
  if (errors.length) return { errors }
  const chunk = compiled.chunk
  const arrayLiterals: ArrayLiteralRef[] = []

  const syms = new Map<string, number>()
  let nextSym = 1000
  const symOf = (s: string) => {
    const b = builtinSyms[s]
    if (b !== undefined) return b
    const prev = syms.get(s)
    if (prev !== undefined) return prev
    const id = nextSym++
    syms.set(s, id)
    return id
  }

  const litIndex = new Map<number, number>()
  let litCount = 0
  const litOf = (v: number) => {
    const prev = litIndex.get(v)
    if (prev !== undefined) return prev
    const idx = litCount++
    litIndex.set(v, idx)
    return idx
  }

  target.ops.fill(0)
  target.literals.fill(0)
  target.ops[0] = VM_MAGIC

  const funcOffsets = new Map<object, number>()
  const funcPatches: { at: number; fn: object }[] = []
  const funcQueue: object[] = []

  const vmFuncHeader = -2

  const encodeChunk = (chunk: { consts: any[]; funcs: any[]; code: any[]; arrayLiterals?: any[] }, base: number) => {
    const code = chunk.code as any[]

    const pcMap = new Int32Array(code.length)
    let pc = base
    for (let i = 0; i < code.length; i++) {
      pcMap[i] = pc
      const ins = code[i]!
      switch (ins.op) {
        case 'PUSH_CONST':
          {
            const v = chunk.consts[ins.k]
            if (typeof v === 'number') pc += 2
            else if (typeof v === 'string') pc += 2
            else if (typeof v === 'boolean') pc += 2
            else if (v === null) pc += 1
            else pc += 1
          }
          break
        case 'ENTER_SCOPE':
        case 'EXIT_SCOPE':
        case 'POP':
        case 'DUP':
        case 'LABEL':
        case 'RETURN':
        case 'THROW':
        case 'TRY_BEGIN':
        case 'CATCH_BEGIN':
        case 'FINALLY_BEGIN':
        case 'TRY_END':
          pc += 1
          break
        case 'DUP2':
          errors.push(encoderError(src, 'DUP2 not supported in VM encoder yet'))
          pc += 1
          break
        case 'LOAD':
        case 'STORE':
          pc += 2
          break
        case 'UNARY':
          pc += 2
          break
        case 'BINARY':
          pc += 2
          break
        case 'CALL':
          pc += 3
          break
        case 'JUMP':
        case 'JUMP_IF_FALSE':
          pc += 2
          break
        case 'FUNC':
          pc += 2
          break
        case 'BREAK':
        case 'CONTINUE':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        case 'ARRAY':
          pc += 2
          break
        case 'GET_INDEX':
        case 'SET_INDEX':
          pc += 1
          break
        case 'OBJECT':
        case 'GET_PROP':
        case 'SET_PROP':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          pc += 1
      }
    }

    const endPc = pc

    const arrayMeta = chunk.arrayLiterals as Array<{ ins: number; loc: Loc; items: Loc[] }> | undefined
    if (arrayMeta?.length) {
      for (const lit of arrayMeta) {
        const pcAt = pcMap[lit.ins]
        if (pcAt != null) arrayLiterals.push({ pc: pcAt, loc: lit.loc, items: lit.items })
      }
    }

    let w = base
    for (let i = 0; i < code.length; i++) {
      const ins = code[i]!
      switch (ins.op) {
        case 'PUSH_CONST': {
          const v = chunk.consts[ins.k]
          if (typeof v === 'number') {
            const k = litOf(v)
            target.literals[k] = v
            target.ops[w++] = VmOp.PushNum
            target.ops[w++] = k
          }
          else if (typeof v === 'string') {
            target.ops[w++] = VmOp.PushSym
            target.ops[w++] = symOf(v)
          }
          else if (typeof v === 'boolean') {
            target.ops[w++] = VmOp.PushBool
            target.ops[w++] = v ? 1 : 0
          }
          else if (v === null) {
            target.ops[w++] = VmOp.PushNull
          }
          else {
            target.ops[w++] = VmOp.PushUndef
          }
          break
        }
        case 'ENTER_SCOPE':
          target.ops[w++] = VmOp.EnterScope
          break
        case 'EXIT_SCOPE':
          target.ops[w++] = VmOp.ExitScope
          break
        case 'POP':
          target.ops[w++] = VmOp.Pop
          break
        case 'DUP':
          target.ops[w++] = VmOp.Dup
          break
        case 'LABEL':
          target.ops[w++] = VmOp.Nop
          break
        case 'LOAD': {
          const name = String(chunk.consts[ins.name])
          target.ops[w++] = VmOp.Load
          target.ops[w++] = symOf(name)
          break
        }
        case 'STORE': {
          const name = String(chunk.consts[ins.name])
          target.ops[w++] = VmOp.Store
          target.ops[w++] = symOf(name)
          break
        }
        case 'UNARY': {
          const code = unaryCode(ins.opName)
          if (code === null) {
            errors.push(encoderError(src, `Unsupported unary op ${ins.opName}`))
            target.ops[w++] = VmOp.Nop
            break
          }
          target.ops[w++] = VmOp.Unary
          target.ops[w++] = code
          break
        }
        case 'BINARY': {
          const code = binaryCode(ins.opName)
          if (code === null) {
            errors.push(encoderError(src, `Unsupported binary op ${ins.opName}`))
            target.ops[w++] = VmOp.Nop
            break
          }
          target.ops[w++] = VmOp.Binary
          target.ops[w++] = code
          break
        }
        case 'ARRAY': {
          target.ops[w++] = VmOp.Array
          target.ops[w++] = ins.n | 0
          break
        }
        case 'GET_INDEX': {
          target.ops[w++] = VmOp.GetIndex
          break
        }
        case 'SET_INDEX': {
          target.ops[w++] = VmOp.SetIndex
          break
        }
        case 'CALL':
          target.ops[w++] = VmOp.Call
          target.ops[w++] = ins.pos
          target.ops[w++] = ins.named
          break
        case 'JUMP':
          target.ops[w++] = VmOp.Jump
          target.ops[w++] = ins.to === code.length ? endPc : (pcMap[ins.to] ?? endPc)
          break
        case 'JUMP_IF_FALSE':
          target.ops[w++] = VmOp.JumpIfFalse
          target.ops[w++] = ins.to === code.length ? endPc : (pcMap[ins.to] ?? endPc)
          break
        case 'RETURN':
          target.ops[w++] = VmOp.Return
          break
        case 'THROW':
          target.ops[w++] = VmOp.Throw
          break
        case 'TRY_BEGIN':
        case 'CATCH_BEGIN':
        case 'FINALLY_BEGIN':
        case 'TRY_END':
          target.ops[w++] = VmOp.Nop
          break
        case 'FUNC': {
          const fn = chunk.funcs[ins.id]
          if (!fn) {
            errors.push(encoderError(src, `Missing FUNC #${ins.id}`))
            target.ops[w++] = VmOp.PushUndef
            break
          }
          target.ops[w++] = VmOp.Func
          const at = w++
          funcPatches.push({ at, fn })
          funcQueue.push(fn)
          target.ops[at] = 0
          break
        }
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          target.ops[w++] = VmOp.Nop
      }
    }

    return { endPc, writtenEnd: w }
  }

  // Encode main chunk at pc=1
  let writePc = 1
  const main = encodeChunk(chunk as any, writePc)
  writePc = main.writtenEnd

  // Encode functions (BFS), patching FUNC placeholders to absolute pcs.
  for (let qi = 0; qi < funcQueue.length; qi++) {
    const fn: any = funcQueue[qi]
    if (funcOffsets.has(fn)) continue

    const funcPc = writePc
    funcOffsets.set(fn, funcPc)

    const params = fn.params as { name: string; isRest: boolean }[]
    target.ops[writePc++] = vmFuncHeader
    target.ops[writePc++] = params.length
    for (const p of params) {
      target.ops[writePc++] = symOf(p.name)
    }

    const body = encodeChunk(fn.chunk as any, writePc)
    writePc = body.writtenEnd

    // Ensure function returns something
    target.ops[writePc++] = VmOp.PushUndef
    target.ops[writePc++] = VmOp.Return
  }

  for (const p of funcPatches) {
    const off = funcOffsets.get(p.fn)
    if (off === undefined) {
      errors.push(encoderError(src, 'Unpatched function offset'))
      target.ops[p.at] = 0
    }
    else {
      target.ops[p.at] = off
    }
  }

  target.ops[writePc++] = VmOp.End

  return errors.length
    ? { errors, miniSequences: sequences, miniRefs: refs, analyserRefs, arrayLiterals }
    : { errors: [], miniSequences: sequences, miniRefs: refs, analyserRefs, arrayLiterals }
}
