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
    if (sym === VmSym.Out) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Out)
      return
    }
    if (sym === VmSym.Solo) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Solo)
      return
    }
    if (sym === VmSym.Post) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Post)
      return
    }
    if (sym === VmSym.Sine) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sine)
      return
    }
    if (sym === VmSym.Tri) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Tri)
      return
    }
    if (sym === VmSym.Saw) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Saw)
      return
    }
    if (sym === VmSym.Ramp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Ramp)
      return
    }
    if (sym === VmSym.Sqr) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sqr)
      return
    }
    if (sym === VmSym.Pwm) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Pwm)
      return
    }
    if (sym === VmSym.Phasor) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Phasor)
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
    if (sym === VmSym.Compressor) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Compressor)
      return
    }
    if (sym === VmSym.Limiter) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Limiter)
      return
    }
    if (sym === VmSym.Freeverb) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Freeverb)
      return
    }
    if (sym === VmSym.Dattorro) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Dattorro)
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
    if (sym === VmSym.Euclid) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Euclid)
      return
    }
    if (sym === VmSym.LfoSine) {
      stack.push(VmTag.Builtin, 0.0, VmSym.LfoSine)
      return
    }
    if (sym === VmSym.LfoTri) {
      stack.push(VmTag.Builtin, 0.0, VmSym.LfoTri)
      return
    }
    if (sym === VmSym.LfoSaw) {
      stack.push(VmTag.Builtin, 0.0, VmSym.LfoSaw)
      return
    }
    if (sym === VmSym.LfoRamp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.LfoRamp)
      return
    }
    if (sym === VmSym.LfoSqr) {
      stack.push(VmTag.Builtin, 0.0, VmSym.LfoSqr)
      return
    }
    if (sym === VmSym.LfoSah) {
      stack.push(VmTag.Builtin, 0.0, VmSym.LfoSah)
      return
    }
    if (sym === VmSym.Lp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Lp)
      return
    }
    if (sym === VmSym.Hp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Hp)
      return
    }
    if (sym === VmSym.Bp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Bp)
      return
    }
    if (sym === VmSym.Bs) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Bs)
      return
    }
    if (sym === VmSym.Ls) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Ls)
      return
    }
    if (sym === VmSym.Hs) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Hs)
      return
    }
    if (sym === VmSym.Peak) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Peak)
      return
    }
    if (sym === VmSym.Ap) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Ap)
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
    if (sym === VmSym.Avg) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Avg)
      return
    }
    if (sym === VmSym.Glide) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Glide)
      return
    }
    if (sym === VmSym.Slew) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Slew)
      return
    }
    if (sym === VmSym.White) {
      stack.push(VmTag.Builtin, 0.0, VmSym.White)
      return
    }
    if (sym === VmSym.Gauss) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Gauss)
      return
    }
    if (sym === VmSym.Pink) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Pink)
      return
    }
    if (sym === VmSym.Brown) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Brown)
      return
    }
    if (sym === VmSym.Smooth) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Smooth)
      return
    }
    if (sym === VmSym.Fractal) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Fractal)
      return
    }
    if (sym === VmSym.Delay) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Delay)
      return
    }
    if (sym === VmSym.Sin) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sin)
      return
    }
    if (sym === VmSym.Cos) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Cos)
      return
    }
    if (sym === VmSym.Tan) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Tan)
      return
    }
    if (sym === VmSym.Asin) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Asin)
      return
    }
    if (sym === VmSym.Acos) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Acos)
      return
    }
    if (sym === VmSym.Tanh) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Tanh)
      return
    }
    if (sym === VmSym.Atan) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Atan)
      return
    }
    if (sym === VmSym.Abs) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Abs)
      return
    }
    if (sym === VmSym.Sqrt) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sqrt)
      return
    }
    if (sym === VmSym.Square) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Square)
      return
    }
    if (sym === VmSym.Cube) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Cube)
      return
    }
    if (sym === VmSym.Hypot) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Hypot)
      return
    }
    if (sym === VmSym.Log) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Log)
      return
    }
    if (sym === VmSym.Exp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Exp)
      return
    }
    if (sym === VmSym.Log10) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Log10)
      return
    }
    if (sym === VmSym.Log2) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Log2)
      return
    }
    if (sym === VmSym.Exp2) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Exp2)
      return
    }
    if (sym === VmSym.Min) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Min)
      return
    }
    if (sym === VmSym.Max) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Max)
      return
    }
    if (sym === VmSym.Clamp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Clamp)
      return
    }
    if (sym === VmSym.Wrap) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Wrap)
      return
    }
    if (sym === VmSym.Mod) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Mod)
      return
    }
    if (sym === VmSym.Pingpong) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Pingpong)
      return
    }
    if (sym === VmSym.Fold) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Fold)
      return
    }
    if (sym === VmSym.Floor) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Floor)
      return
    }
    if (sym === VmSym.Ceil) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Ceil)
      return
    }
    if (sym === VmSym.Round) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Round)
      return
    }
    if (sym === VmSym.Trunc) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Trunc)
      return
    }
    if (sym === VmSym.Snap) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Snap)
      return
    }
    if (sym === VmSym.Fract) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Fract)
      return
    }
    if (sym === VmSym.Sign) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Sign)
      return
    }
    if (sym === VmSym.Lerp) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Lerp)
      return
    }
    if (sym === VmSym.Smoothstep) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Smoothstep)
      return
    }
    if (sym === VmSym.Smootherstep) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Smootherstep)
      return
    }
    if (sym === VmSym.Step) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Step)
      return
    }
    if (sym === VmSym.Heaviside) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Heaviside)
      return
    }
    if (sym === VmSym.Select) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Select)
      return
    }
    if (sym === VmSym.Isnan) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Isnan)
      return
    }
    if (sym === VmSym.Isinf) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Isinf)
      return
    }
    if (sym === VmSym.Safediv) {
      stack.push(VmTag.Builtin, 0.0, VmSym.Safediv)
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

  reset(): void {
    this.count = 0
    this.scopeDepth = 0
  }
}
