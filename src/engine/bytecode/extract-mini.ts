import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStarts, locToIndex } from './helpers.ts'
import { type MiniSequenceRef } from './types.ts'

export function extractMiniSequencesFromProgramWithRefs(
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
      if (
        expr.callee?.kind === 'ident'
        && (expr.callee?.name === 'mini' || expr.callee?.name === 'play')
      ) {
        const args = expr.args ?? []
        const seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? args.find((a: any) => a.kind === 'pos')
        const seqExpr = (seqArg?.kind === 'pos' || seqArg?.kind === 'named') ? seqArg.value : null

        if (seqExpr?.kind === 'string') {
          const sequence = String(seqExpr.value ?? '')

          const namedColor = args.find((a: any) => a.kind === 'named' && a.name === 'color')
          let color: string | undefined = undefined
          if (namedColor?.value?.kind === 'string') {
            color = String(namedColor.value.value ?? '') || undefined
          }
          else {
            // Treat the first additional string positional argument as the compile-time color.
            for (const a of args) {
              if (a === seqArg) continue
              if (a?.kind !== 'pos') continue
              const v = a.value
              if (v?.kind === 'string') {
                color = String(v.value ?? '') || undefined
                break
              }
            }
          }

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

  for (const stmt of program.body) {
    visitStmt(stmt)
  }

  return { sequences, refs }
}
