import { OPS_COUNT, SEQ_VOICES } from '../as/assembly/constants.ts'
import { Op, SeqOp } from '../as/assembly/shared.ts'
import type { Program } from './lang/ast.ts'
import { type LangError, lineText } from './lang/errors.ts'
import { analyze } from './lang/pipeline.ts'

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

function extractMiniSequencesFromProgram(program: Program): string[] {
  const sequences: string[] = []
  const sequenceToIndex = new Map<string, number>()

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      if (expr.callee.kind === 'ident' && expr.callee.name === 'mini') {
        const firstArg = expr.args[0]
        if (firstArg?.kind === 'pos' && firstArg.value.kind === 'string') {
          const sequence = firstArg.value.value
          if (!sequenceToIndex.has(sequence)) {
            const index = sequences.length
            sequences.push(sequence)
            sequenceToIndex.set(sequence, index)
          }
        }
      }

      visitExpr(expr.callee)
      for (const arg of expr.args) {
        if (arg.kind === 'pos' || arg.kind === 'named') {
          visitExpr(arg.value)
        }
      }
      return
    }

    if (expr.kind === 'binary' || expr.kind === 'assign') {
      visitExpr(expr.left)
      visitExpr(expr.right)
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
      for (const item of expr.items) visitExpr(item)
      return
    }

    if (expr.kind === 'object') {
      for (const prop of expr.props) visitExpr(prop.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body.kind === 'block') visitStmt(expr.body)
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
      for (const s of stmt.body) visitStmt(s)
      return
    }

    if (stmt.kind === 'for') {
      if (stmt.head.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head.iterable)
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
      for (const c of stmt.cases) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body) visitStmt(s)
      }
      return
    }

    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }

    if (stmt.kind === 'return' || stmt.kind === 'throw') {
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

  return sequences
}

export function encodeLangToVmOps(src: string, target: VmTarget): { errors: LangError[]; miniSequences?: string[] } {
  const a = analyze(src)
  const errors: LangError[] = [...a.errors]
  if (errors.length) return { errors }

  const sequences = extractMiniSequencesFromProgram(a.program)
  const sequenceToIndex = new Map<string, number>()
  sequences.forEach((seq, idx) => sequenceToIndex.set(seq, idx))

  function transformChunkConsts(chunk: any): void {
    for (let i = 0; i < chunk.consts.length; i++) {
      const c = chunk.consts[i]
      if (typeof c === 'string' && sequenceToIndex.has(c)) {
        chunk.consts[i] = sequenceToIndex.get(c)!
      }
    }
    for (const fn of chunk.funcs) {
      transformChunkConsts(fn.chunk)
    }
  }

  transformChunkConsts(a.chunk)

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

  const encodeChunk = (chunk: { consts: any[]; funcs: any[]; code: any[] }, base: number) => {
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
        case 'OBJECT':
        case 'GET_PROP':
        case 'SET_PROP':
        case 'GET_INDEX':
        case 'SET_INDEX':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          pc += 1
      }
    }

    const endPc = pc

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
  const main = encodeChunk(a.chunk as any, writePc)
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

  return errors.length ? { errors, miniSequences: sequences } : { errors: [], miniSequences: sequences }
}
