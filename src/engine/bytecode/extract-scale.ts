import type { Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import { findScaleIndex } from '../../mini/scales.ts'
import { locError } from './helpers.ts'

export function extractScaleFromProgram(src: string, program: Program, errors: LangError[]): number | undefined {
  let scale: number | undefined

  for (const stmt of program.body ?? []) {
    if (stmt?.kind !== 'expr_stmt') continue
    const expr: any = (stmt as any).expr
    if (!expr || expr.kind !== 'assign') continue
    if (expr.target?.kind !== 'ident' || expr.target?.name !== 'scale') continue

    if (expr.op !== '=') {
      errors.push(locError(src, expr.loc ?? stmt.loc, 'Only `scale=<name>` is supported'))
      continue
    }

    const v = expr.value
    if (!v) {
      errors.push(locError(src, expr.loc ?? stmt.loc, '`scale` must be assigned a scale name'))
      continue
    }

    if (v.kind === 'number') {
      const n = Number(v.value ?? 0)
      if (!Number.isFinite(n)) {
        errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`scale` must be a finite number'))
        continue
      }
      scale = Math.max(0, Math.floor(n))
      continue
    }

    const name = v.kind === 'string'
      ? String(v.value ?? '')
      : v.kind === 'ident'
        ? String(v.name ?? '')
        : ''

    if (!name) {
      errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`scale` must be assigned a scale name'))
      continue
    }

    scale = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0
  }

  return scale
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


