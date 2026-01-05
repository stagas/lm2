import type { Loc } from '../../lang/ast.ts'
import { buildLineStarts, locToIndex, tryEvalConstNumber } from './helpers.ts'

export function getPosArgs(call: any): any[] {
  return (call.args ?? []).filter((a: any) => a?.kind === 'pos')
}

export function findNamedArg(call: any, name: string): any | null {
  for (const a of call.args ?? []) {
    if (a?.kind === 'named' && a.name === name) return a
  }
  return null
}

export function getPosArg(call: any, posIndex: number): any | null {
  const posArgs = getPosArgs(call)
  return posArgs[posIndex] ?? null
}

export function getPosArgValue(call: any, posIndex: number): any | null {
  return getPosArg(call, posIndex)?.value ?? null
}

export function getNumberOrDefault(expr: any, fallback: number): number {
  const v = tryEvalConstNumber(expr)
  return v == null || !Number.isFinite(v) ? fallback : v
}

function shorthandToIdentExpr(arg: any): any {
  return { kind: 'ident', name: String(arg?.name ?? ''), loc: arg?.loc }
}

export function slotCallArgsBySig(call: any, sigNames: string[]): {
  slots: Array<any | undefined>
  argLocs: Array<Loc | null>
} {
  const idxOf = new Map<string, number>()
  for (let i = 0; i < sigNames.length; i++) idxOf.set(sigNames[i]!, i)

  const reserved: boolean[] = []
  const slots: Array<any | undefined> = []
  const argLocs: Array<Loc | null> = []

  for (const a of call.args ?? []) {
    if (a?.kind === 'named' || a?.kind === 'shorthand') {
      const idx = idxOf.get(a.name)
      if (idx !== undefined) reserved[idx] = true
      continue
    }
    if (a?.kind === 'pos' && a.value?.kind === 'ident') {
      const idx = idxOf.get(a.value.name)
      if (idx !== undefined) reserved[idx] = true
    }
  }

  for (const a of call.args ?? []) {
    if (a?.kind === 'named') {
      const idx = idxOf.get(a.name)
      if (idx !== undefined) {
        slots[idx] = a.value
        argLocs[idx] = a.loc ?? null
      }
      continue
    }
    if (a?.kind === 'shorthand') {
      const idx = idxOf.get(a.name)
      if (idx !== undefined) {
        slots[idx] = shorthandToIdentExpr(a)
        argLocs[idx] = a.loc ?? null
      }
      continue
    }
    if (a?.kind === 'pos' && a.value?.kind === 'ident') {
      const idx = idxOf.get(a.value.name)
      if (idx !== undefined) {
        slots[idx] = a.value
        argLocs[idx] = a.loc ?? null
      }
    }
  }

  let next = 0
  for (const a of call.args ?? []) {
    if (a?.kind !== 'pos') continue
    if (a.value?.kind === 'ident' && idxOf.has(a.value.name)) continue
    while (reserved[next] === true || slots[next] !== undefined) next++
    if (next >= sigNames.length) break
    slots[next] = a.value
    argLocs[next] = a.loc ?? null
    next++
  }

  return { slots, argLocs }
}

function indexFromLoc(src: string, lineStarts: number[], loc: Loc): number {
  const line = Math.max(1, loc.line | 0)
  const col = Math.max(1, loc.column | 0)
  const idx = locToIndex(lineStarts, { line, column: col })
  return Math.max(0, Math.min(src.length, idx))
}

function findMatchingParen(src: string, openIdx: number): number {
  let depth = 0
  for (let i = openIdx; i < src.length; i++) {
    const c = src[i]!
    const n = src[i + 1]!

    if (c === '/' && n === '/') {
      i += 2
      while (i < src.length && src[i] !== '\n') i++
      i--
      continue
    }
    if (c === '/' && n === '*') {
      i += 2
      while (i + 1 < src.length && !(src[i] === '*' && src[i + 1] === '/')) i++
      i++
      continue
    }

    if (c === '\'' || c === '"') {
      const q = c
      i++
      while (i < src.length) {
        const ch = src[i]!
        if (ch === '\\') {
          i += 2
          continue
        }
        if (ch === q) break
        i++
      }
      continue
    }

    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

export function computeAboveLoc(src: string, lineStarts: number[], calleeLoc: Loc): Loc {
  const startIdx = indexFromLoc(src, lineStarts, calleeLoc)
  const openIdx = src.indexOf('(', startIdx)
  if (openIdx < 0) return { ...calleeLoc }
  const closeIdx = findMatchingParen(src, openIdx)
  if (closeIdx < 0) return { ...calleeLoc }

  let col = calleeLoc.column | 0
  let maxRight = Math.max(1, col)

  for (let i = startIdx; i <= closeIdx && i < src.length; i++) {
    const ch = src[i]!
    if (ch === '\n') {
      col = 1
      continue
    }
    maxRight = Math.max(maxRight, col)
    col++
  }

  const length = Math.max(1, (maxRight - (calleeLoc.column | 0)) + 1)
  return { line: calleeLoc.line, column: calleeLoc.column, length }
}

export function buildLineStartsForLocs(src: string): number[] {
  return buildLineStarts(src)
}

export function getIndexFromCall(call: any): number {
  const namedIdx = findNamedArg(call, '%index')
  if (namedIdx?.value) return tryEvalConstNumber(namedIdx.value) ?? 0

  // For analyser(), the index is the second positional argument
  const posArgs = getPosArgs(call)
  if (posArgs.length >= 2) {
    const idx = tryEvalConstNumber(posArgs[1]?.value)
    if (idx != null) return idx
  }

  return 0
}

export function resolveParamName(raw: string, validNames: string[]): string | null {
  // Exact match
  const exact = validNames.find(p => p === raw)
  if (exact) return exact

  // Case-insensitive match
  const lower = raw.toLowerCase()
  const ci = validNames.find(p => p.toLowerCase() === lower)
  if (ci) return ci

  // Prefix match (if unambiguous)
  const prefix = validNames.filter(p => p.startsWith(raw))
  if (prefix.length === 1) return prefix[0]!

  return null
}
