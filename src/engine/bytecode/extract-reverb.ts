import type { Expr, Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import type { ReverbKind, ReverbRef } from './types.ts'

const MAX_REVERB_INDEX = 63

const isReverbKind = (name: string): name is ReverbKind => name === 'freeverb' || name === 'dattorro'

export function createReverbVisitor(src: string, refs: ReverbRef[]) {
  const lineStarts = buildLineStartsForLocs(src)
  let nextReverbIndex = 0

  return {
    visitCall(expr: Expr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (!calleeName || !isReverbKind(calleeName)) return

      const reverbIndex = Math.min(MAX_REVERB_INDEX, nextReverbIndex)
      nextReverbIndex++

      const pos0 = getPosArg(expr, 0)
      const namedIn = findNamedArg(expr, 'in')
      const namedRoomSize = findNamedArg(expr, 'roomSize')

      const roomSizeExpr = namedRoomSize?.value ?? getPosArg(expr, 1)?.value

      const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
      const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

      refs.push({
        reverbIndex,
        reverbKind: calleeName,
        loc: calleeLoc,
        aboveLoc,
        callLoc: expr.loc,
        inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
        roomSizeArgLoc: (namedRoomSize?.loc ?? getPosArg(expr, 1)?.loc ?? null),
        params: {
          roomSize: getNumberOrDefault(roomSizeExpr, 0.5),
        },
      })
    },
  }
}


