import type { Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import { tryEvalConstNumber } from './helpers.ts'
import {
  type TimelineLabel,
} from './types.ts'

function getPosArg(call: any, posIndex: number): any | null {
  let pos = 0
  for (const arg of call.args ?? []) {
    if (arg?.kind !== 'pos') continue
    if (pos === posIndex) return arg.value ?? null
    pos++
  }
  return null
}

function getNamedArg(call: any, name: string): any | null {
  for (const arg of call.args ?? []) {
    if (arg?.kind !== 'named') continue
    if (arg.name === name) return arg.value ?? null
  }
  return null
}

function getArg(call: any, posIndex: number, name: string): any | null {
  return getNamedArg(call, name) ?? getPosArg(call, posIndex)
}

export function extractTimelineLabelsFromProgram(program: Program): TimelineLabel[] {
  const out: TimelineLabel[] = []

  // Only check top-level expression statements for label() calls
  for (const stmt of program.body) {
    if (stmt?.kind !== 'expr_stmt') continue

    const expr = stmt.expr
    if (!expr || expr.kind !== 'call') continue

    if (expr.callee?.kind === 'ident' && expr.callee?.name === 'label') {
      const barExpr = getArg(expr, 0, 'bar')
      const textExpr = getArg(expr, 1, 'text')
      const colorExpr = getArg(expr, 2, 'color')

      const bar = tryEvalConstNumber(barExpr)
      const text = textExpr?.kind === 'string' ? String(textExpr.value ?? '') : null
      const color = colorExpr?.kind === 'string' ? String(colorExpr.value ?? '') : undefined

      if (bar != null && Number.isFinite(bar) && text != null) {
        out.push({
          bar,
          text,
          color: color || undefined,
          loc: expr.callee.loc ?? expr.loc,
        })
      }
    }
  }

  return out
}

export function extractTimelineLabelsFromSource(src: string): { labels: TimelineLabel[]; errors: LangError[] } {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length) return { labels: [], errors }
  return { labels: extractTimelineLabelsFromProgram(parsed.program), errors: [] }
}
