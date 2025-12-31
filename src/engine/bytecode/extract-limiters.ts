import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { LimiterRef } from './types.ts'

const MAX_LIMITER_INDEX = 63

function clampLimiterIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_LIMITER_INDEX) return MAX_LIMITER_INDEX
  return v
}

function getLimiterIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampLimiterIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

function isKnobParamName(name: string): name is 'release' | 'threshold' {
  return name === 'release' || name === 'threshold'
}

function posIndexToKnobName(posIndex: number): 'release' | 'threshold' | null {
  if (posIndex === 1) return 'release'
  if (posIndex === 2) return 'threshold'
  return null
}

function visit(src: string, program: Program): LimiterRef[] {
  const refs: LimiterRef[] = []
  const lineStarts = buildLineStartsForLocs(src)

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'limiter') {
        const pos0 = getPosArg(expr, 0)

        const releaseExpr = findNamedArg(expr, 'release')?.value ?? getPosArg(expr, 1)?.value
        const thresholdExpr = findNamedArg(expr, 'threshold')?.value ?? getPosArg(expr, 2)?.value

        const knobParams: LimiterRef['knobParams'] = []
        const seen = new Set<string>()
        let posIndex = 0
        for (const a of expr.args ?? []) {
          if (!a) continue
          if (a.kind === 'pos') {
            const name = posIndexToKnobName(posIndex)
            posIndex++
            if (!name) continue
            if (seen.has(name)) continue
            const v = tryEvalConstNumber(a.value)
            if (v == null || !Number.isFinite(v)) continue
            if (!a.value?.loc) continue
            seen.add(name)
            knobParams.push({ name, value: v, valueLoc: a.value.loc })
            continue
          }
          if (a.kind === 'named') {
            if (!isKnobParamName(a.name)) continue
            if (seen.has(a.name)) continue
            const v = tryEvalConstNumber(a.value)
            if (v == null || !Number.isFinite(v)) continue
            if (!a.value?.loc) continue
            seen.add(a.name)
            knobParams.push({ name: a.name, value: v, valueLoc: a.value.loc })
          }
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          limiterIndex: getLimiterIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inArgLoc: pos0?.loc ?? null,
          knobParams,
          params: {
            release: getNumberOrDefault(releaseExpr, 0.1),
            threshold: getNumberOrDefault(thresholdExpr, -0),
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

export function extractLimitersFromProgramWithRefs(src: string, program: Program): LimiterRef[] {
  return visit(src, program)
}
