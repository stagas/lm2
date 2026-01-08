import { CHUNK_SIZE, LITERALS_COUNT, SEQ_VOICES } from '../constants'
import { GensPool } from '../gens-pool'
import { Program } from '../program'
import { addAudio, clearAudio, copyAudio, mulAudioScalar } from './audio-ops'
import { callAd } from './builtins/ad'
import { callAdsr } from './builtins/adsr'
import { callAnalyser } from './builtins/analyser'
import { callReverse, callShuffle } from './builtins/array'
import { callAt } from './builtins/at'
import { callAvg } from './builtins/avg'
import { callAp, callBp, callBs, callHp, callHs, callLp, callLs, callPeak } from './builtins/biquad'
import { callCompressor } from './builtins/compressor'
import { callDattorro } from './builtins/dattorro'
import { callDc } from './builtins/dc'
import { callDegree } from './builtins/degree'
import { callDelay } from './builtins/delay'
import { callDiodeLadder } from './builtins/diodeladder'
import { callEnvfollow } from './builtins/envfollow'
import { callEuclid } from './builtins/euclid'
import { callEvery } from './builtins/every'
import { callExpander } from './builtins/expander'
import { callFdn } from './builtins/fdn'
import { callFreeverb } from './builtins/freeverb'
import { callGate } from './builtins/gate'
import { callGetScale } from './builtins/get-scale'
import { callGlide } from './builtins/glide'
import { callImpulse } from './builtins/impulse'
import { callInc } from './builtins/inc'
import { callLfoRamp, callLfoSah, callLfoSaw, callLfoSine, callLfoSqr, callLfoTri } from './builtins/lfo'
import { callLimiter } from './builtins/limiter'
import { callMap } from './builtins/map'
import {
  callAbs,
  callAcos,
  callAsin,
  callAtan,
  callCeil,
  callClamp,
  callCos,
  callCube,
  callExp,
  callExp2,
  callFloor,
  callFold,
  callFract,
  callHeaviside,
  callHypot,
  callIsinf,
  callIsnan,
  callLerp,
  callLog,
  callLog10,
  callLog2,
  callMax,
  callMin,
  callMod,
  callPingpong,
  callRound,
  callSafediv,
  callSelect,
  callSign,
  callSin,
  callSmootherstep,
  callSmoothstep,
  callSnap,
  callSqrt,
  callSquare,
  callStep,
  callSwing,
  callTan,
  callTanh,
  callTrunc,
  callWrap,
} from './builtins/math'
import { callMini } from './builtins/mini'
import { callMhp, callMlp } from './builtins/moog'
import { callBrown, callFractal, callGauss, callPink, callRandom, callSmooth, callWhite } from './builtins/noise'
import { callNote } from './builtins/note'
import { callOhp, callOlp } from './builtins/onepole'
import { callOut } from './builtins/out'
import { callOversample } from './builtins/oversample'
import { callPhasor } from './builtins/phasor'
import { callPitchShift } from './builtins/pitch-shift'
import { callPlay } from './builtins/play'
import { callPlayPick } from './builtins/play-pick'
import { callPost } from './builtins/post'
import { callPwm } from './builtins/pwm'
import { callRamp } from './builtins/ramp'
import { callRecord } from './builtins/record'
import { callSah } from './builtins/sah'
import { callSampler } from './builtins/sampler'
import { callSaw } from './builtins/saw'
import { callSine } from './builtins/sine'
import { callSlew } from './builtins/slew'
import { callSlicer } from './builtins/slicer'
import { callSolo } from './builtins/solo'
import { callSqr } from './builtins/sqr'
import { callArrayRandom, callArrayStep } from './builtins/step'
import { callSum } from './builtins/sum'
import { callSap, callSbp, callSbs, callShp, callSlp, callSpeak } from './builtins/svf'
import { callTimeline } from './builtins/timeline'
import { callTri } from './builtins/tri'
import { callVelvet } from './builtins/velvet'
import { callArrayWalk } from './builtins/walk'
import { callZerox } from './builtins/zerox'
import { Dsp } from './dsp'
import { VM_FUNC_HEADER, VmBuiltin, VmTag } from './types'
import { VmAudio } from './vm-audio'
import { VmStack } from './vm-stack'
import { VmSym } from './vm-sym'

export class VmBuiltins {
  callKeySyms: StaticArray<i32> = new StaticArray<i32>(16)
  callValTags: StaticArray<i32> = new StaticArray<i32>(16)
  callValNums: StaticArray<f64> = new StaticArray<f64>(16)
  callValAux: StaticArray<i32> = new StaticArray<i32>(16)
  callPosTags: StaticArray<i32> = new StaticArray<i32>(16)
  callPosNums: StaticArray<f64> = new StaticArray<f64>(16)
  callPosAux: StaticArray<i32> = new StaticArray<i32>(16)
  callTmpTags: StaticArray<i32> = new StaticArray<i32>(16)
  callTmpNums: StaticArray<f64> = new StaticArray<f64>(16)
  callTmpAux: StaticArray<i32> = new StaticArray<i32>(16)
  callFuncTags: StaticArray<i32> = new StaticArray<i32>(16)
  callFuncNums: StaticArray<f64> = new StaticArray<f64>(16)
  callFuncAux: StaticArray<i32> = new StaticArray<i32>(16)
  callFuncParamSyms: StaticArray<i32> = new StaticArray<i32>(16)
  callFuncReserved: StaticArray<i32> = new StaticArray<i32>(16)
  callFuncHas: StaticArray<i32> = new StaticArray<i32>(16)

  miniTrigOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  miniVelOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)
  miniValOuts: StaticArray<i32> = new StaticArray<i32>(SEQ_VOICES)

  cbArgTags: StaticArray<i32> = new StaticArray<i32>(3)
  cbArgNums: StaticArray<f64> = new StaticArray<f64>(3)
  cbArgAux: StaticArray<i32> = new StaticArray<i32>(3)

  oversampleGens0: StaticArray<i32> = new StaticArray<i32>(GensPool.INDICES_COUNT)
  oversampleGens1: StaticArray<i32> = new StaticArray<i32>(GensPool.INDICES_COUNT)
  oversampleTempL: StaticArray<f32> = new StaticArray<f32>(CHUNK_SIZE * 16)
  oversampleTempR: StaticArray<f32> = new StaticArray<f32>(CHUNK_SIZE * 16)
  oversampleCapSyms: StaticArray<i32> = new StaticArray<i32>(16)
  oversampleCapEnvIdx: StaticArray<i32> = new StaticArray<i32>(16)
  oversampleCapTag0: StaticArray<i32> = new StaticArray<i32>(16)
  oversampleCapNum0: StaticArray<f64> = new StaticArray<f64>(16)
  oversampleCapAux0: StaticArray<i32> = new StaticArray<i32>(16)
  oversampleSavedSmoothedKeys: StaticArray<i32> = new StaticArray<i32>(LITERALS_COUNT)
  oversampleSavedSmoothedOutIndex: StaticArray<i32> = new StaticArray<i32>(LITERALS_COUNT)

  mapArgTags: StaticArray<i32> = new StaticArray<i32>(3)
  mapArgNums: StaticArray<f64> = new StaticArray<f64>(3)
  mapArgAux: StaticArray<i32> = new StaticArray<i32>(3)

  analyserRingBase: i32 = 0
  compressorRingBase: i32 = 0
  expanderRingBase: i32 = 0
  gateRingBase: i32 = 0
  limiterRingBase: i32 = 0

  autoLift: StaticArray<i32> = new StaticArray<i32>(256)

  constructor() {
    // Some DSP builtins conceptually operate on a single (mono) input signal (`in`) and should be able to
    // transparently operate on arrays-of-signals (e.g. stereo) by applying them elementwise.
    // Keep this list in sync with `dispatchAutoLiftBuiltin` so the VM knows how to run the elementwise calls.
    this.autoLift[VmBuiltin.Compressor] = 1
    this.autoLift[VmBuiltin.Expander] = 1
    this.autoLift[VmBuiltin.Gate] = 1
    this.autoLift[VmBuiltin.Limiter] = 1
    this.autoLift[VmBuiltin.Delay] = 1
    this.autoLift[VmBuiltin.PitchShift] = 1
    this.autoLift[VmBuiltin.Lp] = 1
    this.autoLift[VmBuiltin.Hp] = 1
    this.autoLift[VmBuiltin.Bp] = 1
    this.autoLift[VmBuiltin.Bs] = 1
    this.autoLift[VmBuiltin.Ls] = 1
    this.autoLift[VmBuiltin.Hs] = 1
    this.autoLift[VmBuiltin.Peak] = 1
    this.autoLift[VmBuiltin.Ap] = 1
    this.autoLift[VmBuiltin.Slp] = 1
    this.autoLift[VmBuiltin.Shp] = 1
    this.autoLift[VmBuiltin.Sbp] = 1
    this.autoLift[VmBuiltin.Sbs] = 1
    this.autoLift[VmBuiltin.Speak] = 1
    this.autoLift[VmBuiltin.Sap] = 1
    this.autoLift[VmBuiltin.Mlp] = 1
    this.autoLift[VmBuiltin.Mhp] = 1
    this.autoLift[VmBuiltin.DiodeLadder] = 1
    this.autoLift[VmBuiltin.Slew] = 1
    this.autoLift[VmBuiltin.Envfollow] = 1
    this.autoLift[VmBuiltin.Zerox] = 1
    this.autoLift[VmBuiltin.Dc] = 1
  }

  private coerceArrayToScalarImpl(
    tags: StaticArray<i32>,
    nums: StaticArray<f64>,
    aux: StaticArray<i32>,
    index: i32,
    audio: VmAudio,
    program: Program,
    length: i32,
    dsp: Dsp,
    avg: bool,
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
      nums[index] = avg ? (sum / (n as f64)) : sum
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

      if (avg) {
        const inv: f32 = (1.0 as f32) / f32(n)
        mulAudioScalar(out$, out$, inv, length)
      }
      return
    }

    tags[index] = VmTag.Num
    nums[index] = 0.0
    aux[index] = 0
  }

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
    this.coerceArrayToScalarImpl(tags, nums, aux, index, audio, program, length, dsp, false)
  }

  private coerceArrayToScalarAvg(
    tags: StaticArray<i32>,
    nums: StaticArray<f64>,
    aux: StaticArray<i32>,
    index: i32,
    audio: VmAudio,
    program: Program,
    length: i32,
    dsp: Dsp,
  ): void {
    this.coerceArrayToScalarImpl(tags, nums, aux, index, audio, program, length, dsp, true)
  }

  @inline
  private coerceArraysForBuiltin(
    calleeAux: i32,
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    namedCount: i32,
    nameTags: StaticArray<i32>,
    nameNums: StaticArray<f64>,
    nameAux: StaticArray<i32>,
    audio: VmAudio,
    program: Program,
    length: i32,
    dsp: Dsp,
  ): void {
    if (
      calleeAux !== VmBuiltin.Map
      && calleeAux !== VmBuiltin.Sum
      && calleeAux !== VmBuiltin.Avg
      && calleeAux !== VmBuiltin.ArrayStep
      && calleeAux !== VmBuiltin.ArrayRandom
      && calleeAux !== VmBuiltin.ArrayWalk
      && calleeAux !== VmBuiltin.Reverse
      && calleeAux !== VmBuiltin.Shuffle
      && calleeAux !== VmBuiltin.Glide
      && calleeAux !== VmBuiltin.Out
      && calleeAux !== VmBuiltin.Solo
      && calleeAux !== VmBuiltin.Analyser
      && calleeAux !== VmBuiltin.Freeverb
      && calleeAux !== VmBuiltin.Dattorro
      && calleeAux !== VmBuiltin.Fdn
      && calleeAux !== VmBuiltin.Velvet
    ) {
      for (let i: i32 = 0; i < posCount; i++) {
        this.coerceArrayToScalar(posTags, posNums, posAux, i, audio, program, length, dsp)
      }
      for (let i: i32 = 0; i < namedCount; i++) {
        this.coerceArrayToScalar(nameTags, nameNums, nameAux, i, audio, program, length, dsp)
      }
    }
  }

  @inline
  private dispatchAutoLiftBuiltin(
    calleeAux: i32,
    posCount: i32,
    nameSyms: StaticArray<i32>,
    nameTags: StaticArray<i32>,
    nameNums: StaticArray<f64>,
    nameAux: StaticArray<i32>,
    namedCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
    left$: usize,
    right$: usize,
    dsp: Dsp,
  ): void {
    if (calleeAux === VmBuiltin.Compressor) {
      callCompressor(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, this.compressorRingBase)
      return
    }
    if (calleeAux === VmBuiltin.Expander) {
      callExpander(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.expanderRingBase)
      return
    }
    if (calleeAux === VmBuiltin.Gate) {
      callGate(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.gateRingBase)
      return
    }

    if (calleeAux === VmBuiltin.Limiter) {
      callLimiter(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.limiterRingBase)
      return
    }

    if (calleeAux === VmBuiltin.Delay) {
      callDelay(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.cbArgTags, this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.PitchShift) {
      callPitchShift(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, left$, right$, dsp, this.cbArgTags, this.cbArgNums, this.cbArgAux)
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

    if (calleeAux === VmBuiltin.Slp) {
      callSlp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Shp) {
      callShp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sbp) {
      callSbp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sbs) {
      callSbs(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Speak) {
      callSpeak(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sap) {
      callSap(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sah) {
      callSah(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mlp) {
      callMlp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mhp) {
      callMhp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.DiodeLadder) {
      callDiodeLadder(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Envfollow) {
      callEnvfollow(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Slew) {
      callSlew(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Dc) {
      callDc(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    stack.push(VmTag.Undef)
  }

  private tryAutoLift(
    calleeAux: i32,
    posCount: i32,
    nameSyms: StaticArray<i32>,
    nameTags: StaticArray<i32>,
    nameNums: StaticArray<f64>,
    nameAux: StaticArray<i32>,
    namedCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
    left$: usize,
    right$: usize,
    dsp: Dsp,
  ): bool {
    // IMPORTANT: Don't iterate using the shared `callPos*` / `callVal*` scratch arrays directly.
    // Auto-lifted builtins may invoke user callbacks (e.g. delay(..., cb)), which re-enters `VmBuiltins.call()`
    // and clobbers those scratch arrays between iterations. Snapshot args into dedicated scratch arrays and
    // restore them each iteration so arguments are preserved (only `in` changes).
    let inIsPos: bool = false
    let inIndex: i32 = -1
    let arrId: i32 = -1

    if (posCount >= 1 && (posTags[0] as VmTag) === VmTag.Arr) {
      inIsPos = true
      inIndex = 0
      arrId = posAux[0]
    }
    else {
      for (let i: i32 = 0; i < namedCount; i++) {
        if (nameSyms[i] === VmSym.In && (nameTags[i] as VmTag) === VmTag.Arr) {
          inIsPos = false
          inIndex = i
          arrId = nameAux[i]
          break
        }
      }
    }

    if (arrId < 0) return false

    if (arrId >= dsp.arrays.count) {
      stack.push(VmTag.Undef)
      return true
    }

    const savedPosTags = this.callFuncTags
    const savedPosNums = this.callFuncNums
    const savedPosAux = this.callFuncAux
    for (let i: i32 = 0; i < posCount; i++) {
      savedPosTags[i] = posTags[i]
      savedPosNums[i] = posNums[i]
      savedPosAux[i] = posAux[i]
    }

    const savedNameSyms = this.callFuncParamSyms
    const savedNameTags = this.callTmpTags
    const savedNameNums = this.callTmpNums
    const savedNameAux = this.callTmpAux
    for (let i: i32 = 0; i < namedCount; i++) {
      savedNameSyms[i] = nameSyms[i]
      savedNameTags[i] = nameTags[i]
      savedNameNums[i] = nameNums[i]
      savedNameAux[i] = nameAux[i]
    }

    const n: i32 = dsp.arrays.len[arrId]
    if (n <= 0) {
      stack.push(VmTag.Undef)
      return true
    }

    const start: i32 = dsp.arrays.start[arrId]

    const outArrId: i32 = dsp.arrays.count
    const outStart: i32 = dsp.arrays.elemCount
    const outEnd: i32 = outStart + n
    if (outArrId < 0 || outArrId >= dsp.arrays.start.length) {
      stack.push(VmTag.Undef)
      return true
    }
    if (outEnd < 0 || outEnd > dsp.arrays.elemTag.length) {
      stack.push(VmTag.Undef)
      return true
    }

    dsp.arrays.start[outArrId] = outStart
    dsp.arrays.len[outArrId] = n
    dsp.arrays.createPc[outArrId] = 0
    dsp.arrays.elemType[outArrId] = VmTag.Undef
    dsp.arrays.count = outArrId + 1
    dsp.arrays.elemCount = outEnd

    let outType: i32 = -1

    for (let i: i32 = 0; i < n; i++) {
      // Restore args (callback / nested calls can clobber shared scratch arrays).
      for (let j: i32 = 0; j < posCount; j++) {
        posTags[j] = savedPosTags[j]
        posNums[j] = savedPosNums[j]
        posAux[j] = savedPosAux[j]
      }
      for (let j: i32 = 0; j < namedCount; j++) {
        nameSyms[j] = savedNameSyms[j]
        nameTags[j] = savedNameTags[j]
        nameNums[j] = savedNameNums[j]
        nameAux[j] = savedNameAux[j]
      }

      const at: i32 = start + i
      const eTag: i32 = dsp.arrays.elemTag[at]
      const eNum: f64 = dsp.arrays.elemNum[at]
      const eAux: i32 = dsp.arrays.elemAux[at]

      if (inIsPos) {
        posTags[0] = eTag
        posNums[0] = eNum
        posAux[0] = eAux
      }
      else {
        nameTags[inIndex] = eTag
        nameNums[inIndex] = eNum
        nameAux[inIndex] = eAux
      }

      this.coerceArraysForBuiltin(calleeAux, posCount, posTags, posNums, posAux, namedCount, nameTags, nameNums,
        nameAux, audio, program, length, dsp)

      this.dispatchAutoLiftBuiltin(calleeAux, posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags,
        posNums, posAux, stack, audio, program, length, left$, right$, dsp)

      const resIdx: i32 = stack.pop()
      const rTag: i32 = stack.tag[resIdx]
      const rNum: f64 = stack.num[resIdx]
      const rAux: i32 = stack.aux[resIdx]

      if (outType < 0) outType = rTag
      else if (rTag !== outType) {
        stack.push(VmTag.Undef)
        return true
      }

      dsp.arrays.elemTag[outStart + i] = rTag
      dsp.arrays.elemNum[outStart + i] = rNum
      dsp.arrays.elemAux[outStart + i] = rAux
    }

    dsp.arrays.elemType[outArrId] = outType
    stack.push(VmTag.Arr, 0.0, outArrId)
    return true
  }

  tryAutoLiftFunc(
    funcPc: i32,
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
    left$: usize,
    right$: usize,
    dsp: Dsp,
  ): bool {
    if (posCount < 1 || (posTags[0] as VmTag) !== VmTag.Arr) return false

    const ops = program.data.ops
    if (funcPc < 0 || funcPc >= ops.length) return false
    if (ops[funcPc] !== VM_FUNC_HEADER) return false
    const paramCount: i32 = ops[funcPc + 1]
    if (paramCount <= 0) return false
    if (ops[funcPc + 2] !== VmSym.In) return false

    // IMPORTANT: Don't call `vmInvokeFunc*` with the shared `callPos*` scratch arrays.
    // Nested calls inside the invoked function reuse `callPos*` and will clobber the arguments between iterations.
    const argTags = this.callFuncTags
    const argNums = this.callFuncNums
    const argAux = this.callFuncAux
    for (let i: i32 = 0; i < posCount; i++) {
      argTags[i] = posTags[i]
      argNums[i] = posNums[i]
      argAux[i] = posAux[i]
    }

    const arrId: i32 = argAux[0]
    if (arrId < 0 || arrId >= dsp.arrays.count) {
      stack.push(VmTag.Undef)
      return true
    }

    const srcStart: i32 = dsp.arrays.start[arrId]
    const n: i32 = dsp.arrays.len[arrId]
    const srcPc: i32 = dsp.arrays.createPc[arrId]
    if (n < 0) {
      stack.push(VmTag.Undef)
      return true
    }

    const outId: i32 = dsp.arrays.count
    const outStart: i32 = dsp.arrays.elemCount
    const outEnd: i32 = outStart + n
    if (outId < 0 || outId >= dsp.arrays.start.length) {
      stack.push(VmTag.Undef)
      return true
    }
    if (outEnd < 0 || outEnd > dsp.arrays.elemTag.length) {
      stack.push(VmTag.Undef)
      return true
    }

    // Reserve a "holey" output array first so nested allocations inside the function can't collide
    // with the output's reserved element region.
    dsp.arrays.start[outId] = outStart
    dsp.arrays.len[outId] = n
    dsp.arrays.createPc[outId] = srcPc
    dsp.arrays.elemType[outId] = VmTag.Undef
    dsp.arrays.count = outId + 1
    dsp.arrays.elemCount = outEnd
    for (let i: i32 = 0; i < n; i++) {
      dsp.arrays.elemTag[outStart + i] = VmTag.Undef
      dsp.arrays.elemNum[outStart + i] = 0.0
      dsp.arrays.elemAux[outStart + i] = 0
    }

    const savedTag0: i32 = argTags[0]
    const savedNum0: f64 = argNums[0]
    const savedAux0: i32 = argAux[0]

    let tag0: i32 = -1
    let mixed: bool = false

    for (let i: i32 = 0; i < n; i++) {
      const at: i32 = srcStart + i
      argTags[0] = dsp.arrays.elemTag[at]
      argNums[0] = dsp.arrays.elemNum[at]
      argAux[0] = dsp.arrays.elemAux[at]

      dsp.vmInvokeFuncKeepOuts(funcPc, posCount, argTags, argNums, argAux, length, left$, right$)

      const resIdx: i32 = stack.pop()
      const rTag: i32 = stack.tag[resIdx]
      if (tag0 < 0) tag0 = rTag
      else if (rTag !== tag0) mixed = true

      // If the function returns audio, copy it into a fresh stable out buffer before storing.
      // This avoids cases where function-produced buffers are reused/overwritten by later iterations.
      if ((rTag as VmTag) === VmTag.Audio) {
        const srcIndex: i32 = stack.aux[resIdx]
        const src$: usize = program.getOutBuffer(srcIndex)
        const outIndex: i32 = audio.allocOut(program)
        const out$: usize = program.getOutBuffer(outIndex)
        copyAudio(out$, src$, length)
        dsp.arrays.elemTag[outStart + i] = VmTag.Audio
        dsp.arrays.elemNum[outStart + i] = 0.0
        dsp.arrays.elemAux[outStart + i] = outIndex
      }
      else {
        dsp.arrays.elemTag[outStart + i] = rTag
        dsp.arrays.elemNum[outStart + i] = stack.num[resIdx]
        dsp.arrays.elemAux[outStart + i] = stack.aux[resIdx]
      }
    }

    argTags[0] = savedTag0
    argNums[0] = savedNum0
    argAux[0] = savedAux0

    if (mixed) {
      stack.push(VmTag.Undef)
      return true
    }

    dsp.arrays.elemType[outId] = tag0 < 0 ? (VmTag.Undef as i32) : tag0
    stack.push(VmTag.Arr, 0.0, outId)
    return true
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
    const maxNamed = 16
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
    const maxPos = 16
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
      // Map named args to parameter slots by symbol id (same semantics as builtin slotting).
      const ops = program.data.ops
      const maxPos = 16

      if (calleeAux >= 0 && calleeAux < ops.length && ops[calleeAux] === VM_FUNC_HEADER && namedCount > 0) {
        const tmpTags = this.callTmpTags
        const tmpNums = this.callTmpNums
        const tmpAux = this.callTmpAux
        for (let i: i32 = 0; i < posCount; i++) {
          tmpTags[i] = posTags[i]
          tmpNums[i] = posNums[i]
          tmpAux[i] = posAux[i]
        }

        const paramCount: i32 = ops[calleeAux + 1]
        const n: i32 = paramCount < maxPos ? paramCount : maxPos

        const paramSyms = this.callFuncParamSyms
        const reserved = this.callFuncReserved
        const has = this.callFuncHas

        for (let i: i32 = 0; i < n; i++) {
          paramSyms[i] = ops[calleeAux + 2 + i]
          reserved[i] = 0
          has[i] = 0
          posTags[i] = VmTag.Undef
          posNums[i] = 0.0
          posAux[i] = 0
        }

        for (let i: i32 = 0; i < namedCount; i++) {
          const sym: i32 = nameSyms[i]
          let idx: i32 = -1
          for (let j: i32 = 0; j < n; j++) {
            if (paramSyms[j] === sym) {
              idx = j
              break
            }
          }
          if (idx >= 0) {
            posTags[idx] = nameTags[i]
            posNums[idx] = nameNums[i]
            posAux[idx] = nameAux[i]
            reserved[idx] = 1
            has[idx] = 1
          }
        }

        let next: i32 = 0
        for (let i: i32 = 0; i < posCount; i++) {
          while (next < n && (reserved[next] !== 0 || has[next] !== 0)) next++
          if (next >= n) break
          posTags[next] = tmpTags[i]
          posNums[next] = tmpNums[i]
          posAux[next] = tmpAux[i]
          has[next] = 1
          next++
        }

        let maxIdx: i32 = -1
        for (let i: i32 = 0; i < n; i++) {
          if (has[i] !== 0) maxIdx = i
        }
        posCount = maxIdx + 1
      }

      if (this.tryAutoLiftFunc(calleeAux, posCount, posTags, posNums, posAux, stack, audio, program, length, left$,
        right$, dsp))
      {
        return
      }
      dsp.vmInvokeFunc(calleeAux, posCount, posTags, posNums, posAux, length, left$, right$)
      return
    }

    if (calleeTag !== VmTag.Builtin) {
      stack.push(VmTag.Undef)
      return
    }

    if (calleeAux >= 0 && calleeAux < this.autoLift.length && this.autoLift[calleeAux] !== 0) {
      if (this.tryAutoLift(calleeAux, posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums,
        posAux, stack, audio, program, length, left$, right$, dsp))
      {
        return
      }
    }

    // Coerce arrays-of-nums / arrays-of-audio to a scalar by summing (like `array.sum()`),
    // so passing `[a,b,c]` into a numeric/audio parameter works naturally.
    this.coerceArraysForBuiltin(calleeAux, posCount, posTags, posNums, posAux, namedCount, nameTags, nameNums, nameAux,
      audio, program, length, dsp)

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
      if (posCount >= 1) {
      }
      callAnalyser(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.analyserRingBase, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Compressor) {
      callCompressor(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, this.compressorRingBase)
      return
    }
    if (calleeAux === VmBuiltin.Expander) {
      callExpander(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.expanderRingBase)
      return
    }
    if (calleeAux === VmBuiltin.Gate) {
      callGate(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.gateRingBase)
      return
    }

    if (calleeAux === VmBuiltin.Limiter) {
      callLimiter(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, this.limiterRingBase)
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
    if (calleeAux === VmBuiltin.Impulse) {
      callImpulse(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Inc) {
      callInc(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Zerox) {
      callZerox(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Zerox) {
      callZerox(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Olp) {
      callOlp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Ohp) {
      callOhp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
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
    if (calleeAux === VmBuiltin.GetScale) {
      callGetScale(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp, dsp.arrays)
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

    if (calleeAux === VmBuiltin.ArrayStep) {
      callArrayStep(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.ArrayRandom) {
      callArrayRandom(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.ArrayWalk) {
      callArrayWalk(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Reverse) {
      callReverse(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Shuffle) {
      callShuffle(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Avg) {
      callAvg(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Oversample) {
      callOversample(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, left$, right$, dsp, this.cbArgTags, this.cbArgNums, this.cbArgAux, this.oversampleGens0,
        this.oversampleGens1, this.oversampleCapSyms, this.oversampleCapEnvIdx, this.oversampleCapTag0,
        this.oversampleCapNum0, this.oversampleCapAux0, this.oversampleSavedSmoothedKeys,
        this.oversampleSavedSmoothedOutIndex, changetype<usize>(this.oversampleTempL),
        changetype<usize>(this.oversampleTempR), CHUNK_SIZE * 16)
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

    if (calleeAux === VmBuiltin.PitchShift) {
      callPitchShift(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length, left$, right$, dsp, this.cbArgTags, this.cbArgNums, this.cbArgAux)
      return
    }

    if (calleeAux === VmBuiltin.Freeverb) {
      callFreeverb(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }
    if (calleeAux === VmBuiltin.Dattorro) {
      callDattorro(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }
    if (calleeAux === VmBuiltin.Fdn) {
      callFdn(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }
    if (calleeAux === VmBuiltin.Velvet) {
      callVelvet(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, dsp)
      return
    }
    if (calleeAux === VmBuiltin.Dc) {
      callDc(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
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

    if (calleeAux === VmBuiltin.Envfollow) {
      callEnvfollow(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
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

    if (calleeAux === VmBuiltin.Record) {
      callRecord(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length, left$, right$, dsp, this.cbArgTags, this.cbArgNums, this.cbArgAux)
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

    if (calleeAux === VmBuiltin.Slp) {
      callSlp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Shp) {
      callShp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sbp) {
      callSbp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sbs) {
      callSbs(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Speak) {
      callSpeak(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sap) {
      callSap(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sah) {
      callSah(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mlp) {
      callMlp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mhp) {
      callMhp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.DiodeLadder) {
      callDiodeLadder(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length)
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

    if (calleeAux === VmBuiltin.Random) {
      callRandom(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sin) {
      callSin(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Cos) {
      callCos(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Tan) {
      callTan(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Asin) {
      callAsin(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Acos) {
      callAcos(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Tanh) {
      callTanh(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Atan) {
      callAtan(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Abs) {
      callAbs(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Sqrt) {
      callSqrt(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Square) {
      callSquare(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Cube) {
      callCube(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Hypot) {
      callHypot(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Log) {
      callLog(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Exp) {
      callExp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Log10) {
      callLog10(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Log2) {
      callLog2(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Exp2) {
      callExp2(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Min) {
      callMin(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Max) {
      callMax(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Clamp) {
      callClamp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Wrap) {
      callWrap(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Mod) {
      callMod(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Pingpong) {
      callPingpong(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Fold) {
      callFold(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Floor) {
      callFloor(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Ceil) {
      callCeil(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Round) {
      callRound(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Trunc) {
      callTrunc(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Snap) {
      callSnap(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Fract) {
      callFract(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Sign) {
      callSign(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Lerp) {
      callLerp(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Smoothstep) {
      callSmoothstep(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length)
      return
    }
    if (calleeAux === VmBuiltin.Smootherstep) {
      callSmootherstep(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack,
        audio, program, length)
      return
    }
    if (calleeAux === VmBuiltin.Step) {
      callStep(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Heaviside) {
      callHeaviside(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Select) {
      callSelect(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Isnan) {
      callIsnan(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Isinf) {
      callIsinf(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Safediv) {
      callSafediv(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }
    if (calleeAux === VmBuiltin.Swing) {
      callSwing(posCount, nameSyms, nameTags, nameNums, nameAux, namedCount, posTags, posNums, posAux, stack, audio,
        program, length)
      return
    }

    stack.push(VmTag.Undef)
  }
}
