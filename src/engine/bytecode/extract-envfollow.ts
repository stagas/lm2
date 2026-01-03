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
import type { EnvfollowRef } from './types.ts'

const ENVFOLLOW_SIG = ['in', 'attack', 'release'] as const

export function createEnvfollowVisitor(src: string, refs: EnvfollowRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'envfollow') {
        const namedInput = findNamedArg(expr, 'in')
        const namedAttack = findNamedArg(expr, 'attack')
        const namedRelease = findNamedArg(expr, 'release')

        const { slots } = slotCallArgsBySig(expr, ENVFOLLOW_SIG as unknown as string[])
        const inputExpr = slots[0]
        const attackExpr = slots[1]
        const releaseExpr = slots[2]

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          envfollowIndex: getIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inputArgLoc: namedInput?.loc ?? getPosArg(expr, 0)?.loc ?? null,
          attackArgLoc: namedAttack?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          releaseArgLoc: namedRelease?.loc ?? getPosArg(expr, 2)?.loc ?? null,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.01),
            release: getNumberOrDefault(releaseExpr, 0.1),
          },
        })
      }
    },
  }
}
