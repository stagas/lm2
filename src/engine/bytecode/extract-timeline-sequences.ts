import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStarts } from '../ui/editor-spans.ts'
import { locToIndex } from './helpers.ts'
import {
  type TimelineSequenceDef,
  type TimelineSequenceRef,
} from './types.ts'

export function createTimelineSequencesVisitor(src: string, sequences: TimelineSequenceDef[], refs: TimelineSequenceRef[]) {
  const keyToIndex = new Map<string, number>()
  const lineStarts = buildLineStarts(src)

  function ensureIndex(sequence: string): number {
    const prev = keyToIndex.get(sequence)
    if (prev !== undefined) return prev
    const idx = sequences.length
    sequences.push({ sequence })
    keyToIndex.set(sequence, idx)
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
      if (expr.callee?.kind === 'ident' && expr.callee?.name === 'timeline') {
        const args = expr.args ?? []
        const posArgs = args.filter((a: any) => a.kind === 'pos')

        const namedSeqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
        const namedColorArg = args.find((a: any) => a.kind === 'named' && a.name === 'color')

        let seqArg: any | null = namedSeqArg ?? null
        let seqPosIndex = -1

        if (!seqArg) {
          for (let i = 0; i < posArgs.length; i++) {
            const v = posArgs[i]?.value
            if (v?.kind === 'string') {
              seqPosIndex = i
              break
            }
          }
          if (seqPosIndex === -1) seqPosIndex = posArgs.length >= 2 ? 1 : 0
          seqArg = posArgs[seqPosIndex] ?? null
        }

        const seqExpr = seqArg?.kind === 'pos' || seqArg?.kind === 'named' ? seqArg.value : null
        if (seqExpr?.kind === 'string') {
          const sequence = String(seqExpr.value ?? '')

          let colorExpr: any | null = namedColorArg?.value ?? null
          if (!colorExpr) {
            if (seqPosIndex >= 0) {
              colorExpr = posArgs[seqPosIndex + 1]?.value ?? null
            }
            else {
              for (let i = 0; i < posArgs.length; i++) {
                const v = posArgs[i]?.value
                if (v?.kind === 'string') {
                  colorExpr = v
                  break
                }
              }
            }
          }
          const color = colorExpr?.kind === 'string' ? (String(colorExpr.value ?? '') || undefined) : undefined

          addRef(sequence, seqExpr.loc, color)
        }
      }
    }
  }
}

