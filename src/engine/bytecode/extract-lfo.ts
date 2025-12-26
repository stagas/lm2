import type { Loc, Program } from '../../lang/ast.ts'
import { tryEvalConstNumber } from './helpers.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault, getPosArg } from './extract-call-utils.ts'
import type { LfoRef } from './types.ts'

const MAX_LFO_INDEX = 63

function clampLfoIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_LFO_INDEX) return MAX_LFO_INDEX
  return v
}

function lfoTypeFromCallee(calleeName: string): LfoRef['lfoType'] | null {
  if (calleeName === 'lfosine') return 'sine'
  if (calleeName === 'lfotri') return 'tri'
  if (calleeName === 'lfosaw') return 'saw'
  if (calleeName === 'lforamp') return 'ramp'
  if (calleeName === 'lfosqr') return 'sqr'
  if (calleeName === 'lfosah') return 'sah'
  return null
}

function getLfoIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampLfoIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

function visit(src: string, program: Program): LfoRef[] {
  const refs: LfoRef[] = []
  const lineStarts = buildLineStartsForLocs(src)

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      const lfoType = calleeName ? lfoTypeFromCallee(calleeName) : null
      if (lfoType) {
        const isSah = lfoType === 'sah'

        const namedBar = findNamedArg(expr, 'bar')
        const namedOffset = findNamedArg(expr, 'offset')
        const namedTrig = findNamedArg(expr, 'trig')
        const namedSeed = isSah ? findNamedArg(expr, 'seed') : null

        const barExpr = namedBar?.value ?? getPosArg(expr, 0)?.value

        const offsetPos = isSah ? 2 : 1
        const trigPos = isSah ? 3 : 2
        const seedPos = 1

        const offsetExpr = namedOffset?.value ?? getPosArg(expr, offsetPos)?.value
        const trigExpr = namedTrig?.value ?? getPosArg(expr, trigPos)?.value
        const seedExpr = isSah ? (namedSeed?.value ?? getPosArg(expr, seedPos)?.value) : null

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          lfoIndex: getLfoIndexFromCall(expr),
          lfoType,
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          barArgLoc: (namedBar?.loc ?? getPosArg(expr, 0)?.loc ?? null),
          offsetArgLoc: (namedOffset?.loc ?? getPosArg(expr, offsetPos)?.loc ?? null),
          trigArgLoc: (namedTrig?.loc ?? getPosArg(expr, trigPos)?.loc ?? null),
          seedArgLoc: isSah ? (namedSeed?.loc ?? getPosArg(expr, seedPos)?.loc ?? null) : null,
          params: {
            bar: getNumberOrDefault(barExpr, 1 / 16),
            offset: getNumberOrDefault(offsetExpr, 0),
            seed: isSah ? getNumberOrDefault(seedExpr, 1234) : 1234,
          },
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

export function extractLfosFromProgramWithRefs(src: string, program: Program): LfoRef[] {
  return visit(src, program)
}


