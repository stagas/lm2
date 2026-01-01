import type { Loc } from '../../lang/ast.ts'

export const VM_MAGIC = -1

export enum VmOp {
  End = 0,
  Nop = 1,
  PushNum = 2,
  PushNumSmoothed = 24,
  PushBool = 3,
  PushNull = 4,
  PushUndef = 5,
  PushSym = 6,
  Pop = 7,
  Dup = 8,
  Load = 9,
  Store = 10,
  Unary = 11,
  Binary = 12,
  Call = 13,
  Jump = 14,
  JumpIfFalse = 15,
  Return = 16,
  Throw = 17,
  EnterScope = 18,
  ExitScope = 19,
  Func = 20,
  Array = 21, // immediate: n
  GetIndex = 22,
  SetIndex = 23,
  GetIndex2 = 25,
  Branch = 26,
  Len = 27,
}

export enum VmUnary {
  Neg = 0,
  Not = 1,
  BitNot = 2,
}

export enum VmBinary {
  Add = 0,
  Sub = 1,
  Mul = 2,
  Div = 3,
  Mod = 4,
  Pow = 5,
  Eq = 6,
  Lt = 7,
  Lte = 8,
  Gt = 9,
  Gte = 10,
  BitOr = 11,
  BitXor = 12,
  BitAnd = 13,
  Shl = 14,
  Shr = 15,
  Ushr = 16,
}

export type VmTarget = {
  ops: Int32Array
  literals: Float32Array
}

export type ArrayLiteralRef = {
  pc: number
  loc: Loc
  items: Loc[]
}

export type BranchMarkRef = {
  pc: number
  loc: Loc
}

export type AnalyserRef = {
  analyserIndex: number
  loc: Loc
}

export type CompressorRef = {
  compressorIndex: number
  /** Location of the `compressor` identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  /** Location of the input arg (positional or `in:`). */
  inArgLoc: Loc | null
  /** Location of the sidechain arg (positional or `key:`). */
  keyArgLoc: Loc | null
  /** Numeric parameter value locations as they appear (only for params that are explicitly present). */
  knobParams: Array<{
    name: 'attack' | 'release' | 'threshold' | 'ratio' | 'knee'
    value: number
    valueLoc: Loc
  }>
  /** Current compile-time parameter snapshot (best-effort; non-const expressions fall back to defaults). */
  params: {
    attack: number
    release: number
    threshold: number
    ratio: number
    knee: number
  }
}

export type LimiterRef = {
  limiterIndex: number
  /** Location of the `limiter` identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  /** Location of the input arg (positional or `in:`). */
  inArgLoc: Loc | null
  /** Numeric parameter value locations as they appear (only for params that are explicitly present). */
  knobParams: Array<{
    name: 'release' | 'threshold'
    value: number
    valueLoc: Loc
  }>
  /** Current compile-time parameter snapshot (best-effort; non-const expressions fall back to defaults). */
  params: {
    release: number
    threshold: number
  }
}

export type FilterType = 'lp' | 'hp' | 'bp' | 'bs' | 'ls' | 'hs' | 'peak' | 'ap'

export type FilterRef = {
  filterType: FilterType
  filterIndex: number
  /** Location of the filter identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  /** Location of the input arg (positional or `in:`). */
  inArgLoc: Loc | null
  /** Location of the cutoff arg (positional or `cutoff:`). */
  cutArgLoc: Loc | null
  /** Location of the Q arg (positional or `q:`). */
  qArgLoc: Loc | null
  /** Location of the gain arg (for shelf/peak filters). */
  gainArgLoc: Loc | null
  /** Current compile-time parameter snapshot (best-effort; non-const expressions fall back to defaults). */
  params: {
    cut: number
    q: number
    gain?: number
  }
}

// Legacy alias for backward compatibility
export type LpRef = FilterRef

export type SlicerRef = {
  /** Location of the `slicer` identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  sampleIndex: number
  threshold: number
  sampleArgLoc: Loc | null
  thresholdArgLoc: Loc | null
}

export type LfoRef = {
  lfoIndex: number
  lfoType: 'sine' | 'tri' | 'saw' | 'ramp' | 'sqr' | 'sah' | 'smooth' | 'fractal'
  /** Location of the `lfo*` identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  barArgLoc: Loc | null
  offsetArgLoc: Loc | null
  trigArgLoc: Loc | null
  seedArgLoc: Loc | null
  params: {
    bar: number
    offset: number
    seed: number
  }
}

export type EveryRef = {
  everyIndex: number
  /** Location of the `every` identifier (for widget anchoring). */
  loc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
}

export type AtRef = {
  atIndex: number
  /** Location of the `at` identifier (for widget anchoring). */
  loc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
}

export type EuclidRef = {
  euclidIndex: number
  /** Location of the `euclid` identifier (for widget anchoring). */
  loc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
}

export type ReverbKind = 'freeverb' | 'dattorro' | 'fdn'

export type ReverbRef = {
  reverbIndex: number
  reverbKind: ReverbKind
  /** Location of the reverb identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  /** Location of the input arg (positional or `in:`). */
  inArgLoc: Loc | null
  /** Location of the roomSize arg (positional or `roomSize:`). */
  roomSizeArgLoc: Loc | null
  /** Current compile-time parameter snapshot (best-effort; non-const expressions fall back to defaults). */
  params: {
    roomSize: number
  }
}

export type MiniSequenceRef = {
  seqIndex: number
  sequence: string
  color?: string
  /** Absolute start index (0-based) of the string content (excluding quotes) in the DSP source. */
  start: number
  /** Absolute end index (0-based, exclusive) of the string content (excluding quotes) in the DSP source. */
  end: number
  /** Location of the full string token (including quotes). */
  loc: Loc
}

export type TimelineSequenceDef = {
  sequence: string
}

export type TimelineLabel = {
  bar: number
  text: string
  color?: string
  loc: Loc
}

export type TimelineSequenceRef = {
  seqIndex: number
  sequence: string
  color?: string
  /** Absolute start index (0-based) of the string content (excluding quotes) in the DSP source. */
  start: number
  /** Absolute end index (0-based, exclusive) of the string content (excluding quotes) in the DSP source. */
  end: number
  /** Location of the full string token (including quotes). */
  loc: Loc
}

export type NumberWithParamsInfo = {
  line: number
  column: number
  length: number
  widgetLength: number
  value: number
  min: number
  max: number
  literalIndex?: number
  precision: number
  exp?: number
}

export type NumberLiteralInfo = {
  line: number
  column: number
  length: number
  value: number
  literalIndex?: number
}

export type AdRef = {
  adIndex: number
  /** Location of the `ad` identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  /** Location of the attack arg (positional or `attack:`). */
  attackArgLoc: Loc | null
  /** Location of the decay arg (positional or `decay:`). */
  decayArgLoc: Loc | null
  /** Location of the trig arg (positional or `trig:`). */
  trigArgLoc: Loc | null
  /** Current compile-time parameter snapshot (best-effort; non-const expressions fall back to defaults). */
  params: {
    attack: number
    decay: number
  }
}

export type AdsrRef = {
  adsrIndex: number
  /** Location of the `adsr` identifier (for widget anchoring). */
  loc: Loc
  /** Location span for the above widget (start at callee; width covers max call width even across multi-line calls). */
  aboveLoc: Loc
  /** Location of the full call expression. */
  callLoc: Loc
  /** Location of the attack arg (positional or `attack:`). */
  attackArgLoc: Loc | null
  /** Location of the decay arg (positional or `decay:`). */
  decayArgLoc: Loc | null
  /** Location of the sustain arg (positional or `sustain:`). */
  sustainArgLoc: Loc | null
  /** Location of the release arg (positional or `release:`). */
  releaseArgLoc: Loc | null
  /** Location of the trig arg (positional or `trig:`). */
  trigArgLoc: Loc | null
  /** Current compile-time parameter snapshot (best-effort; non-const expressions fall back to defaults). */
  params: {
    attack: number
    decay: number
    sustain: number
    release: number
  }
}

export type SampleDef = {
  sampleIndex: number
  url: string
  provider: 'freesound'
  id: number
  loc: Loc
}
