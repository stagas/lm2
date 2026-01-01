import { VmSym } from './vm-sym'

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
  Solo = VmSym.Solo,
  Post = VmSym.Post,
  Sine = VmSym.Sine,
  Tri = VmSym.Tri,
  Saw = VmSym.Saw,
  Ramp = VmSym.Ramp,
  Sqr = VmSym.Sqr,
  Pwm = VmSym.Pwm,
  Phasor = VmSym.Phasor,
  Ad = VmSym.Ad,
  Adsr = VmSym.Adsr,
  Mini = VmSym.Mini,
  Analyser = VmSym.Analyser,
  Compressor = VmSym.Compressor,
  Limiter = VmSym.Limiter,
  T = VmSym.T,
  Play = VmSym.Play,
  PlayPick = VmSym.PlayPick,
  Timeline = VmSym.Timeline,
  Sampler = VmSym.Sampler,
  Slicer = VmSym.Slicer,
  Every = VmSym.Every,
  At = VmSym.At,
  Note = VmSym.Note,
  Degree = VmSym.Degree,
  Map = VmSym.Map,
  Sum = VmSym.Sum,
  Avg = VmSym.Avg,
  Glide = VmSym.Glide,
  Slew = VmSym.Slew,
  Lp = VmSym.Lp,
  Hp = VmSym.Hp,
  Bp = VmSym.Bp,
  Bs = VmSym.Bs,
  Ls = VmSym.Ls,
  Hs = VmSym.Hs,
  Peak = VmSym.Peak,
  Ap = VmSym.Ap,
  Euclid = VmSym.Euclid,
  LfoSine = VmSym.LfoSine,
  LfoTri = VmSym.LfoTri,
  LfoSaw = VmSym.LfoSaw,
  LfoRamp = VmSym.LfoRamp,
  LfoSqr = VmSym.LfoSqr,
  LfoSah = VmSym.LfoSah,
  White = VmSym.White,
  Gauss = VmSym.Gauss,
  Pink = VmSym.Pink,
  Brown = VmSym.Brown,
  Smooth = VmSym.Smooth,
  Fractal = VmSym.Fractal,
  Delay = VmSym.Delay,
  Freeverb = VmSym.Freeverb,
  Dattorro = VmSym.Dattorro,
  Fdn = VmSym.Fdn,
  Dc = VmSym.Dc,
  Sin = VmSym.Sin,
  Cos = VmSym.Cos,
  Tan = VmSym.Tan,
  Asin = VmSym.Asin,
  Acos = VmSym.Acos,
  Tanh = VmSym.Tanh,
  Atan = VmSym.Atan,
  Abs = VmSym.Abs,
  Sqrt = VmSym.Sqrt,
  Square = VmSym.Square,
  Cube = VmSym.Cube,
  Hypot = VmSym.Hypot,
  Log = VmSym.Log,
  Exp = VmSym.Exp,
  Log10 = VmSym.Log10,
  Log2 = VmSym.Log2,
  Exp2 = VmSym.Exp2,
  Min = VmSym.Min,
  Max = VmSym.Max,
  Clamp = VmSym.Clamp,
  Wrap = VmSym.Wrap,
  Mod = VmSym.Mod,
  Pingpong = VmSym.Pingpong,
  Fold = VmSym.Fold,
  Floor = VmSym.Floor,
  Ceil = VmSym.Ceil,
  Round = VmSym.Round,
  Trunc = VmSym.Trunc,
  Snap = VmSym.Snap,
  Fract = VmSym.Fract,
  Sign = VmSym.Sign,
  Lerp = VmSym.Lerp,
  Smoothstep = VmSym.Smoothstep,
  Smootherstep = VmSym.Smootherstep,
  Step = VmSym.Step,
  Heaviside = VmSym.Heaviside,
  Select = VmSym.Select,
  Isnan = VmSym.Isnan,
  Isinf = VmSym.Isinf,
  Safediv = VmSym.Safediv,
}

export const VM_FUNC_HEADER: i32 = -2

export class NamedArgs {
  syms: StaticArray<i32>
  tags: StaticArray<i32>
  nums: StaticArray<f64>
  aux: StaticArray<i32>
  count: i32

  constructor(syms: StaticArray<i32>, tags: StaticArray<i32>, nums: StaticArray<f64>, aux: StaticArray<i32>, count: i32) {
    this.syms = syms
    this.tags = tags
    this.nums = nums
    this.aux = aux
    this.count = count
  }
}
