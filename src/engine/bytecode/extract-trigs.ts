import type { CallExpr, Loc } from '../../lang/ast.ts'
import { getIndexFromCall } from './extract-call-utils.ts'
import type { AtRef, EuclidRef, EveryRef } from './types.ts'

export function createEveryVisitor(refs: EveryRef[]) {
  return {
    visitCall(expr: CallExpr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'every') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          everyIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
      }
    },
  }
}

export function createAtVisitor(refs: AtRef[]) {
  return {
    visitCall(expr: CallExpr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'at') {
        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        refs.push({
          atIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          callLoc: expr.loc,
        })
      }
    },
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
    },
  }
}
