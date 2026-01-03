import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { SlewRef } from './types.ts'

const MAX_SLEW_INDEX = 255

function clampSlewIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_SLEW_INDEX) return MAX_SLEW_INDEX
  return v
}

function getSlewIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampSlewIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

export function createSlewVisitor(src: string, refs: SlewRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'slew') {
        const namedUp = findNamedArg(expr, 'up')
        const namedDown = findNamedArg(expr, 'down')
        const namedExponent = findNamedArg(expr, 'exp') ?? findNamedArg(expr, 'exponent')

        // Smart positional parsing: determine parameter roles based on count and types
        let upExpr, downExpr, exponentExpr

        if (namedUp || namedDown || namedExponent) {
          // Named parameters present - use standard positional fallback
          upExpr = namedUp?.value ?? getPosArg(expr, 1)?.value
          downExpr = namedDown?.value ?? getPosArg(expr, 2)?.value
          exponentExpr = namedExponent?.value ?? getPosArg(expr, 3)?.value
        } else {
          // Pure positional: slew(in, up?, down?, exp?)
          upExpr = getPosArg(expr, 1)?.value
          downExpr = getPosArg(expr, 2)?.value
          exponentExpr = getPosArg(expr, 3)?.value
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          slewIndex: getSlewIndexFromCall(expr),
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
    }
  }
}
