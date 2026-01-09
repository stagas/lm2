import type { Loc } from '../../lang/ast.ts'
import { buildLineStarts, locToIndex, tryEvalConstNumber } from './helpers.ts'
import { type TramSequenceRef } from './types.ts'

export function createTramSequencesVisitor(
  src: string,
  sequences: string[],
  refs: TramSequenceRef[],
) {
  const sequenceToIndex = new Map<string, number>()
  const lineStarts = buildLineStarts(src)
  let lastBar: number | null = null

  function ensureIndex(sequence: string): number {
    const prev = sequenceToIndex.get(sequence)
    if (prev !== undefined) return prev
    const idx = sequences.length
    sequences.push(sequence)
    sequenceToIndex.set(sequence, idx)
    return idx
  }

  function addRef(sequence: string, loc: Loc): void {
    const seqIndex = ensureIndex(sequence)
    const quoteStart = locToIndex(lineStarts, loc)
    refs.push({
      seqIndex,
      sequence,
      bar: lastBar == null || !Number.isFinite(lastBar) || lastBar <= 0 ? undefined : lastBar,
      start: quoteStart + 1,
      end: quoteStart + Math.max(0, loc.length - 1),
      loc,
    })
  }

  function findSeqIndex(args: any[]): number | null {
    // For tram, the first positional argument is the sequence
    const seqArg = args.find((a: any) => a.kind === 'pos')
    const seqExpr = seqArg?.value

    if (seqExpr?.kind === 'string') {
      const sequence = String(seqExpr.value ?? '')
      return ensureIndex(sequence)
    }
    return null
  }

  function findStaticBar(args: any[]): number | null {
    const namedBar = args.find((a: any) => a.kind === 'named' && a.name === 'bar')
    if (namedBar?.kind === 'named') {
      return tryEvalConstNumber(namedBar.value)
    }

    const posArgs = args.filter((a: any) => a.kind === 'pos')
    const posBar = posArgs[1]
    return tryEvalConstNumber(posBar?.value)
  }

  return {
    visitCall(call: any) {
      if (call.callee?.name === 'tram' || call.callee?.kind === 'ident' && call.callee.name === 'tram') {
        const args = call.args ?? []
        lastBar = findStaticBar(args)
        const seqIndex = findSeqIndex(args)
        if (seqIndex !== null) {
          // Find the sequence argument to record the reference
          const seqArg = args.find((a: any) => a.kind === 'pos')
          if (seqArg?.value?.kind === 'string') {
            addRef(String(seqArg.value.value ?? ''), seqArg.value.loc)
          }
        }
      }
    },
  }
}
