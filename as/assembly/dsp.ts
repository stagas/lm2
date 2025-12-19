import {
  ARRAY_HEADER_SIZE,
  ARRAY_HISTORY_ENTRY_SIZE,
  ARRAY_HISTORY_SIZE,
  ARRAY_SIZE,
  CALLBACK_SCOPE_BASE,
  CALLBACK_SCOPE_BUFFERS_PER_VOICE,
  LITERALS_COUNT,
  SEQ_VOICES,
} from './constants'
import { Ad } from './gen/ad'
import { Adsr } from './gen/adsr'
import { Mini } from './gen/mini'
import { Sine } from './gen/sine'
import { Timeline } from './gen/timeline'
import { clearVmError, controlBlockSize, setVmError, vmErrorCode } from './globals'
import { Program, ProgramData } from './program'
import { Op } from './shared'

function clearAudio(out$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, 0)
    out$ += 4
  }
}

function addAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 + s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function subAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 - s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function mulAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 * s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function divAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 / s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function modAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = s1 % s2
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function powAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    const sample = Mathf.pow(s1, s2)
    store<f32>(out$, sample)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function eqAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 == s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function ltAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 < s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function lteAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 <= s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function gtAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 > s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function gteAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 >= s2 ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function logicOrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 != (0.0 as f32) ? s1 : s2)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function logicAndAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s1 = load<f32>(a1$)
    const s2 = load<f32>(a2$)
    store<f32>(out$, s1 != (0.0 as f32) ? s2 : s1)
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function bitOrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$))
    store<f32>(out$, f32(a | b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function bitXorAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$))
    store<f32>(out$, f32(a ^ b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function bitAndAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$))
    store<f32>(out$, f32(a & b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function shlAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$)) & 31
    store<f32>(out$, f32(a << b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function shrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(a1$))
    const b = i32(load<f32>(a2$)) & 31
    store<f32>(out$, f32(a >> b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function ushrAudio(out$: usize, a1$: usize, a2$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = <u32> i32(load<f32>(a1$))
    const b = (<u32> i32(load<f32>(a2$))) & 31
    store<f32>(out$, f32(a >>> b))
    out$ += 4
    a1$ += 4
    a2$ += 4
  }
}

function notAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const s = load<f32>(in$)
    store<f32>(out$, s == (0.0 as f32) ? (1.0 as f32) : (0.0 as f32))
    out$ += 4
    in$ += 4
  }
}

function bitNotAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const a = i32(load<f32>(in$))
    store<f32>(out$, f32(~a))
    out$ += 4
    in$ += 4
  }
}

function selectAudio(out$: usize, cond$: usize, then$: usize, else$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    const c = load<f32>(cond$)
    const t = load<f32>(then$)
    const e = load<f32>(else$)
    store<f32>(out$, c != (0.0 as f32) ? t : e)
    out$ += 4
    cond$ += 4
    then$ += 4
    else$ += 4
  }
}

function copyAudio(out$: usize, in$: usize, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, load<f32>(in$))
    out$ += 4
    in$ += 4
  }
}

function fillAudio(out$: usize, value: f32, length: i32): void {
  for (let i = 0; i < length; i++) {
    store<f32>(out$, value)
    out$ += 4
  }
}

const VM_MAGIC: i32 = -1

enum VmOp {
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
}

enum VmTag {
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

enum VmUnary {
  Neg = 0,
  Not = 1,
  BitNot = 2,
}

enum VmBinary {
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

enum VmBuiltin {
  Out = 1,
  Sine = 2,
  Ad = 3,
  Adsr = 4,
  Mini = 5,
  Analyser = 6,
  T = 7,
  Play = 8,
  Timeline = 9,
}

const VM_FUNC_HEADER: i32 = -2

export class Dsp {
  program: Program = new Program()
  private lastGoodData: ProgramData | null = null

  private smoothedHas: StaticArray<i32> = new StaticArray<i32>(LITERALS_COUNT)
  private smoothedOut: StaticArray<usize> = new StaticArray<usize>(LITERALS_COUNT)

  private vmSp: i32 = 0
  private vmTag: StaticArray<i32> = new StaticArray<i32>(1024)
  private vmNum: StaticArray<f64> = new StaticArray<f64>(1024)
  private vmAux: StaticArray<i32> = new StaticArray<i32>(1024)

  private envCount: i32 = 0
  private envSym: StaticArray<i32> = new StaticArray<i32>(512)
  private envTag: StaticArray<i32> = new StaticArray<i32>(512)
  private envNum: StaticArray<f64> = new StaticArray<f64>(512)
  private envAux: StaticArray<i32> = new StaticArray<i32>(512)
  private scopeDepth: i32 = 0
  private scopeStart: StaticArray<i32> = new StaticArray<i32>(64)

  private outCursor: i32 = 0
  private analyserRingBase: i32 = 0

  private callKeySyms: StaticArray<i32> = new StaticArray<i32>(8)
  private callValTags: StaticArray<i32> = new StaticArray<i32>(8)
  private callValNums: StaticArray<f64> = new StaticArray<f64>(8)
  private callValAux: StaticArray<i32> = new StaticArray<i32>(8)
  private callPosTags: StaticArray<i32> = new StaticArray<i32>(8)
  private callPosNums: StaticArray<f64> = new StaticArray<f64>(8)
  private callPosAux: StaticArray<i32> = new StaticArray<i32>(8)

  private funcParamSyms: StaticArray<i32> = new StaticArray<i32>(8)

  private miniTrigOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  private miniVelOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  private miniValOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)

  private cbArgTags: StaticArray<i32> = new StaticArray<i32>(3)
  private cbArgNums: StaticArray<f64> = new StaticArray<f64>(3)
  private cbArgAux: StaticArray<i32> = new StaticArray<i32>(3)

  private arrCount: i32 = 0
  private arrElemCount: i32 = 0
  private arrStart: StaticArray<i32> = new StaticArray<i32>(512)
  private arrLen: StaticArray<i32> = new StaticArray<i32>(512)
  private arrCreatePc: StaticArray<i32> = new StaticArray<i32>(512)
  private arrElemTag: StaticArray<i32> = new StaticArray<i32>(8192)
  private arrElemNum: StaticArray<f64> = new StaticArray<f64>(8192)
  private arrElemAux: StaticArray<i32> = new StaticArray<i32>(8192)

  @inline
  private recordArrayAccess(createPc: i32, index: i32): void {
    // Best-effort ring buffer for UI widgets (no atomics needed).
    const hist = this.program.arrayAccessHistory
    const writePos = i32(hist[0])
    const slot = writePos % ARRAY_HISTORY_SIZE
    const base = 1 + slot * ARRAY_HISTORY_ENTRY_SIZE
    hist[base] = f32(createPc)
    hist[base + 1] = f32(index)
    hist[0] = f32((writePos + 1) & 0xfffff)
  }

  reset(voices: boolean): void {
    this.program.gensPool.resetAllSeqs(voices)
  }

  prepare(): void {
    this.program.prepare()
  }

  @inline
  private vmPush(tag: VmTag, num: f64 = 0.0, aux: i32 = 0): void {
    const sp = this.vmSp
    if (sp < 0 || sp >= this.vmTag.length) {
      setVmError(10, 0)
      return
    }
    this.vmTag[sp] = tag
    this.vmNum[sp] = num
    this.vmAux[sp] = aux
    this.vmSp = sp + 1
  }

  @inline
  private vmPop(): i32 {
    if (this.vmSp <= 0) {
      setVmError(11, 0)
      this.vmSp = 0
      return 0
    }
    this.vmSp--
    return this.vmSp
  }

  @inline
  private vmPeek(): i32 {
    if (this.vmSp <= 0) {
      setVmError(11, 0)
      return 0
    }
    return this.vmSp - 1
  }

  @inline
  private vmTruthy(tag: VmTag, num: f64): bool {
    if (tag === VmTag.Undef || tag === VmTag.Null) return false
    if (tag === VmTag.Bool) return num != 0.0
    if (tag === VmTag.Num) return num != 0.0
    return true
  }

  @inline
  private envEnter(): void {
    const d = this.scopeDepth
    if (d < 0 || d >= this.scopeStart.length) {
      setVmError(13, 0)
      return
    }
    this.scopeStart[d] = this.envCount
    this.scopeDepth = d + 1
  }

  @inline
  private envExit(): void {
    if (this.scopeDepth <= 0) return
    this.scopeDepth--
    this.envCount = this.scopeStart[this.scopeDepth]
  }

  @inline
  private envFind(sym: i32): i32 {
    for (let i = this.envCount - 1; i >= 0; i--) {
      if (this.envSym[i] === sym) return i
    }
    return -1
  }

  @inline
  private envDefine(sym: i32, tag: VmTag, num: f64, aux: i32): void {
    const at = this.envCount
    if (at < 0 || at >= this.envSym.length) {
      setVmError(12, 0)
      return
    }
    this.envSym[at] = sym
    this.envTag[at] = tag
    this.envNum[at] = num
    this.envAux[at] = aux
    this.envCount = at + 1
  }

  @inline
  private envLoad(sym: i32): void {
    const idx = this.envFind(sym)
    if (idx >= 0) {
      this.vmPush(this.envTag[idx] as VmTag, this.envNum[idx], this.envAux[idx])
      return
    }

    // Builtins are implicit globals
    if (sym === VmBuiltin.Out) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Out)
      return
    }
    if (sym === VmBuiltin.Sine) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Sine)
      return
    }
    if (sym === VmBuiltin.Ad) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Ad)
      return
    }
    if (sym === VmBuiltin.Adsr) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Adsr)
      return
    }
    if (sym === VmBuiltin.Analyser) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Analyser)
      return
    }
    if (sym === VmBuiltin.Mini) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Mini)
      return
    }
    if (sym === VmBuiltin.Play) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Play)
      return
    }
    if (sym === VmBuiltin.Timeline) {
      this.vmPush(VmTag.Builtin, 0.0, VmBuiltin.Timeline)
      return
    }
    // Global time scaled to BPM: t = seconds * (bpm / 60)
    if (sym === VmBuiltin.T) {
      // globalSampleCount: i32 samples since start
      // sampleRate: f32 samples per second
      // bpm: f32 current beats per minute
      const seconds = (globalSampleCount as f64) / (sampleRate as f64)
      const scaled = seconds * (bpm as f64) / 60.0
      this.vmPush(VmTag.Num, scaled)
      return
    }

    this.vmPush(VmTag.Undef)
  }

  @inline
  private envStore(sym: i32): void {
    const top = this.vmPeek()
    const tag = this.vmTag[top] as VmTag
    const num = this.vmNum[top]
    const aux = this.vmAux[top]

    const idx = this.envFind(sym)
    if (idx >= 0) {
      this.envTag[idx] = tag
      this.envNum[idx] = num
      this.envAux[idx] = aux
      return
    }

    const at = this.envCount
    this.envSym[at] = sym
    this.envTag[at] = tag
    this.envNum[at] = num
    this.envAux[at] = aux
    this.envCount = at + 1
  }

  private vmExec(pcStart: i32, pcEnd: i32, length: i32, left$: usize, right$: usize, stopOnReturn: bool): i32 {
    const ops = this.program.data.ops
    let pc = pcStart
    while (pc >= 0 && pc < pcEnd) {
      const ins = ops[pc++]
      const op = ins as VmOp

      if (vmErrorCode !== 0) return -1

      if (op === VmOp.End) {
        globalSampleCount += length
        return -1
      }
      if (op === VmOp.Nop) continue

      if (op === VmOp.PushNum) {
        const k = ops[pc++]
        const v = this.program.data.literals[k] as f64
        this.vmPush(VmTag.Num, v)
        continue
      }
      if (op === VmOp.PushNumSmoothed) {
        const k = ops[pc++]
        const v = this.program.data.literals[k] as f64
        this.vmPush(VmTag.Num, v, -1 - k)
        continue
      }
      if (op === VmOp.PushBool) {
        const v = ops[pc++]
        this.vmPush(VmTag.Bool, v != 0 ? 1.0 : 0.0)
        continue
      }
      if (op === VmOp.PushNull) {
        this.vmPush(VmTag.Null)
        continue
      }
      if (op === VmOp.PushUndef) {
        this.vmPush(VmTag.Undef)
        continue
      }
      if (op === VmOp.PushSym) {
        const sym = ops[pc++]
        this.vmPush(VmTag.Sym, 0.0, sym)
        continue
      }
      if (op === VmOp.Func) {
        const funcPc = ops[pc++]
        this.vmPush(VmTag.Func, 0.0, funcPc)
        continue
      }
      if (op === VmOp.Pop) {
        this.vmPop()
        continue
      }
      if (op === VmOp.Dup) {
        const top = this.vmPeek()
        this.vmPush(this.vmTag[top] as VmTag, this.vmNum[top], this.vmAux[top])
        continue
      }
      if (op === VmOp.Load) {
        const sym = ops[pc++]
        this.envLoad(sym)
        continue
      }
      if (op === VmOp.Store) {
        const sym = ops[pc++]
        this.envStore(sym)
        continue
      }
      if (op === VmOp.Array) {
        const n = ops[pc++]
        const arrId = this.arrCount
        const start = this.arrElemCount
        const end = start + n

        if (arrId < 0 || arrId >= this.arrStart.length) {
          setVmError(20, pc - 1)
          this.vmPush(VmTag.Undef)
          continue
        }
        if (end < 0 || end > this.arrElemTag.length) {
          setVmError(21, pc - 1)
          this.vmPush(VmTag.Undef)
          continue
        }

        this.arrStart[arrId] = start
        this.arrLen[arrId] = n
        this.arrCreatePc[arrId] = pc - 2
        this.arrCount = arrId + 1
        this.arrElemCount = end

        for (let i = n - 1; i >= 0; i--) {
          const idx = this.vmPop()
          this.arrElemTag[start + i] = this.vmTag[idx]
          this.arrElemNum[start + i] = this.vmNum[idx]
          this.arrElemAux[start + i] = this.vmAux[idx]
        }

        this.vmPush(VmTag.Arr, 0.0, arrId)
        continue
      }
      if (op === VmOp.GetIndex) {
        const indexIdx = this.vmPop()
        const arrayIdx = this.vmPop()
        const arrayTag = this.vmTag[arrayIdx] as VmTag
        const arrayAux = this.vmAux[arrayIdx]
        const indexTag = this.vmTag[indexIdx] as VmTag
        const indexNum = this.vmNum[indexIdx]

        if (arrayTag !== VmTag.Arr) {
          this.vmPush(VmTag.Undef)
          continue
        }

        const arrId = arrayAux
        if (arrId < 0 || arrId >= this.arrCount) {
          this.vmPush(VmTag.Undef)
          continue
        }

        const i = i32(indexTag === VmTag.Bool ? (indexNum != 0.0 ? 1 : 0) : indexNum)
        const start = this.arrStart[arrId]
        const len = this.arrLen[arrId]
        if (i < 0 || i >= len) {
          this.vmPush(VmTag.Undef)
          continue
        }

        this.recordArrayAccess(this.arrCreatePc[arrId], i)

        const at = start + i
        this.vmPush(this.arrElemTag[at] as VmTag, this.arrElemNum[at], this.arrElemAux[at])
        continue
      }
      if (op === VmOp.SetIndex) {
        const valueIdx = this.vmPop()
        const indexIdx = this.vmPop()
        const arrayIdx = this.vmPop()

        const arrayTag = this.vmTag[arrayIdx] as VmTag
        const arrayAux = this.vmAux[arrayIdx]
        const indexTag = this.vmTag[indexIdx] as VmTag
        const indexNum = this.vmNum[indexIdx]

        if (arrayTag !== VmTag.Arr) {
          this.vmPush(VmTag.Undef)
          continue
        }

        const arrId = arrayAux
        if (arrId < 0 || arrId >= this.arrCount) {
          this.vmPush(VmTag.Undef)
          continue
        }

        const i = i32(indexTag === VmTag.Bool ? (indexNum != 0.0 ? 1 : 0) : indexNum)
        const start = this.arrStart[arrId]
        const len = this.arrLen[arrId]
        if (i < 0 || i >= len) {
          this.vmPush(VmTag.Undef)
          continue
        }

        const at = start + i
        this.arrElemTag[at] = this.vmTag[valueIdx]
        this.arrElemNum[at] = this.vmNum[valueIdx]
        this.arrElemAux[at] = this.vmAux[valueIdx]

        this.vmPush(this.vmTag[valueIdx] as VmTag, this.vmNum[valueIdx], this.vmAux[valueIdx])
        continue
      }
      if (op === VmOp.Unary) {
        const code = ops[pc++] as VmUnary
        const idx = this.vmPop()
        const tag = this.vmTag[idx] as VmTag
        const num = this.vmNum[idx]
        if (code === VmUnary.Neg && tag === VmTag.Num) {
          const aux = this.vmAux[idx]
          if (aux < 0) {
            const in$ = this.vmToAudioPtr(tag, num, aux, length)
            const outIndex = this.vmAllocOut()
            const out$ = this.program.getOutBuffer(outIndex)
            let p$ = out$
            for (let i = 0; i < length; i++) {
              store<f32>(p$, -load<f32>(in$ + (i * 4) as usize))
              p$ += 4
            }
            this.vmPush(VmTag.Audio, 0.0, outIndex)
          }
          else {
            this.vmPush(VmTag.Num, -num)
          }
        }
        else if (code === VmUnary.Not) this.vmPush(VmTag.Bool, this.vmTruthy(tag, num) ? 0.0 : 1.0)
        else if (code === VmUnary.BitNot && tag === VmTag.Num) this.vmPush(VmTag.Num, ~i32(num) as f64)
        else this.vmPush(VmTag.Undef)
        continue
      }
      if (op === VmOp.Binary) {
        const code = ops[pc++] as VmBinary
        this.vmBinary(code, length)
        continue
      }
      if (op === VmOp.Call) {
        const pos = ops[pc++]
        const named = ops[pc++]
        this.vmCall(pos, named, length, left$, right$)
        continue
      }
      if (op === VmOp.Jump) {
        pc = ops[pc]
        continue
      }
      if (op === VmOp.JumpIfFalse) {
        const to = ops[pc++]
        const idx = this.vmPop()
        const tag = this.vmTag[idx] as VmTag
        const num = this.vmNum[idx]
        if (!this.vmTruthy(tag, num)) pc = to
        continue
      }
      if (op === VmOp.EnterScope) {
        this.envEnter()
        continue
      }
      if (op === VmOp.ExitScope) {
        this.envExit()
        continue
      }
      if (op === VmOp.Return) {
        if (stopOnReturn) return pc
        return -1
      }
      if (op === VmOp.Throw) {
        setVmError(1, pc - 1)
        return -1
      }
    }
    return pc
  }

  private vmInvokeFunc(funcPc: i32, argCount: i32, argTags: StaticArray<i32>, argNums: StaticArray<f64>,
    argAux: StaticArray<i32>, length: i32, left$: usize, right$: usize): void
  {
    const ops = this.program.data.ops
    if (funcPc < 0 || funcPc >= ops.length) {
      setVmError(3, funcPc)
      this.vmPush(VmTag.Undef)
      return
    }
    if (ops[funcPc] !== VM_FUNC_HEADER) {
      setVmError(3, funcPc)
      this.vmPush(VmTag.Undef)
      return
    }

    const paramCount = ops[funcPc + 1]
    const maxParams = this.funcParamSyms.length
    const n = paramCount < maxParams ? paramCount : maxParams
    for (let i = 0; i < n; i++) {
      this.funcParamSyms[i] = ops[funcPc + 2 + i]
    }
    const bodyPc = funcPc + 2 + paramCount

    const savedEnv = this.envCount
    const savedDepth = this.scopeDepth
    const savedOut = this.outCursor

    this.envEnter()

    for (let i = 0; i < n; i++) {
      const sym = this.funcParamSyms[i]
      if (i < argCount) {
        this.envDefine(sym, argTags[i] as VmTag, argNums[i], argAux[i])
      }
      else {
        this.envDefine(sym, VmTag.Undef, 0.0, 0)
      }
    }

    this.vmExec(bodyPc, ops.length, length, left$, right$, true)

    this.envCount = savedEnv
    this.scopeDepth = savedDepth
    this.outCursor = savedOut
  }

  @inline
  private vmAllocOut(): i32 {
    const idx = this.outCursor
    this.outCursor = idx + 1
    const max = this.program.outsPool.outs.length
    if (idx < 0 || idx >= max) {
      setVmError(2, 0)
      return 0
    }
    return idx
  }

  @inline
  private vmToAudioPtr(tag: VmTag, num: f64, aux: i32, length: i32): usize {
    if (tag === VmTag.Audio) {
      return this.program.getOutBuffer(aux)
    }

    if (tag === VmTag.Num) {
      if (aux < 0) {
        const k = -1 - aux
        if (k >= 0 && k < this.smoothedHas.length) {
          if (this.smoothedHas[k] !== 0) {
            return this.smoothedOut[k]
          }
          const outIndex = this.vmAllocOut()
          const out$ = this.program.getOutBuffer(outIndex)
          this.smoothedHas[k] = 1
          this.smoothedOut[k] = out$

          const s = this.program.literalsSmoothed[k]
          if (s.value === Infinity && s.target === Infinity) {
            s.value = num
            s.target = num
          }
          else {
            s.target = num
          }
          let p$ = out$
          for (let i = 0; i < length; i++) {
            s.update()
            store<f32>(p$, s.value as f32)
            p$ += 4
          }
          return out$
        }
      }
      const outIndex = this.vmAllocOut()
      const out$ = this.program.getOutBuffer(outIndex)
      fillAudio(out$, num as f32, length)
      return out$
    }

    const outIndex = this.vmAllocOut()
    const out$ = this.program.getOutBuffer(outIndex)

    if (tag === VmTag.Bool) {
      fillAudio(out$, (num != 0.0 ? 1.0 : 0.0) as f32, length)
      return out$
    }

    fillAudio(out$, 0.0 as f32, length)
    return out$
  }

  private vmBinary(code: VmBinary, length: i32): void {
    const b = this.vmPop()
    const a = this.vmPop()

    const aTag = this.vmTag[a] as VmTag
    const bTag = this.vmTag[b] as VmTag
    const aNum = this.vmNum[a]
    const bNum = this.vmNum[b]
    const aAux = this.vmAux[a]
    const bAux = this.vmAux[b]

    if (aTag !== VmTag.Audio && bTag !== VmTag.Audio) {
      const aSmoothed = aTag === VmTag.Num && aAux < 0
      const bSmoothed = bTag === VmTag.Num && bAux < 0
      const promoteToAudio = (aSmoothed || bSmoothed)
        && (
          code === VmBinary.Add || code === VmBinary.Sub || code === VmBinary.Mul || code === VmBinary.Div
          || code === VmBinary.Mod || code === VmBinary.Pow
          || code === VmBinary.BitOr || code === VmBinary.BitXor || code === VmBinary.BitAnd
          || code === VmBinary.Shl || code === VmBinary.Shr || code === VmBinary.Ushr
        )

      if (promoteToAudio) {
        const aPtr$ = this.vmToAudioPtr(aTag, aNum, aAux, length)
        const bPtr$ = this.vmToAudioPtr(bTag, bNum, bAux, length)
        const outIndex = this.vmAllocOut()
        const out$ = this.program.getOutBuffer(outIndex)

        if (code === VmBinary.Add) addAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Sub) subAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Mul) mulAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Div) divAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Mod) modAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Pow) powAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.BitOr) bitOrAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.BitXor) bitXorAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.BitAnd) bitAndAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Shl) shlAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Shr) shrAudio(out$, aPtr$, bPtr$, length)
        else if (code === VmBinary.Ushr) ushrAudio(out$, aPtr$, bPtr$, length)
        else clearAudio(out$, length)

        this.vmPush(VmTag.Audio, 0.0, outIndex)
        return
      }

      if (code === VmBinary.Add && aTag === VmTag.Num && bTag === VmTag.Num) {
        this.vmPush(VmTag.Num, aNum + bNum)
        return
      }
      if (code === VmBinary.Sub && aTag === VmTag.Num && bTag === VmTag.Num) {
        this.vmPush(VmTag.Num, aNum - bNum)
        return
      }
      if (code === VmBinary.Mul && aTag === VmTag.Num && bTag === VmTag.Num) {
        this.vmPush(VmTag.Num, aNum * bNum)
        return
      }
      if (code === VmBinary.Div && aTag === VmTag.Num && bTag === VmTag.Num) {
        this.vmPush(VmTag.Num, aNum / bNum)
        return
      }
      if (code === VmBinary.Mod && aTag === VmTag.Num && bTag === VmTag.Num) {
        this.vmPush(VmTag.Num, aNum % bNum)
        return
      }
      if (code === VmBinary.Pow && aTag === VmTag.Num && bTag === VmTag.Num) {
        this.vmPush(VmTag.Num, Mathf.pow(aNum as f32, bNum as f32) as f64)
        return
      }

      if (
        code === VmBinary.BitOr || code === VmBinary.BitXor || code === VmBinary.BitAnd || code === VmBinary.Shl
        || code === VmBinary.Shr || code === VmBinary.Ushr
      ) {
        const ai = i32(aTag === VmTag.Bool ? (aNum != 0.0 ? 1 : 0) : aNum)
        const bi = i32(bTag === VmTag.Bool ? (bNum != 0.0 ? 1 : 0) : bNum)
        if (code === VmBinary.BitOr) this.vmPush(VmTag.Num, f64(ai | bi))
        else if (code === VmBinary.BitXor) this.vmPush(VmTag.Num, f64(ai ^ bi))
        else if (code === VmBinary.BitAnd) this.vmPush(VmTag.Num, f64(ai & bi))
        else if (code === VmBinary.Shl) this.vmPush(VmTag.Num, f64(ai << (bi & 31)))
        else if (code === VmBinary.Shr) this.vmPush(VmTag.Num, f64(ai >> (bi & 31)))
        else this.vmPush(VmTag.Num, f64((<u32> ai) >>> ((<u32> bi) & 31)))
        return
      }

      if (
        code === VmBinary.Lt || code === VmBinary.Lte || code === VmBinary.Gt || code === VmBinary.Gte
        || code === VmBinary.Eq
      ) {
        if (code === VmBinary.Eq) {
          let eq = false
          if ((aTag === VmTag.Null || aTag === VmTag.Undef) && (bTag === VmTag.Null || bTag === VmTag.Undef)) eq = true
          else if (aTag === VmTag.Num && bTag === VmTag.Num) eq = aNum === bNum
          else if (aTag === VmTag.Bool && bTag === VmTag.Bool) eq = (aNum != 0.0) === (bNum != 0.0)
          else if (aTag === VmTag.Sym && bTag === VmTag.Sym) eq = this.vmAux[a] === this.vmAux[b]
          else if (aTag === VmTag.Bool && bTag === VmTag.Num) eq = (aNum != 0.0) === (bNum != 0.0)
          else if (aTag === VmTag.Num && bTag === VmTag.Bool) eq = (aNum != 0.0) === (bNum != 0.0)
          this.vmPush(VmTag.Bool, eq ? 1.0 : 0.0)
          return
        }

        if (aTag === VmTag.Num && bTag === VmTag.Num) {
          if (code === VmBinary.Lt) this.vmPush(VmTag.Bool, aNum < bNum ? 1.0 : 0.0)
          else if (code === VmBinary.Lte) this.vmPush(VmTag.Bool, aNum <= bNum ? 1.0 : 0.0)
          else if (code === VmBinary.Gt) this.vmPush(VmTag.Bool, aNum > bNum ? 1.0 : 0.0)
          else this.vmPush(VmTag.Bool, aNum >= bNum ? 1.0 : 0.0)
          return
        }

        this.vmPush(VmTag.Bool, 0.0)
        return
      }

      this.vmPush(VmTag.Undef)
      return
    }

    const aPtr$ = this.vmToAudioPtr(aTag, aNum, this.vmAux[a], length)
    const bPtr$ = this.vmToAudioPtr(bTag, bNum, this.vmAux[b], length)
    const outIndex = this.vmAllocOut()
    const out$ = this.program.getOutBuffer(outIndex)

    if (code === VmBinary.Add) addAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Sub) subAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Mul) mulAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Div) divAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Mod) modAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Pow) powAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Eq) eqAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Lt) ltAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Lte) lteAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Gt) gtAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Gte) gteAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.BitOr) bitOrAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.BitXor) bitXorAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.BitAnd) bitAndAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Shl) shlAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Shr) shrAudio(out$, aPtr$, bPtr$, length)
    else if (code === VmBinary.Ushr) ushrAudio(out$, aPtr$, bPtr$, length)
    else clearAudio(out$, length)

    this.vmPush(VmTag.Audio, 0.0, outIndex)
  }

  private vmPlayMini(arrayIndex: i32, cbAux: i32, length: i32, left$: usize, right$: usize): void {
    const voiceCountOut = this.vmAllocOut()
    const trigOuts = this.miniTrigOuts
    const velOuts = this.miniVelOuts
    const valOuts = this.miniValOuts

    for (let v = 0; v < SEQ_VOICES; v++) {
      const t = this.vmAllocOut()
      const vel = this.vmAllocOut()
      const val = this.vmAllocOut()
      trigOuts[v] = t
      velOuts[v] = vel
      valOuts[v] = val
    }

    const mini = this.program.gensPool.get(Op.Mini) as Mini
    mini.bytecode$ = changetype<usize>(this.program.data.arrays[arrayIndex])
    mini.history$ = changetype<usize>(this.program.histories[arrayIndex])
    mini.outVoiceCount$ = this.program.getOutBuffer(voiceCountOut)
    for (let v = 0; v < SEQ_VOICES; v++) {
      mini.outTrig$[v] = this.program.getOutBuffer(trigOuts[v])
      mini.outVelocity$[v] = this.program.getOutBuffer(velOuts[v])
      mini.outValue$[v] = this.program.getOutBuffer(valOuts[v])
    }

    mini.process(0, length)

    const mixOut = this.vmAllocOut()
    const mixOut$ = this.program.getOutBuffer(mixOut)
    clearAudio(mixOut$, length)

    const scopeTrigIndex = this.vmAllocOut()
    const scopeVelIndex = this.vmAllocOut()
    const scopeValIndex = this.vmAllocOut()

    const bodyBufBase = this.outCursor

    // Prepare args arrays for callback invocation (must not alias call scratch arrays)
    const argTags = this.cbArgTags
    const argNums = this.cbArgNums
    const argAux = this.cbArgAux
    argTags[0] = VmTag.Audio
    argNums[0] = 0.0
    argAux[0] = scopeTrigIndex
    argTags[1] = VmTag.Audio
    argNums[1] = 0.0
    argAux[1] = scopeVelIndex
    argTags[2] = VmTag.Audio
    argNums[2] = 0.0
    argAux[2] = scopeValIndex

    for (let v = 0; v < SEQ_VOICES; v++) {
      const remapBase = CALLBACK_SCOPE_BASE + v * CALLBACK_SCOPE_BUFFERS_PER_VOICE
      this.program.pushCallbackScope(bodyBufBase, remapBase)
      this.program.bindScope(scopeTrigIndex, this.program.getOutBuffer(trigOuts[v]))
      this.program.bindScope(scopeVelIndex, this.program.getOutBuffer(velOuts[v]))
      this.program.bindScope(scopeValIndex, this.program.getOutBuffer(valOuts[v]))

      // Reuse the same body buffer indices for each voice; remapping makes them per-voice.
      this.outCursor = bodyBufBase
      this.vmSp = 0

      this.vmInvokeFunc(cbAux, 3, argTags, argNums, argAux, length, left$, right$)

      if (vmErrorCode !== 0) {
        this.program.popCallbackScope()
        return
      }

      const outIdx = this.vmPop()
      const outTag = this.vmTag[outIdx] as VmTag
      const outNum = this.vmNum[outIdx]
      const outAux = this.vmAux[outIdx]
      const voiceAudio$ = this.vmToAudioPtr(outTag, outNum, outAux, length)
      addAudio(mixOut$, mixOut$, voiceAudio$, length)

      this.program.popCallbackScope()
    }

    this.vmPush(VmTag.Audio, 0.0, mixOut)
  }

  private vmCall(pos: i32, named: i32, length: i32, left$: usize, right$: usize): void {
    // Named args are on stack as (nameSym, value) pairs.
    // Collect named args into linear arrays (small fixed cap).
    const maxNamed = 8
    const nameSyms = this.callKeySyms
    const nameTags = this.callValTags
    const nameNums = this.callValNums
    const nameAux = this.callValAux

    let namedCount = named
    if (namedCount > maxNamed) namedCount = maxNamed

    for (let i = 0; i < namedCount; i++) {
      const val = this.vmPop()
      const key = this.vmPop()

      nameSyms[i] = this.vmAux[key] // sym id is stored in aux for VmTag.Sym
      nameTags[i] = this.vmTag[val]
      nameNums[i] = this.vmNum[val]
      nameAux[i] = this.vmAux[val]
    }

    // Collect positional args (reverse on stack).
    const maxPos = 8
    const posTags = this.callPosTags
    const posNums = this.callPosNums
    const posAux = this.callPosAux
    let posCount = pos
    if (posCount > maxPos) posCount = maxPos
    for (let i = posCount - 1; i >= 0; i--) {
      const idx = this.vmPop()
      posTags[i] = this.vmTag[idx]
      posNums[i] = this.vmNum[idx]
      posAux[i] = this.vmAux[idx]
    }

    const callee = this.vmPop()
    const calleeTag = this.vmTag[callee] as VmTag
    const calleeAux = this.vmAux[callee]

    if (calleeTag !== VmTag.Builtin) {
      this.vmPush(VmTag.Undef)
      return
    }

    if (calleeAux === VmBuiltin.Out) {
      if (posCount < 1) {
        this.vmPush(VmTag.Undef)
        return
      }
      const aTag = posTags[0] as VmTag
      const aNum = posNums[0]
      const aAux = posAux[0]
      const aPtr$ = this.vmToAudioPtr(aTag, aNum, aAux, length)
      addAudio(left$, left$, aPtr$, length)
      addAudio(right$, right$, aPtr$, length)
      // Return the input
      if (aTag === VmTag.Audio) this.vmPush(VmTag.Audio, 0.0, aAux)
      else this.vmPush(aTag, aNum, aAux)
      return
    }

    if (calleeAux === VmBuiltin.Timeline) {
      // timeline(seq)
      if (posCount < 1) {
        this.vmPush(VmTag.Undef)
        return
      }

      // Backwards compatibility: timeline(beatDiv, seq) is accepted, but beatDiv
      // is compile-time only (durations are compiled to absolute beats).
      const seqPos: i32 = posCount >= 2 ? 1 : 0
      const arrayTag: VmTag = posTags[seqPos] as VmTag
      const arrayNum: f64 = posNums[seqPos]
      if (arrayTag !== VmTag.Num) {
        this.vmPush(VmTag.Undef)
        return
      }

      const outIndex: i32 = this.vmAllocOut()
      const out$: usize = this.program.getOutBuffer(outIndex)

      const arrayIndex: i32 = i32(arrayNum)
      const timeline: Timeline = this.program.gensPool.get(Op.Timeline) as Timeline
      timeline.bytecode$ = changetype<usize>(this.program.data.arrays[arrayIndex])
      timeline.history$ = changetype<usize>(this.program.histories[arrayIndex])
      timeline.beatDiv = 0.0
      timeline.process(out$, length)

      this.vmPush(VmTag.Audio, 0.0, outIndex)
      return
    }

    if (calleeAux === VmBuiltin.Analyser) {
      // analyser(audio, index=0)
      if (posCount < 1) {
        this.vmPush(VmTag.Undef)
        return
      }

      const aTag = posTags[0] as VmTag
      const aNum = posNums[0]
      const aAux = posAux[0]
      const aPtr$ = this.vmToAudioPtr(aTag, aNum, aAux, length)

      // Optional second positional argument selects analyser index
      let analyserIndex = 0
      if (posCount >= 2 && posTags[1] === VmTag.Num) analyserIndex = i32(posNums[1])
      if (analyserIndex < 0) analyserIndex = 0

      const analyser$ = this.program.analyserOutsPool.get(analyserIndex)
      const baseOffset = this.analyserRingBase
      // Copy samples into the analyser ring buffer at current base
      for (let i = 0; i < length; i++) {
        const s = load<f32>(aPtr$ + (i * 4) as usize)
        store<f32>(analyser$ + ((baseOffset + i) * 4) as usize, s)
      }

      // Return the input unchanged
      if (aTag === VmTag.Audio) this.vmPush(VmTag.Audio, 0.0, aAux)
      else this.vmPush(aTag, aNum, aAux)
      return
    }

    if (calleeAux === VmBuiltin.Sine) {
      const hzTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
      const hzNum = posCount >= 1 ? posNums[0] : 0.0
      const hzAux = posCount >= 1 ? posAux[0] : 0
      const trigTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
      const trigNum = posCount >= 2 ? posNums[1] : 0.0
      const trigAux = posCount >= 2 ? posAux[1] : 0

      const hz$ = this.vmToAudioPtr(hzTag, hzNum, hzAux, length)
      const trig$ = this.vmToAudioPtr(trigTag, trigNum, trigAux, length)

      const outIndex = this.vmAllocOut()
      const out$ = this.program.getOutBuffer(outIndex)

      const sin = this.program.gensPool.get(Op.Sine) as Sine
      sin.hz$ = hz$
      sin.trig$ = trig$
      sin.process(out$, length)

      this.vmPush(VmTag.Audio, 0.0, outIndex)
      return
    }

    if (calleeAux === VmBuiltin.Ad) {
      const attackTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
      const attackNum = posCount >= 1 ? posNums[0] : 0.0
      const attackAux = posCount >= 1 ? posAux[0] : 0
      const decayTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
      const decayNum = posCount >= 2 ? posNums[1] : 0.0
      const decayAux = posCount >= 2 ? posAux[1] : 0
      const trigTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
      const trigNum = posCount >= 3 ? posNums[2] : 0.0
      const trigAux = posCount >= 3 ? posAux[2] : 0

      const attack$ = this.vmToAudioPtr(attackTag, attackNum, attackAux, length)
      const decay$ = this.vmToAudioPtr(decayTag, decayNum, decayAux, length)
      const trig$ = this.vmToAudioPtr(trigTag, trigNum, trigAux, length)

      const outIndex = this.vmAllocOut()
      const out$ = this.program.getOutBuffer(outIndex)

      const ad = this.program.gensPool.get(Op.Ad) as Ad
      ad.attack$ = attack$
      ad.decay$ = decay$
      ad.trig$ = trig$
      ad.process(out$, length)

      this.vmPush(VmTag.Audio, 0.0, outIndex)
      return
    }

    if (calleeAux === VmBuiltin.Adsr) {
      // Positional fallback: (attack, decay, sustain, release, trig)
      let attackTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
      let attackNum = posCount >= 1 ? posNums[0] : 0.0
      let attackAux = posCount >= 1 ? posAux[0] : 0
      let decayTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
      let decayNum = posCount >= 2 ? posNums[1] : 0.0
      let decayAux = posCount >= 2 ? posAux[1] : 0
      let sustainTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
      let sustainNum = posCount >= 3 ? posNums[2] : 0.0
      let sustainAux = posCount >= 3 ? posAux[2] : 0
      let releaseTag = posCount >= 4 ? (posTags[3] as VmTag) : VmTag.Num
      let releaseNum = posCount >= 4 ? posNums[3] : 0.0
      let releaseAux = posCount >= 4 ? posAux[3] : 0
      let trigTag = posCount >= 5 ? (posTags[4] as VmTag) : VmTag.Num
      let trigNum = posCount >= 5 ? posNums[4] : 0.0
      let trigAux = posCount >= 5 ? posAux[4] : 0

      // Named overrides (attack/decay/sustain/release/trig)
      for (let i = 0; i < namedCount; i++) {
        const k = nameSyms[i]
        if (k === 100) {
          attackTag = nameTags[i] as VmTag
          attackNum = nameNums[i]
          attackAux = nameAux[i]
        }
        else if (k === 101) {
          decayTag = nameTags[i] as VmTag
          decayNum = nameNums[i]
          decayAux = nameAux[i]
        }
        else if (k === 102) {
          sustainTag = nameTags[i] as VmTag
          sustainNum = nameNums[i]
          sustainAux = nameAux[i]
        }
        else if (k === 103) {
          releaseTag = nameTags[i] as VmTag
          releaseNum = nameNums[i]
          releaseAux = nameAux[i]
        }
        else if (k === 104) {
          trigTag = nameTags[i] as VmTag
          trigNum = nameNums[i]
          trigAux = nameAux[i]
        }
      }

      const attack$ = this.vmToAudioPtr(attackTag, attackNum, attackAux, length)
      const decay$ = this.vmToAudioPtr(decayTag, decayNum, decayAux, length)
      const sustain$ = this.vmToAudioPtr(sustainTag, sustainNum, sustainAux, length)
      const release$ = this.vmToAudioPtr(releaseTag, releaseNum, releaseAux, length)
      const trig$ = this.vmToAudioPtr(trigTag, trigNum, trigAux, length)

      const outIndex = this.vmAllocOut()
      const out$ = this.program.getOutBuffer(outIndex)

      const adsr = this.program.gensPool.get(Op.Adsr) as Adsr
      adsr.attack$ = attack$
      adsr.decay$ = decay$
      adsr.sustain$ = sustain$
      adsr.release$ = release$
      adsr.trig$ = trig$
      adsr.process(out$, length)

      this.vmPush(VmTag.Audio, 0.0, outIndex)
      return
    }

    if (calleeAux === VmBuiltin.Mini) {
      if (posCount < 1) {
        this.vmPush(VmTag.Undef)
        return
      }

      const arrayTag = posTags[0] as VmTag
      const arrayNum = posNums[0]
      if (arrayTag !== VmTag.Num) {
        this.vmPush(VmTag.Undef)
        return
      }

      // mini(seq) -> seq
      if (posCount === 1) {
        this.vmPush(VmTag.Num, arrayNum)
        return
      }

      const cbTag = posTags[1] as VmTag
      const cbAux = posAux[1]
      if (cbTag !== VmTag.Func) {
        this.vmPush(VmTag.Undef)
        return
      }

      this.vmPlayMini(i32(arrayNum), cbAux, length, left$, right$)
      return
    }

    if (calleeAux === VmBuiltin.Play) {
      if (posCount < 2) {
        this.vmPush(VmTag.Undef)
        return
      }

      const arrayTag = posTags[0] as VmTag
      const arrayNum = posNums[0]
      const cbTag = posTags[1] as VmTag
      const cbAux = posAux[1]

      if (arrayTag !== VmTag.Num || cbTag !== VmTag.Func) {
        this.vmPush(VmTag.Undef)
        return
      }

      this.vmPlayMini(i32(arrayNum), cbAux, length, left$, right$)
      return
    }

    this.vmPush(VmTag.Undef)
  }

  private runVmSegments(left$: usize, right$: usize, begin: i32, length: i32): void {
    const ops = this.program.data.ops
    const step = controlBlockSize > 0 && controlBlockSize < length ? controlBlockSize : length

    clearAudio(left$, length)
    clearAudio(right$, length)

    for (let offset = 0; offset < length; offset += step) {
      const block = offset + step <= length ? step : length - offset

      this.program.gensPool.resetIndices()
      this.vmSp = 0
      this.outCursor = 0
      this.envCount = 0
      this.scopeDepth = 0
      this.arrCount = 0
      this.arrElemCount = 0
      for (let i = 0; i < this.smoothedHas.length; i++) {
        this.smoothedHas[i] = 0
      }

      const leftBlock$ = left$ + (offset * 4) as usize
      const rightBlock$ = right$ + (offset * 4) as usize

      // Track ring write base for analyser() calls (begin is the ring base in samples)
      this.analyserRingBase = begin + offset
      this.vmExec(1, ops.length, block, leftBlock$, rightBlock$, false)

      if (vmErrorCode !== 0) return
    }
  }

  private processVm(left$: usize, right$: usize, begin: i32, length: i32): void {
    const startSampleCount = globalSampleCount
    const incoming = this.program.data

    clearVmError()
    this.runVmSegments(left$, right$, begin, length)

    if (vmErrorCode === 0) {
      this.lastGoodData = incoming
      return
    }

    const lastGood = this.lastGoodData
    if (lastGood === null || lastGood === incoming) {
      // No fallback available; keep silence for this block.
      globalSampleCount = startSampleCount + length
      return
    }

    // Re-run the same block using the last known-good program.
    this.program.data = lastGood
    globalSampleCount = startSampleCount
    clearVmError()
    this.runVmSegments(left$, right$, begin, length)
  }

  @inline
  process(left$: usize, right$: usize, begin: i32, length: i32): void {
    const lockPtr = changetype<usize>(this.program) + offsetof<Program>('lock')
    while (true) {
      const observed = atomic.cmpxchg<i32>(lockPtr, 0, 1)
      if (observed === 0) break
      atomic.wait<i32>(lockPtr, observed, -1)
    }

    const ops = this.program.data.ops
    if (ops[0] !== VM_MAGIC) {
      clearAudio(left$, length)
      clearAudio(right$, length)
      globalSampleCount += length
    }
    else {
      this.processVm(left$, right$, begin, length)
    }

    atomic.store<i32>(lockPtr, 0)
    atomic.notify(lockPtr, 1)
  }
}
