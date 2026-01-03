import type { Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getIndexFromCall,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { LimiterRef } from './types.ts'

function isKnobParamName(name: string): name is 'release' | 'threshold' {
  return name === 'release' || name === 'threshold'
}

function posIndexToKnobName(posIndex: number): 'release' | 'threshold' | null {
  if (posIndex === 1) return 'release'
  if (posIndex === 2) return 'threshold'
  return null
}

export function createLimiterVisitor(src: string, refs: LimiterRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
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
          limiterIndex: getIndexFromCall(expr),
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
    },
  }
}
