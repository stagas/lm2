import type { Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import { locError } from './helpers.ts'

export function createBpmVisitor(src: string, errors: LangError[], result: { bpm: number | undefined }) {
  return {
    visitStmt(stmt: any): void {
      if (stmt?.kind !== 'expr_stmt') return
      const expr: any = stmt.expr
      if (!expr || expr.kind !== 'assign') return
      if (expr.target?.kind !== 'ident' || expr.target?.name !== 'bpm') return

      if (expr.op !== '=') {
        errors.push(locError(src, expr.loc ?? stmt.loc, 'Only `bpm=<number>` is supported'))
        return
      }

      const v = expr.value
      if (!v || v.kind !== 'number') {
        errors.push(locError(src, expr.loc ?? stmt.loc, '`bpm` must be assigned a number literal'))
        return
      }

      const n = Number(v.value ?? 0)
      if (!Number.isFinite(n) || n <= 0) {
        errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`bpm` must be a positive finite number'))
        return
      }

      result.bpm = n
    }
  }
}

export function createBarsVisitor(src: string, errors: LangError[], result: { bars: number | undefined }) {
  return {
    visitStmt(stmt: any): void {
      if (stmt?.kind !== 'expr_stmt') return
      const expr: any = stmt.expr
      if (!expr || expr.kind !== 'assign') return
      if (expr.target?.kind !== 'ident' || expr.target?.name !== 'bars') return

      if (expr.op !== '=') {
        errors.push(locError(src, expr.loc ?? stmt.loc, 'Only `bars=<number>` is supported'))
        return
      }

      const v = expr.value
      if (!v || v.kind !== 'number') {
        errors.push(locError(src, expr.loc ?? stmt.loc, '`bars` must be assigned a number literal'))
        return
      }

      const n = Number(v.value ?? 0)
      if (!Number.isFinite(n) || n <= 0) {
        errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`bars` must be a positive finite number'))
        return
      }
      if (!Number.isInteger(n)) {
        errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`bars` must be an integer'))
        return
      }

      result.bars = n
    }
  }
}

export function extractBpmFromProgram(src: string, program: Program, errors: LangError[]): number | undefined {
  // This function is deprecated - use extractEarlyDataFromProgram instead
  // For backward compatibility, implement with basic traversal
  for (const stmt of program.body ?? []) {
    if (stmt?.kind !== 'expr_stmt') continue
    const expr: any = (stmt as any).expr
    if (!expr || expr.kind !== 'assign') continue
    if (expr.target?.kind !== 'ident' || expr.target?.name !== 'bpm') continue

    if (expr.op !== '=') {
      errors.push({ message: 'Only `bpm=<number>` is supported', line: expr.loc?.line ?? 0, column: expr.loc?.column ?? 0, code: '' })
      return
    }

    const v = expr.value
    if (!v || v.kind !== 'number') {
      errors.push({ message: '`bpm` must be assigned a number literal', line: expr.loc?.line ?? 0, column: expr.loc?.column ?? 0, code: '' })
      return
    }

    const n = Number(v.value ?? 0)
    if (!Number.isFinite(n) || n <= 0) {
      errors.push({ message: '`bpm` must be a positive finite number', line: v.loc?.line ?? 0, column: v.loc?.column ?? 0, code: '' })
      return
    }

    return n
  }
  return undefined
}

export function extractBarsFromProgram(src: string, program: Program, errors: LangError[]): number | undefined {
  // This function is deprecated - use extractEarlyDataFromProgram instead
  // For backward compatibility, implement with basic traversal
  for (const stmt of program.body ?? []) {
    if (stmt?.kind !== 'expr_stmt') continue
    const expr: any = (stmt as any).expr
    if (!expr || expr.kind !== 'assign') continue
    if (expr.target?.kind !== 'ident' || expr.target?.name !== 'bars') continue

    if (expr.op !== '=') {
      errors.push({ message: 'Only `bars=<number>` is supported', line: expr.loc?.line ?? 0, column: expr.loc?.column ?? 0, code: '' })
      return
    }

    const v = expr.value
    if (!v || v.kind !== 'number') {
      errors.push({ message: '`bars` must be assigned a number literal', line: expr.loc?.line ?? 0, column: expr.loc?.column ?? 0, code: '' })
      return
    }

    const n = Number(v.value ?? 0)
    if (!Number.isFinite(n) || n <= 0) {
      errors.push({ message: '`bars` must be a positive finite number', line: v.loc?.line ?? 0, column: v.loc?.column ?? 0, code: '' })
      return
    }
    if (!Number.isInteger(n)) {
      errors.push({ message: '`bars` must be an integer', line: v.loc?.line ?? 0, column: v.loc?.column ?? 0, code: '' })
      return
    }

    return n
  }
  return undefined
}

