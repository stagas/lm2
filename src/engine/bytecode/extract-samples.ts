import type { Loc, Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { locError, tryEvalConstNumber } from './helpers.ts'
import { type SampleDef } from './types.ts'

export function extractSamplesFromProgramWithRefs(
  src: string,
  program: Program,
  errors: LangError[],
): { samples: SampleDef[] } {
  const samples: SampleDef[] = []
  const keyToIndex = new Map<string, number>()

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

  function ensureSample(id: number, loc: Loc): number {
    const key = `freesound:${id}`
    const prev = keyToIndex.get(key)
    if (prev !== undefined) return prev
    const sampleIndex = samples.length
    samples.push({
      sampleIndex,
      provider: 'freesound',
      id,
      url: `https://freesound.cowbell.workers.dev/get?id=${id}`,
      loc,
    })
    keyToIndex.set(key, sampleIndex)
    return sampleIndex
  }

  function visitExpr(expr: any): void {
    if (!expr) return
    if (expr.kind === 'call') {
      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'freesound') {
        const idExpr = getArg(expr, 0, 'id')
        const id = tryEvalConstNumber(idExpr)
        if (id == null || !Number.isFinite(id) || !Number.isInteger(id) || id < 0) {
          errors.push(locError(src, idExpr?.loc ?? expr.loc, '`freesound(id:...)` requires an integer id literal'))
        }
        else {
          ensureSample(id, expr.loc)
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
  return { samples }
}
