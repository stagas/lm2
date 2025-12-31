import type { Loc, Program } from '../../lang/ast.ts'
import { tryEvalConstNumber } from './helpers.ts'
import { findNamedArg } from './extract-call-utils.ts'
import type { AtRef, EuclidRef, EveryRef } from './types.ts'

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

export function createEveryVisitor(refs: EveryRef[]) {
  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'every') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          everyIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
      }
    }
  }
}

export function createAtVisitor(refs: AtRef[]) {
  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'at') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          atIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
      }
    }
  }
}

export function createEuclidVisitor(refs: EuclidRef[]) {
  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'euclid') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          euclidIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
      }
    }
  }
}



