import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import type { AdRef } from './types.ts'

const MAX_AD_INDEX = 63

function clampAdIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_AD_INDEX) return MAX_AD_INDEX
  return v
}

function getAdIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampAdIndex(namedIdx.value)
  return 0
}

export function createAdVisitor(src: string, refs: AdRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'ad') {
        const namedAttack = findNamedArg(expr, 'attack')
        const namedDecay = findNamedArg(expr, 'decay')
        const namedTrig = findNamedArg(expr, 'trig')

        const attackExpr = namedAttack?.value ?? getPosArg(expr, 0)?.value
        const decayExpr = namedDecay?.value ?? getPosArg(expr, 1)?.value
        const trigExpr = namedTrig?.value ?? getPosArg(expr, 2)?.value

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          adIndex: getAdIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          attackArgLoc: namedAttack?.loc ?? getPosArg(expr, 0)?.loc ?? null,
          decayArgLoc: namedDecay?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          trigArgLoc: namedTrig?.loc ?? getPosArg(expr, 2)?.loc ?? null,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.01),
            decay: getNumberOrDefault(decayExpr, 0.1),
          },
        })
      }
    }
  }
}
