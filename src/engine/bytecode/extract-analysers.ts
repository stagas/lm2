import { getIndexFromCall, getPosArgValue } from './extract-call-utils.ts'
import type { AnalyserRef } from './types.ts'

export function createAnalyserVisitor(refs: AnalyserRef[]) {
  // Track locations that already have analyser widgets
  const handledLocations = new Set<string>()

  return {
    visitCall(expr: any): void {
      if (expr.callee?.kind === 'ident' && (expr.callee?.name === 'out' || expr.callee?.name === 'solo')) {
        const audioArg = getPosArgValue(expr, 0)
        if (audioArg?.kind === 'call' && audioArg.callee?.kind === 'ident' && audioArg.callee?.name === 'analyser') {
          const analyserIndex = getIndexFromCall(audioArg)
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
        const analyserIndex = getIndexFromCall(expr)
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
    },
  }
}
