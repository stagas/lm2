import type { Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import { findScaleIndex } from '../../mini/scales.ts'
import { locError } from './helpers.ts'

export function createScaleVisitor(src: string, errors: LangError[], result: { scale: number | undefined }) {
  return {
    visitStmt(stmt: any): void {
      if (stmt?.kind !== 'expr_stmt') return
      const expr: any = stmt.expr
      if (!expr || expr.kind !== 'assign') return
      if (expr.target?.kind !== 'ident' || expr.target?.name !== 'scale') return

      if (expr.op !== '=') {
        errors.push(locError(src, expr.loc ?? stmt.loc, 'Only `scale=<name>` is supported'))
        return
      }

      const v = expr.value
      if (!v) {
        errors.push(locError(src, expr.loc ?? stmt.loc, '`scale` must be assigned a scale name'))
        return
      }

      if (v.kind === 'number') {
        const n = Number(v.value ?? 0)
        if (!Number.isFinite(n)) {
          errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`scale` must be a finite number'))
          return
        }
        result.scale = Math.max(0, Math.floor(n))
        return
      }

      const name = v.kind === 'string'
        ? String(v.value ?? '')
        : v.kind === 'ident'
          ? String(v.name ?? '')
          : ''

      if (!name) {
        errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`scale` must be assigned a scale name'))
        return
      }

      result.scale = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0
    }
  }
}

export function extractScaleFromProgram(src: string, program: Program, errors: LangError[]): number | undefined {
  // This function is deprecated - use extractEarlyDataFromProgram instead
  // For backward compatibility, implement with basic traversal
  for (const stmt of program.body ?? []) {
    if (stmt?.kind !== 'expr_stmt') continue
    const expr: any = stmt.expr
    if (!expr || expr.kind !== 'assign') continue
    if (expr.target?.kind !== 'ident' || expr.target?.name !== 'scale') continue

    if (expr.op !== '=') {
      errors.push({ message: 'Only `scale=<name>` is supported', line: expr.loc?.line ?? 0, column: expr.loc?.column ?? 0, code: '' })
      return
    }

    const v = expr.value
    if (!v) {
      errors.push({ message: '`scale` must be assigned a scale name', line: expr.loc?.line ?? 0, column: expr.loc?.column ?? 0, code: '' })
      return
    }

    if (v.kind === 'number') {
      const n = Number(v.value ?? 0)
      if (!Number.isFinite(n)) {
        errors.push({ message: '`scale` must be a finite number', line: v.loc?.line ?? 0, column: v.loc?.column ?? 0, code: '' })
        return
      }
      return Math.max(0, Math.floor(n))
    }

    const name = v.kind === 'string'
      ? String(v.value ?? '')
      : v.kind === 'ident'
        ? String(v.name ?? '')
        : ''

    if (!name) {
      errors.push({ message: '`scale` must be assigned a scale name', line: v.loc?.line ?? 0, column: v.loc?.column ?? 0, code: '' })
      return
    }

    return findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0
  }
  return undefined
}

export function extractScaleFromSource(src: string): { scale?: number; errors: LangError[] } {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length) return { errors }

  const scale = extractScaleFromProgram(src, parsed.program, errors)
  if (errors.length) return { errors }
  return { errors: [], scale }
}


