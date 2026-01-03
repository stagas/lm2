import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getIndexFromCall, getNumberOrDefault, getPosArg,
  slotCallArgsBySig } from './extract-call-utils.ts'
import type { AdsrRef } from './types.ts'

const ADSR_SIG = ['attack', 'decay', 'sustain', 'release', 'exponent', 'trig'] as const

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
        const namedExponent = findNamedArg(expr, 'exponent')
        const namedTrig = findNamedArg(expr, 'trig')

        const { slots } = slotCallArgsBySig(expr, ADSR_SIG as unknown as string[])
        const attackExpr = slots[0]
        const decayExpr = slots[1]
        const sustainExpr = slots[2]
        const releaseExpr = slots[3]
        const exponentExpr = slots[4]
        const trigExpr = slots[5]

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          adsrIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          attackArgLoc: namedAttack?.loc ?? getPosArg(expr, 0)?.loc ?? null,
          decayArgLoc: namedDecay?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          sustainArgLoc: namedSustain?.loc ?? getPosArg(expr, 2)?.loc ?? null,
          releaseArgLoc: namedRelease?.loc ?? getPosArg(expr, 3)?.loc ?? null,
          exponentArgLoc: namedExponent?.loc ?? null,
          trigArgLoc: namedTrig?.loc ?? null,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.01),
            decay: getNumberOrDefault(decayExpr, 0.1),
            sustain: getNumberOrDefault(sustainExpr, 0.7),
            release: getNumberOrDefault(releaseExpr, 0.2),
            exponent: getNumberOrDefault(exponentExpr, 1),
          },
        })
      }
    },
  }
}
