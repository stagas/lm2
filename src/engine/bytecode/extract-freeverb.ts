import type { Expr, Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import type { FreeverbRef } from './types.ts'

const MAX_FREEVERB_INDEX = 63

export function createFreeverbVisitor(src: string, refs: FreeverbRef[]) {
  const lineStarts = buildLineStartsForLocs(src)
  let nextFreeverbIndex = 0

  return {
    visitCall(expr: Expr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'freeverb') {
        const freeverbIndex = Math.min(MAX_FREEVERB_INDEX, nextFreeverbIndex)
        nextFreeverbIndex++

        const pos0 = getPosArg(expr, 0)
        const namedIn = findNamedArg(expr, 'in')
        const namedRoomSize = findNamedArg(expr, 'roomSize')
        const namedDamp = findNamedArg(expr, 'damp')

        const roomSizeExpr = namedRoomSize?.value ?? getPosArg(expr, 1)?.value
        const dampExpr = namedDamp?.value ?? getPosArg(expr, 2)?.value

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          freeverbIndex,
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
          roomSizeArgLoc: (namedRoomSize?.loc ?? getPosArg(expr, 1)?.loc ?? null),
          dampArgLoc: (namedDamp?.loc ?? getPosArg(expr, 2)?.loc ?? null),
          params: {
            roomSize: getNumberOrDefault(roomSizeExpr, 0.5),
            damp: getNumberOrDefault(dampExpr, 0.5),
          },
        })
      }
    }
  }
}
