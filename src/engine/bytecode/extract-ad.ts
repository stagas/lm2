import type { Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getIndexFromCall,
  getNumberOrDefault,
  getPosArg,
  slotCallArgsBySig,
} from './extract-call-utils.ts'
import type { AdRef } from './types.ts'

const AD_SIG = ['attack', 'decay', 'exponent', 'trig'] as const

export function createAdVisitor(src: string, refs: AdRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'ad') {
        const namedAttack = findNamedArg(expr, 'attack')
        const namedDecay = findNamedArg(expr, 'decay')
        const namedExponent = findNamedArg(expr, 'exponent')
        const namedTrig = findNamedArg(expr, 'trig')

        const { slots } = slotCallArgsBySig(expr, AD_SIG as unknown as string[])
        const attackExpr = slots[0]
        const decayExpr = slots[1]
        const exponentExpr = slots[2]
        const trigExpr = slots[3]

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          adIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          attackArgLoc: namedAttack?.loc ?? getPosArg(expr, 0)?.loc ?? null,
          decayArgLoc: namedDecay?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          exponentArgLoc: namedExponent?.loc ?? null,
          trigArgLoc: namedTrig?.loc ?? null,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.01),
            decay: getNumberOrDefault(decayExpr, 0.1),
            exponent: getNumberOrDefault(exponentExpr, 1),
          },
        })
      }
    },
  }
}
