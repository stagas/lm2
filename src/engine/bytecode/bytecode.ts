import {
  FINAL_OUT_ANALYSER_L_INDEX,
  FINAL_OUT_ANALYSER_R_INDEX,
  SEQ_VOICES,
} from '../../../as/assembly/constants.ts'
import { MAX_GEN_INDEX, Op, SeqOp } from '../../../as/assembly/shared.ts'
import type {
  Loc,
  Program,
} from '../../lang/ast.ts'
import { compile } from '../../lang/bytecode.ts'
import { type LangError, lineText } from '../../lang/errors.ts'
import { lex } from '../../lang/lexer.ts'
import { parse } from '../../lang/parser.ts'
import type { LexError, Token } from '../../lang/token.ts'
import { checkUndefinedVariableErrors } from '../../lang/undefined-variable.ts'
import { parseChordSuffix, romanToDegree } from '../../mini/chord-parser.ts'
import { findScaleIndex } from '../../mini/scales.ts'
import { walkAst } from './ast-walker.ts'
import { builtinSyms } from './builtin-syms.ts'
import {
  createAnalyserVisitor,
} from './extract-analysers.ts'
import {
  createBarsVisitor,
  createBpmVisitor,
} from './extract-bpm-bars.ts'
import {
  createFilterNumberLiteralsVisitor,
} from './extract-filter.ts'
import {
  createGenericKnobVisitor,
} from './extract-knobs-generic.ts'
import {
  createMiniSequencesVisitor,
} from './extract-mini.ts'
import {
  createNumberLiteralsVisitor,
  createNumberParamsVisitor,
} from './extract-numbers.ts'
import {
  createSamplesVisitor,
} from './extract-samples.ts'
import {
  createScaleVisitor,
} from './extract-scale.ts'
import {
  createSlicersVisitor,
} from './extract-slicers.ts'
import {
  createTimelineLabelsVisitor,
} from './extract-timeline-labels.ts'
import {
  createTimelineSequencesVisitor,
} from './extract-timeline-sequences.ts'
import {
  createTramSequencesVisitor,
} from './extract-tram.ts'
import {
  createAtVisitor,
  createEuclidVisitor,
  createEveryVisitor,
} from './extract-trigs.ts'
import { binaryCode, encoderError, tryEvalConstNumber, unaryCode } from './helpers.ts'
import { POSTLUDE, PRELUDE } from './prelude.ts'
import {
  type AdRef,
  type AdsrRef,
  AnalyserRef,
  ArrayLiteralRef,
  AtRef,
  BranchMarkRef,
  CompressorRef,
  type EnvfollowRef,
  type EuclidRef,
  EveryRef,
  type ExpanderRef,
  type FilterRef,
  type GateRef,
  LfoRef,
  type LimiterRef,
  type MiniSequenceRef,
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
  type ReverbRef,
  type SampleDef,
  type SlewRef,
  SlicerRef,
  type TimelineLabel,
  type TimelineSequenceDef,
  type TimelineSequenceRef,
  type TramSequenceRef,
  VM_MAGIC,
  VmOp,
  VmTarget,
} from './types.ts'

export * from './builtin-syms.ts'
export * from './extract-analysers.ts'
export * from './extract-bpm-bars.ts'
export * from './extract-knobs-generic.ts'
export * from './extract-mini.ts'
export * from './extract-numbers.ts'
export * from './extract-samples.ts'
export * from './extract-scale.ts'
export * from './extract-timeline-labels.ts'
export * from './extract-timeline-sequences.ts'
export * from './extract-trigs.ts'
export * from './knob-config.ts'
export * from './types.ts'

const NOTE_OFFSETS: Record<string, number> = {
  c: 0,
  d: 2,
  e: 4,
  f: 5,
  g: 7,
  a: 9,
  b: 11,
}

const NOTE_REGEXP = /^([a-gA-G])([#b]?)(\d+)$/

function noteIdentToMidi(name: string): number | null {
  const m = name.match(NOTE_REGEXP)
  if (!m) return null
  const note = m[1]!.toLowerCase()
  const acc = m[2] ?? ''
  const oct = parseInt(m[3]!, 10)
  const base = NOTE_OFFSETS[note]
  if (base === undefined || !Number.isFinite(oct)) return null
  let midi = base + (oct + 1) * 12
  if (acc === '#') midi += 1
  else if (acc === 'b') midi -= 1
  return midi
}

export { Op, SEQ_VOICES, SeqOp }

const persistentSampleKeyToIndex = new Map<string, number>()

const normalizePrelude = (s: string): string => {
  const t = s.trimEnd()
  if (!t) return ''
  const last = t[t.length - 1]
  const withSep = last === ';' || last === '}' ? t : `${t};`
  return withSep.endsWith('\n') ? withSep : `${withSep}\n`
}

type KernelCacheEntry = {
  src: string
  lexErrors: LexError[]
  program: Program
  parseErrors: LangError[]
}

const KERNEL_LEX_LINES = 1_000_000_000
const kernelCache = new Map<string, KernelCacheEntry>()

const transformedBodyScratch: any[] = []
const transformedUserBodyScratch: any[] = []

type AstTransformContext = {
  sequenceToIndex: Map<string, number>
  timelineKeyToIndex: Map<string, number>
  miniCount: number
  sampleKeyToIndex: Map<string, number>
  allocAnalyserIndex: (span?: number) => number
  allocCompressorIndex: (span?: number) => number
  allocExpanderIndex: (span?: number) => number
  allocGateIndex: (span?: number) => number
  allocLimiterIndex: (span?: number) => number
  allocFilterIndex: (span?: number) => number
  allocLfoIndex: (span?: number) => number
  allocReverbIndex: (span?: number) => number
  allocAdIndex: (span?: number) => number
  allocAdsrIndex: (span?: number) => number
  allocEnvfollowIndex: (span?: number) => number
  allocTrigIndex: (span?: number) => number
  implicitAnalyserRefs: AnalyserRef[]
  isVisualizerAssign: (stmt: any) => boolean
}

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

function getPosArgValue(call: any, posIndex: number): any | null {
  let pos = 0
  for (const arg of call.args ?? []) {
    if (arg?.kind !== 'pos') continue
    if (pos === posIndex) return arg.value ?? null
    pos++
  }
  return null
}

function getNamedArgValue(call: any, name: string): any | null {
  for (const arg of call.args ?? []) {
    if (arg?.kind !== 'named') continue
    if (arg.name === name) return arg.value ?? null
  }
  return null
}

function getRecordCbKey(call: any): number {
  const secondsExpr = getNamedArgValue(call, 'seconds') ?? getPosArgValue(call, 0)
  const cbExpr = getNamedArgValue(call, 'cb') ?? getNamedArgValue(call, 'callback') ?? getPosArgValue(call, 1)
  return fnv1a32(stableAstString({ seconds: secondsExpr, cb: cbExpr }))
}

function recordKeyFromAssign(targetName: string): string {
  return `record:${targetName}`
}

function recordKeyFallback(call: any): string {
  const cbKey = getRecordCbKey(call)
  return `record#${(cbKey >>> 0).toString(16)}`
}

function toSeqIndexExpr(loc: Loc, idx: number): any {
  return { kind: 'number', value: idx, raw: String(idx), loc } as any
}

function injectRecordArgs(
  sampleKeyToIndex: Map<string, number>,
  call: any,
  callee: any,
  args: any[],
  recordKey: string,
): any {
  const idx = sampleKeyToIndex.get(recordKey)
  if (idx === undefined) return { ...call, callee, args }
  const cbKey = getRecordCbKey(call)

  const filtered: any[] = []
  for (const a of args) {
    const drop = a?.kind === 'named' && (a.name === '%index' || a.name === 'index' || a.name === '%key')
    if (!drop) filtered.push(a)
  }

  return {
    ...call,
    callee,
    args: [
      ...filtered,
      { kind: 'named', name: '%index', value: toSeqIndexExpr(call.loc, idx), loc: call.loc },
      { kind: 'named', name: '%key', value: toSeqIndexExpr(call.loc, cbKey >>> 0), loc: call.loc },
    ],
  }
}

function createIndexAllocator(
  opts: { start: number; max: number; reserved?: number[] },
): (span?: number) => number {
  const used = new Set<number>(opts.reserved ?? [])
  let next = opts.start | 0
  const max = opts.max | 0

  return (span = 1): number => {
    span = Math.max(1, span | 0)
    const maxStart = Math.max(0, max - (span - 1))

    while (next <= maxStart) {
      let ok = true
      for (let i = 0; i < span; i++) {
        if (used.has(next + i)) {
          ok = false
          break
        }
      }
      if (ok) {
        const idx = next
        for (let i = 0; i < span; i++) used.add(idx + i)
        next = idx + span
        return idx
      }
      next++
    }

    // Saturate if we've run out of space; better to overlap than to crash or produce gaps.
    const idx = maxStart
    for (let i = 0; i < span; i++) used.add(idx + i)
    return idx
  }
}

function isReverbCall(name: string | null): boolean {
  return name === 'freeverb' || name === 'dattorro' || name === 'fdn' || name === 'velvet'
}

function stripMiniColorArg(args: any[]): any[] {
  let namedColor: any | null = null
  let secondPos: any | null = null
  let thirdPos: any | null = null
  let pos = 0

  for (const a of args) {
    if (a?.kind === 'named' && a.name === 'color') namedColor = a
    if (a?.kind === 'pos') {
      if (pos === 1) secondPos = a
      else if (pos === 2) thirdPos = a
      pos++
    }
  }

  const toDrop = namedColor
    ?? (secondPos?.value?.kind === 'string' ? secondPos : null)
    ?? (thirdPos?.value?.kind === 'string' ? thirdPos : null)

  if (!toDrop) return args
  const out: any[] = []
  for (const a of args) if (a !== toDrop) out.push(a)
  return out
}

function transformExpr(context: AstTransformContext, expr: any): any {
  if (!expr) return expr
  // Don't skip kernel code - we need to transform default arguments in prelude functions

  if (expr.kind === 'ident') {
    const om = expr.name.match(/^o(\d+)$/)
    if (om) {
      const o = parseInt(om[1]!, 10)
      const mul = Number.isFinite(o) ? 2 ** (o + 1) : 0
      return { kind: 'number', value: mul, raw: String(mul), loc: expr.loc }
    }

    if (expr.name.startsWith('#')) {
      const raw = expr.name.slice(1)
      const dm = raw.match(/^(\d+)$/)
      if (dm) {
        const d = parseInt(dm[1]!, 10)
        return {
          kind: 'call',
          callee: { kind: 'ident', name: 'degree', loc: expr.loc },
          args: [{
            kind: 'pos',
            value: { kind: 'number', value: d, raw: String(d), loc: expr.loc },
            loc: expr.loc,
          }],
          loc: expr.loc,
        }
      }

      if (raw === 'scale') {
        return {
          kind: 'call',
          callee: { kind: 'ident', name: 'getScale', loc: expr.loc },
          args: [],
          loc: expr.loc,
        }
      }

      const chordMatch = raw.match(/^([ivxlcdm]+)(.*)$/i)
      if (chordMatch) {
        const roman = chordMatch[1]
        const suffix = chordMatch[2] ?? ''
        const base = romanToDegree(roman)
        if (base !== null) {
          const tones = parseChordSuffix(suffix)
          const items = new Array<any>(tones.length)
          for (let idx = 0; idx < tones.length; idx++) {
            const tone = tones[idx]
            const scaleDegree = base + tone.degree
            const loc: Loc = idx === 0 ? expr.loc : { ...expr.loc, line: 0, column: expr.loc.column + idx }
            const args: any[] = [{
              kind: 'pos',
              value: { kind: 'number', value: scaleDegree, raw: String(scaleDegree), loc },
              loc: expr.loc,
            }]

            if (tone.semitoneAdjust !== 0) {
              args.push({
                kind: 'pos',
                value: {
                  kind: 'number',
                  value: tone.semitoneAdjust,
                  raw: String(tone.semitoneAdjust),
                  loc,
                },
                loc: expr.loc,
              })
            }

            items[idx] = {
              kind: 'call',
              callee: { kind: 'ident', name: 'degree', loc: expr.loc },
              args,
              loc: expr.loc,
            }
          }

          return { kind: 'array', items, loc: expr.loc }
        }
      }
    }

    const midi = noteIdentToMidi(expr.name)
    if (midi !== null) {
      return {
        kind: 'call',
        callee: { kind: 'ident', name: 'note', loc: expr.loc },
        args: [{
          kind: 'pos',
          value: { kind: 'number', value: midi, raw: String(midi), loc: expr.loc },
          loc: expr.loc,
        }],
        loc: expr.loc,
      }
    }
  }

  if (expr.kind === 'call') {
    const preCalleeName = expr.callee?.kind === 'ident' ? expr.callee.name : null
    const reverbIndex = isReverbCall(preCalleeName) ? context.allocReverbIndex() : null

    const callee = transformExpr(context, expr.callee)
    const inArgs = expr.args ?? []
    let args = inArgs
    if (inArgs.length) {
      const out = new Array<any>(inArgs.length)
      for (let i = 0; i < inArgs.length; i++) {
        const a = inArgs[i]
        if (a?.kind === 'pos' || a?.kind === 'named') out[i] = { ...a, value: transformExpr(context, a.value) }
        else out[i] = a
      }
      args = out
    }

    if (reverbIndex !== null) {
      const filtered: any[] = []
      for (const a of args) {
        const drop = a?.kind === 'named' && (a.name === '%index' || a.name === 'index')
        if (!drop) filtered.push(a)
      }
      args = [
        ...filtered,
        { kind: 'named', name: '%index', value: toSeqIndexExpr(expr.loc, reverbIndex), loc: expr.loc },
      ]
    }

    const calleeName = callee?.kind === 'ident' ? callee.name : null

    const isMini = calleeName === 'mini'
    const isPlay = calleeName === 'play'
    const isTram = calleeName === 'tram'
    const isTimeline = calleeName === 'timeline'
    const isAd = calleeName === 'ad'
    const isAdsr = calleeName === 'adsr'
    const isEnvfollow = calleeName === 'envfollow'
    const analyserKind = (
        calleeName === 'analyser'
        || calleeName === 'amplitude'
        || calleeName === 'waveform'
        || calleeName === 'spectrum'
        || calleeName === 'level'
        || calleeName === 'print'
      )
      ? calleeName
      : null
    const isAnalyser = analyserKind !== null
    const isCompressor = calleeName === 'compressor'
    const isExpander = calleeName === 'expander'
    const isGate = calleeName === 'gate'
    const isLimiter = calleeName === 'limiter'
    const isFilter = calleeName === 'lp'
      || calleeName === 'hp'
      || calleeName === 'bp'
      || calleeName === 'bs'
      || calleeName === 'ls'
      || calleeName === 'hs'
      || calleeName === 'peak'
      || calleeName === 'ap'
      || calleeName === 'slp'
      || calleeName === 'shp'
      || calleeName === 'sbp'
      || calleeName === 'sbs'
      || calleeName === 'speak'
      || calleeName === 'sap'
      || calleeName === 'mlp'
      || calleeName === 'mhp'
      || calleeName === 'diodeladder'
      || calleeName === 'olp'
      || calleeName === 'ohp'
    const isLfo = calleeName === 'lfosine'
      || calleeName === 'lfotri'
      || calleeName === 'lfosaw'
      || calleeName === 'lforamp'
      || calleeName === 'lfosqr'
      || calleeName === 'lfosah'
      || calleeName === 'smooth'
      || calleeName === 'fractal'
    const isOut = calleeName === 'out' || calleeName === 'solo'
    const isLabel = calleeName === 'label'
    const isFreesound = calleeName === 'freesound'
    const isRecord = calleeName === 'record'

    if (isLabel) {
      return { kind: 'undefined', loc: expr.loc }
    }

    if (isFreesound) {
      let idArg: any | undefined
      for (const a of args) {
        if (a?.kind === 'named' && a.name === 'id') {
          idArg = a
          break
        }
      }
      if (!idArg) {
        for (const a of args) {
          if (a?.kind === 'pos') {
            idArg = a
            break
          }
        }
      }
      const idExpr = idArg?.kind === 'pos' || idArg?.kind === 'named' ? idArg.value : null
      const id = tryEvalConstNumber(idExpr)
      if (id != null && Number.isFinite(id) && Number.isInteger(id) && id >= 0) {
        const idx = context.sampleKeyToIndex.get(`freesound:${id}`)
        if (idx !== undefined) return toSeqIndexExpr(expr.loc, idx)
      }
      return { kind: 'undefined', loc: expr.loc }
    }

    if (isRecord) {
      return injectRecordArgs(context.sampleKeyToIndex, expr, callee, args, recordKeyFallback(expr))
    }

    const withIndex = (idx: number) => ({
      kind: 'named',
      name: '%index',
      value: toSeqIndexExpr(expr.loc, idx),
      loc: expr.loc,
    })

    if (isAd) {
      const idx = context.allocAdIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isAdsr) {
      const idx = context.allocAdsrIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isEnvfollow) {
      const idx = context.allocEnvfollowIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isAnalyser) {
      const idx = context.allocAnalyserIndex()
      // Keep only the first positional arg (signal), drop any user-provided index and any named index.
      const filtered: any[] = []
      let posSeen = 0
      for (const a of args) {
        if (a?.kind === 'named' && (a.name === '%index' || a.name === 'index')) continue
        if (a?.kind !== 'pos') {
          filtered.push(a)
          continue
        }
        if (posSeen === 0) filtered.push(a)
        posSeen++
      }
      return { ...expr, callee, args: [...filtered, withIndex(idx)] }
    }

    if (isCompressor) {
      const idx = context.allocCompressorIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isExpander) {
      const idx = context.allocExpanderIndex()
      const filtered: any[] = []
      for (const a of args) {
        const drop = a?.kind === 'named' && (a.name === '%index' || a.name === 'index')
        if (!drop) filtered.push(a)
      }
      return { ...expr, callee, args: [...filtered, withIndex(idx)] }
    }

    if (isGate) {
      const idx = context.allocGateIndex()
      const filtered: any[] = []
      for (const a of args) {
        const drop = a?.kind === 'named' && (a.name === '%index' || a.name === 'index')
        if (!drop) filtered.push(a)
      }
      return { ...expr, callee, args: [...filtered, withIndex(idx)] }
    }

    if (isLimiter) {
      const idx = context.allocLimiterIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isFilter) {
      const idx = context.allocFilterIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isLfo) {
      const idx = context.allocLfoIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (calleeName === 'every') {
      const idx = context.allocTrigIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (calleeName === 'at') {
      const idx = context.allocTrigIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (calleeName === 'euclid') {
      const idx = context.allocTrigIndex()
      return { ...expr, callee, args: [...args, withIndex(idx)] }
    }

    if (isOut) {
      let audioArg: any | null = null
      for (const a of args) {
        if (a?.kind === 'pos') {
          audioArg = a
          break
        }
      }
      const audioExpr = audioArg?.value
      const audioCalleeName = audioExpr?.kind === 'call' && audioExpr.callee?.kind === 'ident'
        ? audioExpr.callee.name
        : null

      // If the signal is already analysed (common: `... |> analyser(%) |> out(%)`), don't add an implicit tap.
      //
      // Important: we do NOT desugar to `out(analyser(x))` because that changes semantics for arrays
      // (e.g. `array |> out($)` would get coerced). Instead, attach an analyser tap index and emit
      // a side-effect analyser call at bytecode compile time.
      const isAlreadyAnalysed = audioCalleeName === 'analyser'
        || audioCalleeName === 'amplitude'
        || audioCalleeName === 'waveform'
        || audioCalleeName === 'spectrum'
        || audioCalleeName === 'level'
        || audioCalleeName === 'print'
      if (audioArg?.kind === 'pos' && audioExpr && !isAlreadyAnalysed) {
        const idx = context.allocAnalyserIndex()
        const calleeLoc = expr.callee?.loc ?? expr.loc
        context.implicitAnalyserRefs.push({
          kind: 'analyser',
          analyserIndex: idx,
          loc: calleeLoc,
          aboveLoc: calleeLoc,
          callLoc: expr.loc,
        })
        return { ...(expr as any), callee, args, __tapAnalyserIndex: idx }
      }
    }

    if (isMini || isPlay) {
      let seqArg: any | undefined
      for (const a of args) {
        if (a?.kind === 'named' && a.name === 'seq') {
          seqArg = a
          break
        }
      }
      if (!seqArg) {
        for (const a of args) {
          if (a?.kind === 'pos') {
            seqArg = a
            break
          }
        }
      }

      if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
        const v = seqArg.value
        if (v?.kind === 'string') {
          const idx = context.sequenceToIndex.get(String(v.value ?? ''))
          if (idx !== undefined) {
            seqArg.value = toSeqIndexExpr(v.loc, idx)
          }
        }
      }

      // Strip compile-time-only mini(seq, color?) arg so runtime sees mini(seq[, cb]).
      const argsNoColor = stripMiniColorArg(args)

      let seqArg2: any | undefined
      for (const a of argsNoColor) {
        if (a?.kind === 'named' && a.name === 'seq') {
          seqArg2 = a
          break
        }
      }
      if (!seqArg2) {
        for (const a of argsNoColor) {
          if (a?.kind === 'pos') {
            seqArg2 = a
            break
          }
        }
      }

      // mini(x) is a compile-time identity for sequence refs (also mini(x, color?))
      if (isMini && argsNoColor.length === 1 && seqArg2 && (seqArg2.kind === 'pos' || seqArg2.kind === 'named')) {
        return seqArg2.value
      }

      // play(seq, cb) is a compile-time alias of mini(seq, cb)
      if (isPlay) {
        return { ...expr, callee: { kind: 'ident', name: 'mini', loc: callee.loc }, args: argsNoColor }
      }

      return { ...expr, callee, args: argsNoColor }
    }

    if (isTram) {
      // For tram, the first positional argument is the sequence
      let seqArg: any | undefined
      for (const a of args) {
        if (a?.kind === 'pos') {
          seqArg = a
          break
        }
      }

      if (seqArg?.kind === 'pos') {
        const v = seqArg.value
        if (v?.kind === 'string') {
          const idx = context.sequenceToIndex.get(String(v.value ?? ''))
          if (idx !== undefined) {
            seqArg.value = toSeqIndexExpr(v.loc, idx)
          }
        }
      }

      return { ...expr, callee, args }
    }

    if (isTimeline) {
      let seqArg: any | null = null
      for (const a of args) {
        if (a?.kind === 'named' && a.name === 'seq') {
          seqArg = a
          break
        }
      }
      let firstPos: any | null = null
      let secondPos: any | null = null
      let firstStringPos: any | null = null
      let pos = 0
      for (const a of args) {
        if (a?.kind !== 'pos') continue
        if (!firstPos) firstPos = a
        else if (!secondPos) secondPos = a
        if (!firstStringPos && a.value?.kind === 'string') firstStringPos = a
        pos++
      }
      if (!seqArg) seqArg = firstStringPos ?? secondPos ?? firstPos

      if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
        const v = seqArg.value
        if (v?.kind === 'string') {
          const key = String(v.value ?? '')
          const idx = context.timelineKeyToIndex.get(key)
          if (idx !== undefined) {
            seqArg.value = toSeqIndexExpr(v.loc, context.miniCount + idx)
            return {
              ...expr,
              callee,
              args: [{ kind: 'pos', value: seqArg.value }],
            }
          }
        }
      }
    }

    return { ...expr, callee, args }
  }

  if (expr.kind === 'binary') {
    return { ...expr, left: transformExpr(context, expr.left), right: transformExpr(context, expr.right) }
  }

  if (expr.kind === 'assign') {
    if (expr.op === '=' && expr.target?.kind === 'ident' && expr.target.name === 'scale') {
      const v = expr.value
      const name = v?.kind === 'string' ? String(v.value ?? '') : v?.kind === 'ident' ? String(v.name ?? '') : ''
      if (name) {
        const idx = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0
        return {
          ...expr,
          target: transformExpr(context, expr.target),
          value: { kind: 'number', value: idx, raw: String(idx), loc: v?.loc ?? expr.loc },
        }
      }
    }
    if (
      expr.op === '='
      && expr.target?.kind === 'ident'
      && expr.value?.kind === 'call'
      && expr.value.callee?.kind === 'ident'
      && expr.value.callee.name === 'record'
    ) {
      const target = transformExpr(context, expr.target)
      const call = expr.value
      const callee = transformExpr(context, call.callee)
      const inArgs = call.args ?? []
      const args = inArgs.length
        ? inArgs.map((
          a: any,
        ) => (a.kind === 'pos' || a.kind === 'named' ? { ...a, value: transformExpr(context, a.value) } : a))
        : inArgs
      const key = recordKeyFromAssign(expr.target.name)
      return { ...expr, target, value: injectRecordArgs(context.sampleKeyToIndex, call, callee, args, key) }
    }
    return { ...expr, target: transformExpr(context, expr.target), value: transformExpr(context, expr.value) }
  }

  if (expr.kind === 'unary' || expr.kind === 'postfix') {
    return { ...expr, expr: transformExpr(context, expr.expr) }
  }

  if (expr.kind === 'member') {
    const out: any = { ...expr, object: transformExpr(context, expr.object) }
    if (expr.computed) out.index = transformExpr(context, expr.index)
    return out
  }

  if (expr.kind === 'array') {
    const inItems = expr.items ?? []
    if (!inItems.length) return { ...expr, items: [] }
    const items = new Array<any>(inItems.length)
    for (let i = 0; i < inItems.length; i++) items[i] = transformExpr(context, inItems[i])
    return { ...expr, items }
  }

  if (expr.kind === 'object') {
    const inProps = expr.props ?? []
    if (!inProps.length) return { ...expr, props: [] }
    const props = new Array<any>(inProps.length)
    for (let i = 0; i < inProps.length; i++) {
      const p = inProps[i]
      props[i] = { ...p, value: transformExpr(context, p.value) }
    }
    return { ...expr, props }
  }

  if (expr.kind === 'if') {
    const thenPart = expr.then?.kind === 'block' ? transformStmt(context, expr.then) : transformExpr(context, expr.then)
    const elsePart = expr.else?.kind === 'block' ? transformStmt(context, expr.else) : transformExpr(context, expr.else)
    return { ...expr, test: transformExpr(context, expr.test), then: thenPart, else: elsePart }
  }

  if (expr.kind === 'func') {
    const inParams = expr.params ?? []
    const params = new Array<any>(inParams.length)

    // Transform default expressions in parent scope before processing function body
    // Deep clone each default to avoid shared references between functions
    for (let i = 0; i < inParams.length; i++) {
      const p = inParams[i]
      if (p?.default) {
        // Deep clone the default expression to prevent shared AST nodes
        const clonedDefault = JSON.parse(JSON.stringify(p.default))
        params[i] = { ...p, default: transformExpr(context, clonedDefault) }
      }
      else {
        params[i] = p
      }
    }

    const body = expr.body?.kind === 'block' ? transformStmt(context, expr.body) : transformExpr(context, expr.body)
    const initStmts: any[] = []

    for (const p of params) {
      if (p?.default && !p.isRest) {
        const pLoc = p.loc ?? expr.loc
        const ident = { kind: 'ident', name: p.name, loc: pLoc }
        const test = {
          kind: 'binary',
          op: '===',
          left: ident,
          right: { kind: 'undefined', loc: pLoc },
          loc: pLoc,
        }
        const value = {
          kind: 'if',
          test,
          then: p.default,
          else: ident,
          loc: pLoc,
          __noBranchMark: true,
        }
        const assign = {
          kind: 'assign',
          op: '=',
          target: ident,
          value,
          loc: pLoc,
        }
        initStmts.push({ kind: 'expr_stmt', expr: assign, loc: pLoc })
      }

      if (p?.pattern) {
        const pLoc = p.loc ?? expr.loc
        initStmts.push({
          kind: 'destructure',
          pattern: p.pattern,
          value: { kind: 'ident', name: p.name, loc: pLoc },
          loc: pLoc,
        })
      }
    }

    if (initStmts.length === 0) return { ...expr, params, body }

    if (body?.kind === 'block') {
      return { ...expr, params, body: { ...body, body: [...initStmts, ...(body.body ?? [])] } }
    }

    return {
      ...expr,
      params,
      body: {
        kind: 'block',
        body: [...initStmts, { kind: 'expr_stmt', expr: body, loc: body.loc }],
        loc: expr.loc,
      },
    }
  }

  return expr
}

function transformStmt(context: AstTransformContext, stmt: any): any {
  if (!stmt) return stmt
  // Don't skip kernel code - we need to transform default arguments in prelude functions
  if (stmt.kind === 'expr_stmt') {
    if (context.isVisualizerAssign(stmt)) return null
    const isBpmStmt = !!(
      stmt.expr?.kind === 'assign'
      && stmt.expr.target?.kind === 'ident'
      && stmt.expr.target?.name === 'bpm'
    )
    if (isBpmStmt) return null
    const isBarsStmt = !!(
      stmt.expr?.kind === 'assign'
      && stmt.expr.target?.kind === 'ident'
      && stmt.expr.target?.name === 'bars'
    )
    if (isBarsStmt) return null
    const isLabelStmt = !!(
      stmt.expr?.kind === 'call'
      && stmt.expr.callee?.kind === 'ident'
      && stmt.expr.callee?.name === 'label'
    )
    if (isLabelStmt) return null
    return { ...stmt, expr: transformExpr(context, stmt.expr) }
  }
  if (stmt.kind === 'block') {
    const out: any[] = []
    for (const s of stmt.body ?? []) {
      const t = transformStmt(context, s)
      if (t) out.push(t)
    }
    return { ...stmt, body: out }
  }
  if (stmt.kind === 'for') {
    if (stmt.head?.kind === 'c_style') {
      return {
        ...stmt,
        head: {
          ...stmt.head,
          init: stmt.head.init ? transformExpr(context, stmt.head.init) : undefined,
          test: stmt.head.test ? transformExpr(context, stmt.head.test) : undefined,
          update: stmt.head.update ? transformExpr(context, stmt.head.update) : undefined,
        },
        body: transformStmt(context, stmt.body),
      }
    }
    return {
      ...stmt,
      head: { ...stmt.head, iterable: transformExpr(context, stmt.head.iterable) },
      body: transformStmt(context, stmt.body),
    }
  }
  if (stmt.kind === 'while' || stmt.kind === 'do_while') {
    return { ...stmt, test: transformExpr(context, stmt.test), body: transformStmt(context, stmt.body) }
  }
  if (stmt.kind === 'switch') {
    return {
      ...stmt,
      test: transformExpr(context, stmt.test),
      cases: (stmt.cases ?? []).map((c: any) => ({
        ...c,
        test: c.test ? transformExpr(context, c.test) : undefined,
        body: (c.body ?? []).map((s: any) => transformStmt(context, s)).filter(Boolean),
      })),
    }
  }
  if (stmt.kind === 'try') {
    return {
      ...stmt,
      body: transformStmt(context, stmt.body),
      catchBody: stmt.catchBody ? transformStmt(context, stmt.catchBody) : undefined,
      finallyBody: stmt.finallyBody ? transformStmt(context, stmt.finallyBody) : undefined,
    }
  }
  if (stmt.kind === 'throw') return { ...stmt, value: transformExpr(context, stmt.value) }
  if (stmt.kind === 'return') return { ...stmt, value: stmt.value ? transformExpr(context, stmt.value) : undefined }
  if (stmt.kind === 'label') return { ...stmt, stmt: transformStmt(context, stmt.stmt) }
  if (stmt.kind === 'destructure') return { ...stmt, value: transformExpr(context, stmt.value) }
  return stmt
}

function getKernelCached(src: string): KernelCacheEntry {
  const cached = kernelCache.get(src)
  if (cached) return cached

  const lexed = lex(src, { preludeLines: KERNEL_LEX_LINES, postludeStart: Infinity })
  const parsed = parse(src, lexed.tokens)
  const entry: KernelCacheEntry = {
    src,
    lexErrors: lexed.errors,
    program: parsed.program,
    parseErrors: parsed.errors,
  }
  kernelCache.set(src, entry)
  return entry
}

const DEFAULT_KERNEL = (() => {
  const preludeSrc = normalizePrelude(PRELUDE)
  const postludeSrc = normalizePrelude(POSTLUDE)
  return {
    preludeSrc,
    postludeSrc,
    prelude: getKernelCached(preludeSrc),
    postlude: getKernelCached(postludeSrc),
  }
})()

function extractEarlyDataFromProgram(
  src: string,
  program: Program,
  errors: LangError[],
  sampleKeyToIndex: Map<string, number> = persistentSampleKeyToIndex,
) {
  // Initialize result collections
  const sequences: string[] = []
  const miniRefs: MiniSequenceRef[] = []
  const miniPlayBars: Array<number | undefined> = []
  const tramRefs: TramSequenceRef[] = []
  const tramSequences: string[] = []
  const timelineSequences: TimelineSequenceDef[] = []
  const timelineRefs: TimelineSequenceRef[] = []
  const timelineLabels: TimelineLabel[] = []
  const samples: SampleDef[] = []
  const numberParams: NumberWithParamsInfo[] = []
  const filterNumberLiterals: NumberWithParamsInfo[] = []
  const numberLiterals: NumberLiteralInfo[] = []
  const result = { bpm: undefined as number | undefined, bars: undefined as number | undefined,
    scale: undefined as number | undefined }

  // Create all visitor instances for early extraction
  const visitors = [
    createBpmVisitor(src, errors, result),
    createBarsVisitor(src, errors, result),
    createScaleVisitor(src, errors, result),
    createMiniSequencesVisitor(src, sequences, miniRefs, miniPlayBars),
    createTramSequencesVisitor(src, tramSequences, tramRefs),
    createTimelineSequencesVisitor(src, timelineSequences, timelineRefs),
    createTimelineLabelsVisitor(timelineLabels),
    createSamplesVisitor(src, samples, errors, sampleKeyToIndex),
    createNumberParamsVisitor(numberParams),
    createFilterNumberLiteralsVisitor(filterNumberLiterals),
    createNumberLiteralsVisitor(numberLiterals),
  ]

  // Run all visitors in a single AST traversal
  walkAst(program, visitors, { src })

  return {
    bpm: result.bpm,
    bars: result.bars,
    scale: result.scale,
    sequences,
    miniRefs,
    miniPlayBars,
    tramSequences,
    tramRefs,
    timelineSequences,
    timelineRefs,
    timelineLabels,
    samples,
    numberParams: numberParams.filter(p => p.line > 0),
    filterNumberLiterals: filterNumberLiterals.filter(p => p.line > 0),
    numberLiterals: numberLiterals.filter(p => p.line > 0),
  }
}

function extractAllRefsFromProgram(src: string, program: Program) {
  // Initialize result collections
  const analyserRefs: AnalyserRef[] = []
  const knobRefs: any[] = []
  const slicerRefs: SlicerRef[] = []
  const everyRefs: EveryRef[] = []
  const atRefs: AtRef[] = []
  const euclidRefs: EuclidRef[] = []

  // Create all visitor instances
  const visitors = [
    createAnalyserVisitor(src, analyserRefs),
    createGenericKnobVisitor(src, knobRefs),
    createSlicersVisitor(src, slicerRefs),
    createEveryVisitor(everyRefs),
    createAtVisitor(atRefs),
    createEuclidVisitor(euclidRefs),
  ]

  // Run all visitors in a single AST traversal
  walkAst(program, visitors, { src })

  // Separate knob refs by function type
  const compressorRefs: CompressorRef[] = []
  const expanderRefs: ExpanderRef[] = []
  const gateRefs: GateRef[] = []
  const limiterRefs: LimiterRef[] = []
  const filterRefs: FilterRef[] = []
  const adRefs: AdRef[] = []
  const adsrRefs: AdsrRef[] = []
  const envfollowRefs: EnvfollowRef[] = []
  const slewRefs: SlewRef[] = []
  const reverbRefs: ReverbRef[] = []
  const lfoRefs: LfoRef[] = []

  for (const ref of knobRefs) {
    if (ref.functionName === 'compressor') compressorRefs.push(ref)
    else if (ref.functionName === 'expander') expanderRefs.push(ref)
    else if (ref.functionName === 'gate') gateRefs.push(ref)
    else if (ref.functionName === 'limiter') limiterRefs.push(ref)
    else if (['lp', 'hp', 'bp', 'bs', 'ls', 'hs', 'peak', 'ap', 'slp', 'shp', 'sbp', 'sbs', 'speak', 'sap', 'mlp',
      'mhp', 'diodeladder', 'olp', 'ohp'].includes(ref.functionName)) filterRefs.push(ref)
    else if (ref.functionName === 'ad') adRefs.push(ref)
    else if (ref.functionName === 'adsr') adsrRefs.push(ref)
    else if (ref.functionName === 'envfollow') envfollowRefs.push(ref)
    else if (ref.functionName === 'slew') slewRefs.push(ref)
    else if (['freeverb', 'dattorro', 'fdn', 'velvet'].includes(ref.functionName)) reverbRefs.push(ref)
    else if (['lfosine', 'lfotri', 'lfosaw', 'lforamp', 'lfosqr', 'lfosah', 'smooth', 'fractal'].includes(
      ref.functionName,
    )) lfoRefs.push(ref)
  }

  return {
    adRefs,
    adsrRefs,
    envfollowRefs,
    slewRefs,
    analyserRefs,
    compressorRefs,
    expanderRefs,
    gateRefs,
    limiterRefs,
    filterRefs,
    reverbRefs,
    slicerRefs,
    lfoRefs,
    everyRefs,
    atRefs,
    euclidRefs,
  }
}

export function extractEarlyDataFromSource(src: string): {
  bpm?: number
  bars?: number
  scale?: number
  sequences: string[]
  miniRefs: MiniSequenceRef[]
  miniPlayBars: Array<number | undefined>
  tramSequences: string[]
  tramRefs: TramSequenceRef[]
  timelineSequences: TimelineSequenceDef[]
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  samples: SampleDef[]
  numberParams: NumberWithParamsInfo[]
  filterNumberLiterals: NumberWithParamsInfo[]
  numberLiterals: NumberLiteralInfo[]
  errors: LangError[]
} {
  const lexed = lex(src, { preludeLines: 0, postludeStart: Infinity })
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  const earlyData = extractEarlyDataFromProgram(src, parsed.program, errors)
  return { ...earlyData, errors }
}

type VmEncodeChunk = {
  consts: any[]
  funcs: any[]
  code: any[]
  arrayLiterals?: any[]
  branchMarks?: any[]
}

type VmEncodeChunkCtx = {
  src: string
  errors: LangError[]
  ops: Int32Array
  literals: Float32Array
  symOf: (s: string) => number
  sliderKeyOf: (loc: Pick<Loc, 'line' | 'column' | 'length'>) => string
  sliderKeys: ReadonlySet<string>
  litOfValue: (v: number) => number
  litOfLocKey: (key: string, value: number) => number
  locKeyToLiteralIndex: Map<string, number>
  arrayLiterals: ArrayLiteralRef[]
  branchMarks: BranchMarkRef[]
  funcPatches: { at: number; fn: object }[]
  funcQueue: object[]
}

let pcMapScratch = new Int32Array(0)

const getPcMap = (minLen: number): Int32Array => {
  minLen = Math.max(0, minLen | 0)
  if (pcMapScratch.length >= minLen) return pcMapScratch
  let cap = pcMapScratch.length > 0 ? pcMapScratch.length : 1024
  while (cap < minLen) cap <<= 1
  pcMapScratch = new Int32Array(cap)
  return pcMapScratch
}

function encodeChunkVm(
  ctx: VmEncodeChunkCtx,
  chunk: VmEncodeChunk,
  base: number,
): { endPc: number; writtenEnd: number } {
  const {
    src,
    errors,
    ops,
    literals,
    symOf,
    sliderKeyOf,
    sliderKeys,
    litOfValue,
    litOfLocKey,
    locKeyToLiteralIndex,
    arrayLiterals,
    branchMarks,
    funcPatches,
    funcQueue,
  } = ctx

  const code = chunk.code as any[]
  const codeLen = code.length | 0
  const consts = chunk.consts as any[]
  const funcs = chunk.funcs as any[]

  const pcMap = getPcMap(codeLen)
  let pc = base | 0
  for (let i = 0; i < codeLen; i++) {
    pcMap[i] = pc
    const ins = code[i]!
    const op = ins.op
    switch (op) {
      case 'PUSH_CONST': {
        const v = consts[ins.k]
        if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') pc = (pc + 2) | 0
        else pc = (pc + 1) | 0
        break
      }
      case 'ENTER_SCOPE':
      case 'EXIT_SCOPE':
      case 'POP':
      case 'DUP':
      case 'BRANCH':
      case 'LABEL':
      case 'RETURN':
      case 'THROW':
      case 'TRY_BEGIN':
      case 'CATCH_BEGIN':
      case 'FINALLY_BEGIN':
      case 'TRY_END':
      case 'LEN':
        pc = (pc + 1) | 0
        break
      case 'DUP2':
        errors.push(encoderError(src, 'DUP2 not supported in VM encoder yet'))
        pc = (pc + 1) | 0
        break
      case 'LOAD':
      case 'STORE':
      case 'UNARY':
      case 'BINARY':
      case 'FUNC':
      case 'ARRAY':
        pc = (pc + 2) | 0
        break
      case 'CALL':
        pc = (pc + 3) | 0
        break
      case 'JUMP':
      case 'JUMP_IF_FALSE':
        pc = (pc + 2) | 0
        break
      case 'BREAK':
      case 'CONTINUE':
        errors.push(encoderError(src, `${op} not supported in VM encoder yet`))
        pc = (pc + 1) | 0
        break
      case 'GET_INDEX':
      case 'GET_INDEX2':
      case 'SET_INDEX':
        pc = (pc + 1) | 0
        break
      case 'OBJECT':
      case 'GET_PROP':
      case 'SET_PROP':
        errors.push(encoderError(src, `${op} not supported in VM encoder yet`))
        pc = (pc + 1) | 0
        break
      default:
        errors.push(encoderError(src, `Unsupported opcode ${op}`))
        pc = (pc + 1) | 0
    }
  }

  const endPc = pc

  const arrayMeta = chunk.arrayLiterals as Array<{ ins: number; loc: Loc; items: Loc[] }> | undefined
  if (arrayMeta?.length) {
    for (let i = 0; i < arrayMeta.length; i++) {
      const lit = arrayMeta[i]!
      const pcAt = pcMap[lit.ins]
      if (pcAt !== undefined) arrayLiterals.push({ pc: pcAt, loc: lit.loc, items: lit.items })
    }
  }

  const branchMeta = chunk.branchMarks as Array<{ ins: number; loc: Loc }> | undefined
  if (branchMeta?.length) {
    for (let i = 0; i < branchMeta.length; i++) {
      const m = branchMeta[i]!
      const pcAt = pcMap[m.ins]
      if (pcAt !== undefined) branchMarks.push({ pc: pcAt, loc: m.loc })
    }
  }

  let w = base | 0
  for (let i = 0; i < codeLen; i++) {
    const ins = code[i]!
    const op = ins.op
    switch (op) {
      case 'PUSH_CONST': {
        const v = consts[ins.k]
        if (typeof v === 'number') {
          const loc = ins.loc as Loc | undefined
          const key = loc ? sliderKeyOf(loc) : undefined
          const isSlider = key !== undefined && sliderKeys.has(key)
          const k = (key !== undefined ? litOfLocKey(key, v) : litOfValue(v)) | 0
          literals[k] = v
          ops[w++] = isSlider ? VmOp.PushNumSmoothed : VmOp.PushNum
          ops[w++] = k
          if (key !== undefined) locKeyToLiteralIndex.set(key, k)
        }
        else if (typeof v === 'string') {
          ops[w++] = VmOp.PushSym
          ops[w++] = symOf(v) | 0
        }
        else if (typeof v === 'boolean') {
          ops[w++] = VmOp.PushBool
          ops[w++] = v ? 1 : 0
        }
        else if (v === null) {
          ops[w++] = VmOp.PushNull
        }
        else {
          ops[w++] = VmOp.PushUndef
        }
        break
      }
      case 'ENTER_SCOPE':
        ops[w++] = VmOp.EnterScope
        break
      case 'EXIT_SCOPE':
        ops[w++] = VmOp.ExitScope
        break
      case 'BRANCH':
        ops[w++] = VmOp.Branch
        break
      case 'POP':
        ops[w++] = VmOp.Pop
        break
      case 'DUP':
        ops[w++] = VmOp.Dup
        break
      case 'LABEL':
        ops[w++] = VmOp.Nop
        break
      case 'LOAD': {
        const name = String(consts[ins.name])
        ops[w++] = VmOp.Load
        ops[w++] = symOf(name) | 0
        break
      }
      case 'STORE': {
        const name = String(consts[ins.name])
        ops[w++] = VmOp.Store
        ops[w++] = symOf(name) | 0
        break
      }
      case 'UNARY': {
        const code = unaryCode(ins.opName)
        if (code === null) {
          errors.push(encoderError(src, `Unsupported unary op ${ins.opName}`))
          ops[w++] = VmOp.Nop
          break
        }
        ops[w++] = VmOp.Unary
        ops[w++] = code | 0
        break
      }
      case 'BINARY': {
        const code = binaryCode(ins.opName)
        if (code === null) {
          errors.push(encoderError(src, `Unsupported binary op ${ins.opName}`))
          ops[w++] = VmOp.Nop
          break
        }
        ops[w++] = VmOp.Binary
        ops[w++] = code | 0
        break
      }
      case 'ARRAY': {
        ops[w++] = VmOp.Array
        ops[w++] = ins.n | 0
        break
      }
      case 'LEN': {
        ops[w++] = VmOp.Len
        break
      }
      case 'GET_INDEX': {
        ops[w++] = VmOp.GetIndex
        break
      }
      case 'GET_INDEX2': {
        ops[w++] = VmOp.GetIndex2
        break
      }
      case 'SET_INDEX': {
        ops[w++] = VmOp.SetIndex
        break
      }
      case 'CALL':
        ops[w++] = VmOp.Call
        ops[w++] = ins.pos | 0
        ops[w++] = ins.named | 0
        break
      case 'JUMP': {
        ops[w++] = VmOp.Jump
        const to = ins.to
        ops[w++] = to === codeLen ? endPc : (pcMap[to] ?? endPc)
        break
      }
      case 'JUMP_IF_FALSE': {
        ops[w++] = VmOp.JumpIfFalse
        const to = ins.to
        ops[w++] = to === codeLen ? endPc : (pcMap[to] ?? endPc)
        break
      }
      case 'RETURN':
        ops[w++] = VmOp.Return
        break
      case 'THROW':
        ops[w++] = VmOp.Throw
        break
      case 'TRY_BEGIN':
      case 'CATCH_BEGIN':
      case 'FINALLY_BEGIN':
      case 'TRY_END':
        ops[w++] = VmOp.Nop
        break
      case 'FUNC': {
        const fn = funcs[ins.id]
        if (!fn) {
          errors.push(encoderError(src, `Missing FUNC #${ins.id}`))
          ops[w++] = VmOp.PushUndef
          break
        }
        ops[w++] = VmOp.Func
        const at = w++
        funcPatches.push({ at, fn })
        funcQueue.push(fn)
        ops[at] = 0
        break
      }
      default:
        errors.push(encoderError(src, `Unsupported opcode ${op}`))
        ops[w++] = VmOp.Nop
    }
  }

  return { endPc, writtenEnd: w }
}

export function encodeLangToVmOps(
  src: string,
  target: VmTarget,
  prelude = PRELUDE,
  postlude = POSTLUDE,
): {
  errors: LangError[]
  visualizerVertex?: string
  visualizerFragment?: string
  bpm?: number
  bars?: number
  scale?: number
  miniSequences?: string[]
  miniRefs?: MiniSequenceRef[]
  miniPlayBars?: Array<number | undefined>
  tramSequences?: string[]
  tramRefs?: TramSequenceRef[]
  timelineSequences?: TimelineSequenceDef[]
  timelineRefs?: TimelineSequenceRef[]
  timelineLabels?: TimelineLabel[]
  adRefs?: AdRef[]
  adsrRefs?: AdsrRef[]
  envfollowRefs?: EnvfollowRef[]
  slewRefs?: SlewRef[]
  analyserRefs?: AnalyserRef[]
  compressorRefs?: CompressorRef[]
  expanderRefs?: ExpanderRef[]
  gateRefs?: GateRef[]
  limiterRefs?: LimiterRef[]
  filterRefs?: FilterRef[]
  reverbRefs?: ReverbRef[]
  slicerRefs?: SlicerRef[]
  lfoRefs?: LfoRef[]
  everyRefs?: EveryRef[]
  atRefs?: AtRef[]
  euclidRefs?: EuclidRef[]
  arrayLiterals?: ArrayLiteralRef[]
  branchMarks?: BranchMarkRef[]
  numberParams?: NumberWithParamsInfo[]
  numberLiterals?: NumberLiteralInfo[]
  sampleDefs?: SampleDef[]
} {
  const mapError = (e: LangError): LangError => {
    if (e.line <= 0) return { ...e, line: 0, column: 0, code: '' }
    return { ...e, code: lineText(src, e.line) }
  }

  try {
    const useDefaultKernel = prelude === PRELUDE && postlude === POSTLUDE
    const preludeKernel = useDefaultKernel
      ? DEFAULT_KERNEL.prelude
      : getKernelCached(normalizePrelude(prelude))
    const postludeKernel = useDefaultKernel
      ? DEFAULT_KERNEL.postlude
      : getKernelCached(normalizePrelude(postlude))

    // Only lex/parse user source per call; kernel code is cached (and marked loc.kernel).
    const userLexed = lex(src, { preludeLines: 0, postludeStart: Infinity })
    const userTokens = userLexed.tokens
    const lexErrors: LangError[] = userLexed.errors.map(mapError)
    const userParsed = parse(src, userTokens)
    const errors: LangError[] = [...lexErrors, ...userParsed.errors.map(mapError)]

    let visualizerVertex: string | undefined
    let visualizerFragment: string | undefined
    const isVisualizerAssign = (stmt: any): boolean => {
      if (stmt?.kind !== 'expr_stmt') return false
      const e = stmt.expr
      if (e?.kind !== 'assign' || e.op !== '=') return false
      const t = e.target
      const v = e.value
      if (t?.kind !== 'ident') return false
      if (v?.kind !== 'string') return false
      if (t.name === 'vertex') {
        visualizerVertex = String(v.value ?? '')
        return true
      }
      if (t.name === 'fragment') {
        visualizerFragment = String(v.value ?? '')
        return true
      }
      return false
    }

    const scanVisualizer = (stmt: any): void => {
      if (!stmt) return
      isVisualizerAssign(stmt)
      if (stmt.kind === 'block') {
        for (const s of stmt.body ?? []) scanVisualizer(s)
      }
      else if (stmt.kind === 'for') {
        scanVisualizer(stmt.body)
      }
      else if (stmt.kind === 'while' || stmt.kind === 'do_while') {
        scanVisualizer(stmt.body)
      }
      else if (stmt.kind === 'switch') {
        for (const c of stmt.cases ?? []) {
          for (const s of c.body ?? []) scanVisualizer(s)
        }
      }
      else if (stmt.kind === 'try') {
        scanVisualizer(stmt.body)
        if (stmt.catchBody) scanVisualizer(stmt.catchBody)
        if (stmt.finallyBody) scanVisualizer(stmt.finallyBody)
      }
      else if (stmt.kind === 'label') {
        scanVisualizer(stmt.stmt)
      }
    }

    for (const s of userParsed.program?.body ?? []) scanVisualizer(s)

    if (errors.length) return { errors: errors.map(mapError), visualizerVertex, visualizerFragment }

    // Extract all early data in a single AST traversal
    const earlyData = extractEarlyDataFromProgram(src, userParsed.program, errors)
    if (errors.length) return { errors: errors.map(mapError) }

    // Also extract sequences and samples from prelude (for default argument mini() and record() calls)
    const preludeSequences: string[] = []
    const preludeMiniRefs: MiniSequenceRef[] = []
    const preludeMiniPlayBars: Array<number | undefined> = []
    const preludeSamples: SampleDef[] = []
    const preludeBpmResult = { bpm: undefined as number | undefined }
    const preludeVisitors = [
      createMiniSequencesVisitor('', preludeSequences, preludeMiniRefs, preludeMiniPlayBars),
      createSamplesVisitor('', preludeSamples, errors),
      createBpmVisitor('', errors, preludeBpmResult),
    ]
    walkAst(preludeKernel.program, preludeVisitors)

    const {
      bpm,
      bars,
      scale,
      sequences: userSequences,
      miniRefs: allMiniRefs,
      miniPlayBars: allMiniPlayBars,
      tramSequences,
      tramRefs,
      timelineSequences: allTimelineSequences,
      timelineRefs: allTimelineRefs,
      timelineLabels: allTimelineLabels,
      samples: allSamples,
      numberParams: allExplicitNumberParams,
      filterNumberLiterals: allLpNumberLiterals,
      numberLiterals: allNumberLiterals,
    } = earlyData

    // Use prelude BPM as default, but allow user source to override
    const finalBpm = bpm ?? preludeBpmResult.bpm

    // Combine prelude sequences/samples with user sequences/samples (prelude first so indices are stable)
    const sequences = [...preludeSequences, ...userSequences]
    const samples = [...preludeSamples, ...allSamples]

    const miniRefs = allMiniRefs
    const miniPlayBars = allMiniPlayBars
    const timelineSequences = allTimelineSequences
    const timelineRefs = allTimelineRefs
    const timelineLabels = allTimelineLabels
    const explicitNumberParams = allExplicitNumberParams
    const numberLiterals = allNumberLiterals

    // Only explicit `{min,max,...}` sliders become slider widgets.
    // Filter cutoff knobs are driven by `knob-config.ts` (via generic knob extraction),
    // so we do not auto-inject filter cutoff number literals into `numberParams`.
    const numberParams = explicitNumberParams

    // Initialize ref collections for late extraction
    let adRefs: AdRef[] = []
    let adsrRefs: AdsrRef[] = []
    let envfollowRefs: EnvfollowRef[] = []
    let slewRefs: SlewRef[] = []
    let analyserRefs: AnalyserRef[] = []
    let compressorRefs: CompressorRef[] = []
    let expanderRefs: ExpanderRef[] = []
    let gateRefs: GateRef[] = []
    let limiterRefs: LimiterRef[] = []
    let filterRefs: FilterRef[] = []
    let reverbRefs: ReverbRef[] = []
    let slicerRefs: SlicerRef[] = []
    let lfoRefs: LfoRef[] = []
    let everyRefs: EveryRef[] = []
    let atRefs: AtRef[] = []
    let euclidRefs: EuclidRef[] = []
    const sliderKeyOf = (loc: Pick<Loc, 'line' | 'column' | 'length'>) => `${loc.line}:${loc.column}:${loc.length}`
    const sliderKeys = new Set(numberParams.map(p => sliderKeyOf(p)))
    const sequenceToIndex = new Map<string, number>()
    sequences.forEach((seq, idx) => sequenceToIndex.set(seq, idx))
    tramSequences.forEach((seq, idx) => sequenceToIndex.set(seq, sequences.length + idx))
    const timelineKeyToIndex = new Map<string, number>()
    timelineSequences.forEach((s, idx) => timelineKeyToIndex.set(s.sequence, idx))
    const miniCount = sequences.length + tramSequences.length
    const sampleKeyToIndex = new Map<string, number>()
    for (const s of samples) {
      if (s.provider === 'freesound') sampleKeyToIndex.set(`freesound:${s.id}`, s.sampleIndex)
      else if (s.provider === 'record') sampleKeyToIndex.set(s.key, s.sampleIndex)
    }

    const allocAnalyserIndex = createIndexAllocator({
      start: 0,
      max: FINAL_OUT_ANALYSER_L_INDEX - 1,
      reserved: [FINAL_OUT_ANALYSER_L_INDEX, FINAL_OUT_ANALYSER_R_INDEX],
    })

    const implicitAnalyserRefs: AnalyserRef[] = []

    const allocCompressorIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocExpanderIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocGateIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocLimiterIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocFilterIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocLfoIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocReverbIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocAdIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocAdsrIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocEnvfollowIndex = createIndexAllocator({ start: 0, max: 63 })
    const allocTrigIndex = createIndexAllocator({ start: 0, max: 63 })

    const transformContext: AstTransformContext = {
      sequenceToIndex,
      timelineKeyToIndex,
      miniCount,
      sampleKeyToIndex,
      allocAnalyserIndex,
      allocCompressorIndex,
      allocExpanderIndex,
      allocGateIndex,
      allocLimiterIndex,
      allocFilterIndex,
      allocLfoIndex,
      allocReverbIndex,
      allocAdIndex,
      allocAdsrIndex,
      allocEnvfollowIndex,
      allocTrigIndex,
      implicitAnalyserRefs,
      isVisualizerAssign,
    }

    transformedUserBodyScratch.length = 0
    for (const s of userParsed.program?.body ?? []) {
      const t = transformStmt(transformContext, s)
      if (t) transformedUserBodyScratch.push(t)
    }

    transformedBodyScratch.length = 0
    for (const s of preludeKernel.program?.body ?? []) {
      const t = transformStmt(transformContext, s)
      if (t) transformedBodyScratch.push(t)
    }
    for (const s of transformedUserBodyScratch) transformedBodyScratch.push(s)
    for (const s of postludeKernel.program?.body ?? []) {
      const t = transformStmt(transformContext, s)
      if (t) transformedBodyScratch.push(t)
    }

    const transformedProgram: Program = {
      kind: 'program',
      loc: { line: 0, column: 0, length: 0, kernel: true },
      body: transformedBodyScratch,
    } as any

    const undefinedVarErrors = checkUndefinedVariableErrors(src, transformedProgram)
      .filter(e => e.line > 0)
    errors.push(...undefinedVarErrors)
    if (errors.length) return { errors: errors.map(mapError) }
    // Extract all references in a single AST traversal
    const nonKernelProgram = { ...transformedProgram, body: transformedUserBodyScratch } as any
    const extractionResults = extractAllRefsFromProgram(src, nonKernelProgram)

    adRefs = extractionResults.adRefs
    adsrRefs = extractionResults.adsrRefs
    envfollowRefs = extractionResults.envfollowRefs
    slewRefs = extractionResults.slewRefs
    // Merge explicit and implicit analyser refs, deduplicating by index (in case saturation causes overlaps).
    const seenAnalyserIndices = new Set<number>()
    const allAnalyserRefs = [...extractionResults.analyserRefs, ...implicitAnalyserRefs.filter(r => !r.loc?.kernel)]
    analyserRefs = allAnalyserRefs.filter(ref => {
      if (seenAnalyserIndices.has(ref.analyserIndex)) return false
      seenAnalyserIndices.add(ref.analyserIndex)
      return true
    })
    compressorRefs = extractionResults.compressorRefs
    expanderRefs = extractionResults.expanderRefs
    gateRefs = extractionResults.gateRefs
    limiterRefs = extractionResults.limiterRefs
    filterRefs = extractionResults.filterRefs
    reverbRefs = extractionResults.reverbRefs
    slicerRefs = extractionResults.slicerRefs
    lfoRefs = extractionResults.lfoRefs
    everyRefs = extractionResults.everyRefs
    atRefs = extractionResults.atRefs
    euclidRefs = extractionResults.euclidRefs
    const compiled = compile(src, transformedProgram)
    errors.push(...compiled.errors)
    if (errors.length) return { errors: errors.map(mapError) }
    const chunk = compiled.chunk
    const arrayLiterals: ArrayLiteralRef[] = []
    const branchMarks: BranchMarkRef[] = []

    const syms = new Map<string, number>()
    let nextSym = 1000
    const symOf = (s: string) => {
      const b = builtinSyms[s]
      if (b !== undefined) return b
      const prev = syms.get(s)
      if (prev !== undefined) return prev
      const id = nextSym++
      syms.set(s, id)
      return id
    }

    let litCount = 0
    const litIndexByValue = new Map<number, number>()
    const litIndexByLocKey = new Map<string, number>()
    const locKeyToLiteralIndex = new Map<string, number>()

    const allocLit = () => litCount++

    const litOfValue = (v: number) => {
      const prev = litIndexByValue.get(v)
      if (prev !== undefined) return prev
      if (litCount >= target.literals.length) {
        errors.push(encoderError(src, `Too many number literals (max ${target.literals.length})`))
        return 0
      }
      const idx = allocLit()
      litIndexByValue.set(v, idx)
      return idx
    }

    const litOfLocKey = (key: string, value: number) => {
      const prev = litIndexByLocKey.get(key)
      // Only reuse the cached index if the value matches (kernel code at line 0
      // can have the same column across different function bodies with different values)
      if (prev !== undefined && target.literals[prev] === value) return prev
      // Each unique location gets its own literal index so literal-only updates
      // don't accidentally overwrite other locations with the same value
      if (litCount >= target.literals.length) {
        errors.push(encoderError(src, `Too many number literals (max ${target.literals.length})`))
        return 0
      }
      const idx = allocLit()
      litIndexByLocKey.set(key, idx)
      return idx
    }

    target.ops.fill(0)
    target.literals.fill(0)
    target.ops[0] = VM_MAGIC

    const funcOffsets = new Map<object, number>()
    const funcPatches: { at: number; fn: object }[] = []
    const funcQueue: object[] = []

    const vmFuncHeader = -2

    const encodeChunkCtx: VmEncodeChunkCtx = {
      src,
      errors,
      ops: target.ops,
      literals: target.literals,
      symOf,
      sliderKeyOf,
      sliderKeys,
      litOfValue,
      litOfLocKey,
      locKeyToLiteralIndex,
      arrayLiterals,
      branchMarks,
      funcPatches,
      funcQueue,
    }

    // Encode main chunk at pc=1
    let writePc = 1
    const main = encodeChunkVm(encodeChunkCtx, chunk as any, writePc)
    writePc = main.writtenEnd

    // Terminate the main program before encoding function bodies. Function bodies
    // are stored inline after the main chunk and referenced by absolute pc via
    // `VmOp.Func`; executing into them would desync the VM pc (their header is not
    // a normal opcode).
    target.ops[writePc++] = VmOp.End

    // Encode functions (BFS), patching FUNC placeholders to absolute pcs.
    for (let qi = 0; qi < funcQueue.length; qi++) {
      const fn: any = funcQueue[qi]
      if (funcOffsets.has(fn)) continue

      const funcPc = writePc
      funcOffsets.set(fn, funcPc)

      const params = fn.params as { name: string; isRest: boolean }[]
      target.ops[writePc++] = vmFuncHeader
      target.ops[writePc++] = params.length
      for (const p of params) {
        target.ops[writePc++] = symOf(p.name)
      }

      const body = encodeChunkVm(encodeChunkCtx, fn.chunk as any, writePc)
      writePc = body.writtenEnd

      // Ensure function returns something
      target.ops[writePc++] = VmOp.PushUndef
      target.ops[writePc++] = VmOp.Return
    }

    for (const p of funcPatches) {
      const off = funcOffsets.get(p.fn)
      if (off === undefined) {
        errors.push(encoderError(src, 'Unpatched function offset'))
        target.ops[p.at] = 0
      }
      else {
        target.ops[p.at] = off
      }
    }

    const timelineRefsMapped = timelineRefs.map(r => ({ ...r, seqIndex: miniCount + r.seqIndex }))
    const numberParamsWithLiteralIndex = numberParams.map(p => ({
      ...p,
      literalIndex: locKeyToLiteralIndex.get(sliderKeyOf(p)),
    }))
    const numberLiteralsWithLiteralIndex = numberLiterals.map(p => ({
      ...p,
      literalIndex: locKeyToLiteralIndex.get(sliderKeyOf(p)),
    }))

    const filteredArrayLiterals = arrayLiterals.filter(a => !a.loc.kernel && a.loc.line > 0)
    const filteredBranchMarks = branchMarks.filter(m => !m.loc.kernel && m.loc.line > 0)

    return errors.length
      ? {
        errors: errors.map(mapError),
        visualizerVertex,
        visualizerFragment,
        bpm,
        bars,
        scale,
        miniSequences: sequences,
        miniRefs: miniRefs,
        miniPlayBars,
        tramSequences,
        tramRefs,
        timelineSequences,
        timelineRefs: timelineRefsMapped,
        timelineLabels,
        adRefs,
        adsrRefs,
        envfollowRefs,
        slewRefs,
        analyserRefs,
        compressorRefs,
        expanderRefs,
        gateRefs,
        limiterRefs,
        filterRefs,
        reverbRefs,
        slicerRefs,
        lfoRefs,
        everyRefs,
        atRefs,
        euclidRefs,
        arrayLiterals: filteredArrayLiterals,
        branchMarks: filteredBranchMarks,
        numberParams: numberParamsWithLiteralIndex,
        numberLiterals: numberLiteralsWithLiteralIndex,
        sampleDefs: samples,
      }
      : {
        errors: [],
        visualizerVertex,
        visualizerFragment,
        bpm: finalBpm,
        bars,
        scale,
        miniSequences: sequences,
        miniRefs: miniRefs,
        miniPlayBars,
        tramSequences,
        tramRefs,
        timelineSequences,
        timelineRefs: timelineRefsMapped,
        timelineLabels,
        adRefs,
        adsrRefs,
        envfollowRefs,
        slewRefs,
        analyserRefs,
        compressorRefs,
        expanderRefs,
        gateRefs,
        limiterRefs,
        filterRefs,
        reverbRefs,
        slicerRefs,
        lfoRefs,
        everyRefs,
        atRefs,
        euclidRefs,
        arrayLiterals: filteredArrayLiterals,
        branchMarks: filteredBranchMarks,
        numberParams: numberParamsWithLiteralIndex,
        numberLiterals: numberLiteralsWithLiteralIndex,
        sampleDefs: samples,
      }
  }
  catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { errors: [mapError(encoderError(src, message))] }
  }
}
