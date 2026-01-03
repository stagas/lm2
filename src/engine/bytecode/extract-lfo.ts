import type { Loc } from '../../lang/ast.ts'
import {
  buildLineStartsForLocs,
  computeAboveLoc,
  findNamedArg,
  getIndexFromCall,
  getNumberOrDefault,
  getPosArg,
} from './extract-call-utils.ts'
import type { LfoRef } from './types.ts'

function lfoTypeFromCallee(calleeName: string): LfoRef['lfoType'] | null {
  if (calleeName === 'lfosine') return 'sine'
  if (calleeName === 'lfotri') return 'tri'
  if (calleeName === 'lfosaw') return 'saw'
  if (calleeName === 'lforamp') return 'ramp'
  if (calleeName === 'lfosqr') return 'sqr'
  if (calleeName === 'lfosah') return 'sah'
  if (calleeName === 'smooth') return 'smooth'
  if (calleeName === 'fractal') return 'fractal'
  return null
}

export function createLfoVisitor(src: string, refs: LfoRef[]) {
  const lineStarts = buildLineStartsForLocs(src)

  return {
    visitCall(expr: any): void {
      const calleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
      const lfoType = calleeName ? lfoTypeFromCallee(calleeName) : null
      if (lfoType) {
        const isSah = lfoType === 'sah'
        const isSmooth = lfoType === 'smooth'
        const isFractal = lfoType === 'fractal'

        const namedBar = findNamedArg(expr, 'bar')
        const namedOffset = findNamedArg(expr, 'offset')
        const namedTrig = findNamedArg(expr, 'trig')
        const namedSeed = (isSah || isSmooth || isFractal) ? findNamedArg(expr, 'seed') : null

        let barExpr = namedBar?.value ?? getPosArg(expr, 0)?.value
        let offsetExpr = namedOffset?.value
        let trigExpr = namedTrig?.value
        let seedExpr = (isSah || isSmooth || isFractal) ? (namedSeed?.value ?? getPosArg(expr, 0)?.value) : null

        let offsetPos = 1
        let trigPos = 2
        let seedPos = 0

        if (isSah) {
          offsetPos = 2
          trigPos = 3
          seedPos = 1
          barExpr = namedBar?.value ?? getPosArg(expr, 0)?.value
          offsetExpr = namedOffset?.value ?? getPosArg(expr, offsetPos)?.value
          trigExpr = namedTrig?.value ?? getPosArg(expr, trigPos)?.value
          seedExpr = namedSeed?.value ?? getPosArg(expr, seedPos)?.value
        }
        else if (isSmooth) {
          // smooth(rate, seed, curve, trig)
          offsetPos = 0
          trigPos = 3
          seedPos = 1
          barExpr = namedSeed?.value ?? getPosArg(expr, 1)?.value ?? namedBar?.value ?? getPosArg(expr, 0)?.value
          offsetExpr = namedOffset?.value ?? findNamedArg(expr, 'rate')?.value ?? getPosArg(expr, 0)?.value
          trigExpr = namedTrig?.value ?? getPosArg(expr, 3)?.value
        }
        else if (isFractal) {
          // fractal(rate, seed, octaves, gain, trig)
          offsetPos = 0
          trigPos = 4
          seedPos = 1
          barExpr = namedSeed?.value ?? getPosArg(expr, 1)?.value ?? namedBar?.value ?? getPosArg(expr, 0)?.value
          offsetExpr = namedOffset?.value ?? findNamedArg(expr, 'rate')?.value ?? getPosArg(expr, 0)?.value
          trigExpr = namedTrig?.value ?? getPosArg(expr, 4)?.value
        }
        else {
          // regular LFOs: lfo*(bar, offset, trig)
          offsetExpr = namedOffset?.value ?? getPosArg(expr, 1)?.value
          trigExpr = namedTrig?.value ?? getPosArg(expr, 2)?.value
        }

        const calleeLoc = (expr.callee?.loc ?? expr.loc) as Loc
        const aboveLoc = computeAboveLoc(src, lineStarts, calleeLoc)

        refs.push({
          lfoIndex: getIndexFromCall(expr),
          lfoType,
          loc: calleeLoc,
          aboveLoc,
          callLoc: expr.loc,
          barArgLoc: isSmooth || isFractal
            ? (namedSeed?.loc ?? getPosArg(expr, 0)?.loc ?? namedBar?.loc ?? getPosArg(expr, 0)?.loc ?? null)
            : (namedBar?.loc ?? getPosArg(expr, 0)?.loc ?? null),
          offsetArgLoc: isSmooth || isFractal
            ? (namedOffset?.loc ?? findNamedArg(expr, 'rate')?.loc ?? getPosArg(expr, 1)?.loc ?? null)
            : (namedOffset?.loc ?? getPosArg(expr, offsetPos)?.loc ?? null),
          trigArgLoc: (namedTrig?.loc ?? getPosArg(expr, trigPos)?.loc ?? null),
          seedArgLoc: (isSah || isSmooth || isFractal)
            ? (namedSeed?.loc ?? getPosArg(expr, seedPos)?.loc ?? null)
            : null,
          params: {
            bar: getNumberOrDefault(barExpr, 1 / 16),
            offset: getNumberOrDefault(offsetExpr, 0),
            seed: (isSah || isSmooth || isFractal) ? getNumberOrDefault(seedExpr, 1234) : 1234,
          },
        })
      }
    },
  }
}
