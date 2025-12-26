import type { Loc, Program } from '../../lang/ast.ts'
import { tryEvalConstNumber } from './helpers.ts'
import { findNamedArg } from './extract-call-utils.ts'
import type { AtRef, EveryRef } from './types.ts'

const MAX_TRIG_INDEX = 255

function clampTrigIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_TRIG_INDEX) return MAX_TRIG_INDEX
  return v
}

function getIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampTrigIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

function visitEvery(src: string, program: Program): EveryRef[] {
  void src
  const refs: EveryRef[] = []

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'every') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          everyIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
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

  for (const s of program.body) visitStmt(s as any)
  return refs
}

function visitAt(src: string, program: Program): AtRef[] {
  void src
  const refs: AtRef[] = []

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'at') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          atIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
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

  for (const s of program.body) visitStmt(s as any)
  return refs
}

export function extractEveriesFromProgramWithRefs(src: string, program: Program): EveryRef[] {
  return visitEvery(src, program)
}

export function extractAtsFromProgramWithRefs(src: string, program: Program): AtRef[] {
  return visitAt(src, program)
}


