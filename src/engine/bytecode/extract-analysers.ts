import { buildLineStartsForLocs, computeAboveLoc, getIndexFromCall, getPosArgValue } from './extract-call-utils.ts'
import type { AnalyserRef } from './types.ts'

export function createAnalyserVisitor(src: string, refs: AnalyserRef[]) {
  const lineStarts = buildLineStartsForLocs(src)
  // Track locations that already have analyser widgets
  const handledLocations = new Set<string>()
  const isAnalyserName = (name: string | undefined): name is AnalyserRef['kind'] => {
    return name === 'analyser'
      || name === 'amplitude'
      || name === 'waveform'
      || name === 'spectrum'
      || name === 'level'
      || name === 'print'
  }

  return {
    visitCall(expr: any): void {
      if (expr.callee?.kind === 'ident' && (expr.callee?.name === 'out' || expr.callee?.name === 'solo')) {
        const audioArg = getPosArgValue(expr, 0)
        if (
          audioArg?.kind === 'call'
          && audioArg.callee?.kind === 'ident'
          && isAnalyserName(audioArg.callee?.name)
        ) {
          const analyserIndex = getIndexFromCall(audioArg)
          const calleeLoc = (audioArg.callee.loc ?? audioArg.loc) as any
          const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)
          const locKey = `${calleeLoc?.line}_${calleeLoc?.column}`

          if (!handledLocations.has(locKey)) {
            handledLocations.add(locKey)
            refs.push({
              kind: audioArg.callee.name,
              analyserIndex,
              loc: calleeLoc,
              aboveLoc,
              callLoc: audioArg.loc,
            })
          }
        }
      }

      if (expr.callee?.kind === 'ident' && isAnalyserName(expr.callee?.name)) {
        const analyserIndex = getIndexFromCall(expr)
        const calleeLoc = (expr.callee.loc ?? expr.loc) as any
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)
        const locKey = `${calleeLoc?.line}_${calleeLoc?.column}`

        if (!handledLocations.has(locKey)) {
          handledLocations.add(locKey)
          refs.push({
            kind: expr.callee.name,
            analyserIndex,
            loc: calleeLoc,
            aboveLoc,
            callLoc: expr.loc,
          })
        }
      }
    },
  }
}
