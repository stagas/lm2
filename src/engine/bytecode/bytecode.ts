import { SEQ_VOICES } from '../../../as/assembly/constants.ts'
import { Op, SeqOp } from '../../../as/assembly/shared.ts'
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
  createCompressorVisitor,
} from './extract-compressors.ts'
import {
  createFilterNumberLiteralsVisitor,
  createFiltersVisitor,
} from './extract-filter.ts'
import {
  createFreeverbVisitor,
} from './extract-freeverb.ts'
import {
  createAdVisitor,
} from './extract-ad.ts'
import {
  createAdsrVisitor,
} from './extract-adsr.ts'
import {
  createLfoVisitor,
} from './extract-lfo.ts'
import {
  createLimiterVisitor,
} from './extract-limiters.ts'
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
  createAtVisitor,
  createEuclidVisitor,
  createEveryVisitor,
} from './extract-trigs.ts'
import { binaryCode, encoderError, tryEvalConstNumber, unaryCode } from './helpers.ts'
import { POSTLUDE, PRELUDE } from './prelude.ts'
import {
  AnalyserRef,
  ArrayLiteralRef,
  AtRef,
  BranchMarkRef,
  CompressorRef,
  type EuclidRef,
  EveryRef,
  type FilterRef,
  type FreeverbRef,
  LfoRef,
  type LimiterRef,
  type MiniSequenceRef,
  type NumberLiteralInfo,
  type NumberWithParamsInfo,
  type SampleDef,
  SlicerRef,
  type TimelineLabel,
  type TimelineSequenceDef,
  type TimelineSequenceRef,
  VM_MAGIC,
  VmOp,
  VmTarget,
} from './types.ts'

export * from './builtin-syms.ts'
export * from './extract-analysers.ts'
export * from './extract-bpm-bars.ts'
export * from './extract-compressors.ts'
export * from './extract-filter.ts'
export * from './extract-lfo.ts'
export * from './extract-mini.ts'
export * from './extract-numbers.ts'
export * from './extract-samples.ts'
export * from './extract-scale.ts'
export * from './extract-slicers.ts'
export * from './extract-timeline-labels.ts'
export * from './extract-timeline-sequences.ts'
export * from './extract-trigs.ts'
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

function extractEarlyDataFromProgram(src: string, program: Program, errors: LangError[]) {
  // Initialize result collections
  const sequences: string[] = []
  const miniRefs: MiniSequenceRef[] = []
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
    createMiniSequencesVisitor(src, sequences, miniRefs),
    createTimelineSequencesVisitor(src, timelineSequences, timelineRefs),
    createTimelineLabelsVisitor(timelineLabels),
    createSamplesVisitor(src, samples, errors),
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
  const compressorRefs: CompressorRef[] = []
  const limiterRefs: LimiterRef[] = []
  const filterRefs: FilterRef[] = []
  const adRefs: AdRef[] = []
  const adsrRefs: AdsrRef[] = []
  const freeverbRefs: FreeverbRef[] = []
  const slicerRefs: SlicerRef[] = []
  const lfoRefs: LfoRef[] = []
  const everyRefs: EveryRef[] = []
  const atRefs: AtRef[] = []
  const euclidRefs: EuclidRef[] = []

  // Create all visitor instances
  const visitors = [
    createAdVisitor(src, adRefs),
    createAdsrVisitor(src, adsrRefs),
    createAnalyserVisitor(analyserRefs),
    createCompressorVisitor(src, compressorRefs),
    createLimiterVisitor(src, limiterRefs),
    createFiltersVisitor(src, filterRefs),
    createFreeverbVisitor(src, freeverbRefs),
    createSlicersVisitor(src, slicerRefs),
    createLfoVisitor(src, lfoRefs),
    createEveryVisitor(everyRefs),
    createAtVisitor(atRefs),
    createEuclidVisitor(euclidRefs),
  ]

  // Run all visitors in a single AST traversal
  walkAst(program, visitors, { src })

  return {
    adRefs,
    adsrRefs,
    analyserRefs,
    compressorRefs,
    limiterRefs,
    filterRefs,
    freeverbRefs,
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
  timelineSequences: TimelineSequenceDef[]
  timelineRefs: TimelineSequenceRef[]
  timelineLabels: TimelineLabel[]
  samples: SampleDef[]
  numberParams: NumberWithParamsInfo[]
  filterNumberLiterals: NumberWithParamsInfo[]
  numberLiterals: NumberLiteralInfo[]
  errors: LangError[]
} {
  const lexed = lex(src)
  const parsed = parse(src, lexed.tokens)
  const errors: LangError[] = [...lexed.errors, ...parsed.errors]
  if (errors.length) {
    return {
      bpm: undefined,
      bars: undefined,
      scale: undefined,
      sequences: [],
      miniRefs: [],
      timelineSequences: [],
      timelineRefs: [],
      timelineLabels: [],
      samples: [],
      numberParams: [],
      filterNumberLiterals: [],
      numberLiterals: [],
      errors,
    }
  }

  const earlyData = extractEarlyDataFromProgram(src, parsed.program, errors)
  return { ...earlyData, errors: [] }
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
  timelineSequences?: TimelineSequenceDef[]
  timelineRefs?: TimelineSequenceRef[]
  timelineLabels?: TimelineLabel[]
  adRefs?: AdRef[]
  adsrRefs?: AdsrRef[]
  analyserRefs?: AnalyserRef[]
  compressorRefs?: CompressorRef[]
  limiterRefs?: LimiterRef[]
  filterRefs?: FilterRef[]
  freeverbRefs?: FreeverbRef[]
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
  const normalizePrelude = (s: string): string => {
    const t = s.trimEnd()
    if (!t) return ''
    const last = t[t.length - 1]
    const withSep = last === ';' || last === '}' ? t : `${t};`
    return withSep.endsWith('\n') ? withSep : `${withSep}\n`
  }

  const countNewlines = (s: string): number => {
    let n = 0
    for (let i = 0; i < s.length; i++) if (s[i] === '\n') n++
    return n
  }

  const p = normalizePrelude(prelude)
  const pLines = countNewlines(p)
  const po = normalizePrelude(postlude)
  const fullSrc = `${p}${src}${po}`

  const mapToken = (t: Token): Token => {
    const line = t.line - pLines
    if (line <= 0) return { ...t, line, column: 0 }
    return { ...t, line }
  }

  const mapLexError = (e: LexError): LangError => {
    const line = e.line - pLines
    if (line <= 0) return { ...e, line, column: 0, code: '' }
    return { ...e, line, code: lineText(src, line) }
  }

  const lexed = lex(fullSrc)
  const tokens = lexed.tokens.map(mapToken)
  const lexErrors: LangError[] = lexed.errors.map(mapLexError)
  const parsed = parse(src, tokens)
  const errors: LangError[] = [...lexErrors, ...parsed.errors]

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

  for (const s of parsed.program?.body ?? []) scanVisualizer(s)

  if (errors.length) return { errors, visualizerVertex, visualizerFragment }

  // Extract all early data in a single AST traversal
  const earlyData = extractEarlyDataFromProgram(src, parsed.program, errors)
  if (errors.length) return { errors }

  const {
    bpm,
    bars,
    scale,
    sequences,
    miniRefs,
    timelineSequences,
    timelineRefs,
    timelineLabels,
    samples,
    numberParams: explicitNumberParams,
    filterNumberLiterals: lpNumberLiterals,
    numberLiterals,
  } = earlyData

  // Create a set of locations that already have explicit sliders
  const explicitSliderKeys = new Set(explicitNumberParams.map(p => `${p.line}:${p.column}:${p.length}`))

  // Filter out lp number literals that already have explicit sliders
  const filteredLpNumberLiterals = lpNumberLiterals.filter(p =>
    !explicitSliderKeys.has(`${p.line}:${p.column}:${p.length}`)
  )

  const numberParams = [...explicitNumberParams, ...filteredLpNumberLiterals]

  // Initialize ref collections for late extraction
  let adRefs: AdRef[] = []
  let adsrRefs: AdsrRef[] = []
  let analyserRefs: AnalyserRef[] = []
  let compressorRefs: CompressorRef[] = []
  let limiterRefs: LimiterRef[] = []
  let filterRefs: FilterRef[] = []
  let freeverbRefs: FreeverbRef[] = []
  let slicerRefs: SlicerRef[] = []
  let lfoRefs: LfoRef[] = []
  let everyRefs: EveryRef[] = []
  let atRefs: AtRef[] = []
  let euclidRefs: EuclidRef[] = []
  const sliderKeyOf = (loc: Pick<Loc, 'line' | 'column' | 'length'>) => `${loc.line}:${loc.column}:${loc.length}`
  const sliderKeys = new Set(numberParams.map(p => sliderKeyOf(p)))
  const sequenceToIndex = new Map<string, number>()
  sequences.forEach((seq, idx) => sequenceToIndex.set(seq, idx))
  const timelineKeyToIndex = new Map<string, number>()
  timelineSequences.forEach((s, idx) => timelineKeyToIndex.set(s.sequence, idx))
  const miniCount = sequences.length
  const sampleKeyToIndex = new Map<string, number>()
  for (const s of samples) {
    sampleKeyToIndex.set(`freesound:${s.id}`, s.sampleIndex)
  }

  const toSeqIndexExpr = (loc: Loc, idx: number) => ({ kind: 'number', value: idx, raw: String(idx), loc }) as any

  const MAX_ANALYSER_INDEX = 63
  const clampAnalyserIndex = (n: number) => Math.max(0, Math.min(MAX_ANALYSER_INDEX, Math.floor(Number(n || 0))))

  const usedAnalyserIndices = new Set<number>([0])
  let nextAnalyserIndex = 1
  const allocAnalyserIndex = (): number => {
    if (nextAnalyserIndex > MAX_ANALYSER_INDEX) return MAX_ANALYSER_INDEX
    while (usedAnalyserIndices.has(nextAnalyserIndex) && nextAnalyserIndex < MAX_ANALYSER_INDEX) nextAnalyserIndex++
    const idx = nextAnalyserIndex
    usedAnalyserIndices.add(idx)
    nextAnalyserIndex = Math.min(MAX_ANALYSER_INDEX, idx + 1)
    return idx
  }

  const MAX_COMPRESSOR_INDEX = 63
  const clampCompressorIndex = (n: number) => Math.max(0, Math.min(MAX_COMPRESSOR_INDEX, Math.floor(Number(n || 0))))
  const usedCompressorIndices = new Set<number>([0])
  let nextCompressorIndex = 1
  const allocCompressorIndex = (): number => {
    if (nextCompressorIndex > MAX_COMPRESSOR_INDEX) return MAX_COMPRESSOR_INDEX
    while (usedCompressorIndices.has(nextCompressorIndex) && nextCompressorIndex < MAX_COMPRESSOR_INDEX) {
      nextCompressorIndex++
    }
    const idx = nextCompressorIndex
    usedCompressorIndices.add(idx)
    nextCompressorIndex = Math.min(MAX_COMPRESSOR_INDEX, idx + 1)
    return idx
  }

  const MAX_LIMITER_INDEX = 63
  const clampLimiterIndex = (n: number) => Math.max(0, Math.min(MAX_LIMITER_INDEX, Math.floor(Number(n || 0))))
  const usedLimiterIndices = new Set<number>([0])
  let nextLimiterIndex = 1
  const allocLimiterIndex = (): number => {
    if (nextLimiterIndex > MAX_LIMITER_INDEX) return MAX_LIMITER_INDEX
    while (usedLimiterIndices.has(nextLimiterIndex) && nextLimiterIndex < MAX_LIMITER_INDEX) nextLimiterIndex++
    const idx = nextLimiterIndex
    usedLimiterIndices.add(idx)
    nextLimiterIndex = Math.min(MAX_LIMITER_INDEX, idx + 1)
    return idx
  }

  const MAX_FILTER_INDEX = 63
  const clampFilterIndex = (n: number) => Math.max(0, Math.min(MAX_FILTER_INDEX, Math.floor(Number(n || 0))))
  const usedFilterIndices = new Set<number>([0])
  let nextFilterIndex = 1
  const allocFilterIndex = (): number => {
    if (nextFilterIndex > MAX_FILTER_INDEX) return MAX_FILTER_INDEX
    while (usedFilterIndices.has(nextFilterIndex) && nextFilterIndex < MAX_FILTER_INDEX) nextFilterIndex++
    const idx = nextFilterIndex
    usedFilterIndices.add(idx)
    nextFilterIndex = Math.min(MAX_FILTER_INDEX, idx + 1)
    return idx
  }

  const MAX_LFO_INDEX = 63
  const clampLfoIndex = (n: number) => Math.max(0, Math.min(MAX_LFO_INDEX, Math.floor(Number(n || 0))))
  const usedLfoIndices = new Set<number>([0])
  let nextLfoIndex = 1
  const allocLfoIndex = (): number => {
    if (nextLfoIndex > MAX_LFO_INDEX) return MAX_LFO_INDEX
    while (usedLfoIndices.has(nextLfoIndex) && nextLfoIndex < MAX_LFO_INDEX) nextLfoIndex++
    const idx = nextLfoIndex
    usedLfoIndices.add(idx)
    nextLfoIndex = Math.min(MAX_LFO_INDEX, idx + 1)
    return idx
  }

  const MAX_FREEVERB_INDEX = 63
  let nextFreeverbIndex = 0
  const allocFreeverbIndex = (): number => {
    const idx = Math.min(MAX_FREEVERB_INDEX, nextFreeverbIndex)
    nextFreeverbIndex++
    return idx
  }

  const MAX_AD_INDEX = 63
  const clampAdIndex = (n: number) => Math.max(0, Math.min(MAX_AD_INDEX, Math.floor(Number(n || 0))))

  const MAX_ADSR_INDEX = 63
  const clampAdsrIndex = (n: number) => Math.max(0, Math.min(MAX_ADSR_INDEX, Math.floor(Number(n || 0))))

  const MAX_TRIG_INDEX = 255
  const clampTrigIndex = (n: number) => Math.max(0, Math.min(MAX_TRIG_INDEX, Math.floor(Number(n || 0))))

  const usedAdIndices = new Set<number>()
  let nextAdIndex = 0
  const allocAdIndex = (): number => {
    if (nextAdIndex > MAX_AD_INDEX) return MAX_AD_INDEX
    while (usedAdIndices.has(nextAdIndex) && nextAdIndex < MAX_AD_INDEX) nextAdIndex++
    const idx = nextAdIndex
    usedAdIndices.add(idx)
    nextAdIndex = Math.min(MAX_AD_INDEX, idx + 1)
    return idx
  }

  const usedAdsrIndices = new Set<number>()
  let nextAdsrIndex = 0
  const allocAdsrIndex = (): number => {
    if (nextAdsrIndex > MAX_ADSR_INDEX) return MAX_ADSR_INDEX
    while (usedAdsrIndices.has(nextAdsrIndex) && nextAdsrIndex < MAX_ADSR_INDEX) nextAdsrIndex++
    const idx = nextAdsrIndex
    usedAdsrIndices.add(idx)
    nextAdsrIndex = Math.min(MAX_ADSR_INDEX, idx + 1)
    return idx
  }

  const usedEveryIndices = new Set<number>([0])
  let nextEveryIndex = 1
  const allocEveryIndex = (): number => {
    if (nextEveryIndex > MAX_TRIG_INDEX) return MAX_TRIG_INDEX
    while (usedEveryIndices.has(nextEveryIndex) && nextEveryIndex < MAX_TRIG_INDEX) nextEveryIndex++
    const idx = nextEveryIndex
    usedEveryIndices.add(idx)
    nextEveryIndex = Math.min(MAX_TRIG_INDEX, idx + 1)
    return idx
  }

  const usedAtIndices = new Set<number>([0])
  let nextAtIndex = 1
  const allocAtIndex = (): number => {
    if (nextAtIndex > MAX_TRIG_INDEX) return MAX_TRIG_INDEX
    while (usedAtIndices.has(nextAtIndex) && nextAtIndex < MAX_TRIG_INDEX) nextAtIndex++
    const idx = nextAtIndex
    usedAtIndices.add(idx)
    nextAtIndex = Math.min(MAX_TRIG_INDEX, idx + 1)
    return idx
  }

  const transformExpr = (expr: any): any => {
    if (!expr) return expr

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

        const chordMatch = raw.match(/^([ivxlcdm]+)(.*)$/i)
        if (chordMatch) {
          const roman = chordMatch[1]
          const suffix = chordMatch[2] ?? ''
          const base = romanToDegree(roman)
          if (base !== null) {
            const tones = parseChordSuffix(suffix)
            const numLoc = (dx: number): Loc =>
              dx === 0 ? expr.loc : { ...expr.loc, line: 0, column: expr.loc.column + dx }

            const items = tones.map((tone, idx) => {
              const scaleDegree = base + tone.degree
              const args: any[] = [{
                kind: 'pos',
                value: { kind: 'number', value: scaleDegree, raw: String(scaleDegree), loc: numLoc(idx) },
                loc: expr.loc,
              }]

              if (tone.semitoneAdjust !== 0) {
                args.push({
                  kind: 'pos',
                  value: { kind: 'number', value: tone.semitoneAdjust, raw: String(tone.semitoneAdjust),
                    loc: numLoc(idx) },
                  loc: expr.loc,
                })
              }

              return {
                kind: 'call',
                callee: { kind: 'ident', name: 'degree', loc: expr.loc },
                args,
                loc: expr.loc,
              }
            })

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
      const freeverbIndex = preCalleeName === 'freeverb' ? allocFreeverbIndex() : null

      const callee = transformExpr(expr.callee)
      let args = (expr.args ?? []).map((a: any) => {
        if (a.kind === 'pos' || a.kind === 'named') return { ...a, value: transformExpr(a.value) }
        return a
      })

      if (freeverbIndex !== null) {
        args = args.filter((a: any) => !(a.kind === 'named' && a.name === 'index'))
        args = [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, freeverbIndex), loc: expr.loc }]
      }

      const calleeName = callee?.kind === 'ident' ? callee.name : null

      const isMini = calleeName === 'mini'
      const isPlay = calleeName === 'play'
      const isTimeline = calleeName === 'timeline'
      const isAd = calleeName === 'ad'
      const isAdsr = calleeName === 'adsr'
      const isAnalyser = calleeName === 'analyser'
      const isCompressor = calleeName === 'compressor'
      const isLimiter = calleeName === 'limiter'
      const isFilter = calleeName === 'lp'
        || calleeName === 'hp'
        || calleeName === 'bp'
        || calleeName === 'bs'
        || calleeName === 'ls'
        || calleeName === 'hs'
        || calleeName === 'peak'
        || calleeName === 'ap'
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

      if (isLabel) {
        return { kind: 'undefined', loc: expr.loc }
      }

      if (isFreesound) {
        const idArg = args.find((a: any) => a.kind === 'named' && a.name === 'id')
          ?? args.find((a: any) => a.kind === 'pos')
        const idExpr = idArg?.kind === 'pos' || idArg?.kind === 'named' ? idArg.value : null
        const id = tryEvalConstNumber(idExpr)
        if (id != null && Number.isFinite(id) && Number.isInteger(id) && id >= 0) {
          const idx = sampleKeyToIndex.get(`freesound:${id}`)
          if (idx !== undefined) return toSeqIndexExpr(expr.loc, idx)
        }
        return { kind: 'undefined', loc: expr.loc }
      }

      if (isAd) {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampAdIndex(Number(idxVal.value ?? 0))
          usedAdIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocAdIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (isAdsr) {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampAdsrIndex(Number(idxVal.value ?? 0))
          usedAdsrIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocAdsrIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (isAnalyser) {
        const posArgs = args.filter((a: any) => a.kind === 'pos')
        const idxArg = posArgs.length >= 2 ? posArgs[1] : null
        const idxVal = idxArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampAnalyserIndex(Number(idxVal.value ?? 0))
          usedAnalyserIndices.add(idx)
          idxArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (posArgs.length === 1) {
          const idx = allocAnalyserIndex()
          return { ...expr, callee, args: [...args, { kind: 'pos', value: toSeqIndexExpr(expr.loc, idx) }] }
        }
      }

      if (isCompressor) {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampCompressorIndex(Number(idxVal.value ?? 0))
          usedCompressorIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocCompressorIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (isLimiter) {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampLimiterIndex(Number(idxVal.value ?? 0))
          usedLimiterIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocLimiterIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (isFilter) {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampFilterIndex(Number(idxVal.value ?? 0))
          usedFilterIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocFilterIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (isLfo) {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampLfoIndex(Number(idxVal.value ?? 0))
          usedLfoIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocLfoIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (calleeName === 'every') {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampTrigIndex(Number(idxVal.value ?? 0))
          usedEveryIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocEveryIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (calleeName === 'at') {
        const namedIndexArg = args.find((a: any) => a.kind === 'named' && a.name === 'index') ?? null
        const idxVal = namedIndexArg?.value

        if (idxVal?.kind === 'number') {
          const idx = clampTrigIndex(Number(idxVal.value ?? 0))
          usedAtIndices.add(idx)
          namedIndexArg.value = toSeqIndexExpr(idxVal.loc ?? expr.loc, idx)
          return { ...expr, callee, args }
        }

        if (!namedIndexArg) {
          const idx = allocAtIndex()
          return {
            ...expr,
            callee,
            args: [...args, { kind: 'named', name: 'index', value: toSeqIndexExpr(expr.loc, idx), loc: expr.loc }],
          }
        }
      }

      if (isOut) {
        const posArgs = args.filter((a: any) => a.kind === 'pos')
        const audioArg = posArgs[0]
        const audioExpr = audioArg?.value
        const audioCalleeName = audioExpr?.kind === 'call' && audioExpr.callee?.kind === 'ident'
          ? audioExpr.callee.name
          : null

        // If the signal is already analysed (common: `... |> analyser(%) |> out(%)`), don't wrap again.
        if (audioArg?.kind === 'pos' && audioExpr && audioCalleeName !== 'analyser') {
          const idx = allocAnalyserIndex()
          const analyserCall = {
            kind: 'call',
            callee: { kind: 'ident', name: 'analyser', loc: expr.callee?.loc ?? expr.loc },
            args: [
              { kind: 'pos', value: audioExpr },
              { kind: 'pos', value: toSeqIndexExpr(expr.loc, idx) },
            ],
            loc: expr.loc,
          }
          const args2 = args.map((a: any) => a === audioArg ? { ...a, value: analyserCall } : a)
          return { ...expr, callee, args: args2 }
        }
      }

      if (isMini || isPlay) {
        // Find "seq" argument (positional #0 or named seq:)
        const seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? args.find((a: any) => a.kind === 'pos') // first positional

        if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
          const v = seqArg.value
          if (v?.kind === 'string') {
            const idx = sequenceToIndex.get(String(v.value ?? ''))
            if (idx !== undefined) {
              seqArg.value = toSeqIndexExpr(v.loc, idx)
            }
          }
        }

        // Strip compile-time-only mini(seq, color?) arg so runtime sees mini(seq[, cb]).
        const argsNoColor = (() => {
          const namedColor = args.find((a: any) => a.kind === 'named' && a.name === 'color')
          if (namedColor) return args.filter((a: any) => a !== namedColor)

          const posArgs = args.filter((a: any) => a.kind === 'pos')
          const secondPos = posArgs[1]
          const thirdPos = posArgs[2]
          if (secondPos?.value?.kind === 'string') {
            return args.filter((a: any) => a !== secondPos)
          }
          if (thirdPos?.value?.kind === 'string') {
            return args.filter((a: any) => a !== thirdPos)
          }
          return args
        })()

        const seqArg2 = argsNoColor.find((a: any) => a.kind === 'named' && a.name === 'seq')
          ?? argsNoColor.find((a: any) => a.kind === 'pos')

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

      if (isTimeline) {
        const posArgs = args.filter((a: any) => a.kind === 'pos')
        let seqArg = args.find((a: any) => a.kind === 'named' && a.name === 'seq') ?? null
        if (!seqArg) {
          for (let i = 0; i < posArgs.length; i++) {
            const v = posArgs[i]?.value
            if (v?.kind === 'string') {
              seqArg = posArgs[i]
              break
            }
          }
        }
        if (!seqArg) seqArg = posArgs.length >= 2 ? posArgs[1] : posArgs[0]
        if (seqArg?.kind === 'pos' || seqArg?.kind === 'named') {
          const v = seqArg.value
          if (v?.kind === 'string') {
            const key = String(v.value ?? '')
            const idx = timelineKeyToIndex.get(key)
            if (idx !== undefined) {
              seqArg.value = toSeqIndexExpr(v.loc, miniCount + idx)
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
      return { ...expr, left: transformExpr(expr.left), right: transformExpr(expr.right) }
    }

    if (expr.kind === 'assign') {
      if (expr.op === '=' && expr.target?.kind === 'ident' && expr.target.name === 'scale') {
        const v = expr.value
        const name = v?.kind === 'string' ? String(v.value ?? '') : v?.kind === 'ident' ? String(v.name ?? '') : ''
        if (name) {
          const idx = findScaleIndex(name) ?? findScaleIndex(name.toLowerCase()) ?? 0
          return { ...expr, target: transformExpr(expr.target),
            value: { kind: 'number', value: idx, raw: String(idx), loc: v?.loc ?? expr.loc } }
        }
      }
      return { ...expr, target: transformExpr(expr.target), value: transformExpr(expr.value) }
    }

    if (expr.kind === 'unary' || expr.kind === 'postfix') {
      return { ...expr, expr: transformExpr(expr.expr) }
    }

    if (expr.kind === 'member') {
      const out: any = { ...expr, object: transformExpr(expr.object) }
      if (expr.computed) out.index = transformExpr(expr.index)
      return out
    }

    if (expr.kind === 'array') {
      return { ...expr, items: (expr.items ?? []).map(transformExpr) }
    }

    if (expr.kind === 'object') {
      return { ...expr, props: (expr.props ?? []).map((p: any) => ({ ...p, value: transformExpr(p.value) })) }
    }

    if (expr.kind === 'if') {
      const thenPart = expr.then?.kind === 'block' ? transformStmt(expr.then) : transformExpr(expr.then)
      const elsePart = expr.else?.kind === 'block' ? transformStmt(expr.else) : transformExpr(expr.else)
      return { ...expr, test: transformExpr(expr.test), then: thenPart, else: elsePart }
    }

    if (expr.kind === 'func') {
      const body = expr.body?.kind === 'block' ? transformStmt(expr.body) : transformExpr(expr.body)
      return { ...expr, body }
    }

    return expr
  }

  const transformStmt = (stmt: any): any => {
    if (!stmt) return stmt
    if (stmt.kind === 'expr_stmt') {
      if (isVisualizerAssign(stmt)) return null
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
      return { ...stmt, expr: transformExpr(stmt.expr) }
    }
    if (stmt.kind === 'block') return { ...stmt, body: (stmt.body ?? []).map(transformStmt).filter(Boolean) }
    if (stmt.kind === 'for') {
      if (stmt.head?.kind === 'c_style') {
        return {
          ...stmt,
          head: {
            ...stmt.head,
            init: stmt.head.init ? transformExpr(stmt.head.init) : undefined,
            test: stmt.head.test ? transformExpr(stmt.head.test) : undefined,
            update: stmt.head.update ? transformExpr(stmt.head.update) : undefined,
          },
          body: transformStmt(stmt.body),
        }
      }
      return { ...stmt, head: { ...stmt.head, iterable: transformExpr(stmt.head.iterable) },
        body: transformStmt(stmt.body) }
    }
    if (stmt.kind === 'while' || stmt.kind === 'do_while') {
      return { ...stmt, test: transformExpr(stmt.test), body: transformStmt(stmt.body) }
    }
    if (stmt.kind === 'switch') {
      return {
        ...stmt,
        test: transformExpr(stmt.test),
        cases: (stmt.cases ?? []).map((c: any) => ({
          ...c,
          test: c.test ? transformExpr(c.test) : undefined,
          body: (c.body ?? []).map(transformStmt).filter(Boolean),
        })),
      }
    }
    if (stmt.kind === 'try') {
      return {
        ...stmt,
        body: transformStmt(stmt.body),
        catchBody: stmt.catchBody ? transformStmt(stmt.catchBody) : undefined,
        finallyBody: stmt.finallyBody ? transformStmt(stmt.finallyBody) : undefined,
      }
    }
    if (stmt.kind === 'throw') return { ...stmt, value: transformExpr(stmt.value) }
    if (stmt.kind === 'return') return { ...stmt, value: stmt.value ? transformExpr(stmt.value) : undefined }
    if (stmt.kind === 'label') return { ...stmt, stmt: transformStmt(stmt.stmt) }
    if (stmt.kind === 'destructure') return { ...stmt, value: transformExpr(stmt.value) }
    return stmt
  }

  const transformedProgram = { ...parsed.program, body: parsed.program.body.map(transformStmt).filter(Boolean) } as any
  errors.push(...checkUndefinedVariableErrors(src, transformedProgram))
  if (errors.length) return { errors }
  // Extract all references in a single AST traversal
  const extractionResults = extractAllRefsFromProgram(src, transformedProgram)
  adRefs = extractionResults.adRefs
  adsrRefs = extractionResults.adsrRefs
  analyserRefs = extractionResults.analyserRefs
  compressorRefs = extractionResults.compressorRefs
  limiterRefs = extractionResults.limiterRefs
  filterRefs = extractionResults.filterRefs
  freeverbRefs = extractionResults.freeverbRefs
  slicerRefs = extractionResults.slicerRefs
  lfoRefs = extractionResults.lfoRefs
  everyRefs = extractionResults.everyRefs
  atRefs = extractionResults.atRefs
  euclidRefs = extractionResults.euclidRefs
  const compiled = compile(src, transformedProgram)
  errors.push(...compiled.errors)
  if (errors.length) return { errors }
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

  const litOfLocKey = (key: string) => {
    const prev = litIndexByLocKey.get(key)
    if (prev !== undefined) return prev
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

  const encodeChunk = (
    chunk: { consts: any[]; funcs: any[]; code: any[]; arrayLiterals?: any[]; branchMarks?: any[] },
    base: number,
  ) => {
    const code = chunk.code as any[]

    const pcMap = new Int32Array(code.length)
    let pc = base
    for (let i = 0; i < code.length; i++) {
      pcMap[i] = pc
      const ins = code[i]!
      switch (ins.op) {
        case 'PUSH_CONST':
          {
            const v = chunk.consts[ins.k]
            if (typeof v === 'number') pc += 2
            else if (typeof v === 'string') pc += 2
            else if (typeof v === 'boolean') pc += 2
            else if (v === null) pc += 1
            else pc += 1
          }
          break
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
          pc += 1
          break
        case 'DUP2':
          errors.push(encoderError(src, 'DUP2 not supported in VM encoder yet'))
          pc += 1
          break
        case 'LOAD':
        case 'STORE':
          pc += 2
          break
        case 'UNARY':
          pc += 2
          break
        case 'BINARY':
          pc += 2
          break
        case 'CALL':
          pc += 3
          break
        case 'JUMP':
        case 'JUMP_IF_FALSE':
          pc += 2
          break
        case 'FUNC':
          pc += 2
          break
        case 'BREAK':
        case 'CONTINUE':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        case 'ARRAY':
          pc += 2
          break
        case 'GET_INDEX':
        case 'GET_INDEX2':
        case 'SET_INDEX':
          pc += 1
          break
        case 'OBJECT':
        case 'GET_PROP':
        case 'SET_PROP':
          errors.push(encoderError(src, `${ins.op} not supported in VM encoder yet`))
          pc += 1
          break
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          pc += 1
      }
    }

    const endPc = pc

    const arrayMeta = chunk.arrayLiterals as Array<{ ins: number; loc: Loc; items: Loc[] }> | undefined
    if (arrayMeta?.length) {
      for (const lit of arrayMeta) {
        const pcAt = pcMap[lit.ins]
        if (pcAt != null) arrayLiterals.push({ pc: pcAt, loc: lit.loc, items: lit.items })
      }
    }

    const branchMeta = chunk.branchMarks as Array<{ ins: number; loc: Loc }> | undefined
    if (branchMeta?.length) {
      for (const m of branchMeta) {
        const pcAt = pcMap[m.ins]
        if (pcAt != null) branchMarks.push({ pc: pcAt, loc: m.loc })
      }
    }

    let w = base
    for (let i = 0; i < code.length; i++) {
      const ins = code[i]!
      switch (ins.op) {
        case 'PUSH_CONST': {
          const v = chunk.consts[ins.k]
          if (typeof v === 'number') {
            const key = ins.loc ? sliderKeyOf(ins.loc) : undefined
            const isSlider = key !== undefined && sliderKeys.has(key)
            const k = key !== undefined ? litOfLocKey(key) : litOfValue(v)
            target.literals[k] = v
            target.ops[w++] = isSlider ? VmOp.PushNumSmoothed : VmOp.PushNum
            target.ops[w++] = k
            if (key !== undefined) locKeyToLiteralIndex.set(key, k)
          }
          else if (typeof v === 'string') {
            target.ops[w++] = VmOp.PushSym
            target.ops[w++] = symOf(v)
          }
          else if (typeof v === 'boolean') {
            target.ops[w++] = VmOp.PushBool
            target.ops[w++] = v ? 1 : 0
          }
          else if (v === null) {
            target.ops[w++] = VmOp.PushNull
          }
          else {
            target.ops[w++] = VmOp.PushUndef
          }
          break
        }
        case 'ENTER_SCOPE':
          target.ops[w++] = VmOp.EnterScope
          break
        case 'EXIT_SCOPE':
          target.ops[w++] = VmOp.ExitScope
          break
        case 'BRANCH':
          target.ops[w++] = VmOp.Branch
          break
        case 'POP':
          target.ops[w++] = VmOp.Pop
          break
        case 'DUP':
          target.ops[w++] = VmOp.Dup
          break
        case 'LABEL':
          target.ops[w++] = VmOp.Nop
          break
        case 'LOAD': {
          const name = String(chunk.consts[ins.name])
          target.ops[w++] = VmOp.Load
          target.ops[w++] = symOf(name)
          break
        }
        case 'STORE': {
          const name = String(chunk.consts[ins.name])
          target.ops[w++] = VmOp.Store
          target.ops[w++] = symOf(name)
          break
        }
        case 'UNARY': {
          const code = unaryCode(ins.opName)
          if (code === null) {
            errors.push(encoderError(src, `Unsupported unary op ${ins.opName}`))
            target.ops[w++] = VmOp.Nop
            break
          }
          target.ops[w++] = VmOp.Unary
          target.ops[w++] = code
          break
        }
        case 'BINARY': {
          const code = binaryCode(ins.opName)
          if (code === null) {
            errors.push(encoderError(src, `Unsupported binary op ${ins.opName}`))
            target.ops[w++] = VmOp.Nop
            break
          }
          target.ops[w++] = VmOp.Binary
          target.ops[w++] = code
          break
        }
        case 'ARRAY': {
          target.ops[w++] = VmOp.Array
          target.ops[w++] = ins.n | 0
          break
        }
        case 'LEN': {
          target.ops[w++] = VmOp.Len
          break
        }
        case 'GET_INDEX': {
          target.ops[w++] = VmOp.GetIndex
          break
        }
        case 'GET_INDEX2': {
          target.ops[w++] = VmOp.GetIndex2
          break
        }
        case 'SET_INDEX': {
          target.ops[w++] = VmOp.SetIndex
          break
        }
        case 'CALL':
          target.ops[w++] = VmOp.Call
          target.ops[w++] = ins.pos
          target.ops[w++] = ins.named
          break
        case 'JUMP':
          target.ops[w++] = VmOp.Jump
          target.ops[w++] = ins.to === code.length ? endPc : (pcMap[ins.to] ?? endPc)
          break
        case 'JUMP_IF_FALSE':
          target.ops[w++] = VmOp.JumpIfFalse
          target.ops[w++] = ins.to === code.length ? endPc : (pcMap[ins.to] ?? endPc)
          break
        case 'RETURN':
          target.ops[w++] = VmOp.Return
          break
        case 'THROW':
          target.ops[w++] = VmOp.Throw
          break
        case 'TRY_BEGIN':
        case 'CATCH_BEGIN':
        case 'FINALLY_BEGIN':
        case 'TRY_END':
          target.ops[w++] = VmOp.Nop
          break
        case 'FUNC': {
          const fn = chunk.funcs[ins.id]
          if (!fn) {
            errors.push(encoderError(src, `Missing FUNC #${ins.id}`))
            target.ops[w++] = VmOp.PushUndef
            break
          }
          target.ops[w++] = VmOp.Func
          const at = w++
          funcPatches.push({ at, fn })
          funcQueue.push(fn)
          target.ops[at] = 0
          break
        }
        default:
          errors.push(encoderError(src, `Unsupported opcode ${(ins as any).op}`))
          target.ops[w++] = VmOp.Nop
      }
    }

    return { endPc, writtenEnd: w }
  }

  // Encode main chunk at pc=1
  let writePc = 1
  const main = encodeChunk(chunk as any, writePc)
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

    const body = encodeChunk(fn.chunk as any, writePc)
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

  return errors.length
    ? {
      errors,
      visualizerVertex,
      visualizerFragment,
      bpm,
      bars,
      scale,
      miniSequences: sequences,
      miniRefs: miniRefs,
      timelineSequences,
      timelineRefs: timelineRefsMapped,
      timelineLabels,
      adRefs,
      adsrRefs,
      analyserRefs,
      compressorRefs,
      limiterRefs,
      filterRefs,
      freeverbRefs,
      slicerRefs,
      lfoRefs,
      everyRefs,
      atRefs,
      euclidRefs,
      arrayLiterals,
      branchMarks,
      numberParams: numberParamsWithLiteralIndex,
      numberLiterals: numberLiteralsWithLiteralIndex,
      sampleDefs: samples,
    }
    : {
      errors: [],
      visualizerVertex,
      visualizerFragment,
      bpm,
      bars,
      scale,
      miniSequences: sequences,
      miniRefs: miniRefs,
      timelineSequences,
      timelineRefs: timelineRefsMapped,
      timelineLabels,
      adRefs,
      adsrRefs,
      analyserRefs,
      compressorRefs,
      limiterRefs,
      filterRefs,
      freeverbRefs,
      slicerRefs,
      lfoRefs,
      everyRefs,
      atRefs,
      euclidRefs,
      arrayLiterals,
      branchMarks,
      numberParams: numberParamsWithLiteralIndex,
      numberLiterals: numberLiteralsWithLiteralIndex,
      sampleDefs: samples,
    }
}
