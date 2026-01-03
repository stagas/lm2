import type { Loc, Program } from '../../lang/ast.ts'
import { buildLineStarts, locToIndex, tryEvalConstNumber } from './helpers.ts'
import { type MiniSequenceRef } from './types.ts'

export function createMiniSequencesVisitor(
  src: string,
  sequences: string[],
  refs: MiniSequenceRef[],
  playBars: Array<number | undefined>,
) {
  const sequenceToIndex = new Map<string, number>()
  const lineStarts = buildLineStarts(src)
  const identToSeqIndex = new Map<string, number>()

  function ensureIndex(sequence: string): number {
    const prev = sequenceToIndex.get(sequence)
    if (prev !== undefined) return prev
    const idx = sequences.length
    sequences.push(sequence)
    playBars.push(undefined)
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

  function findSeqIndex(args: any[]): number | null {
    const seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
      ?? args.find((a: any) => a.kind === 'pos')
    const seqExpr = (seqArg?.kind === 'pos' || seqArg?.kind === 'named') ? seqArg.value : null

    if (seqExpr?.kind === 'string') {
      const sequence = String(seqExpr.value ?? '')
      return ensureIndex(sequence)
    }
    if (seqExpr?.kind === 'ident') {
      return identToSeqIndex.get(String(seqExpr.name ?? '')) ?? null
    }
    return null
  }

  function findStaticBar(args: any[]): number | null {
    const namedBar = args.find((a: any) => a.kind === 'named' && a.name === 'bar')
    if (namedBar?.kind === 'named') {
      return tryEvalConstNumber(namedBar.value)
    }

    const posArgs = args.filter((a: any) => a.kind === 'pos')
    const posBar = posArgs[3]
    return tryEvalConstNumber(posBar?.value)
  }

  return {
    visitExpr(expr: any): void {
      if (expr?.kind !== 'assign') return
      if (expr.target?.kind !== 'ident') return
      const target = String(expr.target.name ?? '')
      if (!target) return
      const value = expr.value
      if (value?.kind !== 'call') return
      if (value.callee?.kind !== 'ident') return
      if (value.callee.name !== 'mini') return
      const args = value.args ?? []
      const seqIndex = findSeqIndex(args)
      if (seqIndex == null) return
      // Only treat this as a sequence reference assignment when the call doesn't include a callback.
      // `mini(seq, cb)` is an alias of `play(seq, cb)` and does not produce a reusable seq ref.
      if (args.some((a: any) => (a?.kind === 'pos' || a?.kind === 'named') && a.value?.kind === 'func')) return
      if (args.some((a: any) => a?.kind === 'named' && a.name === 'cb')) return
      identToSeqIndex.set(target, seqIndex)
    },
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

        if (expr.callee?.name === 'play') {
          const seqIndex = findSeqIndex(args)
          if (seqIndex == null) return
          const bar = findStaticBar(args)
          if (bar == null || !Number.isFinite(bar)) return
          if (bar <= 0) return
          playBars[seqIndex] = bar
        }
      }
    }
  }
}

