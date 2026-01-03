import type { Loc } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { EnvfollowRef } from './types.ts'

const MAX_ENVFOLLOW_INDEX = 255

function clampEnvfollowIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_ENVFOLLOW_INDEX) return MAX_ENVFOLLOW_INDEX
  return v
}

function getEnvfollowIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampEnvfollowIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

export function createEnvfollowVisitor(src: string, refs: EnvfollowRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      if (calleeName === 'envfollow') {
        const namedInput = findNamedArg(expr, 'input')
        const namedAttack = findNamedArg(expr, 'attack')
        const namedRelease = findNamedArg(expr, 'release')

        // Smart positional parsing: determine parameter roles based on count and types
        let inputExpr, attackExpr, releaseExpr

        if (namedInput || namedAttack || namedRelease) {
          // Named parameters present - use standard positional fallback
          inputExpr = namedInput?.value ?? getPosArg(expr, 0)?.value
          attackExpr = namedAttack?.value ?? getPosArg(expr, 1)?.value
          releaseExpr = namedRelease?.value ?? getPosArg(expr, 2)?.value
        } else {
          // Pure positional - infer based on argument count
          const posArgs = []
          for (let i = 0; i < 3; i++) {
            const arg = getPosArg(expr, i)
            if (arg) posArgs.push(arg)
            else break
          }

          if (posArgs.length >= 3) {
            // 3+ args: input, attack, release
            inputExpr = posArgs[0].value
            attackExpr = posArgs[1].value
            releaseExpr = posArgs[2].value
          } else if (posArgs.length >= 2) {
            // 2 args: input, attack (release defaults)
            inputExpr = posArgs[0].value
            attackExpr = posArgs[1].value
            releaseExpr = undefined
          } else if (posArgs.length >= 1) {
            // 1 arg: input (attack/release default)
            inputExpr = posArgs[0].value
            attackExpr = undefined
            releaseExpr = undefined
          }
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          envfollowIndex: getEnvfollowIndexFromCall(expr),
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
    }
  }
}
