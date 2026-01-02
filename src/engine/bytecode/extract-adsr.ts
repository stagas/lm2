import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { AdsrRef } from './types.ts'

const MAX_ADSR_INDEX = 255

function clampAdsrIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_ADSR_INDEX) return MAX_ADSR_INDEX
  return v
}

export function createAdsrVisitor(src: string, refs: AdsrRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  function getAdsrIndexFromCall(call: any): number {
    const namedIdx = findNamedArg(call, 'index')
    if (namedIdx?.value) return clampAdsrIndex(tryEvalConstNumber(namedIdx.value))
    return 0
  }

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'adsr') {
        const namedAttack = findNamedArg(expr, 'attack')
        const namedDecay = findNamedArg(expr, 'decay')
        const namedSustain = findNamedArg(expr, 'sustain')
        const namedRelease = findNamedArg(expr, 'release')
        const namedExponent = findNamedArg(expr, 'exponent')
        const namedTrig = findNamedArg(expr, 'trig')

        // Smart positional parsing for ADSR
        let attackExpr, decayExpr, sustainExpr, releaseExpr, exponentExpr, trigExpr

        if (namedAttack || namedDecay || namedSustain || namedRelease || namedExponent || namedTrig) {
          // Named parameters present - use standard positional fallback
          attackExpr = namedAttack?.value ?? getPosArg(expr, 0)?.value
          decayExpr = namedDecay?.value ?? getPosArg(expr, 1)?.value
          sustainExpr = namedSustain?.value ?? getPosArg(expr, 2)?.value
          releaseExpr = namedRelease?.value ?? getPosArg(expr, 3)?.value
          exponentExpr = namedExponent?.value ?? getPosArg(expr, 4)?.value
          trigExpr = namedTrig?.value ?? getPosArg(expr, 5)?.value
        } else {
          // Pure positional - infer based on argument count
          const posArgs = []
          for (let i = 0; i < 6; i++) {
            const arg = getPosArg(expr, i)
            if (arg) posArgs.push(arg)
            else break
          }

          if (posArgs.length >= 6) {
            // 6+ args: attack, decay, sustain, release, exponent, trig
            attackExpr = posArgs[0].value
            decayExpr = posArgs[1].value
            sustainExpr = posArgs[2].value
            releaseExpr = posArgs[3].value
            exponentExpr = posArgs[4].value
            trigExpr = posArgs[5].value
          } else if (posArgs.length === 5) {
            // 5 args: check if 5th arg looks like a trigger
            const fifthArg = posArgs[4].value
            const isLikelyTrigger = fifthArg && (
              fifthArg.kind === 'ident' || // variable reference
              (fifthArg.kind === 'call' && fifthArg.callee?.name !== 'note' && fifthArg.callee?.name !== 'degree') // function call
            )

            if (isLikelyTrigger) {
              // 5th arg is likely trig: attack, decay, sustain, release, trig
              attackExpr = posArgs[0].value
              decayExpr = posArgs[1].value
              sustainExpr = posArgs[2].value
              releaseExpr = posArgs[3].value
              trigExpr = posArgs[4].value
              exponentExpr = undefined // default
            } else {
              // 5th arg is likely exponent: attack, decay, sustain, release, exponent
              attackExpr = posArgs[0].value
              decayExpr = posArgs[1].value
              sustainExpr = posArgs[2].value
              releaseExpr = posArgs[3].value
              exponentExpr = posArgs[4].value
              trigExpr = undefined // default
            }
          } else if (posArgs.length >= 4) {
            // 4+ args: attack, decay, sustain, release
            attackExpr = posArgs[0].value
            decayExpr = posArgs[1].value
            sustainExpr = posArgs[2].value
            releaseExpr = posArgs[3].value
            exponentExpr = undefined
            trigExpr = undefined
          }
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          adsrIndex: getAdsrIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          attackArgLoc: namedAttack?.loc ?? getPosArg(expr, 0)?.loc ?? null,
          decayArgLoc: namedDecay?.loc ?? getPosArg(expr, 1)?.loc ?? null,
          sustainArgLoc: namedSustain?.loc ?? getPosArg(expr, 2)?.loc ?? null,
          releaseArgLoc: namedRelease?.loc ?? getPosArg(expr, 3)?.loc ?? null,
          exponentArgLoc: namedExponent?.loc ?? null,
          trigArgLoc: namedTrig?.loc ?? null,
          params: {
            attack: getNumberOrDefault(attackExpr, 0.01),
            decay: getNumberOrDefault(decayExpr, 0.1),
            sustain: getNumberOrDefault(sustainExpr, 0.7),
            release: getNumberOrDefault(releaseExpr, 0.2),
            exponent: getNumberOrDefault(exponentExpr, 1),
          },
        })
      }
    }
  }
}
