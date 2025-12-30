// dprint-ignore-file
import { CALLBACK_SCOPE_BASE, CALLBACK_SCOPE_BUFFERS_PER_VOICE, SEQ_VOICES } from '../../constants'
import { Mini } from '../../gen/mini'
import { vmErrorCode } from '../../globals'
import { Program } from '../../program'
import { Op } from '../../shared'
import { addAudio, clearAudio } from '../audio-ops'
import { Dsp } from '../dsp'
import { VmTag } from '../types'
import { VmAudio } from '../vm-audio'
import { VmStack } from '../vm-stack'

// @ts-ignore
// @inline
function pow2(x: f32): f32 {
  return Mathf.pow(2.0, x)
}

// @ts-ignore
// @inline
function numFromTag(tag: VmTag, num: f32): f32 {
  if (tag === VmTag.Bool) return num != 0.0 ? 1.0 : 0.0
  if (tag === VmTag.Num) return num
  return 0.0
}

// @ts-ignore
// @inline
export function playMini(
  arrayIndex: i32,
  cbAux: i32,
  stack: VmStack,
  audio: VmAudio,
  program: Program,
  length: i32,
  left$: usize,
  right$: usize,
  dsp: Dsp,
  miniTrigOuts: StaticArray<i32>,
  miniVelOuts: StaticArray<i32>,
  miniValOuts: StaticArray<i32>,
  cbArgTags: StaticArray<i32>,
  cbArgNums: StaticArray<f64>,
  cbArgAux: StaticArray<i32>,
): void {
  const voiceCountOut = audio.allocOut(program)
  const trigOuts = miniTrigOuts
  const velOuts = miniVelOuts
  const valOuts = miniValOuts

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

  // Apply runtime directive globals to pitch output (works for numeric and audio-rate directives).
  const tuneTag = dsp.tuneTag as VmTag
  const tuneNum = dsp.tuneNum as f32
  const tuneAux = dsp.tuneAux
  const octaveTag = dsp.octaveTag as VmTag
  const octaveNum = dsp.octaveNum as f32
  const octaveAux = dsp.octaveAux
  const transposeTag = dsp.transposeTag as VmTag
  const transposeNum = dsp.transposeNum as f32
  const transposeAux = dsp.transposeAux

  const tuneAudio = tuneTag === VmTag.Audio || (tuneTag === VmTag.Num && tuneAux < 0)
  const octaveAudio = octaveTag === VmTag.Audio || (octaveTag === VmTag.Num && octaveAux < 0)
  const transposeAudio = transposeTag === VmTag.Audio || (transposeTag === VmTag.Num && transposeAux < 0)
  const audioNeeded = tuneAudio || octaveAudio || transposeAudio

  const tune$ = tuneAudio ? audio.toAudioPtr(tuneTag, tuneNum, tuneAux, length, program) : 0
  const octave$ = octaveAudio ? audio.toAudioPtr(octaveTag, octaveNum, octaveAux, length, program) : 0
  const transpose$ = transposeAudio ? audio.toAudioPtr(transposeTag, transposeNum, transposeAux, length, program) : 0

  const tune0: f32 = tuneAudio ? 0.0 : numFromTag(tuneTag, tuneNum)
  const octave0: f32 = octaveAudio ? 0.0 : numFromTag(octaveTag, octaveNum)
  const transpose0: f32 = transposeAudio ? 0.0 : numFromTag(transposeTag, transposeNum)

  if (!audioNeeded) {
    const semis = transpose0 + octave0 * 12.0
    const mul = tune0 * pow2(semis / 12.0)
    if (mul !== 1.0) {
      for (let v = 0; v < SEQ_VOICES; v++) {
        const val$ = program.getOutBuffer(valOuts[v])
        let p$ = val$
        for (let i = 0; i < length; i++) {
          store<f32>(p$, (load<f32>(p$) as f64 * mul) as f32)
          p$ += 4
        }
      }
    }
  }
  else {
    for (let v = 0; v < SEQ_VOICES; v++) {
      const val$ = program.getOutBuffer(valOuts[v])
      let p$ = val$
      for (let i = 0; i < length; i++) {
        const baseHz = load<f32>(p$) as f64
        const tune = tuneAudio ? (load<f32>(tune$ + (i << 2))) : tune0
        const oct = octaveAudio ? (load<f32>(octave$ + (i << 2))) : octave0
        const tr = transposeAudio ? (load<f32>(transpose$ + (i << 2))) : transpose0
        const semis: f32 = tr + oct * 12.0
        const mul = tune * pow2(semis / 12.0)
        store<f32>(p$, (baseHz * mul) as f32)
        p$ += 4
      }
    }
  }

  const mixOut = audio.allocOut(program)
  const mixOut$ = program.getOutBuffer(mixOut)
  clearAudio(mixOut$, length)

  const scopeTrigIndex = audio.allocOut(program)
  const scopeVelIndex = audio.allocOut(program)
  const scopeValIndex = audio.allocOut(program)

  const bodyBufBase = audio.outCursor

  // Prepare args arrays for callback invocation (must not alias call scratch arrays)
  const argTags = cbArgTags
  const argNums = cbArgNums
  const argAux = cbArgAux
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

    // Ensure `t` is allocated within this callback scope (so it respects buffer remapping).
    const savedTHas = audio.tHas
    const savedTOutIndex = audio.tOutIndex
    audio.tHas = 0

    dsp.vmInvokeFunc(cbAux, 3, argTags, argNums, argAux, length, left$, right$)

    if (vmErrorCode !== 0) {
      audio.tHas = savedTHas
      audio.tOutIndex = savedTOutIndex
      program.popCallbackScope()
      return
    }

    const outIdx = stack.pop()
    const outTag = stack.tag[outIdx] as VmTag
    const outNum = stack.num[outIdx]
    const outAux = stack.aux[outIdx]
    const voiceAudio$ = audio.toAudioPtr(outTag, outNum, outAux, length, program)
    addAudio(mixOut$, mixOut$, voiceAudio$, length)

    audio.tHas = savedTHas
    audio.tOutIndex = savedTOutIndex
    program.popCallbackScope()
  }

  stack.push(VmTag.Audio, 0.0, mixOut)
}

