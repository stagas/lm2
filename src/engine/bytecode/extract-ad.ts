import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { AdRef } from './types.ts'

const MAX_AD_INDEX = 255

function clampAdIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_AD_INDEX) return MAX_AD_INDEX
  return v
}

function getAdIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampAdIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

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

        // Smart positional parsing: determine parameter roles based on count and types
        let attackExpr, decayExpr, exponentExpr, trigExpr

        if (namedAttack || namedDecay || namedExponent || namedTrig) {
          // Named parameters present - use standard positional fallback
          attackExpr = namedAttack?.value ?? getPosArg(expr, 0)?.value
          decayExpr = namedDecay?.value ?? getPosArg(expr, 1)?.value
          exponentExpr = namedExponent?.value ?? getPosArg(expr, 2)?.value
          trigExpr = namedTrig?.value ?? getPosArg(expr, 3)?.value
        } else {
          // Pure positional - infer based on argument count
          const posArgs = []
          for (let i = 0; i < 4; i++) {
            const arg = getPosArg(expr, i)
            if (arg) posArgs.push(arg)
            else break
          }

          if (posArgs.length >= 4) {
            // 4+ args: attack, decay, exponent, trig
            attackExpr = posArgs[0].value
            decayExpr = posArgs[1].value
            exponentExpr = posArgs[2].value
            trigExpr = posArgs[3].value
          } else if (posArgs.length === 3) {
            // 3 args: check if 3rd arg looks like a trigger (variable) or exponent (number)
            const thirdArg = posArgs[2].value
            const isLikelyTrigger = thirdArg && (
              thirdArg.kind === 'ident' || // variable reference
              (thirdArg.kind === 'call' && thirdArg.callee?.name !== 'note' && thirdArg.callee?.name !== 'degree') // function call (likely trigger signal)
            )

            if (isLikelyTrigger) {
              // 3rd arg is likely trig: attack, decay, trig
              attackExpr = posArgs[0].value
              decayExpr = posArgs[1].value
              trigExpr = posArgs[2].value
              exponentExpr = undefined // default
            } else {
              // 3rd arg is likely exponent: attack, decay, exponent
              attackExpr = posArgs[0].value
              decayExpr = posArgs[1].value
              exponentExpr = posArgs[2].value
              trigExpr = undefined // default
            }
          } else if (posArgs.length >= 2) {
            // 2 args: attack, decay
            attackExpr = posArgs[0].value
            decayExpr = posArgs[1].value
            exponentExpr = undefined
            trigExpr = undefined
          }
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          adIndex: getAdIndexFromCall(expr),
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
    }
  }
}
