import type { Loc } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { locError, tryEvalConstNumber } from './helpers.ts'
import { type SampleDef } from './types.ts'

function fnv1a32(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

function stableAstString(v: any): string {
  return JSON.stringify(v, (k, val) => {
    if (
      k === 'loc'
      || k === 'ifLoc'
      || k === 'elseLoc'
      || k === 'questionLoc'
      || k === 'colonLoc'
      || k === 'slider'
      || k === 'kernel'
    ) return undefined
    return val
  }) ?? ''
}

function recordKeyFromAssign(targetName: string, loc?: Loc): string {
  if (loc) {
    return `record:${targetName}:${loc.line}:${loc.column}`
  }
  return `record:${targetName}`
}

function recordKeyFallback(call: any): string {
  const cbKey = getRecordCbKey(call)
  return `record#${(cbKey >>> 0).toString(16)}`
}

export function createSamplesVisitor(
  src: string,
  samples: SampleDef[],
  errors: LangError[],
  sampleKeyToIndex?: Map<string, number>,
) {
  const keyToIndex = sampleKeyToIndex ?? new Map<string, number>()
  const seenThisPass = new Set<string>()
  const handledRecordCalls = new Set<string>()
  let nextIndex = 0
  for (const v of keyToIndex.values()) nextIndex = Math.max(nextIndex, (v | 0) + 1)

  function allocIndex(key: string): number {
    const prev = keyToIndex.get(key)
    if (prev !== undefined) return prev
    const idx = nextIndex++
    keyToIndex.set(key, idx)
    return idx
  }

  function locKey(loc: Loc): string {
    return `${loc.line}:${loc.column}:${loc.length}`
  }

  function getPosArg(call: any, posIndex: number): any | null {
    let pos = 0
    for (const arg of call.args ?? []) {
      if (arg?.kind !== 'pos') continue
      if (pos === posIndex) return arg.value ?? null
      pos++
    }
    return null
  }

  function getNamedArg(call: any, name: string): any | null {
    for (const arg of call.args ?? []) {
      if (arg?.kind !== 'named') continue
      if (arg.name === name) return arg.value ?? null
    }
    return null
  }

  function getArg(call: any, posIndex: number, name: string): any | null {
    return getNamedArg(call, name) ?? getPosArg(call, posIndex)
  }

  function getRecordCbKey(call: any): number {
    const secondsExpr = getNamedArg(call, 'seconds') ?? getPosArg(call, 0)
    const cbExpr = getNamedArg(call, 'cb') ?? getNamedArg(call, 'callback') ?? getPosArg(call, 1)
    return fnv1a32(stableAstString({ seconds: secondsExpr, cb: cbExpr }))
  }

  function ensureSample(id: number, loc: Loc): number {
    const key = `freesound:${id}`
    const sampleIndex = allocIndex(key)
    if (!seenThisPass.has(key)) {
      samples.push({
        sampleIndex,
        provider: 'freesound',
        id,
        url: `https://freesound.cowbell.workers.dev/get?id=${id}`,
        loc,
      })
      seenThisPass.add(key)
    }
    return sampleIndex
  }

  function ensureRecordSample(key: string, callLoc: Loc, cbKey: number): number {
    const sampleIndex = allocIndex(key)
    if (!seenThisPass.has(key)) {
      const url = `record:${sampleIndex}:${(cbKey >>> 0).toString(16)}`
      samples.push({
        sampleIndex,
        provider: 'record',
        key,
        url,
        loc: callLoc,
      })
      seenThisPass.add(key)
    }
    return sampleIndex
  }

  return {
    visitExpr(expr: any): void {
      if (
        expr?.kind === 'assign'
        && expr.op === '='
        && expr.target?.kind === 'ident'
        && expr.value?.kind === 'call'
        && expr.value.callee?.kind === 'ident'
        && expr.value.callee.name === 'record'
      ) {
        const call = expr.value
        const key = recordKeyFromAssign(expr.target.name, expr.loc)
        const cbKey = getRecordCbKey(call)
        ensureRecordSample(key, call.loc ?? expr.loc, cbKey)
        handledRecordCalls.add(locKey(call.loc ?? expr.loc))
      }
    },
    visitCall(expr: any): void {
      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'freesound') {
        const idExpr = getArg(expr, 0, 'id')
        const id = tryEvalConstNumber(idExpr)
        if (id == null || !Number.isFinite(id) || !Number.isInteger(id) || id < 0) {
          errors.push(locError(src, idExpr?.loc ?? expr.loc, '`freesound(id:...)` requires an integer id literal'))
        }
        else {
          ensureSample(id, expr.loc)
        }
      }
      else if (expr.callee?.kind === 'ident' && expr.callee?.name === 'record') {
        const lk = locKey(expr.loc)
        if (handledRecordCalls.has(lk)) return
        const key = recordKeyFallback(expr)
        const cbKey = getRecordCbKey(expr)
        ensureRecordSample(key, expr.loc, cbKey)
      }
    },
  }
}
