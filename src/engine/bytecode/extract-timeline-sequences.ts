import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStarts } from '../ui/editor-spans.ts'
import { locToIndex } from './helpers.ts'
import {
  type TimelineSequenceDef,
  type TimelineSequenceRef,
} from './types.ts'

export function extractTimelineSequencesFromProgramWithRefs(
  src: string,
  program: Program,
): { sequences: TimelineSequenceDef[]; refs: TimelineSequenceRef[] } {
  const sequences: TimelineSequenceDef[] = []
  const refs: TimelineSequenceRef[] = []
  const keyToIndex = new Map<string, number>()
  const lineStarts = buildLineStarts(src)

  function ensureIndex(sequence: string): number {
    const prev = keyToIndex.get(sequence)
    if (prev !== undefined) return prev
    const idx = sequences.length
    sequences.push({ sequence })
    keyToIndex.set(sequence, idx)
    return idx
  }

  function addRef(sequence: string, loc: Loc, color?: string): void {
    const seqIndex = ensureIndex(sequence)
    const quoteStart = locToIndex(lineStarts, loc)
    refs.push({
      seqIndex,
      sequence,
      color: color || undefined,
      start: quoteStart + 1,
      end: quoteStart + Math.max(0, loc.length - 1),
      loc,
    })
  }

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'timeline') {
        const args = expr.args ?? []
        const posArgs = args.filter((a: any) => a.kind === 'pos')

        const namedSeqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
        const namedColorArg = args.find((a: any) => a.kind === 'named' && a.name === 'color')

        let seqArg: any | null = namedSeqArg ?? null
        let seqPosIndex = -1

        if (!seqArg) {
          for (let i = 0; i < posArgs.length; i++) {
            const v = posArgs[i]?.value
            if (v?.kind === 'string') {
              seqPosIndex = i
              break
            }
          }
          if (seqPosIndex === -1) seqPosIndex = posArgs.length >= 2 ? 1 : 0
          seqArg = posArgs[seqPosIndex] ?? null
        }

        const seqExpr = seqArg?.kind === 'pos' || seqArg?.kind === 'named' ? seqArg.value : null
        if (seqExpr?.kind === 'string') {
          const sequence = String(seqExpr.value ?? '')

          let colorExpr: any | null = namedColorArg?.value ?? null
          if (!colorExpr) {
            if (seqPosIndex >= 0) {
              colorExpr = posArgs[seqPosIndex + 1]?.value ?? null
            }
            else {
              for (let i = 0; i < posArgs.length; i++) {
                const v = posArgs[i]?.value
                if (v?.kind === 'string') {
                  colorExpr = v
                  break
                }
              }
            }
          }
          const color = colorExpr?.kind === 'string' ? (String(colorExpr.value ?? '') || undefined) : undefined

          addRef(sequence, seqExpr.loc, color)
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

  for (const stmt of program.body) visitStmt(stmt)
  return { sequences, refs }
}
