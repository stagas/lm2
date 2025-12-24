import { setVmError } from '../globals'
import { Program } from '../program'
import { VmSym } from '../syms'
import { VmTag } from './types'
import { VmAudio } from './vm-audio'
import { VmStack } from './vm-stack'

export class VmEnv {
  count: i32 = 0
  sym: StaticArray<i32> = new StaticArray<i32>(512)
  tag: StaticArray<i32> = new StaticArray<i32>(512)
  num: StaticArray<f64> = new StaticArray<f64>(512)
  aux: StaticArray<i32> = new StaticArray<i32>(512)
  scopeDepth: i32 = 0
  scopeStart: StaticArray<i32> = new StaticArray<i32>(64)

  @inline
  enter(): void {
    const d = this.scopeDepth
    if (d < 0 || d >= this.scopeStart.length) {
      setVmError(13, 0)
      return
    }
    this.scopeStart[d] = this.count
    this.scopeDepth = d + 1
  }

  @inline
  exit(): void {
    if (this.scopeDepth <= 0) return
    this.scopeDepth--
    this.count = this.scopeStart[this.scopeDepth]
  }

  @inline
  find(sym: i32): i32 {
    for (let i = this.count - 1; i >= 0; i--) {
      if (this.sym[i] === sym) return i
    }
    return -1
  }

  @inline
  define(sym: i32, tag: VmTag, num: f64, aux: i32): void {
    const at = this.count
    if (at < 0 || at >= this.sym.length) {
      setVmError(12, 0)
      return
    }
    this.sym[at] = sym
    this.tag[at] = tag
    this.num[at] = num
    this.aux[at] = aux
    this.count = at + 1
  }

  @inline
  load(sym: i32, stack: VmStack, audio: VmAudio, program: Program, length: i32): void {
    const idx = this.find(sym)
    if (idx >= 0) {
      stack.push(this.tag[idx] as VmTag, this.num[idx], this.aux[idx])
      return
    }

    // Builtins are implicit globals
    if (sym === VmSym.Out) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Out)
      return
    }
    if (sym === VmSym.Sine) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sine)
      return
    }
    if (sym === VmSym.Ad) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Ad)
      return
    }
    if (sym === VmSym.Adsr) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Adsr)
      return
    }
    if (sym === VmSym.Analyser) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Analyser)
      return
    }
    if (sym === VmSym.Mini) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Mini)
      return
    }
    if (sym === VmSym.Play) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Play)
      return
    }
    if (sym === VmSym.PlayPick) {
      stack.push(VmTag.Builtin, 0.0, VmSym.PlayPick)
      return
    }
    if (sym === VmSym.Timeline) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Timeline)
      return
    }
    if (sym === VmSym.Sampler) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sampler)
      return
    }
    if (sym === VmSym.Slicer) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Slicer)
      return
    }
    if (sym === VmSym.Every) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Every)
      return
    }
    if (sym === VmSym.At) {
      stack.push(VmTag.Builtin, 0.0, VmSym.At)
      return
    }
    if (sym === VmSym.Note) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Note)
      return
    }
    if (sym === VmSym.Degree) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Degree)
      return
    }
    if (sym === VmSym.Map) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Map)
      return
    }
    if (sym === VmSym.Sum) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sum)
      return
    }
    if (sym === VmSym.T) {
      const outIndex = audio.getTRamp(length, program)
      stack.push(VmTag.Audio, 0.0, outIndex)
      return
    }
    if (sym === VmSym.Co) {
      stack.push(VmTag.Num, bpm / 60)
      return
    }

    // Runtime directive globals (defaults)
    if (sym === VmSym.Tune) {
      stack.push(VmTag.Num, 1.0)
      return
    }
    if (sym === VmSym.Octave) {
      stack.push(VmTag.Num, 0.0)
      return
    }
    if (sym === VmSym.Transpose) {
      stack.push(VmTag.Num, 0.0)
      return
    }
    if (sym === VmSym.Scale) {
      stack.push(VmTag.Num, 0.0)
      return
    }

    stack.push(VmTag.Undef)
  }

  @inline
  store(sym: i32, stack: VmStack): void {
    const top = stack.peek()
    const tag = stack.tag[top] as VmTag
    const num = stack.num[top]
    const aux = stack.aux[top]

    const idx = this.find(sym)
    if (idx >= 0) {
      this.tag[idx] = tag
      this.num[idx] = num
      this.aux[idx] = aux
      return
    }

    const at = this.count
    this.sym[at] = sym
    this.tag[at] = tag
    this.num[at] = num
    this.aux[at] = aux
    this.count = at + 1
  }

  @inline
  reset(): void {
    this.count = 0
    this.scopeDepth = 0
  }
}
