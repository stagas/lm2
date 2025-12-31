import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStarts, locToIndex } from './helpers.ts'
import { type MiniSequenceRef } from './types.ts'

export function createMiniSequencesVisitor(src: string, sequences: string[], refs: MiniSequenceRef[]) {
  const sequenceToIndex = new Map<string, number>()
  const lineStarts = buildLineStarts(src)

  function ensureIndex(sequence: string): number {
    const prev = sequenceToIndex.get(sequence)
    if (prev !== undefined) return prev
    const idx = sequences.length
    sequences.push(sequence)
    sequenceToIndex.set(sequence, idx)
    return idx
  }

  function addRef(sequence: string, loc: Loc, color?: string): void {
    const seqIndex = ensureIndex(sequence)
    const quoteStart = locToIndex(lineStarts, loc)
    refs.push({
      seqIndex,
      sequence,
      color: color || undefined,
      start: quoteStart + 1,
      end: quoteStart + Math.max(0, loc.length - 1),
      loc,
    })
  }

  return {
    visitCall(expr: any): void {
      if (
        expr.callee?.kind === 'ident'
        && (expr.callee?.name === 'mini' || expr.callee?.name === 'play')
      ) {
        const args = expr.args ?? []
        const seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? args.find((a: any) => a.kind === 'pos')
        const seqExpr = (seqArg?.kind === 'pos' || seqArg?.kind === 'named') ? seqArg.value : null

        if (seqExpr?.kind === 'string') {
          const sequence = String(seqExpr.value ?? '')

          const namedColor = args.find((a: any) => a.kind === 'named' && a.name === 'color')
          let color: string | undefined = undefined
          if (namedColor?.value?.kind === 'string') {
            color = String(namedColor.value.value ?? '') || undefined
          }
          else {
            // Treat the first additional string positional argument as the compile-time color.
            for (const a of args) {
              if (a === seqArg) continue
              if (a?.kind !== 'pos') continue
              const v = a.value
              if (v?.kind === 'string') {
                color = String(v.value ?? '') || undefined
                break
              }
            }
          }

          addRef(sequence, seqExpr.loc, color)
        }
      }
    }
  }
}

