import { SEQ_VOICES } from '../constants'
import { Program } from '../program'
import { callAd } from './builtins/ad'
import { callAdsr } from './builtins/adsr'
import { callAnalyser } from './builtins/analyser'
import { callAt } from './builtins/at'
import { callEvery } from './builtins/every'
import { callMini } from './builtins/mini'
import { callDegree } from './builtins/degree'
import { callMap } from './builtins/map'
import { callSum } from './builtins/sum'
import { callNote } from './builtins/note'
import { callOut } from './builtins/out'
import { callPlay } from './builtins/play'
import { callPlayPick } from './builtins/play-pick'
import { callSampler } from './builtins/sampler'
import { callSine } from './builtins/sine'
import { callSlicer } from './builtins/slicer'
import { callSlew } from './builtins/slew'
import { callTimeline } from './builtins/timeline'
import { Dsp } from './dsp'
import { VmBuiltin, VmTag } from './types'
import { VmAudio } from './vm-audio'
import { VmStack } from './vm-stack'

export class VmBuiltins {
  callKeySyms: StaticArray<i32> = new StaticArray<i32>(8)
  callValTags: StaticArray<i32> = new StaticArray<i32>(8)
  callValNums: StaticArray<f64> = new StaticArray<f64>(8)
  callValAux: StaticArray<i32> = new StaticArray<i32>(8)
  callPosTags: StaticArray<i32> = new StaticArray<i32>(8)
  callPosNums: StaticArray<f64> = new StaticArray<f64>(8)
  callPosAux: StaticArray<i32> = new StaticArray<i32>(8)

  miniTrigOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  miniVelOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  miniValOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)

  cbArgTags: StaticArray<i32> = new StaticArray<i32>(3)
  cbArgNums: StaticArray<f64> = new StaticArray<f64>(3)
  cbArgAux: StaticArray<i32> = new StaticArray<i32>(3)

  mapArgTags: StaticArray<i32> = new StaticArray<i32>(3)
  mapArgNums: StaticArray<f64> = new StaticArray<f64>(3)
  mapArgAux: StaticArray<i32> = new StaticArray<i32>(3)

  analyserRingBase: i32 = 0

  @inline
  call(
    pos: i32,
    named: i32,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
    left$: usize,
    right$: usize,
    dsp: Dsp,
  ): void {
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
      const val = stack.pop()
      const key = stack.pop()

      nameSyms[i] = stack.aux[key] // sym id is stored in aux for VmTag.Sym
      nameTags[i] = stack.tag[val]
      nameNums[i] = stack.num[val]
      nameAux[i] = stack.aux[val]
    }

    // Collect positional args (reverse on stack).
    const maxPos = 8
    const posTags = this.callPosTags
    const posNums = this.callPosNums
    const posAux = this.callPosAux
    let posCount = pos
    if (posCount > maxPos) posCount = maxPos
    for (let i = posCount - 1; i >= 0; i--) {
      const idx = stack.pop()
      posTags[i] = stack.tag[idx]
      posNums[i] = stack.num[idx]
      posAux[i] = stack.aux[idx]
    }

    const callee = stack.pop()
    const calleeTag = stack.tag[callee] as VmTag
    const calleeAux = stack.aux[callee]

    if (calleeTag === VmTag.Func) {
      // User-defined function values.
      // Named args are currently ignored (still popped above to keep stack balanced).
      dsp.vmInvokeFunc(calleeAux, posCount, posTags, posNums, posAux, length, left$, right$)
      return
    }

    if (calleeTag !== VmTag.Builtin) {
      stack.push(VmTag.Undef)
      return
    }

    if (calleeAux === VmBuiltin.Out) {
      callOut(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$)
      return
    }

    if (calleeAux === VmBuiltin.Timeline) {
      callTimeline(posCount, posTags, posNums, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Analyser) {
      callAnalyser(posCount, posTags, posNums, posAux, stack, audio, program, length, this.analyserRingBase)
      return
    }

    if (calleeAux === VmBuiltin.Sine) {
      callSine(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Note) {
      callNote(posCount, posTags, posNums, posAux, stack, audio, program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Degree) {
      callDegree(posCount, posTags, posNums, posAux, stack, audio, program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Map) {
      callMap(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$, dsp, this.mapArgTags,
        this.mapArgNums, this.mapArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Sum) {
      callSum(posCount, posTags, posNums, posAux, stack, audio, program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Ad) {
      callAd(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Adsr) {
      callAdsr(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mini) {
      callMini(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$, dsp, this.miniTrigOuts,
        this.miniVelOuts, this.miniValOuts, this.cbArgTags, this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Play) {
      callPlay(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$, dsp, this.miniTrigOuts,
        this.miniVelOuts, this.miniValOuts, this.cbArgTags, this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.PlayPick) {
      callPlayPick(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$, dsp, this.miniTrigOuts,
        this.miniVelOuts, this.miniValOuts, this.cbArgTags, this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Sampler) {
      callSampler(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Slicer) {
      callSlicer(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Every) {
      callEvery(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.At) {
      callAt(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Slew) {
      callSlew(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack, audio,
        program, length)
      return
    }

    stack.push(VmTag.Undef)
  }
}
