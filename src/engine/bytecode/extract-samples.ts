import type { Loc, Program } from '../../lang/ast.ts'
import { type LangError } from '../../lang/errors.ts'
import { locError, tryEvalConstNumber } from './helpers.ts'
import { type SampleDef } from './types.ts'

export function createSamplesVisitor(src: string, samples: SampleDef[], errors: LangError[]) {
  const keyToIndex = new Map<string, number>()

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

  function ensureSample(id: number, loc: Loc): number {
    const key = `freesound:${id}`
    const prev = keyToIndex.get(key)
    if (prev !== undefined) return prev
    const sampleIndex = samples.length
    samples.push({
      sampleIndex,
      provider: 'freesound',
      id,
      url: `https://freesound.cowbell.workers.dev/get?id=${id}`,
      loc,
    })
    keyToIndex.set(key, sampleIndex)
    return sampleIndex
  }

  return {
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
    }
  }
}

