import type { Loc } from '../../lang/ast.ts'
import { type LangError, lineText } from '../../lang/errors.ts'
import { findNamedArg } from './extract-call-utils.ts'
import { VmBinary, VmUnary } from './types.ts'

export function encoderError(src: string, message: string): LangError {
  return { message, line: 1, column: 1, length: 1, code: lineText(src, 1) }
}

export function unaryCode(opName: string): VmUnary | null {
  if (opName === '-') return VmUnary.Neg
  if (opName === '!') return VmUnary.Not
  if (opName === '~') return VmUnary.BitNot
  return null
}

export function binaryCode(opName: string): VmBinary | null {
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

export function buildLineStarts(src: string): number[] {
  const starts = [0]
  for (let i = 0; i < src.length; i++) {
    if (src[i] === '\n') starts.push(i + 1)
  }
  return starts
}

export function locToIndex(lineStarts: number[], loc: Pick<Loc, 'line' | 'column'>): number {
  const lineStart = lineStarts[loc.line - 1] ?? 0
  return lineStart + (loc.column - 1)
}

export function locError(src: string, loc: Pick<Loc, 'line' | 'column' | 'length'>, message: string): LangError {
  return {
    message,
    line: loc.line,
    column: loc.column,
    length: Math.max(1, loc.length),
    code: lineText(src, loc.line),
  }
}

export function tryEvalConstNumber(expr: any): number | null {
  if (!expr) return null
  if (expr.kind === 'number') return Number(expr.value ?? expr.raw ?? 0)
  if (expr.kind === 'unary') {
    const v = tryEvalConstNumber(expr.expr)
    if (v == null) return null
    if (expr.op === '-') return -v
    if (expr.op === '+') return v
    return null
  }
  if (expr.kind === 'binary') {
    const a = tryEvalConstNumber(expr.left)
    const b = tryEvalConstNumber(expr.right)
    if (a == null || b == null) return null
    if (expr.op === '+') return a + b
    if (expr.op === '-') return a - b
    if (expr.op === '*') return a * b
    if (expr.op === '/') return a / b
    if (expr.op === '%') return a % b
    if (expr.op === '**') return a ** b
    return null
  }
  return null
}
