import type { Expr, Loc, Program } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import { tryEvalConstNumber } from './helpers.ts'
import type { FilterRef, FilterType, NumberWithParamsInfo } from './types.ts'

const MAX_FILTER_INDEX = 63

function clampFilterIndex(n: any): number {
  const v = Math.floor(Number(n ?? 0))
  if (!Number.isFinite(v)) return 0
  if (v < 0) return 0
  if (v > MAX_FILTER_INDEX) return MAX_FILTER_INDEX
  return v
}

function getFilterIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, 'index')
  if (namedIdx?.value) return clampFilterIndex(tryEvalConstNumber(namedIdx.value))
  return 0
}

function getFilterType(calleeName: string): FilterType | null {
  switch (calleeName) {
    case 'lp':
      return 'lp'
    case 'hp':
      return 'hp'
    case 'bp':
      return 'bp'
    case 'bs':
      return 'bs'
    case 'ls':
      return 'ls'
    case 'hs':
      return 'hs'
    case 'peak':
      return 'peak'
    case 'ap':
      return 'ap'
    case 'slp':
      return 'slp'
    case 'shp':
      return 'shp'
    case 'sbp':
      return 'sbp'
    case 'sbs':
      return 'sbs'
    case 'speak':
      return 'speak'
    case 'sap':
      return 'sap'
    case 'mlp':
      return 'mlp'
    case 'mhp':
      return 'mhp'
    case 'diodeladder':
      return 'diodeladder'
    case 'olp':
      return 'olp'
    case 'ohp':
      return 'ohp'
    default:
      return null
  }
}

function getDefaultParams(filterType: FilterType): { cutoff: number; q: number; gain?: number; k?: number } {
  // Diode ladder has different parameters
  if (filterType === 'diodeladder') {
    return { cutoff: 1000, q: 0.5, k: 0.0 }
  }

  // SVF/Moog filters use different default Q
  if (filterType.startsWith('s') || filterType.startsWith('m')) {
    const baseParams = { cutoff: 1000, q: 0.333 }
    return baseParams
  }

  const baseParams = { cutoff: 1000, q: 0.707 }
  switch (filterType) {
    case 'ls':
    case 'hs':
    case 'peak':
      return { ...baseParams, gain: 0 }
    default:
      return baseParams
  }
}



export function createFiltersVisitor(src: string, refs: FilterRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: Expr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      const filterType = getFilterType(calleeName ?? '')
      if (filterType) {
        const pos0 = getPosArg(expr, 0)
        const namedIn = findNamedArg(expr, 'in')
        const namedCutoff = findNamedArg(expr, 'cutoff')
        const namedQ = findNamedArg(expr, 'q')
        const namedGain = findNamedArg(expr, 'gain')

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)
        const defaultParams = getDefaultParams(filterType)

        // Handle diodeladder with different parameters
        if (filterType === 'diodeladder') {
          const namedQ = findNamedArg(expr, 'q')
          const namedK = findNamedArg(expr, 'k')
          const namedSaturation = findNamedArg(expr, 'saturation')

          const qExpr = namedQ?.value ?? getPosArg(expr, 2)?.value
          const kExpr = namedK?.value ?? getPosArg(expr, 3)?.value
          const satExpr = namedSaturation?.value ?? getPosArg(expr, 4)?.value

          refs.push({
            filterType,
            filterIndex: getFilterIndexFromCall(expr),
            loc: calleeLoc,
            aboveLoc,
            callLoc: expr.loc,
            inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
            cutArgLoc: (namedCutoff?.loc ?? getPosArg(expr, 1)?.loc ?? null),
            qArgLoc: (namedQ?.loc ?? getPosArg(expr, 2)?.loc ?? null),
            gainArgLoc: (namedK?.loc ?? getPosArg(expr, 3)?.loc ?? null),
            params: {
              cut: getNumberOrDefault(namedCutoff?.value ?? getPosArg(expr, 1)?.value, defaultParams.cutoff),
              q: getNumberOrDefault(qExpr, (defaultParams as any).q ?? 0.5),
              gain: getNumberOrDefault(kExpr, (defaultParams as any).k ?? 0.0),
              // Store saturation in an extended params object if needed
            },
          } as any)
        } else if (filterType === 'olp' || filterType === 'ohp') {
          // Handle one pole filters with only cutoff parameter
          refs.push({
            filterType,
            filterIndex: getFilterIndexFromCall(expr),
            loc: calleeLoc,
            aboveLoc,
            callLoc: expr.loc,
            inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
            cutArgLoc: (namedCutoff?.loc ?? getPosArg(expr, 1)?.loc ?? null),
            params: {
              cut: getNumberOrDefault(namedCutoff?.value ?? getPosArg(expr, 1)?.value, defaultParams.cutoff),
              q: 0, // Not used for one pole filters
            },
          } as any)
        } else {
          // Standard filter handling
          const cutExpr = namedCutoff?.value ?? getPosArg(expr, 1)?.value
          const qExpr = namedQ?.value ?? getPosArg(expr, 2)?.value
          const gainExpr = namedGain?.value ?? getPosArg(expr, 3)?.value

        refs.push({
          filterType,
          filterIndex: getFilterIndexFromCall(expr),
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          inArgLoc: (namedIn?.loc ?? pos0?.loc ?? null),
          cutArgLoc: (namedCutoff?.loc ?? getPosArg(expr, 1)?.loc ?? null),
          qArgLoc: (namedQ?.loc ?? getPosArg(expr, 2)?.loc ?? null),
          gainArgLoc: (namedGain?.loc ?? getPosArg(expr, 3)?.loc ?? null),
          params: {
            cut: getNumberOrDefault(cutExpr, defaultParams.cutoff),
            q: getNumberOrDefault(qExpr, defaultParams.q),
            ...(defaultParams.gain !== undefined ? { gain: getNumberOrDefault(gainExpr, defaultParams.gain) } : {}),
          },
        })
        }
      }
    }
  }
}

export function createFilterNumberLiteralsVisitor(refs: NumberWithParamsInfo[]) {
  function collectNumbersFromExpr(expr: Expr): void {
    if (!expr) return

    if (expr.kind === 'number') {
      refs.push({
        line: expr.loc.line,
        column: expr.loc.column,
        length: expr.loc.length,
        widgetLength: expr.loc.length,
        value: Number(expr.value ?? 0),
        min: 20,
        max: 20000,
        precision: 0,
      })
      return
    }

    // Recurse into expressions to collect all number literals
    if (expr.kind === 'binary') {
      collectNumbersFromExpr(expr.left)
      if (expr.op !== '**') {
        collectNumbersFromExpr(expr.right)
      }
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      collectNumbersFromExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      collectNumbersFromExpr(expr.object)
      if (expr.computed) collectNumbersFromExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const it of expr.items ?? []) collectNumbersFromExpr(it)
      return
    }

    if (expr.kind === 'object') {
      for (const p of expr.props ?? []) collectNumbersFromExpr(p.value)
      return
    }

    // Don't collect from calls, functions, etc. - only literals and their containing expressions
  }

  return {
    visitCall(expr: Expr): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      const filterType = getFilterType(calleeName ?? '')
      if (filterType) {
        // Collect number literals from the 2nd parameter (cutoff) of filter calls
        const secondArg = expr.args?.[1]
        if (secondArg && (secondArg.kind === 'pos' || secondArg.kind === 'named')) {
          collectNumbersFromExpr(secondArg.value)
        }
      }
    }
  }
}

