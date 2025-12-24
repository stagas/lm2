import { VmSym } from '../syms'

export const VM_MAGIC: i32 = -1

export enum VmOp {
  End = 0,
  Nop = 1,
  PushNum = 2, // literal index (ProgramData.literals)
  PushNumSmoothed = 24, // literal index (ProgramData.literals), smoothed at audio-rate when needed
  PushBool = 3, // 0/1
  PushNull = 4,
  PushUndef = 5,
  PushSym = 6, // symbol id
  Pop = 7,
  Dup = 8,
  Load = 9, // symbol id
  Store = 10, // symbol id
  Unary = 11, // code
  Binary = 12, // code
  Call = 13, // pos, named
  Jump = 14, // pc
  JumpIfFalse = 15, // pc
  Return = 16,
  Throw = 17,
  EnterScope = 18,
  ExitScope = 19,
  Func = 20, // absolute pc
  Array = 21, // n
  GetIndex = 22,
  SetIndex = 23,
  GetIndex2 = 25,
  Branch = 26, // no-op marker for UI branch visualizers
  Len = 27,
}

export enum VmTag {
  Undef = 0,
  Null = 1,
  Bool = 2,
  Num = 3,
  Sym = 4,
  Audio = 5, // aux = outIndex
  Builtin = 6, // aux = builtin id
  Func = 7, // aux = absolute pc
  Arr = 8, // aux = array pool id
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

export enum VmBuiltin {
  Out = VmSym.Out,
  Sine = VmSym.Sine,
  Ad = VmSym.Ad,
  Adsr = VmSym.Adsr,
  Mini = VmSym.Mini,
  Analyser = VmSym.Analyser,
  T = VmSym.T,
  Play = VmSym.Play,
  PlayPick = VmSym.PlayPick,
  Timeline = VmSym.Timeline,
  Sampler = VmSym.Sampler,
  Slicer = VmSym.Slicer,
  Every = VmSym.Every,
  At = VmSym.At,
}

export const VM_FUNC_HEADER: i32 = -2
