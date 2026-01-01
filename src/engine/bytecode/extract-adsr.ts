import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import type { AdsrRef } from './types.ts'

const MAX_ADSR_INDEX = 63

function clampAdsrIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_ADSR_INDEX) return MAX_ADSR_INDEX
  return v
}

function getAdsrIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampAdsrIndex(namedIdx.value)
  return 0
}

export function createAdsrVisitor(src: string, refs: AdsrRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'adsr') {
        const namedAttack = findNamedArg(expr, 'attack')
        const namedDecay = findNamedArg(expr, 'decay')
        const namedSustain = findNamedArg(expr, 'sustain')
        const namedRelease = findNamedArg(expr, 'release')
        const namedTrig = findNamedArg(expr, 'trig')

        const attackExpr = namedAttack?.value ?? getPosArg(expr, 0)?.value
        const decayExpr = namedDecay?.value ?? getPosArg(expr, 1)?.value
        const sustainExpr = namedSustain?.value ?? getPosArg(expr, 2)?.value
        const releaseExpr = namedRelease?.value ?? getPosArg(expr, 3)?.value
        const trigExpr = namedTrig?.value ?? getPosArg(expr, 4)?.value

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          adsrIndex: getAdsrIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          attackArgLoc: namedAttack?.loc ?? getPosArg(expr, 0)?.loc ?? null,
          decayArgLoc: namedDecay?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          sustainArgLoc: namedSustain?.loc ?? getPosArg(expr, 2)?.loc ?? null,
          releaseArgLoc: namedRelease?.loc ?? getPosArg(expr, 3)?.loc ?? null,
          trigArgLoc: namedTrig?.loc ?? getPosArg(expr, 4)?.loc ?? null,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.01),
            decay: getNumberOrDefault(decayExpr, 0.1),
            sustain: getNumberOrDefault(sustainExpr, 0.7),
            release: getNumberOrDefault(releaseExpr, 0.2),
          },
        })
      }
    }
  }
}
