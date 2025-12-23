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
@inline
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

