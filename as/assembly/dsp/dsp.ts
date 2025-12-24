import { BRANCH_HISTORY_ENTRY_SIZE, BRANCH_HISTORY_SIZE } from '../constants'
import { clearVmError, controlBlockSize, setVmError, vmErrorCode } from '../globals'
import { Program } from '../program'
import { ProgramData } from '../program-data'
import { clearAudio, selectAudio } from './audio-ops'
import { VM_FUNC_HEADER, VM_MAGIC, VmBinary, VmOp, VmTag, VmUnary } from './types'
import { VmArrays } from './vm-arrays'
import { VmAudio } from './vm-audio'
import { vmBinaryOp } from './vm-binary'
import { VmBuiltins } from './vm-builtins'
import { VmEnv } from './vm-env'
import { VmStack } from './vm-stack'

export class Dsp {
  program: Program = new Program()
  private lastGoodData: ProgramData | null = null

  private stack: VmStack = new VmStack()
  private env: VmEnv = new VmEnv()
  arrays: VmArrays = new VmArrays()
  private audio: VmAudio = new VmAudio()
  private builtins: VmBuiltins = new VmBuiltins()

  private funcParamSyms: StaticArray<i32> = new StaticArray<i32>(8)

  // Audio-conditional `if` support. Must not allocate inside `vmExec`.
  private ifStackDepth: i32 = 0
  private ifEndPc: StaticArray<i32> = new StaticArray<i32>(64)
  private ifElsePc: StaticArray<i32> = new StaticArray<i32>(64)
  private ifCondAux: StaticArray<i32> = new StaticArray<i32>(64)
  private ifCondPc: StaticArray<i32> = new StaticArray<i32>(64)
  private ifBaseSp: StaticArray<i32> = new StaticArray<i32>(64)
  private ifThenBranchPc: StaticArray<i32> = new StaticArray<i32>(64)
  private ifThenTag: StaticArray<i32> = new StaticArray<i32>(64)
  private ifThenNum: StaticArray<f64> = new StaticArray<f64>(64)
  private ifThenAux: StaticArray<i32> = new StaticArray<i32>(64)
  private ifThenHas: StaticArray<i32> = new StaticArray<i32>(64)

  reset(): void {
    this.program.reset()
  }

  @inline
  private recordBranch(ifPc: i32, branchPc: i32): void {
    if (ifPc <= 0 || branchPc <= 0) return
    // Best-effort ring buffer for UI widgets (no atomics needed).
    const hist: StaticArray<f32> = this.program.branchHistory
    const writePos: i32 = i32(hist[0])
    const slot: i32 = writePos % BRANCH_HISTORY_SIZE
    const base: i32 = 1 + slot * BRANCH_HISTORY_ENTRY_SIZE
    hist[base] = f32(ifPc)
    hist[base + 1] = f32(branchPc)
    hist[0] = f32((writePos + 1) & 0xfffff)
  }

  private vmExec(pcStart: i32, pcEnd: i32, length: i32, left$: usize, right$: usize, stopOnReturn: bool): i32 {
    const ops = this.program.data.ops
    let pc = pcStart
    let ret: i32 = -1

    const ifMaxDepth: i32 = 8
    const ifBase: i32 = this.ifStackDepth
    let ifEnabled: bool = false
    if (ifBase + ifMaxDepth <= this.ifEndPc.length) {
      ifEnabled = true
      this.ifStackDepth = ifBase + ifMaxDepth
    }
    let ifDepth: i32 = 0

    while (pc >= 0 && pc < pcEnd) {
      // Nested audio-conditionals can share the same endPc (common with nested ternaries).
      // Merge all frames ending at this pc before executing the next instruction.
      while (ifEnabled && ifDepth > 0 && pc === this.ifEndPc[ifBase + ifDepth - 1]) {
        const f = ifDepth - 1
        const frame = ifBase + f
        const condOutIndex = this.ifCondAux[frame]
        const baseSp = this.ifBaseSp[frame]
        ifDepth = f

        const cond$ = this.program.getOutBuffer(condOutIndex)
        const elseIdx = baseSp

        const thenTag = this.ifThenTag[frame] as VmTag
        const thenNum = this.ifThenNum[frame]
        const thenAux = this.ifThenAux[frame]
        const elseTag = this.stack.tag[elseIdx] as VmTag
        const elseNum = this.stack.num[elseIdx]
        const elseAux = this.stack.aux[elseIdx]

        const thenSignal = thenTag === VmTag.Audio || thenTag === VmTag.Num || thenTag === VmTag.Bool
        const elseSignal = elseTag === VmTag.Audio || elseTag === VmTag.Num || elseTag === VmTag.Bool

        if (thenSignal && elseSignal) {
          const c0 = load<f32>(cond$) != (0.0 as f32)
          this.recordBranch(this.ifCondPc[frame], c0 ? this.ifThenBranchPc[frame] : this.ifElsePc[frame])
          const then$ = this.audio.toAudioPtr(thenTag, thenNum, thenAux, length, this.program)
          const else$ = this.audio.toAudioPtr(elseTag, elseNum, elseAux, length, this.program)
          const outIndex = this.audio.allocOut(this.program)
          const out$ = this.program.getOutBuffer(outIndex)
          selectAudio(out$, cond$, then$, else$, length)
          this.stack.sp = baseSp
          this.stack.push(VmTag.Audio, 0.0, outIndex)
        }
        else {
          const c0 = load<f32>(cond$) != (0.0 as f32)
          this.recordBranch(this.ifCondPc[frame], c0 ? this.ifThenBranchPc[frame] : this.ifElsePc[frame])
          this.stack.sp = baseSp
          if (c0) this.stack.push(thenTag, thenNum, thenAux)
          else this.stack.push(elseTag, elseNum, elseAux)
        }
      }

      const ins = ops[pc++]
      const op = ins as VmOp

      if (vmErrorCode !== 0) {
        ret = -1
        break
      }

      if (op === VmOp.End) {
        globalSampleCount += length
        ret = -1
        break
      }
      if (op === VmOp.Nop) continue
      if (op === VmOp.Branch) continue

      if (op === VmOp.PushNum) {
        const k = ops[pc++]
        const v = this.program.data.literals[k] as f64
        this.stack.push(VmTag.Num, v)
        continue
      }
      if (op === VmOp.PushNumSmoothed) {
        const k = ops[pc++]
        const v = this.program.data.literals[k] as f64
        this.stack.push(VmTag.Num, v, -1 - k)
        continue
      }
      if (op === VmOp.PushBool) {
        const v = ops[pc++]
        this.stack.push(VmTag.Bool, v != 0 ? 1.0 : 0.0)
        continue
      }
      if (op === VmOp.PushNull) {
        this.stack.push(VmTag.Null)
        continue
      }
      if (op === VmOp.PushUndef) {
        this.stack.push(VmTag.Undef)
        continue
      }
      if (op === VmOp.PushSym) {
        const sym = ops[pc++]
        this.stack.push(VmTag.Sym, 0.0, sym)
        continue
      }
      if (op === VmOp.Func) {
        const funcPc = ops[pc++]
        this.stack.push(VmTag.Func, 0.0, funcPc)
        continue
      }
      if (op === VmOp.Pop) {
        this.stack.pop()
        continue
      }
      if (op === VmOp.Dup) {
        const top = this.stack.peek()
        this.stack.push(this.stack.tag[top] as VmTag, this.stack.num[top], this.stack.aux[top])
        continue
      }
      if (op === VmOp.Load) {
        const sym = ops[pc++]
        this.env.load(sym, this.stack, this.audio, this.program, length)
        continue
      }
      if (op === VmOp.Store) {
        const sym = ops[pc++]
        this.env.store(sym, this.stack)
        continue
      }
      if (op === VmOp.Array) {
        const n = ops[pc++]
        this.arrays.create(n, this.stack, pc - 2)
        continue
      }
      if (op === VmOp.Len) {
        const idx = this.stack.pop()
        const tag = this.stack.tag[idx] as VmTag
        if (tag !== VmTag.Arr) {
          this.stack.push(VmTag.Undef)
          continue
        }
        const arrId = this.stack.aux[idx]
        if (arrId < 0 || arrId >= this.arrays.count) {
          this.stack.push(VmTag.Undef)
          continue
        }
        this.stack.push(VmTag.Num, f64(this.arrays.len[arrId]))
        continue
      }
      if (op === VmOp.GetIndex) {
        this.arrays.getIndex(this.stack, this.audio, this.program, length)
        continue
      }
      if (op === VmOp.GetIndex2) {
        this.arrays.getIndex2(this.stack, this.audio, this.program, length)
        continue
      }
      if (op === VmOp.SetIndex) {
        this.arrays.setIndex(this.stack)
        continue
      }
      if (op === VmOp.Unary) {
        const code = ops[pc++] as VmUnary
        const idx = this.stack.pop()
        const tag = this.stack.tag[idx] as VmTag
        const num = this.stack.num[idx]
        if (code === VmUnary.Neg && tag === VmTag.Num) {
          const aux = this.stack.aux[idx]
          if (aux < 0) {
            const in$ = this.audio.toAudioPtr(tag, num, aux, length, this.program)
            const outIndex = this.audio.allocOut(this.program)
            const out$ = this.program.getOutBuffer(outIndex)
            let p$ = out$
            for (let i = 0; i < length; i++) {
              store<f32>(p$, -load<f32>(in$ + (i * 4) as usize))
              p$ += 4
            }
            this.stack.push(VmTag.Audio, 0.0, outIndex)
          }
          else {
            this.stack.push(VmTag.Num, -num)
          }
        }
        else if (code === VmUnary.Not) this.stack.push(VmTag.Bool, this.stack.truthy(tag, num) ? 0.0 : 1.0)
        else if (code === VmUnary.BitNot && tag === VmTag.Num) this.stack.push(VmTag.Num, ~i32(num) as f64)
        else this.stack.push(VmTag.Undef)
        continue
      }
      if (op === VmOp.Binary) {
        const code = ops[pc++] as VmBinary
        vmBinaryOp(code, this.stack, this.audio, this.program, length)
        continue
      }
      if (op === VmOp.Call) {
        const pos = ops[pc++]
        const named = ops[pc++]
        this.vmCall(pos, named, length, left$, right$)
        continue
      }
      if (op === VmOp.Jump) {
        const target = ops[pc]
        if (ifEnabled && ifDepth > 0) {
          const frame = ifBase + ifDepth - 1
          const elsePc = this.ifElsePc[frame]
          // If this is the "skip else" jump of an audio-conditional if, fallthrough into else instead.
          if ((pc - 1) === (elsePc - 2) && target === this.ifEndPc[frame]) {
            if (this.ifThenHas[frame] === 0) {
              const thenIdx = this.stack.pop()
              this.ifThenTag[frame] = this.stack.tag[thenIdx]
              this.ifThenNum[frame] = this.stack.num[thenIdx]
              this.ifThenAux[frame] = this.stack.aux[thenIdx]
              this.ifThenHas[frame] = 1
            }
            pc = elsePc
            continue
          }
        }
        pc = target
        continue
      }
      if (op === VmOp.JumpIfFalse) {
        const to = ops[pc++]
        const ifPc = pc - 2
        const thenBranchPc = pc
        const idx = this.stack.pop()
        const tag = this.stack.tag[idx] as VmTag
        const num = this.stack.num[idx]
        if (tag === VmTag.Audio) {
          // Only apply audio-conditional `if` semantics for the shape produced by `compileIf`.
          // Avoid `||` patterns, which have an immediate `JUMP` after the condition.
          if (
            ifEnabled && ifDepth < ifMaxDepth
            && ops[pc] !== VmOp.Jump
            && (to - 2) >= 0 && ops[to - 2] === VmOp.Jump
          ) {
            const frame = ifBase + ifDepth
            this.ifEndPc[frame] = ops[to - 1]
            this.ifElsePc[frame] = to
            this.ifThenBranchPc[frame] = thenBranchPc
            this.ifCondAux[frame] = this.stack.aux[idx]
            this.ifCondPc[frame] = ifPc
            this.ifBaseSp[frame] = this.stack.sp
            this.ifThenHas[frame] = 0
            ifDepth++
          }
          else {
            // Fallback: use sample-0 truthiness for control flow.
            const cond$ = this.program.getOutBuffer(this.stack.aux[idx])
            const c0 = load<f32>(cond$) != (0.0 as f32)
            this.recordBranch(ifPc, c0 ? thenBranchPc : to)
            if (!c0) pc = to
          }
        }
        else {
          const c0 = this.stack.truthy(tag, num)
          this.recordBranch(ifPc, c0 ? thenBranchPc : to)
          if (!c0) pc = to
        }
        continue
      }
      if (op === VmOp.EnterScope) {
        this.env.enter()
        continue
      }
      if (op === VmOp.ExitScope) {
        this.env.exit()
        continue
      }
      if (op === VmOp.Return) {
        if (stopOnReturn) ret = pc
        else ret = -1
        break
      }
      if (op === VmOp.Throw) {
        setVmError(1, pc - 1)
        ret = -1
        break
      }
    }
    if (ifEnabled) this.ifStackDepth = ifBase
    return ret
  }

  @inline
  private vmCall(pos: i32, named: i32, length: i32, left$: usize, right$: usize): void {
    this.builtins.call(
      pos,
      named,
      this.stack,
      this.audio,
      this.program,
      length,
      left$,
      right$,
      this,
    )
  }

  @inline
  vmInvokeFunc(funcPc: i32, argCount: i32, argTags: StaticArray<i32>, argNums: StaticArray<f64>,
    argAux: StaticArray<i32>, length: i32, left$: usize, right$: usize): void
  {
    const ops = this.program.data.ops
    if (funcPc < 0 || funcPc >= ops.length) {
      setVmError(3, funcPc)
      this.stack.push(VmTag.Undef)
      return
    }
    if (ops[funcPc] !== VM_FUNC_HEADER) {
      setVmError(3, funcPc)
      this.stack.push(VmTag.Undef)
      return
    }

    const paramCount = ops[funcPc + 1]
    const maxParams = this.funcParamSyms.length
    const n = paramCount < maxParams ? paramCount : maxParams
    for (let i = 0; i < n; i++) {
      this.funcParamSyms[i] = ops[funcPc + 2 + i]
    }
    const bodyPc = funcPc + 2 + paramCount

    const savedEnv = this.env.count
    const savedDepth = this.env.scopeDepth
    const savedOut = this.audio.outCursor

    this.env.enter()

    for (let i = 0; i < n; i++) {
      const sym = this.funcParamSyms[i]
      if (i < argCount) {
        this.env.define(sym, argTags[i] as VmTag, argNums[i], argAux[i])
      }
      else {
        this.env.define(sym, VmTag.Undef, 0.0, 0)
      }
    }

    this.vmExec(bodyPc, ops.length, length, left$, right$, true)

    this.env.count = savedEnv
    this.env.scopeDepth = savedDepth
    this.audio.outCursor = savedOut
  }

  @inline
  private runVmSegments(left$: usize, right$: usize, begin: i32, length: i32): void {
    const ops = this.program.data.ops
    const step = controlBlockSize > 0 && controlBlockSize < length ? controlBlockSize : length

    clearAudio(left$, length)
    clearAudio(right$, length)

    for (let offset = 0; offset < length; offset += step) {
      const block = offset + step <= length ? step : length - offset

      this.program.gensPool.resetIndices()
      this.stack.reset()
      this.audio.reset()
      this.env.reset()
      this.arrays.reset()

      const leftBlock$ = left$ + (offset * 4) as usize
      const rightBlock$ = right$ + (offset * 4) as usize

      // Track ring write base for analyser() calls (begin is the ring base in samples)
      this.builtins.analyserRingBase = begin + offset
      this.vmExec(1, ops.length, block, leftBlock$, rightBlock$, false)

      if (vmErrorCode !== 0) return
    }
  }

  @inline
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
