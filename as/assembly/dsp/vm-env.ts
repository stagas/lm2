import { setVmError } from '../globals'
import { Program } from '../program'
import { VmTag } from './types'
import { VmAudio } from './vm-audio'
import { VmStack } from './vm-stack'
import { VmSym } from './vm-sym'

export class VmEnv {
  count: i32 = 0
  sym: StaticArray<i32> = new StaticArray<i32>(512)
  tag: StaticArray<i32> = new StaticArray<i32>(512)
  num: StaticArray<f64> = new StaticArray<f64>(512)
  aux: StaticArray<i32> = new StaticArray<i32>(512)
  scopeDepth: i32 = 0
  scopeStart: StaticArray<i32> = new StaticArray<i32>(64)

  enter(): void {
    const d = this.scopeDepth
    if (d < 0 || d >= this.scopeStart.length) {
      setVmError(13, 0)
      return
    }
    this.scopeStart[d] = this.count
    this.scopeDepth = d + 1
  }

  exit(): void {
    if (this.scopeDepth <= 0) return
    this.scopeDepth--
    this.count = this.scopeStart[this.scopeDepth]
  }

  find(sym: i32): i32 {
    for (let i = this.count - 1; i >= 0; i--) {
      if (this.sym[i] === sym) return i
    }
    return -1
  }

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

  load(sym: i32, stack: VmStack, audio: VmAudio, program: Program, length: i32): void {
    const idx = this.find(sym)
    if (idx >= 0) {
      stack.push(this.tag[idx] as VmTag, this.num[idx], this.aux[idx])
      return
    }

    // Builtins are implicit globals
    switch (sym) {
      case VmSym.T: {
        const outIndex = audio.getTRamp(length, program)
        stack.push(VmTag.Audio, 0.0, outIndex)
        return
      }

      case VmSym.Co:
        stack.push(VmTag.Num, bpm / 60)
        return

      // Runtime directive globals (defaults)
      case VmSym.Tune:
        stack.push(VmTag.Num, 1.0)
        return
      case VmSym.Octave:
      case VmSym.Transpose:
      case VmSym.Scale:
        stack.push(VmTag.Num, 0.0)
        return

      default:
        stack.push(VmTag.Builtin, 0.0, sym)
        return
    }
  }

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

  reset(): void {
    this.count = 0
    this.scopeDepth = 0
  }
}
