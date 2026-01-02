import type { Expr, Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { ReverbKind, ReverbRef } from './types.ts'

const MAX_REVERB_INDEX = 255

const isReverbKind = (name: string): name is ReverbKind => name === 'freeverb' || name === 'dattorro' || name === 'fdn' || name === 'velvet'

function clampReverbIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_REVERB_INDEX) return MAX_REVERB_INDEX
  return v
}

function getReverbIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampReverbIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

export function createReverbVisitor(src: string, refs: ReverbRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: Expr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (!calleeName || !isReverbKind(calleeName)) return
      const reverbIndex = getReverbIndexFromCall(expr)

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


