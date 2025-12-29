import { SEQ_VOICES } from '../constants'
import { Program } from '../program'
import { addAudio, clearAudio } from './audio-ops'
import { callAd } from './builtins/ad'
import { callAdsr } from './builtins/adsr'
import { callAnalyser } from './builtins/analyser'
import { callAt } from './builtins/at'
import { callAp, callBp, callBs, callHp, callHs, callLp, callLs, callPeak } from './builtins/biquad'
import { callCompressor } from './builtins/compressor'
import { callDegree } from './builtins/degree'
import { callDelay } from './builtins/delay'
import { callEuclid } from './builtins/euclid'
import { callEvery } from './builtins/every'
import { callGlide } from './builtins/glide'
import { callLfoRamp, callLfoSah, callLfoSaw, callLfoSine, callLfoSqr, callLfoTri } from './builtins/lfo'
import { callMap } from './builtins/map'
import { callMini } from './builtins/mini'
import { callBrown, callFractal, callGauss, callPink, callSmooth, callWhite } from './builtins/noise'
import { callNote } from './builtins/note'
import { callOut } from './builtins/out'
import { callPhasor } from './builtins/phasor'
import { callPlay } from './builtins/play'
import { callPlayPick } from './builtins/play-pick'
import { callPost } from './builtins/post'
import { callPwm } from './builtins/pwm'
import { callRamp } from './builtins/ramp'
import { callSampler } from './builtins/sampler'
import { callSaw } from './builtins/saw'
import { callSine } from './builtins/sine'
import { callSlew } from './builtins/slew'
import { callSlicer } from './builtins/slicer'
import { callSolo } from './builtins/solo'
import { callSqr } from './builtins/sqr'
import { callSum } from './builtins/sum'
import { callTimeline } from './builtins/timeline'
import { callTri } from './builtins/tri'
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
  compressorRingBase: i32 = 0

  private coerceArrayToScalar(
    tags: StaticArray<i32>,
    nums: StaticArray<f64>,
    aux: StaticArray<i32>,
    index: i32,
    audio: VmAudio,
    program: Program,
    length: i32,
    dsp: Dsp,
  ): void {
    if ((tags[index] as VmTag) !== VmTag.Arr) return

    const arrId: i32 = aux[index]
    if (arrId < 0 || arrId >= dsp.arrays.count) {
      tags[index] = VmTag.Num
      nums[index] = 0.0
      aux[index] = 0
      return
    }

    const n: i32 = dsp.arrays.len[arrId]
    if (n <= 0) {
      tags[index] = VmTag.Num
      nums[index] = 0.0
      aux[index] = 0
      return
    }

    const elemType = dsp.arrays.elemType[arrId] as VmTag

    if (elemType === VmTag.Num) {
      const start: i32 = dsp.arrays.start[arrId]
      let sum: f64 = 0.0
      for (let i: i32 = 0; i < n; i++) {
        sum += dsp.arrays.elemNum[start + i]
      }
      tags[index] = VmTag.Num
      nums[index] = sum
      aux[index] = 0
      return
    }

    if (elemType === VmTag.Audio) {
      const start: i32 = dsp.arrays.start[arrId]
      const outIndex: i32 = audio.allocOut(program)
      const out$ = program.getOutBuffer(outIndex)
      clearAudio(out$, length)

      for (let i: i32 = 0; i < n; i++) {
        const srcIndex: i32 = dsp.arrays.elemAux[start + i]
        if (srcIndex < 0) continue
        const src$ = program.getOutBuffer(srcIndex)
        addAudio(out$, out$, src$, length)
      }

      tags[index] = VmTag.Audio
      nums[index] = 0.0
      aux[index] = outIndex
      return
    }

    tags[index] = VmTag.Num
    nums[index] = 0.0
    aux[index] = 0
  }

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

    // Coerce arrays-of-nums / arrays-of-audio to a scalar by summing (like `array.sum()`),
    // so passing `[a,b,c]` into a numeric/audio parameter works naturally.
    if (calleeAux !== VmBuiltin.Map && calleeAux !== VmBuiltin.Sum && calleeAux !== VmBuiltin.Glide) {
      for (let i = 0; i < posCount; i++) {
        this.coerceArrayToScalar(posTags, posNums, posAux, i, audio, program, length, dsp)
      }
      for (let i = 0; i < namedCount; i++) {
        this.coerceArrayToScalar(nameTags, nameNums, nameAux, i, audio, program, length, dsp)
      }
    }

    if (calleeAux === VmBuiltin.Out) {
      callOut(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Solo) {
      callSolo(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Post) {
      callPost(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Timeline) {
      callTimeline(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, stack, audio, program,
        length)
      return
    }

    if (calleeAux === VmBuiltin.Analyser) {
      callAnalyser(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.analyserRingBase)
      return
    }

    if (calleeAux === VmBuiltin.Compressor) {
      callCompressor(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, this.compressorRingBase)
      return
    }

    if (calleeAux === VmBuiltin.Sine) {
      callSine(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Tri) {
      callTri(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Saw) {
      callSaw(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Ramp) {
      callRamp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Sqr) {
      callSqr(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Pwm) {
      callPwm(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Phasor) {
      callPhasor(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Note) {
      callNote(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Degree) {
      callDegree(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Map) {
      callMap(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.mapArgTags, this.mapArgNums, this.mapArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Sum) {
      callSum(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Glide) {
      callGlide(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Delay) {
      callDelay(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.cbArgTags, this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Ad) {
      callAd(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Adsr) {
      callAdsr(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mini) {
      callMini(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.miniTrigOuts, this.miniVelOuts, this.miniValOuts, this.cbArgTags,
        this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Play) {
      callPlay(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.miniTrigOuts, this.miniVelOuts, this.miniValOuts, this.cbArgTags,
        this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.PlayPick) {
      callPlayPick(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.miniTrigOuts, this.miniVelOuts, this.miniValOuts, this.cbArgTags,
        this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Sampler) {
      callSampler(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Slicer) {
      callSlicer(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Every) {
      callEvery(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.At) {
      callAt(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Euclid) {
      callEuclid(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.LfoSine) {
      callLfoSine(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.LfoTri) {
      callLfoTri(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.LfoSaw) {
      callLfoSaw(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.LfoRamp) {
      callLfoRamp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.LfoSqr) {
      callLfoSqr(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.LfoSah) {
      callLfoSah(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Lp) {
      callLp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Hp) {
      callHp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Bp) {
      callBp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Bs) {
      callBs(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Ls) {
      callLs(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Hs) {
      callHs(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Peak) {
      callPeak(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Ap) {
      callAp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Slew) {
      callSlew(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.White) {
      callWhite(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Gauss) {
      callGauss(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Pink) {
      callPink(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Brown) {
      callBrown(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Smooth) {
      callSmooth(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Fractal) {
      callFractal(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    stack.push(VmTag.Undef)
  }
}
