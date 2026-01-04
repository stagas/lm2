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
import type { GateRef } from './types.ts'

function isKnobParamName(name: string): name is 'attack' | 'release' | 'threshold' | 'ratio' | 'knee' | 'hold' {
  return name === 'attack'
    || name === 'release'
    || name === 'threshold'
    || name === 'ratio'
    || name === 'knee'
    || name === 'hold'
}

function posIndexToKnobName(posIndex: number): 'attack' | 'release' | 'threshold' | 'ratio' | 'knee' | 'hold' | null {
  if (posIndex === 1) return 'attack'
  if (posIndex === 2) return 'release'
  if (posIndex === 3) return 'threshold'
  if (posIndex === 4) return 'ratio'
  if (posIndex === 5) return 'knee'
  if (posIndex === 6) return 'hold'
  return null
}

export function createGateVisitor(src: string, refs: GateRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'gate') {
        const pos0 = getPosArg(expr, 0)
        const namedIn = findNamedArg(expr, 'in')
        const namedKey = findNamedArg(expr, 'key')
        const posKey = getPosArg(expr, 6)

        const attackExpr = findNamedArg(expr, 'attack')?.value ?? getPosArg(expr, 1)?.value
        const releaseExpr = findNamedArg(expr, 'release')?.value ?? getPosArg(expr, 2)?.value
        const thresholdExpr = findNamedArg(expr, 'threshold')?.value ?? getPosArg(expr, 3)?.value
        const ratioExpr = findNamedArg(expr, 'ratio')?.value ?? getPosArg(expr, 4)?.value
        const kneeExpr = findNamedArg(expr, 'knee')?.value ?? getPosArg(expr, 5)?.value
        const holdExpr = findNamedArg(expr, 'hold')?.value ?? getPosArg(expr, 6)?.value

        const knobParams: GateRef['knobParams'] = []
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
          gateIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
          keyArgLoc: (namedKey?.loc ?? posKey?.loc ?? null),
          knobParams,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.001),
            release: getNumberOrDefault(releaseExpr, 0.5),
            threshold: getNumberOrDefault(thresholdExpr, -24),
            ratio: getNumberOrDefault(ratioExpr, 20),
            knee: getNumberOrDefault(kneeExpr, 0),
            hold: getNumberOrDefault(holdExpr, 0.02),
          },
        })
      }
    },
  }
}
