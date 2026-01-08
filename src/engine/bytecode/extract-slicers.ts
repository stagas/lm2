import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { SlicerRef } from './types.ts'

export function createSlicersVisitor(src: string, refs: SlicerRef[]) {
  const lineStarts = buildLineStartsForLocs(src)
  const scopes: Array<Map<string, number>> = [new Map()]

  const recordIndexOf = (expr: any): number | undefined => {
    if (expr?.kind !== 'call') return undefined
    if (expr.callee?.kind !== 'ident' || expr.callee.name !== 'record') return undefined
    const idxArg = findNamedArg(expr, '%index') ?? findNamedArg(expr, 'index')
    const idx = tryEvalConstNumber(idxArg?.value)
    if (idx == null || !Number.isFinite(idx)) return undefined
    return Math.floor(idx)
  }

  const getConst = (name: string): number | undefined => {
    for (let i = scopes.length - 1; i >= 0; i--) {
      const v = scopes[i]?.get(name)
      if (v !== undefined) return v
    }
    return undefined
  }

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'slicer') {
        const sampleArg = findNamedArg(expr, 'sample') ?? getPosArg(expr, 0)
        const thresholdArg = findNamedArg(expr, 'threshold') ?? getPosArg(expr, 4)

        const sampleIndexConst = tryEvalConstNumber(sampleArg?.value)
        const sampleIndexFromVar = sampleArg?.value?.kind === 'ident'
          ? getConst(sampleArg.value.name)
          : undefined
        const sampleIndexFromRecord = recordIndexOf(sampleArg?.value)
        const sampleIndex = sampleIndexConst ?? sampleIndexFromVar ?? sampleIndexFromRecord

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
    },

    visitStmt(stmt: any): void {
      if (stmt?.kind === 'expr_stmt' && stmt.expr?.kind === 'assign' && stmt.expr.op === '=' &&
          stmt.expr.target?.kind === 'ident') {
        const name = stmt.expr.target.name
        const value = tryEvalConstNumber(stmt.expr.value)
        if (value != null && Number.isFinite(value)) {
          scopes[scopes.length - 1].set(name, value)
        }
        else {
          const recordIndex = recordIndexOf(stmt.expr.value)
          if (recordIndex != null && Number.isFinite(recordIndex)) {
            scopes[scopes.length - 1].set(name, recordIndex)
          }
        }
      }
    }
  }
}



