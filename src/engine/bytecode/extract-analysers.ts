import type { Program } from '../../lang/ast.ts'
import type { AnalyserRef } from './types.ts'

const MAX_ANALYSER_INDEX = 63

function getPosArgValue(call: any, posIndex: number): any | null {
  let pos = 0
  for (const arg of call.args ?? []) {
    if (arg?.kind !== 'pos') continue
    if (pos === posIndex) return arg.value ?? null
    pos++
  }
  return null
}

function clampAnalyserIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_ANALYSER_INDEX) return MAX_ANALYSER_INDEX
  return v
}

function getAnalyserIndexFromCall(callExpr: any): number {
  const idxArg = getPosArgValue(callExpr, 1)
  if (idxArg?.kind === 'number') return clampAnalyserIndex(idxArg.value)
  return 0
}

export function createAnalyserVisitor(refs: AnalyserRef[]) {
  // Track locations that already have analyser widgets
  const handledLocations = new Set<string>()

  return {
    visitCall(expr: any): void {
      if (expr.callee?.kind === 'ident' && (expr.callee?.name === 'out' || expr.callee?.name === 'solo')) {
        const audioArg = getPosArgValue(expr, 0)
        if (audioArg?.kind === 'call' && audioArg.callee?.kind === 'ident' && audioArg.callee?.name === 'analyser') {
          const analyserIndex = getAnalyserIndexFromCall(audioArg)
          const loc = audioArg.callee.loc ?? audioArg.loc
          const locKey = `${loc?.line}_${loc?.column}`

          if (!handledLocations.has(locKey)) {
            handledLocations.add(locKey)
            refs.push({
              analyserIndex,
              loc,
            })
          }
        }
      }

      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'analyser') {
        const analyserIndex = getAnalyserIndexFromCall(expr)
        const loc = expr.callee.loc ?? expr.loc
        const locKey = `${loc?.line}_${loc?.column}`

        if (!handledLocations.has(locKey)) {
          handledLocations.add(locKey)
          refs.push({
            analyserIndex,
            loc,
          })
        }
      }
    }
  }
}

