import type { Program } from '../../lang/ast.ts'
import {
  AnalyserRef,
} from './types.ts'

export function extractAnalysersFromProgramWithRefs(program: Program): AnalyserRef[] {
  const refs: AnalyserRef[] = []
  const MAX_ANALYSER_INDEX = 63

  function getPosArgValue(call: any, posIndex: number): any | null {
    let pos = 0
    for (const arg of call.args ?? []) {
      if (arg?.kind !== 'pos') continue
      if (pos === posIndex) return arg.value ?? null
      pos++
    }
    return null
  }

  function clampAnalyserIndex(n: any): number {
    const v = Math.floor(Number(n ?? 0))
    if (!Number.isFinite(v)) return 0
    if (v < 0) return 0
    if (v > MAX_ANALYSER_INDEX) return MAX_ANALYSER_INDEX
    return v
  }

  function getAnalyserIndexFromCall(callExpr: any): number {
    const idxArg = getPosArgValue(callExpr, 1)
    if (idxArg?.kind === 'number') return clampAnalyserIndex(idxArg.value)
    return 0
  }

  function visitOutCall(expr: any): void {
    const audioArg = getPosArgValue(expr, 0)
    if (audioArg?.kind === 'call' && audioArg.callee?.kind === 'ident' && audioArg.callee?.name === 'analyser') {
      refs.push({
        analyserIndex: getAnalyserIndexFromCall(audioArg),
        loc: expr.callee.loc ?? expr.loc,
      })

      // Avoid duplicating widgets for the nested analyser() by visiting only the signal.
      const signal = getPosArgValue(audioArg, 0)
      visitExpr(signal)
      return
    }

    // Fallback: still traverse the output expression normally (no implicit analyser found).
    visitExpr(audioArg)
  }

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      if (expr.callee?.kind === 'ident' && (expr.callee?.name === 'out' || expr.callee?.name === 'solo')) {
        visitOutCall(expr)
        return
      }

      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'analyser') {
        refs.push({
          analyserIndex: getAnalyserIndexFromCall(expr),
          loc: expr.callee.loc ?? expr.loc,
        })
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
  return refs
}
