import type { Expr, Loc, Program } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { FreeverbRef } from './types.ts'

const MAX_FREEVERB_INDEX = 63

function clampFreeverbIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_FREEVERB_INDEX) return MAX_FREEVERB_INDEX
  return v
}

function getFreeverbIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampFreeverbIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

export function createFreeverbVisitor(src: string, refs: FreeverbRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: Expr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'freeverb') {
        const pos0 = getPosArg(expr, 0)
        const namedIn = findNamedArg(expr, 'in')
        const namedRoomsize = findNamedArg(expr, 'roomsize')
        const namedDamp = findNamedArg(expr, 'damp')
        const namedWet = findNamedArg(expr, 'wet')
        const namedDry = findNamedArg(expr, 'dry')
        const namedWidth = findNamedArg(expr, 'width')

        const roomsizeExpr = namedRoomsize?.value ?? getPosArg(expr, 1)?.value
        const dampExpr = namedDamp?.value ?? getPosArg(expr, 2)?.value
        const wetExpr = namedWet?.value ?? getPosArg(expr, 3)?.value
        const dryExpr = namedDry?.value ?? getPosArg(expr, 4)?.value
        const widthExpr = namedWidth?.value ?? getPosArg(expr, 5)?.value

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          freeverbIndex: getFreeverbIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
          roomsizeArgLoc: (namedRoomsize?.loc ?? getPosArg(expr, 1)?.loc ?? null),
          dampArgLoc: (namedDamp?.loc ?? getPosArg(expr, 2)?.loc ?? null),
          wetArgLoc: (namedWet?.loc ?? getPosArg(expr, 3)?.loc ?? null),
          dryArgLoc: (namedDry?.loc ?? getPosArg(expr, 4)?.loc ?? null),
          widthArgLoc: (namedWidth?.loc ?? getPosArg(expr, 5)?.loc ?? null),
          params: {
            roomsize: getNumberOrDefault(roomsizeExpr, 0.5),
            damp: getNumberOrDefault(dampExpr, 0.5),
            wet: getNumberOrDefault(wetExpr, 0.33),
            dry: getNumberOrDefault(dryExpr, 0.4),
            width: getNumberOrDefault(widthExpr, 1.0),
          },
        })
      }
    }
  }
}
