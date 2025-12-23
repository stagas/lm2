import { CALLBACK_SCOPE_BASE, CALLBACK_SCOPE_BUFFERS_PER_VOICE, SEQ_VOICES } from '../constants'
import { Ad } from '../gen/ad'
import { Adsr } from '../gen/adsr'
import { At } from '../gen/at'
import { Every } from '../gen/every'
import { Mini } from '../gen/mini'
import { Sampler } from '../gen/sampler'
import { Sine } from '../gen/sine'
import { Slicer } from '../gen/slicer'
import { Timeline } from '../gen/timeline'
import { vmErrorCode } from '../globals'
import { Program } from '../program'
import { Op } from '../shared'
import { VmSym } from '../syms'
import { addAudio, clearAudio } from './audio-ops'
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

    if (calleeTag !== VmTag.Builtin) {
      stack.push(VmTag.Undef)
      return
    }

    if (calleeAux === VmBuiltin.Out) {
      this.callOut(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$)
      return
    }

    if (calleeAux === VmBuiltin.Timeline) {
      this.callTimeline(posCount, posTags, posNums, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Analyser) {
      this.callAnalyser(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Sine) {
      this.callSine(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Ad) {
      this.callAd(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Adsr) {
      this.callAdsr(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack, audio,
        program, length)
      return
    }

    if (calleeAux === VmBuiltin.Mini) {
      this.callMini(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Play) {
      this.callPlay(posCount, posTags, posNums, posAux, stack, audio, program, length, left$, right$, dsp)
      return
    }

    if (calleeAux === VmBuiltin.Sampler) {
      this.callSampler(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Slicer) {
      this.callSlicer(posCount, posTags, posNums, posAux, stack, audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.Every) {
      this.callEvery(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack,
        audio, program, length)
      return
    }

    if (calleeAux === VmBuiltin.At) {
      this.callAt(posCount, namedCount, posTags, posNums, posAux, nameSyms, nameTags, nameNums, nameAux, stack, audio,
        program, length)
      return
    }

    stack.push(VmTag.Undef)
  }

  @inline
  private callOut(
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
  ): void {
    if (posCount < 1) {
      stack.push(VmTag.Undef)
      return
    }
    const aTag = posTags[0] as VmTag
    const aNum = posNums[0]
    const aAux = posAux[0]
    const aPtr$ = audio.toAudioPtr(aTag, aNum, aAux, length, program)
    addAudio(left$, left$, aPtr$, length)
    addAudio(right$, right$, aPtr$, length)
    // Return the input
    if (aTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, aAux)
    else stack.push(aTag, aNum, aAux)
  }

  @inline
  private callTimeline(
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    // timeline(seq)
    if (posCount < 1) {
      stack.push(VmTag.Undef)
      return
    }

    // Backwards compatibility: timeline(beatDiv, seq) is accepted, but beatDiv
    // is compile-time only (durations are compiled to absolute beats).
    const seqPos: i32 = posCount >= 2 ? 1 : 0
    const arrayTag: VmTag = posTags[seqPos] as VmTag
    const arrayNum: f64 = posNums[seqPos]
    if (arrayTag !== VmTag.Num) {
      stack.push(VmTag.Undef)
      return
    }

    const outIndex: i32 = audio.allocOut(program)
    const out$: usize = program.getOutBuffer(outIndex)

    const arrayIndex: i32 = i32(arrayNum)
    const timeline: Timeline = program.gensPool.get(Op.Timeline) as Timeline
    timeline.bytecode$ = changetype<usize>(program.data.arrays[arrayIndex])
    timeline.history$ = changetype<usize>(program.histories[arrayIndex])
    timeline.beatDiv = 0.0
    timeline.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callAnalyser(
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    // analyser(audio, index=0)
    if (posCount < 1) {
      stack.push(VmTag.Undef)
      return
    }

    const aTag = posTags[0] as VmTag
    const aNum = posNums[0]
    const aAux = posAux[0]
    const aPtr$ = audio.toAudioPtr(aTag, aNum, aAux, length, program)

    // Optional second positional argument selects analyser index
    let analyserIndex = 0
    if (posCount >= 2 && posTags[1] === VmTag.Num) analyserIndex = i32(posNums[1])
    if (analyserIndex < 0) analyserIndex = 0

    const analyser$ = program.analyserOutsPool.get(analyserIndex)
    const baseOffset = this.analyserRingBase
    // Copy samples into the analyser ring buffer at current base
    for (let i = 0; i < length; i++) {
      const s = load<f32>(aPtr$ + (i * 4) as usize)
      store<f32>(analyser$ + ((baseOffset + i) * 4) as usize, s)
    }

    // Return the input unchanged
    if (aTag === VmTag.Audio) stack.push(VmTag.Audio, 0.0, aAux)
    else stack.push(aTag, aNum, aAux)
  }

  @inline
  private callSine(
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    const hzTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
    const hzNum = posCount >= 1 ? posNums[0] : 0.0
    const hzAux = posCount >= 1 ? posAux[0] : 0
    const trigTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
    const trigNum = posCount >= 2 ? posNums[1] : 0.0
    const trigAux = posCount >= 2 ? posAux[1] : 0

    const hz$ = audio.toAudioPtr(hzTag, hzNum, hzAux, length, program)
    const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

    const outIndex = audio.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)

    const sin = program.gensPool.get(Op.Sine) as Sine
    sin.hz$ = hz$
    sin.trig$ = trig$
    sin.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callAd(
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    const attackTag = posCount >= 1 ? (posTags[0] as VmTag) : VmTag.Num
    const attackNum = posCount >= 1 ? posNums[0] : 0.0
    const attackAux = posCount >= 1 ? posAux[0] : 0
    const decayTag = posCount >= 2 ? (posTags[1] as VmTag) : VmTag.Num
    const decayNum = posCount >= 2 ? posNums[1] : 0.0
    const decayAux = posCount >= 2 ? posAux[1] : 0
    const trigTag = posCount >= 3 ? (posTags[2] as VmTag) : VmTag.Num
    const trigNum = posCount >= 3 ? posNums[2] : 0.0
    const trigAux = posCount >= 3 ? posAux[2] : 0

    const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
    const decay$ = audio.toAudioPtr(decayTag, decayNum, decayAux, length, program)
    const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

    const outIndex = audio.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)

    const ad = program.gensPool.get(Op.Ad) as Ad
    ad.attack$ = attack$
    ad.decay$ = decay$
    ad.trig$ = trig$
    ad.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callAdsr(
    posCount: i32,
    namedCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    nameSyms: StaticArray<i32>,
    nameTags: StaticArray<i32>,
    nameNums: StaticArray<f64>,
    nameAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
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
      if (k === VmSym.Attack) {
        attackTag = nameTags[i] as VmTag
        attackNum = nameNums[i]
        attackAux = nameAux[i]
      }
      else if (k === VmSym.Decay) {
        decayTag = nameTags[i] as VmTag
        decayNum = nameNums[i]
        decayAux = nameAux[i]
      }
      else if (k === VmSym.Sustain) {
        sustainTag = nameTags[i] as VmTag
        sustainNum = nameNums[i]
        sustainAux = nameAux[i]
      }
      else if (k === VmSym.Release) {
        releaseTag = nameTags[i] as VmTag
        releaseNum = nameNums[i]
        releaseAux = nameAux[i]
      }
      else if (k === VmSym.Trig) {
        trigTag = nameTags[i] as VmTag
        trigNum = nameNums[i]
        trigAux = nameAux[i]
      }
    }

    const attack$ = audio.toAudioPtr(attackTag, attackNum, attackAux, length, program)
    const decay$ = audio.toAudioPtr(decayTag, decayNum, decayAux, length, program)
    const sustain$ = audio.toAudioPtr(sustainTag, sustainNum, sustainAux, length, program)
    const release$ = audio.toAudioPtr(releaseTag, releaseNum, releaseAux, length, program)
    const trig$ = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)

    const outIndex = audio.allocOut(program)
    const out$ = program.getOutBuffer(outIndex)

    const adsr = program.gensPool.get(Op.Adsr) as Adsr
    adsr.attack$ = attack$
    adsr.decay$ = decay$
    adsr.sustain$ = sustain$
    adsr.release$ = release$
    adsr.trig$ = trig$
    adsr.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callMini(
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
  ): void {
    if (posCount < 1) {
      stack.push(VmTag.Undef)
      return
    }

    const arrayTag = posTags[0] as VmTag
    const arrayNum = posNums[0]
    if (arrayTag !== VmTag.Num) {
      stack.push(VmTag.Undef)
      return
    }

    // mini(seq) -> seq
    if (posCount === 1) {
      stack.push(VmTag.Num, arrayNum)
      return
    }

    const cbTag = posTags[1] as VmTag
    const cbAux = posAux[1]
    if (cbTag !== VmTag.Func) {
      stack.push(VmTag.Undef)
      return
    }

    this.playMini(i32(arrayNum), cbAux, stack, audio, program, length, left$, right$, dsp)
  }

  @inline
  private callPlay(
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
  ): void {
    if (posCount < 2) {
      stack.push(VmTag.Undef)
      return
    }

    const arrayTag = posTags[0] as VmTag
    const arrayNum = posNums[0]
    const cbTag = posTags[1] as VmTag
    const cbAux = posAux[1]

    if (arrayTag !== VmTag.Num || cbTag !== VmTag.Func) {
      stack.push(VmTag.Undef)
      return
    }

    this.playMini(i32(arrayNum), cbAux, stack, audio, program, length, left$, right$, dsp)
  }

  @inline
  private playMini(
    arrayIndex: i32,
    cbAux: i32,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
    left$: usize,
    right$: usize,
    dsp: Dsp,
  ): void {
    const voiceCountOut = audio.allocOut(program)
    const trigOuts = this.miniTrigOuts
    const velOuts = this.miniVelOuts
    const valOuts = this.miniValOuts

    for (let v = 0; v < SEQ_VOICES; v++) {
      const t = audio.allocOut(program)
      const vel = audio.allocOut(program)
      const val = audio.allocOut(program)
      trigOuts[v] = t
      velOuts[v] = vel
      valOuts[v] = val
    }

    const mini = program.gensPool.get(Op.Mini) as Mini
    mini.bytecode$ = changetype<usize>(program.data.arrays[arrayIndex])
    mini.history$ = changetype<usize>(program.histories[arrayIndex])
    mini.outVoiceCount$ = program.getOutBuffer(voiceCountOut)
    for (let v = 0; v < SEQ_VOICES; v++) {
      mini.outTrig$[v] = program.getOutBuffer(trigOuts[v])
      mini.outVelocity$[v] = program.getOutBuffer(velOuts[v])
      mini.outValue$[v] = program.getOutBuffer(valOuts[v])
    }

    mini.process(0, length)

    const mixOut = audio.allocOut(program)
    const mixOut$ = program.getOutBuffer(mixOut)
    clearAudio(mixOut$, length)

    const scopeTrigIndex = audio.allocOut(program)
    const scopeVelIndex = audio.allocOut(program)
    const scopeValIndex = audio.allocOut(program)

    const bodyBufBase = audio.outCursor

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
      program.pushCallbackScope(bodyBufBase, remapBase)
      program.bindScope(scopeTrigIndex, program.getOutBuffer(trigOuts[v]))
      program.bindScope(scopeVelIndex, program.getOutBuffer(velOuts[v]))
      program.bindScope(scopeValIndex, program.getOutBuffer(valOuts[v]))

      // Reuse the same body buffer indices for each voice; remapping makes them per-voice.
      audio.outCursor = bodyBufBase
      stack.reset()

      dsp.vmInvokeFunc(cbAux, 3, argTags, argNums, argAux, length, left$, right$)

      if (vmErrorCode !== 0) {
        program.popCallbackScope()
        return
      }

      const outIdx = stack.pop()
      const outTag = stack.tag[outIdx] as VmTag
      const outNum = stack.num[outIdx]
      const outAux = stack.aux[outIdx]
      const voiceAudio$ = audio.toAudioPtr(outTag, outNum, outAux, length, program)
      addAudio(mixOut$, mixOut$, voiceAudio$, length)

      program.popCallbackScope()
    }

    stack.push(VmTag.Audio, 0.0, mixOut)
  }

  @inline
  private callSampler(
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    // sampler(sample, speed=1, offset=0, trig=0, repeat=false)
    if (posCount < 1 || posTags[0] !== VmTag.Num) {
      stack.push(VmTag.Undef)
      return
    }

    const sampleIndex: i32 = i32(posNums[0])

    const speedIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
    const speedTag: VmTag = speedIsSet ? (posTags[1] as VmTag) : VmTag.Num
    const speedNum: f64 = speedIsSet ? posNums[1] : 1.0
    const speedAux: i32 = speedIsSet ? posAux[1] : 0

    const offsetIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
    // If offset is omitted and speed is a constant negative number, default to "end".
    const defaultOffset: f64 = (!offsetIsSet && speedTag === VmTag.Num && speedNum < 0.0) ? 1.0 : 0.0
    const offsetTag: VmTag = offsetIsSet ? (posTags[2] as VmTag) : VmTag.Num
    const offsetNum: f64 = offsetIsSet ? posNums[2] : defaultOffset
    const offsetAux: i32 = offsetIsSet ? posAux[2] : 0

    const trigIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
    const trigTag: VmTag = trigIsSet ? (posTags[3] as VmTag) : VmTag.Num
    const trigNum: f64 = trigIsSet ? posNums[3] : 0.0
    const trigAux: i32 = trigIsSet ? posAux[3] : 0

    const repeatIsSet = posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null
    const repeatTag: VmTag = repeatIsSet ? (posTags[4] as VmTag) : VmTag.Bool
    const repeatNum: f64 = repeatIsSet ? posNums[4] : 0.0
    const repeatAux: i32 = repeatIsSet ? posAux[4] : 0

    const speed$: usize = audio.toAudioPtr(speedTag, speedNum, speedAux, length, program)
    const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
    const trig$: usize = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
    const repeat$: usize = audio.toAudioPtr(repeatTag, repeatNum, repeatAux, length, program)

    const outIndex: i32 = audio.allocOut(program)
    const out$: usize = program.getOutBuffer(outIndex)

    const gen = program.gensPool.get(Op.Sampler) as Sampler
    gen.sampleIndex = sampleIndex
    gen.speed$ = speed$
    gen.offset$ = offset$
    gen.trig$ = trig$
    gen.repeat$ = repeat$
    gen.needleHistory$ = changetype<usize>(program.sampleNeedleHistory)
    gen.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callSlicer(
    posCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    // slicer(sample, speed=1, offset=0, slice=0, threshold=0.5, trig=0, repeat=false)
    if (posCount < 1 || posTags[0] !== VmTag.Num) {
      stack.push(VmTag.Undef)
      return
    }

    const sampleIndex: i32 = i32(posNums[0])

    const speedIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
    const speedTag: VmTag = speedIsSet ? (posTags[1] as VmTag) : VmTag.Num
    const speedNum: f64 = speedIsSet ? posNums[1] : 1.0
    const speedAux: i32 = speedIsSet ? posAux[1] : 0

    const offsetIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
    const offsetTag: VmTag = offsetIsSet ? (posTags[2] as VmTag) : VmTag.Num
    const offsetNum: f64 = offsetIsSet ? posNums[2] : 0.0
    const offsetAux: i32 = offsetIsSet ? posAux[2] : 0

    const sliceIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
    const sliceTag: VmTag = sliceIsSet ? (posTags[3] as VmTag) : VmTag.Num
    const sliceNum: f64 = sliceIsSet ? posNums[3] : 0.0
    const sliceAux: i32 = sliceIsSet ? posAux[3] : 0

    const thresholdIsSet = posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null
    const thresholdTag: VmTag = thresholdIsSet ? (posTags[4] as VmTag) : VmTag.Num
    const thresholdNum: f64 = thresholdIsSet ? posNums[4] : 0.5
    const thresholdAux: i32 = thresholdIsSet ? posAux[4] : 0

    const trigIsSet = posCount >= 6 && posTags[5] !== VmTag.Undef && posTags[5] !== VmTag.Null
    const trigTag: VmTag = trigIsSet ? (posTags[5] as VmTag) : VmTag.Num
    const trigNum: f64 = trigIsSet ? posNums[5] : 0.0
    const trigAux: i32 = trigIsSet ? posAux[5] : 0

    const repeatIsSet = posCount >= 7 && posTags[6] !== VmTag.Undef && posTags[6] !== VmTag.Null
    const repeatTag: VmTag = repeatIsSet ? (posTags[6] as VmTag) : VmTag.Bool
    const repeatNum: f64 = repeatIsSet ? posNums[6] : 0.0
    const repeatAux: i32 = repeatIsSet ? posAux[6] : 0

    const speed$: usize = audio.toAudioPtr(speedTag, speedNum, speedAux, length, program)
    const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)
    const slice$: usize = audio.toAudioPtr(sliceTag, sliceNum, sliceAux, length, program)
    const threshold$: usize = audio.toAudioPtr(thresholdTag, thresholdNum, thresholdAux, length, program)
    const trig$: usize = audio.toAudioPtr(trigTag, trigNum, trigAux, length, program)
    const repeat$: usize = audio.toAudioPtr(repeatTag, repeatNum, repeatAux, length, program)

    const outIndex: i32 = audio.allocOut(program)
    const out$: usize = program.getOutBuffer(outIndex)

    const gen = program.gensPool.get(Op.Slicer) as Slicer
    gen.sampleIndex = sampleIndex
    gen.speed$ = speed$
    gen.offset$ = offset$
    gen.slice$ = slice$
    gen.threshold$ = threshold$
    gen.trig$ = trig$
    gen.repeat$ = repeat$
    gen.needleHistory$ = changetype<usize>(program.sampleNeedleHistory)
    gen.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callEvery(
    posCount: i32,
    namedCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    nameSyms: StaticArray<i32>,
    nameTags: StaticArray<i32>,
    nameNums: StaticArray<f64>,
    nameAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    // every(bar, prob=1, seed=1234, swing=0, offset=0)
    if (posCount < 1) {
      stack.push(VmTag.Undef)
      return
    }

    let barTag: VmTag = posTags[0] as VmTag
    let barNum: f64 = posNums[0]
    let barAux: i32 = posAux[0]

    const probIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
    let probTag: VmTag = probIsSet ? (posTags[1] as VmTag) : VmTag.Num
    let probNum: f64 = probIsSet ? posNums[1] : 1.0
    let probAux: i32 = probIsSet ? posAux[1] : 0

    const seedIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
    let seedTag: VmTag = seedIsSet ? (posTags[2] as VmTag) : VmTag.Num
    let seedNum: f64 = seedIsSet ? posNums[2] : 1234.0
    let seedAux: i32 = seedIsSet ? posAux[2] : 0

    const swingIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
    let swingTag: VmTag = swingIsSet ? (posTags[3] as VmTag) : VmTag.Num
    let swingNum: f64 = swingIsSet ? posNums[3] : 0.0
    let swingAux: i32 = swingIsSet ? posAux[3] : 0

    const offsetIsSet = posCount >= 5 && posTags[4] !== VmTag.Undef && posTags[4] !== VmTag.Null
    let offsetTag: VmTag = offsetIsSet ? (posTags[4] as VmTag) : VmTag.Num
    let offsetNum: f64 = offsetIsSet ? posNums[4] : 0.0
    let offsetAux: i32 = offsetIsSet ? posAux[4] : 0

    // Named overrides (bar/prob/seed/swing/offset)
    for (let i = 0; i < namedCount; i++) {
      const k = nameSyms[i]
      if (k === VmSym.Bar) {
        barTag = nameTags[i] as VmTag
        barNum = nameNums[i]
        barAux = nameAux[i]
      }
      else if (k === VmSym.Prob) {
        probTag = nameTags[i] as VmTag
        probNum = nameNums[i]
        probAux = nameAux[i]
      }
      else if (k === VmSym.Seed) {
        seedTag = nameTags[i] as VmTag
        seedNum = nameNums[i]
        seedAux = nameAux[i]
      }
      else if (k === VmSym.Swing) {
        swingTag = nameTags[i] as VmTag
        swingNum = nameNums[i]
        swingAux = nameAux[i]
      }
      else if (k === VmSym.Offset) {
        offsetTag = nameTags[i] as VmTag
        offsetNum = nameNums[i]
        offsetAux = nameAux[i]
      }
    }

    const bar$: usize = audio.toAudioPtr(barTag, barNum, barAux, length, program)
    const prob$: usize = audio.toAudioPtr(probTag, probNum, probAux, length, program)
    const seed$: usize = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)
    const swing$: usize = audio.toAudioPtr(swingTag, swingNum, swingAux, length, program)
    const offset$: usize = audio.toAudioPtr(offsetTag, offsetNum, offsetAux, length, program)

    const outIndex: i32 = audio.allocOut(program)
    const out$: usize = program.getOutBuffer(outIndex)

    const gen = program.gensPool.get(Op.Every) as Every
    gen.bar$ = bar$
    gen.prob$ = prob$
    gen.seed$ = seed$
    gen.swing$ = swing$
    gen.offset$ = offset$
    gen.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }

  @inline
  private callAt(
    posCount: i32,
    namedCount: i32,
    posTags: StaticArray<i32>,
    posNums: StaticArray<f64>,
    posAux: StaticArray<i32>,
    nameSyms: StaticArray<i32>,
    nameTags: StaticArray<i32>,
    nameNums: StaticArray<f64>,
    nameAux: StaticArray<i32>,
    stack: VmStack,
    audio: VmAudio,
    program: Program,
    length: i32,
  ): void {
    // at(bar, every=0, prob=1, seed=1234)
    if (posCount < 1) {
      stack.push(VmTag.Undef)
      return
    }

    let barTag: VmTag = posTags[0] as VmTag
    let barNum: f64 = posNums[0]
    let barAux: i32 = posAux[0]

    const everyIsSet = posCount >= 2 && posTags[1] !== VmTag.Undef && posTags[1] !== VmTag.Null
    let everyTag: VmTag = everyIsSet ? (posTags[1] as VmTag) : VmTag.Num
    let everyNum: f64 = everyIsSet ? posNums[1] : 0.0
    let everyAux: i32 = everyIsSet ? posAux[1] : 0

    const probIsSet = posCount >= 3 && posTags[2] !== VmTag.Undef && posTags[2] !== VmTag.Null
    let probTag: VmTag = probIsSet ? (posTags[2] as VmTag) : VmTag.Num
    let probNum: f64 = probIsSet ? posNums[2] : 1.0
    let probAux: i32 = probIsSet ? posAux[2] : 0

    const seedIsSet = posCount >= 4 && posTags[3] !== VmTag.Undef && posTags[3] !== VmTag.Null
    let seedTag: VmTag = seedIsSet ? (posTags[3] as VmTag) : VmTag.Num
    let seedNum: f64 = seedIsSet ? posNums[3] : 1234.0
    let seedAux: i32 = seedIsSet ? posAux[3] : 0

    // Named overrides (bar/every/prob/seed)
    for (let i = 0; i < namedCount; i++) {
      const k = nameSyms[i]
      if (k === VmSym.Bar) {
        barTag = nameTags[i] as VmTag
        barNum = nameNums[i]
        barAux = nameAux[i]
      }
      else if (k === VmBuiltin.Every || k === VmSym.AtEveryLegacy) {
        everyTag = nameTags[i] as VmTag
        everyNum = nameNums[i]
        everyAux = nameAux[i]
      }
      else if (k === VmSym.Prob) {
        probTag = nameTags[i] as VmTag
        probNum = nameNums[i]
        probAux = nameAux[i]
      }
      else if (k === VmSym.Seed) {
        seedTag = nameTags[i] as VmTag
        seedNum = nameNums[i]
        seedAux = nameAux[i]
      }
    }

    const bar$: usize = audio.toAudioPtr(barTag, barNum, barAux, length, program)
    const every$: usize = audio.toAudioPtr(everyTag, everyNum, everyAux, length, program)
    const prob$: usize = audio.toAudioPtr(probTag, probNum, probAux, length, program)
    const seed$: usize = audio.toAudioPtr(seedTag, seedNum, seedAux, length, program)

    const outIndex: i32 = audio.allocOut(program)
    const out$: usize = program.getOutBuffer(outIndex)

    const gen = program.gensPool.get(Op.At) as At
    gen.bar$ = bar$
    gen.every$ = every$
    gen.prob$ = prob$
    gen.seed$ = seed$
    gen.process(out$, length)

    stack.push(VmTag.Audio, 0.0, outIndex)
  }
}
