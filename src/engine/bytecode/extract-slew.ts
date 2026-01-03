import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getIndexFromCall, getNumberOrDefault, getPosArg,
  slotCallArgsBySig } from './extract-call-utils.ts'
import type { SlewRef } from './types.ts'

const SLEW_SIG = ['in', 'up', 'down', 'exponent'] as const

export function createSlewVisitor(src: string, refs: SlewRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'slew') {
        const namedUp = findNamedArg(expr, 'up')
        const namedDown = findNamedArg(expr, 'down')
        const namedExponent = findNamedArg(expr, 'exponent')

        const { slots } = slotCallArgsBySig(expr, SLEW_SIG as unknown as string[])
        const upExpr = slots[1]
        const downExpr = slots[2] || upExpr
        const exponentExpr = slots[3]

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          slewIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          upArgLoc: namedUp?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          downArgLoc: namedDown?.loc ?? getPosArg(expr, 2)?.loc ?? null,
          exponentArgLoc: namedExponent?.loc ?? null,
          params: {
            up: getNumberOrDefault(upExpr, 0.1),
            down: getNumberOrDefault(downExpr, 0.1),
            exponent: getNumberOrDefault(exponentExpr, 1),
          },
        })
      }
    },
  }
}
