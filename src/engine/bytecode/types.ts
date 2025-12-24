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

export type AnalyserRef = {
  analyserIndex: number
  loc: Loc
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
}

export type NumberLiteralInfo = {
  line: number
  column: number
  length: number
  value: number
  literalIndex?: number
}

export type SampleDef = {
  sampleIndex: number
  url: string
  provider: 'freesound'
  id: number
  loc: Loc
}
