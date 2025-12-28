import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStartsForLocs, computeAboveLoc, findNamedArg, getNumberOrDefault,
  getPosArg } from './extract-call-utils.ts'
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

function isKnobParamName(name: string): name is 'cutoff' | 'q' | 'gain' {
  return name === 'cutoff' || name === 'q' || name === 'gain'
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
    default:
      return null
  }
}

function getDefaultParams(filterType: FilterType): { cutoff: number; q: number; gain?: number } {
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

function getPosArgsForFilter(filterType: FilterType): ('cutoff' | 'q' | 'gain')[] {
  switch (filterType) {
    case 'lp':
    case 'hp':
    case 'bp':
    case 'bs':
    case 'ap':
      return ['cutoff', 'q']
    case 'ls':
    case 'hs':
      return ['cutoff', 'gain']
    case 'peak':
      return ['cutoff', 'q', 'gain']
    default:
      return []
  }
}

function posIndexToKnobName(filterType: FilterType, posIndex: number): 'cutoff' | 'q' | 'gain' | null {
  const posArgs = getPosArgsForFilter(filterType)
  return posArgs[posIndex - 1] || null
}

function visit(src: string, program: Program): FilterRef[] {
  const refs: FilterRef[] = []
  const lineStarts = buildLineStartsForLocs(src)

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      const filterType = getFilterType(calleeName)
      if (filterType) {
        const pos0 = getPosArg(expr, 0)
        const namedIn = findNamedArg(expr, 'in')
        const namedCutoff = findNamedArg(expr, 'cutoff')
        const namedQ = findNamedArg(expr, 'q')
        const namedGain = findNamedArg(expr, 'gain')

        const cutExpr = namedCutoff?.value ?? getPosArg(expr, 1)?.value
        const qExpr = namedQ?.value ?? getPosArg(expr, 2)?.value
        const gainExpr = namedGain?.value ?? getPosArg(expr, 3)?.value

        const knobParams: FilterRef['knobParams'] = []
        const seen = new Set<string>()
        let posIndex = 0
        for (const a of expr.args ?? []) {
          if (!a) continue
          if (a.kind === 'pos') {
            const name = posIndexToKnobName(filterType, posIndex)
            posIndex++
            if (!name) continue
            if (seen.has(name)) continue
            const v = tryEvalConstNumber(a.value)
            if (v == null || !Number.isFinite(v)) continue
            if (!a.value?.loc) continue

            // For lp calls, don't create standard knob params if the argument contains number literals
            // The literals will get their own knobs
            if (filterType === 'lp') {
              let hasLiterals = false
              function checkForLiterals(expr: any): void {
                if (!expr) return
                if (expr.kind === 'number') {
                  hasLiterals = true
                  return
                }
                if (expr.kind === 'binary') {
                  checkForLiterals(expr.left)
                  checkForLiterals(expr.right)
                }
                else if (expr.kind === 'unary' || expr.kind === 'postfix') {
                  checkForLiterals(expr.expr)
                }
                else if (expr.kind === 'member') {
                  checkForLiterals(expr.object)
                  if (expr.computed) checkForLiterals(expr.index)
                }
                else if (expr.kind === 'array') {
                  for (const it of expr.items ?? []) checkForLiterals(it)
                }
                else if (expr.kind === 'object') {
                  for (const p of expr.props ?? []) checkForLiterals(p.value)
                }
              }
              checkForLiterals(a.value)
              if (hasLiterals) continue
            }

            seen.add(name)
            knobParams.push({ name, value: v, valueLoc: a.value.loc })
            continue
          }
          if (a.kind === 'named') {
            if (!isKnobParamName(a.name)) continue
            if (seen.has(a.name)) continue
            const v = tryEvalConstNumber(a.value)
            if (v == null || !Number.isFinite(v)) continue
            if (!a.value?.loc) continue
            seen.add(a.name)
            knobParams.push({ name: a.name, value: v, valueLoc: a.value.loc })
          }
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)
        const defaultParams = getDefaultParams(filterType)

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
          knobParams,
          params: {
            cut: getNumberOrDefault(cutExpr, defaultParams.cutoff),
            q: getNumberOrDefault(qExpr, defaultParams.q),
            ...(defaultParams.gain !== undefined ? { gain: getNumberOrDefault(gainExpr, defaultParams.gain) } : {}),
          },
        })
      }

      visitExpr(expr.callee)
      for (const a of expr.args ?? []) {
        if (a?.kind === 'pos' || a?.kind === 'named') visitExpr(a.value)
      }
      return
    }

    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      visitExpr(expr.target)
      visitExpr(expr.value)
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      visitExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      visitExpr(expr.object)
      if (expr.computed) visitExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const it of expr.items ?? []) visitExpr(it)
      return
    }

    if (expr.kind === 'object') {
      for (const p of expr.props ?? []) visitExpr(p.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then?.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      return
    }
  }

  function visitStmt(stmt: any): void {
    if (!stmt) return
    if (stmt.kind === 'expr_stmt') {
      visitExpr(stmt.expr)
      return
    }
    if (stmt.kind === 'block') {
      for (const s of stmt.body ?? []) visitStmt(s)
      return
    }
    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head?.iterable)
      }
      visitStmt(stmt.body)
      return
    }
    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      visitExpr(stmt.test)
      visitStmt(stmt.body)
      return
    }
    if (stmt.kind === 'switch') {
      visitExpr(stmt.test)
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body ?? []) visitStmt(s)
      }
      return
    }
    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }
    if (stmt.kind === 'throw') {
      visitExpr(stmt.value)
      return
    }
    if (stmt.kind === 'return') {
      if (stmt.value) visitExpr(stmt.value)
      return
    }
    if (stmt.kind === 'label') {
      visitStmt(stmt.stmt)
      return
    }
    if (stmt.kind === 'destructure') {
      visitExpr(stmt.value)
      return
    }
  }

  for (const s of program.body) visitStmt(s as any)
  return refs
}

function collectLpNumberLiterals(src: string, program: Program): NumberWithParamsInfo[] {
  const refs: NumberWithParamsInfo[] = []
  const lineStarts = buildLineStartsForLocs(src)

  function visitExpr(expr: any): void {
    if (!expr) return

    if (expr.kind === 'call') {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      const filterType = getFilterType(calleeName)
      if (filterType) {
        // Collect number literals from the 2nd parameter (cutoff) of filter calls
        const secondArg = expr.args?.[1]
        if (secondArg && (secondArg.kind === 'pos' || secondArg.kind === 'named')) {
          collectNumbersFromExpr(secondArg.value)
        }
      }

      visitExpr(expr.callee)
      for (const a of expr.args ?? []) {
        if (a?.kind === 'pos' || a?.kind === 'named') visitExpr(a.value)
      }
      return
    }

    // ... other expression types remain the same
    if (expr.kind === 'binary') {
      visitExpr(expr.left)
      visitExpr(expr.right)
      return
    }

    if (expr.kind === 'assign') {
      visitExpr(expr.target)
      visitExpr(expr.value)
      return
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      visitExpr(expr.expr)
      return
    }

    if (expr.kind === 'member') {
      visitExpr(expr.object)
      if (expr.computed) visitExpr(expr.index)
      return
    }

    if (expr.kind === 'array') {
      for (const it of expr.items ?? []) visitExpr(it)
      return
    }

    if (expr.kind === 'object') {
      for (const p of expr.props ?? []) visitExpr(p.value)
      return
    }

    if (expr.kind === 'if') {
      visitExpr(expr.test)
      if (expr.then?.kind === 'block') visitStmt(expr.then)
      else visitExpr(expr.then)
      if (expr.else) {
        if (expr.else.kind === 'block') visitStmt(expr.else)
        else visitExpr(expr.else)
      }
      return
    }

    if (expr.kind === 'func') {
      if (expr.body?.kind === 'block') visitStmt(expr.body)
      else visitExpr(expr.body)
      return
    }
  }

  function collectNumbersFromExpr(expr: any): void {
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
      collectNumbersFromExpr(expr.right)
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

  function visitStmt(stmt: any): void {
    if (!stmt) return
    if (stmt.kind === 'expr_stmt') {
      visitExpr(stmt.expr)
      return
    }
    if (stmt.kind === 'block') {
      for (const s of stmt.body ?? []) visitStmt(s)
      return
    }
    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        if (stmt.head.init) visitExpr(stmt.head.init)
        if (stmt.head.test) visitExpr(stmt.head.test)
        if (stmt.head.update) visitExpr(stmt.head.update)
      }
      else {
        visitExpr(stmt.head?.iterable)
      }
      visitStmt(stmt.body)
      return
    }
    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      visitExpr(stmt.test)
      visitStmt(stmt.body)
      return
    }
    if (stmt.kind === 'switch') {
      visitExpr(stmt.test)
      for (const c of stmt.cases ?? []) {
        if (c.test) visitExpr(c.test)
        for (const s of c.body ?? []) visitStmt(s)
      }
      return
    }
    if (stmt.kind === 'try') {
      visitStmt(stmt.body)
      if (stmt.catchBody) visitStmt(stmt.catchBody)
      if (stmt.finallyBody) visitStmt(stmt.finallyBody)
      return
    }
    if (stmt.kind === 'throw') {
      visitExpr(stmt.value)
      return
    }
    if (stmt.kind === 'return') {
      if (stmt.value) visitExpr(stmt.value)
      return
    }
    if (stmt.kind === 'label') {
      visitStmt(stmt.stmt)
      return
    }
    if (stmt.kind === 'destructure') {
      visitExpr(stmt.value)
      return
    }
  }

  for (const s of program.body) visitStmt(s as any)
  return refs
}

export function extractFiltersFromProgramWithRefs(src: string, program: Program): FilterRef[] {
  return visit(src, program)
}

export function extractLpNumberLiterals(src: string, program: Program): NumberWithParamsInfo[] {
  return collectLpNumberLiterals(src, program)
}
