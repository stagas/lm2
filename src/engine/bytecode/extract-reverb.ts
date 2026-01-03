import type { CallExpr, Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getIndexFromCall,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import type { ReverbKind, ReverbRef } from './types.ts'

const isReverbKind = (name: string): name is ReverbKind =>
  name === 'freeverb' || name === 'dattorro' || name === 'fdn' || name === 'velvet'

export function createReverbVisitor(src: string, refs: ReverbRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: CallExpr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (!calleeName || !isReverbKind(calleeName)) return
      const reverbIndex = getIndexFromCall(expr)

      const pos0 = getPosArg(expr, 0)
      const namedIn = findNamedArg(expr, 'in')
      const namedRoomSize = findNamedArg(expr, 'roomSize')
      const namedSize = findNamedArg(expr, 'size')

      const roomSizeExpr = namedRoomSize?.value ?? namedSize?.value ?? getPosArg(expr, 1)?.value

      const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
      const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

      refs.push({
        reverbIndex,
        reverbKind: calleeName,
        loc: calleeLoc,
        aboveLoc,
        callLoc: expr.loc,
        inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
        roomSizeArgLoc: (namedRoomSize?.loc ?? namedSize?.loc ?? getPosArg(expr, 1)?.loc ?? null),
        params: {
          roomSize: getNumberOrDefault(roomSizeExpr, 0.5),
        },
      })
    },
  }
}
