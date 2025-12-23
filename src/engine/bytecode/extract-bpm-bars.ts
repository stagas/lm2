import type { Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import { locError } from './helpers.ts'

export function extractBpmFromProgram(src: string, program: Program, errors: LangError[]): number | undefined {
  let bpm: number | undefined

  for (const stmt of program.body ?? []) {
    if (stmt?.kind !== 'expr_stmt') continue
    const expr: any = (stmt as any).expr
    if (!expr || expr.kind !== 'assign') continue
    if (expr.target?.kind !== 'ident' || expr.target?.name !== 'bpm') continue

    if (expr.op !== '=') {
      errors.push(locError(src, expr.loc ?? stmt.loc, 'Only `bpm=<number>` is supported'))
      continue
    }

    const v = expr.value
    if (!v || v.kind !== 'number') {
      errors.push(locError(src, expr.loc ?? stmt.loc, '`bpm` must be assigned a number literal'))
      continue
    }

    const n = Number(v.value ?? 0)
    if (!Number.isFinite(n) || n <= 0) {
      errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`bpm` must be a positive finite number'))
      continue
    }

    bpm = n
  }

  return bpm
}

export function extractBarsFromProgram(src: string, program: Program, errors: LangError[]): number | undefined {
  let bars: number | undefined

  for (const stmt of program.body ?? []) {
    if (stmt?.kind !== 'expr_stmt') continue
    const expr: any = (stmt as any).expr
    if (!expr || expr.kind !== 'assign') continue
    if (expr.target?.kind !== 'ident' || expr.target?.name !== 'bars') continue

    if (expr.op !== '=') {
      errors.push(locError(src, expr.loc ?? stmt.loc, 'Only `bars=<number>` is supported'))
      continue
    }

    const v = expr.value
    if (!v || v.kind !== 'number') {
      errors.push(locError(src, expr.loc ?? stmt.loc, '`bars` must be assigned a number literal'))
      continue
    }

    const n = Number(v.value ?? 0)
    if (!Number.isFinite(n) || n <= 0) {
      errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`bars` must be a positive finite number'))
      continue
    }
    if (!Number.isInteger(n)) {
      errors.push(locError(src, v.loc ?? expr.loc ?? stmt.loc, '`bars` must be an integer'))
      continue
    }

    bars = n
  }

  return bars
}

export function extractBpmFromSource(src: string): { bpm?: number; errors: LangError[] } {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length) return { errors }

  const bpm = extractBpmFromProgram(src, parsed.program, errors)
  if (errors.length) return { errors }
  return { errors: [], bpm }
}

export function extractBarsFromSource(src: string): { bars?: number; errors: LangError[] } {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length) return { errors }

  const bars = extractBarsFromProgram(src, parsed.program, errors)
  if (errors.length) return { errors }
  return { errors: [], bars }
}
