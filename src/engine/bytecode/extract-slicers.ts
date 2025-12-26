import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { SlicerRef } from './types.ts'

function visit(src: string, program: Program): SlicerRef[] {
  const refs: SlicerRef[] = []
  const lineStarts = buildLineStartsForLocs(src)
  const scopes: Array<Map<string, number>> = [new Map()]

  const getConst = (name: string): number | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const v = scopes[i]?.get(name)
      if (v !== undefined) return v
    }
    return undefined
  }

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'slicer') {
        const sampleArg = findNamedArg(expr, 'sample') ?? getPosArg(expr, 0)
        const thresholdArg = findNamedArg(expr, 'threshold') ?? getPosArg(expr, 4)

        const sampleIndexConst = tryEvalConstNumber(sampleArg?.value)
        const sampleIndexFromVar = sampleArg?.value?.kind === 'ident'
          ? getConst(sampleArg.value.name)
          : undefined
        const sampleIndex = sampleIndexConst ?? sampleIndexFromVar

        if (sampleIndex != null && Number.isFinite(sampleIndex)) {
          const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
          const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

          const thresholdRaw = tryEvalConstNumber(thresholdArg?.value)
          const threshold = thresholdRaw != null && Number.isFinite(thresholdRaw) ? thresholdRaw : 0.5

          refs.push({
            loc: calleeLoc,
            aboveLoc,
            callLoc: expr.loc,
            sampleIndex: Math.floor(sampleIndex),
            threshold,
            sampleArgLoc: sampleArg?.loc ?? null,
            thresholdArgLoc: thresholdArg?.loc ?? null,
          })
        }
      }

      visitExpr(expr.callee)
      for (const a of expr.args ?? []) {
        if (a?.kind === 'pos' || a?.kind === 'named') visitExpr(a.value)
      }
      return
    }

    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      if (expr.target?.kind === 'ident') {
        const v = tryEvalConstNumber(expr.value)
        if (v != null && Number.isFinite(v)) {
          scopes[scopes.length - 1]?.set(expr.target.name, Math.floor(v))
        }
      }
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
      for (const it of expr.items ?? []) visitExpr(it)
      return
    }

    if (expr.kind === 'object') {
      for (const p of expr.props ?? []) visitExpr(p.value)
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
      scopes.push(new Map())
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      scopes.pop()
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
      scopes.push(new Map())
      for (const s of stmt.body ?? []) visitStmt(s)
      scopes.pop()
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
    }
  }

  for (const s of program.body) visitStmt(s as any)
  return refs
}

export function extractSlicersFromProgramWithRefs(src: string, program: Program): SlicerRef[] {
  return visit(src, program)
}


